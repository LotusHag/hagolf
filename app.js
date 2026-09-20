// Hagolf screens and navigation. Hash routes: #home #welcome #join/<payload> #new #players/<rid> #score/<rid>/<hole>
// #review/<rid> #attach/<rid> #graphics/<rid> #roster #leagues #league/<gid> #leagueposter/<gid> #settings #newcourse
import { DATA } from "./data.js";
import * as S from "./store.js";
import * as Y from "./sync.js";
import { compute, standings, headToHead, handicapFor, prepareCourse, outcome, stableford, fmtToPar, fmtHcp, fmtIndex, fix } from "./model.js";
import { loadFonts, makeTheme } from "./draw.js";
import { grossLeaderboard, stablefordLeaderboard, holesPoster, standingsPoster } from "./posters.js";
import { renderCards } from "./cards.js";

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const courseBy = slug => S.courseBy(slug);
const courseTitle = c => c.loop ? `${c.name} · ${c.loop}` : c.name;
const sum = xs => xs.reduce((a, b) => a + b, 0);
const go = hash => { location.hash = hash; };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
let toastTimer = null;
const ui = { expanded: null, selHole: null, blobs: [], h2h: {}, groupFilter: 0 };

function toast(msg, ms = 2600, action = null) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg.charAt(0).toUpperCase() + msg.slice(1);
  t.classList.toggle("action", !!action);
  if (action) {
    const b = document.createElement("button");
    b.className = "toastbtn"; b.textContent = action.label;
    b.onclick = () => { t.classList.remove("show"); action.fn(); };
    t.appendChild(b);
  }
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
  const title = { off: "Solo phone: not connected to a shared database", idle: "Synced", syncing: "Syncing", error: "Sync problem: " + (Y.sync.error || "") }[s];
  return `<a class="dot ${s}" href="#settings" title="${esc(title)}" aria-label="${esc(title)}"></a>`;
}

const organiser = () => !!S.state.settings.organiser;

function roundStatus(r) {
  const c = courseBy(r.course);
  const n = c ? c.n : 0;
  if (r.status === "setup") return `${plural(r.entries.length, "player")} · not started`;
  if (r.status === "scoring") return `scoring · hole ${Math.min(S.holeOf(r) + 1, n)} of ${n}`;
  return `done · ${plural(r.entries.length, "player")}`;
}

function resumeHash(r) {
  if (r.status === "setup") return `#players/${r.id}`;
  if (r.status === "scoring") return `#score/${r.id}/${S.holeOf(r)}`;
  return `#graphics/${r.id}`;
}

function noCourse(r, back = "#home") {
  page(esc(r.name || "Round"), `<div class="banner warn">This round's course (${esc(r.course)}) is not on this phone yet. It arrives with the next sync, or the organiser pushes the course files.</div>`, { back });
}

function safeCompute(r) {
  const c = courseBy(r.course);
  if (!c) return null;
  try { return Object.assign(compute(c, S.toModelRound(r)), { id: r.id }); } catch (e) { return null; }
}

/** Points so far for a round in progress, by entered holes: the live board. */
function liveBoard(r) {
  const c = courseBy(r.course);
  if (!c) return null;
  const rows = [];
  let through = 0;
  for (const e of r.entries) {
    let info;
    try { info = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); } catch (err) { continue; }
    let pts = 0, holes = 0;
    e.scores.forEach((v, h) => { if (v === null) return; holes++; if (v > 0) pts += stableford(v, info.par[h], info.strokes[h]); });
    through = Math.max(through, holes);
    rows.push({ name: e.name, pts, holes });
  }
  rows.sort((a, b) => b.pts - a.pts || b.holes - a.holes);
  return { rows, through };
}

// ---------------------------------------------------------------- welcome and join
function welcome() {
  const ps = S.players().sort((a, b) => a.name.localeCompare(b.name));
  const c = Y.config();
  page("Hagolf", `<div class="welcome">
    <h1>Who are you?</h1>
    <p class="muted">Pick your name so the app can show your rounds, your league line and your card. ${c ? `Connected to <b>${esc(c.label || "the shared database")}</b>.` : "This phone is not connected to a shared database yet; that can be set up later in Settings."}</p>
    ${ps.length ? `<div class="chips-wrap" style="margin:12px 0">${ps.map(p => `<button class="pchip" data-act="me" data-id="${p.id}">${esc(p.name)}<small>index ${fmtIndex(Number(p.hi))}</small></button>`).join("")}</div>` : ""}
    <form id="mef" class="card form open"><h2>${ps.length ? "Not in the list" : "Your name"}</h2>
      <label>Name<input name="name" autocapitalize="words" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
      <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" placeholder="18,4 or +2.1" required></label>
      <label>Rating<select name="gender"><option value="m">Men's</option><option value="f">Women's</option></select></label></div>
      <button class="btn primary" type="submit">That's me</button></form>
    <p class="center"><a class="muted small" href="#skipme">Skip for now</a></p></div>`, { back: "" });
  bind(ev => {
    const b = ev.target.closest("[data-act=me]");
    if (b) { S.state.settings.meId = b.dataset.id; S.state.settings.welcomed = true; S.save(); go("#home"); }
  });
  document.getElementById("mef").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, hi = parseHI(f.hi.value);
    if (!(hi >= -10 && hi <= 54)) return toast("Handicap index between +10 and 54, e.g. 18,4");
    const p = S.upsertPlayer(f.name.value.trim(), hi, f.gender.value);
    S.state.settings.meId = p.id; S.state.settings.welcomed = true; S.save(); go("#home");
  });
}

async function join(payload) {
  let c;
  try { c = Y.parseJoin(payload); } catch (e) { toast("That join link is not readable"); return go("#home"); }
  page("Joining…", `<p class="muted center">Connecting to ${esc(c.label || c.url)}…</p>`, { back: "" });
  try { await Y.test(c); } catch (err) { toast(`Could not connect: ${err.message}`, 6000); return go("#settings"); }
  Y.setConfig({ url: c.url, anonKey: c.anonKey, label: c.label || "" });
  if (c.organiser) S.state.settings.organiser = true;
  S.state.settings.welcomed = false;
  S.save();
  await new Promise(res => setTimeout(res, 1500));  // let the first pull bring the roster in
  await Y.pull();
  go("#welcome");
}

// ---------------------------------------------------------------- home
function meCard(me) {
  const mine = S.rounds().filter(r => r.status === "done" && r.entries.some(e => e.playerId === me.id));
  const last = mine[0] ? safeCompute(mine[0]) : null;
  const p = last ? last.players.find(x => x.id === me.id) : null;
  const lines = [];
  if (p) {
    const played = p.deltas.map((d, h) => [d, h]).filter(([d]) => d !== null);
    const best = played.length ? played.reduce((a, x) => x[0] < a[0] ? x : a) : null, worst = played.length ? played.reduce((a, x) => x[0] > a[0] ? x : a) : null;
    lines.push(`<div class="row"><div><div class="muted small">${esc(mine[0].name)} · ${esc(mine[0].date || "")}</div><div class="big">${p.pts} <span class="muted" style="font-size:16px">pts · ${p.splace} of ${last.field}${p.gross !== null ? ` · gross ${p.gross}` : ""}</span></div>
      ${best ? `<div class="muted small">best hole ${last.labels[best[1]]} (${fmtToPar(best[0])}) · worst hole ${last.labels[worst[1]]} (${fmtToPar(worst[0])})</div>` : ""}</div>
      <button class="btn small" data-act="my-card" data-rid="${mine[0].id}">Save my card</button></div>`);
  } else lines.push(`<div class="muted small">No finished round yet.</div>`);
  for (const g of S.leagues()) {
    const { S: Sx } = leagueResults(g);
    const row = Sx.rows.find(r => r.id === me.id);
    if (row) lines.push(`<a class="row small" href="#league/${g.id}"><span>${esc(g.name)}</span><span><b>${row.place}.</b> · ${row.counted} pts · ${plural(row.played, "round")}</span></a>`);
  }
  return `<div class="mecard"><div class="row"><div class="name">${esc(me.name)}</div><div class="muted small">index ${fmtIndex(Number(me.hi))} · <a href="#welcome">not you?</a></div></div>${lines.join("")}</div>`;
}

