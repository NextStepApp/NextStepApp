/* public/sw.js
   Simple PWA SW with versioned cache based on package.json version.
   - Precache index.html and the Expo web bundle(s)
   - Network-first for the HTML, cache-first for static assets
*/

self.skipWaiting();
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const current = await caches.keys();
    const keep = [CACHE_NAME];
    await Promise.all(current.map(k => (keep.includes(k) ? null : caches.delete(k))));
  })());
});

// ---- versioned cache name from package.json ----
const VERSION = 'v2.1.2'; // keep in sync with package.json "version"
const CACHE_NAME = `nextstepapp-${VERSION}`;

const BASE = '/NextStepApp/';
const PRECACHE_URLS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}404.html`,
  `${BASE}favicon.ico`,
  // We don't know the exact hashed filename at author time, so we cache on-demand below
];

// Install: prime basic shell
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
  })());
});

// Helper: is same-origin and under /NextStepApp/
function inScope(url) {
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin && u.pathname.startsWith(BASE);
  } catch {
    return false;
  }
}

// Strategy:
// - HTML: network-first (so new HTML references new chunks)
// - static assets (.js, .css, images): cache-first
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!inScope(request.url) || request.method !== 'GET') return;

  const accept = request.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(request);
        return cached || caches.match(`${BASE}index.html`);
      }
    })());
    return;
  }

  // Static assets: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const res = await fetch(request);
      // only cache successful responses
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, res.clone());
      }
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
