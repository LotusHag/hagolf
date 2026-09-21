// Posters for a league's statistics: the field, the nines, one player. App-only, so there is no Python
// twin; the drawing helpers and the four-outcome poster palette are the same ones the round posters use.
import { Fig, MARGIN, HEADER_IN, header, footer, section, outcomeBar, legend } from "./draw.js";
import { fmtToPar, fmtSigned, fix } from "./model.js";

/** The screen's six buckets folded onto the four the poster palette names. */
export function four(counts) {
  return [counts[0] + counts[1], counts[2], counts[3], counts[4] + counts[5]];
}

const sumc = cs => cs.reduce((a, b) => a + b, 0);
const share = (v, t) => t ? Math.round((v / t) * 100) : 0;
const parOrBetter = c => c[0] + c[1] + c[2];
const present = (T, counts) => T.OUTCOMES.filter((o, k) => counts[k] > 0);
const ROW_IN = 0.42;

const shortDate = d => {
  const t = d ? new Date(d + "T12:00:00") : null;
  return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : (d || "");
};

const dateSpan = rounds => {
  const ds = rounds.map(r => r.date).filter(Boolean).sort();
  if (!ds.length) return "";
  return ds[0] === ds[ds.length - 1] ? shortDate(ds[0]) : `${shortDate(ds[0])} to ${shortDate(ds[ds.length - 1])}`;
};

/** How tall a footer of this text will be, so the figure can be sized before it is drawn. */
function footHeight(T, widthIn, text) {
  const probe = new Fig(widthIn, 1, T, 20);
  return 0.45 + 0.17 * (probe.wrap(text, widthIn * (1 - 2 * MARGIN), 9).length - 1);
}

/** A row of big numbers under the header: the readings a poster should be legible from across the room. */
function tiles(fig, topIn, hIn, items) {
  const T = fig.T, M = MARGIN * fig.w, W = fig.w - 2 * M;
  const w = W / items.length;
  items.forEach((it, i) => {
    const x = M + i * w;
    fig.rbox(x + 0.04, topIn, w - 0.08, hIn, T.PANEL, 0.08);
    fig.text(x + w / 2, topIn + hIn * 0.48, String(it[0]), { size: 30, family: "display", color: it[2] || T.INK, ha: "center", va: "center" });
    fig.text(x + w / 2, topIn + hIn - 0.14, it[1].toUpperCase(), { size: 9, family: "display", color: T.INK_3, ha: "center", va: "bottom" });
  });
  return topIn + hIn;
}

const DIST_IN = 1.05;

/** One stacked bar of every hole walked, with the four outcomes named beside it. */
function distributionPanel(fig, topIn, counts, label) {
  const T = fig.T, W = fig.w - 2 * MARGIN * fig.w;
  const c4 = four(counts), total = sumc(c4);
  const ax = fig.axes([MARGIN, 1 - (topIn + 0.95) / fig.h, 1 - 2 * MARGIN, 0.95 / fig.h], [0, W], [0, 1]);
  section(ax, 0, 0.88, label);
  legend(ax, W * 0.34, 0.88, present(T, c4), 9, 0.1, 0.1, 0.13);
  outcomeBar(ax, 0, 0.2, W, 0.45, c4, total, 0.03, true, 11);
  T.OUTCOMES.forEach(([, colr], k) => {
    if (!c4[k]) return;
    const x = (c4.slice(0, k).reduce((a, b) => a + b, 0) + c4[k] / 2) / total * W;
    ax.text(x, 0.13, `${share(c4[k], total)}%`, { size: 9, color: T.INK_3, ha: "center", va: "top" });
  });
  return topIn + DIST_IN;
}

const barRowsHeight = n => ROW_IN * (n + 0.9) + 0.1;

/**
 * Rows of one reading each, the bar running from a zero line so a figure under par points the other way.
 * `rows` are [label, value, note, good]: with `good` set the bar takes the accent when it is the better
 * side, without it every bar is the one series colour, because a description is not a comparison.
 */
