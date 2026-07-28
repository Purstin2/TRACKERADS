// Endpoints do app mobile consolidados numa função só (limite de 12 do Hobby):
//   GET  /api/mobile?fn=meta-today       → spend/impressões de hoje (era meta-today.js)
//   POST /api/mobile?fn=push-subscribe   → salva inscrição de Web Push (era push-subscribe.js)

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}

async function stateGet(url, key, k) {
  try {
    const r = await fetch(`${url}/rest/v1/app_state?key=eq.${encodeURIComponent(k)}&select=value`, { headers: sbHeaders(key) })
    const j = await r.json()
    return Array.isArray(j) && j[0] ? j[0].value : null
  } catch { return null }
}

// Gasto de HOJE somando TODAS as contas do Monitor (mesma fonte do desktop:
// meta_tok + monitor_accounts_v1 + fx dos Parâmetros no app_state), com contas
// USD convertidas pra BRL — antes era 1 conta fixa de env, sem câmbio, e o
// lucro do app saía igual ao faturamento.
async function metaToday(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.json({ ok: false, reason: 'supabase não configurado' })

  const token = await stateGet(url, key, 'meta_tok')
  const accounts = (await stateGet(url, key, 'monitor_accounts_v1')) || []
  const sRaw = (await stateGet(url, key, 'meta_settings')) || {}
  const fx = +sRaw.fx || 5.4
  if (!token || !Array.isArray(accounts) || !accounts.length) {
    return res.json({ ok: false, reason: 'abra o Monitor no desktop uma vez (sincroniza token/contas)' })
  }

  try {
    const results = await Promise.all(
      accounts.map(async (acc) => {
        try {
          const r = await fetch(
            `https://graph.facebook.com/v22.0/act_${acc.id}/insights` +
              `?date_preset=today&fields=spend,impressions,clicks&level=account&access_token=${token}`,
          )
          const j = await r.json()
          const row = Array.isArray(j.data) ? j.data[0] : null
          if (!row) return { spend: 0, impressions: 0, clicks: 0 }
          const mult = acc.cur === 'USD' ? fx : 1
          return {
            spend: (parseFloat(row.spend) || 0) * mult,
            impressions: parseInt(row.impressions || 0, 10),
            clicks: parseInt(row.clicks || 0, 10),
          }
        } catch { return { spend: 0, impressions: 0, clicks: 0 } }
      }),
    )
    const sum = results.reduce(
      (a, b) => ({ spend: a.spend + b.spend, impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks }),
      { spend: 0, impressions: 0, clicks: 0 },
    )
    return res.json({
      ok: true,
      spend: +sum.spend.toFixed(2), // BRL (USD já convertido pelo fx)
      impressions: sum.impressions,
      clicks: sum.clicks,
      accounts: accounts.length,
      fx,
    })
  } catch (e) {
    return res.json({ ok: false, reason: e.message })
  }
}

async function pushSubscribe(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })

  let b = {}
  try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {} } catch { return res.status(400).json({ error: 'json inválido' }) }
  const sub = b.subscription || b
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'inscrição inválida' })

  try {
    await fetch(`${url}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ endpoint, p256dh, auth, ua: (req.headers['user-agent'] || '').slice(0, 200) }),
    })
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: 'falha ao salvar: ' + (e?.message || e) })
  }
}

// Cotas de envio COMPARTILHADAS entre os produtos: Brevo (e-mail/dia) e WhatsApp
// (qualidade/nível do número). Serve pro widget "Limites de Envio" do dashboard
// avisar antes de estourar. Mora aqui junto das outras por causa do limite de
// 12 Serverless Functions do plano Hobby.
async function limites(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60')
  const out = { ok: true, brevo: null, whatsapp: null }

  const bk = process.env.BREVO_API_KEY
  if (bk) {
    try {
      const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': bk } })
      const j = await r.json()
      const p = (j.plan || []).find((x) => x.creditsType === 'sendLimit') || (j.plan || [])[0]
      // free = cota DIÁRIA (300). subscription = cota do CICLO (renova em endDate).
      if (p) out.brevo = {
        restante: typeof p.credits === 'number' ? p.credits : null,
        plano: p.type || null,
        limite: p.type === 'free' ? 300 : null,
        ciclo: p.type === 'free' ? 'dia' : 'mês',
        renova: p.endDate || null,
      }
    } catch { /* segue sem brevo */ }
  }

  const wt = process.env.WA_TOKEN
  const wp = process.env.WA_PHONE_ID
  if (wt && wp) {
    try {
      const r = await fetch(`https://graph.facebook.com/v22.0/${wp}?fields=display_phone_number,quality_rating,messaging_limit_tier,throughput&access_token=${wt}`)
      const j = await r.json()
      if (!j.error) out.whatsapp = { numero: j.display_phone_number || null, qualidade: j.quality_rating || null, nivel: j.messaging_limit_tier || j.throughput?.level || null }
    } catch { /* segue sem whatsapp */ }
  }

  return res.json(out)
}

