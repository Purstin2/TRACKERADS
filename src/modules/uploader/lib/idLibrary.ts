import { useSyncExternalStore } from 'react'
import { fbGet, fbBase } from './fb'

/** Biblioteca de IDs da Meta salva no navegador — contas, páginas, pixels e
 *  Instagrams com NOME, pra não precisar abrir o Facebook toda hora. */
export type IdKind = 'accounts' | 'pages' | 'pixels' | 'instagrams'
export interface IdEntry { id: string; name: string; note?: string }
export interface IdLibrary { accounts: IdEntry[]; pages: IdEntry[]; pixels: IdEntry[]; instagrams: IdEntry[] }

export const KIND_LABEL: Record<IdKind, string> = {
  accounts: 'Contas de anúncio',
  pages: 'Páginas',
  pixels: 'Pixels',
  instagrams: 'Instagrams',
}
export const KIND_PLACEHOLDER: Record<IdKind, string> = {
  accounts: 'act_000000000000',
  pages: '000000000000',
  pixels: '000000000000',
  instagrams: '000000000000',
}

const KEY = 'uploader_id_library_v1'
const EMPTY: IdLibrary = { accounts: [], pages: [], pixels: [], instagrams: [] }
let cache: IdLibrary | null = null
const subs = new Set<() => void>()

function read(): IdLibrary {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...EMPTY }
  }
}
export function getLibrary(): IdLibrary {
  if (!cache) cache = read()
  return cache
}
function commit(next: IdLibrary) {
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  subs.forEach((f) => f())
}

export function upsertEntry(kind: IdKind, entry: IdEntry) {
  const lib = getLibrary()
  const list = lib[kind].slice()
  const i = list.findIndex((e) => e.id === entry.id)
  if (i >= 0) list[i] = { ...list[i], ...entry }
  else list.push(entry)
  commit({ ...lib, [kind]: list })
}
export function removeEntry(kind: IdKind, id: string) {
  const lib = getLibrary()
  commit({ ...lib, [kind]: lib[kind].filter((e) => e.id !== id) })
}
export function mergeEntries(kind: IdKind, entries: IdEntry[]) {
  const lib = getLibrary()
  const map = new Map(lib[kind].map((e) => [e.id, e]))
  for (const e of entries) map.set(e.id, { ...map.get(e.id), ...e })
  commit({ ...lib, [kind]: [...map.values()] })
}

function subscribe(fn: () => void) {
  subs.add(fn)
  return () => { subs.delete(fn) }
}
export function useLibrary(): IdLibrary {
  return useSyncExternalStore(subscribe, getLibrary, getLibrary)
}

/* ── sincronização automática do Facebook ── */
export interface SyncResult { accounts: number; pages: number; pixels: number; instagrams: number; warnings: string[] }

export async function syncFromFb(token: string, onStep?: (m: string) => void): Promise<SyncResult> {
  const warnings: string[] = []
  const accounts: IdEntry[] = []
  const pages: IdEntry[] = []
  const pixels: IdEntry[] = []
  const igs: IdEntry[] = []

  try {
    onStep?.('Buscando contas de anúncio…')
    let url = `${fbBase}/me/adaccounts?fields=id,name&limit=200&access_token=${token}`
    while (url) {
      const d = await fbGet(url)
      for (const a of d.data || []) accounts.push({ id: a.id, name: a.name || a.id })
      url = d.paging?.next || ''
    }
    if (accounts.length) mergeEntries('accounts', accounts)
  } catch (e: any) { warnings.push('contas: ' + e.message) }

  try {
    onStep?.('Buscando páginas…')
    let url = `${fbBase}/me/accounts?fields=id,name&limit=200&access_token=${token}`
    while (url) {
      const d = await fbGet(url)
      for (const p of d.data || []) pages.push({ id: p.id, name: p.name || p.id })
      url = d.paging?.next || ''
    }
    if (pages.length) mergeEntries('pages', pages)
  } catch (e: any) { warnings.push('páginas: ' + e.message) }

  // pixels: por conta (best-effort — ignora conta sem acesso a pixel)
  try {
    onStep?.('Buscando pixels…')
    for (const a of accounts) {
      try {
        const d = await fbGet(`${fbBase}/${a.id}/adspixels?fields=id,name&limit=50&access_token=${token}`)
        for (const px of d.data || []) pixels.push({ id: px.id, name: px.name || px.id, note: a.name })
      } catch { /* conta sem pixel/sem acesso */ }
    }
    if (pixels.length) mergeEntries('pixels', pixels)
  } catch (e: any) { warnings.push('pixels: ' + e.message) }

  // instagram: por página (a conta business vinculada)
  try {
    onStep?.('Buscando Instagrams…')
    for (const p of pages) {
      try {
        const d = await fbGet(`${fbBase}/${p.id}?fields=instagram_business_account{id,username}&access_token=${token}`)
        const ig = d.instagram_business_account
        if (ig?.id) igs.push({ id: ig.id, name: ig.username ? '@' + ig.username : p.name, note: p.name })
      } catch { /* página sem IG vinculado */ }
    }
    if (igs.length) mergeEntries('instagrams', igs)
  } catch (e: any) { warnings.push('instagrams: ' + e.message) }

  return { accounts: accounts.length, pages: pages.length, pixels: pixels.length, instagrams: igs.length, warnings }
}
