// Hagolf screens and navigation. Hash routes: #home #new #players/<rid> #score/<rid>/<hole> #review/<rid>
// #attach/<rid> #graphics/<rid> #roster #leagues #league/<gid> #leagueposter/<gid> #settings
import { DATA } from "./data.js";
import * as S from "./store.js";
import * as Y from "./sync.js";
import { compute, standings, headToHead, handicapFor, outcome, stableford, fmtToPar, fmtHcp, fmtIndex, fix } from "./model.js";
import { loadFonts, makeTheme } from "./draw.js";
import { grossLeaderboard, stablefordLeaderboard, holesPoster, standingsPoster } from "./posters.js";
import { renderCards } from "./cards.js";

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const courseBy = slug => DATA.courses.find(c => c.slug === slug);
const courseTitle = c => c.loop ? `${c.name} · ${c.loop}` : c.name;
const sum = xs => xs.reduce((a, b) => a + b, 0);
const go = hash => { location.hash = hash; };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
let toastTimer = null;
const ui = { expanded: null, selHole: null, blobs: [], h2h: {} };

function toast(msg, ms = 2600) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg.charAt(0).toUpperCase() + msg.slice(1);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/** Handicap index as typed: "19,9", "+2.1" (plus handicap), "18". */
export function parseHI(s) {
  s = String(s || "").trim().replace(",", ".");
  if (!s) return NaN;
  const plus = s.startsWith("+");
  const v = Number(s.replace(/^\+/, ""));
  return plus ? -v : v;
}

function page(title, body, { back = "#home", bar = "", sub = "" } = {}) {
  app.innerHTML = `
    <header class="top">${back ? `<a class="back" href="${back}" aria-label="Back">‹</a>` : "<span class='back'></span>"}
      <div class="ttl"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>${syncDot()}</header>
    <main class="${bar ? "with-bar" : ""}">${body}</main>
    ${bar ? `<footer class="bar">${bar}</footer>` : ""}`;
  window.scrollTo(0, 0);
}

/** Click handler for this screen only: main and the bar are rebuilt by page(), so nothing stacks up. */
function bind(fn) {
  app.querySelectorAll("main, footer.bar").forEach(el => el.addEventListener("click", fn));
}

function syncDot() {
  const s = Y.sync.status;
  const title = { off: "Not connected to the shared database", idle: "Synced", syncing: "Syncing", error: "Sync problem: " + (Y.sync.error || "") }[s];
  return `<a class="dot ${s}" href="#settings" title="${esc(title)}" aria-label="${esc(title)}"></a>`;
}

function syncLine() {
  const s = Y.sync;
  if (s.status === "off") return `<a class="banner muted" href="#settings">This phone is not connected to the shared database yet. Set it up in Settings so every phone sees the same rounds and leagues.</a>`;
  if (s.status === "error") return `<a class="banner warn" href="#settings">Sync problem: ${esc(s.error || "")}. Changes are kept on this phone and sent when it works again.</a>`;
  return "";
}

function roundStatus(r) {
  const c = courseBy(r.course);
  const n = c ? c.n : 0;
  if (r.status === "setup") return `${plural(r.entries.length, "player")} · not started`;
  if (r.status === "scoring") return `scoring · hole ${Math.min(r.hole + 1, n)} of ${n}`;
  return `done · ${plural(r.entries.length, "player")}`;
}

function resumeHash(r) {
  if (r.status === "setup") return `#players/${r.id}`;
  if (r.status === "scoring") return `#score/${r.id}/${r.hole}`;
  return `#graphics/${r.id}`;
}

// ---------------------------------------------------------------- home
function home() {
  const rounds = S.rounds();
  const banners = [syncLine()];
  if (window.__updateReady) banners.push(`<div class="banner" data-act="update">A new version is ready. Tap to reload.</div>`);
  if (window.__installPrompt) banners.push(`<div class="banner" data-act="install">Install Hagolf on this phone</div>`);
  else if (isIOS() && !isStandalone()) banners.push(`<div class="banner muted">To install: tap Share <span class="ios-share">⎋</span> in Safari, then “Add to Home Screen”.</div>`);
  if (!Y.enabled() && S.needsBackup()) banners.push(`<a class="banner muted" href="#settings">Rounds since the last backup. Export a backup when you have a moment.</a>`);
  const list = rounds.length ? rounds.map(r => `
    <a class="card row" href="${resumeHash(r)}">
      <div><div class="name">${esc(r.name)}</div><div class="muted">${esc(r.date || "")} · ${esc(courseTitle(courseBy(r.course) || { name: r.course }))}${S.leaguesOfRound(r.id).length ? ` · ${S.leaguesOfRound(r.id).map(g => esc(g.name)).join(", ")}` : ""}</div></div>
      <div class="status ${r.status}">${roundStatus(r)}</div></a>`).join("")
    : `<p class="muted center">No rounds yet. Start with a new round.</p>`;
  page("Hagolf", `
    ${banners.join("")}
    <a class="btn primary big" href="#new">+ New round</a>
    <h2>Rounds</h2>${list}
    <nav class="grid3">
      <a class="tile" href="#leagues">Leagues<small>${S.leagues().length}</small></a>
      <a class="tile" href="#roster">Players<small>${S.players().length}</small></a>
      <a class="tile" href="#settings">Settings<small>${Y.enabled() ? "synced" : "backup"}</small></a></nav>
    <p class="muted center small">${DATA.courses.length} courses · ${DATA.themes.length} themes · version ${DATA.version}</p>`, { back: "" });
}

