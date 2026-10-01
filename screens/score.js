// Scoring, one hole at a time. One player is selected and the deck at the foot writes to them: absolute keys
// centred on par, so a seven is one tap and par never arrives from nowhere. The deck keeps its place and its
// height for eighteen holes, which is what lets the extras be asked in it rather than stacked under every row.
// Everything that is reference rather than scoring -- the other holes, the groups, who keeps what -- is one tap
// away behind the hole number, instead of charging rent on all eighteen.
import * as S from "../store.js";
import { page, bind, esc, go, toast, plural, courseTitle, courseBy, noCourse, ui, sheet } from "../ui.js";
import { handicapFor, stableford } from "../model.js";
import { deck, mark, askSteps, moreSheet, saidLine, ptsSoFar } from "../pad.js";
import { statTap, holedOut } from "./extras.js";
import { dropRound } from "./players.js";

const groupOf = rid => ui.groupFilter[rid] || 0;
const infoFor = (r, c, e) => {
  try { return handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); }
  catch (err) { return null; }
};

// ---------------------------------------------------------------- the rows: a status line each, not a widget
function row(r, c, e, i, h, kinds, sel) {
  const info = infoFor(r, c, e);
  const par = info ? info.par[h] : c.par[h];
  if ((e.fromHole || 1) - 1 > h)
    return `<div class="prow skip" data-i="${i}"><span class="mk empty">—</span>
      <span class="pname">${esc(e.name)}<small class="muted">joins at hole ${c.first_hole + e.fromHole - 1}</small></span></div>`;
  const v = e.scores[h], st = info ? info.strokes[h] : 0;
  const entered = e.scores.some(x => x !== null);
  const said = saidLine(e, h, kinds);
  const pts = v !== null && v !== 0 && info ? stableford(v, par, st) : null;
  return `<button class="prow ${sel ? "sel" : ""}" data-act="sel" data-i="${i}" aria-current="${sel}" aria-label="${esc(e.name)}, ${v === null ? "no score" : v === 0 ? "picked up" : `${v} strokes`}">
    ${mark(v, par)}
    <span class="pname">${esc(e.name)}${st ? `<i class="dots"><span class="vis">${"•".repeat(Math.min(st, 4))}</span><span class="sr">${plural(st, "stroke")}</span></i>` : ""}
      ${said ? `<small class="said">${esc(said)}</small>` : ""}</span>
    ${pts === null && !entered ? "" : `<span class="ppts"><b class="num">${pts === null ? ptsSoFar(e, info) : pts}</b><small>${pts === null ? "so far" : "pts"}</small></span>`}</button>`;
}

