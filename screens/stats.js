// What a pile of rounds says: the field, one player, their rivals, and the nines they walked.
import * as S from "../store.js";
import { esc, plural, firstName, ordinal, fmtDate, shortDate, courseBy, h2tip, subtabs, safeCompute, ui } from "../ui.js";
import { compute, computeNine, leagueStats, leagueProgress, rivals, SCORE_BUCKETS, fmtToPar, fmtSigned, fix, strokesGained, leagueCards, statReadings, statPairs, STRIP_KEYS, NO_SCORE } from "../model.js";
import { statBlock, statTiles, sgBlock, sgWords, SG_TIP, STATS_TIP } from "./extras.js";
import { H2H_BASES, basisUnit, leagueResults } from "./formats.js";
import { nineName } from "./play.js";

const BUCKET_KEY = SCORE_BUCKETS.map(b => b.key);
export const pct = (v, t) => t ? Math.round((v / t) * 100) : 0;
const sumc = cs => cs.reduce((a, b) => a + b, 0);
export const parOrBetter = x => x.counts[0] + x.counts[1] + x.counts[2];
const whereName = w => String(w || "").replace(/, 9 holes$/, "");
export const basisPicker = (act, chosen) => `<p class="pickline">Compare them on</p>
  ${subtabs(H2H_BASES.map(([k, label]) => `<button data-act="${act}" data-b="${k}" class="${k === chosen ? "on" : ""}">${label}</button>`).join(""), true)}`;

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
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Scoring distribution, given as numbers beside it">
    <g transform="rotate(-90 70 70)">${total ? arcs : `<circle class="dseg par" cx="70" cy="70" r="${R}" stroke-width="${W}"></circle>`}</g>
    <text class="dbig" x="70" y="70">${esc(big)}</text><text class="dsmall" x="70" y="89">${esc(small)}</text></svg>`;
}
function donutKey(counts, per = 0, unit = "round") {
  const total = sumc(counts);
  return `<ul class="dkey">${SCORE_BUCKETS.map((b, k) => `<li class="${counts[k] ? "" : "off"}"><i class="${b.key}"></i><span>${b.label}</span><b class="num">${counts[k]}</b>
    <small>${counts[k] ? `${pct(counts[k], total)}%${per ? ` · ${fix(counts[k] / per)} a ${unit}` : ""}` : "&mdash;"}</small></li>`).join("")}</ul>`;
}
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

function formChart(rs, who) {
  const mixed = mixedLengths(rs), any = rs.some(r => r.fieldPts !== null);
  const val = r => mixed ? r.pts / r.n : r.pts;
  const fld = r => r.fieldPts === null ? null : (mixed ? r.fieldPts / r.n : r.fieldPts);
  const top = Math.max(...rs.map(r => Math.max(val(r), fld(r) || 0)), 0.01);
  const cols = rs.map(r => {
    const h = (val(r) / top) * 88, f = fld(r) === null ? null : (fld(r) / top) * 88;
    const title = `${fmtDate(r.date)} · ${r.where}${r.loop ? ` · ${whereName(r.loop)}` : ""} · ${r.pts} points over ${plural(r.n, "hole")}${r.fieldPts === null ? "" : `, the rest of the field ${fix(r.fieldPts)}`}`;
    return `<a class="fcol" href="#review/${r.id}" title="${esc(title)}"><div class="fplot">${rs.length <= 10 ? `<b class="fval num" style="bottom:calc(${h}% + 2px)">${mixed ? fix(val(r), 2) : r.pts}</b>` : ""}
        ${f === null ? "" : `<i class="fghost" style="height:${f}%"></i>`}<i class="fbar" style="height:${h}%"></i></div><small>${esc(shortDate(r.date))}</small></a>`;
  }).join("");
  return `<div class="card"><div class="fchart">${cols}</div>
    <p class="muted small center" style="margin:8px 0 0">${esc(who)}'s points ${mixed ? "a hole" : "in each round"}, oldest first.${any ? " Grey is what the rest of the field scored that day." : ""} Tap a round for its card.</p></div>`;
}

