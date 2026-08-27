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
  let s = (utm || '').trim()
  if (!s) return null
  // Parâmetro repetido na URL (?utm_campaign=X&utm_campaign=X) chega na Kirvano
  // como ARRAY JSON e o campo é cortado em 255 chars — aí o valor não termina
  // mais em "|<id>" e a venda ficava órfã (14 vendas / R$1.213 em 30d).
  // O 1º elemento do array vem inteiro, então é dele que se tira o id.
  if (s.startsWith('[')) {
    const first = s.match(/^\[\s*"((?:[^"\\]|\\.)*)"/)
    if (first) s = first[1].replace(/\\"/g, '"')
  }
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

/** Uma campanha que vendeu na janela, com a hora da ÚLTIMA venda.
 *  Traz TAMBÉM o total do dia: sem isso o "2" da janela conflita visualmente com
 *  o "6" do Histórico (que é o dia inteiro) e parece bug — são perguntas diferentes. */
export interface LiveSale {
  campId: string
  name: string | null // do utm (fallback quando não achamos no Meta)
  sales: number // na JANELA escolhida
  revenue: number // na janela
  salesToday: number // no dia BR inteiro (contexto)
  revenueToday: number
  lastAt: string // ISO da venda mais recente
}

/** Vendas aprovadas agrupadas por campanha, ordenadas pela venda MAIS RECENTE.
 *  Uma consulta só cobre as duas janelas (busca da mais antiga entre elas):
 *  `windowSinceISO` = a janela da aba; `dayStartISO` = 00h BR, pro total do dia.
 *  Devolve só quem vendeu DENTRO da janela — é uma tela de "acabou de vender". */
export async function fetchRecentSales(windowSinceISO: string, dayStartISO: string): Promise<LiveSale[]> {
  const sb = supabase()
  if (!sb) return []
  const desde = windowSinceISO < dayStartISO ? windowSinceISO : dayStartISO
  const rows = await fetchAll<{ utm_campaign: string | null; value: number | null; ordered_at: string | null }>((from, to) =>
    sb
      .from('kirvano_orders')
      .select('utm_campaign,value,ordered_at')
      .eq('status', 'APPROVED')
      .gte('ordered_at', desde)
      .order('ordered_at', { ascending: false })
      .range(from, to),
  )
  const map = new Map<string, LiveSale>()
  for (const o of rows) {
    const id = campIdFromUtm(o.utm_campaign)
    if (!id || !o.ordered_at) continue
    const at = o.ordered_at
    const cur =
      map.get(id) ||
      map.set(id, { campId: id, name: campNameFromUtm(o.utm_campaign), sales: 0, revenue: 0, salesToday: 0, revenueToday: 0, lastAt: at }).get(id)!
    const v = o.value || 0
    if (at >= dayStartISO) { cur.salesToday += 1; cur.revenueToday += v }
    if (at >= windowSinceISO) { cur.sales += 1; cur.revenue += v; if (at > cur.lastAt) cur.lastAt = at }
  }
  return [...map.values()].filter((c) => c.sales > 0).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}

/** Uma venda individual de uma campanha, com a hora exata. */
export interface CampSale {
  at: string // ISO
  value: number
  product: string | null
}

/** Todas as vendas aprovadas de UMA campanha desde `sinceISO`, mais recente primeiro.
 *  Casa pelo final do utm_campaign ("...|<campId>") — o id é numérico e único, então
 *  o LIKE não pega campanha errada. É o que alimenta o "Vendas por horário". */
export async function fetchCampaignSales(campId: string, sinceISO: string): Promise<CampSale[]> {
  const sb = supabase()
  if (!sb) return []
  const rows = await fetchAll<{ ordered_at: string | null; value: number | null; product: string | null }>((from, to) =>
    sb
      .from('kirvano_orders')
      .select('ordered_at,value,product')
      .eq('status', 'APPROVED')
      .like('utm_campaign', `%|${campId}`)
      .gte('ordered_at', sinceISO)
      .order('ordered_at', { ascending: false })
      .range(from, to),
  )
  return rows
    .filter((r) => r.ordered_at)
    .map((r) => ({ at: r.ordered_at as string, value: r.value || 0, product: r.product }))
}

