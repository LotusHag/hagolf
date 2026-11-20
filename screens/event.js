// An event: a day of golf planned ahead. The organiser sets the field, the tee times, the teams and the draw;
// on the day it is the tee sheet every group starts from. It stays one card, so every group scores on it and
// one live board reads it. A society's event counts for the society the way any of its day cards does.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as Y from "../sync.js";
import * as Mo from "../model.js";
import { page, bind, esc, go, toast, plural, firstName, ordinal, fmtDate, courseTitle, courseBy, noCourse, sheet, confirmSheet, formSheet, ui, onDesk, monthShort , roundName} from "../ui.js";
import { runsIt } from "./league.js";
import { formatLabel } from "./home.js";
import { seatMe, liveSheet } from "./together.js";
import { addSheet, inviteSheet, refreshTeam, dropRound } from "./players.js";

/** Whoever runs a card: its owner, or an organiser of the society whose day it is. */
export const runsCard = r => {
  const me = S.myAccount();
  if (!r.owner || r.owner === me) return true;
  const g = r.leagueId && S.getLeague(r.leagueId);
  return !!g && runsIt(g);
};

const planOf = r => ({ times: [], teams: [], ...(r.event || {}) });
const people = r => r.entries.filter(e => e.role !== "team");
const scrambleMatch = f => String(f || "").startsWith("scramblematch");
const minutes = t => { const [h, m] = String(t || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const clock = mins => `${String(Math.floor(((mins % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((mins % 60) + 60) % 60).padStart(2, "0")}`;
const holeName = (c, h) => `${ordinal(c.first_hole + (h || 1) - 1)}`;
export const halfPts = n => n === 0.5 ? "½" : `${Math.floor(n)}${n % 1 ? "½" : ""}`;

function savePlan(r, patch) { r.event = { ...planOf(r), ...patch }; S.saveRound(r); }

/** A slot for every group: the ones the organiser set, then the same gap again (a shotgun moves on a hole instead). */
function slots(r, c, k) {
  const t = planOf(r).times.map(x => ({ ...x }));
  const gap = t.length > 1 ? minutes(t[t.length - 1].t) - minutes(t[t.length - 2].t) : 10;
  while (t.length < k) {
    const last = t[t.length - 1];
    t.push(!last ? { t: null, h: 1 } : gap === 0 && t.length > 1 ? { t: last.t, h: last.h % c.n + 1 } : { t: last.t ? clock(minutes(last.t) + gap) : null, h: last.h });
  }
  return t;
}

/** Every seat starts on its group's hole, until it has a score. */
function syncStarts(r, c) {
  if (!planOf(r).times.length) return;
  const sl = slots(r, c, Math.max(1, ...r.entries.map(S.groupOf)));
  for (const e of r.entries) {
    const h = (sl[S.groupOf(e) - 1] || {}).h || 1;
    if ((e.fromHole || 1) !== h && e.scores.every(v => v === null)) { e.fromHole = h; S.saveEntry(r, e); }
  }
}

/** A scramble plays one ball a team: a group is one team, or in a scramble match its two sides are. Made again whenever the groups change. */
function rebuildTeams(r, c) {
  const old = r.entries.filter(e => e.role === "team");
  if (!Mo.isTeamFormat(r.format) && !old.length) return;
  if (old.some(e => e.scores.some(v => v !== null))) return toast("Teams already have scores; move players on the card itself");
  // a member's side is its team's id; it goes back to the team's A or B before the teams are made again
  for (const e of people(r)) if (e.role === "member") { const t = old.find(x => x.playerId === e.side); e.role = "player"; e.side = t && (t.side === "A" || t.side === "B") ? t.side : e.side === "A" || e.side === "B" ? e.side : null; S.saveEntry(r, e); }
  for (const t of old) S.removeEntry(r, r.entries.indexOf(t));
  if (!Mo.isTeamFormat(r.format)) return;
  const vs = scrambleMatch(r.format);
  for (const g of Mo.groupsOf(people(r))) {
    const mine = people(r).filter(e => S.groupOf(e) === g);
    for (const sd of vs ? ["A", "B"] : [null]) {
      const ms = mine.filter(e => !sd || e.side === sd);
      if (!ms.length) continue;
      const t = S.addTeam(r, c.n, { name: "Team", members: ms.map(e => e.playerId), tee: ms[0].tee || r.defaultTee, group: g });
      t.squad = ms[0].squad || 0;
      if (sd) t.side = sd;
      refreshTeam(r, c, t);
    }
  }
}

/** What a group is doing now: handed in, on the course, or still to go off. */
function groupState(r, g, slot) {
  if (S.groupIn(r, g)) return "in";
  const seats = r.entries.filter(e => S.groupOf(e) === g && e.role !== "member");
  const thru = Math.max(0, ...seats.map(e => e.scores.filter(v => v !== null).length));
  if (thru) return `thru ${thru}`;
  return slot && slot.t ? (r.date === S.today() ? `due ${slot.t}` : "") : "";
}

const sideOf = (r, e) => {
  if (e.role !== "member") return e.side;
  const t = r.entries.find(x => x.role === "team" && (x.members || []).some(m => m === e.playerId || m === e.name));
  return t ? t.side : null;
};

/**
 * The tee sheet: one row a group, its time and hole, who is in it and how it stands. Shared by the event page
 * and the public live board, which hands in its own round and its own matches.
 */
export function teeSheet(r, c, { matches = [], tap = false } = {}) {
  const P = planOf(r), ps = people(r);
  const gs = Mo.groupsOf(ps), sl = slots(r, c, gs.length ? gs[gs.length - 1] : 1);
  const match = Mo.isMatchFormat(r.format);
  const nameBtn = e => tap ? `<button class="linkish" data-act="move" data-pid="${esc(e.playerId)}">${esc(e.name)}</button>` : esc(e.name);
  const team = k => P.teams[k - 1] ? P.teams[k - 1] : "";
  return `<div class="rows evsheet">${gs.map(g => {
    const mine = ps.filter(e => S.groupOf(e) === g), slot = sl[g - 1] || {};
    const m = match ? matches.find(x => x.group === g) : null;
    const who = match && mine.some(e => sideOf(r, e))
      ? ["A", "B"].map(sd => mine.filter(e => sideOf(r, e) === sd).map(nameBtn).join(" & ") || "–").join(" <i class=\"vsmark\">v</i> ")
      : mine.map(nameBtn).join(", ");
    const sides = m && m.squads && P.teams.length ? `${team(m.squads.A)} v ${team(m.squads.B)}` : P.teams.length && !match ? [...new Set(mine.map(e => team(e.squad)).filter(Boolean))].join(", ") : "";
    // who leads the match goes in words under the names; the margin alone is the number on the right
    const ahead = m && m.thru && m.leader ? `${m.sides[m.leader].map(firstName).join(" & ")} ${m.result ? "won" : "up"}` : m && m.result ? "halved" : "";
    const state = [groupState(r, g, slot), ahead].filter(Boolean).join(" · ");
    return `<div class="hrow lead evrow">
      ${tap ? `<button class="dblock tblock" data-act="slot" data-g="${g}">` : `<span class="dblock tblock">`}<b class="num">${esc(slot.t || "–")}</b><small>${esc(holeName(c, slot.h))}</small>${tap ? "</button>" : "</span>"}
      <span class="t"><span class="evnames">${who}</span><span>${esc([`Group ${g}`, sides, state].filter(Boolean).join(" · "))}</span></span>
      ${m && m.thru ? `<span class="v">${esc(m.leader ? m.margin : "AS")}</span>` : S.groupIn(r, g) ? `<span class="v ok">✓</span>` : ""}</div>`;
  }).join("")}</div>`;
}

/** The teams in a team event, with what they have won so far and what they would have if every match ended now. */
export function teamTable(rows) {
  return `<div class="ranking">${rows.map((x, i) => `<div class="rankrow ${i === 0 && x.live ? "p1" : ""}"><span class="pos">${i + 1}</span>
    <span class="t"><b>${esc(x.name)}</b><small>${esc([`${x.won} won`, `${x.halved} halved`, `${x.lost} lost`, x.live !== x.pts ? `${halfPts(x.live)} as it stands` : ""].filter(Boolean).join(" · "))}</small></span>
    <span class="v">${halfPts(x.pts)}</span></div>`).join("")}</div>`;
}

function matchesNow(r, c) {
  if (!Mo.isMatchFormat(r.format)) return [];
  try { return Mo.matchesOf(c, { ...S.toModelRound(r), final: false }); } catch (e) { return []; }
}

// ---------------------------------------------------------------- making one
/** New event: the course picker of Play, then this page. A society's event is attached to it from the start. */
export function newEvent(leagueId = null) {
  if (!A.signedIn()) { toast("Sign in to run an event"); return go("#home"); }
  ui.eventFor = { leagueId: leagueId || null };
  go("#new");
}

export function createEvent(slug, leagueId) {
  const c = courseBy(slug), tees = Object.keys(c.tees);
  const g = leagueId && S.getLeague(leagueId);
  const fmt = g && ["stroke", "gpstroke", "elostroke"].includes(S.cleanFormats(g.formats)[0]) ? "stroke" : "stableford";
  const r = S.createRound({ course: slug, name: g ? `${g.name} at ${c.name}` : `${c.name} event`, date: S.today(), defaultTee: tees.includes("yellow") ? "yellow" : tees[0],
    allowance: 100, format: fmt, leagueId: leagueId || null });
  r.event = { times: [], teams: [] };
  S.saveRound(r);
  if (leagueId) S.setLeagueRound(leagueId, r.id, true);
  ui.eventNew = r.id;
  go(`#event/${r.id}`);
}

// ---------------------------------------------------------------- the organiser's sheets
// stroke play and Stableford are one card to play, but an event's board ranks on one of them
const EVENT_KINDS = { stableford: ["Stableford", "the board ranked on points"], stroke: ["Stroke play", "the board ranked on net score"] };
const eventLabel = k => (EVENT_KINDS[k] || [formatLabel(k)])[0];

async function detailsSheet(r) {
  const match = Mo.isMatchFormat(r.format);
  const [v, f] = await formSheet({ title: "The event", body: `
    <label>Name<input name="name" value="${esc(r.name)}"></label>
    <label>Date<input name="date" type="date" value="${esc(r.date || "")}"></label>
    <p class="pickline">How it is played</p>
    <div class="card radios">${Mo.FORMATS_ROUND.map(x => `<label class="radiorow"><input type="radio" name="fmt" value="${x.key}" ${r.format === x.key ? "checked" : ""}><span><b>${esc(eventLabel(x.key))}</b><small>${esc((EVENT_KINDS[x.key] || [])[1] || x.blurb)}</small></span></label>`).join("")}</div>
    ${match ? "" : `<label>Handicap allowance<select name="allow">${[100, 95, 90, 85, 75].map(a => `<option value="${a}" ${Number(r.allowance) === a ? "selected" : ""}>${a}%</option>`).join("")}</select></label>`}`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }] });
  if (v !== "ok" || !f) return;
  const was = r.format;
  r.name = String(f.get("name") || "").trim() || r.name;
  r.date = f.get("date") || r.date;
  r.format = f.get("fmt") || r.format;
  if (f.get("allow") !== null) r.allowance = Number(f.get("allow")) || 100;
  if (!Mo.isMatchFormat(r.format) && planOf(r).teams.length) r.event = { ...planOf(r), teams: [] };
  S.saveRound(r);
  if (was !== r.format && people(r).some(e => S.groupOf(e) > 1)) toast("The format changed: draw the groups again", 4000);
}

