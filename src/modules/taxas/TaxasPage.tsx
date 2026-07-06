import { useEffect, useMemo, useState } from 'react'
import { Percent, Plus, Trash2, X, Pencil, RotateCcw, PackageOpen, Landmark, Layers } from 'lucide-react'
import { fetchOrders, brl } from '@/modules/pixel/orders'
import { getStoredAccounts } from '@/modules/monitor/config'
import {
  loadTaxas, syncTaxas, saveTaxas, uid, sumFees, breakevenInfo, discoverProducts,
  type TaxasConfig, type TaxItem, type ProductFees, type DiscoveredProduct, type TaxCat,
} from './taxas'

const CAT_LABEL: Record<TaxCat, string> = { taxa: 'Taxa', imposto: 'Imposto', custo: 'Custo' }
const CAT_CLS: Record<TaxCat, string> = {
  taxa: 'text-brand-2 border-brand/30 bg-brand/10',
  imposto: 'text-warn border-warn/30 bg-warn/10',
  custo: 'text-[#c084fc] border-[#c084fc]/30 bg-[#c084fc]/10',
}

const fmtItem = (it: TaxItem) => (it.kind === 'pct' ? `${it.value}%` : brl(it.value))
const cloneItems = (items: TaxItem[]): TaxItem[] => items.map((it) => ({ ...it, id: uid() }))

/* ── breakeven em destaque ── */
function BreakevenBadge({ price, items, muted }: { price: number; items: TaxItem[]; muted?: boolean }) {
  const be = breakevenInfo(price, items)
  if (!price) return <span className="text-[12px] text-muted2">defina o preço de venda p/ calcular o breakeven</span>
  if (be.be == null)
    return (
      <div className="rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-danger">Inviável</div>
        <div className="text-[11.5px] text-muted">as taxas consomem o preço inteiro (margem {brl(be.margem)})</div>
      </div>
    )
  return (
    <div className={`rounded-[10px] border px-3 py-2 ${muted ? 'border-border bg-surface2' : 'border-ok/30 bg-ok/10'}`}>
      <div className="flex items-baseline gap-2">
        <span className={`text-[19px] font-extrabold tabular-nums ${muted ? 'text-ink' : 'text-ok'}`}>ROAS {be.be.toFixed(2)}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">breakeven</span>
      </div>
      <div className="text-[11.5px] text-muted">
        acima disso é lucro · margem {brl(be.margem)}/venda ({be.margemPct.toFixed(0)}% do preço)
      </div>
    </div>
  )
}

/* ── editor de itens (linhas de taxa) ── */
function ItemsEditor({ items, onChange }: { items: TaxItem[]; onChange: (items: TaxItem[]) => void }) {
  const set = (id: string, patch: Partial<TaxItem>) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  const del = (id: string) => onChange(items.filter((it) => it.id !== id))
  const add = (cat: TaxCat, kind: 'pct' | 'fixo', label: string) =>
    onChange([...items, { id: uid(), label, kind, value: 0, cat }])
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-[12px] text-muted2">Nenhuma taxa — adicione abaixo.</p>}
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-2">
          <input
            value={it.label}
            onChange={(e) => set(it.id, { label: e.target.value })}
            placeholder="Nome (ex.: Gateway, Imposto FB…)"
            className="min-w-0 flex-1 rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink"
          />
          <select
            value={it.cat}
            onChange={(e) => set(it.id, { cat: e.target.value as TaxCat })}
            className="rounded-[8px] border border-border bg-[#0a0c19] px-2 py-1.5 text-[12px] text-ink"
          >
            <option value="taxa">Taxa</option>
            <option value="imposto">Imposto</option>
            <option value="custo">Custo</option>
          </select>
          <select
            value={it.kind}
            onChange={(e) => set(it.id, { kind: e.target.value as 'pct' | 'fixo' })}
            className="rounded-[8px] border border-border bg-[#0a0c19] px-2 py-1.5 text-[12px] text-ink"
          >
            <option value="pct">% do faturamento</option>
            <option value="fixo">R$ por venda</option>
          </select>
          <input
            type="number"
            step="0.01"
            value={it.value}
            onChange={(e) => set(it.id, { value: parseFloat(e.target.value) || 0 })}
            className="w-[86px] rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-right text-[12.5px] tabular-nums text-ink"
          />
          <button onClick={() => del(it.id)} className="rounded p-1 text-muted2 hover:text-danger" title="Remover">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="mt-1 flex flex-wrap gap-1.5">
        <button className="btn btn-ghost btn-sm" onClick={() => add('taxa', 'pct', 'Gateway/checkout')}><Plus className="h-3 w-3" /> Taxa %</button>
        <button className="btn btn-ghost btn-sm" onClick={() => add('imposto', 'pct', 'Imposto')}><Plus className="h-3 w-3" /> Imposto %</button>
        <button className="btn btn-ghost btn-sm" onClick={() => add('custo', 'fixo', 'Custo do produto')}><Plus className="h-3 w-3" /> Custo R$</button>
        <button className="btn btn-ghost btn-sm" onClick={() => add('taxa', 'fixo', 'Taxa fixa')}><Plus className="h-3 w-3" /> Taxa R$</button>
      </div>
    </div>
  )
}

