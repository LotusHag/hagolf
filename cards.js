// Port of golf/cards.py: one card per player, laid out for 9 or 18 holes.
import { Fig, MARGIN, drawMark, section, scoreGlyph, glyphLegend, outcomeBar, on, caps, kicker, headerRule, house } from "./draw.js";
import { heading, headingIn, panel, bigIn } from "./sheet.js";
import { fmtToPar, fmtSigned, fmtHcp, fmtIndex, fileSlug, fix, statReadings, STRIP_KEYS, NO_SCORE } from "./model.js";

const sum = xs => xs.reduce((a, b) => a + b, 0);
const plural = (n, s = "s") => n === 1 ? "" : s;

export function story(M, p, { extras = true } = {}) {
  const n = M.n, L = M.labels;
  const s = p.scores, d = p.deltas, vs = p.vsrest, out = [];
  const players = M.players;
  const rank1 = [...Array(n).keys()].map(h => players.filter(q => q.rank[h] === 1).length);
  const holes = M.holes;
  const hardest = holes.reduce((a, h) => h.difficulty < a.difficulty ? h : a).hole - 1;
  const easiest = holes.reduce((a, h) => h.difficulty > a.difficulty ? h : a).hole - 1;
  const avg = holes.map(h => h.avg);
  const played = [...Array(n).keys()].filter(h => s[h] !== null);

  if (p.skipped.some(Boolean)) {
    out.push(`Joined at hole ${L[p.from_hole - 1]}: the holes before it were not played, score no points and are left out of the comparisons below, so there is no gross score for the round.`);
  }
  if (p.filled.some(Boolean)) {
    const blank = [...Array(n).keys()].filter(h => p.filled[h]).map(h => L[h]);
    out.push(`No score on hole${plural(blank.length)} ${blank.join(", ")}: ${NO_SCORE} strokes count there.`);
  }
  if (played.length) {
    const best = played.reduce((a, h) => vs[h] < vs[a] ? h : a);
    const worst = played.reduce((a, h) => vs[h] > vs[a] ? h : a);
    const beat = played.filter(h => vs[h] < 0).length;
    let line = `Fewer strokes than the field average on ${beat} of ${played.length} holes.`;
    if (vs[best] < -0.05) {
      line += ` Best hole ${L[best]}, ${fix(Math.abs(vs[best]))} strokes fewer than the rest`;
      line += vs[worst] > 0.05 ? `; toughest hole ${L[worst]}, ${fix(vs[worst])} more.` : ", never more than the field.";
    } else if (vs[worst] > 0.05) {
      line += ` Toughest hole ${L[worst]}, ${fix(vs[worst])} strokes more than the rest.`;
    }
    out.push(line);
  }
  // The extras, where this card kept any. One sentence inside the story rather than a block of its own: the
  // card's layout is fixed by hole count, and a card that kept nothing must look exactly as it did before.
  // High up, because the story is cut to seven lines and this is worth more than the flourishes below it.
  if (extras && p.statline && p.statline.any) {
    const x = p.statline, said = [];
    // Three short sentences rather than one chain of semicolons: putting, then ball striking, then the
    // penalty. A card that kept only some of it drops the sentences it cannot fill.
    if (x.putts) {
      const kinds = [x.putts.one ? `${x.putts.one} one-putt${plural(x.putts.one)}` : "",
        x.putts.three ? `${x.putts.three} three-putt${plural(x.putts.three)}` : ""].filter(Boolean);
      said.push(`${x.putts.total} putts${kinds.length ? `, ${kinds.join(" and ")}` : ` over ${x.putts.holes} hole${plural(x.putts.holes)}`}.`);
    }
    const struck = [x.fairway ? `${x.fairway.hit} of ${x.fairway.holes} fairways` : "",
      x.gir ? `${x.gir.hit} of ${x.gir.holes} greens in regulation` : ""].filter(Boolean).join(" and ");
    // One bunker is not a sand-save record, so it is left to the scorecard rather than written up as one.
    const saved = [x.upDown ? `${x.upDown.made} of the ${x.upDown.holes} green${plural(x.upDown.holes)} missed` : "",
      x.sand && x.sand.holes >= 3 ? `${x.sand.saved} of ${x.sand.holes} bunkers` : ""].filter(Boolean).join(" and ");
    if (struck || saved) said.push([struck, saved ? `par or better from ${saved}` : ""].filter(Boolean).join("; ") + ".");
    if (x.penalty) said.push(`${x.penalty.total} penalty shot${plural(x.penalty.total)}, already in the scores above.`);
    out.push(said.join(" "));
  }
  const outright = played.filter(h => p.rank[h] === 1 && rank1[h] === 1).map(h => L[h]);
  const shared = played.filter(h => p.rank[h] === 1 && rank1[h] > 1).map(h => L[h]);
  if (outright.length) {
    out.push(`Lowest score in the whole field outright on hole${plural(outright.length)} ${outright.join(", ")}` +
      (shared.length ? `, shared low on ${shared.join(", ")}.` : "."));
  } else if (shared.length) {
    out.push(`Shared the lowest score in the field on hole${plural(shared.length)} ${shared.join(", ")}.`);
  } else if (played.length) {
    out.push("Never had the field's lowest score on a hole.");
  }
  let run = 0, bestRun = 0;
  for (const x of d) { run = (x !== null && x <= 0) ? run + 1 : 0; bestRun = Math.max(bestRun, run); }
  let bounce = 0, chances = 0;
  for (let h = 1; h < n; h++) {
    if (d[h - 1] !== null && d[h - 1] >= 1) { chances++; if (d[h] !== null && d[h] <= 0) bounce++; }
  }
  const pars = d.filter(x => x !== null && x <= 0).length;
  const over = d.filter(x => x !== null && x > 0);
  if (bestRun >= 2) {
    out.push(`Longest run of par or better: ${bestRun} holes in a row.` +
      (chances ? ` Bounced back with a par or better ${bounce} of the ${chances} times a hole had gone wrong.` : " Never dropped a shot."));
  } else if (pars) {
    out.push(`${pars} hole${plural(pars)} at par or better, never two in a row` + (bounce ? `; ${bounce} of them came straight after a bogey or worse.` : "."));
  } else if (over.length) {
    out.push(`No hole at par or better: every hole cost at least one shot, the most expensive ${Math.max(...over)} over.`);
  }
  const verdict = h => {
    if (s[h] === null) return "not played";
    const v = vs[h];
    return `a ${s[h]}, ` + (Math.abs(v) < 0.1 ? "level with the rest of the field" : `${fix(Math.abs(v))} ${v < 0 ? "fewer" : "more"} than the rest of the field`);
  };
  out.push(`Hardest hole of the day (${L[hardest]}, field average ${fix(avg[hardest])}): ${verdict(hardest)}. ` +
    `Easiest (${L[easiest]}, average ${fix(avg[easiest])}): ${verdict(easiest)}.`);
  if (played.length) {
    const counts = new Map();
    for (const h of played) counts.set(s[h], (counts.get(s[h]) || 0) + 1);
    let common = null;
    for (const [k, v] of counts) if (!common || v > common[1]) common = [k, v];
    const bestpts = Math.max(...p.hpts);
    const besth = [...Array(n).keys()].filter(h => p.hpts[h] === bestpts).map(h => L[h]);
    const blobs = p.hpts.filter(x => x === 0).length;
    out.push(`Most common score ${common[0]} (${common[1]} times). Best Stableford hole${plural(besth.length)} ${besth.join(", ")} with ${bestpts} points` +
      (blobs ? `, ${blobs} hole${plural(blobs)} without points.` : ", points on every hole."));
  }
  if (p.penalties.length) {
    const bits = p.penalties.map(x => `${x.strokes} on hole ${x.label}` + (x.reason ? ` (${x.reason})` : ""));
    out.push(`Penalty strokes added after the round: ${bits.join("; ")}. Counted in every score above.`);
  }
  return out;
}

