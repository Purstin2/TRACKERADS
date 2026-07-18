/**
 * Modelo de dados do Dashboard geral (visão financeira do sistema).
 * Hoje vem de valores de exemplo; será alimentado pelo módulo Pixel
 * (Conversions API + webhooks de gateway) e pelos dados do Monitor.
 */

export interface PaymentSlice {
  name: string
  value: number
  color: string
}
export interface ApprovalRate {
  label: string
  pct: number
}
export interface PositioningRow {
  label: string
  count: number
  pct: number
}
export interface HourPoint {
  hour: string
  value: number
}
export interface FunnelStageData {
  label: string
  n: number
  color: string
}
export interface CumulativePoint {
  hour: string
  investimento: number
  faturamento: number
  lucro: number
}
/** Performance ISOLADA de uma conta de anúncio: só o gasto DELA (campanhas dela) e
 *  só as vendas DELA (pedidos do gateway cujo id de campanha cai nela). Sem mistura
 *  com as outras contas — é o que deixa ver como cada uma performa sozinha. */
export interface AccountPerf {
  id: string
  name: string
  spend: number // BRL, só as campanhas desta conta
  sales: number // vendas do gateway atribuídas a esta conta
  revenue: number // BRL bruto do gateway desta conta
  roas: number | null // revenue / spend (null = sem gasto)
  lucro: number // revenue líquido (taxas por pedido) − gasto
  cls: 'good' | 'warn' | 'bad' | 'none' // verde/amarelo/vermelho/cinza
}
/** Uma hora do gráfico "Lucro por Horário": mesma lógica do Lucro por Dia, só que
 *  por hora — faturamento da hora − taxas do pedido − gasto em ads daquela hora.
 *  Mostra em qual faixa do dia você realmente ganha e em qual você queima. */
export interface HourProfitPoint {
  hour: string // "00".."23"
  label: string // "00h"
  lucro: number
  bruto: number
  spend: number
  vendas: number
  roas: number | null
}
/** Um dia do gráfico "Lucro por Dia": lucro REAL (já com anúncio, taxas e custos
 *  descontados) — positivo = verde acima da linha, negativo = vermelho abaixo. */
export interface DayPoint {
  date: string // YYYY-MM-DD
  label: string // DD/MM
  lucro: number
  bruto: number
  spend: number
  vendas: number
  roas: number | null
}

export interface DashboardData {
  isSample: boolean
  totalSales: number
  payment: PaymentSlice[]
  vendasPorProduto: PositioningRow[]
  funnel: FunnelStageData[]
  cumulative: CumulativePoint[]
  paises: PositioningRow[]
  // KPIs principais
  roas: number
  cpa: number
  faturamentoBruto: number
  margem: number
  arpu: number
  faturamentoLiquido: number
  roi: number
  lucro: number
  gastoAds: number
  // secundários
  despesasAdicionais: number
  taxas: number
  impostoTotal: number
  reembolsoPct: number
  chargebackPct: number
  vendasPendentes: number
  vendasReembolsadas: number
  approval: ApprovalRate[]
  positioning: PositioningRow[]
  profitByHour: HourPoint[]
  profitByHourReal: HourProfitPoint[]
  profitByDay: DayPoint[]
  accounts: AccountPerf[]
}

