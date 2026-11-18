// Who's playing? The last screen before the first tee. One row a player: the name, the index they play off
// today and the tee they stand on, both filled in from their last card. Everything rare is behind a tap on the
// row; everything about the round itself is one line at the top. Match play splits the rows into two sides;
// a scramble puts them into teams.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import * as Y from "../sync.js";
import * as Mo from "../model.js";
import { page, bind, esc, go, ui, toast, plural, firstName, courseTitle, courseBy, noCourse, parseHI, hiOk, confirmSheet, promptSheet, sheet, teeColor, shareLink, qrHtml, fmtDate, avatar } from "../ui.js";
import { handicapFor, scratchFor, fmtHcp, fmtIndex } from "../model.js";
import { brandField } from "./partner.js";
import { formatLabel } from "./home.js";
import { readsMatches } from "./formats.js";

/** Giving up on a round: it is thrown away everywhere. A finished one is deleted by whoever was on it. */
export function dropBtn(r) {
  if (r.status === "done" && !S.iPlayed(r)) return "";
  return `<p class="center" style="margin-top:18px"><button class="btn small danger" data-act="drop-round" data-rid="${r.id}">${r.status === "done" ? "Delete this round" : "Discard this round"}</button></p>`;
}

export async function dropRound(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const scored = r.entries.reduce((n, e) => n + e.scores.filter(v => v !== null).length, 0);
  const yes = await confirmSheet(r.status === "done" ? "Delete this round?" : "Discard this round?",
    `${r.name} goes from every phone${scored ? `, with ${plural(scored, "score")} in it` : ""}. This cannot be undone.`, { label: r.status === "done" ? "Delete" : "Discard", danger: true });
  if (!yes) return;
  S.deleteRound(r.id);
  toast(`${r.name} deleted`);
  go("#home");
}

const pchOf = (r, e) => e.courseHandicap ?? S.getPch(e.contactId || e.playerId, r.course, e.tee);
// one against one or two against two, each with a side; a scramble match picks sides by team
const sidedMatch = f => f === "match" || f === "matchpts";
export function seatInfo(r, c, e) {
  try {
    if (Mo.isMatchFormat(r.format)) return scratchFor(c, e, r.defaultTee);
    return handicapFor(c, { ...e, courseHandicap: pchOf(r, e) }, r.defaultTee, r.allowance);
  } catch (err) { return { error: err.message }; }
}

/** A team's handicap from its members, the WHS way; recomputed whenever the team changes. */
export function refreshTeam(r, c, team) {
  const chs = r.entries.filter(m => team.members.includes(m.playerId)).map(m => seatInfo(r, c, m).ch).filter(x => x !== undefined && x !== null);
  const first = r.entries.find(m => team.members.includes(m.playerId));
  const ch = Mo.teamHandicap ? Mo.teamHandicap(chs) : Math.round(chs.reduce((a, b) => a + b, 0) / Math.max(1, chs.length * 2));
  team.courseHandicap = chs.length ? ch : null;
  team.tee = first ? first.tee : r.defaultTee;
  team.name = team.members.length ? r.entries.filter(m => team.members.includes(m.playerId)).map(m => firstName(m.name)).join(" & ")
    : team.side === "A" || team.side === "B" ? `Team ${team.side}` : team.name;
  S.saveEntry(r, team);
}

/** A scramble match is always two teams, side A and side B; whatever is missing is made here. */
function twoSides(r, c) {
  const teams = r.entries.filter(e => e.role === "team");
  for (const sd of ["A", "B"]) {
    if (teams.some(t => t.side === sd)) continue;
    let t = teams.find(x => x.side !== "A" && x.side !== "B");
    if (!t) { t = S.addTeam(r, c.n, { name: `Team ${sd}`, members: [], tee: r.defaultTee }); teams.push(t); }
    S.setSide(r, t, sd);
  }
}

/** How the match is settled, in words: nobody gets a shot in match play. */
function matchLine(r, c, g = 0) {
  if (!g && S.manyGroups(r)) return "";
  try {
    const m = { ...S.toModelRound(r), final: false };
    if (g) m.entries = m.entries.filter(e => (e.group || 1) === g);
    const M = Mo.matchPlay(c, m);
    const ball = M.kind === "fourball" ? "Better ball. " : "";
    return `<p class="muted small strokesline">${ball}No handicaps: each hole goes to the ${M.basis === "points" ? "most Stableford points against par" : "fewest strokes"}.</p>`;
  } catch (e) { return `<p class="muted small strokesline">${esc(e.message)}</p>`; }
}

