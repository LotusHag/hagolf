// One league, as a front page rather than a filing cabinet. The landing says what happened last time out,
// where you stand and whether you moved, then the whole field as ruled rows. Everything else -- a day, a
// player, a rivalry, the field's numbers, running the league -- is a screen of its own under the league's
// own hash, so the back button works and a table can be linked to. No tab row renders anywhere in here.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { brandField } from "./partner.js";
import { page, bind, esc, go, toast, ui, plural, firstName, inits, courseTitle, ordinal, fmtDate, shortDate, resumeHash, roundWhere, roundClub, roundLoop, sect, sectRaw, tip, h2tip, infoBtn, sheet, confirmSheet, shareLink, qrHtml, avatar, themeRadios, bindChips, appTheme, leagueTheme, themePin, leagueLookName, swatchStrip, paint, themeHere, app, iconBtn, ICONS, leagueBadge , onDesk} from "../ui.js";
import { headToHead, leagueCards, leagueStats, fmtToPar, fmtIndex, fix } from "../model.js";
import { ANIMALS, FIELDS, choices, crestOf, crestKey, swatchOf, isCrest } from "../avatar.js";
import { seasonOf, seasonName, currentSeason, shownSeason, seasonRounds, FORMAT_NAMES, FORMAT_MODE, FORMAT_BLURB, FORMAT_NOTES, MATCH_BASIS, ELO_BASIS, H2H_BASES, basisRow, basisWord, basisGame, basisTaker, leagueResults, standingsFor, standingsTable, boardLine, decidingValue, dayBoard, sinceLast, isMyRow, myRow, boardOverTime, climbs, matchSentence } from "./formats.js";
import { leagueStatsBody, leaguePlayerBody, tapeRow, basisSheetBody } from "./stats.js";
import { claimSheet } from "./gate.js";
import { sendTable, sendSeason, sendDay } from "../images.js";
import { comingUp, eventRow, newEvent } from "./event.js";

/** Whether this phone's account runs the league. */
export function runsIt(g) {
  const me = S.myAccount();
  if (!me) return false;
  if (!g.owner || g.owner === me) return true;
  const m = S.myMembership(g.id);
  return !!m && ["owner", "organiser"].includes(m.role);
}

// ---------------------------------------------------------------- inviting
export async function inviteSheet(g) {
  if (!A.signedIn()) return toast("Sign in to invite people");
  const friends = F.held().friends;
  const runs = runsIt(g);
  const v = await sheet({ title: `Invite people to ${g.name}`, lead: "Friends get it in their inbox. A link works for anyone: paste it in the group chat.",
    body: friends.length ? `<div class="list">${friends.map(f => `<label style="margin:0;font:inherit"><span class="lead">${avatar(f.name, "", f.look)}<div><div class="name">${esc(f.name)}</div></div></span><input type="checkbox" name="fr" value="${esc(f.id)}"></label>`).join("")}</div>` : "",
    actions: [...(friends.length ? [{ label: "Invite ticked friends", value: "friends", kind: "primary" }] : []),
      { label: runs ? "Share a link for the group" : "Share an invite link", value: "link", kind: friends.length ? "" : "primary" },
      { label: "Show a QR code", value: "qr" }, { label: "Cancel", value: "no" }],
    onOpen: el => { window.__sheetEl = el; } });
  const ids = window.__sheetEl ? [...window.__sheetEl.querySelectorAll("input[name=fr]:checked")].map(i => i.value) : [];
  window.__sheetEl = null;
  if (v === "friends") {
    if (!ids.length) return toast("Tick at least one friend");
    let n = 0;
    for (const id of ids) { try { await F.inviteFriend(g.id, id); n++; } catch (e) { toast(e.message, 4000); } }
    if (n) toast(`Invited ${plural(n, "friend")}`);
  } else if (v === "link" || v === "qr") {
    try {
      const r = await F.inviteLink(g.id, runs);
      if (v === "link") await shareLink(r.url, `Join ${g.name} on Hagolf`, `Join ${g.name} on Hagolf`);
      else await sheet({ title: g.name, lead: runs ? "Anyone who scans this joins. It works for 30 days; reset it under Settings." : "This link works once, for the person who scans it.", body: `${qrHtml(r.url)}<div class="linkbox">${esc(r.url)}</div>`, actions: [{ label: "Done", value: "ok", kind: "primary" }] });
    } catch (e) { toast(e.message, 5000); }
  }
}

async function boardShare(g, kind) {
  const v = await sheet({ title: "Share", lead: g.name, body: `<div class="list">
      ${leagueCards(leagueResults(g, shownSeason(g)).Ms).length ? `<button data-sheet="table"><span class="lead">${ICONS.image}<div><div class="name">Send the table</div><div class="muted small">An image for the group chat, seen before it goes</div></div></span><span class="chev">›</span></button>` : ""}
      <button data-sheet="link"><span class="lead">${ICONS.link}<div><div class="name">Send a link to the board</div><div class="muted small">Anyone can read it, no sign-in</div></div></span><span class="chev">›</span></button>
      <button data-sheet="images"><span class="lead">${ICONS.chart}<div><div class="name">Other images…</div><div class="muted small">Every table and the season's sheets, in any look</div></div></span><span class="chev">›</span></button></div>` });
  if (v === "table") return sendTable(g.id, kind);
  if (v === "images") return go(`#leagueimages/${g.id}/standings:${kind}`);
  if (v !== "link") return;
  if (!g.token || !g.visibility || g.visibility === "private") {
    const ok = await confirmSheet("Share the board?", "Anyone with the link can read the table, without signing in. Reading is not joining.", { label: "Make it readable by link" });
    if (!ok) return;
    try { const r = await F.setVisibility(g.id, { visibility: "link" }); Object.assign(g, { visibility: r.visibility, token: r.token }); S.afterPull(); } catch (e) { return toast(e.message, 5000); }
  }
  await shareLink(`${location.origin}${location.pathname}#board/${g.token}`, `${g.name} on Hagolf`, `The ${g.name} table`);
}

// ---------------------------------------------------------------- the pieces every view shares
/** Everything a view needs, computed once: a league is expensive enough that twice is worth avoiding. */
function ctx(g) {
  const { Ms, members } = leagueResults(g, shownSeason(g));
  const formats = S.cleanFormats(g.formats);
  const kind = formats.includes(ui.boardOf[g.id]) ? ui.boardOf[g.id] : formats[0];
  return { g, gid: g.id, Ms, members, formats, kind, me: S.me(), runs: runsIt(g) };
}

const cardKey = c => encodeURIComponent(c.key ?? c.id);
/** Where a league member's own page lives: a contact has one, an account that claimed them has another. */
const personHash = id => (S.state.players.find(x => x.id === id && !x.deleted) ? `#player/${id}` : `#person/${id}`);
// club first, loop second: "18 holes" alone does not say where the day was
const dayWhere = c => (c.course && (c.course.unlisted ? c.course.loop || c.course.name : courseTitle(c.course))) || c.name || "";

/** Invite, share and (for whoever runs it) the settings, as icons in the header. */
const headActions = runs => iconBtn("invite", "friend", "Invite people") + iconBtn("share-board", "share", "Share and images") + (runs ? iconBtn("lgsettings", "settings", "Settings") : "");

/** Board, Days, Numbers, Head to head, Members: the parts of a society, one tap each. */
const segs = (gid, on) => `<div class="filter lsegs">${[["", "Board"], ["days", "Days"], ["stats", "Numbers"], ["vs", "Head to&nbsp;head"], ["members", "Members"]]
  .map(([v, l]) => `<a href="#league/${gid}${v ? `/${v}` : ""}" class="${on === v ? "on" : ""}">${l}</a>`).join("")}</div>`;

function shell(g, title, body, { back = "#leagues", keepScroll = false, runs = runsIt(g), seg = null, wide = false, gear = true } = {}) {
  const season = seg !== null && seg !== "members" && g.seasonStart ? `<p class="center"><button class="btn small" data-act="season">Season ${esc(seasonName(g, shownSeason(g)))} ›</button></p>` : "";
  page(title, `${seg !== null ? segs(g.id, seg) : ""}${season}${body}`, { back, actions: headActions(runs && gear), bell: false, keepScroll, wide });
}

/** Today: the society's day card, or the way to start it. One card a day, every group on it. */
function todayCard(C) {
  const today = S.today();
  const day = S.rounds().find(r => r.leagueId === C.gid && r.date === today && r.status !== "done");
  if (day && day.event) return `<div class="rows">${eventRow(day)}</div>`;
  if (day) {
    const seated = !!S.mySeat(day), n = day.entries.filter(e => e.role !== "team").length;
    return `<div class="card todaycard"><div><div class="k caps">Today</div><div class="name">${esc(roundWhere(day))}</div><div class="muted small">${plural(n, "player")} · ${plural(new Set(day.entries.map(e => e.group || 1)).size, "group")}</div></div>
      ${seated ? `<a class="btn primary" href="${resumeHash(day)}">Open</a>` : `<button class="btn primary" data-act="dayjoin" data-rid="${esc(day.id)}">I'm playing</button>`}</div>`;
  }
  return `<button class="card todaycard start" data-act="play-today"><div><div class="k caps">Playing today?</div><div class="name">Start the society's card</div><div class="muted small">Every group on one card, live for everyone</div></div><span class="chev">›</span></button>`;
}

// ---------------------------------------------------------------- the board
/**
 * One standings row. Three things across -- where they are, who they are, and the one number the league is
 * decided on -- with everything that used to be a column said underneath in words.
 */
function boardRow(C, r, move, Sx) {
  const L = boardLine(C.kind, r, C.g);
  const mine = isMyRow(r, C.me);
  const d = move && move.was ? (move.was.has(r.id) ? move.was.get(r.id) - r.place : null) : undefined;
  const arrow = d === undefined ? "" : d === null ? `<i class="mv new">new</i>`
    : d > 0 ? `<i class="mv up">▲${d}</i>` : d < 0 ? `<i class="mv dn">▼${-d}</i>` : `<i class="mv"></i>`;   // held its place: nothing shown, the width kept so the points line up
  return `<a class="hrow lrow${mine ? " me" : ""}${r.place <= 3 ? " pod" : ""}" href="#league/${C.gid}/p/${esc(r.id)}" data-flip="${esc(r.id)}">
    <span class="lp num">${r.place}</span>${C.g.showGolfers ? avatar(r.name, "", F.lookOf(r.id)) : ""}
    <span class="t"><b>${esc(r.name)}</b><span>${esc(L.sub)}</span></span>
    ${arrow}<span class="v num">${esc(L.value)}<small class="u">${esc(L.unit)}</small></span></a>`;
}

