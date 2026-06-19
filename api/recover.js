// ════════════════════════════════════════════════════════════════════
// PURSTINLAB · Recuperação de carrinho abandonado via WhatsApp (cadência 3 dias)
//
// Roda por CRON (Vercel Cron). Pra cada carrinho abandonado elegível, dispara
// o template do DIA certo conforme o tempo:
//   Dia 1 (rapport)  → ~1h após abandono     → template WA_TEMPLATE_DAY1
//   Dia 2 (prova)    → +24h                  → template WA_TEMPLATE_DAY2 (vídeo)
//   Dia 3 (urgência) → +24h                  → template WA_TEMPLATE_DAY3
// Para sozinho se a pessoa comprar (status APPROVED / recovered).
//
// CHAMADA:
//   GET/POST /api/recover                    → roda a cadência (cron)
//   POST     /api/recover?secret=...&ids=..  → força o próximo passo desses ids
//
// PROVEDOR (env WA_PROVIDER): cloud (Meta oficial) | 360dialog | gupshup | custom
// Cadência com template/vídeo é suportada em cloud e 360dialog.
// Credenciais SÓ na Vercel (env), nunca no banco.
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
  if (d.length <= 11) return '55' + d
  return d
}

const firstName = (o) => (o.customer_name || '').split(' ')[0] || ''

// Sanitiza um parâmetro de template (Meta rejeita vazio/quebra de linha/tab).
function cleanParam(v, fallback) {
  const s = String(v ?? '').replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return s || fallback
}

// ── definição dos 3 passos da cadência (lidos de env) ────────────────────────
function getSteps() {
  const lang = process.env.WA_TEMPLATE_LANG || 'pt_BR'
  const company = process.env.WA_COMPANY || 'nossa loja'
  const videoUrl = process.env.WA_DAY2_VIDEO_URL || null // link público .mp4 do dia 2
  const videoId = process.env.WA_DAY2_VIDEO_ID || null // ou um media id já enviado
  return [
    {
      day: 1,
      template: process.env.WA_TEMPLATE_DAY1 || 'carrinho_dia1',
      lang,
      // dia 1: {{1}}=nome, {{2}}=empresa
      bodyParams: (o) => [cleanParam(firstName(o), 'tudo bem'), cleanParam(company, 'nossa loja')],
      header: null,
    },
    {
      day: 2,
      template: process.env.WA_TEMPLATE_DAY2 || 'carrinho_dia2',
      lang,
      // dia 2: {{1}}=nome + header de vídeo (precisa link público ou media id)
      bodyParams: (o) => [cleanParam(firstName(o), 'tudo bem')],
      header: videoUrl ? { type: 'video', link: videoUrl } : videoId ? { type: 'video', id: videoId } : null,
    },
    {
      day: 3,
      template: process.env.WA_TEMPLATE_DAY3 || 'carrinhos_dia3',
      lang,
      // dia 3: {{1}}=nome
      bodyParams: (o) => [cleanParam(firstName(o), 'tudo bem')],
      header: null,
    },
  ]
}

// Decide qual passo (índice 0..2) está na hora de enviar, ou:
//   -1 = ainda não é hora   |   -2 = expirou (velho demais p/ iniciar)
function dueStep(o, cfg, now) {
  const step = o.wa_step || 0
  if (step >= 3) return -1
  const delayMs = (cfg.delay_minutes ?? 60) * 60000
  const gapMs = (cfg.step_gap_hours ?? 24) * 3600000
  const windowMs = (cfg.window_hours ?? 24) * 3600000
  if (step === 0) {
    const base = new Date(o.created_at || o.ordered_at || now).getTime()
    const age = now - base
    if (age < delayMs) return -1 // ainda cedo
    if (age > windowMs) return -2 // velho demais pra começar a cadência
    return 0
  }
  // passos 1 e 2: espera o gap desde o último envio
  const last = o.wa_last_try ? new Date(o.wa_last_try).getTime() : 0
  return now - last >= gapMs ? step : -1
}

