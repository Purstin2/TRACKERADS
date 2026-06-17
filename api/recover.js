// ════════════════════════════════════════════════════════════════════
// PURSTINLAB · Disparador de recuperação de carrinho abandonado (WhatsApp)
//
// Roda por CRON (Vercel Cron) a cada X minutos. Pega carrinhos abandonados
// elegíveis e dispara a mensagem pelo provedor configurado.
//
// CHAMADA:
//   GET/POST /api/recover?secret=WEBHOOK_SECRET           → roda a fila (cron)
//   POST     /api/recover?secret=...&ids=uuid1,uuid2      → dispara em lote (manual)
//
// PROVEDOR (genérico, escolhido por env WA_PROVIDER):
//   - cloud      → Meta WhatsApp Cloud API (oficial / via parceiro 360dialog hub)
//   - 360dialog  → 360dialog (Cloud API gerenciada)
//   - gupshup    → Gupshup
//   - custom     → qualquer endpoint (você define WA_CUSTOM_URL e o corpo)
//
// As CREDENCIAIS ficam só na Vercel (env), nunca no banco.
// ════════════════════════════════════════════════════════════════════

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}

// Telefone E.164 só dígitos (com DDI). PT 351 / BR 55 detectados.
function waPhone(raw) {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('351') || d.startsWith('55')) return d
  if (d.length <= 11) return '55' + d // sem DDI → assume BR
  return d
}

