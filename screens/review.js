// The card: every player in Stableford order, a tap to correct any hole, who it counts for, who changed what,
// and -- once it is saved -- the ways to hand it to somebody.
import * as B from "../brand.js";
import { partnerRow } from "./partner.js";
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, plural, courseTitle, courseBy, noCourse, ui, h2tip, sheet, confirmSheet, shareLink, avatar, firstName, fmtDate, iconBtn, saveFiles, slugFile, ICONS, makeTheme, loadFonts, sizedLooks, sizedName, themeForRound } from "../ui.js";
import { DATA } from "../data.js";
import { compute, halves, outcome, fmtToPar, fmtHcp, NO_SCORE, holesWithoutPar, roundRanking } from "../model.js";
import { formatLabel } from "./home.js";
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

/** Your own card in the round's look, straight to the camera roll, in the size the Images screen last made. */
export async function myCard(rid, pid = null) {
  const me = pid ? S.state.players.find(x => x.id === pid) : S.me(), r = S.getRound(rid);
  const c = r ? courseBy(r.course) : null;
  let M = null;
  try { M = c ? compute(c, S.toModelRound(r)) : null; } catch (e) { M = null; }
  if (!me || !M || !M.players.some(p => p.id === me.id)) return toast("No card to make");
  toast("Making your card…", 3000);
  await loadFonts(DATA.fonts);
  const files = [];
  await B.withBrand(B.brandOfRound(rid), r.date, async () => {
    for (const [T, tag] of sizedLooks(makeTheme(themeForRound(rid)))) {
      const fig = renderCards(M, T, [me.name], "full", { extras: S.statsOnImages() })[0];
      files.push(new File([await fig.fig.toBlob()], `${slugFile(r.name)}_${sizedName(fig.file.split("/").pop(), tag)}`, { type: "image/png" }));
    }
  });
  await saveFiles(files, r.name);
}

