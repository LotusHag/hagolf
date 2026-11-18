// Port of golf/posters.py: gross leaderboard, Stableford leaderboard, both boards on one sheet, how the
// holes played; plus season standings.
//
// Each of these is a header, a set of headline numbers and one or two blocks, handed to `sheet` (sheet.js).
// The theme family decides the page from there: how wide, whether the headline numbers sit in a row or up
// in the header band, and -- for the two-board sheet -- whether the boards
// stand side by side or one under the other. What a column contains and how a row is ranked never varies.
import { house, caps, note, posChip, outcomeBar, legend, on, rowBand, isPhone, brandTitle, brandDate } from "./draw.js";
import { sheet, block, blockAxes, heading, headingIn, dense } from "./sheet.js";
import { fmtToPar, fmtSigned, fmtHcp, fix, netBoard } from "./model.js";

const ROW_IN = 0.5;
const sum = xs => xs.reduce((a, b) => a + b, 0);

export function presentOutcomes(T, rows) {
  return T.OUTCOMES.filter((o, k) => rows.reduce((a, r) => a + r.counts[k], 0) > 0);
}

// ---------------------------------------------------------------- generic table
const col = (title, x0, x1, draw, ha = "center", legendItems = null) => ({ title, x0, x1, draw, ha, legend: legendItems });
const cx = c => c.ha === "left" ? c.x0 : c.ha === "right" ? c.x1 : (c.x0 + c.x1) / 2;

function dName(ax, c, y, r) {
  const T = ax.fig.T;
  if (isPhone(T)) return dNamePhone(ax, c, y, r);
  const w = ax.text(c.x0, y, r.name, { size: c.size || 15, family: "display", color: T.INK, va: "center" });
  if (r.penalty_total) {
    const x = c.x0 + w / ax.wIn * (ax.xlim[1] - ax.xlim[0]) + 0.15;
    ax.rbox(x, y - 0.14, 0.66, 0.28, T.BRONZE, 0.05);
    ax.text(x + 0.33, y, `pen +${r.penalty_total}`, { size: 7, family: "display", color: on(T, T.BRONZE), ha: "center", va: "center" });
  }
}
dName.isName = true;

// ---------------------------------------------------------------- the phone's own table
// A phone column is 4.9 inches, so a row there is often two lines: the name, its numbers, and under the name
// whatever the full sheet gave a column of its own. Sizes in points are what the reader sees (draw.js PHONE_W).
const PH = { name: 15, nameMin: 11, sub: 11.5, subMin: 11, key: 9, badge: 9 };
const LINE_2 = 1.1;   // how far down the row the second line sits, in row units

const badgeW = (ax, r) => r.penalty_total ? ax.textWidth(`pen +${r.penalty_total}`, PH.badge, "display") + ax.UX(0.2) : 0;

/** One size for a phone's name column, never under the floor, leaving room for a pen badge on the rows that carry one. */
const phoneNameSize = (ax, c, rows) =>
  Math.min(...rows.map(r => ax.fitSize([r.name], c.x1 - c.x0 - badgeW(ax, r), PH.name, PH.nameMin)));

// A name too long at the floor wraps where the row has room, and is cut short where figures sit under it.
function dNamePhone(ax, c, y, r) {
  const T = ax.fig.T, room = c.x1 - c.x0 - badgeW(ax, r);
  let s = r.name;
  if (ax.textWidth(s, c.size, "display") > room && !c.wrap) {
    while (s.length > 1 && ax.textWidth(s + "…", c.size, "display") > room) s = s.slice(0, -1);
    s = s.trimEnd() + "…";
  } else if (ax.textWidth(s, c.size, "display") > room) {
    const words = s.split(" ");
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
      const wid = Math.max(ax.textWidth(a, c.size, "display"), ax.textWidth(b, c.size, "display"));
      if (!best || wid < best[0]) best = [wid, `${a}\n${b}`];
    }
    if (best) s = best[1];
  }
  const w = ax.text(c.x0, y, s, { size: c.size, family: "display", color: T.INK, va: "center", lineSpacing: 1.15 });
  if (r.penalty_total) {
    const t = `pen +${r.penalty_total}`, bw = ax.textWidth(t, PH.badge, "display") + ax.UX(0.12);
    const x = c.x0 + ax.UX(w) + ax.UX(0.08), bh = ax.UY(0.2);
    ax.rbox(x, y - bh / 2, bw, bh, T.BRONZE, 0.05);
    ax.text(x + bw / 2, y, t, { size: PH.badge, family: "display", color: on(T, T.BRONZE), ha: "center", va: "center" });
  }
}

// Pieces of one line in several colours share a baseline: centring each on its own ink would lift "gross" over "51".
const baseline = (ax, y, size) => y + ax.down() * ax.UY(size / 72 * 0.36);
function run(ax, x, y, parts, size) {
  const b = baseline(ax, y, size);
  for (const [s, color] of parts) { ax.text(x, b, s, { size, color }); x += ax.textWidth(s, size); }
  return x;
}

/** A second line of small figures, label then value: "hcp 19  ·  gross 94". */
const dPairs = fn => (ax, c, y, r) => {
  const T = ax.fig.T, pairs = fn(r);
  const flat = pairs.map(([l, v]) => `${l} ${v}`).join("  ·  ");
  const size = ax.fig.fitOne(flat, Math.abs(ax.DX(c.x1 - c.x0)), PH.sub, PH.subMin);
  run(ax, c.x0, y, pairs.flatMap(([l, v], i) => [[`${i ? "  ·  " : ""}${l ? `${l} ` : ""}`, T.INK_3], [String(v), T.INK_2]]), size);
};

