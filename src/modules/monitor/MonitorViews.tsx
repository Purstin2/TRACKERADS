import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts'
import { ExternalLink, ChevronDown, ChevronUp, Search, X, TrendingUp } from 'lucide-react'
import {
  fetchAds,
  fetchCampDaily,
  getRoas,
  getCpa,
  getSales,
  getRevenue,
  getFreq,
  getCpm,
  getImpr,
  getCtr,
  getCpc,
  getCpaIC,
  getBudget,
  setBudget,
  campUrl,
  type InsightRow,
  type AdLevel,
} from '@/lib/meta'
import { loadFinParams, type FinParams } from './finance'
import { useMonitor } from './MonitorContext'
import { BarChart3 } from 'lucide-react'
import type { CacheItem, CampMap, CampMeta } from './MonitorContext'
import { openLog, lastScale, useLog, addAction, todayBR, increasesForDay } from './actionLog'
import { ImpactBtn } from './BudgetImpact'
import { toast } from '@/components/ui/toast'
import {
  ICONS,
  ORDER,
  PALETTE,
  BADGE_CLS,
  ROW_BG,
  VAL_CLS,
  classify,
  roasCls,
  analyzeAction,
  analyzeAggregate,
  curSym,
  trunc,
  accCur,
  type ActionResult,
  type Settings,
} from './config'
import { fmtDate } from '@/lib/meta'

export type Counts = Record<string, number>
const EMPTY_COUNTS: Counts = { escalar: 0, matar: 0, atencao: 0, perto: 0, monitorar: 0 }

