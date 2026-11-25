// An event: rounds, each a date on a course, and flights in each round, every flight its own card scored its own
// way. A flight takes the field, or players from earlier flights (places, winners, losers), and may carry their
// scores on (flights.js). The page draws that plan as a flow, which is also where the organiser builds it; the
// boards are the flights nothing goes on from. Each flight's card stays an ordinary event card (#event/<card>).
import * as S from "../store.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import * as Y from "../sync.js";
import * as Fl from "../flights.js";
import { page, bind, esc, go, ui, toast, plural, firstName, fmtDate, shortDate, courseTitle, courseBy, sheet, formSheet, confirmSheet, shareLink, subtabs, avatar } from "../ui.js";
import { fmtIndex, snake } from "../model.js";
import { runsIt } from "./league.js";
import { seatMe } from "./together.js";
import { seatOnEvent, askTeams, teamTable } from "./event.js";
import { previewPage } from "./gate.js";
import { sendEvent } from "../images.js";

const OPEN = { none: "Nobody: I fill every place", society: "Members of the society tap I'm in", link: "Anyone I send the link to" };
const OPEN_SHORT = { none: "you fill every place", society: "members tap I'm in", link: "anyone with the link" };
const SPLITS = { hcp: ["By handicap", "the lowest in the first flight"], even: ["Evenly", "each flight a spread of handicaps"], random: ["At random", ""] };

/** Whoever runs an event: its maker, or an organiser of its society. */
export const runsSeries = e => !!e && (!e.owner || e.owner === S.myAccount() || (!!e.leagueId && !!S.getLeague(e.leagueId) && runsIt(S.getLeague(e.leagueId))));
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const courseName = slug => courseTitle(courseBy(slug) || { name: slug });
const played = r => !!r && r.entries.some(x => x.scores.some(v => v !== null));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const newFlight = (rid, name) => ({ id: Fl.newId("f"), round: rid, name, format: "stableford", from: [{ field: true }], carry: [], pair: "seeded" });

// ---------------------------------------------------------------- the plan and its cards
const cardName = (e, P, f) => `${e.name}${P.rounds.length > 1 ? `, round ${Fl.roundIndex(P, f.round) + 1}` : ""}${Fl.flightsIn(P, f.round).length > 1 ? ` · ${f.name}` : ""}`;

/** The plan saved, and every flight's card made or brought into line with it: name, date, course, format, teams. */
export function savePlan(e, P) {
  e.plan = P;
  S.saveEvent(e);
  for (const f of P.flights) {
    const rd = P.rounds.find(x => x.id === f.round), c = rd && courseBy(rd.course);
    if (!c) continue;
    const tees = Object.keys(c.tees), tee = tees.includes("yellow") ? "yellow" : tees[0];
    let r = Fl.cardOf(e, f);
    if (!r) {
      r = S.createRound({ course: rd.course, name: cardName(e, P, f), date: rd.date, defaultTee: tee, allowance: 100, format: f.format, leagueId: e.leagueId });
      r.eventId = e.id;
      r.event = { times: [], teams: P.teams, flight: f.id };
      S.saveRound(r);
      if (e.leagueId) S.setLeagueRound(e.leagueId, r.id, true);
      continue;
    }
    const want = { name: cardName(e, P, f), date: rd.date, format: f.format };
    let changed = Object.keys(want).some(k => r[k] !== want[k]);
    Object.assign(r, want);
    // a course changes only before anybody has a score on it; every seat goes on the new course's tee
    if (r.course !== rd.course && !played(r)) {
      r.course = rd.course; r.defaultTee = tee; changed = true;
      for (const x of r.entries) { x.tee = tee; S.saveEntry(r, x); }
    }
    if (!r.event || r.event.flight !== f.id || JSON.stringify(r.event.teams || []) !== JSON.stringify(P.teams)) { r.event = { times: [], ...(r.event || {}), teams: P.teams, flight: f.id }; changed = true; }
    if (changed) S.saveRound(r);
  }
}

/** Flights gone from the plan, their cards with them, and every other flight's link to them. */
function dropFlights(e, P, ids) {
  for (const f of P.flights.filter(x => ids.includes(x.id))) { const r = Fl.cardOf(e, f); if (r) S.deleteRound(r.id); }
  P.flights = P.flights.filter(x => !ids.includes(x.id));
  for (const f of P.flights) {
    f.from = f.from.filter(s => !ids.includes(s.flight));
    if (!f.from.length) f.from = [{ field: true }];
    f.carry = (f.carry || []).filter(id => !ids.includes(id));
  }
}

