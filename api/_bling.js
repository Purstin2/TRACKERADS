/**
 * Cliente da API v3 do Bling — emissão de nota fiscal.
 *
 * Tudo aqui foi validado contra a API real (ambiente de homologação), não contra
 * a documentação. Três coisas que só aparecem testando:
 *
 * 1. O host é api.bling.com.br. Chamar www.bling.com.br devolve 403 dizendo que
 *    "tokens JWT só são permitidos quando a requisição passa pelo host api".
 * 2. Criar a nota NÃO emite. `POST /nfe` devolve 201 com a nota em rascunho
 *    (situacao 1, sem chave de acesso); quem transmite pra SEFAZ é o
 *    `POST /nfe/{id}/enviar`. Isso é bom: dá pra criar, conferir e só então enviar.
 * 3. NF-e de produto digital NÃO precisa de endereço — só nome e CPF. A SEFAZ
 *    autorizou assim em homologação. Já a NFS-e EXIGE cidade, bairro e UF,
 *    porque o ISS é municipal e a prefeitura precisa saber onde foi consumido.
 *
 * Limite da API: 3 requisições por segundo (confirmado — devolve
 * TOO_MANY_REQUESTS com "limit":3,"period":"second").
 */

const BASE = 'https://api.bling.com.br/Api/v3'
const OAUTH_KEY = 'bling_oauth' // app_state: { access_token, refresh_token, expires_at }

/** Espaça as chamadas pra não estourar o limite de 3/s do Bling. */
export const pausa = (ms = 400) => new Promise((r) => setTimeout(r, ms))

function sb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes')
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
}

async function lerOauth() {
  const { url, headers } = sb()
  const r = await fetch(`${url}/rest/v1/app_state?key=eq.${OAUTH_KEY}&select=value`, { headers })
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) && rows.length ? rows[0].value : null
}

async function gravarOauth(v) {
  const { url, headers } = sb()
  await fetch(`${url}/rest/v1/app_state`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: OAUTH_KEY, value: v, updated_at: new Date().toISOString() }),
  })
}

/**
 * Token válido, renovando quando falta pouco.
 * O access_token do Bling dura 6h; o refresh_token é de uso único — cada refresh
 * devolve um novo par, e o antigo morre. Por isso grava SEMPRE os dois de volta:
 * perder o refresh novo significa refazer a autorização no navegador na mão.
 */
export async function tokenValido() {
  const o = await lerOauth()
  if (!o?.access_token) throw new Error('Bling não autorizado — refaça o OAuth')

  const margem = 5 * 60 * 1000 // renova 5min antes de expirar
  if (o.expires_at && Date.now() < new Date(o.expires_at).getTime() - margem) {
    return o.access_token
  }
  if (!o.refresh_token) throw new Error('Token do Bling expirado e sem refresh_token')

  const basic = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64')
  const r = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: o.refresh_token }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) {
    throw new Error(`Falha ao renovar token do Bling: ${r.status} ${JSON.stringify(j).slice(0, 200)}`)
  }
  await gravarOauth({
    access_token: j.access_token,
    refresh_token: j.refresh_token || o.refresh_token,
    expires_at: new Date(Date.now() + (j.expires_in || 21600) * 1000).toISOString(),
  })
  return j.access_token
}

export async function bling(path, opts = {}) {
  const token = opts.token || (await tokenValido())
  const r = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  })
  const txt = await r.text()
  let data
  try { data = JSON.parse(txt) } catch { data = { raw: txt.slice(0, 500) } }
  return { ok: r.ok, status: r.status, data }
}

/** Junta as mensagens de erro do Bling numa linha só, pra caber no log. */
export function erroDoBling(res) {
  const e = res?.data?.error
  if (!e) return `HTTP ${res?.status}`
  const campos = (e.fields || []).map((f) => `${f.element || 'geral'}: ${f.msg || f.message}`).join(' | ')
  return [e.message, campos || e.description].filter(Boolean).join(' — ').slice(0, 400)
}

/* ── montagem dos payloads ──────────────────────────────────────────────────── */

const soDigitos = (v) => String(v || '').replace(/\D/g, '')