function home() {
  if (!S.state.settings.welcomed) return welcome();
  const rounds = S.rounds();
  const me = S.me();
  const banners = [];
  if (Y.sync.status === "error") banners.push(`<a class="banner warn" href="#settings">Sync problem: ${esc(Y.sync.error || "")}. Changes are kept on this phone and sent when it works again.</a>`);
  if (window.__updateReady) banners.push(`<div class="banner" data-act="update">A new version is ready. Tap to reload.</div>`);
  if (window.__installPrompt) banners.push(`<div class="banner" data-act="install">Install Hagolf on this phone</div>`);
  else if (isIOS() && !isStandalone()) banners.push(`<div class="banner muted">To install: tap Share <span class="ios-share">⎋</span> in Safari, then “Add to Home Screen”.</div>`);
  if (!Y.enabled() && S.needsBackup()) banners.push(`<a class="banner muted" href="#settings">Solo phone: rounds since the last backup. Export a backup when you have a moment.</a>`);
  const list = rounds.length ? rounds.map(r => {
    let live = "";
    if (r.status === "scoring") {
      const L = liveBoard(r);
      if (L && L.rows.length && L.through) live = `<div class="live">through ${L.through} · ${L.rows.slice(0, 3).map((x, i) => `${i + 1}. ${esc(x.name.split(" ")[0])} <b>${x.pts}</b>`).join(" · ")}</div>`;
    }
    const lg = S.leaguesOfRound(r.id);
    return `<a class="card" href="${resumeHash(r)}"><div class="row"><div><div class="name">${esc(r.name)}</div><div class="muted">${esc(r.date || "")} · ${esc(courseTitle(courseBy(r.course) || { name: r.course }))}${lg.length ? ` · ${lg.map(g => esc(g.name)).join(", ")}` : ""}</div></div>
      <div class="status ${r.status}">${roundStatus(r)}</div></div>${live}</a>`;
  }).join("") : `<p class="muted center">No rounds yet. Start with a new round.</p>`;
  page("Hagolf", `
    ${banners.join("")}
    ${me ? meCard(me) : `<a class="banner muted" href="#welcome">Say who you are to see your own results here.</a>`}
    <a class="btn primary big" href="#new">+ New round</a>
    <h2>Rounds</h2>${list}
    <nav class="grid3">
      <a class="tile" href="#leagues">Leagues<small>${S.leagues().length}</small></a>
      <a class="tile" href="#roster">Players<small>${S.players().length}</small></a>
      <a class="tile" href="#settings">Settings<small>${Y.enabled() ? (Y.config().label || "synced") : "solo"}</small></a></nav>
    <p class="muted center small">${S.courses().length} courses · ${DATA.themes.length} themes · version ${DATA.version}</p>`, { back: "" });
  bind(async ev => {
    const b = ev.target.closest("[data-act=my-card]");
    if (b) await myCard(b.dataset.rid);
  });
}

async function myCard(rid) {
  const me = S.me(), r = S.getRound(rid);
  const M = r ? safeCompute(r) : null;
  if (!me || !M || !M.players.some(p => p.id === me.id)) return toast("No card to make");
  toast("Making your card…", 3000);
  await loadFonts(DATA.fonts);
  const T = makeTheme(DATA.themes.find(t => t.name === (S.state.settings.themes || ["navy"])[0]) || DATA.themes[0]);
  const fig = renderCards(M, T, [me.name])[0];
  const blob = await fig.fig.toBlob();
  await saveFiles([new File([blob], `${slugFile(r.name)}_${fig.file.split("/").pop()}`, { type: "image/png" })], r.name);
}