/** What a second-line chart means, set over the column heads: a colour key, or a line of text from the right. */
const phoneKey = (x0, items) => ax => {
  const wid = swatches(ax, 0, 0, items, false);
  swatches(ax, wid > ax.xlim[1] - x0 ? 0.15 : x0, 1.3, items);
};

/** A colour key in a row, each name on one shared baseline; returns how wide it is, drawn or not. */
function swatches(ax, x0, y, items, draw = true) {
  const T = ax.fig.T, sw = ax.UX(0.13), sh = ax.UY(0.13), gap = ax.UX(0.07), pad = ax.UX(0.2);
  let x = x0;
  for (const [name, colr] of items) {
    if (draw) ax.rbox(x, y - sh / 2, sw, sh, colr, 0.004);
    x = (draw ? run(ax, x + sw + gap, y, [[name, T.INK_3]], PH.key) : x + sw + gap + ax.textWidth(name, PH.key)) + pad;
  }
  return x - pad - x0;
}
const phoneNote = text => ax => ax.text(ax.xlim[1] - 0.1, 1.3, text, { size: PH.key, color: ax.fig.T.INK_3, ha: "right", va: "center" });

function drawTable(ax, cols, rows, W, { rowH = 1, key = null } = {}) {
  const T = ax.fig.T, ph = isPhone(T);
  for (const c of cols) {
    if (c.draw.isName) {
      const reserve = rows.some(r => r.penalty_total) ? 0.8 : 0;
      if (ph) [c.size, c.wrap] = [phoneNameSize(ax, c, rows), rowH === 1];
      else c.size = ax.fitSize(rows.map(r => r.name), c.x1 - c.x0 - reserve, 15);
    }
    if (c.line === 1) continue;   // a second-line column is explained by the key, not by a head of its own
    ax.text(cx(c), 0.55, caps(T, c.title), { size: 9, family: "display", color: T.INK_3, ha: c.ha, va: "center" });
    if (c.legend && house(T).legends) legend(ax, c.x0, 0.95, c.legend, 7, 0.16, 0.14, 0.1);
  }
  if (key) key(ax);
  ax.line(0, 0.1, W, 0.1, T.LINE, 0.8);
  rows.forEach((row, i) => {
    if (rowH === 1) {
      const y = -i - 0.5;
      rowBand(ax, 0, y - 0.46, W, 0.92, i);
      for (const c of cols) c.draw(ax, c, y, row);
      return;
    }
    const top = -i * rowH;
    rowBand(ax, 0, top - rowH + 0.04, W, rowH - 0.08, i);
    for (const c of cols) c.draw(ax, c, top - (c.line === 1 ? LINE_2 : c.line === "mid" ? rowH / 2 : 0.48), row);
  });
}

/** A leaderboard as a block: `W` is the column space the columns were laid out in, whatever inches it gets. */
function tableBlock(T, cols, rows, W, { title = "", tail = "", minW = 7.0, rowH = 1, head = 1.25, key = null } = {}) {
  const rowIn = ROW_IN * dense(T), headIn = rowIn * head;
  const hIn = rowIn * rowH * rows.length + headIn;
  return block("table", minW, () => hIn + (title ? headingIn : 0), (fig, x, top, w) => {
    if (title) heading(fig, x, top, w, title, note(T, tail));
    const ax = blockAxes(fig, x, top + (title ? headingIn : 0), w, hIn, [0, W], [-rows.length * rowH, head]);
    drawTable(ax, cols, rows, W, { rowH, key });
  });
}

// two-line rows on a phone, with a key line over the heads
const PHONE_ROWS = { rowH: 1.55, head: 1.75 };
const sub = c => ({ ...c, line: 1 });
const mid = c => ({ ...c, line: "mid" });

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

const dOutcomes = (n, h = 0.4, size = 8.5) => (ax, c, y, r) => outcomeBar(ax, c.x0, y - h / 2, c.x1 - c.x0, h, r.counts, n, 0.04, true, size);

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


// ---------------------------------------------------------------- posters
export function grossLeaderboard(M, T) {
  const rows = M.gross_board, n = M.n, N = M.field;
  const finished = rows.filter(p => p.gross !== null).map(p => p.gross);
  const W = 10;
  const [cols, opts] = isPhone(T) ? grossPhone(T, rows, n) : [[
    col("Pos", 0.15, 0.95, dPos("g")),
    col("Player", 1.15, 4.6, dName, "left"),
    col("Gross", 4.7, 5.6, dVal(r => r.gross === null ? "NR" : String(r.gross), 20, (r, T) => T.INK, "display")),
    col("To par", 5.7, 6.5, dVal(r => r.topar === null ? "–" : fmtToPar(r.topar), 14, (r, T) => toparColor(r.topar, T), "display")),
    col(`The round: ${n} holes by result`, 6.85, 9.95, dOutcomes(n), "left", presentOutcomes(T, rows)),
  ], {}];
  const avg = finished.length ? finished.reduce((a, b) => a + b, 0) / finished.length : null;
  return sheet(T, {
    title: brandTitle("gross", "Gross leaderboard"), kicker: M.name, sub: brandDate(M.sub),
    right: "Stroke play, no handicap",
    tiles: [[N, "in the field"], [finished.length ? Math.min(...finished) : "–", "best gross", T.ACCENT],
      [avg === null ? "–" : fix(avg), "average"], [n, "holes"]],
  }, [tableBlock(T, cols, rows, W, { minW: 8.4, ...opts })], { maxCols: 1, minInner: 9.4 });
}

