/* public/sw.js — template, version injected by inject-manifest.js */

const VERSION = '2.1.7';
const CACHE_NAME = `nextstepapp-${VERSION}`;
const BASE = '/NextStepApp/';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([
      `${BASE}`,
      `${BASE}index.html`,
      `${BASE}404.html`,
      `${BASE}favicon.ico`,
      // other small always-present assets can be added here
    ]);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
  })());
});

function inScope(url) {
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin && u.pathname.startsWith(BASE);
  } catch { return false; }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !inScope(request.url)) return;

  const accept = request.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  if (isHTML) {
    // Network-first for HTML so fresh shell points to fresh chunks
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

  // Cache-first for static assets
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const res = await fetch(request);
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