// ---------------------------------------------------------------- making one
/** The first question: what it is called and when it starts. Rounds and flights are built on its page. */
export async function newSeries(leagueId = null) {
  if (!A.signedIn()) { toast("Sign in to run an event"); return go("#home"); }
  const g = leagueId && S.getLeague(leagueId);
  const [v, f] = await formSheet({ title: "New event", lead: "Then the course for the first round. Add rounds and flights on its page.", body: `
    <label>Name<input name="name" value="${esc(g ? `${g.name} cup` : "")}" placeholder="e.g. Club weekend" required></label>
    <label>First round<input name="date" type="date" value="${S.today()}"></label>`,
    actions: [{ label: "Pick the course", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }] });
  // opened from a link to #newevent, the step is left the way it was come to
  if (v !== "ok" || !f) { if (location.hash.startsWith("#newevent")) history.back(); return; }
  const name = String(f.get("name") || "").trim() || (g ? `${g.name} cup` : "Event");
  toCourses({ leagueId: leagueId || null, make: { name, date: f.get("date") || S.today() }, label: name });
}

function toCourses(ef) {
  ui.eventFor = ef;
  if (location.hash === "#new") dispatchEvent(new HashChangeEvent("hashchange")); else go("#new");
}

/** A course picked on Play's course screen for an event: its first round, a new round, or a round moved. */
export function seriesCourse(slug) {
  const ef = ui.eventFor;
  ui.eventFor = null;
  if (ef.make) {
    const e = S.newEventRecord({ name: ef.make.name, leagueId: ef.leagueId });
    const rid = Fl.newId("r");
    savePlan(e, { rounds: [{ id: rid, date: ef.make.date, course: slug }], flights: [newFlight(rid, "Everyone")], teams: [], squads: {}, through: {} });
    ui.seriesNew = e.id;
    return go(`#series/${e.id}`);
  }
  const e = S.getEvent(ef.eventId);
  if (!e) return go("#home");
  const P = Fl.planOf(e);
  if (ef.round) { const rd = P.rounds.find(x => x.id === ef.round); if (rd) rd.course = slug; }
  else addRound(P, slug);
  savePlan(e, P);
  go(`#series/${e.id}`);
}

/** A round after the last: the day after it, one flight going on the way the last one went. */
function addRound(P, course) {
  const prev = P.rounds[P.rounds.length - 1], pf = Fl.flightsIn(P, prev.id);
  const rid = Fl.newId("r");
  P.rounds.push({ id: rid, date: addDays(prev.date, 1), course });
  const f = newFlight(rid, "Everyone");
  // one board running on: the same players, their scores carried
  if (pf.length === 1 && !Fl.isMatch(pf[0])) Object.assign(f, { name: pf[0].name, format: pf[0].format, carry: [pf[0].id],
    from: Fl.fromField(pf[0]) ? [{ field: true }] : [{ flight: pf[0].id, take: "places", a: 1, b: null }] });
  P.flights.push(f);
}

// ---------------------------------------------------------------- seating
const onCard = (r, s) => r.entries.some(x => (s.account && x.accountId === s.account) || (s.golfer && (x.contactId || x.playerId) === s.golfer));

/** A place's handicap, for splitting a field: the golfer's index, a friend's, or the most there is. */
function hiOf(s, friends = F.held().friends) {
  const g = s.golfer && S.golfers().find(p => p.id === s.golfer), f = s.account && friends.find(x => x.id === s.account);
  return (g ? S.currentIndex(g) : f ? f.hi : null) ?? s.hi ?? 54;
}

/** A seat on a card for a golfer: an account in its own seat, somebody else's golfer as it is. */
export function placeOn(r, c, s) {
  if (onCard(r, s)) return null;
  if (s.account && s.account === S.myAccount()) return seatMe(r);
  const g = s.golfer && S.golfers().find(p => p.id === s.golfer);
  return S.addEntry(r, c.n, { name: s.name, hi: hiOf(s), tee: r.defaultTee, gender: (g && g.gender) || s.gender || "m", courseHandicap: null,
    accountId: s.account || (g && g.linkedAccount) || null, golfer: g && g.owner && g.owner !== S.myAccount() ? g : null });
}

const piles = (xs, k) => Array.from({ length: k }, (_, i) => Math.floor(xs.length / k) + (i < xs.length % k ? 1 : 0))
  .reduce((out, n) => { const at = out.flat().length; out.push(xs.slice(at, at + n)); return out; }, []);

/**
 * The field onto a round's flights from the field. One such flight takes everyone; several share the field out
 * the way the organiser picks, the first time; anybody new later goes to whichever has fewest.
 */