/**
 * Who is winning and by how much: the one fact a table of totals makes you do arithmetic for. Your own
 * place is not repeated here, because the strip above the board already carries it with its arrow.
 */
function stateOfPlay(C, Sx) {
  const [a, b] = Sx.rows;
  if (!a) return "";
  const mine = myRow(Sx.rows, C.me);
  let lead;
  if (!a.played) return `<p class="story">No card has been returned in this society yet.</p>`;
  if (!b || !b.played) lead = `${esc(firstName(a.name))} is the only player with a card`;
  else {
    const d = Math.abs(decidingValue(C.kind, a) - decidingValue(C.kind, b));
    lead = d === 0 ? `${esc(firstName(a.name))} leads ${esc(firstName(b.name))} on countback`
      : `${esc(firstName(a.name))} leads by ${d}`;
  }
  const you = mine || !b ? "" : ` ${plural(Sx.rows.length, "player")} have a card.`;
  return `<p class="story">${lead}.${you}</p>`;
}

/** The day the league last played, as the whole field that walked it rather than one group's sheet. */
function lastDay(C, move, cards) {
  if (!move) return "";
  const c = move.last;
  const D = dayBoard(C.kind, c);
  const board = D.rows.filter(p => p.id === null || C.members.includes(p.id));
  const m = (c.matches || [])[0];
  if (!board.length && m) {
    return `<div class="panel lastout"><section class="inplay"><div class="rule"></div>
      <div class="k">Last time out · match play</div>
      <h1>${esc(m.leader ? m.sides[m.leader].map(firstName).join(" & ") : "Halved")}</h1>
      <p class="where">${esc([dayWhere(c), fmtDate(c.date)].filter(Boolean).join(" · "))}</p></section>
    <a class="thru caps dayl" href="#league/${C.gid}/day/${cardKey(c)}">${esc(matchSentence(m))} ›</a></div>`;
  }
  if (!board.length) return "";
  // one card in the league means the day and the season are the same list; printing it twice says nothing
  const top = cards > 1 ? board.slice(0, 3) : [];
  const win = board[0];
  const shared = board.filter(p => D.value(p) === D.value(win));
  const who = shared.length > 1 ? shared.slice(0, 2).map(p => firstName(p.name)).join(" & ") : firstName(win.name);
  return `<div class="panel lastout"><section class="inplay"><div class="rule"></div>
      <div class="k">Last time out${shared.length > 1 ? " · shared" : ""}</div>
      <h1>${esc(who)}</h1>
      <p class="where">${esc([dayWhere(c), fmtDate(c.date)].filter(Boolean).join(" · "))}</p></section>
    ${top.length ? `<div class="board">${top.map((x, i) => `<div><span class="p">${i + 1}</span><span class="who">${esc(x.name)}</span><span class="v">${esc(D.value(x))}</span></div>`).join("")}</div>` : ""}
    <a class="thru caps dayl" href="#league/${C.gid}/day/${cardKey(c)}">${plural(board.length, "player")} · the whole day ›</a></div>`;
}

/** The league's face, and your own place under it, so nobody has to find themselves in the table. */
function leagueHero(C, Sx, move, nCards) {
  const r = myRow(Sx.rows, C.me);
  const fmts = C.formats.map(f => FORMAT_NAMES[f]).join(" · ");
  const id = `<div class="lid">${leagueBadge(C.g, "big")}<div><h1>${esc(C.g.name)}</h1>
    <p class="where">${esc([fmts, plural(nCards, "card"), plural(Sx.rows.length, "player")].join(" · "))}</p></div></div>`;
  if (!r) return `<div class="panel hero lhero">${id}</div>`;
  const L = boardLine(C.kind, r, C.g);
  const d = move && move.was && move.was.has(r.id) ? move.was.get(r.id) - r.place : null;
  const mv = d === null ? "–" : d > 0 ? `<i class="mv up">▲${d}</i>` : d < 0 ? `<i class="mv dn">▼${-d}</i>` : "=";
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const suffix = ordinal(r.place).slice(String(r.place).length);
  return `<div class="panel hero lhero">${id}
    <a class="youline" href="#league/${C.gid}/p/${esc(r.id)}"><span class="caps">You</span><div class="stats">
      ${tile(`${r.place}<small>${suffix}</small>`, `of ${Sx.rows.length}`)}${tile(esc(L.value), esc(L.unit) || "&nbsp;")}${tile(mv, "last card")}</div><span class="chev">›</span></a></div>`;
}

// ---------------------------------------------------------------- the climb
const CLIMB_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18"/><path d="m4 16 5-5 4 3 7-8"/></svg>`;
const climbBtn = (kind, Ms) => climbs(kind) && datesIn(Ms) >= 2
  ? `<button type="button" class="gbtn" data-act="board-graph" data-kind="${esc(kind)}" aria-label="${esc(FORMAT_NAMES[kind])} over time">${CLIMB_ICON}</button>` : "";
const datesIn = Ms => new Set(Ms.map(M => M.date).filter(Boolean)).size;

/**
 * A gentle curve through the points (monotone cubic, Fritsch–Carlson): it never overshoots a point, so a day
 * sat out stays flat and a line never dips below the floor it climbed off.
 */
function smoothPath(pts) {
  const n = pts.length, f = v => v.toFixed(1);
  if (n < 2) return n ? `M${f(pts[0][0])},${f(pts[0][1])}` : "";
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let out = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    out += `C${f(x0 + h)},${f(y0 + m[i] * h)} ${f(x1 - h)},${f(y1 - m[i + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return out;
}

/**
 * Which days get a date under them: at most six, evenly spaced. A step that lands on both the first and the
 * last day is preferred; where the count of days allows none with three or more, the step starts on day one
 * and stops short of the end rather than squeezing an odd gap in before it.
 */
function dateTicks(n, max = 6) {
  if (n <= max) return [...Array(n).keys()];
  const count = s => Math.floor((n - 1) / s) + 1;
  let s = 1;
  while (count(s) > max) s++;
  const ends = Array.from({ length: n - s }, (_, k) => s + k).find(t => (n - 1) % t === 0 && count(t) >= 3);
  const step = ends || s;
  return Array.from({ length: count(step) }, (_, k) => k * step);
}

/**
 * Every player's score after each day. Nothing but the lines, the floor they rise off and a name at the end of
 * each: one line is followed in the accent and the rest are the field behind it.
 */
function climbSvg(T, pick) {
  const n = T.days.length;
  const vals = T.players.flatMap(p => p.vals).filter(v => v !== null);
  const hi = Math.max(1, ...vals), lo = Math.min(0, ...vals);
  const W = 340, H = 210, padL = 6, padR = 78, padT = 12, padB = 24;
  const X = i => padL + (i / (n - 1)) * (W - padL - padR);
  const Y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const f = x => x.toFixed(1);
  const lineOf = p => {
    const first = p.vals.findIndex(v => v !== null);
    // someone who joins later climbs off the floor from the day before, not out of thin air
    const pts = first > 0 ? [[X(first - 1), Y(0)]] : [];
    p.vals.forEach((v, i) => { if (v !== null) pts.push([X(i), Y(v)]); });
    return smoothPath(pts);
  };
  // the end labels are stacked out of each other's way; where they cannot all fit, the followed one and the top of the table are named
  const room = Math.floor((H - padT - padB) / 12) + 1;
  const named = T.players.filter(p => p.id === pick || p.place <= room - 1).slice(0, room);
  const tags = named.map(p => ({ p, y: Y(p.vals[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i - 1].y + 12);
  if (tags.length) tags[tags.length - 1].y = Math.min(tags[tags.length - 1].y, H - padB);
  for (let i = tags.length - 2; i >= 0; i--) tags[i].y = Math.min(tags[i].y, tags[i + 1].y - 12);
  const short = s => (s.length > 9 ? `${s.slice(0, 8)}…` : s);
  const dates = dateTicks(n).map(i => `<text class="cdate" x="${f(X(i))}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(shortDate(T.days[i]))}</text>`).join("");
  const order = [...T.players].sort((a, b) => (a.id === pick) - (b.id === pick));
  return `<svg class="climb" viewBox="0 0 ${W} ${H}" role="img" aria-label="Each player's score after every day, oldest on the left">
    <line class="cfloor" x1="${padL}" y1="${f(Y(0))}" x2="${W - padR}" y2="${f(Y(0))}"></line>
    ${order.map(p => `<g class="cline${p.id === pick ? " on" : ""}" data-who="${esc(p.id)}"><path class="chit" d="${lineOf(p)}"></path>
      <path d="${lineOf(p)}"></path><title>${esc(p.name)}</title></g>`).join("")}
    ${tags.map(({ p, y }) => `<text class="ctag${p.id === pick ? " on" : ""}" data-who="${esc(p.id)}" x="${f(W - padR + 8)}" y="${f(y + 3.5)}">${esc(short(firstName(p.name)))} <tspan>${esc(String(p.vals[n - 1]))}</tspan></text>`).join("")}
    ${dates}</svg>`;
}

async function climbSheet(C, kind) {
  const T = boardOverTime(C.g, C.Ms, C.members, kind);
  if (T.days.length < 2 || !T.players.length) return;
  const mine = T.players.find(p => isMyRow(p, C.me));
  let pick = (mine || T.players[0]).id;
  const foot = () => {
    const p = T.players.find(x => x.id === pick), n = T.days.length;
    return `<b>${esc(p.name)}</b> · ${esc(String(p.vals[n - 1]))} after ${plural(p.played.filter(Boolean).length, "day")}`;
  };
  await sheet({ title: FORMAT_NAMES[kind],
    body: `<div class="climbwrap">${climbSvg(T, pick)}</div><p class="muted small climbfoot">${foot()}</p>`,
    onOpen: el => el.addEventListener("click", ev => {
      const w = ev.target.closest("[data-who]");
      if (!w || w.dataset.who === pick) return;
      pick = w.dataset.who;
      el.querySelector(".climbwrap").innerHTML = climbSvg(T, pick);
      el.querySelector(".climbfoot").innerHTML = foot();
    }) });
}

/** The sentences that are only true sometimes, and are therefore only drawn when they are. */
function boardNotes(C, Sx) {
  const out = [];
  const val = r => decidingValue(C.kind, r);
  const ranked = Sx.rows.filter(r => r.played);
  if (!(C.kind in ELO_BASIS) && ranked.some((r, i) => i && val(r) === val(ranked[i - 1]))) out.push("Equal totals were separated on countback.");
  if (C.g.bestN && !(C.kind in MATCH_BASIS) && !(C.kind in ELO_BASIS)) {
    const top = Sx.rows[0];
    out.push(top && top.counted_n >= C.g.bestN
      ? `Each player's best ${C.g.bestN} cards count. ${esc(firstName(top.name))} is counting ${top.counted_n} of ${top.played}.`
      : `Each player's best ${C.g.bestN} cards count — nobody has ${C.g.bestN} yet, so every card is counting.`);
  }
  return out.length ? `<p class="muted small bnotes">${out.join(" ")}</p>` : "";
}

