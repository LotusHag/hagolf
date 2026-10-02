// Adding a club, and reading an old paper scorecard. Three ways in for a club, one check before anything is
// saved; a card is photographed one at a time and laid end to end.
import * as S from "../store.js";
import * as Y from "../sync.js";
import { page, bind, esc, go, toast, plural, sum, courseTitle, tip, ICONS, ui } from "../ui.js";
import { coursesFromClub, validateCourse, slugify, fmtIndex } from "../model.js";
import { parseHI, hiOk } from "../ui.js";
import { here, askWhereIAm } from "./play.js";

const REGION = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const countryName = code => { try { return (REGION && REGION.of(String(code).toUpperCase())) || code; } catch { return code; } };

function apiError(data, status, what) {
  if (data && data.error) return data.error;
  if (status === 404) return `${what} is not on the backend yet. On the PC: python app/build.py --deploy-worker`;
  if (data && data.message) return `${what} failed: ${data.message} (${status})`;
  return `${what} failed (${status})`;
}
export async function courseSearchApi(cfg, params) {
  const u = new URL(`${cfg.url}/functions/v1/course-search`);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiError(data, res.status, "Looking a club up"));
  return data;
}
export async function courseDetailApi(cfg, club) {
  const u = new URL(`${cfg.url}/functions/v1/course-detail`);
  u.searchParams.set("club", club);
  const res = await fetch(u, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiError(data, res.status, "Looking a club up"));
  return data;
}
export async function scanCourseImage(cfg, b64, mime, kind, holes) {
  const res = await fetch(`${cfg.url}/functions/v1/scan-course`, { method: "POST", headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ image: b64, mime, kind, holes }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiError(data, res.status, "Reading a course off a photograph"));
  return data;
}
export async function scanImage(cfg, b64, mime, holes, par, names) {
  const res = await fetch(`${cfg.url}/functions/v1/scan-card`, { method: "POST", headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ image: b64, mime, holes, par, names }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `scan failed (${res.status})`);
  return data;
}
async function downscale(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = cv.convertToBlob ? await cv.convertToBlob({ type: "image/jpeg", quality: 0.8 }) : await new Promise(res => cv.toBlob(res, "image/jpeg", 0.8));
  const b64 = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result.split(",")[1]); rd.readAsDataURL(blob); });
  return { b64, blob };
}

// ---------------------------------------------------------------- adding a club
const nc = { step: "where", busy: false, q: "", found: null, left: null, draft: null, loop: 0 };
const ncLoop = (name, holes) => ({ key: slugify(name) || "loop", name, short: name, family: "", alone: slugify(name), paired: slugify(name), par: Array(holes).fill(null), stroke_index: null, rank: null, metres: {}, ratings: {}, alt: { par: {}, stroke_index: {} } });
const ncBlankDraft = () => ({ name: "", slug: "", where: null, tees: ["yellow"], loops: [ncLoop("", 18)], layouts: [], source: "phone" });
function ncDraftFrom(detail) {
  const tees = [...new Set(detail.loops.flatMap(l => Object.keys(l.tees)))];
  const loops = detail.loops.map((l, i) => {
    const lp = ncLoop(l.name || `Course ${i + 1}`, l.holes || 18);
    lp.par = l.par ? [...l.par] : Array(l.holes || 18).fill(null);
    lp.stroke_index = l.stroke_index ? [...l.stroke_index] : null;
    for (const [tee, t] of Object.entries(l.tees)) {
      if (t.metres) lp.metres[tee] = t.metres;
      const r = {};
      if (t.ratings.m) r.m = t.ratings.m;
      if (t.ratings.f) r.f = t.ratings.f;
      if (r.m || r.f) lp.ratings[tee] = r;
    }
    return lp;
  });
  const w = detail.club.where || {};
  return { name: detail.club.name || "", slug: slugify(detail.club.name || ""), where: w.town || w.lat ? w : null, tees, loops, layouts: [], source: "phone" };
}

