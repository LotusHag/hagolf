// Scoring, one hole at a time. Every player (or scramble team) is one block: the score on a − / + stepper that
// starts at par, and beside it the extras that golfer keeps. The header carries three things and no more: the
// bag (club distances), the board (reference) and ⋯ (actions). Nothing here waits for the network: the pill
// says whether the card has reached the others yet.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as Mo from "../model.js";
import { page, bind, esc, go, plural, courseBy, noCourse, ui, sheet, ICONS, firstName, toast, land , roundName, roundPlace} from "../ui.js";
import { handicapFor, scratchFor, stableford, NO_SCORE } from "../model.js";
import { scoreStepper, extrasRows, ptsSoFar, mark } from "../pad.js";
import { statTap, statStep, seedStats } from "./extras.js";
import { dropRound, inviteSheet } from "./players.js";
import { formatLabel, liveBoard, pointsHidden } from "./home.js";

const groupOf = rid => ui.groupFilter[rid] || 0;
/** The card as the model reads it, one group of it when `g` is given: on a card of several groups each plays its own match. */
const groupRound = (r, g) => { const m = { ...S.toModelRound(r), final: false }; if (g) m.entries = m.entries.filter(e => (e.group || 1) === g); return m; };
const infoFor = (r, c, e) => {
  try {
    if (Mo.isMatchFormat(r.format)) return scratchFor(c, e, r.defaultTee);
    return handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.contactId || e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance);
  } catch (err) { return null; }
};

// ---------------------------------------------------------------- one player, everything about this hole
function block(r, c, e, i, h, kinds) {
  const info = infoFor(r, c, e);
  const par = info ? info.par[h] : c.par[h];
  if (S.joinsLate(r, e, h))
    return `<div class="prow skip" data-i="${i}"><div class="phead"><span class="pname">${esc(e.name)}</span>
      <span class="muted small">joins at hole ${c.first_hole + e.fromHole - 1}</span></div></div>`;
  const v = e.scores[h], st = info && !c.unlisted ? info.strokes[h] : 0;
  const entered = e.scores.some(x => x !== null);
  // points come off the same strokes in every format, so every card shows them beside the total; a match on strokes counts strokes
  const scored = !!info && !c.unlisted && !(Mo.isMatchFormat(r.format) && !Mo.onPoints(r.format));
  const pts = !scored || v === null ? null : v === 0 ? 0 : stableford(v, par, info.strokes[h]);
  const played = e.scores.map((x, k) => [x, k]).filter(([x]) => x !== null);
  const gross = played.reduce((t, [x]) => t + (x || NO_SCORE), 0);
  const toPar = info ? gross - played.reduce((t, [, k]) => t + info.par[k], 0) : null;
  // with points hidden, the second number is net to par, the way stroke play is counted
  const net = scored && pointsHidden(r), byPts = scored && !net;
  const vsPar = net ? toPar - played.reduce((t, [, k]) => t + info.strokes[k], 0) : toPar;
  const tally = !entered ? "" : `<span class="ptally">
      <span class="ptot"><b class="num">${gross}</b><small>strokes</small>${byPts ? `<b class="num">${ptsSoFar(e, info)}</b><small>pts</small>`
        : vsPar !== null ? `<b class="num">${vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}</b><small>${net ? "net" : "to par"}</small>` : ""}</span>
      ${byPts ? (pts === null ? `<b class="phole gap" aria-hidden="true"></b>` : `<b class="phole num ${pts ? "" : "nil"}">+${pts}</b>`) : ""}</span>`;
  const who = e.role === "team" ? `<small class="members">${esc(r.entries.filter(m => e.members.includes(m.playerId)).map(m => firstName(m.name)).join(" · "))}</small>` : "";
  return `<div class="prow" data-i="${i}">
    <div class="phead">
      <span class="pname">${Mo.isMatchFormat(r.format) && (e.side === "A" || e.side === "B") ? `<i class="side">${e.side}</i>` : ""}${esc(e.name)}${st > 0 ? `<i class="dots"><span>${"•".repeat(Math.min(st, 4))}</span><span class="sr">${plural(st, "stroke")}</span></i>` : st < 0 ? `<i class="dots"><span>${"−".repeat(Math.min(-st, 4))}</span><span class="sr">gives ${plural(-st, "stroke")} back</span></i>` : ""}${who}</span>
      ${tally}
    </div>
    ${scoreStepper(e, i, h, par)}
    ${e.role === "team" ? "" : extrasRows(c, e, i, h, kinds)}</div>`;
}

