// The Trends tab: how each part of a game has moved, round by round, oldest on the left.
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
    { group: "form", key: "hi", label: "Handicap index", lower: true, eps: 0.3, fmt: v => fix(v), s: rs.filter(r => num(r.hi) !== null).map(r => at(r, num(r.hi))) },
    { group: "form", key: "pts", label: "Points a round", eps: 0.75, fmt: v => fix(v), s: rs.map(r => at(r, per18(r.pts, r.holes))) },
    { group: "scoring", key: "topar", label: "Against par a round", lower: true, eps: 0.75, fmt: v => fmtSigned(v), s: rs.filter(r => r.topar !== null).map(r => at(r, per18(r.topar, r.holes))) },
    { group: "scoring", key: "par", label: "Par or better", eps: 2, unit: "%", fmt: pctFmt, s: rs.map(r => at(r, ((r.counts[0] + r.counts[1] + r.counts[2]) / r.holes) * 100)) },
    { group: "scoring", key: "dbl", label: "Doubles or worse a round", lower: true, eps: 0.25, fmt: v => fix(v), s: rs.map(r => at(r, per18(r.counts[4] + r.counts[5], r.holes))) },
    { group: "shots", key: "sg", label: "Strokes gained a round", eps: 0.4, fmt: v => fmtSigned(v), s: sg },
    { group: "shots", key: "fw", label: "Fairways hit", eps: 2, unit: "%", fmt: pctFmt, s: extra(x => x.fairway && x.fairway.holes >= 4 ? x.fairway.pct * 100 : null) },
    { group: "shots", key: "gir", label: "Greens in regulation", eps: 2, unit: "%", fmt: pctFmt, s: extra(x => x.gir && x.gir.holes >= 9 ? x.gir.pct * 100 : null) },
    { group: "shots", key: "putts", label: "Putts a round", lower: true, eps: 0.4, fmt: v => fix(v), s: extra(x => x.putts && x.putts.holes >= 9 ? x.putts.per18 : null) },
    { group: "shots", key: "ud", label: "Up and down", eps: 3, unit: "%", fmt: pctFmt, s: extra(x => x.upDown && x.upDown.holes >= 4 ? x.upDown.pct * 100 : null) },
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

const deltaText = m => `${fmtSigned(m.delta, m.unit ? 0 : 1)}${m.unit || ""}`;
const toneOf = m => !m.moved ? "flat" : m.better ? "up" : "down";

/** The rounds as faint dots, the moving average as the line, and a dashed level where it started. */
function chart(m) {
  const W = 300, H = 92, T = 8, B = 8, L = 4, R = 8;
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

const trendRow = m => `<div class="trow"><div class="trhead"><span>${esc(m.label)}</span>
    <b class="num">${esc(m.fmt(m.now))}</b><em class="${toneOf(m)}">${m.moved ? esc(deltaText(m)) : "steady"}</em></div>${chart(m)}</div>`;

/** The biggest movers either way, ranked by how far each moved against its own round-to-round wobble. */
function movers(ms) {
  const moved = ms.filter(m => m.moved).sort((a, b) => b.z - a.z);
  const up = moved.filter(m => m.better).slice(0, 2), down = moved.filter(m => !m.better).slice(0, 2);
  if (!up.length && !down.length) return `<div class="card"><p class="muted small" style="margin:0">Nothing has moved much yet.</p></div>`;
  const fig = m => `<div><b class="num ${toneOf(m)}">${esc(deltaText(m))}</b><small>${esc(m.label)}</small><i>${esc(`${m.fmt(m.then)} → ${m.fmt(m.now)}`)}</i></div>`;
  return `<div class="card">${up.length ? `<div class="subhead" style="margin-top:0">Getting better</div><div class="sleads grid">${up.map(fig).join("")}</div>` : ""}
    ${down.length ? `<div class="subhead"${up.length ? "" : ` style="margin-top:0"`}>Slipping</div><div class="sleads grid">${down.map(fig).join("")}</div>` : ""}</div>`;
}

const GROUPS = [
  ["form", "Handicap and points", "<p>The handicap index is the one written on each card when it was played. Points are Stableford points.</p>"],
  ["scoring", "Scoring", "<p>Every hole by its score against par, before handicap strokes.</p>"],
  ["shots", "Shots", "<p>Strokes gained against everyone on the same card, and the extras you kept: each round counts only if it kept enough holes of that reading to say something.</p>"],
];

/** The whole tab, for one player: `holes` are statHoles rows, `cards` league cards for strokes gained. */
export function trendsBody(p, holes, cards, who = "you") {
  if (p.rounds.length < MIN_POINTS) return `<p class="muted center" style="margin:30px 0">Trends start after ${MIN_POINTS} rounds; ${who === "you" ? "you have" : `${esc(who)} has`} ${plural(p.rounds.length, "round")} so far.</p>`;
  const ms = readings(p, holes, cards);
  const tip = `<p>Each dot is one round, oldest on the left; anything given a round is counted over 18 holes. The line is the average of the latest few rounds at every point, so one good or bad day bends it without breaking it. The dashed level is where the first few rounds started.</p>
    <p>The figure is the average of the last few rounds, and beside it how far that is from the first few. Green is better, whichever way better runs: a falling handicap is green.</p>`;
  return `${h2tip("What is moving", `<p>The readings that have moved furthest since the first rounds, measured against how much each one normally wobbles from round to round.</p>${tip}`)}${movers(ms)}
    ${GROUPS.map(([g, title, more]) => { const rows = ms.filter(m => m.group === g);
      return rows.length ? `${h2tip(title, more + tip)}<div class="card trows">${rows.map(trendRow).join("")}</div>` : ""; }).join("")}`;
}