// ---------------------------------------------------------------- new round
function newRound(slug = null) {
  if (slug) return roundForm(slug);
  const all = S.courses();
  const recent = (S.state.settings.recentCourses || []).map(s => all.find(c => c.slug === s)).filter(Boolean);
  const groups = new Map();
  for (const c of all) { if (!groups.has(c.name)) groups.set(c.name, []); groups.get(c.name).push(c); }
  const row = c => `<button class="card row course" data-act="pick-course" data-slug="${esc(c.slug)}" data-q="${esc((c.name + " " + c.loop).toLowerCase())}">
    <div><div class="name">${esc(c.loop || c.name)}</div><div class="muted">${c.n} holes · par ${c.course_par} · tees: ${Object.keys(c.tees).join(", ")}${c.source === "phone" ? " · added on a phone" : ""}</div></div><span class="chev">›</span></button>`;
  const body = `
    <input id="q" class="search" placeholder="Search course or loop" autocomplete="off">
    <div id="courses">${recent.length ? `<h2>Recent</h2>${recent.map(row).join("")}` : ""}
    ${[...groups].map(([name, cs]) => `<h2>${esc(name)}</h2>${cs.map(row).join("")}`).join("")}</div>
    <p class="center"><a class="muted small" href="#newcourse">Course not here? Add one</a></p>`;
  page("Pick a course", `<a class="card row" href="#scan"><div><div class="name">Scan an old scorecard</div><div class="muted small">Photograph a paper card; the scores are read for you to check</div></div><span class="chev">›</span></a>` + body);
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
  const last = S.state.settings.lastLeague;
  page("New round", `
    <div class="card"><div class="name">${esc(courseTitle(c))}</div><div class="muted">${c.n} holes · par ${c.course_par} · ${dflt} tees · 100% allowance</div>
      ${(c.notes || []).length ? `<div class="warn small" style="margin-top:6px">${esc(c.notes.join("; "))}</div>` : ""}</div>
    <details class="card"><summary>Options: name, date, tee, allowance</summary>
      <label>Name of the round<input id="rname" value="${esc((c.loop || c.name) + " " + date)}"></label>
      <label>Date<input id="rdate" type="date" value="${date}"></label>
      <label>Default tee (each player can pick their own)<select id="rtee">${tees.map(t => `<option ${t === dflt ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <label>Handicap allowance<select id="rallow"><option value="100">100% (society default)</option><option value="95">95% (WHS individual Stableford)</option><option value="90">90%</option></select></label>
    </details>
    ${S.leagues().length ? `<div class="card checks"><h2>Counts for</h2>${S.leagues().map(g => `<label><input type="checkbox" name="lg" value="${g.id}" ${g.id === last ? "checked" : ""}> ${esc(g.name)}</label>`).join("")}</div>` : ""}`,
  { back: "#new", bar: `<button class="btn primary" data-act="create-round" data-slug="${esc(slug)}">Start ›</button>` });
}

// ---------------------------------------------------------------- players in a round
function players(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const tees = Object.keys(c.tees);
  const inRound = new Set(r.entries.map(e => e.playerId));
  const roster = S.players().filter(p => !inRound.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const me = S.me();
  const showGroups = r.entries.length > 4 || r.entries.some(e => (e.group || 1) > 1);
  const rows = r.entries.map((e, i) => {
    let hc = "", missing = false;
    try { const h = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); hc = `course hcp ${fmtHcp(h.ch)}`; }
    catch (err) { hc = `<span class="warn">${esc(err.message)}</span>`; missing = true; }
    return `<div class="card"><div class="row"><div><div class="name">${esc(e.name)}</div><div class="muted small">index ${fmtIndex(Number(e.hi))} · ${e.gender === "f" ? "women's" : "men's"} rating · ${hc}</div></div>
        <button class="x" data-act="remove-entry" data-i="${i}" aria-label="Remove">×</button></div>
      <div class="entry-tools">
        <select data-act="tee" data-i="${i}">${tees.map(t => `<option ${t === e.tee ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        ${showGroups ? `<span class="seg">${[1, 2, 3, 4].map(g => `<button data-act="grp" data-i="${i}" data-g="${g}" class="${(e.group || 1) === g ? "on" : ""}">${g}</button>`).join("")}</span>` : ""}
        <select data-act="from" data-i="${i}" title="Joins at hole"><option value="1" ${(e.fromHole || 1) === 1 ? "selected" : ""}>from hole 1</option>${c.par.slice(1).map((_, k) => `<option value="${k + 2}" ${(e.fromHole || 1) === k + 2 ? "selected" : ""}>joins at hole ${c.first_hole + k + 1}</option>`).join("")}</select>
        ${missing ? `<input data-act="pch" data-i="${i}" inputmode="numeric" placeholder="course hcp from club table" style="width:auto;margin:0;padding:6px 10px;font-size:14px">` : ""}
      </div></div>`;
  }).join("");
  const body = `
    <div class="muted small">${esc(r.name)} · ${esc(courseTitle(c))} · tap names to add them${showGroups ? " · 1 2 3 4 = playing group" : ""}</div>
    ${rows}
    ${roster.length ? `<h2>Tap to add</h2><div class="chips-wrap">${roster.map(p => `<button class="pchip ${me && p.id === me.id ? "on" : ""}" data-act="add-roster" data-id="${p.id}">${esc(p.name)}<small>index ${fmtIndex(Number(p.hi))}</small></button>`).join("")}</div>` : ""}
    <form id="addf" class="card form ${roster.length || r.entries.length ? "" : "open"}">
      <h2>Someone new</h2>
      <label>Name<input id="pname" autocomplete="off" autocapitalize="words" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
      <div class="two">
        <label>Handicap index<input id="phi" inputmode="decimal" placeholder="18,4 or +2.1" required></label>
        <label>Tee<select id="ptee">${tees.map(t => `<option ${t === r.defaultTee ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <div class="two">
        <label>Rating<select id="pgender"><option value="m">Men's</option><option value="f">Women's</option></select></label>
        <label>Course hcp override <span class="muted">(optional)</span><input id="pch" inputmode="numeric" placeholder="from club table"></label></div>
      <button class="btn primary" type="submit">Add player</button>
    </form>
    <button class="btn addbtn ${roster.length || r.entries.length ? "" : "hidden"}" data-act="toggle-add"><span class="plus">+</span> Someone new</button>`;
  const bar = r.entries.length
    ? `<button class="btn primary" data-act="start-scoring" data-rid="${rid}">${r.status === "setup" ? "Start scoring ›" : "Back to scoring ›"}</button>`
    : `<button class="btn" disabled>Add players to start</button>`;
  page("Who is playing", body, { back: "#home", bar });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "add-roster") {
      const p = S.players().find(x => x.id === b.dataset.id);
      S.addEntry(r, c.n, { name: p.name, hi: p.hi, tee: r.defaultTee, gender: p.gender || "m", courseHandicap: null });
      return players(rid);
    }
    if (b.dataset.act === "grp") { const e = r.entries[Number(b.dataset.i)]; e.group = Number(b.dataset.g); S.saveEntry(r, e); return players(rid); }
  });
  app.querySelector("main").addEventListener("change", ev => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const e = r.entries[Number(el.dataset.i)];
    if (el.dataset.act === "tee") { e.tee = el.value; S.saveEntry(r, e); players(rid); }
    if (el.dataset.act === "from") { e.fromHole = Number(el.value); S.saveEntry(r, e); players(rid); }
    if (el.dataset.act === "pch") {
      const v = Number(el.value.trim());
      if (!Number.isInteger(v)) return toast("Course handicap must be a whole number");
      S.setPch(e.playerId, r.course, e.tee, v); players(rid);
    }
  });
  const f = document.getElementById("addf"), nameEl = document.getElementById("pname");
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
    const known = S.findPlayer(name);
    if (known) toast(`${known.name} was already known; added with today's index`, 3500);
    S.addEntry(r, c.n, { name: known ? known.name : name, hi, tee, gender, courseHandicap });
    players(rid);
  });
  if (f.classList.contains("open")) nameEl.focus();
}

// ---------------------------------------------------------------- scoring
function scoreRow(r, c, e, i, h) {
  let info = null;
  try { info = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); } catch (err) { info = null; }
  const par = info ? info.par[h] : c.par[h];
  if ((e.fromHole || 1) - 1 > h) return `<div class="prow" data-i="${i}"><div class="pinfo"><div class="name">${esc(e.name)}</div><div class="muted small">joins at hole ${c.first_hole + e.fromHole - 1}</div></div><div></div><div class="muted center">—</div><div></div></div>`;
  const v = e.scores[h];
  const st = info ? info.strokes[h] : 0;
  let detail = st ? plural(st, "stroke") : "no strokes";
  if (v !== null && v !== 0 && info) detail += ` · net ${v - st} · ${plural(stableford(v, par, st), "pt")}`;
  const entered = e.scores.filter(x => x !== null).length;
  const total = entered ? ` · ${sum(e.scores.filter(x => x))} after ${entered}` : "";
  const cls = v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
  return `<div class="prow" data-i="${i}">
    <div class="pinfo"><div class="name">${esc(e.name)}</div><div class="muted small">${detail}${total}</div></div>
    <button class="sbtn" data-act="dec" data-i="${i}" aria-label="minus">−</button>
    <button class="sval ${cls}" data-act="pickup" data-i="${i}" title="Tap to mark picked up">${v === null ? "–" : v === 0 ? "NR" : v}</button>
    <button class="sbtn" data-act="inc" data-i="${i}" aria-label="plus">+</button></div>`;
}

function stripHtml(r, c, rid, h) {
  return c.par.map((_, i) => {
    const playing = r.entries.filter(e => (e.fromHole || 1) - 1 <= i);
    const done = playing.length && playing.every(e => e.scores[i] !== null);
    const some = r.entries.some(e => e.scores[i] !== null);
    return `<a class="hchip ${i === h ? "cur" : ""} ${done ? "done" : some ? "some" : ""}" href="#score/${rid}/${i}">${c.first_hole + i}</a>`;
  }).join("");
}

