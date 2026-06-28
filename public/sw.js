/**
 * MediVault Service Worker
 *
 * Strategy:
 *  - App-shell pages  → cache-first (instant load, even offline)
 *  - Static assets    → cache-first with background revalidation (stale-while-revalidate)
 *  - /api/* routes    → network-only (never cache sensitive health data)
 *  - External (0G)    → network-only
 *
 * The SW never stores any decrypted medical content — the app handles all
 * encryption/decryption on the main thread. The cache only holds public
 * static assets and the rendered app shell.
 */

const CACHE_VERSION = 'v1'
const SHELL_CACHE = `medivault-shell-${CACHE_VERSION}`
const ASSET_CACHE = `medivault-assets-${CACHE_VERSION}`

/** App-shell navigation routes to pre-cache on install. */
const SHELL_ROUTES = ['/', '/vault']

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(SHELL_ROUTES).catch((err) => {
          // Don't fail install if pre-cache misses — the app still works.
          console.warn('[SW] Pre-cache failed (non-fatal):', err)
        }),
      )
      .then(() => self.skipWaiting()),
  )
})

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const CURRENT = new Set([SHELL_CACHE, ASSET_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !CURRENT.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return

  // Never intercept API routes — must always hit the network.
  if (url.pathname.startsWith('/api/')) return

  // Non-GET requests pass through.
  if (request.method !== 'GET') return

  // ── Navigation requests: network-first, fall back to shell ────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone))
          }
          return res
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/')),
        ),
    )
    return
  }

  // ── Static assets (_next/static, fonts, images): stale-while-revalidate ──
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|ttf)$/)
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone())
            return res
          })
          return cached || networkFetch
        }),
      ),
    )
    return
  }
})
