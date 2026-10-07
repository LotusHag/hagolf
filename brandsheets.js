// The partner's own sheets: a day out's board, one golfer's card and a society's table, each in a handful of quiet
// styles where the course or company's logo is the centre of the page and the words are cut to the result. They
// read the same models the posters do (compute, standingsFor) and the brand draw.js holds (setBrand/brandNow).
import { Fig, on, mix, isPhone, PHONE_W, MARGIN, brandNow, logoFit, drawLogo, drawMark, drawQR, qrIn, scoreGlyph } from "./draw.js";
import { inchAxes } from "./sheet.js";
import { fmtToPar } from "./model.js";

export const BRAND_STYLES = {
  dayout: [{ key: "crest", name: "Crest" }, { key: "banner", name: "Banner" }, { key: "podium", name: "Podium" }, { key: "ticket", name: "Ticket" }],
  personal: [{ key: "crest", name: "Crest" }, { key: "banner", name: "Banner" }, { key: "numeral", name: "Numeral" }, { key: "ticket", name: "Ticket" }],
  league: [{ key: "crest", name: "Crest" }, { key: "banner", name: "Banner" }, { key: "podium", name: "Podium" }, { key: "ticket", name: "Ticket" }],
};
const styleOf = (kind, s) => (BRAND_STYLES[kind].find(x => x.key === s) || BRAND_STYLES[kind][0]).key;

// "League table" is the football idiom the posters keep; a golfer reads society here
const TABLE_TITLES = {
  stableford: "Season standings", stroke: "Stroke play standings", match: "Matchplay standings", matchpts: "Matchplay standings",
  soccer: "Society table", soccerpts: "Society table", gp: "Grand Prix standings", gpstroke: "Grand Prix standings",
};

