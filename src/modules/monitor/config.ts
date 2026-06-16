export interface Account {
  id: string
  name: string
  cur: 'USD' | 'BRL'
}

export const ACCOUNTS: Account[] = [
  { id: '1182053470681632', name: 'MALDIVAS', cur: 'USD' },
  { id: '884258587535238', name: 'CHILE', cur: 'USD' },
  { id: '2529287140834764', name: 'HOLANDA', cur: 'USD' },
  { id: '1149436580510398', name: 'CANADA', cur: 'USD' },
  { id: '1903971303669696', name: 'BILLIONARE', cur: 'BRL' },
  { id: '984584710777200', name: 'TANJIRO', cur: 'USD' },
]

export interface Settings {
  roasGood: number
  roasBe: number
  cpaMax: number
  fx: number
  freqWarn: number
}
export const DEFAULT_SETTINGS: Settings = {
  roasGood: 2.0,
  roasBe: 1.25,
  cpaMax: 12,
  fx: 5.4,
  freqWarn: 3.5,
}

export const ICONS: Record<string, string> = { good: '✅', bad: '❌', warn: '⚠️', none: '—' }
export const ORDER: Record<string, number> = { bad: 0, none: 1, warn: 2, good: 3 }
export const PALETTE = [
  '#8b7cff', '#46d989', '#f7b955', '#5fa8ff', '#fb6f86', '#a78bff',
  '#5ee0a0', '#ffca6b', '#7eb8ff', '#ff8fa3', '#c4b5ff', '#86efac',
]

export const STATUS_FILTERS: Record<string, { label: string; values: string[] }> = {
  active: { label: 'Apenas ativas', values: ['ACTIVE'] },
  active_paused: {
    label: 'Ativas + pausadas',
    values: ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'],
  },
  all: {
    label: 'Tudo (inclui excluídas)',
    values: [
      'ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS',
      'WITH_ISSUES', 'ARCHIVED', 'DELETED',
    ],
  },
  deleted_only: { label: 'Apenas excluídas', values: ['ARCHIVED', 'DELETED'] },
}

export const DATE_OPTIONS: { value: string; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_14d', label: 'Últimos 14 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
]

/* ── breakdowns (Públicos) ── */
export const BREAKDOWNS: Record<string, { label: string; api: string }> = {
  age: { label: 'Idade', api: 'age' },
  gender: { label: 'Gênero', api: 'gender' },
  age_gender: { label: 'Idade + Gênero', api: 'age,gender' },
  device: { label: 'Dispositivo', api: 'impression_device' },
  country: { label: 'País', api: 'country' },
  regiao: { label: 'Região', api: 'region' },
  platform: { label: 'Plataforma', api: 'publisher_platform' },
  posicionamento: { label: 'Posicionamento', api: 'platform_position' },
  hora: { label: 'Hora do dia', api: 'hourly_stats_aggregated_by_advertiser_time_zone' },
}
const GENDER_PT: Record<string, string> = { male: 'Homem', female: 'Mulher', unknown: 'Desconhecido' }
const DEVICE_PT: Record<string, string> = {
  iphone: 'iPhone', ipad: 'iPad', android_smartphone: 'Android', android_tablet: 'Tablet Android', desktop: 'Desktop', other: 'Outro',
}
const COUNTRY_PT: Record<string, string> = {
  BR: '🇧🇷 Brasil', US: '🇺🇸 EUA', PT: '🇵🇹 Portugal', GB: '🇬🇧 Reino Unido', DE: '🇩🇪 Alemanha', FR: '🇫🇷 França',
  ES: '🇪🇸 Espanha', IT: '🇮🇹 Itália', CA: '🇨🇦 Canadá', AU: '🇦🇺 Austrália', NL: '🇳🇱 Holanda', IE: '🇮🇪 Irlanda', MX: '🇲🇽 México', CH: '🇨🇭 Suíça',
}
const PLACEMENT_PT: Record<string, string> = {
  feed: 'Feed', facebook_feed: 'Feed FB', instagram_feed: 'Feed IG', story: 'Stories', facebook_story: 'Stories FB',
  instagram_story: 'Stories IG', instagram_stories: 'Stories IG', reels: 'Reels', facebook_reels: 'Reels FB', instagram_reels: 'Reels IG',
  instream_video: 'Vídeo in-stream', video_feeds: 'Feed de vídeo', marketplace: 'Marketplace', right_hand_column: 'Coluna direita',
  search: 'Busca', facebook_search: 'Busca FB', explore: 'Explorar', instagram_explore: 'Explorar IG', biz_disco_feed: 'Feed descoberta',
  facebook_groups_feed: 'Grupos', messenger_inbox: 'Messenger', an_classic: 'Audience Network', rewarded_video: 'Vídeo recompensado', profile_feed: 'Feed de perfil',
}
export const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']

