// api/go.js — redirect de recuperação de carrinho via WhatsApp
// GET /api/go?id=ORDER_ID → redireciona pro checkout_url do pedido + UTMs de recuperação
// Usado como base do botão CTA dinâmico nos templates do WhatsApp:
//   URL do template no Meta: https://trackerads-nine.vercel.app/api/go?id=
//   Parâmetro dinâmico {{1}}: o.id (UUID do pedido no Supabase)

const FALLBACK = process.env.SITE_URL || 'https://premium.ultrapack3d.com'

export default async function handler(req, res) {
  const sbUrl = process.env.SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_KEY
  const { id } = req.query

  if (!sbUrl || !sbKey || !id) return res.redirect(302, FALLBACK)

  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/kirvano_orders?id=eq.${encodeURIComponent(id)}&select=checkout_url&limit=1`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    )
    const rows = await r.json()
    const raw = rows?.[0]?.checkout_url

    if (raw) {
      try {
        const u = new URL(raw)
        u.searchParams.set('utm_source', 'whatsapp')
        u.searchParams.set('utm_medium', 'recovery')
        return res.redirect(302, u.toString())
      } catch {
        return res.redirect(302, raw) // URL malformada, redireciona como está
      }
    }
  } catch {}

  return res.redirect(302, FALLBACK)
}
