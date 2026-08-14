import webpush from 'web-push'

// ════════════════════════════════════════════════════════════════════
// PURSTINLAB · Push de venda em segundo plano (Web Push).
// Roda por CRON (a cada 1 min). Acha vendas APROVADAS novas (cursor em app_state)
// e manda notificação pros celulares inscritos. SEPARADO do webhook — só LÊ vendas.
// ════════════════════════════════════════════════════════════════════

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}
const brl = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function setCursor(url, key, iso) {
  try {
    await fetch(`${url}/rest/v1/app_state?on_conflict=key`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key: 'push_cursor', value: iso, updated_at: new Date().toISOString() }),
    })
  } catch {}
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })

  const isCron = !!req.headers['x-vercel-cron']
  if (!isCron && (!process.env.WEBHOOK_SECRET || req.query.secret !== process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'secret inválido' })
  }
  if (!process.env.VAPID_PUBLIC || !process.env.VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID não configurado' })
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@purstinlab.app', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE)

  // cursor = último updated_at notificado
  let cursor = null
  try {
    const r = await fetch(`${url}/rest/v1/app_state?key=eq.push_cursor&select=value`, { headers: sbHeaders(key) })
    const rows = await r.json()
    cursor = Array.isArray(rows) && rows[0] ? rows[0].value : null
  } catch {}

  // 1ª execução: marca "agora" e não dispara o histórico
  if (!cursor) {
    const nowIso = new Date().toISOString()
    await setCursor(url, key, nowIso)
    return res.status(200).json({ ok: true, init: true, cursor: nowIso })
  }

  // vendas aprovadas novas
  let orders = []
  try {
    const q =
      `${url}/rest/v1/kirvano_orders?status=eq.APPROVED&updated_at=gt.${encodeURIComponent(cursor)}` +
      `&select=id,product,value,customer_name,updated_at&order=updated_at.asc&limit=25`
    const r = await fetch(q, { headers: sbHeaders(key) })
    orders = await r.json()
  } catch (e) {
    return res.status(500).json({ error: 'falha lendo vendas: ' + e.message })
  }
  if (!Array.isArray(orders) || !orders.length) return res.status(200).json({ ok: true, novas: 0 })

  // inscrições
  let subs = []
  try {
    const r = await fetch(`${url}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`, { headers: sbHeaders(key) })
    subs = await r.json()
  } catch {}
  if (!Array.isArray(subs)) subs = []

  let sent = 0
  const dead = []
  for (const o of orders) {
    const payload = JSON.stringify({
      title: '💰 Nova venda — ' + brl(o.value),
      body: `${o.product || 'Produto'}${o.customer_name ? ' · ' + String(o.customer_name).split(' ')[0] : ''}`,
      tag: o.id,
    })
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent++
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint)
      }
    }
  }

  // limpa inscrições mortas
  for (const ep of dead) {
    try { await fetch(`${url}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, { method: 'DELETE', headers: sbHeaders(key) }) } catch {}
  }

  await setCursor(url, key, orders[orders.length - 1].updated_at)
  return res.status(200).json({ ok: true, novas: orders.length, sent, subs: subs.length, dead: dead.length })
}