/** Converte o date_preset do Meta em janela [since, until) ISO usando o dia BRT.
 *  last_Nd no Graph exclui hoje — a janela replica isso pra bater com o gasto. */
export function presetRange(preset: string): { since: string; until?: string } {
  const dayBR = (t: number) => new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const startBR = (d: string) => new Date(`${d}T00:00:00-03:00`).toISOString()
  const now = Date.now()
  const today = dayBR(now)
  // Personalizado: "custom:AAAA-MM-DD:AAAA-MM-DD" — inclui o dia final (until+1 exclusivo).
  if (typeof preset === 'string' && preset.startsWith('custom:')) {
    const [, since, until] = preset.split(':')
    if (since && until) {
      const u = new Date(`${until}T00:00:00-03:00`)
      u.setDate(u.getDate() + 1)
      return { since: startBR(since), until: u.toISOString() }
    }
  }
  if (preset === 'today') return { since: startBR(today) }
  if (preset === 'yesterday') return { since: startBR(dayBR(now - 86400000)), until: startBR(today) }
  if (preset === 'day_before_yesterday') {
    const d = dayBR(now - 2 * 86400000)
    return { since: startBR(d), until: startBR(dayBR(now - 86400000)) }
  }
  // last_Nd (7/14/30 e o novo 4d) — janela de N dias terminando ontem, igual ao Graph.
  const md = /^last_(\d+)d$/.exec(preset || '')
  const days = md ? parseInt(md[1]) : 14
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
  // `ordered_at` e não `created_at`: um é QUANDO A VENDA ACONTECEU, o outro é
  // quando o webhook chegou aqui. Eles divergem em ~0,5% dos pedidos, e o dia da
  // venda é o que tem que casar com o gasto daquele dia — senão a venda aparece
  // no ROAS do dia seguinte. Nenhum pedido tem ordered_at nulo, então é seguro.
  // (O painel de escala usa o mesmo campo; misturar os dois fazia a linha e o
  // painel mostrarem números diferentes pra mesma campanha.)
  const data = await fetchAll<{ utm_campaign: string | null; value: number | null }>((from, to) => {
    let q = sb
      .from('kirvano_orders')
      .select('utm_campaign,value')
      .eq('status', 'APPROVED')
      .gte('ordered_at', since)
      .range(from, to)
    if (until) q = q.lt('ordered_at', until)
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

/** Vendas reais por campanha E por dia (BRT) — alimenta os quadradinhos do
 *  Histórico com a mesma fonte da coluna "ROAS real" da tabela.
 *  Sem isto o Histórico mostrava o ROAS do Meta, que conta conversão que o
 *  gateway depois reembolsou/cancelou: numa campanha real de 26/08 o Meta dizia
 *  2 vendas onde só 1 tinha sido aprovada (as outras viraram REFUNDED/CANCELED). */
export async function fetchRealByCampaignDay(
  sinceISO: string,
  untilISO?: string,
): Promise<Record<string, Record<string, RealAgg>>> {
  const sb = supabase()
  if (!sb) return {}
  const rows = await fetchAll<{ utm_campaign: string | null; value: number | null; ordered_at: string | null }>(
    (from, to) => {
      let q = sb
        .from('kirvano_orders')
        .select('utm_campaign,value,ordered_at')
        .eq('status', 'APPROVED')
        .gte('ordered_at', sinceISO)
        .range(from, to)
      if (untilISO) q = q.lt('ordered_at', untilISO)
      return q
    },
  )
  const out: Record<string, Record<string, RealAgg>> = {}
  for (const o of rows) {
    const id = campIdFromUtm(o.utm_campaign)
    if (!id || !o.ordered_at) continue
    // dia BRT: o Histórico usa date_start do Meta, que também é o dia local
    const dia = new Date(new Date(o.ordered_at).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
    const porDia = (out[id] ??= {})
    const agg = (porDia[dia] ??= { sales: 0, revenue: 0 })
    agg.sales++
    agg.revenue += o.value || 0
  }
  return out
}
