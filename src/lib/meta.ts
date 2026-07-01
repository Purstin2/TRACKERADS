/**
 * Client compartilhado da Meta Graph API (Monitor / Uploader / Pixel).
 * Lógica idêntica à versão testada do monitor-campanhas.html.
 */
export const META_API = 'v22.0'
const BASE = `https://graph.facebook.com/${META_API}`

export const ATYPES = [
  'offsite_conversion.fb_pixel_purchase',
  'omni_purchase',
  'purchase',
]

export interface InsightRow {
  campaign_id?: string
  campaign_name?: string
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  spend?: string
  purchase_roas?: { action_type: string; value: string }[]
  cost_per_action_type?: { action_type: string; value: string }[]
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
  inline_link_clicks?: string
  frequency?: string
  cpm?: string
  date_start?: string
  [k: string]: unknown
}

/** Lista as contas de anúncio do usuário (me/adaccounts). Usado pelo botão
 *  "Atualizar contas" do Monitor pra descobrir contas novas automaticamente. */
export interface AdAccount {
  id: string
  name: string
  cur: 'USD' | 'BRL'
}
export async function fetchAdAccounts(t: string): Promise<AdAccount[]> {
  const p = new URLSearchParams({ fields: 'name,currency,account_status', limit: '500', access_token: t })
  const r = await fetch(`${BASE}/me/adaccounts?${p}`)
  const j: any = await r.json()
  if (j.error) throw new Error(j.error.message)
  return (j.data || []).map((a: any) => {
    const id = String(a.id || '').replace(/^act_/, '')
    const name = a.name && String(a.name).trim() ? String(a.name).trim() : `Conta ${id.slice(-4)}`
    return { id, name, cur: a.currency === 'BRL' ? 'BRL' : 'USD' } as AdAccount
  })
}

export async function paginate(url: string): Promise<InsightRow[]> {
  let data: InsightRow[] = []
  let next: string | null = url
  let g = 0
  while (next && g++ < 30) {
    const r: Response = await fetch(next)
    const j: any = await r.json()
    if (j.error) throw new Error(j.error.message)
    data = data.concat(j.data || [])
    next = j.paging && j.paging.next ? j.paging.next : null
  }
  return data
}

/* ── extratores de valor ── */
export function findVal(
  arr: { action_type: string; value: string }[] | undefined,
  keys: string[],
): number | null {
  if (!arr) return null
  const i = arr.find((a) => keys.includes(a.action_type))
  return i ? parseFloat(i.value) : null
}
export const getRoas = (r: InsightRow) => findVal(r.purchase_roas, ATYPES)
export const getCpa = (r: InsightRow) => findVal(r.cost_per_action_type, ATYPES)
export const getSales = (r: InsightRow) => {
  const v = findVal(r.actions, ATYPES)
  return v ? Math.round(v) : 0
}
export const getRevenue = (r: InsightRow) => findVal(r.action_values, ATYPES) || 0
export const getFreq = (r: InsightRow) => parseFloat((r.frequency as string) || '0')
export const getCpm = (r: InsightRow) => parseFloat((r.cpm as string) || '0')
export const getImpr = (r: InsightRow) => parseInt((r.impressions as string) || '0')
export const getCtr = (r: InsightRow) => parseFloat((r.ctr as string) || '0')
export const getCpc = (r: InsightRow) => parseFloat((r.cpc as string) || '0')
const FNL_IC = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']
export const getCpaIC = (r: InsightRow) => findVal(r.cost_per_action_type, FNL_IC)
export const fnlVal = (r: InsightRow, keys: string[]) => {
  const v = findVal(r.actions, keys)
  return v ? Math.round(v) : 0
}

/* ── datas ── */
export function dateParams(val: string): Record<string, string> {
  if (typeof val === 'string' && val.startsWith('custom:')) {
    const [, since, until] = val.split(':')
    if (since && until) return { time_range: JSON.stringify({ since, until }) }
  }
  return { date_preset: val }
}
export function dateRange(val: string): { since: string; until: string } {
  if (typeof val === 'string' && val.startsWith('custom:')) {
    const [, since, until] = val.split(':')
    if (since && until) return { since, until }
  }
  const days =
    ({ yesterday: 1, today: 1, last_7d: 7, last_14d: 14, last_30d: 30 } as Record<string, number>)[
      val
    ] ||
    parseInt(val) ||
    14
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - days + 1)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { since: fmt(start), until: fmt(end) }
}
export function previousPeriod(val: string): string {
  const { since, until } = dateRange(val)
  const s = new Date(since + 'T00:00:00')
  const u = new Date(until + 'T00:00:00')
  const days = Math.round((u.getTime() - s.getTime()) / 86400000) + 1
  const prevU = new Date(s)
  prevU.setDate(prevU.getDate() - 1)
  const prevS = new Date(prevU)
  prevS.setDate(prevS.getDate() - days + 1)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return `custom:${fmt(prevS)}:${fmt(prevU)}`
}
export const fmtDate = (s: string) => {
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}
export const periodLabel = (val: string) => {
  const { since, until } = dateRange(val)
  return `${fmtDate(since)}–${fmtDate(until)}`
}