async function timesSheet(r, c) {
  const P = planOf(r), k = Math.max(Mo.groupsOf(people(r)).length, Mo.groupSizes(people(r).length, 4).length, 1);
  const first = (P.times[0] || {}).t || "09:00";
  const shotgun = P.times.length > 1 && P.times.every(x => x.t === P.times[0].t);
  const [v, f] = await formSheet({ title: "Tee times", lead: "Every group gets a time and a hole. Change one by tapping its time on the tee sheet.", body: `
    <div class="two"><label>First tee<input name="first" type="time" value="${esc(first)}"></label>
      <label>Groups<input name="k" inputmode="numeric" value="${k}"></label></div>
    <div class="card radios">${[["tee", "Off the 1st", "one group after another"], ["shotgun", "Shotgun", "everyone at once, each group on its own hole"]].map(([val, label, sub]) =>
      `<label class="radiorow"><input type="radio" name="start" value="${val}" ${(val === "shotgun") === shotgun ? "checked" : ""}><span><b>${label}</b><small>${sub}</small></span></label>`).join("")}</div>
    <label>Minutes between groups<select name="gap">${[7, 8, 9, 10, 11, 12, 15].map(m => `<option value="${m}" ${m === 10 ? "selected" : ""}>${m}</option>`).join("")}</select></label>`,
    actions: [{ label: "Set the times", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }] });
  if (v !== "ok" || !f) return;
  const n = Math.max(1, Math.min(60, Math.floor(Number(f.get("k")) || k))), start = minutes(f.get("first")) ?? 540, gap = Number(f.get("gap")) || 10;
  const gun = f.get("start") === "shotgun";
  savePlan(r, { times: Array.from({ length: n }, (_, i) => gun ? { t: clock(start), h: i % c.n + 1 } : { t: clock(start + i * gap), h: 1 }) });
  syncStarts(r, c);
}