// ---------------------------------------------------------------- the page
const PAGE = { full: { w: 8.5, minH: 11, m: 0.85, top: 0.8 }, phone: { w: PHONE_W, minH: 9.6, m: 0.42, top: 0.55 } };
const CARD = { full: { w: 8, minH: 10, m: 0.8, top: 0.75 }, phone: { w: PHONE_W, minH: 9.6, m: 0.42, top: 0.55 } };
const pageFor = (T, card = false) => ({ ...(card ? CARD : PAGE)[isPhone(T) ? "phone" : "full"], ph: isPhone(T) });
const z = (P, full, phone) => P.ph ? phone : full;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function longDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  if (!m) return d ? String(d) : "";
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[t.getUTCDay()]} ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}
function shortDate(d, withYear = true) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1].slice(0, 3)}${withYear ? ` ${m[1]}` : ""}` : "";
}
const ordinal = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const SEP = "  ·  ";

/** The partner's kicker where it says something the logo does not: never just the partner's own name again. */
/** The partner's line above the title, unless it would only repeat the partner's name or the title itself. */
function kickerText(title = "") {
  const B = brandNow();
  if (!B || !B.kicker) return "";
  const k = String(B.kicker).trim(), kl = k.toLowerCase();
  return String(B.name || "").trim().toLowerCase() === kl || String(title).toLowerCase().includes(kl) ? "" : k;
}

// ---------------------------------------------------------------- type
/** Upper case set with tracking, the small line of stationery; fitted to `maxW` and cut short below 6pt. */
function spaced(fig, x, y, s, { size = 8, family = "text", weight, color, ha = "center", track = 0.18, maxW = 99, alpha = 1 } = {}) {
  const ctx = fig.ctx;
  let str = String(s).toUpperCase(), sz = size;
  const width = (t, k) => {
    ctx.font = fig.font(k, family, weight);
    return [...t].reduce((a, c) => a + ctx.measureText(c).width, 0) / fig.dpi + track * k / 72 * Math.max(0, [...t].length - 1);
  };
  while (sz > 6 && width(str, sz) > maxW) sz -= 0.25;
  while (str.length > 1 && width(str, sz) > maxW) str = str.slice(0, -2).trimEnd() + "…";
  const w = width(str, sz);
  ctx.font = fig.font(sz, family, weight);
  const m = ctx.measureText(str), asc = m.actualBoundingBoxAscent / fig.dpi, desc = m.actualBoundingBoxDescent / fig.dpi;
  const base = y + (asc - desc) / 2;
  let cx = ha === "left" ? x : ha === "right" ? x - w : x - w / 2;
  ctx.fillStyle = color || fig.T.INK_3;
  ctx.globalAlpha = alpha;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const c of str) {
    ctx.fillText(c, fig.px(cx), fig.px(base));
    cx += ctx.measureText(c).width / fig.dpi + track * sz / 72;
  }
  ctx.globalAlpha = 1;
  return w;
}

/** Text fitted to a width and cut short with an ellipsis below `min`, drawn at the size it came out at. */
function fitted(fig, x, y, s, maxW, size, min, opts) {
  const at = fig.fitOne(String(s), maxW, size, min, opts);
  fig.text(x, y, fig.clip(s, maxW, at, opts), { ...opts, size: at });
  return at;
}

/** The fewest lines, up to `most`, a title breaks into at `size`; the size shrinks until it does. */
function titleLines(probe, s, maxW, size, min, most = 2, weight) {
  for (let k = size; k >= min; k -= 0.5) {
    const lines = wrapAt(probe, s, maxW, k, weight);
    if (lines.length <= most) return { lines, size: k };
  }
  const lines = wrapAt(probe, s, maxW, min, weight).slice(0, most);
  lines[most - 1] = probe.clip(lines[most - 1], maxW, min, { family: "display", weight });
  return { lines, size: min };
}
function wrapAt(probe, s, maxW, size, weight) {
  const words = String(s).split(/\s+/).filter(Boolean), out = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && probe.measure(t, size, "display", weight) > maxW) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}
const LINE = 1.12;
const linesH = (n, size) => size / 72 * (1 + LINE * (n - 1)) + size / 72 * 0.25;

function drawLines(fig, x, y, t, { color, ha = "center", weight } = {}) {
  fig.text(x, y, t.lines.join("\n"), { size: t.size, family: "display", weight, color: color || fig.T.INK, ha, va: "top", lineSpacing: LINE });
}

// ---------------------------------------------------------------- shapes the family's corner radius must not touch
function rr(fig, x, y, w, h, r, fill, { stroke = null, lw = 0, alpha = 1 } = {}) {
  const c = fig.ctx, X = fig.px(x), Y = fig.px(y), W = fig.px(w), H = fig.px(h), R = Math.min(fig.px(r), W / 2, H / 2);
  c.globalAlpha = alpha;
  c.beginPath();
  c.moveTo(X + R, Y);
  c.arcTo(X + W, Y, X + W, Y + H, R);
  c.arcTo(X + W, Y + H, X, Y + H, R);
  c.arcTo(X, Y + H, X, Y, R);
  c.arcTo(X, Y, X + W, Y, R);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke && lw) { c.strokeStyle = stroke; c.lineWidth = lw / 72 * fig.dpi; c.stroke(); }
  c.globalAlpha = 1;
}
const rect = (fig, x, y, w, h, fill) => { fig.ctx.fillStyle = fill; fig.ctx.fillRect(fig.px(x), fig.px(y), fig.px(w), fig.px(h)); };

// ---------------------------------------------------------------- the partner, at the centre
const WIDE = 2.2;
/**
 * What stands where the logo goes: the logo fitted to the box, the partner's name set large when it has none, or
 * nothing at all without a partner, where the title is the hero instead. Measured before the figure exists.
 */
function heroOf(probe, { w: maxW, h: maxH }, nameSize) {
  const B = brandNow();
  if (!B) return { kind: null, w: 0, h: 0 };
  const f = logoFit(maxW, maxH);
  if (f) return { kind: "logo", w: f[0], h: f[1], wide: f[0] / f[1] >= WIDE };
  const name = String(B.name || "");
  const one = titleLines(probe, name, maxW, nameSize, nameSize * 0.72, 1);
  const t = probe.measure(one.lines[0], one.size, "display") <= maxW && !one.lines[0].endsWith("…") ? one : titleLines(probe, name, maxW, nameSize, nameSize * 0.6, 2);
  return { kind: "name", w: Math.max(...t.lines.map(l => probe.measure(l, t.size, "display"))), h: linesH(t.lines.length, t.size), t };
}
function drawHero(fig, hero, cx, y, ha = "center", color) {
  const x = ha === "center" ? cx - hero.w / 2 : ha === "right" ? cx - hero.w : cx;
  if (hero.kind === "logo") drawLogo(fig, x, y, hero.w, hero.h);
  else if (hero.kind === "name") drawLines(fig, cx, y, hero.t, { color: color || fig.T.INK, ha });
}
/** The logo's box for a style: a crest stands taller than a wordmark runs, so each gets its own. */
const logoBox = (crest, wide) => {
  const f = logoFit(1, 1);
  return f && f[0] / f[1] >= WIDE ? wide : crest;
};

/** The corner credit: the partner's mark or name, or our own mark without a partner. Set to be read, it is sold. */
const creditText = B => String(B.mark || B.name || "").slice(0, 40);
const CREDIT_SZ = fig => isPhone(fig.T) ? 11.5 : 11;
function credit(fig, y, { ha = "center", x = fig.w / 2, color } = {}) {
  const B = brandNow();
  if (!B) {
    // our mark keeps its own corner unless a style sets it against an edge of its own, as the ticket's stub does
    const dx = ha === "right" ? x - fig.w * (1 - MARGIN) : 0;
    fig.ctx.save();
    fig.ctx.translate(fig.px(dx), 0);
    drawMark(fig, fig.h - y);
    fig.ctx.restore();
    return;
  }
  const s = creditText(B);
  if (s) fig.text(x, y, s, { size: CREDIT_SZ(fig), family: "display", color: color || fig.T.INK_2, ha, va: "bottom" });
}
const footLine = () => { const B = brandNow(); return B && B.foot ? String(B.foot) : ""; };
const FOOT_SZ = 12;

/** The quiet line over the credit that says why two equal figures stand in different places. */
const TIE_LINE = "Equal points split on countback";
function tieNote(fig, y, P) {
  spaced(fig, fig.w / 2, y, TIE_LINE, { size: z(P, 9, 9.5), color: fig.T.INK_3, maxW: fig.w - 2 * P.m });
}

// ---------------------------------------------------------------- a column of parts down the page
/**
 * Parts are [height, draw(fig, y)] or a number, which is a flexible gap weighted by it. The page is as tall as
 * the parts or the least height of the sheet, whichever is more, and what is left over goes into the gaps.
 */
function stackUp(P, T, parts, under = null) {
  const fixed = parts.reduce((a, p) => a + (typeof p === "number" ? 0 : p[0]), 0);
  const weights = parts.reduce((a, p) => a + (typeof p === "number" ? p : 0), 0);
  const H = Math.max(P.minH, fixed + 0.2);
  const spare = Math.max(0, H - fixed);
  const fig = new Fig(P.w, H, T);
  if (under) under(fig);
  let y = 0;
  for (const p of parts) {
    if (typeof p === "number") { y += weights ? spare * p / weights : 0; continue; }
    p[1](fig, y);
    y += p[0];
  }
  return fig;
}
const gap = h => [h, () => {}];

// ---------------------------------------------------------------- the list a board and a table share
/**
 * How the rows go down the room there is: one column at a comfortable height while they fit, tighter rows next,
 * then two columns. A phone keeps one column and grows instead, until a big field goes two abreast there too.
 */
function planList(P, n, avail, { ideal, roomy, min, inner, single, cap = roomy * 1.2 }) {
  const want = n <= 8 ? roomy : ideal;
  if (P.ph && n > 24) {
    // two abreast without the aside, so forty or sixty keep the sheet a couple of screens tall
    const per = Math.ceil(n / 2), rowH = 0.44;
    return { cols: 2, per, rowH, colW: (inner - 0.3) / 2, gut: 0.3, h: per * rowH, two: true };
  }
  if (P.ph || n * min <= avail && n <= 22) {
    // a small field takes rows a good deal larger rather than leaving the sheet half empty under it
    const fill = n <= 8 ? Math.min(cap, avail / Math.max(1, n)) : 0;
    const rowH = Math.max(fill, P.ph ? want : Math.max(min, Math.min(want, avail / Math.max(1, n))));
    return { cols: 1, per: n, rowH, colW: single, gut: 0.5, h: n * rowH };
  }
  // names below about ten points stop reading once the sheet is passed round a group chat: the page grows instead
  const per = Math.ceil(n / 2), rowH = Math.max(0.34, Math.min(ideal, avail / per));
  return { cols: 2, per, rowH, colW: (inner - 0.5) / 2, gut: 0.5, h: per * rowH };
}
// two abreast on a phone keep one size down the column, shrinking a long name no further than ten points
const nameSzOf = (rowH, ph, two) => two ? 11 : Math.max(ph ? 11 : 8.5, Math.min(ph ? 17 : 20, 14.5 * rowH / 0.5));

/** One row a player: place, name, the figure, and a quiet aside such as rounds played, in the style's own hand. */
function drawRow(fig, look, r, x, y, w, rowH, i, ctx) {
  const T = fig.T, cy = y + rowH / 2;
  const k = Math.min(1.25, rowH / 0.5), nameSz = nameSzOf(rowH, ctx.ph, ctx.two);
  const valSz = nameSz * (ctx.two ? 1.05 : 1.18), asideSz = Math.max(ctx.ph ? 9.5 : 7.5, nameSz * 0.68);
  const valW = ctx.valW * valSz / 10, asideW = ctx.asideW ? ctx.asideW * asideSz / 10 + 0.25 : 0;
  const medal = { 1: T.ACCENT, 2: T.SILVER, 3: T.BRONZE }[r.tie || r.place];
  if (look === "banner" && i % 2 === 0) rect(fig, x - 0.12, y + 0.02, w + 0.24, rowH - 0.04, T.PANEL);
  const posW = look === "ticket" ? nameSz / 72 * 1.1 + (ctx.two ? 0.16 : 0.28) : ctx.two ? 0.4 : 0.42 * k + 0.12;
  const at = r.tie || r.place;
  const pos = at === null || at === undefined ? "–" : (r.tie ? "=" : "") + (look === "ticket" ? String(at).padStart(2, "0") : String(at));
  if (look === "banner" && medal) {
    const d = rowH * 0.56;
    fig.disc(x + posW / 2 - 0.04, cy, d, medal);
    fig.text(x + posW / 2 - 0.04, cy, pos, { size: nameSz * 0.82, family: "display", color: on(T, medal), ha: "center", va: "center" });
  } else {
    const left = look === "ticket";   // a programme's numbers stand under its "No." head
    fig.text(left ? x : x + posW - 0.14, cy, pos, { size: look === "quiet" ? nameSz * 0.9 : nameSz * 0.92, family: "display", weight: 400,
      color: look === "crest" && medal ? T.ACCENT : T.INK_3, ha: left ? "left" : "right", va: "center" });
  }
  const nx = x + posW + 0.06, vx = x + w;
  const nameW = vx - valW - asideW - nx - 0.15;
  const fam = look === "banner" || look === "ticket" ? "text" : "display";
  const nameOpts = { family: fam, weight: fam === "text" ? 600 : 400, color: look === "quiet" ? T.INK_2 : T.INK, va: "center" };
  const nsz = fig.fitOne(r.name, nameW, nameSz, Math.max(ctx.two ? 10 : 0, nameSz * 0.85), nameOpts);
  const shown = fig.clip(r.name, nameW, nsz, nameOpts);
  const drawnW = fig.text(nx, cy, shown, { ...nameOpts, size: nsz });
  const lead = (i === 0 || r.tie === 1) && look !== "quiet";
  const val = String(r.value);
  const vOpts = { size: valSz, family: "display", weight: lead ? 500 : 400, color: lead ? T.ACCENT : look === "quiet" ? T.INK_2 : T.INK, ha: "right", va: "center" };
  if (val === "–" || val === "NR") Object.assign(vOpts, { color: T.INK_3 });
  const vw = fig.text(vx, cy, val, vOpts);
  if (asideW && r.aside !== undefined && r.aside !== null) {
    fig.text(vx - valW - 0.25, cy, String(r.aside), { size: asideSz, color: T.INK_3, ha: "right", va: "center" });
  }
  if (look === "ticket") {
    // a programme's dotted leader from the name to the figure
    const a = nx + drawnW + 0.12, b = (asideW ? vx - valW - asideW : vx - vw) - 0.12;
    if (b - a > 0.2) fig.line(a, cy + nsz / 72 * 0.28, b, cy + nsz / 72 * 0.28, T.INK_3, 1.1, [0.2, 3.2]);
  }
  if ((look === "crest" || look === "quiet") && !ctx.last) fig.line(x, y + rowH, x + w, y + rowH, T.LINE, 0.6);
}

/** The heads over the figure columns, set as small tracked caps. */
function drawHeads(fig, plan, x, y, ctx, look) {
  const T = fig.T, two = plan.two, asideW = two ? 0 : ctx.asideW;
  const nameSz = nameSzOf(plan.rowH, ctx.ph, two), valW = ctx.valW * nameSz * (two ? 1.05 : 1.18) / 10;
  const sz = ctx.ph ? 9.5 : 9, color = T.INK_3;
  for (let c = 0; c < plan.cols; c++) {
    const cx = x + c * (plan.colW + plan.gut), vx = cx + plan.colW;
    if (look === "ticket") spaced(fig, cx, y, "No.", { size: sz, ha: "left", color });
    spaced(fig, vx, y, ctx.label, { size: sz, ha: "right", color, maxW: Math.max(valW, 0.9) });
    if (asideW && ctx.asideLabel) spaced(fig, vx - valW - 0.25, y, ctx.asideLabel, { size: sz, ha: "right", color, maxW: 1.1 });
  }
}
const HEADS = 0.34;

function drawList(fig, look, rows, plan, x, y, ctx) {
  const lctx = plan.two ? { ...ctx, two: true, asideW: 0 } : ctx;
  rows.forEach((r, i) => {
    const c = plan.cols === 1 ? 0 : Math.floor(i / plan.per), j = i - c * plan.per;
    const last = j === plan.per - 1 || i === rows.length - 1;
    drawRow(fig, look, r, x + c * (plan.colW + plan.gut), y + j * plan.rowH, plan.colW, plan.rowH, i, { ...lctx, last });
  });
}

/** How wide the figure and aside columns are, per ten points of type, so every row's figure stands on one edge. */
function columnsOf(probe, rows) {
  const valW = Math.max(0.3, ...rows.map(r => probe.measure(String(r.value), 10, "display", 500)));
  const asides = rows.filter(r => r.aside !== undefined && r.aside !== null);
  const asideW = asides.length ? Math.max(...asides.map(r => probe.measure(String(r.aside), 10))) : 0;
  return { valW, asideW };
}

// ---------------------------------------------------------------- the four boards
/**
 * A board is a ranked list with a title over it. `B` is { title, kicker, line, label, asideLabel, rows } and the
 * rows are { place, name, value, aside }; the day out and the society table both come down to this.
 */
function board(T, style, B) {
  const P = pageFor(T);
  const probe = new Fig(P.w, 1, T, 20);
  const cols = columnsOf(probe, B.rows);
  const ctx = { ph: P.ph, label: B.label, asideLabel: B.asideLabel, ...cols };
  const draw = { crest: crestBoard, banner: bannerBoard, podium: podiumBoard, ticket: ticketBoard }[style];
  return draw(T, P, probe, B, ctx);
}

const LIST = P => ({ ideal: z(P, 0.48, 0.5), roomy: z(P, 0.6, 0.56), min: z(P, 0.3, 0.42), cap: z(P, 0.95, 0.8) });

function titleBlock(P, probe, B, inner, { size, ha = "center" }) {
  const kick = kickerText(B.title), t = titleLines(probe, B.title, inner, size, size * 0.62, 2);
  const kh = kick ? z(P, 0.38, 0.36) : 0, th = linesH(t.lines.length, t.size), lh = B.line ? z(P, 0.42, 0.4) : 0;
  return { h: kh + th + lh, kick, t, kh, th, draw(fig, x, y, colors = {}) {
    const T = fig.T;
    if (kick) spaced(fig, x, y + kh * 0.4, kick, { size: z(P, 10.5, 10), color: colors.kick || T.ACCENT, ha, maxW: inner, family: "display", weight: 500 });
    drawLines(fig, x, y + kh, t, { color: colors.title || T.INK, ha });
    if (B.line) spaced(fig, x, y + kh + th + lh * 0.5, B.line, { size: z(P, 10.5, 10), color: colors.line || T.INK_3, ha, maxW: inner });
  } };
}

/** The foot of a board: the partner's line, the tie note when the board needs one, and the credit at the bottom. */
function footPart(P, B, inner) {
  const foot = footLine();
  const h = z(P, 0.95, 0.85) + (foot ? 0.3 : 0) + (B.tied ? 0.32 : 0);
  return [h, (fig, y) => {
    const T = fig.T, cy = fig.h - z(P, 0.4, 0.32);
    if (foot) fitted(fig, P.w / 2, y + 0.2, foot, inner, FOOT_SZ, 10, { color: T.INK_2, ha: "center", va: "center" });
    if (B.tied) tieNote(fig, cy - 0.42, P);
    credit(fig, cy);
  }];
}

/** Crest: the logo large and centred, a quiet title under it, a hairline, and one clean list. */
function crestBoard(T, P, probe, B, ctx) {
  const inner = P.w - 2 * P.m;
  const hero = heroOf(probe, logoBox({ w: z(P, 3.0, 2.4), h: z(P, 2.3, 1.75) }, { w: z(P, 5.2, 4.2), h: z(P, 1.0, 0.8) }), z(P, 38, 28));
  const tb = titleBlock(P, probe, B, inner, { size: hero.kind ? z(P, 28, 23) : z(P, 40, 30) });
  const fp = footPart(P, B, inner), footH = fp[0];
  const headH = P.top + (hero.kind ? hero.h + z(P, 0.45, 0.34) : 0.3) + tb.h + z(P, 0.55, 0.45);
  const plan = planList(P, B.rows.length, P.minH - headH - footH - HEADS - 0.6, { ...LIST(P), inner, single: Math.min(inner, 5.6) });
  const lx = plan.cols === 1 ? (P.w - plan.colW) / 2 : P.m;
  return stackUp(P, T, [
    [P.top, () => {}],
    ...(hero.kind ? [[hero.h + z(P, 0.45, 0.34), (fig, y) => drawHero(fig, hero, P.w / 2, y)]] : [gap(0.3)]),
    [tb.h, (fig, y) => tb.draw(fig, P.w / 2, y)],
    [z(P, 0.55, 0.45), (fig, y) => fig.line(P.w / 2 - 0.3, y + z(P, 0.25, 0.2), P.w / 2 + 0.3, y + z(P, 0.25, 0.2), T.ACCENT, 1.4)],
    1,
    [HEADS, (fig, y) => drawHeads(fig, plan, lx, y + HEADS / 2, ctx, "crest")],
    [plan.h, (fig, y) => drawList(fig, "crest", B.rows, plan, lx, y, ctx)],
    1,
    fp,
  ]);
}

/**
 * Banner: a solid band of the partner's colour across the top with the title reversed out of it, and the logo on
 * a plate of the page's own colour hanging from its lower edge -- the surface a partner's logo was made for.
 */
function bannerBoard(T, P, probe, B, ctx) {
  const inner = P.w - 2 * P.m, band = T.ACCENT, ink = on(T, band);
  const plate = plateOf(probe, P);
  const tb = titleBlock(P, probe, B, inner, { size: z(P, 32, 25) });
  const bandH = P.top + tb.h + (plate ? plate.h / 2 + z(P, 0.4, 0.3) : z(P, 0.55, 0.45));
  const below = plate ? plate.h / 2 + z(P, 0.5, 0.4) : z(P, 0.55, 0.45);
  const fp = footPart(P, B, inner), footH = fp[0];
  const plan = planList(P, B.rows.length, P.minH - bandH - below - footH - HEADS - 0.4, { ...LIST(P), inner, single: inner });
  return stackUp(P, T, [
    [bandH, (fig, y) => {
      rect(fig, 0, y, fig.w, bandH, band);
      tb.draw(fig, P.w / 2, y + P.top, { kick: ink, title: ink, line: mix(ink, band, 0.28) });
      if (plate) drawPlate(fig, plate, P.w / 2, y + bandH);
    }],
    [below, () => {}],
    0.8,
    [HEADS, (fig, y) => drawHeads(fig, plan, P.m, y + HEADS / 2, ctx, "banner")],
    [plan.h, (fig, y) => drawList(fig, "banner", B.rows, plan, P.m, y, ctx)],
    1,
    fp,
  ]);
}

/** The plate a logo hangs on: a disc for a crest, a long rounded plate for a wordmark, the name for no logo. */
function plateOf(probe, P) {
  const B = brandNow();
  if (!B) return null;
  const crest = logoFit(1, 1) && logoFit(1, 1)[0] / logoFit(1, 1)[1] < WIDE;
  if (crest) {
    const d = z(P, 2.2, 1.7), f = logoFit(d * 0.6, d * 0.66);
    return { round: true, w: d, h: d, logo: f };
  }
  const f = logoFit(z(P, 4.6, 3.8), z(P, 0.8, 0.62));
  if (f) return { round: false, w: f[0] + z(P, 0.8, 0.6), h: f[1] + z(P, 0.6, 0.46), logo: f };
  const hero = heroOf(probe, { w: z(P, 5, 4), h: 1 }, z(P, 26, 20));
  return { round: false, w: hero.w + z(P, 0.9, 0.6), h: hero.h + z(P, 0.5, 0.4), hero };
}
function drawPlate(fig, pl, cx, cy) {
  const T = fig.T;
  if (pl.round) fig.disc(cx, cy, pl.w, T.BG);
  else rr(fig, cx - pl.w / 2, cy - pl.h / 2, pl.w, pl.h, pl.h / 2, T.BG);
  if (pl.logo) drawLogo(fig, cx - pl.logo[0] / 2, cy - pl.logo[1] / 2, pl.logo[0], pl.logo[1]);
  else drawHero(fig, pl.hero, cx, cy - pl.hero.h / 2);
}

/** Podium: the first three stand on their steps under the logo, figures large; everyone else is a quiet list. */
function podiumBoard(T, P, probe, B, ctx) {
  const inner = P.w - 2 * P.m;
  const hero = heroOf(probe, logoBox({ w: z(P, 2.0, 1.6), h: z(P, 1.5, 1.15) }, { w: z(P, 4.2, 3.6), h: z(P, 0.75, 0.62) }), z(P, 30, 24));
  const tb = titleBlock(P, probe, B, inner, { size: hero.kind ? z(P, 24, 21) : z(P, 34, 27) });
  const top3 = B.rows.slice(0, 3), rest = B.rows.slice(3);
  const colW = Math.min(z(P, 2.15, 1.5), (inner - 0.3) / 3), cg = z(P, 0.2, 0.1);
  const STEP = { 1: z(P, 1.0, 0.78), 2: z(P, 0.72, 0.56), 3: z(P, 0.5, 0.4) };
  const nameSz = { 1: z(P, 15, 13), 2: z(P, 13, 11.5), 3: z(P, 13, 11.5) }, valSz = { 1: z(P, 50, 38), 2: z(P, 36, 28), 3: z(P, 36, 28) };
  // a name breaks onto a second line where the column is too narrow for it, so every name stands in full
  const names = top3.map(r => titleLines(probe, r.name, colW - 0.12, nameSz[r.place] || 13, (nameSz[r.place] || 13) * 0.8, 2));
  const twoLine = names.some(t => t.lines.length > 1);
  const figH = z(P, 0.85, 0.66) + (twoLine ? 0.24 : 0) + z(P, 0.32, 0.26);
  const podH = top3.length ? figH + STEP[1] + z(P, 0.3, 0.25) : 0;
  const fp = footPart(P, B, inner), footH = fp[0];
  const headH = P.top + (hero.kind ? hero.h + z(P, 0.36, 0.28) : 0.2) + tb.h + z(P, 0.5, 0.4);
  // the rest list has no heads, so an aside such as rounds played would only be a stray small figure
  const qctx = { ...ctx, ...columnsOf(probe, rest), asideW: 0 };
  const plan = planList(P, rest.length, P.minH - headH - podH - footH - 0.6, { ideal: z(P, 0.38, 0.42), roomy: z(P, 0.42, 0.46), min: z(P, 0.28, 0.38), inner, single: Math.min(inner, 4.2) });
  if (!P.ph && rest.length > 6 && plan.cols === 1) Object.assign(plan, { cols: 2, per: Math.ceil(rest.length / 2), colW: (inner - 0.5) / 2, h: Math.ceil(rest.length / 2) * plan.rowH });
  const RULE = 0.16;   // the hairline that sets the rest apart from the podium
  const lx = plan.cols === 1 ? (P.w - plan.colW) / 2 : P.m;
  const order = [2, 1, 3].filter(k => k <= top3.length);
  return stackUp(P, T, [
    [P.top, () => {}],
    ...(hero.kind ? [[hero.h + z(P, 0.36, 0.28), (fig, y) => drawHero(fig, hero, P.w / 2, y)]] : [gap(0.2)]),
    [tb.h, (fig, y) => tb.draw(fig, P.w / 2, y)],
    1,
    [z(P, 0.5, 0.4) + podH, (fig, y) => {
      const y0 = y + z(P, 0.5, 0.4), base = y0 + figH + STEP[1];
      const span = order.length * colW + (order.length - 1) * cg;
      order.forEach((place, k) => {
        const r = top3[place - 1], x = P.w / 2 - span / 2 + k * (colW + cg), cx = x + colW / 2, st = STEP[place];
        const fill = { 1: T.ACCENT, 2: T.SILVER, 3: T.BRONZE }[place];
        rect(fig, x, base - st, colW, st, fill);
        fig.text(cx, base - st + z(P, 0.3, 0.24), String(place), { size: z(P, 20, 16), family: "display", weight: 500, color: on(T, fill), ha: "center", va: "center" });
        const vy = base - st - z(P, 0.14, 0.12);
        const val = String(r.value);
        fig.text(cx, vy, val, { size: valSz[place], family: "display", weight: 300, color: place === 1 ? T.ACCENT : T.INK, ha: "center", va: "bottom" });
        const t = names[place - 1], vh = valSz[place] / 72 * 0.78;
        fig.text(cx, vy - vh - z(P, 0.12, 0.1), t.lines.join("\n"), { size: t.size, family: "display", weight: 400, color: T.INK, ha: "center", va: "bottom", lineSpacing: 1.15 });
      });
      if (top3.length) spaced(fig, P.w / 2, base + z(P, 0.24, 0.2), B.label, { size: z(P, 9, 9.5), color: T.INK_3 });
    }],
    0.8,
    ...(rest.length ? [[plan.h + RULE, (fig, y) => {
      const w = plan.cols === 1 ? plan.colW : inner;
      fig.line(lx, y, lx + w, y, T.LINE, 0.6);
      drawList(fig, "quiet", rest, plan, lx, y + RULE, qctx);
    }]] : []),
    1,
    fp,
  ]);
}

/**
 * Ticket: the sheet as a card set on the page, its corners cut for a tear line; the partner and the title along
 * the top, the list as a programme's with dotted leaders, and a stub at the foot with the day and the code.
 */
function ticketBoard(T, P, probe, B, ctx) {
  const fm = z(P, 0.5, 0.26), pad = z(P, 0.5, 0.3), x0 = fm + pad, inner = P.w - 2 * x0;
  const card = T.PANEL;
  const box = logoBox({ w: z(P, 2.2, 1.8), h: z(P, 1.9, 1.5) }, { w: z(P, 4.8, 3.8), h: z(P, 1.0, 0.75) });
  const hero = heroOf(probe, box, z(P, 22, 20));
  // on a full sheet a crest stands at the left with the title beside it; a wordmark and a phone stack them, centred
  const side = !P.ph && hero.kind && !hero.wide;
  const textW = side ? inner - hero.w - 0.45 : inner;
  const tb = titleBlock(P, probe, { ...B, line: "" }, textW, { size: z(P, 26, 22), ha: side ? "right" : "center" });
  const hgap = z(P, 0.4, 0.3);
  const headH = side ? Math.max(hero.h, tb.h) : (hero.kind ? hero.h + hgap : 0) + tb.h;
  const qr = qrIn({ T }) ? z(P, 0.8, 0.62) : 0;
  const stubH = Math.max(qr + 0.3, z(P, 0.95, 0.85));
  const fixedTop = fm + pad + headH + z(P, 0.5, 0.4);
  const plan = planList(P, B.rows.length, P.minH - fixedTop - HEADS - stubH - fm - pad - 0.8, { ...LIST(P), inner, single: inner });
  const parts = [
    [fm + pad, () => {}],
    [headH, (fig, y) => {
      if (side) {
        drawHero(fig, hero, x0, y + (headH - hero.h) / 2, "left");
        tb.draw(fig, P.w - x0, y + (headH - tb.h) / 2, {});
      } else {
        if (hero.kind) drawHero(fig, hero, P.w / 2, y);
        tb.draw(fig, P.w / 2, y + (hero.kind ? hero.h + hgap : 0), {});
      }
    }],
    [z(P, 0.5, 0.4), (fig, y) => fig.line(x0, y + z(P, 0.25, 0.2), P.w - x0, y + z(P, 0.25, 0.2), T.LINE, 0.8)],
    0.8,
    [HEADS, (fig, y) => drawHeads(fig, plan, x0, y + HEADS / 2, ctx, "ticket")],
    [plan.h, (fig, y) => drawList(fig, "ticket", B.rows, plan, x0, y, ctx)],
    1,
    ...(B.tied ? [[0.45, (fig, y) => tieNote(fig, y + 0.22, P)]] : []),
    [stubH + pad + fm, (fig, y) => ticketStub(fig, P, y, stubH, { fm, pad, x0, inner, qr, line: B.line })],
  ];
  return stackUp(P, T, parts, ticketUnder(fm, card));
}

/** The stub under the tear: the day's line and the partner's at the left, the code and the credit at the right. */
function ticketStub(fig, P, y, stubH, { fm, pad, x0, inner, qr, line }) {
  const T = fig.T, tear = y, sy = tear + (stubH + pad * 0.4) / 2;
  fig.line(fm + 0.3, tear, P.w - fm - 0.3, tear, T.INK_3, 1, [3, 4]);
  for (const ex of [fm, P.w - fm]) notch(fig, ex, tear, z(P, 0.5, 0.4), fm);
  const B = brandNow(), cw = B ? fig.measure(creditText(B), CREDIT_SZ(fig), "display") : 1.2;
  // the line stands level with the code, the partner's own line level with the credit under it
  const left = [line, footLine()].filter(Boolean), wide = inner - Math.max(qr, cw) - 0.35;
  if (left[0]) spaced(fig, x0, sy - (left[1] ? 0.16 : 0), left[0], { size: z(P, 10, 9.5), ha: "left", color: T.INK_2, maxW: qr ? inner - qr - 0.35 : wide });
  if (left[1]) fitted(fig, x0, sy + 0.2, left[1], wide, FOOT_SZ, 10, { color: T.INK_3, va: "center" });
  const R = P.w - x0;
  if (qr) drawQR(fig, R - qr, sy - qr / 2 - 0.08, qr);
  credit(fig, qr ? sy + qr / 2 + 0.12 : sy + 0.06, { ha: "right", x: R });
}

/** The ticket's card, under everything, at the height the page came to. */
const ticketUnder = (fm, card) => fig => rr(fig, fm, fm, fig.w - 2 * fm, fig.h - 2 * fm, 0.16, card, { stroke: fig.T.LINE, lw: 0.8 });
/** A half-moon bitten from the card's edge for the tear, its edge ruled like the card's own. */
function notch(fig, cx, cy, d, fm) {
  fig.disc(cx, cy, d, fig.T.BG);
  const c = fig.ctx;
  c.save();
  c.beginPath();
  c.rect(fig.px(fm), fig.px(fm), fig.px(fig.w - 2 * fm), fig.px(fig.h - 2 * fm));
  c.clip();
  fig.circle(cx, cy, d, fig.T.LINE, 0.8);
  c.restore();
}

// ---------------------------------------------------------------- what a board is made from
export function dayOutSheet(M, T, style) {
  const B = brandNow(), s = styleOf("dayout", style);
  const title = (B && B.titles && B.titles.stbl) || "Stableford";
  const day = (B && B.date) || longDate(M.date);
  const rows = M.stbl_board.map(p => ({ place: p.splace, name: p.name, value: String(p.pts) }));
  const tied = rows.some((r, i) => i && r.value === rows[i - 1].value);
  return board(T, s, { title: M.name, line: [title, day].filter(Boolean).join(SEP), label: "Points", rows, tied });
}

export function leagueSheet(Sx, g, T, kind, style) {
  const B = brandNow(), s = styleOf("league", style);
  const title = (B && B.titles && B.titles.standings) || TABLE_TITLES[kind] || TABLE_TITLES.stableford;
  const rounds = Sx.rounds || [], dates = rounds.map(r => r.date).filter(Boolean).sort();
  const span = dates.length ? (dates[0] === dates[dates.length - 1] ? shortDate(dates[0])
    : `${shortDate(dates[0], dates[0].slice(0, 4) !== dates[dates.length - 1].slice(0, 4))} – ${shortDate(dates[dates.length - 1])}`) : "";
  const line = [title, `${rounds.length} round${rounds.length === 1 ? "" : "s"}`, (B && B.date) || span].filter(Boolean).join(SEP);
  const match = kind.startsWith("match") || kind.startsWith("soccer");
  const label = match ? "Points" : kind === "stroke" ? (Sx.bestN > 0 ? `Best ${Sx.bestN}` : "Net to par") : Sx.bestN > 0 ? `Best ${Sx.bestN}` : "Points";
  const value = r => match ? String(r.points) : kind === "stroke" ? (r.played ? fmtToPar(r.counted) : "–") : String(r.counted);
  const rows = Sx.rows.map(r => ({ place: r.place, name: r.name, value: value(r), aside: r.played }));
  // a table reads equal figures as an equal place, =4 and =4, the way a society's noticeboard does
  rows.forEach((r, i) => {
    const prev = rows[i - 1], next = rows[i + 1];
    if (r.value === "–") return;
    if (prev && prev.value === r.value) r.tie = prev.tie;
    else if (next && next.value === r.value) r.tie = r.place;
  });
  return board(T, s, { title: g.name, line, label, asideLabel: match ? "Played" : "Rounds", rows });
}

// ---------------------------------------------------------------- one golfer's card
function playerOf(M, name) {
  const p = M.players.find(p => p.name === name) || M.stbl_board[0] || M.players[0];
  if (!p) throw new Error("Nobody on this card has a score yet");
  return p;
}
/** Gross, points and net, the order they are read in, points the one that settled the day. */
const figures = (M, p) => [
  { label: "Gross", value: p.nr || p.gross === null ? "NR" : String(p.gross) },
  { label: "Points", value: String(p.pts), lead: true },
  { label: "Net", value: p.nr || p.net === null ? "NR" : String(p.net) },
];
const placeLine = (M, p) => p.splace ? `${ordinal(p.splace)} of ${M.field} on points` : "";

/** The holes in a strip: the hole number over the score in scorecard notation, in one row or front over back. */
function stripPlan(M, w, P, rows) {
  const n = M.n, per = rows === 2 && n > 9 ? Math.ceil(n / 2) : n;
  const cell = Math.min(z(P, 0.46, 0.5), w / per), lines = Math.ceil(n / per);
  const rowH = cell + z(P, 0.26, 0.26);
  return { per, cell, lines, rowH, h: lines * rowH + (lines - 1) * 0.12 };
}
function drawStrip(fig, M, p, cx, y, plan, { boxes = false } = {}) {
  const T = fig.T, n = M.n, L = M.labels;
  // the partner's palette only: under par in its accent, over par in its ink faded toward the page
  const over = mix(T.INK, T.BG, 0.45), glyphs = [T.ACCENT, T.INK, over, over];
  for (let l = 0; l < plan.lines; l++) {
    const a = l * plan.per, b = Math.min(n, a + plan.per), cnt = b - a;
    const x0 = cx - cnt * plan.cell / 2, top = y + l * (plan.rowH + 0.12);
    const ax = inchAxes(fig, x0, top, cnt * plan.cell, plan.rowH);
    for (let h = a; h < b; h++) {
      const x = (h - a + 0.5) * plan.cell, sy = STRIP_LABEL + plan.cell / 2;
      ax.text(x, 0.09, L[h], { size: plan.cell > 0.42 ? 9 : 8, color: T.INK_3, ha: "center", va: "center" });
      if (boxes) rr(fig, x0 + (h - a) * plan.cell + 0.03, top + STRIP_LABEL, plan.cell - 0.06, plan.cell, 0.04, T.BG);
      const s = p.scores[h], fs = plan.cell * 72 * 0.36;
      if (s === null) ax.text(x, sy, "–", { size: fs, family: "display", color: T.INK_3, ha: "center", va: "center" });
      else if (boxes) ax.text(x, sy, String(s), { size: fs, family: "display", color: p.deltas[h] < 0 ? T.ACCENT : T.INK, ha: "center", va: "center" });
      else scoreGlyph(ax, x, sy, plan.cell * 0.92, p.deltas[h], String(s), fs, 1.1, null, glyphs);
    }
  }
}
const STRIP_LABEL = 0.22;   // the hole number's line over each cell

/** Points a hole as a row of ticks, the taller the better: the round's shape with no numbers on it at all. */
function ticksH(P) { return z(P, 0.7, 0.62); }
function drawTicks(fig, M, p, cx, y, w, P) {
  const T = fig.T, n = M.n, pitch = Math.min(z(P, 0.3, 0.24), w / n), H = ticksH(P) - 0.12, unit = H / 4;
  const x0 = cx - n * pitch / 2, base = y + H;
  for (let h = 0; h < n; h++) {
    const pts = p.hpts[h], x = x0 + (h + 0.5) * pitch, bw = pitch * 0.42;
    if (p.scores[h] === null) { fig.line(x - bw / 2, base, x + bw / 2, base, T.INK_3, 1); continue; }
    if (!pts) { fig.disc(x, base - 0.03, 0.05, T.INK_3); continue; }
    rr(fig, x - bw / 2, base - Math.min(4.6, pts) * unit, bw, Math.min(4.6, pts) * unit, bw / 2, pts >= 3 ? T.ACCENT : pts === 2 ? T.INK_2 : T.INK_3);
  }
  fig.line(x0, base + 0.06, x0 + n * pitch, base + 0.06, T.LINE, 0.6);
}

/** Three figures across: points large in the middle, gross and net either side, small caps under each. */
function figuresH(P, big) { return (big ? z(P, 1.35, 1.15) : z(P, 1.1, 0.95)); }
function drawFigures(fig, M, p, cx, y, w, P, { big = true, ink, mute, accent } = {}) {
  const T = fig.T, F = figures(M, p), step = w / 3;
  F.forEach((f, i) => {
    const x = cx - w / 2 + (i + 0.5) * step;
    const sz = f.lead ? (big ? z(P, 64, 52) : z(P, 50, 42)) : (big ? z(P, 34, 28) : z(P, 30, 25));
    const vy = y + figuresH(P, big) - z(P, 0.42, 0.38);
    fig.text(x, vy, f.value, { size: sz, family: "display", weight: f.lead ? 400 : 300, color: f.value === "NR" ? (mute || T.INK_3) : f.lead ? (accent || T.ACCENT) : (ink || T.INK), ha: "center", va: "bottom" });
    spaced(fig, x, vy + z(P, 0.24, 0.22), f.label, { size: z(P, 9.5, 10), color: mute || T.INK_3 });
  });
  for (const k of [1, 2]) {
    const x = cx - w / 2 + k * step;
    fig.line(x, y + z(P, 0.25, 0.2), x, y + figuresH(P, big) - z(P, 0.4, 0.36), mix(mute || T.INK_3, T.BG, 0.5), 0.6);
  }
}

export function personalSheet(M, playerName, T, style) {
  const s = styleOf("personal", style), P = pageFor(T, true), p = playerOf(M, playerName);
  const probe = new Fig(P.w, 1, T, 20), B = brandNow();
  const day = (B && B.date) || longDate(M.date);
  const line = [M.name, day].filter(Boolean).join(SEP);
  const draw = { crest: crestCard, banner: bannerCard, numeral: numeralCard, ticket: ticketCard }[s];
  return draw(T, P, probe, M, p, line);
}

/** Crest: the logo over the name, the three figures, and the holes front over back. */
function crestCard(T, P, probe, M, p, line) {
  const inner = P.w - 2 * P.m;
  const hero = heroOf(probe, logoBox({ w: z(P, 2.2, 1.8), h: z(P, 1.9, 1.5) }, { w: z(P, 4.6, 3.8), h: z(P, 0.85, 0.7) }), z(P, 30, 24));
  const tb = titleBlock(P, probe, { title: p.name, line }, inner, { size: z(P, 34, 28) });
  const sp = stripPlan(M, Math.min(inner, z(P, 4.6, inner)), P, 2);
  const pl = placeLine(M, p);
  return stackUp(P, T, [
    [P.top, () => {}],
    ...(hero.kind ? [[hero.h + z(P, 0.42, 0.32), (fig, y) => drawHero(fig, hero, P.w / 2, y)]] : []),
    [tb.h, (fig, y) => tb.draw(fig, P.w / 2, y)],
    1,
    [figuresH(P, true), (fig, y) => drawFigures(fig, M, p, P.w / 2, y, Math.min(inner, z(P, 5.4, inner)), P)],
    [pl ? 0.45 : 0, (fig, y) => pl && spaced(fig, P.w / 2, y + 0.22, pl, { size: z(P, 10, 10), color: T.INK_2 })],
    1,
    [sp.h, (fig, y) => drawStrip(fig, M, p, P.w / 2, y, sp)],
    1,
    [z(P, 0.7, 0.6), (fig) => credit(fig, fig.h - z(P, 0.4, 0.32))],
  ]);
}

/** Banner: the name reversed out of the partner's colour, the logo's plate hanging from it, the holes front over back. */
function bannerCard(T, P, probe, M, p, line) {
  const inner = P.w - 2 * P.m, band = T.ACCENT, ink = on(T, band);
  const plate = plateOf(probe, P);
  const tb = titleBlock(P, probe, { title: p.name, line }, inner, { size: z(P, 34, 27) });
  const bandH = P.top + tb.h + (plate ? plate.h / 2 + z(P, 0.36, 0.28) : 0.5);
  const sp = stripPlan(M, Math.min(inner, z(P, 5.6, inner)), P, 2);
  const pl = placeLine(M, p);
  return stackUp(P, T, [
    [bandH, (fig, y) => {
      rect(fig, 0, y, fig.w, bandH, band);
      tb.draw(fig, P.w / 2, y + P.top, { kick: ink, title: ink, line: mix(ink, band, 0.28) });
      if (plate) drawPlate(fig, plate, P.w / 2, y + bandH);
    }],
    [plate ? plate.h / 2 : 0, () => {}],
    1,
    [figuresH(P, true), (fig, y) => drawFigures(fig, M, p, P.w / 2, y, Math.min(inner, z(P, 5.6, inner)), P)],
    [pl ? 0.45 : 0, (fig, y) => pl && spaced(fig, P.w / 2, y + 0.22, pl, { size: z(P, 10, 10), color: T.INK_2 })],
    1,
    [sp.h, (fig, y) => drawStrip(fig, M, p, P.w / 2, y, sp)],
    0.8,
    [z(P, 0.8, 0.7), (fig, y) => {
      const foot = footLine();
      if (foot) fitted(fig, P.w / 2, y + 0.05, foot, inner, FOOT_SZ, 10, { color: T.INK_2, ha: "center", va: "center" });
      credit(fig, fig.h - z(P, 0.4, 0.32));
    }],
  ]);
}

/**
 * Numeral: the points the day came to, set as one enormous figure, the partner's logo as a faint watermark behind
 * it and crisp at the top; the round underneath is a row of ticks, a hole each, as tall as its points.
 */
function numeralCard(T, P, probe, M, p, line) {
  const inner = P.w - 2 * P.m;
  const hero = heroOf(probe, logoBox({ w: z(P, 1.3, 1.1), h: z(P, 1.1, 0.95) }, { w: z(P, 3.8, 3.2), h: z(P, 0.75, 0.65) }), z(P, 18, 16));
  const nameT = titleLines(probe, p.name, inner, z(P, 26, 22), 15, 2);
  const numSz = z(P, 230, 180), numH = numSz / 72 * 0.86;
  const sub = [`Gross ${p.nr || p.gross === null ? "NR" : p.gross}`, `Net ${p.nr || p.net === null ? "NR" : p.net}`, p.splace ? `${ordinal(p.splace)} of ${M.field}` : ""].filter(Boolean).join(SEP);
  return stackUp(P, T, [
    [P.top, () => {}],
    ...(hero.kind ? [[hero.h + 0.3, (fig, y) => drawHero(fig, hero, P.w / 2, y)]] : []),
    [0.4, (fig, y) => spaced(fig, P.w / 2, y + 0.16, line, { size: z(P, 10.5, 10), color: T.INK_3, maxW: inner })],
    1,
    [linesH(nameT.lines.length, nameT.size) + 0.1, (fig, y) => drawLines(fig, P.w / 2, y, nameT, { color: T.INK })],
    [numH + 0.2, (fig, y) => {
      // a crest sits behind the figure as a watermark; a wordmark's letters would only fight the numerals
      const L = hero.kind === "logo" && !hero.wide ? logoFit(z(P, 6.2, 4.6), numH * 1.2) : null;
      if (L) {
        fig.ctx.globalAlpha = 0.07;
        drawLogo(fig, P.w / 2 - L[0] / 2, y + numH / 2 + 0.1 - L[1] / 2, L[0], L[1]);
        fig.ctx.globalAlpha = 1;
      }
      fig.text(P.w / 2, y + 0.1 + numH / 2, String(p.pts), { size: numSz, family: "display", weight: 200, color: T.ACCENT, ha: "center", va: "center" });
    }],
    [0.4, (fig, y) => spaced(fig, P.w / 2, y + 0.2, "Stableford points", { size: z(P, 10.5, 10.5), color: T.INK_2, family: "display", weight: 500, track: 0.3 })],
    [0.42, (fig, y) => spaced(fig, P.w / 2, y + 0.24, sub, { size: z(P, 10, 10), color: T.INK_3, maxW: inner })],
    1,
    [ticksH(P), (fig, y) => drawTicks(fig, M, p, P.w / 2, y, inner, P)],
    0.7,
    [z(P, 0.6, 0.5), (fig) => credit(fig, fig.h - z(P, 0.4, 0.32))],
  ]);
}

/**
 * Ticket: the card as an admission ticket, the round on the body. A crest stands on a stub at the left; a wordmark
 * or a name, never turned on its side, heads the card instead over a stub at the foot, as on a phone and a board.
 */
function ticketCard(T, P, probe, M, p, line) {
  const fm = z(P, 0.45, 0.26), card = T.PANEL;
  const stubW = 2.25, hero = heroOf(probe, { w: stubW - 0.5, h: 2.4 }, 18);
  if (P.ph || hero.kind !== "logo" || hero.wide) return ticketCardFoot(T, P, probe, M, p, line, fm, card);
  // full: the stub is a column at the left, the tear runs down the card
  const H = P.minH, cardH = H - 2 * fm, tearX = fm + stubW;
  const fig = new Fig(P.w, H, T);
  ticketUnder(fm, card)(fig);
  fig.line(tearX, fm + 0.3, tearX, H - fm - 0.3, T.INK_3, 1, [3, 4]);
  for (const ey of [fm, H - fm]) notch(fig, tearX, ey, 0.5, fm);
  const sx = fm + stubW / 2;
  drawHero(fig, hero, sx, fm + 0.6);
  const qr = qrIn(fig) ? 0.85 : 0;
  if (qr) drawQR(fig, sx - qr / 2, H - fm - 0.5 - qr - 0.3, qr);
  credit(fig, H - fm - 0.42, { x: sx });
  // the body
  const bx = tearX + 0.55, bw = P.w - fm - 0.5 - bx, cx = bx + bw / 2;
  let y = fm + 0.75;
  const kick = kickerText();
  if (kick) { spaced(fig, bx, y, kick, { size: 10.5, color: T.ACCENT, ha: "left", family: "display", weight: 500, maxW: bw }); y += 0.4; }
  const t = titleLines(probe, p.name, bw, 32, 18, 2);
  drawLines(fig, bx, y, t, { ha: "left" });
  y += linesH(t.lines.length, t.size) + 0.1;
  spaced(fig, bx, y + 0.12, line, { size: 10.5, ha: "left", color: T.INK_3, maxW: bw });
  y += 0.6;
  fig.line(bx, y, bx + bw, y, T.LINE, 0.8);
  const sp = stripPlan(M, bw, P, 2), stripTop = H - fm - 0.55 - sp.h, pl = placeLine(M, p);
  const figsH = figuresH(P, true) + (pl ? 0.4 : 0), fy = y + (stripTop - y - figsH) / 2;
  drawFigures(fig, M, p, cx, fy, bw, P, { big: true });
  if (pl) spaced(fig, cx, fy + figuresH(P, true) + 0.22, pl, { size: 10, color: T.INK_2 });
  drawStrip(fig, M, p, cx, stripTop, sp, { boxes: true });
  return fig;
}
function ticketCardFoot(T, P, probe, M, p, line, fm, card) {
  const pad = z(P, 0.5, 0.3), x0 = fm + pad, inner = P.w - 2 * x0;
  const hero = heroOf(probe, logoBox({ w: z(P, 2.0, 1.6), h: z(P, 1.7, 1.3) }, { w: z(P, 4.8, 3.8), h: z(P, 1.0, 0.75) }), z(P, 24, 20));
  const hgap = z(P, 0.4, 0.3);
  // the partner heads the card as it heads a ticket board, and the day's line goes down to the stub with the code
  const tb = titleBlock(P, probe, { title: p.name, line: "" }, inner, { size: z(P, 34, 27) });
  const sp = stripPlan(M, Math.min(inner, z(P, 5.6, inner)), P, 2);
  const qr = qrIn({ T }) ? z(P, 0.8, 0.62) : 0;
  const stubH = Math.max(qr + 0.3, z(P, 0.95, 0.85));
  const parts = [
    [fm + pad, () => {}],
    ...(hero.kind ? [[hero.h + hgap, (fig, y) => drawHero(fig, hero, P.w / 2, y)]] : []),
    [tb.h, (fig, y) => tb.draw(fig, P.w / 2, y)],
    1,
    [figuresH(P, true), (fig, y) => drawFigures(fig, M, p, P.w / 2, y, Math.min(inner, z(P, 5.4, inner)), P)],
    [0.45, (fig, y) => { const pl = placeLine(M, p); if (pl) spaced(fig, P.w / 2, y + 0.22, pl, { size: z(P, 10, 10), color: T.INK_2 }); }],
    1,
    [sp.h, (fig, y) => drawStrip(fig, M, p, P.w / 2, y, sp, { boxes: true })],
    1,
    [stubH + pad + fm, (fig, y) => ticketStub(fig, P, y, stubH, { fm, pad, x0, inner, qr, line })],
  ];
  return stackUp(P, T, parts, ticketUnder(fm, card));
}
