/**
 * Monta o DashboardData a partir de dados REAIS:
 *  - faturamento/vendas/aprovação/reembolso  → pedidos do gateway (kirvano_orders)
 *  - gasto                                    → soma das campanhas Meta selecionadas
 *  - taxas/impostos/custos                    → aba TAXAS, resolvidos POR PRODUTO em cada pedido
 *  - funil (cliques→...→vendas apr)           → métricas Meta + aprovadas reais do gateway
 *
 * Filtros que alimentam isso (escolhidos na tela): produtos da Kirvano, fonte de
 * tráfego (utm_source) e contas/campanhas do Facebook.
 */
import type { KirvanoOrder } from '@/modules/pixel/orders'
import type { FinParams } from '@/modules/monitor/finance'
import { feeItemsForOrder, sumFees, type TaxasConfig } from '@/modules/taxas/taxas'
import { campIdFromUtm } from '@/modules/monitor/realRoas'
import type { DashboardData, PaymentSlice, ApprovalRate, HourPoint, PositioningRow, FunnelStageData, CumulativePoint, DayPoint, HourProfitPoint, AccountPerf } from './data'

const up = (s?: string | null) => (s || '').toUpperCase()
const orderDate = (o: KirvanoOrder) => o.ordered_at || o.created_at || null
/** Dia (YYYY-MM-DD) de um instante, no fuso BR — mesmo dia comercial da Kirvano/Meta. */
const BR_OFFSET_MS = 3 * 3600000
const dayKeyBR = (t: string): string | null => {
  const ms = Date.parse(t)
  return isNaN(ms) ? null : new Date(ms - BR_OFFSET_MS).toISOString().slice(0, 10)
}

/** Converte preço (número OU string BR tipo "R$ 49,90") em número. */
function numPrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return 0
  let s = String(v).replace(/[^\d.,]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.') // 1.234,56 → 1234.56
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/** Todos os produtos de um pedido (principal + order bumps), pelo nome. */
function orderProductNames(o: KirvanoOrder): string[] {
  const names: string[] = []
  if (Array.isArray(o.products)) o.products.forEach((p) => p?.name && names.push(p.name))
  if (o.product) names.push(o.product)
  return names
}

/** Valor do pedido considerando o filtro de produtos:
 *  - sem filtro → valor cheio do pedido
 *  - com filtro → soma só dos itens (principal/bumps) que casam (valor real do produto) */
function valueForFilter(o: KirvanoOrder, products: Set<string> | null): number {
  if (!products) return o.value || 0
  let sum = 0
  let matched = false
  if (Array.isArray(o.products)) {
    o.products.forEach((p) => {
      if (p?.name && products.has(p.name)) { matched = true; sum += numPrice(p.price ?? p.amount ?? p.total_price) }
    })
  }
  if (matched && sum > 0) return sum
  // fallback: produto principal casa mas sem preço de linha → valor cheio
  if (o.product && products.has(o.product)) return o.value || 0
  return 0
}

/** Rótulo PT do método de pagamento da Kirvano. */
const PM_LABEL: Record<string, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão',
  CARD: 'Cartão',
  BANK_SLIP: 'Boleto',
  BOLETO: 'Boleto',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  PAYPAL: 'PayPal',
}
const pmLabel = (m?: string | null) => PM_LABEL[up(m)] || (m ? 'Outros' : 'Outros')
const PM_COLOR: Record<string, string> = {
  Pix: '#6366f1',
  Cartão: '#8b5cf6',
  Boleto: '#545c84',
  'Apple Pay': '#22d3ee',
  'Google Pay': '#34d399',
  PayPal: '#f59e0b',
  Outros: '#ef4444',
}

/** Normaliza utm_source pra Fonte de Tráfego (FB/fb→Facebook, ig→Instagram...). */
export function normSource(s?: string | null): string {
  const v = (s || '').trim().toLowerCase()
  if (!v) return '(sem origem)'
  if (v === 'fb' || v === 'facebook' || v.includes('face')) return 'Facebook'
  if (v === 'ig' || v.includes('insta')) return 'Instagram'
  if (v.includes('google') || v === 'gg') return 'Google'
  if (v.includes('tiktok') || v === 'tt') return 'TikTok'
  if (v.includes('youtube') || v === 'yt') return 'YouTube'
  return s as string
}

