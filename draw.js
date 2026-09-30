// Port of golf/theme.py to the HTML canvas: tokens, fonts and the shared drawing helpers.
// Everything is drawn in inches from the top-left corner; `Ax` maps matplotlib-style data axes onto that.
import { outcome } from "./model.js";

export const MARGIN = 0.045;
export const HEADER_IN = 1.62;
export const DPI = 200;

const loaded = new Set();

export async function loadFonts(fonts) {
  // Variable fonts register once with their whole weight range; the browser picks the instance per draw call.
  const jobs = [];
  for (const f of fonts) {
    if (loaded.has(f.family)) continue;
    const face = new FontFace(f.family, `url(${new URL(f.file, import.meta.url).href})`, { weight: f.weight, style: "normal" });
    document.fonts.add(face);
    jobs.push(face.load().then(() => loaded.add(f.family)).catch(e => console.warn("font", f.family, e)));
  }
  await Promise.all(jobs);
}

export function makeTheme(t) {
  const T = { ...t };
  T.OUTCOMES = [["Birdie or better", T.UNDER], ["Par", T.PAR], ["Bogey", T.BOGEY], ["Double or worse", T.DOUBLE]];
  derive(T);
  return T;
}

function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export const contrast = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// ---------------------------------------------------------------- mixing, so a theme can be asked for more colours
const chans = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hexa = c => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
/** `t` of b into a, straight in sRGB: close enough for a tint or a hairline, and it needs no colour library. */
export const mix = (a, b, t) => { const x = chans(a), y = chans(b); return hexa(x.map((v, i) => v + (y[i] - v) * t)); };

function toHsl(h) {
  const [r, g, b] = chans(h).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let hue = 0;
  if (d) hue = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}

function fromHsl(hue, sat, l) {
  const c = (1 - Math.abs(2 * l - 1)) * sat, hp = (((hue % 360) + 360) % 360) / 60, x = c * (1 - Math.abs(hp % 2 - 1));
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6];
  const m = l - c / 2;
  return hexa(t.map(v => (v + m) * 255));
}

/**
 * The tokens a theme file does not write down, mixed from the ones it does, so all hundred looks have them
 * in their own colours rather than in a colour borrowed from somewhere else. A theme that names any of
 * these keeps what it named: this only fills the gaps, exactly as build.py fills the screen's `ui` palette.
 *
 * `ACCENT_2` is the one that is invented rather than mixed -- the accent's hue turned most of the way round
 * the wheel, set at the lightness of the theme's own chart colour so it belongs to the same page, then
 * walked towards the ink until it clears the background. Everything else is a straight blend.
 */
const gap = (a, b) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return Math.min(d, 360 - d); };

function derive(T) {
  const dark = lum(T.BG) < 0.35;
  const put = (k, v) => { if (T[k] === undefined || T[k] === null) T[k] = v; };
  put("WASH", mix(T.BG, T.ACCENT, dark ? 0.18 : 0.10));     // a block's own surface, a breath of the accent
  put("WASH_2", mix(T.BG, T.BAR, dark ? 0.18 : 0.10));
  put("RULE_2", mix(T.LINE, T.INK_3, 0.45));                // a hairline one step stronger, for a grid
  if (!T.ACCENT_2) {
    const [hue, sat] = toHsl(T.ACCENT), [barHue, , barL] = toHsl(T.BAR);
    if (sat < 0.12) {
      T.ACCENT_2 = mix(T.BAR, T.INK, 0.45);   // a theme with no colour in its accent gets a step, not a hue
    } else {
      // The turn that lands furthest from BOTH the colours the theme already uses, so the third colour is
      // a third colour and not a second shade of the chart one.
      let best = null;
      for (const off of [155, 120, 190, 90, 225, 60, 260]) {
        const h = hue + off, score = Math.min(gap(h, hue), gap(h, barHue));
        if (!best || score > best.score) best = { h, score };
      }
      // knocked back in saturation and a touch towards the muted ink: the third colour has to be told
      // apart from the other two, not to shout over the accent the theme actually chose
      let c = mix(fromHsl(best.h, Math.max(0.26, sat * 0.7), barL), T.INK_3, 0.14);
      for (let k = 0; k < 8 && contrast(c, T.BG) < 2.6; k++) c = mix(c, T.INK, 0.12);
      T.ACCENT_2 = c;
    }
  }
  // Five chart colours in one order, for a chart whose rows are categories rather than a ranking. They stay
  // inside the two the theme already chose, stepped towards the page and towards the ink, because six rows
  // in six hues would say one of them is good and one of them is bad when neither is true. The outcome
  // colours are never in here either: those four mean score against par and nothing else, everywhere.
  put("SERIES", [T.ACCENT, T.BAR, mix(T.BAR, T.BG, 0.42), mix(T.ACCENT, T.BG, 0.45), mix(T.BAR, T.INK, 0.38)]);
}

