// The ways a league is scored, in words, and the one place every standings table is computed.
import * as S from "../store.js";
import { esc, plural, safeCompute, ui } from "../ui.js";
import { compute, isMatchFormat, standings, strokeStandings, matchStandings, gpStandings, eloStandings, GP_POINTS, ELO, leagueCards, golfersOf, fmtToPar, fix } from "../model.js";

export const FORMAT_NAMES = { stableford: "Stableford", stroke: "Stroke play", match: "Matchplay (stroke)",
  matchpts: "Matchplay (Stableford)", soccer: "Football table (stroke)", soccerpts: "Football table (Stableford)",
  gp: "Grand Prix (Stableford)", gpstroke: "Grand Prix (stroke)",
  elo: "Elo rating", elopts: "Elo (Stableford)", elostroke: "Elo (stroke)", elomatch: "Elo (matchplay)" };
export const GP_BASIS = { gp: "points", gpstroke: "gross" };
// every match table not on Stableford goes hole by hole on strokes taken, never on handicap
export const MATCH_BASIS = { match: "gross", matchpts: "points", soccer: "gross", soccerpts: "points" };
export const ELO_BASIS = { elo: "all", elopts: "points", elostroke: "gross", elomatch: "match" };
/** The game a head to head is compared in, named after what was picked: points are Stableford, not stroke play. */
export const basisGame = b => b === "points" ? "Stableford" : b === "gross" ? "Stroke play" : "Net stroke play";
export const basisTaker = b => b === "points" ? "the most points" : b === "gross" ? "the fewest strokes" : "the lowest net score";
export const basisWord = b => b === "points" ? "Stableford points" : b === "gross" ? "gross score" : "net strokes";
export const H2H_BASES = [["points", "Stableford", "the most Stableford points", "the higher Stableford points"],
  ["net", "Net score", "the lowest net score", "the lower net score"],
  ["gross", "Gross score", "the lowest gross score", "the lower gross score"]];
export const basisRow = b => H2H_BASES.find(x => x[0] === b) || H2H_BASES[0];
export const basisUnit = b => b === "points" ? "points" : b === "gross" ? "gross strokes" : "net strokes";
export const FORMAT_MODE = { stableford: "Stroke play", stroke: "Stroke play", gp: "Stroke play", gpstroke: "Stroke play",
  match: "Match play", matchpts: "Match play", soccer: "Match play", soccerpts: "Match play",
  elo: "Rating", elopts: "Rating", elostroke: "Rating", elomatch: "Rating" };
export const FORMAT_BLURB = {
  stableford: "Everyone's Stableford points added up; most points wins",
  stroke: "Everyone's strokes against par added up, no handicap; lowest wins",
  match: "Everyone out the same day plays a match, each hole to the fewest strokes taken, no handicap: 2 for a win, 1 for a draw",
  matchpts: "Everyone out the same day plays a match, each hole to the higher Stableford points: 2 for a win, 1 for a draw",
  soccer: "The same matches on strokes taken, in a football table: 3 for a win, 1 for a draw",
  soccerpts: "The same matches on Stableford points, in a football table: 3 for a win, 1 for a draw",
  gp: "Points for where you finish on each card on Stableford points, as in Formula 1: 25 for the win, then 18, 15, 12…",
  gpstroke: "The same points, with the day finished on strokes against par instead, no handicap; no card, no points",
  elo: "A rating that rises when you beat the players you were out with, more for beating better ones and by more; half with handicap, half without",
  elopts: "The same rating, with each pair settled on Stableford points",
  elostroke: "The same rating, with each pair settled on strokes taken, no handicap",
  elomatch: "The same rating, with each pair settled by a match on strokes taken, hole by hole, no handicap",
};
// What a game is in each Elo format: who wins it, and what the margin d is counted in.
const ELO_GAME = {
  elo: "Each game is worked out three times: on Stableford points (d in points), as a match hole by hole on net strokes (d in holes up), and as a match on strokes taken with no handicap (d in holes up). M × (R − E) counts ¼ for Stableford, ¼ for the net match and ½ for the match without handicap, so the handicap decides half the game and the golf itself the other half.",
  elopts: "A game goes to whoever has more Stableford points, and d is the difference in points.",
  elostroke: "A game goes to whoever took fewer strokes, with no handicap, and d is the difference in strokes. A card you did not finish loses to everyone who finished theirs, with M = 1.",
  elomatch: "A game is a match on strokes taken, hole by hole with no handicap, over every hole played rather than stopped once it is decided, and d is the holes up at the end. A hole only one of you finished goes to that player.",
};

