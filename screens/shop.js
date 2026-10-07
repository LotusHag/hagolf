// The shop: the catalogue in one place, out of the scoring flow, and every item shown working on the showcase
// round before it is bought. A locked item is a preview, never a padlock. The showcase is an invented round and
// league (sample.js), the same on every phone, so a first-time buyer sees as much as anyone. Buying happens on
// Stripe's page.
import { DATA } from "../data.js";
import * as S from "../store.js";
import * as A from "../auth.js";
import * as E from "../entitlements.js";
import { page, bind, esc, go, toast, sheet, viewer, app, ICONS, TABS, subtabs, firstName, appTheme, themeNamed, themeHere, paint, makeTheme, loadFonts, FAMILIES, themesIn, familyStrip } from "../ui.js";
import { setMarked, marked } from "../draw.js";
import { leagueStats } from "../model.js";
import { stablefordLeaderboard, bothBoards, holesPoster, standingsPoster, STANDINGS_TITLES } from "../posters.js";
import { statsFieldPoster, statsPlayerPoster } from "../statsposters.js";
import { renderCard } from "../cards.js";
import { standingsFor } from "./formats.js";
import { showcaseLeague } from "../sample.js";

const eur = c => `€${(c / 100).toFixed(2).replace(".", ",")}`;
const ON_LEAGUE = ["matchplay", "grandprix", "season"];
const GROUPS = [
  { key: "mark", title: "The mark", intro: "Every free poster and card carries a small hagolf.app mark.", skus: ["nomark"] },
  { key: "images", title: "What the images say", intro: "The free boards and cards say who won. These say how.", skus: ["boards", "card", "season"] },
  { key: "ranking", title: "Ways of ranking a season", intro: "Stableford and stroke play are free. These are the other ways to score a season.", skus: ["matchplay", "grandprix"] },
];

const TABS_ = [["all", "All"], ["mark", "The mark"], ["images", "Images"], ["ranking", "Ranking"], ["themes", "Themes"]];
let tab = "all";   // the tab last looked at stays chosen for the session

// The catalogue is asked for once a session and kept, so a picker that opens the shop over itself opens at
// once rather than after a round trip. The Shop tab itself always asks again: it is the screen a purchase
// comes back to.
let held = null;
const catalogue = (fresh = false) => (held = fresh || !held ? A.api("/shop/catalogue").catch(e => { held = null; throw e; }) : held);

/**
 * The shop over whatever asked for it. A picker that has hidden what the account does not hold offers this
 * instead of a link to the Shop tab, so nothing half-filled in is lost on the way there and back. `skus` is
 * what to open on: one goes straight to that item's own sheet, several to a list of them.
 */
export async function shopOver(skus) {
  if (!A.account()) return toast("Sign in first: what you buy follows your account", 5000);
  let cat;
  try { cat = await catalogue(); } catch (e) { return toast(e.message, 5000); }
  const D = previewData();
  const item = sku => cat.skus.find(c => c.sku === sku);
  const missing = [].concat(skus).filter(s => s === "themes" ? !ownsAll(cat) : !(item(s) || {}).owned);
  const open = sku => sku === "themes" ? bundleSheet(cat, D) : itemSheet(item(sku), cat, D);
  if (!missing.length) return toast("You have all of that already");
  if (missing.length === 1) return open(missing[0]);
  const row = sku => sku === "themes"
    ? `<button class="collrow" data-act="${sku}" data-sheet-act>${familyStrip(DATA.themes)}<span><b>Every theme</b><small class="muted">${DATA.themes.length} looks</small></span><i>›</i></button>`
    : `<button class="collrow" data-act="${sku}" data-sheet-act><span><b>${esc(item(sku).name)}</b><small class="muted">${esc(item(sku).blurb)}</small></span><i>›</i></button>`;
  const v = await sheet({ title: "In the shop", lead: "Shown on the showcase round first. Nothing here is needed to play.",
    body: `<div class="collrows">${missing.map(row).join("")}</div>` });
  if (v) return open(v);
}

