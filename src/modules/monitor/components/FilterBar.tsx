import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Info, RefreshCw, Search, X } from 'lucide-react'
import { useMonitor } from '../MonitorContext'
import { STATUS_FILTERS, DATE_OPTIONS } from '../config'
import { loadOfferDefs } from '../offers'

/** Campo rotulado — o rótulo em cima é o que faz a barra "ler" de relance. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <label className="truncate text-[11.5px] font-semibold text-muted">{label}</label>
        {hint && (
          <span title={hint} className="shrink-0 cursor-help text-muted2">
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

const CONTROL =
  'h-[38px] w-full rounded-[8px] border border-border bg-[#0a0c19] px-3 text-[12.5px] text-ink transition-colors focus:border-brand focus:outline-none'

/** Dropdown de contas com checkbox — várias contas na mesma tabela. */
function AccountsField() {
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
    sel === 0 ? 'Nenhuma' : sel === total ? 'Qualquer' : sel === 1 ? m.accounts.find((a) => m.selected.has(a.id))?.name || '1 conta' : `${sel} de ${total}`

  const selectAll = () => m.accounts.forEach((a) => { if (!m.selected.has(a.id)) m.toggleAccount(a.id) })
  const clearAll = () => m.accounts.forEach((a) => { if (m.selected.has(a.id)) m.toggleAccount(a.id) })

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${CONTROL} flex items-center justify-between gap-2 text-left hover:border-brand`}>
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[270px] rounded-[10px] border border-border bg-surface shadow-card">
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
              {m.refreshingAccounts ? 'Buscando…' : 'Sincronizar'}
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
  )
}

export default function FilterBar() {
  const m = useMonitor()
  const offers = useMemo(() => loadOfferDefs(), [])

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-border px-4 py-3.5 lg:grid-cols-5">
      <Field label="Nome da Campanha">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
          <input
            value={m.nameFilter}
            onChange={(e) => m.setNameFilter(e.target.value)}
            placeholder="Filtrar por nome"
            className={`${CONTROL} pl-8 pr-8`}
          />
          {m.nameFilter && (
            <button onClick={() => m.setNameFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted2 hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </Field>

      <Field label="Status da Campanha">
        <select value={m.status} onChange={(e) => m.setStatus(e.target.value)} className={CONTROL}>
          {Object.entries(STATUS_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Período de Visualização" hint="Janela de dados buscada na Meta. Trocar exige Atualizar.">
        <select value={m.datePreset} onChange={(e) => m.setDatePreset(e.target.value)} className={CONTROL}>
          {DATE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Conta de Anúncio">
        <AccountsField />
      </Field>

      <Field label="Produto" hint="Ofertas montadas na aba Por Oferta">
        <select
          value={m.offerFilter}
          onChange={(e) => m.setOfferFilter(e.target.value)}
          disabled={!offers.length}
          className={`${CONTROL} disabled:opacity-50`}
          title={offers.length ? 'Filtrar pelas campanhas de uma oferta' : 'Monte uma oferta na aba Por Oferta para usar este filtro'}
        >
          <option value="">Qualquer</option>
          {offers.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </Field>
    </div>
  )
}
