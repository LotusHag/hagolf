// An event's plan: rounds, each a date on a course, and the flights in each, every flight its own card scored its
// own way. A flight takes its players from the field or from earlier flights (places, winners, losers), and may add
// up the scores they bring from earlier flights. Nothing here draws or writes: the event page and the poster read it.
import * as S from "./store.js";
import * as Mo from "./model.js";
import { courseBy } from "./ui.js";
import { liveBoard } from "./screens/home.js";

export const FLIGHT_FORMATS = {
  stableford: ["Stableford", "points added up"],
  stroke: ["Stroke play", "net strokes added up"],
  match: ["Match play", "hole by hole on strokes, no handicap"],
  matchpts: ["Match play on points", "hole by hole on Stableford points, no handicap"],
};
export const PAIRINGS = {
  seeded: ["Best against worst", "1st against last, 2nd against second-last"],
  order: ["As the draw runs", "1 against 2, 3 against 4: winners meet winners"],
  draw: ["Drawn at random", ""],
};
export const isMatch = f => Mo.isMatchFormat(f.format);
/** What a flight's board adds up: points, net strokes, or neither (a match). Only like carries over to like. */
export const basisOf = f => isMatch(f) ? null : f.format === "stroke" ? "net" : "pts";
export const newId = p => `${p}${Math.random().toString(36).slice(2, 9)}`;

export function planOf(e) {
  const p = e.plan;
  if (p && Array.isArray(p.rounds) && p.rounds.length) return { teams: [], squads: {}, through: {}, ...p };
  // an event made before flights: a round a card, everyone in it, the board running on
  const cards = S.eventRounds(e.id);
  return {
    rounds: cards.map(r => ({ id: r.id, date: r.date, course: r.course })),
    flights: cards.map((r, i) => ({ id: r.id, round: r.id, name: "Everyone", format: e.format === "stroke" ? "stroke" : "stableford", from: [{ field: true }], carry: i ? [cards[i - 1].id] : [], pair: "seeded" })),
    teams: [], squads: {}, through: {},
  };
}

export const roundIndex = (P, rid) => P.rounds.findIndex(x => x.id === rid);
export const flightsIn = (P, rid) => P.flights.filter(f => f.round === rid);
export const flightById = (P, id) => P.flights.find(f => f.id === id) || null;
export const fromField = f => f.from.some(s => s.field);
/** A flight's card: the one that says so, or for an event made before flights the card the flight is named after. */
export const cardOf = (e, f) => S.eventRounds(e.id).find(r => (r.event && r.event.flight) === f.id) || S.getRound(f.id);
const people = r => r ? r.entries.filter(x => x.role !== "team") : [];

/** "Round 2", or "Round 2 · Gold flight" when the round has more than one. */
export function flightTitle(P, f, short = false) {
  const k = roundIndex(P, f.round) + 1, many = flightsIn(P, f.round).length > 1;
  if (short) return many ? f.name : `Round ${k}`;
  return P.rounds.length > 1 && many ? `Round ${k} · ${f.name}` : many ? f.name : `Round ${k}`;
}

/** The flights whose scores a flight adds on: the ones it names, and the ones those name, each once. */
export function carried(P, f) {
  const out = new Map(), todo = [...(f.carry || [])];
  while (todo.length) {
    const x = flightById(P, todo.pop());
    if (!x || out.has(x.id) || x.id === f.id || basisOf(x) !== basisOf(f)) continue;
    out.set(x.id, x);
    todo.push(...(x.carry || []));
  }
  return [...out.values()];
}

/** Each player on a flight's own card, by who they are: points, net to par and holes so far. */
function own(e, f) {
  const r = cardOf(e, f), L = r && liveBoard(r, null, { net: f.format === "stroke" });
  const out = new Map();
  if (!L) return out;
  for (const x of L.rows) {
    const seat = r.entries.find(s => s.playerId === x.id);
    if (seat) out.set(S.seatIdentity(seat), { key: S.seatIdentity(seat), name: x.name, pts: x.pts, net: x.netToPar, holes: x.holes, seat });
  }
  return out;
}

/** A Stableford or stroke flight's board: its own card plus whatever its players carry in. Nobody with a score yet sorts last. */
export function standing(e, f, P = planOf(e)) {
  const rows = [...own(e, f).values()].map(x => ({ ...x, rounds: x.holes ? 1 : 0 }));
  for (const c of carried(P, f)) {
    const o = own(e, c);
    for (const x of rows) { const y = o.get(x.key); if (y && y.holes) { x.pts += y.pts; x.net += y.net; x.holes += y.holes; x.rounds++; } }
  }
  const net = f.format === "stroke";
  return rows.sort((a, b) => (!!b.holes - !!a.holes) || (net ? a.net - b.net : b.pts - a.pts) || b.holes - a.holes);
}

/** The matches on a match flight's card, as they stand. */
export function matchesOf(e, f) {
  const r = cardOf(e, f), c = r && courseBy(r.course);
  if (!c || !people(r).length) return [];
  try { return Mo.matchesOf(c, { ...S.toModelRound(r), final: false }); } catch (err) { return []; }
}

/**
 * Who came through a match flight, in the order its matches are drawn, and who went out. A seat with nobody to play
 * is a bye and goes through; a halved match waits for the organiser to say who won the play-off.
 */
