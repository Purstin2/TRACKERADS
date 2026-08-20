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
export function payloadNfe({ cliente, item, naturezaOperacaoId, textoImunidade }) {
  const end = cliente.endereco || {}
  const temEndereco = !!(end.municipio && end.uf)
  return {
    tipo: 1, // saída
    dataOperacao: new Date().toISOString().slice(0, 19).replace('T', ' '),
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
    servicos: [{ descricao: servico.descricao, valor: servico.valor, codigo: servico.codigo }],
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
export async function emitir(tipo, payload, blingIdExistente = null) {
  const rota = tipo === 'nfse' ? '/nfse' : '/nfe'
  let id = blingIdExistente
  let base = { blingId: id, numero: null, serie: null }

  if (!id) {
    const criada = await bling(rota, { method: 'POST', body: payload })
    if (!criada.ok) return { ok: false, etapa: 'criar', erro: erroDoBling(criada) }

    const d = criada.data?.data || {}
    id = d.id
    base = { blingId: id, numero: d.numero || d.numeroRPS || null, serie: d.serie || null }
    if (!id) return { ok: false, etapa: 'criar', erro: 'Bling não devolveu id da nota', ...base }

    await pausa()
  }

  const enviada = await bling(`${rota}/${id}/enviar`, { method: 'POST', body: {} })
  if (!enviada.ok) return { ok: false, etapa: 'enviar', erro: erroDoBling(enviada), ...base }

  await pausa(1500) // a autorização não é instantânea; dá um tempo antes de conferir

  const conf = await bling(`${rota}/${id}`)
  const n = conf.data?.data || {}
  // NFe: situacao 4 = autorizada. NFSe: quem confirma é o código de verificação.
  const autorizada = tipo === 'nfse' ? !!(n.codigoVerificacao || n.numero) : n.situacao === 4

  return {
    ok: autorizada,
    etapa: 'confirmar',
    blingId: id,
    numero: n.numero || n.numeroRPS || base.numero,
    serie: n.serie || base.serie,
    chaveAcesso: n.chaveAcesso || null,
    situacao: n.situacao ?? null,
    linkDanfe: n.linkDanfe || null,
    erro: autorizada ? null : `nota criada mas não autorizada (situacao ${n.situacao ?? '?'})`,
  }
}
