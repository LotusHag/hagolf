// Posters for a league's statistics: the field, the nines, one player, and what the cards keep beyond the
// strokes. App-only, so there is no Python twin.
//
// Every panel here is a BLOCK (sheet.js): a height and a draw call, with no opinion about where on the page
// it lands. `sheet` puts them somewhere according to the theme family's template, which is why the same
// four posters come out as a narrow sheet of paper for one collection and a two-column landscape for
// another. A block only has to survive being handed a narrower column than it expected, or declare the
// narrowest one it can take and be given a full-width row instead.
import { house, caps, note, outcomeBar, legend, rowBand, seriesColor, isPhone } from "./draw.js";
import { sheet, block, blockAxes, heading, headingIn, dense, panel, bandRows, bigIn, barSpan } from "./sheet.js";
import { fmtToPar, fmtSigned, fix, statReadings, statPairs, leagueProgress, STRIP_KEYS, RATE_MIN } from "./model.js";

/** The screen's six buckets folded onto the four the poster palette names. */
export function four(counts) {
  return [counts[0] + counts[1], counts[2], counts[3], counts[4] + counts[5]];
}

const sumc = cs => cs.reduce((a, b) => a + b, 0);
const share = (v, t) => t ? Math.round((v / t) * 100) : 0;
const parOrBetter = c => c[0] + c[1] + c[2];
const present = (T, counts) => T.OUTCOMES.filter((o, k) => counts[k] > 0);
const legends = T => house(T).legends;

const shortDate = d => {
  const t = d ? new Date(d + "T12:00:00") : null;
  return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : (d || "");
};

const dateSpan = rounds => {
  const ds = rounds.map(r => r.date).filter(Boolean).sort();
  if (!ds.length) return "";
  return ds[0] === ds[ds.length - 1] ? shortDate(ds[0]) : `${shortDate(ds[0])} to ${shortDate(ds[ds.length - 1])}`;
};

// ---------------------------------------------------------------- the phone
// The phone sheet is one 5.4in column read at arm's length, so a point is what the reader sees: blocks that
// would shrink a word below 9pt there lay themselves out again instead, behind isPhone, and the full sheets
// never take these branches.
const NOTE_IN = 0.24;
const noteUnder = (probe, w, title, noteText) => isPhone(probe.T) && !!noteText &&
  probe.measure(caps(probe.T, title), 12, "display") + probe.measure(noteText, 9) + 0.4 > w;

/** The heading's height: on a phone a note that would run into the title drops to a line of its own. */
const headIn = (probe, w, title, noteText) => headingIn + (noteUnder(probe, w, title, noteText) ? NOTE_IN : 0);

function head(fig, x, top, w, title, noteText) {
  if (!noteUnder(fig, w, title, noteText)) return heading(fig, x, top, w, title, noteText);
  heading(fig, x, top, w, title, "");
  fig.fitText(x, top + headingIn - 0.01, noteText, w, 9.5, 9, { color: fig.T.INK_3, va: "top" });
  return headingIn + NOTE_IN;
}

/** How many of `n` columns `w` inches carries at `need` each, evened out over the lines it takes. */
function perLine(n, w, need) {
  const lines = Math.ceil(n / Math.max(1, Math.min(n, Math.floor(w / need))));
  return { lines, per: Math.ceil(n / lines) };
}

// Each name on its own line with its cells under it, wrapping rather than shrinking; `cell(row, k)` is { big, sub, hot } or null.
function phoneGrid(T, { title, tail = "", heads, rows, names, cell }) {
  const d = dense(T), HEAD = 0.32, NAME = 0.38 * d, CELL = 0.62 * d, CAP = 0.2;
  const cells = rows.flatMap(r => heads.map((_, k) => cell(r, k)).filter(Boolean));
  const fit = (probe, w) => {
    // measured at the smallest each line may be fitted down to, so a wide face wraps only when it must
    const need = Math.max(0.8, ...heads.map(h => probe.measure(caps(T, h), 9, "display")),
      ...cells.map(c => Math.max(probe.measure(c.big, 15, "display"), probe.measure(c.sub, 9)))) + 0.1;
    return perLine(heads.length, w, need);
  };
  // once the cells wrap, a column head over the table no longer says which cell is which, so each cell carries its own
  const cellIn = lines => lines > 1 ? CELL + CAP : CELL;
  const bodyIn = lines => (lines > 1 ? 0 : HEAD) + 0.1 + rows.length * (NAME + lines * cellIn(lines));
  return block("table", 0, (w, probe) => headIn(probe, w, title, tail) + bodyIn(fit(probe, w).lines), (fig, x, top, w) => {
    const y0 = top + head(fig, x, top, w, title, tail);
    const { lines, per } = fit(fig, w), colW = w / per, wrap = lines > 1, cIn = cellIn(lines);
    const colOf = k => x + colW * (k % per + 0.5);
    const capOf = (k, y) => fig.fitText(colOf(k), y, caps(T, heads[k]), colW - 0.08, wrap ? 9 : 10, 9,
      { family: "display", color: T.INK_3, ha: "center", va: "center" });
    if (!wrap) heads.forEach((_, k) => capOf(k, y0 + HEAD / 2));
    const y1 = y0 + (wrap ? 0 : HEAD) + 0.05, rowH = NAME + lines * cIn;
    if (!wrap) fig.line(x, y1, x + w, y1, T.LINE, 0.8);
    const ax = blockAxes(fig, x, y1 + 0.05, w, rows.length * rowH, [0, w], [-rows.length * rowH, 0]);
    const size = fig.fitSize(names, w - 0.2, 14, 11);
    rows.forEach((r, i) => {
      const ry = y1 + 0.05 + i * rowH;
      rowBand(ax, 0, -(i + 1) * rowH + 0.03, w, rowH - 0.06, i, 0.06);
      fig.text(x + 0.1, ry + NAME * 0.58, names[i], { size, family: "display", color: T.INK, va: "center" });
      heads.forEach((_, k) => {
        const cx = colOf(k), c = cell(r, k);
        let cy = ry + NAME + cIn * Math.floor(k / per);
        if (wrap) { capOf(k, cy + CAP * 0.6); cy += CAP; }
        if (!c) return void fig.text(cx, cy + CELL * 0.42, "–", { size: 12, color: T.INK_3, ha: "center", va: "center" });
        fig.text(cx, cy + CELL * 0.36, c.big, { size: 15, family: "display", color: c.hot ? T.ACCENT : T.INK, ha: "center", va: "center" });
        fig.fitText(cx, cy + CELL * 0.76, c.sub, colW - 0.04, 9.5, 9, { color: T.INK_3, ha: "center", va: "center" });
      });
    });
  });
}