function statusClause(s: string[], field = 'campaign.effective_status') {
  return { field, operator: 'IN', value: s || ['ACTIVE'] }
}

/* ── fetchers ── */
export type AdLevel = 'campaign' | 'adset' | 'ad'
const LEVEL_FIELDS: Record<AdLevel, string> = {
  campaign: 'campaign_id,campaign_name',
  adset: 'adset_id,adset_name,campaign_name',
  ad: 'ad_id,ad_name,adset_name,campaign_name',
}
const LEVEL_STATUS_FIELD: Record<AdLevel, string> = {
  campaign: 'campaign.effective_status',
  adset: 'adset.effective_status',
  ad: 'ad.effective_status',
}
export function fetchAggregate(id: string, preset: string, t: string, statuses: string[], level: AdLevel = 'campaign') {
  const p = new URLSearchParams({
    level,
    fields: `${LEVEL_FIELDS[level]},spend,purchase_roas,cost_per_action_type,actions,action_values,inline_link_clicks,frequency,cpm,impressions,ctr,cpc`,
    ...dateParams(preset),
    filtering: JSON.stringify([statusClause(statuses, LEVEL_STATUS_FIELD[level])]),
    access_token: t,
    limit: '500',
  })
  return paginate(`${BASE}/act_${id}/insights?${p}`)
}

/** Metadados das campanhas (orçamento, última edição, status) — não vêm via insights. */
export async function fetchCampaignMeta(accId: string, t: string): Promise<any[]> {
  const p = new URLSearchParams({
    fields: 'id,name,daily_budget,lifetime_budget,updated_time,effective_status,status',
    limit: '500',
    access_token: t,
  })
  return paginate(`${BASE}/act_${accId}/campaigns?${p}`) as unknown as any[]
}
export function fetchTimeSeries(id: string, val: string, t: string, statuses: string[]) {
  const { since, until } = dateRange(val)
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,purchase_roas,cost_per_action_type,actions,date_start',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    filtering: JSON.stringify([statusClause(statuses)]),
    access_token: t,
    limit: '500',
  })
  return paginate(`${BASE}/act_${id}/insights?${p}`)
}
export function fetchAds(accId: string, campId: string, preset: string, t: string) {
  const p = new URLSearchParams({
    level: 'ad',
    fields: 'ad_id,ad_name,spend,purchase_roas,cost_per_action_type,actions',
    ...dateParams(preset),
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campId }]),
    access_token: t,
    limit: '100',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
/** Dia-a-dia de UMA campanha (últimos N dias) — pro painel de escala. */
export function fetchCampDaily(accId: string, campId: string, t: string, days = 6) {
  const d = new Date()
  const until = d.toISOString().slice(0, 10)
  const s = new Date(d)
  s.setDate(s.getDate() - (days - 1))
  const since = s.toISOString().slice(0, 10)
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'spend,purchase_roas,cost_per_action_type,actions,action_values,date_start',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campId }]),
    access_token: t,
    limit: '100',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
/** Insights de UM dia quebrados por HORA (breakdown hourly do fuso da conta).
 *  Cada linha traz `hourly_stats_aggregated_by_advertiser_time_zone` ("HH:00:00 - HH:59:59").
 *  Usado pelo tracker de ritmo do orçamento (ROAS a cada 3h). */
export function fetchCampHourly(accId: string, campId: string, t: string, day: string) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'spend,action_values,actions,date_start',
    breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    time_range: JSON.stringify({ since: day, until: day }),
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: campId }]),
    access_token: t,
    limit: '200',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
export function fetchOffer(accId: string, preset: string, t: string, statuses: string[]) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,actions,action_values',
    ...dateParams(preset),
    filtering: JSON.stringify([statusClause(statuses)]),
    access_token: t,
    limit: '400',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
export function fetchFunil(accId: string, preset: string, t: string, statuses: string[]) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,actions,action_values,inline_link_clicks',
    ...dateParams(preset),
    filtering: JSON.stringify([statusClause(statuses)]),
    access_token: t,
    limit: '400',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
export function fetchBreakdown(
  accId: string,
  bdApi: string,
  preset: string,
  t: string,
  statuses: string[],
) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,actions,action_values',
    breakdowns: bdApi,
    ...dateParams(preset),
    filtering: JSON.stringify([statusClause(statuses)]),
    access_token: t,
    limit: '500',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
