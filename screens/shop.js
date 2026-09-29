// The shop: the catalogue in one place, out of the scoring flow, and every item shown working on your own last
// round before it is bought. A locked item is a preview drawn on your data, never a padlock. Buying happens on
// Stripe's page.
import { DATA } from "../data.js";
import * as S from "../store.js";
import * as A from "../auth.js";
import * as E from "../entitlements.js";
import { page, bind, esc, go, toast, sheet, app, ICONS, TABS, firstName, appTheme, themeNamed, themeHere, paint, makeTheme, loadFonts, safeCompute } from "../ui.js";
import { setMarked, marked } from "../draw.js";
import { compute, leagueStats } from "../model.js";
import { stablefordLeaderboard, bothBoards, holesPoster, standingsPoster, STANDINGS_TITLES } from "../posters.js";
import { statsFieldPoster, statsNinesPoster, statsPlayerPoster } from "../statsposters.js";
import { renderCard } from "../cards.js";
import { leagueResults, standingsFor } from "./formats.js";
import { ninesForPoster, leagueRounds } from "./stats.js";
import { sampleRound, sampleLeague, sampleCourse } from "../sample.js";

const eur = c => `€${(c / 100).toFixed(2).replace(".", ",")}`;
const ON_LEAGUE = ["matchplay", "grandprix", "season"];
const GROUPS = [
  { title: "The mark", intro: "Every free poster and card carries a small hagolf.app mark in the corner.", skus: ["nomark"] },
  { title: "What the images say", intro: "The free boards and cards say who won. These say how.", skus: ["boards", "card", "season"] },
  { title: "Ways of ranking a season", intro: "Stableford and stroke play are free. These are the other ways a league can be scored.", skus: ["matchplay", "grandprix"] },
];