export function on(T, fill) {
  return lum(fill) > 0.30 ? T.TEXT_ON_LIGHT : T.TEXT_ON_DARK;
}

// ---------------------------------------------------------------- the house style of a family
/**
 * A theme brings colour and type; its family brings a house style. The same poster, drawn by the same code, wears
 * a different rule under the title, a different podium chip, its own corner radius and its own way of separating
 * rows, so the ten collections are told apart at a glance without any of them stopping being the same poster.
 * Everything here is chrome: no number, no column and no scorecard glyph changes with the family.
 */
const CHROME = {
  club:      { rule: "double", chip: "pill",   radius: 1.3,  band: "tint", kicker: "caps", caps: true,  section: "tick" },
  broadcast: { rule: "slab",   chip: "square", radius: 0.15, band: "tint", kicker: "tag",  caps: true,  section: "under" },
  editor:    { rule: "thin",   chip: "box",    radius: 0.35, band: "rule", kicker: "text", caps: false, section: "tick" },
  seasons:   { rule: "line",   chip: "circle", radius: 1.6,  band: "tint", kicker: "text", caps: false, section: "plain" },
  print:     { rule: "dashed", chip: "bare",   radius: 0,    band: "rule", kicker: "caps", caps: false, section: "under" },
  retro:     { rule: "stub",   chip: "circle", radius: 1.9,  band: "tint", kicker: "tag",  caps: true,  section: "tick" },
  night:     { rule: "glow",   chip: "pill",   radius: 1.4,  band: "edge", kicker: "caps", caps: true,  section: "under" },
  minimal:   { rule: "hair",   chip: "bare",   radius: 0.25, band: "tint", kicker: "text", caps: true,  section: "plain" },
  colours:   { rule: "dots",   chip: "box",    radius: 1.7,  band: "tint", kicker: "tag",  caps: true,  section: "tick" },
  national:  { rule: "flags",  chip: "square", radius: 0.5,  band: "edge", kicker: "caps", caps: true,  section: "plain" },
};

/**
 * The other half of a family's house style: not how a shape is drawn but where it goes on the page.
 *
 *  `page`     the sheet itself -- how wide, and in how many columns the blocks flow (sheet.js PAGES)
 *  `flow`     the order blocks are laid in: as the poster listed them, charts before tables, or the other way
 *  `tiles`    where the headline numbers sit and what they look like: a row of panels, a thin strip, a list
 *             down the side, or up inside the header band where the summary text would otherwise be
 *  `surface`  what a block sits on: the panel tint, a wash of the accent, or nothing at all
 *  `palette`  one chart colour for every bar, one from SERIES per row, or the two accents alternating
 *  `prose`    how much writing survives: every word, the first two sentences, or none but the labels
 *  `legends`  whether a colour key is drawn next to a chart that has one
 *  `density`  a multiplier on row heights, so a sparse family breathes and a dense one fits more
 */
