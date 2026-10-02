// One league, as a front page rather than a filing cabinet. The landing says what happened last time out,
// where you stand and whether you moved, then the whole field as ruled rows. Everything else -- a day, a
// player, a rivalry, the field's numbers, running the league -- is a screen of its own under the league's
// own hash, so the back button works and a table can be linked to. No tab row renders anywhere in here.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as E from "../entitlements.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, ui, plural, firstName, inits, ordinal, fmtDate, shortDate, roundStatus, resumeHash, roundWhere, roundClub, roundLoop, sect, sectRaw, tip, h2tip, infoBtn, sheet, confirmSheet, shareLink, qrHtml, avatar, themeRadios, bindChips, appTheme, leagueTheme, paint, themeHere, shopBtn, app, iconBtn } from "../ui.js";
import { headToHead, leagueCards, leagueStats, fmtToPar, fmtIndex, fix } from "../model.js";
import { FORMAT_NAMES, FORMAT_MODE, FORMAT_BLURB, FORMAT_NOTES, MATCH_BASIS, H2H_BASES, basisRow, basisWord, leagueResults, standingsFor, standingsTable, boardLine, decidingValue, dayBoard, sinceLast, isMyRow, myRow } from "./formats.js";
import { leagueStatsBody, leaguePlayerBody, tapeRow, basisSheetBody } from "./stats.js";
import { claimSheet } from "./gate.js";

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
    body: friends.length ? `<div class="list">${friends.map(f => `<label style="margin:0;font:inherit"><span class="lead">${avatar(f.name)}<div><div class="name">${esc(f.name)}</div></div></span><input type="checkbox" name="fr" value="${esc(f.id)}"></label>`).join("")}</div>` : "",
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

async function boardShare(g) {
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
  const { Ms, members } = leagueResults(g);
  const formats = S.cleanFormats(g.formats);
  const kind = formats.includes(ui.boardOf[g.id]) ? ui.boardOf[g.id] : formats[0];
  return { g, gid: g.id, Ms, members, formats, kind, me: S.me(), runs: runsIt(g) };
}

const cardKey = c => encodeURIComponent(c.key ?? c.id);
/** Where a league member's own page lives: a contact has one, an account that claimed them has another. */
const personHash = id => (S.state.players.find(x => x.id === id && !x.deleted) ? `#player/${id}` : `#person/${id}`);
const dayWhere = c => (c.course && (c.course.loop || c.course.name)) || c.name || "";

/** Invite, share and the rest, as icons in the header, where they cost no page at all. */
const headActions = runs => iconBtn("invite", "friend", "Invite people") + iconBtn("share-board", "share", "Share the board") + iconBtn("lgmore", "more", runs ? "Posters, and running the league" : "Posters and settings");

function shell(g, title, body, { back = "#leagues", keepScroll = false, runs = false } = {}) {
  page(title, body, { back, actions: headActions(runs), bell: false, keepScroll });
}

/** The pieces of chrome every view under a league carries at its foot. */
const posterRow = gid => `${sect("Make something")}<div class="rows">
  <a class="hrow" href="#leagueimages/${gid}"><span class="t"><b>Images</b><span>The standings and the season's sheets, in any look</span></span><span class="chev">›</span></a></div>`;

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
    : d > 0 ? `<i class="mv up">▲${d}</i>` : d < 0 ? `<i class="mv dn">▼${-d}</i>` : `<i class="mv">·</i>`;
  return `<a class="hrow lrow${mine ? " me" : ""}${r.place <= 3 ? " pod" : ""}" href="#league/${C.gid}/p/${esc(r.id)}">
    <span class="lp num">${r.place}</span>
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
  if (!a.played) return `<p class="story">No card has been returned in this league yet.</p>`;
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
  if (!board.length) return "";
  // one card in the league means the day and the season are the same list; printing it twice says nothing
  const top = cards > 1 ? board.slice(0, 3) : [];
  const win = board[0];
  const shared = board.filter(p => D.value(p) === D.value(win));
  const who = shared.length > 1 ? shared.slice(0, 2).map(p => firstName(p.name)).join(" & ") : firstName(win.name);
  return `<section class="inplay"><div class="rule"></div>
      <div class="k">Last time out${shared.length > 1 ? " · shared" : ""}</div>
      <h1>${esc(who)}</h1>
      <p class="where">${esc([dayWhere(c), fmtDate(c.date)].filter(Boolean).join(" · "))}</p></section>
    ${top.length ? `<div class="board">${top.map((x, i) => `<div><span class="p">${i + 1}</span><span class="who">${esc(x.name)}</span><span class="v">${esc(D.value(x))}</span></div>`).join("")}</div>` : ""}
    <a class="thru caps dayl" href="#league/${C.gid}/day/${cardKey(c)}">${plural(board.length, "player")} · the whole day ›</a>`;
}

/** Your own line, above the table, so nobody has to find themselves in it. */
function yourLine(C, Sx, move) {
  const r = myRow(Sx.rows, C.me);
  if (!r) return "";
  const L = boardLine(C.kind, r, C.g);
  const d = move && move.was && move.was.has(r.id) ? move.was.get(r.id) - r.place : null;
  const mv = d === null ? "" : d > 0 ? `<i class="mv up">▲${d}</i>` : d < 0 ? `<i class="mv dn">▼${-d}</i>` : `<i class="mv">·</i>`;
  return `<a class="youline" href="#league/${C.gid}/p/${esc(r.id)}">
    <span class="caps">You</span>
    <span class="t">${ordinal(r.place)} of ${Sx.rows.length} · ${esc(L.value)} ${esc(L.unit)}</span>${mv}<span class="chev">›</span></a>`;
}

/** The sentences that are only true sometimes, and are therefore only drawn when they are. */
function boardNotes(C, Sx) {
  const out = [];
  const val = r => decidingValue(C.kind, r);
  const ranked = Sx.rows.filter(r => r.played);
  if (ranked.some((r, i) => i && val(r) === val(ranked[i - 1]))) out.push("Equal totals were separated on countback.");
  if (C.g.bestN && !(C.kind in MATCH_BASIS)) {
    const top = Sx.rows[0];
    out.push(top && top.counted_n >= C.g.bestN
      ? `Each player's best ${C.g.bestN} cards count. ${esc(firstName(top.name))} is counting ${top.counted_n} of ${top.played}.`
      : `Each player's best ${C.g.bestN} cards count — nobody has ${C.g.bestN} yet, so every card is counting.`);
  }
  return out.length ? `<p class="muted small bnotes">${out.join(" ")}</p>` : "";
}

