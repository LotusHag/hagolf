// Hagolf: wires the stores to the screens and starts the router. Everything on screen lives under screens/.
import * as S from "./store.js";
import * as Y from "./sync.js";
import * as A from "./auth.js";
import * as N from "./notify.js";
import * as F from "./social.js";
import { applyBrand, toast, inBrowser } from "./ui.js";
import { route } from "./router.js";
import { home } from "./screens/home.js";

const onHome = () => !location.hash || location.hash === "#home";

// a redraw is rude in the middle of typing, scoring, or a sheet full of rendered images
const undisturbed = () => !(document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName))
  && !(document.querySelector(".thumbs, .progress, .sheet-wrap") || location.hash.startsWith("#score/") || location.hash.startsWith("#join/"));

// other phones' changes: redraw the current screen
let lastSyncStatus = Y.sync.status;
Y.onChange(({ changed, status }) => {
  const signedOutNow = Y.sync.status !== lastSyncStatus && (Y.sync.status === "signedout" || lastSyncStatus === "signedout");
  lastSyncStatus = Y.sync.status;
  if ((changed || (signedOutNow && onHome())) && undisturbed()) route();
});
S.setOnSave(Y.schedulePush);

window.addEventListener("hashchange", route);
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installPrompt = e; if (inBrowser()) route(); else if (onHome()) home(); });
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

// What the account holds is read again whenever the app is opened or looked at again, and the screen redrawn
// only if it changed. Without this a theme that became yours a minute ago goes on saying "in the shop" until
// the session happens to turn over, which is the one moment the app looks broken to somebody who just paid.
const recheck = async () => { if (await A.recheck() && undisturbed()) route(); };
recheck();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recheck(); });
