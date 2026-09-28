// The ways a league is scored, in words, and the one place every standings table is computed.
import * as S from "../store.js";
import { esc, safeCompute } from "../ui.js";
import { compute, standings, strokeStandings, matchStandings, gpStandings, GP_POINTS, fmtToPar, fix } from "../model.js";

export const FORMAT_NAMES = { stableford: "Stableford", stroke: "Stroke play", match: "Matchplay (stroke)",
  matchpts: "Matchplay (Stableford)", soccer: "Football table (stroke)", soccerpts: "Football table (Stableford)",
  gp: "Grand Prix (Stableford)", gpstroke: "Grand Prix (stroke)" };
export const GP_BASIS = { gp: "points", gpstroke: "net" };
export const MATCH_BASIS = { match: "net", matchpts: "points", soccer: "net", soccerpts: "points" };
export const basisWord = b => b === "points" ? "Stableford points" : b === "gross" ? "gross score" : "net strokes";
export const H2H_BASES = [["points", "Stableford", "the most Stableford points", "the higher Stableford points"],
  ["net", "Net score", "the lowest net score", "the lower net score"],
  ["gross", "Gross score", "the lowest gross score", "the lower gross score"]];
export const basisRow = b => H2H_BASES.find(x => x[0] === b) || H2H_BASES[0];
export const basisUnit = b => b === "points" ? "points" : b === "gross" ? "gross strokes" : "net strokes";
export const FORMAT_MODE = { stableford: "Stroke play", stroke: "Stroke play", gp: "Stroke play", gpstroke: "Stroke play",
  match: "Match play", matchpts: "Match play", soccer: "Match play", soccerpts: "Match play" };
export const FORMAT_BLURB = {
  stableford: "Everyone's Stableford points added up; most points wins",
  stroke: "Everyone's net score against par added up; lowest wins",
  match: "Everyone out the same day plays a match, each hole to the lower net score: 2 for a win, 1 for a draw",
  matchpts: "Everyone out the same day plays a match, each hole to the higher Stableford points: 2 for a win, 1 for a draw",
  soccer: "The same matches on net scores, in a football table: 3 for a win, 1 for a draw",
  soccerpts: "The same matches on Stableford points, in a football table: 3 for a win, 1 for a draw",
  gp: "Points for where you finish on each card on Stableford points, as in Formula 1: 25 for the win, then 18, 15, 12…",
  gpstroke: "The same points, with the day finished on net score against par instead; no card, no points",
};
export const FORMAT_NOTES = {
  stableford: "<b>Stroke play.</b> Everyone plays for their own score and nobody plays against anybody: each round gives you your Stableford points and this table adds them up. <b>Rds</b> is rounds played, <b>Wins</b> how often you had the most points on the day, <b>Avg</b> your points per round.",
  stroke: "<b>Stroke play.</b> Each round counts your net score against par, so −2 means two under. The lowest total wins. A round you did not finish a full card for counts nothing and is marked NR.",
  match: "<b>Match play.</b> Everyone out on the same card played a match against everyone else on it. Each hole goes to the lower net score, which is the score after handicap strokes, and whoever wins more holes wins the match. 2 points for a win, 1 each for a draw. <b>Up</b> is holes won minus holes lost across every match.",
  matchpts: "<b>Match play.</b> Everyone out on the same card played a match against everyone else on it, and each hole goes to the higher Stableford points. Points stop at zero, so two ruined holes are halved where net scores would still separate them. 2 points for a win, 1 each for a draw. <b>Up</b> is holes won minus holes lost.",
  soccer: "<b>Match play, football table.</b> The same matches, each hole on the lower net score, scored the way a football league is: 3 points for a win, 1 for a draw, nothing for a loss.",
  soccerpts: "<b>Match play, football table.</b> The same matches, each hole on the higher Stableford points, scored 3 for a win, 1 for a draw, nothing for a loss.",
  gp: `<b>Stroke play.</b> Each card hands out points for where you finished on the day on Stableford points, as Formula 1 does: ${GP_POINTS.join(", ")} down the board and nothing after that. Equal points are separated by countback. Only this league's players count towards a position, so a guest cannot take the win off you.`,
  gpstroke: `<b>Stroke play.</b> The same ${GP_POINTS.join(", ")} down the board, with the day finished on net score against par rather than on points, so the best card takes the win instead of the best points haul and a 9 and an 18 are ranked the same way. Equal net scores are separated by countback on net strokes. A card you did not finish has no position and scores nothing, marked NR.`,
};

/** Computed rounds attached to a league (finished ones), the players in them, and the standings. */
export function leagueResults(g) {
  const ids = new Set(S.leagueRoundIds(g.id));
  const Ms = [];
  for (const r of S.rounds().filter(r => ids.has(r.id) && r.status === "done")) {
    const M = safeCompute(compute, r, true);   // a league counts claimed contacts as one golfer, not one per address book
    if (M) Ms.push(M);
  }
  const members = [...new Set(Ms.flatMap(M => M.players.map(p => p.id)).filter(Boolean))];
  return { Ms, members, S: standings(Ms, members, g.bestN) };
}

/** The standings for one way of scoring a league. Every screen and every poster goes through here. */
export function standingsFor(g, Ms, members, kind) {
  if (kind === "stroke") return strokeStandings(Ms, members, g.bestN);
  if (kind in GP_BASIS) return gpStandings(Ms, members, g.bestN, GP_POINTS, GP_BASIS[kind]);
  if (kind in MATCH_BASIS) return matchStandings(Ms, members, kind.startsWith("soccer") ? 3 : 2, 1, MATCH_BASIS[kind]);
  return standings(Ms, members, g.bestN);
}

/** What a player's line in a league's table is worth, in that league's own units. */
export function standingValue(kind, r) {
  if (kind === "stroke") return r.played ? fmtToPar(r.counted) : "–";
  if (kind in MATCH_BASIS) return `${r.points} pts`;
  return `${r.counted} pts`;
}

export function standingsTable(kind, Sx, g, me) {
  const rows = Sx.rows;
  const mark = r => me && r.id === me.id ? "acc" : "";
  if (!rows.length) return `<p class="muted center">Nothing to rank yet.</p>`;
  if (kind === "stableford") return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Points"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`;
  if (kind in GP_BASIS) return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Points"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}${r.nr ? ` <span class="muted small">(${r.nr} NR)</span>` : ""}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`;
  if (kind === "stroke") return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Net ±"}</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}${r.nr ? ` <span class="muted small">(${r.nr} NR)</span>` : ""}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best === null ? "–" : fmtToPar(r.best)}</td><td>${r.played ? fmtToPar(Math.round(r.avg * 10) / 10) : "–"}</td><td class="acc">${r.played ? fmtToPar(r.counted) : "–"}</td></tr>`).join("")}</tbody></table>`;
  return `<table class="stand"><thead><tr><th class="pos">#</th><th class="l">Player</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Up</th><th>Pts</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${mark(r)}"><td class="pos">${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.up > 0 ? "+" : ""}${r.up}</td><td class="acc">${r.points}</td></tr>`).join("")}</tbody></table>`;
}
