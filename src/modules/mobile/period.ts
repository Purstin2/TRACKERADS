/* Período do app no celular — uma fonte só pras 3 abas (Vendas, Campanhas,
 * Dashboard). Antes cada aba tinha a sua: Vendas e Dashboard eram fixas em
 * "hoje" e Campanhas tinha um <select> próprio.
 *
 * Tudo aqui trabalha no DIA COMERCIAL BR (UTC-3), igual ao resto do sistema:
 * uma venda das 22h de SP pertence ao dia de SP, não ao dia UTC seguinte.
 *
 * Janela = [sinceISO, untilISO) — fim EXCLUSIVO, pra comparação com
 * `ordered_at` do Supabase não pegar meia-noite do dia seguinte.
 *
 * O Meta trabalha com dia inteiro (YYYY-MM-DD), então cada preset também
 * carrega os parâmetros que a API do Meta entende (via /api/mobile). */

export const BR_OFFSET_MS = 3 * 3600000

export type PeriodId =
  | 'today' | 'yesterday' | 'day_before_yesterday'
  | 'last_4d' | 'last_7d' | 'last_30d' | 'last_90d'
  | 'custom'

export interface PeriodValue {
  id: PeriodId
  /** só quando id === 'custom' — datas YYYY-MM-DD no fuso BR */
  since?: string
  until?: string
}

export const PERIOD_LABEL: Record<PeriodId, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  day_before_yesterday: 'Anteontem',
  last_4d: '4 dias',
  last_7d: '7 dias',
  last_30d: '30 dias',
  last_90d: '90 dias',
  custom: 'Personalizado',
}

/** ordem dos chips na tela */
export const PERIOD_CHIPS: PeriodId[] = [
  'today', 'yesterday', 'day_before_yesterday', 'last_4d', 'last_7d', 'last_30d', 'last_90d',
]

/** "agora" deslocado pro fuso BR, pra poder usar getUTC* como se fosse local BR */
const brNow = () => new Date(Date.now() - BR_OFFSET_MS)

/** Date (já em BR) → 'YYYY-MM-DD' */
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' (dia BR) → ISO do INÍCIO desse dia, em UTC real */
export function brDayStartISO(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + BR_OFFSET_MS).toISOString()
}

/** dia BR + n dias → 'YYYY-MM-DD' */
function addDays(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + n)
  return ymd(t)
}

export const hojeBR = () => ymd(brNow())

export interface Janela {
  /** primeiro dia BR do período (YYYY-MM-DD) */
  diaSince: string
  /** último dia BR do período, INCLUSIVO (YYYY-MM-DD) */
  diaUntil: string
  /** início da janela em ISO/UTC */
  sinceISO: string
  /** fim EXCLUSIVO da janela em ISO/UTC (00h do dia seguinte ao diaUntil) */
  untilISO: string
  label: string
  /** querystring pro /api/mobile (o backend traduz pro Meta) */
  apiParams: Record<string, string>
}

/** Resolve o período escolhido numa janela concreta.
 *
 * ⚠ Regra herdada do desktop (src/lib/meta.ts): "últimos N dias" NÃO inclui
 * hoje — hoje é um dia incompleto e misturá-lo com dias fechados distorce a
 * média. "Hoje" é um preset separado justamente por isso. */
export function resolvePeriod(p: PeriodValue): Janela {
  const hoje = hojeBR()
  let diaSince = hoje
  let diaUntil = hoje

  switch (p.id) {
    case 'today':
      break
    case 'yesterday':
      diaSince = diaUntil = addDays(hoje, -1)
      break
    case 'day_before_yesterday':
      diaSince = diaUntil = addDays(hoje, -2)
      break
    case 'custom': {
      // aceita invertido (usuário escolhe fim antes do início)
      const a = p.since || hoje
      const b = p.until || hoje
      diaSince = a <= b ? a : b
      diaUntil = a <= b ? b : a
      break
    }
    default: {
      const n = parseInt(/^last_(\d+)d$/.exec(p.id)?.[1] || '7', 10)
      diaUntil = addDays(hoje, -1)      // ontem
      diaSince = addDays(hoje, -n)      // n dias atrás
    }
  }

  const label =
    p.id === 'custom'
      ? diaSince === diaUntil
        ? fmtBR(diaSince)
        : `${fmtBR(diaSince)} – ${fmtBR(diaUntil)}`
      : PERIOD_LABEL[p.id]

  return {
    diaSince,
    diaUntil,
    sinceISO: brDayStartISO(diaSince),
    untilISO: brDayStartISO(addDays(diaUntil, 1)),   // exclusivo
    label,
    apiParams:
      p.id === 'custom'
        ? { preset: 'custom', since: diaSince, until: diaUntil }
        : { preset: p.id },
  }
}

/** 'YYYY-MM-DD' → 'DD/MM' */
export const fmtBR = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

/** quantos dias a janela cobre (pra dividir médias por dia) */
export function diasNaJanela(j: Janela): number {
  const ms = new Date(j.untilISO).getTime() - new Date(j.sinceISO).getTime()
  return Math.max(1, Math.round(ms / 86400000))
}
