// Courses and companies: the seats a golfer holds and the code box that gives them, the line on a branded card
// that lets a golfer keep their scores from the partner, the partner's own dashboard, and the operator's desk.
// The dashboard and the desk are the two screens meant for a laptop as much as a phone, so they open in any
// browser at app.hagolf.app, signed in, without the app installed.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as B from "../brand.js";
import { DATA } from "../data.js";
import { page, bind, esc, go, toast, ui, plural, fmtDate, avatar, sheet, confirmSheet, alertSheet, saveFiles, subtabs, sect, courseTitle, makeTheme,
  qrHtml, shareLink, appBase, applyBrand, FAMILIES, themesIn, ICONS, app } from "../ui.js";
import { loadFonts } from "../draw.js";
import { BRAND_STYLES, dayOutSheet, personalSheet, leagueSheet } from "../brandsheets.js";
import { showcaseRound, showcaseLeague } from "../sample.js";
import { buildRound, courseOf } from "./public.js";
import { standingsFor, standingsTable, FORMAT_NAMES } from "./formats.js";
import { fmtToPar } from "../model.js";
import { previewPage } from "./gate.js";

const KIND_WORD = { course: "Golf course", company: "Company" };
const PACK_NAMES = { pass: "Everything", nomark: "No mark", themes: "Every theme", boards: "Full boards", card: "Full card", matchplay: "Match play pack", grandprix: "Grand Prix pack", season: "Season pack" };
const skuName = s => PACK_NAMES[s] || (s.startsWith("theme:") ? `The ${s.slice(6)} theme` : s.startsWith("collection:") ? `The ${s.slice(11)} collection` : s);
const PERK_WORDS = { themes: "every theme, everywhere", pass: "everything in the shop, everywhere" };
const perkLine = c => c.perks && c.perks.length ? `Your seat carries ${c.perks.map(p => PERK_WORDS[p] || p).join(" and ")}.` : "Its rounds are made in full for everyone on them.";
const card = (title, body) => `<div class="card">${title ? `<div class="name" style="margin-bottom:6px">${esc(title)}</div>` : ""}${body}</div>`;
// a name typed as =HYPERLINK(...) would run in the partner's spreadsheet, so text that starts like a formula is quoted
const csvCell = v => { let s = v === null || v === undefined ? "" : String(v); if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const downloadCsv = (name, rows) => saveFiles([new File([rows.map(r => r.map(csvCell).join(",")).join("\n")], `${name}.csv`, { type: "text/csv" })], name);

// ---------------------------------------------------------------- the look, offered on a round or a league
/** A select of the partners this account may brand with; the one already on stays offered even if the seat is gone. */
export function brandField(name, selected) {
  const mine = B.myBrands();
  if (!mine.length && !selected) return "";
  const kept = selected && !mine.some(b => b.id === selected) ? (B.brandById(selected) || { id: selected, name: "A course or company's look" }) : null;
  return `<label>Course or company look <span class="muted">(its logo and colours on every sheet, made in full for everyone on it)</span>
    <select name="${name}" id="${name}"><option value="">None</option>${[...mine, ...(kept ? [kept] : [])].map(b =>
      `<option value="${esc(b.id)}" ${b.id === selected ? "selected" : ""}>${esc(b.name)}${b === kept ? " (kept)" : ""}</option>`).join("")}</select></label>`;
}

// ---------------------------------------------------------------- "don't show this to them"
let optouts = null;
async function loadOptouts(force = false) {
  if (!A.signedIn()) return [];
  if (optouts && !force) return optouts;
  try { optouts = (await A.api("/club/optouts")).optouts; } catch (e) { optouts = optouts || []; }
  return optouts;
}
const keptFrom = (club, rid = "") => (optouts || []).some(o => o.club === club && (o.round === "" || o.round === rid));
const says = (club, rid) => optouts === null ? "Checking…" : keptFrom(club, rid) ? "Your scores are kept from its dashboard" : "Sees this round's scores on its dashboard";

/** The line on a branded card that says who sees it, and lets the golfer say no. */
export function partnerRow(rid) {
  const b = B.brandOfRound(rid), r = S.getRound(rid);
  if (!b || !r || !A.signedIn() || !S.iPlayed(r)) return "";
  if (optouts === null) loadOptouts().then(() => { const el = document.querySelector(`[data-act=partner-optout][data-round="${rid}"] .says`); if (el) el.textContent = says(b.id, rid); });
  return `<button data-act="partner-optout" data-club="${esc(b.id)}" data-round="${esc(rid)}"><span class="lead">${ICONS.shield}<div><div class="name">${esc(b.name)}</div>
    <div class="muted small says">${says(b.id, rid)}</div></div></span><span class="chev">›</span></button>`;
}

async function optoutSheet(club, rid, name) {
  await loadOptouts();
  const all = keptFrom(club), one = !all && keptFrom(club, rid);
  const v = await sheet({ title: `What ${name} sees`, lead: `This round wears ${name}'s look, so it is on their dashboard: who played and what they scored. You can keep yours off it; the round, your card and the boards stay exactly as they are.`,
    actions: [
      ...(all || one ? [{ label: "Show my scores to them", value: "show", kind: "primary" }] : []),
      ...(!one && !all ? [{ label: "Keep this round from them", value: "round", kind: "primary" }] : []),
      ...(!all ? [{ label: `Keep all my rounds from ${name}`, value: "all" }] : []),
      { label: "Cancel", value: "no" }] });
  if (!v || v === "no") return;
  try {
    if (v === "show") { if (one) await A.api("/club/optout", { club, round: rid, hidden: false }); if (all) await A.api("/club/optout", { club, hidden: false }); }
    else await A.api("/club/optout", v === "all" ? { club } : { club, round: rid });
    await loadOptouts(true);
    toast(v === "show" ? `${name} sees your scores again` : `Kept from ${name}`);
  } catch (e) { toast(e.message, 5000); }
  dispatchEvent(new HashChangeEvent("hashchange"));
}
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-act=partner-optout]");
  if (!b) return;
  ev.stopPropagation();
  const brand = B.brandById(b.dataset.club);
  optoutSheet(b.dataset.club, b.dataset.round || "", brand ? brand.name : "this partner");
}, true);

