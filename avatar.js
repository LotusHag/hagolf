// A golfer, or a society's animal, from a few named parts on a 48 grid, drawn by whichever theme is on screen.
// The phone stores the words (`1.m.address.navy.sand...`, `crest:heron.navy.l`), never a picture, so the same
// golfer is the same on every phone and each theme draws it in its own hand.
import { contrast, mix, oklab, fromOklab, house, wobble } from "./draw.js";

// ---------------------------------------------------------------- the names, and each theme's shade of them
const oklch = ([L, C, h]) => fromOklab([L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)]);
const lch = hex => { const [L, a, b] = oklab(hex); return [L, Math.hypot(a, b), Math.atan2(b, a) * 180 / Math.PI]; };
const blend = (x, y, t) => { const a = oklab(x), b = oklab(y); return fromOklab(a.map((v, i) => v + (b[i] - v) * t)); };

export const CLOTH = { white: [.97, .005, 95], black: [.23, .01, 265], grey: [.62, .01, 250], sand: [.82, .05, 80], brown: [.36, .06, 50], navy: [.31, .09, 264], blue: [.50, .16, 258],
  sky: [.78, .08, 230], green: [.46, .11, 155], red: [.54, .19, 27], pink: [.76, .11, 0], orange: [.70, .16, 50], yellow: [.87, .15, 95], purple: [.46, .15, 305] };
export const HAIR = { black: [.25, .01, 60], brown: [.38, .06, 55], auburn: [.50, .12, 40], blonde: [.80, .09, 85], grey: [.66, .01, 80], white: [.93, .01, 90] };
const SKIN = [[.90, .04, 65], [.80, .07, 60], [.68, .09, 52], [.53, .08, 45], [.39, .06, 40]];
const SNAP = ["ACCENT", "ACCENT_2", "UNDER", "DOUBLE", "BOGEY", "BAR", "BRONZE"];

// a theme's own colour stands in for a name only when it is plainly the same colour: close in lightness, chroma and hue
function ownShade(T, v) {
  if (v === "white" || v === "black") return null;
  const [L, C, h] = lch(oklch(CLOTH[v]));
  const fits = SNAP.filter(k => T[k]).map(k => { const [L2, C2, h2] = lch(T[k]), dh = Math.abs(((h2 - h + 540) % 360) - 180);
    return Math.abs(L2 - L) < 0.09 && Math.abs(C2 - C) < 0.035 && (C < 0.03 ? C2 < 0.03 : dh < 16) ? [Math.abs(L2 - L) + Math.abs(C2 - C) + dh / 360, k] : null; }).filter(Boolean);
  return fits.length ? fits.sort((a, b) => a[0] - b[0])[0][1] : null;
}

/** A named colour in this theme's ink, for a golfer's clothes, hair or skin, or a crest's field. */
function inkOf(T, slot, v) {
  const S = style(T);
  let c;
  if (slot === "skin") c = blend(oklch(SKIN[v - 1] || SKIN[1]), T.INK, 0.04);
  else if (slot === "hair") c = blend(oklch(HAIR[v] || HAIR.brown), T.INK, 0.06);
  else if (v === "white") c = S.dark ? blend(T.INK, "#ffffff", 0.45) : blend(T.BG, "#ffffff", 0.7);
  else if (v === "black") c = S.dark ? blend(T.BG, "#000000", 0.4) : T.INK;
  else { const o = ownShade(T, v); c = o ? T[o] : blend(oklch(CLOTH[v] || CLOTH.navy), T.INK, 0.08); }
  if (S.hand === "pencil") c = blend(c, T.BG, 0.18);
  if (S.hand === "chalk" && S.dark) c = blend(c, "#ffffff", 0.22);
  if (S.hand === "neon" && S.dark) { const [L, a, b] = oklab(c); c = fromOklab([Math.max(L, 0.66), a * 1.25, b * 1.25]); }
  return c;
}

/** A named colour as a picker shows it: in a theme held to a few colours, the one it will actually be drawn in. */
export function swatchOf(T, slot, v) {
  const S = style(T), c = inkOf(T, slot === "field" ? "top" : slot, v);
  return S.palette && slot !== "skin" ? quant(S, c, slot === "field" ? null : S.ground) : c;
}

// a colour that would vanish into what it sits on steps a shade away from it, rather than growing an outline
function apart(c, ground, min) {
  let [L, a, b] = oklab(c);
  const down = oklab(ground)[0] > 0.6;
  for (let i = 0; i < 14 && contrast(fromOklab([L, a, b]), ground) < min; i++) L += down ? -0.04 : 0.04;
  return fromOklab([L, a, b]);
}
function quant(S, c, ground) {
  const [x, y, z] = oklab(c), d = p => { const [l, a, b] = oklab(p); return Math.hypot(l - x, a - y, b - z); };
  const order = [...S.palette].sort((p, q) => d(p) - d(q));
  return (ground && order.find(p => contrast(p, ground) > 1.3)) || order[0];
}
// the last step for every colour: Teletext's eight colours (a player's own skin tone excepted), a shade off the ground elsewhere
const settle = (S, c, ground, slot, min = 1.25) => S.palette ? (slot === "skin" ? c : quant(S, c, ground)) : apart(c, ground, min);

// ---------------------------------------------------------------- the theme's hand
const HANDS = { drawn: "drafted", neon: "neon", pencil: "pencil", chalk: "chalk", stitch: "stitch", mosaic: "mosaic", agate: "press" };
const FRAMES = { square: "square", frame: "square", cell: "square", giant: "square", slant: "slant", patch: "patch" };
// A theme that fills its score marks and its podium chips puts its crests on a bold field; one that draws them in
// line keeps the pale frame the golfers sit on and wears the colour in the animal. A washed-out theme stays pale.
const SOLID_GLYPHS = ["board", "blob", "tile", "mosaic", "stitch", "atomic", "heart"], SOLID_CHIPS = ["cell", "circle", "slant", "square", "patch", "heart"];
const STYLES = new Map();

