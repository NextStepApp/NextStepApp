// Minimal service worker to satisfy PWA install criteria.
// (You can add caching later if you want offline.)

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A no-op fetch handler is enough to mark the SW as "controlling fetch".
self.addEventListener("fetch", (event) => {
  // Intentionally left blank.
});
