// One league: the table, its rounds, its players, its stats and head-to-heads, and who runs it. Invite and
// share are one tap from the top of the screen, not two levels down.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as E from "../entitlements.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, ui, plural, firstName, inits, ordinal, fmtDate, courseBy, roundStatus, resumeHash, roundWhere, roundClub, roundLoop, subtabs, tip, h2tip, sheet, confirmSheet, shareLink, qrHtml, avatar, themeRadios, bindChips, appTheme, leagueTheme, paint, themeHere, app, ICONS, iconBtn } from "../ui.js";
import { headToHead, leagueStats, fmtToPar, fmtSigned, fmtIndex, fix } from "../model.js";
import { FORMAT_NAMES, FORMAT_MODE, FORMAT_BLURB, FORMAT_NOTES, MATCH_BASIS, H2H_BASES, basisRow, basisWord, leagueResults, standingsFor, standingsTable } from "./formats.js";
import { leagueStatsBody, tapeRow, distBar, inlineKey, parOrBetter, pct, basisPicker } from "./stats.js";
import { claimSheet } from "./gate.js";

const LEAGUE_TABS = [["standings", "Standings"], ["rounds", "Rounds"], ["players", "Players"], ["stats", "Stats"], ["h2h", "Head to head"], ["settings", "Settings"]];

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
      if (v === "link") await shareLink(r.url, `Join ${g.name} on Hagolf`, `Join ${g.name} on Hagolf: ${r.url}`);
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
  await shareLink(`${location.origin}${location.pathname}#board/${g.token}`, `${g.name} on Hagolf`, `The ${g.name} table: ${location.origin}${location.pathname}#board/${g.token}`);
}

