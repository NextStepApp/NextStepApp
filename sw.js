const CACHE = 'nextstepapp-v1';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Pre-cache minimal shell; the rest is runtime-cached.
    await c.addAll([
      '/NextStepApp/',
      '/NextStepApp/index.html',
      '/NextStepApp/manifest.webmanifest',
      '/NextStepApp/favicon.ico'
    ]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only handle GET within our scope
  if (req.method !== 'GET' || !new URL(req.url).pathname.startsWith('/NextStepApp/')) return;

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const clone = res.clone();
      const c = await caches.open(CACHE);
      c.put(req, clone);
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});
