import { findVal, getRevenue, type InsightRow } from '@/lib/meta'

const FNL_CLICK = ['link_click']
const FNL_LPV = ['landing_page_view', 'omni_view_content', 'view_content', 'offsite_conversion.fb_pixel_view_content']
const FNL_IC = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']
const FNL_PURCH = ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase']
export const FNL_APPROVE_RATE = 0.75

export interface FnlRow extends InsightRow {
  _spendUSD?: number
  _revUSD?: number
}

const fnlVal = (r: InsightRow, keys: string[]) => {
  const v = findVal(r.actions, keys)
  return v ? Math.round(v) : 0
}
export const fnlPurch = (r: InsightRow) => fnlVal(r, FNL_PURCH)
export const toUSD = (v: number, cur: string, fx: number) => (cur === 'BRL' ? v / fx : v)

export interface FunnelAgg {
  stages: { label: string; n: number; color: string }[]
  rev: number
  spend: number
  sales: number
  roas: number
}

export function aggregateFunnel(rows: FnlRow[]): FunnelAgg {
  let clicks = 0
  let lpv = 0
  let ic = 0
  let purch = 0
  let rev = 0
  let spend = 0
  rows.forEach((r) => {
    const lc = fnlVal(r, FNL_CLICK) || Math.round(parseFloat((r.inline_link_clicks as string) || '0'))
    clicks += lc
    lpv += fnlVal(r, FNL_LPV)
    ic += fnlVal(r, FNL_IC)
    purch += fnlVal(r, FNL_PURCH)
    rev += r._revUSD != null ? r._revUSD : getRevenue(r)
    spend += r._spendUSD != null ? r._spendUSD : parseFloat(r.spend || '0')
  })
  if (!lpv) lpv = clicks
  const approved = Math.round(purch * FNL_APPROVE_RATE)
  const stages = [
    { label: 'Cliques', n: clicks, color: '#3b82f6' },
    { label: 'Vis. Página', n: lpv, color: '#4f7cf0' },
    { label: 'ICs', n: ic, color: '#7b6ae8' },
    { label: 'Vendas Inic.', n: purch, color: '#a855d6' },
    { label: 'Vendas Apr.', n: approved, color: '#d6477f' },
  ]
  return { stages, rev, spend, sales: purch, roas: spend ? rev / spend : 0 }
}
