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

export default async function handler(req, res) {
  const fn = String(req.query.fn || '')
  if (fn === 'meta-today') return metaToday(req, res)
  if (fn === 'push-subscribe') return pushSubscribe(req, res)
  if (fn === 'limites') return limites(req, res)
  if (fn === 'recup-melodify') return recupMelodify(req, res)
  if (fn === 'recup-email') return recupEmail(req, res)
  return res.status(400).json({ error: 'fn inválido (meta-today | push-subscribe | limites | recup-melodify | recup-email)' })
}
