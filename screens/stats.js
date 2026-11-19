// What a pile of rounds says: the field, one player, their rivals, and the nines they walked.
import * as S from "../store.js";
import { esc, plural, firstName, ordinal, fmtDate, shortDate, courseBy, h2tip as tipHead, infoBtn, safeCompute, ui, ICONS } from "../ui.js";
import { compute, computeNine, leagueStats, rivals, SCORE_BUCKETS, fmtToPar, fmtSigned, fix, strokesGained, leagueCards, statReadings, STRIP_KEYS, NO_SCORE, isTeamFormat, isMatchFormat } from "../model.js";
import { sgWords } from "./extras.js";
import { H2H_BASES, basisUnit, seasonRounds, shownSeason } from "./formats.js";
import { nineName } from "./play.js";
import { shotsBody, barRows, markKey, lead, leads } from "./shots.js";
import { trendsBody } from "./trends.js";

const BUCKET_KEY = SCORE_BUCKETS.map(b => b.key);
// every stats heading carries its picture; a heading not named here goes without
const HEAD_ICONS = { "Round by round": "chart", "Form and consistency": "rank", "Habits": "habits",
  "Par 3s, 4s and 5s": "holes", "Easy holes and hard ones": "index", "Match play": "vs", "Who scores what": "scorecard",
  "Player by player": "users", "Against the field": "vs", "Against each player": "users", "The nines walked": "loop", "Nines walked": "loop" };
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
/** Every player who keeps them, one row each, so a league can see its fairways and its greens in one place. */
function extrasTable(St) {
  const opts = { per18: true };
  const who = St.players.filter(p => p.statline && p.statline.any);
  if (!who.length) return "";
  const seen = new Map();
  for (const x of [St.field, ...who]) for (const r of statReadings(x.statline, opts)) if (!r.deep && !seen.has(r.key)) seen.set(r.key, r);
  const cols = STRIP_KEYS.map(k => seen.get(k)).filter(Boolean);
  if (!cols.length) return "";
  const by = p => Object.fromEntries(statReadings(p.statline, opts).map(r => [r.key, r]));
  const lead = cols[0];
  const rows = who.map(p => ({ id: p.id, name: p.name, by: by(p) })).sort((a, b) => {
    const x = a.by[lead.key], y = b.by[lead.key];
    if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1) || a.name.localeCompare(b.name);
    return (lead.lower ? x.value - y.value : y.value - x.value) || a.name.localeCompare(b.name);
  });
  const cell = r => r ? `<b class="num">${esc(r.big)}</b><small>${esc(r.sub)}</small>` : `<span class="muted">&ndash;</span>`;
  return `${h2tip("Player by player", `<p>Only what was written down. Every figure counts the holes that answered it and no others, so a player who started keeping putts halfway through a season is measured over the holes they kept them for, and the small number under each reading says which holes those were.</p>
      <p>A percentage waits until there are eight attempts behind it; under that it stays the fraction it is.</p>`)}
    <div class="tscroll"><table class="stand xtab nowrap"><thead><tr><th class="l">Player</th>${cols.map(c => `<th>${esc(c.short)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr><td class="l">${esc(r.name)}</td>${cols.map(c => `<td>${cell(r.by[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

const holeRow = (label, x) => x && x.holes ? { label, v: x.pts, big: fix(x.pts, 2),
  sub: `${fmtSigned(x.vspar, 2)} a hole · ${plural(x.holes, "hole")}` } : null;
const parTableTip = who => `<p>How ${who} plays each kind of hole. Each bar is the Stableford points a hole of that kind is worth on average; under it, how far the average score is over or under par, and how many have been played.</p>
  <p>The mark is net par: two points, a hole played exactly to the handicap. A bar past it is drawn green.</p>`;
// two points is a hole played to the handicap, so every bar on these cards is read against it
const NET_PAR_KEY = markKey("net par");
/** Par 3s, 4s and 5s, then the card split into thirds by stroke index: points a hole, as bars. */
function holeKinds(x, who) {
  const pars = Object.keys(x.byPar).sort().map(k => holeRow(`Par ${k}s`, x.byPar[k])).filter(Boolean);
  const bands = x.bands.map((b, i) => holeRow(BANDS[i], b)).filter(Boolean);
  return `${h2tip("Par 3s, 4s and 5s", parTableTip(who))}
    <div class="card">${leads([lead(fix(x.pts, 2), "points a hole", "every hole")])}
      <div class="sgap"></div>${barRows(pars, { top: 3, mark: 2 })}${NET_PAR_KEY}</div>
    ${bands.length ? `${h2tip("Easy holes and hard ones", BANDS_TIP)}<div class="card">${barRows(bands, { top: 3, mark: 2 })}${NET_PAR_KEY}</div>` : ""}`;
}
const BANDS_TIP = `<p>Every scorecard gives each hole a stroke index, the number that ranks the holes from hardest (1) to easiest. Sorted by it, a card falls into three bands: the hardest third, the middle third and the easiest third.</p>
  <p>The hardest holes are also where handicap strokes are given, which is why they often pay the most Stableford points even though they are played worst against par.</p>`;
const BANDS = ["Hardest third", "Middle third", "Easiest third"];

/**
 * Who is moving and who is steady. Every figure here needs more than one round behind it, so the table only
 * appears once somebody has played a second one, and a player with a single round sits out of it rather than
 * being given a spread of nought.
 */
function formTable(St) {
  const rows = St.players.filter(p => p.played > 1);
  if (rows.length < 1) return "";
  const mixed = mixedLengths(St.rounds);
  const v = p => mixed ? p.per18 : { avg: p.avgPts, spread: p.consistency, form: p.form, trend: p.trend };
  const played = p => !mixed || !p.nines ? p.played : `${p.played}<small class="tsub">${p.nines === p.played ? "all nines" : plural(p.nines, "nine")}</small>`;
  return `${h2tip("Form and consistency", `<p><b>Avg</b> is points ${mixed ? "per 18 holes" : "a round"} across the season. <b>Spread</b> is how far a typical round sits either side of that average, so a small number is a player you can predict.</p>
      <p><b>Last 3</b> is the average of their last three rounds, which is form rather than record, and <b>trend</b> compares the first half of their rounds with the second half: plus means the second half was better.</p>
      ${mixed ? `<p>This society plays both nines and eighteens, so every round is put on an eighteen-hole footing first: a nine counts double. 36 is an eighteen played to the handicap.</p>` : ""}`)}
    <div class="tscroll"><table class="stand nowrap"><thead><tr><th class="l">Player</th><th>Rounds</th><th>${mixed ? "Avg /18" : "Avg"}</th><th>Spread</th><th>Last 3</th><th>Trend</th></tr></thead>
      <tbody>${rows.map(p => { const x = v(p); return `<tr><td class="l">${esc(p.name)}</td><td>${played(p)}</td><td class="acc">${fix(x.avg)}</td>
        <td>${x.spread === null ? "&ndash;" : fix(x.spread)}</td><td>${x.form === null ? "&ndash;" : fix(x.form)}</td>
        <td>${x.trend === null ? "&ndash;" : fmtSigned(x.trend)}</td></tr>`; }).join("")}</tbody></table></div>
    ${mixed ? `<p class="muted small" style="margin:6px 4px 0">Points per 18 holes. A nine counts double.</p>` : ""}`;
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
    ${F.statline.any ? `${shotsBody(F.statline, [], null, "")}${extrasTable(St)}` : ""}
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
  const vsField = !society ? "" : `${h2tip("Against the field", `${esc(first)} on the left of every line, everyone else in this society on the right, over the ${plural(p.played, "round")} they played together. The green end is whoever is ahead; on strokes against par and on bad holes, ahead means the lower number.${mixed ? " This society mixes nine- and eighteen-hole rounds, so read the figures given a hole at a time rather than a round at a time." : ""}`)}
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
    ${vsField}` : ""}
    ${want("core") && p.match ? `${h2tip("Match play", MATCH_TIP)}<div class="card">
      ${line("Matches", `${p.match.won} won, ${p.match.halved} halved, ${p.match.lost} lost`)}
      ${line("Holes", `${p.match.holesWon} won, ${p.match.holesHalved} halved, ${p.match.holesLost} lost`)}</div>` : ""}
    ${want("rivals") ? rivalsBlock(St, p, gid, cards) : ""}
    ${want("sg") ? shotsBody(p.statline, cards, p.id, society ? "the rest of this society" : "everyone you played with") : ""}
    ${want("core") ? holeKinds(p, who) : ""}
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
export const myGameBody = topic => gameBody(myGame(), topic);

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
  if (!rs.length && !rivals(St.rounds, p.id).length) return "";
  const me = esc(firstName(p.name));
  const seen = {};
  for (const n of [p.name, ...rs.map(r => r.name)]) seen[firstName(n)] = (seen[firstName(n)] || 0) + 1;
  const nameOf = r => esc(seen[firstName(r.name)] > 1 ? r.name : firstName(r.name));
  const deep = rs.filter(r => r.played > 1), thin = rs.filter(r => r.played === 1);
  const shown = deep.slice(0, 5), rest = deep.slice(5);
  const mixed = mixedLengths(St.rounds.filter(x => x.pid === p.id));
  return `${h2tip("Against each player", `<p>Only the rounds the two of them played together, so neither is measured on a day the other one missed.${mixed ? " A nine and an eighteen are compared a hole at a time." : ""}</p>
      <p>The line at the top of each card is their two averages against each other. The two boxes under it split the other player's own days: both are ${me}'s own figure, on the left over the rounds where that player played better than their own average, on the right over the rounds where they did not.</p>
      <p>A handful of rounds cannot settle anything, so read these as talking points rather than facts.</p>`)}
    ${basisPicker("rivalbasis", basis)}
    ${rs.length ? "" : `<p class="muted small" style="margin:14px 4px">${me} has no round against anybody where both of them finished a full card, so there is nothing to compare on ${esc(basisUnit(basis))}.</p>`}
    ${shown.map(r => rivalCard(r, me, nameOf(r))).join("")}
    ${rest.length ? `<details class="card"><summary class="small">${plural(rest.length, "more player")}</summary>${rest.map(r => rivalCard(r, me, nameOf(r))).join("")}</details>` : ""}
    ${thin.length ? `<p class="muted small" style="margin:16px 4px 6px">Met once so far, in ${esc(basisUnit(basis))} a ${thin[0].scale ? "round" : "hole"}</p>${rivalRows(thin, me, nameOf)}` : ""}`;
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
    <div class="chips-wrap">${nines.map(x => `<button class="pchip ${x.slug === pick ? "on" : ""}" data-act="ninetab" data-slug="${esc(x.slug)}">${esc(nineName(x.slug))}<small>${plural(x.played, "card")}</small></button>`).join("")}</div>
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
  if (!ids.length) return `${picks}<p class="muted center" style="margin:30px 0">Tap Everyone, or the players you want to see.</p>`;
  if (all) return `${picks}<div class="statsbody">${fieldStats(St, ninesFieldBlock(g.id, leagueRounds(g.id)))}</div>`;
  const names = St.players.filter(p => ids.includes(p.id)).map(p => p.name);
  const who = names.length > 3 ? `these ${names.length} players` : namesList(names);
  const said = names.length > 4 ? `${names.length} players, taken together` : names.length > 1 ? `${namesList(names.map(firstName))}, taken together` : "";
  return `${picks}${said ? `<p class="muted small whosaid">${said}</p>` : ""}
    <div class="statsbody">${fieldStats(leagueStats(Ms, ids), ninesFieldBlock(g.id, leagueRounds(g.id), new Set(ids)), who)}</div>`;
}

/** One player's season in this league, for their own screen. */
export function leaguePlayerBody(g, Ms, members, pid) {
  const St = leagueStats(Ms, members);
  const p = St.players.find(x => x.id === pid);
  if (!p) return "";
  return `<div class="statsbody">${playerStats(St, p, ninesPlayerBlock(leagueRounds(g.id), p.id, firstName(p.name)), g.id, leagueCards(Ms))}</div>`;
}