// ---------------------------------------------------------------- the blocks
/** One stacked bar of every hole walked, with the four outcomes named beside it. */
function distributionBlock(T, counts, label) {
  const c4 = four(counts), total = sumc(c4), d = dense(T), ph = isPhone(T);
  const hIn = (ph ? 1.12 : 0.95) * d, shareSize = ph ? 10 : 9;
  return block("chart", 2.8, () => hIn + headingIn, (fig, x, top, w, extra = 0) => {
    heading(fig, x, top, w, label, "");
    const y = top + headingIn;
    const ax = blockAxes(fig, x, y, w, hIn + extra, [0, w], [0, 1]);
    if (legends(T)) {
      if (ph) legend(ax, 0, 0.9, present(T, c4), 10, 0.1, 0.09, 0.16);
      else legend(ax, 0, 0.92, present(T, c4), 8.5, 0.09, 0.09, 0.12);
    }
    outcomeBar(ax, 0, 0.24, w, ph ? 0.4 : 0.42, c4, total, 0.03, true, ph ? 12 : 11);
    T.OUTCOMES.forEach((o, k) => {
      if (!c4[k]) return;
      const seg = c4[k] / total * w;
      const cx = (c4.slice(0, k).reduce((a, b) => a + b, 0) + c4[k] / 2) / total * w;
      // a share under a sliver lands on top of its neighbour's, and two percentages in one place are worse
      // than one missing: the segment is still counted inside the bar and named in the key
      if (seg >= ax.textWidth(`${share(c4[k], total)}%`, shareSize) + 0.12) {
        ax.text(cx, 0.17, `${share(c4[k], total)}%`, { size: shareSize, color: T.INK_3, ha: "center", va: "top" });
      }
    });
  }, 0.7);
}

/**
 * Rows of one reading each, the bar running from a zero line so a figure under par points the other way.
 * `rows` are [label, value, note, good]: with `good` set the bar takes the accent when it is the better
 * side; without it the family's palette decides, because a description is not a comparison.
 */
function barRowsBlock(T, rows, { title, fmtv = v => fix(v, 2), noteHead = "", labelW = 2.4 } = {}) {
  if (isPhone(T)) return phoneBarRows(T, rows, { title, fmtv, noteHead });
  const rowIn = 0.42 * dense(T), hIn = rowIn * rows.length + 0.2;
  const notes = house(T).prose !== "none";
  return block("chart", 3.4, () => hIn + (title ? headingIn : 0), (fig, x, top, w, extra = 0) => {
    if (title) heading(fig, x, top, w, title, note(T, noteHead));
    const y = top + (title ? headingIn : 0);
    const ax = blockAxes(fig, x, y, w, hIn + extra, [0, w], [-rows.length, 0.2 / rowIn]);
    const lw = Math.min(labelW, w * 0.3), noteW = notes ? Math.min(1.9, w * 0.2) : 0.15;
    // the figure is written at the end of its own bar, so the track stops short of the note by its width
    const valW = Math.max(...rows.map(r => ax.textWidth(fmtv(r[1]), 12, "display"))) + 0.18;
    const barX0 = lw, barX1 = w - noteW - valW;
    const lo = Math.min(0, ...rows.map(r => r[1])), hi = Math.max(0, ...rows.map(r => r[1]));
    const span = (hi - lo) || 1;
    const at = v => barX0 + ((v - lo) / span) * (barX1 - barX0);
    const zero = at(0);
    ax.line(zero, 0.12, zero, -rows.length + 0.08, T.LINE, 0.8);
    rows.forEach(([label, value, tail, good], i) => {
      const yy = -i - 0.5;
      rowBand(ax, 0, yy - 0.42, w, 0.84, i, 0.06);
      ax.text(0.05, yy, label, { size: 12, family: "display", color: T.INK, va: "center" });
      const bx = at(value);
      ax.rbox(Math.min(zero, bx), yy - 0.14, Math.abs(bx - zero), 0.28, seriesColor(T, i, good), 0.04);
      ax.text(bx + (bx >= zero ? 0.08 : -0.08), yy, fmtv(value), { size: 12, family: "display", color: T.INK, ha: bx >= zero ? "left" : "right", va: "center" });
      if (tail && notes) ax.text(w, yy, tail, { size: 9.5, color: T.INK_2, ha: "right", va: "center" });
    });
  }, 0.3);
}

/** The same rows on a phone: each note goes under its label rather than out past the end of the bar. */
function phoneBarRows(T, rows, { title, fmtv, noteHead }) {
  const notes = house(T).prose !== "none" && rows.some(r => r[2]);
  const rowIn = (notes ? 0.62 : 0.46) * dense(T), hIn = rowIn * rows.length + 0.2;
  const hd = note(T, noteHead);
  return block("chart", 0, (w, probe) => hIn + (title ? headIn(probe, w, title, hd) : 0), (fig, x, top, w) => {
    const y = top + (title ? head(fig, x, top, w, title, hd) : 0);
    const ax = blockAxes(fig, x, y, w, hIn, [0, w], [-rows.length, 0.2 / rowIn]);
    const lw = Math.min(w * 0.42, Math.max(...rows.map(r => Math.max(fig.measure(r[0], 12, "display"),
      notes && r[2] ? fig.measure(r[2], 10) : 0))) + 0.24);
    const valW = Math.max(...rows.map(r => ax.textWidth(fmtv(r[1]), 14, "display"))) + 0.14;
    const lo = Math.min(0, ...rows.map(r => r[1])), hi = Math.max(0, ...rows.map(r => r[1]));
    // a bar under par grows leftwards, so the figure's room is kept on whichever side the bars reach
    const barX0 = lw + (lo < 0 ? valW : 0), barX1 = w - (hi > 0 ? valW : 0.05);
    const at = v => barX0 + ((v - lo) / ((hi - lo) || 1)) * (barX1 - barX0);
    const zero = at(0);
    ax.line(zero, 0.12, zero, -rows.length + 0.08, T.LINE, 0.8);
    rows.forEach(([label, value, tail, good], i) => {
      const yy = -i - 0.5, two = notes && tail;
      rowBand(ax, 0, yy - 0.44, w, 0.88, i, 0.06);
      ax.fitText(0.1, two ? yy + 0.17 : yy, label, lw - 0.16, { size: 12, min: 11, family: "display", color: T.INK, va: "center" });
      if (two) ax.fitText(0.1, yy - 0.2, tail, lw - 0.16, { size: 10, min: 9, color: T.INK_2, va: "center" });
      const bx = at(value);
      ax.rbox(Math.min(zero, bx), yy - 0.15, Math.abs(bx - zero), 0.3, seriesColor(T, i, good), 0.04);
      ax.text(bx + (bx >= zero ? 0.08 : -0.08), yy, fmtv(value), { size: 14, family: "display", color: T.INK, ha: bx >= zero ? "left" : "right", va: "center" });
    });
  });
}

/**
 * One reading of the player's against the same reading for the rest of the league: the track is filled in
 * their proportion, so every row keeps its own units and a percentage never dwarfs a points average. The
 * two sides get the two accents, so which of them is ahead is a colour and not only a position.
 * `rows` are [label, mine, theirs, fmtv, lower].
 */
function pairRowsBlock(T, rows, { title, noteHead = "", labelW = 2.5 } = {}) {
  if (isPhone(T)) return phonePairRows(T, rows, { title, noteHead });
  const rowIn = 0.42 * dense(T), hIn = rowIn * rows.length + 0.2;
  return block("chart", 3.6, () => hIn + (title ? headingIn : 0), (fig, x, top, w, extra = 0) => {
    if (title) heading(fig, x, top, w, title, note(T, noteHead));
    const y = top + (title ? headingIn : 0);
    const ax = blockAxes(fig, x, y, w, hIn + extra, [0, w], [-rows.length, 0.2 / rowIn]);
    const lw = Math.min(labelW, w * 0.32), numW = 0.95;
    const trackX0 = lw + numW, trackX1 = w - numW;
    rows.forEach(([label, mine, theirs, fmtv, lower], i) => {
      const yy = -i - 0.5;
      rowBand(ax, 0, yy - 0.42, w, 0.84, i, 0.06);
      ax.text(0.05, yy, label, { size: 12, family: "display", color: T.INK, va: "center" });
      const { part, lead } = pairPart(mine, theirs, lower);
      ax.rbox(trackX0, yy - 0.11, trackX1 - trackX0, 0.22, T.PANEL_2, 0.03);
      ax.rbox(trackX0, yy - 0.11, (trackX1 - trackX0) * part, 0.22, lead === "theirs" ? T.ACCENT_2 : T.ACCENT, 0.03);
      ax.text(trackX0 - 0.1, yy, fmtv(mine), { size: 13, family: "display", color: lead === "mine" ? T.ACCENT : T.INK, ha: "right", va: "center" });
      ax.text(trackX1 + 0.1, yy, fmtv(theirs), { size: 13, family: "display", color: lead === "theirs" ? T.ACCENT_2 : T.INK_2, ha: "left", va: "center" });
    });
  }, 0.3);
}