function style(T) {
  const dark = T.mode === "dark", key = `${T.name}:${dark}`;
  if (STYLES.has(key)) return STYLES.get(key);
  const h = house(T), own = T.AVATAR || {}, mode = dark ? "dark" : "light";
  const sat = ["ACCENT", "ACCENT_2", "UNDER"].map(k => lch(T[k] || T.ACCENT)[1]).reduce((a, b) => a + b) / 3;
  const S = { T, dark, hand: HANDS[h.glyph] || "fill", frame: FRAMES[h.chip] || "circle", stroke: h.icons || 1.9, radius: h.radius ?? 1,
    round: !(h.radius === 0 && ["bar", "tile", "board"].includes(h.glyph)),
    ground: own.ground ? own.ground[mode] : blend(T.PANEL, T.ACCENT, dark ? 0.16 : 0.12),
    lean: h.chip === "slant" ? -9 : 0, bulk: 1 + Math.max(0, (h.radius ?? 1) - 1) * 0.08, palette: own.palette && own.palette[mode],
    crest: own.crest || (SOLID_GLYPHS.includes(h.glyph) && SOLID_CHIPS.includes(h.chip) && sat >= 0.06 ? "bold" : "pale") };
  STYLES.set(key, S);
  return S;
}

// ---------------------------------------------------------------- parts
const tp = (a, b, wa, wb, c, bare) => ({ t: "tp", a, b, wa, wb: wb ?? wa, c, bare });
const dc = (p, r, c) => ({ t: "dc", p, r, c });
const pg = (pts, c) => ({ t: "pg", pts, c });
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const oval = (cx, cy, rx, ry, n = 18) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
const mirror = pts => pts.map(([x, y]) => [48 - x, y]);
const rot = (pts, deg, [cx, cy]) => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
const flip = p => p.t === "tp" ? { ...p, a: [48 - p.a[0], p.a[1]], b: [48 - p.b[0], p.b[1]] } : p.t === "dc" ? { ...p, p: [48 - p.p[0], p.p[1]] } : { ...p, pts: mirror(p.pts) };

// Six stances, ground at 44.4; face 1 looks right, -1 left, 0 at you. At address, on the green and at the finish
// both hands share one grip, so one arm stands for two. `raised` draws the arms behind the head; `look` turns a
// golfer facing you toward what they hold, since a cap only reads by its peak.
const R = 4.4, LIMB = 3.4;
const POSES = {
  address: { face: 1, tilt: 30, hip: [17, 27.6], neck: [24, 17.6], head: [29.4, 9.9],
    legs: [[[17.6, 27.6], [21.2, 35.6], [20.6, 44.4]], [[16.8, 27.8], [19.4, 36], [17, 44.4]]],
    arms: [[[24.4, 19], [26.6, 25], [27.6, 31.2]]],
    club: [[27.6, 31.2], [36.6, 42.4]], driver: [38.6, 42.9], ball: [43.8, 41.3], tee: [[43.8, 42.4], [43.8, 44.6]] },
  finish: { face: -1, tilt: -6, hip: [24.4, 27], neck: [24, 17.2], head: [23.6, 7.8], behind: true, raised: true,
    legs: [[[22.8, 27.4], [21.8, 36], [21.4, 44.4]], [[26, 27.4], [29.2, 35.4], [31.2, 43.8]]],
    arms: [[[26.4, 18.4], [32.2, 13.4], [29.8, 4.6]]],
    club: [[29.8, 4.6], [37.4, 19.6]], driver: [38.2, 21.8] },
  putt: { face: 1, tilt: 28, hip: [17.6, 27.6], neck: [23.6, 19], head: [29, 11.4],
    legs: [[[18, 27.6], [20, 36], [19.8, 44.4]], [[17.2, 27.8], [18.4, 36], [17.2, 44.4]]],
    arms: [[[23.8, 20.4], [25, 26.4], [25.6, 31.6]]],
    club: [[25.6, 31.6], [27.2, 42.4]], putter: [[25.6, 42.2], [31.6, 44.6]], ball: [35.4, 43.2] },
  walk: { face: 1, tilt: 4, hip: [22, 27.2], neck: [23.2, 17.4], head: [24.2, 7.8],
    legs: [[[22, 27.6], [19.4, 35.6], [15.4, 43.4]], [[22, 27.6], [25.8, 35.2], [27.8, 44.4]]],
    arms: [[[23, 18.8], [19.2, 24.2], [15.4, 27.8]], [[23, 18.8], [25.8, 25.4], [28.6, 19.8]]],
    club: [[28.6, 19.8], [14.2, 10.8]], iron: [[12.2, 10.2], [15.8, 13.6]] },
  club: { face: 0, look: 1, hip: [21, 27], neck: [21, 17.2], head: [21, 7.8],
    legs: [[[19.3, 27.4], [18.8, 36], [18.2, 44.4]], [[22.7, 27.4], [23.2, 36], [23.8, 44.4]]],
    arms: [[[17.6, 18.2], [16.4, 23.8], [16.2, 29.6]], [[24.4, 18.2], [27.6, 23.2], [29.8, 27.4]]],
    club: [[30.2, 26.6], [31.2, 42.6]], iron: [[30.4, 41.6], [35.8, 44.6]] },
  flag: { face: 0, look: 1, hip: [21, 27], neck: [21, 17.2], head: [21, 7.8],
    legs: [[[19.3, 27.4], [18.8, 36], [18.2, 44.4]], [[22.7, 27.4], [23.2, 36], [23.8, 44.4]]],
    arms: [[[17.6, 18.2], [16.4, 23.8], [16.2, 29.6]], [[24.4, 18.2], [28.2, 21.8], [31.8, 19.6]]],
    pole: [[33, 4], [33, 44.6]], flag: [[33, 4.4], [41.4, 7.6], [33, 10.8]] },
};
export const STANCES = { address: "Address", finish: "Finish", putt: "Putt", walk: "Walk", club: "Club", flag: "Flag" };

