import { useMemo, useState } from 'react'
import { FlaskConical, Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { usePersistentState } from '@/lib/appState'
import { brl } from '@/modules/pixel/orders'

/* ── Histórico de ofertas testadas ──────────────────────────────────────────
 * O que motivou: decisão de matar ou manter oferta some da memória em semanas.
 * Depois ninguém lembra se o produto foi ruim, se o criativo não entrou, ou se
 * simplesmente nunca foi medido direito — e o teste acaba repetido do zero.
 * Aqui fica o registro: número medido + veredito + POR QUE.
 *
 * Não puxa dado sozinho de propósito. É um caderno de decisões: o número entra
 * quando você fecha a análise, e fica congelado com o período a que se refere.
 * Dado que se atualiza sozinho conta outra história a cada semana e apaga o
 * motivo da decisão que foi tomada lá atrás. */

type Status = 'lucro' | 'prejuizo' | 'pendente' | 'morto'

interface Oferta {
  id: string
  nome: string
  status: Status
  periodo: string
  vendas: number
  faturamento: number
  gasto: number // 0 = ainda não medido
  veredito: string
  motivo: string
}

const STATUS: Record<Status, { label: string; cls: string; dot: string }> = {
  lucro:    { label: 'Deu lucro',  cls: 'text-ok border-ok/30 bg-ok/10',            dot: 'bg-ok' },
  prejuizo: { label: 'Prejuízo',   cls: 'text-danger border-danger/40 bg-danger/10', dot: 'bg-danger' },
  pendente: { label: 'Pendente',   cls: 'text-warn border-warn/30 bg-warn/10',      dot: 'bg-warn' },
  morto:    { label: 'Descontinuada', cls: 'text-muted2 border-border bg-surface2',  dot: 'bg-muted2' },
}

const uid = () => Math.random().toString(36).slice(2, 10)

/* Medições de 29/07/2026 sobre o Supabase de vendas (16/06–29/07).
 * O gasto só entra onde dá pra isolar: a TRY roda um produto só, então o gasto
 * dela É o do Método. Nas outras contas os produtos se misturam, então fica 0
 * até alguém medir — melhor vazio do que um ROAS inventado. */
const SEED: { itens: Oferta[] } = {
  itens: [
    {
      id: 'stl', nome: 'ULTRA PACK STL PROFISSIONAL 100K', status: 'lucro',
      periodo: '16/06–29/07/2026', vendas: 1777, faturamento: 117868.30, gasto: 0,
      veredito: 'Manter. É o carro-chefe.',
      motivo: 'Ticket R$ 66,33, o mais alto da operação. Order bump responde por ~30% do faturamento. Preço voltou a 64,90 em 29/07 (regime que teve o melhor ROAS medido: 1,76).',
    },
    {
      id: 'canecas', nome: 'ARSENAL DA SUBLIMAÇÃO 200K (canecas)', status: 'pendente',
      periodo: '16/06–29/07/2026', vendas: 504, faturamento: 20012.10, gasto: 0,
      veredito: 'Analisar antes de decidir.',
      motivo: 'Ticket R$ 39,71 — acima do Método, abaixo do STL. Roda em conta separada das de STL. Falta isolar o gasto pra saber se paga. É a decisão em aberto.',
    },
    {
      id: 'melodify', nome: 'Melodify (música personalizada por IA)', status: 'prejuizo',
      periodo: '16/06–29/07/2026', vendas: 99, faturamento: 6036.10, gasto: 0,
      veredito: 'Não encaixou. Parar até ter criativo novo.',
      motivo: 'Ticket bom (R$ 60,97), mas o problema foi criativo: de tudo que subiu, só 1 acertou. Sem volume de criativo que entra, não escala. Produto não foi invalidado — a comunicação foi.',
    },
    {
      id: 'pedreiro', nome: 'Método Mãos à Obra (pedreiro)', status: 'prejuizo',
      periodo: '16/06–29/07/2026', vendas: 96, faturamento: 2515.10, gasto: 3235.98,
      veredito: 'Ruim. Desligar ou reprecificar.',
      motivo: 'Prejuízo estrutural, não de campanha: cada venda custa R$ 37,20 e traz R$ 28,91 — perde R$ 8,29 por venda antes das taxas. Mais da metade dos pedidos sai abaixo de R$ 20. O tráfego até é barato (CPA menor que o da CHILE); o produto é que não paga.',
    },
  ],
}

function Badge({ s }: { s: Status }) {
  const st = STATUS[s]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${st.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  )
}

function Editor({ item, onSave, onCancel }: { item: Oferta; onSave: (o: Oferta) => void; onCancel: () => void }) {
  const [f, setF] = useState<Oferta>({ ...item })
  const set = <K extends keyof Oferta>(k: K, v: Oferta[K]) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div className="rounded-[10px] border border-brand/40 bg-surface2 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Oferta</span>
          <input className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink" value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome do produto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Situação</span>
          <select className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink" value={f.status} onChange={(e) => set('status', e.target.value as Status)}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Período medido</span>
          <input className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink" value={f.periodo} onChange={(e) => set('periodo', e.target.value)} placeholder="16/06–29/07/2026" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Vendas</span>
          <input className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink" type="number" value={f.vendas} onChange={(e) => set('vendas', Number(e.target.value) || 0)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Faturamento (R$)</span>
          <input className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink" type="number" step="0.01" value={f.faturamento} onChange={(e) => set('faturamento', Number(e.target.value) || 0)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Gasto em ads (R$) — 0 se não medido</span>
          <input className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink" type="number" step="0.01" value={f.gasto} onChange={(e) => set('gasto', Number(e.target.value) || 0)} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Veredito (a decisão)</span>
          <input className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink" value={f.veredito} onChange={(e) => set('veredito', e.target.value)} placeholder="Manter / Matar / Reprecificar..." />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Por quê (o motivo é o que vale daqui a 3 meses)</span>
          <textarea className="w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink min-h-[70px] leading-relaxed" value={f.motivo} onChange={(e) => set('motivo', e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary" onClick={() => onSave(f)}><Check size={14} /> Salvar</button>
        <button className="btn" onClick={onCancel}><X size={14} /> Cancelar</button>
      </div>
    </div>
  )
}

export default function OfertasPage() {
  const [store, save] = usePersistentState<{ itens: Oferta[] }>('meta_ofertas_historico', JSON.parse(JSON.stringify(SEED)))
  const [editando, setEditando] = useState<string | null>(null)

  const itens = store.itens || []
  const resumo = useMemo(() => {
    const c = { lucro: 0, prejuizo: 0, pendente: 0, morto: 0 } as Record<Status, number>
    itens.forEach((i) => { c[i.status] = (c[i.status] || 0) + 1 })
    return c
  }, [itens])

  const upsert = (o: Oferta) => {
    const arr = itens.some((i) => i.id === o.id) ? itens.map((i) => (i.id === o.id ? o : i)) : [...itens, o]
    save({ itens: arr }); setEditando(null)
  }
  const remover = (id: string) => {
    if (!confirm('Remover esta oferta do histórico?')) return
    save({ itens: itens.filter((i) => i.id !== id) })
  }
  const novo = () => {
    const o: Oferta = { id: uid(), nome: '', status: 'pendente', periodo: '', vendas: 0, faturamento: 0, gasto: 0, veredito: '', motivo: '' }
    save({ itens: [...itens, o] }); setEditando(o.id)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical size={18} className="text-brand-2" />
          <h1 className="text-[17px] font-bold">Ofertas testadas</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 font-bold text-ok">{resumo.lucro} deram lucro</span>
          <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 font-bold text-danger">{resumo.prejuizo} no prejuízo</span>
          <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 font-bold text-warn">{resumo.pendente} pendente{resumo.pendente === 1 ? '' : 's'}</span>
        </div>
        <button className="btn btn-primary ml-auto" onClick={novo}><Plus size={14} /> Nova oferta</button>
      </div>

      <p className="text-[12px] text-muted">
        Caderno de decisões, não relatório. Os números ficam congelados no período em que foram medidos — o que
        importa daqui a três meses é o <b className="text-ink">motivo</b>, não o número de hoje.
      </p>

      {itens.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-10 text-center text-[12.5px] text-muted2">
          Nenhuma oferta registrada.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {itens.map((o) =>
            editando === o.id ? (
              <Editor key={o.id} item={o} onSave={upsert} onCancel={() => setEditando(null)} />
            ) : (
              <div key={o.id} className="rounded-[10px] border border-border bg-surface2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge s={o.status} />
                  <span className="text-[13.5px] font-bold text-ink">{o.nome || '(sem nome)'}</span>
                  {o.periodo && <span className="text-[11px] text-muted2">{o.periodo}</span>}
                  <div className="ml-auto flex gap-1">
                    <button className="btn btn-sm" onClick={() => setEditando(o.id)}><Pencil size={13} /></button>
                    <button className="btn btn-sm" onClick={() => remover(o.id)}><Trash2 size={13} /></button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
                  <span className="text-muted">vendas <b className="text-ink tabular-nums">{o.vendas.toLocaleString('pt-BR')}</b></span>
                  <span className="text-muted">faturamento <b className="text-ink tabular-nums">{brl(o.faturamento)}</b></span>
                  {o.vendas > 0 && (
                    <span className="text-muted">ticket <b className="text-ink tabular-nums">{brl(o.faturamento / o.vendas)}</b></span>
                  )}
                  {o.gasto > 0 ? (
                    <>
                      <span className="text-muted">gasto <b className="text-ink tabular-nums">{brl(o.gasto)}</b></span>
                      <span className="text-muted">
                        ROAS{' '}
                        <b className={`tabular-nums ${o.faturamento / o.gasto >= 1.23 ? 'text-ok' : 'text-danger'}`}>
                          {(o.faturamento / o.gasto).toFixed(2)}
                        </b>
                      </span>
                      {o.vendas > 0 && (
                        <span className="text-muted">
                          margem/venda{' '}
                          <b className={`tabular-nums ${o.faturamento / o.vendas - o.gasto / o.vendas >= 0 ? 'text-ok' : 'text-danger'}`}>
                            {brl(o.faturamento / o.vendas - o.gasto / o.vendas)}
                          </b>
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted2">gasto não medido — sem ROAS</span>
                  )}
                </div>

                {o.veredito && <div className="mt-2 text-[12.5px] font-semibold text-ink">{o.veredito}</div>}
                {o.motivo && <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{o.motivo}</div>}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
