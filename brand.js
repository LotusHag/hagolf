// A partner's look: the course or company whose contract a round or league carries. Fetched once per partner and
// kept on the phone, so a branded card still draws its logo on the tenth hole with no signal.
//
// Inside a branded round everything its sheets can be is unlocked for whoever makes them: the full boards and
// card, and the partner's name in the corner instead of ours. That is what the partner bought for its golfers,
// and none of them needs a code to get it.
import * as A from "./auth.js";
import * as S from "./store.js";
import { DATA } from "./data.js";
import { setBrand } from "./draw.js";

const KEY = "hagolf.brands";
let cache = {};
try { cache = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { cache = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* full or blocked: it is only a cache */ } };

export const brandById = id => (id && cache[id]) || null;
export function remember(brands) {
  for (const b of brands || []) if (b && b.id) cache[b.id] = { ...b, fetched: Date.now() };
  save();
}

const STALE = 6 * 3600 * 1000;
/** Fetches the looks this phone can see and does not hold, or holds from more than a few hours ago. */
export async function refreshBrands(extra = []) {
  if (!A.signedIn()) return;
  const ids = new Set(extra);
  for (const r of S.state.rounds) if (r.brand && !r.deleted) ids.add(r.brand);
  for (const g of S.state.leagues) if (g.brand && !g.deleted) ids.add(g.brand);
  for (const c of (A.account() && A.account().clubs) || []) ids.add(c.id);
  const want = [...ids].filter(id => !cache[id] || Date.now() - (cache[id].fetched || 0) > STALE);
  if (!want.length) return;
  try { remember((await A.api(`/club/brands?ids=${encodeURIComponent(want.join(","))}`)).brands); } catch (e) { console.warn("brands", e.message); }
}

/** The look a round wears: its own partner, or the first of its leagues that has one. */
export function brandOfRound(rid) {
  const r = S.getRound(rid);
  if (r && r.brand) return brandById(r.brand);
  const g = S.leaguesOfRound(rid).find(x => x.brand);
  return g ? brandById(g.brand) : null;
}
export const brandOfLeague = g => (g && g.brand ? brandById(g.brand) : null);
/** The partners this account may put on a round or league now: a seat in a live contract. */
export const myBrands = () => ((A.account() && A.account().clubs) || []).filter(c => c.live).map(c => brandById(c.id) || c);
/** A course partner whose course this is, to offer first when a round is set up there. */
export const brandForCourse = slug => myBrands().find(b => (b.courses || []).includes(slug)) || null;

// ---------------------------------------------------------------- the colours, as build.py mixes them
const SCREEN_SCORES = { under: "#1F8A5B", par: "#5B6A61", bogey: "#D9931A", double: "#C8433A", pick: "#8A6D3B", danger: "#C8433A", ok: "#2E8B57", gold: "#E5A80B",
  "sc-eagle": "#073B26", "sc-birdie": "#1F8A5B", "sc-par": "#9AA1A5", "sc-bogey": "#E0A020", "sc-double": "#C4362C", "sc-triple": "#78221C" };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hexa = c => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hexa(x.map((v, i) => v + (y[i] - v) * t)); };
const luminance = h => { const [r, g, b] = rgb(h).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const readable = (fill, over, ink, target = 4.5) => { for (const t of [0, .15, .3, .45, .6, .75, .9, 1]) { const c = mix(fill, ink, t); if (contrast(c, over) >= target) return c; } return ink; };

/** The CSS custom properties app.css reads, mixed from one theme's tokens: build.py's screen_palette, in JS. */
export function screenPalette(t) {
  const bg = t.BG, ink = t.INK, dark = luminance(bg) < 0.45;
  const on = fill => luminance(fill) > 0.30 ? t.TEXT_ON_LIGHT : t.TEXT_ON_DARK;
  const ui = Object.fromEntries(Object.entries(SCREEN_SCORES).map(([k, v]) => [k, dark ? mix(v, ink, 0.32) : v]));
  return Object.assign(ui, {
    bg, card: t.PANEL, card2: t.PANEL_2, line: t.LINE, line2: mix(t.LINE, ink, 0.14), ink, ink2: t.INK_2, ink3: t.INK_3,
    green: t.ACCENT, "green-dark": mix(t.ACCENT, "#000000", 0.20), "green-soft": mix(t.ACCENT, bg, 0.86), "green-ink": on(t.ACCENT),
    "green-hi": readable(ui.gold, t.ACCENT, on(t.ACCENT)), bronze: t.BRONZE, "on-bronze": on(t.BRONZE),
    "on-ink": on(ink), "on-double": on(ui.double), "on-gold": on(ui.gold),
    "gold-soft": mix(SCREEN_SCORES.gold, bg, 0.86), "gold-ink": dark ? ui.gold : mix(SCREEN_SCORES.gold, "#000000", 0.55),
    "danger-soft": mix(SCREEN_SCORES.danger, bg, 0.88), scheme: dark ? "only dark" : "only light",
  });
}

const BUILT = new Map();
export const brandThemeNamed = n => BUILT.get(n) || null;
/** The theme a partner wears: its palette over its base, or its chosen theme as it is. Null when it has neither. */
export function brandTheme(b) {
  if (!b) return null;
  const base = DATA.themes.find(t => t.name === (b.palette && b.palette.base)) || DATA.themes.find(t => t.name === b.theme);
  if (!base) return null;
  const over = Object.fromEntries(Object.entries(b.palette || {}).filter(([k, v]) => k !== "base" && /^#[0-9A-F]{6}$/i.test(v)));
  const fam = b.template && b.template.house && (DATA.families || []).some(f => f.key === b.template.house) ? b.template.house : null;
  if (!Object.keys(over).length && !fam) return base;
  const t = { ...base, ...over, family: fam || base.family, name: `${base.name}·${b.id}`, blurb: b.name };
  t.ui = screenPalette(t);
  BUILT.set(t.name, t);
  return t;
}

// ---------------------------------------------------------------- the logo and the words, on the sheets
const logos = new Map();
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/;
/** Decodes the partner's logo once, so a render that has to be synchronous can draw it. */
export function loadLogo(b) {
  if (!b || !b.logo || !LOGO.test(b.logo)) return Promise.resolve(null);
  if (logos.has(b.logo)) return logos.get(b.logo);
  const p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = b.logo; });
  logos.set(b.logo, p);
  return p;
}

const longDate = d => { try { return new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return d; } };
/** What draw.js needs, from the partner and the day the sheet is about. */
export async function sheetBrand(b, date = null) {
  if (!b) return null;
  const t = b.template || {};
  return { name: b.name, logo: await loadLogo(b), mark: t.mark || null, kicker: t.kicker || null, foot: t.foot || null, link: t.link || null,
    date: t.date && date ? longDate(date) : null, titles: t.titles || null };
}

/** Draws whatever `make` draws wearing this partner, and takes it off again however `make` ends. */
export async function withBrand(b, date, make) {
  if (!b) return make();
  setBrand(await sheetBrand(b, date));
  try { return await make(); } finally { setBrand(null); }
}

/** The kinds of image a partner offers, when its template narrows them. */
export const kindsOf = b => (b && b.template && Array.isArray(b.template.kinds) && b.template.kinds.length ? b.template.kinds : null);
