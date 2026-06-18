/**
 * Monta o DashboardData a partir de dados REAIS:
 *  - faturamento/vendas/aprovação/reembolso  → pedidos do gateway (kirvano_orders)
 *  - gasto                                    → soma das campanhas Meta selecionadas
 *  - taxa de gateway / imposto                → % dos Parâmetros aplicados sobre o faturamento real
 *
 * Dois filtros independentes alimentam isso (escolhidos na tela):
 *   produtos da Kirvano  +  campanhas do Facebook (ativas/inativas/excluídas).
 */
import type { KirvanoOrder } from '@/modules/pixel/orders'
import type { FinParams } from '@/modules/monitor/finance'
import type { DashboardData, PaymentSlice, ApprovalRate, HourPoint } from './data'

const up = (s?: string | null) => (s || '').toUpperCase()
const orderDate = (o: KirvanoOrder) => o.ordered_at || o.created_at || null

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

/** Produtos distintos presentes nos pedidos (pro seletor de produtos). */
export function distinctProducts(orders: KirvanoOrder[]): string[] {
  const s = new Set<string>()
  orders.forEach((o) => o.product && s.add(o.product))
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Filtra pedidos pelo conjunto de produtos selecionados (null = todos). */
export function filterByProducts(orders: KirvanoOrder[], products: Set<string> | null): KirvanoOrder[] {
  if (!products) return orders
  return orders.filter((o) => o.product && products.has(o.product))
}

export interface RealOpts {
  orders: KirvanoOrder[] // já filtrados pelo período
  products: Set<string> | null // produtos do gateway selecionados (null = todos)
  spend: number // gasto Meta (BRL) das campanhas selecionadas
  fin: FinParams
}

export function buildRealDashboard({ orders, products, spend, fin }: RealOpts): DashboardData {
  const rows = filterByProducts(orders, products)
  const byStatus = (st: string) => rows.filter((o) => up(o.status) === st)
  const sum = (a: KirvanoOrder[]) => a.reduce((s, o) => s + (o.value || 0), 0)

  const approved = byStatus('APPROVED')
  const refused = byStatus('REFUSED')
  const pending = byStatus('PENDING')
  const refunded = byStatus('REFUNDED')
  const charged = byStatus('CHARGEBACK')

  const fatBruto = sum(approved)
  const vendas = approved.length
  const taxas = fatBruto * (fin.gateway / 100)
  const imposto = fatBruto * (fin.imposto / 100)
  const reembolsoVal = sum(refunded)
  const chargebackVal = sum(charged)
  const fatLiquido = fatBruto - taxas - imposto - reembolsoVal - chargebackVal
  const custoTotal = vendas * fin.custoUn
  const lucro = fatLiquido - spend - fin.despesas - custoTotal

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

  // taxa de aprovação por método = aprovadas / (aprovadas + recusadas)
  const apprByMethod = (lab: string): number => {
    const ap = approved.filter((o) => pmLabel(o.payment_method) === lab).length
    const rf = refused.filter((o) => pmLabel(o.payment_method) === lab).length
    const tot = ap + rf
    return tot > 0 ? +((ap / tot) * 100).toFixed(1) : 0
  }
  const approval: ApprovalRate[] = ['Cartão', 'Pix', 'Boleto']
    .map((m) => ({ label: m, pct: apprByMethod(m) }))
    .filter((a) => a.pct > 0)

  // faturamento líquido por hora (real, das vendas aprovadas)
  const netFactor = fatBruto > 0 ? fatLiquido / fatBruto : 1
  const byHour = Array.from({ length: 24 }, () => 0)
  approved.forEach((o) => {
    const t = orderDate(o)
    if (!t) return
    const h = new Date(t).getHours()
    if (h >= 0 && h < 24) byHour[h] += o.value || 0
  })
  const profitByHour: HourPoint[] = byHour.map((v, i) => ({
    hour: String(i).padStart(2, '0'),
    value: Math.round(v * netFactor),
  }))

  return {
    isSample: false,
    totalSales: vendas,
    payment,
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
    positioning: [], // posicionamento real exigiria breakdown Meta por placement — fora do escopo deste filtro
    profitByHour,
  }
}