/** One part of a pair track: `mine`'s share of the two, and which side is ahead. */
function pairPart(mine, theirs, lower) {
  // both readings shifted clear of zero first, so a figure under par still fills the right way
  const sh = 1 - Math.min(mine, theirs, 0), a = mine + sh, b = theirs + sh;
  const part = lower ? (1 / a) / (1 / a + 1 / b) : a / (a + b);
  const lead = mine === theirs ? null : (lower ? mine < theirs : mine > theirs) ? "mine" : "theirs";
  return { part, lead };
}

// Labels stay beside the tracks while all fit at 12pt; otherwise every label goes above its track.
function phonePairRows(T, rows, { title, noteHead }) {
  const hd = note(T, noteHead), d = dense(T);
  const lwOf = w => Math.min(2.6, w * 0.36);
  const stacked = (probe, w) => rows.some(r => probe.measure(r[0], 12, "display") > lwOf(w) - 0.16);
  const rowOf = (probe, w) => (stacked(probe, w) ? 0.74 : 0.46) * d;
  return block("chart", 0, (w, probe) => rowOf(probe, w) * rows.length + 0.2 + (title ? headIn(probe, w, title, hd) : 0), (fig, x, top, w) => {
    const y = top + (title ? head(fig, x, top, w, title, hd) : 0);
    const two = stacked(fig, w), rowIn = rowOf(fig, w);
    const ax = blockAxes(fig, x, y, w, rowIn * rows.length + 0.2, [0, w], [-rows.length, 0.2 / rowIn]);
    const numW = Math.max(...rows.map(r => Math.max(fig.measure(r[3](r[1]), 14, "display"), fig.measure(r[3](r[2]), 14, "display")))) + 0.2;
    const trackX0 = (two ? 0.04 : lwOf(w)) + numW, trackX1 = w - numW;
    rows.forEach(([label, mine, theirs, fmtv, lower], i) => {
      const yy = -i - 0.5, ty = two ? yy - 0.17 : yy;
      rowBand(ax, 0, yy - 0.44, w, 0.88, i, 0.06);
      ax.text(0.1, two ? yy + 0.2 : yy, label, { size: 12, family: "display", color: T.INK, va: "center" });
      const { part, lead } = pairPart(mine, theirs, lower);
      const th = two ? 0.08 : 0.12;
      ax.rbox(trackX0, ty - th, trackX1 - trackX0, th * 2, T.PANEL_2, 0.03);
      ax.rbox(trackX0, ty - th, (trackX1 - trackX0) * part, th * 2, lead === "theirs" ? T.ACCENT_2 : T.ACCENT, 0.03);
      ax.text(trackX0 - 0.1, ty, fmtv(mine), { size: 14, family: "display", color: lead === "mine" ? T.ACCENT : T.INK, ha: "right", va: "center" });
      ax.text(trackX1 + 0.1, ty, fmtv(theirs), { size: 14, family: "display", color: lead === "theirs" ? T.ACCENT_2 : T.INK_2, ha: "left", va: "center" });
    });
  });
}

/** One stacked bar per player, every bar the same width, so the shares compare straight down the column. */
function playerBarsBlock(T, players, label, tail) {
  if (isPhone(T)) return phonePlayerBars(T, players, label, tail);
  const rowIn = 0.5 * dense(T), hIn = rowIn * players.length + 0.2;
  const notes = house(T).prose !== "none";
  return block("chart", 4.2, () => hIn + headingIn, (fig, x, top, w, extra = 0) => {
    heading(fig, x, top, w, label, note(T, tail));
    const y = top + headingIn;
    const ax = blockAxes(fig, x, y, w, hIn + extra, [0, w], [-players.length, 0.2 / rowIn]);
    const nameW = Math.min(2.7, w * 0.26), tailW = notes ? Math.min(1.9, w * 0.2) : 0.1;
    const size = ax.fitSize(players.map(p => p.name), nameW - 0.15, 14);
    if (legends(T)) legend(ax, nameW, 0.16 / rowIn, T.OUTCOMES, 8, 0.08, 0.08, 0.1);
    players.forEach((p, i) => {
      const yy = -i - 0.5;
      rowBand(ax, 0, yy - 0.46, w, 0.92, i, 0.06);
      ax.text(0.05, yy, p.name, { size, family: "display", color: T.INK, va: "center" });
      const c4 = four(p.counts);
      outcomeBar(ax, nameW, yy - 0.15, w - tailW - nameW, 0.3, c4, sumc(c4), 0.03, true, 9);
      if (notes) ax.text(w, yy, `${share(parOrBetter(p.counts), p.holes)}% par or better`, { size: 9.5, color: T.INK_2, ha: "right", va: "center" });
    });
  }, 0.6);
}

/** The same on a phone: each name on its own line over a bar the full width, with its share at the end of the name. */
function phonePlayerBars(T, players, label, tail) {
  const d = dense(T), rowIn = 0.8 * d, top0 = (legends(T) ? 0.34 : 0.12), hIn = rowIn * players.length + top0;
  const notes = house(T).prose !== "none", hd = note(T, tail);
  const pc = p => `${share(parOrBetter(p.counts), p.holes)}% par or better`;
  return block("chart", 0, (w, probe) => hIn + headIn(probe, w, label, hd), (fig, x, top, w) => {
    const y = top + head(fig, x, top, w, label, hd);
    const ax = blockAxes(fig, x, y, w, hIn, [0, w], [-players.length, top0 / rowIn]);
    const tailW = notes ? Math.max(...players.map(p => fig.measure(pc(p), 10))) + 0.2 : 0;
    const size = fig.fitSize(players.map(p => p.name), w - tailW - 0.16, 13, 11);
    if (legends(T)) legend(ax, 0, 0.17 / rowIn, T.OUTCOMES, 10, 0.1, 0.1 / rowIn, 0.16);
    players.forEach((p, i) => {
      const yy = -i - 0.5;
      rowBand(ax, 0, yy - 0.46, w, 0.92, i, 0.06);
      ax.text(0.1, yy + 0.2, p.name, { size, family: "display", color: T.INK, va: "center" });
      if (notes) ax.text(w - 0.06, yy + 0.2, pc(p), { size: 10, color: T.INK_2, ha: "right", va: "center" });
      const c4 = four(p.counts);
      outcomeBar(ax, 0.1, yy - 0.36, w - 0.14, 0.34, c4, sumc(c4), 0.03, true, 10.5);
    });
  });
}

/** A bar width in axis units that stays near `wantIn` inches however few bars there are. */
const barWidth = (w, n, maxUnits, wantIn) => Math.min(maxUnits, wantIn / (w / (n + 0.2)));

