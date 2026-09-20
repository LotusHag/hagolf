// Port of golf/cards.py: one card per player, laid out for 9 or 18 holes.
import { Fig, MARGIN, section, scoreGlyph, glyphLegend, outcomeBar, on } from "./draw.js";
import { fmtToPar, fmtSigned, fmtHcp, fmtIndex, fileSlug, fix } from "./model.js";

const sum = xs => xs.reduce((a, b) => a + b, 0);
const plural = (n, s = "s") => n === 1 ? "" : s;

export function story(M, p) {
  const n = M.n, L = M.labels;
  const s = p.scores, d = p.deltas, vs = p.vsrest, out = [];
  const players = M.players;
  const rank1 = [...Array(n).keys()].map(h => players.filter(q => q.rank[h] === 1).length);
  const holes = M.holes;
  const hardest = holes.reduce((a, h) => h.difficulty < a.difficulty ? h : a).hole - 1;
  const easiest = holes.reduce((a, h) => h.difficulty > a.difficulty ? h : a).hole - 1;
  const avg = holes.map(h => h.avg);
  const played = [...Array(n).keys()].filter(h => s[h] !== null);

  if (p.nr) {
    const picked = [...Array(n).keys()].filter(h => p.picked[h]).map(h => L[h]);
    out.push(`Picked up on hole${plural(picked.length)} ${picked.join(", ")}, so no gross score for the round; those holes score no points and are left out of the comparisons below.`);
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
    if (s[h] === null) return "picked up";
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
    out.push(`Penalty strokes after the round: ${bits.join("; ")}. Counted in every score above.`);
  }
  return out;
}