const scrambleMatch = f => String(f || "").startsWith("scramblematch");

/** One choice inside a way of playing, as radio rows; each row is the format it turns the card into. */
const pickRows = (name, fmt, rows) => `<div class="card radios">${rows.map(([k, label, sub]) =>
  `<label class="radiorow"><input type="radio" name="${name}" data-act="variant" value="${k}" ${fmt === k ? "checked" : ""}><span><b>${label}</b><small>${sub}</small></span></label>`).join("")}</div>`;

/** Strokes or points: the one thing left to choose inside match play or a scramble once the card is open. */
function variantPick(fmt) {
  const vs = scrambleMatch(fmt);
  if (sidedMatch(fmt) || vs) {
    const [s, p] = vs ? ["scramblematch", "scramblematchpts"] : ["match", "matchpts"];
    return `<h2>Each hole goes to</h2>${pickRows("basis", fmt, [[s, "Fewest strokes", "the lower score wins the hole"],
      [p, "Most Stableford points", "points against par; two blow-ups halve the hole"]])}`;
  }
  if (!Mo.isTeamFormat(fmt)) return "";
  return `<h2>Ranked on</h2>${pickRows("score", fmt, [["scramble", "Net strokes", "the lowest net score wins"], ["scramblepts", "Stableford points", "the most points wins"]])}`;
}

/** Whether this match counts for each society that has a table for match play; a society day card always does. */
function countsPick(r) {
  if (r.leagueId || !Mo.isMatchFormat(r.format)) return "";
  const gs = S.leagues().filter(g => S.cleanFormats(g.formats).some(readsMatches));
  if (!gs.length) return "";
  const on = new Set(S.leaguesOfRound(r.id).map(g => g.id));
  return `<h2>Counts for</h2><div class="card radios">${gs.map(g => `<label class="radiorow"><input type="checkbox" data-act="counts" data-g="${esc(g.id)}" ${on.has(g.id) ? "checked" : ""}>
    <span><b>${esc(g.name)}</b><small>${on.has(g.id) ? "in its match play and Elo tables" : "a friendly: this society never sees it"}</small></span></label>`).join("")}</div>`;
}

