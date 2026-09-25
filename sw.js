// Offline cache. The version is stamped by app/build.py; a new version replaces the whole cache on next load.
const VERSION = "20260925-173132";
const CACHE = `hagolf-${VERSION}`;
const SHELL = ["./", "./index.html", "./app.css", "./boot.js", "./idb.js", "./app.js", "./auth.js", "./entitlements.js", "./model.js", "./draw.js", "./posters.js", "./cards.js",
  "./statsposters.js", "./store.js", "./sync.js", "./notify.js", "./data.js", "./vendor/qrcode.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
  "./fonts/oswald/Oswald-Variable.ttf", "./fonts/source-sans-3/SourceSans3-Variable.ttf",
  "./fonts/libre-baskerville/LibreBaskerville-Regular.ttf", "./fonts/libre-baskerville/LibreBaskerville-Bold.ttf",
  "./fonts/montserrat/Montserrat-Regular.ttf", "./fonts/montserrat/Montserrat-Bold.ttf"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));  // a new version takes over at once; the page reloads on controllerchange
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

// A push carries no payload at all: it says a round has been added and nothing else, so no name, no course and
// no score travels through a push service. The app says which round once it is opened, and is told to go and
// look while it is already open.
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    await self.registration.showNotification("Hagolf", {
      body: "A new round has been added.",
      icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
      tag: "hagolf-round", renotify: false, data: { url: "./#home" },
    });
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage("notifications");
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = new URL((e.notification.data && e.notification.data.url) || "./#home", self.registration.scope).href;
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      if (c.url.startsWith(self.registration.scope)) { c.postMessage("notifications"); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  })));
});
