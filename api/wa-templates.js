// api/wa-templates.js — gerencia os templates de recuperação direto pela API do
// WhatsApp Business (Meta), sem abrir o Gerenciador.
//   GET  /api/wa-templates?secret=...  → lista os templates do WABA (status/conteúdo)
//   POST /api/wa-templates?secret=...   body:{ action:'create', template:{...} }
//
// Env (Vercel): WA_TOKEN (já existe), WA_WABA_ID (ID da conta WhatsApp Business),
//   WA_APP_ID + WA_DAY2_VIDEO_URL (só pro header de vídeo do dia 2).

const GRAPH = 'https://graph.facebook.com/v22.0'

function need(name) {
  const v = process.env[name]
  return v && String(v).trim() ? String(v).trim() : null
}

// Header de vídeo precisa de um "handle" — sobe um sample do vídeo pela Resumable
// Upload API (sessão → bytes → handle) e usa esse handle como exemplo do header.
async function uploadVideoHandle(appId, token, videoUrl) {
  const vid = await fetch(videoUrl)
  if (!vid.ok) throw new Error(`não consegui baixar o vídeo (${vid.status})`)
  const buf = Buffer.from(await vid.arrayBuffer())
  const type = vid.headers.get('content-type') || 'video/mp4'

  const sess = await fetch(
    `${GRAPH}/${appId}/uploads?file_name=wa-dia2.mp4&file_length=${buf.length}&file_type=${encodeURIComponent(type)}&access_token=${token}`,
    { method: 'POST' },
  )
  const sj = await sess.json()
  if (!sj.id) throw new Error('falha ao criar a sessão de upload: ' + JSON.stringify(sj))

  const up = await fetch(`${GRAPH}/${sj.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_offset: '0' },
    body: buf,
  })
  const uj = await up.json()
  if (!uj.h) throw new Error('upload não retornou handle: ' + JSON.stringify(uj))
  return uj.h
}

export default async function handler(req, res) {
  const secret = req.query.secret
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  const token = need('WA_TOKEN')
  const waba = need('WA_WABA_ID')
  if (!token) return res.status(500).json({ error: 'WA_TOKEN não configurado na Vercel' })
  if (!waba) return res.status(500).json({ error: 'WA_WABA_ID não configurado na Vercel (ID da conta WhatsApp Business, não o do número)' })

  // ── LISTAR templates existentes + status ──────────────────────────────────
  if (req.method === 'GET') {
    const r = await fetch(
      `${GRAPH}/${waba}/message_templates?fields=name,status,category,language,components,rejected_reason&limit=200&access_token=${token}`,
    )
    const j = await r.json()
    if (j.error) return res.status(400).json({ error: j.error.message })
    return res.json({ ok: true, templates: j.data || [] })
  }

  // ── CRIAR / SUBMETER um template ──────────────────────────────────────────
  let body = {}
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) } catch {}
  const t = body.template || {}
  if (!t.name || !t.body) return res.status(400).json({ error: 'name e body são obrigatórios' })

  const components = []

  // header de vídeo (dia 2) — sobe o sample e pega o handle
  if (t.video) {
    const appId = need('WA_APP_ID')
    const videoUrl = need('WA_DAY2_VIDEO_URL')
    if (!videoUrl) return res.status(400).json({ error: 'configure WA_DAY2_VIDEO_URL na Vercel pro vídeo do dia 2' })
    if (!appId) return res.status(400).json({ error: 'pra usar vídeo no header, configure WA_APP_ID na Vercel' })
    let handle
    try { handle = await uploadVideoHandle(appId, token, videoUrl) }
    catch (e) { return res.status(400).json({ error: 'falha no upload do vídeo: ' + e.message }) }
    components.push({ type: 'HEADER', format: 'VIDEO', example: { header_handle: [handle] } })
  }

  // corpo + exemplos das variáveis {{1}}, {{2}}...
  const bodyComp = { type: 'BODY', text: t.body }
  const examples = Array.isArray(t.bodyExample) ? t.bodyExample.map((s) => String(s || '').trim()).filter(Boolean) : []
  if (examples.length) bodyComp.example = { body_text: [examples] }
  components.push(bodyComp)

  // botão CTA com URL dinâmica — {{1}} é o sufixo (o order_id que o /api/go resolve)
  if (t.buttonText && t.buttonUrlBase) {
    components.push({
      type: 'BUTTONS',
      buttons: [{
        type: 'URL',
        text: t.buttonText,
        url: `${t.buttonUrlBase}{{1}}`,
        example: [`${t.buttonUrlBase}a1b2c3d4`],
      }],
    })
  }

  const payload = {
    name: t.name,
    language: t.language || 'pt_BR',
    category: (t.category || 'MARKETING').toUpperCase(),
    components,
  }

  const r = await fetch(`${GRAPH}/${waba}/message_templates?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const j = await r.json()
  if (j.error) {
    return res.status(400).json({ error: j.error.error_user_msg || j.error.message, code: j.error.code, details: j.error })
  }
  return res.json({ ok: true, id: j.id, status: j.status || 'PENDING', category: j.category })
}
