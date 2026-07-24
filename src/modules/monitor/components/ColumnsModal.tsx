import { useMemo, useState } from 'react'
import { GripVertical, RotateCcw, Search, X } from 'lucide-react'
import { COL_CATALOG, getColCfg, setColCfg, visibleCols } from '../MonitorViews'
import { Checkbox } from '../MonitorViews'

/** Personalizar colunas — duas colunas, igual ao gerenciador:
 *  à esquerda tudo que existe (com busca e checkbox), à direita o que está na
 *  tabela, na ordem, arrastável e com ✕ pra tirar.
 *  Edita um rascunho e só grava no Salvar — Cancelar não deixa rastro. */
export default function ColumnsModal({ onClose }: { onClose: () => void }) {
  const cfg0 = getColCfg()
  const [order, setOrder] = useState<string[]>(cfg0.order)
  const [hidden, setHidden] = useState<string[]>(cfg0.hidden)
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState<string | null>(null)

  const label = useMemo(() => Object.fromEntries(COL_CATALOG.map((c) => [c.key, c.label])), [])
  const active = order.filter((k) => !hidden.includes(k))
  const ql = q.trim().toLowerCase()
  const catalog = COL_CATALOG.filter((c) => !ql || c.label.toLowerCase().includes(ql))

  const toggle = (key: string) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))

  /** Arrastar dentro da lista da direita reordena a tabela inteira: a nova ordem
   *  dos visíveis vale, e as desligadas ficam no fim pra não sumirem do config. */
  const drop = (target: string) => {
    if (!drag || drag === target) return setDrag(null)
    const vis = [...active]
    vis.splice(vis.indexOf(drag), 1)
    vis.splice(vis.indexOf(target), 0, drag)
    setOrder([...vis, ...order.filter((k) => hidden.includes(k))])
    setDrag(null)
  }

  const save = () => {
    setColCfg({ ...getColCfg(), order, hidden })
    onClose()
  }
  const restore = () => {
    setOrder(COL_CATALOG.map((c) => c.key))
    setHidden([])
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-[820px] flex-col overflow-hidden rounded-xl2 border border-border bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-bold">Personalize as colunas</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">Escolha como você quer visualizar as colunas na tabela.</p>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-ink" title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 border-y border-border sm:grid-cols-[1fr_340px]">
          {/* esquerda: catálogo com busca */}
          <div className="flex min-h-0 flex-col border-border sm:border-r">
            <div className="relative px-4 py-3">
              <Search className="pointer-events-none absolute left-[26px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por coluna"
                className="h-[38px] w-full rounded-[8px] border border-border bg-[#0a0c19] pl-8 pr-3 text-[12.5px] text-ink focus:border-brand focus:outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {catalog.length === 0 && (
                <p className="px-5 py-6 text-center text-[12px] text-muted2">Nenhuma coluna com esse nome.</p>
              )}
              {catalog.map((c) => {
                const on = !hidden.includes(c.key)
                return (
                  <button
                    key={c.key}
                    onClick={() => toggle(c.key)}
                    className={`flex w-full items-center gap-2.5 px-5 py-2 text-left text-[12.5px] transition-colors hover:bg-surface2 ${
                      on ? 'text-ink' : 'text-muted'
                    }`}
                  >
                    <Checkbox checked={on} onChange={() => toggle(c.key)} />
                    <span className="truncate">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* direita: o que está na tabela, na ordem */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted2">
                Na tabela ({active.length + 1})
              </span>
              <button onClick={restore} className="flex items-center gap-1 text-[11px] text-muted2 hover:text-ink" title="Voltar ao padrão">
                <RotateCcw className="h-3 w-3" /> padrão
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
              {/* Campanha é âncora da tabela: não sai nem muda de lugar */}
              <div className="flex items-center gap-2 rounded-[8px] border border-border/60 bg-surface2/40 px-2 py-1.5 text-[12.5px] text-muted">
                <GripVertical className="h-3.5 w-3.5 opacity-0" />
                <span className="flex-1 truncate">Campanha</span>
                <span className="text-[10px] text-muted2">fixa</span>
              </div>

              {active.map((key) => (
                <div
                  key={key}
                  draggable
                  onDragStart={() => setDrag(key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(key)}
                  onDragEnd={() => setDrag(null)}
                  title="Arraste para reordenar"
                  className={`flex cursor-grab items-center gap-2 rounded-[8px] border border-border bg-surface2/60 px-2 py-1.5 text-[12.5px] transition-opacity active:cursor-grabbing ${
                    drag === key ? 'opacity-40' : ''
                  }`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted2" />
                  <span className="flex-1 truncate">{label[key] || key}</span>
                  <button
                    onClick={() => toggle(key)}
                    title="Tirar da tabela"
                    className="shrink-0 rounded-full p-1 text-muted2 transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {!active.length && (
                <p className="px-2 py-6 text-center text-[12px] text-muted2">
                  Nenhuma métrica na tabela — marque alguma na lista ao lado.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm px-6" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
