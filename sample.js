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

// ---------------------------------------------------------------- three invented clubs, three looks
// For the courses page: how far one contract's look can go. Each club is made up, logo and links included, and
// each takes a quiet palette over a base with its own typeface, its own house rules, sheet styles and words.

// A heater shield in taupe, a lark in the stone chief, a pin on the downs below.
const LARKHOLT_SHIELD = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240" viewBox="0 0 200 240">
  <path d="M18 12 H182 V112 C182 172 142 212 100 232 C58 212 18 172 18 112 Z" fill="#6E5F4F"/>
  <path d="M30 24 H170 V112 C170 164 135 198 100 216 C65 198 30 164 30 112 Z" fill="none" stroke="#ECE5D8" stroke-width="2.5"/>
  <path d="M30 24 H170 V74 H30 Z" fill="#ECE5D8"/>
  <path d="M66 50 C80 36 92 38 99 50 C106 38 120 36 134 50 C120 46 110 49 103 58 L106 66 L100 62 L94 66 L97 58 C90 49 80 46 66 50 Z" fill="#6E5F4F"/>
  <circle cx="100" cy="48" r="4.5" fill="#6E5F4F"/>
  <clipPath id="field"><path d="M31 25 H169 V112 C169 163 134 197 100 215 C66 197 31 163 31 112 Z"/></clipPath>
  <g stroke="#ECE5D8" stroke-linecap="round" fill="none" clip-path="url(#field)">
    <path d="M100 96 V168" stroke-width="3.5"/>
    <path d="M20 178 Q70 156 100 168 T180 160" stroke-width="3.5"/>
    <path d="M20 196 Q80 178 106 188 T180 182" stroke-width="3"/>
  </g>
  <path d="M102 96 L138 108 L102 120 Z" fill="#ECE5D8"/>
</svg>`);

// A millstone in a seal, its name running round the rim: oatmeal on graphite.
const MILLSTONE_SEAL = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs><path id="top" d="M30 120 A90 90 0 0 1 210 120"/><path id="low" d="M20 120 A100 100 0 0 0 220 120"/></defs>
  <circle cx="120" cy="120" r="116" fill="#2E3236"/>
  <circle cx="120" cy="120" r="111" fill="none" stroke="#D8CBB0" stroke-width="3"/>
  <circle cx="120" cy="120" r="76" fill="none" stroke="#D8CBB0" stroke-width="1.5"/>
  <g font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="17" fill="#D8CBB0" letter-spacing="3.5" text-anchor="middle">
    <text><textPath href="#top" startOffset="50%">MILLSTONE HEATH</textPath></text>
    <text><textPath href="#low" startOffset="50%">GOLF CLUB · 1898</textPath></text>
  </g>
  <circle cx="22" cy="120" r="3" fill="#D8CBB0"/><circle cx="218" cy="120" r="3" fill="#D8CBB0"/>
  <circle cx="120" cy="120" r="60" fill="#D8CBB0"/>
  <g stroke="#2E3236" stroke-width="3" stroke-linecap="round">
    <path d="M120 74 L126 104 M152.5 87.5 L133 107 M166 120 L136 126 M152.5 152.5 L133 133 M120 166 L114 136 M87.5 152.5 L107 133 M74 120 L104 114 M87.5 87.5 L107 107"/>
  </g>
  <circle cx="120" cy="120" r="11" fill="#2E3236"/>
</svg>`);