// ---------------------------------------------------------------- the season, left to right
const SEASON_TIP = `<p>Every card this league has played, oldest on the left, and what each player scored on it. This is the only chart here with a direction: an average over a whole season cannot say whether the league is getting better or simply getting older.</p>
  <p><b>Each card</b> is the day as it happened, spikes and all. <b>Running average</b> is everyone's average up to and including that day, so a line only moves when the player does and one freak round stops looking like a turning point.</p>
  <p>The dashed line is the whole field. A player who missed a card has no point on it and their line carries straight over the gap, because the alternative is a score they never made. Tap a name to follow one player; where the league mixes nines and eighteens the chart counts points a hole.</p>`;

/**
 * The league over time: one line a player, one column a card. On a phone there is no room for nine colours
 * and a key to go with them, so one line is picked out and the rest are the context behind it -- which is
 * also the question being asked, "where am I in this", rather than "what colour is everybody".
 */
function seasonChart(St, gid, meId) {
  const mode = ui.seasonMode[gid] === "running" ? "running" : "each";
  const P = leagueProgress(St.rounds, { mode });
  if (P.cards.length < 2 || !P.players.length) return "";
  // Grey lines and nothing picked out is a chart nobody can read, so one is always followed until the reader
  // says otherwise: their own, or the player at the top of the league where they are not in it.
  const fallback = P.players.some(p => p.id === meId) ? meId : ((St.players[0] || {}).id || "");
  const pick = P.players.some(p => p.id === ui.seasonWho[gid]) ? ui.seasonWho[gid]
    : ui.seasonWho[gid] === "" ? "" : fallback;
  const n = P.cards.length;
  const vals = [...P.players.flatMap(p => p.points), ...P.field].filter(v => v !== null);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
  const W = 340, H = 168, padL = 5, padR = 5, padT = 10, padB = 22;
  const X = i => padL + (i / (n - 1)) * (W - padL - padR);
  const Y = v => padT + (1 - (v - lo) / span) * (H - padT - padB);
  const seen = xs => xs.map((v, k) => [k, v]).filter(([, v]) => v !== null);
  const poly = pts => pts.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const unit = P.perHole ? "points a hole" : "points a round";
  const fmtv = v => P.perHole ? fix(v, 2) : fix(v);
  // a date under every column where they fit, the ends and a few between where they do not
  const everyN = Math.ceil(n / 6);
  const dates = P.cards.map((c, i) => (i % everyN === 0 || i === n - 1)
    ? `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(shortDate(c.date))}</text>` : "").join("");
  const lines = P.players.map(p => {
    const pts = seen(p.points), on = p.id === pick;
    // One card so far is a point, not a line, and a polyline of one point draws nothing at all
    const only = pts.length === 1
      ? `<circle class="sline${on ? " on" : ""} sonly" cx="${X(pts[0][0]).toFixed(1)}" cy="${Y(pts[0][1]).toFixed(1)}" r="3"></circle>` : "";
    return `<polyline class="sline${on ? " on" : ""}" points="${poly(pts)}"><title>${esc(p.name)}</title></polyline>${only}${
      on ? pts.map(([i, v]) => `<circle class="sdot" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3"><title>${esc(p.name)} · ${esc(shortDate(P.cards[i].date))} · ${fmtv(v)}</title></circle>`).join("") : ""}`;
  });
  // the picked line drawn last, so it is over the others rather than under them
  const order = P.players.map((p, i) => i).sort((a, b) => (P.players[a].id === pick ? 1 : 0) - (P.players[b].id === pick ? 1 : 0));
  const chosen = P.players.find(p => p.id === pick);
  const chip = (id, label) => `<button class="pchip ${id === pick ? "on" : ""}" data-act="seasonwho" data-id="${esc(id)}">${esc(label)}</button>`;
  return `${h2tip("The season, card by card", SEASON_TIP)}
    ${subtabs([["each", "Each card"], ["running", "Running average"]].map(([k, l]) =>
      `<button data-act="seasonmode" data-m="${k}" class="${k === mode ? "on" : ""}">${l}</button>`).join(""), true)}
    <div class="card">
      <svg class="season" viewBox="0 0 ${W} ${H}" role="img" aria-label="Every card this league has played, oldest on the left, one line a player and the whole field dashed behind them">
        ${P.cards.map((c, i) => `<line class="sgrid" x1="${X(i).toFixed(1)}" y1="${padT}" x2="${X(i).toFixed(1)}" y2="${H - padB}"></line>`).join("")}
        <polyline class="sfield" points="${poly(seen(P.field))}"><title>The whole field</title></polyline>
        ${order.map(i => lines[i]).join("")}
        ${dates}
      </svg>
      <p class="muted small" style="margin:8px 0 0">${chosen ? `<b>${esc(chosen.name)}</b> picked out of` : "One line a player,"} ${plural(P.players.length, "player")}, the field dashed behind them, in ${esc(unit)}${mode === "running" ? " averaged from the first card up to each one" : ""}. ${plural(n, "card")}, ${esc(shortDate(P.cards[0].date))} to ${esc(shortDate(P.cards[n - 1].date))}.</p>
    </div>
    <div class="chips-wrap scroll" style="margin-top:8px">${chip("", "Nobody")}${P.players.map(p => chip(p.id, p.name)).join("")}</div>`;
}

