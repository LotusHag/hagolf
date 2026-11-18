// People: your friends, the requests either way, everybody you have typed onto a card, and the search box.
// A friend, from here, is a page with their game on it: their numbers, their latest rounds, and yours together.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import * as Y from "../sync.js";
import { page, scrollPos, scrollAt, bind, esc, go, toast, ui, plural, firstName, ordinal, fmtDate, shortDate, avatar, sheet, confirmSheet, shareLink, qrHtml, appBase, ICONS, emptyState, roundClub, roundLoop, safeCompute, saveFiles, subtabs, courseBy, courseTitle } from "../ui.js";
import { compute, fmtIndex, fmtToPar, halves, statSummary, isMatchFormat, isTeamFormat } from "../model.js";
import { statLine, statHolesOf } from "./extras.js";
import { playerRounds, ninesPlayerBlock, gameOf, gameBody } from "./stats.js";
import { buildRound, courseOf } from "./public.js";
import { shotsBody } from "./shots.js";
import { leagueResults, standingsFor, standingValue, MATCH_BASIS, ELO_BASIS } from "./formats.js";
import { myCard, nineLine } from "./review.js";
import { matchFor } from "./mine.js";
import { nineName } from "./play.js";
import { inviteSheet } from "./league.js";
import { parseHI, hiOk } from "../ui.js";

let searchTimer = null;

/** The line under a friend's name: their index and where they last played. */
function friendSub(f) {
  const c = f.last && courseBy(f.last.course);
  return [f.hi !== null && f.hi !== undefined ? `index ${fmtIndex(Number(f.hi))}` : "", f.last ? `${shortDate(f.last.date)}${c ? `, ${courseTitle(c)}` : ""}` : "no rounds yet"].filter(Boolean).join(" · ");
}
const lastDate = f => (f.last && f.last.date) || "";

