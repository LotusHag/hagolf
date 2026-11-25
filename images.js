// What every "Send the …" hands out: which images fit a round, a society or your own numbers, which one each
// place opens on, and how each is drawn. The image screen (graphics.js) draws from the same lists, so a door
// and the screen behind it never disagree about what a board is called or what is on it.
import * as S from "./store.js";
import * as B from "./brand.js";
import * as A from "./auth.js";
import { ui, go, previewSheet, courseBy, courseTitle, toast, plural, firstName, themeForRound, themeFor, appTheme, makeTheme, sizedLooks, fmtDate } from "./ui.js";
import { compute, leagueStats, isMatchFormat, onPoints, fix, fmtToPar } from "./model.js";
import { grossLeaderboard, stablefordLeaderboard, netLeaderboard, matchPoster, bothBoards, holesPoster, standingsPoster, dayPoster, eventPoster, STANDINGS_TITLES } from "./posters.js";
import * as Fl from "./flights.js";
import { statsFieldPoster, statsPlayerPoster, statsMinePoster } from "./statsposters.js";
import { renderCards } from "./cards.js";
import { BRAND_STYLES, dayOutSheet, leagueSheet } from "./brandsheets.js";
import { leagueResults, standingsFor, FORMAT_NAMES, shownSeason } from "./screens/formats.js";

// ---------------------------------------------------------------- a round
/** Every round image by its key: what a person calls it, and how it is drawn. */
export const ROUND_IMAGES = {
  stbl: { name: "Stableford board", make: (M, T) => stablefordLeaderboard(M, T) },
  net: { name: "Net board", make: (M, T) => netLeaderboard(M, T) },
  gross: { name: "Gross board", make: (M, T) => grossLeaderboard(M, T) },
  both: { name: "Both boards", make: (M, T) => bothBoards(M, T) },
  match: { name: "The match", make: (M, T) => matchPoster(M, T) },
  holes: { name: "How the holes played", make: (M, T) => holesPoster(M, T) },
};

/**
 * The images that fit how a card was scored, its own board first. A match is read as the match, so no board
 * of net or points is offered on one; a stroke-play card is settled on net, so its board is the net board.
 */
export function roundKinds(M, brand = null) {
  const f = M.format || "stableford";
  const list = isMatchFormat(f) ? [...(M.matches.length ? ["match"] : []), "cards", "holes"]
    : onPoints(f) ? ["stbl", "gross", "both", "holes", "cards"] : ["net", "gross", "holes", "cards"];
  const allowed = B.kindsOf(brand);
  // a partner who offers a board offers the board this card is settled on, even one that is newer than its list
  return allowed ? list.filter(k => allowed.includes(k) || ((k === "net" || k === "match") && (allowed.includes("stbl") || allowed.includes("gross")))) : list;
}

/** Which seat on a round is mine: my own, or the scramble team I played in. */
function mySeatId(r) {
  const seat = S.mySeat(r);
  if (!seat) return null;
  if (seat.role !== "member") return seat.playerId;
  const team = r.entries.find(t => t.role === "team" && (t.members || []).includes(seat.playerId));
  return team ? team.playerId : null;
}

