// Scoring, one hole at a time. Every player (or scramble team) is one block: the score on a − / + stepper that
// starts at par, and beside it the extras that golfer keeps. The header carries three things and no more: the
// bag (club distances), the board (reference) and ⋯ (actions). Nothing here waits for the network: the pill
// says whether the card has reached the others yet.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as Mo from "../model.js";
import { page, bind, esc, go, plural, courseTitle, courseBy, noCourse, ui, sheet, ICONS, firstName, toast } from "../ui.js";
import { handicapFor, stableford, NO_SCORE } from "../model.js";
import { scoreStepper, extrasRows, ptsSoFar } from "../pad.js";
import { statTap, statStep, seedStats } from "./extras.js";
import { dropRound, inviteSheet } from "./players.js";
import { formatLabel, liveBoard } from "./home.js";

const groupOf = rid => ui.groupFilter[rid] || 0;
const infoFor = (r, c, e) => {
  try { return handicapFor(c, { ...e, courseHandicap: e.courseHandicap ?? S.getPch(e.contactId || e.playerId, r.course, e.tee) }, r.defaultTee, r.allowance); }
  catch (err) { return null; }
};

// ---------------------------------------------------------------- one player, everything about this hole
function block(r, c, e, i, h, kinds) {
  const info = infoFor(r, c, e);
  const par = info ? info.par[h] : c.par[h];
  if ((e.fromHole || 1) - 1 > h)
    return `<div class="prow skip" data-i="${i}"><div class="phead"><span class="pname">${esc(e.name)}</span>
      <span class="muted small">joins at hole ${c.first_hole + e.fromHole - 1}</span></div></div>`;
  const v = e.scores[h], st = info && !c.unlisted ? info.strokes[h] : 0;
  const entered = e.scores.some(x => x !== null);
  const stbl = (r.format || "stableford") === "stableford";
  const pts = !stbl || v === null || !info || c.unlisted ? null : v === 0 ? 0 : stableford(v, par, info.strokes[h]);
  const played = e.scores.map((x, k) => [x, k]).filter(([x]) => x !== null);
  const gross = played.reduce((t, [x]) => t + (x || NO_SCORE), 0);
  const toPar = info ? gross - played.reduce((t, [, k]) => t + info.par[k], 0) : null;
  const tally = !entered ? "" : `<span class="ptally">
      <span class="ptot"><b class="num">${gross}</b><small>strokes</small>${stbl && info ? `<b class="num">${ptsSoFar(e, info)}</b><small>pts</small>`
        : toPar !== null ? `<b class="num">${toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar}</b><small>to par</small>` : ""}</span>
      ${stbl ? (pts === null ? `<b class="phole gap" aria-hidden="true"></b>` : `<b class="phole num ${pts ? "" : "nil"}">+${pts}</b>`) : ""}</span>`;
  const who = e.role === "team" ? `<small class="members">${esc(r.entries.filter(m => e.members.includes(m.playerId)).map(m => firstName(m.name)).join(" · "))}</small>` : "";
  return `<div class="prow" data-i="${i}">
    <div class="phead">
      <span class="pname">${r.format === "match" && e.side ? `<i class="side">${e.side}</i>` : ""}${esc(e.name)}${st ? `<i class="dots"><span>${"•".repeat(Math.min(st, 4))}</span><span class="sr">${plural(st, "stroke")}</span></i>` : ""}${who}</span>
      ${tally}
    </div>
    ${scoreStepper(e, i, h, par)}
    ${e.role === "team" ? "" : extrasRows(c, e, i, h, kinds)}</div>`;
}

/** The state of a match, in one line, with a concede button for each side on this hole. */
function matchStrip(r, c, h) {
  if (r.format !== "match" || !Mo.matchPlay) return "";
  let M;
  try { M = Mo.matchPlay(c, { ...S.toModelRound(r), final: false }); } catch (e) { return `<div class="matchstrip warn">${esc(e.message)} · <a href="#players/${r.id}">fix the sides</a></div>`; }
  const hole = M.holes[h];
  const decided = hole && hole.winner;
  return `<div class="matchstrip"><b>${esc(M.result || M.status)}</b>
    ${decided || M.result ? "" : `<span class="concede">${["A", "B"].map(sd => `<button class="btn small ghost" data-act="concede" data-s="${sd}">${esc(M.sides[sd].map(firstName).join(" & "))} concede${M.sides[sd].length > 1 ? "" : "s"}</button>`).join("")}</span>`}</div>`;
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
  let list = [];
  if (r.format === "match" && Mo.matchPlay) {
    try { const M = Mo.matchPlay(c, { ...S.toModelRound(r), final: false }); list = [{ place: "", name: `${M.sides.A.join(" & ")} v ${M.sides.B.join(" & ")}`, main: M.result || M.status, sub: "" }]; } catch (e) { list = []; }
  } else {
    const L = liveBoard(r);
    list = L ? L.rows.filter(x => !gf || x.group === gf) : [];
  }
  const rows = list.length ? list.map(x => `<div class="hrowb"><span><b>${x.place ?? "–"}</b> ${esc(x.name)}</span><span class="num">${esc(x.main)}${x.sub ? ` <small class="muted">${esc(x.sub)}</small>` : ""}</span></div>`).join("") : `<p class="muted">Nothing to rank yet.</p>`;
  const v = await sheet({ title: formatLabel(r.format), lead: `${r.name} · as it stands`,
    body: `${groups.length > 1 ? `<div class="filter">${[0, ...groups].map(g => `<button data-sheet="gf-${g}" class="${gf === g ? "on" : ""}">${g ? `Group ${g}` : "All"}</button>`).join("")}</div>` : ""}<div class="hboard">${rows}</div>`,
    actions: [{ label: "Close", value: "no", kind: "primary" }] });
  return v;
}

