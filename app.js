// Hagolf screens and navigation. Hash routes: #home #welcome #join/<payload> #new #players/<rid> #score/<rid>/<hole>
// #review/<rid> #attach/<rid> #graphics/<rid> #roster #leagues #league/<gid> #leagueposter/<gid> #settings #newcourse
import { DATA } from "./data.js";
import * as S from "./store.js";
import * as Y from "./sync.js";
import { compute, computeNine, halves, standings, strokeStandings, matchStandings, gpStandings, GP_POINTS, headToHead, leagueStats, rivals, SCORE_BUCKETS, handicapFor, prepareCourse, outcome, stableford, fmtToPar, fmtSigned, fmtHcp, fmtIndex, fix, NO_SCORE } from "./model.js";
import { loadFonts, makeTheme } from "./draw.js";
import { grossLeaderboard, stablefordLeaderboard, holesPoster, standingsPoster, STANDINGS_TITLES } from "./posters.js";
import { renderCards } from "./cards.js";

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const courseBy = slug => S.courseBy(slug);
const courseTitle = c => c.loop ? `${c.name} · ${c.loop}` : c.name;
const sum = xs => xs.reduce((a, b) => a + b, 0);
const go = hash => { location.hash = hash; };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const firstName = n => String(n || "").trim().split(/\s+/)[0];
const inits = n => String(n || "").trim().split(/\s+/).slice(0, 2).map(w => [...w][0].toUpperCase()).join("");
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
/** "Sat 5 Sep 2026" from an ISO date; the raw text if it is not a date. */
const fmtDate = d => { const t = d ? new Date(d + "T12:00:00") : null; return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : (d || ""); };
const FORMAT_NAMES = { stableford: "Stableford", stroke: "Stroke play", match: "Matchplay (stroke)",
  matchpts: "Matchplay (Stableford)", soccer: "Football table (stroke)", soccerpts: "Football table (Stableford)", gp: "Grand Prix" };
// What a hole-by-hole format settles a hole on. A format not in here is not a match format.
const MATCH_BASIS = { match: "net", matchpts: "points", soccer: "net", soccerpts: "points" };
const basisWord = b => b === "points" ? "Stableford points" : "net strokes";
const FORMAT_BLURB = {
  stableford: "Stableford points added up across rounds",
  stroke: "Net score against par, lowest total wins",
  match: "Matches decided on net strokes, the ordinary golf way: 2 a win, 1 a draw",
  matchpts: "Matches decided on Stableford points a hole: 2 a win, 1 a draw",
  soccer: "The same matches on net strokes, as a football table: 3 a win, 1 a draw",
  soccerpts: "The same matches on Stableford points, as a football table: 3 a win, 1 a draw",
  gp: "Formula 1 points by finishing position: 25 for the win, then 18, 15, 12" + "…",
};
const FORMAT_NOTES = {
  stableford: "Stableford points per round; wins = most points in a round.",
  stroke: "Net strokes against par per round, lowest total wins; a round without a return does not count.",
  match: "Every pair who shared a round played a match, each hole going to the lower net score. 2 points a win, 1 a draw.",
  matchpts: "Every pair who shared a round played a match, each hole going to the higher Stableford points. Points stop at zero, so two wrecked holes halve where net strokes would separate them. 2 points a win, 1 a draw.",
  soccer: "Matches on net strokes, scored as a football table: 3 points a win, 1 a draw, nothing for a loss.",
  soccerpts: "Matches on Stableford points a hole, scored as a football table: 3 points a win, 1 a draw, nothing for a loss.",
  gp: `Each round hands out points by finishing position, as Formula 1 does: ${GP_POINTS.join(", ")} down the board, nothing after that. Position is taken among this league's players, so a guest cannot take the win.`,
};
let toastTimer = null;
const ui = { expanded: null, selHole: null, blobs: [], h2h: {}, groupFilter: 0, leagueTab: {}, reviewOrder: {}, mineOnly: false,
  loops: {}, nineTab: {}, fmtTab: {}, statsWho: {} };

function toast(msg, ms = 2600, action = null) {
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

/** Handicap index as typed: "19,9", "+2.1" (plus handicap), "18". */
export function parseHI(s) {
  s = String(s || "").trim().replace(",", ".");
  if (!s) return NaN;
  const plus = s.startsWith("+");
  const v = Number(s.replace(/^\+/, ""));
  return plus ? -v : v;
}

const ICONS = {
  home: `<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>`,
  leagues: `<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8 21h8"/><path d="M9 17h6v4"/></svg>`,
  players: `<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15.5a5 5 0 0 1 5.5 4.5"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
};
const TABS = [["home", "#home", "Home"], ["leagues", "#leagues", "Leagues"], ["players", "#roster", "Players"], ["settings", "#settings", "Settings"]];

/** One screen: header (back or brand), body, and either an action bar (a flow) or the tab bar (a top-level screen). */
function page(title, body, { back = "#home", bar = "", sub = "", tabs = null, brand = false, keepScroll = false } = {}) {
  const y = keepScroll ? window.scrollY : 0;
  const nav = tabs ? `<nav class="tabs">${TABS.map(([k, h, l]) => `<a href="${h}" class="${k === tabs ? "on" : ""}">${ICONS[k]}${l}</a>`).join("")}</nav>` : "";
  app.innerHTML = `
    <header class="top">${back ? `<a class="back" href="${back}" aria-label="Back">‹</a>` : "<span class='back none'></span>"}
      <div class="ttl">${brand ? `<div class="brand">Hagolf</div>` : `<h1>${esc(title)}</h1>`}${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>${syncDot()}</header>
    <main class="${bar ? "with-bar" : tabs ? "with-tabs" : ""}">${body}</main>
    ${bar ? `<footer class="bar">${bar}</footer>` : nav}`;
  window.scrollTo(0, y);
}

/** Click handler for this screen only: main and the bar are rebuilt by page(), so nothing stacks up. */
function bind(fn) {
  app.querySelectorAll("main, footer.bar").forEach(el => el.addEventListener("click", fn));
}

function syncDot() {
  const s = Y.sync.status;
  const title = { off: "Solo phone: not connected to a shared database", idle: "Synced", syncing: "Syncing", error: "Sync problem: " + (Y.sync.error || "") }[s];
  return `<a class="dot ${s}" href="#settings" title="${esc(title)}" aria-label="${esc(title)}"></a>`;
}

const organiser = () => !!S.state.settings.organiser;

function roundStatus(r) {
  const c = courseBy(r.course);
  const n = c ? c.n : 0;
  if (r.status === "setup") return `${plural(r.entries.length, "player")} · not started`;
  if (r.status === "scoring") return `scoring · hole ${Math.min(S.holeOf(r) + 1, n)} of ${n}`;
  return `done · ${plural(r.entries.length, "player")}`;
}

function resumeHash(r) {
  if (r.status === "setup") return `#players/${r.id}`;
  if (r.status === "scoring") return `#score/${r.id}/${S.holeOf(r)}`;
  return `#graphics/${r.id}`;
}

function noCourse(r, back = "#home") {
  page(esc(r.name || "Round"), `<div class="banner warn">This round's course (${esc(r.course)}) is not on this phone yet. It arrives with the next sync, or the organiser pushes the course files.</div>`, { back });
}

function safeCompute(r) {
  const c = courseBy(r.course);
  if (!c) return null;
  try { return Object.assign(compute(c, S.toModelRound(r)), { id: r.id }); } catch (e) { return null; }
}

/** Points so far for a round in progress, by entered holes: the live board. */
function liveBoard(r) {
  const c = courseBy(r.course);
  if (!c) return null;
  const rows = [];
  let through = 0;
  for (const e of r.entries) {
    let info;
    try { info = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); } catch (err) { continue; }
    let pts = 0, holes = 0;
    e.scores.forEach((v, h) => { if (v === null) return; holes++; if (v > 0) pts += stableford(v, info.par[h], info.strokes[h]); });
    through = Math.max(through, holes);
    rows.push({ name: e.name, pts, holes });
  }
  rows.sort((a, b) => b.pts - a.pts || b.holes - a.holes);
  return { rows, through };
}

// ---------------------------------------------------------------- welcome and join
function welcome() {
  const ps = S.players().sort((a, b) => a.name.localeCompare(b.name));
  const c = Y.config();
  page("Hagolf", `<div class="welcome">
    <h1>Who are you?</h1>
    <p class="muted">Pick your name so the app can show your rounds, your league line and your card. ${c ? `Connected to <b>${esc(c.label || "the shared database")}</b>.` : "This phone is not connected to a shared database yet; that can be set up later in Settings."}</p>
    ${ps.length ? `<div class="chips-wrap" style="margin:12px 0">${ps.map(p => `<button class="pchip" data-act="me" data-id="${p.id}">${esc(p.name)}<small>index ${fmtIndex(Number(p.hi))}</small></button>`).join("")}</div>` : ""}
    <form id="mef" class="card form open"><h2>${ps.length ? "Not in the list" : "Your name"}</h2>
      <label>Name<input name="name" autocapitalize="words" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
      <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" placeholder="18,4 or +2.1" required></label>
      <label>Rating<select name="gender"><option value="m">Men's</option><option value="f">Women's</option></select></label></div>
      <button class="btn primary" type="submit">That's me</button></form>
    <p class="center"><a class="muted small" href="#skipme">Skip for now</a></p></div>`, { back: "", brand: true });
  bind(ev => {
    const b = ev.target.closest("[data-act=me]");
    if (b) { S.state.settings.meId = b.dataset.id; S.state.settings.welcomed = true; S.save(); go("#home"); }
  });
  document.getElementById("mef").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, hi = parseHI(f.hi.value);
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54, e.g. 18,4");
    const p = S.upsertPlayer(f.name.value.trim(), hi, f.gender.value);
    S.state.settings.meId = p.id; S.state.settings.welcomed = true; S.save(); go("#home");
  });
}

async function join(payload) {
  let c;
  try { c = Y.parseJoin(payload); } catch (e) { toast("That join link is not readable"); return go("#home"); }
  page("Joining…", `<p class="muted center">Connecting to ${esc(c.label || c.url)}…</p>`, { back: "" });
  try { await Y.test(c); } catch (err) { toast(`Could not connect: ${err.message}`, 6000); return go("#settings"); }
  Y.setConfig({ url: c.url, anonKey: c.anonKey, label: c.label || "" });
  if (c.organiser) S.state.settings.organiser = true;
  S.state.settings.welcomed = false;
  S.save();
  await new Promise(res => setTimeout(res, 1500));  // let the first pull bring the roster in
  await Y.pull();
  go("#welcome");
}

// ---------------------------------------------------------------- home
/** What a player's line in a league's table is worth, in that league's own units. */
function standingValue(kind, r) {
  if (kind === "stroke") return r.played ? fmtToPar(r.counted) : "–";
  if (kind in MATCH_BASIS) return `${r.points} pts`;
  return `${r.counted} pts`;
}

/** Every leaderboard this player is on, scored the way that league opens. */
function myLeaderboards(me) {
  const rows = [];
  for (const g of S.leagues()) {
    const { Ms, members } = leagueResults(g);
    const kind = S.cleanFormats(g.formats)[0];
    const row = standingsFor(g, Ms, members, kind).rows.find(r => r.id === me.id);
    if (!row) continue;
    rows.push(`<a href="#league/${g.id}"><div><div class="name">${esc(g.name)}</div>
      <div class="muted small">${FORMAT_NAMES[kind]} · ${plural(row.played, "round")}</div></div>
      <span class="pill done">${ordinal(row.place)} · ${standingValue(kind, row)}</span></a>`);
  }
  return rows.length ? `<h2>Leaderboards</h2><div class="list">${rows.join("")}</div>` : "";
}

/** One thing: what the last round was, and what it went round in. */
function lastRoundCard(me) {
  const head = `<div class="h2row"><h2>My last round</h2><a class="muted small" href="#player/${me.id}">All my rounds ›</a></div>`;
  const mine = S.rounds().filter(r => r.status === "done" && r.entries.some(e => e.playerId === me.id));
  if (!mine.length) return `${head}<div class="mecard"><div class="muted small">No finished round yet.</div></div>`;
  const r = mine[0], M = safeCompute(r);
  const p = M ? M.players.find(x => x.id === me.id) : null;
  const c = courseBy(r.course);
  return `${head}<a class="mecard" href="#review/${r.id}"><div class="row">
    <div><div class="name">${esc(c ? c.loop || c.name : r.name)}</div><div class="muted small">${esc(fmtDate(r.date))}</div></div>
    <span class="res"><span class="big num">${p && p.gross !== null ? p.gross : "–"}<small>gross</small></span></span></div></a>`;
}

function home() {
  if (!S.state.settings.welcomed) return welcome();
  const rounds = S.rounds();
  const me = S.me();
  const banners = [];
  if (Y.sync.status === "error") banners.push(`<a class="banner warn" href="#settings">Sync problem: ${esc(Y.sync.error || "")}. Changes are kept on this phone and sent when it works again.</a>`);
  if (window.__updateReady) banners.push(`<div class="banner" data-act="update">A new version is ready. Tap to reload.</div>`);
  if (window.__installPrompt) banners.push(`<div class="banner" data-act="install">Install Hagolf on this phone</div>`);
  else if (isIOS() && !isStandalone()) banners.push(`<div class="banner muted">To install: tap Share <span class="ios-share">⎋</span> in Safari, then “Add to Home Screen”.</div>`);
  if (!Y.enabled() && S.needsBackup()) banners.push(`<a class="banner muted" href="#settings">Solo phone: rounds since the last backup. Export a backup when you have a moment.</a>`);
  if (Y.enabled() && Y.sync.status !== "error" && !rounds.length && !S.leagues().length) banners.push(`<button class="banner accent" data-act="resync" style="width:100%">Nothing here yet? Tap to fetch everything from ${esc(Y.config().label || "the database")}</button>`);
  const open = rounds.filter(r => r.status !== "done");
  const finished = rounds.filter(r => r.status === "done");
  const liveLine = r => {
    if (r.status !== "scoring") return "";
    const L = liveBoard(r);
    return L && L.rows.length && L.through ? `<div class="live">through ${L.through} · ${L.rows.slice(0, 3).map((x, i) => `${i + 1}. ${esc(x.name.split(" ")[0])} <b>${x.pts}</b>`).join(" · ")}</div>` : "";
  };
  const now = open.map(r => `<a class="now" href="${resumeHash(r)}"><div class="k">${r.status === "scoring" ? "Playing now" : "Being set up"}</div><div class="name">${esc(r.name)}</div>
    <div class="small" style="opacity:.85">${esc(courseTitle(courseBy(r.course) || { name: r.course }))} · ${roundStatus(r)}</div>${liveLine(r)}<span class="cta">${r.status === "scoring" ? "Continue scoring ›" : "Add players ›"}</span></a>`).join("");
  const mineOnly = ui.mineOnly && !!me;
  const shown = mineOnly ? finished.filter(r => r.entries.some(e => e.playerId === me.id)) : finished;
  const filter = me && finished.length ? `<div class="filter"><button data-act="mine" data-v="0" class="${mineOnly ? "" : "on"}">Everyone</button><button data-act="mine" data-v="1" class="${mineOnly ? "on" : ""}">Only mine</button></div>` : "";
  const list = shown.length ? `<div class="list">${shown.map(r => {
    const c = courseBy(r.course);
    return `<a class="rround" href="${resumeHash(r)}"><div class="d">${esc(fmtDate(r.date))}</div><div class="name">${esc(c ? (c.loop || c.name) : r.course)}</div>
      <div class="who">${r.entries.map(e => `<span class="${me && e.playerId === me.id ? "me" : ""}">${esc(e.name)}</span>`).join("")}</div></a>`;
  }).join("")}</div>` : (finished.length ? `<p class="muted center">No rounds of yours yet.</p>` : (open.length ? "" : `<p class="muted center">No rounds yet. Start your first one.</p>`));
  const hour = new Date().getHours(), greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  page("Hagolf", `
    <div class="hero"><p class="hi">${greet}${me ? `, ${esc(me.name.split(" ")[0])}` : ""}</p><div class="muted small">${Y.enabled() ? `Synced with ${esc(Y.config().label || "your society")}` : "Solo phone"} · ${S.courses().length} courses · v${DATA.version.slice(4, 8)}.${DATA.version.slice(9)}</div></div>
    ${banners.join("")}
    ${now}
    <a class="btn primary big" href="#new">+ Start a round</a>
    ${me ? myLeaderboards(me) + lastRoundCard(me) : `<a class="banner" href="#welcome">Say who you are to see your own results here ›</a>`}
    ${finished.length ? `<h2>Finished rounds</h2>` : ""}${filter}${list}`, { back: "", tabs: "home", brand: true });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "mine") { ui.mineOnly = b.dataset.v === "1"; return home(); }
    if (b.dataset.act === "resync") await resyncNow();
  });
}

async function resyncNow() {
  toast("Fetching everything…", 4000);
  const n = await Y.resync();
  toast(Y.sync.status === "error" ? `Could not fetch: ${Y.sync.error}` : `Fetched ${plural(n.rounds, "round")}, ${plural(n.players, "player")}, ${plural(n.leagues, "league")}`, 5000);
  route();
}

async function myCard(rid, pid = null) {
  const me = pid ? S.state.players.find(x => x.id === pid) : S.me(), r = S.getRound(rid);
  const M = r ? safeCompute(r) : null;
  if (!me || !M || !M.players.some(p => p.id === me.id)) return toast("No card to make");
  toast("Making your card…", 3000);
  await loadFonts(DATA.fonts);
  const T = makeTheme(DATA.themes.find(t => t.name === (S.state.settings.themes || ["navy"])[0]) || DATA.themes[0]);
  const fig = renderCards(M, T, [me.name])[0];
  const blob = await fig.fig.toBlob();
  await saveFiles([new File([blob], `${slugFile(r.name)}_${fig.file.split("/").pop()}`, { type: "image/png" })], r.name);
}