// ---------------------------------------------------------------- the screen
export function players(rid, only = 0, keep = false) {
  const r = S.getRound(rid);
  if (!r) return go("#home");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  if (!S.isScorer(r)) return go(`#review/${rid}`);
  const tees = Object.keys(c.tees);
  const fmt = r.format || "stableford";
  // an event's group checks in on its own before it tees off: only its players, and its teams come from the draw
  const g = Number(only) || 0, inG = e => !g || S.groupOf(e) === g;
  if (scrambleMatch(fmt) && !r.event) twoSides(r, c);
  const lg = S.leaguesOfRound(rid);
  const me = S.myAccount();
  const people = r.entries.filter(e => e.role !== "team" && inG(e));
  const showGroups = people.length > 4 || people.some(e => (e.group || 1) > 1);
  const match = Mo.isMatchFormat(fmt);

  const row = e => {
    const i = r.entries.indexOf(e);
    const info = seatInfo(r, c, e);
    const sub = [e.accountId && e.accountId === me ? "you" : "",
      info.error || match ? "" : `course hcp ${fmtHcp(info.ch)}`, showGroups ? `group ${e.group || 1}` : "", (e.fromHole || 1) > 1 ? `from hole ${c.first_hole + e.fromHole - 1}` : "", e.trackStats ? "advanced stats" : ""].filter(Boolean).join(" · ");
    const side = sidedMatch(fmt) ? `<div class="eseg sides">${["A", "B"].map(sd => `<button data-act="side" data-i="${i}" data-s="${sd}" class="${e.side === sd ? "on" : ""}">${sd}</button>`).join("")}</div>` : "";
    return `<div class="card who" data-i="${i}">
      <div class="whotop"><button class="wname" data-act="psheet" data-i="${i}"><b>${esc(e.name)}</b><small>${esc(sub)}${info.error ? ` <span class="warn">${esc(info.error)}</span>` : ""}</small></button>
        ${side}
        ${match ? "" : `<label class="hiin"><span class="flab">Index</span><input class="efv hi" data-act="hi" data-i="${i}" inputmode="decimal" value="${esc(fmtIndex(Number(e.hi)))}" aria-label="${esc(e.name)}'s handicap index"></label>`}</div>
      ${c.unlisted || e.role === "member" && fmt === "scramble" && false ? "" : `<div class="tees">${tees.map(t => `<button class="tee ${t === e.tee ? "on" : ""}" style="--c:${teeColor(t)}" data-act="tee" data-i="${i}" data-t="${esc(t)}" aria-label="${esc(t)} tee" aria-pressed="${t === e.tee}"><i></i></button>`).join("")}</div>`}
    </div>`;
  };

  let rows;
  if (sidedMatch(fmt)) {
    const a = people.filter(e => e.side === "A"), b = people.filter(e => e.side === "B"), none = people.filter(e => e.side !== "A" && e.side !== "B");
    rows = `${g ? "" : variantPick(fmt) + countsPick(r)}
      ${none.length ? none.map(row).join("") : ""}
      <h2>Side A</h2>${a.map(row).join("") || `<p class="muted small">Nobody yet.</p>`}
      <h2>Side B</h2>${b.map(row).join("") || `<p class="muted small">Nobody yet.</p>`}
      ${a.length && b.length ? matchLine(r, c, g) : ""}`;
  } else if (Mo.isTeamFormat(fmt)) {
    const teams = r.entries.filter(e => e.role === "team" && inG(e));
    const free = people.filter(e => e.role !== "member");
    const vs = scrambleMatch(fmt);
    const card = t => `<div class="card team"><div class="whotop"><div class="wname"><b>${esc(t.name)}</b>${vs ? "" : `<small>team handicap ${t.courseHandicap ?? "–"}</small>`}</div>
          ${vs ? "" : `<label class="hiin"><span class="flab">Team hcp</span><input class="efv" data-act="teamch" data-tid="${esc(t.playerId)}" inputmode="numeric" value="${t.courseHandicap ?? ""}"></label>`}</div>
        <div class="chips-wrap">${r.entries.filter(m => t.members.includes(m.playerId)).map(m => `<button class="pchip on" data-act="unteam" data-tid="${esc(t.playerId)}" data-pid="${esc(m.playerId)}"><span>${esc(m.name)}</span><small>tap to take out</small></button>`).join("")}
          ${free.map(m => `<button class="pchip" data-act="toteam" data-tid="${esc(t.playerId)}" data-pid="${esc(m.playerId)}"><span><span class="plus">+</span>${esc(m.name)}</span></button>`).join("")}</div></div>`;
    const sided = ["A", "B"].map(sd => `<h2>Side ${sd}</h2>${teams.filter(t => t.side === sd).map(card).join("")}`).join("");
    const stray = teams.filter(t => t.side !== "A" && t.side !== "B");
    rows = `${g ? "" : variantPick(fmt) + countsPick(r)}${people.map(row).join("")}
      ${vs ? `${sided}${stray.length ? `<h2>Not in the match</h2>${stray.map(card).join("")}` : ""}` : `<h2>Teams</h2>${teams.map(card).join("")}`}
      ${g ? "" : `<div class="btnrow">${vs ? "" : `<button class="btn" data-act="newteam">+ Team</button>`}${people.length >= 2 ? `<button class="btn" data-act="autoteams">Make teams for me</button>` : ""}</div>`}
      ${vs && teams.some(t => t.members.length) ? matchLine(r, c, g) : ""}
      ${teams.length && !vs ? `<p class="muted small">Team handicaps follow the World Handicap System: 35% and 15% for two, 30/20/10 for three, 25/20/15/10 for four.</p>` : ""}`;
  } else rows = people.map(row).join("");

  const opts = [formatLabel(fmt), courseTitle(c), r.date === S.today() ? "today" : fmtDate(r.date), r.allowance !== 100 && !match ? `${r.allowance}%` : "", S.cardKeepsStats(r) ? "advanced stats" : "", lg.length ? `counts: ${lg.map(g => g.name).join(", ")}` : ""].filter(Boolean).join(" · ");
  const ready = sidedMatch(fmt) ? people.some(e => e.side === "A") && people.some(e => e.side === "B")
    : Mo.isTeamFormat(fmt) && !scrambleMatch(fmt) ? r.entries.some(e => e.role === "team" && inG(e) && e.members.length)
    : scrambleMatch(fmt) ? ["A", "B"].every(sd => r.entries.some(e => e.role === "team" && inG(e) && e.side === sd && e.members.length)) && !r.entries.some(e => e.role === "team" && inG(e) && e.side !== "A" && e.side !== "B" && e.members.length)
    : people.length > 0;
  const bar = !people.length ? `<button class="btn" disabled>Add players to start</button>`
    : r.status === "done" ? `<a class="btn primary" href="#review/${rid}">Back to the card ›</a>`
    : `<button class="btn primary big" data-act="tee-off" ${ready ? "" : "disabled"}>${r.status === "setup" ? "Tee off" : "Back to scoring ›"}</button>`;
  page(g ? `Group ${g}` : "Who's playing?", g ? `
    <p class="muted small">Check everyone's index and tee, then tee off.</p>
    ${rows || `<p class="muted center small">Nobody in this group.</p>`}`
    : `
    <button class="optline" data-act="options"><span>${esc(opts)}</span><span class="chev">›</span></button>
    ${rows || `<p class="muted center small">Nobody yet.</p>`}
    <div class="btnrow"><button class="btn" data-act="add">+ Add player</button><button class="btn" data-act="invite">Invite to this card</button></div>
    ${dropBtn(r)}`,
  { back: r.status === "done" ? `#review/${rid}` : r.event ? `#event/${rid}` : "#home", bar, keepScroll: keep, bell: false });

  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const e = b.dataset.i !== undefined ? r.entries[Number(b.dataset.i)] : null;
    if (act === "tee-off") {
      if (r.status === "setup") { r.status = "scoring"; S.saveRound(r); }
      if (g) { ui.groupFilter[rid] = g; const h = (people[0] || {}).fromHole || 1; if (people.every(e => e.scores.every(v => v === null))) S.setHole(r, h - 1); }
      return go(`#score/${r.id}/${S.holeOf(r)}`);
    }
    if (act === "drop-round") return dropRound(rid);
    if (act === "options") { await optionsSheet(r, c); return players(rid, only, true); }
    if (act === "add") { await addSheet(r, c); return players(rid, only, true); }
    if (act === "invite") return inviteSheet(r);
    if (act === "psheet") { await playerSheet(r, c, e); return players(rid, only, true); }
    if (act === "tee") { e.tee = b.dataset.t; S.saveEntry(r, e); teamsChanged(r, c); return players(rid, only, true); }
    if (act === "side") { S.setSide(r, e, b.dataset.s); return players(rid, only, true); }
    if (act === "newteam") { S.addTeam(r, c.n, { name: `Team ${r.entries.filter(x => x.role === "team").length + 1}`, members: [], tee: r.defaultTee }); return players(rid, only, true); }
    if (act === "toteam" || act === "unteam") {
      const t = r.entries.find(x => x.playerId === b.dataset.tid);
      const next = act === "toteam" ? [...t.members, b.dataset.pid] : t.members.filter(x => x !== b.dataset.pid);
      S.setTeamMembers(r, t, next);
      // an emptied team goes, except a scramble match's own two sides
      if (!next.length && act === "unteam" && !(scrambleMatch(r.format) && (t.side === "A" || t.side === "B"))) { const k = r.entries.indexOf(t); S.removeEntry(r, k); }
      else refreshTeam(r, c, t);
      return players(rid, only, true);
    }
    if (act === "autoteams") { await autoTeams(r, c); return players(rid, only, true); }
  });
  document.querySelector("main").addEventListener("change", ev => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "variant") { r.format = el.value; S.state.settings.lastFormat = r.format; S.saveRound(r); return players(rid, only, true); }
    if (el.dataset.act === "counts") { S.setLeagueRound(el.dataset.g, r.id, el.checked); return players(rid, only, true); }
    if (el.dataset.act === "hi") {
      const e = r.entries[Number(el.dataset.i)], hi = parseHI(el.value);
      if (!hiOk(hi)) { el.value = fmtIndex(Number(e.hi)); return toast("Handicap index between +10 and 54, e.g. 18,4"); }
      S.setEntryHi(r, e, hi); teamsChanged(r, c); players(rid, only, true);
    }
    if (el.dataset.act === "teamch") {
      const t = r.entries.find(x => x.playerId === el.dataset.tid), v = el.value.trim();
      if (v !== "" && !Number.isInteger(Number(v))) return toast("A whole number");
      t.courseHandicap = v === "" ? null : Number(v); S.saveEntry(r, t); players(rid, only, true);
    }
  });
}