// ---------------------------------------------------------------- putts, fairways and the rest, on screen
/** One player's extras set against the rest of the league, or on their own where nobody else keeps them. */
function extrasCompare(p, first) {
  const x = p.statline;
  if (!x || !x.any) return "";
  const opts = { per18: true };
  const pairs = statPairs(x, p.rest && p.rest.statline, opts).filter(r => !r.deep);
  const intro = `${esc(first)} over ${plural(x.holes, "hole")} in this league.`;
  if (!pairs.length) return statBlock(x, `${intro} Nobody else here has kept the same readings, so there is nothing to set them against.`, opts);
  const deep = statTiles(x, { ...opts, deep: true });
  return `<div class="card tapes mine">${pairs.map(r => tapeRow(r.title.toLowerCase(), r.value, r.theirs, r.lower, r.fmt)).join("")}</div>
    <p class="muted small" style="margin:6px 4px 0">${esc(first)} on the left, everyone else in this league on the right. Each reading counts only the holes that answered it on both sides, which is fewer holes than the rest of this page counts.</p>
    ${deep ? `<details class="card morestats"><summary class="small">More of the same, for fun</summary>${deep}</details>` : ""}`;
}

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

function parRow(label, x) {
  if (!x || !x.holes) return "";
  return `<tr><td class="l">${label}</td><td>${x.holes}</td><td>${fix(x.avg, 2)}</td><td>${fmtSigned(x.vspar, 2)}</td><td class="acc">${fix(x.pts, 2)}</td><td>${pct(x.counts[0] + x.counts[1], x.holes)}%</td></tr>`;
}
const parTableTip = who => `<p>How ${who} plays each kind of hole.</p>
  <p><b>Played</b> is how many holes of that kind have been walked, <b>Avg</b> the average score on one, <b>Vs par</b> how far that average is over or under par, <b>Pts</b> the Stableford points a hole, and <b>Birdie+</b> how often the hole was birdied or better.</p>`;
const BANDS_TIP = `<p>Every scorecard gives each hole a stroke index, the number that ranks the holes from hardest (1) to easiest. Sorted by it, a card falls into three bands: the hardest third, the middle third and the easiest third.</p>
  <p>The hardest holes are also where handicap strokes are given, which is why they often pay the most Stableford points even though they are played worst against par.</p>`;
