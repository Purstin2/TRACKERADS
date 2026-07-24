import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { cacheGet, cacheSet, remoteGet, remoteSet, loadState } from '@/lib/appState'
import {
  fetchAggregate,
  fetchTimeSeries,
  fetchEntityMeta,
  fetchAdAccounts,
  getRoas,
  getCpa,
  getSales,
  type InsightRow,
  type AdLevel,
} from '@/lib/meta'
import {
  getStoredAccounts,
  ACCOUNTS_KEY,
  setLiveAccounts,
  DEFAULT_SETTINGS,
  STATUS_FILTERS,
  type Account,
  type DayData,
  type Settings,
} from './config'
import { fetchRealByCampaign, type RealAgg } from './realRoas'

export type MonitorView = 'lista' | 'historico' | 'grafico' | 'aovivo'

/** Aba da tabela: as três da Meta + "Contas" (agregado por conta, não vem da API). */
export type TableLevel = 'account' | AdLevel

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
  kind: MonitorView | 'err'
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
  accounts: Account[]
  refreshAccounts: () => Promise<void>
  refreshingAccounts: boolean
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
  tableLevel: TableLevel
  setTableLevel: (t: TableLevel) => void
  nameFilter: string
  setNameFilter: (s: string) => void
  offerFilter: string
  setOfferFilter: (s: string) => void
  settings: Settings
  saveSettings: (s: Settings) => void
  cache: CacheItem[]
  loading: boolean
  lastLoad: number | null
  /** Reflete na tela o status novo depois de ligar/desligar, sem refazer o fetch. */
  patchStatus: (accId: string, entityId: string, status: string) => void
  actionFilter: string | null
  setActionFilter: (c: string | null) => void
  campSel: Set<string>
  toggleCamp: (key: string) => void
  clearCampSel: () => void
  selectMany: (keys: string[], on: boolean) => void
  onlySelected: boolean
  setOnlySelected: (b: boolean) => void
  touchedOnly: boolean
  setTouchedOnly: (b: boolean) => void
  /** Modo compacto: esconde chips e filtros pra sobrar altura de tabela. */
  compact: boolean
  setCompact: (b: boolean) => void
  neonKeys: Set<string>
  compareDuplication: (accId: string, origId: string, copyId: string) => void
  realMap: Record<string, RealAgg>
  loadMonitor: (lvl?: AdLevel, viewOverride?: MonitorView) => Promise<void>
}

const MonitorCtx = createContext<Ctx | null>(null)

