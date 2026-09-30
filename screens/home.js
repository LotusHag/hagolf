// Home: the honours board. A round in play takes the whole top of the screen; with nothing on the go the
// player takes it instead, and home never asks for a round -- starting one lives under Rounds. Then where you
// stand and what you last played, as ruled rows. Nothing here names a colour of its own, so all hundred
// themes carry it: only the accent, the ink and the hairline.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as N from "../notify.js";
import { page, bind, esc, plural, firstName, ordinal, shortDate, courseTitle, courseBy, roundStatus, resumeHash, roundWhere, roundClub, roundLoop, safeCompute, isIOS, isStandalone } from "../ui.js";
import { compute, handicapFor, stableford, fix, fmtIndex } from "../model.js";
import { leagueResults, standingsFor, standingValue, FORMAT_NAMES } from "./formats.js";
import { noteLine } from "./updates.js";
import { resyncNow } from "./me.js";

/** Points so far for a round in progress, by entered holes: the live board. */
export function liveBoard(r) {
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

export function liveLine(r) {
  if (r.status !== "scoring") return "";
  const L = liveBoard(r);
  return L && L.rows.length && L.through ? `<div class="live">through ${L.through} · ${L.rows.slice(0, 3).map((x, i) => `${i + 1}. ${esc(firstName(x.name))} <b>${x.pts}</b>`).join(" · ")}</div>` : "";
}

/** The round in progress as a card, for the Rounds tab, which lists several of them at once. */
export const nowCard = r => `<a class="now" href="${resumeHash(r)}"><div class="k">${r.status === "scoring" ? "Playing now" : "Being set up"}</div><div class="name">${esc(r.name)}</div>
    <div class="small" style="opacity:.85">${esc(courseTitle(courseBy(r.course) || { name: r.course }))} · ${roundStatus(r)}</div>${liveLine(r)}<span class="cta">${r.status === "scoring" ? "Continue scoring ›" : "Add players ›"}</span></a>`;

/** A section label with the hairline running off it, and an optional link at the far end. */
const sect = (label, link = "") => `<div class="sect"><span class="caps">${esc(label)}</span><span class="fill"></span>${link}</div>`;

/** The round in play, given the top of the screen: an accent rule, the name, the board, one button. */
function inPlay(r) {
  const c = courseBy(r.course);
  const L = liveBoard(r);
  const top = L ? L.rows.slice(0, 3) : [];
  const thru = r.status === "scoring" && L && L.through ? `Through ${L.through}${c ? ` of ${c.n}` : ""}`
    : `${plural(r.entries.length, "player")} · not started`;
  return `<section class="inplay"><div class="rule"></div>
    <div class="k">${r.status === "scoring" ? "In play" : "Being set up"}</div>
    <h1>${esc(r.name)}</h1>
    <p class="where">${esc(courseTitle(c || { name: r.course }))}</p></section>
    ${top.length ? `<div class="board">${top.map((x, i) => `<div><span class="p">${i + 1}</span><span class="who">${esc(x.name)}</span><span class="v">${x.pts}</span></div>`).join("")}</div>` : ""}
    <p class="thru caps">${esc(thru)}</p>
    <a class="btn primary plate" href="${resumeHash(r)}">${r.status === "scoring" ? "Continue scoring" : "Add players"}</a>`;
}

const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/**
 * Nothing on the go: the same centred block with the player in it instead of a round. Home never asks for a
 * round, so what stands at the top is who they are and how they have been playing.
 */
function meHero(a, me, mine) {
  const name = (a && a.name) || (me && me.name) || "";
  const hi = a && a.hi != null ? a.hi : (me ? S.currentIndex(me) : null);
  const pts = mine.map(x => x.pts).filter(v => v !== null);
  const wins = mine.filter(x => x.win).length;
  const where = hi === null || hi === undefined ? "" : `Handicap ${esc(fmtIndex(Number(hi)))}`;   // the rounds are in the strip below
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  return `<section class="inplay"><div class="rule"></div>
    <div class="k quiet">${esc(today())}</div>
    ${name ? `<h1>${esc(firstName(name))}</h1>` : ""}
    ${where ? `<p class="where">${where}</p>` : ""}</section>
    ${pts.length ? `<div class="mecard herostats"><div class="stats">${tile(pts.length, plural(pts.length, "round").split(" ")[1])}
      ${tile(fix(pts.reduce((x, y) => x + y, 0) / pts.length), "avg pts")}${tile(Math.max(...pts), "best")}
      ${wins ? tile(wins, plural(wins, "win").split(" ")[1]) : ""}</div></div>` : ""}`;
}

/** The rounds open behind the one in the hero. */
const alsoOpen = rs => rs.length ? `${sect("Also on the go")}<div class="rows">${rs.map(r => `<a class="hrow" href="${resumeHash(r)}">
  <span class="t"><b>${esc(r.name)}</b><span>${esc(roundWhere(r))} · ${esc(roundStatus(r))}</span></span><span class="chev">›</span></a>`).join("")}</div>` : "";

/** Every league this player is on, scored the way that league opens, with their own place in the accent. */
function myLeagues(me) {
  const rows = [];
  for (const g of S.leagues()) {
    const { Ms, members } = leagueResults(g);
    const kind = S.cleanFormats(g.formats)[0];
    // a league collapses a claimed contact into its account, so my line is under my identity as often as my id
    const row = me ? standingsFor(g, Ms, members, kind).rows.find(r => r.id === S.identityOf(me.id) || r.id === me.id) : null;
    const suffix = row ? ordinal(row.place).slice(String(row.place).length) : "";
    rows.push(`<a class="hrow" href="#league/${g.id}"><span class="t"><b>${esc(g.name)}</b>
      <span>${row ? `${standingValue(kind, row)} from ${plural(row.played, "round")}` : `${plural(S.leagueRoundIds(g.id).length, "round")} · ${FORMAT_NAMES[kind]}`}</span></span>
      ${row ? `<span class="v top">${row.place}<small>${suffix}</small></span>` : `<span class="chev">›</span>`}</a>`);
  }
  return rows.length ? `${sect("Your standing", rows.length > 4 ? `<a href="#leagues">All leagues</a>` : "")}
    <div class="rows">${rows.slice(0, 4).join("")}</div>` : "";
}

/** Every finished round I have a line in, newest first. */
function myRounds(me) {
  const out = [];
  for (const r of S.rounds()) {
    if (r.status !== "done" || !r.entries.some(e => e.playerId === me.id)) continue;
    const M = safeCompute(compute, r);
    const p = M ? M.players.find(x => x.id === me.id) : null;
    out.push({ r, field: M ? M.field : 0, pts: p ? p.pts : null, place: p ? p.splace : null, win: !!p && p.splace === 1 && M.field > 1 });
  }
  return out;
}

/** The last few cards as ruled rows: the club, then the day, the loop and where you came, then the points. */
const recent = (me, mine) => mine.length ? `${sect(mine.length === 1 ? "Last round" : "Recent rounds", `<a href="#player/${me.id}">All rounds</a>`)}
  <div class="rows">${mine.slice(0, 3).map(({ r, field, pts, place }) => `<a class="hrow" href="#review/${r.id}">
    <span class="t"><b>${esc(roundClub(r))}</b><span>${[shortDate(r.date), roundLoop(r), place ? `${ordinal(place)} of ${field}` : ""].filter(Boolean).map(esc).join(" · ")}</span></span>
    <span class="v">${pts === null ? "–" : pts}<small class="u"> PTS</small></span></a>`).join("")}</div>` : "";

/** A phone with nothing on it yet: the two things worth doing first. */
const starters = () => `${sect("To begin")}<div class="rows">
  <a class="hrow" href="#leagues"><span class="t"><b>Join a league</b><span>With a link from the organiser, or start your own</span></span><span class="chev">›</span></a>
  <a class="hrow" href="#people"><span class="t"><b>Find your friends</b><span>Search by name, or share your link</span></span><span class="chev">›</span></a></div>`;

export function home() {
  const rounds = S.rounds();
  const me = S.me();
  const banners = [];
  if (Y.sync.status === "error") banners.push(`<button class="banner warn" data-act="retry">Couldn't sync: ${esc(Y.sync.error || "")}. Tap to retry.</button>`);
  if (Y.sync.status === "signedout") banners.push(`<a class="banner warn" href="#welcome">Signed out. Everything is kept on this phone; sign in to keep syncing.</a>`);
  if (window.__updateReady) banners.push(`<button class="banner accent" data-act="update">A new version is ready. Tap to reload.</button>`);
  if (window.__installPrompt) banners.push(`<button class="banner" data-act="install">Install Hagolf on this phone</button>`);
  else if (isIOS() && !isStandalone() && !S.state.settings.installHintSeen) banners.push(`<div class="banner act muted"><span>To install: tap Share <span class="ios-share">⎋</span> in Safari, then “Add to Home Screen”.</span><button class="x" data-act="hide-install" aria-label="Dismiss">×</button></div>`);
  const open = rounds.filter(r => r.status !== "done");
  const mine = me ? myRounds(me) : [];
  const fresh = N.held().filter(n => !n.seen).slice(0, 3);
  const a = A.account();
  page("Hagolf", `
    ${banners.join("")}
    ${open.length ? inPlay(open[0]) : meHero(a, me, mine)}
    ${alsoOpen(open.slice(1))}
    ${fresh.length ? `${sect("New", `<a href="#updates">All updates</a>`)}<div class="rows">${fresh.map(n => noteLine(n, true)).join("")}</div>` : ""}
    ${me ? myLeagues(me) : ""}
    ${me ? recent(me, mine) : ""}
    ${!rounds.length && !S.leagues().length ? starters() : ""}
    ${Y.enabled() && Y.sync.status !== "error" && !rounds.length && !S.leagues().length && S.state.settings.welcomed ? `<p class="center"><button class="btn ghost small" data-act="resync">Nothing here yet? Fetch everything again</button></p>` : ""}`,
    { back: "", tabs: "home", brand: "center" });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "retry") { await Y.pushAndPull(); return home(); }
    if (b.dataset.act === "resync") return resyncNow();
    if (b.dataset.act === "hide-install") { S.setSetting("installHintSeen", true); return home(); }
    if (b.dataset.act === "update") { if (window.__updateWorker) window.__updateWorker.postMessage("skipWaiting"); }
    if (b.dataset.act === "install" && window.__installPrompt) { window.__installPrompt.prompt(); window.__installPrompt = null; }
  });
}
