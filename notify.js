// Being told that somebody else logged a round you played in.
//
// Two layers, and the first is the one that matters. In the app: the home screen says a round has been added
// and offers to open it. That needs no permission, no push service and no Apple, and it works on every phone.
// On top of it, if the phone will have them, a push notification saying the same sentence -- so you hear about
// it without opening the app.
//
// Nothing here asks anybody to approve anything. The round is already in; the notice says so, and whoever
// played it can open it, fix a score or throw it away, which they could do anyway.
import * as A from "./auth.js";
import * as S from "./store.js";

const KEY = "hagolf-notices";

/** What is waiting, as this phone last heard it. Kept so the home screen can draw before the network answers. */
export function held() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
}
const keep = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20))); } catch (e) { /* full */ } };

let listeners = [];
export function onChange(fn) { listeners.push(fn); }
const emit = () => listeners.forEach(fn => fn());

/** Asks the backend what is waiting. Quiet about failure: this is never the reason a screen does not draw. */
export async function refresh() {
  if (!A.signedIn()) { if (held().length) { keep([]); emit(); } return []; }
  try {
    const r = await A.api("/notifications");
    const now = r.notifications || [];
    if (JSON.stringify(now) !== JSON.stringify(held())) { keep(now); emit(); }
    return now;
  } catch (e) { return held(); }
}

/** Marks these rounds read, or everything when none are named. */
export async function markSeen(roundIds = null) {
  const before = held();
  keep(roundIds ? before.filter(n => !roundIds.includes(n.round_id)) : []);
  emit();
  try { await A.api("/notifications/seen", { roundIds: roundIds || [] }); } catch (e) { /* it will be marked next time */ }
}

// ---------------------------------------------------------------- push
const urlB64 = s => { const pad = "=".repeat((4 - s.length % 4) % 4); const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };

export const pushPossible = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const pushState = () => (pushPossible() ? Notification.permission : "unavailable");

/**
 * Asks for permission and registers this phone. Called from a tap, never on load: a permission box that appears
 * unasked is the fastest way to be refused for ever.
 */
export async function enablePush() {
  if (!pushPossible()) throw new Error("This phone cannot show notifications.");
  const cfg = await A.config();
  if (!cfg.push) throw new Error("Notifications are not set up on this backend yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied"
    ? "Notifications are blocked for Hagolf. Turn them back on in the phone's settings for this app."
    : "Notifications were not allowed.");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(cfg.push) });
  await A.api("/push/subscribe", { endpoint: sub.endpoint });
  S.setSetting("push", true);
  return true;
}

export async function disablePush() {
  S.setSetting("push", false);
  if (!pushPossible()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try { await A.api("/push/unsubscribe", { endpoint: sub.endpoint }); } catch (e) { /* the server drops dead endpoints itself */ }
  await sub.unsubscribe();
}

/** The service worker says a push arrived; the app asks what it was about. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", e => { if (e.data === "notifications") refresh(); });
}