// ---------------------------------------------------------------- new round
function newRound() {
  const groups = new Map();
  for (const c of DATA.courses) { if (!groups.has(c.name)) groups.set(c.name, []); groups.get(c.name).push(c); }
  const body = `
    <input id="q" class="search" placeholder="Search course or loop" autocomplete="off">
    <div id="courses">${[...groups].map(([name, cs]) => `
      <h2>${esc(name)}</h2>${cs.map(c => `
        <button class="card row course" data-act="pick-course" data-slug="${esc(c.slug)}" data-q="${esc((c.name + " " + c.loop).toLowerCase())}">
          <div><div class="name">${esc(c.loop || c.name)}</div><div class="muted">${c.n} holes · par ${c.course_par} · tees: ${Object.keys(c.tees).join(", ")}</div></div><span class="chev">›</span></button>`).join("")}`).join("")}</div>`;
  page("Pick a course", body);
  const q = document.getElementById("q");
  q.addEventListener("input", () => {
    const s = q.value.toLowerCase().trim();
    document.querySelectorAll("#courses .course").forEach(b => { b.style.display = !s || b.dataset.q.includes(s) ? "" : "none"; });
    document.querySelectorAll("#courses h2").forEach(h => {
      let el = h.nextElementSibling, any = false;
      while (el && el.tagName !== "H2") { if (el.style.display !== "none") any = true; el = el.nextElementSibling; }
      h.style.display = any ? "" : "none";
    });
  });
}