// Preenche {nome} {produto} {link} {valor} no template.
function fillTemplate(tpl, o) {
  const nome = (o.customer_name || '').split(' ')[0] || 'tudo bem'
  const valor = o.value
    ? (o.currency === 'EUR' ? '€' : 'R$') + ' ' + Number(o.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : ''
  return String(tpl || '')
    .replaceAll('{nome}', nome)
    .replaceAll('{produto}', o.product || 'nosso produto')
    .replaceAll('{link}', o.checkout_url || '')
    .replaceAll('{valor}', valor)
    .trim()
}

// Sanitiza um valor pra parâmetro de template (Meta rejeita vazio, quebras de
// linha, tabs e >4 espaços seguidos). Garante fallback não-vazio.
function cleanParam(v, fallback) {
  let s = String(v ?? '').replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return s || fallback
}

// Os 3 parâmetros do template, na ordem {{1}}=nome {{2}}=produto {{3}}=link.
function templateParams(o) {
  const first = (o.customer_name || '').split(' ')[0]
  return [
    { type: 'text', text: cleanParam(first, 'tudo bem') },
    { type: 'text', text: cleanParam(o.product, 'sua compra') },
    { type: 'text', text: cleanParam(o.checkout_url, 'pay.kirvano.com') },
  ]
}

// ── adaptador genérico: monta {url, headers, body} por provedor ──────────────
function buildRequest(provider, phone, text, o, cfg) {
  switch (provider) {
    case 'cloud': {
      // Meta WhatsApp Cloud API (oficial). Exige template aprovado p/ marketing.
      // WA_PHONE_ID = phone number id; WA_TOKEN = token permanente.
      const phoneId = process.env.WA_PHONE_ID
      const token = process.env.WA_TOKEN
      const tplName = process.env.WA_TEMPLATE_NAME // se usar template aprovado
      const lang = process.env.WA_TEMPLATE_LANG || 'pt_BR'
      const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      // se houver template aprovado, usa template (recomendado p/ não cair na policy);
      // senão manda texto livre (só funciona dentro da janela de 24h de sessão).
      const body = tplName
        ? {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: tplName,
              language: { code: lang },
              components: [{ type: 'body', parameters: templateParams(o) }],
            },
          }
        : { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }
      return { url, headers, body }
    }

    case '360dialog': {
      // 360dialog (Cloud API gerenciada). Mesmo corpo da Cloud API, header D360-API-KEY.
      const key = process.env.WA_360_API_KEY
      const tplName = process.env.WA_TEMPLATE_NAME
      const lang = process.env.WA_TEMPLATE_LANG || 'pt_BR'
      const url = 'https://waba-v2.360dialog.io/messages'
      const headers = { 'D360-API-KEY': key, 'Content-Type': 'application/json' }
      const body = tplName
        ? {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: tplName,
              language: { code: lang },
              components: [{ type: 'body', parameters: templateParams(o) }],
            },
          }
        : { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }
      return { url, headers, body }
    }

    case 'gupshup': {
      // Gupshup (form-urlencoded).
      const apikey = process.env.WA_GUPSHUP_KEY
      const source = process.env.WA_GUPSHUP_SOURCE // número de origem
      const appName = process.env.WA_GUPSHUP_APP
      const url = 'https://api.gupshup.io/wa/api/v1/msg'
      const headers = { apikey, 'Content-Type': 'application/x-www-form-urlencoded' }
      const params = new URLSearchParams({
        channel: 'whatsapp',
        source,
        destination: phone,
        'src.name': appName,
        message: JSON.stringify({ type: 'text', text }),
      })
      return { url, headers, body: params.toString(), raw: true }
    }

    default: {
      // custom: você define a URL e o corpo via env. {{phone}} {{text}} são substituídos.
      const url = process.env.WA_CUSTOM_URL
      const auth = process.env.WA_CUSTOM_AUTH // ex: "Bearer xxx" ou "apikey: xxx"
      const headers = { 'Content-Type': 'application/json' }
      if (auth) {
        const [h, ...rest] = auth.split(':')
        if (rest.length) headers[h.trim()] = rest.join(':').trim()
        else headers['Authorization'] = auth
      }
      const tpl = process.env.WA_CUSTOM_BODY || '{"phone":"{{phone}}","message":"{{text}}"}'
      const body = tpl.replaceAll('{{phone}}', phone).replaceAll('{{text}}', text.replace(/"/g, '\\"').replace(/\n/g, '\\n'))
      return { url, headers, body, raw: true }
    }
  }
}

async function sendWa(provider, phone, text, o, cfg) {
  const req = buildRequest(provider, phone, text, o, cfg)
  if (!req.url) return { ok: false, http: 0, response: { error: 'provider não configurado (faltam env vars)' } }
  try {
    const r = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.raw ? req.body : JSON.stringify(req.body),
    })
    let j = {}
    try {
      j = await r.json()
    } catch {
      j = { text: await r.text().catch(() => '') }
    }
    return { ok: r.ok && !j.error, http: r.status, response: j }
  } catch (e) {
    return { ok: false, http: 0, response: { error: e.message } }
  }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })

  // auth: chamada do Vercel Cron (header x-vercel-cron) OU ?secret= correto
  const isCron = !!req.headers['x-vercel-cron']
  const secret = req.query.secret
  if (!isCron && process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  // config
  let cfg = {}
  try {
    const r = await fetch(`${url}/rest/v1/wa_config?id=eq.1&select=*`, { headers: sbHeaders(key) })
    cfg = (await r.json())[0] || {}
  } catch {}

  const provider = process.env.WA_PROVIDER || cfg.provider || 'custom'
  const delayMin = cfg.delay_minutes ?? 20
  const maxAttempts = cfg.max_attempts ?? 1
  const windowH = cfg.window_hours ?? 24
  const template = cfg.template || 'Oi {nome}! Vi que você começou a compra do {produto} mas não finalizou. Quer ajuda pra concluir? {link}'

  // modo manual em lote: ?ids=uuid1,uuid2
  const idsParam = (req.query.ids || '').toString().trim()
  const manualIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null

  // modo automático precisa estar habilitado; manual sempre roda
  if (!manualIds && !cfg.enabled) {
    return res.status(200).json({ ok: true, skipped: 'automático desabilitado (wa_config.enabled=false)' })
  }

  // busca candidatos
  const now = Date.now()
  const cutoffOld = new Date(now - windowH * 3600 * 1000).toISOString()
  const cutoffReady = new Date(now - delayMin * 60 * 1000).toISOString()

  let query
  if (manualIds) {
    const inList = manualIds.map((i) => `"${i}"`).join(',')
    query = `${url}/rest/v1/kirvano_orders?id=in.(${inList})&select=*`
  } else {
    // abandonados, ainda pendentes, dentro da janela, já passou o delay, sob o limite de tentativas
    query =
      `${url}/rest/v1/kirvano_orders?status=eq.ABANDONED&wa_status=eq.pending` +
      `&created_at=gte.${cutoffOld}&created_at=lte.${cutoffReady}` +
      `&wa_attempts=lt.${maxAttempts}&customer_phone=not.is.null&select=*&order=created_at.asc&limit=50`
  }

  let orders = []
  try {
    const r = await fetch(query, { headers: sbHeaders(key) })
    orders = await r.json()
  } catch (e) {
    return res.status(500).json({ error: 'falha ao buscar pedidos: ' + e.message })
  }
  if (!Array.isArray(orders)) orders = []

  const results = []
  for (const o of orders) {
    // segurança extra: nunca manda se já virou venda aprovada
    if (o.status === 'APPROVED' || o.recovered) {
      await patchOrder(url, key, o.id, { wa_status: 'skipped', wa_error: 'já comprou' })
      results.push({ id: o.id, skipped: 'já comprou' })
      continue
    }
    const phone = waPhone(o.customer_phone)
    if (!phone) {
      await patchOrder(url, key, o.id, { wa_status: 'skipped', wa_error: 'sem telefone' })
      results.push({ id: o.id, skipped: 'sem telefone' })
      continue
    }

    const text = fillTemplate(template, o)
    const out = await sendWa(provider, phone, text, o, cfg)

    // log da mensagem
    await fetch(`${url}/rest/v1/wa_messages`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify([
        { order_id: o.id, phone, body: text, provider, ok: out.ok, http_status: out.http, response: out.response },
      ]),
    })

    await patchOrder(url, key, o.id, {
      wa_status: out.ok ? 'sent' : 'failed',
      wa_attempts: (o.wa_attempts || 0) + 1,
      wa_sent_at: out.ok ? new Date().toISOString() : o.wa_sent_at,
      wa_last_try: new Date().toISOString(),
      wa_error: out.ok ? null : JSON.stringify(out.response).slice(0, 400),
    })
    results.push({ id: o.id, phone, ok: out.ok, http: out.http })
  }

  return res.status(200).json({ ok: true, provider, processed: results.length, results })
}

async function patchOrder(url, key, id, patch) {
  try {
    await fetch(`${url}/rest/v1/kirvano_orders?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    })
  } catch {}
}
