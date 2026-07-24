/**
 * TRACKER PADRÃO — captura automática do gasto em anúncios.
 *
 * Grava gasto por CAMPANHA × DIA na tabela ads_daily, SEM filtro de status.
 * É o que garante que campanha pausada (ou excluída) continue contando no dia
 * em que gastou — a API do Meta esconde o custo dessas, e aí a margem sobe
 * sozinha sem nada de real ter mudado.
 *
 * Roda sozinho por cron; não depende de ninguém abrir a dashboard.
 *
 *   GET /api/recover?job=ads&secret=<WEBHOOK_SECRET>&dias=7
 *
 * Mora aqui como HELPER (o `_` faz a Vercel não tratar como rota) porque o plano
 * Hobby só permite 12 funções serverless e o projeto já está no teto — então a
 * captura pega carona no /api/recover, que já é o endpoint de cron.
 *
 * Env necessários: META_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Opcional: FX_BRL (câmbio USD→BRL, padrão 5.40)
 */
const META_API = 'v22.0'
const GRAPH = `https://graph.facebook.com/${META_API}`

// mesma lista do front: tudo, inclusive arquivada/excluída
const ALL_STATUS = [
  'ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED', 'CAMPAIGN_PAUSED',
  'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES',
]

const sbHeaders = () => ({
  apikey: process.env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
})

/** Segue a paginação do Graph até acabar (insights vem em páginas de 500). */
async function paginate(url) {
  const out = []
  let next = url
  let guard = 0
  while (next && guard++ < 40) {
    const r = await fetch(next)
    const j = await r.json()
    if (j.error) throw new Error(j.error.message || 'erro no Graph')
    out.push(...(j.data || []))
    next = j.paging?.next || null
  }
  return out
}

/** Executa a captura. Devolve um resumo pra rota logar/responder. */
export async function rodarSnapshot({ dias: diasIn = 7 } = {}) {
  const token = (process.env.META_TOKEN || '').trim()
  if (!token) return { erro: 'META_TOKEN nao configurado', http: 500 }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { erro: 'Supabase nao configurado', http: 500 }
  }

  const dias = Math.min(Math.max(parseInt(diasIn, 10) || 7, 1), 90)
  const fx = parseFloat(process.env.FX_BRL || '5.40') || 5.40
  const hoje = new Date()
  const until = hoje.toISOString().slice(0, 10)
  const since = new Date(hoje.getTime() - dias * 86400000).toISOString().slice(0, 10)

  try {
    // 1) contas do usuário (moeda vem junto → conversão certa por conta)
    const contas = await paginate(
      `${GRAPH}/me/adaccounts?fields=account_id,name,currency&limit=100&access_token=${token}`,
    )
    if (!contas.length) return { ok: true, contas: 0, linhas: 0, aviso: 'nenhuma conta' }

    // 2) gasto por campanha × dia, em cada conta, SEM filtro de status.
    // Grava A CADA CONTA (não no final): num backfill longo, se a função for
    // cortada no meio, o que já rodou fica salvo em vez de se perder inteiro.
    let total = 0
    let gravadas = 0
    const porConta = []
    for (const c of contas) {
      const accId = c.account_id
      const toBRL = c.currency === 'BRL' ? 1 : fx
      const p = new URLSearchParams({
        level: 'campaign',
        fields: 'campaign_id,campaign_name,spend,date_start',
        time_range: JSON.stringify({ since, until }),
        time_increment: '1',
        filtering: JSON.stringify([
          { field: 'campaign.effective_status', operator: 'IN', value: ALL_STATUS },
        ]),
        limit: '500',
        access_token: token,
      })
      let rows = []
      try {
        rows = await paginate(`${GRAPH}/act_${accId}/insights?${p}`)
      } catch (e) {
        porConta.push({ conta: c.name || accId, erro: String(e.message || e) })
        continue
      }
      const linhas = []
      for (const r of rows) {
        if (!r.campaign_id || !r.date_start) continue
        const v = parseFloat(r.spend || '0') * toBRL
        linhas.push({
          dia: String(r.date_start).slice(0, 10),
          acc_id: String(accId),
          camp_id: String(r.campaign_id),
          camp_name: r.campaign_name || '',
          spend_brl: Math.round(v * 100) / 100,
          updated_at: new Date().toISOString(),
        })
      }
      // upsert em lotes (chave: dia + camp_id → reprocessar só corrige o valor)
      let ok = 0
      for (let i = 0; i < linhas.length; i += 500) {
        const lote = linhas.slice(i, i + 500)
        const rs = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/ads_daily?on_conflict=dia,camp_id`,
          { method: 'POST', headers: sbHeaders(), body: JSON.stringify(lote) },
        )
        if (rs.ok) ok += lote.length
        else console.error('[ads-snapshot] lote falhou:', rs.status, await rs.text())
      }
      total += linhas.length
      gravadas += ok
      porConta.push({ conta: c.name || accId, moeda: c.currency, linhas: linhas.length, gravadas: ok })
    }

    return {
      ok: true, periodo: { since, until }, contas: contas.length,
      linhas: total, gravadas, detalhe: porConta,
    }
  } catch (e) {
    console.error('[ads-snapshot]', e)
    return { erro: String(e.message || e), http: 500 }
  }
}
