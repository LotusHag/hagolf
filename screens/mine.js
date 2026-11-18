// What is mine: the Stats tab (my numbers, and every round I can see), my bag of club distances, and which extras I
// keep. Stats is one row of tabs over the same numbers.
import * as S from "../store.js";
import * as A from "../auth.js";
import { page, bind, esc, go, toast, ui, plural, firstName, fmtDate, scrollPos, scrollAt, roundWhere, roundClub, roundLoop, resumeHash, safeCompute, ICONS, emptyState, ordinal, sheet, confirmSheet, subtabs } from "../ui.js";
import { compute, fix, fmtToPar, STAT_SWITCHES, matchWith } from "../model.js";
import { myGame, myGameBody } from "./stats.js";
import { dayBlock, nowCard, formatLabel } from "./home.js";
import { sendMine } from "../images.js";

const TOPICS = [
  ["scoring", "Scoring"],
  ["shots", "Shots"],
  ["trends", "Trends"],
  ["nines", "Nines"],
  ["rounds", "Rounds"],
];
// putts and strokes gained were tabs of their own before they became Shots; an old link still lands there.
// Head to head lives inside a society now, so its old link lands on Scoring.
const FORMER = { extras: "shots", sg: "shots", h2h: "scoring" };

/** One row of tabs for everything under Stats: each topic is a view of the same numbers, not a page of its own. */
function tabRow(on) {
  return subtabs(TOPICS
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
  const t = FORMER[topic] || topic;
  const on = view === "rounds" ? "rounds" : view === "t" && TOPICS.some(([k]) => k === t) ? t : "scoring";
  if (on === "rounds") return roundsList();
  const { p } = myGame();
  const anyExtras = p && p.statline.any;
  page("Stats", `
    ${tabRow(on)}
    ${p ? `${on === "scoring" ? tiles(p) : ""}${myGameBody(on)}
        ${on === "scoring" ? `<div class="sendrow"><button class="sendlink" data-act="send-mine">Send your season</button></div>` : ""}
        ${on === "shots" && !anyExtras ? `<p class="muted small center">Keep putts and fairways on your card and greens, the spread off the tee and your putting appear here. <a href="#me/keep">Choose what you keep ›</a></p>` : ""}`
      : emptyState("chart", "No numbers yet", "Play a round, or scan an old card, and they start here.")}`,
    { back: "", tabs: "stats", keepScroll: ui.statsTab === on });
  ui.statsTab = on;
  bindTabs();
}

function bindTabs() {
  bind(ev => {
    if (ev.target.closest("[data-act=send-mine]")) { const { St, p } = myGame(); return p && sendMine(St, p); }
    const b = ev.target.closest("[data-act=stab]");
    if (!b) return;
    go(b.dataset.t === "rounds" ? "#stats/rounds" : b.dataset.t === "scoring" ? "#stats" : `#stats/t/${b.dataset.t}`);
  });
}

// ---------------------------------------------------------------- every round I can see
/** My side's result in a match: won, lost or halved, and by how much. */
export function matchFor(M, seat, r) {
  // in a scramble match my side is my team's
  const team = seat.role === "member" ? r.entries.find(t => t.role === "team" && (t.members || []).includes(seat.playerId)) : null;
  const side = (team || seat).side || "";
  const m = matchWith(M.matches, (team || seat).playerId);
  if (!m || (side !== "A" && side !== "B")) return null;
  const mine = m.leader === side, n = Math.abs(m.up);
  const word = !m.result ? `THRU ${m.thru}` : !m.leader ? "HALVED" : mine ? "WON" : "LOST";
  // the margin from my side, the way a match card reads it: 3&2 either way, otherwise holes up or down
  const margin = !m.leader ? "AS" : m.result && m.left ? `${n}&${m.left}` : `${n} ${mine ? "UP" : "DN"}`;
  const other = m.sides[side === "A" ? "B" : "A"];
  return { word, margin, against: `v ${other.map(firstName).join(" & ")}` };
}

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
    const won = M && seat ? matchFor(M, seat, r) : null;
    const val = won ? `<span class="v">${esc(won.margin)}<small class="u"> ${won.word}</small><small class="pl">${esc(won.against)}</small></span>`
      : !mine ? `<span class="chev">›</span>` : r.format === "stroke" ? `<span class="v">${mine.net ?? "NR"}<small class="u"> NET</small></span>`
      : `<span class="v">${mine.pts}<small class="u"> PTS</small><small class="pl">${ordinal(mine.splace)} of ${M.field}</small></span>`;
    return `<a class="rround hrow lead" href="${resumeHash(r)}">${dayBlock(r.date)}
      <span class="t"><b>${esc(roundClub(r))}${shared.has(r.id) ? ` <i class="tag">shared</i>` : ""}</b>
        <span>${esc([year, roundLoop(r), formatLabel(r.format), plural(r.entries.filter(e => e.role !== "team").length, "player")].filter(Boolean).join(" · "))}</span></span>
      ${val}</a>`;
  };
  const list = shown.filter(hit);
  page("Stats", `
    ${tabRow("rounds")}
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
      : `${emptyState("bag", "Your clubs and how far they go", "Note them once; they're one tap away on every hole.")}<button class="btn primary wide" data-act="starter">Start with a usual bag</button>`}
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
      <label>Note <span class="muted">optional</span><input name="note" value="${esc(c ? c.note || "" : "")}" placeholder="into the wind: one more club"></label>
      ${c ? `<div class="clubplace"><span>Place in the bag</span><div><span class="muted" id="clubat">${clubAt(c.club_id)}</span>
        <button type="button" class="btn small" data-move="-1" aria-label="Move up">↑</button><button type="button" class="btn small" data-move="1" aria-label="Move down">↓</button></div></div>` : ""}</form>`,
    actions: [{ label: "Save", value: "ok", kind: "primary" }, ...(c ? [{ label: "Take it out of the bag", value: "del", kind: "danger" }] : []), { label: "Cancel", value: "no" }],
    onOpen: el => {
      const f = el.querySelector("#clubf"); const k = () => { window.__club = Object.fromEntries(new FormData(f)); }; f.addEventListener("input", k); k(); f.club.focus();
      // Moves take effect at once, so the list behind is already in its new order whichever way the sheet shuts.
      f.addEventListener("click", ev => { const m = ev.target.closest("[data-move]"); if (!m) return; S.moveClub(c.club_id, +m.dataset.move); f.querySelector("#clubat").textContent = clubAt(c.club_id); });
    } });
  const d = window.__club; window.__club = null;
  if (v === "del" && c) return S.removeClub(c.club_id);
  if (v !== "ok" || !d || !d.club.trim()) return;
  const carry = S.lengthOut(d.carry);
  const x = S.saveClub({ club_id: c ? c.club_id : undefined, club: d.club.trim(), carry_m: carry, total_m: S.lengthOut(d.total), note: d.note.trim() });
  if (carry && !(c && c.carry_m)) S.placeByCarry(x.club_id);
}

