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
  manual: boolean | null
  recovered: boolean | null
  wa_sent_at: string | null
  wa_status: string | null
  wa_attempts: number | null
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

export async function fetchOrders(sinceISO?: string, untilISO?: string): Promise<KirvanoOrder[]> {
  const sb = supabase()
  if (!sb) return []
  let q = sb.from('kirvano_orders').select('*').order('created_at', { ascending: false }).limit(2000)
  if (sinceISO) q = q.gte('created_at', sinceISO)
  if (untilISO) q = q.lt('created_at', untilISO)
  const { data } = await q
  return (data || []) as KirvanoOrder[]
}

/** Reembolsos/chargebacks que ACONTECERAM no período (por data do estorno = updated_at),
 *  mesmo que a venda original seja antiga. É o que a UTMify mostra — captura os estornos
 *  manuais de vendas antigas, que o filtro por data-da-venda deixaria de fora. */
export async function fetchRefundsByRefundDate(sinceISO: string, untilISO: string): Promise<KirvanoOrder[]> {
  const sb = supabase()
  if (!sb) return []
  const { data } = await sb
    .from('kirvano_orders')
    .select('*')
    .in('status', ['REFUNDED', 'CHARGEBACK'])
    .gte('updated_at', sinceISO)
    .lte('updated_at', untilISO)
    .order('updated_at', { ascending: false })
    .limit(2000)
  return (data || []) as KirvanoOrder[]
}

export async function fetchLogs(limit = 100): Promise<WebhookLog[]> {
  const sb = supabase()
  if (!sb) return []
  const { data } = await sb.from('kirvano_webhook_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  return (data || []) as WebhookLog[]
}

/** Marca um carrinho como "mensagem enviada" (disparo manual pelo wa.me). */
export async function markWaSent(id: string) {
  const sb = supabase()
  if (!sb) return
  await sb.from('kirvano_orders').update({ wa_sent_at: new Date().toISOString(), wa_status: 'sent' }).eq('id', id)
}

/* ── Recuperação automática (config + disparo via API) ── */
export interface WaConfig {
  enabled: boolean
  delay_minutes: number
  max_attempts: number
  window_hours: number
  template: string
  provider: string
  only_with_phone: boolean
}

export async function fetchWaConfig(): Promise<WaConfig | null> {
  const sb = supabase()
  if (!sb) return null
  const { data } = await sb.from('wa_config').select('*').eq('id', 1).single()
  return (data as WaConfig) || null
}

export async function saveWaConfig(cfg: Partial<WaConfig>) {
  const sb = supabase()
  if (!sb) return
  await sb.from('wa_config').update({ ...cfg, updated_at: new Date().toISOString() }).eq('id', 1)
}

/** Dispara a recuperação pelo endpoint serverless. ids = lote manual; vazio = roda a fila. */
export async function triggerRecover(secret: string, ids?: string[]): Promise<any> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const qs = new URLSearchParams({ secret })
  if (ids?.length) qs.set('ids', ids.join(','))
  const r = await fetch(`${origin}/api/recover?${qs}`, { method: 'POST' })
  return r.json()
}

export interface WaMessage {
  id: string
  order_id: string | null
  body: string | null        // "[dia N] templatename" — o passo está aqui
  phone: string | null
  ok: boolean | null         // true = enviado, false = falhou (coluna real do banco)
  http_status: number | null
  response: any
  created_at: string | null
  // joined from kirvano_orders
  customer_name?: string | null
  product?: string | null
}

/** Extrai o nº do dia (1..3) do body "[dia N] template". */
export function waDay(body?: string | null): number | null {
  const m = (body || '').match(/dia\s*(\d)/i)
  return m ? parseInt(m[1], 10) : null
}

