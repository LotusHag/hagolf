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

/**
 * A theme from the build's list: `name:dark` for its dark version, a retired name for the theme it became. `dark`
 * forces a version; otherwise a pinned one holds, and an unpinned name takes `phoneDark`.
 */
export function pickTheme(data, ref, dark = null, phoneDark = false) {
  const [name, pinned] = String((data.retired && data.retired.themes[ref]) || ref).split(":");
  const base = data.themes.find(t => t.name === name);
  if (!base) return null;
  return dark ?? (pinned ? pinned === "dark" : phoneDark) ? { ...base, ...base.dark, mode: "dark" } : base;
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
 * The tokens a theme file does not write down, mixed from the ones it does, so every theme has them
 * in their own colours rather than in a colour borrowed from somewhere else. A theme that names any of
 * these keeps what it named: this only fills the gaps, exactly as build.py fills the screen's `ui` palette.
 *
 * `ACCENT_2` is the one that is invented rather than mixed -- the accent's hue turned a short way round the
 * wheel, set at the lightness of the theme's own chart colour so it belongs to the same page, then walked
 * towards the ink until it clears the background. Everything else is a straight blend.
 */
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
      // A neighbour of the accent, turned the way that leads away from the chart colour rather than across
      // the wheel: the far side of a gold-and-blue theme is a magenta that belongs to neither of them,
      // where a neighbour is still the theme's own colour and is told apart from the bars by being warm
      // where they are cool, or cool where they are warm.
      const side = ((((hue - barHue) % 360) + 360) % 360) < 180 ? 1 : -1;
      // knocked back in saturation and a touch towards the muted ink: the third colour has to be told
      // apart from the other two, not to shout over the accent the theme actually chose
      let c = mix(fromHsl(hue + side * 40, Math.max(0.26, sat * 0.7), barL), T.INK_3, 0.14);
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

// The hand-operated board's own colours, the same in both versions of the theme that draws on it
const BOARD = { cell: "#FBFAF4", ink: "#1A1A1A", under: "#C8102E", over: "#006747" };

export function on(T, fill) {
  return lum(fill) > 0.30 ? T.TEXT_ON_LIGHT : T.TEXT_ON_DARK;
}

// ---------------------------------------------------------------- the house style of a theme
// A theme brings colour, type and a house style, in its file's HOUSE: the rule under the title, the podium chip, the
// corner radius, how rows are separated, how a score against par is marked, and where everything goes on the page
// (`page`, `flow`, `tiles`, `surface`, `palette`, `prose`, `legends`, `density`; sheet.js carries those out).
// STYLEGUIDE.md lists every value. Anything a theme leaves out is drawn the plain way.
const PLAIN = { rule: "line", chip: "box", radius: 1, band: "tint", kicker: "caps", caps: true, section: "plain", glyph: "classic",
  page: "tall", flow: "asis", tiles: "row", surface: "panel", palette: "one", prose: "full", legends: true, density: 1 };
const HOUSES = new WeakMap();

export const house = T => {
  const own = (T && T.HOUSE) || PLAIN;
  if (!HOUSES.has(own)) {
    const h = { ...PLAIN, ...own };
    // a phone has no room beside the title for headline figures, nor beside each figure in a strip for its label
    HOUSES.set(own, [h, { ...h, page: "phone", tiles: h.tiles === "header" || h.tiles === "strip" ? "row" : h.tiles }]);
  }
  return HOUSES.get(own)[isPhone(T) ? 1 : 0];
};
const isDark = T => lum(T.BG) < 0.2;

// The phone version: 1080 px at the poster DPI, about a CSS pixel per point, so type floors are 9, 11 and 14 pt.
export const PHONE_W = 5.4;
export const phone = T => ({ ...T, PHONE: true });
export const isPhone = T => !!(T && T.PHONE);
/** Upper case where the theme sets its titles in caps, as typed where it does not. */
export const caps = (T, s) => house(T).caps ? String(s).toUpperCase() : String(s);

/**
 * How much of a written explanation this theme keeps. `full` is every word, `short` its first two
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

/** A small note beside a chart or a column head: dropped by the themes that keep no prose. */
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
    if (house(T).grid) {
      const g = mix(T.BG, T.ACCENT, isDark(T) ? 0.12 : 0.08);
      for (let x = 0.2; x < wIn; x += 0.2) this.line(x, 0, x, hIn, g, 0.5);
      for (let y = 0.2; y < hIn; y += 0.2) this.line(0, y, wIn, y, g, 0.5);
    }
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

  /** Shrinks the size until the text fits maxW inches, and cuts it short with an ellipsis if the floor is not enough. */
  fitText(x, y, s, maxW, size, minSize, opts) {
    const at = this.fitOne(s, maxW, size, minSize, opts);
    this.text(x, y, this.clip(s, maxW, at, opts), { ...opts, size: at });
    return size;
  }

  /** `s` as it is if it fits `maxW` inches, otherwise as much of it as fits followed by an ellipsis. */
  clip(s, maxW, size, { family = "text", weight } = {}) {
    s = String(s);
    if (!s || this.measure(s, size, family, weight) <= maxW) return s;
    let n = s.length;
    while (n > 0 && this.measure(s.slice(0, n).trimEnd() + "…", size, family, weight) > maxW) n--;
    return n ? s.slice(0, n).trimEnd() + "…" : "";
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

  /** A filled (and optionally stroked) polygon through points given in inches. */
  poly(pts, fc, { ec = null, lw = 0, alpha = 1 } = {}) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(this.px(x), this.px(y)) : ctx.moveTo(this.px(x), this.px(y)));
    ctx.closePath();
    if (fc && fc !== "none") { ctx.fillStyle = fc; ctx.fill(); }
    if (ec && lw) { ctx.strokeStyle = ec; ctx.lineWidth = lw / 72 * this.dpi; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  disc(cx, cy, d, fc) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.fillStyle = fc;
    ctx.arc(this.px(cx), this.px(cy), this.px(d / 2), 0, Math.PI * 2);
    ctx.fill();
  }

  circle(cx, cy, d, ec, lw, dash = null) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = ec;
    ctx.lineWidth = lw / 72 * this.dpi;
    ctx.setLineDash(dash ? dash.map(v => v / 72 * this.dpi) : []);
    ctx.arc(this.px(cx), this.px(cy), this.px(d / 2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
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
    const w = Math.abs(this.DX(maxWd)), size = this.fig.fitOne(s, w, opts.size ?? 10, opts.min ?? 6.5, opts);
    return this.fig.text(this.X(xd), this.Y(yd), this.fig.clip(s, w, size, opts), { ...opts, size });
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
export function kicker(fig, x, y, s, maxW = fig.w - x - MARGIN * fig.w) {
  const T = fig.T, k = house(T).kicker;
  s = brandKick(s);
  if (k === "text") return void fig.text(x, y - 0.01, fig.clip(s, maxW, 11), { size: 11, color: T.ACCENT, va: "top" });
  if (k === "tag" || k === "tag2" || k === "slant") {
    const fill = k === "tag2" ? T.ACCENT_2 : T.ACCENT, lean = k === "slant" ? 0.06 : 0;
    s = fig.clip(s.toUpperCase(), maxW - 0.17 - 2 * lean, 9, { family: "display" });
    const w = fig.measure(s, 9, "display") + 0.17 + 2 * lean;
    if (lean) fig.poly([[x + lean, y - 0.02], [x + w, y - 0.02], [x + w - lean, y + 0.18], [x, y + 0.18]], fill);
    else fig.rbox(x, y - 0.02, w, 0.20, fill, 0.03);
    fig.text(x + 0.085 + lean, y + 0.08, s, { size: 9, family: "display", color: on(T, fill), va: "center" });
    return;
  }
  // engraved: spaced capitals in the gilt
  if (k === "caps2") return void fig.text(x, y, fig.clip([...s.toUpperCase()].join("\u200A"), maxW, 12, { family: "display" }), { size: 12, family: "display", color: T.ACCENT_2, va: "top" });
  fig.text(x, y, fig.clip(s.toUpperCase(), maxW, 12, { family: "display" }), { size: 12, family: "display", color: T.ACCENT, va: "top" });
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
    case "bar2": fig.rbox(M, y - 0.045, R - M, 0.09, T.ACCENT_2, 0); break;
    case "press": fig.line(M, y - 0.02, R, y - 0.02, T.INK, 3.2); fig.line(M, y + 0.05, R, y + 0.05, T.INK, 0.9); break;
    case "heavy": fig.rbox(M, y - 0.05, R - M, 0.1, T.INK, 0); break;
    case "gilt": fig.line(M, y - 0.025, R, y - 0.025, T.ACCENT_2, 0.9); fig.line(M, y + 0.025, R, y + 0.025, T.ACCENT_2, 0.9); break;
    // three bands, orange, mustard and teal, the clubhouse carpet
    case "stripes": [T.ACCENT, T.UNDER, T.ACCENT_2].forEach((c, i) => fig.rbox(M, y - 0.085 + i * 0.06, R - M, 0.045, c, 0.01)); break;
    // a woven sett: the ground, a wide stripe and a fine overcheck, repeated across
    case "tartan": {
      fig.rbox(M, y - 0.07, R - M, 0.14, T.ACCENT_2, 0);
      for (let x = M; x < R; x += 0.24) {
        fig.rbox(x + 0.06, y - 0.07, Math.min(0.1, R - x - 0.06), 0.14, T.ACCENT, 0);
        if (x + 0.21 < R) fig.rbox(x + 0.19, y - 0.07, 0.02, 0.14, T.UNDER, 0);
      }
      fig.rbox(M, y - 0.012, R - M, 0.024, T.UNDER, 0, { alpha: 0.75 });
      break;
    }
    case "skew": {
      const e = M + (R - M) * 0.3;
      fig.poly([[M, y + 0.04], [M + 0.05, y - 0.04], [e + 0.05, y - 0.04], [e, y + 0.04]], T.ACCENT);
      fig.line(e + 0.1, y + 0.02, R, y + 0.02, T.LINE, 1.0);
      break;
    }
    // a dimension line: ticks at both ends and the architect's slashes where it meets them
    case "dimension": {
      fig.line(M, y, R, y, T.INK_3, 0.8);
      for (const x of [M, R]) { fig.line(x, y - 0.07, x, y + 0.07, T.INK_3, 0.8); fig.line(x - 0.04, y + 0.04, x + 0.04, y - 0.04, T.INK_3, 1.4); }
      break;
    }
    case "neon": {
      const ctx = fig.ctx, g = ctx.createLinearGradient(fig.px(M), 0, fig.px(R), 0);
      g.addColorStop(0, T.ACCENT); g.addColorStop(1, T.ACCENT_2);
      if (isDark(T)) { ctx.shadowColor = T.ACCENT; ctx.shadowBlur = fig.px(0.08); }
      fig.line(M, y, R, y, g, 2.4);
      ctx.shadowBlur = 0;
      break;
    }
    default: fig.line(M, y, R, y, T.ACCENT, 1.6);
  }
}

/** What the phone header sets under its title: the sub and then the right-hand text, each wrapped to the page. */
function phoneLines(fig, sub, right) {
  const W = fig.w * (1 - 2 * MARGIN);
  const wrapped = s => String(s).split("\n").filter(Boolean).flatMap(l => fig.wrap(l, W, 10));
  // a partner's date gets a line of its own rather than breaking across two
  const d = BRAND && BRAND.date && `${DATE_SEP}${BRAND.date}`;
  if (d && sub && String(sub).endsWith(d)) sub = `${String(sub).slice(0, -d.length)}\n${BRAND.date}`;
  return [...(sub ? wrapped(sub) : []), ...(right ? wrapped(right) : [])];
}
const PHONE_LINE = 10 / 72 * 1.5;

/** How tall the header band is, rule included, before the figure exists: `probe` only measures. */
export const headerIn = (probe, sub, right) =>
  isPhone(probe.T) ? 1.0 + phoneLines(probe, sub, right).length * PHONE_LINE + 0.32 : HEADER_IN;

export function header(fig, title, kick, sub, right = null) {
  const T = fig.T, M = MARGIN * fig.w;
  // a partner's logo takes the top-right corner, and everything that would have run into it stops short of it
  const lg = headerLogo(fig), lr = lg ? lg.w + lg.gap : 0;
  if (isPhone(T)) {
    kicker(fig, M, 0.30, kick, lr ? fig.w - 2 * M - lr : undefined);
    fig.fitText(M, 0.52, caps(T, title), fig.w - 2 * M - lr, 26, 15, { family: "display", color: T.INK, va: "top" });
    const lines = phoneLines(fig, sub, right);
    if (lines.length) fig.text(M, 1.0, lines.join("\n"), { size: 10, color: T.INK_3, va: "top", lineSpacing: 1.5 });
    const y = 1.0 + lines.length * PHONE_LINE + 0.12;
    headerRule(fig, y);
    return y;
  }
  // the kicker stops short of the right-hand text, and so does the title once that text runs to a second line
  const rl = right ? String(right).split("\n") : [];
  const rw = rl.length ? Math.max(...rl.map(l => fig.measure(l, 10.5))) + 0.3 : 0;
  if (lg && lg.wide) return wideHeader(fig, lg, title, kick, sub, right, rl, rw);
  kicker(fig, M, 0.30, kick, fig.w - 2 * M - rw - lr);
  fig.fitText(M, 0.52, caps(T, title), fig.w - 2 * M - (rl.length > 1 ? rw : 0) - lr, 30, 15, { family: "display", color: T.INK, va: "top" });
  fig.text(M, 1.08, lr && sub ? fig.clip(sub, fig.w - 2 * M - lr, 10) : sub, { size: 10, color: T.INK_3, va: "top" });
  if (right) fig.text(fig.w - M - lr, 0.34, right, { size: 10.5, color: T.INK_2, va: "top", ha: "right", lineSpacing: 1.6 });
  headerRule(fig, 1.42);
  return 1.42;
}

// A wordmark hangs from the top line at the right with the summary set under it, both on the margin, so the
// kicker only has to clear the logo and the title whichever of the two is wider.
function wideHeader(fig, lg, title, kick, sub, right, rl, rw) {
  const T = fig.T, M = MARGIN * fig.w, inner = fig.w - 2 * M, lr = lg.w + lg.gap;
  const rTop = lg.y + lg.h + 0.14, rBottom = rTop + 10.5 / 72 * (1 + 1.6 * (rl.length - 1)), side = Math.max(lr, rw);
  kicker(fig, M, 0.30, kick, inner - lr);
  fig.fitText(M, 0.52, caps(T, title), inner - side, 30, 15, { family: "display", color: T.INK, va: "top" });
  if (sub) fig.text(M, 1.08, fig.clip(sub, inner - (rl.length && rBottom > 1.04 ? side : 0), 10), { size: 10, color: T.INK_3, va: "top" });
  if (right) fig.text(fig.w - M, rTop, right, { size: 10.5, color: T.INK_2, va: "top", ha: "right", lineSpacing: 1.6 });
  headerRule(fig, 1.42);
  return 1.42;
}

// ---------------------------------------------------------------- a partner's brand
// A course or a company that took a contract puts its name on what its rounds make: its logo in the header,
// its words in the kicker and the footer, a code to its site, and its own mark where ours would have been.
// One brand at a time, set by the caller before drawing, like the mark; null draws exactly what it always did.
let BRAND = null;
export function setBrand(b) { BRAND = b || null; }
export const brandNow = () => BRAND;

/** The partner's kicker before the poster's own, once: a kicker that already says it is not said twice. */
export function brandKick(s) {
  const k = BRAND && BRAND.kicker;
  if (!k) return s;
  return !s || String(s).trim().toLowerCase() === String(k).trim().toLowerCase() ? k : `${k} · ${s}`;
}
export const brandTitle = (key, s) => (BRAND && BRAND.titles && BRAND.titles[key]) || s;
const DATE_SEP = "  ·  ";
export const brandDate = s => BRAND && BRAND.date ? (s ? `${s}${DATE_SEP}${BRAND.date}` : BRAND.date) : s;
const markText = () => String(BRAND.mark || BRAND.name || "").slice(0, 40);

/** The logo's size fitted inside a box, aspect kept; null without one. */
export function logoFit(maxW, maxH) {
  const L = BRAND && BRAND.logo;
  const iw = L && (L.naturalWidth || L.width), ih = L && (L.naturalHeight || L.height);
  if (!iw || !ih) return null;
  const s = Math.min(maxW / iw, maxH / ih);
  return [iw * s, ih * s];
}

/** Draws the logo into the box at (x, y), against its `ha` edge and centred down it; returns its width or 0. */
export function drawLogo(fig, x, y, maxW, maxH, ha = "left") {
  const f = logoFit(maxW, maxH);
  if (!f) return 0;
  const [w, h] = f, ctx = fig.ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(BRAND.logo, fig.px(ha === "right" ? x + maxW - w : x), fig.px(y + (maxH - h) / 2), fig.px(w), fig.px(h));
  return w;
}

// The header's logo box: a crest stands the height of the band, a wordmark runs the width of it.
const LOGO_BOX = { w: 1.9, h: 0.98, top: 0.30, gap: 0.35 }, LOGO_BOX_PHONE = { w: 1.3, h: 0.52, top: 0.30, gap: 0.22 };
const logoBox = fig => isPhone(fig.T) ? LOGO_BOX_PHONE : LOGO_BOX;
/** How much of the header's width, from the right margin in, the logo and the gap before it take. */
export function headerLogoIn(fig) {
  const B = logoBox(fig), f = logoFit(B.w, B.h);
  return f ? f[0] + B.gap : 0;
}
const WIDE = 2.2;   // a logo this much wider than it is tall is a wordmark rather than a crest
function headerLogo(fig) {
  const B = logoBox(fig), f = logoFit(B.w, B.h);
  if (!f) return null;
  const wide = !isPhone(fig.T) && f[0] / f[1] >= WIDE, y = wide ? 0.32 : B.top + (B.h - f[1]) / 2;
  drawLogo(fig, fig.w - MARGIN * fig.w - f[0], y, f[0], f[1]);
  return { w: f[0], h: f[1], y, wide, gap: B.gap };
}

// The QR to the partner's link, cached by link since every sheet of a round asks for the same one.
const QRS = new Map();
function qrModules(link) {
  if (!QRS.has(link)) {
    let m = null;
    try {
      if (typeof window !== "undefined" && typeof window.qrcode === "function") {
        const q = window.qrcode(0, "M"); q.addData(link); q.make();
        const n = q.getModuleCount();
        m = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
      }
    } catch (e) { m = null; }
    QRS.set(link, m);
  }
  return QRS.get(link);
}
const QR_IN = 0.66, QR_IN_PHONE = 0.5, QR_QUIET = 2;
/** How big the partner's QR is drawn on this sheet, or 0 where there is none to draw. */
export const qrIn = fig => BRAND && BRAND.link && qrModules(BRAND.link) ? (isPhone(fig.T) ? QR_IN_PHONE : QR_IN) : 0;

/** The QR on a white square, its modules snapped to whole pixels so a phone camera gets clean edges. */
export function drawQR(fig, x, y, size) {
  const m = BRAND && BRAND.link && qrModules(BRAND.link);
  if (!m) return;
  const ctx = fig.ctx, n = m.length + 2 * QR_QUIET;
  const mod = Math.max(1, Math.floor(fig.px(size) / n)), side = mod * n;
  const X = Math.round(fig.px(x) + (fig.px(size) - side) / 2), Y = Math.round(fig.px(y) + (fig.px(size) - side) / 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(X, Y, side, side);
  ctx.fillStyle = "#000000";
  m.forEach((row, r) => row.forEach((dark, c) => { if (dark) ctx.fillRect(X + (c + QR_QUIET) * mod, Y + (r + QR_QUIET) * mod, mod, mod); }));
}

const MARK_GAP = 0.07;
/** The bottom-right corner a brand wears: its QR, if it has a link, over its mark. [width, height] in inches. */
export function cornerIn(fig) {
  const q = qrIn(fig), mh = MARK_SIZE / 72 * 0.75;
  return [Math.max(q, fig.measure(markText(), MARK_SIZE, "display")), q ? q + MARK_GAP + mh : mh];
}
/** Draws that corner with the mark's foot `bottom` inches down the sheet, right edges on the margin. */
export function drawCorner(fig, bottom) {
  const R = fig.w - MARGIN * fig.w, q = qrIn(fig), [, h] = cornerIn(fig);
  if (q) drawQR(fig, R - q, bottom - h, q);
  fig.text(R, bottom, markText(), { size: MARK_SIZE, family: "display", color: fig.T.INK_3, ha: "right", va: "bottom", alpha: 0.8 });
}

// A poster's footer under a brand: the partner's line first, then the explanation, the corner to the right of both.
const FOOT_PT = 9, BFOOT_PT = 10, BFOOT_GAP = 0.06, FOOT_BOTTOM = 0.28;
function brandFoot(fig, text) {
  const W = footerWidth(fig);
  const blines = BRAND.foot ? fig.wrap(String(BRAND.foot), W, BFOOT_PT, "display") : [];
  const lines = text ? fig.wrap(text, W, FOOT_PT) : [];
  const lh = pt => pt / 72 * 1.5, n = lines.length;
  const above = n ? lh(FOOT_PT) * n + BFOOT_GAP : 0;   // the partner's line ends a line and a gap over the explanation
  const textIn = blines.length ? above + lh(BFOOT_PT) * (blines.length - 1) + 0.11 : n ? lh(FOOT_PT) * (n - 1) + 0.1 : 0;
  return { blines, lines, above, h: Math.max(textIn, cornerIn(fig)[1]) };
}
/** How tall a poster's footer is, from the top of its first line to the edge of the sheet. */
export function footerIn(probe, text) {
  if (!BRAND) return text ? 0.45 + 0.17 * (probe.wrap(text, footerWidth(probe), 9).length - 1) : 0.34;
  return brandFoot(probe, text).h + FOOT_BOTTOM + 0.2;
}

const MARK_SIZE = 8;

/** A partner's corner, its baseline block ending `inchesFromBottom` up from the bottom edge; a free render carries nothing there. */
export function drawMark(fig, inchesFromBottom = 0.28) {
  if (BRAND) drawCorner(fig, fig.h - inchesFromBottom);
}

/** Width the footer text may use: a partner's corner sits at the right end of the same line, so it is wrapped clear of it. */
export function footerWidth(fig) {
  return fig.w * (1 - 2 * MARGIN) - (BRAND ? cornerIn(fig)[0] + 0.3 : 0);
}

export function footer(fig, text, inchesFromBottom = 0.28) {
  const M = MARGIN * fig.w;
  if (BRAND) {
    const { blines, lines, above } = brandFoot(fig, text), bottom = fig.h - inchesFromBottom;
    if (lines.length) fig.text(M, bottom, lines.join("\n"), { size: FOOT_PT, color: fig.T.INK_3, va: "bottom", lineSpacing: 1.5 });
    if (blines.length) fig.text(M, bottom - above, blines.join("\n"), { size: BFOOT_PT, family: "display", color: fig.T.INK_2, va: "bottom", lineSpacing: 1.5 });
    drawCorner(fig, bottom);
    return lines.length + blines.length;
  }
  const lines = fig.wrap(text, footerWidth(fig), 9);
  fig.text(M, fig.h - inchesFromBottom, lines.join("\n"), { size: 9, color: fig.T.INK_3, va: "bottom", lineSpacing: 1.5 });
  return lines.length;
}

export function footerLines(fig, text) {
  return fig.wrap(text, footerWidth(fig), 9).length;
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
  const cx = ax.X(x), cy = ax.Y(y), fig = ax.fig, d = Math.min(Math.abs(ax.DY(size * 0.76)), Math.abs(ax.DX(size * 0.9)));
  if (shape === "plain" || shape === "giant") {   // no chip: the number alone, the leader in the accent
    const big = shape === "giant" ? fontsize * 1.4 : fontsize;
    return void ax.text(x, y, String(place), { size: big, family: "display", color: place === 1 ? T.ACCENT : T.INK_2, ha: "center", va: "center" });
  }
  if (shape === "ordinal") {   // written out, as on an honours board
    const suf = { 1: "st", 2: "nd", 3: "rd" }[place];
    return void ax.text(x, y, `${place}${suf}`, { size: fontsize, family: "text", color: place === 1 ? T.ACCENT : T.INK_2, ha: "center", va: "center" });
  }
  if (shape === "cell") {   // a white board cell, the medal as a bar along its foot
    fig.rbox(cx - d / 2, cy - d / 2, d, d, BOARD.cell, 0, { ec: T.LINE, lw: 0.6 });
    fig.rbox(cx - d / 2, cy + d / 2 - d * 0.14, d, d * 0.14, fc, 0);
    return void fig.text(cx, cy - d * 0.06, String(place), { size: fontsize, family: "display", color: BOARD.ink, ha: "center", va: "center" });
  }
  if (shape === "frame") {
    fig.rbox(cx - d / 2, cy - d / 2, d, d, null, 0, { ec: fc, lw: 1.3 });
    return void fig.text(cx, cy, String(place), { size: fontsize - 1, family: "display", color: place === 1 ? T.ACCENT : T.INK_2, ha: "center", va: "center" });
  }
  if (shape === "pennant" || shape === "slant") {
    const w = d * 1.15, h = d * 0.86, l = d * 0.2;
    const pts = shape === "pennant" ? [[cx - w / 2, cy - h / 2], [cx + w / 2, cy], [cx - w / 2, cy + h / 2]]
      : [[cx - w / 2 + l, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2 - l, cy + h / 2], [cx - w / 2, cy + h / 2]];
    fig.poly(pts, fc);
    return void fig.text(shape === "pennant" ? cx - w * 0.2 : cx, cy, String(place), { size: fontsize - (shape === "pennant" ? 2 : 0), family: "display", color: on(T, fc), ha: "center", va: "center" });
  }
  if (shape === "bare") {   // no chip at all: the number itself takes the medal, over a short rule of it
    ax.text(x, y, String(place), { size: fontsize + 1, family: "display", color: fc, ha: "center", va: "center" });
    const w = ax.UX(0.14);
    ax.rbox(x - w / 2, y + ax.down() * ax.UY(0.125), w, ax.UY(0.022), fc, 0);
    return;
  }
  if (shape === "circle" || shape === "square") {   // drawn square on paper, so the axes' own scale cannot stretch it
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
  if (band === "rule" || band === "dash") return void ax.line(x, y, x + w, y, T.LINE, 0.6, band === "dash" ? [3, 2.5] : null);
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
export function scoreGlyph(ax, x, y, cell, delta, text, fontsize = 15, lw = 1.6, ink = null, colors = null) {
  const T = ax.fig.T, fig = ax.fig, style = house(T).glyph;
  // `colors` stands in for T.OUTCOMES' four, so a partner's sheet keeps to the partner's own palette
  const col = colors ? colors[outcome(delta)] : T.OUTCOMES[outcome(delta)][1];
  const cx = ax.X(x), cy = ax.Y(y), c = ax.DX(cell), two = delta <= -2 || delta >= 2;
  let color = ink || T.INK;
  if (style === "board") {   // the hand-hung board: every score in a white cell, red under par and green over
    fig.rbox(cx - c * 0.42, cy - c * 0.42, c * 0.84, c * 0.84, BOARD.cell, 0, { ec: T.LINE, lw: 0.5 });
    color = delta < 0 ? BOARD.under : delta > 0 ? BOARD.over : BOARD.ink;
  } else if (style === "agate") {   // no shapes: the figure in the score's colour under par, a rule under any double
    if (delta < 0) color = col;
    if (two) fig.line(cx - c * 0.22, cy + c * 0.3, cx + c * 0.22, cy + c * 0.3, col, lw);
  } else if (style === "blob" || style === "tile") {   // filled: a disc or a square in the score's own colour
    if (delta) {
      const sz = c * (style === "blob" ? 0.74 : 0.7);
      if (style === "blob") fig.disc(cx, cy, sz, col); else fig.rbox(cx - sz / 2, cy - sz / 2, sz, sz, col, 0);
      if (two) { if (style === "blob") fig.circle(cx, cy, sz + c * 0.16, col, lw * 0.8); else fig.square(cx, cy, sz + c * 0.16, col, lw * 0.8); }
      color = on(T, col);
    }
  } else if (style === "bar") {   // a bar under the figure, twice as heavy for a double or an eagle
    if (delta) fig.rbox(cx - c * 0.26, cy + c * 0.28, c * 0.52, c * (two ? 0.1 : 0.05), col, 0);
  } else if (style === "neon") {   // outlined in the score's colour, a double filled faintly too
    if (delta) {
      const sz = c * 0.7;
      if (two) fig.rbox(cx - sz / 2, cy - sz / 2, sz, sz, col, 0, { alpha: 0.22 });
      fig.square(cx, cy, sz, col, lw * 0.8);
      color = col;
    }
  } else {   // classic rings and boxes, or drafted ones: the first ring dashed and every line finer
    const drawn = style === "drawn", w = drawn ? lw * 0.7 : lw;
    if (delta < 0) for (let k = 0; k < (two ? 2 : 1); k++) fig.circle(cx, cy, c * (0.68 + 0.18 * k), col, w, drawn && !k ? [2.2, 1.6] : null);
    else if (delta > 0) for (let k = 0; k < (two ? 2 : 1); k++) fig.square(cx, cy, c * (0.66 + 0.18 * k), col, w);
  }
  if (text) fig.text(cx, cy, text, { size: fontsize, family: "display", color, ha: "center", va: "center" });
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