// ---------------------------------------------------------------- my seats, and the code box
export async function partners() {
  const acct = A.account();
  if (!acct) return go("#me");
  const clubs = acct.clubs || [];
  await loadOptouts();
  const sc = acct.scans || { quota: 10, used: 0, free: 10 };
  page("Courses and companies", `
    <div class="card"><form id="codef"><label style="margin-top:0">Have a code?<input name="code" placeholder="ABCD2345" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12"></label>
      <button class="btn primary wide" type="submit" style="margin-top:12px">Use the code</button></form>
      <p class="muted small" style="margin:8px 0 0">A course or a company gives you one to put its look on the rounds you set up; a gift code gives you something from the shop.</p></div>
    ${clubs.length ? `${sect("Yours")}${clubs.map(c => `<div class="card">
        <div class="row"><div><div class="name">${esc(c.name)}</div><div class="muted small">${esc(KIND_WORD[c.kind] || "Partner")} · ${c.role === "owner" ? "you run it" : c.role === "organiser" ? "you organise it" : "member"}${c.live ? "" : " · contract ended"}</div></div>
          ${["owner", "organiser"].includes(c.role) ? `<a class="btn small primary" href="#partner/${esc(c.id)}">Dashboard</a>` : ""}</div>
        <p class="muted small" style="margin:8px 0">${c.live ? `Rounds and societies you set up can wear its look. ${perkLine(c)}` : "Its look stays on the rounds it was on; new ones go without."}</p>
        ${c.live ? `<div class="btnrow"><button class="btn small" data-act="scan" data-club="${esc(c.id)}">${ICONS.camera || ""} Scan a paper card</button><button class="btn small" data-act="society" data-club="${esc(c.id)}">${ICONS.trophy || ""} Start a society</button></div>
        <p class="muted small" style="margin:6px 0 0">${c.kind === "company" ? "Play on paper and photograph the card afterwards, no tournament to set up; or start a friendly competition with colleagues." : "Photograph a paper card afterwards, or start a society for your members."} Either way it wears ${esc(c.name)}'s look.</p>` : ""}
        <label class="switch"><span>Keep all my rounds from its dashboard</span><input type="checkbox" data-act="optall" data-club="${esc(c.id)}" ${keptFrom(c.id) ? "checked" : ""}></label>
        ${c.role === "owner" ? "" : `<div class="btnrow"><button class="btn small" data-act="leave" data-club="${esc(c.id)}">Leave</button></div>`}</div>`).join("")}`
      : `<p class="muted small center" style="margin:18px 0">You are not in a course or company yet.</p>`}
    ${sect("Card scans")}<div class="card"><div class="row"><div><div class="name">${sc.used} of ${sc.quota} this month</div>
      <div class="muted small">Photographing a paper card. ${sc.quota > (sc.free || 10) ? "Raised by what you hold." : "A course or company contract, or the Everything pass, raises it."}</div></div></div></div>
    ${acct.admin ? `${sect("Hagolf")}<div class="list"><a href="#admin"><span class="lead">${ICONS.settings}<div><div class="name">Operator desk</div><div class="muted small">Gifts, codes, partners and enquiries</div></div></span><span class="chev">›</span></a></div>` : ""}`,
    { back: "#me" });
  document.getElementById("codef").addEventListener("submit", ev => { ev.preventDefault(); const c = ev.target.code.value.trim(); if (c) go(`#redeem/${encodeURIComponent(c)}`); });
  app.querySelectorAll("[data-act=optall]").forEach(i => i.addEventListener("change", async () => {
    try { await A.api("/club/optout", { club: i.dataset.club, hidden: i.checked }); await loadOptouts(true); toast(i.checked ? "Kept from its dashboard" : "Shown on its dashboard again"); }
    catch (e) { toast(e.message, 5000); i.checked = !i.checked; }
  }));
  bind(async ev => {
    const s = ev.target.closest("[data-act=scan], [data-act=society]");
    if (s && s.dataset.act === "scan") { ui.scanBrand = s.dataset.club; return go("#scan"); }
    if (s) return (await import("./leagues.js")).newLeagueSheet(s.dataset.club);
    const b = ev.target.closest("[data-act=leave]");
    if (!b) return;
    if (!await confirmSheet("Leave?", "Its look goes from the rounds you set up from now on, and anything your seat carried goes too. Your rounds stay yours.", { label: "Leave", danger: true })) return;
    try { await A.api("/club/leave", { club: b.dataset.club }); await A.whoami(); applyBrand(); toast("Left"); } catch (e) { toast(e.message, 5000); }
    partners();
  });
}

/** `#redeem/<code>`: from the code box, or from a link a partner sent. Works in any browser. */
export async function redeem(code = "") {
  if (!A.signedIn()) return previewPage("A code", `<h3>Use a Hagolf code</h3><p class="muted">Sign in and <b>${esc(code)}</b> goes on your account, on every phone you use.</p>`, `#redeem/${encodeURIComponent(code)}`);
  page("A code", `<p class="muted center" style="margin-top:40px">Checking the code…</p>`, { back: "#partners" });
  let r;
  try { r = await A.api("/redeem", { code }); }
  catch (e) {
    page("A code", `<div class="banner warn">${esc(e.message)}</div>
      <div class="card"><form id="codef"><label style="margin-top:0">Try again<input name="code" value="${esc(code)}" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12"></label>
      <button class="btn primary wide" type="submit" style="margin-top:12px">Use the code</button></form></div>`, { back: "#partners" });
    document.getElementById("codef").addEventListener("submit", ev => { ev.preventDefault(); go(`#redeem/${encodeURIComponent(ev.target.code.value.trim())}`); });
    return;
  }
  await A.whoami();
  applyBrand();
  const gave = [r.club ? `A seat in <b>${esc(r.club.name)}</b>: rounds and societies you set up can wear its look.` : "",
    r.skus.length ? `${r.skus.map(s => `<b>${esc(skuName(s))}</b>`).join(", ")}${r.lasts ? `, for ${plural(r.lasts, "day")}` : ", for good"}.` : ""].filter(Boolean);
  page("A code", `<div class="card"><div class="name">Done</div><p>${gave.join("</p><p>") || "Nothing new: you held all of it already."}</p></div>
    <div class="btnrow"><a class="btn primary" href="#home">Home</a><a class="btn" href="#partners">Courses and companies</a></div>`, { back: "#partners" });
}

// ---------------------------------------------------------------- a partner's dashboard
const TABS = [["rounds", "Rounds"], ["players", "Players"], ["leagues", "Societies"], ["codes", "Codes"], ["people", "People"], ["look", "Look"]];
const cache = {};

const tile = (label, value, note = "") => `<div class="dtile"><small>${esc(label)}</small><b>${value}</b>${note ? `<span>${note}</span>` : ""}</div>`;

/**
 * A round still being played, as far as it has gone: scored as a finished card would be, then summed over the
 * holes actually walked, so a pick-up counts as it will on the card and the leader is the one ahead on points.
 */
function liveRound(P, r, course) {
  const entries = P.entries.filter(e => e.roundId === r.id);
  let M = { players: [] };
  try { M = buildRound(P, r, entries, P.scores.filter(s => s.roundId === r.id), course, true); } catch (e) { console.warn("dashboard: live round", r.id, e.message); }
  const rows = M.players.map(p => {
    const walked = p.raw_scores.map((v, i) => v !== null && v !== undefined ? i : -1).filter(i => i >= 0);
    const sum = xs => walked.reduce((a, i) => a + (xs[i] || 0), 0);
    return { name: p.name, thru: walked.length, pts: sum(p.hpts), gross: sum(p.scores), topar: sum(p.deltas) };
  }).sort((a, b) => b.pts - a.pts || b.thru - a.thru);
  return { id: r.id, name: r.name, date: r.date, status: r.status, hidden: r.hidden, course, field: entries.length, live: rows, stbl_board: [] };
}

/** The rounds a partner's look is on, as the app's own model scores them. */
function modelRounds(P) {
  const out = [];
  for (const r of P.rounds) {
    const course = courseOf(r.course, P.courses);
    if (!course) continue;
    if (r.status !== "done") { out.push(liveRound(P, r, course)); continue; }
    try { out.push(Object.assign(buildRound(P, r, P.entries.filter(e => e.roundId === r.id), P.scores.filter(s => s.roundId === r.id), course, true), { status: r.status, hidden: r.hidden, course })); }
    catch (e) { console.warn("dashboard: round left out", r.id, e.message); }
  }
  return out;
}

export async function partner(id, tab = "rounds") {
  if (!A.signedIn()) return previewPage("Dashboard", `<h3>A partner's dashboard</h3><p class="muted">Sign in with the account that runs it.</p>`, `#partner/${id}`);
  if (!cache[id]) page("Dashboard", `<p class="muted center" style="margin-top:40px">Loading…</p>`, { back: "#partners", wide: true });
  let C;
  try { C = (await A.api(`/club/${id}`)).club; cache[id] = { ...(cache[id] || {}), C }; }
  catch (e) { return page("Dashboard", `<div class="banner warn">${esc(e.message)}</div>`, { back: "#partners", wide: true }); }
  B.remember([C]);
  const k = C.contract, tabs = TABS.filter(([t]) => t !== "leagues" || k.standings);
  const head = `<div class="dtiles">
      ${tile("Contract", esc(k.name), C.expires ? `until ${esc(fmtDate(C.expires))}` : C.live ? "running" : "ended")}
      ${tile("Seats", `${C.used} <small>of ${C.seats}</small>`, "golfers holding a code")}
      ${tile("Codes", `${C.codes} <small>of ${k.codes}</small>`, "active at once")}
      ${tile("Organisers", `${C.organisers} <small>of ${k.organisers}</small>`)}
      ${tile("Rounds", String(C.rounds), "wearing the look")}
      ${tile("Scans", String(C.scansThisMonth), `this month, ${k.scans} a golfer`)}
    </div>
    ${C.live ? "" : `<div class="banner warn">The contract has ended. The look stays on the rounds it was on; codes and new rounds wait for a renewal.</div>`}
    ${subtabs(tabs.map(([t, l]) => `<button data-act="tab" data-t="${t}" class="${t === tab ? "on" : ""}">${l}</button>`).join(""))}
    <div id="dpane"><p class="muted center" style="margin:30px 0">Loading…</p></div>`;
  page(C.name, head, { back: "#partners", wide: true, sub: `${KIND_WORD[C.kind] || "Partner"} · ${k.name}` });
  bind(ev => { const b = ev.target.closest("[data-act=tab]"); if (b) go(`#partner/${id}/${b.dataset.t}`); });
  const pane = document.getElementById("dpane");
  try { await (PANES[tab] || PANES.rounds)(pane, C); } catch (e) { pane.innerHTML = `<div class="banner warn">${esc(e.message)}</div>`; }
}

async function roundsOf(C, refresh = false) {
  const c = cache[C.id];
  const q = c.range || {};
  if (!c.P || refresh || Date.now() - (c.at || 0) > 30000) c.at = Date.now(), c.P = await A.api(`/club/${C.id}/rounds${q.from || q.to ? `?from=${q.from || ""}&to=${q.to || ""}` : ""}`);
  return c.P;
}

const boardRows = M => M.stbl_board.map(p => `<tr><td>${p.splace}</td><td>${esc(p.name)}</td><td class="n">${p.ph ?? ""}</td><td class="n">${p.gross ?? "NR"}</td><td class="n">${p.topar === null ? "" : fmtToPar(p.topar)}</td><td class="n">${p.net ?? "NR"}</td><td class="n"><b>${p.pts}</b></td></tr>`).join("");

const PANES = {
  async rounds(pane, C) {
    const c = cache[C.id], P = await roundsOf(C), Ms = modelRounds(P), q = c.range || {};
    const open = ui.dashOpen || null;
    pane.innerHTML = `<form id="range" class="drange"><label>From<input type="date" name="from" value="${esc(q.from || "")}"></label><label>To<input type="date" name="to" value="${esc(q.to || "")}"></label>
        <button class="btn small" type="submit">Show</button>${C.contract.export ? `<button class="btn small" type="button" data-act="csv">Download CSV</button>` : ""}</form>
      ${Ms.length ? `<div class="dtable"><table><thead><tr><th>Date</th><th>Round</th><th>Course</th><th class="n">Players</th><th>Leader</th><th></th></tr></thead><tbody>
        ${Ms.map(M => `<tr class="click" data-act="open" data-r="${esc(M.id)}"><td>${esc(fmtDate(M.date))}</td><td>${esc(M.name)}${M.status === "done" ? "" : ` <span class="live">live</span>`}</td>
          <td>${esc(courseTitle(M.course))}</td><td class="n">${M.field}${M.hidden ? ` <span class="muted" title="kept their scores from you">+${M.hidden}</span>` : ""}</td>
          <td>${M.live ? `in play, ${M.live[0] && M.live[0].thru ? `${esc(M.live[0].name)} · ${M.live[0].pts} pts after ${M.live[0].thru}` : "nobody out yet"}` : M.stbl_board[0] ? `${esc(M.stbl_board[0].name)} · ${M.stbl_board[0].pts} pts` : ""}</td><td class="chev">${open === M.id ? "⌄" : "›"}</td></tr>
          ${open === M.id ? `<tr class="sub"><td colspan="6"><table class="inner">${M.live
            ? `<thead><tr><th>Player</th><th class="n">Holes</th><th class="n">Gross so far</th><th class="n">To par</th><th class="n">Pts</th></tr></thead><tbody>${M.live.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.thru}</td><td class="n">${p.thru ? p.gross : ""}</td><td class="n">${p.thru ? fmtToPar(p.topar) : ""}</td><td class="n"><b>${p.thru ? p.pts : ""}</b></td></tr>`).join("")}</tbody>`
            : `<thead><tr><th>#</th><th>Player</th><th class="n">Hcp</th><th class="n">Gross</th><th class="n">To par</th><th class="n">Net</th><th class="n">Pts</th></tr></thead><tbody>${boardRows(M)}</tbody>`}</table>
            ${M.hidden ? `<p class="muted small">${plural(M.hidden, "golfer")} on this card chose to keep their scores from you.</p>` : ""}</td></tr>` : ""}`).join("")}
        </tbody></table></div>` : `<p class="muted center" style="margin:30px 0">No rounds wear the look${q.from || q.to ? " in those dates" : " yet"}. Rounds and societies set up by someone holding a code show here as they are played.</p>`}`;
    pane.querySelector("#range").addEventListener("submit", async ev => { ev.preventDefault(); c.range = { from: ev.target.from.value, to: ev.target.to.value }; await roundsOf(C, true); PANES.rounds(pane, C); });
    pane.onclick = ev => {
      const t = ev.target.closest("[data-act]");
      if (!t) return;
      if (t.dataset.act === "open") { ui.dashOpen = ui.dashOpen === t.dataset.r ? null : t.dataset.r; PANES.rounds(pane, C); }
      if (t.dataset.act === "csv") downloadCsv(`${C.name} rounds`, [["date", "round", "course", "status", "position", "player", "handicap", "gross", "to par", "net", "points"],
        ...Ms.filter(M => !M.live).flatMap(M => M.stbl_board.map(p => [M.date, M.name, courseTitle(M.course), M.status, p.splace, p.name, p.ph, p.gross, p.topar, p.net, p.pts]))]);
    };
  },

  async players(pane, C) {
    const Ms = modelRounds(await roundsOf(C)).filter(M => M.status === "done");
    const by = new Map();
    for (const M of Ms) for (const p of M.stbl_board) {
      const x = by.get(p.id) || { name: p.name, rounds: 0, pts: 0, best: null, low: null, last: null };
      x.rounds++; x.pts += p.pts; x.best = Math.max(x.best ?? -1, p.pts);
      if (p.gross !== null) x.low = x.low === null ? p.gross : Math.min(x.low, p.gross);
      if (!x.last || M.date > x.last) { x.last = M.date; x.name = p.name; }
      by.set(p.id, x);
    }
    const rows = [...by.values()].sort((a, b) => b.rounds - a.rounds || b.pts / b.rounds - a.pts / a.rounds);
    pane.innerHTML = rows.length ? `<div class="dtable"><table><thead><tr><th>Player</th><th class="n">Rounds</th><th class="n">Avg pts</th><th class="n">Best pts</th><th class="n">Best gross</th><th>Last played</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.rounds}</td><td class="n">${(x.pts / x.rounds).toFixed(1)}</td><td class="n">${x.best}</td><td class="n">${x.low ?? ""}</td><td>${esc(fmtDate(x.last))}</td></tr>`).join("")}
      </tbody></table></div>${C.contract.export ? `<div class="btnrow"><button class="btn small" data-act="csvp">Download CSV</button></div>` : ""}`
      : `<p class="muted center" style="margin:30px 0">Nobody has finished a round in the look yet.</p>`;
    const b = pane.querySelector("[data-act=csvp]");
    if (b) b.addEventListener("click", () => downloadCsv(`${C.name} players`, [["player", "rounds", "average points", "best points", "best gross", "last played"], ...rows.map(x => [x.name, x.rounds, (x.pts / x.rounds).toFixed(1), x.best, x.low, x.last])]));
  },

  async leagues(pane, C) {
    const P = await roundsOf(C), Ms = modelRounds(P).filter(M => M.status === "done");
    if (!P.leagues.length) { pane.innerHTML = `<p class="muted center" style="margin:30px 0">No society wears the look yet. An organiser holding a code sets it in the society's settings.</p>`; return; }
    pane.innerHTML = P.leagues.map(l => {
      const g = { id: l.id, name: l.name, formats: S.cleanFormats(l.formats), bestN: l.bestN };
      const LM = Ms.filter(M => l.rounds.includes(M.id)), members = [...new Set(LM.flatMap(M => M.players.map(p => p.id)))];
      return `${sect(l.name, `<span class="muted small">${plural(LM.length, "round")}</span>`)}${LM.length ? g.formats.map(f => `${g.formats.length > 1 ? `<h3 class="small">${esc(FORMAT_NAMES[f])}</h3>` : ""}${standingsTable(f, standingsFor(g, LM, members, f), g, null)}`).join("") : `<p class="muted small">No finished rounds yet.</p>`}`;
    }).join("");
  },

  async codes(pane, C) {
    const r = await A.api(`/club/${C.id}/codes`);
    const fresh = cache[C.id].made;
    const link = code => `${appBase()}#redeem/${code}`;
    const state = c => c.revoked ? "revoked" : c.expires && c.expires < S.today() ? "expired" : c.uses_max && c.uses >= c.uses_max ? "used up" : "active";
    pane.innerHTML = `${fresh ? `<div class="card codebig"><small>New code${fresh.note ? ` · ${esc(fresh.note)}` : ""}</small><b>${esc(fresh.code)}</b>
        <div class="qrwrap">${qrHtml(link(fresh.code))}</div><p class="muted small">Shown once. Read it out, or send the link: it opens straight on the code.</p>
        <div class="btnrow"><button class="btn small primary" data-act="share" data-code="${esc(fresh.code)}">Send the link</button></div></div>` : ""}
      <div class="card"><form id="mkcode"><div class="two"><label style="margin-top:0">Uses <span class="muted">(0 = up to the seats)</span><input name="uses" inputmode="numeric" value="0"></label>
        <label style="margin-top:0">Works until <span class="muted">(optional)</span><input name="expires" type="date"></label></div>
        <label>Note <span class="muted">(who it is for)</span><input name="note" maxlength="80" placeholder="Members 2027, the Friday group…"></label>
        <button class="btn primary" type="submit" style="margin-top:10px" ${C.live ? "" : "disabled"}>Make a code</button>
        <p class="muted small" style="margin:8px 0 0">${C.contract.name} has ${plural(C.contract.codes, "code")} at once and ${C.seats} seats. A code stops working once the seats are taken.</p></form></div>
      ${r.codes.length ? `<div class="dtable"><table><thead><tr><th>Code</th><th>Note</th><th class="n">Used</th><th>Until</th><th>State</th><th></th></tr></thead><tbody>
        ${r.codes.map(c => `<tr><td class="mono">…${esc(c.hint || "")}</td><td>${esc(c.note || "")}</td><td class="n">${c.uses}${c.uses_max ? ` of ${c.uses_max}` : ""}</td><td>${c.expires ? esc(fmtDate(c.expires)) : ""}</td>
          <td>${state(c)}</td><td>${state(c) === "active" ? `<button class="btn small" data-act="revoke" data-id="${esc(c.id)}">Revoke</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
    cache[C.id].made = null;
    pane.querySelector("#mkcode").addEventListener("submit", async ev => {
      ev.preventDefault();
      try { const m = await A.api(`/club/${C.id}/codes`, { uses: Number(ev.target.uses.value) || 0, expires: ev.target.expires.value || null, note: ev.target.note.value.trim() });
        cache[C.id].made = { code: m.code, note: ev.target.note.value.trim() }; partner(C.id, "codes"); }
      catch (e) { toast(e.message, 5000); }
    });
    pane.onclick = async ev => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "share") return shareLink(link(b.dataset.code), C.name, `A code for ${C.name} on Hagolf: ${b.dataset.code}`);
      if (b.dataset.act === "revoke") {
        if (!await confirmSheet("Revoke this code?", "Nobody new can use it. Whoever already did keeps their seat.", { label: "Revoke", danger: true })) return;
        try { await A.api(`/club/${C.id}/codes/${b.dataset.id}/revoke`, {}); partner(C.id, "codes"); } catch (e) { toast(e.message, 5000); }
      }
    };
  },

  async people(pane, C) {
    const r = await A.api(`/club/${C.id}/members`);
    const owner = C.role === "owner" || C.role === "operator";
    pane.innerHTML = `<div class="dtable"><table><thead><tr><th>Golfer</th><th>Role</th><th>Since</th><th></th></tr></thead><tbody>
      ${r.members.map(m => `<tr><td><span class="lead">${avatar(m.name || "?")}<span>${esc(m.name || "Somebody")}<br><span class="muted small">${esc(m.email || "")}</span></span></span></td><td>${esc(m.role)}</td><td>${esc(fmtDate((m.joined || "").slice(0, 10)))}</td>
        <td>${m.role === "owner" ? "" : `<div class="btnrow tight">${owner ? `<button class="btn small" data-act="role" data-a="${esc(m.id)}" data-r="${m.role === "organiser" ? "member" : "organiser"}">${m.role === "organiser" ? "Make member" : "Make organiser"}</button>` : ""}
          <button class="btn small danger" data-act="remove" data-a="${esc(m.id)}">Remove</button></div>`}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">Organisers see this dashboard and make codes. ${C.contract.name} has ${plural(C.contract.organisers, "organiser")}, the owner included.</p>`;
    pane.onclick = async ev => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "remove" && !await confirmSheet("Remove them?", "Their seat comes back. Their rounds stay theirs, and the look stays on the ones it was on.", { label: "Remove", danger: true })) return;
      try { await A.api(`/club/${C.id}/members`, b.dataset.act === "remove" ? { account: b.dataset.a, remove: true } : { account: b.dataset.a, role: b.dataset.r }); partner(C.id, "people"); }
      catch (e) { toast(e.message, 5000); }
    };
  },

  async look(pane, C) {
    const t = C.template || {}, f = new Set(C.contract.fields), pal = C.palette || {};
    const base = pal.base || C.theme || "hagolf", baseT = DATA.themes.find(x => x.name === base) || DATA.themes[0];
    const has = k => f.has(k);
    const lock = (what, tiers) => `<p class="muted small lockline">${ICONS.lock} ${esc(what)} come with ${tiers}.</p>`;
    const courses = new Set(C.courses || []);
    pane.innerHTML = `<form id="lookf" class="dlook">
      <div class="card"><div class="iconpick"><span class="logoprev">${C.logo ? `<img src="${C.logo}" alt="">` : `<span class="muted small">No logo</span>`}</span><div><b>Logo</b><small>On every board and card, top right. A PNG with a clear background reads best.</small>
        <div class="btnrow"><label class="btn small">${ICONS.image} ${C.logo ? "Change" : "Upload"}<input type="file" accept="image/*" id="logofile" hidden></label>${C.logo ? `<button type="button" class="btn small" data-act="logo-clear">Remove</button>` : ""}</div></div></div>
        <label>Name<input name="name" value="${esc(C.name)}" maxlength="80"></label></div>
      <div class="card"><div class="name">Colours</div>
        <label>Start from<select name="base">${FAMILIES.map(fm => `<optgroup label="${esc(fm.name)}">${themesIn(fm.key).map(x => `<option value="${x.name}" ${x.name === base ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>
        <div class="two"><label>Accent<input type="color" name="ACCENT" value="${esc(pal.ACCENT || baseT.ACCENT)}"></label><label>Background<input type="color" name="BG" value="${esc(pal.BG || baseT.BG)}"></label></div>
        <div class="two"><label>Panels<input type="color" name="PANEL" value="${esc(pal.PANEL || baseT.PANEL)}"></label><label>Writing<input type="color" name="INK" value="${esc(pal.INK || baseT.INK)}"></label></div></div>
      <div class="card"><div class="name">What the sheets say</div>
        <label>Line above every title<input name="kicker" maxlength="60" value="${esc(t.kicker || "")}" placeholder="${esc(C.name)}"></label>
        <label>In the corner, instead of hagolf.app<input name="mark" maxlength="40" value="${esc(t.mark || "")}" placeholder="${esc(C.name)}"></label>
        ${has("foot") ? `<label>Footer line<input name="foot" maxlength="140" value="${esc(t.foot || "")}" placeholder="Book your next round at the pro shop"></label>
          <label>A QR code to<input name="link" type="url" value="${esc(t.link || "")}" placeholder="https://…"></label>
          <label class="switch"><span>The date on every sheet</span><input type="checkbox" name="date" ${t.date ? "checked" : ""}></label>
          <label>Images offered</label><div class="checks">${[["stbl", "Stableford board"], ["gross", "Gross board"], ["both", "Both boards"], ["holes", "How the holes played"], ["cards", "Player cards"]].map(([k, l]) =>
            `<label><input type="checkbox" name="kinds" value="${k}" ${!t.kinds || t.kinds.includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</div>` : lock("A footer line, a QR code, the date and the choice of images", "Clubhouse and Signature")}
        ${has("titles") ? `<label>Own titles <span class="muted">(leave empty for ours)</span></label><div class="two">${[["stbl", "Stableford board"], ["gross", "Gross board"], ["both", "Both boards"], ["holes", "The holes"], ["standings", "Society standings"]].map(([k, l]) =>
            `<label>${l}<input name="title-${k}" maxlength="50" value="${esc((t.titles || {})[k] || "")}"></label>`).join("")}</div>
          <label>House style<select name="house"><option value="">The look's own</option>${FAMILIES.map(fm => `<option value="${fm.key}" ${t.house === fm.key ? "selected" : ""}>${esc(fm.name)}</option>`).join("")}</select></label>` : has("foot") ? lock("Your own titles and house style", "Signature") : ""}</div>
      <div class="card"><div class="name">Your own sheets</div><p class="muted small">Few words and your logo at the centre. The style each one opens on; anyone making images can still pick another.</p>
        <div class="two">${[["dayout", "Day out board"], ["personal", "Personal card"], ["league", "Society table"]].map(([k, l]) =>
          `<label>${l}<select name="style-${k}">${BRAND_STYLES[k].map(s => `<option value="${s.key}" ${(t.styles || {})[k] === s.key ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>`).join("")}</div></div>
      ${C.kind === "course" ? `<div class="card"><div class="name">Your courses</div><p class="muted small">A round set up on one of these offers your look first.</p>
        <input class="search" id="cq" placeholder="Search courses" autocomplete="off"><div class="checks" id="clist"></div></div>` : ""}
      <div class="btnrow"><button class="btn primary" type="submit">Save the look</button><button class="btn" type="button" data-act="preview">Preview</button></div>
      <div id="lookprev"></div></form>`;
    const form = pane.querySelector("#lookf");
    let logo = C.logo || null;
    const drawCourses = () => {
      const el = pane.querySelector("#clist");
      if (!el) return;
      const q = (pane.querySelector("#cq").value || "").toLowerCase();
      const list = S.courses().filter(c => courses.has(c.slug) || (q.length > 1 && courseTitle(c).toLowerCase().includes(q))).slice(0, 40);
      el.innerHTML = list.map(c => `<label><input type="checkbox" value="${esc(c.slug)}" ${courses.has(c.slug) ? "checked" : ""}> ${esc(courseTitle(c))}</label>`).join("") || `<p class="muted small">Type part of a course's name.</p>`;
    };
    if (C.kind === "course") {
      drawCourses();
      pane.querySelector("#cq").addEventListener("input", drawCourses);
      pane.querySelector("#clist").addEventListener("change", ev => { if (ev.target.checked) courses.add(ev.target.value); else courses.delete(ev.target.value); });
    }
    const collect = () => {
      const fd = new FormData(form), v = k => String(fd.get(k) || "").trim();
      const palette = { base: v("base") };
      const bt = DATA.themes.find(x => x.name === palette.base) || baseT;
      for (const k of ["ACCENT", "BG", "PANEL", "INK"]) if (v(k).toUpperCase() !== String(bt[k]).toUpperCase()) palette[k] = v(k).toUpperCase();
      const template = { kicker: v("kicker"), mark: v("mark"), foot: v("foot"), link: v("link"), date: fd.get("date") === "on", kinds: has("kinds") ? fd.getAll("kinds") : undefined, house: v("house"),
        titles: Object.fromEntries(["stbl", "gross", "both", "holes", "standings"].map(k => [k, v(`title-${k}`)]).filter(([, x]) => x)),
        styles: Object.fromEntries(["dayout", "personal", "league"].map(k => [k, v(`style-${k}`)])) };
      return { name: v("name"), palette, template, courses: [...courses] };
    };
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const draft = collect();
      if (has("kinds") && !draft.template.kinds.length) return toast("Tick at least one image to offer");
      try { const r = await A.api(`/club/${C.id}/brand`, { ...draft, logo }); B.remember([r.brand]); toast("Saved"); partner(C.id, "look"); }
      catch (e) { toast(e.message, 5000); }
    });
    pane.querySelector("#logofile").addEventListener("change", async ev => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try { logo = await shrinkLogo(file); pane.querySelector(".logoprev").innerHTML = `<img src="${logo}" alt="">`; toast("Logo ready; save to keep it"); }
      catch (e) { toast(e.message, 5000); }
    });
    pane.onclick = async ev => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "logo-clear") { logo = null; pane.querySelector(".logoprev").innerHTML = `<span class="muted small">No logo</span>`; }
      if (b.dataset.act === "preview") {
        const out = pane.querySelector("#lookprev");
        out.innerHTML = `<p class="muted small">Drawing…</p>`;
        const draft = { ...C, ...collect(), logo, id: `${C.id}-draft-${Date.now()}` };
        draft.template = { ...draft.template, kinds: null };
        out.querySelectorAll("img").forEach(i => URL.revokeObjectURL(i.src));
        try { out.innerHTML = `${(await previewOn(draft)).map(([src, what]) => `<img class="lookimg" src="${src}" alt="${what} in this look">`).join("")}
          <p class="muted small">Drawn on the showcase round, four invented golfers at Heron's Reach. What the contract does not include is left off when it is saved.</p>`; }
        catch (e) { out.innerHTML = `<div class="banner warn">${esc(e.message)}</div>`; }
      }
    };
  },
};

