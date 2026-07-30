import { Fragment, useEffect, useMemo, useState } from 'react'
import { FlaskConical, RefreshCw, Pencil, X, Check, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePersistentState } from '@/lib/appState'
import { fetchOrders, brl, type KirvanoOrder } from '@/modules/pixel/orders'
import { readSnapshot } from '@/lib/adsDaily'


/* ── Ofertas testadas ────────────────────────────────────────────────────────
 * Números reais. A ATRIBUIÇÃO vem dos grupos que você monta em Monitor › Por
 * Oferta (cada oferta = uma lista de campanhas). Foi a única forma confiável:
 *
 *  · atribuir pela campanha QUE VENDEU inflava tudo — campanha que só queimou
 *    ficava de fora, então as perdedoras sumiam do cálculo (47% do gasto órfão,
 *    e o Melodify aparecia com ROAS 5,09 sendo que não encaixou);
 *  · atribuir pelo NOME da campanha não funciona — os nomes codificam criativo,
 *    lote e data, não produto (90% ficava sem classificar).
 *
 * Com o grupo explícito, gasto e venda saem das MESMAS campanhas — o ROAS fecha.
 * O que não está em grupo nenhum aparece no rodapé, nunca escondido. */

const BREAKEVEN = 1.23

interface Nota { veredito: string; motivo: string; status?: 'lucro' | 'prejuizo' | 'pendente' | 'morto' }

interface Linha {
  id: string
  nome: string
  vendas: number
  faturamento: number
  gasto: number
  campanhas: number
  primeira: string
  ultima: string
}

const campIdOf = (o: KirvanoOrder): string | null => {
  const m = /\|(\d+)/.exec(String((o as any).utm_campaign || ''))
  return m ? m[1] : null
}
const dia = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : '')
const fmtDia = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—')

function situacao(l: Linha, nota?: Nota) {
  if (nota?.status) return nota.status
  if (!l.gasto) return 'pendente' as const
  return l.faturamento / l.gasto >= BREAKEVEN ? ('lucro' as const) : ('prejuizo' as const)
}
const SIT: Record<string, { label: string; dot: string; txt: string }> = {
  lucro: { label: 'Lucro', dot: 'bg-ok', txt: 'text-ok' },
  prejuizo: { label: 'Prejuízo', dot: 'bg-danger', txt: 'text-danger' },
  pendente: { label: 'Sem gasto', dot: 'bg-warn', txt: 'text-warn' },
  morto: { label: 'Encerrada', dot: 'bg-muted2', txt: 'text-muted2' },
}
const INP = 'w-full rounded-[8px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12.5px] text-ink'

interface OfferDef { id: string; name: string; members: string[] }

