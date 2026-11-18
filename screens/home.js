// Play: the first tab, and the front door. One big button, and under it only what you can act on now: the round
// you are in, a card somebody put you on, and your society's day. Everything else lives on the other tabs.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as N from "../notify.js";
import { page, bind, esc, go, ui, plural, firstName, ordinal, courseTitle, courseBy, roundStatus, resumeHash, panel, leagueBadge, sheet, toast, atDoor, ICONS } from "../ui.js";
import { handicapFor, stableford, fmtIndex, FORMATS_ROUND, PLAY_GROUPS, PLAY_KINDS, kindOf, isMatchFormat, matchesOf } from "../model.js";
import { leagueResults, standingsFor } from "./formats.js";
import { noteLine } from "./updates.js";
import { comingUp, eventRow, newEvent } from "./event.js";

// the kinds a new card offers; stroke stays only for society stroke days and older cards
export const ROUND_FORMATS = PLAY_KINDS;
export const formatLabel = k => (FORMATS_ROUND.find(f => f.key === k) || FORMATS_ROUND[0]).label;
/** The format a casual card starts in: the last one picked, if it is still on offer. A society's stroke day is not. */
export const offeredFormat = k => k !== "stroke" && FORMATS_ROUND.some(f => f.key === k) ? k : "stableford";
/** This phone hides Stableford points while scoring; a match settled on points always shows them. */
export const pointsHidden = r => !!S.state.settings.hidePoints && !isMatchFormat(r.format);

/** The board while a round is in play: points, or net to par, over the holes each card has played. */
export function liveBoard(r, course = null, { net = false } = {}) {
  const c = course || courseBy(r.course);
  if (!c) return null;
  const rows = [];
  let through = 0;
  for (const e of S.scoringSeats(r)) {
    let info;
    try { info = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.contactId || e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); } catch (err) { continue; }
    let pts = 0, holes = 0, gross = 0, par = 0, strokes = 0;
    e.scores.forEach((v, h) => { if (v === null) return; holes++; gross += v || 10; par += info.par[h]; strokes += info.strokes[h]; if (v > 0) pts += stableford(v, info.par[h], info.strokes[h]); });
    through = Math.max(through, holes);
    rows.push({ id: e.playerId, name: e.name, group: e.group || 1, pts, holes, gross, toPar: gross - par, netToPar: gross - par - strokes });
  }
  const byNet = net || r.format === "stroke" || r.format === "scramble";
  rows.sort((a, b) => (byNet ? a.netToPar - b.netToPar : b.pts - a.pts) || b.holes - a.holes);
  const fmtTo = v => v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
  rows.forEach((x, i) => { x.place = x.holes ? i + 1 : null; x.main = byNet ? `${fmtTo(x.netToPar)} net` : `${x.pts} pts`; x.sub = x.holes ? `thru ${x.holes}` : "not started"; });
  return { rows, through, byNet };
}

export function liveLine(r) {
  if (r.status !== "scoring") return "";
  if (isMatchFormat(r.format)) {
    const c = courseBy(r.course);
    try {
      const seat = S.mySeat(r), ms = c ? matchesOf(c, { ...S.toModelRound(r), final: false }) : [];
      const m = ms.length === 1 ? ms[0] : seat ? ms.find(x => x.group === S.groupOf(seat)) : null;
      return m && m.thru ? `<div class="live">${esc(m.result || m.status)}</div>` : "";
    } catch (e) { return ""; }
  }
  const L = liveBoard(r, null, { net: pointsHidden(r) });
  const v = x => x.main.replace(/ (pts|net)$/, "");
  return L && L.rows.length && L.through ? `<div class="live">through ${L.through} · ${L.rows.slice(0, 3).map((x, i) => `${i + 1}. ${esc(firstName(x.name))} <b>${v(x)}</b>`).join(" · ")}</div>` : "";
}

/** A round in progress as a card. */
export const nowCard = r => `<a class="now" href="${resumeHash(r)}"><div class="k">${r.status === "scoring" ? "Playing now" : "Being set up"} · ${esc(formatLabel(r.format))}</div><div class="name">${esc(r.name)}</div>
    <div class="small" style="opacity:.85">${esc(courseTitle(courseBy(r.course) || { name: r.course }))} · ${roundStatus(r)}</div>${liveLine(r)}<span class="cta">${r.status === "scoring" ? "Continue scoring ›" : "Add players ›"}</span></a>`;

/** A date as the day over the month, the way a diary prints it. */
export const dayBlock = d => {
  const t = d ? new Date(`${d}T12:00:00`) : null;
  return t && !isNaN(t) ? `<span class="dblock"><b>${t.getDate()}</b><small>${t.toLocaleDateString("en-GB", { month: "short" })}</small></span>` : `<span class="dblock"><b>–</b></span>`;
};

