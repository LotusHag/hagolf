// The one place a number goes into a card. Absolute keys centred on par -- one tap is one score, and nothing
// ever appears that was not asked for -- drawn in the notation the posters already use, so the app teaches on
// the course the alphabet it prints in the clubhouse.
//
// The extras ride in the same rectangle: when a score lands on a card that keeps them, the keys give way to
// one question at a time and give the rectangle back. That is the whole trick. Chips under a player row cost
// their height on every player of every hole; a question costs the height of the keys, which was already
// spent, and is asked only of the hole you just finished.
import { esc, plural, sheet } from "./ui.js";
import { outcome, hasFairway, stableford, NO_SCORE } from "./model.js";

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

// ---------------------------------------------------------------- the keys
// Seven keys cover par−2 to par+4, which is every score a society golfer makes bar a handful a year. They are
// positional: the middle key is par on every hole of every course, so the hand learns one layout and keeps it.
const DELTAS = [-2, -1, 0, 1, 2, 3, 4];

function keys(par, v) {
  const key = d => {
    const n = par + d;
    if (n < 1) return `<button class="key off" disabled></button>`;   // a par 3 has no par−2
    const says = d === 0 ? "par" : d === -1 ? "birdie" : d <= -2 ? "eagle" : d === 1 ? "bogey" : `${d} over`;
    return `<button class="key ${v === n ? "on" : ""}" data-act="pick" data-v="${n}" aria-pressed="${v === n}" aria-label="${n}, ${says}">${mark(n, par)}</button>`;
  };
  return `<div class="keys">${DELTAS.map(key).join("")}
    <button class="key more ${v !== null && v !== 0 && (v < par - 2 || v > par + 4) ? "on" : ""}" data-act="more" aria-label="Another score">${
      v !== null && v !== 0 && (v < par - 2 || v > par + 4) ? mark(v, par) : "…"}</button></div>`;
}

/** Everything the seven keys do not cover, named rather than counted up to. */
export async function moreSheet(par, v) {
  const span = [];
  for (let n = 1; n <= 12; n++) if (n < par - 2 || n > par + 4) span.push(n);
  const v2 = await sheet({
    title: "Another score", lead: `Par ${par}. The keys cover ${Math.max(1, par - 2)} to ${par + 4}.`,
    body: `<div class="morekeys">${span.map(n => `<button class="key ${v === n ? "on" : ""}" data-act="${n}" data-sheet-act>${mark(n, par)}</button>`).join("")}</div>`,
    actions: [{ label: `Picked up — counts ${NO_SCORE}`, value: "pick" }, ...(v !== null ? [{ label: "Clear this hole", value: "clear", kind: "danger" }] : []), { label: "Cancel", value: "no" }],
  });
  if (v2 === null || v2 === "no") return undefined;
  if (v2 === "pick") return 0;
  if (v2 === "clear") return null;
  return Number(v2);
}

// ---------------------------------------------------------------- the questions
/**
 * Which questions this hole owes this player, in order. Putts first: it is the only extra that carries others
 * with it, since `strokes − putts` is where the ball was and so answers greens in regulation, up and down,
 * sand saves and putts per green without ever being asked. A par 3 has no fairway, so it is not asked about
 * one. Sand and a penalty shot are one question, not two, because on fifteen holes of eighteen the honest
 * answer to both is "no" and a question answered "no" must cost one tap to be rid of.
 */
export function askSteps(c, e, h, kinds) {
  if (!e.trackStats) return [];
  const out = [];
  if (kinds.putts) out.push("putts");
  if (kinds.fairway && hasFairway(c.par[h])) out.push("fairway");
  if (kinds.penaltyShots || kinds.bunker) out.push("rest");
  return out;
}

const QW = { putts: "Putts", fairway: "Fairway", rest: "Anything else?" };

/** One question's buttons. st-bit is keyed by kind, the other two by value: `statTap` reads exactly these. */
function qRow(q, e, h, kinds) {
  const x = e.stats[h] || {};
  const opt = (act, val, label, on, cls = "") =>
    `<button class="aopt ${cls} ${on ? "on" : ""}" data-act="${act}" aria-pressed="${!!on}" data-${act === "st-bit" ? "k" : "v"}="${esc(String(val))}">${label}</button>`;
  if (q === "putts") {
    const p = x.putts ?? null, over = p !== null && p > 3 ? p : null;
    return [0, 1, 2, 3].map(n => opt("st-putt", n, n, p === n)).join("") + opt("st-putt", 4, over !== null ? over : "4+", over !== null);
  }
  if (q === "fairway")
    return opt("st-fw", "left", "← left", x.fairway === "left") + opt("st-fw", "hit", "hit ✓", x.fairway === "hit") + opt("st-fw", "right", "right →", x.fairway === "right");
  return (kinds.bunker ? opt("st-bit", "bunker", "Sand", !!x.bunker) : "")
    + (kinds.penaltyShots ? opt("st-bit", "penaltyShots", `Penalty${x.penaltyShots ? ` +${x.penaltyShots}` : ""}`, false, x.penaltyShots ? "pen" : "") : "")
    + `<button class="aopt go" data-act="ask-skip">${x.bunker || x.penaltyShots ? "Done ›" : "Neither ›"}</button>`;
}

