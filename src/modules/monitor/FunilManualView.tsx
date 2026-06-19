import { PALETTE } from './config'
import Funnel from './components/Funnel'
import { usePersistentState } from '@/lib/appState'

interface Stage {
  label: string
  n: number
}
interface FunMan {
  compare: boolean
  stages: Stage[]
  prev: { n: number }[]
}

const DEFAULT: FunMan = {
  compare: false,
  stages: [
    { label: 'Cliques', n: 1000 },
    { label: 'Vis. Página', n: 800 },
    { label: 'Initiate Checkout', n: 300 },
    { label: 'Vendas Iniciadas', n: 120 },
    { label: 'Vendas Aprovadas', n: 90 },
  ],
  prev: [{ n: 1000 }, { n: 760 }, { n: 260 }, { n: 95 }, { n: 70 }],
}

const color = (i: number) => PALETTE[i % PALETTE.length]
const fmPct = (p: number) => (Math.abs(p - Math.round(p)) < 0.05 ? Math.round(p) : +p.toFixed(1))

export default function FunilManualView() {
  // funil manual persistido no Supabase
  const [fm, setFm] = usePersistentState<FunMan>('meta_funman', JSON.parse(JSON.stringify(DEFAULT)))

  function save(next: FunMan) {
    // sincroniza prev com nº de stages
    while (next.prev.length < next.stages.length) next.prev.push({ n: 0 })
    next.prev.length = next.stages.length
    setFm({ ...next })
  }
  const setStage = (i: number, field: 'label' | 'num' | 'prev', val: string) => {
    const next = fm
    if (field === 'label') next.stages[i].label = val
    else if (field === 'num') next.stages[i].n = Math.max(0, parseFloat(val) || 0)
    else next.prev[i] = { n: Math.max(0, parseFloat(val) || 0) }
    save(next)
  }
  const addStage = () => save({ ...fm, stages: [...fm.stages, { label: 'Nova etapa', n: 0 }], prev: [...fm.prev, { n: 0 }] })
  const rmStage = (i: number) => {
    if (fm.stages.length <= 2) return
    save({ ...fm, stages: fm.stages.filter((_, idx) => idx !== i), prev: fm.prev.filter((_, idx) => idx !== i) })
  }
  const zero = () => save({ ...fm, stages: fm.stages.map((s) => ({ ...s, n: 0 })), prev: fm.prev.map(() => ({ n: 0 })) })
  const reset = () => {
    if (confirm('Voltar ao funil de exemplo padrão?')) save(JSON.parse(JSON.stringify(DEFAULT)))
  }

  const base = fm.stages[0]?.n || 0
  const last = fm.stages[fm.stages.length - 1]?.n || 0
  const convTotal = base > 0 ? (last / base) * 100 : 0
  const pb = fm.prev[0]?.n || 0
  const pl = fm.prev[fm.prev.length - 1]?.n || 0
  const pc = pb > 0 ? (pl / pb) * 100 : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.06] px-3.5 py-2.5 text-[12px] text-muted">
        ✏️ <b className="text-ink">Funil de especulação</b> — digite os números de cada etapa e veja a conversão na hora. Não puxa
        nada do Meta; é seu rascunho de projeção (salvo no navegador). Ligue <b className="text-ink">Comparar cenário</b> pra
        sobrepor um funil "antes".
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <input type="checkbox" checked={fm.compare} onChange={(e) => save({ ...fm, compare: e.target.checked })} />
          📊 Comparar cenário (antes)
        </label>
        <button className="btn btn-ghost btn-sm" onClick={addStage}>
          ＋ Etapa
        </button>
        <button className="btn btn-ghost btn-sm" onClick={zero}>
          Zerar
        </button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>
          ↺ Padrão
        </button>
      </div>

      {/* funil de água */}
      <Funnel
        stages={fm.stages.map((s, i) => ({ label: s.label || `Etapa ${i + 1}`, n: Math.max(0, s.n || 0), color: color(i) }))}
        prevStages={fm.compare ? fm.prev.map((p) => ({ n: Math.max(0, p.n || 0) })) : null}
        title="Funil Manual (especulação)"
        subtitle={'Números digitados por você — projeção, não dados do Meta.' + (fm.compare ? ' Contorno pontilhado = cenário antes.' : '')}
      />

      {/* editor */}
      <div className="flex flex-col gap-2">
        {fm.stages.map((s, i) => {
          const prevN = i > 0 ? fm.stages[i - 1].n || 0 : 0
          const step = i === 0 ? 100 : prevN > 0 ? (s.n / prevN) * 100 : 0
          const ofBase = base > 0 ? (s.n / base) * 100 : 0
          return (
            <div key={i} className="rounded-xl2 border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: color(i) }} />
                <input
                  value={s.label}
                  onChange={(e) => setStage(i, 'label', e.target.value)}
                  className="min-w-[120px] flex-1 rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] font-semibold text-ink"
                />
                <input
                  type="number"
                  min={0}
                  value={s.n}
                  onChange={(e) => setStage(i, 'num', e.target.value)}
                  className="w-[110px] rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
                />
                {fm.compare && (
                  <input
                    type="number"
                    min={0}
                    value={fm.prev[i]?.n ?? 0}
                    onChange={(e) => setStage(i, 'prev', e.target.value)}
                    title="cenário antes"
                    className="w-[100px] rounded-[7px] border border-dashed border-border2 bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-muted2"
                  />
                )}
                {fm.stages.length > 2 && (
                  <button onClick={() => rmStage(i)} className="text-[11px] text-muted2 hover:text-danger">
                    ✕ etapa
                  </button>
                )}
              </div>
              <div className="mt-1.5 text-[11px] text-muted2">
                {i === 0 ? (
                  'topo do funil = 100%'
                ) : (
                  <>
                    <b className={step >= 50 ? 'text-ok' : step >= 20 ? 'text-warn' : 'text-danger'}>{fmPct(step)}%</b> da etapa anterior ·{' '}
                    {fmPct(ofBase)}% do topo
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl2 border border-border bg-surface px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted2">Conversão total</div>
          <div className={`text-[22px] font-extrabold ${convTotal >= 10 ? 'text-ok' : convTotal >= 5 ? 'text-warn' : 'text-danger'}`}>
            {fmPct(convTotal)}%
          </div>
          <div className="text-[11px] text-muted2">
            {last.toLocaleString('pt-BR')} de {base.toLocaleString('pt-BR')} (topo→fim)
          </div>
        </div>
        {fm.compare && (
          <div className="rounded-xl2 border border-border bg-surface px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted2">Cenário antes</div>
            <div className="text-[22px] font-extrabold text-muted">{fmPct(pc)}%</div>
            <div className="text-[11px] text-muted2">
              topo→fim · agora {convTotal - pc >= 0 ? '+' : ''}
              {fmPct(convTotal - pc)}pp
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
