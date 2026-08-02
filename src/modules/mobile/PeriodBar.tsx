import { useState } from 'react'
import { CalendarDays, Check, X } from 'lucide-react'
import {
  PERIOD_CHIPS, PERIOD_LABEL, hojeBR, resolvePeriod,
  type PeriodId, type PeriodValue,
} from './period'

/* Barra de período do app no celular — vale pras 3 abas de uma vez.
 * Chips em vez de <select>: no celular o select abre a roda nativa e some com a
 * tela; chip é um toque só e você continua vendo o número mudar atrás.
 * O "Personalizado" abre uma gaveta com dois <input type="date"> — que no
 * celular já usa o calendário nativo do aparelho, sem lib de terceiro. */

export default function PeriodBar({
  value, onChange, sticky = true,
}: {
  value: PeriodValue
  onChange: (v: PeriodValue) => void
  sticky?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const hoje = hojeBR()
  const [de, setDe] = useState(value.since || hoje)
  const [ate, setAte] = useState(value.until || hoje)

  const janela = resolvePeriod(value)
  const ehCustom = value.id === 'custom'

  const chip = (ativo: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-2 text-[12.5px] font-bold transition active:scale-[0.97] ${
      ativo ? 'border-brand bg-brand text-white' : 'border-border bg-surface text-muted'
    }`

  return (
    <div className={sticky ? 'sticky top-0 z-30 -mx-4 bg-bg/95 px-4 pb-2 pt-2 backdrop-blur' : ''}>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PERIOD_CHIPS.map((id: PeriodId) => (
          <button key={id} onClick={() => onChange({ id })} className={chip(value.id === id)}>
            {PERIOD_LABEL[id]}
          </button>
        ))}
        <button
          onClick={() => setAberto((v) => !v)}
          className={`${chip(ehCustom)} flex items-center gap-1.5`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {ehCustom ? janela.label : 'Escolher'}
        </button>
      </div>

      {aberto && (
        <div className="mt-2 rounded-xl2 border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10.5px] font-semibold uppercase tracking-wide text-muted2">De</label>
              <input
                type="date" value={de} max={hoje}
                onChange={(e) => setDe(e.target.value)}
                className="mt-1 h-[42px] w-full rounded-[10px] border border-border bg-surface2 px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10.5px] font-semibold uppercase tracking-wide text-muted2">Até</label>
              <input
                type="date" value={ate} max={hoje}
                onChange={(e) => setAte(e.target.value)}
                className="mt-1 h-[42px] w-full rounded-[10px] border border-border bg-surface2 px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => setAberto(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border py-2.5 text-[12.5px] font-bold text-muted active:scale-[0.99]"
            >
              <X className="h-4 w-4" /> Fechar
            </button>
            <button
              onClick={() => { onChange({ id: 'custom', since: de, until: ate }); setAberto(false) }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-brand/50 bg-brand/15 py-2.5 text-[12.5px] font-bold text-brand-2 active:scale-[0.99]"
            >
              <Check className="h-4 w-4" /> Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