// The tables a match play round registers in. Every other table, and a society with none of these, never sees one.
export const MATCH_TABLES = ["match", "matchpts", "soccer", "soccerpts", "elo", "elomatch"];
export const readsMatches = kind => MATCH_TABLES.includes(kind);
// A match play round is the match that was played, in every table that reads one.
const MATCH_ROUND = "A match play round counts as the match that was played, with no handicap: each player on one side against each on the other, never a partner, won by whoever won the match. d is the holes it was won by (3&2 counts 3), and the strokes and points on that card count for nothing.";

/** How an Elo table is calculated: the formula first, then what each letter is, then one worked example. */
function eloHow(kind) {
  const k = ELO.k, k0 = ELO.k * ELO.provisionalK;
  return `<p><b>Everyone starts on 0 points and nobody goes below 0.</b> Every day out, you play a game against each of the society's other players on the card.</p>
<p><b>In this table:</b> ${ELO_GAME[kind]}</p>
${readsMatches(kind) ? `<p>${MATCH_ROUND}</p>` : "<p>A match play round does not count in this table.</p>"}
<p class="elof">points = K × M × (R − E) ÷ N</p>
<p><b>K</b> ${k} a day, or ${k0} in your first ${ELO.provisionalDays} days while the table finds your level<br>
<b>R</b> your result: 1 for a win, ½ for a draw, 0 for a loss<br>
<b>E</b> your chance of winning, 1 ÷ (1 + 10<sup>(their rating − yours) ÷ ${ELO.scale}</sup>): 50% against an equal, 64% when you are 100 ahead<br>
<b>M</b> the margin, ln(1 + d) ÷ ln 4, from ½ to 2: winning by 1 counts ½, by 3 counts 1, by 7 counts 1½, by 15 or more counts 2<br>
<b>N</b> how many players you played that day</p>
<p>Each game's points are added up for the day. Your points are your rating, the same number E is worked out from: at 0 a losing day costs nothing. Equal points go to the decimals behind them, then to whoever has played more days.</p>
<p><b>For example</b>, two new players, an even game (E = 0.5), won by 3 (M = 1): ${k0} × 1 × (1 − 0.5) ÷ 1 = <b>+${k0 / 2}</b> to the winner. The loser would lose ${k0 / 2}, but is on 0, so stays on 0.</p>`;
}

export const FORMAT_NOTES = {
  stableford: "<b>Stroke play.</b> Everyone plays for their own score and nobody plays against anybody: each round gives you your Stableford points and this table adds them up. <b>Rds</b> is rounds played, <b>Wins</b> how often you had the most points on the day, <b>Avg</b> your points per round.",
  stroke: "<b>Stroke play.</b> Each round counts the strokes you took against par, with no handicap, so −2 means two under. The lowest total wins. A round you did not finish a full card for counts nothing and is marked NR.",
  match: "<b>Match play.</b> A match play round counts as the match that was played, with no handicap, side against side. On any other card, everyone out on it played a match against everyone else on it. Each hole goes to the fewest strokes taken, with no handicap, and whoever wins more holes wins the match. 2 points for a win, 1 each for a draw. <b>Up</b> is holes won minus holes lost across every match.",
  matchpts: "<b>Match play.</b> A match play round counts as the match that was played, with no handicap, side against side. On any other card, everyone out on it played a match against everyone else on it, and each hole goes to the higher Stableford points. Points stop at zero, so two ruined holes are halved where net scores would still separate them. 2 points for a win, 1 each for a draw. <b>Up</b> is holes won minus holes lost.",
  soccer: "<b>Match play, football table.</b> The same matches, each hole to the fewest strokes taken with no handicap, scored the way a football league is: 3 points for a win, 1 for a draw, nothing for a loss.",
  soccerpts: "<b>Match play, football table.</b> The same matches, each hole on the higher Stableford points, scored 3 for a win, 1 for a draw, nothing for a loss.",
  gp: `<b>Stroke play.</b> Each card hands out points for where you finished on the day on Stableford points, as Formula 1 does: ${GP_POINTS.join(", ")} down the board and nothing after that. Equal points are separated by countback. Only this society's players count towards a position, so a guest cannot take the win off you.`,
  gpstroke: `<b>Stroke play.</b> The same ${GP_POINTS.join(", ")} down the board, with the day finished on strokes against par with no handicap rather than on points, so the best card takes the win instead of the best points haul and a 9 and an 18 are ranked the same way. Equal scores are separated by countback on strokes. A card you did not finish has no position and scores nothing, marked NR.`,
  elo: eloHow("elo"),
  elopts: eloHow("elopts"),
  elostroke: eloHow("elostroke"),
  elomatch: eloHow("elomatch"),
};

