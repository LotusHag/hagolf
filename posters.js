// Port of golf/posters.py: gross leaderboard, Stableford leaderboard, how the holes played; plus season standings.
import { Fig, MARGIN, HEADER_IN, header, footer, section, posChip, outcomeBar, legend, on } from "./draw.js";
import { fmtToPar, fmtSigned, fmtHcp, fix } from "./model.js";

const ROW_IN = 0.5;

export function presentOutcomes(T, rows) {
  const tot = [0, 1, 2, 3].map(k => rows.reduce((a, r) => a + r.counts[k], 0));
  return T.OUTCOMES.filter((o, k) => tot[k] > 0);
}

// ---------------------------------------------------------------- generic table
const col = (title, x0, x1, draw, ha = "center", legendItems = null) => ({ title, x0, x1, draw, ha, legend: legendItems });
const cx = c => c.ha === "left" ? c.x0 : c.ha === "right" ? c.x1 : (c.x0 + c.x1) / 2;

function dName(ax, c, y, r) {
  const T = ax.fig.T;
  const w = ax.text(c.x0, y, r.name, { size: c.size || 15, family: "display", color: T.INK, va: "center" });
  if (r.penalty_total) {
    const x = c.x0 + w / ax.wIn * (ax.xlim[1] - ax.xlim[0]) + 0.15;
    ax.rbox(x, y - 0.14, 0.66, 0.28, T.BRONZE, 0.05);
    ax.text(x + 0.33, y, `pen +${r.penalty_total}`, { size: 7, family: "display", color: on(T, T.BRONZE), ha: "center", va: "center" });
  }
}
dName.isName = true;

function drawTable(ax, cols, rows, W) {
  const T = ax.fig.T;
  for (const c of cols) {
    if (c.draw.isName) {
      const reserve = rows.some(r => r.penalty_total) ? 0.8 : 0;
      c.size = ax.fitSize(rows.map(r => r.name), c.x1 - c.x0 - reserve, 15);
    }
    ax.text(cx(c), 0.55, c.title.toUpperCase(), { size: 9, family: "display", color: T.INK_3, ha: c.ha, va: "center" });
    if (c.legend) legend(ax, c.x0, 0.95, c.legend, 7, 0.16, 0.14, 0.1);
  }
  ax.line(0, 0.1, W, 0.1, T.LINE, 0.8);
  rows.forEach((row, i) => {
    const y = -i - 0.5;
    if (i % 2 === 1) ax.rbox(0, y - 0.46, W, 0.92, T.PANEL, 0.08);
    for (const c of cols) c.draw(ax, c, y, row);
  });
}

function tablePoster(M, T, title, cols, rows, W, right, foot, width = 11.5, kicker = null, sub = null) {
  const n = rows.length;
  const axIn = (n + 1.25) * ROW_IN;
  const probe = new Fig(width, 1, T, 20);
  const lines = probe.wrap(foot, width * (1 - 2 * MARGIN), 9).length;
  const footIn = 0.45 + 0.17 * (lines - 1);
  const H = HEADER_IN + 0.15 + axIn + footIn;
  const fig = new Fig(width, H, T);
  header(fig, title, kicker ?? M.name, sub ?? M.sub, right);
  const ax = fig.axes([MARGIN, footIn / H, 1 - 2 * MARGIN, axIn / H], [0, W], [-n, 1.25]);
  drawTable(ax, cols, rows, W);
  footer(fig, foot);
  return fig;
}

function dPos(key) {
  return (ax, c, y, r) => {
    const T = ax.fig.T;
    posChip(ax, cx(c), y, r[key + "place"], 0.8, 12);
  };
}

function dVal(fn, size = 12, color = null, family = "text") {
  return (ax, c, y, r) => {
    const T = ax.fig.T;
    const v = fn(r);
    const muted = v === "NR" || v === "–";
    const colr = muted ? T.INK_3 : (typeof color === "function" ? color(r, T) : (color || T.INK_2));
    ax.text(cx(c), y, v, { size: muted ? Math.min(size, 13) : size, family, color: colr, ha: c.ha, va: "center" });
  };
}

const toparColor = (v, T) => v < 0 ? T.UNDER : v === 0 ? T.INK : T.INK_2;

const dOutcomes = n => (ax, c, y, r) => outcomeBar(ax, c.x0, y - 0.2, c.x1 - c.x0, 0.4, r.counts, n);

