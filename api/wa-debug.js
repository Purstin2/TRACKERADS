// api/wa-debug.js — diagnóstico read-only da recuperação (erros de envio + abandonos)
// GET /api/wa-debug?secret=LABTRACK123
// Usa a service key em runtime (não exposta no front). Não escreve nada.

function sbH(key) {
  return { apikey: key, Authorization: `Bearer ${key}` }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })
  if (process.env.WEBHOOK_SECRET && req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  const since = new Date(Date.now() - 3 * 86400000).toISOString()

  // 1) mensagens WA que falharam
  const failRes = await fetch(
    `${url}/rest/v1/wa_messages?ok=eq.false&created_at=gte.${since}` +
      `&select=created_at,order_id,phone,body,http_status,response&order=created_at.desc&limit=20`,
    { headers: sbH(key) },
  )
  const fails = await failRes.json()

  // 2) carrinhos abandonados e o estado do WA neles
  const abRes = await fetch(
    `${url}/rest/v1/kirvano_orders?status=eq.ABANDONED&created_at=gte.${since}` +
      `&select=id,created_at,customer_name,customer_phone,value,wa_step,wa_status,wa_attempts,wa_error&order=created_at.desc&limit=20`,
    { headers: sbH(key) },
  )
  const abandoned = await abRes.json()

  // resumo dos erros (mensagem + código do Meta)
  const errSummary = (Array.isArray(fails) ? fails : []).map((f) => ({
    quando: f.created_at,
    fone: f.phone,
    passo: f.body,
    http: f.http_status,
    erro: f.response?.error?.message || JSON.stringify(f.response)?.slice(0, 200),
    code: f.response?.error?.code,
    sub: f.response?.error?.error_subcode,
  }))

  return res.json({
    ok: true,
    falhas_wa: errSummary,
    abandonados: abandoned,
    contagem: { falhas: errSummary.length, abandonados: Array.isArray(abandoned) ? abandoned.length : 0 },
  })
}
