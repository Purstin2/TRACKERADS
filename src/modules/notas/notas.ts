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
  codigoServico: string // código da lista de serviço do município
  descricao: string // o que sai escrito na nota
  aliquotaIss: number | null // %
}

export interface ItemChecklist {
  id: string
  feito: boolean
  valor?: string
}

export interface NotasConfig {
  emissaoAtiva: boolean
  ambiente: 'homologacao' | 'producao'
  checklist: Record<string, ItemChecklist>
  produtos: Record<string, ProdutoFiscal>
}

export const CONFIG_INICIAL: NotasConfig = {
  emissaoAtiva: false,
  ambiente: 'homologacao',
  checklist: {},
  produtos: {},
}

/** Os cinco bloqueios reais, na ordem em que costumam ser resolvidos. */
export const CHECKLIST_ITENS: {
  id: string
  label: string
  detalhe: string
  responsavel: 'contador' | 'prefeitura' | 'bling'
  campo?: string // se preenche um valor junto
}[] = [
  {
    id: 'classificacao',
    label: 'Produto digital entra como serviço (NFSe)?',
    detalhe:
      'Precisa da confirmação de que arquivo 3D, estampa e música personalizada se enquadram como serviço no seu regime — é isso que define NFSe em vez de NFe.',
    responsavel: 'contador',
  },
  {
    id: 'codigo_servico',
    label: 'Código do serviço na lista do município',
    detalhe: 'Define a alíquota do ISS. Sem ele a API do Bling recusa a nota.',
    responsavel: 'contador',
    campo: 'Ex: 1.05',
  },
  {
    id: 'aliquota_iss',
    label: 'Alíquota de ISS aplicável',
    detalhe: 'Percentual que o município cobra sobre o serviço.',
    responsavel: 'contador',
    campo: 'Ex: 2',
  },
  {
    id: 'numeracao_rps',
    label: 'Numeração de RPS (série e número inicial)',
    detalhe: 'Vem do credenciamento na prefeitura. No Bling está vazio hoje.',
    responsavel: 'prefeitura',
    campo: 'Ex: série 1, nº 1',
  },
  {
    id: 'certificado',
    label: 'Certificado digital e-CNPJ A1 instalado no Bling',
    detalhe: 'Tem que ser do mesmo CNPJ do emitente. Certificado de CPF não serve.',
    responsavel: 'bling',
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

/** Quantos itens do checklist já foram resolvidos. */
export function progressoChecklist(cfg: NotasConfig) {
  const feitos = CHECKLIST_ITENS.filter((i) => cfg.checklist[i.id]?.feito).length
  return { feitos, total: CHECKLIST_ITENS.length, completo: feitos === CHECKLIST_ITENS.length }
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