/* ── modal de edição (produto / conta / padrão) ── */
type Editing =
  | { type: 'product'; prod: ProductFees }
  | { type: 'account'; accountId: string; label: string; items: TaxItem[] }
  | { type: 'global'; items: TaxItem[]; aprov: number }

function EditorModal({ editing, onSave, onRemove, onClose }: {
  editing: Editing
  onSave: (e: Editing) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const [st, setSt] = useState<Editing>(editing)
  const items = st.type === 'product' ? st.prod.items : st.items
  const setItems = (items: TaxItem[]) =>
    setSt((p) => (p.type === 'product' ? { ...p, prod: { ...p.prod, items } } : { ...p, items }))
  const title =
    st.type === 'product' ? `Taxas — ${st.prod.label}` : st.type === 'account' ? `Taxas — conta ${st.label}` : 'Taxas padrão'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-[620px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-[13px] font-bold">{title}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="card-body flex flex-col gap-4">
          {st.type === 'product' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label>Nome (exibição)</label>
                <input value={st.prod.label} onChange={(e) => setSt({ ...st, prod: { ...st.prod, label: e.target.value } })} />
              </div>
              <div className="field">
                <label>Preço de venda (R$) — base do breakeven</label>
                <input
                  type="number" step="0.01" value={st.prod.price || ''}
                  onChange={(e) => setSt({ ...st, prod: { ...st.prod, price: parseFloat(e.target.value) || 0 } })}
                />
              </div>
            </div>
          )}
          {st.type === 'global' && (
            <div className="field max-w-[240px]">
              <label>Aprovação estimada (%) — só p/ estimativas do Monitor</label>
              <input type="number" step="1" value={st.aprov} onChange={(e) => setSt({ ...st, aprov: parseFloat(e.target.value) || 0 })} />
            </div>
          )}

          <ItemsEditor items={items} onChange={setItems} />

          {st.type === 'product' && <BreakevenBadge price={st.prod.price} items={st.prod.items} />}

          <div className="flex items-center gap-2">
            {onRemove && (
              <button className="btn btn-ghost btn-sm mr-auto text-danger" onClick={onRemove}>
                <RotateCcw className="h-3 w-3" /> Voltar ao padrão
              </button>
            )}
            <button className="btn btn-ghost btn-sm ml-auto" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={() => onSave(st)}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── chips resumo dos itens ── */
function ItemChips({ items }: { items: TaxItem[] }) {
  if (!items.length) return <span className="text-[11.5px] text-muted2">sem taxas</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span key={it.id} className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${CAT_CLS[it.cat]}`}>
          {it.label} {fmtItem(it)}
        </span>
      ))}
    </div>
  )
}

/* ── página ── */
export default function TaxasPage() {
  const [cfg, setCfg] = useState<TaxasConfig>(loadTaxas)
  const [disc, setDisc] = useState<DiscoveredProduct[]>([])
  const [loadingDisc, setLoadingDisc] = useState(true)
  const [editing, setEditing] = useState<Editing | null>(null)
  const accounts = useMemo(() => getStoredAccounts(), [])

  useEffect(() => {
    syncTaxas().then(setCfg)
    const since = new Date(Date.now() - 90 * 864e5).toISOString()
    fetchOrders(since)
      .then((orders) => setDisc(discoverProducts(orders)))
      .finally(() => setLoadingDisc(false))
  }, [])

  const save = (c: TaxasConfig) => { setCfg(c); saveTaxas(c) }

  /** produto descoberto ↔ config existente */
  const configFor = (d: DiscoveredProduct): ProductFees | undefined =>
    cfg.products[d.key] ||
    Object.values(cfg.products).find((p) => (d.id && (p.key === d.id || p.ids.includes(d.id))) || p.names.includes(d.name))

  // configurados que não apareceram nos últimos 90d (não perder de vista)
  const discKeys = new Set(disc.map((d) => configFor(d)?.key ?? d.key))
  const orphans = Object.values(cfg.products).filter((p) => !discKeys.has(p.key))

  const openProduct = (d: DiscoveredProduct) => {
    const existing = configFor(d)
    const prod: ProductFees = existing
      ? { ...existing, items: existing.items.map((i) => ({ ...i })) }
      : {
          key: d.key,
          ids: d.id ? [d.id] : [],
          names: [d.name],
          label: d.name,
          price: Math.round(d.avgPrice * 100) / 100,
          items: cloneItems(cfg.global),
        }
    setEditing({ type: 'product', prod })
  }

  const onSaveEditor = (e: Editing) => {
    if (e.type === 'product') {
      save({ ...cfg, products: { ...cfg.products, [e.prod.key]: e.prod } })
    } else if (e.type === 'account') {
      save({ ...cfg, accounts: { ...cfg.accounts, [e.accountId]: { accountId: e.accountId, label: e.label, items: e.items } } })
    } else {
      save({ ...cfg, global: e.items, aprovEstimada: e.aprov })
    }
    setEditing(null)
  }

  const onRemoveEditor = () => {
    if (!editing) return
    if (editing.type === 'product') {
      const products = { ...cfg.products }
      delete products[editing.prod.key]
      save({ ...cfg, products })
    } else if (editing.type === 'account') {
      const accounts2 = { ...cfg.accounts }
      delete accounts2[editing.accountId]
      save({ ...cfg, accounts: accounts2 })
    }
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Taxas &amp; Custos</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Tudo num lugar só: taxas, impostos e custos <b>por produto</b> (identificado pelo ID que a Kirvano manda no webhook),
          por conta de anúncio e o padrão. O Dashboard e o Monitor calculam lucro com o que está aqui.
        </p>
      </div>

      {/* ── PRODUTOS ── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-brand-2" />
          <h3 className="text-[14px] font-bold">Produtos &amp; ofertas (Kirvano · últimos 90 dias)</h3>
          {loadingDisc && <span className="text-[11px] text-muted2">carregando pedidos…</span>}
        </div>
        {!loadingDisc && disc.length === 0 && orphans.length === 0 && (
          <div className="rounded-xl2 border border-dashed border-border bg-surface/50 px-6 py-8 text-center text-[13px] text-muted">
            Nenhum pedido no gateway nos últimos 90 dias — os produtos aparecem aqui sozinhos quando venderem.
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {disc.map((d) => {
            const pc = configFor(d)
            const items = pc?.items ?? cfg.global
            const price = pc?.price || d.avgPrice
            return (
              <div key={d.key} className={`card ${pc ? '' : 'border-dashed'}`}>
                <div className="card-body flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-bold" title={pc?.label || d.name}>{pc?.label || d.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted2">
                        {d.id ? <span className="rounded bg-surface2 px-1.5 py-0.5 font-mono">id {d.id.slice(0, 8)}…</span> : <span>sem id (casa por nome)</span>}
                        {d.isBump && <span className="rounded-full border border-border px-1.5 py-0.5">order bump</span>}
                        <span>{d.sales} venda{d.sales !== 1 ? 's' : ''} 90d</span>
                        {d.avgPrice > 0 && <span>ticket {brl(d.avgPrice)}</span>}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm shrink-0" onClick={() => openProduct(d)}>
                      <Pencil className="h-3 w-3" /> {pc ? 'Editar' : 'Configurar'}
                    </button>
                  </div>
                  <ItemChips items={items} />
                  {!pc && <div className="text-[10.5px] text-muted2">usando taxas padrão</div>}
                  <BreakevenBadge price={price} items={items} muted={!pc} />
                </div>
              </div>
            )
          })}
          {orphans.map((p) => (
            <div key={p.key} className="card opacity-80">
              <div className="card-body flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-bold">{p.label}</div>
                    <div className="mt-0.5 text-[10.5px] text-muted2">configurado · sem vendas nos últimos 90d</div>
                  </div>
                  <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setEditing({ type: 'product', prod: { ...p, items: p.items.map((i) => ({ ...i })) } })}>
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                </div>
                <ItemChips items={p.items} />
                <BreakevenBadge price={p.price} items={p.items} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CONTAS DE ANÚNCIO ── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-brand-2" />
          <h3 className="text-[14px] font-bold">Por conta de anúncio</h3>
          <span className="text-[11px] text-muted2">usado nas estimativas do Monitor (campanha não tem pedido pra casar produto)</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => {
            const ac = cfg.accounts[a.id]
            return (
              <div key={a.id} className={`card ${ac ? '' : 'border-dashed'}`}>
                <div className="card-body flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-bold">{a.name}</div>
                      <div className="mt-0.5 text-[10.5px] text-muted2">act_{a.id} · {a.cur || 'USD'}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm shrink-0"
                      onClick={() =>
                        setEditing({
                          type: 'account',
                          accountId: a.id,
                          label: a.name,
                          items: ac ? ac.items.map((i) => ({ ...i })) : cloneItems(cfg.global),
                        })
                      }
                    >
                      <Pencil className="h-3 w-3" /> {ac ? 'Editar' : 'Configurar'}
                    </button>
                  </div>
                  {ac ? <ItemChips items={ac.items} /> : <div className="text-[11.5px] text-muted2">usando taxas padrão</div>}
                </div>
              </div>
            )
          })}
          {accounts.length === 0 && (
            <div className="rounded-xl2 border border-dashed border-border bg-surface/50 px-6 py-6 text-[12.5px] text-muted md:col-span-2 xl:col-span-3">
              Nenhuma conta configurada no Monitor ainda.
            </div>
          )}
        </div>
      </section>

      {/* ── PADRÃO ── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-2" />
          <h3 className="text-[14px] font-bold">Padrão (fallback)</h3>
          <span className="text-[11px] text-muted2">vale pra qualquer produto/conta sem config própria</span>
        </div>
        <div className="card max-w-[680px]">
          <div className="card-body flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <ItemChips items={cfg.global} />
              <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setEditing({ type: 'global', items: cfg.global.map((i) => ({ ...i })), aprov: cfg.aprovEstimada })}>
                <Pencil className="h-3 w-3" /> Editar
              </button>
            </div>
            <div className="text-[11.5px] text-muted2">
              Total: {sumFees(cfg.global).pct.toFixed(1)}% + {brl(sumFees(cfg.global).fixo)}/venda · aprovação estimada {cfg.aprovEstimada}%
            </div>
          </div>
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-muted2">
        <Percent className="h-3 w-3" /> Breakeven ROAS = preço ÷ (o que sobra por venda após taxas). Ex.: sobra 76% do preço → breakeven 1,32.
      </p>

      {editing && (
        <EditorModal
          editing={editing}
          onSave={onSaveEditor}
          onClose={() => setEditing(null)}
          onRemove={editing.type !== 'global' ? onRemoveEditor : undefined}
        />
      )}
    </div>
  )
}