// ---------------------------------------------------------------- nines: clubs that publish their loops separately
/** The single nines a club has a course file for, in the order the kit lists them. */
function ninesOf(club) {
  return S.courses().filter(c => c.name === club && (c.nines || []).length === 1);
}

/** The course that is these two nines walked in this order, or null when the club has no file for it. */
function comboOf(club, a, b) {
  return S.courses().find(c => c.name === club && (c.nines || []).length === 2 && c.nines[0] === a && c.nines[1] === b) || null;
}

/** A club is picked by loops when it has at least two nines of its own; otherwise its courses just list. */
const picksLoops = club => ninesOf(club).length >= 2;

const nineName = slug => { const c = courseBy(slug); return c ? (c.loop || c.name).replace(/, 9 holes$/, "") : slug; };

function loops(club) {
  const nines = ninesOf(club);
  if (!nines.length) return go("#new");
  const st = ui.loops.club === club ? ui.loops : (ui.loops = { club, holes: 18, first: null });
  const chip = (c, on, act) => `<button class="pchip ${on ? "on" : ""}" data-act="${act}" data-slug="${esc(c.slug)}">${esc(nineName(c.slug))}<small>par ${c.course_par}</small></button>`;
  let body;
  if (st.holes === 9) {
    body = `<h2>Which nine did you walk?</h2><div class="chips-wrap">${nines.map(c => chip(c, false, "pick-nine")).join("")}</div>`;
  } else if (!st.first) {
    body = `<h2>Which nine first?</h2><div class="chips-wrap">${nines.map(c => chip(c, false, "pick-first")).join("")}</div>`;
  } else {
    const rest = nines.filter(c => c.slug !== st.first);
    const missing = rest.filter(c => !comboOf(club, st.first, c.slug));
    body = `<h2>Started on ${esc(nineName(st.first))}</h2>
      <div class="chips-wrap">${chip(courseBy(st.first), true, "clear-first")}</div>
      <h2>Then which nine?</h2>
      <div class="chips-wrap">${rest.filter(c => comboOf(club, st.first, c.slug)).map(c => chip(c, false, "pick-second")).join("")}</div>
      ${missing.length ? `<p class="muted small">No card for ${esc(nineName(st.first))} then ${missing.map(c => esc(nineName(c.slug))).join(" or ")}.</p>` : ""}`;
  }
  page(club, `
    <div class="filter"><button data-act="holes" data-v="9" class="${st.holes === 9 ? "on" : ""}">9 holes</button><button data-act="holes" data-v="18" class="${st.holes === 18 ? "on" : ""}">18 holes</button></div>
    ${body}
    <p class="muted small" style="margin-top:18px">${plural(nines.length, "loop")}, so ${nines.length} nines and ${nines.length * (nines.length - 1)} ways round for 18. Each one has its own stroke index and its own rating, and the round splits back into its nines for the statistics.</p>`,
    { back: "#new", sub: `${plural(nines.length, "nine")} · 9 or 18 holes` });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "holes") { st.holes = Number(b.dataset.v); st.first = null; return loops(club); }
    if (act === "clear-first") { st.first = null; return loops(club); }
    if (act === "pick-first") { st.first = b.dataset.slug; return loops(club); }
    if (act === "pick-nine") return go(`#new/${b.dataset.slug}`);
    if (act === "pick-second") {
      const c = comboOf(club, st.first, b.dataset.slug);
      if (c) return go(`#new/${c.slug}`);
    }
  });
}

// ---------------------------------------------------------------- new round
function newRound(slug = null) {
  if (slug) return roundForm(slug);
  const all = S.courses();
  const recent = (S.state.settings.recentCourses || []).map(s => all.find(c => c.slug === s)).filter(Boolean);
  const groups = new Map();
  for (const c of all) { if (!groups.has(c.name)) groups.set(c.name, []); groups.get(c.name).push(c); }
  const row = c => `<button class="course" data-act="pick-course" data-slug="${esc(c.slug)}" data-q="${esc((c.name + " " + c.loop).toLowerCase())}">
    <div><div class="name">${esc(c.loop || c.name)}</div><div class="muted small">${c.n} holes · par ${c.course_par} · ${Object.keys(c.tees).join(", ")} tees${c.source === "phone" ? " · added on a phone" : ""}</div></div><span class="chev">›</span></button>`;
  // A club that publishes its nines separately gets one entry: you say 9 or 18 and which loops, not which of 20 files.
  const clubRow = (name, cs) => {
    const k = ninesOf(name).length;
    return `<button class="course" data-act="pick-club" data-club="${esc(name)}" data-q="${esc((name + " " + cs.map(c => c.loop).join(" ")).toLowerCase())}">
      <div><div class="name">${esc(name)}</div><div class="muted small">${plural(k, "nine")} · 9 or 18 holes · ${k * (k - 1)} ways round</div></div><span class="chev">›</span></button>`;
  };
  const group = (name, cs) => `<h2>${esc(name)}</h2><div class="list">${cs.map(row).join("")}</div>`;
  // Browsing goes through the picker; typing in the search box reveals the individual loops, as before.
  const clubs = [...groups].map(([name, cs]) => picksLoops(name)
    ? `<div class="list clubrow">${clubRow(name, cs)}</div><div class="loopsonly" hidden>${group(name, cs)}</div>`
    : group(name, cs)).join("");
  const body = `
    <input id="q" class="search" placeholder="Search course or loop" autocomplete="off">
    <div id="courses">${recent.length ? group("Recent", recent) : ""}
    ${clubs}</div>
    <p class="center"><a class="muted small" href="#newcourse">Course not here? Add one</a></p>`;
  page("Where are you playing?", body + `<div class="list" style="margin-top:20px"><a href="#scan"><div><div class="name">Scan an old scorecard</div><div class="muted small">Photograph a paper card; the scores are read for you to check</div></div><span class="chev">›</span></a></div>`);
  const q = document.getElementById("q");
  q.addEventListener("input", () => {
    const s = q.value.toLowerCase().trim();
    document.querySelectorAll("#courses .clubrow").forEach(el => { el.hidden = !!s; });
    document.querySelectorAll("#courses .loopsonly").forEach(el => { el.hidden = !s; });
    document.querySelectorAll("#courses .course").forEach(b => { b.style.display = !s || b.dataset.q.includes(s) ? "" : "none"; });
    document.querySelectorAll("#courses h2").forEach(h => {
      const list = h.nextElementSibling, any = list && [...list.children].some(el => el.style.display !== "none");
      h.style.display = any ? "" : "none"; if (list) list.style.display = any ? "" : "none";
    });
  });
}

function roundForm(slug) {
  const c = courseBy(slug);
  const tees = Object.keys(c.tees);
  const dflt = tees.includes("yellow") ? "yellow" : tees[0];
  const date = S.today();
  const last = S.state.settings.lastLeague;
  page("New round", `
    <div class="card"><div class="row"><div><div class="name">${esc(courseTitle(c))}</div><div class="muted small">${c.n} holes · par ${c.course_par}</div></div><a class="btn small" href="#new">Change</a></div>
      ${(c.notes || []).length ? `<div class="warn small" style="margin-top:6px">${esc(c.notes.join("; "))}</div>` : ""}</div>
    <div class="card">
      <label style="margin-top:0">Name of the round<input id="rname" value="${esc((c.loop || c.name) + " " + date)}"></label>
      <div class="two"><label>Date<input id="rdate" type="date" value="${date}"></label>
      <label>Tee <span class="muted">(per player later)</span><select id="rtee">${tees.map(t => `<option ${t === dflt ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <label>Handicap allowance<select id="rallow"><option value="100">100% (society default)</option><option value="95">95% (WHS individual Stableford)</option><option value="90">90%</option></select></label>
    </div>
    ${S.leagues().length ? `<div class="card checks"><h2>Counts for</h2>${S.leagues().map(g => `<label><input type="checkbox" name="lg" value="${g.id}" ${g.id === last ? "checked" : ""}> ${esc(g.name)}</label>`).join("")}</div>` : ""}`,
  { back: "#new", bar: `<button class="btn primary" data-act="create-round" data-slug="${esc(slug)}">Next: who is playing ›</button>` });
}

// ---------------------------------------------------------------- players in a round
function players(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const tees = Object.keys(c.tees);
  const inRound = new Set(r.entries.map(e => e.playerId));
  const roster = S.players().filter(p => !inRound.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const me = S.me();
  const showGroups = r.entries.length > 4 || r.entries.some(e => (e.group || 1) > 1);
  const rows = r.entries.map((e, i) => {
    let hc = "", missing = false;
    try { const h = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); hc = `course hcp ${fmtHcp(h.ch)}`; }
    catch (err) { hc = `<span class="warn">${esc(err.message)}</span>`; missing = true; }
    return `<div class="card entry"><div class="row"><div><div class="name">${esc(e.name)}</div><div class="muted small">index ${fmtIndex(Number(e.hi))} · ${e.gender === "f" ? "women's" : "men's"} rating · ${hc}</div></div>
        <button class="x" data-act="remove-entry" data-i="${i}" aria-label="Remove">×</button></div>
      <div class="entry-tools">
        <select data-act="tee" data-i="${i}" aria-label="Tee">${tees.map(t => `<option ${t === e.tee ? "selected" : ""}>${esc(t)} tee</option>`).join("")}</select>
        ${showGroups ? `<span class="seg-label">group</span><span class="seg">${[1, 2, 3, 4].map(g => `<button data-act="grp" data-i="${i}" data-g="${g}" class="${(e.group || 1) === g ? "on" : ""}">${g}</button>`).join("")}</span>` : ""}
        <select data-act="from" data-i="${i}" title="Joins at hole"><option value="1" ${(e.fromHole || 1) === 1 ? "selected" : ""}>from hole 1</option>${c.par.slice(1).map((_, k) => `<option value="${k + 2}" ${(e.fromHole || 1) === k + 2 ? "selected" : ""}>joins at hole ${c.first_hole + k + 1}</option>`).join("")}</select>
        ${missing ? `<input data-act="pch" data-i="${i}" inputmode="numeric" placeholder="course hcp (club table)">` : ""}
      </div></div>`;
  }).join("");
  const body = `
    <h2>${plural(r.entries.length, "player")} in this round</h2>
    ${rows || `<p class="muted small">Nobody yet. Tap names below to add them.</p>`}
    ${roster.length ? `<h2>Tap to add</h2><div class="chips-wrap">${roster.map(p => `<button class="pchip ${me && p.id === me.id ? "on" : ""}" data-act="add-roster" data-id="${p.id}"><span><span class="plus">+</span>${esc(p.name)}</span><small>index ${fmtIndex(Number(p.hi))}</small></button>`).join("")}</div>` : ""}
    <form id="addf" class="card form ${roster.length || r.entries.length ? "" : "open"}">
      <h2>Someone new</h2>
      <label>Name<input id="pname" autocomplete="off" autocapitalize="words" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
      <div class="two">
        <label>Handicap index<input id="phi" inputmode="decimal" placeholder="18,4 or +2.1" required></label>
        <label>Tee<select id="ptee">${tees.map(t => `<option ${t === r.defaultTee ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <div class="two">
        <label>Rating<select id="pgender"><option value="m">Men's</option><option value="f">Women's</option></select></label>
        <label>Course hcp override <span class="muted">(optional)</span><input id="pch" inputmode="numeric" placeholder="from club table"></label></div>
      <button class="btn primary" type="submit">Add player</button>
    </form>
    <button class="btn addbtn ${roster.length || r.entries.length ? "" : "hidden"}" data-act="toggle-add"><span class="plus">+</span> Someone new</button>`;
  const bar = r.entries.length
    ? `<button class="btn primary" data-act="start-scoring" data-rid="${rid}">${r.status === "setup" ? "Start scoring ›" : "Back to scoring ›"}</button>`
    : `<button class="btn" disabled>Add players to start</button>`;
  page("Who is playing?", body, { back: "#home", bar, sub: `${r.name} · ${courseTitle(c)}` });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "add-roster") {
      const p = S.players().find(x => x.id === b.dataset.id);
      S.addEntry(r, c.n, { name: p.name, hi: p.hi, tee: r.defaultTee, gender: p.gender || "m", courseHandicap: null });
      return players(rid);
    }
    if (b.dataset.act === "grp") { const e = r.entries[Number(b.dataset.i)]; e.group = Number(b.dataset.g); S.saveEntry(r, e); return players(rid); }
  });
  app.querySelector("main").addEventListener("change", ev => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const e = r.entries[Number(el.dataset.i)];
    if (el.dataset.act === "tee") { e.tee = el.value; S.saveEntry(r, e); players(rid); }
    if (el.dataset.act === "from") { e.fromHole = Number(el.value); S.saveEntry(r, e); players(rid); }
    if (el.dataset.act === "pch") {
      const v = Number(el.value.trim());
      if (!Number.isInteger(v)) return toast("Course handicap must be a whole number");
      S.setPch(e.playerId, r.course, e.tee, v); players(rid);
    }
  });
  const f = document.getElementById("addf"), nameEl = document.getElementById("pname");
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    const name = nameEl.value.trim();
    const hi = parseHI(document.getElementById("phi").value);
    const tee = document.getElementById("ptee").value;
    const gender = document.getElementById("pgender").value;
    const chRaw = document.getElementById("pch").value.trim();
    const courseHandicap = chRaw === "" ? null : Number(chRaw);
    if (!name) return toast("Give the player a name");
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54, e.g. 18,4");
    if (chRaw !== "" && !Number.isInteger(courseHandicap)) return toast("Course handicap must be a whole number");
    if (r.entries.some(e => S.nameKey(e.name) === S.nameKey(name))) return toast(`${name} is already in this round`);
    const known = S.findPlayer(name);
    if (known) toast(`${known.name} was already known; added with today's index`, 3500);
    S.addEntry(r, c.n, { name: known ? known.name : name, hi, tee, gender, courseHandicap });
    players(rid);
  });
  if (f.classList.contains("open")) nameEl.focus();
}

// ---------------------------------------------------------------- scoring
function scoreRow(r, c, e, i, h) {
  let info = null;
  try { info = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); } catch (err) { info = null; }
  const par = info ? info.par[h] : c.par[h];
  if ((e.fromHole || 1) - 1 > h) return `<div class="prow" data-i="${i}"><div class="pinfo"><div class="name">${esc(e.name)}</div><div class="muted small">joins at hole ${c.first_hole + e.fromHole - 1}</div></div><div></div><div class="muted center">—</div><div></div></div>`;
  const v = e.scores[h];
  const st = info ? info.strokes[h] : 0;
  const entered = e.scores.filter(x => x !== null).length;
  let ptsSoFar = 0;
  if (info) e.scores.forEach((x, k) => { if (x) ptsSoFar += stableford(x, info.par[k], info.strokes[k]); });
  const detail = `${st ? plural(st, "stroke") : "no strokes"}${entered ? ` · ${sum(e.scores.filter(x => x))} after ${entered}` : ""}`;
  const cls = v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
  const badge = v !== null && v !== 0 && info ? `<span class="pts">${plural(stableford(v, par, st), "pt")}${entered > 1 ? ` · ${ptsSoFar} total` : ""}</span>` : (entered ? `<span class="pts">${plural(ptsSoFar, "pt")}</span>` : "");
  return `<div class="prow" data-i="${i}">
    <div class="pinfo"><div class="name">${esc(e.name)}</div><div class="muted small">${detail}</div>${badge}</div>
    <button class="sbtn" data-act="dec" data-i="${i}" aria-label="minus">−</button>
    <button class="sval ${cls}" data-act="pickup" data-i="${i}" title="Tap to mark picked up">${v === null ? "–" : v === 0 ? String(NO_SCORE) : v}</button>
    <button class="sbtn" data-act="inc" data-i="${i}" aria-label="plus">+</button></div>`;
}

function stripHtml(r, c, rid, h) {
  return c.par.map((_, i) => {
    const playing = r.entries.filter(e => (e.fromHole || 1) - 1 <= i);
    const done = playing.length && playing.every(e => e.scores[i] !== null);
    const some = r.entries.some(e => e.scores[i] !== null);
    return `<a class="hchip ${i === h ? "cur" : ""} ${done ? "done" : some ? "some" : ""}" href="#score/${rid}/${i}">${c.first_hole + i}</a>`;
  }).join("");
}