function roundForm(slug) {
  const c = courseBy(slug);
  const tees = Object.keys(c.tees);
  const dflt = tees.includes("yellow") ? "yellow" : tees[0];
  const date = S.today();
  page("New round", `
    <div class="card"><div class="name">${esc(courseTitle(c))}</div><div class="muted">${c.n} holes · par ${c.course_par}</div></div>
    <label>Name of the round<input id="rname" value="${esc((c.loop || c.name) + " " + date)}"></label>
    <label>Date<input id="rdate" type="date" value="${date}"></label>
    <label>Default tee (each player can pick their own)<select id="rtee">${tees.map(t => `<option ${t === dflt ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
    <label>Handicap allowance<select id="rallow"><option value="100">100% (society default)</option><option value="95">95% (WHS individual Stableford)</option><option value="90">90%</option></select></label>`,
  { back: "#new", bar: `<button class="btn primary" data-act="create-round" data-slug="${esc(slug)}">Next: players ›</button>` });
}

// ---------------------------------------------------------------- players in a round
function players(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  const tees = Object.keys(c.tees);
  const names = S.players().map(p => p.name).sort((a, b) => a.localeCompare(b));
  const rows = r.entries.map((e, i) => {
    let hc = "";
    try { const h = handicapFor(c, e, r.defaultTee, r.allowance); hc = `course hcp ${fmtHcp(h.ch)}`; } catch (err) { hc = `<span class="warn">${esc(err.message)}</span>`; }
    return `<div class="card row"><div><div class="name">${esc(e.name)}</div><div class="muted">index ${fmtIndex(Number(e.hi))} · ${esc(e.tee)} tees · ${e.gender === "f" ? "women's" : "men's"} rating · ${hc}</div></div>
      <button class="x" data-act="remove-entry" data-i="${i}" aria-label="Remove">×</button></div>`;
  }).join("");
  const body = `
    <div class="muted small">${esc(r.name)} · ${esc(courseTitle(c))}</div>
    ${rows || `<p class="muted center">Nobody yet. Add the first player.</p>`}
    <form id="addf" class="card form ${r.entries.length ? "" : "open"}">
      <label>Name<input id="pname" list="roster" autocomplete="off" autocapitalize="words" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
      <datalist id="roster">${names.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="two">
        <label>Handicap index<input id="phi" inputmode="decimal" placeholder="18,4 or +2.1" required></label>
        <label>Tee<select id="ptee">${tees.map(t => `<option ${t === r.defaultTee ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <div class="two">
        <label>Rating<select id="pgender"><option value="m">Men's</option><option value="f">Women's</option></select></label>
        <label>Course hcp override <span class="muted">(optional)</span><input id="pch" inputmode="numeric" placeholder="from club table"></label></div>
      <button class="btn primary" type="submit">Add player</button>
    </form>
    <button class="btn addbtn ${r.entries.length ? "" : "hidden"}" data-act="toggle-add"><span class="plus">+</span> Add player</button>`;
  const bar = r.entries.length
    ? `<button class="btn primary" data-act="start-scoring" data-rid="${rid}">${r.status === "setup" ? "Start scoring ›" : "Back to scoring ›"}</button>`
    : `<button class="btn" disabled>Add players to start</button>`;
  page("Who is playing", body, { back: "#home", bar });
  const f = document.getElementById("addf");
  const nameEl = document.getElementById("pname");
  nameEl.addEventListener("change", () => {
    const p = S.findPlayer(nameEl.value);
    if (p) {
      document.getElementById("phi").value = fmtIndex(p.hi);
      document.getElementById("pgender").value = p.gender || "m";
      const k = S.roundsOf(p.id).length;
      toast(`${p.name} is already known: index ${fmtIndex(p.hi)}, ${plural(k, "round")}. Change the name slightly if this is someone else.`, 4500);
    }
  });
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    const name = nameEl.value.trim();
    const hi = parseHI(document.getElementById("phi").value);
    const tee = document.getElementById("ptee").value;
    const gender = document.getElementById("pgender").value;
    const chRaw = document.getElementById("pch").value.trim();
    const courseHandicap = chRaw === "" ? null : Number(chRaw);
    if (!name) return toast("Give the player a name");
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54, e.g. 18,4");
    if (chRaw !== "" && !Number.isInteger(courseHandicap)) return toast("Course handicap must be a whole number");
    if (r.entries.some(e => S.nameKey(e.name) === S.nameKey(name))) return toast(`${name} is already in this round`);
    try { handicapFor(c, { hi, tee, gender, courseHandicap }, r.defaultTee, r.allowance); } catch (err) { return toast(err.message, 4000); }
    S.addEntry(r, c.n, { name, hi, tee, gender, courseHandicap });
    players(rid);
    document.getElementById("addf").classList.add("open");
    document.querySelector(".addbtn").classList.add("hidden");
    document.getElementById("pname").focus();
  });
  if (f.classList.contains("open")) nameEl.focus();
}

// ---------------------------------------------------------------- scoring
function score(rid, hArg) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  const n = c.n;
  const h = Math.max(0, Math.min(n - 1, Number(hArg) || 0));
  if (r.status === "setup" || r.hole !== h) { if (r.status === "setup") r.status = "scoring"; r.hole = h; S.saveRound(r); }
  const pars = c.par, si = c.stroke_index;
  const metres = c.tees[r.defaultTee] && c.tees[r.defaultTee].metres;
  const strip = c.par.map((_, i) => {
    const done = r.entries.length && r.entries.every(e => e.scores[i] !== null);
    const some = r.entries.some(e => e.scores[i] !== null);
    return `<a class="hchip ${i === h ? "cur" : ""} ${done ? "done" : some ? "some" : ""}" href="#score/${rid}/${i}">${c.first_hole + i}</a>`;
  }).join("");
  const rows = r.entries.map((e, i) => {
    let info;
    try { info = handicapFor(c, e, r.defaultTee, r.allowance); } catch (err) { info = null; }
    const par = info ? info.par[h] : pars[h];
    const v = e.scores[h];
    const st = info ? info.strokes[h] : 0;
    let detail = st ? plural(st, "stroke") : "no strokes";
    if (v !== null && v !== 0 && info) detail += ` · net ${v - st} · ${plural(stableford(v, par, st), "pt")}`;
    const entered = e.scores.filter(x => x !== null).length;
    const total = entered ? ` · ${sum(e.scores.filter(x => x))} after ${entered}` : "";
    const cls = v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
    return `<div class="prow">
      <div class="pinfo"><div class="name">${esc(e.name)}</div><div class="muted small">${detail}${total}</div></div>
      <button class="sbtn" data-act="dec" data-i="${i}" aria-label="minus">−</button>
      <button class="sval ${cls}" data-act="pickup" data-i="${i}" title="Tap to mark picked up">${v === null ? "–" : v === 0 ? "NR" : v}</button>
      <button class="sbtn" data-act="inc" data-i="${i}" aria-label="plus">+</button></div>`;
  }).join("");
  const body = `
    <div class="strip">${strip}</div>
    <div class="holehead"><div class="hnum">${c.first_hole + h}</div>
      <div><div class="name">Par ${pars[h]} · SI ${si[h]}${metres ? ` · ${metres[h]} m` : ""}</div>
      <div class="muted small">${esc(r.name)} · first tap on − or + enters par · tap the score to mark a pick-up</div></div></div>
    ${rows || `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}
    <p class="center"><a class="muted small" href="#players/${rid}">Add or remove players</a></p>`;
  const bar = h === 0 ? `<a class="btn" href="#players/${rid}">‹ Players</a>` : `<a class="btn" href="#score/${rid}/${h - 1}">‹ Hole ${c.first_hole + h - 1}</a>`;
  const barNext = h < n - 1 ? `<a class="btn primary" href="#score/${rid}/${h + 1}">Hole ${c.first_hole + h + 1} ›</a>` : `<a class="btn primary" href="#review/${rid}">Review ›</a>`;
  page(`Hole ${c.first_hole + h} of ${n}`, body, { back: "#home", bar: bar + barNext });
  const stripEl = document.querySelector(".strip"), cur = document.querySelector(".hchip.cur");
  if (stripEl && cur) stripEl.scrollLeft = cur.offsetLeft - stripEl.clientWidth / 2 + cur.clientWidth / 2;
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const e = r.entries[Number(b.dataset.i)];
    const par = pars[h];
    const v = e.scores[h];
    if (b.dataset.act === "inc") e.scores[h] = (v === null || v === 0) ? par : Math.min(30, v + 1);
    else if (b.dataset.act === "dec") e.scores[h] = (v === null || v === 0) ? par : Math.max(1, v - 1);
    else if (b.dataset.act === "pickup") {
      if (v === 0) e.scores[h] = null;
      else if (v === null) e.scores[h] = par;
      else if (confirm(`${e.name} picked up on hole ${c.first_hole + h}? No return for the round, no points for this hole.`)) e.scores[h] = 0;
    }
    S.saveRound(r);
    score(rid, h);
  });
}

// ---------------------------------------------------------------- review
function review(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  const n = c.n;
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) {
    return page("Review", `<div class="banner warn">${esc(err.message)}</div><a class="btn" href="#players/${rid}">Fix the players</a>`, { back: `#score/${rid}/${r.hole}` });
  }
  const done = M.stbl_board.map(p => [p, r.entries.find(e => e.name === p.name)]);
  const unfinished = r.entries.filter(e => M.unfinished.includes(e.name));
  const chips = (e) => c.par.map((par, i) => {
    const v = e.scores[i];
    const cls = v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
    const sel = ui.expanded === e.name && ui.selHole === i ? "sel" : "";
    return `<button class="chip ${cls} ${sel}" data-act="sel-hole" data-name="${esc(e.name)}" data-h="${i}"><small>${c.first_hole + i}</small>${v === null ? "–" : v === 0 ? "NR" : v}</button>`;
  }).join("");
  const editor = (e) => {
    if (ui.expanded !== e.name || ui.selHole === null) return "";
    const i = ui.selHole, v = e.scores[i], par = c.par[i];
    return `<div class="editor"><div>Hole ${c.first_hole + i} · par ${par} · SI ${c.stroke_index[i]}</div>
      <div class="edrow"><button class="sbtn" data-act="ed" data-d="-1" data-name="${esc(e.name)}">−</button>
      <span class="sval big">${v === null ? "–" : v === 0 ? "NR" : v}</span>
      <button class="sbtn" data-act="ed" data-d="1" data-name="${esc(e.name)}">+</button>
      <button class="btn small" data-act="ed-pick" data-name="${esc(e.name)}">${v === 0 ? "Un-pick" : "Picked up"}</button></div></div>`;
  };
  const penalties = (e) => `<div class="pens">${(e.penalties || []).map((p, k) => `<span class="pen">+${p.strokes} on hole ${p.hole}${p.reason ? ` (${esc(p.reason)})` : ""} <button data-act="del-pen" data-name="${esc(e.name)}" data-k="${k}" aria-label="remove">×</button></span>`).join("")}
    <details><summary class="muted small">Add penalty strokes</summary>
      <div class="two"><label>Hole<select class="pen-hole">${c.par.map((_, i) => `<option value="${i + 1}">${c.first_hole + i}</option>`).join("")}</select></label>
      <label>Strokes<input class="pen-strokes" inputmode="numeric" value="2"></label></div>
      <label>Reason<input class="pen-reason" placeholder="e.g. Late on the first tee"></label>
      <button class="btn small" data-act="add-pen" data-name="${esc(e.name)}">Add penalty</button></details></div>`;
  const rows = done.map(([p, e]) => `
    <div class="card pl ${ui.expanded === e.name ? "open" : ""}">
      <button class="row plain" data-act="expand" data-name="${esc(e.name)}">
        <div><div class="name">${p.splace}. ${esc(p.name)}${p.penalty_total ? ` <span class="pen">pen +${p.penalty_total}</span>` : ""}</div>
          <div class="muted small">hcp ${fmtHcp(p.ph)} · ${esc(p.tee)}${p.nr ? " · no return" : ""}</div></div>
        <div class="nums"><span><b>${p.gross === null ? "NR" : p.gross}</b><small>gross${p.topar !== null ? " " + fmtToPar(p.topar) : ""}</small></span>
          <span><b>${p.net === null ? "NR" : p.net}</b><small>net</small></span><span class="acc"><b>${p.pts}</b><small>pts</small></span></div></button>
      ${ui.expanded === e.name ? `<div class="chips">${chips(e)}</div>${editor(e)}${penalties(e)}` : ""}</div>`).join("");
  const missing = unfinished.map(e => {
    const holes = e.scores.map((v, i) => v === null ? c.first_hole + i : null).filter(x => x !== null);
    return `<div class="card row warnrow"><div><div class="name">${esc(e.name)}</div><div class="muted small">missing hole${holes.length === 1 ? "" : "s"} ${holes.join(", ")}</div></div>
      <a class="btn small" href="#score/${rid}/${holes[0] - c.first_hole}">Enter</a></div>`;
  }).join("");
  const body = `<div class="muted small">${esc(r.name)} · ${esc(courseTitle(c))} · tap a player, then a hole, to change a score</div>
    ${missing ? `<h2>Not finished</h2>${missing}` : ""}
    ${rows ? `<h2>Stableford order</h2>${rows}` : `<p class="muted center">No complete scorecards yet.</p>`}`;
  const bar = `<a class="btn" href="#score/${rid}/${n - 1}">‹ Scoring</a>
    <button class="btn primary" data-act="save-round" ${M.field ? "" : "disabled"}>All correct, save ›</button>`;
  page("Check the scores", body, { back: `#score/${rid}/${r.hole}`, bar });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const e = r.entries.find(x => x.name === b.dataset.name);
    if (act === "expand") { ui.expanded = ui.expanded === e.name ? null : e.name; ui.selHole = null; return review(rid); }
    if (act === "sel-hole") { ui.expanded = e.name; ui.selHole = Number(b.dataset.h); return review(rid); }
    if (act === "ed") {
      const i = ui.selHole, v = e.scores[i], par = c.par[i], d = Number(b.dataset.d);
      e.scores[i] = (v === null || v === 0) ? par : Math.max(1, Math.min(30, v + d));
      S.saveRound(r); return review(rid);
    }
    if (act === "ed-pick") { const i = ui.selHole; e.scores[i] = e.scores[i] === 0 ? c.par[i] : 0; S.saveRound(r); return review(rid); }
    if (act === "del-pen") { e.penalties.splice(Number(b.dataset.k), 1); S.saveRound(r); return review(rid); }
    if (act === "add-pen") {
      const box = b.closest(".pens");
      const hole = Number(box.querySelector(".pen-hole").value), strokes = Number(box.querySelector(".pen-strokes").value);
      if (!(strokes >= 1)) return toast("Penalty strokes must be 1 or more");
      e.penalties = e.penalties || [];
      e.penalties.push({ hole, strokes, reason: box.querySelector(".pen-reason").value.trim() });
      S.saveRound(r); return review(rid);
    }
    if (act === "save-round") {
      if (unfinished.length && !confirm(`${plural(unfinished.length, "player")} ${unfinished.length === 1 ? "has" : "have"} holes missing and will be left off the graphics. Save anyway?`)) return;
      r.status = "done"; S.saveRound(r); go(`#attach/${rid}`);
    }
  });
}