function seatField(e, P, rid, split = "even") {
  const fs = Fl.flightsIn(P, rid).filter(Fl.fromField), cards = fs.map(f => Fl.cardOf(e, f)).filter(Boolean);
  if (!cards.length) return 0;
  const friends = F.held().friends;
  const field = S.fieldOf(e.id).map(s => ({ ...s, hi: hiOf(s, friends) })).filter(s => !cards.some(r => onCard(r, s)));
  const k = cards.length, fresh = cards.every(r => !r.entries.length);
  const order = split === "random" ? [...field].sort(() => Math.random() - 0.5) : [...field].sort((a, b) => a.hi - b.hi);
  const dealt = k === 1 ? [field] : !fresh ? null : split === "even" ? snake(field, k, s => s.hi) : piles(order, k);
  let n = 0;
  field.forEach(s => {
    const r = dealt ? cards[dealt.findIndex(p => p.includes(s))] : [...cards].sort((a, b) => a.entries.length - b.entries.length)[0];
    const seat = placeOn(r, courseBy(r.course), s);
    if (!seat) return;
    seat.squad = P.squads[s.spot] || 0;
    seatOnEvent(r, courseBy(r.course), seat);
    n++;
  });
  return n;
}

/**
 * The players a flight gets from earlier flights, on its card in order: a match flight paired as the organiser chose,
 * anything else in fours with the leaders out last.
 */
function seatThrough(e, P, f) {
  const r = Fl.cardOf(e, f), c = r && courseBy(r.course), E = Fl.entrants(e, f, P);
  if (!c || !E.ready) return 0;
  const seats = E.seeds.map(x => {
    const s = placeOn(r, c, { name: x.name, account: x.seat.accountId, golfer: x.seat.contactId, hi: x.seat.hi, gender: x.seat.gender }) || r.entries.find(y => S.seatIdentity(y) === x.key);
    if (s) s.squad = x.seat.squad || 0;
    return s;
  }).filter(Boolean);
  const put = (s, group, side) => { s.group = group; s.side = side; S.saveEntry(r, s); };
  if (Fl.isMatch(f)) Fl.pairUp(seats.length, f.pair || "seeded").forEach(([a, b], i) => { put(seats[a], i + 1, "A"); if (b !== undefined) put(seats[b], i + 1, "B"); });
  else piles([...seats].reverse(), Math.ceil(seats.length / 4)).forEach((pile, i) => pile.forEach(s => put(s, i + 1, null)));
  return seats.length;
}

/** What is ready to be seated now: a round's field, a flight's qualifiers. */
function toSeat(e, P) {
  const out = [];
  for (const rd of P.rounds) {
    const fs = Fl.flightsIn(P, rd.id), cards = fs.map(f => Fl.cardOf(e, f));
    if (cards.every(r => r && r.status === "done")) continue;
    const k = Fl.roundIndex(P, rd.id) + 1;
    if (fs.some(Fl.fromField) && S.fieldOf(e.id).some(s => !cards.some(r => r && onCard(r, s))))
      out.push({ act: "seatfield", id: rd.id, title: `Put the field on round ${k}`, sub: fs.filter(Fl.fromField).length > 1 ? "shared between its flights, ready to draw" : "everybody in the field, ready to draw" });
    for (const f of fs.filter(x => !Fl.fromField(x))) {
      const r = Fl.cardOf(e, f);
      if (!r || r.entries.length) continue;
      const E = Fl.entrants(e, f, P);
      if (E.ready && E.seeds.length) out.push({ act: "seatflight", id: f.id, title: `Seat ${Fl.flightTitle(P, f)}`, sub: `${plural(E.seeds.length, "player")} through${Fl.isMatch(f) ? `, ${Fl.PAIRINGS[f.pair || "seeded"][0].toLowerCase()}` : ""}` });
    }
  }
  return out;
}

const flightOfCard = (e, P, r) => P.flights.find(f => (Fl.cardOf(e, f) || {}).id === r.id) || null;

/** My next card in an event: one I have a seat on, or the one I can take a seat on myself. */
function myNext(e, P) {
  const left = S.eventRounds(e.id).filter(r => r.status !== "done");
  const mine = left.find(r => S.mySeat(r));
  if (mine) return { r: mine, seated: true };
  const first = left[0], open = first ? P.flights.filter(f => Fl.fromField(f) && f.round === (flightOfCard(e, P, first) || {}).round) : [];
  return open.length === 1 ? { r: Fl.cardOf(e, open[0]), seated: false } : { r: first || null, seated: false, wait: true };
}

// ---------------------------------------------------------------- the boards
const toPar = v => v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
function ranking(rows, net, sub) {
  if (!rows.length) return `<p class="muted">Nobody has a score yet.</p>`;
  return `<div class="ranking">${rows.map((x, i) => `<div class="rankrow"><span class="pos">${i + 1}</span>
    <span class="t"><b>${esc(x.name)}</b><small>${esc(sub(x))}</small></span><span class="v num">${net ? toPar(x.net) : x.pts}</span></div>`).join("")}</div>`;
}
const matchRows = ms => ms.length ? `<div class="rows">${ms.map(m => `<div class="hrow"><span class="t"><b>${esc(m.sides.A.join(" & "))} <i class="vsmark">v</i> ${esc(m.sides.B.join(" & "))}</b>
  <span>${esc(m.result || m.status)}</span></span></div>`).join("")}</div>` : `<p class="muted">No matches drawn yet.</p>`;

