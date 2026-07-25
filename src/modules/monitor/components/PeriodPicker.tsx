import { useMonitor } from '../MonitorContext'
import { DATE_OPTIONS } from '../config'

/** Período de visualização com opção "Personalizado" (intervalo de datas).
 *  Um só componente pros dois lugares: `full` mora na FilterBar (topo expandido);
 *  `compact` mora na Toolbar e continua na tela quando o topo é compactado — é o
 *  "canto" pra ele não sumir junto com os filtros. O valor personalizado vive no
 *  mesmo `datePreset` no formato "custom:AAAA-MM-DD:AAAA-MM-DD" (a camada Meta e o
 *  gateway já entendem esse prefixo), então nada mais precisa saber que é custom. */

const fmt = (d: Date) => d.toISOString().split('T')[0]
const todayStr = () => fmt(new Date())
const daysAgoStr = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return fmt(d)
}
function parseCustom(v: string): { since: string; until: string } | null {
  if (!v.startsWith('custom:')) return null
  const [, since, until] = v.split(':')
  return since && until ? { since, until } : null
}

export default function PeriodPicker({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const m = useMonitor()
  const isCustom = m.datePreset.startsWith('custom:')
  const selValue = isCustom ? 'custom' : m.datePreset
  // semente do personalizado = últimos 4 dias terminando ONTEM (a janela de escala)
  const custom = parseCustom(m.datePreset) || { since: daysAgoStr(4), until: daysAgoStr(1) }

  const onSelect = (v: string) => {
    if (v === 'custom') m.setDatePreset(`custom:${daysAgoStr(4)}:${daysAgoStr(1)}`)
    else m.setDatePreset(v)
  }
  const setSince = (s: string) => m.setDatePreset(`custom:${s}:${custom.until}`)
  const setUntil = (u: string) => m.setDatePreset(`custom:${custom.since}:${u}`)

  const selCls =
    variant === 'full'
      ? 'h-[38px] w-full rounded-[8px] border border-border bg-[#0a0c19] px-3 text-[12.5px] text-ink transition-colors focus:border-brand focus:outline-none'
      : 'h-[34px] rounded-[8px] border border-border bg-[#0a0c19] px-2 text-[12px] font-semibold text-muted transition-colors focus:border-brand focus:outline-none'
  const dateCls =
    variant === 'full'
      ? 'h-[34px] min-w-0 flex-1 rounded-[8px] border border-border bg-[#0a0c19] px-2 text-[12px] text-ink [color-scheme:dark] focus:border-brand focus:outline-none'
      : 'h-[34px] w-[132px] rounded-[8px] border border-border bg-[#0a0c19] px-2 text-[12px] text-ink [color-scheme:dark] focus:border-brand focus:outline-none'

  return (
    <div className={variant === 'full' ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center gap-1.5'}>
      <select
        value={selValue}
        onChange={(e) => onSelect(e.target.value)}
        className={selCls}
        title={variant === 'compact' ? 'Período de visualização — trocar exige Atualizar' : undefined}
      >
        {DATE_OPTIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {variant === 'compact' && d.value !== 'custom' ? `📅 ${d.label}` : d.label}
          </option>
        ))}
      </select>
      {isCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={custom.since}
            max={custom.until || todayStr()}
            onChange={(e) => setSince(e.target.value)}
            className={dateCls}
            title="Data inicial"
          />
          <span className="shrink-0 text-[11px] text-muted2">→</span>
          <input
            type="date"
            value={custom.until}
            min={custom.since}
            max={todayStr()}
            onChange={(e) => setUntil(e.target.value)}
            className={dateCls}
            title="Data final"
          />
        </div>
      )}
    </div>
  )
}
