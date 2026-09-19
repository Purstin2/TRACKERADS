import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, Search, X, Pause, Play, DollarSign, Clock,
  BarChart3, ArrowUpDown, Filter, Check, Zap,
} from 'lucide-react'
import { useLog, addAction, todayBR, increasesForDay } from '@/modules/monitor/actionLog'
import { campIdFromUtm, fetchCampaignSales, type CampSale } from '@/modules/monitor/realRoas'
import { loadFinParamsForAccount, rowFin } from '@/modules/monitor/finance'
import { buildCards, verdictOf, roasOf, hourBR, type Win } from '@/modules/monitor/trackerMath'
import { supabase, fetchAll, authHeaders } from '@/lib/supabase'
import { resolvePeriod, type PeriodValue } from './period'

// api/mobile.js agora exige sessão logada — injeta o token em toda chamada daqui.
async function apiFetch(url: string, options: RequestInit = {}) {
  const h = await authHeaders()
  return fetch(url, { ...options, headers: { ...(options.headers || {}), ...h } })
}

/* Campanhas no celular — a tela é só: filtros, período, e a lista.
 *
 * Cada card responde as quatro perguntas que decidem orçamento, nessa ordem:
 * qual campanha é, quanto ela está devolvendo (ROAS REAL — venda do gateway ÷
 * gasto, não o do Meta), quantas vendas o gateway confirmou, e quanto custou
 * cada uma delas (CPA real). Só quando não existe venda do gateway o número
 * grande cai pro ROAS do Meta, e o rótulo embaixo avisa qual dos dois é.
 *
 * Três botões, os mesmos da tira de ícones do desktop: "Vendas" (o dia a dia
 * dos últimos 7 dias), "Orçamento" (aumentar ou diminuir) e o quadrado de
 * relógio — vendas por horário, a hora exata de cada venda. Pausar/reativar
 * ficou no rodapé do painel: a um toque, fora do caminho do polegar.
 *
 * Dinheiro na MOEDA DA CONTA, igual ao desktop. A conta do lucro/ROAS real é
 * feita em BRL (o gateway só fala real) e convertida de volta no fim.
 *
 * Saíram daqui: o resumo de ROAS do período no topo, os avisos vermelhos por
 * conta, e a seleção múltipla com desativação em lote. Os três ocupavam a
 * primeira tela inteira e empurravam as campanhas pra baixo da dobra, que é
 * o oposto do que o celular precisa.
 *
 * O token NÃO vem pro browser: quem fala com a Meta é /api/mobile. */

/* Dinheiro sempre com o SÍMBOLO DA CONTA que gastou — o celular mostrava tudo
 * em R$ enquanto o desktop mostrava em US$ na mesma campanha. Como o celular
 * não tem mais linha de total, cada card pode usar a moeda da sua própria
 * conta; não existe soma misturando moedas pra proteger. */
const simbolo = (cur?: string | null) => ((cur || 'USD').toUpperCase() === 'BRL' ? 'R$' : '$')
const money = (v: number | null | undefined, s = 'R$') =>
  s + ' ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moneyCurto = (v: number | null | undefined, s = 'R$') => {
  const n = v || 0
  return n >= 1000 ? s + ' ' + (n / 1000).toFixed(1).replace('.', ',') + 'k' : money(n, s)
}
/** quanto vale, na moeda da conta, um valor que veio em BRL do gateway */
const deBRL = (v: number, cur: string | null | undefined, fx: number) =>
  (cur || 'USD').toUpperCase() === 'BRL' ? v : v / (fx || 1)

const STATUS: [string, string][] = [
  ['active', 'Ativas'],
  ['active_paused', 'Ativas + pausadas'],
  ['all', 'Tudo'],
]
type Ordem = 'roas' | 'vendas' | 'gasto' | 'orcamento'
const ORDENS: [Ordem, string][] = [
  ['roas', 'ROAS real'],
  ['vendas', 'Vendas hoje'],
  ['gasto', 'Gasto'],
  ['orcamento', 'Orçamento'],
]

interface Row {
  id: string; name: string; accId: string; accName: string
  spend: number; roas: number | null; sales: number; cpa: number | null
  revenue: number; freq: number; budget: number | null; status: string | null
  /* os três na MOEDA DA CONTA, sem conversão. `spend`/`cpa`/`budget` acima vêm
     convertidos pra BRL (o real precisa deles pra casar com o gateway); estes
     são os que aparecem na tela, na mesma moeda do desktop. */
  spendRaw?: number
  cpaRaw?: number | null
  budgetRaw?: number | null
  /** moeda da conta (USD/BRL) */
  cur?: string
}
/** total do dia de uma campanha, na moeda da conta (pro tracker do aumento) */
type DiaWin = { win: Win | null; carregando: boolean }
interface Params { roasGood: number; roasBe: number; cpaMax: number; fx: number }
/** vendas REAIS do gateway, por campanha */
interface Real { sales: number; revenue: number; salesHoje: number; revenueHoje: number }

const SEL =
  'h-[42px] w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink focus:border-brand focus:outline-none'

