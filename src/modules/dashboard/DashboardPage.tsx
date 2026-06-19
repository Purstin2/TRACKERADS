import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  RefreshCw, Info, SlidersHorizontal, Check, X, Plus, Save, RotateCcw, Pencil, Eye, Settings,
  ChevronDown, Search, ListFilter,
} from 'lucide-react'
import { type DashboardData } from './data'
import { buildRealDashboard, distinctProducts, distinctSources, normSource, type FunnelMeta } from './realbuild'
import { WIDGET_MAP, WIDGETS, CATEGORIES, DEFAULT_LAYOUT, DEFAULT_ENABLED, type GridItem } from './widgets'
import { fetchFin, fetchFunil, fetchFinHourly, getRevenue, getSales, findVal } from '@/lib/meta'
import { fetchOrders, type KirvanoOrder } from '@/modules/pixel/orders'
import { ACCOUNTS, STATUS_FILTERS, DEFAULT_SETTINGS, trunc } from '@/modules/monitor/config'
import { loadFinParams, saveFinParams, syncFinParams, FIN_DEFAULTS, type FinParams } from '@/modules/monitor/finance'
import { cacheGet, cacheSet, remoteSet, loadState } from '@/lib/appState'

const ResponsiveGrid = WidthProvider(Responsive)
const LS_KEY = 'purstin_dashboard_layout_v2'

const PERIODS = [
  { value: 'maximum', label: 'Máximo' },
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'this_month', label: 'Esse mês' },
  { value: 'last_month', label: 'Mês passado' },
]
const PLATFORMS = ['Qualquer', 'Kirvano', 'Hotmart', 'Greenn', 'Kiwify']

// métricas de funil do Meta (topo do funil — base vem do gateway)
const LPV = ['landing_page_view', 'omni_landing_page_view']
const IC = ['initiate_checkout', 'omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']

interface CampMetric { key: string; accId: string; accName: string; name: string; spend: number; rev: number; sales: number }
interface Persisted { enabled: string[]; layout: GridItem[] }

function isValidPersisted(p: unknown): p is Persisted {
  return !!p && Array.isArray((p as Persisted).enabled) && Array.isArray((p as Persisted).layout)
}
function loadPersisted(): Persisted {
  const p = cacheGet<Persisted | null>(LS_KEY, null)
  return isValidPersisted(p) ? p : { enabled: DEFAULT_ENABLED, layout: DEFAULT_LAYOUT }
}
function getFx(): number {
  try { return +JSON.parse(localStorage.getItem('meta_settings') || '{}').fx || DEFAULT_SETTINGS.fx } catch { return DEFAULT_SETTINGS.fx }
}

/** janela de datas (ISO) no FUSO BR (UTC-3, sem horário de verão desde 2019).
 *  Sempre usa o dia comercial brasileiro — NÃO depende do relógio/fuso do PC,
 *  que pode estar errado (ex: Windows em UTC). Assim "hoje/ontem" batem com a Kirvano/UTMify. */
const BR_OFFSET_MS = 3 * 3600000 // BRT = UTC-3
function periodWindow(period: string): { sinceISO: string; untilISO: string } {
  // parede BRT: um Date cujos campos UTC representam o horário do Brasil
  const brt = new Date(Date.now() - BR_OFFSET_MS)
  const start = new Date(brt); start.setUTCHours(0, 0, 0, 0)
  const end = new Date(brt); end.setUTCHours(23, 59, 59, 999)
  if (period === 'yesterday') { start.setUTCDate(start.getUTCDate() - 1); end.setUTCDate(end.getUTCDate() - 1) }
  else if (period === 'last_7d') start.setUTCDate(start.getUTCDate() - 6)
  else if (period === 'this_month') start.setUTCDate(1)
  else if (period === 'last_month') { start.setUTCMonth(start.getUTCMonth() - 1, 1); end.setUTCMonth(end.getUTCMonth(), 0) }
  else if (period === 'maximum') start.setUTCFullYear(2020, 0, 1)
  // converte parede BRT de volta pra instante UTC real
  const toUtcISO = (w: Date) => new Date(w.getTime() + BR_OFFSET_MS).toISOString()
  return { sinceISO: toUtcISO(start), untilISO: toUtcISO(end) }
}

