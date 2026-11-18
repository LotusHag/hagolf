// The pieces every screen is built from: the page shell, the tab bar, sheets in place of native dialogs, toasts,
// icons, the theme painter, and the small text helpers. Screens import this and the stores; nothing here
// imports a screen.
import { DATA } from "./data.js";
import * as B from "./brand.js";
import * as S from "./store.js";
import * as Y from "./sync.js";
import * as A from "./auth.js";
import * as N from "./notify.js";
import * as E from "./entitlements.js";
import { loadFonts, makeTheme, pickTheme, phone, setMarked, setMarkText } from "./draw.js";
import { isNative } from "./native.js";

export const app = document.getElementById("app");
export const scrollPos = () => app.scrollTop;
export const scrollAt = y => { app.scrollTop = y; };

/**
 * Back is up. The phone's history is kept as the path from the first screen down to this one, so the header's
 * arrow, Android's back gesture and the browser's button all return to the screen this one was opened from.
 * Moving sideways -- another hole, another board of the same page -- takes the place of the entry; going to a
 * screen already on the path goes back to it instead of stacking it again; a bottom tab starts the path afresh.
 * A screen's declared back is only the fallback for a link opened cold, with nothing behind it.
 */
const norm = h => (h && h !== "#" ? h : "#home");
const TRAIL = "hagolf-trail";
let trail = [], at = 0, replacing = false, then = null;
const stamp = () => {
  try { history.replaceState({ ...(history.state || {}), at }, ""); } catch (e) {}
  trail[at] = norm(location.hash);
  try { sessionStorage.setItem(TRAIL, JSON.stringify(trail)); } catch (e) {}
};
if (history.state && typeof history.state.at === "number") {
  at = history.state.at;
  try { trail = JSON.parse(sessionStorage.getItem(TRAIL)) || []; } catch (e) {}
}
stamp();
window.addEventListener("hashchange", ev => {
  const s = history.state;
  if (s && typeof s.at === "number") at = s.at;   // back or forward
  else if (!replacing) { at++; trail.length = at; }
  replacing = false;
  stamp();
  if (then === null) return;
  const t = then;
  then = null;
  if (t !== location.hash) { ev.stopImmediatePropagation(); replacing = true; location.replace(t); }
});