function barRows(fig, topIn, rows, { title, fmtv = v => fix(v, 2), noteHead = "", labelW = 2.4 } = {}) {
  const T = fig.T, W = fig.w - 2 * MARGIN * fig.w;
  const hIn = ROW_IN * (rows.length + 0.9);
  const ax = fig.axes([MARGIN, 1 - (topIn + hIn) / fig.h, 1 - 2 * MARGIN, hIn / fig.h], [0, W], [-rows.length, 0.9]);
  if (title) section(ax, 0, 0.45, title);
  if (noteHead) ax.text(W, 0.45, noteHead, { size: 9, color: T.INK_3, ha: "right", va: "center" });
  const barX0 = labelW, barX1 = W - 1.9;
  const lo = Math.min(0, ...rows.map(r => r[1])), hi = Math.max(0, ...rows.map(r => r[1]));
  const span = (hi - lo) || 1;
  const at = v => barX0 + ((v - lo) / span) * (barX1 - barX0);
  const zero = at(0);
  ax.line(zero, 0.15, zero, -rows.length + 0.1, T.LINE, 0.8);
  rows.forEach(([label, value, note, good], i) => {
    const y = -i - 0.5;
    if (i % 2 === 1) ax.rbox(0, y - 0.42, W, 0.84, T.PANEL, 0.06);
    ax.text(0.05, y, label, { size: 12, family: "display", color: T.INK, va: "center" });
    const x = at(value);
    const colr = good === undefined ? T.BAR : (good ? T.ACCENT : T.BAR);
    ax.rbox(Math.min(zero, x), y - 0.14, Math.abs(x - zero), 0.28, colr, 0.04);
    ax.text(x + (x >= zero ? 0.08 : -0.08), y, fmtv(value), { size: 12, family: "display", color: T.INK, ha: x >= zero ? "left" : "right", va: "center" });
    if (note) ax.text(W, y, note, { size: 10, color: T.INK_2, ha: "right", va: "center" });
  });
  return topIn + hIn + 0.1;
}

const pairRowsHeight = n => ROW_IN * (n + 0.9) + 0.1;

/**
 * One reading of the player's against the same reading for the rest of the league: the track is filled in
 * their proportion, so every row keeps its own units and a percentage never dwarfs a points average.
 * `rows` are [label, mine, theirs, fmtv, lower].
 */
function pairRows(fig, topIn, rows, { title, noteHead = "", labelW = 2.5 } = {}) {
  const T = fig.T, W = fig.w - 2 * MARGIN * fig.w;
  const hIn = ROW_IN * (rows.length + 0.9);
  const ax = fig.axes([MARGIN, 1 - (topIn + hIn) / fig.h, 1 - 2 * MARGIN, hIn / fig.h], [0, W], [-rows.length, 0.9]);
  if (title) section(ax, 0, 0.45, title);
  if (noteHead) ax.text(W, 0.45, noteHead, { size: 9, color: T.INK_3, ha: "right", va: "center" });
  const numW = 0.95, trackX0 = labelW + numW, trackX1 = W - numW;
  rows.forEach(([label, mine, theirs, fmtv, lower], i) => {
    const y = -i - 0.5;
    if (i % 2 === 1) ax.rbox(0, y - 0.42, W, 0.84, T.PANEL, 0.06);
    ax.text(0.05, y, label, { size: 12, family: "display", color: T.INK, va: "center" });
    // both readings shifted clear of zero first, so a figure under par still fills the right way
    const sh = 1 - Math.min(mine, theirs, 0), a = mine + sh, b = theirs + sh;
    const part = lower ? (1 / a) / (1 / a + 1 / b) : a / (a + b);
    const lead = mine === theirs ? null : (lower ? mine < theirs : mine > theirs) ? "mine" : "theirs";
    ax.rbox(trackX0, y - 0.11, trackX1 - trackX0, 0.22, T.PANEL_2, 0.03);
    ax.rbox(trackX0, y - 0.11, (trackX1 - trackX0) * part, 0.22, lead === "mine" ? T.ACCENT : T.BAR, 0.03);
    ax.text(trackX0 - 0.1, y, fmtv(mine), { size: 13, family: "display", color: lead === "mine" ? T.ACCENT : T.INK, ha: "right", va: "center" });
    ax.text(trackX1 + 0.1, y, fmtv(theirs), { size: 13, family: "display", color: lead === "theirs" ? T.INK : T.INK_2, ha: "left", va: "center" });
  });
  return topIn + hIn + 0.1;
}

