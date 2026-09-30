// How a poster is put together, as opposed to how its marks are drawn (draw.js).
//
// A poster hands over a list of BLOCKS and a bit of header text; the theme's family decides the rest --
// how wide the sheet is, whether the blocks run down it or flow in two columns, in what order, where the
// headline numbers sit and how much writing survives. One poster, ten pages. Nothing here knows what a
// Stableford point is: a block is a height and a draw call, and this only finds it somewhere to stand.
import { Fig, MARGIN, HEADER_IN, header, footer, footerWidth, drawMark, section, house, caps, prose, surface } from "./draw.js";

/** The sheets a family can ask for: how wide, in how many columns, and how far apart those columns sit. */
export const PAGES = {
  portrait: { w: 8.6, cols: 1, gap: 0 },      // a sheet of paper: narrow, and as long as it needs to be
  tall: { w: 11.5, cols: 1, gap: 0 },         // what every poster was before templates
  poster: { w: 13.0, cols: 1, gap: 0 },       // one column, but wide enough to set everything larger
  broad: { w: 14.0, cols: 2, gap: 0.55 },
  wide: { w: 16.5, cols: 2, gap: 0.62 },      // landscape: the clubhouse wall, or a screen
};

// The page a family falls back to when a poster cannot use the one it would have chosen: a single table
// has no business in two columns, and two boards meant to sit side by side have no business in one.
const AS_ONE = { portrait: "portrait", tall: "tall", poster: "poster", broad: "poster", wide: "poster" };
const AS_TWO = { portrait: "wide", tall: "wide", poster: "wide", broad: "broad", wide: "wide" };

/**
 * The sheet this poster gets. `minCols`/`maxCols` are the poster's own say in it -- how many columns its
 * content can bear -- and the family chooses freely inside that.
 */
export function pageOf(T, { minCols = 1, maxCols = 9 } = {}) {
  let key = PAGES[house(T).page] ? house(T).page : "tall";
  if (PAGES[key].cols > maxCols) key = AS_ONE[key];
  if (PAGES[key].cols < minCols) key = AS_TWO[key];
  return PAGES[key];
}
/** Row heights breathe or tighten with the family, so a sparse page is not just a tall one. */
export const dense = T => house(T).density || 1;

const GAP_Y = 0.16;
const HEAD_IN = 0.32;

/**
 * One piece of a poster.
 *
 *  `kind`  what it is, so a family that wants its charts first can say so without naming them: one of
 *          "tiles", "chart", "table", "note".
 *  `minW`  the narrowest column it will survive in. A block wider than the column it was flowed into
 *          takes a full-width row of its own instead, which is how a nine-column table stays readable
 *          on a two-column page.
 *  `h`     (widthIn, probe) -> inches. Called before the figure exists, so it may only measure.
 *  `draw`  (fig, xIn, topIn, widthIn) -> void.
 */
export const block = (kind, minW, h, draw) => ({ kind, minW, h, draw });

const FLOWS = { charts: ["tiles", "chart", "table", "note"], tables: ["tiles", "table", "chart", "note"] };

/** Re-orders by kind where the family asks for it, keeping the poster's own order inside each kind. */
function arrange(blocks, flow) {
  const rank = FLOWS[flow];
  if (!rank) return blocks;
  return blocks.map((b, i) => [b, i])
    .sort((a, b) => {
      const ra = rank.indexOf(a[0].kind), rb = rank.indexOf(b[0].kind);
      return (ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb) || a[1] - b[1];
    })
    .map(([b]) => b);
}

/** Runs of blocks that fit the columns, split by the ones too wide for them. */
function runs(blocks, colW) {
  const out = [];
  let run = [];
  for (const b of blocks) {
    if (b.minW > colW) {
      if (run.length) { out.push({ wide: false, blocks: run }); run = []; }
      out.push({ wide: true, blocks: [b] });
    } else run.push(b);
  }
  if (run.length) out.push({ wide: false, blocks: run });
  return out;
}