const teamsChanged = (r, c) => { for (const t of r.entries.filter(e => e.role === "team")) refreshTeam(r, c, t); };

/** Teams of two, three or four, drawn so each has a spread of handicaps: a snake down the list. */
async function autoTeams(r, c) {
  const people = r.entries.filter(e => e.role !== "team");
  const vs = scrambleMatch(r.format);
  const v = vs ? "2" : await sheet({ title: "Make teams", lead: `${plural(people.length, "player")}. How many in a team?`,
    actions: [2, 3, 4].filter(n => n <= people.length).map(n => ({ label: `Teams of ${n}`, value: String(n), kind: n === 2 ? "primary" : "" })) });
  if (!v) return;
  const size = Number(v), k = vs ? 2 : Math.max(1, Math.round(people.length / size));
  for (const t of r.entries.filter(e => e.role === "team")) S.removeEntry(r, r.entries.indexOf(t));
  const sorted = [...people].sort((a, b) => (Number(a.hi) || 0) - (Number(b.hi) || 0));
  const groups = Array.from({ length: k }, () => []);
  sorted.forEach((e, i) => { const round = Math.floor(i / k), pos = i % k; groups[round % 2 ? k - 1 - pos : pos].push(e.playerId); });
  groups.forEach((g, i) => { const t = S.addTeam(r, c.n, { name: `Team ${i + 1}`, members: g, tee: r.defaultTee }); if (vs) S.setSide(r, t, "AB"[i]); refreshTeam(r, c, t); });
}

