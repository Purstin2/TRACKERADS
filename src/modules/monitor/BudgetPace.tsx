import { useEffect, useMemo, useState } from 'react'
import { Activity, X } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { useMonitor } from './MonitorContext'
import { budgetIncreases, todayBR, type ActionEntry } from './actionLog'
import { fetchCampHourly, getSales, getRevenue } from '@/lib/meta'

const curSym = (c: string) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : 'R$')
const brHour = (ms: number) => new Date(ms - 3 * 3600 * 1000).getUTCHours()
const brDay = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10)
const dmFmt = (d: string) => d.slice(8) + '/' + d.slice(5, 7)
const hourFmt = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

function dayList(startDay: string, endDay: string): string[] {
  const out: string[] = []
  let cur = startDay
  for (let i = 0; i < 14 && cur <= endDay; i++) {
    out.push(cur)
    const d = new Date(cur + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
    cur = d.toISOString().slice(0, 10)
  }
  return out
}

/** Botão "ritmo 3h" — só aparece se a campanha tem aumento de orçamento registrado. */
export function BudgetPaceBtn({ accId, name, campId, cur }: { accId: string; name: string; campId: string; cur: string }) {
  const [open, setOpen] = useState(false)
  const incs = budgetIncreases(campId)
  if (!incs.length) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ritmo do orçamento: ROAS a cada 3h desde o aumento"
        className="inline-flex items-center gap-0.5 rounded border border-brand/40 bg-brand/5 px-1.5 py-0.5 text-[10px] font-bold text-brand-2 hover:bg-brand/15"
      >
        <Activity className="h-3 w-3" /> ritmo 3h
      </button>
      {open && <BudgetPaceModal accId={accId} name={name} campId={campId} cur={cur} incs={incs} onClose={() => setOpen(false)} />}
    </>
  )
}

interface Bucket { key: string; day: string; b: number; label: string; spend: number; sales: number; revenue: number }