// ---------------------------------------------------------------- the hole sheet: everything that is not scoring
async function holeSheet(rid, h) {
  const r = S.getRound(rid), c = courseBy(r.course);
  const metres = c.tees[r.defaultTee] && c.tees[r.defaultTee].metres;
  const grid = c.par.map((_, k) => {
    const playing = r.entries.filter(e => (e.fromHole || 1) - 1 <= k);
    const done = playing.length && playing.every(e => e.scores[k] !== null);
    const some = r.entries.some(e => e.scores[k] !== null);
    return `<button class="hchip ${k === h ? "cur" : ""} ${done ? "done" : some ? "some" : ""}" data-act="go-${k}" data-sheet-act>${c.first_hole + k}</button>`;
  }).join("");
  const kept = S.anyStatsOn(rid) && S.cardKeepsStats(r);
  const groups = [...new Set(r.entries.map(e => e.group || 1))].sort();
  const gf = groupOf(rid);
  const board = r.entries.map(e => {
    const info = infoFor(r, c, e);
    const entered = e.scores.filter(x => x !== null).length;
    return `<div class="hrowb"><span>${esc(e.name)}</span><span class="muted small">${entered ? `${ptsSoFar(e, info)} pts after ${entered}` : "nothing yet"}</span></div>`;
  }).join("");
  const v = await sheet({
    title: `Hole ${c.first_hole + h}`,
    lead: `Par ${c.par[h]}${metres ? ` · ${metres[h]} m` : ""} · stroke index ${c.stroke_index[h]} · hole ${h + 1} of ${c.n}`,
    body: `<div class="holegrid">${grid}</div>
      ${groups.length > 1 ? `<h2>Groups</h2><div class="filter">${["0", ...groups].map(g => `<button data-act="gf-${g}" data-sheet-act class="${gf === Number(g) ? "on" : ""}">${g === "0" ? "All" : `Group ${g}`}</button>`).join("")}</div>` : ""}
      <h2>Where everyone is</h2><div class="hboard">${board}</div>`,
    actions: [
      // one tap turns them on, the way the old "+ Extras" button did; choosing what and who is a step further in
      kept ? { label: "Stop keeping putts and the rest", value: "noextras" } : { label: "Keep putts, fairways and the rest", value: "extras" },
      ...(kept ? [{ label: "Choose what, and for whom", value: "players" }] : []),
      { label: "Add or remove players", value: "players" },
      { label: "Discard this round", value: "drop", kind: "danger" }, { label: "Close", value: "no" }],
  });
  if (v === null || v === "no") return;
  if (String(v).startsWith("go-")) return go(`#score/${rid}/${Number(String(v).slice(3))}`);
  if (String(v).startsWith("gf-")) { ui.groupFilter[rid] = Number(String(v).slice(3)); return score(rid, h); }
  if (v === "extras" || v === "noextras") { S.unlockStats(r, v === "extras"); return score(rid, h); }
  if (v === "players") return go(`#players/${rid}`);
  if (v === "drop") return dropRound(rid);
}