function headwear(sp, P, c) {
  const f = P.look || P.face, t = (P.tilt || 0) * Math.PI / 180;
  const L = ([x, y]) => { const rx = x * Math.cos(t) - y * Math.sin(t), ry = x * Math.sin(t) + y * Math.cos(t); return [c[0] + rx * f, c[1] + ry]; };
  const behind = [], hair = [], hat = [];
  if (sp.hair === "long") behind.push(tp(L([-1.2, -0.4]), L([-2.6, 7]), 2 * R - 0.4, 2 * R - 2, "hair"));
  if (sp.hair === "tied") behind.push(tp(L([-R + 0.4, -1]), L([-R - 3, 3.6]), 3, 2, "hair"));
  if (sp.head !== "cap") hair.push(pg([[0.6, 0.4], ...arc(0, 0, R + 0.35, 150, 300)].map(L), "hair"));
  if (sp.head === "cap") hat.push(pg(arc(0, -0.3, R + 0.6, 180, 360).map(L), "hat"));
  if (sp.head === "visor") hat.push(tp(L([-R + 0.3, -1.8]), L([R - 0.3, -1.8]), 2, 2, "hat"));
  if (sp.head !== "none") hat.push(tp(L([0.4, -0.8]), L([R + 4.8, -0.1]), 2.3, 1.8, "hat"));
  return { behind, hair, hat };
}

// a pictogram: limbs of one weight, the head floating free, gaps rather than outlines
function golfer(sp) {
  const P = POSES[sp.pose], k = P.face === 0 ? 1.1 : 1, tw = (sp.fig === "f" ? [6.6, 7] : [7.4, 6.4]).map(w => w * k);
  const G = [], object = [];
  if (P.club) object.push(tp(P.club[0], P.club[1], 1.2, 1.2, "club", true));
  if (P.driver) object.push(pg(oval(P.driver[0], P.driver[1], 3, 1.9), "clubhead"));
  if (P.putter) object.push(pg([P.putter[0], [P.putter[1][0], P.putter[0][1]], P.putter[1], [P.putter[0][0], P.putter[1][1]]], "clubhead"));
  if (P.iron) object.push(pg([P.iron[0], [P.iron[1][0], P.iron[0][1] + 1], P.iron[1], [P.iron[0][0], P.iron[1][1]]], "clubhead"));
  if (P.tee) object.push(tp(P.tee[0], P.tee[1], 0.9, 0.7, "club", true));
  if (P.ball) object.push(dc(P.ball, 1.35, "ball"));
  if (P.behind) G.push({ prims: object });
  if (P.pole) G.push({ prims: [tp(P.pole[0], P.pole[1], 1.1, 1.1, "club", true), pg(P.flag, "flag")] });
  const leg = ([h, kn, a]) => sp.legs === "trousers" ? [tp(h, kn, LIMB, LIMB, "bottom"), tp(kn, a, LIMB, LIMB, "bottom")]
    : [tp(kn, a, LIMB, LIMB, "skin"), tp(h, kn, LIMB, LIMB, "skin"), ...(sp.legs === "shorts" ? [tp(h, lerp(h, kn, 0.72), LIMB + 0.6, LIMB + 0.8, "bottom")] : [])];
  G.push({ prims: leg(P.legs[0]) }, { lift: true, prims: leg(P.legs[1]) });
  if (sp.legs === "skirt") G.push({ prims: [tp(P.hip, lerp(P.hip, lerp(P.legs[0][1], P.legs[1][1], 0.5), 0.72), 8 * k, 11 * k, "bottom")] });
  const arm = ([s, e, h]) => [tp(s, e, LIMB - 0.2, LIMB - 0.2, "top"), tp(e, h, LIMB - 0.2, LIMB - 0.2, "top")];
  const front = P.raised ? [] : P.arms.slice(-1), back = P.arms.filter(a => !front.includes(a));
  for (const a of back) G.push({ prims: arm(a) });
  const hw = headwear(sp, P, P.head);
  if (hw.behind.length) G.push({ prims: hw.behind });
  G.push({ prims: [tp(P.neck, P.hip, ...tw, "top")] });
  G.push({ lift: true, prims: [dc(P.head, R, "skin"), ...hw.hair] });
  // the cap gets a gap of its own, so a white cap still parts from a pale face
  if (hw.hat.length) G.push({ lift: true, prims: hw.hat });
  if (!P.behind && object.length) G.push({ prims: object });
  for (const a of front) G.push({ lift: true, prims: arm(a) });
  return G;
}

// ---------------------------------------------------------------- a golfer, stored
const LOOK = ["fig", "pose", "top", "bottom", "legs", "head", "hat", "hair", "hairc", "skin"];
const CHOICES = { fig: ["m", "f"], pose: Object.keys(POSES), top: Object.keys(CLOTH), bottom: Object.keys(CLOTH), legs: ["trousers", "shorts", "skirt"],
  head: ["cap", "visor", "none"], hat: Object.keys(CLOTH), hair: ["short", "tied", "long"], hairc: Object.keys(HAIR), skin: ["1", "2", "3", "4", "5"] };
export const BLANK = { fig: "m", pose: "address", top: "navy", bottom: "sand", legs: "trousers", head: "cap", hat: "white", hair: "short", hairc: "brown", skin: 2 };
/** `1.m.address.navy...` as parts; a word this phone does not know falls back for that part alone. */
export function parseLook(s) {
  const v = /^1\./.test(s || "") ? String(s).split(".").slice(1) : null;
  if (!v) return null;
  return Object.fromEntries(LOOK.map((k, i) => [k, CHOICES[k].includes(v[i]) ? (k === "skin" ? Number(v[i]) : v[i]) : BLANK[k]]));
}
export const lookString = sp => ["1", ...LOOK.map(k => sp[k])].join(".");