// ---------------------------------------------------------------- sharing a card: the one door to images
/** ⤴: send to friends, a link anyone can open, the image in one tap, or the poster studio. */
export async function shareSheet(r) {
  const canShare = S.iPlayed(r) || S.isScorer(r);
  const done = r.status === "done";
  const me = S.mySeat(r);
  const v = await sheet({ title: "Share", lead: `${r.name}`,
    body: `<div class="list">
      ${canShare && A.signedIn() ? `<button data-sheet="friends"><span class="lead">${ICONS.friend}<div><div class="name">Send to friends</div><div class="muted small">They see the whole card in their own app</div></div></span><span class="chev">›</span></button>` : ""}
      ${canShare && A.signedIn() ? `<button data-sheet="link"><span class="lead">${ICONS.link}<div><div class="name">${r.token ? "Copy the link" : "Copy a link anyone can open"}</div><div class="muted small">${done ? "No sign-in needed to look" : "Once the round is saved"}</div></div></span><span class="chev">›</span></button>` : ""}
      ${me ? `<button data-sheet="image"><span class="lead">${ICONS.image}<div><div class="name">Save image</div><div class="muted small">Your card, in this round's look</div></div></span></button>` : ""}
      <button data-sheet="more"><span class="lead">${ICONS.chart}<div><div class="name">More images…</div><div class="muted small">Leaderboards, how the holes played, every player's card</div></div></span><span class="chev">›</span></button>
      ${r.token && canShare ? `<button data-sheet="unlink"><span class="lead">${ICONS.x}<div><div class="name">Turn the link off</div></div></span></button>` : ""}
    </div>` });
  if (!v) return;
  if (v === "image") return myCard(r.id, me ? (me.contactId || me.playerId) : null);
  if (v === "more") return go(`#graphics/${r.id}`);
  if (v === "friends") return friendsSheet(r);
  if (v === "link") {
    if (!done) return toast("Save the round first");
    const ok = r.token || await confirmSheet("Make a link?", "Everyone with the link can see every player's scores on this card, without signing in. The players on it are told.", { label: "Make the link" });
    if (!ok) return;
    try { const res = await F.cardLink(r.id); r.token = res.token; S.afterPull(); await shareLink(res.url, `${r.name} on Hagolf`, `${r.name}, ${fmtDate(r.date)}`); } catch (e) { toast(e.message, 5000); }
  }
  if (v === "unlink") { try { await F.cardUnlink(r.id); r.token = null; S.afterPull(); toast("The link is off"); } catch (e) { toast(e.message, 5000); } }
}

async function friendsSheet(r) {
  const friends = F.held().friends;
  if (!friends.length) return toast("No friends yet: add some under Me → Friends");
  const already = new Set(S.sharesOf(r.id).map(x => x.account_id));
  const v = await sheet({ title: "Send to friends",
    body: `<div class="list">${friends.map(f => `<label style="margin:0;font:inherit"><span class="lead">${avatar(f.name)}<div><div class="name">${esc(f.name)}</div>${already.has(f.id) ? `<div class="muted small">already has it</div>` : ""}</div></span><input type="checkbox" name="fr" value="${esc(f.id)}" ${already.has(f.id) ? "disabled" : ""}></label>`).join("")}</div>`,
    actions: [{ label: "Send", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }],
    onOpen: el => { el.addEventListener("change", () => { window.__fr = [...el.querySelectorAll("input[name=fr]:checked")].map(i => i.value); }); window.__fr = []; } });
  const ids = window.__fr || [];
  window.__fr = null;
  if (v !== "ok") return;
  if (!ids.length) return toast("Tick at least one friend");
  try { const res = await F.shareRound(r.id, ids); toast(`Sent to ${plural(res.shared, "friend")}`); await Y.pull(); } catch (e) { toast(e.message, 5000); }
}

/** ⋯: the round's own business, kept off the page. */
async function roundMenu(r, c) {
  const lg = S.leaguesOfRound(r.id);
  const scorer = S.isScorer(r);
  const v = await sheet({ title: r.name, body: `<div class="list">
      ${scorer ? `<button data-sheet="details"><span class="lead">${ICONS.edit}<div><div class="name">Name and date</div><div class="muted small">${esc(r.name)} · ${esc(fmtDate(r.date) || "no date")}</div></div></span><span class="chev">›</span></button>` : ""}
      ${scorer ? `<button data-sheet="players"><span class="lead">${ICONS.people}<div><div class="name">Players, sides and handicaps</div></div></span><span class="chev">›</span></button>` : ""}
      ${c.unlisted || !scorer ? "" : `<button data-sheet="attach"><span class="lead">${ICONS.trophy}<div><div class="name">Counts for</div><div class="muted small">${lg.length ? esc(lg.map(g => g.name).join(", ")) : "no society"}</div></div></span><span class="chev">›</span></button>`}
      ${Y.enabled() ? `<button data-sheet="history"><span class="lead">${ICONS.inbox}<div><div class="name">What was changed</div><div class="muted small">Every correction, and who made it</div></div></span><span class="chev">›</span></button>` : ""}
    </div>`, actions: [...(S.iPlayed(r) || scorer ? [{ label: r.status === "done" ? "Delete this round" : "Discard this round", value: "drop", kind: "danger" }] : []), { label: "Close", value: "no" }] });
  if (v === "details") return detailsSheet(r);
  if (v === "players") return go(`#players/${r.id}`);
  if (v === "attach") return go(`#attach/${r.id}`);
  if (v === "history") return historySheet(r, c);
  if (v === "drop") return dropRound(r.id);
}

async function detailsSheet(r) {
  const v = await sheet({ title: "Name and date", body: `<form id="rdet"><label>Name<input name="name" value="${esc(r.name)}"></label><label>Played on<input name="date" type="date" value="${esc(r.date || "")}"></label></form>`,
    actions: [{ label: "Save", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }],
    onOpen: el => { const f = el.querySelector("#rdet"); const k = () => { window.__rd = { name: f.name.value, date: f.date.value }; }; f.addEventListener("input", k); k(); } });
  const d = window.__rd; window.__rd = null;
  if (v !== "ok" || !d) return;
  r.name = d.name.trim() || r.name; r.date = d.date || null; S.saveRound(r); toast("Saved"); review(r.id, true);
}

async function historySheet(r, c) {
  await sheet({ title: "What was changed", body: `<div id="histbody"><p class="muted small">Reading the history…</p></div>`, actions: [{ label: "Close", value: "no", kind: "primary" }],
    onOpen: () => loadHistory(r.id, r, c) });
}

// ---------------------------------------------------------------- the round page
export function review(rid, keep = false) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  let M, R;
  try { M = compute(c, S.toModelRound(r)); R = roundRanking(c, { ...S.toModelRound(r), final: r.status === "done" }); } catch (err) {
    return page("Card", `<div class="banner warn">${esc(err.message)}</div><a class="btn" href="#players/${rid}">Fix the players</a>`, { back: `#score/${rid}/${S.holeOf(r)}` });
  }
  const scorer = S.isScorer(r), done = r.status === "done";
  const fmt = r.format || "stableford";
  const unfinished = S.scoringSeats(r).filter(e => M.unfinished.includes(e.name));
  const kinds = S.statsFor(rid);
  const byId = id => r.entries.find(e => e.playerId === id);
  const chips = e => c.par.map((par, i) => {
    const v = e.scores[i];
    const skip = (e.fromHole || 1) - 1 > i;
    const sel = ui.expanded === e.playerId && ui.selHole === i ? "sel" : "";
    return `<button class="chip ${sel}" data-act="sel-hole" data-pid="${e.playerId}" data-h="${i}" ${skip || !scorer ? "disabled" : ""}><small>${c.first_hole + i}</small>${skip ? `<span class="mk empty">—</span>` : mark(v, par)}</button>`;
  }).join("");
  const editor = e => {
    if (ui.expanded !== e.playerId || ui.selHole === null || !scorer) return "";
    const i = ui.selHole, par = c.par[i], ei = r.entries.indexOf(e);
    return `<div class="editor"><div class="edhead">Hole ${c.first_hole + i} · par ${par}${c.unlisted ? "" : ` · SI ${c.stroke_index[i]}`}</div>
      ${scoreStepper(e, ei, i, par)}${e.role === "team" ? "" : extrasRows(c, e, ei, i, kinds)}</div>`;
  };
  const oldPens = e => (e.penalties || []).length ? `<div class="pens">${e.penalties.map((p, k) => `<span class="pen">+${p.strokes} on hole ${p.hole}${p.reason ? ` (${esc(p.reason)})` : ""}${scorer ? ` <button data-act="del-pen" data-pid="${e.playerId}" data-k="${k}" aria-label="remove">×</button>` : ""}</span>`).join("")}</div>` : "";
  const detail = p => {
    const e = byId(p.id);
    if (!e) return "";
    return `<div class="card pl ${ui.expanded === e.playerId ? "open" : ""}">
      <button class="row plain" data-act="expand" data-pid="${e.playerId}">
        <div class="who"><div><div class="name">${esc(p.name)}${p.penalty_total ? ` <span class="pen">pen +${p.penalty_total}</span>` : ""}</div>
          <div class="muted small">hcp ${fmtHcp(p.ph)}${c.unlisted ? "" : ` · ${esc(p.tee)}`}${p.skipped.some(Boolean) ? ` · from hole ${c.first_hole + p.from_hole - 1}` : ""}${p.filled.some(Boolean) ? ` · ${plural(p.filled.filter(Boolean).length, "hole")} counted ${NO_SCORE}` : ""}</div>${nineLine(M, p)}${p.statline.any ? `<div class="muted small">${esc(statLine(p.statline))}</div>` : ""}</div></div>
        <div class="nums"><span><b class="num">${p.gross === null ? "NR" : p.gross}</b><small>gross${p.topar !== null ? " " + fmtToPar(p.topar) : ""}</small></span>
          <span><b class="num">${p.net === null ? "NR" : p.net}</b><small>net</small></span><span class="${fmt === "stableford" ? "acc" : ""}"><b class="num">${p.pts}</b><small>pts</small></span></div></button>
      ${ui.expanded === e.playerId ? `<div class="chips">${chips(e)}</div>${editor(e)}${oldPens(e)}` : ""}</div>`;
  };
  // the board in the round's own format, then every card underneath it to open and correct
  const ranking = R.rows.map(x => `<div class="rankrow ${x.place === 1 ? "p1" : ""}"><span class="pos">${x.place ?? "–"}</span><span class="t"><b>${esc(x.name)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span><span class="v">${esc(x.main)}</span></div>`).join("");
  const order = fmt === "stableford" ? M.stbl_board : fmt === "match" ? M.players : R.rows.map(x => M.players.find(p => p.id === x.id)).filter(Boolean).concat(M.players.filter(p => !R.rows.some(x => x.id === p.id)));
  const missing = unfinished.map(e => {
    const holes = e.scores.map((v, i) => v === null && (e.fromHole || 1) - 1 <= i ? c.first_hole + i : null).filter(x => x !== null);
    return `<div class="card row warnrow"><div><div class="name">${esc(e.name)}</div><div class="muted small">missing hole${holes.length === 1 ? "" : "s"} ${holes.join(", ")}</div></div>
      ${scorer ? `<a class="btn small" href="#score/${rid}/${holes[0] - c.first_hole}">Enter</a>` : ""}</div>`;
  }).join("");
  const noPar = holesWithoutPar(c);
  const conflicts = scorer && !done ? (ui.conflicts && ui.conflicts[rid]) || [] : [];
  const body = `
    ${!scorer ? `<div class="banner accent">${S.sharedWithMe().has(rid) ? "Shared with you." : "On your card."} You can look, not change.</div>` : ""}
    ${conflicts.map(x => `<div class="card warnrow conflict"><div><div class="name">Hole ${c.first_hole + x.hole}, ${esc(x.name)}</div><div class="muted small">${esc(x.a.who)} wrote ${x.a.v}, ${esc(x.b.who)} wrote ${x.b.v}. Which is right?</div></div>
      <div class="btnrow"><button class="btn small" data-act="pick" data-pid="${esc(x.pid)}" data-h="${x.hole}" data-v="${x.a.v}">${x.a.v}</button><button class="btn small" data-act="pick" data-pid="${esc(x.pid)}" data-h="${x.hole}" data-v="${x.b.v}">${x.b.v}</button></div></div>`).join("")}
    ${noPar.length ? `<div class="card row warnrow"><div><div class="name">No par yet</div><div class="muted small">hole${noPar.length === 1 ? "" : "s"} ${noPar.map(h => c.first_hole + h).join(", ")}</div></div>
      ${scorer ? `<a class="btn small" href="#score/${rid}/${noPar[0]}">Fill in</a>` : ""}</div>` : ""}
    ${missing ? `<h2>Not finished</h2>${missing}` : ""}
    <h2>${esc(formatLabel(fmt))}${done ? "" : " · as it stands"}</h2>
    ${ranking ? `<div class="ranking">${ranking}</div>` : `<p class="muted center">No complete scorecards yet.</p>`}
    ${order.length ? `<h2>Cards</h2>${scorer ? `<p class="muted small" style="margin:-4px 4px 8px">Tap a player, then a hole, to change a score.</p>` : ""}${order.map(detail).join("")}` : ""}
    ${partnerRow(rid) ? `<div class="list" style="margin-top:16px">${partnerRow(rid)}</div>` : ""}`;
  const bar = done ? "" : scorer ? `<a class="btn" href="#score/${rid}/${c.n - 1}">‹ Scoring</a><button class="btn primary" data-act="save-round" ${M.field && !noPar.length && !conflicts.length ? "" : "disabled"}>Save round</button>` : "";
  page(done ? "Card" : "Check the card", body, { back: done ? "#stats/rounds" : `#score/${rid}/${S.holeOf(r)}`, bar, sub: `${r.name} · ${courseTitle(c)}`, keepScroll: keep, bell: false,
    actions: `${iconBtn("share", "share", "Share")}${iconBtn("menu", "more", "More")}` });
  if (scorer && !done && Y.enabled() && !(ui.conflictsChecked || {})[rid]) checkConflicts(r).then(n => { if (n && location.hash.startsWith(`#review/${rid}`)) review(rid, true); });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const e = r.entries.find(x => x.playerId === (b.dataset.pid || ui.expanded));
    if (act === "share") return shareSheet(r);
    if (act === "menu") return roundMenu(r, c);
    if (act === "expand") { ui.expanded = ui.expanded === e.playerId ? null : e.playerId; ui.selHole = null; return review(rid, true); }
    if (!scorer) return;
    if (act === "pick") { S.setScore(r, e, Number(b.dataset.h), Number(b.dataset.v)); ui.conflicts[rid] = ui.conflicts[rid].filter(x => !(x.pid === b.dataset.pid && x.hole === Number(b.dataset.h))); return review(rid, true); }
    if (act === "sel-hole") { ui.expanded = e.playerId; ui.selHole = Number(b.dataset.h); return review(rid, true); }
    if (["inc", "dec", "par"].includes(act)) {
      const i = ui.selHole, v = e.scores[i], par = c.par[i];
      if (act === "inc") S.setScore(r, e, i, (v === null || v === 0) ? par : Math.min(30, v + 1));
      else if (act === "dec") S.setScore(r, e, i, (v === null || v === 0) ? par : Math.max(1, v - 1));
      else if (v === null || v === 0) S.setScore(r, e, i, par);
      else return;
      if (e.role !== "team") seedStats(r, e, i, c, kinds);
      return review(rid, true);
    }
    if (act === "x-inc" || act === "x-dec") { statStep(r, e, ui.selHole, b.dataset.k, act === "x-inc" ? 1 : -1, c, kinds); return review(rid, true); }
    if (act === "st-fw") { statTap(r, e, ui.selHole, act, b); return review(rid, true); }
    if (act === "del-pen") { e.penalties.splice(Number(b.dataset.k), 1); S.saveEntry(r, e); return review(rid, true); }
    if (act === "save-round") {
      if (unfinished.length && !await confirmSheet("Holes with no score", `${plural(unfinished.length, "player")} ${unfinished.length === 1 ? "has" : "have"} holes with no score, which count ${NO_SCORE} strokes each.`, { label: "Save anyway" })) return;
      r.status = "done"; S.saveRound(r);
      toast("Saved. ⤴ to share it", 3500);
      return review(rid);
    }
  });
}