export function renderCard(M, p, T) {
  const n = M.n, SI = M.si, N = M.field, L = M.labels, PAR = p.par;
  const W_IN = n <= 9 ? 12 : 15, H_IN = 10.9;
  const fig = new Fig(W_IN, H_IN, T, 150);
  const rect = (topIn, hIn, x0 = MARGIN, x1 = 1 - MARGIN) => [x0, 1 - (topIn + hIn) / H_IN, x1 - x0, hIn / H_IN];
  const Mx = MARGIN * W_IN;

  // header
  fig.text(Mx, 0.30, M.name.toUpperCase(), { size: 12, family: "display", color: T.ACCENT, va: "top" });
  fig.fitText(Mx, 0.52, p.name, (0.50 - MARGIN - 0.02) * W_IN, 34, 10, { family: "display", color: T.INK, va: "top" });
  const bits = [`Handicap index ${fmtIndex(p.hi)}`, `course handicap ${fmtHcp(p.ch)}`];
  if (M.allowance !== 100) bits.push(`playing handicap ${fmtHcp(p.ph)} at ${M.allowance}%`);
  if (Object.keys(M.course.tees).length > 1) bits.push(`${p.tee} tees` + (p.gender === "f" ? ", women's rating" : ""));
  if (p.ph < 0) bits.push(`plus handicap: gives ${-p.ph} stroke${p.ph !== -1 ? "s" : ""} back`);
  const metaW = (0.50 - MARGIN - 0.02) * W_IN;
  const metaLines = fig.wrap(bits.join("  ·  "), metaW, 10);
  fig.text(Mx, 1.12, metaLines.slice(0, 2).join("\n"), { size: metaLines.length > 1 ? 8.5 : 10, color: T.INK_3, va: "top", lineSpacing: 1.35 });
  fig.line(Mx, 1.45, W_IN - Mx, 1.45, T.ACCENT, 1.6);

  // stat tiles
  const vsPlayed = p.vsrest.filter(v => v !== null);
  const vsTotal = sum(vsPlayed);
  let grossTile, netTile;
  if (p.nr) {
    grossTile = ["Gross", "NR", `picked up, ${p.holes_played} of ${n} holes`];
    netTile = ["Net", "NR", "no return"];
  } else {
    grossTile = ["Gross", String(p.gross), `${fmtToPar(p.topar)}  ·  ${p.gplace} of ${N}` + (p.gtied ? ", tied" : "")];
    netTile = ["Net", String(p.net), `${fmtToPar(p.net - sum(PAR))} to par`];
  }
  const tiles = [grossTile, netTile,
    ["Stableford", String(p.pts), `points  ·  ${p.splace} of ${N}` + (p.stied ? ", tied" : "")],
    ["Against the field", fmtSigned(vsTotal, 1), `strokes ${vsTotal < 0 ? "fewer" : "more"} than the rest`]];
  const axt = fig.axes(rect(0.28, 1.0, 0.50), [0, 4], [0, 1]);
  tiles.forEach(([lab, big, small], k) => {
    axt.rbox(k + 0.05, 0.0, 0.9, 1.0, T.PANEL, 0.06);
    axt.text(k + 0.5, 0.8, lab.toUpperCase(), { size: 8.5, family: "display", color: T.ACCENT, ha: "center", va: "center" });
    axt.text(k + 0.5, 0.47, big, { size: big.length < 6 ? 24 : 17, family: "display", color: big === "NR" ? T.INK_3 : T.INK, ha: "center", va: "center" });
    axt.text(k + 0.5, 0.15, small, { size: 8, color: T.INK_3, ha: "center", va: "center" });
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
    axs.text(0, cell(k), label.toUpperCase(), { size: 8.5, family: "display", color: T.INK_3, va: "center" });
  }
  const [y0, h0] = ROWS.score;
  axs.rbox(LX - 0.05, y0, ncol + 0.1, h0, T.PANEL, 0.06);
  axs.line(0, ROWS.strokes[0], xmax, ROWS.strokes[0], T.LINE, 0.8);
  axs.line(0, ROWS.points[0] + ROWS.points[1], xmax, ROWS.points[0] + ROWS.points[1], T.LINE, 0.8);
  const [big, mid, small0] = n <= 9 ? [17, 10, 7.5] : [14, 9, 7];
  const small = axs.fitSize(columns.filter(c => c[0] === "hole").map(([, h]) => `par ${PAR[h]}  ·  SI ${SI[h]}`), 0.96, small0, 5, "text");
  columns.forEach(([kind, ref], k) => {
    const x = LX + k + 0.5;
    if (kind === "hole") {
      const h = ref;
      axs.text(x, ROWS.hole[0] + 0.32, L[h], { size: 15, family: "display", color: T.INK, ha: "center", va: "center" });
      axs.text(x, ROWS.hole[0] + 0.78, `par ${PAR[h]}  ·  SI ${SI[h]}`, { size: small, color: T.INK_3, ha: "center", va: "center" });
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
  if (p.nr) note = "– = picked up, no return  ·  " + note;
  axs.text(xmax, 5.0, note, { size: 7.5, color: T.INK_3, ha: "right", va: "center" });

  // against the field
  const vs = p.vsrest;
  const lo = Math.min(0, ...vsPlayed), hi = Math.max(0, ...vsPlayed);
  const span = Math.max(1, hi - lo), lim = span;
  const axb = fig.axes(rect(5.3, 2.3, MARGIN, 0.60), [0.3, n + 0.7], [lo - span * 0.42, hi + span * 0.45]);
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
  fig.text(Mx, 7.72, "Minus and below the line = fewer strokes than everyone else's average on that hole. Plus and above = more, as on any leaderboard.",
    { size: 7.5, color: T.INK_3, va: "top" });

  // where the strokes went
  const axw = fig.axes(rect(5.3, 2.3, 0.64), [0, 1], [0, 1]);
  section(axw, 0, 0.955, "Shots to par, by section");
  const d = p.deltas;
  const rows = [];
  const group = (label, hs) => {
    const pl = hs.filter(h => d[h] !== null);
    if (pl.length) rows.push([label, sum(pl.map(h => d[h])), pl.length]);
  };
  const range = (a, b) => [...Array(b - a).keys()].map(i => a + i);
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
  let y = 0.82;
  for (const [label, v, cnt] of rows) {
    axw.text(0, y, label, { size: 9, color: T.INK_2, va: "center" });
    axw.text(0.62, y, fmtToPar(v), { size: 11, family: "display", color: v < 0 ? T.UNDER : T.INK, ha: "right", va: "center" });
    axw.text(0.68, y, `${fmtSigned(v / cnt, 1)} per hole`, { size: 7.5, color: T.INK_3, va: "center" });
    y -= 0.115;
  }
  axw.text(0, y - 0.02, "Results against par" + (p.nr ? ` (${p.holes_played} holes played)` : ""), { size: 8, color: T.INK_3, va: "center" });
  outcomeBar(axw, 0, y - 0.13, 1.0, 0.075, p.counts, n, 0.006, true, 8);

  // story
  const axf = fig.axes(rect(8.05, 2.65), [0, 1], [0, 1]);
  section(axf, 0, 0.96, "The story of the round");
  y = 0.80;
  const maxW = axf.wIn - 0.016 * axf.wIn;
  for (const ln of story(M, p).slice(0, 7)) {
    const lines = fig.wrap(ln, maxW, 9.5);
    axf.rbox(0.0, y - 0.035, 0.006, 0.07, T.ACCENT, 0);
    axf.text(0.016, y, lines.join("\n"), { size: 9.5, color: T.INK_2, va: "center", lineSpacing: 1.3 });
    y -= 0.13 + (lines.length - 1) * 0.05;
  }

  const prefix = p.gplace !== null ? String(p.gplace).padStart(2, "0") : "NR";
  return { file: `players/${prefix}_${fileSlug(p.name)}.png`, fig };
}

export function renderCards(M, T, names = null) {
  return M.players.filter(p => !names || names.includes(p.name)).map(p => renderCard(M, p, T));
}
