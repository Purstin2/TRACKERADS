// api/google-conversions.js — entrega as conversões (vendas APROVADAS com gclid)
// já no formato do Google Ads (offline conversion import). Uma planilha Google
// puxa daqui via Apps Script, e o Google Ads importa da planilha no automático.
//
//   GET /api/google-conversions?secret=...
//
// Config (env, opcional):
//   GOOGLE_CONVERSION_NAME  = nome EXATO da ação de conversão criada no Google Ads
//   GOOGLE_CONV_DAYS        = janela em dias (default 90)
// Lê a coluna `gclid` de kirvano_orders (gravada pelo webhook).

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}` }
}

// data/hora no formato aceito pelo Google Ads: "yyyy-mm-dd hh:mm:ss+00:00" (UTC)
function fmtTime(iso) {
  const d = new Date(iso || Date.now())
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
}

export default async function handler(req, res) {
  if (process.env.WEBHOOK_SECRET && req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })

  const convName = process.env.GOOGLE_CONVERSION_NAME || 'Compra'
  const days = parseInt(process.env.GOOGLE_CONV_DAYS || '90', 10)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const q =
    `${url}/rest/v1/kirvano_orders?status=eq.APPROVED&gclid=not.is.null` +
    `&ordered_at=gte.${since}&select=gclid,value,currency,ordered_at,created_at` +
    `&order=created_at.desc&limit=5000`

  let rows = []
  try {
    const r = await fetch(q, { headers: sbHeaders(key) })
    rows = await r.json()
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
  if (!Array.isArray(rows)) rows = []

  const conversions = rows
    .filter((o) => o.gclid)
    .map((o) => ({
      gclid: o.gclid,
      name: convName,
      time: fmtTime(o.ordered_at || o.created_at),
      value: Number(o.value) || 0,
      currency: o.currency || 'BRL',
    }))

  return res.status(200).json({ ok: true, count: conversions.length, conversions })
}
