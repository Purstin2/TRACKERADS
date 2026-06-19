// Salva a inscrição de push do celular (Web Push). Usa service key — a tabela
// push_subscriptions é fechada. NÃO toca em nada de pixel/webhook.

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}

export default async function handler(req, res) {
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