// ---------------------------------------------------------------- the round's own options, in one sheet
async function optionsSheet(r, c) {
  const gs = S.leagues();
  const on = new Set(S.leaguesOfRound(r.id).map(g => g.id));
  const tile = Mo.kindOf(r.format);
  const v = await sheet({ title: "This round", body: `<form id="optf">
      ${Mo.PLAY_GROUPS.filter(g => g.kinds.length).map(g => `<p class="pickline">${esc(g.label)}</p><div class="card radios">${g.kinds.map(f =>
        `<label class="radiorow"><input type="radio" name="fmt" value="${f.key}" ${tile === f.key ? "checked" : ""}><span><b>${esc(f.label)}</b><small>${esc(f.blurb)}</small></span></label>`).join("")}</div>`).join("")}
      <label>Name<input name="name" value="${esc(r.name)}"></label>
      <div class="two"><label>Date<input name="date" type="date" value="${esc(r.date || "")}"></label>
      ${Mo.isMatchFormat(r.format) ? "" : `<label>Allowance<select name="allow">${[100, 95, 90, 85, 75].map(a => `<option value="${a}" ${Number(r.allowance) === a ? "selected" : ""}>${a}%</option>`).join("")}</select></label>`}</div>
      <p class="pickline" style="margin-top:16px">Stats</p>
      <div class="card radios">${[["simple", "Simple", "just the score"], ["advanced", "Advanced", "putts, fairways, bunker shots and penalties as well"]].map(([v, label, sub]) =>
        `<label class="radiorow"><input type="radio" name="stats" value="${v}" ${(v === "advanced") === S.cardKeepsStats(r) ? "checked" : ""}><span><b>${label}</b><small>${sub}</small></span></label>`).join("")}</div>
      ${brandField("rbrand", r.brand || null)}
      ${gs.length && !r.leagueId ? `<p class="pickline">Counts for</p><div class="checks">${gs.map(g => `<label><input type="checkbox" name="lg" value="${g.id}" ${on.has(g.id) ? "checked" : ""}> ${esc(g.name)}</label>`).join("")}</div>` : ""}
    </form>`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }],
    onOpen: el => {
      el.querySelectorAll(".fmttile input").forEach(i => i.addEventListener("change", () => el.querySelectorAll(".fmttile").forEach(t => t.classList.toggle("on", t.querySelector("input").checked))));
      el.addEventListener("change", () => { window.__opt = new FormData(el.querySelector("#optf")); });
      window.__opt = new FormData(el.querySelector("#optf"));
    } });
  const f = window.__opt;
  window.__opt = null;
  if (v !== "ok" || !f) return;
  const fmt = f.get("fmt") || tile;
  if (fmt !== tile) r.format = fmt;
  r.name = String(f.get("name") || "").trim() || r.name;
  r.date = f.get("date") || r.date;
  if (f.get("allow") !== null) r.allowance = Number(f.get("allow")) || 100;
  if (f.get("rbrand") !== null) r.brand = f.get("rbrand") || null;
  S.state.settings.lastFormat = r.format;
  S.saveRound(r);
  const adv = f.get("stats") === "advanced";
  if (adv !== S.cardKeepsStats(r)) {
    for (const e of r.entries) if (!!e.trackStats !== adv) S.setTrackStats(r, e, adv);
    // the score screen would otherwise switch my seat back to what Stats I keep says
    S.state.settings.trackAsked = { ...(S.state.settings.trackAsked || {}), [r.id]: 1 };
    if (adv && S.state.settings.statsRound) delete S.state.settings.statsRound[r.id];
    S.save();
  }
  if (gs.length && !r.leagueId) {
    const want = new Set(f.getAll("lg"));
    for (const g of gs) if (want.has(g.id) !== on.has(g.id)) S.setLeagueRound(g.id, r.id, want.has(g.id));
  }
  if (sidedMatch(r.format)) {
    const people = r.entries.filter(e => e.role !== "team");
    people.forEach((e, k) => { if (e.side !== "A" && e.side !== "B") S.setSide(r, e, k % 2 ? "B" : "A"); });
  }
}