function pointsMeter(scaleMax, level, key = "pts") {
  return (ax, c, y, r) => {
    const T = ax.fig.T;
    const w = c.x1 - c.x0;
    ax.rbox(c.x0, y - 0.13, w, 0.26, T.PANEL_2, 0.04);
    ax.rbox(c.x0, y - 0.13, w * Math.min(r[key], scaleMax) / scaleMax, 0.26, T.BAR, 0.04);
    if (level !== null) {
      const hx = c.x0 + w * level / scaleMax;
      ax.line(hx, y - 0.24, hx, y + 0.24, T.ACCENT, 1.2);
    }
  };
}

const countbackText = n => n === 18 ? "last 9, 6 and 3 holes, then hole by hole from the last" : "last 6 and 3 holes, then hole by hole from the last";

function notes(rows, key) {
  let out = "";
  if (rows.some(r => r.penalty_total)) out += " Pen badge: penalty strokes handed out after the round, counted on their hole.";
  if (rows.some(r => r.nr)) out += " NR: no return, the player picked up on a hole; that hole scores no points.";
  if (rows.some(r => r.ph < 0)) out += " A plus handicap (+1) gives a stroke back, so net can be higher than gross.";
  return out;
}

// ---------------------------------------------------------------- posters
export function grossLeaderboard(M, T) {
  const rows = M.gross_board, n = M.n, N = M.field;
  const W = 10;
  const cols = [
    col("Pos", 0.15, 0.95, dPos("g")),
    col("Player", 1.15, 4.6, dName, "left"),
    col("Gross", 4.7, 5.6, dVal(r => r.gross === null ? "NR" : String(r.gross), 20, (r, T) => T.INK, "display"), "right"),
    col("To par", 5.7, 6.5, dVal(r => r.topar === null ? "–" : fmtToPar(r.topar), 14, (r, T) => toparColor(r.topar, T), "display"), "right"),
    col(`The round: ${n} holes by result`, 6.85, 9.95, dOutcomes(n), "left", presentOutcomes(T, rows)),
  ];
  const finished = rows.filter(p => p.gross !== null).map(p => p.gross);
  let summary = `Field ${N}`;
  if (finished.length) summary += `  ·  best ${Math.min(...finished)}  ·  average ${fix(finished.reduce((a, b) => a + b, 0) / finished.length)}`;
  return tablePoster(M, T, "Gross leaderboard", cols, rows, W, `Stroke play, no handicap\n${summary}`,
    `Lowest gross wins. Equal scores are separated on countback (${countbackText(n)}). The round bar has one block per hole, ` +
    "grouped by result against par, best results first." + notes(rows, "g"));
}

export function stablefordLeaderboard(M, T) {
  const rows = M.stbl_board, n = M.n, N = M.field;
  const level = 2 * n;
  const best = Math.max(...rows.map(p => p.pts));
  const scaleMax = Math.max(level + 6, 3 * Math.ceil((best + 2) / 3));
  const hcpTitle = M.allowance === 100 ? "Hcp" : `Hcp (${M.allowance}%)`;
  const W = 10;
  const cols = [
    col("Pos", 0.15, 0.95, dPos("s")),
    col("Player", 1.15, 4.3, dName, "left"),
    col(hcpTitle, 4.3, 5.0, dVal(r => fmtHcp(r.ph), 11, (r, T) => T.INK_3), "right"),
    col("Gross", 5.1, 5.8, dVal(r => r.gross === null ? "NR" : String(r.gross), 12), "right"),
    col("Net", 5.9, 6.6, dVal(r => r.net === null ? "NR" : String(r.net), 14, (r, T) => T.INK, "display"), "right"),
    col("Points", 6.75, 7.65, dVal(r => String(r.pts), 22, (r, T) => T.ACCENT, "display"), "right"),
    col(`Points, 0 to ${scaleMax}, line at ${level}`, 7.95, 9.95, pointsMeter(scaleMax, level), "left"),
  ];
  const avg = rows.reduce((a, p) => a + p.pts, 0) / rows.length;
  const tees = [...new Set(rows.map(p => p.tee))].sort();
  const allowance = M.allowance === 100 ? "" : `, ${M.allowance}% allowance`;
  return tablePoster(M, T, "Stableford leaderboard", cols, rows, W,
    `Net, course handicap${allowance}${tees.length > 1 ? ", tees: " + tees.join(", ") : ""}\nField ${N}  ·  best ${best} pts  ·  average ${fix(avg)}`,
    `Most points wins. Equal points are separated on countback (${countbackText(n)}). ${level} points is playing to handicap: 2 points per hole for a net par, ` +
    "3 for a net birdie, 1 for a net bogey, nothing for worse." + notes(rows, "s"));
}

