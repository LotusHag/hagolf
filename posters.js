// Port of golf/posters.py: gross leaderboard, Stableford leaderboard, both boards on one sheet, how the
// holes played; plus season standings.
//
// Each of these is a header, a set of headline numbers and one or two blocks, handed to `sheet` (sheet.js).
// The theme family decides the page from there: how wide, whether the headline numbers sit in a row or up
// in the header band, how much of the footer survives, and -- for the two-board sheet -- whether the boards
// stand side by side or one under the other. What a column contains and how a row is ranked never varies.
import { house, caps, note, posChip, outcomeBar, legend, on, rowBand } from "./draw.js";
import { sheet, block, blockAxes, heading, headingIn, dense } from "./sheet.js";
import { fmtToPar, fmtSigned, fmtHcp, fix, NO_SCORE } from "./model.js";

const ROW_IN = 0.5;

export function presentOutcomes(T, rows) {
  return T.OUTCOMES.filter((o, k) => rows.reduce((a, r) => a + r.counts[k], 0) > 0);
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
    ax.text(cx(c), 0.55, caps(T, c.title), { size: 9, family: "display", color: T.INK_3, ha: c.ha, va: "center" });
    if (c.legend && house(T).legends) legend(ax, c.x0, 0.95, c.legend, 7, 0.16, 0.14, 0.1);
  }
  ax.line(0, 0.1, W, 0.1, T.LINE, 0.8);
  rows.forEach((row, i) => {
    const y = -i - 0.5;
    rowBand(ax, 0, y - 0.46, W, 0.92, i);
    for (const c of cols) c.draw(ax, c, y, row);
  });
}

/** A leaderboard as a block: `W` is the column space the columns were laid out in, whatever inches it gets. */
function tableBlock(T, cols, rows, W, { title = "", tail = "", minW = 7.0 } = {}) {
  const rowIn = ROW_IN * dense(T), headIn = rowIn * 1.25;
  const hIn = rowIn * rows.length + headIn;
  return block("table", minW, () => hIn + (title ? headingIn : 0), (fig, x, top, w) => {
    if (title) heading(fig, x, top, w, title, note(T, tail));
    const ax = blockAxes(fig, x, top + (title ? headingIn : 0), w, hIn, [0, W], [-rows.length, 1.25]);
    drawTable(ax, cols, rows, W);
  });
}

const courseNote = M => (M.course && (M.course.notes || []).length) ? ` Course file: ${M.course.notes.join("; ")}.` : "";

