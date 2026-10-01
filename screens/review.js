// The card: every player in Stableford order, a tap to correct any hole, who it counts for, who changed what,
// and -- once it is saved -- the ways to hand it to somebody.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, plural, courseTitle, courseBy, noCourse, ui, h2tip, sheet, confirmSheet, shareLink, avatar, firstName, fmtDate, iconBtn, saveFiles, slugFile, ICONS, makeTheme, loadFonts, themeForRound } from "../ui.js";
import { DATA } from "../data.js";
import { compute, halves, outcome, fmtToPar, fmtHcp, NO_SCORE } from "../model.js";
import { renderCards } from "../cards.js";
import { statTap, statStep, statLine, seedStats } from "./extras.js";
import { mark, scoreStepper, extrasRows } from "../pad.js";
import { dropBtn, dropRound } from "./players.js";
import { nineName } from "./play.js";

// ---------------------------------------------------------------- what changed on a card, and who changed it
const FIELD_WORDS = {
  strokes: "score", putts: "putts", fairway: "fairway", gir: "green in regulation", penalty_shots: "penalty shots",
  bunker: "bunker", hi: "handicap index", tee: "tee", course_handicap: "course handicap", grp: "group",
  from_hole: "joins at hole", penalties: "penalty strokes", name: "name", date: "date", status: "status",
  default_tee: "default tee", allowance: "allowance", track_stats: "keeping extras",
};
const showVal = v => v === null || v === undefined || v === "" ? "nothing" : v === true ? "yes" : v === false ? "no"
  : Array.isArray(v) ? (v.length ? `${v.length} ${v.length === 1 ? "entry" : "entries"}` : "nothing") : String(v);
function changeWho(row) {
  if (row.device_id && row.device_id === S.state.settings.deviceId) return "this phone";
  if (row.account_id && row.account_id === S.myAccount()) return "you, on another phone";
  return row.author ? esc(row.author) : "another phone";
}
function changeSubject(row, r, c) {
  const parts = String(row.key || "").split("|");
  const nameOf = pid => { const e = [...r.entries, ...r.removed].find(x => x.playerId === pid); return e ? e.name : "somebody"; };
  if (row.tbl === "scores" || row.tbl === "hole_stats") { const hole = Number(parts[2]); return `${esc(nameOf(parts[1]))} · hole ${Number.isFinite(hole) ? c.first_hole + hole : "?"}`; }
  if (row.tbl === "round_entries") return esc(nameOf(parts[1]));
  return "the round";
}
function changeRow(row, r, c) {
  const keys = Object.keys(row.before || {});
  const bits = keys.map(k => `<span class="chg"><i>${esc(FIELD_WORDS[k] || k)}</i> ${esc(showVal(row.before[k]))} → <b>${esc(showVal((row.after || {})[k]))}</b></span>`).join("");
  if (!bits) return "";
  const when = String(row.updated_at || row.at || "").replace("T", " ").slice(0, 16);
  return `<div class="chgrow"><div class="small">${changeSubject(row, r, c)}</div><div>${bits}</div><div class="muted small">changed by ${changeWho(row)} · ${esc(when)}</div></div>`;
}
async function loadHistory(rid, r, c) {
  const box = document.getElementById("histbody");
  if (!box || box.dataset.done) return;
  box.dataset.done = "1";
  try {
    const rows = await Y.roundHistory(rid);
    box.innerHTML = rows.length
      ? `<p class="muted small" style="margin:8px 0 6px">${plural(rows.length, "correction")} since this card was first written, newest first.</p><div class="chglist">${rows.map(x => changeRow(x, r, c)).join("")}</div>`
      : `<p class="muted small" style="margin:8px 0 0">Nothing on this card has been changed since it was first written.</p>`;
  } catch (err) {
    box.dataset.done = "";
    box.innerHTML = `<p class="muted small" style="margin:8px 0 0">Could not read the history: ${esc(err.message)}</p>`;
  }
}

/** The round's own nines, as they actually played that day. */
export function nineLine(M, p) {
  const H = halves(M, p);
  if (!H || H.length < 2) return "";
  return `<div class="nines">${H.map(h => `<span><b>${esc(nineName(h.slug))}</b> ${h.gross === null ? "–" : `${h.gross} ${fmtToPar(h.topar)}`} · ${h.pts} pts</span>`).join("")}</div>`;
}

