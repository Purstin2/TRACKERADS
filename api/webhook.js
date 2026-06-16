import crypto from 'node:crypto'

// ─── hashing ────────────────────────────────────────────────────────────────
const sha256 = (v) =>
  v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined

// Phone: digits only → prefixes DDI 55 if missing → hash
const hashPhone = (v) => {
  if (!v) return undefined
  let d = String(v).replace(/\D/g, '')
  if (!d) return undefined
  if (d.length <= 11) d = '55' + d
  return crypto.createHash('sha256').update(d).digest('hex')
}

// Name split: "João Silva" → { fn: hash("joão"), ln: hash("silva") }
function hashName(fullName) {
  if (!fullName) return {}
  const parts = String(fullName).trim().toLowerCase().split(/\s+/)
  const fn = parts[0] ? sha256(parts[0]) : undefined
  const ln = parts.length > 1 ? sha256(parts[parts.length - 1]) : undefined
  return { fn, ln }
}

// CPF/CNPJ → hash (external_id extra)
const hashDoc = (v) => {
  if (!v) return undefined
  const d = String(v).replace(/\D/g, '')
  return d ? sha256(d) : undefined
}

// ─── parsers ────────────────────────────────────────────────────────────────
// "R$ 1.234,56" | "1234.56" | 1234.56  →  1234.56
function toNumber(v) {
  if (typeof v === 'number') return v
  if (!v) return 0
  const s = String(v).replace(/[^\d,.-]/g, '')
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(s) || 0
}

function canonicalStatus(event, rawStatus) {
  const e = String(event || '').toUpperCase()
  const s = String(rawStatus || '').toUpperCase()
  if (e.includes('ABANDONED') || e.includes('ABANDON')) return 'ABANDONED'
  if (e.includes('CHARGEBACK') || s.includes('CHARGEBACK')) return 'CHARGEBACK'
  if (e.includes('REFUND') || s.includes('REFUND') || s.includes('REEMBOLS')) return 'REFUNDED'
  if (e.includes('REFUSED') || s.includes('REFUSED') || s.includes('RECUSAD') || s.includes('DECLINED')) return 'REFUSED'
  if (e.includes('CANCEL') || s.includes('CANCEL')) return 'CANCELED'
  if (e.includes('APPROVED') || s.includes('APPROVED') || s.includes('PAID') || s.includes('APROVAD') || s.includes('COMPLETED')) return 'APPROVED'
  if (e.includes('EXPIRED') || s.includes('EXPIRED') || s.includes('EXPIRAD')) return 'EXPIRED'
  if (e.includes('GENERATED') || e.includes('PIX') || e.includes('SLIP') || s.includes('PENDING') || s.includes('PENDENT')) return 'PENDING'
  return s || 'PENDING'
}

// Extract fbc from checkout_url query string (?fbclid=...)
function extractFbc(checkoutUrl) {
  if (!checkoutUrl) return null
  try {
    const u = new URL(checkoutUrl)
    const fbclid = u.searchParams.get('fbclid')
    if (!fbclid) return null
    const ts = Math.floor(Date.now() / 1000)
    return `fb.1.${ts}.${fbclid}`
  } catch {
    return null
  }
}

