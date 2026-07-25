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
// Presets last_Nd que o Graph aceita nativamente. "last_4d" NÃO está aqui — o
// Graph não tem 4d, então ele é traduzido pra uma janela time_range.
const NATIVE_PRESETS = new Set(['last_3d', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d'])
export function dateParams(val: string): Record<string, string> {
  if (typeof val === 'string' && val.startsWith('custom:')) {
    const [, since, until] = val.split(':')
    if (since && until) return { time_range: JSON.stringify({ since, until }) }
  }
  // last_Nd não-nativo (ex.: last_4d) → janela de N dias terminando ONTEM,
  // igual à convenção "exclui hoje" dos last_Nd nativos (bate com o 7d na Lista).
  const md = /^last_(\d+)d$/.exec(val || '')
  if (md && !NATIVE_PRESETS.has(val)) {
    const n = parseInt(md[1])
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const until = new Date(); until.setDate(until.getDate() - 1)
    const since = new Date(); since.setDate(since.getDate() - n)
    return { time_range: JSON.stringify({ since: fmt(since), until: fmt(until) }) }
  }
  return { date_preset: val }
}
export function dateRange(val: string): { since: string; until: string } {
  if (typeof val === 'string' && val.startsWith('custom:')) {
    const [, since, until] = val.split(':')
    if (since && until) return { since, until }
  }
  const days =
    ({ yesterday: 1, today: 1, last_4d: 4, last_7d: 7, last_14d: 14, last_30d: 30 } as Record<string, number>)[
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
/** Mesma coisa nos três níveis — o switch de status e a coluna Orçamento precisam
 *  disso também em Conjuntos e Anúncios (insights não devolve status nem verba). */
const META_EDGE: Record<AdLevel, string> = { campaign: 'campaigns', adset: 'adsets', ad: 'ads' }
const META_FIELDS: Record<AdLevel, string> = {
  campaign: 'id,name,daily_budget,lifetime_budget,updated_time,effective_status,status',
  adset: 'id,name,daily_budget,lifetime_budget,updated_time,effective_status,status',
  ad: 'id,name,updated_time,effective_status,status',
}
export async function fetchEntityMeta(accId: string, t: string, level: AdLevel = 'campaign'): Promise<any[]> {
  const p = new URLSearchParams({ fields: META_FIELDS[level], limit: '500', access_token: t })
  return paginate(`${BASE}/act_${accId}/${META_EDGE[level]}?${p}`) as unknown as any[]
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
/** Gasto DIA a DIA por campanha — alimenta o "Lucro por Dia" (o único gráfico que
 *  desconta o anúncio do dia certo, por isso precisa do gasto quebrado por data). */
export function fetchFinDaily(accId: string, preset: string, t: string, statuses: string[]) {
  const p = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,date_start',
    ...dateParams(preset),
    time_increment: '1',
    filtering: JSON.stringify([statusClause(statuses)]),
    access_token: t,
    limit: '500',
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
/** Liga/desliga qualquer entidade (campanha, conjunto ou anúncio) — o switch da tabela. */
export async function setEntityStatus(id: string, status: 'ACTIVE' | 'PAUSED', t: string) {
  const r = await fetch(`${BASE}/${id}`, {
    method: 'POST',
    body: new URLSearchParams({ status, access_token: t }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error.message)
  return j
}

export interface CopyCampaignResult {
  copied_campaign_id: string
  ad_object_ids?: { ad_object_type: string; source_id: string; copied_id: string }[]
}

function fmtCopyErr(e: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string }): string {
  let msg = `${e.message || 'Erro'} (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})`
  if (e.error_subcode === 2490392) {
    msg = 'Posicionamento incompatível: o conjunto tem "Inicial do Explorar do Instagram" sem a seção "Explorar". Corrija o posicionamento no Gerenciador de Anúncios e tente novamente.'
  } else if (e.error_user_msg) {
    msg += ` — ${e.error_user_msg}`
  }
  return msg
}

/** Duplica uma campanha na Meta por partes (1 objeto por chamada — evita o limite de 3 do sync API).
 *  Fluxo: copia campanha (shell) → busca adsets → copia cada adset → copia cada anúncio. */
export async function copyCampaign(
  campId: string,
  t: string,
  opts: { deepCopy?: boolean; status?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE'; renamePrefix?: string; renameSuffix?: string } = {},
  onStatus?: (msg: string) => void,
): Promise<CopyCampaignResult> {
  const statusOption = opts.status || 'PAUSED'
  const renamePrefix = opts.renamePrefix ?? ''
  const renameSuffix = opts.renameSuffix ?? ''

  // 1. Copia só a estrutura da campanha (sem adsets/anúncios)
  onStatus?.('Copiando estrutura da campanha…')
  const campBody = new URLSearchParams()
  campBody.set('deep_copy', 'false')
  campBody.set('status_option', statusOption)
  campBody.set('access_token', t)
  if (renamePrefix || renameSuffix) {
    campBody.set('rename_options', JSON.stringify({ rename_prefix: renamePrefix, rename_suffix: renameSuffix }))
  }
  const campJ = await (await fetch(`${BASE}/${campId}/copies`, { method: 'POST', body: campBody })).json()
  if (campJ.error) throw new Error(fmtCopyErr(campJ.error))
  const newCampId: string = campJ.copied_campaign_id
  if (!newCampId) throw new Error(`Meta não retornou ID da campanha. Resposta: ${JSON.stringify(campJ).slice(0, 200)}`)

  // 2. Busca conjuntos da campanha original
  onStatus?.('Buscando conjuntos de anúncios…')
  const adsetsP = new URLSearchParams({ fields: 'id', limit: '200', access_token: t })
  const adsetsJ = await (await fetch(`${BASE}/${campId}/adsets?${adsetsP}`)).json()
  if (adsetsJ.error) throw new Error(adsetsJ.error.message)
  const adsets: { id: string }[] = adsetsJ.data || []

  const ad_object_ids: NonNullable<CopyCampaignResult['ad_object_ids']> = []

  // 3. Para cada conjunto: copia o conjunto e depois cada anúncio
  for (let i = 0; i < adsets.length; i++) {
    const adsetId = adsets[i].id
    onStatus?.(`Copiando conjunto ${i + 1}/${adsets.length}…`)

    const adsetBody = new URLSearchParams()
    adsetBody.set('deep_copy', 'false')
    adsetBody.set('status_option', statusOption)
    adsetBody.set('campaign_id', newCampId)
    adsetBody.set('access_token', t)
    const adsetJ = await (await fetch(`${BASE}/${adsetId}/copies`, { method: 'POST', body: adsetBody })).json()
    if (adsetJ.error) throw new Error(fmtCopyErr(adsetJ.error))
    const newAdsetId: string = adsetJ.copied_adset_id || adsetJ.id
    if (!newAdsetId) throw new Error(`Meta não retornou ID do conjunto ${i + 1}. Resposta: ${JSON.stringify(adsetJ).slice(0, 200)}`)
    ad_object_ids.push({ ad_object_type: 'AD_SET', source_id: adsetId, copied_id: newAdsetId })

    // Busca anúncios do conjunto original
    const adsP = new URLSearchParams({ fields: 'id', limit: '200', access_token: t })
    const adsJ = await (await fetch(`${BASE}/${adsetId}/ads?${adsP}`)).json()
    if (adsJ.error) throw new Error(adsJ.error.message)
    const ads: { id: string }[] = adsJ.data || []

    for (let j = 0; j < ads.length; j++) {
      onStatus?.(`Conjunto ${i + 1}/${adsets.length} · anúncio ${j + 1}/${ads.length}…`)
      const adBody = new URLSearchParams()
      adBody.set('deep_copy', 'false')
      adBody.set('status_option', statusOption)
      adBody.set('adset_id', newAdsetId)
      adBody.set('access_token', t)
      const adJ = await (await fetch(`${BASE}/${ads[j].id}/copies`, { method: 'POST', body: adBody })).json()
      if (adJ.error) throw new Error(fmtCopyErr(adJ.error))
    }
  }

  return { copied_campaign_id: newCampId, ad_object_ids }
}

/** Lê só o nome de uma campanha (pra confirmar o nome da cópia recém-criada). */
export async function fetchCampaignName(campId: string, t: string): Promise<string> {
  const p = new URLSearchParams({ fields: 'name', access_token: t })
  const j = await (await fetch(`${BASE}/${campId}?${p}`)).json()
  if (j.error) throw new Error(j.error.message)
  return j.name || ''
}

/** Renomeia uma campanha, conjunto ou anúncio via PATCH. Silencia erros (usado como
 *  pós-processamento após copies — não bloqueia o fluxo se falhar). */
export async function renameEntity(id: string, name: string, t: string): Promise<void> {
  const p = new URLSearchParams({ name, access_token: t })
  await fetch(`${BASE}/${id}`, { method: 'POST', body: p }).catch(() => {})
}

/** Atualiza o daily_budget de uma campanha (CBO) ou conjunto (ABO).
 *  Silencia erro — chamado nos dois níveis, só um vai ter efeito. */
export async function updateBudget(id: string, dailyBudget: number, t: string): Promise<void> {
  const p = new URLSearchParams({ daily_budget: String(Math.round(dailyBudget)), access_token: t })
  await fetch(`${BASE}/${id}`, { method: 'POST', body: p }).catch(() => {})
}

export const campUrl = (accId: string, campId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accId}&selected_campaign_ids=${campId}`