function score(rid, hArg) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const n = c.n;
  const h = Math.max(0, Math.min(n - 1, Number(hArg) || 0));
  if (r.status === "setup") { r.status = "scoring"; S.saveRound(r); }
  if (S.holeOf(r) !== h) S.setHole(r, h);  // this phone's place in the round, not shared
  if (!S.roundOpen(r)) toast("This round was entered more than 60 days ago and is frozen; changes will not sync.", 5000);
  const groups = [...new Set(r.entries.map(e => e.group || 1))].sort();
  const gf = groups.includes(ui.groupFilter) ? ui.groupFilter : 0;
  const shown = r.entries.map((e, i) => [e, i]).filter(([e]) => !gf || (e.group || 1) === gf);
  const metres = c.tees[r.defaultTee] && c.tees[r.defaultTee].metres;
  const body = `
    <div class="strip">${stripHtml(r, c, rid, h)}</div>
    ${groups.length > 1 ? `<div class="filter"><button data-act="gf" data-g="0" class="${gf === 0 ? "on" : ""}">All</button>${groups.map(g => `<button data-act="gf" data-g="${g}" class="${gf === g ? "on" : ""}">Group ${g}</button>`).join("")}</div>` : ""}
    <div class="holehead"><div class="hnum">${c.first_hole + h}</div>
      <div><div class="name">Par ${c.par[h]} · SI ${c.stroke_index[h]}${metres ? ` · ${metres[h]} m` : ""}</div>
      <div class="muted small">${esc(r.name)} · first tap on − or + enters par · tap the score to mark a pick-up</div></div></div>
    <div id="rows">${shown.map(([e, i]) => scoreRow(r, c, e, i, h)).join("")}</div>
    ${r.entries.length ? "" : `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}
    <p class="center"><a class="muted small" href="#players/${rid}">Add or remove players</a></p>`;
  const bar = (h === 0 ? `<a class="btn" href="#players/${rid}">‹ Players</a>` : `<a class="btn" href="#score/${rid}/${h - 1}">‹ Hole ${c.first_hole + h - 1}</a>`) +
    (h < n - 1 ? `<a class="btn primary" href="#score/${rid}/${h + 1}">Hole ${c.first_hole + h + 1} ›</a>` : `<a class="btn primary" href="#review/${rid}">Review ›</a>`);
  page(`Hole ${c.first_hole + h} of ${n}`, body, { back: "#home", bar });
  const stripEl = document.querySelector(".strip"), cur = document.querySelector(".hchip.cur");
  if (stripEl && cur) stripEl.scrollLeft = cur.offsetLeft - stripEl.clientWidth / 2 + cur.clientWidth / 2;
  const refresh = i => {  // one row and the strip, not the whole screen: the thumb stays where it was
    const row = document.querySelector(`.prow[data-i="${i}"]`);
    if (row) row.outerHTML = scoreRow(r, c, r.entries[i], i, h);
    const keep = stripEl.scrollLeft;
    stripEl.innerHTML = stripHtml(r, c, rid, h);
    stripEl.scrollLeft = keep;
  };
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "gf") { ui.groupFilter = Number(b.dataset.g); return score(rid, h); }
    if (!S.roundOpen(r)) return toast("This round is frozen (entered more than 60 days ago)");
    const i = Number(b.dataset.i), e = r.entries[i];
    const par = c.par[h], v = e.scores[h];
    if (b.dataset.act === "inc") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.min(30, v + 1));
    else if (b.dataset.act === "dec") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.max(1, v - 1));
    else if (b.dataset.act === "pickup") {
      if (v === 0) S.setScore(r, e, h, null);
      else if (v === null) S.setScore(r, e, h, par);
      else { S.setScore(r, e, h, 0); toast(`${e.name}: picked up on hole ${c.first_hole + h}`, 5000, { label: "Undo", fn: () => { S.setScore(r, e, h, v); refresh(i); } }); }
    }
    refresh(i);
  });
}

// ---------------------------------------------------------------- review
function review(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const n = c.n;
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) {
    return page("Review", `<div class="banner warn">${esc(err.message)}</div><a class="btn" href="#players/${rid}">Fix the players</a>`, { back: `#score/${rid}/${S.holeOf(r)}` });
  }
  const done = M.stbl_board.map(p => [p, r.entries.find(e => e.playerId === p.id)]);
  const unfinished = r.entries.filter(e => M.unfinished.includes(e.name));
  const chips = (e) => c.par.map((par, i) => {
    const v = e.scores[i];
    const skip = (e.fromHole || 1) - 1 > i;
    const cls = skip ? "empty" : v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
    const sel = ui.expanded === e.playerId && ui.selHole === i ? "sel" : "";
    return `<button class="chip ${cls} ${sel}" data-act="sel-hole" data-pid="${e.playerId}" data-h="${i}" ${skip ? "disabled" : ""}><small>${c.first_hole + i}</small>${skip ? "—" : v === null ? "–" : v === 0 ? "NR" : v}</button>`;
  }).join("");
  const editor = (e) => {
    if (ui.expanded !== e.playerId || ui.selHole === null) return "";
    const i = ui.selHole, v = e.scores[i], par = c.par[i];
    return `<div class="editor"><div>Hole ${c.first_hole + i} · par ${par} · SI ${c.stroke_index[i]}</div>
      <div class="edrow"><button class="sbtn" data-act="ed" data-d="-1" data-pid="${e.playerId}">−</button>
      <span class="sval big">${v === null ? "–" : v === 0 ? "NR" : v}</span>
      <button class="sbtn" data-act="ed" data-d="1" data-pid="${e.playerId}">+</button>
      <button class="btn small" data-act="ed-pick" data-pid="${e.playerId}">${v === 0 ? "Un-pick" : "Picked up"}</button></div></div>`;
  };
  const penalties = (e) => `<div class="pens">${(e.penalties || []).map((p, k) => `<span class="pen">+${p.strokes} on hole ${p.hole}${p.reason ? ` (${esc(p.reason)})` : ""} <button data-act="del-pen" data-pid="${e.playerId}" data-k="${k}" aria-label="remove">×</button></span>`).join("")}
    <details><summary class="muted small">Add penalty strokes</summary>
      <div class="two"><label>Hole<select class="pen-hole">${c.par.map((_, i) => `<option value="${i + 1}">${c.first_hole + i}</option>`).join("")}</select></label>
      <label>Strokes<input class="pen-strokes" inputmode="numeric" value="2"></label></div>
      <label>Reason<input class="pen-reason" placeholder="e.g. Late on the first tee"></label>
      <button class="btn small" data-act="add-pen" data-pid="${e.playerId}">Add penalty</button></details></div>`;
  const rows = done.map(([p, e]) => `
    <div class="card pl ${ui.expanded === e.playerId ? "open" : ""}">
      <button class="row plain" data-act="expand" data-pid="${e.playerId}">
        <div><div class="name">${p.splace}. ${esc(p.name)}${p.penalty_total ? ` <span class="pen">pen +${p.penalty_total}</span>` : ""}</div>
          <div class="muted small">hcp ${fmtHcp(p.ph)} · ${esc(p.tee)}${p.skipped.some(Boolean) ? ` · from hole ${c.first_hole + p.from_hole - 1}` : ""}${p.picked.some(Boolean) ? " · no return" : ""}</div></div>
        <div class="nums"><span><b>${p.gross === null ? "NR" : p.gross}</b><small>gross${p.topar !== null ? " " + fmtToPar(p.topar) : ""}</small></span>
          <span><b>${p.net === null ? "NR" : p.net}</b><small>net</small></span><span class="acc"><b>${p.pts}</b><small>pts</small></span></div></button>
      ${ui.expanded === e.playerId ? `<div class="chips">${chips(e)}</div>${editor(e)}${penalties(e)}` : ""}</div>`).join("");
  const missing = unfinished.map(e => {
    const holes = e.scores.map((v, i) => v === null && (e.fromHole || 1) - 1 <= i ? c.first_hole + i : null).filter(x => x !== null);
    return `<div class="card row warnrow"><div><div class="name">${esc(e.name)}</div><div class="muted small">missing hole${holes.length === 1 ? "" : "s"} ${holes.join(", ")}</div></div>
      <a class="btn small" href="#score/${rid}/${holes[0] - c.first_hole}">Enter</a></div>`;
  }).join("");
  const lg = S.leaguesOfRound(rid);
  const body = `<div class="muted small">${esc(r.name)} · ${esc(courseTitle(c))} · tap a player, then a hole, to change a score</div>
    <div class="card row"><div class="small">Counts for: <b>${lg.length ? lg.map(g => esc(g.name)).join(", ") : "no league"}</b></div><a class="btn small" href="#attach/${rid}">Change</a></div>
    <details class="card"><summary class="small">Round details: ${esc(r.name)} · ${esc(r.date || "no date")}</summary>
      <form id="rdet"><label>Name<input name="name" value="${esc(r.name)}"></label><label>Played on<input name="date" type="date" value="${esc(r.date || "")}"></label>
      <button class="btn small" type="submit">Save details</button></form></details>
    ${missing ? `<h2>Not finished</h2>${missing}` : ""}
    ${rows ? `<h2>Stableford order</h2>${rows}` : `<p class="muted center">No complete scorecards yet.</p>`}`;
  const bar = `<a class="btn" href="#score/${rid}/${n - 1}">‹ Scoring</a>
    <button class="btn primary" data-act="save-round" ${M.field ? "" : "disabled"}>All correct, save ›</button>`;
  page("Check the scores", body, { back: `#score/${rid}/${S.holeOf(r)}`, bar });
  document.getElementById("rdet").addEventListener("submit", ev => {
    ev.preventDefault();
    r.name = ev.target.name.value.trim() || r.name;
    r.date = ev.target.date.value || null;
    S.saveRound(r); toast("Saved"); review(rid);
  });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const e = r.entries.find(x => x.playerId === b.dataset.pid);
    if (act === "expand") { ui.expanded = ui.expanded === e.playerId ? null : e.playerId; ui.selHole = null; return review(rid); }
    if (act === "sel-hole") { ui.expanded = e.playerId; ui.selHole = Number(b.dataset.h); return review(rid); }
    if (["ed", "ed-pick", "del-pen", "add-pen"].includes(act) && !S.roundOpen(r)) return toast("This round is frozen (entered more than 60 days ago)");
    if (act === "ed") {
      const i = ui.selHole, v = e.scores[i], par = c.par[i], d = Number(b.dataset.d);
      S.setScore(r, e, i, (v === null || v === 0) ? par : Math.max(1, Math.min(30, v + d))); return review(rid);
    }
    if (act === "ed-pick") { const i = ui.selHole; S.setScore(r, e, i, e.scores[i] === 0 ? c.par[i] : 0); return review(rid); }
    if (act === "del-pen") { e.penalties.splice(Number(b.dataset.k), 1); S.saveEntry(r, e); return review(rid); }
    if (act === "add-pen") {
      const box = b.closest(".pens");
      const hole = Number(box.querySelector(".pen-hole").value), strokes = Number(box.querySelector(".pen-strokes").value);
      if (!(strokes >= 1)) return toast("Penalty strokes must be 1 or more");
      e.penalties = e.penalties || [];
      e.penalties.push({ hole, strokes, reason: box.querySelector(".pen-reason").value.trim() });
      S.saveEntry(r, e); return review(rid);
    }
    if (act === "save-round") {
      if (unfinished.length && !confirm(`${plural(unfinished.length, "player")} ${unfinished.length === 1 ? "has" : "have"} holes missing and will be left off the graphics. Save anyway?`)) return;
      r.status = "done"; S.saveRound(r); go(`#graphics/${rid}`);
    }
  });
}