const playerBarsHeight = n => 0.5 * (n + 1) + 0.1;

/** One stacked bar per player, every bar the same width, so the shares compare straight down the column. */
function playerBars(fig, topIn, players, label, note) {
  const T = fig.T, W = fig.w - 2 * MARGIN * fig.w, rowIn = 0.5;
  const hIn = rowIn * (players.length + 1);
  const ax = fig.axes([MARGIN, 1 - (topIn + hIn) / fig.h, 1 - 2 * MARGIN, hIn / fig.h], [0, W], [-players.length, 1]);
  section(ax, 0, 0.55, label);
  legend(ax, W * 0.34, 0.55, T.OUTCOMES, 9, 0.1, 0.1, 0.13);
  if (note) ax.text(W, 0.55, note, { size: 9, color: T.INK_3, ha: "right", va: "center" });
  const nameW = 2.7;
  const size = ax.fitSize(players.map(p => p.name), nameW - 0.15, 14);
  players.forEach((p, i) => {
    const y = -i - 0.5;
    if (i % 2 === 1) ax.rbox(0, y - 0.46, W, 0.92, T.PANEL, 0.06);
    ax.text(0.05, y, p.name, { size, family: "display", color: T.INK, va: "center" });
    const c4 = four(p.counts);
    outcomeBar(ax, nameW, y - 0.15, W - 1.9 - nameW, 0.3, c4, sumc(c4), 0.03, true, 9);
    ax.text(W, y, `${share(parOrBetter(p.counts), p.holes)}% par or better`, { size: 10, color: T.INK_2, ha: "right", va: "center" });
  });
  return topIn + hIn + 0.1;
}

/** Points round by round, oldest first, with what the rest of the field scored that day behind each bar. */
function roundChart(fig, topIn, hIn, rounds, label, perHole) {
  const T = fig.T;
  const val = r => perHole ? r.pts / r.n : r.pts;
  const fld = r => r.fieldPts === null ? null : (perHole ? r.fieldPts / r.n : r.fieldPts);
  const any = rounds.some(r => r.fieldPts !== null);
  const top = Math.max(...rounds.map(r => Math.max(val(r), fld(r) || 0)), 1) * 1.25;
  const ax = fig.axes([MARGIN, 1 - (topIn + hIn) / fig.h, 1 - 2 * MARGIN, hIn / fig.h], [-0.6, rounds.length - 0.4], [-top * 0.14, top]);
  section(ax, -0.6, top * 0.95, label);
  if (any) ax.text(rounds.length - 0.4, top * 0.95, "the column behind each bar is the rest of the field that day", { size: 9, color: T.INK_3, ha: "right", va: "center" });
  const bw = barWidth(fig, rounds.length, 0.62, 0.95);
  rounds.forEach((r, i) => {
    const f = fld(r);
    if (f !== null) ax.rbox(i - bw / 2 - 0.05, 0, bw + 0.1, f, T.PANEL_2, 0.03);
    ax.rbox(i - bw / 2, 0, bw, val(r), T.BAR, 0.03);
    ax.text(i, val(r) + top * 0.02, perHole ? fix(val(r), 2) : String(r.pts), { size: 11, family: "display", color: T.INK, ha: "center", va: "bottom" });
    ax.text(i, -top * 0.03, shortDate(r.date), { size: 8.5, color: T.INK_3, ha: "center", va: "top" });
  });
  ax.line(-0.6, 0, rounds.length - 0.4, 0, T.LINE, 0.8);
  return topIn + hIn + 0.15;
}

