// A round and a league to draw the shop's previews on when the phone has none of its own yet. Six invented
// players, scores dealt from a seeded generator so the same sample looks the same every time, on whichever
// course the phone carries. Everything else in the app draws on real rounds; this is the one exception.
import { compute, handicapFor } from "./model.js";

export const SAMPLE_PLAYERS = [
  { id: "sample-1", name: "Anne Bakker", hi: 11.9, gender: "f" },
  { id: "sample-2", name: "Tom de Wit", hi: 8.4, gender: "m" },
  { id: "sample-3", name: "Sara Lindqvist", hi: 19.7, gender: "f" },
  { id: "sample-4", name: "Jasper Kok", hi: 24.0, gender: "m" },
  { id: "sample-5", name: "Mia Jansen", hi: 14.2, gender: "f" },
  { id: "sample-6", name: "Noah Vermeer", hi: 31.5, gender: "m" },
];
const DATES = ["2026-05-10", "2026-05-24", "2026-06-07", "2026-06-21"];
const AWAY = [[], [4], [1, 5], [3]];   // who missed which Sunday, so the tables are not six rows of the same field
const PREFER = { m: ["yellow", "white"], f: ["red", "yellow"] };

const rated = (c, g) => Object.entries(c.tees || {}).filter(([, t]) => t.ratings && t.ratings[g]).map(([k]) => k);
const teeFor = (c, g) => PREFER[g].find(k => rated(c, g).includes(k)) || rated(c, g)[0] || null;

/** The course the sample is played on: Reims when the phone has it, else any full course with men's ratings. */
export function sampleCourse(courses) {
  const ok = c => c && teeFor(c, "m");
  return courses.find(c => c.slug === "golf-de-reims" && ok(c)) || courses.find(c => c.n === 18 && ok(c)) || courses.find(ok) || null;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Net par most of the time, a stroke over now and then, a shot back once in a while: about thirty points.
function scoresFor(course, e, tee, seed) {
  const { strokes, par } = handicapFor(course, e, tee);
  const r = rng(seed);
  return par.map((p, h) => {
    const x = r();
    const d = x < 0.14 ? -1 : x < 0.66 ? 0 : x < 0.90 ? 1 : x < 0.97 ? 2 : 3;
    return Math.max(1, p + strokes[h] + d);
  });
}

export function sampleRound(course, { seed = 1, date = "2026-06-14", name = "Sunday fourball", id = "sample-round", away = [] } = {}) {
  const teeM = teeFor(course, "m");
  const entries = SAMPLE_PLAYERS.filter((_, k) => !away.includes(k)).map((p, k) => {
    const gender = teeFor(course, p.gender) ? p.gender : "m";
    const tee = teeFor(course, gender);
    const e = { ...p, gender, tee, courseHandicap: null, penalties: [], fromHole: 1 };
    return { ...e, scores: scoresFor(course, e, tee, seed * 100 + k) };
  });
  return Object.assign(compute(course, { name, date, defaultTee: teeM, allowance: 100, final: true, entries }), { id });
}

export function sampleLeague(course) {
  const Ms = DATES.map((date, i) => sampleRound(course, { seed: i + 1, date, name: `Sunday ${i + 1}`, id: `sample-round-${i + 1}`, away: AWAY[i] }));
  const g = { id: "sample-league", name: "Sunday league", formats: ["stableford"], bestN: 0, theme: null };
  return { g, Ms, members: SAMPLE_PLAYERS.map(p => p.id), rounds: [], own: false };
}