// ---------------------------------------------------------------- attach a round to leagues
function attach(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const mine = new Set(S.leaguesOfRound(rid).map(g => g.id));
  const list = S.leagues().map(g => `<label><input type="checkbox" data-act="toggle-league" data-gid="${g.id}" ${mine.has(g.id) ? "checked" : ""}> ${esc(g.name)}<span class="muted"> · ${plural(S.leagueRoundIds(g.id).length, "round")}</span></label>`).join("");
  page("Add to leagues", `
    <p class="muted small">${esc(r.name)} is saved. Tick the leagues this round counts for; the running totals and head-to-heads update on every phone.</p>
    <div class="card checks">${list || `<p class="muted">No leagues yet. Make one below.</p>`}</div>
    <form id="newg" class="card form open"><h2>New league</h2><label>Name<input name="name" placeholder="e.g. Apeliotes 2026" required></label>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="0"></label>
      <button class="btn" type="submit">Create and add this round</button></form>`,
  { back: `#review/${rid}`, bar: `<a class="btn primary" href="#graphics/${rid}">Continue to graphics ›</a>` });
  bind(ev => {
    const b = ev.target.closest("[data-act=toggle-league]");
    if (b) S.setLeagueRound(b.dataset.gid, rid, b.checked);
  });
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = S.createLeague(ev.target.name.value.trim() || "League", ev.target.bestN.value);
    S.setLeagueRound(g.id, rid, true);
    attach(rid);
  });
}

