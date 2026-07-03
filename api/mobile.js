// Endpoints do app mobile consolidados numa função só (limite de 12 do Hobby):
//   GET  /api/mobile?fn=meta-today       → spend/impressões de hoje (era meta-today.js)
//   POST /api/mobile?fn=push-subscribe   → salva inscrição de Web Push (era push-subscribe.js)

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}

async function metaToday(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  const token = process.env.META_ADS_TOKEN || process.env.META_CAPI_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID
  if (!token || !accountId) return res.json({ ok: false, reason: 'not_configured' })
  try {
    const url =
      `https://graph.facebook.com/v22.0/${accountId}/insights` +
      `?date_preset=today&fields=spend,impressions,clicks,reach&level=account&access_token=${token}`
    const r = await fetch(url)
    const j = await r.json()
    if (j.error) return res.json({ ok: false, reason: j.error.message })
    const row = Array.isArray(j.data) ? j.data[0] : null
    if (!row) return res.json({ ok: true, spend: 0, impressions: 0, clicks: 0 })
    return res.json({
      ok: true,
      spend: parseFloat(row.spend || 0),
      impressions: parseInt(row.impressions || 0, 10),
      clicks: parseInt(row.clicks || 0, 10),
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

export default async function handler(req, res) {
  const fn = String(req.query.fn || '')
  if (fn === 'meta-today') return metaToday(req, res)
  if (fn === 'push-subscribe') return pushSubscribe(req, res)
  return res.status(400).json({ error: 'fn inválido (meta-today | push-subscribe)' })
}