// ---------------------------------------------------------------- a society's animal
// Each faces right and is one silhouette in the mark colour; "eye" parts are gaps in the field's colour. Frontal ones
// ignore the facing. Ten are anybody's; the other nine are unlocked by a word in the society's name.
export const ANIMALS = {
  albatross: { basic: true, words: ["albatross"], parts: () => {
    const wing = [[23, 24.2], [14, 20.8], [3.2, 23], [4, 25.8], [13.8, 25], [22, 29.4]];
    return [{ prims: [pg(wing, "mark"), pg(mirror(wing), "mark"), tp([24, 22], [24, 33], 5.4, 3.4, "mark"), pg([[22.2, 32], [25.8, 32], [24, 36.4]], "mark"), dc([24, 19.6], 3, "mark")] }]; } },
  eagle: { basic: true, frontal: true, words: ["eagle", "hawk", "falcon", "kestrel"], parts: () => {
    const wing = [[21.6, 21], [9, 9.6], [6.6, 14.6], [10.4, 17], [7.4, 20.6], [11.4, 22.6], [9.2, 26.6], [21.6, 29]];
    return [{ prims: [pg(wing, "mark"), pg(mirror(wing), "mark"), pg([[21.4, 32], [26.6, 32], [29, 40], [19, 40]], "mark")] },
      { lift: true, prims: [tp([24, 19.4], [24, 33], 7.4, 5.4, "mark"), dc([24, 14.8], 3.6, "mark"), pg([[26.4, 13.6], [30.6, 15], [26.6, 17.4]], "mark")] }]; } },
  birdie: { basic: true, words: ["birdie", "bird", "robin", "wren", "sparrow", "finch", "lark", "linnet"], parts: () => [
    { prims: [tp([8, 39.8], [40, 37.4], 1.6, 1.6, "mark"), tp([14.6, 29.4], [7.4, 35.4], 5, 3.2, "mark"), tp([21, 35], [20.4, 39.4], 1.3, 1.3, "mark"), tp([25.4, 34.4], [25.6, 39], 1.3, 1.3, "mark"),
      dc([22.4, 26.8], 9, "mark"), dc([30.6, 19], 5.8, "mark"), pg([[35.4, 17.4], [40.4, 19], [35.4, 20.8]], "mark"), dc([32.2, 17.8], 1.2, "eye")] }] },
  condor: { basic: true, words: ["condor", "vulture", "buzzard"], parts: () => [
    { prims: [tp([10, 40.6], [38, 40.6], 1.8, 1.8, "mark"), tp([21.4, 34], [21.4, 40], 1.6, 1.6, "mark"), tp([25.6, 33], [25.6, 40], 1.6, 1.6, "mark"), pg([[5, 38], [14, 30], [17.4, 35.6]], "mark"),
      tp([14.6, 32], [27.6, 25.4], 11.4, 10, "mark"), tp([29.6, 22.8], [34.4, 17.4], 3, 2.4, "mark"), dc([35.6, 15.8], 3, "mark"), pg([[37.6, 14], [41.4, 16.2], [39, 19.4], [37.4, 17.6]], "mark"),
      tp([27, 25], [31.6, 21.4], 4.6, 4.2, "eye"), dc([36.4, 15], 0.8, "eye")] }] },
  heron: { basic: true, words: ["heron", "crane", "egret", "stork"], parts: () => [
    { prims: [tp([21.6, 27], [21.6, 43], 1.5, 1.5, "mark"), tp([18.6, 43.2], [25, 43.2], 1.3, 1.3, "mark"), tp([24.2, 27], [27.6, 33.8], 1.3, 1.3, "mark"), tp([27.6, 33.8], [23.4, 36.6], 1.3, 1.3, "mark"),
      tp([13.4, 26.2], [28, 22.4], 6.8, 8.4, "mark"), tp([28, 21.8], [31.6, 15.4], 3, 2.6, "mark"), tp([31.6, 15.4], [29.4, 9.6], 2.6, 2.6, "mark"), dc([30.4, 8.6], 2.8, "mark"),
      pg([[32.6, 7.4], [42.4, 9.4], [32.6, 10.2]], "mark"), tp([28.6, 7.4], [22.6, 6], 1, 0.6, "mark"), dc([31.2, 7.8], 0.75, "eye")] }] },
  owl: { basic: true, frontal: true, words: ["owl", "hoot"], parts: () => [
    { prims: [tp([12, 40.6], [36, 40.6], 1.8, 1.8, "mark"), pg([[16.2, 12.6], [18.6, 5.6], [22, 11.6]], "mark"), pg(mirror([[16.2, 12.6], [18.6, 5.6], [22, 11.6]]), "mark"), tp([24, 17], [24, 33.4], 16.4, 13, "mark")] },
    { prims: [dc([20.4, 17], 3.4, "eye"), dc([27.6, 17], 3.4, "eye"), dc([20.4, 17], 1.4, "mark"), dc([27.6, 17], 1.4, "mark"), pg([[22.8, 20.4], [25.2, 20.4], [24, 23.6]], "eye")] }] },
  swan: { basic: true, words: ["swan", "cygnet"], parts: () => [
    { prims: [tp([7, 38.6], [41, 38.6], 1.3, 1.3, "mark"), pg([[8, 25.6], [16, 28], [14.4, 33]], "mark"), tp([14.8, 30.8], [30.6, 30.4], 9.6, 8, "mark"), tp([31, 29], [33.4, 20.6], 3.4, 3, "mark"), tp([33.4, 20.6], [31, 12.6], 3, 2.8, "mark"),
      dc([31.8, 11.4], 2.9, "mark"), pg([[34.2, 10.4], [40, 12.8], [33.8, 13.2]], "mark")] },
    { lift: true, prims: [tp([15.4, 28.4], [27, 29.6], 5.6, 3.4, "mark")] }] },
  hare: { basic: true, words: ["hare", "rabbit", "bunny", "leveret"], parts: () => [
    { prims: [tp([29.6, 16.6], [26.4, 4.6], 3.4, 2.6, "mark"), dc([21, 31], 9, "mark"), dc([12.2, 28.4], 2.8, "mark"), tp([15.4, 39.8], [27, 39.8], 3, 3, "mark"), dc([31.2, 20.6], 5.2, "mark"), tp([28.8, 26], [30.6, 39], 2.8, 2.6, "mark"), dc([33, 19.6], 1, "eye")] },
    { lift: true, prims: [tp([32.2, 16.4], [33.2, 4.2], 3.4, 2.6, "mark")] }] },
  fox: { basic: true, words: ["fox", "vixen", "reynard"], parts: () => [
    { prims: [tp([15.8, 29], [13.4, 39.6], 2.4, 2, "mark"), tp([19, 29], [19.8, 39.6], 2.4, 2, "mark"), tp([27.4, 29], [26, 39.6], 2.4, 2, "mark"), tp([30.4, 29], [32.4, 39.6], 2.4, 2, "mark"),
      tp([14.6, 26.6], [30.4, 25.6], 8, 7.4, "mark"), tp([14, 25.4], [4, 31.2], 4.6, 5.8, "mark"), pg([[29.4, 21.4], [36, 19.6], [43.4, 24.6], [35, 27.4], [29.4, 27.4]], "mark"),
      pg([[30.6, 22], [31.6, 13.6], [35.6, 20.4]], "mark"), dc([36.4, 22.2], 0.9, "eye")] }] },
  stag: { basic: true, frontal: true, words: ["stag", "deer", "hart", "hind", "buck", "roe"], parts: () => {
    const half = [tp([20.6, 17], [15.6, 5.4], 2.2, 1.8, "mark"), tp([17, 9.6], [11.2, 8.6], 1.8, 1.6, "mark"), tp([16.2, 7.4], [19, 3.6], 1.7, 1.5, "mark"), pg([[19.4, 19.4], [11.6, 16.6], [17.6, 22.4]], "mark")];
    return [{ prims: [...half, ...half.map(flip), pg([[18.4, 18.4], [29.6, 18.4], [27.6, 33], [24, 37.4], [20.4, 33]], "mark"), dc([21.4, 24], 1, "eye"), dc([26.6, 24], 1, "eye")] }]; } },
  duck: { words: ["duck", "mallard", "drake"], parts: () => [
    { prims: [tp([18.6, 33], [17.4, 40.6], 1.4, 1.4, "mark"), tp([24.4, 33], [25.4, 40.6], 1.4, 1.4, "mark"), pg([[13.4, 41.2], [19, 39.8], [19.6, 41.6]], "mark"), pg([[21.4, 41.2], [27, 39.8], [27.6, 41.6]], "mark"),
      pg([[6, 22.4], [14.4, 25.4], [13, 31.6]], "mark"), tp([12.6, 29], [28.6, 29.6], 11, 10, "mark"), tp([28.4, 26.4], [30.8, 20], 5.2, 4.6, "mark"), dc([31.6, 17.6], 4.6, "mark"),
      tp([35, 19.2], [41.4, 20.4], 3, 2.6, "mark"), dc([32.8, 16.4], 0.9, "eye")] }] },
  pheasant: { words: ["pheasant", "grouse", "partridge"], parts: () => [
    { prims: [pg([[22, 26.4], [3.4, 37.6], [4.6, 39.4], [22.6, 31]], "mark"), tp([25.2, 31], [24, 40.4], 1.3, 1.3, "mark"), tp([28.6, 30], [29.4, 40.4], 1.3, 1.3, "mark"),
      tp([21, 28.4], [31.6, 24.4], 9.4, 7.4, "mark"), tp([32, 23.4], [34.2, 19.4], 3.6, 2.8, "mark"), dc([35.2, 17.8], 2.9, "mark"), pg([[37.6, 16.8], [40.6, 18], [37.6, 19.2]], "mark"),
      pg([[34, 15.4], [33, 11.6], [36.4, 14.6]], "mark"), dc([35.8, 17.2], 0.8, "eye")] }] },
  squirrel: { words: ["squirrel"], parts: () => {
    const curl = arc(15, 24, 9.6, 95, 300, 8);
    return [{ prims: curl.slice(1).map((q, i) => tp(curl[i], q, 8.6 - i * 0.5, 8.6 - (i + 1) * 0.5, "mark")) },
      { lift: true, prims: [tp([26, 28], [24.6, 36.4], 7.4, 9.4, "mark"), tp([21.6, 40.4], [30.4, 40.4], 2.8, 2.8, "mark"), dc([30.6, 20.6], 4.4, "mark"), pg([[28.6, 17.6], [29.2, 12.2], [31.8, 16.8]], "mark"),
        tp([29.8, 27.2], [33.2, 28.6], 2.2, 2, "mark"), dc([32.2, 19.6], 0.9, "eye")] }]; } },
  hedgehog: { words: ["hedgehog", "urchin"], parts: () => {
    const spines = Array.from({ length: 15 }, (_, i) => { const a = (180 + i * 180 / 14) * Math.PI / 180, r = i % 2 ? 15 : 12; return [23 + r * Math.cos(a), 36 + r * Math.sin(a) * 0.95]; });
    return [{ prims: [pg([[8, 36], ...spines, [38, 36]], "mark"), pg([[33, 28.6], [43.6, 33.6], [42.6, 35.4], [33, 37]], "mark"), tp([14, 36], [14, 39.6], 2.2, 2.2, "mark"), tp([31, 36], [31, 39.6], 2.2, 2.2, "mark"), dc([36.6, 31.2], 0.9, "eye")] }]; } },
  ram: { words: ["ram", "sheep", "tup", "lamb", "ewe"], parts: () => [
    { prims: [tp([14.4, 33], [14.4, 41], 2, 2, "mark"), tp([18.6, 33], [18.6, 41], 2, 2, "mark"), tp([26.6, 33], [26.6, 41], 2, 2, "mark"), tp([30.4, 33], [30.4, 41], 2, 2, "mark"),
      dc([14, 27.6], 5.6, "mark"), dc([20.4, 24.4], 6, "mark"), dc([27.4, 25.6], 5.6, "mark"), dc([18.6, 30.6], 5.4, "mark"), dc([26.6, 30.6], 5.4, "mark"), tp([32.6, 23.4], [38.6, 29], 5.8, 3.8, "mark")] },
    { lift: true, prims: [dc([32.4, 21], 4, "mark"), dc([32.4, 21], 1.4, "eye")] }] },
  horse: { words: ["horse", "pony", "colt", "mare", "stallion", "foal"], parts: () => [
    { prims: [pg([[14, 42], [14.6, 28], [18.6, 17], [24.4, 10.4], [29.4, 9.2], [33.4, 12], [41.4, 21.4], [40.6, 26.2], [35.6, 26.6], [30.4, 22.4], [28, 28.6], [30.6, 42]], "mark"),
      pg([[24.4, 11.6], [25.4, 4.2], [28.6, 10]], "mark"), dc([30.6, 15.4], 1, "eye")] }] },
  trout: { words: ["trout", "fish", "salmon", "pike", "carp"], parts: () => {
    const c = [24, 24];
    return [{ prims: [pg(rot(oval(25, 24, 14, 6), -18, c), "mark"), pg(rot([[12.6, 24], [5, 18.6], [7.4, 24], [5, 29.4]], -18, c), "mark"), pg(rot([[22, 18.6], [26, 13.6], [28.6, 18.4]], -18, c), "mark"),
      pg(rot([[22.6, 29.4], [25.4, 33.4], [27.4, 29.4]], -18, c), "mark"), dc(rot([[33.6, 22.6]], -18, c)[0], 1, "eye"), tp(...rot([[30.4, 20.4], [30.4, 27.6]], -18, c), 0.8, 0.8, "eye")] }]; } },
  frog: { frontal: true, words: ["frog", "toad"], parts: () => [
    { prims: [tp([12.4, 32], [5.4, 40], 3.6, 3, "mark"), tp([35.6, 32], [42.6, 40], 3.6, 3, "mark"), tp([3, 40.8], [10, 40.8], 2, 2, "mark"), tp([38, 40.8], [45, 40.8], 2, 2, "mark"),
      pg(oval(24, 29.6, 13.6, 9), "mark"), dc([16.6, 20], 4.6, "mark"), dc([31.4, 20], 4.6, "mark"), tp([17.6, 35], [16, 41.4], 3, 2.6, "mark"), tp([30.4, 35], [32, 41.4], 3, 2.6, "mark")] },
    { prims: [dc([16.6, 19.6], 1.7, "eye"), dc([31.4, 19.6], 1.7, "eye"), tp([18.6, 29.6], [29.4, 29.6], 1, 1, "eye")] }] },
  bee: { words: ["bee", "bumblebee", "hornet", "wasp"], parts: () => [
    { prims: [pg(rot(oval(19.6, 14.4, 6.4, 3.8), -30, [19.6, 14.4]), "mark"), pg(rot(oval(28, 13, 5.6, 3.4), -60, [28, 13]), "mark")] },
    { lift: true, prims: [pg([[11.4, 27.2], [6.6, 28.6], [11.6, 30.4]], "mark"), pg(oval(23.6, 28.4, 12, 7.8), "mark"), dc([37.2, 27], 4.6, "mark"), tp([39, 23.2], [42.6, 17.6], 1, 0.9, "mark"),
      tp([20.4, 21.2], [19.6, 35.6], 1.8, 1.8, "eye"), tp([26.6, 20.8], [26.2, 36], 1.8, 1.8, "eye")] }] },
};
const BASIC = Object.keys(ANIMALS).filter(a => ANIMALS[a].basic);
export const FIELDS = ["navy", "green", "red", "blue", "purple", "brown", "orange", "black", "sky", "yellow", "pink"];