/** The state of a match, in one line, with a concede button for each side on this hole. */
function matchStrip(r, c, h, g) {
  if (!Mo.isMatchFormat(r.format) || !Mo.matchPlay) return "";
  if (!g && S.manyGroups(r)) return "";
  let M;
  try { M = Mo.matchPlay(c, groupRound(r, g)); } catch (e) { return `<div class="matchstrip warn">${esc(e.message)} · <a href="#players/${r.id}${g ? `/${g}` : ""}">fix the sides</a></div>`; }
  const hole = M.holes[h];
  const decided = hole && hole.winner;
  return `<div class="matchstrip"><b>${esc(M.result || M.status)}</b>
    ${decided || M.result ? "" : `<span class="concede">${["A", "B"].map(sd => {
      const team = M.kind === "scramble", who = team ? M.sides[sd][0] : M.sides[sd].map(firstName).join(" & ");
      return `<button class="btn small ghost" data-act="concede" data-s="${sd}">${esc(who)} concede${M.sides[sd].length > 1 || team && / & /.test(who) ? "" : "s"}</button>`;
    }).join("")}</span>`}</div>`;
}

/** Synced, waiting, or offline: the trust signal on a shared card with one bar of signal. */
function syncPill() {
  if (!Y.enabled()) return "";
  const waiting = Object.values(S.dirty()).reduce((n, m) => n + Object.keys(m).length, 0);
  const off = typeof navigator !== "undefined" && navigator.onLine === false;
  const [cls, word] = off ? ["off", "Offline · saved on phone"] : Y.sync.status === "error" ? ["off", "Not sent yet · saved on phone"]
    : waiting ? ["wait", `${waiting} waiting`] : ["ok", "Synced"];
  return `<span class="syncpill ${cls}">${word}</span>`;
}
/** The pill redrawn in place, easing in only when what it says has changed. */
function swapPill(pill) {
  const was = pill.textContent;
  pill.outerHTML = syncPill();
  const now = document.querySelector(".syncpill");
  if (now && now.textContent !== was) now.classList.add("fresh");
}
// a push that lands changes nothing on the card, so nothing redraws it: the pill has to hear about it itself
Y.onChange(() => { const pill = document.querySelector(".syncpill"); if (pill) swapPill(pill); });
// what each hole showed when it was last drawn, so another scorer's numbers can be picked out as they arrive
const SEEN = new Map();

// ---------------------------------------------------------------- the bag, the board and the menu
export async function bagSheet(r, c, h) {
  const mine = S.mySeat(r);
  const tee = (mine && mine.tee) || r.defaultTee;
  const m = c.tees[tee] && c.tees[tee].metres ? c.tees[tee].metres[h] : null;
  const par = c.par[h];
  const bag = [...S.bag()].sort((a, b) => (b.carry_m || 0) - (a.carry_m || 0));
  const near = par === 3 ? S.nearestClub(m) : null;
  const u = S.units();
  await sheet({ title: `Hole ${c.first_hole + h} · par ${par}`, lead: m ? `${S.lengthIn(m)} ${u} from the ${tee} tee` : "No length for this hole",
    body: bag.length ? `<div class="bagrows">${bag.map(x => `<div class="bagrow ${near && near.club_id === x.club_id ? "on" : ""}"><b>${esc(x.club)}</b>
        <span class="num">${x.carry_m ? `${S.lengthIn(x.carry_m)}` : "–"}<small>${x.total_m ? ` / ${S.lengthIn(x.total_m)}` : ""} ${u}</small></span>${x.note ? `<small class="muted">${esc(x.note)}</small>` : ""}</div>`).join("")}</div>
        ${near ? `<p class="muted small">Nearest carry to the hole: ${esc(near.club)}.</p>` : ""}`
      : `<p class="muted">No clubs yet. Note your distances once and they're here on every hole.</p>`,
    actions: [{ label: bag.length ? "Edit my bag" : "Set up my bag", value: "edit" }, { label: "Close", value: "no", kind: "primary" }] })
    .then(v => { if (v === "edit") go("#bag"); });
}