/** The five or six the band has room for, headline readings only, in the order the card draws them. */
export function stripReadings(statline) {
  if (!statline || !statline.any) return [];
  const rs = statReadings(statline);
  return STRIP_KEYS.map(k => rs.find(r => r.key === k && !r.deep)).filter(Boolean).slice(0, 6);
}

// The widest a single reading is set. A band that always filled the card would hand two readings half a
// scorecard each; past this the row stops growing and stands in the middle instead.
const BOX_MAX_IN = 2.4;

/**
 * The extras, in the foot of the by-section block: the same titled band of panels the posters draw at their
 * foot, drawn by the same code, so the card and the season sheet say the same thing in the same shape.
 *
 * A card is one round, so every reading is the count it came from rather than the rate: 0 of 9 greens is
 * something that happened on a Saturday, where 0% is a hole in the page. The rates belong to a season, and
 * the season sheets still draw them. The caption is the short name: a column this narrow has room for GIR
 * but not for greens in regulation.
 */
function extrasBand(fig, x0, topIn, W, hIn, readings) {
  heading(fig, x0, topIn, W, "Putts, fairways and the rest");
  const used = Math.min(W, readings.length * BOX_MAX_IN), step = used / readings.length;
  const boxH = hIn - headingIn;
  readings.forEach((r, i) =>
    panel(fig, x0 + (W - used) / 2 + i * step, topIn + headingIn, step, boxH, r.count, r.short, null,
      { bigSize: Math.min(bigIn(step, 22), boxH * 27), capSize: 8 }));   // a strip this shallow is capped by its height too
}