export async function shop(state) {
  if (state === "thanks") {
    try { await A.whoami(); } catch (e) { /* offline: the next refresh brings it */ }
    toast("Thank you. It is yours, on every phone you sign in on.", 5000);
    return go("#shop");
  }
  if (!A.account()) return page("Shop", `<div class="banner"><a href="#welcome">Sign in</a> first: what you buy follows your account to every phone.</div>`, { back: "#me" });
  page("Shop", `<p class="muted center" style="margin-top:30px">Loading…</p>`, { back: "#me" });
  let cat;
  try { cat = await A.api("/shop/catalogue"); } catch (e) { return page("Shop", `<div class="banner warn">${esc(e.message)}</div>`, { back: "#me" }); }
  const D = previewData();
  const all = cat.skus.some(c => (c.sku === "pass" || c.sku === "skins") && c.owned);
  const item = sku => cat.skus.find(c => c.sku === sku);
  const pass = item("pass"), bundle = item("skins");
  const oneByOne = cat.skus.filter(c => c.sku !== "pass").reduce((a, c) => a + c.price, 0);
  const skinOwned = name => all || cat.skins.includes(name);
  const swatch = t => `style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT};--tink:${t.INK}"`;

  const itemHtml = c => `<div class="card shopitem" data-sku="${esc(c.sku)}">
    <button class="shopthumb" data-act="peek" data-sku="${esc(c.sku)}" aria-label="See ${esc(c.name)} on ${onWhat(c.sku, D).short}"><span class="skeleton"></span></button>
    <div class="body row"><button class="plain" data-act="peek" data-sku="${esc(c.sku)}"><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.blurb)}</div><div class="peek">See it on ${onWhat(c.sku, D).short} ›</div></button>
      ${c.owned ? `<span class="pill done">Yours</span>` : `<button class="btn small primary" data-act="buy" data-sku="${esc(c.sku)}" ${cat.stripe ? "" : "disabled"}>${eur(c.price)}</button>`}</div></div>`;
  const skinTile = t => `<button class="tchip skin" data-act="peek" data-sku="skin:${t.name}" ${swatch(t)}>
    <span class="sw"><b>${esc(t.name.toUpperCase())}</b></span>${esc(t.name)}<small>${cat.freeThemes.includes(t.name) ? "Free" : skinOwned(t.name) ? "Yours" : eur(cat.skinPrice)}</small></button>`;

  page("Shop", `
    <p class="muted small shopintro">Scoring a round, keeping a league and inviting people are free, and always will be. What is sold is how the output looks and how much it says. Tap anything to see it on ${D.own ? "your own round" : "a round"} before you buy.${cat.open ? "" : " <b>Nothing is gated yet.</b>"}${cat.stripe ? "" : " Buying is not open yet."}</p>
    <div class="now pass"><div class="k">Everything</div><div class="name">${esc(pass.blurb)}</div>
      <div class="live">One by one the rest comes to <b>${eur(oneByOne)}</b>. The pass is <b>${eur(pass.price)}</b>, once.</div>
      ${pass.owned ? `<span class="cta">Yours</span>` : `<button class="cta" data-act="buy" data-sku="pass" ${cat.stripe ? "" : "disabled"}>Buy the pass · ${eur(pass.price)}</button>`}</div>
    ${GROUPS.map(g => `<h2>${g.title}</h2><p class="muted small shopintro">${g.intro}</p>${g.skus.map(item).filter(Boolean).map(itemHtml).join("")}`).join("")}
    <h2>Skins</h2>
    <p class="muted small shopintro">A skin dresses the app itself as well as every poster and card. ${esc(cat.freeThemes.join(" and "))} are free. Tap one to see it.</p>
    <div class="card shopitem" data-sku="skins">
      <button class="shopthumb swrow" data-act="peek" data-sku="skins" aria-label="See every skin">${DATA.themes.map(t => `<i ${swatch(t)}></i>`).join("")}</button>
      <div class="body row"><button class="plain" data-act="peek" data-sku="skins"><div class="name">${esc(bundle.name)}</div><div class="muted small">${esc(bundle.blurb)}</div><div class="peek">See all ${DATA.themes.length} ›</div></button>
        ${bundle.owned ? `<span class="pill done">Yours</span>` : `<button class="btn small primary" data-act="buy" data-sku="skins" ${cat.stripe ? "" : "disabled"}>${eur(bundle.price)}</button>`}</div></div>
    <div class="skins">${DATA.themes.map(skinTile).join("")}</div>
    <p class="foot">Bought once, on the web, never inside an app store. Yours on every phone you sign in on.</p>`, { back: "#me", sub: "Bought once, yours on every phone" });

  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "buy") return checkout(b.dataset.sku, b);
    if (b.dataset.act !== "peek") return;
    const sku = b.dataset.sku;
    if (sku.startsWith("skin:")) return skinSheet(sku.slice(5), cat, D);
    if (sku === "skins") return bundleSheet(cat, D);
    return itemSheet(item(sku), cat, D);
  });
  fillList(D);
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
    if (sku === "skins") continue;
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

// ---------------------------------------------------------------- the sheets
async function itemSheet(c, cat, D) {
  if (!c) return;
  const T = makeTheme(appTheme());
  const jobs = jobsFor(c.sku, T, D);
  const body = `<p class="muted small">${onWhat(c.sku, D).line}${jobs.length ? "" : " Nothing to draw yet."}</p><div class="prevs">${jobs.map(prevHtml).join("")}</div>`;
  const actions = [...(c.owned ? [] : buyActions(`Buy · ${eur(c.price)}`, "buy", cat)), { label: "Close", value: "no" }];
  const v = await sheet({ title: c.name, lead: c.blurb, body, actions, onOpen: el => fillPrevs(el, jobs, i => keyFor(c.sku, T, D, i)) });
  if (v === "buy") await checkout(c.sku);
}