// ---------------------------------------------------------------- leagues a round counts for
function attach(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const mine = new Set(S.leaguesOfRound(rid).map(g => g.id));
  const list = S.leagues().map(g => `<label><input type="checkbox" data-act="toggle-league" data-gid="${g.id}" ${mine.has(g.id) ? "checked" : ""}> ${esc(g.name)}<span class="muted"> · ${plural(S.leagueRoundIds(g.id).length, "round")}</span></label>`).join("");
  const backTo = r.status === "done" ? `#graphics/${rid}` : `#review/${rid}`;
  page("Counts for", `
    <p class="muted small">${esc(r.name)}: tick the leagues this round counts for. Running totals and head-to-heads update on every phone.</p>
    <div class="card checks">${list || `<p class="muted">No leagues yet. Make one below.</p>`}</div>
    <form id="newg" class="card form open"><h2>New league</h2><label>Name<input name="name" placeholder="e.g. Apeliotes 2026" required></label>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="0"></label>
      <button class="btn" type="submit">Create and add this round</button></form>`,
  { back: backTo, bar: `<a class="btn primary" href="${backTo}">Done ›</a>` });
  bind(ev => {
    const b = ev.target.closest("[data-act=toggle-league]");
    if (b) { S.setLeagueRound(b.dataset.gid, rid, b.checked); if (b.checked) S.setSetting("lastLeague", b.dataset.gid); }
  });
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = S.createLeague(ev.target.name.value.trim() || "League", ev.target.bestN.value, S.me() ? S.me().name : null);
    S.setLeagueRound(g.id, rid, true);
    S.setSetting("lastLeague", g.id);
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
  if (!c) return noCourse(r);
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) { return page("Graphics", `<div class="banner warn">${esc(err.message)}</div>`, { back: `#review/${rid}` }); }
  const themes = (S.state.settings.themes || ["navy"]).slice(0, 1);
  const leagues = S.leaguesOfRound(rid);
  const body = `
    <div class="muted small">${esc(r.name)} · ${plural(M.field, "player")} on the boards${M.unfinished.length ? ` · ${M.unfinished.length} unfinished left out` : ""} · <a href="#review/${rid}">edit scores</a> · <a href="#attach/${rid}">${leagues.length ? "counts for " + leagues.map(g => esc(g.name)).join(", ") : "add to a league"}</a></div>
    <h2>Which graphics</h2>
    <div class="card checks">
      <label><input type="checkbox" name="g" value="stbl" checked> Stableford leaderboard</label>
      <label><input type="checkbox" name="g" value="gross"> Gross leaderboard</label>
      <label><input type="checkbox" name="g" value="holes"> How the holes played</label>
      <label><input type="checkbox" name="g" value="cards"> Player cards <span class="muted">&nbsp;(${M.field})</span></label>
      <details><summary class="muted small">Only some players' cards</summary>${M.players.map(p => `<label><input type="checkbox" name="card" value="${esc(p.name)}" checked> ${esc(p.name)}</label>`).join("")}</details>
      <button class="btn small" type="button" data-act="tick-all">Everything, every theme</button>
    </div>
    <h2>Theme</h2>
    <div class="themes">${themeChips(themes)}</div>
    <div id="out"></div>`;
  const bar = `<button class="btn primary" data-act="generate">Generate images</button>`;
  page("Graphics", body, { back: "#home", bar });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tick-all") {
      document.querySelectorAll("input[name=g], input[name=theme]").forEach(i => { i.checked = true; });
      document.querySelectorAll(".tchip").forEach(l => l.classList.add("on"));
      return;
    }
    if (b.dataset.act !== "generate") return;
    const want = [...document.querySelectorAll("input[name=g]:checked")].map(i => i.value);
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value);
    const cardNames = [...document.querySelectorAll("input[name=card]:checked")].map(i => i.value);
    if (!want.length) return toast("Tick at least one graphic");
    if (!chosen.length) return toast("Pick at least one theme");
    S.setSetting("themes", chosen);
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
  app.querySelector(".themes").addEventListener("change", ev => { const l = ev.target.closest(".tchip"); if (l) l.classList.toggle("on", ev.target.checked); });
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
        <div class="two"><button class="btn primary" type="submit">Save</button>${k || !organiser() ? "" : `<button class="btn danger" type="button" data-act="del-player" data-id="${p.id}">Delete</button>`}</div></form></details>`;
  }).join("");
  page("Players", `<p class="muted small">Everyone who has played, on every phone. The handicap index is the one they last played with; it is prefilled when you add them to a round. A renamed player keeps their history.</p>
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
    p.hi = hi; p.gender = f.gender.value;
    if (f.name.value.trim() !== p.name) S.renamePlayer(p, f.name.value); else { S.touch("players", p); S.save(); }
    toast("Saved"); roster();
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
  const rows = S.leagues().map(g => `<a class="card row" href="#league/${g.id}"><div><div class="name">${esc(g.name)}</div><div class="muted small">${plural(S.leagueRoundIds(g.id).length, "round")}${g.bestN ? ` · best ${g.bestN} count` : ""}${g.createdBy ? ` · by ${esc(g.createdBy)}` : ""}</div></div><span class="chev">›</span></a>`).join("");
  page("Leagues", `<p class="muted small">A league is a running Stableford table over the rounds added to it, with head-to-heads between any two players. Anyone can make one; every phone sees it.</p>
    ${rows || `<p class="muted center">No leagues yet.</p>`}
    <form id="newg" class="card form open"><h2>New league</h2><label>Name<input name="name" placeholder="e.g. Apeliotes 2026" required></label>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="0"></label>
      <button class="btn primary" type="submit">Create</button></form>`);
  document.getElementById("newg").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = S.createLeague(ev.target.name.value.trim() || "League", ev.target.bestN.value, S.me() ? S.me().name : null);
    go(`#league/${g.id}`);
  });
}

