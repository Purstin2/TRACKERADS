import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, Search, X, Pause, Play, AlertTriangle, DollarSign, History, ChevronRight,
  CheckSquare, Square, ArrowUpDown, Filter, Check, Zap,
} from 'lucide-react'
import { useLog, addAction, todayBR, KIND_LABEL } from '@/modules/monitor/actionLog'
import { campIdFromUtm } from '@/modules/monitor/realRoas'
import { supabase, fetchAll } from '@/lib/supabase'
import { resolvePeriod, type PeriodValue } from './period'

/* Campanhas no celular — construído em cima de DOIS fluxos reais:
 *
 * 1) MADRUGADA (limpeza): janela de 4 dias, ordena por ROAS, marca tudo, liga
 *    "só as marcadas" e vai DESMARCANDO as boas — elas somem da tela. Sobram as
 *    ruins; troca o período (hoje/ontem/anteontem) e repete. O que sobrar ruim
 *    em todas as janelas é desativado DE UMA VEZ.
 *
 * 2) ESCALA (manhã): ordena por VENDAS DE HOJE, pega quem tem 2+ vendas e ROAS
 *    bom, sobe orçamento pelo botão do próprio card. Depois volta com o filtro
 *    "mexi no orçamento" pra ver se o aumento deu lucro, e sobe de novo.
 *
 * Por isso a seleção é múltipla e o filtro "só as marcadas" existe: sem ele a
 * lista não afunila e o fluxo da madrugada não fecha no celular.
 *
 * O ROAS grande do card é o REAL (venda do gateway ÷ gasto), não o do Meta — é
 * nele que a decisão de orçamento se apoia. O do Meta fica pequeno embaixo.
 *
 * O token NÃO vem pro browser: quem fala com a Meta é /api/mobile. */

const brl = (v?: number | null) =>
  'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brlCurto = (v?: number | null) => {
  const n = v || 0
  return n >= 1000 ? 'R$ ' + (n / 1000).toFixed(1).replace('.', ',') + 'k' : brl(n)
}

const STATUS: [string, string][] = [
  ['active', 'Ativas'],
  ['active_paused', 'Ativas + pausadas'],
  ['all', 'Tudo'],
]
type Ordem = 'roas' | 'vendas' | 'gasto' | 'orcamento'
const ORDENS: [Ordem, string][] = [
  ['roas', 'ROAS real'],
  ['vendas', 'Vendas hoje'],
  ['gasto', 'Gasto'],
  ['orcamento', 'Orçamento'],
]

interface Row {
  id: string; name: string; accId: string; accName: string
  spend: number; roas: number | null; sales: number; cpa: number | null
  revenue: number; freq: number; budget: number | null; status: string | null
}
interface Params { roasGood: number; roasBe: number; cpaMax: number; fx: number }
/** vendas REAIS do gateway, por campanha */
interface Real { sales: number; revenue: number; salesHoje: number; revenueHoje: number }

const SEL =
  'h-[42px] w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink focus:border-brand focus:outline-none'

