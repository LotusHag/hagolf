// Roster, rounds and groups in localStorage, plus backup export/import and the tournament.yaml export.
const KEY = "apeliotes-golf-v1";

export const state = load();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  s = s || {};
  return { players: s.players || [], rounds: s.rounds || [], groups: s.groups || [], settings: s.settings || {} };
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert("Could not save: the browser storage is full or blocked."); }
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Case, accent and punctuation insensitive key so "Maurits van 't Hag" and "maurits van t hag" are one player. */
export function nameKey(name) {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ---------------------------------------------------------------- roster
export function findPlayer(name) {
  const k = nameKey(name);
  return state.players.find(p => nameKey(p.name) === k) || null;
}

/** Returns the roster player for a name, creating one when new; updates the index and gender they last used. */
export function upsertPlayer(name, hi, gender) {
  let p = findPlayer(name);
  if (!p) {
    p = { id: uid(), name: name.trim(), hi, gender: gender || "m", created: today() };
    state.players.push(p);
  } else {
    if (hi !== undefined && hi !== null) p.hi = hi;
    if (gender) p.gender = gender;
  }
  save();
  return p;
}

export function roundsOf(playerId) {
  return state.rounds.filter(r => r.entries.some(e => e.playerId === playerId));
}

export function deletePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  state.groups.forEach(g => { g.members = g.members.filter(m => m !== id); });
  save();
}

// ---------------------------------------------------------------- rounds
export function createRound({ course, name, date, defaultTee, allowance }) {
  const r = { id: uid(), course, name, date, defaultTee, allowance: Number(allowance) || 100, status: "setup",
    hole: 0, entries: [], created: new Date().toISOString() };
  state.rounds.unshift(r);
  save();
  return r;
}

export function getRound(id) {
  return state.rounds.find(r => r.id === id) || null;
}

export function deleteRound(id) {
  state.rounds = state.rounds.filter(r => r.id !== id);
  save();
}

/** Adds a player to a round: links to the roster, snapshots what they play with today. */
export function addEntry(round, n, { name, hi, tee, gender, courseHandicap }) {
  const p = upsertPlayer(name, hi, gender);
  const e = { playerId: p.id, name: p.name, hi, tee, gender: gender || "m", courseHandicap: courseHandicap ?? null,
    scores: new Array(n).fill(null), penalties: [] };
  round.entries.push(e);
  save();
  return e;
}

/** What model.compute expects from a stored round. */
export function toModelRound(round) {
  return {
    name: round.name, date: round.date, defaultTee: round.defaultTee, allowance: round.allowance,
    entries: round.entries.map(e => ({ id: e.playerId, name: e.name, hi: e.hi, tee: e.tee, gender: e.gender,
      courseHandicap: e.courseHandicap, scores: e.scores, penalties: e.penalties })),
  };
}

// ---------------------------------------------------------------- groups
export function createGroup(name, members = [], bestN = 0) {
  const g = { id: uid(), name, members, bestN: Number(bestN) || 0, created: today() };
  state.groups.push(g);
  save();
  return g;
}

export function getGroup(id) {
  return state.groups.find(g => g.id === id) || null;
}

export function deleteGroup(id) {
  state.groups = state.groups.filter(g => g.id !== id);
  save();
}

// ---------------------------------------------------------------- backup
export function exportJSON() {
  state.settings.lastExport = new Date().toISOString();
  save();
  return JSON.stringify({ app: "apeliotes-golf", format: 1, exported: state.settings.lastExport,
    players: state.players, rounds: state.rounds, groups: state.groups }, null, 1);
}

/** Merges a backup in: rounds and groups by id, players by id then by name. Importing twice changes nothing. */
export function importJSON(text) {
  const d = JSON.parse(text);
  if (d.app !== "apeliotes-golf" || !Array.isArray(d.players) || !Array.isArray(d.rounds)) throw new Error("This is not an Apeliotes Golf backup file.");
  const idMap = new Map();
  let newPlayers = 0, newRounds = 0, newGroups = 0;
  for (const p of d.players) {
    let mine = state.players.find(x => x.id === p.id) || findPlayer(p.name);
    if (!mine) { state.players.push({ ...p }); newPlayers++; }
    else {
      idMap.set(p.id, mine.id);
      const newer = roundsOf(mine.id).every(r => r.created <= (d.exported || ""));
      if (newer && p.hi !== undefined) mine.hi = p.hi;
    }
  }
  const mapId = id => idMap.get(id) || id;
  for (const r of d.rounds) {
    if (state.rounds.some(x => x.id === r.id)) continue;
    r.entries.forEach(e => { e.playerId = mapId(e.playerId); });
    state.rounds.push(r);
    newRounds++;
  }
  state.rounds.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
  for (const g of d.groups || []) {
    const mine = state.groups.find(x => x.id === g.id);
    if (mine) { mine.members = [...new Set([...mine.members, ...g.members.map(mapId)])]; }
    else { state.groups.push({ ...g, members: g.members.map(mapId) }); newGroups++; }
  }
  save();
  return { newPlayers, newRounds, newGroups };
}

export function needsBackup() {
  const last = state.settings.lastExport || "";
  return state.rounds.some(r => r.status === "done" && (r.created || "") > last);
}

// ---------------------------------------------------------------- desktop kit
function yamlStr(s) {
  s = String(s);
  return /^[A-Za-z0-9][A-Za-z0-9 .\-]*$/.test(s) && !/^(true|false|null|yes|no)$/i.test(s) ? s : JSON.stringify(s);
}

/** The round as tournaments/<slug>/tournament.yaml for `python golf.py render`. */
export function toYAML(round) {
  const L = [`# ${round.name}`, "# Exported from the phone app; drop into tournaments/<slug>/tournament.yaml and run: python golf.py render <slug>",
    `name: ${yamlStr(round.name)}`, `date: ${round.date || "null"}`, `course: ${round.course}`, `default_tee: ${round.defaultTee}`,
    `allowance: ${round.allowance || 100}`, "players:"];
  for (const e of round.entries) {
    L.push(`- name: ${yamlStr(e.name)}`);
    L.push(`  handicap_index: ${e.hi}`);
    L.push(`  tee: ${e.tee}`);
    if (e.gender === "f") L.push("  gender: f");
    if (e.courseHandicap !== null && e.courseHandicap !== undefined && e.courseHandicap !== "") L.push(`  course_handicap: ${e.courseHandicap}`);
    L.push(`  scores: [${e.scores.map(s => s === null ? "" : s).join(", ")}]`);
    if (e.penalties && e.penalties.length) {
      L.push("  penalties:");
      for (const p of e.penalties) L.push(`  - {hole: ${p.hole}, strokes: ${p.strokes}, reason: ${yamlStr(p.reason || "")}}`);
    }
  }
  return L.join("\n") + "\n";
}