/** The gross board on a phone: name, gross and to par on one line, the round's bar the width of the row under them. */
function grossPhone(T, rows, n) {
  const key = house(T).legends ? phoneKey(1.25, presentOutcomes(T, rows)) : null;
  return [[
    col("Pos", 0.15, 0.95, dPos("g")),
    col("Player", 1.25, 6.5, dName, "left"),
    mid(col("Gross", 6.75, 8.35, dVal(r => r.gross === null ? "NR" : String(r.gross), 26, (r, T) => T.INK, "display"))),
    mid(col("To par", 8.4, 9.9, dVal(r => r.topar === null ? "–" : fmtToPar(r.topar), 15, (r, T) => toparColor(r.topar, T), "display"))),
    sub(col("", 1.25, 6.5, dOutcomes(n, 0.42, 10.5))),
  ], { ...PHONE_ROWS, key, ...(key ? {} : { head: 1.25 }) }];
}

/** The Stableford board on a phone: net and points beside the name, the handicap, gross and meter under it. */
function stblPhone(T, scaleMax, level) {
  return [[
    col("Pos", 0.15, 0.95, dPos("s")),
    col("Player", 1.25, 6.05, dName, "left"),
    col("Net", 6.5, 7.9, dVal(r => r.net === null ? "NR" : String(r.net), 15, (r, T) => T.INK, "display")),
    col("Points", 8.0, 9.9, dVal(r => String(r.pts), 24, (r, T) => T.ACCENT, "display")),
    sub(col("", 1.25, 5.7, dPairs(r => [["hcp", fmtHcp(r.ph)], ["gross", r.gross === null ? "NR" : r.gross]]))),
    sub(col("", 6.1, 9.9, pointsMeter(scaleMax, level))),
  ], { ...PHONE_ROWS, key: phoneNote(`bar: points, 0 to ${scaleMax}, line at ${level}`) }];
}

export function stablefordLeaderboard(M, T) {
  const rows = M.stbl_board, n = M.n, N = M.field;
  const level = 2 * n, best = Math.max(...rows.map(p => p.pts));
  const scaleMax = Math.max(level + 6, 3 * Math.ceil((best + 2) / 3));
  const hcpTitle = M.allowance === 100 ? "Hcp" : `Hcp (${M.allowance}%)`;
  const W = 10;
  const [cols, opts] = isPhone(T) ? stblPhone(T, scaleMax, level) : [[
    col("Pos", 0.15, 0.95, dPos("s")),
    col("Player", 1.15, 4.3, dName, "left"),
    col(hcpTitle, 4.3, 5.0, dVal(r => fmtHcp(r.ph), 11, (r, T) => T.INK_3)),
    col("Gross", 5.1, 5.8, dVal(r => r.gross === null ? "NR" : String(r.gross), 12)),
    col("Net", 5.9, 6.6, dVal(r => r.net === null ? "NR" : String(r.net), 14, (r, T) => T.INK, "display")),
    col("Points", 6.75, 7.65, dVal(r => String(r.pts), 22, (r, T) => T.ACCENT, "display")),
    col(`Points, 0 to ${scaleMax}, line at ${level}`, 7.95, 9.95, pointsMeter(scaleMax, level), "left"),
  ], {}];
  const avg = rows.reduce((a, p) => a + p.pts, 0) / rows.length;
  const tees = [...new Set(rows.map(p => p.tee))].sort();
  const allowance = M.allowance === 100 ? "" : `, ${M.allowance}% allowance`;
  return sheet(T, {
    title: brandTitle("stbl", "Stableford leaderboard"), kicker: M.name, sub: brandDate(M.sub),
    right: `Net, course handicap${allowance}${tees.length > 1 ? `\nTees: ${tees.join(", ")}` : ""}`,
    tiles: [[N, "in the field"], [best, "best", T.ACCENT], [fix(avg), "average"], [level, "is level"]],
  }, [tableBlock(T, cols, rows, W, { minW: 8.4, ...opts })], { maxCols: 1, minInner: 9.4 });
}

/** A stroke-play card is settled on net, so its board is ranked on net, the way the card itself ranks it. */
export function netLeaderboard(M, T) {
  const rows = netBoard(M), n = M.n, N = M.field;
  const toPar = r => r.net === null ? null : r.net - sum(r.par);
  const finished = rows.filter(p => p.net !== null).map(p => p.net);
  const hcpTitle = M.allowance === 100 ? "Hcp" : `Hcp (${M.allowance}%)`;
  const W = 10;
  const [cols, opts] = isPhone(T) ? [[
    col("Pos", 0.15, 0.95, dPos("n")),
    col("Player", 1.25, 6.5, dName, "left"),
    mid(col("Net", 6.75, 8.35, dVal(r => r.net === null ? "NR" : String(r.net), 26, (r, T) => T.ACCENT, "display"))),
    mid(col("To par", 8.4, 9.9, dVal(r => toPar(r) === null ? "–" : fmtToPar(toPar(r)), 15, (r, T) => toparColor(toPar(r), T), "display"))),
    sub(col("", 1.25, 6.5, dPairs(r => [["hcp", fmtHcp(r.ph)], ["gross", r.gross === null ? "NR" : r.gross]]))),
  ], { ...PHONE_ROWS, head: 1.25 }] : [[
    col("Pos", 0.15, 0.95, dPos("n")),
    col("Player", 1.15, 5.0, dName, "left"),
    col(hcpTitle, 5.0, 5.9, dVal(r => fmtHcp(r.ph), 11, (r, T) => T.INK_3)),
    col("Gross", 6.0, 6.9, dVal(r => r.gross === null ? "NR" : String(r.gross), 12)),
    col("Net", 7.0, 8.3, dVal(r => r.net === null ? "NR" : String(r.net), 22, (r, T) => T.ACCENT, "display")),
    col("To par", 8.4, 9.9, dVal(r => toPar(r) === null ? "–" : fmtToPar(toPar(r)), 14, (r, T) => toparColor(toPar(r), T), "display")),
  ], {}];
  const avg = finished.length ? finished.reduce((a, b) => a + b, 0) / finished.length : null;
  const tees = [...new Set(rows.map(p => p.tee))].sort();
  const allowance = M.allowance === 100 ? "" : `, ${M.allowance}% allowance`;
  return sheet(T, {
    title: brandTitle("net", "Net leaderboard"), kicker: M.name, sub: brandDate(M.sub),
    right: `Net, course handicap${allowance}${tees.length > 1 ? `\nTees: ${tees.join(", ")}` : ""}`,
    tiles: [[N, "in the field"], [finished.length ? Math.min(...finished) : "–", "best net", T.ACCENT],
      [avg === null ? "–" : fix(avg), "average"], [n, "holes"]],
  }, [tableBlock(T, cols, rows, W, { minW: 8.4, ...opts })], { maxCols: 1, minInner: 9.4 });
}

