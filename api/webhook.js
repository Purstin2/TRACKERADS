import crypto from 'node:crypto'

const sha256 = (v) =>
  v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined

// Telefone pro CAPI: só dígitos, com DDI.
const phoneHash = (v) => {
  if (!v) return undefined
  const d = String(v).replace(/\D/g, '')
  return d ? crypto.createHash('sha256').update(d).digest('hex') : undefined
}

// "R$ 169,80" | "169.80" | 169.8  →  169.80
function toNumber(v) {
  if (typeof v === 'number') return v
  if (!v) return 0
  const s = String(v).replace(/[^\d,.-]/g, '')
  // formato BR "1.234,56" → "1234.56"
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(s) || 0
}

// Mapeia o evento/status Kirvano num status canônico nosso.
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

/** Normaliza o payload de cada gateway num pedido comum (não dropa nada). */
function parseOrder(gateway, body) {
  if (gateway === 'kirvano') {
    const c = body.customer || body.client || {}
    const utm = body.utm || {}
    const products = Array.isArray(body.products) ? body.products : []
    const main = products.find((p) => !p.is_order_bump) || products[0] || {}
    const status = canonicalStatus(body.event, body.status)
    return {
      gateway,
      event: body.event || body.event_description || '',
      status,
      approved: status === 'APPROVED',
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
      utmSource: utm.source || utm.src || body.utm_source,
      utmMedium: utm.medium || body.utm_medium,
      utmCampaign: utm.campaign || body.utm_campaign,
      utmContent: utm.content || body.utm_content,
      utmTerm: utm.term || body.utm_term,
      checkoutUrl: body.checkout_url || body.cart_url || null,
      orderedAt: body.created_at || null,
    }
  }
  if (gateway === 'hotmart') {
    const status = canonicalStatus(body.event, body.data?.purchase?.status || body.status)
    const buyer = body.data?.buyer || {}
    return {
      gateway,
      event: body.event || '',
      status,
      approved: status === 'APPROVED',
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
      utmSource: body.data?.purchase?.origin?.utm_source,
      utmCampaign: body.data?.purchase?.origin?.utm_campaign,
      checkoutUrl: null,
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
    checkoutId: body.event_id || body.id || crypto.randomUUID(),
    saleId: body.id || null,
    value: toNumber(body.value),
    product: body.product || 'Produto',
    products: [],
    paymentMethod: body.payment || null,
    name: body.name,
    email: body.email,
    phone: body.phone,
    utmCampaign: body.utm_campaign,
    checkoutUrl: body.checkout_url || null,
    orderedAt: null,
  }
}

async function sendCAPI(o) {
  const pixelId = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN
  if (!pixelId || !token) return false
  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(o.saleId || o.checkoutId),
        action_source: 'website',
        user_data: {
          em: o.email ? [sha256(o.email)] : undefined,
          ph: o.phone ? [phoneHash(o.phone)] : undefined,
        },
        custom_data: { value: o.value, currency: 'BRL', content_name: o.product },
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  }
  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json()
    return !j.error
  } catch {
    return false
  }
}

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}

/** Upsert do pedido pela checkout_id (carrinho → venda evolui no mesmo registro). */
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
    recovered: o.approved ? true : undefined, // se aprovou agora, marca como recuperado (caso fosse carrinho)
    raw: o.raw || null,
    ordered_at: o.orderedAt ? new Date(o.orderedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  // remove undefined pra não sobrescrever colunas no upsert
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const { gateway = 'kirvano', secret } = req.query
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0] || null

  // valida segredo (mas registra a tentativa mesmo quando falha)
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

  // CAPI só dispara em venda aprovada
  const capiOk = o.approved ? await sendCAPI(o) : false

  // SEMPRE salva/atualiza o pedido (aprovada, recusada, pendente, abandonado...)
  await upsertOrder(o, capiOk)

  await logHit({
    gateway,
    event: o.event || gateway,
    status: o.status,
    ok: true,
    http_status: 200,
    secret_ok: true,
    capi_ok: capiOk,
    message: o.approved ? `aprovada → CAPI ${capiOk ? 'ok' : 'falhou/sem config'}` : `registrado (${o.status})`,
    ip,
    raw: body,
    created_at: new Date().toISOString(),
  })

  return res.status(200).json({ ok: true, status: o.status, capi: capiOk })
}
