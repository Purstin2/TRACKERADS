import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Settings, Bell, RefreshCw, ChevronDown, Check } from 'lucide-react'
import { useMonitor } from '../MonitorContext'
import { STATUS_FILTERS, DATE_OPTIONS } from '../config'
import { useLog } from '../actionLog'

/** Seletor de contas compacto: botão "N/M contas" → painel com checkboxes. */
function AccountsDropdown() {
  const m = useMonitor()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const total = m.accounts.length
  const sel = m.selected.size
  const label =
    sel === 0 ? 'nenhuma conta' :
    sel === total ? `todas as contas (${total})` :
    sel === 1 ? m.accounts.find((a) => m.selected.has(a.id))?.name || '1 conta' :
    `${sel} de ${total} contas`

  const selectAll = () => m.accounts.forEach((a) => { if (!m.selected.has(a.id)) m.toggleAccount(a.id) })
  const clearAll = () => m.accounts.forEach((a) => { if (m.selected.has(a.id)) m.toggleAccount(a.id) })

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-[8px] border border-border bg-[#0a0c19] px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-brand"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 text-muted2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[260px] rounded-[10px] border border-border bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <button className="text-[11px] font-bold text-brand-2 hover:underline" onClick={selectAll}>todas</button>
            <span className="text-muted2">·</span>
            <button className="text-[11px] font-bold text-muted hover:underline" onClick={clearAll}>nenhuma</button>
            <button
              onClick={m.refreshAccounts}
              disabled={m.refreshingAccounts}
              title="Buscar contas novas no Meta"
              className="ml-auto flex items-center gap-1 rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10.5px] font-semibold text-muted2 hover:border-brand hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${m.refreshingAccounts ? 'animate-spin' : ''}`} />
              {m.refreshingAccounts ? 'Buscando…' : 'Atualizar'}
            </button>
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {m.accounts.map((a) => {
              const on = m.selected.has(a.id)
              return (
                <button
                  key={a.id}
                  onClick={() => m.toggleAccount(a.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface2"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${on ? 'border-brand bg-brand' : 'border-border2 bg-transparent'}`}>
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className={`truncate ${on ? 'font-semibold text-ink' : 'text-muted'}`}>{a.name}</span>
                  <span className="ml-auto text-[10px] text-muted2">{a.cur}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SharedBar({ onSettings }: { onSettings: () => void }) {
  const m = useMonitor()
  const [showTok, setShowTok] = useState(false)
  const log = useLog()
  const today = new Date().toISOString().slice(0, 10)
  const dueNow = log.filter((e) => e.verifyBy && !e.done && e.verifyBy <= today).length
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type={showTok ? 'text' : 'password'}
          value={m.token}
          onChange={(e) => m.setToken(e.target.value)}
          placeholder="Access Token do Meta (ads_management)"
          className="flex-1 rounded-[9px] border border-border bg-[#0a0c19] px-3 py-2 text-[13px] text-ink"
        />
        <button className="btn btn-ghost btn-sm" onClick={() => setShowTok((s) => !s)}>
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onSettings} title="Parâmetros de análise">
          <Settings className="h-3.5 w-3.5" />
        </button>
        {dueNow > 0 && (
          <Link
            to="/monitor/acoes"
            className="flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/15 px-3 py-1.5 text-[11px] font-bold text-warn"
            title="Ações aguardando verificação"
          >
            <Bell className="h-3.5 w-3.5" /> {dueNow} p/ verificar
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Contas</span>
        <AccountsDropdown />
        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-muted2">Status</span>
        <select
          value={m.status}
          onChange={(e) => m.setStatus(e.target.value)}
          className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
        >
          {Object.entries(STATUS_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        {/* Período mora aqui (junto de Contas/Status) — os três definem O QUE é buscado.
            A barra de baixo fica só com O QUE FAZER com o resultado (abas + Atualizar). */}
        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-muted2">Período</span>
        <select
          value={m.datePreset}
          onChange={(e) => m.setDatePreset(e.target.value)}
          className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
        >
          {DATE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