/** Computed rounds attached to a league (finished ones), the players in them, and the standings. */
function leagueResults(g) {
  const ids = new Set(S.leagueRoundIds(g.id));
  const Ms = [];
  for (const r of S.rounds().filter(r => ids.has(r.id) && r.status === "done")) {
    const M = safeCompute(r);
    if (M) Ms.push(M);
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
  const me = S.me();
  const table = Sx.rows.length ? `<table class="stand"><thead><tr><th>Pos</th><th class="l">Player</th><th>Rds</th><th>Wins</th><th>Best</th><th>Avg</th><th>${g.bestN ? `Best ${g.bestN}` : "Total"}</th></tr></thead>
    <tbody>${Sx.rows.map(r => `<tr class="${me && r.id === me.id ? "acc" : ""}"><td>${r.place}</td><td class="l">${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.best}</td><td>${fix(r.avg)}</td><td class="acc">${r.counted}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted center">No finished rounds in this league yet. Add some below.</p>`;
  const h = ui.h2h[gid] || {};
  const a = members.includes(h.a) ? h.a : (me && members.includes(me.id) ? me.id : members[0]);
  const b = members.includes(h.b) && h.b !== a ? h.b : members.find(m => m !== a);
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
    <h2>Players in this league</h2>
    <div class="card"><div class="muted small">${members.length ? members.map(m => esc(nameOf(m))).sort().join(" · ") : "nobody yet"}</div>
      ${members.length > 1 ? `<p class="muted small" style="margin-top:8px">Two spellings of one person? Merge them: every round, score and course handicap moves to the kept name.</p>
      <div class="merge"><select id="mkeep">${members.map(m => `<option value="${m}">${esc(nameOf(m))}</option>`).join("")}</select><span>←</span><select id="mdrop">${members.map((m, i) => `<option value="${m}" ${i === 1 ? "selected" : ""}>${esc(nameOf(m))}</option>`).join("")}</select></div>
      <button class="btn small" data-act="merge" style="margin-top:8px">Merge into the first name</button>` : ""}</div>
    <h2>Rounds in this league</h2>
    <div class="card checks">${roundList || `<p class="muted">No finished rounds yet.</p>`}</div>
    <form id="gform" class="card form open"><label>League name<input name="name" value="${esc(g.name)}"></label>
      <label>Rounds that count towards the total <span class="muted">(0 = all)</span><input name="bestN" inputmode="numeric" value="${g.bestN}"></label>
      <div class="two"><button class="btn primary" type="submit">Save</button>${organiser() ? `<button class="btn danger" type="button" data-act="del-league">Delete league</button>` : ""}</div></form>`, { back: "#leagues" });
  bind(ev => {
    const b_ = ev.target.closest("[data-act]");
    if (!b_) return;
    if (b_.dataset.act === "toggle-round") { S.setLeagueRound(gid, b_.dataset.rid, b_.checked); league(gid); }
    if (b_.dataset.act === "merge") {
      const keep = document.getElementById("mkeep").value, drop = document.getElementById("mdrop").value;
      if (keep === drop) return toast("Pick two different names");
      if (!confirm(`Merge ${nameOf(drop)} into ${nameOf(keep)} on every phone? This cannot be undone.`)) return;
      S.mergePlayers(keep, drop); toast("Merged"); league(gid);
    }
    if (b_.dataset.act === "del-league" && confirm(`Delete the league ${g.name} on every phone? Rounds and players stay.`)) { S.deleteLeague(gid); go("#leagues"); }
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
  const themes = (S.state.settings.themes || ["navy"]).slice(0, 1);
  page("Standings poster", `<h2>Theme</h2><div class="themes">${themeChips(themes)}</div><div id="out"></div>`,
    { back: `#league/${gid}`, bar: `<button class="btn primary" data-act="generate">Generate image</button>` });
  app.querySelector(".themes").addEventListener("change", ev => { const l = ev.target.closest(".tchip"); if (l) l.classList.toggle("on", ev.target.checked); });
  document.querySelector(".bar [data-act=generate]").addEventListener("click", async () => {
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value);
    if (!chosen.length) return toast("Pick at least one theme");
    S.setSetting("themes", chosen);
    const { S: Sx } = leagueResults(g);
    const jobs = chosen.map(tn => ({ label: `${chosen.length > 1 ? tn + "/" : ""}4_season_standings.png`, make: () => standingsPoster(Sx, g, makeTheme(DATA.themes.find(t => t.name === tn))) }));
    await runJobs(jobs, slugFile(g.name));
  });
}

// ---------------------------------------------------------------- a course typed on the phone
function newCourse() {
  page("New course", `
    <p class="muted small">For a course the app does not have. Par and stroke index from the scorecard, course rating and slope from the club's handicap table. It syncs to every phone; the organiser can pull it into the course files later.</p>
    <form id="cf" class="card form open">
      <label>Club<input name="name" placeholder="e.g. Golfclub De Hoge Kleij" required></label>
      <label>Loop or course name <span class="muted">(optional)</span><input name="loop" placeholder="e.g. Championship course"></label>
      <label>Holes<select name="n"><option value="18">18</option><option value="9">9</option></select></label>
      <label>Par per hole, separated by spaces or commas<input name="par" inputmode="numeric" placeholder="4 3 5 4 3 5 5 4 4 4 4 3 4 5 4 5 3 4" required></label>
      <label>Stroke index per hole<input name="si" inputmode="numeric" placeholder="1 17 5 10 3 7 18 9 11 8 2 15 13 12 4 16 14 6" required></label>
      <label>Tee name<input name="tee" value="yellow" required></label>
      <div class="two"><label>Men's course rating<input name="cr" inputmode="decimal" placeholder="70.5"></label><label>Men's slope<input name="slope" inputmode="numeric" placeholder="128"></label></div>
      <div class="two"><label>Women's course rating<input name="wcr" inputmode="decimal" placeholder="76.2"></label><label>Women's slope<input name="wslope" inputmode="numeric" placeholder="135"></label></div>
      <label>Lengths in metres <span class="muted">(optional)</span><input name="metres" inputmode="numeric" placeholder="355 123 454 …"></label>
      <button class="btn primary" type="submit">Save course</button></form>`, { back: "#new" });
  document.getElementById("cf").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target, nums = s => s.trim() ? s.trim().split(/[\s,;]+/).map(Number) : [];
    const n = Number(f.n.value), par = nums(f.par.value), si = nums(f.si.value), metres = nums(f.metres.value);
    if (par.length !== n || par.some(p => !(p >= 3 && p <= 6))) return toast(`Par needs ${n} numbers between 3 and 6`);
    if (si.length !== n || new Set(si).size !== n || si.some(x => !(x >= 1 && x <= n))) return toast(`Stroke index needs ${n} different numbers from 1 to ${n}`);
    if (metres.length && (metres.length !== n || metres.some(x => !(x > 50)))) return toast(`Lengths need ${n} numbers or none`);
    const ratings = {};
    const cr = Number(f.cr.value.replace(",", ".")), slope = Number(f.slope.value), wcr = Number(f.wcr.value.replace(",", ".")), wslope = Number(f.wslope.value);
    if (f.cr.value && f.slope.value) ratings.m = { cr, slope };
    if (f.wcr.value && f.wslope.value) ratings.f = { cr: wcr, slope: wslope };
    if (!Object.keys(ratings).length) return toast("At least one course rating and slope is needed");
    const total = sum(par);
    for (const r_ of Object.values(ratings)) if (!(r_.cr > total - 10 && r_.cr < total + 10) || !(r_.slope >= 55 && r_.slope <= 155)) return toast("Rating or slope does not look right for this par");
    const name = f.name.value.trim(), loop = f.loop.value.trim();
    const slug = slugFile(`${name} ${loop}`).toLowerCase().replace(/_/g, "-");
    if (S.courseBy(slug)) return toast("A course with that name exists already");
    const data = { slug, name, loop, par, stroke_index: si, first_hole: 1, n, course_par: total, source: "phone", notes: ["added on a phone; ratings not checked against the club card"],
      tees: { [f.tee.value.trim() || "yellow"]: { ratings, par, metres: metres.length ? metres : null } } };
    try { prepareCourse(data); } catch (err) { return toast(err.message); }
    S.addCourse(slug, data);
    toast("Course saved on every phone");
    go("#new");
  });
}

// ---------------------------------------------------------------- scan an old scorecard
const scanState = { result: null, imageUrl: null, busy: false };

async function downscale(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = cv.convertToBlob ? await cv.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : await new Promise(res => cv.toBlob(res, "image/jpeg", 0.85));
  const b64 = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result.split(",")[1]); rd.readAsDataURL(blob); });
  return { b64, blob };
}

/** Sends the photo to the scan function; the answer is rows of names and scores for the phone to check. */
export async function scanImage(cfg, b64, mime, holes, par, names) {
  const res = await fetch(`${cfg.url}/functions/v1/scan-card`, { method: "POST", headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64, mime, holes, par, names }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `scan failed (${res.status})`);
  return data;
}

