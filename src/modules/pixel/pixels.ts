import { supabase } from '@/lib/supabase'

/** Rota de pixel: uma oferta (ou regra) → um pixel + token CAPI. */
export interface PixelRoute {
  id: string
  label: string | null
  offer_id: string | null
  match_type: 'offer' | 'product' | 'any'
  pixel_id: string
  test_code: string | null
  active: boolean
  gateways: string[] | null
  checkout_selector: string | null
  checkout_keywords: string[] | null
  fire_on_pix: boolean
  has_token: boolean
  token_last4: string | null
  created_at: string | null
  updated_at: string | null
}

/** Lê a VIEW pública (sem o token cru — só os últimos 4 dígitos). */
export async function fetchRoutes(): Promise<PixelRoute[]> {
  const sb = supabase()
  if (!sb) return []
  const { data } = await sb
    .from('pixel_routes_public')
    .select('*')
    .order('match_type', { ascending: true })
    .order('created_at', { ascending: false })
  return (data || []) as PixelRoute[]
}

export interface RouteInput {
  label?: string
  offer_id?: string | null
  match_type: 'offer' | 'product' | 'any'
  pixel_id: string
  capi_token?: string // só envia quando o usuário digita/troca
  test_code?: string | null
  active?: boolean
  gateways?: string[] | null
  checkout_selector?: string | null
  checkout_keywords?: string[] | null
  fire_on_pix?: boolean
}

// Remove espaços, quebras de linha e tabs das pontas E do meio. O Meta rejeita
// (ou não casa) IDs/códigos com espaço — foi o que quebrava o Test Event Code.
const clean = (v?: string | null) => (v == null ? null : String(v).replace(/\s+/g, '') || null)
// Igual, mas preserva espaços internos (pra label/nome legível).
const cleanLabel = (v?: string | null) => (v == null ? null : String(v).trim() || null)

/** Cria uma rota nova (token obrigatório na criação). */
export async function createRoute(input: RouteInput): Promise<{ error?: string }> {
  const sb = supabase()
  if (!sb) return { error: 'Supabase não conectado' }
  if (!clean(input.pixel_id)) return { error: 'Pixel ID é obrigatório' }
  if (!clean(input.capi_token)) return { error: 'Token CAPI é obrigatório' }
  const { error } = await sb.from('pixel_routes').insert([
    {
      label: cleanLabel(input.label),
      offer_id: input.match_type === 'any' ? null : clean(input.offer_id),
      match_type: input.match_type,
      pixel_id: clean(input.pixel_id),
      capi_token: clean(input.capi_token),
      test_code: clean(input.test_code),
      active: input.active ?? true,
      gateways: input.gateways?.length ? input.gateways : null,
      checkout_selector: input.checkout_selector?.trim() || null,
      checkout_keywords: input.checkout_keywords?.length ? input.checkout_keywords.map((k) => k.trim()).filter(Boolean) : null,
      fire_on_pix: input.fire_on_pix ?? false,
    },
  ])
  return error ? { error: error.message } : {}
}

/** Atualiza uma rota. O token só é alterado se `capi_token` vier preenchido. */
export async function updateRoute(id: string, input: Partial<RouteInput>): Promise<{ error?: string }> {
  const sb = supabase()
  if (!sb) return { error: 'Supabase não conectado' }
  const patch: Record<string, unknown> = {}
  if (input.label !== undefined) patch.label = cleanLabel(input.label)
  if (input.offer_id !== undefined) patch.offer_id = input.match_type === 'any' ? null : clean(input.offer_id)
  if (input.match_type !== undefined) patch.match_type = input.match_type
  if (input.pixel_id !== undefined) patch.pixel_id = clean(input.pixel_id)
  if (input.test_code !== undefined) patch.test_code = clean(input.test_code)
  if (input.active !== undefined) patch.active = input.active
  if (input.gateways !== undefined) patch.gateways = input.gateways?.length ? input.gateways : null
  if (input.checkout_selector !== undefined) patch.checkout_selector = input.checkout_selector?.trim() || null
  if (input.checkout_keywords !== undefined) patch.checkout_keywords = input.checkout_keywords?.length ? input.checkout_keywords.map((k) => k.trim()).filter(Boolean) : null
  if (input.fire_on_pix !== undefined) patch.fire_on_pix = input.fire_on_pix
  // token: só sobrescreve se o usuário digitou um novo (não apaga o existente)
  if (clean(input.capi_token)) patch.capi_token = clean(input.capi_token)
  const { error } = await sb.from('pixel_routes').update(patch).eq('id', id)
  return error ? { error: error.message } : {}
}

export async function deleteRoute(id: string): Promise<{ error?: string }> {
  const sb = supabase()
  if (!sb) return { error: 'Supabase não conectado' }
  const { error } = await sb.from('pixel_routes').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

export async function toggleRoute(id: string, active: boolean) {
  return updateRoute(id, { active } as Partial<RouteInput>)
}

export interface TestResult {
  ok: boolean
  error?: string
  details?: string | null
  pixel?: string
  testCode?: string
  event?: string
  events_received?: number
  messages?: unknown[]
}

/** Dispara um evento de teste pra esta rota (via /api/test-event no servidor). */
export async function testRoute(routeId: string, eventName = 'Purchase', testCode?: string): Promise<TestResult> {
  try {
    const r = await fetch('/api/test-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId, eventName, testCode }),
    })
    const j = (await r.json()) as TestResult
    if (!r.ok && !j.error) return { ok: false, error: `HTTP ${r.status}` }
    return j
  } catch (e) {
    return { ok: false, error: 'falha de rede ao chamar /api/test-event' }
  }
}