/** The partner's own three sheets in a draft look, drawn on the showcase round and society, as images to show. */
async function previewOn(b) {
  await loadFonts(DATA.fonts);
  const T = makeTheme(B.brandTheme(b) || DATA.themes[0]), st = b.template.styles || {};
  const M = showcaseRound(), L = showcaseLeague();
  const figs = await B.withBrand(b, M.date, () => [
    [dayOutSheet(M, T, st.dayout), "The day out board"], [personalSheet(M, M.stbl_board[0].name, T, st.personal), "A personal card"],
    [leagueSheet(standingsFor(L.g, L.Ms, L.members, "stableford"), L.g, T, "stableford", st.league), "The society table"]]);
  return Promise.all(figs.map(async ([fig, what]) => [URL.createObjectURL(await fig.toBlob()), what]));
}

// Fitted inside 640 by 256 and re-encoded on the phone, keeping a clear background, so every phone that draws it pulls a few tens of kB.
function shrinkLogo(file, W = 640, H = 256) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, W / img.naturalWidth, H / img.naturalHeight);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const webp = c.toDataURL("image/webp", 0.9), out = webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
      if (out.length > 200000) return no(new Error("That logo is too detailed to keep small; try a simpler file"));
      ok(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error("That file is not an image this phone can read")); };
    img.src = url;
  });
}

