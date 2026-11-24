// Reading an old paper scorecard: photographed one card at a time and laid end to end. Courses themselves are the
// operator's, pushed from the course files; nothing here adds one.
import { brandField } from "./partner.js";
import { brandForCourse } from "../brand.js";
import * as S from "../store.js";
import * as Y from "../sync.js";
import { page, bind, esc, go, toast, plural, courseTitle, tip, ICONS, ui } from "../ui.js";
import { fmtIndex } from "../model.js";
import { parseHI, hiOk } from "../ui.js";

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
    ${brandField("sbrand", ui.scanBrand || (course && (brandForCourse(course.slug) || {}).id) || null)}
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
    const r = S.createRound({ course: course.slug, name: document.getElementById("sname").value.trim() || "Scanned round", date, defaultTee: [...byPlayer.values()][0].tee || dfltTee, allowance: 100,
      brand: (document.getElementById("sbrand") || {}).value || null });
    ui.scanBrand = null;
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
