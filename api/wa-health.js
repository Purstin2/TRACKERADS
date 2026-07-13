// api/wa-health.js — checa em tempo real se o número WhatsApp (Meta Cloud API) está
// saudável: token válido, número conectado, quality rating. Isso é o jeito mais direto
// de saber se o Facebook desativou o disparo por erro de pagamento/token — se caiu,
// a própria chamada à Graph API já volta com o erro real do Meta.
//   GET /api/wa-health?secret=...

const GRAPH = 'https://graph.facebook.com/v22.0'

function need(name) {
  const v = process.env[name]
  return v && String(v).trim() ? String(v).trim() : null
}

export default async function handler(req, res) {
  const secret = req.query.secret
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  const token = need('WA_TOKEN')
  const phoneId = need('WA_PHONE_ID')
  if (!token || !phoneId) {
    return res.status(200).json({
      ok: false,
      configured: false,
      reason: 'WA_TOKEN/WA_PHONE_ID não configurados na Vercel — disparo não funciona.',
    })
  }

  try {
    const r = await fetch(
      `${GRAPH}/${phoneId}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier,code_verification_status,throughput&access_token=${token}`,
    )
    const j = await r.json()

    if (j.error) {
      const msg = (j.error.message || '') + ' ' + (j.error.error_user_msg || '')
      const billing = /payment|billing|pagamento|cobran|suspen|restrict|disabled|desativad/i.test(msg)
      return res.status(200).json({
        ok: false,
        configured: true,
        reason: j.error.error_user_msg || j.error.message || 'erro desconhecido na Graph API',
        code: j.error.code,
        subcode: j.error.error_subcode,
        billingSuspect: billing,
        raw: j.error,
      })
    }

    const quality = (j.quality_rating || '').toUpperCase()
    return res.status(200).json({
      ok: true,
      configured: true,
      phone: j.display_phone_number || null,
      verifiedName: j.verified_name || null,
      qualityRating: quality || null,
      qualityBad: quality === 'RED',
      messagingLimitTier: j.messaging_limit_tier || null,
      codeVerificationStatus: j.code_verification_status || null,
    })
  } catch (e) {
    return res.status(200).json({ ok: false, configured: true, reason: 'falha ao consultar a Graph API: ' + e.message })
  }
}
