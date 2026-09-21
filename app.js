// Hagolf screens and navigation. Hash routes: #home #welcome #join/<payload> #new #players/<rid> #score/<rid>/<hole>
// #review/<rid> #attach/<rid> #graphics/<rid> #roster #leagues #league/<gid> #leagueposter/<gid> #statsposter/<gid>
// #settings #newcourse
import { DATA } from "./data.js";
import * as S from "./store.js";
import * as Y from "./sync.js";
import { compute, computeNine, halves, standings, strokeStandings, matchStandings, gpStandings, GP_POINTS, headToHead, leagueStats, rivals, SCORE_BUCKETS, handicapFor, prepareCourse, outcome, stableford, fmtToPar, fmtSigned, fmtHcp, fmtIndex, fix, NO_SCORE } from "./model.js";
import { loadFonts, makeTheme } from "./draw.js";
import { grossLeaderboard, stablefordLeaderboard, holesPoster, standingsPoster, STANDINGS_TITLES } from "./posters.js";
import { statsFieldPoster, statsNinesPoster, statsPlayerPoster } from "./statsposters.js";
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
  matchpts: "Matchplay (Stableford)", soccer: "Football table (stroke)", soccerpts: "Football table (Stableford)",
  gp: "Grand Prix (Stableford)", gpstroke: "Grand Prix (stroke)" };
// What a Grand Prix settles the day's finishing order on. A format not in here is not a Grand Prix.
const GP_BASIS = { gp: "points", gpstroke: "net" };
// What a hole-by-hole format settles a hole on. A format not in here is not a match format.
const MATCH_BASIS = { match: "net", matchpts: "points", soccer: "net", soccerpts: "points" };
const basisWord = b => b === "points" ? "Stableford points" : b === "gross" ? "gross score" : "net strokes";
// What a head-to-head compares the two on: the tab label, the round, and the hole.
const H2H_BASES = [["points", "Stableford", "the most Stableford points", "the higher Stableford points"],
  ["net", "Net score", "the lowest net score", "the lower net score"],
  ["gross", "Gross score", "the lowest gross score", "the lower gross score"]];
const basisRow = b => H2H_BASES.find(x => x[0] === b) || H2H_BASES[0];
const basisUnit = b => b === "points" ? "points" : b === "gross" ? "gross strokes" : "net strokes";
/** A row of pill tabs that may be wider than the phone: the wrapper carries the ‹ › cues. */
const subtabs = (buttons, small = false) => `<div class="tabrow"><div class="subtabs${small ? " small" : ""}">${buttons}</div><span class="cue l">&#8249;</span><span class="cue r">&#8250;</span></div>`;
/** The three currencies as a row of tabs, wherever two players are set against each other. */
const basisPicker = (act, chosen) => `<p class="pickline">Compare them on</p>
  ${subtabs(H2H_BASES.map(([k, label]) => `<button data-act="${act}" data-b="${k}" class="${k === chosen ? "on" : ""}">${label}</button>`).join(""), true)}`;
// Every table is one of the two games, and the app says which before any number is read.
const FORMAT_MODE = { stableford: "Stroke play", stroke: "Stroke play", gp: "Stroke play", gpstroke: "Stroke play",
  match: "Match play", matchpts: "Match play", soccer: "Match play", soccerpts: "Match play" };
const FORMAT_BLURB = {
  stableford: "Everyone's Stableford points added up; most points wins",
  stroke: "Everyone's net score against par added up; lowest wins",
  match: "Everyone out the same day plays a match, each hole to the lower net score: 2 for a win, 1 for a draw",
  matchpts: "Everyone out the same day plays a match, each hole to the higher Stableford points: 2 for a win, 1 for a draw",
  soccer: "The same matches on net scores, in a football table: 3 for a win, 1 for a draw",
  soccerpts: "The same matches on Stableford points, in a football table: 3 for a win, 1 for a draw",
  gp: "Points for where you finish on each card on Stableford points, as in Formula 1: 25 for the win, then 18, 15, 12" + "…",
  gpstroke: "The same points, with the day finished on net score against par instead; no card, no points",
};
const FORMAT_NOTES = {
  stableford: "<b>Stroke play.</b> Everyone plays for their own score and nobody plays against anybody: each round gives you your Stableford points and this table adds them up. <b>Rds</b> is rounds played, <b>Wins</b> how often you had the most points on the day, <b>Avg</b> your points per round.",
  stroke: "<b>Stroke play.</b> Each round counts your net score against par, so −2 means two under. The lowest total wins. A round you did not finish a full card for counts nothing and is marked NR.",
  match: "<b>Match play.</b> Everyone out on the same card played a match against everyone else on it. Each hole goes to the lower net score, which is the score after handicap strokes, and whoever wins more holes wins the match. 2 points for a win, 1 each for a draw. <b>Up</b> is holes won minus holes lost across every match.",
  matchpts: "<b>Match play.</b> Everyone out on the same card played a match against everyone else on it, and each hole goes to the higher Stableford points. Points stop at zero, so two ruined holes are halved where net scores would still separate them. 2 points for a win, 1 each for a draw. <b>Up</b> is holes won minus holes lost.",
  soccer: "<b>Match play, football table.</b> The same matches, each hole on the lower net score, scored the way a football league is: 3 points for a win, 1 for a draw, nothing for a loss.",
  soccerpts: "<b>Match play, football table.</b> The same matches, each hole on the higher Stableford points, scored 3 for a win, 1 for a draw, nothing for a loss.",
  gp: `<b>Stroke play.</b> Each card hands out points for where you finished on the day on Stableford points, as Formula 1 does: ${GP_POINTS.join(", ")} down the board and nothing after that. Equal points are separated by countback. Only this league's players count towards a position, so a guest cannot take the win off you.`,
  gpstroke: `<b>Stroke play.</b> The same ${GP_POINTS.join(", ")} down the board, with the day finished on net score against par rather than on points, so the best card takes the win instead of the best points haul and a 9 and an 18 are ranked the same way. Equal net scores are separated by countback on net strokes. A card you did not finish has no position and scores nothing, marked NR.`,
};

/** An explanation folded away behind an "i": the screen stays numbers and the words are one tap off.
    The text is trusted HTML; every caller escapes what it puts in. */
const tipBody = text => `<div class="tipbody">${text}</div>`;
const ibtn = `<i class="ibtn" aria-hidden="true">i</i>`;
/** A heading that carries its own explanation: tapping the heading or its "i" opens it. */
const h2tip = (title, text) => `<details class="tip"><summary><h2>${esc(title)}</h2>${ibtn}<span class="sr">what this means</span></summary>${tipBody(text)}</details>`;
/** The same, where there is no heading to hang it on. */
const tip = (text, label = "What this means") => `<details class="tip solo"><summary>${ibtn}<span>${esc(label)}</span></summary>${tipBody(text)}</details>`;
let toastTimer = null;
const ui = { expanded: null, selHole: null, blobs: [], h2h: {}, h2hBasis: {}, groupFilter: 0, leagueTab: {}, reviewOrder: {}, mineOnly: false, plSort: {},
  loops: {}, nineTab: {}, fmtTab: {}, statsWho: {}, rivalBasis: {} };

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
  cueTabs();
}