const LAYOUT = {
  club:      { page: "tall",     flow: "asis",        tiles: "row",    surface: "panel", palette: "one",    prose: "full",  legends: true,  density: 1 },
  broadcast: { page: "wide",     flow: "charts",      tiles: "header", surface: "panel", palette: "duo",    prose: "short", legends: true,  density: 0.95 },
  editor:    { page: "broad",    flow: "tables",      tiles: "list",   surface: "none",  palette: "series", prose: "full",  legends: true,  density: 0.92 },
  seasons:   { page: "portrait", flow: "charts",      tiles: "row",    surface: "wash",  palette: "series", prose: "full",  legends: true,  density: 1.08 },
  print:     { page: "portrait", flow: "tables",      tiles: "list",   surface: "none",  palette: "one",    prose: "full",  legends: true,  density: 1 },
  retro:     { page: "poster",   flow: "charts",      tiles: "row",    surface: "wash",  palette: "duo",    prose: "short", legends: true,  density: 1.12 },
  night:     { page: "wide",     flow: "charts",      tiles: "header", surface: "wash",  palette: "series", prose: "none",  legends: true,  density: 1 },
  minimal:   { page: "tall",     flow: "asis",        tiles: "strip",  surface: "none",  palette: "one",    prose: "none",  legends: false, density: 1.05 },
  colours:   { page: "broad",    flow: "charts",      tiles: "row",    surface: "wash",  palette: "series", prose: "short", legends: true,  density: 1 },
  national:  { page: "tall",     flow: "tables",      tiles: "row",    surface: "panel", palette: "duo",    prose: "full",  legends: true,  density: 1 },
};

const HOUSE = Object.fromEntries(Object.keys(CHROME).map(k => [k, { ...CHROME[k], ...LAYOUT[k] }]));
const PLAIN = { rule: "line", chip: "box", radius: 1, band: "tint", kicker: "caps", caps: true, section: "plain",
  page: "tall", flow: "asis", tiles: "row", surface: "panel", palette: "one", prose: "full", legends: true, density: 1 };

/** The house style a theme draws in. A theme with no family, or one this build does not know, gets the plain one. */
export const house = T => (T && HOUSE[T.family]) || PLAIN;
/** Upper case where the family sets its titles in caps, as typed where it does not. */
export const caps = (T, s) => house(T).caps ? String(s).toUpperCase() : String(s);

/**
 * How much of a written explanation this family keeps. `full` is every word, `short` its first two
 * sentences -- the rule and nothing else -- and `none` drops it, leaving the labels to do the work.
 * The first sentence of every footer in this app says the rule, which is what makes the cut safe.
 */
export function prose(T, text) {
  const level = house(T).prose;
  if (!text || level === "none") return "";
  if (level !== "short") return text;
  const m = String(text).match(/^[\s\S]*?\.(?:\s+[\s\S]*?\.)?(?=\s|$)/);
  return m ? m[0].trim() : text;
}

/** A small note beside a chart or a column head: dropped by the families that keep no prose. */
export const note = (T, s) => house(T).prose === "none" ? "" : s;

/** The colour a chart row takes: one series colour for everything, one each, or the two accents in turn. */
export function seriesColor(T, i, good) {
  const p = house(T).palette;
  if (good !== undefined) return good ? T.ACCENT : T.BAR;        // a comparison always reads accent-good
  if (p === "series") return T.SERIES[i % T.SERIES.length];
  if (p === "duo") return i % 2 ? T.ACCENT_2 : T.BAR;
  return T.BAR;
}

/** What a block of a poster sits on: the panel tint, a wash of the accent, or the page itself. */
export function surface(fig, x, y, w, h, r = 0.1) {
  const s = house(fig.T).surface;
  if (s === "none") return;
  fig.rbox(x, y, w, h, s === "wash" ? fig.T.WASH : fig.T.PANEL, r);
}

export class Fig {
  constructor(wIn, hIn, T, dpi = DPI) {
    this.w = wIn;
    this.h = hIn;
    this.T = T;
    this.dpi = dpi;
    const W = Math.round(wIn * dpi), H = Math.round(hIn * dpi);
    this.canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
    this.ctx = this.canvas.getContext("2d");
    this.ctx.fillStyle = T.BG;
    this.ctx.fillRect(0, 0, W, H);
    this.ctx.lineJoin = "round";
  }

