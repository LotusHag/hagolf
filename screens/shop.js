// The shop: the catalogue in one place, out of the scoring flow, and every item shown working on your own last
// round before it is bought. A locked item is a preview drawn on your data, never a padlock. Buying happens on
// Stripe's page.
import { DATA } from "../data.js";
import * as S from "../store.js";
import * as A from "../auth.js";
import * as E from "../entitlements.js";
import { page, bind, esc, go, toast, sheet, app, ICONS, TABS, subtabs, firstName, appTheme, themeNamed, themeHere, paint, makeTheme, loadFonts, safeCompute, FAMILIES, themesIn, familyStrip } from "../ui.js";
import { setMarked, marked } from "../draw.js";
import { compute, leagueStats } from "../model.js";
import { stablefordLeaderboard, bothBoards, holesPoster, standingsPoster, STANDINGS_TITLES } from "../posters.js";
import { statsFieldPoster, statsNinesPoster, statsPlayerPoster } from "../statsposters.js";
import { renderCard } from "../cards.js";
import { leagueResults, standingsFor } from "./formats.js";
import { ninesForPoster, leagueRounds } from "./stats.js";
import { sampleRound, sampleLeague, sampleCourse } from "../sample.js";

const eur = c => `€${(c / 100).toFixed(2).replace(".", ",")}`;
const words = n => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] || String(n);
const ON_LEAGUE = ["matchplay", "grandprix", "season"];
const GROUPS = [
  { key: "mark", title: "The mark", intro: "Every free poster and card carries a small hagolf.app mark in the corner.", skus: ["nomark"] },
  { key: "images", title: "What the images say", intro: "The free boards and cards say who won. These say how.", skus: ["boards", "card", "season"] },
  { key: "ranking", title: "Ways of ranking a season", intro: "Stableford and stroke play are free. These are the other ways a league can be scored.", skus: ["matchplay", "grandprix"] },
];

const TABS_ = [["all", "All"], ["mark", "The mark"], ["images", "Images"], ["ranking", "Ranking"], ["skins", "Skins"]];
let tab = "all";   // the tab last looked at stays chosen for the session