/** The ‹ › on a pill bar: shown only on a side it can still be scrolled towards. */
function cueTabs() {
  document.querySelectorAll(".tabrow").forEach(w => {
    const s = w.querySelector(".subtabs");
    const mark = () => {
      w.classList.toggle("more-l", s.scrollLeft > 2);
      w.classList.toggle("more-r", s.scrollLeft + s.clientWidth < s.scrollWidth - 2);
    };
    if (!w.dataset.cued) {
      w.dataset.cued = "1";
      s.addEventListener("scroll", mark, { passive: true });
      requestAnimationFrame(mark);  // again once the fonts have settled the widths
    }
    mark();
  });
}
window.addEventListener("resize", cueTabs);

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
  if (kind === "form") return `${fix(r.total, 2)} pts`;
  if (kind === "formstroke") return `${fmtSigned(r.total, 2)} net`;
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
    ${tip(`<p>This club has ${plural(nines.length, "loop")} of nine holes, which makes ${nines.length * (nines.length - 1)} ways of walking 18: the order matters, because each combination has its own stroke index and its own course rating, and so its own handicap strokes.</p>
      <p>Say which nine you started on and which you went out on second, and the app picks the right card. Afterwards the round is split back into its two nines for the statistics.</p>`, "Why the order matters")}`,
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
    ${tip(`<p>Everyone's course handicap is worked out from their index and this course's rating first. The allowance is the slice of that handicap they actually play off, and it applies to everybody equally.</p>
      <p>100% is the ordinary society round. The World Handicap System asks for 95% in an individual Stableford competition, and a big or strong field is sometimes cut to 90%.</p>`, "What is a handicap allowance?")}
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
    ${h2tip(`${plural(r.entries.length, "player")} in this round`, `<p>Each player's handicap index is turned into a course handicap for the tee they are standing on: the index is stretched by this course's slope and shifted by its rating, so the same index gives more strokes off a harder tee.</p>
      <p>Those strokes are then spread over the holes by stroke index, hardest hole first. If the club's own table gives a different number, put it in the course handicap override when you add the player, and that is what counts.</p>`)}
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
    <p class="hint">The first tap on − or + puts par in. Tap the score itself if the hole was picked up, which counts ${NO_SCORE} strokes.</p>
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
    ${rows ? `${h2tip("Stableford order", `<p>Stableford scores each hole on its own, against the par you get with your handicap strokes: a net double bogey or worse is 0 points, a net bogey 1, a net par 2, a net birdie 3, and so on up. The round is the points added up, and unlike a stroke play total one ruined hole costs at most two points.</p>
      <p>Each row shows that player's <b>gross</b> (every stroke they took), their <b>net</b> (gross less their course handicap) and their <b>points</b>. The board is ordered on points.</p>`)}<p class="muted small" style="margin:-4px 4px 8px">Tap a player, then a hole, to change a score. The order stays put while you edit and settles when you save.</p>${rows}` : `<p class="muted center">No complete scorecards yet.</p>`}
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
    <p class="muted small">${esc(r.name)}: tick the leagues this round should count for. Every phone sees the tables and head-to-heads update.</p>
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
  const ninesBlock = nines.length ? `${h2tip("Nines walked", `Each loop is scored on its own stroke index and course rating, whether it was walked alone or as half of an 18, so the loops can be compared with each other.`)}
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
      <div class="fmtlist">${S.FORMATS.map(f => `<label><input type="checkbox" name="fmt" value="${f}" ${f === "stableford" ? "checked" : ""}> <span><b>${FORMAT_NAMES[f]}</b><small>${FORMAT_MODE[f]} · ${FORMAT_BLURB[f]}</small></span></label>`).join("")}</div>
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

const LEAGUE_TABS = [["standings", "Standings"], ["stats", "Stats"], ["h2h", "Head to head"], ["players", "Players"], ["rounds", "Rounds"], ["settings", "Settings"]];

/**
 * The three dials of the season form tables. They sit on the league whether or not one of those tables
 * is on, so ticking the format later finds them already set.
 */
function slotDials(g) {
  const o = S.slotOpts(g);
  const pick = (name, label, hint, options) => `<label>${label} <span class="muted">${hint}</span>
    <select name="${name}">${options.map(([v, l]) => `<option value="${v}" ${v === o[name] ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
  return `<details class="sub" ${S.cleanFormats(g.formats).some(f => SLOT_FORMATS.includes(f)) ? "open" : ""}>
    <summary>Season form settings</summary>
    <label>Score slots each player owns <span class="muted">(8 is a season)</span><input name="slots" inputmode="numeric" value="${o.slots}"></label>
    ${pick("baseline", "An empty slot counts as", "(how kind the table is to missing weeks)", [
      ["p10", "A poor round — anyone who plays is clear of anyone who does not"],
      ["p25", "A modest round — recommended"],
      ["p50", "An average round — kind to absence"]])}
    ${pick("adjust", "Credit for how the day played", "(against what the rest of the card usually shoots)", [
      ["off", "Off — every round at face value"],
      ["light", "Light"], ["normal", "Normal — recommended"], ["strong", "Strong"]])}
    <p class="muted small">Only the two Season form tables read these.</p>
  </details>`;
}

/** The standings for one way of scoring a league. Every screen and every poster goes through here. */
function standingsFor(g, Ms, members, kind) {
  if (kind === "form") return slotStandings(Ms, members, S.slotOpts(g));
  if (kind === "formstroke") return slotStrokeStandings(Ms, members, S.slotOpts(g));
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
  if (SLOT_FORMATS.includes(kind)) {
    const stroke = kind === "formstroke";
    const val = (v, d = 2) => v === null ? "–" : stroke ? fmtSigned(v, d) : fix(v, d);
    // where they stood before the last card: the movement is most of what a season table is for
    const move = r => !r.moved ? "" : r.moved > 0 ? `<span class="mv up" title="up ${r.moved} since the last card">▲${r.moved}</span>`
      : `<span class="mv down" title="down ${-r.moved} since the last card">▼${-r.moved}</span>`;
    return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Slots</th><th>Form</th><th>+Play</th><th>Total</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}${r.nr ? ` <span class="muted small">(${r.nr} NR)</span>` : ""} ${move(r)}</td><td>${r.played}</td><td>${r.used}/${r.slots}</td><td>${val(r.form)}</td><td>${stroke ? "−" : "+"}${fix(r.presence, 2)}</td><td class="acc">${val(r.total)}</td></tr>`).join("")}</tbody></table>`;
  }
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
    <p class="muted small center" style="margin:8px 0 0">${esc(who)}'s points ${mixed ? "a hole" : "in each round"}, oldest first.${any ? " Grey is what the rest of the field scored that day." : ""} Tap a round for its card.</p></div>`;
}

/** A table row of holes of one kind: how many, what they were played in, what they paid. */
function parRow(label, x) {
  if (!x || !x.holes) return "";
  return `<tr><td class="l">${label}</td><td>${x.holes}</td><td>${fix(x.avg, 2)}</td><td>${fmtSigned(x.vspar, 2)}</td>
    <td class="acc">${fix(x.pts, 2)}</td><td>${pct(x.counts[0] + x.counts[1], x.holes)}%</td></tr>`;
}

