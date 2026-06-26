import { useEffect, useState } from 'react'
import { BarChart3, X, ArrowRight } from 'lucide-react'
import { useMonitor } from './MonitorContext'
import { increasesForDay, impactDays, type ActionEntry } from './actionLog'
import { fetchCampDaily, getRevenue, getSales } from '@/lib/meta'

const curSym = (c: string) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : 'R$')

interface Win { spend: number; sales: number; revenue: number }
const ZERO: Win = { spend: 0, sales: 0, revenue: 0 }
const revOf = (e: ActionEntry): number => (e.spendAtTime != null && e.roasAtTime != null ? e.spendAtTime * e.roasAtTime : 0)
const snapOf = (e: ActionEntry): Win => ({ spend: e.spendAtTime || 0, sales: e.salesAtTime || 0, revenue: revOf(e) })
const sub = (a: Win, b: Win): Win => ({
  spend: Math.max(0, a.spend - b.spend),
  sales: Math.max(0, a.sales - b.sales),
  revenue: Math.max(0, a.revenue - b.revenue),
})
const roasOf = (w: Win) => (w.spend > 0 ? w.revenue / w.spend : null)
const cpaOf = (w: Win) => (w.sales > 0 ? w.spend / w.sales : null)
const hourBR = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** Botão 📊 que abre as tabelas de impacto dos aumentos de orçamento da campanha.
 *  Só aparece se a campanha tem pelo menos 1 aumento real com foto registrada. */
export function ImpactBtn({ accId, name, campId, cur }: { accId: string; name: string; campId: string; cur: string }) {
  const [open, setOpen] = useState(false)
  const days = impactDays(campId)
  if (!days.length) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Impacto dos aumentos de orçamento"
        className="inline-flex items-center gap-0.5 rounded border border-brand/40 bg-brand/5 px-1.5 py-0.5 text-[10px] font-bold text-brand-2 hover:bg-brand/15"
      >
        <BarChart3 className="h-3 w-3" /> impacto
      </button>
      {open && <ImpactModal accId={accId} name={name} campId={campId} cur={cur} days={days} onClose={() => setOpen(false)} />}
    </>
  )
}

