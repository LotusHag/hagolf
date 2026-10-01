// Putts, fairways and the rest: what one tap on the hole writes, and the tiles that read them all back.
import * as S from "../store.js";
import { esc, plural } from "../ui.js";
import { statReadings, fmtSigned } from "../model.js";

/**
 * The extras read back, as tiles. Only what was actually recorded appears, and `deep` decides whether the
 * headline readings come back or the ones that are interesting rather than important.
 */
export function statTiles(x, { per18 = false, deep = false } = {}) {
  const rs = statReadings(x, { per18 }).filter(r => !!r.deep === deep);
  if (!rs.length) return "";
  return `<div class="statgrid">${rs.map(r =>
    `<div class="stattile"><b>${esc(r.big)}</b><small>${esc(r.label)}</small></div>`).join("")}</div>`;
}

/** True when a summary has anything worth folding away under "more". */
export const hasDeepStats = (x, opts) => statReadings(x, opts).some(r => r.deep);

/**
 * The whole read-back as one card: the headline readings, with the interesting-but-not-important ones folded
 * underneath. `intro` is drawn as it comes, so a caller that puts a name in it escapes that itself.
 */
export function statBlock(x, intro, opts = {}) {
  if (!x || !x.any) return "";
  const rest = statTiles(x, { ...opts, deep: true });
  return `<div class="card"><div class="muted small">${intro}</div>${statTiles(x, opts)}${
    rest ? `<details class="morestats"><summary class="small">More of the same, for fun</summary>${rest}</details>` : ""}</div>`;
}

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

/** Strokes gained, drawn; `who` is the baseline in words. */
export function sgBlock(sg, who) {
  if (!sg || sg.total === null || !sg.holes) return "";
  const t = (v, label) => `<div class="stattile"><b class="${v > 0.05 ? "sgup" : v < -0.05 ? "sgdown" : ""}">${fmtSigned(v, 2)}</b><small>${esc(label)}</small></div>`;
  const per = sg.split ? sg.split.per18 : null;
  return `<div class="card">
    <div class="muted small">Against ${esc(who)} · ${plural(sg.holes, "hole")}${sg.rounds > 1 ? ` in ${plural(sg.rounds, "round")}` : ""} · per 18</div>
    <div class="statgrid">${t(sg.per18, "strokes gained")}${per ? t(per.teeToGreen, "tee to green") : ""}${per ? t(per.putting, "putting") : ""}</div>
    ${per
      ? `<p class="muted small" style="margin:10px 0 0">The split: ${plural(sg.split.holes, "hole")} where both cards kept putts</p>`
      : `<p class="muted small" style="margin:10px 0 0">No split: nobody they played against kept putts</p>`}</div>`;
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
<p><b>Strokes gained</b> is what they averaged on a hole less what you took: plus means you took fewer. <b>Putting</b> is the same sum on putts alone, and <b>tee to green</b> is whatever is left over, so the two always add back up to the total.</p>
<p>A hole picked up is left out, and the putting split only counts holes where both cards wrote putts down.</p>`;

export const STATS_TIP = `<p>These come off your own card, and only the ones you switched on. Nothing here is guessed at.</p>
<p><b>GIR</b>, greens in regulation, is the green reached with two strokes still left for par, and is never asked for either: your strokes less your putts is where the ball was, so counting putts answers it. It is arithmetic, not an opinion, which is why there is no chip for it.</p>
<p><b>Up and down</b> is the holes where you missed the green and still made par or better, however you got there. <b>Sand saves</b> are the same question asked of the greenside bunkers. Neither is ever asked for.</p>
<p>Every figure counts only the holes that answered it, so switching something on halfway through a season skews nothing. A percentage waits until there are eight attempts behind it; under that you get the fraction itself, because one sand save out of one is not a hundred per cent of anything. Under a handful of attempts a reading is left out altogether: one bunker all season is a bunker, not a sand-save record.</p>`;

export function statHolesOf(rounds, pid) {
  const out = [];
  for (const { M } of rounds) { const p = M.players.find(x => x.id === pid); if (p) out.push(...p.stats); }
  return out;
}

export const holedOut = (e, h) => e.scores[h] !== null && e.scores[h] !== 0;

// The per-hole chips used to be a strip under every player row; they are now the deck's own questions in
// pad.js, which asks one at a time in the space the keys were using. `statTap` stayed exactly as it was.
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