export async function shop(state) {
  if (TABS_.some(([k]) => k === state)) tab = state;
  if (state === "thanks") {
    try { await A.whoami(); } catch (e) { /* offline: the next refresh brings it */ }
    toast("Thank you. It is yours, on every phone you sign in on.", 5000);
    return go("#shop");
  }
  if (!A.account()) return page("Shop", `<div class="banner"><a href="#welcome">Sign in</a> first: what you buy follows your account to every phone.</div>`, { back: "", tabs: "shop" });
  page("Shop", `<p class="muted center" style="margin-top:30px">Loading…</p>`, { back: "", tabs: "shop" });
  let cat;
  try { cat = await A.api("/shop/catalogue"); } catch (e) { return page("Shop", `<div class="banner warn">${esc(e.message)}</div>`, { back: "", tabs: "shop" }); }
  const D = previewData();
  const all = cat.skus.some(c => (c.sku === "pass" || c.sku === "skins") && c.owned);
  const item = sku => cat.skus.find(c => c.sku === sku);
  const pass = item("pass"), bundle = item("skins");
  const fee = cat.fee || 0, plus = c => fee ? `<div class="muted small fees-line">${eur(c.value ?? c.price - fee)} + ${eur(fee)} checkout</div>` : "";
  const rest = cat.skus.filter(c => c.sku !== "pass"), oneByOne = rest.reduce((a, c) => a + c.price, 0);
  // the skin count is whatever the app ships; the "one checkout instead of N" line is only said when it is exactly true
  const paidSkins = DATA.themes.filter(t => !cat.freeThemes.includes(t.name)).length, skinsAlone = paidSkins * cat.skinPrice;
  const skinsLine = !fee || !paidSkins ? "" : `<div class="muted small fees-line">One at a time the ${words(paidSkins)} paid skins come to ${eur(skinsAlone)}${skinsAlone - bundle.price === (paidSkins - 1) * fee ? `; together, one checkout instead of ${words(paidSkins)}.` : `. Together they are ${eur(bundle.price)}.`}</div>`;
  const swatch = t => `style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT};--tink:${t.INK}"`;
  // one card a family: its looks as a strip, what it costs as a set, and the sheet with every look in it
  const collHtml = f => {
    const ts = themesIn(f.key), c = collectionOf(cat, f.key), free = ts.filter(t => cat.freeThemes.includes(t.name)).length;
    if (!ts.length) return "";
    const owned = all || (c && c.owned);
    return `<div class="card shopitem" data-sku="collection:${f.key}">
      <button class="shopthumb swrow" data-act="peek" data-sku="collection:${f.key}" aria-label="See the ${esc(f.name)} looks">${ts.map(t => `<i ${swatch(t)}></i>`).join("")}</button>
      <div class="body row"><button class="plain" data-act="peek" data-sku="collection:${f.key}"><div class="name">${esc(f.name)}</div><div class="muted small">${esc(f.blurb)}</div>
        <div class="muted small fees-line">${ts.length} looks${free ? `, ${free} of them free` : ""}${c && fee && !owned ? ` · ${eur(c.value)} + ${eur(fee)} checkout` : ""}</div><div class="peek">See all ${ts.length} ›</div></button>
        ${owned ? `<span class="pill done">Yours</span>` : c ? `<button class="btn small primary" data-act="buy" data-sku="${c.sku}" ${cat.stripe ? "" : "disabled"}>${eur(c.price)}</button>` : ""}</div></div>`;
  };

  const itemHtml = c => `<div class="card shopitem" data-sku="${esc(c.sku)}">
    <button class="shopthumb" data-act="peek" data-sku="${esc(c.sku)}" aria-label="See ${esc(c.name)} on ${onWhat(c.sku, D).short}"><span class="skeleton"></span></button>
    <div class="body row"><button class="plain" data-act="peek" data-sku="${esc(c.sku)}"><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.blurb)}</div>${plus(c)}<div class="peek">See it on ${onWhat(c.sku, D).short} ›</div></button>
      ${c.owned ? `<span class="pill done">Yours</span>` : `<button class="btn small primary" data-act="buy" data-sku="${esc(c.sku)}" ${cat.stripe ? "" : "disabled"}>${eur(c.price)}</button>`}</div></div>`;

  page("Shop", `
    ${subtabs(TABS_.map(([k, l]) => `<button data-act="tab" data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join(""))}
    <div data-tab="all">
    ${fee ? `<div class="banner fees"><b>Why the prices are what they are.</b> Everything here is bought once, never a subscription. The card company takes a fixed fee and a share of every payment, however small, so every price is the item plus ${eur(fee)} for the checkout. Buy several things in one go and that ${eur(fee)} is paid once: a bundle costs exactly its items added up plus one checkout, and what it saves is the checkouts it skips, nothing more.</div>` : ""}
    <p class="muted small shopintro">Scoring a round, keeping a league and inviting people are free, and always will be. What is sold is how the output looks and how much it says. Tap anything to see it on ${D.own ? "your own round" : "a round"} before you buy.${cat.open ? "" : " <b>Nothing is gated yet.</b>"}${cat.stripe ? "" : " Buying is not open yet."}</p>
    <div class="now pass"><div class="k">Everything</div><div class="name">${esc(pass.blurb)}</div>
      <div class="live">Bought one at a time the ${words(rest.length)} things below come to <b>${eur(oneByOne)}</b>. Together they are <b>${eur(pass.price)}</b>: the same ${words(rest.length)}, one checkout instead of ${words(rest.length)}.${fee ? ` The ${eur(oneByOne - pass.price)} difference is ${words(rest.length - 1)} checkout fees, nothing else.` : ""}</div>
      ${pass.owned ? `<span class="cta">Yours</span>` : `<button class="cta" data-act="buy" data-sku="pass" ${cat.stripe ? "" : "disabled"}>Buy the pass · ${eur(pass.price)}</button>`}</div>
    </div>
    ${GROUPS.map(g => `<div data-tab="${g.key}"><h2>${g.title}</h2><p class="muted small shopintro">${g.intro}</p>${g.skus.map(item).filter(Boolean).map(itemHtml).join("")}</div>`).join("")}
    <div data-tab="skins">
    <h2>Skins</h2>
    <p class="muted small shopintro">A skin dresses the app itself as well as every poster and card. ${esc(cat.freeThemes.join(" and "))} are free. ${DATA.themes.length} looks in ${FAMILIES.filter(f => themesIn(f.key).length).length} collections: a look on its own is ${eur(cat.skinPrice)}, a whole collection is its paid looks added up, or take every skin there is. Tap a collection to see its looks.</p>
    <div class="card shopitem" data-sku="skins">
      <button class="shopthumb swrow" data-act="peek" data-sku="skins" aria-label="See every skin">${DATA.themes.map(t => `<i ${swatch(t)}></i>`).join("")}</button>
      <div class="body row"><button class="plain" data-act="peek" data-sku="skins"><div class="name">${esc(bundle.name)}</div><div class="muted small">${esc(bundle.blurb)}</div>${plus(bundle)}${skinsLine}<div class="peek">See all ${DATA.themes.length} ›</div></button>
        ${bundle.owned ? `<span class="pill done">Yours</span>` : `<button class="btn small primary" data-act="buy" data-sku="skins" ${cat.stripe ? "" : "disabled"}>${eur(bundle.price)}</button>`}</div></div>
    <div class="skins colls">${FAMILIES.map(collHtml).join("")}</div>
    </div>
    <p class="foot">Bought once, on the web, never inside an app store. Yours on every phone you sign in on.</p>`, { back: "", tabs: "shop", sub: "Bought once, yours on every phone" });

  showTab();
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tab") { tab = b.dataset.tab; return showTab(); }
    if (b.dataset.act === "buy") return checkout(b.dataset.sku, b);
    if (b.dataset.act !== "peek") return;
    const sku = b.dataset.sku;
    if (sku.startsWith("skin:")) return skinSheet(sku.slice(5), cat, D);
    if (sku.startsWith("collection:")) return collectionSheet(sku.slice(11), cat, D);
    if (sku === "skins") return bundleSheet(cat, D);
    return itemSheet(item(sku), cat, D);
  });
  fillList(D);
}

/** Hides every block that is not on the chosen tab; the All tab shows the lot. The hash follows, so the tab survives a reload. */
function showTab() {
  app.querySelectorAll("[data-tab]").forEach(el => { if (el.dataset.act === "tab") el.classList.toggle("on", el.dataset.tab === tab); else el.hidden = tab !== "all" && el.dataset.tab !== tab; });
  const h = tab === "all" ? "#shop" : `#shop/${tab}`;
  if (location.hash !== h) history.replaceState(null, "", h);
}

