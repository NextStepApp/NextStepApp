// public/sw.js
const CACHE = "nextstepapp-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./favicon.ico",
  "./manifest.webmanifest"
];

// Install: pre-cache the shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for same-origin requests
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Cache JS/CSS/HTML and images
        const copyTypes = ["script", "style", "image", "document"];
        if (copyTypes.includes(res.type) || req.destination) {
          const resClone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => {
        // Offline fallback for navigation
        if (req.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