/** The columns of a par table in words: every one of them is a different unit. */
const parTableTip = who => `<p>How ${who} plays each kind of hole.</p>
  <p><b>Played</b> is how many holes of that kind have been walked, <b>Avg</b> the average score on one, <b>Vs par</b> how far that average is over or under par, <b>Pts</b> the Stableford points a hole, and <b>Birdie+</b> how often the hole was birdied or better.</p>
  <p>Stableford points measure a score against the handicap: 2 points is exactly your handicap's par, so anything above 2 is a hole played better than your handicap asks for.</p>`;
const BANDS_TIP = `<p>Every scorecard gives each hole a stroke index, the number that ranks the holes from hardest (1) to easiest. Sorted by it, a card falls into three bands: the hardest third, the middle third and the easiest third. On a nine that is three holes each.</p>
  <p>The hardest holes are also where handicap strokes are given, which is why they often pay the most Stableford points even though they are played worst against par.</p>`;
const PAR_TABLE_HEAD = `<thead><tr><th class="l">Holes</th><th>Played</th><th>Avg</th><th>Vs par</th><th>Pts</th><th>Birdie+</th></tr></thead>`;
// a stats table never wraps a heading or a row label: the numbers are what has to line up
const PAR_TABLE = `<table class="stand partab">`;
const parRows = x => Object.keys(x.byPar).sort().map(k => parRow(`Par ${k}`, x.byPar[k])).join("");
const everyHoleRow = x => `<tr class="tot"><td class="l">Every hole</td><td>${x.holes}</td><td>${fix(x.avg, 2)}</td><td>${fmtSigned(x.vspar, 2)}</td>
  <td class="acc">${fix(x.pts, 2)}</td><td>${pct(x.counts[0] + x.counts[1], x.holes)}%</td></tr>`;
const BANDS = ["Hardest third", "Middle third", "Easiest third"];

/** The league as one field: how everybody together plays a hole, and the records they have set. */
function fieldStats(St, nines = "") {
  const F = St.field;
  const rec = (label, r, value) => r ? `<a class="kv" href="#review/${r.id}"><span>${label}</span>
    <span class="muted">${esc(firstName(r.player))} · ${value} · ${esc(shortDate(r.date))}</span></a>` : "";
  const dist = [...St.players].sort((a, b) => pct(parOrBetter(b), b.holes) - pct(parOrBetter(a), a.holes) || a.name.localeCompare(b.name))
    .map(p => `<div class="drow"><div class="dname">${esc(p.name)}<small class="muted">${pct(parOrBetter(p), p.holes)}% par or better</small></div>${distBar(p.counts)}</div>`).join("");
  return `
    <div class="card statcard">
      <div class="dwrap">${donut(F.counts, `${pct(parOrBetter(F), F.holes)}%`, "par or better")}${donutKey(F.counts, F.rounds, "round")}</div>
      <p class="muted small" style="margin:10px 0 0">Every hole this league has played: ${plural(F.holes, "hole")} over ${plural(F.rounds, "round")} on ${plural(F.cards, "card")}.
        A round is worth ${fix(F.avgPts)} points, and a hole is played in ${fmtSigned(F.vspar, 2)} against par.</p>
    </div>
    ${h2tip("Par 3s, 4s and 5s", parTableTip("everyone in this league together"))}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${parRows(F)}${everyHoleRow(F)}</tbody></table>
    ${h2tip("Easy holes and hard ones", BANDS_TIP)}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${F.bands.map((b, i) => parRow(BANDS[i], b)).join("")}</tbody></table>
    ${nines}
    ${h2tip("Who scores what", `One bar a player: every hole they have played in this league, best scores on the left and worst on the right, in the colours of the key just below. The longer the left end, the more often they are at par or better — which is also how the list is sorted.`)}
    <div class="card dists">${inlineKey()}${dist}</div>
    <h2>Records</h2>
    <div class="card">
      ${rec("Best round", F.bestRound, `${F.bestRound ? F.bestRound.pts : ""} pts`)}
      ${rec("Best against par", F.lowRound, F.lowRound ? `${F.lowRound.gross} (${fmtToPar(F.lowRound.topar)})` : "")}
      ${rec("Most birdies", F.mostBirdies && F.mostBirdies.birdies > 1 ? F.mostBirdies : null, F.mostBirdies ? plural(F.mostBirdies.birdies, "birdie") : "")}
      ${F.bounce === null ? "" : `<div class="kv"><span>Bounce back</span><span class="muted">${Math.round(F.bounce * 100)}% of the holes after a bogey or worse were played in par or better</span></div>`}
    </div>`;
}

