// GET /api/meta-today — spend + impressões de hoje na conta de anúncios
// Usa env vars: META_ADS_TOKEN (token do usuário/system user) + META_AD_ACCOUNT_ID (act_XXXX)
// Sem as vars retorna { ok: false } sem erro pra não quebrar o mobile.

export default async function handler(req, res) {
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
