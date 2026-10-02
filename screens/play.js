// Rounds: every round this phone can see, and the way into a new one -- the club by place, then the loop, then
// the round's few options.
import * as S from "../store.js";
import * as A from "../auth.js";
import { page, scrollPos, scrollAt, bind, esc, go, ui, plural, fmtDate, courseTitle, courseBy, roundStatus, resumeHash, roundWhere, roundClub, roundLoop, safeCompute, tip, ICONS, emptyState, firstName, ordinal, sheet } from "../ui.js";
import { compute } from "../model.js";
import { nowCard } from "./home.js";

// ---------------------------------------------------------------- the list
export function play() {
  const me = S.me();
  const rounds = S.rounds();
  const open = rounds.filter(r => r.status !== "done");
  const finished = rounds.filter(r => r.status === "done");
  const shared = S.sharedWithMe();
  const f = ui.roundsFilter;
  const shown = f === "mine" ? finished.filter(r => S.iPlayed(r)) : f === "shared" ? finished.filter(r => shared.has(r.id)) : finished;
  const q = (ui.search || "").toLowerCase().trim();
  const hit = r => !q || [fmtDate(r.date), roundWhere(r), r.name, ...r.entries.map(e => e.name)].join(" ").toLowerCase().includes(q);
  const row = r => {
    const M = safeCompute(compute, r);
    const mine = M && me ? M.players.find(x => x.id === me.id) : null;
    const loop = roundLoop(r);
    return `<a class="rround" href="${resumeHash(r)}"><div class="d">${esc(fmtDate(r.date))}${shared.has(r.id) ? ` <span class="pill">shared with you</span>` : ""}</div><div class="name">${esc(roundClub(r))}</div>
      ${loop ? `<div class="loop">${esc(loop)}</div>` : ""}
      <div class="who">${r.entries.map(e => `<span class="${me && e.playerId === me.id ? "me" : ""}">${esc(e.name)}</span>`).join("")}</div>
      ${mine ? `<div class="muted small" style="margin-top:6px">You: ${mine.pts} pts · ${ordinal(mine.splace)} of ${M.field}</div>` : ""}</a>`;
  };
  const list = shown.filter(hit);
  page("Rounds", `
    <a class="btn primary big" href="#new">${ICONS.plus} Start a round</a>
    <div class="btnrow" style="margin-top:0"><a class="btn small" href="#scan">${ICONS.camera} Scan a paper card</a></div>
    ${open.length ? `<h2>Playing now</h2>${open.map(nowCard).join("")}` : ""}
    ${finished.length ? `<h2>Finished rounds</h2>
      <div class="filter"><button data-act="rf" data-v="all" class="${f === "all" ? "on" : ""}">All</button><button data-act="rf" data-v="mine" class="${f === "mine" ? "on" : ""}">Mine</button><button data-act="rf" data-v="shared" class="${f === "shared" ? "on" : ""}">Shared with me</button></div>
      ${finished.length > 6 ? `<input id="q" class="search" placeholder="Search by date, course or player" value="${esc(ui.search || "")}" autocomplete="off">` : ""}
      ${list.length ? `<div class="list">${list.map(row).join("")}</div>` : `<p class="muted center">Nothing here.</p>`}`
      : (open.length ? "" : emptyState("golf", "No rounds yet", "Start one, or scan an old paper card."))}`,
    { back: "", tabs: "play", brand: false });
  const qEl = document.getElementById("q");
  if (qEl) qEl.addEventListener("input", () => { ui.search = qEl.value; const y = scrollPos(); play(); scrollAt(y); const n = document.getElementById("q"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
  bind(ev => {
    const b = ev.target.closest("[data-act=rf]");
    if (b) { ui.roundsFilter = b.dataset.v; play(); }
  });
}

// ---------------------------------------------------------------- where the clubs are
const REGION = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const countryName = code => { try { return (REGION && REGION.of(String(code).toUpperCase())) || code; } catch { return code; } };
export const placeOf = w => [w && w.town, w && w.country ? countryName(w.country) : ""].filter(Boolean).join(", ");

function kmApart(a, b) {
  const r = Math.PI / 180, R = 6371;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function clubList() {
  const out = new Map();
  for (const c of S.courses()) {
    if (!out.has(c.name)) out.set(c.name, { name: c.name, where: null, courses: [] });
    const club = out.get(c.name);
    club.courses.push(c);
    if (!club.where && c.where && (c.where.lat || c.where.town)) club.where = c.where;
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const here = { lat: null, lng: null, asked: false, denied: false };

export function askWhereIAm(then) {
  if (!navigator.geolocation) { here.denied = true; return then(); }
  here.asked = true;
  then();
  navigator.geolocation.getCurrentPosition(
    p => { here.lat = p.coords.latitude; here.lng = p.coords.longitude; here.denied = false; then(); },
    () => { here.denied = true; here.asked = false; then(); },
    { timeout: 8000, maximumAge: 300000 });
}

// ---------------------------------------------------------------- nines
const ninesOf = club => S.courses().filter(c => c.name === club && (c.nines || []).length === 1);
const comboOf = (club, a, b) => S.courses().find(c => c.name === club && (c.nines || []).length === 2 && c.nines[0] === a && c.nines[1] === b) || null;
export const nineName = slug => { const c = courseBy(slug); return c ? (c.loop || c.name).replace(/, 9 holes$/, "") : slug; };

export function loops(club) {
  const nines = ninesOf(club);
  if (!nines.length) return clubCourses(club);
  const st = ui.loops.club === club ? ui.loops : (ui.loops = { club, holes: 18, first: null });
  const chip = (c, on, act) => `<button class="pchip ${on ? "on" : ""}" data-act="${act}" data-slug="${esc(c.slug)}">${esc(nineName(c.slug))}<small>par ${c.course_par}</small></button>`;
  const derivedChip = (c, first) => {
    const combo = comboOf(club, first, c.slug);
    const why = combo && (combo.notes || []).length ? combo.notes.join("; ") : "";
    return `<button class="pchip" data-act="pick-second" data-slug="${esc(c.slug)}">${esc(nineName(c.slug))}<small>par ${combo ? combo.course_par : c.course_par}${why ? " · worked out" : ""}</small></button>`;
  };
  let body;
  if (st.holes === 9) {
    body = `<h2>Which nine did you walk?</h2><div class="chips-wrap">${nines.map(c => chip(c, false, "pick-nine")).join("")}</div>`;
  } else if (!st.first) {
    body = `<h2>Which nine first?</h2><div class="chips-wrap">${nines.map(c => chip(c, false, "pick-first")).join("")}</div>`;
  } else {
    const rest = nines.filter(c => c.slug !== st.first);
    const missing = rest.filter(c => !comboOf(club, st.first, c.slug));
    body = `<h2>Started on ${esc(nineName(st.first))}</h2>
      <div class="chips-wrap">${chip(courseBy(st.first), true, "clear-first")}</div>
      <h2>Then which nine?</h2>
      <div class="chips-wrap">${rest.filter(c => comboOf(club, st.first, c.slug)).map(c => derivedChip(c, st.first)).join("")}</div>
      ${rest.some(c => { const x = comboOf(club, st.first, c.slug); return x && (x.notes || []).length; })
        ? `<p class="muted small">"Worked out" means the club does not publish that order: its rating or its stroke index was derived here. Fine for a society round; check the card in the clubhouse before a competition.</p>` : ""}
      ${missing.length ? `<p class="muted small">No card for ${esc(nineName(st.first))} then ${missing.map(c => esc(nineName(c.slug))).join(" or ")}.</p>` : ""}`;
  }
  page(club, `
    <div class="filter"><button data-act="holes" data-v="9" class="${st.holes === 9 ? "on" : ""}">9 holes</button><button data-act="holes" data-v="18" class="${st.holes === 18 ? "on" : ""}">18 holes</button></div>
    ${body}
    ${tip(`<p>This club has ${plural(nines.length, "loop")} of nine holes, which makes ${nines.length * (nines.length - 1)} ways of walking 18: the order matters, because each combination has its own stroke index and its own course rating, and so its own handicap strokes.</p>
      <p>Say which nine you started on and which you went out on second, and the app picks the right card. Afterwards the round is split back into its two nines for the statistics.</p>`, "Why the order matters")}`,
    { back: "#new", sub: `${plural(nines.length, "nine")} · 9 or 18 holes` });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "holes") { st.holes = Number(b.dataset.v); st.first = null; return loops(club); }
    if (act === "clear-first") { st.first = null; return loops(club); }
    if (act === "pick-first") { st.first = b.dataset.slug; return loops(club); }
    if (act === "pick-nine") return go(`#new/${b.dataset.slug}`);
    if (act === "pick-second") { const c = comboOf(club, st.first, b.dataset.slug); if (c) go(`#new/${c.slug}`); }
  });
}

function clubCourses(club) {
  const cs = S.courses().filter(c => c.name === club);
  if (!cs.length) return go("#new");
  if (cs.length === 1) return go(`#new/${cs[0].slug}`);
  const w = (cs.find(c => c.where) || {}).where;
  page(club, `<div class="list">${cs.map(c => `<button class="course" data-act="pick-course" data-slug="${esc(c.slug)}">
      <div><div class="name">${esc(c.loop || c.name)}</div><div class="muted small">${c.n} holes · par ${c.course_par} · ${Object.keys(c.tees).join(", ")} tees</div></div><span class="chev">›</span></button>`).join("")}</div>`,
    { back: "#new", sub: w ? placeOf(w) : "" });
  bind(ev => { const b = ev.target.closest("[data-act=pick-course]"); if (b) go(`#new/${b.dataset.slug}`); });
}

// ---------------------------------------------------------------- new round: play again, or find the club
const shortDate = d => { const t = d ? new Date(d + "T12:00:00") : null; return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };

/** The courses this phone has played, newest first, with the date of that round; then any it only started. */
function playedBefore(limit = 6) {
  const when = new Map();
  for (const r of S.rounds()) if (!when.has(r.course)) when.set(r.course, r.date || "");
  for (const s of S.state.settings.recentCourses || []) if (!when.has(s)) when.set(s, "");
  const all = S.courses();
  return [...when].map(([slug, date]) => ({ c: all.find(x => x.slug === slug), date })).filter(x => x.c).slice(0, limit);
}

export function newRound(slug = null) {
  if (slug === "unlisted") return unlistedForm();
  if (slug) return roundForm(slug);
  const clubs = clubList();
  const near = here.lat !== null;
  const count = new Map();
  for (const c of clubs) { const k = (c.where && c.where.country) || ""; count.set(k, (count.get(k) || 0) + 1); }
  const codes = [...count.keys()].sort((a, b) => (a ? countryName(a) : "zz").localeCompare(b ? countryName(b) : "zz"));
  let scope = ui.courseScope || "all";
  if (scope.startsWith("c:") && !count.has(scope.slice(2))) scope = "all";
  if (scope === "near" && here.denied) scope = "all";
  ui.courseScope = scope;
  const oneCountry = codes.length < 2;

  // the strip: the courses played before, straight to the round form, no club and no loop to pick again
  const rec = playedBefore();
  const tile = ({ c, date }) => `<button class="rec" data-act="pick-course" data-slug="${esc(c.slug)}">
    <b>${esc(c.name)}</b><span>${esc(c.loop || `${c.n} holes`)}</span>
    <small>${date ? `Last played ${esc(shortDate(date))}` : `${c.n} holes · par ${c.course_par}`}</small></button>`;

  // the bar: near me, everywhere, or one country -- so the list below is never a stack of headings
  const chip = (v, label, n = 0) => `<button data-act="scope" data-v="${v}" class="${scope === v ? "on" : ""}">${esc(label)}${n ? `<i>${n}</i>` : ""}</button>`;
  const bar = `<div class="scopes" id="scopes">
    ${navigator.geolocation && !here.denied ? chip("near", near ? "Near me" : here.asked ? "Finding you…" : "Near me") : ""}
    ${chip("all", oneCountry ? "All clubs" : "Everywhere", clubs.length)}
    ${oneCountry ? "" : codes.map(cc => chip(`c:${cc}`, cc ? countryName(cc) : "Elsewhere", count.get(cc))).join("")}</div>`;

  // every club is drawn once and hidden by the bar or the search, so typing never rebuilds the page under the cursor
  const clubRow = club => {
    const k = ninesOf(club.name).length;
    const what = k >= 2 ? `${plural(k, "nine")} · 9 or 18 holes`
      : club.courses.length === 1 ? `${club.courses[0].n} holes · par ${club.courses[0].course_par}` : plural(club.courses.length, "course");
    const w = club.where, cc = (w && w.country) || "";
    const place = scope.startsWith("c:") ? (w && w.town) || "" : placeOf(w);
    const away = near && w && w.lat ? `${Math.round(kmApart(here, w))} km` : "";
    return `<button class="course" data-act="pick-club" data-club="${esc(club.name)}" data-cc="${esc(cc)}"
      data-q="${esc((club.name + " " + placeOf(w) + " " + cc + " " + club.courses.map(c => c.loop).join(" ")).toLowerCase())}">
      <div><div class="name">${esc(club.name)}</div><div class="muted small">${place ? esc(place) + " · " : ""}${what}</div></div>
      ${away ? `<span class="away num">${esc(away)}</span>` : ""}<span class="chev">›</span></button>`;
  };
  const sorted = scope === "near" && near
    ? [...clubs].sort((a, b) => {
      const da = a.where && a.where.lat ? kmApart(here, a.where) : Infinity, db = b.where && b.where.lat ? kmApart(here, b.where) : Infinity;
      return da - db || a.name.localeCompare(b.name);
    })
    : clubs;

  page("Where are you playing?", `
    ${rec.length ? `<h2>Play again</h2><div class="recents">${rec.map(tile).join("")}</div><h2>Any club</h2>` : ""}
    <input id="q" class="search" placeholder="Search club, town or country" value="${esc(ui.courseQ || "")}" autocomplete="off">
    ${bar}
    <div class="list" style="margin:0 0 6px;border-bottom:1px solid var(--line)"><a href="#scan"><span class="lead">${ICONS.camera}<div><div class="name">Scan an old scorecard</div><div class="muted small">Photograph a paper card; the scores are read for you to check</div></div></span><span class="chev">›</span></a></div>
    ${here.denied ? `<p class="muted small center" style="margin:8px 0 0">Location is off for this app. Search, or pick a country.</p>` : ""}
    <p id="qall" class="muted small center" style="margin:8px 0 0" hidden>Searching every club.</p>
    <div class="list" id="courses">${sorted.map(clubRow).join("")}</div>
    <p id="cnone" class="muted center" hidden>Nothing matches. Play it as an unlisted course.</p>
    <div class="list" style="margin-top:20px"><a href="#new/unlisted"><span class="lead">${ICONS.plus}<div><div class="name">Course not listed? Play it anyway</div><div class="muted small">Fill in each hole's par as you play it</div></div></span><span class="chev">›</span></a></div>`,
    { back: "#play" });

  const q = document.getElementById("q");
  const apply = () => {
    const t = (ui.courseQ || "").toLowerCase().trim();
    let shown = 0;
    document.querySelectorAll("#courses .course").forEach(b => {
      // a search looks everywhere, because the club you are hunting for is often the one outside the filter
      const on = t ? (b.dataset.q || "").includes(t) : (!scope.startsWith("c:") || b.dataset.cc === scope.slice(2));
      b.style.display = on ? "" : "none";
      if (on) shown++;
    });
    document.getElementById("courses").hidden = !shown;
    document.getElementById("cnone").hidden = !!shown;
    document.getElementById("qall").hidden = !t || !scope.startsWith("c:");
  };
  q.addEventListener("input", () => { ui.courseQ = q.value; apply(); });
  apply();
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "scope") {
      const v = b.dataset.v;
      if (v === "near" && !near) return askWhereIAm(() => { ui.courseScope = "near"; if (location.hash === "#new") newRound(); });
      ui.courseScope = v;
      return newRound();
    }
    if (act === "pick-course") return go(`#new/${b.dataset.slug}`);
    if (act === "pick-club") return go(`#loops/${encodeURIComponent(b.dataset.club)}`);
  });
}