/** The chain, on the hole just played: one question, a way past it, and how many are left. */
function askHtml(e, h, kinds, steps, step) {
  const q = steps[step];
  return `<div class="ask">
    <div class="askq"><span>${QW[q]}</span>${q === "rest" ? "" : `<button class="askskip" data-act="ask-skip">Skip ›</button>`}</div>
    <div class="arow">${qRow(q, e, h, kinds)}</div>
    <div class="adots">${steps.map((_, k) => `<i class="${k === step ? "on" : k < step ? "was" : ""}"></i>`).join("")}</div></div>`;
}

/**
 * Every question at once, labelled, for correcting one hole afterwards. There is only ever one of these on
 * screen -- one player, one hole -- which is why it may show all three where the chain shows one.
 */
export function askAll(e, h, kinds, steps) {
  if (!steps.length) return "";
  return `<div class="askall">${steps.map(q =>
    `<div class="askq"><span>${QW[q]}</span></div><div class="arow">${qRow(q, e, h, kinds)}</div>`).join("")}</div>`;
}

export { keys };

// ---------------------------------------------------------------- the deck
/**
 * The deck: who is being scored, the way to the hole either side, and either the keys or one question.
 * It keeps the same height whichever it is showing, so nothing under the thumb ever moves.
 */
export function deck(r, c, h, i, kinds, ask) {
  const n = c.n, e = i === null ? null : r.entries[i];
  const playing = r.entries.filter(x => (x.fromHole || 1) - 1 <= h);
  const left = playing.filter(x => x.scores[h] === null).length;
  const done = playing.length && !left;
  const par = c.par[h];
  const cap = !e
    ? `<span class="dwho">Hole ${c.first_hole + h}</span>`
    : `<span class="dwho">${esc(e.name)}</span><span class="dsub">par ${par}${playing.length > 1 ? ` · ${playing.length - left} of ${playing.length} in` : ""}</span>`;
  const body = ask ? askHtml(e, h, kinds, ask.steps, ask.step) : e ? keys(par, e.scores[h]) : `<div class="keys"></div>`;
  const onward = h < n - 1 ? `Hole ${c.first_hole + h + 1}` : "Check the card";
  // the way on only takes the width once the hole is finished *and* nothing is still being asked -- while a
  // question is open the caption has to keep saying whose card it is writing to
  const wide = done && !ask;
  return `<div class="dnav">
      <button class="dstep" data-act="prev" aria-label="${h === 0 ? "Players" : `Hole ${c.first_hole + h - 1}`}">‹</button>
      ${wide ? "" : `<div class="dcap">${cap}</div>`}
      <button class="dstep ${wide ? "go wide" : done ? "go" : ""}" data-act="next" aria-label="${esc(onward)}">${wide ? `${esc(onward)} ›` : h < n - 1 ? "›" : "✓"}</button>
    </div>${body}`;
}

/** What a player's extras come to in words, for the row they sit on. Only what was actually answered. */
export function saidLine(e, h, kinds) {
  if (!e.trackStats) return "";
  const x = e.stats[h] || {};
  const bits = [];
  if (kinds.putts && x.putts !== null && x.putts !== undefined) bits.push(plural(x.putts, "putt"));
  if (kinds.fairway && x.fairway) bits.push(x.fairway === "hit" ? "fairway ✓" : `${x.fairway} ✗`);
  if (kinds.bunker && x.bunker) bits.push("sand");
  if (kinds.penaltyShots && x.penaltyShots) bits.push(`+${x.penaltyShots} pen`);
  return bits.join(" · ");
}

/** The running Stableford for one player over the holes they have actually finished. */
export function ptsSoFar(e, info) {
  if (!info) return 0;
  let t = 0;
  e.scores.forEach((v, k) => { if (v) t += stableford(v, info.par[k], info.strokes[k]); });
  return t;
}

export { outcome };
