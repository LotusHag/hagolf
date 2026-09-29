// The showcase: the round and the league every shop preview is drawn on. Nothing here is real. Heron's Reach
// is an invented course, the four players are invented, and their cards were written by hand so that one round
// shows everything the graphics can do: an ace, an eagle, a penalty badge, a blow-up hole, the extras kept on
// some cards and not others, and a gross board in a different order from the Stableford board. The three
// earlier Sundays are dealt from a seeded generator, so the league looks the same on every phone.
import { compute, handicapFor } from "./model.js";

export const SHOWCASE_COURSE = {
  slug: "herons-reach", name: "Heron's Reach", loop: "Championship course", first_hole: 1,
  where: { town: "Heronsbrook", region: "The Marches", country: "GB" },
  par: [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4],
  stroke_index: [9, 13, 17, 1, 7, 15, 3, 11, 5, 8, 18, 12, 2, 14, 16, 4, 10, 6],
  tees: {
    white: { ratings: { m: { cr: 73.4, slope: 137 } },
      metres: [362, 502, 168, 428, 388, 192, 538, 351, 411, 379, 154, 514, 437, 342, 201, 551, 371, 418] },
    yellow: { ratings: { m: { cr: 71.3, slope: 131 }, f: { cr: 77.0, slope: 138 } },
      metres: [348, 487, 156, 412, 371, 178, 521, 336, 395, 366, 142, 498, 421, 329, 189, 534, 358, 402] },
    red: { ratings: { m: { cr: 68.6, slope: 122 }, f: { cr: 73.2, slope: 129 } },
      metres: [305, 432, 128, 352, 320, 141, 466, 298, 341, 318, 119, 441, 366, 287, 152, 470, 312, 355] },
  },
  nines: [], provenance: { ratings: "published", stroke_index: "published" }, source: "kit", notes: [],
};

// A fairway line reads hole by hole: a hit, a miss, or a dot on a par 3, which has none.
const fairways = s => [...s].map(c => c === "." ? null : c === "x" ? "hit" : "miss");
const extras = (putts, fw, bunkers = [], penalties = {}) => putts.map((p, h) => ({
  putts: p, fairway: fairways(fw)[h], gir: null, bunker: bunkers.includes(h + 1), penaltyShots: penalties[h + 1] || null,
}));

/**
 * The four, and what each of them is there to show. Isabel wins the gross with an ace and keeps every extra;
 * Daan wins the Stableford on a hot day with an eagle and a triple; Marco's steady card wears a penalty
 * badge; Priya's high handicap turns two pars into four-point holes.
 */
export const SHOWCASE_PLAYERS = [
  { id: "showcase-1", name: "Isabel Moreau", hi: 5.4, gender: "f", tee: "red",
    scores: [4, 5, 3, 5, 4, 3, 4, 4, 5, 4, 1, 6, 5, 4, 3, 6, 4, 4],
    stats: extras([2, 2, 1, 2, 1, 2, 1, 2, 2, 2, 0, 2, 2, 2, 2, 2, 2, 1], "xx.xx.-xxx.xxx.-xx", [4, 8, 12, 16], { 12: 1 }) },
  { id: "showcase-2", name: "Daan Verhoeven", hi: 18.4, gender: "m", tee: "yellow",
    scores: [5, 6, 2, 7, 6, 4, 6, 5, 6, 6, 4, 6, 6, 3, 3, 3, 4, 5],
    stats: extras([2, 2, 1, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2, 1, 2, 1, 1, 2], "-x.--.xx--.x-x.xxx", [4, 9, 13], { 4: 1, 13: 1 }) },
  { id: "showcase-3", name: "Marco Bianchi", hi: 11.7, gender: "m", tee: "yellow",
    scores: [4, 5, 4, 5, 4, 3, 5, 5, 5, 5, 3, 6, 6, 4, 2, 5, 5, 4],
    penalties: [{ hole: 7, strokes: 2, reason: "wrong ball" }] },
  { id: "showcase-4", name: "Priya Nair", hi: 26.8, gender: "f", tee: "red",
    scores: [6, 7, 4, 8, 6, 5, 6, 5, 7, 6, 3, 8, 6, 6, 6, 7, 6, 4] },
];
export const SHOWCASE_NAME = "Midsummer Cup";
const DATES = ["2026-05-10", "2026-05-24", "2026-06-07", "2026-06-21"];
const AWAY = [[], [3], [], []];   // Priya missed the second Sunday, so the tables do not all say four rounds
// How each player's earlier Sundays went, in net strokes against par: a season with a different winner each time.
const FORM = [[-2, 1, 4], [3, -3, -1], [-4, 2, 3], [1, 0, -5]];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Net par most holes, a stroke over now and then, one back once in a while; `form` tilts the day.
function deal(par, strokes, seed, form) {
  const r = rng(seed), tilt = form / 60;
  return par.map((p, h) => {
    const x = r() + tilt;
    const d = x < 0.14 ? -1 : x < 0.66 ? 0 : x < 0.90 ? 1 : x < 0.97 ? 2 : 3;
    return Math.max(1, p + strokes[h] + d);
  });
}

const entryOf = p => ({ id: p.id, name: p.name, hi: p.hi, gender: p.gender, tee: p.tee, courseHandicap: null, fromHole: 1, penalties: p.penalties || [], scores: p.scores, stats: p.stats || [] });

/** The Midsummer Cup: the four cards as written, on the showcase course. */
export function showcaseRound() {
  const round = { name: SHOWCASE_NAME, date: DATES[3], defaultTee: "yellow", allowance: 100, final: true, entries: SHOWCASE_PLAYERS.map(entryOf) };
  return Object.assign(compute(SHOWCASE_COURSE, round), { id: "showcase-round" });
}

/** The three Sundays before it, dealt, then the Cup itself. */
export function showcaseLeague() {
  const Ms = DATES.slice(0, 3).map((date, i) => {
    const entries = SHOWCASE_PLAYERS.filter((_, k) => !AWAY[i].includes(k)).map(p => {
      const e = entryOf(p);
      const { strokes, par } = handicapFor(SHOWCASE_COURSE, e, "yellow");
      return { ...e, penalties: [], stats: [], scores: deal(par, strokes, (i + 1) * 100 + SHOWCASE_PLAYERS.indexOf(p), FORM[SHOWCASE_PLAYERS.indexOf(p)][i]) };
    });
    return Object.assign(compute(SHOWCASE_COURSE, { name: `Sunday ${i + 1}`, date, defaultTee: "yellow", allowance: 100, final: true, entries }), { id: `showcase-round-${i + 1}` });
  });
  Ms.push(showcaseRound());
  const g = { id: "showcase-league", name: "Heron's Reach Sunday league", formats: ["stableford"], bestN: 0, theme: null };
  return { g, Ms, members: SHOWCASE_PLAYERS.map(p => p.id), rounds: [] };
}