/* ── Tracker do aumento (o "Mexidas hoje" do desktop) ────────────────────────
 * Mostra o que o aumento de HOJE trouxe: antes→depois do orçamento, quantas
 * vezes mexi, e quantas vendas / quanto de lucro entraram DEPOIS do aumento.
 * É o número em que a decisão de subir de novo se apoia.
 *
 * Reusa a matemática do desktop (buildCards/verdictOf/rowFin) — só a fonte dos
 * dados muda: lá o browser fala com a Meta direto, aqui vai pelo /api/mobile,
 * porque o token não desce pro celular.
 *
 * ⚠ Unidade: `spendAtTime` no log e o `spend` do camp-daily estão os dois na
 * MOEDA DA CONTA. Não dá pra usar o `spend` da listagem, que já vem convertido
 * pra BRL — subtrair um do outro daria um "lucro" ~5x errado. */
function TrackerAumento({
  r, win, sym,
}: { r: Row; win: DiaWin; sym: string }) {
  const hoje = todayBR()
  const incs = increasesForDay(r.id, hoje)
  if (!incs.length) return null

  const cards = buildCards(incs, win.win, hoje, hoje)
  const c = cards[0]
  if (!c) return null

  const { lucro } = rowFin(c.after.spend, c.after.revenue, c.after.sales, loadFinParamsForAccount(r.accId))
  const v = verdictOf(c, lucro)
  const ra = roasOf(c.after)
  const cor = v == null ? 'text-muted2' : v.ok == null ? 'text-muted' : v.ok ? 'text-ok' : 'text-danger'

  return (
    <div className="mt-2 rounded-[9px] border border-brand/25 bg-brand/[0.06] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-bold text-ink">
          {sym}{(c.e.budgetBefore ?? 0).toFixed(0)}
          <span className="text-ok"> → </span>
          {sym}{(c.e.budgetAfter ?? 0).toFixed(0)}
        </span>
        {incs.length > 1 && <span className="text-[11px] text-muted2">({incs.length}×)</span>}
        <span className="ml-auto text-[10.5px] text-muted2">
          {hourBR(c.e.ts)} · {c.live ? 'ao vivo' : 'fechado'}
        </span>
      </div>

      <div className={`mt-1 flex items-center gap-2 font-mono text-[12.5px] font-bold ${cor}`}>
        {win.carregando && !v ? (
          <span className="text-muted2">medindo…</span>
        ) : v ? (
          <>
            <span>+{v.vendas}v</span>
            <span className="text-muted2">·</span>
            <span>{v.lucro >= 0 ? '+' : '−'}{sym}{Math.abs(v.lucro).toFixed(0)}</span>
            <span>{v.ok == null ? '➖' : v.ok ? '✅' : '❌'}</span>
            {ra != null && <span className="ml-auto text-[11px] font-normal text-muted2">roas {ra.toFixed(2)}</span>}
          </>
        ) : (
          <span className="text-muted2">aguardando gasto depois do aumento</span>
        )}
      </div>

      {v && <div className="mt-0.5 text-[11px] leading-snug text-muted2">{v.txt}</div>}
    </div>
  )
}

/* ── Vendas por horário ───────────────────────────────────────────────────────
 * A hora exata em que cada venda caiu, igual ao relógio da tira do desktop.
 * Responde duas coisas que o total do dia não responde: a venda foi AGORA
 * (então vale subir orçamento pra pegar o embalo), e em que faixa do dia essa
 * campanha converte.
 *
 * Fonte é o gateway (kirvano_orders) — o único com o instante do pedido; o
 * Meta só devolve agregado do dia. Por isso os valores aqui são em R$ mesmo
 * quando a conta gasta em dólar: é dinheiro que entrou em real. */
