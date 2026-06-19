import crypto from 'node:crypto'

// ════════════════════════════════════════════════════════════════════
// PURSTINLAB · Disparo MANUAL de evento pro Meta CAPI.
// Pra vendas que não passaram pelo webhook (ex: cliente pagou Pix direto no CNPJ).
// NÃO altera o fluxo automático (webhook.js) — é um caminho separado, sob demanda.
//
// POST /api/manual-event?secret=WEBHOOK_SECRET
//   body: { offerId | pixelId, eventName?, value, currency?, orderId, email, phone,
//           cpf, firstName, lastName, ip, userAgent?, sourceUrl?, fbc?, fbp?, testCode? }
// Lê o token do pixel pela rota (service key) — token nunca sai do servidor.
// ════════════════════════════════════════════════════════════════════

const sha = (v) => (v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined)
const digits = (v) => (v ? String(v).replace(/\D/g, '') : '')
const sanitize = (v) => (v == null ? null : String(v).replace(/\s+/g, '') || null)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const secret = req.query.secret
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'secret inválido' })
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })

  let b = {}
  try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {} } catch { return res.status(400).json({ error: 'json inválido' }) }
  const {
    offerId, pixelId, eventName = 'Purchase', value, currency = 'BRL', orderId,
    email, phone, cpf, firstName, lastName, ip, userAgent, sourceUrl, fbc, fbp, testCode,
  } = b

  // localiza a rota (token) por offer_id OU pixel_id — ignora active (disparo manual)
  let q
  if (offerId) q = `${url}/rest/v1/pixel_routes?offer_id=eq.${encodeURIComponent(offerId)}&select=pixel_id,capi_token&limit=1`
  else if (pixelId) q = `${url}/rest/v1/pixel_routes?pixel_id=eq.${encodeURIComponent(pixelId)}&select=pixel_id,capi_token&limit=1`
  else return res.status(400).json({ error: 'informe offerId ou pixelId' })

  let route
  try {
    const r = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    const rows = await r.json()
    route = Array.isArray(rows) ? rows[0] : null
  } catch { return res.status(500).json({ error: 'falha lendo a rota no Supabase' }) }
  if (!route) return res.status(404).json({ error: 'rota/pixel não encontrado (cadastre na aba Pixels)' })

  const pid = sanitize(route.pixel_id)
  const token = sanitize(route.capi_token)
  if (!pid || !token) return res.status(400).json({ error: 'rota sem pixel ou token' })

  const user_data = { client_user_agent: userAgent || 'purstinlab-manual' }
  if (email) user_data.em = [sha(email)]
  if (phone) user_data.ph = [sha(digits(phone))]
  if (cpf) user_data.external_id = [sha(digits(cpf))]
  if (firstName) user_data.fn = [sha(firstName)]
  if (lastName) user_data.ln = [sha(lastName)]
  if (ip) user_data.client_ip_address = ip
  if (fbc) user_data.fbc = fbc
  if (fbp) user_data.fbp = fbp

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: orderId ? String(orderId) : `manual_${Date.now()}`,
    action_source: 'website',
    user_data,
    custom_data: { currency, value: Number(value) || 0, ...(orderId ? { order_id: String(orderId) } : {}) },
  }
  if (sourceUrl) event.event_source_url = sourceUrl

  const payload = { data: [event], ...(sanitize(testCode) ? { test_event_code: sanitize(testCode) } : {}) }

  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/${pid}/events?access_token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const j = await r.json()
    if (j.error) return res.status(200).json({ ok: false, pixel: pid, error: j.error.message, code: j.error.code, details: j.error.error_user_msg || null })
    return res.status(200).json({ ok: true, pixel: pid, event: eventName, value: Number(value) || 0, events_received: j.events_received, fbtrace_id: j.fbtrace_id, messages: j.messages || [] })
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'graph api: ' + (e?.message || e) })
  }
}
