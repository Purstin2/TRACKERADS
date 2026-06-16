import { supabase } from '@/lib/supabase'

export interface KirvanoOrder {
  id: string
  checkout_id: string | null
  sale_id: string | null
  event: string | null
  status: string | null
  value: number | null
  currency: string | null
  product: string | null
  products: any[] | null
  payment_method: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  customer_doc: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  checkout_url: string | null
  capi_ok: boolean | null
  recovered: boolean | null
  wa_sent_at: string | null
  ordered_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface WebhookLog {
  id: string
  gateway: string | null
  event: string | null
  status: string | null
  ok: boolean | null
  http_status: number | null
  secret_ok: boolean | null
  capi_ok: boolean | null
  message: string | null
  ip: string | null
  raw: any
  created_at: string | null
}

/** Metadados de cada status: rótulo PT + cor + se conta como faturamento. */
export const STATUS_META: Record<string, { label: string; cls: string; dot: string; revenue?: boolean }> = {
  APPROVED:   { label: 'Aprovada',   cls: 'text-ok border-ok/30 bg-ok/10',           dot: 'bg-ok',      revenue: true },
  PENDING:    { label: 'Pendente',   cls: 'text-warn border-warn/30 bg-warn/10',     dot: 'bg-warn' },
  REFUSED:    { label: 'Recusada',   cls: 'text-danger border-danger/30 bg-danger/10', dot: 'bg-danger' },
  CANCELED:   { label: 'Cancelada',  cls: 'text-muted2 border-border2 bg-surface2',  dot: 'bg-muted2' },
  REFUNDED:   { label: 'Reembolsada', cls: 'text-[#c084fc] border-[#c084fc]/30 bg-[#c084fc]/10', dot: 'bg-[#c084fc]' },
  CHARGEBACK: { label: 'Chargeback', cls: 'text-[#fb7185] border-[#fb7185]/30 bg-[#fb7185]/10', dot: 'bg-[#fb7185]' },
  EXPIRED:    { label: 'Expirada',   cls: 'text-muted2 border-border2 bg-surface2',  dot: 'bg-muted2' },
  ABANDONED:  { label: 'Carrinho abandonado', cls: 'text-[#fbbf24] border-[#fbbf24]/30 bg-[#fbbf24]/10', dot: 'bg-[#fbbf24]' },
}

export const statusMeta = (s?: string | null) =>
  STATUS_META[(s || '').toUpperCase()] || { label: s || '—', cls: 'text-muted2 border-border2 bg-surface2', dot: 'bg-muted2' }

export const brl = (v?: number | null) =>
  'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Telefone só com dígitos, com DDI 55 se faltar — pronto pro link do WhatsApp. */
export function waNumber(phone?: string | null): string {
  if (!phone) return ''
  let d = phone.replace(/\D/g, '')
  if (d.length <= 11) d = '55' + d
  return d
}

export async function fetchOrders(sinceISO?: string): Promise<KirvanoOrder[]> {
  const sb = supabase()
  if (!sb) return []
  let q = sb.from('kirvano_orders').select('*').order('created_at', { ascending: false }).limit(2000)
  if (sinceISO) q = q.gte('created_at', sinceISO)
  const { data } = await q
  return (data || []) as KirvanoOrder[]
}

export async function fetchLogs(limit = 100): Promise<WebhookLog[]> {
  const sb = supabase()
  if (!sb) return []
  const { data } = await sb.from('kirvano_webhook_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  return (data || []) as WebhookLog[]
}

/** Marca um carrinho como "mensagem enviada" (uso futuro pelo WhatsApp). */
export async function markWaSent(id: string) {
  const sb = supabase()
  if (!sb) return
  await sb.from('kirvano_orders').update({ wa_sent_at: new Date().toISOString() }).eq('id', id)
}