/** A league scored several ways says so in one line, carrying the answer, rather than in a row of tabs. */
function alsoScored(C) {
  const others = C.formats.filter(f => f !== C.kind);
  if (!others.length) return "";
  return `<div class="alsorow">${others.map(f => {
    const Sx = standingsFor(C.g, C.Ms, C.members, f);
    const mine = myRow(Sx.rows, C.me);
    const lead = Sx.rows[0] ? `${firstName(Sx.rows[0].name)} leads` : "nothing scored yet";
    return `<button class="alsol" data-act="board-set" data-f="${f}">Also scored as <b>${esc(FORMAT_NAMES[f])}</b> — ${esc(lead)}${mine ? `, you ${ordinal(mine.place)}` : ""} ›</button>`;
  }).join("")}</div>`;
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
    You played ${esc(d ? fmtDate(d) : roundWhere(byDate[0]))} — add ${sameDay.length > 1 ? `${plural(sameDay.length, "sheet")}` : "it"} to this league?</button>`;
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
  const body = `
    ${claimBanner(C)}${attachPrompt(C)}
    ${yourLine(C, Sx, move)}
    ${sectRaw(pick, infoBtn(FORMAT_NAMES[C.kind], FORMAT_NOTES[C.kind]))}
    ${nCards > 1 ? stateOfPlay(C, Sx) : ""}
    ${Sx.rows.length ? `<div class="rows lboard">${shown.map(r => boardRow(C, r, move, Sx)).join("")}
      ${shown.length < Sx.rows.length ? `<a class="hrow more" href="#league/${gid}/table/${C.kind}"><span class="t"><b>The whole table</b><span>${plural(Sx.rows.length, "player")}, every column</span></span><span class="chev">›</span></a>` : ""}</div>`
      : `<p class="muted center" style="margin:22px 0">${C.kind in MATCH_BASIS ? `Nobody has played a match yet — a ${esc(FORMAT_NAMES[C.kind])} table needs two of its players out on the same day.` : "Nothing to rank yet."}</p>`}
    ${boardNotes(C, Sx)}
    ${alsoScored(C)}
    ${lastDay(C, move, nCards)}
    ${sect("The league")}
    <div class="rows">
      <a class="hrow" href="#league/${gid}/table/${C.kind}"><span class="t"><b>The whole table</b><span>${esc(FORMAT_NAMES[C.kind])}, every column${C.formats.length > 1 ? `, and the other ${plural(C.formats.length - 1, "way")}` : ""}</span></span><span class="chev">›</span></a>
      <a class="hrow" href="#league/${gid}/days"><span class="t"><b>Cards</b><span>${plural(nCards, "day")} played</span></span><span class="chev">›</span></a>
      <a class="hrow" href="#league/${gid}/stats"><span class="t"><b>The numbers</b><span>How the field scores</span></span><span class="chev">›</span></a>
      ${h2hDoor(C, Sx)}
      ${C.runs ? `<a class="hrow" href="#league/${gid}/admin"><span class="t"><b>Running the league</b><span>Cards, members, how it is scored</span></span><span class="chev">›</span></a>` : memberDoor(C)}
    </div>
    ${posterRow(gid)}`;
  shell(g, g.name, body, { keepScroll, runs: C.runs });
  wireBoard(C, Sx);
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
    <div class="tblbar">${head}${infoBtn(FORMAT_NAMES[kind], FORMAT_NOTES[kind])}</div>
    ${C.formats.length > 1 ? `<p class="muted small" style="margin:0 4px 6px">${plural(C.formats.length, "way")} of scoring these rounds${mine ? ` · you are ${ordinal(mine.place)} here` : ""}. Tap the name to change it.</p>` : ""}
    ${stateOfPlay(Cx, Sx)}
    ${Sx.rows.length ? `<div class="rows lboard roomy">${Sx.rows.map(r => boardRow(Cx, r, move, Sx)).join("")}</div>`
      : `<p class="muted center" style="margin:22px 0">${kind in MATCH_BASIS ? `Nobody has played a match yet — a ${esc(FORMAT_NAMES[kind])} table needs two of its players out on the same day.` : "Nothing to rank yet."}</p>`}
    ${boardNotes(Cx, Sx)}
    <div class="btnrow"><button class="btn small" data-act="board-cols">Every column ›</button>
      <a class="btn small" href="#leagueimages/${C.gid}">Make images ›</a></div>`,
    { back: `#league/${C.gid}`, runs: C.runs, keepScroll: keep });
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
  const v = await sheet({ title, lead: "Anybody who has played a round in this league.",
    body: `<div class="fmtpicks">${list.map(m => `<button class="fmtpick" data-sheet="${esc(m)}"><span><b>${esc(nameOf(m))}</b></span></button>`).join("")}</div>`,
    actions: [{ label: "Cancel", value: "no" }] });
  return v && v !== "no" ? v : null;
}

