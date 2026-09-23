/**
 * Emissão de notas fiscais em lote.
 *
 * NÃO é uma função serverless: o plano Hobby da Vercel limita a 12, e o projeto
 * está no teto (o 13º arquivo derrubou o deploy inteiro em 20/08/2026). Por isso
 * o prefixo `_` — é módulo, chamado de `recover.js?job=notas`, mesma carona que
 * o `_adsSnapshot.js` já usa.
 *
 * Por que lote e não no webhook: o contador liberou emissão em lote, e emitir
 * dentro do webhook da venda significaria que um erro do Bling (ou a SEFAZ fora
 * do ar) poderia derrubar o processamento da venda em si — pixel, CAPI e
 * recuperação por WhatsApp dependem daquele fluxo. Aqui, se falhar, falha
 * sozinho e tenta de novo na próxima rodada.
 *
 * Regras que vieram do contador (20/08/2026):
 *  · Arquivos prontos (STL, estampas, artes de caneca) → NF-e, NCM 4901.99.00,
 *    com o texto de imunidade de ICMS de ebook nas informações complementares.
 *  · Música personalizada (Melodify) → NFS-e, código 010901, ISS 5%.
 *  · Order bump vira NOTA SEPARADA, não item na mesma nota.
 *  · Reembolso vira nota de devolução, em no máximo 7 dias.
 *
 * Segurança: exige o mesmo WEBHOOK_SECRET dos outros endpoints, ou o header que
 * a Vercel injeta nos crons.
 */
import { emitir, payloadNfe, payloadNfse, pausa, tokenValido, bling, ambienteAtual } from './_bling.js'

const NOTAS_KEY = 'notas_fiscais_v1' // config da aba Notas Fiscais do painel
const MAX_TENTATIVAS = 3
const LOTE_MAX = 120 // teto de pedidos lidos; quem manda mesmo é o orçamento de tempo

/**
 * Vercel mata a função no timeout, e cada nota leva ~3s (create → enviar →
 * confirmar, com as pausas do limite de 3 req/s do Bling). Em vez de chutar
 * quantas cabem, o lote para sozinho quando o tempo acaba — o que sobrar sai na
 * próxima rodada, porque a fila é justamente "quem ainda não tem nota".
 *
 * 40s (e não 50) porque agora divide a função com a recuperação de WhatsApp:
 * deixa margem pra ela, já que o `?job=notas` é chamado separado mas o teto de
 * tempo da Vercel é da função inteira.
 */
const ORCAMENTO_MS = 40_000

function sb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
}

async function lerConfig() {
  const { url, headers } = sb()
  const r = await fetch(`${url}/rest/v1/app_state?key=eq.${NOTAS_KEY}&select=value`, { headers })
  const rows = await r.json().catch(() => [])
  return (Array.isArray(rows) && rows.length ? rows[0].value : null) || { produtos: {}, emissaoAtiva: false }
}

/** Pedidos aprovados que ainda não têm nota, do mais antigo pro mais novo. */
async function pedidosPendentes(desdeISO) {
  const { url, headers } = sb()
  const q = [
    'select=id,checkout_id,value,value_orig,currency,products,product,customer_name,customer_doc,ordered_at,raw,nf_tentativas',
    'status=eq.APPROVED',
    `ordered_at=gte.${desdeISO}`,
    'or=(nf_status.is.null,nf_status.eq.erro)',
    `nf_tentativas=lt.${MAX_TENTATIVAS}`,
    'order=ordered_at.asc',
    `limit=${LOTE_MAX}`,
  ].join('&')
  const r = await fetch(`${url}/rest/v1/kirvano_orders?${q}`, { headers })
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) ? rows : []
}