// Parse Brazilian state from phone DDD (heuristic) — better than nothing
function stateFromDDD(phone) {
  if (!phone) return null
  const d = String(phone).replace(/\D/g, '')
  const ddd = d.length >= 12 ? d.slice(2, 4) : d.length >= 10 ? d.slice(0, 2) : null
  if (!ddd) return null
  const map = {
    '11': 'sp', '12': 'sp', '13': 'sp', '14': 'sp', '15': 'sp', '16': 'sp', '17': 'sp', '18': 'sp', '19': 'sp',
    '21': 'rj', '22': 'rj', '24': 'rj',
    '27': 'es', '28': 'es',
    '31': 'mg', '32': 'mg', '33': 'mg', '34': 'mg', '35': 'mg', '37': 'mg', '38': 'mg',
    '41': 'pr', '42': 'pr', '43': 'pr', '44': 'pr', '45': 'pr', '46': 'pr',
    '47': 'sc', '48': 'sc', '49': 'sc',
    '51': 'rs', '53': 'rs', '54': 'rs', '55': 'rs',
    '61': 'df', '62': 'go', '63': 'to', '64': 'go', '65': 'mt', '66': 'mt', '67': 'ms', '68': 'ac', '69': 'ro',
    '71': 'ba', '73': 'ba', '74': 'ba', '75': 'ba', '77': 'ba',
    '79': 'se', '81': 'pe', '82': 'al', '83': 'pb', '84': 'rn', '85': 'ce', '86': 'pi',
    '87': 'pe', '88': 'ce', '89': 'pi', '91': 'pa', '92': 'am', '93': 'pa', '94': 'pa',
    '95': 'rr', '96': 'ap', '97': 'am', '98': 'ma', '99': 'ma',
  }
  return map[ddd] || null
}

/** Normaliza o payload de cada gateway num pedido comum. */
function parseOrder(gateway, body) {
  if (gateway === 'kirvano') {
    const c = body.customer || body.client || {}
    const utm = body.utm || {}
    const addr = c.address || {}
    const products = Array.isArray(body.products) ? body.products : []
    const main = products.find((p) => !p.is_order_bump) || products[0] || {}
    const status = canonicalStatus(body.event, body.status)
    const checkoutUrl = body.checkout_url || body.cart_url || null

    return {
      gateway,
      event: body.event || body.event_description || '',
      status,
      approved: status === 'APPROVED',
      abandoned: status === 'ABANDONED',
      checkoutId: body.checkout_id || body.sale_id || body.id,
      saleId: body.sale_id || null,
      value: toNumber(body.total_price ?? body.amount ?? body.value),
      product: main.name || body.product_name || 'Produto',
      products,
      paymentMethod: body.payment_method || body.payment?.method || null,
      name: c.name,
      email: c.email,
      phone: c.phone_number || c.phone,
      doc: c.document,
      // geo — Kirvano pode mandar address
      city: addr.city || c.city || null,
      state: addr.state || c.state || stateFromDDD(c.phone_number || c.phone),
      zip: addr.zip || addr.zipcode || c.zip || null,
      country: addr.country || 'br',
      // UTM
      utmSource: utm.source || utm.src || body.utm_source,
      utmMedium: utm.medium || body.utm_medium,
      utmCampaign: utm.campaign || body.utm_campaign,
      utmContent: utm.content || body.utm_content,
      utmTerm: utm.term || body.utm_term,
      checkoutUrl,
      // Facebook IDs — Kirvano pode passar se configurado no checkout
      fbc: body.fbc || body.fb_click_id || extractFbc(checkoutUrl),
      fbp: body.fbp || body.fb_browser_id || null,
      orderedAt: body.created_at || null,
    }
  }

  if (gateway === 'hotmart') {
    const status = canonicalStatus(body.event, body.data?.purchase?.status || body.status)
    const buyer = body.data?.buyer || {}
    const addr = buyer.address || {}
    return {
      gateway,
      event: body.event || '',
      status,
      approved: status === 'APPROVED',
      abandoned: false,
      checkoutId: body.data?.purchase?.transaction || body.id,
      saleId: body.data?.purchase?.transaction || null,
      value: toNumber(body.data?.purchase?.price?.value),
      product: body.data?.product?.name || 'Produto',
      products: [],
      paymentMethod: body.data?.purchase?.payment?.type || null,
      name: buyer.name,
      email: buyer.email,
      phone: buyer.phone || buyer.checkout_phone,
      doc: buyer.document,
      city: addr.city || null,
      state: addr.state || null,
      zip: addr.zip || null,
      country: (addr.country || 'br').toLowerCase(),
      utmSource: body.data?.purchase?.origin?.utm_source,
      utmMedium: body.data?.purchase?.origin?.utm_medium,
      utmCampaign: body.data?.purchase?.origin?.utm_campaign,
      utmContent: body.data?.purchase?.origin?.utm_content,
      utmTerm: body.data?.purchase?.origin?.utm_term,
      checkoutUrl: null,
      fbc: null,
      fbp: null,
      orderedAt: body.creation_date ? new Date(body.creation_date).toISOString() : null,
    }
  }

  // genérico
  const status = canonicalStatus(body.event, body.status ?? (body.approved === false ? 'REFUSED' : 'APPROVED'))
  return {
    gateway,
    event: body.event || '',
    status,
    approved: status === 'APPROVED',
    abandoned: status === 'ABANDONED',
    checkoutId: body.event_id || body.id || crypto.randomUUID(),
    saleId: body.id || null,
    value: toNumber(body.value),
    product: body.product || 'Produto',
    products: [],
    paymentMethod: body.payment || null,
    name: body.name,
    email: body.email,
    phone: body.phone,
    doc: null,
    city: null,
    state: null,
    zip: null,
    country: 'br',
    utmCampaign: body.utm_campaign,
    checkoutUrl: body.checkout_url || null,
    fbc: null,
    fbp: null,
    orderedAt: null,
  }
}

