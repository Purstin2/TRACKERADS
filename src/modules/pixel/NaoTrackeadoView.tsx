import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send, ChevronDown, ChevronRight, CheckCircle2, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import { fetchNaoTrackeado, refireCapi, brl, type NaoTrackeadoOrder, type TrackIssue } from './orders'

const LS_SECRET = 'purstin_pixel'
function getSecret(): string {
  try { return JSON.parse(localStorage.getItem(LS_SECRET) || '{}').webhookSecret || '' } catch { return '' }
}

const ISSUE_META: Record<TrackIssue, { label: string; cls: string; dot: string; desc: string; canRefire: boolean }> = {
  erro_envio: {
    label: 'Não enviada',
    cls: 'text-danger border-danger/30 bg-danger/10',
    dot: 'bg-danger',
    desc: 'Erro de config (sem rota de pixel/token). NÃO chegou ao Meta — o disparo resolve.',
    canRefire: true,
  },
  organico: {
    label: 'Orgânico / bio',
    cls: 'text-[#fbbf24] border-[#fbbf24]/30 bg-[#fbbf24]/10',
    dot: 'bg-[#fbbf24]',
    desc: 'Veio do Instagram (bio/story). Foi pro Meta, mas SEM clique de anúncio → o Meta não otimiza a campanha. Só reatribui se você colar o fbclid do anúncio real.',
    canRefire: true,
  },
  sem_campanha: {
    label: 'Sem campanha',
    cls: 'text-muted2 border-border2 bg-surface2',
    dot: 'bg-muted2',
    desc: 'Acesso direto, sem UTM de campanha. Mesmo caso: o Meta não tem em qual campanha otimizar.',
    canRefire: true,
  },
}

interface RowState {
  utmSource: string
  utmCampaign: string
  fbclid: string
  loading: boolean
  done: boolean
  err: string | null
  open: boolean
}

