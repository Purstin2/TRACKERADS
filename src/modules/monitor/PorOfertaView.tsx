import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, Plus, Pencil, X, Search } from 'lucide-react'
import { fetchOffer, getRevenue, getSales, campUrl } from '@/lib/meta'
import { useMonitor } from './MonitorContext'
import { STATUS_FILTERS, DATE_OPTIONS, curSym, accName, trunc } from './config'
import { toast } from '@/components/ui/toast'
import { usePersistentState } from '@/lib/appState'

interface CampMetric {
  key: string
  accId: string
  campId: string
  accName: string
  name: string
  spend: number
  rev: number
  sales: number
}
interface OfferDef {
  id: string
  name: string
  members: string[] // `${accId}::${campId}`
}

const DEFS_KEY = 'meta_oferta_defs'
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

export default function PorOfertaView() {
  const m = useMonitor()
  /* Antes isto vivia só no localStorage: agrupar 232 campanhas numa máquina e
   * abrir noutra devolvia a tela vazia. Agora vai pro Supabase como o resto do
   * app. A chave é a MESMA, e o usePersistentState lê o cache local primeiro —
   * então o agrupamento que já existe na máquina sobe pro banco sozinho na
   * primeira abertura, sem ninguém precisar refazer. */
  const [defs, setDefs] = usePersistentState<OfferDef[]>(DEFS_KEY, [])
  const [period, setPeriod] = useState('last_7d')
  const [customSince, setCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [loading, setLoading] = useState(false)
  const [campData, setCampData] = useState<Record<string, CampMetric>>({})
  const [cur, setCur] = useState('$')
  const [mixed, setMixed] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<{ id?: string; name: string; members: Set<string> } | null>(null)
  const [sortBy, setSortBy] = useState<'spend' | 'roas'>('spend')

  // setDefs já grava no cache local E no Supabase (usePersistentState)
  const save = (d: OfferDef[]) => setDefs(d)

  async function load() {
    if (!m.token.trim()) return alert('Cole o token.')
    const accs = m.accounts.filter((a) => m.selected.has(a.id))
    if (!accs.length) return
    if (period === 'custom' && (!customSince || !customUntil)) return alert('Escolha as duas datas (de / até).')
    const actualPeriod = period === 'custom' ? `custom:${customSince}:${customUntil}` : period
    setLoading(true)
    const statuses = STATUS_FILTERS[m.status]?.values || ['ACTIVE']
    const curs = [...new Set(accs.map((a) => a.cur))]
    const mx = curs.length > 1
    const c = mx ? '$' : curSym(curs[0] || 'USD')
    const data: Record<string, CampMetric> = {}
    for (const acc of accs) {
      const fx = mx ? (acc.cur === 'BRL' ? 1 / m.settings.fx : 1) : 1
      try {
        const rows = await fetchOffer(acc.id, actualPeriod, m.token.trim(), statuses)
        rows.forEach((r) => {
          const key = `${acc.id}::${r.campaign_id}`
          data[key] = {
            key,
            accId: acc.id,
            campId: r.campaign_id!,
            accName: acc.name,
            name: r.campaign_name || '(sem nome)',
            spend: parseFloat(r.spend || '0') * fx,
            rev: getRevenue(r) * fx,
            sales: getSales(r),
          }
        })
      } catch (e: any) {
        toast(`${acc.name}: ${e.message}`, 'err')
      }
    }
    setCampData(data)
    setCur(c)
    setMixed(mx)
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allCamps = useMemo(() => Object.values(campData), [campData])
  const s = m.settings
  const roasCls = (r: number) => (r >= s.roasGood ? 'text-ok' : r < s.roasBe ? 'text-danger' : 'text-warn')

  // agrega cada oferta definida a partir dos membros presentes nos dados carregados
  const offers = useMemo(() => {
    return defs
      .map((def) => {
        const members = def.members.map((k) => campData[k]).filter(Boolean) as CampMetric[]
        const spend = members.reduce((a, c) => a + c.spend, 0)
        const rev = members.reduce((a, c) => a + c.rev, 0)
        const sales = members.reduce((a, c) => a + c.sales, 0)
        return { def, members, spend, rev, sales, roas: spend > 0 ? rev / spend : 0, missing: def.members.length - members.length }
      })
      .sort((a, b) => (sortBy === 'roas' ? b.roas - a.roas : b.spend - a.spend))
  }, [defs, campData, sortBy])

  const toggle = (id: string) =>
    setOpen((set) => {
      const n = new Set(set)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  function openEditor(def?: OfferDef) {
    if (!allCamps.length) return toast('Clique em Analisar primeiro para carregar as campanhas', 'warn')
    setEditor(def ? { id: def.id, name: def.name, members: new Set(def.members) } : { name: '', members: new Set() })
  }
  function saveEditor() {
    if (!editor || !editor.name.trim()) return toast('Dê um nome à oferta', 'err')
    if (!editor.members.size) return toast('Selecione ao menos 1 campanha', 'err')
    const entry: OfferDef = { id: editor.id || newId(), name: editor.name.trim(), members: [...editor.members] }
    save(editor.id ? defs.map((d) => (d.id === entry.id ? entry : d)) : [...defs, entry])
    setEditor(null)
    toast('Oferta salva', 'ok')
  }

  const tS = offers.reduce((a, o) => a + o.spend, 0)
  const tR = offers.reduce((a, o) => a + o.rev, 0)
  const tV = offers.reduce((a, o) => a + o.sales, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Período</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          {DATE_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
          <option value="custom">Personalizado</option>
        </select>
        {period === 'custom' && (
          <>
            <input type="date" value={customSince} onChange={(e) => setCustomSince(e.target.value)} style={{ colorScheme: 'dark' }} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink" />
            <span className="text-[11px] text-muted2">até</span>
            <input type="date" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} style={{ colorScheme: 'dark' }} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink" />
          </>
        )}
        <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-muted2">Ordenar</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          <option value="spend">Maior gasto</option>
          <option value="roas">Melhor ROAS</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => openEditor()}>
          <Plus className="h-3.5 w-3.5" /> Nova oferta
        </button>
        <button className="btn btn-primary btn-sm ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Carregando...' : 'Analisar'}
        </button>
      </div>

      <div className="rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.06] px-3.5 py-2 text-[11.5px] text-muted">
        ⓘ Defina cada oferta escolhendo as campanhas que fazem parte dela. Os dados são somados só dessas campanhas — e você pode
        adicionar campanhas novas à oferta depois.{mixed && ` Moedas diferentes → USD (câmbio R$ ${s.fx.toFixed(2)}).`}
      </div>

      {defs.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-12 text-center">
          <p className="text-[13px] font-semibold">Nenhuma oferta definida ainda.</p>
          <p className="mt-1 text-[12px] text-muted">Crie uma oferta e selecione as campanhas que pertencem a ela.</p>
          <button className="btn btn-primary btn-sm mx-auto mt-4" onClick={() => openEditor()}>
            <Plus className="h-3.5 w-3.5" /> Criar primeira oferta
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Ofertas', String(offers.length)],
              ['Gasto', `${cur}${tS.toFixed(0)}`],
              ['Faturamento', `${cur}${tR.toFixed(0)}`],
              ['Vendas', String(tV)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl2 border border-border bg-surface p-3 text-center">
                <div className="text-[18px] font-extrabold">{v}</div>
                <div className="text-[11px] text-muted2">{l}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {offers.map((o) => {
              const isOpen = open.has(o.def.id)
              return (
                <div key={o.def.id} className="overflow-hidden rounded-xl2 border border-border bg-surface">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button onClick={() => toggle(o.def.id)} className="text-muted2">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <span className="font-bold">{o.def.name}</span>
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted2">{o.members.length} camp.</span>
                    {o.missing > 0 && <span className="text-[10px] text-warn">{o.missing} sem dados no período</span>}
                    <span className="ml-auto flex items-center gap-3 text-[12px]">
                      <span className="text-muted">{cur}{o.spend.toFixed(0)}</span>
                      <span>
                        ROAS <b className={roasCls(o.roas)}>{o.roas.toFixed(2)}</b>
                      </span>
                      <span>
                        <b>{o.sales}</b>v
                      </span>
                      <button onClick={() => openEditor(o.def)} className="text-muted2 hover:text-brand-2" title="Editar oferta">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remover a oferta "${o.def.name}"? (não apaga campanhas, só a definição)`)) save(defs.filter((d) => d.id !== o.def.id))
                        }}
                        className="text-muted2 hover:text-danger"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border bg-bg/40 px-4 py-2">
                      {o.members
                        .sort((a, b) => b.spend - a.spend)
                        .map((c) => {
                          const roas = c.spend > 0 ? c.rev / c.spend : 0
                          return (
                            <div key={c.key} className="flex items-center gap-2 border-b border-border/40 py-1.5 text-[12px] last:border-0">
                              <span className="rounded bg-surface2 px-1.5 py-0.5 text-[9px] text-muted2">{c.accName}</span>
                              <span className="flex-1 truncate" title={c.name}>
                                {trunc(c.name, 46)}
                              </span>
                              <span className={`whitespace-nowrap text-[11px] ${roasCls(roas)}`}>
                                {cur}{c.spend.toFixed(2)} · ROAS {roas.toFixed(2)} · {c.sales}v
                              </span>
                              <a href={campUrl(c.accId, c.campId)} target="_blank" className="text-muted2 hover:text-brand-2">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {editor && (
        <OfferEditor
          editor={editor}
          allCamps={allCamps}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}
    </div>
  )
}

function OfferEditor({
  editor,
  allCamps,
  onChange,
  onClose,
  onSave,
}: {
  editor: { id?: string; name: string; members: Set<string> }
  allCamps: CampMetric[]
  onChange: (e: { id?: string; name: string; members: Set<string> }) => void
  onClose: () => void
  onSave: () => void
}) {
  const [q, setQ] = useState('')
  // âncora do último clique, por conta — base do Shift+clique (seleção em faixa).
  // Guardado por conta pra que uma faixa nunca atravesse o cabeçalho de outra.
  const ancora = useRef<Record<string, number>>({})
  const byAcc: Record<string, CampMetric[]> = {}
  allCamps.forEach((c) => (byAcc[c.accName] = byAcc[c.accName] || []).push(c))
  const ql = q.trim().toLowerCase()

  const aplicar = (chaves: string[], ligar: boolean) => {
    const n = new Set(editor.members)
    chaves.forEach((k) => (ligar ? n.add(k) : n.delete(k)))
    onChange({ ...editor, members: n })
  }
  const toggleMember = (key: string) => aplicar([key], !editor.members.has(key))

  /* Clique normal: liga/desliga uma.
   * Shift+clique: aplica da âncora até aqui, repetindo o estado de destino
   *   desta linha — igual a lista de arquivos do sistema. Sem isto, marcar 60
   *   campanhas de uma oferta é 60 cliques. */
  const clicar = (acc: string, vis: CampMetric[], idx: number, e: React.MouseEvent) => {
    const alvo = vis[idx]
    const ligar = !editor.members.has(alvo.key)
    const a = ancora.current[acc]
    if (e.shiftKey && a != null && a !== idx) {
      const [ini, fim] = a < idx ? [a, idx] : [idx, a]
      aplicar(vis.slice(ini, fim + 1).map((c) => c.key), ligar)
    } else {
      aplicar([alvo.key], ligar)
    }
    ancora.current[acc] = idx
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card flex max-h-[90vh] w-full max-w-[560px] flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-[13px] font-bold">{editor.id ? 'Editar oferta' : 'Nova oferta'}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div className="field">
            <label>Nome da oferta</label>
            <input value={editor.name} onChange={(e) => onChange({ ...editor, name: e.target.value })} placeholder="ex: STL Mascotes BR" autoFocus />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campanha..." className="w-full rounded-[7px] border border-border bg-[#0a0c19] py-1.5 pl-8 pr-3 text-[12px] text-ink" />
            </div>
            <span className="text-[11px] text-muted2">{editor.members.size} selecionadas</span>
          </div>
          <div className="-mt-1 text-[10.5px] text-muted2">
            Clique marca uma · <b className="text-muted">Shift+clique</b> marca da última até esta ·{' '}
            <b className="text-muted">marcar todas</b> no cabeçalho da conta
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-[9px] border border-border p-1.5">
            {Object.entries(byAcc).map(([acc, camps]) => {
              const vis = camps.filter((c) => !ql || c.name.toLowerCase().includes(ql))
              if (!vis.length) return null
              // "todas" olha só o que está VISÍVEL: com busca ativa, marcar todas
              // deve marcar o resultado da busca, não a conta inteira escondida.
              const marcadas = vis.filter((c) => editor.members.has(c.key)).length
              const todas = marcadas === vis.length
              return (
                <div key={acc}>
                  <div className="sticky top-0 z-[1] flex items-center gap-2 bg-surface px-2 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">{acc}</span>
                    <span className="text-[10px] text-muted2">
                      {marcadas}/{vis.length}
                    </span>
                    <button
                      onClick={() => aplicar(vis.map((c) => c.key), !todas)}
                      className="ml-auto rounded-[5px] border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted2 hover:border-brand hover:text-brand-2"
                      title={todas ? 'Desmarcar todas desta conta' : 'Marcar todas desta conta'}
                    >
                      {todas ? 'limpar' : ql ? 'marcar filtradas' : 'marcar todas'}
                    </button>
                  </div>
                  {vis.map((c, i) => {
                    const on = editor.members.has(c.key)
                    return (
                      <button
                        key={c.key}
                        onClick={(e) => clicar(acc, vis, i, e)}
                        className={`flex w-full select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] ${on ? 'bg-brand/10' : 'hover:bg-surface2'}`}
                      >
                        <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[9px] ${on ? 'border-brand bg-brand text-white' : 'border-border'}`}>{on ? '✓' : ''}</span>
                        <span className="flex-1 truncate" title={c.name}>
                          {c.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {!allCamps.length && <div className="p-3 text-[12px] text-muted2">Nenhuma campanha carregada.</div>}
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary btn-sm" onClick={onSave}>
              Salvar oferta
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