// ─── CAPI ────────────────────────────────────────────────────────────────────
async function sendCAPI(o, req) {
  const pixelId = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN
  if (!pixelId || !token) return false

  const { fn, ln } = hashName(o.name)

  // Build contents array (todos os produtos, com order bumps)
  const contents = o.products?.length
    ? o.products.map((p) => ({
        id: p.id ? String(p.id) : (p.name || o.product),
        quantity: p.quantity || 1,
        item_price: toNumber(p.price ?? p.amount ?? p.total_price),
        title: p.name || undefined,
      }))
    : [{ id: o.product, quantity: 1, item_price: o.value }]

  const numItems = o.products?.length || 1
  const totalValue = o.value || contents.reduce((s, c) => s + (c.item_price * c.quantity), 0)

  // Captura client IP e UA dos headers reais do request (melhor sinal de correspondência)
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const clientUa = req.headers['user-agent'] || null

  const isAbandoned = o.abandoned
  const eventName = isAbandoned ? 'InitiateCheckout' : 'Purchase'

  const userData = {
    em: o.email ? [sha256(o.email)] : undefined,
    ph: o.phone ? [hashPhone(o.phone)] : undefined,
    fn: fn ? [fn] : undefined,
    ln: ln ? [ln] : undefined,
    external_id: o.checkoutId ? [sha256(String(o.checkoutId))] : undefined,
    // geo — hashed
    ct: o.city ? [sha256(o.city.trim().toLowerCase().replace(/\s+/g, ''))] : undefined,
    st: o.state ? [sha256(o.state.trim().toLowerCase())] : undefined,
    zp: o.zip ? [sha256(String(o.zip).replace(/\D/g, ''))] : undefined,
    country: o.country ? [sha256(o.country.toLowerCase())] : undefined,
    // Facebook IDs (NÃO hasheados — são opacos)
    fbc: o.fbc || undefined,
    fbp: o.fbp || undefined,
    // client signals
    client_ip_address: clientIp || undefined,
    client_user_agent: clientUa || undefined,
  }

  // Remove undefined keys
  Object.keys(userData).forEach((k) => userData[k] === undefined && delete userData[k])

  const customData = isAbandoned
    ? {
        content_type: 'product',
        contents,
        num_items: numItems,
        currency: 'BRL',
        value: totalValue,
      }
    : {
        content_type: 'product',
        contents,
        num_items: numItems,
        currency: 'BRL',
        value: totalValue,
        order_id: String(o.saleId || o.checkoutId),
      }

  const eventPayload = {
    event_name: eventName,
    event_time: o.orderedAt
      ? Math.floor(new Date(o.orderedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
    // event_id para deduplicação com o pixel do browser:
    // - Purchase usa saleId (único por transação)
    // - InitiateCheckout usa checkoutId
    event_id: String(o.saleId || o.checkoutId),
    action_source: 'website',
    event_source_url: o.checkoutUrl || undefined,
    user_data: userData,
    custom_data: customData,
  }

  const payload = {
    data: [eventPayload],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  }

  // Retry 2x com backoff exponencial (100ms → 400ms)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * Math.pow(4, attempt - 1)))
      const r = await fetch(
        `https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${token}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      )
      const j = await r.json()
      if (!j.error) return true
      // não retenta erros de config (código 100/190) — só erros de rede (5xx)
      if (j.error?.code && j.error.code < 500) return false
    } catch {
      // erro de rede → retenta
    }
  }
  return false
}

// ─── Supabase helpers ────────────────────────────────────────────────────────
function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}

async function upsertOrder(o, capiOk) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return

  const row = {
    checkout_id: String(o.checkoutId || ''),
    sale_id: o.saleId ? String(o.saleId) : null,
    event: o.event,
    status: o.status,
    value: o.value,
    currency: 'BRL',
    product: o.product,
    products: o.products?.length ? o.products : null,
    payment_method: o.paymentMethod,
    customer_name: o.name || null,
    customer_email: o.email || null,
    customer_phone: o.phone || null,
    customer_doc: o.doc || null,
    utm_source: o.utmSource || null,
    utm_medium: o.utmMedium || null,
    utm_campaign: o.utmCampaign || null,
    utm_content: o.utmContent || null,
    utm_term: o.utmTerm || null,
    checkout_url: o.checkoutUrl || null,
    capi_ok: capiOk,
    recovered: o.approved ? true : undefined,
    raw: o.raw || null,
    ordered_at: o.orderedAt ? new Date(o.orderedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k])

  try {
    await fetch(`${url}/rest/v1/kirvano_orders?on_conflict=checkout_id`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([row]),
    })
  } catch {}
}

async function logHit(entry) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return
  try {
    await fetch(`${url}/rest/v1/kirvano_webhook_logs`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify([entry]),
    })
  } catch {}
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const { gateway = 'kirvano', secret } = req.query
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || null

  const secretOk = !process.env.WEBHOOK_SECRET || secret === process.env.WEBHOOK_SECRET
  if (!secretOk) {
    await logHit({ gateway, event: null, status: null, ok: false, http_status: 401, secret_ok: false, capi_ok: false, message: 'segredo inválido', ip, created_at: new Date().toISOString() })
    return res.status(401).json({ error: 'invalid secret' })
  }

  let body = {}
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  } catch {
    await logHit({ gateway, event: null, status: null, ok: false, http_status: 400, secret_ok: true, capi_ok: false, message: 'JSON inválido', ip, created_at: new Date().toISOString() })
    return res.status(400).json({ error: 'invalid json' })
  }

  const o = parseOrder(gateway, body)
  o.raw = body

  // CAPI dispara em aprovada E em carrinho abandonado (InitiateCheckout)
  const shouldSendCAPI = o.approved || o.abandoned
  const capiOk = shouldSendCAPI ? await sendCAPI(o, req) : false

  await upsertOrder(o, capiOk)

  const eventLabel = o.approved ? 'Purchase' : o.abandoned ? 'InitiateCheckout' : o.status
  await logHit({
    gateway,
    event: o.event || gateway,
    status: o.status,
    ok: true,
    http_status: 200,
    secret_ok: true,
    capi_ok: capiOk,
    message: shouldSendCAPI
      ? `${eventLabel} → CAPI ${capiOk ? 'ok' : 'falhou/sem config'}`
      : `registrado (${o.status})`,
    ip,
    raw: body,
    created_at: new Date().toISOString(),
  })

  return res.status(200).json({ ok: true, status: o.status, capi: capiOk, event: eventLabel })
}
