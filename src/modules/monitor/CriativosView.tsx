import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchCreatives, getRevenue, getSales } from '@/lib/meta'
import { useMonitor } from './MonitorContext'
import { ACCOUNTS, STATUS_FILTERS, DATE_OPTIONS, curSym, classify, roasCls, ICONS, ROW_BG, VAL_CLS } from './config'

interface AdRow {
  acc: string
  name: string
  camp: string
  spend: number
  rev: number
  sales: number
  roas: number
  cpa: number | null
}

export default function CriativosView() {
  const m = useMonitor()
  const [period, setPeriod] = useState('last_7d')
  const [sortBy, setSortBy] = useState('spend')
  const [minSpend, setMinSpend] = useState('0')
  const [loading, setLoading] = useState(false)
  const [ads, setAds] = useState<AdRow[] | null>(null)
  const [cur, setCur] = useState('$')
  const [errs, setErrs] = useState<string[]>([])

  async function load() {
    if (!m.token.trim()) return alert('Cole o token.')
    const accs = ACCOUNTS.filter((a) => m.selected.has(a.id))
    if (!accs.length) return
    setLoading(true)
    const statuses = STATUS_FILTERS[m.status]?.values || ['ACTIVE']
    const curs = [...new Set(accs.map((a) => a.cur))]
    const mixed = curs.length > 1
    const c = mixed ? '$' : curSym(curs[0] || 'USD')
    const min = parseFloat(minSpend) || 0
    const out: AdRow[] = []
    const er: string[] = []
    for (const acc of accs) {
      const fx = mixed ? (acc.cur === 'BRL' ? 1 / m.settings.fx : 1) : 1
      try {
        const rows = await fetchCreatives(acc.id, period, m.token.trim(), statuses)
        rows.forEach((r) => {
          const spend = parseFloat(r.spend || '0') * fx
          if (spend < min) return
          const rev = getRevenue(r) * fx
          const sales = getSales(r)
          out.push({
            acc: acc.name,
            name: r.ad_name || '(sem nome)',
            camp: r.campaign_name || '',
            spend,
            rev,
            sales,
            roas: spend > 0 ? rev / spend : 0,
            cpa: sales > 0 ? spend / sales : null,
          })
        })
      } catch (e: any) {
        er.push(`${acc.name}: ${e.message}`)
      }
    }
    if (sortBy === 'spend') out.sort((a, b) => b.spend - a.spend)
    else if (sortBy === 'roas_desc') out.sort((a, b) => b.roas - a.roas)
    else out.sort((a, b) => a.roas - b.roas)
    setAds(out)
    setCur(c)
    setErrs(er)
    setLoading(false)
  }

  const s = m.settings
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const onSort = (k: string) => setSort((p) => (p?.key === k ? (p.dir === 'desc' ? { key: k, dir: 'asc' } : null) : { key: k, dir: 'desc' }))
  const sorted = sort
    ? [...(ads || [])].sort((a, b) => {
        const va = (a as any)[sort.key]
        const vb = (b as any)[sort.key]
        const mul = sort.dir === 'asc' ? 1 : -1
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        return mul * (va - vb)
      })
    : ads || []
  const shown = sorted.slice(0, 80)
  const Th = ({ k, label }: { k: string; label: string }) => (
    <th onClick={() => onSort(k)} className={`cursor-pointer select-none py-2 text-right hover:text-ink ${sort?.key === k ? 'text-brand-2' : ''}`}>
      {label}
      {sort?.key === k ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  )

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
        </select>
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Ordenar</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          <option value="spend">Maior gasto</option>
          <option value="roas_desc">Melhor ROAS</option>
          <option value="roas_asc">Pior ROAS</option>
        </select>
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Gasto mín</span>
        <input
          type="number"
          value={minSpend}
          onChange={(e) => setMinSpend(e.target.value)}
          className="w-[70px] rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
        />
        <button className="btn btn-primary btn-sm ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Buscando...' : 'Analisar'}
        </button>
      </div>

      {!ads && !loading && (
        <div className="rounded-xl2 border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <h3 className="text-lg font-bold">Ranking de Criativos</h3>
          <p className="mt-1 text-[13px] text-muted">Lista todos os anúncios das contas, do melhor ao pior.</p>
        </div>
      )}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand" />
        </div>
      )}

      {ads && (
        <>
          {errs.length > 0 && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-2 text-[12px]">{errs.join(' · ')}</div>}
          {shown.length === 0 ? (
            <div className="rounded-xl2 border border-dashed border-border py-8 text-center text-[12px] text-muted2">Nenhum criativo acima do gasto mínimo.</div>
          ) : (
            <>
              <div className="text-[11px] text-muted">Ranking (top 80) — escolha os campeões a consolidar.</div>
              <div className="card overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted2">
                      <th className="w-10 py-2 text-center">#</th>
                      <th className="py-2 text-left">Criativo</th>
                      <th className="py-2 text-left">Conta</th>
                      <Th k="spend" label="Gasto" />
                      <Th k="roas" label="ROAS" />
                      <Th k="cpa" label="CPA" />
                      <Th k="sales" label="Vendas" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((a, i) => {
                      const cls = classify(a.roas, a.cpa, a.sales, s)
                      return (
                        <tr key={i} className={`border-b border-border/50 ${ROW_BG[cls]}`}>
                          <td className="py-2 text-center text-muted2">{i + 1}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-1.5">
                              <span>{ICONS[cls]}</span>
                              <span className="max-w-[280px] truncate" title={`${a.name} — ${a.camp}`}>
                                {a.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2">
                            <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted2">{a.acc}</span>
                          </td>
                          <td className="py-2 text-right font-mono">{cur}{a.spend.toFixed(2)}</td>
                          <td className={`py-2 text-right font-mono ${VAL_CLS[roasCls(a.roas, s)]}`}>{a.roas.toFixed(2)}</td>
                          <td className={`py-2 text-right font-mono ${a.cpa === null ? 'text-muted2' : a.cpa <= s.cpaMax ? 'text-ok' : 'text-danger'}`}>
                            {a.cpa !== null ? '$' + a.cpa.toFixed(2) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">{a.sales}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
