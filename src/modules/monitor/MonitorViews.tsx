import { useEffect, useMemo, useState } from 'react'
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
  getRoas,
  getCpa,
  getSales,
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
} from '@/lib/meta'
import { useMonitor } from './MonitorContext'
import type { CacheItem, CampMap, CampMeta } from './MonitorContext'
import { openLog, lastScale, useLog, addAction } from './actionLog'
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
export function LogBtn({ accId, name, campId, roas, cur }: { accId: string; name: string; campId: string; roas: number | null; cur: string }) {
  return (
    <button
      onClick={() =>
        openLog({ accId, name, campId, kind: 'escala', roasAtTime: roas, cur })
      }
      title="Registrar o que fiz nesta campanha"
      className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted hover:border-brand hover:text-brand-2"
    >
      ✎ log
    </button>
  )
}

/** Botão de aumentar orçamento direto na linha (abre modal). Respeita Execução ON/OFF. */
export function BudgetBtn({ accId, name, campId, roas, cur }: { accId: string; name: string; campId: string; roas: number | null; cur: string }) {
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
      {open && <BudgetModal accId={accId} name={name} campId={campId} roas={roas} cur={cur} onClose={() => setOpen(false)} />}
    </>
  )
}

const QUICK = [10, 20, 30, 50]

function BudgetModal({ accId, name, campId, roas, cur, onClose }: { accId: string; name: string; campId: string; roas: number | null; cur: string; onClose: () => void }) {
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
export function analyzeListaRows(rows: InsightRow[], s: Settings, meta?: Record<string, CampMeta>): ListaRow[] {
  return rows
    .map((r) => {
      const roas = getRoas(r)
      const cpa = getCpa(r)
      const sales = getSales(r)
      const md = meta?.[r.campaign_id!]
      return {
        id: r.campaign_id!,
        name: r.campaign_name || '',
        spend: parseFloat(r.spend || '0'),
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
const LISTA_COLS: { key: keyof ListaRow; label: string }[] = [
  { key: 'spend', label: 'Gasto' },
  { key: 'impr', label: 'Impr.' },
  { key: 'cpm', label: 'CPM' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpc', label: 'CPC' },
  { key: 'cpaIC', label: 'C/Checkout' },
  { key: 'cpa', label: 'CPA' },
  { key: 'sales', label: 'Result.' },
  { key: 'roas', label: 'ROAS' },
  { key: 'freq', label: 'Freq' },
  { key: 'budget', label: 'Orçam.' },
  { key: 'updatedTime', label: 'Últ. edição' },
]
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
        <input
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="🔎 Filtrar por nome / nomenclatura..."
          className="w-[280px] rounded-[9px] border border-border bg-[#0a0c19] px-3 py-1.5 text-[12px] text-ink"
        />
        {sort && (
          <button onClick={() => setSort(null)} className="text-[11px] text-muted2 hover:text-ink">
            ✕ limpar ordenação ({sort.key})
          </button>
        )}
        <span className="text-[11px] text-muted2">clique nos títulos pra ordenar · role a tabela →</span>
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
        const all = analyzeListaRows(item.rows, s, item.meta)
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
            <div className="card overflow-x-auto">
              <table className="w-full border-collapse text-[11px] [&_td]:border-border/15 [&_th]:border-border/15 [&>tbody>tr>td:not(:first-child)]:border-l [&>thead>tr>th:not(:first-child)]:border-l">
                <thead>
                  <tr className="border-b border-border bg-surface2/40 uppercase tracking-wide text-muted2">
                    <th className="w-8 py-2.5 text-center">
                      <input type="checkbox" checked={allSel} onChange={(e) => m.selectMany(rowKeys, e.target.checked)} className="cursor-pointer accent-[#6366f1]" title="Selecionar todas visíveis" />
                    </th>
                    <th className="w-8 py-2.5 text-center">●</th>
                    <SortTh label="Campanha" sortKey="name" sort={sort} onSort={onSort} align="left" />
                    <th className="px-2 py-2.5 text-center">Status</th>
                    {LISTA_COLS.map((c) => (
                      <SortTh key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={onSort} />
                    ))}
                    <th className="py-2.5 pl-3 text-left">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <RowWithExpand key={r.id} r={r} acc={item.acc} sym={sym} />
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

function RowWithExpand({ r, acc, sym }: { r: ListaRow; acc: CacheItem['acc']; sym: string }) {
  const m = useMonitor()
  const [open, setOpen] = useState(false)
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
          return {
            id: a.ad_id!,
            name: a.ad_name || '',
            spend: parseFloat(a.spend || '0'),
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
            <a href={campUrl(acc.id, r.id)} target="_blank" className="shrink-0 text-muted2 hover:text-brand-2" title="Abrir no Ads Manager">
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </td>
        <td className="px-2 py-2 text-center">{statusPill(r.status)}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{money(r.spend)}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{r.impr ? r.impr.toLocaleString('pt-BR') : '—'}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{money(r.cpm)}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{r.ctr ? r.ctr.toFixed(2) + '%' : '—'}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{r.cpc ? money(r.cpc) : '—'}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{money(r.cpaIC)}</td>
        <td className={`px-2 py-2 text-right font-mono tabular-nums ${r.cpa === null ? 'text-muted2' : r.cpa <= m.settings.cpaMax ? 'text-ok' : 'text-danger'}`}>{money(r.cpa)}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{r.sales}</td>
        <td className={`px-2 py-2 text-right font-mono tabular-nums ${VAL_CLS[roasCls(r.roas, m.settings)]}`}>{r.roas !== null ? r.roas.toFixed(2) : '—'}</td>
        <td className={`px-2 py-2 text-right font-mono tabular-nums ${r.freq >= m.settings.freqWarn ? 'text-warn' : 'text-muted2'}`}>{r.freq ? r.freq.toFixed(1) : '—'}{r.freq >= m.settings.freqWarn ? '🔥' : ''}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{r.budget != null ? sym + (r.budget / 100).toFixed(2) : '—'}</td>
        <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums text-muted2">{fmtEdit(r.updatedTime)}</td>
        <td className="py-2 pl-3 pr-3">
          <div className="flex items-center gap-1.5">
            <Badge a={r.action} />
            <ScaleBadge campId={r.id} />
            <BudgetBtn accId={acc.id} name={r.name} campId={r.id} roas={r.roas} cur={acc.cur} />
            <LogBtn accId={acc.id} name={r.name} campId={r.id} roas={r.roas} cur={acc.cur} />
            <button
              onClick={toggle}
              className="whitespace-nowrap rounded border border-border px-2 py-0.5 text-[10.5px] font-semibold text-muted hover:border-brand hover:text-brand-2"
            >
              criativos {open ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />}
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-bg/40">
          <td colSpan={17} className="p-0">
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
