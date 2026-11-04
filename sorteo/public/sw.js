// SORTEO · service worker: abre rápido, funciona con mala señal y muestra los avisos push.
const CACHE = 'sorteo-v3'
const SHELL = ['/', '/index.html', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.svg', '/logo.svg']

// Al instalar, guarda la página y los archivos que ella usa (JS y CSS), así abre sin señal.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    await c.addAll(SHELL)
    const html = await (await c.match('/', { ignoreVary: true })).text()
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
    await c.addAll(assets)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return // datos siempre en vivo
  // La página: primero internet (para tener siempre la última versión); sin señal, la guardada.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return r }).catch(() => caches.match('/', { ignoreVary: true })))
    return
  }
  // Archivos con nombre único (/assets/...): se guardan la primera vez.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return r })))
  }
})

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Aviso', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Aviso', {
    body: d.body || '',
    icon: '/icon-192.png',
    tag: d.tag,
    data: { url: d.url || '/' },
    requireInteraction: d.kind === 'ganador',
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = e.notification.data && e.notification.data.url ? e.notification.data.url : '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(target).catch(() => {}); return c.focus() }
    return self.clients.openWindow(target)
  }))
})
