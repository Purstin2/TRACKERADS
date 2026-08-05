import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Bell, BellRing, RefreshCw, Download, TrendingUp, ShoppingBag, Target, LayoutDashboard, ListOrdered, Megaphone, LayoutGrid, ChevronRight } from 'lucide-react'
import { NAV } from '@/lib/nav'
import MobileCamps from './MobileCamps'
import PeriodBar from './PeriodBar'
import { resolvePeriod, type PeriodValue } from './period'
import { supabase } from '@/lib/supabase'
import { loadTaxas, syncTaxas, feeItemsForOrder, sumFees, type TaxasConfig } from '@/modules/taxas/taxas'
import type { KirvanoOrder } from '@/modules/pixel/orders'

// o dia comercial BR agora vive em ./period (usado pelas 3 abas)
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
  products: any[] | null
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
    await fetch('/api/mobile?fn=push-subscribe', {
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

interface AdStats { spend: number; impressions: number; clicks: number }

/* ── Aba "Mais": ponte pro app completo ──────────────────────────────────────
 * As 3 abas nativas cobrem o dia a dia (vender, escalar, conferir). O resto do
 * sistema — Públicos, Pixel, Recuperação/WhatsApp, Gastos, Taxas, Uploader —
 * já existe e já é responsivo no shell principal; o que faltava era CHEGAR nele
 * pelo celular. Cada item abre a tela completa, com menu lateral e tudo.
 *
 * Isso só funciona porque o scope do manifest virou "/": com "/app" o celular
 * jogava esses links pro navegador e você saía do app instalado. */
function MaisTab() {
  return (
    <div className="mt-1">
      <div className="rounded-xl2 border border-brand/25 bg-brand/[0.06] px-4 py-3 text-[12.5px] leading-snug text-brand-2">
        Tudo que tem no computador está aqui. Abre a tela cheia, com o menu lateral —
        as tabelas rolam pro lado quando não cabem.
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.id} className="overflow-hidden rounded-xl2 border border-border bg-surface">
              <Link
                to={item.to}
                className="flex items-center gap-3 px-4 py-3.5 active:bg-surface2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface2">
                  <Icon className="h-[18px] w-[18px] text-brand-2" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink">{item.label}</span>
                  {item.children && (
                    <span className="block truncate text-[11.5px] text-muted2">
                      {item.children.map((c) => c.label).join(' · ')}
                    </span>
                  )}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted2" />
              </Link>

              {/* subtelas do Monitor viram atalho direto — no celular, chegar em
                  "Públicos" ou "Criativos" sem passar por 2 menus importa */}
              {item.children && item.children.length > 1 && (
                <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 py-2.5">
                  {item.children.map((c) => (
                    <Link
                      key={c.to}
                      to={c.to}
                      className="rounded-full border border-border bg-surface2 px-3 py-1.5 text-[11.5px] font-semibold text-muted active:scale-[0.97]"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted2">
        Pra voltar pra cá, é só tocar no ⚡ no topo da tela cheia.
      </p>
    </div>
  )
}

export default function MobileApp() {
  const [tab, setTab] = useState<'vendas' | 'dash' | 'camps' | 'mais'>('vendas')
  const [periodo, setPeriodo] = useState<PeriodValue>({ id: 'today' })
  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [taxasCfg, setTaxasCfg] = useState<TaxasConfig>(loadTaxas)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState('')
  const [adStats, setAdStats] = useState<AdStats | null>(null)
  const [notif, setNotif] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  )
  const [installEvt, setInstallEvt] = useState<any>(null)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const seen = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)
  // qual janela está carregada agora — trocar de período recarrega vendas
  // antigas, e sem isso o app tocaria o alerta de "venda nova" pra cada uma
  const janelaRef = useRef('')
  const connected = !!supabase()
  /** janela resolvida do período escolhido (rótulos e filtros da tela) */
  const jan = useMemo(() => resolvePeriod(periodo), [periodo])

  function notifySale(o: Order) {
    beep()
    try { navigator.vibrate?.([200, 100, 200]) } catch {}
    if (notif === 'granted') {
      // iOS só aceita showNotification via service worker — new Notification() é ignorado.
      // Usamos SW em todos os casos pra garantir compatibilidade.
      const title = '💰 Nova venda — ' + brl(o.value)
      const opts = {
        body: `${o.product || 'Produto'} · ${firstName(o.customer_name)}`,
        icon: '/app-icon-192.png',
        badge: '/app-icon-192.png',
        vibrate: [200, 100, 200],
        tag: o.id,
        data: { url: '/app' },
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification(title, opts))
          .catch(() => {
            try { new Notification(title, opts) } catch {}
          })
      } else {
        try { new Notification(title, opts) } catch {}
      }
    }
    setFlashIds((s) => new Set(s).add(o.id))
    setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(o.id); return n }), 6000)
  }

  async function fetchSales() {
    const sb = supabase()
    if (!sb) { setLoading(false); return }
    const j = resolvePeriod(periodo)
    const trocouJanela = janelaRef.current !== j.sinceISO + '|' + j.untilISO
    janelaRef.current = j.sinceISO + '|' + j.untilISO

    // Busca por created_at com 1 dia de folga dos dois lados e filtra depois pela
    // data REAL da venda. Uma venda das 23h50 pode ser gravada às 00h05 do dia
    // seguinte; filtrando direto por created_at ela sumiria do dia dela.
    const folga = (iso: string, dias: number) =>
      new Date(new Date(iso).getTime() + dias * 86400000).toISOString()
    const [{ data }, adsRes] = await Promise.all([
      sb
        .from('kirvano_orders')
        .select('id,product,products,value,fee_gateway,customer_name,payment_method,status,ordered_at,created_at')
        .gte('created_at', folga(j.sinceISO, -1))
        .lt('created_at', folga(j.untilISO, 1))
        .order('created_at', { ascending: false })
        .limit(2000),
      fetch(`/api/mobile?fn=meta-today&${new URLSearchParams(j.apiParams)}`).then((r) => r.json()).catch(() => null),
    ])
    const dentro = (o: Order) => {
      const d = o.ordered_at || o.created_at
      return !!d && d >= j.sinceISO && d < j.untilISO
    }
    const all = ((data || []) as Order[]).filter(dentro)
    setAllOrders(all)
    const approved = all.filter((o) => (o.status || '').toUpperCase() === 'APPROVED')
    // só avisa venda nova quando estou olhando HOJE e não acabei de trocar de
    // período (senão o app apitaria pra cada venda antiga que entrou na lista)
    if (!firstLoad.current && !trocouJanela && periodo.id === 'today') {
      approved.filter((o) => !seen.current.has(o.id)).forEach(notifySale)
    }
    approved.forEach((o) => seen.current.add(o.id))
    firstLoad.current = false
    setOrders(approved)
    if (adsRes?.ok) setAdStats({ spend: adsRes.spend || 0, impressions: adsRes.impressions || 0, clicks: adsRes.clicks || 0 })
    setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    setLoading(false)
  }

  useEffect(() => {
    syncTaxas().then(setTaxasCfg)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') subscribePush()
    const onInstall = (e: Event) => { e.preventDefault(); setInstallEvt(e) }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Busca + auto-refresh ficam AMARRADOS ao período: se o intervalo fosse criado
  // só na montagem, o closure guardaria o período daquele instante e o refresh de
  // 25s continuaria buscando "hoje" mesmo depois de você escolher 30 dias.
  useEffect(() => {
    fetchSales()
    const t = setInterval(fetchSales, 25000)
    const onVis = () => { if (document.visibilityState === 'visible') fetchSales() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo])

  async function askNotif() {
    if (typeof Notification === 'undefined') return
    // iOS só suporta push se estiver instalado como PWA (home screen).
    // Pedir permissão fora do standalone no iOS não tem efeito.
    if (isIOS && !standalone) {
      alert('No iPhone, instale o app na tela inicial primeiro (Compartilhar → Adicionar à Tela de Início) e depois ative as notificações.')
      return
    }
    const p = await Notification.requestPermission()
    setNotif(p)
    if (p === 'granted') {
      beep()
      subscribePush()
      // usa SW pra exibir a notificação de confirmação (iOS exige SW)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification('🔔 Alertas ativados', { body: 'Você será avisado a cada venda — mesmo com o app fechado.', icon: '/app-icon-192.png' }))
          .catch(() => {})
      }
    }
  }
  async function doInstall() {
    if (!installEvt) return
    installEvt.prompt()
    await installEvt.userChoice
    setInstallEvt(null)
  }

  const total = orders.reduce((s, o) => s + (o.value || 0), 0)
  const spend = adStats?.spend ?? 0
  const roas = spend > 0 ? total / spend : null
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches

  // P&L do dia — taxas POR PRODUTO da aba Taxas (mesma conta do Dashboard desktop)
  const dash = useMemo(() => {
    let taxasVal = 0
    let impostoVal = 0
    let custoVal = 0
    orders.forEach((o) => {
      const s = sumFees(feeItemsForOrder(taxasCfg, o as unknown as KirvanoOrder))
      const v = o.value || 0
      // taxa REAL quando o gateway informou (ver realbuild.ts) — mesma regra
      const feeReal = (o as { fee_gateway?: number | null }).fee_gateway
      taxasVal += feeReal != null
        ? Number(feeReal)
        : (v * s.byCat.taxa.pct) / 100 + s.byCat.taxa.fixo
      impostoVal += (v * s.byCat.imposto.pct) / 100 + s.byCat.imposto.fixo
      custoVal += (v * s.byCat.custo.pct) / 100 + s.byCat.custo.fixo
    })
    const fatLiquido = total - taxasVal - impostoVal
    const lucro = fatLiquido - custoVal - spend
    const iniciadas = allOrders.filter((o) => (o.status || '').toUpperCase() !== 'ABANDONED').length
    const pend = allOrders.filter((o) => (o.status || '').toUpperCase() === 'PENDING')
    const prod: Record<string, { n: number; v: number }> = {}
    orders.forEach((o) => {
      const name = o.product || '(sem produto)'
      if (!prod[name]) prod[name] = { n: 0, v: 0 }
      prod[name].n++
      prod[name].v += o.value || 0
    })
    return {
      fatLiquido,
      lucro,
      descontos: taxasVal + impostoVal + custoVal,
      margem: fatLiquido !== 0 ? (lucro / fatLiquido) * 100 : null,
      cpa: orders.length ? spend / orders.length : null,
      aprovPct: iniciadas ? (orders.length / iniciadas) * 100 : null,
      iniciadas,
      pendCount: pend.length,
      pendVal: pend.reduce((s, o) => s + (o.value || 0), 0),
      topProd: Object.entries(prod).sort((a, b) => b[1].v - a[1].v).slice(0, 6),
    }
  }, [orders, allOrders, taxasCfg, total, spend])

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
          <div className="text-[15px] font-extrabold leading-none">
            {tab === 'vendas' ? 'Vendas' : tab === 'dash' ? 'Dashboard' : tab === 'mais' ? 'Mais' : 'Campanhas'}
          </div>
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

      <main className="mx-auto max-w-[560px] px-4 pb-28 pt-4">
        {/* o período vale pras abas de dados; em "Mais" não faz sentido */}
        {tab !== 'mais' && <PeriodBar value={periodo} onChange={setPeriodo} />}

        {tab === 'mais' ? (
          <MaisTab />
        ) : tab === 'vendas' ? (
        <>
        {/* total do dia */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface2 p-5 shadow-card-sm">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted2">
            <TrendingUp className="h-3.5 w-3.5" /> Faturamento · {jan.label}
          </div>
          <div className="mt-1 text-[40px] font-extrabold leading-none text-ok">{brl(total)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
            <ShoppingBag className="h-4 w-4 text-brand-2" />
            <b className="text-ink">{orders.length}</b> venda{orders.length === 1 ? '' : 's'} aprovada{orders.length === 1 ? '' : 's'}
          </div>

          {/* ROAS + Gasto — só aparece se a API de Ads estiver configurada */}
          {adStats && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted2">
                  <Target className="h-3 w-3" /> Gasto em Ads
                </div>
                <div className="text-[20px] font-extrabold leading-none text-warn">{brl(spend)}</div>
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted2">ROAS</div>
                {roas !== null ? (
                  <div className={`text-[20px] font-extrabold leading-none ${roas >= 1.23 ? 'text-ok' : 'text-danger'}`}>
                    {roas.toFixed(2)}×
                  </div>
                ) : (
                  <div className="text-[20px] font-extrabold leading-none text-muted2">—</div>
                )}
                {roas !== null && (
                  <div className={`text-[10px] font-semibold ${roas >= 1.23 ? 'text-ok/70' : 'text-danger/70'}`}>
                    {roas >= 1.23 ? '✓ acima do BE' : '✗ abaixo do BE 1.23'}
                  </div>
                )}
              </div>
            </div>
          )}
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
          <div className="mt-3 rounded-xl2 border border-warn/30 bg-warn/[0.06] px-3.5 py-2.5 text-[12px] text-muted">
            📲 <b>iPhone:</b> as notificações com o app fechado exigem que você instale o app na tela inicial.<br />
            Toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> e depois ative os alertas.
          </div>
        )}

        {/* lista de vendas */}
        <div className="mt-5 mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-bold text-muted">Vendas · {jan.label}</h2>
          {!connected && <span className="text-[11px] text-danger">sem conexão Supabase</span>}
        </div>

        {loading && orders.length === 0 ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-xl2 border border-border bg-surface" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
            Nenhuma venda aprovada no período.<br />Os alertas chegam assim que a primeira cair. 💪
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

        </>
        ) : tab === 'camps' ? (
          <MobileCamps periodo={periodo} />
        ) : (
        <>
        {/* ── DASHBOARD do dia ── */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface2 p-5 shadow-card-sm">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted2">Lucro · {jan.label}</div>
          <div className={`mt-1 text-[40px] font-extrabold leading-none ${dash.lucro >= 0 ? 'text-ok' : 'text-danger'}`}>{brl(dash.lucro)}</div>
          <div className="mt-2 text-[12px] text-muted">
            líquido {brl(dash.fatLiquido)} − ads {brl(spend)} · taxas/custos por produto (aba Taxas)
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { k: 'Faturamento', v: brl(total), cls: 'text-ink' },
            { k: 'Gasto Ads', v: brl(spend), cls: 'text-warn' },
            { k: 'ROAS', v: roas !== null ? roas.toFixed(2) + '×' : '—', cls: roas !== null && roas >= 1.23 ? 'text-ok' : 'text-danger' },
            { k: 'CPA', v: dash.cpa !== null ? brl(dash.cpa) : '—', cls: 'text-ink' },
            { k: 'Margem', v: dash.margem !== null ? dash.margem.toFixed(0) + '%' : '—', cls: dash.margem !== null && dash.margem >= 0 ? 'text-ok' : 'text-danger' },
            { k: 'Taxas+custos', v: brl(dash.descontos), cls: 'text-muted' },
          ].map((c) => (
            <div key={c.k} className="rounded-xl2 border border-border bg-surface p-3.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted2">{c.k}</div>
              <div className={`mt-0.5 text-[20px] font-extrabold leading-none ${c.cls}`}>{c.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl2 border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-bold text-muted">Aprovação · {jan.label}</div>
            <div className={`text-[16px] font-extrabold ${dash.aprovPct !== null && dash.aprovPct >= 60 ? 'text-ok' : 'text-warn'}`}>
              {dash.aprovPct !== null ? dash.aprovPct.toFixed(0) + '%' : '—'}
            </div>
          </div>
          <div className="mt-1 text-[12px] text-muted2">
            {orders.length} aprovada{orders.length === 1 ? '' : 's'} de {dash.iniciadas} iniciada{dash.iniciadas === 1 ? '' : 's'}
            {dash.pendCount > 0 && <> · <b className="text-warn">{dash.pendCount} PIX pendente{dash.pendCount > 1 ? 's' : ''}</b> ({brl(dash.pendVal)})</>}
          </div>
        </div>

        <div className="mt-3 rounded-xl2 border border-border bg-surface p-4">
          <div className="mb-2 text-[12px] font-bold text-muted">Vendas por produto</div>
          {dash.topProd.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-muted2">sem vendas no período</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {dash.topProd.map(([name, d]) => (
                <div key={name} className="flex items-center gap-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
                  <span className="text-muted2">{d.n}×</span>
                  <span className="w-[84px] text-right font-bold text-ok">{brl(d.v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}

        {/* o auto-refresh de 25s é das vendas; Campanhas puxa da Meta e atualiza no botão */}
        <p className="mt-6 text-center text-[11px] text-muted2">
          {tab === 'camps'
            ? 'Dados da Meta · toque em Atualizar pra recarregar'
            : 'Atualiza sozinho a cada 25s · puxe pra cima e toque ↻ pra forçar'}
        </p>
      </main>

      {/* ── abas fixas embaixo ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-bg/95 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-[560px]">
          {([['vendas', 'Vendas', ListOrdered], ['camps', 'Campanhas', Megaphone], ['dash', 'Dashboard', LayoutDashboard], ['mais', 'Mais', LayoutGrid]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition-colors ${
                tab === id ? 'text-brand-2' : 'text-muted2'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