/** A day of yours this league has not got, offered where it is noticed rather than buried under a tab. */
function attachPrompt(C) {
  const attached = new Set(S.leagueRoundIds(C.gid));
  const loose = S.rounds().filter(r => r.status === "done" && !attached.has(r.id) && S.iPlayed(r));
  if (!loose.length) return "";
  const byDate = loose.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const d = byDate[0].date;
  const recent = d && (Date.now() - new Date(`${d}T12:00:00`).getTime()) < 15 * 864e5;
  if (!recent) return "";   // an old round is found under Running the league, not offered for ever on the board
  const sameDay = d ? byDate.filter(r => r.date === d) : [byDate[0]];
  return `<button class="banner accent" data-act="attach-day" data-date="${esc(d || "")}" data-rid="${esc(byDate[0].id)}">
    You played ${esc(d ? fmtDate(d) : roundWhere(byDate[0]))} — add ${sameDay.length > 1 ? `${plural(sameDay.length, "sheet")}` : "it"} to this society?</button>`;
}

function boardView(C, keepScroll) {
  const { g, gid } = C;
  ui.statsWho[gid] = "";   // the stats poster reads this; the board is the field
  if (!C.Ms.length) return emptyBoard(C);
  const Sx = standingsFor(g, C.Ms, C.members, C.kind);
  const move = sinceLast(g, C.Ms, C.members, C.kind);
  const nCards = leagueCards(C.Ms).length;
  const pick = C.formats.length > 1
    ? `<button class="caps lfmt" data-act="board-pick">${esc(FORMAT_NAMES[C.kind])} <i aria-hidden="true">⌄</i></button>`
    : `<span class="caps">${esc(FORMAT_NAMES[C.kind])}</span>`;
  const SHOWN = 6;
  const shown = Sx.rows.length > SHOWN + 1 ? Sx.rows.slice(0, SHOWN) : Sx.rows;
  // the table, the last day and you; everything else about the league is one tap away under the menu
  const body = `
    ${todayCard(C)}
    ${claimBanner(C)}${attachPrompt(C)}
    ${leagueHero(C, Sx, move, nCards)}
    <section class="panel lpanel"><div class="ph">${ICONS.trophy}${pick}${climbBtn(C.kind, C.Ms)}${infoBtn(FORMAT_NAMES[C.kind], FORMAT_NOTES[C.kind])}</div>
    ${nCards > 1 ? stateOfPlay(C, Sx) : ""}
    ${Sx.rows.length ? `<div class="rows lboard">${shown.map(r => boardRow(C, r, move, Sx)).join("")}
      ${shown.length < Sx.rows.length ? `<a class="hrow more" href="#league/${gid}/table/${C.kind}"><span class="t"><b>The whole table</b><span>${plural(Sx.rows.length, "player")}, every column</span></span><span class="chev">›</span></a>` : ""}</div>`
      : `<p class="muted center" style="margin:22px 0">${C.kind in ELO_BASIS ? "Nobody has a rating yet — it needs two of the society's players out on the same day." : C.kind in MATCH_BASIS ? `Nobody has played a match yet — a ${esc(FORMAT_NAMES[C.kind])} table needs two of its players out on the same day.` : "Nothing to rank yet."}</p>`}
    ${boardNotes(C, Sx)}
    ${Sx.rows.length ? `<div class="sendrow"><button class="sendlink" data-act="send-table">Send the table</button></div>` : ""}</section>
    ${lastDay(C, move, nCards)}`;
  shell(g, g.name, body, { keepScroll, runs: C.runs, seg: "" });
  wireBoard(C, Sx);
  freshGolfers(C, `#league/${gid}`, () => boardView(ctx(g), true));
}

/** A board that shows golfers asks for the members' latest ones, and draws again if any changed. */
function freshGolfers(C, hash, redraw) {
  if (!C.g.showGolfers || !A.signedIn()) return;
  F.membersOf(C.gid).then(r => { if (r.looksChanged && location.hash === hash) redraw(); }).catch(() => {});
}

/**
 * The whole table, with the page to itself. A board squeezed between a hero and a row of doors is the thing
 * that felt claustrophobic, so here it gets the room: the name of the table at the top is also how you change
 * which table you are reading, and nothing else competes with the rows.
 */
function tableView(C, fmt, keep = false) {
  const kind = C.formats.includes(fmt) ? fmt : C.kind;
  const Cx = { ...C, kind };
  if (!C.Ms.length) return emptyBoard(C);
  const Sx = standingsFor(C.g, C.Ms, C.members, kind);
  const move = sinceLast(C.g, C.Ms, C.members, kind);
  const mine = myRow(Sx.rows, C.me);
  const head = C.formats.length > 1
    ? `<button class="tblhead" data-act="table-pick">${esc(FORMAT_NAMES[kind])} <i aria-hidden="true">⌄</i></button>`
    : `<div class="tblhead one">${esc(FORMAT_NAMES[kind])}</div>`;
  shell(C.g, C.g.name, `
    <div class="tblbar">${head}${climbBtn(kind, C.Ms)}${infoBtn(FORMAT_NAMES[kind], FORMAT_NOTES[kind])}</div>
    ${C.formats.length > 1 ? `<p class="muted small" style="margin:0 4px 6px">${plural(C.formats.length, "way")} of scoring these rounds${mine ? ` · you are ${ordinal(mine.place)} here` : ""}. Tap the name to change it.</p>` : ""}
    ${stateOfPlay(Cx, Sx)}
    ${Sx.rows.length ? `<div class="rows lboard roomy">${Sx.rows.map(r => boardRow(Cx, r, move, Sx)).join("")}</div>`
      : `<p class="muted center" style="margin:22px 0">${kind in ELO_BASIS ? "Nobody has a rating yet — it needs two of the society's players out on the same day." : kind in MATCH_BASIS ? `Nobody has played a match yet — a ${esc(FORMAT_NAMES[kind])} table needs two of its players out on the same day.` : "Nothing to rank yet."}</p>`}
    ${boardNotes(Cx, Sx)}
    <div class="btnrow"><button class="btn small" data-act="board-cols">Every column ›</button>
      <button class="btn small" data-act="send-table" data-kind="${esc(kind)}">Send the table</button></div>`,
    { back: `#league/${C.gid}`, runs: C.runs, keepScroll: keep });
  freshGolfers(C, location.hash, () => tableView(ctx(C.g), fmt, true));
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "board-cols") return columnsSheet(Cx, Sx);
    if (b.dataset.act === "table-pick") {
      const v = await formatSheet(Cx);
      if (v) { ui.boardOf[C.gid] = v; go(`#league/${C.gid}/table/${v}`); }
    }
  });
}

/** Any member of the league, by name. The old screen had two selects; this is the same reach, one tap. */
async function pickMember(C, title, exclude) {
  const nameOf = id => { for (const M of C.Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };
  const list = C.members.filter(m => m !== exclude).sort((x, y) => nameOf(x).localeCompare(nameOf(y)));
  const v = await sheet({ title, lead: "Anybody who has played a round in this society.",
    body: `<div class="fmtpicks">${list.map(m => `<button class="fmtpick" data-sheet="${esc(m)}"><span><b>${esc(nameOf(m))}</b></span></button>`).join("")}</div>`,
    actions: [{ label: "Cancel", value: "no" }] });
  return v && v !== "no" ? v : null;
}

/** The pair the head-to-head opens on, named, so the menu says what is behind it. */
function h2hPair(C, Sx) {
  const mine = myRow(Sx.rows, C.me);
  const a = mine ? mine.id : (Sx.rows[0] && Sx.rows[0].id);
  const b = (Sx.rows.find(r => r.id !== a) || {}).id;
  if (!a || !b) return null;
  const them = Sx.rows.find(r => r.id === b);
  return { href: `#league/${C.gid}/vs/${a}/${b}`, sub: mine ? `You and ${firstName(them.name)}` : `${firstName(Sx.rows[0].name)} and ${firstName(them.name)}` };
}

/** Somebody has joined and the cards do not know which player is them. The prompt belongs where they are. */
function claimBanner(C) {
  if (!A.signedIn() || !C.me) return "";
  const m = S.myMembership(C.gid);
  return m && m.claim === "none" ? `<button class="banner accent" data-act="claim-me">Which player on these cards is you?</button>` : "";
}

function emptyBoard(C) {
  const { g, gid } = C;
  const attached = new Set(S.leagueRoundIds(gid));
  const loose = S.rounds().filter(r => r.status === "done" && !attached.has(r.id) && S.iPlayed(r)).length;
  const upcoming = comingUp().filter(r => r.leagueId === gid);
  shell(g, g.name, `
    <section class="inplay"><div class="rule"></div>
      <div class="k quiet">Nothing scored yet</div><h1>${esc(g.name)}</h1>
      <p class="where">${esc(C.formats.map(f => FORMAT_NAMES[f]).join(" · "))}${g.bestN ? ` · best ${g.bestN} count` : ""}</p></section>
    <button class="btn primary plate" data-act="new-in-league">Start today's card</button>
    ${sect("Or")}
    <div class="rows">
      <a class="hrow" href="#league/${gid}/rounds"><span class="t"><b>Add a round you already played</b>
        <span>${loose ? `${plural(loose, "finished round")} of yours ${loose === 1 ? "is" : "are"} not in this society` : "Nothing of yours is waiting"}</span></span><span class="chev">›</span></a>
    </div>
    ${upcoming.length || C.runs ? `${sect("Coming up")}<div class="rows">${upcoming.map(eventRow).join("")}${C.runs ? `<button class="hrow more" data-act="new-event"><span class="t"><b>New event</b><span>A date, a loop, the field, tee times and the draw</span></span></button>` : ""}</div>` : ""}`, { runs: C.runs });
  wireBoard(C, { rows: [] });
}

function wireBoard(C, Sx) {
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "board-pick") { const v = await formatSheet(C); if (v) { ui.boardOf[C.gid] = v; league(C.gid); } return; }
    if (act === "board-cols") return columnsSheet(C, Sx);
    if (act === "new-in-league") return playToday(C);
    if (act === "new-event") return newEvent(C.gid);
    if (act === "attach-day") {
      const d = b.dataset.date;
      const ids = d ? S.rounds().filter(r => r.status === "done" && r.date === d && S.iPlayed(r) && !S.leagueRoundIds(C.gid).includes(r.id)).map(r => r.id) : [b.dataset.rid];
      for (const id of ids) S.setLeagueRound(C.gid, id, true);
      toast(`Added ${plural(ids.length, "round")}`);
      return league(C.gid);
    }
    if (act === "claim-me") { try { const r = await F.candidatesOf(C.gid); await claimSheet(C.gid, r.candidates); league(C.gid); } catch (e) { toast(e.message, 5000); } }
  });
}