/** A bar width in axis units that stays near `wantIn` inches however few bars there are. */
function barWidth(fig, n, maxUnits, wantIn) {
  const unit = (fig.w - 2 * MARGIN * fig.w) / (n + 0.2);
  return Math.min(maxUnits, wantIn / unit);
}

const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

const BANDS = ["Hardest third", "Middle third", "Easiest third"];

/**
 * The league as one field: what a hole costs it, how the kinds of hole play, and every player's shape.
 * `St` is model.leagueStats; only the league's own players are ever in it.
 */
export function statsFieldPoster(St, group, T) {
  const F = St.field;
  const rows = [
    ...Object.keys(F.byPar).sort().map(k => [`Par ${k}`, F.byPar[k].vspar, `${fix(F.byPar[k].pts, 2)} pts  ·  ${F.byPar[k].holes} holes`]),
    ...F.bands.map((b, i) => b.holes ? [BANDS[i], b.vspar, `${fix(b.pts, 2)} pts  ·  ${b.holes} holes`] : null).filter(Boolean),
  ];
  const foot = `Every hole the league's own players have walked: ${F.holes} holes over ${F.rounds} rounds on ${F.cards} cards. ` +
    `Points are Stableford, so 2 a hole is playing to handicap. The thirds split the holes by stroke index, so the hardest third of a ` +
    `nine is its three lowest-index holes; those are also where the strokes are given, which is why they usually pay the most points. ` +
    `Only the league's own players count, so a guest never moves a figure.`;
  const width = 11.5;
  const H = HEADER_IN + 0.18 + 0.95 + 0.15 + DIST_IN + barRowsHeight(rows.length)
    + playerBarsHeight(St.players.length) + footHeight(T, width, foot);
  const fig = new Fig(width, H, T);
  header(fig, "How this league scores", group.name, `${F.cards} cards  ·  ${F.rounds} rounds  ·  ${dateSpan(St.rounds)}`,
    `${F.players} players  ·  ${F.holes} holes walked\nA round is worth ${fix(F.avgPts)} points`);
  let y = HEADER_IN + 0.18;
  y = tiles(fig, y, 0.95, [
    [`${share(parOrBetter(F.counts), F.holes)}%`, "par or better", T.ACCENT],
    [fmtSigned(F.vspar, 2), "a hole against par"],
    [fix(F.pts, 2), "points a hole"],
    [fix(F.avgPts), "points a card"],
  ]) + 0.15;
  y = distributionPanel(fig, y, F.counts, "Every hole walked");
  y = barRows(fig, y, rows, { title: "How the holes play", noteHead: "average against par", fmtv: v => fmtSigned(v, 2) });
  playerBars(fig, y, St.players, "Who scores what", `${St.players.length} players`);
  footer(fig, foot);
  return fig;
}

/**
 * The nines: every loop these rounds contain, each one re-scored on its own card and its own rating, so a
 * loop walked inside an 18 sits beside the same loop walked alone. `N` is [{name, par, cards, avgPts,
 * avgGross, avgTopar, players: [{name, cards, avgPts, avgGross}]}], as app.js builds it from ninesPlayed.
 */