/** The head-to-head door names who it opens on, so it says what is behind it. */
function h2hDoor(C, Sx) {
  const mine = myRow(Sx.rows, C.me);
  const a = mine ? mine.id : (Sx.rows[0] && Sx.rows[0].id);
  const b = (Sx.rows.find(r => r.id !== a) || {}).id;
  if (!a || !b) return "";
  const them = Sx.rows.find(r => r.id === b);
  return `<a class="hrow" href="#league/${C.gid}/vs/${esc(a)}/${esc(b)}"><span class="t"><b>Head to head</b>
    <span>${esc(mine ? `You and ${firstName(them.name)}` : `${firstName(Sx.rows[0].name)} and ${firstName(them.name)}`)}</span></span><span class="chev">›</span></a>`;
}

const memberDoor = C => `<a class="hrow" href="#league/${C.gid}/admin"><span class="t"><b>Members and this league</b><span>Who is in it, and how it is scored</span></span><span class="chev">›</span></a>`;

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
  shell(g, g.name, `
    <section class="inplay"><div class="rule"></div>
      <div class="k quiet">Nothing scored yet</div><h1>${esc(g.name)}</h1>
      <p class="where">${esc(C.formats.map(f => FORMAT_NAMES[f]).join(" · "))}${g.bestN ? ` · best ${g.bestN} count` : ""}</p></section>
    <button class="btn primary plate" data-act="new-in-league">Start a round in this league</button>
    ${sect("Or")}
    <div class="rows">
      <a class="hrow" href="#league/${gid}/admin"><span class="t"><b>Add a round you already played</b>
        <span>${loose ? `${plural(loose, "finished round")} of yours ${loose === 1 ? "is" : "are"} not in this league` : "Nothing of yours is waiting"}</span></span><span class="chev">›</span></a>
    </div>`, { runs: C.runs });
  wireBoard(C, { rows: [] });
}