  px(v) { return v * this.dpi; }

  font(size, family = "text", weight) {
    const T = this.T;
    const fam = family === "display" ? T.DISPLAY : T.TEXT;
    const w = weight ?? (family === "display" ? T.DISPLAY_WEIGHT : T.TEXT_WEIGHT);
    return `${w} ${(size / 72 * this.dpi).toFixed(2)}px "${fam}"`;
  }

  /** Width of a string in inches at `size` points. */
  measure(s, size, family = "text", weight) {
    this.ctx.font = this.font(size, family, weight);
    return this.ctx.measureText(s).width / this.dpi;
  }

  /** Text at (x, y) inches. ha left|center|right; va top|center|bottom|baseline, centring on the ink like matplotlib. */
  text(x, y, s, { size = 10, family = "text", weight, color, ha = "left", va = "baseline", alpha = 1, lineSpacing = 1.5 } = {}) {
    const ctx = this.ctx;
    const lines = String(s).split("\n");
    ctx.font = this.font(size, family, weight);
    ctx.fillStyle = color || this.T.INK;
    ctx.globalAlpha = alpha;
    ctx.textAlign = ha === "left" ? "left" : ha === "right" ? "right" : "center";
    ctx.textBaseline = "alphabetic";
    const lh = size / 72 * lineSpacing;
    const total = lh * (lines.length - 1);
    let width = 0;
    lines.forEach((line, i) => {
      const m = ctx.measureText(line);
      width = Math.max(width, m.width / this.dpi);
      const asc = m.actualBoundingBoxAscent / this.dpi, desc = m.actualBoundingBoxDescent / this.dpi;
      let base;
      if (va === "top") base = y + asc + i * lh;
      else if (va === "bottom") base = y - desc - total + i * lh;
      else if (va === "center") base = y + (asc - desc) / 2 - total / 2 + i * lh;
      else base = y + i * lh;
      ctx.fillText(line, this.px(x), this.px(base));
    });
    ctx.globalAlpha = 1;
    return width;
  }

  /** Shrinks the size until the text fits maxW inches. */
  fitText(x, y, s, maxW, size, minSize, opts) {
    this.text(x, y, s, { ...opts, size: this.fitOne(s, maxW, size, minSize, opts) });
    return size;
  }

  /**
   * The largest size at or under `size` that draws `s` inside `maxW` inches, in half-point steps. Nothing
   * below `minSize`: a caption set at four points is no more readable than one that ran over the edge, so a
   * caller that cannot make its text fit should shorten it rather than shrink it further.
   */
  fitOne(s, maxW, size, minSize = 6.5, { family = "text", weight } = {}) {
    while (size > minSize && this.measure(s, size, family, weight) > maxW) size -= 0.5;
    return size;
  }

  /** One size at which every name in a column fits, so the table does not look ragged. */
  fitSize(names, maxW, size, minSize = 6.5, family = "display") {
    for (const s of names) while (size > minSize && this.measure(s, size, family) > maxW) size -= 0.5;
    return size;
  }

  rbox(x, y, w, h, fc, r = 0.06, { ec = null, lw = 0, alpha = 1 } = {}) {
    const ctx = this.ctx;
    if (w < 0) { x += w; w = -w; }  // inverted axes hand over negative sizes
    if (h < 0) { y += h; h = -h; }
    const R = Math.min(this.px(r * house(this.T).radius), this.px(w) / 2, this.px(h) / 2);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    roundRectPath(ctx, this.px(x), this.px(y), this.px(w), this.px(h), Math.max(0, R));
    if (fc && fc !== "none") { ctx.fillStyle = fc; ctx.fill(); }
    if (ec && lw) { ctx.strokeStyle = ec; ctx.lineWidth = lw / 72 * this.dpi; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  line(x0, y0, x1, y1, color, lw = 1, dash = null) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw / 72 * this.dpi;
    ctx.setLineDash(dash ? dash.map(d => d / 72 * this.dpi) : []);
    ctx.moveTo(this.px(x0), this.px(y0));
    ctx.lineTo(this.px(x1), this.px(y1));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  disc(cx, cy, d, fc) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.fillStyle = fc;
    ctx.arc(this.px(cx), this.px(cy), this.px(d / 2), 0, Math.PI * 2);
    ctx.fill();
  }

  circle(cx, cy, d, ec, lw) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = ec;
    ctx.lineWidth = lw / 72 * this.dpi;
    ctx.arc(this.px(cx), this.px(cy), this.px(d / 2), 0, Math.PI * 2);
    ctx.stroke();
  }

