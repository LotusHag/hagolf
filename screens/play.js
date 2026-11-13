// Where? The second step of Play: the course played last time first, then any club by name or by distance. A club
// of nines opens a small sheet for the loop; the round is made the moment the course is known, and the next
// screen is who is playing.
import { brandForCourse } from "../brand.js";
import * as S from "../store.js";
import { page, bind, esc, go, ui, plural, courseTitle, courseBy, sheet, ICONS, tip } from "../ui.js";
import { formatLabel, home, formatSheet } from "./home.js";
import { dayCardId, joinDay } from "./together.js";

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

/** A club of nines: 9 or 18, then the first nine, then the second, all in one sheet that resolves to a course. */
async function ninesSheet(club) {
  const nines = ninesOf(club);
  const st = { holes: 18, first: null };
  return sheet({
    title: club, lead: "Which way round did you walk it?", body: `<div id="nbody"></div>`,
    onOpen: (el, close) => {
      const draw = () => {
        const chip = (c, act, on = false, sub = `par ${c.course_par}`) => `<button class="pchip ${on ? "on" : ""}" data-n="${act}" data-slug="${esc(c.slug)}"><span>${esc(nineName(c.slug))}</span><small>${esc(sub)}</small></button>`;
        let inner = `<div class="filter"><button data-n="h9" class="${st.holes === 9 ? "on" : ""}">9 holes</button><button data-n="h18" class="${st.holes === 18 ? "on" : ""}">18 holes</button></div>`;
        if (st.holes === 9) inner += `<p class="pickline">Which nine?</p><div class="chips-wrap">${nines.map(c => chip(c, "nine")).join("")}</div>`;
        else if (!st.first) inner += `<p class="pickline">First nine</p><div class="chips-wrap">${nines.map(c => chip(c, "first")).join("")}</div>`;
        else {
          const rest = nines.filter(c => c.slug !== st.first && comboOf(club, st.first, c.slug));
          inner += `<p class="pickline">First nine</p><div class="chips-wrap">${chip(courseBy(st.first), "clear", true)}</div>
            <p class="pickline">Then</p><div class="chips-wrap">${rest.map(c => { const x = comboOf(club, st.first, c.slug); return chip(c, "second", false, `par ${x.course_par}${(x.notes || []).length ? " · worked out" : ""}`); }).join("")}</div>`;
        }
        el.querySelector("#nbody").innerHTML = inner;
      };
      draw();
      el.addEventListener("click", ev => {
        const b = ev.target.closest("[data-n]");
        if (!b) return;
        const n = b.dataset.n;
        if (n === "h9") st.holes = 9, st.first = null;
        else if (n === "h18") st.holes = 18, st.first = null;
        else if (n === "first") st.first = b.dataset.slug;
        else if (n === "clear") st.first = null;
        else if (n === "nine") return close(b.dataset.slug);
        else if (n === "second") { const c = comboOf(club, st.first, b.dataset.slug); return close(c ? c.slug : null); }
        draw();
      });
    },
  });
}

/** A club of several fixed courses: which one. */
async function coursesSheet(club) {
  const cs = S.courses().filter(c => c.name === club);
  return sheet({ title: club, body: `<div class="list">${cs.map(c => `<button data-sheet="${esc(c.slug)}"><div><div class="name">${esc(c.loop || c.name)}</div><div class="muted small">${c.n} holes · par ${c.course_par}</div></div><span class="chev">›</span></button>`).join("")}</div>` });
}

/** The courses this phone has played, newest first, with the date of that round. */
function playedBefore(limit = 4) {
  const when = new Map();
  for (const r of S.rounds()) if (!when.has(r.course)) when.set(r.course, r.date || "");
  for (const s of S.state.settings.recentCourses || []) if (!when.has(s)) when.set(s, "");
  const all = S.courses();
  return [...when].map(([slug, date]) => ({ c: all.find(x => x.slug === slug), date })).filter(x => x.c).slice(0, limit);
}

const shortDate = d => { const t = d ? new Date(d + "T12:00:00") : null; return t && !isNaN(t) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };

