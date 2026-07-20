import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { X, ArrowRight, Activity, Lock } from 'lucide-react'
import { useMonitor } from './MonitorContext'
import { increasesForDay, impactDays, todayBR, useLog } from './actionLog'
import { fetchCampDaily, getRevenue, getSales } from '@/lib/meta'
import { loadFinParamsForAccount, rowFin } from './finance'
import { curSym } from './config'
import {
  ZERO,
  buildCards,
  cpaOf,
  daysBack,
  dmFmt,
  hourBR,
  nowBR,
  roasOf,
  verdictOf,
  type TrackCard,
  type Win,
} from './trackerMath'

/* ── Tracker do aumento de orçamento (a tela; as contas estão em trackerMath) ──
 * Ao aumentar o orçamento, o log guarda a FOTO do momento (gasto/vendas/ROAS acumulados
 * do dia até ali). A partir dessa foto:
 *   • ANTES  = do aumento anterior (ou 00:00) até o aumento → CONGELADO, nunca muda.
 *   • DEPOIS = do aumento até o próximo aumento (ou até agora) → AO VIVO até as 24h.
 * Aumentou de novo no mesmo dia? O card anterior fecha com o resultado que deu e nasce
 * um card novo no topo, trackando o novo nível de orçamento. Vira o dia: tudo congela
 * e o veredito (verde/vermelho) fica salvo pra sempre. */

/* ── total do dia (fecha a janela "depois" do último aumento) ──
 * Cache com TTL de 3min embutido na chave: várias linhas da tabela pedem o mesmo dia
 * da mesma campanha e sai 1 request só. */
const dayCache = new Map<string, Promise<Win>>()
function fetchDayWin(accId: string, campId: string, day: string, token: string): Promise<Win> {
  const k = `${accId}|${campId}|${day}|${Math.floor(Date.now() / 180000)}`
  let p = dayCache.get(k)
  if (!p) {
    if (dayCache.size > 200) dayCache.clear()
    p = fetchCampDaily(accId, campId, token, daysBack(day, todayBR())).then((rows: any[]) => {
      const row = (rows || []).find((r) => (r.date_start as string) === day)
      return row ? { spend: parseFloat(row.spend || '0'), sales: getSales(row), revenue: getRevenue(row) || 0 } : ZERO
    })
    dayCache.set(k, p)
    p.catch(() => dayCache.delete(k))
  }
  return p
}

function useDayWin(accId: string, campId: string, day: string, enabled: boolean) {
  const m = useMonitor()
  const tok = m.token.trim()
  const [st, setSt] = useState<{ win: Win | null; loading: boolean; err: string }>({ win: null, loading: enabled, err: '' })
  useEffect(() => {
    if (!enabled || !tok) { setSt({ win: null, loading: false, err: '' }); return }
    let alive = true
    setSt((p) => ({ ...p, loading: true, err: '' }))
    fetchDayWin(accId, campId, day, tok)
      .then((w) => alive && setSt({ win: w, loading: false, err: '' }))
      .catch((e) => alive && setSt({ win: null, loading: false, err: e.message || 'falha ao buscar o dia' }))
    return () => { alive = false }
  }, [accId, campId, day, enabled, tok])
  return st
}