/** Points round by round, oldest first, with what the rest of the field scored that day behind each bar. */
function roundChartBlock(T, rounds, label, perHole) {
  const hIn = 2.1 * dense(T);
  const val = r => perHole ? r.pts / r.n : r.pts;
  const fld = r => r.fieldPts === null ? null : (perHole ? r.fieldPts / r.n : r.fieldPts);
  const any = rounds.some(r => r.fieldPts !== null);
  const best = Math.max(...rounds.map(val));
  if (isPhone(T)) return phoneRoundChart(T, rounds, label, perHole, { val, fld, any, best });
  return block("chart", 3.0, () => hIn + headingIn, (fig, x, top, w0, extra = 0) => {
    heading(fig, x, top, w0, label, any ? note(T, "the column behind each bar is the rest of the field that day") : "");
    const y = top + headingIn;
    const cap = Math.max(...rounds.map(r => Math.max(val(r), fld(r) || 0)), 1) * 1.18;
    const span = barSpan(w0, rounds.length, 1.6), w = span.w;
    const ax = blockAxes(fig, x + span.x, y, w, hIn + extra, [-0.6, rounds.length - 0.4], [-cap * 0.17, cap]);
    const bw = barWidth(w, rounds.length, 0.62, 0.95);
    rounds.forEach((r, i) => {
      const f = fld(r);
      if (f !== null) ax.rbox(i - bw / 2 - 0.05, 0, bw + 0.1, f, T.PANEL_2, 0.03);
      ax.rbox(i - bw / 2, 0, bw, val(r), val(r) === best ? T.ACCENT : T.BAR, 0.03);
      ax.text(i, val(r) + cap * 0.02, perHole ? fix(val(r), 2) : String(r.pts), { size: 11, family: "display", color: T.INK, ha: "center", va: "bottom" });
      ax.text(i, -cap * 0.035, shortDate(r.date), { size: 8.5, color: T.INK_3, ha: "center", va: "top" });
    });
    ax.line(-0.6, 0, rounds.length - 0.4, 0, T.LINE, 0.8);
  }, 0.5);
}

/**
 * The round chart on a phone: columns while every date and figure fits its own column at a size that reads,
 * and one row a round, newest at the foot, once a season has more rounds than the width has columns.
 */
function phoneRoundChart(T, rounds, label, perHole, { val, fld, any, best }) {
  const d = dense(T), n = rounds.length;
  const fmt = r => perHole ? fix(val(r), 2) : String(r.pts);
  const hd = any ? note(T, "the column behind each bar is the rest of the field that day") : "";
  const need = probe => Math.max(...rounds.map(r => Math.max(probe.measure(shortDate(r.date), 9.5), probe.measure(fmt(r), 12, "display")))) + 0.1;
  const cols = (probe, w) => barSpan(w, n, 1.6).w / n >= need(probe);
  const colIn = 2.3 * d, rowIn = 0.36 * d;
  const bodyIn = (probe, w) => cols(probe, w) ? colIn : rowIn * n + 0.1;
  return block("chart", 0, (w, probe) => bodyIn(probe, w) + headIn(probe, w, label, hd), (fig, x, top, w0) => {
    const y = top + head(fig, x, top, w0, label, hd);
    const cap = Math.max(...rounds.map(r => Math.max(val(r), fld(r) || 0)), 1) * 1.18;
    if (cols(fig, w0)) {
      const span = barSpan(w0, n, 1.6), w = span.w;
      const ax = blockAxes(fig, x + span.x, y, w, colIn, [-0.6, n - 0.4], [-cap * 0.17, cap]);
      const bw = barWidth(w, n, 0.62, 0.95);
      rounds.forEach((r, i) => {
        const f = fld(r);
        if (f !== null) ax.rbox(i - bw / 2 - 0.05, 0, bw + 0.1, f, T.PANEL_2, 0.03);
        ax.rbox(i - bw / 2, 0, bw, val(r), val(r) === best ? T.ACCENT : T.BAR, 0.03);
        ax.text(i, val(r) + cap * 0.02, fmt(r), { size: 12, family: "display", color: T.INK, ha: "center", va: "bottom" });
        ax.text(i, -cap * 0.035, shortDate(r.date), { size: 9.5, color: T.INK_3, ha: "center", va: "top" });
      });
      ax.line(-0.6, 0, n - 0.4, 0, T.LINE, 0.8);
      return;
    }
    const ax = blockAxes(fig, x, y, w0, rowIn * n + 0.1, [0, w0], [-n, 0.1 / rowIn]);
    const dw = Math.max(...rounds.map(r => fig.measure(shortDate(r.date), 10.5))) + 0.24;
    const vw = Math.max(...rounds.map(r => fig.measure(fmt(r), 13, "display"))) + 0.16;
    const at = v => dw + (v / (cap / 1.18)) * (w0 - dw - vw);
    rounds.forEach((r, i) => {
      const yy = -i - 0.5, f = fld(r), v = val(r);
      rowBand(ax, 0, yy - 0.46, w0, 0.92, i, 0.06);
      ax.text(0.1, yy, shortDate(r.date), { size: 10.5, color: T.INK_2, va: "center" });
      if (f !== null) ax.rbox(dw, yy - 0.3, at(f) - dw, 0.6, T.PANEL_2, 0.03);
      ax.rbox(dw, yy - 0.2, at(v) - dw, 0.4, v === best ? T.ACCENT : T.BAR, 0.03);
      ax.text(Math.max(at(v), f === null ? 0 : at(f)) + 0.08, yy, fmt(r), { size: 13, family: "display", color: T.INK, va: "center" });
    });
  });
}

/**
 * The season left to right: one column a card, one line a player, and the field's own average behind them
 * all. This is the only block that answers "is this league getting better or just older", which no average
 * over the whole season can, because an average has no direction.
 *
 * Names sit at the right end of each line and are pushed apart where two lines finish level, since a chart
 * of nine lines is only readable if each one says whose it is.
 */