// ---------------------------------------------------------------- graphics
function themeChips(selected) {
  return DATA.themes.map(t => `<label class="tchip ${selected.includes(t.name) ? "on" : ""}" style="--tbg:${t.BG};--tacc:${t.ACCENT}">
    <input type="checkbox" name="theme" value="${t.name}" ${selected.includes(t.name) ? "checked" : ""}><span class="sw"></span>${t.name}</label>`).join("");
}

function graphics(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) { return page("Graphics", `<div class="banner warn">${esc(err.message)}</div>`, { back: `#review/${rid}` }); }
  const themes = S.state.settings.themes || ["navy"];
  const leagues = S.leaguesOfRound(rid);
  const body = `
    <div class="muted small">${esc(r.name)} · ${plural(M.field, "player")} on the boards${M.unfinished.length ? ` · ${M.unfinished.length} unfinished left out` : ""} · <a href="#review/${rid}">edit scores</a> · <a href="#attach/${rid}">${leagues.length ? "leagues: " + leagues.map(g => esc(g.name)).join(", ") : "add to a league"}</a></div>
    <h2>Which graphics</h2>
    <div class="card checks">
      <label><input type="checkbox" name="g" value="gross" checked> Gross leaderboard</label>
      <label><input type="checkbox" name="g" value="stbl" checked> Stableford leaderboard</label>
      <label><input type="checkbox" name="g" value="holes" checked> How the holes played</label>
      <label><input type="checkbox" name="g" value="cards" checked> Player cards <span class="muted">&nbsp;(${M.field})</span></label>
      <details><summary class="muted small">Only some players' cards</summary>${M.players.map(p => `<label><input type="checkbox" name="card" value="${esc(p.name)}" checked> ${esc(p.name)}</label>`).join("")}</details>
    </div>
    <h2>Theme</h2>
    <div class="themes">${themeChips(themes)}</div>
    <div id="out"></div>`;
  const bar = `<button class="btn primary" data-act="generate">Generate images</button>`;
  page("Graphics", body, { back: `#attach/${rid}`, bar });
  document.querySelector(".bar [data-act=generate]").addEventListener("click", async () => {
    const want = [...document.querySelectorAll("input[name=g]:checked")].map(i => i.value);
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value);
    const cardNames = [...document.querySelectorAll("input[name=card]:checked")].map(i => i.value);
    if (!want.length) return toast("Tick at least one graphic");
    if (!chosen.length) return toast("Pick at least one theme");
    S.state.settings.themes = chosen; S.save();
    const jobs = [];
    for (const tn of chosen) {
      const T = makeTheme(DATA.themes.find(t => t.name === tn));
      const prefix = chosen.length > 1 ? `${tn}/` : "";
      if (want.includes("gross")) jobs.push({ label: `${prefix}1_leaderboard_gross.png`, make: () => grossLeaderboard(M, T) });
      if (want.includes("stbl")) jobs.push({ label: `${prefix}2_leaderboard_stableford.png`, make: () => stablefordLeaderboard(M, T) });
      if (want.includes("holes")) jobs.push({ label: `${prefix}3_holes.png`, make: () => holesPoster(M, T) });
      if (want.includes("cards")) for (const p of M.players.filter(p => cardNames.includes(p.name))) jobs.push({ label: `${prefix}${renderCards(M, T, [p.name])[0].file}`, make: () => renderCards(M, T, [p.name])[0].fig });
    }
    await runJobs(jobs, slugFile(r.name));
  });
}

function slugFile(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "round";
}

/** Renders jobs one by one with a progress line, then shows thumbnails with save buttons. */
async function runJobs(jobs, prefix) {
  const out = document.getElementById("out");
  out.innerHTML = `<div class="progress">Loading fonts…</div>`;
  ui.blobs.forEach(b => b.thumbUrl && URL.revokeObjectURL(b.thumbUrl));
  ui.blobs = [];
  await loadFonts(DATA.fonts);
  const results = [];
  for (let i = 0; i < jobs.length; i++) {
    out.querySelector(".progress").textContent = `Rendering ${i + 1} of ${jobs.length}: ${jobs[i].label}`;
    await new Promise(res => setTimeout(res, 0));
    try {
      const fig = jobs[i].make();
      const blob = await fig.toBlob();
      const thumb = await thumbnail(fig);
      results.push({ label: jobs[i].label, blob, thumbUrl: URL.createObjectURL(thumb), w: fig.canvas.width, h: fig.canvas.height });
    } catch (err) {
      console.error(err);
      results.push({ label: jobs[i].label, error: err.message });
    }
  }
  ui.blobs = results;
  const ok = results.filter(x => x.blob);
  out.innerHTML = `
    <h2>${plural(ok.length, "image")} ready</h2>
    <div class="saveall"><button class="btn primary" data-act="save-all">${canShareFiles() ? "Save all to phone (share sheet)" : "Download all"}</button>
      <div class="muted small">${canShareFiles() ? "Choose “Save Image” or “Save to Files” in the sheet. " : ""}Or save one at a time below; you can also long-press an image.</div></div>
    <div class="thumbs">${results.map((x, i) => x.blob ? `
      <figure><img src="${x.thumbUrl}" alt="${esc(x.label)}" data-act="open" data-i="${i}"><figcaption>${esc(x.label)} <span class="muted">${x.w}×${x.h}</span>
        <button class="btn small" data-act="save-one" data-i="${i}">Save</button></figcaption></figure>`
      : `<figure class="err"><figcaption>${esc(x.label)}: ${esc(x.error)}</figcaption></figure>`).join("")}</div>`;
  out.onclick = async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "save-all") await saveFiles(ok.map(x => toFile(x, prefix)), prefix);
    if (b.dataset.act === "save-one") await saveFiles([toFile(results[Number(b.dataset.i)], prefix)], prefix);
    if (b.dataset.act === "open") { const x = results[Number(b.dataset.i)]; window.open(URL.createObjectURL(x.blob), "_blank"); }
  };
  out.scrollIntoView({ behavior: "smooth" });
}