  square(cx, cy, s, ec, lw) {
    const ctx = this.ctx;
    ctx.strokeStyle = ec;
    ctx.lineWidth = lw / 72 * this.dpi;
    ctx.strokeRect(this.px(cx - s / 2), this.px(cy - s / 2), this.px(s), this.px(s));
  }

  /** matplotlib-style axes: rect [left, bottom, width, height] in figure fractions, data limits. */
  axes(rect, xlim = [0, 1], ylim = [0, 1]) {
    return new Ax(this, rect, xlim, ylim);
  }

  /** Word wrap to a width in inches at a size in points. */
  wrap(text, widthIn, size, family = "text") {
    const words = text.split(/\s+/), lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (cur && this.measure(t, size, family) > widthIn) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  async toBlob() {
    if (this.canvas.convertToBlob) return this.canvas.convertToBlob({ type: "image/png" });
    return new Promise(res => this.canvas.toBlob(res, "image/png"));
  }
}

/** ctx.roundRect arrived in iOS 16; older Safari gets the same shape from arcTo. */
function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) return ctx.roundRect(x, y, w, h, r);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Ax {
  constructor(fig, rect, xlim, ylim) {
    this.fig = fig;
    const [l, b, w, h] = rect;
    this.x0 = l * fig.w;
    this.wIn = w * fig.w;
    this.yTop = (1 - b - h) * fig.h;
    this.hIn = h * fig.h;
    this.xlim = xlim;
    this.ylim = ylim;
  }

  X(xd) { return this.x0 + (xd - this.xlim[0]) / (this.xlim[1] - this.xlim[0]) * this.wIn; }
  Y(yd) { return this.yTop + (this.ylim[1] - yd) / (this.ylim[1] - this.ylim[0]) * this.hIn; }
  DX(d) { return d / (this.xlim[1] - this.xlim[0]) * this.wIn; }
  DY(d) { return d / (this.ylim[1] - this.ylim[0]) * this.hIn; }
  /** Inches back into data units, so a chrome detail keeps one size on paper whatever the axes hold. */
  UX(inches) { return Math.abs(inches / this.wIn * (this.xlim[1] - this.xlim[0])); }
  UY(inches) { return Math.abs(inches / this.hIn * (this.ylim[1] - this.ylim[0])); }
  /** +1 or -1: which way down the page is, since a scorecard's y axis runs the other way. */
  down() { return this.ylim[1] > this.ylim[0] ? -1 : 1; }

  text(xd, yd, s, opts) { return this.fig.text(this.X(xd), this.Y(yd), s, opts); }
  /** The same, shrunk to fit `maxWd` data units, so a long caption never leaves the box it labels. */
  fitText(xd, yd, s, maxWd, opts = {}) {
    const size = this.fig.fitOne(s, Math.abs(this.DX(maxWd)), opts.size ?? 10, opts.min ?? 6.5, opts);
    return this.fig.text(this.X(xd), this.Y(yd), s, { ...opts, size });
  }
  textWidth(s, size, family = "text") { return this.fig.measure(s, size, family) / this.wIn * (this.xlim[1] - this.xlim[0]); }
  /** Box from data coordinates (x, y bottom-left, w, h) as matplotlib draws it. */
  rbox(xd, yd, wd, hd, fc, r = 0.12, opts) {
    const rIn = Math.min(Math.abs(this.DX(r)), Math.abs(this.DY(r)));
    this.fig.rbox(this.X(xd), this.Y(yd + hd), this.DX(wd), this.DY(hd), fc, rIn, opts);
  }
  line(x0, y0, x1, y1, color, lw = 1, dash = null) { this.fig.line(this.X(x0), this.Y(y0), this.X(x1), this.Y(y1), color, lw, dash); }
  fitSize(names, maxWd, size, minSize = 6.5, family = "display") { return this.fig.fitSize(names, this.DX(maxWd), size, minSize, family); }
}