/**
 * Balances one run down `cols` columns. Reading order is kept: a column is filled until it has had its
 * share, then the next one starts, so the page still reads top to bottom, left to right.
 */
function place(run, cols, colW, gap, x0, y0, probe) {
  const hs = run.map(b => b.h(colW, probe));
  const target = hs.reduce((a, v) => a + v + GAP_Y, 0) / cols;
  const colH = new Array(cols).fill(0), placed = [];
  let c = 0;
  run.forEach((b, i) => {
    if (c < cols - 1 && colH[c] > 0 && colH[c] + (hs[i] + GAP_Y) / 2 > target) c++;
    placed.push([b, x0 + c * (colW + gap), y0 + colH[c], colW]);
    colH[c] += hs[i] + GAP_Y;
  });
  return { placed, height: Math.max(...colH) };
}

/** The headline numbers up in the header band, where the summary line would otherwise be. */
function headerTiles(fig, items) {
  const T = fig.T;
  let x = fig.w - MARGIN * fig.w;
  for (let i = items.length - 1; i >= 0; i--) {
    const [big, label, colr] = items[i];
    const w = Math.max(fig.measure(String(big), 20, "display"), fig.measure(caps(T, label), 7.5, "display"));
    fig.text(x, 0.38, String(big), { size: 20, family: "display", color: colr || T.INK, ha: "right", va: "top" });
    fig.text(x, 0.76, caps(T, label), { size: 7.5, family: "display", color: T.INK_3, ha: "right", va: "top" });
    x -= w + 0.34;
  }
}

/** An axes filling a block's rectangle, in whatever data units that block thinks in. */
export const blockAxes = (fig, x, topIn, w, hIn, xlim, ylim) =>
  fig.axes([x / fig.w, 1 - (topIn + hIn) / fig.h, w / fig.w, hIn / fig.h], xlim, ylim);

/** An axes where one unit is one inch and y runs down the page, for chrome that must keep its size. */
export const inchAxes = (fig, x, topIn, w, h) =>
  fig.axes([x / fig.w, 1 - (topIn + h) / fig.h, w / fig.w, h / fig.h], [0, w], [h, 0]);

/** A section title above a block, with an optional note at the right end of the same line. */
export function heading(fig, x, topIn, w, title, noteText = "") {
  const ax = inchAxes(fig, x, topIn, w, HEAD_IN);
  section(ax, 0, HEAD_IN / 2, title);
  if (noteText) ax.text(w, HEAD_IN / 2, noteText, { size: 9, color: fig.T.INK_3, ha: "right", va: "center" });
  return HEAD_IN;
}
export const headingIn = HEAD_IN;

// ---------------------------------------------------------------- the headline numbers
const TILE_H = 0.95;

/**
 * The readings a poster should be legible from across the room, in whichever shape the family wears them:
 * a row of panels, one thin strip, a list down the column, or -- handled by `sheet` rather than here --
 * up in the header band. `items` are [big, label, colour?].
 */
