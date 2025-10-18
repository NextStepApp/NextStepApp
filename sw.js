const CACHE = "nextstep-v1";
const OFFLINE_URLS = ["/NextStepApp/", "/NextStepApp/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
        return resp;
      }).catch(() => caches.match("/NextStepApp/index.html"))
    )
  );
});