export default function OfertasPage() {
  /* Os grupos vêm da MESMA chave que o Monitor grava, agora no Supabase — então
   * agrupar numa máquina e consultar noutra funciona. */
  const [defs] = usePersistentState<OfferDef[]>('meta_oferta_defs', [])
  /* Nota indexada pelo NOME da oferta, não pelo id: id é gerado na máquina e
   * muda se a oferta for recriada; o nome é o que você reconhece e digita. */
  const [notas, saveNotas] = usePersistentState<Record<string, Nota>>('meta_ofertas_notas', {})
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [fora, setFora] = useState({ gasto: 0, vendas: 0, faturamento: 0, semUtm: 0 })
  const [semGrupos, setSemGrupos] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)

  async function carregar() {
    setLoading(true); setErro('')
    try {
      setSemGrupos(!defs.length)

      const orders = await fetchOrders()
      if (!orders.length) { setLinhas([]); setErro('Nenhum pedido encontrado — confira a conexão com a Supabase.'); return }
      const dias = orders.map((o) => dia(o.created_at)).filter(Boolean).sort()
      const snap = await readSnapshot(dias[0], dias[dias.length - 1])

      const gastoCamp: Record<string, number> = {}
      snap.forEach((r) => { gastoCamp[r.camp_id] = (gastoCamp[r.camp_id] || 0) + (Number(r.spend_brl) || 0) })

      // campanha → oferta (members vêm como `accId::campId`)
      const campOferta: Record<string, string> = {}
      defs.forEach((d) => (d.members || []).forEach((m) => {
        const campId = String(m).split('::')[1]
        if (campId) campOferta[campId] = d.id
      }))

      const base: Record<string, Linha> = {}
      defs.forEach((d) => { base[d.id] = { id: d.id, nome: d.name, vendas: 0, faturamento: 0, gasto: 0, campanhas: 0, primeira: '', ultima: '' } })

      // gasto: some TODA campanha do grupo, tenha vendido ou não. É isso que
      // impede o ROAS otimista — a campanha que só queimou continua contando.
      Object.entries(gastoCamp).forEach(([campId, v]) => {
        const oid = campOferta[campId]
        if (base[oid]) { base[oid].gasto += v; base[oid].campanhas += 1 }
      })

      let fGasto = 0, fVendas = 0, fFat = 0, fSemUtm = 0
      Object.entries(gastoCamp).forEach(([campId, v]) => { if (!campOferta[campId]) fGasto += v })

      orders.forEach((o) => {
        if (String(o.status).toUpperCase() !== 'APPROVED') return
        const val = Number(o.value) || 0
        const cid = campIdOf(o)
        const oid = cid ? campOferta[cid] : undefined
        if (!oid || !base[oid]) {
          fVendas += 1; fFat += val
          if (!cid) fSemUtm += 1
          return
        }
        const a = base[oid]
        a.vendas += 1
        a.faturamento += val
        const d = dia(o.created_at)
        if (d && (!a.primeira || d < a.primeira)) a.primeira = d
        if (d && (!a.ultima || d > a.ultima)) a.ultima = d
      })

      setFora({ gasto: fGasto, vendas: fVendas, faturamento: fFat, semUtm: fSemUtm })
      setLinhas(
        Object.values(base)
          .filter((l) => l.vendas > 0 || l.gasto > 0)
          .sort((a, b) => (a.primeira || '9').localeCompare(b.primeira || '9')),
      )
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [defs])

  const tot = useMemo(
    () => linhas.reduce((s, l) => ({ v: s.v + l.vendas, f: s.f + l.faturamento, g: s.g + l.gasto }), { v: 0, f: 0, g: 0 }),
    [linhas],
  )
  const setNota = (nome: string, n: Nota) => { saveNotas({ ...notas, [nome]: n }); setEditando(null) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FlaskConical size={18} className="text-brand-2" />
        <h1 className="text-[17px] font-bold">Ofertas testadas</h1>
        <span className="text-[12px] text-muted">
          gasto e venda das mesmas campanhas · agrupadas em <Link to="/monitor/oferta" className="text-brand-2 underline">Por Oferta</Link>
        </span>
        <button className="btn btn-sm ml-auto" onClick={carregar} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {loading ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {erro && <div className="rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{erro}</div>}

      {semGrupos && (
        <div className="flex items-start gap-2 rounded-[10px] border border-warn/40 bg-warn/10 px-3 py-2.5 text-[12.5px] text-warn">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <b>Nenhuma oferta montada ainda.</b> Vá em <Link to="/monitor/oferta" className="underline">Monitor › Por Oferta</Link> e
            agrupe as campanhas de cada produto. Sem isso não há como separar gasto por oferta — e qualquer número aqui seria chute.
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
              <th className="py-2.5 pl-4 text-left font-semibold">Oferta</th>
              <th className="py-2.5 text-left font-semibold">Testada em</th>
              <th className="py-2.5 text-right font-semibold">Camp.</th>
              <th className="py-2.5 text-right font-semibold">Vendas</th>
              <th className="py-2.5 text-right font-semibold">Faturamento</th>
              <th className="py-2.5 text-right font-semibold">Ticket</th>
              <th className="py-2.5 text-right font-semibold">Gasto</th>
              <th className="py-2.5 text-right font-semibold">ROAS</th>
              <th className="py-2.5 text-right font-semibold">Margem/venda</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const nota = notas[l.nome]
              const s = situacao(l, nota)
              const roas = l.gasto > 0 ? l.faturamento / l.gasto : null
              const margem = l.vendas > 0 && l.gasto > 0 ? (l.faturamento - l.gasto) / l.vendas : null
              const exp = aberto === l.id
              return (
                <Fragment key={l.id}>
                  <tr className="cursor-pointer border-b border-border/50 hover:bg-surface2" onClick={() => setAberto(exp ? null : l.id)}>
                    <td className="py-2 pl-4">
                      <div className="flex items-center gap-1.5">
                        {exp ? <ChevronDown size={13} className="text-muted2" /> : <ChevronRight size={13} className="text-muted2" />}
                        <span className="font-semibold text-ink">{l.nome}</span>
                      </div>
                    </td>
                    <td className="py-2 text-[11.5px] text-muted2">{l.vendas ? `${fmtDia(l.primeira)} → ${fmtDia(l.ultima)}` : '—'}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{l.campanhas}</td>
                    <td className="py-2 text-right tabular-nums">{l.vendas.toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-right tabular-nums">{brl(l.faturamento)}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{l.vendas ? brl(l.faturamento / l.vendas) : '—'}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{l.gasto > 0 ? brl(l.gasto) : '—'}</td>
                    <td className={`py-2 text-right font-bold tabular-nums ${roas == null ? 'text-muted2' : roas >= BREAKEVEN ? 'text-ok' : 'text-danger'}`}>
                      {roas == null ? '—' : roas.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${margem == null ? 'text-muted2' : margem >= 0 ? 'text-ok' : 'text-danger'}`}>
                      {margem == null ? '—' : brl(margem)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${SIT[s].txt}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${SIT[s].dot}`} />{SIT[s].label}
                      </span>
                    </td>
                  </tr>
                  {exp && (
                    <tr className="border-b border-border/50 bg-surface2/40">
                      <td colSpan={10} className="px-4 py-3">
                        {editando === l.id ? (
                          <EditorNota nota={nota || { veredito: '', motivo: '' }} onSave={(n) => setNota(l.nome, n)} onCancel={() => setEditando(null)} />
                        ) : (
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-[12.5px] font-semibold text-ink">{nota?.veredito || 'Sem veredito registrado.'}</div>
                              <div className="mt-0.5 text-[12px] leading-relaxed text-muted">
                                {nota?.motivo || 'Anote por que esta oferta deu certo ou não — é o que vale daqui a três meses.'}
                              </div>
                            </div>
                            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEditando(l.id) }}>
                              <Pencil size={13} /> Anotar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-bold">
                <td className="py-2.5 pl-4">Total</td>
                <td /><td />
                <td className="py-2.5 text-right tabular-nums">{tot.v.toLocaleString('pt-BR')}</td>
                <td className="py-2.5 text-right tabular-nums">{brl(tot.f)}</td>
                <td className="py-2.5 text-right tabular-nums text-muted">{tot.v ? brl(tot.f / tot.v) : '—'}</td>
                <td className="py-2.5 text-right tabular-nums text-muted">{brl(tot.g)}</td>
                <td className={`py-2.5 text-right tabular-nums ${tot.g && tot.f / tot.g >= BREAKEVEN ? 'text-ok' : 'text-danger'}`}>
                  {tot.g ? (tot.f / tot.g).toFixed(2) : '—'}
                </td>
                <td className="py-2.5 text-right tabular-nums">{tot.v && tot.g ? brl((tot.f - tot.g) / tot.v) : '—'}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {(fora.gasto > 0 || fora.vendas > 0) && (
        <div className="rounded-[10px] border border-border bg-surface2 px-3 py-2.5 text-[12px] text-muted">
          <b className="text-ink">Fora dos grupos</b> — não entra em nenhuma linha acima:{' '}
          {fora.gasto > 0 && <><b className="text-warn">{brl(fora.gasto)}</b> de gasto em campanha não agrupada</>}
          {fora.gasto > 0 && fora.vendas > 0 && ' · '}
          {fora.vendas > 0 && <><b className="text-warn">{fora.vendas.toLocaleString('pt-BR')}</b> vendas ({brl(fora.faturamento)}){fora.semUtm > 0 && `, sendo ${fora.semUtm} sem UTM (orgânico)`}</>}
          <div className="mt-1 text-[11.5px] text-muted2">
            Quanto mais campanha agrupada em Por Oferta, menor esta linha — e mais exato o ROAS de cada oferta.
          </div>
        </div>
      )}
    </div>
  )
}

function EditorNota({ nota, onSave, onCancel }: { nota: Nota; onSave: (n: Nota) => void; onCancel: () => void }) {
  const [f, setF] = useState<Nota>({ ...nota })
  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Veredito</span>
        <input className={INP} value={f.veredito} onChange={(e) => setF({ ...f, veredito: e.target.value })} placeholder="Manter / Matar / Reprecificar…" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Por quê</span>
        <textarea className={`${INP} min-h-[64px] leading-relaxed`} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Situação (vazio = calcula pelo ROAS)</span>
        <select className={INP} value={f.status || ''} onChange={(e) => setF({ ...f, status: (e.target.value || undefined) as Nota['status'] })}>
          <option value="">Automático pelo ROAS</option>
          <option value="lucro">Lucro</option>
          <option value="prejuizo">Prejuízo</option>
          <option value="pendente">Sem gasto</option>
          <option value="morto">Encerrada</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => onSave(f)}><Check size={13} /> Salvar</button>
        <button className="btn btn-sm" onClick={onCancel}><X size={13} /> Cancelar</button>
      </div>
    </div>
  )
}