async function boardSheet(r, c) {
  const groups = [...new Set(r.entries.map(e => e.group || 1))].sort((a, b) => a - b);
  const gf = groupOf(r.id);
  let board, through = 0;
  if (Mo.isMatchFormat(r.format) && Mo.matchPlay) {
    let list = [];
    try { list = Mo.matchesOf(c, groupRound(r, 0)).filter(M => !gf || M.group === gf).map(M => ({ name: `${groups.length > 1 ? `${M.group}. ` : ""}${M.sides.A.join(" & ")} v ${M.sides.B.join(" & ")}`, main: M.result || M.status })); } catch (e) { list = []; }
    board = list.length ? `<div class="hboard">${list.map(x => `<div class="hrowb"><span>${esc(x.name)}</span><span class="num">${esc(x.main)}</span></div>`).join("")}</div>` : `<p class="muted">Nothing to rank yet.</p>`;
  } else {
    const L = liveBoard(r, null, { net: pointsHidden(r) });
    const list = L ? L.rows.filter(x => !gf || x.group === gf) : [];
    through = L ? L.through : 0;
    board = list.length ? holeGrid(r, c, list, L.byNet, pointsHidden(r)) :`<p class="muted">Nothing to rank yet.</p>`;
  }
  const v = await sheet({ title: formatLabel(r.format), lead: `${r.name} · as it stands`,
    body: `${groups.length > 1 ? `<div class="filter">${[0, ...groups].map(g => `<button data-sheet="gf-${g}" class="${gf === g ? "on" : ""}">${g ? `Group ${g}` : "All"}</button>`).join("")}</div>` : ""}${board}`,
    actions: [{ label: "Close", value: "no", kind: "primary" }],
    // open on the holes being played, not on hole 1, when the card is wider than the phone
    onOpen: el => { const w = el.querySelector(".hgwrap"), td = w && w.querySelector(`[data-h="${Math.max(0, through - 1)}"]`); if (td) w.scrollLeft = Math.max(0, td.offsetLeft - w.clientWidth / 2); } });
  return v;
}

/** Every player a row, every hole a box, the total at the far right; rows in the order of the board. */
function holeGrid(r, c, list, byNet, hidePts = false) {
  const seats = new Map(S.scoringSeats(r).map(e => [e.playerId, e]));
  const holes = c.par.map((_, h) => h);
  const head = `<tr class="hghead"><th class="hgname">Hole</th>${holes.map(h => `<th>${c.first_hole + h}</th>`).join("")}<th class="hgtot">Tot</th></tr>
    <tr class="hgpar"><th class="hgname">Par</th>${holes.map(h => `<td>${c.par[h] ?? ""}</td>`).join("")}<td class="hgtot">${c.par.reduce((a, p) => a + (p || 0), 0)}</td></tr>`;
  const rows = list.map(x => {
    const e = seats.get(x.id);
    if (!e) return "";
    const info = infoFor(r, c, e);
    const pts = h => { const v = e.scores[h]; return hidePts || !info || c.unlisted || v === null ? "" : v === 0 ? 0 : stableford(v, info.par[h], info.strokes[h]); };
    const cells = holes.map(h => S.joinsLate(r, e, h) ? `<td data-h="${h}"></td>`
      : `<td data-h="${h}">${mark(e.scores[h], info ? info.par[h] : c.par[h])}<small class="hgpts num">${pts(h)}</small></td>`).join("");
    const tot = !x.holes ? "" : `${hidePts ? "" : `<small>${x.pts} pts</small>`}${byNet ? `<small>${esc(x.main)}</small>` : ""}`;
    return `<tr><th class="hgname"><b>${x.place ?? "–"}</b> ${esc(x.name)}</th>${cells}<td class="hgtot"><b class="num">${x.holes ? x.gross : "–"}</b>${tot}</td></tr>`;
  }).join("");
  return `<div class="hgwrap"><table class="hgrid">${head}${rows}</table></div>`;
}