/**
 * NF-e (produto). Endereço é opcional aqui — a SEFAZ autoriza produto digital
 * só com nome e CPF, o que importa porque o checkout da Kirvano não coleta
 * endereço em NENHUMA venda (0 de 1.487 em agosto/2026).
 */
/** ISO → 'YYYY-MM-DD HH:mm:ss', que é o formato que o Bling aceita. */
const dataBling = (iso) => {
  const d = iso ? new Date(iso) : new Date()
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 19).replace('T', ' ')
}

export function payloadNfe({ cliente, item, naturezaOperacaoId, textoImunidade, dataVenda }) {
  const end = cliente.endereco || {}
  const temEndereco = !!(end.municipio && end.uf)
  return {
    tipo: 1, // saída
    /* DUAS datas, e a distinção é o que eu tinha errado antes.
     *
     * `data`         → data de EMISSÃO (dhEmi no XML)
     * `dataOperacao` → data de SAÍDA   (dhSaiEnt no XML)
     *
     * Na primeira tentativa mandei só `dataOperacao` com a data da venda e o
     * XML voltou com tudo datado de hoje. Concluí que NF-e não retroage —
     * conclusão apressada. A saída não pode ser ANTERIOR à emissão (rejeição
     * 505); como a emissão ficou em hoje por omissão, a saída foi puxada
     * junto. O problema era eu não estar mandando a emissão.
     *
     * MEDIDO NAS DUAS VERSÕES, e o resultado é o mesmo: o Bling ignora as
     * duas datas e carimba o instante da transmissão.
     *   · só `dataOperacao` = 24/08 → XML voltou 23/09 nos dois campos
     *   · `data` + `dataOperacao` = 20/09 → XML voltou 23/09 nos dois campos
     *
     * Não é limite da SEFAZ (ela aceita emissão no passado dentro de uma
     * tolerância — rejeição 228, na casa de 30 dias, variando por UF): é o
     * Bling que não repassa. Se existir jeito, é chave no painel dele, não
     * campo da API; o candidato é "Configurações de preenchimento" dentro das
     * configurações de NF-e.
     *
     * Os campos ficam: não custam nada e passam a valer se algum dia forem
     * honrados. Mas o código NÃO DEVE CONTAR com eles. Consequência prática:
     * atraso não se conserta depois, então o que protege é o lote rodar todo
     * dia — a janela de 30 dias é rede, não plano. */
    data: dataBling(dataVenda),
    dataOperacao: dataBling(dataVenda),
    naturezaOperacao: { id: naturezaOperacaoId },
    contato: {
      nome: cliente.nome,
      numeroDocumento: soDigitos(cliente.documento),
      tipoPessoa: soDigitos(cliente.documento).length > 11 ? 'J' : 'F',
      ...(temEndereco
        ? {
            endereco: {
              endereco: end.rua || '',
              numero: end.numero || 'S/N',
              bairro: end.bairro || '',
              municipio: end.municipio,
              uf: end.uf,
              cep: soDigitos(end.cep),
            },
          }
        : {}),
    },
    itens: [
      {
        codigo: item.codigo,
        descricao: item.descricao,
        unidade: 'UN',
        quantidade: 1,
        valor: item.valor,
        tipo: 'P',
        classificacaoFiscal: soDigitos(item.ncm), // NCM 4901.99.00 → "49019900"
        origem: 0, // nacional
      },
    ],
    // A imunidade de ICMS de ebook (art. 150, III, "d" da CF/88) precisa estar
    // ESCRITA na nota — não é um campo, é texto obrigatório nas informações
    // complementares. Sem isso a nota sai, mas sem o respaldo da imunidade.
    ...(textoImunidade ? { observacoes: textoImunidade, informacoesAdicionais: textoImunidade } : {}),
  }
}

/**
 * NFS-e (serviço). Diferente da NF-e, aqui cidade/bairro/UF são OBRIGATÓRIOS —
 * a API recusa sem eles, porque o ISS é municipal.
 */