async function thumbnail(fig) {
  const w = 720, h = Math.round(fig.canvas.height * w / fig.canvas.width);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(fig.canvas, 0, 0, w, h);
  return cv.convertToBlob ? cv.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : new Promise(res => cv.toBlob(res, "image/jpeg", 0.85));
}

function toFile(x, prefix) {
  return new File([x.blob], `${prefix}_${x.label.replace(/\//g, "_")}`, { type: "image/png" });
}

function canShareFiles() {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch (e) { return false; }
}

async function saveFiles(files, title) {
  if (canShareFiles() && navigator.canShare({ files })) {
    try { await navigator.share({ files, title }); return; } catch (err) { if (err.name === "AbortError") return; console.warn(err); }
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise(res => setTimeout(res, 400));
  }
  toast(files.length === 1 ? "Saved to your downloads" : `${files.length} files sent to your downloads`);
}

// ---------------------------------------------------------------- roster
function roster() {
  const ps = S.players().sort((a, b) => a.name.localeCompare(b.name));
  const rows = ps.map(p => {
    const k = S.roundsOf(p.id).length;
    return `<details class="card pl"><summary class="row plain"><div><div class="name">${esc(p.name)}</div><div class="muted small">index ${fmtIndex(Number(p.hi))} · ${p.gender === "f" ? "women's rating" : "men's rating"} · ${plural(k, "round")}</div></div><span class="chev">›</span></summary>
      <form class="form open" data-id="${p.id}">
        <label>Name<input name="name" value="${esc(p.name)}" autocapitalize="words" required></label>
        <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" value="${fmtIndex(Number(p.hi))}"></label>
        <label>Rating<select name="gender"><option value="m" ${p.gender !== "f" ? "selected" : ""}>Men's</option><option value="f" ${p.gender === "f" ? "selected" : ""}>Women's</option></select></label></div>
        <div class="two"><button class="btn primary" type="submit">Save</button>${k ? "" : `<button class="btn danger" type="button" data-act="del-player" data-id="${p.id}">Delete</button>`}</div></form></details>`;
  }).join("");
  page("Players", `<p class="muted small">Everyone who has played, on every phone. The handicap index here is the one they last played with; it is prefilled when you add them to a round.</p>
    ${rows || `<p class="muted center">No players yet.</p>`}
    <form id="newp" class="card form open"><h2>Add a player</h2><label>Name<input name="name" autocapitalize="words" required></label>
      <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" placeholder="18,4" required></label>
      <label>Rating<select name="gender"><option value="m">Men's</option><option value="f">Women's</option></select></label></div>
      <button class="btn primary" type="submit">Add</button></form>`);
  app.querySelectorAll("form.form[data-id]").forEach(f => f.addEventListener("submit", ev => {
    ev.preventDefault();
    const p = S.state.players.find(x => x.id === f.dataset.id);
    const hi = parseHI(f.hi.value);
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54");
    const other = S.findPlayer(f.name.value);
    if (other && other.id !== p.id) return toast("Another player already has that name");
    if (hi !== p.hi) p.hiUpdated = new Date().toISOString();
    p.name = f.name.value.trim(); p.hi = hi; p.gender = f.gender.value;
    S.touch("players", p); S.save(); toast("Saved"); roster();
  }));
  document.getElementById("newp").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, hi = parseHI(f.hi.value);
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54");
    if (S.findPlayer(f.name.value)) return toast("That player already exists");
    S.upsertPlayer(f.name.value, hi, f.gender.value); roster();
  });
}

// ---------------------------------------------------------------- leagues
function leagues() {
  const rows = S.leagues().map(g => `<a class="card row" href="#league/${g.id}"><div><div class="name">${esc(g.name)}</div><div class="muted small">${plural(S.leagueRoundIds(g.id).length, "round")}${g.bestN ? ` · best ${g.bestN} count` : ""}</div></div><span class="chev">›</span></a>`).join("");
  page("Leagues", `<p class="muted small">A league is a running Stableford table over the rounds added to it, with head-to-heads between any two players. Anyone can make one; every phone sees it.</p>
    ${rows || `<p class="muted center">No leagues yet.</p>`}
    <form id="newg" class="card form open"><h2>New league</h2><label>Name<input name="name" placeholder="e.g. Apeliotes 2026" required></label>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="0"></label>
      <button class="btn primary" type="submit">Create</button></form>`);
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = S.createLeague(ev.target.name.value.trim() || "League", ev.target.bestN.value);
    go(`#league/${g.id}`);
  });
}

/** Computed rounds attached to a league (finished ones), the players in them, and the standings. */
function leagueResults(g) {
  const ids = new Set(S.leagueRoundIds(g.id));
  const Ms = [];
  for (const r of S.rounds().filter(r => ids.has(r.id) && r.status === "done")) {
    const c = courseBy(r.course);
    if (!c) continue;
    try { Ms.push(Object.assign(compute(c, S.toModelRound(r)), { id: r.id })); } catch (e) { console.warn(r.name, e.message); }
  }
  const members = [...new Set(Ms.flatMap(M => M.players.map(p => p.id)).filter(Boolean))];
  return { Ms, members, S: standings(Ms, members, g.bestN) };
}