const firstOf = s => String(s || "").trim().split(/\s+/)[0];
const sideShort = names => names.map(firstOf).join(" & ");
/** A match in one line, the way it would be read out: "Isabel & Daan win 6&5", or how it stands. */
const matchHeadline = m => !m.result ? `${m.leader ? `${sideShort(m.sides[m.leader])} ${Math.abs(m.up)} up` : "All square"}, thru ${m.thru}`
  : !m.leader ? "Halved" : `${sideShort(m.sides[m.leader])} ${m.sides[m.leader].length > 1 || / & /.test(m.sides[m.leader][0]) ? "win" : "wins"} ${m.margin}`;

/**
 * A match card: the result as the headline, then each side's score hole by hole with the holes it won filled
 * in its colour, and under them how the match stood. Holes after the match was decided are drawn faint.
 */
function matchBlock(T, m, n, title) {
  const ph = isPhone(T), per = ph && n > 9 ? 9 : n, bands = Math.ceil(n / per);
  const HEAD = 0.62, NAMES = 0.27, ROW = { hole: 0.34, side: 0.44, state: 0.34 }, BAND = ROW.hole + 2 * ROW.side + ROW.state, GAPB = 0.22;
  const hIn = (title ? headingIn : 0) + HEAD + 2 * NAMES + 0.12 + bands * BAND + (bands - 1) * GAPB;
  return block("chart", 0, () => hIn, (fig, x, top, w) => {
    let y = top;
    if (title) { heading(fig, x, y, w, title, ""); y += headingIn; }
    const colr = { A: T.ACCENT, B: T.BAR };
    fig.fitText(x, y + HEAD / 2, matchHeadline(m), w, 24, 13, { family: "display", color: T.INK, va: "center" });
    y += HEAD;
    for (const k of ["A", "B"]) {
      fig.rbox(x, y + NAMES / 2 - 0.07, 0.14, 0.14, colr[k], 0.02);
      fig.fitText(x + 0.24, y + NAMES / 2, m.sides[k].join(" & "), w - 0.24, 11, 8.5, { color: T.INK_2, va: "center" });
      y += NAMES;
    }
    y += 0.12;
    const labW = ph ? 1.05 : 2.1, cw = (w - labW) / per;
    let up = 0;
    const state = m.holes.map(hh => { if (hh.counted) up += hh.winner === "A" ? 1 : hh.winner === "B" ? -1 : 0; return hh.counted ? up : null; });
    for (let b = 0; b < bands; b++) {
      const h0 = b * per, h1 = Math.min(n, h0 + per), yb = y + b * (BAND + GAPB);
      const yA = yb + ROW.hole, yB = yA + ROW.side, yS = yB + ROW.side;
      fig.text(x, yb + ROW.hole / 2, caps(T, "Hole"), { size: 9, family: "display", color: T.INK_3, va: "center" });
      for (const k of ["A", "B"]) fig.fitText(x, (k === "A" ? yA : yB) + ROW.side / 2, sideShort(m.sides[k]), labW - 0.12, 12, 8.5, { family: "display", color: T.INK, va: "center" });
      fig.text(x, yS + ROW.state / 2, caps(T, "Match"), { size: 9, family: "display", color: T.INK_3, va: "center" });
      fig.line(x, yA, x + w, yA, T.LINE, 0.8);
      fig.line(x, yS, x + w, yS, T.LINE, 0.8);
      for (let h = h0; h < h1; h++) {
        const hh = m.holes[h], cx0 = x + labW + (h - h0) * cw, mid = cx0 + cw / 2;
        fig.text(mid, yb + ROW.hole / 2, String(h + 1), { size: 10, family: "display", color: T.INK_2, ha: "center", va: "center" });
        for (const k of ["A", "B"]) {
          const v = hh[k], cy = (k === "A" ? yA : yB), won = hh.counted && hh.winner === k;
          if (won) fig.rbox(cx0 + cw * 0.12, cy + ROW.side * 0.12, cw * 0.76, ROW.side * 0.76, colr[k], 0.04);
          fig.text(mid, cy + ROW.side / 2, v === null ? "–" : String(v), { size: 13, family: "display",
            color: won ? on(T, colr[k]) : hh.counted ? T.INK : T.INK_3, ha: "center", va: "center" });
        }
        const s = state[h];
        if (s !== null) fig.text(mid, yS + ROW.state / 2, s === 0 ? "AS" : String(Math.abs(s)), { size: 10, family: "display",
          color: s === 0 ? T.INK_3 : s > 0 ? colr.A : colr.B, ha: "center", va: "center" });
      }
    }
  });
}