export function payloadNfse({ cliente, servico }) {
  const end = cliente.endereco || {}
  return {
    contato: {
      nome: cliente.nome,
      numeroDocumento: soDigitos(cliente.documento),
      endereco: {
        endereco: end.rua || '',
        numero: end.numero || 'S/N',
        bairro: end.bairro || '',
        municipio: end.municipio || '',
        uf: (end.uf || '').slice(0, 2).toUpperCase(),
        cep: soDigitos(end.cep),
      },
    },
    servicos: [{
      descricao: servico.descricao,
      valor: servico.valor,
      codigo: servico.codigo,
      /* Indicador de operacao. O padrao do Bling era INTERNET e a prefeitura
       * passou a recusar: "Indicador de operacao INTERN, invalido para o
       * servico informado. Indicadores validos: 100301" — sinal de que a
       * migracao pro portal nacional aconteceu e o codigo mudou.
       *
       * TESTADO E NAO ADIANTA: mandar o campo aqui nao muda nada — o Bling
       * ignora e segue usando o INTERN do cadastro dele. Mesmo padrao das
       * datas de emissao da NF-e: a API aceita o campo sem reclamar e nao
       * repassa. Fica so pra valer se um dia honrarem.
       *
       * O ajuste REAL e no painel do Bling, em Configuracoes > Notas fiscais
       * > NFS-e, no cadastro do servico 010901. */
      ...(servico.indicadorOperacao ? { indicadorOperacao: servico.indicadorOperacao } : {}),
    }],
  }
}

/* ── emissão em dois passos ─────────────────────────────────────────────────── */

/**
 * Cria e transmite.
 *
 * `blingIdExistente` é o que impede DUPLICATA DE NOTA FISCAL: se numa rodada
 * anterior o create funcionou mas o envio falhou, a nota já existe em rascunho
 * no Bling. Recriar geraria uma segunda nota com outro número — e se o envio
 * anterior tiver dado certo sem a gente conseguir confirmar, seriam duas notas
 * AUTORIZADAS pro mesmo pedido. Desfazer isso é bem mais caro do que evitar.
 * Então quando já existe id, pula a criação e só retenta o envio.
 */
/** `situacao` do Bling — mapa apurado na prática, não na documentação. */
export const SITUACAO = { PENDENTE: 1, REJEITADA: 4, AUTORIZADA: 5 }

/**
 * Ambiente em que a conta emite HOJE: '1' produção, '2' homologação, null se
 * não deu pra apurar (conta sem nenhuma nota ainda).
 *
 * O Bling não expõe essa configuração por API, então a fonte é o `tpAmb` do
 * XML de uma nota já existente. Apurar isto UMA VEZ por rodada (e não a cada
 * nota) é o que permite decidir se a rodada escreve no banco ANTES de emitir
 * qualquer coisa — sem isso, só dava pra saber depois de já ter emitido, que é
 * tarde demais pra proteger o registro.
 */
