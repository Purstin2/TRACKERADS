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
import {
  ExternalLink,
  Search,
  X,
  TrendingUp,
  Check as CheckIcon,
  DollarSign,
  Clock,
  Copy,
  History,
  Link2,
  PenLine,
} from 'lucide-react'
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
import { loadFinParamsForAccount, rowFin } from './finance'
import { useMonitor } from './MonitorContext'
import StatusSwitch from './components/StatusSwitch'
import { offerMemberSet } from './offers'
import { BarChart3 } from 'lucide-react'
import type { CacheItem, CampMap, CampMeta } from './MonitorContext'
import type { RealAgg } from './realRoas'
import { openLog, lastScale, useLog, addAction, todayBR, touchedIds, duplicationsFor, budgetIncreases, impactDays, KIND_LABEL, KIND_CLS, type ActionEntry } from './actionLog'
import { TrackerBtn, TrackerCell, BudgetTrackerModal } from './BudgetTracker'
import { DuplicateModal, DupProofModal } from './Duplicate'
import { SalesTimelineModal } from './SalesTimeline'
import { Layers } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import {
  ICONS,
  ORDER,
  PALETTE,
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

/* ── Sistema visual compartilhado (checkbox, status, bolinha) ──
 * Um padrão único pra tudo: mesmo checkbox, mesmo chip de status, mesma bolinha.
 * É o que tira a "cara de amador" — nada de emoji/pill de tamanhos diferentes. */

/** Checkbox do tema (substitui o nativo do browser). onChange recebe o novo estado. */
export function Checkbox({ checked, onChange, title }: { checked: boolean; onChange: (next: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={`inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        checked ? 'border-brand bg-brand text-white' : 'border-border bg-surface2/50 hover:border-brand/60'
      }`}
    >
      {checked && <CheckIcon className="h-2.5 w-2.5" strokeWidth={3.5} />}
    </button>
  )
}

/** Borda "neon" da cópia recém-comparada (destaque da duplicação filtrada).
 *  outline (não box-shadow) pra renderizar tanto na tabela separate quanto na collapse. */
const NEON_STYLE = { outline: '2px solid #f7b955', outlineOffset: '-2px', boxShadow: '0 0 14px rgba(247,185,85,.5)' } as const

/** Cor da bolinha por classe (good/bad/warn/none) — usada nas células de data e no marcador da linha. */
const CLS_DOT: Record<string, string> = { good: 'bg-ok', bad: 'bg-danger', warn: 'bg-warn', none: 'bg-muted2/40' }
const CLS_TXT: Record<string, string> = { good: 'text-ok', bad: 'text-danger', warn: 'text-warn', none: 'text-muted2' }
export function ClsDot({ cls }: { cls: string }) {
  return <span className={`inline-block h-[7px] w-[7px] rounded-full ${CLS_DOT[cls] || 'bg-muted2/40'}`} />
}

/** Aparência única do status: bolinha + label limpo (sem emoji), largura consistente. */
const STATUS_UI: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  escalar:   { label: 'Escalar',   dot: 'bg-ok',     text: 'text-ok',      bg: 'bg-ok/10' },
  matar:     { label: 'Matar',     dot: 'bg-danger', text: 'text-danger',  bg: 'bg-danger/10' },
  atencao:   { label: 'Atenção',   dot: 'bg-warn',   text: 'text-warn',    bg: 'bg-warn/10' },
  perto:     { label: 'Perto',     dot: 'bg-brand',  text: 'text-brand-2', bg: 'bg-brand/10' },
  monitorar: { label: 'Monitorar', dot: 'bg-muted2', text: 'text-muted',   bg: 'bg-surface2' },
  aguardar:  { label: 'Aguardar',  dot: 'bg-muted2', text: 'text-muted2',  bg: 'bg-surface2' },
  ok:        { label: 'OK',        dot: 'bg-ok',     text: 'text-ok',      bg: 'bg-ok/10' },
}

export function Badge({ a }: { a: ActionResult }) {
  if (a.code === 'sem') return <span className="text-[11px] text-muted2">—</span>
  if (a.code === 'ok' && !a.label.trim()) return null
  const ui = STATUS_UI[a.code] || STATUS_UI.ok
  return (
    <span title={a.detail} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${ui.bg} ${ui.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} />
      {ui.label}
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
    <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface2/60 px-1.5 py-0.5 text-[10px] font-medium text-muted2" title={`${det} · ${new Date(last.ts).toLocaleString('pt-BR')}`}>
      ↑{days === 0 ? 'hoje' : days + 'd'}
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

/** Botão de aumentar orçamento direto na linha (abre modal). */
export function BudgetBtn({ accId, name, campId, cur }: { accId: string; name: string; campId: string; cur: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ajustar orçamento (aumentar ou diminuir)"
        className="inline-flex items-center gap-0.5 rounded border border-ok/40 bg-ok/5 px-1.5 py-0.5 text-[10px] font-bold text-ok hover:bg-ok/15"
      >
        <TrendingUp className="h-3 w-3" /> $
      </button>
      {open && <BudgetModal accId={accId} name={name} campId={campId} cur={cur} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Foto de HOJE da campanha — é o "antes" que o tracker congela no momento do aumento. */
interface DaySnap { spend: number; sales: number; revenue: number; roas: number | null }

function BudgetModal({ accId, name, campId, cur, onClose }: { accId: string; name: string; campId: string; cur: string; onClose: () => void }) {
  const m = useMonitor()
  const sym = curSym(cur)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [info, setInfo] = useState<{ level: 'campaign' | 'adset'; items: { id: string; daily: number; name: string }[]; total: number } | null>(null)
  const [err, setErr] = useState('')
  const [pct, setPct] = useState(20)
  const [absVal, setAbsVal] = useState('') // valor absoluto opcional (em moeda, não centavos)
  const [mode, setMode] = useState<'pct' | 'abs'>('pct')
  const [snap, setSnap] = useState<DaySnap | null | 'fail'>(null)

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

  // A foto vem do acumulado de HOJE, buscado aqui — nunca do período que a tela mostra
  // (em "últimos 14 dias" o gasto da linha é dos 14 dias e envenenaria o antes×depois).
  // Pede 2 dias e casa por date_start: o range do fetch é UTC e das 21h à meia-noite o
  // "hoje" UTC já virou amanhã.
  useEffect(() => {
    let alive = true
    fetchCampDaily(accId, campId, m.token.trim(), 2)
      .then((rows: any[]) => {
        if (!alive) return
        const row = (rows || []).find((r) => (r.date_start as string) === todayBR())
        if (!row) return setSnap({ spend: 0, sales: 0, revenue: 0, roas: null }) // ainda não gastou hoje
        const sp = parseFloat(row.spend || '0')
        const rev = getRevenue(row) || 0
        setSnap({ spend: sp, sales: getSales(row), revenue: rev, roas: sp > 0 ? rev / sp : null })
      })
      .catch(() => alive && setSnap('fail'))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accId, campId])

  const curTotal = info ? info.total / 100 : 0
  const newTotal = mode === 'abs' ? parseFloat(absVal || '0') : curTotal * (1 + pct / 100)
  const delta = newTotal - curTotal

  async function apply() {
    if (!info || !info.items.length) return
    if (newTotal <= 0) return toast('Valor inválido', 'err')
    setApplying(true)
    const factor = mode === 'abs' ? (curTotal > 0 ? newTotal / curTotal : 1) : 1 + pct / 100
    try {
      // aplica de verdade: em CBO é 1 item (campanha); em ABO, rateia o fator em cada adset
      for (const it of info.items) {
        const target =
          mode === 'abs' && info.items.length === 1
            ? Math.round(newTotal * 100)
            : Math.round(it.daily * factor)
        await setBudget(it.id, target, m.token.trim())
      }
      const foto = snap && snap !== 'fail' ? snap : null
      addAction({
        accId,
        name,
        campId,
        kind: 'orcamento',
        sim: false,
        cur,
        // foto do acumulado de HOJE no momento do aumento — é o "antes" congelado do tracker
        roasAtTime: foto ? foto.roas : null,
        spendAtTime: foto ? foto.spend : null,
        salesAtTime: foto ? foto.sales : null,
        dateBR: todayBR(),
        budgetBefore: Math.round(curTotal * 100) / 100,
        budgetAfter: Math.round(newTotal * 100) / 100,
        detail: `${mode === 'pct' ? `${pct >= 0 ? '+' : ''}${pct}%` : 'valor fixo'} (${info.level === 'campaign' ? 'CBO' : 'ABO ' + info.items.length + ' adsets'})`,
      })
      toast(
        foto
          ? `Orçamento ajustado p/ ${sym}${newTotal.toFixed(2)}/dia — o tracker já está medindo o resultado`
          : `Orçamento ajustado p/ ${sym}${newTotal.toFixed(2)}/dia · ⚠ sem a foto de hoje, o tracker não vai medir este aumento`,
        foto ? 'ok' : 'warn',
      )
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
          <h3 className="truncate text-[13px] font-bold" title={name}>💰 Ajustar orçamento</h3>
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

              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  {[10, 20, 30].map((q) => (
                    <button
                      key={`d${q}`}
                      onClick={() => { setMode('pct'); setPct(-q) }}
                      className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${mode === 'pct' && pct === -q ? 'border-danger bg-danger/15 text-danger' : 'border-border text-muted hover:border-danger/50'}`}
                    >
                      −{q}%
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {[10, 20, 30, 50].map((q) => (
                    <button
                      key={`u${q}`}
                      onClick={() => { setMode('pct'); setPct(q) }}
                      className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${mode === 'pct' && pct === q ? 'border-ok bg-ok/15 text-ok' : 'border-border text-muted hover:border-ok/50'}`}
                    >
                      +{q}%
                    </button>
                  ))}
                </div>
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

              <div className={`flex items-center justify-between rounded-[8px] border px-3 py-2 text-[13px] ${delta >= 0 ? 'border-ok/30 bg-ok/[0.06]' : 'border-warn/30 bg-warn/[0.06]'}`}>
                <span className="text-muted">Novo orçamento</span>
                <span className={`font-mono font-extrabold ${delta >= 0 ? 'text-ok' : 'text-warn'}`}>
                  {sym}{newTotal.toFixed(2)}/dia <span className="text-[11px] text-muted2">({delta >= 0 ? '+' : ''}{sym}{delta.toFixed(2)})</span>
                </span>
              </div>

              {/* o que o tracker vai congelar como "antes" */}
              {snap === null ? (
                <div className="rounded-[8px] border border-border bg-surface2/40 px-3 py-2 text-[11.5px] text-muted2 animate-pulse">
                  buscando o resultado de hoje…
                </div>
              ) : snap === 'fail' ? (
                <div className="rounded-[8px] border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[11.5px] text-warn">
                  ⚠ Não consegui buscar o acumulado de hoje — o orçamento é aplicado, mas o tracker fica sem o "antes" deste aumento.
                </div>
              ) : (
                <div className="rounded-[8px] border border-brand/25 bg-brand/[0.05] px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-2">Hoje até agora — vira o "antes" do tracker</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-muted">
                    <span>ROAS <b className="font-mono text-ink">{snap.roas != null ? snap.roas.toFixed(2) : '—'}</b></span>
                    <span>Vendas <b className="font-mono text-ink">{snap.sales}</b></span>
                    <span>Gasto <b className="font-mono text-ink">{sym}{snap.spend.toFixed(2)}</b></span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={apply} disabled={loading || applying || !!err || !info?.items.length}>
              <TrendingUp className="h-3.5 w-3.5" /> {applying ? 'Aplicando…' : 'Aplicar na Meta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Histórico de modificações da campanha (o que foi salvo nas Ações) ──
 * Mostra a linha do tempo do que você fez nesta campanha (orçamento, escala,
 * duplicação, nota). Se foi duplicada, mostra ONDE está a cópia e o botão
 * "comparar as duas" — filtra só as duas e marca a cópia com borda neon. */
const histDateFmt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const dmFmt = (d: string) => d.slice(8) + '/' + d.slice(5, 7)

function CampHistoryModal({ accId, name, campId, cur, onClose }: { accId: string; name: string; campId: string; cur: string; onClose: () => void }) {
  const m = useMonitor()
  const log = useLog()
  const sym = curSym(cur)

  // tudo que aconteceu NESTA campanha (orçamento, escala, nota, e — se for cópia — sua criação)
  const mine = useMemo(
    () => log.filter((e) => e.campId === campId).sort((a, b) => b.ts.localeCompare(a.ts)),
    [log, campId],
  )
  // cópias feitas A PARTIR desta campanha (aqui ela é a ORIGINAL)
  const copies = useMemo(
    () => log.filter((e) => e.kind === 'duplicacao' && e.linkedTo === campId).sort((a, b) => b.ts.localeCompare(a.ts)),
    [log, campId],
  )
  // esta campanha É uma cópia de outra?
  const iAmCopyOf = useMemo(() => mine.find((e) => e.kind === 'duplicacao' && e.linkedTo), [mine])

  function compare(origId: string, copyId: string) {
    m.compareDuplication(accId, origId, copyId)
    toast('Filtrando original + cópia. Se a cópia não aparecer, troque o filtro de status pra incluir pausadas.', 'ok')
    onClose()
  }

  const budgetEntry = (e: ActionEntry) =>
    e.budgetBefore != null && e.budgetAfter != null ? (
      <span className="font-mono text-[11px] text-ink">{sym}{e.budgetBefore.toFixed(0)}<span className="text-ok"> → </span>{sym}{e.budgetAfter.toFixed(0)}</span>
    ) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[540px] max-h-[86vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <h3 className="truncate text-[13px] font-bold" title={name}>🕐 Histórico da campanha</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="card-body flex flex-col gap-3">
          <div className="truncate text-[12px] text-muted" title={name}>{name}</div>

          {/* relações de duplicação */}
          {(copies.length > 0 || iAmCopyOf) && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-warn/30 bg-warn/[0.06] px-3 py-2.5">
              {copies.length > 0 && (
                <>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-warn">Esta campanha foi duplicada</div>
                  {copies.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-[12px]">
                      <span className="shrink-0 font-mono text-[10.5px] text-muted2">{dmFmt(c.dateBR || todayBR(new Date(c.ts)))}</span>
                      <span className="min-w-0 flex-1 truncate text-ink" title={c.name}>↳ {c.name}</span>
                      <button onClick={() => compare(campId, c.campId!)} className="shrink-0 rounded-[7px] border border-warn/50 bg-warn/10 px-2 py-1 text-[10.5px] font-bold text-warn hover:bg-warn/20">
                        comparar as duas
                      </button>
                    </div>
                  ))}
                </>
              )}
              {iAmCopyOf && (
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-warn">É cópia de</span>
                  <span className="min-w-0 flex-1 truncate text-ink" title={iAmCopyOf.linkedName || ''}>{iAmCopyOf.linkedName || '—'}</span>
                  <button onClick={() => compare(iAmCopyOf.linkedTo!, campId)} className="shrink-0 rounded-[7px] border border-warn/50 bg-warn/10 px-2 py-1 text-[10.5px] font-bold text-warn hover:bg-warn/20">
                    comparar as duas
                  </button>
                </div>
              )}
            </div>
          )}

          {/* linha do tempo */}
          {mine.length === 0 ? (
            <div className="rounded-[8px] border border-border bg-surface2/40 px-3 py-6 text-center text-[12px] text-muted2">
              Nenhuma modificação registrada nesta campanha ainda.<br />
              <span className="text-[11px]">Ajuste orçamento, duplique ou registre uma ação — vai aparecer aqui.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted2">Linha do tempo</div>
              {mine.map((e) => (
                <div key={e.id} className="flex items-start gap-2.5 rounded-[9px] border border-border bg-surface2/40 px-3 py-2">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_CLS[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-muted2">{histDateFmt(e.ts)}</span>
                      {e.sim && <span className="rounded bg-warn/10 px-1 text-[9px] font-bold text-warn">simulado</span>}
                      {budgetEntry(e)}
                    </div>
                    {e.detail && <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{e.detail}</div>}
                    {e.roasAtTime != null && <div className="mt-0.5 text-[10.5px] text-muted2">ROAS no momento: <b className="text-ink">{e.roasAtTime.toFixed(2)}</b></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Barra de ações da campanha — todos os botões ABERTOS lado a lado (padrão do
 *  Gerenciador do Facebook), sem dropdown: a ação fica a 1 clique, não a 2, e
 *  dá pra ver de relance o que existe pra fazer. Itens contextuais (Tracker,
 *  Prova) só aparecem quando há registro pra eles.
 *  Os modais vivem AQUI, fora dos botões, pra não fecharem junto. */
export function ActionsBar({ accId, name, campId, roas, cur, spend, sales, compact }: { accId: string; name: string; campId: string; roas: number | null; cur: string; spend?: number; sales?: number; compact?: boolean }) {
  useLog() // reage ao log: tracker/prova surgem conforme há registro
  const [modal, setModal] = useState<null | 'budget' | 'dup' | 'proof' | 'track' | 'hist' | 'vendas'>(null)

  const dups = duplicationsFor(campId)
  const impDays = impactDays(campId)
  const trackHoje = impDays[0] === todayBR()

  const items: { key: 'budget' | 'dup' | 'proof' | 'track' | 'hist' | 'vendas' | 'log'; icon: string; Icon: typeof DollarSign; label: string; title: string; show: boolean; accent: string }[] = [
    { key: 'budget', icon: '💰', Icon: DollarSign, label: 'Orçamento', title: 'Ajustar orçamento (aumentar ou diminuir)', show: true, accent: 'hover:text-ok' },
    { key: 'vendas', icon: '🕒', Icon: Clock, label: 'Vendas', title: 'Vendas por horário — a hora exata de cada venda', show: true, accent: 'hover:text-ok' },
    { key: 'track', icon: '📈', Icon: TrendingUp, label: 'Tracker', title: trackHoje ? 'Tracker do aumento — medindo o de hoje, ao vivo' : 'Tracker do aumento — antes × depois', show: impDays.length > 0, accent: 'hover:text-brand-2' },
    { key: 'dup', icon: '📋', Icon: Copy, label: 'Duplicar', title: 'Duplicar campanha — cópia idêntica + prova 7d', show: true, accent: 'hover:text-warn' },
    { key: 'hist', icon: '🕐', Icon: History, label: 'Histórico', title: 'Histórico da campanha — o que já fiz nela + cópias', show: true, accent: 'hover:text-brand-2' },
    { key: 'proof', icon: '🔗', Icon: Link2, label: 'Prova', title: 'Prova da duplicação — cópia × original', show: dups.length > 0, accent: 'hover:text-warn' },
    { key: 'log', icon: '✎', Icon: PenLine, label: 'Log', title: 'Registrar ação — anotar no log', show: true, accent: 'hover:text-ink' },
  ]

  function pick(k: (typeof items)[number]['key']) {
    if (k === 'log') { openLog({ accId, name, campId, kind: 'escala', roasAtTime: roas, cur, spendAtTime: spend ?? null, salesAtTime: sales ?? null, dateBR: todayBR() }); return }
    setModal(k)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
        {items.filter((it) => it.show).map((it) =>
          compact ? (
            // linha da tabela: só o ícone (o rótulo virava um muro de texto em 40 linhas)
            <button
              key={it.key}
              onClick={() => pick(it.key)}
              title={it.title}
              className={`rounded p-1 text-muted2 transition-colors hover:bg-surface2 ${it.accent}`}
            >
              <it.Icon className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              key={it.key}
              onClick={() => pick(it.key)}
              title={it.title}
              className={`whitespace-nowrap rounded px-1 py-0.5 text-[10.5px] font-semibold text-muted2 transition-colors hover:bg-surface2 ${it.accent}`}
            >
              <span className="mr-0.5">{it.icon}</span>{it.label}
            </button>
          ),
        )}
      </div>

      {modal === 'budget' && <BudgetModal accId={accId} name={name} campId={campId} cur={cur} onClose={() => setModal(null)} />}
      {modal === 'hist' && <CampHistoryModal accId={accId} name={name} campId={campId} cur={cur} onClose={() => setModal(null)} />}
      {modal === 'vendas' && <SalesTimelineModal name={name} campId={campId} onClose={() => setModal(null)} />}
      {modal === 'dup' && <DuplicateModal accId={accId} name={name} campId={campId} roas={roas} cur={cur} spend={spend} sales={sales} onClose={() => setModal(null)} />}
      {modal === 'proof' && <DupProofModal dups={dups} cur={cur} onClose={() => setModal(null)} />}
      {modal === 'track' && <BudgetTrackerModal accId={accId} name={name} campId={campId} cur={cur} onClose={() => setModal(null)} />}
    </>
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
  roi: number | null
  roas: number | null
  cpa: number | null
  sales: number
  freq: number
  cpm: number
  impr: number
  clicks: number
  ctr: number
  cpc: number
  cpaIC: number | null
  budget: number | null
  updatedTime?: string
  status?: string
  cls: string
  action: ActionResult
  // vendas REAIS do gateway casadas por ID de campanha (null = sem dado real)
  realSales: number | null
  realRevenue: number | null
  realRoas: number | null
  lucroReal: number | null
}

/** Linha da tabela unificada: a mesma ListaRow + de que conta ela veio.
 *  Todos os valores em dinheiro já vêm convertidos pra moeda de exibição. */
export interface TableRow extends ListaRow {
  accId: string
  accName: string
  accCur: string
  key: string // `${accId}::${id}` — é a chave da seleção e das ofertas
}

export function analyzeListaRows(rows: InsightRow[], s: Settings, meta?: Record<string, CampMeta>, level: AdLevel = 'campaign', realMap?: Record<string, RealAgg>, cur?: string, accId?: string): ListaRow[] {
  const FIN = loadFinParamsForAccount(accId)
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
      // real: faturamento do gateway em BRL × gasto convertido (contas USD usam o fx)
      const real = level === 'campaign' ? realMap?.[id] : undefined
      const spendBRL = spend * (cur === 'USD' ? s.fx || 1 : 1)
      const realRoas = real && spendBRL > 0 ? real.revenue / spendBRL : null
      const lucroReal = real
        ? real.revenue * (1 - (FIN.gateway + FIN.imposto) / 100) - spendBRL - real.sales * FIN.custoUn
        : null
      return {
        id,
        name,
        spend,
        revenue,
        lucro,
        margem,
        roi: spend > 0 ? lucro / spend : null,
        roas,
        cpa,
        sales,
        freq: getFreq(r),
        cpm: getCpm(r),
        impr: getImpr(r),
        clicks: parseInt((r.inline_link_clicks as string) || '0') || 0,
        ctr: getCtr(r),
        cpc: getCpc(r),
        cpaIC: getCpaIC(r),
        budget: md?.budget ?? null,
        updatedTime: md?.updatedTime,
        status: md?.status,
        cls: classify(roas, cpa, sales, s),
        action: analyzeAggregate(roas, cpa, sales, s),
        realSales: real ? real.sales : null,
        realRevenue: real ? real.revenue : null,
        realRoas,
        lucroReal,
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
/** Faixa de status como CHIPS numa linha só — os cinco cards grandes comiam ~90px
 *  de altura útil e empurravam a linha de totais da tabela pra fora da tela. */
export function SummaryStrip({ counts }: { counts: Counts }) {
  const m = useMonitor()
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {SUM_ITEMS.map(([code, label, icon, border]) => {
        const sel = m.actionFilter === code
        const n = counts[code]
        return (
          <button
            key={code}
            onClick={() => m.setActionFilter(sel ? null : code)}
            title={`Filtrar: ${label}`}
            className={`flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1 text-[11.5px] transition-all ${border} ${
              sel ? 'ring-2 ring-brand' : 'hover:border-brand/50'
            } ${n === 0 ? 'opacity-50' : ''}`}
          >
            <span className="text-[12px] leading-none">{icon}</span>
            <span className="font-extrabold tabular-nums">{n}</span>
            <span className="text-muted2">{label}</span>
          </button>
        )
      })}
      {m.actionFilter && (
        <button onClick={() => m.setActionFilter(null)} className="ml-1 text-[11px] text-muted2 hover:text-ink">
          ✕ limpar filtro
        </button>
      )}
    </div>
  )
}

/* ── Lista (gerenciador estilo Facebook) ── */
interface TotAgg { spend: number; sales: number; revenue: number; lucro: number; budget: number; realSales: number; realRevenue: number; lucroReal: number; spendBRL: number; impr: number; clicks: number }
const m2 = (v: number | null, sym: string) => (v == null ? '—' : sym + v.toFixed(2))
const int = (v: number) => (v ? v.toLocaleString('pt-BR') : '—')
const pct = (v: number | null) => (v == null ? '—' : (v * 100).toFixed(0) + '%')

interface MetCol {
  key: string
  label: string
  render: (r: ListaRow, sym: string, s: Settings) => ReactNode
  cls?: (r: ListaRow, s: Settings) => string
  total?: (T: TotAgg, sym: string) => ReactNode
  totalCls?: (T: TotAgg, s: Settings) => string
}
const MET_COLS: MetCol[] = [
  { key: 'updatedTime', label: 'Últ. Atualização', render: (r) => fmtEdit(r.updatedTime), cls: () => 'text-muted2 whitespace-nowrap' },
  { key: 'sales', label: 'Vendas', render: (r) => r.sales || '—', total: (T) => T.sales || '—' },
  {
    key: 'budget',
    label: 'Orçamento',
    // valor + "Diário" embaixo, como no gerenciador que ele usa
    render: (r, sym) =>
      r.budget == null ? '—' : (
        <span className="flex flex-col items-end leading-tight">
          <span>{sym}{(r.budget / 100).toFixed(2)}</span>
          <span className="text-[9.5px] font-normal text-muted2">Diário</span>
        </span>
      ),
    total: (T, sym) => (T.budget > 0 ? sym + (T.budget / 100).toFixed(2) : '—'),
  },
  { key: 'cpa', label: 'CPA', render: (r, sym) => m2(r.cpa, sym), cls: (r, s) => (r.cpa == null ? 'text-muted2' : r.cpa <= s.cpaMax ? 'text-ok' : 'text-danger'), total: (T, sym) => (T.sales > 0 ? sym + (T.spend / T.sales).toFixed(2) : '—') },
  { key: 'spend', label: 'Gasto', render: (r, sym) => sym + r.spend.toFixed(2), total: (T, sym) => sym + T.spend.toFixed(2) },
  { key: 'lucro', label: 'Lucro', render: (r, sym) => (r.spend <= 0 ? '—' : (r.lucro >= 0 ? '' : '-') + sym + Math.abs(r.lucro).toFixed(2)), cls: (r) => (r.spend <= 0 ? 'text-muted2' : r.lucro >= 0 ? 'text-ok font-semibold' : 'text-danger font-semibold'), total: (T, sym) => (T.lucro >= 0 ? '' : '-') + sym + Math.abs(T.lucro).toFixed(2), totalCls: (T) => (T.lucro >= 0 ? 'text-ok' : 'text-danger') },
  { key: 'roas', label: 'ROAS', render: (r) => (r.roas != null ? r.roas.toFixed(2) : '—'), cls: (r, s) => 'font-bold ' + VAL_CLS[roasCls(r.roas, s)], total: (T) => { const v = T.spend > 0 ? T.revenue / T.spend : null; return v != null ? v.toFixed(2) : '—' }, totalCls: (T, s) => VAL_CLS[roasCls(T.spend > 0 ? T.revenue / T.spend : null, s)] },
  // colunas REAIS: faturamento do gateway casado por ID de campanha (o que o Meta não vê)
  { key: 'realRoas', label: 'ROAS real', render: (r) => (r.realRoas != null ? r.realRoas.toFixed(2) : '—'), cls: (r, s) => (r.realRoas == null ? 'text-muted2' : 'font-bold ' + VAL_CLS[roasCls(r.realRoas, s)]), total: (T) => { const v = T.spendBRL > 0 && T.realRevenue > 0 ? T.realRevenue / T.spendBRL : null; return v != null ? v.toFixed(2) : '—' }, totalCls: (T, s) => VAL_CLS[roasCls(T.spendBRL > 0 && T.realRevenue > 0 ? T.realRevenue / T.spendBRL : null, s)] },
  { key: 'realSales', label: 'V. reais', render: (r) => r.realSales ?? '—', cls: (r) => (r.realSales != null && r.realSales !== r.sales ? 'text-brand-2 font-semibold' : ''), total: (T) => T.realSales || '—' },
  { key: 'lucroReal', label: 'Lucro real', render: (r) => (r.lucroReal == null ? '—' : (r.lucroReal >= 0 ? '' : '-') + 'R$' + Math.abs(r.lucroReal).toFixed(2)), cls: (r) => (r.lucroReal == null ? 'text-muted2' : r.lucroReal >= 0 ? 'text-ok font-semibold' : 'text-danger font-semibold'), total: (T) => (T.lucroReal >= 0 ? '' : '-') + 'R$' + Math.abs(T.lucroReal).toFixed(2), totalCls: (T) => (T.lucroReal >= 0 ? 'text-ok' : 'text-danger') },
  { key: 'cpaIC', label: 'CPI', render: (r, sym) => m2(r.cpaIC, sym), cls: () => 'text-muted2' },
  { key: 'cpc', label: 'CPC', render: (r, sym) => (r.cpc ? m2(r.cpc, sym) : '—'), cls: () => 'text-muted2' },
  { key: 'ctr', label: 'CTR', render: (r) => (r.ctr ? r.ctr.toFixed(2) + '%' : '—'), cls: () => 'text-muted2' },
  { key: 'freq', label: 'Frequência', render: (r, _sym, s) => (r.freq ? r.freq.toFixed(2) : '—') + (r.freq >= s.freqWarn ? ' 🔥' : ''), cls: (r, s) => (r.freq >= s.freqWarn ? 'text-warn' : 'text-muted2') },
  { key: 'margem', label: 'Margem', render: (r) => (r.revenue > 0 ? (r.margem * 100).toFixed(0) + '%' : '—'), cls: (r) => (r.spend <= 0 || r.revenue <= 0 ? 'text-muted2' : r.margem >= 0 ? 'text-muted' : 'text-danger') },
  { key: 'revenue', label: 'Faturamento', render: (r, sym) => (r.revenue > 0 ? sym + r.revenue.toFixed(2) : '—'), total: (T, sym) => sym + T.revenue.toFixed(2) },
  { key: 'roi', label: 'ROI', render: (r) => (r.spend > 0 ? pct(r.roi) : '—'), cls: (r) => (r.spend <= 0 || r.roi == null ? 'text-muted2' : r.roi >= 0 ? 'text-ok' : 'text-danger'), total: (T) => (T.spend > 0 ? pct(T.lucro / T.spend) : '—'), totalCls: (T) => (T.spend > 0 && T.lucro >= 0 ? 'text-ok' : 'text-danger') },
  { key: 'cpm', label: 'CPM', render: (r, sym) => (r.cpm ? sym + r.cpm.toFixed(2) : '—'), cls: () => 'text-muted2', total: (T, sym) => (T.impr > 0 ? sym + ((T.spend / T.impr) * 1000).toFixed(2) : '—') },
  { key: 'impr', label: 'Impressões', render: (r) => int(r.impr), cls: () => 'text-muted2', total: (T) => int(T.impr) },
  { key: 'clicks', label: 'Cliques', render: (r) => int(r.clicks), cls: () => 'text-muted2', total: (T) => int(T.clicks) },
]
const MET_BY_KEY: Record<string, MetCol> = Object.fromEntries(MET_COLS.map((c) => [c.key, c]))

/* config de colunas (ordem + largura) salva no navegador */
/* v2: a ordem padrão passou a ser a do gerenciador (Últ. Atualização → Vendas →
   Orçamento → CPA → Gastos → Lucro → ROAS…). Chave nova pra não herdar a ordem
   antiga salva, que jogaria as colunas novas pro fim da tabela. */
const COLCFG_KEY = 'monitor_colcfg_v2'
const DEF_ORDER = MET_COLS.map((c) => c.key)
const DEF_W = 96
/* Larguras padrão por coluna: 96px cortava data/hora e faturamento no meio. */
const COL_DEF_W: Record<string, number> = {
  updatedTime: 118,
  revenue: 110,
  lucroReal: 110,
  impr: 104,
  clicks: 86,
  budget: 104,
  margem: 84,
  ctr: 78,
  roi: 78,
  freq: 100,
  sales: 80,
}
const defW = (key: string) => COL_DEF_W[key] || DEF_W
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

/* Larguras padrão das colunas FIXAS (nome/status/aumento). Elas moram no mesmo
 * colCfg das métricas, então "↺ resetar colunas" também as devolve ao padrão. */
const FIXED_W: Record<string, number> = { name: 330, status: 92, aumento: 96 }
export const colW = (cfg: ColCfg, key: string) => cfg.w[key] || FIXED_W[key] || defW(key)

/** Alça de redimensionar: arrasta a borda direita da coluna. Vale pras métricas
 *  e (agora) também pras colunas fixas — antes só as métricas esticavam. */
function ResizeHandle({ colKey }: { colKey: string }) {
  const start = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startW = colW(getColCfg(), colKey)
    const move = (ev: MouseEvent) => {
      const cur = getColCfg()
      setColCfg({ ...cur, w: { ...cur.w, [colKey]: Math.max(54, startW + (ev.clientX - startX)) } })
    }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }
  return <span onMouseDown={start} title="arraste pra redimensionar" className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand/50" />
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
    const startX = e.clientX, startW = getColCfg().w[key] || defW(key)
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
        const w = cfg.w[key] || defW(key)
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
        const w = cfg.w[key] || defW(key)
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
        const w = cfg.w[key] || defW(key)
        return (
          <td key={key} style={{ width: w }} className={`px-3 py-2.5 text-right font-mono tabular-nums ${c.total ? (c.totalCls ? c.totalCls(T, s) : '') : 'text-muted2'}`}>
            {c.total ? c.total(T, sym) : '—'}
          </td>
        )
      })}
    </>
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

function SortTh({ label, sortKey, sort, onSort, align = 'right', width }: { label: string; sortKey: string; sort: Sort; onSort: (k: string) => void; align?: 'left' | 'right'; width?: number }) {
  const active = sort?.key === sortKey
  return (
    <th
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
      className={`relative select-none whitespace-nowrap py-2 ${align === 'left' ? 'pl-3 text-left' : 'px-2 text-right'} ${active ? 'text-brand-2' : ''}`}
    >
      <span onClick={() => onSort(sortKey)} className="cursor-pointer hover:text-ink">
        {label}
        {active ? (sort!.dir === 'desc' ? ' ▼' : ' ▲') : ''}
      </span>
      {width != null && <ResizeHandle colKey={sortKey} />}
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

/* ── Colunas fixas da esquerda ──
 * Checkbox · Status · Campanha ficam grudadas enquanto a tabela rola pro lado.
 * Elas precisam de fundo SÓLIDO próprio: com position:sticky o fundo da <tr> não
 * pinta embaixo delas e o conteúdo passaria por trás. */
const STICKY_W = 38
const stickyBg = (sel: boolean, neon: boolean) =>
  neon ? 'bg-[#231e1e]' : sel ? 'bg-[#16182d]' : 'bg-surface group-hover:bg-surface2'
const HEAD_BG = 'bg-[#151827]'
const FOOT_BG = 'bg-[#171a28]'

const LEVEL_NOUN: Record<AdLevel, [string, string]> = {
  campaign: ['campanha', 'campanhas'],
  adset: ['conjunto', 'conjuntos'],
  ad: ['anúncio', 'anúncios'],
}

export function ListaView({ items }: { items: CacheItem[] }) {
  const m = useMonitor()
  const cfg = useColCfg() // larguras das colunas (métricas + fixas)
  const s = m.settings
  const [sort, setSort] = useState<Sort>(null)
  const onSort = (key: string) => setSort((p) => (p?.key === key ? (p.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }))
  useLog() // "Mexidas hoje" reage assim que eu aumento/duplico
  const touched = m.touchedOnly ? touchedIds() : null

  const errs = items.filter((i) => i.kind === 'err')
  const lists = items.filter((i) => i.kind === 'lista' && i.rows)

  /* Moeda de exibição: uma tabela só, várias contas. Se as contas misturam moeda,
     tudo é convertido pra US$ pelo câmbio dos parâmetros — mesma regra da aba Por
     Oferta, pra não somar real com dólar na linha de total. */
  const curs = [...new Set(lists.map((i) => i.acc.cur))]
  const mixed = curs.length > 1
  const dispCur = mixed ? 'USD' : curs[0] || 'USD'
  const sym = curSym(dispCur)
  const fxTo = (c: string) => (mixed && c === 'BRL' ? 1 / (s.fx || 1) : 1)
  const realFx = dispCur === 'BRL' ? 1 : 1 / (s.fx || 1) // gateway devolve BRL

  const all: TableRow[] = useMemo(() => {
    const out: TableRow[] = []
    lists.forEach((item) => {
      const f = fxTo(item.acc.cur)
      const scale = (v: number | null) => (v == null ? null : v * f)
      analyzeListaRows(item.rows!, s, item.meta, m.level, m.realMap, item.acc.cur, item.acc.id).forEach((r) => {
        out.push({
          ...r,
          spend: r.spend * f,
          revenue: r.revenue * f,
          lucro: r.lucro * f,
          cpa: scale(r.cpa),
          cpc: r.cpc * f,
          cpm: r.cpm * f,
          cpaIC: scale(r.cpaIC),
          budget: scale(r.budget),
          realRevenue: r.realRevenue == null ? null : r.realRevenue * realFx,
          lucroReal: r.lucroReal == null ? null : r.lucroReal * realFx,
          accId: item.acc.id,
          accName: item.acc.name,
          accCur: item.acc.cur,
          key: `${item.acc.id}::${r.id}`,
        })
      })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, s, m.level, m.realMap, mixed])

  // Ofertas são grupos de CAMPANHAS — em conjuntos/anúncios o filtro não se aplica.
  const offerSet = useMemo(
    () => (m.level === 'campaign' ? offerMemberSet(m.offerFilter) : null),
    [m.offerFilter, m.level],
  )
  const nf = m.nameFilter.trim().toLowerCase()

  let rows = all.filter(
    (r) =>
      (!m.actionFilter || r.action.code === m.actionFilter) &&
      (!nf || r.name.toLowerCase().includes(nf)) &&
      (!touched || touched.has(r.id)) &&
      (!offerSet || offerSet.has(r.key)) &&
      (!m.onlySelected || !m.campSel.size || m.campSel.has(r.key)),
  )
  rows = sortRows(rows, sort) as TableRow[]

  const rowKeys = rows.map((r) => r.key)
  const allSel = rowKeys.length > 0 && rowKeys.every((k) => m.campSel.has(k))
  const T = rows.reduce<TotAgg>(
    (a, r) => ({
      spend: a.spend + r.spend,
      sales: a.sales + r.sales,
      revenue: a.revenue + r.revenue,
      lucro: a.lucro + r.lucro,
      budget: a.budget + (r.budget || 0),
      realSales: a.realSales + (r.realSales || 0),
      realRevenue: a.realRevenue + (r.realRevenue || 0),
      lucroReal: a.lucroReal + (r.lucroReal || 0),
      spendBRL: a.spendBRL + r.spend * (dispCur === 'BRL' ? 1 : s.fx || 1),
      impr: a.impr + r.impr,
      clicks: a.clicks + r.clicks,
    }),
    { spend: 0, sales: 0, revenue: 0, lucro: 0, budget: 0, realSales: 0, realRevenue: 0, lucroReal: 0, spendBRL: 0, impr: 0, clicks: 0 },
  )

  // A coluna "Aumento" só existe quando ALGUMA linha tem aumento registrado —
  // fora isso é uma coluna de traços ocupando espaço à toa.
  const showAumento = m.level === 'campaign' && rows.some((r) => impactDays(r.id).length > 0)

  const [noun, nounPl] = LEVEL_NOUN[m.level]
  const nameW = colW(cfg, 'name')
  const statusW = colW(cfg, 'status')
  const L2 = STICKY_W // onde começa a coluna Status
  const L3 = STICKY_W + statusW // onde começa a coluna Campanha

  return (
    <div>
      {errs.map((item, idx) => (
        <div key={idx} className="mx-4 mb-3 rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-3 text-[13px]">
          ❌ <b>{item.acc.name}:</b> {item.msg}
        </div>
      ))}

      {mixed && (
        <div className="border-b border-border bg-warn/[0.06] px-4 py-2 text-[11.5px] text-warn">
          Contas com moedas diferentes na mesma tabela — os valores em real foram convertidos pra US$ pelo câmbio {s.fx} dos parâmetros.
        </div>
      )}

      {!rows.length ? (
        <div className="px-4 py-14 text-center">
          <p className="text-[13px] font-semibold text-muted">Nenhum resultado com esses filtros</p>
          <p className="mt-1 text-[12px] text-muted2">Afrouxe o nome, o status ou o período e clique em Atualizar.</p>
        </div>
      ) : (
        /* altura amarrada à janela pra que a linha de TOTAIS (sticky no rodapé da
           caixa) caia dentro da tela — com vh fixo ela vivia abaixo da dobra */
        <div className="max-h-[calc(100vh-370px)] min-h-[300px] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr className={`${HEAD_BG} text-[10.5px] font-semibold uppercase tracking-wide text-muted2`}>
                <th style={{ width: STICKY_W, minWidth: STICKY_W, left: 0 }} className={`sticky top-0 z-40 border-b border-r border-border py-2.5 text-center ${HEAD_BG}`}>
                  <Checkbox checked={allSel} onChange={(next) => m.selectMany(rowKeys, next)} title="Selecionar todas visíveis" />
                </th>
                <th style={{ width: statusW, minWidth: statusW, left: L2 }} className={`sticky top-0 z-40 border-b border-r border-border px-2 py-2.5 text-left ${HEAD_BG}`}>
                  <span className="relative">Status<ResizeHandle colKey="status" /></span>
                </th>
                <th style={{ width: nameW, minWidth: nameW, left: L3 }} className={`sticky top-0 z-40 border-b border-r border-border px-3 py-2.5 text-left ${HEAD_BG}`}>
                  <span onClick={() => onSort('name')} className="cursor-pointer hover:text-ink">
                    {m.level === 'campaign' ? 'Campanha' : m.level === 'adset' ? 'Conjunto' : 'Anúncio'}
                    {sort?.key === 'name' ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </span>
                  <ResizeHandle colKey="name" />
                </th>
                {showAumento && (
                  <th style={{ width: colW(cfg, 'aumento'), minWidth: colW(cfg, 'aumento') }} className={`sticky top-0 z-30 border-b border-r border-border px-2 py-2.5 text-center ${HEAD_BG}`} title="Antes → depois do aumento de orçamento de hoje">
                    <span className="relative">Aumento<ResizeHandle colKey="aumento" /></span>
                  </th>
                )}
                <MetHead sort={sort} onSort={onSort} />
                <th className={`sticky top-0 z-30 border-b border-border px-3 py-2.5 text-left ${HEAD_BG}`}>Veredito</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowWithExpand key={r.key} r={r} sym={sym} leftStatus={L2} leftName={L3} showAumento={showAumento} />
              ))}
            </tbody>
            <tfoot>
              <tr className={`text-[11px] font-bold ${FOOT_BG}`}>
                <td style={{ left: 0 }} className={`sticky bottom-0 left-0 z-40 border-r border-t-2 border-border px-3 py-2.5 ${FOOT_BG}`} />
                <td style={{ left: L2 }} className={`sticky bottom-0 z-40 border-r border-t-2 border-border px-2 py-2.5 ${FOOT_BG}`} />
                <td style={{ left: L3 }} className={`sticky bottom-0 z-40 whitespace-nowrap border-r border-t-2 border-border px-3 py-2.5 text-left text-muted ${FOOT_BG}`}>
                  {rows.length} {rows.length > 1 ? nounPl : noun}
                </td>
                {showAumento && <td className={`sticky bottom-0 z-30 border-r border-t-2 border-border px-2 py-2.5 ${FOOT_BG}`} />}
                <MetFoot T={T} sym={sym} s={s} />
                <td className={`sticky bottom-0 z-30 border-t-2 border-border px-3 py-2.5 ${FOOT_BG}`} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted2">
        <span>Arraste os títulos pra reordenar · puxe a borda direita pra redimensionar · clique pra ordenar</span>
        {sort && (
          <button onClick={() => setSort(null)} className="text-muted hover:text-ink">✕ limpar ordenação ({sort.key})</button>
        )}
      </div>
    </div>
  )
}

/* ── Aba "Contas": as mesmas métricas somadas por conta de anúncio ──
 * Vem do mesmo cache das campanhas (nenhuma chamada extra) — é o resumo de
 * "onde estou gastando e o que está voltando" antes de abrir campanha por campanha. */
export function ContasView({ items }: { items: CacheItem[] }) {
  const m = useMonitor()
  const s = m.settings
  const lists = items.filter((i) => i.kind === 'lista' && i.rows)
  const curs = [...new Set(lists.map((i) => i.acc.cur))]
  const mixed = curs.length > 1
  const dispCur = mixed ? 'USD' : curs[0] || 'USD'
  const sym = curSym(dispCur)
  const realFx = dispCur === 'BRL' ? 1 : 1 / (s.fx || 1)

  const accs = lists
    .map((item) => {
      const f = mixed && item.acc.cur === 'BRL' ? 1 / (s.fx || 1) : 1
      const rows = analyzeListaRows(item.rows!, s, item.meta, m.level, m.realMap, item.acc.cur, item.acc.id)
      const t = rows.reduce(
        (a, r) => ({
          spend: a.spend + r.spend * f,
          revenue: a.revenue + r.revenue * f,
          lucro: a.lucro + r.lucro * f,
          sales: a.sales + r.sales,
          budget: a.budget + (r.budget || 0) * f,
          realSales: a.realSales + (r.realSales || 0),
          realRevenue: a.realRevenue + (r.realRevenue || 0) * realFx,
          impr: a.impr + r.impr,
          ativas: a.ativas + (r.status === 'ACTIVE' ? 1 : 0),
        }),
        { spend: 0, revenue: 0, lucro: 0, sales: 0, budget: 0, realSales: 0, realRevenue: 0, impr: 0, ativas: 0 },
      )
      return { acc: item.acc, n: rows.length, ...t }
    })
    .sort((a, b) => b.spend - a.spend)

  const G = accs.reduce(
    (a, x) => ({
      spend: a.spend + x.spend, revenue: a.revenue + x.revenue, lucro: a.lucro + x.lucro, sales: a.sales + x.sales,
      budget: a.budget + x.budget, realSales: a.realSales + x.realSales, realRevenue: a.realRevenue + x.realRevenue, n: a.n + x.n, ativas: a.ativas + x.ativas,
    }),
    { spend: 0, revenue: 0, lucro: 0, sales: 0, budget: 0, realSales: 0, realRevenue: 0, n: 0, ativas: 0 },
  )

  if (!accs.length)
    return <div className="px-4 py-14 text-center text-[13px] text-muted">Sem dados — clique em Atualizar.</div>

  const money = (v: number) => (v < 0 ? '-' : '') + sym + Math.abs(v).toFixed(2)
  const cell = 'border-b border-border2 px-3 py-3 text-right font-mono tabular-nums'

  return (
    <div className="overflow-x-auto">
      {mixed && (
        <div className="border-b border-border bg-warn/[0.06] px-4 py-2 text-[11.5px] text-warn">
          Moedas diferentes — real convertido pra US$ pelo câmbio {s.fx}.
        </div>
      )}
      <table className="w-full border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr className={`${HEAD_BG} text-[10.5px] font-semibold uppercase tracking-wide text-muted2`}>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-left ${HEAD_BG}`}>Conta</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>Campanhas</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>Orçamento</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>Gastos</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>Vendas</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>Faturamento</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>Lucro</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>ROAS</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>CPA</th>
            <th className={`sticky top-0 z-20 border-b border-border px-3 py-2.5 text-right ${HEAD_BG}`}>V. reais</th>
          </tr>
        </thead>
        <tbody>
          {accs.map((a) => {
            const roas = a.spend > 0 ? a.revenue / a.spend : null
            return (
              <tr key={a.acc.id} className="transition-colors hover:bg-surface2/40">
                <td className="border-b border-border2 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                    <span className="font-semibold text-ink">{a.acc.name}</span>
                    <span className="text-[10px] text-muted2">{a.acc.cur}</span>
                  </div>
                </td>
                <td className={`${cell} text-muted`}>
                  {a.n}
                  {a.ativas > 0 && <span className="ml-1 text-[10px] text-ok">({a.ativas} ativas)</span>}
                </td>
                <td className={`${cell} text-muted`}>{a.budget > 0 ? money(a.budget / 100) : '—'}</td>
                <td className={cell}>{money(a.spend)}</td>
                <td className={cell}>{a.sales || '—'}</td>
                <td className={`${cell} text-muted`}>{a.revenue > 0 ? money(a.revenue) : '—'}</td>
                <td className={`${cell} font-semibold ${a.lucro >= 0 ? 'text-ok' : 'text-danger'}`}>{money(a.lucro)}</td>
                <td className={`${cell} font-bold ${VAL_CLS[roasCls(roas, s)]}`}>{roas != null ? roas.toFixed(2) : '—'}</td>
                <td className={`${cell} ${a.sales > 0 && a.spend / a.sales <= s.cpaMax ? 'text-ok' : a.sales > 0 ? 'text-danger' : 'text-muted2'}`}>
                  {a.sales > 0 ? money(a.spend / a.sales) : '—'}
                </td>
                <td className={`${cell} ${a.realSales ? 'text-brand-2' : 'text-muted2'}`}>{a.realSales || '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className={`text-[11px] font-bold ${FOOT_BG}`}>
            <td className="border-t-2 border-border px-3 py-2.5 text-muted">{accs.length} conta{accs.length > 1 ? 's' : ''}</td>
            <td className="border-t-2 border-border px-3 py-2.5 text-right font-mono text-muted">{G.n}</td>
            <td className="border-t-2 border-border px-3 py-2.5 text-right font-mono text-muted">{G.budget > 0 ? money(G.budget / 100) : '—'}</td>
            <td className="border-t-2 border-border px-3 py-2.5 text-right font-mono">{money(G.spend)}</td>
            <td className="border-t-2 border-border px-3 py-2.5 text-right font-mono">{G.sales || '—'}</td>
            <td className="border-t-2 border-border px-3 py-2.5 text-right font-mono text-muted">{money(G.revenue)}</td>
            <td className={`border-t-2 border-border px-3 py-2.5 text-right font-mono ${G.lucro >= 0 ? 'text-ok' : 'text-danger'}`}>{money(G.lucro)}</td>
            <td className={`border-t-2 border-border px-3 py-2.5 text-right font-mono ${VAL_CLS[roasCls(G.spend > 0 ? G.revenue / G.spend : null, s)]}`}>
              {G.spend > 0 ? (G.revenue / G.spend).toFixed(2) : '—'}
            </td>
            <td className="border-t-2 border-border px-3 py-2.5 text-right font-mono">{G.sales > 0 ? money(G.spend / G.sales) : '—'}</td>
            <td className="border-t-2 border-border px-3 py-2.5 text-right font-mono text-brand-2">{G.realSales || '—'}</td>
          </tr>
        </tfoot>
      </table>
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
  const fin = loadFinParamsForAccount(accId)
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
      {/* ação: aumentar orçamento (a foto do "antes" é congelada pelo próprio modal) */}
      <div className="flex shrink-0 items-center gap-1.5">
        <BudgetBtn accId={accId} name={name} campId={campId} cur={cur} />
        <TrackerBtn accId={accId} name={name} campId={campId} cur={cur} />
      </div>
    </div>
  )
}

function RowWithExpand({ r, sym, leftStatus, leftName, showAumento }: { r: TableRow; sym: string; leftStatus: number; leftName: number; showAumento: boolean }) {
  const m = useMonitor()
  const cfg = useColCfg() // as células precisam da MESMA largura do cabeçalho
  const acc = { id: r.accId, name: r.accName, cur: r.accCur }
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
          const { lucro, margem } = rowFin(spend, revenue, sales, loadFinParamsForAccount(acc.id))
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
            roi: spend > 0 ? lucro / spend : null,
            freq: 0,
            cpm: 0,
            impr: 0,
            clicks: 0,
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

  const key = r.key
  const neon = m.neonKeys.has(key)
  const sel = m.campSel.has(key)
  const bg = stickyBg(sel, neon)
  const nameW = colW(cfg, 'name')
  const statusW = colW(cfg, 'status')
  const adsUrl =
    m.level === 'ad'
      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${acc.id}&selected_ad_ids=${r.id}`
      : m.level === 'adset'
        ? `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${acc.id}&selected_adset_ids=${r.id}`
        : campUrl(acc.id, r.id)
  const cellBase = 'border-b border-border2/70 py-2.5'

  return (
    <>
      <tr style={neon ? NEON_STYLE : undefined} className="group align-middle transition-colors hover:bg-surface2">
        <td style={{ left: 0 }} className={`sticky left-0 z-20 border-r border-border2/70 text-center ${cellBase} ${bg}`}>
          <Checkbox checked={sel} onChange={() => m.toggleCamp(key)} />
        </td>

        {/* STATUS: o switch liga/desliga na Meta, e a bolinha ao lado é o veredito
            de performance (verde/vermelho) — duas coisas diferentes, lado a lado. */}
        <td style={{ width: statusW, minWidth: statusW, left: leftStatus }} className={`sticky z-20 border-r border-border2/70 px-2 ${cellBase} ${bg}`}>
          <div className="flex items-center gap-2">
            <StatusSwitch accId={acc.id} entityId={r.id} name={r.name} status={r.status} cur={acc.cur} level={m.level} />
            <span title={`Performance: ${r.action.detail || r.cls}`}><ClsDot cls={r.cls} /></span>
          </div>
        </td>

        <td style={{ width: nameW, minWidth: nameW, maxWidth: nameW, left: leftName }} className={`sticky z-20 border-r border-border2/70 px-3 ${cellBase} ${bg}`}>
          <div className="flex items-start gap-1.5">
            <span className="line-clamp-2 min-w-0 flex-1 break-words leading-snug text-ink" title={r.name}>
              {r.name}
            </span>
            <a href={adsUrl} target="_blank" className="mt-0.5 shrink-0 text-muted2 hover:text-brand-2" title="Abrir no Gerenciador de Anúncios">
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {/* Conta de origem à esquerda e ações à direita, na MESMA faixa: a linha
              não cresce por causa dos botões, e eles só acendem no hover — no
              repouso a tabela é só nome e número, que é o que se lê de relance. */}
          <div className="mt-0.5 flex h-[22px] items-center gap-2">
            <span className="min-w-0 shrink truncate text-[10px] uppercase tracking-wide text-muted2" title={acc.name}>
              {acc.name}
            </span>
            {m.level === 'campaign' && (
              <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  onClick={() => setScaleOpen((v) => !v)}
                  title="Escala — lucro de hoje e dos últimos dias"
                  className={`rounded p-1 transition-colors hover:bg-surface2 ${scaleOpen ? 'text-ok' : 'text-muted2 hover:text-ok'}`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={toggle}
                  title="Criativos — anúncios desta campanha"
                  className={`rounded p-1 transition-colors hover:bg-surface2 ${open ? 'text-brand-2' : 'text-muted2 hover:text-brand-2'}`}
                >
                  <Layers className="h-3.5 w-3.5" />
                </button>
                <ActionsBar accId={acc.id} name={r.name} campId={r.id} roas={r.roas} cur={acc.cur} spend={r.spend} sales={r.sales} compact />
              </div>
            )}
          </div>
        </td>

        {showAumento && (
          <td style={{ width: colW(cfg, 'aumento'), minWidth: colW(cfg, 'aumento') }} className={`border-r border-border2/70 px-2 ${cellBase}`}>
            <TrackerCell accId={acc.id} name={r.name} campId={r.id} cur={acc.cur} empty={<span className="text-[11px] text-muted2">—</span>} />
          </td>
        )}
        <MetCells r={r} sym={sym} s={m.settings} />
        {/* só o veredito fica na direita — os botões migraram pra baixo do nome */}
        <td className={`px-3 ${cellBase}`}>
          <div className="flex items-center gap-1.5">
            <Badge a={r.action} />
            {m.level === 'campaign' && <ScaleBadge campId={r.id} />}
          </div>
        </td>
      </tr>
      {scaleOpen && (
        <tr className="bg-bg/40">
          <td colSpan={30} className="border-b border-border p-0">
            <ScalePanel accId={acc.id} campId={r.id} name={r.name} sym={sym} cur={acc.cur} />
          </td>
        </tr>
      )}
      {open && (
        <tr className="bg-bg/40">
          <td colSpan={30} className="p-0">
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

/* ── Célula "Histórico" (resumo do que já foi feito na campanha) ──
 * Em cima: o tracker do aumento de HOJE (antes → depois, ao vivo) quando existe.
 * Embaixo: chips do que já rolou (última mexida, duplicada / é cópia) — clicar
 * abre a timeline completa (CampHistoryModal). */
function HistCell({ accId, campId, name, cur }: { accId: string; campId: string; name: string; cur: string }) {
  useLog()
  const [open, setOpen] = useState(false)
  const last = lastScale(campId)
  const incs = budgetIncreases(campId, 90)
  const dups = duplicationsFor(campId)
  const copias = dups.filter((e) => e.linkedTo === campId) // aqui é a original
  const ehCopia = dups.find((e) => e.campId === campId)    // aqui é a cópia
  const days = last ? Math.floor((Date.now() - new Date(last.ts).getTime()) / 86400000) : 0
  const kindShort = last?.kind === 'orcamento' ? 'orçam.' : last?.kind === 'escala' ? 'escala' : 'mexida'
  const vazio = !last && copias.length === 0 && !ehCopia

  return (
    <div className="flex min-w-[130px] flex-col items-start gap-1">
      <TrackerCell accId={accId} name={name} campId={campId} cur={cur} />
      <button
        onClick={() => setOpen(true)}
        title="Ver histórico completo desta campanha"
        className="flex flex-col items-start gap-1.5 text-left text-[12px] leading-tight hover:opacity-70"
      >
        {vazio && <span className="text-muted2">— <span className="text-[11px] text-muted2/70">sem mexidas</span></span>}
        {last && (
          <span className="text-muted">↑ {kindShort} {days === 0 ? 'hoje' : days + 'd'}{incs.length > 1 ? ` · ${incs.length}×` : ''}</span>
        )}
        {copias.length > 0 && (
          <span className="font-medium text-warn">duplicada {dmFmt(copias[0].dateBR || todayBR(new Date(copias[0].ts)))}{copias.length > 1 ? ` (${copias.length})` : ''}</span>
        )}
        {ehCopia && <span className="font-medium text-warn">é cópia</span>}
      </button>
      {open && <CampHistoryModal accId={accId} name={name} campId={campId} cur={cur} onClose={() => setOpen(false)} />}
    </div>
  )
}

/* Sequência de dias COM VENDA terminando numa data-âncora, contando pra trás.
 * Ex.: âncora 22/06 → conta 22, 21, 20… enquanto teve venda; para no primeiro
 * dia sem venda (ou sem dados). len = tamanho da sequência; roas = ROAS acumulado
 * da sequência (desempate: quem vende consistente E lucra fica no topo);
 * days = datas que formam a sequência (pra destacar as células). */
function salesStreak(
  dates: Record<string, { roas: number | null; sales: number; spend: number }>,
  allDates: string[],
  anchor: string,
): { len: number; roas: number | null; days: Set<string> } {
  const idx = allDates.indexOf(anchor)
  const days = new Set<string>()
  if (idx < 0) return { len: 0, roas: null, days }
  let len = 0, spend = 0, rev = 0
  for (let i = idx; i >= 0; i--) {
    const d = allDates[i]
    const day = dates[d]
    if (day && day.sales > 0) {
      len++; days.add(d); spend += day.spend; rev += (day.roas ?? 0) * day.spend
    } else break
  }
  return { len, roas: spend > 0 ? rev / spend : null, days }
}

/* Colunas configuráveis do Histórico (o usuário liga/desliga e escolhe o lado).
 * Status vem DESLIGADO por padrão (fica só a cor dos dias); Histórico LIGADO. */
const HISTCOLS_KEY = 'monitor_histcols_v1'
interface HistCols { status: boolean; hist: boolean; pos: 'left' | 'right' }
const DEF_HISTCOLS: HistCols = { status: false, hist: true, pos: 'right' }
function readHistCols(): HistCols {
  try { return { ...DEF_HISTCOLS, ...JSON.parse(localStorage.getItem(HISTCOLS_KEY) || '{}') } }
  catch { return { ...DEF_HISTCOLS } }
}

/* ── Histórico ── */
export function HistoricoView({ items }: { items: CacheItem[] }) {
  const m = useMonitor()
  const s = m.settings
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  useLog()
  const touched = m.touchedOnly ? touchedIds() : null
  const [cols, setCols] = useState<HistCols>(readHistCols)
  useEffect(() => { localStorage.setItem(HISTCOLS_KEY, JSON.stringify(cols)) }, [cols])
  const toggleCol = (k: 'status' | 'hist') => setCols((c) => ({ ...c, [k]: !c[k] }))
  // data-âncora do ordenamento por sequência de vendas (clique no cabeçalho da data)
  const [streakAnchor, setStreakAnchor] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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

        {/* controle de colunas: liga/desliga Histórico e Status + escolhe o lado */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-[9px] border border-border bg-[#0a0c19] px-2 py-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted2">Colunas</span>
          <button
            onClick={() => toggleCol('hist')}
            title="Mostrar/ocultar a coluna Histórico (o que já fiz na campanha)"
            className={`rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold transition-colors ${cols.hist ? 'border-brand bg-brand/15 text-brand-2' : 'border-border text-muted2 hover:text-ink'}`}
          >
            {cols.hist ? '✓ ' : ''}Histórico
          </button>
          <button
            onClick={() => toggleCol('status')}
            title="Mostrar/ocultar a coluna Status (recomendação automática)"
            className={`rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold transition-colors ${cols.status ? 'border-brand bg-brand/15 text-brand-2' : 'border-border text-muted2 hover:text-ink'}`}
          >
            {cols.status ? '✓ ' : ''}Status
          </button>
          {(cols.hist || cols.status) && (
            <>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <button
                onClick={() => setCols((c) => ({ ...c, pos: c.pos === 'left' ? 'right' : 'left' }))}
                title="De que lado das datas essas colunas ficam"
                className="rounded-[6px] border border-border px-2 py-0.5 text-[11px] font-medium text-muted hover:text-ink"
              >
                {cols.pos === 'left' ? '⟵ antes das datas' : 'depois das datas ⟶'}
              </button>
            </>
          )}
        </div>

        {streakAnchor ? (
          <button onClick={() => setStreakAnchor(null)} className="rounded-[6px] border border-brand/40 bg-brand/10 px-2 py-1 text-[11px] font-semibold text-brand-2 hover:bg-brand/20">
            🔥 ordenado por vendas seguidas até {dmFmt(streakAnchor)} · ✕ limpar
          </button>
        ) : (
          <span className="text-[11px] text-muted2">💡 clique numa <b className="text-muted">data</b> pra ordenar pelas campanhas com mais vendas seguidas até aquele dia</span>
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
        // âncora do streak só vale se a data existe nesta conta
        const anchor = streakAnchor && item.dates.includes(streakAnchor) ? streakAnchor : null
        const camps = Object.entries(item.campMap)
          .map(([cid, camp]) => ({
            cid,
            camp,
            action: analyzeAction(camp.dates, item.dates!, s),
            st: anchor ? salesStreak(camp.dates, item.dates!, anchor) : null,
          }))
          .filter(
            (x) =>
              (!m.actionFilter || x.action.code === m.actionFilter) &&
              (!touched || touched.has(x.cid)) &&
              (!m.onlySelected || !m.campSel.size || m.campSel.has(`${item.acc.id}::${x.cid}`)) &&
              (!ql || (x.camp.name || '').toLowerCase().includes(ql)),
          )
        if (anchor)
          camps.sort((a, b) => (b.st!.len - a.st!.len) || ((b.st!.roas ?? -1) - (a.st!.roas ?? -1)))
        if (!camps.length) return null
        const rowKeys = camps.map((x) => `${item.acc.id}::${x.cid}`)
        const allSel = rowKeys.length > 0 && rowKeys.every((k) => m.campSel.has(k))
        return (
          <div key={idx}>
            <div className="mb-2 flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 rounded-full bg-brand" />
              <span className="font-bold">{item.acc.name}</span>
            </div>
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted2">
                    <th className="w-9 py-3 text-center">
                      <Checkbox checked={allSel} onChange={(next) => m.selectMany(rowKeys, next)} title="Selecionar todas visíveis" />
                    </th>
                    <th className="py-3 pl-1 text-left">Campanha</th>
                    {cols.pos === 'left' && cols.status && <th className="px-3 py-3 text-left">Status</th>}
                    {cols.pos === 'left' && cols.hist && <th className="px-3 py-3 text-left">Histórico</th>}
                    {item.dates!.map((d) => {
                      const active = streakAnchor === d
                      return (
                        <th
                          key={d}
                          onClick={() => setStreakAnchor((a) => (a === d ? null : d))}
                          title={`Ordenar pelas campanhas com mais vendas seguidas até ${d}`}
                          className={`cursor-pointer select-none px-1.5 py-3 text-center font-medium transition-colors hover:text-ink ${active ? 'bg-brand/10 text-brand-2' : ''}`}
                        >
                          {fmtDate(d)}{active ? ' 🔥' : ''}
                        </th>
                      )
                    })}
                    {cols.pos === 'right' && cols.status && <th className="px-3 py-3 text-left">Status</th>}
                    {cols.pos === 'right' && cols.hist && <th className="px-3 py-3 text-left">Histórico</th>}
                  </tr>
                </thead>
                <tbody>
                  {camps.map(({ cid, camp, action, st }) => {
                    const key = `${item.acc.id}::${cid}`
                    const sel = m.campSel.has(key)
                    const neon = m.neonKeys.has(key)
                    return (
                    <tr key={cid} style={neon ? NEON_STYLE : undefined} className={`border-b border-border2 transition-colors ${neon ? 'relative bg-warn/[0.08]' : sel ? 'bg-brand/[0.07]' : 'hover:bg-surface2/25'}`}>
                      <td className="py-3.5 text-center">
                        <Checkbox checked={sel} onChange={() => m.toggleCamp(key)} />
                      </td>
                      <td className="py-3.5 pl-1 pr-2">
                        <div className="flex items-start gap-1.5">
                          {st && st.len > 0 && (
                            <span className="mt-px shrink-0 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-2" title={`${st.len} dia(s) seguidos com venda até ${streakAnchor}${st.roas != null ? ` · ROAS ${st.roas.toFixed(2)} na sequência` : ''}`}>
                              🔥{st.len}
                            </span>
                          )}
                          <span className="min-w-[190px] max-w-[340px] whitespace-normal break-words leading-snug text-ink" title={camp.name}>
                            {camp.name}
                          </span>
                          <a href={campUrl(item.acc.id, cid)} target="_blank" className="mt-0.5 shrink-0 text-muted2 hover:text-brand-2" title="Abrir no Ads Manager">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {!cols.hist && <ScaleBadge campId={cid} />}
                        </div>
                        {/* ações abertas embaixo do nome (padrão do Gerenciador) */}
                        <div className="mt-1">
                          <ActionsBar accId={item.acc.id} name={camp.name} campId={cid} roas={null} cur={item.acc.cur} />
                        </div>
                      </td>
                      {cols.pos === 'left' && cols.status && <td className="px-3 py-3.5"><Badge a={action} /></td>}
                      {cols.pos === 'left' && cols.hist && <td className="px-3 py-3.5"><HistCell accId={item.acc.id} campId={cid} name={camp.name} cur={item.acc.cur} /></td>}
                      {item.dates!.map((d) => {
                        const day = camp.dates[d]
                        if (!day)
                          return (
                            <td key={d} className="px-1.5 py-3.5 text-center text-muted2">·</td>
                          )
                        const cls = classify(day.roas, day.cpa, day.sales, s)
                        const bg = { good: 'bg-ok/[0.07]', bad: 'bg-danger/[0.07]', warn: 'bg-warn/[0.06]', none: '' }[cls]
                        const inStreak = st?.days.has(d)
                        return (
                          <td
                            key={d}
                            style={inStreak ? { boxShadow: 'inset 0 -2px 0 rgba(139,124,255,.7)' } : undefined}
                            className={`px-1.5 py-3.5 text-center ${bg} ${inStreak ? 'bg-brand/[0.08]' : ''}`}
                            title={`ROAS ${day.roas !== null ? day.roas.toFixed(2) : '—'} · ${day.sales} venda(s) · gasto $${day.spend.toFixed(2)}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {cls !== 'none' && <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${CLS_DOT[cls]}`} />}
                              <span className={`font-mono text-[11px] tabular-nums ${CLS_TXT[cls]}`}>
                                {day.roas !== null ? day.roas.toFixed(2) : '—'}
                              </span>
                              {/* nº de vendas do dia em sobrescrito, colado no ROAS: cabe na
                                  mesma célula (não vira coluna nem empurra layout) e responde
                                  "esse ROAS veio de quantas vendas?" — 6.68 de 1 venda ≠ de 10. */}
                              {day.sales > 0 && (
                                <span className="-ml-0.5 self-start font-mono text-[8.5px] font-semibold leading-[1.15] text-muted2">{day.sales}</span>
                              )}
                            </span>
                          </td>
                        )
                      })}
                      {cols.pos === 'right' && cols.status && <td className="px-3 py-3.5"><Badge a={action} /></td>}
                      {cols.pos === 'right' && cols.hist && <td className="px-3 py-3.5"><HistCell accId={item.acc.id} campId={cid} name={camp.name} cur={item.acc.cur} /></td>}
                    </tr>
                    )
                  })}
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
