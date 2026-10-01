// Scoring, one hole at a time. Every player is one block: their score on a − / + stepper that starts at the par
// of the hole, and every extra that card is keeping on the same stepper right beside it, so a player is filled
// in all at once and the whole hole reads in one look. Only the block you touched redraws, so the thumb stays
// where it was.
// The whole loop sits along the top as a strip of chips -- where the card is up to, and a tap straight to any
// hole of it. Everything else that is reference rather than scoring -- the groups, the board, who keeps what --
// is one tap away behind the hole number.
import * as S from "../store.js";
import { page, bind, esc, go, plural, courseTitle, courseBy, noCourse, ui, sheet } from "../ui.js";
import { handicapFor, stableford } from "../model.js";
import { scoreStepper, extrasRows, navBar, ptsSoFar } from "../pad.js";
import { statTap, statStep, seedStats } from "./extras.js";
import { dropRound, extrasSheet } from "./players.js";

const groupOf = rid => ui.groupFilter[rid] || 0;
const infoFor = (r, c, e) => {
  try { return handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); }
  catch (err) { return null; }
};

// ---------------------------------------------------------------- one player, everything about this hole
function block(r, c, e, i, h, kinds) {
  const info = infoFor(r, c, e);
  const par = info ? info.par[h] : c.par[h];
  if ((e.fromHole || 1) - 1 > h)
    return `<div class="prow skip" data-i="${i}"><div class="phead"><span class="pname">${esc(e.name)}</span>
      <span class="muted small">joins at hole ${c.first_hole + e.fromHole - 1}</span></div></div>`;
  const v = e.scores[h], st = info ? info.strokes[h] : 0;
  const entered = e.scores.some(x => x !== null);
  const pts = v !== null && v !== 0 && info ? stableford(v, par, st) : null;
  return `<div class="prow" data-i="${i}">
    <div class="phead">
      <span class="pname">${esc(e.name)}${st ? `<i class="dots"><span>${"•".repeat(Math.min(st, 4))}</span><span class="sr">${plural(st, "stroke")}</span></i>` : ""}</span>
      ${pts === null && !entered ? "" : `<span class="ppts"><b class="num">${pts === null ? ptsSoFar(e, info) : pts}</b><small>${pts === null ? "so far" : "pts"}</small></span>`}
    </div>
    ${scoreStepper(e, i, h, par)}
    ${extrasRows(c, e, i, h, kinds)}</div>`;
}

// ---------------------------------------------------------------- the hole sheet: everything that is not scoring
async function holeSheet(rid, h) {
  const r = S.getRound(rid), c = courseBy(r.course);
  const metres = c.tees[r.defaultTee] && c.tees[r.defaultTee].metres;
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
    body: `${groups.length > 1 ? `<h2>Groups</h2><div class="filter">${["0", ...groups].map(g => `<button data-act="gf-${g}" data-sheet-act class="${gf === Number(g) ? "on" : ""}">${g === "0" ? "All" : `Group ${g}`}</button>`).join("")}</div>` : ""}
      <h2>Where everyone is</h2><div class="hboard">${board}</div>`,
    actions: [{ label: "Putts, fairways and the rest", value: "extras" },
      { label: "Add or remove players", value: "players" },
      { label: "Discard this round", value: "drop", kind: "danger" }, { label: "Close", value: "no" }],
  });
  if (v === null || v === "no") return;
  if (String(v).startsWith("gf-")) { ui.groupFilter[rid] = Number(String(v).slice(3)); return score(rid, h); }
  if (v === "extras") { await extrasSheet(rid); return score(rid, h); }
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

  // the whole loop along the top: where the card is up to, and a tap straight to any hole of it
  const rows = Math.ceil(n / 9);
  const strip = c.par.map((_, k) => {
    const playing = r.entries.filter(e => (e.fromHole || 1) - 1 <= k);
    const done = playing.length && playing.every(e => e.scores[k] !== null);
    const some = r.entries.some(e => e.scores[k] !== null);
    return `<a class="hstep num ${k === h ? "cur" : ""} ${done ? "done" : some ? "some" : ""}" href="#score/${rid}/${k}" data-h="${k}"
      ${k === h ? 'aria-current="true"' : ""} aria-label="Hole ${c.first_hole + k}${done ? ", all in" : some ? ", part in" : ""}">${c.first_hole + k}</a>`;
  }).join("");

  const body = `
    <div class="holebar">
      <button class="hnum num" data-act="hole-sheet">${c.first_hole + h}</button>
      <button class="hmeta" data-act="hole-sheet"><b>Par ${c.par[h]}</b>${metres ? ` · ${metres[h]} m` : ""} · SI ${c.stroke_index[h]}<span class="chev">▾</span></button>
      ${gf ? `<button class="gfchip" data-act="hole-sheet">Group ${gf}</button>` : ""}
    </div>
    <div class="holestrip" style="grid-template-columns:repeat(${Math.ceil(n / rows)},1fr)">${strip}</div>
    <div class="prows" id="rows">${shown.map(([e, i]) => block(r, c, e, i, h, kinds)).join("")}</div>
    ${r.entries.length ? "" : `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}`;

  page(r.name, body, { back: "#play", bar: navBar(r, c, h, rid), sub: courseTitle(c), bell: false });

  /** The strip chip and the way onward both say whether this hole is finished, so a score re-marks both. */
  const remark = () => {
    const playing = r.entries.filter(e => (e.fromHole || 1) - 1 <= h);
    const done = !!(playing.length && playing.every(e => e.scores[h] !== null));
    const some = r.entries.some(e => e.scores[h] !== null);
    const chip = document.querySelector(`.holestrip [data-h="${h}"]`);
    if (chip) { chip.classList.toggle("done", done); chip.classList.toggle("some", !done && some); }
    const onward = document.querySelector("footer.bar a:last-child");
    if (onward) onward.classList.toggle("primary", done);
  };

  /** Only the block that was touched is rewritten, so nothing under the thumb moves. */
  const refresh = i => {
    const el = document.querySelector(`.prow[data-i="${i}"]`);
    if (el) el.outerHTML = block(r, c, r.entries[i], i, h, kinds);
    remark();
  };

  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "hole-sheet") return holeSheet(rid, h);
    if (act === "drop-round") return dropRound(rid);
    const i = Number(b.dataset.i);
    const e = r.entries[i];
    // a player who joins later has no hole here to write to
    if (!e || (e.fromHole || 1) - 1 > h) return;
    if (["inc", "dec", "par"].includes(act)) {
      const par = c.par[h], v = e.scores[h];
      // a 0 is a pick-up read off an older paper card; the first tap on it starts over at par, like an empty hole
      if (act === "inc") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.min(30, v + 1));
      else if (act === "dec") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.max(1, v - 1));
      else if (v === null || v === 0) S.setScore(r, e, h, par);
      else return;
      seedStats(r, e, h, c, kinds);
      return refresh(i);
    }
    if (act === "x-inc" || act === "x-dec") { statStep(r, e, h, b.dataset.k, act === "x-inc" ? 1 : -1); return refresh(i); }
    if (act === "st-fw") { statTap(r, e, h, act, b); return refresh(i); }
  });
}
