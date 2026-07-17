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

// Phone E.164 só dígitos. defaultDdi vem do país do pedido (BR 55, PT 351, CL 56...).
// Gateways como a Hotmart já mandam com DDI ("351911886395") — não duplicar.
const KNOWN_DDIS = ['351', '598', '595', '593', '591', '55', '54', '57', '56', '52', '51', '34', '1']
function normalizePhone(v, defaultDdi) {
  if (!v) return undefined
  let d = String(v).replace(/\D/g, '')
  if (!d) return undefined
  if (d.startsWith('00')) d = d.slice(2)                      // 00 internacional → tira
  const ddi = defaultDdi || '55'
  // já começa com o DDI do país? mantém.
  if (d.startsWith(ddi) && d.length > ddi.length + 7) return d
  // já começa com algum DDI conhecido (telefone internacional)? mantém.
  if (KNOWN_DDIS.some((p) => d.startsWith(p) && d.length > p.length + 7)) return d
  // sem DDI: prefixa o do país
  return ddi + d
}
const hashPhone = (v, defaultDdi) => {
  const d = normalizePhone(v, defaultDdi)
  return d ? sha(d) : undefined
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
// país → ISO-2 minúsculo. Aceita nome ("Brasil"/"Chile") ou ISO ("BR"/"PT"/"CL").
const COUNTRY_NAME_TO_ISO = {
  brasil: 'br', brazil: 'br', portugal: 'pt', chile: 'cl', espanha: 'es', spain: 'es',
  espana: 'es', mexico: 'mx', argentina: 'ar', colombia: 'co', peru: 'pe',
  'estados unidos': 'us', 'united states': 'us', uruguai: 'uy', uruguay: 'uy',
  paraguai: 'py', paraguay: 'py', equador: 'ec', ecuador: 'ec', bolivia: 'bo',
}
function isoCountry(v) {
  const c = norm(v || 'br')
  if (COUNTRY_NAME_TO_ISO[c]) return COUNTRY_NAME_TO_ISO[c]
  return c.slice(0, 2)   // já é ISO-2
}
const hashCountry = (v) => sha(isoCountry(v))

// país ISO-2 → DDI do telefone (LATAM + ibéria)
const DDI_BY_ISO = {
  br: '55', pt: '351', es: '34', cl: '56', mx: '52', ar: '54', co: '57',
  pe: '51', uy: '598', py: '595', ec: '593', bo: '591', us: '1',
}
const ddiOf = (iso) => DDI_BY_ISO[iso] || '55'

// país ISO-2 → moeda (fallback se o gateway não mandar a moeda)
const CURRENCY_BY_ISO = {
  br: 'BRL', pt: 'EUR', es: 'EUR', cl: 'CLP', mx: 'MXN', ar: 'ARS', co: 'COP',
  pe: 'PEN', uy: 'UYU', py: 'PYG', ec: 'USD', bo: 'BOB', us: 'USD',
}
const currencyOf = (iso) => CURRENCY_BY_ISO[iso] || 'BRL'

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

// A Kirvano às vezes manda UTM como JSON array duplicado ('["FB","FB"]') e usa
// chaves com prefixo utm_ (utm_source) além de src. Normaliza p/ string limpa.
function cleanUtm(v) {
  if (v == null) return null
  let s = String(v).trim()
  if (!s) return null
  if (s[0] === '[') {
    try {
      const arr = JSON.parse(s)
      if (Array.isArray(arr) && arr.length) s = String(arr[0] ?? '').trim()
    } catch {}
  }
  return s || null
}
// pega o 1º valor não-vazio (ignora '' e arrays vazios), já normalizado
function pickUtm(...vals) {
  for (const v of vals) {
    const c = cleanUtm(v)
    if (c) return c
  }
  return null
}

// Kiwify: order_status → status canônico. Explícito de propósito — os nomes dela
// não casam por substring ("chargedback" não contém "chargeback", "waiting_payment"
// não contém "pending"), então adivinhar aqui esconderia chargeback e pendente.
const KIWIFY_STATUS = {
  paid: 'APPROVED',
  approved: 'APPROVED',
  waiting_payment: 'PENDING',
  refused: 'REFUSED',
  refunded: 'REFUNDED',
  chargedback: 'CHARGEBACK',
  chargeback: 'CHARGEBACK',
}

/** Valor em CENTAVOS (Kiwify) → reais. "4990" → 49.90 */
function centsToNumber(v) {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[^\d-]/g, ''), 10)
  return isNaN(n) ? 0 : n / 100
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