function score(rid, hArg) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const n = c.n;
  const h = Math.max(0, Math.min(n - 1, Number(hArg) || 0));
  if (r.status === "setup") { r.status = "scoring"; S.saveRound(r); }
  if (S.holeOf(r) !== h) S.setHole(r, h);  // this phone's place in the round, not shared
  if (!S.roundOpen(r)) toast("This round was entered more than 60 days ago and is frozen; changes will not sync.", 5000);
  const groups = [...new Set(r.entries.map(e => e.group || 1))].sort();
  const gf = groups.includes(ui.groupFilter) ? ui.groupFilter : 0;
  const shown = r.entries.map((e, i) => [e, i]).filter(([e]) => !gf || (e.group || 1) === gf);
  const metres = c.tees[r.defaultTee] && c.tees[r.defaultTee].metres;
  const body = `
    <div class="strip">${stripHtml(r, c, rid, h)}</div>
    ${groups.length > 1 ? `<div class="filter"><button data-act="gf" data-g="0" class="${gf === 0 ? "on" : ""}">All</button>${groups.map(g => `<button data-act="gf" data-g="${g}" class="${gf === g ? "on" : ""}">Group ${g}</button>`).join("")}</div>` : ""}
    <div class="holehead"><div class="hnum num">${c.first_hole + h}</div>
      <div><div class="name">Par ${c.par[h]}${metres ? ` · ${metres[h]} m` : ""}</div>
      <div class="muted small">Stroke index ${c.stroke_index[h]} · hole ${h + 1} of ${n}</div></div></div>
    <div class="card" style="padding:4px 14px" id="rows">${shown.map(([e, i]) => scoreRow(r, c, e, i, h)).join("")}</div>
    ${r.entries.length ? "" : `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}
    <p class="hint">First tap on − or + enters par. Tap the score itself for a pick-up, which counts ${NO_SCORE}.</p>
    <p class="center"><a class="btn small" href="#players/${rid}">Add or remove players</a></p>`;
  const bar = (h === 0 ? `<a class="btn" href="#players/${rid}">‹ Players</a>` : `<a class="btn" href="#score/${rid}/${h - 1}">‹ Hole ${c.first_hole + h - 1}</a>`) +
    (h < n - 1 ? `<a class="btn primary" href="#score/${rid}/${h + 1}">Hole ${c.first_hole + h + 1} ›</a>` : `<a class="btn primary" href="#review/${rid}">Review ›</a>`);
  page(esc(r.name), body, { back: "#home", bar, sub: courseTitle(c) });
  const stripEl = document.querySelector(".strip"), cur = document.querySelector(".hchip.cur");
  if (stripEl && cur) stripEl.scrollLeft = cur.offsetLeft - stripEl.clientWidth / 2 + cur.clientWidth / 2;
  const refresh = i => {  // one row and the strip, not the whole screen: the thumb stays where it was
    const row = document.querySelector(`.prow[data-i="${i}"]`);
    if (row) row.outerHTML = scoreRow(r, c, r.entries[i], i, h);
    const keep = stripEl.scrollLeft;
    stripEl.innerHTML = stripHtml(r, c, rid, h);
    stripEl.scrollLeft = keep;
  };
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "gf") { ui.groupFilter = Number(b.dataset.g); return score(rid, h); }
    if (!S.roundOpen(r)) return toast("This round is frozen (entered more than 60 days ago)");
    const i = Number(b.dataset.i), e = r.entries[i];
    const par = c.par[h], v = e.scores[h];
    if (b.dataset.act === "inc") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.min(30, v + 1));
    else if (b.dataset.act === "dec") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.max(1, v - 1));
    else if (b.dataset.act === "pickup") {
      if (v === 0) S.setScore(r, e, h, null);
      else if (v === null) S.setScore(r, e, h, par);
      else { S.setScore(r, e, h, 0); toast(`${e.name}: picked up on hole ${c.first_hole + h}, counts ${NO_SCORE}`, 5000, { label: "Undo", fn: () => { S.setScore(r, e, h, v); refresh(i); } }); }
    }
    refresh(i);
  });
}

// ---------------------------------------------------------------- review
/** The round's own nines, as they actually played that day. */
function nineLine(M, p) {
  const H = halves(M, p);
  if (!H || H.length < 2) return "";
  return `<div class="nines">${H.map(h => `<span><b>${esc(nineName(h.slug))}</b> ${h.gross === null ? "–" : `${h.gross} ${fmtToPar(h.topar)}`} · ${h.pts} pts</span>`).join("")}</div>`;
}

function review(rid, keep = false) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const n = c.n;
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) {
    return page("Review", `<div class="banner warn">${esc(err.message)}</div><a class="btn" href="#players/${rid}">Fix the players</a>`, { back: `#score/${rid}/${S.holeOf(r)}` });
  }
  // The order is frozen while you are editing: fixing a hole must not make rows jump under your finger.
  // It is taken again when you arrive on this screen, so saving and coming back shows the real order.
  const key = p => p.id ?? p.name;
  if (!ui.reviewOrder[rid]) ui.reviewOrder[rid] = M.stbl_board.map(key);
  const order = ui.reviewOrder[rid];
  const rank = p => { const k = order.indexOf(key(p)); return k < 0 ? 1e9 : k; };
  const done = M.stbl_board.map(p => [p, r.entries.find(e => e.playerId === p.id)]).sort((a, b) => rank(a[0]) - rank(b[0]));
  const unfinished = r.entries.filter(e => M.unfinished.includes(e.name));
  const chips = (e) => c.par.map((par, i) => {
    const v = e.scores[i];
    const skip = (e.fromHole || 1) - 1 > i;
    const cls = skip ? "empty" : v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
    const sel = ui.expanded === e.playerId && ui.selHole === i ? "sel" : "";
    return `<button class="chip ${cls} ${sel}" data-act="sel-hole" data-pid="${e.playerId}" data-h="${i}" ${skip ? "disabled" : ""}><small>${c.first_hole + i}</small>${skip ? "—" : v === null ? "–" : v === 0 ? String(NO_SCORE) : v}</button>`;
  }).join("");
  const editor = (e) => {
    if (ui.expanded !== e.playerId || ui.selHole === null) return "";
    const i = ui.selHole, v = e.scores[i], par = c.par[i];
    return `<div class="editor"><div>Hole ${c.first_hole + i} · par ${par} · SI ${c.stroke_index[i]}</div>
      <div class="edrow"><button class="sbtn" data-act="ed" data-d="-1" data-pid="${e.playerId}">−</button>
      <span class="sval big">${v === null ? "–" : v === 0 ? String(NO_SCORE) : v}</span>
      <button class="sbtn" data-act="ed" data-d="1" data-pid="${e.playerId}">+</button>
      <button class="btn small" data-act="ed-pick" data-pid="${e.playerId}">${v === 0 ? "Un-pick" : "Picked up"}</button></div></div>`;
  };
  const penalties = (e) => `<div class="pens">${(e.penalties || []).map((p, k) => `<span class="pen">+${p.strokes} on hole ${p.hole}${p.reason ? ` (${esc(p.reason)})` : ""} <button data-act="del-pen" data-pid="${e.playerId}" data-k="${k}" aria-label="remove">×</button></span>`).join("")}
    <details><summary class="muted small">Add penalty strokes</summary>
      <div class="two"><label>Hole<select class="pen-hole">${c.par.map((_, i) => `<option value="${i + 1}">${c.first_hole + i}</option>`).join("")}</select></label>
      <label>Strokes<input class="pen-strokes" inputmode="numeric" value="2"></label></div>
      <label>Reason<input class="pen-reason" placeholder="e.g. Late on the first tee"></label>
      <button class="btn small" data-act="add-pen" data-pid="${e.playerId}">Add penalty</button></details></div>`;
  const rows = done.map(([p, e]) => `
    <div class="card pl ${ui.expanded === e.playerId ? "open" : ""}">
      <button class="row plain" data-act="expand" data-pid="${e.playerId}">
        <div class="who"><span class="pos ${p.splace === 1 ? "p1" : ""}">${p.splace}</span><div><div class="name">${esc(p.name)}${p.penalty_total ? ` <span class="pen">pen +${p.penalty_total}</span>` : ""}</div>
          <div class="muted small">hcp ${fmtHcp(p.ph)} · ${esc(p.tee)}${p.skipped.some(Boolean) ? ` · from hole ${c.first_hole + p.from_hole - 1}` : ""}${p.filled.some(Boolean) ? ` · ${plural(p.filled.filter(Boolean).length, "hole")} counted ${NO_SCORE}` : ""}</div>${nineLine(M, p)}</div></div>
        <div class="nums"><span><b class="num">${p.gross === null ? "NR" : p.gross}</b><small>gross${p.topar !== null ? " " + fmtToPar(p.topar) : ""}</small></span>
          <span><b class="num">${p.net === null ? "NR" : p.net}</b><small>net</small></span><span class="acc"><b class="num">${p.pts}</b><small>pts</small></span></div></button>
      ${ui.expanded === e.playerId ? `<div class="chips">${chips(e)}</div>${editor(e)}${penalties(e)}` : ""}</div>`).join("");
  const missing = unfinished.map(e => {
    const holes = e.scores.map((v, i) => v === null && (e.fromHole || 1) - 1 <= i ? c.first_hole + i : null).filter(x => x !== null);
    return `<div class="card row warnrow"><div><div class="name">${esc(e.name)}</div><div class="muted small">missing hole${holes.length === 1 ? "" : "s"} ${holes.join(", ")}</div></div>
      <a class="btn small" href="#score/${rid}/${holes[0] - c.first_hole}">Enter</a></div>`;
  }).join("");
  const lg = S.leaguesOfRound(rid);
  const body = `
    ${missing ? `<h2>Not finished</h2>${missing}` : ""}
    ${rows ? `<h2>Stableford order</h2><p class="muted small" style="margin:-4px 4px 8px">Tap a player, then a hole, to change a score. The order holds still while you edit and settles when you save.</p>${rows}` : `<p class="muted center">No complete scorecards yet.</p>`}
    <h2>Round</h2>
    <div class="card row"><div class="small">Counts for <b>${lg.length ? lg.map(g => esc(g.name)).join(", ") : "no league"}</b></div><a class="btn small" href="#attach/${rid}">Change</a></div>
    <details class="card"><summary class="small">Name and date: ${esc(r.name)} · ${esc(r.date || "no date")}</summary>
      <form id="rdet"><label>Name<input name="name" value="${esc(r.name)}"></label><label>Played on<input name="date" type="date" value="${esc(r.date || "")}"></label>
      <button class="btn small" type="submit">Save details</button></form></details>`;
  const bar = `<a class="btn" href="#score/${rid}/${n - 1}">‹ Scoring</a>
    <button class="btn primary" data-act="save-round" ${M.field ? "" : "disabled"}>All correct, save ›</button>`;
  page("Check the scores", body, { back: `#score/${rid}/${S.holeOf(r)}`, bar, sub: `${r.name} · ${courseTitle(c)}`, keepScroll: keep });
  document.getElementById("rdet").addEventListener("submit", ev => {
    ev.preventDefault();
    r.name = ev.target.name.value.trim() || r.name;
    r.date = ev.target.date.value || null;
    S.saveRound(r); toast("Saved"); review(rid, true);
  });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const e = r.entries.find(x => x.playerId === b.dataset.pid);
    if (act === "expand") { ui.expanded = ui.expanded === e.playerId ? null : e.playerId; ui.selHole = null; return review(rid, true); }
    if (act === "sel-hole") { ui.expanded = e.playerId; ui.selHole = Number(b.dataset.h); return review(rid, true); }
    if (["ed", "ed-pick", "del-pen", "add-pen"].includes(act) && !S.roundOpen(r)) return toast("This round is frozen (entered more than 60 days ago)");
    if (act === "ed") {
      const i = ui.selHole, v = e.scores[i], par = c.par[i], d = Number(b.dataset.d);
      S.setScore(r, e, i, (v === null || v === 0) ? par : Math.max(1, Math.min(30, v + d))); return review(rid, true);
    }
    if (act === "ed-pick") { const i = ui.selHole; S.setScore(r, e, i, e.scores[i] === 0 ? c.par[i] : 0); return review(rid, true); }
    if (act === "del-pen") { e.penalties.splice(Number(b.dataset.k), 1); S.saveEntry(r, e); return review(rid, true); }
    if (act === "add-pen") {
      const box = b.closest(".pens");
      const hole = Number(box.querySelector(".pen-hole").value), strokes = Number(box.querySelector(".pen-strokes").value);
      if (!(strokes >= 1)) return toast("Penalty strokes must be 1 or more");
      e.penalties = e.penalties || [];
      e.penalties.push({ hole, strokes, reason: box.querySelector(".pen-reason").value.trim() });
      S.saveEntry(r, e); return review(rid, true);
    }
    if (act === "save-round") {
      if (unfinished.length && !confirm(`${plural(unfinished.length, "player")} ${unfinished.length === 1 ? "has" : "have"} holes with no score, which will count ${NO_SCORE} strokes each. Save anyway?`)) return;
      r.status = "done"; S.saveRound(r); go(`#graphics/${rid}`);
    }
  });
}

// ---------------------------------------------------------------- leagues a round counts for
function attach(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const mine = new Set(S.leaguesOfRound(rid).map(g => g.id));
  const list = S.leagues().map(g => `<label><input type="checkbox" data-act="toggle-league" data-gid="${g.id}" ${mine.has(g.id) ? "checked" : ""}> ${esc(g.name)}<span class="muted"> · ${plural(S.leagueRoundIds(g.id).length, "round")}</span></label>`).join("");
  const backTo = r.status === "done" ? `#graphics/${rid}` : `#review/${rid}`;
  page("Counts for", `
    <p class="muted small">${esc(r.name)}: tick the leagues this round counts for. Running totals and head-to-heads update on every phone.</p>
    <div class="card checks">${list || `<p class="muted">No leagues yet. Make one below.</p>`}</div>
    <form id="newg" class="card form open"><h2>New league</h2><label>Name<input name="name" placeholder="e.g. Apeliotes 2026" required></label>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="0"></label>
      <button class="btn" type="submit">Create and add this round</button></form>`,
  { back: backTo, bar: `<a class="btn primary" href="${backTo}">Done ›</a>` });
  bind(ev => {
    const b = ev.target.closest("[data-act=toggle-league]");
    if (b) { S.setLeagueRound(b.dataset.gid, rid, b.checked); if (b.checked) S.setSetting("lastLeague", b.dataset.gid); }
  });
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = S.createLeague(ev.target.name.value.trim() || "League", ev.target.bestN.value, S.me() ? S.me().name : null);
    S.setLeagueRound(g.id, rid, true);
    S.setSetting("lastLeague", g.id);
    attach(rid);
  });
}

// ---------------------------------------------------------------- graphics
function themeChips(selected) {
  return DATA.themes.map(t => `<label class="tchip ${selected.includes(t.name) ? "on" : ""}" style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT};--tink:${t.INK}">
    <input type="checkbox" name="theme" value="${t.name}" ${selected.includes(t.name) ? "checked" : ""}><span class="sw"><b>${esc(t.name.toUpperCase())}</b></span>${esc(t.name)}</label>`).join("");
}

function graphics(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) { return page("Graphics", `<div class="banner warn">${esc(err.message)}</div>`, { back: `#review/${rid}` }); }
  const themes = (S.state.settings.themes || ["navy"]).slice(0, 1);
  const leagues = S.leaguesOfRound(rid);
  const body = `
    <div class="list"><a href="#review/${rid}"><div><div class="name">Scores</div><div class="muted small">${plural(M.field, "player")} on the boards${M.unfinished.length ? ` · ${M.unfinished.length} with no scores left out` : ""}</div></div><span class="chev">›</span></a>
      <a href="#attach/${rid}"><div><div class="name">Leagues</div><div class="muted small">${leagues.length ? "counts for " + leagues.map(g => esc(g.name)).join(", ") : "not in a league yet"}</div></div><span class="chev">›</span></a></div>
    <h2>Which graphics</h2>
    <div class="card checks">
      <label><input type="checkbox" name="g" value="stbl" checked> Stableford leaderboard</label>
      <label><input type="checkbox" name="g" value="gross"> Gross leaderboard</label>
      <label><input type="checkbox" name="g" value="holes"> How the holes played</label>
      <label><input type="checkbox" name="g" value="cards"> Player cards <span class="muted">&nbsp;(${M.field})</span></label>
      <details><summary class="muted small">Only some players' cards</summary>${M.players.map(p => `<label><input type="checkbox" name="card" value="${esc(p.name)}" checked> ${esc(p.name)}</label>`).join("")}</details>
      <button class="btn small" type="button" data-act="tick-all">Everything, every theme</button>
    </div>
    <h2>Theme</h2>
    <div class="themes">${themeChips(themes)}</div>
    <div id="out"></div>`;
  const bar = `<button class="btn primary" data-act="generate">Generate images</button>`;
  page("Graphics", body, { back: "#home", bar, sub: r.name });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tick-all") {
      document.querySelectorAll("input[name=g], input[name=theme]").forEach(i => { i.checked = true; });
      document.querySelectorAll(".tchip").forEach(l => l.classList.add("on"));
      return;
    }
    if (b.dataset.act !== "generate") return;
    const want = [...document.querySelectorAll("input[name=g]:checked")].map(i => i.value);
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value);
    const cardNames = [...document.querySelectorAll("input[name=card]:checked")].map(i => i.value);
    if (!want.length) return toast("Tick at least one graphic");
    if (!chosen.length) return toast("Pick at least one theme");
    S.setSetting("themes", chosen);
    const jobs = [];
    for (const tn of chosen) {
      const T = makeTheme(DATA.themes.find(t => t.name === tn));
      const prefix = chosen.length > 1 ? `${tn}/` : "";
      if (want.includes("gross")) jobs.push({ label: `${prefix}1_leaderboard_gross.png`, make: () => grossLeaderboard(M, T) });
      if (want.includes("stbl")) jobs.push({ label: `${prefix}2_leaderboard_stableford.png`, make: () => stablefordLeaderboard(M, T) });
      if (want.includes("holes")) jobs.push({ label: `${prefix}3_holes.png`, make: () => holesPoster(M, T) });
      if (want.includes("cards")) for (const p of M.players.filter(p => cardNames.includes(p.name))) jobs.push({ label: `${prefix}${renderCards(M, T, [p.name])[0].file}`, make: () => renderCards(M, T, [p.name])[0].fig });
    }
    await runJobs(jobs, slugFile(r.name));
  });
  app.querySelector(".themes").addEventListener("change", ev => { const l = ev.target.closest(".tchip"); if (l) l.classList.toggle("on", ev.target.checked); });
}