export function keyFor(r: any, dim: string): string {
  if (dim === 'age') return r.age || '—'
  if (dim === 'gender') return GENDER_PT[r.gender] || r.gender || '—'
  if (dim === 'age_gender') return `${r.age || '—'} · ${GENDER_PT[r.gender] || r.gender || '—'}`
  if (dim === 'device') return DEVICE_PT[r.impression_device] || r.impression_device || '—'
  if (dim === 'country') return COUNTRY_PT[r.country] || r.country || '—'
  if (dim === 'regiao') return r.region || '—'
  if (dim === 'platform') return r.publisher_platform || '—'
  if (dim === 'posicionamento') return PLACEMENT_PT[r.platform_position] || r.platform_position || '—'
  if (dim === 'hora') {
    const h = r.hourly_stats_aggregated_by_advertiser_time_zone
    return h ? h.slice(0, 2) + 'h' : '—'
  }
  return '—'
}

export const curSym = (c: string) => (c === 'BRL' ? 'R$' : '$')
export const accCur = (id: string) => ACCOUNTS.find((a) => a.id === id)?.cur || 'USD'
export const accName = (id: string) => ACCOUNTS.find((a) => a.id === id)?.name || id
export const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

/* ── classificação ── */
export function classify(
  roas: number | null,
  cpa: number | null,
  sales: number,
  s: Settings,
): string {
  if (!sales) return 'none'
  const ok = cpa === null || cpa <= s.cpaMax
  if (roas !== null && roas >= s.roasGood && ok) return 'good'
  if ((roas !== null && roas < s.roasBe) || !ok) return 'bad'
  return 'warn'
}
export function roasCls(r: number | null, s: Settings): string {
  if (r === null) return 'cm'
  if (r >= s.roasGood) return 'cg'
  if (r < s.roasBe) return 'cr'
  return 'cy'
}

export interface ActionResult {
  code: string
  label: string
  detail: string
}

export interface DayData {
  roas: number | null
  cpa: number | null
  sales: number
  spend: number
}

