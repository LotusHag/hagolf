// Roster, rounds, leagues in localStorage, plus the change queue for sync, backup export/import and the
// tournament.yaml export. Every record carries updated_at and deleted so phones can merge each other's changes.
const KEY = "hagolf-v1";
const OLD_KEY = "apeliotes-golf-v1";
const DIRTY_KEY = "hagolf-dirty";

export const state = load();
let onSave = null;

/** The sync module registers here so every save schedules a push. */
export function setOnSave(fn) { onSave = fn; }

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  if (!s) {
    try { s = migrateV1(JSON.parse(localStorage.getItem(OLD_KEY))); } catch (e) { s = null; }
  }
  s = s || {};
  const st = { players: s.players || [], rounds: s.rounds || [], leagues: s.leagues || [], leagueRounds: s.leagueRounds || [],
    settings: s.settings || {} };
  for (const list of [st.players, st.rounds, st.leagues, st.leagueRounds]) {
    for (const r of list) { if (!r.updated_at) r.updated_at = r.created && r.created.length > 10 ? r.created : "2026-01-01T00:00:00.000Z"; }
  }
  return st;
}

/** Apeliotes Golf v1 storage: groups with members become leagues with every round a member played attached. */
function migrateV1(s) {
  if (!s) return null;
  const now = new Date().toISOString();
  const leagues = [], leagueRounds = [];
  for (const g of s.groups || []) {
    leagues.push({ id: g.id, name: g.name, bestN: g.bestN || 0, created: g.created, deleted: false, updated_at: now });
    for (const r of s.rounds || []) {
      if (r.entries.some(e => (g.members || []).includes(e.playerId))) leagueRounds.push({ league_id: g.id, round_id: r.id, deleted: false, updated_at: now });
    }
  }
  const st = { players: s.players || [], rounds: s.rounds || [], leagues, leagueRounds, settings: s.settings || {} };
  for (const list of [st.players, st.rounds]) for (const r of list) { r.deleted = false; r.updated_at = now; }
  localStorage.setItem(KEY, JSON.stringify(st));
  markAll(st);
  return st;
}

function markAll(st) {
  const d = { players: st.players.map(p => p.id), rounds: st.rounds.map(r => r.id), leagues: st.leagues.map(g => g.id),
    league_rounds: st.leagueRounds.map(x => `${x.league_id}|${x.round_id}`) };
  localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert("Could not save: the browser storage is full or blocked."); }
  if (onSave) onSave();
}

// ---------------------------------------------------------------- change queue
export function dirty() {
  try { return JSON.parse(localStorage.getItem(DIRTY_KEY)) || {}; } catch (e) { return {}; }
}

function mark(table, key) {
  const d = dirty();
  d[table] = d[table] || [];
  if (!d[table].includes(key)) d[table].push(key);
  localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
}

export function clearDirty(table, keys) {
  const d = dirty();
  d[table] = (d[table] || []).filter(k => !keys.includes(k));
  localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
}

/** Stamps a record as changed now and queues it for sync. Call after mutating it, then save(). */
export function touch(table, rec) {
  rec.updated_at = new Date().toISOString();
  mark(table, table === "league_rounds" ? `${rec.league_id}|${rec.round_id}` : rec.id);
  return rec;
}

/** Everything that arrived from other phones is already in state; persist it without queueing anything. */
export function afterPull() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* full */ }
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const live = list => list.filter(r => !r.deleted);

