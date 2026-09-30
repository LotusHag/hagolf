// People: your friends, the requests either way, everybody you have typed onto a card, and the search box.
// One person, from here, is a page: rounds together, and the things you can do with them.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, ui, plural, firstName, ordinal, fmtDate, avatar, sheet, confirmSheet, shareLink, qrHtml, appBase, ICONS, emptyState, h2tip, roundClub, roundLoop, safeCompute, saveFiles } from "../ui.js";
import { compute, fmtIndex, fmtToPar, halves, statSummary, strokesGained } from "../model.js";
import { statTiles, statLine, sgBlock, SG_TIP, STATS_TIP, statHolesOf } from "./extras.js";
import { playerRounds, ninesPlayed } from "./stats.js";
import { leagueResults } from "./formats.js";
import { myCard, nineLine } from "./review.js";
import { nineName } from "./play.js";
import { inviteSheet } from "./league.js";
import { parseHI, hiOk } from "../ui.js";

let searchTimer = null;

export function people() {
  const acct = A.account();
  const held = F.held();
  const me = S.me();
  const friendIds = new Set(held.friends.map(f => f.id));
  const contacts = S.players().filter(p => (!me || p.id !== me.id) && !friendIds.has(p.linkedAccount)).sort((a, b) => a.name.localeCompare(b.name));
  const personRow = (p, sub, href, extra = "") => `<a href="${href}"><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">${sub}</div></div></span>${extra}<span class="chev">›</span></a>`;
  const q = ui.search || "";
  const found = ui.found;
  page("People", `
    ${acct ? `<input id="q" class="search" placeholder="Find people by name or @handle" value="${esc(q)}" autocomplete="off" autocapitalize="off">
    ${q.trim().length >= 2 ? `<div class="list" id="found">${found === null ? `<div class="muted small">Searching…</div>` : found.length ? found.map(p => `<div><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">@${esc(p.handle || "")}${p.league ? " · in a league with you" : ""}</div></div></span>
        ${p.state === "accepted" ? `<span class="pill done">friend</span>` : p.state === "requested" ? `<span class="pill">requested</span>` : `<button class="btn small primary" data-act="request" data-id="${esc(p.id)}">Add</button>`}</div>`).join("")
        : `<div class="muted small">Nobody found. People who share a league with you, and anyone who has switched on "everyone", can be found by name. Or ask for their link.</div>`}</div>` : ""}` : `<div class="banner"><a href="#welcome">Sign in</a> to find friends.</div>`}
    ${held.incoming.length ? `<h2>Requests</h2><div class="list">${held.incoming.map(p => `<div><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">wants to be your friend</div></div></span>
      <span class="btnrow" style="margin:0;flex:none"><button class="btn small primary" data-act="accept" data-id="${esc(p.id)}">Accept</button><button class="btn small" data-act="decline" data-id="${esc(p.id)}">No</button></span></div>`).join("")}</div>` : ""}
    ${held.outgoing.length ? `<h2>Sent</h2><div class="list">${held.outgoing.map(p => `<div><span class="lead">${avatar(p.name)}<div><div class="name">${esc(p.name)}</div><div class="muted small">waiting for them</div></div></span><button class="btn small" data-act="decline" data-id="${esc(p.id)}">Cancel</button></div>`).join("")}</div>` : ""}
    ${held.friends.length ? `<h2>Friends</h2><div class="list">${held.friends.map(f => personRow(f, `${f.hi !== null && f.hi !== undefined ? `index ${fmtIndex(Number(f.hi))} · ` : ""}${plural(f.together, "round")} together`, `#person/${esc(f.id)}`)).join("")}</div>`
      : acct ? emptyState("people", "No friends yet", "Search by name above, or share your link so they can add you.") : ""}
    ${acct ? `<div class="btnrow"><button class="btn" data-act="mylink">${ICONS.link} Share my link</button><button class="btn" data-act="myqr">${ICONS.qr} My QR code</button></div>` : ""}
    ${contacts.length ? `<h2>Played with</h2><p class="muted small" style="margin:-4px 4px 8px">Names typed onto your cards. Tap one to see their rounds, or to fix a name or an index.</p><div class="list">${contacts.map(p => personRow(p, `${p.hi !== null && p.hi !== undefined ? `index ${fmtIndex(Number(p.hi))} · ` : ""}${plural(S.roundsOf(p.id).filter(r => r.status === "done").length, "round")}`, `#player/${p.id}`)).join("")}</div>` : ""}`,
    { back: "", tabs: "people" });
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
  const redraw = () => { const y = window.scrollY; people(); window.scrollTo(0, y); const n = document.getElementById("q"); if (n && document.activeElement !== n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    try {
      if (act === "request") { await F.request(id); toast("Request sent"); ui.found = null; ui.search = ""; }
      if (act === "accept") { await F.accept(id); toast("You are now friends"); }
      if (act === "decline") { await F.decline(id); }
      if (act === "mylink") return shareLink(myLink(), "Add me on Hagolf", `Add me on Hagolf: ${myLink()}`);
      if (act === "myqr") return sheet({ title: "Your friend link", lead: "Let them scan this with their camera.", body: `${qrHtml(myLink())}<div class="linkbox">${esc(myLink())}</div>`, actions: [{ label: "Done", value: "ok", kind: "primary" }] });
    } catch (e) { toast(e.message, 5000); }
    people();
  });
  const before = JSON.stringify(held);
  if (acct) F.refresh().then(next => { if (location.hash === "#people" && JSON.stringify(next) !== before) redraw(); });
}

