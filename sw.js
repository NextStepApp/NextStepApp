/* public/sw.js
 * PWA SW with correct base-path fallback for GitHub Pages (/NextStepApp/).
 * - Figures out BASE_PATH from registration scope.
 * - Pre-caches index.html at that base.
 * - Network-first for app shell (HTML/JS/CSS), cache-first for images.
 * - Cleans old caches and takes control immediately.
 */

const VERSION = (() => {
  try {
    return new URL(self.location).searchParams.get("v") || "v1";
  } catch {
    return "v1";
  }
})();

const CACHE_PREFIX = "nextstepapp";
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${VERSION}`;

// Derive BASE_PATH from SW scope (e.g., https://.../NextStepApp/)
const BASE_PATH = (() => {
  try {
    const scopeUrl = new URL(self.registration.scope);
    // scope always ends with a trailing slash; keep it
    return scopeUrl.pathname;
  } catch {
    return "/NextStepApp/"; // sensible default for this project
  }
})();

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      // Precache index.html so navigate fallbacks work offline/installed.
      // We try both explicit index.html and the directory path (GH Pages sometimes treats both).
      await cache.addAll([
        BASE_PATH + "index.html",
      ].map((u) => new Request(u, { cache: "reload" })));
      self.skipWaiting();
    })()
  );
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

function isHTML(req) {
  return (
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html")
  );
}
function isAsset(req) {
  const p = new URL(req.url).pathname;
  return /\.(js|css|json|map)$/i.test(p);
}
function isImage(req) {
  const p = new URL(req.url).pathname;
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(p);
}

// Normalize navigation requests to the real index.html under BASE_PATH.
function normalizeNavigateRequest(req) {
  const url = new URL(req.url);
  // Any path under our scope should get the app shell.
  if (url.pathname.startsWith(BASE_PATH)) {
    return new Request(BASE_PATH + "index.html", { headers: req.headers, mode: "same-origin" });
  }
  return req;
}

// Network-first for HTML/JS/CSS with fallback to cached index.html for navigations.
async function networkFirst(event) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    // For navigations, always fetch the actual request; if it fails we use our app-shell fallback.
    const res = await fetch(event.request);
    if (event.request.method === "GET" && new URL(event.request.url).origin === self.location.origin) {
      cache.put(event.request, res.clone());
    }
    return res;
  } catch (e) {
    if (isHTML(event.request)) {
      // app shell fallback from cache
      const fallback = await cache.match(new Request(BASE_PATH + "index.html"));
      if (fallback) return fallback;
    }
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

// Cache-first for images.
async function cacheFirst(event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(event.request);
    if (fresh && fresh.ok) cache.put(event.request, fresh.clone());
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  // Only handle http(s) in our origin
  const url = new URL(event.request.url);
  if (!/^https?:$/i.test(url.protocol)) return;
  if (url.origin !== self.location.origin) return;

  // If this is a navigation under our BASE_PATH, serve the app shell pattern.
  if (isHTML(event.request) && url.pathname.startsWith(BASE_PATH)) {
    event.respondWith(
      (async () => {
        // Try network first for freshness, but fallback to cached index.
        const cache = await caches.open(RUNTIME_CACHE);
        try {
          const res = await fetch(event.request);
          // Cache the response for faster subsequent loads
          cache.put(event.request, res.clone());
          return res;
        } catch {
          const fallback = await cache.match(new Request(BASE_PATH + "index.html"));
          if (fallback) return fallback;
          // As a last resort, try any cached navigation
          const any = await cache.match(event.request, { ignoreSearch: true });
          if (any) return any;
          return Response.error();
        }
      })()
    );
    return;
  }

  if (isAsset(event.request)) {
    event.respondWith(networkFirst(event));
    return;
  }

  if (isImage(event.request)) {
    event.respondWith(cacheFirst(event));
    return;
  }

  // Default: network, then cache fallback if we have it
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const fresh = await fetch(event.request);
        if (event.request.method === "GET") {
          cache.put(event.request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await cache.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        return Response.error();
      }
    })()
  );
});