const forKind = (Ms, kind) => readsMatches(kind) ? Ms : Ms.filter(M => !isMatchFormat(M.format));

// A society in seasons starts a fresh table on the first of its month every year; the year a season starts in names it.
export const seasonOf = (g, date) => { const [y, m] = String(date).split("-").map(Number); return m >= g.seasonStart ? y : y - 1; };
export const seasonName = (g, y) => g.seasonStart === 1 ? String(y) : `${y}–${String(y + 1).slice(2)}`;
export const currentSeason = g => g.seasonStart ? seasonOf(g, S.today()) : null;
export const shownSeason = g => g.seasonStart ? ui.season[g.id] ?? currentSeason(g) : null;
export const inSeason = (g, date, season) => season === null || (!!date && seasonOf(g, date) === season);

/** A society's finished rounds, in one season when it keeps them; `null` is every round. */
export function seasonRounds(g, season = currentSeason(g)) {
  const ids = new Set(S.leagueRoundIds(g.id));
  return S.rounds().filter(r => ids.has(r.id) && r.status === "done" && inSeason(g, r.date, season));
}

/** Computed rounds attached to a league (finished ones), the players in them, and the standings. */
export function leagueResults(g, season = currentSeason(g)) {
  const matches = S.cleanFormats(g.formats).some(readsMatches);
  const Ms = [];
  for (const r of seasonRounds(g, season).filter(r => matches || !isMatchFormat(r.format))) {
    const M = safeCompute(compute, r, true);   // a league counts claimed contacts as one golfer, not one per address book
    if (M) Ms.push(M);
  }
  // a match's golfers are its players; a scramble team's are its members, never the team
  const members = [...new Set(Ms.flatMap(golfersOf).map(p => p.id).filter(Boolean))];
  return { Ms, members, S: standings(Ms, members, g.bestN) };
}

/** The standings for one way of scoring a league. Every screen and every poster goes through here. */
export function standingsFor(g, MsIn, members, kind) {
  const Ms = forKind(MsIn, kind);
  if (kind === "stroke") return strokeStandings(Ms, members, g.bestN);
  if (kind in GP_BASIS) return gpStandings(Ms, members, g.bestN, GP_POINTS, GP_BASIS[kind]);
  if (kind in MATCH_BASIS) return matchStandings(Ms, members, kind.startsWith("soccer") ? 3 : 2, 1, MATCH_BASIS[kind]);
  if (kind in ELO_BASIS) return eloStandings(Ms, members, ELO_BASIS[kind]);
  return standings(Ms, members, g.bestN);
}

/**
 * The most recent day, and the table as it stood before it. A league counts by the day, so the question
 * "did I move?" is the same table run again over everything but the last card -- which works for every way
 * of scoring without any of them knowing about it, and needs nothing stored.
 */
export function sinceLast(g, MsIn, members, kind) {
  const Ms = forKind(MsIn, kind);
  const cards = leagueCards(Ms).filter(c => c.date);
  if (!cards.length) return null;
  // the unit is the day, not the card: one Sunday split over two loops is two cards and one outing, so
  // taking only one of them away would credit the other to the table "before" it was played
  const day = cards.reduce((d, c) => (String(c.date) > d ? String(c.date) : d), "");
  const onTheDay = cards.filter(c => String(c.date) === day);
  const before = Ms.filter(M => !onTheDay.some(c => c.rounds.includes(M)));
  const was = before.length ? new Map(standingsFor(g, before, members, kind).rows.map(r => [r.id, r.place])) : null;
  const last = onTheDay.reduce((x, y) => (y.players.length > x.players.length ? y : x));
  return { last, onTheDay, day, was, first: !before.length };
}

/**
 * The table as it stood after each day, one column a day, for the climb chart. Every way of scoring gets it
 * the way sinceLast does, by running the table again over a prefix of the days. Undated rounds count from the
 * start, as the Elo table plays them first.
 */