export default function NaoTrackeadoView() {
  const [orders, setOrders] = useState<NaoTrackeadoOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [filter, setFilter] = useState<TrackIssue | 'all'>('all')
  const connected = !!supabase()

  async function load() {
    if (!connected) return
    setLoading(true)
    try {
      const data = await fetchNaoTrackeado()
      setOrders(data)
      setRows((prev) => {
        const next: Record<string, RowState> = {}
        data.forEach((o) => {
          next[o.id] = prev[o.id] || {
            utmSource: o.utm_source || '',
            utmCampaign: o.utm_campaign || '',
            fbclid: '',
            loading: false,
            done: false,
            err: null,
            open: false,
          }
        })
        return next
      })
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))
  }

  const counts = useMemo(() => {
    const c: Record<string, { n: number; v: number }> = {}
    orders.forEach((o) => {
      const k = o.issue
      if (!c[k]) c[k] = { n: 0, v: 0 }
      c[k].n++; c[k].v += o.value || 0
    })
    return c
  }, [orders])

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.issue === filter)),
    [orders, filter],
  )

  async function fire(o: NaoTrackeadoOrder) {
    const secret = getSecret()
    if (!secret) return toast('Defina o Segredo do Webhook na aba Conexões primeiro', 'err')
    const r = rows[o.id]
    setRow(o.id, { loading: true, err: null })
    try {
      const res = await refireCapi(secret, o.id, {
        utmSource: r.utmSource || undefined,
        utmCampaign: r.utmCampaign || undefined,
        fbclid: r.fbclid.trim() || undefined,
      })
      if (res.ok) {
        setRow(o.id, { loading: false, done: true })
        toast(`Enviado ao pixel ${res.pixel}`, 'ok')
      } else {
        setRow(o.id, { loading: false, err: `${res.error || 'falhou'}${res.details ? ' — ' + res.details : ''}` })
        toast('Falhou: ' + (res.error || 'ver detalhe'), 'err')
      }
    } catch {
      setRow(o.id, { loading: false, err: 'Falha de rede' })
    }
  }

  if (!connected) {
    return <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">Conecte a Supabase pra ver pedidos não trackeados.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* explicação do que é isto */}
      <div className="flex gap-2 rounded-[8px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.06] px-3.5 py-2.5 text-[11.5px] text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-2" />
        <div>
          Vendas aprovadas que <b className="text-ink">não trackearam a campanha</b> no Meta. O Meta atribui por <b>clique de anúncio (fbc)</b>, não por UTM —
          então quem entra pela <b>bio do Instagram</b> aparece como orgânico e não otimiza a campanha. Pra reatribuir <b>de verdade</b>, cole o <b>fbclid do anúncio real</b> (o
          campo UTM sozinho só serve de registro, não muda a atribuição).
        </div>
      </div>

      {/* filtros por motivo */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold ${filter === 'all' ? 'border-brand bg-brand/10 text-brand-2' : 'border-border text-muted2'}`}
        >
          Todas ({orders.length})
        </button>
        {(Object.keys(ISSUE_META) as TrackIssue[]).map((k) => {
          const m = ISSUE_META[k]
          const c = counts[k]
          if (!c) return null
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold ${filter === k ? m.cls : 'border-border text-muted2'}`}
            >
              <span className={`h-2 w-2 rounded-full ${m.dot}`} /> {m.label} ({c.n}) · {brl(c.v)}
            </button>
          )
        })}
        <button className="btn btn-ghost btn-sm ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
          {loading ? 'Carregando…' : '🎉 Nenhuma venda com problema de tracking nos últimos 30 dias.'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                <th className="w-6 py-2.5 pl-3" />
                <th className="py-2.5 text-left">Quando</th>
                <th className="py-2.5 text-left">Cliente</th>
                <th className="py-2.5 text-left">Motivo</th>
                <th className="py-2.5 text-right">Valor</th>
                <th className="py-2.5 text-left">UTM source / campanha</th>
                <th className="py-2.5 pr-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const r = rows[o.id]
                if (!r) return null
                const m = ISSUE_META[o.issue]
                return (
                  <RowGroup key={o.id}>
                    <tr className="border-b border-border/50 hover:bg-surface2/40">
                      <td className="py-2 pl-3">
                        <button onClick={() => setRow(o.id, { open: !r.open })} className="text-muted2">
                          {r.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className="py-2 font-mono text-[11px] text-muted2">
                        {o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="py-2">
                        <div className="font-semibold">{o.customer_name || '—'}</div>
                        <div className="text-[10.5px] text-muted2">{o.customer_email || o.customer_phone || ''}</div>
                      </td>
                      <td className="py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} /> {m.label}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono font-semibold">{brl(o.value)}</td>
                      <td className="max-w-[200px] truncate py-2 text-[11px] text-muted2" title={`${o.utm_source || ''} / ${o.utm_campaign || ''}`}>
                        {o.utm_source || '—'}{o.utm_campaign ? ` · ${o.utm_campaign}` : ''}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {r.done ? (
                          <CheckCircle2 className="ml-auto h-4 w-4 text-ok" />
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => setRow(o.id, { open: true })}>
                            {o.issue === 'erro_envio' ? 'Reenviar' : 'Reatribuir'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {r.open && !r.done && (
                      <tr className="border-b border-border/50 bg-[#0a0c19]">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="mb-2 text-[11px] text-muted2">{m.desc}</div>
                          {/* UTMs capturadas — referência p/ rastrear conjunto|id e anúncio|id no gerenciador */}
                          <div className="mb-2 grid gap-1 rounded-[7px] border border-border bg-surface2/40 px-3 py-2 text-[11px] sm:grid-cols-2">
                            {([
                              ['campanha', o.utm_campaign],
                              ['source', o.utm_source],
                              ['conjunto (medium)', o.utm_medium],
                              ['anúncio (content)', o.utm_content],
                            ] as const).map(([lbl, val]) => (
                              <div key={lbl} className="flex items-baseline gap-1.5">
                                <span className="shrink-0 text-[9.5px] uppercase tracking-wide text-muted2">{lbl}:</span>
                                <span className="truncate font-mono text-ink" title={val || ''}>{val || '—'}</span>
                              </div>
                            ))}
                          </div>
                          {o.issue !== 'erro_envio' && (
                            <div className="field mb-2">
                              <label className="!text-[10.5px] !text-brand-2">fbclid do anúncio real (cole da UTMIFY / link do anúncio) — é o que reatribui a campanha</label>
                              <input
                                value={r.fbclid}
                                onChange={(e) => setRow(o.id, { fbclid: e.target.value })}
                                className="!text-[11px] font-mono"
                                placeholder="IwAR... ou PAZ...adid..."
                              />
                            </div>
                          )}
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="field">
                              <label className="!text-[10px]">utm_source</label>
                              <input value={r.utmSource} onChange={(e) => setRow(o.id, { utmSource: e.target.value })} className="!text-[11px]" placeholder="FB" />
                            </div>
                            <div className="field">
                              <label className="!text-[10px]">utm_campaign (registro)</label>
                              <input value={r.utmCampaign} onChange={(e) => setRow(o.id, { utmCampaign: e.target.value })} className="!text-[11px]" />
                            </div>
                          </div>
                          {r.err && <div className="mt-2 text-[11px] text-danger">✗ {r.err}</div>}
                          <button className="btn btn-primary btn-sm mt-2" onClick={() => fire(o)} disabled={r.loading}>
                            {r.loading ? 'Enviando…' : <><Send className="h-3 w-3" /> Disparar Purchase</>}
                          </button>
                          {o.issue !== 'erro_envio' && !r.fbclid.trim() && (
                            <span className="ml-2 text-[10.5px] text-warn">⚠ sem fbclid, o Meta continua sem atribuir a campanha</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </RowGroup>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-[8px] border border-warn/20 border-l-[3px] border-l-warn bg-warn/[0.06] px-3.5 py-2.5 text-[11.5px] text-muted">
        <b className="text-ink">Daqui pra frente isso se resolve sozinho:</b> o fbtrack novo guarda o <b>primeiro clique pago</b> em cookie (90 dias) e reanexa quando a pessoa volta pela bio —
        a venda já chega com a campanha certa. As antigas aqui só dá pra reatribuir colando o fbclid do anúncio manualmente. O disparo atualiza <b>só o capi_ok</b>, não mexe em produto/pagamento.
      </div>
    </div>
  )
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
