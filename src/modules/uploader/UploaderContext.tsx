import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULTS,
  UTM_XCOD,
  type BudgetType,
  type ContaExtra,
  type Estrutura,
  type FormState,
  type SearchVideoSel,
  type VideoItem,
} from './types'
import {
  buildNome as buildNomeFn,
  buildURL as buildURLFn,
  getPaisNome as getPaisNomeFn,
} from './lib/naming'

const AUTOSAVE_KEY = 'purstin_uploader_autosave_v1'
const PRESET_KEY = 'purstin_uploader_presets'
const CONTAS_KEY = 'purstin_uploader_contas_extras'

interface Snapshot {
  form: Partial<FormState>
  budgetType: BudgetType
  estrutura: Estrutura
  utmPreset: string
  paises: string[]
}

interface Ctx {
  form: FormState
  setField: (key: keyof FormState, value: string) => void
  paises: string[]
  toggleCountry: (code: string) => void
  toggleGroup: (codes: string[]) => void
  toggleAllCountries: (allCodes: string[]) => void
  clearCountries: () => void
  budgetType: BudgetType
  setBudgetType: (t: BudgetType) => void
  estrutura: Estrutura
  setEstrutura: (e: Estrutura) => void
  utmPreset: string
  setUtmPreset: (p: string) => void
  videos: VideoItem[]
  setVideos: (v: VideoItem[]) => void
  videosSel: Set<string>
  toggleVideo: (id: string) => void
  selectAllVideos: (ids: string[]) => void
  clearVideoSel: () => void
  searchPlacementActive: boolean
  setSearchPlacementActive: (b: boolean) => void
  searchVideoSel: SearchVideoSel | null
  setSearchVideoSel: (v: SearchVideoSel | null) => void
  contasExtras: ContaExtra[]
  multiContaAtivo: boolean
  setMultiContaAtivo: (b: boolean) => void
  addConta: () => void
  removeConta: (i: number) => void
  updateConta: (i: number, patch: Partial<ContaExtra>) => void
  saveContas: () => void
  loadContas: () => number
  pageVerified: boolean
  setPageVerified: (b: boolean) => void
  presetNames: string[]
  savePreset: (name: string) => void
  loadPreset: (name: string) => void
  deletePreset: (name: string) => void
  // derived
  getPaisNome: () => string
  buildNome: (video: string) => string
  buildURL: () => string
}

const UploaderCtx = createContext<Ctx | null>(null)

function loadAutosave(): Snapshot | null {
  try {
    return JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null')
  } catch {
    return null
  }
}
function getPresets(): Record<string, Snapshot> {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}')
  } catch {
    return {}
  }
}