export function boardOverTime(g, Ms, members, kind) {
  const days = [...new Set(Ms.map(M => M.date).filter(Boolean))].sort();
  const now = standingsFor(g, Ms, members, kind).rows.filter(r => r.played);
  const players = now.map(r => ({ id: r.id, name: r.name, place: r.place, vals: [], played: [] }));
  const seen = new Map();
  for (const d of days) {
    const rows = new Map(standingsFor(g, Ms.filter(M => !M.date || M.date <= d), members, kind).rows.map(r => [r.id, r]));
    for (const p of players) {
      const r = rows.get(p.id), on = !!(r && r.played);
      p.vals.push(on ? decidingValue(kind, r) : null);
      // a day they sat out leaves the count where it was; the line carries on without a node there
      p.played.push(on && r.played > (seen.get(p.id) || 0));
      seen.set(p.id, on ? r.played : 0);
    }
  }
  return { days, players };
}

/** Stroke play is lowest-wins on a to-par total, which a chart of scores going up would draw upside down. */
export const climbs = kind => kind !== "stroke";

/** What a player's line in a league's table is worth, in that league's own units. */
export function standingValue(kind, r) {
  if (kind in ELO_BASIS) return `${Math.round(r.score)} pts`;
  if (kind === "stroke") return r.played ? fmtToPar(r.counted) : "–";
  if (kind in MATCH_BASIS) return `${r.points} pts`;
  return `${r.counted} pts`;
}

/**
 * One standings row as the board draws it: the number the league is decided on, the unit under it, and the
 * figures that used to be columns said as one line. Every format keeps its own facts; only the shape is
 * shared, so a phone gets three things across instead of eight.
 */
export function boardLine(kind, r, g) {
  const cards = n => plural(n, "card");
  if (kind in ELO_BASIS) {
    const moved = r.last === null ? "" : ` · ${eloDelta(r.last)} last time`;
    return { value: String(Math.round(r.score)), unit: "pts",
      sub: `${plural(r.played, "day")}${moved}` };
  }
  if (kind in MATCH_BASIS) {
    const word = kind.startsWith("soccer") ? "played" : "matches";
    return { value: String(r.points), unit: "pts",
      sub: `${r.played} ${word} · ${r.won} W ${r.drawn} D ${r.lost} L${r.up ? ` · ${r.up > 0 ? "+" : ""}${r.up} up` : ""}` };
  }
  if (kind === "stroke") {
    const nr = r.nr ? ` · ${plural(r.nr, "no return")}` : "";
    if (!r.played) return { value: "–", unit: g.bestN ? `best ${g.bestN}` : "to par", sub: r.nr ? `no card returned${nr}` : "no cards yet" };
    return { value: fmtToPar(r.counted), unit: g.bestN ? `best ${g.bestN}` : "to par",
      sub: `${cards(r.played)} · ${fmtToPar(r.avg)} avg${r.wins ? ` · ${plural(r.wins, "win")}` : ""}${nr}` };
  }
  if (kind in GP_BASIS) {
    const nr = r.nr ? ` · ${r.nr} scored nothing` : "";
    return { value: String(r.counted), unit: g.bestN ? `best ${g.bestN}` : "pts",
      sub: `${cards(r.played)}${r.wins ? ` · ${plural(r.wins, "win")}` : ""}${r.best ? ` · best ${r.best}` : ""}${nr}` };
  }
  return { value: String(r.counted), unit: g.bestN ? `best ${g.bestN}` : "pts",
    sub: `${cards(r.played)} · ${fix(r.avg)} avg${r.wins ? ` · ${plural(r.wins, "win")}` : ""}` };
}

/** The value a table is actually ordered on, so the screen can tell when two rows were split on countback. */
export const decidingValue = (kind, r) => kind in MATCH_BASIS ? r.points : kind in ELO_BASIS ? Math.round(r.score) : r.counted;
export const eloDelta = d => { const x = Math.round(d); return x > 0 ? `+${x}` : x < 0 ? `−${-x}` : "±0"; };

// The parts of a day's Elo, in the order ELO_GAME explains them.
const ELO_PART_NAMES = { points: "Stableford", netmatch: "net match", match: "scratch match", net: "net score", gross: "strokes taken", played: "the match" };

/**
 * Where one day's rating change came from: each part as whole points that add up to the change shown, by
 * largest remainder, so "+4 Stableford · +7 scratch match" never sums to something the board does not say.
 * Parts that come to 0 are left out. A day the floor at 0 cut short says so, rather than adding up wrong.
 */
