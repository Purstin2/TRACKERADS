import { RefreshCw } from 'lucide-react'
import { useMonitor, type MonitorView } from '../MonitorContext'
import { DATE_OPTIONS } from '../config'

const VIEWS: { value: MonitorView; label: string }[] = [
  { value: 'lista', label: 'Lista' },
  { value: 'historico', label: 'Histórico' },
  { value: 'grafico', label: 'Gráfico' },
]

export default function ContextBar() {
  const m = useMonitor()
  return (
    <div className="mb-5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Período</span>
      <select
        value={m.datePreset}
        onChange={(e) => m.setDatePreset(e.target.value)}
        className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
      >
        {DATE_OPTIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      <div className="ml-1 flex overflow-hidden rounded-[8px] border border-border bg-surface2">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            onClick={() => m.setView(v.value)}
            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              m.view === v.value ? 'bg-brand text-white' : 'text-muted2'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <button className="btn btn-primary btn-sm ml-auto" onClick={m.loadMonitor} disabled={m.loading}>
        <RefreshCw className={`h-3.5 w-3.5 ${m.loading ? 'animate-spin' : ''}`} />
        {m.loading ? 'Carregando...' : 'Atualizar'}
      </button>

      <button
        onClick={() => m.setExec(!m.exec)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${
          m.exec ? 'border-ok/40 bg-ok/15 text-ok' : 'border-border bg-surface2 text-muted2'
        }`}
        title="Quando ON, ações de escala/pausa são executadas de verdade na API"
      >
        <span className={`h-2 w-2 rounded-full ${m.exec ? 'bg-ok' : 'bg-muted2'}`} />
        Execução {m.exec ? 'ON' : 'OFF'}
      </button>
      </div>

      {m.campSel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[9px] border border-brand/30 bg-brand/[0.07] px-3 py-1.5 text-[12px]">
          <span className="font-bold text-brand-2">{m.campSel.size} selecionada(s)</span>
          <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={m.onlySelected} onChange={(e) => m.setOnlySelected(e.target.checked)} /> ver só elas (Lista · Histórico · Gráfico)
          </label>
          <button onClick={m.clearCampSel} className="ml-auto text-muted2 hover:text-ink">
            ✕ limpar
          </button>
        </div>
      )}
    </div>
  )
}
