// ════════════════════════════════════════════════════════════════════
// PURSTINLAB 3.0 · Motor de regras + briefing matinal
//
// Avalia a régua de escala/pause NO SERVIDOR (sem depender de abrir o painel):
//   ESCALAR → 2 dias seguidos (ontem + anteontem) com ROAS ≥ roasGood
//   MATAR   → 3 dias seguidos ROAS < roasBe (com gasto) OU 3 dias gasto sem
//             venda OU CPA 7d > cpaMax
//   PERTO   → ontem ≥ roasGood, anteontem não
//
// ROAS usa o FATURAMENTO REAL do gateway (kirvano_orders casado por ID de
// campanha no utm_campaign "NOME|id"); sem venda real no dia, cai pro ROAS
// do Meta. Contas USD convertem gasto pelo fx dos Parâmetros.
//
// Lê do app_state (Supabase): meta_tok, monitor_accounts_v1, meta_settings,
// briefing_phone. Salva o resultado em app_state.last_briefing e, se houver
// telefone, manda texto pelo WhatsApp Cloud API (mesmas envs da recuperação).
//
// CHAMADA:  GET/POST /api/briefing?secret=WEBHOOK_SECRET
// CRON:     cron-job.org diário ~08:00 BRT na URL acima
// ════════════════════════════════════════════════════════════════════

const META = 'https://graph.facebook.com/v22.0'

function sbHeaders(key, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra }
}
async function stateGet(url, key, k) {
  try {
    const r = await fetch(`${url}/rest/v1/app_state?key=eq.${encodeURIComponent(k)}&select=value`, { headers: sbHeaders(key) })
    const j = await r.json()
    return Array.isArray(j) && j[0] ? j[0].value : null
  } catch { return null }
}
async function stateSet(url, key, k, value) {
  try {
    await fetch(`${url}/rest/v1/app_state?on_conflict=key`, {
      method: 'POST',
      headers: sbHeaders(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key: k, value, updated_at: new Date().toISOString() }),
    })
  } catch {}
}

// dia BRT (YYYY-MM-DD) — mesma convenção do painel (todayBR)
const dayBR = (t) => new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10)
const startBR = (d) => new Date(`${d}T00:00:00-03:00`).toISOString()

// extrai vendas/ROAS dos actions do insights (mesmos action types do painel)
const ATYPES = ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase']
function metaSales(row) {
  for (const t of ATYPES) {
    const a = (row.actions || []).find((x) => x.action_type === t)
    if (a) return parseFloat(a.value) || 0
  }
  return 0
}
function metaRevenue(row) {
  for (const t of ATYPES) {
    const a = (row.purchase_roas || []).find((x) => x.action_type === t)
    if (a) return (parseFloat(a.value) || 0) * (parseFloat(row.spend) || 0)
  }
  return 0
}

// insights diários (últimos 8 dias) de uma conta, nível campanha, só ativas
async function fetchDaily(accId, token, sinceDay, untilDay) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,purchase_roas,actions,date_start',
    time_range: JSON.stringify({ since: sinceDay, until: untilDay }),
    time_increment: '1',
    filtering: JSON.stringify([{ field: 'campaign.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: '500',
    access_token: token,
  })
  let rows = []
  let next = `${META}/act_${accId}/insights?${p}`
  for (let g = 0; next && g < 4; g++) {
    const j = await (await fetch(next)).json()
    if (j.error) throw new Error(j.error.message)
    rows = rows.concat(j.data || [])
    next = j.paging && j.paging.next
  }
  return rows
}

// vendas reais aprovadas dos últimos 8 dias, agregadas por campId × diaBR
async function fetchReal(url, key, sinceISO) {
  const r = await fetch(
    `${url}/rest/v1/kirvano_orders?select=utm_campaign,value,created_at&status=eq.APPROVED&created_at=gte.${sinceISO}&limit=5000`,
    { headers: sbHeaders(key) },
  )
  const rows = (await r.json()) || []
  const map = {} // campId → { dia → {sales, revenue} }
  for (const o of Array.isArray(rows) ? rows : []) {
    const m = String(o.utm_campaign || '').match(/\|(\d{8,})\s*$/)
    if (!m) continue
    const dia = dayBR(new Date(o.created_at).getTime())
    const byDay = (map[m[1]] ??= {})
    const d = (byDay[dia] ??= { sales: 0, revenue: 0 })
    d.sales++
    d.revenue += o.value || 0
  }
  return map
}

