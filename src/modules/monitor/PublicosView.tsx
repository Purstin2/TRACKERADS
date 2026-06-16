import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts'
import { RefreshCw, Search } from 'lucide-react'
import { fetchBreakdown, getRevenue, getSales } from '@/lib/meta'
import { useMonitor } from './MonitorContext'
import { ACCOUNTS, STATUS_FILTERS, DATE_OPTIONS, BREAKDOWNS, keyFor, AGE_ORDER, PALETTE, curSym, VAL_CLS, roasCls } from './config'

interface Seg {
  k: string
  spend: number
  revenue: number
  sales: number
  roas: number
  cpa: number | null
}
interface PubState {
  flat: Seg[]
  dim: string
  cur: string
  mixed: boolean
}

const DIM_OPTS = Object.entries(BREAKDOWNS).map(([k, v]) => ({ value: k, label: v.label }))

export default function PublicosView() {
  const m = useMonitor()
  const [dim, setDim] = useState('age')
  const [period, setPeriod] = useState('last_7d')
  const [loading, setLoading] = useState(false)
  const [raw, setRaw] = useState<{ rows: any[]; dim: string; cur: string; mixed: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [scopeCamps, setScopeCamps] = useState<Set<string>>(new Set())
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scopeQ, setScopeQ] = useState('')

  async function load() {
    if (!m.token.trim()) return alert('Cole o token.')
    const accs = ACCOUNTS.filter((a) => m.selected.has(a.id))
    if (!accs.length) return
    setLoading(true)
    setErr('')
    const statuses = STATUS_FILTERS[m.status]?.values || ['ACTIVE']
    const curs = [...new Set(accs.map((a) => a.cur))]
    const mixed = curs.length > 1
    const cur = mixed ? '$' : curSym(curs[0] || 'USD')
    const all: any[] = []
    for (const acc of accs) {
      const fx = mixed ? (acc.cur === 'BRL' ? 1 / m.settings.fx : 1) : 1
      try {
        const rows = await fetchBreakdown(acc.id, BREAKDOWNS[dim].api, period, m.token.trim(), statuses)
        rows.forEach((r) => {
          ;(r as any)._fx = fx
          all.push(r)
        })
      } catch (e: any) {
        setErr(`${acc.name}: ${e.message}`)
        setLoading(false)
        return
      }
    }
    setRaw({ rows: all, dim, cur, mixed })
    setLoading(false)
  }

  // lista de campanhas para o seletor de escopo
  const campList = useMemo(() => {
    if (!raw) return []
    const seen = new Map<string, string>()
    raw.rows.forEach((r) => {
      if (r.campaign_id && !seen.has(r.campaign_id)) seen.set(r.campaign_id, r.campaign_name || r.campaign_id)
    })
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [raw])

  // agrega (refiltrando por campanhas do escopo, sem refazer fetch)
  const st = useMemo<PubState | null>(() => {
    if (!raw) return null
    const agg: Record<string, { spend: number; revenue: number; sales: number }> = {}
    raw.rows.forEach((r) => {
      if (scopeCamps.size && !scopeCamps.has(r.campaign_id)) return
      const k = keyFor(r, raw.dim)
      const fx = (r as any)._fx || 1
      const spend = parseFloat(r.spend || '0') * fx
      const revenue = getRevenue(r) * fx
      const sales = getSales(r)
      if (!agg[k]) agg[k] = { spend: 0, revenue: 0, sales: 0 }
      agg[k].spend += spend
      agg[k].revenue += revenue
      agg[k].sales += sales
    })
    const flat: Seg[] = Object.entries(agg).map(([k, v]) => ({
      k,
      spend: v.spend,
      revenue: v.revenue,
      sales: v.sales,
      roas: v.spend > 0 ? v.revenue / v.spend : 0,
      cpa: v.sales > 0 ? v.spend / v.sales : null,
    }))
    return { flat, dim: raw.dim, cur: raw.cur, mixed: raw.mixed }
  }, [raw, scopeCamps])

  const s = m.settings
  const cur = st?.cur || '$'

  function sortForChart(flat: Seg[], d: string) {
    if (d === 'age') return [...flat].sort((a, b) => (AGE_ORDER.indexOf(a.k) < 0 ? 99 : AGE_ORDER.indexOf(a.k)) - (AGE_ORDER.indexOf(b.k) < 0 ? 99 : AGE_ORDER.indexOf(b.k)))
    if (d === 'hora') return [...flat].sort((a, b) => parseInt(a.k) - parseInt(b.k))
    return [...flat].sort((a, b) => b.spend - a.spend)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Dimensão</span>
        <select value={dim} onChange={(e) => setDim(e.target.value)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          {DIM_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Período</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          {DATE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {campList.length > 0 && (
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setScopeOpen((o) => !o)} title="Filtrar por campanhas específicas">
            Campanhas: {scopeCamps.size ? `${scopeCamps.size} selec.` : 'Todas'} ▾
          </button>
        )}
        <button className={`btn btn-primary btn-sm ${campList.length ? '' : 'ml-auto'}`} onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Buscando...' : 'Analisar'}
        </button>
      </div>

      {scopeOpen && campList.length > 0 && (
        <div className="rounded-xl2 border border-border bg-surface p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
              <input value={scopeQ} onChange={(e) => setScopeQ(e.target.value)} placeholder="Buscar campanha..." className="w-full rounded-[7px] border border-border bg-[#0a0c19] py-1.5 pl-8 pr-3 text-[12px] text-ink" />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setScopeCamps(new Set())}>
              Todas
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setScopeCamps(new Set(campList.filter((c) => !scopeQ || c.name.toLowerCase().includes(scopeQ.toLowerCase())).map((c) => c.id)))}
            >
              Marcar visíveis
            </button>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {campList
              .filter((c) => !scopeQ || c.name.toLowerCase().includes(scopeQ.toLowerCase()))
              .map((c) => {
                const on = scopeCamps.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      const n = new Set(scopeCamps)
                      n.has(c.id) ? n.delete(c.id) : n.add(c.id)
                      setScopeCamps(n)
                    }}
                    className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] ${on ? 'bg-brand/10' : 'hover:bg-surface2'}`}
                  >
                    <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[9px] ${on ? 'border-brand bg-brand text-white' : 'border-border'}`}>{on ? '✓' : ''}</span>
                    <span className="flex-1 truncate" title={c.name}>
                      {c.name}
                    </span>
                  </button>
                )
              })}
          </div>
          <div className="mt-1 text-[11px] text-muted2">
            {scopeCamps.size ? `Analisando ${scopeCamps.size} campanha(s) — os gráficos abaixo já refletem o filtro.` : 'Todas as campanhas. Marque para focar num lote específico.'}
          </div>
        </div>
      )}

      {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-2 text-[12px]">❌ {err}</div>}

      {!st && !loading && !err && (
        <div className="rounded-xl2 border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <h3 className="text-lg font-bold">Análise de Públicos</h3>
          <p className="mt-1 text-[13px] text-muted">Selecione a dimensão e clique em Analisar.</p>
        </div>
      )}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand" />
        </div>
      )}

      {st && st.flat.length > 0 && <Result st={st} s={s} cur={cur} sortForChart={sortForChart} />}
      {st && st.flat.length === 0 && !loading && (
        <div className="rounded-xl2 border border-dashed border-border py-8 text-center text-[12px] text-muted2">Sem dados para essa dimensão.</div>
      )}
    </div>
  )
}