// ---------------------------------------------------------------- adding people
async function askIndex(name) {
  const v = await promptSheet(`${firstName(name)}'s handicap index`, "For example 18,4 or +2.1.", { placeholder: "18,4", inputmode: "decimal", label: "Add" });
  if (v === null) return null;
  const hi = parseHI(v);
  if (!hiOk(hi)) { toast("Handicap index between +10 and 54, e.g. 18,4"); return null; }
  return hi;
}

function seat(r, c, p, hi, accountId) {
  const tees = Object.keys(c.tees);
  const people = r.entries.filter(e => e.role !== "team");
  const e = S.addEntry(r, c.n, { name: p.name, hi, tee: S.lastTee(p.id, r.course, tees) || r.defaultTee, gender: p.gender || "m", courseHandicap: null,
    accountId, trackStats: accountId && accountId === S.myAccount() ? S.keepsAny(S.myKeep()) : false });
  if (sidedMatch(r.format)) S.setSide(r, e, people.filter(x => x.side === "A").length <= people.filter(x => x.side === "B").length ? "A" : "B");
  return e;
}

export async function addSheet(r, c) {
  // nobody plays off a handicap in a match, so nobody is asked for one
  const match = Mo.isMatchFormat(r.format);
  const onCard = new Set(r.entries.map(e => e.contactId || e.playerId));
  const onCardAccounts = new Set(r.entries.map(e => e.accountId).filter(Boolean));
  const me = S.me();
  // friends first, whoever I played with last at the top
  const lastWith = new Map();
  for (const x of S.rounds()) for (const e of x.entries) if (e.accountId && (x.date || "") > (lastWith.get(e.accountId) || "")) lastWith.set(e.accountId, x.date || "");
  const friends = F.held().friends.filter(f => !onCardAccounts.has(f.id) && f.id !== S.myAccount())
    .sort((a, b) => (lastWith.get(b.id) || "").localeCompare(lastWith.get(a.id) || "") || a.name.localeCompare(b.name));
  const roster = S.players().filter(p => !onCard.has(p.id) && !(p.linkedAccount && onCardAccounts.has(p.linkedAccount)) && !friends.some(f => f.id === p.linkedAccount)).sort((a, b) => a.name.localeCompare(b.name));
  const line = (kind, id, name, sub) => `<button class="addrow" data-sheet="${kind}:${esc(id)}" data-q="${esc(name.toLowerCase())}">${avatar(name)}<span><b>${esc(name)}</b><small>${esc(sub)}</small></span><span class="plus">+</span></button>`;
  const hiSub = hi => hi !== null && hi !== undefined ? `index ${fmtIndex(Number(hi))}` : "no index yet";
  const v = await sheet({ title: "Add a player", body: `
    <input id="aq" class="search" placeholder="Search, or type a new name" autocomplete="off">
    <div id="alist">
      ${me && !onCard.has(me.id) ? line("roster", me.id, me.name, "you") : ""}
      ${friends.length ? `<p class="pickline">Friends</p>${friends.map(f => line("friend", f.id, f.name, hiSub(f.hi))).join("")}` : ""}
      ${roster.filter(p => !me || p.id !== me.id).length ? `<p class="pickline">Played with</p>${roster.filter(p => !me || p.id !== me.id).map(p => line("roster", p.id, p.name, hiSub(S.currentIndex(p)))).join("")}` : ""}
    </div>
    <button class="addrow new" id="anew" data-sheet="new:" hidden><span class="plus">+</span><span><b id="anewname"></b><small>add to the card</small></span></button>`,
    onOpen: el => {
      const q = el.querySelector("#aq");
      q.addEventListener("input", () => {
        const t = q.value.trim().toLowerCase();
        el.querySelectorAll("#alist .addrow").forEach(b => { b.hidden = !!t && !b.dataset.q.includes(t); });
        const nw = el.querySelector("#anew");
        nw.hidden = !t;
        el.querySelector("#anewname").textContent = q.value.trim();
        nw.dataset.sheet = `new:${q.value.trim()}`;
      });
      q.focus();
    } });
  if (!v) return;
  const [kind, ...rest] = v.split(":");
  const id = rest.join(":");
  if (kind === "friend") {
    const f = F.friendById(id);
    if (!f) return;
    let hi = f.hi;
    if ((hi === null || hi === undefined) && !match) { hi = await askIndex(f.name); if (hi === null) return; }
    const p = S.upsertPlayer(f.name, hi, "m");
    if (p.linkedAccount !== f.id) { p.linkedAccount = f.id; S.touch("players", p); S.save(); }
    seat(r, c, p, hi, f.id);
  } else if (kind === "roster") {
    const p = S.players().find(x => x.id === id);
    if (!p) return;
    let hi = S.currentIndex(p);
    if ((hi === null || hi === undefined) && !match) {
      hi = await askIndex(p.name);
      if (hi === null) return;
      if (me && p.id === me.id && A.signedIn()) { try { await A.update({ hi }); } catch (e) { /* the seat still carries it */ } }
    }
    seat(r, c, p, hi, p.linkedAccount || null);
  } else if (kind === "new") {
    const name = id.trim();
    if (!name) return;
    if (r.entries.some(e => S.nameKey(e.name) === S.nameKey(name))) {
      if (!await confirmSheet(`Another ${firstName(name)}?`, `Someone called ${name} is already on this card. Add a second one?`, { label: "Add" })) return;
    }
    const hi = match ? null : await askIndex(name);
    if (hi === null && !match) return;
    const p = S.findPlayer(name) || S.upsertPlayer(name, hi, "m");
    seat(r, c, p, hi, p.linkedAccount || null);
  }
}