/** The rows of the by-section block: the nines, or the thirds of a short loop, and then the par families. */
function sectionRows(M, p) {
  const n = M.n, L = M.labels, d = p.deltas, PAR = p.par, rows = [];
  const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
  const group = (label, hs) => {
    const pl = hs.filter(h => d[h] !== null);
    if (pl.length) rows.push([label, sum(pl.map(h => d[h])), pl.length]);
  };
  if (n === 18) {
    group("Front nine", range(0, 9));
    group("Back nine", range(9, 18));
  } else {
    const third = Math.floor(n / 3);
    group(`Holes ${L[0]} to ${L[third - 1]}`, range(0, third));
    group(`Holes ${L[third]} to ${L[2 * third - 1]}`, range(third, 2 * third));
    group(`Holes ${L[2 * third]} to ${L[n - 1]}`, range(2 * third, n));
  }
  for (const k of [3, 4, 5]) {
    const hs = range(0, n).filter(h => PAR[h] === k);
    if (hs.length) group(`Par ${k}s (${hs.length})`, hs);
  }
  return rows;
}

/**
 * How much of a card the theme's family takes.
 *
 * A card is not a poster: the scorecard is a grid with one column a hole, so it cannot be reflowed into two
 * columns and the sheet cannot be narrowed far without breaking it. What the family does get to say is how
 * wide the paper is, whether the two panels under the scorecard stand side by side or one above the other,
 * and how much of the story is told -- the card's own version of the prose levels the posters use. The
 * story is never dropped altogether, because unlike a footer it is the point of the card rather than a
 * note about it.
 */
const CARD_W = { portrait: 0.92, tall: 1, poster: 1.08, broad: 1.06, wide: 1.14 };
const STORY_LINES = { full: 7, short: 5, none: 3 };
const MID_TOP = 5.3, SIDE_IN = 2.3, CAP_IN = 0.34;               // inches: the middle band's top, its least height, the note under the chart
const STORY_TOP = 0.53, STORY_LINE = 0.34, STORY_WRAP = 0.13;   // inches: the title gap, an entry, a turned line
// The by-section block, measured in inches from its own top rather than stretched over whatever height it is
// given, so its rows sit the same distance apart on every card: the title, the first row, a row, the foot of
// the results bar under the last of them, and how tall that bar is.
const SECT_HEAD = 0.1, SECT_ROW0 = 0.41, SECT_ROW = 0.265, SECT_BAR = 0.3, SECT_BARH = 0.1725;
// The readings go in the foot of that block, and the block reserves the strip whether or not this card kept
// any: one with nothing to put there is the same card with the strip left empty, never the story moved up
// into it.
const STATS_IN = 1.15, STATS_GAP = 0.12;

/**
 * `basic` is the free card: who, what they went round in, and the scorecard with its notation. `full` adds what
 * the round was like -- against the field per hole, where the strokes went, and the story. The basic card stops
 * after the scorecard, so the sheet itself is shorter rather than a full card with holes in it.
 */