// régua por campanha — days = [d1(ontem), d2, d3...] cada {roas, spend, sales}
function evaluate(days, S) {
  const [d1, d2, d3] = days
  const has = (d) => d && d.spend > 0.5
  const r = (d) => (d && d.roas != null ? d.roas : null)
  if (has(d1) && has(d2) && r(d1) >= S.roasGood && r(d2) >= S.roasGood) return 'escalar'
  if (has(d1) && has(d2) && has(d3) && r(d1) < S.roasBe && r(d2) < S.roasBe && r(d3) < S.roasBe) return 'matar'
  if (has(d1) && has(d2) && has(d3) && !d1.sales && !d2.sales && !d3.sales) return 'matar'
  const sp7 = days.reduce((a, d) => a + (d ? d.spend : 0), 0)
  const sl7 = days.reduce((a, d) => a + (d ? d.sales : 0), 0)
  if (sp7 > 0 && sl7 > 0 && sp7 / sl7 > S.cpaMax) return 'matar'
  if (has(d1) && r(d1) >= S.roasGood && !(has(d2) && r(d2) >= S.roasGood)) return 'perto'
  return null
}

const short = (n) => (n || '').replace(/\s*\|\s*\d+$/, '').slice(0, 42)

async function sendWa(phone, text) {
  const pid = process.env.WA_PHONE_ID
  const tok = process.env.WA_TOKEN
  if (!pid || !tok) return { ok: false, skip: 'WA_PHONE_ID/WA_TOKEN não configurados' }
  try {
    const r = await fetch(`${META}/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text.slice(0, 4000) } }),
    })
    const j = await r.json()
    return { ok: r.ok && !j.error, response: j }
  } catch (e) {
    return { ok: false, response: { error: e.message } }
  }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase não configurado' })

  const isCron = !!req.headers['x-vercel-cron']
  if (!isCron && process.env.WEBHOOK_SECRET && req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'invalid secret' })
  }

  // config vinda do painel (app_state)
  const token = await stateGet(url, key, 'meta_tok')
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'sem token do Meta no app_state — abra o Monitor uma vez com o token colado' })
  }
  const accounts = (await stateGet(url, key, 'monitor_accounts_v1')) || []
  const sRaw = (await stateGet(url, key, 'meta_settings')) || {}
  const S = {
    roasGood: +sRaw.roasGood || 2.0,
    roasBe: +sRaw.roasBe || 1.25,
    cpaMax: +sRaw.cpaMax || 12,
    fx: +sRaw.fx || 5.4,
  }

  const now = Date.now()
  const hoje = dayBR(now)
  const dias = [] // [ontem, anteontem, ...] 7 dias fechados
  for (let i = 1; i <= 7; i++) dias.push(dayBR(now - i * 86400000))

  // saúde do token (entra no briefing)
  let tokenLine = ''
  try {
    const dj = await (await fetch(`${META}/debug_token?input_token=${token}&access_token=${token}`)).json()
    const exp = dj.data && dj.data.expires_at
    if (dj.data && dj.data.is_valid === false) tokenLine = '⛔ token do Meta INVÁLIDO — cole um novo no Monitor'
    else if (exp > 0) {
      const dLeft = Math.floor((exp * 1000 - now) / 86400000)
      if (dLeft <= 7) tokenLine = `⚠️ token do Meta vence em ${dLeft <= 0 ? 'HOJE' : dLeft + ' dia(s)'}`
    }
  } catch {}

  const real = await fetchReal(url, key, startBR(dias[6]))

  const buckets = { escalar: [], matar: [], perto: [] }
  const errors = []
  await Promise.all(
    (Array.isArray(accounts) ? accounts : []).map(async (acc) => {
      try {
        const rows = await fetchDaily(acc.id, token, dias[6], hoje)
        const camps = {} // campId → { name, byDay }
        for (const r of rows) {
          const c = (camps[r.campaign_id] ??= { name: r.campaign_name || r.campaign_id, byDay: {} })
          c.byDay[r.date_start] = r
        }
        const fx = acc.cur === 'USD' ? S.fx : 1
        for (const [cid, c] of Object.entries(camps)) {
          const days = dias.map((d) => {
            const row = c.byDay[d]
            if (!row) return null
            const spend = parseFloat(row.spend) || 0
            const rd = real[cid] && real[cid][d]
            // ROAS efetivo: real (gateway, BRL / gasto convertido) quando existe; senão Meta
            const roas = rd && rd.revenue > 0
              ? rd.revenue / (spend * fx || 1)
              : spend > 0 ? metaRevenue(row) / spend : null
            const sales = rd ? rd.sales : metaSales(row)
            return { spend, roas, sales }
          })
          const verdict = evaluate(days, S)
          if (!verdict) continue
          const d1 = days[0] || { roas: null, spend: 0, sales: 0 }
          buckets[verdict].push({
            acc: acc.name,
            name: short(c.name),
            roas1: d1.roas != null ? d1.roas.toFixed(2) : '—',
            roas2: days[1] && days[1].roas != null ? days[1].roas.toFixed(2) : '—',
            spend1: d1.spend.toFixed(0),
            cur: acc.cur === 'USD' ? '$' : 'R$',
            realDay: !!(real[cid] && real[cid][dias[0]]),
          })
        }
      } catch (e) {
        errors.push(`${acc.name}: ${e.message}`)
      }
    }),
  )

  // ── monta o texto ──
  const L = []
  const hh = new Date(now - 3 * 3600 * 1000).toISOString().slice(11, 16)
  L.push(`⚡ *PurstinLab · briefing ${hoje.slice(8)}/${hoje.slice(5, 7)} ${hh}*`)
  const line = (b) => `• ${b.name} (${b.acc}) — ROAS ${b.roas2}→${b.roas1}${b.realDay ? ' (real)' : ''} · gasto ${b.cur}${b.spend1}/d`
  if (buckets.escalar.length) {
    L.push('', `🚀 *ESCALAR (${buckets.escalar.length})* — 2 dias ≥ ${S.roasGood}`)
    buckets.escalar.slice(0, 6).forEach((b) => L.push(line(b)))
  }
  if (buckets.matar.length) {
    L.push('', `🔴 *RÉGUA DE MATAR (${buckets.matar.length})* — abaixo de ${S.roasBe} / CPA estourado`)
    buckets.matar.slice(0, 6).forEach((b) => L.push(line(b)))
  }
  if (buckets.perto.length) {
    L.push('', `📈 *PERTO (${buckets.perto.length})* — ontem bateu, falta +1 dia`)
    buckets.perto.slice(0, 4).forEach((b) => L.push(line(b)))
  }
  if (!buckets.escalar.length && !buckets.matar.length && !buckets.perto.length) {
    L.push('', '✅ Nenhuma campanha bateu a régua ontem — sem ação obrigatória hoje.')
  }
  if (tokenLine) L.push('', tokenLine)
  if (errors.length) L.push('', `⚠ contas com erro: ${errors.slice(0, 3).join(' · ')}`)
  const text = L.join('\n')

  // salva pro painel exibir
  const briefing = { ts: new Date().toISOString(), text, counts: { escalar: buckets.escalar.length, matar: buckets.matar.length, perto: buckets.perto.length } }
  await stateSet(url, key, 'last_briefing', briefing)

  // WhatsApp (opcional — precisa de briefing_phone configurado no painel)
  let wa = { ok: false, skip: 'briefing_phone não configurado no painel' }
  const phone = await stateGet(url, key, 'briefing_phone')
  if (phone && String(phone).replace(/\D/g, '').length >= 10) {
    wa = await sendWa(String(phone).replace(/\D/g, ''), text)
  }

  return res.status(200).json({ ok: true, counts: briefing.counts, wa, errors })
}
