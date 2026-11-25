// The Trends tab: how a game has moved, round by round. The one reading that says most is drawn large; every other
// one is a row saying in words whether it got better, worse or held, and opens to its own chart.
import { esc, plural, shortDate, h2tip } from "../ui.js";
import { fix, fmtSigned, statSummary, strokesGained } from "../model.js";

const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = xs => { const m = avg(xs); return Math.sqrt(avg(xs.map(x => (x - m) ** 2))); };
// rounds in the moving average: enough to argue one good day down, few enough to still see a turn
const spanFor = n => n >= 12 ? 5 : n >= 6 ? 3 : 2;
const MIN_POINTS = 4;
const pctFmt = v => `${Math.round(v)}%`;

/** Every reading this tab can follow, each as one value a round in date order. */
function readings(p, holes, cards) {
  const rs = p.rounds.filter(r => r.holes >= 9);
  // a nine beside an eighteen only compares as a share of a round, so every round is read per 18
  const per18 = (v, n) => (v / n) * 18;
  const at = (r, v) => ({ date: r.date, id: r.id, v });
  const num = v => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

  const byCard = new Map();
  for (const h of holes) if (h.pid === p.id) (byCard.get(h.card) || byCard.set(h.card, []).get(h.card)).push(h.stat);
  const xs = rs.map(r => ({ r, x: statSummary(byCard.get(r.card) || []) }));
  const extra = (pick, min) => xs.map(({ r, x }) => { const v = pick(x, min); return v === null ? null : at(r, v); }).filter(Boolean);
  const cardOf = new Map(cards.map(c => [c.key ?? c.id, c]));
  const sg = rs.map(r => {
    const c = cardOf.get(r.card);
    const s = c ? strokesGained([c], p.id) : null;
    return s && s.total !== null && s.holes >= 9 ? at(r, s.per18) : null;
  }).filter(Boolean);

  return [
    { key: "hi", label: "Handicap index", lower: true, eps: 0.3, fmt: v => fix(v), s: rs.filter(r => num(r.hi) !== null).map(r => at(r, num(r.hi))) },
    { key: "pts", label: "Points a round", eps: 0.75, fmt: v => fix(v), s: rs.map(r => at(r, per18(r.pts, r.holes))) },
    { key: "topar", label: "Score to par a round", lower: true, eps: 0.75, fmt: v => fmtSigned(v), s: rs.filter(r => r.topar !== null).map(r => at(r, per18(r.topar, r.holes))) },
    { key: "par", label: "Holes at par or better", eps: 2, unit: "%", fmt: pctFmt, s: rs.map(r => at(r, ((r.counts[0] + r.counts[1] + r.counts[2]) / r.holes) * 100)) },
    { key: "dbl", label: "Doubles or worse a round", lower: true, eps: 0.25, fmt: v => fix(v), s: rs.map(r => at(r, per18(r.counts[4] + r.counts[5], r.holes))) },
    { key: "sg", label: "Strokes gained a round", eps: 0.4, fmt: v => fmtSigned(v), s: sg },
    { key: "fw", label: "Fairways hit", eps: 2, unit: "%", fmt: pctFmt, s: extra(x => x.fairway && x.fairway.holes >= 4 ? x.fairway.pct * 100 : null) },
    { key: "gir", label: "Greens in regulation", eps: 2, unit: "%", fmt: pctFmt, s: extra(x => x.gir && x.gir.holes >= 9 ? x.gir.pct * 100 : null) },
    { key: "putts", label: "Putts a round", lower: true, eps: 0.4, fmt: v => fix(v), s: extra(x => x.putts && x.putts.holes >= 9 ? x.putts.per18 : null) },
    { key: "ud", label: "Up and downs", eps: 3, unit: "%", fmt: pctFmt, s: extra(x => x.upDown && x.upDown.holes >= 4 ? x.upDown.pct * 100 : null) },
  ].map(m => m.s.length < MIN_POINTS ? null : measure(m)).filter(Boolean);
}

/** Where a reading started, where it is now, and whether that is better: the average of the first few rounds against the last few. */
function measure(m) {
  const vs = m.s.map(x => x.v), k = spanFor(vs.length);
  // the line starts once it has a full set of rounds to average, or its first stretch is one round drawn as a trend
  const rolling = vs.map((_, i) => i < k - 1 ? null : avg(vs.slice(i - k + 1, i + 1)));
  const then = avg(vs.slice(0, k)), now = avg(vs.slice(-k)), delta = now - then;
  const moved = Math.abs(delta) >= m.eps;
  const better = moved && (m.lower ? delta < 0 : delta > 0);
  // how far it moved against how much it wobbles, so a putt a round and a handicap point can be ranked together
  const z = Math.abs(delta) / Math.max(sd(vs), m.eps);
  return { ...m, k, rolling, then, now, delta, moved, better, z };
}

const toneOf = m => !m.moved ? "flat" : m.better ? "up" : "down";
/** The move in words, so colour is never the only thing saying it: "better by 2.0", "worse by 5%", "steady". */
const verdict = m => !m.moved ? "steady" : `${m.better ? "better" : "worse"} by ${m.unit ? pctFmt(Math.abs(m.delta)) : fix(Math.abs(m.delta))}`;