/**
 * Two scorers who wrote different numbers for the same hole without either seeing the other's: the card asks
 * which is right before it is saved. A correction made after seeing the other number is not a conflict.
 */
async function checkConflicts(r) {
  ui.conflictsChecked = { ...(ui.conflictsChecked || {}), [r.id]: true };
  ui.conflicts = ui.conflicts || {};
  let rows;
  try { rows = await Y.roundLog(r.id); } catch (e) { return 0; }
  const found = [];
  for (const x of rows) {
    if (x.tbl !== "scores" || !x.before || x.before.strokes === undefined || x.before.strokes === null) continue;
    const prior = rows.find(y => y.tbl === "scores" && y.key === x.key && y !== x && String(y.updated_at) < String(x.updated_at) && y.account_id !== x.account_id && (y.after || {}).strokes === x.before.strokes);
    // the overwriting phone had not seen the earlier value if its own write was stamped before that value landed
    if (!prior || !(String(x.updated_at) < String(prior.at || prior.updated_at))) continue;
    const [, pid, hole] = String(x.key).split("|");
    const e = r.entries.find(y => y.playerId === pid);
    if (!e || found.some(f => f.pid === pid && f.hole === Number(hole))) continue;
    found.push({ pid, hole: Number(hole), name: e.name, a: { who: prior.author || "someone", v: x.before.strokes }, b: { who: x.author || "someone", v: (x.after || {}).strokes } });
  }
  ui.conflicts[r.id] = found;
  return found.length;
}