async function slotSheet(r, c, g) {
  const sl = slots(r, c, g)[g - 1];
  const [v, f] = await formSheet({ title: `Group ${g}`, body: `<div class="two">
      <label>Time<input name="t" type="time" value="${esc(sl.t || "")}"></label>
      <label>Starts on<select name="h">${c.par.map((_, i) => `<option value="${i + 1}" ${sl.h === i + 1 ? "selected" : ""}>${holeName(c, i + 1)}</option>`).join("")}</select></label></div>`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }] });
  if (v !== "ok" || !f) return;
  const times = slots(r, c, g);
  times[g - 1] = { t: f.get("t") || null, h: Number(f.get("h")) || 1 };
  savePlan(r, { times });
  syncStarts(r, c);
}

async function teamsSheet(r) {
  const P = planOf(r), n = P.teams.length;
  const names = k => Array.from({ length: k }, (_, i) => P.teams[i] || ["Red", "Blue", "Gold", "Green", "White", "Black"][i] || `Team ${i + 1}`);
  const [v, f] = await formSheet({ title: "Teams", lead: "Every match is two teams. A win is a point for the winner's team, a halved match half each.", body: `
    <label>How many teams<select name="k">${[0, 2, 3, 4, 5, 6].map(k => `<option value="${k}" ${k === n ? "selected" : ""}>${k ? k : "No teams"}</option>`).join("")}</select></label>
    ${names(6).map((x, i) => `<label class="teamname" ${i >= Math.max(n, 2) ? "hidden" : ""}>Team ${i + 1}<input name="t${i}" value="${esc(x)}"></label>`).join("")}`,
    actions: [{ label: "Split the field evenly", value: "split", kind: "primary" }, { label: "Keep who is in which", value: "keep" }, { label: "Cancel", value: "no" }] });
  if (!["split", "keep"].includes(v) || !f) return;
  const k = Number(f.get("k")) || 0;
  const teams = Array.from({ length: k }, (_, i) => String(f.get(`t${i}`) || "").trim() || `Team ${i + 1}`);
  savePlan(r, { teams });
  const ps = people(r);
  // dealt down the handicaps, so no team is stacked
  const piles = k ? Mo.snake(ps, k, e => Number(e.hi) || 0) : [ps];
  piles.forEach((pile, i) => { for (const e of pile) { const sq = k && (v === "split" || !e.squad || e.squad > k) ? i + 1 : k ? e.squad : 0; if (e.squad !== sq) { e.squad = sq; S.saveEntry(r, e); } } });
}