const SETUP = /^#(new|scan|j)(\/|$)/;
/** Screens that are one place seen different ways: the holes and check of a card, the stats tabs, a society's boards. */
function placeOf(h) {
  const [n, a, b] = h.slice(1).split("/");
  if (n === "score" || n === "review") return `card/${a}`;
  if (n === "stats") return "stats";
  if (n === "league" && (b === "table" || b === "vs")) return `league/${a}/${b}`;
  return null;
}
const samePlace = (x, y) => x === y || (!!placeOf(x) && placeOf(x) === placeOf(y));
/** To the k-th screen of the path, then that screen swapped for `to`. */
function rebase(k, to) {
  const from = norm(location.hash);
  if (k > at) { location.hash = to; return; }
  if (k === at || norm(trail[k]) === from) { if (to !== location.hash) { replacing = true; location.replace(to); } return; }
  then = norm(trail[k]) === to ? null : to;
  history.go(k - at);
}
export function go(hash) {
  const to = norm(hash), from = norm(location.hash);
  if (to === location.hash) return;
  if (TABS.some(t => t[1] === to)) return rebase(to === "#home" || norm(trail[0]) !== "#home" ? 0 : 1, to);
  for (let k = at - 1; k >= 0; k--) if (trail[k] && samePlace(to, norm(trail[k]))) return rebase(k, to);
  const players = from.match(/^#players\/([^/]+)/);
  if (samePlace(to, from) || (SETUP.test(from) && /^#(players|score|review)\//.test(to)) || (players && placeOf(to) === `card/${players[1]}`)) return rebase(at, to);
  location.hash = to;
}
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-goback]");
  if (b) {
    ev.preventDefault();
    if (at > 0) history.back(); else rebase(0, norm(b.dataset.goback));
    return;
  }
  if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = ev.target.closest("a[href^='#']");
  if (!a || a.target || a.closest(".sheet-wrap, .viewer")) return;
  ev.preventDefault();
  go(a.getAttribute("href"));
});
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
export const andList = xs => xs.length < 2 ? (xs[0] || "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
export const firstName = n => String(n || "").trim().split(/\s+/)[0];
/** Tees are named after the markers' colour, so the picker shows the colour itself. */
const TEE_INK = { white: "#FFFFFF", yellow: "#EFC63C", blue: "#2E6FB7", red: "#C8433A", black: "#17181A", orange: "#E07B23",
  green: "#2E8B57", gold: "#D4A017", silver: "#B9BDC1", grey: "#8A9095", gray: "#8A9095", brown: "#8A6D3B",
  pink: "#E58FA6", purple: "#7A5AA8", bronze: "#D9A46A" };
export const teeColor = t => TEE_INK[String(t || "").toLowerCase()] || "var(--card2)";
export const inits = n => String(n || "").trim().split(/\s+/).slice(0, 2).map(w => [...w][0].toUpperCase()).join("");
export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
export const sum = xs => xs.reduce((a, b) => a + b, 0);
/** "Sat 5 Sep 2026" from an ISO date; the raw text if it is not a date. */
export const fmtDate = d => { const t = d ? new Date(d + "T12:00:00") : null; return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : (d || ""); };
export const shortDate = d => { const t = d ? new Date(d + "T12:00:00") : null; return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : (d || "–"); };
/** "just now", "3 h ago", "Tue", "5 Sep": how long ago something was, briefly. */
export function ago(iso) {
  const t = iso ? new Date(iso).getTime() : 0;
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return new Date(t).toLocaleDateString("en-GB", { weekday: "short" });
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
export const courseTitle = c => c.loop ? `${c.name} · ${c.loop}` : c.name;
export const courseBy = slug => S.courseBy(slug);
// iPadOS calls itself a Macintosh in Safari's default desktop mode, so touch points are what give an iPad away.
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/.test(navigator.userAgent);
export const onPhone = () => isIOS() || isAndroid();
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
/**
 * A browser inside another app -- WhatsApp, Instagram, Facebook, LinkedIn -- which is exactly where a shared
 * card or an invite lands. On iOS it can install nothing at all; on Android it has no install prompt either.
 * It is the reason the door always keeps one way through: told to install and unable to, you would be stuck.
 * Chrome and Firefox on iOS keep "Safari" in the string and are not caught by the fallback.
 */
export const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Snapchat|Twitter|WhatsApp|MicroMessenger/.test(navigator.userAgent)
  || (isIOS() && !/Safari/.test(navigator.userAgent));
/** What this particular browser can actually be asked to do about installing. One of the door's panels. */
export function installRoute() {
  if (window.__installPrompt) return "prompt";          // Chrome and Edge hand over their own, and one tap does it
  if (inAppBrowser()) return isIOS() ? "ios-elsewhere" : "android-elsewhere";
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  return "desktop";
}
/**
 * Whether installing is worth offering here: a browser that is not already the installed app. It is an offer,
 * never a wall -- the app runs in any browser. localhost and file: are how this is developed and tested, and
 * the iOS shell is the installed app, though WebKit does not report it standalone.
 */
export const atDoor = () => !isStandalone() && !isNative() && location.protocol !== "file:"
  && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
export const inShell = () => isNative();
/** Wide enough to be a laptop: the organiser's screens spread out, and the tabs become a rail down the side. */
export const onDesk = () => window.matchMedia("(min-width: 900px)").matches;
export const appBase = () => `${location.origin}${location.pathname}`;

/** Handicap index as typed: "19,9", "+2.1" (plus handicap), "18". */
export function parseHI(s) {
  s = String(s || "").trim().replace(",", ".");
  if (!s) return NaN;
  const plus = s.startsWith("+");
  const v = Number(s.replace(/^\+/, ""));
  return plus ? -v : v;
}
export const hiOk = hi => hi >= -10 && hi <= 54;

/** Screen state that survives a redraw but not a reload. Keyed per screen where a screen has several instances. */
// A league's own screen state is two keys now: which table it is being read in, and in what currency two
// players are compared. Everything else that used to live here -- which tab, which player, which pair -- is
// in the hash instead, so the back button works and a board can be linked to.
export const ui = { expanded: null, selHole: null, sel: {}, ask: null, blobs: [], groupFilter: {}, reviewOrder: {}, roundsFilter: "all", extrasOpen: true,
  loops: {}, nineTab: {}, boardOf: {}, basis: {}, statsWho: {}, seasonMode: {}, seasonWho: {}, boardFmt: null, authMethods: ["google"], search: "", courseScope: "all", courseQ: "", unlisted: null, found: null, pending: null };

// ---------------------------------------------------------------- icons
const I = (d, extra = "") => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}${extra}</svg>`;
export const ICONS = {
  home: I(`<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>`),
  play: I(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>`),
  leagues: I(`<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8 21h8"/><path d="M9 17h6v4"/>`),
  people: I(`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15.5a5 5 0 0 1 5.5 4.5"/>`),
  me: I(`<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`),
  bell: I(`<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>`),
  share: I(`<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v8h14v-8"/>`),
  link: I(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  plus: I(`<path d="M12 5v14"/><path d="M5 12h14"/>`),
  search: I(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`),
  qr: I(`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3z"/><path d="M20 14v7h-3"/>`),
  check: I(`<path d="m5 12 5 5 9-10"/>`),
  x: I(`<path d="M6 6l12 12"/><path d="M18 6 6 18"/>`),
  camera: I(`<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>`),
  flag: I(`<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>`),
  card: I(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>`),
  friend: I(`<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 14 0"/><path d="M19 8v6"/><path d="M16 11h6"/>`),
  trophy: I(`<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8 21h8"/>`),
  settings: I(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`),
  lock: I(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
  chart: I(`<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>`),
  users: I(`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15.5a5 5 0 0 1 5.5 4.5"/>`),
  info: I(`<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>`),
  logout: I(`<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4"/><path d="M8 12h10"/>`),
  sun: I(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
  shield: I(`<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>`),
  db: I(`<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>`),
  more: I(`<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>`),
  menu: I(`<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>`),
  image: I(`<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>`),
  table: I(`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M9 4v16"/>`),
  vs: I(`<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20a5 5 0 0 1 10 0"/><path d="M12 20a5 5 0 0 1 10 0"/>`),
  edit: I(`<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m12 8 4 4"/>`),
  inbox: I(`<path d="M4 4h16v16H4z"/><path d="M4 14h5l1.5 2h3L15 14h5"/>`),
  mail: I(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>`),
  golf: I(`<path d="M7 21V4l9 3.5L7 11"/><ellipse cx="12" cy="21" rx="7" ry="1.5"/>`),
  // a stand bag, tilted on its leg, three clubs out of the top
  bag: I(`<g transform="rotate(-16 12 12)"><path d="M7.5 8.5h8V20a1.8 1.8 0 0 1-1.8 1.8H9.3A1.8 1.8 0 0 1 7.5 20z"/><path d="M7.5 11.5h8"/><path d="M9.6 8.5V3.8l-2.2-.8"/><path d="M11.5 8.5V2.3h2.3"/><path d="M13.4 8.5V4.3l2.1-.8"/></g><path d="M16.2 12.6 19.3 21.2"/>`),
  shop: I(`<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>`),
  // the Shots tab follows the ball: a shot gaining ground, the tee, the approach, the bunker, the putt.
  // A dotted flight is a dash of length zero every 3.2, which only shows with round caps.
  gained: I(`<circle cx="6" cy="17.5" r="2.5"/><path d="M8.5 15.5C11 10 14.5 7 20 5"/><path d="M15.5 4.5 20 5l-1.6 4.3"/>`),
  tee: I(`<circle cx="12" cy="5.5" r="3.5"/><path d="M8 10.5h8l-2.5 2.5v6l-1.5 2.5-1.5-2.5v-6z"/><path d="M3 15.5h4.5"/><path d="M16.5 15.5H21"/>`),
  approach: I(`<path d="M15 18V3l5 2.2L15 7.4"/><ellipse cx="14" cy="18.5" rx="7.5" ry="2.5"/><path d="M2.5 16C4 10 7.5 7.5 11 7.5" stroke-dasharray="0 3.2"/>`),
  bunker: I(`<path d="M2.5 15h4c1.2 3 3.2 4.5 5.5 4.5s4.3-1.5 5.5-4.5h4"/><path d="M11.5 15.5C12 10 14.5 6.5 18 5.5" stroke-dasharray="0 3.2"/><circle cx="20" cy="5" r="1.8"/>`),
  putt: I(`<path d="M4 3.5 8 15.2"/><path d="M6 15.8l4-1.3"/><circle cx="13" cy="17.6" r="1.9"/><ellipse cx="19.3" cy="19.2" rx="2.4" ry="1"/>`),
  // and the rest of the stats headings: kinds of hole, stroke index, habits, handicap, the card, a ball, a loop, form, a podium
  holes: I(`<path d="M5 20V12l3 1.2-3 1.2"/><path d="M11.5 20V8.5l3 1.2-3 1.2"/><path d="M18 20V5l3 1.2L18 7.4"/><path d="M2.5 20.5h19"/>`),
  index: I(`<path d="M3 20h4.5v-4.5H12V11h4.5V6.5H21"/><path d="M3 20h18"/>`),
  habits: I(`<path d="M5 5.5h14"/><path d="M5 18.5h14"/><path d="M3 12c1.5-3.5 3-3.5 4.5 0s3 3.5 4.5 0 3-3.5 4.5 0 3 3.5 4.5 0"/>`),
  gauge: I(`<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.2-5.6"/><circle cx="12" cy="17" r="1.4"/><path d="M6.2 11.2l1.2 1M12 8.5v1.5M17.8 11.2l-1.2 1"/>`),
  scorecard: I(`<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8.5h16"/><path d="M10 8.5V21"/><circle cx="15" cy="14.5" r="2.6"/>`),
  ball: I(`<circle cx="12" cy="12" r="8.5"/><path d="M9 9.5h.01M12.5 8h.01M15 10.5h.01M10.5 13h.01M14 14h.01M8.5 16h.01"/>`),
  loop: I(`<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M17.8 2.8l-.3 4.1-4.1-.3"/><path d="M11 16V8.5l3.5 1.4-3.5 1.4"/>`),
  trend: I(`<path d="M3 17l5.5-5.5 4 4L20 8"/><path d="M15 8h5v5"/>`),
  rank: I(`<path d="M3 20.5h18"/><path d="M9 20.5V9h6v11.5"/><path d="M3.5 20.5V14H9"/><path d="M15 16h5.5v4.5"/><path d="M11.5 12.5 12.6 12v4"/>`),
};
export const TABS = [["home", "#home", "Play", "golf"], ["stats", "#stats", "Stats", "chart"], ["leagues", "#leagues", "Societies", "leagues"], ["me", "#me", "Me", "me"]];

// ---------------------------------------------------------------- the page shell
let toastTimer = null;

/**
 * One screen. A top-level screen (tabs given) carries the brand, the bell and the gear; a sub-screen carries a back arrow
 * and a title. `actions` are extra header buttons, `bar` a fixed action bar instead of the tabs, `bare` the
 * gate (no chrome at all). A screen with no `back` and a `tabs` key is top level and gets the centred masthead.
 */
export function page(title, body, { back = "#home", bar = "", sub = "", tabs = null, brand = false, keepScroll = false, bare = false, actions = "", bell = true, wide = false } = {}) {
  const y = keepScroll ? scrollPos() : 0;
  const badge = N.actionable();
  const nav = tabs ? `<nav class="tabs">${TABS.map(([k, h, l, ic]) => `<a href="${h}" class="${k === tabs ? "on" : ""}">${ICONS[ic]}${l}${k === "me" && pendingPeople() ? `<span class="n">${pendingPeople()}</span>` : ""}</a>`).join("")}</nav>` : "";
  const bellBtn = bell && A.signedIn() ? `<a class="iconbtn ${location.hash === "#updates" ? "on" : ""}" href="#updates" aria-label="Updates">${ICONS.bell}${badge ? `<span class="n">${badge}</span>` : N.unread() ? `<span class="n quiet">${N.unread()}</span>` : ""}</a>` : "";
  const gearBtn = "";
  // a top-level screen (a tab, nothing to go back to) carries the masthead: the title centred between the
  // bell and the gear. Everything reached from one keeps the back arrow and a title on the left.
  const head = !back && tabs
    ? `<header class="top mast"><div class="acts">${bellBtn}</div>
      <div class="ttl">${brand ? `<div class="wordmark">Hagolf</div>` : `<h1>${esc(title)}</h1>`}${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
      <div class="acts end">${actions}${gearBtn}</div></header>`
    : `<header class="top">${back ? `<button class="back" data-goback="${esc(back)}" aria-label="Back">‹</button>` : "<span class='back none'></span>"}
      <div class="ttl">${brand ? `<div class="brand">Hagolf</div>` : `<h1>${esc(title)}</h1>`}${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
      <div class="acts">${actions}${bellBtn}${gearBtn}</div></header>`;
  app.innerHTML = bare ? `<main class="bare">${body}</main>` : `${head}
    <main class="${bar ? "with-bar" : tabs ? "with-tabs" : ""}${wide ? " wide" : ""}">${body}</main>
    ${bar ? `<footer class="bar">${bar}</footer>` : nav}`;
  scrollAt(y);
  cueTabs();
}
/** Friend requests waiting, for the People tab's badge. */
function pendingPeople() { try { return (JSON.parse(localStorage.getItem("hagolf-friends")) || {}).incoming?.length || 0; } catch (e) { return 0; } }

/** Click handler for this screen only: main and the bar are rebuilt by page(), so nothing stacks up. */
export function bind(fn) {
  app.querySelectorAll("main, footer.bar, header.top").forEach(el => el.addEventListener("click", fn));
}

/** An icon button for the header. */
export const iconBtn = (act, icon, label, extra = "") => `<button class="iconbtn" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${ICONS[icon]}</button>`;

export function toast(msg, ms = 2600, action = null) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg.charAt(0).toUpperCase() + msg.slice(1);
  t.classList.toggle("action", !!action);
  if (action) {
    const b = document.createElement("button");
    b.className = "toastbtn"; b.textContent = action.label;
    b.onclick = () => { t.classList.remove("show"); action.fn(); };
    t.appendChild(b);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
export const hideToast = () => { const t = document.getElementById("toast"); if (t && !t.classList.contains("action")) t.classList.remove("show"); };

// ---------------------------------------------------------------- back shuts what is on top
// A sheet or the image viewer is a place of its own, so each takes a history entry while it is open: Android's
// back gesture and the browser's back button shut it instead of leaving the screen.
const overlays = [];
window.addEventListener("popstate", () => {
  const depth = (history.state && history.state.overlay) || 0;
  while (overlays.length > depth) overlays.pop()();
});
/**
 * Opens an overlay's own history entry and returns the way out of it. Every way of leaving -- back, the cross,
 * Escape, a button -- goes through that entry, so the two can never drift apart: asking to leave only asks the
 * browser to go back, and the overlay shuts when the entry does.
 */
function backShuts(shut) {
  try { history.pushState({ ...(history.state || {}), overlay: overlays.length + 1 }, ""); }
  catch (e) { return shut; }   // no history to lean on (file://): shut it outright
  overlays.push(shut);
  return () => { if (overlays.includes(shut)) history.back(); };
}

// ---------------------------------------------------------------- sheets: what confirm(), prompt() and alert() used to do
/**
 * A bottom sheet. `body` is trusted HTML; `actions` are [{label, value, kind}] drawn as buttons under it. Resolves
 * with the value tapped, or null when dismissed. Anything inside the body with data-act resolves with that too.
 */
export function sheet({ title = "", lead = "", body = "", actions = [], onOpen = null } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
      <div class="sheethead"><span class="grip"></span><button class="sheetx" data-sheet-x aria-label="Close">&times;</button></div>
      ${title ? `<h3>${esc(title)}</h3>` : ""}${lead ? `<p class="lead">${esc(lead)}</p>` : ""}${body}
      ${actions.length ? `<div class="acts">${actions.map(a => `<button class="btn ${a.kind || ""}" data-sheet="${esc(a.value)}">${esc(a.label)}</button>`).join("")}</div>` : ""}</div>`;
    let gone = false, picked = null;
    const shut = () => { if (gone) return; gone = true; wrap.remove(); document.removeEventListener("keydown", onKey); resolve(picked); };
    const leave = backShuts(shut);
    const close = v => { if (gone) return; picked = v; leave(); };
    const onKey = e => { if (e.key === "Escape") close(null); };
    wrap.addEventListener("click", ev => {
      if (ev.target === wrap) return close(null);
      if (ev.target.closest("[data-sheet-x]")) return close(null);
      const b = ev.target.closest("[data-sheet]");
      if (b) return close(b.dataset.sheet);
      const a = ev.target.closest("[data-act]");
      if (a && a.dataset.sheetAct !== undefined) return close(a.dataset.act);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    if (onOpen) onOpen(wrap.querySelector(".sheet"), close);
  });
}
/** Yes or no, with the destructive button drawn as such. Resolves true or false. */
export async function confirmSheet(title, lead, { label = "Confirm", danger = false, cancel = "Cancel" } = {}) {
  const v = await sheet({ title, lead, actions: [{ label, value: "ok", kind: danger ? "danger fill" : "primary" }, { label: cancel, value: "no" }] });
  return v === "ok";
}
/** One line of text. Resolves with the text, or null. */
export function promptSheet(title, lead, { placeholder = "", value = "", label = "Save", inputmode = "text" } = {}) {
  return new Promise(resolve => {
    sheet({ title, lead, body: `<form id="sheetf"><input name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" inputmode="${inputmode}" autocomplete="off"></form>`,
      actions: [{ label, value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }],
      onOpen: (el, close) => {
        const f = el.querySelector("#sheetf");
        f.querySelector("input").focus();
        f.addEventListener("submit", ev => { ev.preventDefault(); close("ok"); });
        el.querySelector("[data-sheet=ok]").addEventListener("click", () => { resolve(f.querySelector("input").value.trim()); }, { once: true });
      } }).then(v => resolve(v === "ok" ? undefined : null));
  }).then(v => v === undefined ? null : v);
}
/** A sheet holding a form: resolves with the button picked and the form as it was then. */
export async function formSheet({ title = "", lead = "", body = "", actions = [] }) {
  let fd = null;
  const v = await sheet({ title, lead, body: `<form id="formsheet">${body}</form>`, actions, onOpen: el => {
    const f = el.querySelector("#formsheet"), keep = () => { fd = new FormData(f); };
    f.addEventListener("input", keep); f.addEventListener("change", keep); f.addEventListener("submit", ev => ev.preventDefault()); keep();
  } });
  return [v, fd];
}
/** A sheet that just says something. */
export const alertSheet = (title, lead, body = "") => sheet({ title, lead, body, actions: [{ label: "OK", value: "ok", kind: "primary" }] });

const TALL = 1.5;   // height over width beyond which an image is a phone sheet
/** A rendered image looked at full screen, inside the app. A raw PNG thrown into a new browser tab is a jolt on
 *  a phone -- the app is gone, the way back is the browser's -- so the image opens over the screen instead:
 *  swipe or tap the arrows through the set, tap the image to read it up close, tap anywhere else to leave.
 *  Items are { url, label, blob?, w?, h? }; the full-size blob is turned into a URL only when looked at, and
 *  let go on the way out, so nothing the caller owns is revoked. */
export function viewer(items, start = 0) {
  const list = (items || []).filter(x => x && (x.url || x.blob));
  if (!list.length) return;
  let i = Math.min(Math.max(start, 0), list.length - 1), big = false, swiped = false;
  const made = new Map();
  const srcOf = n => { if (!made.has(n)) made.set(n, list[n].blob ? URL.createObjectURL(list[n].blob) : list[n].url); return made.get(n); };
  const wrap = document.createElement("div");
  wrap.className = "viewer";
  wrap.innerHTML = `<div class="vbar" role="dialog" aria-modal="true"><span class="vof"></span><button class="vx" data-v="close" aria-label="Close">&times;</button></div>
    <div class="vstage"><img alt=""></div>
    <div class="vfoot"><button class="vnav" data-v="-1" aria-label="Previous">&#8249;</button>
      <figcaption><span class="vlabel"></span><span class="vhint">Tap to look closer</span></figcaption>
      <button class="vnav" data-v="1" aria-label="Next">&#8250;</button></div>`;
  const img = wrap.querySelector("img"), stage = wrap.querySelector(".vstage");
  // a phone sheet is read down the screen at its own width, not shrunk until the whole height fits
  const tallNow = (w, h) => stage.classList.toggle("tall", !!w && h > w * TALL);
  img.addEventListener("load", () => tallNow(img.naturalWidth, img.naturalHeight));
  const zoom = on => { big = on; stage.classList.toggle("big", on); stage.scrollTop = 0; stage.scrollLeft = on ? (stage.scrollWidth - stage.clientWidth) / 2 : 0; };
  const show = () => {
    tallNow(list[i].w, list[i].h);
    img.src = srcOf(i);
    img.alt = list[i].label || "";
    wrap.querySelector(".vlabel").textContent = list[i].label || "";
    wrap.querySelector(".vof").textContent = list.length > 1 ? `${i + 1} of ${list.length}` : "";
    wrap.querySelectorAll(".vnav").forEach(b => { b.hidden = list.length < 2; });
    zoom(false);
  };
  const step = d => { i = (i + d + list.length) % list.length; show(); };
  let gone = false;
  const shut = () => {
    if (gone) return;
    gone = true;
    wrap.remove();
    document.removeEventListener("keydown", onKey, true);
    made.forEach((u, n) => { if (list[n].blob) URL.revokeObjectURL(u); });
  };
  const close = backShuts(shut);
  // caught on the way down, so Escape shuts the image and not the sheet underneath it as well
  const onKey = e => {
    const act = { Escape: close, ArrowLeft: () => step(-1), ArrowRight: () => step(1) }[e.key];
    if (!act) return;
    e.stopPropagation();
    e.preventDefault();
    act();
  };
  wrap.addEventListener("click", ev => {
    if (swiped) { swiped = false; return; }
    const b = ev.target.closest("[data-v]");
    if (b) return b.dataset.v === "close" ? close() : step(Number(b.dataset.v));
    if (ev.target === img) return zoom(!big);
    if (!ev.target.closest(".vfoot, .vbar")) close();
  });
  let x0 = null;
  stage.addEventListener("touchstart", e => { x0 = big || e.touches.length > 1 ? null : e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", e => {
    const dx = x0 === null ? 0 : e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50 && list.length > 1) { swiped = true; step(dx < 0 ? 1 : -1); }
  }, { passive: true });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(wrap);
  show();
}

// ---------------------------------------------------------------- explanations behind an "i", tab rows
// The words ride in a <template> beside the button, built where the numbers are built, and open in a sheet.
export const infoBtn = (title, text, cls = "") => `<button type="button" class="ibtn${cls ? ` ${cls}` : ""}" data-tip="${esc(title)}" aria-label="How this works${title ? `: ${esc(title)}` : ""}"><i aria-hidden="true">i</i></button><template>${text}</template>`;
export const h2tip = (title, text, icon = "") => `<div class="tiphead"><h2>${icon ? ICONS[icon] : ""}${esc(title)}</h2>${infoBtn(title, text)}</div>`;
export const tip = (text, label = "How this works") => `<div class="tiphead solo"><span>${esc(label)}</span>${infoBtn(label, text)}</div>`;
/** A section label with the hairline running off it, and an optional link or control at the far end. */
export const sect = (label, end = "") => `<div class="sect"><span class="caps">${esc(label)}</span><span class="fill"></span>${end}</div>`;
/** The same, where the label is itself a control (the board's heading is its own format switch). */
export const sectRaw = (labelHtml, end = "") => `<div class="sect">${labelHtml}<span class="fill"></span>${end}</div>`;
/** A part of a screen in a box of its own, headed by an icon, so one part never runs into the next. */
export const panel = (icon, label, inner, end = "", cls = "") => `<section class="panel ${cls}"><div class="ph">${ICONS[icon] || ""}<span class="caps">${esc(label)}</span>${end}</div>${inner}</section>`;
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-tip]");
  const t = b && b.nextElementSibling;
  if (!t || t.tagName !== "TEMPLATE") return;
  ev.preventDefault();   // an i inside a <summary> would otherwise toggle the fold behind the sheet
  const html = t.innerHTML.trim();
  sheet({ title: b.dataset.tip, body: `<div class="tipbody">${/^<p[\s>]/.test(html) ? html : `<p>${html}</p>`}</div>` });
});
export const subtabs = (buttons, small = false) => `<div class="tabrow"><div class="subtabs${small ? " small" : ""}">${buttons}</div><span class="cue l">&#8249;</span><span class="cue r">&#8250;</span></div>`;
export function cueTabs() {
  document.querySelectorAll(".tabrow").forEach(w => {
    const s = w.querySelector(".subtabs");
    const mark = () => { w.classList.toggle("more-l", s.scrollLeft > 2); w.classList.toggle("more-r", s.scrollLeft + s.clientWidth < s.scrollWidth - 2); };
    if (!w.dataset.cued) { w.dataset.cued = "1"; s.addEventListener("scroll", mark, { passive: true }); requestAnimationFrame(mark); }
    mark();
  });
}
window.addEventListener("resize", cueTabs);
export const avatar = (name, cls = "") => `<span class="avatar ${cls}" aria-hidden="true">${esc(inits(name) || "?")}</span>`;
// only an image the phone itself shrank is drawn, so a league row can never carry a script into a src
const ICON_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** A league's face: its uploaded icon, or its initials on the accent. */
export const leagueBadge = (g, cls = "") => g && g.icon && ICON_URL.test(g.icon)
  ? `<img class="lbadge ${cls}" src="${g.icon}" alt="">`
  : `<span class="lbadge mono ${cls}" aria-hidden="true">${esc(inits(g && g.name) || "?")}</span>`;