/* ── detalhe: ajuste fino do orçamento + histórico (o card já resolve o comum) ── */
function Detalhe({ r, onClose, onBudget }: { r: Row; onClose: () => void; onBudget: (novo: number) => void }) {
  const log = useLog()
  const [aba, setAba] = useState<'orc' | 'hist'>('orc')
  const [info, setInfo] = useState<any>(null)
  const [dias, setDias] = useState<any[] | null>(null)
  const [pct, setPct] = useState(20)
  const [abs, setAbs] = useState('')
  const [modo, setModo] = useState<'pct' | 'abs'>('pct')
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => {
    fetch(`/api/mobile?fn=camp-budget&id=${r.id}`).then((x) => x.json()).then(setInfo).catch(() => setInfo({ ok: false }))
    fetch(`/api/mobile?fn=camp-daily&id=${r.id}&acc=${r.accId}&dias=7`).then((x) => x.json())
      .then((j) => setDias(j.ok ? j.dias : [])).catch(() => setDias([]))
  }, [r.id, r.accId])

  const atual = info?.ok ? info.totalMoeda : null
  const novo = modo === 'abs' ? parseFloat(abs || '0') : atual != null ? atual * (1 + pct / 100) : 0
  const meu = useMemo(() => log.filter((e) => e.campId === r.id).slice(0, 12), [log, r.id])

  async function aplicar() {
    if (!(novo > 0) || atual == null) return
    setAplicando(true)
    try {
      const j = await (await fetch('/api/mobile?fn=camp-budget', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, novoTotal: novo }),
      })).json()
      if (!j.ok && j.error) alert('Erro: ' + j.error)
      else {
        addAction({
          accId: r.accId, name: r.name, campId: r.id, kind: 'orcamento', sim: false,
          cur: 'BRL', roasAtTime: r.roas, spendAtTime: r.spend, salesAtTime: r.sales,
          dateBR: todayBR(), budgetBefore: j.antes, budgetAfter: j.depois,
          detail: `${modo === 'pct' ? (pct >= 0 ? '+' : '') + pct + '%' : 'valor fixo'} (${j.nivel}) · pelo celular`,
        })
        onBudget(j.depois)
        if (j.effective_status && j.effective_status !== 'ACTIVE') {
          alert(`⚠ Orçamento aplicado, mas a campanha está "${j.effective_status}". Reative se não foi você.`)
        }
        onClose()
      }
    } catch (e: any) { alert('Erro: ' + e.message) }
    setAplicando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[14px] font-extrabold leading-snug">{r.name}</div>
            <div className="mt-0.5 text-[11.5px] text-muted2">{r.accName}</div>
          </div>
          <button onClick={onClose} className="shrink-0 text-muted2"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex overflow-hidden rounded-[10px] border border-border">
          {([['orc', 'Orçamento', DollarSign], ['hist', 'Histórico', History]] as const).map(([id, lb, Ic]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-bold ${aba === id ? 'bg-brand text-white' : 'text-muted2'}`}>
              <Ic className="h-4 w-4" /> {lb}
            </button>
          ))}
        </div>

        {aba === 'orc' ? (
          !info ? <div className="py-8 text-center text-[12.5px] text-muted2">carregando orçamento…</div>
          : !info.ok ? <div className="rounded-[10px] border border-danger/30 bg-danger/[0.07] p-3 text-[12.5px] text-danger">{info.error || 'não consegui ler o orçamento'}</div>
          : (
            <>
              <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface2 px-3.5 py-3 text-[13px]">
                <span className="text-muted2">Atual ({info.nivel}{info.nivel === 'ABO' ? ` · ${info.itens.length} conj.` : ''})</span>
                <b className="font-mono">{brl(atual)}/dia</b>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[-30, -20, -10, 10, 20, 30, 50, 100].map((q) => (
                  <button key={q} onClick={() => { setModo('pct'); setPct(q) }}
                    className={`rounded-[9px] border py-2.5 text-[12.5px] font-bold ${modo === 'pct' && pct === q ? (q < 0 ? 'border-danger bg-danger/15 text-danger' : 'border-ok bg-ok/15 text-ok') : 'border-border text-muted'}`}>
                    {q > 0 ? '+' : ''}{q}%
                  </button>
                ))}
              </div>
              <input type="number" inputMode="decimal" value={abs} placeholder={`ou valor fixo (${brl(atual)})`}
                onChange={(e) => { setModo('abs'); setAbs(e.target.value) }}
                className={`mt-2 h-[44px] w-full rounded-[10px] border bg-surface px-3 text-[13px] text-ink focus:outline-none ${modo === 'abs' ? 'border-ok/60' : 'border-border'}`} />
              <div className={`mt-2 flex items-center justify-between rounded-[10px] border px-3.5 py-3 ${novo >= (atual || 0) ? 'border-ok/30 bg-ok/[0.06]' : 'border-warn/30 bg-warn/[0.06]'}`}>
                <span className="text-[12.5px] text-muted">Novo orçamento</span>
                <b className={`font-mono text-[15px] ${novo >= (atual || 0) ? 'text-ok' : 'text-warn'}`}>{brl(novo)}/dia</b>
              </div>
              <button onClick={aplicar} disabled={aplicando || !(novo > 0)}
                className="mt-3 w-full rounded-[10px] border border-ok/50 bg-ok/15 py-3.5 text-[13.5px] font-bold text-ok active:scale-[0.99] disabled:opacity-50">
                {aplicando ? 'Aplicando…' : 'Aplicar na Meta'}
              </button>
            </>
          )
        ) : (
          <>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted2">Últimos 7 dias</div>
            {!dias ? <div className="py-6 text-center text-[12.5px] text-muted2">carregando…</div>
            : dias.length === 0 ? <div className="py-6 text-center text-[12.5px] text-muted2">sem dados no período</div>
            : (
              <div className="flex flex-col gap-1">
                {dias.map((d) => (
                  <div key={d.dia} className="flex items-center gap-2 rounded-[9px] border border-border bg-surface2/50 px-3 py-2 text-[12.5px]">
                    <span className="w-[46px] shrink-0 font-mono text-muted2">{d.dia.slice(8)}/{d.dia.slice(5, 7)}</span>
                    <span className={`w-[52px] shrink-0 font-bold ${d.roas == null ? 'text-muted2' : d.roas >= 2 ? 'text-ok' : d.roas < 1.25 ? 'text-danger' : 'text-warn'}`}>
                      {d.roas != null ? d.roas.toFixed(2) : '—'}
                    </span>
                    <span className="flex-1 text-right text-muted">{brl(d.spend)}</span>
                    <span className="w-[36px] shrink-0 text-right text-ink">{d.sales || '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted2">O que já fiz nela</div>
            {meu.length === 0 ? (
              <div className="rounded-[9px] border border-dashed border-border py-5 text-center text-[12px] text-muted2">
                nenhuma alteração registrada
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {meu.map((e) => (
                  <div key={e.id} className="rounded-[9px] border border-border bg-surface2/50 px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px] text-muted2">
                      <span className="font-bold text-brand-2">{KIND_LABEL[e.kind] || e.kind}</span>
                      <span className="font-mono">{new Date(e.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      {e.budgetBefore != null && e.budgetAfter != null && (
                        <span className="ml-auto font-mono text-ink">{e.budgetBefore.toFixed(0)}→{e.budgetAfter.toFixed(0)}</span>
                      )}
                    </div>
                    {e.detail && <div className="mt-0.5 text-[11.5px] text-muted">{e.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function MobileCamps({ periodo }: { periodo: PeriodValue }) {
  const log = useLog()
  const [status, setStatus] = useState('active')
  const [acc, setAcc] = useState('')
  const [busca, setBusca] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [ordem, setOrdem] = useState<Ordem>('roas')
  const [asc, setAsc] = useState(false)
  const [soMarcadas, setSoMarcadas] = useState(false)
  const [soMexidas, setSoMexidas] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Row[]>([])
  const [real, setReal] = useState<Record<string, Real>>({})
  const [contas, setContas] = useState<{ id: string; name: string }[]>([])
  const [params, setParams] = useState<Params | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [orcando, setOrcando] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Row | null>(null)
  const [confirmarLote, setConfirmarLote] = useState(false)
  const [detalhe, setDetalhe] = useState<Row | null>(null)
  const [flash, setFlash] = useState<Record<string, string>>({})

  const jan = useMemo(() => resolvePeriod(periodo), [periodo])

  /** vendas REAIS do gateway na janela + no dia de hoje, por campanha */
  async function carregarReal(): Promise<Record<string, Real>> {
    const sb = supabase()
    if (!sb) return {}
    const hojeIni = resolvePeriod({ id: 'today' }).sinceISO
    const desde = jan.sinceISO < hojeIni ? jan.sinceISO : hojeIni
    try {
      const orders = await fetchAll<{ utm_campaign: string | null; value: number | null; ordered_at: string | null }>(
        (from, to) =>
          sb.from('kirvano_orders')
            .select('utm_campaign,value,ordered_at')
            .eq('status', 'APPROVED')
            .gte('ordered_at', desde)
            .order('ordered_at', { ascending: false })
            .range(from, to),
      )
      const map: Record<string, Real> = {}
      for (const o of orders) {
        const id = campIdFromUtm(o.utm_campaign)
        if (!id || !o.ordered_at) continue
        const cur = map[id] || (map[id] = { sales: 0, revenue: 0, salesHoje: 0, revenueHoje: 0 })
        const v = o.value || 0
        if (o.ordered_at >= jan.sinceISO && o.ordered_at < jan.untilISO) { cur.sales += 1; cur.revenue += v }
        if (o.ordered_at >= hojeIni) { cur.salesHoje += 1; cur.revenueHoje += v }
      }
      return map
    } catch {
      return {}   // sem vendas reais o card cai no ROAS do Meta
    }
  }

  async function carregar() {
    setLoading(true)
    try {
      const q = new URLSearchParams({ fn: 'camps', status, ...jan.apiParams })
      if (acc) q.set('acc', acc)
      const [resp, mapaReal] = await Promise.all([
        fetch(`/api/mobile?${q}`).then((r) => r.json()),
        carregarReal(),
      ])
      setReal(mapaReal)
      if (!resp.ok) { setReason(resp.reason || 'falha ao carregar'); setRows([]) }
      else {
        setReason('')
        setRows(resp.rows || [])
        setContas(resp.contas || [])
        setParams(resp.params || null)
        setErros(resp.erros || [])
      }
    } catch (e: any) { setReason(e.message) }
    setLoading(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodo, status, acc])

  /* ── o que eu já mexi (log local, sem chamada extra) ── */
  const mexi = useMemo(() => {
    const lim = Date.now() - 7 * 86400000
    const hoje0 = new Date(resolvePeriod({ id: 'today' }).sinceISO).getTime()
    const m: Record<string, { n: number; ultima: number; delta: string | null; hoje: boolean }> = {}
    for (const e of log) {
      if (e.kind !== 'orcamento' || !e.campId) continue
      const t = new Date(e.ts).getTime()
      if (t < lim) continue
      const cur = m[e.campId] || (m[e.campId] = { n: 0, ultima: 0, delta: null, hoje: false })
      cur.n += 1
      if (t > cur.ultima) {
        cur.ultima = t
        cur.delta = e.budgetBefore != null && e.budgetAfter != null
          ? `${e.budgetBefore.toFixed(0)}→${e.budgetAfter.toFixed(0)}`
          : e.detail || null
      }
      if (t >= hoje0) cur.hoje = true
    }
    return m
  }, [log])

  const enriquecidas = useMemo(() => rows.map((r) => {
    const rl: Real | null = real[r.id] || null
    const roasReal = rl && r.spend > 0 ? rl.revenue / r.spend : null
    return {
      ...r,
      real: rl,
      roasReal,
      // o que manda na decisão: o real quando existe, senão o do Meta
      roasDecisao: roasReal != null ? roasReal : r.roas,
      vendasReais: rl ? rl.sales : r.sales,
    }
  }), [rows, real])

  type Enr = typeof enriquecidas[number]

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    let out: Enr[] = enriquecidas
    if (b) out = out.filter((r) => r.name.toLowerCase().includes(b))
    if (soMarcadas) out = out.filter((r) => marcadas.has(r.id))
    if (soMexidas) out = out.filter((r) => !!mexi[r.id])
    const dir = asc ? 1 : -1
    const val = (r: Enr) =>
      ordem === 'roas' ? (r.roasDecisao == null ? -1 : r.roasDecisao)
      : ordem === 'vendas' ? (r.real ? r.real.salesHoje : 0)
      : ordem === 'gasto' ? r.spend
      : (r.budget == null ? -1 : r.budget)
    return [...out].sort((a, b2) => (val(a) - val(b2)) * dir)
  }, [enriquecidas, busca, soMarcadas, soMexidas, marcadas, mexi, ordem, asc])

  const T = useMemo(() => filtradas.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      sales: a.sales + (r.real ? r.real.sales : r.sales),
      revenue: a.revenue + (r.real ? r.real.revenue : r.revenue),
    }),
    { spend: 0, sales: 0, revenue: 0 },
  ), [filtradas])
  const roasTot = T.spend > 0 ? T.revenue / T.spend : null

  const corRoas = (v: number | null) => {
    if (v == null || !params) return 'text-muted2'
    if (v >= params.roasGood) return 'text-ok'
    if (v < params.roasBe) return 'text-danger'
    return 'text-warn'
  }
  const ativa = (s: string | null) => (s || '').toUpperCase() === 'ACTIVE'
  const marcadasAtivas = useMemo(
    () => enriquecidas.filter((r) => marcadas.has(r.id) && ativa(r.status)),
    [enriquecidas, marcadas],
  )

  function toggle(id: string) {
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  const marcarTodas = () => setMarcadas(new Set(filtradas.map((r) => r.id)))
  const limpar = () => { setMarcadas(new Set()); setSoMarcadas(false) }

  async function mudarStatus(r: Row, novo: 'ACTIVE' | 'PAUSED') {
    setAgindo(r.id)
    try {
      const j = await (await fetch('/api/mobile?fn=camp-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, status: novo }),
      })).json()
      if (!j.ok) alert('Erro: ' + (j.error || 'falha'))
      else {
        const st = j.effective_status || novo
        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: st } : x)))
        if (j.effective_status && j.effective_status !== novo) {
          alert(`A Meta aplicou "${j.effective_status}" (você pediu ${novo}).`)
        }
      }
    } catch (e: any) { alert('Erro: ' + e.message) }
    setAgindo(null)
    setConfirmar(null)
  }

  /** desativa TODAS as marcadas — é o que fecha o fluxo da madrugada */
  async function desativarLote() {
    const alvo = marcadasAtivas
    setConfirmarLote(false)
    for (const r of alvo) {
      setAgindo(r.id)
      try {
        const j = await (await fetch('/api/mobile?fn=camp-action', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: r.id, status: 'PAUSED' }),
        })).json()
        if (j.ok) {
          const st = j.effective_status || 'PAUSED'
          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: st } : x)))
          addAction({
            accId: r.accId, name: r.name, campId: r.id, kind: 'pause', sim: false,
            cur: 'BRL', roasAtTime: r.roas, spendAtTime: r.spend, salesAtTime: r.sales,
            dateBR: todayBR(), detail: `desativada em lote (${jan.label}) · celular`,
          })
        }
      } catch { /* uma falha não pode travar as outras */ }
    }
    setAgindo(null)
    setMarcadas(new Set())
  }

  /** aumento/redução direto no card: lê o orçamento atual e aplica */
  async function ajusteRapido(r: Row, pct: number) {
    setOrcando(r.id)
    try {
      const info = await (await fetch(`/api/mobile?fn=camp-budget&id=${r.id}`)).json()
      if (!info || !info.ok || !(info.totalMoeda > 0)) {
        alert('Não consegui ler o orçamento atual dessa campanha.')
        setOrcando(null); return
      }
      const novo = info.totalMoeda * (1 + pct / 100)
      const j = await (await fetch('/api/mobile?fn=camp-budget', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, novoTotal: novo }),
      })).json()
      if (!j.ok) { alert('Erro: ' + (j.error || 'falha')); setOrcando(null); return }
      addAction({
        accId: r.accId, name: r.name, campId: r.id, kind: 'orcamento', sim: false,
        cur: 'BRL', roasAtTime: r.roas, spendAtTime: r.spend, salesAtTime: r.sales,
        dateBR: todayBR(), budgetBefore: j.antes, budgetAfter: j.depois,
        detail: `${pct > 0 ? '+' : ''}${pct}% (${j.nivel}) · card do celular`,
      })
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, budget: j.depois } : x)))
      // confirmação VISÍVEL: sem isso não dá pra saber se o aumento pegou
      const antes = j.antes != null ? Number(j.antes).toFixed(0) : '?'
      const depois = j.depois != null ? Number(j.depois).toFixed(0) : '?'
      setFlash((f) => ({ ...f, [r.id]: `orçamento ${antes} → ${depois} aplicado` }))
      setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[r.id]; return n }), 10000)
      if (j.effective_status && j.effective_status !== 'ACTIVE') {
        alert(`⚠ Orçamento aplicado, mas a campanha está "${j.effective_status}".`)
      }
    } catch (e: any) { alert('Erro: ' + e.message) }
    setOrcando(null)
  }

  const nMarcadas = marcadas.size
  const chip = (ativo: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-bold transition active:scale-[0.97] ${
      ativo ? 'border-brand bg-brand text-white' : 'border-border bg-surface text-muted'
    }`

  return (
    <>
      {/* resumo do período */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface2 p-5 shadow-card-sm">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-muted2">
          {jan.label} · {filtradas.length} campanha{filtradas.length === 1 ? '' : 's'}
          {Object.keys(real).length > 0 && <span className="ml-1.5 text-ok">· roas real</span>}
        </div>
        <div className={`mt-1 text-[38px] font-extrabold leading-none ${corRoas(roasTot)}`}>
          {roasTot != null ? roasTot.toFixed(2) + '×' : '—'}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
          <span>gasto <b className="text-warn">{brl(T.spend)}</b></span>
          <span>retorno <b className="text-ok">{brl(T.revenue)}</b></span>
          <span>vendas <b className="text-ink">{T.sales}</b></span>
        </div>
      </div>

      {/* ordenar + filtros rápidos, tudo em chip de 1 toque */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={() => setAsc((v) => !v)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-bold text-muted active:scale-[0.97]">
          <ArrowUpDown className="h-3.5 w-3.5" />{asc ? 'menor' : 'maior'}
        </button>
        {ORDENS.map(([id, lb]) => (
          <button key={id} onClick={() => setOrdem(id)} className={chip(ordem === id)}>{lb}</button>
        ))}
        <button onClick={() => setSoMarcadas((v) => !v)} className={chip(soMarcadas)}>
          Só marcadas{nMarcadas > 0 ? ` (${nMarcadas})` : ''}
        </button>
        <button onClick={() => setSoMexidas((v) => !v)} className={chip(soMexidas)}>
          <Zap className="mr-1 inline h-3.5 w-3.5" />Mexi no orçamento
        </button>
        <button onClick={() => setFiltrosAbertos((v) => !v)} className={chip(filtrosAbertos)}>
          <Filter className="mr-1 inline h-3.5 w-3.5" />Mais
        </button>
      </div>

      {filtrosAbertos && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl2 border border-border bg-surface p-3">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={SEL}>
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted2">Conta</label>
          <select value={acc} onChange={(e) => setAcc(e.target.value)} className={SEL}>
            <option value="">Todas as contas</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome"
              className="h-[44px] w-full rounded-[10px] border border-border bg-surface pl-9 pr-9 text-[13px] text-ink focus:border-brand focus:outline-none" />
            {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted2"><X className="h-4 w-4" /></button>}
          </div>
        </div>
      )}

      {/* barra de seleção — o motor do fluxo da madrugada */}
      <div className="mt-2 flex items-center gap-1.5">
        <button onClick={marcarTodas}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface2 py-2.5 text-[12.5px] font-semibold active:scale-[0.99]">
          <CheckSquare className="h-4 w-4 text-brand-2" /> Marcar as {filtradas.length}
        </button>
        {nMarcadas > 0 && (
          <>
            <button onClick={limpar}
              className="flex items-center gap-1.5 rounded-[10px] border border-border bg-surface2 px-3 py-2.5 text-[12.5px] font-semibold text-muted active:scale-[0.99]">
              <X className="h-4 w-4" /> Limpar
            </button>
            <button onClick={() => setConfirmarLote(true)} disabled={marcadasAtivas.length === 0}
              className="flex items-center gap-1.5 rounded-[10px] border border-danger/45 bg-danger/[0.12] px-3 py-2.5 text-[12.5px] font-bold text-danger active:scale-[0.99] disabled:opacity-40">
              <Pause className="h-4 w-4" /> Desativar {marcadasAtivas.length}
            </button>
          </>
        )}
        <button onClick={carregar} disabled={loading}
          className="flex items-center justify-center rounded-[10px] border border-border bg-surface2 px-3 py-2.5 active:scale-[0.99]">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {reason && (
        <div className="mt-3 rounded-xl2 border border-warn/30 bg-warn/[0.07] px-3.5 py-3 text-[12.5px] text-warn">{reason}</div>
      )}
      {erros.map((e, i) => (
        <div key={i} className="mt-2 flex items-start gap-2 rounded-xl2 border border-danger/25 bg-danger/[0.06] px-3.5 py-2.5 text-[11.5px] text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
        </div>
      ))}

      {/* lista */}
      <div className="mt-3 flex flex-col gap-2">
        {loading && rows.length === 0 ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[168px] animate-pulse rounded-xl2 border border-border bg-surface" />)
        ) : filtradas.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
            {soMarcadas && nMarcadas === 0 ? 'Nada marcado — desligue "Só marcadas".' : 'Nenhuma campanha com esses filtros.'}
          </div>
        ) : (
          filtradas.map((r) => {
            const on = ativa(r.status)
            const mk = marcadas.has(r.id)
            const mx = mexi[r.id]
            return (
              <div key={`${r.accId}-${r.id}`}
                className={`rounded-xl2 border bg-surface p-3.5 transition ${mk ? 'border-brand/60 ring-1 ring-brand/25' : 'border-border'}`}>
                {/* topo: marcar + nome + ROAS que decide */}
                <div className="flex items-start gap-2.5">
                  <button onClick={() => toggle(r.id)} className="mt-0.5 shrink-0 active:scale-90" aria-label="marcar campanha">
                    {mk ? <CheckSquare className="h-6 w-6 text-brand" /> : <Square className="h-6 w-6 text-muted2" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted2">
                      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-ok' : 'bg-muted2'}`} />
                      {r.accName}{r.status && ` · ${on ? 'ativa' : r.status.toLowerCase()}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-[24px] font-extrabold leading-none ${corRoas(r.roasDecisao)}`}>
                      {r.roasDecisao != null ? r.roasDecisao.toFixed(2) : '—'}
                    </div>
                    <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted2">
                      {r.roasReal != null ? 'roas real' : 'roas meta'}
                    </div>
                    {r.roasReal != null && r.roas != null && (
                      <div className="text-[9.5px] text-muted2">meta {r.roas.toFixed(2)}</div>
                    )}
                  </div>
                </div>

                {/* os números da decisão */}
                <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-border/60 pt-2.5 text-center">
                  {[
                    ['Gasto', brlCurto(r.spend), 'text-warn'],
                    ['Vendas hoje', String(r.real ? r.real.salesHoje : 0), 'text-ink'],
                    ['No período', String(r.vendasReais || 0), 'text-ink'],
                    ['Orçam.', r.budget != null ? brlCurto(r.budget) : '—', 'text-muted'],
                  ].map(([k, v, cls]) => (
                    <div key={k}>
                      <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted2">{k}</div>
                      <div className={`mt-0.5 text-[12.5px] font-bold ${cls}`}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* confirmação do ajuste que acabei de fazer */}
                {flash[r.id] && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-[9px] border border-ok/40 bg-ok/[0.12] px-3 py-2 text-[12px] font-bold text-ok">
                    <Check className="h-4 w-4 shrink-0" /> {flash[r.id]}
                  </div>
                )}

                {/* o que eu já mexi nela */}
                {mx && !flash[r.id] && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-[9px] border border-brand/25 bg-brand/[0.07] px-3 py-1.5 text-[11.5px] text-brand-2">
                    <Zap className="h-3.5 w-3.5 shrink-0" />
                    mexi {mx.n}× em 7d{mx.delta ? ` · ${mx.delta}` : ''}{mx.hoje ? ' · hoje' : ''}
                  </div>
                )}

                {/* ajuste rápido de orçamento */}
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[-20, 20, 30, 50].map((q) => (
                    <button key={q} onClick={() => ajusteRapido(r, q)} disabled={orcando === r.id}
                      className={`rounded-[9px] border py-2.5 text-[12.5px] font-bold active:scale-[0.97] disabled:opacity-40 ${
                        q < 0 ? 'border-danger/40 bg-danger/10 text-danger' : 'border-ok/40 bg-ok/10 text-ok'
                      }`}>
                      {orcando === r.id ? '…' : `${q > 0 ? '+' : ''}${q}%`}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => setDetalhe(r)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface2/60 py-2.5 text-[12px] font-semibold text-muted active:scale-[0.99]">
                    <DollarSign className="h-3.5 w-3.5 text-ok" /> Ajuste fino
                    <History className="h-3.5 w-3.5 text-brand-2" />
                    <ChevronRight className="h-4 w-4 text-muted2" />
                  </button>
                  <button onClick={() => (on ? setConfirmar(r) : mudarStatus(r, 'ACTIVE'))} disabled={agindo === r.id}
                    className={`flex items-center justify-center gap-1.5 rounded-[10px] border px-4 py-2.5 text-[12.5px] font-bold active:scale-[0.99] disabled:opacity-50 ${
                      on ? 'border-danger/40 bg-danger/10 text-danger' : 'border-ok/40 bg-ok/10 text-ok'
                    }`}>
                    {agindo === r.id ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : on ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {detalhe && (
        <Detalhe r={detalhe} onClose={() => setDetalhe(null)}
          onBudget={(novo) => setRows((prev) => prev.map((x) => (x.id === detalhe.id ? { ...x, budget: novo } : x)))} />
      )}

      {/* confirmação de pausa individual */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setConfirmar(null)}>
          <div className="w-full max-w-[460px] rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-extrabold">Pausar esta campanha?</div>
            <div className="mt-1.5 line-clamp-3 text-[13px] text-muted">{confirmar.name}</div>
            <div className="mt-2 text-[12px] text-muted2">
              ROAS {confirmar.roas != null ? confirmar.roas.toFixed(2) : '—'} · gasto {brl(confirmar.spend)} · {confirmar.sales} venda{confirmar.sales === 1 ? '' : 's'} no período
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmar(null)} className="flex-1 rounded-[10px] border border-border py-3 text-[13px] font-bold text-muted active:scale-[0.99]">Cancelar</button>
              <button onClick={() => mudarStatus(confirmar, 'PAUSED')} className="flex-1 rounded-[10px] border border-danger/50 bg-danger/15 py-3 text-[13px] font-bold text-danger active:scale-[0.99]">Pausar</button>
            </div>
          </div>
        </div>
      )}

      {/* confirmação do lote — desativar várias de uma vez pede lista na cara */}
      {confirmarLote && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setConfirmarLote(false)}>
          <div className="w-full max-w-[460px] rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-extrabold">Desativar {marcadasAtivas.length} campanha(s)?</div>
            <div className="mt-2 max-h-[34vh] overflow-y-auto rounded-[10px] border border-border bg-surface2/50 p-2.5">
              {marcadasAtivas.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-1 text-[11.5px]">
                  <span className={`w-[42px] shrink-0 font-bold ${corRoas(r.roasDecisao)}`}>
                    {r.roasDecisao != null ? r.roasDecisao.toFixed(2) : '—'}
                  </span>
                  <span className="line-clamp-1 flex-1 text-muted">{r.name}</span>
                  <span className="shrink-0 font-mono text-muted2">{brlCurto(r.spend)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmarLote(false)} className="flex-1 rounded-[10px] border border-border py-3 text-[13px] font-bold text-muted active:scale-[0.99]">Cancelar</button>
              <button onClick={desativarLote} className="flex-1 rounded-[10px] border border-danger/50 bg-danger/15 py-3 text-[13px] font-bold text-danger active:scale-[0.99]">Desativar todas</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
