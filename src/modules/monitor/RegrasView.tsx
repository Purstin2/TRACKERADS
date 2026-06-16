import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useMonitor } from './MonitorContext'
import { campUrl } from '@/lib/meta'
import { trunc } from './config'
import { toast } from '@/components/ui/toast'

const RL_METRICS: Record<string, string> = {
  roas: 'ROAS',
  cpa: 'CPA',
  spend: 'Gasto acumulado',
  sales: 'Vendas',
  days_no_sale: 'Dias sem venda',
}
const RL_OPS: Record<string, string> = { '<': 'menor que', '>': 'maior que', '<=': '≤', '>=': '≥' }
const RL_ACTIONS: Record<string, string> = { pause: '🔴 Pausar', flag: '⚠️ Alertar' }

interface Rule {
  id: string
  name: string
  metric: string
  op: string
  value: number
  period: number
  action: string
  enabled: boolean
}

const RL_PRESETS: Omit<Rule, 'id' | 'enabled'>[] = [
  { name: 'Matar — ROAS < breakeven 3 dias', metric: 'roas', op: '<', value: 1.23, period: 3, action: 'pause' },
  { name: 'Matar — sem venda 3 dias', metric: 'days_no_sale', op: '>=', value: 3, period: 3, action: 'pause' },
  { name: 'Atenção — CPA alto 2 dias', metric: 'cpa', op: '>', value: 12, period: 2, action: 'flag' },
  { name: 'Atenção — gasto alto sem retorno', metric: 'spend', op: '>', value: 50, period: 1, action: 'flag' },
]

const rlId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
function loadRules(): Rule[] {
  try {
    return JSON.parse(localStorage.getItem('meta_rules') || '[]')
  } catch {
    return []
  }
}