// ---------------------------------------------------------------- the screen
export function league(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const { Ms, members } = leagueResults(g);
  const formats = S.cleanFormats(g.formats);
  const attached = new Set(S.leagueRoundIds(gid));
  const nameOf = id => { for (const M of Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };
  const me = S.me();
  const runs = runsIt(g);
  const tabs = LEAGUE_TABS.filter(([k]) => k !== "settings" || runs || !A.signedIn());
  const tab = tabs.some(([k]) => k === ui.leagueTab[gid]) ? ui.leagueTab[gid] : "standings";
  let body = "", hA = null, hB = null;
  const acts = `<div class="lgacts"><button class="btn small" data-act="invite">${ICONS.friend} Invite</button><button class="btn small" data-act="share-board">${ICONS.share} Share board</button></div>`;
  if (tab === "standings") {
    const pick = formats.includes(ui.fmtTab[gid]) ? ui.fmtTab[gid] : formats[0];
    body = Ms.length ? `
      ${formats.length > 1 ? subtabs(formats.map(f => `<button data-act="fmt" data-f="${f}" class="${f === pick ? "on" : ""}">${FORMAT_NAMES[f]}</button>`).join("")) : ""}
      ${standingsTable(pick, standingsFor(g, Ms, members, pick), g, me)}
      ${tip(FORMAT_NOTES[pick], "How this table is scored")}
      <a class="btn" href="#leagueposter/${gid}">Make a standings poster ›</a>`
      : `<p class="muted center" style="margin:30px 0 14px">No finished rounds in this league yet.</p>
        <button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>
        <button class="btn" data-act="ltab" data-tab="rounds" style="margin-top:8px">Add rounds already played ›</button>`;
  } else if (tab === "stats") {
    body = leagueStatsBody(g, Ms, members);
  } else if (tab === "h2h") {
    const h2hKind = formats.find(f => f in MATCH_BASIS);
    const h2hBasis = H2H_BASES.some(([k]) => k === ui.h2hBasis[gid]) ? ui.h2hBasis[gid] : (h2hKind ? MATCH_BASIS[h2hKind] : "points");
    const h = ui.h2h[gid] || {};
    hA = members.includes(h.a) ? h.a : (me && members.includes(me.id) ? me.id : members[0]);
    hB = members.includes(h.b) && h.b !== hA ? h.b : members.find(m => m !== hA);
    if (hA && hB) {
      const a = hA, b = hB;
      const H = headToHead(Ms, a, b, h2hBasis);
      const A_ = nameOf(a), B_ = nameOf(b), fA = firstName(A_), fB = firstName(B_);
      const sel = (name, val) => `<select data-h2h="${name}">${members.map(m => `<option value="${m}" ${m === val ? "selected" : ""}>${esc(nameOf(m))}</option>`).join("")}</select>`;
      const picker = `<div class="vspick">${sel("a", a)}<button class="swapb" data-act="h2hswap" title="Swap">&#8646;</button>${sel("b", b)}</div>`;
      const [, basisName, roundWord, holeWord] = basisRow(h2hBasis);
      const basis = `${basisPicker("h2hbasis", h2hBasis)}<div class="basis"><span><b>Rounds · stroke play</b>the day goes to ${esc(roundWord)}</span><span><b>Holes · match play</b>each hole goes to ${esc(holeWord)}</span></div>
        ${tip(`<p>This page keeps two scores, and they are two different games. Both are settled on whatever the tabs above are set to — at the moment ${esc(basisName.toLowerCase())}.</p>
          <p><b>Stroke play</b> settles the big score at the top: each round they played together goes to ${esc(roundWord)} that day. <b>Match play</b> settles the hole-by-hole part: every hole is its own contest, won by ${esc(holeWord)}, added up as one long match.</p>
          <p>${h2hKind ? `This league keeps a ${esc(FORMAT_NAMES[h2hKind])} table, so that is what it opens on.` : "A round only one of them finished a card for goes to the one who did, the way a hole does."}</p>`, "Match play or stroke play?")}`;
      if (!H.rounds.length) body = `${picker}<p class="muted center" style="margin:30px 0">${esc(fA)} and ${esc(fB)} have not played a round together in this league yet.</p>`;
      else {
        const tot = H.winsA + H.ties + H.winsB;
        const pc = n => `${(n / tot) * 100}%`;
        const verdict = H.winsA === H.winsB ? `All square at ${H.winsA}&#8211;${H.winsB}` : `${esc(H.winsA > H.winsB ? fA : fB)} leads ${Math.max(H.winsA, H.winsB)}&#8211;${Math.min(H.winsA, H.winsB)}`;
        const streak = H.streak.n >= 2 ? `${esc(H.streak.who === "a" ? fA : fB)} has won the last ${H.streak.n}` : H.streak.n === 1 ? `${esc(H.streak.who === "a" ? fA : fB)} won the last one` : "the last one was halved";
        const holes = H.holesA + H.holesB + H.holesHalved;
        const widest = H.winsA >= H.winsB ? H.widestA : H.widestB;
        const hero = `<div class="card vscard"><div class="modeline mid"><span>rounds won on ${esc(basisWord(h2hBasis))}</span></div><div class="vsverdict">${verdict}</div>
          <div class="vs"><div class="vsside"><span class="vsdisc a">${esc(inits(A_))}</span><span class="vsname">${esc(A_)}</span></div>
            <div class="vsnum"><b class="num">${H.winsA}</b><s>&#8211;</s><b class="num">${H.winsB}</b><small>rounds won · ${H.ties ? plural(H.ties, "halved") : "none halved"}</small></div>
            <div class="vsside"><span class="vsdisc b">${esc(inits(B_))}</span><span class="vsname">${esc(B_)}</span></div></div>
          <div class="tug"><i class="a" style="width:${pc(H.winsA)}"></i><i class="t" style="width:${pc(H.ties)}"></i><i class="b" style="width:${pc(H.winsB)}"></i></div>
          <div class="vsline">${plural(H.rounds.length, "round")} together &middot; ${streak}</div></div>`;
        const num = v => v === null ? "NR" : v;
        const formStrip = `${h2tip("Round by round", `Every round they played together, oldest first. Each square carries the initials of whoever took it on ${esc(basisWord(h2hBasis))}; = means they tied. Tap one to see that card.`)}<div class="vsform">${H.rounds.map(r => `<a class="fdot ${r.winner}" href="#review/${r.id}" title="${esc(fmtDate(r.date))} &middot; ${num(r.scoreA)}&#8211;${num(r.scoreB)}">${r.winner === "tie" ? "=" : esc(inits(r.winner === "a" ? A_ : B_))}</a>`).join("")}</div>
          <p class="muted small center" style="margin:6px 0 0">oldest to newest &middot; tap one for the card</p>`;
        const stats = `${h2tip("The numbers side by side", `${esc(fA)} on the left, ${esc(fB)} on the right, over the rounds they played together. The green end is whoever is ahead — on gross scores that is the lower number.`)}<div class="card tapes">
          ${tapeRow("average points", H.avgPtsA, H.avgPtsB, false, fix)}${tapeRow("best round", H.bestPtsA, H.bestPtsB)}${tapeRow("total points", H.ptsA, H.ptsB)}
          ${h2hBasis === "net" ? tapeRow("average net", H.avgNetA, H.avgNetB, true, fix) + tapeRow("best net", H.bestNetA, H.bestNetB, true) : ""}
          ${tapeRow("average gross", H.avgGrossA, H.avgGrossB, true, fix)}${tapeRow("best gross", H.bestGrossA, H.bestGrossB, true)}
          ${H.birdiesA + H.birdiesB ? tapeRow("birdies or better", H.birdiesA, H.birdiesB) : ""}${tapeRow("match play wins", H.matchA, H.matchB)}</div>`;
        const holesBlock = `${h2tip("Match play, hole by hole", `Every hole the two of them have played together, each one won by ${esc(holeWord)}. Added up as one long match: ${esc(fA)}'s holes on the left, halved holes in the middle, ${esc(fB)}'s on the right.`)}<div class="card">
          <div class="modeline"><span class="modetag">Match play</span><span>holes won on ${esc(basisWord(h2hBasis))}</span></div>
          <div class="tug big"><i class="a" style="width:${(H.holesA / holes) * 100}%"></i><i class="t" style="width:${(H.holesHalved / holes) * 100}%"></i><i class="b" style="width:${(H.holesB / holes) * 100}%"></i></div>
          <div class="holeskey"><span><b>${H.holesA}</b> ${esc(fA)}</span><span class="muted">${H.holesHalved} halved</span><span><b>${H.holesB}</b> ${esc(fB)}</span></div>
          <p class="muted small" style="margin:10px 0 0">All ${holes} holes together as one long match: ${H.up === 0 ? "dead level" : `${esc(H.up > 0 ? fA : fB)} would be ${Math.abs(H.up)} up`}.</p></div>`;
        const widestLine = widest ? `<p class="muted small" style="margin:-4px 4px 8px">Widest margin: ${esc(widest.winner === "a" ? fA : fB)} by ${widest.margin} ${h2hBasis === "points" ? "points" : "shots"} on ${esc(fmtDate(widest.date))}.</p>` : "";
        const list = `${h2tip("Every round together", `One line a round, newest first: the two ${esc(basisWord(h2hBasis))} totals for that day, the winner's in colour. The line underneath says how the same round went as a match, hole by hole.`)}${widestLine}<div class="list">${[...H.rounds].reverse().map(r => `<a class="h2hrow" href="#review/${r.id}">
          <div class="when"><b>${esc(fmtDate(r.date))}</b><small class="muted">${esc(r.where)} &middot; ${r.up === 0 ? "match halved" : `${Math.abs(r.up)} up ${esc(firstName(r.up > 0 ? A_ : B_))}`}</small></div>
          <div class="sc"><b class="${r.winner === "a" ? "wa" : ""}">${num(r.scoreA)}</b><s>&#8211;</s><b class="${r.winner === "b" ? "wb" : ""}">${num(r.scoreB)}</b></div></a>`).join("")}</div>`;
        body = picker + basis + hero + formStrip + stats + holesBlock + list;
      }
    } else body = `<p class="muted center" style="margin:30px 0">Head-to-heads appear once two players share a round in this league.</p>`;
  } else if (tab === "players") {
    const St = Ms.length ? leagueStats(Ms, members) : { players: [] };
    const pick = formats.includes(ui.fmtTab[gid]) ? ui.fmtTab[gid] : formats[0];
    const Sp = Ms.length ? standingsFor(g, Ms, members, pick) : { rows: [] };
    const cur = r => pick === "stroke" ? (r.played ? fmtToPar(r.counted) : "–") : String(pick in MATCH_BASIS ? r.points : r.counted);
    const unit = pick === "stroke" ? "net" : "pts";
    const SORTS = [["league", "League order"], ["avg", "Average"], ["rounds", "Rounds"], ["par", "Par or better"]];
    const sort = SORTS.some(([k]) => k === ui.plSort[gid]) ? ui.plSort[gid] : "league";
    const rows = St.players.map(p => ({ p, row: Sp.rows.find(r => r.id === p.id) || null, hi: (S.state.players.find(x => x.id === p.id) || {}).hi }));
    const cmp = { league: (a, b) => (a.row ? a.row.place : 99) - (b.row ? b.row.place : 99), avg: (a, b) => (b.p.avgPts ?? -1) - (a.p.avgPts ?? -1),
      rounds: (a, b) => b.p.played - a.p.played || (b.p.avgPts ?? -1) - (a.p.avgPts ?? -1), par: (a, b) => pct(parOrBetter(b.p), b.p.holes) - pct(parOrBetter(a.p), a.p.holes) }[sort];
    rows.sort((a, b) => cmp(a, b) || a.p.name.localeCompare(b.p.name));
    const cardOf = ({ p, row, hi }) => `<div class="plcard card ${me && p.id === me.id ? "mine" : ""}">
      <a class="ptop" href="#player/${p.id}"><span class="prank ${row && row.place <= 3 ? `p${row.place}` : ""}">${row ? row.place : "–"}</span>
        <div class="pmain"><div class="name">${esc(p.name)}${hi === undefined ? "" : ` <small class="muted">index ${fmtIndex(Number(hi))}</small>`}</div>
          <div class="muted small">${plural(p.played, "round")} · ${fix(p.avgPts)} avg${p.wins ? ` · ${plural(p.wins, "win")}` : ""}${p.played > 1 && p.bestPts !== null ? ` · best ${p.bestPts}` : ""}</div></div>
        <b class="pbig num">${row ? cur(row) : "–"}<small>${unit}</small></b><span class="chev">›</span></a>
      ${distBar(p.counts)}
      <div class="pfoot"><span>${pct(parOrBetter(p), p.holes)}% par or better</span><span>${fmtSigned(p.vspar, 2)} a hole</span><span>${p.returns ? `${fmtToPar(Math.round(p.avgTopar))} gross` : "no full card"}</span><span>${ordinal(Math.round(p.avgPlace))} on average</span></div>
      <div class="pacts"><button class="btn small" data-act="pstats" data-id="${esc(p.id)}">Their stats ›</button><button class="btn small" data-act="ph2h" data-id="${esc(p.id)}">Head to head ›</button></div></div>`;
    body = rows.length ? `
      ${subtabs(SORTS.map(([k, l]) => `<button data-act="plsort" data-s="${k}" class="${k === sort ? "on" : ""}">${l}</button>`).join(""), true)}
      <div class="dkeywrap">${inlineKey()}</div>
      ${rows.map(cardOf).join("")}
      ${members.length > 1 && runs ? `<details class="card"><summary class="small">Two spellings of one person?</summary>
        <p class="muted small">Merge them: every round, score and course handicap moves to the kept name, and the old spelling becomes an alias.</p>
        <div class="merge"><select id="mkeep">${members.map(m => `<option value="${m}">${esc(nameOf(m))}</option>`).join("")}</select><span>←</span><select id="mdrop">${members.map((m, i) => `<option value="${m}" ${i === 1 ? "selected" : ""}>${esc(nameOf(m))}</option>`).join("")}</select></div>
        <button class="btn small" data-act="merge" style="margin-top:8px">Merge into the first name</button></details>` : ""}`
      : `<p class="muted center" style="margin:30px 0 14px">Nobody has played a round in this league yet.</p><button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>`;
  } else if (tab === "rounds") {
    const byDate = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
    const done = S.rounds().filter(r => r.status === "done").sort(byDate);
    const open = S.rounds().filter(r => r.status !== "done").sort(byDate);
    const inL = done.filter(r => attached.has(r.id)), rest = done.filter(r => !attached.has(r.id) && S.iPlayed(r));
    const cardOf = (r, on) => {
      const where = roundWhere(r);
      const M = on ? Ms.find(x => x.id === r.id) : null;
      const top = M && M.stbl_board.length ? M.stbl_board[0] : null;
      const mine = M && me ? M.players.find(x => x.id === me.id) : null;
      const q = [fmtDate(r.date), where, r.name, ...r.entries.map(e => e.name)].join(" ").toLowerCase();
      const canToggle = S.iPlayed(r) || runs;
      return `<div class="lround card" data-q="${esc(q)}"><a href="#review/${r.id}">
          <div class="d">${esc(fmtDate(r.date))}</div><div class="name">${esc(roundClub(r))}</div>
          ${roundLoop(r) ? `<div class="loop">${esc(roundLoop(r))}</div>` : ""}
          ${top ? `<div class="res"><span class="pill done">${esc(firstName(top.name))} ${top.pts} pts</span>${mine ? `<span class="muted small">you ${mine.pts} pts, ${ordinal(mine.splace)} of ${M.field}</span>` : `<span class="muted small">${plural(M.field, "player")}</span>`}</div>`
            : `<div class="who">${r.entries.map(e => `<span class="${me && e.playerId === me.id ? "me" : ""}">${esc(firstName(e.name))}</span>`).join("")}</div>`}</a>
        ${canToggle ? `<button class="btn small ${on ? "" : "primary"}" data-act="toggle-round" data-rid="${r.id}" data-on="${on ? 0 : 1}">${on ? "Remove from league" : "Add to league"}</button>` : ""}</div>`;
    };
    body = `<button class="btn primary big" data-act="new-in-league">+ Start a round in this league</button>
      ${open.length ? `<div class="list" style="margin-top:12px">${open.map(r => `<a href="${resumeHash(r)}"><div><div class="name">${esc(r.name)}</div><div class="muted small">${esc(roundWhere(r))} · ${esc(roundStatus(r))}</div></div><span class="chev">›</span></a>`).join("")}</div>` : ""}
      <h2>Counting in this league</h2>
      ${inL.length ? `<p class="muted small" style="margin:-4px 4px 10px">${plural(inL.length, "round")}${g.bestN ? `, of which each player's best ${g.bestN} count` : ""}.</p>${inL.map(r => cardOf(r, true)).join("")}` : `<p class="muted small" style="margin:-4px 4px 10px">No rounds yet. Add a finished one below, or start a new one.</p>`}
      <h2>Add a round you played</h2>
      ${rest.length ? `${rest.length > 6 ? `<input id="rq" class="search" placeholder="Search by date, course or player" autocomplete="off">` : ""}<div id="rlist">${rest.map(r => cardOf(r, false)).join("")}</div>`
        : `<p class="muted small" style="margin:-4px 4px 10px">Every finished round you played is already in this league.</p>`}`;
  } else {
    body = settingsTab(g, formats);
  }
  page(g.name, `${acts}${subtabs(tabs.map(([k, l]) => `<button data-act="ltab" data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join(""))}${body}`,
    { back: "#leagues", sub: `${plural(attached.size, "round")} · ${formats.map(f => FORMAT_NAMES[f]).join(", ")}` });
  if (tab === "settings") wireSettings(g, gid);
  bind(async ev => {
    const b_ = ev.target.closest("[data-act]");
    if (!b_) return;
    const act = b_.dataset.act;
    if (act === "ltab") { ui.leagueTab[gid] = b_.dataset.tab; return league(gid); }
    if (act === "invite") return inviteSheet(g);
    if (act === "share-board") return boardShare(g);
    if (act === "h2hswap") { ui.h2h[gid] = { a: hB, b: hA }; return league(gid); }
    if (act === "h2hbasis") { ui.h2hBasis[gid] = b_.dataset.b; return league(gid); }
    if (act === "rivalbasis") { ui.rivalBasis[gid] = b_.dataset.b; return league(gid); }
    if (act === "ninetab") { ui.nineTab[gid] = b_.dataset.slug; return league(gid); }
    if (act === "statswho") { ui.statsWho[gid] = b_.dataset.id; return league(gid); }
    if (act === "seasonmode") { ui.seasonMode[gid] = b_.dataset.m; return league(gid); }
    if (act === "seasonwho") { ui.seasonWho[gid] = b_.dataset.id; return league(gid); }
    if (act === "plsort") { ui.plSort[gid] = b_.dataset.s; return league(gid); }
    if (act === "pstats") { ui.statsWho[gid] = b_.dataset.id; ui.leagueTab[gid] = "stats"; return league(gid); }
    if (act === "ph2h") { ui.h2h[gid] = { a: b_.dataset.id, b: members.find(m => m !== b_.dataset.id) }; ui.leagueTab[gid] = "h2h"; return league(gid); }
    if (act === "fmt") { ui.fmtTab[gid] = b_.dataset.f; return league(gid); }
    if (act === "new-in-league") { S.setSetting("lastLeague", gid); return go("#new"); }
    if (act === "toggle-round") { S.setLeagueRound(gid, b_.dataset.rid, b_.dataset.on === "1"); return league(gid); }
    if (act === "merge") {
      const keep = document.getElementById("mkeep").value, drop = document.getElementById("mdrop").value;
      if (keep === drop) return toast("Pick two different names");
      if (!await confirmSheet("Merge these names?", `${nameOf(drop)} becomes ${nameOf(keep)} on every phone. This cannot be undone.`, { label: "Merge", danger: true })) return;
      S.mergePlayers(keep, drop); toast("Merged"); return league(gid);
    }
  });
  app.querySelectorAll("[data-h2h]").forEach(el => el.addEventListener("change", () => {
    const na = document.querySelector("[data-h2h=a]").value, nb = document.querySelector("[data-h2h=b]").value;
    ui.h2h[gid] = na === nb ? { a: hB, b: hA } : { a: na, b: nb };
    league(gid);
  }));
  const rq = document.getElementById("rq");
  if (rq) rq.addEventListener("input", () => {
    const t = rq.value.toLowerCase().trim();
    document.querySelectorAll("#rlist .lround").forEach(l => { l.style.display = !t || l.dataset.q.includes(t) ? "" : "none"; });
  });
}

// ---------------------------------------------------------------- settings: how it is scored, who reads it, who is in it
function settingsTab(g, formats) {
  const runs = runsIt(g);
  const member = S.myMembership(g.id);
  return `${runs ? `<form id="gform" class="card form open"><label style="margin-top:0">League name<input name="name" value="${esc(g.name)}"></label>
      <label>Scored by <span class="muted">(pick as many as you like; the first is what the league opens on)</span></label>
      <div class="fmtlist">${S.FORMATS.map(f => {
        const lock = !E.formatAllowed(f) && !formats.includes(f);
        return `<label class="${lock ? "muted" : ""}"><input type="checkbox" name="fmt" value="${f}" ${formats.includes(f) ? "checked" : ""} ${lock ? "disabled" : ""}> <span><b>${FORMAT_NAMES[f]}</b><small>${lock ? `<a href="#shop">In the shop</a> · ` : ""}${FORMAT_MODE[f]} · ${FORMAT_BLURB[f]}</small></span></label>`;
      }).join("")}</div>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="${g.bestN}"></label>
      <label>Theme <span class="muted">(what this league wears on screen and in its images)</span></label>
      <div class="themes" style="margin-top:8px">${themeRadios("ltheme", leagueTheme(g) ? g.theme : "", { theme: appTheme(), label: "App theme" })}</div>
      <button class="btn primary" type="submit">Save</button></form>` : ""}
    ${A.signedIn() ? `<div class="card" id="members"><h2 style="margin-top:0">Members</h2><p class="muted small">Loading…</p></div>` : ""}
    ${runs && A.signedIn() ? `<div class="card"><h2 style="margin-top:0">Who can read the table</h2>
        <p class="muted small" style="margin:0 0 8px">Members always see it. <b>Link</b> lets anyone with the link read the board; <b>public</b> also lets it be listed and found. Reading is not joining.</p>
        <div class="segpick">${[["private", "Private"], ["link", "Link"], ["public", "Public"]].map(([v, l]) => `<button data-act="vis" data-v="${v}" class="${(g.visibility || "private") === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <p class="muted small" style="margin:12px 0 6px"><b>Friendly</b>: anyone who joins can say which player is them. <b>Organised</b>: you confirm a claim before it counts.</p>
        <div class="segpick">${[["friendly", "Friendly"], ["organised", "Organised"]].map(([v, l]) => `<button data-act="kind" data-v="${v}" class="${(g.kind || "friendly") === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <label class="switch" style="margin-top:12px"><span>Show handicaps on the shared board</span><input type="checkbox" id="showhcp" ${g.showHandicaps === false ? "" : "checked"}></label>
        ${g.token && g.visibility && g.visibility !== "private" ? `<div class="btnrow"><button class="btn small" data-act="share-board">Share the board link</button><button class="btn small" data-act="reset-board">Reset the board link</button></div>` : ""}</div>
      <div class="card" id="invites"><h2 style="margin-top:0">Invite links</h2><p class="muted small">Loading…</p></div>` : ""}
    ${g.createdBy ? `<p class="muted small center">Created by ${esc(g.createdBy)}${g.created ? ` on ${esc(fmtDate(g.created))}` : ""}</p>` : ""}
    <div class="btnrow">${member && g.owner !== S.myAccount() ? `<button class="btn danger" data-act="leave">Leave this league</button>` : ""}${runs ? `<button class="btn danger" data-act="del-league">Delete league</button>` : ""}</div>`;
}

async function wireSettings(g, gid) {
  const runs = runsIt(g);
  bindChips(app.querySelector(".themes"));
  const gf = document.getElementById("gform");
  if (gf) gf.addEventListener("submit", ev => {
    ev.preventDefault();
    g.name = ev.target.name.value.trim() || g.name; g.bestN = Number(ev.target.bestN.value) || 0;
    g.formats = S.cleanFormats([...ev.target.querySelectorAll("input[name=fmt]:checked")].map(i => i.value));
    g.theme = ev.target.ltheme.value || null;
    S.saveLeague(g); paint(themeHere()); toast("Saved"); ui.leagueTab[gid] = "standings"; league(gid);
  });
  const showhcp = document.getElementById("showhcp");
  if (showhcp) showhcp.addEventListener("change", ev => {
    F.setVisibility(gid, { showHandicaps: ev.target.checked }).then(r => { g.showHandicaps = r.showHandicaps; S.afterPull(); toast("Saved"); }).catch(e => { toast(e.message, 5000); league(gid); });
  });
  app.querySelector("main").addEventListener("click", async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "vis" || act === "kind") {
      const body = act === "vis" ? { visibility: b.dataset.v } : { kind: b.dataset.v };
      F.setVisibility(gid, body).then(r => { Object.assign(g, { visibility: r.visibility, kind: r.kind, token: r.token || g.token, showHandicaps: r.showHandicaps }); S.afterPull(); league(gid); }).catch(e => toast(e.message, 5000));
    }
    if (act === "reset-board") {
      if (!await confirmSheet("Reset the board link?", "The old link stops working for everyone who has it.", { label: "Reset", danger: true })) return;
      F.setVisibility(gid, { resetLink: true }).then(r => { g.token = r.token; S.afterPull(); toast("New link made"); league(gid); }).catch(e => toast(e.message, 5000));
    }
    if (act === "revoke") { try { await F.revokeInvite(gid, b.dataset.id); toast("Link revoked"); league(gid); } catch (e) { toast(e.message, 5000); } }
    if (act === "confirm-claim") { try { await F.confirmClaim(gid, b.dataset.id); toast("Confirmed"); await Y.pull(); league(gid); } catch (e) { toast(e.message, 5000); } }
    if (act === "claim-me") { try { const r = await F.candidatesOf(gid); await claimSheet(gid, r.candidates); league(gid); } catch (e) { toast(e.message, 5000); } }
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
  // who is in, and what is waiting: read live, since membership is the server's to say
  const box = document.getElementById("members");
  try {
    const r = await F.membersOf(gid);
    const me = S.myAccount();
    const mine = r.members.find(m => m.id === me);
    const pending = runs ? (await F.pendingClaims(gid).catch(() => ({ pending: [] }))).pending : [];
    if (box) box.innerHTML = `<h2 style="margin-top:0">Members</h2>
      ${pending.length ? `<p class="muted small">Waiting for you to confirm:</p><div class="list">${pending.map(p => `<div><span class="lead">${avatar(p.who || "?")}<div><div class="name">${esc(p.who || "Somebody")}</div><div class="muted small">says they are ${esc(p.name || "?")}</div></div></span><button class="btn small primary" data-act="confirm-claim" data-id="${esc(p.account_id)}">Confirm</button></div>`).join("")}</div>` : ""}
      <div class="list">${r.members.map(m => `<a href="${m.id === me ? "#me" : `#person/${esc(m.id)}`}"><span class="lead">${avatar(m.name || "?")}<div><div class="name">${esc(m.name || "Somebody")}${m.id === me ? " (you)" : ""}</div><div class="muted small">${m.role === "owner" ? "runs the league" : m.role === "organiser" ? "organiser" : "player"}${m.claim === "pending" ? " · claim waiting" : ""}</div></div></span><span class="chev">›</span></a>`).join("")}</div>
      ${mine && mine.claim === "none" ? `<button class="btn small" data-act="claim-me" style="margin-top:8px">Which player on the cards is me?</button>` : ""}`;
  } catch (e) { if (box) box.innerHTML = `<h2 style="margin-top:0">Members</h2><p class="muted small">${esc(e.message)}</p>`; }
  const ibox = document.getElementById("invites");
  if (ibox && runs) {
    try {
      const r = await F.invitesOf(gid);
      ibox.innerHTML = `<h2 style="margin-top:0">Invite links</h2>${r.invites.length ? `<div class="list">${r.invites.map(i => `<div><div><div class="name">${i.reusable ? "Group link" : i.personal ? "Invite to a friend" : "One-time link"}</div><div class="muted small">${i.reusable ? `used ${plural(i.uses, "time")} · ` : ""}expires ${esc(fmtDate(i.expires.slice(0, 10)))}</div></div><button class="btn small danger" data-act="revoke" data-id="${esc(i.id)}">Revoke</button></div>`).join("")}</div>` : `<p class="muted small">No live links. Use Invite at the top to make one.</p>`}`;
    } catch (e) { ibox.innerHTML = `<h2 style="margin-top:0">Invite links</h2><p class="muted small">${esc(e.message)}</p>`; }
  }
}
