import { getSales, getRevenue, type InsightRow } from '@/lib/meta'
import { cacheGet, cacheSet, remoteSet, loadState } from '@/lib/appState'

export interface FinParams {
  aprov: number
  gateway: number
  imposto: number
  custoUn: number
  despesas: number
  reembolso: number
  chargeback: number
  pix: number
  cartao: number
  boleto: number
}

export const FIN_DEFAULTS: FinParams = {
  aprov: 75,
  gateway: 5,
  imposto: 0,
  custoUn: 0,
  despesas: 0,
  reembolso: 0,
  chargeback: 0,
  pix: 60,
  cartao: 35,
  boleto: 5,
}

// cache local (instantâneo)
export function loadFinParams(): FinParams {
  return { ...FIN_DEFAULTS, ...cacheGet<Partial<FinParams>>('meta_fin', {}) }
}
// fonte de verdade no Supabase (chama ao montar pra sincronizar)
export async function syncFinParams(): Promise<FinParams> {
  const v = await loadState<Partial<FinParams>>('meta_fin', {})
  return { ...FIN_DEFAULTS, ...v }
}
export function saveFinParams(f: FinParams) {
  cacheSet('meta_fin', f)
  remoteSet('meta_fin', f)
}

/** Agrupa produto pela nomenclatura da campanha (mesma lógica da aba Por Oferta) */
export function offerKey(name: string): string {
  const p = name.split(/\s*-\s*/)
  let rest = p.slice(5).join(' - ').trim()
  if (!rest) rest = p[p.length - 1] || name
  rest = rest.replace(/—?\s*c[óo]pia.*/i, '').trim()
  rest = rest.replace(/^(BRGR|GRBR|BR|GR|PT|ES)\s*-\s*/i, '').trim()
  return rest.toUpperCase() || name.toUpperCase()
}

export interface FinRow extends InsightRow {
  _fx?: number
  _accId?: string
}

export interface FinAgg {
  spend: number
  salesInit: number
  revInit: number
  prod: Record<string, { key: string; spend: number; rev: number; sales: number }>
}

export function finAggregate(rows: FinRow[]): FinAgg {
  let spend = 0
  let salesInit = 0
  let revInit = 0
  const prod: FinAgg['prod'] = {}
  rows.forEach((r) => {
    const fx = r._fx || 1
    const sp = parseFloat(r.spend || '0') * fx
    const sl = getSales(r)
    const rv = getRevenue(r) * fx
    spend += sp
    salesInit += sl
    revInit += rv
    const key = offerKey(r.campaign_name || '?')
    if (!prod[key]) prod[key] = { key, spend: 0, rev: 0, sales: 0 }
    prod[key].spend += sp
    prod[key].rev += rv
    prod[key].sales += sl
  })
  return { spend, salesInit, revInit, prod }
}

export interface FinModel extends FinAgg {
  vendas: number
  fatBruto: number
  taxas: number
  imposto: number
  reembolso: number
  chargeback: number
  custoTotal: number
  fatLiquido: number
  lucro: number
  pendentes: number
  margem: number
  roi: number
  roas: number
  arpu: number
  cpa: number
}

export function finModel(agg: FinAgg, FIN: FinParams): FinModel {
  const aprov = FIN.aprov / 100
  const vendas = agg.salesInit * aprov
  const fatBruto = agg.revInit * aprov
  const taxas = fatBruto * (FIN.gateway / 100)
  const imposto = fatBruto * (FIN.imposto / 100)
  const reembolso = fatBruto * (FIN.reembolso / 100)
  const chargeback = fatBruto * (FIN.chargeback / 100)
  const custoTotal = vendas * FIN.custoUn
  const fatLiquido = fatBruto - taxas - imposto - reembolso - chargeback
  const lucro = fatLiquido - agg.spend - FIN.despesas - custoTotal
  return {
    ...agg,
    vendas,
    fatBruto,
    taxas,
    imposto,
    reembolso,
    chargeback,
    custoTotal,
    fatLiquido,
    lucro,
    pendentes: agg.revInit * (1 - aprov),
    margem: fatLiquido !== 0 ? lucro / fatLiquido : 0,
    roi: agg.spend > 0 ? fatLiquido / agg.spend : 0,
    roas: agg.spend > 0 ? fatBruto / agg.spend : 0,
    arpu: vendas > 0 ? fatLiquido / vendas : 0,
    cpa: vendas > 0 ? agg.spend / vendas : 0,
  }
}

/** Lucro/líquido/gasto por hora (0-23) a partir das linhas com breakdown horário */
export function finHourly(
  hourly: FinRow[],
  FIN: FinParams,
  metric: 'lucro' | 'liquido' | 'spend',
): { hour: string; value: number }[] {
  const byH = Array.from({ length: 24 }, () => ({ spend: 0, rev: 0 }))
  hourly.forEach((r) => {
    const hk = (r.hourly_stats_aggregated_by_advertiser_time_zone as string) || ''
    const hh = parseInt(hk.slice(0, 2))
    if (isNaN(hh) || hh < 0 || hh > 23) return
    const fx = r._fx || 1
    byH[hh].spend += parseFloat(r.spend || '0') * fx
    byH[hh].rev += getRevenue(r) * fx
  })
  const factor =
    (FIN.aprov / 100) *
    (1 - (FIN.gateway + FIN.imposto + FIN.reembolso + FIN.chargeback) / 100)
  return byH.map((b, i) => {
    const liq = b.rev * factor
    const value = metric === 'spend' ? b.spend : metric === 'liquido' ? liq : liq - b.spend
    return { hour: String(i).padStart(2, '0') + 'h', value }
  })
}
