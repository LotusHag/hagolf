// Local store (localStorage) and the change queue for sync. Players, rounds (header + entries + per-hole scores),
// leagues, league-round attachments, courses added on phones, course handicaps from club tables, settings.
// Every record carries updated_at and deleted; the queue remembers which records changed and when.
import { DATA } from "./data.js";

const KEY = "hagolf-v2";
const OLD_KEYS = ["hagolf-v1", "apeliotes-golf-v1"];
const DIRTY_KEY = "hagolf-dirty";

export const state = load();
let onSave = null;
const now = () => new Date().toISOString();

/** The sync module registers here so every save schedules a push. */
export function setOnSave(fn) { onSave = fn; }

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
  if (!s) {
    for (const k of OLD_KEYS) {
      try { const old = JSON.parse(localStorage.getItem(k)); if (old) { s = migrateOld(old); break; } } catch (e) { s = null; }
    }
  }
  s = s || {};
  const st = { players: s.players || [], rounds: s.rounds || [], leagues: s.leagues || [], leagueRounds: s.leagueRounds || [],
    courses: s.courses || [], pch: s.pch || [], orphanScores: s.orphanScores || [], held: s.held || [], quarantine: s.quarantine || [],
    settings: s.settings || {} };
  st.settings.holes = st.settings.holes || {};  // the hole each round is open at, on this phone only
  if (!st.settings.deviceId) st.settings.deviceId = uid();
  for (const r of st.rounds) {
    r.entries = r.entries || [];
    r.removed = r.removed || [];
    for (const e of r.entries) { e.scoreTs = e.scoreTs || e.scores.map(() => null); e.updated_at = e.updated_at || r.updated_at; }
  }
  return st;
}

/** Older local formats: groups become leagues, jsonb-style rounds get per-hole stamps; everything is queued. */
function migrateOld(s) {
  const ts = now();
  const leagues = s.leagues || [], leagueRounds = s.leagueRounds || [];
  for (const g of s.groups || []) {
    leagues.push({ id: g.id, name: g.name, bestN: g.bestN || 0, created: g.created, deleted: false, updated_at: ts });
    for (const r of s.rounds || []) {
      if (r.entries.some(e => (g.members || []).includes(e.playerId))) leagueRounds.push({ league_id: g.id, round_id: r.id, deleted: false, updated_at: ts });
    }
  }
  const st = { players: s.players || [], rounds: s.rounds || [], leagues, leagueRounds, courses: [], pch: [], orphanScores: [], settings: s.settings || {} };
  for (const list of [st.players, st.rounds, st.leagues, st.leagueRounds]) for (const r of list) { r.deleted = !!r.deleted; r.updated_at = r.updated_at || ts; }
  for (const r of st.rounds) for (const e of r.entries || []) { e.updated_at = ts; e.scoreTs = e.scores.map(v => v === null ? null : ts); }
  localStorage.setItem(KEY, JSON.stringify(st));
  const d = {};
  const add = (t, k, ts_) => { d[t] = d[t] || {}; d[t][k] = ts_; };
  st.players.forEach(p => add("players", p.id, p.updated_at));
  st.rounds.forEach(r => { add("rounds", r.id, r.updated_at); r.entries.forEach(e => { add("round_entries", `${r.id}|${e.playerId}`, e.updated_at); e.scores.forEach((v, h) => { if (v !== null) add("scores", `${r.id}|${e.playerId}|${h}`, e.scoreTs[h]); }); }); });
  st.leagues.forEach(g => add("leagues", g.id, g.updated_at));
  st.leagueRounds.forEach(x => add("league_rounds", `${x.league_id}|${x.round_id}`, x.updated_at));
  localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  return st;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert("Could not save: the browser storage is full or blocked."); }
  if (onSave) onSave();
}

/** Everything that arrived from other phones is already in state; persist it without queueing anything. */
export function afterPull() {
  reconcileNames();  // a phone on an older build can push an entry still under a since-renamed spelling
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* full */ }
}