function progressBlock(T, P, label, tail) {
  const ph = isPhone(T), hd = note(T, tail);
  const hIn = (ph ? 3.2 : 2.5) * dense(T);
  const vals = [...P.players.flatMap(p => p.points), ...P.field].filter(v => v !== null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.16;
  const n = P.cards.length;
  // A first name, unless two players share one, in which case both of them carry their whole name: a chart
  // with two lines both labelled "Gijs" has labelled neither.
  const firsts = {};
  for (const p of P.players) firsts[p.name.split(" ")[0]] = (firsts[p.name.split(" ")[0]] || 0) + 1;
  const shortName = p => firsts[p.name.split(" ")[0]] > 1 ? p.name : p.name.split(" ")[0];
  return block("chart", 4.0, (w, probe) => hIn + headIn(probe, w, label, hd), (fig, x0, top, w, extra = 0) => {
    const y = top + head(fig, x0, top, w, label, hd);
    // The names live in a gutter of their own, and the plot keeps a sane pitch rather than stretching two
    // cards across a foot of paper. Both are centred together, so a short season sits in the middle.
    const nameW = ph ? Math.min(1.3, w * 0.24) : Math.min(1.5, w * 0.2);
    const plotW = Math.min(w - nameW, Math.max(2.0, n * 1.5));
    const x = x0 + Math.max(0, (w - plotW - nameW) / 2);
    const ax = blockAxes(fig, x, y, plotW, hIn + extra, [-0.35, n - 1 + 0.35], [lo - pad * 1.9, hi + pad]);
    // on a phone a long season dates every few cards, counted back from the newest, rather than shrinking them all
    const every = ph ? Math.max(1, Math.ceil((Math.max(...P.cards.map(c => fig.measure(shortDate(c.date), 9.5))) + 0.12) / (plotW / Math.max(1, n - 0.3)))) : 1;
    // the grid is one hairline a card with its date under it: no y axis, because the lines carry the numbers
    P.cards.forEach((c, i) => {
      ax.line(i, lo - pad * 1.2, i, hi + pad, T.LINE, 0.6);
      if (!ph) ax.fitText(i, lo - pad * 1.35, shortDate(c.date), 0.95, { size: 8.5, color: T.INK_3, ha: "center", va: "top" });
      else if ((n - 1 - i) % every === 0) ax.text(i, lo - pad * 1.35, shortDate(c.date), { size: 9.5, color: T.INK_3, ha: "center", va: "top" });
    });
    // the field first, so a player's own line is always the one on top of it
    const run = (pts, col, lw, dash) => {
      for (let k = 1; k < pts.length; k++) ax.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], col, lw, dash);
    };
    const seen = xs => xs.map((v, k) => [k, v]).filter(([, v]) => v !== null);
    run(seen(P.field), T.INK_3, 1.6, [5, 4]);
    const ends = [];
    P.players.forEach((p, i) => {
      // The one chart where colour is identity rather than decoration, so it takes the five series colours
      // whatever the family would otherwise paint a chart in: nine lines in one colour is nine lines lost.
      const col = T.SERIES[i % T.SERIES.length], pts = seen(p.points);
      run(pts, col, 2.0);
      for (const [k, v] of pts) fig.disc(ax.X(k), ax.Y(v), 0.075, col);
      const [lastX, lastV] = pts[pts.length - 1];
      if (pts.length === 1) fig.disc(ax.X(lastX), ax.Y(lastV), 0.11, col);
      ends.push({ name: shortName(p), col, at: ax.X(lastX), from: ax.Y(lastV), y: ax.Y(lastV) });
    });
    // Pushed apart down the gutter so two players who finish level still get a name each, and joined to their
    // own last point by a hairline, since a name that has been moved says nothing about which line it names.
    const step = ph ? 0.2 : 0.145;
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + step);
    const drop = Math.max(0, ends.length ? ends[ends.length - 1].y - (y + hIn + extra) : 0);
    const lx = x + plotW + 0.14;
    for (const e of ends) {
      e.y -= drop;
      fig.line(e.at + 0.06, e.from, lx - 0.06, e.y, T.LINE, 0.7);
      if (ph) fig.fitText(lx, e.y, e.name, nameW - 0.16, 11, 9, { family: "display", color: e.col, va: "center" });
      else fig.fitText(lx, e.y, e.name, nameW - 0.2, 9.5, 6.5, { family: "display", color: e.col, va: "center" });
    }
  }, 0.5);
}

/**
 * One row a player, one column a reading. Every cell carries what it is out of underneath, because a rate
 * over four holes and a rate over four hundred are not the same claim and a poster cannot footnote a cell.
 */
function statTableBlock(T, rows, cols, { title, tail = "" } = {}) {
  const rowIn = 0.52 * dense(T), hIn = rowIn * (rows.length + 0.9) + 0.1;
  // the best in each column, so a table of numbers still has somewhere for the eye to land
  const best = cols.map(c => {
    const vs = rows.map(r => r.by[c.key]).filter(r => r && r.n >= RATE_MIN).map(r => r.value);
    return vs.length < 2 ? null : (c.lower ? Math.min(...vs) : Math.max(...vs));
  });
  if (isPhone(T)) {
    return phoneGrid(T, { title, tail: note(T, tail), heads: cols.map(c => c.short), rows, names: rows.map(r => r.name),
      cell: (r, k) => {
        const c = r.by[cols[k].key];
        return c && { big: c.big, sub: c.sub, hot: best[k] !== null && c.n >= RATE_MIN && c.value === best[k] };
      } });
  }
  return block("table", 2.8 + 0.9 * cols.length, () => hIn + headingIn, (fig, x, top, w, extra = 0) => {
    heading(fig, x, top, w, title, note(T, tail));
    const y = top + headingIn;
    const ax = blockAxes(fig, x, y, w, hIn + extra, [0, w], [-rows.length, 0.9 + 0.1 / rowIn]);
    const nameW = Math.min(3.0, w * 0.27), colW = (w - nameW) / cols.length;
    const size = ax.fitSize(rows.map(r => r.name), nameW - 0.15, 14);
    ax.text(0.05, 0.45, caps(T, "Player"), { size: 9.5, family: "display", color: T.INK_3, va: "center" });
    cols.forEach((c, i) => ax.text(nameW + colW * (i + 0.5), 0.45, caps(T, c.short), { size: 9.5, family: "display", color: T.INK_3, ha: "center", va: "center" }));
    ax.line(0, 0.1, w, 0.1, T.LINE, 0.8);
    rows.forEach((r, i) => {
      const yy = -i - 0.5;
      rowBand(ax, 0, yy - 0.46, w, 0.92, i, 0.06);
      ax.text(0.05, yy, r.name, { size, family: "display", color: T.INK, va: "center" });
      cols.forEach((c, k) => {
        const cx = nameW + colW * (k + 0.5), cell = r.by[c.key];
        if (!cell) { ax.text(cx, yy, "–", { size: 12, color: T.INK_3, ha: "center", va: "center" }); return; }
        const top_ = best[k] !== null && cell.n >= RATE_MIN && cell.value === best[k];
        ax.text(cx, yy + 0.09, cell.big, { size: 15, family: "display", color: top_ ? T.ACCENT : T.INK, ha: "center", va: "center" });
        ax.text(cx, yy - 0.18, cell.sub, { size: 8.5, color: T.INK_3, ha: "center", va: "center" });
      });
    });
  }, 0.3);
}

/**
 * The extras, as a titled band at the foot and nowhere else. Not everybody keeps these, so a figure half
 * the field cannot answer never goes in the headline row, the header or a comparison -- it goes here, and
 * only when there is something to put in it. Always a full-width row of its own, whatever the page.
 *
 * `items` are readings, and each panel carries what its figure was taken over wherever the figure itself
 * does not: a band of percentages with nothing under them is the thing that reads as a page with holes in it.
 */
function bandBlock(T, title, items, tail = "") {
  // every panel says what it was taken over, except where the figure already is that: a reading too thin to
  // draw as a percentage is written "5/7", and "5 of 7" under it is the same sentence twice
  const cells = items.map(r => [r.big, r.name, r.sub.replace(" of ", "/") === r.big ? "" : r.sub]);
  const subRow = cells.some(c => c[2]);
  const ph = isPhone(T), capSize = ph ? 9.5 : 8.5, hd = note(T, tail);
  const hIn = (subRow ? (ph ? 1.12 : 1.06) : 0.9) * dense(T);
  // on a phone a row holds only as many panels as keep every caption at 9pt or more
  const rowsOf = (probe, w) => {
    if (!ph) return bandRows(cells, w);
    const fits = per => cells.every(([, label, sub]) => probe.measure(caps(T, label), 9, "display") <= w / per - 0.24 && probe.measure(sub, 9) <= w / per - 0.24);
    let per = Math.min(3, cells.length);
    while (per > 1 && !fits(per)) per--;
    return bandRows(cells, w, { minIn: w / per - 1e-6 });
  };
  const rowsIn = (w, probe) => rowsOf(probe, w).length * (hIn + 0.1) - 0.1;
  return block("note", 99, (w, probe) => rowsIn(w, probe) + headIn(probe, w, title, hd), (fig, x, top, w) => {
    const y = top + head(fig, x, top, w, title, hd);
    rowsOf(fig, w).forEach((row, r) => {
      const step = w / row.length, ry = y + r * (hIn + 0.1);
      // on a phone a panel alone on its row keeps a two-across figure size rather than filling the width with it
      const bigSize = bigIn(ph ? Math.min(w / rowsOf(fig, w)[0].length, w / 2) : step, 26);
      row.forEach(([big, label, sub], i) => panel(fig, x + i * step, ry, step, hIn, big, label, null, { bigSize, capSize, sub, subRow }));
    });
  });
}