/**
 * How this league is scored, and where you are in each of the ways it keeps. The eight formats are two
 * choices -- what a hole or a round is settled on, and how that is paid out -- so the sheet says both.
 */
async function formatSheet(C) {
  const rowOf = f => {
    const T = standingsFor(C.g, C.Ms, C.members, f);
    const mine = myRow(T.rows, C.me);
    return `<button class="fmtpick${f === C.kind ? " on" : ""}" data-sheet="${f}">
      <span><b>${esc(FORMAT_NAMES[f])}</b><small>${esc(FORMAT_BLURB[f])}</small></span>
      ${mine ? `<i>you ${ordinal(mine.place)}</i>` : T.rows[0] ? `<i>${esc(firstName(T.rows[0].name))} leads</i>` : ""}</button>`;
  };
  const v = await sheet({ title: "How this society is scored",
    lead: "Every way this society keeps, and where you are in each. They are the same rounds read differently, so the places can disagree — that is the point.",
    body: `<div class="fmtpicks">${C.formats.map(rowOf).join("")}</div>`,
    actions: [{ label: "Cancel", value: "no" }] });
  return v && v !== "no" && C.formats.includes(v) ? v : null;
}

/** Every column of the table it is called on, as the app has always drawn it, with its own words under it. */
const columnsSheet = (C, Sx) => sheet({ title: FORMAT_NAMES[C.kind],
  body: `<div class="tscroll">${standingsTable(C.kind, Sx, C.g, C.me, "nowrap")}</div><div class="tipbody" style="margin-top:12px">${FORMAT_NOTES[C.kind]}</div>`,
  actions: [{ label: "Done", value: "ok", kind: "primary" }] });

// ---------------------------------------------------------------- the days
function daysView(C) {
  const cards = leagueCards(C.Ms).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const upcoming = comingUp().filter(r => r.leagueId === C.gid);
  const row = c => {
    const D = dayBoard(C.kind, c);
    const board = D.rows.filter(p => p.id === null || C.members.includes(p.id));
    const top = board[0];
    const mine = C.me ? board.find(p => isMyRow(p, C.me)) : null;
    const matches = (c.matches || []).map(matchSentence);
    return `<a class="hrow" href="#league/${C.gid}/day/${cardKey(c)}">
      <span class="t"><b>${esc(c.date ? fmtDate(c.date) : c.name)}</b>
        <span>${esc([dayWhere(c), top ? `${firstName(top.name)} ${D.value(top)} ${D.unit}` : "", board.length ? `${plural(board.length, "player")}` : "", ...matches].filter(Boolean).join(" · "))}</span></span>
      ${mine ? `<span class="v num">${esc(D.value(mine))}<small class="u">${esc(D.unit)}</small></span>` : `<span class="chev">›</span>`}</a>`;
  };
  shell(C.g, C.g.name, `
    ${tip("<p>A society counts by the day, not by the sheet a group handed in. Every round in this society with the same date on the same loop is one card, so two fourballs round the same nine on a Sunday are one field of eight rather than two fields of four.</p><p>That is what every table here is built on.</p>", "One card is one day")}
    ${upcoming.length || C.runs ? `<h2>Coming up</h2><div class="rows">${upcoming.map(eventRow).join("")}${C.runs ? `<button class="hrow more" data-act="new-event"><span class="t"><b>New event</b><span>A date, a loop, the field, tee times and the draw</span></span></button>` : ""}</div><h2>Played</h2>` : ""}
    ${cards.length ? `<div class="rows">${cards.map(row).join("")}</div>` : `<p class="muted center" style="margin:30px 0">No cards in this society yet.</p>`}
    <button class="btn primary big" data-act="new-in-league">Start today's card</button>
    ${C.runs || A.signedIn() ? `<div class="rows" style="margin-top:18px"><a class="hrow" href="#league/${C.gid}/rounds"><span class="t"><b>Add or take out a round</b><span>Every finished round, in this society or waiting to go in</span></span><span class="chev">›</span></a></div>` : ""}`,
    { back: "#leagues", runs: C.runs, seg: "days" });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (b && b.dataset.act === "new-in-league") return playToday(C);
    if (b && b.dataset.act === "new-event") return newEvent(C.gid);
  });
}

function dayView(C, key) {
  const want = key || "";   // router.js has already decoded it
  const c = leagueCards(C.Ms).find(x => String(x.key ?? x.id) === want);
  if (!c) return go(`#league/${C.gid}/days`);
  const D = dayBoard(C.kind, c);
  const board = D.rows.filter(p => p.id === null || C.members.includes(p.id));
  const move = sinceLast(C.g, C.Ms, C.members, C.kind);
  const isLast = move && String(move.last.key ?? move.last.id) === want;
  const changed = isLast && move.was ? movedOnTheDay(C, move) : "";
  const sheets = c.rounds || [];
  const matches = c.matches || [];
  shell(C.g, c.date ? fmtDate(c.date) : c.name, `
    <section class="inplay"><div class="rule"></div>
      <div class="k">${esc(dayWhere(c) || "The day")}</div>
      <h1>${esc(board[0] ? firstName(board[0].name) : matches[0] && matches[0].leader ? matches[0].sides[matches[0].leader].map(firstName).join(" & ") : matches[0] ? "Halved" : "No scores")}</h1>
      <p class="where">${esc([c.date ? fmtDate(c.date) : "", board.length ? plural(board.length, "player") : ""].filter(Boolean).join(" · "))}</p></section>
    ${board.length ? `<div class="rows lboard">${board.map((p, i) => `<${p.id ? "a" : "div"} class="hrow lrow${isMyRow(p, C.me) ? " me" : ""}"${p.id ? ` href="#league/${C.gid}/p/${esc(p.id)}"` : ""}>
      <span class="lp num">${i + 1}</span><span class="t"><b>${esc(p.name)}</b><span>${esc([p.gross === null ? "no return" : `${p.gross} gross`, p.topar === null || D.basis === "gross" ? "" : fmtToPar(p.topar), D.basis !== "points" ? `${p.pts} pts` : ""].filter(Boolean).join(" · "))}</span></span>
      <span class="v num">${esc(D.value(p))}<small class="u">${esc(D.unit)}</small></span></${p.id ? "a" : "div"}>`).join("")}</div>` : ""}
    ${board.length || matches.length ? `<div class="sendrow"><button class="sendlink" data-act="send-day">Send the day</button></div>` : ""}
    ${matches.length ? `${sect("Match play")}<div class="rows">${matches.map(m => `<a class="hrow" href="#review/${m.roundId}"><span class="t"><b>${esc(`${m.sides.A.join(" & ")} v ${m.sides.B.join(" & ")}`)}</b><span>${esc(m.result || m.status)}</span></span><span class="chev">›</span></a>`).join("")}</div>` : ""}
    ${changed}
    ${sect(sheets.length > 1 ? "The sheets handed in" : "The card")}
    <div class="rows">${sheets.map(M => `<a class="hrow" href="#review/${M.id}"><span class="t"><b>${esc(M.name)}</b><span>${plural(M.players.length, "player")}</span></span><span class="chev">›</span></a>`).join("")}</div>`,
    { back: isLast ? `#league/${C.gid}` : `#league/${C.gid}/days`, runs: C.runs });
  bind(async ev => {
    if (await common(C, ev)) return;
    if (ev.target.closest("[data-act=send-day]")) return sendDay(C.gid, dayImage(C, c, D, board, isLast ? move : null), sheets.map(M => M.id));
  });
}

/** The day as dayPoster draws it: the field as the screen ranks it, the matches, and what it did to the table. */
function dayImage(C, c, D, board, move) {
  const line = p => [p.gross === null ? "no return" : `${p.gross} gross`, p.topar === null || D.basis === "gross" ? "" : fmtToPar(p.topar), D.basis !== "points" ? `${p.pts} pts` : ""].filter(Boolean).join("  ·  ");
  const now = move && move.was ? standingsFor(C.g, C.Ms, C.members, C.kind).rows : [];
  const moved = now.filter(r => move.was.has(r.id) && move.was.get(r.id) !== r.place)
    .sort((a, b) => Math.abs(move.was.get(b.id) - b.place) - Math.abs(move.was.get(a.id) - a.place)).slice(0, 5)
    .map(r => ({ name: r.name, from: move.was.get(r.id), to: r.place }));
  const top = board[0];
  return {
    kind: C.kind, title: c.date ? fmtDate(c.date) : c.name, kicker: C.g.name,
    sub: [dayWhere(c), board.length ? plural(board.length, "player") : ""].filter(Boolean).join("  ·  "),
    right: `${FORMAT_NAMES[C.kind]}\n${D.basis === "points" ? "Stableford points" : D.basis === "gross" ? "gross strokes against par" : "net strokes against par"}`,
    unit: D.unit === "pts" ? "Points" : D.unit === "net" ? "Net" : "Gross",
    rows: board.map((p, i) => ({ place: i + 1, name: p.name, value: D.value(p), sub: line(p) })),
    matches: (c.matches || []).map(matchSentence), moved, table: moved.length ? `${FORMAT_NAMES[C.kind]}, before the day and after it` : "",
    says: top ? `${firstName(top.name)} first on ${D.value(top)} ${D.unit}` : plural((c.matches || []).length, "match", "matches"),
  };
}