// ---------------------------------------------------------------- change queue: { table: { key: updated_at } }
export function dirty() {
  try { return JSON.parse(localStorage.getItem(DIRTY_KEY)) || {}; } catch (e) { return {}; }
}

export function hasDirty() {
  return Object.values(dirty()).some(m => Object.keys(m).length);
}

function mark(table, key, ts) {
  const d = dirty();
  d[table] = d[table] || {};
  d[table][key] = ts;
  localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
}

/** Drops queue entries whose stamp is still the one that was sent; a change made during the push stays queued. */
export function clearDirty(table, sent) {
  const d = dirty();
  const m = d[table] || {};
  for (const [k, ts] of Object.entries(sent)) if (m[k] === ts) delete m[k];
  d[table] = m;
  localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
}

/** Rows the server refused for good (a 4xx): taken out of the queue so the rest keeps syncing, kept for the user to see. */
export function quarantine(table, sent, reason) {
  for (const k of Object.keys(sent)) state.quarantine.push({ table, key: k, reason: String(reason).slice(0, 200), at: now() });
  state.quarantine = state.quarantine.slice(-50);
  clearDirty(table, sent);
  afterPull();
}

/** A round entered more than 60 days ago is frozen on the server; the phone refuses the edit up front. */
export function roundOpen(r) {
  const t = r.created ? new Date(r.created).getTime() : Date.now();
  return Date.now() - t < 60 * 86400000;
}

