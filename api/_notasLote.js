/**
 * Emissão de notas fiscais em lote — roda 1x/dia por cron.
 *
 * Por que lote e não no webhook: o contador liberou emissão em lote, e emitir
 * dentro do webhook da venda significaria que um erro do Bling (ou a SEFAZ fora
 * do ar) poderia derrubar o processamento da venda em si — pixel, CAPI e
 * recuperação por WhatsApp dependem daquele fluxo. Aqui, se falhar, falha
 * sozinho e tenta de novo amanhã.
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
import { emitir, payloadNfe, payloadNfse, pausa } from './_bling.js'

const NOTAS_KEY = 'notas_fiscais_v1' // config da aba Notas Fiscais do painel
const MAX_TENTATIVAS = 3
const LOTE_MAX = 120 // teto de pedidos lidos; quem manda mesmo é o orçamento de tempo

/**
 * Vercel mata a função no timeout, e cada nota leva ~3s (create → enviar →
 * confirmar, com as pausas do limite de 3 req/s do Bling). Em vez de chutar
 * quantas cabem, o lote para sozinho quando o tempo acaba — o que sobrar sai na
 * próxima rodada, porque a fila é justamente "quem ainda não tem nota".
 */
export const config = { maxDuration: 60 }
const ORCAMENTO_MS = 50_000

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
 * Dados do comprador. O nome/CPF vêm das colunas (o webhook já extrai);
 * o endereço só existe no raw — e na prática vem vazio na Kirvano, o que é
 * aceitável pra NF-e mas impede NFS-e.
 */
function clienteDoPedido(o) {
  const c = (o.raw || {}).customer || {}
  const a = c.address || {}
  return {
    nome: o.customer_name || c.name || 'Consumidor',
    documento: o.customer_doc || c.document || '',
    endereco: {
      rua: a.street || '',
      numero: a.number || '',
      bairro: a.neighborhood || '',
      municipio: a.city || '',
      uf: a.state || '',
      cep: a.zipcode || '',
    },
  }
}

export default async function handler(req, res) {
  const secret =
    req.query?.secret || req.headers['x-webhook-secret'] || (req.headers.authorization || '').replace('Bearer ', '')
  const ehCron = !!req.headers['x-vercel-cron']
  if (!ehCron && (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'não autorizado' })
  }

  const cfg = await lerConfig()
  if (!cfg.emissaoAtiva) {
    return res.status(200).json({ ok: true, pulado: 'emissão desligada na aba Notas Fiscais' })
  }
  if (!cfg.naturezaOperacaoId) {
    return res.status(200).json({ ok: false, erro: 'naturezaOperacaoId não configurado' })
  }

  // janela: ontem pra trás, respeitando o prazo de 7 dias que o contador deu pra
  // devolução — emitir antes disso evita nota emitida e cancelada no mesmo dia.
  const dias = Number(req.query?.dias) || 7
  const desde = new Date(Date.now() - dias * 864e5).toISOString()
  const seco = req.query?.seco === '1' // simula sem emitir

  const inicio = Date.now()
  const pedidos = await pedidosPendentes(desde)
  const jaEmitidas = seco ? new Map() : await notasExistentes(pedidos.map((p) => p.id))
  const resumo = { pedidos: pedidos.length, emitidas: 0, erros: 0, puladas: 0, restaram: 0, detalhes: [] }

  for (const o of pedidos) {
    // para antes do timeout — o resto sai na próxima rodada
    if (!seco && Date.now() - inicio > ORCAMENTO_MS) {
      resumo.restaram = pedidos.length - (resumo.emitidas + resumo.erros + resumo.puladas)
      break
    }

    const cliente = clienteDoPedido(o)

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

    for (const item of itens) {
      const pf = cfg.produtos?.[item.key]
      if (!pf || pf.tipo === 'nenhum') {
        resumo.puladas++
        resumo.detalhes.push({ pedido: o.checkout_id, item: item.nome, status: 'sem configuração fiscal' })
        continue
      }

      // NFS-e precisa de município/UF (bairro também); a Kirvano não coleta.
      // Registra o motivo em vez de tentar e queimar tentativa num erro certo.
      if (pf.tipo === 'nfse' && !(cliente.endereco.municipio && cliente.endereco.uf)) {
        resumo.puladas++
        if (!seco) {
          await gravarNota({
            order_id: o.id, produto_key: item.key, produto_nome: item.nome,
            tipo: 'nfse', valor: item.valor, status: 'erro',
            erro: 'NFS-e exige município, UF e bairro do cliente, que o checkout não coleta',
          })
        }
        resumo.detalhes.push({ pedido: o.checkout_id, item: item.nome, status: 'NFS-e sem endereço' })
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
            })

      // passa o id da tentativa anterior, se houver: evita criar segunda nota
      const r = await emitir(pf.tipo, payload, previa?.bling_id || null)

      await gravarNota({
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

      if (r.ok) { resumo.emitidas++; houveEmissao = true }
      else { resumo.erros++; houveErro = true }
      resumo.detalhes.push({
        pedido: o.checkout_id, item: item.nome, tipo: pf.tipo,
        status: r.ok ? `emitida ${r.numero}` : `erro: ${r.erro}`,
      })

      await pausa(700) // teto de 3 req/s do Bling, com folga
    }

    if (!seco) {
      await marcarPedido(o.id, {
        nf_status: houveErro ? 'erro' : houveEmissao ? 'emitida' : 'dispensada',
        nf_at: new Date().toISOString(),
        nf_erro: houveErro ? 'ver tabela notas_fiscais' : null,
        nf_tentativas: (o.nf_tentativas || 0) + 1,
      })
    }
  }

  return res.status(200).json({ ok: true, ...resumo, detalhes: resumo.detalhes.slice(0, 50) })
}
