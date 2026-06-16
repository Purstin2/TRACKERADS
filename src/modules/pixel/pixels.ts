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
}

/** Cria uma rota nova (token obrigatório na criação). */
export async function createRoute(input: RouteInput): Promise<{ error?: string }> {
  const sb = supabase()
  if (!sb) return { error: 'Supabase não conectado' }
  if (!input.pixel_id?.trim()) return { error: 'Pixel ID é obrigatório' }
  if (!input.capi_token?.trim()) return { error: 'Token CAPI é obrigatório' }
  const { error } = await sb.from('pixel_routes').insert([
    {
      label: input.label || null,
      offer_id: input.match_type === 'any' ? null : (input.offer_id || null),
      match_type: input.match_type,
      pixel_id: input.pixel_id.trim(),
      capi_token: input.capi_token.trim(),
      test_code: input.test_code || null,
      active: input.active ?? true,
      gateways: input.gateways?.length ? input.gateways : null,
    },
  ])
  return error ? { error: error.message } : {}
}

/** Atualiza uma rota. O token só é alterado se `capi_token` vier preenchido. */
export async function updateRoute(id: string, input: Partial<RouteInput>): Promise<{ error?: string }> {
  const sb = supabase()
  if (!sb) return { error: 'Supabase não conectado' }
  const patch: Record<string, unknown> = {}
  if (input.label !== undefined) patch.label = input.label || null
  if (input.offer_id !== undefined) patch.offer_id = input.match_type === 'any' ? null : (input.offer_id || null)
  if (input.match_type !== undefined) patch.match_type = input.match_type
  if (input.pixel_id !== undefined) patch.pixel_id = input.pixel_id.trim()
  if (input.test_code !== undefined) patch.test_code = input.test_code || null
  if (input.active !== undefined) patch.active = input.active
  if (input.gateways !== undefined) patch.gateways = input.gateways?.length ? input.gateways : null
  // token: só sobrescreve se o usuário digitou um novo (não apaga o existente)
  if (input.capi_token && input.capi_token.trim()) patch.capi_token = input.capi_token.trim()
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
