// What is mine: the Stats tab (my numbers, and every round I can see), my bag of club distances, which extras I
// keep, and the cards that may be mine. Stats is one row of tabs over the same numbers.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as Y from "../sync.js";
import { page, bind, esc, go, toast, ui, plural, fmtDate, scrollPos, scrollAt, roundWhere, roundClub, roundLoop, resumeHash, safeCompute, ICONS, emptyState, ordinal, sheet, confirmSheet, subtabs } from "../ui.js";
import { compute, fix, fmtToPar, STAT_SWITCHES } from "../model.js";
import { myGame, myGameBody } from "./stats.js";
import { dayBlock, nowCard, formatLabel } from "./home.js";

const TOPICS = [
  ["scoring", "Scoring"],
  ["extras", "Putts & more"],
  ["sg", "Strokes gained"],
  ["nines", "Nines"],
  ["h2h", "Head to head"],
  ["rounds", "Rounds"],
];

/** One row of tabs for everything under Stats: each topic is a view of the same numbers, not a page of its own. */
function tabRow(on, anyExtras) {
  return subtabs(TOPICS.filter(([k]) => k !== "extras" || anyExtras || on === "extras")
    .map(([k, label]) => `<button data-act="stab" data-t="${k}" class="${k === on ? "on" : ""}">${esc(label)}</button>`).join(""));
}

