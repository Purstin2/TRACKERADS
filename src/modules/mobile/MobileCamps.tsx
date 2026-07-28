import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, X, Pause, Play, AlertTriangle, SlidersHorizontal, DollarSign, History, ChevronRight } from 'lucide-react'
import { useLog, addAction, todayBR, KIND_LABEL } from '@/modules/monitor/actionLog'

/* Campanhas no celular — mesma leitura do Monitor do desktop, mas em cartões e
 * com alvo de toque grande. O token NÃO vem pro browser: quem fala com a Meta é
 * /api/mobile (lê meta_tok do app_state), então funciona em qualquer aparelho
 * sem colar token. Pausar pede confirmação — num celular o toque errado é fácil. */

const brl = (v?: number | null) =>
  'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PERIODOS: [string, string][] = [
  ['today', 'Hoje'],
  ['yesterday', 'Ontem'],
  ['day_before_yesterday', 'Anteontem'],
  ['last_4d', 'Últimos 4 dias'],
  ['last_7d', 'Últimos 7 dias'],
  ['last_14d', 'Últimos 14 dias'],
  ['last_30d', 'Últimos 30 dias'],
]
const STATUS: [string, string][] = [
  ['active', 'Apenas ativas'],
  ['active_paused', 'Ativas + pausadas'],
  ['all', 'Tudo'],
]

interface Row {
  id: string; name: string; accId: string; accName: string
  spend: number; roas: number | null; sales: number; cpa: number | null
  revenue: number; freq: number; budget: number | null; status: string | null
}
interface Params { roasGood: number; roasBe: number; cpaMax: number; fx: number }

const SEL =
  'h-[42px] w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink focus:border-brand focus:outline-none'

/* Detalhe da campanha: orçamento (mesmo ajuste do desktop) + histórico
 * (dia a dia da Meta + o que eu já fiz nela, que vem do log sincronizado). */
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