export const emptyState = (icon, title, text = "", action = "") => `<div class="empty">${ICONS[icon] || ""}<b>${esc(title)}</b>${text ? `<div>${esc(text)}</div>` : ""}${action}</div>`;

// ---------------------------------------------------------------- the look
// Every theme comes in a light and a dark version. A name can pin one -- `paper:dark`, which is also what a retired
// dark theme maps to -- and otherwise the version follows the phone's own choice in Appearance, or the phone itself.
const RETIRED = (DATA.retired && DATA.retired.themes) || {};
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
export const lookMode = () => S.state.settings.mode || "auto";
export const darkNow = () => lookMode() === "dark" || (lookMode() !== "light" && darkQuery.matches);
/** A theme by name: in the version asked for, else the one its name pins, else the one the phone is in now. */
export const themeNamed = (n, dark = null) => (n && (pickTheme(DATA, n, dark, darkNow()) || B.brandThemeNamed(n))) || null;
/** Every theme, each in the version the phone is in now. */
export const looks = () => DATA.themes.map(t => themeNamed(t.name));
// a course's members wear the course on every screen unless they chose a look of their own; a company stays on its rounds
const clubTheme = () => {
  if (S.state.settings.themeChosen) return null;
  const c = B.myBrands().find(x => x.kind !== "company");
  return c ? B.brandTheme(B.brandById(c.id) || c) : null;
};
// light or dark picked in Appearance beats the version an old theme name pins; left to the phone, the pin holds
export const appTheme = () => clubTheme() || themeNamed(S.state.settings.theme, lookMode() === "auto" ? null : darkNow()) || themeNamed("paper");
export const leagueTheme = g => (g && (B.brandTheme(B.brandOfLeague(g)) || themeNamed(g.theme))) || null;
export const themeFor = g => leagueTheme(g) || appTheme();
export const themeForRound = rid => B.brandTheme(B.brandOfRound(rid)) || S.leaguesOfRound(rid).map(leagueTheme).find(Boolean) || appTheme();
const LEAGUE_SCREENS = ["league", "leagueimages", "leagueposter", "statsposter"];
const ROUND_SCREENS = ["players", "score", "review", "attach", "graphics"];
export function themeHere() {
  const [name, arg] = location.hash.replace(/^#/, "").split("/");
  if (arg && LEAGUE_SCREENS.includes(name)) return themeFor(S.getLeague(arg));
  if (arg && ROUND_SCREENS.includes(name)) return themeForRound(arg);
  return appTheme();
}
let painted = null;
/** The screen in a theme: its colours, its two faces, its corners and its icon stroke, and its own touches in app.css. */
export function paint(t) {
  const key = t && `${t.name}:${t.mode || "light"}`;
  if (!t || !t.ui || key === painted) return;
  painted = key;
  const root = document.documentElement, h = t.HOUSE || {}, r = Math.min(16, Math.max(2, Math.round(6 * (h.radius ?? 1))));
  const vars = { ...t.ui, fd: `"${t.DISPLAY}", sans-serif`, ft: `"${t.TEXT}", sans-serif`, r: `${r}px`, "r-s": `${Math.max(2, Math.round(r * 0.66))}px`,
    "r-xs": `${Math.max(2, Math.round(r / 2))}px`, isw: (h.icons || 1.9) / 1.9, icap: (h.radius ?? 1) > 0.3 ? "round" : "square", ijoin: (h.radius ?? 1) > 0.3 ? "round" : "miter" };
  for (const [k, v] of Object.entries(vars)) if (k !== "scheme") root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = t.ui.scheme;
  root.dataset.theme = t.name.split("·")[0];
  root.dataset.mode = t.mode || "light";
  root.toggleAttribute("data-caps", !!h.caps);
  if (t.fonts) loadFonts(t.fonts);
  const meta = document.querySelector("meta[name=theme-color]");
  if (meta) meta.content = t.ui.bg;
}
darkQuery.addEventListener("change", () => { if (lookMode() === "auto") paint(themeHere()); });
/** What the account brings to the look: the mark, and a course's theme unless the phone chose its own. */
export function applyBrand() {
  setMarkText(null);
  setMarked(E.marked());
  painted = null;
  paint(themeHere());
  B.refreshBrands().then(() => { painted = null; paint(themeHere()); });
}
/** One chip a look, its swatch drawn from that theme's own tokens and set in its own display face. */
export function tchip(input, t, label, on) {
  return `<label class="tchip ${on ? "on" : ""}" style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT};--tink:${t.INK};--tfd:'${t.DISPLAY}'">
    ${input}<span class="sw"><b>${esc(t.name.toUpperCase())}</b></span>${esc(label)}</label>`;
}
/** A strip of one sliver per look, the set seen at a glance. */
export const swatchStrip = themes => `<span class="fstrip">${themes.map(t => `<i style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT}"></i>`).join("")}</span>`;
// A picker shows what this account may use and nothing else: a look it does not hold is absent, not a padlock
// wearing a price. What is missing is one button at the foot instead, and that button opens the shop over the
// screen rather than sending the phone to the Shop tab and losing its place. `keep` are the looks already
// chosen, which stay on the list however they were come by -- a league keeps wearing what it was given.
const usable = keep => looks().filter(t => E.canTheme(t.name) || keep.includes(t.name));
const looksMissing = keep => DATA.themes.filter(t => !E.canTheme(t.name) && !keep.includes(t.name)).length;
/** A button that opens the shop over whatever is on screen; `skus` is what it should open on. */
export const shopBtn = (label, skus = "themes") => `<button class="btn soft wide shopmore" type="button" data-shop="${esc([].concat(skus).join(","))}">${esc(label)}</button>`;
const moreLooks = keep => { const n = looksMissing(keep); return n ? shopBtn(`${plural(n, "more theme")} in the shop`) : ""; };
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-shop]");
  if (!b || b.disabled) return;
  b.disabled = true;
  try { await (await import("./screens/shop.js")).shopOver(b.dataset.shop.split(",")); } finally { b.disabled = false; }
});
// each chip names its theme in that theme's own display face
const lookGrid = (chip, keep = []) => { loadFonts(DATA.fonts); return `<div class="tgrid">${usable(keep).map(chip).join("")}</div>`; };
export function themeChips(selected) {
  return lookGrid(t => tchip(`<input type="checkbox" name="theme" value="${t.name}" ${selected.includes(t.name) ? "checked" : ""}>`, t, t.name, selected.includes(t.name)), selected) + moreLooks(selected);
}
/** What the folded look row says it is set to: the swatches, then the name or how many. */
const lookSays = sel => {
  const ts = sel.map(n => themeNamed(n)).filter(Boolean);
  return `${swatchStrip(ts)}<span class="fname">${ts.length === 1 ? esc(ts[0].name) : plural(ts.length, "theme")}</span>`;
};
/**
 * On a screen that is really about something else the looks are a grid to scroll past, so they fold to one row
 * that says what is set, and open on a tap -- or already open when more than one is ticked, which is never what
 * the row alone could say.
 */