export function MonitorProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState(() => localStorage.getItem('meta_tok') || '')
  const initAcc = getStoredAccounts()
  const [accounts, setAccounts] = useState<Account[]>(initAcc)
  const [refreshingAccounts, setRefreshingAccounts] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(initAcc.map((a) => a.id)))
  const [status, setStatus] = useState('active')
  const [datePreset, setDatePreset] = useState('last_14d')
  const [view, setView] = useState<MonitorView>('lista')
  const [level, setLevelState] = useState<AdLevel>('campaign')
  const [tableLevel, setTableLevelState] = useState<TableLevel>('campaign')
  const [nameFilter, setNameFilter] = useState('')
  const [offerFilter, setOfferFilter] = useState('')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [cache, setCache] = useState<CacheItem[]>([])
  const [loading, setLoading] = useState(false)
  const [lastLoad, setLastLoad] = useState<number | null>(null)
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const [campSel, setCampSel] = useState<Set<string>>(new Set())
  const [onlySelected, setOnlySelected] = useState(false)
  const [touchedOnly, setTouchedOnly] = useState(false)
  const [compact, setCompactState] = useState(() => localStorage.getItem('monitor_compact') === '1')
  const setCompact = (b: boolean) => {
    setCompactState(b)
    localStorage.setItem('monitor_compact', b ? '1' : '0')
  }
  const [neonKeys, setNeonKeys] = useState<Set<string>>(new Set())
  const [realMap, setRealMap] = useState<Record<string, RealAgg>>({})
  const toggleCamp = (key: string) =>
    setCampSel((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  const clearCampSel = () => {
    setCampSel(new Set())
    setOnlySelected(false)
    setNeonKeys(new Set())
  }
  const selectMany = (keys: string[], on: boolean) =>
    setCampSel((s) => {
      const n = new Set(s)
      keys.forEach((k) => (on ? n.add(k) : n.delete(k)))
      return n
    })
  // "Comparar as duas": seleciona original + cópia, filtra só elas e destaca a
  // cópia com borda neon. Original e cópia vivem na mesma conta de anúncio.
  const compareDuplication = (accId: string, origId: string, copyId: string) => {
    const oKey = `${accId}::${origId}`
    const cKey = `${accId}::${copyId}`
    setCampSel(new Set([oKey, cKey]))
    setNeonKeys(new Set([cKey]))
    setOnlySelected(true)
  }

  const setToken = (t: string) => {
    setTokenState(t)
    localStorage.setItem('meta_tok', t)
    remoteSet('meta_tok', t) // servidor (briefing) e outros dispositivos leem daqui
  }
  // token: com local → empurra pro banco (servidor/briefing lê de lá);
  // sem local → puxa do banco (outro dispositivo já colou)
  useEffect(() => {
    if (token.trim()) {
      remoteSet('meta_tok', token.trim())
      return
    }
    remoteGet<string>('meta_tok').then((t) => {
      if (t && typeof t === 'string') {
        setTokenState(t)
        localStorage.setItem('meta_tok', t)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // contas monitoradas visíveis pro servidor (briefing itera nelas)
  useEffect(() => {
    if (accounts.length) remoteSet(ACCOUNTS_KEY, accounts)
  }, [accounts])
  const toggleAccount = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  // mantém accCur/accName (config) em sincronia com a lista atual
  useEffect(() => {
    setLiveAccounts(accounts)
  }, [accounts])

  // Busca as contas do Meta e adiciona as novas (mantém o nome custom das já existentes)
  const refreshAccounts = async () => {
    if (!token.trim()) {
      alert('Cole o access token primeiro.')
      return
    }
    setRefreshingAccounts(true)
    try {
      const live = await fetchAdAccounts(token.trim())
      if (!live.length) {
        alert('Nenhuma conta retornada pelo Meta (verifique o token).')
        return
      }
      const byId = new Map(accounts.map((a) => [a.id, a]))
      // ordem: as que já existiam primeiro, depois novas do Meta. O Meta é a
      // fonte da verdade do nome/moeda (nomeou a conta lá → reflete ao Atualizar).
      const merged: Account[] = accounts.map((a) => {
        const m = live.find((l) => l.id === a.id)
        return m ? { ...a, name: m.name, cur: m.cur } : a
      })
      const newOnes = live.filter((l) => !byId.has(l.id))
      merged.push(...newOnes)
      setAccounts(merged)
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(merged))
      setLiveAccounts(merged)
      if (newOnes.length) {
        setSelected((s) => {
          const n = new Set(s)
          newOnes.forEach((a) => n.add(a.id))
          return n
        })
        alert(`${newOnes.length} conta(s) nova(s) adicionada(s): ${newOnes.map((a) => a.name).join(', ')}`)
      } else {
        alert('Tudo atualizado — nenhuma conta nova encontrada.')
      }
    } catch (e: any) {
      alert('Erro ao buscar contas: ' + e.message)
    } finally {
      setRefreshingAccounts(false)
    }
  }
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
  /** "Contas" é um agregado das linhas de campanha — muda só a exibição, não a busca. */
  const setTableLevel = (t: TableLevel) => {
    setTableLevelState(t)
    const dataLevel: AdLevel = t === 'account' ? 'campaign' : t
    if (dataLevel !== level) setLevel(dataLevel)
  }
  const patchStatus = (accId: string, entityId: string, status: string) =>
    setCache((prev) =>
      prev.map((item) => {
        if (item.acc.id !== accId) return item
        const prevMeta = item.meta?.[entityId] || { budget: null }
        return { ...item, meta: { ...item.meta, [entityId]: { ...prevMeta, status } } }
      }),
    )

  // `viewOverride`: quem troca de aba e recarrega no mesmo clique (ex.: 'ver na Lista'
  // vindo do Ao vivo) precisa disso — o setView do React só vale no próximo render,
  // então sem o override o fetch sairia com a aba ANTIGA e a tela ficaria vazia.
  async function loadMonitor(lvl?: AdLevel, viewOverride?: MonitorView) {
    // guarda: o botão Atualizar chama isto como handler (passa o evento) → só aceita level válido
    const useLevel: AdLevel = lvl === 'campaign' || lvl === 'adset' || lvl === 'ad' ? lvl : level
    const useView: MonitorView = viewOverride || view
    if (!token.trim()) {
      alert('Cole o access token primeiro.')
      return
    }
    setActionFilter(null)
    setLoading(true)
    setCache([])
    const statuses = STATUS_FILTERS[status]?.values || ['ACTIVE']
    const accs = accounts.filter((a) => selected.has(a.id))
    const tok = token.trim()
    // vendas reais do gateway por campanha (mesma janela do Meta) — em paralelo
    fetchRealByCampaign(datePreset).then(setRealMap).catch(() => setRealMap({}))
    // PARALELO: todas as contas de uma vez (antes era conta por conta em fila).
    // Promise.all preserva a ordem das contas no resultado.
    const out: CacheItem[] = await Promise.all(
      accs.map(async (acc): Promise<CacheItem> => {
        try {
          if (useView === 'lista') {
            const [rows, cm] = await Promise.all([
              fetchAggregate(acc.id, datePreset, tok, statuses, useLevel),
              fetchEntityMeta(acc.id, tok, useLevel).catch(() => [] as any[]),
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
          return { acc, kind: useView, campMap: processTS(rows), dates: [...new Set(rows.map((r) => r.date_start!))].sort() }
        } catch (e: any) {
          return { acc, kind: 'err', msg: e.message }
        }
      }),
    )
    setCache(out)
    setLastLoad(Date.now())
    setLoading(false)
  }

  const value: Ctx = {
    token,
    setToken,
    accounts,
    refreshAccounts,
    refreshingAccounts,
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
    tableLevel,
    setTableLevel,
    nameFilter,
    setNameFilter,
    offerFilter,
    setOfferFilter,
    settings,
    saveSettings,
    cache,
    loading,
    lastLoad,
    patchStatus,
    actionFilter,
    setActionFilter,
    campSel,
    toggleCamp,
    clearCampSel,
    selectMany,
    onlySelected,
    setOnlySelected,
    touchedOnly,
    setTouchedOnly,
    compact,
    setCompact,
    neonKeys,
    compareDuplication,
    realMap,
    loadMonitor,
  }
  return <MonitorCtx.Provider value={value}>{children}</MonitorCtx.Provider>
}

export function useMonitor() {
  const c = useContext(MonitorCtx)
  if (!c) throw new Error('useMonitor must be used within MonitorProvider')
  return c
}