// ---------------------------------------------------------------- figure chrome, as theme.py
/** The small line above the title: accent caps, a quiet line in the text face, or a filled accent tag. */
export function kicker(fig, x, y, s) {
  const T = fig.T, k = house(T).kicker;
  if (k === "text") return void fig.text(x, y - 0.01, s, { size: 11, color: T.ACCENT, va: "top" });
  if (k === "tag") {
    const w = fig.measure(s.toUpperCase(), 9, "display") + 0.17;
    fig.rbox(x, y - 0.02, w, 0.20, T.ACCENT, 0.03);
    fig.text(x + 0.085, y + 0.08, s.toUpperCase(), { size: 9, family: "display", color: on(T, T.ACCENT), va: "center" });
    return;
  }
  fig.text(x, y, s.toUpperCase(), { size: 12, family: "display", color: T.ACCENT, va: "top" });
}

/** The rule that closes the header: one per family, and the quickest way to see which collection a sheet is from. */
export function headerRule(fig, y) {
  const T = fig.T, M = MARGIN * fig.w, R = fig.w - M;
  switch (house(T).rule) {
    case "double": fig.line(M, y, R, y, T.ACCENT, 1.6); fig.line(M, y + 0.055, R, y + 0.055, T.LINE, 0.9); break;
    case "slab": fig.rbox(M, y - 0.035, R - M, 0.075, T.ACCENT, 0.008); break;
    case "dashed": fig.line(M, y, R, y, T.ACCENT, 1.4, [7, 4]); break;
    case "dots": fig.line(M, y, R, y, T.ACCENT, 2.2, [0.9, 4.5]); break;
    case "stub": fig.rbox(M, y - 0.05, 1.15, 0.1, T.ACCENT, 0.008); fig.line(M + 1.28, y, R, y, T.LINE, 1.0); break;
    case "glow": fig.rbox(M, y - 0.06, R - M, 0.12, T.ACCENT, 0.02, { alpha: 0.18 }); fig.line(M, y, R, y, T.ACCENT, 1.6); break;
    case "hair": fig.line(M, y, R, y, T.INK_3, 0.7); break;
    case "thin": fig.line(M, y, R, y, T.ACCENT, 1.0); break;
    // three bands the width of a flag, in the theme's own three
    case "flags": { const seg = (R - M) / 3; [T.ACCENT, T.INK_3, T.BAR].forEach((c, i) => fig.rbox(M + i * seg, y - 0.03, seg - 0.04, 0.06, c, 0.006)); break; }
    default: fig.line(M, y, R, y, T.ACCENT, 1.6);
  }
}

export function header(fig, title, kick, sub, right = null) {
  const T = fig.T, M = MARGIN * fig.w;
  kicker(fig, M, 0.30, kick);
  fig.text(M, 0.52, caps(T, title), { size: 30, family: "display", color: T.INK, va: "top" });
  fig.text(M, 1.08, sub, { size: 10, color: T.INK_3, va: "top" });
  if (right) fig.text(fig.w - M, 0.34, right, { size: 10.5, color: T.INK_2, va: "top", ha: "right", lineSpacing: 1.6 });
  headerRule(fig, 1.42);
  return 1.42;
}

// The mark a free render carries, bottom right. One definition, so a poster and a card wear it identically.
export const MARK = "hagolf.app";
const MARK_SIZE = 8;