export const themePicker = (selected, note = "") => `<details class="lookfold" ${selected.length > 1 ? "open" : ""}>
  <summary>${lookSays(selected)}</summary>
  ${note ? `<p class="muted small lookwhy">${note}</p>` : ""}
  <div class="themes">${themeChips(selected)}</div></details>`;
/** Keeps that row saying what is ticked under it. */
export function bindLook(el, onPick = null) {
  if (!el) return;
  const says = el.querySelector(":scope > summary");
  bindChips(el, v => {
    says.innerHTML = lookSays([...el.querySelectorAll("input[name=theme]:checked")].map(i => i.value));
    if (onPick) onPick(v);
  });
}

export function themeRadios(name, sel, dflt = null) {
  const none = dflt ? tchip(`<input type="radio" name="${name}" value="" ${sel ? "" : "checked"}>`, dflt.theme, dflt.label, !sel) : "";
  const base = sel && String(RETIRED[sel] || sel).split(":")[0];
  loadFonts(DATA.fonts);
  return `<div class="tgrid">${none}${usable(base ? [base] : []).map(t => tchip(`<input type="radio" name="${name}" value="${t.name}" ${t.name === base ? "checked" : ""}>`, t, t.name, t.name === base)).join("")}</div>` + moreLooks(base ? [base] : []);
}
export function bindChips(el, onPick = null) {
  if (!el) return;
  el.addEventListener("change", ev => {
    const l = ev.target.closest(".tchip");
    if (!l) return;
    if (ev.target.type === "radio") el.querySelectorAll(".tchip").forEach(x => x.classList.toggle("on", x === l));
    else l.classList.toggle("on", ev.target.checked);
    if (onPick) onPick(ev.target.value);
  });
}