export const SAMPLE: DashboardData = {
  isSample: true,
  totalSales: 1265,
  payment: [
    { name: 'Pix', value: 59, color: '#6366f1' },
    { name: 'Cartão', value: 21, color: '#8b5cf6' },
    { name: 'Boleto', value: 18, color: '#545c84' },
    { name: 'Outros', value: 2, color: '#ef4444' },
  ],
  vendasPorProduto: [
    { label: 'ULTRA PACK STL PROFISSIONAL 100K', count: 23, pct: 48.9 },
    { label: 'Biblioteca V3.0 Chaveiros', count: 5, pct: 10.6 },
    { label: 'Biblioteca Virais da Internet', count: 5, pct: 10.6 },
    { label: 'Biblioteca Mascotes de Time', count: 5, pct: 10.6 },
    { label: 'Guia Impressão 3D Sem Erros', count: 3, pct: 6.4 },
  ],
  funnel: [
    { label: 'Cliques', n: 1820, color: '#6366f1' },
    { label: 'Vis. Página', n: 1240, color: '#7c6cf0' },
    { label: 'ICs', n: 320, color: '#9d7bf0' },
    { label: 'Vendas Inic.', n: 64, color: '#b87bf0' },
    { label: 'Vendas Apr.', n: 47, color: '#d16cf0' },
  ],
  cumulative: Array.from({ length: 24 }, (_, h) => ({
    hour: String(h).padStart(2, '0'),
    investimento: Math.round((h + 1) * 850),
    faturamento: Math.round((h + 1) * 1800),
    lucro: Math.round((h + 1) * 950),
  })),
  paises: [],
  roas: 2.11,
  cpa: 16.2,
  faturamentoBruto: 43314.53,
  margem: 37.4,
  arpu: 45.74,
  faturamentoLiquido: 32749.64,
  roi: 1.6,
  lucro: 12254.25,
  gastoAds: 20495.39,
  despesasAdicionais: 0,
  taxas: 6783.77,
  impostoTotal: 3781.13,
  reembolsoPct: 4.3,
  chargebackPct: 0,
  vendasPendentes: 3630.14,
  vendasReembolsadas: 1948.84,
  approval: [
    { label: 'Cartão', pct: 76.6 },
    { label: 'Pix', pct: 85.9 },
    { label: 'Boleto', pct: 55.6 },
  ],
  positioning: [
    { label: 'Instagram Stories', count: 191, pct: 15.1 },
    { label: 'Instagram Reels', count: 185, pct: 14.6 },
    { label: 'N/A', count: 172, pct: 13.6 },
    { label: 'Instagram Reels (2)', count: 162, pct: 12.8 },
    { label: 'Instagram Stories (2)', count: 160, pct: 12.6 },
    { label: 'Instagram Feed', count: 111, pct: 8.8 },
  ],
  profitByHourReal: Array.from({ length: 24 }, (_, h) => ({
    hour: String(h).padStart(2, '0'),
    label: `${String(h).padStart(2, '0')}h`,
    lucro: Math.round(Math.sin(h / 3) * 180),
    bruto: 300 + h * 12,
    spend: 260 + h * 6,
    vendas: (h % 5) + 1,
    roas: 1.2,
  })),
  accounts: [
    { id: 'a1', name: 'BRASIL', spend: 213, sales: 10, revenue: 473, roas: 2.22, lucro: 203, cls: 'good' },
    { id: 'a2', name: 'CHILE', spend: 686, sales: 10, revenue: 802, roas: 1.17, lucro: 20, cls: 'warn' },
    { id: 'a3', name: 'HOLANDA', spend: 291, sales: 1, revenue: 48, roas: 0.17, lucro: -248, cls: 'bad' },
  ],
  profitByDay: [
    { date: '2026-07-01', label: '01/07', lucro: 412, bruto: 2810, spend: 2100, vendas: 52, roas: 1.34 },
    { date: '2026-07-02', label: '02/07', lucro: -180, bruto: 2210, spend: 2180, vendas: 41, roas: 1.01 },
    { date: '2026-07-03', label: '03/07', lucro: 690, bruto: 3120, spend: 2180, vendas: 58, roas: 1.43 },
    { date: '2026-07-04', label: '04/07', lucro: -95, bruto: 1980, spend: 1930, vendas: 37, roas: 1.03 },
    { date: '2026-07-05', label: '05/07', lucro: 260, bruto: 2540, spend: 1990, vendas: 47, roas: 1.28 },
  ],
  profitByHour: [
    { hour: '00', value: 210 },
    { hour: '02', value: 95 },
    { hour: '04', value: 60 },
    { hour: '06', value: 140 },
    { hour: '08', value: 380 },
    { hour: '10', value: 640 },
    { hour: '12', value: 720 },
    { hour: '14', value: 810 },
    { hour: '16', value: 690 },
    { hour: '18', value: 920 },
    { hour: '20', value: 1180 },
    { hour: '22', value: 760 },
  ],
}

export const BRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const PCT = (n: number) => `${n.toFixed(1)}%`
