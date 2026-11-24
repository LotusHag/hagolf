// Putts, fairways and the rest: what one tap on the hole writes, and the line that reads them back.
import * as S from "../store.js";
import { esc, plural } from "../ui.js";
import { fmtSigned, hasFairway, STAT_START } from "../model.js";

export function statLine(x) {
  const bits = [];
  if (x.putts) bits.push(`${x.putts.total} putts`);
  if (x.fairway) bits.push(`${x.fairway.hit}/${x.fairway.holes} fairways`);
  if (x.gir) bits.push(`${x.gir.hit}/${x.gir.holes} GIR`);
  if (x.upDown && x.upDown.made) bits.push(`${x.upDown.made} up and down`);
  if (x.sand && x.sand.holes >= 3) bits.push(`${x.sand.saved}/${x.sand.holes} sand`);
  if (x.penalty) bits.push(plural(x.penalty.total, "penalty shot"));
  return bits.join(" · ");
}

export function sgWords(sg, them) {
  const v = sg.per18;
  const head = Math.abs(v) < 0.05
    ? `Nothing between them: level with ${esc(them)} over the ${plural(sg.holes, "hole")} they both finished.`
    : `<b class="sg${v > 0 ? "up" : "down"}">${fmtSigned(v, 2)}</b> strokes a round ${v > 0 ? "on" : "behind"} ${esc(them)}, over the ${plural(sg.holes, "hole")} they both finished.`;
  if (!sg.split) return head;
  const p = sg.split.per18;
  return `${head} ${fmtSigned(p.teeToGreen, 2)} of it tee to green and ${fmtSigned(p.putting, 2)} on the greens, over the ${plural(sg.split.holes, "hole")} where both kept putts.`;
}

export const SG_TIP = `<p>The published version of this compares every shot with what a tour player would do from the same distance and lie. A scorecard has neither, so this compares you with the people who actually played the same holes on the same day.</p>
<p><b>Strokes gained</b> is what they averaged on a hole less what you took: plus means you took fewer. <b>Putting</b> is the same sum on putts alone, and <b>tee to green</b> is whatever is left over, so on the same holes the two always add back up to the total.</p>
<p>Every figure is an average per 18 holes, so rounds of different lengths compare. A hole picked up is left out, and the putting split only counts holes where both cards wrote putts down; when that is fewer holes than the total, the split adds up to its own figure, which the card states.</p>`;

export function statHolesOf(rounds, pid) {
  const out = [];
  for (const { M } of rounds) { const p = M.players.find(x => x.id === pid); if (p) out.push(...p.stats); }
  return out;
}

/**
 * A counted extra nudged by one: putts, penalty shots, shots from a bunker. A hole that has been scored already
 * carries the ordinary answer, so stepping is a correction of something, never the first word -- and a hole
 * nobody has scored still says nothing at all, because `seedStats` is what writes the ordinary answer down.
 */
export function statStep(r, e, h, kind, d, c, kinds) {
  const cur = (e.stats[h] || {})[kind] ?? STAT_START[kind] ?? 0;
  const next = Math.max(0, Math.min(9, cur + d));
  S.setStat(r, e, h, { [kind]: next });
  if (kind !== "penaltyShots" || next === cur) return;
  // a penalty shot is a stroke, so it goes on the hole's score at once and the points drop with it;
  // an empty hole starts at par plus the penalty, and a pick-up has no strokes to add it to
  const v = e.scores[h];
  if (v === 0) return;
  S.setScore(r, e, h, v === null ? c.par[h] + next : Math.max(1, Math.min(30, v + next - cur)));
  seedStats(r, e, h, c, kinds);
}

/**
 * The ordinary answer, written into a hole the moment it is scored: two putts, no sand, no penalty, the
 * fairway hit. Only what is still unanswered is filled, so nothing already tapped in is overwritten, and a
 * hole with no score -- or one picked up -- is left alone, because it has nothing to say.
 */
export function seedStats(r, e, h, c, kinds) {
  if (!e.trackStats) return;
  const v = e.scores[h];
  if (v === null || v === 0) return;
  const x = e.stats[h] || {}, patch = {};
  for (const k of ["putts", "penaltyShots", "bunker"]) if (kinds[k] && (x[k] ?? null) === null) patch[k] = STAT_START[k];
  if (kinds.fairway && hasFairway(c.par[h]) && (x.fairway ?? null) === null) patch.fairway = STAT_START.fairway;
  if (Object.keys(patch).length) S.setStat(r, e, h, patch);
}

// The fairway is the one extra that is a side rather than a count, so it keeps its three chips and this tap.
export function statTap(r, e, h, act, b) {
  const v = e.stats[h] || {};
  if (act === "st-putt") {
    const want = Number(b.dataset.v), cur = v.putts ?? null;
    if (want === 4) return S.setStat(r, e, h, { putts: cur !== null && cur >= 4 ? (cur >= 9 ? null : cur + 1) : 4 });
    return S.setStat(r, e, h, { putts: cur === want ? null : want });
  }
  if (act === "st-fw") { const want = b.dataset.v; return S.setStat(r, e, h, { fairway: v.fairway === want ? null : want }); }
  const k = b.dataset.k;
  if (k === "penaltyShots") { const n = v.penaltyShots ?? 0; return S.setStat(r, e, h, { penaltyShots: n >= 3 ? null : n + 1 }); }
  if (k === "bunker") return S.setStat(r, e, h, { bunker: v.bunker ? null : true });
}
