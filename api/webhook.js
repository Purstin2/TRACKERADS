import crypto from 'node:crypto'

// ─── normalização (regras EXATAS do Meta antes de hashear) ───────────────────
// Remove acentos: "joão" → "joao". O Meta normaliza assim; se mandarmos com
// acento o hash não casa e o sinal é descartado (foi o que derrubava o match rate).
const stripAccents = (v) =>
  String(v).normalize('NFD').replace(/[̀-ͯ]/g, '')

const norm = (v) => stripAccents(String(v).trim().toLowerCase())

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex')

// hash genérico de texto (email, nome, cidade...) — já normalizado
const sha256 = (v) => (v ? sha(norm(v)) : undefined)

// Email: minúsculo + trim + remove acentos (Gmail dots ficam — Meta não exige tirar)
const hashEmail = (v) => {
  if (!v) return undefined
  const e = norm(v)
  return e.includes('@') ? sha(e) : undefined
}

// Phone E.164 só dígitos: DDI 55 + DDD + número. Remove o 0 de operadora se houver.
const hashPhone = (v) => {
  if (!v) return undefined
  let d = String(v).replace(/\D/g, '')
  if (!d) return undefined
  if (d.length <= 11) d = '55' + d          // sem DDI → assume Brasil
  return sha(d)
}

// Nome: separa primeiro/último, normaliza cada um. "João da Silva" → fn=joao ln=silva
function hashName(fullName) {
  if (!fullName) return {}
  const parts = norm(fullName).split(/\s+/).filter(Boolean)
  if (!parts.length) return {}
  const fn = sha(parts[0])
  const ln = parts.length > 1 ? sha(parts[parts.length - 1]) : undefined
  return { fn, ln }
}

// CPF/CNPJ → só dígitos → hash. Identificador forte pro external_id.
const hashDoc = (v) => {
  if (!v) return undefined
  const d = String(v).replace(/\D/g, '')
  return d.length >= 11 ? sha(d) : undefined
}