/** Stamps a record as changed now and queues it. */
export function touch(table, rec, key = null) {
  rec.updated_at = now();
  rec.dev = state.settings.deviceId;  // tie-breaker when two phones change a record in the same millisecond
  mark(table, key ?? rec.id, rec.updated_at);
  return rec;
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const live = list => list.filter(r => !r.deleted);

// ---------------------------------------------------------------- settings
export function setSetting(k, v) { state.settings[k] = v; save(); }
export function me() { return state.settings.meId ? players().find(p => p.id === state.settings.meId) || null : null; }

// ---------------------------------------------------------------- roster
/** Case, accent and punctuation insensitive key so "Maurits van 't Hag" and "maurits van t hag" are one player. */
export function nameKey(name) {
  return String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Player ids derive from the name at creation, so two phones adding the same person get one record, not two. */
export function playerId(name) {
  const k = nameKey(name);
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < k.length; i++) { const c = k.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
  return "p" + (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function players() { return live(state.players); }

/** By current name or any earlier spelling (aliases), so a renamed player is still found. */
export function findPlayer(name) {
  const k = nameKey(name);
  return state.players.find(p => !p.deleted && (nameKey(p.name) === k || (p.aliases || []).includes(k))) || null;
}

/** Returns the roster player for a name, creating one when new; updates the index and gender they last used. */
export function upsertPlayer(name, hi, gender) {
  let p = findPlayer(name);
  const ts = now();
  if (!p) {
    p = { id: playerId(name), name: name.trim(), hi, gender: gender || "m", created: today(), hiUpdated: ts, aliases: [], deleted: false };
    const ghost = state.players.find(x => x.id === p.id);
    if (ghost) { Object.assign(ghost, p, { created: ghost.created || p.created, aliases: ghost.aliases || [] }); p = ghost; console.info("player restored", p.name); }
    else state.players.push(p);
  } else {
    if (hi !== undefined && hi !== null && hi !== p.hi) { p.hi = hi; p.hiUpdated = ts; }
    if (gender) p.gender = gender;
  }
  touch("players", p);
  save();
  return p;
}

/** Renames keep the id and remember the old spelling, so another phone typing either name finds this player. */
export function renamePlayer(p, newName) {
  const old = nameKey(p.name), fresh = nameKey(newName);
  p.aliases = [...new Set([...(p.aliases || []), old, fresh])].filter(k => k !== fresh || k === old);
  if (!p.aliases.includes(old)) p.aliases.push(old);
  p.name = newName.trim();
  touch("players", p);
  reconcileNames();  // rounds, cards, boards and league credits keep their own copy of the name
  save();
}

/**
 * Entries and league credits keep their own copy of a name; this puts any that fell behind the roster back in
 * step and queues them, so a rename made before the app propagated them still reaches every screen.
 */
export function reconcileNames() {
  const by = new Map(state.players.map(p => [p.id, p]));
  let fixed = 0;
  for (const r of state.rounds) {
    for (const e of [...r.entries, ...r.removed]) {
      const p = by.get(e.playerId);
      if (!p || p.deleted || !p.name || e.name === p.name) continue;
      e.name = p.name;
      touch("round_entries", e, `${r.id}|${e.playerId}`);
      fixed++;
    }
  }
  for (const g of state.leagues) {
    if (!g.createdBy) continue;
    const k = nameKey(g.createdBy);
    const p = state.players.find(x => !x.deleted && (x.aliases || []).includes(k) && nameKey(x.name) !== k);
    if (!p) continue;
    g.createdBy = p.name;
    touch("leagues", g);
    fixed++;
  }
  return fixed;
}

/**
 * Two roster records that are one person (a spelling that slipped through): every round entry, score and course
 * handicap of `dropId` moves to `keepId`, the dropped name becomes an alias, and the dropped record is tombstoned.
 */
export function mergePlayers(keepId, dropId) {
  const keep = state.players.find(p => p.id === keepId), drop = state.players.find(p => p.id === dropId);
  if (!keep || !drop || keepId === dropId) return false;
  for (const r of state.rounds) {
    const i = r.entries.findIndex(e => e.playerId === dropId);
    if (i < 0) continue;
    const old = r.entries[i];
    const j = r.entries.findIndex(e => e.playerId === keepId);
    removeEntry(r, i);
    if (j >= 0) continue;  // both in the round: keep the record already under the kept name
    const e = { ...old, playerId: keepId, name: keep.name, deleted: false, updated_at: now(), scores: [...old.scores], scoreTs: old.scores.map(v => v === null ? null : now()) };
    r.removed = r.removed.filter(x => x.playerId !== keepId);
    r.entries.push(e);
    mark("round_entries", `${r.id}|${keepId}`, e.updated_at);
    e.scores.forEach((v, h) => { if (v !== null) mark("scores", `${r.id}|${keepId}|${h}`, e.scoreTs[h]); });
  }
  for (const x of state.pch.filter(y => y.player_id === dropId && !y.deleted)) {
    if (getPch(keepId, x.course, x.tee) === null) setPch(keepId, x.course, x.tee, x.ch);
    setPch(dropId, x.course, x.tee, null);
  }
  keep.aliases = [...new Set([...(keep.aliases || []), nameKey(drop.name), ...(drop.aliases || [])])];
  for (const g of state.leagues) {
    if (g.createdBy && nameKey(g.createdBy) === nameKey(drop.name)) { g.createdBy = keep.name; touch("leagues", g); }
  }
  if (keep.hi === null || keep.hi === undefined) keep.hi = drop.hi;
  drop.deleted = true;
  if (state.settings.meId === dropId) state.settings.meId = keepId;
  touch("players", keep);
  touch("players", drop);
  save();
  return true;
}

/** The day of the most recent round this player has an entry in, ignoring one round. */
function lastPlayedDate(pid, exceptId = null) {
  let best = "";
  for (const r of state.rounds) {
    if (r.deleted || r.id === exceptId) continue;
    if ((r.entries || []).some(e => e.playerId === pid && !e.deleted)) best = (r.date || "") > best ? (r.date || "") : best;
  }
  return best;
}

/** The tee a player last stood on: this course first, then the last round whose tee this course also has. */
export function lastTee(pid, course, tees) {
  const seen = [];
  for (const r of state.rounds) {
    if (r.deleted) continue;
    const e = (r.entries || []).find(x => x.playerId === pid && !x.deleted && x.tee);
    if (e) seen.push({ when: `${r.date || ""}|${r.created || ""}`, course: r.course, tee: e.tee });
  }
  seen.sort((a, b) => b.when.localeCompare(a.when));
  const hit = seen.find(x => x.course === course && tees.includes(x.tee)) || seen.find(x => tees.includes(x.tee));
  return hit ? hit.tee : null;
}

/** The index a player is playing this round off; the roster keeps it unless they have played since. */
export function setEntryHi(round, e, hi) {
  e.hi = hi;
  saveEntry(round, e);
  const p = state.players.find(x => x.id === e.playerId);
  if (!p || (round.date && lastPlayedDate(p.id, round.id) > round.date)) return;
  p.hi = hi;
  p.hiUpdated = now();
  touch("players", p);
  save();
}

export function roundsOf(pid) {
  return rounds().filter(r => r.entries.some(e => e.playerId === pid));
}

export function deletePlayer(id) {
  const p = state.players.find(x => x.id === id);
  if (p) { p.deleted = true; touch("players", p); save(); }
}

// ---------------------------------------------------------------- courses: the kit's files plus courses added on phones
export function courses() {
  const out = new Map(DATA.courses.map(c => [c.slug, { ...c, source: c.source || "kit" }]));
  for (const c of state.courses) {
    if (c.deleted) out.delete(c.slug);
    else out.set(c.slug, { ...c.data, slug: c.slug, source: c.source || "phone" });
  }
  return [...out.values()];
}

export function courseBy(slug) { return courses().find(c => c.slug === slug) || null; }

/** A course typed on a phone: validated by model.prepareCourse before it gets here. */
export function addCourse(slug, data) {
  let c = state.courses.find(x => x.slug === slug);
  if (!c) { c = { slug, data, source: "phone", deleted: false }; state.courses.push(c); }
  else { c.data = data; c.deleted = false; }
  touch("courses", c, slug);
  save();
  return c;
}

/** Soft-deletes a course added on a phone; kit courses stay (they come from the course files). */
export function removeCourse(slug) {
  const c = state.courses.find(x => x.slug === slug);
  if (!c) return;
  c.deleted = true;
  touch("courses", c, slug);
  save();
}

export function noteRecentCourse(slug) {
  const rc = [slug, ...(state.settings.recentCourses || []).filter(x => x !== slug)].slice(0, 5);
  state.settings.recentCourses = rc;
  save();
}

// ---------------------------------------------------------------- course handicaps from club tables
export function getPch(pid, course, tee) {
  const x = state.pch.find(y => y.player_id === pid && y.course === course && y.tee === tee && !y.deleted);
  return x ? x.ch : null;
}

export function setPch(pid, course, tee, ch) {
  let x = state.pch.find(y => y.player_id === pid && y.course === course && y.tee === tee);
  if (!x) { x = { player_id: pid, course, tee, ch: ch ?? 0, deleted: ch === null }; state.pch.push(x); }
  else { if (ch !== null) x.ch = ch; x.deleted = ch === null; }
  touch("player_course_handicap", x, `${pid}|${course}|${tee}`);
  save();
}

// ---------------------------------------------------------------- rounds
export function rounds() {
  return live(state.rounds).filter(r => !r.stub).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
}

export function createRound({ course, name, date, defaultTee, allowance }) {
  const r = { id: uid(), course, name, date, defaultTee, allowance: Number(allowance) || 100, status: "setup",
    hole: 0, entries: [], removed: [], created: now(), deleted: false };
  state.rounds.unshift(r);
  touch("rounds", r);
  noteRecentCourse(course);
  return r;
}

export function getRound(id) {
  return state.rounds.find(r => r.id === id && !r.deleted && !r.stub) || null;
}

/** Which hole this phone is on in a round: kept on the phone, so two phones on different holes do not fight. */
export function holeOf(r) { return state.settings.holes[r.id] ?? r.hole ?? 0; }
export function setHole(r, h) { state.settings.holes[r.id] = h; save(); }

/** Header fields changed (name, status, hole, ...). */
export function saveRound(r) {
  touch("rounds", r);
  save();
}

/** An entry's own fields changed (tee, index, group, penalties, ...), not its scores. */
export function saveEntry(r, e) {
  touch("round_entries", e, `${r.id}|${e.playerId}`);
  save();
}

/** One hole of one player: the smallest thing that syncs, so two phones never collide on a round. */
export function setScore(r, e, h, v) {
  e.scores[h] = v;
  e.scoreTs[h] = now();
  mark("scores", `${r.id}|${e.playerId}|${h}`, e.scoreTs[h]);
  save();
}

export function deleteRound(id) {
  const r = state.rounds.find(x => x.id === id);
  if (r) { r.deleted = true; touch("rounds", r); save(); }
}

/** Adds a player to a round: links to the roster, snapshots what they play with today. */
export function addEntry(round, n, { name, hi, tee, gender, courseHandicap, group = 1, fromHole = 1 }) {
  const known = findPlayer(name);  // a scan of an old card must not rewrite the index they play off today
  const stale = known && round.date && lastPlayedDate(known.id, round.id) > round.date;
  const p = upsertPlayer(name, stale ? null : hi, gender);
  const ghost = round.removed.find(x => x.playerId === p.id);  // taken out earlier: their scores come back with them
  round.removed = round.removed.filter(x => x.playerId !== p.id);
  const e = { playerId: p.id, name: p.name, hi, tee, gender: gender || "m", courseHandicap: courseHandicap ?? null, group, fromHole,
    scores: ghost ? ghost.scores : new Array(n).fill(null), scoreTs: ghost ? ghost.scoreTs : new Array(n).fill(null), penalties: [], updated_at: now() };
  round.entries.push(e);
  mark("round_entries", `${round.id}|${e.playerId}`, e.updated_at);
  save();
  return e;
}

/** Removes a player from a round with a tombstone, so another phone's copy does not bring them back. */
export function removeEntry(r, i) {
  const e = r.entries.splice(i, 1)[0];
  r.removed = r.removed.filter(x => x.playerId !== e.playerId);
  e.deleted = true;
  r.removed.push(e);
  touch("round_entries", e, `${r.id}|${e.playerId}`);
  save();
}

/** What model.compute expects from a stored round. */
export function toModelRound(round) {
  return {
    name: round.name, date: round.date, defaultTee: round.defaultTee, allowance: round.allowance,
    final: round.status === "done",
    entries: round.entries.map(e => ({ id: e.playerId, name: e.name, hi: e.hi, tee: e.tee, gender: e.gender, group: e.group,
      courseHandicap: e.courseHandicap ?? getPch(e.playerId, round.course, e.tee), scores: e.scores, penalties: e.penalties, fromHole: e.fromHole || 1 })),
  };
}

// ---------------------------------------------------------------- leagues
export function leagues() { return live(state.leagues).sort((a, b) => a.name.localeCompare(b.name)); }

export const FORMATS = ["stableford", "stroke", "match", "matchpts", "soccer", "soccerpts", "gp", "gpstroke"];
export const cleanFormats = f => { const x = FORMATS.filter(k => Array.isArray(f) && f.includes(k)); return x.length ? x : ["stableford"]; };

export function createLeague(name, bestN = 0, createdBy = null, formats = ["stableford"]) {
  const g = { id: uid(), name, bestN: Number(bestN) || 0, createdBy, created: today(), deleted: false, formats: cleanFormats(formats) };
  state.leagues.push(g);
  touch("leagues", g);
  save();
  return g;
}

export function getLeague(id) { return state.leagues.find(g => g.id === id && !g.deleted) || null; }

export function saveLeague(g) { touch("leagues", g); save(); }

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
  touch("league_rounds", x, `${leagueId}|${roundId}`);
  save();
}

// ---------------------------------------------------------------- backup
export function exportJSON() {
  state.settings.lastExport = now();
  save();
  return JSON.stringify({ app: "hagolf", format: 3, exported: state.settings.lastExport, players: state.players, rounds: state.rounds,
    leagues: state.leagues, leagueRounds: state.leagueRounds, courses: state.courses, pch: state.pch }, null, 1);
}

/** Merges a backup in: the newer updated_at wins per record. Importing twice changes nothing. */
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!["hagolf", "apeliotes-golf"].includes(d.app) || !Array.isArray(d.players) || !Array.isArray(d.rounds)) throw new Error("This is not a Hagolf backup file.");
  const stamp = d.exported || "2026-01-01T00:00:00.000Z";
  let added = 0;
  const merge = (table, list, incoming, key) => {
    for (const rec of incoming || []) {
      if (!rec.updated_at) rec.updated_at = stamp;
      const i = list.findIndex(x => key(x) === key(rec));
      if (i < 0) { list.push(rec); mark(table, key(rec), rec.updated_at); added++; }
      else if ((list[i].updated_at || "") < rec.updated_at) { list[i] = rec; mark(table, key(rec), rec.updated_at); added++; }
    }
  };
  merge("players", state.players, d.players, x => x.id);
  for (const r of d.rounds) {
    r.entries = r.entries || []; r.removed = r.removed || [];
    r.updated_at = r.updated_at || stamp;
    for (const e of [...r.entries, ...r.removed]) { e.scores = e.scores || []; e.scoreTs = e.scoreTs || e.scores.map(v => v === null ? null : stamp); e.updated_at = e.updated_at || stamp; }
    const mine = state.rounds.find(x => x.id === r.id);
    if (!mine) {
      state.rounds.push(r); added++;
      mark("rounds", r.id, r.updated_at);
      r.entries.forEach(e => { mark("round_entries", `${r.id}|${e.playerId}`, e.updated_at); e.scores.forEach((v, h) => { if (v !== null) mark("scores", `${r.id}|${e.playerId}|${h}`, e.scoreTs[h]); }); });
    } else {
      added += mergeRoundInto(mine, r) ? 1 : 0;
    }
  }
  merge("leagues", state.leagues, d.leagues, x => x.id);
  merge("league_rounds", state.leagueRounds, d.leagueRounds, x => `${x.league_id}|${x.round_id}`);
  merge("courses", state.courses, d.courses, x => x.slug);
  merge("player_course_handicap", state.pch, d.pch, x => `${x.player_id}|${x.course}|${x.tee}`);
  save();
  return { added };
}

/** Merge another copy of a round into mine, per header, per entry and per hole; queues what changed. */
function mergeRoundInto(mine, theirs) {
  let changed = false;
  if ((theirs.updated_at || "") > (mine.updated_at || "")) {
    for (const k of ["name", "date", "course", "defaultTee", "allowance", "status", "hole", "deleted", "updated_at"]) mine[k] = theirs[k];
    mark("rounds", mine.id, mine.updated_at); changed = true;
  }
  for (const te of [...theirs.entries, ...(theirs.removed || [])]) {
    te.scoreTs = te.scoreTs || te.scores.map(v => v === null ? null : theirs.updated_at);
    const i = mine.entries.findIndex(e => e.playerId === te.playerId);
    const j = mine.removed.findIndex(e => e.playerId === te.playerId);
    const me_ = i >= 0 ? mine.entries[i] : (j >= 0 ? mine.removed[j] : null);
    if (!me_) {
      (te.deleted ? mine.removed : mine.entries).push(te);
      mark("round_entries", `${mine.id}|${te.playerId}`, te.updated_at);
      te.scores.forEach((v, h) => { if (v !== null) mark("scores", `${mine.id}|${te.playerId}|${h}`, te.scoreTs[h]); });
      changed = true;
      continue;
    }
    if ((te.updated_at || "") > (me_.updated_at || "")) {
      const keep = { scores: me_.scores, scoreTs: me_.scoreTs };
      Object.assign(me_, te, keep);
      if (te.deleted && i >= 0) { mine.entries.splice(i, 1); mine.removed.push(me_); }
      if (!te.deleted && j >= 0) { mine.removed.splice(j, 1); mine.entries.push(me_); }
      mark("round_entries", `${mine.id}|${te.playerId}`, me_.updated_at); changed = true;
    }
    te.scores.forEach((v, h) => {
      if (v === null || (te.scoreTs[h] || "") <= (me_.scoreTs[h] || "")) return;
      me_.scores[h] = v; me_.scoreTs[h] = te.scoreTs[h];
      mark("scores", `${mine.id}|${te.playerId}|${h}`, te.scoreTs[h]); changed = true;
    });
  }
  return changed;
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
    if ((e.fromHole || 1) > 1) L.push(`  from_hole: ${e.fromHole}`);
    L.push(`  scores: [${e.scores.map(s => s === null ? "" : s).join(", ")}]`);
    if (e.penalties && e.penalties.length) {
      L.push("  penalties:");
      for (const p of e.penalties) L.push(`  - {hole: ${p.hole}, strokes: ${p.strokes}, reason: ${yamlStr(p.reason || "")}}`);
    }
  }
  return L.join("\n") + "\n";
}

