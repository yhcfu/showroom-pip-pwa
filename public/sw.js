const CACHE = "showroom-pip-v2";
const RUNTIME_CACHE = "showroom-pip-runtime-v1";
const APP_SHELL = ["./", "./manifest.webmanifest", "./icon.svg"];
const WATCH_CONFIG_URL = new URL("./__watch_config__", self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys
      .filter((key) => key.startsWith("showroom-pip-v") && key !== CACHE)
      .map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "watch-config") return;
  event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(
    WATCH_CONFIG_URL,
    new Response(JSON.stringify(event.data), { headers: { "Content-Type": "application/json" } }),
  )));
});

async function checkWatchedRooms() {
  const cache = await caches.open(RUNTIME_CACHE);
  const stored = await cache.match(WATCH_CONFIG_URL);
  if (!stored) return;
  const config = await stored.json();
  if (!config.enabled || !config.resolver || !Array.isArray(config.rooms) || config.rooms.length === 0) return;

  const url = new URL(`${config.resolver.replace(/\/$/, "")}/status`);
  url.searchParams.set("rooms", config.rooms.slice(0, 20).map((room) => room.roomKey).join(","));
  const response = await fetch(url);
  if (!response.ok) return;
  const result = await response.json();

  const rooms = config.rooms.map((saved) => {
    const current = result.rooms?.find((room) =>
      room.roomId !== undefined && saved.roomId !== undefined
        ? room.roomId === saved.roomId
        : room.roomKey === saved.roomKey
    );
    if (!current || current.error) return saved;
    return { ...saved, ...current };
  });

  await cache.put(
    WATCH_CONFIG_URL,
    new Response(JSON.stringify({ ...config, rooms }), { headers: { "Content-Type": "application/json" } }),
  );

  const newlyLive = rooms.filter((room) => {
    const previous = config.rooms.find((saved) =>
      room.roomId !== undefined && saved.roomId !== undefined
        ? room.roomId === saved.roomId
        : room.roomKey === saved.roomKey
    );
    return room.isLive === true && previous?.isLive !== true;
  });

  await Promise.all(newlyLive.map((room) => {
    const target = new URL(self.registration.scope);
    target.searchParams.set("room", room.roomKey);
    return self.registration.showNotification(`${room.roomName || room.roomKey} が配信を開始しました`, {
      body: "タップしてプレイヤーを開く",
      icon: new URL("./icon.svg", self.registration.scope).toString(),
      tag: `showroom-live-${room.roomId || room.roomKey}`,
      data: { url: target.toString() },
    });
  }));
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "showroom-watch") event.waitUntil(checkWatchedRooms());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() };
  }
  event.waitUntil(self.registration.showNotification(
    payload.title || "SHOWROOMの配信が始まりました",
    {
      body: payload.body || "タップしてプレイヤーを開く",
      icon: payload.icon || new URL("./icon.svg", self.registration.scope).toString(),
      tag: payload.tag || "showroom-live",
      data: { url: payload.url || self.registration.scope },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