/** Your own card as one image, in the round's look, straight to the camera roll. */
export async function myCard(rid, pid = null) {
  const me = pid ? S.state.players.find(x => x.id === pid) : S.me(), r = S.getRound(rid);
  const c = r ? courseBy(r.course) : null;
  let M = null;
  try { M = c ? compute(c, S.toModelRound(r)) : null; } catch (e) { M = null; }
  if (!me || !M || !M.players.some(p => p.id === me.id)) return toast("No card to make");
  toast("Making your card…", 3000);
  await loadFonts(DATA.fonts);
  const T = makeTheme(themeForRound(rid));
  const fig = renderCards(M, T, [me.name], "full", { extras: S.statsOnImages() })[0];
  const blob = await fig.fig.toBlob();
  await saveFiles([new File([blob], `${slugFile(r.name)}_${fig.file.split("/").pop()}`, { type: "image/png" })], r.name);
}

// ---------------------------------------------------------------- sharing a card
/** Hand the card to friends, or make a link anyone can open. */
export async function shareSheet(r) {
  if (!A.signedIn()) return toast("Sign in to share");
  const friends = F.held().friends;
  const already = new Set(S.sharesOf(r.id).map(x => x.account_id));
  const canShare = S.iPlayed(r);
  const v = await sheet({ title: "Share this card", lead: canShare ? "Friends see the whole card in their own app. A link opens for anyone." : "Only somebody who was on this card can share it.",
    body: canShare ? `${friends.length ? `<div class="list">${friends.map(f => `<label style="margin:0;font:inherit"><span class="lead">${avatar(f.name)}<div><div class="name">${esc(f.name)}</div>${already.has(f.id) ? `<div class="muted small">already has it</div>` : ""}</div></span><input type="checkbox" name="fr" value="${esc(f.id)}" ${already.has(f.id) ? "disabled" : ""}></label>`).join("")}</div>`
      : `<p class="muted small">No friends yet. Add some under People, or send the link.</p>`}` : "",
    actions: canShare ? [{ label: "Send to ticked friends", value: "friends", kind: "primary" }, { label: "Get a link anyone can open", value: "link" }, ...(r.token ? [{ label: "Turn the link off", value: "unlink", kind: "danger" }] : []), { label: "Cancel", value: "no" }] : [{ label: "OK", value: "no" }],
    onOpen: el => { el.__ids = () => [...el.querySelectorAll("input[name=fr]:checked")].map(i => i.value); window.__sheetEl = el; } });
  const ids = window.__sheetEl && window.__sheetEl.__ids ? window.__sheetEl.__ids() : [];
  window.__sheetEl = null;
  if (v === "friends") {
    if (!ids.length) return toast("Tick at least one friend");
    try { const res = await F.shareRound(r.id, ids); toast(`Shared with ${plural(res.shared, "friend")}`); await Y.pull(); } catch (e) { toast(e.message, 5000); }
  } else if (v === "link") {
    if (r.status !== "done") return toast("Finish the round first");
    const ok = r.token || await confirmSheet("Make a link?", "Everyone with the link can see every player's scores on this card, without signing in. The players on it are told.", { label: "Make the link" });
    if (!ok) return;
    try { const res = await F.cardLink(r.id); r.token = res.token; S.afterPull(); await shareLink(res.url, `${r.name} on Hagolf`, `${r.name}, ${fmtDate(r.date)}`); } catch (e) { toast(e.message, 5000); }
  } else if (v === "unlink") {
    try { await F.cardUnlink(r.id); r.token = null; S.afterPull(); toast("The link is off"); } catch (e) { toast(e.message, 5000); }
  }
}