/** One player: their own shape, then the same numbers for the rest of the field on exactly the days they were there. */
function playerStats(St, p, nines = "", gid = "") {
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
    <p class="muted small" style="margin:6px 4px 0">${p.vsField === null ? "" : (p.beatOf === 1
        ? `${esc(first)} ${p.beat ? "beat" : "did not beat"} the rest of the field in the one round they have shared.`
        : `${esc(first)} beat them in ${p.beat} of those ${p.beatOf} rounds, ${p.vsField >= 0 ? `${fix(p.vsField)} points up overall` : `${fix(-p.vsField)} points behind overall`}.`)}</p>`;
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
    ${h2tip("Against the field", `${esc(first)} on the left of every line, everyone else in this league on the right, over the ${plural(p.played, "round")} they played together — so nobody is measured on a day the others missed. The bar fills in proportion and the green end is whoever is ahead; on strokes against par and on bad holes, ahead means the lower number.${mixedLengths(p.rounds) ? " This league mixes nine- and eighteen-hole rounds, so read the figures given a hole at a time rather than a round at a time." : ""}`)}
    ${vsField}
    ${rivalsBlock(St, p, gid)}
    ${one ? "" : `${h2tip("Round by round", `One bar a round, oldest on the left, so a run of form is a shape rather than a number. The grey column behind a bar is what everyone else in the league scored that day, which is what makes a good round on a hard day look good. Tap a bar for that card.`)}${formChart(p.rounds, first)}`}
    ${one ? `<p class="muted small" style="margin:14px 4px">Form and consistency appear once ${esc(first)} has played a second round here.</p>` : `${h2tip("Over more than one round", `<p><b>Consistency</b> is how far a typical round sits either side of their average: the smaller it is, the steadier they are.</p>
      <p><b>Form</b> is the last three rounds against every round. <b>Trend</b> compares the first half of their rounds with the second half. <b>Streak</b> counts the latest rounds in a row where they beat the rest of the field.</p>
      <p><b>Finishing</b> splits a round in two and gives the points a hole in each half. <b>Bounce back</b> is how often the hole straight after a bogey or worse was played in par or better. <b>Blow-ups</b> counts doubles or worse in a round.</p>`)}<div class="card">
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
    ${h2tip("Par 3s, 4s and 5s", parTableTip(esc(first)))}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${parRows(p)}${everyHoleRow(p)}</tbody></table>
    ${h2tip("Easy holes and hard ones", BANDS_TIP)}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${p.bands.map((b, i) => parRow(BANDS[i], b)).join("")}</tbody></table>
    ${nines}
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
      : l > 0 ? `${me} has tended to play better on the days ${them} does too`
      : `${me} has tended to play better when ${them} is off`);
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
  const unit = `${basisUnit(r.basis)} a ${r.scale ? "round" : "hole"}`;
  const val = v => v === null ? "\u2013" : r.scale ? fix(v * r.scale) : fix(v, 2);
  const l = r.lift === null ? null : r.lift * (r.scale || 18);
  const better = (a, b) => r.lower ? a < b : a > b;
  const mark = l !== null && Math.abs(l) >= 1;  // under a point or a stroke a round the two sides are the same story
  const verdict = rivalVerdict(r, me, them);
  const tile = (label, n, v, up) => `<div class="sside ${up ? "up" : ""}"><small>${label}<i>${plural(n, "round")}${up ? " \u00b7 better" : ""}</i></small><b class="num">${val(v)}</b></div>`;
  const split = r.lift === null
    ? `<p class="muted small" style="margin:10px 0 0">Splitting ${them}'s good days from their bad ones needs two rounds of each; so far ${r.goodN} better than their own average and ${r.badN} worse.${verdict ? ` ${verdict}` : ""}</p>`
    : `<div class="split">
        ${tile(`${them} better than their average`, r.goodN, r.onGood, mark && better(r.onGood, r.onBad))}
        ${tile(`${them} worse than it`, r.badN, r.onBad, mark && better(r.onBad, r.onGood))}
      </div>
      <p class="muted small" style="margin:10px 0 0">Both numbers are ${me}'s ${unit}: on the left the ${plural(r.goodN, "round")} where ${them} played better than their own average of ${val(r.theirAvg)}, on the right the ${r.badN} where they did not. ${verdict}</p>`;
  return `<div class="card rival">
    <div class="rhead"><b>${esc(r.name)}</b><span class="muted small">${plural(r.played, "round")} together \u00b7 ${rivalRecord(r, me, them)}</span></div>
    <div class="tapes mine">${tapeRow(unit, r.myAvg, r.theirAvg, r.lower, val)}</div>
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
function rivalsBlock(St, p, gid) {
  const basis = H2H_BASES.some(([k]) => k === ui.rivalBasis[gid]) ? ui.rivalBasis[gid] : "points";
  const rs = rivals(St.rounds, p.id, basis);
  // points can always be compared, so an empty list there means there is nobody to compare with at all
  if (!rs.length && !rivals(St.rounds, p.id).length) return "";
  const me = esc(firstName(p.name));
  // two players can share a first name, and "Maurits scores better when Maurits is off" helps nobody
  const seen = {};
  for (const n of [p.name, ...rs.map(r => r.name)]) seen[firstName(n)] = (seen[firstName(n)] || 0) + 1;
  const nameOf = r => esc(seen[firstName(r.name)] > 1 ? r.name : firstName(r.name));
  const deep = rs.filter(r => r.played > 1), thin = rs.filter(r => r.played === 1);
  const shown = deep.slice(0, 5), rest = deep.slice(5);
  const mixed = mixedLengths(St.rounds.filter(x => x.pid === p.id));
  return `${h2tip("Against each player", `<p>Only the rounds the two of them played together, so neither is measured on a day the other one missed.${mixed ? " A nine and an eighteen are compared a hole at a time." : ""}</p>
      <p>The line at the top of each card is their two averages against each other, in whatever the tabs below are set to: <b>Stableford</b> points, where more is better, or <b>net</b> or <b>gross</b> strokes, where less is. The two boxes under it split the other player's own days: what ${me} scored on the rounds where that player played better than their own average, and on the rounds where they did not — a rough way of asking whether ${me} rises to a good playing partner or wilts.</p>
      <p>On strokes, a round only one of them finished a card for cannot be compared and is left out, so the rounds counted can differ from the Stableford ones.</p>
      <p>A handful of rounds cannot settle anything, so read these as talking points rather than facts.</p>`)}
    ${basisPicker("rivalbasis", basis)}
    ${rs.length ? "" : `<p class="muted small" style="margin:14px 4px">${me} has no round against anybody where both of them finished a full card, so there is nothing to compare on ${esc(basisUnit(basis))}.</p>`}
    ${shown.map(r => rivalCard(r, me, nameOf(r))).join("")}
    ${rest.length ? `<details class="card"><summary class="small">${plural(rest.length, "more player")}</summary>${rest.map(r => rivalCard(r, me, nameOf(r))).join("")}</details>` : ""}
    ${thin.length ? `<p class="muted small" style="margin:16px 4px 6px">Met once so far, in ${esc(basisUnit(basis))} a ${thin[0].scale ? "round" : "hole"}</p>${rivalRows(thin, me, nameOf)}` : ""}`;
}

/** The finished rounds a league counts, newest first. */
function leagueRounds(gid) {
  const ids = new Set(S.leagueRoundIds(gid));
  return S.rounds().filter(r => ids.has(r.id) && r.status === "done")
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

/** Every loop these rounds contain, ranked player by player: the Nines part of the Stats tab. */
function ninesFieldBlock(gid, rounds, me) {
  const nines = ninesPlayed(rounds);
  if (!nines.length) return "";
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
  return `${h2tip("The nines walked", `This club's loops are rated on their own, so every nine is scored on its own stroke index and course rating, whether it was walked alone or as half of an 18. That makes the cards on one loop comparable, however the day was put together. Pick a loop below; the table then ranks the players on it by average points.`)}
    <div class="chips-wrap">${nines.map(x => `<button class="pchip ${x.slug === pick ? "on" : ""}" data-act="ninetab" data-slug="${esc(x.slug)}">${esc(nineName(x.slug))}<small>${plural(x.played, "card")}</small></button>`).join("")}</div>
    <table class="stand" style="margin-top:12px"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Walked</th><th>Best</th><th>Avg gross</th><th>Avg pts</th></tr></thead>
      <tbody>${table.map((e, i) => `<tr class="${me && e.id === me.id ? "acc" : ""}"><td class="pos">${i + 1}</td><td class="l">${esc(e.name)}</td><td>${e.played}</td>
        <td>${e.bestGross === null ? "–" : e.bestGross}</td><td>${e.avgGross === null ? "–" : fix(e.avgGross)}</td><td class="acc">${fix(e.avgPts)}</td></tr>`).join("")}</tbody></table>`;
}

/** The loops one player has walked in this league, each scored on its own card. */
function ninesPlayerBlock(rounds, pid, first) {
  const nines = ninesPlayed(rounds, pid);
  if (!nines.length) return "";
  return `${h2tip("Nines walked", `Each loop is scored on its own stroke index and course rating, whether ${esc(first)} walked it alone or as half of an 18, so the loops can be compared with each other.`)}
    <table class="stand"><thead><tr><th class="l">Loop</th><th>Walked</th><th>Best</th><th>Avg gross</th><th>Avg pts</th></tr></thead>
      <tbody>${nines.map(x => `<tr><td class="l">${esc(nineName(x.slug))}</td><td>${x.played}</td><td>${x.bestGross === null ? "–" : x.bestGross}</td>
        <td>${x.avgGross === null ? "–" : fix(x.avgGross)}</td><td class="acc">${fix(x.avgPts)}</td></tr>`).join("")}</tbody></table>`;
}

/** The nines of a set of rounds as the poster wants them: one entry per loop, the players inside it. */
function ninesForPoster(rounds, members) {
  const ids = new Set(members);
  const out = [];
  for (const x of ninesPlayed(rounds)) {
    const rows = x.rows.filter(r => r.player.id && ids.has(r.player.id));
    if (!rows.length) continue;
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.player.id)) by.set(r.player.id, { name: r.player.name, gs: [], tp: [], pts: [] });
      const e = by.get(r.player.id);
      if (r.player.gross !== null) { e.gs.push(r.player.gross); e.tp.push(r.player.topar); }
      e.pts.push(r.player.pts);
    }
    const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const gs = rows.filter(r => r.player.gross !== null);
    out.push({
      name: nineName(x.slug), par: (courseBy(x.slug) || {}).course_par ?? 36, cards: rows.length,
      avgPts: avg(rows.map(r => r.player.pts)),
      avgGross: avg(gs.map(r => r.player.gross)), avgTopar: avg(gs.map(r => r.player.topar)),
      players: [...by.values()].map(e => ({ name: e.name, cards: e.pts.length, avgPts: avg(e.pts), avgGross: avg(e.gs) })),
    });
  }
  return out;
}

/** The Stats tab: the field, or any one player of it, chosen at the top. */
function leagueStatsBody(g, Ms, members) {
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return `<p class="muted center" style="margin:30px 0">No finished rounds in this league yet. Every number here appears as soon as one is added.</p>`;
  const who = St.players.some(p => p.id === ui.statsWho[g.id]) ? ui.statsWho[g.id] : "";
  const rounds = leagueRounds(g.id);
  const chips = `<div class="chips-wrap scroll">
    <button class="pchip ${who ? "" : "on"}" data-act="statswho" data-id="">The field<small>${plural(St.field.cards, "card")}</small></button>
    ${St.players.map(p => `<button class="pchip ${p.id === who ? "on" : ""}" data-act="statswho" data-id="${esc(p.id)}">${esc(p.name)}<small>${plural(p.played, "round")}</small></button>`).join("")}</div>`;
  const p = who ? St.players.find(x => x.id === who) : null;
  const body = p ? playerStats(St, p, ninesPlayerBlock(rounds, p.id, firstName(p.name)), g.id)
    : fieldStats(St, ninesFieldBlock(g.id, rounds, S.me()));
  return `${chips}<div class="statsbody">${body}
    <a class="btn" href="#statsposter/${g.id}" style="margin-top:16px">Make stats images ›</a></div>`;
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
      ${formats.length > 1 ? subtabs(formats.map(f => `<button data-act="fmt" data-f="${f}" class="${f === pick ? "on" : ""}">${FORMAT_NAMES[f]}</button>`).join("")) : ""}
      ${standingsTable(pick, standingsFor(g, Ms, members, pick), g, me)}
      ${tip(SLOT_FORMATS.includes(pick) ? slotNote(pick, g) : FORMAT_NOTES[pick], "How this table is scored")}
      <a class="btn" href="#leagueposter/${gid}">Make a standings poster ›</a>
      <button class="btn" data-act="ltab" data-tab="settings" style="margin-top:8px">Score this league another way ›</button>`
      : `<p class="muted center" style="margin:30px 0 14px">No finished rounds in this league yet.</p>
        <button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>
        <button class="btn" data-act="ltab" data-tab="rounds" style="margin-top:8px">Add rounds already played ›</button>`;
  } else if (tab === "stats") {
    body = leagueStatsBody(g, Ms, members);
  } else if (tab === "h2h") {
    // the two of them are compared in whichever currency is picked; a league with a match table opens on its own
    const h2hKind = formats.find(f => f in MATCH_BASIS);
    const h2hBasis = H2H_BASES.some(([k]) => k === ui.h2hBasis[gid]) ? ui.h2hBasis[gid] : (h2hKind ? MATCH_BASIS[h2hKind] : "points");
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
      const [, basisName, roundWord, holeWord] = basisRow(h2hBasis);
      const basis = `${basisPicker("h2hbasis", h2hBasis)}<div class="basis"><span><b>Rounds · stroke play</b>the day goes to ${esc(roundWord)}</span>
        <span><b>Holes · match play</b>each hole goes to ${esc(holeWord)}</span></div>
        ${tip(`<p>This page keeps two scores, and they are two different games. Both are settled on whatever the tabs above are set to — at the moment ${esc(basisName.toLowerCase())}.</p>
          <p><b>Stroke play</b> settles the big score at the top: each round they played together goes to ${esc(roundWord)} that day, whole round against whole round.</p>
          <p><b>Match play</b> settles the hole-by-hole part further down: every hole is its own little contest, won by ${esc(holeWord)}, and all their holes are added up as if every round together had been one long match.</p>
          <p><b>Stableford</b> counts the points, which stop at zero, so two ruined holes are halved. <b>Net score</b> is the strokes taken less the handicap strokes given, and it separates every hole: a 7 beats a 9 even where neither scored a point. <b>Gross score</b> ignores handicaps altogether and compares the cards as they were played, which favours the better player.</p>
          <p>${h2hKind ? `This league keeps a ${esc(FORMAT_NAMES[h2hKind])} table, so that is what it opens on.` : "A round only one of them finished a card for goes to the one who did, the way a hole does."}</p>`, "Match play or stroke play?")}`;
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
          <div class="modeline mid"><span>rounds won on ${esc(basisWord(h2hBasis))}</span></div>
          <div class="vsverdict">${verdict}</div>
          <div class="vs">
            <div class="vsside"><span class="vsdisc a">${esc(inits(A))}</span><span class="vsname">${esc(A)}</span></div>
            <div class="vsnum"><b class="num">${H.winsA}</b><s>&#8211;</s><b class="num">${H.winsB}</b><small>rounds won · ${H.ties ? plural(H.ties, "halved") : "none halved"}</small></div>
            <div class="vsside"><span class="vsdisc b">${esc(inits(B))}</span><span class="vsname">${esc(B)}</span></div>
          </div>
          <div class="tug"><i class="a" style="width:${pc(H.winsA)}"></i><i class="t" style="width:${pc(H.ties)}"></i><i class="b" style="width:${pc(H.winsB)}"></i></div>
          <div class="vsline">${plural(H.rounds.length, "round")} together &middot; ${streak}</div>
        </div>`;
        // Every result in order, newest on the right: the shape of the rivalry at a glance.
        const num = v => v === null ? "NR" : v;
        const formStrip = `${h2tip("Round by round", `Every round they played together, oldest first. Each square is one round and carries the initials of whoever took it on ${esc(basisWord(h2hBasis))}; = means they tied. Tap one to see that card.`)}<div class="vsform">${H.rounds.map(r => `<a class="fdot ${r.winner}" href="#review/${r.id}" title="${esc(fmtDate(r.date))} &middot; ${num(r.scoreA)}&#8211;${num(r.scoreB)}">${r.winner === "tie" ? "=" : esc(inits(r.winner === "a" ? A : B))}</a>`).join("")}</div>
          <p class="muted small center" style="margin:6px 0 0">oldest to newest &middot; tap one for the card</p>`;
        // One bar per stat, filled from the left in proportion, so who is ahead is a shape and not a reading.
        const stats = `${h2tip("The numbers side by side", `${esc(fA)} on the left, ${esc(fB)} on the right, over the rounds they played together. The bar under each line fills in proportion, and the green end is whoever is ahead — on gross scores that is the lower number.`)}<div class="card tapes">
          ${tapeRow("average points", H.avgPtsA, H.avgPtsB, false, fix)}
          ${tapeRow("best round", H.bestPtsA, H.bestPtsB)}
          ${tapeRow("total points", H.ptsA, H.ptsB)}
          ${h2hBasis === "net" ? tapeRow("average net", H.avgNetA, H.avgNetB, true, fix) + tapeRow("best net", H.bestNetA, H.bestNetB, true) : ""}
          ${tapeRow("average gross", H.avgGrossA, H.avgGrossB, true, fix)}
          ${tapeRow("best gross", H.bestGrossA, H.bestGrossB, true)}
          ${H.birdiesA + H.birdiesB ? tapeRow("birdies or better", H.birdiesA, H.birdiesB) : ""}
          ${tapeRow("match play wins", H.matchA, H.matchB)}
        </div>`;
        const holesBlock = `${h2tip("Match play, hole by hole", `Every hole the two of them have played together, each one won by ${esc(holeWord)} — the way a match is played. Add them all up as one long match and that is the bar: ${esc(fA)}'s holes on the left, halved holes in the middle, ${esc(fB)}'s on the right.`)}<div class="card">
          <div class="modeline"><span class="modetag">Match play</span><span>holes won on ${esc(basisWord(h2hBasis))}</span></div>
          <div class="tug big"><i class="a" style="width:${(H.holesA / holes) * 100}%"></i><i class="t" style="width:${(H.holesHalved / holes) * 100}%"></i><i class="b" style="width:${(H.holesB / holes) * 100}%"></i></div>
          <div class="holeskey"><span><b>${H.holesA}</b> ${esc(fA)}</span><span class="muted">${H.holesHalved} halved</span><span><b>${H.holesB}</b> ${esc(fB)}</span></div>
          <p class="muted small" style="margin:10px 0 0">All ${holes} holes together as one long match: ${H.up === 0 ? "dead level" : `${esc(H.up > 0 ? fA : fB)} would be ${Math.abs(H.up)} up`}.</p>
        </div>`;
        const widestLine = widest ? `<p class="muted small" style="margin:-4px 4px 8px">Widest margin: ${esc(widest.winner === "a" ? fA : fB)} by ${widest.margin} ${h2hBasis === "points" ? "points" : "shots"} on ${esc(fmtDate(widest.date))}.</p>` : "";
        const list = `${h2tip("Every round together", `One line a round, newest first: the two ${esc(basisWord(h2hBasis))} totals for that day, the winner's in colour. These are the rounds the big score at the top counts — stroke play, whole round against whole round. The line underneath each date says how the same round went as a match, hole by hole.`)}${widestLine}<div class="list">${[...H.rounds].reverse().map(r => `<a class="h2hrow" href="#review/${r.id}">
          <div class="when"><b>${esc(fmtDate(r.date))}</b><small class="muted">${esc(r.where)} &middot; ${r.up === 0 ? "match halved" : `${Math.abs(r.up)} up ${esc(firstName(r.up > 0 ? A : B))}`}</small></div>
          <div class="sc"><b class="${r.winner === "a" ? "wa" : ""}">${num(r.scoreA)}</b><s>&#8211;</s><b class="${r.winner === "b" ? "wb" : ""}">${num(r.scoreB)}</b></div></a>`).join("")}</div>`;
        body = picker + basis + hero + formStrip + stats + holesBlock + list;
      }
    } else body = `<p class="muted center" style="margin:30px 0">Head-to-heads appear once two players share a round in this league.</p>`;
  } else if (tab === "players") {
    // one card a player, carrying what they are worth to this league: the table's own currency, then their shape
    const St = Ms.length ? leagueStats(Ms, members) : { players: [] };
    const pick = formats.includes(ui.fmtTab[gid]) ? ui.fmtTab[gid] : formats[0];
    const Sp = Ms.length ? standingsFor(g, Ms, members, pick) : { rows: [] };
    const cur = r => pick === "stroke" ? (r.played ? fmtToPar(r.counted) : "–")
      : pick === "formstroke" ? fmtSigned(r.total, 1) : pick === "form" ? fix(r.total, 1)
      : String(pick in MATCH_BASIS ? r.points : r.counted);
    const unit = pick === "stroke" || pick === "formstroke" ? "net" : "pts";
    const SORTS = [["league", "League order"], ["avg", "Average"], ["rounds", "Rounds"], ["par", "Par or better"]];
    const sort = SORTS.some(([k]) => k === ui.plSort[gid]) ? ui.plSort[gid] : "league";
    const rows = St.players.map(p => ({ p, row: Sp.rows.find(r => r.id === p.id) || null,
      hi: (S.state.players.find(x => x.id === p.id) || {}).hi }));
    const cmp = {
      league: (a, b) => (a.row ? a.row.place : 99) - (b.row ? b.row.place : 99),
      avg: (a, b) => (b.p.avgPts ?? -1) - (a.p.avgPts ?? -1),
      rounds: (a, b) => b.p.played - a.p.played || (b.p.avgPts ?? -1) - (a.p.avgPts ?? -1),
      par: (a, b) => pct(parOrBetter(b.p), b.p.holes) - pct(parOrBetter(a.p), a.p.holes),
    }[sort];
    rows.sort((a, b) => cmp(a, b) || a.p.name.localeCompare(b.p.name));
    const card = ({ p, row, hi }) => `<div class="plcard card ${me && p.id === me.id ? "mine" : ""}">
      <a class="ptop" href="#player/${p.id}">
        <span class="prank ${row && row.place <= 3 ? `p${row.place}` : ""}">${row ? row.place : "–"}</span>
        <div class="pmain"><div class="name">${esc(p.name)}${hi === undefined ? "" : ` <small class="muted">index ${fmtIndex(Number(hi))}</small>`}</div>
          <div class="muted small">${plural(p.played, "round")} · ${fix(p.avgPts)} avg${p.wins ? ` · ${plural(p.wins, "win")}` : ""}${p.played > 1 && p.bestPts !== null ? ` · best ${p.bestPts}` : ""}</div></div>
        <b class="pbig num">${row ? cur(row) : "–"}<small>${unit}</small></b><span class="chev">›</span></a>
      ${distBar(p.counts)}
      <div class="pfoot"><span>${pct(parOrBetter(p), p.holes)}% par or better</span><span>${fmtSigned(p.vspar, 2)} a hole</span>
        <span>${p.returns ? `${fmtToPar(Math.round(p.avgTopar))} gross` : "no full card"}</span><span>${ordinal(Math.round(p.avgPlace))} on average</span></div>
      <div class="pacts"><button class="btn small" data-act="pstats" data-id="${esc(p.id)}">Their stats ›</button>
        <button class="btn small" data-act="ph2h" data-id="${esc(p.id)}">Head to head ›</button></div>
    </div>`;
    body = rows.length ? `
      ${tip(`<p>Everyone who has played a round in this league, and what those rounds say about them.</p>
        <p>The big figure on the right of a card is ${pick === "stroke" ? "their net total" : SLOT_FORMATS.includes(pick) ? "their form plus turnout" : pick in MATCH_BASIS ? "their match points" : "their league points"} in the ${esc(FORMAT_NAMES[pick])} table, which is ${FORMAT_MODE[pick].toLowerCase()}. The coloured bar is every hole they have played here, best scores on the left and worst on the right; the key just above the cards says which colour is which.</p>`, "What is on these cards")}
      ${subtabs(SORTS.map(([k, l]) => `<button data-act="plsort" data-s="${k}" class="${k === sort ? "on" : ""}">${l}</button>`).join(""), true)}
      <div class="dkeywrap">${inlineKey()}</div>
      ${rows.map(card).join("")}
      ${members.length > 1 ? `<details class="card"><summary class="small">Two spellings of one person?</summary>
        <p class="muted small">Merge them: every round, score and course handicap moves to the kept name, and the old spelling becomes an alias.</p>
        <div class="merge"><select id="mkeep">${members.map(m => `<option value="${m}">${esc(nameOf(m))}</option>`).join("")}</select><span>←</span><select id="mdrop">${members.map((m, i) => `<option value="${m}" ${i === 1 ? "selected" : ""}>${esc(nameOf(m))}</option>`).join("")}</select></div>
        <button class="btn small" data-act="merge" style="margin-top:8px">Merge into the first name</button></details>` : ""}`
      : `<p class="muted center" style="margin:30px 0 14px">Nobody has played a round in this league yet.</p>
        <button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>`;
  } else if (tab === "rounds") {
    // two lists, not one: what the league counts, with the result on it, then what could be added
    const byDate = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
    const done = S.rounds().filter(r => r.status === "done").sort(byDate);
    const open = S.rounds().filter(r => r.status !== "done").sort(byDate);
    const inL = done.filter(r => attached.has(r.id)), rest = done.filter(r => !attached.has(r.id));
    const card = (r, on) => {
      const c = courseBy(r.course);
      const where = c ? c.loop || c.name : r.name;
      const M = on ? Ms.find(x => x.id === r.id) : null;  // the attached rounds are computed already; the rest stay cheap
      const top = M && M.stbl_board.length ? M.stbl_board[0] : null;
      const mine = M && me ? M.players.find(x => x.id === me.id) : null;
      const q = [fmtDate(r.date), where, r.name, ...r.entries.map(e => e.name)].join(" ").toLowerCase();
      return `<div class="lround card" data-q="${esc(q)}">
        <a href="#review/${r.id}">
          <div class="d">${esc(fmtDate(r.date))}${c && !/holes$/i.test(where) ? ` · ${plural(c.n, "hole")}` : ""}</div>
          <div class="name">${esc(where)}</div>
          ${top ? `<div class="res"><span class="pill done">${esc(firstName(top.name))} ${top.pts} pts</span>
            ${mine ? `<span class="muted small">you ${mine.pts} pts, ${ordinal(mine.splace)} of ${M.field}</span>` : `<span class="muted small">${plural(M.field, "player")}</span>`}</div>`
            : `<div class="who">${r.entries.map(e => `<span class="${me && e.playerId === me.id ? "me" : ""}">${esc(firstName(e.name))}</span>`).join("")}</div>`}
        </a>
        <button class="btn small ${on ? "" : "primary"}" data-act="toggle-round" data-rid="${r.id}" data-on="${on ? 0 : 1}">${on ? "Remove from league" : "Add to league"}</button>
      </div>`;
    };
    body = `<button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>
      ${open.length ? `<div class="list" style="margin-top:12px">${open.map(r => `<a href="${resumeHash(r)}"><div><div class="name">${esc(r.name)}</div><div class="muted small">${esc(roundStatus(r))}</div></div><span class="chev">›</span></a>`).join("")}</div>
        <p class="muted small" style="margin:6px 4px 0">${open.length === 1 ? "That round joins" : "Those rounds join"} this league once it is finished and added here.</p>` : ""}
      <h2>Counting in this league</h2>
      ${inL.length ? `<p class="muted small" style="margin:-4px 4px 10px">${plural(inL.length, "round")}${g.bestN ? `, of which each player's best ${g.bestN} count towards their total` : inL.length > 1 ? ", every one of them counting" : ""}. Tap one for its scores and its cards.</p>
        ${inL.map(r => card(r, true)).join("")}`
        : `<p class="muted small" style="margin:-4px 4px 10px">No rounds yet. Add a finished one below, or start a new one.</p>`}
      <h2>Add a round</h2>
      ${rest.length ? `${rest.length > 6 ? `<input id="rq" class="search" placeholder="Search by date, course or player" autocomplete="off">` : ""}
        <div id="rlist">${rest.map(r => card(r, false)).join("")}</div>`
        : `<p class="muted small" style="margin:-4px 4px 10px">Every finished round is already in this league.</p>`}`;
  } else {
    body = `<form id="gform" class="card form open"><label style="margin-top:0">League name<input name="name" value="${esc(g.name)}"></label>
      <label>Scored by <span class="muted">(pick as many as you like; the first is what the league opens on)</span></label>
      <div class="fmtlist">${S.FORMATS.map(f => `<label><input type="checkbox" name="fmt" value="${f}" ${formats.includes(f) ? "checked" : ""}> <span><b>${FORMAT_NAMES[f]}</b><small>${FORMAT_MODE[f]} · ${FORMAT_BLURB[f]}</small></span></label>`).join("")}</div>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="${g.bestN}"></label>
      ${slotDials(g)}
      <div class="two"><button class="btn primary" type="submit">Save</button>${organiser() ? `<button class="btn danger" type="button" data-act="del-league">Delete league</button>` : ""}</div></form>
      ${g.createdBy ? `<p class="muted small center">Created by ${esc(g.createdBy)}${g.created ? ` on ${esc(fmtDate(g.created))}` : ""}</p>` : ""}`;
  }
  page(g.name, `${subtabs(LEAGUE_TABS.map(([k, l]) => `<button data-act="ltab" data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join(""))}${body}`,
    { back: "#leagues", sub: `${plural(attached.size, "round")} · ${formats.map(f => FORMAT_NAMES[f]).join(", ")}` });
  bind(ev => {
    const b_ = ev.target.closest("[data-act]");
    if (!b_) return;
    if (b_.dataset.act === "ltab") { ui.leagueTab[gid] = b_.dataset.tab; return league(gid); }
    if (b_.dataset.act === "h2hswap") { ui.h2h[gid] = { a: hB, b: hA }; return league(gid); }
    if (b_.dataset.act === "h2hbasis") { ui.h2hBasis[gid] = b_.dataset.b; return league(gid); }
    if (b_.dataset.act === "rivalbasis") { ui.rivalBasis[gid] = b_.dataset.b; return league(gid); }
    if (b_.dataset.act === "ninetab") { ui.nineTab[gid] = b_.dataset.slug; return league(gid); }
    if (b_.dataset.act === "statswho") { ui.statsWho[gid] = b_.dataset.id; return league(gid); }
    if (b_.dataset.act === "plsort") { ui.plSort[gid] = b_.dataset.s; return league(gid); }
    if (b_.dataset.act === "pstats") { ui.statsWho[gid] = b_.dataset.id; ui.leagueTab[gid] = "stats"; return league(gid); }
    if (b_.dataset.act === "ph2h") {
      ui.h2h[gid] = { a: b_.dataset.id, b: members.find(m => m !== b_.dataset.id) };
      ui.leagueTab[gid] = "h2h"; return league(gid);
    }
    if (b_.dataset.act === "fmt") { ui.fmtTab[gid] = b_.dataset.f; return league(gid); }
    if (b_.dataset.act === "new-in-league") { S.setSetting("lastLeague", gid); return go("#new"); }
    if (b_.dataset.act === "toggle-round") { S.setLeagueRound(gid, b_.dataset.rid, b_.dataset.on === "1"); league(gid); }
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
    document.querySelectorAll("#rlist .lround").forEach(l => { l.style.display = !t || l.dataset.q.includes(t) ? "" : "none"; });
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
    Object.assign(g, S.slotOpts({ slots: ev.target.slots.value, baseline: ev.target.baseline.value, adjust: ev.target.adjust.value }));
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

/** Stats as images: the field, the nines, and one poster per player picked. */
function statsPoster(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const { Ms, members } = leagueResults(g);
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return page("Stats images", `<p class="muted center" style="margin:30px 0">No finished rounds in this league yet.</p>`, { back: `#league/${gid}` });
  const N = ninesForPoster(leagueRounds(gid), members);
  const who = St.players.some(p => p.id === ui.statsWho[gid]) ? ui.statsWho[gid] : "";
  const themes = (S.state.settings.themes || ["navy"]).slice(0, 1);
  page("Stats images", `
    <h2>Which images</h2>
    <div class="card checks">
      <label><input type="checkbox" name="si" value="field" checked> How this league scores <span class="muted">&nbsp;(the field over ${plural(St.field.cards, "card")})</span></label>
      ${N.length ? `<label><input type="checkbox" name="si" value="nines" checked> The nines walked <span class="muted">&nbsp;(${plural(N.length, "loop")}, each on its own rating)</span></label>` : ""}
      <label class="muted small" style="margin-top:6px">One image a player</label>
      ${St.players.map(p => `<label><input type="checkbox" name="sp" value="${esc(p.id)}" ${p.id === who ? "checked" : ""}> ${esc(p.name)} <span class="muted">&nbsp;(${plural(p.played, "round")})</span></label>`).join("")}
      <button class="btn small" type="button" data-act="tick-all">Everyone, every theme</button>
    </div>
    <h2>Theme</h2><div class="themes">${themeChips(themes)}</div><div id="out"></div>`,
    { back: `#league/${gid}`, sub: g.name, bar: `<button class="btn primary" data-act="generate">Generate images</button>` });
  app.querySelector(".themes").addEventListener("change", ev => { const l = ev.target.closest(".tchip"); if (l) l.classList.toggle("on", ev.target.checked); });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tick-all") {
      document.querySelectorAll("input[name=si], input[name=sp], input[name=theme]").forEach(i => { i.checked = true; });
      document.querySelectorAll(".tchip").forEach(l => l.classList.add("on"));
      return;
    }
    if (b.dataset.act !== "generate") return;
    const want = [...document.querySelectorAll("input[name=si]:checked")].map(i => i.value);
    const pids = [...document.querySelectorAll("input[name=sp]:checked")].map(i => i.value);
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value);
    if (!want.length && !pids.length) return toast("Tick at least one image");
    if (!chosen.length) return toast("Pick at least one theme");
    S.setSetting("themes", chosen);
    const jobs = [];
    for (const tn of chosen) {
      const T = makeTheme(DATA.themes.find(t => t.name === tn));
      const prefix = chosen.length > 1 ? `${tn}/` : "";
      if (want.includes("field")) jobs.push({ label: `${prefix}6_stats_field.png`, make: () => statsFieldPoster(St, g, T) });
      if (want.includes("nines") && N.length) jobs.push({ label: `${prefix}7_stats_nines.png`, make: () => statsNinesPoster(N, g, T) });
      for (const pid of pids) {
        const p = St.players.find(x => x.id === pid);
        if (p) jobs.push({ label: `${prefix}8_stats_${slugFile(p.name)}.png`, make: () => statsPlayerPoster(St, p, g, T) });
      }
    }
    await runJobs(jobs, `${slugFile(g.name)}_stats`);
  });
}