export const myLink = () => `${appBase()}#add/${(A.account() || {}).handle || ""}`;

/** One account: a friend, or somebody in a league with me. */
export async function person(id) {
  if (!id) return go("#people");
  const me = S.myAccount();
  if (id === me) return go("#me");
  const f = F.friendById(id);
  const held = F.held();
  const incoming = held.incoming.find(p => p.id === id), outgoing = held.outgoing.find(p => p.id === id);
  // everything I know about them locally: contacts linked to their account, and the rounds we shared
  const contacts = S.players().filter(p => p.linkedAccount === id);
  const name = f ? f.name : incoming ? incoming.name : outgoing ? outgoing.name : contacts[0] ? contacts[0].name : "Somebody";
  const rounds = S.rounds().filter(r => r.status === "done" && r.entries.some(e => S.identityOf(e.playerId) === id));
  const mine = S.me();
  const together = mine ? rounds.filter(r => r.entries.some(e => e.playerId === mine.id)) : [];
  const roundRow = r => {
    const M = safeCompute(compute, r);
    const them = M ? M.players.find(p => p.id === id || contacts.some(c => c.id === p.id)) : null;
    const us = M && mine ? M.players.find(p => p.id === mine.id) : null;
    const loop = roundLoop(r);
    return `<a href="#review/${r.id}"><div><div class="name">${esc(roundClub(r))}</div><div class="muted small">${loop ? `${esc(loop)} · ` : ""}${esc(fmtDate(r.date))}${them ? ` · ${esc(firstName(name))} ${them.pts} pts` : ""}${us ? ` · you ${us.pts} pts` : ""}</div></div><span class="chev">›</span></a>`;
  };
  page(name, `
    <div class="person">${avatar(name, "big")}<div class="who"><div class="name">${esc(name)}</div><div class="handle">${f ? `@${esc(f.handle || "")}${f.hi !== null && f.hi !== undefined ? ` · index ${fmtIndex(Number(f.hi))}` : ""}` : incoming ? "wants to be your friend" : outgoing ? "request sent" : "not a friend yet"}</div></div></div>
    ${incoming ? `<div class="btnrow"><button class="btn primary" data-act="accept">Accept</button><button class="btn" data-act="decline">Decline</button></div>` : ""}
    ${!f && !incoming && !outgoing ? `<div class="btnrow"><button class="btn primary" data-act="request">${ICONS.friend} Add as a friend</button></div>` : ""}
    ${f ? `<div class="list">
      <button data-act="invite"><span class="lead">${ICONS.trophy}<div><div class="name">Invite to a league</div></div></span><span class="chev">›</span></button>
      <button data-act="sharecard"><span class="lead">${ICONS.card}<div><div class="name">Share a card with ${esc(firstName(name))}</div></div></span><span class="chev">›</span></button>
    </div>` : ""}
    ${together.length ? `<h2>Rounds together</h2><div class="list">${together.map(roundRow).join("")}</div>` : rounds.length ? `<h2>Rounds you can see</h2><div class="list">${rounds.map(roundRow).join("")}</div>` : `<p class="muted center" style="margin:24px 0">No rounds together yet.</p>`}
    ${contacts.length ? `<p class="muted small center">On your cards as ${esc(contacts.map(c => c.name).join(", "))}. <a href="#player/${contacts[0].id}">Their rounds and stats ›</a></p>` : ""}
    ${f || outgoing ? `<div class="btnrow" style="margin-top:24px">${f ? `<button class="btn danger" data-act="remove">Remove friend</button>` : `<button class="btn" data-act="decline">Cancel request</button>`}<button class="btn danger" data-act="block">Block</button></div>` : ""}`,
    { back: "#people" });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === "request") { await F.request(id); toast("Request sent"); return person(id); }
      if (act === "accept") { await F.accept(id); toast("You are now friends"); return person(id); }
      if (act === "decline") { await F.decline(id); return person(id); }
      if (act === "remove") { if (await confirmSheet(`Remove ${firstName(name)}?`, "You can add each other again any time.", { label: "Remove", danger: true })) { await F.remove(id); go("#people"); } return; }
      if (act === "block") { if (await confirmSheet(`Block ${firstName(name)}?`, "They cannot find you, send you requests or share cards with you. They are not told. Leagues you are both in are unchanged.", { label: "Block", danger: true })) { await F.block(id); go("#people"); } return; }
      if (act === "invite") {
        const gs = S.leagues();
        if (!gs.length) return toast("You have no league to invite them to yet");
        const v = await sheet({ title: `Invite ${firstName(name)} to`, body: `<div class="list">${gs.map(g => `<button data-act="${esc(g.id)}" data-sheet-act><span class="lead">${ICONS.trophy}<div><div class="name">${esc(g.name)}</div></div></span><span class="chev">›</span></button>`).join("")}</div>`, actions: [{ label: "Cancel", value: "no" }] });
        if (v && v !== "no") { await F.inviteFriend(v, id); toast("Invited"); }
        return;
      }
      if (act === "sharecard") {
        const rs = S.rounds().filter(r => r.status === "done" && S.iPlayed(r)).slice(0, 30);
        if (!rs.length) return toast("No finished card of yours to share yet");
        const v = await sheet({ title: `Share a card with ${firstName(name)}`, body: `<div class="list">${rs.map(r => `<button data-act="${esc(r.id)}" data-sheet-act><div><div class="name">${esc(roundClub(r))}</div><div class="muted small">${roundLoop(r) ? `${esc(roundLoop(r))} · ` : ""}${esc(fmtDate(r.date))}</div></div><span class="chev">›</span></button>`).join("")}</div>`, actions: [{ label: "Cancel", value: "no" }] });
        if (v && v !== "no") { await F.shareRound(v, [id]); toast("Shared"); }
      }
    } catch (e) { toast(e.message, 5000); }
  });
}

