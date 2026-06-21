import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send, CheckCircle2, Clock, XCircle, Circle, PlayCircle, Link2, Info, Rocket } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { fetchWaTemplates, createWaTemplate, type WaTemplateMeta } from './orders'

const LS_SECRET = 'purstin_pixel'
const LS_DRAFTS = 'purstin_wa_templates'

function getSecret(): string {
  try { return JSON.parse(localStorage.getItem(LS_SECRET) || '{}').webhookSecret || '' } catch { return '' }
}

interface Draft {
  day: number
  name: string
  category: 'MARKETING' | 'UTILITY'
  body: string
  bodyExample: string[]
  buttonText: string
  video: boolean
}

const DEFAULT_DRAFTS: Draft[] = [
  {
    day: 1,
    name: 'carrinho_dia1_v2',
    category: 'MARKETING',
    body: 'Oi {{1}}, você esqueceu algo no carrinho 👀\n\nAinda dá tempo de garantir o seu pedido na {{2}}. É só tocar no botão abaixo e finalizar em menos de 1 minuto 👇',
    bodyExample: ['João', 'nossa loja'],
    buttonText: 'Finalizar compra',
    video: false,
  },
  {
    day: 2,
    name: 'carrinho_dia2_v2',
    category: 'MARKETING',
    body: '{{1}}, olha só o que você vai receber 🎁\n\nMilhares de pessoas já estão usando. Bora garantir o seu antes que acabe?',
    bodyExample: ['João'],
    buttonText: 'Quero garantir',
    video: true,
  },
  {
    day: 3,
    name: 'carrinho_dia3_v2',
    category: 'MARKETING',
    body: '{{1}}, última chance ⏰\n\nSeu carrinho expira hoje e eu não garanto o mesmo preço depois. Finaliza agora 👇',
    bodyExample: ['João'],
    buttonText: 'Finalizar agora',
    video: false,
  },
]

function loadDrafts(): Draft[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_DRAFTS) || 'null')
    if (Array.isArray(saved) && saved.length === 3) return saved
  } catch {}
  return DEFAULT_DRAFTS
}