/* ── dropdown multi-seleção (Conta / Fonte / Produto) ── */
function MultiDropdown({
  label, options, selected, onChange, groupLabel, width = 'w-[230px]',
}: { label: string; options: string[]; selected: Set<string> | null; onChange: (s: Set<string> | null) => void; groupLabel?: string; width?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const isOn = (o: string) => selected === null || selected.has(o)
  const onCount = selected === null ? options.length : options.filter((o) => selected.has(o)).length
  const toggle = (o: string) => {
    const base = selected === null ? new Set(options) : new Set(selected)
    base.has(o) ? base.delete(o) : base.add(o)
    onChange(base.size === options.length ? null : base)
  }
  const vis = options.filter((o) => !q || o.toLowerCase().includes(q.toLowerCase()))
  const summary = selected === null ? 'Todos' : onCount === 0 ? 'Nenhum' : onCount === 1 ? trunc(options.find((o) => selected.has(o)) || '', 16) : `${onCount} selec.`
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">{label}</span>
      <div className="relative">
        <button onClick={() => setOpen((v) => !v)} className={`flex items-center justify-between gap-2 rounded-[8px] border border-border bg-[#0a0c19] px-3 py-2 text-[12px] text-ink hover:border-brand ${width}`}>
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted2" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute z-50 mt-1 w-[280px] rounded-xl2 border border-border bg-surface p-2 shadow-card">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar" className="w-full rounded-[7px] border border-border bg-[#0a0c19] py-1.5 pl-8 pr-3 text-[12px] text-ink" />
              </div>
              <button onClick={() => onChange(null)} className="mb-1 flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] hover:bg-surface2">
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[9px] ${selected === null ? 'border-brand bg-brand text-white' : 'border-border'}`}>{selected === null ? '✓' : ''}</span>
                Selecionar todos
              </button>
              {groupLabel && <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted2">{groupLabel}</div>}
              <div className="max-h-[260px] overflow-y-auto">
                {vis.map((o) => (
                  <button key={o} onClick={() => toggle(o)} className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] ${isOn(o) ? 'bg-brand/10' : 'hover:bg-surface2'}`}>
                    <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[9px] ${isOn(o) ? 'border-brand bg-brand text-white' : 'border-border'}`}>{isOn(o) ? '✓' : ''}</span>
                    <span className="flex-1 truncate" title={o}>{o}</span>
                  </button>
                ))}
                {!vis.length && <div className="p-2 text-center text-[11px] text-muted2">nada encontrado</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Parâmetros financeiros ── */
function ParamsModal({ fin, onSave, onClose }: { fin: FinParams; onSave: (f: FinParams) => void; onClose: () => void }) {
  const [f, setF] = useState<FinParams>(fin)
  const set = (k: keyof FinParams, v: string) => setF((p) => ({ ...p, [k]: parseFloat(v) || 0 }))
  const Field = ({ k, label, step }: { k: keyof FinParams; label: string; step: string }) => (
    <div className="field"><label>{label}</label><input type="number" step={step} value={f[k]} onChange={(e) => set(k, e.target.value)} /></div>
  )
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-[480px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header"><h3 className="text-[13px] font-bold">⚙️ Parâmetros financeiros</h3><button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button></div>
        <div className="card-body">
          <p className="mb-3 text-[12px] text-muted">Faturamento/vendas/aprovação vêm <b>reais</b> do gateway. Aqui só o que o webhook não manda: taxa de gateway, imposto e custos.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field k="gateway" label="Gateway (%)" step="0.1" /><Field k="imposto" label="Imposto (%)" step="0.1" />
            <Field k="custoUn" label="Custo por venda (R$)" step="0.01" /><Field k="despesas" label="Despesas (período, R$)" step="0.01" />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className="btn btn-ghost btn-sm mr-auto" onClick={() => setF({ ...FIN_DEFAULTS })}>↺ Padrão</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={() => onSave(f)}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Frame({ title, editing, onRemove, children }: { title: string; editing: boolean; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl2 border border-border bg-surface shadow-card-sm">
      <div className="wdg-head flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted2">{title} <Info className="h-3 w-3 opacity-40" /></span>
        {editing && <button onMouseDown={(e) => e.stopPropagation()} onClick={onRemove} className="rounded p-0.5 text-muted2 hover:bg-danger/15 hover:text-danger"><X className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4">{children}</div>
    </div>
  )
}

/* ── Drawer lateral: refino por campanha (status + on/off) ── */
function CampDrawer({ camps, sel, onSel, status, onStatus, onClose, onReload, loading }: {
  camps: CampMetric[]; sel: Set<string>; onSel: (s: Set<string>) => void; status: string; onStatus: (s: string) => void; onClose: () => void; onReload: () => void; loading: boolean
}) {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const byAcc: Record<string, CampMetric[]> = {}
  camps.forEach((c) => (byAcc[c.accName] = byAcc[c.accName] || []).push(c))
  const toggle = (k: string) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); onSel(n) }
  const visible = camps.filter((c) => !ql || c.name.toLowerCase().includes(ql))
  const allOn = visible.length > 0 && visible.every((c) => sel.has(c.key))
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed left-0 top-0 z-50 flex h-full w-[360px] flex-col border-r border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-[14px] font-bold"><ListFilter className="h-4 w-4 text-brand-2" /> Campanhas (gasto)</h3>
          <button className="rounded p-1 text-muted2 hover:text-ink" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Status</span>
            <select value={status} onChange={(e) => onStatus(e.target.value)} className="flex-1 rounded-[7px] border border-border bg-[#0a0c19] px-2 py-1.5 text-[12px] text-ink">
              {Object.entries(STATUS_FILTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanha..." className="w-full rounded-[7px] border border-border bg-[#0a0c19] py-1.5 pl-8 pr-3 text-[12px] text-ink" />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted2">
            <button className="font-semibold text-brand-2 hover:underline" onClick={() => { const n = new Set(sel); if (allOn) visible.forEach((c) => n.delete(c.key)); else visible.forEach((c) => n.add(c.key)); onSel(n) }}>{allOn ? 'Desmarcar visíveis' : 'Marcar visíveis'}</button>
            <span>{sel.size}/{camps.length}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {camps.length === 0 && <div className="p-4 text-center text-[12px] text-muted2">{loading ? 'Carregando...' : 'Clique Atualizar.'}</div>}
          {Object.entries(byAcc).map(([acc, list]) => {
            const vis = list.filter((c) => !ql || c.name.toLowerCase().includes(ql))
            if (!vis.length) return null
            return (
              <div key={acc} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted2">{acc}</div>
                {vis.sort((a, b) => b.spend - a.spend).map((c) => {
                  const on = sel.has(c.key)
                  return (
                    <button key={c.key} onClick={() => toggle(c.key)} className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] ${on ? 'bg-brand/10' : 'hover:bg-surface2'}`}>
                      <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[9px] ${on ? 'border-brand bg-brand text-white' : 'border-border'}`}>{on ? '✓' : ''}</span>
                      <span className="flex-1 truncate" title={c.name}>{trunc(c.name, 40)}</span>
                      <span className="whitespace-nowrap text-[10px] text-muted2">R${c.spend.toFixed(0)}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}

export default function DashboardPage() {
  const init = useRef(loadPersisted()).current
  const [enabled, setEnabled] = useState<string[]>(init.enabled)
  const [layout, setLayout] = useState<GridItem[]>(init.layout)
  const [editing, setEditing] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const savedSnap = useRef<Persisted>(init)

  const [token, setToken] = useState(() => localStorage.getItem('meta_tok') || '')
  const [showTok, setShowTok] = useState(false)
  const [accSel, setAccSel] = useState<Set<string> | null>(null) // contas (null = todas)
  const [period, setPeriod] = useState('yesterday')
  const [campStatus, setCampStatus] = useState('active_paused')
  const [platform, setPlatform] = useState('Qualquer')
  const [fin, setFin] = useState<FinParams>(loadFinParams)
  const [loading, setLoading] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')

  const [camps, setCamps] = useState<CampMetric[]>([])
  const [selCamps, setSelCamps] = useState<Set<string>>(new Set())
  const [funnelByCamp, setFunnelByCamp] = useState<Record<string, FunnelMeta>>({})
  const [hourlyByName, setHourlyByName] = useState<Record<string, number[]>>({})
  const [orders, setOrders] = useState<KirvanoOrder[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [selProducts, setSelProducts] = useState<Set<string> | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [selSources, setSelSources] = useState<Set<string> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [campDrawer, setCampDrawer] = useState(false)

  const accIds = useMemo(() => ACCOUNTS.filter((a) => accSel === null || accSel.has(a.name)).map((a) => a.id), [accSel])

  async function load(silent = false) {
    if (!token.trim()) { if (!silent) alert('Cole o access token do Meta primeiro.'); return }
    localStorage.setItem('meta_tok', token.trim())
    const accs = ACCOUNTS.filter((a) => accIds.includes(a.id))
    if (!accs.length) { if (!silent) alert('Selecione ao menos uma conta.'); return }
    setLoading(true)
    const fx = getFx()
    const statuses = STATUS_FILTERS[campStatus]?.values || ['ACTIVE']
    const preset = period === 'maximum' ? 'maximum' : period

    const cs: CampMetric[] = []
    const fByCamp: Record<string, FunnelMeta> = {}
    const hByName: Record<string, number[]> = {}
    const tok = token.trim()
    // PARALELO: todas as contas de uma vez, e as 3 chamadas de cada conta juntas
    // (antes era tudo em fila → ~18 chamadas sequenciais com 6 contas)
    await Promise.all(
      accs.map(async (acc) => {
        const toBRL = acc.cur === 'BRL' ? 1 : fx
        const [rows, fn, hr] = await Promise.all([
          fetchFin(acc.id, preset, tok, statuses).catch(() => [] as any[]),
          fetchFunil(acc.id, preset, tok, statuses).catch(() => [] as any[]),
          fetchFinHourly(acc.id, preset, tok, statuses).catch(() => [] as any[]),
        ])
        ;(rows as any[]).forEach((r) => {
          if (!r.campaign_id) return
          cs.push({ key: `${acc.id}::${r.campaign_id}`, accId: acc.id, accName: acc.name, name: r.campaign_name || '(sem nome)', spend: parseFloat(r.spend || '0') * toBRL, rev: getRevenue(r) * toBRL, sales: getSales(r) })
        })
        ;(fn as any[]).forEach((r) => {
          if (!r.campaign_id) return
          fByCamp[`${acc.id}::${r.campaign_id}`] = {
            clicks: parseFloat(r.inline_link_clicks || '0'),
            lpv: findVal(r.actions, LPV) || 0,
            ic: findVal(r.actions, IC) || 0,
          }
        })
        ;(hr as any[]).forEach((r) => {
          const hk = (r.hourly_stats_aggregated_by_advertiser_time_zone as string) || ''
          const hh = parseInt(hk.slice(0, 2))
          if (isNaN(hh) || hh < 0 || hh > 23) return
          const nameKey = `${acc.id}::${r.campaign_name || ''}`
          if (!hByName[nameKey]) hByName[nameKey] = Array.from({ length: 24 }, () => 0)
          hByName[nameKey][hh] += parseFloat(r.spend || '0') * toBRL
        })
      }),
    )
    setCamps(cs)
    setSelCamps(new Set(cs.map((c) => c.key)))
    setFunnelByCamp(fByCamp)
    setHourlyByName(hByName)

    try {
      const { sinceISO, untilISO } = periodWindow(period)
      const all = await fetchOrders(sinceISO)
      const since = Date.parse(sinceISO), until = Date.parse(untilISO)
      const within = all.filter((o) => {
        const t = Date.parse(o.ordered_at || o.created_at || '')
        return !isNaN(t) && t >= since && t <= until
      })
      setOrders(within)
      setProducts(distinctProducts(within))
      setSelProducts(null)
      setSources(distinctSources(within))
      setSelSources(null)
    } catch { setOrders([]); setProducts([]); setSources([]) }

    setLoaded(true)
    setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }

  // auto-carrega da API do Meta ao abrir (token permanente salvo) — sem mockup
  // e sincroniza os parâmetros financeiros do Supabase (não se perdem ao limpar cookies)
  useEffect(() => {
    if (token.trim()) load(true)
    syncFinParams().then(setFin)
    // layout/visualização do Supabase (não se perde ao limpar cookies)
    loadState<Persisted | null>(LS_KEY, null).then((p) => {
      if (isValidPersisted(p)) { setEnabled(p.enabled); setLayout(p.layout); savedSnap.current = p }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // agregações dependentes da seleção (sem refetch)
  const selectedCamps = useMemo(() => camps.filter((c) => selCamps.has(c.key)), [camps, selCamps])
  const spend = useMemo(() => selectedCamps.reduce((s, c) => s + c.spend, 0), [selectedCamps])
  const funnelMeta = useMemo<FunnelMeta>(() => {
    const acc = { clicks: 0, lpv: 0, ic: 0 }
    selectedCamps.forEach((c) => {
      const f = funnelByCamp[c.key]
      if (f) { acc.clicks += f.clicks; acc.lpv += f.lpv; acc.ic += f.ic }
    })
    return acc
  }, [selectedCamps, funnelByCamp])
  const hourlySpend = useMemo(() => {
    const arr = Array.from({ length: 24 }, () => 0)
    selectedCamps.forEach((c) => { const h = hourlyByName[`${c.accId}::${c.name}`]; if (h) for (let i = 0; i < 24; i++) arr[i] += h[i] })
    return arr
  }, [selectedCamps, hourlyByName])

  // dados sempre reais (da API). Antes de carregar, tudo zero — sem mockup.
  const data: DashboardData = useMemo(
    () => buildRealDashboard({ orders, products: selProducts, source: selSources, spend, hourlySpend, funnelMeta, fin }),
    [orders, selProducts, selSources, spend, hourlySpend, funnelMeta, fin],
  )

  const d = data
  const visibleLayout = useMemo(() => layout.filter((l) => enabled.includes(l.i) && WIDGET_MAP[l.i]), [layout, enabled])

  function startEdit() { savedSnap.current = { enabled: [...enabled], layout: layout.map((l) => ({ ...l })) }; setEditing(true); setDrawerOpen(true) }
  function cancelEdit() { setEnabled(savedSnap.current.enabled); setLayout(savedSnap.current.layout); setEditing(false); setDrawerOpen(false) }
  function saveEdit() { const v = { enabled, layout }; cacheSet(LS_KEY, v); remoteSet(LS_KEY, v); setEditing(false); setDrawerOpen(false) }
  function resetDefaults() { setEnabled(DEFAULT_ENABLED); setLayout(DEFAULT_LAYOUT) }
  function addWidget(id: string) {
    if (enabled.includes(id)) return
    const def = WIDGET_MAP[id]; const maxY = layout.reduce((mx, l) => Math.max(mx, l.y + l.h), 0)
    setEnabled((e) => [...e, id]); setLayout((l) => [...l.filter((x) => x.i !== id), { i: id, x: 0, y: maxY, w: def.w, h: def.h }])
  }
  function removeWidget(id: string) { setEnabled((e) => e.filter((x) => x !== id)) }

  return (
    <div className={`relative flex flex-col gap-5 ${editing ? 'dash-editing' : ''}`}>
      {editing && (
        <div className="sticky top-[57px] z-20 -mx-4 mb-1 flex flex-wrap items-center gap-3 border-b border-border bg-brand/10 px-4 py-2.5 backdrop-blur lg:-mx-7 lg:px-7">
          <Pencil className="h-3.5 w-3.5 text-brand-2" /><span className="text-[13px] font-semibold">Editando o dashboard</span>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={resetDefaults}><RotateCcw className="h-3 w-3" /> Redefinir</button>
            <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit}><Save className="h-3 w-3" /> Salvar</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Dashboard — Principal</h2>
          <p className="mt-0.5 text-[13px] text-muted">P&amp;L real · gateway (faturamento) + Meta (gasto){updatedAt && ` · atualizado ${updatedAt}`}</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="hidden rounded-full bg-brand/10 px-3 py-1 text-[11px] font-bold text-brand-2 sm:inline">carregando da API…</span>}
          {!editing && <button className="btn btn-ghost btn-sm" onClick={startEdit}><SlidersHorizontal className="h-3.5 w-3.5" /> Editar visualização</button>}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl2 border border-border bg-surface p-4 shadow-card-sm">
        <div className="flex items-center gap-2">
          <input type={showTok ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Access Token do Meta" className="flex-1 rounded-[9px] border border-border bg-[#0a0c19] px-3 py-2 text-[13px] text-ink" />
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTok((s) => !s)}><Eye className="h-3.5 w-3.5" /></button>
        </div>

        {/* 5 filtros: Período / Conta de Anúncio / Fonte de Tráfego / Plataforma / Produto */}
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Período</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[150px] rounded-[8px] border border-border bg-[#0a0c19] px-3 py-2 text-[12px] text-ink">
              {PERIODS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <MultiDropdown label="Conta de Anúncio" options={ACCOUNTS.map((a) => a.name)} selected={accSel} onChange={setAccSel} groupLabel="Meta" width="w-[180px]" />
          <MultiDropdown label="Fonte de Tráfego" options={sources} selected={selSources} onChange={setSelSources} width="w-[160px]" />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Plataforma</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-[140px] rounded-[8px] border border-border bg-[#0a0c19] px-3 py-2 text-[12px] text-ink" title="Gateway (hoje só Kirvano tem dados)">
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <MultiDropdown label="Produto" options={products} selected={selProducts} onChange={setSelProducts} width="w-[200px]" />
          <div className="ml-auto flex items-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setCampDrawer(true)} title="Refino por campanha (status, on/off)"><ListFilter className="h-3.5 w-3.5" /> Campanhas {camps.length ? `${selCamps.size}/${camps.length}` : ''}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowParams(true)}><Settings className="h-3.5 w-3.5" /> Parâmetros</button>
            <button className="btn btn-primary btn-sm" onClick={() => load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Carregando...' : 'Atualizar'}</button>
          </div>
        </div>
        <p className="text-[11px] text-muted2">Valores em <b className="text-muted">R$</b> · gasto USD→BRL (R$ {getFx().toFixed(2)}). Faturamento/vendas/aprovação reais do gateway; gateway-fee e imposto são % nos Parâmetros.</p>
      </div>

      <ResponsiveGrid className="-m-2" layouts={{ lg: visibleLayout, md: visibleLayout }} breakpoints={{ lg: 996, md: 768, sm: 480, xs: 0 }} cols={{ lg: 12, md: 12, sm: 1, xs: 1 }} rowHeight={58} margin={[14, 14]} isDraggable={editing} isResizable={editing} draggableHandle=".wdg-head" compactType="vertical" onLayoutChange={(cur: Layout[]) => { if (editing) setLayout(cur.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }))) }}>
        {visibleLayout.map((item) => {
          const def = WIDGET_MAP[item.i]
          return <div key={item.i} data-grid={item}><Frame title={def.title} editing={editing} onRemove={() => removeWidget(item.i)}>{def.render(d)}</Frame></div>
        })}
      </ResponsiveGrid>

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-[330px] flex-col border-l border-border bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><h3 className="text-[14px] font-bold">Métricas Disponíveis</h3><button className="rounded p-1 text-muted2 hover:text-ink" onClick={() => setDrawerOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {CATEGORIES.map((cat) => {
                const items = WIDGETS.filter((w) => w.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat} className="mb-5">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted2">{cat}</div>
                    <div className="flex flex-col gap-1.5">
                      {items.map((w) => {
                        const on = enabled.includes(w.id)
                        return (
                          <button key={w.id} onClick={() => (on ? removeWidget(w.id) : addWidget(w.id))} className={`flex items-center justify-between rounded-[9px] border px-3 py-2.5 text-left text-[12.5px] font-medium transition-all ${on ? 'border-brand bg-brand/[0.08] text-ink' : 'border-dashed border-border bg-surface2 text-muted2 hover:border-brand hover:text-ink'}`}>
                            {w.title}<span className={`flex h-5 w-5 items-center justify-center rounded-full ${on ? 'bg-brand text-white' : 'bg-surface text-muted2'}`}>{on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>
        </>
      )}

      {campDrawer && <CampDrawer camps={camps} sel={selCamps} onSel={setSelCamps} status={campStatus} onStatus={setCampStatus} onClose={() => setCampDrawer(false)} onReload={() => load()} loading={loading} />}
      {showParams && <ParamsModal fin={fin} onClose={() => setShowParams(false)} onSave={(f) => { setFin(f); saveFinParams(f); setShowParams(false) }} />}
    </div>
  )
}