export async function shop(state) {
  if (TABS_.some(([k]) => k === state)) tab = state;
  if (state === "thanks") {
    try { await A.whoami(); } catch (e) { /* offline: the next refresh brings it */ }
    toast("Thank you. It is yours, on every phone you sign in on.", 5000);
    return go("#shop");
  }
  if (!A.account()) return page("Shop", `<div class="banner"><a href="#welcome">Sign in</a> first: what you buy follows your account to every phone.</div>`, { back: "", tabs: "shop" });
  page("Shop", `<p class="muted center" style="margin-top:30px">Loading…</p>`, { back: "", tabs: "shop" });
  await A.recheck(0);   // opened *because* something may have just become theirs: read the account, not the cache
  let cat;
  try { cat = await catalogue(true); } catch (e) { return page("Shop", `<div class="banner warn">${esc(e.message)}</div>`, { back: "", tabs: "shop" }); }
  const D = previewData();
  const all = cat.skus.some(c => (c.sku === "pass" || c.sku === "themes") && c.owned);
  const item = sku => cat.skus.find(c => c.sku === sku);
  const pass = item("pass"), bundle = item("themes");
  const rest = cat.skus.filter(c => c.sku !== "pass"), oneByOne = rest.reduce((a, c) => a + c.price, 0);
  // Bought is gone. An item this account holds leaves the shop rather than sitting there wearing a "Yours"
  // pill, a group with nothing left in it takes its heading and its tab with it, and a shop with nothing at
  // all left to sell says so instead of showing a page of things already paid for.
  const groups = GROUPS.map(g => ({ ...g, items: g.skus.map(item).filter(c => c && !c.owned) })).filter(g => g.items.length);
  const colls = FAMILIES.filter(f => themesIn(f.key).length && !(all || (collectionOf(cat, f.key) || {}).owned));
  if (!groups.length && all) return everything(cat);
  const tabs = TABS_.filter(([k]) => k === "all" || (k === "themes" ? !all : groups.some(g => g.key === k)));
  if (!tabs.some(([k]) => k === tab)) tab = "all";
  const swatch = t => `style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT};--tink:${t.INK}"`;
  // one card a family: its looks as a strip, what it costs as a set, and the sheet with every look in it
  const collHtml = f => {
    const ts = themesIn(f.key), c = collectionOf(cat, f.key);
    const free = ts.filter(t => cat.freeThemes.includes(t.name)).length;
    const yours = ts.filter(t => !cat.freeThemes.includes(t.name) && ownsTheme(cat, t.name)).length;
    const had = [free ? `${free} free` : "", yours ? `${yours} already yours` : ""].filter(Boolean).join(", ");
    return `<div class="card shopitem" data-sku="collection:${f.key}">
      <button class="shopthumb swrow" data-act="peek" data-sku="collection:${f.key}" aria-label="See the ${esc(f.name)} looks">${ts.map(t => `<i ${swatch(t)}></i>`).join("")}</button>
      <div class="body row"><button class="plain" data-act="peek" data-sku="collection:${f.key}"><div class="name">${esc(f.name)}</div><div class="muted small">${esc(f.blurb)}</div>
        <div class="muted small shopline">${ts.length} looks${had ? `, ${had}` : ""}</div><div class="peek">See all ${ts.length} ›</div></button>
        ${c ? `<button class="btn small primary" data-act="buy" data-sku="${c.sku}" ${cat.stripe ? "" : "disabled"}>${eur(c.price)}</button>` : ""}</div></div>`;
  };

  const itemHtml = c => `<div class="card shopitem" data-sku="${esc(c.sku)}">
    <button class="shopthumb" data-act="peek" data-sku="${esc(c.sku)}" aria-label="See ${esc(c.name)} on ${onWhat(c.sku).short}"><span class="skeleton"></span></button>
    <div class="body row"><button class="plain" data-act="peek" data-sku="${esc(c.sku)}"><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.blurb)}</div><div class="peek">See it on ${onWhat(c.sku).short} ›</div></button>
      <button class="btn small primary" data-act="buy" data-sku="${esc(c.sku)}" ${cat.stripe ? "" : "disabled"}>${eur(c.price)}</button></div></div>`;

  page("Shop", `
    ${tabs.length > 2 ? subtabs(tabs.map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")) : ""}
    <button class="shopwhy" data-act="why"><b>Everything here is extra.</b><span>Why it costs what it costs ›</span></button>
    ${cat.open && cat.stripe ? "" : `<p class="muted small shopline">${cat.open ? "" : "Nothing is gated yet. "}${cat.stripe ? "" : "Buying is not open yet."}</p>`}
    <div data-tab="all">
    <div class="now pass"><div class="k">Everything</div><div class="name">${esc(pass.blurb)}</div>
      <div class="live">All of it in one checkout: <b>${eur(pass.price)}</b> instead of <b>${eur(oneByOne)}</b> item by item.</div>
      <button class="cta" data-act="buy" data-sku="pass" ${cat.stripe ? "" : "disabled"}>Buy the pass · ${eur(pass.price)}</button></div>
    </div>
    ${groups.map(g => `<div data-tab="${g.key}"><h2>${g.title}</h2><p class="muted small shopintro">${g.intro}</p>${g.items.map(itemHtml).join("")}</div>`).join("")}
    ${all ? "" : `<div data-tab="themes">
    <h2>Themes</h2>
    <p class="muted small shopintro">A theme dresses the app, posters and cards, and a collection its own house style. ${esc(cat.freeThemes.join(" and "))} are free; any other look is ${eur(cat.themePrice)}, less by the collection.</p>
    <div class="card shopitem" data-sku="themes">
      <button class="shopthumb swrow" data-act="peek" data-sku="themes" aria-label="See every theme">${DATA.themes.map(t => `<i ${swatch(t)}></i>`).join("")}</button>
      <div class="body row"><button class="plain" data-act="peek" data-sku="themes"><div class="name">${esc(bundle.name)}</div><div class="muted small">${esc(bundle.blurb)}</div><div class="peek">See all ${DATA.themes.length} ›</div></button>
        <button class="btn small primary" data-act="buy" data-sku="themes" ${cat.stripe ? "" : "disabled"}>${eur(bundle.price)}</button></div></div>
    ${colls.length ? `<div class="shopthemes colls">${colls.map(collHtml).join("")}</div>` : ""}
    </div>`}`, { back: "", tabs: "shop", sub: "Bought once, yours on every phone" });

  showTab();
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tab") { tab = b.dataset.tab; return showTab(); }
    if (b.dataset.act === "why") return whySheet();
    if (b.dataset.act === "buy") return checkout(b.dataset.sku, b);
    if (b.dataset.act !== "peek") return;
    const sku = b.dataset.sku;
    if (sku.startsWith("theme:")) return themeSheet(sku.slice(6), cat, D);
    if (sku.startsWith("collection:")) return collectionSheet(sku.slice(11), cat, D);
    if (sku === "themes") return bundleSheet(cat, D);
    return itemSheet(item(sku), cat, D);
  });
  fillList(D);
}