async function drawSheet(r, c) {
  const ps = people(r), match = Mo.isMatchFormat(r.format), P = planOf(r);
  if (ps.length < 2) return toast("Add the field first");
  const vs = scrambleMatch(r.format);
  const choices = !match ? [[4, "Fourballs", "groups of up to four, as even as they come"], [3, "Threeballs", "groups of up to three"]]
    : vs ? [[2, "Two against two", "one ball a pair"]] : [[2, "Two against two", "better ball"], [1, "One against one", "singles"]];
  const [v, f] = await formSheet({ title: "Draw the groups", lead: `${plural(ps.length, "player")}${P.teams.length ? `, ${P.teams.length} teams: every match is one team against another` : ""}. Tap a name on the tee sheet afterwards to move it.`,
    body: `<div class="card radios">${choices.map(([k, label, sub], i) => `<label class="radiorow"><input type="radio" name="n" value="${k}" ${i ? "" : "checked"}><span><b>${label}</b><small>${sub}</small></span></label>`).join("")}</div>`,
    actions: [{ label: "Draw at random", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }] });
  if (v !== "ok" || !f) return;
  if (ps.some(e => e.scores.some(x => x !== null)) && !await confirmSheet("Draw again?", "Some players already have scores; they keep them, in their new group.", { label: "Draw again" })) return;
  const n = Number(f.get("n"));
  const byId = new Map(ps.map(e => [e.playerId, e]));
  const res = Mo.drawGroups(ps.map(e => e.playerId), match ? { perSide: n, squadOf: P.teams.length ? id => byId.get(id).squad : null } : { size: n });
  const put = (id, g, side) => { const e = byId.get(id); if (S.groupOf(e) !== g || (e.side || null) !== side) { e.group = g; e.side = side; S.saveEntry(r, e); } };
  res.groups.forEach((x, i) => { if (x.players) x.players.forEach(id => put(id, i + 1, null)); else ["A", "B"].forEach(sd => x[sd].forEach(id => put(id, i + 1, sd))); });
  res.left.forEach(id => put(id, res.groups.length + 1, null));
  rebuildTeams(r, c);
  syncStarts(r, c);
  if (res.left.length) toast(`${plural(res.left.length, "player")} without a match: in group ${res.groups.length + 1} to place by hand`, 5000);
}

