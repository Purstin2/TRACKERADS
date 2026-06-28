import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Settings, Bell, RefreshCw } from 'lucide-react'
import { useMonitor } from '../MonitorContext'
import { STATUS_FILTERS } from '../config'
import { useLog } from '../actionLog'

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
        <button
          onClick={m.refreshAccounts}
          disabled={m.refreshingAccounts}
          title="Buscar contas novas no Meta e adicionar automaticamente"
          className="flex items-center gap-1 rounded-full border border-border bg-surface2 px-2 py-1 text-[11px] font-semibold text-muted2 transition-colors hover:border-brand hover:text-ink disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${m.refreshingAccounts ? 'animate-spin' : ''}`} />
          {m.refreshingAccounts ? 'Buscando…' : 'Atualizar'}
        </button>
        {m.accounts.map((a) => {
          const on = m.selected.has(a.id)
          return (
            <button
              key={a.id}
              onClick={() => m.toggleAccount(a.id)}
              className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-all ${
                on ? 'border-transparent bg-brand text-white' : 'border-border bg-surface2 text-muted2 hover:border-brand'
              }`}
            >
              {a.name}
            </button>
          )
        })}
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
      </div>
    </div>
  )
}