export function Badge({ a }: { a: ActionResult }) {
  if (a.code === 'ok' && !a.label.trim()) return null
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold ${BADGE_CLS[a.code] || BADGE_CLS.ok}`}
      title={a.detail}
    >
      {a.label}
    </span>
  )
}

/** Badge de histórico: mostra "↑ Xd" se a campanha já teve escala/orçamento registrado. */
export function ScaleBadge({ campId }: { campId?: string }) {
  useLog()
  const last = lastScale(campId)
  if (!last) return null
  const days = Math.floor((Date.now() - new Date(last.ts).getTime()) / 86400000)
  const det =
    last.detail ||
    (last.budgetBefore != null && last.budgetAfter != null
      ? `${last.budgetBefore} → ${last.budgetAfter}`
      : 'registro de escala')
  return (
    <span className="rounded-full bg-ok/10 px-1.5 py-0.5 text-[9px] font-bold text-ok" title={`${det} · ${new Date(last.ts).toLocaleString('pt-BR')}`}>
      ↑ {days === 0 ? 'hoje' : days + 'd'}
    </span>
  )
}

/** Botão pequeno para registrar uma ação na campanha. */
export function LogBtn({ accId, name, campId, roas, cur, spend, sales }: { accId: string; name: string; campId: string; roas: number | null; cur: string; spend?: number; sales?: number }) {
  return (
    <button
      onClick={() =>
        openLog({ accId, name, campId, kind: 'escala', roasAtTime: roas, cur, spendAtTime: spend ?? null, salesAtTime: sales ?? null, dateBR: todayBR() })
      }
      title="Registrar o que fiz nesta campanha"
      className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted hover:border-brand hover:text-brand-2"
    >
      ✎ log
    </button>
  )
}

/** Botão de aumentar orçamento direto na linha (abre modal). Respeita Execução ON/OFF. */
export function BudgetBtn({ accId, name, campId, roas, cur, spend, sales }: { accId: string; name: string; campId: string; roas: number | null; cur: string; spend?: number; sales?: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Aumentar orçamento"
        className="inline-flex items-center gap-0.5 rounded border border-ok/40 bg-ok/5 px-1.5 py-0.5 text-[10px] font-bold text-ok hover:bg-ok/15"
      >
        <TrendingUp className="h-3 w-3" /> $
      </button>
      {open && <BudgetModal accId={accId} name={name} campId={campId} roas={roas} cur={cur} spend={spend} sales={sales} onClose={() => setOpen(false)} />}
    </>
  )
}

const QUICK = [10, 20, 30, 50]

function BudgetModal({ accId, name, campId, roas, cur, spend, sales, onClose }: { accId: string; name: string; campId: string; roas: number | null; cur: string; spend?: number; sales?: number; onClose: () => void }) {
  const m = useMonitor()
  const sym = curSym(cur)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [info, setInfo] = useState<{ level: 'campaign' | 'adset'; items: { id: string; daily: number; name: string }[]; total: number } | null>(null)
  const [err, setErr] = useState('')
  const [pct, setPct] = useState(20)
  const [absVal, setAbsVal] = useState('') // valor absoluto opcional (em moeda, não centavos)
  const [mode, setMode] = useState<'pct' | 'abs'>('pct')

  useEffect(() => {
    // carrega o orçamento atual ao montar
    let alive = true
    getBudget(campId, m.token.trim())
      .then((b) => alive && (setInfo(b), setLoading(false)))
      .catch((e) => alive && (setErr(e.message), setLoading(false)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campId])

  const curTotal = info ? info.total / 100 : 0
  const newTotal = mode === 'abs' ? parseFloat(absVal || '0') : curTotal * (1 + pct / 100)
  const delta = newTotal - curTotal

  async function apply() {
    if (!info || !info.items.length) return
    if (newTotal <= 0) return toast('Valor inválido', 'err')
    setApplying(true)
    const factor = mode === 'abs' ? (curTotal > 0 ? newTotal / curTotal : 1) : 1 + pct / 100
    try {
      if (m.exec) {
        // aplica de verdade: em CBO é 1 item (campanha); em ABO, rateia o fator em cada adset
        for (const it of info.items) {
          const target =
            mode === 'abs' && info.items.length === 1
              ? Math.round(newTotal * 100)
              : Math.round(it.daily * factor)
          await setBudget(it.id, target, m.token.trim())
        }
      }
      addAction({
        accId,
        name,
        campId,
        kind: 'orcamento',
        sim: !m.exec,
        cur,
        roasAtTime: roas,
        spendAtTime: spend ?? null, // foto do gasto/vendas acumulados no momento do aumento
        salesAtTime: sales ?? null,
        dateBR: todayBR(),
        budgetBefore: Math.round(curTotal * 100) / 100,
        budgetAfter: Math.round(newTotal * 100) / 100,
        detail: `${mode === 'pct' ? `+${pct}%` : 'valor fixo'} (${info.level === 'campaign' ? 'CBO' : 'ABO ' + info.items.length + ' adsets'})${m.exec ? '' : ' [simulado]'}`,
      })
      toast(m.exec ? `Orçamento ajustado p/ ${sym}${newTotal.toFixed(2)}/dia` : `Simulado (Execução OFF): ${sym}${curTotal.toFixed(2)} → ${sym}${newTotal.toFixed(2)}`, 'ok')
      onClose()
    } catch (e: any) {
      toast('Erro: ' + e.message, 'err')
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="truncate text-[13px] font-bold" title={name}>💰 Aumentar orçamento</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="card-body flex flex-col gap-3">
          <div className="truncate text-[12px] text-muted" title={name}>{name}</div>

          {loading ? (
            <div className="py-6 text-center text-[12px] text-muted2">Carregando orçamento atual…</div>
          ) : err ? (
            <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-[8px] border border-border bg-surface2 px-3 py-2 text-[12px]">
                <span className="text-muted2">Orçamento atual ({info!.level === 'campaign' ? 'CBO' : `${info!.items.length} adsets`})</span>
                <span className="font-mono font-bold">{sym}{curTotal.toFixed(2)}/dia</span>
              </div>

              {info!.items.length === 0 && (
                <div className="rounded-[8px] border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[11.5px] text-warn">
                  ⚠ Nenhum adset ativo com orçamento diário encontrado. Ajuste direto no Ads Manager.
                </div>
              )}

              <div className="flex gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setMode('pct'); setPct(q) }}
                    className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${mode === 'pct' && pct === q ? 'border-ok bg-ok/15 text-ok' : 'border-border text-muted hover:border-ok/50'}`}
                  >
                    +{q}%
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <label>% personalizado</label>
                  <input type="number" value={pct} onChange={(e) => { setMode('pct'); setPct(+e.target.value) }} className={mode === 'pct' ? 'border-ok/50' : ''} />
                </div>
                <div className="field">
                  <label>ou valor fixo ({sym}/dia)</label>
                  <input type="number" value={absVal} onChange={(e) => { setMode('abs'); setAbsVal(e.target.value) }} placeholder={curTotal.toFixed(2)} className={mode === 'abs' ? 'border-ok/50' : ''} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[8px] border border-ok/30 bg-ok/[0.06] px-3 py-2 text-[13px]">
                <span className="text-muted">Novo orçamento</span>
                <span className="font-mono font-extrabold text-ok">
                  {sym}{newTotal.toFixed(2)}/dia <span className="text-[11px] text-muted2">({delta >= 0 ? '+' : ''}{sym}{delta.toFixed(2)})</span>
                </span>
              </div>

              {!m.exec && (
                <div className="rounded-[8px] border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[11.5px] text-warn">
                  ⚠ <b>Execução OFF</b> — vai apenas registrar no log (simulado), sem alterar na Meta. Ligue o switch <b>Execução</b> no topo pra aplicar de verdade.
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={apply} disabled={loading || applying || !!err || !info?.items.length}>
              <TrendingUp className="h-3.5 w-3.5" /> {applying ? 'Aplicando…' : m.exec ? 'Aplicar na Meta' : 'Registrar (simulado)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── análise por view ── */
interface ListaRow {
  id: string
  name: string
  spend: number
  revenue: number
  lucro: number
  margem: number
  roas: number | null
  cpa: number | null
  sales: number
  freq: number
  cpm: number
  impr: number
  ctr: number
  cpc: number
  cpaIC: number | null
  budget: number | null
  updatedTime?: string
  status?: string
  cls: string
  action: ActionResult
}

/** Lucro/margem de uma linha pelo modelo financeiro (mesmas taxas do Financeiro). */
function rowFin(spend: number, revenue: number, sales: number, FIN: FinParams) {
  const aprov = FIN.aprov / 100
  const fatBruto = revenue * aprov
  const fatLiq = fatBruto * (1 - (FIN.gateway + FIN.imposto + FIN.reembolso + FIN.chargeback) / 100)
  const lucro = fatLiq - spend - sales * aprov * FIN.custoUn
  return { lucro, margem: fatLiq !== 0 ? lucro / fatLiq : 0 }
}
export function analyzeListaRows(rows: InsightRow[], s: Settings, meta?: Record<string, CampMeta>, level: AdLevel = 'campaign'): ListaRow[] {
  const FIN = loadFinParams()
  return rows
    .map((r) => {
      const roas = getRoas(r)
      const cpa = getCpa(r)
      const sales = getSales(r)
      const spend = parseFloat(r.spend || '0')
      const revenue = getRevenue(r) || (roas != null ? roas * spend : 0)
      const { lucro, margem } = rowFin(spend, revenue, sales, FIN)
      const id = (level === 'ad' ? r.ad_id : level === 'adset' ? r.adset_id : r.campaign_id) || ''
      const name = (level === 'ad' ? r.ad_name : level === 'adset' ? r.adset_name : r.campaign_name) || ''
      const md = level === 'campaign' ? meta?.[r.campaign_id!] : undefined
      return {
        id,
        name,
        spend,
        revenue,
        lucro,
        margem,
        roas,
        cpa,
        sales,
        freq: getFreq(r),
        cpm: getCpm(r),
        impr: getImpr(r),
        ctr: getCtr(r),
        cpc: getCpc(r),
        cpaIC: getCpaIC(r),
        budget: md?.budget ?? null,
        updatedTime: md?.updatedTime,
        status: md?.status,
        cls: classify(roas, cpa, sales, s),
        action: analyzeAggregate(roas, cpa, sales, s),
      }
    })
    .sort((a, b) => ORDER[a.cls] - ORDER[b.cls])
}

export function tallyCounts(cache: CacheItem[], s: Settings): Counts {
  const c = { ...EMPTY_COUNTS }
  cache.forEach((item) => {
    if (item.kind === 'lista' && item.rows) {
      analyzeListaRows(item.rows, s).forEach((r) => {
        if (c[r.action.code] !== undefined) c[r.action.code]++
      })
    } else if (item.campMap && item.dates) {
      Object.values(item.campMap).forEach((cm) => {
        const a = analyzeAction(cm.dates, item.dates!, s)
        if (c[a.code] !== undefined) c[a.code]++
      })
    }
  })
  return c
}

/* ── Summary strip ── */
const SUM_ITEMS: [string, string, string, string][] = [
  ['escalar', 'Para escalar', '🚀', 'border-ok/30'],
  ['matar', 'Para matar', '🔴', 'border-danger/30'],
  ['atencao', 'Em atenção', '⚠️', 'border-warn/30'],
  ['perto', 'Perto de escalar', '📈', 'border-brand/30'],
  ['monitorar', 'Monitorando', '👁', 'border-border'],
]
export function SummaryStrip({ counts }: { counts: Counts }) {
  const m = useMonitor()
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {SUM_ITEMS.map(([code, label, icon, border]) => {
        const sel = m.actionFilter === code
        return (
          <button
            key={code}
            onClick={() => m.setActionFilter(sel ? null : code)}
            className={`rounded-xl2 border bg-surface px-3 py-2.5 text-left transition-all ${border} ${
              sel ? 'ring-2 ring-brand' : ''
            }`}
          >
            <div className="text-[20px] font-extrabold">{counts[code]}</div>
            <div className="text-[11px] text-muted2">
              {icon} {label}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ── Lista (gerenciador estilo Facebook) ── */
interface TotAgg { spend: number; sales: number; revenue: number; lucro: number; budget: number }
const m2 = (v: number | null, sym: string) => (v == null ? '—' : sym + v.toFixed(2))

interface MetCol {
  key: string
  label: string
  render: (r: ListaRow, sym: string, s: Settings) => ReactNode
  cls?: (r: ListaRow, s: Settings) => string
  total?: (T: TotAgg, sym: string) => ReactNode
  totalCls?: (T: TotAgg, s: Settings) => string
}
const MET_COLS: MetCol[] = [
  { key: 'sales', label: 'Vendas', render: (r) => r.sales || '—', total: (T) => T.sales || '—' },
  { key: 'budget', label: 'Orçam.', render: (r, sym) => (r.budget != null ? sym + (r.budget / 100).toFixed(2) : '—'), total: (T, sym) => (T.budget > 0 ? sym + (T.budget / 100).toFixed(2) : '—') },
  { key: 'cpa', label: 'CPA', render: (r, sym) => m2(r.cpa, sym), cls: (r, s) => (r.cpa == null ? 'text-muted2' : r.cpa <= s.cpaMax ? 'text-ok' : 'text-danger'), total: (T, sym) => (T.sales > 0 ? sym + (T.spend / T.sales).toFixed(2) : '—') },
  { key: 'spend', label: 'Gasto', render: (r, sym) => sym + r.spend.toFixed(2), total: (T, sym) => sym + T.spend.toFixed(2) },
  { key: 'lucro', label: 'Lucro', render: (r, sym) => (r.spend <= 0 ? '—' : (r.lucro >= 0 ? '' : '-') + sym + Math.abs(r.lucro).toFixed(2)), cls: (r) => (r.spend <= 0 ? 'text-muted2' : r.lucro >= 0 ? 'text-ok font-semibold' : 'text-danger font-semibold'), total: (T, sym) => (T.lucro >= 0 ? '' : '-') + sym + Math.abs(T.lucro).toFixed(2), totalCls: (T) => (T.lucro >= 0 ? 'text-ok' : 'text-danger') },
  { key: 'roas', label: 'ROAS', render: (r) => (r.roas != null ? r.roas.toFixed(2) : '—'), cls: (r, s) => 'font-bold ' + VAL_CLS[roasCls(r.roas, s)], total: (T) => { const v = T.spend > 0 ? T.revenue / T.spend : null; return v != null ? v.toFixed(2) : '—' }, totalCls: (T, s) => VAL_CLS[roasCls(T.spend > 0 ? T.revenue / T.spend : null, s)] },
  { key: 'cpaIC', label: 'CPI', render: (r, sym) => m2(r.cpaIC, sym), cls: () => 'text-muted2' },
  { key: 'cpc', label: 'CPC', render: (r, sym) => (r.cpc ? m2(r.cpc, sym) : '—'), cls: () => 'text-muted2' },
  { key: 'ctr', label: 'CTR', render: (r) => (r.ctr ? r.ctr.toFixed(2) + '%' : '—'), cls: () => 'text-muted2' },
  { key: 'freq', label: 'Freq', render: (r, _sym, s) => (r.freq ? r.freq.toFixed(1) : '—') + (r.freq >= s.freqWarn ? '🔥' : ''), cls: (r, s) => (r.freq >= s.freqWarn ? 'text-warn' : 'text-muted2') },
  { key: 'margem', label: 'Margem', render: (r) => (r.revenue > 0 ? (r.margem * 100).toFixed(0) + '%' : '—'), cls: (r) => (r.spend <= 0 || r.revenue <= 0 ? 'text-muted2' : r.margem >= 0 ? 'text-muted' : 'text-danger') },
  { key: 'updatedTime', label: 'Últ.', render: (r) => fmtEdit(r.updatedTime), cls: () => 'text-muted2 whitespace-nowrap' },
]
const MET_BY_KEY: Record<string, MetCol> = Object.fromEntries(MET_COLS.map((c) => [c.key, c]))

/* config de colunas (ordem + largura) salva no navegador */
const COLCFG_KEY = 'monitor_colcfg_v1'
const DEF_ORDER = MET_COLS.map((c) => c.key)
const DEF_W = 96
interface ColCfg { order: string[]; w: Record<string, number> }
let colCfgCache: ColCfg | null = null
const colSubs = new Set<() => void>()
function readColCfg(): ColCfg {
  try {
    const c = JSON.parse(localStorage.getItem(COLCFG_KEY) || '{}')
    let order: string[] = Array.isArray(c.order) ? c.order.filter((k: string) => MET_BY_KEY[k]) : []
    DEF_ORDER.forEach((k) => { if (!order.includes(k)) order.push(k) })
    if (!order.length) order = [...DEF_ORDER]
    return { order, w: c.w && typeof c.w === 'object' ? c.w : {} }
  } catch { return { order: [...DEF_ORDER], w: {} } }
}
function getColCfg(): ColCfg { if (!colCfgCache) colCfgCache = readColCfg(); return colCfgCache }
function setColCfg(next: ColCfg) { colCfgCache = next; localStorage.setItem(COLCFG_KEY, JSON.stringify(next)); colSubs.forEach((f) => f()) }
export function resetColCfg() { setColCfg({ order: [...DEF_ORDER], w: {} }) }
function useColCfg(): ColCfg {
  return useSyncExternalStore((f) => { colSubs.add(f); return () => { colSubs.delete(f) } }, getColCfg, getColCfg)
}

/* cabeçalho das métricas — ARRASTAR pra reordenar, PUXAR a borda direita pra redimensionar */
function MetHead({ sort, onSort }: { sort: Sort; onSort: (k: string) => void }) {
  const cfg = useColCfg()
  const [dragKey, setDragKey] = useState<string | null>(null)
  const drop = (target: string) => {
    if (!dragKey || dragKey === target) return setDragKey(null)
    const order = [...getColCfg().order]
    order.splice(order.indexOf(dragKey), 1)
    order.splice(order.indexOf(target), 0, dragKey)
    setColCfg({ ...getColCfg(), order })
    setDragKey(null)
  }
  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = getColCfg().w[key] || DEF_W
    const move = (ev: MouseEvent) => {
      const cur = getColCfg()
      setColCfg({ ...cur, w: { ...cur.w, [key]: Math.max(54, startW + (ev.clientX - startX)) } })
    }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }
  return (
    <>
      {cfg.order.map((key) => {
        const c = MET_BY_KEY[key]
        if (!c) return null
        const w = cfg.w[key] || DEF_W
        const active = sort?.key === key
        return (
          <th key={key} draggable onDragStart={() => setDragKey(key)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(key)}
            style={{ width: w, minWidth: w, maxWidth: w }}
            className={`relative select-none px-3 py-2.5 text-right text-[10.5px] ${dragKey === key ? 'opacity-40' : ''}`}>
            <span onClick={() => onSort(key)} title="clique = ordenar · arraste = mover" className="cursor-move hover:text-ink">
              {c.label}{active ? (sort!.dir === 'desc' ? ' ▼' : ' ▲') : ''}
            </span>
            <span onMouseDown={(e) => startResize(key, e)} title="arraste pra redimensionar" className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand/50" />
          </th>
        )
      })}
    </>
  )
}

function MetCells({ r, sym, s }: { r: ListaRow; sym: string; s: Settings }) {
  const cfg = useColCfg()
  return (
    <>
      {cfg.order.map((key) => {
        const c = MET_BY_KEY[key]
        if (!c) return null
        const w = cfg.w[key] || DEF_W
        return (
          <td key={key} style={{ width: w, minWidth: w, maxWidth: w }}
            className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums ${c.cls ? c.cls(r, s) : ''}`}>
            {c.render(r, sym, s)}
          </td>
        )
      })}
    </>
  )
}

function MetFoot({ T, sym, s }: { T: TotAgg; sym: string; s: Settings }) {
  const cfg = useColCfg()
  return (
    <>
      {cfg.order.map((key) => {
        const c = MET_BY_KEY[key]
        if (!c) return null
        const w = cfg.w[key] || DEF_W
        return (
          <td key={key} style={{ width: w }} className={`px-3 py-2.5 text-right font-mono tabular-nums ${c.total ? (c.totalCls ? c.totalCls(T, s) : '') : 'text-muted2'}`}>
            {c.total ? c.total(T, sym) : '—'}
          </td>
        )
      })}
    </>
  )
}
/* Coluna "Aumento": antes → depois do aumento de orçamento de HOJE. Usa o total atual
 * da linha como "depois" (sem fetch). Só aparece se houve aumento registrado hoje. */
function BudgetTrackCell({ r, sym }: { r: ListaRow; sym: string }) {
  useLog()
  const incs = increasesForDay(r.id, todayBR())
  if (!incs.length) return <td className="px-2 py-2 text-center text-[11px] text-muted2">—</td>
  const last = incs[incs.length - 1]
  const prev = incs.length > 1 ? incs[incs.length - 2] : null
  const sSpend = last.spendAtTime || 0
  const sRev = sSpend * (last.roasAtTime || 0)
  const pSpend = prev ? prev.spendAtTime || 0 : 0
  const pRev = prev ? (prev.spendAtTime || 0) * (prev.roasAtTime || 0) : 0
  const bSpend = sSpend - pSpend, bRev = sRev - pRev
  const aSpend = Math.max(0, r.spend - sSpend), aRev = Math.max(0, r.revenue - sRev)
  const rb = bSpend > 0 ? bRev / bSpend : null
  const ra = aSpend > 0 ? aRev / aSpend : null
  const better = rb != null && ra != null ? ra >= rb : null
  return (
    <td className="whitespace-nowrap px-2 py-2 text-[10.5px] leading-tight">
      <div className="font-mono font-semibold text-ink">
        {sym}{(last.budgetBefore || 0).toFixed(0)}<span className="text-ok"> → </span>{sym}{(last.budgetAfter || 0).toFixed(0)}
        {incs.length > 1 ? <span className="text-muted2"> ({incs.length}×)</span> : ''}
      </div>
      <div className="flex items-center gap-1 font-mono" title="ROAS antes → depois do aumento">
        <span className="text-muted2">{rb != null ? rb.toFixed(2) : '—'}</span>
        <span className={better == null ? 'text-muted2' : better ? 'text-ok' : 'text-danger'}>→ {ra != null ? ra.toFixed(2) : '…'}</span>
        {better != null && <span>{better ? '✅' : '❌'}</span>}
      </div>
    </td>
  )
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null

function sortRows(rows: ListaRow[], sort: Sort): ListaRow[] {
  if (!sort) return [...rows].sort((a, b) => ORDER[a.cls] - ORDER[b.cls])
  const { key, dir } = sort
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = (a as any)[key]
    const vb = (b as any)[key]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (key === 'name') return mul * String(va).localeCompare(String(vb))
    if (key === 'updatedTime') return mul * (new Date(va).getTime() - new Date(vb).getTime())
    return mul * (Number(va) - Number(vb))
  })
}

function SortTh({ label, sortKey, sort, onSort, align = 'right' }: { label: string; sortKey: string; sort: Sort; onSort: (k: string) => void; align?: 'left' | 'right' }) {
  const active = sort?.key === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none whitespace-nowrap py-2 hover:text-ink ${align === 'left' ? 'pl-3 text-left' : 'px-2 text-right'} ${active ? 'text-brand-2' : ''}`}
    >
      {label}
      {active ? (sort!.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  )
}

export const fmtEdit = (iso?: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function statusPill(st?: string) {
  if (!st) return null
  const active = st === 'ACTIVE'
  const label = active ? 'Ativa' : /PAUSED/.test(st) ? 'Pausada' : st === 'ARCHIVED' ? 'Arquiv.' : st === 'DELETED' ? 'Excluída' : st
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${active ? 'bg-ok/15 text-ok' : 'bg-surface2 text-muted2'}`}>{label}</span>
}

export function ListaView({ items }: { items: CacheItem[] }) {
  const m = useMonitor()
  const s = m.settings
  const [nameFilter, setNameFilter] = useState('')
  const [sort, setSort] = useState<Sort>(null)
  const onSort = (key: string) => setSort((p) => (p?.key === key ? (p.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[9px] border border-border bg-[#0a0c19] p-0.5 text-[12px]">
          {([['campaign', 'Campanhas'], ['adset', 'Conjuntos'], ['ad', 'Anúncios']] as const).map(([lv, lb]) => (
            <button key={lv} onClick={() => m.setLevel(lv)} disabled={m.loading}
              className={`rounded-[7px] px-3 py-1 font-semibold transition-colors ${m.level === lv ? 'bg-brand text-white' : 'text-muted2 hover:text-ink'}`}>
              {lb}
            </button>
          ))}
        </div>
        <input
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="🔎 Filtrar por nome / nomenclatura..."
          className="w-[240px] rounded-[9px] border border-border bg-[#0a0c19] px-3 py-1.5 text-[12px] text-ink"
        />
        {sort && (
          <button onClick={() => setSort(null)} className="text-[11px] text-muted2 hover:text-ink">
            ✕ limpar ordenação ({sort.key})
          </button>
        )}
        <span className="text-[11px] text-muted2">arraste os títulos pra reordenar · puxe a borda direita pra redimensionar · clique pra ordenar</span>
        <button onClick={resetColCfg} className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] text-muted2 hover:border-brand hover:text-brand-2">↺ resetar colunas</button>
      </div>

      {items.map((item, idx) => {
        if (item.kind === 'err')
          return (
            <div key={idx} className="rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-3 text-[13px]">
              ❌ <b>{item.acc.name}:</b> {item.msg}
            </div>
          )
        if (item.kind !== 'lista' || !item.rows) return null
        const sym = curSym(item.acc.cur)
        const all = analyzeListaRows(item.rows, s, item.meta, m.level)
        let rows = all.filter(
          (r) =>
            (!m.actionFilter || r.action.code === m.actionFilter) &&
            (!nameFilter || r.name.toLowerCase().includes(nameFilter.toLowerCase())) &&
            (!m.onlySelected || !m.campSel.size || m.campSel.has(`${item.acc.id}::${r.id}`)),
        )
        rows = sortRows(rows, sort)
        if (!rows.length) return null
        const rowKeys = rows.map((r) => `${item.acc.id}::${r.id}`)
        const allSel = rowKeys.length > 0 && rowKeys.every((k) => m.campSel.has(k))
        const totSpend = all.reduce((acc, r) => acc + r.spend, 0)
        const totSales = all.reduce((acc, r) => acc + r.sales, 0)
        const gc = all.filter((r) => r.cls === 'good').length
        const bc = all.filter((r) => r.cls === 'bad').length
        // total da tabela (linha de baixo, estilo UTMify) — sobre as linhas visíveis
        const T = rows.reduce(
          (a, r) => ({ spend: a.spend + r.spend, sales: a.sales + r.sales, revenue: a.revenue + r.revenue, lucro: a.lucro + r.lucro, budget: a.budget + (r.budget || 0) }),
          { spend: 0, sales: 0, revenue: 0, lucro: 0, budget: 0 },
        )
        return (
          <div key={idx}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="h-2 w-2 rounded-full bg-brand" />
              <span className="font-bold">{item.acc.name}</span>
              <span className="text-muted2">
                {totSales} vendas · {sym}{totSpend.toFixed(2)}
              </span>
              <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-bold text-ok">{gc} ✅</span>
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-bold text-danger">{bc} ❌</span>
            </div>
            <div className="-mx-4 overflow-x-auto lg:-mx-6">
              <table className="w-full border-collapse text-[12px] [&_td]:border-border/20 [&_th]:border-border/20 [&>tbody>tr>td:not(:first-child)]:border-l [&>thead>tr>th:not(:first-child)]:border-l [&>tfoot>tr>td:not(:first-child)]:border-l">
                <thead>
                  <tr className="border-b border-border bg-surface2/40 uppercase tracking-wide text-muted2">
                    <th className="w-8 py-2.5 text-center">
                      <input type="checkbox" checked={allSel} onChange={(e) => m.selectMany(rowKeys, e.target.checked)} className="cursor-pointer accent-[#6366f1]" title="Selecionar todas visíveis" />
                    </th>
                    <th className="w-8 py-2.5 text-center">●</th>
                    <SortTh label="Campanha" sortKey="name" sort={sort} onSort={onSort} align="left" />
                    <th className="px-2 py-2.5 text-center">Status</th>
                    <th className="px-2 py-2.5 text-center text-[10.5px]" title="Antes → depois do aumento de orçamento de hoje">📈 Aumento</th>
                    <MetHead sort={sort} onSort={onSort} />
                    <th className="py-2.5 pl-3 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <RowWithExpand key={r.id} r={r} acc={item.acc} sym={sym} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface2/60 text-[11px] font-bold">
                    <td colSpan={5} className="px-3 py-2.5 text-left text-muted">{rows.length} campanha{rows.length > 1 ? 's' : ''}</td>
                    <MetFoot T={T} sym={sym} s={s} />
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Painel de escala (dentro da campanha): HOJE lucro/ROAS/gasto/vendas + últimos dias ── */
interface DayProfit { date: string; spend: number; roas: number | null; sales: number; profit: number }

function ScalePanel({ accId, campId, name, sym, cur }: { accId: string; campId: string; name: string; sym: string; cur: string }) {
  const m = useMonitor()
  const [days, setDays] = useState<DayProfit[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const fin = loadFinParams()
  const netFactor = 1 - (fin.gateway + fin.imposto) / 100

  useEffect(() => {
    let alive = true
    setLoading(true); setErr('')
    fetchCampDaily(accId, campId, m.token.trim(), 6)
      .then((rows) => {
        if (!alive) return
        const arr: DayProfit[] = rows
          .map((r) => {
            const spend = parseFloat(r.spend || '0')
            const roas = getRoas(r)
            const sales = getSales(r)
            const gross = getRevenue(r) || (roas != null ? roas * spend : 0)
            return { date: r.date_start as string, spend, roas, sales, profit: gross * netFactor - spend }
          })
          .sort((a, b) => (a.date < b.date ? 1 : -1)) // mais recente primeiro
          .slice(0, 5)
        setDays(arr); setLoading(false)
      })
      .catch((e) => { if (alive) { setErr(e.message); setLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accId, campId])

  if (loading) return <div className="px-4 py-3 text-[12px] text-muted">Carregando dias…</div>
  if (err) return <div className="px-4 py-3 text-[12px] text-danger">{err}</div>
  if (!days || !days.length) return <div className="px-4 py-3 text-[12px] text-muted2">Sem gasto nos últimos dias.</div>

  const today = days[0]
  const ok = today.profit >= 0
  const money = (v: number) => sym + v.toFixed(2)
  const sq = (d: DayProfit) => (d.spend <= 0 ? 'bg-surface2 text-muted2 border-border' : d.profit >= 0 ? 'border-ok/40 bg-ok/15 text-ok' : 'border-danger/40 bg-danger/15 text-danger')

  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
      {/* HOJE */}
      <div className="flex shrink-0 items-center gap-4 rounded-xl2 border border-border bg-surface2/50 px-4 py-2.5">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted2">Hoje · Lucro</div>
          <div className={`text-[22px] font-extrabold leading-tight ${ok ? 'text-ok' : 'text-danger'}`}>{ok ? '+' : ''}{money(today.profit)}</div>
        </div>
        <div className="flex flex-col gap-0.5 text-[11px] text-muted">
          <span>ROAS <b className="text-ink">{today.roas != null ? today.roas.toFixed(2) : '—'}</b></span>
          <span>Gasto <b className="text-ink">{money(today.spend)}</b></span>
          <span>Vendas <b className="text-ink">{today.sales}</b></span>
        </div>
      </div>
      {/* últimos dias (mais antigo → hoje) */}
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
        {[...days].reverse().map((d) => (
          <div
            key={d.date}
            className={`flex min-w-[56px] flex-col items-center rounded-[9px] border px-2 py-1.5 ${sq(d)}`}
            title={`${fmtDate(d.date)} · ROAS ${d.roas?.toFixed(2) ?? '—'} · ${d.sales} vendas · gasto ${money(d.spend)} · lucro ${money(d.profit)}`}
          >
            <span className="text-[9px] opacity-70">{fmtDate(d.date)}</span>
            <span className="text-[15px] font-extrabold leading-none">{d.roas != null ? d.roas.toFixed(2) : '—'}</span>
            <span className="text-[8.5px] opacity-70">{d.sales}v</span>
          </div>
        ))}
      </div>
      {/* ação: aumentar orçamento (já loga antes/depois + ROAS) */}
      <div className="shrink-0">
        <BudgetBtn accId={accId} name={name} campId={campId} roas={today.roas} cur={cur} spend={today.spend} sales={today.sales} />
        <ImpactBtn accId={accId} name={name} campId={campId} cur={cur} />
      </div>
    </div>
  )
}

function RowWithExpand({ r, acc, sym }: { r: ListaRow; acc: CacheItem['acc']; sym: string }) {
  const m = useMonitor()
  const [open, setOpen] = useState(false)
  const [scaleOpen, setScaleOpen] = useState(false)
  const [ads, setAds] = useState<ListaRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (ads) return
    setLoading(true)
    try {
      const raw = await fetchAds(acc.id, r.id, m.datePreset, m.token.trim())
      const rows = raw
        .map((a) => {
          const roas = getRoas(a)
          const cpa = getCpa(a)
          const sales = getSales(a)
          const spend = parseFloat(a.spend || '0')
          const revenue = getRevenue(a) || (roas != null ? roas * spend : 0)
          const { lucro, margem } = rowFin(spend, revenue, sales, loadFinParams())
          return {
            id: a.ad_id!,
            name: a.ad_name || '',
            spend,
            revenue,
            lucro,
            margem,
            roas,
            cpa,
            sales,
            freq: 0,
            cpm: 0,
            impr: 0,
            ctr: 0,
            cpc: 0,
            cpaIC: null,
            budget: null,
            cls: classify(roas, cpa, sales, m.settings),
            action: { code: 'ok', label: '', detail: '' },
          } as ListaRow
        })
        .sort((x, y) => ORDER[x.cls] - ORDER[y.cls])
      setAds(rows)
    } catch (e: any) {
      setErr(e.message)
    }
    setLoading(false)
  }

  const money = (v: number | null) => (v == null ? '—' : sym + v.toFixed(2))
  const key = `${acc.id}::${r.id}`

  return (
    <>
      <tr className={`border-b border-border align-middle ${ROW_BG[r.cls]} ${m.campSel.has(key) ? 'bg-brand/[0.06]' : 'hover:bg-surface2/20'}`}>
        <td className="py-2 text-center">
          <input type="checkbox" checked={m.campSel.has(key)} onChange={() => m.toggleCamp(key)} className="cursor-pointer accent-[#6366f1]" />
        </td>
        <td className="py-2 text-center">{ICONS[r.cls]}</td>
        <td className="py-2 pl-3 pr-2">
          <div className="flex items-center gap-1">
            <span className="inline-block max-w-[230px] truncate align-middle" title={r.name}>
              {r.name}
            </span>
            <a href={m.level === 'ad' ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${acc.id}&selected_ad_ids=${r.id}` : m.level === 'adset' ? `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${acc.id}&selected_adset_ids=${r.id}` : campUrl(acc.id, r.id)} target="_blank" className="shrink-0 text-muted2 hover:text-brand-2" title="Abrir no Ads Manager">
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </td>
        <td className="px-2 py-2 text-center">{statusPill(r.status)}</td>
        <BudgetTrackCell r={r} sym={sym} />
        <MetCells r={r} sym={sym} s={m.settings} />
        <td className="py-2 pl-3 pr-3">
          <div className="flex items-center gap-1.5">
            <Badge a={r.action} />
            {m.level === 'campaign' && (
              <>
                <ScaleBadge campId={r.id} />
                <BudgetBtn accId={acc.id} name={r.name} campId={r.id} roas={r.roas} cur={acc.cur} spend={r.spend} sales={r.sales} />
                <LogBtn accId={acc.id} name={r.name} campId={r.id} roas={r.roas} cur={acc.cur} spend={r.spend} sales={r.sales} />
                <ImpactBtn accId={acc.id} name={r.name} campId={r.id} cur={acc.cur} />
                <button
                  onClick={() => setScaleOpen((v) => !v)}
                  title="Lucro de hoje + últimos dias (pra decidir escalar)"
                  className="inline-flex items-center gap-0.5 whitespace-nowrap rounded border border-ok/40 bg-ok/5 px-2 py-0.5 text-[10.5px] font-bold text-ok hover:bg-ok/15"
                >
                  <BarChart3 className="h-3 w-3" /> escala {scaleOpen ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />}
                </button>
                <button
                  onClick={toggle}
                  className="whitespace-nowrap rounded border border-border px-2 py-0.5 text-[10.5px] font-semibold text-muted hover:border-brand hover:text-brand-2"
                >
                  criativos {open ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {scaleOpen && (
        <tr className="bg-bg/40">
          <td colSpan={18} className="border-b border-border p-0">
            <ScalePanel accId={acc.id} campId={r.id} name={r.name} sym={sym} cur={acc.cur} />
          </td>
        </tr>
      )}
      {open && (
        <tr className="bg-bg/40">
          <td colSpan={18} className="p-0">
            {loading && <div className="px-4 py-3 text-[12px] text-muted">Carregando criativos...</div>}
            {err && <div className="px-4 py-3 text-[12px] text-danger">{err}</div>}
            {ads && !ads.length && <div className="px-4 py-3 text-[12px] text-muted">Sem dados no período</div>}
            {ads && ads.length > 0 && (
              <table className="w-full">
                <tbody>
                  {ads.map((ad) => (
                    <tr key={ad.id} className={`text-[12px] ${ROW_BG[ad.cls]}`}>
                      <td className="w-11 py-1.5 text-center">{ICONS[ad.cls]}</td>
                      <td className="py-1.5 text-muted">↳ {trunc(ad.name, 48)}</td>
                      <td className="w-[90px] py-1.5 text-right font-mono">{sym}{ad.spend.toFixed(2)}</td>
                      <td className={`w-[70px] py-1.5 text-right font-mono ${VAL_CLS[roasCls(ad.roas, m.settings)]}`}>
                        {ad.roas !== null ? ad.roas.toFixed(2) : '—'}
                      </td>
                      <td className={`w-[70px] py-1.5 text-right font-mono ${ad.cpa === null ? 'text-muted2' : ad.cpa <= m.settings.cpaMax ? 'text-ok' : 'text-danger'}`}>
                        {ad.cpa !== null ? '$' + ad.cpa.toFixed(2) : '—'}
                      </td>
                      <td className="w-[60px] py-1.5 pr-3 text-right font-mono">{ad.sales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/* ── Histórico ── */
export function HistoricoView({ items }: { items: CacheItem[] }) {
  const m = useMonitor()
  const s = m.settings
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-[420px]">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar campanha por nome/nomenclatura..."
          className="w-full rounded-[7px] border border-border bg-[#0a0c19] py-1.5 pl-8 pr-8 text-[12px] text-ink"
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted2 hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {items.map((item, idx) => {
        if (item.kind === 'err')
          return (
            <div key={idx} className="rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-3 text-[13px]">
              ❌ <b>{item.acc.name}:</b> {item.msg}
            </div>
          )
        if (!item.campMap || !item.dates) return null
        const camps = Object.entries(item.campMap)
          .map(([cid, camp]) => ({ cid, camp, action: analyzeAction(camp.dates, item.dates!, s) }))
          .filter(
            (x) =>
              (!m.actionFilter || x.action.code === m.actionFilter) &&
              (!m.onlySelected || !m.campSel.size || m.campSel.has(`${item.acc.id}::${x.cid}`)) &&
              (!ql || (x.camp.name || '').toLowerCase().includes(ql)),
          )
        if (!camps.length) return null
        return (
          <div key={idx}>
            <div className="mb-2 flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 rounded-full bg-brand" />
              <span className="font-bold">{item.acc.name}</span>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted2">
                    <th className="py-2 pl-3 text-left">Campanha</th>
                    {item.dates!.map((d) => (
                      <th key={d} className="px-1 py-2 text-center" title={d}>
                        {fmtDate(d)}
                      </th>
                    ))}
                    <th className="py-2 pl-2 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {camps.map(({ cid, camp, action }) => (
                    <tr key={cid} className="border-b border-border/50">
                      <td className="py-1.5 pl-3 pr-2">
                        <div className="flex items-start gap-1">
                          <span className="min-w-[200px] max-w-[340px] whitespace-normal break-words leading-tight" title={camp.name}>
                            {camp.name}
                          </span>
                          <a href={campUrl(item.acc.id, cid)} target="_blank" className="mt-0.5 shrink-0 text-muted2 hover:text-brand-2">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </td>
                      {item.dates!.map((d) => {
                        const day = camp.dates[d]
                        if (!day)
                          return (
                            <td key={d} className="px-1 py-1.5 text-center text-muted2">—</td>
                          )
                        const cls = classify(day.roas, day.cpa, day.sales, s)
                        const bg = { good: 'bg-ok/10', bad: 'bg-danger/10', warn: 'bg-warn/10', none: '' }[cls]
                        return (
                          <td
                            key={d}
                            className={`px-1 py-1.5 text-center ${bg}`}
                            title={`ROAS:${day.roas !== null ? day.roas.toFixed(2) : '—'} | ${day.sales}v | $${day.spend.toFixed(2)}`}
                          >
                            <div>{ICONS[cls]}</div>
                            <div className="font-mono text-[10px] text-muted">
                              {day.roas !== null ? day.roas.toFixed(2) : '—'}
                            </div>
                          </td>
                        )
                      })}
                      <td className="py-1.5 pl-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge a={action} />
                          <ScaleBadge campId={cid} />
                          <BudgetBtn accId={item.acc.id} name={camp.name} campId={cid} roas={null} cur={item.acc.cur} />
                          <LogBtn accId={item.acc.id} name={camp.name} campId={cid} roas={null} cur={item.acc.cur} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Gráfico ── */
export function GraficoView({ items }: { items: CacheItem[] }) {
  const m = useMonitor()
  return (
    <div className="flex flex-col gap-4">
      {items.map((item, idx) => {
        if (item.kind === 'err' || !item.campMap || !item.dates) return null
        let cm = item.campMap
        if (m.onlySelected && m.campSel.size) {
          cm = Object.fromEntries(Object.entries(item.campMap).filter(([cid]) => m.campSel.has(`${item.acc.id}::${cid}`)))
        }
        if (!Object.keys(cm).length) return null
        return <GraficoCard key={idx} campMap={cm} dates={item.dates} accName={item.acc.name} />
      })}
    </div>
  )
}

function GraficoCard({ campMap, dates, accName }: { campMap: CampMap; dates: string[]; accName: string }) {
  const m = useMonitor()
  const data = useMemo(
    () =>
      dates.map((d) => {
        const point: Record<string, number | string | null> = { date: fmtDate(d) }
        Object.entries(campMap).forEach(([cid, camp]) => {
          point[cid] = camp.dates[d]?.roas ?? null
        })
        return point
      }),
    [campMap, dates],
  )
  const camps = Object.entries(campMap)
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px]">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <span className="font-bold">{accName} — ROAS por dia</span>
      </div>
      <div className="card p-4" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(38,43,55,.6)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8b93a6' }} />
            <YAxis tick={{ fontSize: 10, fill: '#8b93a6' }} />
            <Tooltip contentStyle={{ background: '#0d0f1e', border: '1px solid #1d2139', borderRadius: 8, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={m.settings.roasBe} stroke="rgba(251,111,134,.5)" strokeDasharray="6 4" />
            <ReferenceLine y={m.settings.roasGood} stroke="rgba(70,217,137,.5)" strokeDasharray="6 4" />
            {camps.map(([cid, camp], i) => (
              <Line
                key={cid}
                type="monotone"
                dataKey={cid}
                name={trunc(camp.name, 28)}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