/** One golfer by hand: another group, the other side, another team. */
async function moveSheet(r, c, e) {
  const P = planOf(r), gs = Mo.groupsOf(people(r)), match = Mo.isMatchFormat(r.format);
  const next = (gs[gs.length - 1] || 0) + 1;
  const [v, f] = await formSheet({ title: e.name, body: `
    <p class="pickline">Group</p><div class="card radios">${[...gs, next].map(g => `<label class="radiorow"><input type="radio" name="g" value="${g}" ${S.groupOf(e) === g ? "checked" : ""}><span><b>${g === next ? "A new group" : `Group ${g}`}</b>
      <small>${esc(people(r).filter(x => S.groupOf(x) === g && x !== e).map(x => firstName(x.name)).join(", "))}</small></span></label>`).join("")}</div>
    ${match ? `<p class="pickline">Side</p><div class="card radios">${["A", "B"].map(sd => `<label class="radiorow"><input type="radio" name="side" value="${sd}" ${e.side === sd ? "checked" : ""}><span><b>Side ${sd}</b></span></label>`).join("")}</div>` : ""}
    ${P.teams.length ? `<p class="pickline">Team</p><div class="card radios">${P.teams.map((t, i) => `<label class="radiorow"><input type="radio" name="sq" value="${i + 1}" ${e.squad === i + 1 ? "checked" : ""}><span><b>${esc(t)}</b></span></label>`).join("")}</div>` : ""}`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }, { label: `Take ${firstName(e.name)} out`, value: "out", kind: "danger" }] });
  if (v === "out") {
    if (await confirmSheet(`Take ${e.name} out of the event?`, e.scores.some(x => x !== null) ? "Their scores go too." : "", { label: "Take out", danger: true })) {
      for (const t of r.entries.filter(x => x.role === "team" && x.members.includes(e.playerId))) S.setTeamMembers(r, t, t.members.filter(m => m !== e.playerId));
      S.removeEntry(r, r.entries.indexOf(e));
    }
    return;
  }
  if (v !== "ok" || !f) return;
  e.group = Number(f.get("g")) || S.groupOf(e);
  if (f.get("side")) e.side = f.get("side");
  if (f.get("sq")) e.squad = Number(f.get("sq"));
  S.saveEntry(r, e);
  rebuildTeams(r, c);
  syncStarts(r, c);
}

async function sendDraw(r) {
  try {
    await Y.push();
    const res = await A.api(`/round/${r.id}/eventdraw`, {});
    toast(res.told ? `Sent to ${plural(res.told, "player")}` : "Nobody on the field has the app yet; share the link instead", 4000);
  } catch (e) { toast(e.message, 5000); }
}

/** Somebody new on an event: the smallest group, the shorter side of its match, the smaller team. */
export function seatOnEvent(r, c, e) {
  const others = people(r).filter(x => x !== e), gs = Mo.groupsOf(others);
  const n = g => others.filter(x => S.groupOf(x) === g).length;
  e.group = gs.length <= 1 ? gs[0] || 1 : gs.reduce((best, g) => (n(g) < n(best) ? g : best), gs[0]);
  if (Mo.isMatchFormat(r.format)) {
    const mates = others.filter(x => S.groupOf(x) === e.group), on = sd => mates.filter(x => sideOf(r, x) === sd).length;
    e.side = on("A") <= on("B") ? "A" : "B";
  }
  const k = planOf(r).teams.length, onTeam = i => others.filter(x => x.squad === i).length;
  if (k && !e.squad) e.squad = Array.from({ length: k }, (_, i) => i + 1).sort((x, y) => onTeam(x) - onTeam(y))[0];
  S.saveEntry(r, e);
  rebuildTeams(r, c);
  syncStarts(r, c);
}