const WORDS = new Map(Object.entries(ANIMALS).flatMap(([a, x]) => x.words.map(w => [w, a])));
const wordsIn = name => String(name || "").toLowerCase().split(/[^a-z'’]+/).map(w => w.replace(/^['’]+|['’]s?$/g, "")).filter(Boolean);
const wordOf = w => [w, w.replace(/s$/, ""), w.replace(/es$/, "")].find(v => WORDS.has(v));
/** The animals a society's name unlocks, each with the word that did it, in the order they appear. */
function unlocked(name) {
  const out = new Map();
  for (const w of wordsIn(name)) { const v = wordOf(w); if (v && !out.has(WORDS.get(v))) out.set(WORDS.get(v), w); }
  return out;
}
/** What a society may pick from: the ten anybody has, what its name unlocks, and whatever it already wears. */
export function choices(g) {
  const u = unlocked(g.name), now = crestOf(g).animal;
  return Object.keys(ANIMALS).filter(a => ANIMALS[a].basic || u.has(a) || a === now).map(a => ({ animal: a, word: ANIMALS[a].basic ? null : u.get(a) || null }));
}

// The society's id never changes, so whatever a word does not choose is scrambled from it.
const scramble = h => (Math.imul(h, 0x9E3779B1) >>> 0) / 2 ** 32;
const fnv = s => { let h = 0x811C9DC5; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };
const KEY = /^crest:([a-z]+)\.([a-z]+)\.([lr])$/;
export const isCrest = s => KEY.test(s || "");
/** A society's crest: the one it keeps, else the first animal word in its name, else one of the ten from its id. */
export function crestOf(g) {
  const k = KEY.exec(g.icon || "");
  if (k && ANIMALS[k[1]] && CLOTH[k[2]]) return { animal: k[1], field: k[2], face: k[3] === "r" ? 1 : -1 };
  const h = fnv(g.id), first = unlocked(g.name).keys().next().value;
  return { animal: first || BASIC[Math.floor(scramble(h) * BASIC.length)], field: FIELDS[Math.floor(scramble(h + 7) * FIELDS.length)], face: scramble(h + 13) < 0.5 ? 1 : -1 };
}
export const crestKey = c => `crest:${c.animal}.${c.field}.${c.face > 0 ? "r" : "l"}`;

// ---------------------------------------------------------------- placing it: each drawing centred on its own weight
function inside(p, x, y) {
  if (p.t === "dc") return Math.hypot(x - p.p[0], y - p.p[1]) <= p.r;
  if (p.t === "tp") {
    const [ax, ay] = p.a, dx = p.b[0] - ax, dy = p.b[1] - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-6)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= (p.wa + (p.wb - p.wa) * t) / 2;
  }
  let c = false;
  for (let i = 0, j = p.pts.length - 1; i < p.pts.length; j = i++) {
    const [xi, yi] = p.pts[i], [xj, yj] = p.pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function extent(groups) {
  const prims = groups.flatMap(g => g.prims);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const p of prims) p.t === "tp" ? (grow(...p.a, p.wa / 2), grow(...p.b, p.wb / 2)) : p.t === "dc" ? grow(...p.p, p.r) : p.pts.forEach(q => grow(...q));
  const pts = [];
  for (let y = y0; y <= y1; y += 0.5) for (let x = x0; x <= x1; x += 0.5) if (prims.some(p => inside(p, x, y))) pts.push([x, y]);
  // the mass sets the middle across; down the frame it is split with the box, so a long club cannot push the head out
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = (pts.reduce((a, q) => a + q[1], 0) / pts.length + (y0 + y1) / 2) / 2;
  let rad = 0, half = 0;
  for (const [x, y] of pts) { rad = Math.max(rad, Math.hypot(x - cx, y - cy)); half = Math.max(half, Math.abs(x - cx), Math.abs(y - cy)); }
  return { cx, cy, rad: rad + 0.4, half: half + 0.4 };
}
const BASE = { circle: 1, square: 1, slant: 0.94, patch: 0.88, badge: 0.9 };
const SAFE = { circle: 22.4, square: 22.6, slant: 19.6, patch: 19.6, badge: 21.4 };
const PLACES = new Map();
function place(groups, frame, key, bulk) {
  if (!PLACES.has(key)) PLACES.set(key, extent(groups));
  const m = PLACES.get(key), s = Math.min(BASE[frame], SAFE[frame] / (frame === "circle" || frame === "patch" ? m.rad : m.half));
  const P = ([x, y]) => [(x - m.cx) * s + 24, (y - m.cy) * s + 24];
  return groups.map(g => ({ ...g, prims: g.prims.map(p => p.t === "tp" ? { ...p, a: P(p.a), b: P(p.b), wa: p.wa * s * (p.bare ? 1 : bulk), wb: p.wb * s * (p.bare ? 1 : bulk) }
    : p.t === "dc" ? { ...p, p: P(p.p), r: p.r * s } : { ...p, pts: p.pts.map(P) }) }));
}

// ---------------------------------------------------------------- drawing
const r1 = v => Math.round(v * 10) / 10;
function outline(p) {
  if (p.t === "pg") return p.pts;
  if (p.t === "dc") return arc(p.p[0], p.p[1], p.r, 0, 360, 20).slice(1);
  const [ax, ay] = p.a, [bx, by] = p.b, L = Math.hypot(bx - ax, by - ay) || 1e-6, d = [(bx - ax) / L, (by - ay) / L], n = [-d[1], d[0]], pts = [];
  for (let i = 0; i <= 8; i++) { const th = (90 - 22.5 * i) * Math.PI / 180; pts.push([bx + p.wb / 2 * (d[0] * Math.cos(th) + n[0] * Math.sin(th)), by + p.wb / 2 * (d[1] * Math.cos(th) + n[1] * Math.sin(th))]); }
  for (let i = 0; i <= 8; i++) { const th = (-90 + 22.5 * i) * Math.PI / 180; pts.push([ax + p.wa / 2 * (-d[0] * Math.cos(th) + n[0] * Math.sin(th)), ay + p.wa / 2 * (-d[1] * Math.cos(th) + n[1] * Math.sin(th))]); }
  return pts;
}
const path = pts => "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L") + "Z";
// by hand, each corner of a part is moved a little, the same way every time the same golfer is drawn
const roughen = (groups, seed, amp) => { const rnd = wobble(seed); return groups.map(g => ({ ...g, prims: g.prims.map(p => ({ ...p, t: "pg", pts: outline(p).map(([x, y]) => [x + rnd() * amp, y + rnd() * amp]) })) })); };
const seedOf = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);

