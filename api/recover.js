// ════════════════════════════════════════════════════════════════════
// PURSTINLAB · Recuperação de carrinho abandonado via WhatsApp (cadência 3 dias)
//
// Roda por CRON (Vercel Cron). Pra cada carrinho abandonado elegível, dispara
// o template do DIA certo conforme o tempo:
//   Dia 1 (rapport)  → ~1h após abandono     → template WA_TEMPLATE_DAY1
//   Dia 2 (prova)    → +24h                  → template WA_TEMPLATE_DAY2 (vídeo)
//   Dia 3 (urgência) → +24h                  → template WA_TEMPLATE_DAY3
// Para sozinho se a pessoa comprar (status APPROVED / recovered).
//
// CHAMADA:
//   GET/POST /api/recover                    → roda a cadência (cron)
//   POST     /api/recover?secret=...&ids=..  → força o próximo passo desses ids
//
// PROVEDOR (env WA_PROVIDER): cloud (Meta oficial) | 360dialog | gupshup | custom
// Cadência com template/vídeo é suportada em cloud e 360dialog.
// Credenciais SÓ na Vercel (env), nunca no banco.
// ════════════════════════════════════════════════════════════════════

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}

// Telefone E.164 só dígitos (com DDI). PT 351 / BR 55 detectados.
function waPhone(raw) {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('351') || d.startsWith('55')) return d
  if (d.length <= 11) return '55' + d
  return d
}

const firstName = (o) => (o.customer_name || '').split(' ')[0] || ''
// nome do produto que a pessoa tentou comprar (vem do webhook → kirvano_orders.product)
const productLabel = (o) => cleanParam(o.product, 'sua oferta')

// Quais produtos recebem o DIA 2 (vídeo dos STLs). Por id de produto (do products[])
// ou, como rede de segurança, pelo nome conter "STL"/"ULTRA PACK". Configurável na env.
const STL_PRODUCT_IDS = (process.env.WA_STL_PRODUCT_IDS ||
  'b42399f8-52da-46a4-8478-e06f80fdcb5e,0c0b52ef-623d-4ba3-bb91-1ba85529b3a1')
  .split(',').map((s) => s.trim()).filter(Boolean)
function isStlOrder(o) {
  const ids = (o.products || []).map((p) => String(p && p.id))
  if (STL_PRODUCT_IDS.some((id) => ids.includes(id))) return true
  return /\bstl\b|ultra\s?pack/i.test(o.product || '')
}

// Sanitiza um parâmetro de template (Meta rejeita vazio/quebra de linha/tab).
function cleanParam(v, fallback) {
  const s = String(v ?? '').replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return s || fallback
}

// Quantos passos da cadência realmente disparam. Medição 20/06–28/07:
//   dia 1 → 297 disparos, 17 vendas   |   dia 2 + dia 3 → 43 disparos, ZERO venda.
// Os dias 2/3 só insistiam com quem já tinha ignorado — é bloqueio/denúncia, que é
// o que derruba a nota do número pra RED. Default 1 (só o dia 1); WA_MAX_STEPS
// permite voltar a 2 ou 3 sem mexer no código.
const MAX_STEPS = Math.max(1, Math.min(3, parseInt(process.env.WA_MAX_STEPS || '1', 10) || 1))
// wa_step = 3 é o marcador de "encerrado" (o filtro da query usa wa_step < 3),
// independente de quantos passos a cadência tem.
const STEP_FIM = 3