/** Fontes de tráfego distintas presentes nos pedidos (pro seletor). */
export function distinctSources(orders: KirvanoOrder[]): string[] {
  const s = new Set<string>()
  orders.forEach((o) => s.add(normSource(o.utm_source)))
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Produtos distintos nos pedidos — INCLUI order bumps (não só o principal). */
export function distinctProducts(orders: KirvanoOrder[]): string[] {
  const s = new Set<string>()
  orders.forEach((o) => orderProductNames(o).forEach((n) => s.add(n)))
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export interface FunnelMeta {
  clicks: number
  lpv: number // landing page views (Visita)
  ic: number // initiate checkout (Meta — clique/checkout)
}

export interface RealOpts {
  orders: KirvanoOrder[] // já filtrados pelo período
  products: Set<string> | null // produtos do gateway selecionados (null = todos)
  source: Set<string> | null // fontes de tráfego selecionadas (null = todas)
  spend: number // gasto Meta (BRL) das campanhas selecionadas
  hourlySpend?: number[] // gasto Meta por hora (24) — pro acumulado
  dailySpend?: Record<string, number> // gasto Meta por dia BR (YYYY-MM-DD) — pro Lucro por Dia
  // pra tabela "Performance por Conta" (cada conta isolada):
  accountSpend?: { id: string; name: string; spend: number }[] // gasto BRL por conta
  campToAccount?: Record<string, string> // id da campanha Meta → id da conta
  funnelMeta?: FunnelMeta | null // métricas de funil do Meta
  fin: FinParams // hoje só `despesas` (período) vem daqui — taxas são por produto
  taxas: TaxasConfig
}

export function buildRealDashboard({ orders, products, source, spend, hourlySpend, dailySpend, accountSpend, campToAccount, funnelMeta, fin, taxas: taxasCfg }: RealOpts): DashboardData {
  // filtro de produto casa principal OU order bump; e revaloriza o pedido pro valor
  // real do(s) produto(s) selecionado(s) — assim filtrar por um bump não infla.
  let rows = orders
  if (products) {
    rows = orders
      .map((o): KirvanoOrder | null => {
        const v = valueForFilter(o, products)
        return v > 0 ? { ...o, value: v } : null
      })
      .filter((o): o is KirvanoOrder => o !== null)
  }
  if (source) rows = rows.filter((o) => source.has(normSource(o.utm_source)))

  const byStatus = (st: string) => rows.filter((o) => up(o.status) === st)
  const sum = (a: KirvanoOrder[]) => a.reduce((s, o) => s + (o.value || 0), 0)

  const approved = byStatus('APPROVED')
  const refused = byStatus('REFUSED')
  const pending = byStatus('PENDING')
  const canceled = byStatus('CANCELED') // pix/boleto gerado e EXPIRADO sem pagar
  const refunded = byStatus('REFUNDED')
  const charged = byStatus('CHARGEBACK')

  const fatBruto = sum(approved)
  const vendas = approved.length
  // Taxas/impostos/custos resolvidos POR PEDIDO: produto principal → config da aba
  // Taxas (por ID Kirvano, fallback nome, fallback padrão). % sobre o valor + fixos.
  let taxas = 0
  let imposto = 0
  let custoTotal = 0
  approved.forEach((o) => {
    const s = sumFees(feeItemsForOrder(taxasCfg, o))
    const v = o.value || 0
    taxas += (v * s.byCat.taxa.pct) / 100 + s.byCat.taxa.fixo
    imposto += (v * s.byCat.imposto.pct) / 100 + s.byCat.imposto.fixo
    custoTotal += (v * s.byCat.custo.pct) / 100 + s.byCat.custo.fixo
  })
  const reembolsoVal = sum(refunded)
  const chargebackVal = sum(charged)
  // Líquido = Bruto − taxas − imposto (mesma conta da UTMify).
  // Reembolso/chargeback NÃO entram aqui: a venda reembolsada já saiu do Bruto
  // (status vira REFUNDED), então descontar de novo seria dupla penalização.
  // Ficam como métricas informativas (reembolsoPct / vendasReembolsadas).
  const fatLiquido = fatBruto - taxas - imposto
  const lucro = fatLiquido - spend - fin.despesas - custoTotal
  const netFactor = fatBruto > 0 ? fatLiquido / fatBruto : 1

  // split de pagamento (% por contagem de vendas aprovadas)
  const pmCount: Record<string, number> = {}
  approved.forEach((o) => {
    const lab = pmLabel(o.payment_method)
    pmCount[lab] = (pmCount[lab] || 0) + 1
  })
  const totPm = vendas || 1
  const payment: PaymentSlice[] = Object.entries(pmCount)
    .map(([name, c]) => ({ name, value: Math.round((c / totPm) * 100), color: PM_COLOR[name] || '#ef4444' }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)

  // taxa de aprovação por método = pagas / iniciadas.
  // "não pagas" inclui RECUSADA (cartão), CANCELADA/EXPIRADA (pix gerado e não pago) e
  // PENDENTE — não só REFUSED. Pix quase nunca "recusa", ele expira → senão dava 100% sempre.
  const apprByMethod = (lab: string): number => {
    const ofM = (arr: KirvanoOrder[]) => arr.filter((o) => pmLabel(o.payment_method) === lab).length
    const ap = ofM(approved)
    const naoPagas = ofM(refused) + ofM(canceled) + ofM(pending)
    const tot = ap + naoPagas
    return tot > 0 ? +((ap / tot) * 100).toFixed(1) : 0
  }
  const approval: ApprovalRate[] = ['Cartão', 'Pix', 'Boleto']
    .map((m) => ({ label: m, pct: apprByMethod(m) }))
    .filter((a) => a.pct > 0)

  // Vendas por Produto — conta cada ITEM vendido (principal + order bumps),
  // respeitando o filtro. Mostra o mix real incluindo bumps (a contagem-título de
  // vendas segue por pedido). % sobre o total de itens.
  const prodCount: Record<string, number> = {}
  approved.forEach((o) => {
    const items = Array.isArray(o.products) && o.products.length
      ? (o.products.map((p) => p?.name).filter(Boolean) as string[])
      : [o.product || '(sem produto)']
    items.forEach((name) => {
      if (products && !products.has(name)) return
      prodCount[name] = (prodCount[name] || 0) + 1
    })
  })
  const totalUnits = Object.values(prodCount).reduce((s, n) => s + n, 0) || 1
  const vendasPorProduto: PositioningRow[] = Object.entries(prodCount)
    .map(([label, count]) => ({ label, count, pct: +((count / totalUnits) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // faturamento líquido por hora (real, das vendas aprovadas) — gráfico "Lucro por Horário"
  const revByHour = Array.from({ length: 24 }, () => 0)
  approved.forEach((o) => {
    const t = orderDate(o)
    if (!t) return
    const h = new Date(t).getHours()
    if (h >= 0 && h < 24) revByHour[h] += o.value || 0
  })
  const profitByHour: HourPoint[] = revByHour.map((v, i) => ({ hour: String(i).padStart(2, '0'), value: Math.round(v * netFactor) }))

  // Faturamento × Investimento × Lucro por hora (acumulado)
  const spH = hourlySpend && hourlySpend.length === 24 ? hourlySpend : Array.from({ length: 24 }, () => 0)
  let accInv = 0
  let accFat = 0
  let accLuc = 0
  const cumulative: CumulativePoint[] = revByHour.map((rev, h) => {
    accInv += spH[h] || 0
    accFat += rev
    accLuc += rev * netFactor - (spH[h] || 0)
    return { hour: String(h).padStart(2, '0'), investimento: Math.round(accInv), faturamento: Math.round(accFat), lucro: Math.round(accLuc) }
  })

  /* ── Lucro por DIA (o único gráfico que desconta o anúncio) ──
   * Decompõe o KPI de Lucro dia a dia, com a MESMA conta: cada pedido resolve as
   * próprias taxas (por produto) e o gasto do dia vem do Meta quebrado por data.
   *   lucro(dia) = bruto − taxa − imposto − gasto − custo
   * Somar todos os dias reproduz o Lucro do período (menos `despesas`, que é do
   * período inteiro e não tem data). Dia com gasto e nenhuma venda entra também —
   * é justamente o dia vermelho que interessa enxergar. */
  interface DayAgg { bruto: number; taxas: number; imposto: number; custo: number; vendas: number }
  const zeroDay = (): DayAgg => ({ bruto: 0, taxas: 0, imposto: 0, custo: 0, vendas: 0 })
  const byDay = new Map<string, DayAgg>()
  approved.forEach((o) => {
    const t = orderDate(o)
    const k = t ? dayKeyBR(t) : null
    if (!k) return
    const s = sumFees(feeItemsForOrder(taxasCfg, o))
    const v = o.value || 0
    const a = byDay.get(k) || zeroDay()
    a.bruto += v
    a.taxas += (v * s.byCat.taxa.pct) / 100 + s.byCat.taxa.fixo
    a.imposto += (v * s.byCat.imposto.pct) / 100 + s.byCat.imposto.fixo
    a.custo += (v * s.byCat.custo.pct) / 100 + s.byCat.custo.fixo
    a.vendas += 1
    byDay.set(k, a)
  })
  Object.keys(dailySpend || {}).forEach((k) => { if (!byDay.has(k)) byDay.set(k, zeroDay()) })
  const profitByDay: DayPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, a]) => {
      const sp = dailySpend?.[date] || 0
      return {
        date,
        label: date.slice(8) + '/' + date.slice(5, 7),
        lucro: a.bruto - a.taxas - a.imposto - sp - a.custo,
        bruto: a.bruto,
        spend: sp,
        vendas: a.vendas,
        roas: sp > 0 ? a.bruto / sp : null,
      }
    })

  /* ── Performance por CONTA (cada uma isolada) ──
   * Gasto = só as campanhas DA conta (accountSpend, já em BRL). Vendas = só os
   * pedidos cujo id de campanha (no utm_campaign) cai numa campanha DELA
   * (campToAccount). Assim uma conta não "empresta" venda nem gasto da outra —
   * é o que mostra como cada uma vai sozinha. Pedido sem id de campanha (orgânico)
   * ou de campanha fora do fetch entra em "(sem atribuição)", sem sujar conta nenhuma.
   * Taxas resolvidas por pedido, igual ao lucro geral → o líquido bate com o card. */
  const netOf = (o: KirvanoOrder): number => {
    const s = sumFees(feeItemsForOrder(taxasCfg, o))
    const v = o.value || 0
    return v - ((v * s.byCat.taxa.pct) / 100 + s.byCat.taxa.fixo)
             - ((v * s.byCat.imposto.pct) / 100 + s.byCat.imposto.fixo)
             - ((v * s.byCat.custo.pct) / 100 + s.byCat.custo.fixo)
  }
  /* ── Lucro por HORÁRIO (mesma lógica do Lucro por Dia, só que por hora) ──
   * lucro(hora) = faturamento da hora − taxas do pedido − gasto em ads da hora.
   * Hora no fuso BR, igual ao gasto horário do Meta (que vem no fuso da conta).
   * É o gráfico que mostra em qual faixa do dia você ganha e em qual queima. */
  const hourBR = (t: string): number | null => {
    const ms = Date.parse(t)
    return isNaN(ms) ? null : new Date(ms - BR_OFFSET_MS).getUTCHours()
  }
  const hAgg = Array.from({ length: 24 }, () => ({ bruto: 0, net: 0, vendas: 0 }))
  approved.forEach((o) => {
    const t = orderDate(o)
    const h = t ? hourBR(t) : null
    if (h == null) return
    hAgg[h].bruto += o.value || 0
    hAgg[h].net += netOf(o)
    hAgg[h].vendas += 1
  })
  const profitByHourReal: HourProfitPoint[] = hAgg.map((a, h) => {
    const sp = hourlySpend && hourlySpend.length === 24 ? hourlySpend[h] || 0 : 0
    return {
      hour: String(h).padStart(2, '0'),
      label: `${String(h).padStart(2, '0')}h`,
      lucro: a.net - sp,
      bruto: a.bruto,
      spend: sp,
      vendas: a.vendas,
      roas: sp > 0 ? a.bruto / sp : null,
    }
  })

  interface AccAcc { id: string; name: string; spend: number; sales: number; revenue: number; net: number }
  const accMap = new Map<string, AccAcc>()
  ;(accountSpend || []).forEach((a) => accMap.set(a.id, { id: a.id, name: a.name, spend: a.spend, sales: 0, revenue: 0, net: 0 }))
  const semConta: AccAcc = { id: '__none__', name: '(sem atribuição / orgânico)', spend: 0, sales: 0, revenue: 0, net: 0 }
  approved.forEach((o) => {
    const cid = campIdFromUtm(o.utm_campaign)
    const accId = cid && campToAccount ? campToAccount[cid] : undefined
    const bucket = (accId && accMap.get(accId)) || semConta
    bucket.sales += 1
    bucket.revenue += o.value || 0
    bucket.net += netOf(o)
  })
  const accountsRaw = [...accMap.values()]
  if (semConta.sales > 0) accountsRaw.push(semConta)
  const accounts: AccountPerf[] = accountsRaw
    .map((a) => {
      const lucro = a.net - a.spend
      const roas = a.spend > 0 ? a.revenue / a.spend : null
      const margem = a.revenue > 0 ? lucro / a.revenue : 0
      const cls: AccountPerf['cls'] =
        a.spend <= 0 && a.revenue <= 0 ? 'none'
        : a.id === '__none__' ? 'none'
        : lucro < 0 ? 'bad'
        : margem >= 0.15 ? 'good'
        : 'warn'
      return { id: a.id, name: a.name, spend: a.spend, sales: a.sales, revenue: a.revenue, roas, lucro, cls }
    })
    .sort((x, y) => y.spend - x.spend)

  // Funil (igual UTMify): topo = Meta (cliques/visita/checkout); base = GATEWAY real.
  // "Vendas iniciadas" = checkouts que geraram transação (pix/boleto/cartão) = tudo
  // que NÃO é abandonado. "Aprovadas" = pagas. Isso a gente tem no banco (confiável).
  const vendasIniciadas = rows.filter((o) => up(o.status) !== 'ABANDONED').length
  const fm = funnelMeta
  const funnel: FunnelStageData[] = [
    { label: 'Cliques', n: fm?.clicks ?? 0, color: '#6366f1' },
    { label: 'Visita', n: fm?.lpv ?? 0, color: '#7c6cf0' },
    { label: 'Checkout (IC)', n: fm?.ic ?? 0, color: '#9166ef' },
    { label: 'Vendas iniciadas', n: vendasIniciadas, color: '#b76ce8' },
    { label: 'Aprovadas', n: vendas, color: '#d16cf0' },
  ]

  return {
    isSample: false,
    totalSales: vendas,
    payment,
    vendasPorProduto,
    funnel,
    cumulative,
    paises: [], // país não é capturado no webhook ainda
    roas: spend > 0 ? fatBruto / spend : 0,
    cpa: vendas > 0 ? spend / vendas : 0,
    faturamentoBruto: fatBruto,
    margem: fatLiquido !== 0 ? (lucro / fatLiquido) * 100 : 0,
    arpu: vendas > 0 ? fatLiquido / vendas : 0,
    faturamentoLiquido: fatLiquido,
    roi: spend > 0 ? fatLiquido / spend : 0,
    lucro,
    gastoAds: spend,
    despesasAdicionais: fin.despesas,
    taxas,
    impostoTotal: imposto,
    reembolsoPct: fatBruto > 0 ? (reembolsoVal / fatBruto) * 100 : 0,
    chargebackPct: fatBruto > 0 ? (chargebackVal / fatBruto) * 100 : 0,
    vendasPendentes: sum(pending),
    vendasReembolsadas: reembolsoVal,
    approval,
    positioning: [],
    profitByHour,
    profitByHourReal,
    profitByDay,
    accounts,
  }
}