// ---------------------------------------------------------------- the card
export function review(rid, keep = false) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const n = c.n;
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) {
    return page("Card", `<div class="banner warn">${esc(err.message)}</div><a class="btn" href="#players/${rid}">Fix the players</a>`, { back: `#score/${rid}/${S.holeOf(r)}` });
  }
  const mine = S.iPlayed(r), done = r.status === "done", me = S.me();
  const key = p => p.id ?? p.name;
  if (!ui.reviewOrder[rid]) ui.reviewOrder[rid] = M.stbl_board.map(key);
  const order = ui.reviewOrder[rid];
  const rank = p => { const k = order.indexOf(key(p)); return k < 0 ? 1e9 : k; };
  const board = M.stbl_board.map(p => [p, r.entries.find(e => e.playerId === p.id)]).sort((a, b) => rank(a[0]) - rank(b[0]));
  const unfinished = r.entries.filter(e => M.unfinished.includes(e.name));
  const kinds = S.statsFor(rid);
  const chips = e => c.par.map((par, i) => {
    const v = e.scores[i];
    const skip = (e.fromHole || 1) - 1 > i;
    const sel = ui.expanded === e.playerId && ui.selHole === i ? "sel" : "";
    return `<button class="chip ${sel}" data-act="sel-hole" data-pid="${e.playerId}" data-h="${i}" ${skip || !mine ? "disabled" : ""}><small>${c.first_hole + i}</small>${skip ? `<span class="mk empty">—</span>` : mark(v, par)}</button>`;
  }).join("");
  // the same stepper and the same extras the scoring screen writes with, so a number goes into a card one way
  // and is put right the same way
  const editor = e => {
    if (ui.expanded !== e.playerId || ui.selHole === null || !mine) return "";
    const i = ui.selHole, par = c.par[i], ei = r.entries.indexOf(e);
    return `<div class="editor"><div class="edhead">Hole ${c.first_hole + i} · par ${par} · SI ${c.stroke_index[i]}</div>
      ${scoreStepper(e, ei, i, par)}${extrasRows(c, e, ei, i, kinds)}</div>`;
  };
  const penalties = e => !mine ? "" : `<div class="pens">${(e.penalties || []).map((p, k) => `<span class="pen">+${p.strokes} on hole ${p.hole}${p.reason ? ` (${esc(p.reason)})` : ""} <button data-act="del-pen" data-pid="${e.playerId}" data-k="${k}" aria-label="remove">×</button></span>`).join("")}
    <details><summary class="muted small">Add penalty strokes</summary>
      <div class="two"><label>Hole<select class="pen-hole">${c.par.map((_, i) => `<option value="${i + 1}">${c.first_hole + i}</option>`).join("")}</select></label>
      <label>Strokes<input class="pen-strokes" inputmode="numeric" value="2"></label></div>
      <label>Reason<input class="pen-reason" placeholder="e.g. Late on the first tee"></label>
      <button class="btn small" data-act="add-pen" data-pid="${e.playerId}">Add penalty</button></details></div>`;
  const rows = board.map(([p, e]) => `
    <div class="card pl ${ui.expanded === e.playerId ? "open" : ""}">
      <button class="row plain" data-act="expand" data-pid="${e.playerId}">
        <div class="who"><span class="pos ${p.splace === 1 ? "p1" : ""}">${p.splace}</span><div><div class="name">${esc(p.name)}${p.penalty_total ? ` <span class="pen">pen +${p.penalty_total}</span>` : ""}</div>
          <div class="muted small">hcp ${fmtHcp(p.ph)} · ${esc(p.tee)}${p.skipped.some(Boolean) ? ` · from hole ${c.first_hole + p.from_hole - 1}` : ""}${p.filled.some(Boolean) ? ` · ${plural(p.filled.filter(Boolean).length, "hole")} counted ${NO_SCORE}` : ""}</div>${nineLine(M, p)}${p.statline.any ? `<div class="muted small">${esc(statLine(p.statline))}</div>` : ""}</div></div>
        <div class="nums"><span><b class="num">${p.gross === null ? "NR" : p.gross}</b><small>gross${p.topar !== null ? " " + fmtToPar(p.topar) : ""}</small></span>
          <span><b class="num">${p.net === null ? "NR" : p.net}</b><small>net</small></span><span class="acc"><b class="num">${p.pts}</b><small>pts</small></span></div></button>
      ${ui.expanded === e.playerId ? `<div class="chips">${chips(e)}</div>${editor(e)}${penalties(e)}` : ""}</div>`).join("");
  const missing = unfinished.map(e => {
    const holes = e.scores.map((v, i) => v === null && (e.fromHole || 1) - 1 <= i ? c.first_hole + i : null).filter(x => x !== null);
    return `<div class="card row warnrow"><div><div class="name">${esc(e.name)}</div><div class="muted small">missing hole${holes.length === 1 ? "" : "s"} ${holes.join(", ")}</div></div>
      ${mine ? `<a class="btn small" href="#score/${rid}/${holes[0] - c.first_hole}">Enter</a>` : ""}</div>`;
  }).join("");
  const lg = S.leaguesOfRound(rid);
  const shares = S.sharesOf(rid);
  const sharedWithMe = S.sharedWithMe().has(rid);
  const body = `
    ${sharedWithMe ? `<div class="banner accent">Shared with you. You can look, not change.</div>` : ""}
    ${missing ? `<h2>Not finished</h2>${missing}` : ""}
    ${rows ? `${h2tip("Stableford order", `<p>Stableford scores each hole on its own, against the par you get with your handicap strokes: a net double bogey or worse is 0 points, a net bogey 1, a net par 2, a net birdie 3, and so on up.</p>
      <p>Each row shows that player's <b>gross</b> (every stroke they took), their <b>net</b> (gross less their course handicap) and their <b>points</b>. The board is ordered on points.</p>`)}${mine ? `<p class="muted small" style="margin:-4px 4px 8px">Tap a player, then a hole, to change a score.</p>` : ""}${rows}` : `<p class="muted center">No complete scorecards yet.</p>`}
    ${done && me && M.players.some(p => p.id === me.id) ? `<div class="btnrow"><button class="btn" data-act="my-card">${ICONS.card} Save my card as an image</button><a class="btn" href="#graphics/${rid}">${ICONS.chart} Posters and cards</a></div>` : ""}
    <h2>Round</h2>
    <div class="list">
      <a href="${mine ? `#attach/${rid}` : "#leagues"}"><span class="lead">${ICONS.trophy}<div><div class="name">Counts for</div><div class="muted small">${lg.length ? esc(lg.map(g => g.name).join(", ")) : "no league yet"}</div></div></span>${mine ? `<span class="chev">›</span>` : ""}</a>
      ${mine ? `<a href="#players/${rid}"><span class="lead">${ICONS.people}<div><div class="name">Players, tees and handicaps</div><div class="muted small">${plural(r.entries.length, "player")}</div></div></span><span class="chev">›</span></a>` : ""}
      ${mine && done ? `<button data-act="share"><span class="lead">${ICONS.share}<div><div class="name">Share this card</div><div class="muted small">${shares.length ? `with ${plural(shares.length, "friend")}` : "to friends, or by link"}${r.token ? " · link is on" : ""}</div></div></span><span class="chev">›</span></button>` : ""}
    </div>
    ${mine ? `<details class="card"><summary class="small">Name and date: ${esc(r.name)} · ${esc(r.date || "no date")}</summary>
      <form id="rdet"><label>Name<input name="name" value="${esc(r.name)}"></label><label>Played on<input name="date" type="date" value="${esc(r.date || "")}"></label>
      <button class="btn small" type="submit">Save details</button></form></details>` : ""}
    ${Y.enabled() ? `<details class="card" id="hist"><summary class="small">What was changed on this card</summary><div id="histbody"><p class="muted small" style="margin:8px 0 0">Reading the history…</p></div></details>` : ""}
    ${dropBtn(r)}`;
  const bar = done ? "" : `<a class="btn" href="#score/${rid}/${n - 1}">‹ Scoring</a><button class="btn primary" data-act="save-round" ${M.field ? "" : "disabled"}>All correct, save ›</button>`;
  page(done ? "Card" : "Check the scores", body, { back: done ? "#play" : `#score/${rid}/${S.holeOf(r)}`, bar, sub: `${r.name} · ${courseTitle(c)}`, keepScroll: keep,
    actions: done && mine ? iconBtn("share", "share", "Share") : "" });
  const hist = document.getElementById("hist");
  if (hist) hist.addEventListener("toggle", () => { if (hist.open) loadHistory(rid, r, c); });
  const rdet = document.getElementById("rdet");
  if (rdet) rdet.addEventListener("submit", ev => {
    ev.preventDefault();
    r.name = ev.target.name.value.trim() || r.name;
    r.date = ev.target.date.value || null;
    S.saveRound(r); toast("Saved"); review(rid, true);
  });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    // the keys and the question rows sit inside the open player's card and carry no id of their own,
    // so they are resolved from whoever is expanded rather than from the button
    const e = r.entries.find(x => x.playerId === (b.dataset.pid || ui.expanded));
    if (act === "share") return shareSheet(r);
    if (act === "my-card") return myCard(rid);
    if (act === "drop-round") return dropRound(rid);
    if (act === "expand") { ui.expanded = ui.expanded === e.playerId ? null : e.playerId; ui.selHole = null; return review(rid, true); }
    if (!mine) return;
    if (act === "sel-hole") { ui.expanded = e.playerId; ui.selHole = Number(b.dataset.h); return review(rid, true); }
    if (["inc", "dec", "par"].includes(act)) {
      const i = ui.selHole, v = e.scores[i], par = c.par[i];
      if (act === "inc") S.setScore(r, e, i, (v === null || v === 0) ? par : Math.min(30, v + 1));
      else if (act === "dec") S.setScore(r, e, i, (v === null || v === 0) ? par : Math.max(1, v - 1));
      else if (v === null || v === 0) S.setScore(r, e, i, par);
      else return;
      seedStats(r, e, i, c, kinds);
      return review(rid, true);
    }
    if (act === "x-inc" || act === "x-dec") { statStep(r, e, ui.selHole, b.dataset.k, act === "x-inc" ? 1 : -1); return review(rid, true); }
    if (act === "st-fw") { statTap(r, e, ui.selHole, act, b); return review(rid, true); }
    if (act === "del-pen") { e.penalties.splice(Number(b.dataset.k), 1); S.saveEntry(r, e); return review(rid, true); }
    if (act === "add-pen") {
      const box = b.closest(".pens");
      const hole = Number(box.querySelector(".pen-hole").value), strokes = Number(box.querySelector(".pen-strokes").value);
      if (!(strokes >= 1)) return toast("Penalty strokes must be 1 or more");
      e.penalties = e.penalties || [];
      e.penalties.push({ hole, strokes, reason: box.querySelector(".pen-reason").value.trim() });
      S.saveEntry(r, e); return review(rid, true);
    }
    if (act === "save-round") {
      if (unfinished.length && !await confirmSheet("Holes with no score", `${plural(unfinished.length, "player")} ${unfinished.length === 1 ? "has" : "have"} holes with no score, which count ${NO_SCORE} strokes each.`, { label: "Save anyway" })) return;
      r.status = "done"; S.saveRound(r); go(`#graphics/${rid}`);
    }
  });
}