// ROI da recuperação de venda do Melodify (quem recebeu WhatsApp/e-mail e pagou
// depois). Proxy server-side: o secret fica aqui no env, nunca no navegador.
async function recupMelodify(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120')
  const base = process.env.MELODIFY_URL || 'https://melodify.bibliotecando.com'
  const sec = process.env.MELODIFY_SECRET
  if (!sec) return res.json({ ok: false, reason: 'MELODIFY_SECRET não configurado' })
  try {
    const dias = Math.max(1, Math.min(90, Number(req.query.dias) || 7))
    const r = await fetch(`${base}/api/admin?secret=${encodeURIComponent(sec)}&recup=1&dias=${dias}`)
    const j = await r.json()
    if (!j || !j.ok) return res.json({ ok: false, reason: 'melodify não respondeu' })
    return res.json({ ok: true, ...j.recup })
  } catch {
    return res.json({ ok: false, reason: 'falha ao consultar' })
  }
}

/* Recuperação por E-MAIL de todas as ofertas: cruza os envios do Brevo com as
 * vendas aprovadas (quem recebeu e comprou DEPOIS). Agrupa por assunto — cada
 * assunto é, na prática, uma campanha de recuperação de uma oferta. */
async function recupEmail(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300')
  const bk = process.env.BREVO_API_KEY
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!bk) return res.json({ ok: false, reason: 'BREVO_API_KEY não configurado' })
  const dias = Math.max(1, Math.min(30, Number(req.query.dias) || 7))
  const desde = new Date(Date.now() - dias * 86400000)
  const dISO = desde.toISOString().slice(0, 10)
  const hoje = new Date().toISOString().slice(0, 10)

  // só assuntos de RECUPERAÇÃO (não confirmação/entrega)
  const ehRecup = (s) => /pix ainda|ainda d[áa] tempo|ficou pronta|te esperando|esquec|carrinho|n[ãa]o foi confirmad/i.test(s || '')
  const camp = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 42)

  const puxa = async (evento) => {
    try {
      const r = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=2500&startDate=${dISO}&endDate=${hoje}&event=${evento}`, { headers: { 'api-key': bk } })
      const j = await r.json()
      return Array.isArray(j.events) ? j.events : []
    } catch { return [] }
  }
  const [envios, aberturas, cliques] = await Promise.all([puxa('requests'), puxa('opened'), puxa('clicks')])

  // vendas aprovadas no período (pra saber quem comprou depois de receber)
  const aprovadas = {}
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/kirvano_orders?status=eq.APPROVED&created_at=gte.${desde.toISOString()}&select=customer_email,value,created_at&limit=5000`, { headers: sbHeaders(key) })
      const rows = await r.json()
      if (Array.isArray(rows)) rows.forEach((o) => {
        const e = String(o.customer_email || '').toLowerCase().trim()
        if (!e) return
        ;(aprovadas[e] = aprovadas[e] || []).push({ t: Date.parse(o.created_at), v: Number(o.value) || 0 })
      })
    } catch { /* segue sem conversão */ }
  }

  const abriu = new Set(aberturas.filter((e) => ehRecup(e.subject)).map((e) => `${e.email}|${camp(e.subject)}`))
  const clicou = new Set(cliques.filter((e) => ehRecup(e.subject)).map((e) => `${e.email}|${camp(e.subject)}`))

  const porCamp = {}
  const jaContado = new Set()
  for (const ev of envios) {
    if (!ehRecup(ev.subject)) continue
    const c = camp(ev.subject)
    const em = String(ev.email || '').toLowerCase().trim()
    const chave = `${em}|${c}`
    if (jaContado.has(chave)) continue // 1 pessoa por campanha
    jaContado.add(chave)
    const g = (porCamp[c] = porCamp[c] || { campanha: c, enviados: 0, abertos: 0, cliques: 0, converteram: 0, receita: 0 })
    g.enviados++
    if (abriu.has(chave)) g.abertos++
    if (clicou.has(chave)) g.cliques++
    const tEnvio = Date.parse(ev.date)
    const compras = aprovadas[em] || []
    const depois = compras.find((x) => x.t > tEnvio)
    if (depois) { g.converteram++; g.receita += depois.v }
  }

  const lista = Object.values(porCamp)
    .map((g) => ({ ...g, receita: +g.receita.toFixed(2), taxa: g.enviados ? +((g.converteram / g.enviados) * 100).toFixed(1) : 0, aberturaPct: g.enviados ? +((g.abertos / g.enviados) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.enviados - a.enviados)
  return res.json({ ok: true, dias, campanhas: lista })
}

/* ── CAMPANHAS no celular (mesma leitura do Monitor do desktop) ───────────────
 * Token e lista de contas moram no servidor (app_state), então o celular não
 * precisa colar token — funciona em qualquer aparelho, e o token não trafega
 * pro browser.
 *   GET  /api/mobile?fn=camps&preset=last_7d&status=active[&acc=<id>]
 *   POST /api/mobile?fn=camp-action   body { id, status: 'ACTIVE'|'PAUSED' }
 */
const ATYPES = ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase']
const findVal = (arr, keys) => {
  if (!Array.isArray(arr)) return null
  const i = arr.find((a) => keys.includes(a.action_type))
  return i ? parseFloat(i.value) : null
}
// janelas iguais às do desktop (src/lib/meta.ts): last_Nd exclui hoje.
// O Graph não tem last_4d nem "anteontem" → viram time_range.
function campDateParams(preset) {
  const fmt = (d) => d.toISOString().split('T')[0]
  if (preset === 'day_before_yesterday') {
    const d = new Date(); d.setDate(d.getDate() - 2)
    return { time_range: JSON.stringify({ since: fmt(d), until: fmt(d) }) }
  }
  const NATIVE = ['last_3d', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d']
  const m = /^last_(\d+)d$/.exec(preset || '')
  if (m && !NATIVE.includes(preset)) {
    const n = parseInt(m[1], 10)
    const until = new Date(); until.setDate(until.getDate() - 1)
    const since = new Date(); since.setDate(since.getDate() - n)
    return { time_range: JSON.stringify({ since: fmt(since), until: fmt(until) }) }
  }
  return { date_preset: preset || 'today' }
}
const CAMP_STATUS = {
  active: ['ACTIVE'],
  active_paused: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
  all: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'ARCHIVED', 'DELETED'],
}
const GRAPH = 'https://graph.facebook.com/v22.0'

async function metaCtx(res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) { res.json({ ok: false, reason: 'supabase não configurado' }); return null }
  const token = await stateGet(url, key, 'meta_tok')
  const accounts = (await stateGet(url, key, 'monitor_accounts_v1')) || []
  const s = (await stateGet(url, key, 'meta_settings')) || {}
  if (!token || !Array.isArray(accounts) || !accounts.length) {
    res.json({ ok: false, reason: 'abra o Monitor no desktop uma vez (sincroniza token/contas)' })
    return null
  }
  return { token, accounts, fx: +s.fx || 5.4, roasGood: +s.roasGood || 2, roasBe: +s.roasBe || 1.25, cpaMax: +s.cpaMax || 12 }
}

async function camps(req, res) {
  const ctx = await metaCtx(res)
  if (!ctx) return
  const { token, accounts, fx } = ctx
  const preset = String(req.query.preset || 'last_7d')
  const statuses = CAMP_STATUS[String(req.query.status || 'active')] || CAMP_STATUS.active
  const only = String(req.query.acc || '').trim()
  const alvo = only ? accounts.filter((a) => String(a.id) === only) : accounts

  const porConta = await Promise.all(alvo.map(async (acc) => {
    try {
      const p = new URLSearchParams({
        level: 'campaign',
        fields: 'campaign_id,campaign_name,spend,purchase_roas,cost_per_action_type,actions,frequency',
        ...campDateParams(preset),
        filtering: JSON.stringify([{ field: 'campaign.effective_status', operator: 'IN', value: statuses }]),
        access_token: token, limit: '300',
      })
      const pm2 = new URLSearchParams({
        fields: 'id,name,daily_budget,lifetime_budget,effective_status',
        limit: '300', access_token: token,
      })
      const [ins, met] = await Promise.all([
        fetch(`${GRAPH}/act_${acc.id}/insights?${p}`).then((r) => r.json()),
        fetch(`${GRAPH}/act_${acc.id}/campaigns?${pm2}`).then((r) => r.json()),
      ])
      if (ins.error) return { erro: `${acc.name}: ${ins.error.message}` }
      const meta = {}
      for (const c of (met.data || [])) {
        meta[c.id] = {
          budget: c.daily_budget ? parseInt(c.daily_budget, 10) / 100 : c.lifetime_budget ? parseInt(c.lifetime_budget, 10) / 100 : null,
          status: c.effective_status,
        }
      }
      const mult = acc.cur === 'USD' ? fx : 1 // tudo em BRL, como o resto do app
      return {
        rows: (ins.data || []).map((r) => {
          const spend = (parseFloat(r.spend) || 0) * mult
          const roas = findVal(r.purchase_roas, ATYPES)
          const cpa = findVal(r.cost_per_action_type, ATYPES)
          const sales = Math.round(findVal(r.actions, ATYPES) || 0)
          const md = meta[r.campaign_id] || {}
          return {
            id: r.campaign_id, name: r.campaign_name || '',
            accId: acc.id, accName: acc.name,
            spend: +spend.toFixed(2), roas, sales,
            cpa: cpa == null ? null : +(cpa * mult).toFixed(2),
            revenue: roas != null ? +(roas * spend).toFixed(2) : 0,
            freq: parseFloat(r.frequency || '0') || 0,
            budget: md.budget == null ? null : +(md.budget * mult).toFixed(2),
            status: md.status || null,
          }
        }),
      }
    } catch (e) { return { erro: `${acc.name}: ${e.message}` } }
  }))

  const rows = porConta.flatMap((x) => x.rows || [])
  const erros = porConta.map((x) => x.erro).filter(Boolean)
  rows.sort((a, b) => b.spend - a.spend)
  return res.json({
    ok: true, preset, rows, erros,
    contas: accounts.map((a) => ({ id: a.id, name: a.name })),
    params: { roasGood: ctx.roasGood, roasBe: ctx.roasBe, cpaMax: ctx.cpaMax, fx },
  })
}

async function campAction(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const ctx = await metaCtx(res)
  if (!ctx) return
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const id = String(body.id || '').trim()
  const status = String(body.status || '').toUpperCase()
  if (!id || !['ACTIVE', 'PAUSED'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'informe id e status ACTIVE|PAUSED' })
  }
  try {
    const r = await fetch(`${GRAPH}/${id}`, {
      method: 'POST',
      body: new URLSearchParams({ status, access_token: ctx.token }),
    })
    const j = await r.json()
    if (j.error) return res.json({ ok: false, error: j.error.message })
    // relê o status de verdade: a resposta do POST diz "success" mesmo quando a
    // Meta aplica algo diferente do pedido — quem manda é o effective_status.
    let real = null
    try {
      const v = await (await fetch(`${GRAPH}/${id}?fields=effective_status&access_token=${ctx.token}`)).json()
      real = v.effective_status || null
    } catch {}
    return res.json({ ok: true, pedido: status, effective_status: real })
  } catch (e) {
    return res.json({ ok: false, error: e.message })
  }
}