function wireBoard(C, Sx) {
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "board-set") { ui.boardOf[C.gid] = b.dataset.f; return league(C.gid, undefined, undefined, undefined, true); }
    if (act === "board-pick") { const v = await formatSheet(C); if (v) { ui.boardOf[C.gid] = v; league(C.gid); } return; }
    if (act === "board-cols") return columnsSheet(C, Sx);
    if (act === "new-in-league") { S.setSetting("lastLeague", C.gid); return go("#new"); }
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
  const v = await sheet({ title: "How this league is scored",
    lead: "Every way this league keeps, and where you are in each. They are the same rounds read differently, so the places can disagree — that is the point.",
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
  const row = c => {
    const D = dayBoard(C.kind, c);
    const board = D.rows.filter(p => p.id === null || C.members.includes(p.id));
    const top = board[0];
    const mine = C.me ? board.find(p => isMyRow(p, C.me)) : null;
    return `<a class="hrow" href="#league/${C.gid}/day/${cardKey(c)}">
      <span class="t"><b>${esc(c.date ? fmtDate(c.date) : c.name)}</b>
        <span>${esc([dayWhere(c), top ? `${firstName(top.name)} ${D.value(top)} ${D.unit}` : "", `${plural(board.length, "player")}`].filter(Boolean).join(" · "))}</span></span>
      ${mine ? `<span class="v num">${esc(D.value(mine))}<small class="u">${esc(D.unit)}</small></span>` : `<span class="chev">›</span>`}</a>`;
  };
  shell(C.g, "Cards", `
    ${tip("<p>A league counts by the day, not by the sheet a group handed in. Every round in this league with the same date on the same loop is one card, so two fourballs round the same nine on a Sunday are one field of eight rather than two fields of four.</p><p>That is what every table here is built on.</p>", "One card is one day")}
    ${cards.length ? `<div class="rows">${cards.map(row).join("")}</div>` : `<p class="muted center" style="margin:30px 0">No cards in this league yet.</p>`}
    <button class="btn primary big" data-act="new-in-league">Start a round in this league</button>
    ${C.runs || A.signedIn() ? `<div class="rows" style="margin-top:18px"><a class="hrow" href="#league/${C.gid}/admin"><span class="t"><b>Add a round you played</b><span>Every finished round waiting to go in</span></span><span class="chev">›</span></a></div>` : ""}`,
    { back: `#league/${C.gid}`, runs: C.runs });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (b && b.dataset.act === "new-in-league") { S.setSetting("lastLeague", C.gid); return go("#new"); }
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
  shell(C.g, c.date ? fmtDate(c.date) : c.name, `
    <section class="inplay"><div class="rule"></div>
      <div class="k">${esc(dayWhere(c) || "The day")}</div>
      <h1>${esc(board[0] ? firstName(board[0].name) : "No scores")}</h1>
      <p class="where">${esc([c.date ? fmtDate(c.date) : "", plural(board.length, "player")].filter(Boolean).join(" · "))}</p></section>
    ${board.length ? `<div class="rows lboard">${board.map((p, i) => `<${p.id ? "a" : "div"} class="hrow lrow${isMyRow(p, C.me) ? " me" : ""}"${p.id ? ` href="#league/${C.gid}/p/${esc(p.id)}"` : ""}>
      <span class="lp num">${i + 1}</span><span class="t"><b>${esc(p.name)}</b><span>${esc([p.gross === null ? "no return" : `${p.gross} gross`, p.topar === null ? "" : fmtToPar(p.topar), D.basis === "net" ? `${p.pts} pts` : ""].filter(Boolean).join(" · "))}</span></span>
      <span class="v num">${esc(D.value(p))}<small class="u">${esc(D.unit)}</small></span></${p.id ? "a" : "div"}>`).join("")}</div>` : ""}
    ${changed}
    ${sect(sheets.length > 1 ? "The sheets handed in" : "The card")}
    <div class="rows">${sheets.map(M => `<a class="hrow" href="#review/${M.id}"><span class="t"><b>${esc(M.name)}</b><span>${plural(M.players.length, "player")}</span></span><span class="chev">›</span></a>`).join("")}</div>`,
    { back: isLast ? `#league/${C.gid}` : `#league/${C.gid}/days`, runs: C.runs });
  bind(async ev => { await common(C, ev); });
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
      ${others.length > 5 ? `<button class="hrow" data-act="pick-rival"><span class="t"><b>Somebody else</b><span>${plural(others.length - 5, "more player")} in this league</span></span><span class="chev">›</span></button>` : ""}</div>
    ${sect("Elsewhere")}
    <div class="rows">
      <a class="hrow" href="${personHash(pid)}"><span class="t"><b>Everything they have played</b><span>Every round, in every league</span></span><span class="chev">›</span></a>
      <a class="hrow" href="#leagueimages/${C.gid}"><span class="t"><b>Make images</b><span>${esc(firstName(p.name))}'s season as sheets, and the standings</span></span><span class="chev">›</span></a>
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
    if (b.dataset.act === "seasonmode") { ui.seasonMode[C.gid] = b.dataset.m; return playerView(C, pid, true); }
    if (b.dataset.act === "seasonwho") { ui.seasonWho[C.gid] = b.dataset.id; return playerView(C, pid, true); }
    if (b.dataset.act === "ninetab") { ui.nineTab[C.gid] = b.dataset.slug; return playerView(C, pid, true); }
  });
}