export function matchPoster(M, T) {
  const ms = M.matches || [];
  if (!ms.length) throw new Error("There is no match on this card.");
  const pts = ms[0].basis === "points";
  return sheet(T, {
    title: brandTitle("match", ms.length > 1 ? "The matches" : "The match"), kicker: M.name, sub: brandDate(M.sub),
    right: `Match play, no handicap\n${pts ? "Stableford points a hole" : "Strokes taken a hole"}`, tiles: null,
  }, ms.map(m => matchBlock(T, m, M.n, ms.length > 1 ? `Group ${m.group}` : "")), { maxCols: 1, minInner: M.n <= 9 ? 8.4 : 9.4 });
}

/**
 * A society's day: the field in the society's own currency, then what the day did to the table. `D` is plain
 * data, so the screen decides who counts and how the day is settled: { title, kicker, sub, right, unit, rows:
 * [{ place, name, value, sub }], moved: [{ name, from, to }], matches: [line], table }.
 */
export function dayPoster(D, T) {
  const W = 10, rows = D.rows.map(r => ({ ...r, penalty_total: 0 }));
  const cols = isPhone(T) ? [
    col("Pos", 0.15, 0.95, dPos("")),
    col("Player", 1.25, 7.4, dName, "left"),
    mid(col(D.unit, 7.6, 9.9, dVal(r => r.value, 24, (r, T) => T.ACCENT, "display"))),
    sub(col("", 1.25, 7.4, dPairs(r => [["", r.sub]]))),
  ] : [
    col("Pos", 0.15, 0.95, dPos("")),
    col("Player", 1.15, 4.9, dName, "left"),
    col("", 5.0, 8.2, (ax, c, y, r) => ax.fitText(c.x0, y, r.sub, c.x1 - c.x0, { size: 11, color: ax.fig.T.INK_2, va: "center", min: 8 }), "left"),
    col(D.unit, 8.3, 9.9, dVal(r => r.value, 22, (r, T) => T.ACCENT, "display")),
  ];
  const blocks = rows.length ? [tableBlock(T, cols, rows, W, { minW: 8.4, ...(isPhone(T) ? { ...PHONE_ROWS, head: 1.25 } : {}) })] : [];
  if (D.matches && D.matches.length) {
    const lines = D.matches;
    blocks.push(block("note", 0, () => headingIn + lines.length * 0.34, (fig, x, top, w) => {
      heading(fig, x, top, w, "Match play", "");
      lines.forEach((s, i) => fig.fitText(x, top + headingIn + (i + 0.5) * 0.34, s, w, 12, 9, { color: T.INK, va: "center" }));
    }));
  }
  if (D.moved && D.moved.length) {
    const mv = D.moved.map(r => ({ ...r, penalty_total: 0, d: r.from - r.to }));
    const mcols = [
      col("Player", 0.15, isPhone(T) ? 6.2 : 5.4, dName, "left"),
      col("Before, after", isPhone(T) ? 6.2 : 5.5, 8.4, dVal(r => `${ordinalOf(r.from)} to ${ordinalOf(r.to)}`, 12, (r, T) => T.INK_2)),
      col("", 8.5, 9.9, dVal(r => `${r.d > 0 ? "▲" : "▼"}${Math.abs(r.d)}`, 15, (r, T) => r.d > 0 ? T.UNDER : T.INK_3, "display")),
    ];
    blocks.push(tableBlock(T, mcols, mv, W, { title: "What it changed", tail: note(T, D.table || ""), minW: 8.4 }));
  }
  return sheet(T, { title: D.title, kicker: D.kicker, sub: D.sub, right: D.right, tiles: null }, blocks, { maxCols: 1, minInner: 9.4 });
}
const ordinalOf = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

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
  const [gc, go] = isPhone(T) ? grossPhone(T, gRows, n) : [grossCols, {}];
  const [sc, so] = isPhone(T) ? stblPhone(T, scaleMax, level) : [stblCols, {}];
  const finished = gRows.filter(p => p.gross !== null).map(p => p.gross);
  const tees = [...new Set(sRows.map(p => p.tee))].sort();
  const allowance = M.allowance === 100 ? "" : `, ${M.allowance}% allowance`;
  return sheet(T, {
    title: brandTitle("both", "Both boards"), kicker: M.name, sub: brandDate(M.sub),
    right: `Stroke play and net Stableford${tees.length > 1 ? `\nTees: ${tees.join(", ")}` : ""}`,
    tiles: [[N, "in the field"], [finished.length ? Math.min(...finished) : "–", "best gross"], [bestPts, "best points", T.ACCENT]],
    tilesWide: true,
  }, [
    tableBlock(T, gc, gRows, W, { title: "Gross", tail: "stroke play, no handicap", minW: 5.9, ...go }),
    tableBlock(T, sc, sRows, W, { title: "Stableford", tail: `net, course handicap${allowance}`, minW: 5.9, ...so }),
  ], { minCols: 2 });
}

/**
 * How the holes played. The three panels share one x axis -- the hole number -- so they are one block and
 * never split across columns; what the theme changes here is the paper, the headline numbers and the
 * words. The width comes from the hole count, as it always has.
 */
