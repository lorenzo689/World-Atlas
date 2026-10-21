/*
 * World Explorer service worker (hand-written, no build plugin).
 *
 *  - Static, rarely changing files (textures, flags, map data, hashed JS/CSS bundles, fonts) are served
 *    cache-first: after the first visit the globe works offline.
 *  - Page navigations are network-first and fall back to the cached app shell ("/"), so the SPA opens offline.
 *  - API calls (/api), WebSockets (/ws) and everything cross-origin are never touched: quiz answers,
 *    tokens and live data must always come from the server.
 *
 * Bump VERSION to drop all old caches.
 */
const VERSION = 'v7'
const STATIC = `we-static-${VERSION}`
const SHELL = `we-shell-${VERSION}`
const BASE = new URL(self.registration.scope).pathname
const CACHE_FIRST = [/\/(?:assets|textures|flags|data|icons)\//, /\.(?:woff2?|webp|svg|png)$/]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add(BASE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, SHELL].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/swagger')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put(BASE, copy))
          return res
        })
        .catch(() => caches.match(BASE).then((r) => r ?? Response.error())),
    )
    return
  }

  // Dated control datasets are updated at their stable URLs. Prefer fresh provenance/geometry,
  // retaining the last dated response for offline use instead of freezing a first-visit snapshot.
  if (/\/territories-(?:today|history)\.json$/.test(url.pathname)) {
    event.respondWith(caches.open(STATIC).then(async (cache) => {
      try {
        const res = await fetch(req, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          event.waitUntil(cache.put(req, res.clone()).catch(() => {}))
          return res
        }
        return (await cache.match(req)) ?? res
      } catch {
        return (await cache.match(req)) ?? Response.error()
      }
    }))
    return
  }

  if (CACHE_FIRST.some((re) => re.test(url.pathname))) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
  }
})