/** What the last day did to the table: only ever drawn on the day that actually moved it. */
function movedOnTheDay(C, move) {
  const now = standingsFor(C.g, C.Ms, C.members, C.kind).rows;
  const climbed = now.map(r => ({ r, d: move.was.has(r.id) ? move.was.get(r.id) - r.place : null }))
    .filter(x => x.d !== null && x.d !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
  if (!climbed.length) return "";
  return `${h2tip("What it changed", `Where everybody stood in the ${esc(FORMAT_NAMES[C.kind])} table before this card, against where they stand after it.`)}
    <div class="rows">${climbed.map(({ r, d }) => `<a class="hrow" href="#league/${C.gid}/p/${esc(r.id)}">
      <span class="t"><b>${esc(r.name)}</b><span>${ordinal(move.was.get(r.id))} to ${ordinal(r.place)}</span></span>
      ${d > 0 ? `<i class="mv up">▲${d}</i>` : `<i class="mv dn">▼${-d}</i>`}</a>`).join("")}</div>`;
}

// ---------------------------------------------------------------- one player, here
function playerView(C, pid, keep = false) {
  if (!C.members.includes(pid)) return go(`#league/${C.gid}`);
  ui.statsWho[C.gid] = pid;        // the stats poster takes its subject from here
  const Sx = standingsFor(C.g, C.Ms, C.members, C.kind);
  const row = Sx.rows.find(r => r.id === pid);
  const St = leagueStats(C.Ms, C.members);
  const p = St.players.find(x => x.id === pid);
  if (!p) return go(`#league/${C.gid}`);
  const L = row ? boardLine(C.kind, row, C.g) : null;
  const hi = (S.state.players.find(x => x.id === pid) || {}).hi;
  const others = Sx.rows.filter(r => r.id !== pid);
  shell(C.g, p.name, `
    <section class="inplay"><div class="rule"></div>
      <div class="k">${esc(FORMAT_NAMES[C.kind])}</div><h1>${esc(p.name)}</h1>
      <p class="where">${esc([row ? `${ordinal(row.place)} of ${Sx.rows.length}` : "not in this table", L ? `${L.value} ${L.unit}` : "", hi === undefined ? "" : `index ${fmtIndex(Number(hi))}`].filter(Boolean).join(" · "))}</p></section>
    ${leaguePlayerBody(C.g, C.Ms, C.members, pid)}
    ${sect(`${firstName(p.name)} against`)}
    <div class="rows">${others.slice(0, 5).map(o => `<a class="hrow" href="#league/${C.gid}/vs/${esc(pid)}/${esc(o.id)}">
      <span class="t"><b>${esc(o.name)}</b><span>${ordinal(o.place)} in this table</span></span><span class="chev">›</span></a>`).join("")}
      ${others.length > 5 ? `<button class="hrow" data-act="pick-rival"><span class="t"><b>Somebody else</b><span>${plural(others.length - 5, "more player")} in this society</span></span><span class="chev">›</span></button>` : ""}</div>
    ${sect("Elsewhere")}
    <div class="rows">
      <a class="hrow" href="${personHash(pid)}"><span class="t"><b>Everything they have played</b><span>Every round, in every society</span></span><span class="chev">›</span></a>
      <button class="hrow" data-act="send-season"><span class="t"><b>Send ${esc(firstName(p.name))}'s season</b><span>One image: the form, the best, against the rest</span></span><span class="chev">›</span></button>
    </div>`,
    { back: `#league/${C.gid}`, runs: C.runs, keepScroll: keep });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "rivalbasis-open") {
      const v = await sheet({ title: "Compare them on", lead: "The same rounds, read three ways.", body: basisSheetBody(ui.basis[C.gid] || "points"), actions: [{ label: "Cancel", value: "no" }] });
      if (v && v !== "no") { ui.basis[C.gid] = v; playerView(C, pid, true); }
      return;
    }
    if (b.dataset.act === "pick-rival") {
      const v = await pickMember(C, `${firstName(p.name)} against`, pid);
      if (v) go(`#league/${C.gid}/vs/${pid}/${v}`);
      return;
    }
    if (b.dataset.act === "ninetab") { ui.nineTab[C.gid] = b.dataset.slug; return playerView(C, pid, true); }
    if (b.dataset.act === "send-season") return sendSeason(C.gid, pid, C.kind);
  });
}

// ---------------------------------------------------------------- two players
// the two golfers face each other across the score
const vsFace = (C, id, name, mark, side, facing) => C.g.showGolfers && F.lookOf(id) ? avatar(name, "big", F.lookOf(id), facing)
  : `<span class="vsdisc ${side}${mark.length > 2 ? " long" : ""}">${esc(mark)}</span>`;
// Maurits van 't Hag and Maxim van Wijk are both MV: then each wears as much of the first name as tells them apart
function twoMarks(x, y) {
  const a = inits(x), b = inits(y);
  if (a !== b) return [a, b];
  const fx = firstName(x), fy = firstName(y);
  for (let n = 2; n <= 4; n++) if (fx.slice(0, n).toLowerCase() !== fy.slice(0, n).toLowerCase()) return [fx.slice(0, n), fy.slice(0, n)];
  return [`${a}1`, `${b}2`];
}

function vsView(C, a, b) {
  const nameOf = id => { for (const M of C.Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };
  if (!C.members.includes(a) || !C.members.includes(b) || a === b) {
    const pair = C.Ms.length ? h2hPair(C, standingsFor(C.g, C.Ms, C.members, C.kind)) : null;
    if (!pair) { shell(C.g, C.g.name, `<p class="muted center" style="margin:30px 0">Head-to-heads appear once two players share a round in this society.</p>`, { runs: C.runs, seg: "vs" }); return bind(ev => common(C, ev)); }
    return go(pair.href);
  }
  const h2hKind = C.formats.find(f => f in MATCH_BASIS);
  const basis = H2H_BASES.some(([k]) => k === ui.basis[C.gid]) ? ui.basis[C.gid] : (h2hKind ? MATCH_BASIS[h2hKind] : "points");
  const H = headToHead(C.Ms, a, b, basis);
  const A_ = nameOf(a), B_ = nameOf(b), fA = firstName(A_), fB = firstName(B_), [mA, mB] = twoMarks(A_, B_);
  const [, basisName, roundWord, holeWord] = basisRow(basis);
  const head = `${sectRaw(`<button class="caps lfmt" data-act="vsbasis">${esc(basisName)} <i aria-hidden="true">⌄</i></button>`,
    infoBtn("Match play or stroke play?", `<p>This page keeps two scores, and they are two different games. Both are settled on ${esc(basisName.toLowerCase())}.</p>
      <p><b>Stroke play</b> settles the big score at the top: each round they played together goes to ${esc(roundWord)} that day. <b>Match play</b> settles the hole-by-hole part: every hole is its own contest, won by ${esc(holeWord)}, added up as one long match.</p>
      <p>${h2hKind ? `This society keeps a ${esc(FORMAT_NAMES[h2hKind])} table, so that is what it opens on.` : "A round only one of them finished a card for goes to the one who did, the way a hole does."}</p>`))}`;
  const sides = `<div class="vspick">
    <button class="vsname-btn" data-act="pick-a">${esc(A_)} <i aria-hidden="true">⌄</i></button>
    <button class="swapb" data-act="vsswap" title="Swap">&#8646;</button>
    <button class="vsname-btn" data-act="pick-b">${esc(B_)} <i aria-hidden="true">⌄</i></button></div>`;
  let body;
  if (!H.rounds.length) body = `${sides}${head}<p class="muted center" style="margin:30px 0">${esc(fA)} and ${esc(fB)} have not played a round together in this society yet.</p>`;
  else {
    const tot = H.winsA + H.ties + H.winsB;
    const pc = n => `${(n / tot) * 100}%`;
    const verdict = H.winsA === H.winsB ? `All square at ${H.winsA}&#8211;${H.winsB}` : `${esc(H.winsA > H.winsB ? fA : fB)} leads ${Math.max(H.winsA, H.winsB)}&#8211;${Math.min(H.winsA, H.winsB)}`;
    const streak = H.streak.n >= 2 ? `${esc(H.streak.who === "a" ? fA : fB)} has won the last ${H.streak.n}` : H.streak.n === 1 ? `${esc(H.streak.who === "a" ? fA : fB)} won the last one` : "the last one was halved";
    const holes = H.holesA + H.holesB + H.holesHalved;
    const widest = H.winsA >= H.winsB ? H.widestA : H.widestB;
    const num = v => v === null ? "NR" : v;
    const hero = `<div class="card vscard"><div class="modeline mid"><span class="modetag">${esc(basisGame(basis))}</span><span>a round goes to ${esc(basisTaker(basis))}</span></div><div class="vsverdict">${verdict}</div>
      <div class="vs${C.g.showGolfers ? " figs" : ""}"><div class="vsside">${vsFace(C, a, A_, mA, "a", 1)}</div>
        <div class="vsnum"><b class="num">${H.winsA}</b><s>&#8211;</s><b class="num">${H.winsB}</b><small>rounds won · ${H.ties ? plural(H.ties, "halved") : "none halved"}</small></div>
        <div class="vsside">${vsFace(C, b, B_, mB, "b", -1)}</div></div>
      <div class="tug"><i class="a" style="width:${pc(H.winsA)}"></i><i class="t" style="width:${pc(H.ties)}"></i><i class="b" style="width:${pc(H.winsB)}"></i></div>
      <div class="vsline">${plural(H.rounds.length, "round")} together &middot; ${streak}</div></div>`;
    const formStrip = `${h2tip("Round by round", `Every round they played together, oldest first. Each square carries the initials of whoever took it on ${esc(basisWord(basis))}; = means they tied. Tap one to see that card.`)}<div class="vsform">${H.rounds.map(r => `<a class="fdot ${r.winner}${r.winner !== "tie" && (r.winner === "a" ? mA : mB).length > 2 ? " long" : ""}" href="#review/${r.id}" title="${esc(fmtDate(r.date))} &middot; ${num(r.scoreA)}&#8211;${num(r.scoreB)}">${r.winner === "tie" ? "=" : esc(r.winner === "a" ? mA : mB)}</a>`).join("")}</div>`;
    const holesBlock = `${h2tip("Match play, hole by hole", `Every hole the two of them have played together, each one won by ${esc(holeWord)}. Added up as one long match: ${esc(fA)}'s holes on the left, halved holes in the middle, ${esc(fB)}'s on the right.`)}<div class="card">
      <div class="modeline"><span class="modetag">Match play</span><span>a hole goes to ${esc(basisTaker(basis))}</span></div>
      <div class="tug big"><i class="a" style="width:${(H.holesA / holes) * 100}%"></i><i class="t" style="width:${(H.holesHalved / holes) * 100}%"></i><i class="b" style="width:${(H.holesB / holes) * 100}%"></i></div>
      <div class="holeskey"><span><b>${H.holesA}</b> ${esc(fA)}</span><span class="muted">${H.holesHalved} halved</span><span><b>${H.holesB}</b> ${esc(fB)}</span></div>
      <p class="muted small" style="margin:10px 0 0">All ${holes} holes together as one long match: ${H.up === 0 ? "dead level" : `${esc(H.up > 0 ? fA : fB)} would be ${Math.abs(H.up)} up`}.</p></div>`;
    const stats = `<details class="card fold"><summary>The numbers side by side${infoBtn("The numbers side by side", `${esc(fA)} on the left of every line, ${esc(fB)} on the right, over the rounds they played together. The green end is whoever is ahead — on gross scores that is the lower number.`)}</summary><div class="tapes">
      ${tapeRow("average points", H.avgPtsA, H.avgPtsB, false, fix)}${tapeRow("best round", H.bestPtsA, H.bestPtsB)}${tapeRow("total points", H.ptsA, H.ptsB)}
      ${basis === "net" ? tapeRow("average net", H.avgNetA, H.avgNetB, true, fix) + tapeRow("best net", H.bestNetA, H.bestNetB, true) : ""}
      ${tapeRow("average gross", H.avgGrossA, H.avgGrossB, true, fix)}${tapeRow("best gross", H.bestGrossA, H.bestGrossB, true)}
      ${H.birdiesA + H.birdiesB ? tapeRow("birdies or better", H.birdiesA, H.birdiesB) : ""}${tapeRow("match play wins", H.matchA, H.matchB)}</div></details>`;
    const widestLine = widest ? `<p class="muted small" style="margin:-4px 4px 8px">Widest margin: ${esc(widest.winner === "a" ? fA : fB)} by ${widest.margin} ${basis === "points" ? "points" : "shots"} on ${esc(fmtDate(widest.date))}.</p>` : "";
    const list = `${h2tip("Every round together", `One line a round, newest first: the two ${esc(basisWord(basis))} totals for that day, the winner's in colour. The line underneath says how the same round went as a match, hole by hole.`)}${widestLine}<div class="list">${[...H.rounds].reverse().map(r => `<a class="h2hrow" href="#review/${r.id}">
      <div class="when"><b>${esc(fmtDate(r.date))}</b><small class="muted">${esc(r.where)} &middot; ${r.up === 0 ? "match halved" : `${Math.abs(r.up)} up ${esc(firstName(r.up > 0 ? A_ : B_))}`}</small></div>
      <div class="sc"><b class="${r.winner === "a" ? "wa" : ""}">${num(r.scoreA)}</b><s>&#8211;</s><b class="${r.winner === "b" ? "wb" : ""}">${num(r.scoreB)}</b></div></a>`).join("")}</div>`;
    body = sides + head + hero + formStrip + holesBlock + stats + list;
  }
  shell(C.g, C.g.name, `${body}
    ${C.members.length > 2 ? `${sect(`${fA} against`)}<div class="rows">${C.members.filter(m => m !== a && m !== b).slice(0, 5).map(m => `<a class="hrow" href="#league/${C.gid}/vs/${esc(a)}/${esc(m)}">
      <span class="t"><b>${esc(firstName(nameOf(m)))}</b></span><span class="chev">›</span></a>`).join("")}</div>` : ""}`,
    { runs: C.runs, seg: "vs" });
  freshGolfers(C, location.hash, () => vsView(ctx(C.g), a, b));
  bind(async ev => {
    if (await common(C, ev)) return;
    const el = ev.target.closest("[data-act]");
    if (el && el.dataset.act === "vsswap") return go(`#league/${C.gid}/vs/${b}/${a}`);
    if (el && (el.dataset.act === "pick-a" || el.dataset.act === "pick-b")) {
      const first = el.dataset.act === "pick-a";
      const v = await pickMember(C, first ? "On the left" : "On the right", first ? b : a);
      if (v) go(first ? `#league/${C.gid}/vs/${v}/${b}` : `#league/${C.gid}/vs/${a}/${v}`);
      return;
    }
    if (el && el.dataset.act === "vsbasis") {
      const v = await sheet({ title: "Compare them on",
        lead: "The same two players, read three ways. Stroke play settles the day; match play settles each hole.",
        body: `<div class="fmtpicks">${H2H_BASES.map(([k, label, rw]) => `<button class="fmtpick${k === basis ? " on" : ""}" data-sheet="${k}"><span><b>${esc(label)}</b><small>the day goes to ${esc(rw)}</small></span></button>`).join("")}</div>`,
        actions: [{ label: "Cancel", value: "no" }] });
      if (v && v !== "no") { ui.basis[C.gid] = v; league(C.gid, "vs", a, b); }
    }
  });
}

// ---------------------------------------------------------------- the field's numbers
function statsView(C, keep = false) {
  ui.statsWho[C.gid] = "";
  const doors = C.Ms.length ? `<div class="list">
      <a href="#league/${C.gid}/table/${C.kind}"><div><div class="name">The whole table</div><div class="muted small">${esc(FORMAT_NAMES[C.kind])}, every column</div></div><span class="chev">›</span></a></div>` : "";
  shell(C.g, C.g.name, doors + leagueStatsBody(C.g, C.Ms, C.members, ui.numWho[C.gid] || null), { back: "#leagues", runs: C.runs, keepScroll: keep, seg: "stats" });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "numwho") {
      const every = [...document.querySelectorAll("[data-act=numwho]")].map(x => x.dataset.id).filter(Boolean);
      const now = ui.numWho[C.gid];
      const id = b.dataset.id;
      // Everyone picks all; a name tapped while everyone is shown picks just that name, otherwise it goes in or out
      const next = !id ? null : !now ? [id] : now.includes(id) ? now.filter(x => x !== id) : [...now, id];
      ui.numWho[C.gid] = next && next.length === every.length ? null : next;
      return statsView(C, true);
    }
    if (b.dataset.act === "ninetab") { ui.nineTab[C.gid] = b.dataset.slug; return statsView(C, true); }
  });
}

