/* global self, caches, fetch */
const CACHE_NAME = "nextstepapp-v7"; // bump this on each deploy if needed
const SCOPE = "/NextStepApp/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      `${SCOPE}`,
      `${SCOPE}index.html`,
      `${SCOPE}favicon.ico`
      // Don't pre-cache the hashed JS; let runtime caching fetch it fresh
    ]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only manage requests under our GitHub Pages scope
  if (!url.pathname.startsWith(SCOPE)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      });
    })
  );
});
