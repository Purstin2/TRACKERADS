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

/* ── Paginação ────────────────────────────────────────────────────────────────
 * O PostgREST corta TODA resposta em 1000 linhas e IGNORA `.limit()` acima disso —
 * sem erro, sem aviso. Quem pedia `.limit(5000)` recebia 1000 e achava que era tudo.
 * Foi assim que o dashboard escondeu R$8k de lucro (perdia o começo do mês, porque
 * ordenava por data desc e cortava o resto).
 *
 * Use isto em QUALQUER consulta que possa passar de 1000 linhas. `build` recebe a
 * faixa e devolve a query já com `.range(from, to)` aplicado.
 *
 *   const rows = await fetchAll<Pedido>((from, to) =>
 *     sb.from('kirvano_orders').select('*').range(from, to))
 */
const PAGE_SIZE = 1000
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 100000, // trava de segurança: nunca vira loop infinito
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) break
    const batch = data || []
    out.push(...batch)
    if (batch.length < PAGE_SIZE) break // última página
  }
  return out
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

/** Header Authorization com o token da sessão atual — pra chamar api/mobile.js
 *  (que agora exige login, não o WEBHOOK_SECRET colado na aba Conexões). */
export async function authHeaders(): Promise<Record<string, string>> {
  const sb = supabase()
  if (!sb) return {}
  const { data: { session } } = await sb.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
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