export default function RegrasView() {
  const m = useMonitor()
  const [rules, setRules] = useState<Rule[]>(loadRules)
  const [form, setForm] = useState({ name: '', metric: 'roas', op: '<', value: '', period: 3, action: 'pause' })

  const save = (r: Rule[]) => {
    setRules(r)
    localStorage.setItem('meta_rules', JSON.stringify(r))
  }
  function add(rule?: Omit<Rule, 'id' | 'enabled'>) {
    if (rule) {
      save([...rules, { ...rule, id: rlId(), enabled: true }])
      toast('✓ Regra criada', 'ok')
      return
    }
    if (!form.name.trim()) return toast('Digite um nome para a regra', 'err')
    const value = parseFloat(form.value)
    if (isNaN(value)) return toast('Valor inválido', 'err')
    save([
      ...rules,
      { id: rlId(), name: form.name.trim(), metric: form.metric, op: form.op, value, period: form.period, action: form.action, enabled: true },
    ])
    setForm({ ...form, name: '', value: '' })
    toast('✓ Regra criada', 'ok')
  }
  const toggle = (i: number) => save(rules.map((r, idx) => (idx === i ? { ...r, enabled: !r.enabled } : r)))
  const del = (i: number) => {
    if (confirm('Remover esta regra?')) save(rules.filter((_, idx) => idx !== i))
  }

  const hits = evaluate(rules, m.cache, m.settings)
  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      {/* form */}
      <div className="card-body card">
        <h3 className="mb-3.5 text-[13px] font-bold">⚡ Nova Regra</h3>
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {RL_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => add(p)}
              className="rounded-full border border-border2 bg-surface2 px-2.5 py-1 text-[11px] font-semibold text-muted transition-all hover:border-brand hover:text-ink"
            >
              ＋ {p.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="field flex-1" style={{ minWidth: 140 }}>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Matar ROAS baixo" />
          </div>
          <div className="field">
            <label>Métrica</label>
            <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
              {Object.entries(RL_METRICS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Operador</label>
            <select value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })}>
              {Object.entries(RL_OPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {k} ({v})
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 90 }}>
            <label>Valor</label>
            <input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="1.23" />
          </div>
          <div className="field">
            <label>Período</label>
            <select value={form.period} onChange={(e) => setForm({ ...form, period: +e.target.value })}>
              {[1, 2, 3, 7].map((d) => (
                <option key={d} value={d}>
                  {d} dia{d > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ação</label>
            <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              {Object.entries(RL_ACTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => add()}>
            ＋ Criar regra
          </button>
        </div>
      </div>

      {/* lista de regras */}
      {rules.length > 0 ? (
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
            {rules.length} regra{rules.length !== 1 ? 's' : ''} · {enabledCount} ligada{enabledCount !== 1 ? 's' : ''}
          </div>
          <div className="flex flex-col gap-2">
            {rules.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-[9px] border border-border bg-surface px-3.5 py-3 ${r.enabled ? '' : 'opacity-45'}`}
              >
                <div className="flex-1 text-[12px] leading-relaxed">
                  Se <b className="text-brand-2">{RL_METRICS[r.metric]}</b> {RL_OPS[r.op]} <b className="text-brand-2">{r.value}</b>
                  {r.metric !== 'days_no_sale' && ` nos últimos ${r.period} dia${r.period > 1 ? 's' : ''}`}{' '}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.action === 'pause' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'}`}>
                    {RL_ACTIONS[r.action]}
                  </span>
                  <div className="text-[10px] text-muted2">{r.name}</div>
                </div>
                <button
                  onClick={() => toggle(i)}
                  className={`relative h-[19px] w-[34px] flex-shrink-0 rounded-full transition-colors ${r.enabled ? 'bg-ok' : 'bg-border2'}`}
                >
                  <span className={`absolute top-0.5 h-[15px] w-[15px] rounded-full bg-white transition-transform ${r.enabled ? 'translate-x-[17px]' : 'translate-x-0.5'}`} />
                </button>
                <button onClick={() => del(i)} className="text-muted2 hover:text-danger">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl2 border border-dashed border-border py-6 text-center text-[12px] text-muted2">
          Nenhuma regra criada. Use os presets acima ou crie uma personalizada.
        </div>
      )}

      {/* avaliação */}
      <div className="card-body card">
        {!m.cache.length || !enabledCount ? (
          <>
            <h3 className="mb-2 text-[13px] font-bold">📋 Avaliação das Regras</h3>
            <div className="text-[12px] text-muted">
              Carregue campanhas em <b>Campanhas → Histórico</b> para avaliar as regras automaticamente.
            </div>
          </>
        ) : hits.length === 0 ? (
          <>
            <h3 className="mb-2 text-[13px] font-bold">📋 Avaliação das Regras</h3>
            <div className="text-[12px] text-ok">✅ Nenhuma campanha disparou regras no período carregado.</div>
          </>
        ) : (
          <>
            <h3 className="mb-2 text-[13px] font-bold">
              📋 {hits.length} disparo{hits.length !== 1 ? 's' : ''} detectado{hits.length !== 1 ? 's' : ''}
            </h3>
            <div className="flex flex-col gap-1.5">
              {hits.map((h, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 rounded-[9px] border-l-[3px] px-3 py-2 text-[12px] ${h.action === 'pause' ? 'border-danger bg-danger/[0.07]' : 'border-warn bg-warn/[0.07]'}`}
                >
                  <span className="flex-1 font-semibold">{trunc(h.camp, 40)}</span>
                  <span className="text-[11px] text-muted">
                    {h.rule} · val: {typeof h.val === 'number' ? h.val.toFixed(2) : h.val}
                  </span>
                  <a href={campUrl(h.accId, h.campId)} target="_blank" className="text-muted2 hover:text-brand-2">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface Hit {
  camp: string
  rule: string
  action: string
  val: number
  accId: string
  campId: string
}
function evaluate(rules: Rule[], cache: ReturnType<typeof useMonitor>['cache'], _settings: unknown): Hit[] {
  const enabled = rules.filter((r) => r.enabled)
  if (!cache.length || !enabled.length) return []
  const hits: Hit[] = []
  cache.forEach(({ acc, campMap, dates }) => {
    if (!campMap || !dates) return
    Object.entries(campMap).forEach(([cid, camp]) => {
      enabled.forEach((rule) => {
        const period = dates.slice(-rule.period)
        if (!period.length) return
        let val: number | null = null
        if (rule.metric === 'days_no_sale') {
          val = period.filter((d) => camp.dates[d] && camp.dates[d].sales === 0).length
        } else if (rule.metric === 'spend') {
          val = period.reduce((s, d) => s + (camp.dates[d] ? camp.dates[d].spend : 0), 0)
        } else {
          const key = rule.metric === 'roas' ? 'roas' : 'cpa'
          const vals = period
            .map((d) => (camp.dates[d] ? (camp.dates[d] as any)[key] : null))
            .filter((v) => v !== null && v !== undefined) as number[]
          if (!vals.length) return
          val = vals.reduce((a, b) => a + b, 0) / vals.length
        }
        if (val === null) return
        const t =
          (rule.op === '<' && val < rule.value) ||
          (rule.op === '>' && val > rule.value) ||
          (rule.op === '<=' && val <= rule.value) ||
          (rule.op === '>=' && val >= rule.value)
        if (t) hits.push({ camp: camp.name, rule: rule.name, action: rule.action, val, accId: acc.id, campId: cid })
      })
    })
  })
  return hits
}