export async function ambienteAtual() {
  /* Percorre VARIAS notas ate achar uma utilizavel, em vez de depender da
   * mais recente.
   *
   * Dependia, e quebrou: bastou a ultima ser um rascunho (situacao 1) ou uma
   * rejeitada — nenhuma das duas tem XML — pro lote inteiro se recusar a
   * rodar, com a emissao parada ate alguem olhar. Ponto unico de falha na
   * peca que precisa ser a mais robusta, porque tudo depende dela.
   *
   * Cada passo ESTOURA com o motivo real em vez de devolver null: com tres
   * rodadas simultaneas o limite de 3 req/s do Bling derrubou a listagem e as
   * tres responderam 'a conta nao tem nenhuma nota' — com 22 notas. "Nao sei"
   * e "nao tem" pedem acoes diferentes. */
  const lista = await bling('/nfe?limite=10')
  if (!lista.ok) throw new Error('Bling recusou a listagem de notas: ' + erroDoBling(lista))

  const notas = lista.data?.data || []
  if (!notas.length) return null // aqui sim: a conta realmente nao tem nota nenhuma

  const pulados = []
  for (const n of notas.slice(0, 6)) {
    if (!n?.id) continue
    const nome = n.numero || n.id
    await pausa(400)

    const det = await bling('/nfe/' + n.id)
    if (!det.ok) { pulados.push(nome + ': HTTP ' + det.status); continue }

    const link = det.data?.data?.xml
    if (!link) { pulados.push(nome + ': sem xml (rascunho ou rejeitada)'); continue }

    const resp = await fetch(link)
    if (!resp.ok) { pulados.push(nome + ': xml HTTP ' + resp.status); continue }

    const m = (await resp.text()).match(/<tpAmb>(\d)<\/tpAmb>/)
    if (!m) { pulados.push(nome + ': xml sem tpAmb'); continue }
    return m[1] // achou
  }
  throw new Error('nenhuma das ultimas notas serviu pra apurar o ambiente — ' + pulados.join(' | '))
}
export async function emitir(tipo, payload, blingIdExistente = null, aoCriar = null) {
  const rota = tipo === 'nfse' ? '/nfse' : '/nfe'
  let id = blingIdExistente
  let base = { blingId: id, numero: null, serie: null }

  /* RECONCILIAÇÃO — antes de reenviar, pergunta em que pé a nota está.
   *
   * Um rascunho de tentativa anterior pode ter sido AUTORIZADO sem a gente ter
   * conseguido registrar (queda no meio, timeout, Supabase fora). Reenviar às
   * cegas nesse caso produziria um segundo documento fiscal pra mesma venda —
   * o pior erro possível aqui, e um que só aparece na contabilidade. */
  if (id) {
    const ja = await bling(`${rota}/${id}`)
    const n = ja.data?.data || {}
    if (ja.ok && Number(n.situacao) === SITUACAO.AUTORIZADA) {
      return {
        ok: true,
        etapa: 'reconciliada',
        blingId: id,
        numero: n.numero || n.numeroRPS || null,
        serie: n.serie || null,
        chaveAcesso: n.chaveAcesso || null,
        situacao: n.situacao ?? null,
        linkDanfe: n.linkDanfe || null,
        erro: null,
        tpAmb: null, // veio de consulta, não de protocolo: quem sabe é a rodada
      }
    }

    /* RASCUNHO EXISTENTE RECEBE O PAYLOAD ATUAL antes de ser reenviado.
     *
     * Sem isto, um rascunho criado com dado ruim nunca conserta: o caminho de
     * reconciliação pula a criação e vai direto pro `/enviar`, então o que sai
     * é sempre o conteúdo antigo. Qualquer correção nossa — nome saneado, NCM,
     * descrição — fica no código sem nunca chegar na nota.
     *
     * Foi exatamente o que aconteceu com o pedido 5NR3G4LN: saneei o nome
     * "DD", subi, e a nota voltou a falhar com o MESMO erro, porque o rascunho
     * guardado ainda carregava o nome velho.
     *
     * Falha aqui não é fatal: se o Bling recusar a atualização, segue e tenta
     * enviar como está — o veredito da SEFAZ continua sendo a palavra final. */
    const atualizada = await bling(`${rota}/${id}`, { method: 'PUT', body: payload })
    if (!atualizada.ok) {
      // guarda o motivo, mas não interrompe: pior que rascunho desatualizado
      // é não tentar emitir de jeito nenhum
      /* PUT recusado: o rascunho fica com o conteudo velho, e reenviar so
       * repete o mesmo erro pra sempre. Apaga o rascunho e devolve um sinal
       * pra quem chamou recriar do zero com o payload corrigido — e a unica
       * saida quando o Bling nao deixa editar. */
      base.avisoAtualizacao = erroDoBling(atualizada)
      await pausa(300)
      const apagou = await bling(rota + '/' + id, { method: 'DELETE' })
      if (apagou.ok) {
        return { ok: false, etapa: 'recriar', recriar: true, erro: 'rascunho desatualizado apagado (PUT recusado: ' + base.avisoAtualizacao + '); proxima rodada cria do zero' }
      }
    }
    await pausa(400)
  }

  if (!id) {
    const criada = await bling(rota, { method: 'POST', body: payload })

    /* RASCUNHO ORFAO — adota em vez de insistir.
     *
     * "Ja existe uma nota fiscal cadastrada com este XML" e a protecao do
     * Bling contra duplicata, e ela dispara quando um rascunho ficou la sem
     * registro do nosso lado. Foi o que o timeout da Vercel deixou: a funcao
     * criou a nota e morreu antes de gravar o id.
     *
     * Insistir nao resolve nunca — o conteudo e sempre o mesmo, entao a recusa
     * se repete a cada rodada e queima as 3 tentativas do pedido ate ele sair
     * da fila. Procurar o rascunho pelo CPF do comprador e adota-lo fecha o
     * ciclo: a nota que ja existe passa a ser a nota daquele pedido. */
    if (!criada.ok && /j[aá] existe uma nota fiscal cadastrada com este xml/i.test(erroDoBling(criada))) {
      const doc = soDigitos(payload?.contato?.numeroDocumento)
      const recentes = await bling(`${rota}?limite=50`)
      const achada = (recentes.data?.data || []).find(
        (n) => soDigitos(n?.contato?.numeroDocumento) === doc && doc,
      )
      if (achada?.id) {
        id = achada.id
        base = { blingId: id, numero: achada.numero || achada.numeroRPS || null, serie: achada.serie || null }
        if (aoCriar) {
          try { await aoCriar(id, base) } catch (e) {
            return { ok: false, etapa: 'registrar', erro: `achei o rascunho orfao ${id} mas nao gravei: ${e?.message || e}`, ...base }
          }
        }
        await pausa()
        // segue o fluxo normal: envia/confirma esse id logo abaixo
      } else {
        return { ok: false, etapa: 'criar', erro: `${erroDoBling(criada)} — e nao achei a nota existente pelo CPF ${doc || '(vazio)'}` }
      }
    } else if (!criada.ok) {
      return { ok: false, etapa: 'criar', erro: erroDoBling(criada) }
    }

    /* `criada.ok` guarda este bloco inteiro: sem ele, o caminho de adoção
       acima seria desfeito logo em seguida — `id = d.id` viria vazio (não
       houve criação) e sobrescreveria o rascunho que acabamos de achar. */
    if (criada.ok) {
    const d = criada.data?.data || {}
    id = d.id
    base = { blingId: id, numero: d.numero || d.numeroRPS || null, serie: d.serie || null }
    if (!id) return { ok: false, etapa: 'criar', erro: 'Bling não devolveu id da nota', ...base }

    /* REGISTRO ANTECIPADO. O rascunho já existe mas ainda NÃO foi pra SEFAZ —
     * esta é a última janela em que dá pra anotar o id sem que exista
     * documento fiscal. Se a gravação falhar, aborta ANTES de enviar: melhor
     * um rascunho órfão no Bling (inofensivo, não é documento) do que uma nota
     * autorizada que o banco desconhece. */
    if (aoCriar) {
      try {
        await aoCriar(id, base)
      } catch (e) {
        return { ok: false, etapa: 'registrar', erro: `não gravei o id antes de enviar: ${e?.message || e}`, ...base }
      }
    }
    }

    await pausa()
  }

  const enviada = await bling(`${rota}/${id}/enviar`, { method: 'POST', body: {} })
  if (!enviada.ok) return { ok: false, etapa: 'enviar', erro: erroDoBling(enviada), ...base }

  // ⚠ HTTP 200 aqui NÃO quer dizer autorizada — quer dizer que a SEFAZ recebeu
  // e respondeu. A resposta dela (que pode ser uma recusa) vem no corpo.
  const veredito = lerRespostaSefaz(tipo, enviada.data?.data?.xml || '')

  await pausa(800)
  const conf = await bling(`${rota}/${id}`)
  const n = conf.data?.data || {}

  return {
    ok: veredito.ok,
    etapa: 'confirmar',
    blingId: id,
    numero: n.numero || n.numeroRPS || base.numero,
    serie: n.serie || base.serie,
    chaveAcesso: n.chaveAcesso || null,
    situacao: n.situacao ?? null,
    linkDanfe: n.linkDanfe || null,
    erro: veredito.ok ? null : veredito.motivo,
    /** '1' produção · '2' homologação · null quando não deu pra apurar */
    tpAmb: veredito.tpAmb ?? null,
  }
}