export function statsNinesPoster(N, group, T) {
  const names = [...new Set(N.flatMap(l => l.players.map(p => p.name)))];
  const table = names.map(name => {
    const cells = N.map(l => l.players.find(p => p.name === name) || null);
    const played = cells.filter(Boolean);
    const cards = played.reduce((a, c) => a + c.cards, 0);
    return { name, cells, cards, avgPts: cards ? played.reduce((a, c) => a + c.avgPts * c.cards, 0) / cards : 0 };
  }).sort((a, b) => b.avgPts - a.avgPts || a.name.localeCompare(b.name));
  const chartIn = 2.6, rowIn = 0.5, width = 11.5;
  const foot = `Each loop lifted out of its round and scored again on its own stroke index and its own course rating, whether it was ` +
    `walked on its own or as half of an eighteen, which is the only way an average over both means anything: a loop walked inside an 18 ` +
    `usually scores a point or so differently from the same loop alone, and that is the point. Points are Stableford, so 18 over nine ` +
    `holes is playing to handicap; the small figures under each average are the gross and the number of cards it is taken over.`;
  const tIn = rowIn * (table.length + 1.6);
  const H = HEADER_IN + 0.18 + chartIn + 0.2 + tIn + footHeight(T, width, foot);
  const fig = new Fig(width, H, T);
  const cards = N.reduce((a, l) => a + l.cards, 0);
  header(fig, "The nines walked", group.name, `${N.length} loop${N.length === 1 ? "" : "s"}  ·  ${cards} nine-hole card${cards === 1 ? "" : "s"}`,
    "Each loop on its own rating\nand its own stroke index");

  // one bar per loop: what a card on it is worth, with what it is gone round in underneath
  const W = fig.w - 2 * MARGIN * fig.w;
  const top = Math.max(...N.map(l => l.avgPts), 1) * 1.32;
  let ax = fig.axes([MARGIN, 1 - (HEADER_IN + 0.18 + chartIn) / H, 1 - 2 * MARGIN, chartIn / H], [-0.6, N.length - 0.4], [-top * 0.26, top]);
  section(ax, -0.6, top * 0.96, "Average points a card");
  const bw = barWidth(fig, N.length, 0.55, 1.15);
  N.forEach((l, i) => {
    ax.rbox(i - bw / 2, 0, bw, l.avgPts, T.BAR, 0.03);
    ax.text(i, l.avgPts + top * 0.02, fix(l.avgPts), { size: 20, family: "display", color: T.INK, ha: "center", va: "bottom" });
    ax.text(i, -top * 0.035, l.name, { size: 12, family: "display", color: T.INK, ha: "center", va: "top" });
    ax.text(i, -top * 0.115, l.avgGross === null ? "no full card" : `${fix(l.avgGross)} gross, ${fmtToPar(l.avgTopar)}`,
      { size: 9.5, color: T.INK_2, ha: "center", va: "top" });
    ax.text(i, -top * 0.18, `${l.cards} card${l.cards === 1 ? "" : "s"}  ·  par ${l.par}`, { size: 9, color: T.INK_3, ha: "center", va: "top" });
  });
  ax.line(-0.6, 0, N.length - 0.4, 0, T.LINE, 0.8);

  // then the same thing player by player, so a loop that suits somebody shows up as a row
  const tableTop = HEADER_IN + 0.18 + chartIn + 0.2;
  ax = fig.axes([MARGIN, 1 - (tableTop + tIn) / H, 1 - 2 * MARGIN, tIn / H], [0, W], [-table.length, 1.6]);
  section(ax, 0, 1.2, "Points a card, player by player");
  const nameW = 3.0, colW = (W - nameW) / N.length;
  const size = ax.fitSize(table.map(r => r.name), nameW - 0.15, 14);
  ax.text(0.05, 0.45, "PLAYER", { size: 9.5, family: "display", color: T.INK_3, va: "center" });
  N.forEach((l, i) => ax.text(nameW + colW * (i + 0.5), 0.45, l.name.toUpperCase(), { size: 9.5, family: "display", color: T.INK_3, ha: "center", va: "center" }));
  ax.line(0, 0.1, W, 0.1, T.LINE, 0.8);
  table.forEach((r, i) => {
    const y = -i - 0.5;
    if (i % 2 === 1) ax.rbox(0, y - 0.46, W, 0.92, T.PANEL, 0.06);
    ax.text(0.05, y, r.name, { size, family: "display", color: T.INK, va: "center" });
    const best = Math.max(...r.cells.filter(Boolean).map(c => c.avgPts), -1);
    const many = r.cells.filter(Boolean).length > 1;
    r.cells.forEach((c, k) => {
      const x = nameW + colW * (k + 0.5);
      if (!c) { ax.text(x, y, "–", { size: 12, color: T.INK_3, ha: "center", va: "center" }); return; }
      ax.text(x, y + 0.09, fix(c.avgPts), { size: 15, family: "display", color: many && c.avgPts === best ? T.ACCENT : T.INK, ha: "center", va: "center" });
      ax.text(x, y - 0.18, `${c.avgGross === null ? "–" : fix(c.avgGross)}  ·  ${c.cards}`, { size: 8.5, color: T.INK_3, ha: "center", va: "center" });
    });
  });
  footer(fig, foot);
  return fig;
}