const PAR_TABLE_HEAD = `<thead><tr><th class="l">Holes</th><th>Played</th><th>Avg</th><th>Vs par</th><th>Pts</th><th>Birdie+</th></tr></thead>`;
const PAR_TABLE = `<table class="stand partab">`;
const parRows = x => Object.keys(x.byPar).sort().map(k => parRow(`Par ${k}`, x.byPar[k])).join("");
const everyHoleRow = x => `<tr class="tot"><td class="l">Every hole</td><td>${x.holes}</td><td>${fix(x.avg, 2)}</td><td>${fmtSigned(x.vspar, 2)}</td><td class="acc">${fix(x.pts, 2)}</td><td>${pct(x.counts[0] + x.counts[1], x.holes)}%</td></tr>`;
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
  return `${h2tip("Form and consistency", `<p><b>Avg</b> is points a round across the season. <b>Spread</b> is how far a typical round sits either side of that average, so a small number is a player you can predict.</p>
      <p><b>Last 3</b> is the average of their last three rounds, which is form rather than record, and <b>trend</b> compares the first half of their rounds with the second half: plus means the second half was better.</p>
      ${mixed ? `<p>This league mixes nine- and eighteen-hole rounds, so read these as points a card rather than points a round.</p>` : ""}`)}
    <div class="tscroll"><table class="stand nowrap"><thead><tr><th class="l">Player</th><th>Rounds</th><th>Avg</th><th>Spread</th><th>Last 3</th><th>Trend</th></tr></thead>
      <tbody>${rows.map(p => `<tr><td class="l">${esc(p.name)}</td><td>${p.played}</td><td class="acc">${fix(p.avgPts)}</td>
        <td>${p.consistency === null ? "&ndash;" : fix(p.consistency)}</td><td>${p.form === null ? "&ndash;" : fix(p.form)}</td>
        <td>${p.trend === null ? "&ndash;" : fmtSigned(p.trend)}</td></tr>`).join("")}</tbody></table></div>`;
}

function fieldStats(St, nines = "", gid = "", meId = null) {
  const F = St.field;
  const rec = (label, r, value) => r ? `<a class="kv" href="#review/${r.id}"><span>${label}</span><span class="muted">${esc(firstName(r.player))} · ${value} · ${esc(shortDate(r.date))}</span></a>` : "";
  const dist = [...St.players].sort((a, b) => pct(parOrBetter(b), b.holes) - pct(parOrBetter(a), a.holes) || a.name.localeCompare(b.name))
    .map(p => `<div class="drow"><div class="dname">${esc(p.name)}<small class="muted">${pct(parOrBetter(p), p.holes)}% par or better</small></div>${distBar(p.counts)}</div>`).join("");
  return `
    <div class="card statcard"><div class="dwrap">${donut(F.counts, `${pct(parOrBetter(F), F.holes)}%`, "par or better")}${donutKey(F.counts, F.rounds, "round")}</div>
      <p class="muted small" style="margin:10px 0 0">Every hole this league has played: ${plural(F.holes, "hole")} over ${plural(F.rounds, "round")} on ${plural(F.cards, "card")}. A round is worth ${fix(F.avgPts)} points, and a hole is played in ${fmtSigned(F.vspar, 2)} against par.</p></div>
    ${seasonChart(St, gid, meId)}
    ${formTable(St)}
    ${F.statline.any ? `${h2tip("Putts, fairways and the rest", STATS_TIP)}${statBlock(F.statline, `Everyone who keeps them, over ${plural(F.statline.holes, "hole")}.`, { per18: true })}${extrasTable(St)}` : ""}
    ${h2tip("Par 3s, 4s and 5s", parTableTip("everyone in this league together"))}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${parRows(F)}${everyHoleRow(F)}</tbody></table>
    ${h2tip("Easy holes and hard ones", BANDS_TIP)}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${F.bands.map((b, i) => parRow(BANDS[i], b)).join("")}</tbody></table>
    ${nines}
    ${h2tip("Who scores what", `One bar a player: every hole they have played in this league, best scores on the left and worst on the right. The longer the left end, the more often they are at par or better.`)}
    <div class="card dists">${inlineKey()}${dist}</div>
    <h2>Records</h2>
    <div class="card">
      ${rec("Best round", F.bestRound, `${F.bestRound ? F.bestRound.pts : ""} pts`)}
      ${rec("Best against par", F.lowRound, F.lowRound ? `${F.lowRound.gross} (${fmtToPar(F.lowRound.topar)})` : "")}
      ${rec("Most birdies", F.mostBirdies && F.mostBirdies.birdies > 1 ? F.mostBirdies : null, F.mostBirdies ? plural(F.mostBirdies.birdies, "birdie") : "")}
      ${F.bounce === null ? "" : `<div class="kv"><span>Bounce back</span><span class="muted">${Math.round(F.bounce * 100)}% of the holes after a bogey or worse were played in par or better</span></div>`}
    </div>`;
}