/**
 * A nota foi mesmo autorizada? Lê a resposta que a SEFAZ devolveu no envio.
 *
 * NÃO usar o campo `situacao` do Bling pra isso. Em 20/08/2026 eu li
 * `situacao: 4` como "autorizada" e reportei 3 notas como emitidas — o painel
 * do Bling mostrava "Rejeitada" nas três. O mapa real é 1=Pendente,
 * 4=Rejeitada. Ter `chaveAcesso` também não prova nada: ela é montada antes de
 * ir pra SEFAZ. E HTTP 200 no envio só diz que a SEFAZ respondeu, não que
 * aprovou.
 *
 * A fonte de verdade é o `cStat` do protocolo na resposta do envio: 100 =
 * "Autorizado o uso da NF-e". Qualquer outro valor vira erro com o `xMotivo`
 * real ("Rejeicao: IE do emitente invalida"), que é o que a pessoa precisa ler
 * pra consertar. O XML guardado na nota NÃO tem esse protocolo — só a resposta
 * do envio tem.
 */
function lerRespostaSefaz(tipo, xmlResposta) {
  // NFS-e é municipal e não usa cStat; a resposta vem em outro formato.
  if (tipo === 'nfse') {
    const erro = /erro|rejei|inval/i.test(xmlResposta)
    return { ok: !erro, motivo: erro ? xmlResposta.replace(/<[^>]+>/g, ' ').trim().slice(0, 300) : null }
  }

  const cStat = [...String(xmlResposta).matchAll(/<cStat>(\d+)<\/cStat>/g)].map((m) => m[1])
  const motivos = [...String(xmlResposta).matchAll(/<xMotivo>([^<]*)<\/xMotivo>/g)].map((m) => m[1])

  /* O ambiente vem no MESMO protocolo: 1 = produção, 2 = homologação. É a
     única fonte confiável dele em tempo de emissão — o Bling não expõe essa
     configuração por API, e o seletor do nosso painel nunca foi lido por
     ninguém. Quem decide o que vai pro banco é este número. */
  const amb = String(xmlResposta).match(/<tpAmb>(\d)<\/tpAmb>/)
  const tpAmb = amb ? amb[1] : null

  if (cStat.includes('100')) return { ok: true, motivo: null, tpAmb }
  if (!cStat.length) return { ok: false, motivo: 'SEFAZ não devolveu status (cStat ausente)', tpAmb }

  // 104 = "Lote processado" é só o envelope; o veredito real é o código do item
  const recusa = motivos.find((m) => /rejei|denega|inval/i.test(m)) || motivos[motivos.length - 1]
  return { ok: false, motivo: `[cStat ${cStat.join('/')}] ${recusa || 'sem motivo'}`.slice(0, 300), tpAmb }
}