export function outcomes(e, f, P = planOf(e)) {
  const r = cardOf(e, f), ms = matchesOf(e, f), seats = people(r);
  const winners = [], losers = [], halved = [];
  let pending = 0;
  for (const g of Mo.groupsOf(seats)) {
    const mine = seats.filter(x => S.groupOf(x) === g), m = ms.find(x => x.group === g);
    if (!m) { if (mine.length && new Set(mine.map(x => x.side || "A")).size === 1) winners.push(...mine); else pending++; continue; }
    const won = m.result ? m.leader || P.through[`${f.id}:${g}`] || null : null;
    if (m.result && !m.leader) halved.push({ group: g, match: m, picked: won });
    if (!won) { pending++; continue; }
    winners.push(...mine.filter(x => x.side === won));
    losers.push(...mine.filter(x => x.side && x.side !== won));
  }
  return { winners, losers, halved, pending, matches: ms };
}

const ordinalOf = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
/** "top 2 of Group A", "Group B from 3rd down", "winners of Champions", "the field". */
export function sourceText(P, f) {
  if (fromField(f)) return flightsIn(P, f.round).filter(fromField).length > 1 ? "part of the field" : "the field";
  return f.from.map(s => {
    const x = flightById(P, s.flight);
    if (!x) return "";
    const of = flightTitle(P, x, true);
    if (s.take === "winners") return `winners of ${of}`;
    if (s.take === "losers") return `losers of ${of}`;
    const a = s.a || 1, b = s.b || null;
    return a === 1 && !b ? `all of ${of}` : a === 1 ? `top ${b} of ${of}` : b === a ? `${ordinalOf(a)} of ${of}` : b ? `${ordinalOf(a)}–${ordinalOf(b)} of ${of}` : `${of} from ${ordinalOf(a)} down`;
  }).filter(Boolean).join(", ");
}

/**
 * Who a flight fed by earlier flights gets, best first: each source's list, dealt across so every source's first
 * comes before anyone's second (Group A's winner, Group B's winner, Group A's second ...). Not ready while a source
 * is still being played, or a halved match there waits on the organiser.
 */
export function entrants(e, f, P = planOf(e)) {
  if (fromField(f)) return { ready: true, seeds: [], waiting: "" };
  const lists = [];
  for (const s of f.from) {
    const x = flightById(P, s.flight), r = x && cardOf(e, x);
    if (!x || !r) continue;
    if (isMatch(x)) {
      const o = outcomes(e, x, P);
      if (o.pending || !people(r).length) return { ready: false, seeds: [], waiting: flightTitle(P, x) };
      lists.push((s.take === "losers" ? o.losers : o.winners).map(seat => ({ key: S.seatIdentity(seat), name: seat.name, seat })));
    } else {
      if (r.status !== "done") return { ready: false, seeds: [], waiting: flightTitle(P, x) };
      const rows = standing(e, x, P), a = Math.max(1, s.a || 1), b = s.b ? Math.max(a, s.b) : rows.length;
      lists.push(rows.slice(a - 1, b));
    }
  }
  const seeds = [], seen = new Set();
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (l[i] && !seen.has(l[i].key)) { seen.add(l[i].key); seeds.push(l[i]); }
  return { ready: true, seeds, waiting: "" };
}

/**
 * The matches a seeded list makes, as indexes into it: [a, b], or [a] for a bye. An odd one out is the top seed's
 * bye when seeded, the last one's otherwise.
 */
export function pairUp(n, how, rand = Math.random) {
  let idx = [...Array(n).keys()];
  if (how === "draw") for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const out = [];
  if (how === "seeded") {
    if (n % 2) { out.push([idx[0]]); idx = idx.slice(1); }
    for (let i = 0; i < idx.length / 2; i++) out.push([idx[i], idx[idx.length - 1 - i]]);
    return out;
  }
  for (let i = 0; i < idx.length; i += 2) out.push(idx.slice(i, i + 2));
  return out;
}

/** The flights nothing goes on from: the ones whose boards end the event. */
export function finals(P) {
  const used = new Set(P.flights.flatMap(f => [...f.from.map(s => s.flight), ...(f.carry || [])]).filter(Boolean));
  return P.flights.filter(f => !used.has(f.id));
}

/** Team points across every match in the event. */
export function eventTeams(e, P = planOf(e)) {
  if (!P.teams.length) return null;
  return Mo.teamPoints(P.flights.filter(isMatch).flatMap(f => matchesOf(e, f)), P.teams);
}

/** Where a flight stands, in a few words: who leads, who won, how many matches are settled. */
export function flightState(e, f, P = planOf(e)) {
  const r = cardOf(e, f);
  if (!r) return "";
  const n = people(r).length;
  if (!n) {
    if (fromField(f)) return "";
    const E = entrants(e, f, P);
    return E.ready ? `${E.seeds.length} through, to be seated` : `after ${E.waiting}`;
  }
  if (isMatch(f)) {
    const o = outcomes(e, f, P), ms = o.matches;
    if (ms.length === 1 && ms[0].thru) return ms[0].result ? (ms[0].leader ? ms[0].result : o.winners.length ? `${o.winners.map(x => x.name).join(" & ")} won the play-off` : "Halved") : ms[0].status;
    const done = ms.filter(m => m.result).length;
    return ms.length ? `${ms.length} ${ms.length === 1 ? "match" : "matches"}${done ? ` · ${done} decided` : ""}` : `${n} players`;
  }
  const rows = standing(e, f, P), top = rows[0];
  if (!top || !top.holes) return `${n} players`;
  const v = f.format === "stroke" ? `${top.net === 0 ? "E" : top.net > 0 ? `+${top.net}` : top.net} net` : `${top.pts} pts`;
  return `${r.status === "done" ? "won by" : "led by"} ${top.name}, ${v}`;
}