export function newCourse() {
  const cfg = Y.config();
  if (nc.step === "check" && nc.draft) return ncCheck();
  const rows = (nc.found || []).map(c => `<button class="course" data-act="nc-pick" data-id="${esc(c.id)}"><div><div class="name">${esc(c.name)}</div><div class="muted small">${c.km !== null && c.km !== undefined ? `${c.km} km · ` : ""}${esc([c.town, c.country ? countryName(c.country) : ""].filter(Boolean).join(", "))}${c.courses.length ? ` · ${plural(c.courses.length, "course")}` : ""}</div></div><span class="chev">›</span></button>`).join("");
  page("Add a club", `
    ${tip(`<p>A club's numbers live in two places: the scorecard, which gives the par and the stroke index of every hole and the length of each tee, and the club's rating table, which gives the course rating and the slope per tee and, separately, for women.</p>
      <p>Look the club up first. Whatever the database does not have, photograph. You check everything before it is saved.</p>`, "Where a course's numbers come from")}
    ${cfg ? "" : `<div class="banner warn">Looking a club up and reading a photograph both need the backend. Connect under Me, or type the course in below.</div>`}
    <div class="card"><label style="margin-top:0">Club or town<input id="ncq" value="${esc(nc.q)}" placeholder="e.g. Nijmegen" autocomplete="off"></label>
      <div class="two"><button class="btn primary" data-act="nc-search" ${cfg && !nc.busy ? "" : "disabled"}>${nc.busy ? "Looking…" : "Search"}</button><button class="btn" data-act="nc-near" ${cfg && !nc.busy ? "" : "disabled"}>Clubs near me</button></div>
      ${nc.left !== null && nc.left !== undefined ? `<p class="muted small">${nc.left} lookups left this month.</p>` : ""}</div>
    ${nc.found ? (rows ? `<h2>${plural(nc.found.length, "club")} found</h2><div class="list">${rows}</div>` : `<p class="muted small">Nothing found. Try the town, or the club's first word.</p>`) : ""}
    <p class="center" style="margin-top:18px"><button class="btn" data-act="nc-blank">Not in the database: photograph or type it</button></p>`, { back: "#new" });
  const q = document.getElementById("ncq");
  q.addEventListener("input", () => { nc.q = q.value; });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b || nc.busy) return;
    const act = b.dataset.act;
    if (act === "nc-blank") { nc.draft = ncBlankDraft(); nc.step = "check"; nc.loop = 0; return newCourse(); }
    if (act === "nc-search" || act === "nc-near") {
      if (act === "nc-near" && here.lat === null) return askWhereIAm(() => { if (location.hash === "#newcourse") { if (here.lat !== null) ncSearch(cfg, true); else newCourse(); } });
      return ncSearch(cfg, act === "nc-near");
    }
    if (act === "nc-pick") {
      nc.busy = true; newCourse();
      try { nc.draft = ncDraftFrom(await courseDetailApi(cfg, b.dataset.id)); nc.step = "check"; nc.loop = 0; } catch (e) { toast(e.message, 6000); }
      nc.busy = false; return newCourse();
    }
  });
}
async function ncSearch(cfg, near) {
  nc.busy = true; newCourse();
  try { const data = await courseSearchApi(cfg, near ? { lat: here.lat, lng: here.lng } : { name: nc.q, town: nc.q }); nc.found = data.clubs || []; nc.left = data.left; }
  catch (e) { toast(e.message, 6000); }
  nc.busy = false; newCourse();
}
function ncGaps(d) {
  const gaps = [];
  if (!d.name.trim()) gaps.push("the club's name");
  for (const lp of d.loops) {
    if (lp.par.some(p => !p)) gaps.push(`par on ${lp.name || "the course"}`);
    if (!lp.stroke_index || lp.stroke_index.some(x => !x)) gaps.push(`stroke index on ${lp.name || "the course"}`);
    if (!Object.keys(lp.ratings).length) gaps.push(`a course rating on ${lp.name || "the course"}`);
  }
  return gaps;
}
function ncCheck() {
  const d = nc.draft, cfg = Y.config();
  const gaps = ncGaps(d);
  const cells = (lp, i, kind) => {
    const n = lp.par.length, vals = kind === "par" ? lp.par : (lp.stroke_index || Array(n).fill(null));
    return `<div class="cells">${vals.map((v, h) => { const alt = lp.alt[kind][h]; return `<div><small>${h + 1}</small><input inputmode="numeric" class="${v === null || v === undefined || alt !== undefined ? "unsure" : ""}" data-nc="${kind}" data-loop="${i}" data-h="${h}" value="${v ?? ""}"></div>`; }).join("")}</div>`;
  };
  const altLine = (lp, i, kind, label) => {
    const hs = Object.keys(lp.alt[kind]);
    if (!hs.length) return "";
    return `<div class="warn small" style="margin-top:6px">The photo reads ${label} ${hs.map(h => `hole ${Number(h) + 1}: ${lp.alt[kind][h]}`).join(", ")}.
      <button class="btn small" data-act="nc-takealt" data-loop="${i}" data-kind="${kind}">Take the photo's numbers</button><button class="btn small" data-act="nc-keep" data-loop="${i}" data-kind="${kind}">Keep these</button></div>`;
  };
  const teeRow = (lp, i, tee) => {
    const r = lp.ratings[tee] || {}, m = r.m || [], f = r.f || [];
    return `<div class="card" style="margin:8px 0"><div class="row"><b>${esc(tee)}</b><span class="muted small">${lp.metres[tee] ? `${sum(lp.metres[tee])} m read` : "no lengths"}</span></div>
      <div class="two"><label>Men's rating<input inputmode="decimal" data-nc="cr" data-g="m" data-loop="${i}" data-tee="${esc(tee)}" value="${m[0] ?? ""}"></label><label>Men's slope<input inputmode="numeric" data-nc="slope" data-g="m" data-loop="${i}" data-tee="${esc(tee)}" value="${m[1] ?? ""}"></label></div>
      <div class="two"><label>Women's rating<input inputmode="decimal" data-nc="cr" data-g="f" data-loop="${i}" data-tee="${esc(tee)}" value="${f[0] ?? ""}"></label><label>Women's slope<input inputmode="numeric" data-nc="slope" data-g="f" data-loop="${i}" data-tee="${esc(tee)}" value="${f[1] ?? ""}"></label></div></div>`;
  };
  const loopBlock = (lp, i) => `<h2>${esc(lp.name || `Course ${i + 1}`)}</h2>
    <div class="two"><label>Name<input data-nc="name" data-loop="${i}" value="${esc(lp.name || "")}"></label><label>Holes<select data-nc="holes" data-loop="${i}"><option value="9" ${lp.par.length === 9 ? "selected" : ""}>9</option><option value="18" ${lp.par.length === 18 ? "selected" : ""}>18</option></select></label></div>
    <div class="muted small" style="margin-top:8px">Par</div>${cells(lp, i, "par")}${altLine(lp, i, "par", "par")}
    <div class="muted small" style="margin-top:8px">Stroke index</div>${cells(lp, i, "stroke_index")}${altLine(lp, i, "stroke_index", "stroke index")}
    ${d.tees.map(t => teeRow(lp, i, t)).join("")}
    <div class="row"><input id="nctee${i}" placeholder="another tee, e.g. blue" style="flex:1"><button class="btn small" data-act="nc-addtee" data-loop="${i}">Add tee</button></div>
    ${d.loops.length > 1 ? `<p class="center"><button class="btn small" data-act="nc-delloop" data-loop="${i}">Remove this course</button></p>` : ""}`;
  page("Check the club", `
    <div class="card"><label style="margin-top:0">Club<input id="ncname" value="${esc(d.name)}" placeholder="e.g. Golfclub De Hoge Kleij"></label>
      <div class="two"><label>Town<input id="nctown" value="${esc((d.where || {}).town || "")}"></label><label>Country<input id="nccountry" value="${esc((d.where || {}).country || "")}" placeholder="NL"></label></div></div>
    ${gaps.length ? `<div class="banner warn">Still needed: ${esc(gaps.slice(0, 3).join("; "))}${gaps.length > 3 ? ` and ${gaps.length - 3} more` : ""}. Photograph the card, or fill the amber cells in.</div>` : `<div class="banner">Everything is here. Check it against the paper before saving.</div>`}
    <div class="card"><div class="muted small">Take a photo now or pick one you already have. Reading it fills what is missing; where it disagrees with a number already here, you are shown both.</div>
      <label class="btn primary big" style="display:flex;margin-top:8px">${nc.busy ? "Reading…" : "Scorecard: photo or gallery"}<input class="ncphoto" data-kind="scorecard" type="file" accept="image/*" hidden ${cfg && !nc.busy ? "" : "disabled"}></label>
      <label class="btn big" style="display:flex;margin-top:8px">${nc.busy ? "Reading…" : "Rating table: photo or gallery"}<input class="ncphoto" data-kind="ratings" type="file" accept="image/*" hidden ${cfg && !nc.busy ? "" : "disabled"}></label>
      ${d.loops.length > 1 ? `<label>The photograph is of<select id="ncloop">${d.loops.map((lp, i) => `<option value="${i}" ${i === nc.loop ? "selected" : ""}>${esc(lp.name || `Course ${i + 1}`)}</option>`).join("")}</select></label>` : ""}</div>
    ${d.loops.map(loopBlock).join("")}
    <p class="center"><button class="btn small" data-act="nc-addloop">This club has another nine</button><button class="btn small" data-act="nc-restart">Start again</button></p>`,
  { back: "#new", bar: `<button class="btn primary" data-act="nc-save">Save ${esc(d.name || "this club")} ›</button>` });
  const nameBox = document.getElementById("ncname");
  nameBox.addEventListener("input", () => { d.name = nameBox.value; d.slug = slugify(d.name); });
  const town = document.getElementById("nctown"), country = document.getElementById("nccountry");
  const place = () => { d.where = { ...(d.where || {}), town: town.value.trim(), country: country.value.trim().toUpperCase() }; };
  town.addEventListener("input", place); country.addEventListener("input", place);
  const loopSel = document.getElementById("ncloop");
  if (loopSel) loopSel.addEventListener("change", () => { nc.loop = Number(loopSel.value); });
  document.querySelectorAll("[data-nc]").forEach(el => el.addEventListener("input", () => {
    const lp = d.loops[Number(el.dataset.loop)], kind = el.dataset.nc;
    if (kind === "name") { lp.name = el.value; lp.key = lp.alone = lp.paired = slugify(el.value); lp.short = el.value; return; }
    if (kind === "holes") { ncResize(lp, Number(el.value)); return ncCheck(); }
    const v = el.value.trim() === "" ? null : Number(el.value.replace(",", "."));
    if (kind === "par") lp.par[Number(el.dataset.h)] = v;
    else if (kind === "stroke_index") { if (!lp.stroke_index) lp.stroke_index = Array(lp.par.length).fill(null); lp.stroke_index[Number(el.dataset.h)] = v; }
    else {
      const tee = el.dataset.tee, g = el.dataset.g, r = (lp.ratings[tee] = lp.ratings[tee] || {}), pair = r[g] || [null, null];
      pair[kind === "cr" ? 0 : 1] = v;
      if (pair[0] === null && pair[1] === null) delete r[g]; else r[g] = pair;
      if (!Object.keys(r).length) delete lp.ratings[tee];
    }
  }));
  document.querySelectorAll(".ncphoto").forEach(el => el.addEventListener("change", async ev => {
    const file = ev.target.files[0];
    if (!file) return;
    nc.busy = true; ncCheck();
    try {
      const { b64 } = await downscale(file);
      const lp = d.loops[nc.loop] || d.loops[0];
      const got = await scanCourseImage(cfg, b64, "image/jpeg", el.dataset.kind, lp.par.length || null);
      if (el.dataset.kind === "ratings") ncApplyRatings(d, lp, got); else ncApplyCard(d, lp, got);
      if (!d.name && got.club) { d.name = got.club; d.slug = slugify(got.club); }
    } catch (e) { toast(`Scan failed: ${e.message}`, 6000); }
    nc.busy = false; ncCheck();
  }));
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, lp = d.loops[Number(b.dataset.loop)];
    if (act === "nc-addtee") { const box = document.getElementById(`nctee${b.dataset.loop}`); const name = (box.value || "").trim().toLowerCase(); if (!name) return; if (!d.tees.includes(name)) d.tees.push(name); return ncCheck(); }
    if (act === "nc-addloop") { d.loops.push(ncLoop("", 9)); return ncCheck(); }
    if (act === "nc-delloop") { d.loops.splice(Number(b.dataset.loop), 1); nc.loop = 0; return ncCheck(); }
    if (act === "nc-takealt") { const kind = b.dataset.kind; if (kind === "stroke_index" && !lp.stroke_index) lp.stroke_index = Array(lp.par.length).fill(null); for (const [h, v] of Object.entries(lp.alt[kind])) (kind === "par" ? lp.par : lp.stroke_index)[Number(h)] = v; lp.alt[kind] = {}; return ncCheck(); }
    if (act === "nc-keep") { lp.alt[b.dataset.kind] = {}; return ncCheck(); }
    if (act === "nc-restart") { nc.draft = null; nc.found = null; nc.step = "where"; return newCourse(); }
    if (act === "nc-save") return ncSave();
  });
}
function ncResize(lp, n) {
  lp.par = Array.from({ length: n }, (_, h) => lp.par[h] ?? null);
  if (lp.stroke_index) lp.stroke_index = Array.from({ length: n }, (_, h) => lp.stroke_index[h] ?? null);
  for (const tee of Object.keys(lp.metres)) if (lp.metres[tee].length !== n) delete lp.metres[tee];
  lp.alt = { par: {}, stroke_index: {} };
}
function ncApplyCard(d, lp, got) {
  if (got.holes && got.holes !== lp.par.length) ncResize(lp, got.holes);
  const n = lp.par.length;
  for (let h = 0; h < n; h++) {
    const p = (got.par || [])[h];
    if (p) { if (lp.par[h] === null || lp.par[h] === undefined) lp.par[h] = p; else if (lp.par[h] !== p) lp.alt.par[h] = p; }
    const x = (got.stroke_index || [])[h];
    if (x) { if (!lp.stroke_index) lp.stroke_index = Array(n).fill(null); if (lp.stroke_index[h] === null || lp.stroke_index[h] === undefined) lp.stroke_index[h] = x; else if (lp.stroke_index[h] !== x) lp.alt.stroke_index[h] = x; }
  }
  for (const t of got.tees || []) { if (!t.name) continue; if (!d.tees.includes(t.name)) d.tees.push(t.name); if (t.metres && t.metres.length === n) lp.metres[t.name] = t.metres; }
}
function ncApplyRatings(d, lp, got) {
  for (const t of got.tees || []) {
    if (!t.name || t.course_rating === null || t.slope === null) continue;
    if (!d.tees.includes(t.name)) d.tees.push(t.name);
    const r = (lp.ratings[t.name] = lp.ratings[t.name] || {});
    r[t.gender === "f" ? "f" : "m"] = [t.course_rating, t.slope];
  }
}
function ncSave() {
  const d = nc.draft;
  if (!d.name.trim()) return toast("The club needs a name");
  for (const lp of d.loops) {
    if (!lp.name.trim()) return toast("Every course at this club needs a name");
    if (lp.par.some(p => !p)) return toast(`${lp.name}: every hole needs a par`);
    if (!lp.stroke_index || lp.stroke_index.some(x => !x)) return toast(`${lp.name}: every hole needs a stroke index`);
    const sorted = [...lp.stroke_index].sort((a, b) => a - b);
    lp.rank = lp.stroke_index.map(x => sorted.indexOf(x) + 1);
  }
  d.slug = d.slug || slugify(d.name);
  if (d.loops.length === 1 && d.loops[0].par.length === 18) d.loops[0].alone = "";
  let made;
  try { made = coursesFromClub(d); made.forEach(validateCourse); } catch (e) { return toast(e.message, 6000); }
  const clash = made.find(c => S.courseBy(c.slug));
  if (clash) return toast(`A course called ${clash.slug} is on this phone already`);
  made.forEach(c => S.addCourse(c.slug, c));
  toast(`${plural(made.length, "course")} saved on every phone`);
  nc.draft = null; nc.found = null; nc.step = "where"; nc.q = "";
  ui.courseScope = "all";   // a club just added must be visible, whichever country the picker was filtered to
  go("#new");
}

