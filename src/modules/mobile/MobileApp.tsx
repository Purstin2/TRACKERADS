import { useEffect, useRef, useState } from 'react'
import { Zap, Bell, BellRing, RefreshCw, Download, TrendingUp, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// dia comercial BR (UTC-3) — alinhado com a dashboard
const BR_OFFSET_MS = 3 * 3600000
function brtTodayStartISO() {
  const brt = new Date(Date.now() - BR_OFFSET_MS)
  brt.setUTCHours(0, 0, 0, 0)
  return new Date(brt.getTime() + BR_OFFSET_MS).toISOString()
}
const brl = (v?: number | null) =>
  'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PM: Record<string, { label: string; icon: string }> = {
  PIX: { label: 'Pix', icon: '⚡' },
  CREDIT_CARD: { label: 'Cartão', icon: '💳' },
  CARD: { label: 'Cartão', icon: '💳' },
  APPLE_PAY: { label: 'Apple Pay', icon: '' },
  GOOGLE_PAY: { label: 'Google Pay', icon: '🟢' },
  BANK_SLIP: { label: 'Boleto', icon: '🧾' },
  BOLETO: { label: 'Boleto', icon: '🧾' },
}
const pm = (m?: string | null) => PM[(m || '').toUpperCase()] || { label: m || '—', icon: '🛒' }
const firstName = (n?: string | null) => (n || '').trim().split(' ')[0] || 'Cliente'
const hhmm = (iso?: string | null) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

interface Order {
  id: string
  product: string | null
  value: number | null
  customer_name: string | null
  payment_method: string | null
  status: string | null
  ordered_at: string | null
  created_at: string | null
}

// converte a chave VAPID (base64url) pra Uint8Array (exigido pelo pushManager)
function urlB64ToUint8(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}
// inscreve o dispositivo no push em segundo plano (notifica com o app fechado)
async function subscribePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const vapid = import.meta.env.VITE_VAPID_PUBLIC as string | undefined
    if (!vapid) return
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapid) as unknown as BufferSource }))
    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub }),
    })
  } catch {}
}

// bipe curto via Web Audio (sem precisar de arquivo)
function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
    const a = new Ctx()
    const o = a.createOscillator()
    const g = a.createGain()
    o.connect(g); g.connect(a.destination)
    o.type = 'sine'; o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.35, a.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.45)
    o.start(); o.stop(a.currentTime + 0.45)
  } catch {}
}

