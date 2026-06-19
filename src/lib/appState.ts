import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/**
 * Estado persistente do app: fonte de verdade no Supabase (tabela `app_state`,
 * key→jsonb), com localStorage como CACHE pra render instantâneo. Assim limpar
 * cookies/atualizar a tela não perde mais nada — o dado vive no banco.
 *
 * Use o hook `usePersistentState(key, fallback)` no lugar de useState+localStorage.
 */

// ── cache local (síncrono, render imediato) ──────────────────────────────────
export function cacheGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v != null ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
export function cacheSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ── remoto (Supabase) ────────────────────────────────────────────────────────
export async function remoteGet<T>(key: string): Promise<T | null> {
  const sb = supabase()
  if (!sb) return null
  try {
    const { data } = await sb.from('app_state').select('value').eq('key', key).maybeSingle()
    return (data?.value ?? null) as T | null
  } catch {
    return null
  }
}
export async function remoteSet(key: string, value: unknown) {
  const sb = supabase()
  if (!sb) return
  try {
    await sb.from('app_state').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch {}
}

/** Carrega: prioriza o remoto (fonte de verdade); cai no cache local; senão fallback.
 *  Se o remoto não existir mas houver cache local (ex: dado antigo), sobe pro banco. */
export async function loadState<T>(key: string, fallback: T): Promise<T> {
  const remote = await remoteGet<T>(key)
  if (remote != null) {
    cacheSet(key, remote)
    return remote
  }
  const local = cacheGet<T | null>(key, null)
  if (local != null) {
    remoteSet(key, local) // migra cache local → Supabase (1ª vez)
    return local as T
  }
  return fallback
}

/** Salva nos dois (cache imediato + Supabase). */
export async function saveState(key: string, value: unknown) {
  cacheSet(key, value)
  await remoteSet(key, value)
}

/**
 * Hook drop-in pro padrão useState+localStorage, mas persistido no Supabase.
 *   const [rules, setRules] = usePersistentState<Rule[]>('meta_rules', [])
 * - render instantâneo do cache; sincroniza do banco ao montar
 * - grava cache na hora e o banco com debounce (600ms); dá flush ao desmontar
 */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => cacheGet(key, fallback))
  const pending = useRef<T | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let alive = true
    loadState(key, fallback).then((v) => { if (alive) setValue(v) })
    return () => {
      alive = false
      if (timer.current) { clearTimeout(timer.current); timer.current = undefined }
      if (pending.current !== undefined) { remoteSet(key, pending.current); pending.current = undefined }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const update = useCallback((v: T) => {
    setValue(v)
    cacheSet(key, v)
    pending.current = v
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { remoteSet(key, v); pending.current = undefined }, 600)
  }, [key])

  return [value, update] as const
}
