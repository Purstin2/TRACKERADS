import {
  finHourly,
  type FinModel,
  type FinParams,
  type FinRow,
} from '@/modules/monitor/finance'
import type { DashboardData } from './data'

/**
 * Converte o modelo financeiro (Meta + taxas modeladas) em DashboardData.
 * Valores monetários já devem chegar em BRL (conversão de câmbio feita no loader).
 */
export function buildDashboardData(
  model: FinModel,
  fin: FinParams,
  hourly: FinRow[],
): DashboardData {
  const splitSum = fin.pix + fin.cartao + fin.boleto || 1
  const payment = [
    { name: 'Pix', value: +((fin.pix / splitSum) * 100).toFixed(0), color: '#6366f1' },
    { name: 'Cartão', value: +((fin.cartao / splitSum) * 100).toFixed(0), color: '#8b5cf6' },
    { name: 'Boleto', value: +((fin.boleto / splitSum) * 100).toFixed(0), color: '#545c84' },
  ].filter((p) => p.value > 0)

  const approval = [
    { label: 'Cartão', pct: fin.cartao > 0 ? fin.aprov : 0 },
    { label: 'Pix', pct: fin.pix > 0 ? fin.aprov : 0 },
    { label: 'Boleto', pct: fin.boleto > 0 ? fin.aprov : 0 },
  ].filter((a) => a.pct > 0)

  return {
    isSample: false,
    totalSales: Math.round(model.vendas),
    payment,
    roas: model.roas,
    cpa: model.cpa,
    faturamentoBruto: model.fatBruto,
    margem: model.margem * 100,
    arpu: model.arpu,
    faturamentoLiquido: model.fatLiquido,
    roi: model.roi,
    lucro: model.lucro,
    gastoAds: model.spend,
    despesasAdicionais: fin.despesas,
    taxas: model.taxas,
    impostoTotal: model.imposto,
    reembolsoPct: fin.reembolso,
    chargebackPct: fin.chargeback,
    vendasPendentes: model.pendentes,
    vendasReembolsadas: model.reembolso,
    approval,
    positioning: [], // virá com o módulo Pixel / breakdown de posicionamento
    profitByHour: finHourly(hourly, fin, 'lucro').map((h) => ({
      hour: h.hour.replace('h', ''),
      value: Math.round(h.value),
    })),
  }
}