/** I am on my own card from the start, provided the app knows what I play off; otherwise the players screen asks. */
function addMe(r, c, tees) {
  const me = S.me();
  if (me && S.currentIndex(me) !== null && S.currentIndex(me) !== undefined) S.addEntry(r, c.n, { name: me.name, hi: S.currentIndex(me), tee: S.lastTee(me.id, r.course, tees) || r.defaultTee, gender: me.gender || "m", courseHandicap: null });
}

// No yardages, no stroke index, no rating: the pars are filled in on the course, and the round's name says where it was.
function unlistedForm() {
  const st = ui.unlisted || (ui.unlisted = { holes: 18 });
  page("Unlisted course", `
    <div class="filter"><button data-act="holes" data-v="9" class="${st.holes === 9 ? "on" : ""}">9 holes</button><button data-act="holes" data-v="18" class="${st.holes === 18 ? "on" : ""}">18 holes</button></div>
    <div class="card">
      <label style="margin-top:0">Name of the round <span class="muted">(optional)</span><input id="rname" value="${esc(st.name || "")}" placeholder="The course, or anything you like"></label>
      <label>Date<input id="rdate" type="date" value="${S.today()}"></label>
    </div>
    ${tip(`<p>You fill in the par of each hole on the course, and everyone's score on it after that, the same as any round.</p>
      <p>With no course rating, everyone's course handicap is simply their index (half of it over nine holes). Gross and net come out exact. With no stroke index, the strokes fall on the holes in order, so the points on a single hole mean little, but the total is right unless someone scores nothing on a hole.</p>`, "What you get without a card")}`,
  { back: "#new", bar: `<button class="btn primary" data-act="create-unlisted">Next: who is playing ›</button>` });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    st.name = document.getElementById("rname").value;
    if (b.dataset.act === "holes") { st.holes = Number(b.dataset.v); return unlistedForm(); }
    if (b.dataset.act !== "create-unlisted") return;
    const r = S.createUnlistedRound({ name: st.name.trim() || "Unlisted course", date: document.getElementById("rdate").value || S.today(), holes: st.holes });
    ui.unlisted = null;
    addMe(r, courseBy(r.course), [r.defaultTee]);
    S.save();
    go(`#players/${r.id}`);
  });
}