export function renderCard(M, p, T, tier = "full", { extras = false } = {}) {
  const n = M.n, SI = M.si, N = M.field, L = M.labels, PAR = p.par;
  const holeLine = h => M.course.unlisted ? `par ${PAR[h]}` : `par ${PAR[h]}  ·  SI ${SI[h]}`;
  const basic = tier === "basic";
  // The extras are a choice; the room for them is not. Whether this card kept any or not the by-section
  // block ends with the same reserved strip, so the two cards are the same card.
  const strip = basic || !extras ? [] : stripReadings(p.statline);
  const H = house(T);
  // A narrow family stands the two panels under the scorecard one above the other instead of side by side,
  // and every family tells as much of the story as its prose level allows. Both change the height, which is
  // summed here once, before the figure exists, so nothing below has to know which way it went.
  const stacked = H.page === "portrait";
  const storyN = STORY_LINES[H.prose] ?? 7;
  const W_IN = Math.round((n <= 9 ? 12 : 15) * (CARD_W[H.page] ?? 1) * 10) / 10;
  // Beside the chart the by-section rows are one narrow column; under it the block is the width of the card,
  // so the same rows go in two. Either way the block is as tall as its rows plus the reserved strip, and
  // beside the chart the chart grows to match, so the two end on the same line.
  const rows = sectionRows(M, p);
  const wcols = stacked ? 2 : 1, per = Math.ceil(rows.length / wcols);
  const sectIn = SECT_ROW0 + per * SECT_ROW + SECT_BAR + STATS_IN;
  const colIn = stacked ? SIDE_IN : Math.max(SIDE_IN, sectIn);
  const midIn = stacked ? SIDE_IN + CAP_IN + sectIn : colIn;
  const told = basic ? [] : story(M, p, { extras }).slice(0, storyN);
  const storyW = (1 - 2 * MARGIN) * W_IN * 0.984;
  const probe = new Fig(W_IN, 1, T, 20);
  const wrapped = told.map(ln => probe.wrap(ln, storyW, 9.5));
  const storyIn = STORY_TOP + wrapped.reduce((a, ls) => a + STORY_LINE + (ls.length - 1) * STORY_WRAP, 0);
  const storyTop = MID_TOP + midIn + 0.45;
  const H_IN = basic ? 5.25 : storyTop + storyIn + 0.2;
  const fig = new Fig(W_IN, H_IN, T, 150);
  const rect = (topIn, hIn, x0 = MARGIN, x1 = 1 - MARGIN) => [x0, 1 - (topIn + hIn) / H_IN, x1 - x0, hIn / H_IN];
  const Mx = MARGIN * W_IN;

  // header
  kicker(fig, Mx, 0.30, M.name);
  fig.fitText(Mx, 0.52, p.name, (0.50 - MARGIN - 0.02) * W_IN, 34, 10, { family: "display", color: T.INK, va: "top" });
  const bits = [`Handicap index ${fmtIndex(p.hi)}`, `course handicap ${fmtHcp(p.ch)}`];
  if (M.allowance !== 100) bits.push(`playing handicap ${fmtHcp(p.ph)} at ${M.allowance}%`);
  if (Object.keys(M.course.tees).length > 1) bits.push(`${p.tee} tees` + (p.gender === "f" ? ", women's rating" : ""));
  if (p.ph < 0) bits.push(`plus handicap: gives ${-p.ph} stroke${p.ph !== -1 ? "s" : ""} back`);
  const metaW = (0.50 - MARGIN - 0.02) * W_IN;
  const metaLines = fig.wrap(bits.join("  ·  "), metaW, 10);
  fig.text(Mx, 1.12, metaLines.slice(0, 2).join("\n"), { size: metaLines.length > 1 ? 8.5 : 10, color: T.INK_3, va: "top", lineSpacing: 1.35 });
  headerRule(fig, 1.45);

  // stat tiles
  const vsPlayed = p.vsrest.filter(v => v !== null);
  const vsTotal = sum(vsPlayed);
  let grossTile, netTile;
  if (p.nr) {
    grossTile = ["Gross", "NR", `from hole ${L[p.from_hole - 1]}, ${p.holes_played} of ${n} holes`];
    netTile = ["Net", "NR", "no return"];
  } else {
    grossTile = ["Gross", String(p.gross), `${fmtToPar(p.topar)}  ·  ${p.gplace} of ${N}`];
    netTile = ["Net", String(p.net), `${fmtToPar(p.net - sum(PAR))} to par`];
  }
  const tiles = [grossTile, netTile,
    ["Stableford", String(p.pts), `points  ·  ${p.splace} of ${N}`]];
  if (!basic) tiles.push(["Against the field", fmtSigned(vsTotal, 1), `strokes ${vsTotal < 0 ? "fewer" : "more"}`]);
  const axt = fig.axes(rect(0.28, 1.0, basic ? 0.62 : 0.50), [0, tiles.length], [0, 1]);
  tiles.forEach(([lab, big, small], k) => {
    axt.rbox(k + 0.05, 0.0, 0.9, 1.0, T.PANEL, 0.06);
    // 0.9 of a tile wide, less a hair of padding: every one of the three lines is shrunk to that rather than
    // set at a size that happens to fit the shortest caption and runs out of the box on the longest
    axt.fitText(k + 0.5, 0.8, caps(T, lab), 0.82, { size: 8.5, family: "display", color: T.ACCENT, ha: "center", va: "center", min: 6 });
    axt.fitText(k + 0.5, 0.47, big, 0.82, { size: big.length < 6 ? 24 : 17, family: "display", color: big === "NR" ? T.INK_3 : T.INK, ha: "center", va: "center", min: 12 });
    axt.fitText(k + 0.5, 0.15, small, 0.82, { size: 8, color: T.INK_3, ha: "center", va: "center", min: 5.5 });
  });

  // scorecard
  const groups = n === 18 ? [[0, 9], [9, 18]] : [[0, n]];
  const columns = [];
  for (const [g0, g1] of groups) {
    for (let h = g0; h < g1; h++) columns.push(["hole", h]);
    if (n === 18) columns.push(["sub", [g0, g1]]);
  }
  columns.push(["total", [0, n]]);
  const LX = 1.5, ncol = columns.length, xmax = LX + ncol + 0.2;
  const axs = fig.axes(rect(1.65, 3.35), [0, xmax], [5.3, -0.1]);
  section(axs, 0, 0.2, "Scorecard");
  const ROWS = { hole: [0.55, 1.0], strokes: [1.55, 0.5], score: [2.05, 1.35], net: [3.4, 0.6], points: [4.0, 0.6] };
  const cell = k => ROWS[k][0] + ROWS[k][1] / 2;
  for (const [k, label] of [["strokes", "Strokes"], ["score", "Score"], ["net", "Net"], ["points", "Points"]]) {
    axs.text(0, cell(k), caps(T, label), { size: 8.5, family: "display", color: T.INK_3, va: "center" });
  }
  const [y0, h0] = ROWS.score;
  axs.rbox(LX - 0.05, y0, ncol + 0.1, h0, T.PANEL, 0.06);
  axs.line(0, ROWS.strokes[0], xmax, ROWS.strokes[0], T.LINE, 0.8);
  axs.line(0, ROWS.points[0] + ROWS.points[1], xmax, ROWS.points[0] + ROWS.points[1], T.LINE, 0.8);
  const [big, mid, small0] = n <= 9 ? [17, 10, 7.5] : [14, 9, 7];
  const small = axs.fitSize(columns.filter(c => c[0] === "hole").map(([, h]) => holeLine(h)), 0.96, small0, 5, "text");
  columns.forEach(([kind, ref], k) => {
    const x = LX + k + 0.5;
    if (kind === "hole") {
      const h = ref;
      axs.text(x, ROWS.hole[0] + 0.32, L[h], { size: 15, family: "display", color: T.INK, ha: "center", va: "center" });
      axs.text(x, ROWS.hole[0] + 0.78, holeLine(h), { size: small, color: T.INK_3, ha: "center", va: "center" });
      const k_ = p.strokes[h];
      axs.text(x, cell("strokes"), String(k_), { size: 9.5, color: k_ ? T.INK_2 : T.INK_3, ha: "center", va: "center" });
      if (p.scores[h] === null) {
        axs.text(x, cell("score"), "–", { size: big, family: "display", color: T.INK_3, ha: "center", va: "center" });
        axs.text(x, cell("net"), "–", { size: mid, color: T.INK_3, ha: "center", va: "center" });
      } else {
        scoreGlyph(axs, x, cell("score"), 0.86, p.deltas[h], String(p.scores[h]), big, 1.7);
        if (p.penalty[h]) {
          axs.rbox(x + 0.08, y0 + 0.04, 0.4, 0.24, T.BRONZE, 0.03);
          axs.text(x + 0.28, y0 + 0.16, `+${p.penalty[h]}`, { size: 7.5, family: "display", color: on(T, T.BRONZE), ha: "center", va: "center" });
        }
        axs.text(x, cell("net"), String(p.nets[h]), { size: mid, color: T.INK_2, ha: "center", va: "center" });
      }
      const pts = p.hpts[h];
      axs.text(x, cell("points"), String(pts), { size: 11, family: "display", color: pts >= 3 ? T.ACCENT : pts === 2 ? T.INK : T.INK_3, ha: "center", va: "center" });
    } else {
      const [a, b] = ref;
      const title = kind === "total" ? "TOTAL" : a === 0 ? "OUT" : "IN";
      axs.text(x, ROWS.hole[0] + 0.32, title, { size: 9, family: "display", color: T.INK_3, ha: "center", va: "center" });
      axs.text(x, ROWS.hole[0] + 0.78, `par ${sum(PAR.slice(a, b))}`, { size: small, color: T.INK_3, ha: "center", va: "center" });
      const st = sum(p.strokes.slice(a, b));
      axs.text(x, cell("strokes"), st ? String(st) : "", { size: 9, color: T.INK_2, ha: "center", va: "center" });
      const complete = p.scores.slice(a, b).every(v => v !== null);
      if (complete) {
        const gross = sum(p.scores.slice(a, b));
        axs.text(x, cell("score") - 0.16, String(gross), { size: kind === "total" ? 20 : 16, family: "display", color: T.INK, ha: "center", va: "center" });
        axs.text(x, cell("score") + 0.42, fmtToPar(gross - sum(PAR.slice(a, b))), { size: 9, family: "display", color: T.INK_2, ha: "center", va: "center" });
        axs.text(x, cell("net"), String(sum(p.nets.slice(a, b))), { size: 11, family: "display", color: T.INK, ha: "center", va: "center" });
      } else {
        axs.text(x, cell("score"), "NR", { size: 14, family: "display", color: T.INK_3, ha: "center", va: "center" });
        axs.text(x, cell("net"), "NR", { size: 10, family: "display", color: T.INK_3, ha: "center", va: "center" });
      }
      axs.text(x, cell("points"), String(sum(p.hpts.slice(a, b))), { size: 12, family: "display", color: T.ACCENT, ha: "center", va: "center" });
    }
  });
  glyphLegend(axs, LX + 0.3, 5.0, n <= 9 ? 0.4 : 0.5, 7.5);
  let note = "strokes = handicap strokes received on that hole";
  if (p.penalty_total) note = "amber +n = penalty strokes, counted in the score  ·  " + note;
  if (p.filled.some(Boolean)) note = `a hole with no score counts ${NO_SCORE}  ·  ` + note;
  if (p.skipped.some(Boolean)) note = "– = not played (joined late)  ·  " + note;
  axs.text(xmax, 5.0, note, { size: 7.5, color: T.INK_3, ha: "right", va: "center" });

  if (basic) {
    drawMark(fig, 0.06);
    const prefix0 = p.gplace !== null ? String(p.gplace).padStart(2, "0") : "NR";
    return { file: `players/${prefix0}_${fileSlug(p.name)}.png`, fig };
  }

  // against the field
  const vs = p.vsrest;
  const lo = Math.min(0, ...vsPlayed), hi = Math.max(0, ...vsPlayed);
  const span = Math.max(1, hi - lo), lim = span;
  const axb = fig.axes(rect(MID_TOP, colIn, MARGIN, stacked ? 1 - MARGIN : 0.60), [0.3, n + 0.7], [lo - span * 0.42, hi + span * 0.45]);
  section(axb, 0.3, hi + span * 0.36, "Strokes against the rest of the field, per hole");
  axb.line(0.4, 0, n + 0.6, 0, T.LINE, 0.8);
  const bw = n <= 9 ? 0.6 : 0.7;
  const fsz = n <= 9 ? 8.5 : 7.5;
  vs.forEach((v, h) => {
    if (v === null) {
      axb.text(h + 1, span * 0.04, "–", { size: 10, family: "display", color: T.INK_3, ha: "center", va: "bottom" });
    } else if (Math.abs(v) < 0.005) {
      axb.rbox(h + 1 - bw / 2, -0.015, bw, 0.03, T.INK_3, 0);
      axb.text(h + 1, lim * 0.04, "0.0", { size: fsz, family: "display", color: T.INK_2, ha: "center", va: "bottom" });
    } else {
      axb.rbox(h + 1 - bw / 2, Math.min(0, v), bw, Math.abs(v), v < 0 ? T.ACCENT : T.BAR, 0.03);
      axb.text(h + 1, v + (v >= 0 ? lim * 0.04 : -lim * 0.04), fmtSigned(v, 1), { size: fsz, family: "display", color: T.INK_2, ha: "center", va: v >= 0 ? "bottom" : "top" });
    }
    axb.text(h + 1, lo - span * 0.3, L[h], { size: 8.5, color: T.INK_3, ha: "center", va: "center" });
  });
  fig.text(Mx, MID_TOP + colIn + 0.12, "Minus and below the line = fewer strokes than everyone else's average on that hole. Plus and above = more, as on any leaderboard.",
    { size: 7.5, color: T.INK_3, va: "top" });

  // where the strokes went: beside the chart, or under it on a narrow card
  const blockTop = stacked ? MID_TOP + SIDE_IN + CAP_IN : MID_TOP;
  const blockIn = stacked ? sectIn : colIn;
  const blockX = stacked ? MARGIN : 0.64, blockX1 = 1 - MARGIN;
  const axw = fig.axes(rect(blockTop, blockIn, blockX, blockX1), [0, 1], [0, 1]);
  const dn = v => 1 - v / blockIn;             // inches from the top of the block, in its own units
  section(axw, 0, dn(SECT_HEAD), "Shots to par, by section");
  const cw = 1 / wcols;
  rows.forEach(([label, v, cnt], i) => {
    const x0 = Math.floor(i / per) * cw, y0 = dn(SECT_ROW0 + (i % per) * SECT_ROW);
    axw.text(x0, y0, label, { size: 9, color: T.INK_2, va: "center" });
    axw.text(x0 + 0.70 * cw, y0, fmtToPar(v), { size: 11, family: "display", color: v < 0 ? T.UNDER : T.INK, ha: "right", va: "center" });
    axw.text(x0 + 0.76 * cw, y0, `${fmtSigned(v / cnt, 1)} per hole`, { size: 7.5, color: T.INK_3, va: "center" });
  });
  const foot = SECT_ROW0 + per * SECT_ROW;
  axw.text(0, dn(foot + 0.05), "Results against par" + (p.nr ? ` (${p.holes_played} holes played)` : ""), { size: 8, color: T.INK_3, va: "center" });
  outcomeBar(axw, 0, dn(foot + SECT_BAR), 1.0, SECT_BARH / blockIn, p.counts, n, 0.006, true, 8);

  // The readings, in the strip the block keeps for them. It is measured from the foot of the block rather
  // than from the rows above it, so it lands in the same place on a card with three sections and on one with
  // six, and nothing above it can reach into it.
  if (strip.length) {
    extrasBand(fig, blockX * W_IN, blockTop + blockIn - STATS_IN + STATS_GAP,
      (blockX1 - blockX) * W_IN, STATS_IN - STATS_GAP, strip);
  }

  // story. The axes is only as tall as the entries that survived the family's prose level, so the block is
  // laid out in inches from its own top and never spreads three lines over the room seven would have taken.
  const axf = fig.axes(rect(storyTop, storyIn), [0, 1], [0, 1]);
  const down = v => 1 - v / storyIn;           // inches from the top of the block, in its own units
  section(axf, 0, down(0.1), "The story of the round");
  let at = STORY_TOP;
  for (const lines of wrapped) {
    axf.rbox(0.0, down(at + 0.09), 0.006, 0.185 / storyIn, T.ACCENT, 0);
    axf.text(0.016, down(at), lines.join("\n"), { size: 9.5, color: T.INK_2, va: "center", lineSpacing: 1.3 });
    at += STORY_LINE + (lines.length - 1) * STORY_WRAP;
  }

  drawMark(fig, 0.06);  // the card has no footer; the story block ends 0.2in above the edge, so the mark sits under it

  const prefix = p.gplace !== null ? String(p.gplace).padStart(2, "0") : "NR";
  return { file: `players/${prefix}_${fileSlug(p.name)}.png`, fig };
}

export function renderCards(M, T, names = null, tier = "full", opts = {}) {
  return M.players.filter(p => !names || names.includes(p.name)).map(p => renderCard(M, p, T, tier, opts));
}