function defaultStartDt(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T06:00`
}

export function UploaderProvider({ children }: { children: ReactNode }) {
  const saved = useRef(loadAutosave()).current

  const [form, setForm] = useState<FormState>(() => {
    const base = { ...DEFAULTS, ...(saved?.form || {}) }
    if (!base.start_dt) base.start_dt = defaultStartDt()
    return base
  })
  const [paises, setPaises] = useState<string[]>(saved?.paises || ['BR'])
  const [budgetType, setBudgetType] = useState<BudgetType>(saved?.budgetType || 'ABO')
  const [estrutura, setEstrutura] = useState<Estrutura>(saved?.estrutura || 'N11')
  const [utmPreset, setUtmPresetState] = useState<string>(saved?.utmPreset || 'padrao')

  const [videos, setVideos] = useState<VideoItem[]>([])
  const [videosSel, setVideosSel] = useState<Set<string>>(new Set())
  const [searchPlacementActive, setSearchPlacementActive] = useState(false)
  const [searchVideoSel, setSearchVideoSel] = useState<SearchVideoSel | null>(null)

  const [contasExtras, setContasExtras] = useState<ContaExtra[]>([])
  const [multiContaAtivo, setMultiContaAtivo] = useState(false)
  const [pageVerified, setPageVerified] = useState(false)
  const [presetNames, setPresetNames] = useState<string[]>(() => Object.keys(getPresets()))

  // ── autosave (debounced) ──
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const t = setTimeout(() => {
      const snap: Snapshot = { form, budgetType, estrutura, utmPreset, paises }
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap))
      } catch {}
    }, 400)
    return () => clearTimeout(t)
  }, [form, budgetType, estrutura, utmPreset, paises])

  const setField = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const setUtmPreset = (p: string) => {
    setUtmPresetState(p)
    setField('utm_xcod', p === 'hotmart' ? UTM_XCOD : '')
  }

  // ── países ──
  const toggleCountry = (code: string) =>
    setPaises((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]))
  const toggleGroup = (codes: string[]) =>
    setPaises((p) => {
      const allOn = codes.every((c) => p.includes(c))
      return allOn ? p.filter((c) => !codes.includes(c)) : [...new Set([...p, ...codes])]
    })
  const toggleAllCountries = (allCodes: string[]) =>
    setPaises((p) => (allCodes.every((c) => p.includes(c)) ? [] : [...allCodes]))
  const clearCountries = () => setPaises([])

  // ── vídeos ──
  const toggleVideo = (id: string) =>
    setVideosSel((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const selectAllVideos = (ids: string[]) => setVideosSel(new Set(ids))
  const clearVideoSel = () => setVideosSel(new Set())

  // ── contas extras ──
  const addConta = () =>
    setContasExtras((c) => [
      ...c,
      { ad_account: '', page_id: '', token: '', copy: '', instagram_id: '' },
    ])
  const removeConta = (i: number) =>
    setContasExtras((c) => c.filter((_, idx) => idx !== i))
  const updateConta = (i: number, patch: Partial<ContaExtra>) =>
    setContasExtras((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  const saveContas = () => {
    try {
      localStorage.setItem(CONTAS_KEY, JSON.stringify(contasExtras))
    } catch {}
  }
  const loadContas = (): number => {
    try {
      const c = JSON.parse(localStorage.getItem(CONTAS_KEY) || '[]')
      setContasExtras(c)
      return c.length
    } catch {
      return 0
    }
  }

  // ── presets ──
  const applySnapshot = (snap: Snapshot) => {
    setForm((f) => ({ ...f, ...snap.form }))
    if (snap.budgetType) setBudgetType(snap.budgetType)
    if (snap.estrutura) setEstrutura(snap.estrutura)
    if (snap.utmPreset) setUtmPresetState(snap.utmPreset)
    if (snap.paises) setPaises(snap.paises)
  }
  const savePreset = (name: string) => {
    const presets = getPresets()
    presets[name] = { form, budgetType, estrutura, utmPreset, paises }
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets))
    setPresetNames(Object.keys(presets))
  }
  const loadPreset = (name: string) => {
    const p = getPresets()[name]
    if (p) applySnapshot(p)
  }
  const deletePreset = (name: string) => {
    const presets = getPresets()
    delete presets[name]
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets))
    setPresetNames(Object.keys(presets))
  }

  const value: Ctx = {
    form,
    setField,
    paises,
    toggleCountry,
    toggleGroup,
    toggleAllCountries,
    clearCountries,
    budgetType,
    setBudgetType,
    estrutura,
    setEstrutura,
    utmPreset,
    setUtmPreset,
    videos,
    setVideos,
    videosSel,
    toggleVideo,
    selectAllVideos,
    clearVideoSel,
    searchPlacementActive,
    setSearchPlacementActive,
    searchVideoSel,
    setSearchVideoSel,
    contasExtras,
    multiContaAtivo,
    setMultiContaAtivo,
    addConta,
    removeConta,
    updateConta,
    saveContas,
    loadContas,
    pageVerified,
    setPageVerified,
    presetNames,
    savePreset,
    loadPreset,
    deletePreset,
    getPaisNome: () => getPaisNomeFn(form, paises),
    buildNome: (video: string) => buildNomeFn(form, paises, budgetType, video),
    buildURL: () => buildURLFn(form),
  }

  return <UploaderCtx.Provider value={value}>{children}</UploaderCtx.Provider>
}

export function useUploader() {
  const c = useContext(UploaderCtx)
  if (!c) throw new Error('useUploader must be used within UploaderProvider')
  return c
}