/** The app itself, dressed in a look: the real screen pieces painted from that theme's own palette. */
export function mockHtml(t, M, tiny = false) {
  const vars = Object.entries(t.ui).filter(([k]) => k !== "scheme").map(([k, v]) => `--${k}:${v}`).join(";");
  const top = M ? M.stbl_board.slice(0, 3) : [];
  return `<div class="skinmock${tiny ? " tiny" : ""}" style="${vars}" aria-hidden="true">
    <div class="mtop"><span class="brand">Hagolf</span><span class="mbell">${ICONS.bell}</span></div>
    <div class="now"><div class="k">Last round</div><div class="name">${esc(M ? M.name : "Sunday fourball")}</div>${top.length ? `<div class="live">${esc(firstName(top[0].name))} won with ${top[0].pts} points</div>` : ""}</div>
    <h2>Stableford</h2>
    <div class="card">${top.map((p, i) => `<div class="pl row"><span class="who"><span class="pos ${i === 0 ? "p1" : ""}">${i + 1}</span>${esc(p.name)}</span><span class="nums"><span class="acc"><b>${p.pts}</b><small>pts</small></span><span><b>${p.gross === null ? "NR" : p.gross}</b><small>gross</small></span></span></div>`).join("")}</div>
    <div class="mtabs">${TABS.map(([, , l, ic], i) => `<span class="${i === 0 ? "on" : ""}">${ICONS[ic]}${l}</span>`).join("")}</div></div>`;
}

async function skinSheet(name, cat, D) {
  const t = themeNamed(name);
  if (!t) return;
  const T = makeTheme(t);
  const free = cat.freeThemes.includes(name), owned = free || cat.skus.some(c => (c.sku === "pass" || c.sku === "skins") && c.owned) || cat.skins.includes(name);
  const bundle = cat.skus.find(c => c.sku === "skins");
  const jobs = jobsFor(`skin:${name}`, T, D);
  const body = `<p class="muted small">The app itself, as it opens every time:</p>${mockHtml(t, D.M)}
    <p class="muted small">${onWhat("skin", D).line}</p><div class="prevs">${jobs.map(prevHtml).join("")}</div>`;
  const wearing = appTheme().name === name;
  const actions = owned
    ? [{ label: wearing ? "The app wears this now" : "Wear it", value: "wear", kind: "primary" }, { label: "Close", value: "no" }]
    : [...buyActions(`Buy this skin · ${eur(cat.skinPrice)}`, "buy", cat), ...(bundle && !bundle.owned ? buyActions(`Every skin · ${eur(bundle.price)}`, "bundle", cat) : []), { label: "Close", value: "no" }];
  const v = await sheet({ title: `The ${name} skin`, lead: t.blurb || "", body, actions, onOpen: el => fillPrevs(el, jobs, i => keyFor(`skin:${name}`, T, D, i)) });
  if (v === "buy") return checkout(`skin:${name}`);
  if (v === "bundle") return checkout("skins");
  if (v === "wear" && !wearing) {
    S.setSetting("theme", name); S.setSetting("themeChosen", true);
    paint(themeHere());
    toast(`The app now wears ${name}`);
    shop();
  }
}

async function bundleSheet(cat, D) {
  const bundle = cat.skus.find(c => c.sku === "skins");
  const body = `<p class="muted small">All ${DATA.themes.length} looks, on the posters, the cards and the app itself. Tap one to see it up close.</p>
    <div class="skingrid">${DATA.themes.map(t => `<button data-act="skin:${t.name}" data-sheet-act>${mockHtml(t, D.M, true)}<span>${esc(t.name)}</span></button>`).join("")}</div>`;
  const actions = [...(bundle.owned ? [] : buyActions(`Buy every skin · ${eur(bundle.price)}`, "buy", cat)), { label: "Close", value: "no" }];
  const v = await sheet({ title: bundle.name, lead: bundle.blurb, body, actions });
  if (v === "buy") return checkout("skins");
  if (v && v.startsWith("skin:")) return skinSheet(v.slice(5), cat, D);
}