const fileName = (title, name, tag) => `${title} - ${name}${tag ? " (phone)" : ""}.png`.replace(/[\\/:*?"<>|]+/g, "-");
/** One image in the sizes this phone last chose, each named the way a person would name it. */
const sized = (T, title, name, make) => sizedLooks(T).map(([Tz, tag]) => ({ fig: make(Tz), file: fileName(title, name, tag) }));

function roundModel(rid) {
  const r = S.getRound(rid), c = r && courseBy(r.course);
  if (!c) return null;
  try { return { r, M: compute(c, S.toModelRound(r)) }; } catch (e) { return null; }
}

/** The words on a round's door: what the image it opens on is. */
export function roundDoor(rid) {
  const x = roundModel(rid);
  if (!x || !x.M.field) return null;
  const key = roundDefault(x.M, x.r);
  return key === "match" ? "Send the match" : key === "cards" ? "Send your card" : "Send the board";
}
export function roundDefault(M, r) {
  const kinds = roundKinds(M, B.brandOfRound(r.id));
  if (M.field === 1 && !M.matches.length && kinds.includes("cards")) return "cards";
  return kinds[0];
}

/** "12 players · Daan first on 42": what the board says, in the words under its name. */
function roundSays(M, key) {
  if (key === "match") return M.matches.length === 1 ? (M.matches[0].result || M.matches[0].status) : plural(M.matches.length, "match", "matches");
  const top = key === "net" ? [...M.players].filter(p => p.net !== null).sort((a, b) => a.net - b.net)[0]
    : key === "gross" ? M.gross_board[0] : M.stbl_board[0];
  const v = !top ? "" : key === "net" ? `net ${top.net}` : key === "gross" ? `${top.gross}` : `${top.pts} pts`;
  return [plural(M.field, "player"), top && v ? `${firstName(top.name)} first on ${v}` : ""].filter(Boolean).join(" · ");
}

/**
 * The round's sheet, opened on `want` (or the board the card is settled on), with the others this card has
 * one tap away. `pid` makes it that player's card instead of mine.
 */
export async function sendRound(rid, want = null, pid = null) {
  const x = roundModel(rid);
  if (!x || !x.M.field) return toast("No finished card to draw yet");
  const { r, M } = x, brand = B.brandOfRound(rid);
  const T = makeTheme(themeForRound(rid));
  const kinds = roundKinds(M, brand);
  const mine = M.players.find(p => p.id === (pid || mySeatId(r))) || null;
  const draw = make => () => B.withBrand(brand, r.date, () => make());
  const choices = [];
  const board = k => ({ key: k, label: ROUND_IMAGES[k].name, sub: roundSays(M, k), render: draw(() => sized(T, r.name, ROUND_IMAGES[k].name, Tz => ROUND_IMAGES[k].make(M, Tz))) });
  const card = p => ({ key: "cards", label: p.id === mySeatId(r) ? "Your card" : `${firstName(p.name)}'s card`, sub: p.gross === null ? "no return" : `${p.gross} gross${isMatchFormat(M.format) ? "" : ` · ${p.pts} pts`}`,
    render: draw(() => sized(T, r.name, p.name, Tz => renderCards(M, Tz, [p.name], { extras: S.statsOnImages() })[0].fig)) });
  // a partner's round opens on the partner's own sheet, where the card is not settled as a match
  if (brand && !isMatchFormat(M.format)) {
    const st = styleOf(brand, "dayout");
    choices.push({ key: `bs:dayout:${st}`, label: `${brand.name}'s board`, sub: roundSays(M, kinds[0]), render: draw(() => sized(T, r.name, "Day out", Tz => dayOutSheet(M, Tz, st))) });
  }
  for (const k of kinds) {
    if (k === "cards") { if (mine) choices.push(card(mine)); continue; }
    if (k === "both") continue;   // the two boards it repeats are both here already
    choices.push(board(k));
  }
  if (pid && mine && !choices.some(c => c.key === "cards")) choices.push(card(mine));
  const first = choices.findIndex(c => c.key === (want || (pid ? "cards" : roundDefault(M, r))));
  if (first > 0) choices.unshift(...choices.splice(first, 1));
  const v = await previewSheet({ title: choices[0].label, lead: `${r.name}${r.date ? `, ${fmtDate(r.date)}` : ""}`, choices: choices.slice(0, 4) });
  if (v === "more") go(`#graphics/${rid}/${choices[0].key === "cards" ? "cards" : choices[0].key}`);
}

const styleOf = (b, kind) => { const s = b && b.template && b.template.styles && b.template.styles[kind]; return BRAND_STYLES[kind].some(x => x.key === s) ? s : BRAND_STYLES[kind][0].key; };

// ---------------------------------------------------------------- an event
/** The event's format as a poster: every round, every flight, who goes where, and how each stands. */
function eventFormat(e, P) {
  const finals = new Set(Fl.finals(P).map(f => f.id));
  const lines = f => Fl.isMatch(f)
    ? Fl.matchesOf(e, f).slice(0, 4).map(m => [`${m.sides.A.map(firstName).join(" & ")} v ${m.sides.B.map(firstName).join(" & ")}`, m.result ? m.margin : m.thru ? m.status.replace(/ thru \d+$/, "") : ""])
    : Fl.standing(e, f, P).filter(x => x.holes).slice(0, 3).map((x, i) => [`${i + 1}  ${x.name}`, f.format === "stroke" ? fmtToPar(x.net) : `${x.pts}`]);
  return {
    title: e.name, kicker: "The format",
    sub: P.rounds.length ? `${fmtDate(P.rounds[0].date)}${P.rounds.length > 1 ? ` – ${fmtDate(P.rounds[P.rounds.length - 1].date)}` : ""}` : "",
    rounds: P.rounds.map((rd, k) => ({ title: `Round ${k + 1}`, sub: `${fmtDate(rd.date)} · ${courseTitle(courseBy(rd.course) || { name: rd.course })}`,
      flights: Fl.flightsIn(P, rd.id).map(f => {
        const to = f.from.map(s => s.flight).filter(Boolean);
        return { id: f.id, name: f.name, how: `${Fl.FLIGHT_FORMATS[f.format][0]}${Fl.carried(P, f).length ? ", scores carried" : ""}`, from: (s => s.charAt(0).toUpperCase() + s.slice(1))(Fl.sourceText(P, f)),
          lines: lines(f), final: finals.has(f.id), to, carry: (f.carry || []).filter(id => !to.includes(id)) };
      }) })),
  };
}

/** A flight's board as a sheet: its places with what they carried in, or its matches. */
function flightBoard(e, P, f) {
  const rd = P.rounds.find(x => x.id === f.round), match = Fl.isMatch(f), net = f.format === "stroke", carries = Fl.carried(P, f).length > 0;
  return { title: Fl.flightTitle(P, f), kicker: e.name, sub: `${fmtDate(rd.date)} · ${courseTitle(courseBy(rd.course) || { name: rd.course })}`,
    right: Fl.FLIGHT_FORMATS[f.format][0], unit: net ? "Net" : "Points",
    rows: match ? [] : Fl.standing(e, f, P).filter(x => x.holes).map((x, i) => ({ place: i + 1, name: x.name, value: net ? fmtToPar(x.net) : String(x.pts),
      sub: carries ? `${plural(x.rounds, "round")} · ${x.holes} holes` : `${x.holes} holes` })),
    matches: match ? Fl.matchesOf(e, f).map(m => `${m.sides.A.join(" & ")} v ${m.sides.B.join(" & ")}: ${m.result || m.status}`) : [] };
}

/** An event's images: the format first, then the board of every flight that ends it and has a score on it. */
export async function sendEvent(id) {
  const e = S.getEvent(id), P = e && Fl.planOf(e), first = e && Fl.cardOf(e, P.flights[0]);
  if (!first) return toast("Nothing to draw yet");
  const T = makeTheme(themeForRound(first.id));
  const D = eventFormat(e, P);
  const choices = [{ key: "format", label: "The format", sub: plural(P.flights.length, "flight"), render: () => sized(T, e.name, "The format", Tz => eventPoster(D, Tz)) }];
  for (const f of Fl.finals(P)) {
    const B = flightBoard(e, P, f);
    if (B.rows.length || B.matches.length) choices.push({ key: f.id, label: B.title, sub: Fl.flightState(e, f, P), render: () => sized(T, e.name, B.title, Tz => dayPoster(B, Tz)) });
  }
  await previewSheet({ title: choices[0].label, lead: e.name, choices: choices.slice(0, 4), more: false });
}

// ---------------------------------------------------------------- a society
function society(gid) {
  const g = S.getLeague(gid);
  if (!g) return null;
  const { Ms, members } = leagueResults(g, shownSeason(g));
  return Ms.length ? { g, Ms, members, brand: B.brandOfLeague(g), T: makeTheme(themeFor(g)) } : null;
}

const tableChoice = (L, kind) => ({ key: `standings:${kind}`, label: kind === "stableford" || !FORMAT_NAMES[kind] ? "The table" : `The table, ${FORMAT_NAMES[kind]}`,
  sub: (() => { const rows = standingsFor(L.g, L.Ms, L.members, kind).rows; return rows.length ? `${plural(rows.length, "player")} · ${firstName(rows[0].name)} on top` : "nobody ranked yet"; })(),
  render: () => B.withBrand(L.brand, null, () => L.brand
    ? sized(L.T, L.g.name, STANDINGS_TITLES[kind] || "Table", T => leagueSheet(standingsFor(L.g, L.Ms, L.members, kind), L.g, T, kind, styleOf(L.brand, "league")))
    : sized(L.T, L.g.name, STANDINGS_TITLES[kind] || "Table", T => standingsPoster(standingsFor(L.g, L.Ms, L.members, kind), L.g, T, kind))) });

function seasonChoice(L, pid) {
  const St = leagueStats(L.Ms, L.members), p = St.players.find(x => x.id === pid);
  if (!p) return null;
  return { key: "stats:players", label: `${firstName(p.name)}'s season`, sub: `${plural(p.played, "round")} · ${fix(p.avgPts)} points a round`,
    render: () => B.withBrand(L.brand, null, () => sized(L.T, L.g.name, p.name, T => statsPlayerPoster(St, p, L.g, T, { extras: S.statsOnImages() }))) };
}
const fieldChoice = L => ({ key: "stats:field", label: "How this society scores", sub: plural(leagueStats(L.Ms, L.members).field.cards, "card"),
  render: () => B.withBrand(L.brand, null, () => sized(L.T, L.g.name, "How this society scores", T => statsFieldPoster(leagueStats(L.Ms, L.members), L.g, T, { extras: S.statsOnImages() }))) });

async function sendSociety(gid, L, choices) {
  const v = await previewSheet({ title: choices[0].label, lead: L.g.name, choices: choices.filter(Boolean).slice(0, 4) });
  if (v === "more") go(`#leagueimages/${gid}/${choices[0].key}`);
}

/** The society's table in the way of scoring on screen, with the season's other sheets beside it. */
export async function sendTable(gid, kind) {
  const L = society(gid);
  if (!L) return toast("No finished rounds in this society yet");
  await sendSociety(gid, L, [tableChoice(L, kind), fieldChoice(L)]);
}

/** One player's season in a society, then the table. */
export async function sendSeason(gid, pid, kind) {
  const L = society(gid);
  if (!L) return toast("No finished rounds in this society yet");
  ui.statsWho[gid] = pid;   // the image screen behind it ticks the player whose season this is
  await sendSociety(gid, L, [seasonChoice(L, pid), tableChoice(L, kind)]);
}
/**
 * A society's day, as the screen showed it: `D` is the plain data dayPoster draws (league.js builds it, since it
 * knows who counts and what the day did to the table), `rids` the cards handed in that day.
 */
export async function sendDay(gid, D, rids = []) {
  const L = society(gid);
  if (!L) return toast("No finished rounds in this society yet");
  const day = { key: "day", label: "The day", sub: D.says, render: () => B.withBrand(L.brand, null, () => sized(L.T, L.g.name, D.title, T => dayPoster(D, T))) };
  const holes = rids.length === 1 && roundModel(rids[0]);
  const choices = [day, holes ? { key: "holes", label: "How the holes played", sub: plural(holes.M.field, "player"),
    render: () => B.withBrand(L.brand, holes.r.date, () => sized(L.T, holes.r.name, ROUND_IMAGES.holes.name, T => holesPoster(holes.M, T))) } : null, tableChoice(L, D.kind)];
  await sendSociety(gid, L, choices);
}

// ---------------------------------------------------------------- my own numbers
/** Every round I played, on one sheet: the handicap, the average, the best and the form the site promises. */
export async function sendMine(St, p) {
  const acc = A.account();
  const hi = acc && acc.hi !== null && acc.hi !== undefined ? acc.hi : null;
  const T = makeTheme(appTheme());
  const name = (S.me() || {}).name || p.name;
  const choice = { key: "mine", label: "Your season", sub: `${plural(p.played, "round")} · ${fix(p.avgPts)} points a round`,
    render: () => sized(T, name, "My season", Tz => statsMinePoster(St, p, Tz, { extras: S.statsOnImages(), hi, name })) };
  await previewSheet({ title: "Your season", lead: name, choices: [choice], more: false });
}
