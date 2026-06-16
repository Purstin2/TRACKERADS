import { useId } from 'react'

export interface FunnelStage {
  label: string
  n: number
  color: string
}

interface Props {
  stages: FunnelStage[]
  prevStages?: { n: number }[] | null
  title?: string
  subtitle?: string
}

const pctTxt = (p: number) => (Math.abs(p - Math.round(p)) < 0.05 ? Math.round(p) : +p.toFixed(1))

export default function Funnel({ stages, prevStages, title, subtitle }: Props) {
  const gid = useId().replace(/:/g, '')
  const W = 1000
  const H = 230
  const minH = 10
  const n = stages.length
  const seg = W / n
  const xs: number[] = []
  for (let i = 0; i <= n; i++) xs.push(i * seg)
  const yT = (h: number) => (H - h) / 2
  const yB = (h: number) => (H + h) / 2
  const base = stages[0]?.n || 1

  function buildPath(st: { n: number }[], refBase: number): string {
    const hAt = (i: number) => {
      const v = i === 0 ? refBase : st[i - 1].n
      return minH + ((H - minH) * Math.max(0, v)) / refBase
    }
    let top = `M ${xs[0]} ${yT(hAt(0))}`
    for (let i = 1; i <= n; i++) {
      const c = (xs[i - 1] + xs[i]) / 2
      top += ` C ${c} ${yT(hAt(i - 1))} ${c} ${yT(hAt(i))} ${xs[i]} ${yT(hAt(i))}`
    }
    let bot = ` L ${xs[n]} ${yB(hAt(n))}`
    for (let i = n; i >= 1; i--) {
      const c = (xs[i] + xs[i - 1]) / 2
      bot += ` C ${c} ${yB(hAt(i))} ${c} ${yB(hAt(i - 1))} ${xs[i - 1]} ${yB(hAt(i - 1))}`
    }
    return top + bot + ' Z'
  }

  const path = buildPath(stages, base)
  const prevBase = prevStages ? prevStages[0]?.n || 1 : 1
  const prevPath = prevStages ? buildPath(prevStages, base) : ''
  const cols = { display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)` } as const

  return (
    <div className="rounded-xl2 border border-border bg-surface p-4 shadow-card-sm">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-[13px] font-bold">{title || 'Funil de Conversão'}</h3>
        {prevStages && (
          <span className="ml-auto flex items-center gap-2 text-[10px] text-muted2">
            <span className="inline-block h-1 w-4 rounded bg-brand-2" />
            atual
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[#e7eaf1]" />
            antes
          </span>
        )}
      </div>
      {subtitle && <div className="mb-3 text-[11px] text-muted2">{subtitle}</div>}

      {/* labels */}
      <div style={cols} className="mb-1.5">
        {stages.map((s, i) => (
          <div key={i} className="px-1 text-center text-[11px] font-semibold text-muted">
            {s.label}
          </div>
        ))}
      </div>

      {/* svg + pct overlay */}
      <div className="relative">
        <svg className="block w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 200 }}>
          <defs>
            <linearGradient id={`fnl-${gid}`} x1="0" y1="0" x2="1" y2="0">
              {stages.map((s, i) => (
                <stop key={i} offset={`${((i / Math.max(1, n - 1)) * 100).toFixed(1)}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          <path d={path} fill={`url(#fnl-${gid})`} />
          {prevPath && (
            <path
              d={prevPath}
              fill="none"
              stroke="#e7eaf1"
              strokeWidth={2}
              strokeDasharray="7 5"
              opacity={0.75}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {xs.slice(1, n).map((x, i) => (
            <line key={i} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,.06)" strokeWidth={1} />
          ))}
        </svg>

        {/* pct overlay (centralizado vertical) */}
        <div style={cols} className="pointer-events-none absolute inset-0 items-center">
          {stages.map((s, i) => {
            const p = (s.n / base) * 100
            let sub = null
            if (prevStages) {
              const pp = (prevStages[i].n / prevBase) * 100
              const d = p - pp
              const cls = Math.abs(d) < 0.05 ? 'text-white/60' : d > 0 ? 'text-ok' : 'text-danger'
              sub = (
                <div className={`text-[9px] font-semibold ${cls}`} style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                  antes {pctTxt(pp)}% <b>{d > 0 ? '+' : ''}{pctTxt(d)}pp</b>
                </div>
              )
            }
            return (
              <div key={i} className="flex flex-col items-center justify-center">
                <span className="text-[14px] font-extrabold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,.7)' }}>
                  {pctTxt(p)}%
                </span>
                {sub}
              </div>
            )
          })}
        </div>
      </div>

      {/* counts */}
      <div style={cols} className="mt-1.5">
        {stages.map((s, i) => (
          <div key={i} className="px-1 text-center text-[12px] font-bold text-ink">
            {s.n.toLocaleString('pt-BR')}
          </div>
        ))}
      </div>
    </div>
  )
}