// a person sits in the theme's chip shape; a society in a badge with the theme's corners, as uploaded icons do
function frameShape(frame, S) {
  if (frame === "slant" || frame === "badge" && S.frame === "slant") return `<path d="M7 0H48L41 48H0Z"/>`;
  if (frame === "badge") return `<rect width="48" height="48" rx="${r1(Math.min(14, Math.max(2, 6 * S.radius)) * 1.2)}"/>`;
  return frame === "square" ? `<rect width="48" height="48"/>` : `<circle cx="24" cy="24" r="24"/>`;
}

let uid = 0;
function render(groups, C, S, frame, ground, size, seedKey) {
  const T = S.T, id = `av${++uid}`, hand = S.hand;
  if (hand === "pencil" || hand === "chalk") groups = roughen(groups, seedOf(seedKey), hand === "chalk" ? 0.9 : 0.6);
  const all = groups.flatMap(g => g.prims), body = all.filter(p => !p.bare), col = p => C[p.c];
  const line = S.stroke * (0.5 + 12 / size), K = T.INK;
  const shape = (p, a) => `<path d="${path(outline(p))}" ${a}/>`;
  const halo = ps => ps.filter(p => !p.bare).map(p => shape(p, `fill="${ground}" stroke="${ground}" stroke-width="${r1(line * 1.4 + 0.7)}" stroke-linejoin="round"`)).join("");
  const fills = ps => ps.map(p => shape(p, `fill="${col(p)}"`)).join("");
  const over = (pattern, w, mark) => `<pattern id="${id}h" width="${w}" height="${w}" patternUnits="userSpaceOnUse" patternTransform="rotate(${pattern})">${mark}</pattern><mask id="${id}m">${body.map(p => shape(p, `fill="#fff"`)).join("")}</mask>`;
  let defs = "", out = "";
  if (hand === "mosaic") {
    const N = frame === "badge" ? 16 : 20, u = 48 / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let hit = null;
      for (const p of all) if (inside(p, (i + 0.5) * u, (j + 0.5) * u)) hit = p;
      if (hit) out += `<rect x="${r1(i * u)}" y="${r1(j * u)}" width="${r1(u + 0.05)}" height="${r1(u + 0.05)}" fill="${col(hit)}"/>`;
    }
  } else if (hand === "neon") {
    // the dark version glows: the same tube drawn wide and faint under itself
    out = groups.map(g => g.prims.map(p => p.bare ? shape(p, `fill="${col(p)}"`) : shape(p, `fill="${ground}"`)
      + (S.dark ? shape(p, `fill="none" stroke="${col(p)}" stroke-opacity=".3" stroke-width="${r1(line * 2.6)}" stroke-linejoin="round"`) : "")
      + shape(p, `fill="${col(p)}" fill-opacity="${S.dark ? 0.2 : 0.4}" stroke="${col(p)}" stroke-width="${r1(line * 0.8)}" stroke-linejoin="${S.round ? "round" : "miter"}"`)).join("")).join("");
  } else {
    for (const g of groups) out += (g.lift ? halo(g.prims) : "") + fills(g.prims)
      + (hand === "drafted" ? g.prims.filter(p => !p.bare).map(p => shape(p, `fill="none" stroke="${frame === "badge" ? C.mark : K}" stroke-opacity="${frame === "badge" ? 0.5 : 1}" stroke-width="${r1(line * 0.6)}" stroke-linejoin="round"`)).join("") : "");
    const tex = { stitch: [58, 1.2, `<rect width=".45" height="1.2" fill="#fff" fill-opacity=".3"/>`], press: [45, 1.4, `<circle cx=".7" cy=".7" r=".38" fill="${T.BG}" fill-opacity=".38"/>`],
      pencil: [-38, 1.4, `<rect width=".4" height="1.4" fill="${T.BG}" fill-opacity=".3"/>`], chalk: [60, 1.4, `<circle cx=".5" cy=".5" r=".32" fill="${T.BG}" fill-opacity="${S.dark ? 0.32 : 0}"/>`] }[hand];
    if (tex && (hand !== "chalk" || S.dark)) { defs += over(...tex); out += `<rect width="48" height="48" fill="url(#${id}h)" mask="url(#${id}m)"/>`; }
    if (hand === "drafted") { const ink = frame === "badge" ? C.mark : K;
      out += `<circle cx="24" cy="24" r="20.5" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="${r1(line * 0.4)}" stroke-dasharray="1.6 1.2"/><path d="M24 1.5V6M24 42V46.5M1.5 24H6M42 24H46.5" stroke="${ink}" stroke-opacity=".5" stroke-width="${r1(line * 0.4)}"/>`; }
  }
  if (S.lean) out = `<g transform="translate(${r1(-Math.tan(S.lean * Math.PI / 180) * 24)} 0) skewX(${S.lean})">${out}</g>`;
  const stitched = S.frame !== "patch" ? "" : (frame === "badge" ? `<rect x="2.8" y="2.8" width="42.4" height="42.4" rx="${r1(Math.max(0, Math.min(14, 6 * S.radius) * 1.2 - 2.8))}"` : `<circle cx="24" cy="24" r="21.4"`)
    + ` fill="none" stroke="${mix(ground, frame === "badge" ? C.mark : T.INK, 0.55)}" stroke-width="1" stroke-dasharray="1.8 1.3" stroke-linecap="round"/>`;
  // styled inline, so a list's rules for its icons (a small size, a stroke) never reach a golfer drawn in it
  return `<svg viewBox="0 0 48 48" aria-hidden="true" style="width:100%;height:100%;display:block;stroke:none"><defs><clipPath id="${id}c">${frameShape(frame, S)}</clipPath>${defs}</defs><g clip-path="url(#${id}c)"><g fill="${ground}">${frameShape(frame, S)}</g>${out}${stitched}</g></svg>`;
}

