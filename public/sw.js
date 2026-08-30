/**
 * Cache-first service worker.
 *
 * The catalogue and icons only change when someone re-runs `sync-data`, so
 * everything is safe to serve from cache. Bump CACHE_VERSION on release to
 * evict the old set.
 */

const CACHE_VERSION = 'temperlist-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE_VERSION))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  // Icons may fall back to the public API host; those are immutable too.
  const cacheableRemote = url.hostname === 'api.avakot.org'
  if (!sameOrigin && !cacheableRemote) return

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Refresh in the background so a redeploy is picked up next visit.
        if (sameOrigin) event.waitUntil(update(request))
        return hit
      }
      return update(request).catch(() =>
        // Offline with no cache entry: for a navigation, fall back to the shell.
        request.mode === 'navigate' ? caches.match('./index.html') : Response.error(),
      )
    }),
  )
})

async function update(request) {
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_VERSION)
    await cache.put(request, response.clone())
  }
  return response
}
