import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchFunil, getRevenue, previousPeriod, periodLabel } from '@/lib/meta'
import { useMonitor } from './MonitorContext'
import { ACCOUNTS, STATUS_FILTERS, DATE_OPTIONS } from './config'
import { aggregateFunnel, fnlPurch, toUSD, type FnlRow } from './funnelData'
import Funnel from './components/Funnel'

interface FnlCamp {
  key: string
  accId: string
  accName: string
  cur: string
  name: string
  sales: number
  raw: FnlRow
  rawPrev: FnlRow | null
}

const fmtUSD = (v: number) => '$' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function FunilMetaView() {
  const m = useMonitor()
  const [period, setPeriod] = useState('last_7d')
  const [customSince, setCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [compare, setCompare] = useState(false)
  const [loading, setLoading] = useState(false)
  const [camps, setCamps] = useState<FnlCamp[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [errs, setErrs] = useState<string[]>([])
  const [periods, setPeriods] = useState({ cur: '', prev: '' })

  async function load() {
    if (!m.token.trim()) return alert('Cole o token.')
    const accs = ACCOUNTS.filter((a) => m.selected.has(a.id))
    if (!accs.length) return alert('Selecione ao menos uma conta.')
    if (period === 'custom' && (!customSince || !customUntil)) return alert('Escolha as duas datas (de / até).')
    const actualPeriod = period === 'custom' ? `custom:${customSince}:${customUntil}` : period
    setLoading(true)
    const statuses = STATUS_FILTERS[m.status]?.values || ['ACTIVE']
    const prevPreset = compare ? previousPeriod(actualPeriod) : ''
    setPeriods({ cur: actualPeriod, prev: prevPreset })
    const out: FnlCamp[] = []
    const er: string[] = []
    const fx = m.settings.fx
    for (const acc of accs) {
      try {
        const rows = await fetchFunil(acc.id, actualPeriod, m.token.trim(), statuses)
        let prevMap: Record<string, FnlRow> = {}
        if (compare) {
          try {
            const pr = await fetchFunil(acc.id, prevPreset, m.token.trim(), statuses)
            pr.forEach((r) => {
              prevMap[r.campaign_id!] = { ...r, _spendUSD: toUSD(parseFloat(r.spend || '0'), acc.cur, fx), _revUSD: toUSD(getRevenue(r), acc.cur, fx) }
            })
          } catch {}
        }
        rows.forEach((r) => {
          out.push({
            key: `${acc.id}::${r.campaign_id}`,
            accId: acc.id,
            accName: acc.name,
            cur: acc.cur,
            name: r.campaign_name || '(sem nome)',
            sales: fnlPurch(r),
            raw: { ...r, _spendUSD: toUSD(parseFloat(r.spend || '0'), acc.cur, fx), _revUSD: toUSD(getRevenue(r), acc.cur, fx) },
            rawPrev: prevMap[r.campaign_id!] || null,
          })
        })
      } catch (e: any) {
        er.push(`${acc.name}: ${e.message}`)
      }
    }
    setCamps(out)
    setSel(new Set(out.map((c) => c.key)))
    setErrs(er)
    setLoading(false)
  }

  const toggle = (k: string) =>
    setSel((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const q = search.trim().toLowerCase()
  const selectVisible = (on: boolean) =>
    setSel((s) => {
      const n = new Set(s)
      camps.forEach((c) => {
        if (!q || c.name.toLowerCase().includes(q)) on ? n.add(c.key) : n.delete(c.key)
      })
      return n
    })

  const selected = camps.filter((c) => sel.has(c.key))
  const agg = selected.length ? aggregateFunnel(selected.map((c) => c.raw)) : null
  const prevRows = selected.map((c) => c.rawPrev).filter(Boolean) as FnlRow[]
  const aggPrev = compare && prevRows.length ? aggregateFunnel(prevRows) : null

  // agrupa picker por conta
  const byAcc: Record<string, FnlCamp[]> = {}
  camps.forEach((c) => (byAcc[c.accName] = byAcc[c.accName] || []).push(c))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Período</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          {DATE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
          <option value="custom">Personalizado</option>
        </select>
        {period === 'custom' && (
          <>
            <input type="date" value={customSince} onChange={(e) => setCustomSince(e.target.value)} style={{ colorScheme: 'dark' }} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink" />
            <span className="text-[11px] text-muted2">até</span>
            <input type="date" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} style={{ colorScheme: 'dark' }} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink" />
          </>
        )}
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Comparar período anterior
        </label>
        <button className="btn btn-primary btn-sm ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Carregando...' : 'Carregar'}
        </button>
      </div>

      {errs.length > 0 && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-2 text-[12px]">{errs.map((e) => `❌ ${e}`).join(' · ')}</div>}

      {!camps.length && !loading && (
        <div className="rounded-xl2 border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <h3 className="text-lg font-bold">Funil de Conversão</h3>
          <p className="mt-1 text-[13px] text-muted">Carregue as campanhas, marque as do produto e o funil soma só elas.</p>
        </div>
      )}

      {camps.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* picker */}
          <div className="flex flex-col rounded-xl2 border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <span className="text-[12px] font-bold">Campanhas no funil</span>
              <span className="text-[11px] text-muted2">
                {sel.size}/{camps.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 border-b border-border p-2.5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔎 Buscar por nome..."
                className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
              />
              <div className="flex flex-wrap gap-1">
                {[
                  ['Marcar visíveis', () => selectVisible(true)],
                  ['Desmarcar visíveis', () => selectVisible(false)],
                  ['Todas', () => setSel(new Set(camps.map((c) => c.key)))],
                  ['Limpar', () => setSel(new Set())],
                ].map(([l, fn]) => (
                  <button key={l as string} onClick={fn as () => void} className="rounded-full border border-border2 bg-surface2 px-2 py-0.5 text-[10px] text-muted hover:text-ink">
                    {l as string}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[440px] overflow-y-auto p-1.5">
              {Object.entries(byAcc).map(([accName, list]) => {
                const visible = list.filter((c) => !q || c.name.toLowerCase().includes(q))
                if (!visible.length) return null
                return (
                  <div key={accName}>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted2">
                      {accName} · {list.length}
                    </div>
                    {visible.map((c) => {
                      const on = sel.has(c.key)
                      return (
                        <button
                          key={c.key}
                          onClick={() => toggle(c.key)}
                          className={`flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] ${on ? 'bg-brand/10' : 'hover:bg-surface2'}`}
                        >
                          <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[9px] ${on ? 'border-brand bg-brand text-white' : 'border-border'}`}>
                            {on ? '✓' : ''}
                          </span>
                          <span className="flex-1 truncate" title={c.name}>
                            {c.name}
                          </span>
                          <span className="text-[10px] text-muted2">{c.sales}v</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* resultado */}
          <div className="flex flex-col gap-3">
            {!agg || !selected.length ? (
              <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl2 border border-dashed border-border text-center text-[13px] text-muted">
                Marque ao menos uma campanha para montar o funil.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl2 border border-border bg-surface p-3 text-center">
                    <div className="text-[18px] font-extrabold">{agg.sales.toLocaleString('pt-BR')}</div>
                    <div className="text-[11px] text-muted2">Resultados (compras)</div>
                  </div>
                  <div className="rounded-xl2 border border-border bg-surface p-3 text-center">
                    <div className="text-[18px] font-extrabold">{fmtUSD(agg.rev)}</div>
                    <div className="text-[11px] text-muted2">Valor de compras</div>
                  </div>
                  <div className="rounded-xl2 border border-border bg-surface p-3 text-center">
                    <div className="text-[18px] font-extrabold">{agg.roas ? agg.roas.toFixed(2) : '—'}</div>
                    <div className="text-[11px] text-muted2">ROAS · gasto {fmtUSD(agg.spend)}</div>
                  </div>
                </div>
                <Funnel
                  stages={agg.stages}
                  prevStages={aggPrev ? aggPrev.stages : null}
                  title="Funil de Conversão (Meta Ads)"
                  subtitle={`${selected.length} campanha(s).${compare ? ` Atual ${periodLabel(periods.cur)} vs anterior ${periodLabel(periods.prev)}${aggPrev ? '' : ' — sem dados anteriores'}` : ''}`}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