// ---------------------------------------------------------------- the screen
export function score(rid, hArg) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const n = c.n;
  const h = Math.max(0, Math.min(n - 1, Number(hArg) || 0));
  if (r.status === "setup") { r.status = "scoring"; S.saveRound(r); }
  if (S.holeOf(r) !== h) S.setHole(r, h);
  const groups = [...new Set(r.entries.map(e => e.group || 1))].sort();
  const gf = groups.includes(groupOf(rid)) ? groupOf(rid) : 0;
  const shown = r.entries.map((e, i) => [e, i]).filter(([e]) => !gf || (e.group || 1) === gf);
  const kinds = S.statsFor(rid);
  const metres = c.tees[r.defaultTee] && c.tees[r.defaultTee].metres;

  // Only somebody who has actually teed off can be written to: a player who joins at hole 12 has no score on
  // hole 3 to enter, and `scores[h] === null` cannot tell the difference between "not yet played" and "not yet
  // entered". Every path to the selection goes through this list, so neither the fallback nor the advance can
  // land on them.
  const playing = shown.filter(([e]) => (e.fromHole || 1) - 1 <= h);
  const nextOwing = from => {
    if (!playing.length) return null;
    const k = playing.findIndex(([, i]) => i === from);
    for (let j = 1; j <= playing.length; j++) {
      const [e, i] = playing[(k + j + playing.length) % playing.length];
      if (e.scores[h] === null) return i;
    }
    return null;
  };
  // The aim is held by player, never by position: removing somebody on the player list shifts every later
  // entry down one, and an index would quietly re-aim at whoever slid into that slot.
  const pick = playing.find(([e]) => e.playerId === (ui.sel[rid] ?? null))
    || playing.find(([e]) => e.scores[h] === null) || playing[0] || null;
  let sel = pick ? pick[1] : null;
  const aim = i => { sel = i; ui.sel[rid] = i === null ? null : r.entries[i].playerId; };
  aim(sel);
  if (ui.ask && (ui.ask.rid !== rid || ui.ask.h !== h || ui.ask.i !== sel)) ui.ask = null;

  const body = `
    <div class="holebar">
      <button class="hnum num" data-act="hole-sheet">${c.first_hole + h}</button>
      <button class="hmeta" data-act="hole-sheet"><b>Par ${c.par[h]}</b>${metres ? ` · ${metres[h]} m` : ""} · SI ${c.stroke_index[h]}<span class="chev">▾</span></button>
      ${gf ? `<button class="gfchip" data-act="hole-sheet">Group ${gf}</button>` : ""}
    </div>
    <div class="prows" id="rows">${shown.map(([e, i]) => row(r, c, e, i, h, kinds, i === sel)).join("")}</div>
    ${r.entries.length ? "" : `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}`;

  page(r.name, body, { back: "#play", bar: deck(r, c, h, sel, kinds, ui.ask), sub: courseTitle(c), bell: false });
  const bar = document.querySelector("footer.bar");
  if (bar) bar.classList.add("deck");
  const main = document.querySelector("main");
  if (main) main.classList.add("with-deck");

  /** Redraw the rows and the deck in place: the page is never rebuilt, so nothing under the thumb moves. */
  const paint = () => {
    const rows = document.getElementById("rows");
    if (rows) rows.innerHTML = shown.map(([e, i]) => row(r, c, e, i, h, kinds, i === sel)).join("");
    if (bar) bar.innerHTML = deck(r, c, h, sel, kinds, ui.ask);
  };
  /** After a score lands: ask this card's questions, or move on to whoever is still owed. */
  const after = i => {
    const steps = askSteps(c, r.entries[i], h, kinds);
    if (steps.length) { ui.ask = { rid, h, i, step: 0, steps }; return paint(); }
    const nx = nextOwing(i);
    if (nx !== null) aim(nx);
    paint();
  };

  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "hole-sheet") return holeSheet(rid, h);
    if (act === "drop-round") return dropRound(rid);
    if (act === "prev") return go(h === 0 ? `#players/${rid}` : `#score/${rid}/${h - 1}`);
    if (act === "next") return go(h < n - 1 ? `#score/${rid}/${h + 1}` : `#review/${rid}`);
    if (act === "sel") {
      const i = Number(b.dataset.i);
      // tapping whoever is already aimed at starts their questions again from the top, which is how a putt
      // written down wrong is put right; tapping anybody else aims at them and leaves the questions behind
      if (i === sel) {
        const steps = askSteps(c, r.entries[i], h, kinds);
        if (steps.length && holedOut(r.entries[i], h)) { ui.ask = { rid, h, i, step: 0, steps }; return paint(); }
      }
      aim(i); ui.ask = null;
      return paint();
    }
    if (sel === null) return;
    const e = r.entries[sel];
    if (act === "pick") {
      const v = Number(b.dataset.v);
      if (e.scores[h] === v) { S.setScore(r, e, h, null); ui.ask = null; return paint(); }
      S.setScore(r, e, h, v);
      return after(sel);
    }
    if (act === "more") {
      const v = await moreSheet(c.par[h], e.scores[h]);
      if (v === undefined) return;
      S.setScore(r, e, h, v);
      if (v === null) { ui.ask = null; return paint(); }
      return after(sel);
    }
    if (act === "ask-skip") {
      if (!ui.ask) return;
      ui.ask.step++;
      if (ui.ask.step >= ui.ask.steps.length) { ui.ask = null; const nx = nextOwing(sel); if (nx !== null) aim(nx); }
      return paint();
    }
    if (["st-putt", "st-fw", "st-bit"].includes(act)) {
      if (!holedOut(e, h)) return toast("Put the score in first");
      statTap(r, e, h, act, b);
      // a bit is a toggle, so you leave that question yourself; an answer to the others is the answer
      if (act !== "st-bit" && ui.ask) {
        ui.ask.step++;
        if (ui.ask.step >= ui.ask.steps.length) { ui.ask = null; const nx = nextOwing(sel); if (nx !== null) aim(nx); }
      }
      return paint();
    }
  });

  // swiping changes the hole; a scroll must never be mistaken for one, so the gesture has to be mostly sideways
  if (main && !main.dataset.swipe) {
    main.dataset.swipe = "1";
    let x0 = null, y0 = null;
    main.addEventListener("touchstart", ev => { const t = ev.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    main.addEventListener("touchend", ev => {
      if (x0 === null) return;
      const t = ev.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 110 || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx < 0 && h < n - 1) go(`#score/${rid}/${h + 1}`);
      else if (dx > 0 && h > 0) go(`#score/${rid}/${h - 1}`);
    }, { passive: true });
  }
}
