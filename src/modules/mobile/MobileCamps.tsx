import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, X, Pause, Play, AlertTriangle, SlidersHorizontal } from 'lucide-react'

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
