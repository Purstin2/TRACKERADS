import type { ActionEntry } from './actionLog'

/* ── Matemática do tracker de aumento de orçamento (pura, sem React) ──
 * Fica separada da tela porque é ela que decide se um aumento foi bom ou ruim —
 * dá pra ler, testar e conferir na mão sem subir a interface.
 *
 * A ideia: cada aumento guarda a FOTO do acumulado do dia no instante em que
 * aconteceu (spendAtTime/salesAtTime/roasAtTime). Subtraindo fotos vizinhas sai a
 * janela isolada de cada nível de orçamento:
 *   ANTES(n)  = foto(n) − foto(n−1)      (ou a foto inteira, no 1º aumento do dia)
 *   DEPOIS(n) = foto(n+1) − foto(n)      (ou o total do dia − foto(n), no último)
 * Por isso o "antes" nunca muda e o "depois" do último aumento anda sozinho até as 24h. */

export interface Win { spend: number; sales: number; revenue: number }
export const ZERO: Win = { spend: 0, sales: 0, revenue: 0 }

/** Foto do momento do aumento. O faturamento é reconstruído do ROAS da foto. */
export const snapOf = (e: ActionEntry): Win => ({
  spend: e.spendAtTime || 0,
  sales: e.salesAtTime || 0,
  revenue: e.spendAtTime != null && e.roasAtTime != null ? e.spendAtTime * e.roasAtTime : 0,
})
export const sub = (a: Win, b: Win): Win => ({
  spend: Math.max(0, a.spend - b.spend),
  sales: Math.max(0, a.sales - b.sales),
  revenue: Math.max(0, a.revenue - b.revenue),
})
export const roasOf = (w: Win) => (w.spend > 0 ? w.revenue / w.spend : null)
export const cpaOf = (w: Win) => (w.sales > 0 ? w.spend / w.sales : null)

export const hourBR = (ts: string) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
export const dmFmt = (d: string) => d.slice(8) + '/' + d.slice(5, 7)
export const nowBR = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** Janela a pedir pro Meta pra garantir que `day` (dia BR) esteja dentro dela.
 *  O fetchCampDaily monta o range em UTC: das 21h à meia-noite o "hoje" UTC já é
 *  amanhã, então vai 1 dia de margem — a linha certa é casada por date_start. */
export const daysBack = (day: string, today: string) =>
  Math.max(2, Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000) + 2)

export interface TrackCard {
  e: ActionEntry
  n: number            // 1 = primeiro aumento do dia
  before: Win          // congelado pra sempre
  after: Win           // ao vivo enquanto `live`
  live: boolean        // último aumento de um dia ainda aberto → anda até as 24h
  pct: number | null   // % do aumento
  fromLbl: string      // início da janela "antes"
  toLbl: string        // fim da janela "depois"
}

/** Cards do dia, MAIS NOVO PRIMEIRO. `eod` = total do dia (null enquanto carrega).
 *  `incs` precisa vir em ordem cronológica (é o que increasesForDay devolve). */
export function buildCards(incs: ActionEntry[], eod: Win | null, day: string, today: string): TrackCard[] {
  const aberto = day === today
  return incs
    .map((e, i) => {
      const isLast = i === incs.length - 1
      const prev = i > 0 ? snapOf(incs[i - 1]) : ZERO
      const next = isLast ? eod ?? snapOf(e) : snapOf(incs[i + 1])
      const b = e.budgetBefore, a = e.budgetAfter
      return {
        e,
        n: i + 1,
        before: sub(snapOf(e), prev),
        after: sub(next, snapOf(e)),
        live: isLast && aberto,
        pct: b != null && a != null && b > 0 ? ((a - b) / b) * 100 : null,
        fromLbl: i > 0 ? hourBR(incs[i - 1].ts) : '00:00',
        toLbl: isLast ? (aberto ? nowBR() : '24:00') : hourBR(incs[i + 1].ts),
      }
    })
    .reverse()
}

export interface Verdict {
  ok: boolean | null
  vendas: number // vendas que ENTRARAM depois do aumento
  lucro: number  // lucro real da janela depois (já com taxas)
  txt: string
}

/** Verde/vermelho do aumento: decide por VENDAS TRAZIDAS e LUCRO REAL — não por % de ROAS.
 *
 *  Por que não ROAS: aumentar orçamento quase sempre derruba o ROAS um pouco (você
 *  compra tráfego mais caro na margem). Julgar por isso marcava como ❌ aumento que
 *  trouxe venda e deu lucro — que é exatamente o que a gente queria que acontecesse.
 *  A pergunta certa é: "o que gastei DEPOIS do aumento voltou com lucro?".
 *  O ROAS continua visível no painel, mas como contexto, não como juiz.
 *
 *  `lucroDepois` vem de fora (rowFin da conta) pra bater com o número que o painel mostra. */
export function verdictOf(c: TrackCard, lucroDepois: number): Verdict | null {
  const a = c.after
  if (a.spend <= 0) return null // ainda não gastou depois do aumento
  const base = { vendas: a.sales, lucro: lucroDepois }
  if (a.sales === 0) return { ...base, ok: false, txt: 'Gastou depois do aumento e ainda não vendeu' }
  const v = `${a.sales} venda${a.sales > 1 ? 's' : ''}`
  if (lucroDepois > 0.005) return { ...base, ok: true, txt: `Trouxe ${v} e deu lucro depois do aumento` }
  if (lucroDepois < -0.005) return { ...base, ok: false, txt: `Trouxe ${v}, mas o gasto não se pagou` }
  return { ...base, ok: null, txt: `Trouxe ${v} e empatou` }
}