// extrai os índices das variáveis {{n}} na ordem que aparecem (distintos)
function varIndices(body: string): number[] {
  const found = new Set<number>()
  const re = /\{\{(\d+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) found.add(+m[1])
  return [...found].sort((a, b) => a - b)
}

function renderBody(body: string, examples: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => examples[+n - 1] || `[${n}]`)
}

const STATUS_META: Record<string, { label: string; cls: string; Icon: any }> = {
  APPROVED: { label: 'Aprovado', cls: 'text-ok border-ok/30 bg-ok/10', Icon: CheckCircle2 },
  PENDING: { label: 'Em análise', cls: 'text-warn border-warn/30 bg-warn/10', Icon: Clock },
  IN_APPEAL: { label: 'Em recurso', cls: 'text-warn border-warn/30 bg-warn/10', Icon: Clock },
  PENDING_DELETION: { label: 'Removendo', cls: 'text-muted2 border-border2 bg-surface2', Icon: Clock },
  REJECTED: { label: 'Rejeitado', cls: 'text-danger border-danger/30 bg-danger/10', Icon: XCircle },
  PAUSED: { label: 'Pausado', cls: 'text-warn border-warn/30 bg-warn/10', Icon: Clock },
  DISABLED: { label: 'Desativado', cls: 'text-danger border-danger/30 bg-danger/10', Icon: XCircle },
}
const notCreated = { label: 'Não criado', cls: 'text-muted2 border-border2 bg-surface2', Icon: Circle }

export default function WaTemplatesView() {
  const [drafts, setDrafts] = useState<Draft[]>(loadDrafts)
  const [remote, setRemote] = useState<Record<string, WaTemplateMeta>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState<number | null>(null)
  const [submittingAll, setSubmittingAll] = useState(false)
  const secret = getSecret()
  const urlBase = (typeof window !== 'undefined' ? window.location.origin : '') + '/api/go?id='

  useEffect(() => {
    localStorage.setItem(LS_DRAFTS, JSON.stringify(drafts))
  }, [drafts])

  async function loadRemote() {
    if (!secret) return
    setLoading(true)
    try {
      const list = await fetchWaTemplates(secret)
      const map: Record<string, WaTemplateMeta> = {}
      list.forEach((t) => { map[t.name] = t })
      setRemote(map)
    } catch (e: any) {
      toast(e.message || 'falha ao listar templates', 'err')
    }
    setLoading(false)
  }
  useEffect(() => { loadRemote() }, [])

  function setDraft(day: number, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.day === day ? { ...d, ...patch } : d)))
  }

  async function submit(d: Draft): Promise<boolean> {
    if (!secret) { toast('Defina o segredo do webhook na aba Conexões primeiro', 'err'); return false }
    const idxs = varIndices(d.body)
    const example = idxs.map((i) => d.bodyExample[i - 1] || '')
    if (example.some((e) => !e.trim())) {
      toast(`Dia ${d.day}: preencha o exemplo de cada variável`, 'err')
      return false
    }
    const res = await createWaTemplate(secret, {
      name: d.name.trim(),
      category: d.category,
      language: 'pt_BR',
      body: d.body,
      bodyExample: example,
      buttonText: d.buttonText.trim(),
      buttonUrlBase: urlBase,
      video: d.video,
    })
    if (res.ok) {
      toast(`Dia ${d.day} enviado pro Meta (${res.status || 'PENDING'})`, 'ok')
      return true
    }
    toast(`Dia ${d.day}: ${res.error || 'falhou'}`, 'err')
    return false
  }

  async function submitOne(d: Draft) {
    setSubmitting(d.day)
    await submit(d)
    await loadRemote()
    setSubmitting(null)
  }

  async function submitAll() {
    if (!secret) return toast('Defina o segredo do webhook na aba Conexões primeiro', 'err')
    setSubmittingAll(true)
    let ok = 0
    for (const d of drafts) {
      // eslint-disable-next-line no-await-in-loop
      if (await submit(d)) ok++
    }
    await loadRemote()
    setSubmittingAll(false)
    toast(`${ok}/3 templates enviados pro Meta`, ok === 3 ? 'ok' : 'warn')
  }

  const allApproved = useMemo(
    () => drafts.every((d) => remote[d.name]?.status === 'APPROVED'),
    [drafts, remote],
  )

  if (!secret) {
    return (
      <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
        Defina o <b>Segredo do Webhook</b> na aba Conexões pra gerenciar os templates.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-[8px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.06] px-3.5 py-2.5 text-[11.5px] text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-2" />
        <div>
          Edite os 3 templates aqui e clique em <b>Enviar pro Meta</b> — eles vão direto pra aprovação, sem abrir o Gerenciador.
          O botão azul leva o cliente pro carrinho dele (<code className="text-brand-2">/api/go</code> resolve o link). A revisão do Meta leva de minutos a 24h.
          {' '}<b className="text-ink">Depois de aprovados</b>, ajuste na Vercel: <code>WA_TEMPLATE_DAY1/2/3</code> com os nomes abaixo.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn btn-ghost btn-sm" onClick={loadRemote} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar status
        </button>
        <button className="btn btn-primary btn-sm ml-auto" onClick={submitAll} disabled={submittingAll}>
          <Rocket className="h-3.5 w-3.5" /> {submittingAll ? 'Enviando…' : 'Enviar os 3 pro Meta'}
        </button>
      </div>

      {allApproved && (
        <div className="flex items-center gap-2 rounded-[8px] border border-ok/30 bg-ok/10 px-3.5 py-2 text-[12px] font-semibold text-ok">
          <CheckCircle2 className="h-4 w-4" /> Os 3 templates estão aprovados. Confirme os nomes nas env vars da Vercel e está pronto.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {drafts.map((d) => {
          const rt = remote[d.name]
          const sm = (rt && STATUS_META[rt.status]) || notCreated
          const idxs = varIndices(d.body)
          return (
            <div key={d.day} className="card card-body flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-bold">Dia {d.day}</h3>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sm.cls}`}>
                  <sm.Icon className="h-3 w-3" /> {sm.label}
                </span>
              </div>

              {rt?.status === 'REJECTED' && rt.rejected_reason && (
                <div className="rounded-[6px] border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[10.5px] text-danger">
                  Motivo: {rt.rejected_reason}
                </div>
              )}

              <div className="field">
                <label className="!text-[10px]">Nome (sem espaços/maiúsculas)</label>
                <input
                  value={d.name}
                  onChange={(e) => setDraft(d.day, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  className="!text-[11px] font-mono"
                />
              </div>

              <div className="field">
                <label className="!text-[10px]">Categoria</label>
                <select value={d.category} onChange={(e) => setDraft(d.day, { category: e.target.value as Draft['category'] })} className="!text-[11px]">
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utilidade</option>
                </select>
              </div>

              {d.video && (
                <div className="flex items-center gap-1.5 rounded-[6px] border border-border2 bg-surface2 px-2.5 py-1.5 text-[10.5px] text-muted2">
                  <PlayCircle className="h-3.5 w-3.5 text-brand-2" /> Header de vídeo (usa <code>WA_DAY2_VIDEO_URL</code>)
                </div>
              )}

              <div className="field">
                <label className="!text-[10px]">Corpo da mensagem — variáveis {'{{1}}, {{2}}…'}</label>
                <textarea
                  value={d.body}
                  onChange={(e) => setDraft(d.day, { body: e.target.value })}
                  rows={5}
                  className="resize-y rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-2 text-[11.5px] text-ink"
                />
              </div>

              {idxs.map((i) => (
                <div key={i} className="field">
                  <label className="!text-[10px]">
                    Exemplo de {`{{${i}}}`} {i === 1 ? '(nome)' : i === 2 ? '(empresa)' : ''}
                  </label>
                  <input
                    value={d.bodyExample[i - 1] || ''}
                    onChange={(e) => {
                      const ex = [...d.bodyExample]
                      ex[i - 1] = e.target.value
                      setDraft(d.day, { bodyExample: ex })
                    }}
                    className="!text-[11px]"
                    placeholder={i === 1 ? 'João' : i === 2 ? 'nossa loja' : 'exemplo'}
                  />
                </div>
              ))}

              <div className="field">
                <label className="!text-[10px]">Texto do botão</label>
                <input value={d.buttonText} onChange={(e) => setDraft(d.day, { buttonText: e.target.value })} className="!text-[11px]" maxLength={25} />
              </div>

              {/* prévia estilo WhatsApp */}
              <div>
                <span className="text-[9.5px] uppercase tracking-wide text-muted2">prévia</span>
                <div className="mt-1 overflow-hidden rounded-[10px] border border-[#1f2937] bg-[#0b141a]">
                  {d.video && (
                    <div className="flex h-20 items-center justify-center bg-[#06343f] text-[#5eead4]">
                      <PlayCircle className="h-7 w-7" />
                    </div>
                  )}
                  <div className="whitespace-pre-wrap px-3 py-2.5 text-[11.5px] leading-snug text-[#e9edef]">
                    {renderBody(d.body, d.bodyExample)}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 border-t border-[#1f2937] py-2 text-[11.5px] font-medium text-[#53bdeb]">
                    <Link2 className="h-3.5 w-3.5" /> {d.buttonText || 'Botão'}
                  </div>
                </div>
              </div>

              <button className="btn btn-primary btn-sm" onClick={() => submitOne(d)} disabled={submitting === d.day || submittingAll}>
                <Send className="h-3 w-3" /> {submitting === d.day ? 'Enviando…' : 'Enviar pro Meta'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="rounded-[8px] border border-warn/20 border-l-[3px] border-l-warn bg-warn/[0.06] px-3.5 py-2.5 text-[11.5px] text-muted">
        <b className="text-ink">Pré-requisitos na Vercel:</b> <code>WA_WABA_ID</code> (ID da conta WhatsApp Business — não é o do número) e <code>WA_TOKEN</code>.
        Pro vídeo do dia 2 também <code>WA_APP_ID</code> + <code>WA_DAY2_VIDEO_URL</code>. Template aprovado não pode ser editado — pra mudar, troque o nome e reenvie.
      </div>
    </div>
  )
}
