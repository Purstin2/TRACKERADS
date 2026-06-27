import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { cacheGet, cacheSet, remoteSet, loadState } from '@/lib/appState'
import {
  fetchAggregate,
  fetchTimeSeries,
  fetchCampaignMeta,
  getRoas,
  getCpa,
  getSales,
  type InsightRow,
  type AdLevel,
} from '@/lib/meta'
import {
  ACCOUNTS,
  DEFAULT_SETTINGS,
  STATUS_FILTERS,
  type Account,
  type DayData,
  type Settings,
} from './config'

export type MonitorView = 'lista' | 'historico' | 'grafico'

export interface CampMap {
  [campId: string]: { name: string; dates: Record<string, DayData> }
}
export interface CampMeta {
  budget: number | null
  updatedTime?: string
  status?: string
}
export interface CacheItem {
  acc: Account
  kind: 'lista' | 'historico' | 'grafico' | 'err'
  rows?: InsightRow[]
  meta?: Record<string, CampMeta>
  campMap?: CampMap
  dates?: string[]
  msg?: string
}

function normSettings(s: Partial<Settings> | null): Settings {
  if (!s) return DEFAULT_SETTINGS
  return {
    roasGood: +(s.roasGood as number) || DEFAULT_SETTINGS.roasGood,
    roasBe: +(s.roasBe as number) || DEFAULT_SETTINGS.roasBe,
    cpaMax: +(s.cpaMax as number) || DEFAULT_SETTINGS.cpaMax,
    fx: +(s.fx as number) || DEFAULT_SETTINGS.fx,
    freqWarn: DEFAULT_SETTINGS.freqWarn,
  }
}
function loadSettings(): Settings {
  return normSettings(cacheGet<Partial<Settings>>('meta_settings', {}))
}

function processTS(rows: InsightRow[]): CampMap {
  const map: CampMap = {}
  rows.forEach((r) => {
    const cid = r.campaign_id!
    if (!map[cid]) map[cid] = { name: r.campaign_name || '', dates: {} }
    map[cid].dates[r.date_start!] = {
      roas: getRoas(r),
      cpa: getCpa(r),
      sales: getSales(r),
      spend: parseFloat(r.spend || '0'),
    }
  })
  return map
}

interface Ctx {
  token: string
  setToken: (t: string) => void
  selected: Set<string>
  toggleAccount: (id: string) => void
  status: string
  setStatus: (s: string) => void
  datePreset: string
  setDatePreset: (d: string) => void
  view: MonitorView
  setView: (v: MonitorView) => void
  level: AdLevel
  setLevel: (l: AdLevel) => void
  settings: Settings
  saveSettings: (s: Settings) => void
  exec: boolean
  setExec: (b: boolean) => void
  cache: CacheItem[]
  loading: boolean
  actionFilter: string | null
  setActionFilter: (c: string | null) => void
  campSel: Set<string>
  toggleCamp: (key: string) => void
  clearCampSel: () => void
  selectMany: (keys: string[], on: boolean) => void
  onlySelected: boolean
  setOnlySelected: (b: boolean) => void
  loadMonitor: () => Promise<void>
}

const MonitorCtx = createContext<Ctx | null>(null)

export function MonitorProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState(() => localStorage.getItem('meta_tok') || '')
  const [selected, setSelected] = useState<Set<string>>(new Set(ACCOUNTS.map((a) => a.id)))
  const [status, setStatus] = useState('active')
  const [datePreset, setDatePreset] = useState('last_14d')
  const [view, setView] = useState<MonitorView>('lista')
  const [level, setLevelState] = useState<AdLevel>('campaign')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [exec, setExec] = useState(false)
  const [cache, setCache] = useState<CacheItem[]>([])
  const [loading, setLoading] = useState(false)
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const [campSel, setCampSel] = useState<Set<string>>(new Set())
  const [onlySelected, setOnlySelected] = useState(false)
  const toggleCamp = (key: string) =>
    setCampSel((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  const clearCampSel = () => {
    setCampSel(new Set())
    setOnlySelected(false)
  }
  const selectMany = (keys: string[], on: boolean) =>
    setCampSel((s) => {
      const n = new Set(s)
      keys.forEach((k) => (on ? n.add(k) : n.delete(k)))
      return n
    })

  const setToken = (t: string) => {
    setTokenState(t)
    localStorage.setItem('meta_tok', t)
  }
  const toggleAccount = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const saveSettings = (s: Settings) => {
    setSettings(s)
    cacheSet('meta_settings', s)
    remoteSet('meta_settings', s)
  }
  // sincroniza settings do Supabase ao montar (sobrevive a limpar cookies)
  useEffect(() => {
    loadState<Partial<Settings>>('meta_settings', {}).then((s) => setSettings(normSettings(s)))
  }, [])

  const setLevel = (l: AdLevel) => {
    setLevelState(l)
    if (token.trim() && cache.length) loadMonitor(l) // re-busca no novo nível se já tem dados
  }

  async function loadMonitor(lvl?: AdLevel) {
    // guarda: o botão Atualizar chama isto como handler (passa o evento) → só aceita level válido
    const useLevel: AdLevel = lvl === 'campaign' || lvl === 'adset' || lvl === 'ad' ? lvl : level
    if (!token.trim()) {
      alert('Cole o access token primeiro.')
      return
    }
    setActionFilter(null)
    setLoading(true)
    setCache([])
    const statuses = STATUS_FILTERS[status]?.values || ['ACTIVE']
    const accs = ACCOUNTS.filter((a) => selected.has(a.id))
    const tok = token.trim()
    // PARALELO: todas as contas de uma vez (antes era conta por conta em fila).
    // Promise.all preserva a ordem das contas no resultado.
    const out: CacheItem[] = await Promise.all(
      accs.map(async (acc): Promise<CacheItem> => {
        try {
          if (view === 'lista') {
            const [rows, cm] = await Promise.all([
              fetchAggregate(acc.id, datePreset, tok, statuses, useLevel),
              useLevel === 'campaign' ? fetchCampaignMeta(acc.id, tok).catch(() => [] as any[]) : Promise.resolve([] as any[]),
            ])
            const meta: Record<string, CampMeta> = {}
            ;(cm as any[]).forEach((c) => {
              meta[c.id] = {
                budget: c.daily_budget ? parseInt(c.daily_budget) : c.lifetime_budget ? parseInt(c.lifetime_budget) : null,
                updatedTime: c.updated_time,
                status: c.effective_status,
              }
            })
            return { acc, kind: 'lista', rows, meta }
          }
          const rows = await fetchTimeSeries(acc.id, datePreset, tok, statuses)
          return { acc, kind: view, campMap: processTS(rows), dates: [...new Set(rows.map((r) => r.date_start!))].sort() }
        } catch (e: any) {
          return { acc, kind: 'err', msg: e.message }
        }
      }),
    )
    setCache(out)
    setLoading(false)
  }

  const value: Ctx = {
    token,
    setToken,
    selected,
    toggleAccount,
    status,
    setStatus,
    datePreset,
    setDatePreset,
    view,
    setView,
    level,
    setLevel,
    settings,
    saveSettings,
    exec,
    setExec,
    cache,
    loading,
    actionFilter,
    setActionFilter,
    campSel,
    toggleCamp,
    clearCampSel,
    selectMany,
    onlySelected,
    setOnlySelected,
    loadMonitor,
  }
  return <MonitorCtx.Provider value={value}>{children}</MonitorCtx.Provider>
}

export function useMonitor() {
  const c = useContext(MonitorCtx)
  if (!c) throw new Error('useMonitor must be used within MonitorProvider')
  return c
}