/** A flight's board: its matches, or everybody on it with what they carried in. */
function board(e, P, f) {
  if (Fl.isMatch(f)) return matchRows(Fl.matchesOf(e, f));
  const carries = Fl.carried(P, f).length > 0;
  return ranking(Fl.standing(e, f, P).filter(x => x.holes), f.format === "stroke", x => carries ? `${plural(x.rounds, "round")} · ${x.holes} holes` : `thru ${x.holes}`);
}

// ---------------------------------------------------------------- the flow
function flightBox(e, P, f) {
  const from = f.from.map(s => s.flight).filter(Boolean), carry = (f.carry || []).filter(id => !from.includes(id));
  const st = Fl.flightState(e, f, P), pairs = Fl.isMatch(f) && !Fl.fromField(f);
  return `<button class="flight" data-act="flight" data-flight="${esc(f.id)}" data-from="${esc(from.join(" "))}" data-carry="${esc(carry.join(" "))}">
    <b>${esc(f.name)}</b><span>${esc(Fl.FLIGHT_FORMATS[f.format][0])}${pairs ? ` · ${Fl.PAIRINGS[f.pair || "seeded"][0].toLowerCase()}` : ""}</span>
    <small>${esc(cap(Fl.sourceText(P, f)))}${(f.carry || []).length ? ", scores carried" : ""}</small>${st ? `<small class="state">${esc(st)}</small>` : ""}</button>`;
}

/** The plan as it runs, round under round, a line from each flight to the ones it sends players on to. */
function flow(e, P, edit) {
  return `<div class="flow">${P.rounds.map((rd, k) => `<section class="flowround">
      <div class="flowtop"><${edit ? `button data-act="round" data-round="${esc(rd.id)}"` : "div"} class="flowhead"><b>Round ${k + 1}</b><span>${esc(`${fmtDate(rd.date)} · ${courseName(rd.course)}`)}</span></${edit ? "button" : "div"}>
        ${edit ? `<button class="btn small flowadd" data-act="addflight" data-round="${esc(rd.id)}">Add a flight</button>` : ""}</div>
      <div class="flowrow">${Fl.flightsIn(P, rd.id).map(f => flightBox(e, P, f)).join("")}</div></section>`).join("")}
    <svg class="flowlines" aria-hidden="true"></svg></div>
    ${edit ? `<button class="btn wide" data-act="addround">Add a round</button>` : ""}`;
}

// the lines are drawn once the boxes have their places, and again whenever the flow changes size
let watching = null;
function watchFlow() {
  if (!watching) watching = new ResizeObserver(drawFlow);
  watching.disconnect();
  const root = document.querySelector(".flow");
  if (root) watching.observe(root);
}

/**
 * Solid where players go on, dashed where only their scores do. A line bends in the gap above the round it goes
 * to, passes behind that round's heading, and drops straight into its box.
 */
