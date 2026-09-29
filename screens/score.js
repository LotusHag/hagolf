// Scoring, one hole at a time. Only the row you tapped redraws, so the thumb stays where it was.
import * as S from "../store.js";
import { page, bind, esc, go, toast, plural, sum, courseTitle, courseBy, noCourse, ui } from "../ui.js";
import { handicapFor, stableford, outcome, NO_SCORE } from "../model.js";
import { statStrip, statTap, holedOut } from "./extras.js";
import { dropBtn, dropRound } from "./players.js";

function scoreRow(r, c, e, i, h, kinds = null) {
  let info = null;
  try { info = handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); } catch (err) { info = null; }
  const par = info ? info.par[h] : c.par[h];
  if ((e.fromHole || 1) - 1 > h) return `<div class="prow" data-i="${i}"><div class="pinfo"><div class="name">${esc(e.name)}</div><div class="muted small">joins at hole ${c.first_hole + e.fromHole - 1}</div></div><div></div><div class="muted center">—</div><div></div></div>`;
  const v = e.scores[h];
  const st = info ? info.strokes[h] : 0;
  const entered = e.scores.filter(x => x !== null).length;
  let ptsSoFar = 0;
  if (info) e.scores.forEach((x, k) => { if (x) ptsSoFar += stableford(x, info.par[k], info.strokes[k]); });
  const detail = `${st ? plural(st, "stroke") : "no strokes"}${entered ? ` · ${sum(e.scores.filter(x => x))} after ${entered}` : ""}`;
  const cls = v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
  const badge = v !== null && v !== 0 && info ? `<span class="pts">${plural(stableford(v, par, st), "pt")}${entered > 1 ? ` · ${ptsSoFar} total` : ""}</span>` : (entered ? `<span class="pts">${plural(ptsSoFar, "pt")}</span>` : "");
  return `<div class="prow" data-i="${i}">
    <div class="pinfo"><div class="name">${esc(e.name)}</div><div class="muted small">${detail}</div>${badge}</div>
    <button class="sbtn" data-act="dec" data-i="${i}" aria-label="minus">−</button>
    <button class="sval ${cls}" data-act="par" data-i="${i}">${v === null ? "–" : v === 0 ? String(NO_SCORE) : v}</button>
    <button class="sbtn" data-act="inc" data-i="${i}" aria-label="plus">+</button>
    ${kinds ? statStrip(r, c, e, i, h, kinds) : ""}</div>`;
}

function stripHtml(r, c, rid, h) {
  return c.par.map((_, i) => {
    const playing = r.entries.filter(e => (e.fromHole || 1) - 1 <= i);
    const done = playing.length && playing.every(e => e.scores[i] !== null);
    const some = r.entries.some(e => e.scores[i] !== null);
    return `<a class="hchip ${i === h ? "cur" : ""} ${done ? "done" : some ? "some" : ""}" href="#score/${rid}/${i}">${c.first_hole + i}</a>`;
  }).join("");
}

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
  const gf = groups.includes(ui.groupFilter) ? ui.groupFilter : 0;
  const shown = r.entries.map((e, i) => [e, i]).filter(([e]) => !gf || (e.group || 1) === gf);
  const metres = c.tees[r.defaultTee] && c.tees[r.defaultTee].metres;
  const kinds = S.statsFor(rid);
  const extras = S.anyStatsOn(rid) && r.entries.some(e => e.trackStats);
  const body = `
    <div class="strip">${stripHtml(r, c, rid, h)}</div>
    ${groups.length > 1 ? `<div class="filter"><button data-act="gf" data-g="0" class="${gf === 0 ? "on" : ""}">All</button>${groups.map(g => `<button data-act="gf" data-g="${g}" class="${gf === g ? "on" : ""}">Group ${g}</button>`).join("")}</div>` : ""}
    <div class="holehead"><div class="hnum num">${c.first_hole + h}</div>
      <div><div class="name">Par ${c.par[h]}${metres ? ` · ${metres[h]} m` : ""}</div>
      <div class="muted small">Stroke index ${c.stroke_index[h]} · hole ${h + 1} of ${n}</div></div>
      <button class="xtoggle ${extras ? "on" : ""}" data-act="extras" title="Putts, fairways and the rest">${extras ? "Extras on" : "+ Extras"}</button></div>
    <div class="card" style="padding:4px 14px" id="rows">${shown.map(([e, i]) => scoreRow(r, c, e, i, h, kinds)).join("")}</div>
    ${r.entries.length ? "" : `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}
    <p class="hint">First tap sets par, then + and −.${extras ? ` Extras go in under the score; tap a chip again to clear it. <a href="#players/${rid}">Choose who keeps them</a>.` : ""}</p>
    <p class="center"><a class="btn small" href="#players/${rid}">Add or remove players</a></p>
    ${dropBtn(r)}`;
  const bar = (h === 0 ? `<a class="btn" href="#players/${rid}">‹ Players</a>` : `<a class="btn" href="#score/${rid}/${h - 1}">‹ Hole ${c.first_hole + h - 1}</a>`) +
    (h < n - 1 ? `<a class="btn primary" href="#score/${rid}/${h + 1}">Hole ${c.first_hole + h + 1} ›</a>` : `<a class="btn primary" href="#review/${rid}">Review ›</a>`);
  page(r.name, body, { back: "#play", bar, sub: courseTitle(c), bell: false });
  const stripEl = document.querySelector(".strip"), cur = document.querySelector(".hchip.cur");
  if (stripEl && cur) stripEl.scrollLeft = cur.offsetLeft - stripEl.clientWidth / 2 + cur.clientWidth / 2;
  const refresh = i => {
    const row = document.querySelector(`.prow[data-i="${i}"]`);
    if (row) row.outerHTML = scoreRow(r, c, r.entries[i], i, h, kinds);
    const keep = stripEl.scrollLeft;
    stripEl.innerHTML = stripHtml(r, c, rid, h);
    stripEl.scrollLeft = keep;
  };
  bind(ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "gf") { ui.groupFilter = Number(b.dataset.g); return score(rid, h); }
    if (b.dataset.act === "drop-round") return dropRound(rid);
    if (b.dataset.act === "extras") { S.unlockStats(r, !extras); return score(rid, h); }
    if (["st-putt", "st-bit", "st-fw"].includes(b.dataset.act)) {
      const i = Number(b.dataset.i);
      if (!holedOut(r.entries[i], h)) return toast("Put the score in first");
      statTap(r, r.entries[i], h, b.dataset.act, b);
      return refresh(i);
    }
    if (!["inc", "dec", "par"].includes(b.dataset.act)) return;
    const i = Number(b.dataset.i), e = r.entries[i];
    const par = c.par[h], v = e.scores[h];
    // A 0 is a pick-up from an older card; the first tap on it starts over at par like an empty hole.
    if (b.dataset.act === "inc") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.min(30, v + 1));
    else if (b.dataset.act === "dec") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.max(1, v - 1));
    else if (v === null || v === 0) S.setScore(r, e, h, par);
    else return;
    refresh(i);
  });
}
