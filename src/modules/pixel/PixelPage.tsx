import { useState } from 'react'
import { Crosshair, Copy, Check, Webhook, Plug, ShoppingCart, ScrollText } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import PedidosView from './PedidosView'
import LogsView from './LogsView'

interface PixelCfg {
  pixelId: string
  capiToken: string
  webhookSecret: string
  gateway: string
  testEventCode: string
}
const LS = 'purstin_pixel'
function loadCfg(): PixelCfg {
  try {
    return { pixelId: '', capiToken: '', webhookSecret: '', gateway: 'kirvano', testEventCode: '', ...JSON.parse(localStorage.getItem(LS) || '{}') }
  } catch {
    return { pixelId: '', capiToken: '', webhookSecret: '', gateway: 'kirvano', testEventCode: '' }
  }
}

const TABS = [
  { id: 'pedidos', label: 'Pedidos', icon: ShoppingCart },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'webhook', label: 'Webhook', icon: Webhook },
  { id: 'conexoes', label: 'Conexões', icon: Plug },
]

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="field">
      <label>{label}</label>
      <div className="flex gap-1.5">
        <input readOnly value={value} className="flex-1 font-mono text-[11px]" />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

export default function PixelPage() {
  const [cfg, setCfg] = useState<PixelCfg>(loadCfg)
  const [tab, setTab] = useState('pedidos')
  const set = (k: keyof PixelCfg, v: string) => setCfg((c) => ({ ...c, [k]: v }))
  const save = () => {
    localStorage.setItem(LS, JSON.stringify(cfg))
    toast('Configuração salva', 'ok')
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const webhookUrl = `${origin}/api/webhook?gateway=${cfg.gateway}${cfg.webhookSecret ? `&secret=${cfg.webhookSecret}` : ''}`

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 text-brand-2">
          <Crosshair className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Pixel — atribuição própria</h2>
          <p className="text-[12px] text-muted">Webhook da Kirvano → pedidos, carrinhos abandonados, logs e Conversions API com deduplicação.</p>
        </div>
      </div>

      <div className="mb-5 flex gap-1.5 border-b border-border pb-3">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.id ? 'bg-brand text-white' : 'text-muted2 hover:bg-surface2'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'pedidos' && <PedidosView />}
      {tab === 'logs' && <LogsView />}

      {tab === 'conexoes' && (
        <div className="mx-auto flex max-w-[640px] flex-col gap-4">
          <div className="card card-body">
            <h3 className="mb-3 text-[13px] font-bold">Meta Conversions API</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>Pixel ID</label>
                <input value={cfg.pixelId} onChange={(e) => set('pixelId', e.target.value)} placeholder="000000000000" />
              </div>
              <div className="field">
                <label>Test Event Code (opcional)</label>
                <input value={cfg.testEventCode} onChange={(e) => set('testEventCode', e.target.value)} placeholder="TEST12345" />
              </div>
              <div className="field sm:col-span-2">
                <label>CAPI Access Token</label>
                <input type="password" value={cfg.capiToken} onChange={(e) => set('capiToken', e.target.value)} placeholder="EAA..." />
                <div className="text-[11px] text-muted2">Events Manager → Configurações → Conversions API → Gerar token de acesso.</div>
              </div>
            </div>
          </div>
          <div className="card card-body">
            <h3 className="mb-3 text-[13px] font-bold">Gateway</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label>Plataforma</label>
                <select value={cfg.gateway} onChange={(e) => set('gateway', e.target.value)}>
                  <option value="kirvano">Kirvano</option>
                  <option value="hotmart">Hotmart</option>
                  <option value="generico">Genérico (JSON)</option>
                </select>
              </div>
              <div className="field">
                <label>Segredo do webhook</label>
                <input value={cfg.webhookSecret} onChange={(e) => set('webhookSecret', e.target.value)} placeholder="uma senha forte" />
              </div>
            </div>
          </div>
          <button className="btn btn-primary w-fit" onClick={save}>
            <Check className="h-4 w-4" /> Salvar configuração
          </button>
          <div className="rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.06] px-3.5 py-2.5 text-[11.5px] text-muted">
            ⓘ Estas chaves ficam no navegador só pra montar a URL. Para o servidor processar de verdade, as mesmas vão como
            variáveis de ambiente na Vercel (<code>META_PIXEL_ID</code>, <code>META_CAPI_TOKEN</code>, <code>WEBHOOK_SECRET</code>, <code>SUPABASE_SERVICE_KEY</code>).
          </div>
        </div>
      )}

      {tab === 'webhook' && (
        <div className="mx-auto flex max-w-[640px] flex-col gap-4">
          <div className="card card-body">
            <h3 className="mb-3 text-[13px] font-bold">URL do webhook</h3>
            <p className="mb-3 text-[12px] text-muted">
              Na Kirvano: <b>Integrações → Webhooks → Criar Webhook</b>. Cole esta URL e marque <b>TODOS os eventos</b> — principalmente
              <b> Carrinho abandonado</b>, Compra aprovada, Compra recusada, Pix gerado, Reembolso e Chargeback. Use o mesmo segredo no campo <b>Token</b>.
            </p>
            <CopyField label="Endpoint" value={webhookUrl} />
            {!cfg.webhookSecret && (
              <div className="mt-2 text-[11px] text-warn">⚠ Defina um segredo na aba Conexões — sem ele qualquer um pode mandar pedidos falsos.</div>
            )}
          </div>
          <div className="card card-body text-[12px] text-muted">
            <h3 className="mb-2 text-[13px] font-bold text-ink">O que acontece em cada hit</h3>
            <ol className="ml-4 list-decimal space-y-1.5">
              <li>A Kirvano dispara o webhook a cada evento (venda <i>e</i> carrinho abandonado).</li>
              <li>A função serverless valida o segredo e <b>registra o hit</b> em <code>kirvano_webhook_logs</code> (aba Logs — é onde você confirma que tá pegando).</li>
              <li><b>Salva/atualiza o pedido</b> em <code>kirvano_orders</code> pela <code>checkout_id</code> — o mesmo carrinho vira venda no mesmo registro (aba Pedidos).</li>
              <li>Se for <b>aprovada</b>, reenvia um <b>Purchase</b> ao Meta (CAPI) com <code>event_id</code> = id da venda → dedup com o pixel do navegador.</li>
              <li>Carrinho abandonado fica com botão de <b>recuperar no WhatsApp</b> (e, no futuro, disparo automático).</li>
            </ol>
            <div className="mt-3 rounded-[8px] border border-border bg-[#0a0c19] p-3 text-[11px]">
              <b className="text-ink">Antes de funcionar:</b> rode o SQL <code>supabase/kirvano_orders.sql</code> na sua Supabase e configure na Vercel:
              <code> META_PIXEL_ID</code>, <code>META_CAPI_TOKEN</code>, <code>WEBHOOK_SECRET</code>, <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_KEY</code>.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