function drawFlow() {
  const root = document.querySelector(".flow"), svg = root && root.querySelector(".flowlines");
  if (!svg) return;
  const box = root.getBoundingClientRect(), rect = id => { const el = root.querySelector(`.flight[data-flight="${CSS.escape(id)}"]`); return el && el.getBoundingClientRect(); };
  const n = v => v.toFixed(1), paths = [];
  for (const el of root.querySelectorAll(".flight[data-flight]")) {
    const t = el.getBoundingClientRect(), head = el.closest(".flowround").querySelector(".flowtop").getBoundingClientRect();
    for (const [key, cls] of [["from", ""], ["carry", "carry"]]) for (const id of (el.dataset[key] || "").split(" ").filter(Boolean)) {
      const s = rect(id);
      if (!s) continue;
      const x0 = s.left + s.width / 2 - box.left, y0 = s.bottom - box.top, x1 = t.left + t.width / 2 - box.left, y1 = t.top - box.top;
      const ya = head.top - box.top - 6, yb = head.bottom - box.top + 6, m = (ya - y0) / 2;
      paths.push(`<path class="${cls}" d="M${n(x0)} ${n(y0)} C${n(x0)} ${n(y0 + m)} ${n(x1)} ${n(ya - m)} ${n(x1)} ${n(ya)} M${n(x1)} ${n(yb)} L${n(x1)} ${n(y1)}"/>`);
    }
  }
  svg.setAttribute("viewBox", `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
  svg.innerHTML = paths.join("");
}

// ---------------------------------------------------------------- the organiser's sheets
/** A flight: its name, how it is played, who plays in it, what carries on, and for a match who meets whom. */
async function flightSheet(e, P, f, rid) {
  const fresh = !f;
  f = f ? { ...f } : { ...newFlight(rid, `Flight ${Fl.flightsIn(P, rid).length + 1}`) };
  const k = Fl.roundIndex(P, f.round), earlier = P.flights.filter(x => Fl.roundIndex(P, x.round) < k);
  const src = id => f.from.find(s => s.flight === id) || {}, field = Fl.fromField(f);
  const opt = (val, label, on) => `<option value="${val}" ${on ? "selected" : ""}>${label}</option>`;
  const radio = (name, val, [b, sub], on) => `<label class="radiorow"><input type="radio" name="${name}" value="${val}" ${on ? "checked" : ""}><span><b>${esc(b)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></label>`;
  const sources = earlier.map(x => Fl.isMatch(x)
    ? `<label>${esc(Fl.flightTitle(P, x))}<select name="take_${x.id}">${opt("", "Nobody", !src(x.id).take)}${opt("winners", "Its winners", src(x.id).take === "winners")}${opt("losers", "Its losers", src(x.id).take === "losers")}</select></label>`
    : `<p class="pickline">${esc(Fl.flightTitle(P, x))}</p><div class="three">
        <label>Sends on<select name="take_${x.id}">${opt("", "Nobody", !src(x.id).take)}${opt("places", "Places", src(x.id).take === "places")}</select></label>
        <label>From place<input name="a_${x.id}" inputmode="numeric" value="${src(x.id).a || 1}"></label>
        <label>To place<input name="b_${x.id}" inputmode="numeric" value="${src(x.id).b || ""}" placeholder="last"></label></div>`).join("");
  const carriable = earlier.filter(x => !Fl.isMatch(x));
  const [v, fd] = await formSheet({ title: fresh ? "New flight" : f.name, body: `
    <label>Name<input name="name" value="${esc(f.name)}"></label>
    <p class="pickline">How it is played</p><div class="card radios">${Object.entries(Fl.FLIGHT_FORMATS).map(([key, t]) => radio("fmt", key, t, f.format === key)).join("")}</div>
    ${earlier.length ? `<p class="pickline">Who plays</p><div class="card radios">${radio("who", "field", ["The field", "everyone in the event, or a share of it"], field)}${radio("who", "flights", ["From earlier flights", "what each sends on, below"], !field)}</div>
      ${sources}
      ${carriable.length ? `<p class="pickline">Add on their scores from</p><div class="fmtlist">${carriable.map(x => `<label><input type="checkbox" name="carry" value="${esc(x.id)}" ${(f.carry || []).includes(x.id) ? "checked" : ""}> <span><b>${esc(Fl.flightTitle(P, x))}</b><small>${esc(Fl.FLIGHT_FORMATS[x.format][0])}</small></span></label>`).join("")}</div>` : ""}
      <p class="pickline">In match play, who meets whom</p><div class="card radios">${Object.entries(Fl.PAIRINGS).map(([key, t]) => radio("pair", key, t, (f.pair || "seeded") === key)).join("")}</div>` : ""}`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }, ...(fresh ? [] : [{ label: "Its tee sheet", value: "card" }]),
      ...(!fresh && Fl.flightsIn(P, f.round).length > 1 ? [{ label: "Remove the flight", value: "drop", kind: "danger" }] : [])] });
  if (v === "card") { const r = Fl.cardOf(e, f); return r && go(`#event/${r.id}`); }
  if (v === "drop") {
    if (played(Fl.cardOf(e, f))) return toast("Its card has scores on it");
    if (!await confirmSheet(`Remove ${f.name}?`, "Its card goes with it, and any flight that took players from it takes the field instead.", { label: "Remove", danger: true })) return;
    dropFlights(e, P, [f.id]);
    return savePlan(e, P);
  }
  if (v !== "ok" || !fd) return;
  const num = x => Math.max(0, Math.floor(Number(x) || 0));
  f.name = String(fd.get("name") || "").trim() || f.name;
  f.format = Fl.FLIGHT_FORMATS[fd.get("fmt")] ? fd.get("fmt") : f.format;
  f.pair = Fl.PAIRINGS[fd.get("pair")] ? fd.get("pair") : f.pair || "seeded";
  f.carry = fd.getAll("carry");
  if (fd.get("who") === "flights") {
    const from = earlier.map(x => { const t = fd.get(`take_${x.id}`); return !t ? null : t === "places" ? { flight: x.id, take: t, a: num(fd.get(`a_${x.id}`)) || 1, b: num(fd.get(`b_${x.id}`)) || null } : { flight: x.id, take: t }; }).filter(Boolean);
    if (from.length) f.from = from; else { f.from = [{ field: true }]; toast("No earlier flight sends anybody on: it takes the field", 4000); }
  } else f.from = [{ field: true }];
  if (fresh) P.flights.push(f); else Object.assign(Fl.flightById(P, f.id), f);
  savePlan(e, P);
}

/** A round: its date, its course, or taking it out. */
async function roundSheet(e, P, rd) {
  const k = Fl.roundIndex(P, rd.id) + 1, fs = Fl.flightsIn(P, rd.id), busy = fs.some(f => played(Fl.cardOf(e, f)));
  const [v, fd] = await formSheet({ title: `Round ${k}`, lead: courseName(rd.course), body: `<label>Date<input name="date" type="date" value="${esc(rd.date)}"></label>`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }, ...(busy ? [] : [{ label: "Change the course", value: "course" }]),
      ...(busy || P.rounds.length < 2 ? [] : [{ label: "Remove the round", value: "drop", kind: "danger" }])] });
  if (v === "course") return toCourses({ eventId: e.id, round: rd.id, label: `${e.name} · round ${k}` });
  if (v === "drop") {
    if (!await confirmSheet(`Remove round ${k}?`, "Its flights and their cards go with it.", { label: "Remove", danger: true })) return;
    dropFlights(e, P, fs.map(f => f.id));
    P.rounds = P.rounds.filter(x => x.id !== rd.id);
    return savePlan(e, P);
  }
  if (v !== "ok" || !fd) return;
  rd.date = fd.get("date") || rd.date;
  P.rounds.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  savePlan(e, P);
}

