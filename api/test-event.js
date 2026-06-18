import crypto from 'node:crypto'

// ════════════════════════════════════════════════════════════════════
// PURSTINLAB · Disparo de evento de TESTE sob demanda (Meta CAPI).
//
// Pra validar um pixel sem fazer venda real. Lê o token da rota no servidor
// (service key) e manda um evento com test_event_code → aparece na aba
// "Test Events" do Events Manager na hora.
//
// CHAMADA (do painel Pixels):
//   POST /api/test-event   body: { routeId, eventName?, testCode? }
//
// Requer SUPABASE_URL + SUPABASE_SERVICE_KEY na Vercel. Sem efeito em produção:
// eventos de teste não entram na otimização do Meta.
// ════════════════════════════════════════════════════════════════════

const sha = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex')
const sanitize = (v) => (v == null ? null : String(v).replace(/\s+/g, '') || null)

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'Supabase service key não configurada na Vercel' })

  let body = {}
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  } catch {
    return res.status(400).json({ error: 'JSON inválido' })
  }

  const { routeId, eventName = 'Purchase', testCode: bodyTestCode } = body
  if (!routeId) return res.status(400).json({ error: 'routeId é obrigatório' })

  // Busca a rota (com token cru) via service key
  let route
  try {
    const r = await fetch(
      `${url}/rest/v1/pixel_routes?id=eq.${encodeURIComponent(routeId)}&select=label,pixel_id,capi_token,test_code&limit=1`,
      { headers: sbHeaders(key) }
    )
    const rows = await r.json()
    route = Array.isArray(rows) ? rows[0] : null
  } catch {
    return res.status(500).json({ error: 'falha ao ler a rota no Supabase' })
  }
  if (!route) return res.status(404).json({ error: 'rota não encontrada' })

  const pixelId = sanitize(route.pixel_id)
  const token = sanitize(route.capi_token)
  const testCode = sanitize(bodyTestCode) || sanitize(route.test_code)
  if (!pixelId || !token) return res.status(400).json({ error: 'rota sem Pixel ID ou token CAPI' })
  if (!testCode)
    return res.status(400).json({
      error: 'sem Test Event Code. Pegue o código na aba Test Events do Meta, salve no pixel e tente de novo.',
    })

  const clientIp = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || '127.0.0.1'
  const clientUa = req.headers['user-agent'] || 'purstinlab-test'
  const eventId = `test_${Date.now()}`

  const eventPayload = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    event_source_url: 'https://purstinlab.test/teste',
    user_data: {
      em: [sha('teste@purstinlab.com')],
      ph: [sha('5511999999999')],
      client_ip_address: clientIp,
      client_user_agent: clientUa,
    },
    custom_data: {
      currency: 'BRL',
      value: 1.0,
      content_name: `TESTE — ${route.label || pixelId}`,
      content_type: 'product',
      ...(eventName === 'Purchase' ? { order_id: eventId } : {}),
    },
  }

  const payload = { data: [eventPayload], test_event_code: testCode }

  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json()
    if (j.error) {
      return res.status(200).json({
        ok: false,
        pixel: pixelId,
        testCode,
        error: j.error.message || 'Meta recusou o evento',
        code: j.error.code,
        details: j.error.error_user_msg || null,
      })
    }
    return res.status(200).json({
      ok: true,
      pixel: pixelId,
      testCode,
      event: eventName,
      events_received: j.events_received,
      fbtrace_id: j.fbtrace_id,
      messages: j.messages || [],
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'falha ao chamar a Graph API: ' + (e?.message || e) })
  }
}
