// Offline cache. The version is stamped by app/build.py; a new version replaces the whole cache on next load.
const VERSION = "20260928-173732";
const CACHE = `hagolf-${VERSION}`;
// Stamped by app/build.py from what dist/ actually holds, so a new screen file is never missing offline.
const SHELL = ["./", "./app.css", "./app.js", "./auth.js", "./boot.js", "./cards.js", "./data.js", "./draw.js", "./entitlements.js", "./idb.js", "./index.html", "./manifest.webmanifest", "./model.js", "./notify.js", "./posters.js", "./router.js", "./social.js", "./statsposters.js", "./store.js", "./sync.js", "./ui.js", "./fonts/libre-baskerville/LibreBaskerville-Bold.ttf", "./fonts/libre-baskerville/LibreBaskerville-Regular.ttf", "./fonts/libre-baskerville/LibreBaskerville-SemiBold.ttf", "./fonts/montserrat/Montserrat-Bold.ttf", "./fonts/montserrat/Montserrat-Regular.ttf", "./fonts/montserrat/Montserrat-SemiBold.ttf", "./fonts/oswald/Oswald-Variable.ttf", "./fonts/source-sans-3/SourceSans3-Variable.ttf", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./screens/course.js", "./screens/extras.js", "./screens/formats.js", "./screens/gate.js", "./screens/graphics.js", "./screens/home.js", "./screens/kinds.js", "./screens/league.js", "./screens/leagues.js", "./screens/legal.js", "./screens/me.js", "./screens/people.js", "./screens/play.js", "./screens/players.js", "./screens/public.js", "./screens/review.js", "./screens/score.js", "./screens/shop.js", "./screens/stats.js", "./screens/updates.js", "./vendor/qrcode.js"];

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
