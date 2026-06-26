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
  // foto ACUMULADA da campanha no momento do aumento (pra comparar antes×depois do aumento)
  dateBR?: string // YYYY-MM-DD (dia BR) do aumento — agrupa os aumentos do dia
  spendAtTime?: number | null // gasto acumulado do dia até o aumento
  salesAtTime?: number | null // vendas acumuladas do dia até o aumento
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

/** Dia BR (YYYY-MM-DD) — pra agrupar os aumentos do mesmo dia. */
export function todayBR(d: Date = new Date()): string {
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Aumentos de orçamento de uma campanha num dia BR, com a foto do momento, em ordem cronológica.
 *  Só conta os reais (não simulados) e que têm a foto de gasto capturada. */
export function increasesForDay(campId: string, dateBR: string): ActionEntry[] {
  return getLog()
    .filter(
      (e) =>
        e.campId === campId &&
        (e.kind === 'orcamento' || e.kind === 'escala') &&
        !e.sim &&
        e.spendAtTime != null &&
        (e.dateBR || todayBR(new Date(e.ts))) === dateBR,
    )
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
}

/** Datas (dias BR) em que a campanha teve aumento com foto — pra listar quais têm impacto. */
export function impactDays(campId: string): string[] {
  const set = new Set<string>()
  getLog().forEach((e) => {
    if (e.campId === campId && (e.kind === 'orcamento' || e.kind === 'escala') && !e.sim && e.spendAtTime != null) {
      set.add(e.dateBR || todayBR(new Date(e.ts)))
    }
  })
  return [...set].sort((a, b) => (a < b ? 1 : -1))
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