function dPos(key) {
  return (ax, c, y, r) => posChip(ax, cx(c), y, r[key + "place"], 0.8, 12);
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

function notes(rows) {
  let out = "";
  if (rows.some(r => r.penalty_total)) out += " Pen badge: penalty strokes handed out after the round, counted on their hole.";
  if (rows.some(r => r.filled && r.filled.some(Boolean))) out += ` A hole with no score, picked up or never entered, counts ${NO_SCORE} strokes.`;
  if (rows.some(r => r.skipped && r.skipped.some(Boolean))) out += " A player who joined late has no gross and scores points from the holes played.";
  if (rows.some(r => r.ph < 0)) out += " A plus handicap (+1) gives a stroke back, so net can be higher than gross.";
  return out;
}

// ---------------------------------------------------------------- posters
/**
 * A board comes in two tiers. `basic` is what the free app renders: position, name, score, with the number
 * set large, so it reads as a deliberately plain poster rather than a full one with columns missing. `full`
 * adds what the round was actually like -- to par, the result bar, the handicap, the meter, and a row of
 * headline numbers. Both go through the same blocks, so a tier is a column set, never a second renderer.
 */
export const TIERS = ["basic", "full"];
const BASIC_W = 6.4;

export function grossLeaderboard(M, T, tier = "full") {
  const rows = M.gross_board, n = M.n, N = M.field;
  const finished = rows.filter(p => p.gross !== null).map(p => p.gross);
  const foot = `Lowest gross wins. Equal scores are separated on countback (${countbackText(n)}).`;
  if (tier === "basic") {
    const cols = [
      col("Pos", 0.15, 0.95, dPos("g")),
      col("Player", 1.15, 4.9, dName, "left"),
      col("Gross", 5.0, 6.25, dVal(r => r.gross === null ? "NR" : String(r.gross), 26, (r, T) => T.INK, "display")),
    ];
    return sheet(T, {
      title: "Gross leaderboard", kicker: M.name, sub: M.sub,
      right: `Stroke play, no handicap\nField ${N}${finished.length ? `  ·  best ${Math.min(...finished)}` : ""}`,
      foot: foot + notes(rows) + courseNote(M), tiles: null,
    }, [tableBlock(T, cols, rows, BASIC_W, { minW: 5.6 })], { maxCols: 1, minInner: 6.6 });
  }
  const W = 10;
  const cols = [
    col("Pos", 0.15, 0.95, dPos("g")),
    col("Player", 1.15, 4.6, dName, "left"),
    col("Gross", 4.7, 5.6, dVal(r => r.gross === null ? "NR" : String(r.gross), 20, (r, T) => T.INK, "display")),
    col("To par", 5.7, 6.5, dVal(r => r.topar === null ? "–" : fmtToPar(r.topar), 14, (r, T) => toparColor(r.topar, T), "display")),
    col(`The round: ${n} holes by result`, 6.85, 9.95, dOutcomes(n), "left", presentOutcomes(T, rows)),
  ];
  const avg = finished.length ? finished.reduce((a, b) => a + b, 0) / finished.length : null;
  return sheet(T, {
    title: "Gross leaderboard", kicker: M.name, sub: M.sub,
    right: "Stroke play, no handicap",
    foot: foot + " The round bar has one block per hole, grouped by result against par, best results first." + notes(rows) + courseNote(M),
    tiles: [[N, "in the field"], [finished.length ? Math.min(...finished) : "–", "best gross", T.ACCENT],
      [avg === null ? "–" : fix(avg), "average"], [n, "holes"]],
  }, [tableBlock(T, cols, rows, W, { minW: 8.4 })], { maxCols: 1, minInner: 9.4 });
}

export function stablefordLeaderboard(M, T, tier = "full") {
  const rows = M.stbl_board, n = M.n, N = M.field;
  const level = 2 * n, best = Math.max(...rows.map(p => p.pts));
  const scaleMax = Math.max(level + 6, 3 * Math.ceil((best + 2) / 3));
  const foot = `Most points wins. Equal points are separated on countback (${countbackText(n)}).`;
  if (tier === "basic") {
    const cols = [
      col("Pos", 0.15, 0.95, dPos("s")),
      col("Player", 1.15, 4.9, dName, "left"),
      col("Points", 5.0, 6.25, dVal(r => String(r.pts), 26, (r, T) => T.ACCENT, "display")),
    ];
    return sheet(T, {
      title: "Stableford leaderboard", kicker: M.name, sub: M.sub,
      right: `Net, course handicap\nField ${N}  ·  best ${best} pts`,
      foot: `${foot} ${level} points is playing to handicap.` + notes(rows) + courseNote(M), tiles: null,
    }, [tableBlock(T, cols, rows, BASIC_W, { minW: 5.6 })], { maxCols: 1, minInner: 6.6 });
  }
  const hcpTitle = M.allowance === 100 ? "Hcp" : `Hcp (${M.allowance}%)`;
  const W = 10;
  const cols = [
    col("Pos", 0.15, 0.95, dPos("s")),
    col("Player", 1.15, 4.3, dName, "left"),
    col(hcpTitle, 4.3, 5.0, dVal(r => fmtHcp(r.ph), 11, (r, T) => T.INK_3)),
    col("Gross", 5.1, 5.8, dVal(r => r.gross === null ? "NR" : String(r.gross), 12)),
    col("Net", 5.9, 6.6, dVal(r => r.net === null ? "NR" : String(r.net), 14, (r, T) => T.INK, "display")),
    col("Points", 6.75, 7.65, dVal(r => String(r.pts), 22, (r, T) => T.ACCENT, "display")),
    col(`Points, 0 to ${scaleMax}, line at ${level}`, 7.95, 9.95, pointsMeter(scaleMax, level), "left"),
  ];
  const avg = rows.reduce((a, p) => a + p.pts, 0) / rows.length;
  const tees = [...new Set(rows.map(p => p.tee))].sort();
  const allowance = M.allowance === 100 ? "" : `, ${M.allowance}% allowance`;
  return sheet(T, {
    title: "Stableford leaderboard", kicker: M.name, sub: M.sub,
    right: `Net, course handicap${allowance}${tees.length > 1 ? `\nTees: ${tees.join(", ")}` : ""}`,
    foot: `${foot} ${level} points is playing to handicap: 2 points per hole for a net par, 3 for a net birdie, ` +
      "1 for a net bogey, nothing for worse." + notes(rows) + courseNote(M),
    tiles: [[N, "in the field"], [best, "best", T.ACCENT], [fix(avg), "average"], [level, "is level"]],
  }, [tableBlock(T, cols, rows, W, { minW: 8.4 })], { maxCols: 1, minInner: 9.4 });
}

/** One sheet with both boards, for the clubhouse wall. Two columns wherever the family will allow them. */
export function bothBoards(M, T) {
  const gRows = M.gross_board, sRows = M.stbl_board, n = M.n, N = M.field;
  const level = 2 * n, bestPts = Math.max(...sRows.map(p => p.pts));
  const scaleMax = Math.max(level + 6, 3 * Math.ceil((bestPts + 2) / 3));
  const hcpTitle = M.allowance === 100 ? "Hcp" : `Hcp (${M.allowance}%)`;
  const W = 10;
  const grossCols = [
    col("Pos", 0.15, 0.95, dPos("g")),
    col("Player", 1.15, 4.75, dName, "left"),
    col("Gross", 4.85, 5.75, dVal(r => r.gross === null ? "NR" : String(r.gross), 20, (r, T) => T.INK, "display")),
    col("To par", 5.85, 6.7, dVal(r => r.topar === null ? "–" : fmtToPar(r.topar), 14, (r, T) => toparColor(r.topar, T), "display")),
    col(`The round: ${n} holes by result`, 6.95, 9.95, dOutcomes(n), "left", presentOutcomes(T, gRows)),
  ];
  const stblCols = [
    col("Pos", 0.15, 0.95, dPos("s")),
    col("Player", 1.15, 4.5, dName, "left"),
    col(hcpTitle, 4.5, 5.15, dVal(r => fmtHcp(r.ph), 11, (r, T) => T.INK_3)),
    col("Net", 5.25, 6.0, dVal(r => r.net === null ? "NR" : String(r.net), 14, (r, T) => T.INK, "display")),
    col("Points", 6.15, 7.05, dVal(r => String(r.pts), 22, (r, T) => T.ACCENT, "display")),
    col(`Points, 0 to ${scaleMax}, line at ${level}`, 7.3, 9.95, pointsMeter(scaleMax, level), "left"),
  ];
  const finished = gRows.filter(p => p.gross !== null).map(p => p.gross);
  const tees = [...new Set(sRows.map(p => p.tee))].sort();
  const allowance = M.allowance === 100 ? "" : `, ${M.allowance}% allowance`;
  return sheet(T, {
    title: "Both boards", kicker: M.name, sub: M.sub,
    right: `Stroke play and net Stableford${tees.length > 1 ? `\nTees: ${tees.join(", ")}` : ""}`,
    foot: `The same round finished two ways. Lowest gross wins on one board, most points wins on the other, and equal scores are ` +
      `separated on countback (${countbackText(n)}). ${level} points is playing to handicap. The round bar has one block per hole, ` +
      `grouped by result against par, best results first.` + notes(gRows) + courseNote(M),
    tiles: [[N, "in the field"], [finished.length ? Math.min(...finished) : "–", "best gross"], [bestPts, "best points", T.ACCENT]],
    tilesWide: true,
  }, [
    tableBlock(T, grossCols, gRows, W, { title: "Gross", tail: "stroke play, no handicap", minW: 5.9 }),
    tableBlock(T, stblCols, sRows, W, { title: "Stableford", tail: `net, course handicap${allowance}`, minW: 5.9 }),
  ], { minCols: 2 });
}

/**
 * How the holes played. The three panels share one x axis -- the hole number -- so they are one block and
 * never split across columns; what the family changes here is the paper, the headline numbers and the
 * words. The width comes from the hole count, as it always has.
 */
export function holesPoster(M, T) {
  const holes = M.holes, n = M.n, N = M.field;
  const finished = M.players.filter(p => p.gross !== null);
  const avgGross = finished.length ? finished.reduce((a, p) => a + p.gross, 0) / finished.length : null;
  const hardest = holes.reduce((a, h) => h.difficulty < a.difficulty ? h : a);
  const easiest = holes.reduce((a, h) => h.difficulty > a.difficulty ? h : a);
  const fieldAvg = holes.reduce((a, h) => a + h.vspar, 0) / n;
  const tot = [0, 1, 2, 3].map(k => holes.reduce((a, h) => a + h.counts[k], 0));
  const played = holes.reduce((a, h) => a + h.n, 0);
  const inner = n <= 9 ? 10.9 : 17.4;
  const d = dense(T);
  const P = [[0, 0.95], [1.10 * d, 2.5 * d], [3.90 * d, 2.55 * d]];
  const bodyIn = P[2][0] + P[2][1];

  const chart = block("chart", 99, () => bodyIn, (fig, x, top, w) => {
    const xlim = [0.5, n + 0.5], bw = n <= 9 ? 0.6 : 0.68;
    const panel = (i, ylim = [0, 1]) => blockAxes(fig, x, top + P[i][0], w, P[i][1], xlim, ylim);

    let ax = panel(0);
    for (const h of holes) {
      ax.text(h.hole, 0.7, h.label, { size: 22, family: "display", color: T.INK, ha: "center", va: "center" });
      ax.text(h.hole, 0.3, `par ${h.par}  ·  SI ${h.si}`, { size: 9, color: T.INK_2, ha: "center", va: "center" });
      if (h.metres) ax.text(h.hole, 0.12, `${h.metres} m`, { size: 8.5, color: T.INK_3, ha: "center", va: "center" });
    }
    ax.line(xlim[0], 0, xlim[1], 0, T.LINE, 0.8);

    const hi = Math.max(Math.max(...holes.map(h => h.vspar)), 0.5);
    const low = Math.min(Math.min(...holes.map(h => h.vspar)), 0);
    ax = panel(1, [low * 1.4 - hi * 0.1, hi * 1.3]);
    heading(fig, x, top + P[1][0] - headingIn * 0.1, w, "Average score against par",
      note(T, `dashed line: course average ${fmtSigned(fieldAvg, 2)} per hole`));
    // dashed course-average line under the bars; value labels sit on a page-coloured halo so it never runs through them
    ax.line(xlim[0], fieldAvg, xlim[1], fieldAvg, T.INK_3, 0.8, [4, 3]);
    for (const h of holes) {
      const v = h.vspar;
      ax.rbox(h.hole - bw / 2, Math.min(0, v), bw, Math.abs(v), T.BAR, 0.04);
      const ty = v + (v >= 0 ? hi * 0.03 : -hi * 0.03);
      const txt = fmtSigned(v, 2);
      const tw = ax.textWidth(txt, 11, "display"), th = 11 / 72 / ax.hIn * (ax.ylim[1] - ax.ylim[0]);
      const pad = 0.06;
      ax.rbox(h.hole - tw / 2 - pad, (v >= 0 ? ty : ty - th) - hi * 0.015, tw + 2 * pad, th + hi * 0.03, T.BG, 0);
      ax.text(h.hole, ty, txt, { size: 11, family: "display", color: T.INK, ha: "center", va: v >= 0 ? "bottom" : "top" });
    }
    for (const [h, word] of [[hardest, "hardest"], [easiest, "easiest"]]) {
      ax.text(h.hole, low * 1.4 - hi * 0.08, word, { size: 8.5, color: T.INK_2, ha: "center", va: "top" });
    }
    ax.line(xlim[0], 0, xlim[1], 0, T.LINE, 0.8);

    ax = panel(2, [-0.16, 1.32]);
    heading(fig, x, top + P[2][0] - headingIn * 0.1, w, "What the field scored", "");
    if (house(T).legends) legend(ax, n * 0.45, 1.24, presentOutcomes(T, holes), 8, 0.14 * n / 9, 0.06, 0.12 * n / 9);
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
  });

  const teeNote = (new Set(M.players.map(p => p.tee)).size > 1 ? ` Par and lengths from the ${M.defaultTee} tees.` : "") + courseNote(M);
  return sheet(T, {
    title: "How the holes played", kicker: M.name, sub: M.sub,
    right: `Field ${N} players`,
    foot: `Across the round: ${tot[0]} birdies or better, ${tot[1]} pars, ${tot[2]} bogeys, ${tot[3]} doubles or worse ` +
      `from ${played} holes played. Stacks read bottom up from worst result to best.${teeNote}`,
    tiles: [[N, "in the field"], [avgGross === null ? "–" : fix(avgGross), "course average"],
      [fmtSigned(fieldAvg, 2), "a hole against par", T.ACCENT],
      [hardest.label, "hardest hole"], [easiest.label, "easiest hole"]],
  }, [chart], { maxCols: 1, minInner: inner });
}

/** Season standings for a group: `S` from model.standings, `group` the group record. */
export const STANDINGS_TITLES = {
  stableford: "Season standings", stroke: "Stroke play standings", match: "Matchplay standings",
  soccer: "League table", gp: "Grand Prix standings", gpstroke: "Grand Prix standings, stroke play",
};

/**
 * One poster per way of scoring a league. `S` is the standings for that way (rows plus the rounds they
 * came from); `kind` picks the columns and the wording, since a football table and a Stableford total
 * have nothing in common but the players' names.
 */
export function standingsPoster(S, group, T, kind = "stableford") {
  const rows = S.rows;
  const W = 10;
  const rounds = S.rounds || [];
  const dates = rounds.map(r => r.date).filter(Boolean).sort();
  const span = dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`) : "";
  const sub = [`${rounds.length} round${rounds.length === 1 ? "" : "s"}`, span].filter(Boolean).join("  ·  ");
  const bestRule = S.bestN > 0 ? `The best ${S.bestN} rounds count towards the total; every round counts for the average.`
    : "Every round counts towards the total.";
  const onlyMembers = " Only rounds with at least one league member count, and only members' results.";
  const pos = col("Pos", 0.15, 0.95, (ax, c, y, r) => posChip(ax, cx(c), y, r.place, 0.8, 12));
  const num = (title, x0, x1, fn) => col(title, x0, x1, dVal(fn, 12, (r, T) => T.INK_2));
  const players = `${rows.length} player${rows.length === 1 ? "" : "s"}`;
  let cols, right, foot, tiles;

  if (kind === "stroke") {
    const lead = rows.length ? rows[0].counted : 0;
    cols = [pos, col("Player", 1.15, 4.6, dName, "left"),
      num("Rounds", 4.6, 5.4, r => String(r.played)), num("Wins", 5.5, 6.2, r => String(r.wins)),
      num("Best", 6.3, 7.1, r => r.best === null ? "–" : fmtToPar(r.best)),
      num("Avg", 7.2, 8.1, r => r.played ? fmtToPar(Math.round(r.avg * 10) / 10) : "–"),
      col(S.bestN > 0 ? `Best ${S.bestN}` : "Net to par", 8.2, 9.95, dVal(r => r.played ? fmtToPar(r.counted) : "–", 22, (r, T) => T.ACCENT, "display"))];
    right = "Net strokes against par";
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [fmtToPar(lead), "the leader", T.ACCENT]];
    foot = `Net score against par in every round added up, lowest total wins, so a 9 and an 18 compare. ${bestRule} ` +
      `A round without a return does not count for that player. Wins: best net against par among the league's players on the day.` + onlyMembers;
  } else if (kind === "match" || kind === "soccer") {
    const maxPts = Math.max(1, ...rows.map(r => r.points));
    const scaleMax = 5 * Math.ceil((maxPts + 1) / 5);
    const w = S.win ?? (kind.startsWith("soccer") ? 3 : 2), d = S.draw ?? 1;
    const basis = S.basis === "points" ? "the higher Stableford points" : "the lower net score";
    cols = [pos, col("Player", 1.15, 4.2, dName, "left"),
      num("P", 4.2, 4.8, r => String(r.played)), num("W", 4.9, 5.5, r => String(r.won)),
      num("D", 5.6, 6.2, r => String(r.drawn)), num("L", 6.3, 6.9, r => String(r.lost)),
      num("Holes up", 7.0, 7.85, r => (r.up > 0 ? "+" : "") + r.up),
      col("Pts", 7.95, 8.7, dVal(r => String(r.points), 22, (r, T) => T.ACCENT, "display")),
      col(`Points, 0 to ${scaleMax}`, 8.9, 9.95, pointsMeter(scaleMax, null, "points"), "left")];
    right = `${w} points a win, ${d} a draw\n${S.basis === "points" ? "Stableford" : "net strokes"}`;
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [maxPts, "the leader", T.ACCENT]];
    foot = `Every pair of league players who shared a round played a match, hole by hole, each hole going to ${basis}; ` +
      `a hole only one of them returned goes to the other. ${w} points for winning a match, ${d} for halving it. ` +
      `Holes up is the running margin across every match.` + onlyMembers;
  } else if (kind === "gp" || kind === "gpstroke") {
    const net = S.basis === "net";
    const maxPts = Math.max(1, ...rows.map(r => r.counted));
    const scaleMax = 25 * Math.ceil((maxPts + 1) / 25);
    cols = [pos, col("Player", 1.15, 4.1, dName, "left"),
      num("Rounds", 4.1, 4.9, r => String(r.played)), num("Wins", 5.0, 5.6, r => String(r.wins)),
      num("Best", 5.7, 6.3, r => String(r.best)), num("Avg", 6.4, 7.0, r => fix(r.avg)),
      col(S.bestN > 0 ? `Best ${S.bestN}` : "Points", 7.1, 7.9, dVal(r => String(r.counted), 22, (r, T) => T.ACCENT, "display")),
      col(`Points, 0 to ${scaleMax}`, 8.15, 9.95, pointsMeter(scaleMax, null, "counted"), "left")];
    right = `Points by finishing position\n${net ? "net against par" : "Stableford"}`;
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [maxPts, "the leader", T.ACCENT]];
    foot = `Every card hands out points by finishing position: ${(S.table || []).join(", ")} down the board, nothing after that. `
      + `The day is finished on ${net ? "net score against par, lowest wins, with countback on net strokes" : "Stableford points, with countback"}. `
      + (net ? "A player who did not return a full card has no position and scores nothing. " : "")
      + `Position is taken among the league's own players on the day, so a guest cannot take the win. ${bestRule}` + onlyMembers;
  } else {
    const maxPts = Math.max(1, ...rows.map(r => r.counted));
    const scaleMax = 10 * Math.ceil((maxPts + 1) / 10);
    cols = [pos, col("Player", 1.15, 4.1, dName, "left"),
      num("Rounds", 4.1, 4.9, r => String(r.played)), num("Wins", 5.0, 5.6, r => String(r.wins)),
      num("Best", 5.7, 6.3, r => String(r.best)), num("Avg", 6.4, 7.0, r => fix(r.avg)),
      col(S.bestN > 0 ? `Best ${S.bestN}` : "Points", 7.1, 7.9, dVal(r => String(r.counted), 22, (r, T) => T.ACCENT, "display")),
      col(`Points, 0 to ${scaleMax}`, 8.15, 9.95, pointsMeter(scaleMax, null, "counted"), "left")];
    right = "Stableford points across rounds";
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [maxPts, "the leader", T.ACCENT]];
    foot = `Most Stableford points wins. ${bestRule} Wins: most points among the league's players on the day, shared when equal.` + onlyMembers;
  }
  return sheet(T, {
    title: STANDINGS_TITLES[kind] || STANDINGS_TITLES.stableford, kicker: group.name, sub,
    right: `${right}\n${players}`, foot, tiles,
  }, [tableBlock(T, cols, rows.map(r => ({ ...r, penalty_total: 0 })), W, { minW: 8.4 })], { maxCols: 1, minInner: 9.4 });
}

export function renderPosters(M, T, tier = "full") {
  const out = [
    { file: "1_leaderboard_gross.png", fig: grossLeaderboard(M, T, tier) },
    { file: "2_leaderboard_stableford.png", fig: stablefordLeaderboard(M, T, tier) },
  ];
  if (tier !== "basic") {  // how the holes played and the two-up sheet are what the full tier adds
    out.push({ file: "3_holes.png", fig: holesPoster(M, T) });
    out.push({ file: "4_leaderboard_both.png", fig: bothBoards(M, T) });
  }
  return out;
}
