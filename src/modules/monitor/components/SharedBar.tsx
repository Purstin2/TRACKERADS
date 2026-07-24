import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, ChevronDown, Eye, EyeOff, KeyRound, Settings } from 'lucide-react'
import { useMonitor } from '../MonitorContext'
import { STATUS_FILTERS } from '../config'
import { useLog } from '../actionLog'

/** Contas + Status para as abas que NÃO são a de Campanhas (Criativos, Funil,
 *  Públicos, Por Oferta leem esses dois do estado compartilhado). Na aba de
 *  Campanhas eles moram na FilterBar, junto dos outros filtros. */
function InlineFilters() {
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
  const label = sel === 0 ? 'nenhuma conta' : sel === total ? `todas (${total})` : sel === 1 ? m.accounts.find((a) => m.selected.has(a.id))?.name || '1 conta' : `${sel} de ${total}`

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Contas</span>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-[8px] border border-border bg-[#0a0c19] px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-brand"
        >
          {label}
          <ChevronDown className={`h-3.5 w-3.5 text-muted2 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-40 mt-1 w-[260px] rounded-[10px] border border-border bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <button className="text-[11px] font-bold text-brand-2 hover:underline" onClick={() => m.accounts.forEach((a) => !m.selected.has(a.id) && m.toggleAccount(a.id))}>todas</button>
              <span className="text-muted2">·</span>
              <button className="text-[11px] font-bold text-muted hover:underline" onClick={() => m.accounts.forEach((a) => m.selected.has(a.id) && m.toggleAccount(a.id))}>nenhuma</button>
            </div>
            <div className="max-h-[280px] overflow-y-auto py-1">
              {m.accounts.map((a) => {
                const on = m.selected.has(a.id)
                return (
                  <button key={a.id} onClick={() => m.toggleAccount(a.id)} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface2">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${on ? 'border-brand bg-brand' : 'border-border2'}`}>
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
      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-muted2">Status</span>
      <select
        value={m.status}
        onChange={(e) => m.setStatus(e.target.value)}
        className="rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
      >
        {Object.entries(STATUS_FILTERS).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>
    </div>
  )
}

/** Barra de cima: token, parâmetros e (fora da aba Campanhas) contas/status.
 *  Na aba Campanhas os filtros moram todos na FilterBar, dentro do card — antes
 *  estavam espalhados em duas barras e ninguém sabia onde procurar. */
export default function SharedBar({ onSettings, showFilters }: { onSettings: () => void; showFilters?: boolean }) {
  const m = useMonitor()
  const [showTok, setShowTok] = useState(false)
  const [openTok, setOpenTok] = useState(!m.token.trim())
  const log = useLog()
  const today = new Date().toISOString().slice(0, 10)
  const dueNow = log.filter((e) => e.verifyBy && !e.done && e.verifyBy <= today).length
  const hasTok = !!m.token.trim()

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-[17px] font-bold tracking-tight">Monitor de Campanhas</h1>

        {dueNow > 0 && (
          <Link
            to="/monitor/acoes"
            className="flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/15 px-3 py-1.5 text-[11px] font-bold text-warn"
            title="Ações aguardando verificação"
          >
            <Bell className="h-3.5 w-3.5" /> {dueNow} p/ verificar
          </Link>
        )}

        <button
          onClick={() => setOpenTok((o) => !o)}
          title={hasTok ? 'Trocar o access token do Meta' : 'Cole o access token do Meta'}
          className={`flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
            hasTok ? 'border-border bg-surface2 text-muted2 hover:text-ink' : 'border-warn/40 bg-warn/15 text-warn'
          }`}
        >
          <KeyRound className="h-3.5 w-3.5" />
          {hasTok ? 'Token' : 'Colar token'}
        </button>

        <button className="btn btn-ghost btn-sm" onClick={onSettings} title="Parâmetros de análise (ROAS, CPA, câmbio)">
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {openTok && (
        <div className="flex items-center gap-2">
          <input
            type={showTok ? 'text' : 'password'}
            value={m.token}
            onChange={(e) => m.setToken(e.target.value)}
            placeholder="Access Token do Meta (ads_management)"
            className="flex-1 rounded-[9px] border border-border bg-[#0a0c19] px-3 py-2 text-[13px] text-ink"
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTok((s) => !s)} title={showTok ? 'Ocultar' : 'Mostrar'}>
            {showTok ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {showFilters && <InlineFilters />}
    </div>
  )
}
