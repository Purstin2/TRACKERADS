import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

/**
 * Client Supabase compartilhado. Credenciais vêm de:
 *  1. variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — produção
 *  2. localStorage (coladas pelo usuário na UI) — pra conectar na Supabase existente do TrackerAds
 */
const LS = 'purstin_supabase'

export interface SupaCreds {
  url: string
  key: string
}

export function getCreds(): SupaCreds | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (envUrl && envKey) return { url: envUrl, key: envKey }
  try {
    const c = JSON.parse(localStorage.getItem(LS) || 'null')
    if (c?.url && c?.key) return c
  } catch {}
  return null
}

export function saveCreds(c: SupaCreds) {
  localStorage.setItem(LS, JSON.stringify(c))
  _client = null
}
export function clearCreds() {
  localStorage.removeItem(LS)
  _client = null
}
export function isConfigured(): boolean {
  return !!getCreds()
}

let _client: SupabaseClient | null = null
export function supabase(): SupabaseClient | null {
  if (_client) return _client
  const c = getCreds()
  if (!c) return null
  _client = createClient(c.url, c.key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'purstin_supabase_auth' },
  })
  return _client
}

/* ── Auth (TrackerAds usa RLS por usuário → precisa logar pra ver os dados) ── */
export async function signIn(email: string, password: string) {
  const sb = supabase()
  if (!sb) throw new Error('Conecte a Supabase primeiro')
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(error.message)
  return data
}
export async function signOut() {
  const sb = supabase()
  await sb?.auth.signOut()
}

/** Hook reativo: e-mail do usuário logado, ou null. */
export function useSession(): { email: string | null; loading: boolean } {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const sb = supabase()
    if (!sb) {
      setLoading(false)
      return
    }
    sb.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null)
      setLoading(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  return { email, loading }
}
