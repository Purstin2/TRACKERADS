import { Archive, FolderTree, LayoutGrid, Tablet } from 'lucide-react'
import { useMonitor, type TableLevel } from '../MonitorContext'

/** Abas de nível no topo (Contas · Campanhas · Conjuntos · Anúncios), grudadas no
 *  card da tabela — o mesmo desenho do gerenciador que ele já usa. "Contas" é um
 *  agregado local das campanhas; as outras três vêm da API no nível escolhido. */
const TABS: { key: TableLevel; label: string; Icon: typeof Archive }[] = [
  { key: 'account', label: 'Contas', Icon: Archive },
  { key: 'campaign', label: 'Campanhas', Icon: FolderTree },
  { key: 'adset', label: 'Conjuntos', Icon: LayoutGrid },
  { key: 'ad', label: 'Anúncios', Icon: Tablet },
]

export default function LevelTabs() {
  const m = useMonitor()
  // Histórico/Gráfico/Ao vivo só existem no nível de campanha — as abas ficam inertes lá.
  const locked = m.view !== 'lista'

  return (
    <div className="flex items-end gap-1.5">
      {TABS.map(({ key, label, Icon }) => {
        const active = !locked ? m.tableLevel === key : key === 'campaign'
        return (
          <button
            key={key}
            disabled={locked || m.loading}
            onClick={() => m.setTableLevel(key)}
            title={locked ? 'Disponível na visão Tabela' : `Ver por ${label.toLowerCase()}`}
            className={`flex flex-1 items-center justify-center gap-2 rounded-t-[10px] border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors sm:justify-start ${
              active
                ? 'border-b-brand bg-surface text-brand-2'
                : 'border-b-transparent bg-surface2/60 text-muted2 hover:bg-surface2 hover:text-muted disabled:hover:bg-surface2/60 disabled:hover:text-muted2'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