// ---------------------------------------------------------------- sharing and saving
/** The share sheet where there is one, the clipboard where there is not, and a sheet where even that is blocked. */
export async function shareLink(link, title, text) {
  if (navigator.share) { try { await navigator.share({ title, text, url: link }); return; } catch (e) { if (e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(link); toast("Link copied"); }
  catch (e) { await alertSheet("Copy this link", "", `<div class="linkbox">${esc(link)}</div>`); }
}
/** A link as a QR, white behind it whatever the theme, so it scans. */
export function qrHtml(link) {
  if (typeof window.qrcode !== "function") return "";
  try {
    const q = window.qrcode(0, "M"); q.addData(link); q.make();
    return `<div class="qr">${q.createSvgTag(4, 0).replace("<svg ", '<svg style="width:100%;height:100%" ')}</div>`;
  } catch (e) { return ""; }
}
export function canShareFiles() {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch (e) { return false; }
}
const allImages = files => files.every(f => f.type.startsWith("image/"));
// Android's share sheet has no way into the gallery, but a downloaded image lands in it; an iPhone can only reach Photos through the sheet
const sheetForPhotos = () => canShareFiles() && !isAndroid();
export async function saveFiles(files, title) {
  const photos = allImages(files);
  if (canShareFiles() && navigator.canShare({ files }) && !(photos && isAndroid())) {
    // iOS can leave "Save Image" out of the sheet when the share carries words, so images go alone
    try { await navigator.share(photos ? { files } : { files, title }); return; } catch (err) { if (err.name === "AbortError") return; console.warn(err); }
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise(res => setTimeout(res, 400));
  }
  if (photos && isAndroid()) toast(files.length === 1 ? "Saved to your photos" : `${files.length} images saved to your photos`);
  else toast(files.length === 1 ? "Saved to your downloads" : `${files.length} files sent to your downloads`);
}
export function slugFile(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "round";
}
async function thumbnail(fig) {
  const w = 720, h = Math.round(fig.canvas.height * w / fig.canvas.width);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(fig.canvas, 0, 0, w, h);
  return cv.convertToBlob ? cv.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : new Promise(res => cv.toBlob(res, "image/jpeg", 0.85));
}
// a phone sheet's thumbnail shows its top at full width and fades out, so a list of them is not a mile of scrolling
const thumbImg = (x, i) => {
  const img = `<img src="${x.thumbUrl}" alt="${esc(x.label)}" data-act="open" data-i="${i}">`;
  return x.h > x.w * TALL ? `<span class="tthumb">${img}</span>` : img;
};
const toFile = (x, prefix) => new File([x.blob], `${prefix}_${x.label.replace(/\//g, "_")}`, { type: "image/png" });

/** Renders jobs one by one with a progress line into #out, then shows thumbnails with save buttons. */
export async function runJobs(jobs, prefix) {
  const out = document.getElementById("out");
  out.innerHTML = `<div class="progress">Loading fonts…</div>`;
  ui.blobs.forEach(b => b.thumbUrl && URL.revokeObjectURL(b.thumbUrl));
  ui.blobs = [];
  await loadFonts(DATA.fonts);
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    out.querySelector(".progress").textContent = `Rendering ${i + 1} of ${jobs.length}: ${jobs[i].label}`;
    await new Promise(res => setTimeout(res, 0));
    try {
      const fig = jobs[i].make();
      const blob = await fig.toBlob();
      const thumb = await thumbnail(fig);
      results.push({ label: jobs[i].label, blob, thumbUrl: URL.createObjectURL(thumb), w: fig.canvas.width, h: fig.canvas.height });
    } catch (err) {
      console.error(err);
      results.push({ label: jobs[i].label, error: err.message });
    }
  }
  ui.blobs = results;
  const ok = results.filter(x => x.blob);
  out.innerHTML = `
    <h2>${plural(ok.length, "image")} ready</h2>
    <div class="saveall"><button class="btn primary" data-act="save-all">${sheetForPhotos() ? "Save all to Photos" : onPhone() ? "Save all to phone" : "Download all"}</button>
      <div class="muted small">${sheetForPhotos() ? "Tap “Save Images” in the sheet. " : onPhone() ? "They go straight to your photos. " : ""}Or save one at a time below.</div></div>
    <div class="thumbs">${results.map((x, i) => x.blob ? `
      <figure>${thumbImg(x, i)}<figcaption><span class="tname">${esc(x.label).replace(/([/_])/g, "$1<wbr>")} <span class="muted">${x.w}×${x.h}</span></span>
        <button class="btn small" data-act="save-one" data-i="${i}">Save</button></figcaption></figure>`
      : `<figure class="err"><figcaption>${esc(x.label)}: ${esc(x.error)}</figcaption></figure>`).join("")}</div>`;
  out.onclick = async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "save-all") await saveFiles(ok.map(x => toFile(x, prefix)), prefix);
    if (b.dataset.act === "save-one") await saveFiles([toFile(results[Number(b.dataset.i)], prefix)], prefix);
    if (b.dataset.act === "open") viewer(ok.map(x => ({ url: x.thumbUrl, blob: x.blob, label: x.label, w: x.w, h: x.h })), ok.indexOf(results[Number(b.dataset.i)]));
  };
  out.scrollIntoView({ behavior: "smooth" });
}
export { makeTheme, loadFonts, phone };
/** A look in the sizes this phone last chose, each with what goes before `.png` in its file name. */
export const sizedLooks = T => ({ full: [[T, ""]], phone: [[phone(T), "_phone"]], both: [[T, ""], [phone(T), "_phone"]] })[S.imageSize()];
export const sizedName = (file, tag) => file.replace(/\.png$/, `${tag}.png`);