/** Teams across the event: every match in every flight scores for them. The field and anybody seated outside it are dealt together. */
export async function eventTeamsSheet(e) {
  const P = Fl.planOf(e), [v, teams] = await askTeams(P.teams);
  if (!v) return;
  const spots = S.fieldOf(e.id), friends = F.held().friends, old = P.squads || {};
  const cards = S.eventRounds(e.id).filter(x => x.status !== "done");
  // a place in the field goes by its spot, anybody else by who they are
  const keyOf = x => { const s = spots.find(y => onCard({ entries: [x] }, y)); return s ? s.spot : S.seatIdentity(x); };
  const people = new Map(spots.map(s => [s.spot, hiOf(s, friends)]));
  for (const r of cards) for (const x of r.entries.filter(y => y.role !== "team")) if (!people.has(keyOf(x))) people.set(keyOf(x), Number(x.hi) || 0);
  // dealt down the handicaps, so no team is stacked
  const dealt = teams.length ? snake([...people.keys()], teams.length, k => people.get(k)) : [];
  P.teams = teams;
  P.squads = {};
  dealt.forEach((pile, i) => pile.forEach(k => { P.squads[k] = v === "split" || !old[k] || old[k] > teams.length ? i + 1 : old[k]; }));
  savePlan(e, P);
  for (const r of cards) for (const x of r.entries.filter(y => y.role !== "team")) {
    const sq = P.squads[keyOf(x)] || 0;
    if (x.squad !== sq) { x.squad = sq; S.saveEntry(r, x); }
  }
}

/** A match that was halved: whoever won the play-off goes on. */
async function throughSheet(e, P, f, h) {
  const names = k => h.match.sides[k].join(" & ");
  const v = await sheet({ title: "Who went through?", lead: `${names("A")} and ${names("B")} halved in ${Fl.flightTitle(P, f)}.`,
    actions: [{ label: names("A"), value: "A", kind: "primary" }, { label: names("B"), value: "B", kind: "primary" }, { label: "Cancel", value: "no" }] });
  if (v !== "A" && v !== "B") return;
  P.through = { ...P.through, [`${f.id}:${h.group}`]: v };
  savePlan(e, P);
}

/** Several flights from the field in one round: how the field is shared between them, the first time. */
async function splitSheet(e, P, rid) {
  const fs = Fl.flightsIn(P, rid).filter(Fl.fromField);
  if (fs.length < 2 || fs.some(f => (Fl.cardOf(e, f) || { entries: [] }).entries.length)) return "even";
  const [v, fd] = await formSheet({ title: "Share the field", lead: `${plural(S.fieldOf(e.id).length, "player")} between ${fs.map(f => f.name).join(", ")}. Move anybody afterwards from a name on the tee sheet.`,
    body: `<div class="card radios">${Object.entries(SPLITS).map(([k, [b, sub]], i) => `<label class="radiorow"><input type="radio" name="split" value="${k}" ${i ? "" : "checked"}><span><b>${b}</b>${sub ? `<small>${sub}</small>` : ""}</span></label>`).join("")}</div>`,
    actions: [{ label: "Share it out", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }] });
  return v === "ok" && fd ? fd.get("split") || "even" : null;
}

/** Who's playing: friends, people played with and new names, each optionally with an address the invite goes to. */
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

