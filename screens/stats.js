// What a pile of rounds says: the field, one player, their rivals, and the nines they walked.
import * as S from "../store.js";
import { esc, plural, firstName, ordinal, fmtDate, shortDate, courseBy, h2tip as tipHead, infoBtn, safeCompute, ui, switched, ICONS, TROPHIES } from "../ui.js";
import { compute, computeNine, leagueStats, achievements, rivals, SCORE_BUCKETS, fmtToPar, fmtSigned, fix, strokesGained, leagueCards, statReadings, statSummary, fmtPct, RATE_MIN, NO_SCORE, isTeamFormat, isMatchFormat, TABLE_KEYS } from "../model.js";
import { sgWords } from "./extras.js";
import { H2H_BASES, basisUnit, basisWord, seasonRounds, shownSeason, ELO_BASIS, standingsFor } from "./formats.js";
import { nineName } from "./play.js";
import { shotsBody, barRows, markKey, lead, leads } from "./shots.js";
import { trendsBody } from "./trends.js";

const BUCKET_KEY = SCORE_BUCKETS.map(b => b.key);
// every stats heading carries its picture; a heading not named here goes without
const HEAD_ICONS = { "Round by round": "chart", "Form and consistency": "rank", "Habits": "habits",
  "Hole breakdown": "holes", "Match play": "vs", "Who scores what": "scorecard",
  "Player by player": "users", "Head to head": "vs", "How the holes went": "golf", "Side by side": "vs", "The nines walked": "loop", "Nines walked": "loop", "Honours": "trophy", "Booby prizes": "spoon" };
const h2tip = (title, text) => tipHead(title, text, HEAD_ICONS[title] || "");
const h2 = (title, icon) => `<h2>${ICONS[icon] || ""}${esc(title)}</h2>`;
export const pct = (v, t) => t ? Math.round((v / t) * 100) : 0;
const sumc = cs => cs.reduce((a, b) => a + b, 0);
export const parOrBetter = x => x.counts[0] + x.counts[1] + x.counts[2];
const whereName = w => String(w || "").replace(/, 9 holes$/, "");
const recFig = (r, big, label, sub) => r ? `<a href="#review/${esc(r.id)}"><b class="num">${esc(big)}</b><small>${esc(label)}</small><i>${esc(sub)}</i></a>` : "";
/** The currency these comparisons are read in, as one line that opens a sheet rather than a row of tabs. */
export const basisPicker = (act, chosen) => `<button class="pickrow" data-act="${act}-open">Compared on <b>${esc((H2H_BASES.find(x => x[0] === chosen) || H2H_BASES[0])[1])}</b> <i aria-hidden="true">⌄</i></button>`;
export const basisSheetBody = chosen => `<div class="fmtpicks">${H2H_BASES.map(([k, label, rw]) => `<button class="fmtpick${k === chosen ? " on" : ""}" data-sheet="${k}"><span><b>${esc(label)}</b><small>the day goes to ${esc(rw)}</small></span></button>`).join("")}</div>`;

