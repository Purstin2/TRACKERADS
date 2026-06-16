import type { BudgetType, Estrutura, FormState } from '../types'

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

export function buildUTMString(form: FormState): string {
  const fields: (keyof FormState)[] = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ]
  const params: string[] = []
  for (const f of fields) {
    const v = gv(form, f)
    if (v) params.push(`${f}=${v}`)
  }
  const xcod = gv(form, 'utm_xcod')
  if (xcod) params.push(`xcod=${xcod}`)
  return params.join('&')
}

export function buildURL(form: FormState): string {
  const base = gv(form, 'url_destino')
  const utms = buildUTMString(form)
  return utms ? base + (base.includes('?') ? '&' : '?') + utms : base
}

export function dtToUTC(localDt: string): string | null {
  if (!localDt) return null
  return new Date(localDt)
    .toISOString()
    .replace('.000Z', '+0000')
    .replace(/\.\d{3}Z$/, '+0000')
}