// Whether renders carry the mark at all. Paying removes it; the app sets this from what the account holds, once,
// rather than every poster and card asking. On until told otherwise, so a phone with no account is marked.
let MARK_ON = true;
let MARK_TEXT = MARK;   // a club's members carry the club's name here instead
export function setMarked(on) { MARK_ON = !!on; }
export function setMarkText(text) { MARK_TEXT = String(text || MARK).slice(0, 40); }
export const marked = () => MARK_ON;

/** Draws the mark with its baseline block ending `inchesFromBottom` up from the bottom edge. */
export function drawMark(fig, inchesFromBottom = 0.28) {
  if (!MARK_ON) return;
  fig.text(fig.w - MARGIN * fig.w, fig.h - inchesFromBottom, MARK_TEXT,
    { size: MARK_SIZE, family: "display", color: fig.T.INK_3, ha: "right", va: "bottom", alpha: 0.8 });
}

/** Width the footer text may use: the mark sits at the right end of the same line, so it is wrapped clear of it. */
export function footerWidth(fig, mark = MARK_ON) {
  return fig.w * (1 - 2 * MARGIN) - (mark ? fig.measure(MARK_TEXT, MARK_SIZE, "display") + 0.18 : 0);
}

export function footer(fig, text, inchesFromBottom = 0.28, mark = MARK_ON) {
  const M = MARGIN * fig.w;
  const lines = fig.wrap(text, footerWidth(fig, mark), 9);
  fig.text(M, fig.h - inchesFromBottom, lines.join("\n"), { size: 9, color: fig.T.INK_3, va: "bottom", lineSpacing: 1.5 });
  if (mark) drawMark(fig, inchesFromBottom);
  return lines.length;
}

export function footerLines(fig, text, mark = true) {
  return fig.wrap(text, footerWidth(fig, mark), 9).length;
}

export function section(ax, x, y, title, size = 12) {
  const T = ax.fig.T, mark = house(T).section, s = caps(T, title);
  let x0 = x;
  if (mark === "tick") {
    const w = ax.UX(0.05), t = ax.UY(size / 72 * 0.8);
    ax.rbox(x, y - t / 2, w, t, T.ACCENT, 0);
    x0 = x + w * 2.4;
  }
  ax.text(x0, y, s, { size, family: "display", color: T.ACCENT, va: "center" });
  if (mark === "under") ax.rbox(x0, y + ax.down() * ax.UY(0.1), ax.textWidth(s, size, "display"), ax.UY(0.018), T.ACCENT, 0);
}

// ---------------------------------------------------------------- drawing helpers
/** Gold, silver and bronze mark the podium in every family; what the medal is drawn on is the family's own. */
export function posChip(ax, x, y, place, size = 1.0, fontsize = 13) {
  const T = ax.fig.T, shape = house(T).chip;
  if (place === null || place === undefined) {
    ax.text(x, y, "NR", { size: fontsize - 1, family: "display", color: T.INK_3, ha: "center", va: "center" });
    return;
  }
  const fc = { 1: T.ACCENT, 2: T.SILVER, 3: T.BRONZE }[place];
  if (!fc) {
    ax.text(x, y, String(place), { size: fontsize, family: "display", color: T.INK_2, ha: "center", va: "center" });
    return;
  }
  if (shape === "bare") {   // no chip at all: the number itself takes the medal, over a short rule of it
    ax.text(x, y, String(place), { size: fontsize + 1, family: "display", color: fc, ha: "center", va: "center" });
    const w = ax.UX(0.14);
    ax.rbox(x - w / 2, y + ax.down() * ax.UY(0.125), w, ax.UY(0.022), fc, 0);
    return;
  }
  if (shape === "circle" || shape === "square") {   // drawn square on paper, so the axes' own scale cannot stretch it
    const d = Math.min(Math.abs(ax.DY(size * 0.76)), Math.abs(ax.DX(size * 0.9)));
    const cx = ax.X(x), cy = ax.Y(y);
    if (shape === "circle") ax.fig.disc(cx, cy, d, fc);
    else ax.fig.rbox(cx - d / 2, cy - d / 2, d, d, fc, 0);
  } else {
    ax.rbox(x - size * 0.5, y - size * 0.36, size, size * 0.72, fc, shape === "pill" ? size : 0.1);
  }
  ax.text(x, y, String(place), { size: fontsize, family: "display", color: on(T, fc), ha: "center", va: "center" });
}