/** The one quiet line under the button: what you play off, and where you stand in your first society. */
function glance() {
  const a = A.account(), me = S.me();
  const hi = a && a.hi !== null && a.hi !== undefined ? a.hi : me ? S.currentIndex(me) : null;
  const bits = [];
  if (hi !== null && hi !== undefined) bits.push(`hcp ${fmtIndex(Number(hi))}`);
  const g = S.leagues()[0];
  if (g && me) {
    try {
      const { Ms, members } = leagueResults(g);
      const kind = S.cleanFormats(g.formats)[0];
      const row = standingsFor(g, Ms, members, kind).rows.find(r => r.id === S.myAccount() || r.id === S.identityOf(me.id) || r.id === me.id);
      if (row) bits.push(`${g.name} ${ordinal(row.place)}`);
    } catch (e) { /* a society with nothing in it yet */ }
  }
  return bits.length ? `<a class="glance" href="#stats">${esc(bits.join(" · "))} ›</a>` : "";
}

/** Today's day cards in my societies, which I can come onto with one tap. */
function societyDays() {
  const today = S.today();
  const mine = new Set(S.leagues().map(g => g.id));
  return S.rounds().filter(r => r.leagueId && mine.has(r.leagueId) && r.date === today && r.status !== "done");
}

/** Someone wants me on a card, or a seat on one may be mine. */
const asks = () => N.held().filter(n => !n.seen && ["round_seated", "league_invite"].includes(n.kind));

export function home() {
  const rounds = S.rounds();
  // an event is on the go for me once my group has a score; until then it waits under Coming up
  const myGroupOff = r => { const s = S.mySeat(r); return !!s && r.entries.some(e => S.groupOf(e) === S.groupOf(s) && e.scores.some(v => v !== null)); };
  const open = rounds.filter(r => r.status !== "done" && (S.iPlayed(r) || S.isScorer(r)) && (!r.event || myGroupOff(r)));
  const events = comingUp().filter(r => !open.includes(r));
  const days = societyDays().filter(r => !open.includes(r) && !r.event);
  const banners = [];
  if (Y.sync.status === "error") banners.push(`<button class="banner warn" data-act="retry">Couldn't sync: ${esc(Y.sync.error || "")}. Tap to retry.</button>`);
  if (Y.sync.status === "signedout") banners.push(`<a class="banner warn" href="#welcome">Signed out. Everything is kept on this phone; sign in to keep syncing.</a>`);
  if (window.__updateReady) banners.push(`<button class="banner accent" data-act="update">A new version is ready. Tap to reload.</button>`);
  if (S.state.settings.movedSeen !== 1 && rounds.length) banners.push(`<div class="banner accent moved"><b>Things moved.</b> Play starts here. Your rounds and numbers are under Stats, friends and settings under Me. <button class="btn small" data-act="moved-ok">Got it</button></div>`);
  const cur = open[0];
  const hero = cur
    ? `<a class="playbtn cont" href="${resumeHash(cur)}"><span class="pk">${esc(formatLabel(cur.format))} · ${esc(cur.name)}</span><b>${cur.status === "scoring" ? `Continue · hole ${Math.min(S.holeOf(cur) + 1, (courseBy(cur.course) || {}).n || 18)}` : "Continue"}</b>${liveLine(cur)}</a>
       <button class="btn wide" data-act="play">${ICONS.plus} Start another round</button>`
    : `<button class="playbtn" data-act="play"><b>Play</b><span class="pk">Stroke play, Stableford, match play or scramble</span></button>`;
  const others = open.slice(1);
  const ask = asks();
  page("Hagolf", `
    ${banners.join("")}
    <section class="playhero">${hero}${glance()}</section>
    ${panel("flag", "Coming up", `<div class="rows">${events.map(eventRow).join("")}<button class="hrow more" data-act="new-event"><span class="t"><b>New event</b><span>A day for a group: the field, tee times, the draw and a live board</span></span></button></div>`)}
    ${others.length ? panel("play", "Also on the go", `<div class="rows">${others.map(r => `<a class="hrow" href="${resumeHash(r)}"><span class="t"><b>${esc(r.name)}</b><span>${esc(formatLabel(r.format))} · ${esc(roundStatus(r))}</span></span><span class="chev">›</span></a>`).join("")}</div>`) : ""}
    ${ask.length ? panel("friend", "Asked to join", `<div class="rows">${ask.map(n => noteLine(n)).join("")}</div>`) : ""}
    ${days.length ? panel("leagues", "Today in your society", `<div class="rows">${days.map(r => {
      const g = S.getLeague(r.leagueId), seated = !!S.mySeat(r);
      return `<div class="hrow lead">${leagueBadge(g)}<span class="t"><b>${esc(g ? g.name : r.name)}</b><span>${esc(courseTitle(courseBy(r.course) || { name: r.course }))} · ${plural(r.entries.filter(e => e.role !== "team").length, "player")}</span></span>
        ${seated ? `<a class="btn small" href="${resumeHash(r)}">Open</a>` : `<button class="btn small primary" data-act="dayjoin" data-rid="${esc(r.id)}">I'm playing</button>`}</div>`;
    }).join("")}</div>`) : ""}
    <p class="center quietlinks"><button class="linkish" data-act="have-link">Have a link or a code?</button>${atDoor() ? ` · <a href="#get">Put Hagolf on this phone</a>` : ""}</p>`,
    { back: "", tabs: "home", brand: "center" });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "play") return formatSheet();
    if (act === "retry") { await Y.pushAndPull(); return home(); }
    if (act === "update") { if (window.__updateWorker) window.__updateWorker.postMessage("skipWaiting"); return; }
    if (act === "moved-ok") { S.setSetting("movedSeen", 1); return home(); }
    if (act === "have-link") return haveLink();
    if (act === "new-event") return newEvent();
    if (act === "dayjoin") { const { joinDay } = await import("./together.js"); return joinDay(b.dataset.rid); }
  });
}