export function fetchCreatives(accId: string, preset: string, t: string, statuses: string[]) {
  const p = new URLSearchParams({
    level: 'ad',
    fields:
      'ad_id,ad_name,campaign_name,spend,purchase_roas,cost_per_action_type,actions,action_values',
    ...dateParams(preset),
    // filtro pelo status do PRÓPRIO anúncio (não da campanha) — assim "Apenas excluídas"
    // pega criativos arquivados/excluídos mesmo dentro de campanhas ainda ativas.
    filtering: JSON.stringify([statusClause(statuses, 'ad.effective_status')]),
    access_token: t,
    limit: '500',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
export function fetchFin(accId: string, preset: string, t: string, statuses: string[]) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,actions,action_values',
    ...dateParams(preset),
    filtering: JSON.stringify([statusClause(statuses)]),
    access_token: t,
    limit: '400',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}
export function fetchFinHourly(accId: string, preset: string, t: string, statuses: string[]) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_name,spend,actions,action_values',
    breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    ...dateParams(preset),
    filtering: JSON.stringify([statusClause(statuses)]),
    access_token: t,
    limit: '500',
  })
  return paginate(`${BASE}/act_${accId}/insights?${p}`)
}

/* ── ações de escala/pausa ── */
export async function getBudget(campId: string, t: string) {
  const r = await fetch(`${BASE}/${campId}?fields=daily_budget,lifetime_budget,name,status&access_token=${t}`)
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  if (j.daily_budget)
    return {
      level: 'campaign' as const,
      items: [{ id: campId, daily: parseInt(j.daily_budget), name: j.name }],
      total: parseInt(j.daily_budget),
    }
  const p = new URLSearchParams({
    fields: 'daily_budget,name,status,effective_status',
    access_token: t,
    limit: '100',
  })
  const j2 = await (await fetch(`${BASE}/${campId}/adsets?${p}`)).json()
  if (j2.error) throw new Error(j2.error.message)
  const items = (j2.data || [])
    .filter((a: any) => a.effective_status === 'ACTIVE' && a.daily_budget)
    .map((a: any) => ({ id: a.id, daily: parseInt(a.daily_budget), name: a.name }))
  return {
    level: 'adset' as const,
    items,
    total: items.reduce((s: number, i: any) => s + i.daily, 0),
  }
}
export async function setBudget(entityId: string, cents: number, t: string) {
  const r = await fetch(`${BASE}/${entityId}`, {
    method: 'POST',
    body: new URLSearchParams({ daily_budget: String(cents), access_token: t }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j
}
export async function pauseCampaign(campId: string, t: string) {
  const r = await fetch(`${BASE}/${campId}`, {
    method: 'POST',
    body: new URLSearchParams({ status: 'PAUSED', access_token: t }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j
}

export interface CopyCampaignResult {
  copied_campaign_id: string
  ad_object_ids?: { ad_object_type: string; source_id: string; copied_id: string }[]
}
/** Duplica uma campanha na Meta. deep_copy=true copia adsets + ads junto.
 *  rename_options exige AMBOS rename_prefix e rename_suffix — omitir um causa
 *  "Invalid parameter" (code 100/1443226). Prefixo/sufixo aplicam a campanha,
 *  conjuntos e anúncios ao mesmo tempo. */
export async function copyCampaign(
  campId: string,
  t: string,
  opts: { deepCopy?: boolean; status?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE'; renamePrefix?: string; renameSuffix?: string } = {},
): Promise<CopyCampaignResult> {
  const body: Record<string, string> = {
    deep_copy: String(opts.deepCopy ?? true),
    status_option: opts.status || 'PAUSED',
    access_token: t,
  }
  const prefix = opts.renamePrefix ?? ''
  const suffix = opts.renameSuffix ?? ''
  if (prefix || suffix) {
    body.rename_options = JSON.stringify({ rename_prefix: prefix, rename_suffix: suffix })
  }
  const r = await fetch(`${BASE}/${campId}/copies`, {
    method: 'POST',
    body: new URLSearchParams(body),
  })
  const j = await r.json()
  if (j.error) {
    const e = j.error
    let msg = `${e.message} (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})`
    if (e.error_user_msg) msg += ` — ${e.error_user_msg}`
    throw new Error(msg)
  }
  return j
}

/** Lê só o nome de uma campanha (pra confirmar o nome da cópia recém-criada). */
export async function fetchCampaignName(campId: string, t: string): Promise<string> {
  const p = new URLSearchParams({ fields: 'name', access_token: t })
  const j = await (await fetch(`${BASE}/${campId}?${p}`)).json()
  if (j.error) throw new Error(j.error.message)
  return j.name || ''
}

export const campUrl = (accId: string, campId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accId}&selected_campaign_ids=${campId}`