/**
 * Reautorização do OAuth.
 *
 * Não havia caminho pra isso: o par de tokens foi colocado na mão em `app_state`
 * na primeira vez, e quando o refresh expirou (uso único, e ninguém emitiu nada
 * por semanas) a emissão morreu sem ter como voltar pelo painel. Como o plano
 * Hobby está no teto de 12 funções, isto pega carona no `recover.js?job=notas`
 * em vez de virar um endpoint próprio.
 *
 * Duas etapas, porque o Bling exige o consentimento no navegador:
 *   1. `urlAutorizacao()` devolve o link pra abrir logado no Bling;
 *   2. o Bling redireciona pra URI cadastrada no app com `?code=…`;
 *      `trocarCodigo()` troca esse code pelo par de tokens e grava.
 *
 * O `redirect_uri` tem que ser IDÊNTICO ao cadastrado no app do Bling — ele
 * entra na troca só pra conferência, e diferença de barra no fim já reprova.
 */
export function urlAutorizacao(redirectUri, estado = 'trackerads') {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.BLING_CLIENT_ID || '',
    state: estado,
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  })
  return `https://www.bling.com.br/Api/v3/oauth/authorize?${q}`
}

export async function trocarCodigo(code, redirectUri) {
  if (!code) throw new Error('code ausente')
  const basic = Buffer.from(`${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`).toString('base64')
  const r = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) {
    throw new Error(`Troca do code falhou: ${r.status} ${JSON.stringify(j).slice(0, 300)}`)
  }
  await gravarOauth({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: new Date(Date.now() + (j.expires_in || 21600) * 1000).toISOString(),
  })
  return { ok: true, expira_em: new Date(Date.now() + (j.expires_in || 21600) * 1000).toISOString() }
}