/**
 * Nothing left to sell. The shop is a tab in the bar, so it cannot simply disappear; instead it says what it
 * would otherwise have to say a dozen times over, and points at the two screens where the things it sold live.
 */
function everything(cat) {
  tab = "all";
  if (location.hash !== "#shop") history.replaceState(null, "", "#shop");
  return page("Shop", `
    <div class="now pass"><div class="k">The shop</div><div class="name">You have all of it.</div>
      <div class="live">Every theme, the full boards and cards, every way of ranking a season, and the mark gone. There is nothing here left to sell you.</div></div>
    <p class="muted small shopintro">The looks are in <a href="#me/look">Appearance</a>; the images screen of any round or society offers the full set.</p>
    ${cat.open ? "" : `<p class="muted small shopline">Nothing is gated on this backend yet in any case.</p>`}`,
    { back: "", tabs: "shop", sub: "Bought once, yours on every phone" });
}

/** Hides every block that is not on the chosen tab; the All tab shows the lot. The hash follows, so the tab survives a reload. */
function showTab() {
  app.querySelectorAll("[data-tab]").forEach(el => { if (el.dataset.act === "tab") el.classList.toggle("on", el.dataset.tab === tab); else el.hidden = tab !== "all" && el.dataset.tab !== tab; });
  const h = tab === "all" ? "#shop" : `#shop/${tab}`;
  if (location.hash !== h) history.replaceState(null, "", h);
}

