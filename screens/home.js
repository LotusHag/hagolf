// Home: the honours board. One centred masthead, the round in play given the whole top of the screen, then
// where you stand and what you last played as ruled rows. Nothing here names a colour of its own, so all
// hundred themes carry it: only the accent, the ink and the hairline.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as N from "../notify.js";
import { page, bind, esc, plural, firstName, ordinal, fmtDate, courseTitle, courseBy, roundStatus, resumeHash, roundWhere, safeCompute, isIOS, isStandalone } from "../ui.js";
import { compute, handicapFor, stableford } from "../model.js";
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

/** The round in progress as a card, for the Play tab, which lists several of them at once. */
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

/** Nothing on the go: the same centred block, asking for a round instead of reporting one. */
const noRound = () => `<section class="inplay"><div class="rule"></div>
  <div class="k quiet">No round in play</div>
  <p class="where">Start one and Hagolf keeps the card.</p></section>
  <a class="btn primary plate" href="#new">Start a round</a>`;

/** The rounds open behind the one in the hero. */
const alsoOpen = rs => rs.length ? `${sect("Also on the go")}<div class="rows">${rs.map(r => `<a class="hrow" href="${resumeHash(r)}">
  <span class="t"><b>${esc(r.name)}</b><span>${esc(roundWhere(r))} · ${esc(roundStatus(r))}</span></span><span class="chev">›</span></a>`).join("")}</div>` : "";

/** Every league this player is on, scored the way that league opens, with their own place in the accent. */
function myLeagues(me) {
  const rows = [];
  for (const g of S.leagues()) {
    const { Ms, members } = leagueResults(g);
    const kind = S.cleanFormats(g.formats)[0];
    const row = me ? standingsFor(g, Ms, members, kind).rows.find(r => r.id === me.id) : null;
    const suffix = row ? ordinal(row.place).slice(String(row.place).length) : "";
    rows.push(`<a class="hrow" href="#league/${g.id}"><span class="t"><b>${esc(g.name)}</b>
      <span>${row ? `${standingValue(kind, row)} from ${plural(row.played, "round")}` : `${plural(S.leagueRoundIds(g.id).length, "round")} · ${FORMAT_NAMES[kind]}`}</span></span>
      ${row ? `<span class="v top">${row.place}<small>${suffix}</small></span>` : `<span class="chev">›</span>`}</a>`);
  }
  return rows.length ? `${sect("Your standing", rows.length > 4 ? `<a href="#leagues">All leagues</a>` : "")}
    <div class="rows">${rows.slice(0, 4).join("")}</div>` : "";
}

function lastRound(me) {
  const mine = S.rounds().filter(r => r.status === "done" && r.entries.some(e => e.playerId === me.id));
  if (!mine.length) return "";
  const r = mine[0], M = safeCompute(compute, r);
  const p = M ? M.players.find(x => x.id === me.id) : null;
  return `${sect("Last round", `<a href="#player/${me.id}">All rounds</a>`)}
    <div class="rows"><a class="hrow" href="#review/${r.id}">
      <span class="t"><b>${esc(roundWhere(r))}</b><span>${esc(fmtDate(r.date))}${p ? ` · ${ordinal(p.splace)} of ${M.field}` : ""}</span></span>
      <span class="v">${p ? p.pts : "–"}<small class="u"> PTS</small></span></a></div>`;
}

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
  const finished = rounds.filter(r => r.status === "done");
  const fresh = N.held().filter(n => !n.seen).slice(0, 3);
  const a = A.account();
  page("Hagolf", `
    ${a ? `<p class="cardline caps">${esc(firstName(a.name))}${a.hi != null ? ` · Handicap ${esc(String(a.hi))}` : ""}</p>` : ""}
    ${banners.join("")}
    ${open.length ? inPlay(open[0]) : noRound()}
    ${alsoOpen(open.slice(1))}
    ${fresh.length ? `${sect("New", `<a href="#updates">All updates</a>`)}<div class="rows">${fresh.map(n => noteLine(n, true)).join("")}</div>` : ""}
    ${me ? myLeagues(me) : ""}
    ${me ? lastRound(me) : ""}
    ${!open.length && !finished.length && !S.leagues().length ? starters() : ""}
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