// ---------------------------------------------------------------- the operator's desk
const DESK = [["give", "Give"], ["codes", "Codes"], ["partners", "Partners"], ["enquiries", "Enquiries"]];

export async function admin(tab = "give") {
  if (!A.signedIn()) return previewPage("Operator", `<h3>The operator's desk</h3><p class="muted">Sign in with an operator's account.</p>`, `#admin/${tab}`);
  if (!(A.account() || {}).admin) return page("Operator", `<div class="banner warn">This account is not an operator.</div>`, { back: "#partners", wide: true });
  page("Operator", `${subtabs(DESK.map(([t, l]) => `<button data-act="tab" data-t="${t}" class="${t === tab ? "on" : ""}">${l}</button>`).join(""))}<div id="dpane"><p class="muted center" style="margin:30px 0">Loading…</p></div>`,
    { back: "#partners", wide: true, sub: "Hagolf" });
  bind(ev => { const b = ev.target.closest("[data-act=tab]"); if (b) go(`#admin/${b.dataset.t}`); });
  const pane = document.getElementById("dpane");
  try { await (DESKS[tab] || DESKS.give)(pane); } catch (e) { pane.innerHTML = `<div class="banner warn">${esc(e.message)}</div>`; }
}

const DESKS = {
  async give(pane) {
    const cat = ui.adminCat || (ui.adminCat = await A.api("/admin/catalogue"));
    const pick = (sku, label, extra = "") => `<label><input type="checkbox" name="sku" value="${esc(sku)}"> ${esc(label)}${extra}</label>`;
    pane.innerHTML = `<form id="givef"><div class="dgrid">
      <div class="card"><div class="name">What</div><div class="checks">${cat.skus.map(s => pick(s.sku, s.name, ` <span class="muted small">${esc(s.blurb || "")}</span>`)).join("")}</div>
        <p class="muted small">Or a collection, or single themes:</p>
        ${cat.collections.map(c => `<details class="tfam"><summary><span class="fname">${esc(c.name)}</span><span class="muted small">${c.themes.length}</span></summary><div class="checks">
          ${pick(c.sku, `The whole ${c.name.toLowerCase()} collection`)}
          ${cat.themes.filter(t => t.family === c.key).map(t => pick(t.sku, t.name)).join("")}</div></details>`).join("")}</div>
      <div class="card"><div class="name">To whom</div>
        <div class="segpick"><button type="button" data-act="mode" data-m="emails" class="${ui.giveMode !== "codes" ? "on" : ""}">Addresses</button><button type="button" data-act="mode" data-m="codes" class="${ui.giveMode === "codes" ? "on" : ""}">Codes</button></div>
        ${ui.giveMode === "codes" ? `<div class="two"><label>How many codes<input name="count" inputmode="numeric" value="1"></label><label>Uses each<input name="uses" inputmode="numeric" value="1"></label></div>
            <label>Redeemable until <span class="muted">(optional)</span><input name="expires" type="date"></label>`
          : `<label>Email addresses <span class="muted">(one a line, or commas; someone without an account gets it on their first sign-in)</span><textarea name="emails" rows="6"></textarea></label>`}
        <label>Lasts <span class="muted">(days once given; empty is for good)</span><input name="lastsDays" inputmode="numeric" placeholder="for good"></label>
        <label>Note <span class="muted">(why: press, prize, tester)</span><input name="note" maxlength="120"></label>
        <button class="btn primary wide" type="submit" style="margin-top:12px">Give</button>
        <div id="gaveout"></div></div></div></form>`;
    pane.querySelectorAll("[data-act=mode]").forEach(b => b.addEventListener("click", () => { ui.giveMode = b.dataset.m; DESKS.give(pane); }));
    pane.querySelector("#givef").addEventListener("submit", async ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target), skus = fd.getAll("sku");
      if (!skus.length) return toast("Tick something to give");
      const common = { skus, lastsDays: Number(fd.get("lastsDays")) || null, note: String(fd.get("note") || "").trim() };
      const out = pane.querySelector("#gaveout");
      try {
        if (ui.giveMode === "codes") {
          const r = await A.api("/admin/codes", { ...common, count: Number(fd.get("count")) || 1, uses: Number(fd.get("uses")) || 1, expires: fd.get("expires") || null });
          out.innerHTML = `<h3>${plural(r.codes.length, "code")}</h3><p class="muted small">Each gives ${esc(r.skus.map(s => s.name).join(", "))}, ${plural(r.uses, "use")}. Shown once.</p>
            <div class="linkbox mono">${r.codes.map(esc).join("<br>")}</div><div class="btnrow"><button type="button" class="btn small" data-act="copy">Copy all</button><button type="button" class="btn small" data-act="csvc">Download CSV</button></div>`;
          out.querySelector("[data-act=copy]").addEventListener("click", () => navigator.clipboard.writeText(r.codes.join("\n")).then(() => toast("Copied")));
          out.querySelector("[data-act=csvc]").addEventListener("click", () => downloadCsv("hagolf codes", [["code", "link", "gives"], ...r.codes.map(c => [c, `${appBase()}#redeem/${c}`, r.skus.map(s => s.name).join("; ")])]));
        } else {
          const r = await A.api("/admin/grant", { ...common, emails: String(fd.get("emails") || "") });
          out.innerHTML = `<h3>Given</h3><p>${r.granted.length ? `Now: ${esc(r.granted.map(g => g.name || g.email).join(", "))}.` : ""}</p>${r.pending.length ? `<p>On their first sign-in: ${esc(r.pending.join(", "))}.</p>` : ""}`;
        }
      } catch (e) { toast(e.message, 6000); }
    });
  },

  async codes(pane) {
    const [{ codes }, { gifts }] = await Promise.all([A.api("/admin/codes"), A.api("/admin/gifts")]);
    pane.innerHTML = `${sect("Gift codes")}${codes.length ? `<div class="dtable"><table><thead><tr><th>Code</th><th>Gives</th><th class="n">Used</th><th>Until</th><th>Lasts</th><th>Note</th><th></th></tr></thead><tbody>
      ${codes.map(c => `<tr><td class="mono">…${esc(c.hint || "")}</td><td>${esc(c.skus.map(skuName).join(", "))}</td><td class="n">${c.uses} of ${c.uses_max}</td><td>${c.expires ? esc(fmtDate(c.expires)) : ""}</td>
        <td>${c.lasts_days ? plural(c.lasts_days, "day") : "for good"}</td><td>${esc(c.note || "")}</td><td>${c.revoked ? "revoked" : `<button class="btn small" data-act="revoke" data-id="${esc(c.id)}">Revoke</button>`}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted small">None yet.</p>`}
      ${sect("Waiting for a first sign-in")}${gifts.length ? `<div class="dtable"><table><thead><tr><th>Address</th><th>Gives</th><th>Note</th><th>Since</th></tr></thead><tbody>
      ${gifts.map(g => `<tr><td>${esc(g.email)}</td><td>${esc(g.skus.map(skuName).join(", "))}</td><td>${esc(g.note || "")}</td><td>${esc(fmtDate(g.created.slice(0, 10)))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">Nobody.</p>`}`;
    pane.onclick = async ev => {
      const b = ev.target.closest("[data-act=revoke]");
      if (!b || !await confirmSheet("Revoke this code?", "Nobody new can use it; what was already given stays.", { label: "Revoke", danger: true })) return;
      try { await A.api(`/admin/codes/${b.dataset.id}/revoke`, {}); admin("codes"); } catch (e) { toast(e.message, 5000); }
    };
  },

  async partners(pane) {
    const { partners: list } = await A.api("/admin/partners");
    const contracts = (ui.adminCat || (ui.adminCat = await A.api("/admin/catalogue"))).contracts;
    const tierSel = (name, sel) => `<select name="${name}">${contracts.map(k => `<option value="${k.key}" ${k.key === sel ? "selected" : ""}>${esc(k.name)} · ${k.seats} seats</option>`).join("")}</select>`;
    pane.innerHTML = `${list.length ? `<div class="dtable"><table><thead><tr><th>Partner</th><th>Kind</th><th>Contract</th><th class="n">Seats</th><th>Until</th><th>Owner</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr><td><a href="#partner/${esc(p.id)}">${esc(p.name)}</a>${p.plan ? `<br><span class="muted small">${esc(p.plan)}</span>` : ""}</td><td>${esc(KIND_WORD[p.kind] || p.kind)}</td><td>${esc(p.tier)}${p.live ? "" : " · <b>ended</b>"}</td>
        <td class="n">${p.used} of ${p.seats}</td><td>${p.expires ? esc(fmtDate(p.expires)) : ""}</td><td>${esc(p.owner || "")}</td><td><button class="btn small" data-act="plan" data-id="${esc(p.id)}">Contract</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted small">No partners yet.</p>`}
      ${sect("A new partner")}<div class="card"><form id="newp"><div class="two"><label style="margin-top:0">Name<input name="name" required maxlength="80"></label>
        <label style="margin-top:0">Kind<select name="kind"><option value="course">Golf course</option><option value="company">Company</option></select></label></div>
        <div class="two"><label>Contract${tierSel("tier", "crest")}</label><label>Owner's email <span class="muted">(signed in once)</span><input name="owner" type="email" required></label></div>
        <div class="two"><label>Until<input name="expires" type="date"></label><label>What was agreed<input name="plan" maxlength="200" placeholder="EUR 990 a year, invoiced"></label></div>
        <button class="btn primary" type="submit" style="margin-top:10px">Start the partner</button></form></div>`;
    pane.querySelector("#newp").addEventListener("submit", async ev => {
      ev.preventDefault();
      const fd = Object.fromEntries(new FormData(ev.target));
      try { const r = await A.api("/club", { ...fd, expires: fd.expires || null }); toast(`${r.name} started`); go(`#partner/${r.id}`); } catch (e) { toast(e.message, 6000); }
    });
    pane.onclick = async ev => {
      const b = ev.target.closest("[data-act=plan]");
      if (!b) return;
      const p = list.find(x => x.id === b.dataset.id);
      let el = null;
      const v = await sheet({ title: p.name, lead: "The contract: what it includes, how many seats, until when.",
        body: `<form id="planf"><label>Contract${tierSel("tier", p.tier)}</label><div class="two"><label>Seats <span class="muted">(empty: the contract's)</span><input name="seats" inputmode="numeric" placeholder="${p.seats}"></label>
          <label>Until<input name="expires" type="date" value="${esc(p.expires || "")}"></label></div><label>What was agreed<input name="plan" value="${esc(p.plan || "")}"></label>
          <label class="switch"><span>Active</span><input type="checkbox" name="active" ${p.active ? "checked" : ""}></label></form>`,
        actions: [{ label: "Save", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }], onOpen: s => { el = s; } });
      if (v !== "ok" || !el) return;
      const f = el.querySelector("#planf");
      try {
        await A.api(`/club/${p.id}/plan`, { tier: f.tier.value, ...(f.seats.value ? { seats: Number(f.seats.value) } : {}), expires: f.expires.value || null, plan: f.plan.value, active: f.active.checked });
        toast("Saved"); admin("partners");
      } catch (e) { toast(e.message, 5000); }
    };
  },

  async enquiries(pane) {
    const { enquiries } = await A.api("/admin/enquiries");
    pane.innerHTML = enquiries.length ? enquiries.map(e => `<div class="card ${e.handled ? "muted" : ""}"><div class="row"><div><div class="name">${esc(e.org)} <span class="muted small">· ${e.kind === "course" ? "golf course" : "company"}${e.tier ? ` · ${esc(e.tier)}` : ""}${e.size ? ` · ${esc(e.size)}` : ""}</span></div>
        <div class="muted small">${esc(e.name)} · <a href="mailto:${esc(e.email)}">${esc(e.email)}</a>${e.phone ? ` · ${esc(e.phone)}` : ""} · ${esc(fmtDate(e.created.slice(0, 10)))}</div></div>
        <label class="switch"><span>Handled</span><input type="checkbox" data-id="${esc(e.id)}" ${e.handled ? "checked" : ""}></label></div>${e.message ? `<p class="small" style="white-space:pre-wrap">${esc(e.message)}</p>` : ""}</div>`).join("")
      : `<p class="muted center" style="margin:30px 0">Nothing from the site yet.</p>`;
    pane.querySelectorAll("input[data-id]").forEach(i => i.addEventListener("change", async () => {
      try { await A.api(`/admin/enquiries/${i.dataset.id}`, { handled: i.checked }); } catch (e) { toast(e.message, 5000); i.checked = !i.checked; }
    }));
  },
};