// Cidade/estado/país: sem espaço, sem acento, minúsculo. CEP só dígitos.
const hashCity = (v) => (v ? sha(norm(v).replace(/\s+/g, '')) : undefined)
const hashState = (v) => (v ? sha(norm(v).replace(/\s+/g, '')) : undefined)
const hashZip = (v) => {
  const d = String(v || '').replace(/\D/g, '')
  return d ? sha(d) : undefined
}
const hashCountry = (v) => {
  // país em ISO-2 minúsculo: "Brasil"/"BR"/"brazil" → "br"
  let c = norm(v || 'br')
  if (c === 'brasil' || c === 'brazil') c = 'br'
  return sha(c.slice(0, 2))
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

// fbc é o sinal de clique mais forte. A Kirvano normalmente NÃO manda o _fbc
// pronto — só o _fbp. Então reconstruímos a partir do fbclid achado em qualquer
// lugar: cookie _fbc pronto, campo fbc, ou fbclid solto numa URL/campo.
// Formato Meta: fb.1.<timestamp_ms>.<fbclid>
function buildFbc({ rawFbc, fbclid, createdAt }) {
  // já veio pronto e no formato certo?
  if (rawFbc && /^fb\.1\.\d+\./.test(rawFbc)) return rawFbc
  // veio um _fbc de cookie mas sem prefixo? tenta usar como fbclid
  const id = fbclid || (rawFbc && !rawFbc.startsWith('fb.') ? rawFbc : null)
  if (!id) return null
  const ts = createdAt ? new Date(createdAt).getTime() : Date.now()
  return `fb.1.${ts || Date.now()}.${id}`
}

// procura fbclid em URL (?fbclid=) ou string solta
function findFbclid(...candidates) {
  for (const c of candidates) {
    if (!c) continue
    const s = String(c)
    try {
      const u = new URL(s)
      const q = u.searchParams.get('fbclid')
      if (q) return q
    } catch {
      // não é URL — vê se é o próprio fbclid (heurística: longo, base64-ish)
      if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s
    }
  }
  return null
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
    const cookies = body.cookies || {}
    const products = Array.isArray(body.products) ? body.products : []
    const main = products.find((p) => !p.is_order_bump) || products[0] || {}
    const status = canonicalStatus(body.event, body.status)
    const phone = c.phone_number || c.phone
    // IP real do comprador (Kirvano manda body.ip)
    const buyerIp = body.ip || null

    // event_source_url: a Kirvano não manda checkout_url no payload de venda,
    // mas dá pra montar do offer_id (URL real da oferta) — melhor que vazio.
    const offerId = main.offer_id || products[0]?.offer_id
    const checkoutUrl =
      body.checkout_url ||
      body.cart_url ||
      (offerId && process.env.CHECKOUT_BASE ? `${process.env.CHECKOUT_BASE}/${offerId}` : null) ||
      (offerId ? `https://pay.kirvano.com/${offerId}` : null)

    // fbc/fbp: o fbtrack.js injeta esses params na URL do checkout; a Kirvano
    // pode repassá-los em cookies.*, body.*, body.tracking.* ou body.utm.*.
    const trk = body.tracking || body.src || {}
    const fbcRaw =
      cookies.fbc || cookies._fbc || body.fbc || body.fb_click_id || trk.fbc || utm.fbc
    const fbpRaw =
      cookies.fbp || cookies._fbp || body.fbp || body.fb_browser_id || trk.fbp || utm.fbp
    const fbclid = findFbclid(
      cookies.fbclid, body.fbclid, trk.fbclid, utm.fbclid, fbcRaw, checkoutUrl, body.src_url, body.referer
    )
    const fbc = buildFbc({ rawFbc: fbcRaw, fbclid, createdAt: body.created_at })

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
      paymentMethod: body.payment?.method || body.payment_method || null,
      name: c.name,
      email: c.email,
      phone,
      doc: c.document,
      buyerIp,
      // geo — Kirvano manda address (city/state podem ser null, fallback p/ DDD)
      city: addr.city || c.city || null,
      state: addr.state || c.state || stateFromDDD(phone),
      zip: addr.zipcode || addr.zip || c.zip || null,
      country: addr.country || 'br',
      // UTM
      utmSource: utm.source || utm.src || body.utm_source,
      utmMedium: utm.medium || body.utm_medium,
      utmCampaign: utm.campaign || body.utm_campaign,
      utmContent: utm.content || body.utm_content,
      utmTerm: utm.term || body.utm_term,
      checkoutUrl,
      // Facebook IDs
      fbc,
      fbp: fbpRaw && /^fb\.1\./.test(fbpRaw) ? fbpRaw : (fbpRaw ? `fb.1.${Date.now()}.${fbpRaw}` : null),
      // Google click id (rastreio próprio / futuro Google Ads)
      gclid: cookies.gclid || body.gclid || trk.gclid || utm.gclid || null,
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

  // IP real do comprador vem no body.ip (Kirvano); fallback para header do request
  const clientIp = o.buyerIp || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const clientUa = req.headers['user-agent'] || null

  const isAbandoned = o.abandoned
  const eventName = isAbandoned ? 'InitiateCheckout' : 'Purchase'

  // external_id: identificadores fortes e estáveis do mesmo usuário.
  // CPF é o mais forte (único por pessoa); checkout_id ajuda a amarrar a sessão.
  const externalIds = []
  const docHash = hashDoc(o.doc)
  if (docHash) externalIds.push(docHash)
  if (o.checkoutId) externalIds.push(sha(norm(String(o.checkoutId))))

  const emailHash = hashEmail(o.email)
  const phoneHashed = hashPhone(o.phone)
  const ctHash = hashCity(o.city)
  const stHash = hashState(o.state)
  const zpHash = hashZip(o.zip)
  const countryHash = hashCountry(o.country)

  const userData = {
    em: emailHash ? [emailHash] : undefined,
    ph: phoneHashed ? [phoneHashed] : undefined,
    fn: fn ? [fn] : undefined,
    ln: ln ? [ln] : undefined,
    external_id: externalIds.length ? externalIds : undefined,
    // geo — hashed (normalização: sem acento/espaço, CEP só dígitos, país ISO-2)
    ct: ctHash ? [ctHash] : undefined,
    st: stHash ? [stHash] : undefined,
    zp: zpHash ? [zpHash] : undefined,
    country: countryHash ? [countryHash] : undefined,
    // Facebook IDs (NÃO hasheados — são tokens opacos)
    fbc: o.fbc || undefined,
    fbp: o.fbp || undefined,
    // sinais de cliente (sobem o match rate sem precisar de PII extra)
    client_ip_address: clientIp || undefined,
    client_user_agent: clientUa || undefined,
  }

  // Remove undefined keys
  Object.keys(userData).forEach((k) => userData[k] === undefined && delete userData[k])

  const contentIds = contents.map((c) => c.id)
  const customData = {
    content_type: 'product',
    content_ids: contentIds,
    content_name: o.product,
    contents,
    num_items: numItems,
    currency: 'BRL',
    value: totalValue,
    ...(isAbandoned ? {} : { order_id: String(o.saleId || o.checkoutId) }),
    // rastreio próprio (não é sinal de match, mas fica registrado no evento)
    ...(o.gclid ? { gclid: o.gclid } : {}),
  }

  // event_time: usa o horário real da Kirvano, mas o Meta só aceita eventos
  // dos últimos 7 dias — se vier algo fora da janela, usa agora.
  const now = Math.floor(Date.now() / 1000)
  let eventTime = o.orderedAt ? Math.floor(new Date(o.orderedAt).getTime() / 1000) : now
  if (!eventTime || now - eventTime > 7 * 24 * 3600 || eventTime > now + 60) eventTime = now

  const eventPayload = {
    event_name: eventName,
    event_time: eventTime,
    // event_id = sale_id (Purchase) / checkout_id (InitiateCheckout).
    // Único por transação → dedup automática caso futuramente haja pixel no browser.
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
