// One player, one hole, everything about it in one block: the score on a − / + stepper that starts at the par
// of the hole, and every extra that card is keeping on the same stepper beside it. Nothing is asked in
// sequence and nothing is folded away, so a player is filled in at a glance and in one go.
//
// Both screens draw it: the scoring screen once per player, and the check screen for the hole being corrected,
// so a number goes into a card one way and is put right the same way.
import { esc } from "./ui.js";
import { hasFairway, stableford, NO_SCORE, STAT_START } from "./model.js";

/** Nested rings for under par, nested squares for over, plain ink for par: `scoreGlyph` in draw.js, in CSS. */
export const markCls = d => d <= -2 ? "c2" : d === -1 ? "c1" : d === 0 ? "" : d === 1 ? "s1" : "s2";

/**
 * One score as the card would write it. `v` is null (nothing yet), 0 (picked up) or the strokes.
 * A pick-up has no relationship to par, so it takes no glyph -- only the bronze the styleguide reserves for it.
 */
export function mark(v, par, extra = "") {
  if (v === null || v === undefined) return `<span class="mk empty ${extra}">–</span>`;
  if (v === 0) return `<span class="mk pk ${extra}"><b class="num">${NO_SCORE}</b></span>`;
  return `<span class="mk ${markCls(v - par)} ${extra}"><b class="num">${v}</b></span>`;
}

// ---------------------------------------------------------------- the score
/**
 * The stepper. The first tap on either side enters the par of the hole -- the score most holes are nearest to,
 * and the one already under the thumb -- and after that they move by one.
 */
export function scoreStepper(e, i, h, par) {
  const v = e.scores[h];
  return `<div class="pscore">
    <button class="sbtn" data-act="dec" data-i="${i}" aria-label="One fewer">−</button>
    <button class="sval" data-act="par" data-i="${i}" aria-label="${v === null ? `Enter par, ${par}` : v === 0 ? "Picked up" : `${v} strokes`}">${mark(v, par)}</button>
    <button class="sbtn" data-act="inc" data-i="${i}" aria-label="One more">+</button>
  </div>`;
}

// ---------------------------------------------------------------- the extras, on the same stepper
// Everything a card can count rather than choose. Putts first: it is the one that carries greens in regulation,
// up and down, sand saves and putts per green with it.
const COUNTS = [["putts", "Putts"], ["bunker", "Sand"], ["penaltyShots", "Pen"]];

/** Every extra this card keeps, for one player, in one row of tiles: three counts and the fairway, which a par 3 has none of. */
export function extrasRows(c, e, i, h, kinds) {
  if (!e.trackStats) return "";
  const x = e.stats[h] || {};
  const on = COUNTS.filter(([k]) => kinds[k]);
  const fw = kinds.fairway && hasFairway(c.par[h]);
  if (!on.length && !fw) return "";
  // Putts open on the ordinary two and are nudged off it; sand and penalties open on nothing and read as
  // nothing, so a quiet hole stays quiet. Until the hole is scored the opening answer is drawn muted.
  const step = ([k, label]) => {
    const v = x[k] ?? null, shown = v === null ? STAT_START[k] : v;
    // the card's notation on the greens: a two-putt rings once, anything better rings twice, worse rings not
    const ring = k !== "putts" ? "" : shown === 2 ? " r1" : shown <= 1 ? " r2" : "";
    const none = k !== "putts" && shown === 0;
    return `<div class="xst"><span class="xlab">${label}</span><div class="xrow">
      <button class="xb" data-act="x-dec" data-k="${k}" data-i="${i}" aria-label="${label}, one fewer">−</button>
      <b class="xv num ${none ? "none" : v === null ? "soft" : "on"}${ring}">${none ? "–" : shown}</b>
      <button class="xb" data-act="x-inc" data-k="${k}" data-i="${i}" aria-label="${label}, one more">+</button></div></div>`;
  };
  // the fairway is the one answer that is a side rather than a count, so it keeps three chips -- but in a tile
  // the shape of the others rather than a row of its own, which cost a whole line per player
  const cur = x.fairway ?? STAT_START.fairway;
  const opt = (val, glyph, label) => `<button class="xfwb ${cur === val ? (x.fairway === null ? "on soft" : "on") : ""}" data-act="st-fw" data-v="${val}" data-i="${i}" aria-label="${label}" aria-pressed="${x.fairway === val}">${glyph}</button>`;
  return `<div class="pxtra">
    ${on.map(step).join("")}
    ${fw ? `<div class="xfw"><span class="xlab">Fairway</span><div class="xrow3">${opt("left", "←", "Missed left")}${opt("hit", "✓", "Fairway hit")}${opt("right", "→", "Missed right")}</div></div>` : ""}</div>`;
}

/** The running Stableford for one player over the holes they have actually finished. */
export function ptsSoFar(e, info) {
  if (!info) return 0;
  let t = 0;
  e.scores.forEach((v, k) => { if (v) t += stableford(v, info.par[k], info.strokes[k]); });
  return t;
}

/** The way to the hole either side; the one onward turns primary once every card on this hole is in. */
export function navBar(r, c, h, rid) {
  const n = c.n;
  const playing = r.entries.filter(x => (x.fromHole || 1) - 1 <= h);
  const done = playing.length && playing.every(x => x.scores[h] !== null);
  const onward = h < n - 1 ? `Hole ${c.first_hole + h + 1}` : "Check the card";
  // both halves the same width: the way back and the way on are the same move, and the bar should not lean
  return `${h === 0 ? `<a class="btn half" href="#players/${rid}">‹ Players</a>` : `<a class="btn half" href="#score/${rid}/${h - 1}">‹ Hole ${c.first_hole + h - 1}</a>`}
    <a class="btn half ${done ? "primary" : ""}" href="${h < n - 1 ? `#score/${rid}/${h + 1}` : `#review/${rid}`}">${esc(onward)} ›</a>`;
}
