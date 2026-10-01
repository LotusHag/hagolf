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

/**
 * Every extra this card is keeping, for one player, all of them at once and all on the same control as the
 * score. The fairway is the one answer that is not a number, so it stays three chips with a side to it; a par 3
 * is not asked about one, because it has none.
 */
export function extrasRows(c, e, i, h, kinds) {
  if (!e.trackStats) return "";
  const x = e.stats[h] || {};
  const on = COUNTS.filter(([k]) => kinds[k]);
  const fw = kinds.fairway && hasFairway(c.par[h]);
  if (!on.length && !fw) return "";
  // Nothing starts blank: a hole opens on the ordinary answer -- two putts, no sand, no penalty, the fairway
  // hit -- and is nudged off it. Until the hole is scored that answer is only a suggestion, drawn muted.
  const step = ([k, label]) => {
    const v = x[k] ?? null, shown = v === null ? STAT_START[k] : v;
    // the card's own notation on the greens: one ring for a one-putt, two for a two-putt, nothing above that
    const ring = k === "putts" && (shown === 1 || shown === 2) ? ` p${shown}` : "";
    return `<div class="xst"><span class="xlab">${label}</span><div class="xrow">
      <button class="xb" data-act="x-dec" data-k="${k}" data-i="${i}" aria-label="${label}, one fewer">−</button>
      <b class="xv num${v === null ? " soft" : " on"}${ring}">${shown}</b>
      <button class="xb" data-act="x-inc" data-k="${k}" data-i="${i}" aria-label="${label}, one more">+</button></div></div>`;
  };
  const cur = x.fairway ?? STAT_START.fairway;
  const opt = (val, label) => `<button class="xfwb ${cur === val ? (x.fairway === null ? "on soft" : "on") : ""}" data-act="st-fw" data-v="${val}" data-i="${i}" aria-pressed="${x.fairway === val}">${label}</button>`;
  return `<div class="pxtra">
    ${on.map(step).join("")}
    ${fw ? `<div class="xfw"><span class="xlab">Fairway</span>${opt("left", "← left")}${opt("hit", "hit ✓")}${opt("right", "right →")}</div>` : ""}</div>`;
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
