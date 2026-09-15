import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, Search, LayoutGrid, List, AlertTriangle, Pencil, X, Check,
  TrendingUp, TrendingDown, Info,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePersistentState } from '@/lib/appState'
import { fetchOrders, brl, type KirvanoOrder } from '@/modules/pixel/orders'
import { readSnapshot } from '@/lib/adsDaily'
import { loadTaxas, syncTaxas, feeItemsForOrder, sumFees, type TaxasConfig } from '@/modules/taxas/taxas'

/* ── Gestão de Ofertas ───────────────────────────────────────────────────────
 * Cada oferta é uma unidade de negócio: tem faturamento, custo, lucro e
 * margem própria. Esta tela responde uma pergunta só — "esta oferta me deu (ou
 * está me dando) dinheiro?" — e responde com LUCRO, não com ROAS.
 *
 * Por que lucro e não ROAS: ROAS de 1,5 pode ser prejuízo e ROAS de 1,2 pode
 * ser lucro, dependendo da taxa do gateway, do imposto e do custo do produto.
 * A versão anterior usava um breakeven fixo de 1,23 pra todas as ofertas, o
 * que é chute — as taxas variam por produto e já estão cadastradas na aba
 * Taxas. Aqui elas entram POR PEDIDO:
 *
 *     lucro = faturamento − (taxa + imposto + custo) − gasto em anúncio
 *
 * ATRIBUIÇÃO (herdado da versão anterior, e continua sendo a única forma
 * confiável): a oferta é um GRUPO DE CAMPANHAS montado em Monitor › Por Oferta.
 *  · atribuir pela campanha QUE VENDEU inflava tudo — campanha que só queimou
 *    ficava de fora, então as perdedoras sumiam do cálculo;
 *  · atribuir pelo NOME da campanha não funciona — os nomes codificam criativo,
 *    lote e data, não produto.
 * Com o grupo explícito, gasto e venda saem das MESMAS campanhas. O que não
 * está em grupo nenhum aparece no rodapé, nunca escondido.
 *
 * STATUS é DERIVADO do gasto, não marcado na mão: oferta com gasto nos últimos
 * 7 dias está ATIVA, o resto está PAUSADA. Marcar status manualmente era
 * trabalho que ninguém mantinha em dia — e status desatualizado mente.
 * ───────────────────────────────────────────────────────────────────────────── */

const DIAS_ATIVA = 7

interface Nota { veredito: string; motivo: string }
interface OfferDef { id: string; name: string; members: string[] }

interface Oferta {
  id: string
  nome: string
  vendas: number
  faturamento: number
  encargos: number   // taxa + imposto + custo, somados por pedido
  gasto: number
  lucro: number
  campanhas: number
  primeira: string
  ultima: string
  ultimoGasto: string
  ativa: boolean
}

const campIdOf = (o: KirvanoOrder): string | null => {
  const m = /\|(\d+)/.exec(String((o as any).utm_campaign || ''))
  return m ? m[1] : null
}
const dia = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : '')
const fmtDia = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—')
const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
const hojeISO = () => new Date().toISOString().slice(0, 10)
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

/** Encargos de UM pedido: taxa de gateway + imposto + custo do produto.
 *  Mesma conta do P&L do Dashboard (realbuild.ts) — os dois têm que bater. */
function encargosDoPedido(cfg: TaxasConfig, o: KirvanoOrder): number {
  const s = sumFees(feeItemsForOrder(cfg, o))
  const v = Number(o.value) || 0
  return (
    (v * s.byCat.taxa.pct) / 100 + s.byCat.taxa.fixo +
    (v * s.byCat.imposto.pct) / 100 + s.byCat.imposto.fixo +
    (v * s.byCat.custo.pct) / 100 + s.byCat.custo.fixo
  )
}

type Ordem = 'lucro' | 'faturamento' | 'roas' | 'margem' | 'recente'
type Aba = 'todas' | 'ativa' | 'pausada'

