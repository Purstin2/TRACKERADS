import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ShoppingCart, Download, MessageCircle, Search, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import {
  fetchOrders,
  statusMeta,
  STATUS_META,
  brl,
  waNumber,
  markWaSent,
  type KirvanoOrder,
} from './orders'

const RANGES = [
  { v: '1', label: 'Hoje' },
  { v: '7', label: '7 dias' },
  { v: '14', label: '14 dias' },
  { v: '30', label: '30 dias' },
  { v: '90', label: '90 dias' },
  { v: 'all', label: 'Tudo' },
]

// ordem dos cards de status no topo
const ORDER = ['APPROVED', 'ABANDONED', 'PENDING', 'REFUSED', 'CANCELED', 'REFUNDED', 'CHARGEBACK', 'EXPIRED']

function sinceISO(range: string): string | undefined {
  if (range === 'all') return undefined
  const d = new Date()
  d.setDate(d.getDate() - parseInt(range))
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function StatPill({ k, count, value, active, onClick }: { k: string; count: number; value: number; active: boolean; onClick: () => void }) {
  const meta = statusMeta(k)
  return (
    <button
      onClick={onClick}
      className={`flex min-w-[120px] flex-1 flex-col gap-1 rounded-xl2 border bg-surface px-3.5 py-3 text-left transition-all ${
        active ? 'border-brand ring-1 ring-brand/40' : 'border-border hover:border-border2'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted2">
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {meta.label}
      </div>
      <div className="text-[20px] font-extrabold leading-none">{count}</div>
      <div className="text-[11px] text-muted2">{brl(value)}</div>
    </button>
  )
}

export default function PedidosView() {
  const [orders, setOrders] = useState<KirvanoOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState('7')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [campaign, setCampaign] = useState('')
  const [search, setSearch] = useState('')
  const connected = !!supabase()

  async function load() {
    if (!connected) return
    setLoading(true)
    try {
      setOrders(await fetchOrders(sinceISO(range)))
    } catch (e: any) {
      toast('Erro ao carregar pedidos: ' + e.message, 'err')
    }
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [range])

  // agregados por status (em cima do conjunto do período, antes dos filtros de tabela)
  const byStatus = useMemo(() => {
    const m: Record<string, { count: number; value: number }> = {}
    orders.forEach((o) => {
      const s = (o.status || 'PENDING').toUpperCase()
      if (!m[s]) m[s] = { count: 0, value: 0 }
      m[s].count++
      m[s].value += o.value || 0
    })
    return m
  }, [orders])

  const campaigns = useMemo(() => {
    const s = new Set<string>()
    orders.forEach((o) => o.utm_campaign && s.add(o.utm_campaign))
    return [...s].sort()
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (statusFilter && (o.status || '').toUpperCase() !== statusFilter) return false
      if (campaign && o.utm_campaign !== campaign) return false
      if (q) {
        const hay = `${o.customer_name || ''} ${o.customer_email || ''} ${o.customer_phone || ''} ${o.product || ''} ${o.utm_campaign || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, statusFilter, campaign, search])

  const approvedRev = byStatus.APPROVED?.value || 0
  const abandonedCount = byStatus.ABANDONED?.count || 0
  const abandonedValue = byStatus.ABANDONED?.value || 0

  function waLink(o: KirvanoOrder) {
    const num = waNumber(o.customer_phone)
    if (!num) return ''
    const first = (o.customer_name || '').split(' ')[0]
    const oi = `Oi${first ? ' ' + first : ''}`
    const prod = o.product || 'nosso produto'
    const link = o.checkout_url ? ' ' + o.checkout_url : ''
    const st = (o.status || '').toUpperCase()
    let msg: string
    if (st === 'APPROVED') {
      msg = `${oi}! Vi aqui que sua compra do *${prod}* foi aprovada 🎉 Qualquer dúvida na entrega/acesso é só me chamar!`
    } else if (st === 'REFUSED' || st === 'CANCELED' || st === 'EXPIRED') {
      msg = `${oi}! Notei que o pagamento do *${prod}* não foi concluído. Quer que eu te ajude a finalizar?${link}`
    } else {
      // ABANDONED / PENDING / demais
      msg = `${oi}! Vi que você começou a compra do *${prod}* mas não finalizou. Posso te ajudar a concluir?${link}`
    }
    return `https://wa.me/${num}?text=${encodeURIComponent(msg.trim())}`
  }

  async function openWa(o: KirvanoOrder) {
    const link = waLink(o)
    if (!link) return toast('Sem telefone nesse pedido', 'warn')
    window.open(link, '_blank')
    await markWaSent(o.id)
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, wa_sent_at: new Date().toISOString() } : x)))
  }

  function exportCsv() {
    const cols = ['created_at', 'status', 'product', 'value', 'customer_name', 'customer_email', 'customer_phone', 'payment_method', 'utm_campaign', 'utm_source', 'checkout_url']
    const head = cols.join(',')
    const lines = filtered.map((o) =>
      cols
        .map((c) => {
          const v = (o as any)[c] ?? ''
          return `"${String(v).replace(/"/g, '""')}"`
        })
        .join(','),
    )
    const blob = new Blob([head + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pedidos_${statusFilter || 'todos'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  if (!connected) {
    return (
      <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
        Conecte a Supabase (aba Conexões do Tracker) pra ver os pedidos. A função do webhook grava em <code>kirvano_orders</code>.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-[8px] border border-border bg-surface2">
          {RANGES.map((r) => (
            <button
              key={r.v}
              onClick={() => setRange(r.v)}
              className={`px-3 py-1.5 text-[12px] font-semibold ${range === r.v ? 'bg-brand text-white' : 'text-muted2'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, e-mail, produto..."
              className="w-[230px] rounded-[7px] border border-border bg-[#0a0c19] py-1.5 pl-8 pr-2.5 text-[12px] text-ink"
            />
          </div>
          {campaigns.length > 0 && (
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="max-w-[200px] rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
              <option value="">Todas campanhas</option>
              {campaigns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* destaque: faturamento aprovado + carrinhos abandonados (o alvo do WhatsApp) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl2 border border-ok/25 bg-ok/[0.06] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Faturamento aprovado · {RANGES.find((r) => r.v === range)?.label}</div>
          <div className="text-[24px] font-extrabold text-ok">{brl(approvedRev)}</div>
          <div className="text-[11px] text-muted2">{byStatus.APPROVED?.count || 0} venda(s) aprovada(s)</div>
        </div>
        <button
          onClick={() => setStatusFilter('ABANDONED')}
          className="flex items-center justify-between rounded-xl2 border border-[#fbbf24]/30 bg-[#fbbf24]/[0.06] px-4 py-3 text-left hover:border-[#fbbf24]/60"
        >
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Carrinhos abandonados — recuperar no WhatsApp</div>
            <div className="text-[24px] font-extrabold text-[#fbbf24]">{abandonedCount}</div>
            <div className="text-[11px] text-muted2">{brl(abandonedValue)} em jogo · clique pra filtrar</div>
          </div>
          <ShoppingCart className="h-7 w-7 text-[#fbbf24]/70" />
        </button>
      </div>

      {/* pills por status */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter(null)}
          className={`flex min-w-[100px] flex-col gap-1 rounded-xl2 border bg-surface px-3.5 py-3 text-left transition-all ${
            !statusFilter ? 'border-brand ring-1 ring-brand/40' : 'border-border hover:border-border2'
          }`}
        >
          <div className="text-[11px] font-semibold text-muted2">Todos</div>
          <div className="text-[20px] font-extrabold leading-none">{orders.length}</div>
          <div className="text-[11px] text-muted2">no período</div>
        </button>
        {ORDER.filter((k) => byStatus[k]).map((k) => (
          <StatPill key={k} k={k} count={byStatus[k].count} value={byStatus[k].value} active={statusFilter === k} onClick={() => setStatusFilter(statusFilter === k ? null : k)} />
        ))}
      </div>

      {/* tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
          {orders.length === 0
            ? 'Nenhum pedido ainda. Configure o webhook na Kirvano (aba Webhook) com TODOS os eventos marcados — inclusive Carrinho abandonado.'
            : 'Nenhum pedido com esses filtros.'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                <th className="py-2.5 pl-4 text-left">Quando</th>
                <th className="py-2.5 text-left">Status</th>
                <th className="py-2.5 text-left">Cliente</th>
                <th className="py-2.5 text-left">Produto</th>
                <th className="py-2.5 text-right">Valor</th>
                <th className="py-2.5 text-left">Pgto</th>
                <th className="py-2.5 text-left">Campanha</th>
                <th className="py-2.5 pr-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const meta = statusMeta(o.status)
                const isAbandoned = (o.status || '').toUpperCase() === 'ABANDONED'
                return (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-surface2/40">
                    <td className="py-2 pl-4 font-mono text-[11px] text-muted2">{o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${meta.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="font-semibold text-ink">{o.customer_name || '—'}</div>
                      <div className="text-[10.5px] text-muted2">{o.customer_phone || o.customer_email || ''}</div>
                    </td>
                    <td className="max-w-[200px] truncate py-2" title={o.product || ''}>{o.product || '—'}</td>
                    <td className="py-2 text-right font-mono font-semibold">{brl(o.value)}</td>
                    <td className="py-2 text-[11px] text-muted2">{o.payment_method || '—'}</td>
                    <td className="max-w-[160px] truncate py-2 text-[11px] text-muted2" title={o.utm_campaign || ''}>{o.utm_campaign || '—'}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {o.customer_phone && (
                          <button
                            onClick={() => openWa(o)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-bold ${
                              o.wa_sent_at ? 'border-border2 bg-surface2 text-muted2' : 'border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20'
                            }`}
                            title={
                              o.wa_sent_at
                                ? `Mensagem já enviada em ${new Date(o.wa_sent_at).toLocaleString('pt-BR')}`
                                : 'Abrir WhatsApp com mensagem pronta'
                            }
                          >
                            <MessageCircle className="h-3 w-3" /> {o.wa_sent_at ? 'enviado' : isAbandoned ? 'recuperar' : 'WhatsApp'}
                          </button>
                        )}
                        {o.checkout_url && (
                          <a href={o.checkout_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10.5px] text-brand-2 hover:underline" title="Abrir checkout">
                            <ExternalLink className="h-3 w-3" /> checkout
                          </a>
                        )}
                        {!o.customer_phone && !o.checkout_url && <span className="text-muted2">—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted2">
        Mostrando {filtered.length} de {orders.length}. O botão <span className="text-[#25D366]">recuperar</span> abre o WhatsApp com a mensagem pronta — quando ligarmos o WhatsApp Business, isso vira disparo automático.
        {' '}Status que faturam: {Object.entries(STATUS_META).filter(([, m]) => m.revenue).map(([, m]) => m.label).join(', ')}.
      </p>
    </div>
  )
}