function ImpactModal({ accId, name, campId, cur, days, onClose }: { accId: string; name: string; campId: string; cur: string; days: string[]; onClose: () => void }) {
  const m = useMonitor()
  const sym = curSym(cur)
  const [day, setDay] = useState(days[0])
  const [eod, setEod] = useState<Win | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // total do dia da campanha (gasto Meta + fat/vendas) — fecha a janela "depois" do último aumento
  useEffect(() => {
    let alive = true
    setLoading(true); setErr('')
    fetchCampDaily(accId, campId, m.token.trim(), 60)
      .then((rows: any[]) => {
        if (!alive) return
        const row = (rows || []).find((r) => (r.date_start as string) === day)
        if (row) setEod({ spend: parseFloat(row.spend || '0'), sales: getSales(row), revenue: getRevenue(row) || 0 })
        else setEod(ZERO)
        setLoading(false)
      })
      .catch((e) => { if (alive) { setErr(e.message || 'falha ao buscar o dia'); setLoading(false) } })
    return () => { alive = false }
  }, [day, accId, campId])

  const incs = increasesForDay(campId, day)
  const tables = incs.map((e, i) => {
    const prev = i > 0 ? snapOf(incs[i - 1]) : ZERO
    const next = i < incs.length - 1 ? snapOf(incs[i + 1]) : (eod || snapOf(e))
    return { e, before: sub(snapOf(e), prev), after: sub(next, snapOf(e)), isLast: i === incs.length - 1 }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[620px] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-bold" title={name}>📊 Impacto do orçamento</h3>
            <div className="truncate text-[11px] text-muted2" title={name}>{name}</div>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="card-body flex flex-col gap-3">
          {/* seletor de dia */}
          {days.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted2">Dia:</span>
              {days.map((d) => (
                <button key={d} onClick={() => setDay(d)}
                  className={`rounded-[7px] border px-2 py-1 text-[11px] font-semibold ${d === day ? 'border-brand bg-brand/10 text-brand-2' : 'border-border text-muted2 hover:border-brand/40'}`}>
                  {d.slice(8) + '/' + d.slice(5, 7)}
                </button>
              ))}
            </div>
          )}

          {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>}

          <p className="text-[11px] text-muted2">
            Cada tabela isola <b>um aumento</b>: <b>Antes</b> = janela desde o aumento anterior (ou início do dia) até este ·
            <b> Depois</b> = deste aumento até o próximo (ou fim do dia).
            {loading && <span className="ml-1 animate-pulse text-brand-2">buscando total do dia…</span>}
          </p>

          {tables.map(({ e, before, after, isLast }, i) => {
            const rb = roasOf(before), ra = roasOf(after)
            const melhorou = rb != null && ra != null ? ra >= rb : null
            const rowsCmp: { lbl: string; b: string; a: string; good?: boolean | null }[] = [
              { lbl: 'Orçamento/dia', b: `${sym}${(e.budgetBefore ?? 0).toFixed(2)}`, a: `${sym}${(e.budgetAfter ?? 0).toFixed(2)}` },
              { lbl: 'Gasto', b: `${sym}${before.spend.toFixed(2)}`, a: `${sym}${after.spend.toFixed(2)}` },
              { lbl: 'Vendas', b: String(before.sales), a: String(after.sales) },
              { lbl: 'Faturamento', b: `${sym}${before.revenue.toFixed(2)}`, a: `${sym}${after.revenue.toFixed(2)}` },
              { lbl: 'ROAS', b: rb == null ? '—' : rb.toFixed(2), a: ra == null ? '—' : ra.toFixed(2), good: melhorou },
              { lbl: 'CPA', b: cpaOf(before) == null ? '—' : `${sym}${cpaOf(before)!.toFixed(2)}`, a: cpaOf(after) == null ? '—' : `${sym}${cpaOf(after)!.toFixed(2)}` },
            ]
            return (
              <div key={e.id} className="rounded-xl2 border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-surface2 px-3 py-2">
                  <div className="flex items-center gap-2 text-[12px] font-bold">
                    <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand-2">Aumento {i + 1}</span>
                    <span className="text-muted">{hourBR(e.ts)}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-ink">
                      {sym}{(e.budgetBefore ?? 0).toFixed(0)} <ArrowRight className="h-3 w-3 text-ok" /> {sym}{(e.budgetAfter ?? 0).toFixed(0)}
                    </span>
                  </div>
                  {melhorou != null && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${melhorou ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'}`}>
                      {melhorou ? '✅ ROAS melhorou' : '❌ ROAS piorou'}
                    </span>
                  )}
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted2">
                      <th className="py-1.5 pl-3 text-left">Métrica</th>
                      <th className="py-1.5 text-right">Antes</th>
                      <th className="py-1.5 pr-3 text-right">Depois{isLast && !loading ? ' (até agora)' : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsCmp.map((rc) => (
                      <tr key={rc.lbl} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pl-3 text-muted">{rc.lbl}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted2">{rc.b}</td>
                        <td className={`py-1.5 pr-3 text-right font-mono tabular-nums font-semibold ${rc.good == null ? 'text-ink' : rc.good ? 'text-ok' : 'text-danger'}`}>{rc.a}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {!incs.length && <div className="py-6 text-center text-[12px] text-muted2">Sem aumentos com foto neste dia.</div>}
          <p className="text-[10px] text-muted2">Gasto/dia vêm do Meta; faturamento usa o ROAS do momento (antes) e o relatado pelo Meta (dia). A janela "depois" do último aumento fecha no total do dia atual.</p>
        </div>
      </div>
    </div>
  )
}