// ── monta a requisição HTTP do provedor pra um passo da cadência ─────────────
function buildRequest(provider, phone, stepDef) {
  const components = []
  if (stepDef.header) {
    const h = stepDef.header
    components.push({
      type: 'header',
      parameters: [{ type: h.type, [h.type]: h.link ? { link: h.link } : { id: h.id } }],
    })
  }
  const params = stepDef.bodyParams_resolved.map((t) => ({ type: 'text', text: t }))
  if (params.length) components.push({ type: 'body', parameters: params })

  const template = { name: stepDef.template, language: { code: stepDef.lang }, components }

  if (provider === '360dialog') {
    return {
      url: 'https://waba-v2.360dialog.io/messages',
      headers: { 'D360-API-KEY': process.env.WA_360_API_KEY, 'Content-Type': 'application/json' },
      body: { messaging_product: 'whatsapp', to: phone, type: 'template', template },
    }
  }
  // cloud (Meta oficial) — default
  return {
    url: `https://graph.facebook.com/v22.0/${process.env.WA_PHONE_ID}/messages`,
    headers: { Authorization: `Bearer ${process.env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: { messaging_product: 'whatsapp', to: phone, type: 'template', template },
  }
}

async function sendStep(provider, phone, stepDef, o) {
  // resolve os params do body pra este pedido
  stepDef.bodyParams_resolved = stepDef.bodyParams(o)
  const req = buildRequest(provider, phone, stepDef)
  if (!req.url || (provider === 'cloud' && (!process.env.WA_PHONE_ID || !process.env.WA_TOKEN))) {
    return { ok: false, http: 0, response: { error: 'provider não configurado (faltam env vars)' } }
  }
  if (stepDef.day === 2 && !stepDef.header) {
    return { ok: false, http: 0, response: { error: 'dia 2 precisa de WA_DAY2_VIDEO_URL (link do vídeo)' } }
  }
  try {
    const r = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
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

  const isCron = !!req.headers['x-vercel-cron']
  const secret = req.query.secret
  if (!isCron && process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  // config (template/delay/janela editáveis na tela; credenciais só na env)
  let cfg = {}
  try {
    const r = await fetch(`${url}/rest/v1/wa_config?id=eq.1&select=*`, { headers: sbHeaders(key) })
    cfg = (await r.json())[0] || {}
  } catch {}

  const provider = process.env.WA_PROVIDER || cfg.provider || 'cloud'
  const steps = getSteps()

  const idsParam = (req.query.ids || '').toString().trim()
  const manualIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null

  if (!manualIds && !cfg.enabled) {
    return res.status(200).json({ ok: true, skipped: 'automático desabilitado (wa_config.enabled=false)' })
  }

  const now = Date.now()
  // candidatos: abandonados, não convertidos, ainda na cadência (wa_step<3), com telefone,
  // criados nos últimos 5 dias (cobre os 3 toques + folga)
  const cutoff = new Date(now - 5 * 86400000).toISOString()
  let query
  if (manualIds) {
    const inList = manualIds.map((i) => `"${i}"`).join(',')
    query = `${url}/rest/v1/kirvano_orders?id=in.(${inList})&select=*`
  } else {
    // recupera carrinho abandonado, pix/boleto PENDENTE (gerado mas não pago) E
    // cartão RECUSADO (REFUSED) — a Kirvano dá poucos abandonados, então pendente +
    // recusado são o grosso da recuperação.
    // Só vendas >= R$ MIN_VALUE (evita gastar disparo/risco de ban em pedido pequeno).
    // Para sozinho ao virar APPROVED (sai do filtro) ou recovered.
    const MIN_VALUE = parseFloat(process.env.WA_MIN_VALUE || '17')
    query =
      `${url}/rest/v1/kirvano_orders?status=in.(ABANDONED,PENDING,REFUSED)` +
      `&or=(wa_step.is.null,wa_step.lt.3)&customer_phone=not.is.null&value=gte.${MIN_VALUE}` +
      `&created_at=gte.${cutoff}&select=*&order=created_at.asc&limit=80`
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
    if (o.status === 'APPROVED' || o.recovered) {
      await patchOrder(url, key, o.id, { wa_status: 'converted', wa_step: 3 })
      results.push({ id: o.id, skipped: 'já comprou' })
      continue
    }
    const phone = waPhone(o.customer_phone)
    if (!phone) {
      await patchOrder(url, key, o.id, { wa_status: 'skipped', wa_error: 'sem telefone', wa_step: 3 })
      results.push({ id: o.id, skipped: 'sem telefone' })
      continue
    }

    // Pix PENDENTE e cartão RECUSADO: só o toque do DIA 1 (mais seguro contra ban).
    // Só o carrinho ABANDONADO segue a cadência completa de 3 dias.
    if (!manualIds && (o.status === 'PENDING' || o.status === 'REFUSED') && (o.wa_step || 0) >= 1) {
      await patchOrder(url, key, o.id, { wa_status: 'done', wa_step: 3 })
      results.push({ id: o.id, skipped: o.status === 'PENDING' ? 'pix: só dia 1' : 'recusado: só dia 1' })
      continue
    }

    // no modo manual, força o próximo passo; no cron, respeita o tempo
    const idx = manualIds ? (o.wa_step || 0) : dueStep(o, cfg, now)
    if (idx === -2) {
      await patchOrder(url, key, o.id, { wa_status: 'skipped', wa_error: 'janela expirada', wa_step: 3 })
      results.push({ id: o.id, skipped: 'expirado' })
      continue
    }
    if (idx < 0 || idx > 2) {
      results.push({ id: o.id, waiting: true, step: o.wa_step || 0 })
      continue
    }

    const stepDef = steps[idx]
    const out = await sendStep(provider, phone, stepDef, o)

    await fetch(`${url}/rest/v1/wa_messages`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify([
        {
          order_id: o.id,
          phone,
          body: `[dia ${stepDef.day}] ${stepDef.template}`,
          provider,
          ok: out.ok,
          http_status: out.http,
          response: out.response,
        },
      ]),
    })

    await patchOrder(url, key, o.id, {
      wa_step: out.ok ? idx + 1 : o.wa_step || 0, // só avança se enviou
      wa_status: out.ok ? (idx + 1 >= 3 ? 'done' : 'sent') : 'failed',
      wa_attempts: (o.wa_attempts || 0) + 1,
      wa_sent_at: out.ok ? new Date().toISOString() : o.wa_sent_at,
      wa_last_try: new Date().toISOString(),
      wa_error: out.ok ? null : JSON.stringify(out.response).slice(0, 400),
    })
    results.push({ id: o.id, phone, day: stepDef.day, ok: out.ok, http: out.http })
  }

  const sent = results.filter((r) => r.ok).length
  return res.status(200).json({ ok: true, provider, processed: results.length, sent, results })
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
