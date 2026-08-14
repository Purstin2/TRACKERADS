// api/refire-capi.js — re-dispara um Purchase CAPI pra pedidos que ficaram sem
// capi_ok (ex: rota de pixel não existia na hora da venda).
// POST /api/refire-capi?secret=LABTRACK123
// body: { id: "<kirvano_orders.id>", utmSource?, utmCampaign?, utmMedium?, utmContent? }
// Resultado: { ok, pixel, fbtrace_id?, error?, details? }
// IMPORTANTE: só atualiza capi_ok=true — não toca em product/payment_method/etc.

import crypto from 'node:crypto'

function sbH(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

const stripAccents = (v) => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (v) => stripAccents(String(v).trim().toLowerCase())
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex')
const sha256 = (v) => (v ? sha(norm(v)) : undefined)
const hashEmail = (v) => { if (!v) return undefined; const e = norm(v); return e.includes('@') ? sha(e) : undefined }
const sanitize = (v) => (v == null ? null : String(v).replace(/\s+/g, '') || null)

const KNOWN_DDIS = ['351', '598', '595', '593', '591', '55', '54', '57', '56', '52', '51', '34', '1']
function normalizePhone(v, defaultDdi = '55') {
  if (!v) return undefined
  let d = String(v).replace(/\D/g, '')
  if (!d) return undefined
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith(defaultDdi) && d.length > defaultDdi.length + 7) return d
  if (KNOWN_DDIS.some((p) => d.startsWith(p) && d.length > p.length + 7)) return d
  return defaultDdi + d
}
const hashPhone = (v, ddi) => { const d = normalizePhone(v, ddi); return d ? sha(d) : undefined }

function hashName(fullName) {
  if (!fullName) return {}
  const parts = norm(fullName).split(/\s+/).filter(Boolean)
  if (!parts.length) return {}
  return { fn: sha(parts[0]), ln: parts.length > 1 ? sha(parts[parts.length - 1]) : undefined }
}

const hashDoc = (v) => { if (!v) return undefined; const d = String(v).replace(/\D/g, ''); return d.length >= 11 ? sha(d) : undefined }
const hashCity = (v) => (v ? sha(norm(v).replace(/\s+/g, '')) : undefined)
const hashState = (v) => (v ? sha(norm(v).replace(/\s+/g, '')) : undefined)
const hashZip = (v) => { const d = String(v || '').replace(/\D/g, ''); return d ? sha(d) : undefined }

const COUNTRY_NAME_TO_ISO = { brasil: 'br', brazil: 'br', portugal: 'pt', chile: 'cl', espanha: 'es', spain: 'es' }
function isoCountry(v) {
  const c = norm(v || 'br')
  return COUNTRY_NAME_TO_ISO[c] || c.slice(0, 2)
}
const hashCountry = (v) => sha(isoCountry(v))

const DDI_BY_ISO = { br: '55', pt: '351', es: '34', cl: '56', mx: '52', ar: '54', co: '57', pe: '51' }
const ddiOf = (iso) => DDI_BY_ISO[iso] || '55'

// fbc é o sinal de clique mais forte. A Kirvano manda só cookies.fbclid (não o
// _fbc pronto) — reconstrói no formato fb.1.<ts>.<fbclid>. Mesma lógica do webhook.
function buildFbc(fbclid, rawFbc, createdAt) {
  if (rawFbc && /^fb\.1\.\d+\./.test(rawFbc)) return rawFbc
  const id = fbclid || (rawFbc && !rawFbc.startsWith('fb.') ? rawFbc : null)
  if (!id) return null
  const ts = createdAt ? new Date(createdAt).getTime() : Date.now()
  return `fb.1.${ts || Date.now()}.${id}`
}