export function people() {
  const acct = A.account();
  const held = F.held();
  const me = S.me();
  const friendIds = new Set(held.friends.map(f => f.id));
  const contacts = S.players().filter(p => (!me || p.id !== me.id) && !friendIds.has(p.linkedAccount)).sort((a, b) => a.name.localeCompare(b.name));
  const personRow = (p, sub, href, extra = "") => `<a href="${href}"><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">${esc(sub)}</div></div></span>${extra}<span class="chev">›</span></a>`;
  const friends = [...held.friends].sort((x, y) => lastDate(y).localeCompare(lastDate(x)) || x.name.localeCompare(y.name));
  const q = ui.search || "";
  const found = ui.found;
  page("People", `
    ${acct ? `<input id="q" class="search" placeholder="Find someone you've played with" value="${esc(q)}" autocomplete="off" autocapitalize="off">
    ${q.trim().length >= 2 ? `<div class="list" id="found">${found === null ? `<div class="muted small">Searching…</div>` : found.length ? found.map(p => `<div><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">${p.league ? "in a society with you" : "played with you"}</div></div></span>
        ${p.state === "accepted" ? `<a class="btn small" href="#person/${esc(p.id)}">Friend</a>` : p.state === "requested" ? `<span class="muted small">Asked</span>` : `<button class="btn small primary" data-act="request" data-id="${esc(p.id)}">Add</button>`}</div>`).join("")
        : `<div class="muted small">Nobody by that name you've shared a card or a society with. Send them your link instead.</div>`}</div>` : ""}` : `<div class="banner"><a href="#welcome">Sign in</a> to add friends.</div>`}
    ${held.incoming.length ? `<h2>Requests</h2><div class="list">${held.incoming.map(p => `<div><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">wants to be your friend</div></div></span>
      <span class="btnrow" style="margin:0;flex:none"><button class="btn small primary" data-act="accept" data-id="${esc(p.id)}">Accept</button><button class="btn small" data-act="decline" data-id="${esc(p.id)}">No</button></span></div>`).join("")}</div>` : ""}
    ${friends.length ? `<h2>Friends</h2><div class="list">${friends.map(f => personRow(f, friendSub(f), `#person/${esc(f.id)}`)).join("")}</div>`
      : acct ? emptyState("people", "No friends yet", "Find someone you've played with above, or send them your link.") : ""}
    ${acct ? `<div class="btnrow"><button class="btn" data-act="mylink">${ICONS.link} Send my link</button><button class="btn" data-act="myqr">${ICONS.qr} My QR code</button></div>` : ""}
    ${held.outgoing.length ? `<h2>Asked</h2><div class="list">${held.outgoing.map(p => `<div><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">waiting for them</div></div></span><button class="btn small" data-act="decline" data-id="${esc(p.id)}">Cancel</button></div>`).join("")}</div>` : ""}
    ${contacts.length ? `<h2>On your cards</h2><div class="list">${contacts.map(p => personRow(p, [p.hi !== null && p.hi !== undefined ? `index ${fmtIndex(Number(p.hi))}` : "", plural(S.roundsOf(p.id).filter(r => r.status === "done").length, "round")].filter(Boolean).join(" · "), `#player/${p.id}`)).join("")}</div>` : ""}`,
    { back: "#me", bell: false });
  const qEl = document.getElementById("q");
  if (qEl) qEl.addEventListener("input", () => {
    ui.search = qEl.value;
    clearTimeout(searchTimer);
    if (qEl.value.trim().length < 2) { ui.found = null; return redraw(); }
    ui.found = null;
    searchTimer = setTimeout(async () => {
      try { const r = await F.search(qEl.value.trim()); ui.found = r.people; } catch (e) { ui.found = []; toast(e.message, 4000); }
      if (location.hash === "#people") redraw();
    }, 350);
  });
  const redraw = () => { const y = scrollPos(); people(); scrollAt(y); const n = document.getElementById("q"); if (n && document.activeElement !== n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    try {
      if (act === "request") { b.disabled = true; const r = await F.request(id); toast(r.state === "accepted" ? "You are now friends" : "Asked"); ui.found = null; ui.search = ""; }
      if (act === "accept") { await F.accept(id); toast("You are now friends"); }
      if (act === "decline") { await F.decline(id); }
      if (act === "mylink") return shareLink(myLink(), "Add me on Hagolf", "Add me on Hagolf");
      if (act === "myqr") return sheet({ title: "Your friend link", lead: "Whoever scans this and taps Add is your friend straight away.", body: `${qrHtml(myLink())}<div class="linkbox">${esc(myLink())}</div>`, actions: [{ label: "Done", value: "ok", kind: "primary" }] });
    } catch (e) { toast(e.message, 5000); }
    people();
  });
  const before = JSON.stringify(held);
  if (acct) F.refresh().then(next => { if (location.hash === "#people" && JSON.stringify(next) !== before) redraw(); });
}

export const myLink = () => `${appBase()}#add/${(A.account() || {}).handle || ""}`;

// ---------------------------------------------------------------- a friend's game
const GAME_KEY = id => `hagolf-game-${id}`;
const heldGame = id => { try { return JSON.parse(localStorage.getItem(GAME_KEY(id))) || null; } catch (e) { return null; } };
const keepGame = (id, g) => { try { localStorage.setItem(GAME_KEY(id), JSON.stringify(g)); } catch (e) { /* full */ } };

/** A friend's rounds as the server hands them over (their own seat only), computed like my own. */
function friendGame(id, name, G) {
  const Ms = [];
  for (const r of (G && G.rounds) || []) {
    if (isTeamFormat(r.format) || isMatchFormat(r.format)) continue;
    const course = courseOf(r.course, G.courses);
    if (!course) continue;
    const entry = { id, name, hi: r.seat.hi, tee: r.seat.tee, gender: r.seat.gender, courseHandicap: r.seat.courseHandicap, group: 1, fromHole: r.seat.fromHole, penalties: r.seat.penalties };
    try { Ms.push(buildRound(null, r, [entry], r.scores.map(([hole, strokes]) => ({ id, hole, strokes })), course)); }
    catch (e) { console.warn("friend round left out", r.id, e.message); }
  }
  return gameOf(Ms, id);
}

/** Their latest rounds: the ones we played together open; the rest are theirs and only listed. */
function latestRounds(G, id) {
  const rows = ((G && G.rounds) || []).slice(0, 12).map(r => {
    const c = courseOf(r.course, G.courses);
    const mine = S.getRound(r.id);
    const M = mine ? safeCompute(compute, mine, true) : null;
    const x = M && M.players.find(q => q.id === id);
    const body = `<div><div class="name">${esc(c ? courseTitle(c) : r.name)}</div><div class="muted small">${esc(fmtDate(r.date))}${x ? ` · ${x.pts} pts` : ""}</div></div>`;
    return mine ? `<a href="#review/${r.id}">${body}<span class="chev">›</span></a>` : `<div>${body}</div>`;
  }).join("");
  return rows ? `<h2>Latest rounds</h2><div class="list">${rows}</div>` : "";
}

const TOPICS = [["scoring", "Scoring"], ["trends", "Trends"]];

/** One account: a friend, with their game, or somebody in a society with me. */
export async function person(id, topic) {
  if (!id) return go("#people");
  const me = S.myAccount();
  if (id === me) return go("#me");
  const f = F.friendById(id);
  const held = F.held();
  const incoming = held.incoming.find(p => p.id === id), outgoing = held.outgoing.find(p => p.id === id);
  const contacts = S.players().filter(p => p.linkedAccount === id);
  const name = f ? f.name : incoming ? incoming.name : outgoing ? outgoing.name : contacts[0] ? contacts[0].name : "Somebody";
  const first = firstName(name);
  const on = TOPICS.some(([k]) => k === topic) ? topic : "scoring";
  const mine = S.me();
  const together = mine ? S.rounds().filter(r => r.status === "done" && r.entries.some(e => e.playerId === mine.id) && r.entries.some(e => S.identityOf(e.playerId) === id || e.accountId === id)) : [];
  const roundRow = r => {
    const M = safeCompute(compute, r);
    const them = M ? M.players.find(p => p.id === id || contacts.some(c => c.id === p.id) || (r.entries.find(e => e.playerId === p.id) || {}).accountId === id) : null;
    const us = M && mine ? M.players.find(p => p.id === mine.id) : null;
    const loop = roundLoop(r);
    return `<a href="#review/${r.id}"><div><div class="name">${esc(roundClub(r))}</div><div class="muted small">${loop ? `${esc(loop)} · ` : ""}${esc(fmtDate(r.date))}${them ? ` · ${esc(first)} ${them.pts} pts` : ""}${us ? ` · you ${us.pts} pts` : ""}</div></div><span class="chev">›</span></a>`;
  };
  const draw = (G, keep) => page(name, `
    <div class="person">${avatar(name, "big")}<div class="who"><div class="name">${esc(name)}</div><div class="handle">${f ? esc(friendSub(f)) : incoming ? "wants to be your friend" : outgoing ? "asked, waiting for them" : "not a friend yet"}</div></div></div>
    ${incoming ? `<div class="btnrow"><button class="btn primary" data-act="accept">Accept</button><button class="btn" data-act="decline">No</button></div>` : ""}
    ${!f && !incoming && !outgoing && A.signedIn() ? `<div class="btnrow"><button class="btn primary" data-act="request">${ICONS.friend} Add as a friend</button></div>` : ""}
    ${f ? `${subtabs(TOPICS.map(([k, label]) => `<button data-act="tab" data-t="${k}" class="${k === on ? "on" : ""}">${label}</button>`).join(""))}
      ${G ? gameBody(friendGame(id, name, G), on, first) : `<p class="muted center" style="margin:30px 0">Loading ${esc(first)}'s rounds…</p>`}
      ${on === "scoring" && G ? latestRounds(G, id) : ""}` : ""}
    ${together.length ? `<h2>Rounds together</h2><div class="list">${together.map(roundRow).join("")}</div>` : ""}
    ${f ? `<div class="list" style="margin-top:18px">
      <button data-act="invite"><span class="lead">${ICONS.trophy}<div><div class="name">Invite to a society</div></div></span><span class="chev">›</span></button>
      <button data-act="sharecard"><span class="lead">${ICONS.card}<div><div class="name">Send ${esc(first)} a card</div></div></span><span class="chev">›</span></button>
    </div>` : ""}
    ${f || outgoing ? `<div class="btnrow" style="margin-top:24px">${f ? `<button class="btn danger" data-act="remove">Remove friend</button>` : `<button class="btn" data-act="decline">Cancel</button>`}<button class="btn danger" data-act="block">Block</button></div>` : ""}`,
    { back: "#people", keepScroll: keep });
  const onClick = async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === "tab") return go(b.dataset.t === "scoring" ? `#person/${id}` : `#person/${id}/${b.dataset.t}`);
      if (act === "request") { const r = await F.request(id); toast(r.state === "accepted" ? "You are now friends" : "Asked"); return person(id); }
      if (act === "accept") { await F.accept(id); toast("You are now friends"); return person(id); }
      if (act === "decline") { await F.decline(id); return person(id); }
      if (act === "remove") { if (await confirmSheet(`Remove ${first}?`, "You stop seeing each other's numbers. You can add each other again any time.", { label: "Remove", danger: true })) { await F.remove(id); go("#people"); } return; }
      if (act === "block") { if (await confirmSheet(`Block ${first}?`, "They cannot find you, ask you or share cards with you. They are not told. Societies you are both in are unchanged.", { label: "Block", danger: true })) { await F.block(id); go("#people"); } return; }
      if (act === "invite") {
        const gs = S.leagues();
        if (!gs.length) return toast("You have no society to invite them to yet");
        const v = await sheet({ title: `Invite ${first} to`, body: `<div class="list">${gs.map(g => `<button data-act="${esc(g.id)}" data-sheet-act><span class="lead">${ICONS.trophy}<div><div class="name">${esc(g.name)}</div></div></span><span class="chev">›</span></button>`).join("")}</div>`, actions: [{ label: "Cancel", value: "no" }] });
        if (v && v !== "no") { await F.inviteFriend(v, id); toast("Invited"); }
        return;
      }
      if (act === "sharecard") {
        const rs = S.rounds().filter(r => r.status === "done" && S.iPlayed(r)).slice(0, 30);
        if (!rs.length) return toast("No finished card of yours to send yet");
        const v = await sheet({ title: `Send ${first} a card`, body: `<div class="list">${rs.map(r => `<button data-act="${esc(r.id)}" data-sheet-act><div><div class="name">${esc(roundClub(r))}</div><div class="muted small">${roundLoop(r) ? `${esc(roundLoop(r))} · ` : ""}${esc(fmtDate(r.date))}</div></div><span class="chev">›</span></button>`).join("")}</div>`, actions: [{ label: "Cancel", value: "no" }] });
        if (v && v !== "no") { await F.shareRound(v, [id]); toast("Sent"); }
      }
    } catch (e) { toast(e.message, 5000); }
  };
  const show = (G, keep = false) => { draw(G, keep); bind(onClick); };
  show(f ? heldGame(id) : null, !!topic);
  if (!f || !A.signedIn()) return;
  try {
    const G = await F.game(id);
    keepGame(id, G);
    if (location.hash.startsWith(`#person/${id}`)) show(G, true);
  } catch (e) { if (!heldGame(id)) toast(e.message, 5000); }
}