/** The headline numbers, with the form of the last ten rounds drawn the width of the card. */
function tiles(p) {
  const a = A.account();
  const hi = a && a.hi !== null && a.hi !== undefined ? a.hi : null;
  const tile = (big, small) => `<div><b class="num">${big}</b><small>${small}</small></div>`;
  const recent = p.rounds.slice(-10).map(x => x.pts);
  const spark = recent.length > 1 ? (() => {
    const lo = Math.min(...recent), hi2 = Math.max(...recent), w = 300, h = 40, k = (w - 8) / (recent.length - 1);
    const pts = recent.map((v, i) => `${4 + i * k},${h - 4 - (hi2 === lo ? (h - 8) / 2 : ((v - lo) / (hi2 - lo)) * (h - 8))}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="points in your last ${recent.length} rounds"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg><div class="sparkcap muted small">points, last ${recent.length} rounds</div>`;
  })() : "";
  return `<div class="mecard"><div class="stats">${hi !== null ? tile(fix(hi), "hcp") : ""}${tile(fix(p.avgPts), "avg pts")}${tile(p.bestPts, "best")}${tile(p.played, plural(p.played, "round").split(" ")[1])}</div>${spark}</div>`;
}

export function stats(view, topic) {
  const on = view === "rounds" ? "rounds" : view === "t" && TOPICS.some(([k]) => k === topic) ? topic : "scoring";
  if (on === "rounds") return roundsList();
  const { p } = myGame();
  const anyExtras = p && p.statline.any;
  page("Stats", `
    ${tabRow(on, anyExtras)}
    ${p ? `${tiles(p)}${myGameBody(on)}
        ${on === "extras" && !anyExtras ? `<p class="muted small center">Nothing kept yet. <a href="#me/keep">Choose what you keep ›</a></p>` : ""}
        ${on === "scoring" && !anyExtras ? `<p class="muted small center">Want putts and greens in regulation too? <a href="#me/keep">Choose what you keep ›</a></p>` : ""}`
      : emptyState("chart", "No numbers yet", "Play a round, or scan an old card, and they start here.")}`,
    { back: "", tabs: "stats", keepScroll: ui.statsTab === on });
  ui.statsTab = on;
  bindTabs();
}

function bindTabs() {
  bind(ev => {
    const b = ev.target.closest("[data-act=stab]");
    if (!b) return;
    go(b.dataset.t === "rounds" ? "#stats/rounds" : b.dataset.t === "scoring" ? "#stats" : `#stats/t/${b.dataset.t}`);
  });
}

// ---------------------------------------------------------------- every round I can see
function roundsList() {
  const rounds = S.rounds();
  const open = rounds.filter(r => r.status !== "done");
  const finished = rounds.filter(r => r.status === "done");
  const shared = S.sharedWithMe();
  const f = ui.roundsFilter;
  const shown = f === "mine" ? finished.filter(r => S.mySeat(r)) : f === "shared" ? finished.filter(r => shared.has(r.id)) : finished;
  const q = (ui.search || "").toLowerCase().trim();
  const hit = r => !q || [fmtDate(r.date), roundWhere(r), r.name, ...r.entries.map(e => e.name)].join(" ").toLowerCase().includes(q);
  const thisYear = String(new Date().getFullYear());
  const row = r => {
    const M = safeCompute(compute, r);
    const seat = S.mySeat(r);
    const mine = M && seat ? M.players.find(x => x.id === seat.playerId) : null;
    const year = r.date && !String(r.date).startsWith(thisYear) ? String(r.date).slice(0, 4) : "";
    const val = !mine ? `<span class="chev">›</span>` : r.format === "stroke" ? `<span class="v">${mine.net ?? "NR"}<small class="u"> NET</small></span>`
      : `<span class="v">${mine.pts}<small class="u"> PTS</small><small class="pl">${ordinal(mine.splace)} of ${M.field}</small></span>`;
    return `<a class="rround hrow lead" href="${resumeHash(r)}">${dayBlock(r.date)}
      <span class="t"><b>${esc(roundClub(r))}${shared.has(r.id) ? ` <i class="tag">shared</i>` : ""}</b>
        <span>${esc([year, roundLoop(r), formatLabel(r.format), plural(r.entries.filter(e => e.role !== "team").length, "player")].filter(Boolean).join(" · "))}</span></span>
      ${val}</a>`;
  };
  const list = shown.filter(hit);
  page("Stats", `
    ${tabRow("rounds", (myGame().p || {}).statline?.any)}
    ${open.length ? `<h2>Playing now</h2>${open.map(nowCard).join("")}` : ""}
    <div class="filter mini"><button data-act="rf" data-v="all" class="${f === "all" ? "on" : ""}">All</button><button data-act="rf" data-v="mine" class="${f === "mine" ? "on" : ""}">Mine</button><button data-act="rf" data-v="shared" class="${f === "shared" ? "on" : ""}">Shared</button></div>
    ${finished.length > 6 ? `<input id="q" class="search" placeholder="Search by date, course or player" value="${esc(ui.search || "")}" autocomplete="off">` : ""}
    ${list.length ? `<div class="rows rlist">${list.map(row).join("")}</div>` : (finished.length ? `<p class="muted center small">Nothing here.</p>` : emptyState("golf", "No rounds yet", "Press Play, or scan an old paper card."))}`,
    { back: "", tabs: "stats", actions: `<a class="iconbtn" href="#scan" aria-label="Scan a paper card">${ICONS.camera}</a>` });
  const qEl = document.getElementById("q");
  if (qEl) qEl.addEventListener("input", () => { ui.search = qEl.value; const y = scrollPos(); roundsList(); scrollAt(y); const n = document.getElementById("q"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
  bind(ev => {
    const b = ev.target.closest("[data-act=rf]");
    if (b) { ui.roundsFilter = b.dataset.v; return roundsList(); }
    const t = ev.target.closest("[data-act=stab]");
    if (t) go(t.dataset.t === "rounds" ? "#stats/rounds" : t.dataset.t === "scoring" ? "#stats" : `#stats/t/${t.dataset.t}`);
  });
}

// ---------------------------------------------------------------- my bag
export function bagPage() {
  const clubs = S.bag();
  const u = S.units();
  page("My bag", `
    <div class="filter seg2"><button data-act="units" data-v="m" class="${u === "m" ? "on" : ""}">Metres</button><button data-act="units" data-v="yd" class="${u === "yd" ? "on" : ""}">Yards</button></div>
    ${clubs.length ? `<div class="list bag">${clubs.map(c => `<button data-act="edit" data-id="${esc(c.club_id)}"><div><div class="name">${esc(c.club)}</div>${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ""}</div>
        <span class="num bagnum">${c.carry_m ? S.lengthIn(c.carry_m) : "–"}<small>${c.total_m ? ` / ${S.lengthIn(c.total_m)}` : ""} ${u}</small></span></button>`).join("")}</div>
        <p class="muted small center">Carry, then total. The bag button on the scoring screen shows these on every hole.</p>`
      : `${emptyState("golf", "Your clubs and how far they go", "Note them once; they're one tap away on every hole.")}<button class="btn primary wide" data-act="starter">Start with a usual bag</button>`}
    <button class="btn wide" data-act="add">+ Add a club</button>`,
    { back: "#me", bell: false });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "units") { S.setSetting("units", b.dataset.v); if (A.signedIn()) A.update({ units: b.dataset.v }).catch(() => {}); return bagPage(); }
    if (act === "starter") { S.STARTER_BAG.forEach((club, i) => S.saveClub({ club, sort: i })); return bagPage(); }
    if (act === "add") { await clubSheet(null); return bagPage(); }
    if (act === "edit") { await clubSheet(clubs.find(c => c.club_id === b.dataset.id)); return bagPage(); }
  });
}

async function clubSheet(c) {
  const u = S.units();
  const v = await sheet({ title: c ? c.club : "A club", body: `<form id="clubf">
      <label>Club<input name="club" value="${esc(c ? c.club : "")}" placeholder="7 iron" autocapitalize="words"></label>
      <div class="two"><label>Carry (${u})<input name="carry" inputmode="numeric" value="${c && c.carry_m ? S.lengthIn(c.carry_m) : ""}"></label>
        <label>Total (${u}) <span class="muted">optional</span><input name="total" inputmode="numeric" value="${c && c.total_m ? S.lengthIn(c.total_m) : ""}"></label></div>
      <label>Note <span class="muted">optional</span><input name="note" value="${esc(c ? c.note || "" : "")}" placeholder="into the wind: one more club"></label></form>`,
    actions: [{ label: "Save", value: "ok", kind: "primary" }, ...(c ? [{ label: "Take it out of the bag", value: "del", kind: "danger" }] : []), { label: "Cancel", value: "no" }],
    onOpen: el => { const f = el.querySelector("#clubf"); const k = () => { window.__club = Object.fromEntries(new FormData(f)); }; f.addEventListener("input", k); k(); f.club.focus(); } });
  const d = window.__club; window.__club = null;
  if (v === "del" && c) return S.removeClub(c.club_id);
  if (v !== "ok" || !d || !d.club.trim()) return;
  S.saveClub({ club_id: c ? c.club_id : undefined, club: d.club.trim(), carry_m: S.lengthOut(d.carry), total_m: S.lengthOut(d.total), note: d.note.trim(), sort: c ? c.sort : S.bag().length });
}

// ---------------------------------------------------------------- which extras I keep
export function keepPage() {
  const k = S.myKeep() || {};
  const preset = ui.keepChoose ? "choose" : S.keepPreset(k);
  const opt = (v, label, sub) => `<label class="radiorow"><input type="radio" name="keep" value="${v}" ${preset === v ? "checked" : ""}><span><b>${esc(label)}</b><small>${esc(sub)}</small></span></label>`;
  page("Stats I keep", `
    <div class="card radios">
      ${opt("score", "Score only", "just the number on every hole")}
      ${opt("putts", "Score + putts", "gives greens in regulation, up and down, putts per green")}
      ${opt("all", "Everything", "putts, fairways, bunker shots and penalties")}
      ${opt("choose", "Choose…", "pick them one by one")}
    </div>
    ${preset === "choose" ? `<div class="card checks">${STAT_SWITCHES.map(s => `<label><input type="checkbox" name="kind" value="${s.key}" ${k[s.key] ? "checked" : ""}> ${esc(s.label)}</label>`).join("")}</div>` : ""}
    <p class="muted small">Greens in regulation, up and down and sand saves are worked out for you. This follows you onto every card; a guest can be switched on from their row.</p>`,
    { back: "#me", bell: false });
  document.querySelector("main").addEventListener("change", ev => {
    if (ev.target.name === "keep") {
      ui.keepChoose = ev.target.value === "choose";
      if (!ui.keepChoose) S.setMyKeep(S.KEEP_PRESETS[ev.target.value]);
    } else if (ev.target.name === "kind") {
      S.setMyKeep(Object.fromEntries(STAT_SWITCHES.map(s => [s.key, !!document.querySelector(`input[name=kind][value=${s.key}]`).checked])));
    } else return;
    if (A.signedIn()) A.update({ keep: S.myKeep() }).catch(e => toast(e.message));
    keepPage();
  });
}

// ---------------------------------------------------------------- cards that may be mine
export async function seatsPage() {
  page("Were you on these cards?", `<p class="muted center">Looking…</p>`, { back: "#me", bell: false });
  let seats = [];
  try { seats = (await A.api("/account/seats")).seats || []; } catch (e) { return page("Were you on these cards?", `<div class="banner warn">${esc(e.message)}</div>`, { back: "#me" }); }
  const draw = () => page("Were you on these cards?", seats.length ? `
    <p class="muted small">Someone put your name or your account on these cards. Say yes and they count as yours, and you can correct them; say no and they're taken off.</p>
    <div class="list">${seats.map((x, i) => `<div class="seatrow"><div><div class="name">${esc(x.roundName || "A round")}</div><div class="muted small">${esc(fmtDate(x.date))} · as ${esc(x.name)}</div></div>
      <div class="btnrow"><button class="btn small primary" data-act="yes" data-i="${i}">That's me</button><button class="btn small" data-act="no" data-i="${i}">Not me</button></div></div>`).join("")}</div>`
    : emptyState("check", "Nothing to answer", "Every card with your name on it is settled."), { back: "#me", bell: false });
  draw();
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const x = seats[Number(b.dataset.i)];
    try {
      await A.api("/account/seats/answer", { round: x.round, seat: x.seat, yes: b.dataset.act === "yes" });
      seats = seats.filter(y => y !== x);
      toast(b.dataset.act === "yes" ? "Counted as yours" : "Taken off");
      draw();
      Y.resync().catch(() => {});
    } catch (e) { toast(e.message, 5000); }
  });
}
