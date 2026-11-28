/* AGnVET Trial Work — offline service worker.
 * Runtime caching: network-first for navigations (so deploys roll out),
 * cache-first for hashed build assets and fonts. Everything a signed-in
 * user has touched keeps working with no signal.
 */
const CACHE = 'trialwork-v2'

/* Precached at install so the very first offline load already has the shell
 * and the brand faces. Font filenames come from shared/fonts/build-fonts.mjs —
 * if that script's naming changes, change these too. The latin-ext subsets are
 * left to fill on demand; almost nothing here needs them. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './fonts/fonts.css',
  './fonts/mulish-400-900-latin.woff2',
  './fonts/plex-mono-400-latin.woff2',
  './fonts/plex-mono-500-latin.woff2',
  './fonts/plex-mono-600-latin.woff2',
  './fonts/plex-mono-700-latin.woff2',
]

self.addEventListener('install', (e) => {
  // One bad URL fails the whole addAll, taking the install with it — cache each
  // entry on its own so a renamed font can never break the app shell.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Navigations: network first, fall back to cached shell.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put('./index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('./index.html'))
    )
    return
  }

  // Assets: cache first, fill cache from network. Same-origin only — the fonts
  // are self-hosted now, so nothing legitimate is fetched cross-origin.
  if (url.origin !== location.origin) return
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()))
          return res
        })
    )
  )
})