/** A name on my cards gets its own link: opening it and tapping "These are mine" makes those rounds theirs. */
export async function sendTheirRounds(p) {
  try {
    const r = await F.contactLink(p.id);
    await shareLink(r.url, "Your rounds on Hagolf", `${firstName(p.name)}, the rounds I kept for you on Hagolf`);
  } catch (e) { toast(e.message, 5000); }
}

/** A contact on my cards: their rounds, their form, and the place their name and index are edited. */
export function player(id) {
  const p = S.state.players.find(x => x.id === id && !x.deleted);
  // a league collapses a claimed contact into the account that claimed it, so an id from a board is as often
  // an account as a contact: send it to the page that knows about it rather than dropping it on the friends tab
  if (!p) return S.players().some(x => x.linkedAccount === id) || id === S.myAccount() ? person(id) : go("#people");
  const me = S.me();
  const isMe = !!me && me.id === p.id;
  const rs = playerRounds(p.id);
  // a match is won on holes, so its strokes and points stay out of the numbers below
  const golf = rs.filter(o => !isMatchFormat(o.r.format));
  const pts = golf.map(o => o.x.pts);
  const grosses = golf.map(o => o.x.gross).filter(g => g !== null);
  const wins = golf.filter(o => o.x.splace === 1).length;
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const stats = golf.length ? `<div class="mecard"><div class="stats">${tile(golf.length, plural(golf.length, "round").split(" ")[1])}${tile(Math.max(...pts), "best pts")}${tile((pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1), "average")}${grosses.length ? tile(Math.min(...grosses), "best gross") : ""}${wins ? tile(wins, plural(wins, "win").split(" ")[1]) : ""}</div></div>` : "";
  const leagueLines = S.leagues().map(g => {
    const { Ms, members } = leagueResults(g);
    const kind = S.cleanFormats(g.formats)[0];
    const row = standingsFor(g, Ms, members, kind).rows.find(r => r.id === S.identityOf(p.id) || r.id === p.id);
    return row ? `<a href="#league/${g.id}/p/${esc(row.id)}"><div><div class="name">${esc(g.name)}</div><div class="muted small">${kind in MATCH_BASIS ? plural(row.played, "match") : kind in ELO_BASIS ? plural(row.played, "day") : `${plural(row.played, "round")} counted`}</div></div><span class="pill done">${ordinal(row.place)} · ${standingValue(kind, row)}</span></a>` : "";
  }).filter(Boolean).join("");
  const list = rs.map(({ r, M, x }) => {
    const seat = r.entries.find(e => e.playerId === p.id);
    const won = seat ? matchFor(M, seat, r) : null;
    if (won) return `<div class="rround card"><a href="#review/${r.id}" style="display:block"><div class="d">${esc(fmtDate(r.date))}</div><div class="name">${esc(roundClub(r))}</div>
        ${roundLoop(r) ? `<div class="loop">${esc(roundLoop(r))}</div>` : ""}
        <div class="res"><span class="big num">${esc(won.margin)}<small>${won.word.toLowerCase()}</small></span><span class="muted">${esc([won.against, "match play"].join(" · "))}</span></div></a></div>`;
    const H = halves(M, x);
    const split = H && H.length > 1 ? `<div class="nines">${H.map(h => `<span><b>${esc(nineName(h.slug))}</b> ${h.gross === null ? "–" : `${h.gross} ${fmtToPar(h.topar)}`} · ${h.pts} pts</span>`).join("")}</div>` : "";
    return `<div class="rround card"><a href="#review/${r.id}" style="display:block"><div class="d">${esc(fmtDate(r.date))}</div><div class="name">${esc(roundClub(r))}</div>
        ${roundLoop(r) ? `<div class="loop">${esc(roundLoop(r))}</div>` : ""}
        <div class="res"><span class="big num">${x.pts}<small>pts</small></span><span class="muted">${ordinal(x.splace)} of ${M.field}${x.gross !== null ? ` · gross ${x.gross} ${fmtToPar(x.topar)}` : " · no return"}</span></div>${split}
        ${x.statline.any ? `<div class="muted small">${esc(statLine(x.statline))}</div>` : ""}</a>
      <button class="btn small" data-act="my-card" data-rid="${r.id}" data-pid="${p.id}">Send card</button></div>`;
  }).join("");
  const career = statSummary(statHolesOf(golf, p.id));
  const nines = ninesPlayerBlock(S.roundsOf(p.id), p.id, isMe ? "you" : firstName(p.name));
  const linkedTo = p.linkedAccount && !isMe ? F.friendById(p.linkedAccount) : null;
  const ownName = !isMe && A.signedIn() && p.owner === S.myAccount();
  const first = firstName(p.name);
  page(isMe ? "My rounds" : p.name, `
    <div class="person">${avatar(p.name, "big")}<div class="who"><div class="name">${esc(p.name)}</div><div class="handle">${p.hi !== null && p.hi !== undefined ? `index ${fmtIndex(Number(p.hi))} · ` : ""}${p.gender === "f" ? "women's rating" : "men's rating"} · ${plural(rs.length, "round")}${linkedTo ? ` · <a href="#person/${esc(p.linkedAccount)}">friend</a>` : ""}</div></div></div>
    ${ownName && !p.linkedAccount ? `<div class="btnrow"><button class="btn primary" data-act="send-rounds">${ICONS.share} Send ${esc(first)} their rounds</button></div>` : ""}
    ${ownName && p.linkedAccount ? `<div class="btnrow"><button class="btn small" data-act="not-them">Not ${esc(first)}?</button></div>` : ""}
    ${stats}
    ${leagueLines ? `<h2>Societies</h2><div class="list">${leagueLines}</div>` : ""}
    ${shotsBody(career, golf.map(o => o.M), p.id, "everyone else on the card")}
    ${nines}
    <h2>Rounds</h2>
    ${list || `<p class="muted center">No finished rounds yet.</p>`}
    ${isMe ? "" : `<details class="card"><summary class="small">Name, index and rating</summary>
      <form class="form open" id="pform"><label>Name<input name="name" value="${esc(p.name)}" autocapitalize="words" required></label>
        <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" value="${p.hi !== null && p.hi !== undefined ? fmtIndex(Number(p.hi)) : ""}"></label>
        <label>Rating<select name="gender"><option value="m" ${p.gender !== "f" ? "selected" : ""}>Men's</option><option value="f" ${p.gender === "f" ? "selected" : ""}>Women's</option></select></label></div>
        <div class="two"><button class="btn primary" type="submit">Save</button>${rs.length ? "" : `<button class="btn danger" type="button" data-act="del-player">Delete</button>`}</div></form></details>`}`,
    { back: isMe ? "#me" : "#people" });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "my-card") return myCard(b.dataset.rid, b.dataset.pid);
    if (b.dataset.act === "send-rounds") return sendTheirRounds(p);
    if (b.dataset.act === "not-them") {
      if (!await confirmSheet(`Not ${first}?`, `The account you linked stops being ${first} on your cards: those rounds go back to the name, and you stop being friends.`, { label: "Unlink", danger: true })) return;
      try { await F.contactUnlink(p.id); toast("Back to just a name"); await Y.resync(); player(id); } catch (e) { toast(e.message, 5000); }
    }
    if (b.dataset.act === "del-player" && await confirmSheet("Delete this player?", "They go from your address book on every phone.", { label: "Delete", danger: true })) { S.deletePlayer(p.id); go("#people"); }
  });
  const pform = document.getElementById("pform");
  if (pform) pform.addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, raw = f.hi.value.trim(), hi = raw ? parseHI(raw) : null;
    if (raw && !hiOk(hi)) return toast("Handicap index between +10 and 54");
    const other = S.findPlayer(f.name.value);
    if (other && other.id !== p.id) return toast("Another player already has that name");
    if (hi !== p.hi) p.hiUpdated = new Date().toISOString();
    p.hi = hi; p.gender = f.gender.value;
    if (f.name.value.trim() !== p.name) S.renamePlayer(p, f.name.value); else { S.touch("players", p); S.save(); }
    toast("Saved"); player(id);
  });
}
