// api/go.js — redirect de recuperação de carrinho via WhatsApp
// GET /api/go?id=ORDER_ID → checkout_url do pedido PRESERVANDO a atribuição original:
//   - mantém as UTMs originais (a pessoa veio de um anúncio → não perde a campanha)
//   - re-anexa fbc/fbp (o clique do anúncio) → o Meta reatribui a venda recuperada
//   - marca rec=wa só pra saber que passou pela recuperação (sem destruir a atribuição)
// Usado como base do botão CTA dinâmico nos templates:
//   URL do template no Meta: https://trackerads-nine.vercel.app/api/go?id=
//   Parâmetro dinâmico {{1}}: o.id (UUID do pedido no Supabase)

const FALLBACK = process.env.SITE_URL || 'https://premium.ultrapack3d.com'

// UTM às vezes vem como array duplicado (["FB","FB"]) — pega o 1º e limpa.
const pick = (v) => {
  if (Array.isArray(v)) v = v[0]
  return v == null ? '' : String(v).trim()
}

// fbc no formato fb.1.<ts>.<fbclid> (mesma lógica do webhook/refire).
function buildFbc(fbclid, rawFbc, createdAt) {
  if (rawFbc && /^fb\.1\.\d+\./.test(String(rawFbc))) return rawFbc
  const id = fbclid || (rawFbc && !String(rawFbc).startsWith('fb.') ? rawFbc : null)
  if (!id) return null
  const ts = createdAt ? new Date(createdAt).getTime() : Date.now()
  return `fb.1.${ts || Date.now()}.${id}`
}

export default async function handler(req, res) {
  const sbUrl = process.env.SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_KEY
  const { id } = req.query

  if (!sbUrl || !sbKey || !id) return res.redirect(302, FALLBACK)

  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/kirvano_orders?id=eq.${encodeURIComponent(id)}` +
        `&select=checkout_url,utm_source,utm_medium,utm_campaign,utm_content,utm_term,ordered_at,created_at,raw&limit=1`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    )
    const rows = await r.json()
    const o = rows?.[0]

    if (o?.checkout_url) {
      try {
        const u = new URL(o.checkout_url)

        // 1) preserva as UTMs originais da pessoa (mantém a campanha de origem)
        const utms = {
          utm_source: pick(o.utm_source),
          utm_medium: pick(o.utm_medium),
          utm_campaign: pick(o.utm_campaign),
          utm_content: pick(o.utm_content),
          utm_term: pick(o.utm_term),
        }
        for (const [k, v] of Object.entries(utms)) if (v) u.searchParams.set(k, v)

        // 2) re-anexa fbc/fbp (Kirvano lê ?fbc=&fbp=) → reatribui o clique de anúncio
        const cookies = o.raw?.cookies || {}
        const fbclid = cookies.fbclid || o.raw?.fbclid || null
        const fbc = buildFbc(fbclid, cookies._fbc || o.raw?.fbc, o.ordered_at || o.created_at)
        const fbp = cookies._fbp || o.raw?.fbp || null
        if (fbc) u.searchParams.set('fbc', fbc)
        if (fbp) u.searchParams.set('fbp', fbp)

        // 3) marca a origem recuperação sem mexer na atribuição
        u.searchParams.set('rec', 'wa')

        return res.redirect(302, u.toString())
      } catch {
        return res.redirect(302, o.checkout_url) // URL malformada, redireciona como está
      }
    }
  } catch {}

  return res.redirect(302, FALLBACK)
}