function slugFile(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "round";
}

/** Renders jobs one by one with a progress line, then shows thumbnails with save buttons. */
async function runJobs(jobs, prefix) {
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
    <div class="saveall"><button class="btn primary" data-act="save-all">${canShareFiles() ? "Save all to phone (share sheet)" : "Download all"}</button>
      <div class="muted small">${canShareFiles() ? "Choose “Save Image” or “Save to Files” in the sheet. " : ""}Or save one at a time below; you can also long-press an image.</div></div>
    <div class="thumbs">${results.map((x, i) => x.blob ? `
      <figure><img src="${x.thumbUrl}" alt="${esc(x.label)}" data-act="open" data-i="${i}"><figcaption>${esc(x.label)} <span class="muted">${x.w}×${x.h}</span>
        <button class="btn small" data-act="save-one" data-i="${i}">Save</button></figcaption></figure>`
      : `<figure class="err"><figcaption>${esc(x.label)}: ${esc(x.error)}</figcaption></figure>`).join("")}</div>`;
  out.onclick = async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "save-all") await saveFiles(ok.map(x => toFile(x, prefix)), prefix);
    if (b.dataset.act === "save-one") await saveFiles([toFile(results[Number(b.dataset.i)], prefix)], prefix);
    if (b.dataset.act === "open") { const x = results[Number(b.dataset.i)]; window.open(URL.createObjectURL(x.blob), "_blank"); }
  };
  out.scrollIntoView({ behavior: "smooth" });
}

async function thumbnail(fig) {
  const w = 720, h = Math.round(fig.canvas.height * w / fig.canvas.width);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(fig.canvas, 0, 0, w, h);
  return cv.convertToBlob ? cv.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : new Promise(res => cv.toBlob(res, "image/jpeg", 0.85));
}

function toFile(x, prefix) {
  return new File([x.blob], `${prefix}_${x.label.replace(/\//g, "_")}`, { type: "image/png" });
}

function canShareFiles() {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch (e) { return false; }
}

async function saveFiles(files, title) {
  if (canShareFiles() && navigator.canShare({ files })) {
    try { await navigator.share({ files, title }); return; } catch (err) { if (err.name === "AbortError") return; console.warn(err); }
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
  toast(files.length === 1 ? "Saved to your downloads" : `${files.length} files sent to your downloads`);
}

// ---------------------------------------------------------------- nines walked, across every round
/**
 * Every nine a set of rounds contains, each one lifted out and re-scored on its own card and rating
 * (see computeNine): a loop walked as half of an 18 lands on exactly the same footing as the same loop
 * walked on its own, which is the only way an average over both means anything. For what a player
 * actually scored on the day, the round's own screens use halves() instead.
 */
function ninesPlayed(rounds, pid = null) {
  const out = new Map();
  for (const r of rounds) {
    if (r.status !== "done") continue;
    const c = courseBy(r.course);
    const nines = (c && c.nines) || [];
    if (!nines.length || c.n !== nines.length * 9) continue;
    nines.forEach((slug, i) => {
      const nc = courseBy(slug);
      if (!nc) return;
      let N;
      try { N = computeNine(nc, S.toModelRound(r), i * 9); } catch (e) { return; }  // e.g. the nine cannot rate that tee
      for (const p of N.players) {
        if (pid && p.id !== pid) continue;
        if (!out.has(slug)) out.set(slug, { slug, rows: [] });
        out.get(slug).rows.push({ round: r, player: p, field: N.field });
      }
    });
  }
  return [...out.values()].map(x => {
    const gs = x.rows.map(r => r.player.gross).filter(g => g !== null);
    const pts = x.rows.map(r => r.player.pts);
    return { ...x, played: x.rows.length, bestGross: gs.length ? Math.min(...gs) : null,
      avgGross: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
      bestPts: pts.length ? Math.max(...pts) : null,
      avgPts: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null };
  }).sort((a, b) => b.played - a.played || nineName(a.slug).localeCompare(nineName(b.slug)));
}

// ---------------------------------------------------------------- one player: their rounds and their form
/** Every finished round a player has a result in, newest first, with that player's line from it. */
function playerRounds(pid) {
  const out = [];
  for (const r of S.roundsOf(pid)) {
    if (r.status !== "done") continue;
    const M = safeCompute(r);
    const x = M && M.players.find(q => q.id === pid);
    if (x) out.push({ r, M, x });
  }
  return out;
}

function player(id) {
  const p = S.state.players.find(x => x.id === id && !x.deleted);
  if (!p) return go("#roster");
  const me = S.me();
  const isMe = !!me && me.id === p.id;
  const rs = playerRounds(p.id);
  const pts = rs.map(o => o.x.pts);
  const grosses = rs.map(o => o.x.gross).filter(g => g !== null);
  const wins = rs.filter(o => o.x.splace === 1).length;
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const stats = rs.length ? `<div class="mecard"><div class="stats">
      ${tile(rs.length, plural(rs.length, "round").split(" ")[1])}
      ${tile(Math.max(...pts), "best pts")}
      ${tile(fix(pts.reduce((a, b) => a + b, 0) / pts.length), "average")}
      ${grosses.length ? tile(Math.min(...grosses), "best gross") : ""}
      ${wins ? tile(wins, plural(wins, "win").split(" ")[1]) : ""}
    </div></div>` : "";
  const leagueLines = S.leagues().map(g => {
    const { S: Sx } = leagueResults(g);
    const row = Sx.rows.find(r => r.id === p.id);
    return row ? `<a href="#league/${g.id}"><div><div class="name">${esc(g.name)}</div><div class="muted small">${plural(row.played, "round")} counted</div></div>
      <span class="pill done">${ordinal(row.place)} · ${row.counted} pts</span></a>` : "";
  }).filter(Boolean).join("");
  const list = rs.map(({ r, M, x }) => {
    const c = courseBy(r.course);
    const H = halves(M, x);  // what each nine actually scored that day, not re-scored
    const split = H && H.length > 1 ? `<div class="nines">${H.map(h => `<span><b>${esc(nineName(h.slug))}</b> ${h.gross === null ? "–" : `${h.gross} ${fmtToPar(h.topar)}`} · ${h.pts} pts</span>`).join("")}</div>` : "";
    return `<div class="rround card">
      <a href="#review/${r.id}" style="display:block">
        <div class="d">${esc(fmtDate(r.date))}</div><div class="name">${esc(c ? c.loop || c.name : r.name)}</div>
        <div class="res"><span class="big num">${x.pts}<small>pts</small></span>
          <span class="muted">${ordinal(x.splace)} of ${M.field}${x.gross !== null ? ` · gross ${x.gross} ${fmtToPar(x.topar)}` : " · no return"}</span></div>
        ${split}
      </a>
      <button class="btn small" data-act="my-card" data-rid="${r.id}" data-pid="${p.id}">Save card</button></div>`;
  }).join("");
  const nines = ninesPlayed(S.roundsOf(p.id), p.id);
  const ninesBlock = nines.length ? `<h2>Nines walked</h2>
    <p class="muted small" style="margin:-4px 4px 8px">Each loop scored on its own card and rating, whether it was walked alone or as half of an 18, so these compare.</p>
    <table class="stand"><thead><tr><th class="l">Loop</th><th>Walked</th><th>Best</th><th>Avg gross</th><th>Avg pts</th></tr></thead>
      <tbody>${nines.map(x => `<tr><td class="l">${esc(nineName(x.slug))}</td><td>${x.played}</td><td>${x.bestGross === null ? "–" : x.bestGross}</td>
        <td>${x.avgGross === null ? "–" : fix(x.avgGross)}</td><td class="acc">${fix(x.avgPts)}</td></tr>`).join("")}</tbody></table>` : "";
  page(isMe ? "My rounds" : p.name, `
    <div class="hero"><p class="hi">${esc(p.name)}</p><div class="muted small">index ${fmtIndex(Number(p.hi))} · ${p.gender === "f" ? "women's rating" : "men's rating"} · ${plural(rs.length, "round")}</div></div>
    ${stats}
    ${leagueLines ? `<h2>Leagues</h2><div class="list">${leagueLines}</div>` : ""}
    ${ninesBlock}
    <h2>Rounds</h2>
    ${list || `<p class="muted center">No finished rounds yet.</p>`}
    <details class="card"><summary class="small">Name, index and rating</summary>
      <form class="form open" id="pform"><label>Name<input name="name" value="${esc(p.name)}" autocapitalize="words" required></label>
        <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" value="${fmtIndex(Number(p.hi))}"></label>
        <label>Rating<select name="gender"><option value="m" ${p.gender !== "f" ? "selected" : ""}>Men's</option><option value="f" ${p.gender === "f" ? "selected" : ""}>Women's</option></select></label></div>
        <div class="two"><button class="btn primary" type="submit">Save</button>${rs.length || !organiser() ? "" : `<button class="btn danger" type="button" data-act="del-player" data-id="${p.id}">Delete</button>`}</div></form></details>`,
    { back: isMe ? "#home" : "#roster" });
  bind(async ev => {
    const b = ev.target.closest("[data-act=my-card]");
    if (b) await myCard(b.dataset.rid, b.dataset.pid);
  });
  document.getElementById("pform").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, hi = parseHI(f.hi.value);
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54");
    const other = S.findPlayer(f.name.value);
    if (other && other.id !== p.id) return toast("Another player already has that name");
    if (hi !== p.hi) p.hiUpdated = new Date().toISOString();
    p.hi = hi; p.gender = f.gender.value;
    if (f.name.value.trim() !== p.name) S.renamePlayer(p, f.name.value); else { S.touch("players", p); S.save(); }
    toast("Saved"); player(id);
  });
}

// ---------------------------------------------------------------- roster
function roster() {
  const me = S.me();
  const ps = S.players().sort((a, b) => a.name.localeCompare(b.name));
  const rows = ps.map(p => {
    const k = S.roundsOf(p.id).filter(r => r.status === "done").length;
    return `<a href="#player/${p.id}"><div><div class="name">${esc(p.name)}${me && p.id === me.id ? ` <span class="pill done">you</span>` : ""}</div>
      <div class="muted small">index ${fmtIndex(Number(p.hi))} · ${plural(k, "round")}</div></div><span class="chev">›</span></a>`;
  }).join("");
  page("Players", `${me ? `<a class="btn primary big" href="#player/${me.id}">My rounds ›</a>` : ""}
    <p class="muted small" style="margin:10px 4px 0">Everyone who has played, on every phone. Tap a name for their rounds and to edit them.</p>
    ${rows ? `<div class="list">${rows}</div>` : `<p class="muted center">No players yet.</p>`}
    <form id="newp" class="card form open"><h2>Add a player</h2><label>Name<input name="name" autocapitalize="words" required></label>
      <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" placeholder="18,4" required></label>
      <label>Rating<select name="gender"><option value="m">Men's</option><option value="f">Women's</option></select></label></div>
      <button class="btn primary" type="submit">Add</button></form>`, { back: "", tabs: "players" });
  document.getElementById("newp").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, hi = parseHI(f.hi.value);
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54");
    if (S.findPlayer(f.name.value)) return toast("That player already exists");
    S.upsertPlayer(f.name.value, hi, f.gender.value); roster();
  });
}

// ---------------------------------------------------------------- leagues
function leagues() {
  const me = S.me();
  const rows = S.leagues().map(g => {
    const { S: Sx } = leagueResults(g);
    const mine = me ? Sx.rows.find(r => r.id === me.id) : null;
    const fmts = S.cleanFormats(g.formats).map(f => FORMAT_NAMES[f]).join(" · ");
    return `<a href="#league/${g.id}"><div><div class="name">${esc(g.name)}</div><div class="muted small">${plural(S.leagueRoundIds(g.id).length, "round")} · ${fmts}${Sx.rows[0] ? ` · leader ${esc(Sx.rows[0].name)}` : ""}</div></div>
      ${mine ? `<span class="pill done">${ordinal(mine.place)} · ${mine.counted} pts</span>` : `<span class="chev">›</span>`}</a>`;
  }).join("");
  page("Leagues", `
    ${rows ? `<div class="list">${rows}</div>` : `<p class="muted center" style="margin:24px 0">No leagues yet. A league is a running table over the rounds you add to it.</p>`}
    <button class="btn addbtn" data-act="toggle-newg"><span class="plus">+</span> New league</button>
    <form id="newg" class="card form"><h2>New league</h2><label style="margin-top:0">Name<input name="name" placeholder="e.g. Apeliotes 2026" required></label>
      <label>Scored by <span class="muted">(the first one is what the league opens on)</span></label>
      <div class="fmtlist">${S.FORMATS.map(f => `<label><input type="checkbox" name="fmt" value="${f}" ${f === "stableford" ? "checked" : ""}> <span><b>${FORMAT_NAMES[f]}</b><small>${FORMAT_BLURB[f]}</small></span></label>`).join("")}</div>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="0"></label>
      <button class="btn primary" type="submit">Create</button></form>`, { back: "", tabs: "leagues" });
  bind(ev => {
    const b = ev.target.closest("[data-act=toggle-newg]");
    if (b) { document.getElementById("newg").classList.add("open"); b.classList.add("hidden"); document.querySelector("#newg input[name=name]").focus(); }
  });
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const fmts = [...ev.target.querySelectorAll("input[name=fmt]:checked")].map(i => i.value);
    const g = S.createLeague(ev.target.name.value.trim() || "League", ev.target.bestN.value, S.me() ? S.me().name : null, fmts);
    go(`#league/${g.id}`);
  });
}

/** Computed rounds attached to a league (finished ones), the players in them, and the standings. */
function leagueResults(g) {
  const ids = new Set(S.leagueRoundIds(g.id));
  const Ms = [];
  for (const r of S.rounds().filter(r => ids.has(r.id) && r.status === "done")) {
    const M = safeCompute(r);
    if (M) Ms.push(M);
  }
  const members = [...new Set(Ms.flatMap(M => M.players.map(p => p.id)).filter(Boolean))];
  return { Ms, members, S: standings(Ms, members, g.bestN) };
}

const LEAGUE_TABS = [["standings", "Standings"], ["stats", "Stats"], ["nines", "Nines"], ["h2h", "Head to head"], ["players", "Players"], ["rounds", "Rounds"], ["settings", "Settings"]];

/** The standings for one way of scoring a league. Every screen and every poster goes through here. */
function standingsFor(g, Ms, members, kind) {
  if (kind === "stroke") return strokeStandings(Ms, members, g.bestN);
  if (kind === "gp") return gpStandings(Ms, members, g.bestN);
  if (kind in MATCH_BASIS) return matchStandings(Ms, members, kind.startsWith("soccer") ? 3 : 2, 1, MATCH_BASIS[kind]);
  return standings(Ms, members, g.bestN);
}

function standingsTable(kind, S, g, me) {
  const rows = S.rows;
  const mark = r => me && r.id === me.id ? "acc" : "";
  if (!rows.length) return `<p class="muted center">Nothing to rank yet.</p>`;
  if (kind === "stableford") return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Points"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`;
  if (kind === "gp") return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Points"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`;
  if (kind === "stroke") return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Net ±"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}${r.nr ? ` <span class="muted small">(${r.nr} NR)</span>` : ""}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best === null ? "–" : fmtToPar(r.best)}</td><td>${r.played ? fmtToPar(Math.round(r.avg * 10) / 10) : "–"}</td><td class="acc">${r.played ? fmtToPar(r.counted) : "–"}</td></tr>`).join("")}</tbody></table>`;
  return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Up</th><th>Pts</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.up > 0 ? "+" : ""}${r.up}</td><td class="acc">${r.points}</td></tr>`).join("")}</tbody></table>`;
}

// ---------------------------------------------------------------- stats: what a pile of rounds says
// Six score colours, good to bad, with par as the neutral in the middle: a diverging scale, and the only
// place in the app where colour carries the meaning on its own, so every reading is labelled beside it.
const BUCKET_KEY = SCORE_BUCKETS.map(b => b.key);
const shortDate = d => { const t = d ? new Date(d + "T12:00:00") : null; return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : (d || "–"); };
const pct = (v, t) => t ? Math.round((v / t) * 100) : 0;
const sumc = cs => cs.reduce((a, b) => a + b, 0);
const parOrBetter = x => x.counts[0] + x.counts[1] + x.counts[2];
const whereName = w => String(w || "").replace(/, 9 holes$/, "");

