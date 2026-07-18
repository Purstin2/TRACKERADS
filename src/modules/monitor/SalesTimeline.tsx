import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell } from 'recharts'
import { fetchCampaignSales, type CampSale } from './realRoas'

/**
 * "Vendas por horário" de UMA campanha: a hora exata em que cada venda caiu.
 *
 * Serve pra duas decisões:
 *   • a venda foi agora? (então vale subir orçamento pra pegar o embalo)
 *   • em qual FAIXA do dia essa campanha converte? (o gráfico por hora mostra
 *     se as vendas se concentram de manhã, à noite, etc.)
 *
 * Fonte: gateway (kirvano_orders) — única com hora exata da venda. O Meta só
 * entrega agregado do dia/hora, sem o instante de cada pedido.
 */

const BR_OFFSET_MS = 3 * 3600000
const dayBR = (ms: number) => new Date(ms - BR_OFFSET_MS).toISOString().slice(0, 10)
const startOfDayBR = (d: string) => new Date(`${d}T00:00:00-03:00`).toISOString()
/** Hora (0-23) no fuso BR — mesma régua do gasto por hora do Meta. */
const hourBR = (iso: string) => new Date(new Date(iso).getTime() - BR_OFFSET_MS).getUTCHours()
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const ddmm = (iso: string) => { const d = dayBR(new Date(iso).getTime()); return d.slice(8) + '/' + d.slice(5, 7) }

const PERIODOS = [
  { label: 'Hoje', dias: 0 },
  { label: '7 dias', dias: 7 },
  { label: '30 dias', dias: 30 },
]

export function SalesTimelineModal({ name, campId, onClose }: { name: string; campId: string; onClose: () => void }) {
  const [periodo, setPeriodo] = useState(PERIODOS[0])
  const [vendas, setVendas] = useState<CampSale[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let vivo = true
    setVendas(null); setErr('')
    const hoje = dayBR(Date.now())
    const since =
      periodo.dias === 0 ? startOfDayBR(hoje) : new Date(Date.now() - periodo.dias * 86400000).toISOString()
    fetchCampaignSales(campId, since)
      .then((v) => vivo && setVendas(v))
      .catch((e) => vivo && (setErr(e.message || 'falha ao buscar vendas'), setVendas([])))
    return () => { vivo = false }
  }, [campId, periodo])

  const total = (vendas || []).reduce((s, v) => s + v.value, 0)

  // distribuição por hora (0-23) — mostra a faixa do dia que converte
  const porHora = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hora: String(i).padStart(2, '0'), label: `${String(i).padStart(2, '0')}h`, vendas: 0, valor: 0 }))
    ;(vendas || []).forEach((v) => { const i = hourBR(v.at); h[i].vendas += 1; h[i].valor += v.value })
    return h
  }, [vendas])
  const maxHora = Math.max(...porHora.map((h) => h.vendas), 0)

  // agrupa a lista por dia (só rotula o dia quando o período tem mais de um)
  const porDia = useMemo(() => {
    const m = new Map<string, CampSale[]>()
    ;(vendas || []).forEach((v) => {
      const d = dayBR(new Date(v.at).getTime())
      ;(m.get(d) || m.set(d, []).get(d)!).push(v)
    })
    return [...m.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
  }, [vendas])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-h-[88vh] w-full max-w-[620px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-bold" title={name}>🕒 Vendas por horário</h3>
            <div className="truncate text-[11px] text-muted2" title={name}>{name}</div>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="card-body flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODOS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPeriodo(p)}
                className={`rounded-[7px] border px-2.5 py-1 text-[11.5px] font-semibold ${periodo.label === p.label ? 'border-brand bg-brand/10 text-brand-2' : 'border-border text-muted2 hover:border-brand/40'}`}
              >
                {p.label}
              </button>
            ))}
            {vendas && (
              <span className="ml-auto text-[12px]">
                <b className="text-ink">{vendas.length}</b> <span className="text-muted2">venda{vendas.length === 1 ? '' : 's'} ·</span>{' '}
                <b className="text-ok">R${total.toFixed(2)}</b>
              </span>
            )}
          </div>

          {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>}
          {vendas === null && <div className="py-8 text-center text-[12px] text-muted2 animate-pulse">Buscando vendas…</div>}
          {vendas && vendas.length === 0 && !err && (
            <div className="rounded-[8px] border border-border bg-surface2/40 px-3 py-8 text-center text-[12px] text-muted2">
              Nenhuma venda nesse período.
            </div>
          )}

          {vendas && vendas.length > 0 && (
            <>
              {/* em que hora do dia essa campanha vende */}
              <div className="rounded-xl2 border border-border bg-surface2/40 p-2">
                <div className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted2">Vendas por hora do dia (BR)</div>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={porHora} margin={{ top: 4, right: 6, left: -28, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#545c84' }} axisLine={false} tickLine={false} interval={1} />
                    <Tooltip
                      cursor={{ fill: 'rgba(99,102,241,.08)' }}
                      contentStyle={{ background: '#0d0f1e', border: '1px solid #1d2139', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any, n: any) => (n === 'vendas' ? [`${v} venda(s)`, ''] : [v, n])}
                      labelFormatter={(l) => `${l}`}
                    />
                    <Bar dataKey="vendas" radius={[3, 3, 0, 0]}>
                      {porHora.map((h, i) => (
                        <Cell key={i} fill={h.vendas === 0 ? '#1d2139' : h.vendas === maxHora ? '#10b981' : '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* quando caiu cada venda */}
              <div className="flex flex-col gap-2">
                {porDia.map(([dia, lista]) => (
                  <div key={dia}>
                    {porDia.length > 1 && (
                      <div className="mb-1 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted2">
                        {dia.slice(8) + '/' + dia.slice(5, 7)}
                        <span className="text-muted2/70">· {lista.length} venda{lista.length === 1 ? '' : 's'} · R${lista.reduce((s, v) => s + v.value, 0).toFixed(2)}</span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      {lista.map((v, i) => {
                        const min = (Date.now() - new Date(v.at).getTime()) / 60000
                        const quente = min <= 15
                        return (
                          <div key={i} className={`flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[12px] ${quente ? 'bg-ok/[0.08]' : 'hover:bg-surface2/40'}`}>
                            <span className={`font-mono font-bold tabular-nums ${quente ? 'text-ok' : 'text-ink'}`}>{hhmm(v.at)}</span>
                            {porDia.length === 1 && <span className="font-mono text-[10px] text-muted2">{ddmm(v.at)}</span>}
                            <span className="min-w-0 flex-1 truncate text-muted2" title={v.product || ''}>{v.product || '—'}</span>
                            <span className="shrink-0 font-mono tabular-nums text-ok">R${v.value.toFixed(2)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] text-muted2">
            Hora exata de cada venda, do gateway (o Meta só dá agregado do dia). Verde = venda nos últimos 15 min.
            No gráfico, a barra verde é a hora que mais vendeu.
          </p>
        </div>
      </div>
    </div>
  )
}