/**
 * How are you playing? Two taps: the group (how the ball is played), then the kind inside it, and the card opens.
 * Both steps are one sheet, so the second replaces the first in place. The last kind played is lit, with its group.
 */
export async function formatSheet() {
  const last = offeredFormat(S.state.settings.lastFormat), on = kindOf(last);
  const groups = PLAY_GROUPS.filter(g => g.kinds.length);
  const TITLE = "How are you playing?";
  const tile = (attr, label, blurb, lit) => `<button class="fmttile ${lit ? "on" : ""}" ${attr}><b>${esc(label)}</b><small>${esc(blurb)}</small></button>`;
  const first = `<div class="fmtgrid rows">${groups.map(g => tile(`data-grp="${g.key}"`, g.label, g.blurb, g.kinds.some(k => k.key === on))).join("")}</div>
    <p class="center"><a class="linkish" href="#scan" data-sheet="scan">Scan a paper card instead ›</a></p>`;
  const second = g => `<div class="fmtgrid rows">${g.kinds.map(k => tile(`data-sheet="${k.key}"`, k.label, k.blurb, k.key === on)).join("")}</div>
    <p class="center"><button class="linkish" data-back>‹ ${esc(TITLE)}</button></p>`;
  const v = await sheet({ title: TITLE, body: `<div id="fmtstep">${first}</div>`, onOpen: el => {
    const box = el.querySelector("#fmtstep"), h = el.querySelector("h3");
    el.addEventListener("click", ev => {
      const g = ev.target.closest("[data-grp]");
      if (g) { const G = groups.find(x => x.key === g.dataset.grp); h.textContent = G.label; box.innerHTML = second(G); return; }
      if (ev.target.closest("[data-back]")) { h.textContent = TITLE; box.innerHTML = first; }
    });
  } });
  if (!v) return;
  if (v === "scan") return go("#scan");
  // the same kind again keeps strokes or points as it was last played
  S.setSetting("lastFormat", kindOf(last) === v ? last : v);
  ui.eventFor = null;
  go(`#new`);
}

/** A link or a code pasted in: an installed iPhone app cannot catch links, so this is how an invite reaches it. */
export async function haveLink() {
  const v = await sheet({ title: "Have a link or a code?", lead: "Paste an invite link, or type the code you were given.",
    body: `<form id="linkf"><input name="v" autocomplete="off" autocapitalize="off" placeholder="https://… or a 10-letter code"></form>`,
    actions: [{ label: "Open it", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }],
    onOpen: (el, close) => { const f = el.querySelector("#linkf"); f.v.focus(); f.addEventListener("submit", e => { e.preventDefault(); window.__linkV = f.v.value; close("ok"); }); el.querySelector("[data-sheet=ok]").addEventListener("click", () => { window.__linkV = f.v.value; }, { once: true }); } });
  const text = String(window.__linkV || "").trim();
  window.__linkV = null;
  if (v !== "ok" || !text) return;
  const hash = text.includes("#") ? text.slice(text.indexOf("#")) : null;
  if (hash && /^#(j|join|add|you|board|card)\//.test(hash)) return go(hash);
  if (/^[a-z0-9]{10}$/i.test(text)) return go(`#j/${text.toLowerCase()}`);
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return go(`#join/${text}`);
  toast("That doesn't look like a Hagolf link or code");
}
