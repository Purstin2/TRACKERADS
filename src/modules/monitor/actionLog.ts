import { useSyncExternalStore } from 'react'
import { accName } from './config'

export type ActionKind = 'escala' | 'orcamento' | 'pause' | 'duplicacao' | 'nota'

export interface ActionEntry {
  id: string
  ts: string
  accId?: string
  account: string
  campId?: string
  name: string
  kind: ActionKind
  sim: boolean
  detail?: string
  cur?: string
  budgetBefore?: number | null
  budgetAfter?: number | null
  roasAtTime?: number | null
  profitAtTime?: number | null
  verifyBy?: string // YYYY-MM-DD
  done?: boolean
  linkedTo?: string // campId da campanha original (duplicação)
  linkedName?: string
}

export interface LogPrefill extends Partial<ActionEntry> {
  editId?: string
}

const KEY = 'meta_action_log'
let cache: ActionEntry[] | null = null
const subs = new Set<() => void>()

function read(): ActionEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    // migra entradas antigas (sem id/kind)
    return raw.map((e: any, i: number) => ({
      id: e.id || `legacy-${i}-${e.ts || Date.now()}`,
      kind: e.kind || e.action || 'nota',
      ...e,
    }))
  } catch {
    return []
  }
}

export function getLog(): ActionEntry[] {
  if (!cache) cache = read()
  return cache
}
function commit(next: ActionEntry[]) {
  cache = next
  localStorage.setItem(KEY, JSON.stringify(next.slice(0, 1000)))
  subs.forEach((f) => f())
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function addAction(e: Omit<ActionEntry, 'id' | 'ts' | 'account'> & { account?: string }): ActionEntry {
  const entry: ActionEntry = {
    id: newId(),
    ts: new Date().toISOString(),
    account: e.account || (e.accId ? accName(e.accId) : '—'),
    ...e,
  } as ActionEntry
  commit([entry, ...getLog()])
  return entry
}
export function updateAction(id: string, patch: Partial<ActionEntry>) {
  commit(getLog().map((e) => (e.id === id ? { ...e, ...patch } : e)))
}
export function deleteAction(id: string) {
  commit(getLog().filter((e) => e.id !== id))
}
export function clearActionLog() {
  commit([])
}

/** Última escala/orçamento registrado para uma campanha (para o badge de histórico). */
export function lastScale(campId?: string): ActionEntry | undefined {
  if (!campId) return undefined
  return getLog().find((e) => e.campId === campId && (e.kind === 'escala' || e.kind === 'orcamento') && !e.sim)
}

/* ── store reativo ── */
function subscribe(fn: () => void) {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
export function useLog(): ActionEntry[] {
  return useSyncExternalStore(subscribe, getLog, getLog)
}

/* ── abertura do modal (pub/sub estilo toast) ── */
let opener: ((prefill?: LogPrefill) => void) | null = null
export function registerLogOpener(fn: (prefill?: LogPrefill) => void) {
  opener = fn
  return () => {
    if (opener === fn) opener = null
  }
}
export function openLog(prefill?: LogPrefill) {
  opener?.(prefill)
}

export const KIND_LABEL: Record<ActionKind, string> = {
  escala: '🚀 Escala',
  orcamento: '💰 Orçamento',
  pause: '⏸ Pausa',
  duplicacao: '🔗 Duplicação',
  nota: '📝 Nota',
}
export const KIND_CLS: Record<ActionKind, string> = {
  escala: 'bg-ok/15 text-ok',
  orcamento: 'bg-brand/15 text-brand-2',
  pause: 'bg-danger/15 text-danger',
  duplicacao: 'bg-warn/15 text-warn',
  nota: 'bg-surface2 text-muted',
}