async function menuSheet(r) {
  const mine = S.mySeat(r);
  const v = await sheet({ title: roundName(r), body: `<div class="list">
      <button data-sheet="players"><span class="lead">${ICONS.people}<div><div class="name">Players, sides and handicaps</div></div></span><span class="chev">›</span></button>
      <button data-sheet="invite"><span class="lead">${ICONS.link}<div><div class="name">Invite to this card</div><div class="muted small">They score with you, live</div></div></span><span class="chev">›</span></button>
      ${mine ? `<button data-sheet="track"><span class="lead">${ICONS.chart}<div><div class="name">${mine.trackStats ? "Stop keeping my putts and the rest" : "Keep my putts and the rest"}</div></div></span></button>` : ""}
      ${Mo.isMatchFormat(r.format) ? "" : `<button data-sheet="pts"><span class="lead">${ICONS.settings}<div><div class="name">${pointsHidden(r) ? "Show Stableford points" : "Hide Stableford points"}</div><div class="muted small">On this phone; the card still keeps them</div></div></span></button>`}
      <button data-sheet="card"><span class="lead">${ICONS.card}<div><div class="name">The whole card</div></div></span><span class="chev">›</span></button>
      <button data-sheet="live"><span class="lead">${ICONS.trophy}<div><div class="name">${r.live ? "Live board is on" : "Show it on a live board"}</div><div class="muted small">For the people at home and the clubhouse screen</div></div></span><span class="chev">›</span></button>
    </div>`, actions: [{ label: "Discard this round", value: "drop", kind: "danger" }, { label: "Close", value: "no" }] });
  if (v === "players") return go(`#players/${r.id}`);
  if (v === "invite") return inviteSheet(r);
  if (v === "track") { S.setTrackStats(r, mine, !mine.trackStats); return score(r.id, S.holeOf(r)); }
  if (v === "pts") { S.setSetting("hidePoints", !S.state.settings.hidePoints); return score(r.id, S.holeOf(r)); }
  if (v === "card") return go(`#review/${r.id}`);
  if (v === "live") { const { liveSheet } = await import("./together.js"); return liveSheet(r); }
  if (v === "drop") return dropRound(r.id);
}