/** The rounds as faint dots, the moving average as the line, and a dashed level where it started. */
function chart(m, H = 92) {
  const W = 300, T = 8, B = 8, L = 4, R = 8;
  const vs = m.s.map(x => x.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < m.eps * 2) { const mid = (hi + lo) / 2; lo = mid - m.eps; hi = mid + m.eps; }
  const x = i => L + (vs.length === 1 ? 0 : (i / (vs.length - 1)) * (W - L - R));
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const dots = m.s.map((d, i) => `<circle class="tdot" cx="${x(i).toFixed(1)}" cy="${y(d.v).toFixed(1)}" r="2.6"><title>${esc(`${shortDate(d.date)} · ${m.fmt(d.v)}`)}</title></circle>`).join("");
  const line = m.rolling.map((v, i) => v === null ? "" : `${i === m.k - 1 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = m.rolling.length - 1;
  return `<svg class="tchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${m.label}: from ${m.fmt(m.then)} to ${m.fmt(m.now)}`)}">
    <line class="tbase" x1="${L}" x2="${W - R}" y1="${y(m.then).toFixed(1)}" y2="${y(m.then).toFixed(1)}"></line>${dots}
    <path class="tline ${toneOf(m)}" d="${line}"></path><circle class="tlast ${toneOf(m)}" cx="${x(last).toFixed(1)}" cy="${y(m.rolling[last]).toFixed(1)}" r="4.5"></circle></svg>
    <div class="tdates muted"><span>${esc(shortDate(m.s[0].date))}</span><span>${esc(shortDate(m.s[m.s.length - 1].date))}</span></div>`;
}

/** The moving average alone, small enough to sit in a row: which way it went, not by how much. */
function spark(m) {
  // only the stretch the line covers, so it runs the sparkline's full width
  const W = 64, H = 22, vs = m.rolling.filter(v => v !== null), n = Math.max(1, vs.length - 1);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  // a reading that held should look level, not have its wobble blown up to the full height
  if (hi - lo < m.eps * 2) { const mid = (hi + lo) / 2; lo = mid - m.eps; hi = mid + m.eps; }
  const d = vs.map((v, i) => `${i ? "L" : "M"}${((i / n) * (W - 4) + 2).toFixed(1)},${(2 + (1 - (v - lo) / (hi - lo)) * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="tspark ${toneOf(m)}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"></path></svg>`;
}

/** The reading that says most about a game, drawn large: the figure now, what that means, and where it began. */
const headline = m => `<div class="card"><div class="tmain"><b class="num">${esc(m.fmt(m.now))}</b>
    <span><em class="${toneOf(m)}">${esc(verdict(m))}</em><small>${esc(`from ${m.fmt(m.then)} at the start`)}</small></span></div>
    ${chart(m, 120)}<p class="tnote">Each dot is a round. The line is the average of the last ${m.k} at each point; the dashed level is where the first ${m.k} began.</p></div>`;

/** Any other reading as one row; tap it for its chart. */
const row = m => `<details class="trow"><summary><span>${esc(m.label)}<small class="${toneOf(m)}">${esc(verdict(m))}</small></span>
    ${spark(m)}<b class="num">${esc(m.fmt(m.now))}</b></summary>${chart(m)}</details>`;

const TIP = `<p>Each reading sets the average of the latest few rounds against the first few, and calls it steady when the gap is too small to mean much. Anything counted a round is scaled to 18 holes, so a nine sits fairly beside an eighteen.</p>
  <p>The handicap index is the one written on each card when it was played. Score to par is before handicap strokes. Strokes gained is against everyone on the same card. Fairways, greens, putts and up and downs count a round only when it kept enough holes of them.</p>
  <p>The rows that moved most, against how much each one normally wobbles, come first. Tap a row to see its rounds.</p>`;

/** The whole tab, for one player: `holes` are statHoles rows, `cards` league cards for strokes gained. */
export function trendsBody(p, holes, cards, who = "you") {
  const wait = text => `<p class="muted center" style="margin:30px 0">${text}</p>`;
  if (p.rounds.length < MIN_POINTS) return wait(`Trends start after ${MIN_POINTS} rounds; ${who === "you" ? "you have" : `${esc(who)} has`} ${plural(p.rounds.length, "round")} so far.`);
  const ms = readings(p, holes, cards);
  if (!ms.length) return wait(`Trends start after ${MIN_POINTS} rounds of nine holes or more.`);
  const main = ms.find(m => m.key === "hi") || ms.find(m => m.key === "pts") || ms[0];
  const rest = ms.filter(m => m !== main).sort((a, b) => (b.moved - a.moved) || (b.moved ? b.z - a.z : 0));
  const tally = ["up", "down", "flat"].map((t, i) => [rest.filter(m => toneOf(m) === t).length, ["better", "worse", "steady"][i]])
    .filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(", ");
  return `${h2tip(main.label, TIP, "trend")}${headline(main)}
    ${rest.length ? `${h2tip("The rest of the game", TIP, "scorecard")}
    <p class="tsum">${esc(`${who === "you" ? "Your" : `${who}'s`} latest rounds against the first: ${tally}.`)}</p>
    <div class="card tlist">${rest.map(row).join("")}</div>` : ""}`;
}