async function checkout(sku, btn = null) {
  if (btn) btn.disabled = true;
  try { const r = await A.api("/shop/checkout", { sku }); location.href = r.url; }
  catch (e) { toast(e.message, 5000); if (btn) btn.disabled = false; }
}

// ---------------------------------------------------------------- what the previews are drawn on
/** The last finished round on this phone, the fullest league, or the sample where there is neither. */
function previewData() {
  const courses = S.courses();
  const done = S.rounds().filter(r => r.status === "done").sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const Ms = done.map(r => safeCompute(compute, r)).filter(M => M && M.players.length);
  const M = Ms.find(M => M.players.length >= 2) || Ms[0] || null;
  let league = null;
  for (const g of S.leagues()) {
    const R = leagueResults(g);
    if (R.Ms.length >= 2 && (!league || R.Ms.length > league.Ms.length)) league = { g, Ms: R.Ms, members: R.members, rounds: leagueRounds(g.id), own: true };
  }
  const c = sampleCourse(courses);
  return { M: M || (c && sampleRound(c)), own: !!M, league: league || (c && sampleLeague(c)), sample: c && sampleLeague(c) };
}

function onWhat(sku, D) {
  if (ON_LEAGUE.includes(sku)) {
    return D.league && D.league.own
      ? { short: "your league", line: `Drawn on ${esc(D.league.g.name)}, your league with the most rounds.` }
      : { short: "a sample league", line: "Drawn on a sample league of six players and four Sundays. Once a league of yours has two finished rounds, it is drawn on that." };
  }
  return D.own
    ? { short: "your round", line: `Drawn on ${esc(D.M.name)}, your last round.` }
    : { short: "a sample round", line: "Drawn on a sample round. Once you have finished a round of your own, it is drawn on that." };
}