/** Part to whole at a glance: one ring, six segments, a gap of surface between them, the headline in the hole. */
function donut(counts, big, small) {
  const total = sumc(counts), R = 56, W = 22, C = 2 * Math.PI * R;  // a narrower ring leaves the hole wide enough for the headline
  const shown = counts.filter(v => v > 0).length;
  let off = 0;
  const arcs = counts.map((v, k) => {
    if (!v) return "";
    const len = (C * v) / total, on = Math.max(len - (shown > 1 ? 2 : 0), 0.6);
    const seg = `<circle class="dseg ${BUCKET_KEY[k]}" cx="70" cy="70" r="${R}" stroke-width="${W}" stroke-dasharray="${on} ${C - on}" stroke-dashoffset="${-off}"></circle>`;
    off += len;
    return seg;
  }).join("");
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Scoring distribution, given as numbers beside it">
    <g transform="rotate(-90 70 70)">${total ? arcs : `<circle class="dseg par" cx="70" cy="70" r="${R}" stroke-width="${W}"></circle>`}</g>
    <text class="dbig" x="70" y="70">${esc(big)}</text><text class="dsmall" x="70" y="89">${esc(small)}</text></svg>`;
}

/** The donut's table view: every bucket with its count and its share, so nothing rests on colour. */
function donutKey(counts, per = 0, unit = "round") {
  const total = sumc(counts);
  return `<ul class="dkey">${SCORE_BUCKETS.map((b, k) => `<li class="${counts[k] ? "" : "off"}"><i class="${b.key}"></i>
    <span>${b.label}</span><b class="num">${counts[k]}</b>
    <small>${counts[k] ? `${pct(counts[k], total)}%${per ? ` · ${fix(counts[k] / per)} a ${unit}` : ""}` : "&mdash;"}</small></li>`).join("")}</ul>`;
}

/** The same six colours named in one line, for the bars that sit far below the ring. */
function inlineKey() {
  return `<div class="dkeyline">${SCORE_BUCKETS.map(b => `<span><i class="${b.key}"></i>${b.short}</span>`).join("")}</div>`;
}

/** The same six numbers as one bar, for comparing players down a column. */
function distBar(counts) {
  const total = sumc(counts);
  return `<div class="dbar">${counts.map((v, k) => v ? `<i class="${BUCKET_KEY[k]}" style="width:${(v / total) * 100}%"></i>` : "").join("")}</div>`;
}

/** One reading against another, the bar underneath filled in their proportion. Used for player against field. */
function tapeRow(label, va, vb, lower = false, fmtv = v => v) {
  if (va === null || va === undefined || vb === null || vb === undefined) return "";
  // both readings shifted clear of zero first, so a score under par (a negative) still fills the right way
  const s = 1 - Math.min(va, vb, 0), a = va + s, b = vb + s;
  const share = lower ? ((1 / a) / (1 / a + 1 / b)) * 100 : (a / (a + b)) * 100;
  const lead = va === vb ? "" : (lower ? va < vb : va > vb) ? "a" : "b";
  return `<div class="tape"><b class="${lead === "a" ? "win" : ""}">${fmtv(va)}</b><span>${label}</span><b class="${lead === "b" ? "win" : ""}">${fmtv(vb)}</b>
    <div class="tbar"><i style="width:${share}%"></i></div></div>`;
}

/** True when these rounds are not all the same number of holes, which points a round cannot survive. */
const mixedLengths = rs => new Set(rs.map(r => r.n)).size > 1;

/** Points round by round, oldest first, with what the rest of the league scored that day as a column behind. */
function formChart(rs, who) {
  const mixed = mixedLengths(rs), any = rs.some(r => r.fieldPts !== null);
  const val = r => mixed ? r.pts / r.n : r.pts;  // a hole at a time when nine- and eighteen-hole rounds are side by side
  const fld = r => r.fieldPts === null ? null : (mixed ? r.fieldPts / r.n : r.fieldPts);
  const top = Math.max(...rs.map(r => Math.max(val(r), fld(r) || 0)), 0.01);
  const cols = rs.map(r => {
    const h = (val(r) / top) * 88, f = fld(r) === null ? null : (fld(r) / top) * 88;
    const title = `${fmtDate(r.date)} · ${whereName(r.where)} · ${r.pts} points over ${plural(r.n, "hole")}${r.fieldPts === null ? "" : `, the rest of the field ${fix(r.fieldPts)}`}`;
    return `<a class="fcol" href="#review/${r.id}" title="${esc(title)}">
      <div class="fplot">${rs.length <= 10 ? `<b class="fval num" style="bottom:calc(${h}% + 2px)">${mixed ? fix(val(r), 2) : r.pts}</b>` : ""}
        ${f === null ? "" : `<i class="fghost" style="height:${f}%"></i>`}<i class="fbar" style="height:${h}%"></i></div>
      <small>${esc(shortDate(r.date))}</small></a>`;
  }).join("");
  return `<div class="card"><div class="fchart">${cols}</div>
    <p class="muted small center" style="margin:8px 0 0">${esc(who)}'s points ${mixed ? "a hole" : "in each round"}, oldest first.${any ? " The grey column behind each bar is what the rest of the field scored that day." : ""} Tap a round for its card.</p></div>`;
}

/** A table row of holes of one kind: how many, what they were played in, what they paid. */
function parRow(label, x) {
  if (!x || !x.holes) return "";
  return `<tr><td class="l">${label}</td><td>${x.holes}</td><td>${fix(x.avg, 2)}</td><td>${fmtSigned(x.vspar, 2)}</td>
    <td class="acc">${fix(x.pts, 2)}</td><td>${pct(x.counts[0] + x.counts[1], x.holes)}%</td></tr>`;
}

const PAR_TABLE_HEAD = `<thead><tr><th class="l">Holes</th><th>Played</th><th>Avg</th><th>Vs par</th><th>Pts</th><th>Birdie+</th></tr></thead>`;
// a stats table never wraps a heading or a row label: the numbers are what has to line up
const PAR_TABLE = `<table class="stand partab">`;
const parRows = x => Object.keys(x.byPar).sort().map(k => parRow(`Par ${k}`, x.byPar[k])).join("");
const everyHoleRow = x => `<tr class="tot"><td class="l">Every hole</td><td>${x.holes}</td><td>${fix(x.avg, 2)}</td><td>${fmtSigned(x.vspar, 2)}</td>
  <td class="acc">${fix(x.pts, 2)}</td><td>${pct(x.counts[0] + x.counts[1], x.holes)}%</td></tr>`;
const BANDS = ["Hardest third", "Middle third", "Easiest third"];

/** The league as one field: how everybody together plays a hole, and the records they have set. */
function fieldStats(St) {
  const F = St.field;
  const rec = (label, r, value) => r ? `<a class="kv" href="#review/${r.id}"><span>${label}</span>
    <span class="muted">${esc(firstName(r.player))} · ${value} · ${esc(shortDate(r.date))}</span></a>` : "";
  const courses = [...new Set(St.holes.map(h => h.where))];
  const dist = [...St.players].sort((a, b) => pct(parOrBetter(b), b.holes) - pct(parOrBetter(a), a.holes) || a.name.localeCompare(b.name))
    .map(p => `<div class="drow"><div class="dname">${esc(p.name)}<small class="muted">${pct(parOrBetter(p), p.holes)}% par or better</small></div>${distBar(p.counts)}</div>`).join("");
  const hard = (xs, cls) => `<table class="stand partab"><thead><tr><th class="l">Hole</th><th>Par</th><th>SI</th><th>Cards</th><th>Vs par</th><th>Pts</th></tr></thead><tbody>
    ${xs.map(h => `<tr><td class="l">${esc(h.label)}${courses.length > 1 ? ` <span class="muted small">${esc(h.where)}</span>` : ""}</td><td>${h.par}</td><td>${h.si}</td><td>${h.n}</td>
      <td class="${cls}">${fmtSigned(h.vspar, 2)}</td><td>${fix(h.pts, 2)}</td></tr>`).join("")}</tbody></table>`;
  return `
    <div class="card statcard">
      <div class="dwrap">${donut(F.counts, `${pct(parOrBetter(F), F.holes)}%`, "par or better")}${donutKey(F.counts, F.cards, "card")}</div>
      <p class="muted small" style="margin:10px 0 0">Every hole this league has walked: ${plural(F.holes, "hole")} over ${plural(F.cards, "card")} and ${plural(F.rounds, "round")}.
        A card is worth ${fix(F.avgPts)} points, and a hole is played in ${fmtSigned(F.vspar, 2)} against par.</p>
    </div>
    <h2>Par 3s, 4s and 5s</h2>
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${parRows(F)}${everyHoleRow(F)}</tbody></table>
    <p class="muted small" style="margin:6px 4px 0">The field's average on each kind of hole. Points are Stableford, so 2 is the handicap's par.</p>
    <h2>Easy holes and hard ones</h2>
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${F.bands.map((b, i) => parRow(BANDS[i], b)).join("")}</tbody></table>
    <p class="muted small" style="margin:6px 4px 0">Split by stroke index on each card, so the hardest third of a nine is its three lowest-index holes.
      Those are also where the strokes are given, which is why they usually pay the most points.</p>
    <h2>Who scores what</h2>
    <div class="card dists">${inlineKey()}${dist}</div>
    <h2>Records</h2>
    <div class="card">
      ${rec("Best round", F.bestRound, `${F.bestRound ? F.bestRound.pts : ""} pts`)}
      ${rec("Best against par", F.lowRound, F.lowRound ? `${F.lowRound.gross} (${fmtToPar(F.lowRound.topar)})` : "")}
      ${rec("Most birdies", F.mostBirdies && F.mostBirdies.birdies > 1 ? F.mostBirdies : null, F.mostBirdies ? plural(F.mostBirdies.birdies, "birdie") : "")}
      ${F.bounce === null ? "" : `<div class="kv"><span>Bounce back</span><span class="muted">${Math.round(F.bounce * 100)}% of the holes after a bogey or worse were played in par or better</span></div>`}
    </div>
    <h2>The holes that hurt</h2>
    ${courses.length > 1 ? "" : `<p class="muted small" style="margin:-4px 4px 8px">${esc(whereName(courses[0] || ""))}</p>`}
    ${hard(F.hardest, "warn")}
    <p class="muted small" style="margin:8px 4px 0">Holes this league has played at least twice, by how far over par they were played.</p>
    <details class="card" style="margin-top:10px"><summary class="small">The holes that give shots back</summary>${hard(F.easiest, "acc")}</details>`;
}

/** One player: their own shape, then the same numbers for the rest of the field on exactly the days they were there. */
function playerStats(St, p) {
  const R = p.rest, one = p.played === 1, first = firstName(p.name);
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const rec = (label, r, value) => r ? `<a class="kv" href="#review/${r.id}"><span>${label}</span>
    <span class="muted">${value} · ${esc(whereName(r.where))} · ${esc(shortDate(r.date))}</span></a>` : "";
  const line = (label, value) => `<div class="kv"><span>${label}</span><span class="muted">${value}</span></div>`;
  const per = k => p.played ? p.counts[k] / p.played : 0;
  const birdies = p.counts[0] + p.counts[1];
  // a split of a handful of holes is noise at two decimals, so it only earns a row once there are six of them
  const enough = (a, b) => a && b && a.holes >= 6 && b.holes >= 6;
  const vsField = !R.holes ? `<p class="muted small" style="margin:0 4px">${esc(first)} has not yet shared a round in this league with anyone else, so there is nothing to measure against.</p>` : `
    <div class="card tapes mine">
      ${tapeRow("points a round", p.avgPts, R.pts * (p.holes / p.played), false, v => fix(v))}
      ${tapeRow("points a hole", p.pts, R.pts, false, v => fix(v, 2))}
      ${tapeRow("strokes against par", p.vspar, R.vspar, true, v => fmtSigned(v, 2))}
      ${tapeRow("par or better", pct(parOrBetter(p), p.holes), pct(parOrBetter(R), R.holes), false, v => `${v}%`)}
      ${tapeRow("birdies or better", pct(birdies, p.holes), pct(R.counts[0] + R.counts[1], R.holes), false, v => `${v}%`)}
      ${tapeRow("double or worse", pct(p.counts[4] + p.counts[5], p.holes), pct(R.counts[4] + R.counts[5], R.holes), true, v => `${v}%`)}
      ${Object.keys(p.byPar).map(k => enough(p.byPar[k], R.byPar[k]) ? tapeRow(`points on par ${k}s`, p.byPar[k].pts, R.byPar[k].pts, false, v => fix(v, 2)) : "").join("")}
      ${enough(p.bands[0], R.bands[0]) ? tapeRow("points on the hardest third", p.bands[0].pts, R.bands[0].pts, false, v => fix(v, 2)) : ""}
    </div>
    <p class="muted small" style="margin:6px 4px 0">${esc(first)} on the left, everyone else in this league on the right, over the ${plural(p.played, "round")} they played together.
      ${p.vsField === null ? "" : (p.beatOf === 1
        ? `${esc(first)} ${p.beat ? "beat" : "did not beat"} the rest of the field in the one round they have shared.`
        : `${esc(first)} beat them in ${p.beat} of those ${p.beatOf} rounds, ${p.vsField >= 0 ? `${fix(p.vsField)} points up overall` : `${fix(-p.vsField)} points behind overall`}.`)}
      ${mixedLengths(p.rounds) ? "This league mixes nine- and eighteen-hole rounds, so compare the numbers given a hole at a time rather than a round at a time." : ""}</p>`;
  return `
    <div class="mecard"><div class="stats">
      ${tile(p.played, plural(p.played, "round").split(" ")[1])}
      ${tile(fix(p.avgPts), "avg pts")}
      ${one ? "" : tile(p.bestPts, "best")}
      ${p.returns ? tile(fmtToPar(Math.round(p.avgTopar)), "avg to par") : ""}
      ${p.wins ? tile(p.wins, plural(p.wins, "win").split(" ")[1]) : ""}
    </div></div>
    <div class="card statcard">
      <div class="dwrap">${donut(p.counts, `${pct(parOrBetter(p), p.holes)}%`, "par or better")}${donutKey(p.counts, p.played, "round")}</div>
      <p class="muted small" style="margin:10px 0 0">${plural(p.holes, "hole")} in this league. ${esc(first)} ${birdies ? `makes ${fix(birdies / p.played)} birdies or better` : "has yet to make a birdie"}
        and ${fix(per(2))} pars a round, and plays a hole in ${fmtSigned(p.vspar, 2)} against par.</p>
    </div>
    <h2>Against the field</h2>
    ${vsField}
    ${rivalsBlock(St, p)}
    ${one ? "" : `<h2>Round by round</h2>${formChart(p.rounds, first)}`}
    ${one ? `<p class="muted small" style="margin:14px 4px">Form and consistency appear once ${esc(first)} has played a second round here.</p>` : `<h2>Over more than one round</h2><div class="card">
      ${line("Consistency", `${fix(p.consistency)} points either side of their average${mixedLengths(p.rounds) ? ", though this league mixes round lengths" : ""}`)}
      ${p.form === null ? "" : line("Form", `${fix(p.form)} points over the last three, against ${fix(p.avgPts)} across every round`)}
      ${p.trend === null ? "" : line("Trend", `${fmtSigned(p.trend)} points from the first half of their rounds to the second`)}
      ${p.streak ? line("Streak", `above the rest of the field in the last ${plural(p.streak, "round")}`) : ""}
      ${line("Finishing", `${fix(p.firstHalf, 2)} points a hole in the first half of a round, ${fix(p.lastHalf, 2)} in the second`)}
      ${p.bounce === null ? "" : line("Bounce back", `${Math.round(p.bounce * 100)}% of the ${p.bounceOf} holes after a bogey or worse were played in par or better`)}
      ${line("Blow-ups", `${fix(p.blowups)} doubles or worse a round`)}
      ${line("Where they finish", `${ordinal(Math.round(p.avgPlace))} on average in this league${p.podiums ? `; ${p.podiums} of their ${plural(p.played, "round")} were in the top three` : ""}`)}
      ${p.penalties ? line("Penalty strokes", String(p.penalties)) : ""}
      ${p.counted10 ? line(`Holes counted ${NO_SCORE}`, String(p.counted10)) : ""}
    </div>`}
    <h2>Par 3s, 4s and 5s</h2>
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${parRows(p)}${everyHoleRow(p)}</tbody></table>
    <h2>Easy holes and hard ones</h2>
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${p.bands.map((b, i) => parRow(BANDS[i], b)).join("")}</tbody></table>
    <h2>${esc(first)} in this league</h2>
    <div class="card">
      ${rec("Best round", p.bestRound, p.bestRound ? `${p.bestRound.pts} pts` : "")}
      ${rec("Best against par", p.lowRound, p.lowRound ? `${p.lowRound.gross} (${fmtToPar(p.lowRound.topar)})` : "")}
      ${rec("Most birdies", p.mostBirdies && p.mostBirdies.birdies > 1 ? p.mostBirdies : null, p.mostBirdies ? plural(p.mostBirdies.birdies, "birdie") : "")}
      ${one ? "" : line("Best and worst", `${p.bestPts} points at best, ${p.worstPts} at worst`)}
    </div>`;
}

/** What the numbers add up to in words, hedged to what a handful of rounds can honestly carry. */
function rivalVerdict(r, me, them) {
  const bits = [];
  const l = r.lift === null ? null : r.lift * (r.scale || 18);  // a round's worth, so the threshold means something
  if (l !== null) {
    bits.push(Math.abs(l) < 1 ? `${them}'s day barely moves ${me}'s`
      : l > 0 ? `${me} has tended to score higher on the days ${them} does too`
      : `${me} has tended to score higher when ${them} is off`);
  }
  // a correlation over three or four rounds is noise; it only speaks up once there are five
  if (r.corr !== null && r.played >= 5 && Math.abs(r.corr) >= 0.5) {
    bits.push(r.corr > 0 ? "over these rounds their cards have moved together"
      : "when one of them has a good day, the other tends not to");
  }
  return bits.length ? `${bits.join("; ")}.` : "";
}

/** Who came out ahead, in words: a dash score says nothing about what it counts. */
function rivalRecord(r, me, them) {
  if (r.played === 1) return r.won ? `${me} ahead` : r.lost ? `${them} ahead` : "level";
  if (r.won === r.lost) return `level, ${r.won} each${r.tied ? `, ${plural(r.tied, "round")} tied` : ""}`;
  return `${r.won > r.lost ? me : them} ahead in ${Math.max(r.won, r.lost)} of ${r.played}`;
}