// ---------------------------------------------------------------- the leagues a round counts for
export function attach(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const mine = new Set(S.leaguesOfRound(rid).map(g => g.id));
  const list = S.leagues().map(g => `<label><input type="checkbox" data-act="toggle-league" data-gid="${g.id}" ${mine.has(g.id) ? "checked" : ""}> ${esc(g.name)}<span class="muted"> · ${plural(S.leagueRoundIds(g.id).length, "round")}</span></label>`).join("");
  const backTo = `#review/${rid}`;
  page("Counts for", `
    <p class="muted small">${esc(r.name)}: tick the leagues this round counts for. Every member sees the table update.</p>
    <div class="card checks">${list || `<p class="muted">No leagues yet. Make one below.</p>`}</div>
    <form id="newg" class="card form open"><h2>New league</h2><label>Name<input name="name" placeholder="e.g. Thursday league" required></label>
      <button class="btn" type="submit">Create and add this round</button></form>`,
  { back: backTo, bar: `<a class="btn primary" href="${backTo}">Done ›</a>` });
  bind(ev => {
    const b = ev.target.closest("[data-act=toggle-league]");
    if (b) { S.setLeagueRound(b.dataset.gid, rid, b.checked); if (b.checked) S.setSetting("lastLeague", b.dataset.gid); }
  });
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = S.createLeague(ev.target.name.value.trim() || "League", 0, S.me() ? S.me().name : null);
    S.setLeagueRound(g.id, rid, true);
    S.setSetting("lastLeague", g.id);
    attach(rid);
  });
}