export function holesPoster(M, T) {
  const holes = M.holes, n = M.n, N = M.field;
  const width = n <= 9 ? 12 : 19;
  const fig = new Fig(width, 8.8, T);
  const Hf = fig.h;
  const finished = M.players.filter(p => p.gross !== null);
  let right = `Field ${N} players`;
  if (finished.length) {
    const avgGross = finished.reduce((a, p) => a + p.gross, 0) / finished.length;
    right += `\nCourse average ${fix(avgGross)}, ${fmtToPar(avgGross - M.course_par)} to par`;
  }
  header(fig, "How the holes played", M.name, M.sub, right);
  const X0 = MARGIN, X1 = 1 - MARGIN;
  const xlim = [0.5, n + 0.5];
  const bw = n <= 9 ? 0.6 : 0.68;
  const panel = (topIn, hIn, ylim = [0, 1]) => fig.axes([X0, 1 - (topIn + hIn) / Hf, X1 - X0, hIn / Hf], xlim, ylim);

  let ax = panel(1.75, 0.95);
  for (const h of holes) {
    ax.text(h.hole, 0.7, h.label, { size: 22, family: "display", color: T.INK, ha: "center", va: "center" });
    ax.text(h.hole, 0.3, `par ${h.par}  ·  SI ${h.si}`, { size: 9, color: T.INK_2, ha: "center", va: "center" });
    if (h.metres) ax.text(h.hole, 0.12, `${h.metres} m`, { size: 8.5, color: T.INK_3, ha: "center", va: "center" });
  }
  ax.line(xlim[0], 0, xlim[1], 0, T.LINE, 0.8);

  const top = Math.max(Math.max(...holes.map(h => h.vspar)), 0.5);
  const low = Math.min(Math.min(...holes.map(h => h.vspar)), 0);
  ax = panel(2.85, 2.5, [low * 1.4 - top * 0.1, top * 1.3]);
  section(ax, 0.5, top * 1.22, "Average score against par");
  const hardest = holes.reduce((a, h) => h.difficulty < a.difficulty ? h : a);
  const easiest = holes.reduce((a, h) => h.difficulty > a.difficulty ? h : a);
  const fieldAvg = holes.reduce((a, h) => a + h.vspar, 0) / n;
  ax.text(n + 0.5, top * 1.22, `dashed line: course average ${fmtSigned(fieldAvg, 2)} per hole`, { size: 8.5, color: T.INK_3, ha: "right", va: "center" });
  // dashed course-average line under the bars; value labels sit on a page-coloured halo so it never runs through them
  ax.line(xlim[0], fieldAvg, xlim[1], fieldAvg, T.INK_3, 0.8, [4, 3]);
  for (const h of holes) {
    const v = h.vspar;
    ax.rbox(h.hole - bw / 2, Math.min(0, v), bw, Math.abs(v), T.BAR, 0.04);
    const ty = v + (v >= 0 ? top * 0.03 : -top * 0.03);
    const txt = fmtSigned(v, 2);
    const tw = ax.textWidth(txt, 11, "display"), th = 11 / 72 / ax.hIn * (ax.ylim[1] - ax.ylim[0]);
    const pad = 0.06;
    ax.rbox(h.hole - tw / 2 - pad, (v >= 0 ? ty : ty - th) - top * 0.015, tw + 2 * pad, th + top * 0.03, T.BG, 0);
    ax.text(h.hole, ty, txt, { size: 11, family: "display", color: T.INK, ha: "center", va: v >= 0 ? "bottom" : "top" });
  }
  for (const [h, word] of [[hardest, "hardest"], [easiest, "easiest"]]) {
    ax.text(h.hole, low * 1.4 - top * 0.08, word, { size: 8.5, color: T.INK_2, ha: "center", va: "top" });
  }
  ax.line(xlim[0], 0, xlim[1], 0, T.LINE, 0.8);

  ax = panel(5.65, 2.55, [-0.16, 1.32]);
  section(ax, 0.5, 1.24, "What the field scored");
  legend(ax, n * 0.45, 1.24, presentOutcomes(T, holes), 8, 0.14 * n / 9, 0.06, 0.12 * n / 9);
  for (const h of holes) {
    let y = 0;
    if (!h.n) continue;
    for (let k = 3; k >= 0; k--) {
      const c = h.counts[k], colr = T.OUTCOMES[k][1];
      if (c === 0) continue;
      const seg = c / h.n;
      ax.rbox(h.hole - bw / 2, y + 0.008, bw, seg - 0.016, colr, 0.02);
      if (seg > 0.06) ax.text(h.hole, y + seg / 2, String(c), { size: 9, family: "display", color: on(T, colr), ha: "center", va: "center" });
      y += seg;
    }
    ax.text(h.hole, -0.04, `avg ${fix(h.avg)}`, { size: 8.5, color: T.INK_3, ha: "center", va: "top" });
  }
  ax.line(xlim[0], 0, xlim[1], 0, T.LINE, 0.8);

  const tot = [0, 1, 2, 3].map(k => holes.reduce((a, h) => a + h.counts[k], 0));
  const played = holes.reduce((a, h) => a + h.n, 0);
  const teeNote = new Set(M.players.map(p => p.tee)).size > 1 ? ` Par and lengths from the ${M.defaultTee} tees.` : "";
  footer(fig, `Across the round: ${tot[0]} birdies or better, ${tot[1]} pars, ${tot[2]} bogeys, ${tot[3]} doubles or worse ` +
    `from ${played} holes played. Stacks read bottom up from worst result to best.${teeNote}`);
  return fig;
}

