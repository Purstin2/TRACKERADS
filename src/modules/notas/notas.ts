/**
 * Notas fiscais — configuração da emissão automática via Bling.
 *
 * A emissão só liga quando a conta do Bling está configurada. Isso NÃO é código:
 * são cinco itens que dependem de terceiros (contador, prefeitura, certificado).
 * Descobrimos a lista testando a API v3 direto — o erro que ela devolve enquanto
 * falta configuração é "O código da lista de serviço não está vinculado a um
 * conjunto de tributações". Por isso o checklist abaixo é parte da tela: sem ele
 * a integração falha silenciosamente e ninguém sabe por quê.
 *
 * Estrutura confirmada do POST /nfse (testada na API real, não na documentação):
 *   { contato: { nome, numeroDocumento, endereco: {...} },
 *     servicos: [ { descricao, valor, codigo } ] }
 * O cliente vai inline — não precisa cadastrar contato antes.
 */
import type { KirvanoOrder } from '@/modules/pixel/orders'

export const NOTAS_KEY = 'notas_fiscais_v1'

/** Limite da API do Bling, confirmado na prática: 3 req/s. */
export const BLING_RATE_LIMIT = 3

export type TipoNota = 'nfse' | 'nfe' | 'nenhum'

export interface ProdutoFiscal {
  key: string // mesmo key do discoverProducts (id Kirvano ou "n:<nome>")
  nome: string
  tipo: TipoNota
  codigoServico: string // NFS-e: código da lista de serviço do município
  ncm: string // NF-e: classificação fiscal (4901.99.00 p/ arquivo digital)
  descricao: string // o que sai escrito na nota
  aliquotaIss: number | null // %
}

export interface ItemChecklist {
  id: string
  feito: boolean
  valor?: string
}

/**
 * Endereço usado quando o comprador não informa — que é sempre, em produto
 * digital. O contador autorizou usar o endereço do próprio CNPJ ("prática
 * padrão", palavras dele), e confirmou que o ISS é devido em Balneário
 * Camboriú independente de onde o cliente mora. Então não é dado inventado:
 * é o endereço do prestador, que é quem recolhe.
 */
export interface EnderecoPadrao {
  rua: string
  numero: string
  bairro: string
  municipio: string
  uf: string
  cep: string
}

export interface NotasConfig {
  emissaoAtiva: boolean
  ambiente: 'homologacao' | 'producao'
  /** id da natureza de operação usada na NF-e (Bling cria 18 no onboarding) */
  naturezaOperacaoId: number | null
  ncmPadrao: string
  textoImunidade: string
  enderecoPadrao: EnderecoPadrao
  checklist: Record<string, ItemChecklist>
  produtos: Record<string, ProdutoFiscal>
}

/** Texto obrigatório na NF-e de arquivo digital — não é campo, é observação. */
export const TEXTO_IMUNIDADE =
  'EBOOK IMUNIDADE DE ICMS CONFORME ART. 150, III, D, CONSTITUICAO DA REPUBLICA FEDERATIVA DO BRASIL DE 1988'

export const CONFIG_INICIAL: NotasConfig = {
  emissaoAtiva: false,
  ambiente: 'homologacao',
  // "Venda de mercadoria a não contribuinte" — a certa pra venda a pessoa física
  naturezaOperacaoId: 15111289642,
  ncmPadrao: '4901.99.00',
  textoImunidade: TEXTO_IMUNIDADE,
  enderecoPadrao: { rua: '', numero: 'S/N', bairro: 'Centro', municipio: 'Balneário Camboriú', uf: 'SC', cep: '' },
  checklist: {},
  produtos: {},
}

/**
 * Estado real da configuração, apurado testando a API do Bling em 20/08/2026.
 * O que está `resolvido: true` já foi verificado de verdade — não é otimismo.
 */
