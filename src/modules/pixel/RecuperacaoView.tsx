import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, RefreshCw, Send, Power, Save, Info, History, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import {
  fetchOrders,
  fetchWaConfig,
  fetchWaMessages,
  saveWaConfig,
  triggerRecover,
  brl,
  type KirvanoOrder,
  type WaConfig,
  type WaMessage,
} from './orders'

const LS_SECRET = 'purstin_pixel' // reaproveita o webhookSecret salvo na aba Conexões

function getSecret(): string {
  try {
    return JSON.parse(localStorage.getItem(LS_SECRET) || '{}').webhookSecret || ''
  } catch {
    return ''
  }
}

const PROVIDERS = [
  { v: 'cloud', label: 'Meta Cloud API (oficial)' },
  { v: '360dialog', label: '360dialog' },
  { v: 'gupshup', label: 'Gupshup' },
  { v: 'custom', label: 'Custom (URL própria)' },
]

const STEP_LABEL: Record<number, string> = { 1: 'Dia 1', 2: 'Dia 2', 3: 'Dia 3' }

export default function RecuperacaoView() {
  const [cfg, setCfg] = useState<WaConfig | null>(null)
  const [orders, setOrders] = useState<KirvanoOrder[]>([])
  const [waMessages, setWaMessages] = useState<WaMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [firing, setFiring] = useState(false)
  const [firingId, setFiringId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'fila' | 'historico'>('fila')
  const connected = !!supabase()
  const secret = getSecret()

  async function load() {
    if (!connected) return
    setLoading(true)
    try {
      const [c, all, msgs] = await Promise.all([fetchWaConfig(), fetchOrders(), fetchWaMessages()])
      setCfg(c)
      setOrders(all)
      setWaMessages(msgs)
    } catch {}
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  // carrinhos abandonados que ainda não foram recuperados nem convertidos
  const pending = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.status || '').toUpperCase() === 'ABANDONED' &&
          !o.recovered &&
          (!o.wa_status || ['pending', 'failed'].includes(o.wa_status)),
      ),
    [orders],
  )
  const withPhone = pending.filter((o) => o.customer_phone)

  if (!connected) {
    return (
      <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
        Conecte a Supabase e rode <code>supabase/wa_recovery.sql</code> pra usar a recuperação automática.
      </div>
    )
  }
  if (!cfg) {
    return (
      <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
        Rode <code>supabase/wa_recovery.sql</code> na sua Supabase — ele cria a tabela <code>wa_config</code> que controla isso.
      </div>
    )
  }

  const set = (k: keyof WaConfig, v: any) => setCfg({ ...cfg, [k]: v })

  async function save() {
    setSaving(true)
    try {
      await saveWaConfig(cfg!)
      toast('Configuração salva', 'ok')
    } catch (e: any) {
      toast(e.message, 'err')
    }
    setSaving(false)
  }

  async function fire(ids?: string[]) {
    if (!secret) return toast('Defina o segredo do webhook na aba Conexões primeiro', 'err')
    setFiring(true)
    try {
      const res = await triggerRecover(secret, ids)
      if (res.error) toast(res.error, 'err')
      else if (res.skipped) toast('Disparo automático está desligado — ligue acima ou use o lote manual', 'warn')
      else {
        const ok = (res.results || []).filter((r: any) => r.ok).length
        toast(`${ok}/${res.processed || 0} mensagens enviadas`, ok ? 'ok' : 'warn')
      }
      await load()
    } catch (e: any) {
      toast('Falhou: ' + e.message, 'err')
    }
    setFiring(false)
  }

  async function resendMessage(orderId: string) {
    if (!secret) return toast('Defina o segredo do webhook na aba Conexões primeiro', 'err')
    setFiringId(orderId)
    try {
      const res = await triggerRecover(secret, [orderId])
      if (res.error) toast(res.error, 'err')
      else {
        const ok = (res.results || []).filter((r: any) => r.ok).length
        toast(ok ? 'Mensagem reenviada!' : 'Nenhuma mensagem enviada (cheque o log)', ok ? 'ok' : 'warn')
      }
      await load()
    } catch (e: any) {
      toast('Falhou: ' + e.message, 'err')
    }
    setFiringId(null)
  }

  const fill = (s: string, k: string, v: string) => s.split(k).join(v)
  const previewMsg = fill(
    fill(fill(fill(cfg.template, '{nome}', 'João'), '{produto}', 'ULTRA PACK STL'), '{link}', 'https://pay.kirvano.com/...'),
    '{valor}',
    'R$ 169,80',
  )

  const okMsgs = waMessages.filter((m) => m.status === 'ok').length
  const errMsgs = waMessages.filter((m) => m.status !== 'ok').length

  return (
    <div className="flex flex-col gap-4">
      {/* status + ações rápidas */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            cfg.enabled ? 'border-ok/30 bg-ok/10 text-ok' : 'border-border2 bg-surface2 text-muted2'
          }`}
        >
          <Power className="h-3 w-3" /> Automático {cfg.enabled ? 'LIGADO' : 'desligado'}
        </span>
        <span className="text-[12px] text-muted2">
          {pending.length} carrinhos pendentes · {withPhone.length} com telefone
        </span>
        <span className="text-[12px] text-muted2">·</span>
        <span className="text-[12px] text-muted2">
          <span className="text-ok">{okMsgs} enviadas</span>
          {errMsgs > 0 && <span className="ml-1 text-danger">{errMsgs} com erro</span>}
        </span>
        <button className="btn btn-ghost btn-sm ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => fire(withPhone.map((o) => o.id))} disabled={firing || !withPhone.length}>
          <Send className="h-3.5 w-3.5" /> {firing ? 'Enviando…' : `Disparar lote (${withPhone.length})`}
        </button>
      </div>

      {/* sub-tabs */}
      <div className="flex gap-1 border-b border-border pb-1">
        {([['fila', 'Fila de recuperação', MessageCircle], ['historico', 'Histórico WA', History]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold ${activeTab === id ? 'bg-brand text-white' : 'text-muted2 hover:bg-surface2'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
            {id === 'fila' && pending.length > 0 && (
              <span className="ml-0.5 rounded-full bg-warn/30 px-1.5 py-0.5 text-[10px] font-bold text-warn">{pending.length}</span>
            )}
            {id === 'historico' && errMsgs > 0 && (
              <span className="ml-0.5 rounded-full bg-danger/20 px-1.5 py-0.5 text-[10px] font-bold text-danger">{errMsgs}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'historico' && (
        <div className="card overflow-hidden">
          {waMessages.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted2">Nenhuma mensagem WA enviada ainda.</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                  <th className="py-2.5 pl-3 text-left">Quando</th>
                  <th className="py-2.5 text-left">Cliente</th>
                  <th className="py-2.5 text-left">Produto</th>
                  <th className="py-2.5 text-center">Passo</th>
                  <th className="py-2.5 text-left">Telefone</th>
                  <th className="py-2.5 text-center">Status</th>
                  <th className="py-2.5 pr-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {waMessages.map((m) => {
                  const isOk = m.status === 'ok'
                  const wamid = m.response?.messages?.[0]?.id || null
                  const errMsg = m.response?.error?.message || (isOk ? null : 'falhou')
                  return (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-surface2/40">
                      <td className="py-2 pl-3 font-mono text-[11px] text-muted2">
                        {m.created_at ? new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="py-2 font-semibold">{m.customer_name || '—'}</td>
                      <td className="max-w-[160px] truncate py-2 text-muted2" title={m.product || ''}>{m.product || '—'}</td>
                      <td className="py-2 text-center">
                        <span className="rounded-full border border-border2 bg-surface2 px-2 py-0.5 text-[10px] font-semibold text-muted">
                          {STEP_LABEL[m.step ?? 0] || `#${m.step}`}
                        </span>
                      </td>
                      <td className="py-2 font-mono text-[11px] text-muted2">{m.phone || '—'}</td>
                      <td className="py-2 text-center">
                        {isOk ? (
                          <span title={wamid || ''}>
                            <CheckCircle2 className="mx-auto h-4 w-4 text-ok" />
                          </span>
                        ) : (
                          <span title={errMsg || 'falhou'}>
                            <XCircle className="mx-auto h-4 w-4 text-danger" />
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {(!isOk || true) && m.order_id && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => resendMessage(m.order_id!)}
                            disabled={firingId === m.order_id}
                            title={isOk ? 'Avançar próximo passo' : 'Reenviar este passo'}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'fila' && <>
      {/* configuração */}
      <div className="card card-body flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold">Recuperação automática</h3>
          <label className="flex items-center gap-2 text-[12px] text-muted">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            Disparar automaticamente (cron a cada 15min)
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="field">
            <label>Esperar (min) após abandono</label>
            <input type="number" min={1} value={cfg.delay_minutes} onChange={(e) => set('delay_minutes', +e.target.value)} />
          </div>
          <div className="field">
            <label>Janela máx (horas)</label>
            <input type="number" min={1} value={cfg.window_hours} onChange={(e) => set('window_hours', +e.target.value)} />
          </div>
          <div className="field">
            <label>Tentativas / carrinho</label>
            <input type="number" min={1} max={5} value={cfg.max_attempts} onChange={(e) => set('max_attempts', +e.target.value)} />
          </div>
          <div className="field">
            <label>Provedor</label>
            <select value={cfg.provider} onChange={(e) => set('provider', e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Mensagem (variáveis: {'{nome} {produto} {link} {valor}'})</label>
          <textarea
            value={cfg.template}
            onChange={(e) => set('template', e.target.value)}
            rows={3}
            className="resize-y rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-2 text-[12px] text-ink"
          />
          <div className="mt-1 rounded-[7px] border border-border bg-surface2 px-3 py-2 text-[12px] text-muted">
            <span className="text-[10px] uppercase tracking-wide text-muted2">prévia</span>
            <div className="mt-0.5 whitespace-pre-wrap">{previewMsg}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando…' : 'Salvar configuração'}
          </button>
        </div>

        <div className="flex gap-2 rounded-[8px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.06] px-3 py-2.5 text-[11.5px] text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-2" />
          <div>
            As <b>credenciais do provedor</b> ficam só na Vercel (env), nunca aqui. Pro provedor <b>{cfg.provider}</b> configure
            {cfg.provider === 'cloud' && <code> WA_PHONE_ID, WA_TOKEN, WA_TEMPLATE_NAME</code>}
            {cfg.provider === '360dialog' && <code> WA_360_API_KEY, WA_TEMPLATE_NAME</code>}
            {cfg.provider === 'gupshup' && <code> WA_GUPSHUP_KEY, WA_GUPSHUP_SOURCE, WA_GUPSHUP_APP</code>}
            {cfg.provider === 'custom' && <code> WA_CUSTOM_URL, WA_CUSTOM_AUTH, WA_CUSTOM_BODY</code>}
            {' '}e <code>WA_PROVIDER={cfg.provider}</code>. Sem isso, o disparo registra o erro mas não envia.
          </div>
        </div>
      </div>

      {/* fila */}
      <div className="card overflow-hidden">
        <div className="border-b border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted2">
          Fila de recuperação ({pending.length})
        </div>
        {pending.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-muted2">Nenhum carrinho pendente de recuperação. 🎉</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                <th className="py-2 pl-3 text-left">Quando</th>
                <th className="py-2 text-left">Cliente</th>
                <th className="py-2 text-left">Produto</th>
                <th className="py-2 text-right">Valor</th>
                <th className="py-2 text-center">WA</th>
                <th className="py-2 pr-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-surface2/40">
                  <td className="py-2 pl-3 font-mono text-[11px] text-muted2">
                    {o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="py-2">
                    <div>{o.customer_name || '—'}</div>
                    <div className="font-mono text-[10.5px] text-muted2">{o.customer_phone || 'sem telefone'}</div>
                  </td>
                  <td className="py-2">{o.product || '—'}</td>
                  <td className="py-2 text-right">{brl(o.value)}</td>
                  <td className="py-2 text-center">
                    {o.wa_status === 'failed' ? (
                      <span className="text-danger">falhou</span>
                    ) : o.wa_sent_at ? (
                      <span className="text-ok">enviado</span>
                    ) : (
                      <span className="text-muted2">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {o.customer_phone ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => fire([o.id])} disabled={firing} title="Disparar pra este">
                        <MessageCircle className="h-3.5 w-3.5 text-ok" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>}
    </div>
  )
}
