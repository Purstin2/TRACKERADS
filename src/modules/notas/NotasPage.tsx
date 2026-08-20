import { useEffect, useMemo, useState } from 'react'
import {
  Receipt, ShieldAlert, ShieldCheck, RefreshCw, ExternalLink, Check,
  AlertTriangle, Info, Power,
} from 'lucide-react'
import { usePersistentState } from '@/lib/appState'
import { fetchOrders, type KirvanoOrder } from '@/modules/pixel/orders'
import { discoverProducts } from '@/modules/taxas/taxas'
import {
  NOTAS_KEY, CONFIG_INICIAL, CHECKLIST_ITENS, RESP_LABEL, TIPO_LABEL,
  progressoChecklist, produtoFiscal, itemFeito, brl,
  type NotasConfig, type TipoNota, type ProdutoFiscal,
} from './notas'

const INP =
  'h-[34px] w-full rounded-[8px] border border-border bg-surface2 px-2.5 text-[12.5px] text-ink focus:border-brand focus:outline-none'

/* Notas fiscais — emissão automática via Bling.
 *
 * A tela existe porque a emissão depende de cinco coisas que NÃO são código:
 * classificação fiscal, código de serviço, alíquota, numeração de RPS e
 * certificado digital. Enquanto qualquer uma faltar, a API do Bling recusa a
 * nota — então o checklist fica na frente, não escondido numa doc. */

