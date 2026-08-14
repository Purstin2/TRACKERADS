import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Clipboard,
  Columns3,
  Filter,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Zap,
} from 'lucide-react'
import { useMonitor, type MonitorView } from '../MonitorContext'
import { touchedIds, useLog } from '../actionLog'
import ColumnsModal from './ColumnsModal'
import PeriodPicker from './PeriodPicker'
import AccountErrors from './AccountErrors'
import { toast } from '@/components/ui/toast'

/** "Atualizado há 3 minutos" — recalcula sozinho a cada 30s. */
function LastUpdate() {
  const m = useMonitor()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])
  if (!m.lastLoad) return <span className="whitespace-nowrap text-[12px] text-muted2">Nunca atualizado</span>
  const mins = Math.floor((Date.now() - m.lastLoad) / 60000)
  const txt =
    mins < 1 ? 'agora mesmo' : mins === 1 ? 'há 1 minuto' : mins < 60 ? `há ${mins} minutos` : `há ${Math.floor(mins / 60)}h`
  return <span className="whitespace-nowrap text-[12px] text-muted2">Atualizado {txt}</span>
}

/** Visual único dos botões da barra — todos com ícone E rótulo. */
const BAR_BTN =
  'flex h-[34px] items-center gap-1.5 rounded-[8px] border border-border bg-[#0a0c19] px-3 text-[12px] font-semibold text-muted transition-colors hover:border-brand hover:text-ink'
const BAR_BTN_ON =
  'flex h-[34px] items-center gap-1.5 rounded-[8px] border border-brand bg-brand/15 px-3 text-[12px] font-semibold text-brand-2 transition-colors'

/** Botão de ícone da barra — segmentado, como o grupo do gerenciador. */
function IconBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-[34px] w-[38px] items-center justify-center border-r border-border transition-colors last:border-r-0 ${
        active ? 'bg-brand/15 text-brand-2' : 'text-muted2 hover:bg-surface2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, close])
  return ref
}

const MENU_ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-muted transition-colors hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'

/* Antes "Personalizar colunas" morava dentro de um dropdown de um ícone sem
 * rótulo: dois cliques, e quem não abrisse o menu jurava que o botão era morto.
 * Agora são dois botões diretos, com nome — um clique, sem menu no meio. */

/** "Ações ▾" — o menu em massa da referência: só liga quando há linhas marcadas. */
function BulkMenu() {
  const m = useMonitor()
  const [open, setOpen] = useState(false)
  const ref = useOutside(open, () => setOpen(false))
  const n = m.campSel.size
  const ids = [...m.campSel].map((k) => k.split('::')[1]).filter(Boolean)

  const copyIds = async () => {
    try {
      await navigator.clipboard.writeText(ids.join('\n'))
      toast(`${ids.length} ID(s) copiado(s)`, 'ok')
    } catch {
      toast('Não consegui copiar', 'err')
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={!n}
        onClick={() => setOpen((o) => !o)}
        // sem título, um botão apagado que não responde parece quebrado
        title={n ? 'Ações em massa nas selecionadas' : 'Marque campanhas na tabela para liberar as ações em massa'}
        className="flex h-[34px] items-center gap-1.5 rounded-[8px] border border-border bg-[#0a0c19] px-3 text-[12px] font-semibold text-muted transition-colors hover:border-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
      >
        Ações {n > 0 && <span className="font-mono text-brand-2">({n})</span>}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[230px] overflow-hidden rounded-[10px] border border-border bg-surface py-1 shadow-card">
          <button className={MENU_ITEM} onClick={() => { m.setOnlySelected(!m.onlySelected); setOpen(false) }}>
            <Filter className="h-4 w-4" /> {m.onlySelected ? 'Mostrar todas' : 'Filtrar selecionadas'}
          </button>
          <button className={MENU_ITEM} onClick={copyIds}>
            <Clipboard className="h-4 w-4" /> Copiar ID
          </button>
          <button className={MENU_ITEM} onClick={() => { m.clearCampSel(); setOpen(false) }}>
            <Trash2 className="h-4 w-4" /> Limpar seleção
          </button>
        </div>
      )}
    </div>
  )
}

/** "Mexidas hoje": deixa na tela só o que eu aumentei/escalei/dupliquei hoje.
 *  Botão com rótulo e contador — como ícone puro ninguém sabia o que era, e sem
 *  nada mexido o clique não fazia absolutamente nada, sem dizer por quê. */