function playerStats(St, p, nines = "", gid = "") {
  const R = p.rest, one = p.played === 1, first = firstName(p.name);
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const rec = (label, r, value) => r ? `<a class="kv" href="#review/${r.id}"><span>${label}</span><span class="muted">${value} · ${esc(whereName(r.where))} · ${esc(shortDate(r.date))}</span></a>` : "";
  const line = (label, value) => `<div class="kv"><span>${label}</span><span class="muted">${value}</span></div>`;
  const per = k => p.played ? p.counts[k] / p.played : 0;
  const birdies = p.counts[0] + p.counts[1];
  const enough = (a, b) => a && b && a.holes >= 6 && b.holes >= 6;
  const vsField = !R.holes ? `<p class="muted small" style="margin:0 4px">${esc(first)} has not yet shared a round in this league with anyone else, so there is nothing to measure against.</p>` : `
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
        : `${esc(first)} beat them in ${p.beat} of those ${p.beatOf} rounds, ${p.vsField >= 0 ? `${fix(p.vsField)} points up overall` : `${fix(-p.vsField)} points behind overall`}.`)}</p>`;
  return `
    <div class="mecard"><div class="stats">${tile(p.played, plural(p.played, "round").split(" ")[1])}${tile(fix(p.avgPts), "avg pts")}${one ? "" : tile(p.bestPts, "best")}${p.returns ? tile(fmtToPar(Math.round(p.avgTopar)), "avg to par") : ""}${p.wins ? tile(p.wins, plural(p.wins, "win").split(" ")[1]) : ""}</div></div>
    <div class="card statcard"><div class="dwrap">${donut(p.counts, `${pct(parOrBetter(p), p.holes)}%`, "par or better")}${donutKey(p.counts, p.played, "round")}</div>
      <p class="muted small" style="margin:10px 0 0">${plural(p.holes, "hole")} in this league. ${esc(first)} ${birdies ? `makes ${fix(birdies / p.played)} birdies or better` : "has yet to make a birdie"} and ${fix(per(2))} pars a round, and plays a hole in ${fmtSigned(p.vspar, 2)} against par.</p></div>
    ${h2tip("Against the field", `${esc(first)} on the left of every line, everyone else in this league on the right, over the ${plural(p.played, "round")} they played together. The green end is whoever is ahead; on strokes against par and on bad holes, ahead means the lower number.${mixedLengths(p.rounds) ? " This league mixes nine- and eighteen-hole rounds, so read the figures given a hole at a time rather than a round at a time." : ""}`)}
    ${vsField}
    ${rivalsBlock(St, p, gid)}
    ${one ? "" : `${h2tip("Round by round", `One bar a round, oldest on the left. The grey column behind a bar is what everyone else in the league scored that day. Tap a bar for that card.`)}${formChart(p.rounds, first)}`}
    ${one ? `<p class="muted small" style="margin:14px 4px">Form and consistency appear once ${esc(first)} has played a second round here.</p>` : `${h2tip("Over more than one round", `<p><b>Consistency</b> is how far a typical round sits either side of their average. <b>Form</b> is the last three rounds against every round. <b>Trend</b> compares the first half of their rounds with the second half. <b>Streak</b> counts the latest rounds in a row where they beat the rest of the field.</p>
      <p><b>Finishing</b> splits a round in two and gives the points a hole in each half. <b>Bounce back</b> is how often the hole straight after a bogey or worse was played in par or better. <b>Blow-ups</b> counts doubles or worse in a round.</p>`)}<div class="card">
      ${line("Consistency", `${fix(p.consistency)} points either side of their average${mixedLengths(p.rounds) ? ", though this league mixes round lengths" : ""}`)}
      ${p.form === null ? "" : line("Form", `${fix(p.form)} points over the last three, against ${fix(p.avgPts)} across every round`)}
      ${p.trend === null ? "" : line("Trend", `${fmtSigned(p.trend)} points from the first half of their rounds to the second`)}
      ${p.streak ? line("Streak", `above the rest of the field in the last ${plural(p.streak, "round")}`) : ""}
      ${line("Finishing", `${fix(p.firstHalf, 2)} points a hole in the first half of a round, ${fix(p.lastHalf, 2)} in the second`)}
      ${p.bounce === null ? "" : line("Bounce back", `${Math.round(p.bounce * 100)}% of the ${p.bounceOf} holes after a bogey or worse were played in par or better`)}
      ${line("Blow-ups", `${fix(p.blowups)} doubles or worse a round`)}
      ${line("Where they finish", `${ordinal(Math.round(p.avgPlace))} on average in this league${p.podiums ? `; ${p.podiums} of their ${plural(p.played, "round")} were in the top three` : ""}`)}
      ${p.penalties ? line("Penalty strokes", String(p.penalties)) : ""}
      ${p.counted10 ? line(`Holes counted ${NO_SCORE}`, String(p.counted10)) : ""}
    </div>`}
    ${sgLeague(gid, p.id)}
    ${p.statline.any ? `${h2tip("Putts, fairways and the rest", STATS_TIP)}${extrasCompare(p, first)}` : ""}
    ${h2tip("Par 3s, 4s and 5s", parTableTip(esc(first)))}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${parRows(p)}${everyHoleRow(p)}</tbody></table>
    ${h2tip("Easy holes and hard ones", BANDS_TIP)}
    ${PAR_TABLE}${PAR_TABLE_HEAD}<tbody>${p.bands.map((b, i) => parRow(BANDS[i], b)).join("")}</tbody></table>
    ${nines}
    <h2>${esc(first)} in this league</h2>
    <div class="card">
      ${rec("Best round", p.bestRound, p.bestRound ? `${p.bestRound.pts} pts` : "")}
      ${rec("Best against par", p.lowRound, p.lowRound ? `${p.lowRound.gross} (${fmtToPar(p.lowRound.topar)})` : "")}
      ${rec("Most birdies", p.mostBirdies && p.mostBirdies.birdies > 1 ? p.mostBirdies : null, p.mostBirdies ? plural(p.mostBirdies.birdies, "birdie") : "")}
      ${one ? "" : line("Best and worst", `${p.bestPts} points at best, ${p.worstPts} at worst`)}
    </div>`;
}