export default function NotasPage() {
  const [cfg, setCfg] = usePersistentState<NotasConfig>(NOTAS_KEY, CONFIG_INICIAL)
  const [orders, setOrders] = useState<KirvanoOrder[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString()
      setOrders(await fetchOrders(desde))
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // produtos vendidos de verdade (mesma descoberta usada na aba Taxas)
  const produtos = useMemo(() => {
    const todos = discoverProducts(orders)
    return todos.filter((p) => p.sales > 0).sort((a, b) => b.revenue - a.revenue)
  }, [orders])

  const prog = progressoChecklist(cfg)
  const aprovadas = useMemo(
    () => orders.filter((o) => (o.status || '').toUpperCase() === 'APPROVED'),
    [orders],
  )

  const semTipo = produtos.filter((p) => (cfg.produtos[p.key]?.tipo ?? 'nenhum') === 'nenhum')
  const cobertas = aprovadas.filter((o) => {
    const main = Array.isArray(o.products) && o.products.length
      ? (o.products.find((p: any) => p && !p.is_order_bump) || o.products[0])
      : null
    const key = main?.id != null ? String(main.id) : 'n:' + String(main?.name || o.product || '').trim().toLowerCase()
    return (cfg.produtos[key]?.tipo ?? 'nenhum') !== 'nenhum'
  }).length

  function patchItem(id: string, p: Partial<{ feito: boolean; valor: string }>) {
    const atual = cfg.checklist[id] || { id, feito: false }
    setCfg({ ...cfg, checklist: { ...cfg.checklist, [id]: { ...atual, ...p } } })
  }
  function patchProduto(key: string, nome: string, p: Partial<ProdutoFiscal>) {
    const atual = produtoFiscal(cfg, key, nome)
    setCfg({ ...cfg, produtos: { ...cfg.produtos, [key]: { ...atual, ...p, key, nome } } })
  }

  const status = !prog.liberaNfe
    ? { level: 'err' as const, label: 'Bloqueado', detalhe: 'Falta configuração essencial para emitir NF-e.' }
    : !cfg.emissaoAtiva
    ? {
        level: 'off' as const,
        label: 'Pronto, desligado',
        detalhe: prog.completo
          ? 'Configuração completa. Ligue quando quiser começar a emitir.'
          : 'NF-e liberada (~94% da receita). NFS-e do Melodify segue travada até 01/09.',
      }
    : { level: 'ok' as const, label: 'Emitindo', detalhe: `Lote diário às 6h · ambiente: ${cfg.ambiente}.` }

  const statusCls = {
    ok: 'border-ok/30 bg-ok/10 text-ok',
    err: 'border-danger/30 bg-danger/10 text-danger',
    off: 'border-border2 bg-surface2 text-muted2',
  }[status.level]
  const StatusIcon = status.level === 'ok' ? ShieldCheck : status.level === 'err' ? ShieldAlert : Power

  return (
    <div className="flex flex-col gap-4">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-[15px] font-bold">
          <Receipt className="h-4 w-4 text-brand-2" /> Notas fiscais
        </h1>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusCls}`}>
          <StatusIcon className="h-3 w-3" /> {status.label}
        </span>
        <span className="text-[12px] text-muted2">{status.detalhe}</span>
        <button className="btn btn-ghost btn-sm ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* NF-e liberada mas NFS-e ainda travada */}
      {prog.liberaNfe && !prog.completo && (
        <div className="flex gap-2 rounded-[8px] border border-warn/30 border-l-[3px] border-l-warn bg-warn/[0.07] px-3 py-2.5 text-[11.5px] text-muted">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <div>
            <b>NF-e pronta, NFS-e esperando 01/09.</b> A NF-e já foi testada ponta a ponta — nota
            autorizada pela SEFAZ com chave de acesso, sem precisar de endereço do comprador. Isso
            cobre os arquivos digitais, que são ~94% do faturamento. Só o Melodify (NFS-e) segue
            travado, porque o provedor municipal exige uma senha de credenciamento da prefeitura que
            deixa de ser necessária quando o município migrar para o portal nacional.
          </div>
        </div>
      )}
      {!prog.liberaNfe && (
        <div className="flex gap-2 rounded-[8px] border border-danger/30 border-l-[3px] border-l-danger bg-danger/[0.08] px-3 py-2.5 text-[11.5px] text-muted">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <b>A emissão não pode ser ligada.</b> Falta item essencial do checklist — sem ele a API
            do Bling recusa a nota.
          </div>
        </div>
      )}

      {/* checklist */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="text-[13px] font-bold">Pendências para liberar a emissão</h3>
          <span className="text-[11.5px] text-muted2">{prog.feitos} de {prog.total} resolvidas</span>
        </div>
        <div className="card-body flex flex-col gap-2">
          {CHECKLIST_ITENS.map((it) => {
            const st = cfg.checklist[it.id]
            const feito = itemFeito(cfg, it.id)
            return (
              <div
                key={it.id}
                className={`rounded-[9px] border p-3 transition-colors ${feito ? 'border-ok/30 bg-ok/[0.05]' : 'border-border bg-surface'}`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    onClick={() => patchItem(it.id, { feito: !feito })}
                    className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                      feito ? 'border-ok bg-ok text-white' : 'border-border2 hover:border-brand'
                    }`}
                    aria-label={feito ? 'Marcar como pendente' : 'Marcar como resolvido'}
                  >
                    {feito && <Check className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[13px] font-semibold ${feito ? 'text-muted2 line-through' : 'text-ink'}`}>
                        {it.label}
                      </span>
                      <span className="rounded-full border border-border2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted2">
                        {RESP_LABEL[it.responsavel]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted2">{it.detalhe}</p>
                    {it.campo && (
                      <input
                        className={INP + ' mt-2 max-w-[240px]'}
                        placeholder={it.campo}
                        value={st?.valor || ''}
                        onChange={(e) => patchItem(it.id, { valor: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* produtos → tipo de nota */}
      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold">Qual nota cada produto emite</h3>
          <span className="text-[11.5px] text-muted2">
            {produtos.length} produto(s) vendido(s) nos últimos 30 dias
            {semTipo.length > 0 && <span className="ml-1 text-warn">· {semTipo.length} sem definição</span>}
          </span>
        </div>
        <div className="card-body">
          {!produtos.length ? (
            <div className="py-6 text-center text-[12px] text-muted2">
              {loading ? 'Carregando vendas…' : 'Nenhuma venda encontrada nos últimos 30 dias.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                    <th className="p-2 text-left font-semibold">Produto</th>
                    <th className="p-2 text-right font-semibold">Vendas 30d</th>
                    <th className="p-2 text-right font-semibold">Faturamento</th>
                    <th className="p-2 text-left font-semibold">Tipo de nota</th>
                    <th className="p-2 text-left font-semibold">NCM / cód. serviço</th>
                    <th className="p-2 text-left font-semibold">Descrição na nota</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((p) => {
                    const pf = produtoFiscal(cfg, p.key, p.name)
                    const indefinido = pf.tipo === 'nenhum'
                    return (
                      <tr key={p.key} className="border-b border-border/60 last:border-0">
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            {indefinido && <AlertTriangle className="h-3 w-3 shrink-0 text-warn" />}
                            <span className="font-semibold">{p.name}</span>
                            {p.isBump && (
                              <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[9.5px] text-muted2">bump</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-right tabular-nums">{p.sales}</td>
                        <td className="p-2 text-right tabular-nums">{brl(p.revenue)}</td>
                        <td className="p-2">
                          <select
                            className={INP + ' max-w-[150px]'}
                            value={pf.tipo}
                            onChange={(e) => patchProduto(p.key, p.name, { tipo: e.target.value as TipoNota })}
                          >
                            {(['nenhum', 'nfse', 'nfe'] as TipoNota[]).map((t) => (
                              <option key={t} value={t}>{TIPO_LABEL[t]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          {pf.tipo === 'nfe' ? (
                            <input
                              className={INP + ' max-w-[110px]'}
                              placeholder="4901.99.00"
                              title="NCM — classificação fiscal do produto"
                              value={pf.ncm}
                              onChange={(e) => patchProduto(p.key, p.name, { ncm: e.target.value })}
                            />
                          ) : (
                            <input
                              className={INP + ' max-w-[110px]'}
                              placeholder="010901"
                              title="Código na lista de serviços do município"
                              disabled={pf.tipo !== 'nfse'}
                              value={pf.codigoServico}
                              onChange={(e) => patchProduto(p.key, p.name, { codigoServico: e.target.value })}
                            />
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            className={INP + ' min-w-[180px]'}
                            placeholder={p.name}
                            disabled={pf.tipo === 'nenhum'}
                            value={pf.descricao}
                            onChange={(e) => patchProduto(p.key, p.name, { descricao: e.target.value })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* endereço padrão da NFS-e */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-[13px] font-bold">Endereço padrão da NFS-e</h3>
        </div>
        <div className="card-body flex flex-col gap-3">
          <p className="text-[12px] leading-relaxed text-muted2">
            Checkout de infoproduto não pede endereço, mas a NFS-e exige município, UF e bairro. O
            contador autorizou usar o endereço do próprio CNPJ nesses casos, e confirmou que{' '}
            <b className="text-ink">o ISS é devido em Balneário Camboriú</b> independentemente de onde o
            cliente mora — então o padrão não distorce imposto, é o endereço de quem recolhe. Só vale
            para NFS-e; a NF-e é autorizada sem endereço nenhum.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ['municipio', 'Município'],
              ['uf', 'UF'],
              ['bairro', 'Bairro'],
              ['rua', 'Rua'],
              ['numero', 'Número'],
              ['cep', 'CEP'],
            ] as const).map(([campo, label]) => (
              <label key={campo} className="flex flex-col gap-1">
                <span className="text-[10.5px] uppercase tracking-wide text-muted2">{label}</span>
                <input
                  className={INP}
                  value={cfg.enderecoPadrao?.[campo] || ''}
                  onChange={(e) =>
                    setCfg({ ...cfg, enderecoPadrao: { ...cfg.enderecoPadrao, [campo]: e.target.value } })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* cobertura + ligar */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card card-body">
          <div className="text-[10.5px] uppercase tracking-wide text-muted2">Vendas aprovadas (30d)</div>
          <div className="mt-1 text-[22px] font-bold tabular-nums">{aprovadas.length}</div>
          <div className="text-[11.5px] text-muted2">notas a emitir por mês, nesse ritmo</div>
        </div>
        <div className="card card-body">
          <div className="text-[10.5px] uppercase tracking-wide text-muted2">Com produto configurado</div>
          <div className={`mt-1 text-[22px] font-bold tabular-nums ${cobertas === aprovadas.length && aprovadas.length ? 'text-ok' : 'text-warn'}`}>
            {aprovadas.length ? Math.round((cobertas / aprovadas.length) * 100) : 0}%
          </div>
          <div className="text-[11.5px] text-muted2">{cobertas} de {aprovadas.length} vendas</div>
        </div>
        <div className="card card-body">
          <div className="text-[10.5px] uppercase tracking-wide text-muted2">Emissão automática</div>
          <button
            className={`btn btn-sm mt-2 ${cfg.emissaoAtiva ? 'btn-ghost' : 'btn-primary'}`}
            disabled={!prog.liberaNfe}
            onClick={() => setCfg({ ...cfg, emissaoAtiva: !cfg.emissaoAtiva })}
          >
            <Power className="h-3.5 w-3.5" /> {cfg.emissaoAtiva ? 'Desligar' : 'Ligar emissão'}
          </button>
          <div className="mt-1.5 text-[11px] text-muted2">
            {!prog.liberaNfe
              ? 'Resolva o checklist para liberar.'
              : cfg.emissaoAtiva
              ? 'Lote roda todo dia às 6h.'
              : 'Emite NF-e em lote diário. NFS-e entra depois de 01/09.'}
          </div>
        </div>
      </div>

      {/* referência técnica */}
      <div className="card">
        <div className="card-header">
          <h3 className="flex items-center gap-1.5 text-[13px] font-bold">
            <Info className="h-3.5 w-3.5 text-muted2" /> O que já foi confirmado na API do Bling
          </h3>
        </div>
        <div className="card-body grid gap-3 text-[12px] sm:grid-cols-2">
          <div>
            <div className="font-semibold">Conexão</div>
            <p className="mt-0.5 leading-relaxed text-muted2">
              OAuth2 funcionando, token expira a cada 6h (renovável por refresh token).
              Emitente: <b>malvoo brasil negocios digitais ltda</b>. Limite da API: <b>3 requisições
              por segundo</b> — folgado pro volume atual.
            </p>
          </div>
          <div>
            <div className="font-semibold">Estrutura da NFS-e</div>
            <p className="mt-0.5 leading-relaxed text-muted2">
              O cliente vai <b>inline</b> no payload (não precisa cadastrar contato antes):
              <code className="ml-1 rounded bg-surface2 px-1 py-0.5 text-[11px]">
                contato{'{'}nome, numeroDocumento, endereco{'}'} + servicos[]{'{'}descricao, valor, codigo{'}'}
              </code>
            </p>
          </div>
          <div className="sm:col-span-2">
            <a
              href="https://www.bling.com.br/configuracoes.notas.servicos.php"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir configurações de NFS-e no Bling
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