// ---------------------------------------------------------------- rounds: small shared readers
export function safeCompute(compute, r, collapse = false) {
  const c = courseBy(r.course);
  if (!c) return null;
  try { return Object.assign(compute(c, S.toModelRound(r, collapse)), { id: r.id }); } catch (e) { return null; }
}
export function roundStatus(r) {
  const c = courseBy(r.course);
  const n = c ? c.n : 0;
  if (r.status === "setup") return `${plural(r.entries.length, "player")} · not started`;
  if (r.status === "scoring") return `scoring · hole ${Math.min(S.holeOf(r) + 1, n)} of ${n}`;
  return `done · ${plural(r.entries.length, "player")}`;
}
export function resumeHash(r) {
  if (r.status === "setup") return `#players/${r.id}`;
  if (r.status === "scoring") return `#score/${r.id}/${S.holeOf(r)}`;
  return `#review/${r.id}`;
}
// A round is read as club first, loop second: "18 holes" or "Oost" alone says nothing about where you were.
// An unlisted course has no name of its own: the round's name is where it was.
export const roundClub = r => { const c = courseBy(r.course); return c && !c.unlisted ? c.name : r.name; };
export const roundLoop = r => { const c = courseBy(r.course); return c && c.loop ? c.loop : ""; };
export const roundWhere = r => { const c = courseBy(r.course); return c && !c.unlisted ? courseTitle(c) : r.name; };
export function noCourse(r, back = "#play") {
  page(r.name || "Round", `<div class="banner warn">This round's course (${esc(r.course)}) is not on this phone yet. It arrives with the next sync.</div>`, { back });
}

// ---------------------------------------------------------------- the intent a link carried through the gate
const PENDING_KEY = "hagolf-pending";
export function rememberIntent(hash) { try { localStorage.setItem(PENDING_KEY, hash); } catch (e) { /* fine */ } }
export function takeIntent() { try { const v = localStorage.getItem(PENDING_KEY); localStorage.removeItem(PENDING_KEY); return v; } catch (e) { return null; } }