/** The one thing worth saying about money, kept off the shop page and free of any price: prices date, the reason does not. */
function whySheet() {
  return sheet({
    title: "Why it costs what it costs",
    lead: "Nothing in the shop is needed. Buy none of it and the app is whole.",
    body: `<p class="muted small">Scoring a round, keeping a society, sharing cards and inviting people are free, and always will be. What is sold is how the output looks and how much it says. Nothing here plays golf better; nothing is taken away from you for not buying it.</p>
      <p class="muted small">A price is not what reaches us. The card company takes a fixed amount on every checkout, however small, and a share on top; the rest pays for running the app. That fixed amount is the whole reason a bundle costs less than its items one at a time: one checkout instead of several.</p>
      <p class="muted small">Bought once, never a subscription, on the web rather than inside an app store. What you buy follows your account to every phone you sign in on.</p>`,
  });
}

async function checkout(sku, btn = null) {
  if (btn) btn.disabled = true;
  try { const r = await A.api("/shop/checkout", { sku }); location.href = r.url; }
  catch (e) { toast(e.message, 5000); if (btn) btn.disabled = false; }
}

// ---------------------------------------------------------------- what the previews are drawn on
/** The showcase league and its last round, the Midsummer Cup: never a round of your own, so nothing here is private. */
function previewData() {
  const league = showcaseLeague();
  return { M: league.Ms[league.Ms.length - 1], league };
}

function onWhat(sku) {
  return ON_LEAGUE.includes(sku)
    ? { short: "the showcase society", line: "Drawn on the showcase society: the same four players over four Sundays at Heron's Reach, a course invented for the shop." }
    : { short: "the showcase round", line: "Drawn on the showcase round: four players over eighteen holes at Heron's Reach, a course invented for the shop." };
}

// The card and the player poster are the Stableford winner's: the fullest story on the day.
const cardPlayer = M => M.stbl_board[0];
const statsPlayer = (St, M) => St.players.find(p => p.id === cardPlayer(M).id) || St.players[0];

/** The images an item makes, as jobs the way the images screen builds them; the first is the list's thumbnail. */
function jobsFor(sku, T, D) {
  const M = D.M, tier = E.boardTier(), cardTier = E.cardTier();
  if (!M) return [];
  const who = cardPlayer(M);
  if (sku === "boards") return [
    { label: "Stableford leaderboard, with the handicap, the net and the points meter", make: () => stablefordLeaderboard(M, T, "full") },
    { label: "Both boards on one sheet", make: () => bothBoards(M, T) },
    { label: "How the holes played", make: () => holesPoster(M, T) }];
  if (sku === "card") return [{ label: `${who.name}'s card: against the field, where the strokes went, the story of the round`, make: () => renderCard(M, who, T, "full", { extras: true }).fig }];
  if (sku === "nomark") {
    const was = marked();
    return [
      { label: "The corner of every free poster and card", crop: true, make: () => { setMarked(true); try { return stablefordLeaderboard(M, T, tier); } finally { setMarked(was); } } },
      { label: "The same corner once the mark is gone", crop: true, make: () => { setMarked(false); try { return stablefordLeaderboard(M, T, tier); } finally { setMarked(was); } } }];
  }
  if (sku === "matchplay" || sku === "grandprix") {
    const kinds = sku === "matchplay" ? ["match", "soccer"] : ["gp"], L = D.league;
    return kinds.map(k => ({ label: STANDINGS_TITLES[k], make: () => standingsPoster(standingsFor(L.g, L.Ms, L.members, k), L.g, T, k) }));
  }
  if (sku === "season") {
    const L = D.league, St = leagueStats(L.Ms, L.members), p = statsPlayer(St, M);
    return [
      { label: "How this society scores", make: () => statsFieldPoster(St, L.g, T, { extras: true }) },
      ...(p ? [{ label: `One image a player: ${p.name}`, make: () => statsPlayerPoster(St, p, L.g, T, { extras: true }) }] : [])];
  }
  if (sku.startsWith("theme:")) return [
    { label: "Stableford leaderboard", make: () => stablefordLeaderboard(M, T, tier) },
    { label: `${who.name}'s card`, make: () => renderCard(M, who, T, cardTier, { extras: true }).fig }];
  return [];
}

