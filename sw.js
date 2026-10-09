// Offline cache. The version is stamped by app/build.py; a new version replaces the whole cache on next load.
const VERSION = "20261009-142118";
const CACHE = `hagolf-${VERSION}`;
// Stamped by app/build.py from what dist/ actually holds, so a new screen file is never missing offline.
const SHELL = ["./", "./app.css", "./app.js", "./auth.js", "./boot.js", "./brand.js", "./brandsheets.js", "./cards.js", "./data.js", "./draw.js", "./early.js", "./entitlements.js", "./idb.js", "./index.html", "./manifest.webmanifest", "./model.js", "./notify.js", "./pad.js", "./posters.js", "./router.js", "./sample.js", "./sheet.js", "./social.js", "./statsposters.js", "./store.js", "./sync.js", "./ui.js", "./fonts/libre-baskerville/LibreBaskerville-Bold.ttf", "./fonts/libre-baskerville/LibreBaskerville-Regular.ttf", "./fonts/libre-baskerville/LibreBaskerville-SemiBold.ttf", "./fonts/montserrat/Montserrat-Bold.ttf", "./fonts/montserrat/Montserrat-Regular.ttf", "./fonts/montserrat/Montserrat-SemiBold.ttf", "./fonts/oswald/Oswald-Variable.ttf", "./fonts/source-sans-3/SourceSans3-Variable.ttf", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./img/examples/both.webp", "./img/examples/bs-dayout-banner-company.webp", "./img/examples/bs-dayout-banner-course.webp", "./img/examples/bs-dayout-crest-company.webp", "./img/examples/bs-dayout-crest-course.webp", "./img/examples/bs-dayout-podium-company.webp", "./img/examples/bs-dayout-podium-course.webp", "./img/examples/bs-dayout-ticket-company.webp", "./img/examples/bs-dayout-ticket-course.webp", "./img/examples/bs-league-banner-company.webp", "./img/examples/bs-league-banner-course.webp", "./img/examples/bs-league-crest-company.webp", "./img/examples/bs-league-crest-course.webp", "./img/examples/bs-league-podium-company.webp", "./img/examples/bs-league-podium-course.webp", "./img/examples/bs-league-ticket-company.webp", "./img/examples/bs-league-ticket-course.webp", "./img/examples/bs-personal-banner-company.webp", "./img/examples/bs-personal-banner-course.webp", "./img/examples/bs-personal-crest-company.webp", "./img/examples/bs-personal-crest-course.webp", "./img/examples/bs-personal-numeral-company.webp", "./img/examples/bs-personal-numeral-course.webp", "./img/examples/bs-personal-ticket-company.webp", "./img/examples/bs-personal-ticket-course.webp", "./img/examples/cards-basic.webp", "./img/examples/cards.webp", "./img/examples/gross-basic.webp", "./img/examples/gross.webp", "./img/examples/holes.webp", "./img/examples/sf-extras.webp", "./img/examples/sf-field.webp", "./img/examples/sf-nines.webp", "./img/examples/sf-player.webp", "./img/examples/st-gp.webp", "./img/examples/st-gpstroke.webp", "./img/examples/st-match.webp", "./img/examples/st-matchpts.webp", "./img/examples/st-soccer.webp", "./img/examples/st-soccerpts.webp", "./img/examples/st-stableford.webp", "./img/examples/st-stroke.webp", "./img/examples/stbl-basic.webp", "./img/examples/stbl.webp", "./screens/course.js", "./screens/extras.js", "./screens/formats.js", "./screens/gate.js", "./screens/graphics.js", "./screens/home.js", "./screens/kinds.js", "./screens/league.js", "./screens/leagues.js", "./screens/legal.js", "./screens/me.js", "./screens/partner.js", "./screens/people.js", "./screens/play.js", "./screens/players.js", "./screens/public.js", "./screens/review.js", "./screens/score.js", "./screens/shop.js", "./screens/stats.js", "./screens/updates.js", "./vendor/qrcode.js"];

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

// The Worker answers these paths on the app's own origin (run_worker_first in cloudflare/wrangler.toml); they are
// live data and must never be answered from, or written into, the offline cache.
const API = /^\/(rest|functions|auth|account|club|league|notifications|push|public|shop|friends|round|health)(\/|$)/;

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin && API.test(url.pathname)) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  })));
});