// ── definição dos 3 passos da cadência (lidos de env) ────────────────────────
function getSteps() {
  const lang = process.env.WA_TEMPLATE_LANG || 'pt_BR'
  const videoUrl = process.env.WA_DAY2_VIDEO_URL || null // link público .mp4 do dia 2
  const videoId = process.env.WA_DAY2_VIDEO_ID || null // ou um media id já enviado
  // todos os dias agora usam {{1}}=nome, {{2}}=produto (nome real do webhook)
  return [
    {
      day: 1,
      template: process.env.WA_TEMPLATE_DAY1 || 'recuperacao_dia1_v3',
      lang,
      bodyParams: (o) => [cleanParam(firstName(o), 'você'), productLabel(o)],
      header: null,
      hasButton: process.env.WA_BUTTON_URL !== 'false', // botão só quando ligado (templates c/ CTA)
    },
    {
      day: 2,
      template: process.env.WA_TEMPLATE_DAY2 || 'recuperacao_dia2_v3',
      lang,
      bodyParams: (o) => [cleanParam(firstName(o), 'você'), productLabel(o)],
      header: videoUrl ? { type: 'video', link: videoUrl } : videoId ? { type: 'video', id: videoId } : null,
      hasButton: process.env.WA_BUTTON_URL !== 'false',
    },
    {
      day: 3,
      template: process.env.WA_TEMPLATE_DAY3 || 'recuperacao_dia3_v3',
      lang,
      bodyParams: (o) => [cleanParam(firstName(o), 'você'), productLabel(o)],
      header: null,
      hasButton: process.env.WA_BUTTON_URL !== 'false',
    },
  ]
}

// Decide qual passo (índice 0..2) está na hora de enviar, ou:
//   -1 = ainda não é hora   |   -2 = expirou (velho demais p/ iniciar)
function dueStep(o, cfg, now) {
  const step = o.wa_step || 0
  if (step >= MAX_STEPS) return -1
  const delayMs = (cfg.delay_minutes ?? 60) * 60000
  const gapMs = (cfg.step_gap_hours ?? 24) * 3600000
  const windowMs = (cfg.window_hours ?? 24) * 3600000
  if (step === 0) {
    const base = new Date(o.created_at || o.ordered_at || now).getTime()
    const age = now - base
    if (age < delayMs) return -1 // ainda cedo
    if (age > windowMs) return -2 // velho demais pra começar a cadência
    return 0
  }
  // passos 1 e 2: espera o gap desde o último envio
  const last = o.wa_last_try ? new Date(o.wa_last_try).getTime() : 0
  return now - last >= gapMs ? step : -1
}