function clubAt(id) {
  const list = S.bag();
  return `${list.findIndex(x => x.club_id === id) + 1} of ${list.length}`;
}

// ---------------------------------------------------------------- which extras I keep
export function keepPage() {
  const k = S.myKeep() || {};
  const adv = S.keepsAny(k);
  const opt = (v, label, sub) => `<label class="radiorow"><input type="radio" name="keep" value="${v}" ${(v === "advanced") === adv ? "checked" : ""}><span><b>${esc(label)}</b><small>${esc(sub)}</small></span></label>`;
  page("Stats I keep", `
    <div class="card radios">
      ${opt("simple", "Simple", "just the score on every hole")}
      ${opt("advanced", "Advanced", "putts, fairways, bunker shots and penalties as well")}
    </div>
    ${adv ? `<div class="card checks">${STAT_SWITCHES.map(s => `<label><input type="checkbox" name="kind" value="${s.key}" ${k[s.key] ? "checked" : ""}> ${esc(s.label)}</label>`).join("")}</div>
    <p class="muted small">Greens in regulation, up and down and sand saves are worked out from these.</p>` : ""}
    <p class="muted small">This follows you onto every card. One round can be switched under its options; a guest from their row.</p>`,
    { back: "#me", bell: false });
  document.querySelector("main").addEventListener("change", ev => {
    if (ev.target.name === "keep") {
      S.setMyKeep(ev.target.value === "advanced" ? S.KEEP_PRESETS.all : S.KEEP_PRESETS.score);
    } else if (ev.target.name === "kind") {
      // unticking the last one is choosing Simple
      S.setMyKeep(Object.fromEntries(STAT_SWITCHES.map(s => [s.key, !!document.querySelector(`input[name=kind][value=${s.key}]`).checked])));
    } else return;
    if (A.signedIn()) A.update({ keep: S.myKeep() }).catch(e => toast(e.message));
    keepPage();
  });
}