/** I'm in: a society member comes onto its event themself; the organiser just takes a seat. */
async function joinEvent(r, c) {
  if (!A.signedIn()) return toast("Sign in first");
  try { if (r.owner !== S.myAccount()) await A.api(`/round/${r.id}/dayjoin`, {}); } catch (e) { return toast(e.message, 5000); }
  if (r.owner !== S.myAccount()) await Y.pull();
  const e = seatMe(r);
  if (!e) return toast("Set your name and handicap under Me first");
  seatOnEvent(r, c, e);
  toast("You're in");
}

// ---------------------------------------------------------------- the page
export function event(rid) {
  const r = S.getRound(rid);
  if (!r || !r.event) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  if (S.isScorer(r)) S.settleDay(r);
  const P = planOf(r), runs = runsCard(r), done = r.status === "done";
  const ps = people(r), mine = S.mySeat(r), g = mine ? S.groupOf(mine) : 0;
  const sl = mine ? slots(r, c, g)[g - 1] : null;
  const ms = matchesNow(r, c);
  const started = mine && r.entries.some(e => S.groupOf(e) === g && e.scores.some(v => v !== null));
  const canJoin = !mine && !done && A.signedIn() && (runs || (r.leagueId && S.getLeague(r.leagueId)));
  const lg = r.leagueId ? S.getLeague(r.leagueId) : null;

  const me = done ? `<a class="btn primary wide" href="#review/${rid}">The results</a>`
    : mine ? `<div class="card todaycard"><div><div class="k caps">${r.date === S.today() ? "Today" : esc(fmtDate(r.date))}</div>
        <div class="name">${sl && sl.t ? `You're off at ${esc(sl.t)}` : "You're in"}</div>
        <div class="muted small">${esc([`group ${g}`, sl ? `from the ${holeName(c, sl.h)}` : "", P.teams[mine.squad - 1] || ""].filter(Boolean).join(" · "))}</div></div>
        <a class="btn primary" href="${started || r.status === "done" ? `#score/${rid}/${S.holeOf(r)}` : `#players/${rid}/${g}`}">${started ? "Open my card" : "Tee off"}</a></div>`
    : canJoin ? `<button class="btn primary wide" data-act="join">I'm in</button>` : "";
  const teams = P.teams.length && Mo.isMatchFormat(r.format) ? `<h2>Teams</h2>${teamTable(Mo.teamPoints(ms, P.teams))}` : "";
  const sheetHead = `<h2>${Mo.groupsOf(ps).length > 1 || P.times.length ? "Tee sheet" : "The field"} <small class="muted">${plural(ps.length, "player")}</small></h2>`;
  const field = ps.length ? teeSheet(r, c, { matches: ms, tap: runs && !done }) : `<p class="muted">Nobody yet.${runs ? " Add the field below, or send the invite link." : ""}</p>`;
  const row = (act, title, sub) => `<button class="hrow" data-act="${act}"><span class="t"><b>${esc(title)}</b><span>${esc(sub)}</span></span><span class="chev">›</span></button>`;
  const run = runs && !done ? `<h2>Run it</h2><div class="rows">
      ${row("details", "The event", `${eventLabel(r.format)}${Mo.isMatchFormat(r.format) || r.allowance === 100 ? "" : ` · ${r.allowance}%`}`)}
      ${row("add", "Add to the field", "friends, people you played with, guests")}
      ${row("invite", "Invite by link", lg ? `members of ${lg.name} can also tap I'm in` : "whoever opens it takes a seat")}
      ${row("times", "Tee times", P.times.length ? `${P.times[0].t || "–"}${P.times.length > 1 ? ` · ${plural(P.times.length, "group")}` : ""}${P.times.length > 1 && P.times.every(x => x.t === P.times[0].t) ? " · shotgun" : ""}` : "not set")}
      ${Mo.isMatchFormat(r.format) ? row("teams", "Teams", P.teams.length ? P.teams.join(" v ") : "none: every match stands alone") : ""}
      ${row("draw", "Draw the groups", "at random; tap a name above to move it")}
      ${row("send", "Send the draw", "everyone on the field is told their time, hole and group")}
      ${row("live", "Live board", r.live ? "on: anyone with the link follows it" : "a link for the clubhouse screen and home")}
      ${r.status !== "setup" ? row("close", "Close the day", "every card counts as it stands") : ""}
    </div>${r.status === "setup" ? `<p class="center" style="margin-top:18px"><button class="btn small danger" data-act="drop">Cancel the event</button></p>` : ""}` : "";
  const sub = [fmtDate(r.date), courseTitle(c), eventLabel(r.format), lg ? lg.name : ""].filter(Boolean).join(" · ");
  const desk = onDesk() && run;
  page(roundName(r), desk ? `<div class="evgrid"><div>${me}${teams}${sheetHead}${field}</div><div>${run}</div></div>` : `${me}${teams}${sheetHead}${field}${run}`,
    { back: lg ? `#league/${lg.id}/days` : "#home", sub, bell: false, wide: !!desk });
  if (ui.eventNew === rid) { ui.eventNew = null; detailsSheet(r).then(() => event(rid)); }
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    // these wait on the server: the button says so until the page is drawn again
    if (["join", "send", "live"].includes(act)) b.disabled = true;
    if (act === "join") await joinEvent(r, c);
    else if (act === "details") { await detailsSheet(r); rebuildTeams(r, c); }
    else if (act === "add") {
      const was = new Set(r.entries);
      await addSheet(r, c);
      for (const e of r.entries.filter(x => !was.has(x) && x.role !== "team")) seatOnEvent(r, c, e);
    }
    else if (act === "invite") return inviteSheet(r);
    else if (act === "times") await timesSheet(r, c);
    else if (act === "slot") await slotSheet(r, c, Number(b.dataset.g));
    else if (act === "teams") { await teamsSheet(r); rebuildTeams(r, c); }
    else if (act === "draw") await drawSheet(r, c);
    else if (act === "move") { const e = r.entries.find(x => x.playerId === b.dataset.pid); if (e) await moveSheet(r, c, e); }
    else if (act === "send") await sendDraw(r);
    else if (act === "live") await liveSheet(r);
    else if (act === "drop") return dropRound(rid);
    else if (act === "close") {
      const out = [...new Set(r.entries.filter(x => !x.signed).map(S.groupOf))];
      if (!await confirmSheet("Close the day?", out.length ? `${out.length === 1 ? `Group ${out[0]} has` : `Groups ${out.join(", ")} have`} not handed in. Their cards count as they stand.` : "Every group is in.", { label: "Close the day" })) return;
      r.status = "done"; S.saveRound(r);
      return go(`#review/${rid}`);
    }
    event(rid);
  });
}

