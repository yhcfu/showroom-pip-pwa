const LEGACY_CACHES = ["showroom-pip-v2", "showroom-pip-runtime-v1"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await Promise.all(LEGACY_CACHES.map((cache) => caches.delete(cache)));
    await self.registration.unregister();
  })());
});
