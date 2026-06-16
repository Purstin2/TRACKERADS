import type { LucideIcon } from 'lucide-react'
import { Construction } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  status?: string
  features?: string[]
}

export default function ModulePlaceholder({
  icon: Icon,
  title,
  description,
  status = 'Em migração',
  features = [],
}: Props) {
  return (
    <div className="mx-auto max-w-[680px]">
      <div className="card">
        <div className="card-body flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/12 text-brand-2">
            <Icon className="h-8 w-8" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
            <p className="mt-1 max-w-[420px] text-[13px] text-muted">{description}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-3 py-1 text-[11px] font-bold text-warn">
            <Construction className="h-3.5 w-3.5" />
            {status}
          </span>

          {features.length > 0 && (
            <div className="mt-2 w-full max-w-[440px] rounded-xl border border-border bg-surface2 p-4 text-left">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted2">
                O que vem aqui
              </div>
              <ul className="flex flex-col gap-1.5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12.5px] text-ink">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand-2" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