async function menuSheet(r) {
  const mine = S.mySeat(r);
  const v = await sheet({ title: r.name, body: `<div class="list">
      <button data-sheet="players"><span class="lead">${ICONS.people}<div><div class="name">Players, sides and handicaps</div></div></span><span class="chev">›</span></button>
      <button data-sheet="invite"><span class="lead">${ICONS.link}<div><div class="name">Invite to this card</div><div class="muted small">They score with you, live</div></div></span><span class="chev">›</span></button>
      ${mine ? `<button data-sheet="track"><span class="lead">${ICONS.chart}<div><div class="name">${mine.trackStats ? "Stop keeping my putts and the rest" : "Keep my putts and the rest"}</div></div></span></button>` : ""}
      <button data-sheet="card"><span class="lead">${ICONS.card}<div><div class="name">The whole card</div></div></span><span class="chev">›</span></button>
      <button data-sheet="live"><span class="lead">${ICONS.trophy}<div><div class="name">${r.live ? "Live board is on" : "Show it on a live board"}</div><div class="muted small">For the people at home and the clubhouse screen</div></div></span><span class="chev">›</span></button>
    </div>`, actions: [{ label: "Discard this round", value: "drop", kind: "danger" }, { label: "Close", value: "no" }] });
  if (v === "players") return go(`#players/${r.id}`);
  if (v === "invite") return inviteSheet(r);
  if (v === "track") { S.setTrackStats(r, mine, !mine.trackStats); return score(r.id, S.holeOf(r)); }
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
    const playing = seats.filter(e => (e.fromHole || 1) - 1 <= k);
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
    ${gf ? `<button class="gfchip" data-act="board">Group ${gf} · all groups ›</button>` : ""}
    ${matchStrip(r, c, h)}
    ${noPar ? `<p class="muted center">What par is hole ${c.first_hole + h}? Pick it above and the scores open.</p>`
      : `<div class="prows" id="rows">${shown.map(([e, i]) => block(r, c, e, i, h, kinds)).join("")}</div>`}
    ${seats.length ? "" : `<p class="muted center">No players. <a href="#players/${rid}">Add some</a>.</p>`}`;
  const onward = h < n - 1 ? `Hole ${c.first_hole + h + 1}` : "Finish";
  const done = () => { const p = seats.filter(x => (x.fromHole || 1) - 1 <= h); return p.length && p.every(x => x.scores[h] !== null); };
  const bar = `${h === 0 ? `<a class="btn half" href="#players/${rid}">‹ Players</a>` : `<a class="btn half" href="#score/${rid}/${h - 1}">‹ Hole ${c.first_hole + h - 1}</a>`}
    <a class="btn half ${done() ? "primary" : ""}" href="${h < n - 1 ? `#score/${rid}/${h + 1}` : `#review/${rid}`}">${esc(onward)} ›</a>`;
  const here = `${rid}/${h}`, again = ui.lastScore === here;
  ui.lastScore = here;
  page(r.name, body, { back: "#home", bar, sub: `${formatLabel(r.format)} · ${courseTitle(c)}`, bell: false, keepScroll: again,
    actions: `<button class="iconbtn" data-act="bag" aria-label="My bag">${ICONS.bag}</button><button class="iconbtn" data-act="board" aria-label="The board">${ICONS.table}</button><button class="iconbtn" data-act="menu" aria-label="More">${ICONS.more}</button>` });

  const remark = () => {
    const chip = document.querySelector(`.holestrip [data-h="${h}"]`);
    const d = !!done(), some = seats.some(e => e.scores[h] !== null);
    if (chip) { chip.classList.toggle("done", d); chip.classList.toggle("some", !d && some); }
    const ow = document.querySelector("footer.bar a:last-child");
    if (ow) ow.classList.toggle("primary", d);
    const pill = document.querySelector(".syncpill");
    if (pill) pill.outerHTML = syncPill();
    if (r.format === "match") { const ms = document.querySelector(".matchstrip"); if (ms) ms.outerHTML = matchStrip(r, c, h); }
  };
  const refresh = i => {
    const el = document.querySelector(`.prow[data-i="${i}"]`);
    if (el) el.outerHTML = block(r, c, r.entries[i], i, h, kinds);
    remark();
  };

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
      for (const e of seats.filter(x => x.side === b.dataset.s)) S.setScore(r, e, h, 0);
      for (const e of seats.filter(x => x.side !== b.dataset.s && x.scores[h] === null)) S.setScore(r, e, h, c.par[h]);
      toast("Hole conceded");
      return score(rid, h);
    }
    if (noPar) return;
    const i = Number(b.dataset.i);
    const e = r.entries[i];
    if (!e || (e.fromHole || 1) - 1 > h) return;
    if (["inc", "dec", "par"].includes(act)) {
      const par = c.par[h], v = e.scores[h];
      if (act === "inc") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.min(30, v + 1));
      else if (act === "dec") S.setScore(r, e, h, (v === null || v === 0) ? par : Math.max(1, v - 1));
      else if (v === null || v === 0) S.setScore(r, e, h, par);
      else return;
      if (e.role !== "team") seedStats(r, e, h, c, kinds);
      return refresh(i);
    }
    if (act === "x-inc" || act === "x-dec") { statStep(r, e, h, b.dataset.k, act === "x-inc" ? 1 : -1, c, kinds); return refresh(i); }
    if (act === "st-fw") { statTap(r, e, h, act, b); return refresh(i); }
  });
}