/** Events I am on or my societies hold, from today on: what Play lists under its button. */
export function comingUp() {
  const today = S.today(), mine = new Set(S.leagues().map(g => g.id));
  return S.rounds().filter(r => r.event && r.status !== "done" && (r.date || "") >= today && (S.mySeat(r) || (r.leagueId && mine.has(r.leagueId)) || runsCard(r)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String((planOf(a).times[0] || {}).t || "").localeCompare(String((planOf(b).times[0] || {}).t || "")));
}

/** One event as a row: the day, the name, and my tee time once there is one. */
export function eventRow(r) {
  const c = courseBy(r.course), mine = S.mySeat(r), P = planOf(r);
  const sl = mine && c ? slots(r, c, S.groupOf(mine))[S.groupOf(mine) - 1] : null;
  const t = new Date(`${r.date}T12:00:00`);
  const when = sl && sl.t ? `you're off ${sl.t}` : mine ? "you're in" : plural(people(r).length, "player");
  return `<a class="hrow lead" href="#event/${esc(r.id)}"><span class="dblock"><b>${isNaN(t) ? "–" : t.getDate()}</b><small>${isNaN(t) ? "" : monthShort(t)}</small></span>
    <span class="t"><b>${esc(r.name)}</b><span>${esc([c ? courseTitle(c) : r.course, eventLabel(r.format), P.teams.length ? P.teams.join(" v ") : "", when].filter(Boolean).join(" · "))}</span></span><span class="chev">›</span></a>`;
}