function scan() {
  const cfg = Y.config();
  const all = S.courses();
  const st = scanState;
  if (!cfg) return page("Scan a scorecard", `<div class="banner warn">Scanning needs the shared database connection (the scan service runs there). Connect in Settings first.</div>`, { back: "#new" });
  const recent = (S.state.settings.recentCourses || [])[0];
  const nWant = st.result ? st.result.holes : null;
  const courseOpts = all.filter(c => !nWant || c.n === nWant).map(c => `<option value="${esc(c.slug)}" ${c.slug === (st.result && st.result.courseSlug) || (!st.result && c.slug === recent) ? "selected" : ""}>${esc(courseTitle(c))} (${c.n})</option>`).join("");
  const players = S.players().sort((a, b) => a.name.localeCompare(b.name));
  let review_ = "";
  if (st.result) {
    const R = st.result, n = R.holes;
    review_ = `<h2>Check what was read</h2>
      <p class="muted small">Yellow cells were unsure or empty. Fix any number, pick who each row is, and untick rows that are not players.</p>
      <label>Played on<input id="sdate" type="date" value="${esc(R.date || S.today())}"></label>
      <label>Holes on the card<select id="sholes"><option value="9" ${n === 9 ? "selected" : ""}>9</option><option value="18" ${n === 18 ? "selected" : ""}>18</option></select></label>
      <label>Course<select id="scourse">${courseOpts}</select></label>
      <label>Name of the round<input id="sname" value="${esc(R.name || ((R.course ? R.course + " " : "") + (R.date || "")).trim() || "Scanned round")}"></label>
      ${R.rows.map((row, i) => {
        const known = S.findPlayer(row.name);
        return `<div class="scan-row" data-i="${i}">
          <div class="row"><label class="small" style="margin:0"><input type="checkbox" class="use" checked> Row ${i + 1}: <b>${esc(row.name || "(no name read)")}</b>${row.total !== null && row.total !== undefined ? ` <span class="muted">· total on card ${row.total}</span>` : ""}</label></div>
          <div class="two"><select class="who"><option value="">New player: ${esc(row.name || "type a name")}</option>${players.map(p => `<option value="${p.id}" ${known && known.id === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
            <input class="hi" inputmode="decimal" placeholder="index" value="${known ? esc(fmtIndex(Number(known.hi))) : ""}"></div>
          <input class="nm" placeholder="Name" value="${esc(row.name)}" style="margin-top:6px">
          <div class="cells">${row.scores.map((v, h) => `<div><small>${h + 1}</small><input inputmode="numeric" class="${row.unsure.includes(h) || v === null ? "unsure" : ""}" value="${v === null ? "" : v}" data-h="${h}"></div>`).join("")}</div>
        </div>`;
      }).join("")}`;
  }
  page("Scan a scorecard", `
    <p class="muted small">Photograph an old paper scorecard (flat, in good light). The scores are read by the scan service and shown here for you to check before the round is created.</p>
    <label class="btn primary big" style="display:flex">${st.busy ? "Reading the card…" : st.result ? "Scan another photo" : "Take or choose a photo"}<input id="photo" type="file" accept="image/*" capture="environment" hidden ${st.busy ? "disabled" : ""}></label>
    ${st.imageUrl ? `<img class="scan-prev" src="${st.imageUrl}" alt="scorecard">` : ""}
    ${review_}`,
  { back: "#new", bar: st.result ? `<button class="btn primary" data-act="scan-create">Create round ›</button>` : "" });
  document.getElementById("photo").addEventListener("change", async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    st.busy = true; st.result = null;
    if (st.imageUrl) URL.revokeObjectURL(st.imageUrl);
    scan();
    try {
      const { b64, blob } = await downscale(f);
      st.imageUrl = URL.createObjectURL(blob);
      scan();
      const course = all.find(c => c.slug === recent) || all[0];
      const data = await scanImage(cfg, b64, "image/jpeg", course.n, course.par, S.players().map(p => p.name));
      const fits = all.filter(c => c.n === data.holes);
      const guess = data.course ? fits.find(c => (c.name + " " + c.loop).toLowerCase().includes(String(data.course).toLowerCase().split(" ")[0])) : null;
      st.result = { ...data, courseSlug: (guess || fits.find(c => c.slug === recent) || fits[0] || course).slug };
    } catch (err) { toast(`Scan failed: ${err.message}`, 6000); }
    st.busy = false;
    scan();
  });
  const sh = document.getElementById("sholes");
  if (sh) sh.addEventListener("change", () => {
    const n2 = Number(sh.value);
    st.result.holes = n2;
    for (const row of st.result.rows) { row.scores = Array.from({ length: n2 }, (_, h) => row.scores[h] ?? null); row.unsure = row.unsure.filter(h => h < n2); }
    st.result.courseSlug = (all.find(c => c.n === n2 && c.slug === recent) || all.find(c => c.n === n2) || {}).slug;
    scan();
  });
  bind(ev => {
    const b = ev.target.closest("[data-act=scan-create]");
    if (!b || !st.result) return;
    const course = all.find(c => c.slug === document.getElementById("scourse").value);
    const date = document.getElementById("sdate").value || S.today();
    const rows = [...document.querySelectorAll(".scan-row")].filter(el => el.querySelector(".use").checked);
    if (!rows.length) return toast("Tick at least one player row");
    const entries = [];
    for (const el of rows) {
      const pid = el.querySelector(".who").value;
      const known = pid ? S.players().find(p => p.id === pid) : null;
      const name = known ? known.name : el.querySelector(".nm").value.trim();
      const hi = parseHI(el.querySelector(".hi").value) ;
      if (!name) return toast("Every row needs a name");
      if (!(hi >= -10 && hi <= 54)) return toast(`${name}: handicap index between +10 and 54`);
      const scores = [...el.querySelectorAll(".cells input")].map(inp => inp.value.trim() === "" ? null : Number(inp.value));
      if (scores.length !== course.n) return toast(`${name}: this card has ${scores.length} holes, the course ${course.n}; pick the matching course`);
      if (scores.some(v => v !== null && !(Number.isInteger(v) && v >= 0 && v <= 30))) return toast(`${name}: scores must be whole numbers 0 to 30`);
      if (entries.some(x => S.nameKey(x.name) === S.nameKey(name))) return toast(`${name} appears twice; untick one row or pick another player`);
      entries.push({ name, hi, gender: known ? known.gender : "m", scores });
    }
    const r = S.createRound({ course: course.slug, name: document.getElementById("sname").value.trim() || "Scanned round", date, defaultTee: Object.keys(course.tees).includes("yellow") ? "yellow" : Object.keys(course.tees)[0], allowance: 100 });
    for (const x of entries) {
      const e = S.addEntry(r, course.n, { name: x.name, hi: x.hi, tee: r.defaultTee, gender: x.gender, courseHandicap: null });
      x.scores.forEach((v, h) => { if (v !== null) S.setScore(r, e, h, v); });
    }
    r.status = "done";
    S.saveRound(r);
    st.result = null;
    if (st.imageUrl) { URL.revokeObjectURL(st.imageUrl); st.imageUrl = null; }
    go(`#review/${r.id}`);
  });
}

