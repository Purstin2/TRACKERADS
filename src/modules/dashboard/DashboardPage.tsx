import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  RefreshCw,
  Info,
  SlidersHorizontal,
  Check,
  X,
  Plus,
  Save,
  RotateCcw,
  Pencil,
  Eye,
  Settings,
} from 'lucide-react'
import { SAMPLE, type DashboardData } from './data'
import { buildDashboardData } from './build'
import {
  WIDGET_MAP,
  WIDGETS,
  CATEGORIES,
  DEFAULT_LAYOUT,
  DEFAULT_ENABLED,
  type GridItem,
} from './widgets'
import { fetchFin, fetchFinHourly } from '@/lib/meta'
import { ACCOUNTS, DATE_OPTIONS, STATUS_FILTERS, DEFAULT_SETTINGS } from '@/modules/monitor/config'
import {
  finAggregate,
  finModel,
  loadFinParams,
  saveFinParams,
  FIN_DEFAULTS,
  type FinParams,
  type FinRow,
} from '@/modules/monitor/finance'

const ResponsiveGrid = WidthProvider(Responsive)
const LS_KEY = 'purstin_dashboard_layout_v1'

interface Persisted {
  enabled: string[]
  layout: GridItem[]
}
function loadPersisted(): Persisted {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (p && Array.isArray(p.enabled) && Array.isArray(p.layout)) return p
  } catch {}
  return { enabled: DEFAULT_ENABLED, layout: DEFAULT_LAYOUT }
}

function getFx(): number {
  try {
    const s = JSON.parse(localStorage.getItem('meta_settings') || '{}')
    return +s.fx || DEFAULT_SETTINGS.fx
  } catch {
    return DEFAULT_SETTINGS.fx
  }
}

