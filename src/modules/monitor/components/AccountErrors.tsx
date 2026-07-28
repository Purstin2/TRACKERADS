import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useMonitor } from '../MonitorContext'

/** Contas que falharam no fetch — vira um CHIP na barra, não um banner.
 *  Antes cada erro era uma faixa de ~70px empurrando a tabela pra fora da tela;
 *  com 2-3 contas sem permissão isso comia metade da área útil. Agora é um chip
 *  que abre o detalhe só quando clicado (+ um toast no momento da carga). */
export default function AccountErrors() {
  const m = useMonitor()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const errs = m.cache.filter((i) => i.kind === 'err')

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  // some junto com os erros (ex.: reautorizou a conta e atualizou)
  useEffect(() => {
    if (!errs.length) setOpen(false)
  }, [errs.length])

  if (!errs.length) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Contas que não carregaram — clique para ver o motivo"
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-danger/15 px-3 py-1.5 text-[11.5px] font-semibold text-danger transition-colors hover:bg-danger/25"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {errs.length} {errs.length === 1 ? 'conta com erro' : 'contas com erro'}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[420px] max-w-[92vw] overflow-hidden rounded-[10px] border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[11.5px] font-bold text-ink">Contas que não carregaram</span>
            <button onClick={() => setOpen(false)} className="text-muted2 hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {errs.map((item, idx) => (
              <div key={idx} className="border-b border-border2/60 px-3 py-2 last:border-b-0">
                <div className="text-[12px] font-semibold text-danger">{item.acc.name}</div>
                <div className="mt-0.5 break-words text-[11px] leading-snug text-muted2">{item.msg}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2 text-[10.5px] text-muted2">
            Erro de permissão: peça <b className="text-muted">ads_read</b> ao dono da conta ou desmarque ela no filtro de contas.
          </div>
        </div>
      )}
    </div>
  )
}
