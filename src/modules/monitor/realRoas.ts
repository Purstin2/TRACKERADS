import { supabase, fetchAll } from '@/lib/supabase'

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

/** Nome da campanha embutido no utm_campaign ("NOME|123456" → "NOME").
 *  Serve de fallback quando a venda vem de campanha que não está no fetch do Meta
 *  (pausada, outro filtro de status) — assim uma venda nunca fica invisível. */
export function campNameFromUtm(utm?: string | null): string | null {
  const s = (utm || '').trim()
  if (!s) return null
  const n = s.split('|')[0].trim()
  return n || null
}

/** Uma campanha que vendeu na janela, com a hora da ÚLTIMA venda. */
export interface LiveSale {
  campId: string
  name: string | null // do utm (fallback quando não achamos no Meta)
  sales: number
  revenue: number
  lastAt: string // ISO da venda mais recente
}

/** Vendas aprovadas desde `sinceISO`, agrupadas por campanha e ordenadas pela
 *  venda MAIS RECENTE primeiro. É a base da aba "Ao vivo": o gateway é a única
 *  fonte com hora exata da venda (o Meta só dá agregado do dia/hora). */
export async function fetchRecentSales(sinceISO: string): Promise<LiveSale[]> {
  const sb = supabase()
  if (!sb) return []
  const rows = await fetchAll<{ utm_campaign: string | null; value: number | null; ordered_at: string | null }>((from, to) =>
    sb
      .from('kirvano_orders')
      .select('utm_campaign,value,ordered_at')
      .eq('status', 'APPROVED')
      .gte('ordered_at', sinceISO)
      .order('ordered_at', { ascending: false })
      .range(from, to),
  )
  const map = new Map<string, LiveSale>()
  for (const o of rows) {
    const id = campIdFromUtm(o.utm_campaign)
    if (!id || !o.ordered_at) continue
    const cur = map.get(id)
    if (!cur) {
      map.set(id, { campId: id, name: campNameFromUtm(o.utm_campaign), sales: 1, revenue: o.value || 0, lastAt: o.ordered_at })
    } else {
      cur.sales += 1
      cur.revenue += o.value || 0
      if (o.ordered_at > cur.lastAt) cur.lastAt = o.ordered_at
    }
  }
  return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
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
  // Paginado: o `.limit(5000)` de antes recebia 1000 do servidor e calava a boca —
  // em 14 dias isso é metade das vendas, então ROAS real / V. reais / Lucro real
  // apareciam MENORES do que a realidade. Nunca confie em limit > 1000 aqui.
  const data = await fetchAll<{ utm_campaign: string | null; value: number | null }>((from, to) => {
    let q = sb
      .from('kirvano_orders')
      .select('utm_campaign,value')
      .eq('status', 'APPROVED')
      .gte('created_at', since)
      .range(from, to)
    if (until) q = q.lt('created_at', until)
    return q
  })
  const map: Record<string, RealAgg> = {}
  for (const o of data) {
    const id = campIdFromUtm(o.utm_campaign)
    if (!id) continue
    const agg = (map[id] ??= { sales: 0, revenue: 0 })
    agg.sales++
    agg.revenue += o.value || 0
  }
  return map
}
