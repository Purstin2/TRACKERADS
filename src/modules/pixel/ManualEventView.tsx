import { useEffect, useState } from 'react'
import { Send, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import { fetchRoutes, type PixelRoute } from './pixels'

// segredo do webhook (mesmo da aba Conexões) — exigido pelo endpoint
function getSecret(): string {
  try { return JSON.parse(localStorage.getItem('purstin_pixel') || '{}').webhookSecret || '' } catch { return '' }
}

const EMPTY = { offerId: '', value: '', orderId: '', name: '', email: '', phone: '', cpf: '', ip: '', sourceUrl: '' }

export default function ManualEventView() {
  const [routes, setRoutes] = useState<PixelRoute[]>([])
  const [f, setF] = useState({ ...EMPTY })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)
  const connected = !!supabase()
  const set = (k: keyof typeof EMPTY, v: string) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { if (connected) fetchRoutes().then(setRoutes).catch(() => {}) }, [connected])

  async function fire(test = false) {
    if (!f.offerId) return toast('Escolha a oferta/pixel', 'err')
    if (!f.value || isNaN(parseFloat(f.value))) return toast('Informe o valor', 'err')
    const secret = getSecret()
    if (!secret) return toast('Defina o Segredo do Webhook na aba Conexões primeiro', 'err')
    const [name, ...rest] = (f.name || '').trim().split(' ')
    setSending(true); setResult(null)
    try {
      const r = await fetch(`/api/manual-event?secret=${encodeURIComponent(secret)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: f.offerId,
          eventName: 'Purchase',
          value: parseFloat(f.value),
          currency: 'BRL',
          orderId: f.orderId || undefined,
          email: f.email || undefined,
          phone: f.phone || undefined,
          cpf: f.cpf || undefined,
          firstName: name || undefined,
          lastName: rest.join(' ') || undefined,
          ip: f.ip || undefined,
          sourceUrl: f.sourceUrl || undefined,
          testCode: test ? (routes.find((x) => x.offer_id === f.offerId)?.test_code || 'TEST') : undefined,
        }),
      })
      const j = await r.json()
      setResult(j)
      if (j.ok) toast(test ? '✓ Teste enviado (veja no Test Events)' : '✓ Venda enviada ao Meta!', 'ok')
      else toast('✗ ' + (j.error || 'falhou'), 'err')
    } catch {
      toast('Falha de rede', 'err')
    }
    setSending(false)
  }

  if (!connected) {
    return <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">Conecte a Supabase pra cadastrar/disparar.</div>
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4">
      <div className="rounded-[10px] border border-brand/20 border-l-[3px] border-l-brand bg-brand/[0.05] px-4 py-3 text-[12px] leading-relaxed text-muted">
        Pra vendas que <b>não passaram pela Kirvano</b> (ex: cliente pagou Pix direto no seu CNPJ).
        Dispara um <b>Purchase</b> pro pixel da oferta com os dados do cliente (bom match). Não duplica:
        essa venda não foi enviada por ninguém.
      </div>

      <div className="card card-body grid gap-3">
        <div className="field">
          <label>Oferta / Pixel</label>
          <select value={f.offerId} onChange={(e) => set('offerId', e.target.value)}>
            <option value="">— escolha —</option>
            {routes.filter((r) => r.offer_id).map((r) => (
              <option key={r.id} value={r.offer_id as string}>{r.label || r.pixel_id} → pixel {r.pixel_id}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field"><label>Valor total (R$)</label><input value={f.value} onChange={(e) => set('value', e.target.value)} placeholder="94.80" inputMode="decimal" /></div>
          <div className="field"><label>ID do pedido (dedup)</label><input value={f.orderId} onChange={(e) => set('orderId', e.target.value)} placeholder="5NYQ1WWK" /></div>
        </div>
        <div className="field"><label>Nome do cliente</label><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Lucas Bianchi" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field"><label>E-mail</label><input value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="cliente@email.com" /></div>
          <div className="field"><label>Telefone</label><input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+55 47 99999-9999" /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field"><label>CPF</label><input value={f.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" /></div>
          <div className="field"><label>IP do comprador</label><input value={f.ip} onChange={(e) => set('ip', e.target.value)} placeholder="2601:..." /></div>
        </div>
        <div className="text-[11px] text-muted2">Quanto mais dados (email, CPF, telefone, IP), melhor o match no Meta. Mínimo: oferta + valor.</div>

        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => fire(true)} disabled={sending}>Testar (Test Events)</button>
          <button className="btn btn-primary" onClick={() => fire(false)} disabled={sending}>
            {sending ? 'Enviando…' : <><Send className="h-4 w-4" /> Disparar venda</>}
          </button>
        </div>
      </div>

      {result && (
        <div className={`rounded-xl2 border px-4 py-3 text-[12px] ${result.ok ? 'border-ok/30 bg-ok/[0.06] text-ok' : 'border-danger/30 bg-danger/[0.06] text-danger'}`}>
          {result.ok ? (
            <div className="flex items-center gap-2"><Check className="h-4 w-4" /> Enviado ao pixel {result.pixel} · {result.events_received} evento(s) · fbtrace {result.fbtrace_id}</div>
          ) : (
            <div>✗ {result.error}{result.details ? ' — ' + result.details : ''}</div>
          )}
        </div>
      )}
    </div>
  )
}