function sgLeague(gid, pid) {
  const g = S.leagues().find(x => x.id === gid);
  if (!g) return "";
  const sg = strokesGained(leagueCards(leagueResults(g).Ms), pid);
  if (sg.total === null || !sg.holes) return "";
  return `${h2tip("Strokes gained", SG_TIP)}${sgBlock(sg, "the rest of this league")}`;
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
      <p class="muted small" style="margin:10px 0 0">Both numbers are ${me}'s ${unit}: on the left the ${plural(r.goodN, "round")} where ${them} played better than their own average of ${val(r.theirAvg)}, on the right the ${r.badN} where they did not. ${verdict}</p>`;
  return `<div class="card rival"><div class="rhead"><b>${esc(r.name)}</b><span class="muted small">${plural(r.played, "round")} together · ${rivalRecord(r, me, them)}</span></div>
    <div class="tapes mine">${tapeRow(unit, r.myAvg, r.theirAvg, r.lower, val)}</div>
    ${r.sg && r.sg.total !== null ? `<div class="sgline">${sgWords(r.sg, them)}</div>` : ""}${split}</div>`;
}
function rivalRows(rs, me, nameOf) {
  return `<div class="card rivalrows">${rs.map(r => { const val = v => r.scale ? fix(v * r.scale) : fix(v, 2);
    return `<div class="kv"><span>${esc(r.name)}</span><span class="muted">${val(r.myAvg)} to ${val(r.theirAvg)} · ${rivalRecord(r, me, nameOf(r))}</span></div>`; }).join("")}</div>`;
}
function rivalsBlock(St, p, gid) {
  const basis = H2H_BASES.some(([k]) => k === ui.rivalBasis[gid]) ? ui.rivalBasis[gid] : "points";
  const rs = rivals(St.rounds, p.id, basis);
  const g = S.leagues().find(x => x.id === gid);
  const cards = g ? leagueCards(leagueResults(g).Ms) : [];
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
      <p>The line at the top of each card is their two averages against each other. The two boxes under it split the other player's own days: what ${me} scored on the rounds where that player played better than their own average, and on the rounds where they did not.</p>
      <p>A handful of rounds cannot settle anything, so read these as talking points rather than facts.</p>`)}
    ${basisPicker("rivalbasis", basis)}
    ${rs.length ? "" : `<p class="muted small" style="margin:14px 4px">${me} has no round against anybody where both of them finished a full card, so there is nothing to compare on ${esc(basisUnit(basis))}.</p>`}
    ${shown.map(r => rivalCard(r, me, nameOf(r))).join("")}
    ${rest.length ? `<details class="card"><summary class="small">${plural(rest.length, "more player")}</summary>${rest.map(r => rivalCard(r, me, nameOf(r))).join("")}</details>` : ""}
    ${thin.length ? `<p class="muted small" style="margin:16px 4px 6px">Met once so far, in ${esc(basisUnit(basis))} a ${thin[0].scale ? "round" : "hole"}</p>${rivalRows(thin, me, nameOf)}` : ""}`;
}

