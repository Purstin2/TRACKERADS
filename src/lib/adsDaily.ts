/**
 * TRACKER PADRÃO — registro imutável do que foi gasto em anúncios.
 *
 * O problema que isto resolve: a dashboard lê o gasto da API do Meta filtrando
 * por status da campanha. Pausar uma campanha a tira da conta e a margem SOBE;
 * excluir a campanha some com o custo pra sempre. Isso reescreve o passado — e
 * o dinheiro já saiu da conta naquele dia, independente do status de hoje.
 *
 * Aqui a gente fotografa gasto por CAMPANHA × DIA (sem filtro de status) e
 * guarda no Supabase. A partir daí o histórico é nosso, não do Meta.
 */
import { supabase } from './supabase'

export interface DailySpendRow {
  dia: string        // YYYY-MM-DD (fuso da conta de anúncio)
  acc_id: string
  camp_id: string
  camp_name: string
  spend_brl: number  // já convertido pra BRL
}

/** Grava/atualiza o snapshot. Idempotente: reprocessar o mesmo dia só corrige o valor. */
export async function saveSnapshot(rows: DailySpendRow[]): Promise<number> {
  const sb = supabase()
  const limpo = rows.filter((r) => r.dia && r.camp_id && r.acc_id)
  if (!sb || !limpo.length) return 0
  const agora = new Date().toISOString()
  let ok = 0
  // lotes de 500 pra não estourar o payload do PostgREST
  for (let i = 0; i < limpo.length; i += 500) {
    const lote = limpo.slice(i, i + 500).map((r) => ({
      dia: r.dia,
      acc_id: r.acc_id,
      camp_id: r.camp_id,
      camp_name: r.camp_name || '',
      spend_brl: Math.round(r.spend_brl * 100) / 100,
      updated_at: agora,
    }))
    const { error } = await sb.from('ads_daily').upsert(lote, { onConflict: 'dia,camp_id' })
    if (!error) ok += lote.length
    else console.warn('[tracker padrão] falha ao salvar lote:', error.message)
  }
  return ok
}

/**
 * Lê o gasto salvo no período. É a fonte de verdade do Tracker Padrão:
 * devolve TUDO que rodou naqueles dias, mesmo que a campanha hoje esteja
 * pausada ou tenha sido excluída.
 */
export async function readSnapshot(
  since: string,
  until: string,
  accIds?: string[],
): Promise<DailySpendRow[]> {
  const sb = supabase()
  if (!sb) return []
  const out: DailySpendRow[] = []
  let from = 0
  for (;;) {
    let q = sb
      .from('ads_daily')
      .select('dia,acc_id,camp_id,camp_name,spend_brl')
      .gte('dia', since)
      .lte('dia', until)
      .order('dia', { ascending: true })
      .range(from, from + 999)
    if (accIds && accIds.length) q = q.in('acc_id', accIds)
    const { data, error } = await q
    if (error) { console.warn('[tracker padrão] falha ao ler:', error.message); break }
    const lote = (data || []) as DailySpendRow[]
    out.push(...lote)
    if (lote.length < 1000) break
    from += 1000
  }
  return out
}

/** Agregações prontas pro buildRealDashboard, a partir das linhas salvas. */
export function agregar(rows: DailySpendRow[], accNames: Record<string, string> = {}) {
  let total = 0
  const porDia: Record<string, number> = {}
  const porConta: Record<string, number> = {}
  const porCamp: Record<string, { key: string; accId: string; name: string; spend: number }> = {}
  for (const r of rows) {
    const v = Number(r.spend_brl) || 0
    total += v
    porDia[r.dia] = (porDia[r.dia] || 0) + v
    porConta[r.acc_id] = (porConta[r.acc_id] || 0) + v
    const key = `${r.acc_id}::${r.camp_id}`
    if (!porCamp[key]) porCamp[key] = { key, accId: r.acc_id, name: r.camp_name || '(sem nome)', spend: 0 }
    porCamp[key].spend += v
  }
  return {
    total,
    porDia,
    porCamp: Object.values(porCamp).sort((a, b) => b.spend - a.spend),
    accountSpend: Object.entries(porConta).map(([id, spend]) => ({
      id, name: accNames[id] || id, spend,
    })),
  }
}

/** Quantos dias já temos guardados (pra avisar quando o histórico ainda é curto). */
export async function coberturaSnapshot(accIds?: string[]): Promise<{ dias: number; primeiro: string | null; ultimo: string | null }> {
  const sb = supabase()
  if (!sb) return { dias: 0, primeiro: null, ultimo: null }
  let q = sb.from('ads_daily').select('dia').order('dia', { ascending: true }).limit(1)
  if (accIds && accIds.length) q = q.in('acc_id', accIds)
  const { data: pri } = await q
  let q2 = sb.from('ads_daily').select('dia').order('dia', { ascending: false }).limit(1)
  if (accIds && accIds.length) q2 = q2.in('acc_id', accIds)
  const { data: ult } = await q2
  const primeiro = (pri && pri[0]?.dia) || null
  const ultimo = (ult && ult[0]?.dia) || null
  const dias = primeiro && ultimo
    ? Math.round((new Date(ultimo).getTime() - new Date(primeiro).getTime()) / 86400000) + 1
    : 0
  return { dias, primeiro, ultimo }
}