function roundForm(slug) {
  const c = courseBy(slug);
  if (!c) { go("#new"); return; }
  const tees = Object.keys(c.tees);
  const dflt = tees.includes("yellow") ? "yellow" : tees[0];
  const date = S.today();
  const last = S.state.settings.lastLeague;
  page("New round", `
    <div class="card"><div class="row"><div><div class="name">${esc(courseTitle(c))}</div><div class="muted small">${c.n} holes · par ${c.course_par}</div></div><a class="btn small" href="#new">Change</a></div>
      ${(c.notes || []).length ? `<div class="warn small" style="margin-top:6px">${esc(c.notes.join("; "))}</div>` : ""}</div>
    <div class="card">
      <label style="margin-top:0">Name of the round<input id="rname" value="${esc(c.name + " " + date)}"></label>
      <div class="two"><label>Date<input id="rdate" type="date" value="${date}"></label>
      <label>Tee <span class="muted">(anyone new to the course)</span><select id="rtee">${tees.map(t => `<option ${t === dflt ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <label>Handicap allowance<select id="rallow"><option value="100">100% (society default)</option><option value="95">95% (WHS individual Stableford)</option><option value="90">90%</option></select></label>
    </div>
    ${tip(`<p>Everyone's course handicap is worked out from their index and this course's rating first. The allowance is the slice of that handicap they actually play off, and it applies to everybody equally.</p>
      <p>100% is the ordinary society round. The World Handicap System asks for 95% in an individual Stableford competition, and a big or strong field is sometimes cut to 90%.</p>`, "What is a handicap allowance?")}
    ${S.leagues().length ? `<div class="card checks"><h2>Counts for</h2>${S.leagues().map(g => `<label><input type="checkbox" name="lg" value="${g.id}" ${g.id === last ? "checked" : ""}> ${esc(g.name)}</label>`).join("")}</div>` : ""}`,
  { back: "#new", bar: `<button class="btn primary" data-act="create-round" data-slug="${esc(slug)}">Next: who is playing ›</button>` });
  bind(ev => {
    const b = ev.target.closest("[data-act=create-round]");
    if (!b) return;
    const name = document.getElementById("rname").value.trim();
    const r = S.createRound({ course: slug, name: name || `${c.name} ${S.today()}`, date: document.getElementById("rdate").value || S.today(),
      defaultTee: document.getElementById("rtee").value, allowance: document.getElementById("rallow").value });
    document.querySelectorAll("input[name=lg]:checked").forEach(i => { S.setLeagueRound(i.value, r.id, true); S.state.settings.lastLeague = i.value; });
    addMe(r, c, tees);
    S.save();
    go(`#players/${r.id}`);
  });
}
