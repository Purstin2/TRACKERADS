import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Construction, X } from 'lucide-react'
import { MonitorProvider, useMonitor } from './MonitorContext'
import ContextBar from './components/ContextBar'
import SharedBar from './components/SharedBar'
import LevelTabs from './components/LevelTabs'
import Toolbar from './components/Toolbar'
import FilterBar from './components/FilterBar'
import {
  ListaView,
  ContasView,
  HistoricoView,
  GraficoView,
  SummaryStrip,
  tallyCounts,
} from './MonitorViews'
import AoVivoView from './AoVivoView'
import RegrasView from './RegrasView'
import PrecosView from './PrecosView'
import FunilManualView from './FunilManualView'
import DiarioView from './DiarioView'
import AcoesView from './AcoesView'
import PorOfertaView from './PorOfertaView'
import CriativosView from './CriativosView'
import FunilMetaView from './FunilMetaView'
import PublicosView from './PublicosView'
import LogActionHost from './LogActionModal'
import type { Settings } from './config'

const TAB_LABELS: Record<string, string> = {
  monitor: 'Campanhas',
  oferta: 'Por Oferta',
  funil: 'Funil',
  publicos: 'Públicos',
  criativos: 'Criativos',
  regras: 'Regras',
  precos: 'Preços',
  diario: 'Diário',
  funman: 'Funil Manual',
  acoes: 'Ações',
}
const READY = new Set(['monitor', 'regras', 'precos', 'funman', 'diario', 'acoes', 'oferta', 'criativos', 'funil', 'publicos'])

function tabFromPath(pathname: string): string {
  const seg = pathname.replace(/^\/monitor\/?/, '').split('/')[0]
  if (!seg || ['lista', 'historico', 'grafico'].includes(seg)) return 'monitor'
  return seg
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const m = useMonitor()
  const [s, setS] = useState<Settings>(m.settings)
  const set = (k: keyof Settings, v: string) => setS((p) => ({ ...p, [k]: parseFloat(v) || 0 }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-[13px] font-bold">Parâmetros de análise</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="card-body grid grid-cols-2 gap-4">
          <div className="field">
            <label>ROAS escala (good)</label>
            <input type="number" step="0.1" value={s.roasGood} onChange={(e) => set('roasGood', e.target.value)} />
          </div>
          <div className="field">
            <label>ROAS breakeven</label>
            <input type="number" step="0.01" value={s.roasBe} onChange={(e) => set('roasBe', e.target.value)} />
          </div>
          <div className="field">
            <label>CPA máximo ($)</label>
            <input type="number" step="0.5" value={s.cpaMax} onChange={(e) => set('cpaMax', e.target.value)} />
          </div>
          <div className="field">
            <label>Câmbio BRL</label>
            <input type="number" step="0.1" value={s.fx} onChange={(e) => set('fx', e.target.value)} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                m.saveSettings(s)
                onClose()
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MonitorInner() {
  const m = useMonitor()
  const loc = useLocation()
  const tab = tabFromPath(loc.pathname)
  const [showSettings, setShowSettings] = useState(false)
  const counts = useMemo(() => tallyCounts(m.cache, m.settings), [m.cache, m.settings])
  const hasData = m.cache.length > 0

  return (
    <div>
      <SharedBar onSettings={() => setShowSettings(true)} showFilters={tab !== 'monitor'} />

      {tab === 'monitor' ? (
        <>
          {hasData && <SummaryStrip counts={counts} />}

          {/* Abas grudadas no card, filtros rotulados, tabela — o desenho do
              gerenciador que ele já usa no dia a dia. */}
          <LevelTabs />
          <div className="card !rounded-t-none">
            <Toolbar onSettings={() => setShowSettings(true)} />
            <FilterBar />
            <ContextBar />

            {!hasData && !m.loading && (
              <div className="px-6 py-14 text-center">
                <h3 className="text-[15px] font-bold">Monitor de Campanhas</h3>
                <p className="mt-1 text-[13px] text-muted">
                  Cole o token, escolha as contas e clique em <b className="text-ink">Atualizar</b>.
                </p>
              </div>
            )}
            {m.loading && (
              <div className="flex items-center justify-center py-16">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand" />
              </div>
            )}
            {hasData && !m.loading && (
              <>
                {m.view === 'lista' &&
                  (m.tableLevel === 'account' ? <ContasView items={m.cache} /> : <ListaView items={m.cache} />)}
                {m.view === 'historico' && <div className="p-4"><HistoricoView items={m.cache} /></div>}
                {m.view === 'grafico' && <div className="p-4"><GraficoView items={m.cache} /></div>}
                {m.view === 'aovivo' && <div className="p-4"><AoVivoView items={m.cache} /></div>}
              </>
            )}
          </div>
        </>
      ) : tab === 'regras' ? (
        <RegrasView />
      ) : tab === 'precos' ? (
        <PrecosView />
      ) : tab === 'funman' ? (
        <FunilManualView />
      ) : tab === 'diario' ? (
        <DiarioView />
      ) : tab === 'acoes' ? (
        <AcoesView />
      ) : tab === 'oferta' ? (
        <PorOfertaView />
      ) : tab === 'criativos' ? (
        <CriativosView />
      ) : tab === 'funil' ? (
        <FunilMetaView />
      ) : tab === 'publicos' ? (
        <PublicosView />
      ) : (
        <div className="mx-auto max-w-[560px] rounded-xl2 border border-border bg-surface p-10 text-center">
          <Construction className="mx-auto mb-3 h-8 w-8 text-warn" />
          <h3 className="text-lg font-bold">{TAB_LABELS[tab] || 'Monitor'}</h3>
          <p className="mt-1 text-[13px] text-muted">
            Esta aba entra na próxima leva do port. Use <b>Campanhas</b> na barra lateral — já
            está funcional.
          </p>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <LogActionHost />
    </div>
  )
}

export default function MonitorPage() {
  return (
    <MonitorProvider>
      <MonitorInner />
    </MonitorProvider>
  )
}