// ---------------------------------------------------------------- the page
export function series(id, tab = null) {
  const e = S.getEvent(id);
  if (!e) return go("#home");
  const P = Fl.planOf(e), field = S.fieldOf(id), runs = runsSeries(e), place = S.myPlace(id);
  const g = e.leagueId ? S.getLeague(e.leagueId) : null;
  const cards = S.eventRounds(id), left = cards.filter(r => r.status !== "done");
  const live = cards.filter(played), anyLive = live.length > 0;
  const now = cards.find(r => r.status === "scoring") || live[live.length - 1] || left[0] || cards[0];
  const nowRound = now && flightOfCard(e, P, now);
  const show = (ui.seriesTab && ui.seriesTab[id]) || tab || (anyLive ? "overall" : "format");

  const N = myNext(e, P), nr = N.r;
  const me = !cards.length ? `<p class="muted">This event has no rounds left.</p>`
    : !left.length ? `<a class="btn primary wide" href="#review/${esc(cards[cards.length - 1].id)}">The last round's results</a>`
    : (place || N.seated) && nr ? `<div class="card todaycard"><div><div class="k caps">${nr.date === S.today() ? "Today" : esc(fmtDate(nr.date))}</div>
        <div class="name">You're in</div><div class="muted small">${esc(N.wait ? "your flight is drawn after the round before" : [flightOfCard(e, P, nr) ? Fl.flightTitle(P, flightOfCard(e, P, nr)) : "", courseName(nr.course)].filter(Boolean).join(" · "))}</div></div>
        ${N.wait ? "" : `<button class="btn primary" data-act="teeoff" data-rid="${esc(nr.id)}">${played({ entries: [S.mySeat(nr)].filter(Boolean) }) ? "Open my card" : "Tee off"}</button>`}</div>`
    : (e.openTo === "society" && g) || runs ? `<button class="btn primary wide" data-act="join">I'm in</button>` : "";

  const fins = Fl.finals(P), teams = Fl.eventTeams(e, P);
  const overall = `${teams ? `<h2>Teams</h2>${teamTable(teams)}` : ""}${fins.map(f => `${fins.length > 1 || teams ? `<h2>${esc(Fl.flightTitle(P, f))}</h2>` : ""}${board(e, P, f)}`).join("")}`;
  const roundFlights = nowRound ? Fl.flightsIn(P, nowRound.round) : [];
  const roundBody = roundFlights.map(f => { const r = Fl.cardOf(e, f); return `${roundFlights.length > 1 ? `<h2>${esc(f.name)}</h2>` : ""}${board(e, P, f)}
    ${r ? `<div class="btnrow"><a class="btn" href="#review/${esc(r.id)}">Everybody's cards</a><a class="btn" href="#event/${esc(r.id)}">Tee sheet</a></div>` : ""}`; }).join("");
  const tabs = subtabs([["overall", "Overall"], ["round", nowRound ? `Round ${Fl.roundIndex(P, nowRound.round) + 1}` : "Round"], ["format", "Format"], ["field", `Field ${field.length}${e.spots ? `/${e.spots}` : ""}`]]
    .map(([k, t]) => `<button class="${show === k ? "on" : ""}" data-act="tab" data-tab="${k}">${esc(t)}</button>`).join(""), true);
  const open = e.spots ? Math.max(0, e.spots - field.length) : 0;
  const teamOf = s => P.teams[(P.squads[s.spot] || 0) - 1];
  const body = show === "overall" ? overall
    : show === "round" ? roundBody || `<p class="muted">Nobody has a score yet.</p>`
    : show === "format" ? flow(e, P, runs && left.length > 0)
    : `<div class="list">${field.map(s => `<div><span class="lead">${avatar(s.name, "", s.account && F.lookOf(s.account))}<div><div class="name">${esc(s.name)}</div><div class="muted small">${esc([s.account ? (s.account === S.myAccount() ? "you" : "on Hagolf") : s.invited ? "invited" : "a name, not on Hagolf yet", teamOf(s)].filter(Boolean).join(" · "))}</div></div></span>${runs ? `<button class="btn small" data-act="out" data-spot="${esc(s.spot)}" data-name="${esc(s.name)}">Out</button>` : ""}</div>`).join("")}
        ${open ? `<div><div><div class="name muted">${plural(open, "open place")}</div><div class="muted small">${esc(e.openTo === "none" ? "for you to fill" : OPEN[e.openTo])}</div></div></div>` : ""}</div>
        ${!field.length && !open ? `<p class="muted">Nobody yet.</p>` : ""}`;

  const row = (act, title, sub, idv = "") => `<button class="hrow" data-act="${act}"${idv ? ` data-id="${esc(idv)}"` : ""}><span class="t"><b>${esc(title)}</b><span>${esc(sub)}</span></span><span class="chev">›</span></button>`;
  const halves = P.flights.filter(Fl.isMatch).flatMap(f => Fl.outcomes(e, f, P).halved.filter(h => !h.picked).map(h => ({ f, h })));
  const run = runs && left.length ? `<h2>Run it</h2><div class="rows">
      ${halves.map(({ f, h }) => row("through", "Who went through?", `${h.match.sides.A.join(" & ")} v ${h.match.sides.B.join(" & ")}, halved`, `${f.id}:${h.group}`)).join("")}
      ${toSeat(e, P).map(x => row(x.act, x.title, x.sub, x.id)).join("")}
      ${row("field", "Who's playing?", "friends, people you played with, new names and their addresses")}
      ${row("places", "Open places", `${e.spots ? plural(e.spots, "place") : "no limit"} · ${OPEN_SHORT[e.openTo || "none"]}`)}
      ${e.openTo === "link" ? row("link", "Send the link", "whoever opens it takes an open place") : ""}
      ${row("teams", "Teams", P.teams.length ? `${P.teams.join(" v ")}: every match scores for them` : "none: every match stands alone")}
    </div><p class="center" style="margin-top:18px"><button class="btn small danger" data-act="drop">Cancel the event</button></p>` : "";
  const images = anyLive || P.flights.length > 1 ? `<div class="btnrow"><button class="btn" data-act="images">Send the format${anyLive ? " and the boards" : ""}</button></div>` : "";

  const span = P.rounds.length ? `${fmtDate(P.rounds[0].date)}${P.rounds.length > 1 ? ` – ${fmtDate(P.rounds[P.rounds.length - 1].date)}` : ""}` : "";
  page(e.name, `${me}${tabs}${body}${images}${run}`,
    { back: g ? `#league/${g.id}/days` : "#home", sub: [span, plural(P.rounds.length, "round"), g ? g.name : ""].filter(Boolean).join(" · "), bell: false });
  watchFlow();
  if (ui.seriesNew === id) { ui.seriesNew = null; fieldSheet(e).then(() => series(id)); }
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, Pn = Fl.planOf(e);
    if (act === "tab") { ui.seriesTab = { ...(ui.seriesTab || {}), [id]: b.dataset.tab }; return series(id); }
    if (act === "teeoff") return teeOff(S.getRound(b.dataset.rid));
    if (act === "flight") {
      const f = Fl.flightById(Pn, b.dataset.flight);
      if (!runs || !left.length) { const r = f && Fl.cardOf(e, f); return r && go(`#event/${r.id}`); }
      await flightSheet(e, Pn, f);
    }
    if (act === "addflight") await flightSheet(e, Pn, null, b.dataset.round);
    if (act === "round") await roundSheet(e, Pn, Pn.rounds.find(x => x.id === b.dataset.round));
    if (act === "addround") return toCourses({ eventId: id, label: `${e.name} · round ${Pn.rounds.length + 1}` });
    if (act === "seatfield") {
      const split = await splitSheet(e, Pn, b.dataset.id);
      if (!split) return;
      const n = seatField(e, Pn, b.dataset.id, split);
      toast(n ? `${plural(n, "player")} put on round ${Fl.roundIndex(Pn, b.dataset.id) + 1}` : "Everybody in the field is on it already");
    }
    if (act === "seatflight") { const f = Fl.flightById(Pn, b.dataset.id), n = f ? seatThrough(e, Pn, f) : 0; toast(`${plural(n, "player")} on ${f ? f.name : "the flight"}`); }
    if (act === "through") {
      const [fid, grp] = b.dataset.id.split(":"), f = Fl.flightById(Pn, fid);
      const h = f && Fl.outcomes(e, f, Pn).halved.find(x => String(x.group) === grp);
      if (h) await throughSheet(e, Pn, f, h);
    }
    if (act === "images") return sendEvent(id);
    if (["join", "link"].includes(act)) b.disabled = true;
    if (act === "join") {
      try { await Y.push(); await F.joinEvent(id); await Y.resync(); toast("You're in"); } catch (err) { toast(err.message, 5000); }
    }
    if (act === "field") await fieldSheet(e);
    if (act === "places") await placesSheet(e);
    if (act === "link") await linkOut(e);
    if (act === "teams") await eventTeamsSheet(e);
    if (act === "out") {
      if (!await confirmSheet(`Take ${b.dataset.name} out?`, "Their place goes; a seat they already have on a round stays until you take it off the tee sheet.", { label: "Take out", danger: true })) return;
      try { await F.eventOut(id, b.dataset.spot); await Y.pull(); } catch (err) { toast(err.message, 5000); }
    }
    if (act === "drop") {
      if (!await confirmSheet(`Cancel ${e.name}?`, "Its rounds go with it, and the field.", { label: "Cancel the event", danger: true })) return;
      for (const r of cards) S.deleteRound(r.id);
      e.deleted = true; S.saveEvent(e);
      return go(g ? `#league/${g.id}/days` : "#home");
    }
    series(id);
  });
}

/** Onto my card in the event, taking a seat on a flight from the field if I have none yet, and to its page. */
async function teeOff(r) {
  if (!r) return;
  const c = courseBy(r.course);
  if (!S.mySeat(r)) {
    const e = seatMe(r);
    if (!e) return toast("Set your name and handicap under Me first");
    seatOnEvent(r, c, e);
  }
  go(`#event/${r.id}`);
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