// ---------------------------------------------------------------- scan an old scorecard
const scanState = { cards: [], busy: false, courseSlug: null };

// The club's name as the card prints it, matched on its telling words: "het" or "golfclub" alone matches half the country.
const FILLER = new Set(["het", "de", "den", "van", "the", "and", "en", "golf", "golfclub", "golfbaan", "golfpark", "club", "country", "gc", "gcc", "baan", "holes"]);
const tellingWords = s => String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !FILLER.has(w));
function courseByCardName(name, list) {
  const want = tellingWords(name);
  let best = null, top = 0;
  for (const c of list) {
    const have = new Set(tellingWords(`${c.name} ${c.loop || ""}`));
    const k = want.filter(w => have.has(w)).length;
    if (k > top) { top = k; best = c; }
  }
  return best;
}

export function scan() {
  const cfg = Y.config();
  const all = S.courses();
  const st = scanState;
  if (!cfg) return page("Scan a scorecard", `<div class="banner warn">Scanning needs the backend. Connect under Me first.</div>`, { back: "#new" });
  const recent = (S.state.settings.recentCourses || [])[0];
  const players = S.players().sort((a, b) => a.name.localeCompare(b.name));
  const covered = st.cards.reduce((a, c) => a + c.holes, 0);
  const offsets = st.cards.map((_, k) => st.cards.slice(0, k).reduce((a, c) => a + c.holes, 0));
  const fits = all.filter(c => c.n === 9 || c.n === 18);
  const course = all.find(c => c.slug === st.courseSlug) || null;
  const want = course ? course.n : null;
  const missing = want === null ? null : want - covered;
  const tees = course ? Object.keys(course.tees) : [];
  const dfltTee = tees.includes("yellow") ? "yellow" : tees[0];
  if (course) for (const card of st.cards) for (const row of card.rows) {
    if (row.who === undefined) { row.who = ""; row.isNew = false; }
    if (!tees.includes(row.tee)) { const p = row.who ? S.players().find(x => x.id === row.who) : null; row.tee = (p && S.lastTee(p.id, course.slug, tees)) || dfltTee; }
  }
  const cardBlock = (card, k) => {
    const from = offsets[k] + 1, to = offsets[k] + card.holes;
    return `<h2>Card ${k + 1}${st.cards.length > 1 || missing > 0 ? ` · holes ${from} to ${to}` : ""}</h2>
      ${card.imageUrl ? `<img class="scan-prev" src="${card.imageUrl}" alt="scorecard ${k + 1}">` : ""}
      <label>Holes on this card<select class="choles" data-card="${k}"><option value="9" ${card.holes === 9 ? "selected" : ""}>9</option><option value="18" ${card.holes === 18 ? "selected" : ""}>18</option></select></label>
      ${card.rows.map((row, i) => {
        const tot = row.scores.reduce((a, v) => a + (v || 0), 0);
        const mismatch = row.total !== null && row.total !== undefined && row.total !== tot;
        const chosen = row.isNew || !row.who ? null : players.find(p => p.id === row.who);
        return `<div class="scan-row" data-card="${k}" data-i="${i}" data-new="${row.isNew ? "1" : ""}">
          <div class="row"><label class="small" style="margin:0"><input type="checkbox" class="use" checked> <b>Row ${i + 1}</b></label><span class="muted small">${tot} entered${row.total !== null && row.total !== undefined ? ` · card says ${row.total}` : ""}</span></div>
          <div class="cells">${row.scores.map((v, h) => `<div><small>${offsets[k] + h + 1}</small><input inputmode="numeric" class="${row.unsure.includes(h) || v === null ? "unsure" : ""}" value="${v === null ? "" : v}" data-h="${h}"></div>`).join("")}</div>
          ${mismatch ? `<div class="warn small" style="margin-top:6px">These holes add up to ${tot}, the card says ${row.total}. Check the yellow cells.</div>` : ""}
          <div class="whorow"><select class="who"><option value="">Who played this row?</option>${players.map(p => `<option value="${p.id}" ${!row.isNew && p.id === row.who ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
          <div class="picked muted small" ${chosen ? "" : "hidden"}>${chosen ? `Last played off ${esc(fmtIndex(Number(chosen.hi)))}` : ""}</div>
          <button type="button" class="btn small rownew"><span class="plus">+</span> Someone new</button>
          <div class="newp" ${row.isNew ? "" : "hidden"}><label style="margin-top:6px">Name<input class="nm" autocapitalize="words" value="${esc(row.name || "")}"></label></div>
          <div class="two rowhcp"><label>Tee<select class="rowtee">${tees.map(t => `<option ${t === row.tee ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label><label>Handicap index<input class="rowhi" inputmode="decimal" placeholder="18,4" value="${esc(row.hi || "")}"></label></div>
        </div>`;
      }).join("")}`;
  };
  const first = st.cards[0];
  const courseOpts = fits.map(c => `<option value="${esc(c.slug)}" ${c.slug === st.courseSlug ? "selected" : ""}>${esc(courseTitle(c))} (${c.n})</option>`).join("");
  const body = st.cards.length ? `
    <h2>The round</h2>
    <label>Course walked<select id="scourse">${courseOpts}</select></label>
    ${missing > 0 ? `<div class="banner">${esc(courseTitle(course))} is ${want} holes and ${covered} are read so far. Take the next card: holes ${covered + 1} to ${want}.</div>` : missing < 0 ? `<div class="banner warn">${covered} holes have been read but ${esc(courseTitle(course))} is only ${want}. Pick an 18-hole course, or start again.</div>` : ""}
    <label>Played on<input id="sdate" type="date" value="${esc(first.date || S.today())}"></label>
    <label>Name of the round<input id="sname" value="${esc(first.name || ((first.course ? first.course + " " : "") + (first.date || "")).trim() || "Scanned round")}"></label>
    <h2>Whose card is this?</h2>
    <p class="muted small">Check the numbers read off the photo${st.cards.length > 1 ? "s" : ""}, then say who each row belongs to.</p>
    ${tip(`<p>The rows are in the order they sit on the card, and a number the reader was unsure of is marked in amber.</p><p>Walked 18 as two cards of nine? Pick the same player on both and the two halves become one round for them. Untick a row to leave that player out.</p>`, "Reading a photographed card")}
    ${st.cards.map(cardBlock).join("")}` : "";
  const label = st.busy ? "Reading the card…" : !st.cards.length ? "Take or choose a photo" : missing > 0 ? `Card ${st.cards.length + 1}: take or choose` : "Scan another photo";
  page("Scan a scorecard", `
    <p class="muted small">An old paper scorecard, laid flat and in good light: photograph it now, or pick a photo you already have. Two cards of nine for one 18-hole round? One after the other.</p>
    <label class="btn primary big" style="display:flex">${ICONS.camera} ${label}<input id="photo" type="file" accept="image/*" hidden ${st.busy ? "disabled" : ""}></label>
    ${st.cards.length ? `<button class="btn small" data-act="scan-reset" style="margin-top:8px">Start again</button>` : ""}
    ${body}`, { back: "#play", bar: st.cards.length ? `<button class="btn primary" data-act="scan-create" ${missing === 0 ? "" : "disabled"}>Create round ›</button>` : "" });
  document.getElementById("photo").addEventListener("change", async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    st.busy = true; scan();
    try {
      const { b64, blob } = await downscale(f);
      const guessCourse = all.find(c => c.slug === st.courseSlug) || all.find(c => c.slug === recent) || all[0];
      const data = await scanImage(cfg, b64, "image/jpeg", guessCourse.n, guessCourse.par, S.players().map(p => p.name));
      st.cards.push({ ...data, imageUrl: URL.createObjectURL(blob) });
      if (!st.courseSlug) {
        const total = st.cards.reduce((a, c) => a + c.holes, 0);
        const same = all.filter(c => c.n === total);
        const guess = data.course ? courseByCardName(data.course, same) : null;
        st.courseSlug = (guess || same.find(c => c.slug === recent) || same[0] || guessCourse).slug;
      }
    } catch (err) { toast(`Scan failed: ${err.message}`, 6000); }
    st.busy = false; scan();
  });
  const sc = document.getElementById("scourse");
  if (sc) sc.addEventListener("change", () => { st.courseSlug = sc.value; scan(); });
  document.querySelectorAll(".choles").forEach(sel => sel.addEventListener("change", () => {
    const card = st.cards[Number(sel.dataset.card)], n2 = Number(sel.value);
    card.holes = n2;
    for (const row of card.rows) { row.scores = Array.from({ length: n2 }, (_, h) => row.scores[h] ?? null); row.unsure = row.unsure.filter(h => h < n2); }
    scan();
  }));
  document.querySelectorAll(".scan-row").forEach(el => {
    const row = st.cards[Number(el.dataset.card)].rows[Number(el.dataset.i)];
    const who = el.querySelector(".who"), np = el.querySelector(".newp"), picked = el.querySelector(".picked");
    const teeSel = el.querySelector(".rowtee"), hiBox = el.querySelector(".rowhi");
    const takeFrom = p => { hiBox.value = fmtIndex(Number(p.hi)); teeSel.value = (course && S.lastTee(p.id, course.slug, tees)) || teeSel.value; row.hi = hiBox.value; row.tee = teeSel.value; row.hiTyped = false; };
    who.addEventListener("change", () => {
      row.isNew = false; row.who = who.value; el.dataset.new = ""; np.hidden = true; picked.hidden = !who.value;
      const p = players.find(x => x.id === who.value);
      if (p) { picked.textContent = `Last played off ${fmtIndex(Number(p.hi))}`; takeFrom(p); }
    });
    const nm = np.querySelector(".nm");
    hiBox.addEventListener("input", () => { row.hi = hiBox.value; row.hiTyped = true; });
    teeSel.addEventListener("change", () => { row.tee = teeSel.value; });
    nm.addEventListener("input", () => {
      row.name = nm.value;
      const p = S.findPlayer(nm.value);
      picked.hidden = !p;
      if (!p) return;
      picked.textContent = `Already on the roster, last played off ${fmtIndex(Number(p.hi))}`;
      if (!row.hiTyped) takeFrom(p);
    });
    el.querySelector(".rownew").addEventListener("click", () => { row.isNew = true; row.who = ""; el.dataset.new = "1"; who.value = ""; picked.hidden = true; np.hidden = false; nm.focus(); });
    const tally = el.querySelector(".row .muted");
    el.querySelectorAll(".cells input").forEach(inp => inp.addEventListener("input", () => {
      row.scores[Number(inp.dataset.h)] = inp.value.trim() === "" ? null : Number(inp.value);
      const t = [...el.querySelectorAll(".cells input")].reduce((a, x) => a + (Number(x.value) || 0), 0);
      tally.textContent = tally.textContent.replace(/^\d+ entered/, `${t} entered`);
      inp.classList.toggle("unsure", inp.value.trim() === "");
    }));
  });
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "scan-reset") { for (const c of st.cards) if (c.imageUrl) URL.revokeObjectURL(c.imageUrl); st.cards = []; st.courseSlug = null; return scan(); }
    if (b.dataset.act !== "scan-create" || !course || missing !== 0) return;
    const date = document.getElementById("sdate").value || S.today();
    const picked = [...document.querySelectorAll(".scan-row")].filter(el => el.querySelector(".use").checked);
    if (!picked.length) return toast("Tick at least one row");
    const byPlayer = new Map();
    for (const el of picked) {
      const k = Number(el.dataset.card), nth = Number(el.dataset.i) + 1, isNew = el.dataset.new === "1";
      const pid = el.querySelector(".who").value;
      if (!isNew && !pid) return toast(`Card ${k + 1}, row ${nth}: choose who played it, add someone new, or untick it`);
      const known = isNew ? null : S.players().find(p => p.id === pid);
      const name = known ? known.name : el.querySelector(".nm").value.trim();
      const hi = parseHI(el.querySelector(".rowhi").value), tee = el.querySelector(".rowtee").value;
      if (!name) return toast(`Card ${k + 1}, row ${nth}: the new player needs a name`);
      if (!hiOk(hi)) return toast(`${name}: handicap index between +10 and 54`);
      const scores = [...el.querySelectorAll(".cells input")].map(i2 => i2.value.trim() === "" ? null : Number(i2.value));
      if (scores.some(v => v !== null && !(Number.isInteger(v) && v >= 0 && v <= 30))) return toast(`${name}: scores must be whole numbers 0 to 30`);
      const key = S.nameKey(name);
      if (!byPlayer.has(key)) byPlayer.set(key, { name, hi, tee, gender: known ? known.gender : "m", cards: new Set(), scores: new Array(course.n).fill(null) });
      const e = byPlayer.get(key);
      if (e.cards.has(k)) return toast(`${name} is on card ${k + 1} twice; untick one of those rows`);
      e.cards.add(k);
      scores.forEach((v, h) => { e.scores[offsets[k] + h] = v; });
    }
    const short = [...byPlayer.values()].find(e => e.cards.size !== st.cards.length);
    if (short) return toast(`${short.name} is on ${plural(short.cards.size, "card")} of ${st.cards.length}. Pick them on the other one too, or untick them.`, 6000);
    const r = S.createRound({ course: course.slug, name: document.getElementById("sname").value.trim() || "Scanned round", date, defaultTee: [...byPlayer.values()][0].tee || dfltTee, allowance: 100 });
    for (const x of byPlayer.values()) {
      const e = S.addEntry(r, course.n, { name: x.name, hi: x.hi, tee: x.tee, gender: x.gender, courseHandicap: null });
      x.scores.forEach((v, h) => { if (v !== null) S.setScore(r, e, h, v); });
    }
    r.status = "done";
    S.saveRound(r);
    for (const c of st.cards) if (c.imageUrl) URL.revokeObjectURL(c.imageUrl);
    st.cards = []; st.courseSlug = null;
    go(`#review/${r.id}`);
  });
}