// ---------------------------------------------------------------- running the league
// Settings is for whoever runs the society. Every control saves the moment it is touched: no form, no Save.
const BEST_N = [0, 3, 4, 5, 6, 8, 10, 12, 15, 20];
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString("en-GB", { month: "long" }));
const countsBest = fs => fs.some(f => !(f in MATCH_BASIS) && !(f in ELO_BASIS));
const VIS_SAYS = { private: "Only members see the table.", link: "Anyone with the link can read the table, without signing in.", public: "Anyone can find the table and read it. Reading is not joining." };
const segs3 = (act, on, opts) => `<div class="segpick">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" class="${on === v ? "on" : ""}" aria-pressed="${on === v}">${l}</button>`).join("")}</div>`;
const lookLine = g => `${swatchStrip([leagueTheme(g) || appTheme()])}<span class="fname">${esc(leagueLookName(g) || "Each phone's own theme")}</span>`;

/** The ways it is scored, in the order the board offers them; the first is the one it opens on. */
function fmtRows(C) {
  const n = C.formats.length;
  return `<div class="rows fmtrows">${C.formats.map((f, i) => `<div class="hrow fmtrow" data-flip="fmt-${f}">
    <span class="lp num">${i + 1}</span>
    <span class="t"><b>${esc(FORMAT_NAMES[f])}</b><span>${esc(FORMAT_MODE[f])}</span></span>
    ${i ? iconBtn("fmt-up", "up", `Move ${FORMAT_NAMES[f]} up`, `data-f="${f}"`) : `<span class="opens caps">Opens on</span>`}
    ${n > 1 ? iconBtn("fmt-out", "x", `Take ${FORMAT_NAMES[f]} off`, `data-f="${f}"`) : ""}</div>`).join("")}
    ${n < S.FORMATS.length ? `<button class="hrow more" data-act="fmt-add"><span class="t"><b>Add a way to score</b></span></button>` : ""}</div>`;
}

function adminView(C, keep = false) {
  const { g, gid } = C;
  if (!C.runs) return go(`#league/${gid}/members`);
  const lead = C.formats[0];
  const preview = C.Ms.length ? (() => { const Sx = standingsFor(g, C.Ms, C.members, lead); return `<aside class="deskside"><div class="caps muted">Opens on ${esc(FORMAT_NAMES[lead])}</div><div class="rows lboard">${Sx.rows.slice(0, 12).map(r => boardRow({ ...C, kind: lead }, r, null, Sx)).join("")}</div></aside>`; })() : "";
  const vis = g.visibility || "private";
  const bests = [...new Set([...BEST_N, g.bestN || 0])].sort((a, b) => a - b);
  shell(g, "Settings", `<div class="${onDesk() ? "dgrid" : ""}"><div class="lset">
    <label for="lname">Name</label><input id="lname" value="${esc(g.name)}" autocomplete="off">
    <div class="iconrow"><span id="liconprev">${leagueBadge(g, "big")}</span><span class="t"><b>Icon</b><span>${uploaded(g) ? "A picture you uploaded" : `Its crest, the ${crestOf(g).animal}`}, beside the name on every member's phone</span></span>
      ${uploaded(g) ? "" : `<a class="btn small" href="#league/${gid}/crest">Crest</a>`}
      <label class="btn small" id="liconpick">${uploaded(g) ? "Change" : "Upload"}<input type="file" accept="image/*" id="liconfile" hidden></label>
      ${uploaded(g) ? `<button class="btn small" data-act="icon-clear">Remove</button>` : ""}</div>
    ${sect("Scoring")}
    ${fmtRows(C)}
    ${countsBest(C.formats) ? `<label for="lbest">Rounds that count</label><select id="lbest">${bests.map(k => `<option value="${k}" ${k === (g.bestN || 0) ? "selected" : ""}>${k ? `Each player's best ${k}` : "Every round"}</option>`).join("")}</select>` : ""}
    <label for="lseason">Seasons</label><select id="lseason"><option value="0">Off: one table over every round</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${g.seasonStart === i + 1 ? "selected" : ""}>A new table every 1 ${m}</option>`).join("")}</select>
    ${sect("Look")}
    <details class="lookfold" id="llook"${ui.lookOpen === gid ? " open" : ""}><summary>${lookLine(g)}</summary>
      ${brandField("lbrand", g.brand)}
      <div class="themes">${themeRadios("ltheme", leagueTheme(g) ? g.theme : "", { theme: appTheme(), label: "Each phone's own" })}</div>
      <div class="lmode"${g.theme ? "" : " hidden"}><label>Light or dark</label>${segs3("lmode", themePin(g.theme) || "auto", [["auto", "Like each phone"], ["light", "Light"], ["dark", "Dark"]])}</div>
    </details>
    <label class="switch"><span>Golfers on the board<small>Each member's golfer beside their name on the board and head to head, on screen only</small></span><input type="checkbox" id="showgolf" ${g.showGolfers ? "checked" : ""}></label>
    ${A.signedIn() ? `${sect("Who can read the table")}
      ${segs3("vis", vis, [["private", "Private"], ["link", "Link"], ["public", "Public"]])}
      <p class="muted small says">${VIS_SAYS[vis]}</p>
      ${vis !== "private" ? `${g.token ? `<div class="rows"><button class="hrow" data-act="share-board"><span class="t"><b>Send the board link</b></span><span class="chev">›</span></button>
        <button class="hrow" data-act="reset-board"><span class="t"><b>Reset the link</b><span>The old one stops working for everyone who has it</span></span></button></div>` : ""}
        <label class="switch"><span>Show handicaps on the board</span><input type="checkbox" id="showhcp" ${g.showHandicaps === false ? "" : "checked"}></label>` : ""}` : ""}
    ${g.createdBy ? `<p class="muted small center lfoot">Created by ${esc(g.createdBy)}${g.created ? ` on ${esc(fmtDate(g.created))}` : ""}</p>` : ""}
    <div class="center"><button class="btn ghost quietdanger" data-act="del-league">Delete this society</button></div>
  </div>${onDesk() ? preview : ""}</div>`, { back: `#league/${gid}`, runs: C.runs, wide: onDesk(), keepScroll: keep, gear: false });
  wireSettings(C);
}

/** The society's crest: any of the ten animals or one its name unlocks, on any field, kept as its icon. */
function crestView(C) {
  const { g, gid } = C;
  if (!C.runs) return go(`#league/${gid}`);
  const now = crestOf(g), T = themeHere(), drawn = animal => leagueBadge({ ...g, icon: crestKey({ ...now, animal }) });
  shell(g, "Crest", `
    <div class="iconrow crestnow">${leagueBadge(g, "big")}${leagueBadge(g)}<span class="t"><b>The ${esc(now.animal)}</b><span>${uploaded(g) ? "Picking a crest takes the place of the uploaded picture" : "Kept when the society is renamed"}</span></span></div>
    ${sect("Animal")}
    <div class="crestgrid">${choices(g).map(({ animal, word }) => `<button class="crestpick ${animal === now.animal ? "on" : ""}" data-act="crest" data-animal="${animal}" aria-pressed="${animal === now.animal}">
      ${drawn(animal)}<span>${esc(animal[0].toUpperCase() + animal.slice(1))}</span>${word ? `<small>from “${esc(word)}”</small>` : ""}</button>`).join("")}</div>
    ${sect("Field")}
    <div class="swatches">${FIELDS.map(f => `<button style="--c:${swatchOf(T, "field", f)}" data-act="crest" data-field="${f}" aria-label="${f}" aria-pressed="${f === now.field}" class="${f === now.field ? "on" : ""}"><i></i></button>`).join("")}</div>`,
    { back: `#league/${gid}/admin`, runs: C.runs, gear: false });
  bind(ev => {
    const b = ev.target.closest("[data-act=crest]");
    if (!b) return;
    g.icon = crestKey({ ...now, animal: ANIMALS[b.dataset.animal] ? b.dataset.animal : now.animal, field: b.dataset.field || now.field });
    S.saveLeague(g);
    crestView(ctx(g));
  });
}

/** Which finished rounds count for the society: taken out by whoever played them or runs it. */
function roundsView(C, keep = false) {
  const { g, gid, runs } = C;
  const attached = new Set(S.leagueRoundIds(gid));
  const byDate = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
  const done = S.rounds().filter(r => r.status === "done").sort(byDate);
  const inL = done.filter(r => attached.has(r.id));
  const rest = done.filter(r => !attached.has(r.id) && (S.iPlayed(r) || runs));
  const roundRow = (r, on) => {
    const q = [fmtDate(r.date), roundWhere(r), r.name, ...r.entries.map(e => e.name)].join(" ").toLowerCase();
    const canToggle = S.iPlayed(r) || runs;
    return `<div class="hrow arow" data-q="${esc(q)}" data-flip="r-${r.id}">
      <a class="t" href="#review/${r.id}"><b>${esc(shortDate(r.date))} · ${esc(roundClub(r))}</b><span>${esc([roundLoop(r), plural(r.entries.length, "player")].filter(Boolean).join(" · "))}</span></a>
      ${canToggle ? `<button class="btn small" data-act="toggle-round" data-rid="${r.id}" data-on="${on ? 0 : 1}">${on ? "Take out" : "Add"}</button>` : `<span class="chev">›</span>`}</div>`;
  };
  shell(g, "Rounds", `
    ${sect("In this society")}
    ${inL.length ? `<div class="rows">${inL.map(r => roundRow(r, true)).join("")}</div>` : `<p class="muted small says">None yet.</p>`}
    ${sect("Not in it yet")}
    ${rest.length ? `${rest.length > 6 ? `<input id="rq" class="search" placeholder="Search by date, course or player" autocomplete="off">` : ""}<div class="rows" id="rlist">${rest.map(r => roundRow(r, false)).join("")}</div>`
      : `<p class="muted small says">Every finished round you played is in this society.</p>`}`, { back: `#league/${gid}/days`, runs, keepScroll: keep });
  const rq = document.getElementById("rq");
  if (rq) rq.addEventListener("input", () => {
    const t = rq.value.toLowerCase().trim();
    document.querySelectorAll("#rlist .arow").forEach(l => { l.style.display = !t || l.dataset.q.includes(t) ? "" : "none"; });
  });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act=toggle-round]");
    if (!b) return;
    const rid = b.dataset.rid, on = b.dataset.on === "1";
    S.setLeagueRound(gid, rid, on);
    if (!on) toast("Taken out", 5000, { label: "Undo", fn: () => { S.setLeagueRound(gid, rid, true); if (location.hash === `#league/${gid}/rounds`) roundsView(ctx(g), true); } });
    roundsView(ctx(g), true);
  });
}