export function tilesBlock(T, items) {
  const style = house(T).tiles, d = dense(T);
  if (style === "strip") {
    return block("tiles", 3.2, () => 0.62 * d, (fig, x, y, w) => {
      surface(fig, x, y, w, 0.62 * d, 0.08);
      const step = w / items.length;
      items.forEach(([big, label, colr], i) => {
        const cx = x + step * (i + 0.5);
        if (i) fig.line(x + step * i, y + 0.12, x + step * i, y + 0.5 * d, fig.T.LINE, 0.8);
        const bw = fig.measure(String(big), 15, "display");
        fig.text(cx - bw / 2 - 0.06, y + 0.31 * d, String(big), { size: 15, family: "display", color: colr || fig.T.INK, ha: "right", va: "center" });
        fig.text(cx - bw / 2 + 0.02, y + 0.33 * d, label, { size: 8, color: fig.T.INK_3, va: "center" });
      });
    });
  }
  if (style === "list") {
    const rowIn = 0.34 * d;
    return block("tiles", 2.2, () => rowIn * items.length + 0.08, (fig, x, y, w) => {
      items.forEach(([big, label, colr], i) => {
        const yy = y + rowIn * (i + 0.5);
        fig.line(x, y + rowIn * (i + 1), x + w, y + rowIn * (i + 1), fig.T.LINE, 0.6);
        fig.text(x, yy, caps(fig.T, label), { size: 9, family: "display", color: fig.T.INK_3, va: "center" });
        fig.text(x + w, yy, String(big), { size: 17, family: "display", color: colr || fig.T.INK, ha: "right", va: "center" });
      });
    });
  }
  const hIn = TILE_H * d;
  return block("tiles", 3.2, () => hIn, (fig, x, y, w) => {
    const step = w / items.length;
    items.forEach(([big, label, colr], i) => {
      const bx = x + i * step;
      surface(fig, bx + 0.04, y, step - 0.08, hIn, 0.08);
      fig.text(bx + step / 2, y + hIn * 0.48, String(big), { size: 30, family: "display", color: colr || fig.T.INK, ha: "center", va: "center" });
      fig.text(bx + step / 2, y + hIn - 0.14, caps(fig.T, label), { size: 9, family: "display", color: fig.T.INK_3, ha: "center", va: "bottom" });
    });
  });
}

// ---------------------------------------------------------------- the sheet itself
/**
 * Draws one poster. `head` is { title, kicker, sub, right, foot, tiles }; `tiles` are the headline numbers,
 * which land in the header band or as the first block depending on the family. Blocks may be null, so a
 * poster can list a block it does not always have without guarding every entry.
 */
export function sheet(T, head, blocks, opts = {}) {
  const h = house(T), pg = pageOf(T, opts);
  // A poster whose content has a width of its own -- eighteen holes across, say -- widens the sheet rather
  // than shrinking to fit it. The family still decides the columns; only the paper grows.
  const w = Math.max(pg.w, (opts.minInner || 0) / (1 - 2 * MARGIN));
  const cols = pg.cols, gap = pg.gap;
  const M = MARGIN * w, inner = w - 2 * M;
  const colW = (inner - gap * (cols - 1)) / cols;
  const inHeader = head.tiles && head.tiles.length && h.tiles === "header";

  // `tilesWide` keeps the headline numbers out of the column flow, so the blocks under them still start
  // level with each other -- which is the whole point of a sheet with two boards on it.
  const tb = head.tiles && head.tiles.length && !inHeader ? tilesBlock(T, head.tiles) : null;
  const list = [...(tb ? [head.tilesWide ? { ...tb, minW: 99 } : tb] : []), ...blocks.filter(Boolean)];
  const groups = runs(arrange(list, h.flow), colW);

  const probe = new Fig(w, 1, T, 20);
  let body = 0;
  for (const g of groups) {
    body += g.wide ? g.blocks[0].h(inner, probe) + GAP_Y : place(g.blocks, cols, colW, gap, 0, 0, probe).height;
  }
  const foot = prose(T, head.foot);
  const footIn = foot ? 0.45 + 0.17 * (probe.wrap(foot, footerWidth(probe), 9).length - 1) : 0.34;
  const H = HEADER_IN + 0.18 + body + footIn;

  const fig = new Fig(w, H, T);
  header(fig, head.title, head.kicker, head.sub, inHeader ? null : head.right);
  if (inHeader) headerTiles(fig, head.tiles);
  let y = HEADER_IN + 0.18;
  for (const g of groups) {
    if (g.wide) {
      g.blocks[0].draw(fig, M, y, inner);
      y += g.blocks[0].h(inner, probe) + GAP_Y;
    } else {
      const r = place(g.blocks, cols, colW, gap, M, y, probe);
      for (const [b, bx, by, bw] of r.placed) b.draw(fig, bx, by, bw);
      y += r.height;
    }
  }
  if (foot) footer(fig, foot); else drawMark(fig, 0.14);
  return fig;
}