async function marcarPedido(id, patch) {
  const { url, headers } = sb()
  await fetch(`${url}/rest/v1/kirvano_orders?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
}

/**
 * Notas já registradas destes pedidos. Serve pra não recriar no Bling o que já
 * foi criado numa rodada anterior — ver o comentário de `emitir` em _bling.js.
 */
async function notasExistentes(orderIds) {
  if (!orderIds.length) return new Map()
  const { url, headers } = sb()
  const lista = orderIds.map((i) => `"${i}"`).join(',')
  const r = await fetch(
    `${url}/rest/v1/notas_fiscais?order_id=in.(${lista})&select=order_id,produto_key,bling_id,status`,
    { headers },
  )
  const rows = await r.json().catch(() => [])
  const m = new Map()
  if (Array.isArray(rows)) rows.forEach((n) => m.set(`${n.order_id}|${n.produto_key}`, n))
  return m
}

async function gravarNota(row) {
  const { url, headers } = sb()
  const r = await fetch(`${url}/rest/v1/notas_fiscais?on_conflict=order_id,produto_key`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ ...row, atualizada_em: new Date().toISOString() }]),
  })
  return r.ok
}

/** Igual, mas ESTOURA se não gravar — quem chama não pode seguir no escuro. */
async function gravarNotaOuFalhar(row) {
  const ok = await gravarNota(row)
  if (!ok) throw new Error('Supabase recusou a gravação da nota')
}

/* ── trava de rodada ──────────────────────────────────────────────────────────
 * Duas rodadas ao mesmo tempo (o cron e alguém apertando o botão, ou dois
 * cliques) leem a MESMA fila de pendentes e emitem as mesmas notas: dois
 * documentos fiscais pra uma venda só. Não existe nada no caminho que impeça
 * isso — o estado só muda no fim do processamento de cada pedido.
 *
 * A trava é uma linha em app_state com validade. Vence sozinha porque o
 * processo pode morrer sem soltar (timeout da Vercel não roda `finally`), e
 * uma trava eterna seria pior que trava nenhuma: ninguém emite mais nada e
 * ninguém entende por quê. */
const LOCK_KEY = 'notas_lote_lock'
const LOCK_MS = 3 * 60 * 1000

/**
 * Pega a trava de forma ATÔMICA.
 *
 * A primeira versão lia a linha e depois escrevia. Entre a leitura e a escrita
 * cabe a outra rodada inteira: as duas leem "livre", as duas escrevem, as duas
 * seguem — e a trava não trava nada justamente no caso pra que ela existe. Num
 * teste com duas chamadas simultâneas o comportamento já saiu inconsistente.
 *
 * Aqui é um compare-and-set: o UPDATE só casa se a trava estiver livre OU
 * vencida, e o banco resolve o empate. `return=representation` devolve as
 * linhas afetadas — zero linhas significa que a outra rodada chegou primeiro.
 * Uma condição no WHERE do Postgres não tem janela; duas viagens em JS têm.
 */
async function pegarTrava() {
  const { url, headers } = sb()
  const agora = new Date().toISOString()
  const vencidaAntesDe = new Date(Date.now() - LOCK_MS).toISOString()

  // garante que a linha existe, sem pisar numa trava viva
  await fetch(`${url}/rest/v1/app_state`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ key: LOCK_KEY, value: { em: null }, updated_at: agora }),
  }).catch(() => {})

  const q = `key=eq.${LOCK_KEY}&or=(value->>em.is.null,value->>em.lt.${vencidaAntesDe})`
  const r = await fetch(`${url}/rest/v1/app_state?${q}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ value: { em: agora }, updated_at: agora }),
  })
  const linhas = await r.json().catch(() => [])
  if (!r.ok) return { ok: false, desde: 'erro ao tentar travar: ' + JSON.stringify(linhas).slice(0, 120) }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    // não casou: a trava está viva com outra rodada
    const atual = await fetch(`${url}/rest/v1/app_state?key=eq.${LOCK_KEY}&select=value`, { headers })
    const rows = await atual.json().catch(() => [])
    return { ok: false, desde: rows?.[0]?.value?.em || 'agora' }
  }
  return { ok: true }
}

async function soltarTrava() {
  const { url, headers } = sb()
  await fetch(`${url}/rest/v1/app_state`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: LOCK_KEY, value: { em: null }, updated_at: new Date().toISOString() }),
  }).catch(() => {})
}

/** Chave do produto no mesmo formato que a aba Taxas/Notas usa. */
const chaveProduto = (p, fallbackNome) =>
  p?.id != null ? String(p.id) : 'n:' + String(p?.name || fallbackNome || '').trim().toLowerCase()