/** A golfer from its parts, in theme T, drawn for about `size` pixels. */
export function golferSvg(sp, T, size) {
  const S = style(T), g = S.ground;
  const C = { top: inkOf(T, "top", sp.top), bottom: inkOf(T, "bottom", sp.bottom), hat: inkOf(T, "hat", sp.hat), hair: inkOf(T, "hair", sp.hairc), skin: inkOf(T, "skin", sp.skin),
    ball: inkOf(T, "ball", "white"), flag: T.UNDER, club: mix(T.INK_3, g, 0.15), clubhead: T.INK_2 };
  // a cap is small and sits at the top against the frame, so it keeps a little more contrast than the clothes
  for (const k in C) C[k] = settle(S, C[k], g, k, k === "hat" ? 1.35 : 1.25);
  const key = [sp.pose, sp.fig, sp.legs, sp.head, sp.hair].join(".");
  return render(place(golfer(sp), S.frame, `${key}.${S.frame}`, S.bulk), C, S, S.frame, g, size, key);
}

/** A society's crest, in theme T: on a bold field in a theme that fills its marks, on the pale frame in one that draws them. */
export function crestSvg(g, T, size) {
  const S = style(T), c = crestOf(g), A = ANIMALS[c.animal], named = inkOf(T, "top", c.field);
  let field, mark;
  if (S.crest === "bold") {
    field = swatchOf(T, "field", c.field);
    const light = S.dark ? T.INK : mix(T.BG, "#FFFFFF", 0.5), dark = S.dark ? T.BG : T.INK;
    mark = contrast(light, field) >= contrast(dark, field) ? light : dark;
    if (S.palette) mark = quant(S, mark, field);
  } else {
    field = S.ground;
    mark = settle(S, named, field, "mark", 2.6);   // the animal is all a pale crest has, so it needs real contrast
  }
  let groups = A.parts();
  if (c.face < 0 && !A.frontal) groups = groups.map(gr => ({ ...gr, prims: gr.prims.map(flip) }));
  return render(place(groups, "badge", `${c.animal}.${A.frontal ? 1 : c.face}`, 1), { mark, eye: field }, S, "badge", field, size, c.animal);
}