// ---------------------------------------------------------------- two players
function vsView(C, a, b) {
  const nameOf = id => { for (const M of C.Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };
  if (!C.members.includes(a) || !C.members.includes(b) || a === b) {
    const x = C.members.includes(a) ? a : C.members[0];
    const y = C.members.find(m => m !== x);
    if (!x || !y) { shell(C.g, "Head to head", `<p class="muted center" style="margin:30px 0">Head-to-heads appear once two players share a round in this league.</p>`, { back: `#league/${C.gid}`, runs: C.runs }); return bind(ev => common(C, ev)); }
    return go(`#league/${C.gid}/vs/${x}/${y}`);
  }
  const h2hKind = C.formats.find(f => f in MATCH_BASIS);
  const basis = H2H_BASES.some(([k]) => k === ui.basis[C.gid]) ? ui.basis[C.gid] : (h2hKind ? MATCH_BASIS[h2hKind] : "points");
  const H = headToHead(C.Ms, a, b, basis);
  const A_ = nameOf(a), B_ = nameOf(b), fA = firstName(A_), fB = firstName(B_);
  const [, basisName, roundWord, holeWord] = basisRow(basis);
  const head = `${sectRaw(`<button class="caps lfmt" data-act="vsbasis">${esc(basisName)} <i aria-hidden="true">⌄</i></button>`,
    infoBtn("Match play or stroke play?", `<p>This page keeps two scores, and they are two different games. Both are settled on ${esc(basisName.toLowerCase())}.</p>
      <p><b>Stroke play</b> settles the big score at the top: each round they played together goes to ${esc(roundWord)} that day. <b>Match play</b> settles the hole-by-hole part: every hole is its own contest, won by ${esc(holeWord)}, added up as one long match.</p>
      <p>${h2hKind ? `This league keeps a ${esc(FORMAT_NAMES[h2hKind])} table, so that is what it opens on.` : "A round only one of them finished a card for goes to the one who did, the way a hole does."}</p>`))}`;
  const sides = `<div class="vspick">
    <button class="vsname-btn" data-act="pick-a">${esc(A_)} <i aria-hidden="true">⌄</i></button>
    <button class="swapb" data-act="vsswap" title="Swap">&#8646;</button>
    <button class="vsname-btn" data-act="pick-b">${esc(B_)} <i aria-hidden="true">⌄</i></button></div>`;
  let body;
  if (!H.rounds.length) body = `${sides}${head}<p class="muted center" style="margin:30px 0">${esc(fA)} and ${esc(fB)} have not played a round together in this league yet.</p>`;
  else {
    const tot = H.winsA + H.ties + H.winsB;
    const pc = n => `${(n / tot) * 100}%`;
    const verdict = H.winsA === H.winsB ? `All square at ${H.winsA}&#8211;${H.winsB}` : `${esc(H.winsA > H.winsB ? fA : fB)} leads ${Math.max(H.winsA, H.winsB)}&#8211;${Math.min(H.winsA, H.winsB)}`;
    const streak = H.streak.n >= 2 ? `${esc(H.streak.who === "a" ? fA : fB)} has won the last ${H.streak.n}` : H.streak.n === 1 ? `${esc(H.streak.who === "a" ? fA : fB)} won the last one` : "the last one was halved";
    const holes = H.holesA + H.holesB + H.holesHalved;
    const widest = H.winsA >= H.winsB ? H.widestA : H.widestB;
    const num = v => v === null ? "NR" : v;
    const hero = `<div class="card vscard"><div class="modeline mid"><span class="modetag">Stroke play</span><span>rounds won on ${esc(basisWord(basis))}</span></div><div class="vsverdict">${verdict}</div>
      <div class="vs"><div class="vsside"><span class="vsdisc a">${esc(inits(A_))}</span><span class="vsname">${esc(A_)}</span></div>
        <div class="vsnum"><b class="num">${H.winsA}</b><s>&#8211;</s><b class="num">${H.winsB}</b><small>rounds won · ${H.ties ? plural(H.ties, "halved") : "none halved"}</small></div>
        <div class="vsside"><span class="vsdisc b">${esc(inits(B_))}</span><span class="vsname">${esc(B_)}</span></div></div>
      <div class="tug"><i class="a" style="width:${pc(H.winsA)}"></i><i class="t" style="width:${pc(H.ties)}"></i><i class="b" style="width:${pc(H.winsB)}"></i></div>
      <div class="vsline">${plural(H.rounds.length, "round")} together &middot; ${streak}</div></div>`;
    const formStrip = `${h2tip("Round by round", `Every round they played together, oldest first. Each square carries the initials of whoever took it on ${esc(basisWord(basis))}; = means they tied. Tap one to see that card.`)}<div class="vsform">${H.rounds.map(r => `<a class="fdot ${r.winner}" href="#review/${r.id}" title="${esc(fmtDate(r.date))} &middot; ${num(r.scoreA)}&#8211;${num(r.scoreB)}">${r.winner === "tie" ? "=" : esc(inits(r.winner === "a" ? A_ : B_))}</a>`).join("")}</div>`;
    const holesBlock = `${h2tip("Match play, hole by hole", `Every hole the two of them have played together, each one won by ${esc(holeWord)}. Added up as one long match: ${esc(fA)}'s holes on the left, halved holes in the middle, ${esc(fB)}'s on the right.`)}<div class="card">
      <div class="modeline"><span class="modetag">Match play</span><span>holes won on ${esc(basisWord(basis))}</span></div>
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
  shell(C.g, `${fA} v ${fB}`, `${body}
    ${C.members.length > 2 ? `${sect(`${fA} against`)}<div class="rows">${C.members.filter(m => m !== a && m !== b).slice(0, 5).map(m => `<a class="hrow" href="#league/${C.gid}/vs/${esc(a)}/${esc(m)}">
      <span class="t"><b>${esc(firstName(nameOf(m)))}</b></span><span class="chev">›</span></a>`).join("")}</div>` : ""}`,
    { back: `#league/${C.gid}/p/${a}`, runs: C.runs });
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
  shell(C.g, "The numbers", leagueStatsBody(C.g, C.Ms, C.members), { back: `#league/${C.gid}`, runs: C.runs, keepScroll: keep });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "seasonmode") { ui.seasonMode[C.gid] = b.dataset.m; return statsView(C, true); }
    if (b.dataset.act === "seasonwho") { ui.seasonWho[C.gid] = b.dataset.id; return statsView(C, true); }
    if (b.dataset.act === "ninetab") { ui.nineTab[C.gid] = b.dataset.slug; return statsView(C, true); }
  });
}