// ---------------------------------------------------------------- nines walked
export function ninesPlayed(rounds, pid = null) {
  const out = new Map();
  for (const r of rounds) {
    if (r.status !== "done") continue;
    const c = courseBy(r.course);
    const nines = (c && c.nines) || [];
    if (!nines.length || c.n !== nines.length * 9) continue;
    nines.forEach((slug, i) => {
      const nc = courseBy(slug);
      if (!nc) return;
      let N;
      try { N = computeNine(nc, S.toModelRound(r), i * 9); } catch (e) { return; }
      for (const p of N.players) {
        if (pid && p.id !== pid) continue;
        if (!out.has(slug)) out.set(slug, { slug, rows: [] });
        out.get(slug).rows.push({ round: r, player: p, field: N.field });
      }
    });
  }
  return [...out.values()].map(x => {
    const gs = x.rows.map(r => r.player.gross).filter(g => g !== null), pts = x.rows.map(r => r.player.pts);
    return { ...x, played: x.rows.length, bestGross: gs.length ? Math.min(...gs) : null, avgGross: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null,
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
  const ids = new Set(S.leagueRoundIds(gid));
  return S.rounds().filter(r => ids.has(r.id) && r.status === "done").sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function ninesFieldBlock(gid, rounds, me) {
  const nines = ninesPlayed(rounds);
  if (!nines.length) return "";
  const pick = nines.some(x => x.slug === ui.nineTab[gid]) ? ui.nineTab[gid] : nines[0].slug;
  const rows = new Map();
  for (const row of nines.find(x => x.slug === pick).rows) {
    const id = row.player.id;
    if (!id) continue;
    if (!rows.has(id)) rows.set(id, { id, name: row.player.name, gs: [], pts: [] });
    const e = rows.get(id);
    if (row.player.gross !== null) e.gs.push(row.player.gross);
    e.pts.push(row.player.pts);
  }
  const table = [...rows.values()].map(e => ({ ...e, played: e.pts.length, avgPts: e.pts.reduce((a, b) => a + b, 0) / e.pts.length, bestGross: e.gs.length ? Math.min(...e.gs) : null, avgGross: e.gs.length ? e.gs.reduce((a, b) => a + b, 0) / e.gs.length : null }))
    .sort((a, b) => b.avgPts - a.avgPts || (a.avgGross ?? 99) - (b.avgGross ?? 99) || a.name.localeCompare(b.name));
  return `${h2tip("The nines walked", `This club's loops are rated on their own, so every nine is scored on its own stroke index and course rating, whether it was walked alone or as half of an 18. Pick a loop; the table ranks the players on it by average points.`)}
    <div class="chips-wrap">${nines.map(x => `<button class="pchip ${x.slug === pick ? "on" : ""}" data-act="ninetab" data-slug="${esc(x.slug)}">${esc(nineName(x.slug))}<small>${plural(x.played, "card")}</small></button>`).join("")}</div>
    <table class="stand" style="margin-top:12px"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Walked</th><th>Best</th><th>Avg gross</th><th>Avg pts</th></tr></thead>
      <tbody>${table.map((e, i) => `<tr class="${me && e.id === me.id ? "acc" : ""}"><td class="pos">${i + 1}</td><td class="l">${esc(e.name)}</td><td>${e.played}</td><td>${e.bestGross === null ? "–" : e.bestGross}</td><td>${e.avgGross === null ? "–" : fix(e.avgGross)}</td><td class="acc">${fix(e.avgPts)}</td></tr>`).join("")}</tbody></table>`;
}
export function ninesPlayerBlock(rounds, pid, first) {
  const nines = ninesPlayed(rounds, pid);
  if (!nines.length) return "";
  return `${h2tip("Nines walked", `Each loop is scored on its own stroke index and course rating, whether ${esc(first)} walked it alone or as half of an 18, so the loops can be compared with each other.`)}
    <table class="stand"><thead><tr><th class="l">Loop</th><th>Walked</th><th>Best</th><th>Avg gross</th><th>Avg pts</th></tr></thead>
      <tbody>${nines.map(x => `<tr><td class="l">${esc(nineName(x.slug))}</td><td>${x.played}</td><td>${x.bestGross === null ? "–" : x.bestGross}</td><td>${x.avgGross === null ? "–" : fix(x.avgGross)}</td><td class="acc">${fix(x.avgPts)}</td></tr>`).join("")}</tbody></table>`;
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

/** The Stats tab: the field, or any one player of it, chosen at the top. */
export function leagueStatsBody(g, Ms, members) {
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return `<p class="muted center" style="margin:30px 0">No finished rounds in this league yet.</p>`;
  const who = St.players.some(p => p.id === ui.statsWho[g.id]) ? ui.statsWho[g.id] : "";
  const rounds = leagueRounds(g.id);
  const chips = `<div class="chips-wrap scroll">
    <button class="pchip ${who ? "" : "on"}" data-act="statswho" data-id="">The field<small>${plural(St.field.cards, "card")}</small></button>
    ${St.players.map(p => `<button class="pchip ${p.id === who ? "on" : ""}" data-act="statswho" data-id="${esc(p.id)}">${esc(p.name)}<small>${plural(p.played, "round")}</small></button>`).join("")}</div>`;
  const p = who ? St.players.find(x => x.id === who) : null;
  const mine = S.me();
  const body = p ? playerStats(St, p, ninesPlayerBlock(rounds, p.id, firstName(p.name)), g.id)
    : fieldStats(St, ninesFieldBlock(g.id, rounds, mine), g.id, mine && mine.id);
  return `${chips}<div class="statsbody">${body}<a class="btn" href="#statsposter/${g.id}" style="margin-top:16px">Make stats images ›</a></div>`;
}