/**
 * What a table puts behind row `i`: the tinted band every other row, a hairline under every row, the band with an
 * accent edge, or nothing at all. `y` and `h` are the row's box in data units, where the tint was drawn before.
 */
export function rowBand(ax, x, y, w, h, i, r = 0.08) {
  const T = ax.fig.T, band = house(T).band;
  if (band === "none") return;
  if (band === "rule") return void ax.line(x, y, x + w, y, T.LINE, 0.6);
  if (i % 2 !== 1) return;
  ax.rbox(x, y, w, h, T.PANEL, r);
  if (band === "edge") ax.rbox(x, y, ax.UX(0.05), h, T.ACCENT, 0, { alpha: 0.7 });
}

export function outcomeBar(ax, x, y, w, h, counts, total, gap = 0.04, label = true, fontsize = 8.5) {
  const T = ax.fig.T;
  const unit = w / total;
  let cx = x;
  T.OUTCOMES.forEach(([, col], k) => {
    const c = counts[k];
    if (c <= 0) return;
    const seg = unit * c;
    ax.rbox(cx + gap / 2, y, seg - gap, h, col, 0.05);
    // A sliver one hole wide has no room for its own count, and a "1" hanging over the segments either side
    // of it is worse than no label at all: the share is written under the bar anyway.
    const size = seg > 2.2 * gap + 0.25 ? fontsize : fontsize - 1.5;
    if (label && ax.textWidth(String(c), size, "display") <= seg - gap) {
      ax.text(cx + seg / 2, y + h / 2, String(c), { size, family: "display", color: on(T, col), ha: "center", va: "center" });
    }
    cx += seg;
  });
}

export function legend(ax, x, y, items, fontsize = 8, sw = 0.028, sh = 0.018, pad = 0.02, color = null) {
  const T = ax.fig.T;
  for (const [name, col] of items) {
    ax.rbox(x, y - sh / 2, sw, sh, col, 0.004);
    ax.text(x + sw * 1.4, y, name, { size: fontsize, color: color || T.INK_3, va: "center" });
    x = x + sw * 1.4 + ax.textWidth(name, fontsize) + pad;
  }
}

/** Scorecard notation. `cell` is the glyph size in x data units; glyphs are drawn square in inches. */
export function scoreGlyph(ax, x, y, cell, delta, text, fontsize = 15, lw = 1.6, ink = null) {
  const T = ax.fig.T, fig = ax.fig;
  const col = T.OUTCOMES[outcome(delta)][1];
  const cx = ax.X(x), cy = ax.Y(y), cellIn = ax.DX(cell);
  if (delta < 0) {
    for (let k = 0; k < (delta <= -2 ? 2 : 1); k++) fig.circle(cx, cy, cellIn * (0.68 + 0.18 * k), col, lw);
  } else if (delta > 0) {
    for (let k = 0; k < (delta >= 2 ? 2 : 1); k++) fig.square(cx, cy, cellIn * (0.66 + 0.18 * k), col, lw);
  }
  if (text) fig.text(cx, cy, text, { size: fontsize, family: "display", color: ink || T.INK, ha: "center", va: "center" });
}

export function glyphLegend(ax, x, y, cell = 0.6, fontsize = 8, step = null, par = 4) {
  const T = ax.fig.T;
  const items = [[-2, "eagle or better"], [-1, "birdie"], [0, "par"], [1, "bogey"], [2, "double or worse"]];
  for (const [d, name] of items) {
    scoreGlyph(ax, x, y, cell, d, String(par + d), fontsize + 1, 1.2, T.INK_2);
    ax.text(x + cell * 0.75, y, name, { size: fontsize, color: T.INK_3, va: "center" });
    x = x + cell * 0.75 + ax.textWidth(name, fontsize) + (step || cell * 0.9);
  }
}