// ── monta a requisição HTTP do provedor pra um passo da cadência ─────────────
function buildRequest(provider, phone, stepDef) {
  const components = []
  if (stepDef.header) {
    const h = stepDef.header
    components.push({
      type: 'header',
      parameters: [{ type: h.type, [h.type]: h.link ? { link: h.link } : { id: h.id } }],
    })
  }
  const params = stepDef.bodyParams_resolved.map((t) => ({ type: 'text', text: t }))
  if (params.length) components.push({ type: 'body', parameters: params })
  // botão CTA com URL dinâmica — parâmetro é o order_id que o endpoint /api/go resolve
  // O índice "0" corresponde ao 1º botão no template; {{1}} no URL do template = sufixo dinâmico
  if (stepDef.hasButton && stepDef.buttonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: String(stepDef.buttonParam) }],
    })
  }

  const template = { name: stepDef.template, language: { code: stepDef.lang }, components }

  if (provider === '360dialog') {
    return {
      url: 'https://waba-v2.360dialog.io/messages',
      headers: { 'D360-API-KEY': process.env.WA_360_API_KEY, 'Content-Type': 'application/json' },
      body: { messaging_product: 'whatsapp', to: phone, type: 'template', template },
    }
  }
  // cloud (Meta oficial) — default
  return {
    url: `https://graph.facebook.com/v22.0/${process.env.WA_PHONE_ID}/messages`,
    headers: { Authorization: `Bearer ${process.env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: { messaging_product: 'whatsapp', to: phone, type: 'template', template },
  }
}

async function sendStep(provider, phone, stepDef, o) {
  stepDef.bodyParams_resolved = stepDef.bodyParams(o)
  stepDef.buttonParam = o.id || null // order_id → /api/go?id=ORDER_ID redireciona pro checkout
  const req = buildRequest(provider, phone, stepDef)
  if (!req.url || (provider === 'cloud' && (!process.env.WA_PHONE_ID || !process.env.WA_TOKEN))) {
    return { ok: false, http: 0, response: { error: 'provider não configurado (faltam env vars)' } }
  }
  if (stepDef.day === 2 && !stepDef.header) {
    return { ok: false, http: 0, response: { error: 'dia 2 precisa de WA_DAY2_VIDEO_URL (link do vídeo)' } }
  }
  try {
    const r = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
    let j = {}
    try {
      j = await r.json()
    } catch {
      j = { text: await r.text().catch(() => '') }
    }
    return { ok: r.ok && !j.error, http: r.status, response: j }
  } catch (e) {
    return { ok: false, http: 0, response: { error: e.message } }
  }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })

  const isCron = !!req.headers['x-vercel-cron']
  const secret = req.query.secret
  if (!isCron && (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  // ── Tracker Padrão: captura do gasto em anúncios (?job=ads) ──
  // Pega carona aqui porque o Hobby limita a 12 funções serverless e o projeto
  // já está no teto. Sai antes de qualquer lógica de WhatsApp — não interfere.
  if ((req.query.job || '') === 'ads') {
    const { rodarSnapshot } = await import('./_adsSnapshot.js')
    const out = await rodarSnapshot({ dias: req.query.dias })
    return res.status(out.erro ? (out.http || 500) : 200).json(out)
  }

  // ── Notas fiscais: emissão em lote (?job=notas) ──
  // Mesma carona, mesmo motivo. Chamar por job próprio (e não junto do
  // WhatsApp) mantém os dois isolados: uma falha na emissão de nota não pode
  // derrubar a recuperação de carrinho, que é o que essa função existe pra fazer.
  if ((req.query.job || '') === 'notas') {
    try {
      const { rodarLoteNotas } = await import('./_notasLote.js')
      const out = await rodarLoteNotas({
        dias: req.query.dias,
        seco: req.query.seco === '1',
        max: Number(req.query.max) || 0,
      })
      return res.status(200).json(out)
    } catch (e) {
      return res.status(500).json({ ok: false, erro: String(e?.message || e).slice(0, 300) })
    }
  }

  // config (template/delay/janela editáveis na tela; credenciais só na env)
  let cfg = {}
  try {
    const r = await fetch(`${url}/rest/v1/wa_config?id=eq.1&select=*`, { headers: sbHeaders(key) })
    cfg = (await r.json())[0] || {}
  } catch {}

  const provider = process.env.WA_PROVIDER || cfg.provider || 'cloud'
  const steps = getSteps()

  const idsParam = (req.query.ids || '').toString().trim()
  const manualIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null

  if (!manualIds && !cfg.enabled) {
    return res.status(200).json({ ok: true, skipped: 'automático desabilitado (wa_config.enabled=false)' })
  }

  const now = Date.now()
  // candidatos: abandonados, não convertidos, ainda na cadência (wa_step<3), com telefone,
  // criados nos últimos 5 dias (cobre os 3 toques + folga)
  const cutoff = new Date(now - 5 * 86400000).toISOString()
  let query
  if (manualIds) {
    const inList = manualIds.map((i) => `"${i}"`).join(',')
    query = `${url}/rest/v1/kirvano_orders?id=in.(${inList})&select=*`
  } else {
    // recupera carrinho abandonado, pix/boleto PENDENTE (gerado mas não pago) E
    // cartão RECUSADO (REFUSED) — a Kirvano dá poucos abandonados, então pendente +
    // recusado são o grosso da recuperação.
    // Só vendas >= R$ MIN_VALUE (evita gastar disparo/risco de ban em pedido pequeno).
    // Para sozinho ao virar APPROVED (sai do filtro) ou recovered.
    const MIN_VALUE = parseFloat(process.env.WA_MIN_VALUE || '17')

    /* RAMPA DE VOLUME — ABANDONED fica FORA por padrão.
     *
     * O webhook só passou a gravar carrinho abandonado em 29/07 (antes todos
     * colidiam numa linha só). São ~25/dia, contra ~9/dia de disparo hoje: ligar
     * junto seria 3,7x da noite pro dia, e salto súbito é o que faz a API do
     * WhatsApp bloquear número — derrubando junto a recuperação de PIX que já
     * funciona (22,6% de conversão).
     *
     * Os dados são gravados desde já; só o DISPARO está represado. Pra liberar,
     * defina WA_ABANDONED=1 nas variáveis de ambiente da Vercel (sem redeploy do
     * código). Recomendado só depois de 3-4 dias com o CANCELED rodando estável.
     *
     * CANCELED entrou agora porque PIX_EXPIRED cai nele: quem gerava PIX e
     * expirava ANTES do cron passar saía da fila pra sempre (17 pedidos /
     * R$1.260 parados só no ULTRA PACK). Volume ~igual ao de hoje. */
    const statuses = ['PENDING', 'REFUSED', 'CANCELED']
    if (process.env.WA_ABANDONED === '1') statuses.unshift('ABANDONED')

    query =
      `${url}/rest/v1/kirvano_orders?status=in.(${statuses.join(',')})` +
      `&or=(wa_step.is.null,wa_step.lt.3)&customer_phone=not.is.null&value=gte.${MIN_VALUE}` +
      `&created_at=gte.${cutoff}&select=*&order=created_at.asc&limit=80`
  }

  let orders = []
  try {
    const r = await fetch(query, { headers: sbHeaders(key) })
    orders = await r.json()
  } catch (e) {
    return res.status(500).json({ error: 'falha ao buscar pedidos: ' + e.message })
  }
  if (!Array.isArray(orders)) orders = []

  /* GUARDA POR E-MAIL — não mandar "volte e finalize" pra quem já pagou.
   * O guard de status logo abaixo só pega quem converteu NA MESMA linha. Isso
   * funciona pra PIX/cartão (mesmo checkout_id do começo ao fim), mas NÃO pro
   * carrinho abandonado: a Kirvano não manda id no abandono, então a venda que
   * vem depois nasce numa linha nova e a linha abandonada fica ABANDONED pra
   * sempre. Sem esta checagem, ligar o abandono = mensagear cliente já pago. */
  const emails = [
    ...new Set(orders.map((o) => (o.customer_email || '').toLowerCase().trim()).filter(Boolean)),
  ]
  const jaComprou = new Set()
  if (emails.length) {
    try {
      const inList = emails.map((e) => `"${encodeURIComponent(e)}"`).join(',')
      const r = await fetch(
        `${url}/rest/v1/kirvano_orders?status=eq.APPROVED&customer_email=in.(${inList})&select=customer_email`,
        { headers: sbHeaders(key) },
      )
      const pagos = await r.json()
      if (Array.isArray(pagos)) {
        for (const p of pagos) jaComprou.add((p.customer_email || '').toLowerCase().trim())
      }
    } catch {
      /* falhou a checagem: segue com o guard de status. Não trava a fila. */
    }
  }

  const results = []
  for (const o of orders) {
    if (o.status === 'APPROVED' || o.recovered) {
      // "converted" = RECUPERADA, e só é recuperada quem recebeu mensagem ANTES de
      // pagar. Sem o teste do wa_sent_at, todo pedido que já estava pago quando o
      // cron passava virava "converted" — 426 dos 428 "recuperados" de 23–27/07
      // nunca tinham recebido nada, e o painel somava isso como receita (R$23 mil
      // fantasma contra R$1,3 mil reais).
      const recebeuMsg = !!o.wa_sent_at
      await patchOrder(url, key, o.id, {
        wa_status: recebeuMsg ? 'converted' : 'skipped',
        wa_error: recebeuMsg ? null : 'pagou sem receber mensagem (não é recuperação)',
        wa_step: STEP_FIM,
      })
      results.push({ id: o.id, skipped: recebeuMsg ? 'recuperada' : 'já estava paga (sem disparo)' })
      continue
    }
    const mail = (o.customer_email || '').toLowerCase().trim()
    if (mail && jaComprou.has(mail)) {
      await patchOrder(url, key, o.id, {
        wa_status: 'skipped',
        wa_error: 'já comprou em outro pedido (não mensagear)',
        wa_step: STEP_FIM,
      })
      results.push({ id: o.id, skipped: 'já comprou em outro pedido' })
      continue
    }

    const phone = waPhone(o.customer_phone)
    if (!phone) {
      await patchOrder(url, key, o.id, { wa_status: 'skipped', wa_error: 'sem telefone', wa_step: 3 })
      results.push({ id: o.id, skipped: 'sem telefone' })
      continue
    }

    // REGRA POR PRODUTO: só o STL entra na recuperação. Medição 20/06–28/07:
    //   STL     → 178 disparos, 16 vendas, R$1.284,40 (9%)
    //   não-STL → 119 disparos,  1 venda,  R$29,90    (1%)
    // Os disparos de canecas/Melodify/Pedreiro/moldes não se pagavam e gastavam a
    // reputação do número à toa. Envio manual (?ids=) ignora esta regra.
    if (!manualIds && !isStlOrder(o)) {
      await patchOrder(url, key, o.id, {
        wa_status: 'skipped',
        wa_error: 'produto fora da recuperação (só STL)',
        wa_step: STEP_FIM,
      })
      results.push({ id: o.id, skipped: 'produto não-STL' })
      continue
    }

    // Cadência já cumprida (inclusive os que ficaram em wa_step 1/2 de quando ela
    // tinha 3 passos): encerra de vez. Sem isto eles voltariam em toda rodada só
    // pra receber "waiting", ocupando as 80 vagas da fila sem nunca sair dela.
    if (!manualIds && (o.wa_step || 0) >= MAX_STEPS) {
      await patchOrder(url, key, o.id, { wa_status: 'done', wa_step: STEP_FIM })
      results.push({ id: o.id, skipped: 'cadência concluída' })
      continue
    }

    // no modo manual, força o próximo passo; no cron, respeita o tempo
    const idx = manualIds ? (o.wa_step || 0) : dueStep(o, cfg, now)
    if (idx === -2) {
      await patchOrder(url, key, o.id, { wa_status: 'skipped', wa_error: 'janela expirada', wa_step: 3 })
      results.push({ id: o.id, skipped: 'expirado' })
      continue
    }
    if (idx < 0 || idx > 2) {
      results.push({ id: o.id, waiting: true, step: o.wa_step || 0 })
      continue
    }

    // DIA 2 = vídeo dos STLs. Quem NÃO comprou STL não recebe essa mensagem:
    // pula pro dia 3 (não dispara vídeo de STL pra quem comprou Moldes/Flexi/etc).
    if (idx === 1 && !isStlOrder(o)) {
      await patchOrder(url, key, o.id, {
        wa_step: 2,
        wa_status: 'sent',
        wa_last_try: new Date().toISOString(),
      })
      results.push({ id: o.id, skipped: 'dia 2 pulado (vídeo é STL; produto não-STL)' })
      continue
    }

    const stepDef = steps[idx]
    const out = await sendStep(provider, phone, stepDef, o)

    await fetch(`${url}/rest/v1/wa_messages`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify([
        {
          order_id: o.id,
          phone,
          body: `[dia ${stepDef.day}] ${stepDef.template}`,
          provider,
          ok: out.ok,
          http_status: out.http,
          response: out.response,
        },
      ]),
    })

    // acabou a cadência? marca STEP_FIM pra sair da fila (a query filtra wa_step<3)
    const acabou = idx + 1 >= MAX_STEPS
    await patchOrder(url, key, o.id, {
      wa_step: out.ok ? (acabou ? STEP_FIM : idx + 1) : o.wa_step || 0, // só avança se enviou
      wa_status: out.ok ? (acabou ? 'done' : 'sent') : 'failed',
      wa_attempts: (o.wa_attempts || 0) + 1,
      wa_sent_at: out.ok ? new Date().toISOString() : o.wa_sent_at,
      wa_last_try: new Date().toISOString(),
      wa_error: out.ok ? null : JSON.stringify(out.response).slice(0, 400),
    })
    results.push({ id: o.id, phone, day: stepDef.day, ok: out.ok, http: out.http })
  }

  const sent = results.filter((r) => r.ok).length
  return res.status(200).json({ ok: true, provider, processed: results.length, sent, results })
}

async function patchOrder(url, key, id, patch) {
  try {
    await fetch(`${url}/rest/v1/kirvano_orders?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders(key, { Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    })
  } catch {}
}