const VCLS = (ok: boolean | null) => (ok == null ? 'bg-surface2 text-muted' : ok ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger')
const VTXT = (ok: boolean | null) => (ok == null ? 'text-muted' : ok ? 'text-ok' : 'text-danger')

/* ── painel de uma janela (antes / depois) ── */
function WinPanel({
  title, sub, w, sym, accId, live, dim,
}: { title: string; sub: string; w: Win; sym: string; accId: string; live?: boolean; dim?: boolean }) {
  const roas = roasOf(w)
  const cpa = cpaOf(w)
  const { lucro } = rowFin(w.spend, w.revenue, w.sales, loadFinParamsForAccount(accId))
  const vazio = w.spend <= 0
  return (
    <div className={`flex-1 rounded-[10px] border px-3 py-2.5 ${live ? 'border-brand/40 bg-brand/[0.05]' : 'border-border bg-surface2/40'} ${dim ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wide ${live ? 'text-brand-2' : 'text-muted2'}`}>{title}</span>
        {live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-1.5 py-px text-[9px] font-bold text-brand-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-2" /> ao vivo
          </span>
        ) : (
          <Lock className="h-2.5 w-2.5 text-muted2" />
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-muted2">{sub}</div>
      {vazio ? (
        <div className="py-3 text-[12px] text-muted2">sem gasto nessa janela</div>
      ) : (
        <>
          <div className={`mt-1.5 text-[24px] font-extrabold leading-none ${lucro >= 0 ? 'text-ok' : 'text-danger'}`}>
            {lucro >= 0 ? '+' : '−'}{sym}{Math.abs(lucro).toFixed(2)}
          </div>
          <div className="text-[10px] text-muted2">lucro</div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
            <span className="text-muted">ROAS <b className="font-mono text-ink">{roas != null ? roas.toFixed(2) : '—'}</b></span>
            <span className="text-muted">Vendas <b className="font-mono text-ink">{w.sales}</b></span>
            <span className="text-muted">Gasto <b className="font-mono text-ink">{sym}{w.spend.toFixed(2)}</b></span>
            <span className="text-muted">CPA <b className="font-mono text-ink">{cpa != null ? sym + cpa.toFixed(2) : '—'}</b></span>
          </div>
        </>
      )}
    </div>
  )
}

/* ── card de um aumento ── */
function Card({ c, sym, accId, loading }: { c: TrackCard; sym: string; accId: string; loading: boolean }) {
  // mesmo rowFin do painel → o lucro do veredito é o MESMO número mostrado embaixo
  const { lucro: lucroDepois } = rowFin(c.after.spend, c.after.revenue, c.after.sales, loadFinParamsForAccount(accId))
  const v = verdictOf(c, lucroDepois)
  const rb = roasOf(c.before), ra = roasOf(c.after)
  const e = c.e
  return (
    <div className={`rounded-xl2 border ${c.live ? 'border-brand/40' : 'border-border'} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface2 px-3 py-2">
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${c.live ? 'bg-brand/15 text-brand-2' : 'bg-surface2 text-muted2'}`}>
          Aumento {c.n}
        </span>
        <span className="text-[12px] text-muted">
          Você aumentou o orçamento às <b className="text-ink">{hourBR(e.ts)}</b> de <b className="text-ink">{dmFmt(e.dateBR || todayBR(new Date(e.ts)))}</b>
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[12px] font-bold text-ink">
          {sym}{(e.budgetBefore ?? 0).toFixed(0)} <ArrowRight className="h-3 w-3 text-ok" /> {sym}{(e.budgetAfter ?? 0).toFixed(0)}
          {c.pct != null && <span className="text-[10.5px] font-semibold text-ok">({c.pct >= 0 ? '+' : ''}{c.pct.toFixed(0)}%)</span>}
        </span>
        {!c.live && <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-muted2"><Lock className="h-2.5 w-2.5" /> fechado</span>}
      </div>

      {v ? (
        /* O que decide: VENDAS trazidas + LUCRO. ROAS fica embaixo, como contexto. */
        <div className={`px-3 py-2.5 text-center ${VCLS(v.ok)}`}>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
            <span className="text-[13px] font-extrabold">
              {v.ok == null ? '➖' : v.ok ? '✅' : '❌'} {v.vendas > 0 ? `+${v.vendas} venda${v.vendas > 1 ? 's' : ''}` : 'nenhuma venda'}
            </span>
            <span className="text-[15px] font-extrabold">
              {v.lucro >= 0 ? '+' : '−'}{sym}{Math.abs(v.lucro).toFixed(2)} <span className="text-[11px] font-semibold opacity-80">de lucro</span>
            </span>
          </div>
          <div className="mt-0.5 text-[11px] font-medium opacity-80">{v.txt}</div>
          {(rb != null || ra != null) && (
            <div className="mt-1 text-[10.5px] font-normal opacity-70">
              ROAS {rb != null ? rb.toFixed(2) : '—'} → {ra != null ? ra.toFixed(2) : '—'} · contexto, não é o veredito
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-2 text-center text-[11.5px] text-muted2">
          {loading ? 'buscando o resultado no Meta…' : 'ainda sem gasto depois do aumento — aguardando os primeiros dados'}
        </div>
      )}

      <div className="flex flex-col gap-2 p-3 sm:flex-row">
        <WinPanel title="Antes do aumento" sub={`${c.fromLbl} → ${hourBR(e.ts)}`} w={c.before} sym={sym} accId={accId} dim />
        <WinPanel
          title="Resultado pós aumento"
          sub={`${hourBR(e.ts)} → ${c.toLbl}${c.live ? '' : ' (encerrado)'}`}
          w={c.after}
          sym={sym}
          accId={accId}
          live={c.live}
        />
      </div>
    </div>
  )
}

/* ── modal ── */
export function BudgetTrackerModal({ accId, name, campId, cur, onClose }: { accId: string; name: string; campId: string; cur: string; onClose: () => void }) {
  const m = useMonitor()
  const log = useLog()
  const sym = curSym(cur)
  const days = useMemo(() => impactDays(campId), [campId, log])
  const [day, setDay] = useState(days[0] || todayBR())
  const incs = increasesForDay(campId, day)
  const { win, loading, err } = useDayWin(accId, campId, day, incs.length > 0)
  const cards = buildCards(incs, win, day, todayBR())
  const aberto = day === todayBR()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-[680px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-bold" title={name}>📈 Tracker do aumento de orçamento</h3>
            <div className="truncate text-[11px] text-muted2" title={name}>{name}</div>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="card-body flex flex-col gap-3">
          {days.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted2">Dia:</span>
              {days.map((d) => (
                <button
                  key={d}
                  onClick={() => setDay(d)}
                  className={`rounded-[7px] border px-2 py-1 text-[11px] font-semibold ${d === day ? 'border-brand bg-brand/10 text-brand-2' : 'border-border text-muted2 hover:border-brand/40'}`}
                >
                  {dmFmt(d)}{d === todayBR() ? ' · hoje' : ''}
                </button>
              ))}
            </div>
          )}

          {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>}

          <p className="text-[11px] text-muted2">
            <b>Antes</b> fica congelado pra sempre. <b>Resultado pós aumento</b> atualiza sozinho até as 24h —
            {aberto ? <> agora mostra até <b className="text-muted">{nowBR()}</b>.</> : <> este dia já fechou.</>}
            {' '}Aumentou de novo no mesmo dia? O card antigo fecha com o resultado dele e o novo entra no topo.
          </p>

          {cards.map((c) => (
            <Card key={c.e.id} c={c} sym={sym} accId={accId} loading={loading} />
          ))}

          {!incs.length && (
            <div className="rounded-[8px] border border-border bg-surface2/40 px-3 py-8 text-center text-[12px] text-muted2">
              Nenhum aumento de orçamento registrado neste dia.<br />
              <span className="text-[11px]">Use <b>Ações → Ajustar orçamento</b> — a partir daí o tracker acompanha sozinho.</span>
            </div>
          )}

          <p className="text-[10px] text-muted2">
            Gasto e vendas vêm do Meta (total do dia). O faturamento da janela "antes" usa o ROAS da foto do momento do aumento;
            o lucro aplica as taxas da aba <b>Taxas</b> desta conta.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Botão que abre o tracker — só aparece se a campanha tem aumento registrado. */
export function TrackerBtn({ accId, name, campId, cur }: { accId: string; name: string; campId: string; cur: string }) {
  useLog()
  const [open, setOpen] = useState(false)
  if (!impactDays(campId).length) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Tracker do aumento: antes × depois do aumento de orçamento"
        className="inline-flex items-center gap-0.5 rounded border border-brand/40 bg-brand/5 px-1.5 py-0.5 text-[10px] font-bold text-brand-2 hover:bg-brand/15"
      >
        <Activity className="h-3 w-3" /> tracker
      </button>
      {open && <BudgetTrackerModal accId={accId} name={name} campId={campId} cur={cur} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Resumo compacto do aumento de HOJE pra célula da tabela (Lista e Histórico).
 *  Clique abre o tracker completo. Sem aumento hoje → renderiza `empty`. */
export function TrackerCell({ accId, name, campId, cur, empty = null }: { accId: string; name: string; campId: string; cur: string; empty?: ReactNode }) {
  useLog()
  const m = useMonitor()
  const [open, setOpen] = useState(false)
  const day = todayBR()
  const incs = increasesForDay(campId, day)
  const { win, loading } = useDayWin(accId, campId, day, incs.length > 0)
  const sym = curSym(cur)

  if (!incs.length) return <>{empty}</>

  const cards = buildCards(incs, win, day, todayBR())
  const c = cards[0] // o aumento mais recente do dia
  const { lucro: lucroDepois } = rowFin(c.after.spend, c.after.revenue, c.after.sales, loadFinParamsForAccount(accId))
  const v = verdictOf(c, lucroDepois)
  const ra = roasOf(c.after)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`${v ? v.txt + ` · ROAS depois ${ra != null ? ra.toFixed(2) : '—'} · ` : ''}clique pra abrir o tracker completo`}
        className="whitespace-nowrap text-left text-[10.5px] leading-tight hover:opacity-70"
      >
        <div className="font-mono font-semibold text-ink">
          {sym}{(c.e.budgetBefore ?? 0).toFixed(0)}<span className="text-ok"> → </span>{sym}{(c.e.budgetAfter ?? 0).toFixed(0)}
          {incs.length > 1 && <span className="text-muted2"> ({incs.length}×)</span>}
        </div>
        {/* o que o aumento TROUXE: vendas e lucro (ROAS só no tooltip) */}
        <div className={`flex items-center gap-1 font-mono font-semibold ${VTXT(v?.ok ?? null)}`}>
          {v ? (
            <>
              <span>+{v.vendas}v</span>
              <span>·</span>
              <span>{v.lucro >= 0 ? '+' : '−'}{sym}{Math.abs(v.lucro).toFixed(0)}</span>
              <span>{v.ok == null ? '➖' : v.ok ? '✅' : '❌'}</span>
            </>
          ) : (
            <span className="text-muted2">{loading ? '…' : 'aguardando'}</span>
          )}
        </div>
        <div className="text-[9.5px] text-muted2">{hourBR(c.e.ts)} · {c.live ? 'ao vivo' : 'fechado'}</div>
      </button>
      {open && <BudgetTrackerModal accId={accId} name={name} campId={campId} cur={cur} onClose={() => setOpen(false)} />}
    </>
  )
}