/**
 * One player of a league: their own shape, then the same readings for everyone else over exactly the
 * rounds they were both there for. `p` is one of St.players and carries `rest`, that comparison.
 */
export function statsPlayerPoster(St, p, group, T) {
  const R = p.rest;
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

  const width = 11.5, chartIn = p.played > 1 ? 2.4 : 0;
  const foot = (vs.length ? `${p.name} on the left of each track, everyone else in ${group.name} on the right, over exactly the ` +
    `${p.played} round${p.played === 1 ? "" : "s"} they were there for, so neither side is measured on a day the other missed. The track is filled ` +
    `in the proportion of the two figures, and the accent colour marks ${first}'s side when it is the better one, whichever direction the number runs. `
    : `${first} has not yet shared a round in this league with anyone else, so there is nothing to measure against. `) +
    (perHole ? "This league mixes nine- and eighteen-hole rounds, so the round chart counts points a hole. " : "") +
    "Only the league's own players count, so a guest never moves a figure.";
  const H = HEADER_IN + 0.18 + 0.95 + 0.15 + DIST_IN + (vs.length ? pairRowsHeight(vs.length) : 0)
    + (chartIn ? chartIn + 0.15 : 0) + footHeight(T, width, foot);
  const fig = new Fig(width, H, T);
  const right = [`${fix(p.avgPts)} points a round`,
    [p.wins ? `${p.wins} win${p.wins === 1 ? "" : "s"}` : "", p.avgPlace ? `${ordinal(Math.round(p.avgPlace))} on average in this league` : ""].filter(Boolean).join("  ·  ")];
  header(fig, p.name, group.name, `${p.played} round${p.played === 1 ? "" : "s"}  ·  ${p.holes} holes  ·  ${dateSpan(p.rounds)}`, right.filter(Boolean).join("\n"));
  let y = HEADER_IN + 0.18;
  y = tiles(fig, y, 0.95, [
    [p.played, `round${p.played === 1 ? "" : "s"}`],
    [fix(p.avgPts), "points a round", T.ACCENT],
    [p.bestPts === null ? "–" : p.bestPts, "best round"],
    [p.returns ? fmtToPar(Math.round(p.avgTopar)) : "–", "gross to par"],
    [`${share(parOrBetter(p.counts), p.holes)}%`, "par or better"],
  ]) + 0.15;
  y = distributionPanel(fig, y, p.counts, "Every hole in this league");
  if (vs.length) y = pairRows(fig, y, vs, { title: "Against the field", noteHead: `${first}  ·  the rest of the league`, labelW: 2.6 });
  if (chartIn) roundChart(fig, y, chartIn, p.rounds, perHole ? "Points a hole, round by round" : "Points round by round", perHole);
  footer(fig, foot);
  return fig;
}