// ---------------------------------------------------------------- the screen
export function score(rid, hArg) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  if (!S.isScorer(r)) return go(`#review/${rid}`);
  const n = c.n;
  const h = Math.max(0, Math.min(n - 1, Number(hArg) || 0));
  if (r.status === "setup") { r.status = "scoring"; S.saveRound(r); }
  if (S.holeOf(r) !== h) S.setHole(r, h);
  // my own seat keeps what I keep, without anyone asking
  const mine = S.mySeat(r);
  if (mine && !mine.trackStats && r.status !== "done" && S.keepsAny(S.myKeep()) && !(S.state.settings.trackAsked || {})[rid]) {
    S.state.settings.trackAsked = { ...(S.state.settings.trackAsked || {}), [rid]: 1 };
    S.setTrackStats(r, mine, true);
  }
  const seats = S.scoringSeats(r);
  const groups = [...new Set(seats.map(e => e.group || 1))].sort((a, b) => a - b);
  const myGroup = mine ? mine.group || 1 : 0;
  if (ui.groupFilter[rid] === undefined && groups.length > 1 && myGroup) ui.groupFilter[rid] = myGroup;
  const gf = groups.includes(groupOf(rid)) ? groupOf(rid) : 0;
  const shown = seats.map(e => [e, r.entries.indexOf(e)]).filter(([e]) => !gf || (e.group || 1) === gf);
  const kinds = S.statsFor(rid);
  const tee = (mine && mine.tee) || r.defaultTee;
  const metres = c.tees[tee] && c.tees[tee].metres;

  const rows = Math.ceil(n / 9);
  const strip = c.par.map((_, k) => {
    const playing = seats.filter(e => !S.joinsLate(r, e, k));
    const done = playing.length && playing.every(e => e.scores[k] !== null);
    const some = seats.some(e => e.scores[k] !== null);
    return `<a class="hstep num ${k === h ? "cur" : ""} ${done ? "done" : some ? "some" : ""}" href="#score/${rid}/${k}" data-h="${k}" ${k === h ? 'aria-current="true"' : ""}>${c.first_hole + k}</a>`;
  }).join("");

  const noPar = c.unlisted && !c.par[h];
  const meta = c.unlisted
    ? `<div class="efield hpar"><span class="flab">Par</span><div class="eseg">${[3, 4, 5].map(p => `<button data-act="set-par" data-p="${p}" class="${c.par[h] === p ? "on" : ""}">${p}</button>`).join("")}</div></div>`
    : `<div class="hmeta"><b>Par ${c.par[h]}</b>${metres ? ` · ${S.lengthIn(metres[h])} ${S.units()}` : ""} · SI ${c.stroke_index[h]}</div>`;
  const body = `
    <div class="holebar"><span class="hnum num">${c.first_hole + h}</span>${meta}${syncPill()}</div>
    <div class="holestrip" style="grid-template-columns:repeat(${Math.ceil(n / rows)},1fr)">${strip}</div>
    ${gf ? `<button class="gfchip" data-act="board">Group ${gf} · all groups ›</button>` : ""}${r.event ? `<a class="gfchip" href="#event/${rid}">Tee sheet ›</a>` : ""}
    ${matchStrip(r, c, h, gf)}
    ${noPar ? `<p class="muted center">What par is hole ${c.first_hole + h}? Pick it above and the scores open.</p>`
      : `<div class="prows" id="rows">${shown.map(([e, i]) => block(r, c, e, i, h, kinds)).join("")}</div>`}
    ${seats.length ? "" : `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}
    <p class="sr" id="said" aria-live="polite"></p>`;
  // the card runs round from the hole this group teed off on: off the tenth, 10 to 18 and then 1 to 9
  const start = S.groupStart(r, gf || myGroup || 1) ?? 0;
  const next = (h + 1) % n, prev = (h - 1 + n) % n, last = next === start;
  const onward = last ? "Finish" : `Hole ${c.first_hole + next}`;
  const done = () => { const p = seats.filter(x => !S.joinsLate(r, x, h)); return p.length && p.every(x => x.scores[h] !== null); };
  const bar = `${h === start ? `<a class="btn half" href="#players/${rid}">‹ Players</a>` : `<a class="btn half" href="#score/${rid}/${prev}">‹ Hole ${c.first_hole + prev}</a>`}
    <a class="btn half ${done() ? "primary" : ""}" href="${last ? `#review/${rid}` : `#score/${rid}/${next}`}">${esc(onward)} ›</a>`;
  const here = `${rid}/${h}`, again = ui.lastScore === here;
  ui.lastScore = here;
  const before = again ? SEEN.get(here) : null, now = r.entries.map(e => e.scores[h]);
  SEEN.set(here, now);
  page(roundName(r), body, { back: "#home", bar, sub: [formatLabel(r.format), roundPlace(r, c)].filter(Boolean).join(" · "), bell: false, keepScroll: again,
    actions: `<button class="iconbtn" data-act="bag" aria-label="My bag">${ICONS.bag}</button><button class="iconbtn" data-act="board" aria-label="The board">${ICONS.table}</button><button class="iconbtn" data-act="menu" aria-label="More">${ICONS.more}</button>` });

  const remark = () => {
    const chip = document.querySelector(`.holestrip [data-h="${h}"]`);
    const d = !!done(), some = seats.some(e => e.scores[h] !== null);
    if (chip) { chip.classList.toggle("done", d); chip.classList.toggle("some", !d && some); }
    const ow = document.querySelector("footer.bar a:last-child");
    if (ow) ow.classList.toggle("primary", d);
    const pill = document.querySelector(".syncpill");
    if (pill) swapPill(pill);
    if (Mo.isMatchFormat(r.format)) { const ms = document.querySelector(".matchstrip"); if (ms) ms.outerHTML = matchStrip(r, c, h, gf); }
  };
  const refresh = i => {
    const el = document.querySelector(`.prow[data-i="${i}"]`);
    if (el) el.outerHTML = block(r, c, r.entries[i], i, h, kinds);
    now[i] = r.entries[i].scores[h];
    remark();
  };
  if (before) now.forEach((v, i) => { if (before[i] !== v) document.querySelector(`.prow[data-i="${i}"] .sval`)?.classList.add("fresh"); });

  // a swipe across the card turns the page, as a scorecard would; the bar's arrows stay the visible way
  let x0 = null, y0 = null;
  const main = document.querySelector("main");
  main.addEventListener("touchstart", e => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
  main.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const to = h + (dx < 0 ? 1 : -1);
      if (to >= 0 && to < n) go(`#score/${rid}/${to}`); else if (to === n) go(`#review/${rid}`);
    }
  }, { passive: true });

  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "bag") return bagSheet(r, c, h);
    if (act === "board") { const v = await boardSheet(r, c); if (v && String(v).startsWith("gf-")) { ui.groupFilter[rid] = Number(String(v).slice(3)); return score(rid, h); } return; }
    if (act === "menu") return menuSheet(r);
    if (act === "set-par") { S.setPar(r, h, Number(b.dataset.p)); return score(rid, h); }
    if (act === "concede") {
      // conceding is the side picking up: their ball is out of the hole, which loses it to any score
      const mine = shown.map(([x]) => x);
      for (const e of mine.filter(x => x.side === b.dataset.s)) S.setScore(r, e, h, 0);
      for (const e of mine.filter(x => x.side !== b.dataset.s && x.scores[h] === null)) S.setScore(r, e, h, c.par[h]);
      toast("Hole conceded");
      return score(rid, h);
    }
    if (noPar) return;
    const i = Number(b.dataset.i);
    const e = r.entries[i];
    if (!e || S.joinsLate(r, e, h)) return;
    if (["inc", "dec", "par"].includes(act)) {
      const par = c.par[h], v = e.scores[h];
      if (act === "inc") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.min(30, v + 1));
      else if (act === "dec") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.max(1, v - 1));
      else if (v === null || v === 0) S.setScore(r, e, h, par);
      else return;
      if (e.role !== "team") seedStats(r, e, h, c, kinds);
      refresh(i);
      const said = document.getElementById("said");
      if (said) said.textContent = `${e.name}: ${e.scores[h]}, ${Mo.SCORE_BUCKETS[Mo.scoreBucket(e.scores[h] - par)].label.toLowerCase()}`;
      return land(document.querySelector(`.prow[data-i="${i}"] .sval .mk`));
    }
    if (act === "x-inc" || act === "x-dec") { statStep(r, e, h, b.dataset.k, act === "x-inc" ? 1 : -1, c, kinds); return refresh(i); }
    if (act === "st-fw") { statTap(r, e, h, act, b); return refresh(i); }
  });
}