function TouchedFilter() {
  const m = useMonitor()
  useLog() // reconta assim que eu aumento orçamento ou duplico
  const n = touchedIds().size
  const on = m.touchedOnly

  const click = () => {
    if (!n && !on) {
      toast('Nenhuma campanha mexida hoje ainda — o filtro liga sozinho quando você aumentar orçamento ou duplicar alguma.', 'info')
      return
    }
    m.setTouchedOnly(!on)
  }

  return (
    <button
      type="button"
      onClick={click}
      title={n ? 'Ver só as campanhas que eu mexi hoje' : 'Nenhuma campanha mexida hoje ainda'}
      className={`flex h-[34px] items-center gap-1.5 rounded-[8px] border px-3 text-[12px] font-semibold transition-colors ${
        on
          ? 'border-brand bg-brand/15 text-brand-2'
          : n
            ? 'border-border bg-[#0a0c19] text-muted hover:border-brand hover:text-ink'
            : 'border-border bg-[#0a0c19] text-muted2 opacity-60 hover:opacity-100'
      }`}
    >
      <Zap className="h-3.5 w-3.5" />
      Mexidas hoje
      <span className="font-mono">({n})</span>
    </button>
  )
}

/** Badge de tracking: compara vendas do Meta com as vendas reais do gateway. */
function TrackingBadge() {
  const m = useMonitor()
  const real = Object.keys(m.realMap).length
  if (!m.cache.length) return null
  if (!real)
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface2 px-3 py-1.5 text-[11.5px] font-semibold text-muted2" title="Nenhuma venda do gateway casou com estas campanhas no período">
        <Activity className="h-3.5 w-3.5" /> Sem venda trackeada
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ok/15 px-3 py-1.5 text-[11.5px] font-semibold text-ok" title={`${real} campanha(s) com venda casada por ID no gateway`}>
      <CheckCircle2 className="h-3.5 w-3.5" /> {real} com venda trackeada
    </span>
  )
}

const VIEWS: { value: MonitorView; label: string }[] = [
  { value: 'lista', label: 'Tabela' },
  { value: 'historico', label: 'Histórico' },
  { value: 'grafico', label: 'Gráfico' },
  { value: 'aovivo', label: 'Ao vivo' },
]

export default function Toolbar({ onSettings }: { onSettings: () => void }) {
  const m = useMonitor()
  useLog() // "Mexidas hoje" reconta assim que eu aumento/duplico
  const [cols, setCols] = useState(false)

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center">
      {cols && <ColumnsModal onClose={() => setCols(false)} />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCols(true)} title="Escolher e ordenar as colunas da tabela" className={BAR_BTN}>
          <Columns3 className="h-3.5 w-3.5" /> Colunas
        </button>
        <button type="button" onClick={onSettings} title="ROAS de escala, breakeven, CPA máximo e câmbio" className={BAR_BTN}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Parâmetros
        </button>
        <button
          type="button"
          onClick={() => m.setCompact(!m.compact)}
          title={m.compact ? 'Mostrar chips, abas e filtros de novo' : 'Compactar o topo — cabe mais que o dobro de campanhas na tela'}
          className={m.compact ? BAR_BTN_ON : BAR_BTN}
        >
          {m.compact ? <ChevronsDown className="h-3.5 w-3.5" /> : <ChevronsUp className="h-3.5 w-3.5" />}
          {m.compact ? 'Expandir' : 'Compactar'}
        </button>

        <BulkMenu />
        <TouchedFilter />

        {/* visão da tabela */}
        <div className="flex overflow-hidden rounded-[8px] border border-border bg-[#0a0c19]">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => m.setView(v.value)}
              className={`px-3 py-[7px] text-[12px] font-semibold transition-colors ${
                m.view === v.value ? 'bg-brand text-white' : 'text-muted2 hover:text-ink'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <TrackingBadge />
        <AccountErrors />
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
        {/* Compacto esconde a FilterBar inteira — o período reaparece AQUI, no canto,
            pra não sumir junto com os filtros e sem roubar altura da tabela. */}
        {m.compact && <PeriodPicker variant="compact" />}
        <LastUpdate />
        <button className="btn btn-primary btn-sm h-[34px] px-5" onClick={() => m.loadMonitor()} disabled={m.loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${m.loading ? 'animate-spin' : ''}`} />
          {m.loading ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>
    </div>
  )
}
