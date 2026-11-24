// An event: a series of rounds with one field. Making one is four questions (how many rounds, which loop each,
// who plays, and whether places are left open); on the day it is the board across every round, the board of the
// round being played, everybody's cards, and the button that starts yours. Each round stays an ordinary event card
// (#event/<round>): its own tee sheet, draw and live board.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import * as Y from "../sync.js";
import { page, bind, esc, go, ui, toast, plural, firstName, fmtDate, shortDate, courseTitle, courseBy, sheet, formSheet, confirmSheet, shareLink, subtabs, avatar } from "../ui.js";
import { fmtIndex } from "../model.js";
import { liveBoard } from "./home.js";
import { runsIt } from "./league.js";
import { seatMe } from "./together.js";
import { seatOnEvent } from "./event.js";
import { previewPage } from "./gate.js";

const KINDS = { stableford: "Stableford: points added up", stroke: "Stroke play: net strokes added up" };
const OPEN = { none: "Nobody: I fill every place", society: "Members of the society tap I'm in", link: "Anyone I send the link to" };
const OPEN_SHORT = { none: "you fill every place", society: "members tap I'm in", link: "anyone with the link" };

/** Whoever runs an event: its maker, or an organiser of its society. */
export const runsSeries = e => !!e && (!e.owner || e.owner === S.myAccount() || (!!e.leagueId && !!S.getLeague(e.leagueId) && runsIt(S.getLeague(e.leagueId))));
const roundOf = r => { const t = r.name.replace(/^.*, /, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

// ---------------------------------------------------------------- making one
/** The first question: what it is called, how many rounds, how it is scored, and who may take an open place. */
export async function newSeries(leagueId = null) {
  if (!A.signedIn()) { toast("Sign in to run an event"); return go("#home"); }
  const g = leagueId && S.getLeague(leagueId);
  const [v, f] = await formSheet({ title: "New event", lead: "Then a course for each round, and who plays.", body: `
    <label>Name<input name="name" value="${esc(g ? `${g.name} cup` : "")}" placeholder="e.g. Club weekend" required></label>
    <div class="two"><label>Rounds<select name="n">${[1, 2, 3, 4].map(k => `<option value="${k}">${k}</option>`).join("")}</select></label>
      <label>First round<input name="date" type="date" value="${S.today()}"></label></div>
    <p class="pickline">The board</p><div class="card radios">${Object.entries(KINDS).map(([k, t], i) => `<label class="radiorow"><input type="radio" name="fmt" value="${k}" ${i ? "" : "checked"}><span><b>${esc(t.split(":")[0])}</b><small>${esc(t.split(": ")[1])}</small></span></label>`).join("")}</div>`,
    actions: [{ label: "Pick the courses", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }] });
  // opened from a link to #newevent, the step is left the way it was come to
  if (v !== "ok" || !f) { if (location.hash.startsWith("#newevent")) history.back(); return; }
  const name = String(f.get("name") || "").trim() || (g ? `${g.name} cup` : "Event");
  ui.eventFor = { leagueId: leagueId || null, plan: { name, n: Number(f.get("n")) || 1, date: f.get("date") || S.today(), format: f.get("fmt") === "stroke" ? "stroke" : "stableford" }, picked: [] };
  pickNext();
}

function pickNext() {
  const ef = ui.eventFor, k = ef.picked.length + 1;
  ef.label = ef.plan.n > 1 ? `${ef.plan.name} · round ${k} of ${ef.plan.n}` : ef.plan.name;
  if (location.hash === "#new") dispatchEvent(new HashChangeEvent("hashchange")); else go("#new");
}

/** A course picked on Play's course screen for the event being made: the next round's, or the last, which makes it. */
export function seriesCourse(slug) {
  const ef = ui.eventFor;
  ef.picked.push(slug);
  if (ef.picked.length < ef.plan.n) return pickNext();
  ui.eventFor = null;
  const { name, n, date, format } = ef.plan;
  const e = S.newEventRecord({ name, leagueId: ef.leagueId, format });
  ef.picked.forEach((s, i) => {
    const c = courseBy(s), tees = Object.keys(c.tees);
    const r = S.createRound({ course: s, name: n > 1 ? `${name}, round ${i + 1}` : name, date: addDays(date, i), defaultTee: tees.includes("yellow") ? "yellow" : tees[0],
      allowance: 100, format, leagueId: ef.leagueId });
    r.eventId = e.id;
    r.event = { times: [], teams: [] };
    S.saveRound(r);
    if (ef.leagueId) S.setLeagueRound(ef.leagueId, r.id, true);
  });
  ui.seriesNew = e.id;
  go(`#series/${e.id}`);
}

// ---------------------------------------------------------------- the boards
/** Everybody's rounds added up: points, or net strokes, over the holes each has played so far. */
function overall(e, rounds) {
  const net = e.format === "stroke", by = new Map();
  for (const r of rounds) {
    const L = liveBoard(r, null, { net });
    if (!L) continue;
    for (const x of L.rows) {
      if (!x.holes) continue;
      const seat = r.entries.find(s => s.playerId === x.id), k = seat ? S.seatIdentity(seat) : x.id;
      const t = by.get(k) || { name: x.name, pts: 0, net: 0, holes: 0, rounds: 0 };
      t.pts += x.pts; t.net += x.netToPar; t.holes += x.holes; t.rounds++;
      by.set(k, t);
    }
  }
  return [...by.values()].sort((a, b) => (net ? a.net - b.net : b.pts - a.pts) || b.holes - a.holes);
}

const toPar = v => v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
function ranking(rows, net, sub) {
  if (!rows.length) return `<p class="muted">Nobody has a score yet.</p>`;
  return `<div class="ranking">${rows.map((x, i) => `<div class="rankrow"><span class="pos">${i + 1}</span>
    <span class="t"><b>${esc(x.name)}</b><small>${esc(sub(x))}</small></span><span class="v num">${net ? toPar(x.net ?? x.netToPar) : x.pts}</span></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- taking part
/** Onto a round of the event in my own seat, and to its page, where my card starts. */
async function teeOff(r) {
  const c = courseBy(r.course);
  if (!S.mySeat(r)) {
    const e = seatMe(r);
    if (!e) return toast("Set your name and handicap under Me first");
    seatOnEvent(r, c, e);
  }
  go(`#event/${r.id}`);
}

/** Every place in the field on a round, so its groups can be drawn: an account in its own seat, a golfer as it is. */
function fieldOnRound(e, r) {
  const c = courseBy(r.course), friends = F.held().friends;
  let n = 0;
  for (const s of S.fieldOf(e.id)) {
    if (r.entries.some(x => (s.account && x.accountId === s.account) || (s.golfer && (x.contactId || x.playerId) === s.golfer))) continue;
    let seat;
    if (s.account && s.account === S.myAccount()) seat = seatMe(r);
    else {
      const g = s.golfer && S.golfers().find(p => p.id === s.golfer), f = s.account && friends.find(x => x.id === s.account);
      const hi = g ? S.currentIndex(g) : f ? f.hi : null;
      seat = S.addEntry(r, c.n, { name: s.name, hi: hi ?? 54, tee: r.defaultTee, gender: (g && g.gender) || "m", courseHandicap: null,
        accountId: s.account || (g && g.linkedAccount) || null, golfer: g && g.owner && g.owner !== S.myAccount() ? g : null });
    }
    if (seat) { seatOnEvent(r, c, seat); n++; }
  }
  toast(n ? `${plural(n, "player")} put on ${roundOf(r)}` : "Everybody in the field is on it already");
}

// ---------------------------------------------------------------- the organiser's sheets
/** Who plays: friends, people played with and new names, each optionally with an address the invite goes to. */
async function fieldSheet(e) {
  const inField = new Set(S.fieldOf(e.id).flatMap(s => [s.account, s.golfer]).filter(Boolean));
  const friends = F.held().friends.filter(f => !inField.has(f.id));
  const known = S.golfers().filter(p => !inField.has(p.id) && !(p.linkedAccount && (inField.has(p.linkedAccount) || friends.some(f => f.id === p.linkedAccount))) && p.linkedAccount !== S.myAccount())
    .filter((p, i, all) => !p.linkedAccount || all.findIndex(x => x.linkedAccount === p.linkedAccount) === i).sort((a, b) => a.name.localeCompare(b.name));
  const me = S.myAccount() && !inField.has(S.myAccount());
  const tick = (val, name, sub) => `<label><input type="checkbox" name="pick" value="${esc(val)}"> <span><b>${esc(name)}</b><small>${esc(sub)}</small></span></label>`;
  const hiSub = hi => hi !== null && hi !== undefined ? `index ${fmtIndex(Number(hi))}` : "";
  const [v, f] = await formSheet({ title: "Who's playing?", lead: "Tick who is in. A new name can take an address: the invite goes there, and their place waits for them when they sign in with it.", body: `
    <div class="fmtlist">${me ? tick("me:", "Me", "I'm playing too") : ""}${friends.map(x => tick(`friend:${x.id}`, x.name, ["friend", hiSub(x.hi)].filter(Boolean).join(" · "))).join("")}
      ${known.map(p => tick(`golfer:${p.id}`, p.name, hiSub(S.currentIndex(p)) || "played with you")).join("")}</div>
    <p class="pickline">Somebody new</p>
    <div class="two"><label>Name<input name="name" autocomplete="off" placeholder="Name"></label><label>Email <span class="muted">(optional)</span><input name="email" type="email" inputmode="email" autocomplete="off" placeholder="their address"></label></div>`,
    actions: [{ label: "Add to the field", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }] });
  if (v !== "ok" || !f) return;
  const add = [];
  for (const val of f.getAll("pick")) {
    const [kind, id] = val.split(":");
    if (kind === "me") add.push({ name: (A.account() || {}).name || "Me", account: S.myAccount(), golfer: S.me() ? S.me().id : null });
    if (kind === "friend") { const x = friends.find(y => y.id === id); add.push({ name: x.name, account: x.id }); }
    if (kind === "golfer") { const p = known.find(y => y.id === id); add.push({ name: p.name, golfer: p.id, account: p.linkedAccount || null }); }
  }
  const name = String(f.get("name") || "").trim();
  if (name) add.push({ name, golfer: S.upsertPlayer(name, null, "m").id, email: String(f.get("email") || "").trim() || null });
  if (!add.length) return;
  try {
    await Y.push();
    const res = await F.eventField(e.id, add);
    const sent = res.added.filter(x => x.link);
    await Y.pull();
    toast(`${plural(res.added.length, "player")} in the field${sent.length ? `; ${sent.filter(x => x.mailed).length ? "invites sent" : "share their links"}` : ""}`, 4000);
    for (const x of sent.filter(y => !y.mailed)) await shareLink(x.link, `Your place in ${e.name}`, `${x.name}, your place in ${e.name}`);
  } catch (err) { toast(err.message, 5000); }
}

/** How big the field is, and who may take a place nobody was put in. */
async function placesSheet(e) {
  const [v, f] = await formSheet({ title: "Open places", body: `
    <label>Places in the field <span class="muted">(0 is no limit)</span><input name="spots" inputmode="numeric" value="${e.spots || 0}"></label>
    <p class="pickline">Who may take an open place</p><div class="card radios">${Object.entries(OPEN).filter(([k]) => k !== "society" || e.leagueId).map(([k, t]) =>
      `<label class="radiorow"><input type="radio" name="open" value="${k}" ${(e.openTo || "none") === k ? "checked" : ""}><span><b>${esc(t)}</b></span></label>`).join("")}</div>`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }] });
  if (v !== "ok" || !f) return;
  e.spots = Math.max(0, Math.min(200, Math.floor(Number(f.get("spots")) || 0)));
  e.openTo = Object.keys(OPEN).includes(f.get("open")) ? f.get("open") : "none";
  S.saveEvent(e);
  if (e.openTo === "link") await linkOut(e);
}

async function linkOut(e) {
  try {
    await Y.push();
    const r = await F.eventLink(e.id);
    await shareLink(r.url, `Play in ${e.name}`, `${e.name}: take a place`);
  } catch (err) { toast(err.message, 5000); }
}

async function roundSheet(e, rounds) {
  const v = await sheet({ title: "Put the field on a round", lead: "Everybody in the field gets a seat on it, ready for the draw.",
    body: `<div class="list">${rounds.filter(r => r.status !== "done").map(r => `<button data-act="${esc(r.id)}" data-sheet-act><div><div class="name">${esc(roundOf(r))}</div><div class="muted small">${esc(fmtDate(r.date))}</div></div><span class="chev">›</span></button>`).join("")}</div>` });
  const r = v && S.getRound(v);
  if (r) fieldOnRound(e, r);
}

// ---------------------------------------------------------------- the page
export function series(id, tab = null) {
  const e = S.getEvent(id);
  if (!e) return go("#home");
  const rounds = S.eventRounds(id), field = S.fieldOf(id), runs = runsSeries(e), place = S.myPlace(id);
  const g = e.leagueId ? S.getLeague(e.leagueId) : null;
  const next = rounds.find(r => r.status !== "done") || null;
  const live = rounds.filter(r => r.entries.some(x => x.scores.some(v => v !== null)));
  const current = rounds.find(r => r.status === "scoring") || live[live.length - 1] || next || rounds[0];
  const net = e.format === "stroke";
  const show = (ui.seriesTab && ui.seriesTab[id]) || tab || (live.length ? "overall" : "field");

  const mine = next && S.mySeat(next);
  const me = !rounds.length ? `<p class="muted">This event has no rounds left.</p>`
    : !next ? `<a class="btn primary wide" href="#review/${esc(rounds[rounds.length - 1].id)}">The last round's results</a>`
    : place || mine ? `<div class="card todaycard"><div><div class="k caps">${next.date === S.today() ? "Today" : esc(fmtDate(next.date))}</div>
        <div class="name">You're in</div><div class="muted small">${esc([roundOf(next), courseTitle(courseBy(next.course) || { name: next.course })].join(" · "))}</div></div>
        <button class="btn primary" data-act="teeoff" data-rid="${esc(next.id)}">${mine && mine.scores.some(v => v !== null) ? "Open my card" : "Tee off"}</button></div>`
    : (e.openTo === "society" && g) || runs ? `<button class="btn primary wide" data-act="join">I'm in</button>` : "";

  const rows = ranking(overall(e, rounds), net, x => `${plural(x.rounds, "round")} · ${x.holes} holes`);
  const L = current && liveBoard(current, null, { net });
  const roundBoard = L ? ranking(L.rows.filter(x => x.holes), net, x => x.sub) : "";
  const tabs = subtabs([["overall", "Overall"], ["round", current ? roundOf(current) : "Round"], ["field", `Field ${field.length}${e.spots ? `/${e.spots}` : ""}`]]
    .map(([k, t]) => `<button class="${show === k ? "on" : ""}" data-act="tab" data-tab="${k}">${esc(t)}</button>`).join(""), true);
  const open = e.spots ? Math.max(0, e.spots - field.length) : 0;
  const body = show === "overall" ? rows
    : show === "round" ? `${roundBoard || `<p class="muted">Nobody has a score on it yet.</p>`}${current ? `<div class="btnrow"><a class="btn" href="#review/${esc(current.id)}">Everybody's cards</a><a class="btn" href="#event/${esc(current.id)}">Tee sheet</a></div>` : ""}`
    : `<div class="list">${field.map(s => `<div><span class="lead">${avatar(s.name, "", s.account && F.lookOf(s.account))}<div><div class="name">${esc(s.name)}</div><div class="muted small">${s.account ? (s.account === S.myAccount() ? "you" : "on Hagolf") : s.invited ? "invited" : "a name, not on Hagolf yet"}</div></div></span>${runs ? `<button class="btn small" data-act="out" data-spot="${esc(s.spot)}" data-name="${esc(s.name)}">Out</button>` : ""}</div>`).join("")}
        ${open ? `<div><div><div class="name muted">${plural(open, "open place")}</div><div class="muted small">${esc(e.openTo === "none" ? "for you to fill" : OPEN[e.openTo])}</div></div></div>` : ""}</div>
        ${!field.length && !open ? `<p class="muted">Nobody yet.</p>` : ""}`;

  const roundRows = `<h2>Rounds</h2><div class="rows">${rounds.map(r => `<a class="hrow" href="#event/${esc(r.id)}"><span class="t"><b>${esc(roundOf(r))}</b>
    <span>${esc([fmtDate(r.date), courseTitle(courseBy(r.course) || { name: r.course }), r.status === "done" ? "played" : r.status === "scoring" ? "being played" : ""].filter(Boolean).join(" · "))}</span></span><span class="chev">›</span></a>`).join("")}</div>`;
  const row = (act, title, sub) => `<button class="hrow" data-act="${act}"><span class="t"><b>${esc(title)}</b><span>${esc(sub)}</span></span><span class="chev">›</span></button>`;
  const run = runs && next ? `<h2>Run it</h2><div class="rows">
      ${row("field", "Who's playing?", "friends, people you played with, new names and their addresses")}
      ${row("places", "Open places", `${e.spots ? plural(e.spots, "place") : "no limit"} · ${OPEN_SHORT[e.openTo || "none"]}`)}
      ${e.openTo === "link" ? row("link", "Send the link", "whoever opens it takes an open place") : ""}
      ${row("seat", "Put the field on a round", "seats everybody, ready to draw the groups")}
    </div><p class="center" style="margin-top:18px"><button class="btn small danger" data-act="drop">Cancel the event</button></p>` : "";

  page(e.name, `${me}${tabs}${body}${roundRows}${run}`,
    { back: g ? `#league/${g.id}/days` : "#home", sub: [rounds.length ? `${fmtDate(rounds[0].date)}${rounds.length > 1 ? ` – ${fmtDate(rounds[rounds.length - 1].date)}` : ""}` : "", KINDS[e.format].split(":")[0], g ? g.name : ""].filter(Boolean).join(" · "), bell: false });
  if (ui.seriesNew === id) { ui.seriesNew = null; fieldSheet(e).then(() => series(id, "field")); }
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "tab") { ui.seriesTab = { ...(ui.seriesTab || {}), [id]: b.dataset.tab }; return series(id); }
    if (act === "teeoff") return teeOff(S.getRound(b.dataset.rid));
    if (["join", "link"].includes(act)) b.disabled = true;
    if (act === "join") {
      try { await Y.push(); await F.joinEvent(id); await Y.resync(); toast("You're in"); } catch (err) { toast(err.message, 5000); }
    }
    if (act === "field") await fieldSheet(e);
    if (act === "places") await placesSheet(e);
    if (act === "link") await linkOut(e);
    if (act === "seat") await roundSheet(e, rounds);
    if (act === "out") {
      if (!await confirmSheet(`Take ${b.dataset.name} out?`, "Their place goes; a seat they already have on a round stays until you take it off the tee sheet.", { label: "Take out", danger: true })) return;
      try { await F.eventOut(id, b.dataset.spot); await Y.pull(); } catch (err) { toast(err.message, 5000); }
    }
    if (act === "drop") {
      if (!await confirmSheet(`Cancel ${e.name}?`, "Its rounds go with it, and the field.", { label: "Cancel the event", danger: true })) return;
      for (const r of rounds) S.deleteRound(r.id);
      e.deleted = true; S.saveEvent(e);
      return go(g ? `#league/${g.id}/days` : "#home");
    }
    series(id);
  });
}

