export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY

  const vars = {
    SUPABASE_URL: url ? url.slice(0, 30) + '...' : 'MISSING',
    SUPABASE_SERVICE_KEY: key ? key.slice(0, 20) + '...' : 'MISSING',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ? 'SET' : 'MISSING',
  }

  if (!url || !key) return res.status(200).json({ vars, error: 'vars missing' })

  // tenta inserir uma linha de teste
  try {
    const r = await fetch(`${url}/rest/v1/kirvano_orders`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{
        checkout_id: 'debug-' + Date.now(),
        event: 'DEBUG',
        status: 'APPROVED',
        value: 1,
        product: 'Teste debug',
      }]),
    })
    const text = await r.text()
    return res.status(200).json({ vars, supabase_status: r.status, supabase_body: text })
  } catch (e) {
    return res.status(200).json({ vars, error: e.message })
  }
}