export function holesPoster(M, T) {
  const holes = M.holes, n = M.n, N = M.field;
  const finished = M.players.filter(p => p.gross !== null);
  const avgGross = finished.length ? finished.reduce((a, p) => a + p.gross, 0) / finished.length : null;
  const hardest = holes.reduce((a, h) => h.difficulty < a.difficulty ? h : a);
  const easiest = holes.reduce((a, h) => h.difficulty > a.difficulty ? h : a);
  const fieldAvg = holes.reduce((a, h) => a + h.vspar, 0) / n;
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
      ax.text(h.hole, 0.3, M.course.unlisted ? `par ${h.par}` : `par ${h.par}  ·  SI ${h.si}`, { size: 9, color: T.INK_2, ha: "center", va: "center" });
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

  return sheet(T, {
    title: brandTitle("holes", "How the holes played"), kicker: M.name, sub: brandDate(M.sub),
    right: `Field ${N} players`,
    tiles: [[N, "in the field"], [avgGross === null ? "–" : fix(avgGross), "course average"],
      [fmtSigned(fieldAvg, 2), "a hole against par", T.ACCENT],
      [hardest.label, "hardest hole"], [easiest.label, "easiest hole"]],
  }, isPhone(T) ? holesPhone(M, T, fieldAvg, hardest, easiest) : [chart], { maxCols: 1, minInner: inner });
}

// Nine holes is all a phone sets legibly, so eighteen come as front over back, on one shared scale.
function holesPhone(M, T, fieldAvg, hardest, easiest) {
  const holes = M.holes, d = dense(T), two = M.n > 9;
  const nines = two ? [holes.slice(0, 9), holes.slice(9)] : [holes];
  const hi = Math.max(Math.max(...holes.map(h => h.vspar)), 0.5);
  const low = Math.min(Math.min(...holes.map(h => h.vspar)), 0);
  const LAB = M.course.unlisted ? 0.95 : 1.2, BARS = 1.9 * d, STACK = 2.2 * d, NOTE = 0.27;
  const avgNote = note(T, `dashed line: course average ${fmtSigned(fieldAvg, 2)} a hole`);
  const items = presentOutcomes(T, holes), keyed = house(T).legends;
  const plan = first => {
    let y = two ? headingIn + 0.04 : 0;
    const at = {}, mark = (k, h) => { at[k] = y; y += h; };
    mark("labels", LAB + 0.1);
    mark("h1", headingIn);
    if (first && avgNote) mark("note", NOTE);
    mark("bars", BARS + 0.3);
    mark("h2", headingIn);
    if (first && keyed) mark("key", NOTE);
    mark("stack", STACK);
    return [at, y];
  };
  return nines.map((nine, k) => block("chart", 0, () => plan(k === 0)[1], (fig, x, top, w) => {
    const [at] = plan(k === 0);
    const lo = nine[0].hole - 0.5, xlim = [lo, lo + 9], bw = 0.6;
    const panel = (key, h, ylim) => blockAxes(fig, x, top + at[key], w, h, xlim, ylim);
    if (two) heading(fig, x, top, w, k ? "Back nine" : "Front nine", note(T, `holes ${nine[0].label} to ${nine[nine.length - 1].label}`));

    let ax = panel("labels", LAB, [LAB, 0]);   // y in inches down the band
    for (const h of nine) {
      ax.text(h.hole, 0.24, h.label, { size: 22, family: "display", color: T.INK, ha: "center", va: "center" });
      ax.text(h.hole, 0.58, `par ${h.par}`, { size: 10, color: T.INK_2, ha: "center", va: "center" });
      if (!M.course.unlisted) ax.text(h.hole, 0.79, `SI ${h.si}`, { size: 9, color: T.INK_3, ha: "center", va: "center" });
      if (h.metres) ax.text(h.hole, M.course.unlisted ? 0.79 : 0.99, `${h.metres} m`, { size: 9, color: T.INK_3, ha: "center", va: "center" });
    }
    ax.line(xlim[0], LAB, xlim[1], LAB, T.LINE, 0.8);

    heading(fig, x, top + at.h1, w, "Average score against par", "");
    if (at.note !== undefined) fig.text(x, top + at.note + NOTE / 2, avgNote, { size: 9, color: T.INK_3, va: "center" });
    ax = panel("bars", BARS, [low * 1.4 - hi * 0.1, hi * 1.3]);
    ax.line(xlim[0], fieldAvg, xlim[1], fieldAvg, T.INK_3, 0.8, [4, 3]);
    for (const h of nine) {
      const v = h.vspar;
      ax.rbox(h.hole - bw / 2, Math.min(0, v), bw, Math.abs(v), T.BAR, 0.04);
      const ty = v + (v >= 0 ? hi * 0.03 : -hi * 0.03), txt = fmtSigned(v, 2);
      const tw = ax.textWidth(txt, 11, "display"), th = ax.UY(11 / 72);
      ax.rbox(h.hole - tw / 2 - 0.06, (v >= 0 ? ty : ty - th) - hi * 0.015, tw + 0.12, th + hi * 0.03, T.BG, 0);
      ax.text(h.hole, ty, txt, { size: 11, family: "display", color: T.INK, ha: "center", va: v >= 0 ? "bottom" : "top" });
      const word = h === hardest ? "hardest" : h === easiest ? "easiest" : "";
      if (word) ax.text(h.hole, ax.ylim[0] - ax.UY(0.04), word, { size: 9, color: T.INK_2, ha: "center", va: "top" });
    }
    ax.line(xlim[0], 0, xlim[1], 0, T.LINE, 0.8);

    heading(fig, x, top + at.h2, w, "What the field scored", "");
    if (at.key !== undefined) swatches(blockAxes(fig, x, top + at.key, w, NOTE, [0, w], [0, 1]), 0, 0.5, items);
    ax = panel("stack", STACK, [-0.16, 1.04]);
    for (const h of nine) {
      if (!h.n) continue;
      let y = 0;
      for (let j = 3; j >= 0; j--) {
        const c = h.counts[j], colr = T.OUTCOMES[j][1];
        if (c === 0) continue;
        const seg = c / h.n;
        ax.rbox(h.hole - bw / 2, y + 0.008, bw, seg - 0.016, colr, 0.02);
        if (ax.DY(seg) > 0.13) ax.text(h.hole, y + seg / 2, String(c), { size: 10, family: "display", color: on(T, colr), ha: "center", va: "center" });
        y += seg;
      }
      ax.text(h.hole, -0.04, `avg ${fix(h.avg)}`, { size: 9, color: T.INK_3, ha: "center", va: "top" });
    }
    ax.line(xlim[0], 0, xlim[1], 0, T.LINE, 0.8);
  }));
}