export function eloDay(h) {
  const keys = Object.keys(ELO_PART_NAMES).filter(k => k in h.parts);
  const floored = Math.round(h.delta) !== h.change && h.rating === 0;
  const target = floored ? Math.round(h.delta) : h.change;
  const whole = keys.map(k => Math.floor(h.parts[k]));
  let left = target - whole.reduce((a, b) => a + b, 0);
  const byFrac = keys.map((k, i) => [i, h.parts[k] - whole[i]]).sort((a, b) => b[1] - a[1]);
  for (let j = 0; left > 0 && j < byFrac.length; j++, left--) whole[byFrac[j][0]]++;
  for (let j = byFrac.length - 1; left < 0 && j >= 0; j--, left++) whole[byFrac[j][0]]--;
  const parts = keys.map((k, i) => [ELO_PART_NAMES[k], whole[i]]).filter(([, v]) => v !== 0);
  return { change: h.change, parts: parts.length > 1 || floored ? parts : [], floored };
}

/** What a round is settled on in each way of scoring: Stableford points, net strokes, or strokes taken. */
export const dayBasis = kind => GP_BASIS[kind] || MATCH_BASIS[kind] || (kind === "elomatch" || kind === "elostroke" || kind === "stroke" ? "gross" : "points");

/**
 * One day's board in the league's own currency. A football-table or stroke-play league whose day is read off
 * the Stableford board crowns the wrong player in the largest type on the screen, so the sort follows the
 * league.
 */
/** A match on a society's day, in words: "Ties beat Maurits 2 UP", or how it stands. */
export function matchSentence(m) {
  const names = k => m.sides[k].join(" & ");
  if (!m.result) return `${names("A")} v ${names("B")}: ${m.status}`;
  if (!m.leader) return `${names("A")} and ${names("B")} halved`;
  return `${names(m.leader)} beat ${names(m.leader === "A" ? "B" : "A")} ${m.margin}`;
}

export function dayBoard(kind, card) {
  const basis = dayBasis(kind);
  const rows = [...(card.stbl_board || [])];
  if (basis === "points") return { basis, rows, value: p => String(p.pts), unit: "pts" };
  const par = card.course_par ?? 0, field = basis === "gross" ? "gross" : "net";
  const net = p => (p[field] === null || p[field] === undefined ? null : p[field] - par);
  rows.sort((a, b) => { const x = net(a), y = net(b); return x === null ? (y === null ? 0 : 1) : y === null ? -1 : x - y; });
  return { basis, rows, value: p => net(p) === null ? "NR" : fmtToPar(net(p)), unit: field, key: net };
}

/**
 * Which row is this phone's. A league collapses a claimed contact into the account that claimed it, so my
 * line is under my identity as often as under my own id; asking only for `me.id` leaves a claimed player
 * unmarked on every board. One answer, used by every screen that draws a standings row.
 */
export const isMyRow = (r, me) => !!me && !!r && (r.id === S.identityOf(me.id) || r.id === me.id);
export const myRow = (rows, me) => (me && rows.find(r => isMyRow(r, me))) || null;

export function standingsTable(kind, Sx, g, me, cls = "") {
  const rows = Sx.rows;
  const mark = r => isMyRow(r, me) ? "acc" : "";
  if (!rows.length) return `<p class="muted center">Nothing to rank yet.</p>`;
  if (kind === "stableford") return `<table class="stand ${cls}"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Points"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`;
  if (kind in GP_BASIS) return `<table class="stand ${cls}"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Points"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}${r.nr ? ` <span class="muted small">(${r.nr} NR)</span>` : ""}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`;
  if (kind in ELO_BASIS) return `<table class="stand ${cls}"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Days</th><th>W</th><th>D</th><th>L</th><th>Peak</th><th>Last</th><th>Pts</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${Math.round(r.peak)}</td><td>${r.last === null ? "–" : eloDelta(r.last)}</td><td class="acc">${Math.round(r.score)}</td></tr>`).join("")}</tbody></table>`;
  if (kind === "stroke") return `<table class="stand ${cls}"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "To par"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}${r.nr ? ` <span class="muted small">(${r.nr} NR)</span>` : ""}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best === null ? "–" : fmtToPar(r.best)}</td><td>${r.played ? fmtToPar(Math.round(r.avg * 10) / 10) : "–"}</td><td class="acc">${r.played ? fmtToPar(r.counted) : "–"}</td></tr>`).join("")}</tbody></table>`;
  return `<table class="stand ${cls}"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Up</th><th>Pts</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.up > 0 ? "+" : ""}${r.up}</td><td class="acc">${r.points}</td></tr>`).join("")}</tbody></table>`;
}