/** One rival in full: the two of them against each other, then what that rival's own day does. */
function rivalCard(r, me, them) {
  const unit = r.scale ? "points a round" : "points a hole";
  const val = v => v === null ? "\u2013" : r.scale ? fix(v * r.scale) : fix(v, 2);
  const l = r.lift === null ? null : r.lift * (r.scale || 18);
  const mark = l !== null && Math.abs(l) >= 1;  // under a point a round the two sides are the same story
  const verdict = rivalVerdict(r, me, them);
  const tile = (label, n, v, up) => `<div class="sside ${up ? "up" : ""}"><small>${label}<i>${plural(n, "round")}${up ? " \u00b7 higher" : ""}</i></small><b class="num">${val(v)}</b></div>`;
  const split = r.lift === null
    ? `<p class="muted small" style="margin:10px 0 0">Splitting ${them}'s good days from their bad ones needs two rounds of each; so far ${r.goodN} above their own average and ${r.badN} below.${verdict ? ` ${verdict}` : ""}</p>`
    : `<div class="split">
        ${tile(`${them} above their average`, r.goodN, r.onGood, mark && r.onGood > r.onBad)}
        ${tile(`${them} below it`, r.badN, r.onBad, mark && r.onBad > r.onGood)}
      </div>
      <p class="muted small" style="margin:10px 0 0">Both figures are ${me}'s ${unit}: the left on the ${plural(r.goodN, "round")} where ${them} beat their own average of ${val(r.theirAvg)}, the right on the ${r.badN} where they did not. ${verdict}</p>`;
  return `<div class="card rival">
    <div class="rhead"><b>${esc(r.name)}</b><span class="muted small">${plural(r.played, "round")} together \u00b7 ${rivalRecord(r, me, them)}</span></div>
    <div class="tapes mine">${tapeRow(unit, r.myAvg, r.theirAvg, false, val)}</div>
    ${split}</div>`;
}

/** The rivals met only once: a row each, because a card around two numbers is all chrome. */
function rivalRows(rs, me, nameOf) {
  return `<div class="card rivalrows">${rs.map(r => {
    const val = v => r.scale ? fix(v * r.scale) : fix(v, 2);
    return `<div class="kv"><span>${esc(r.name)}</span><span class="muted">${val(r.myAvg)} to ${val(r.theirAvg)} \u00b7 ${rivalRecord(r, me, nameOf(r))}</span></div>`;
  }).join("")}</div>`;
}

/** Everyone this player has shared a card with in this league, the most-played first. */
function rivalsBlock(St, p) {
  const rs = rivals(St.rounds, p.id);
  if (!rs.length) return "";
  const me = esc(firstName(p.name));
  // two players can share a first name, and "Maurits scores better when Maurits is off" helps nobody
  const seen = {};
  for (const n of [p.name, ...rs.map(r => r.name)]) seen[firstName(n)] = (seen[firstName(n)] || 0) + 1;
  const nameOf = r => esc(seen[firstName(r.name)] > 1 ? r.name : firstName(r.name));
  const deep = rs.filter(r => r.played > 1), thin = rs.filter(r => r.played === 1);
  const shown = deep.slice(0, 5), rest = deep.slice(5);
  const mixed = mixedLengths(St.rounds.filter(x => x.pid === p.id));
  return `<h2>Against each player</h2>
    <p class="muted small" style="margin:-4px 4px 10px">Only the rounds the two of them played together, so neither is measured on a day the other one missed.${mixed ? " A nine and an eighteen are compared a hole at a time." : ""}
      A handful of rounds cannot settle anything, so read these as talking points.</p>
    ${shown.map(r => rivalCard(r, me, nameOf(r))).join("")}
    ${rest.length ? `<details class="card"><summary class="small">${plural(rest.length, "more player")}</summary>${rest.map(r => rivalCard(r, me, nameOf(r))).join("")}</details>` : ""}
    ${thin.length ? `<p class="muted small" style="margin:16px 4px 6px">Met once so far</p>${rivalRows(thin, me, nameOf)}` : ""}`;
}

/** The Stats tab: the field, or any one player of it, chosen at the top. */
function leagueStatsBody(g, Ms, members) {
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return `<p class="muted center" style="margin:30px 0">No finished rounds in this league yet. Every number here appears as soon as one is added.</p>`;
  const who = St.players.some(p => p.id === ui.statsWho[g.id]) ? ui.statsWho[g.id] : "";
  const chips = `<div class="chips-wrap scroll">
    <button class="pchip ${who ? "" : "on"}" data-act="statswho" data-id="">The field<small>${plural(St.field.rounds, "round")}</small></button>
    ${St.players.map(p => `<button class="pchip ${p.id === who ? "on" : ""}" data-act="statswho" data-id="${esc(p.id)}">${esc(p.name)}<small>${plural(p.played, "round")}</small></button>`).join("")}</div>`;
  return `${chips}<div class="statsbody">${who ? playerStats(St, St.players.find(p => p.id === who)) : fieldStats(St)}</div>`;
}

function league(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const { Ms, members, S: Sx } = leagueResults(g);
  const formats = S.cleanFormats(g.formats);
  const attached = new Set(S.leagueRoundIds(gid));
  const nameOf = id => { for (const M of Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };
  const me = S.me();
  const tab = LEAGUE_TABS.some(([k]) => k === ui.leagueTab[gid]) ? ui.leagueTab[gid] : "standings";
  let body = "", hA = null, hB = null;
  if (tab === "standings") {
    // One table, the way this league is scored; the rest are a tap away rather than stacked underneath.
    const pick = formats.includes(ui.fmtTab[gid]) ? ui.fmtTab[gid] : formats[0];
    body = Ms.length ? `
      ${formats.length > 1 ? `<div class="subtabs">${formats.map(f => `<button data-act="fmt" data-f="${f}" class="${f === pick ? "on" : ""}">${FORMAT_NAMES[f]}</button>`).join("")}</div>`
        : `<p class="muted small" style="margin:2px 4px 10px">${FORMAT_BLURB[pick]}</p>`}
      ${standingsTable(pick, standingsFor(g, Ms, members, pick), g, me)}
      <p class="muted small" style="margin:6px 4px 14px">${FORMAT_NOTES[pick]}</p>
      <a class="btn" href="#leagueposter/${gid}">Make a standings poster ›</a>
      <button class="btn" data-act="ltab" data-tab="settings" style="margin-top:8px">Score this league another way ›</button>`
      : `<p class="muted center" style="margin:30px 0 14px">No finished rounds in this league yet.</p>
        <button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>
        <button class="btn" data-act="ltab" data-tab="rounds" style="margin-top:8px">Add rounds already played ›</button>`;
  } else if (tab === "stats") {
    body = leagueStatsBody(g, Ms, members);
  } else if (tab === "nines") {
    const rounds = S.rounds().filter(r => attached.has(r.id) && r.status === "done");
    const nines = ninesPlayed(rounds);
    if (!nines.length) {
      body = `<p class="muted center" style="margin:30px 0">No loop-by-loop results yet. They appear once this league has a round on a course that publishes its nines.</p>`;
    } else {
      const pick = nines.some(x => x.slug === ui.nineTab[gid]) ? ui.nineTab[gid] : nines[0].slug;
      const rows = new Map();
      for (const row of nines.find(x => x.slug === pick).rows) {
        const id = row.player.id;
        if (!id) continue;
        if (!rows.has(id)) rows.set(id, { id, name: row.player.name, gs: [], pts: [] });
        const e = rows.get(id);
        if (row.player.gross !== null) e.gs.push(row.player.gross);
        e.pts.push(row.player.pts);
      }
      const table = [...rows.values()].map(e => ({ ...e, played: e.pts.length,
        avgPts: e.pts.reduce((a, b) => a + b, 0) / e.pts.length,
        bestGross: e.gs.length ? Math.min(...e.gs) : null,
        avgGross: e.gs.length ? e.gs.reduce((a, b) => a + b, 0) / e.gs.length : null }))
        .sort((a, b) => b.avgPts - a.avgPts || (a.avgGross ?? 99) - (b.avgGross ?? 99) || a.name.localeCompare(b.name));
      body = `<div class="chips-wrap">${nines.map(x => `<button class="pchip ${x.slug === pick ? "on" : ""}" data-act="ninetab" data-slug="${esc(x.slug)}">${esc(nineName(x.slug))}<small>${plural(x.played, "card")}</small></button>`).join("")}</div>
        <table class="stand" style="margin-top:12px"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Walked</th><th>Best</th><th>Avg gross</th><th>Avg pts</th></tr></thead>
          <tbody>${table.map((e, i) => `<tr class="${me && e.id === me.id ? "acc" : ""}"><td class="pos">${i + 1}</td><td class="l">${esc(e.name)}</td><td>${e.played}</td>
            <td>${e.bestGross === null ? "–" : e.bestGross}</td><td>${e.avgGross === null ? "–" : fix(e.avgGross)}</td><td class="acc">${fix(e.avgPts)}</td></tr>`).join("")}</tbody></table>
        <p class="muted small" style="margin:8px 4px 0">Every card on this loop, whether it was walked on its own or as half of an 18, scored on the loop's own stroke index and rating so they compare. Ranked by average points.</p>`;
    }
  } else if (tab === "h2h") {
    // the matches follow however this league settles a hole; net strokes when it has no match table
    const h2hKind = formats.find(f => f in MATCH_BASIS);
    const h2hBasis = h2hKind ? MATCH_BASIS[h2hKind] : "net";
    const h = ui.h2h[gid] || {};
    hA = members.includes(h.a) ? h.a : (me && members.includes(me.id) ? me.id : members[0]);
    hB = members.includes(h.b) && h.b !== hA ? h.b : members.find(m => m !== hA);
    if (hA && hB) {
      const a = hA, b = hB;
      const H = headToHead(Ms, a, b, h2hBasis);
      const A = nameOf(a), B = nameOf(b);
      const fA = firstName(A), fB = firstName(B);
      const sel = (name, val) => `<select data-h2h="${name}">${members.map(m => `<option value="${m}" ${m === val ? "selected" : ""}>${esc(nameOf(m))}</option>`).join("")}</select>`;
      const picker = `<div class="vspick">${sel("a", a)}<button class="swapb" data-act="h2hswap" title="Swap">&#8646;</button>${sel("b", b)}</div>`;
      if (!H.rounds.length) {
        body = `${picker}<p class="muted center" style="margin:30px 0">${esc(fA)} and ${esc(fB)} have not played a round together in this league yet.</p>`;
      } else {
        // The strip under the score: wins, halves and wins in proportion, so the balance of the rivalry is the picture.
        const tot = H.winsA + H.ties + H.winsB;
        const pc = n => `${(n / tot) * 100}%`;
        const verdict = H.winsA === H.winsB ? `All square at ${H.winsA}&#8211;${H.winsB}`
          : `${esc(H.winsA > H.winsB ? fA : fB)} leads ${Math.max(H.winsA, H.winsB)}&#8211;${Math.min(H.winsA, H.winsB)}`;
        const streak = H.streak.n >= 2 ? `${esc(H.streak.who === "a" ? fA : fB)} has won the last ${H.streak.n}`
          : H.streak.n === 1 ? `${esc(H.streak.who === "a" ? fA : fB)} won the last one` : "the last one was halved";
        const holes = H.holesA + H.holesB + H.holesHalved;
        const widest = H.winsA >= H.winsB ? H.widestA : H.widestB;
        const hero = `<div class="card vscard">
          <div class="vsverdict">${verdict}</div>
          <div class="vs">
            <div class="vsside"><span class="vsdisc a">${esc(inits(A))}</span><span class="vsname">${esc(A)}</span></div>
            <div class="vsnum"><b class="num">${H.winsA}</b><s>&#8211;</s><b class="num">${H.winsB}</b><small>${H.ties ? plural(H.ties, "halved round") : "none halved"}</small></div>
            <div class="vsside"><span class="vsdisc b">${esc(inits(B))}</span><span class="vsname">${esc(B)}</span></div>
          </div>
          <div class="tug"><i class="a" style="width:${pc(H.winsA)}"></i><i class="t" style="width:${pc(H.ties)}"></i><i class="b" style="width:${pc(H.winsB)}"></i></div>
          <div class="vsline">${plural(H.rounds.length, "round")} together &middot; ${streak}</div>
        </div>`;
        // Every result in order, newest on the right: the shape of the rivalry at a glance.
        const formStrip = `<h2>Form</h2><div class="vsform">${H.rounds.map(r => `<a class="fdot ${r.winner}" href="#review/${r.id}" title="${esc(fmtDate(r.date))} &middot; ${r.ptsA}&#8211;${r.ptsB}">${r.winner === "tie" ? "=" : esc(inits(r.winner === "a" ? A : B))}</a>`).join("")}</div>
          <p class="muted small center" style="margin:6px 0 0">oldest to newest &middot; tap one for the card</p>`;
        // One bar per stat, filled from the left in proportion, so who is ahead is a shape and not a reading.
        const stats = `<h2>Tale of the tape</h2><div class="card tapes">
          ${tapeRow("average points", H.avgPtsA, H.avgPtsB, false, fix)}
          ${tapeRow("best round", H.bestPtsA, H.bestPtsB)}
          ${tapeRow("total points", H.ptsA, H.ptsB)}
          ${tapeRow("average gross", H.avgGrossA, H.avgGrossB, true, fix)}
          ${tapeRow("best gross", H.bestGrossA, H.bestGrossB, true)}
          ${H.birdiesA + H.birdiesB ? tapeRow("birdies or better", H.birdiesA, H.birdiesB) : ""}
          ${h2hKind ? tapeRow(`matches won (${basisWord(h2hBasis)})`, H.matchA, H.matchB) : ""}
        </div>`;
        const holesBlock = `<h2>Hole by hole</h2><div class="card">
          <div class="tug big"><i class="a" style="width:${(H.holesA / holes) * 100}%"></i><i class="t" style="width:${(H.holesHalved / holes) * 100}%"></i><i class="b" style="width:${(H.holesB / holes) * 100}%"></i></div>
          <div class="holeskey"><span><b>${H.holesA}</b> ${esc(fA)}</span><span class="muted">${H.holesHalved} halved</span><span><b>${H.holesB}</b> ${esc(fB)}</span></div>
          <p class="muted small" style="margin:10px 0 0">All ${holes} holes they have walked together, won on ${h2hBasis === "points" ? "points" : "net score"}: the running match if every round had been one long one, which ${H.up === 0 ? "ends dead level" : `${esc(H.up > 0 ? fA : fB)} would be ${Math.abs(H.up)} up in`}.</p>
        </div>`;
        const widestLine = widest ? `<p class="muted small" style="margin:-4px 4px 8px">Widest margin: ${esc(widest.winner === "a" ? fA : fB)} by ${Math.abs(widest.ptsA - widest.ptsB)} on ${esc(fmtDate(widest.date))}.</p>` : "";
        const list = `<h2>Every round together</h2>${widestLine}<div class="list">${[...H.rounds].reverse().map(r => `<a class="h2hrow" href="#review/${r.id}">
          <div class="when"><b>${esc(fmtDate(r.date))}</b><small class="muted">${esc(r.where)}${h2hKind ? ` &middot; ${r.up === 0 ? "halved" : `${Math.abs(r.up)} up ${esc(firstName(r.up > 0 ? A : B))}`}` : ""}</small></div>
          <div class="sc"><b class="${r.winner === "a" ? "wa" : ""}">${r.ptsA}</b><s>&#8211;</s><b class="${r.winner === "b" ? "wb" : ""}">${r.ptsB}</b></div></a>`).join("")}</div>`;
        body = picker + hero + formStrip + stats + holesBlock + list;
      }
    } else body = `<p class="muted center" style="margin:30px 0">Head-to-heads appear once two players share a round in this league.</p>`;
  } else if (tab === "players") {
    body = `<div class="list">${members.map(m => `<a href="#player/${m}"><span>${esc(nameOf(m))}</span><span class="muted small">${plural(Ms.filter(M => M.players.some(p => p.id === m)).length, "round")} <span class="chev">›</span></span></a>`).sort().join("") || `<div class="muted small">Nobody yet.</div>`}</div>
      ${members.length > 1 ? `<div class="card"><div class="name" style="font-size:15px">Two spellings of one person?</div><p class="muted small">Merge them: every round, score and course handicap moves to the kept name.</p>
      <div class="merge"><select id="mkeep">${members.map(m => `<option value="${m}">${esc(nameOf(m))}</option>`).join("")}</select><span>←</span><select id="mdrop">${members.map((m, i) => `<option value="${m}" ${i === 1 ? "selected" : ""}>${esc(nameOf(m))}</option>`).join("")}</select></div>
      <button class="btn small" data-act="merge" style="margin-top:8px">Merge into the first name</button></div>` : ""}`;
  } else if (tab === "rounds") {
    const done = S.rounds().filter(r => r.status === "done");
    const open = S.rounds().filter(r => r.status !== "done");
    const line = r => {
      const c = courseBy(r.course);
      const q = [fmtDate(r.date), c ? c.loop || c.name : r.name, r.name, ...r.entries.map(e => e.name)].join(" ").toLowerCase();
      return `<label data-q="${esc(q)}"><input type="checkbox" data-act="toggle-round" data-rid="${r.id}" ${attached.has(r.id) ? "checked" : ""}> <span><b>${esc(fmtDate(r.date))}</b> · ${esc(c ? c.loop || c.name : r.name)}<span class="muted small"> · ${r.entries.map(e => esc(e.name.split(" ")[0])).join(", ")}</span></span></label>`;
    };
    body = `<button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>
      ${open.length ? `<p class="muted small" style="margin:10px 4px 0">${plural(open.length, "round")} still being played; ${open.length === 1 ? "it joins" : "they join"} the table once finished and ticked here.</p>` : ""}
      <h2>Rounds that count</h2>
      ${done.length > 6 ? `<input id="rq" class="search" placeholder="Search by date, course or player" autocomplete="off">` : ""}
      <div class="card checks" id="rlist">${done.map(line).join("") || `<p class="muted">No finished rounds yet.</p>`}</div>`;
  } else {
    body = `<form id="gform" class="card form open"><label style="margin-top:0">League name<input name="name" value="${esc(g.name)}"></label>
      <label>Scored by <span class="muted">(pick as many as you like; the first is what the league opens on)</span></label>
      <div class="fmtlist">${S.FORMATS.map(f => `<label><input type="checkbox" name="fmt" value="${f}" ${formats.includes(f) ? "checked" : ""}> <span><b>${FORMAT_NAMES[f]}</b><small>${FORMAT_BLURB[f]}</small></span></label>`).join("")}</div>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="${g.bestN}"></label>
      <div class="two"><button class="btn primary" type="submit">Save</button>${organiser() ? `<button class="btn danger" type="button" data-act="del-league">Delete league</button>` : ""}</div></form>
      ${g.createdBy ? `<p class="muted small center">Created by ${esc(g.createdBy)}${g.created ? ` on ${esc(fmtDate(g.created))}` : ""}</p>` : ""}`;
  }
  page(g.name, `<div class="subtabs">${LEAGUE_TABS.map(([k, l]) => `<button data-act="ltab" data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div>${body}`,
    { back: "#leagues", sub: `${plural(attached.size, "round")} · ${formats.map(f => FORMAT_NAMES[f]).join(", ")}` });
  bind(ev => {
    const b_ = ev.target.closest("[data-act]");
    if (!b_) return;
    if (b_.dataset.act === "ltab") { ui.leagueTab[gid] = b_.dataset.tab; return league(gid); }
    if (b_.dataset.act === "h2hswap") { ui.h2h[gid] = { a: hB, b: hA }; return league(gid); }
    if (b_.dataset.act === "ninetab") { ui.nineTab[gid] = b_.dataset.slug; return league(gid); }
    if (b_.dataset.act === "statswho") { ui.statsWho[gid] = b_.dataset.id; return league(gid); }
    if (b_.dataset.act === "fmt") { ui.fmtTab[gid] = b_.dataset.f; return league(gid); }
    if (b_.dataset.act === "new-in-league") { S.setSetting("lastLeague", gid); return go("#new"); }
    if (b_.dataset.act === "toggle-round") { S.setLeagueRound(gid, b_.dataset.rid, b_.checked); league(gid); }
    if (b_.dataset.act === "merge") {
      const keep = document.getElementById("mkeep").value, drop = document.getElementById("mdrop").value;
      if (keep === drop) return toast("Pick two different names");
      if (!confirm(`Merge ${nameOf(drop)} into ${nameOf(keep)} on every phone? This cannot be undone.`)) return;
      S.mergePlayers(keep, drop); toast("Merged"); league(gid);
    }
    if (b_.dataset.act === "del-league" && confirm(`Delete the league ${g.name} on every phone? Rounds and players stay.`)) { S.deleteLeague(gid); go("#leagues"); }
  });
  const rq = document.getElementById("rq");
  if (rq) rq.addEventListener("input", () => {
    const t = rq.value.toLowerCase().trim();
    document.querySelectorAll("#rlist label").forEach(l => { l.style.display = !t || l.dataset.q.includes(t) ? "" : "none"; });
  });
  app.querySelectorAll("[data-h2h]").forEach(el => el.addEventListener("change", () => {
    const na = document.querySelector("[data-h2h=a]").value, nb = document.querySelector("[data-h2h=b]").value;
    // only one box can have changed, so a duplicate is always a swap: the box just picked keeps it, the other takes what it displaced
    ui.h2h[gid] = na === nb ? { a: hB, b: hA } : { a: na, b: nb };
    league(gid);
  }));
  const gf = document.getElementById("gform");
  if (gf) gf.addEventListener("submit", ev => {
    ev.preventDefault();
    g.name = ev.target.name.value.trim() || g.name; g.bestN = Number(ev.target.bestN.value) || 0;
    g.formats = S.cleanFormats([...ev.target.querySelectorAll("input[name=fmt]:checked")].map(i => i.value));
    S.saveLeague(g); toast("Saved"); ui.leagueTab[gid] = "standings"; league(gid);
  });
}

function leaguePoster(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const formats = S.cleanFormats(g.formats);
  const themes = (S.state.settings.themes || ["navy"]).slice(0, 1);
  page("Standings poster", `
    ${formats.length > 1 ? `<h2>Which standings</h2><div class="card checks">${formats.map(f => `<label><input type="checkbox" name="sf" value="${f}" checked> ${FORMAT_NAMES[f]}</label>`).join("")}</div>` : ""}
    <h2>Theme</h2><div class="themes">${themeChips(themes)}</div><div id="out"></div>`,
    { back: `#league/${gid}`, bar: `<button class="btn primary" data-act="generate">Generate image${formats.length > 1 ? "s" : ""}</button>` });
  app.querySelector(".themes").addEventListener("change", ev => { const l = ev.target.closest(".tchip"); if (l) l.classList.toggle("on", ev.target.checked); });
  document.querySelector(".bar [data-act=generate]").addEventListener("click", async () => {
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value);
    if (!chosen.length) return toast("Pick at least one theme");
    const want = formats.length > 1 ? [...document.querySelectorAll("input[name=sf]:checked")].map(i => i.value) : formats;
    if (!want.length) return toast("Pick at least one set of standings");
    S.setSetting("themes", chosen);
    const { Ms, members } = leagueResults(g);
    const jobs = [];
    chosen.forEach(tn => want.forEach((f, k) => jobs.push({
      label: `${chosen.length > 1 ? tn + "/" : ""}${4 + k}_standings_${f}.png`,
      make: () => standingsPoster(standingsFor(g, Ms, members, f), g, makeTheme(DATA.themes.find(t => t.name === tn)), f),
    })));
    await runJobs(jobs, slugFile(g.name));
  });
}

// ---------------------------------------------------------------- a course typed on the phone
function newCourse() {
  page("New course", `
    <p class="muted small">For a course the app does not have. Par and stroke index from the scorecard, course rating and slope from the club's handicap table. It syncs to every phone; the organiser can pull it into the course files later.</p>
    <form id="cf" class="card form open">
      <label>Club<input name="name" placeholder="e.g. Golfclub De Hoge Kleij" required></label>
      <label>Loop or course name <span class="muted">(optional)</span><input name="loop" placeholder="e.g. Championship course"></label>
      <label>Holes<select name="n"><option value="18">18</option><option value="9">9</option></select></label>
      <label>Par per hole, separated by spaces or commas<input name="par" inputmode="numeric" placeholder="4 3 5 4 3 5 5 4 4 4 4 3 4 5 4 5 3 4" required></label>
      <label>Stroke index per hole<input name="si" inputmode="numeric" placeholder="1 17 5 10 3 7 18 9 11 8 2 15 13 12 4 16 14 6" required></label>
      <label>Tee name<input name="tee" value="yellow" required></label>
      <div class="two"><label>Men's course rating<input name="cr" inputmode="decimal" placeholder="70.5"></label><label>Men's slope<input name="slope" inputmode="numeric" placeholder="128"></label></div>
      <div class="two"><label>Women's course rating<input name="wcr" inputmode="decimal" placeholder="76.2"></label><label>Women's slope<input name="wslope" inputmode="numeric" placeholder="135"></label></div>
      <label>Lengths in metres <span class="muted">(optional)</span><input name="metres" inputmode="numeric" placeholder="355 123 454 …"></label>
      <button class="btn primary" type="submit">Save course</button></form>`, { back: "#new" });
  document.getElementById("cf").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, nums = s => s.trim() ? s.trim().split(/[\s,;]+/).map(Number) : [];
    const n = Number(f.n.value), par = nums(f.par.value), si = nums(f.si.value), metres = nums(f.metres.value);
    if (par.length !== n || par.some(p => !(p >= 3 && p <= 6))) return toast(`Par needs ${n} numbers between 3 and 6`);
    if (si.length !== n || new Set(si).size !== n || si.some(x => !(x >= 1 && x <= n))) return toast(`Stroke index needs ${n} different numbers from 1 to ${n}`);
    if (metres.length && (metres.length !== n || metres.some(x => !(x > 50)))) return toast(`Lengths need ${n} numbers or none`);
    const ratings = {};
    const cr = Number(f.cr.value.replace(",", ".")), slope = Number(f.slope.value), wcr = Number(f.wcr.value.replace(",", ".")), wslope = Number(f.wslope.value);
    if (f.cr.value && f.slope.value) ratings.m = { cr, slope };
    if (f.wcr.value && f.wslope.value) ratings.f = { cr: wcr, slope: wslope };
    if (!Object.keys(ratings).length) return toast("At least one course rating and slope is needed");
    const total = sum(par);
    for (const r_ of Object.values(ratings)) if (!(r_.cr > total - 10 && r_.cr < total + 10) || !(r_.slope >= 55 && r_.slope <= 155)) return toast("Rating or slope does not look right for this par");
    const name = f.name.value.trim(), loop = f.loop.value.trim();
    const slug = slugFile(`${name} ${loop}`).toLowerCase().replace(/_/g, "-");
    if (S.courseBy(slug)) return toast("A course with that name exists already");
    const data = { slug, name, loop, par, stroke_index: si, first_hole: 1, n, course_par: total, source: "phone", notes: ["added on a phone; ratings not checked against the club card"],
      tees: { [f.tee.value.trim() || "yellow"]: { ratings, par, metres: metres.length ? metres : null } } };
    try { prepareCourse(data); } catch (err) { return toast(err.message); }
    S.addCourse(slug, data);
    toast("Course saved on every phone");
    go("#new");
  });
}