// ---------------------------------------------------------------- running the league
function adminView(C) {
  const { g, gid, runs } = C;
  const formats = C.formats;
  const attached = new Set(S.leagueRoundIds(gid));
  const byDate = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
  const done = S.rounds().filter(r => r.status === "done").sort(byDate);
  const inL = done.filter(r => attached.has(r.id));
  const rest = done.filter(r => !attached.has(r.id) && (S.iPlayed(r) || runs));
  const open = S.rounds().filter(r => r.status !== "done").sort(byDate);
  const roundRow = (r, on) => {
    const q = [fmtDate(r.date), roundWhere(r), r.name, ...r.entries.map(e => e.name)].join(" ").toLowerCase();
    const canToggle = S.iPlayed(r) || runs;   // a round is taken out by somebody who played it, or by whoever runs the league
    return `<div class="hrow arow" data-q="${esc(q)}">
      <a class="t" href="#review/${r.id}"><b>${esc(shortDate(r.date))} · ${esc(roundClub(r))}</b><span>${esc([roundLoop(r), plural(r.entries.length, "player")].filter(Boolean).join(" · "))}</span></a>
      ${canToggle ? `<button class="btn small ${on ? "" : "primary"}" data-act="toggle-round" data-rid="${r.id}" data-on="${on ? 0 : 1}">${on ? "Out" : "Add"}</button>` : `<span class="chev">›</span>`}</div>`;
  };
  shell(g, runs ? "Running the league" : "This league", `
    ${open.length ? `${sect("On the go")}<div class="rows">${open.map(r => `<a class="hrow" href="${resumeHash(r)}"><span class="t"><b>${esc(r.name)}</b><span>${esc(roundWhere(r))} · ${esc(roundStatus(r))}</span></span><span class="chev">›</span></a>`).join("")}</div>` : ""}
    ${sect("Cards in this league")}
    ${inL.length ? `<div class="rows">${inL.map(r => roundRow(r, true)).join("")}</div>` : `<p class="muted small" style="margin:4px 4px 10px">Nothing yet. Add a finished round below, or start a new one.</p>`}
    <button class="btn primary big" data-act="new-in-league">Start a round in this league</button>
    ${sect("Add a round")}
    ${rest.length ? `${rest.length > 6 ? `<input id="rq" class="search" placeholder="Search by date, course or player" autocomplete="off">` : ""}<div class="rows" id="rlist">${rest.map(r => roundRow(r, false)).join("")}</div>`
      : `<p class="muted small" style="margin:4px 4px 10px">Every finished round you played is already in this league.</p>`}
    ${settingsBody(C, formats)}`, { back: `#league/${gid}`, runs });
  wireSettings(C);
}

