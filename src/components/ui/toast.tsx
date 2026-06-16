import { useEffect, useState } from 'react'
import { Check, X, AlertTriangle, Info } from 'lucide-react'

export type ToastType = 'ok' | 'err' | 'warn' | 'info'
interface ToastItem {
  id: number
  msg: string
  type: ToastType
}

type Listener = (t: ToastItem) => void
const listeners = new Set<Listener>()
let seq = 0

export function toast(msg: string, type: ToastType = 'ok') {
  const item = { id: ++seq, msg, type }
  listeners.forEach((l) => l(item))
}

const ICONS = { ok: Check, err: X, warn: AlertTriangle, info: Info }
const BORDER = {
  ok: 'border-l-ok',
  err: 'border-l-danger',
  warn: 'border-l-warn',
  info: 'border-l-brand',
}
const ICOLOR = {
  ok: 'text-ok',
  err: 'text-danger',
  warn: 'text-warn',
  info: 'text-brand-2',
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const l: Listener = (t) => {
      setItems((prev) => [...prev, t])
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3200)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  return (
    <div className="fixed right-4 top-[68px] z-[999] flex flex-col gap-2">
      {items.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            className={`flex max-w-[340px] animate-toastIn items-center gap-2.5 rounded-[10px] border border-border border-l-[3px] bg-surface px-4 py-3 text-[12.5px] font-semibold text-ink shadow-card ${BORDER[t.type]}`}
          >
            <Icon className={`h-4 w-4 flex-shrink-0 ${ICOLOR[t.type]}`} />
            {t.msg}
          </div>
        )
      })}
    </div>
  )
}
