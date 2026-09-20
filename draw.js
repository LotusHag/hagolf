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
  return T;
}

function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function on(T, fill) {
  return lum(fill) > 0.30 ? T.TEXT_ON_LIGHT : T.TEXT_ON_DARK;
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
    while (size > minSize && this.measure(s, size, opts.family, opts.weight) > maxW) size -= 1;
    this.text(x, y, s, { ...opts, size });
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
    const R = Math.min(this.px(r), this.px(w) / 2, this.px(h) / 2);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(this.px(x), this.px(y), this.px(w), this.px(h), Math.max(0, R));
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

  text(xd, yd, s, opts) { return this.fig.text(this.X(xd), this.Y(yd), s, opts); }
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
export function header(fig, title, kicker, sub, right = null) {
  const T = fig.T, M = MARGIN * fig.w;
  fig.text(M, 0.30, kicker.toUpperCase(), { size: 12, family: "display", color: T.ACCENT, va: "top" });
  fig.text(M, 0.52, title.toUpperCase(), { size: 30, family: "display", color: T.INK, va: "top" });
  fig.text(M, 1.08, sub, { size: 10, color: T.INK_3, va: "top" });
  if (right) fig.text(fig.w - M, 0.34, right, { size: 10.5, color: T.INK_2, va: "top", ha: "right", lineSpacing: 1.6 });
  fig.line(M, 1.42, fig.w - M, 1.42, T.ACCENT, 1.6);
  return 1.42;
}

export function footer(fig, text, inchesFromBottom = 0.28) {
  const M = MARGIN * fig.w;
  const lines = fig.wrap(text, fig.w - 2 * M, 9);
  fig.text(M, fig.h - inchesFromBottom, lines.join("\n"), { size: 9, color: fig.T.INK_3, va: "bottom", lineSpacing: 1.5 });
  return lines.length;
}

export function footerLines(fig, text) {
  return fig.wrap(text, fig.w * (1 - 2 * MARGIN), 9).length;
}

export function section(ax, x, y, title, size = 12) {
  ax.text(x, y, title.toUpperCase(), { size, family: "display", color: ax.fig.T.ACCENT, va: "center" });
}

// ---------------------------------------------------------------- drawing helpers
export function posChip(ax, x, y, place, size = 1.0, fontsize = 13) {
  const T = ax.fig.T;
  if (place === null || place === undefined) {
    ax.text(x, y, "NR", { size: fontsize - 1, family: "display", color: T.INK_3, ha: "center", va: "center" });
    return;
  }
  const fc = { 1: T.ACCENT, 2: T.SILVER, 3: T.BRONZE }[place];
  if (fc) {
    ax.rbox(x - size * 0.5, y - size * 0.36, size, size * 0.72, fc, 0.1);
    ax.text(x, y, String(place), { size: fontsize, family: "display", color: on(T, fc), ha: "center", va: "center" });
  } else {
    ax.text(x, y, String(place), { size: fontsize, family: "display", color: T.INK_2, ha: "center", va: "center" });
  }
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
    if (label) ax.text(cx + seg / 2, y + h / 2, String(c), { size: seg > 2.2 * gap + 0.25 ? fontsize : fontsize - 1.5, family: "display", color: on(T, col), ha: "center", va: "center" });
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