async function resolvePixel(supabaseUrl, supabaseKey, order) {
  // Extrai offer_id e product_id do campo products[] salvo no pedido
  const products = Array.isArray(order.products) ? order.products : []
  const main = products.find((p) => !p.is_order_bump) || products[0] || {}
  const offerId = main.offer_id || null
  const productId = main.id ? String(main.id) : null
  const gateway = order.gateway || 'kirvano'

  const keys = [offerId, productId].filter(Boolean).map(String)
  if (!keys.length) return null

  const inList = keys.map((k) => `"${k}"`).join(',')
  const q = `${supabaseUrl}/rest/v1/pixel_routes?active=eq.true&or=(offer_id.in.(${inList}),match_type.eq.any)&select=offer_id,match_type,pixel_id,capi_token,test_code,gateways&order=match_type.asc`
  const r = await fetch(q, { headers: sbH(supabaseKey) })
  const rows = await r.json()
  if (!Array.isArray(rows) || !rows.length) return null

  const exact = rows.find((row) => row.match_type !== 'any' && keys.includes(String(row.offer_id)))
  const any = rows.find((row) => row.match_type === 'any')
  const hit = exact || any
  if (!hit || !hit.pixel_id || !hit.capi_token) return null
  return { pixelId: sanitize(hit.pixel_id), token: sanitize(hit.capi_token), testCode: sanitize(hit.test_code) }
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'supabase não configurado' })

  const secret = req.query.secret
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  let body = {}
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) } catch {}

  const { id, utmSource, utmCampaign, utmMedium, utmContent, fbclid: fbclidManual } = body
  if (!id) return res.status(400).json({ error: 'id obrigatório' })

  // 1. Lê o pedido do Supabase
  const orderRes = await fetch(
    `${supabaseUrl}/rest/v1/kirvano_orders?id=eq.${id}&select=*&limit=1`,
    { headers: sbH(supabaseKey) }
  )
  const orderRows = await orderRes.json()
  if (!Array.isArray(orderRows) || !orderRows.length) return res.status(404).json({ error: 'pedido não encontrado' })
  const o = orderRows[0]

  // 2. Resolve o pixel pela rota
  const route = await resolvePixel(supabaseUrl, supabaseKey, o)
  if (!route) return res.status(422).json({ error: 'nenhuma rota de pixel encontrada pra esse pedido — cadastre uma rota na aba Pixels' })

  // 3. Sinais de clique/geo/IP vivem dentro do raw (a tabela não tem colunas fbc/fbp/country)
  const raw = o.raw || {}
  const cookies = raw.cookies || {}
  const addr = (raw.customer && raw.customer.address) || {}
  // fbclidManual (colado da UTMIFY = clique de anúncio real) tem prioridade — é o que
  // reatribui a campanha no Meta. Sem ele, usa o fbclid que veio na venda (pode ser orgânico).
  const hasManual = !!(fbclidManual && String(fbclidManual).trim())
  const fbclid = hasManual ? String(fbclidManual).trim() : (cookies.fbclid || raw.fbclid || null)
  // se o usuário colou um fbclid de anúncio, ignora o _fbc orgânico que veio na venda
  const rawFbc = hasManual ? null : (cookies._fbc || raw.fbc || null)
  const rawFbp = cookies._fbp || raw.fbp || null
  const fbc = buildFbc(fbclid, rawFbc, o.ordered_at || o.created_at)
  const fbp = rawFbp && /^fb\.1\./.test(rawFbp) ? rawFbp : (rawFbp ? `fb.1.${Date.now()}.${rawFbp}` : null)
  const clientIp = raw.ip || null

  const iso = isoCountry(addr.country || (raw.customer && raw.customer.country) || 'br')
  const { fn, ln } = hashName(o.customer_name)

  const userData = {}
  const em = hashEmail(o.customer_email)
  if (em) userData.em = [em]
  const ph = hashPhone(o.customer_phone, ddiOf(iso))
  if (ph) userData.ph = [ph]
  if (fn) userData.fn = [fn]
  if (ln) userData.ln = [ln]
  const ctH = hashCity(addr.city)
  if (ctH) userData.ct = [ctH]
  const stH = hashState(addr.state)
  if (stH) userData.st = [stH]
  const zpH = hashZip(addr.zipcode || addr.zip)
  if (zpH) userData.zp = [zpH]
  userData.country = [hashCountry(iso)]
  const docH = hashDoc(o.customer_doc)
  const external_id = []
  if (docH) external_id.push(docH)
  if (o.sale_id) external_id.push(sha(norm(String(o.sale_id))))
  else if (o.checkout_id) external_id.push(sha(norm(String(o.checkout_id))))
  if (external_id.length) userData.external_id = external_id
  if (fbc) userData.fbc = fbc
  if (fbp) userData.fbp = fbp
  if (clientIp) userData.client_ip_address = clientIp

  // 4. Monta custom_data
  const products = Array.isArray(o.products) ? o.products : []
  const contents = products.length
    ? products.map((p) => ({ id: p.id ? String(p.id) : (p.name || o.product || ''), quantity: p.quantity || 1, item_price: parseFloat(p.price ?? p.amount ?? 0) || 0, title: p.name || undefined }))
    : [{ id: o.product || '', quantity: 1, item_price: o.value || 0 }]

  const currency = (o.currency || 'BRL').toUpperCase()
  const value = o.value || contents.reduce((s, c) => s + c.item_price * c.quantity, 0)

  const now = Math.floor(Date.now() / 1000)
  let eventTime = o.ordered_at ? Math.floor(new Date(o.ordered_at).getTime() / 1000) : now
  if (!eventTime || now - eventTime > 7 * 24 * 3600 || eventTime > now + 60) eventTime = now

  const eventId = `refire_${o.sale_id || o.checkout_id || id}`

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: eventTime,
      event_id: eventId,
      action_source: 'website',
      event_source_url: o.checkout_url || undefined,
      user_data: userData,
      custom_data: {
        content_type: 'product',
        content_ids: contents.map((c) => c.id),
        content_name: o.product || '',
        contents,
        num_items: contents.length,
        currency,
        value,
        order_id: String(o.sale_id || o.checkout_id || id),
      },
    }],
    ...(route.testCode ? { test_event_code: route.testCode } : {}),
  }

  // 5. Dispara pro Meta
  const metaRes = await fetch(
    `https://graph.facebook.com/v22.0/${route.pixelId}/events?access_token=${route.token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  )
  const metaJson = await metaRes.json()
  const capiOk = metaRes.ok && !metaJson.error && (metaJson.events_received > 0 || metaJson.fbtrace_id)

  // 6. Atualiza APENAS capi_ok (nunca toca em product/payment_method)
  if (capiOk) {
    await fetch(
      `${supabaseUrl}/rest/v1/kirvano_orders?id=eq.${id}`,
      { method: 'PATCH', headers: sbH(supabaseKey), body: JSON.stringify({ capi_ok: true, updated_at: new Date().toISOString() }) }
    )
  }

  if (!capiOk) {
    return res.status(200).json({ ok: false, error: metaJson.error?.message || 'CAPI falhou', details: JSON.stringify(metaJson) })
  }

  return res.json({ ok: true, pixel: route.pixelId, events_received: metaJson.events_received, fbtrace_id: metaJson.fbtrace_id })
}