export const CHECKLIST_ITENS: {
  id: string
  label: string
  detalhe: string
  responsavel: 'contador' | 'prefeitura' | 'bling'
  campo?: string
  resolvido?: boolean // já confirmado por teste; fica marcado por padrão
  bloqueiaNfe?: boolean
}[] = [
  {
    id: 'classificacao',
    label: 'Classificação fiscal de cada produto',
    detalhe:
      'Contador definiu: arquivos prontos (STL, estampas, artes de caneca) = NF-e; música personalizada (Melodify) = NFS-e.',
    responsavel: 'contador',
    resolvido: true,
    bloqueiaNfe: true,
  },
  {
    id: 'ncm',
    label: 'NCM do arquivo digital + texto de imunidade',
    detalhe:
      'NCM 4901.99.00, com a imunidade de ICMS de ebook escrita nas informações complementares. Testado: SEFAZ autorizou.',
    responsavel: 'contador',
    resolvido: true,
    bloqueiaNfe: true,
  },
  {
    id: 'certificado',
    label: 'Certificado digital e-CNPJ A1',
    detalhe: 'Instalado no Bling e validado — a NF-e de teste saiu autorizada com ele.',
    responsavel: 'bling',
    resolvido: true,
    bloqueiaNfe: true,
  },
  {
    id: 'natureza',
    label: 'Natureza de operação da NF-e',
    detalhe: '"Venda de mercadoria a não contribuinte" — a correta para venda a pessoa física.',
    responsavel: 'bling',
    resolvido: true,
    bloqueiaNfe: true,
  },
  {
    id: 'iss',
    label: 'Tributação de ISS da NFS-e',
    detalhe: 'Código 010901, ISS 5%, NBS 1.1703.10.00, indicador INTERNET. Já gravado no Bling.',
    responsavel: 'contador',
    resolvido: true,
  },
  {
    id: 'endereco_padrao',
    label: 'Endereço padrão da NFS-e',
    detalhe:
      'Contador autorizou usar o endereço do próprio CNPJ quando o comprador não informa, e confirmou que o ISS é devido em Balneário Camboriú de qualquer forma.',
    responsavel: 'contador',
    resolvido: true,
  },
  {
    id: 'senha_prefeitura',
    label: 'Senha do portal da prefeitura (só NFS-e)',
    detalhe:
      'Bloqueia SÓ a NFS-e do Melodify (~6% da receita). O município migra para o portal nacional em 01/09/2026, que autentica por certificado — então a tendência é resolver sozinho nessa data. Lembrete salvo no Diário.',
    responsavel: 'prefeitura',
  },
]

export const RESP_LABEL: Record<string, string> = {
  contador: 'Contador',
  prefeitura: 'Prefeitura',
  bling: 'Bling',
}

export const TIPO_LABEL: Record<TipoNota, string> = {
  nfse: 'NFS-e (serviço)',
  nfe: 'NF-e (produto)',
  nenhum: 'Não emitir',
}

/** Um item conta como feito se foi confirmado por teste OU marcado à mão. */
export const itemFeito = (cfg: NotasConfig, id: string) => {
  const def = CHECKLIST_ITENS.find((i) => i.id === id)
  const marcado = cfg.checklist[id]
  return marcado ? marcado.feito : !!def?.resolvido
}

/**
 * Progresso. `liberaNfe` é o que realmente importa no dia a dia: a NF-e cobre
 * ~94% do faturamento e não depende da senha da prefeitura, então dá pra ligar
 * a emissão mesmo com a NFS-e ainda travada.
 */
export function progressoChecklist(cfg: NotasConfig) {
  const feitos = CHECKLIST_ITENS.filter((i) => itemFeito(cfg, i.id)).length
  const liberaNfe = CHECKLIST_ITENS.filter((i) => i.bloqueiaNfe).every((i) => itemFeito(cfg, i.id))
  return { feitos, total: CHECKLIST_ITENS.length, completo: feitos === CHECKLIST_ITENS.length, liberaNfe }
}

/** Produtos que ainda não têm tipo de nota definido. */
export function produtosSemConfig(cfg: NotasConfig, keys: string[]) {
  return keys.filter((k) => !cfg.produtos[k] || cfg.produtos[k].tipo === 'nenhum')
}

export function produtoFiscal(cfg: NotasConfig, key: string, nome: string): ProdutoFiscal {
  return (
    cfg.produtos[key] || {
      key,
      nome,
      tipo: 'nenhum',
      codigoServico: '',
      ncm: cfg.ncmPadrao || '4901.99.00',
      descricao: '',
      aliquotaIss: null,
    }
  )
}

/**
 * Monta o payload do POST /nfse a partir de um pedido da Kirvano.
 * A estrutura veio de teste real contra a API — ver comentário no topo.
 */
export function montarPayloadNfse(o: KirvanoOrder, pf: ProdutoFiscal) {
  const c = (o as any).customer || {}
  return {
    contato: {
      nome: c.name || c.nome || 'Consumidor',
      numeroDocumento: (c.document || c.cpf || '').replace(/\D/g, ''),
      endereco: {
        endereco: c.street || '',
        numero: c.number || 'S/N',
        bairro: c.neighborhood || '',
        municipio: c.city || '',
        uf: (c.state || '').slice(0, 2).toUpperCase(),
        cep: (c.zipcode || '').replace(/\D/g, ''),
      },
    },
    servicos: [
      {
        descricao: pf.descricao || pf.nome,
        valor: Number(o.value) || 0,
        codigo: pf.codigoServico,
      },
    ],
  }
}

export const brl = (v?: number | null) =>
  v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