// A wren cocking its tail on a reed, a hairline, and the name set wide: charcoal and muted brass on ivory.
const WRENMERE_WORDMARK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="140" viewBox="0 0 640 140">
  <path d="M14 112 H118" stroke="#8C6E43" stroke-width="3" stroke-linecap="round"/>
  <g fill="#262422">
    <ellipse cx="60" cy="82" rx="30" ry="21" transform="rotate(-12 60 82)"/>
    <circle cx="36" cy="66" r="14"/>
    <path d="M76 70 C84 54 92 38 102 24 Q110 24 114 30 C106 46 100 64 94 84 Z"/>
    <path d="M24 64 L8 68 L24 70 Z"/>
  </g>
  <path d="M50 78 C62 70 76 74 84 84 C70 88 58 86 50 78 Z" fill="#8C6E43"/>
  <circle cx="33" cy="63" r="2.4" fill="#F7F3EA"/>
  <path d="M54 101 L52 112 M64 101 L64 112" stroke="#262422" stroke-width="3" stroke-linecap="round"/>
  <path d="M150 26 V114" stroke="#8C6E43" stroke-width="1.5"/>
  <text x="182" y="80" font-family="'Century Gothic', Futura, 'Trebuchet MS', Arial, sans-serif" font-size="54" letter-spacing="14" fill="#262422">WRENMERE</text>
  <text x="185" y="112" font-family="'Century Gothic', Futura, 'Trebuchet MS', Arial, sans-serif" font-size="20" letter-spacing="9" fill="#8C6E43">LINKS  ·  EST. 1904</text>
</svg>`);

/** Three invented clubs, each with the names its sample sheets carry (`showcase`) and the styles it opens on. */
export const SHOWCASE_CLUBS = [
  {
    id: "showcase-larkholt", kind: "course", name: "Larkholt Golf Club", logo: LARKHOLT_SHIELD,
    palette: { base: "silverware", BG: "#E8E2D6", PANEL: "#F3EFE7", PANEL_2: "#DDD6C9", LINE: "#C9C0B1", ACCENT: "#6E5F4F",
      INK: "#2A2520", INK_2: "#4F4840", INK_3: "#6B635A", SILVER: "#A9A59D", BRONZE: "#A3805F", BAR: "#6E5F4F" },
    template: { kicker: "Members' Section", mark: "Larkholt GC · Est. 1912", foot: "Tee times from the starter's hut or the members' line",
      link: "https://example.com/larkholt", date: true, titles: { stbl: "Monthly Medal", standings: "Order of Merit" } },
    styles: { league: "crest", personal: "numeral", dayout: "crest" },
    showcase: { course: "Larkholt", loop: "Downs course", society: "Larkholt Sunday Society", round: "Midsummer Medal" },
  },
  {
    id: "showcase-millstone", kind: "course", name: "Millstone Heath Golf Club", logo: MILLSTONE_SEAL,
    palette: { base: "carbon", BG: "#25282B", PANEL: "#2F3337", PANEL_2: "#3A3E43", LINE: "#4C5157", ACCENT: "#D8CBB0",
      INK: "#F1ECE2", INK_2: "#CBC5BA", INK_3: "#A29C92", SILVER: "#B7BBC0", BRONZE: "#B39470", BAR: "#8E8676" },
    template: { kicker: "On the Heath", mark: "millstoneheath · since 1898", foot: "Winter greens from November · visitors welcome midweek",
      date: false, titles: { stbl: "Heath Points", standings: "The Heath Ladder" } },
    styles: { league: "podium", personal: "crest", dayout: "podium" },
    showcase: { course: "Millstone Heath", loop: "Heath course", society: "Millstone Heath Society", round: "Heath Stableford" },
  },
  {
    id: "showcase-wrenmere", kind: "course", name: "Wrenmere Links", logo: WRENMERE_WORDMARK,
    palette: { base: "typewriter", BG: "#F7F3EA", PANEL: "#FFFDF8", PANEL_2: "#EEE8DC", LINE: "#DCD4C5", ACCENT: "#8C6E43",
      INK: "#262422", INK_2: "#4A4642", INK_3: "#6E6862", SILVER: "#A7A6A1", BRONZE: "#A87E55", BAR: "#3A3735" },
    template: { kicker: "The Links Card", mark: "example.com/wrenmere", foot: "Scan to book the links",
      link: "https://example.com/wrenmere", date: false, titles: { stbl: "The Links Stableford", standings: "Links Table" } },
    styles: { league: "ticket", personal: "banner", dayout: "banner" },
    showcase: { course: "Wrenmere", loop: "Links", society: "Wrenmere Links Society", round: "Summer Links Cup" },
  },
];