function settingsBody(C, formats) {
  const { g, gid, runs } = C;
  const member = S.myMembership(gid);
  const mine = S.FORMATS.filter(f => E.formatAllowed(f) || formats.includes(f));
  const missing = [...new Set(S.FORMATS.filter(f => !mine.includes(f)).map(f => E.FORMAT_SKU[f]))];
  return `${runs ? `${sect("How it is scored")}
    <form id="gform" class="card form open"><label style="margin-top:0">League name<input name="name" value="${esc(g.name)}"></label>
      <label>Scored by <span class="muted">(pick as many as you like; the first is what the league opens on)</span></label>
      <div class="fmtlist">${mine.map(f => `<label><input type="checkbox" name="fmt" value="${f}" ${formats.includes(f) ? "checked" : ""}> <span><b>${FORMAT_NAMES[f]}</b><small>${FORMAT_MODE[f]} · ${FORMAT_BLURB[f]}</small></span></label>`).join("")}</div>
      ${missing.length ? shopBtn("More ways of ranking in the shop", missing) : ""}
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="${g.bestN}"></label>
      <label>Theme <span class="muted">(what this league wears on screen and in its images)</span></label>
      <div class="themes" style="margin-top:8px">${themeRadios("ltheme", leagueTheme(g) ? g.theme : "", { theme: appTheme(), label: "App theme" })}</div>
      <button class="btn primary" type="submit">Save</button></form>` : ""}
    ${A.signedIn() ? `${sect("Members")}<div class="card" id="members"><p class="muted small">Loading…</p></div>` : ""}
    ${runs && C.members.length > 1 ? `<details class="card fold"><summary>Two spellings of one person?</summary>
      <p class="muted small">Merge them: every round, score and course handicap moves to the kept name, and the old spelling becomes an alias.</p>
      <div class="merge"><select id="mkeep">${C.members.map(m => `<option value="${m}">${esc(nameIn(C, m))}</option>`).join("")}</select><span>←</span><select id="mdrop">${C.members.map((m, i) => `<option value="${m}" ${i === 1 ? "selected" : ""}>${esc(nameIn(C, m))}</option>`).join("")}</select></div>
      <button class="btn small" data-act="merge" style="margin-top:8px">Merge into the first name</button></details>` : ""}
    ${runs && A.signedIn() ? `${sect("Who can read the table")}<div class="card">
        <p class="muted small" style="margin:0 0 8px">Members always see it. <b>Link</b> lets anyone with the link read the board; <b>public</b> also lets it be listed and found. Reading is not joining.</p>
        <div class="segpick">${[["private", "Private"], ["link", "Link"], ["public", "Public"]].map(([v, l]) => `<button data-act="vis" data-v="${v}" class="${(g.visibility || "private") === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <p class="muted small" style="margin:12px 0 6px"><b>Friendly</b>: anyone who joins can say which player is them. <b>Organised</b>: you confirm a claim before it counts.</p>
        <div class="segpick">${[["friendly", "Friendly"], ["organised", "Organised"]].map(([v, l]) => `<button data-act="kind" data-v="${v}" class="${(g.kind || "friendly") === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <label class="switch" style="margin-top:12px"><span>Show handicaps on the shared board</span><input type="checkbox" id="showhcp" ${g.showHandicaps === false ? "" : "checked"}></label>
        ${g.token && g.visibility && g.visibility !== "private" ? `<div class="btnrow"><button class="btn small" data-act="share-board">Share the board link</button><button class="btn small" data-act="reset-board">Reset it</button></div>` : ""}</div>
      ${sect("Invite links")}<div class="card" id="invites"><p class="muted small">Loading…</p></div>` : ""}
    ${g.createdBy ? `<p class="muted small center" style="margin-top:18px">Created by ${esc(g.createdBy)}${g.created ? ` on ${esc(fmtDate(g.created))}` : ""}</p>` : ""}
    <div class="btnrow">${member && g.owner !== S.myAccount() ? `<button class="btn danger" data-act="leave">Leave this league</button>` : ""}${runs ? `<button class="btn danger" data-act="del-league">Delete this league</button>` : ""}</div>`;
}

const nameIn = (C, id) => { for (const M of C.Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };

async function wireSettings(C) {
  const { g, gid, runs } = C;
  bindChips(app.querySelector(".themes"));
  const gf = document.getElementById("gform");
  if (gf) gf.addEventListener("submit", ev => {
    ev.preventDefault();
    g.name = ev.target.name.value.trim() || g.name; g.bestN = Number(ev.target.bestN.value) || 0;
    g.formats = S.cleanFormats([...ev.target.querySelectorAll("input[name=fmt]:checked")].map(i => i.value));
    g.theme = ev.target.ltheme.value || null;
    S.saveLeague(g); paint(themeHere()); toast("Saved"); go(`#league/${gid}`);
  });
  const showhcp = document.getElementById("showhcp");
  if (showhcp) showhcp.addEventListener("change", ev => {
    F.setVisibility(gid, { showHandicaps: ev.target.checked }).then(r => { g.showHandicaps = r.showHandicaps; S.afterPull(); toast("Saved"); }).catch(e => { toast(e.message, 5000); league(gid, "admin"); });
  });
  const rq = document.getElementById("rq");
  if (rq) rq.addEventListener("input", () => {
    const t = rq.value.toLowerCase().trim();
    document.querySelectorAll("#rlist .arow").forEach(l => { l.style.display = !t || l.dataset.q.includes(t) ? "" : "none"; });
  });
  bind(async ev => {
    if (await common(C, ev)) return;
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "new-in-league") { S.setSetting("lastLeague", gid); return go("#new"); }
    if (act === "toggle-round") { S.setLeagueRound(gid, b.dataset.rid, b.dataset.on === "1"); return league(gid, "admin"); }
    if (act === "merge") {
      const keep = document.getElementById("mkeep").value, drop = document.getElementById("mdrop").value;
      if (keep === drop) return toast("Pick two different names");
      if (!await confirmSheet("Merge these names?", `${nameIn(C, drop)} becomes ${nameIn(C, keep)} on every phone. This cannot be undone.`, { label: "Merge", danger: true })) return;
      S.mergePlayers(keep, drop); toast("Merged"); return league(gid, "admin");
    }
    if (act === "vis" || act === "kind") {
      const body = act === "vis" ? { visibility: b.dataset.v } : { kind: b.dataset.v };
      F.setVisibility(gid, body).then(r => { Object.assign(g, { visibility: r.visibility, kind: r.kind, token: r.token || g.token, showHandicaps: r.showHandicaps }); S.afterPull(); league(gid, "admin"); }).catch(e => toast(e.message, 5000));
    }
    if (act === "reset-board") {
      if (!await confirmSheet("Reset the board link?", "The old link stops working for everyone who has it.", { label: "Reset", danger: true })) return;
      F.setVisibility(gid, { resetLink: true }).then(r => { g.token = r.token; S.afterPull(); toast("New link made"); league(gid, "admin"); }).catch(e => toast(e.message, 5000));
    }
    if (act === "revoke") { try { await F.revokeInvite(gid, b.dataset.id); toast("Link revoked"); league(gid, "admin"); } catch (e) { toast(e.message, 5000); } }
    if (act === "confirm-claim") { try { await F.confirmClaim(gid, b.dataset.id); toast("Confirmed"); await Y.pull(); league(gid, "admin"); } catch (e) { toast(e.message, 5000); } }
    if (act === "claim-me") { try { const r = await F.candidatesOf(gid); await claimSheet(gid, r.candidates); league(gid, "admin"); } catch (e) { toast(e.message, 5000); } }
    if (act === "leave") {
      if (!await confirmSheet("Leave this league?", "Your rounds stay on its cards; you stop seeing the table.", { label: "Leave", danger: true })) return;
      try { await F.leaveLeague(gid); await Y.pull(); toast("You left the league"); go("#leagues"); } catch (e) { toast(e.message, 5000); }
    }
    if (act === "del-league") {
      if (!await confirmSheet("Delete this league?", "It goes for every member. Rounds and players stay.", { label: "Delete", danger: true })) return;
      S.deleteLeague(gid); go("#leagues");
    }
  });
  if (!A.signedIn()) return;
  const box = document.getElementById("members");
  try {
    const r = await F.membersOf(gid);
    const me = S.myAccount();
    const mineM = r.members.find(m => m.id === me);
    const pending = runs ? (await F.pendingClaims(gid).catch(() => ({ pending: [] }))).pending : [];
    if (box) box.innerHTML = `
      ${pending.length ? `<p class="muted small">Waiting for you to confirm:</p><div class="list">${pending.map(p => `<div><span class="lead">${avatar(p.who || "?")}<div><div class="name">${esc(p.who || "Somebody")}</div><div class="muted small">says they are ${esc(p.name || "a player")}</div></div></span><button class="btn small primary" data-act="confirm-claim" data-id="${esc(p.account_id)}">Confirm</button></div>`).join("")}</div>` : ""}
      <div class="list">${r.members.map(m => `<a href="${m.id === me ? "#me" : `#person/${esc(m.id)}`}"><span class="lead">${avatar(m.name || "?")}<div><div class="name">${esc(m.name || "Somebody")}</div>${m.role && m.role !== "member" ? `<div class="muted small">${esc(m.role)}</div>` : ""}</div></span><span class="chev">›</span></a>`).join("")}</div>
      ${mineM && mineM.claim === "none" ? `<button class="btn small" data-act="claim-me" style="margin-top:8px">Which player on the cards is me?</button>` : ""}`;
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
  if (act === "share-board") { await boardShare(C.g); return true; }
  if (act === "lgmore") {
    const v = await sheet({ title: C.g.name, body: `<div class="list">
      <button data-sheet="images"><div><div class="name">Make images</div></div><span class="chev">›</span></button>
      <button data-sheet="admin"><div><div class="name">${C.runs ? "Running the league" : "Members and this league"}</div></div><span class="chev">›</span></button></div>`,
      actions: [{ label: "Close", value: "no" }] });
    if (v === "images") go(`#leagueimages/${C.gid}`);
    if (v === "admin") go(`#league/${C.gid}/admin`);
    return true;
  }
  return false;
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
  if (view === "admin") return adminView(C);
  return boardView(C, keep);
}