const dayMonth = d => { const t = new Date(`${d}T12:00:00`); return isNaN(t) ? d : t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
/** "10 May to 21 Jun 2026", or "21 Jun 2026" for one day: dates as people write them, not as a database does. */
function dateSpan(dates) {
  if (!dates.length) return "";
  const a = dates[0], b = dates[dates.length - 1], year = String(b).slice(0, 4);
  if (a === b) return `${dayMonth(a)} ${year}`;
  return `${dayMonth(a)}${String(a).slice(0, 4) === year ? "" : ` ${String(a).slice(0, 4)}`} to ${dayMonth(b)} ${year}`;
}

/** Season standings for a group: `S` from model.standings, `group` the group record. */
export const STANDINGS_TITLES = {
  stableford: "Season standings", stroke: "Stroke play standings", match: "Matchplay standings",
  matchpts: "Matchplay standings, Stableford", soccer: "League table", soccerpts: "League table, Stableford",
  gp: "Grand Prix standings", gpstroke: "Grand Prix standings, stroke play",
  elo: "Elo ratings", elopts: "Elo ratings, Stableford", elostroke: "Elo ratings, stroke play", elomatch: "Elo ratings, matchplay",
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
  const span = dateSpan(dates);
  const sub = [`${rounds.length} round${rounds.length === 1 ? "" : "s"}`, span].filter(Boolean).join("  ·  ");
  const pos = col("Pos", 0.15, 0.95, (ax, c, y, r) => posChip(ax, cx(c), y, r.place, 0.8, 12));
  const num = (title, x0, x1, fn) => col(title, x0, x1, dVal(fn, 12, (r, T) => T.INK_2));
  const players = `${rows.length} player${rows.length === 1 ? "" : "s"}`;
  let cols, right, tiles, total, pairs;

  if (kind === "stroke") {
    const lead = rows.length ? rows[0].counted : 0;
    cols = [pos, col("Player", 1.15, 4.6, dName, "left"),
      num("Rounds", 4.6, 5.4, r => String(r.played)), num("Wins", 5.5, 6.2, r => String(r.wins)),
      num("Best", 6.3, 7.1, r => r.best === null ? "–" : fmtToPar(r.best)),
      num("Avg", 7.2, 8.1, r => r.played ? fmtToPar(Math.round(r.avg * 10) / 10) : "–"),
      col(S.bestN > 0 ? `Best ${S.bestN}` : "Net to par", 8.2, 9.95, dVal(r => r.played ? fmtToPar(r.counted) : "–", 22, (r, T) => T.ACCENT, "display"))];
    total = [S.bestN > 0 ? `Best ${S.bestN}` : "Net to par", r => r.played ? fmtToPar(r.counted) : "–"];
    pairs = r => [["rounds", r.played], ["wins", r.wins], ["best", r.best === null ? "–" : fmtToPar(r.best)],
      ["avg", r.played ? fmtToPar(Math.round(r.avg * 10) / 10) : "–"]];
    right = "Net strokes against par";
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [fmtToPar(lead), "the leader", T.ACCENT]];
  } else if (kind.startsWith("match") || kind.startsWith("soccer")) {
    const maxPts = Math.max(1, ...rows.map(r => r.points));
    const scaleMax = 5 * Math.ceil((maxPts + 1) / 5);
    const w = S.win ?? (kind.startsWith("soccer") ? 3 : 2), d = S.draw ?? 1;
    cols = [pos, col("Player", 1.15, 4.2, dName, "left"),
      num("P", 4.2, 4.8, r => String(r.played)), num("W", 4.9, 5.5, r => String(r.won)),
      num("D", 5.6, 6.2, r => String(r.drawn)), num("L", 6.3, 6.9, r => String(r.lost)),
      num("Holes up", 7.0, 7.85, r => (r.up > 0 ? "+" : "") + r.up),
      col("Pts", 7.95, 8.7, dVal(r => String(r.points), 22, (r, T) => T.ACCENT, "display")),
      col(`Points, 0 to ${scaleMax}`, 8.9, 9.95, pointsMeter(scaleMax, null, "points"), "left")];
    right = `${w} points a win, ${d} a draw\n${S.basis === "points" ? "Stableford" : "strokes taken"}`;
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [maxPts, "the leader", T.ACCENT]];
  } else if (kind.startsWith("elo")) {
    const elo = r => String(Math.round(r.score));
    const moved = r => r.last === null ? "–" : (Math.round(r.last) > 0 ? "+" : "") + Math.round(r.last);
    const lead = rows.length ? elo(rows[0]) : "0";
    const how = { all: "Stableford, net and the match, averaged", points: "Stableford points", net: "net score", match: "a match on strokes taken" }[S.basis];
    cols = [pos, col("Player", 1.15, 4.1, dName, "left"),
      num("Days", 4.1, 4.8, r => String(r.played)), num("W", 4.9, 5.4, r => String(r.won)),
      num("D", 5.5, 6.0, r => String(r.drawn)), num("L", 6.1, 6.6, r => String(r.lost)),
      num("Peak", 6.7, 7.5, r => String(Math.round(r.peak))), num("Last", 7.6, 8.3, moved),
      col("Pts", 8.4, 9.95, dVal(elo, 22, (r, T) => T.ACCENT, "display"))];
    total = ["Pts", elo];
    pairs = r => [["days", r.played], ["", `${r.won}–${r.drawn}–${r.lost}`], ["peak", Math.round(r.peak)], ["last", moved(r)]];
    right = `Elo rating
${how}`;
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [lead, "the leader", T.ACCENT]];
  } else if (kind === "gp" || kind === "gpstroke") {
    const net = S.basis === "net";
    const maxPts = Math.max(1, ...rows.map(r => r.counted));
    const scaleMax = 25 * Math.ceil((maxPts + 1) / 25);
    cols = [pos, col("Player", 1.15, 4.1, dName, "left"),
      num("Rounds", 4.1, 4.9, r => String(r.played)), num("Wins", 5.0, 5.6, r => String(r.wins)),
      num("Best", 5.7, 6.3, r => String(r.best)), num("Avg", 6.4, 7.0, r => fix(r.avg)),
      col(S.bestN > 0 ? `Best ${S.bestN}` : "Points", 7.1, 7.9, dVal(r => String(r.counted), 22, (r, T) => T.ACCENT, "display")),
      col(`Points, 0 to ${scaleMax}`, 8.15, 9.95, pointsMeter(scaleMax, null, "counted"), "left")];
    total = [S.bestN > 0 ? `Best ${S.bestN}` : "Points", r => String(r.counted)];
    pairs = r => [["rounds", r.played], ["wins", r.wins], ["best", r.best], ["avg", fix(r.avg)]];
    right = `Points by finishing position\n${net ? "net against par" : "Stableford"}`;
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [maxPts, "the leader", T.ACCENT]];
  } else {
    const maxPts = Math.max(1, ...rows.map(r => r.counted));
    const scaleMax = 10 * Math.ceil((maxPts + 1) / 10);
    cols = [pos, col("Player", 1.15, 4.1, dName, "left"),
      num("Rounds", 4.1, 4.9, r => String(r.played)), num("Wins", 5.0, 5.6, r => String(r.wins)),
      num("Best", 5.7, 6.3, r => String(r.best)), num("Avg", 6.4, 7.0, r => fix(r.avg)),
      col(S.bestN > 0 ? `Best ${S.bestN}` : "Points", 7.1, 7.9, dVal(r => String(r.counted), 22, (r, T) => T.ACCENT, "display")),
      col(`Points, 0 to ${scaleMax}`, 8.15, 9.95, pointsMeter(scaleMax, null, "counted"), "left")];
    total = [S.bestN > 0 ? `Best ${S.bestN}` : "Points", r => String(r.counted)];
    pairs = r => [["rounds", r.played], ["wins", r.wins], ["best", r.best], ["avg", fix(r.avg)]];
    right = "Stableford points across rounds";
    tiles = [[rows.length, "players"], [rounds.length, "rounds"], [maxPts, "the leader", T.ACCENT]];
  }
  const [tc, to] = isPhone(T) ? standingsPhone(kind, total, pairs) : [cols, {}];
  return sheet(T, {
    title: brandTitle("standings", STANDINGS_TITLES[kind] || STANDINGS_TITLES.stableford), kicker: group.name, sub,
    right: `${right}\n${players}`, tiles,
  }, [tableBlock(T, tc, rows.map(r => ({ ...r, penalty_total: 0 })), W, { minW: 8.4, ...to })], { maxCols: 1, minInner: 9.4 });
}

