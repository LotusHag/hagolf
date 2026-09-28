// Hagolf: wires the stores to the screens and starts the router. Everything on screen lives under screens/.
import * as S from "./store.js";
import * as Y from "./sync.js";
import * as A from "./auth.js";
import * as N from "./notify.js";
import * as F from "./social.js";
import { applyBrand, toast } from "./ui.js";
import { route } from "./router.js";
import { home } from "./screens/home.js";

const onHome = () => !location.hash || location.hash === "#home";

// other phones' changes: redraw the current screen, unless the user is typing, scoring, or looking at rendered images
let lastSyncStatus = Y.sync.status;
Y.onChange(({ changed, status }) => {
  const typing = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  const busy = document.querySelector(".thumbs, .progress, .sheet-wrap") || location.hash.startsWith("#score/") || location.hash.startsWith("#join/");
  const signedOutNow = Y.sync.status !== lastSyncStatus && (Y.sync.status === "signedout" || lastSyncStatus === "signedout");
  lastSyncStatus = Y.sync.status;
  if ((changed || (signedOutNow && onHome())) && !typing && !busy) route();
});
S.setOnSave(Y.schedulePush);

window.addEventListener("hashchange", route);
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installPrompt = e; if (onHome()) home(); });
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then(reg => {
    const watch = w => w && w.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) { window.__updateReady = true; window.__updateWorker = w; toast("New version ready: go Home and tap the banner", 4000); if (onHome()) home(); }
    });
    watch(reg.installing);
    reg.addEventListener("updatefound", () => watch(reg.installing));
  }).catch(e => console.warn("sw", e));
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
}

applyBrand();
A.onChange(applyBrand);

// What is waiting is asked for after every sync; the home screen and the bell redraw when it changes.
N.onChange(() => { if (onHome() || location.hash === "#updates") route(); else { const b = document.querySelector(".top .iconbtn[href='#updates']"); if (b) route(); } });
Y.onChange(({ changed }) => { if (changed) { N.refresh(); F.refresh(); } });
A.onChange(() => { N.refresh(); F.refresh(); });
if (A.signedIn()) { N.refresh(); F.refresh(); }
Y.start();
route();
