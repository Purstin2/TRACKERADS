import { useState } from 'react'
import { ClipboardList, Copy, Send, Terminal, Trash2, Plus, Save, FolderOpen } from 'lucide-react'
import { useUploader } from '../UploaderContext'
import { Card } from '../components/fields'
import { toast } from '@/components/ui/toast'
import { dtToUTC } from '../lib/naming'
import { runCreation, type CreateItem } from '../lib/create'
import type { ContaExtra } from '../types'

interface LogLine {
  msg: string
  tipo: string
}
interface ResultLine {
  nome?: string
  ok?: boolean
  det?: string
  header?: string
}

const LOG_COLOR: Record<string, string> = {
  ok: 'text-ok',
  err: 'text-danger',
  info: 'text-brand-2',
  warn: 'text-warn',
  '': 'text-[#8892b0]',
}

export default function StepSubir({ onBack }: { onBack: () => void }) {
  const ctx = useUploader()
  const { form } = ctx
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const [results, setResults] = useState<ResultLine[]>([])
  const [progress, setProgress] = useState({ cur: 0, total: 0 })
  const [showLog, setShowLog] = useState(false)

  function contasParaUpload(): ContaExtra[] {
    const contas: ContaExtra[] = [
      { ad_account: '', page_id: '', token: '', copy: '', instagram_id: '' },
    ]
    if (ctx.multiContaAtivo) {
      ctx.contasExtras.forEach((c) => {
        if (c.ad_account.trim()) contas.push(c)
      })
    }
    return contas
  }

  const nVideos = ctx.videosSel.size
  const contas = contasParaUpload()
  const totalItensTxt =
    ctx.estrutura === 'N11'
      ? `${nVideos} campanhas + ${nVideos} conjuntos + ${nVideos} anúncios`
      : ctx.estrutura === '1N1'
        ? `1 campanha + ${nVideos} conjuntos + ${nVideos} anúncios`
        : `1 campanha + 1 conjunto + ${nVideos} anúncios`

  async function iniciar() {
    const obrig: [string, string][] = [
      ['token', 'Token'],
      ['ad_account', 'Ad Account'],
      ['page_id', 'Page ID'],
      ['url_destino', 'URL'],
    ]
    for (const [id, nome] of obrig) {
      if (!(form as any)[id]?.trim()) {
        toast(`Campo obrigatório vazio: ${nome}`, 'err')
        return
      }
    }
    if (!nVideos) {
      toast('Selecione pelo menos 1 vídeo.', 'err')
      return
    }
    if (ctx.searchPlacementActive && !ctx.searchVideoSel) {
      toast('Selecione o vídeo do posicionamento de pesquisa.', 'err')
      return
    }

    setRunning(true)
    setShowLog(true)
    setLog([])
    setResults([])
    setProgress({ cur: 0, total: nVideos * contas.length })

    const lista: CreateItem[] = Array.from(ctx.videosSel).map((id) => {
      const vo = ctx.videos.find((v) => v.id === id)
      return { id, nome: vo?.nomeClean || `video_${id}`, thumbUrl: vo?.thumbUrl || '' }
    })

    let processed = 0
    let baseTotal = nVideos
    let contaOffset = 0

    await runCreation({
      form,
      paises: ctx.paises,
      budgetType: ctx.budgetType,
      estrutura: ctx.estrutura,
      lista,
      searchPlacementActive: ctx.searchPlacementActive,
      searchVideoSel: ctx.searchVideoSel,
      contas,
      startUTC: dtToUTC(form.start_dt),
      endUTC: form.end_dt ? dtToUTC(form.end_dt) : null,
      onLog: (msg, tipo = '') => setLog((l) => [...l, { msg, tipo }]),
      onResult: (nome, ok, det) => setResults((r) => [...r, { nome, ok, det }]),
      onProgress: (cur) => {
        processed = contaOffset + cur
        setProgress({ cur: processed, total: nVideos * contas.length })
        if (cur === baseTotal) contaOffset += baseTotal
      },
      onContaHeader: (header) => setResults((r) => [...r, { header }]),
    })

    setProgress({ cur: nVideos * contas.length, total: nVideos * contas.length })
    setRunning(false)
    toast('Processamento concluído.', 'ok')
  }

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <tr>
      <td className="w-[200px] border-b border-border px-2 py-1.5 text-[12px] text-muted">{k}</td>
      <td className="border-b border-border px-2 py-1.5 text-[13px]">{v}</td>
    </tr>
  )

  return (
    <div>
      <div className="mb-1 text-[21px] font-extrabold tracking-tight">Revisar e Subir</div>
      <div className="mb-6 text-[13px] text-muted2">Confira o resumo antes de enviar</div>

      <Card title="Resumo" icon={<ClipboardList className="h-3.5 w-3.5" />}>
        <table className="w-full border-collapse">
          <tbody>
            <Row k="Conta principal" v={form.ad_account} />
            <Row k="Página" v={form.page_id} />
            <Row k="Pixel" v={`${form.pixel_id} → ${form.pixel_event}`} />
            <Row k="Tipo de orçamento" v={ctx.budgetType} />
            <Row k="Budget" v={`$${(parseInt(form.budget || '0') / 100).toFixed(2)}/dia`} />
            <Row
              k="Países"
              v={
                <>
                  {ctx.paises.join(', ')}{' '}
                  <span className="text-muted">
                    — no nome: <strong className="text-brand-2">{ctx.getPaisNome()}</strong>
                  </span>
                </>
              }
            />
            <Row k="Início" v={form.start_dt || '—'} />
            <Row k="Status inicial" v={form.status_inicial} />
            <Row k="CTA" v={form.cta} />
            <Row k="URL" v={<span className="break-all font-mono text-[11px]">{ctx.buildURL()}</span>} />
            <Row
              k="Criativos selecionados"
              v={<strong className="text-brand-2">{nVideos} vídeo{nVideos !== 1 ? 's' : ''}</strong>}
            />
            {ctx.searchPlacementActive && ctx.searchVideoSel && (
              <Row
                k="Posicionamento pesquisa"
                v={<>vídeo próprio: <strong>{ctx.searchVideoSel.nome}</strong></>}
              />
            )}
            {contas.length > 1 && (
              <Row
                k="Contas de destino"
                v={<strong className="text-ok">{contas.length} contas selecionadas</strong>}
              />
            )}
            <Row
              k="Total a criar"
              v={totalItensTxt + (contas.length > 1 ? ` × ${contas.length} contas` : '')}
            />
          </tbody>
        </table>
      </Card>

      {/* multi-conta */}
      <div className="card mb-4">
        <div
          className="card-header cursor-pointer select-none"
          onClick={() => ctx.setMultiContaAtivo(!ctx.multiContaAtivo)}
        >
          <h3 className="flex items-center gap-2.5 text-[13px] font-bold">
            <span className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-brand/12 text-brand-2">
              <Copy className="h-3.5 w-3.5" />
            </span>
            Subir para Múltiplas Contas
          </h3>
          <span
            className={`text-[12px] font-semibold ${
              ctx.multiContaAtivo
                ? contas.length > 1
                  ? 'text-ok'
                  : 'text-warn'
                : 'text-muted2'
            }`}
          >
            {ctx.multiContaAtivo
              ? `Ativado — ${contas.length} conta${contas.length !== 1 ? 's' : ''}`
              : 'Desativado — 1 conta'}
          </span>
        </div>
        {ctx.multiContaAtivo && (
          <div className="card-body">
            <div className="mb-4 rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.07] px-3.5 py-2.5 text-[12px] text-ink">
              A mesma estrutura e criativos serão subidos para cada conta. Deixe os campos
              vazios para usar o valor padrão do formulário.
            </div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted2">
              Conta principal (do formulário)
            </div>
            <div className="mb-4 rounded-lg border border-border bg-surface2 px-3.5 py-2.5 text-[12px] text-muted2">
              <strong className="text-ink">{form.ad_account || '—'}</strong> · Página:{' '}
              <strong>{form.page_id || '—'}</strong> · Copy: padrão
            </div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted2">
              Contas adicionais
            </div>
            {ctx.contasExtras.map((c, i) => (
              <div
                key={i}
                className="mb-2.5 rounded-xl2 border border-border bg-surface2 p-3.5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <strong className="text-[13px] text-brand-2">Conta #{i + 2}</strong>
                  <button
                    className="btn btn-ghost btn-sm text-danger"
                    onClick={() => ctx.removeConta(i)}
                  >
                    ✗ Remover
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label>Ad Account ID *</label>
                    <input
                      value={c.ad_account}
                      placeholder="act_000000000000"
                      onChange={(e) => ctx.updateConta(i, { ad_account: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Page ID (vazio = principal)</label>
                    <input
                      value={c.page_id}
                      placeholder="usar o mesmo"
                      onChange={(e) => ctx.updateConta(i, { page_id: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Token (vazio = mesmo)</label>
                    <input
                      value={c.token}
                      placeholder="usar o mesmo token"
                      onChange={(e) => ctx.updateConta(i, { token: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Instagram ID (vazio = mesmo)</label>
                    <input
                      value={c.instagram_id}
                      placeholder="usar o mesmo"
                      onChange={(e) => ctx.updateConta(i, { instagram_id: e.target.value })}
                    />
                  </div>
                  <div className="field sm:col-span-2">
                    <label>Copy personalizado (vazio = padrão)</label>
                    <textarea
                      value={c.copy}
                      rows={2}
                      placeholder="usar o mesmo copy"
                      onChange={(e) => ctx.updateConta(i, { copy: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-ghost btn-sm" onClick={ctx.addConta}>
                <Plus className="h-3 w-3" /> Adicionar Conta
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  ctx.saveContas()
                  toast('Lista de contas salva!', 'ok')
                }}
              >
                <Save className="h-3 w-3" /> Salvar lista
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const n = ctx.loadContas()
                  toast(`${n} conta(s) carregada(s)`, 'ok')
                }}
              >
                <FolderOpen className="h-3 w-3" /> Carregar lista
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2.5">
        <button className="btn btn-ghost" onClick={onBack} disabled={running}>
          ← Voltar
        </button>
        <button
          className="btn ml-auto bg-gradient-to-br from-ok to-emerald-600 px-7 py-3 text-[14px] font-bold text-white shadow-[0_6px_22px_rgba(16,185,129,.3)] disabled:opacity-50"
          onClick={iniciar}
          disabled={running}
        >
          <Send className="h-4 w-4" /> {running ? 'Criando...' : 'Criar Campanhas Agora'}
        </button>
      </div>

      {showLog && (
        <div className="mt-5">
          <div className="card">
            <div className="card-header">
              <h3 className="flex items-center gap-2.5 text-[13px] font-bold">
                <span className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-brand/12 text-brand-2">
                  <Terminal className="h-3.5 w-3.5" />
                </span>
                Log de Execução
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setLog([])}>
                <Trash2 className="h-3 w-3" /> Limpar
              </button>
            </div>
            <div className="max-h-[440px] min-h-[200px] overflow-y-auto bg-[#06070d] p-4 font-mono text-[11.5px] leading-relaxed">
              {log.map((l, i) => (
                <div key={i} className={LOG_COLOR[l.tipo] ?? LOG_COLOR['']}>
                  {l.msg || ' '}
                </div>
              ))}
            </div>
          </div>
          {progress.total > 0 && (
            <>
              <div className="mt-3.5 h-[5px] overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-brand transition-all duration-300"
                  style={{ width: `${Math.round((progress.cur / progress.total) * 100)}%` }}
                />
              </div>
              <div className="mt-1.5 text-[11px] text-muted2">
                {progress.cur} de {progress.total} processados
              </div>
            </>
          )}

          {results.length > 0 && (
            <div className="card mt-4">
              <div className="card-body">
                {results.map((r, i) =>
                  r.header ? (
                    <div
                      key={i}
                      className="my-2 rounded-r-md border-l-[3px] border-brand bg-brand/[0.05] px-3.5 py-2 text-[12px] font-bold text-brand-2"
                    >
                      {r.header}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={`mb-1.5 flex items-start gap-2.5 rounded-[9px] border px-3.5 py-2.5 text-[12px] ${
                        r.ok
                          ? 'border-ok/20 bg-ok/[0.07]'
                          : 'border-danger/20 bg-danger/[0.07]'
                      }`}
                    >
                      <span className="text-base">{r.ok ? '✓' : '✗'}</span>
                      <span className="min-w-[180px] flex-shrink-0 font-bold">{r.nome}</span>
                      <span className="break-all font-mono text-[10.5px] opacity-70">
                        {r.det}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