function Result({ st, s, cur, sortForChart }: { st: PubState; s: any; cur: string; sortForChart: (f: Seg[], d: string) => Seg[] }) {
  const { flat, dim, mixed } = st
  const tS = flat.reduce((a, f) => a + f.spend, 0)
  const tR = flat.reduce((a, f) => a + f.revenue, 0)
  const tV = flat.reduce((a, f) => a + f.sales, 0)
  const tRoas = tS > 0 ? tR / tS : 0
  const tCpa = tV > 0 ? tS / tV : 0
  const geoDim = dim === 'regiao' || dim === 'country'
  const noAttr = tV === 0 && tS > 2

  // insights
  const minSpend = Math.max(1.5, tS * 0.015)
  const dead: Seg[] = []
  const bleed: Seg[] = []
  const sub: Seg[] = []
  const gold: Seg[] = []
  flat.forEach((f) => {
    if (f.spend < minSpend && f.sales === 0) return
    if (f.sales === 0 && f.spend >= minSpend) dead.push(f)
    else if (f.roas < s.roasBe) bleed.push(f)
    else if (f.roas < s.roasGood) sub.push(f)
    else gold.push(f)
  })
  dead.sort((a, b) => b.spend - a.spend)
  bleed.sort((a, b) => b.spend - a.spend)
  sub.sort((a, b) => b.spend - a.spend)
  gold.sort((a, b) => b.roas - a.roas)
  const wasted = [...dead, ...bleed].reduce((a, f) => a + f.spend, 0)
  const subSp = sub.reduce((a, f) => a + f.spend, 0)
  const goldSp = gold.reduce((a, f) => a + f.spend, 0)

  const fc = sortForChart(flat, dim)
  const fmtMoney = (v: number) => `${cur}${v.toFixed(2)}`

  const Card = ({ f, kind }: { f: Seg; kind: string }) => {
    const share = tS > 0 ? (f.spend / tS) * 100 : 0
    const col = kind === 'gold' ? '#46d989' : kind === 'sub' ? '#f7b955' : '#fb6f86'
    const border = kind === 'gold' ? 'border-l-ok' : kind === 'sub' ? 'border-l-warn' : 'border-l-danger'
    const verdict =
      kind === 'dead' ? '💀 0 vendas — excluir' : kind === 'bleed' ? '🩸 prejuízo — cortar' : kind === 'sub' ? (share >= 25 ? `consome muito, < ${s.roasGood}` : 'lucra, abaixo do alvo') : '🏆 realocar budget pra cá'
    return (
      <div className={`rounded-[9px] border border-border border-l-[3px] bg-surface p-3 ${border}`}>
        <div className="flex items-center justify-between text-[12px] font-semibold">
          <span>{f.k}</span>
        </div>
        <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-surface2">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, background: col }} />
        </div>
        <div className="text-[11px] text-muted">
          {cur}{f.spend.toFixed(2)} ({share.toFixed(0)}%) · ROAS {f.roas.toFixed(2)} · {f.sales}v · CPA {f.cpa !== null ? '$' + f.cpa.toFixed(2) : '—'}
        </div>
        <div className={`mt-0.5 text-[11px] font-semibold ${kind === 'gold' ? 'text-ok' : kind === 'sub' ? 'text-warn' : 'text-danger'}`}>{verdict}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[11px] text-muted">
        Dimensão: <b className="text-ink">{BREAKDOWNS[dim].label}</b>
        {mixed && ` · valores em USD (câmbio R$ ${s.fx.toFixed(2)})`}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Gasto', fmtMoney(tS), ''],
          ['Faturamento', fmtMoney(tR), ''],
          ['ROAS', tRoas.toFixed(2), tRoas >= s.roasGood ? 'text-ok' : tRoas < s.roasBe ? 'text-danger' : 'text-warn'],
          ['Vendas', String(tV), ''],
          ['CPA', `$${tCpa.toFixed(2)}`, tCpa <= s.cpaMax ? 'text-ok' : 'text-danger'],
        ].map(([l, v, c]) => (
          <div key={l} className="rounded-xl2 border border-border bg-surface p-3 text-center">
            <div className={`text-[17px] font-extrabold ${c}`}>{v}</div>
            <div className="text-[11px] text-muted2">{l}</div>
          </div>
        ))}
      </div>

      {noAttr ? (
        <div className="rounded-[9px] border border-warn/20 border-l-[3px] border-l-warn bg-warn/[0.07] px-3.5 py-2.5 text-[12px] text-ink">
          ⚠️ <b>Recorte sem atribuição de vendas.</b> {cur}{tS.toFixed(2)} gastos e <b>0 vendas</b> neste detalhamento. O Meta
          normalmente não quebra compras por {BREAKDOWNS[dim].label.toLowerCase()} — use só a distribuição de gasto, não corte nada por aqui.
        </div>
      ) : (
        <>
          {/* insights */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl2 border border-danger/20 bg-danger/[0.05] p-3 text-center">
              <div className="text-[16px] font-extrabold text-danger">{cur}{wasted.toFixed(2)}</div>
              <div className="text-[10px] text-muted2">💸 Vazando · {dead.length + bleed.length} seg</div>
            </div>
            <div className="rounded-xl2 border border-warn/20 bg-warn/[0.05] p-3 text-center">
              <div className="text-[16px] font-extrabold text-warn">{cur}{subSp.toFixed(2)}</div>
              <div className="text-[10px] text-muted2">🟡 Abaixo do alvo · {sub.length} seg</div>
            </div>
            <div className="rounded-xl2 border border-ok/20 bg-ok/[0.05] p-3 text-center">
              <div className="text-[16px] font-extrabold text-ok">{cur}{goldSp.toFixed(2)}</div>
              <div className="text-[10px] text-muted2">🏆 Eficiente · {gold.length} seg</div>
            </div>
          </div>

          {[...bleed, ...dead].length > 0 && (
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-danger">🩸 Vazamentos — cortar ou excluir</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[...bleed].map((f, i) => <Card key={'b' + i} f={f} kind="bleed" />)}
                {dead.map((f, i) => <Card key={'d' + i} f={f} kind="dead" />)}
              </div>
            </div>
          )}
          {sub.length > 0 && (
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-warn">🟡 Abaixo do alvo</div>
              <div className="grid gap-2 sm:grid-cols-2">{sub.map((f, i) => <Card key={i} f={f} kind="sub" />)}</div>
            </div>
          )}
          {gold.length > 0 && (
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-ok">🏆 Ouro — escalar / realocar</div>
              <div className="grid gap-2 sm:grid-cols-2">{gold.map((f, i) => <Card key={i} f={f} kind="gold" />)}</div>
            </div>
          )}
        </>
      )}

      {geoDim && (
        <div className="text-[11px] text-muted2">ⓘ Vendas por geografia podem ser subnotificadas pelo Meta.</div>
      )}

      {/* charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="mb-2 text-[12px] font-bold">ROAS por {BREAKDOWNS[dim].label.toLowerCase()}</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={fc} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="k" tick={{ fontSize: 9, fill: '#5f6678' }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: '#5f6678' }} />
                <Tooltip contentStyle={{ background: '#0d0f1e', border: '1px solid #1d2139', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => v.toFixed(2)} />
                <Bar dataKey="roas" radius={[3, 3, 0, 0]}>
                  {fc.map((f, i) => (
                    <Cell key={i} fill={f.roas >= s.roasGood ? '#46d989' : f.roas < s.roasBe ? '#fb6f86' : '#f7b955'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="mb-2 text-[12px] font-bold">Distribuição de gasto</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={[...flat].sort((a, b) => b.spend - a.spend)} dataKey="spend" nameKey="k" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
                  {flat.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0d0f1e', border: '1px solid #1d2139', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => `${cur}${v.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* tabela */}
      <details>
        <summary className="cursor-pointer text-[11px] text-muted">Ver tabela detalhada</summary>
        <div className="card mt-2 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted2">
                <th className="py-2 pl-4 text-left">{BREAKDOWNS[dim].label}</th>
                <th className="py-2 text-right">Gasto</th>
                <th className="py-2 text-right">Fat.</th>
                <th className="py-2 text-right">ROAS</th>
                <th className="py-2 text-right">Vendas</th>
                <th className="py-2 pr-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {[...flat].sort((a, b) => b.spend - a.spend).map((f, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 pl-4">{f.k}</td>
                  <td className="py-1.5 text-right font-mono">{cur}{f.spend.toFixed(2)}</td>
                  <td className="py-1.5 text-right font-mono">{cur}{f.revenue.toFixed(2)}</td>
                  <td className={`py-1.5 text-right font-mono ${VAL_CLS[roasCls(f.roas, s)]}`}>{f.roas.toFixed(2)}</td>
                  <td className="py-1.5 text-right font-mono">{f.sales}</td>
                  <td className={`py-1.5 pr-3 text-right font-mono ${f.cpa === null ? 'text-muted2' : f.cpa <= s.cpaMax ? 'text-ok' : 'text-danger'}`}>
                    {f.cpa !== null ? '$' + f.cpa.toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