export default function OfertasPage() {
  const [defs] = usePersistentState<OfferDef[]>('meta_oferta_defs', [])
  const [notas, saveNotas] = usePersistentState<Record<string, Nota>>('meta_ofertas_notas', {})

  const [ofertas, setOfertas] = useState<Oferta[]>([])
  const [fora, setFora] = useState({ gasto: 0, vendas: 0, faturamento: 0, semUtm: 0 })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('todas')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('lucro')
  const [modo, setModo] = usePersistentState<'cards' | 'lista'>('ofertas_modo', 'cards')
  const [janela, setJanela] = usePersistentState<number>('ofertas_janela', 0) // 0 = tudo

  async function carregar() {
    setLoading(true); setErro('')
    try {
      const cfg: TaxasConfig = await syncTaxas().catch(() => loadTaxas())
      const desde = janela ? diasAtras(janela) : undefined

      const orders = await fetchOrders(desde ? `${desde}T00:00:00.000Z` : undefined)
      const dias = orders.map((o) => dia(o.ordered_at || o.created_at)).filter(Boolean).sort()
      const de = desde || dias[0] || hojeISO()
      const ate = dias[dias.length - 1] || hojeISO()
      const snap = await readSnapshot(de, ate)

      // gasto por campanha + a última data em que cada uma gastou
      const gastoCamp: Record<string, number> = {}
      const ultimoCamp: Record<string, string> = {}
      snap.forEach((r) => {
        const v = Number(r.spend_brl) || 0
        gastoCamp[r.camp_id] = (gastoCamp[r.camp_id] || 0) + v
        if (v > 0 && (!ultimoCamp[r.camp_id] || r.dia > ultimoCamp[r.camp_id])) ultimoCamp[r.camp_id] = r.dia
      })

      // campanha → oferta (members chegam como `accId::campId`)
      const campOferta: Record<string, string> = {}
      defs.forEach((d) => (d.members || []).forEach((m) => {
        const campId = String(m).split('::')[1]
        if (campId) campOferta[campId] = d.id
      }))

      const base: Record<string, Oferta> = {}
      defs.forEach((d) => {
        base[d.id] = {
          id: d.id, nome: d.name, vendas: 0, faturamento: 0, encargos: 0, gasto: 0,
          lucro: 0, campanhas: 0, primeira: '', ultima: '', ultimoGasto: '', ativa: false,
        }
      })

      // gasto: TODA campanha do grupo, tenha vendido ou não. É o que impede o
      // ROAS otimista — a campanha que só queimou continua no denominador.
      let fGasto = 0
      Object.entries(gastoCamp).forEach(([campId, v]) => {
        const oid = campOferta[campId]
        if (base[oid]) {
          base[oid].gasto += v
          base[oid].campanhas += 1
          const u = ultimoCamp[campId]
          if (u && u > base[oid].ultimoGasto) base[oid].ultimoGasto = u
        } else {
          fGasto += v
        }
      })

      let fVendas = 0, fFat = 0, fSemUtm = 0
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
        a.encargos += encargosDoPedido(cfg, o)
        const d = dia(o.ordered_at || o.created_at)
        if (d && (!a.primeira || d < a.primeira)) a.primeira = d
        if (d && (!a.ultima || d > a.ultima)) a.ultima = d
      })

      const corte = diasAtras(DIAS_ATIVA)
      const lista = Object.values(base)
        .filter((l) => l.vendas > 0 || l.gasto > 0)
        .map((l) => ({ ...l, lucro: l.faturamento - l.encargos - l.gasto, ativa: !!l.ultimoGasto && l.ultimoGasto >= corte }))

      setFora({ gasto: fGasto, vendas: fVendas, faturamento: fFat, semUtm: fSemUtm })
      setOfertas(lista)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [defs, janela])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return ofertas
      .filter((o) => (aba === 'todas' ? true : aba === 'ativa' ? o.ativa : !o.ativa))
      .filter((o) => !t || o.nome.toLowerCase().includes(t))
      .sort((a, b) => {
        if (ordem === 'faturamento') return b.faturamento - a.faturamento
        if (ordem === 'margem') return (b.faturamento ? b.lucro / b.faturamento : -9) - (a.faturamento ? a.lucro / a.faturamento : -9)
        if (ordem === 'roas') return (b.gasto ? b.faturamento / b.gasto : -9) - (a.gasto ? a.faturamento / a.gasto : -9)
        if (ordem === 'recente') return (b.ultima || '').localeCompare(a.ultima || '')
        return b.lucro - a.lucro
      })
  }, [ofertas, aba, busca, ordem])

  const carteira = useMemo(() => {
    const comResultado = ofertas.filter((o) => o.gasto > 0 || o.faturamento > 0)
    const pos = comResultado.filter((o) => o.lucro > 0)
    const neg = comResultado.filter((o) => o.lucro < 0)
    return {
      total: comResultado.length,
      pos: pos.length,
      neg: neg.length,
      lucroPos: pos.reduce((s, o) => s + o.lucro, 0),
      lucroNeg: neg.reduce((s, o) => s + o.lucro, 0),
      lucroTotal: comResultado.reduce((s, o) => s + o.lucro, 0),
      ativas: ofertas.filter((o) => o.ativa).length,
    }
  }, [ofertas])

  const setNota = (nome: string, n: Nota) => { saveNotas({ ...notas, [nome]: n }); setEditando(null) }

  return (
    <div className="flex flex-col gap-4">
      {/* ── cabeçalho ── */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-bold tracking-[-.02em]">Gestão de Ofertas</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Cada oferta é uma unidade de negócio. Lucro já descontando taxa, imposto e custo da aba{' '}
            <Link to="/taxas" className="text-brand underline">Taxas</Link> — agrupadas em{' '}
            <Link to="/monitor/oferta" className="text-brand underline">Por Oferta</Link>.
          </p>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={carregar} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {loading ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {erro && <div className="rounded-[10px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{erro}</div>}

      {!defs.length && (
        <div className="flex items-start gap-2 rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2.5 text-[12.5px] text-warn">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <b>Nenhuma oferta montada ainda.</b> Vá em <Link to="/monitor/oferta" className="underline">Monitor › Por Oferta</Link> e
            agrupe as campanhas de cada produto. Sem isso não há como separar gasto por oferta — e qualquer número aqui seria chute.
          </div>
        </div>
      )}

      {/* ── retrato do portfólio ── */}
      {carteira.total > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ResumoCarteira
            tom="ok"
            titulo="Ofertas no lucro"
            quantos={carteira.pos}
            total={carteira.total}
            valor={carteira.lucroPos}
          />
          <ResumoCarteira
            tom="bad"
            titulo="Ofertas no prejuízo"
            quantos={carteira.neg}
            total={carteira.total}
            valor={carteira.lucroNeg}
          />
        </div>
      )}

      {/* ── controles ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-[10px] border border-border bg-surface p-1">
          {([['todas', 'Todas', ofertas.length], ['ativa', 'Ativas', carteira.ativas], ['pausada', 'Pausadas', ofertas.length - carteira.ativas]] as const).map(
            ([k, rot, n]) => (
              <button
                key={k}
                onClick={() => setAba(k as Aba)}
                className={`rounded-[7px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  aba === k ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {rot} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ),
          )}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted2" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar oferta pelo nome…"
            className="w-full rounded-[10px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-ink placeholder-muted2 outline-none transition-colors focus:border-brand"
          />
        </div>

        <select
          value={janela}
          onChange={(e) => setJanela(Number(e.target.value))}
          className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand"
        >
          <option value={0}>Desde sempre</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>

        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand"
        >
          <option value="lucro">Maior lucro</option>
          <option value="faturamento">Maior faturamento</option>
          <option value="roas">Maior ROAS</option>
          <option value="margem">Maior margem</option>
          <option value="recente">Venda mais recente</option>
        </select>

        <div className="flex rounded-[10px] border border-border bg-surface p-1">
          <button
            onClick={() => setModo('cards')}
            className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12px] font-semibold ${modo === 'cards' ? 'bg-surface2 text-ink' : 'text-muted2'}`}
          >
            <LayoutGrid size={13} /> Cards
          </button>
          <button
            onClick={() => setModo('lista')}
            className={`flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12px] font-semibold ${modo === 'lista' ? 'bg-surface2 text-ink' : 'text-muted2'}`}
          >
            <List size={13} /> Lista
          </button>
        </div>
      </div>

      {/* ── ofertas ── */}
      {!visiveis.length && defs.length > 0 && !loading && (
        <div className="card card-body text-center text-[12.5px] text-muted2">
          Nenhuma oferta {aba === 'ativa' ? 'ativa' : aba === 'pausada' ? 'pausada' : ''} pra este filtro.
        </div>
      )}

      {modo === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visiveis.map((o) => (
            <CardOferta
              key={o.id}
              o={o}
              nota={notas[o.nome]}
              editando={editando === o.id}
              onEditar={() => setEditando(o.id)}
              onCancelar={() => setEditando(null)}
              onSalvar={(n) => setNota(o.nome, n)}
            />
          ))}
        </div>
      ) : (
        <ListaOfertas linhas={visiveis} />
      )}

      {/* ── o que ficou de fora: nunca escondido ── */}
      {(fora.gasto > 0 || fora.vendas > 0) && (
        <div className="card card-body flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
          <span className="flex items-center gap-1.5 font-semibold text-muted">
            <Info size={13} className="text-muted2" /> Fora de qualquer oferta
          </span>
          <span className="text-muted2">Gasto <b className="tabular-nums text-ink">{brl(fora.gasto)}</b></span>
          <span className="text-muted2">Vendas <b className="tabular-nums text-ink">{fora.vendas.toLocaleString('pt-BR')}</b></span>
          <span className="text-muted2">Faturamento <b className="tabular-nums text-ink">{brl(fora.faturamento)}</b></span>
          {fora.semUtm > 0 && <span className="text-muted2">sendo <b className="text-ink">{fora.semUtm}</b> sem UTM (pós-compra/orgânico)</span>}
          <Link to="/monitor/oferta" className="ml-auto text-brand underline">Agrupar campanhas</Link>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── peças ─────────────────────────── */

function ResumoCarteira({ tom, titulo, quantos, total, valor }: {
  tom: 'ok' | 'bad'; titulo: string; quantos: number; total: number; valor: number
}) {
  const p = total ? quantos / total : 0
  const cor = tom === 'ok' ? 'text-ok' : 'text-danger'
  const fundo = tom === 'ok' ? 'bg-ok' : 'bg-danger'
  return (
    <div className="card card-body flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${fundo}`} />
        <span className="text-[10.5px] font-bold uppercase tracking-[.13em] text-muted2">{titulo}</span>
        <span className={`ml-auto text-[15px] font-bold tabular-nums ${cor}`}>{pct(p)}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-[30px] font-bold leading-none tabular-nums ${cor}`}>{quantos}</span>
        <span className="text-[13px] text-muted">de {total}</span>
        <span className={`ml-auto text-[13px] font-bold tabular-nums ${cor}`}>{brl(valor)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
        <div className={`h-full rounded-full ${fundo}`} style={{ width: `${(p * 100).toFixed(1)}%` }} />
      </div>
    </div>
  )
}

function Metrica({ rot, val, tom }: { rot: string; val: string; tom?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-[10px] bg-surface2 px-3 py-2.5">
      <div className="text-[9.5px] font-bold uppercase tracking-[.1em] text-muted2">{rot}</div>
      <div className={`mt-1 text-[14px] font-bold tabular-nums ${tom === 'ok' ? 'text-ok' : tom === 'bad' ? 'text-danger' : 'text-ink'}`}>{val}</div>
    </div>
  )
}

function CardOferta({ o, nota, editando, onEditar, onCancelar, onSalvar }: {
  o: Oferta; nota?: Nota; editando: boolean
  onEditar: () => void; onCancelar: () => void; onSalvar: (n: Nota) => void
}) {
  const roas = o.gasto > 0 ? o.faturamento / o.gasto : null
  const margem = o.faturamento > 0 ? o.lucro / o.faturamento : null
  const roi = o.gasto > 0 ? o.lucro / o.gasto : null
  const bom = o.lucro > 0

  return (
    <div className="card flex flex-col gap-3 p-4">
      {/* topo: status + nome */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              o.ativa ? 'bg-brand text-brand-ink' : 'border border-border2 text-muted2'
            }`}
          >
            {o.ativa ? 'Ativa' : 'Pausada'}
          </span>
          <h3 className="mt-2 truncate text-[14px] font-bold tracking-[-.015em]" title={o.nome}>{o.nome}</h3>
          <p className="mt-0.5 text-[11px] text-muted2">
            {o.campanhas} campanha{o.campanhas === 1 ? '' : 's'} · {fmtDia(o.primeira)} → {fmtDia(o.ultima)}
          </p>
        </div>
        <button onClick={onEditar} className="shrink-0 text-muted2 transition-colors hover:text-brand" title="Anotar veredito">
          <Pencil size={13} />
        </button>
      </div>

      {/* lucro é o herói */}
      <div className="rounded-[12px] bg-surface2 px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[.12em] text-muted2">
          {bom ? <TrendingUp size={11} className="text-ok" /> : <TrendingDown size={11} className="text-danger" />} Lucro
        </div>
        <div className={`mt-1 text-[25px] font-bold leading-none tabular-nums tracking-[-.035em] ${bom ? 'text-ok' : 'text-danger'}`}>
          {brl(o.lucro)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metrica rot="Faturamento" val={brl(o.faturamento)} />
        <Metrica rot="Gasto c/ anúncio" val={o.gasto > 0 ? brl(o.gasto) : '—'} />
        <Metrica rot="ROAS" val={roas == null ? '—' : `${roas.toFixed(2)}x`} />
        <Metrica rot="Margem" val={margem == null ? '—' : pct(margem)} tom={margem == null ? undefined : margem >= 0 ? 'ok' : 'bad'} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted2">
        <span>ROI <b className={`tabular-nums ${roi == null ? '' : roi >= 0 ? 'text-ok' : 'text-danger'}`}>{roi == null ? '—' : `${roi.toFixed(2)}x`}</b></span>
        <span>{o.vendas.toLocaleString('pt-BR')} venda{o.vendas === 1 ? '' : 's'}</span>
        <span>Ticket <b className="tabular-nums text-muted">{o.vendas ? brl(o.faturamento / o.vendas) : '—'}</b></span>
        <span title="taxa + imposto + custo do produto">Encargos <b className="tabular-nums text-muted">{brl(o.encargos)}</b></span>
      </div>

      {editando ? (
        <EditorNota nota={nota || { veredito: '', motivo: '' }} onSave={onSalvar} onCancel={onCancelar} />
      ) : (nota?.veredito || nota?.motivo) ? (
        <div className="border-t border-border pt-2.5">
          {nota.veredito && <div className="text-[12px] font-semibold text-ink">{nota.veredito}</div>}
          {nota.motivo && <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{nota.motivo}</div>}
        </div>
      ) : null}
    </div>
  )
}

function ListaOfertas({ linhas }: { linhas: Oferta[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-[9.5px] uppercase tracking-[.12em] text-muted2">
            <th className="py-2.5 pl-4 text-left font-bold">Oferta</th>
            <th className="py-2.5 text-left font-bold">Período</th>
            <th className="py-2.5 text-right font-bold">Vendas</th>
            <th className="py-2.5 text-right font-bold">Faturamento</th>
            <th className="py-2.5 text-right font-bold">Encargos</th>
            <th className="py-2.5 text-right font-bold">Gasto</th>
            <th className="py-2.5 text-right font-bold">ROAS</th>
            <th className="py-2.5 text-right font-bold">Margem</th>
            <th className="py-2.5 pr-4 text-right font-bold">Lucro</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((o) => {
            const roas = o.gasto > 0 ? o.faturamento / o.gasto : null
            const margem = o.faturamento > 0 ? o.lucro / o.faturamento : null
            return (
              <tr key={o.id} className="border-b border-border/50 last:border-0 hover:bg-surface2">
                <td className="py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-3.5 w-1 shrink-0 rounded-full ${o.ativa ? 'bg-brand' : 'bg-border2'}`} />
                    <span className="font-semibold text-ink">{o.nome}</span>
                  </div>
                </td>
                <td className="py-2.5 text-[11.5px] text-muted2">{fmtDia(o.primeira)} → {fmtDia(o.ultima)}</td>
                <td className="py-2.5 text-right tabular-nums">{o.vendas.toLocaleString('pt-BR')}</td>
                <td className="py-2.5 text-right tabular-nums">{brl(o.faturamento)}</td>
                <td className="py-2.5 text-right tabular-nums text-muted2">{brl(o.encargos)}</td>
                <td className="py-2.5 text-right tabular-nums text-muted">{o.gasto > 0 ? brl(o.gasto) : '—'}</td>
                <td className="py-2.5 text-right tabular-nums text-muted">{roas == null ? '—' : `${roas.toFixed(2)}x`}</td>
                <td className={`py-2.5 text-right tabular-nums ${margem == null ? 'text-muted2' : margem >= 0 ? 'text-ok' : 'text-danger'}`}>
                  {margem == null ? '—' : pct(margem)}
                </td>
                <td className={`py-2.5 pr-4 text-right font-bold tabular-nums ${o.lucro >= 0 ? 'text-ok' : 'text-danger'}`}>{brl(o.lucro)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EditorNota({ nota, onSave, onCancel }: { nota: Nota; onSave: (n: Nota) => void; onCancel: () => void }) {
  const [veredito, setVeredito] = useState(nota.veredito)
  const [motivo, setMotivo] = useState(nota.motivo)
  const inp = 'w-full rounded-[8px] border border-border bg-[#0b0b0b] px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-brand'
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2.5">
      <input className={inp} value={veredito} onChange={(e) => setVeredito(e.target.value)} placeholder="Veredito (ex.: escalar, matar, testar criativo novo)" />
      <textarea className={inp} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por quê? É isso que vale daqui a três meses." />
      <div className="flex gap-2">
        <button className="btn btn-sm btn-primary" onClick={() => onSave({ veredito: veredito.trim(), motivo: motivo.trim() })}>
          <Check size={12} /> Salvar
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}><X size={12} /> Cancelar</button>
      </div>
    </div>
  )
}
