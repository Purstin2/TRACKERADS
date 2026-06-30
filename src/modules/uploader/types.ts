export type BudgetType = 'ABO' | 'CBO'
export type Estrutura = 'N11' | '1N1' | '11N'

export interface FormState {
  token: string
  ad_account: string
  page_id: string
  instagram_id: string
  pixel_id: string
  pixel_event: string
  budget: string
  status_inicial: string
  start_dt: string
  end_dt: string
  copy: string
  titulo: string
  descricao: string
  cta: string
  url_destino: string
  url_exibicao: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  utm_term: string
  utm_xcod: string
  'nome-fase': string
  'nome-fase-custom': string
  'nome-publico': string
  'nome-publico-custom': string
  'nome-data-tipo': string
  'nome-data-custom': string
  'pais-nome-modo': string
  'pais-nome-custom': string
  search_titulo: string
  search_url: string
  // ── catálogo (esconder anúncio na biblioteca) ──
  tipo_anuncio: string // 'video' (atual) | 'catalogo'
  catalog_id: string
  product_set_id: string
}

export interface ContaExtra {
  ad_account: string
  page_id: string
  token: string
  copy: string
  instagram_id: string
}

export interface VideoItem {
  id: string
  title?: string
  created_time?: string
  nomeClean: string
  isDup: boolean
  thumbUrl: string
}

export interface SearchVideoSel {
  id: string
  nome: string
  thumbUrl: string
}

export const META_API = 'v22.0'

export const DEFAULT_COPY = `Cansаdo de perder horas catando arquivo SТL na internet?

Com esse pаck você tem +1ОО mil аrquivos оrganizados: action figures, desenhоs, аrticuladоs, decoração, brinquedоs e muito mais.

Tudo testado.
Tudo pronto para imprimir.

👇 Clica em "Saiba Mais" e vê tudo o que já vem pronto.`

export const DEFAULTS: FormState = {
  token: '',
  ad_account: 'act_1182053470681632',
  page_id: '61577045281461',
  instagram_id: '',
  pixel_id: '2290509241458184',
  pixel_event: 'PURCHASE',
  budget: '300',
  status_inicial: 'PAUSED',
  start_dt: '',
  end_dt: '',
  copy: DEFAULT_COPY,
  titulo: '⭐⭐⭐⭐⭐',
  descricao: '',
  cta: 'LEARN_MORE',
  url_destino: 'https://premium.ultrapack3d.com/',
  url_exibicao: 'stl3d100k.com',
  utm_source: 'FB',
  utm_medium: '{{adset.name}}|{{adset.id}}',
  utm_campaign: '{{campaign.name}}|{{campaign.id}}',
  utm_content: '{{ad.name}}|{{ad.id}}',
  utm_term: '{{placement}}',
  utm_xcod: '',
  'nome-fase': 'T',
  'nome-fase-custom': '',
  'nome-publico': 'A',
  'nome-publico-custom': '',
  'nome-data-tipo': 'inicio',
  'nome-data-custom': '',
  'pais-nome-modo': 'gr',
  'pais-nome-custom': '',
  search_titulo: '',
  search_url: '',
  tipo_anuncio: 'video',
  catalog_id: '',
  product_set_id: '',
}

export const UTM_XCOD =
  'FBhQwK21wXxR{{campaign.name}}|{{campaign.id}}hQwK21wXxR{{adset.name}}|{{adset.id}}hQwK21wXxR{{ad.name}}|{{ad.id}}hQwK21wXxR{{placement}}'

export interface CountryGroup {
  label: string
  countries: { code: string; flag: string }[]
}

export const COUNTRY_GROUPS: CountryGroup[] = [
  { label: '🇧🇷 Brasil', countries: [{ code: 'BR', flag: '🇧🇷' }] },
  {
    label: '🌍 Europa',
    countries: [
      { code: 'PT', flag: '🇵🇹' },
      { code: 'GB', flag: '🇬🇧' },
      { code: 'IT', flag: '🇮🇹' },
      { code: 'ES', flag: '🇪🇸' },
      { code: 'DE', flag: '🇩🇪' },
      { code: 'CH', flag: '🇨🇭' },
      { code: 'FR', flag: '🇫🇷' },
      { code: 'IE', flag: '🇮🇪' },
      { code: 'NL', flag: '🇳🇱' },
      { code: 'BE', flag: '🇧🇪' },
    ],
  },
  {
    label: '🌎 Américas + Oceania',
    countries: [
      { code: 'US', flag: '🇺🇸' },
      { code: 'CA', flag: '🇨🇦' },
      { code: 'AR', flag: '🇦🇷' },
      { code: 'AU', flag: '🇦🇺' },
    ],
  },
  { label: '🌏 Ásia', countries: [{ code: 'JP', flag: '🇯🇵' }] },
]

export const CTA_OPTIONS: { value: string; label: string }[] = [
  { value: 'LEARN_MORE', label: 'Saiba mais' },
  { value: 'SHOP_NOW', label: 'Comprar agora' },
  { value: 'SIGN_UP', label: 'Cadastre-se' },
  { value: 'GET_OFFER', label: 'Pegar oferta' },
  { value: 'WATCH_MORE', label: 'Ver mais' },
  { value: 'CONTACT_US', label: 'Fale conosco' },
  { value: 'DOWNLOAD', label: 'Baixar' },
  { value: 'SUBSCRIBE', label: 'Assinar' },
  { value: 'NO_BUTTON', label: 'Sem botão' },
]

export const PIXEL_EVENTS: { value: string; label: string }[] = [
  { value: 'PURCHASE', label: 'Purchase (Compra)' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'VIEW_CONTENT', label: 'ViewContent' },
  { value: 'ADD_TO_CART', label: 'AddToCart' },
  { value: 'INITIATE_CHECKOUT', label: 'InitiateCheckout' },
]

export const ESTRUTURA_INFO: Record<Estrutura, string> = {
  N11: '⚡ N campanhas × 1 conjunto × 1 anúncio: cada criativo tem sua própria campanha e conjunto. Ideal para testes com orçamentos totalmente isolados.',
  '1N1': '⚡ 1 campanha × N conjuntos × 1 anúncio: uma campanha centralizada, cada criativo em seu conjunto. Ótimo com CBO.',
  '11N': '⚡ 1 campanha × 1 conjunto × N anúncios: todos os criativos no mesmo conjunto. O algoritmo do Facebook otimiza entre eles automaticamente.',
}