// ---------------------------------------------------------------- shared readings
/** The headline readings a set of summaries has between them, in the order a card would draw them. */
function statColumns(lines, opts) {
  const seen = new Map();
  for (const x of lines) for (const r of statReadings(x, opts)) if (!r.deep && !seen.has(r.key)) seen.set(r.key, r);
  return STRIP_KEYS.map(k => seen.get(k)).filter(Boolean);
}

/**
 * The player against the rest of the league on the readings both sides kept. Headline readings only: the
 * deep ones run to a dozen rows on their own and would turn a band at the foot into a second poster.
 * Empty when the two sides share nothing.
 */
function extrasPairs(p, opts) {
  return statPairs(p.statline, p.rest && p.rest.statline, opts)
    .filter(r => !r.deep)
    .map(r => [r.title, r.value, r.theirs, r.fmt, r.lower]);
}

const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const BANDS = ["Hardest third", "Middle third", "Easiest third"];

// ---------------------------------------------------------------- the posters
/**
 * The league as one field: what a hole costs it, how the kinds of hole play, and every player's shape.
 * `St` is model.leagueStats; only the league's own players are ever in it.
 */
export function statsFieldPoster(St, group, T, { extras = false } = {}) {
  const F = St.field;
  const P = leagueProgress(St.rounds);
  const band = extras && F.statline.any ? statReadings(F.statline, { per18: true }).filter(r => !r.deep).slice(0, 5) : [];
  const rows = [
    ...Object.keys(F.byPar).sort().map(k => [`Par ${k}`, F.byPar[k].vspar, `${fix(F.byPar[k].pts, 2)} pts  ·  ${F.byPar[k].holes} holes`]),
    ...F.bands.map((b, i) => b.holes ? [BANDS[i], b.vspar, `${fix(b.pts, 2)} pts  ·  ${b.holes} holes`] : null).filter(Boolean),
  ];
  const foot = `Every hole the league's own players have walked: ${F.holes} holes over ${F.rounds} rounds on ${F.cards} cards. ` +
    `Points are Stableford, so 2 a hole is playing to handicap. The thirds split the holes by stroke index, so the hardest third of a ` +
    `nine is its three lowest-index holes; those are also where the strokes are given, which is why they usually pay the most points. ` +
    (P.cards.length > 1 ? `The season runs left to right, one column a card and one line a player, with the whole field dashed behind them${P.perHole ? `; this league mixes nine- and eighteen-hole rounds, so that chart counts points a hole` : ""}. ` : "") +
    `Only the league's own players count, so a guest never moves a figure.` +
    (F.statline.any ? ` The readings along the bottom are only from the players who keep them, over the ${F.statline.holes} holes they kept them for, so they say nothing about the rest of the field.` : "");
  return sheet(T, {
    title: "How this league scores", kicker: group.name,
    sub: `${F.cards} cards  ·  ${F.rounds} rounds  ·  ${dateSpan(St.rounds)}`,
    right: `${F.players} players  ·  ${F.holes} holes walked\nA round is worth ${fix(F.avgPts)} points`,
    foot,
    tiles: [
      [`${share(parOrBetter(F.counts), F.holes)}%`, "par or better", T.ACCENT],
      [fmtSigned(F.vspar, 2), "a hole against par"],
      [fix(F.pts, 2), "points a hole"],
      [fix(F.avgPts), "points a card"],
    ],
  }, [
    distributionBlock(T, F.counts, "Every hole walked"),
    barRowsBlock(T, rows, { title: "How the holes play", noteHead: "average against par", fmtv: v => fmtSigned(v, 2) }),
    P.cards.length > 1 && P.players.length
      ? progressBlock(T, P, P.perHole ? "The season, points a hole" : "The season, card by card", "one line a player, oldest card on the left")
      : null,
    playerBarsBlock(T, St.players, "Who scores what", `${St.players.length} players`),
    band.length ? bandBlock(T, "Putts, fairways and the rest", band) : null,
  ]);
}

/**
 * The nines: every loop these rounds contain, each one re-scored on its own card and its own rating, so a
 * loop walked inside an 18 sits beside the same loop walked alone.
 */
