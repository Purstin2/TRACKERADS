import { supabase } from '@/lib/supabase'

/**
 * ROAS REAL por campanha: junta as vendas aprovadas do gateway (kirvano_orders)
 * com a campanha do Meta pelo ID embutido no utm_campaign ("NOME|123456789").
 * É o número que o Meta NÃO mostra — venda orgânica de quem clicou no anúncio,
 * janela de atribuição estourada e bump entram aqui; lá não.
 */

export interface RealAgg {
  sales: number
  revenue: number // soma dos valores do gateway (BRL na prática)
}

/** Extrai o ID da campanha do utm_campaign "NOME|123..." (macro {{campaign.id}}). */
export function campIdFromUtm(utm?: string | null): string | null {
  const s = (utm || '').trim()
  if (!s) return null
  const m = s.match(/\|(\d{8,})\s*$/)
  return m ? m[1] : null
}

/** Converte o date_preset do Meta em janela [since, until) ISO usando o dia BRT.
 *  last_Nd no Graph exclui hoje — a janela replica isso pra bater com o gasto. */
export function presetRange(preset: string): { since: string; until?: string } {
  const dayBR = (t: number) => new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const startBR = (d: string) => new Date(`${d}T00:00:00-03:00`).toISOString()
  const now = Date.now()
  const today = dayBR(now)
  if (preset === 'today') return { since: startBR(today) }
  if (preset === 'yesterday') return { since: startBR(dayBR(now - 86400000)), until: startBR(today) }
  const days = preset === 'last_7d' ? 7 : preset === 'last_30d' ? 30 : 14
  return { since: startBR(dayBR(now - days * 86400000)), until: startBR(today) }
}

/** Vendas reais aprovadas no período, agregadas por ID de campanha do Meta. */
export async function fetchRealByCampaign(preset: string): Promise<Record<string, RealAgg>> {
  const sb = supabase()
  if (!sb) return {}
  const { since, until } = presetRange(preset)
  let q = sb
    .from('kirvano_orders')
    .select('utm_campaign,value')
    .eq('status', 'APPROVED')
    .gte('created_at', since)
    .limit(5000)
  if (until) q = q.lt('created_at', until)
  const { data } = await q
  const map: Record<string, RealAgg> = {}
  for (const o of (data || []) as { utm_campaign: string | null; value: number | null }[]) {
    const id = campIdFromUtm(o.utm_campaign)
    if (!id) continue
    const agg = (map[id] ??= { sales: 0, revenue: 0 })
    agg.sales++
    agg.revenue += o.value || 0
  }
  return map
}