// A match table keeps P W D L and drops the meter; every other kind puts its figures on a line under the name.
function standingsPhone(kind, total, pairs) {
  const pos = col("Pos", 0.15, 0.95, (ax, c, y, r) => posChip(ax, cx(c), y, r.place, 0.8, 12));
  if (kind.startsWith("match") || kind.startsWith("soccer")) {
    const num = (title, x0, x1, fn) => col(title, x0, x1, dVal(fn, 12.5, (r, T) => T.INK_2));
    return [[pos, col("Player", 1.15, 4.8, dName, "left"),
      num("P", 4.8, 5.55, r => String(r.played)), num("W", 5.55, 6.3, r => String(r.won)),
      num("D", 6.3, 7.05, r => String(r.drawn)), num("L", 7.05, 7.8, r => String(r.lost)),
      num("Up", 7.8, 8.8, r => (r.up > 0 ? "+" : "") + r.up),
      col("Pts", 8.8, 9.9, dVal(r => String(r.points), 22, (r, T) => T.ACCENT, "display"))], {}];
  }
  return [[pos, col("Player", 1.25, 7.6, dName, "left"),
    mid(col(total[0], 7.8, 9.9, dVal(total[1], 26, (r, T) => T.ACCENT, "display"))),
    sub(col("", 1.25, 7.6, dPairs(pairs)))], { rowH: PHONE_ROWS.rowH }];
}

export function renderPosters(M, T) {
  return [
    { file: "1_leaderboard_gross.png", fig: grossLeaderboard(M, T) },
    { file: "2_leaderboard_stableford.png", fig: stablefordLeaderboard(M, T) },
    { file: "3_holes.png", fig: holesPoster(M, T) },
    { file: "4_leaderboard_both.png", fig: bothBoards(M, T) },
  ];
}