export function statsNinesPoster(N, group, T) {
  const names = [...new Set(N.flatMap(l => l.players.map(p => p.name)))];
  const table = names.map(name => {
    const cells = N.map(l => l.players.find(p => p.name === name) || null);
    const played = cells.filter(Boolean);
    const cards = played.reduce((a, c) => a + c.cards, 0);
    return { name, cells, cards, avgPts: cards ? played.reduce((a, c) => a + c.avgPts * c.cards, 0) / cards : 0 };
  }).sort((a, b) => b.avgPts - a.avgPts || a.name.localeCompare(b.name));
  const cards = N.reduce((a, l) => a + l.cards, 0);
  const foot = `Each loop lifted out of its round and scored again on its own stroke index and its own course rating, whether it was ` +
    `walked on its own or as half of an eighteen, which is the only way an average over both means anything: a loop walked inside an 18 ` +
    `usually scores a point or so differently from the same loop alone, and that is the point. Points are Stableford, so 18 over nine ` +
    `holes is playing to handicap; the small figures under each average are the gross and the number of cards it is taken over.`;

  // one bar per loop: what a card on it is worth, with what it is gone round in underneath
  const chartIn = 2.35 * dense(T);
  const loops = isPhone(T) ? phoneLoops(T, N) : block("chart", Math.max(3.2, 1.15 * N.length), () => chartIn + headingIn, (fig, x, top, w0, extra = 0) => {
    heading(fig, x, top, w0, "Average points a card", "");
    const cap = Math.max(...N.map(l => l.avgPts), 1) * 1.3;
    const span = barSpan(w0, N.length, 2.8), w = span.w;
    const ax = blockAxes(fig, x + span.x, top + headingIn, w, chartIn + extra, [-0.6, N.length - 0.4], [-cap * 0.28, cap]);
    const bw = barWidth(w, N.length, 0.55, 1.15);
    const best = Math.max(...N.map(l => l.avgPts));
    N.forEach((l, i) => {
      ax.rbox(i - bw / 2, 0, bw, l.avgPts, l.avgPts === best && N.length > 1 ? T.ACCENT : T.BAR, 0.03);
      ax.text(i, l.avgPts + cap * 0.02, fix(l.avgPts), { size: 20, family: "display", color: T.INK, ha: "center", va: "bottom" });
      ax.fitText(i, -cap * 0.04, l.name, 1.0, { size: 12, family: "display", color: T.INK, ha: "center", va: "top" });
      ax.fitText(i, -cap * 0.125, l.avgGross === null ? "no full card" : `${fix(l.avgGross)} gross, ${fmtToPar(l.avgTopar)}`,
        1.0, { size: 9.5, color: T.INK_2, ha: "center", va: "top" });
      ax.fitText(i, -cap * 0.195, `${l.cards} card${l.cards === 1 ? "" : "s"}  ·  par ${l.par}`, 1.0, { size: 9, color: T.INK_3, ha: "center", va: "top" });
    });
    ax.line(-0.6, 0, N.length - 0.4, 0, T.LINE, 0.8);
  }, 0.5);

  // then the same thing player by player, so a loop that suits somebody shows up as a row
  const rowIn = 0.5 * dense(T), tIn = rowIn * (table.length + 0.9) + 0.1;
  const grid = isPhone(T) ? phoneGrid(T, {
    title: "Points a card, player by player", heads: N.map(l => l.name), rows: table, names: table.map(r => r.name),
    cell: (r, k) => {
      const c = r.cells[k];
      if (!c) return null;
      const best = Math.max(...r.cells.filter(Boolean).map(x => x.avgPts), -1);
      return { big: fix(c.avgPts), sub: `${c.avgGross === null ? "–" : `${fix(c.avgGross)} gross`}  ·  ${c.cards} card${c.cards === 1 ? "" : "s"}`,
        hot: r.cells.filter(Boolean).length > 1 && c.avgPts === best };
    },
  }) : block("table", 2.8 + 0.85 * N.length, () => tIn + headingIn, (fig, x, top, w, extra = 0) => {
    heading(fig, x, top, w, "Points a card, player by player", "");
    const ax = blockAxes(fig, x, top + headingIn, w, tIn + extra, [0, w], [-table.length, 0.9 + 0.1 / rowIn]);
    const nameW = Math.min(3.0, w * 0.27), colW = (w - nameW) / N.length;
    const size = ax.fitSize(table.map(r => r.name), nameW - 0.15, 14);
    ax.text(0.05, 0.45, caps(T, "Player"), { size: 9.5, family: "display", color: T.INK_3, va: "center" });
    N.forEach((l, i) => ax.text(nameW + colW * (i + 0.5), 0.45, caps(T, l.name), { size: 9.5, family: "display", color: T.INK_3, ha: "center", va: "center" }));
    ax.line(0, 0.1, w, 0.1, T.LINE, 0.8);
    table.forEach((r, i) => {
      const yy = -i - 0.5;
      rowBand(ax, 0, yy - 0.46, w, 0.92, i, 0.06);
      ax.text(0.05, yy, r.name, { size, family: "display", color: T.INK, va: "center" });
      const best = Math.max(...r.cells.filter(Boolean).map(c => c.avgPts), -1);
      const many = r.cells.filter(Boolean).length > 1;
      r.cells.forEach((c, k) => {
        const cx = nameW + colW * (k + 0.5);
        if (!c) { ax.text(cx, yy, "–", { size: 12, color: T.INK_3, ha: "center", va: "center" }); return; }
        ax.text(cx, yy + 0.09, fix(c.avgPts), { size: 15, family: "display", color: many && c.avgPts === best ? T.ACCENT : T.INK, ha: "center", va: "center" });
        ax.text(cx, yy - 0.18, `${c.avgGross === null ? "–" : fix(c.avgGross)}  ·  ${c.cards}`, { size: 8.5, color: T.INK_3, ha: "center", va: "center" });
      });
    });
  }, 0.3);

  return sheet(T, {
    title: "The nines walked", kicker: group.name,
    sub: `${N.length} loop${N.length === 1 ? "" : "s"}  ·  ${cards} nine-hole card${cards === 1 ? "" : "s"}`,
    right: "Each loop on its own rating\nand its own stroke index",
    foot, tiles: null,
  }, [loops, grid]);
}

/**
 * The loops on a phone: columns while every loop's name fits its own at 11pt, and otherwise one row a loop,
 * its name over a bar the width of the page with the gross and the cards under it.
 */
function phoneLoops(T, N) {
  const d = dense(T), n = N.length, title = "Average points a card";
  const meta = l => `${l.avgGross === null ? "no full card" : `${fix(l.avgGross)} gross, ${fmtToPar(l.avgTopar)}`}  ·  ${l.cards} card${l.cards === 1 ? "" : "s"}  ·  par ${l.par}`;
  const cols = (probe, w) => {
    const pitch = barSpan(w, n, 2.8).w / n - 0.12;
    return N.every(l => probe.measure(l.name, 11, "display") <= pitch && probe.measure(`${fix(l.avgGross)} gross, ${fmtToPar(l.avgTopar)}`, 9.5) <= pitch);
  };
  const colIn = 2.5 * d, rowIn = 1.02 * d;
  const best = Math.max(...N.map(l => l.avgPts));
  const hot = l => l.avgPts === best && n > 1 ? T.ACCENT : T.BAR;
  return block("chart", 0, (w, probe) => headingIn + (cols(probe, w) ? colIn : rowIn * n), (fig, x, top, w0) => {
    heading(fig, x, top, w0, title, "");
    const y = top + headingIn;
    if (cols(fig, w0)) {
      const cap = Math.max(...N.map(l => l.avgPts), 1) * 1.3;
      const span = barSpan(w0, n, 2.8), w = span.w, pitch = w / n - 0.12;
      // the three lines under each bar take a fixed 0.75in, whatever the bars above them come to
      const ax = blockAxes(fig, x + span.x, y, w, colIn, [-0.6, n - 0.4], [-cap * 0.75 / (colIn - 0.75), cap]);
      const bw = barWidth(w, n, 0.55, 1.15);
      N.forEach((l, i) => {
        ax.rbox(i - bw / 2, 0, bw, l.avgPts, hot(l), 0.03);
        ax.text(i, l.avgPts + cap * 0.02, fix(l.avgPts), { size: 20, family: "display", color: T.INK, ha: "center", va: "bottom" });
        const at = (k, s, o) => fig.fitText(ax.X(i), ax.Y(0) + 0.08 + k, s, pitch, o.size, o.min, { ...o, ha: "center", va: "top" });
        at(0, l.name, { size: 12, min: 11, family: "display", color: T.INK });
        at(0.24, l.avgGross === null ? "no full card" : `${fix(l.avgGross)} gross, ${fmtToPar(l.avgTopar)}`, { size: 10, min: 9.5, color: T.INK_2 });
        at(0.45, `${l.cards} card${l.cards === 1 ? "" : "s"}  ·  par ${l.par}`, { size: 9.5, min: 9, color: T.INK_3 });
      });
      ax.line(-0.6, 0, n - 0.4, 0, T.LINE, 0.8);
      return;
    }
    const vw = Math.max(...N.map(l => fig.measure(fix(l.avgPts), 18, "display"))) + 0.16;
    const top_ = Math.max(...N.map(l => l.avgPts), 1);
    N.forEach((l, i) => {
      const ry = y + i * rowIn;
      fig.fitText(x + 0.04, ry + 0.2, l.name, w0 - 0.08, 13, 11, { family: "display", color: T.INK, va: "center" });
      const bw = (w0 - vw - 0.04) * l.avgPts / top_;
      fig.rbox(x + 0.04, ry + 0.38, Math.max(0.02, bw), 0.28, hot(l), 0.03);
      fig.text(x + 0.04 + bw + 0.1, ry + 0.52, fix(l.avgPts), { size: 18, family: "display", color: T.INK, va: "center" });
      fig.fitText(x + 0.04, ry + 0.82, meta(l), w0 - 0.08, 10, 9, { color: T.INK_2, va: "center" });
    });
  });
}