function league(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const { Ms, members, S: Sx } = leagueResults(g);
  const attached = new Set(S.leagueRoundIds(gid));
  const nameOf = id => { for (const M of Ms) { const p = M.players.find(x => x.id === id); if (p) return p.name; } return id; };
  const table = Sx.rows.length ? `<table class="stand"><thead><tr><th>Pos</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Total"}</th></tr></thead>
    <tbody>${Sx.rows.map(r => `<tr><td>${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted center">No finished rounds in this league yet. Add some below.</p>`;
  const h = ui.h2h[gid] || {};
  const a = members.includes(h.a) ? h.a : members[0], b = members.includes(h.b) ? h.b : members.find(m => m !== a);
  let h2h = "";
  if (a && b) {
    const H = headToHead(Ms, a, b);
    const sel = (name, val) => `<select data-h2h="${name}">${members.map(m => `<option value="${m}" ${m === val ? "selected" : ""}>${esc(nameOf(m))}</option>`).join("")}</select>`;
    h2h = `<div class="two">${sel("a", a)}${sel("b", b)}</div>
      <div class="h2h"><div><b>${H.winsA}</b><small>${esc(nameOf(a))}</small></div><div class="mid"><b>${H.ties}</b><small>tied</small></div><div><b>${H.winsB}</b><small>${esc(nameOf(b))}</small></div></div>
      <div class="muted small center">${plural(H.rounds.length, "round")} together · points ${H.ptsA} to ${H.ptsB}</div>
      ${H.rounds.map(r => `<div class="row small h2hrow"><span class="muted">${esc(r.date || "")} ${esc(r.name)}</span><span><b class="${r.winner === "a" ? "acc" : ""}">${r.ptsA}</b> – <b class="${r.winner === "b" ? "acc" : ""}">${r.ptsB}</b></span></div>`).join("")}`;
  } else h2h = `<p class="muted small">Head-to-heads appear once two players share a round in this league.</p>`;
  const roundList = S.rounds().filter(r => r.status === "done").map(r => `<label><input type="checkbox" data-act="toggle-round" data-rid="${r.id}" ${attached.has(r.id) ? "checked" : ""}> ${esc(r.name)}<span class="muted"> · ${esc(r.date || "")} · ${plural(r.entries.length, "player")}</span></label>`).join("");
  page(g.name, `
    <h2>Standings</h2>${table}
    <a class="btn primary ${Sx.rows.length ? "" : "disabled"}" href="#leagueposter/${gid}">Standings poster ›</a>
    <h2>Head to head</h2><div class="card">${h2h}</div>
    <h2>Rounds in this league</h2>
    <div class="card checks">${roundList || `<p class="muted">No finished rounds yet.</p>`}</div>
    <form id="gform" class="card form open"><label>League name<input name="name" value="${esc(g.name)}"></label>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="${g.bestN}"></label>
      <div class="two"><button class="btn primary" type="submit">Save</button><button class="btn danger" type="button" data-act="del-league">Delete league</button></div></form>`, { back: "#leagues" });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "toggle-round") { S.setLeagueRound(gid, b.dataset.rid, b.checked); league(gid); }
    if (b.dataset.act === "del-league" && confirm(`Delete the league ${g.name}? Rounds and players stay.`)) { S.deleteLeague(gid); go("#leagues"); }
  });
  app.querySelectorAll("[data-h2h]").forEach(s => s.addEventListener("change", () => {
    ui.h2h[gid] = { a: document.querySelector("[data-h2h=a]").value, b: document.querySelector("[data-h2h=b]").value };
    league(gid);
  }));
  document.getElementById("gform").addEventListener("submit", ev => {
    ev.preventDefault();
    g.name = ev.target.name.value.trim() || g.name; g.bestN = Number(ev.target.bestN.value) || 0;
    S.saveLeague(g); league(gid);
  });
}

function leaguePoster(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const themes = S.state.settings.themes || ["navy"];
  page("Standings poster", `<h2>Theme</h2><div class="themes">${themeChips(themes)}</div><div id="out"></div>`,
    { back: `#league/${gid}`, bar: `<button class="btn primary" data-act="generate">Generate image</button>` });
  document.querySelector(".bar [data-act=generate]").addEventListener("click", async () => {
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value);
    if (!chosen.length) return toast("Pick at least one theme");
    S.state.settings.themes = chosen; S.save();
    const { S: Sx } = leagueResults(g);
    const jobs = chosen.map(tn => ({ label: `${chosen.length > 1 ? tn + "/" : ""}4_season_standings.png`, make: () => standingsPoster(Sx, g, makeTheme(DATA.themes.find(t => t.name === tn))) }));
    await runJobs(jobs, slugFile(g.name));
  });
}

