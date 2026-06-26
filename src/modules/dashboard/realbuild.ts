/**
 * Monta o DashboardData a partir de dados REAIS:
 *  - faturamento/vendas/aprovação/reembolso  → pedidos do gateway (kirvano_orders)
 *  - gasto                                    → soma das campanhas Meta selecionadas
 *  - taxa de gateway / imposto                → % dos Parâmetros aplicados sobre o faturamento real
 *  - funil (cliques→...→vendas apr)           → métricas Meta + aprovadas reais do gateway
 *
 * Filtros que alimentam isso (escolhidos na tela): produtos da Kirvano, fonte de
 * tráfego (utm_source) e contas/campanhas do Facebook.
 */
import type { KirvanoOrder } from '@/modules/pixel/orders'
import type { FinParams } from '@/modules/monitor/finance'
import type { DashboardData, PaymentSlice, ApprovalRate, HourPoint, PositioningRow, FunnelStageData, CumulativePoint } from './data'

const up = (s?: string | null) => (s || '').toUpperCase()
const orderDate = (o: KirvanoOrder) => o.ordered_at || o.created_at || null

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
  funnelMeta?: FunnelMeta | null // métricas de funil do Meta
  fin: FinParams
}

export function buildRealDashboard({ orders, products, source, spend, hourlySpend, funnelMeta, fin }: RealOpts): DashboardData {
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
  const taxas = fatBruto * (fin.gateway / 100)
  const imposto = fatBruto * (fin.imposto / 100)
  const reembolsoVal = sum(refunded)
  const chargebackVal = sum(charged)
  // Líquido = Bruto − taxas de gateway − imposto (mesma conta da UTMify).
  // Reembolso/chargeback NÃO entram aqui: a venda reembolsada já saiu do Bruto
  // (status vira REFUNDED), então descontar de novo seria dupla penalização.
  // Ficam como métricas informativas (reembolsoPct / vendasReembolsadas).
  const fatLiquido = fatBruto - taxas - imposto
  const custoTotal = vendas * fin.custoUn
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
  }
}
