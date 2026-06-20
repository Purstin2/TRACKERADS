import { useEffect, useState } from 'react'
import { RefreshCw, Send, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import { fetchNaoTrackeado, refireCapi, brl, type KirvanoOrder } from './orders'

const LS_SECRET = 'purstin_pixel'
function getSecret(): string {
  try { return JSON.parse(localStorage.getItem(LS_SECRET) || '{}').webhookSecret || '' } catch { return '' }
}

interface RowState {
  utmSource: string
  utmCampaign: string
  utmMedium: string
  utmContent: string
  loading: boolean
  result: { ok: boolean; msg: string } | null
  open: boolean
}

export default function NaoTrackeadoView() {
  const [orders, setOrders] = useState<KirvanoOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Record<string, RowState>>({})
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
            utmMedium: o.utm_medium || '',
            utmContent: o.utm_content || '',
            loading: false,
            result: null,
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

  async function fire(o: KirvanoOrder) {
    const secret = getSecret()
    if (!secret) return toast('Defina o Segredo do Webhook na aba Conexões primeiro', 'err')
    const r = rows[o.id]
    setRow(o.id, { loading: true, result: null })
    try {
      const res = await refireCapi(secret, o.id, {
        utmSource: r.utmSource || undefined,
        utmCampaign: r.utmCampaign || undefined,
        utmMedium: r.utmMedium || undefined,
        utmContent: r.utmContent || undefined,
      })
      if (res.ok) {
        setRow(o.id, { loading: false, result: { ok: true, msg: `✓ Enviado ao pixel ${res.pixel} · fbtrace ${res.fbtrace_id}` } })
        // remove da lista local
        setOrders((prev) => prev.filter((x) => x.id !== o.id))
        toast('Purchase enviado ao Meta!', 'ok')
      } else {
        setRow(o.id, { loading: false, result: { ok: false, msg: `✗ ${res.error || 'falhou'}${res.details ? ' — ' + res.details : ''}` } })
        toast('CAPI falhou: ' + (res.error || 'ver detalhe'), 'err')
      }
    } catch (e: any) {
      setRow(o.id, { loading: false, result: { ok: false, msg: '✗ Falha de rede' } })
    }
  }

  async function fireAll() {
    const secret = getSecret()
    if (!secret) return toast('Defina o Segredo do Webhook na aba Conexões primeiro', 'err')
    for (const o of orders) {
      if (rows[o.id]?.result?.ok) continue
      await fire(o)
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  if (!connected) {
    return <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">Conecte a Supabase pra ver pedidos não trackeados.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <div className="text-[13px] font-bold">Vendas sem CAPI ({orders.length})</div>
          <div className="text-[11px] text-muted2">Aprovadas mas sem Purchase no Meta. Corrija UTMs se necessário e dispare.</div>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {orders.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={fireAll}>
              <Send className="h-3.5 w-3.5" /> Disparar tudo ({orders.length})
            </button>
          )}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
          {loading ? 'Carregando…' : '🎉 Todas as vendas aprovadas foram enviadas ao Meta.'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                <th className="w-6 py-2.5 pl-3" />
                <th className="py-2.5 text-left">Quando</th>
                <th className="py-2.5 text-left">Cliente</th>
                <th className="py-2.5 text-left">Produto</th>
                <th className="py-2.5 text-right">Valor</th>
                <th className="py-2.5 text-left">UTM fonte / campanha</th>
                <th className="py-2.5 pr-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const r = rows[o.id]
                if (!r) return null
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
                      <td className="max-w-[180px] truncate py-2" title={o.product || ''}>{o.product || '—'}</td>
                      <td className="py-2 text-right font-mono font-semibold">{brl(o.value)}</td>
                      <td className="py-2 text-[11px] text-muted2">
                        {o.utm_source || '—'} {o.utm_campaign ? `· ${o.utm_campaign}` : ''}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {r.result?.ok ? (
                          <CheckCircle2 className="ml-auto h-4 w-4 text-ok" />
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => fire(o)}
                            disabled={r.loading}
                          >
                            {r.loading ? '…' : <><Send className="h-3 w-3" /> Disparar</>}
                          </button>
                        )}
                      </td>
                    </tr>
                    {r.open && (
                      <tr className="border-b border-border/50 bg-[#0a0c19]">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="mb-2 text-[11px] font-semibold text-muted2">Editar UTMs antes de disparar (opcional)</div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            {(['utmSource', 'utmCampaign', 'utmMedium', 'utmContent'] as const).map((k) => (
                              <div key={k} className="field">
                                <label className="!text-[10px]">{k.replace('utm', 'utm_').replace(/([A-Z])/g, '_$1').toLowerCase().replace('utm__', 'utm_')}</label>
                                <input
                                  value={r[k]}
                                  onChange={(e) => setRow(o.id, { [k]: e.target.value } as any)}
                                  className="!text-[11px]"
                                  placeholder={k === 'utmSource' ? 'FB' : k === 'utmMedium' ? 'cpc' : ''}
                                />
                              </div>
                            ))}
                          </div>
                          {r.result && !r.result.ok && (
                            <div className="mt-2 text-[11px] text-danger">{r.result.msg}</div>
                          )}
                          <button
                            className="btn btn-primary btn-sm mt-2"
                            onClick={() => fire(o)}
                            disabled={r.loading}
                          >
                            {r.loading ? 'Enviando…' : <><Send className="h-3 w-3" /> Disparar Purchase</>}
                          </button>
                        </td>
                      </tr>
                    )}
                    {r.result?.ok && (
                      <tr className="border-b border-border/50 bg-ok/[0.04]">
                        <td colSpan={7} className="px-4 py-2 text-[11px] text-ok">
                          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{r.result.msg}
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
        <b className="text-ink">Este disparo atualiza SOMENTE o <code>capi_ok</code></b> — não altera produto, pagamento ou qualquer outro campo do pedido.
        Se o pixel certo não estiver cadastrado na aba Pixels, o disparo vai falhar (sem rota = sem envio).
      </div>
    </div>
  )
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