/**
 * `products[].price` NÃO é número: a Kirvano manda a string formatada
 * ("R$ 64,90"). `Number()` nela devolve NaN, e o pedido inteiro sairia com
 * valor zero na nota fiscal. Mesmo parser usado em taxas.ts.
 */
function precoNum(v) {
  if (typeof v === 'number') return v
  if (v == null) return 0
  let s = String(v).replace(/[^\d.,]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/**
 * Itens que viram nota. Order bump é nota separada (regra do contador), então
 * cada item do pedido é uma nota — inclusive o principal.
 *
 * ⚠ O preço do item vem na MOEDA DO COMPRADOR, nunca convertido — só o `value`
 * do pedido chega em BRL. Pra venda em moeda estrangeira, escala o item pela
 * mesma proporção que o total convertido representa do total original (mesmo
 * ajuste de dashboard/realbuild.ts e taxas.ts). Nota fiscal em real tem que
 * sair em real.
 */
function itensDoPedido(o) {
  const moeda = String(o.currency || 'BRL').toUpperCase()
  const escala =
    moeda !== 'BRL' && o.value_orig > 0 && o.value ? Number(o.value) / Number(o.value_orig) : 1

  if (Array.isArray(o.products) && o.products.length) {
    const itens = o.products.map((p) => ({
      key: chaveProduto(p, o.product),
      nome: p?.name || o.product || 'Produto',
      valor: Number((precoNum(p?.price) * escala).toFixed(2)),
      bump: !!p?.is_order_bump,
    }))
    // Se nenhum item trouxe preço utilizável, cai pro valor do pedido no item
    // principal — melhor uma nota certa no total do que várias zeradas.
    const soma = itens.reduce((s, i) => s + i.valor, 0)
    if (soma <= 0 && Number(o.value) > 0) {
      const principal = itens.find((i) => !i.bump) || itens[0]
      return { itens: [{ ...principal, valor: Number(o.value) }], divergencia: null }
    }

    // A soma dos itens tem que fechar com o que o cliente pagou. Já vimos pedido
    // de R$47,90 cujos `products` somavam R$102,70 (bumps listados mas não
    // cobrados) — emitir ali seria cobrar do cliente mais do que ele pagou, num
    // documento fiscal. Na dúvida a gente NÃO emite: marca pra conferência.
    const total = Number(o.value) || 0
    if (total > 0 && Math.abs(soma - total) > Math.max(0.05, total * 0.01)) {
      return {
        itens: [],
        divergencia: `itens somam R$${soma.toFixed(2)} mas o pedido foi R$${total.toFixed(2)}`,
      }
    }
    return { itens: itens.filter((i) => i.valor > 0), divergencia: null }
  }
  return {
    itens: [{ key: chaveProduto(null, o.product), nome: o.product || 'Produto', valor: Number(o.value) || 0, bump: false }],
    divergencia: null,
  }
}

/**
 * Dados do comprador. O nome/CPF vêm das colunas (o webhook já extrai); o
 * endereço só existe no raw — e vem SEMPRE vazio na Kirvano (0 de 1.487 pedidos
 * de agosto/2026 tinham rua, cidade ou CEP), porque checkout de infoproduto não
 * pede endereço.
 *
 * A NF-e não se importa: a SEFAZ autoriza produto digital só com nome e CPF.
 * A NFS-e exige município, UF e bairro — e é aí que entra o `enderecoPadrao`.
 * O contador autorizou usar o endereço do próprio CNPJ nesses casos, e
 * confirmou que o ISS é devido em Balneário Camboriú independente de onde o
 * cliente mora. Ou seja, o padrão não distorce o imposto: é o endereço de quem
 * recolhe.
 */
function clienteDoPedido(o, enderecoPadrao) {
  const c = (o.raw || {}).customer || {}
  const a = c.address || {}
  const p = enderecoPadrao || {}
  return {
    nome: o.customer_name || c.name || 'Consumidor',
    documento: o.customer_doc || c.document || '',
    endereco: {
      rua: a.street || p.rua || '',
      numero: a.number || p.numero || 'S/N',
      bairro: a.neighborhood || p.bairro || '',
      municipio: a.city || p.municipio || '',
      uf: a.state || p.uf || '',
      cep: a.zipcode || p.cep || '',
    },
    /** true = o endereço veio do padrão, não do comprador (fica registrado) */
    enderecoPadrao: !(a.city && a.state),
  }
}

/**
 * Diagnóstico só-leitura da conexão com o Bling. Não cria nada.
 *
 * Existe porque o refresh_token do Bling é de USO ÚNICO e o access_token dura
 * 6h: se ninguém emitiu nada por semanas, a autorização pode ter morrido sem
 * aviso, e o primeiro sinal disso seria uma nota falhando. Melhor descobrir
 * antes de ligar a emissão do que no meio do lote.
 *
 * Também devolve os dados da empresa cadastrada no Bling — é por eles que se
 * confere se a Inscrição Estadual entrou, sem precisar abrir o painel.
 */
export async function diagnosticoBling() {
  const out = { token: null, empresa: null, erros: [] }
  try {
    const t = await tokenValido()
    out.token = { ok: true, prefixo: String(t).slice(0, 12) + '…' }
  } catch (e) {
    out.token = { ok: false, erro: String(e?.message || e).slice(0, 300) }
    return out // sem token não adianta tentar o resto
  }
  // A v3 não documenta bem o endpoint da própria empresa; tenta os candidatos
  // e devolve o primeiro que responder, junto do que falhou.
  // `bling()` NÃO devolve um Response: ele já lê o corpo e entrega
  // { ok, status, data }. Chamar .json() nele quebra com "r.json is not a
  // function" — erro que some no catch e vira "endpoint não existe".
  for (const p of ['/empresas/me/dados-basicos', '/empresas/me', '/empresas']) {
    try {
      const r = await bling(p)
      if (r.ok && r.data) { out.empresa = { endpoint: p, dados: r.data.data ?? r.data }; break }
      out.erros.push(p + ' → HTTP ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 160))
    } catch (e) {
      out.erros.push(p + ' → ' + String(e?.message || e).slice(0, 120))
    }
    await pausa(400)
  }

  /* Em QUE AMBIENTE a conta emite.
   *
   * O seletor homologação/produção do nosso painel é decorativo: nenhuma linha
   * do código de emissão lê `cfg.ambiente` — quem decide é o cadastro do Bling.
   * E o cadastro não expõe isso por API. O jeito de descobrir sem emitir é
   * olhar uma nota que já existe: no XML da NF-e, a tag `tpAmb` vale 1 para
   * produção e 2 para homologação. As três notas rejeitadas de agosto servem.
   *
   * Vale ouro antes do primeiro disparo: se for produção, a "nota de teste" é
   * um documento fiscal de verdade, com CPF de cliente real. */
  try {
    await pausa(400)
    const r = await bling('/nfe?limite=5')
    const lista = Array.isArray(r.data?.data) ? r.data.data : []
    out.notas = lista.map((n) => ({
      id: n.id, numero: n.numero, situacao: n.situacao,
      data: n.dataEmissao || n.data, chave: n.chaveAcesso ? String(n.chaveAcesso).slice(0, 8) + '…' : null,
    }))
    if (lista[0]?.id) {
      await pausa(400)
      const d = await bling('/nfe/' + lista[0].id)
      const nota = (d.data && d.data.data) || {}

      /* NÃO use este nome pra deduzir o ambiente — eu usei e errei.
         O raciocínio parecia sólido: em homologação a SEFAZ exige que o
         destinatário se chame "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM
         VALOR FISCAL", então nome de cliente real significaria produção. A
         nota 000003 tem "Diogo Santos de oliveira" E tpAmb=2. A exigência vale
         pra nota ACEITA; esta foi rejeitada antes (IE do emitente inválida) e
         nunca chegou nessa validação. Fica só como informação. */
      out.destinatario = (nota.contato || {}).nome || null

      /* Prova definitiva: `xml` é uma URL, e o tpAmb mora LÁ DENTRO — no JSON
         da nota ele não existe. 1 = produção, 2 = homologação. */
      if (nota.xml) {
        try {
          const txt = await (await fetch(nota.xml)).text()
          const t = txt.match(/<tpAmb>(\d)<\/tpAmb>/)
          out.ambiente = !t
            ? 'xml baixado mas sem a tag tpAmb'
            : t[1] === '2'
              ? 'HOMOLOGACAO (tpAmb=2) — nota de teste, sem valor fiscal'
              : 'PRODUCAO (tpAmb=1) — a nota vale como documento fiscal'
        } catch (e) {
          out.erros.push('xml → ' + String(e && e.message).slice(0, 120))
        }
      } else {
        out.ambiente = 'a nota ' + lista[0].id + ' não tem link de xml'
      }
    }
  } catch (e) {
    out.erros.push('ambiente → ' + String(e?.message || e).slice(0, 160))
  }

  return out
}

/**
 * Roda o lote. Autenticação fica com quem chama (recover.js já exige o
 * WEBHOOK_SECRET ou header de cron antes de chegar aqui).
 */
export async function rodarLoteNotas({ dias: diasParam, seco = false, max = 0 } = {}) {
  const cfg = await lerConfig()
  /* A simulação atravessa a chave desligada de propósito: é exatamente com a
     emissão OFF que se quer ver o que sairia. Antes o modo seco parava aqui e
     só respondia 'emissão desligada', então não dava pra conferir nada antes
     de ligar — que é a ordem errada pra documento fiscal. Emitir de verdade
     continua trancado. */
  if (!cfg.emissaoAtiva && !seco) {
    return { ok: true, pulado: 'emissão desligada na aba Notas Fiscais' }
  }
  if (!cfg.naturezaOperacaoId) {
    return { ok: false, erro: 'naturezaOperacaoId não configurado' }
  }

  /* Janela de 30 dias, não 7.
   *
   * Com 7, qualquer parada maior que uma semana apagava vendas em silêncio:
   * elas saíam da janela e NUNCA mais seriam faturadas, sem erro e sem
   * alerta. Não é hipótese — o token do Bling ficou morto um mês.
   *
   * O argumento original (o prazo de devolução) justifica ESPERAR pra emitir,
   * não DESISTIR de emitir. E o que tornava o atraso problemático era a nota
   * sair com a data de hoje; agora ela sai com a data da venda, então emitir
   * tarde não distorce mais o documento. */
  const dias = Number(diasParam) || 30
  const desde = new Date(Date.now() - dias * 864e5).toISOString()

  /* TRAVA PRIMEIRO — antes de qualquer conversa com o Bling.
   *
   * Uma rodada por vez, senão o cron e um clique no botão leem a mesma fila e
   * emitem as mesmas notas. Mas a ORDEM também importa: apurar o ambiente
   * custa 2 requisições e o Bling só aceita 3 por segundo. Com a trava depois,
   * toda rodada simultânea ia ao Bling e estourava o limite — foi assim que
   * três rodadas relataram "a conta não tem nenhuma nota" tendo 22 notas.
   * Travando antes, só uma rodada fala com o Bling. */
  if (!seco) {
    const t = await pegarTrava()
    if (!t.ok) return { ok: true, pulado: `outra rodada em andamento desde ${t.desde}` }
  }

  /* AMBIENTE apurado UMA vez, antes de emitir qualquer coisa. Antes eu só
     descobria pelo tpAmb da resposta — ou seja, depois de a nota já existir.
     Tarde demais: pra decidir se a rodada escreve no banco, é preciso saber
     ANTES. Sem essa informação a rodada não anda; em documento fiscal,
     adivinhar o ambiente é inaceitável nos dois sentidos (não gravar nota
     real perde a venda, gravar nota de teste consome a venda). */
  let ambiente = null
  if (!seco) {
    try {
      ambiente = await ambienteAtual()
    } catch (e) {
      await soltarTrava() // não segura a fila por causa de uma falha de leitura
      return { ok: false, erro: `não consegui apurar o ambiente no Bling: ${String(e?.message || e).slice(0, 200)}` }
    }
    if (ambiente == null) {
      await soltarTrava()
      return {
        ok: false,
        erro: 'a conta do Bling não tem nenhuma nota ainda, então não há de onde ler o tpAmb. Emita uma pelo painel do Bling e rode de novo.',
      }
    }
  }
  const homologacaoGlobal = ambiente === '2'

  const inicio = Date.now()
  const pedidos = await pedidosPendentes(desde)
  const jaEmitidas = seco ? new Map() : await notasExistentes(pedidos.map((p) => p.id))
  const resumo = { pedidos: pedidos.length, emitidas: 0, erros: 0, puladas: 0, restaram: 0, detalhes: [] }
  /** motivo pra abortar a rodada inteira; null = seguiu normal */
  let interrompido = null

  try {
  for (const o of pedidos) {
    /* O limite do rollout tem que cortar AQUI, no laço dos pedidos, e não só
       no dos itens. Cortando só lá dentro, o pedido seguinte ainda entrava,
       não emitia nada e caía no `marcarPedido` do fim como `dispensada` — ou
       seja, o limite de teste apagaria da fila, em silêncio, todo pedido que
       sobrou. Dispensada é definitivo: não volta em rodada nenhuma. */
    if (max && resumo.emitidas + resumo.erros >= max) {
      resumo.restaram = pedidos.length - (resumo.emitidas + resumo.erros + resumo.puladas)
      break
    }
    // para antes do timeout — o resto sai na próxima rodada
    if (!seco && Date.now() - inicio > ORCAMENTO_MS) {
      resumo.restaram = pedidos.length - (resumo.emitidas + resumo.erros + resumo.puladas)
      break
    }

    const cliente = clienteDoPedido(o, cfg.enderecoPadrao)

    // Venda para o exterior ainda não tem tratamento fiscal definido (o contador
    // disse que muda a tributação e não tem ISS). Na prática elas se identificam
    // sozinhas: em 20/08/2026, os 14 pedidos sem CPF dos últimos 7 dias eram
    // TODOS Hotmart em moeda estrangeira — não existe venda brasileira sem CPF.
    // Marca como dispensada pra não ficar tentando emitir e acumulando erro.
    const moedaPedido = String(o.currency || 'BRL').toUpperCase()
    if (moedaPedido !== 'BRL' || !cliente.documento) {
      resumo.puladas++
      resumo.detalhes.push({
        pedido: o.checkout_id,
        status: moedaPedido !== 'BRL' ? `exterior (${moedaPedido}) — fora do escopo` : 'sem CPF',
      })
      if (!seco) {
        await marcarPedido(o.id, {
          nf_status: 'dispensada',
          nf_at: new Date().toISOString(),
          nf_erro: moedaPedido !== 'BRL' ? `venda em ${moedaPedido} — exportação sem regra definida` : 'sem CPF do comprador',
        })
      }
      continue
    }

    const { itens, divergencia } = itensDoPedido(o)

    // valor dos itens não fecha com o pedido → não emite, manda pra conferência
    if (divergencia) {
      resumo.puladas++
      resumo.detalhes.push({ pedido: o.checkout_id, status: `conferir: ${divergencia}` })
      if (!seco) {
        await marcarPedido(o.id, {
          nf_status: 'erro',
          nf_at: new Date().toISOString(),
          nf_erro: `valores divergentes — ${divergencia}`,
          nf_tentativas: MAX_TENTATIVAS, // trava: só sai daqui com correção manual
        })
      }
      continue
    }

    let houveErro = false
    let houveEmissao = false
    /** alguma nota deste pedido voltou com tpAmb=2 → rodada de teste, não escritura */
    let homologacao = false

    for (const item of itens) {
      const pf = cfg.produtos?.[item.key]
      if (!pf || pf.tipo === 'nenhum') {
        resumo.puladas++
        resumo.detalhes.push({ pedido: o.checkout_id, item: item.nome, status: 'sem configuração fiscal' })
        continue
      }

      // NFS-e exige município, UF e bairro. Como o comprador nunca informa, o
      // `enderecoPadrao` cobre — mas se ele não estiver configurado, a nota vai
      // falhar na API. Melhor avisar do que queimar tentativa.
      const e = cliente.endereco
      if (pf.tipo === 'nfse' && !(e.municipio && e.uf && e.bairro)) {
        resumo.puladas++
        if (!seco) {
          await gravarNota({
            order_id: o.id, produto_key: item.key, produto_nome: item.nome,
            tipo: 'nfse', valor: item.valor, status: 'erro',
            erro: 'endereço padrão da NFS-e incompleto — preencha município, UF e bairro na aba Notas Fiscais',
          })
        }
        resumo.detalhes.push({ pedido: o.checkout_id, item: item.nome, status: 'endereço padrão faltando' })
        continue
      }

      if (seco) {
        resumo.detalhes.push({ pedido: o.checkout_id, item: item.nome, tipo: pf.tipo, valor: item.valor, status: 'simulado' })
        continue
      }

      // já emitida numa rodada anterior? não mexe.
      const previa = jaEmitidas.get(`${o.id}|${item.key}`)
      if (previa?.status === 'emitida') {
        resumo.detalhes.push({ pedido: o.checkout_id, item: item.nome, status: 'já emitida' })
        continue
      }

      const payload =
        pf.tipo === 'nfse'
          ? payloadNfse({ cliente, servico: { descricao: pf.descricao || item.nome, valor: item.valor, codigo: pf.codigoServico } })
          : payloadNfe({
              cliente,
              item: { codigo: item.key.slice(0, 30), descricao: pf.descricao || item.nome, valor: item.valor, ncm: pf.ncm || cfg.ncmPadrao },
              naturezaOperacaoId: cfg.naturezaOperacaoId,
              textoImunidade: cfg.textoImunidade,
              dataVenda: o.ordered_at,
            })

      /* `max` existe pro rollout controlado: mandar UMA nota, conferir no
         painel do Bling, e só então soltar o lote inteiro.
         Contava `emitidas` — ou seja, só os SUCESSOS. Com a configuração
         errada nada é sucesso, o contador nunca sobe e o limite nunca fecha:
         pedi max=1 e ele tentou 8 notas, todas rejeitadas pelo mesmo motivo,
         até o tempo acabar. Justamente o contrário do que um limite serve.
         Agora conta TENTATIVA: uma ida à SEFAZ é uma ida, dê no que der. */
      if (max && resumo.emitidas + resumo.erros >= max) {
        resumo.detalhes.push({ pedido: o.checkout_id, item: item.nome, status: `parou no limite de ${max}` })
        break
      }

      /* REGISTRO ANTECIPADO (só em produção — homologação não escreve nada).
         Grava a linha com o id do rascunho ANTES de a nota ir pra SEFAZ. É a
         última janela em que dá pra anotar sem que exista documento fiscal.
         Se a gravação falhar, `emitir` aborta sem enviar: rascunho órfão no
         Bling é inofensivo, nota autorizada e não registrada não é. */
      const aoCriar = homologacaoGlobal
        ? null
        : async (blingId, base) => {
            await gravarNotaOuFalhar({
              order_id: o.id,
              produto_key: item.key,
              produto_nome: item.nome,
              tipo: pf.tipo,
              valor: item.valor,
              bling_id: blingId,
              numero: base.numero || null,
              serie: base.serie || null,
              status: 'enviando',
            })
          }

      // passa o id da tentativa anterior, se houver: `emitir` consulta a
      // situação antes de reenviar e reconhece nota já autorizada
      const r = await emitir(pf.tipo, payload, previa?.bling_id || null, aoCriar)

      /* Conferência cruzada. A rodada apurou o ambiente no começo; se a SEFAZ
         responder um tpAmb diferente, alguém virou a chave no Bling no meio da
         execução. Parar é a única saída segura: seguir gravando decidiria
         errado sobre documento fiscal. */
      if (r.tpAmb && (r.tpAmb === '2') !== homologacaoGlobal) {
        interrompido = `ambiente mudou no meio da rodada (apurei ${ambiente}, a SEFAZ respondeu ${r.tpAmb})`
        break
      }

      /* ── HOMOLOGAÇÃO NÃO ESCREVE NO BANCO ─────────────────────────────────
       * Nota de homologação não vale nada fiscalmente, mas gravá-la CONSOME o
       * pedido de duas formas, as duas silenciosas e as duas definitivas:
       *
       *   sucesso → `nf_status='emitida'`, e a fila só busca null ou 'erro'.
       *             O pedido some. Quando a conta virar pra produção, essa
       *             venda nunca mais recebe nota de verdade.
       *   erro    → gasta uma das 3 tentativas. Três testes de homologação e
       *             o pedido bate o teto e fica preso, também sem nunca ser
       *             faturado em produção.
       *
       * Ou seja: testar aqui destruiria em silêncio a chance de faturar venda
       * real. Por isso, em homologação, a rodada é só teatro — emite, mostra
       * o resultado e não persiste nada. A escrituração começa quando as
       * notas passam a ser reais.
       *
       * A escolha NÃO é o seletor do painel (que ninguém lê) nem uma flag de
       * chamada: é o `tpAmb` do protocolo que a própria SEFAZ devolveu nesta
       * emissão. Não dá pra estar em produção e o número dizer 2.
       *
       * `tpAmb` nulo (NFS-e, que é municipal e não usa essa tag) cai no
       * comportamento de sempre — grava. */
      if (homologacaoGlobal) {
        homologacao = true
        if (r.ok) resumo.emitidas++
        else resumo.erros++
        resumo.detalhes.push({
          pedido: o.checkout_id, item: item.nome, tipo: pf.tipo,
          status: (r.ok ? `homologação ok (nota ${r.numero})` : `homologação: ${r.erro}`) + ' · nada gravado',
        })
        await pausa(700)
        continue
      }

      /* Gravação do veredito. Se ELA falhar, a rodada para.
         O registro antecipado já garante que a linha existe com o bling_id,
         então dá pra reconciliar depois — mas só se o PEDIDO continuar na
         fila. Seguindo em frente, o `marcarPedido` do fim do laço o marcaria
         como 'emitida', ele sairia da fila, e a linha presa em 'enviando'
         nunca mais seria revisitada: nota autorizada, registro pela metade,
         ninguém avisado. Parar aqui mantém o pedido pendente pra próxima. */
      try {
        await gravarNotaOuFalhar({
          order_id: o.id,
          produto_key: item.key,
          produto_nome: item.nome,
          tipo: pf.tipo,
          valor: item.valor,
          bling_id: r.blingId || null,
          numero: r.numero || null,
          serie: r.serie || null,
          chave_acesso: r.chaveAcesso || null,
          situacao: r.situacao ?? null,
          link_danfe: r.linkDanfe || null,
          status: r.ok ? 'emitida' : 'erro',
          erro: r.ok ? null : `[${r.etapa}] ${r.erro}`,
          emitida_em: r.ok ? new Date().toISOString() : null,
        })
      } catch (e) {
        interrompido = `nota ${r.numero || r.blingId} saiu no Bling mas não gravou no banco (${String(e?.message || e).slice(0, 120)}). Rodada parada; o pedido segue pendente e a próxima rodada reconcilia.`
        break
      }

      if (r.ok) { resumo.emitidas++; houveEmissao = true }
      else { resumo.erros++; houveErro = true }
      resumo.detalhes.push({
        pedido: o.checkout_id, item: item.nome, tipo: pf.tipo,
        status: r.ok ? `emitida ${r.numero}` : `erro: ${r.erro}`,
      })

      await pausa(700) // teto de 3 req/s do Bling, com folga
    }

    /* Homologação não marca o pedido. Sem esta guarda o `continue` acima
       chegaria aqui com os dois flags em false e gravaria `dispensada` — que é
       definitivo e some da fila pra sempre. Seria trocar um jeito de perder a
       venda por outro. */
    if (!seco && !homologacao && !interrompido) {
      await marcarPedido(o.id, {
        nf_status: houveErro ? 'erro' : houveEmissao ? 'emitida' : 'dispensada',
        nf_at: new Date().toISOString(),
        nf_erro: houveErro ? 'ver tabela notas_fiscais' : null,
        nf_tentativas: (o.nf_tentativas || 0) + 1,
      })
    }

    // aborto vindo do laco dos itens precisa sair do laco dos pedidos tambem
    if (interrompido) break
  }
  } finally {
    // a trava tem validade propria, mas soltar cedo libera a proxima rodada
    if (!seco) await soltarTrava()
  }

  return {
    ok: !interrompido,
    ambiente: seco ? 'simulação' : homologacaoGlobal ? 'homologação (nada gravado)' : 'produção',
    ...(interrompido ? { erro: interrompido } : {}),
    ...resumo,
    detalhes: resumo.detalhes.slice(0, 50),
  }
}