// ---------------------------------------------------------------- a course typed on the phone
function newCourse() {
  page("New course", `
    ${tip(`<p>For a course the app does not carry yet. You need two things from the clubhouse: the scorecard, which gives the par and the stroke index of every hole, and the club's handicap table, which gives the course rating and the slope for the tee you are playing.</p>
      <p>Course rating is the score a scratch golfer is expected to shoot; slope is how much harder the course gets for everybody else. Together they turn a handicap index into the course handicap the app gives each player.</p>
      <p>The course is sent to every phone in the society straight away.</p>`, "What the club's card and table give you")}
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
    <p class="muted small">Check the numbers read off the photo${st.cards.length > 1 ? "s" : ""}, then say who each row belongs to.</p>
    ${tip(`<p>The rows are in the order they sit on the card, and a number the reader was unsure of is marked in amber — those are worth a second look against the paper.</p>
      <p>Walked 18 as two cards of nine? Pick the same player on both and the two halves become one round for them. Untick a row to leave that player out altogether.</p>`, "Reading a photographed card")}
    ${st.cards.map(cardBlock).join("")}` : "";

  const label = st.busy ? "Reading the card…" : !st.cards.length ? "Take or choose a photo"
    : missing > 0 ? `Take card ${st.cards.length + 1}` : "Scan another photo";
  page("Scan a scorecard", `
    <p class="muted small">Photograph an old paper scorecard, laid flat and in good light. Two cards of nine for one 18-hole round? Take them one after the other.</p>
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
      ${invite ? `<p class="muted small">Invite another phone: let them scan this code, or send them the link. It connects them to ${esc(cfg.label || "this database")} and asks who they are.</p>
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
    ${tip(`Saves a round as a tournament.yaml file, the format the desktop scripts read. Put it in tournaments/&lt;slug&gt;/ on the computer and run <b>python golf.py render</b> to get the same posters and cards at full size.`, "What this file is for")}
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

const screens = { home, welcome, join, new: newRound, loops, players, score, review, attach, graphics, roster, player, leagues, league, leagueposter: leaguePoster, statsposter: statsPoster, settings, newcourse: newCourse, scan,
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