export async function fetchWaMessages(limit = 200): Promise<WaMessage[]> {
  const sb = supabase()
  if (!sb) return []
  const { data } = await sb
    .from('wa_messages')
    .select('*, kirvano_orders(customer_name, product)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!data) return []
  return data.map((r: any) => ({
    ...r,
    customer_name: r.kirvano_orders?.customer_name ?? null,
    product: r.kirvano_orders?.product ?? null,
  })) as WaMessage[]
}

/* ── Templates de WhatsApp (gerencia direto pela API do Meta) ── */
export interface WaTemplateMeta {
  name: string
  status: string // APPROVED | PENDING | REJECTED | ...
  category?: string
  language?: string
  components?: any[]
  rejected_reason?: string
}

export async function fetchWaTemplates(secret: string): Promise<WaTemplateMeta[]> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const r = await fetch(`${origin}/api/wa-templates?secret=${encodeURIComponent(secret)}`)
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return (j.templates || []) as WaTemplateMeta[]
}

export interface WaTemplateInput {
  name: string
  category: string
  language?: string
  body: string
  bodyExample?: string[]
  buttonText?: string
  buttonUrlBase?: string
  video?: boolean
}

export async function createWaTemplate(secret: string, template: WaTemplateInput): Promise<any> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const r = await fetch(`${origin}/api/wa-templates?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', template }),
  })
  return r.json()
}

/**
 * Classifica por que uma venda aprovada "não trackeou" a campanha:
 *  - 'erro_envio'    → capi_ok != true: erro de config (sem rota/token). NÃO foi pro Meta. Re-disparo resolve.
 *  - 'organico'      → veio do IG/bio (utm_source=ig / medium=social / content=link_in_bio).
 *                      Foi pro Meta, mas SEM clique de anúncio → Meta não atribui à campanha (venda "perdida pra otimização").
 *  - 'sem_campanha'  → sem utm_campaign nenhuma (acesso direto). Mesmo caso: Meta não otimiza.
 *  - null            → FB com campanha + capi_ok: trackeada certa, não aparece.
 */
export type TrackIssue = 'erro_envio' | 'organico' | 'sem_campanha'

export function classifyTracking(o: KirvanoOrder): TrackIssue | null {
  if (o.capi_ok !== true) return 'erro_envio'
  const src = (o.utm_source || '').toLowerCase()
  const med = (o.utm_medium || '').toLowerCase()
  const cont = (o.utm_content || '').toLowerCase()
  if (src.includes('ig') || src.includes('insta') || med.includes('social') || cont.includes('bio')) return 'organico'
  if (!(o.utm_campaign || '').trim()) return 'sem_campanha'
  return null
}

export interface NaoTrackeadoOrder extends KirvanoOrder {
  issue: TrackIssue
}

/** Vendas aprovadas que não trackearam a campanha (orgânicas/sem-utm/erro de envio). */
export async function fetchNaoTrackeado(sinceDays = 30): Promise<NaoTrackeadoOrder[]> {
  const sb = supabase()
  if (!sb) return []
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  const { data } = await sb
    .from('kirvano_orders')
    .select('*')
    .eq('status', 'APPROVED')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(1000)
  return (data || [])
    .map((o) => {
      const issue = classifyTracking(o as KirvanoOrder)
      return issue ? ({ ...(o as KirvanoOrder), issue }) : null
    })
    .filter(Boolean) as NaoTrackeadoOrder[]
}

/** Re-dispara CAPI pra um pedido específico via /api/refire-capi.
 *  fbclid = o clique de anúncio real (da UTMIFY/link do anúncio); é o ÚNICO campo
 *  que reatribui a campanha no Meta. As UTMs vão só pro relatório (Meta atribui por fbc). */
export async function refireCapi(
  secret: string,
  id: string,
  opts?: { utmSource?: string; utmCampaign?: string; utmMedium?: string; utmContent?: string; fbclid?: string },
): Promise<any> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const r = await fetch(`${origin}/api/refire-capi?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...opts }),
  })
  return r.json()
}