// ---------------------------------------------------------------- drawing, once per item and look
const cache = new Map();   // key -> { url, blob }: a poster drawn once stays drawn for the session
const keyFor = (sku, T, i) => `${sku}|${T.name}|${E.boardTier()}|${E.cardTier()}|${marked()}|${i}`;

const blobOf = (cv, type, quality) => cv.convertToBlob ? cv.convertToBlob({ type, quality }) : new Promise(res => cv.toBlob(res, type, quality));
function shrink(src, w) {
  const h = Math.round(src.height * w / src.width);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(src, 0, 0, w, h);
  return cv;
}
/** The bottom right of a poster, where the mark sits. */
function corner(src) {
  const x = Math.round(src.width * 0.45), y = Math.round(src.height * 0.84), w = src.width - x, h = src.height - y;
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h);
  return cv;
}

async function rendered(key, job) {
  if (cache.has(key)) return cache.get(key);
  await loadFonts(DATA.fonts);
  await new Promise(res => setTimeout(res, 0));   // let the screen paint before a poster is drawn
  try {
    const fig = job.make();
    const src = job.crop ? corner(fig.canvas) : fig.canvas;
    const out = { blob: await blobOf(src, "image/png"), url: URL.createObjectURL(await blobOf(shrink(src, Math.min(720, src.width)), "image/jpeg", 0.85)) };
    cache.set(key, out);
    return out;
  } catch (e) { console.error(e); return null; }
}

/** The thumbnails on the shop page, filled in one by one, stopping the moment the screen is left. */
async function fillList(D) {
  const T = makeTheme(appTheme());
  for (const el of [...app.querySelectorAll(".shopthumb[data-sku]")]) {
    const sku = el.dataset.sku;
    if (sku === "themes" || sku.startsWith("collection:")) continue;   // those thumbnails are swatch strips, drawn already
    const job = jobsFor(sku, T, D)[0];
    if (!job) { el.innerHTML = ""; continue; }
    // the list shows the whole poster even where the sheet shows a corner of it: a corner blown up to a tile is just text
    const t = await rendered(keyFor(sku, T, job.crop ? "list" : 0), job.crop ? { ...job, crop: false } : job);
    if (!el.isConnected) return;
    el.innerHTML = t ? `<img src="${t.url}" alt="">` : "";
  }
}

const prevHtml = (j, i) => `<figure class="prev" data-i="${i}"><span class="ph skeleton"></span><figcaption>${esc(j.label)}</figcaption></figure>`;
async function fillPrevs(el, jobs, keyOf) {
  el.addEventListener("click", ev => {
    const img = ev.target.closest("img[data-key]");
    if (!img) return;
    const drawn = jobs.map((j, i) => ({ key: keyOf(i), label: j.label })).filter(x => cache.has(x.key));
    viewer(drawn.map(x => ({ ...cache.get(x.key), label: x.label })), drawn.findIndex(x => x.key === img.dataset.key));
  });
  for (let i = 0; i < jobs.length; i++) {
    if (!el.isConnected) return;
    const key = keyOf(i), t = await rendered(key, jobs[i]);
    const fig = el.querySelector(`.prev[data-i="${i}"]`);
    if (!fig) continue;
    if (t) fig.querySelector(".ph").outerHTML = `<img src="${t.url}" alt="${esc(jobs[i].label)}" data-key="${esc(key)}">`;
    else { fig.classList.add("err"); fig.querySelector(".ph").remove(); fig.querySelector("figcaption").textContent += " · could not be drawn"; }
  }
}
const buyActions = (label, value, cat) => cat.stripe ? [{ label, value, kind: "primary" }] : [];

