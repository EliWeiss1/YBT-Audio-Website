/* YBT Shiurim service worker.
 *
 * Hand-rolled (no bundler integration) so it survives Next.js bundler changes.
 * Responsibilities:
 *   1. Offline audio: serves downloaded shiurim from the audio cache,
 *      including Range requests so <audio> seeking works offline.
 *   2. Offline shell: caches pages, static assets, and catalog data as the
 *      user browses, with an /offline fallback for unvisited pages.
 *
 * The audio cache is written ONLY by lib/downloads.ts (explicit user
 * downloads) — this worker reads it but never adds to it.
 */

// Any byte change to this file triggers the browser's SW update flow —
// bump this on future edits to force one.
const SW_VERSION = 'v2'

const AUDIO_CACHE = 'audio-downloads-v1'
const PAGES_CACHE = 'pages-v1'
const STATIC_CACHE = 'static-v1'
const DATA_CACHE = 'data-v1'
const KNOWN_CACHES = [AUDIO_CACHE, PAGES_CACHE, STATIC_CACHE, DATA_CACHE]

const OFFLINE_URL = '/offline'

// Pages that must work offline WITHOUT a prior visit. Every route is
// server-rendered, so nothing lands in the pages cache until fetched —
// a user who downloads shiurim but never opens /downloads online would
// otherwise hit the offline fallback instead of their downloads.
const PRECACHE_PAGES = ['/', OFFLINE_URL, '/downloads']

/** Precache the app shell: each page's HTML plus the static assets it
 *  references (a cached document is useless offline if its scripts aren't
 *  cached too). Assets are routed to the same cache the fetch handler
 *  reads from: /_next/static/ → STATIC_CACHE, icons/logo → DATA_CACHE. */
async function precacheShell() {
  const pagesCache = await caches.open(PAGES_CACHE)
  const staticCache = await caches.open(STATIC_CACHE)
  const dataCache = await caches.open(DATA_CACHE)

  for (const page of PRECACHE_PAGES) {
    try {
      const res = await fetch(page, { cache: 'reload' })
      if (!res.ok) continue
      const html = await res.clone().text()
      await pagesCache.put(page, res)

      const assets = new Set(html.match(/\/_next\/static\/[^"'\s>]+/g) || [])
      for (const m of html.match(/\/(?:icons\/[^"'\s>]+|YBT_Logo\.gif)/g) || []) {
        assets.add(m)
      }
      for (const asset of assets) {
        try {
          const url = asset.replace(/&amp;/g, '&')
          const target = url.startsWith('/_next/static/') ? staticCache : dataCache
          if (await target.match(url)) continue
          const assetRes = await fetch(url)
          if (assetRes.ok) await target.put(url, assetRes)
        } catch {
          /* one missing asset must not abort the shell */
        }
      }
    } catch {
      /* page unreachable (offline during install) — cached on a later visit */
    }
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await precacheShell()
      await self.skipWaiting()
    })()
  )
})

// The app pings { type: 'refresh-shell' } periodically so the precached
// shell tracks new deploys (chunk hashes change every build) without
// needing this worker file itself to change. Old chunks stay in
// STATIC_CACHE, so previously cached pages keep working offline too.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'refresh-shell') {
    event.waitUntil(precacheShell())
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of this worker.
      const names = await caches.keys()
      await Promise.all(
        names.filter((n) => !KNOWN_CACHES.includes(n)).map((n) => caches.delete(n))
      )
      await self.clients.claim()
    })()
  )
})

// ── Cache helpers ────────────────────────────────────────────────────────────

/** Keep a cache from growing unboundedly: delete oldest entries beyond `max`. */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= max) return
  for (const key of keys.slice(0, keys.length - max)) {
    await cache.delete(key)
  }
}

async function putInCache(cacheName, request, response, max) {
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response)
    if (max) trimCache(cacheName, max) // fire-and-forget
  } catch {
    /* storage full or response not cacheable — ignore */
  }
}

// ── Audio with Range support ─────────────────────────────────────────────────

/** Serve a downloaded shiur from cache, honoring Range requests (seeking). */
async function audioFromCache(request) {
  const cache = await caches.open(AUDIO_CACHE)
  // Match by URL string so the Range header on the request can't affect lookup.
  const cached = await cache.match(request.url)
  if (!cached) {
    // Not downloaded — stream through the network as usual.
    return fetch(request)
  }

  const rangeHeader = request.headers.get('range')
  if (!rangeHeader) return cached.clone()

  const blob = await cached.blob()
  const size = blob.size
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
  if (!match) return cached.clone()

  let start
  let end
  if (match[1] === '') {
    // Suffix range: "bytes=-500" → last 500 bytes
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    })
  }

  const sliced = blob.slice(start, end + 1)
  return new Response(sliced, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(sliced.size),
      'Accept-Ranges': 'bytes',
    },
  })
}

// ── Strategies ───────────────────────────────────────────────────────────────

/** Pages: network first, fall back to cache, then to the offline page. */
async function pageNetworkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      putInCache(PAGES_CACHE, request, response.clone(), 60)
    }
    return response
  } catch {
    const cached = await caches.match(request, { cacheName: PAGES_CACHE })
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL, { cacheName: PAGES_CACHE })
    if (offline) return offline
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  }
}

/** Immutable build assets: cache first. */
async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: STATIC_CACHE })
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    putInCache(STATIC_CACHE, request, response.clone(), 300)
  }
  return response
}

/** Catalog data / images: serve cache immediately, refresh in background. */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request, { cacheName: DATA_CACHE })
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        putInCache(DATA_CACHE, request, response.clone(), 150)
      }
      return response
    })
    .catch(() => null)
  if (cached) return cached
  const response = await network
  if (response) return response
  return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
}

// ── Router ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Never intercept cross-origin requests (Supabase, ybt.org / yutorah audio
  // streaming, etc.) — the browser handles those directly.
  if (url.origin !== self.location.origin) return

  // Downloaded shiurim (the only /api/* route this worker touches).
  if (url.pathname.startsWith('/api/download/')) {
    event.respondWith(audioFromCache(request))
    return
  }
  if (url.pathname.startsWith('/api/')) return

  // Page navigations.
  if (request.mode === 'navigate') {
    event.respondWith(pageNetworkFirst(request))
    return
  }

  // Hashed, immutable Next.js build output.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Catalog chunks, search index, icons, logo.
  if (
    url.pathname.startsWith('/lectures-data/') ||
    url.pathname.startsWith('/icons/') ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }
  // Everything else: straight to the network.
})