// ---------------------------------------------------------------- settings: sync, backup, danger zone
function settings() {
  const cfg = Y.config() || { url: "", anonKey: "" };
  const done = S.rounds().filter(r => r.status === "done");
  const st = Y.sync;
  const status = st.status === "off" ? "Not connected" : st.status === "error" ? `Problem: ${st.error}` : st.status === "syncing" ? "Syncing…" : `Synced${st.lastPull ? " · last check " + st.lastPull.slice(11, 16) : ""}`;
  page("Settings", `
    <h2>Shared database</h2>
    <div class="card"><div class="name">${esc(status)}</div>
      <p class="muted small">All phones with the same connection share rounds, players and leagues. Changes made offline are sent as soon as there is a signal. ${DATA.sync ? "This build carries the society's connection; only change it to use another database." : "Ask the organiser for the URL and key, or set up your own project as described in the README."}</p>
      <form id="syncf">
        <label>Supabase project URL<input name="url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocorrect="off"></label>
        <label>Anon key<input name="anonKey" value="${esc(cfg.anonKey)}" placeholder="eyJ…" autocapitalize="off" autocorrect="off"></label>
        <div class="two"><button class="btn primary" type="submit">Test and save</button><button class="btn" type="button" data-act="sync-now">Sync now</button></div>
        ${DATA.sync && (cfg.url !== DATA.sync.url) ? `<button class="btn small" type="button" data-act="sync-default">Back to the society's connection</button>` : ""}
      </form></div>
    <h2>Backup</h2>
    <div class="card"><div class="muted small">${S.players().length} players · ${S.rounds().length} rounds · ${S.leagues().length} leagues${S.state.settings.lastExport ? ` · last export ${S.state.settings.lastExport.slice(0, 16).replace("T", " ")}` : ""}</div>
      <div class="two"><button class="btn primary" data-act="export">Export backup</button><label class="btn">Import backup<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
    <h2>For the desktop kit</h2>
    <p class="muted small">A round as tournament.yaml: put it in tournaments/&lt;slug&gt;/ on the computer and run python golf.py render.</p>
    ${done.map(r => `<div class="card row"><div><div class="name">${esc(r.name)}</div><div class="muted small">${esc(r.date || "")}</div></div><button class="btn small" data-act="yaml" data-rid="${r.id}">tournament.yaml</button></div>`).join("") || `<p class="muted center">No finished rounds yet.</p>`}
    <h2>Danger zone</h2>
    ${S.rounds().map(r => `<div class="card row"><div><div class="name">${esc(r.name)}</div><div class="muted small">${roundStatus(r)}</div></div><button class="btn small danger" data-act="del-round" data-rid="${r.id}">Delete</button></div>`).join("")}`);
  document.getElementById("syncf").addEventListener("submit", async ev => {
    ev.preventDefault();
    const c = { url: ev.target.url.value.trim(), anonKey: ev.target.anonKey.value.trim() };
    if (!c.url && !c.anonKey) { Y.setConfig(null); toast("Sync switched off on this phone"); return settings(); }
    if (!c.url.startsWith("http") || !c.anonKey) return toast("Both the URL and the anon key are needed");
    try { await Y.test(c); } catch (err) { return toast(`Could not connect: ${err.message}`, 6000); }
    Y.setConfig(DATA.sync && c.url === DATA.sync.url && c.anonKey === DATA.sync.anonKey ? null : c);
    toast("Connected. Syncing…");
    settings();
  });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "sync-now") { await Y.pushAndPull(); toast(Y.sync.status === "error" ? `Sync problem: ${Y.sync.error}` : "Synced"); settings(); }
    if (b.dataset.act === "sync-default") { Y.setConfig(null); settings(); }
    if (b.dataset.act === "export") {
      const text = S.exportJSON();
      await saveFiles([new File([text], `hagolf-backup-${S.today()}.json`, { type: "application/json" })], "Hagolf backup");
      settings();
    }
    if (b.dataset.act === "yaml") {
      const r = S.getRound(b.dataset.rid);
      await saveFiles([new File([S.toYAML(r)], `${slugFile(r.name).toLowerCase()}-tournament.yaml`, { type: "text/plain" })], r.name);
    }
    if (b.dataset.act === "del-round") {
      const r = S.getRound(b.dataset.rid);
      if (confirm(`Delete ${r.name} on every phone? This cannot be undone.`)) { S.deleteRound(r.id); settings(); }
    }
  });
  document.getElementById("imp").addEventListener("change", async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const res = S.importJSON(await f.text());
      toast(`Imported: ${plural(res.added, "record")} added or updated`, 5000);
      settings();
    } catch (err) { toast(err.message, 5000); }
  });
}

// ---------------------------------------------------------------- global actions and routing
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "pick-course") roundForm(b.dataset.slug);
  if (act === "create-round") {
    const r = S.createRound({ course: b.dataset.slug, name: document.getElementById("rname").value.trim() || "Round", date: document.getElementById("rdate").value,
      defaultTee: document.getElementById("rtee").value, allowance: document.getElementById("rallow").value });
    go(`#players/${r.id}`);
  }
  if (act === "toggle-add") { const f = document.getElementById("addf"); f.classList.add("open"); b.classList.add("hidden"); document.getElementById("pname").focus(); f.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (act === "remove-entry") {
    const rid = location.hash.split("/")[1], r = S.getRound(rid), e = r.entries[Number(b.dataset.i)];
    if (e.scores.every(s => s === null) || confirm(`Remove ${e.name} and their scores from this round?`)) { r.entries.splice(Number(b.dataset.i), 1); S.saveRound(r); players(rid); }
  }
  if (act === "start-scoring") { const r = S.getRound(b.dataset.rid); go(`#score/${r.id}/${r.hole || 0}`); }
  if (act === "del-player") { if (confirm("Delete this player?")) { S.deletePlayer(b.dataset.id); roster(); } }
  if (act === "update") { if (window.__updateWorker) window.__updateWorker.postMessage("skipWaiting"); }
  if (act === "install" && window.__installPrompt) { window.__installPrompt.prompt(); window.__installPrompt = null; }
});

const screens = { home, new: newRound, players, score, review, attach, graphics, roster, leagues, league, leagueposter: leaguePoster, settings };

function route() {
  const t = document.getElementById("toast");
  if (t) t.classList.remove("show");
  const [name, ...args] = location.hash.replace(/^#/, "").split("/");
  ui.expanded = name === "review" ? ui.expanded : null;
  (screens[name] || home)(...args.map(decodeURIComponent));
}

function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream; }
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }

// other phones' changes: redraw the current screen, unless the user is typing or looking at rendered images
Y.onChange(({ changed, status }) => {
  const typing = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  const busy = document.querySelector(".thumbs, .progress");
  if (changed && !typing && !busy) route();
  else if (status) { const d = document.querySelector(".top .dot"); if (d) d.outerHTML = syncDot(); }
});
S.setOnSave(Y.schedulePush);

window.addEventListener("hashchange", route);
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installPrompt = e; if (location.hash === "" || location.hash === "#home") home(); });
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then(reg => {
    const watch = w => w && w.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) { window.__updateReady = true; window.__updateWorker = w; toast("New version ready: go Home and tap the banner", 4000); if (!location.hash || location.hash === "#home") home(); }
    });
    watch(reg.installing);
    reg.addEventListener("updatefound", () => watch(reg.installing));
  }).catch(e => console.warn("sw", e));
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
}
route();
Y.start();
