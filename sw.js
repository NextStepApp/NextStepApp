/* public/sw.js
 *
 * A lightweight PWA service worker:
 * - versioned via the SW query string (?v=...)
 * - network-first for HTML/JS/CSS (keeps you fresh after deploys)
 * - cache-first for images (faster + offline)
 * - cleans old caches on activate
 * - takes control immediately
 */

/// Resolve version from SW script URL (?v=...)
const VERSION = (() => {
  try {
    return new URL(self.location).searchParams.get("v") || "v1";
  } catch (e) {
    return "v1";
  }
})();

const CACHE_PREFIX = "nextstepapp";
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${VERSION}`;

// Take control ASAP
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isHTML(request) {
  return request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
}

function isAsset(request) {
  const url = new URL(request.url);
  return (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".map")
  );
}

function isImage(request) {
  const url = new URL(request.url);
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname);
}

// Network-first for HTML/JS/CSS (with fallback to cache)
async function networkFirst(event) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(event.request);
    // Only cache successful same-origin GETs
    if (event.request.method === "GET" && new URL(event.request.url).origin === self.location.origin) {
      cache.put(event.request, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;

    // Fallback to index.html for navigations (SPA safety)
    if (isHTML(event.request)) {
      const fallback = await cache.match("/index.html");
      if (fallback) return fallback;
    }
    throw e;
  }
}

// Cache-first for images
async function cacheFirst(event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(event.request);
    if (fresh && fresh.ok) cache.put(event.request, fresh.clone());
    return fresh;
  } catch (e) {
    // give up silently; browser will show broken image
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  // Only handle http(s)
  if (!/^https?:$/i.test(new URL(event.request.url).protocol)) return;

  const req = event.request;

  if (isHTML(req) || isAsset(req)) {
    event.respondWith(networkFirst(event));
    return;
  }

  if (isImage(req)) {
    event.respondWith(cacheFirst(event));
    return;
  }

  // Default: try network, fall back to cache (runtime)
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const fresh = await fetch(req);
        if (req.method === "GET" && new URL(req.url).origin === self.location.origin) {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        throw e;
      }
    })()
  );
});