/** Case, accent and punctuation insensitive key so "Maurits van 't Hag" and "maurits van t hag" are one player. */
export function nameKey(name) {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Player ids derive from the name, so two phones adding the same person get the same record instead of a duplicate. */
export function playerId(name) {
  const k = nameKey(name);
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < k.length; i++) { const c = k.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
  return "p" + (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- roster
export function players() { return live(state.players); }

export function findPlayer(name) {
  const k = nameKey(name);
  return state.players.find(p => !p.deleted && nameKey(p.name) === k) || null;
}

/** Returns the roster player for a name, creating one when new; updates the index and gender they last used. */
export function upsertPlayer(name, hi, gender) {
  let p = findPlayer(name);
  const now = new Date().toISOString();
  if (!p) {
    p = { id: playerId(name), name: name.trim(), hi, gender: gender || "m", created: today(), hiUpdated: now, deleted: false };
    const ghost = state.players.find(x => x.id === p.id);
    if (ghost) { Object.assign(ghost, p, { created: ghost.created || p.created }); p = ghost; }  // deleted earlier: bring the record back
    else state.players.push(p);
  } else {
    if (hi !== undefined && hi !== null && hi !== p.hi) { p.hi = hi; p.hiUpdated = now; }
    if (gender) p.gender = gender;
  }
  touch("players", p);
  save();
  return p;
}

export function roundsOf(playerId) {
  return rounds().filter(r => r.entries.some(e => e.playerId === playerId));
}

export function deletePlayer(id) {
  const p = state.players.find(x => x.id === id);
  if (p) { p.deleted = true; touch("players", p); save(); }
}

// ---------------------------------------------------------------- rounds
export function rounds() {
  return live(state.rounds).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
}

export function createRound({ course, name, date, defaultTee, allowance }) {
  const r = { id: uid(), course, name, date, defaultTee, allowance: Number(allowance) || 100, status: "setup",
    hole: 0, entries: [], created: new Date().toISOString(), deleted: false };
  state.rounds.unshift(r);
  touch("rounds", r);
  save();
  return r;
}

export function getRound(id) {
  return state.rounds.find(r => r.id === id && !r.deleted) || null;
}

/** Saves a round; pass the entry that changed so two phones scoring the same round merge per player. */
export function saveRound(r, entry = null) {
  if (entry) entry.updated_at = new Date().toISOString();
  touch("rounds", r);
  save();
}

/** Removes a player from a round with a tombstone, so another phone's copy of the entry does not bring them back. */
export function removeEntry(r, i) {
  const e = r.entries[i];
  r.entries.splice(i, 1);
  r.removed = (r.removed || []).filter(x => x.playerId !== e.playerId);
  r.removed.push({ playerId: e.playerId, updated_at: new Date().toISOString() });
  saveRound(r);
}

/** Two copies of one round: round fields from the newer copy, each player's entry from whichever copy touched it last. */
export function mergeRound(mine, theirs) {
  const newer = (mine.updated_at || "") >= (theirs.updated_at || "") ? mine : theirs;
  const out = { ...newer };
  const removed = new Map();
  for (const t of [...(mine.removed || []), ...(theirs.removed || [])]) {
    if (!removed.has(t.playerId) || removed.get(t.playerId) < t.updated_at) removed.set(t.playerId, t.updated_at);
  }
  const byId = new Map();
  for (const e of [...(theirs.entries || []), ...(mine.entries || [])]) {
    const k = e.playerId || e.name;
    const cur = byId.get(k);
    if (!cur || (e.updated_at || "") > (cur.updated_at || "")) byId.set(k, e);
  }
  out.entries = [...byId.values()].filter(e => !(removed.has(e.playerId) && removed.get(e.playerId) > (e.updated_at || "")));
  // keep the order players were added in, as far as both copies agree
  const order = [...(newer.entries || []).map(e => e.playerId || e.name)];
  out.entries.sort((a, b) => { const ia = order.indexOf(a.playerId || a.name), ib = order.indexOf(b.playerId || b.name); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  out.removed = [...removed].map(([playerId, updated_at]) => ({ playerId, updated_at }));
  return out;
}

export function deleteRound(id) {
  const r = state.rounds.find(x => x.id === id);
  if (r) { r.deleted = true; touch("rounds", r); save(); }
}

/** Adds a player to a round: links to the roster, snapshots what they play with today. */
export function addEntry(round, n, { name, hi, tee, gender, courseHandicap }) {
  const p = upsertPlayer(name, hi, gender);
  const e = { playerId: p.id, name: p.name, hi, tee, gender: gender || "m", courseHandicap: courseHandicap ?? null,
    scores: new Array(n).fill(null), penalties: [], updated_at: new Date().toISOString() };
  round.entries.push(e);
  round.removed = (round.removed || []).filter(x => x.playerId !== p.id);
  saveRound(round);
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

// ---------------------------------------------------------------- leagues
export function leagues() { return live(state.leagues).sort((a, b) => a.name.localeCompare(b.name)); }

export function createLeague(name, bestN = 0, createdBy = null) {
  const g = { id: uid(), name, bestN: Number(bestN) || 0, createdBy, created: today(), deleted: false };
  state.leagues.push(g);
  touch("leagues", g);
  save();
  return g;
}

export function getLeague(id) {
  return state.leagues.find(g => g.id === id && !g.deleted) || null;
}

export function saveLeague(g) {
  touch("leagues", g);
  save();
}

export function deleteLeague(id) {
  const g = state.leagues.find(x => x.id === id);
  if (g) { g.deleted = true; touch("leagues", g); save(); }
}

/** Round ids attached to a league, newest round first. */
export function leagueRoundIds(leagueId) {
  const ids = new Set(state.leagueRounds.filter(x => x.league_id === leagueId && !x.deleted).map(x => x.round_id));
  return rounds().filter(r => ids.has(r.id)).map(r => r.id);
}

export function leaguesOfRound(roundId) {
  const ids = new Set(state.leagueRounds.filter(x => x.round_id === roundId && !x.deleted).map(x => x.league_id));
  return leagues().filter(g => ids.has(g.id));
}

export function setLeagueRound(leagueId, roundId, attached) {
  let x = state.leagueRounds.find(y => y.league_id === leagueId && y.round_id === roundId);
  if (!x) { x = { league_id: leagueId, round_id: roundId, deleted: !attached }; state.leagueRounds.push(x); }
  else x.deleted = !attached;
  touch("league_rounds", x);
  save();
}

// ---------------------------------------------------------------- backup
export function exportJSON() {
  state.settings.lastExport = new Date().toISOString();
  save();
  return JSON.stringify({ app: "hagolf", format: 2, exported: state.settings.lastExport,
    players: state.players, rounds: state.rounds, leagues: state.leagues, leagueRounds: state.leagueRounds }, null, 1);
}

/** Merges a backup in: the newer updated_at wins per record. Importing twice changes nothing. */
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!["hagolf", "apeliotes-golf"].includes(d.app) || !Array.isArray(d.players) || !Array.isArray(d.rounds)) throw new Error("This is not a Hagolf backup file.");
  if (d.app === "apeliotes-golf") Object.assign(d, migrateShape(d));
  let added = 0;
  const merge = (table, list, incoming, key) => {
    for (const rec of incoming || []) {
      if (!rec.updated_at) rec.updated_at = d.exported || "2026-01-01T00:00:00.000Z";
      const i = list.findIndex(x => key(x) === key(rec));
      if (i < 0) { list.push(rec); mark(table, key(rec)); added++; }
      else if ((list[i].updated_at || "") < rec.updated_at) { list[i] = rec; mark(table, key(rec)); added++; }
    }
  };
  merge("players", state.players, d.players, x => x.id);
  merge("rounds", state.rounds, d.rounds, x => x.id);
  merge("leagues", state.leagues, d.leagues, x => x.id);
  merge("league_rounds", state.leagueRounds, d.leagueRounds, x => `${x.league_id}|${x.round_id}`);
  save();
  return { added };
}

function migrateShape(d) {
  const now = d.exported || new Date().toISOString();
  const leagues = [], leagueRounds = [];
  for (const g of d.groups || []) {
    leagues.push({ id: g.id, name: g.name, bestN: g.bestN || 0, created: g.created, deleted: false, updated_at: now });
    for (const r of d.rounds) if (r.entries.some(e => (g.members || []).includes(e.playerId))) leagueRounds.push({ league_id: g.id, round_id: r.id, deleted: false, updated_at: now });
  }
  return { leagues, leagueRounds };
}

export function needsBackup() {
  const last = state.settings.lastExport || "";
  return rounds().some(r => r.status === "done" && (r.created || "") > last);
}

// ---------------------------------------------------------------- desktop kit
function yamlStr(s) {
  s = String(s);
  return /^[A-Za-z0-9][A-Za-z0-9 .\-]*$/.test(s) && !/^(true|false|null|yes|no)$/i.test(s) ? s : JSON.stringify(s);
}

/** The round as tournaments/<slug>/tournament.yaml for `python golf.py render`. */
export function toYAML(round) {
  const L = [`# ${round.name}`, "# Exported from Hagolf; drop into tournaments/<slug>/tournament.yaml and run: python golf.py render <slug>",
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