// ---------------------------------------------------------------- the leagues a round counts for
export function attach(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const mine = new Set(S.leaguesOfRound(rid).map(g => g.id));
  const list = S.leagues().map(g => `<label><input type="checkbox" data-act="toggle-league" data-gid="${g.id}" ${mine.has(g.id) ? "checked" : ""}> ${esc(g.name)}<span class="muted"> · ${plural(S.leagueRoundIds(g.id).length, "round")}</span></label>`).join("");
  const backTo = `#review/${rid}`;
  page("Counts for", `
    <p class="muted small">${esc(r.name)}: tick the societies this round counts for. Every member sees the table update.</p>
    <div class="card checks">${list || `<p class="muted">No societies yet. Make one below.</p>`}</div>
    <form id="newg" class="card form open"><h2>New society</h2><label>Name<input name="name" placeholder="e.g. Thursday society" required></label>
      <button class="btn" type="submit">Create and add this round</button></form>`,
  { back: backTo, bar: `<a class="btn primary" href="${backTo}">Done ›</a>` });
  bind(ev => {
    const b = ev.target.closest("[data-act=toggle-league]");
    if (b) { S.setLeagueRound(b.dataset.gid, rid, b.checked); if (b.checked) S.setSetting("lastLeague", b.dataset.gid); }
  });
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = S.createLeague(ev.target.name.value.trim() || "Society", 0, S.me() ? S.me().name : null);
    S.setLeagueRound(g.id, rid, true);
    S.setSetting("lastLeague", g.id);
    attach(rid);
  });
}