const cardPlayer = M => { const me = S.me(); return (me && M.players.find(p => p.id === me.id)) || M.gross_board[0]; };
const statsPlayer = St => { const me = S.me(); return (me && St.players.find(p => p.id === me.id)) || St.players[0]; };

/** A league that actually has something to rank the given way; the sample stands in when yours has not met yet. */
function leagueFor(D, kinds) {
  const L = D.league;
  if (L && L.own && kinds.every(k => standingsFor(L.g, L.Ms, L.members, k).rows.length >= 2)) return L;
  return D.sample;
}

/** The images an item makes, as jobs the way the images screen builds them; the first is the list's thumbnail. */
function jobsFor(sku, T, D) {
  const M = D.M, tier = E.boardTier(), cardTier = E.cardTier();
  if (!M) return [];
  const who = cardPlayer(M);
  if (sku === "boards") return [
    { label: "Stableford leaderboard, with the handicap, the net and the points meter", make: () => stablefordLeaderboard(M, T, "full") },
    { label: "Both boards on one sheet", make: () => bothBoards(M, T) },
    { label: "How the holes played", make: () => holesPoster(M, T) }];
  if (sku === "card") return [{ label: `${who.name}'s card: against the field, where the strokes went, the story of the round`, make: () => renderCard(M, who, T, "full").fig }];
  if (sku === "nomark") {
    const was = marked();
    return [
      { label: "The corner of every free poster and card", crop: true, make: () => { setMarked(true); try { return stablefordLeaderboard(M, T, tier); } finally { setMarked(was); } } },
      { label: "The same corner once the mark is gone", crop: true, make: () => { setMarked(false); try { return stablefordLeaderboard(M, T, tier); } finally { setMarked(was); } } }];
  }
  if (sku === "matchplay" || sku === "grandprix") {
    const kinds = sku === "matchplay" ? ["match", "soccer"] : ["gp"];
    const L = leagueFor(D, kinds);
    return L ? kinds.map(k => ({ label: STANDINGS_TITLES[k], make: () => standingsPoster(standingsFor(L.g, L.Ms, L.members, k), L.g, T, k) })) : [];
  }
  if (sku === "season") {
    const L = D.league;
    if (!L) return [];
    const St = leagueStats(L.Ms, L.members), p = statsPlayer(St);
    const N = L.own ? ninesForPoster(L.rounds, L.members) : [];
    return [
      { label: "How this league scores", make: () => statsFieldPoster(St, L.g, T) },
      ...(N.length ? [{ label: "The nines walked", make: () => statsNinesPoster(N, L.g, T) }] : []),
      ...(p ? [{ label: `One image a player: ${p.name}`, make: () => statsPlayerPoster(St, p, L.g, T) }] : [])];
  }
  if (sku.startsWith("skin:")) return [
    { label: "Stableford leaderboard", make: () => stablefordLeaderboard(M, T, tier) },
    { label: `${who.name}'s card`, make: () => renderCard(M, who, T, cardTier).fig }];
  return [];
}

// ---------------------------------------------------------------- drawing, once per item and look
const cache = new Map();   // key -> { url, blob }: a poster drawn once stays drawn for the session
const keyFor = (sku, T, D, i) => `${sku}|${T.name}|${E.boardTier()}|${E.cardTier()}|${marked()}|${D.M && D.M.id}|${D.league && D.league.g.id}|${D.league && D.league.Ms.length}|${i}`;

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
    if (sku === "skins" || sku.startsWith("collection:")) continue;   // those thumbnails are swatch strips, drawn already
    const job = jobsFor(sku, T, D)[0];
    if (!job) { el.innerHTML = ""; continue; }
    // the list shows the whole poster even where the sheet shows a corner of it: a corner blown up to a tile is just text
    const t = await rendered(keyFor(sku, T, D, job.crop ? "list" : 0), job.crop ? { ...job, crop: false } : job);
    if (!el.isConnected) return;
    el.innerHTML = t ? `<img src="${t.url}" alt="">` : "";
  }
}