export function analyzeAction(
  datesObj: Record<string, DayData>,
  allDates: string[],
  s: Settings,
): ActionResult {
  const sorted = allDates.filter((d) => datesObj[d])
  if (!sorted.length) return { code: 'sem', label: '—', detail: 'Sem dados' }
  const days = sorted.map((d) => ({ ...datesObj[d], date: d }))
  const n = days.length
  if (n < 3) return { code: 'aguardar', label: '🕐 AGUARDAR', detail: `${n} dia(s) de dados — aguardar 48-72h` }
  const last1 = days[n - 1]
  const last2 = days.slice(-2)
  const last3 = days.slice(-3)
  const last7 = days.slice(-7)
  const sp7 = last7.reduce((acc, d) => acc + d.spend, 0)
  const rev7 = last7.reduce((acc, d) => acc + (d.roas || 0) * d.spend, 0)
  const macRoas = sp7 > 0 ? rev7 / sp7 : null
  const sl7 = last7.reduce((acc, d) => acc + d.sales, 0)
  const macCpa = sl7 > 0 ? sp7 / sl7 : null
  const l2v = last2.filter((d) => d.roas !== null)
  if (l2v.length >= 2 && l2v.every((d) => d.roas! >= s.roasGood && (d.cpa === null || d.cpa <= s.cpaMax)))
    return { code: 'escalar', label: '🚀 ESCALAR', detail: `2 dias consecutivos: ${l2v.map((d) => d.roas!.toFixed(2)).join(' e ')} — +30% ou duplicar` }
  if (macCpa !== null && macCpa > s.cpaMax)
    return { code: 'matar', label: '🔴 MATAR', detail: `CPA 7d $${macCpa.toFixed(2)} > $${s.cpaMax} — pausar` }
  const l3s = last3.filter((d) => d.spend > 0.5)
  if (l3s.length >= 3 && l3s.every((d) => d.roas !== null && d.roas < s.roasBe))
    return { code: 'matar', label: '🔴 MATAR', detail: `3 dias ROAS < ${s.roasBe}: ${l3s.map((d) => d.roas!.toFixed(2)).join(' → ')} — pausar` }
  if (last3.filter((d) => d.spend > 0.5 && d.sales === 0).length >= 3)
    return { code: 'matar', label: '🔴 MATAR', detail: '3 dias com gasto e zero vendas' }
  if (last1.roas !== null && last1.roas >= s.roasGood) {
    const prev = n >= 2 ? days[n - 2] : null
    if (!prev || prev.roas === null || prev.roas < s.roasGood)
      return { code: 'perto', label: '📈 PERTO', detail: `Ontem ROAS ${last1.roas.toFixed(2)} — falta +1 dia ≥ ${s.roasGood}` }
  }
  if (last1.roas !== null && last1.roas < s.roasBe && macRoas !== null && macRoas >= s.roasBe)
    return { code: 'atencao', label: '⚠️ ATENÇÃO', detail: `Ontem ${last1.roas.toFixed(2)} — macro 7d ${macRoas.toFixed(2)} ok. Monitorar` }
  if (macRoas !== null && macRoas >= s.roasBe && macRoas < s.roasGood)
    return { code: 'monitorar', label: '👁 MONITORAR', detail: `ROAS 7d ${macRoas.toFixed(2)} — lucrativo abaixo de ${s.roasGood}` }
  return { code: 'ok', label: '✅ OK', detail: 'Dentro dos parâmetros' }
}

export function analyzeAggregate(
  roas: number | null,
  cpa: number | null,
  sales: number,
  s: Settings,
): ActionResult {
  if (!sales) return { code: 'sem', label: '—', detail: 'Sem vendas' }
  if (cpa !== null && cpa > s.cpaMax)
    return { code: 'matar', label: '🔴 MATAR', detail: `CPA $${cpa.toFixed(2)} > $${s.cpaMax} — confira 7d` }
  if (roas !== null && roas < s.roasBe)
    return { code: 'matar', label: '🔴 MATAR', detail: `ROAS ${roas.toFixed(2)} < breakeven ${s.roasBe}` }
  if (roas !== null && roas >= s.roasGood && (cpa === null || cpa <= s.cpaMax))
    return { code: 'escalar', label: '🚀 ESCALAR', detail: 'ROAS alto — confirme 2 dias no Histórico' }
  if (roas !== null && roas >= s.roasBe)
    return { code: 'monitorar', label: '👁 MONITORAR', detail: `ROAS ${roas.toFixed(2)} — lucrativo` }
  return { code: 'ok', label: '—', detail: '' }
}

export const BADGE_CLS: Record<string, string> = {
  escalar: 'bg-ok/15 text-ok',
  matar: 'bg-danger/15 text-danger',
  atencao: 'bg-warn/15 text-warn',
  perto: 'bg-brand/15 text-brand-2',
  monitorar: 'bg-surface2 text-muted',
  aguardar: 'bg-surface2 text-muted2',
  ok: 'bg-ok/10 text-ok',
  sem: 'bg-surface2 text-muted2',
}

export const ROW_BG: Record<string, string> = {
  good: 'bg-ok/[0.05]',
  bad: 'bg-danger/[0.05]',
  warn: 'bg-warn/[0.04]',
  none: '',
}

export const VAL_CLS: Record<string, string> = {
  cg: 'text-ok',
  cr: 'text-danger',
  cy: 'text-warn',
  cm: 'text-muted2',
}