/** Season standings for a group: `S` from model.standings, `group` the group record. */
export function standingsPoster(S, group, T) {
  const rows = S.rows;
  const maxPts = Math.max(1, ...rows.map(r => r.counted));
  const scaleMax = 10 * Math.ceil((maxPts + 1) / 10);
  const W = 10;
  const countedTitle = S.bestN > 0 ? `Best ${S.bestN}` : "Points";
  const cols = [
    col("Pos", 0.15, 0.95, (ax, c, y, r) => posChip(ax, cx(c), y, r.place, 0.8, 12)),
    col("Player", 1.15, 4.1, dName, "left"),
    col("Rounds", 4.1, 4.9, dVal(r => String(r.played), 12, (r, T) => T.INK_2), "right"),
    col("Wins", 5.0, 5.6, dVal(r => String(r.wins), 12, (r, T) => T.INK_2), "right"),
    col("Best", 5.7, 6.3, dVal(r => String(r.best), 12, (r, T) => T.INK_2), "right"),
    col("Avg", 6.4, 7.0, dVal(r => fix(r.avg), 12, (r, T) => T.INK_2), "right"),
    col(countedTitle, 7.1, 7.9, dVal(r => String(r.counted), 22, (r, T) => T.ACCENT, "display"), "right"),
    col(`Points, 0 to ${scaleMax}`, 8.15, 9.95, pointsMeter(scaleMax, null, "counted"), "left"),
  ];
  const dates = S.rounds.map(r => r.date).filter(Boolean).sort();
  const span = dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`) : "";
  const sub = [`${S.rounds.length} round${S.rounds.length === 1 ? "" : "s"}`, span].filter(Boolean).join("  ·  ");
  const rule = S.bestN > 0 ? `The best ${S.bestN} rounds count towards the total; every round counts for the average.`
    : "Every round counts towards the total.";
  const M = { name: group.name, sub };
  const tableRows = rows.map(r => ({ ...r, penalty_total: 0 }));
  return tablePoster(M, T, "Season standings", cols, tableRows, W,
    `Stableford points across rounds\nLeader ${maxPts} pts  ·  ${rows.length} player${rows.length === 1 ? "" : "s"}`,
    `Most Stableford points wins. ${rule} Wins: most points among the group's players on the day, shared when equal. ` +
    "Only rounds with at least one group member count, and only members' results.", 11.5, group.name, sub);
}

export function renderPosters(M, T) {
  return [
    { file: "1_leaderboard_gross.png", fig: grossLeaderboard(M, T) },
    { file: "2_leaderboard_stableford.png", fig: stablefordLeaderboard(M, T) },
    { file: "3_holes.png", fig: holesPoster(M, T) },
  ];
}
