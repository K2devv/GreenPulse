const CACHE_PREFIX = 'greenpulse-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v2`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/index.html'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone()
      void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
      return response
    }).catch(async () => (await caches.match('/index.html')) || Response.error()))
    return
  }

  // 'worker' covers the map library's web worker, which is a separate script file.
  if (!['script', 'style', 'font', 'image', 'worker'].includes(request.destination)) return
  event.respondWith(caches.match(request).then(async (cached) => {
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok) {
      const copy = response.clone()
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
    }
    return response
  }))
})
