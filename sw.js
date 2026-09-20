// Offline cache. The version is stamped by app/build.py; a new version replaces the whole cache on next load.
const VERSION = "20260920-113252";
const CACHE = `apeliotes-golf-${VERSION}`;
const SHELL = ["./", "./index.html", "./app.css", "./app.js", "./model.js", "./draw.js", "./posters.js", "./cards.js",
  "./store.js", "./data.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png",
  "./fonts/oswald/Oswald-Variable.ttf", "./fonts/source-sans-3/SourceSans3-Variable.ttf",
  "./fonts/libre-baskerville/LibreBaskerville-Regular.ttf", "./fonts/libre-baskerville/LibreBaskerville-Bold.ttf",
  "./fonts/montserrat/Montserrat-Regular.ttf", "./fonts/montserrat/Montserrat-Bold.ttf"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  })));
});