// ---------------------------------------------------------------- the sheets
async function itemSheet(c, cat, D) {
  if (!c) return;
  const T = makeTheme(appTheme());
  const jobs = jobsFor(c.sku, T, D);
  const body = `<p class="muted small">${onWhat(c.sku).line}</p><div class="prevs">${jobs.map(prevHtml).join("")}</div>`;
  const actions = c.owned ? [] : buyActions(`Buy · ${eur(c.price)}`, "buy", cat);
  const v = await sheet({ title: c.name, lead: c.blurb, body, actions, onOpen: el => fillPrevs(el, jobs, i => keyFor(c.sku, T, i)) });
  if (v === "buy") await checkout(c.sku);
}

/** The app itself, dressed in a look: the real screen pieces painted from that theme's own palette. */
export function mockHtml(t, M, tiny = false) {
  const vars = Object.entries(t.ui).filter(([k]) => k !== "scheme").map(([k, v]) => `--${k}:${v}`).join(";");
  const top = M ? M.stbl_board.slice(0, 3) : [];
  return `<div class="thememock${tiny ? " tiny" : ""}" style="${vars}" aria-hidden="true">
    <div class="mtop"><span class="brand">Hagolf</span><span class="mbell">${ICONS.bell}${ICONS.settings}</span></div>
    <div class="now"><div class="k">Last round</div><div class="name">${esc(M ? M.name : "Sunday fourball")}</div>${top.length ? `<div class="live">${esc(firstName(top[0].name))} won with ${top[0].pts} points</div>` : ""}</div>
    <h2>Stableford</h2>
    <div class="card">${top.map((p, i) => `<div class="pl row"><span class="who"><span class="pos ${i === 0 ? "p1" : ""}">${i + 1}</span>${esc(p.name)}</span><span class="nums"><span class="acc"><b>${p.pts}</b><small>pts</small></span><span><b>${p.gross === null ? "NR" : p.gross}</b><small>gross</small></span></span></div>`).join("")}</div>
    <div class="mtabs">${TABS.map(([, , l, ic], i) => `<span class="${i === 0 ? "on" : ""}">${ICONS[ic]}${l}</span>`).join("")}</div></div>`;
}

/** Held outright, through its collection, through every theme, or through the pass; the free two always. */
const ownsAll = cat => cat.skus.some(c => (c.sku === "pass" || c.sku === "themes") && c.owned);
const collectionOf = (cat, key) => (cat.collections || []).find(c => c.key === key) || null;
function ownsTheme(cat, name) {
  const t = themeNamed(name), c = t && collectionOf(cat, t.family || "other");
  return cat.freeThemes.includes(name) || ownsAll(cat) || cat.themes.includes(name) || !!(c && c.owned);
}

async function themeSheet(name, cat, D) {
  const t = themeNamed(name);
  if (!t) return;
  const T = makeTheme(t);
  const owned = ownsTheme(cat, name);
  const bundle = cat.skus.find(c => c.sku === "themes"), coll = collectionOf(cat, t.family || "other"), fam = FAMILIES.find(f => f.key === (t.family || "other"));
  const jobs = jobsFor(`theme:${name}`, T, D);
  const body = `<p class="muted small">The app itself, as it opens every time:</p>${mockHtml(t, D.M)}
    <p class="muted small">${onWhat("theme").line}</p><div class="prevs">${jobs.map(prevHtml).join("")}</div>`;
  const wearing = appTheme().name === name;
  const actions = owned
    ? [{ label: wearing ? "The app wears this now" : "Wear it", value: "wear", kind: "primary" }]
    : [...buyActions(`Buy this theme · ${eur(cat.themePrice)}`, "buy", cat),
      ...(coll && !coll.owned && fam ? buyActions(`${fam.name}, all ${coll.themes.length} · ${eur(coll.price)}`, "coll", cat) : []),
      ...(bundle && !bundle.owned ? buyActions(`Every theme · ${eur(bundle.price)}`, "bundle", cat) : [])];
  const v = await sheet({ title: `The ${name} theme`, lead: t.blurb || "", body, actions, onOpen: el => fillPrevs(el, jobs, i => keyFor(`theme:${name}`, T, i)) });
  if (v === "buy") return checkout(`theme:${name}`);
  if (v === "coll") return checkout(coll.sku);
  if (v === "bundle") return checkout("themes");
  if (v === "wear" && !wearing) {
    S.setSetting("theme", name); S.setSetting("themeChosen", true);
    paint(themeHere());
    toast(`The app now wears ${name}`);
    shop();
  }
}