const uploaded = g => !!g.icon && !isCrest(g.icon);

// Square, small and re-encoded on the phone: every member pulls the league row, so the icon has to stay a few kB.
// Fitted, not cropped, and see-through where the file is: a wide logo keeps its sides and sits on the theme. A phone
// that cannot write webp writes png, which keeps the transparency jpeg would lose.
function shrinkIcon(file, size = 128) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const k = size / Math.max(img.naturalWidth, img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
      c.getContext("2d").drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      const webp = c.toDataURL("image/webp", 0.82);
      ok(webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error("That file is not an image this phone can read")); };
    img.src = url;
  });
}

const nameIn = (C, id) => { for (const M of C.Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };

function wireSettings(C) {
  const { g, gid } = C;
  const here = () => location.hash === `#league/${gid}/admin`;
  const redraw = () => { if (here()) adminView(ctx(g), true); };
  const setFormats = fs => { g.formats = S.cleanFormats(fs); delete ui.boardOf[gid]; S.saveLeague(g); redraw(); };
  const name = document.getElementById("lname");
  let typing = null;
  // a society made before crests had none kept; it keeps the one its old name gave it before taking the new name
  const commitName = () => { clearTimeout(typing); const v = name.value.trim(); if (v && v !== g.name) { if (!g.icon) g.icon = crestKey(crestOf(g)); g.name = v; S.saveLeague(g); } };
  // on input as well as change: a phone's back gesture leaves without a blur
  name.addEventListener("input", () => { clearTimeout(typing); typing = setTimeout(commitName, 400); });
  name.addEventListener("change", () => { commitName(); if (!name.value.trim()) name.value = g.name; });
  document.getElementById("liconfile").addEventListener("change", async ev => {
    const file = ev.target.files && ev.target.files[0], pick = document.getElementById("liconpick");
    if (!file) return;
    pick.setAttribute("aria-busy", "true");
    pick.firstChild.textContent = "Shrinking…";
    try { g.icon = await shrinkIcon(file); }
    catch (e) { ev.target.value = ""; pick.removeAttribute("aria-busy"); pick.firstChild.textContent = uploaded(g) ? "Change" : "Upload"; return toast(e.message, 4000); }
    S.saveLeague(g); redraw();
  });
  const best = document.getElementById("lbest");
  if (best) best.addEventListener("change", () => { g.bestN = Number(best.value) || 0; S.saveLeague(g); });
  document.getElementById("lseason").addEventListener("change", ev => { g.seasonStart = Number(ev.target.value) || null; delete ui.season[gid]; S.saveLeague(g); });
  const look = document.getElementById("llook");
  look.addEventListener("toggle", () => { ui.lookOpen = look.open ? gid : null; });
  const relook = () => {
    S.saveLeague(g); paint(themeHere());
    look.querySelector("summary").innerHTML = lookLine(g);
    look.querySelector(".lmode").hidden = !g.theme;
  };
  bindChips(look.querySelector(".themes"), v => { const pin = themePin(g.theme); g.theme = v ? (pin ? `${v}:${pin}` : v) : null; relook(); });
  const brand = document.getElementById("lbrand");
  if (brand) brand.addEventListener("change", () => { g.brand = brand.value || null; relook(); });
  document.getElementById("showgolf").addEventListener("change", ev => { g.showGolfers = ev.target.checked; S.saveLeague(g); redraw(); });
  const hcp = document.getElementById("showhcp");
  if (hcp) hcp.addEventListener("change", async () => {
    hcp.disabled = true;
    try { const r = await F.setVisibility(gid, { showHandicaps: hcp.checked }); g.showHandicaps = r.showHandicaps; S.afterPull(); }
    catch (e) { hcp.checked = !hcp.checked; toast(e.message, 5000); }
    hcp.disabled = false;
  });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "fmt-up" || act === "fmt-out") {
      const f = b.dataset.f, fs = [...C.formats], i = fs.indexOf(f);
      if (i < 0) return;
      if (act === "fmt-up") { if (i) [fs[i - 1], fs[i]] = [fs[i], fs[i - 1]]; return setFormats(fs); }
      if (fs.length < 2) return;
      fs.splice(i, 1);
      setFormats(fs);
      return toast(`Took off ${FORMAT_NAMES[f]}`, 5000, { label: "Undo", fn: () => { const back = S.cleanFormats(g.formats).filter(x => x !== f); back.splice(i, 0, f); setFormats(back); } });
    }
    if (act === "fmt-add") {
      const left = S.FORMATS.filter(f => !C.formats.includes(f));
      const v = await sheet({ title: "Add a way to score", lead: "It goes to the end of the list. Move it up to open the board on it.",
        body: ["Stroke play", "Match play", "Rating"].map(m => { const fs = left.filter(f => FORMAT_MODE[f] === m); return fs.length ? `${sect(m)}<div class="fmtpicks">${fs.map(f => `<button class="fmtpick" data-sheet="${f}"><span><b>${esc(FORMAT_NAMES[f])}</b><small>${esc(FORMAT_BLURB[f])}</small></span></button>`).join("")}</div>` : ""; }).join(""),
        actions: [{ label: "Cancel", value: "no" }] });
      if (v && left.includes(v)) setFormats([...C.formats, v]);
      return;
    }
    if (act === "lmode") {
      const base = look.querySelector("input[name=ltheme]:checked");
      if (!base || !base.value) return;
      g.theme = b.dataset.v === "auto" ? base.value : `${base.value}:${b.dataset.v}`;   // a pinned name is what pickTheme reads
      b.parentElement.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      return relook();
    }
    if (act === "icon-clear") { g.icon = crestKey(crestOf({ ...g, icon: null })); S.saveLeague(g); return redraw(); }
    if (act === "vis") {
      if (b.classList.contains("on")) return;
      const grp = b.parentElement;
      grp.setAttribute("aria-busy", "true");
      grp.querySelectorAll("button").forEach(x => { x.disabled = true; });
      try {
        const r = await F.setVisibility(gid, { visibility: b.dataset.v });
        Object.assign(g, { visibility: r.visibility, token: r.token || g.token, showHandicaps: r.showHandicaps });
        S.afterPull();
      } catch (e) { toast(e.message, 5000); }
      return redraw();
    }
    if (act === "reset-board") {
      if (!await confirmSheet("Reset the board link?", "The old link stops working for everyone who has it.", { label: "Reset", danger: true })) return;
      try { const r = await F.setVisibility(gid, { resetLink: true }); g.token = r.token; S.afterPull(); toast("New link made"); } catch (e) { toast(e.message, 5000); }
      return;
    }
    if (act === "del-league") {
      if (!await confirmSheet("Delete this society?", "It goes for every member. Rounds and players stay.", { label: "Delete", danger: true })) return;
      S.deleteLeague(gid); go("#leagues");
    }
  });
}

