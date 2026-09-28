// Play: every round this phone can see, and the way into a new one -- the club by place, then the loop, then
// the round's few options.
import * as S from "../store.js";
import * as A from "../auth.js";
import { page, bind, esc, go, ui, plural, fmtDate, courseTitle, courseBy, roundStatus, resumeHash, roundWhere, safeCompute, tip, ICONS, emptyState, firstName, ordinal, sheet } from "../ui.js";
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
    return `<a class="rround" href="${resumeHash(r)}"><div class="d">${esc(fmtDate(r.date))}${shared.has(r.id) ? ` <span class="pill">shared with you</span>` : ""}</div><div class="name">${esc(roundWhere(r))}</div>
      <div class="who">${r.entries.map(e => `<span class="${me && e.playerId === me.id ? "me" : ""}">${esc(e.name)}</span>`).join("")}</div>
      ${mine ? `<div class="muted small" style="margin-top:6px">You: ${mine.pts} pts · ${ordinal(mine.splace)} of ${M.field}</div>` : ""}</a>`;
  };
  const list = shown.filter(hit);
  page("Play", `
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
  if (qEl) qEl.addEventListener("input", () => { ui.search = qEl.value; const y = window.scrollY; play(); window.scrollTo(0, y); const n = document.getElementById("q"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
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

// ---------------------------------------------------------------- new round
export function newRound(slug = null) {
  if (slug) return roundForm(slug);
  const all = S.courses();
  const recent = (S.state.settings.recentCourses || []).map(s => all.find(c => c.slug === s)).filter(Boolean);
  const clubs = clubList();
  const near = here.lat !== null;
  const row = c => `<button class="course" data-act="pick-course" data-slug="${esc(c.slug)}" data-q="${esc((c.name + " " + c.loop).toLowerCase())}">
    <div><div class="name">${esc(c.loop || c.name)}</div><div class="muted small">${c.n} holes · par ${c.course_par} · ${Object.keys(c.tees).join(", ")} tees${c.source === "phone" ? " · added on a phone" : ""}</div></div><span class="chev">›</span></button>`;
  const clubRow = club => {
    const k = ninesOf(club.name).length;
    const what = k >= 2 ? `${plural(k, "nine")} · 9 or 18 holes · ${k * (k - 1)} ways round`
      : club.courses.length === 1 ? `${club.courses[0].n} holes · par ${club.courses[0].course_par}` : plural(club.courses.length, "course");
    const w = club.where, place = placeOf(w);
    const away = near && w && w.lat ? `${Math.round(kmApart(here, w))} km · ` : "";
    return `<button class="course" data-act="pick-club" data-club="${esc(club.name)}" data-q="${esc((club.name + " " + place + " " + club.courses.map(c => c.loop).join(" ")).toLowerCase())}">
      <div><div class="name">${esc(club.name)}</div><div class="muted small">${esc(away)}${place ? esc(place) + " · " : ""}${what}</div></div><span class="chev">›</span></button>`;
  };
  const list = cs => `<div class="list">${cs.map(clubRow).join("")}</div>`;
  let body;
  if (near) {
    const sorted = [...clubs].sort((a, b) => {
      const da = a.where && a.where.lat ? kmApart(here, a.where) : Infinity, db = b.where && b.where.lat ? kmApart(here, b.where) : Infinity;
      return da - db || a.name.localeCompare(b.name);
    });
    body = `<h2>Nearest first</h2>${list(sorted)}`;
  } else {
    const byCountry = new Map();
    for (const c of clubs) { const key = (c.where && c.where.country) || ""; if (!byCountry.has(key)) byCountry.set(key, []); byCountry.get(key).push(c); }
    body = [...byCountry].sort((a, b) => (a[0] ? countryName(a[0]) : "zz").localeCompare(b[0] ? countryName(b[0]) : "zz"))
      .map(([code, cs]) => `<h2>${esc(code ? countryName(code) : "Somewhere else")}</h2>` +
        list(cs.sort((a, b) => ((a.where || {}).town || "").localeCompare(((b.where || {}).town) || "") || a.name.localeCompare(b.name)))).join("");
  }
  const nearBtn = near ? `<button class="btn small on" data-act="clear-near">Nearest first ✓</button>`
    : here.asked ? `<button class="btn small" disabled>Finding you…</button>` : `<button class="btn small" data-act="near">Near me</button>`;
  page("Where are you playing?", `
    <input id="q" class="search" placeholder="Search club, town or country" autocomplete="off">
    <p class="center" style="margin:-4px 0 10px">${nearBtn}${here.denied ? ` <span class="muted small">location off; search instead</span>` : ""}</p>
    <div id="courses">${recent.length ? `<h2>Recent</h2><div class="list">${recent.map(row).join("")}</div>` : ""}${body}</div>
    <div class="list" style="margin-top:20px"><a href="#newcourse"><span class="lead">${ICONS.plus}<div><div class="name">Club not here? Add it</div><div class="muted small">Look it up, or photograph its card</div></div></span><span class="chev">›</span></a>
      <a href="#scan"><span class="lead">${ICONS.camera}<div><div class="name">Scan an old scorecard</div><div class="muted small">Photograph a paper card; the scores are read for you to check</div></div></span><span class="chev">›</span></a></div>`, { back: "#play" });
  const q = document.getElementById("q");
  q.addEventListener("input", () => {
    const t = q.value.toLowerCase().trim();
    document.querySelectorAll("#courses .course").forEach(b => { b.style.display = !t || (b.dataset.q || "").includes(t) ? "" : "none"; });
    document.querySelectorAll("#courses h2").forEach(h => {
      const l = h.nextElementSibling, any = l && [...l.children].some(el => el.style.display !== "none");
      h.style.display = any ? "" : "none"; if (l) l.style.display = any ? "" : "none";
    });
  });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "near") return askWhereIAm(() => { if (location.hash === "#new") newRound(); });
    if (b.dataset.act === "clear-near") { here.lat = here.lng = null; here.asked = false; return newRound(); }
    if (b.dataset.act === "pick-course") return go(`#new/${b.dataset.slug}`);
    if (b.dataset.act === "pick-club") return go(`#loops/${encodeURIComponent(b.dataset.club)}`);
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
      <label style="margin-top:0">Name of the round<input id="rname" value="${esc((c.loop || c.name) + " " + date)}"></label>
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
    const r = S.createRound({ course: slug, name: name || `${c.loop || c.name} ${S.today()}`, date: document.getElementById("rdate").value || S.today(),
      defaultTee: document.getElementById("rtee").value, allowance: document.getElementById("rallow").value });
    document.querySelectorAll("input[name=lg]:checked").forEach(i => { S.setLeagueRound(i.value, r.id, true); S.state.settings.lastLeague = i.value; });
    const me = S.me();
    // I am on my own card from the start, provided the app knows what I play off; otherwise the players screen asks
    if (me && S.currentIndex(me) !== null && S.currentIndex(me) !== undefined) S.addEntry(r, c.n, { name: me.name, hi: S.currentIndex(me), tee: S.lastTee(me.id, r.course, tees) || r.defaultTee, gender: me.gender || "m", courseHandicap: null });
    S.save();
    go(`#players/${r.id}`);
  });
}