/** The Stableford leaderboard under every look in a grid, each drawn in its own theme, one after the other. */
async function fillGrid(el, ts, D) {
  for (const t of ts) {
    if (!el.isConnected) return;
    const T = makeTheme(t), job = jobsFor(`theme:${t.name}`, T, D)[0];
    const r = job && await rendered(keyFor(`theme:${t.name}`, T, 0), job);   // the key the theme's own sheet uses, so it is drawn once
    const slot = el.querySelector(`.board[data-look="${CSS.escape(t.name)}"]`);
    if (slot) slot.innerHTML = r ? `<img src="${r.url}" alt="The Stableford leaderboard in ${esc(t.name)}">` : "";
  }
}

/** One family: every look in it drawn small, the app and the board in each, and the set bought in one go. */
async function collectionSheet(key, cat, D) {
  const fam = FAMILIES.find(f => f.key === key), ts = themesIn(key);
  if (!fam || !ts.length) return;
  const c = collectionOf(cat, key), owned = ownsAll(cat) || !!(c && c.owned), bundle = cat.skus.find(x => x.sku === "themes");
  const tag = t => cat.freeThemes.includes(t.name) ? "free" : ownsTheme(cat, t.name) ? "yours" : "";
  const body = `<p class="muted small">${ts.length} looks, each on the app itself and on the showcase round's Stableford leaderboard, all in this collection's house style. Tap one to see it up close.</p>
    <div class="themegrid">${ts.map(t => `<button data-act="theme:${t.name}" data-sheet-act>${mockHtml(t, D.M, true)}<span class="board" data-look="${esc(t.name)}"><span class="skeleton"></span></span><span>${esc(t.name)}${tag(t) ? ` <small class="muted">· ${tag(t)}</small>` : ""}</span></button>`).join("")}</div>`;
  const actions = [...(owned || !c ? [] : buyActions(`Buy all ${ts.length} · ${eur(c.price)}`, "buy", cat)),
    ...(bundle && !bundle.owned && !ownsAll(cat) ? buyActions(`Every theme · ${eur(bundle.price)}`, "bundle", cat) : [])];
  const v = await sheet({ title: fam.name, lead: fam.blurb, body, actions, onOpen: el => fillGrid(el, ts, D) });
  if (v === "buy") return checkout(c.sku);
  if (v === "bundle") return checkout("themes");
  if (v && v.startsWith("theme:")) return themeSheet(v.slice(6), cat, D);
}

/** Every theme: the collections as strips, each opening on its looks. */
async function bundleSheet(cat, D) {
  const bundle = cat.skus.find(c => c.sku === "themes");
  const rows = FAMILIES.filter(f => themesIn(f.key).length).map(f => `<button class="collrow" data-act="coll:${f.key}" data-sheet-act>${familyStrip(themesIn(f.key))}<span><b>${esc(f.name)}</b><small class="muted">${themesIn(f.key).length} looks</small></span><i>›</i></button>`).join("");
  const body = `<p class="muted small">All ${DATA.themes.length} looks in ${FAMILIES.filter(f => themesIn(f.key).length).length} collections, on the posters, the cards and the app itself. Tap a collection to see its looks.</p>
    <div class="collrows">${rows}</div>`;
  const actions = bundle.owned ? [] : buyActions(`Buy every theme · ${eur(bundle.price)}`, "buy", cat);
  const v = await sheet({ title: bundle.name, lead: bundle.blurb, body, actions });
  if (v === "buy") return checkout("themes");
  if (v && v.startsWith("coll:")) return collectionSheet(v.slice(5), cat, D);
}