// ---------------------------------------------------------------- one player, the rare things
async function playerSheet(r, c, e) {
  const tees = Object.keys(c.tees);
  const info = seatInfo(r, c, e);
  const ov = pchOf(r, e);
  const showGroups = r.entries.length > 4 || r.entries.some(x => (x.group || 1) > 1);
  const v = await sheet({ title: e.name, lead: Mo.isMatchFormat(r.format) ? "Match play: no handicap" : info.error ? info.error : `Course handicap ${fmtHcp(info.ch)} · plays off ${fmtHcp(info.ph)}`, body: `<form id="psf">
      ${Mo.isMatchFormat(r.format) ? "" : `<div class="two"><label>Handicap index<input name="hi" inputmode="decimal" value="${esc(fmtIndex(Number(e.hi)))}"></label>
        <label>Course hcp <span class="muted">(club table)</span><input name="pch" inputmode="numeric" value="${ov ?? ""}" placeholder="worked out"></label></div>`}
      ${c.unlisted ? "" : `<p class="pickline">Tee</p><div class="tees">${tees.map(t => `<label class="tee ${t === e.tee ? "on" : ""}" style="--c:${teeColor(t)}"><input type="radio" name="tee" value="${esc(t)}" ${t === e.tee ? "checked" : ""} hidden><i></i></label>`).join("")}</div>`}
      <div class="two"><label>Starts at<select name="from">${c.par.map((_, k) => `<option value="${k + 1}" ${(e.fromHole || 1) === k + 1 ? "selected" : ""}>Hole ${c.first_hole + k}</option>`).join("")}</select></label>
        <label>Rating<select name="gender"><option value="m" ${e.gender !== "f" ? "selected" : ""}>Men's</option><option value="f" ${e.gender === "f" ? "selected" : ""}>Women's</option></select></label></div>
      ${showGroups ? `<label>Group<input name="grp" inputmode="numeric" value="${e.group || 1}"></label>` : ""}
      <label class="switchrow"><input type="checkbox" name="track" ${e.trackStats ? "checked" : ""}> Keep putts, fairways and the rest for ${esc(firstName(e.name))}</label>
    </form>`,
    actions: [{ label: "Done", value: "ok", kind: "primary" }, { label: `Take ${firstName(e.name)} off the card`, value: "remove", kind: "danger" }],
    onOpen: el => {
      el.querySelectorAll(".tees input").forEach(i => i.addEventListener("change", () => el.querySelectorAll(".tees .tee").forEach(t => t.classList.toggle("on", t.querySelector("input").checked))));
      const keep = () => { window.__ps = new FormData(el.querySelector("#psf")); };
      el.addEventListener("change", keep); el.addEventListener("input", keep); keep();
    } });
  const f = window.__ps;
  window.__ps = null;
  if (v === "remove") {
    const i = r.entries.indexOf(e);
    if (e.scores.every(s => s === null) || await confirmSheet(`Take ${e.name} off?`, "Their scores on this card go too.", { label: "Take off", danger: true })) {
      for (const t of r.entries.filter(x => x.role === "team" && x.members.includes(e.playerId))) S.setTeamMembers(r, t, t.members.filter(m => m !== e.playerId));
      S.removeEntry(r, i);
    }
    return;
  }
  if (v !== "ok" || !f) return;
  const hi = parseHI(f.get("hi"));
  if (hiOk(hi) && hi !== Number(e.hi)) S.setEntryHi(r, e, hi);
  if (f.get("tee")) e.tee = f.get("tee");
  e.fromHole = Number(f.get("from")) || 1;
  e.gender = f.get("gender") === "f" ? "f" : "m";
  if (f.get("grp") !== null) e.group = Math.max(1, Math.floor(Number(f.get("grp")) || 1));
  e.trackStats = f.get("track") === "on";
  const raw = String(f.get("pch") || "").trim();
  // a match sheet has no course handicap field, and must not wipe the one kept for this tee
  if (f.get("pch") !== null && (raw === "" || Number.isInteger(Number(raw)))) {
    e.courseHandicap = null;
    S.setPch(e.contactId || e.playerId, r.course, e.tee, raw === "" ? null : Number(raw));
  }
  S.saveEntry(r, e);
  teamsChanged(r, c);
}

// ---------------------------------------------------------------- inviting onto the card
export async function inviteSheet(r) {
  if (!A.signedIn()) return toast("Sign in to invite people");
  try {
    await Y.push();
    const res = await A.api(`/round/${r.id}/invite`, {});
    await sheet({ title: "Invite to this card", lead: "Whoever opens this can take their seat and score with you, until the round is saved.",
      body: `${qrHtml(res.url)}<div class="linkbox">${esc(res.url)}</div><p class="center">Or tell them the code <b class="num">${esc(res.code)}</b></p>`,
      actions: [{ label: "Send the link", value: "share", kind: "primary" }, { label: "Done", value: "no" }] }).then(v => v === "share" && shareLink(res.url, `Score with me on Hagolf`, `${r.name}: take your seat on my card`));
  } catch (e) { toast(e.message, 5000); }
}