export default function MobileCamps() {
  const [preset, setPreset] = useState('last_7d')
  const [status, setStatus] = useState('active')
  const [acc, setAcc] = useState('')
  const [busca, setBusca] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [contas, setContas] = useState<{ id: string; name: string }[]>([])
  const [params, setParams] = useState<Params | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Row | null>(null)
  const [detalhe, setDetalhe] = useState<Row | null>(null)

  async function carregar() {
    setLoading(true)
    try {
      const q = new URLSearchParams({ fn: 'camps', preset, status })
      if (acc) q.set('acc', acc)
      const j = await (await fetch(`/api/mobile?${q}`)).json()
      if (!j.ok) { setReason(j.reason || 'falha ao carregar'); setRows([]) }
      else {
        setReason('')
        setRows(j.rows || [])
        setContas(j.contas || [])
        setParams(j.params || null)
        setErros(j.erros || [])
      }
    } catch (e: any) { setReason(e.message) }
    setLoading(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [preset, status, acc])

  async function mudarStatus(r: Row, novo: 'ACTIVE' | 'PAUSED') {
    setAgindo(r.id)
    try {
      const j = await (await fetch('/api/mobile?fn=camp-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, status: novo }),
      })).json()
      if (!j.ok) alert('Erro: ' + (j.error || 'falha'))
      else {
        // usa o effective_status que a Meta devolveu, não o que pedimos
        const real = j.effective_status || novo
        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: real } : x)))
        if (j.effective_status && j.effective_status !== novo) {
          alert(`A Meta aplicou "${j.effective_status}" (você pediu ${novo}).`)
        }
      }
    } catch (e: any) { alert('Erro: ' + e.message) }
    setAgindo(null)
    setConfirmar(null)
  }

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return b ? rows.filter((r) => r.name.toLowerCase().includes(b)) : rows
  }, [rows, busca])

  const T = useMemo(() => filtradas.reduce(
    (a, r) => ({ spend: a.spend + r.spend, sales: a.sales + r.sales, revenue: a.revenue + r.revenue }),
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

  return (
    <>
      {/* resumo do período */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface2 p-5 shadow-card-sm">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-muted2">
          {PERIODOS.find(([v]) => v === preset)?.[1]} · {filtradas.length} campanha{filtradas.length === 1 ? '' : 's'}
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

      {/* filtros */}
      <button
        onClick={() => setFiltrosAbertos((v) => !v)}
        className="mt-3 flex w-full items-center gap-2 rounded-xl2 border border-border bg-surface px-4 py-3 text-[13px] font-semibold active:scale-[0.99]"
      >
        <SlidersHorizontal className="h-4 w-4 text-brand-2" />
        Filtros
        <span className="ml-auto truncate text-[12px] font-normal text-muted2">
          {PERIODOS.find(([v]) => v === preset)?.[1]} · {STATUS.find(([v]) => v === status)?.[1]}
          {acc && ` · ${contas.find((c) => c.id === acc)?.name || ''}`}
        </span>
      </button>

      {filtrosAbertos && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl2 border border-border bg-surface p-3">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Período</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} className={SEL}>
            {PERIODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted2">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={SEL}>
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted2">Conta</label>
          <select value={acc} onChange={(e) => setAcc(e.target.value)} className={SEL}>
            <option value="">Todas as contas</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* busca por nome */}
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por nome"
          className="h-[44px] w-full rounded-[10px] border border-border bg-surface pl-9 pr-9 text-[13px] text-ink focus:border-brand focus:outline-none"
        />
        {busca && (
          <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted2">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        onClick={carregar}
        disabled={loading}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl2 border border-border bg-surface2 py-2.5 text-[13px] font-semibold active:scale-[0.99]"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
      </button>

      {reason && (
        <div className="mt-3 rounded-xl2 border border-warn/30 bg-warn/[0.07] px-3.5 py-3 text-[12.5px] text-warn">
          {reason}
        </div>
      )}
      {erros.map((e, i) => (
        <div key={i} className="mt-2 flex items-start gap-2 rounded-xl2 border border-danger/25 bg-danger/[0.06] px-3.5 py-2.5 text-[11.5px] text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
        </div>
      ))}

      {/* lista */}
      <div className="mt-3 flex flex-col gap-2">
        {loading && rows.length === 0 ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-xl2 border border-border bg-surface" />)
        ) : filtradas.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
            Nenhuma campanha com esses filtros.
          </div>
        ) : (
          filtradas.map((r) => {
            const on = ativa(r.status)
            return (
              <div key={`${r.accId}-${r.id}`} className="rounded-xl2 border border-border bg-surface p-3.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted2">
                      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-ok' : 'bg-muted2'}`} />
                      {r.accName}{r.status && ` · ${on ? 'ativa' : r.status.toLowerCase()}`}
                    </div>
                  </div>
                  <div className={`shrink-0 text-right text-[22px] font-extrabold leading-none ${corRoas(r.roas)}`}>
                    {r.roas != null ? r.roas.toFixed(2) : '—'}
                  </div>
                </div>

                <button
                  onClick={() => setDetalhe(r)}
                  className="mt-2 flex w-full items-center gap-1.5 rounded-[9px] border border-border bg-surface2/60 px-3 py-2 text-[12px] font-semibold text-muted active:scale-[0.99]"
                >
                  <DollarSign className="h-3.5 w-3.5 text-ok" /> Orçamento
                  <span className="text-border2">·</span>
                  <History className="h-3.5 w-3.5 text-brand-2" /> Histórico
                  <ChevronRight className="ml-auto h-4 w-4 text-muted2" />
                </button>

                <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-border/60 pt-2.5 text-center">
                  {[
                    ['Gasto', brl(r.spend), 'text-warn'],
                    ['Vendas', String(r.sales || '—'), 'text-ink'],
                    ['CPA', r.cpa != null ? brl(r.cpa) : '—', params && r.cpa != null && r.cpa > params.cpaMax ? 'text-danger' : 'text-ink'],
                    ['Orçam.', r.budget != null ? brl(r.budget) : '—', 'text-muted'],
                  ].map(([k, v, cls]) => (
                    <div key={k}>
                      <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted2">{k}</div>
                      <div className={`mt-0.5 text-[12.5px] font-bold ${cls}`}>{v}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => (on ? setConfirmar(r) : mudarStatus(r, 'ACTIVE'))}
                  disabled={agindo === r.id}
                  className={`mt-2.5 flex w-full items-center justify-center gap-2 rounded-[10px] border py-2.5 text-[12.5px] font-bold active:scale-[0.99] disabled:opacity-50 ${
                    on ? 'border-danger/40 bg-danger/10 text-danger' : 'border-ok/40 bg-ok/10 text-ok'
                  }`}
                >
                  {agindo === r.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : on ? (
                    <><Pause className="h-4 w-4" /> Pausar</>
                  ) : (
                    <><Play className="h-4 w-4" /> Ativar</>
                  )}
                </button>
              </div>
            )
          })
        )}
      </div>

      {detalhe && (
        <Detalhe
          r={detalhe}
          onClose={() => setDetalhe(null)}
          onBudget={(novo) => setRows((prev) => prev.map((x) => (x.id === detalhe.id ? { ...x, budget: novo } : x)))}
        />
      )}

      {/* confirmação de pausa — no celular o toque errado é fácil demais */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setConfirmar(null)}>
          <div className="w-full max-w-[460px] rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-extrabold">Pausar esta campanha?</div>
            <div className="mt-1.5 line-clamp-3 text-[13px] text-muted">{confirmar.name}</div>
            <div className="mt-2 text-[12px] text-muted2">
              ROAS {confirmar.roas != null ? confirmar.roas.toFixed(2) : '—'} · gasto {brl(confirmar.spend)} · {confirmar.sales} venda{confirmar.sales === 1 ? '' : 's'} no período
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmar(null)} className="flex-1 rounded-[10px] border border-border py-3 text-[13px] font-bold text-muted active:scale-[0.99]">
                Cancelar
              </button>
              <button
                onClick={() => mudarStatus(confirmar, 'PAUSED')}
                className="flex-1 rounded-[10px] border border-danger/50 bg-danger/15 py-3 text-[13px] font-bold text-danger active:scale-[0.99]"
              >
                Pausar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