const prevHtml = (j, i) => `<figure class="prev" data-i="${i}"><span class="ph skeleton"></span><figcaption>${esc(j.label)}</figcaption></figure>`;
async function fillPrevs(el, jobs, keyOf) {
  el.addEventListener("click", ev => {
    const img = ev.target.closest("img[data-key]");
    if (img && cache.has(img.dataset.key)) window.open(URL.createObjectURL(cache.get(img.dataset.key).blob), "_blank");
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
const feeNote = (price, cat) => cat.fee ? `<p class="muted small">${eur(price - cat.fee)} for the item, ${eur(cat.fee)} for the checkout. Bought once, yours for ever.</p>` : "";

// ---------------------------------------------------------------- the sheets
async function itemSheet(c, cat, D) {
  if (!c) return;
  const T = makeTheme(appTheme());
  const jobs = jobsFor(c.sku, T, D);
  const body = `<p class="muted small">${onWhat(c.sku, D).line}${jobs.length ? "" : " Nothing to draw yet."}</p><div class="prevs">${jobs.map(prevHtml).join("")}</div>${c.owned ? "" : feeNote(c.price, cat)}`;
  const actions = [...(c.owned ? [] : buyActions(`Buy · ${eur(c.price)}`, "buy", cat)), { label: "Close", value: "no" }];
  const v = await sheet({ title: c.name, lead: c.blurb, body, actions, onOpen: el => fillPrevs(el, jobs, i => keyFor(c.sku, T, D, i)) });
  if (v === "buy") await checkout(c.sku);
}

/** The app itself, dressed in a look: the real screen pieces painted from that theme's own palette. */
export function mockHtml(t, M, tiny = false) {
  const vars = Object.entries(t.ui).filter(([k]) => k !== "scheme").map(([k, v]) => `--${k}:${v}`).join(";");
  const top = M ? M.stbl_board.slice(0, 3) : [];
  return `<div class="skinmock${tiny ? " tiny" : ""}" style="${vars}" aria-hidden="true">
    <div class="mtop"><span class="brand">Hagolf</span><span class="mbell">${ICONS.bell}${ICONS.settings}</span></div>
    <div class="now"><div class="k">Last round</div><div class="name">${esc(M ? M.name : "Sunday fourball")}</div>${top.length ? `<div class="live">${esc(firstName(top[0].name))} won with ${top[0].pts} points</div>` : ""}</div>
    <h2>Stableford</h2>
    <div class="card">${top.map((p, i) => `<div class="pl row"><span class="who"><span class="pos ${i === 0 ? "p1" : ""}">${i + 1}</span>${esc(p.name)}</span><span class="nums"><span class="acc"><b>${p.pts}</b><small>pts</small></span><span><b>${p.gross === null ? "NR" : p.gross}</b><small>gross</small></span></span></div>`).join("")}</div>
    <div class="mtabs">${TABS.map(([, , l, ic], i) => `<span class="${i === 0 ? "on" : ""}">${ICONS[ic]}${l}</span>`).join("")}</div></div>`;
}

/** Held outright, through its collection, through every skin, or through the pass; the free two always. */
const ownsAll = cat => cat.skus.some(c => (c.sku === "pass" || c.sku === "skins") && c.owned);
const collectionOf = (cat, key) => (cat.collections || []).find(c => c.key === key) || null;
function ownsSkin(cat, name) {
  const t = themeNamed(name), c = t && collectionOf(cat, t.family || "other");
  return cat.freeThemes.includes(name) || ownsAll(cat) || cat.skins.includes(name) || !!(c && c.owned);
}

async function skinSheet(name, cat, D) {
  const t = themeNamed(name);
  if (!t) return;
  const T = makeTheme(t);
  const owned = ownsSkin(cat, name);
  const bundle = cat.skus.find(c => c.sku === "skins"), coll = collectionOf(cat, t.family || "other"), fam = FAMILIES.find(f => f.key === (t.family || "other"));
  const jobs = jobsFor(`skin:${name}`, T, D);
  const body = `<p class="muted small">The app itself, as it opens every time:</p>${mockHtml(t, D.M)}
    <p class="muted small">${onWhat("skin", D).line}</p><div class="prevs">${jobs.map(prevHtml).join("")}</div>${owned ? "" : feeNote(cat.skinPrice, cat)}`;
  const wearing = appTheme().name === name;
  const actions = owned
    ? [{ label: wearing ? "The app wears this now" : "Wear it", value: "wear", kind: "primary" }, { label: "Close", value: "no" }]
    : [...buyActions(`Buy this skin · ${eur(cat.skinPrice)}`, "buy", cat),
      ...(coll && !coll.owned && fam ? buyActions(`${fam.name}, all ${coll.themes.length} · ${eur(coll.price)}`, "coll", cat) : []),
      ...(bundle && !bundle.owned ? buyActions(`Every skin · ${eur(bundle.price)}`, "bundle", cat) : []), { label: "Close", value: "no" }];
  const v = await sheet({ title: `The ${name} skin`, lead: t.blurb || "", body, actions, onOpen: el => fillPrevs(el, jobs, i => keyFor(`skin:${name}`, T, D, i)) });
  if (v === "buy") return checkout(`skin:${name}`);
  if (v === "coll") return checkout(coll.sku);
  if (v === "bundle") return checkout("skins");
  if (v === "wear" && !wearing) {
    S.setSetting("theme", name); S.setSetting("themeChosen", true);
    paint(themeHere());
    toast(`The app now wears ${name}`);
    shop();
  }
}

/** One family: every look in it drawn small, and the set bought in one go. */
async function collectionSheet(key, cat, D) {
  const fam = FAMILIES.find(f => f.key === key), ts = themesIn(key);
  if (!fam || !ts.length) return;
  const c = collectionOf(cat, key), owned = ownsAll(cat) || !!(c && c.owned), bundle = cat.skus.find(x => x.sku === "skins");
  const tag = t => cat.freeThemes.includes(t.name) ? "free" : ownsSkin(cat, t.name) ? "yours" : "";
  const body = `<p class="muted small">${ts.length} looks, on the posters, the cards and the app itself. Tap one to see it up close.</p>
    <div class="skingrid">${ts.map(t => `<button data-act="skin:${t.name}" data-sheet-act>${mockHtml(t, D.M, true)}<span>${esc(t.name)}${tag(t) ? ` <small class="muted">· ${tag(t)}</small>` : ""}</span></button>`).join("")}</div>
    ${owned || !c ? "" : feeNote(c.price, cat)}`;
  const actions = [...(owned || !c ? [] : buyActions(`Buy all ${ts.length} · ${eur(c.price)}`, "buy", cat)),
    ...(bundle && !bundle.owned && !ownsAll(cat) ? buyActions(`Every skin · ${eur(bundle.price)}`, "bundle", cat) : []), { label: "Close", value: "no" }];
  const v = await sheet({ title: fam.name, lead: fam.blurb, body, actions });
  if (v === "buy") return checkout(c.sku);
  if (v === "bundle") return checkout("skins");
  if (v && v.startsWith("skin:")) return skinSheet(v.slice(5), cat, D);
}

/** Every skin: the collections as strips, each opening on its looks. */
async function bundleSheet(cat, D) {
  const bundle = cat.skus.find(c => c.sku === "skins");
  const rows = FAMILIES.filter(f => themesIn(f.key).length).map(f => `<button class="collrow" data-act="coll:${f.key}" data-sheet-act>${familyStrip(themesIn(f.key))}<span><b>${esc(f.name)}</b><small class="muted">${themesIn(f.key).length} looks</small></span><i>›</i></button>`).join("");
  const body = `<p class="muted small">All ${DATA.themes.length} looks in ${FAMILIES.filter(f => themesIn(f.key).length).length} collections, on the posters, the cards and the app itself. Tap a collection to see its looks.</p>
    <div class="collrows">${rows}</div>${bundle.owned ? "" : feeNote(bundle.price, cat)}`;
  const actions = [...(bundle.owned ? [] : buyActions(`Buy every skin · ${eur(bundle.price)}`, "buy", cat)), { label: "Close", value: "no" }];
  const v = await sheet({ title: bundle.name, lead: bundle.blurb, body, actions });
  if (v === "buy") return checkout("skins");
  if (v && v.startsWith("coll:")) return collectionSheet(v.slice(5), cat, D);
}