// ---------------------------------------------------------------- scan an old scorecard
const scanState = { cards: [], busy: false, courseSlug: null };

async function downscale(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = cv.convertToBlob ? await cv.convertToBlob({ type: "image/jpeg", quality: 0.8 }) : await new Promise(res => cv.toBlob(res, "image/jpeg", 0.8));  // ~300 KB: fits the scan service's CPU budget
  const b64 = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result.split(",")[1]); rd.readAsDataURL(blob); });
  return { b64, blob };
}

/** Sends the photo to the scan function; the answer is rows of names and scores for the phone to check. */
export async function scanImage(cfg, b64, mime, holes, par, names) {
  const res = await fetch(`${cfg.url}/functions/v1/scan-card`, { method: "POST", headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64, mime, holes, par, names }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `scan failed (${res.status})`);
  return data;
}

function scan() {
  const cfg = Y.config();
  const all = S.courses();
  const st = scanState;
  if (!cfg) return page("Scan a scorecard", `<div class="banner warn">Scanning needs the shared database connection (the scan service runs there). Connect in Settings first.</div>`, { back: "#new" });
  const recent = (S.state.settings.recentCourses || [])[0];
  const players = S.players().sort((a, b) => a.name.localeCompare(b.name));

  // Cards are taken one at a time and laid end to end, so an 18 walked with a card per nine is two photos.
  const covered = st.cards.reduce((a, c) => a + c.holes, 0);
  const offsets = st.cards.map((_, k) => st.cards.slice(0, k).reduce((a, c) => a + c.holes, 0));
  const fits = all.filter(c => c.n === 9 || c.n === 18);
  const course = all.find(c => c.slug === st.courseSlug) || null;
  const want = course ? course.n : null;
  const missing = want === null ? null : want - covered;

  const cardBlock = (card, k) => {
    const from = offsets[k] + 1, to = offsets[k] + card.holes;
    return `<h2>Card ${k + 1}${st.cards.length > 1 || missing > 0 ? ` · holes ${from} to ${to}` : ""}</h2>
      ${card.imageUrl ? `<img class="scan-prev" src="${card.imageUrl}" alt="scorecard ${k + 1}">` : ""}
      <label>Holes on this card<select class="choles" data-card="${k}"><option value="9" ${card.holes === 9 ? "selected" : ""}>9</option><option value="18" ${card.holes === 18 ? "selected" : ""}>18</option></select></label>
      ${card.rows.map((row, i) => {
        const tot = row.scores.reduce((a, v) => a + (v || 0), 0);
        const mismatch = row.total !== null && row.total !== undefined && row.total !== tot;
        return `<div class="scan-row" data-card="${k}" data-i="${i}">
          <div class="row"><label class="small" style="margin:0"><input type="checkbox" class="use" checked> <b>Row ${i + 1}</b></label>
            <span class="muted small">${tot} entered${row.total !== null && row.total !== undefined ? ` · card says ${row.total}` : ""}</span></div>
          <div class="cells">${row.scores.map((v, h) => `<div><small>${offsets[k] + h + 1}</small><input inputmode="numeric" class="${row.unsure.includes(h) || v === null ? "unsure" : ""}" value="${v === null ? "" : v}" data-h="${h}"></div>`).join("")}</div>
          ${mismatch ? `<div class="warn small" style="margin-top:6px">These holes add up to ${tot}, the card says ${row.total}. Check the yellow cells.</div>` : ""}
          <div class="whorow"><select class="who"><option value="">Who played this row?</option>${players.map(p => `<option value="${p.id}" data-hi="${esc(fmtIndex(Number(p.hi)))}">${esc(p.name)}</option>`).join("")}</select></div>
          <div class="picked muted small" hidden></div>
          <button type="button" class="btn small rownew"><span class="plus">+</span> Someone new</button>
          <div class="newp two" hidden><label style="margin-top:6px">Name<input class="nm" autocapitalize="words" value="${esc(row.name || "")}"></label>
            <label style="margin-top:6px">Handicap index<input class="hi" inputmode="decimal" placeholder="18,4"></label></div>
        </div>`;
      }).join("")}`;
  };

  const first = st.cards[0];
  const courseOpts = fits.map(c => `<option value="${esc(c.slug)}" ${c.slug === st.courseSlug ? "selected" : ""}>${esc(courseTitle(c))} (${c.n})</option>`).join("");
  const body = st.cards.length ? `
    <h2>The round</h2>
    <label>Course walked<select id="scourse">${courseOpts}</select></label>
    ${missing > 0 ? `<div class="banner">${esc(courseTitle(course))} is ${want} holes and ${covered} are read so far. Take the next card: holes ${covered + 1} to ${want}.</div>`
      : missing < 0 ? `<div class="banner warn">${covered} holes have been read but ${esc(courseTitle(course))} is only ${want}. Pick an 18-hole course, or start again.</div>` : ""}
    <label>Played on<input id="sdate" type="date" value="${esc(first.date || S.today())}"></label>
    <label>Name of the round<input id="sname" value="${esc(first.name || ((first.course ? first.course + " " : "") + (first.date || "")).trim() || "Scanned round")}"></label>
    <h2>Whose card is this?</h2>
    <p class="muted small">The scores came off the photo${st.cards.length > 1 ? "s" : ""}, in the order they sit on the card. Check the numbers, then say who each row belongs to. Pick the same player on both cards and they are one round. Untick a row to leave it out.</p>
    ${st.cards.map(cardBlock).join("")}` : "";

  const label = st.busy ? "Reading the card…" : !st.cards.length ? "Take or choose a photo"
    : missing > 0 ? `Take card ${st.cards.length + 1}` : "Scan another photo";
  page("Scan a scorecard", `
    <p class="muted small">Photograph an old paper scorecard (flat, in good light). Walked 18 with a card for each nine? Take them one after the other.</p>
    <label class="btn primary big" style="display:flex">${label}<input id="photo" type="file" accept="image/*" capture="environment" hidden ${st.busy ? "disabled" : ""}></label>
    ${st.cards.length ? `<button class="btn small" data-act="scan-reset" style="margin-top:8px">Start again</button>` : ""}
    ${body}`,
  { back: "#new", bar: st.cards.length ? `<button class="btn primary" data-act="scan-create" ${missing === 0 ? "" : "disabled"}>Create round ›</button>` : "" });

  document.getElementById("photo").addEventListener("change", async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    st.busy = true;
    scan();
    try {
      const { b64, blob } = await downscale(f);
      const guessCourse = all.find(c => c.slug === st.courseSlug) || all.find(c => c.slug === recent) || all[0];
      const data = await scanImage(cfg, b64, "image/jpeg", guessCourse.n, guessCourse.par, S.players().map(p => p.name));
      st.cards.push({ ...data, imageUrl: URL.createObjectURL(blob) });
      if (!st.courseSlug) {
        const total = st.cards.reduce((a, c) => a + c.holes, 0);
        const same = all.filter(c => c.n === total);
        const guess = data.course ? same.find(c => (c.name + " " + c.loop).toLowerCase().includes(String(data.course).toLowerCase().split(" ")[0])) : null;
        st.courseSlug = (guess || same.find(c => c.slug === recent) || same[0] || guessCourse).slug;
      }
    } catch (err) { toast(`Scan failed: ${err.message}`, 6000); }
    st.busy = false;
    scan();
  });

  const sc = document.getElementById("scourse");
  if (sc) sc.addEventListener("change", () => { st.courseSlug = sc.value; scan(); });
  app.querySelectorAll(".choles").forEach(sel => sel.addEventListener("change", () => {
    const card = st.cards[Number(sel.dataset.card)], n2 = Number(sel.value);
    card.holes = n2;
    for (const row of card.rows) { row.scores = Array.from({ length: n2 }, (_, h) => row.scores[h] ?? null); row.unsure = row.unsure.filter(h => h < n2); }
    scan();
  }));
  app.querySelectorAll(".scan-row").forEach(el => {
    const who = el.querySelector(".who"), np = el.querySelector(".newp"), picked = el.querySelector(".picked");
    who.addEventListener("change", () => {
      el.dataset.new = "";
      np.hidden = true;
      const opt = who.selectedOptions[0];
      picked.hidden = !who.value;
      // whoever is chosen brings the index they last played off along with them; the select shows their name
      if (who.value) picked.textContent = `Last played off ${opt.dataset.hi}`;
    });
    // Typing a name that is already on the roster: show their index rather than quietly rewriting it.
    const nm = np.querySelector(".nm"), hi = np.querySelector(".hi");
    let autofilled = true;
    hi.addEventListener("input", () => { autofilled = false; });
    nm.addEventListener("input", () => {
      const p = S.findPlayer(nm.value);
      picked.hidden = !p;
      if (!p) return;
      picked.textContent = `Already on the roster, last played off ${fmtIndex(Number(p.hi))}`;
      if (autofilled) hi.value = fmtIndex(Number(p.hi));
    });
    el.querySelector(".rownew").addEventListener("click", () => {
      el.dataset.new = "1";
      who.value = "";
      picked.hidden = true;
      np.hidden = false;
      np.querySelector(".nm").focus();
    });
    const tally = el.querySelector(".row .muted");
    el.querySelectorAll(".cells input").forEach(inp => inp.addEventListener("input", () => {
      const t = [...el.querySelectorAll(".cells input")].reduce((a, x) => a + (Number(x.value) || 0), 0);
      tally.textContent = tally.textContent.replace(/^\d+ entered/, `${t} entered`);
      inp.classList.toggle("unsure", inp.value.trim() === "");
    }));
  });

  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "scan-reset") {
      for (const c of st.cards) if (c.imageUrl) URL.revokeObjectURL(c.imageUrl);
      st.cards = []; st.courseSlug = null;
      return scan();
    }
    if (b.dataset.act !== "scan-create" || !course || missing !== 0) return;
    const date = document.getElementById("sdate").value || S.today();
    const picked = [...document.querySelectorAll(".scan-row")].filter(el => el.querySelector(".use").checked);
    if (!picked.length) return toast("Tick at least one row");
    // One entry per player, each card's row dropped into the holes that card covers.
    const byPlayer = new Map();
    for (const el of picked) {
      const k = Number(el.dataset.card), nth = Number(el.dataset.i) + 1;
      const isNew = el.dataset.new === "1";
      const pid = el.querySelector(".who").value;
      if (!isNew && !pid) return toast(`Card ${k + 1}, row ${nth}: choose who played it, add someone new, or untick it`);
      const known = isNew ? null : S.players().find(p => p.id === pid);
      const name = known ? known.name : el.querySelector(".nm").value.trim();
      const hi = known ? Number(known.hi) : parseHI(el.querySelector(".hi").value);
      if (!name) return toast(`Card ${k + 1}, row ${nth}: the new player needs a name`);
      if (!(hi >= -10 && hi <= 54)) return toast(`${name}: handicap index between +10 and 54`);
      const scores = [...el.querySelectorAll(".cells input")].map(i2 => i2.value.trim() === "" ? null : Number(i2.value));
      if (scores.some(v => v !== null && !(Number.isInteger(v) && v >= 0 && v <= 30))) return toast(`${name}: scores must be whole numbers 0 to 30`);
      const key = S.nameKey(name);
      if (!byPlayer.has(key)) byPlayer.set(key, { name, hi, gender: known ? known.gender : "m", cards: new Set(), scores: new Array(course.n).fill(null) });
      const e = byPlayer.get(key);
      if (e.cards.has(k)) return toast(`${name} is on card ${k + 1} twice; untick one of those rows`);
      e.cards.add(k);
      scores.forEach((v, h) => { e.scores[offsets[k] + h] = v; });
    }
    const short = [...byPlayer.values()].find(e => e.cards.size !== st.cards.length);
    if (short) return toast(`${short.name} is on ${plural(short.cards.size, "card")} of ${st.cards.length}. Pick them on the other one too, or untick them.`, 6000);
    const r = S.createRound({ course: course.slug, name: document.getElementById("sname").value.trim() || "Scanned round", date,
      defaultTee: Object.keys(course.tees).includes("yellow") ? "yellow" : Object.keys(course.tees)[0], allowance: 100 });
    for (const x of byPlayer.values()) {
      const e = S.addEntry(r, course.n, { name: x.name, hi: x.hi, tee: r.defaultTee, gender: x.gender, courseHandicap: null });
      x.scores.forEach((v, h) => { if (v !== null) S.setScore(r, e, h, v); });
    }
    r.status = "done";
    S.saveRound(r);
    for (const c of st.cards) if (c.imageUrl) URL.revokeObjectURL(c.imageUrl);
    st.cards = []; st.courseSlug = null;
    go(`#review/${r.id}`);
  });
}