/**
 * One player of a league: their own shape, then the same readings for everyone else over exactly the
 * rounds they were both there for. `p` is one of St.players and carries `rest`, that comparison.
 */
export function statsPlayerPoster(St, p, group, T, { extras = false } = {}) {
  const R = p.rest;
  const band = extras ? extrasPairs(p, { per18: true }) : [];
  const mineX = extras && p.statline.any ? statReadings(p.statline, { per18: true }).filter(r => !r.deep) : [];
  const perHole = new Set(p.rounds.map(r => r.n)).size > 1;
  const first = p.name.split(" ")[0];
  const vs = [];
  const add = (label, mine, theirs, fmtv, lower = false) => {
    if (mine === null || theirs === null || theirs === undefined || !R.holes) return;
    if (!mine && !theirs) return;  // nobody has made one of these yet, so there is nothing to compare
    vs.push([label, mine, theirs, fmtv, lower]);
  };
  const pc = v => `${Math.round(v)}%`;
  add("Points a round", p.avgPts, R.pts * (p.holes / p.played), v => fix(v));
  add("Points a hole", p.pts, R.pts, v => fix(v, 2));
  add("Against par", p.vspar, R.vspar, v => fmtSigned(v, 2), true);
  add("Par or better", share(parOrBetter(p.counts), p.holes), share(parOrBetter(R.counts), R.holes), pc);
  add("Birdies or better", share(p.counts[0] + p.counts[1], p.holes), share(R.counts[0] + R.counts[1], R.holes), pc);
  add("Double or worse", share(p.counts[4] + p.counts[5], p.holes), share(R.counts[4] + R.counts[5], R.holes), pc, true);
  for (const k of Object.keys(p.byPar)) {
    if (!R.byPar[k] || p.byPar[k].holes < 6 || R.byPar[k].holes < 6) continue;
    add(`Points on par ${k}s`, p.byPar[k].pts, R.byPar[k].pts, v => fix(v, 2));
  }
  if (p.bands[0].holes >= 6 && R.bands[0] && R.bands[0].holes >= 6) add("Points, hardest third", p.bands[0].pts, R.bands[0].pts, v => fix(v, 2));

  const foot = (vs.length ? `${p.name} on the left of each track, everyone else in ${group.name} on the right, over exactly the ` +
    `${p.played} round${p.played === 1 ? "" : "s"} they were there for, so neither side is measured on a day the other missed. The track is filled ` +
    `in the proportion of the two figures, and the accent colour marks ${first}'s side when it is the better one, whichever direction the number runs. `
    : `${first} has not yet shared a round in this league with anyone else, so there is nothing to measure against. `) +
    (perHole ? "This league mixes nine- and eighteen-hole rounds, so the round chart counts points a hole. " : "") +
    "Only the league's own players count, so a guest never moves a figure." +
    (band.length ? ` The last block is only the holes where ${first} and somebody else both wrote the same thing down, which is why it counts fewer holes than everything above it.`
      : mineX.length ? ` The last block is ${first}'s own putts and fairways over the ${p.statline.holes} holes that answered them. Nobody else in this league has kept the same readings, so there is nothing to set them against.` : "");
  const right = [`${fix(p.avgPts)} points a round`,
    [p.wins ? `${p.wins} win${p.wins === 1 ? "" : "s"}` : "", p.avgPlace ? `${ordinal(Math.round(p.avgPlace))} on average in this league` : ""].filter(Boolean).join("  ·  ")];

  return sheet(T, {
    title: p.name, kicker: group.name,
    sub: `${p.played} round${p.played === 1 ? "" : "s"}  ·  ${p.holes} holes  ·  ${dateSpan(p.rounds)}`,
    right: right.filter(Boolean).join("\n"), foot,
    tiles: [
      [p.played, `round${p.played === 1 ? "" : "s"}`],
      [fix(p.avgPts), "points a round", T.ACCENT],
      [p.bestPts === null ? "–" : p.bestPts, "best round"],
      [p.returns ? fmtToPar(Math.round(p.avgTopar)) : "–", "gross to par"],
      [`${share(parOrBetter(p.counts), p.holes)}%`, "par or better"],
    ],
  }, [
    distributionBlock(T, p.counts, "Every hole in this league"),
    vs.length ? pairRowsBlock(T, vs, { title: "Against the field", noteHead: `${first}  ·  the rest of the league`, labelW: 2.6 }) : null,
    p.played > 1 ? roundChartBlock(T, p.rounds, perHole ? "Points a hole, round by round" : "Points round by round", perHole) : null,
    // The extras the same way as everything else on this sheet: against the rest of the league where there is
    // a rest of the league to set them against, and simply as their own figures where there is not.
    band.length
      ? { ...pairRowsBlock(T, band, { title: "Putts, fairways and the rest", noteHead: `${first}  ·  the rest of the league`, labelW: 2.6 }), minW: 99 }
      : mineX.length ? bandBlock(T, "Putts, fairways and the rest", mineX,
        `${first} over ${p.statline.holes} hole${p.statline.holes === 1 ? "" : "s"}`) : null,
  ]);
}

/**
 * The extras as a sheet of their own: what the league keeps beyond the number of strokes. Nothing here is
 * ever on the other posters' headline rows, because not everybody keeps these and a figure half the field
 * cannot answer has no business sitting beside one they all can.
 *
 * Only players with something recorded appear at all, and every cell says what it is out of.
 */
export function statsExtrasPoster(St, group, T) {
  const opts = { per18: true };
  const who = St.players.filter(p => p.statline && p.statline.any);
  const cols = statColumns([St.field.statline, ...who.map(p => p.statline)], opts);
  const lead = cols[0];
  const by = p => Object.fromEntries(statReadings(p.statline, opts).map(r => [r.key, r]));
  const rows = who.map(p => ({ name: p.name, by: by(p) }))
    .sort((a, b) => {
      const x = a.by[lead.key], y = b.by[lead.key];
      if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1) || a.name.localeCompare(b.name);
      return (lead.lower ? x.value - y.value : y.value - x.value) || a.name.localeCompare(b.name);
    });
  const deep = statReadings(St.field.statline, opts).filter(r => r.deep).slice(0, 5);
  const F = St.field.statline;
  const foot = `Only what was actually written down: every figure counts the holes that answered it and no others, so a player who ` +
    `started keeping putts halfway through a season is measured over the holes they kept them for, and the number under each ` +
    `reading says which holes those were. A percentage waits for ${RATE_MIN} attempts before it is drawn as one; under that it stays ` +
    `the fraction it is, and the accent colour marks the best in a column only where enough stands behind it. Greens in regulation, ` +
    `up and down and sand saves are never asked for on the phone: they fall out of the strokes and the putts.`;
  return sheet(T, {
    title: "Putts, fairways and the rest", kicker: group.name,
    sub: `${who.length} player${who.length === 1 ? "" : "s"} keeping them  ·  ${F.holes} holes  ·  ${dateSpan(St.rounds)}`,
    right: "Only the holes that answered\nEverything else left blank", foot,
    tiles: statReadings(F, opts).filter(r => !r.deep).slice(0, 5).map(r => [r.big, r.name, r.key === "putts" ? T.ACCENT : null]),
  }, [
    statTableBlock(T, rows, cols, { title: "Player by player", tail: `${St.field.holes} holes walked in this league` }),
    // These share no units -- a birdie conversion and what the fairway is worth are not on one scale -- so
    // they are tiles and never bars against each other.
    deep.length ? bandBlock(T, "More of the same, for fun", deep) : null,
  ]);
}