function PorHorario({ campId }: { campId: string }) {
  const [dias, setDias] = useState(0) // 0 = hoje
  const [vendas, setVendas] = useState<CampSale[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    setVendas(null); setErro('')
    const desde = dias === 0
      ? resolvePeriod({ id: 'today' }).sinceISO
      : new Date(Date.now() - dias * 86400000).toISOString()
    fetchCampaignSales(campId, desde)
      .then((v) => vivo && setVendas(v))
      .catch((e) => { if (vivo) { setErro(e?.message || 'falha ao buscar vendas'); setVendas([]) } })
    return () => { vivo = false }
  }, [campId, dias])

  /* 24 baldes de uma hora, no fuso BR — a mesma régua do gasto por hora do
     Meta, pra dar pra comparar "vendi às 20h" com "gastei às 20h". */
  const porHora = useMemo(() => {
    const h = Array.from({ length: 24 }, () => ({ n: 0, v: 0 }))
    for (const s of vendas || []) {
      const i = new Date(new Date(s.at).getTime() - 3 * 3600000).getUTCHours()
      h[i].n += 1; h[i].v += s.value
    }
    return h
  }, [vendas])
  const pico = Math.max(...porHora.map((h) => h.n), 0)
  const total = (vendas || []).reduce((s, v) => s + v.value, 0)

  return (
    <>
      <div className="mb-2 flex gap-1.5">
        {([[0, 'Hoje'], [7, '7 dias'], [30, '30 dias']] as const).map(([d, lb]) => (
          <button key={d} onClick={() => setDias(d)}
            className={`flex-1 rounded-[9px] border py-2 text-[12px] font-bold active:scale-[0.98] ${
              dias === d ? 'border-brand bg-brand text-brand-ink' : 'border-border text-muted'
            }`}>{lb}</button>
        ))}
      </div>

      {vendas == null ? (
        <div className="py-8 text-center text-[12.5px] text-muted2">carregando vendas…</div>
      ) : erro ? (
        <div className="rounded-[10px] border border-danger/30 bg-danger/[0.07] p-3 text-[12.5px] text-danger">{erro}</div>
      ) : vendas.length === 0 ? (
        <div className="py-8 text-center text-[12.5px] text-muted2">nenhuma venda nesse período</div>
      ) : (
        <>
          <div className="mb-2 text-[12px] text-muted">
            <b className="text-ink">{vendas.length}</b> venda{vendas.length === 1 ? '' : 's'} · <b className="text-ok">{money(total)}</b>
          </div>

          {/* barras de 24h: altura pelo nº de vendas da hora, pico = 100% */}
          <div className="flex h-[74px] items-end gap-[2px] rounded-[10px] border border-border bg-surface2/40 px-2 pt-2">
            {porHora.map((h, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center justify-end" title={`${i}h — ${h.n} venda(s) · ${money(h.v)}`}>
                <div
                  className={`w-full rounded-t-[2px] ${h.n > 0 ? 'bg-brand' : 'bg-border'}`}
                  style={{ height: h.n > 0 && pico > 0 ? `${Math.max(8, (h.n / pico) * 52)}px` : '2px' }}
                />
              </div>
            ))}
          </div>
          <div className="mb-3 mt-1 flex justify-between px-2 text-[9.5px] text-muted2">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
          </div>

          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted2">Cada venda</div>
          <div className="flex flex-col gap-1">
            {vendas.slice(0, 60).map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-[9px] border border-border bg-surface2/50 px-3 py-2 text-[12.5px]">
                <span className="w-[42px] shrink-0 font-mono font-bold text-ink">
                  {new Date(s.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                </span>
                {dias > 0 && (
                  <span className="w-[38px] shrink-0 font-mono text-[11px] text-muted2">
                    {new Date(s.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-muted">{s.product || '—'}</span>
                <span className="shrink-0 font-mono font-semibold text-ok">{money(s.value)}</span>
              </div>
            ))}
            {vendas.length > 60 && (
              <div className="py-2 text-center text-[11px] text-muted2">+{vendas.length - 60} vendas mais antigas</div>
            )}
          </div>
        </>
      )}
    </>
  )
}

/* ── painel do card ───────────────────────────────────────────────────────────
 * Abre direto na aba que o botão pediu:
 *   vendas  → o dia a dia dos últimos 7 dias
 *   orc     → ajuste fino do orçamento
 *   horario → a hora exata de cada venda
 * Pausar/reativar mora no rodapé daqui. Saiu do card pra não competir com o
 * número que decide, mas tirar do celular inteiro deixaria campanha ruim sem
 * como desligar longe do PC. */
function Detalhe({
  r, abaInicial, onClose, onBudget, onStatus,
}: {
  r: Row
  abaInicial: 'vendas' | 'orc' | 'horario'
  onClose: () => void
  onBudget: (novo: number, antes: number | null) => void
  onStatus: (novo: string) => void
}) {
  const s = simbolo(r.cur)
  const [aba, setAba] = useState<'vendas' | 'orc' | 'horario'>(abaInicial)
  const [info, setInfo] = useState<any>(null)
  const [dias, setDias] = useState<any[] | null>(null)
  const [pct, setPct] = useState(20)
  const [abs, setAbs] = useState('')
  const [modo, setModo] = useState<'pct' | 'abs'>('pct')
  const [aplicando, setAplicando] = useState(false)
  const [pausando, setPausando] = useState(false)
  const [confirmaPausa, setConfirmaPausa] = useState(false)

  useEffect(() => {
    apiFetch(`/api/mobile?fn=camp-budget&id=${r.id}`).then((x) => x.json()).then(setInfo).catch(() => setInfo({ ok: false }))
    apiFetch(`/api/mobile?fn=camp-daily&id=${r.id}&acc=${r.accId}&dias=7`).then((x) => x.json())
      .then((j) => setDias(j.ok ? j.dias : [])).catch(() => setDias([]))
  }, [r.id, r.accId])

  const atual = info?.ok ? info.totalMoeda : null
  const novo = modo === 'abs' ? parseFloat(abs || '0') : atual != null ? atual * (1 + pct / 100) : 0
  const on = (r.status || '').toUpperCase() === 'ACTIVE'

  async function aplicar() {
    if (!(novo > 0) || atual == null) return
    setAplicando(true)
    try {
      const j = await (await apiFetch('/api/mobile?fn=camp-budget', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, novoTotal: novo }),
      })).json()
      if (!j.ok && j.error) alert('Erro: ' + j.error)
      else {
        addAction({
          accId: r.accId, name: r.name, campId: r.id, kind: 'orcamento', sim: false,
          cur: r.cur || 'USD', roasAtTime: r.roas, spendAtTime: r.spendRaw ?? null, salesAtTime: r.sales,
          dateBR: todayBR(), budgetBefore: j.antes, budgetAfter: j.depois,
          detail: `${modo === 'pct' ? (pct >= 0 ? '+' : '') + pct + '%' : 'valor fixo'} (${j.nivel}) · pelo celular`,
        })
        onBudget(j.depois, j.antes ?? null)
        if (j.effective_status && j.effective_status !== 'ACTIVE') {
          alert(`⚠ Orçamento aplicado, mas a campanha está "${j.effective_status}". Reative se não foi você.`)
        }
        onClose()
      }
    } catch (e: any) { alert('Erro: ' + e.message) }
    setAplicando(false)
  }

  async function mudarStatus(alvo: 'ACTIVE' | 'PAUSED') {
    setPausando(true)
    setConfirmaPausa(false)
    try {
      const j = await (await apiFetch('/api/mobile?fn=camp-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, status: alvo }),
      })).json()
      if (!j.ok) alert('Erro: ' + (j.error || 'falha'))
      else {
        const st = j.effective_status || alvo
        onStatus(st)
        /* o log não tem um tipo "resume"; reativação entra como nota, com o
           texto dizendo o que foi — melhor que inventar um tipo novo só aqui */
        addAction({
          accId: r.accId, name: r.name, campId: r.id, kind: alvo === 'PAUSED' ? 'pause' : 'nota', sim: false,
          cur: r.cur || 'USD', roasAtTime: r.roas, spendAtTime: r.spendRaw ?? null, salesAtTime: r.sales,
          dateBR: todayBR(),
          detail: alvo === 'PAUSED' ? 'pausada pelo painel do celular' : 'reativada pelo painel do celular',
        })
        if (j.effective_status && j.effective_status !== alvo) {
          alert(`A Meta aplicou "${j.effective_status}" (você pediu ${alvo}).`)
        }
      }
    } catch (e: any) { alert('Erro: ' + e.message) }
    setPausando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-[14px] font-extrabold leading-snug">{r.name}</div>
            <div className="mt-0.5 text-[11.5px] text-muted2">{r.accName}</div>
          </div>
          <button onClick={onClose} className="shrink-0 text-muted2"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex overflow-hidden rounded-[10px] border border-border">
          {([['vendas', 'Vendas', BarChart3], ['orc', 'Orçamento', DollarSign], ['horario', 'Horário', Clock]] as const).map(([id, lb, Ic]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-bold ${aba === id ? 'bg-brand text-brand-ink' : 'text-muted2'}`}>
              <Ic className="h-4 w-4" /> {lb}
            </button>
          ))}
        </div>

        {aba === 'vendas' ? (
          <>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted2">Últimos 7 dias</div>
            {!dias ? <div className="py-6 text-center text-[12.5px] text-muted2">carregando…</div>
            : dias.length === 0 ? <div className="py-6 text-center text-[12.5px] text-muted2">sem dados no período</div>
            : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted2">
                  <span className="w-[46px] shrink-0">dia</span>
                  <span className="w-[52px] shrink-0">roas</span>
                  <span className="flex-1 text-right">gasto</span>
                  <span className="w-[36px] shrink-0 text-right">vnd</span>
                </div>
                {dias.map((d) => (
                  <div key={d.dia} className="flex items-center gap-2 rounded-[9px] border border-border bg-surface2/50 px-3 py-2 text-[12.5px]">
                    <span className="w-[46px] shrink-0 font-mono text-muted2">{d.dia.slice(8)}/{d.dia.slice(5, 7)}</span>
                    <span className={`w-[52px] shrink-0 font-bold ${d.roas == null ? 'text-muted2' : d.roas >= 2 ? 'text-ok' : d.roas < 1.25 ? 'text-danger' : 'text-warn'}`}>
                      {d.roas != null ? d.roas.toFixed(2) : '—'}
                    </span>
                    <span className="flex-1 text-right text-muted">{money(d.spend, s)}</span>
                    <span className="w-[36px] shrink-0 text-right font-bold text-ink">{d.sales || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : aba === 'orc' ? (
          !info ? <div className="py-8 text-center text-[12.5px] text-muted2">carregando orçamento…</div>
          : !info.ok ? <div className="rounded-[10px] border border-danger/30 bg-danger/[0.07] p-3 text-[12.5px] text-danger">{info.error || 'não consegui ler o orçamento'}</div>
          : (
            <>
              <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface2 px-3.5 py-3 text-[13px]">
                <span className="text-muted2">Atual ({info.nivel}{info.nivel === 'ABO' ? ` · ${info.itens.length} conj.` : ''})</span>
                <b className="font-mono">{money(atual, s)}/dia</b>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[-30, -20, -10, 10, 20, 30, 50, 100].map((q) => (
                  <button key={q} onClick={() => { setModo('pct'); setPct(q) }}
                    className={`rounded-[9px] border py-2.5 text-[12.5px] font-bold ${modo === 'pct' && pct === q ? (q < 0 ? 'border-danger bg-danger/15 text-danger' : 'border-ok bg-ok/15 text-ok') : 'border-border text-muted'}`}>
                    {q > 0 ? '+' : ''}{q}%
                  </button>
                ))}
              </div>
              <input type="number" inputMode="decimal" value={abs} placeholder={`ou valor fixo (${money(atual, s)})`}
                onChange={(e) => { setModo('abs'); setAbs(e.target.value) }}
                className={`mt-2 h-[44px] w-full rounded-[10px] border bg-surface px-3 text-[13px] text-ink focus:outline-none ${modo === 'abs' ? 'border-ok/60' : 'border-border'}`} />
              <div className={`mt-2 flex items-center justify-between rounded-[10px] border px-3.5 py-3 ${novo >= (atual || 0) ? 'border-ok/30 bg-ok/[0.06]' : 'border-warn/30 bg-warn/[0.06]'}`}>
                <span className="text-[12.5px] text-muted">Novo orçamento</span>
                <b className={`font-mono text-[15px] ${novo >= (atual || 0) ? 'text-ok' : 'text-warn'}`}>{money(novo, s)}/dia</b>
              </div>
              <button onClick={aplicar} disabled={aplicando || !(novo > 0)}
                className="mt-3 w-full rounded-[10px] border border-ok/50 bg-ok/15 py-3.5 text-[13.5px] font-bold text-ok active:scale-[0.99] disabled:opacity-50">
                {aplicando ? 'Aplicando…' : 'Aplicar na Meta'}
              </button>
            </>
          )
        ) : (
          <PorHorario campId={r.id} />
        )}

        {/* ligar/desligar: fica no rodapé do painel, longe de um toque sem querer */}
        <div className="mt-4 border-t border-border pt-3">
          {confirmaPausa ? (
            <div className="flex gap-2">
              <button onClick={() => setConfirmaPausa(false)}
                className="flex-1 rounded-[10px] border border-border py-3 text-[13px] font-bold text-muted active:scale-[0.99]">Cancelar</button>
              <button onClick={() => mudarStatus('PAUSED')}
                className="flex-1 rounded-[10px] border border-danger/50 bg-danger/15 py-3 text-[13px] font-bold text-danger active:scale-[0.99]">Pausar mesmo</button>
            </div>
          ) : (
            <button onClick={() => (on ? setConfirmaPausa(true) : mudarStatus('ACTIVE'))} disabled={pausando}
              className={`flex w-full items-center justify-center gap-2 rounded-[10px] border py-3 text-[13px] font-bold active:scale-[0.99] disabled:opacity-50 ${
                on ? 'border-danger/35 text-danger' : 'border-ok/40 bg-ok/10 text-ok'
              }`}>
              {pausando ? <RefreshCw className="h-4 w-4 animate-spin" /> : on ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {pausando ? 'aplicando…' : on ? 'Pausar campanha' : 'Reativar campanha'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MobileCamps({ periodo, recarga = 0 }: { periodo: PeriodValue; recarga?: number }) {
  const log = useLog()
  const [status, setStatus] = useState('active')
  const [acc, setAcc] = useState('')
  const [busca, setBusca] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [ordem, setOrdem] = useState<Ordem>('roas')
  const [asc, setAsc] = useState(false)
  const [soMexidas, setSoMexidas] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [real, setReal] = useState<Record<string, Real>>({})
  const [contas, setContas] = useState<{ id: string; name: string }[]>([])
  const [params, setParams] = useState<Params | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  /** qual campanha está com o painel aberto, e em que aba ele abriu */
  const [detalhe, setDetalhe] = useState<{ r: Row; aba: 'vendas' | 'orc' | 'horario' } | null>(null)
  const [flash, setFlash] = useState<Record<string, string>>({})
  /** total de HOJE por campanha que teve aumento — alimenta o tracker */
  const [dias, setDias] = useState<Record<string, DiaWin>>({})

  const jan = useMemo(() => resolvePeriod(periodo), [periodo])

  /** vendas REAIS do gateway na janela + no dia de hoje, por campanha */
  async function carregarReal(): Promise<Record<string, Real>> {
    const sb = supabase()
    if (!sb) return {}
    const hojeIni = resolvePeriod({ id: 'today' }).sinceISO
    const desde = jan.sinceISO < hojeIni ? jan.sinceISO : hojeIni
    try {
      const orders = await fetchAll<{ utm_campaign: string | null; value: number | null; ordered_at: string | null }>(
        (from, to) =>
          sb.from('kirvano_orders')
            .select('utm_campaign,value,ordered_at')
            .eq('status', 'APPROVED')
            .gte('ordered_at', desde)
            .order('ordered_at', { ascending: false })
            .range(from, to),
      )
      const map: Record<string, Real> = {}
      for (const o of orders) {
        const id = campIdFromUtm(o.utm_campaign)
        if (!id || !o.ordered_at) continue
        const cur = map[id] || (map[id] = { sales: 0, revenue: 0, salesHoje: 0, revenueHoje: 0 })
        const v = o.value || 0
        if (o.ordered_at >= jan.sinceISO && o.ordered_at < jan.untilISO) { cur.sales += 1; cur.revenue += v }
        if (o.ordered_at >= hojeIni) { cur.salesHoje += 1; cur.revenueHoje += v }
      }
      return map
    } catch {
      return {}   // sem vendas reais o card cai no ROAS do Meta
    }
  }

  async function carregar() {
    setLoading(true)
    try {
      const q = new URLSearchParams({ fn: 'camps', status, ...jan.apiParams })
      if (acc) q.set('acc', acc)
      const [resp, mapaReal] = await Promise.all([
        apiFetch(`/api/mobile?${q}`).then((r) => r.json()),
        carregarReal(),
      ])
      setReal(mapaReal)
      if (!resp.ok) { setReason(resp.reason || 'falha ao carregar'); setRows([]) }
      else {
        setReason('')
        setRows(resp.rows || [])
        setContas(resp.contas || [])
        setParams(resp.params || null)
      }
    } catch (e: any) { setReason(e.message) }
    setLoading(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodo, status, acc, recarga])

  /* Total do dia SÓ das campanhas que tiveram aumento hoje — é o "depois" do
   * tracker. Buscar isso pra lista inteira seria uma chamada por campanha à
   * Meta; normalmente são poucas (as "mexidas hoje"). */
  useEffect(() => {
    const hoje = todayBR()
    const alvos = rows.filter((r) => increasesForDay(r.id, hoje).length > 0)
    if (!alvos.length) return
    let vivo = true
    setDias((d) => {
      const n = { ...d }
      for (const r of alvos) if (!n[r.id]) n[r.id] = { win: null, carregando: true }
      return n
    })
    ;(async () => {
      for (const r of alvos) {
        try {
          const j = await (await apiFetch(`/api/mobile?fn=camp-daily&id=${r.id}&acc=${r.accId}&dias=2`)).json()
          if (!vivo) return
          const d = (j.dias || []).find((x: any) => x.dia === hoje)
          // revenue reconstruído do ROAS, igual o desktop faz (getRevenue)
          const win: Win = d
            ? { spend: d.spend || 0, sales: d.sales || 0, revenue: (d.roas || 0) * (d.spend || 0) }
            : { spend: 0, sales: 0, revenue: 0 }
          setDias((prev) => ({ ...prev, [r.id]: { win, carregando: false } }))
        } catch {
          if (vivo) setDias((prev) => ({ ...prev, [r.id]: { win: null, carregando: false } }))
        }
      }
    })()
    return () => { vivo = false }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows, log])

  /* ── o que eu já mexi (log local, sem chamada extra) ── */
  const mexi = useMemo(() => {
    const lim = Date.now() - 7 * 86400000
    const hoje0 = new Date(resolvePeriod({ id: 'today' }).sinceISO).getTime()
    const m: Record<string, { n: number; ultima: number; delta: string | null; hoje: boolean }> = {}
    for (const e of log) {
      if (e.kind !== 'orcamento' || !e.campId) continue
      const t = new Date(e.ts).getTime()
      if (t < lim) continue
      const cur = m[e.campId] || (m[e.campId] = { n: 0, ultima: 0, delta: null, hoje: false })
      cur.n += 1
      if (t > cur.ultima) {
        cur.ultima = t
        cur.delta = e.budgetBefore != null && e.budgetAfter != null
          ? `${e.budgetBefore.toFixed(0)}→${e.budgetAfter.toFixed(0)}`
          : e.detail || null
      }
      if (t >= hoje0) cur.hoje = true
    }
    return m
  }, [log])

  /* MESMA conta da tabela do desktop (analyzeListaRows). Repetida aqui e não
   * importada porque lá ela vive dentro de um map sobre InsightRow, que o
   * celular não tem — o /api/mobile já devolve a linha pronta e em BRL.
   * Diferença pro rowFin: o faturamento do gateway JÁ é venda aprovada, então
   * não leva o fator de aprovação — só taxa de gateway e imposto. */
  const fx = params?.fx || 5.4
  const enriquecidas = useMemo(() => rows.map((r) => {
    const rl: Real | null = real[r.id] || null
    const FIN = loadFinParamsForAccount(r.accId)
    /* a conta do REAL é toda em BRL — o gateway só fala real. Por isso ela usa
       `r.spend` (convertido) e não `spendRaw`. Só no fim o resultado volta pra
       moeda da conta, que é como o desktop mostra. */
    const roasReal = rl && r.spend > 0 ? rl.revenue / r.spend : null
    const fatLiqReal = rl ? rl.revenue * (1 - (FIN.gateway + FIN.imposto) / 100) : 0
    const lucroRealBRL = rl ? fatLiqReal - r.spend - rl.sales * FIN.custoUn : null
    const margemReal = rl && fatLiqReal > 0 && lucroRealBRL != null ? lucroRealBRL / fatLiqReal : null
    return {
      ...r,
      real: rl,
      sym: simbolo(r.cur),
      roasReal,
      // ROAS e margem são razão: não têm moeda, atravessam a conversão intactos
      lucroReal: lucroRealBRL == null ? null : deBRL(lucroRealBRL, r.cur, fx),
      margemReal,
      gastoConta: r.spendRaw ?? r.spend,
      cpaConta: r.cpaRaw ?? null,
      // o que manda na decisão: o real quando existe, senão o do Meta
      roasDecisao: roasReal != null ? roasReal : r.roas,
      vendasReais: rl ? rl.sales : r.sales,
    }
  }), [rows, real, fx])

  type Enr = typeof enriquecidas[number]

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    let out: Enr[] = enriquecidas
    if (b) out = out.filter((r) => r.name.toLowerCase().includes(b))
    if (soMexidas) out = out.filter((r) => !!mexi[r.id])
    const dir = asc ? 1 : -1
    const val = (r: Enr) =>
      ordem === 'roas' ? (r.roasDecisao == null ? -1 : r.roasDecisao)
      : ordem === 'vendas' ? (r.real ? r.real.salesHoje : 0)
      : ordem === 'gasto' ? r.spend
      : (r.budget == null ? -1 : r.budget)
    return [...out].sort((a, b2) => (val(a) - val(b2)) * dir)
  }, [enriquecidas, busca, soMexidas, mexi, ordem, asc])

  const corRoas = (v: number | null) => {
    if (v == null || !params) return 'text-muted2'
    if (v >= params.roasGood) return 'text-ok'
    if (v < params.roasBe) return 'text-danger'
    return 'text-warn'
  }
  const ativa = (s: string | null) => (s || '').toUpperCase() === 'ACTIVE'

  /** confirmação VISÍVEL no card: sem isso não dá pra saber se o ajuste pegou */
  function avisarOrcamento(campId: string, antes: number | null, depois: number) {
    const a = antes != null ? Number(antes).toFixed(0) : '?'
    const d = Number(depois).toFixed(0)
    setFlash((f) => ({ ...f, [campId]: `orçamento ${a} → ${d} aplicado` }))
    setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[campId]; return n }), 10000)
  }

  const chip = (ativo: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-bold transition active:scale-[0.97] ${
      ativo ? 'border-brand bg-brand text-brand-ink' : 'border-border bg-surface text-muted'
    }`

  return (
    <>
      {/* ordenar + filtros rápidos, tudo em chip de 1 toque */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={() => setAsc((v) => !v)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-bold text-muted active:scale-[0.97]">
          <ArrowUpDown className="h-3.5 w-3.5" />{asc ? 'menor' : 'maior'}
        </button>
        {ORDENS.map(([id, lb]) => (
          <button key={id} onClick={() => setOrdem(id)} className={chip(ordem === id)}>{lb}</button>
        ))}
        <button onClick={() => setSoMexidas((v) => !v)} className={chip(soMexidas)}>
          <Zap className="mr-1 inline h-3.5 w-3.5" />Mexi no orçamento
        </button>
        <button onClick={() => setFiltrosAbertos((v) => !v)} className={chip(filtrosAbertos)}>
          <Filter className="mr-1 inline h-3.5 w-3.5" />Mais
        </button>
      </div>

      {filtrosAbertos && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl2 border border-border bg-surface p-3">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={SEL}>
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted2">Conta</label>
          <select value={acc} onChange={(e) => setAcc(e.target.value)} className={SEL}>
            <option value="">Todas as contas</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome"
              className="h-[44px] w-full rounded-[10px] border border-border bg-surface pl-9 pr-9 text-[13px] text-ink focus:border-brand focus:outline-none" />
            {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted2"><X className="h-4 w-4" /></button>}
          </div>
        </div>
      )}

      {/* Os avisos por conta ("conta não identificada") saíram: eram um bloco
          vermelho permanente no topo, sobre contas que nem estão em uso. O que
          ainda precisa aparecer é a falha que zera a lista — e essa cabe no
          próprio vazio, embaixo, sem roubar a primeira tela. */}

      {/* lista */}
      <div className="mt-3 flex flex-col gap-2">
        {loading && rows.length === 0 ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[150px] animate-pulse rounded-xl2 border border-border bg-surface" />)
        ) : filtradas.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-border px-4 py-12 text-center text-[13px] text-muted2">
            {reason || 'Nenhuma campanha com esses filtros.'}
          </div>
        ) : (
          filtradas.map((r) => {
            const on = ativa(r.status)
            const mx = mexi[r.id]
            return (
              <div key={`${r.accId}-${r.id}`} className="rounded-xl2 border border-border bg-surface p-3.5">
                {/* topo: nome numa linha só + o ROAS que decide.
                    O nome de campanha aqui vem com prefixo de conta, data e id
                    colados; em duas linhas ele empurrava todo o resto do card
                    pra baixo e mesmo assim não cabia inteiro. Uma linha com
                    reticências é mais honesto — quem precisa do nome completo
                    abre o painel, que mostra em duas linhas. */}
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold leading-snug text-ink">{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-ok' : 'bg-muted2'}`} />
                      <span className="truncate">{r.accName}{r.status && ` · ${on ? 'ativa' : r.status.toLowerCase()}`}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-[24px] font-extrabold leading-none ${corRoas(r.roasDecisao)}`}>
                      {r.roasDecisao != null ? r.roasDecisao.toFixed(2) : '—'}
                    </div>
                    <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted2">
                      {r.roasReal != null ? 'roas real' : 'roas meta'}
                    </div>
                  </div>
                </div>

                {/* as mesmas colunas da tabela do desktop, na mesma ordem:
                    V. reais · CPA · Lucro real — e embaixo gasto e margem,
                    que são o contexto e não a decisão */}
                <div className="mt-2.5 flex items-baseline gap-x-3 border-t border-border/60 pt-2.5 text-[13px]">
                  <span className="whitespace-nowrap">
                    <b className="font-bold text-ink">{r.vendasReais || 0}</b>
                    <span className="ml-1 text-[11px] text-muted2">v. reais</span>
                  </span>
                  <span className="whitespace-nowrap">
                    {/* cpaMax dos Parâmetros está na moeda da conta (o desktop
                        compara com o valor exibido) — comparar com o BRL aqui
                        pintaria toda conta em dólar de vermelho */}
                    <b className={`font-bold ${r.cpaConta == null ? 'text-muted2' : params && r.cpaConta <= params.cpaMax ? 'text-ok' : 'text-danger'}`}>
                      {r.cpaConta != null ? moneyCurto(r.cpaConta, r.sym) : '—'}
                    </b>
                    <span className="ml-1 text-[11px] text-muted2">cpa</span>
                  </span>
                  <span className="ml-auto whitespace-nowrap">
                    <b className={`font-bold ${r.lucroReal == null ? 'text-muted2' : r.lucroReal >= 0 ? 'text-ok' : 'text-danger'}`}>
                      {r.lucroReal == null ? '—' : (r.lucroReal >= 0 ? '' : '−') + moneyCurto(Math.abs(r.lucroReal), r.sym)}
                    </b>
                    <span className="ml-1 text-[11px] text-muted2">lucro real</span>
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-x-3 text-[11px] text-muted2">
                  <span className="whitespace-nowrap">gasto <b className="font-semibold text-muted">{moneyCurto(r.gastoConta, r.sym)}</b></span>
                  {r.margemReal != null && (
                    <span className="ml-auto whitespace-nowrap">
                      margem <b className={`font-semibold ${r.margemReal >= 0 ? 'text-muted' : 'text-danger'}`}>{(r.margemReal * 100).toFixed(0)}%</b>
                    </span>
                  )}
                </div>

                {/* o que o aumento de hoje trouxe — mesma leitura do desktop */}
                <TrackerAumento r={r} win={dias[r.id] || { win: null, carregando: false }} sym={r.sym} />

                {/* confirmação do ajuste que acabei de fazer */}
                {flash[r.id] && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-[9px] border border-ok/40 bg-ok/[0.12] px-3 py-2 text-[12px] font-bold text-ok">
                    <Check className="h-4 w-4 shrink-0" /> {flash[r.id]}
                  </div>
                )}

                {/* o que eu já mexi nela */}
                {mx && !flash[r.id] && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-[9px] border border-brand/25 bg-brand/[0.07] px-3 py-1.5 text-[11.5px] text-brand-2">
                    <Zap className="h-3.5 w-3.5 shrink-0" />
                    mexi {mx.n}× em 7d{mx.delta ? ` · ${mx.delta}` : ''}{mx.hoje ? ' · hoje' : ''}
                  </div>
                )}

                {/* os MESMOS três da tira de ícones do desktop, na mesma ordem:
                    gráfico (escala/vendas), cifrão (ajustar orçamento pra cima
                    ou pra baixo) e o relógio de histórico, esse em quadrado */}
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => setDetalhe({ r, aba: 'vendas' })}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface2/60 py-2.5 text-[12px] font-semibold text-muted active:scale-[0.99]">
                    <BarChart3 className="h-4 w-4 text-brand-2" /> Vendas
                  </button>
                  <button onClick={() => setDetalhe({ r, aba: 'orc' })}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-ok/40 bg-ok/[0.08] py-2.5 text-[12px] font-bold text-ok active:scale-[0.99]">
                    <DollarSign className="h-4 w-4" /> Orçamento
                  </button>
                  <button onClick={() => setDetalhe({ r, aba: 'horario' })} aria-label="vendas por horário"
                    className="flex w-[46px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface2/60 active:scale-[0.97]">
                    <Clock className="h-4 w-4 text-muted" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {detalhe && (
        <Detalhe
          r={detalhe.r}
          abaInicial={detalhe.aba}
          onClose={() => setDetalhe(null)}
          onBudget={(novo, antes) => {
            setRows((prev) => prev.map((x) => (x.id === detalhe.r.id ? { ...x, budget: novo } : x)))
            avisarOrcamento(detalhe.r.id, antes, novo)
          }}
          onStatus={(st) => {
            setRows((prev) => prev.map((x) => (x.id === detalhe.r.id ? { ...x, status: st } : x)))
            setDetalhe((d) => (d ? { ...d, r: { ...d.r, status: st } } : d))
          }}
        />
      )}
    </>
  )
}
