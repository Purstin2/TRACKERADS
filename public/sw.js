/* Service worker do app de vendas (PWA). Mínimo: habilita instalação e prepara
   recebimento de push pro futuro. NÃO mexe em nada de pixel/webhook. */
const VERSION = 'vendas-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

// rede primeiro (app sempre lê dados novos); sem cache offline agressivo
self.addEventListener('fetch', () => {})

// Push em segundo plano (app fechado) — usado quando ativarmos o Web Push.
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch {}
  const title = d.title || '💰 Nova venda'
  const body = d.body || ''
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      vibrate: [200, 100, 200],
      tag: d.tag || 'venda',
      data: { url: '/app' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes('/app') && 'focus' in c) return c.focus()
      if (self.clients.openWindow) return self.clients.openWindow('/app')
    }),
  )
})