// ---------------------------------------------------------------- settings: who am I, sync, invite, backup, courses, danger zone
function settings() {
  const cfg = Y.config() || { url: "", anonKey: "", label: "" };
  const done = S.rounds().filter(r => r.status === "done");
  const st = Y.sync;
  const status = st.status === "off" ? "Solo phone, not connected" : st.status === "error" ? `Problem: ${st.error}` : st.status === "syncing" ? "Syncing…" : `Synced with ${cfg.label || "the shared database"}${st.lastPull ? " · last check " + st.lastPull.slice(11, 16) : ""}`;
  const me = S.me();
  const base = location.origin + location.pathname;
  const invite = Y.enabled() ? Y.joinLink(base, false) : null;
  const inviteOrg = Y.enabled() ? Y.joinLink(base, true) : null;
  const phoneCourses = S.state.courses.filter(c => !c.deleted && (c.source || "phone") === "phone");
  page("Settings", `
    <h2>This phone</h2>
    <div class="card"><div class="row"><div><div class="name">${me ? esc(me.name) : "Nobody yet"}</div><div class="muted small">${me ? "your results show on the home screen" : "say who you are for a personal home screen"}</div></div><a class="btn small" href="#welcome">Change</a></div>
      <label class="checks" style="margin-top:10px"><input type="checkbox" id="orgtoggle" ${organiser() ? "checked" : ""}> Organiser on this phone <span class="muted">&nbsp;(can delete rounds and leagues)</span></label></div>
    <h2>Shared database</h2>
    <div class="card"><div class="name">${esc(status)}</div>
      ${invite ? `<p class="muted small">Invite another phone: let them scan this code or send them the link. It connects them to ${esc(cfg.label || "this database")} and asks who they are.</p>
        <canvas class="qr" id="qr" width="220" height="220"></canvas>
        <div class="two"><button class="btn" data-act="share-link" data-link="${esc(invite)}">Share join link</button><button class="btn" data-act="share-link" data-link="${esc(inviteOrg)}">Organiser link</button></div>` : ""}
      <details style="margin-top:10px"><summary class="muted small">${DATA.sync ? "Connection details (only change to use another database)" : "Connect to a database"}</summary>
      <form id="syncf">
        <label>Database address<input name="url" value="${esc(cfg.url)}" placeholder="https://hagolf.….workers.dev" autocapitalize="off" autocorrect="off"></label>
        <label>Society key<input name="anonKey" value="${esc(cfg.anonKey)}" placeholder="…" autocapitalize="off" autocorrect="off"></label>
        <label>Name of the society<input name="label" value="${esc(cfg.label || "")}" placeholder="e.g. Apeliotes"></label>
        <div class="two"><button class="btn primary" type="submit">Test and save</button><button class="btn" type="button" data-act="sync-now">Sync now</button></div>
        <button class="btn small" type="button" data-act="resync" style="margin-top:10px">Fetch everything again</button>
        ${DATA.sync && !Y.isDefault() ? `<button class="btn small" type="button" data-act="sync-default">Back to the built-in connection</button>` : ""}
      </form></details></div>
    <h2>Courses</h2>
    <div class="card"><div class="muted small">${S.courses().length} courses, ${plural(phoneCourses.length, "course")} added on phones.</div>
      ${phoneCourses.map(c => `<div class="kv"><span>${esc(courseTitle(c.data))}</span>${organiser() ? `<button class="btn small danger" data-act="del-course" data-slug="${esc(c.slug)}">Remove</button>` : `<span class="muted small">added on a phone</span>`}</div>`).join("")}
      <a class="btn small" href="#newcourse" style="margin-top:8px">Add a course</a></div>
    ${S.state.quarantine.length ? `<h2>Refused by the server</h2><div class="card"><div class="muted small">${S.state.quarantine.slice(-5).map(q => `${esc(q.table)} · ${esc(q.reason)}`).join("<br>")}</div>
      <button class="btn small danger" data-act="clear-q" style="margin-top:8px">Clear this list</button></div>` : ""}
    <h2>Backup</h2>
    <div class="card"><div class="muted small">${S.players().length} players · ${S.rounds().length} rounds · ${S.leagues().length} leagues${S.state.settings.lastExport ? ` · last export ${S.state.settings.lastExport.slice(0, 16).replace("T", " ")}` : ""}</div>
      <div class="two"><button class="btn primary" data-act="export">Export backup</button><label class="btn">Import backup<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
    <h2>For the desktop kit</h2>
    <p class="muted small">A round as tournament.yaml: put it in tournaments/&lt;slug&gt;/ on the computer and run python golf.py render.</p>
    <div class="list">${done.map(r => `<div><div><div class="name">${esc(r.name)}</div><div class="muted small">${esc(fmtDate(r.date))}</div></div><button class="btn small" data-act="yaml" data-rid="${r.id}">tournament.yaml</button></div>`).join("") || `<div class="muted small">No finished rounds yet.</div>`}</div>
    ${organiser() ? `<h2>Delete a round</h2><div class="list">${S.rounds().map(r => `<div><div><div class="name">${esc(r.name)}</div><div class="muted small">${roundStatus(r)}</div></div><button class="btn small danger" data-act="del-round" data-rid="${r.id}">Delete</button></div>`).join("") || `<div class="muted small">No rounds.</div>`}</div>` : ""}
    <p class="foot">Hagolf ${DATA.version} · ${S.courses().length} courses · ${DATA.themes.length} themes</p>`, { back: "", tabs: "settings" });
  if (invite && window.qrcode) {
    try {
      const q = window.qrcode(0, "M"); q.addData(invite); q.make();
      const cv = document.getElementById("qr"), ctx = cv.getContext("2d"), N = q.getModuleCount(), cell = 200 / N;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 220, 220); ctx.fillStyle = "#000";
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (q.isDark(y, x)) ctx.fillRect(10 + x * cell, 10 + y * cell, cell + 0.5, cell + 0.5);
    } catch (e) { console.warn("qr", e); }
  }
  document.getElementById("orgtoggle").addEventListener("change", ev => { S.setSetting("organiser", ev.target.checked); settings(); });
  document.getElementById("syncf").addEventListener("submit", async ev => {
    ev.preventDefault();
    const c = { url: ev.target.url.value.trim(), anonKey: ev.target.anonKey.value.trim(), label: ev.target.label.value.trim() };
    if (!c.url && !c.anonKey) { Y.setConfig(null); toast("Sync switched off on this phone"); return settings(); }
    if (!c.url.startsWith("http") || !c.anonKey) return toast("Both the URL and the anon key are needed");
    try { await Y.test(c); } catch (err) { return toast(`Could not connect: ${err.message}`, 6000); }
    Y.setConfig(DATA.sync && c.url === DATA.sync.url && c.anonKey === DATA.sync.anonKey ? null : c);
    toast("Connected. Syncing…");
    settings();
  });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "share-link") {
      const link = b.dataset.link;
      if (navigator.share) { try { await navigator.share({ title: "Join Hagolf", text: `Join ${cfg.label || "our golf society"} in Hagolf`, url: link }); return; } catch (e) { if (e.name === "AbortError") return; } }
      try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch (e) { prompt("Copy this link", link); }
    }
    if (b.dataset.act === "sync-now") { await Y.pushAndPull(); toast(Y.sync.status === "error" ? `Sync problem: ${Y.sync.error}` : "Synced"); settings(); }
    if (b.dataset.act === "resync") { await resyncNow(); }
    if (b.dataset.act === "sync-default") { Y.setConfig(null); settings(); }
    if (b.dataset.act === "clear-q") { S.state.quarantine = []; S.save(); settings(); }
    if (b.dataset.act === "export") {
      const text = S.exportJSON();
      await saveFiles([new File([text], `hagolf-backup-${S.today()}.json`, { type: "application/json" })], "Hagolf backup");
      settings();
    }
    if (b.dataset.act === "yaml") {
      const r = S.getRound(b.dataset.rid);
      await saveFiles([new File([S.toYAML(r)], `${slugFile(r.name).toLowerCase()}-tournament.yaml`, { type: "text/plain" })], r.name);
    }
    if (b.dataset.act === "del-course") {
      const c = S.state.courses.find(x => x.slug === b.dataset.slug);
      const used = S.rounds().filter(r => r.course === b.dataset.slug).length;
      if (used) return toast(`${plural(used, "round")} use this course; delete those first`);
      if (confirm(`Remove the course ${courseTitle(c.data)} on every phone?`)) { S.removeCourse(b.dataset.slug); settings(); }
    }
    if (b.dataset.act === "del-round") {
      const r = S.getRound(b.dataset.rid);
      if (confirm(`Delete ${r.name} on every phone? This cannot be undone.`)) { S.deleteRound(r.id); settings(); }
    }
  });
  document.getElementById("imp").addEventListener("change", async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const res = S.importJSON(await f.text());
      toast(`Imported: ${plural(res.added, "record")} added or updated`, 5000);
      settings();
    } catch (err) { toast(err.message, 5000); }
  });
}

// ---------------------------------------------------------------- global actions and routing
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "pick-course") go(`#new/${b.dataset.slug}`);
  if (act === "pick-club") go(`#loops/${encodeURIComponent(b.dataset.club)}`);
  if (act === "create-round") {
    const c = courseBy(b.dataset.slug);
    const tees = Object.keys(c.tees);
    const name = document.getElementById("rname") ? document.getElementById("rname").value.trim() : "";
    const r = S.createRound({ course: b.dataset.slug, name: name || `${c.loop || c.name} ${S.today()}`,
      date: document.getElementById("rdate") ? document.getElementById("rdate").value : S.today(),
      defaultTee: document.getElementById("rtee") ? document.getElementById("rtee").value : (tees.includes("yellow") ? "yellow" : tees[0]),
      allowance: document.getElementById("rallow") ? document.getElementById("rallow").value : 100 });
    document.querySelectorAll("input[name=lg]:checked").forEach(i => { S.setLeagueRound(i.value, r.id, true); S.state.settings.lastLeague = i.value; });
    const me = S.me();
    if (me) S.addEntry(r, c.n, { name: me.name, hi: me.hi, tee: r.defaultTee, gender: me.gender || "m", courseHandicap: null });
    S.save();
    go(`#players/${r.id}`);
  }
  if (act === "toggle-add") { const f = document.getElementById("addf"); f.classList.add("open"); b.classList.add("hidden"); document.getElementById("pname").focus(); f.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (act === "remove-entry") {
    const rid = location.hash.split("/")[1], r = S.getRound(rid), i = Number(b.dataset.i), e = r.entries[i];
    if (e.scores.every(s => s === null) || confirm(`Remove ${e.name} and their scores from this round?`)) { S.removeEntry(r, i); players(rid); }
  }
  if (act === "start-scoring") { const r = S.getRound(b.dataset.rid); go(`#score/${r.id}/${S.holeOf(r)}`); }
  if (act === "del-player") { if (confirm("Delete this player on every phone?")) { S.deletePlayer(b.dataset.id); roster(); } }
  if (act === "update") { if (window.__updateWorker) window.__updateWorker.postMessage("skipWaiting"); }
  if (act === "install" && window.__installPrompt) { window.__installPrompt.prompt(); window.__installPrompt = null; }
});

const screens = { home, welcome, join, new: newRound, loops, players, score, review, attach, graphics, roster, player, leagues, league, leagueposter: leaguePoster, settings, newcourse: newCourse, scan,
  skipme: () => { S.state.settings.welcomed = true; S.save(); go("#home"); } };

function route() {
  const t = document.getElementById("toast");
  if (t && !t.classList.contains("action")) t.classList.remove("show");
  const [name, ...args] = location.hash.replace(/^#/, "").split("/");
  ui.expanded = name === "review" ? ui.expanded : null;
  if (name !== "review") ui.reviewOrder = {};
  (screens[name] || home)(...args.map(decodeURIComponent));
}

function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream; }
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }

// other phones' changes: redraw the current screen, unless the user is typing, scoring, or looking at rendered images
Y.onChange(({ changed, status }) => {
  const typing = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  const busy = document.querySelector(".thumbs, .progress") || location.hash.startsWith("#score/") || location.hash.startsWith("#join/");
  if (changed && !typing && !busy) route();
  else if (status) { const d = document.querySelector(".top .dot"); if (d) d.outerHTML = syncDot(); }
});
S.setOnSave(Y.schedulePush);

window.addEventListener("hashchange", route);
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installPrompt = e; if (location.hash === "" || location.hash === "#home") home(); });
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then(reg => {
    const watch = w => w && w.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) { window.__updateReady = true; window.__updateWorker = w; toast("New version ready: go Home and tap the banner", 4000); if (!location.hash || location.hash === "#home") home(); }
    });
    watch(reg.installing);
    reg.addEventListener("updatefound", () => watch(reg.installing));
  }).catch(e => console.warn("sw", e));
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
}
Y.start();
route();