// Extrai um campo de um blob de tracking da Hotmart (campo src/sck/xcod).
// Aceita "fbc:VALOR|fbp:VALOR|fbclid:VALOR", JSON, ou "fbc=VALOR;fbp=VALOR".
function parseTrkField(blob, field) {
  if (!blob) return null
  const s = String(blob)
  // tenta JSON
  try {
    const j = JSON.parse(s)
    if (j && j[field]) return j[field]
  } catch {}
  // pares chave:valor ou chave=valor separados por | ; , &
  const m = s.match(new RegExp(field + '[:=]([^|;,&]+)'))
  return m ? m[1].trim() : null
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
      offerId: offerId || null,
      productId: main.id ? String(main.id) : null,
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
      country: isoCountry(addr.country || c.country || 'br'),
      // moeda: usa a que a Kirvano mandar, senão deriva do país
      currency: (body.currency || '').toUpperCase() || null,
      // UTM
      utmSource: pickUtm(utm.source, utm.utm_source, utm.src, body.utm_source),
      utmMedium: pickUtm(utm.medium, utm.utm_medium, body.utm_medium),
      utmCampaign: pickUtm(utm.campaign, utm.utm_campaign, body.utm_campaign),
      utmContent: pickUtm(utm.content, utm.utm_content, body.utm_content),
      utmTerm: pickUtm(utm.term, utm.utm_term, body.utm_term),
      checkoutUrl,
      // Facebook IDs
      fbc,
      fbp: fbpRaw && /^fb\.1\./.test(fbpRaw) ? fbpRaw : (fbpRaw ? `fb.1.${Date.now()}.${fbpRaw}` : null),
      // Google click id (rastreio próprio / futuro Google Ads)
      gclid: cookies.gclid || body.gclid || trk.gclid || utm.gclid || null,
      // TikTok: ttclid (clique) + ttp (cookie _ttp) pro Events API server-side
      ttclid: cookies.ttclid || body.ttclid || trk.ttclid || null,
      ttp: cookies.ttp || body.ttp || trk.ttp || null,
      orderedAt: brtNaiveToISO(body.created_at),
    }
  }

  /* ── Kiwify ──
   * Três armadilhas que o parser genérico não trata e por isso este bloco existe:
   *  1) DINHEIRO EM CENTAVOS: Commissions.charge_amount vem string ("4990" = R$49,90).
   *     Passar direto pro toNumber daria R$4.990 — 100× o faturamento real.
   *  2) STATUS COM NOME PRÓPRIO: order_status usa "chargedback" (com D), que NÃO casa
   *     com o `includes('CHARGEBACK')` do canonicalStatus → chargeback viraria PENDING
   *     e sumiria do painel. Por isso o mapa abaixo é explícito.
   *  3) UM PRODUTO POR PEDIDO: a Kiwify não manda products[]; montamos o array no
   *     formato da Kirvano pra aba Taxas e o dashboard contarem itens igual.
   * checkout_id = order_id, que é estável no ciclo do pedido (aprovado → reembolso →
   * chargeback), então o upsert atualiza a MESMA linha — sem venda duplicada. */
  if (gateway === 'kiwify') {
    const c = body.Customer || {}
    const p = body.Product || {}
    const com = body.Commissions || {}
    const trk = body.TrackingParameters || {}
    const st = String(body.order_status || '').toLowerCase()
    const ev = String(body.webhook_event_type || '').toLowerCase()
    const status =
      KIWIFY_STATUS[st] ||
      (ev.includes('chargeback') ? 'CHARGEBACK'
        : ev.includes('refund') ? 'REFUNDED'
        : ev.includes('reject') || ev.includes('refus') ? 'REFUSED'
        : ev.includes('approved') ? 'APPROVED'
        : 'PENDING')
    // charge_amount = o que o cliente pagou (equivale ao total_price da Kirvano).
    // my_commission é o líquido dele e NÃO serve como faturamento bruto.
    const value = centsToNumber(com.charge_amount ?? com.product_base_price)
    const productId = p.product_id ? String(p.product_id) : null
    const productName = p.product_name || body.product_name || 'Produto'
    const phone = c.mobile || c.phone || null
    return {
      gateway,
      event: body.webhook_event_type || '',
      status,
      approved: status === 'APPROVED',
      abandoned: false,
      offerId: productId,
      productId,
      checkoutId: body.order_id || body.order_ref,
      saleId: body.order_ref || body.order_id || null,
      value,
      product: productName,
      products: [{ id: productId, name: productName, price: value, is_order_bump: false }],
      paymentMethod: String(body.payment_method || '').toUpperCase() || null,
      name: c.full_name || c.first_name || null,
      email: c.email || null,
      phone,
      doc: c.CPF || c.cpf || null,
      buyerIp: c.ip || null,
      city: c.city || null,
      state: c.state || stateFromDDD(phone),
      zip: c.zipcode || c.zip || null,
      country: isoCountry(c.country || 'br'),
      currency: String(com.currency || com.product_base_price_currency || '').toUpperCase() || null,
      utmSource: pickUtm(trk.utm_source, trk.src),
      utmMedium: pickUtm(trk.utm_medium),
      utmCampaign: pickUtm(trk.utm_campaign),
      utmContent: pickUtm(trk.utm_content),
      utmTerm: pickUtm(trk.utm_term),
      checkoutUrl: body.access_url || null,
      fbc: buildFbc({ rawFbc: trk.fbc || body.fbc, fbclid: findFbclid(trk.fbclid, body.fbclid, trk.src, trk.sck), createdAt: body.created_at }),
      fbp: trk.fbp && /^fb\.1\./.test(trk.fbp) ? trk.fbp : (trk.fbp ? `fb.1.${Date.now()}.${trk.fbp}` : null),
      gclid: trk.gclid || null,
      ttclid: trk.ttclid || null,
      ttp: trk.ttp || null,
      // approved_date é quando o dinheiro entrou; created_at é quando o pedido nasceu.
      // Pra venda aprovada o que vale pro caixa/dia é a aprovação.
      orderedAt: brtNaiveToISO(body.approved_date || body.created_at),
    }
  }

  if (gateway === 'hotmart') {
    // Hotmart 2.0.0: tudo aninhado em body.data.* (campos confirmados em payload real)
    const d = body.data || {}
    const buyer = d.buyer || {}
    const purchase = d.purchase || {}
    const addr = buyer.address || {}
    const origin = purchase.origin || {}     // src/sck/xcod = NOME da campanha, não fbc
    const product = d.product || {}
    const price = purchase.price || {}
    const offer = purchase.offer || {}
    const status = canonicalStatus(body.event, purchase.status || body.status)
    const abandoned = String(body.event || '').toUpperCase().includes('ABANDON')

    // País ISO-2: prioriza purchase.checkout_country.iso, depois address.country_iso.
    const iso = isoCountry(
      purchase.checkout_country?.iso || addr.country_iso || addr.country || 'br'
    )

    // Nome: Hotmart JÁ manda first_name/last_name separados — usa direto.
    const firstName = buyer.first_name || null
    const lastName = buyer.last_name || null

    // fbc/fbp via origin.src/sck/xcod SÓ se você empurrar "fbc:...|fbp:..." pela
    // URL do anúncio. No payload normal, src="FB" e sck/xcod são nomes de campanha
    // (sem fbc/fbp) — então geralmente fica null aqui. (Empty string vira null.)
    const trkBlob = [origin.src, origin.sck, origin.xcod].filter(Boolean).join('|')
    const fbcRaw = origin.fbc || parseTrkField(trkBlob, 'fbc') || null
    const fbpRaw = origin.fbp || parseTrkField(trkBlob, 'fbp') || null
    const fbclid = findFbclid(origin.fbclid, parseTrkField(trkBlob, 'fbclid'))
    const fbc = buildFbc({ rawFbc: fbcRaw, fbclid, createdAt: body.creation_date })
    // se sck/xcod carregam o blob de fbc/fbp (fbtrack.js empurrou), não usar como
    // nome de campanha — pega o utm_campaign real. Senão, sck/xcod É a campanha.
    const trkHasFb = /fb[cp]:/.test(trkBlob)
    const campaign = origin.utm_campaign || (trkHasFb ? null : (origin.xcod || origin.sck)) || null

    return {
      gateway,
      event: body.event || '',
      status,
      approved: status === 'APPROVED',
      abandoned,
      offerId: offer.code || null,
      productId: product.id ? String(product.id) : null,
      checkoutId: purchase.transaction || body.id,
      saleId: purchase.transaction || null,
      value: toNumber(price.value),
      product: product.name || offer.name || 'Produto',
      products: [{ id: product.id ? String(product.id) : (offer.code || product.name), name: product.name, price: price.value, is_order_bump: !!purchase.order_bump?.is_order_bump }],
      paymentMethod: purchase.payment?.type || null,
      name: buyer.name,
      firstName,
      lastName,
      email: buyer.email,
      phone: buyer.checkout_phone || buyer.phone || null,
      doc: buyer.document || null,                 // Hotmart costuma mandar "" → vira null
      buyerIp: d.ip || buyer.ip || null,
      city: addr.city || null,                     // costuma vir "" → null
      state: addr.state || null,
      zip: addr.zipcode || addr.zip_code || null,  // costuma vir "" → null
      country: iso,
      currency: (price.currency_value || '').toUpperCase() || null,
      utmSource: trkHasFb ? (origin.utm_source || 'FB') : (origin.src || null),
      utmMedium: origin.utm_medium || null,
      utmCampaign: campaign,
      utmContent: origin.utm_content || null,
      utmTerm: origin.utm_term || null,
      checkoutUrl: offer.code ? `https://pay.hotmart.com/${offer.code}` : null,
      fbc,
      fbp: fbpRaw && /^fb\.1\./.test(fbpRaw) ? fbpRaw : (fbpRaw ? `fb.1.${Date.now()}.${fbpRaw}` : null),
      gclid: origin.gclid || parseTrkField(trkBlob, 'gclid') || null,
      ttclid: origin.ttclid || parseTrkField(trkBlob, 'ttclid') || null,
      ttp: origin.ttp || parseTrkField(trkBlob, 'ttp') || null,
      orderedAt: purchase.order_date
        ? new Date(purchase.order_date).toISOString()
        : (body.creation_date ? new Date(body.creation_date).toISOString() : null),
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

// Resolve qual pixel/token usar pra esta venda: consulta pixel_routes pela
// offer_id/product_id. Se NÃO achar rota, retorna null → NÃO envia nada.
// (Sem fallback pro pixel padrão: um offer_id errado não pode contaminar outro
// pixel. Erro de config vira "evento faltando" — visível nos Logs — e não um
// evento no pixel errado. Pra ter um catch-all, crie uma rota match_type='any'.)
// remove espaços/quebras de linha que vazam de copy-paste — o Meta rejeita
// IDs/tokens/test codes com \n ou espaço.
const sanitize = (v) => (v == null ? null : String(v).replace(/\s+/g, '') || null)

// A Kirvano manda data/hora em BRT (UTC-3) SEM marcar o fuso ("2026-06-19 00:16:32").
// Sem isto, o servidor (UTC) interpreta como UTC e grava 3h adiantado. Assume BRT.
function brtNaiveToISO(s) {
  if (!s) return null
  const str = String(s).trim()
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? str : str.replace(' ', 'T') + '-03:00'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

async function resolvePixel(o) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null

  // candidatos de match, em ordem de prioridade
  const keys = [o.offerId, o.productId].filter(Boolean).map(String)
  if (!keys.length) return null

  try {
    // busca rotas ativas que batam com offer_id OU product_id (ou match_type='any')
    const inList = keys.map((k) => `"${k}"`).join(',')
    const q = `${url}/rest/v1/pixel_routes?active=eq.true&or=(offer_id.in.(${inList}),match_type.eq.any)&select=offer_id,match_type,pixel_id,capi_token,test_code,gateways,fire_on_pix&order=match_type.asc`
    const r = await fetch(q, { headers: sbHeaders(key) })
    const rows = await r.json()
    if (!Array.isArray(rows) || !rows.length) return null

    // prioridade: match exato de offer/product > 'any'. E respeita gateways[] se setado.
    const exact = rows.find(
      (row) =>
        row.match_type !== 'any' &&
        keys.includes(String(row.offer_id)) &&
        (!row.gateways || !row.gateways.length || row.gateways.includes(o.gateway))
    )
    const any = rows.find(
      (row) => row.match_type === 'any' && (!row.gateways || !row.gateways.length || row.gateways.includes(o.gateway))
    )
    const hit = exact || any
    if (!hit || !hit.pixel_id || !hit.capi_token) return null
    return { pixelId: sanitize(hit.pixel_id), token: sanitize(hit.capi_token), testCode: sanitize(hit.test_code), source: exact ? 'offer' : 'any', fireOnPix: !!hit.fire_on_pix }
  } catch {
    return null
  }
}

// ─── CAPI ────────────────────────────────────────────────────────────────────
// eventName é decidido pelo handler (Purchase / InitiateCheckout / AddPaymentInfo).
async function sendCAPI(o, req, route, eventName) {
  const pixelId = route?.pixelId
  const token = route?.token
  if (!pixelId || !token) return false

  // Nome: se o gateway já separou (Hotmart manda first_name/last_name), usa isso
  // — mais confiável que quebrar o nome cheio. Senão, divide o name.
  const fn = o.firstName ? sha256(o.firstName) : hashName(o.name).fn
  const ln = o.lastName ? sha256(o.lastName) : hashName(o.name).ln

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

  const isPurchase = eventName === 'Purchase'

  // external_id: identificadores fortes e estáveis do mesmo usuário.
  // CPF é o mais forte (único por pessoa); checkout_id ajuda a amarrar a sessão.
  const externalIds = []
  const docHash = hashDoc(o.doc)
  if (docHash) externalIds.push(docHash)
  if (o.checkoutId) externalIds.push(sha(norm(String(o.checkoutId))))

  const iso = isoCountry(o.country)
  const emailHash = hashEmail(o.email)
  const phoneHashed = hashPhone(o.phone, ddiOf(iso))   // DDI certo: BR 55 / PT 351
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
  // moeda: a que o gateway mandar, senão deriva do país (BR→BRL, PT→EUR)
  const currency = o.currency || currencyOf(iso)
  const customData = {
    content_type: 'product',
    content_ids: contentIds,
    content_name: o.product,
    contents,
    num_items: numItems,
    currency,
    value: totalValue,
    ...(isPurchase ? { order_id: String(o.saleId || o.checkoutId) } : {}),
    // rastreio próprio (não é sinal de match, mas fica registrado no evento)
    ...(o.gclid ? { gclid: o.gclid } : {}),
  }

  // event_time: usa o horário real da Kirvano, mas o Meta só aceita eventos
  // dos últimos 7 dias — se vier algo fora da janela, usa agora.
  const now = Math.floor(Date.now() / 1000)
  let eventTime = o.orderedAt ? Math.floor(new Date(o.orderedAt).getTime() / 1000) : now
  if (!eventTime || now - eventTime > 7 * 24 * 3600 || eventTime > now + 60) eventTime = now

  // event_id estável p/ dedup: Purchase = sale_id (1 por venda); demais = checkout_id
  // (1 por carrinho). Nomes diferentes (InitiateCheckout vs AddPaymentInfo) não colidem
  // mesmo com o mesmo checkout_id — Meta dedupa por (nome + event_id). Assim os vários
  // webhooks do mesmo checkout contam como 1 de cada etapa.
  const eventId = isPurchase
    ? String(o.saleId || o.checkoutId)
    : `${eventName}_${String(o.checkoutId || o.saleId)}`
  const eventPayload = {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventId,
    action_source: 'website',
    event_source_url: o.checkoutUrl || undefined,
    user_data: userData,
    custom_data: customData,
  }

  const testCode = route?.testCode || sanitize(process.env.META_TEST_EVENT_CODE)
  const payload = {
    data: [eventPayload],
    ...(testCode ? { test_event_code: testCode } : {}),
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

// ─── TikTok Events API (server-side, igual o CAPI do Meta) ───────────────────
// Dispara CompletePayment na venda APROVADA. Só roda se TIKTOK_ACCESS_TOKEN +
// TIKTOK_PIXEL_CODE estiverem na env (sem isso, é no-op → seguro deployar antes).
// Casa por ttclid/ttp + email/telefone hasheados (SHA-256), igual o Meta.
async function sendTikTok(o, req) {
  const token = process.env.TIKTOK_ACCESS_TOKEN
  const pixelCode = process.env.TIKTOK_PIXEL_CODE
  if (!token || !pixelCode) return false

  const iso = isoCountry(o.country)
  const clientIp = o.buyerIp || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const clientUa = req.headers['user-agent'] || null
  const currency = o.currency || currencyOf(iso)
  const value = o.value || 0

  // TikTok quer telefone em E.164 COM "+" (o Meta quer sem) → hash próprio.
  const phoneDigits = normalizePhone(o.phone, ddiOf(iso))
  const user = {
    email: hashEmail(o.email),
    phone: phoneDigits ? sha('+' + phoneDigits) : undefined,
    external_id: hashDoc(o.doc) || (o.checkoutId ? sha(norm(String(o.checkoutId))) : undefined),
    ttclid: o.ttclid || undefined, // clique do TikTok (não hasheado)
    ttp: o.ttp || undefined,       // cookie _ttp (não hasheado)
    ip: clientIp || undefined,
    user_agent: clientUa || undefined,
  }
  Object.keys(user).forEach((k) => user[k] === undefined && delete user[k])

  const now = Math.floor(Date.now() / 1000)
  let eventTime = o.orderedAt ? Math.floor(new Date(o.orderedAt).getTime() / 1000) : now
  if (!eventTime || eventTime > now + 60) eventTime = now

  const contents = (o.products?.length ? o.products : [{ id: o.product, name: o.product, price: value }]).map((p) => ({
    content_id: String(p.id || p.name || o.product),
    content_name: p.name || o.product,
    price: toNumber(p.price ?? p.amount ?? p.total_price) || value,
    quantity: p.quantity || 1,
  }))

  const payload = {
    event_source: 'web',
    event_source_id: pixelCode,
    data: [{
      event: 'CompletePayment',
      event_time: eventTime,
      event_id: String(o.saleId || o.checkoutId), // dedup
      user,
      properties: { currency, value, content_type: 'product', contents },
      ...(o.checkoutUrl ? { page: { url: o.checkoutUrl } } : {}),
    }],
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * Math.pow(4, attempt - 1)))
      const r = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (j.code === 0) return true       // sucesso
      if (j.code && j.code !== 0) return false // erro de config → não retenta
    } catch {
      // rede → retenta
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
    gateway: o.gateway || null, // de onde veio a venda (kirvano/kiwify/hotmart)
    event: o.event,
    status: o.status,
    value: o.value,
    // moeda real do pedido (a que o gateway mandou, senão deriva do país) — antes
    // gravava 'BRL' fixo, o que distorcia pedidos PT/CL/ES no Financeiro.
    currency: o.currency || currencyOf(isoCountry(o.country)),
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
    gclid: o.gclid || null, // clique do Google → usado no offline conversion import
    capi_ok: capiOk,
    recovered: o.approved ? true : undefined,
    // se aprovou, tira da fila de recuperação (não manda WhatsApp pra quem já comprou)
    wa_status: o.approved ? 'converted' : undefined,
    raw: o.raw || null,
    ordered_at: o.orderedAt ? new Date(o.orderedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k])

  // Antes o erro era engolido: um `fetch` com HTTP 400 (coluna faltando, tipo errado)
  // NÃO lança, então a venda simplesmente não era gravada e ninguém ficava sabendo.
  // Agora a falha vira log — é o que dá pra ver quando o painel "perde" vendas.
  try {
    const r = await fetch(`${url}/rest/v1/kirvano_orders?on_conflict=checkout_id`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([row]),
    })
    if (!r.ok) {
      const msg = await r.text().catch(() => '')
      await logHit({
        gateway: o.gateway, event: o.event, status: o.status, ok: false,
        http_status: r.status, secret_ok: true, capi_ok: capiOk,
        message: `FALHA AO GRAVAR PEDIDO: ${String(msg).slice(0, 300)}`,
        created_at: new Date().toISOString(),
      })
    }
  } catch (e) {
    await logHit({
      gateway: o.gateway, event: o.event, status: o.status, ok: false,
      http_status: 0, secret_ok: true, capi_ok: capiOk,
      message: `FALHA AO GRAVAR PEDIDO (rede): ${String(e?.message || e).slice(0, 300)}`,
      created_at: new Date().toISOString(),
    }).catch(() => {})
  }
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

  // Autenticação por gateway:
  // - Kirvano/genérico: ?secret= na URL == WEBHOOK_SECRET
  // - Hotmart: header X-HOTMART-HOTTOK (ou body.hottok) == HOTMART_HOTTOK
  let secretOk
  if (gateway === 'hotmart') {
    const hottok = req.headers['x-hotmart-hottok'] || (typeof req.body === 'object' ? req.body?.hottok : null)
    secretOk = !process.env.HOTMART_HOTTOK || hottok === process.env.HOTMART_HOTTOK
  } else {
    secretOk = !process.env.WEBHOOK_SECRET || secret === process.env.WEBHOOK_SECRET
  }
  if (!secretOk) {
    await logHit({ gateway, event: null, status: null, ok: false, http_status: 401, secret_ok: false, capi_ok: false, message: 'token/segredo inválido', ip, created_at: new Date().toISOString() })
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

  // resolve qual pixel/token usar (por oferta) antes de mandar
  const route = await resolvePixel(o)

  // Funil server-side (cada etapa = 1 evento, sem sobrepor o browser):
  //   APROVADA           → Purchase
  //   PIX gerado/RECUSADA → InitiateCheckout + AddPaymentInfo (chegou no checkout E
  //                          tentou pagar) — dedup por event_id, 1 de cada por carrinho
  //   EXPIRADA/ABANDONADA → InitiateCheckout (chegou no checkout, não pagou)
  // (O clique no botão vira AddToCart no browser — não passa por aqui.)
  // fire_on_pix (opcional): em mercado Pix-pesado, conta Pix gerado já como Purchase.
  let eventsToSend = []
  if (o.approved) {
    eventsToSend = ['Purchase']
  } else if (route?.fireOnPix && o.status === 'PENDING') {
    eventsToSend = ['Purchase']
  } else if (o.status === 'PENDING' || o.status === 'REFUSED') {
    eventsToSend = ['InitiateCheckout', 'AddPaymentInfo']
  } else if (o.status === 'EXPIRED' || o.status === 'ABANDONED') {
    eventsToSend = ['InitiateCheckout']
  }

  // Sem rota de pixel pra esta oferta → NÃO envia (não contamina pixel errado).
  const hasRoute = !!(route && route.pixelId && route.token)

  let capiOk = false
  if (hasRoute) {
    for (const ev of eventsToSend) {
      const ok = await sendCAPI(o, req, route, ev)
      capiOk = capiOk || ok
    }
  }

  // TikTok Events API — só na venda APROVADA (Purchase). Independe do pixel do Meta.
  const ttOk = eventsToSend.includes('Purchase') ? await sendTikTok(o, req) : false

  await upsertOrder(o, capiOk)

  const eventLabel = eventsToSend.length ? eventsToSend.join('+') : o.status
  let message
  if (!eventsToSend.length) {
    message = `registrado (${o.status})`
  } else if (!hasRoute) {
    // tem evento pra mandar mas NENHUMA rota casou → pulado de propósito
    message = `${eventLabel} NÃO enviado — sem rota de pixel p/ offer_id=${o.offerId || '—'} / product_id=${o.productId || '—'}. Cadastre na aba Pixels.`
  } else {
    message = `${eventLabel} → pixel ${route.pixelId} (${route.source}) → CAPI ${capiOk ? 'ok' : 'falhou/sem config'}`
  }
  if (eventsToSend.includes('Purchase')) message += ` | TikTok ${ttOk ? 'ok' : 'falhou/sem token'}`
  await logHit({
    gateway,
    event: o.event || gateway,
    status: o.status,
    ok: true,
    http_status: 200,
    secret_ok: true,
    capi_ok: capiOk,
    message,
    ip,
    raw: body,
    created_at: new Date().toISOString(),
  })

  return res.status(200).json({ ok: true, status: o.status, capi: capiOk, tiktok: ttOk, event: eventLabel, pixel: route?.pixelId || null, route: route?.source || (eventsToSend.length ? 'sem-rota' : 'n/a') })
}