/**
 * A phone-made course as courses/<slug>.yaml for the desktop kit. Everything that cannot be worked out again
 * from par and ratings has to be written: `nines` is how a round is split back into its loops, `first_hole`
 * is what a 10-18 loop numbers its holes from, and a tee with its own par list keeps it. Leaving any of them
 * out quietly turns a club's loop into an unrelated nine the next time the file is read.
 */
export function courseToYAML(c) {
  const w = c.where || null;
  const L = [`# ${c.name}${c.loop ? " " + c.loop : ""}. Added on a phone in Hagolf; check ratings against the club card.`,
    `name: ${yamlStr(c.name)}`, `loop: ${yamlStr(c.loop || "")}`];
  if (w && (w.town || w.country)) {
    const bits = ["town", "region", "country", "lat", "lng"].filter(k => w[k] !== undefined && w[k] !== null && w[k] !== "");
    L.push(`where: {${bits.map(k => `${k}: ${typeof w[k] === "number" ? w[k] : yamlStr(String(w[k]))}`).join(", ")}}`);
  }
  if ((c.nines || []).length) L.push(`nines: [${c.nines.join(", ")}]`);
  if (c.first_hole && c.first_hole !== 1) L.push(`first_hole: ${c.first_hole}`);
  if (c.provenance && (c.provenance.ratings || c.provenance.stroke_index)) {
    L.push(`source: {ratings: ${c.provenance.ratings || "unknown"}, stroke_index: ${c.provenance.stroke_index || "unknown"}}`);
  }
  L.push(`par: [${c.par.join(", ")}]`, `stroke_index: [${c.stroke_index.join(", ")}]`, "tees:");
  for (const [tee, t] of Object.entries(c.tees)) {
    L.push(`  ${tee}:`);
    if (t.ratings && t.ratings.m) { L.push(`    course_rating: ${t.ratings.m.cr}`); L.push(`    slope: ${t.ratings.m.slope}`); }
    if (t.ratings && t.ratings.f) L.push(`    women: {course_rating: ${t.ratings.f.cr}, slope: ${t.ratings.f.slope}}`);
    if (t.par && String(t.par) !== String(c.par)) L.push(`    par: [${t.par.join(", ")}]`);
    if (t.metres) L.push(`    metres: [${t.metres.join(", ")}]`);
  }
  return L.join("\n") + "\n";
}

// A rename that happened before the app carried names into every record: put the stored copies back in step on start-up.
if (reconcileNames()) save();