// ---------------------------------------------------------------- #ev/<token>: a place in an event, from a link
/** The event a link opens: before signing in, what it is and who is in it; signed in, one tap takes the place. */
export async function eventLink(token) {
  if (!token) return go("#home");
  page("An event", `<p class="muted center">Opening the event…</p>`, { bare: !A.signedIn() });
  let P;
  try { P = await F.previewEvent(token); } catch (err) {
    const gone = `<h3>This link has been used</h3><p class="muted">If the place was yours, it is under the event on Play.</p>`;
    return A.signedIn() ? (toast("This link has been used", 5000), go("#home")) : previewPage("An event", gone, "#home");
  }
  const head = `<h3>${esc(P.event.name)}</h3><p class="muted">${esc(P.rounds.map(r => `${shortDate(r.date)} ${courseTitle(courseBy(r.course) || { name: r.course })}`).join(" · "))}</p>
    ${P.spot ? `<p>Your place: <b>${esc(P.spot.name)}</b></p>` : P.open !== null ? `<p>${plural(P.open, "open place")} left</p>` : ""}
    <p class="muted small">${esc(P.field.map(x => firstName(x.name)).join(", ") || "Nobody in it yet")}</p>`;
  if (!A.signedIn()) return previewPage("An event", head, `#ev/${token}`);
  page("An event", `<div class="card">${head}</div><button class="btn primary wide" data-act="take">${P.spot ? "That's me: take my place" : "I'm in"}</button>`, { back: "#home" });
  bind(async ev => {
    const b = ev.target.closest("[data-act=take]");
    if (!b) return;
    b.disabled = true;
    try { const r = await F.takeEventPlace(token); await Y.resync(); toast("You're in"); go(`#series/${r.event}`); }
    catch (err) { b.disabled = false; toast(err.message, 5000); }
  });
}