/** A contact on my cards: their rounds, their form, and the place their name and index are edited. */
export function player(id) {
  const p = S.state.players.find(x => x.id === id && !x.deleted);
  if (!p) return go("#people");
  const me = S.me();
  const isMe = !!me && me.id === p.id;
  const rs = playerRounds(p.id);
  const pts = rs.map(o => o.x.pts);
  const grosses = rs.map(o => o.x.gross).filter(g => g !== null);
  const wins = rs.filter(o => o.x.splace === 1).length;
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const stats = rs.length ? `<div class="mecard"><div class="stats">${tile(rs.length, plural(rs.length, "round").split(" ")[1])}${tile(Math.max(...pts), "best pts")}${tile((pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1), "average")}${grosses.length ? tile(Math.min(...grosses), "best gross") : ""}${wins ? tile(wins, plural(wins, "win").split(" ")[1]) : ""}</div></div>` : "";
  const leagueLines = S.leagues().map(g => {
    const { S: Sx } = leagueResults(g);
    const row = Sx.rows.find(r => r.id === S.identityOf(p.id) || r.id === p.id);
    return row ? `<a href="#league/${g.id}"><div><div class="name">${esc(g.name)}</div><div class="muted small">${plural(row.played, "round")} counted</div></div><span class="pill done">${ordinal(row.place)} · ${row.counted} pts</span></a>` : "";
  }).filter(Boolean).join("");
  const list = rs.map(({ r, M, x }) => {
    const H = halves(M, x);
    const split = H && H.length > 1 ? `<div class="nines">${H.map(h => `<span><b>${esc(nineName(h.slug))}</b> ${h.gross === null ? "–" : `${h.gross} ${fmtToPar(h.topar)}`} · ${h.pts} pts</span>`).join("")}</div>` : "";
    return `<div class="rround card"><a href="#review/${r.id}" style="display:block"><div class="d">${esc(fmtDate(r.date))}</div><div class="name">${esc(roundClub(r))}</div>
        ${roundLoop(r) ? `<div class="loop">${esc(roundLoop(r))}</div>` : ""}
        <div class="res"><span class="big num">${x.pts}<small>pts</small></span><span class="muted">${ordinal(x.splace)} of ${M.field}${x.gross !== null ? ` · gross ${x.gross} ${fmtToPar(x.topar)}` : " · no return"}</span></div>${split}
        ${x.statline.any ? `<div class="muted small">${esc(statLine(x.statline))}</div>` : ""}</a>
      <button class="btn small" data-act="my-card" data-rid="${r.id}" data-pid="${p.id}">Save card</button></div>`;
  }).join("");
  const career = statSummary(statHolesOf(rs, p.id));
  const sgMine = strokesGained(rs.map(o => o.M), p.id);
  const nines = ninesPlayed(S.roundsOf(p.id), p.id);
  const linkedTo = p.linkedAccount && !isMe ? F.friendById(p.linkedAccount) : null;
  page(isMe ? "My rounds" : p.name, `
    <div class="person">${avatar(p.name, "big")}<div class="who"><div class="name">${esc(p.name)}</div><div class="handle">${p.hi !== null && p.hi !== undefined ? `index ${fmtIndex(Number(p.hi))} · ` : ""}${p.gender === "f" ? "women's rating" : "men's rating"} · ${plural(rs.length, "round")}${linkedTo ? ` · <a href="#person/${esc(p.linkedAccount)}">friend</a>` : ""}</div></div></div>
    ${stats}
    ${leagueLines ? `<h2>Leagues</h2><div class="list">${leagueLines}</div>` : ""}
    ${career.any ? `${h2tip("Putts, fairways and the rest", STATS_TIP)}<div class="card"><div class="muted small">Over ${plural(career.holes, "hole")} of ${plural(rs.length, "round")}.</div>${statTiles(career, { per18: true })}</div>` : ""}
    ${sgMine.total === null ? "" : `${h2tip("Strokes gained", SG_TIP)}${sgBlock(sgMine, "everyone else on the card")}`}
    ${nines.length ? `${h2tip("Nines walked", `Each loop is scored on its own stroke index and course rating, whether it was walked alone or as half of an 18.`)}
      <table class="stand"><thead><tr><th class="l">Loop</th><th>Walked</th><th>Best</th><th>Avg gross</th><th>Avg pts</th></tr></thead>
      <tbody>${nines.map(x => `<tr><td class="l">${esc(nineName(x.slug))}</td><td>${x.played}</td><td>${x.bestGross === null ? "–" : x.bestGross}</td><td>${x.avgGross === null ? "–" : x.avgGross.toFixed(1)}</td><td class="acc">${x.avgPts.toFixed(1)}</td></tr>`).join("")}</tbody></table>` : ""}
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
