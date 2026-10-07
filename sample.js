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

// A fairway line reads hole by hole: a hit, a miss left or right (or just a miss), or a dot on a par 3.
const FW = { ".": null, x: "hit", "<": "left", ">": "right" };
const fairways = s => [...s].map(c => c in FW ? FW[c] : "miss");
const extras = (putts, fw, bunkers = [], penalties = {}) => putts.map((p, h) => ({
  putts: p, fairway: fairways(fw)[h], gir: null, bunker: bunkers.includes(h + 1) ? 1 : 0, penaltyShots: penalties[h + 1] || null,
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
    stats: extras([2, 2, 1, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2, 1, 2, 1, 1, 2], ">x.>>.xx<>.x>x.xxx", [4, 9, 13], { 4: 1, 13: 1 }) },
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
  const g = { id: "showcase-league", name: "Heron's Reach Sunday Society", formats: ["stableford"], bestN: 0, theme: null };
  return { g, Ms, members: SHOWCASE_PLAYERS.map(p => p.id), rounds: [] };
}

/**
 * The showcase course as two named loops, for the nines image: every half lifted out of the four rounds and
 * averaged. Invented like the rest of it, so the thumbnail shows the shape of the sheet and nobody's real golf.
 */
export function showcaseNines(Ms) {
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return [{ name: "Heron nine", from: 0 }, { name: "Brook nine", from: 9 }].map(({ name, from }) => {
    const par = SHOWCASE_COURSE.par.slice(from, from + 9).reduce((a, b) => a + b, 0);
    const by = new Map();
    for (const M of Ms) for (const p of M.players) {
      const sc = p.scores.slice(from, from + 9);
      if (sc.some(s => s === null)) continue;
      if (!by.has(p.id)) by.set(p.id, { name: p.name, gs: [], pts: [] });
      const e = by.get(p.id);
      e.gs.push(sc.reduce((a, b) => a + b, 0));
      e.pts.push(p.hpts.slice(from, from + 9).reduce((a, b) => a + b, 0));
    }
    const all = [...by.values()], avgGross = mean(all.flatMap(e => e.gs));
    return { name, par, cards: all.reduce((a, e) => a + e.pts.length, 0), avgPts: mean(all.flatMap(e => e.pts)),
      avgGross, avgTopar: avgGross === null ? null : avgGross - par,
      players: all.map(e => ({ name: e.name, cards: e.pts.length, avgPts: mean(e.pts), avgGross: mean(e.gs) })) };
  });
}

// ---------------------------------------------------------------- two invented partners
// The brands a partner contract puts on the boards and cards, for the previews, the tests and the site. Both are
// made up, logos included, and their links go nowhere real.
const svgUrl = svg => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\s*\n\s*/g, " "));

// A heron standing in the reach, on a clubhouse shield: cream and bottle green, so it reads on a dark green page.
const HERON_CREST = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240">
  <path d="M100 6 L186 28 V104 C186 162 150 206 100 234 C50 206 14 162 14 104 V28 Z" fill="#F1E6C4"/>
  <path d="M100 18 L175 37 V104 C175 155 144 194 100 220 C56 194 25 155 25 104 V37 Z" fill="none" stroke="#1E4A33" stroke-width="3"/>
  <g fill="#1E4A33" stroke="#1E4A33" stroke-linecap="round" stroke-linejoin="round">
    <path d="M118 104 C134 100 152 108 158 122 C162 132 164 146 172 160 C156 154 142 151 130 147 C114 142 104 131 104 119 C104 110 110 106 118 104 Z" stroke="none"/>
    <path d="M110 112 C94 102 90 89 98 78 C106 68 106 60 98 56" fill="none" stroke-width="9"/>
    <ellipse cx="94" cy="54" rx="9" ry="7" stroke="none"/>
    <path d="M88 51 L50 60 L88 59 Z" stroke="none"/>
    <path d="M99 50 L120 45" fill="none" stroke-width="2.5"/>
    <path d="M127 144 L125 190" fill="none" stroke-width="4"/>
    <path d="M136 144 L148 166 L132 174" fill="none" stroke-width="3.5"/>
    <path d="M70 198 Q79 192 88 198 T106 198 T124 198 T142 198" fill="none" stroke-width="4"/>
    <path d="M88 210 Q97 204 106 210 T124 210" fill="none" stroke-width="4"/>
  </g>
  <circle cx="92" cy="53" r="1.6" fill="#F1E6C4"/>
</svg>`);

// A finch on a halyard in a navy roundel, then the name: navy and rust, for a light page.
const HALYARD_WORDMARK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="660" height="120" viewBox="0 0 660 120">
  <circle cx="60" cy="60" r="52" fill="#1F3A5F"/>
  <path d="M18 88 H102" stroke="#F3EBDD" stroke-width="3" stroke-linecap="round"/>
  <g fill="#F3EBDD">
    <ellipse cx="64" cy="64" rx="25" ry="17" transform="rotate(-18 64 64)"/>
    <circle cx="45" cy="49" r="12.5"/>
    <path d="M82 70 L104 82 L86 62 Z"/>
  </g>
  <path d="M58 60 C68 54 82 60 88 70 C76 72 64 68 58 60 Z" fill="#C9C2B3"/>
  <path d="M34 46 L23 51 L35 54 Z" fill="#C8553D"/>
  <circle cx="43" cy="47" r="2.2" fill="#1F3A5F"/>
  <path d="M60 80 L58 88 M68 80 L68 88" stroke="#F3EBDD" stroke-width="2.5" stroke-linecap="round"/>
  <text x="132" y="68" font-family="Georgia, 'Times New Roman', serif" font-size="46" letter-spacing="5" fill="#1F3A5F">HALYARD <tspan fill="#C8553D" font-style="italic">&amp;</tspan> FINCH</text>
  <text x="134" y="98" font-family="Georgia, 'Times New Roman', serif" font-size="14" letter-spacing="6.5" fill="#C8553D">OUTFITTERS · EST. 1887</text>
</svg>`);

export const SAMPLE_BRANDS = {
  course: {
    id: "sample-course", kind: "course", name: "Heron's Reach Golf Club", logo: HERON_CREST,
    palette: { base: "fairway", ACCENT: "#E9D18A" },
    template: { kicker: "Heron's Reach", mark: "heronsreach.golf", foot: "Book your next round at the pro shop or online",
      link: "https://example.com/heronsreach", date: true },
  },
  company: {
    id: "sample-company", kind: "company", name: "Halyard & Finch", logo: HALYARD_WORDMARK,
    palette: { base: "slate", ACCENT: "#C8553D" },
    template: { kicker: "Halyard & Finch Golf Day", mark: "halyardfinch.com", foot: "Thank you for playing with us — see you next year",
      date: true },
  },
};
