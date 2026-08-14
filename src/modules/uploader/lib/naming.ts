import type { BudgetType, Estrutura, FormState } from '../types'
import { XCOD_SEP } from '../types'

function gv(form: FormState, key: keyof FormState): string {
  return (form[key] || '').trim()
}

export function getTodayStr(): string {
  const d = new Date()
  return (
    String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
  )
}

export function getFase(form: FormState): string {
  const v = gv(form, 'nome-fase')
  if (v === 'custom-fase') return gv(form, 'nome-fase-custom') || 'T'
  return v || 'T'
}

export function getPublico(form: FormState): string {
  const v = gv(form, 'nome-publico')
  if (v === 'custom-pub') return gv(form, 'nome-publico-custom') || 'A'
  return v || 'A'
}

export function getDataNome(form: FormState): string {
  const tipo = gv(form, 'nome-data-tipo')
  if (tipo === 'custom-data') return gv(form, 'nome-data-custom') || getTodayStr()
  if (tipo === 'hoje') return getTodayStr()
  const dt = gv(form, 'start_dt')
  if (!dt) return getTodayStr()
  const d = new Date(dt)
  return (
    String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
  )
}

export function getPaisNome(form: FormState, paises: string[]): string {
  const modo = gv(form, 'pais-nome-modo') || 'gr'
  if (modo === 'custom-pais') return gv(form, 'pais-nome-custom') || 'GR'
  if (modo === 'codes')
    return paises.length > 3
      ? `${paises.slice(0, 3).join('-')}+${paises.length - 3}`
      : paises.join('-')
  // modo "gr"
  if (paises.length <= 1) return paises[0] || 'BR'
  const temBR = paises.includes('BR')
  const fora = paises.filter((c) => c !== 'BR')
  const gr = fora.length > 1 ? 'GR' : fora[0]
  return temBR ? (gr ? `BR-${gr}` : 'BR') : gr
}

export function buildNome(
  form: FormState,
  paises: string[],
  budgetType: BudgetType,
  videoNome: string,
): string {
  return `${getFase(form)} - ${getPaisNome(form, paises)} - ${getDataNome(form)} - ${budgetType} - ${getPublico(form)} - ${videoNome}`
}

export function buildNomeEstrutura(
  form: FormState,
  paises: string[],
  budgetType: BudgetType,
  code: string,
): string {
  return `${getFase(form)} - ${getPaisNome(form, paises)} - ${getDataNome(form)} - ${budgetType} "${code}"`
}

export function getCampNome(
  form: FormState,
  paises: string[],
  budgetType: BudgetType,
  estrutura: Estrutura,
  videoNome: string,
  totalCriativos: number,
): string {
  if (estrutura === 'N11') return buildNome(form, paises, budgetType, videoNome)
  if (estrutura === '1N1')
    return buildNomeEstrutura(form, paises, budgetType, `1${totalCriativos}1`)
  return buildNomeEstrutura(form, paises, budgetType, `11${totalCriativos}`)
}

/** Cola o nome fixo da campanha no slot de CAMPANHA do xcod (índice 1), do mesmo
 *  jeito que o utm_campaign faz: `<fixo>~~{{campaign.name}}|{{campaign.id}}`.
 *  Se o xcod não tiver o separador (alguém digitou um valor próprio), prefixa o
 *  valor inteiro — pior caso continua sendo melhor que perder a origem. */
export function injectStaticXcod(xcod: string, staticCamp?: string): string {
  const sc = (staticCamp || '').trim()
  if (!xcod || !sc) return xcod
  const parts = xcod.split(XCOD_SEP)
  if (parts.length < 2) return `${sc}~~${xcod}`
  parts[1] = `${sc}~~${parts[1]}`
  return parts.join(XCOD_SEP)
}

/** Prefixo estático colado no INÍCIO do utm_campaign. Sobrevive ao
 *  compartilhamento orgânico (onde as macros {{}} não resolvem) sem afetar o
 *  casamento por id — o dashboard pesca "|<id>" do FIM (regex ancorada em $),
 *  então texto no começo é ignorado no pago e recuperável no viral. */
export function buildUTMString(form: FormState, staticCamp?: string): string {
  const fields: (keyof FormState)[] = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ]
  const sc = (staticCamp || '').trim()
  const params: string[] = []
  for (const f of fields) {
    let v = gv(form, f)
    if (!v) continue
    if (f === 'utm_campaign' && sc) v = `${sc}~~${v}`
    params.push(`${f}=${v}`)
  }
  // xcod (Hotmart): recebe o MESMO tratamento do utm_campaign — o nome fixo da
  // campanha entra na frente do slot de campanha, com as macros logo atrás.
  // Sem isso, uma venda cujas {{macros}} não resolveram (compartilhamento
  // orgânico, link colado no zap) chegava sem NENHUMA pista de origem. Com o
  // prefixo, sobra pelo menos o nome da campanha — e o "|<id>" continua no fim,
  // que é de onde o dashboard pesca o id.
  const xcod = injectStaticXcod(gv(form, 'utm_xcod'), sc)
  if (xcod) params.push(`xcod=${xcod}`)
  return params.join('&')
}

export function buildURL(form: FormState, staticCamp?: string): string {
  const base = gv(form, 'url_destino')
  const utms = buildUTMString(form, staticCamp)
  return utms ? base + (base.includes('?') ? '&' : '?') + utms : base
}

export function dtToUTC(localDt: string): string | null {
  if (!localDt) return null
  return new Date(localDt)
    .toISOString()
    .replace('.000Z', '+0000')
    .replace(/\.\d{3}Z$/, '+0000')
}