export function donut(counts, big, small) {
  const total = sumc(counts), R = 56, W = 22, C = 2 * Math.PI * R;
  const shown = counts.filter(v => v > 0).length;
  let off = 0;
  const arcs = counts.map((v, k) => {
    if (!v) return "";
    const len = (C * v) / total, on = Math.max(len - (shown > 1 ? 2 : 0), 0.6);
    const seg = `<circle class="dseg ${BUCKET_KEY[k]}" cx="70" cy="70" r="${R}" stroke-width="${W}" stroke-dasharray="${on} ${C - on}" stroke-dashoffset="${-off}"></circle>`;
    off += len;
    return seg;
  }).join("");
  // fitDonuts() in charts.js wraps or shrinks these once the theme's font is known
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Scoring distribution, given as numbers beside it">
    <g transform="rotate(-90 70 70)">${total ? arcs : `<circle class="dseg none" cx="70" cy="70" r="${R}" stroke-width="${W}"></circle>`}</g>
    <text class="dbig" x="70" y="70">${esc(big)}</text><text class="dsmall" x="70" y="89">${esc(small)}</text></svg>`;
}
function donutKey(counts, per = 0, unit = "round") {
  const total = sumc(counts);
  return `<ul class="dkey">${SCORE_BUCKETS.map((b, k) => `<li class="${counts[k] ? "" : "off"}"><i class="${b.key}"></i><span>${b.label}</span><b class="num">${counts[k]}</b>
    <small>${counts[k] ? `${pct(counts[k], total)}%${per ? ` · ${fix(counts[k] / per)} a ${unit}` : ""}` : "&mdash;"}</small></li>`).join("")}</ul>`;
}
const donutTip = lead => `<p>${lead}</p>
  <p>Each hole is counted by its score against par, before any handicap strokes: a birdie is one under, a bogey one over. The ring is how they split, and the figure in the middle is the share played in par or better.</p>
  <p>Beside each kind: how many, its share of every hole, and what that comes to in an average round. Under the ring, <b>pts a round</b> is what an average round is worth in Stableford points, and <b>a hole against par</b> is how far over or under par the average hole is played.</p>`;
export const inlineKey = () => `<div class="dkeyline">${SCORE_BUCKETS.map(b => `<span><i class="${b.key}"></i>${b.short}</span>`).join("")}</div>`;
export function distBar(counts) {
  const total = sumc(counts);
  return `<div class="dbar">${counts.map((v, k) => v ? `<i class="${BUCKET_KEY[k]}" style="width:${(v / total) * 100}%"></i>` : "").join("")}</div>`;
}
export function tapeRow(label, va, vb, lower = false, fmtv = v => v) {
  if (va === null || va === undefined || vb === null || vb === undefined) return "";
  const s = 1 - Math.min(va, vb, 0), a = va + s, b = vb + s;
  const share = lower ? ((1 / a) / (1 / a + 1 / b)) * 100 : (a / (a + b)) * 100;
  const lead = va === vb ? "" : (lower ? va < vb : va > vb) ? "a" : "b";
  return `<div class="tape"><b class="${lead === "a" ? "win" : ""}">${fmtv(va)}</b><span>${label}</span><b class="${lead === "b" ? "win" : ""}">${fmtv(vb)}</b><div class="tbar"><i style="width:${share}%"></i></div></div>`;
}
const mixedLengths = rs => new Set(rs.map(r => r.n)).size > 1;

function formChart(rs) {
  const mixed = mixedLengths(rs);
  const val = r => mixed ? r.pts / r.n : r.pts;
  const fld = r => r.fieldPts === null ? null : (mixed ? r.fieldPts / r.n : r.fieldPts);
  const top = Math.max(...rs.map(r => Math.max(val(r), fld(r) || 0)), 0.01);
  const cols = rs.map(r => {
    const h = (val(r) / top) * 88, f = fld(r) === null ? null : (fld(r) / top) * 88;
    const title = `${fmtDate(r.date)} · ${r.where}${r.loop ? ` · ${whereName(r.loop)}` : ""} · ${r.pts} points over ${plural(r.n, "hole")}${r.fieldPts === null ? "" : `, the rest of the field ${fix(r.fieldPts)}`}`;
    return `<a class="fcol" href="#review/${r.id}" title="${esc(title)}"><div class="fplot">${rs.length <= 10 ? `<b class="fval num" style="bottom:calc(${h}% + 2px)">${mixed ? fix(val(r), 2) : r.pts}</b>` : ""}
        ${f === null ? "" : `<i class="fghost" style="height:${f}%"></i>`}<i class="fbar" style="height:${h}%"></i></div><small>${esc(shortDate(r.date))}</small></a>`;
  }).join("");
  return `<div class="card"><div class="fchart">${cols}</div>${mixed ? `<p class="muted small center" style="margin:8px 0 0">points a hole</p>` : ""}</div>`;
}

// ---------------------------------------------------------------- putts, fairways and the rest, player by player
/** Every player who keeps them, one row each, so a league can see its fairways and its greens in one place: { tip, html }, or null. */
function extrasTable(St) {
  const opts = { per18: true };
  const who = St.players.filter(p => p.statline && p.statline.any);
  if (!who.length) return null;
  const seen = new Map();
  for (const x of [St.field, ...who]) for (const r of statReadings(x.statline, opts)) if (TABLE_KEYS.includes(r.key) && !seen.has(r.key)) seen.set(r.key, r);
  const cols = TABLE_KEYS.map(k => seen.get(k)).filter(Boolean);
  if (!cols.length) return null;
  const by = p => Object.fromEntries(statReadings(p.statline, opts).map(r => [r.key, r]));
  const lead = cols[0];
  const rows = who.map(p => ({ id: p.id, name: p.name, by: by(p) })).sort((a, b) => {
    const x = a.by[lead.key], y = b.by[lead.key];
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1) || a.name.localeCompare(b.name);
    return (lead.lower ? x.value - y.value : y.value - x.value) || a.name.localeCompare(b.name);
  });
  // the column head says what the figure is, so "over 18 holes" under it only needs to say "18 holes"
  const cell = r => r ? `<b class="num">${esc(r.big)}</b><small>${esc(r.sub.replace(/^over /, ""))}</small>` : `<span class="muted">&ndash;</span>`;
  const head = c => XTAB_SHORT[c.key] ? `<th title="${esc(c.title)}"><span class="xwide">${esc(c.short)}</span><span class="xnarrow">${XTAB_SHORT[c.key]}</span></th>` : `<th>${esc(c.short)}</th>`;
  return { tip: `<p>The putts, fairways and greens each player keeps, and only what was written down. Every figure counts the holes that answered it and no others, so a player who started keeping putts halfway through a season is measured over the holes they kept them for, and the small number under each reading says which holes those were.</p>
      <p>A percentage waits until there are eight attempts behind it; under that it stays the fraction it is.</p>`,
    // One tbody a player: the name on a line of its own, the figures under it, so the seven columns get the
    // whole width instead of what a long name leaves them, and the table fits a phone without scrolling.
    html: `<table class="stand xtab"><thead><tr>${cols.map(head).join("")}</tr></thead>
      ${rows.map(r => `<tbody><tr class="xname"><th class="l" colspan="${cols.length}" scope="rowgroup">${esc(r.name)}</th></tr><tr>${cols.map(c => `<td>${cell(r.by[c.key])}</td>`).join("")}</tr></tbody>`).join("")}</table>` };
}
// column heads for a phone, where seven full words do not fit across; the full one stays in the head's title
const XTAB_SHORT = { fairway: "Fwy", upDown: "U&amp;D", penalty: "Pen", bunkers: "Bunk", sandOut: "Out" };

const holeRow = (label, x) => x && x.holes ? { label, v: x.pts, big: fix(x.pts, 2),
  sub: `${fmtSigned(x.vspar, 2)} a hole · ${plural(x.holes, "hole")}` } : null;
const holesTip = who => `<p>How ${who} plays each kind of hole, cut two ways: <b>Par</b> splits them into par 3s, 4s and 5s, <b>Stroke index</b> into the hardest, middle and easiest third of the card. Each bar is the Stableford points a hole of that kind is worth on average; under it, how far the average score is over or under par, and how many have been played.</p>
  <p>Every scorecard gives each hole a stroke index, the number that ranks the holes from hardest (1) to easiest. The hardest holes are also where handicap strokes are given, which is why they often pay the most Stableford points even though they are played worst against par.</p>
  <p>The mark is net par: two points, a hole played exactly to the handicap. A bar past it is drawn green.</p>`;
const BANDS = ["Hardest third", "Middle third", "Easiest third"];
/**
 * Points a hole as bars, cut by par or by stroke-index third, one cut at a time behind a switch; on a golfer's own
 * page (and a friend's) a third pane, `gains`, says where their game drops below their own average. The figure on
 * top is that average, so it stays in place whichever pane is shown.
 */
function holeKinds(x, who, gains = null) {
  const pars = Object.keys(x.byPar).sort().map(k => holeRow(`Par ${k}s`, x.byPar[k])).filter(Boolean);
  const bands = x.bands.map((b, i) => holeRow(BANDS[i], b)).filter(Boolean);
  const bars = rows => rows.length ? `${barRows(rows, { top: 3, mark: 2 })}${markKey("net par")}` : "";
  return `${h2tip("Hole breakdown", `${holesTip(who)}${gains ? gains.tip : ""}`)}
    ${switched("holes", [{ k: "par", label: "Par", html: bars(pars) }, { k: "index", label: "Stroke index", html: bars(bands) }, gains && { k: "gains", label: "Where to gain", html: gains.html }],
      body => `<div class="card">${leads([lead(fix(x.pts, 2), "points a hole", "every hole")])}<div class="sgap"></div>${body}</div>`)}`;
}

// rounds behind each figure in the form table: spread needs two, last three three, trend four (model.js)
const FORM_MIN = 2, LAST3_MIN = 3, TREND_MIN = 4;
/**
 * Who is moving and who is steady. A spread needs more than one round behind it, so a player with a single round
 * is not given a spread of nought: they stay in the table in grey, with how many rounds it takes to get in. Gains
 * needs only one round, so every player is in it.
 */
function formTable(St) {
  const everyone = St.players.filter(p => p.played > 0);
  const players = everyone.filter(p => p.played >= FORM_MIN), waiting = everyone.filter(p => p.played < FORM_MIN);
  if (!everyone.length) return "";
  const shots = St.field.statline.any ? extrasTable(St) : null;
  const mixed = mixedLengths(St.rounds);
  const by = ["strokes", "gains", ...(shots ? ["shots"] : [])].includes(ui.formBy) ? ui.formBy : "pts";
  const pick = (k, label) => `<button data-act="formby" data-v="${k}" class="${by === k ? "on" : ""}" aria-pressed="${by === k}">${label}</button>`;
  const picks = `<div class="filter mini">${pick("pts", "Points")}${pick("strokes", "Strokes")}${pick("gains", "Gains")}${shots ? pick("shots", "Shots") : ""}</div>`;
  if (by === "gains") return gainsTable(everyone, mixed, picks);
  if (by === "shots") return `${h2tip("Form and consistency", shots.tip)}${picks}${shots.html}`;
  const strokes = by === "strokes";
  const v = p => strokes ? (mixed ? p.strokes18 : p.strokes) : mixed ? p.per18 : { avg: p.avgPts, spread: p.consistency, form: p.form, trend: p.trend };
  // fewest strokes first, and a player with no round holed out at the foot
  const rows = !strokes ? players : [...players].sort((a, b) => (v(a).avg ?? Infinity) - (v(b).avg ?? Infinity) || a.name.localeCompare(b.name));
  const need = FORM_MIN - 1;
  const waitRow = p => `<tr class="muted"><td class="l">${esc(p.name)}</td><td>${p.played}</td><td colspan="4">${plural(need, "more round")} to go</td></tr>`;
  const played = p => {
    if (strokes) return p.strokes.rounds === p.played ? p.played : `${p.strokes.rounds}<small class="tsub">of ${p.played}</small>`;
    return !mixed || !p.nines ? p.played : `${p.played}<small class="tsub">${p.nines === p.played ? "all nines" : plural(p.nines, "nine")}</small>`;
  };
  const dash = (x, f) => x === null ? "&ndash;" : f(x);
  const unit = strokes ? "strokes" : "points";
  return `${h2tip("Form and consistency", `<p><b>Avg</b> is ${unit} ${mixed ? "per 18 holes" : "a round"} across the season. <b>Spread</b> is how far a typical round sits either side of that average, so a small number is a player you can predict.</p>
      <p><b>Last 3</b> is the average of their last three rounds, which is form rather than record, and <b>trend</b> compares the first half of their rounds with the second half: ${strokes ? "minus means the second half took fewer strokes" : "plus means the second half was better"}.</p>
      <p>Each figure needs rounds behind it: a spread needs ${FORM_MIN}, so a player with one round waits in grey; last 3 needs ${LAST3_MIN} and trend ${TREND_MIN}, and shows a dash until then. Gains needs only one round, so everyone is in it.</p>
      <p>Switch between points, strokes, gains${St.field.statline.any ? " and shots" : ""} above the table. <b>Gains</b> names, for each player, the part of their game where they lose the most to the rest of the field: a skill where the cards keep putts, greens and the like, otherwise a kind of hole. Strokes count only rounds with every hole holed out, so the number of rounds can be smaller, and they are not evened out for the course: a par 70 and a par 72 count as they were played.</p>
      ${mixed ? `<p>This society plays both nines and eighteens, so every round is put on an eighteen-hole footing first: a nine counts double.${strokes ? "" : " 36 is an eighteen played to the handicap."}</p>` : ""}`)}
    ${picks}
    <div class="tscroll"><table class="stand nowrap"><thead><tr><th class="l">Player</th><th>Rounds</th><th>${mixed ? "Avg /18" : "Avg"}</th><th>Spread</th><th>Last 3</th><th>Trend</th></tr></thead>
      <tbody>${rows.map(p => { const x = v(p); return `<tr><td class="l">${esc(p.name)}</td><td>${played(p)}</td><td class="acc">${dash(x.avg, fix)}</td>
        <td>${dash(x.spread, fix)}</td><td>${dash(x.form, fix)}</td><td>${dash(x.trend, fmtSigned)}</td></tr>`; }).join("")}${waiting.map(waitRow).join("")}</tbody></table></div>
    <p class="muted small" style="margin:6px 4px 0">${mixed ? `${strokes ? "Strokes" : "Points"} per 18 holes. A nine counts double. ` : ""}A player joins from round ${FORM_MIN}; last 3 shows from round ${LAST3_MIN}, trend from round ${TREND_MIN}.</p>`;
}

// holes of one kind needed on both sides before they are compared, as the Against the field tapes ask
const GAIN_MIN = 6;
/**
 * Each kind of hole (par 3s, 4s, 5s; hardest, middle and easiest third by stroke index) where `p` scores fewer
 * points a hole than `base(of)` -- a { pts, holes } to measure against -- as what closing the gap would be worth
 * in a round. Par and stroke index cut the same holes two ways, so the gains overlap and are never added together.
 */
function kindGains(p, mixed, base) {
  const kinds = [...Object.keys(p.byPar).map(k => [`Par ${k}s`, x => x.byPar[k]]), ...BANDS.map((label, i) => [label, x => x.bands[i]])];
  return kinds.map(([label, of]) => {
    const mine = of(p), to = base(of);
    if (!mine || mine.holes < GAIN_MIN || !to || to.holes < GAIN_MIN || to.pts <= mine.pts) return null;
    // how many holes of this kind a round brings them, on an eighteen-hole footing when nines and eighteens mix
    const per = mixed ? (mine.holes / p.holes) * 18 : mine.holes / p.played;
    return { label, fmt: v => fix(v, 2), say: "a hole", now: mine.pts, base: to.pts, worth: (to.pts - mine.pts) * per };
  });
}

/**
 * The parts of the game the extras on a card can price: each a reading per attempt (`of`, { n, v } off a statSummary)
 * and what one unit of it is worth in strokes (`worth`, learnt from the golfer's own cards where it has to be). A putt
 * or a penalty shot is a stroke, and so is an up and down missed; a green is worth what the golfer's own holes say
 * (`fromGir`: strokes against par off the green less on it), and a fairway the greens it brings (`fromFairway`) at
 * that same price.
 */
const SKILLS = [
  { label: "Putting", lower: true, fmt: v => fix(v, 2), say: "putts a hole", of: s => s.putts && { n: s.putts.holes, v: s.putts.avg }, worth: () => 1 },
  { label: "Greens in regulation", fmt: fmtPct, say: "of greens", of: s => s.gir && { n: s.gir.holes, v: s.gir.pct }, worth: s => s.fromGir && s.fromGir.edge },
  { label: "Fairways", fmt: fmtPct, say: "of fairways", of: s => s.fairway && { n: s.fairway.holes, v: s.fairway.pct },
    worth: s => s.fromFairway && s.fromGir && s.fromFairway.edge * s.fromGir.edge },
  { label: "Up and down", fmt: fmtPct, say: "up and down", of: s => s.upDown && { n: s.upDown.holes, v: s.upDown.pct }, worth: () => 1 },
  { label: "Penalties", lower: true, fmt: v => fix(v, 2), say: "penalty shots a hole", of: s => s.penalty && { n: s.penalty.holes, v: s.penalty.total / s.penalty.holes }, worth: () => 1 },
];
/** Each skill where `p` falls short of `base(skill)` ({ n, v } or null), as strokes a round: gap × attempts a round × worth. */
function skillGains(p, mixed, base) {
  const s = p.statline;
  if (!s || !s.any || !s.holes) return [];
  const holes = mixed ? 18 : p.holes / p.played;  // holes in a round
  return SKILLS.map(k => {
    const mine = k.of(s), to = base(k), w = k.worth(s);
    if (!mine || !to || mine.n < RATE_MIN || to.n < RATE_MIN || !(w > 0)) return null;
    const gap = k.lower ? mine.v - to.v : to.v - mine.v;
    // attempts a round: how often it comes up on a hole that kept anything at all, times the holes in a round
    return gap <= 0 ? null : { label: k.label, fmt: k.fmt, say: k.say, now: mine.v, base: to.v, worth: gap * w * (mine.n / s.holes) * holes };
  });
}
/**
 * What to work on, biggest first: the skills when the cards keep the extras to price them, otherwise the kinds of hole.
 * `base` is { kind, skill }, the two baselines. A gain that rounds to +0.0 is no gain.
 */
function gainsFor(p, mixed, base) {
  const keep = gs => gs.filter(g => g && g.worth >= 0.05).sort((a, b) => b.worth - a.worth);
  const skills = keep(skillGains(p, mixed, base.skill));
  return skills.length ? skills : keep(kindGains(p, mixed, base.kind));
}
/** The better half of a golfer's own rounds at each skill, pooled, as that skill's baseline; four rounds kept first. */
function ownBest(St, p) {
  const byRound = new Map();
  for (const h of St.holes) if (h.pid === p.id && h.stat) { if (!byRound.has(h.round)) byRound.set(h.round, []); byRound.get(h.round).push(h.stat); }
  const rounds = [...byRound.values()];
  return k => {
    const rs = rounds.map(st => ({ st, x: k.of(statSummary(st)) })).filter(r => r.x);
    if (rs.length < 4) return null;
    rs.sort((a, b) => k.lower ? a.x.v - b.x.v : b.x.v - a.x.v);
    return k.of(statSummary(rs.slice(0, Math.floor(rs.length / 2)).flatMap(r => r.st)));
  };
}
const gainsSkillTip = `A putt or a penalty shot is a stroke, and so is an up and down missed. A green is worth what the player's own holes say it is: how many more strokes they take when they miss one. A fairway is worth the greens it brings them, at that price. A stroke saved is a Stableford point, except on a hole already scoring none.`;
const gainsKindTip = `Every hole is sorted two ways: by par, and by stroke index into the hardest, middle and easiest third of its card. The two cut the same holes, so they overlap and are never added together.`;

/** Society: each player against the rest of the field, on the same days only (`p.rest`). */
function gainsTable(players, mixed, picks) {
  const rows = players.map(p => ({ p, g: gainsFor(p, mixed, { kind: of => of(p.rest), skill: k => p.rest.statline ? k.of(p.rest.statline) : null }) }));
  const dash = `<td class="muted">&ndash;</td>`;
  return `${h2tip("Form and consistency", `<p><b>Gains</b> is where each player loses the most to the field: everyone else in the society, on the days they played together.</p>
      <p>Where the cards keep putts, greens, fairways, up and downs or penalties, the gain is read from those: the gap to the field, times how often it comes up in a round, times what it costs. ${gainsSkillTip}</p>
      <p>Where they do not, it is read from the kinds of hole, as Stableford points a hole against the field's. ${gainsKindTip}</p>
      <p><b>Work on</b> is where the gap is worth the most, with the next one under it. <b>Now</b> is the player's own figure, <b>Field</b> the rest of the field's, and <b>Worth</b> what closing the gap would gain ${mixed ? "per 18 holes" : "a round"}. A reading needs ${RATE_MIN} attempts on both sides, a kind of hole ${GAIN_MIN} holes.</p>`)}
    ${picks}
    <div class="tscroll"><table class="stand nowrap"><thead><tr><th class="l">Player</th><th class="l">Work on</th><th>Now</th><th>Field</th><th>${mixed ? "Worth /18" : "Worth"}</th></tr></thead>
      <tbody>${rows.map(({ p, g }) => { const [a, b] = g;
        return `<tr><td class="l">${esc(p.name)}</td>${!a ? `<td class="l muted">${p.rest && p.rest.holes ? "Level with the field or better" : "No round shared with the field yet"}</td>${dash}${dash}${dash}` : `
          <td class="l">${esc(a.label)}${b ? `<small class="tsub">then ${esc(b.label.toLowerCase())}, ${fmtSigned(b.worth)}</small>` : ""}</td>
          <td>${a.fmt(a.now)}</td><td>${a.fmt(a.base)}</td><td class="acc">${fmtSigned(a.worth)}</td>`}</tr>`; }).join("")}</tbody></table></div>
    <p class="muted small" style="margin:6px 4px 0">Points ${mixed ? "per 18 holes" : "a round"}, closing the gap to the rest of the field.</p>`;
}

/**
 * My own page, or a friend's, measured only against the golfer's own cards: each skill against the better half of
 * their own rounds at it, or, where the cards keep no extras, each kind of hole against their own points a hole over
 * every hole. Stableford is already net of the handicap, so two points is net par on any hole and the kinds can be
 * read against one average.
 */
function gainsSelf(St, p, who, mixed) {
  const g = gainsFor(p, mixed, { kind: () => ({ pts: p.pts, holes: p.holes }), skill: ownBest(St, p) }).slice(0, 3);
  const unit = mixed ? "per 18" : "a round";
  const your = who === "you" ? "your" : `${who}'s`, own = who === "you" ? "your" : "their";
  return { tip: `<p><b>Where to gain</b> measures ${your} game against nothing but ${own} own cards.</p>
      <p>Where the cards keep putts, greens, fairways, up and downs or penalties, each is set against ${own} better half of rounds at it: the half of the rounds, from four kept, in which ${who === "you" ? "you" : "they"} putted best, hit the most greens, and so on. <b>Worth</b> is the gap, times how often it comes up in a round, times what it costs. ${gainsSkillTip}</p>
      <p>Where they do not, each kind of hole is set against ${own} points a hole over every hole, and worth is what bringing it up to that average would add ${mixed ? "per 18 holes" : "to a round"}. ${gainsKindTip}</p>
      <p>A reading needs ${RATE_MIN} attempts, a kind of hole ${GAIN_MIN} holes.</p>`,
    html: !g.length ? `<p class="muted small" style="margin:0">Nothing sits clearly below ${own} own level yet.</p>`
      : g.map(x => `<div class="kv"><span>${esc(x.label)}</span><span class="muted">${x.fmt(x.now)} ${x.say} against ${x.fmt(x.base)} · <b class="acc">${fmtSigned(x.worth)}</b> ${unit}</span></div>`).join("") };
}

const MATCH_TIP = "Match play rounds count here and nowhere else on this page: a match is settled hole by hole on who won it, so its strokes and points say nothing about anyone's golf.";

/** Every match this society has played, a line a player: matches, then holes, won, halved and lost. */
function matchTable(St) {
  if (!St.matches || !St.matches.length) return "";
  const rows = [...St.matches].sort((a, b) => (b.won - b.lost) - (a.won - a.lost) || (b.holesWon - b.holesLost) - (a.holesWon - a.holesLost) || a.name.localeCompare(b.name));
  return `${h2tip("Match play", MATCH_TIP)}
    <table class="stand"><thead><tr><th class="l">Player</th><th>Pl</th><th>W</th><th>H</th><th>L</th><th>Holes</th></tr></thead>
      <tbody>${rows.map(m => `<tr><td class="l">${esc(m.name)}</td><td>${m.played}</td><td>${m.won}</td><td>${m.halved}</td><td>${m.lost}</td><td class="acc">${m.holesWon}–${m.holesHalved}–${m.holesLost}</td></tr>`).join("")}</tbody></table>`;
}

/** `who` is null for the whole society, or the chosen players' names, already escaped. */
function fieldStats(St, nines = "", who = null) {
  const F = St.field;
  const recSub = r => `${firstName(r.player)} · ${shortDate(r.date)}`;
  const dist = [...St.players].sort((a, b) => pct(parOrBetter(b), b.holes) - pct(parOrBetter(a), a.holes) || a.name.localeCompare(b.name))
    .map(p => `<div class="drow"><div class="dname">${esc(p.name)}<small class="muted">${pct(parOrBetter(p), p.holes)}% par or better</small></div>${distBar(p.counts)}</div>`).join("");
  const over = `${plural(F.holes, "hole")} over ${plural(F.rounds, "round")} on ${plural(F.cards, "card")}`;
  return `
    <div class="card statcard hasi">${infoBtn("How the holes went", donutTip(who ? `Every hole ${who} played in this society${St.players.length > 1 ? ", taken together" : ""}: ${over}.` : `Every hole this society has played: ${over}.`), "corner")}
      <div class="dwrap">${donut(F.counts, `${pct(parOrBetter(F), F.holes)}%`, "par or better")}${donutKey(F.counts, F.rounds, "round")}</div>
      <p class="muted small" style="margin:10px 0 0">${plural(F.holes, "hole")} · ${fix(F.avgPts)} pts a round · ${fmtSigned(F.vspar, 2)} a hole against par</p></div>
    ${formTable(St)}
    ${F.statline.any ? shotsBody(F.statline, [], null, "", { perRound: false, bunkers: true }) : ""}
    ${holeKinds(F, !who ? "everyone in this society together" : St.players.length > 1 ? `${who} together` : who)}
    ${nines}
    ${matchTable(St)}
    ${h2tip("Who scores what", `One bar a player: every hole they have played in this society, best scores on the left and worst on the right. The longer the left end, the more often they are at par or better.`)}
    <div class="card dists">${inlineKey()}${dist}</div>
    ${h2("Records", "trophy")}
    <div class="card"><div class="sleads grid">
      ${F.bestRound ? recFig(F.bestRound, F.bestRound.pts, "points, best round", recSub(F.bestRound)) : ""}
      ${F.lowRound ? recFig(F.lowRound, F.lowRound.gross, `best against par, ${fmtToPar(F.lowRound.topar)}`, recSub(F.lowRound)) : ""}
      ${F.mostBirdies && F.mostBirdies.birdies > 1 ? recFig(F.mostBirdies, F.mostBirdies.birdies, "most birdies in a round", recSub(F.mostBirdies)) : ""}
      ${F.bounce === null ? "" : lead(`${Math.round(F.bounce * 100)}%`, "bounce back", "par or better after a bogey or worse")}
    </div></div>`;
}

function playerStats(St, p, nines = "", gid = "", cards = [], only = null, named = false) {
  const want = k => !only || only.includes(k);
  const R = p.rest, one = p.played === 1, first = firstName(p.name);
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const fig = (big, label, sub = "") => `<div><b class="num">${big}</b><small>${label}</small>${sub ? `<i>${sub}</i>` : ""}</div>`;
  const recSub = r => `${shortDate(r.date)} · ${whereName(r.where)}`;
  const line = (label, value) => `<div class="kv"><span>${label}</span><span class="muted">${value}</span></div>`;
  const per = k => p.played ? p.counts[k] / p.played : 0;
  const birdies = p.counts[0] + p.counts[1];
  const enough = (a, b) => a && b && a.holes >= 6 && b.holes >= 6;
  const mixed = mixedLengths(p.rounds);
  const f = mixed ? p.per18 : { avg: p.avgPts, spread: p.consistency, form: p.form, trend: p.trend };
  // My own page is built from my rounds alone, so "the rest" and "where I finish" would only ever be me; a friend's
  // likewise, but told in their name
  const society = !!gid, third = society || named;
  const fieldTip = `<p><b>The field</b>: ${esc(first)} on the left of every line, everyone else in this society on the right, over the ${plural(p.played, "round")} they played together. The green end is whoever is ahead; on strokes against par and on bad holes, ahead means the lower number.${mixed ? " This society mixes nine- and eighteen-hole rounds, so read the figures given a hole at a time rather than a round at a time." : ""}</p>`;
  const fieldBody = !society ? "" : `
    ${!R.holes ? `<p class="muted small" style="margin:0 4px">${esc(first)} has not yet shared a round in this society with anyone else, so there is nothing to measure against.</p>` : `
    <div class="card tapes mine">
      ${tapeRow("points a round", p.avgPts, R.pts * (p.holes / p.played), false, v => fix(v))}
      ${tapeRow("points a hole", p.pts, R.pts, false, v => fix(v, 2))}
      ${tapeRow("strokes against par", p.vspar, R.vspar, true, v => fmtSigned(v, 2))}
      ${tapeRow("par or better", pct(parOrBetter(p), p.holes), pct(parOrBetter(R), R.holes), false, v => `${v}%`)}
      ${tapeRow("birdies or better", pct(birdies, p.holes), pct(R.counts[0] + R.counts[1], R.holes), false, v => `${v}%`)}
      ${tapeRow("double or worse", pct(p.counts[4] + p.counts[5], p.holes), pct(R.counts[4] + R.counts[5], R.holes), true, v => `${v}%`)}
      ${Object.keys(p.byPar).map(k => enough(p.byPar[k], R.byPar[k]) ? tapeRow(`points on par ${k}s`, p.byPar[k].pts, R.byPar[k].pts, false, v => fix(v, 2)) : "").join("")}
      ${enough(p.bands[0], R.bands[0]) ? tapeRow("points on the hardest third", p.bands[0].pts, R.bands[0].pts, false, v => fix(v, 2)) : ""}
    </div>
    <p class="muted small" style="margin:6px 4px 0">${p.vsField === null ? "" : (p.beatOf === 1
        ? `${esc(first)} ${p.beat ? "beat" : "did not beat"} the rest of the field in the one round they have shared.`
        : `${esc(first)} beat them in ${p.beat} of those ${p.beatOf} rounds, ${p.vsField >= 0 ? `${fix(p.vsField)} points up overall` : `${fix(-p.vsField)} points behind overall`}.`)}</p>`}`;
  const who = third ? esc(first) : "you";
  const form = one ? `<p class="muted small" style="margin:14px 4px">Form and consistency appear after a second round${society ? " here" : ""}.</p>`
    : `${h2tip("Habits", `<p><b>Either side</b> is how far a typical round sits from the average: the smaller, the steadier. ${society ? " <b>Last three</b> is form, the average of the latest three rounds. <b>Trend</b> compares the first half of the rounds with the second; plus means the second half was better. <b>Streak</b> counts the latest rounds in a row above the rest of the field." : ` How each part of ${named ? "their" : "your"} game has moved over time is under Trends.`}</p>
      <p><b>Points a hole</b> splits a round in two, front half and back half. <b>Bounce back</b> is how often the hole straight after a bogey or worse was played in par or better. <b>Blow-ups</b> counts doubles or worse in a round.</p>${mixed ? "<p>These rounds mix nines and eighteens, so the points are put on an eighteen-hole footing first: a nine counts double.</p>" : ""}`)}
    <div class="card"><div class="sleads grid">
      ${fig(`±${fix(f.spread)}`, "points either side", `of ${fix(f.avg)} ${mixed ? "per 18" : "on average"}`)}
      ${f.form === null || !society ? "" : fig(fix(f.form), `points${mixed ? " per 18" : ""}, last three`, `${fmtSigned(f.form - f.avg)} on the average`)}
      ${f.trend === null || !society ? "" : fig(fmtSigned(f.trend), "trend", "first half to second")}
      ${fig(`${fix(p.firstHalf, 2)}<span class="to">→</span>${fix(p.lastHalf, 2)}`, "points a hole", "front half, back half")}
      ${p.bounce === null ? "" : fig(`${Math.round(p.bounce * 100)}%`, "bounce back", `after ${plural(p.bounceOf, "bad hole")}`)}
      ${fig(fix(p.blowups), "blow-ups a round", "double or worse")}
      ${society && p.streak ? fig(p.streak, "streak", `${plural(p.streak, "round")} above the field`) : ""}
      ${society ? fig(ordinal(Math.round(p.avgPlace)), "finish on average", p.podiums ? `${p.podiums} of ${p.played} on the podium` : "") : ""}
      ${p.penalties ? fig(p.penalties, "penalty strokes") : ""}
      ${p.counted10 ? fig(p.counted10, `holes counted ${NO_SCORE}`) : ""}
    </div></div>`;
  return `${want("core") ? `
    ${want("notiles") && only ? "" : `<div class="mecard"><div class="stats">${tile(p.played, plural(p.played, "round").split(" ")[1])}${tile(fix(p.avgPts), "avg pts")}${one ? "" : tile(p.bestPts, "best")}${p.returns ? tile(fmtToPar(Math.round(p.avgTopar)), "avg to par") : ""}${p.wins ? tile(p.wins, plural(p.wins, "win").split(" ")[1]) : ""}</div></div>`}
    <div class="card statcard hasi">${infoBtn("How the holes went", donutTip(`Every hole ${third ? `${esc(first)} has played${society ? " in this society" : ""}` : "you have played"}: ${plural(p.holes, "hole")} over ${plural(p.played, "round")}. ${third ? esc(first) : "You"} ${birdies ? `make${third ? "s" : ""} ${fix(birdies / p.played)} birdies or better` : `${third ? "has" : "have"} yet to make a birdie`} and ${fix(per(2))} pars a round.`), "corner")}
      <div class="dwrap">${donut(p.counts, `${pct(parOrBetter(p), p.holes)}%`, "par or better")}${donutKey(p.counts, p.played, "round")}</div>
      <p class="muted small" style="margin:10px 0 0">${plural(p.holes, "hole")} · ${fmtSigned(p.vspar, 2)} a hole against par</p></div>
    ${one || !society ? "" : `${h2tip("Round by round", `One bar a round, oldest on the left: ${society ? `${esc(first)}'s` : "your"} points ${mixed ? "a hole, because the rounds mix nines and eighteens" : "in each round"}.${society ? " The grey column behind a bar is what everyone else in the society scored that day." : ""} Tap a bar for that card.`)}${formChart(p.rounds)}`}
    ${form}
    ${headToHead(fieldBody, fieldTip, want("rivals") ? rivalsBlock(St, p, gid, cards) : null)}` : ""}
    ${want("core") && p.match ? `${h2tip("Match play", MATCH_TIP)}<div class="card">
      ${line("Matches", `${p.match.won} won, ${p.match.halved} halved, ${p.match.lost} lost`)}
      ${line("Holes", `${p.match.holesWon} won, ${p.match.holesHalved} halved, ${p.match.holesLost} lost`)}</div>` : ""}
    ${want("sg") ? shotsBody(p.statline, cards, p.id, society ? "the rest of this society" : "everyone you played with", { perRound: !society, bunkers: society }) : ""}
    ${want("core") ? holeKinds(p, who, society ? null : gainsSelf(St, p, who, mixed)) : ""}
    ${want("nines") ? nines : ""}
    ${want("core") ? `${h2(society ? `${first} in this society` : "Records", "trophy")}
    <div class="card"><div class="sleads grid">
      ${p.bestRound ? recFig(p.bestRound, p.bestRound.pts, "points, best round", recSub(p.bestRound)) : ""}
      ${one ? "" : lead(p.worstPts, "points, worst round", `${fix(p.avgPts)} on average`)}
      ${p.lowRound ? recFig(p.lowRound, p.lowRound.gross, `best against par, ${fmtToPar(p.lowRound.topar)}`, recSub(p.lowRound)) : ""}
      ${p.mostBirdies && p.mostBirdies.birdies > 1 ? recFig(p.mostBirdies, p.mostBirdies.birdies, "most birdies in a round", recSub(p.mostBirdies)) : ""}
    </div></div>` : ""}`;
}

// ---------------------------------------------------------------- my own game, across every round I played
/** One golfer's numbers from computed rounds: what both Mine and a friend's page draw. */
export function gameOf(Ms, id, rounds = []) {
  const St = leagueStats(Ms, id ? [id] : []);
  return { rounds, Ms, St, p: St.players.find(x => x.id === id) || null };
}

/** Every finished round with my seat on it, computed so my seat answers to my identity. */
export function myGame() {
  const meId = S.myAccount() || S.state.settings.meId;
  const rounds = S.myRounds().filter(r => r.status === "done" && !isTeamFormat(r.format));
  return { meId, ...gameOf(rounds.map(r => safeCompute(compute, r, true)).filter(Boolean), meId, rounds) };
}

/** One topic of a golfer's game: scoring, shots, trends or nines. `them` is a friend's first name; mine has none. */
export function gameBody({ rounds, Ms, St, p }, topic, them = null) {
  if (!p) return `<p class="muted center" style="margin:30px 0">${them ? `${esc(them)} has no finished rounds yet.` : "Finish a round and your numbers start here."}</p>`;
  if (topic === "shots") return `<div class="statsbody">${shotsBody(p.statline, leagueCards(Ms), p.id, "everyone you played with")}</div>`;
  if (topic === "trends") return `<div class="statsbody">${trendsBody(p, St.holes, leagueCards(Ms), them || "you")}</div>`;
  const parts = { scoring: ["core", "notiles"], nines: ["nines"] }[topic] || ["core", "notiles"];
  const nines = topic === "nines" ? ninesPlayerBlock(rounds, p.id, "You") || `<p class="muted center">No loop walked yet.</p>` : "";
  const body = playerStats(St, p, nines, "", leagueCards(Ms), parts, !!them);
  return `<div class="statsbody">${body.trim() || `<p class="muted center" style="margin:30px 0">Nothing here yet.</p>`}</div>`;
}

function rivalVerdict(r, me, them) {
  const bits = [];
  const l = r.lift === null ? null : r.lift * (r.scale || 18);
  if (l !== null) bits.push(Math.abs(l) < 1 ? `${them}'s day barely moves ${me}'s` : l > 0 ? `${me} has tended to play better on the days ${them} does too` : `${me} has tended to play better when ${them} is off`);
  if (r.corr !== null && r.played >= 5 && Math.abs(r.corr) >= 0.5) bits.push(r.corr > 0 ? "over these rounds their cards have moved together" : "when one of them has a good day, the other tends not to");
  return bits.length ? `${bits.join("; ")}.` : "";
}
function rivalRecord(r, me, them) {
  if (r.played === 1) return r.won ? `${me} ahead` : r.lost ? `${them} ahead` : "level";
  if (r.won === r.lost) return `level, ${r.won} each${r.tied ? `, ${plural(r.tied, "round")} tied` : ""}`;
  return `${r.won > r.lost ? me : them} ahead in ${Math.max(r.won, r.lost)} of ${r.played}`;
}
function rivalCard(r, me, them) {
  const unit = `${basisUnit(r.basis)} a ${r.scale ? "round" : "hole"}`;
  const val = v => v === null ? "–" : r.scale ? fix(v * r.scale) : fix(v, 2);
  const l = r.lift === null ? null : r.lift * (r.scale || 18);
  const better = (a, b) => r.lower ? a < b : a > b;
  const mark = l !== null && Math.abs(l) >= 1;
  const verdict = rivalVerdict(r, me, them);
  const tile = (label, n, v, up) => `<div class="sside ${up ? "up" : ""}"><small>${label}<i>${plural(n, "round")}${up ? " · better" : ""}</i></small><b class="num">${val(v)}</b></div>`;
  const split = r.lift === null
    ? `<p class="muted small" style="margin:10px 0 0">Splitting ${them}'s good days from their bad ones needs two rounds of each; so far ${r.goodN} better than their own average and ${r.badN} worse.${verdict ? ` ${verdict}` : ""}</p>`
    : `<div class="split">${tile(`${them} better than their average`, r.goodN, r.onGood, mark && better(r.onGood, r.onBad))}${tile(`${them} worse than it`, r.badN, r.onBad, mark && better(r.onBad, r.onGood))}</div>
      ${verdict ? `<p class="muted small" style="margin:10px 0 0">${verdict}</p>` : ""}`;
  return `<div class="card rival"><div class="rhead"><b>${esc(r.name)}</b><span class="muted small">${plural(r.played, "round")} together · ${rivalRecord(r, me, them)}</span></div>
    <div class="tapes mine">${tapeRow(unit, r.myAvg, r.theirAvg, r.lower, val)}</div>
    ${r.sg && r.sg.total !== null ? `<div class="sgline">${sgWords(r.sg, them)}</div>` : ""}${split}</div>`;
}
function rivalRows(rs, me, nameOf) {
  return `<div class="card rivalrows">${rs.map(r => { const val = v => r.scale ? fix(v * r.scale) : fix(v, 2);
    return `<div class="kv"><span>${esc(r.name)}</span><span class="muted">${val(r.myAvg)} to ${val(r.theirAvg)} · ${rivalRecord(r, me, nameOf(r))}</span></div>`; }).join("")}</div>`;
}
function rivalsBlock(St, p, gid, cards = []) {
  const basis = H2H_BASES.some(([k]) => k === ui.basis[gid]) ? ui.basis[gid] : "points";
  const rs = rivals(St.rounds, p.id, basis);
  for (const r of rs) r.sg = cards.length ? strokesGained(cards, p.id, { against: r.id }) : null;
  if (!rs.length && !rivals(St.rounds, p.id).length) return null;
  const me = esc(firstName(p.name));
  const seen = {};
  for (const n of [p.name, ...rs.map(r => r.name)]) seen[firstName(n)] = (seen[firstName(n)] || 0) + 1;
  const nameOf = r => esc(seen[firstName(r.name)] > 1 ? r.name : firstName(r.name));
  const deep = rs.filter(r => r.played > 1), thin = rs.filter(r => r.played === 1);
  const shown = deep.slice(0, 5), rest = deep.slice(5);
  const mixed = mixedLengths(St.rounds.filter(x => x.pid === p.id));
  return { tip: `<p><b>One player</b>: only the rounds the two of them played together, so neither is measured on a day the other one missed.${mixed ? " A nine and an eighteen are compared a hole at a time." : ""}</p>
      <p>The line at the top of each card is their two averages against each other. The two boxes under it split the other player's own days: both are ${me}'s own figure, on the left over the rounds where that player played better than their own average, on the right over the rounds where they did not.</p>
      <p>A handful of rounds cannot settle anything, so read these as talking points rather than facts.</p>`,
    html: `${basisPicker("rivalbasis", basis)}
    ${rs.length ? "" : `<p class="muted small" style="margin:14px 4px">${me} has no round against anybody where both of them finished a full card, so there is nothing to compare on ${esc(basisUnit(basis))}.</p>`}
    ${shown.map(r => rivalCard(r, me, nameOf(r))).join("")}
    ${rest.length ? `<details class="card"><summary class="small">${plural(rest.length, "more player")}</summary>${rest.map(r => rivalCard(r, me, nameOf(r))).join("")}</details>` : ""}
    ${thin.length ? `<p class="muted small" style="margin:16px 4px 6px">Met once so far, in ${esc(basisUnit(basis))} a ${thin[0].scale ? "round" : "hole"}</p>${rivalRows(thin, me, nameOf)}` : ""}` };
}

/** A player in a society against the others: the whole field, or one player at a time, behind one switch. */
function headToHead(fieldBody, fieldTip, one) {
  if (!fieldBody && !one) return "";
  return `${h2tip("Head to head", `${fieldBody ? fieldTip : ""}${one ? one.tip : ""}`)}
    ${switched("h2h", [{ k: "field", label: "The field", html: fieldBody }, one && { k: "one", label: "One player", html: one.html }])}`;
}

// ---------------------------------------------------------------- nines walked
const namesList = xs => xs.length < 2 ? esc(xs[0] || "") : `${xs.slice(0, -1).map(esc).join(", ")} and ${esc(xs[xs.length - 1])}`;

export function ninesPlayed(rounds, pid = null) {
  const out = new Map();
  // identities, the way every other league reading counts: a contact linked to an account answers to the
  // account's id, which is what the standings, the stats and the posters hand back in
  const who = pid ? S.identityOf(pid) : null;
  for (const r of rounds) {
    // a match card's strokes are conceded holes and pick-ups, not a nine anyone played for
    if (r.status !== "done" || isMatchFormat(r.format)) continue;
    const c = courseBy(r.course);
    const nines = (c && c.nines) || [];
    if (!nines.length || c.n !== nines.length * 9) continue;
    nines.forEach((slug, i) => {
      const nc = courseBy(slug);
      if (!nc) return;
      let N;
      try { N = computeNine(nc, S.toModelRound(r, true), i * 9); } catch (e) { return; }
      for (const p of N.players) {
        if (who && p.id !== who) continue;
        if (!out.has(slug)) out.set(slug, { slug, rows: [], unrated: new Set() });
        out.get(slug).rows.push({ round: r, player: p, field: N.field });
      }
      // named under the table: they walked it, but this loop has no rating for the tee they played
      for (const u of N.unrated) if (!(who && u.id !== who) && out.has(slug)) out.get(slug).unrated.add(u.name);
    });
  }
  return [...out.values()].map(x => {
    const gs = x.rows.map(r => r.player.gross).filter(g => g !== null), pts = x.rows.map(r => r.player.pts);
    return { ...x, unrated: [...x.unrated], played: x.rows.length, bestGross: gs.length ? Math.min(...gs) : null, avgGross: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
      bestPts: pts.length ? Math.max(...pts) : null, avgPts: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null };
  }).sort((a, b) => b.played - a.played || nineName(a.slug).localeCompare(nineName(b.slug)));
}

/** Every finished round a player has a result in, newest first, with that player's line from it. */
export function playerRounds(pid) {
  const out = [];
  for (const r of S.roundsOf(pid)) {
    if (r.status !== "done") continue;
    const M = safeCompute(compute, r);
    const x = M && M.players.find(q => q.id === pid);
    if (x) out.push({ r, M, x });
  }
  return out;
}

export function leagueRounds(gid) {
  const g = S.getLeague(gid);
  return seasonRounds(g, shownSeason(g)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function ninesFieldBlock(gid, rounds, only = null) {
  const nines = !only ? ninesPlayed(rounds) : ninesPlayed(rounds)
    .map(x => { const rows = x.rows.filter(r => only.has(r.player.id)); return { ...x, rows, played: rows.length, unrated: [] }; })
    .filter(x => x.rows.length);
  if (!nines.length) return "";
  const pick = nines.some(x => x.slug === ui.nineTab[gid]) ? ui.nineTab[gid] : nines[0].slug;
  const loop = nines.find(x => x.slug === pick);
  const rows = new Map();
  for (const row of loop.rows) {
    const id = row.player.id;
    if (!id) continue;
    if (!rows.has(id)) rows.set(id, { id, name: row.player.name, gs: [], pts: [] });
    const e = rows.get(id);
    if (row.player.gross !== null) e.gs.push(row.player.gross);
    e.pts.push(row.player.pts);
  }
  const table = [...rows.values()].map(e => ({ ...e, played: e.pts.length, avgPts: e.pts.reduce((a, b) => a + b, 0) / e.pts.length, bestGross: e.gs.length ? Math.min(...e.gs) : null, avgGross: e.gs.length ? e.gs.reduce((a, b) => a + b, 0) / e.gs.length : null }))
    .sort((a, b) => b.avgPts - a.avgPts || (a.avgGross ?? 99) - (b.avgGross ?? 99) || a.name.localeCompare(b.name));
  return `${h2tip("The nines walked", `This club's loops are rated on their own, so every nine is scored on its own stroke index and course rating, whether it was walked alone or as half of an 18. Pick a loop; the bars rank the players on it by average points, and the mark is net par, eighteen points.`)}
    <label>Loop<select data-act="ninetab">${nines.map(x => `<option value="${esc(x.slug)}" ${x.slug === pick ? "selected" : ""}>${esc(nineName(x.slug))} · ${plural(x.played, "card")}</option>`).join("")}</select></label>
    <div class="card" style="margin-top:12px">${barRows(table.map((e, i) => ({ label: `${i + 1}. ${e.name}`, v: e.avgPts, big: fix(e.avgPts),
      sub: [`${e.played} walked`, e.bestGross === null ? "" : `best ${e.bestGross}`, e.avgGross === null ? "" : `avg ${fix(e.avgGross)}`].filter(Boolean).join(" · ") })), { top: 27, mark: 18 })}
      ${markKey("net par")}</div>
    ${loop.unrated.length ? `<p class="muted small" style="margin:10px 4px">${namesList(loop.unrated)} walked it too. This loop carries no rating for the tees they played, so there is no way to work out their strokes on it.</p>` : ""}`;
}
export function ninesPlayerBlock(rounds, pid, first) {
  const nines = ninesPlayed(rounds, pid);
  if (!nines.length) return "";
  return `${h2tip("Nines walked", `<p>Each loop is scored on its own stroke index and course rating, whether ${esc(first)} walked it alone or as half of an 18, so the loops can be compared with each other.</p><p>Each bar is the average Stableford points on that loop. The mark is net par, eighteen points: a nine played exactly to the handicap.</p>`)}
    <div class="card">${barRows(nines.map(x => ({ label: nineName(x.slug), v: x.avgPts, big: fix(x.avgPts),
      sub: [`${x.played} walked`, x.bestGross === null ? "" : `best ${x.bestGross}`, x.avgGross === null ? "" : `avg ${fix(x.avgGross)}`].filter(Boolean).join(" · ") })), { top: 27, mark: 18 })}
      ${markKey("net par")}</div>`;
}
export function ninesForPoster(rounds, members) {
  const ids = new Set(members);
  const out = [];
  for (const x of ninesPlayed(rounds)) {
    const rows = x.rows.filter(r => r.player.id && ids.has(r.player.id));
    if (!rows.length) continue;
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.player.id)) by.set(r.player.id, { name: r.player.name, gs: [], tp: [], pts: [] });
      const e = by.get(r.player.id);
      if (r.player.gross !== null) { e.gs.push(r.player.gross); e.tp.push(r.player.topar); }
      e.pts.push(r.player.pts);
    }
    const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const gs = rows.filter(r => r.player.gross !== null);
    out.push({ name: nineName(x.slug), par: (courseBy(x.slug) || {}).course_par ?? 36, cards: rows.length, avgPts: avg(rows.map(r => r.player.pts)),
      avgGross: avg(gs.map(r => r.player.gross)), avgTopar: avg(gs.map(r => r.player.topar)),
      players: [...by.values()].map(e => ({ name: e.name, cards: e.pts.length, avgPts: avg(e.pts), avgGross: avg(e.gs) })) });
  }
  return out;
}

// ---------------------------------------------------------------- the honours board
// What each record is called, the unit beside its number, what a record nobody holds yet asks for, and what
// exactly is counted: which score it reads (gross, Stableford points), over what, and against whom
const HONOURS = {
  low18: ["Lowest gross, 18 holes", e => fmtToPar(e.round.topar), "Hole out all eighteen",
    "Gross strokes against par over an eighteen with every hole holed out, before any handicap."],
  low9: ["Lowest gross, 9 holes", e => fmtToPar(e.round.topar), "Hole out all nine of a nine-hole round",
    "Gross strokes against par over a nine-hole round with every hole holed out, before any handicap."],
  stb18: ["Best Stableford, 18 holes", () => "pts", "Score a point on an eighteen",
    "Stableford points over an eighteen, handicap strokes included."],
  stb9: ["Best Stableford, 9 holes", () => "pts", "Score a point on a nine",
    "Stableford points over a nine-hole round, handicap strokes included."],
  birdies: ["Most birdies in a round", () => "", "Make a birdie",
    "Birdies or better in one round, on the gross score: one under par on the hole before any handicap stroke."],
  eagles: ["Eagles", () => "", "Make an eagle",
    "Eagles or better over the season, on the gross score, a hole in one on a par 4 included."],
  run: ["Longest run at par or better", () => "holes", "Three holes in a row at par or better",
    "Holes in a row at par or better on the gross score, in the order walked, running on from one card into the next."],
  margin: ["Biggest Stableford win", () => "pts", "Win a day by a point or more",
    "Stableford points between the day's winner and the next society member on the same card. Level at the top is no margin."],
  bounce: ["Most bounce-backs in a round", () => "", "Make par or better straight after dropping a shot",
    "Holes in one round played in par or better (gross) straight after a bogey or worse."],
  fairways: ["Most fairways hit in a round", () => "", "Keep fairways on a card and hit one",
    "Fairways ticked as hit on the card in one round."],
  gir: ["Most greens in regulation", () => "", "Keep putts on a card and hit a green in regulation",
    "Greens hit in regulation in one round, ticked on the card or read off the putts."],
  oneputts: ["Most one-putts in a round", () => "", "Keep putts on a card and hole one in one",
    "Holes finished with a single putt in one round."],
  putts18: ["Fewest putts, 18 holes", () => "putts", "Keep putts on every hole of an eighteen",
    "Total putts over an eighteen with the putts kept on every hole."],
  elo: ["Highest Elo rating", () => "", "Gain rating on a day against the others",
    "The highest each player has stood on the society's Elo table."],
  aces: ["Holes in one", () => "", "Hole your tee shot",
    "Holes in one over the season."],
  played: ["Most rounds played", () => "", "Play a round",
    "Finished rounds in the society over the season."],
  lastplaces: ["Most days last on points", () => "", "Finish last on a day with three or more out",
    "Days finished bottom of the society's members on Stableford points, counted only on a day with three or more members out."],
  lowstb18: ["Fewest points, 18 holes", () => "pts", "Play all eighteen",
    "The fewest Stableford points over an eighteen walked from the first hole to the last."],
  blobs: ["Most zero-point holes in a round", () => "", "Score no points on a hole",
    "Holes in one round that scored no Stableford points, a pick-up included."],
  blobrun: ["Longest run without a point", () => "holes", "Three holes in a row without a point",
    "Holes in a row without a Stableford point, in the order walked."],
  worsthole: ["Most over par on one hole", () => "over", "Hole out over par",
    "Gross strokes over par on a single hole, before any handicap. Only holes holed out count, never a pick-up."],
  blowups: ["Most doubles or worse in a round", () => "", "Take a double or worse",
    "Holes in one round at double bogey or worse, on the gross score."],
  threeputts: ["Most three-putts in a round", () => "", "Keep putts on a card, and take three",
    "Holes in one round that took three putts or more."],
  penalties: ["Most penalty shots in a round", () => "", "Keep penalty shots on a card, and take one",
    "Penalty strokes written on the card in one round."],
  bunker: ["Most bunker shots in a round", () => "", "Keep bunker shots on a card, and play one",
    "Shots played from a bunker in one round."],
};
const HONOURS_TIP = `<p>Every record in this society this season and who holds it, with how many others matched it. Tap a record for its top ten. A grey one has not been set yet: it is there for the taking.</p>
  <p>The best number holds the record, and whoever beats it takes it over. The top ten lists the best rounds, so one player can be on it more than once. Level on it, whoever got there first keeps it; the ones who matched it are named underneath.</p>
  <p>A run at par or better is read in the order the holes were walked: from the hole a group teed off on, so a start on the tenth runs 10 to 18 and then 1 to 9, and on from the last hole of one card into the first of the player's next. A bogey or a blank hole ends it. <b>Still going</b> means the holder has not dropped a shot since.</p>
  <p>The Stableford win is the winner's Stableford points against the next member on the same card; level at the top is no margin. A bounce-back is par or better on the hole straight after a dropped shot. Eagles count an eagle or better, a hole in one on a par 4 included.</p>
  <p>The highest Elo rating is each player's peak on the society's Elo table, one line a player, and it is only on the board when the society keeps an Elo table.</p>
  <p>Fairways, greens and the putting records need those kept on the card. A green in regulation is read off the putts when it was not ticked by hand.</p>`;
const BOOBY_TIP = `<p>The prizes nobody wants, held the same way as the honours: the worst number has it, and level, whoever got there first keeps it.</p>
  <p>A last place is the bottom of the society's members on Stableford points that day, and counts on a day with three or more of them out. Fewest points is only over an eighteen walked from the first hole to the last, so a late start is never a bad day.</p>
  <p>A zero-point hole is one that scored no Stableford points, a pick-up included (golfers call it a blob), and a run without a point is read in the order walked like the run at par or better. The worst hole only counts holes holed out, so a pick-up never wins it.</p>
  <p>Three-putts, penalty shots and bunker shots need those kept on the card.</p>`;

/** When and where a line on the board was set: a round's date and course, or a run's first and last day. */
function honourWhen(e) {
  const r = e.round;
  if (!r) return e.date ? `reached ${esc(shortDate(e.date))}` : "";
  // a run that ran over from one card to the next is dated from where it began to where it got this long
  const when = e.from && e.from !== r ? `${esc(shortDate(e.from.date))} to ${esc(shortDate(r.date))}` : `${esc(shortDate(r.date))} · ${esc(whereName(r.where))}`;
  // the worst hole says which hole, and what went on the card there
  const hole = e.hole ? ` · ${esc(e.hole.score)} on hole ${esc(e.hole.label)}, a par ${esc(e.hole.par)}` : "";
  return `${when}${hole}${e.ongoing ? ` · <em class="going">still going</em>` : ""}`;
}
const honourValue = (key, e) => { const u = HONOURS[key][1](e); return `${esc(e.value)}${u ? ` <span class="u">${esc(u)}</span>` : ""}`; };

/** The society's records, with the peak on its Elo table when it keeps one: the first Elo table in its scoring order. */
function honoursOf(g, Ms, members, St = leagueStats(Ms, members)) {
  const kind = S.cleanFormats(g.formats).find(f => f in ELO_BASIS);
  return achievements(St, 10, kind ? standingsFor(g, Ms, members, kind).rows : null);
}

/** The door to the honours board at the top of the society's numbers: one line, the board has a page of its own. */
function honoursDoor(g, Ms, members, St) {
  const recs = honoursOf(g, Ms, members, St);
  const set = good => recs.filter(r => r.booby !== good && r.value !== null).length, of = good => recs.filter(r => r.booby !== good).length;
  return `<div class="list"><a href="#league/${esc(g.id)}/honours"><span class="lead">${ICONS.trophy}<div><div class="name">Honours board</div>
    <div class="muted small">${set(true) + set(false) ? `${set(true)} of ${of(true)} honours set, ${set(false)} of ${of(false)} booby prizes handed out` : "Every record still to set"}</div></div></span><span class="chev">›</span></a></div>`;
}

/**
 * The honours board in its two halves, each three records to a row: the honours first, then the booby prizes
 * under a heading of their own. A tile is the trophy, the number, what it is and who holds it; grey while open.
 */
export function honoursPage(g, Ms, members) {
  const tile = rec => {
    const [title] = HONOURS[rec.key];
    const open = rec.value === null;
    const who = open ? "Not set yet" : `${firstName(rec.name)}${rec.also.length ? ` +${rec.also.length}` : ""}`;
    return `<button class="htile${open ? " open" : ""}${rec.booby ? " booby" : ""}" data-act="honour" data-k="${rec.key}"><span class="tro">${TROPHIES[rec.key]}</span>
      <b class="num">${open ? "&#8211;" : honourValue(rec.key, rec)}</b><span class="ht">${esc(title)}</span>
      <span class="hw">${esc(who)}${rec.ongoing ? ` <em class="going">going</em>` : ""}</span></button>`;
  };
  const recs = honoursOf(g, Ms, members);
  const half = booby => `<div class="hboard">${recs.filter(r => r.booby === booby).map(tile).join("")}</div>`;
  return `${h2tip("Honours", HONOURS_TIP)}${half(false)}${h2tip("Booby prizes", BOOBY_TIP)}${half(true)}`;
}

/**
 * The top ten for one record, as a sheet, the holder first: the best rounds or the longest runs, where one
 * player can appear more than once, or one line a player for a count. Each line
 * hands back where it goes (the card it was set on, or the player) as the sheet's answer.
 */
export function honourSheet(g, Ms, members, key) {
  const gid = g.id;
  const rec = honoursOf(g, Ms, members).find(x => x.key === key);
  if (!rec) return null;
  const what = HONOURS[key][3];
  if (rec.value === null) return { title: HONOURS[key][0], lead: `${what} Nobody has set this yet: ${HONOURS[key][2].toLowerCase()}, and it is yours.`, body: "" };
  const line = (e, i) => {
    const to = e.round ? `#review/${e.round.id}` : `#league/${gid}/p/${e.pid}`;
    const when = honourWhen(e);
    return `<button class="hrow lrow honourtop" data-sheet="${esc(to)}"><span class="lp num">${i + 1}</span>
      <span class="t"><b>${esc(e.name)}</b>${when ? `<span>${when}</span>` : ""}</span><span class="v num">${honourValue(key, e)}</span></button>`;
  };
  // a round's record, a hole's and a run list the best (or worst) of them, so a player can be on it twice; a count has each player once
  const of = key === "elo" ? "Each player once, at the highest rating they have reached here"
    : key === "run" || key === "blobrun" ? "The ten longest runs"
    : key === "worsthole" ? "The ten worst holes, most over par first"
    : rec.board[0] && rec.board[0].round ? `The ten ${rec.booby ? "worst" : "best"} rounds, ${rec.lower ? "lowest" : "highest"} first`
    : "Each player once, most first";
  return { title: HONOURS[key][0],
    lead: `${what} ${of}. Level, whoever got there first is higher.`,
    body: `<div class="rows sheetrows">${rec.board.map(line).join("")}</div>` };
}

/**
 * The society's numbers for whoever is picked: everyone, nobody, or any handful taken together, every reading
 * worked out over their holes alone. `chosen` is null for everyone, otherwise a list of player ids.
 */
export function leagueStatsBody(g, Ms, members, chosen = null) {
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return `<p class="muted center" style="margin:30px 0">No finished rounds in this society yet.</p>`;
  const ids = chosen ? St.players.map(p => p.id).filter(id => chosen.includes(id)) : St.players.map(p => p.id);
  const all = ids.length === St.players.length;
  const chip = (id, label, on) => `<button class="pchip${on ? " on" : ""}" data-act="numwho" data-id="${esc(id)}" aria-pressed="${on}"><span>${esc(label)}</span></button>`;
  const picks = `<div class="chips-wrap scroll whochips">${chip("", "Everyone", all)}${[...St.players].sort((a, b) => a.name.localeCompare(b.name))
    .map(p => chip(p.id, p.name, !all && ids.includes(p.id))).join("")}</div>`;
  // the honours board is always the whole society, whoever is picked, so its door sits above the picker
  const board = honoursDoor(g, Ms, members, St);
  if (!ids.length) return `${board}${picks}<p class="muted center" style="margin:30px 0">Tap Everyone, or the players you want to see.</p>`;
  if (all) return `${board}${picks}<div class="statsbody">${fieldStats(St, ninesFieldBlock(g.id, leagueRounds(g.id)))}</div>`;
  const names = St.players.filter(p => ids.includes(p.id)).map(p => p.name);
  const who = names.length > 3 ? `these ${names.length} players` : namesList(names);
  const said = names.length > 4 ? `${names.length} players, taken together` : names.length > 1 ? `${namesList(names.map(firstName))}, taken together` : "";
  return `${board}${picks}${said ? `<p class="muted small whosaid">${said}</p>` : ""}
    <div class="statsbody">${fieldStats(leagueStats(Ms, ids), ninesFieldBlock(g.id, leagueRounds(g.id), new Set(ids)), who)}</div>`;
}

// ---------------------------------------------------------------- two players, over the days they shared
/** Who is ahead on one line: "a", "b" or nobody. `lower` where the smaller number is the better one. */
const ahead = (va, vb, lower = false) => va === null || vb === null || va === vb ? "" : (lower ? va < vb : va > vb) ? "a" : "b";

/** One bar a round, up for a round the left player took and down for one the right player took, as tall as the margin. */
function marginChart(H, fA, fB, unit) {
  const top = Math.max(1, ...H.rounds.map(r => r.margin || 0));
  const said = H.rounds.length <= 12;
  const cols = H.rounds.map(r => {
    // a round one of them never finished a card for has no margin: it goes to the other, drawn full height and pale
    const h = r.winner === "tie" ? 0 : r.margin === null ? 100 : Math.max(8, (r.margin / top) * 100);
    const val = r.margin === null ? "NR" : r.margin;
    const who = r.winner === "a" ? fA : r.winner === "b" ? fB : "";
    const title = `${fmtDate(r.date)} · ${r.where} · ${r.winner === "tie" ? "halved" : `${who} by ${r.margin === null ? "default" : plural(r.margin, unit)}`}`;
    const bar = r.winner === "tie" ? `<i class="mtie"></i>`
      : `<i class="mbar ${r.winner}${r.margin === null ? " nr" : ""}" style="height:${h * 0.4}%"></i>${said ? `<b class="mval num ${r.winner}" style="--h:${h * 0.4}%">${val}</b>` : ""}`;
    return `<a class="mcol" href="#review/${esc(r.id)}" title="${esc(title)}"><div class="mplot">${bar}</div><small>${esc(shortDate(r.date))}</small></a>`;
  }).join("");
  return `<div class="card"><div class="mkey"><span class="a"><i></i>${esc(fA)} won</span><span class="b"><i></i>${esc(fB)} won</span></div>
    <div class="mchart">${cols}</div></div>`;
}

/**
 * Everything under the scoreline on the head to head: the rounds as a chart, the two rings, the numbers side by side
 * and the records. The rings, tapes and records come from leagueStats over only the days both played, so they
 * measure the same rounds the scoreline counts.
 */
export function h2hParts(Ms, H, a, b, A_, B_, basis) {
  const fA = firstName(A_), fB = firstName(B_);
  const unit = basis === "points" ? "point" : "shot";
  const cards = leagueCards(Ms).filter(M => M.players.some(p => p.id === a) && M.players.some(p => p.id === b));
  const St = leagueStats(cards, [a, b]);
  const pa = St.players.find(p => p.id === a), pb = St.players.find(p => p.id === b);
  const chart = `${h2tip("Round by round", `One bar a round, oldest on the left. A bar up is a round ${esc(fA)} took on ${esc(basisWord(basis))}, a bar down one ${esc(fB)} took, and the taller the bar, the wider the margin. A dot on the line is a round they tied; NR is a round one of them did not finish a card for. Tap a bar for that card.`)}${marginChart(H, fA, fB, unit)}`;
  if (!pa || !pb) return { chart, holes: "", tapes: "", records: "" };

  const share = (p, k) => pct(p.counts[k], p.holes);
  const key = SCORE_BUCKETS.map((bk, k) => {
    // the first three are worth having more of, the last three less
    const w = ahead(share(pa, k), share(pb, k), k > 2);
    // mirrored: the counts sit on the outside edges, the shares next to the label
    const cell = (p, s) => {
      const n = `<b class="num${w === s ? ` win ${s}` : ""}">${p.counts[k]}</b>`, sh = `<small>${p.counts[k] ? `${share(p, k)}%` : "&mdash;"}</small>`;
      return s === "a" ? n + sh : sh + n;
    };
    return `<li class="${pa.counts[k] || pb.counts[k] ? "" : "off"}">${cell(pa, "a")}<span><i class="${bk.key}"></i>${esc(bk.label)}</span>${cell(pb, "b")}</li>`;
  }).join("");
  const each = pa.holes === pb.holes ? `${plural(pa.holes, "hole")} each` : `${esc(fA)} ${plural(pa.holes, "hole")}, ${esc(fB)} ${pb.holes}`;
  const holes = `${h2tip("How the holes went", `<p>Every hole the two of them played on the days they were both out, ${esc(fA)} on the left and ${esc(fB)} on the right. Each hole is counted by its score against par before any handicap strokes, and the figure in each ring is the share played in par or better.</p><p>In the middle, how many of each kind and their share of all holes; the better share of the two is in that player's colour.</p>`)}
    <div class="card statcard"><div class="h2rings">
      <div class="a">${donut(pa.counts, `${pct(parOrBetter(pa), pa.holes)}%`, "par or better")}<b>${esc(fA)}</b></div>
      <div class="b">${donut(pb.counts, `${pct(parOrBetter(pb), pb.holes)}%`, "par or better")}<b>${esc(fB)}</b></div></div>
      <ul class="h2key">${key}</ul>
      <p class="muted small center" style="margin:10px 0 0">${each} · a hole against par: ${esc(fA)} ${fmtSigned(pa.vspar, 2)}, ${esc(fB)} ${fmtSigned(pb.vspar, 2)}</p></div>`;

  const per = (p, ks) => pct(ks.reduce((s, k) => s + p.counts[k], 0), p.holes);
  const both = (x, y) => x && y && x.holes >= 6 && y.holes >= 6;
  const tapes = `${h2tip("Side by side", `${esc(fA)} on the left of every line, ${esc(fB)} on the right, over the ${plural(H.rounds.length, "round")} they played together. The coloured end is whoever is ahead; on strokes, doubles and blow-ups, ahead means the lower number.`)}
    <div class="card tapes">
      ${tapeRow("points a round", H.avgPtsA, H.avgPtsB, false, fix)}${tapeRow("best round", H.bestPtsA, H.bestPtsB)}
      ${basis === "net" ? tapeRow("average net", H.avgNetA, H.avgNetB, true, fix) + tapeRow("best net", H.bestNetA, H.bestNetB, true) : ""}
      ${tapeRow("average gross", H.avgGrossA, H.avgGrossB, true, fix)}${tapeRow("best gross", H.bestGrossA, H.bestGrossB, true)}
      ${tapeRow("par or better", per(pa, [0, 1, 2]), per(pb, [0, 1, 2]), false, v => `${v}%`)}
      ${H.birdiesA + H.birdiesB ? tapeRow("birdies or better", per(pa, [0, 1]), per(pb, [0, 1]), false, v => `${v}%`) : ""}
      ${tapeRow("double or worse", per(pa, [4, 5]), per(pb, [4, 5]), true, v => `${v}%`)}
      ${Object.keys(pa.byPar).map(k => both(pa.byPar[k], pb.byPar[k]) ? tapeRow(`points on par ${k}s`, pa.byPar[k].pts, pb.byPar[k].pts, false, v => fix(v, 2)) : "").join("")}
      ${both(pa.bands[0], pb.bands[0]) ? tapeRow("points on the hardest third", pa.bands[0].pts, pb.bands[0].pts, false, v => fix(v, 2)) : ""}
      ${pa.bounce === null || pb.bounce === null ? "" : tapeRow("bounce back", Math.round(pa.bounce * 100), Math.round(pb.bounce * 100), false, v => `${v}%`)}
      ${tapeRow("blow-ups a round", pa.blowups, pb.blowups, true, fix)}
      ${tapeRow("match play wins", H.matchA, H.matchB)}</div>`;

  // the longest run of rounds in a row each of them took; a halved round ends a run
  const runs = { a: 0, b: 0 };
  let run = { who: null, n: 0 };
  for (const r of H.rounds) {
    run = r.winner !== "tie" && r.winner === run.who ? { who: r.winner, n: run.n + 1 } : { who: r.winner === "tie" ? null : r.winner, n: r.winner === "tie" ? 0 : 1 };
    if (run.who) runs[run.who] = Math.max(runs[run.who], run.n);
  }
  // One row a record: the left player's figure, what the record is, the right player's figure. The better of the two
  // is in its player's colour; a side with no such record says so with a dash, so the columns never trade places.
  const cell = (side, x, w) => {
    if (!x) return `<span class="rside ${side} none">&ndash;</span>`;
    const inner = `<b class="num">${esc(x.big)}</b><i>${esc(x.sub)}</i>`;
    const cls = `rside ${side}${w === side ? " win" : ""}`;
    return x.id ? `<a class="${cls}" href="#review/${esc(x.id)}">${inner}</a>` : `<span class="${cls}">${inner}</span>`;
  };
  const row = (icon, label, x, y, w) => x || y ? `<div class="rrow">${cell("a", x, w)}<span class="rwhat">${ICONS[icon]}<span>${esc(label)}</span></span>${cell("b", y, w)}</div>` : "";
  const won = w => w && w.margin !== null ? { id: w.id, v: w.margin, big: `+${w.margin}`, sub: `${plural(w.margin, unit)} · ${shortDate(w.date)}` } : null;
  const best = p => p.bestRound ? { id: p.bestRound.id, v: p.bestRound.pts, big: p.bestRound.pts, sub: shortDate(p.bestRound.date) } : null;
  const longest = n => n ? { v: n, big: n, sub: "in a row" } : null;
  const top = (x, y) => ahead(x ? x.v : null, y ? y.v : null) || (x && !y ? "a" : y && !x ? "b" : "");
  const rw = [[won(H.widestA), won(H.widestB), "margin", "Biggest win"], [best(pa), best(pb), "star", "Best round, points"], [longest(runs.a), longest(runs.b), "streak", "Longest run of wins"]]
    .map(([x, y, icon, label]) => row(icon, label, x, y, top(x, y))).join("");
  const records = rw ? `${h2("Records", "trophy")}<div class="card recs2"><div class="rhead"><b class="a">${esc(fA)}</b><b class="b">${esc(fB)}</b></div>${rw}</div>` : "";
  return { chart, holes, tapes, records };
}

/** One player's season in this league, for their own screen. */
export function leaguePlayerBody(g, Ms, members, pid) {
  const St = leagueStats(Ms, members);
  const p = St.players.find(x => x.id === pid);
  if (!p) return "";
  return `<div class="statsbody">${playerStats(St, p, ninesPlayerBlock(leagueRounds(g.id), p.id, firstName(p.name)), g.id, leagueCards(Ms))}</div>`;
}