export default function MobileApp() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState('')
  const [notif, setNotif] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  )
  const [installEvt, setInstallEvt] = useState<any>(null)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const seen = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)
  const connected = !!supabase()

  function notifySale(o: Order) {
    beep()
    try { navigator.vibrate?.([200, 100, 200]) } catch {}
    if (notif === 'granted') {
      try {
        new Notification('💰 Nova venda — ' + brl(o.value), {
          body: `${o.product || 'Produto'} · ${firstName(o.customer_name)}`,
          icon: '/app-icon-192.png',
          tag: o.id,
        })
      } catch {}
    }
    setFlashIds((s) => new Set(s).add(o.id))
    setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(o.id); return n }), 6000)
  }

  async function fetchSales() {
    const sb = supabase()
    if (!sb) { setLoading(false); return }
    const { data } = await sb
      .from('kirvano_orders')
      .select('id,product,value,customer_name,payment_method,status,ordered_at,created_at')
      .gte('created_at', brtTodayStartISO())
      .order('created_at', { ascending: false })
      .limit(120)
    const approved = ((data || []) as Order[]).filter((o) => (o.status || '').toUpperCase() === 'APPROVED')
    if (!firstLoad.current) {
      approved.filter((o) => !seen.current.has(o.id)).forEach(notifySale)
    }
    approved.forEach((o) => seen.current.add(o.id))
    firstLoad.current = false
    setOrders(approved)
    setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    setLoading(false)
  }

  useEffect(() => {
    fetchSales()
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribePush()
    const t = setInterval(fetchSales, 25000)
    const onVis = () => { if (document.visibilityState === 'visible') fetchSales() }
    document.addEventListener('visibilitychange', onVis)
    const onInstall = (e: Event) => { e.preventDefault(); setInstallEvt(e) }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('beforeinstallprompt', onInstall)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function askNotif() {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setNotif(p)
    if (p === 'granted') {
      beep()
      subscribePush() // push em segundo plano (avisa mesmo com o app fechado)
      try { new Notification('🔔 Alertas ativados', { body: 'Você será avisado a cada venda — mesmo com o app fechado.', icon: '/app-icon-192.png' }) } catch {}
    }
  }
  async function doInstall() {
    if (!installEvt) return
    installEvt.prompt()
    await installEvt.userChoice
    setInstallEvt(null)
  }

  const total = orders.reduce((s, o) => s + (o.value || 0), 0)
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches

  return (
    <div
      className="min-h-screen bg-bg text-ink"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* header */}
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-xl"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand">
          <Zap className="h-5 w-5 fill-white text-white" />
        </span>
        <div className="flex-1">
          <div className="text-[15px] font-extrabold leading-none">Vendas</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
            </span>
            ao vivo {updatedAt && `· ${updatedAt}`}
          </div>
        </div>
        <button onClick={fetchSales} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border text-muted2 active:scale-95">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <main className="mx-auto max-w-[560px] px-4 pb-24 pt-4">
        {/* total do dia */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface2 p-5 shadow-card-sm">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted2">
            <TrendingUp className="h-3.5 w-3.5" /> Faturamento de hoje
          </div>
          <div className="mt-1 text-[40px] font-extrabold leading-none text-ok">{brl(total)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
            <ShoppingBag className="h-4 w-4 text-brand-2" />
            <b className="text-ink">{orders.length}</b> venda{orders.length === 1 ? '' : 's'} aprovada{orders.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* ativar notificações */}
        {notif !== 'granted' && (
          <button onClick={askNotif} className="mt-3 flex w-full items-center gap-3 rounded-xl2 border border-brand/30 bg-brand/[0.08] p-3.5 text-left active:scale-[0.99]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-2"><Bell className="h-5 w-5" /></span>
            <div className="flex-1">
              <div className="text-[14px] font-bold">Ativar alertas de venda</div>
              <div className="text-[12px] text-muted">Toque pra ser avisado a cada venda 🔔</div>
            </div>
          </button>
        )}
        {notif === 'granted' && (
          <div className="mt-3 flex items-center gap-2 rounded-xl2 border border-ok/25 bg-ok/[0.06] px-3.5 py-2.5 text-[12px] text-ok">
            <BellRing className="h-4 w-4" /> Alertas de venda ativados
          </div>
        )}

        {/* instalar */}
        {!standalone && installEvt && (
          <button onClick={doInstall} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl2 border border-border bg-surface2 py-3 text-[13px] font-semibold active:scale-[0.99]">
            <Download className="h-4 w-4 text-brand-2" /> Instalar app na tela inicial
          </button>
        )}
        {!standalone && isIOS && (
          <div className="mt-3 rounded-xl2 border border-border bg-surface2 px-3.5 py-2.5 text-[12px] text-muted">
            📲 Pra instalar: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>
          </div>
        )}

        {/* lista de vendas */}
        <div className="mt-5 mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-bold text-muted">Vendas de hoje</h2>
          {!connected && <span className="text-[11px] text-danger">sem conexão Supabase</span>}
        </div>

        {loading && orders.length === 0 ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-xl2 border border-border bg-surface" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
            Nenhuma venda aprovada hoje ainda.<br />Os alertas chegam assim que a primeira cair. 💪
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {orders.map((o) => {
              const p = pm(o.payment_method)
              const flash = flashIds.has(o.id)
              return (
                <div
                  key={o.id}
                  className={`flex items-center gap-3 rounded-xl2 border bg-surface p-3.5 transition-colors ${flash ? 'border-ok bg-ok/[0.06]' : 'border-border'}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 text-[18px]">{p.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">{firstName(o.customer_name)}</div>
                    <div className="truncate text-[12px] text-muted2">{o.product || 'Produto'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-extrabold text-ok">{brl(o.value)}</div>
                    <div className="text-[10.5px] text-muted2">{p.label} · {hhmm(o.ordered_at || o.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-muted2">Atualiza sozinho a cada 25s · puxe pra cima e toque ↻ pra forçar</p>
      </main>
    </div>
  )
}
