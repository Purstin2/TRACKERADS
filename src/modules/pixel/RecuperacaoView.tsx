import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, RefreshCw, Send, Power, Save, Info, History, CheckCircle2, XCircle, RotateCcw, FileText, TrendingUp, ShieldCheck, ShieldAlert, AlertTriangle, CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import WaTemplatesView from './WaTemplatesView'
import {
  fetchOrders,
  fetchWaConfig,
  fetchWaMessages,
  fetchWaHealth,
  saveWaConfig,
  triggerRecover,
  computeWaConversion,
  waDay,
  brl,
  type KirvanoOrder,
  type WaConfig,
  type WaMessage,
  type WaHealth,
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

// A Cloud API (Meta oficial) cobra pelo Business Manager, não por um provedor terceiro —
// é o mesmo faturamento das contas de anúncio. URL genérica do Billing Hub da Meta;
// se pedir pra escolher o negócio, é o "VC.naoacreditaria".
const META_BILLING_URL = 'https://business.facebook.com/billing_hub/payment_methods'

export default function RecuperacaoView() {
  const [cfg, setCfg] = useState<WaConfig | null>(null)
  const [orders, setOrders] = useState<KirvanoOrder[]>([])
  const [waMessages, setWaMessages] = useState<WaMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [firing, setFiring] = useState(false)
  const [firingId, setFiringId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'fila' | 'historico' | 'templates' | 'conversao'>('fila')
  const [health, setHealth] = useState<WaHealth | null>(null)
  const [checkingHealth, setCheckingHealth] = useState(false)
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
  async function checkHealth() {
    if (!secret) return
    setCheckingHealth(true)
    try {
      setHealth(await fetchWaHealth(secret))
    } catch (e: any) {
      setHealth({ ok: false, configured: true, reason: 'falha ao consultar: ' + e.message })
    }
    setCheckingHealth(false)
  }
  useEffect(() => {
    load()
    checkHealth()
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
  // ⚠ TODOS os hooks têm que vir ANTES dos early returns abaixo. Este useMemo estava
  // lá embaixo (depois do `if (!cfg) return`) — quando a config carregava, o render
  // passava a chamar 1 hook a mais e o React estourava "Rendered more hooks than
  // during the previous render", crashando o painel de volta pra tela "rode o SQL".
  // Parecia que o WhatsApp tinha parado; era só o painel morrendo no carregamento.
  const stats = useMemo(() => computeWaConversion(orders, waMessages), [orders, waMessages])

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

  const okMsgs = waMessages.filter((m) => m.ok === true).length
  const errMsgs = waMessages.filter((m) => m.ok === false).length

  const lastMsgAt = waMessages[0]?.created_at ? new Date(waMessages[0].created_at).getTime() : null
  const minsSinceLastMsg = lastMsgAt ? (Date.now() - lastMsgAt) / 60000 : null
  const stalled = !!cfg.enabled && withPhone.length > 0 && (minsSinceLastMsg === null || minsSinceLastMsg > 240)

  // status "de verdade": combina o toggle local + a saúde real do número na Meta + atividade recente
  type SysStatus = { level: 'ok' | 'warn' | 'err' | 'off'; label: string; detail: string }
  const sysStatus: SysStatus = !cfg.enabled
    ? { level: 'off', label: 'Pausado', detail: 'Disparo automático desligado manualmente (wa_config.enabled=false).' }
    : health && health.configured && !health.ok
    ? {
        level: 'err',
        label: health.billingSuspect ? 'Erro de pagamento no Facebook' : 'Erro no Facebook',
        detail: health.reason || 'A Graph API recusou a consulta ao número — provável token revogado, número desconectado ou cobrança pendente no Business Manager.',
      }
    : health && !health.configured
    ? { level: 'warn', label: 'Não configurado', detail: 'WA_TOKEN/WA_PHONE_ID ausentes na Vercel — o disparo não envia nada.' }
    : health?.qualityBad
    ? { level: 'warn', label: 'Qualidade RUIM', detail: 'quality_rating = RED no número — Meta pode limitar ou bloquear o envio.' }
    : stalled
    ? { level: 'warn', label: 'Sem disparo recente', detail: `Há carrinho elegível na fila mas nenhuma mensagem saiu ${minsSinceLastMsg ? 'há ' + Math.round(minsSinceLastMsg / 60) + 'h' : 'ainda'} — confira se o cron externo (cron-job.org) está rodando.` }
    : { level: 'ok', label: 'Ativo', detail: `Último disparo ${minsSinceLastMsg !== null ? 'há ' + (minsSinceLastMsg < 60 ? Math.round(minsSinceLastMsg) + 'min' : Math.round(minsSinceLastMsg / 60) + 'h') : '—'}. Número e token OK na Meta.` }

  const statusCls: Record<SysStatus['level'], string> = {
    ok: 'border-ok/30 bg-ok/10 text-ok',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    err: 'border-danger/30 bg-danger/10 text-danger',
    off: 'border-border2 bg-surface2 text-muted2',
  }
  const StatusIcon = sysStatus.level === 'ok' ? ShieldCheck : sysStatus.level === 'err' ? ShieldAlert : sysStatus.level === 'warn' ? AlertTriangle : Power

  return (
    <div className="flex flex-col gap-4">
      {/* status + ações rápidas */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          title={sysStatus.detail}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusCls[sysStatus.level]}`}
        >
          <StatusIcon className="h-3 w-3" /> {sysStatus.label}
        </span>
        <span className="text-[12px] text-muted2">
          {pending.length} carrinhos pendentes · {withPhone.length} com telefone
        </span>
        <span className="text-[12px] text-muted2">·</span>
        <span className="text-[12px] text-muted2">
          <span className="text-ok">{okMsgs} enviadas</span>
          {errMsgs > 0 && <span className="ml-1 text-danger">{errMsgs} com erro</span>}
        </span>
        <span className="text-[12px] text-muted2">·</span>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-2">
          <TrendingUp className="h-3.5 w-3.5" /> {(stats.conversionRate * 100).toFixed(1)}% converteu ({stats.converted}/{stats.totalAttempted}) · {brl(stats.revenue)}
        </span>
        <a
          href={META_BILLING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm ml-auto"
          title="Abrir o Billing Hub do Meta Business Manager pra trocar o cartão"
        >
          <CreditCard className="h-3.5 w-3.5" /> Cartão / Faturamento
        </a>
        <button className="btn btn-ghost btn-sm" onClick={() => { load(); checkHealth() }} disabled={loading || checkingHealth}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading || checkingHealth ? 'animate-spin' : ''}`} /> Atualizar
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => fire(withPhone.map((o) => o.id))} disabled={firing || !withPhone.length}>
          <Send className="h-3.5 w-3.5" /> {firing ? 'Enviando…' : `Disparar lote (${withPhone.length})`}
        </button>
      </div>

      {sysStatus.level === 'err' && (
        <div className="flex gap-2 rounded-[8px] border border-danger/30 border-l-[3px] border-l-danger bg-danger/[0.08] px-3 py-2.5 text-[11.5px] text-muted">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <b>{sysStatus.label}.</b> {sysStatus.detail}
            {health?.billingSuspect && (
              <div className="mt-1">
                Verifique o método de pagamento no{' '}
                <a href={META_BILLING_URL} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                  Meta Business Manager → Faturamento
                </a>
                . Enquanto isso, nenhuma mensagem de recuperação sai.
              </div>
            )}
          </div>
        </div>
      )}

      {/* sub-tabs */}
      <div className="flex gap-1 border-b border-border pb-1">
        {([['fila', 'Fila de recuperação', MessageCircle], ['conversao', 'Conversão', TrendingUp], ['historico', 'Histórico WA', History], ['templates', 'Templates', FileText]] as const).map(([id, label, Icon]) => (
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

      {activeTab === 'conversao' && (
        <div className="flex flex-col gap-4">
          {/* saúde do número na Meta */}
          <div className="card card-body flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold">Status no Facebook (Meta Cloud API)</h3>
              <button className="btn btn-ghost btn-sm" onClick={checkHealth} disabled={checkingHealth}>
                <RefreshCw className={`h-3.5 w-3.5 ${checkingHealth ? 'animate-spin' : ''}`} /> Verificar agora
              </button>
            </div>
            {!health ? (
              <div className="text-[12px] text-muted2">{checkingHealth ? 'Consultando a Graph API…' : 'Sem dados ainda.'}</div>
            ) : !health.configured ? (
              <div className="text-[12px] text-warn">WA_TOKEN/WA_PHONE_ID não configurados na Vercel.</div>
            ) : health.ok ? (
              <div className="grid gap-3 text-[12px] sm:grid-cols-4">
                <div><div className="text-muted2">Número</div><div className="font-semibold">{health.phone || '—'}</div></div>
                <div><div className="text-muted2">Nome verificado</div><div className="font-semibold">{health.verifiedName || '—'}</div></div>
                <div><div className="text-muted2">Qualidade</div><div className={`font-semibold ${health.qualityBad ? 'text-danger' : 'text-ok'}`}>{health.qualityRating || '—'}</div></div>
                <div><div className="text-muted2">Limite de envio</div><div className="font-semibold">{health.messagingLimitTier || '—'}</div></div>
              </div>
            ) : (
              <div className="text-[12px] text-danger">{health.reason}</div>
            )}
          </div>

          {/* KPIs de conversão */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="card card-body">
              <div className="text-[10.5px] uppercase tracking-wide text-muted2">Carrinhos com WA enviado</div>
              <div className="mt-1 text-[22px] font-bold">{stats.totalAttempted}</div>
            </div>
            <div className="card card-body">
              <div className="text-[10.5px] uppercase tracking-wide text-muted2">Convertidos</div>
              <div className="mt-1 text-[22px] font-bold text-ok">{stats.converted}</div>
            </div>
            <div className="card card-body">
              <div className="text-[10.5px] uppercase tracking-wide text-muted2">Taxa de conversão</div>
              <div className="mt-1 text-[22px] font-bold text-brand-2">{(stats.conversionRate * 100).toFixed(1)}%</div>
            </div>
            <div className="card card-body">
              <div className="text-[10.5px] uppercase tracking-wide text-muted2">Receita recuperada</div>
              <div className="mt-1 text-[22px] font-bold">{brl(stats.revenue)}</div>
            </div>
          </div>

          {/* qual mensagem converteu */}
          <div className="card overflow-hidden">
            <div className="border-b border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted2">
              Conversão por mensagem da cadência
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                    <th className="py-2 pl-3 text-left">Mensagem</th>
                    <th className="py-2 text-center">Enviadas</th>
                    <th className="py-2 text-center">Convertidas</th>
                    <th className="py-2 pr-3 text-right">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((d) => {
                    const row = stats.byDay[d] || { sent: 0, converted: 0 }
                    const rate = row.sent ? (row.converted / row.sent) * 100 : 0
                    return (
                      <tr key={d} className="border-b border-border/50">
                        <td className="py-2 pl-3 font-semibold">{STEP_LABEL[d]}</td>
                        <td className="py-2 text-center">{row.sent}</td>
                        <td className="py-2 text-center text-ok">{row.converted}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{rate.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* lista das vendas recuperadas */}
          <div className="card overflow-hidden">
            <div className="border-b border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted2">
              Vendas recuperadas ({stats.conversions.length})
            </div>
            {stats.conversions.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-muted2">Nenhuma conversão registrada ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                      <th className="py-2 pl-3 text-left">Quando</th>
                      <th className="py-2 text-left">Cliente</th>
                      <th className="py-2 text-left">Produto</th>
                      <th className="py-2 text-center">Convertido no</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.conversions.map(({ order: o, day }) => (
                      <tr key={o.id} className="border-b border-border/50 hover:bg-surface2/40">
                        <td className="py-2 pl-3 font-mono text-[11px] text-muted2">
                          {o.updated_at ? new Date(o.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-2 font-semibold">{o.customer_name || '—'}</td>
                        <td className="max-w-[200px] truncate py-2 text-muted2" title={o.product || ''}>{o.product || '—'}</td>
                        <td className="py-2 text-center">
                          <span className="rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[10px] font-semibold text-ok">
                            {day ? STEP_LABEL[day] : '—'}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold">{brl(o.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'historico' && (
        <div className="card overflow-hidden">
          {waMessages.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted2">Nenhuma mensagem WA enviada ainda.</div>
          ) : (
            <div className="overflow-x-auto">
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
                    const isOk = m.ok === true
                    const day = waDay(m.body)
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
                            {day ? STEP_LABEL[day] : '—'}
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
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && <WaTemplatesView />}

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
          <div className="overflow-x-auto">
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
          </div>
        )}
      </div>
      </>}
    </div>
  )
}