// ---------------------------------------------------------------- settings: who am I, sync, invite, backup, courses, danger zone
function settings() {
  const cfg = Y.config() || { url: "", anonKey: "", label: "" };
  const done = S.rounds().filter(r => r.status === "done");
  const st = Y.sync;
  const status = st.status === "off" ? "Solo phone, not connected" : st.status === "error" ? `Problem: ${st.error}` : st.status === "syncing" ? "Syncing…" : `Synced with ${cfg.label || "the shared database"}${st.lastPull ? " · last check " + st.lastPull.slice(11, 16) : ""}`;
  const me = S.me();
  const base = location.origin + location.pathname;
  const invite = Y.enabled() ? Y.joinLink(base, false) : null;
  const inviteOrg = Y.enabled() ? Y.joinLink(base, true) : null;
  const phoneCourses = S.state.courses.filter(c => !c.deleted && (c.source || "phone") === "phone");
  page("Settings", `
    <h2>This phone</h2>
    <div class="card"><div class="row"><div><div class="name">${me ? esc(me.name) : "Nobody yet"}</div><div class="muted small">${me ? "your results show on the home screen" : "say who you are for a personal home screen"}</div></div><a class="btn small" href="#welcome">Change</a></div>
      <label class="checks" style="margin-top:10px"><input type="checkbox" id="orgtoggle" ${organiser() ? "checked" : ""}> Organiser on this phone <span class="muted">&nbsp;(can delete rounds and leagues)</span></label></div>
    <h2>Shared database</h2>
    <div class="card"><div class="name">${esc(status)}</div>
      ${invite ? `<p class="muted small">Invite another phone: let them scan this code or send them the link. It connects them to ${esc(cfg.label || "this database")} and asks who they are.</p>
        <canvas class="qr" id="qr" width="220" height="220"></canvas>
        <div class="two"><button class="btn" data-act="share-link" data-link="${esc(invite)}">Share join link</button><button class="btn" data-act="share-link" data-link="${esc(inviteOrg)}">Organiser link</button></div>` : ""}
      <details style="margin-top:10px"><summary class="muted small">${DATA.sync ? "Connection details (only change to use another database)" : "Connect to a database"}</summary>
      <form id="syncf">
        <label>Supabase project URL<input name="url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocorrect="off"></label>
        <label>Anon key<input name="anonKey" value="${esc(cfg.anonKey)}" placeholder="eyJ…" autocapitalize="off" autocorrect="off"></label>
        <label>Name of the society<input name="label" value="${esc(cfg.label || "")}" placeholder="e.g. Apeliotes"></label>
        <div class="two"><button class="btn primary" type="submit">Test and save</button><button class="btn" type="button" data-act="sync-now">Sync now</button></div>
        ${DATA.sync && !Y.isDefault() ? `<button class="btn small" type="button" data-act="sync-default">Back to the built-in connection</button>` : ""}
      </form></details></div>
    <h2>Courses</h2>
    <div class="card"><div class="muted small">${S.courses().length} courses; ${plural(phoneCourses.length, "course")} added on phones${phoneCourses.length ? ": " + phoneCourses.map(c => esc(c.data.name)).join(", ") : ""}.</div>
      <a class="btn small" href="#newcourse" style="margin-top:8px">Add a course</a></div>
    ${S.state.quarantine.length ? `<h2>Refused by the server</h2><div class="card"><div class="muted small">${S.state.quarantine.slice(-5).map(q => `${esc(q.table)} · ${esc(q.reason)}`).join("<br>")}</div>
      <button class="btn small danger" data-act="clear-q" style="margin-top:8px">Clear this list</button></div>` : ""}
    <h2>Backup</h2>
    <div class="card"><div class="muted small">${S.players().length} players · ${S.rounds().length} rounds · ${S.leagues().length} leagues${S.state.settings.lastExport ? ` · last export ${S.state.settings.lastExport.slice(0, 16).replace("T", " ")}` : ""}</div>
      <div class="two"><button class="btn primary" data-act="export">Export backup</button><label class="btn">Import backup<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
    <h2>For the desktop kit</h2>
    <p class="muted small">A round as tournament.yaml: put it in tournaments/&lt;slug&gt;/ on the computer and run python golf.py render.</p>
    ${done.map(r => `<div class="card row"><div><div class="name">${esc(r.name)}</div><div class="muted small">${esc(r.date || "")}</div></div><button class="btn small" data-act="yaml" data-rid="${r.id}">tournament.yaml</button></div>`).join("") || `<p class="muted center">No finished rounds yet.</p>`}
    ${organiser() ? `<h2>Danger zone</h2>${S.rounds().map(r => `<div class="card row"><div><div class="name">${esc(r.name)}</div><div class="muted small">${roundStatus(r)}</div></div><button class="btn small danger" data-act="del-round" data-rid="${r.id}">Delete</button></div>`).join("")}` : ""}`);
  if (invite && window.qrcode) {
    try {
      const q = window.qrcode(0, "M"); q.addData(invite); q.make();
      const cv = document.getElementById("qr"), ctx = cv.getContext("2d"), N = q.getModuleCount(), cell = 200 / N;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 220, 220); ctx.fillStyle = "#000";
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (q.isDark(y, x)) ctx.fillRect(10 + x * cell, 10 + y * cell, cell + 0.5, cell + 0.5);
    } catch (e) { console.warn("qr", e); }
  }
  document.getElementById("orgtoggle").addEventListener("change", ev => { S.setSetting("organiser", ev.target.checked); settings(); });
  document.getElementById("syncf").addEventListener("submit", async ev => {
    ev.preventDefault();
    const c = { url: ev.target.url.value.trim(), anonKey: ev.target.anonKey.value.trim(), label: ev.target.label.value.trim() };
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
    if (b.dataset.act === "share-link") {
      const link = b.dataset.link;
      if (navigator.share) { try { await navigator.share({ title: "Join Hagolf", text: `Join ${cfg.label || "our golf society"} in Hagolf`, url: link }); return; } catch (e) { if (e.name === "AbortError") return; } }
      try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch (e) { prompt("Copy this link", link); }
    }
    if (b.dataset.act === "sync-now") { await Y.pushAndPull(); toast(Y.sync.status === "error" ? `Sync problem: ${Y.sync.error}` : "Synced"); settings(); }
    if (b.dataset.act === "sync-default") { Y.setConfig(null); settings(); }
    if (b.dataset.act === "clear-q") { S.state.quarantine = []; S.save(); settings(); }
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
  if (act === "pick-course") go(`#new/${b.dataset.slug}`);
  if (act === "create-round") {
    const c = courseBy(b.dataset.slug);
    const tees = Object.keys(c.tees);
    const name = document.getElementById("rname") ? document.getElementById("rname").value.trim() : "";
    const r = S.createRound({ course: b.dataset.slug, name: name || `${c.loop || c.name} ${S.today()}`,
      date: document.getElementById("rdate") ? document.getElementById("rdate").value : S.today(),
      defaultTee: document.getElementById("rtee") ? document.getElementById("rtee").value : (tees.includes("yellow") ? "yellow" : tees[0]),
      allowance: document.getElementById("rallow") ? document.getElementById("rallow").value : 100 });
    document.querySelectorAll("input[name=lg]:checked").forEach(i => { S.setLeagueRound(i.value, r.id, true); S.state.settings.lastLeague = i.value; });
    const me = S.me();
    if (me) S.addEntry(r, c.n, { name: me.name, hi: me.hi, tee: r.defaultTee, gender: me.gender || "m", courseHandicap: null });
    S.save();
    go(`#players/${r.id}`);
  }
  if (act === "toggle-add") { const f = document.getElementById("addf"); f.classList.add("open"); b.classList.add("hidden"); document.getElementById("pname").focus(); f.scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (act === "remove-entry") {
    const rid = location.hash.split("/")[1], r = S.getRound(rid), i = Number(b.dataset.i), e = r.entries[i];
    if (e.scores.every(s => s === null) || confirm(`Remove ${e.name} and their scores from this round?`)) { S.removeEntry(r, i); players(rid); }
  }
  if (act === "start-scoring") { const r = S.getRound(b.dataset.rid); go(`#score/${r.id}/${S.holeOf(r)}`); }
  if (act === "del-player") { if (confirm("Delete this player on every phone?")) { S.deletePlayer(b.dataset.id); roster(); } }
  if (act === "update") { if (window.__updateWorker) window.__updateWorker.postMessage("skipWaiting"); }
  if (act === "install" && window.__installPrompt) { window.__installPrompt.prompt(); window.__installPrompt = null; }
});

const screens = { home, welcome, join, new: newRound, players, score, review, attach, graphics, roster, leagues, league, leagueposter: leaguePoster, settings, newcourse: newCourse, scan,
  skipme: () => { S.state.settings.welcomed = true; S.save(); go("#home"); } };

function route() {
  const t = document.getElementById("toast");
  if (t && !t.classList.contains("action")) t.classList.remove("show");
  const [name, ...args] = location.hash.replace(/^#/, "").split("/");
  ui.expanded = name === "review" ? ui.expanded : null;
  (screens[name] || home)(...args.map(decodeURIComponent));
}

function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream; }
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }

// other phones' changes: redraw the current screen, unless the user is typing, scoring, or looking at rendered images
Y.onChange(({ changed, status }) => {
  const typing = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  const busy = document.querySelector(".thumbs, .progress") || location.hash.startsWith("#score/") || location.hash.startsWith("#join/");
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
Y.start();
route();