/** The people side: who is in it and as which name, names still waiting for their golfer, invite links, merging two spellings, and leaving. */
async function wireMembers(C) {
  const { gid, runs } = C;
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "merge") {
      const keep = document.getElementById("mkeep").value, drop = document.getElementById("mdrop").value;
      if (keep === drop) return toast("Pick two different names");
      if (!await confirmSheet("Merge these names?", `${nameIn(C, drop)} becomes ${nameIn(C, keep)} on every phone. This cannot be undone.`, { label: "Merge", danger: true })) return;
      if (!S.mergePlayers(keep, drop)) return toast("Those two cannot be merged on this phone", 5000);
      toast("Merged"); return league(gid, "members");
    }
    if (act === "revoke") { try { await F.revokeInvite(gid, b.dataset.id); toast("Link revoked"); league(gid, "members"); } catch (e) { toast(e.message, 5000); } }
    if (act === "unclaim") {
      if (!await confirmSheet(`Not ${b.dataset.name}?`, "Their seats on this society's cards go back to the name, and they can pick again.", { label: "Undo", danger: true })) return;
      try { await F.unclaim(gid, b.dataset.id); toast("Undone"); await Y.pull(); league(gid, "members"); } catch (e) { toast(e.message, 5000); }
    }
    if (act === "send-name") {
      try { const r = await F.inviteLink(gid, false, b.dataset.pid); await shareLink(r.url, `${C.g.name} on Hagolf`, `Your rounds in ${C.g.name}, as ${b.dataset.name}`); } catch (e) { toast(e.message, 5000); }
    }
    if (act === "claim-me") { try { const r = await F.candidatesOf(gid); await claimSheet(gid, r.candidates); league(gid, "members"); } catch (e) { toast(e.message, 5000); } }
    if (act === "leave") {
      if (!await confirmSheet("Leave this society?", "Your rounds stay on its cards; you stop seeing the table.", { label: "Leave", danger: true })) return;
      try { await F.leaveLeague(gid); await Y.pull(); toast("You left the society"); go("#leagues"); } catch (e) { toast(e.message, 5000); }
    }
  });
  if (!A.signedIn()) return;
  const box = document.getElementById("members");
  try {
    const r = await F.membersOf(gid);
    const me = S.myAccount();
    const mineM = r.members.find(m => m.id === me);
    const free = (await F.candidatesOf(gid).catch(() => ({ candidates: [] }))).candidates.filter(c => !c.claimedBy);
    const sub = m => [m.role && !["member", "player"].includes(m.role) ? m.role : "", m.playsAs && m.playsAs !== m.name ? `on the cards as ${m.playsAs}` : ""].filter(Boolean).join(" · ");
    const undo = m => runs && m.id !== me && m.playsAs ? `<button class="btn small" data-act="unclaim" data-id="${esc(m.id)}" data-name="${esc(m.playsAs)}">Undo</button>` : "";
    if (box) box.innerHTML = `
      <div class="list">${r.members.map(m => `<div><a class="lead" href="${m.id === me ? "#me" : `#person/${esc(m.id)}`}">${avatar(m.name || "?", "", F.lookOf(m.id))}<div><div class="name">${esc(m.name || "Somebody")}</div>${sub(m) ? `<div class="muted small">${esc(sub(m))}</div>` : ""}</div></a>${undo(m)}</div>`).join("")}</div>
      ${mineM && mineM.claim === "none" && free.length ? `<button class="btn small" data-act="claim-me" style="margin-top:8px">Which player on the cards is me?</button>` : ""}
      ${free.length ? `${sect("Not on Hagolf yet")}<div class="list">${free.map(c => `<div><span class="lead">${avatar(c.name)}<div><div class="name">${esc(c.name)}</div><div class="muted small">${plural(c.rounds, "round")}</div></div></span><button class="btn small" data-act="send-name" data-pid="${esc(c.playerIds[0])}" data-name="${esc(c.name)}">Send link</button></div>`).join("")}</div>` : ""}`;
  } catch (e) { if (box) box.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
  const ibox = document.getElementById("invites");
  if (ibox && runs) {
    try {
      const r = await F.invitesOf(gid);
      ibox.innerHTML = r.invites.length ? `<div class="list">${r.invites.map(i => `<div><div><div class="name">${i.reusable ? "Group link" : i.personal ? "Personal invite" : "One-time link"}</div><div class="muted small">${i.uses || 0} used${i.expires ? ` · expires ${esc(shortDate(String(i.expires).slice(0, 10)))}` : ""}</div></div><button class="btn small" data-act="revoke" data-id="${esc(i.id)}">Revoke</button></div>`).join("")}</div>`
        : `<p class="muted small">No links made yet. The invite button at the top makes one.</p>`;
    } catch (e) { ibox.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
  }
}

// ---------------------------------------------------------------- what every view answers
/** The header icons, handled once. Returns true when it took the event. */
async function common(C, ev) {
  const b = ev.target.closest("[data-act]");
  if (!b) return false;
  const act = b.dataset.act;
  if (act === "invite") { await inviteSheet(C.g); return true; }
  if (act === "lgsettings") { go(`#league/${C.gid}/admin`); return true; }
  if (act === "play-today") { playToday(C); return true; }
  if (act === "dayjoin") { const { joinDay } = await import("./together.js"); joinDay(b.dataset.rid); return true; }
  if (act === "share-board") { await boardShare(C.g, C.kind); return true; }
  if (act === "send-table") { await sendTable(C.gid, b.dataset.kind || C.kind); return true; }
  if (act === "board-graph") { await climbSheet(C, b.dataset.kind); return true; }
  if (act === "season") { await seasonSheet(C.g); return true; }
  return false;
}

/** Every season this society has played, newest first; picking one turns every part of the society to it. */
async function seasonSheet(g) {
  const all = seasonRounds(g, null);
  const years = [...new Set([currentSeason(g), ...all.filter(r => r.date).map(r => seasonOf(g, r.date))])].sort((a, b) => b - a);
  const v = await sheet({ title: "Season",
    body: `<div class="fmtpicks">${years.map(y => `<button class="fmtpick${y === shownSeason(g) ? " on" : ""}" data-sheet="${y}">
      <span><b>${esc(seasonName(g, y))}</b><small>${plural(all.filter(r => r.date && seasonOf(g, r.date) === y).length, "round")}</small></span></button>`).join("")}</div>`,
    actions: [{ label: "Cancel", value: "no" }] });
  if (!v || v === "no") return;
  ui.season[g.id] = Number(v);
  league(g.id, ...location.hash.split("/").slice(2).map(decodeURIComponent));
}

/** One league, one export. `view` is the second part of the hash; the router spreads the rest. */
export function league(gid, view, a, b, keep = false) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const C = ctx(g);
  if (view === "table") return tableView(C, a, keep);
  if (view === "days") return daysView(C);
  if (view === "day") return dayView(C, a);
  if (view === "p") return playerView(C, a);
  if (view === "vs") return vsView(C, a, b);
  if (view === "stats") return statsView(C);
  if (view === "admin") return adminView(C, keep);
  if (view === "rounds") return roundsView(C, keep);
  if (view === "members") return membersView(C);
  if (view === "crest") return crestView(C);
  return boardView(C, keep);
}

/** The society's day: its scoring picks the format, then the course; the card id is the same on every phone. */
function playToday(C) {
  const f = ["stroke", "gpstroke", "elostroke"].includes(C.formats[0]) ? "stroke" : "stableford";
  S.setSetting("lastFormat", f);
  ui.dayLeague = C.gid;
  ui.eventFor = null;
  go("#new");
}

/** Who is in it, claims to confirm, invite links: the people side of a society, on a page of its own. */
function membersView(C) {
  const { g, gid, runs } = C;
  shell(g, g.name, `
    ${A.signedIn() ? `<div class="card" id="members"><p class="muted small">Loading…</p></div>` : `<p class="muted center">Sign in to see the members.</p>`}
    <button class="btn wide" data-act="invite">${ICONS.friend} Invite people</button>
    ${runs && C.members.length > 1 ? `<details class="card fold"><summary>Two spellings of one person?</summary>
      <p class="muted small">Merge them: every round, score and course handicap moves to the kept name, and the old spelling becomes an alias.</p>
      <div class="merge"><select id="mkeep">${C.members.map(m => `<option value="${m}">${esc(nameIn(C, m))}</option>`).join("")}</select><span>←</span><select id="mdrop">${C.members.map((m, i) => `<option value="${m}" ${i === 1 ? "selected" : ""}>${esc(nameIn(C, m))}</option>`).join("")}</select></div>
      <button class="btn small" data-act="merge" style="margin-top:8px">Merge into the first name</button></details>` : ""}
    ${runs && A.signedIn() ? `${sect("Invite links")}<div class="card" id="invites"><p class="muted small">Loading…</p></div>` : ""}
    ${S.myMembership(gid) && g.owner !== S.myAccount() ? `<div class="center lfoot"><button class="btn ghost quietdanger" data-act="leave">Leave this society</button></div>` : ""}`, { runs, seg: "members" });
  wireMembers(C);
}