/* ── Parâmetros financeiros ── */
function ParamsModal({
  fin,
  onSave,
  onClose,
}: {
  fin: FinParams
  onSave: (f: FinParams) => void
  onClose: () => void
}) {
  const [f, setF] = useState<FinParams>(fin)
  const set = (k: keyof FinParams, v: string) => setF((p) => ({ ...p, [k]: parseFloat(v) || 0 }))
  const Field = ({ k, label, step }: { k: keyof FinParams; label: string; step: string }) => (
    <div className="field">
      <label>{label}</label>
      <input type="number" step={step} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  )
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-[520px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-[13px] font-bold">⚙️ Parâmetros financeiros</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="card-body">
          <p className="mb-3 text-[12px] text-muted">
            Taxas modeladas até o módulo Pixel/Kirvano entrar com os dados reais do gateway.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field k="aprov" label="Aprovação (%)" step="1" />
            <Field k="gateway" label="Gateway (%)" step="0.1" />
            <Field k="imposto" label="Imposto (%)" step="0.1" />
            <Field k="reembolso" label="Reembolso (%)" step="0.1" />
            <Field k="chargeback" label="Chargeback (%)" step="0.1" />
            <Field k="custoUn" label="Custo por venda (R$)" step="0.01" />
            <Field k="despesas" label="Despesas (período, R$)" step="0.01" />
          </div>
          <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-muted2">
            Split de pagamento (%)
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field k="pix" label="Pix" step="1" />
            <Field k="cartao" label="Cartão" step="1" />
            <Field k="boleto" label="Boleto" step="1" />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className="btn btn-ghost btn-sm mr-auto" onClick={() => setF({ ...FIN_DEFAULTS })}>
              ↺ Padrão
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => onSave(f)}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Frame({
  title,
  editing,
  onRemove,
  children,
}: {
  title: string
  editing: boolean
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl2 border border-border bg-surface shadow-card-sm">
      <div className="wdg-head flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted2">
          {title} <Info className="h-3 w-3 opacity-40" />
        </span>
        {editing && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            className="rounded p-0.5 text-muted2 hover:bg-danger/15 hover:text-danger"
            title="Remover do dashboard"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4">{children}</div>
    </div>
  )
}

export default function DashboardPage() {
  // layout
  const init = useRef(loadPersisted()).current
  const [enabled, setEnabled] = useState<string[]>(init.enabled)
  const [layout, setLayout] = useState<GridItem[]>(init.layout)
  const [editing, setEditing] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const savedSnap = useRef<Persisted>(init)

  // finance
  const [token, setToken] = useState(() => localStorage.getItem('meta_tok') || '')
  const [showTok, setShowTok] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set(ACCOUNTS.map((a) => a.id)))
  const [period, setPeriod] = useState('last_7d')
  const [fin, setFin] = useState<FinParams>(loadFinParams)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string>('')

  const d = data || SAMPLE

  const toggleAcc = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  async function load() {
    if (!token.trim()) {
      alert('Cole o access token primeiro.')
      return
    }
    localStorage.setItem('meta_tok', token.trim())
    const accs = ACCOUNTS.filter((a) => sel.has(a.id))
    if (!accs.length) return
    setLoading(true)
    const fx = getFx()
    const statuses = STATUS_FILTERS.active_paused.values
    const rows: FinRow[] = []
    const hourly: FinRow[] = []
    for (const acc of accs) {
      const toBRL = acc.cur === 'BRL' ? 1 : fx
      try {
        const r = (await fetchFin(acc.id, period, token.trim(), statuses)) as FinRow[]
        r.forEach((x) => (x._fx = toBRL))
        rows.push(...r)
        try {
          const h = (await fetchFinHourly(acc.id, period, token.trim(), statuses)) as FinRow[]
          h.forEach((x) => (x._fx = toBRL))
          hourly.push(...h)
        } catch {}
      } catch {
        /* conta sem acesso/erro — ignora no consolidado */
      }
    }
    const model = finModel(finAggregate(rows), fin)
    setData(buildDashboardData(model, fin, hourly))
    setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }

  // recomputa quando params mudam (se já tem dados carregados, refaz com novos params seria refetch;
  // aqui só re-modela seria ideal, mas mantemos simples: params novos exigem Atualizar)

  const visibleLayout = useMemo(
    () => layout.filter((l) => enabled.includes(l.i) && WIDGET_MAP[l.i]),
    [layout, enabled],
  )

  function startEdit() {
    savedSnap.current = { enabled: [...enabled], layout: layout.map((l) => ({ ...l })) }
    setEditing(true)
    setDrawerOpen(true)
  }
  function cancelEdit() {
    setEnabled(savedSnap.current.enabled)
    setLayout(savedSnap.current.layout)
    setEditing(false)
    setDrawerOpen(false)
  }
  function saveEdit() {
    localStorage.setItem(LS_KEY, JSON.stringify({ enabled, layout }))
    setEditing(false)
    setDrawerOpen(false)
  }
  function resetDefaults() {
    setEnabled(DEFAULT_ENABLED)
    setLayout(DEFAULT_LAYOUT)
  }
  function addWidget(id: string) {
    if (enabled.includes(id)) return
    const def = WIDGET_MAP[id]
    const maxY = layout.reduce((mx, l) => Math.max(mx, l.y + l.h), 0)
    setEnabled((e) => [...e, id])
    setLayout((l) => [...l.filter((x) => x.i !== id), { i: id, x: 0, y: maxY, w: def.w, h: def.h }])
  }
  function removeWidget(id: string) {
    setEnabled((e) => e.filter((x) => x !== id))
  }

  return (
    <div className={`relative flex flex-col gap-5 ${editing ? 'dash-editing' : ''}`}>
      {editing && (
        <div className="sticky top-[57px] z-20 -mx-4 mb-1 flex flex-wrap items-center gap-3 border-b border-border bg-brand/10 px-4 py-2.5 backdrop-blur lg:-mx-7 lg:px-7">
          <Pencil className="h-3.5 w-3.5 text-brand-2" />
          <span className="text-[13px] font-semibold">Editando o dashboard</span>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={resetDefaults}>
              <RotateCcw className="h-3 w-3" /> Redefinir
            </button>
            <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>
              Cancelar
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit}>
              <Save className="h-3 w-3" /> Salvar
            </button>
          </div>
        </div>
      )}

      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Dashboard — Principal</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            P&amp;L consolidado · Meta (gasto/vendas) + modelo de taxas
            {updatedAt && ` · atualizado ${updatedAt}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {d.isSample && (
            <span className="hidden rounded-full bg-warn/10 px-3 py-1 text-[11px] font-bold text-warn sm:inline">
              dados de exemplo — clique Atualizar
            </span>
          )}
          {!editing && (
            <button className="btn btn-ghost btn-sm" onClick={startEdit}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Editar visualização
            </button>
          )}
        </div>
      </div>

      {/* controles financeiros */}
      <div className="flex flex-col gap-3 rounded-xl2 border border-border bg-surface p-4 shadow-card-sm">
        <div className="flex items-center gap-2">
          <input
            type={showTok ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access Token do Meta"
            className="flex-1 rounded-[9px] border border-border bg-[#0a0c19] px-3 py-2 text-[13px] text-ink"
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTok((s) => !s)}>
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Contas</span>
          {ACCOUNTS.map((a) => {
            const on = sel.has(a.id)
            return (
              <button
                key={a.id}
                onClick={() => toggleAcc(a.id)}
                className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-all ${
                  on ? 'border-transparent bg-brand text-white' : 'border-border bg-surface2 text-muted2 hover:border-brand'
                }`}
              >
                {a.name}
              </button>
            )
          })}
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-muted2">Período</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
          >
            {DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowParams(true)}>
            <Settings className="h-3.5 w-3.5" /> Parâmetros
          </button>
          <button className="btn btn-primary btn-sm ml-auto" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Calculando...' : 'Atualizar'}
          </button>
        </div>
        <p className="text-[11px] text-muted2">
          Valores em <b className="text-muted">R$</b> — gasto em USD convertido pelo câmbio dos
          parâmetros de análise. Aprovação/taxas modeladas até o Kirvano entrar.
        </p>
      </div>

      {/* grid */}
      <ResponsiveGrid
        className="-m-2"
        layouts={{ lg: visibleLayout, md: visibleLayout }}
        breakpoints={{ lg: 996, md: 768, sm: 480, xs: 0 }}
        cols={{ lg: 12, md: 12, sm: 1, xs: 1 }}
        rowHeight={58}
        margin={[14, 14]}
        isDraggable={editing}
        isResizable={editing}
        draggableHandle=".wdg-head"
        compactType="vertical"
        onLayoutChange={(cur: Layout[]) => {
          if (editing) setLayout(cur.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))
        }}
      >
        {visibleLayout.map((item) => {
          const def = WIDGET_MAP[item.i]
          return (
            <div key={item.i} data-grid={item}>
              <Frame title={def.title} editing={editing} onRemove={() => removeWidget(item.i)}>
                {def.render(d)}
              </Frame>
            </div>
          )
        })}
      </ResponsiveGrid>

      {/* drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-[330px] flex-col border-l border-border bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-[14px] font-bold">Métricas Disponíveis</h3>
              <button className="rounded p-1 text-muted2 hover:text-ink" onClick={() => setDrawerOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
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
                          <button
                            key={w.id}
                            onClick={() => (on ? removeWidget(w.id) : addWidget(w.id))}
                            className={`flex items-center justify-between rounded-[9px] border px-3 py-2.5 text-left text-[12.5px] font-medium transition-all ${
                              on
                                ? 'border-brand bg-brand/[0.08] text-ink'
                                : 'border-dashed border-border bg-surface2 text-muted2 hover:border-brand hover:text-ink'
                            }`}
                          >
                            {w.title}
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                                on ? 'bg-brand text-white' : 'bg-surface text-muted2'
                              }`}
                            >
                              {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-border p-3 text-[11px] text-muted2">
              Arraste pelo título · redimensione pelo canto inferior direito.
            </div>
          </aside>
        </>
      )}

      {showParams && (
        <ParamsModal
          fin={fin}
          onClose={() => setShowParams(false)}
          onSave={(f) => {
            setFin(f)
            saveFinParams(f)
            setShowParams(false)
          }}
        />
      )}
    </div>
  )
}