/* Orçamento de UMA campanha — CBO (verba na campanha) ou ABO (verba nos
 * conjuntos). GET lê o atual; POST aplica. Em ABO o fator é rateado entre os
 * conjuntos ativos, igual ao desktop.
 *   GET  /api/mobile?fn=camp-budget&id=<campId>
 *   POST /api/mobile?fn=camp-budget   { id, novoTotal }   (novoTotal na moeda da conta) */
async function campBudget(req, res) {
  const ctx = await metaCtx(res)
  if (!ctx) return
  const t = ctx.token
  const id = String((req.query.id || (req.body && req.body.id) || '')).trim()
  if (!id) return res.status(400).json({ ok: false, error: 'informe o id da campanha' })

  async function ler() {
    const j = await (await fetch(`${GRAPH}/${id}?fields=daily_budget,lifetime_budget,name,status&access_token=${t}`)).json()
    if (j.error) throw new Error(j.error.message)
    if (j.daily_budget) {
      return { nivel: 'CBO', itens: [{ id, daily: parseInt(j.daily_budget, 10), name: j.name }], total: parseInt(j.daily_budget, 10) }
    }
    const p = new URLSearchParams({ fields: 'daily_budget,name,status,effective_status', access_token: t, limit: '100' })
    const a = await (await fetch(`${GRAPH}/${id}/adsets?${p}`)).json()
    if (a.error) throw new Error(a.error.message)
    const itens = (a.data || [])
      .filter((x) => x.effective_status === 'ACTIVE' && x.daily_budget)
      .map((x) => ({ id: x.id, daily: parseInt(x.daily_budget, 10), name: x.name }))
    return { nivel: 'ABO', itens, total: itens.reduce((s, i) => s + i.daily, 0) }
  }

  try {
    if (req.method !== 'POST') {
      const info = await ler()
      return res.json({ ok: true, ...info, totalMoeda: +(info.total / 100).toFixed(2) })
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const novoTotal = parseFloat(body.novoTotal)
    if (!(novoTotal > 0)) return res.status(400).json({ ok: false, error: 'novoTotal inválido' })
    const info = await ler()
    if (!info.itens.length) return res.json({ ok: false, error: 'nenhum conjunto ativo com orçamento diário' })
    const atual = info.total / 100
    const fator = atual > 0 ? novoTotal / atual : 1
    const erros = []
    for (const it of info.itens) {
      const alvo = info.itens.length === 1 ? Math.round(novoTotal * 100) : Math.round(it.daily * fator)
      const r = await fetch(`${GRAPH}/${it.id}`, { method: 'POST', body: new URLSearchParams({ daily_budget: String(alvo), access_token: t }) })
      const j = await r.json()
      if (j.error) erros.push(`${it.name}: ${j.error.message}`)
    }
    // confirma relendo — e avisa se a Meta pausou junto (já aconteceu em 24/07)
    const depois = await ler()
    let status = null
    try {
      const v = await (await fetch(`${GRAPH}/${id}?fields=effective_status&access_token=${t}`)).json()
      status = v.effective_status || null
    } catch {}
    return res.json({
      ok: erros.length === 0, erros,
      antes: +atual.toFixed(2), depois: +(depois.total / 100).toFixed(2),
      nivel: depois.nivel, effective_status: status,
    })
  } catch (e) {
    return res.json({ ok: false, error: e.message })
  }
}

/* Dia a dia de UMA campanha (padrão 7 dias) — o "histórico" de performance. */
async function campDaily(req, res) {
  const ctx = await metaCtx(res)
  if (!ctx) return
  const id = String(req.query.id || '').trim()
  const dias = Math.min(30, Math.max(2, parseInt(req.query.dias || '7', 10) || 7))
  if (!id) return res.status(400).json({ ok: false, error: 'informe o id' })
  const fmt = (d) => d.toISOString().split('T')[0]
  const until = new Date()
  const since = new Date(); since.setDate(since.getDate() - (dias - 1))
  try {
    const p = new URLSearchParams({
      level: 'campaign',
      fields: 'spend,purchase_roas,cost_per_action_type,actions,date_start',
      time_range: JSON.stringify({ since: fmt(since), until: fmt(until) }),
      time_increment: '1',
      filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: id }]),
      access_token: ctx.token, limit: '60',
    })
    const j = await (await fetch(`${GRAPH}/act_${req.query.acc}/insights?${p}`)).json()
    if (j.error) return res.json({ ok: false, error: j.error.message })
    const dd = (j.data || []).map((r) => ({
      dia: r.date_start,
      spend: +(parseFloat(r.spend) || 0).toFixed(2),
      roas: findVal(r.purchase_roas, ATYPES),
      sales: Math.round(findVal(r.actions, ATYPES) || 0),
      cpa: findVal(r.cost_per_action_type, ATYPES),
    }))
    return res.json({ ok: true, dias: dd })
  } catch (e) {
    return res.json({ ok: false, error: e.message })
  }
}

export default async function handler(req, res) {
  const fn = String(req.query.fn || '')
  if (fn === 'camps') return camps(req, res)
  if (fn === 'camp-budget') return campBudget(req, res)
  if (fn === 'camp-daily') return campDaily(req, res)
  if (fn === 'camp-action') return campAction(req, res)
  if (fn === 'meta-today') return metaToday(req, res)
  if (fn === 'push-subscribe') return pushSubscribe(req, res)
  if (fn === 'limites') return limites(req, res)
  if (fn === 'recup-melodify') return recupMelodify(req, res)
  if (fn === 'recup-email') return recupEmail(req, res)
  return res.status(400).json({ error: 'fn inválido (camps | camp-action | meta-today | push-subscribe | limites | recup-melodify | recup-email)' })
}
