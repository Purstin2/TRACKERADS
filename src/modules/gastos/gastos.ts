/* Gastos operacionais recorrentes — as assinaturas que sustentam a operação.
 *
 * Modelo: cada gasto tem um DIA do mês (recorrência mensal), e o "pago" é
 * guardado POR MÊS (`pagos: ['2026-08', ...]`). Assim:
 *   · em setembro tudo volta a aparecer como pendente sozinho, sem eu ter que
 *     "desmarcar" nada — que é o erro clássico de checklist de recorrência;
 *   · o histórico fica: dá pra ver que agosto foi pago mesmo depois de virar.
 *
 * Persistência no app_state (chave `gastos_v1`), igual ao resto das configs. */

export const GASTOS_KEY = 'gastos_v1'

export interface Gasto {
  id: string
  nome: string
  /** null = valor variável (uso), preenche quando souber */
  valor: number | null
  /** dia do vencimento (1–31). Mês curto: cai no último dia. */
  dia: number
  /** em qual conta/titular está */
  conta?: string
  /** o que eu preciso lembrar toda vez que essa cobrança chega */
  obs?: string
  /** painel de cobrança */
  url?: string
  ativo: boolean
  /** meses quitados, formato 'YYYY-MM' */
  pagos: string[]
  /** anotação daquele mês: 'troquei de conta', 'estourou o limite', … */
  notas?: Record<string, string>
}

export interface GastosState {
  itens: Gasto[]
}

/* ── datas no dia comercial BR (mesma régua do resto do sistema) ── */
const BR_OFFSET_MS = 3 * 3600000
const brNow = () => new Date(Date.now() - BR_OFFSET_MS)

/** 'YYYY-MM' do mês corrente */
export function mesAtual(): string {
  const d = brNow()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' + n meses */
export function somaMes(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function rotuloMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[m - 1]}/${String(y).slice(2)}`
}

/** dia do vencimento dentro do mês, já tratando mês curto (31 → 28/30) */
export function diaVenc(dia: number, mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Math.min(Math.max(1, dia), ultimo)
}

/** quantos dias faltam pro vencimento nesse mês (negativo = atrasado) */
export function diasAte(dia: number, mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  const venc = Date.UTC(y, m - 1, diaVenc(dia, mes))
  const hoje = brNow()
  const hj = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  return Math.round((venc - hj) / 86400000)
}

export type Situacao = 'pago' | 'atrasado' | 'hoje' | 'proximo' | 'futuro'

export function situacao(g: Gasto, mes: string): Situacao {
  if (g.pagos.includes(mes)) return 'pago'
  const d = diasAte(g.dia, mes)
  if (d < 0) return 'atrasado'
  if (d === 0) return 'hoje'
  return d <= 5 ? 'proximo' : 'futuro'
}

/** ordem da tela: o que precisa de ação primeiro; pago vai pro fim */
const PESO: Record<Situacao, number> = { atrasado: 0, hoje: 1, proximo: 2, futuro: 3, pago: 4 }
export function ordenar(itens: Gasto[], mes: string): Gasto[] {
  return [...itens].sort((a, b) => {
    const pa = PESO[situacao(a, mes)]
    const pb = PESO[situacao(b, mes)]
    if (pa !== pb) return pa - pb
    return diaVenc(a.dia, mes) - diaVenc(b.dia, mes)
  })
}

export const novoId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/* ── carga inicial: o que já existe hoje ─────────────────────────────────────
 * Só vale na primeira vez (loadState devolve isto quando a chave não existe).
 * Depois disso o que manda é o que está salvo. */
export const GASTOS_INICIAIS: GastosState = {
  itens: [
    {
      id: 'g-contabilidade', nome: 'Contabilidade', valor: 647, dia: 5, ativo: true,
      conta: 'Empresa', pagos: [],
      obs: 'Mensalidade nova da contabilidade da empresa.',
    },
    {
      id: 'g-vercel-jhe', nome: 'Vercel — Jheniffer', valor: null, dia: 10, ativo: true,
      conta: 'Jheniffer', pagos: [],
      obs: 'Conferir a data antes de pagar: dá pra deixar consumir até o fim do ciclo.',
      url: 'https://vercel.com/account/billing',
    },
    {
      id: 'g-make', nome: 'Make', valor: null, dia: 16, ativo: true,
      pagos: [],
      obs: 'Automações. O ciclo de créditos reseta junto com a cobrança. Auto-compra de crédito DESLIGADA: se os créditos acabarem antes do reset, os cenários simplesmente param — conferir o consumo no meio do mês.',
      url: 'https://www.make.com/en/register',
    },
    {
      id: 'g-brevo', nome: 'Brevo', valor: null, dia: 20, ativo: true,
      pagos: ['2026-08'],
      obs: 'Paga normal, sem manobra. Só ficar de olho se o envio encostar no limite do plano.',
      url: 'https://app.brevo.com/billing/plan',
    },
    {
      id: 'g-gdrive', nome: 'Google Drive', valor: null, dia: 26, ativo: true,
      pagos: ['2026-08'],
      obs: 'Onde ficam os arquivos da operação — não pode cair.',
      url: 'https://one.google.com/storage',
    },
    {
      id: 'g-vturb', nome: 'VTurb', valor: 97, dia: 27, ativo: true,
      pagos: [],
      obs: 'R$97 do plano já pago. Se estourar o limite vem cobrança de uso extra — nesse caso eu troco de conta em vez de pagar o excedente.',
    },
    {
      id: 'g-vercel-mur', nome: 'Vercel — nmurilo', valor: null, dia: 29, ativo: true,
      conta: 'nmurilo', pagos: [],
      obs: 'Conferir a data antes de pagar: dá pra deixar consumir até o fim do ciclo.',
      url: 'https://vercel.com/account/billing',
    },
    {
      id: 'g-supabase', nome: 'Supabase', valor: null, dia: 30, ativo: true,
      pagos: [],
      obs: 'Banco do PURSTINLAB e da área de membros — não pode cair.',
      url: 'https://supabase.com/dashboard/org/_/billing',
    },
  ],
}