// ---------------------------------------------------------------- Where?
export function newRound(slug = null) {
  if (slug === "unlisted") return unlistedForm();
  if (slug) return startRound(slug);
  const fmt = S.state.settings.lastFormat || "stableford";
  const clubs = clubList();
  const near = here.lat !== null;
  const rec = playedBefore();
  const clubRow = club => {
    const k = ninesOf(club.name).length;
    const what = k >= 2 ? `${plural(k, "nine")} · 9 or 18 holes`
      : club.courses.length === 1 ? `${club.courses[0].n} holes · par ${club.courses[0].course_par}` : plural(club.courses.length, "course");
    const w = club.where;
    const away = near && w && w.lat ? kmApart(here, w) : null;
    return { away, html: `<button class="course" data-act="pick-club" data-club="${esc(club.name)}"
      data-q="${esc((club.name + " " + placeOf(w) + " " + club.courses.map(c => c.loop).join(" ")).toLowerCase())}">
      <div><div class="name">${esc(club.name)}</div><div class="muted small">${placeOf(w) ? esc(placeOf(w)) + " · " : ""}${what}</div></div>
      ${away !== null ? `<span class="away num">${Math.round(away)} km</span>` : ""}<span class="chev">›</span></button>` };
  };
  let rows = clubs.map(clubRow);
  if (near) rows = rows.sort((a, b) => (a.away ?? 1e9) - (b.away ?? 1e9));
  page("Where?", `
    ${rec.length ? `<h2>Played lately</h2><div class="list">${rec.map(({ c, date }) => `<button class="course" data-act="pick-course" data-slug="${esc(c.slug)}">
      <div><div class="name">${esc(courseTitle(c))}</div><div class="muted small">${date ? `last played ${esc(shortDate(date))}` : `${c.n} holes · par ${c.course_par}`}</div></div><span class="chev">›</span></button>`).join("")}</div>` : ""}
    <input id="q" class="search" placeholder="Search club or town" value="${esc(ui.courseQ || "")}" autocomplete="off">
    ${navigator.geolocation && !near && !here.denied ? `<button class="btn soft wide" data-act="near">${here.asked ? "Finding you…" : "Clubs near me"}</button>` : ""}
    ${near ? `<h2>Near you</h2>` : ""}
    <div class="list" id="courses">${rows.map(x => x.html).join("")}</div>
    <p id="cnone" class="muted center" hidden>Nothing matches.</p>
    <div class="list" style="margin-top:16px"><a href="#new/unlisted"><span class="lead">${ICONS.plus}<div><div class="name">Course not listed? Play it anyway</div><div class="muted small">Fill in each hole's par as you play it</div></div></span><span class="chev">›</span></a></div>`,
    { back: "#home", sub: ui.dayLeague && S.getLeague(ui.dayLeague) ? `${S.getLeague(ui.dayLeague).name} · today` : formatLabel(fmt),
      actions: ui.dayLeague ? "" : `<button class="btn small ghost" data-act="fmt">Change</button>` });

  const q = document.getElementById("q");
  const apply = () => {
    const t = (ui.courseQ || "").toLowerCase().trim();
    let shown = 0;
    document.querySelectorAll("#courses .course").forEach(b => { const on = !t || (b.dataset.q || "").includes(t); b.style.display = on ? "" : "none"; if (on) shown++; });
    document.getElementById("cnone").hidden = !!shown;
  };
  q.addEventListener("input", () => { ui.courseQ = q.value; apply(); });
  apply();
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "fmt") return formatSheet();
    if (act === "near") return askWhereIAm(() => { if (location.hash === "#new") newRound(); });
    if (act === "pick-course") return startRound(b.dataset.slug);
    if (act === "pick-club") {
      const club = b.dataset.club;
      const slug = ninesOf(club).length ? await ninesSheet(club)
        : S.courses().filter(c => c.name === club).length > 1 ? await coursesSheet(club)
        : (S.courses().find(c => c.name === club) || {}).slug;
      if (slug) startRound(slug);
    }
  });
}

/** I am on my own card from the start, with my account on the seat. */
function addMe(r, c, tees) {
  const me = S.me();
  if (me && S.currentIndex(me) !== null && S.currentIndex(me) !== undefined) {
    S.addEntry(r, c.n, { name: me.name, hi: S.currentIndex(me), tee: S.lastTee(me.id, r.course, tees) || r.defaultTee, gender: me.gender || "m", courseHandicap: null, accountId: S.myAccount(), trackStats: S.keepsAny(S.myKeep()) });
  }
}

/** The round is made as soon as the course is known: name, date, tee and allowance are defaults, changed under Options. */
export function startRound(slug, { leagueId = ui.dayLeague || null, id = null } = {}) {
  const c = courseBy(slug);
  if (!c) return go("#new");
  ui.dayLeague = null;
  // a society's day is one card: every phone that starts it for this loop today lands on the same id
  if (leagueId) {
    id = id || dayCardId(leagueId, S.today(), slug);
    if (S.getRound(id)) { joinDay(id); return S.getRound(id); }
  }
  const tees = Object.keys(c.tees);
  const fmt = S.state.settings.lastFormat || "stableford";
  const r = S.createRound({ course: slug, name: `${c.name} ${S.today()}`, date: S.today(), defaultTee: tees.includes("yellow") ? "yellow" : tees[0],
    allowance: 100, brand: (brandForCourse(slug) || {}).id || null, format: fmt, leagueId, id });
  if (leagueId) S.setLeagueRound(leagueId, r.id, true);
  addMe(r, c, tees);
  S.save();
  ui.courseQ = "";
  go(`#players/${r.id}`);
  return r;
}

function unlistedForm() {
  const st = ui.unlisted || (ui.unlisted = { holes: 18 });
  page("Unlisted course", `
    <div class="filter"><button data-act="holes" data-v="9" class="${st.holes === 9 ? "on" : ""}">9 holes</button><button data-act="holes" data-v="18" class="${st.holes === 18 ? "on" : ""}">18 holes</button></div>
    <div class="card"><label style="margin-top:0">Where is it? <span class="muted">(optional)</span><input id="rname" value="${esc(st.name || "")}" placeholder="The course, or anything you like"></label></div>
    ${tip(`<p>You fill in the par of each hole on the course. With no course rating, everyone's course handicap is their index (half of it over nine holes), and the strokes fall on the holes in order.</p>`, "What you get without a card")}`,
  { back: "#new", bar: `<button class="btn primary" data-act="create-unlisted">Next: who is playing ›</button>` });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    st.name = document.getElementById("rname").value;
    if (b.dataset.act === "holes") { st.holes = Number(b.dataset.v); return unlistedForm(); }
    if (b.dataset.act !== "create-unlisted") return;
    const r = S.createUnlistedRound({ name: st.name.trim() || "Unlisted course", date: S.today(), holes: st.holes });
    r.format = S.state.settings.lastFormat || "stableford";
    S.saveRound(r);
    ui.unlisted = null;
    addMe(r, courseBy(r.course), [r.defaultTee]);
    S.save();
    go(`#players/${r.id}`);
  });
}

/** #play opens the format sheet over the Play tab; #loops and the old list fall back to where they belong now. */
export function play() { home(); formatSheet(); }
export function loops() { go("#new"); }
