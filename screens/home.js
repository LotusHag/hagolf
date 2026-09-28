// Home: what is happening now, and one button. A round in progress is the hero; otherwise it is Start a round,
// then what is new, where you stand, and what you last played.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as N from "../notify.js";
import { page, bind, esc, go, ui, plural, firstName, ordinal, fmtDate, courseTitle, courseBy, roundStatus, resumeHash, roundWhere, safeCompute, isIOS, isStandalone, ICONS, emptyState } from "../ui.js";
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

/** The round in progress, as the hero: what it is, where it stands, and Continue. */
export const nowCard = r => `<a class="now" href="${resumeHash(r)}"><div class="k">${r.status === "scoring" ? "Playing now" : "Being set up"}</div><div class="name">${esc(r.name)}</div>
    <div class="small" style="opacity:.85">${esc(courseTitle(courseBy(r.course) || { name: r.course }))} · ${roundStatus(r)}</div>${liveLine(r)}<span class="cta">${r.status === "scoring" ? "Continue scoring ›" : "Add players ›"}</span></a>`;

/** Every league this player is on, scored the way that league opens. */
function myLeagues(me) {
  const rows = [];
  for (const g of S.leagues()) {
    const { Ms, members } = leagueResults(g);
    const kind = S.cleanFormats(g.formats)[0];
    const row = me ? standingsFor(g, Ms, members, kind).rows.find(r => r.id === me.id) : null;
    rows.push(`<a href="#league/${g.id}"><span class="lead">${ICONS.trophy}<div><div class="name">${esc(g.name)}</div>
      <div class="muted small">${row ? `${FORMAT_NAMES[kind]} · ${plural(row.played, "round")}` : `${plural(S.leagueRoundIds(g.id).length, "round")} · ${FORMAT_NAMES[kind]}`}</div></div></span>
      ${row ? `<span class="pill done">${ordinal(row.place)} · ${standingValue(kind, row)}</span>` : `<span class="chev">›</span>`}</a>`);
  }
  return rows.length ? `<h2>Your leagues</h2><div class="list">${rows.slice(0, 4).join("")}</div>${rows.length > 4 ? `<p class="center"><a class="muted small" href="#leagues">All leagues ›</a></p>` : ""}` : "";
}

function lastRoundCard(me) {
  const mine = S.rounds().filter(r => r.status === "done" && r.entries.some(e => e.playerId === me.id));
  if (!mine.length) return "";
  const r = mine[0], M = safeCompute(compute, r);
  const p = M ? M.players.find(x => x.id === me.id) : null;
  return `<div class="h2row"><h2>Your last round</h2><a class="muted small" href="#player/${me.id}">All your rounds ›</a></div>
    <a class="mecard" href="#review/${r.id}"><div class="row">
    <div><div class="name">${esc(roundWhere(r))}</div><div class="muted small">${esc(fmtDate(r.date))}${p ? ` · ${ordinal(p.splace)} of ${M.field}` : ""}</div></div>
    <span class="res"><span class="big num">${p ? p.pts : "–"}<small>pts</small></span></span></div></a>`;
}

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
  const hour = new Date().getHours(), greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const a = A.account();
  page("Hagolf", `
    <div class="hero"><p class="hi">${greet}${a ? `, ${esc(firstName(a.name))}` : ""}</p></div>
    ${banners.join("")}
    ${open.map(nowCard).join("")}
    ${open.length ? "" : `<a class="btn primary big" href="#new">${ICONS.plus} Start a round</a>`}
    ${fresh.length ? `<div class="h2row"><h2>New</h2><a class="muted small" href="#updates">All updates ›</a></div><div class="list">${fresh.map(n => noteLine(n, true)).join("")}</div>` : ""}
    ${me ? myLeagues(me) : ""}
    ${me ? lastRoundCard(me) : ""}
    ${!open.length && !finished.length && !S.leagues().length ? `<div class="list"><a href="#leagues"><span class="lead">${ICONS.trophy}<div><div class="name">Join a league</div><div class="muted small">With a link from the organiser, or start your own</div></div></span><span class="chev">›</span></a>
      <a href="#people"><span class="lead">${ICONS.people}<div><div class="name">Find your friends</div><div class="muted small">Search by name, or share your link</div></div></span><span class="chev">›</span></a></div>` : ""}
    ${Y.enabled() && Y.sync.status !== "error" && !rounds.length && !S.leagues().length && S.state.settings.welcomed ? `<p class="center"><button class="btn ghost small" data-act="resync">Nothing here yet? Fetch everything again</button></p>` : ""}`,
    { back: "", tabs: "home", brand: true });
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