export function BudgetPaceModal({ accId, name, campId, cur, incs, onClose }: { accId: string; name: string; campId: string; cur: string; incs: ActionEntry[]; onClose: () => void }) {
  const m = useMonitor()
  const sym = curSym(cur)
  const [idx, setIdx] = useState(incs.length - 1) // por padrão, o aumento mais recente
  const inc = incs[idx]
  const [buckets, setBuckets] = useState<Bucket[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const startMs = new Date(inc.ts).getTime()
  const nextMs = idx < incs.length - 1 ? new Date(incs[idx + 1].ts).getTime() : Infinity
  const endMs = Math.min(nextMs, startMs + 7 * 86400000, Date.now())

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(''); setBuckets(null)
    const startDay = inc.dateBR || brDay(startMs)
    const endDay = brDay(endMs)
    const days = dayList(startDay, endDay)
    const startBucket = Math.floor(brHour(startMs) / 3)
    const endBucket = Math.floor(brHour(endMs) / 3)

    Promise.all(days.map((d) => fetchCampHourly(accId, campId, m.token.trim(), d).catch(() => [])))
      .then((all: any[][]) => {
        if (!alive) return
        const map = new Map<string, Bucket>()
        days.forEach((day, di) => {
          for (const row of all[di] || []) {
            const hs = (row.hourly_stats_aggregated_by_advertiser_time_zone as string) || '00'
            const h = parseInt(hs.slice(0, 2), 10) || 0
            const b = Math.floor(h / 3)
            // recorta: no 1º dia só do bucket do aumento p/ frente; no último dia até o bucket do fim
            if (day === startDay && b < startBucket) continue
            if (day === endDay && nextMs !== Infinity && b > endBucket) continue
            const key = `${day}#${b}`
            const bk = map.get(key) || { key, day, b, label: `${dmFmt(day)} ${String(b * 3).padStart(2, '0')}h`, spend: 0, sales: 0, revenue: 0 }
            bk.spend += parseFloat(row.spend || '0')
            bk.sales += getSales(row)
            bk.revenue += getRevenue(row) || 0
            map.set(key, bk)
          }
        })
        setBuckets([...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1)))
        setLoading(false)
      })
      .catch((e) => { if (alive) { setErr(e.message || 'falha ao buscar horas'); setLoading(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, accId, campId])

  // série acumulada
  const series = useMemo(() => {
    let cs = 0, cr = 0
    return (buckets || []).map((bk) => {
      cs += bk.spend; cr += bk.revenue
      return {
        label: bk.label,
        bucketRoas: bk.spend > 0 ? +(bk.revenue / bk.spend).toFixed(2) : null,
        cumRoas: cs > 0 ? +(cr / cs).toFixed(2) : null,
        spend: bk.spend, sales: bk.sales, revenue: bk.revenue,
        cumSpend: cs, cumRev: cr,
      }
    })
  }, [buckets])

  const last = series.length ? series[series.length - 1] : null
  const baseline = inc.roasAtTime ?? null
  const cumNow = last?.cumRoas ?? null
  const verdict = useMemo(() => {
    if (cumNow == null) return null
    if (baseline != null) {
      const d = ((cumNow - baseline) / baseline) * 100
      if (d >= 5) return { txt: `✅ Aguentou o aumento — ROAS ${cumNow.toFixed(2)} vs base ${baseline.toFixed(2)} (+${d.toFixed(0)}%)`, cls: 'bg-ok/15 text-ok' }
      if (d <= -10) return { txt: `❌ ROAS caiu desde o aumento — ${cumNow.toFixed(2)} vs base ${baseline.toFixed(2)} (${d.toFixed(0)}%)`, cls: 'bg-danger/15 text-danger' }
      return { txt: `➖ Estável — ROAS ${cumNow.toFixed(2)} vs base ${baseline.toFixed(2)} (${d >= 0 ? '+' : ''}${d.toFixed(0)}%)`, cls: 'bg-surface2 text-muted' }
    }
    return cumNow >= m.settings.roasBe
      ? { txt: `ROAS acumulado ${cumNow.toFixed(2)} (acima do breakeven ${m.settings.roasBe})`, cls: 'bg-ok/15 text-ok' }
      : { txt: `ROAS acumulado ${cumNow.toFixed(2)} (abaixo do breakeven ${m.settings.roasBe})`, cls: 'bg-danger/15 text-danger' }
  }, [cumNow, baseline, m.settings.roasBe])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[720px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-bold" title={name}>📈 Ritmo do orçamento (ROAS a cada 3h)</h3>
            <div className="truncate text-[11px] text-muted2" title={name}>{name}</div>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="card-body flex flex-col gap-3">
          {/* seletor do aumento (nível de orçamento) */}
          {incs.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted2">Aumento:</span>
              {incs.map((e, i) => (
                <button key={e.id} onClick={() => setIdx(i)}
                  className={`rounded-[7px] border px-2 py-1 text-[11px] font-semibold ${i === idx ? 'border-brand bg-brand/10 text-brand-2' : 'border-border text-muted2 hover:border-brand/40'}`}>
                  {dmFmt(e.dateBR || brDay(new Date(e.ts).getTime()))} {hourFmt(e.ts)} · {sym}{(e.budgetBefore ?? 0).toFixed(0)}→{sym}{(e.budgetAfter ?? 0).toFixed(0)}
                </button>
              ))}
            </div>
          )}

          {/* baseline */}
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            <div className="rounded-xl2 border border-border bg-surface2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted2">Orçamento</div>
              <div className="font-mono font-bold text-ink">{sym}{(inc.budgetBefore ?? 0).toFixed(0)} → {sym}{(inc.budgetAfter ?? 0).toFixed(0)}</div>
            </div>
            <div className="rounded-xl2 border border-border bg-surface2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted2">ROAS base (no aumento)</div>
              <div className="font-mono font-bold text-ink">{baseline != null ? baseline.toFixed(2) : '—'}</div>
            </div>
            <div className="rounded-xl2 border border-border bg-surface2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted2">ROAS acum. agora</div>
              <div className={`font-mono font-bold ${cumNow == null ? 'text-muted2' : baseline != null && cumNow >= baseline ? 'text-ok' : 'text-danger'}`}>{cumNow != null ? cumNow.toFixed(2) : '—'}</div>
            </div>
          </div>

          {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>}
          {loading && <div className="py-6 text-center text-[12px] text-muted2 animate-pulse">Buscando histórico por hora no Meta…</div>}

          {!loading && series.length > 0 && (
            <>
              {verdict && <div className={`rounded-[8px] px-3 py-2 text-center text-[12px] font-bold ${verdict.cls}`}>{verdict.txt}</div>}

              {/* gráfico */}
              <div className="rounded-xl2 border border-border bg-surface2/40 p-2">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={series} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#8a90a2' }} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: '#8a90a2' }} width={34} />
                    <Tooltip
                      contentStyle={{ background: '#0d1220', border: '1px solid #ffffff18', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any, n: any) => [v ?? '—', n === 'cumRoas' ? 'ROAS acum.' : 'ROAS 3h']}
                    />
                    {baseline != null && <ReferenceLine y={baseline} stroke="#f7b955" strokeDasharray="4 4" label={{ value: `base ${baseline.toFixed(2)}`, fontSize: 9, fill: '#f7b955', position: 'insideTopRight' }} />}
                    <ReferenceLine y={m.settings.roasBe} stroke="#fb6f86" strokeDasharray="2 4" />
                    <ReferenceLine y={m.settings.roasGood} stroke="#46d989" strokeDasharray="2 4" />
                    <Line type="monotone" dataKey="bucketRoas" stroke="#5fa8ff" strokeWidth={1} dot={false} connectNulls name="ROAS 3h" opacity={0.55} />
                    <Line type="monotone" dataKey="cumRoas" stroke="#8b7cff" strokeWidth={2.4} dot={false} connectNulls name="ROAS acum." />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 pt-1 text-[10px] text-muted2">
                  <span className="text-[#8b7cff]">━ ROAS acumulado</span>
                  <span className="text-[#5fa8ff]">━ ROAS de cada 3h</span>
                  <span className="text-[#f7b955]">┄ base do aumento</span>
                  <span className="text-[#46d989]">┄ alvo {m.settings.roasGood}</span>
                  <span className="text-[#fb6f86]">┄ breakeven {m.settings.roasBe}</span>
                </div>
              </div>

              {/* tabela 3h */}
              <div className="rounded-xl2 border border-border overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted2">
                      <th className="py-1.5 pl-3 text-left">Janela 3h</th>
                      <th className="py-1.5 text-right">Gasto</th>
                      <th className="py-1.5 text-right">Vendas</th>
                      <th className="py-1.5 text-right">ROAS 3h</th>
                      <th className="py-1.5 pr-3 text-right">ROAS acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((s) => (
                      <tr key={s.label} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pl-3 text-muted">{s.label}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted2">{sym}{s.spend.toFixed(0)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted2">{s.sales}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{s.bucketRoas != null ? s.bucketRoas.toFixed(2) : '—'}</td>
                        <td className={`py-1.5 pr-3 text-right font-mono tabular-nums font-semibold ${s.cumRoas == null ? 'text-muted2' : baseline != null && s.cumRoas >= baseline ? 'text-ok' : 'text-ink'}`}>{s.cumRoas != null ? s.cumRoas.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted2">Reconstruído do histórico por hora do Meta (não precisa deixar aberto). "ROAS acum." soma gasto e faturamento desde o aumento — é o que mostra se o orçamento maior se sustentou. Janela fecha em 7 dias ou no próximo aumento.</p>
            </>
          )}
          {!loading && series.length === 0 && !err && <div className="py-6 text-center text-[12px] text-muted2">Sem gasto por hora nesse período ainda.</div>}
        </div>
      </div>
    </div>
  )
}
