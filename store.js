// Local store (localStorage) and the change queue for sync. Players, rounds (header + entries + per-hole scores),
// leagues, league-round attachments, courses added on phones, course handicaps from club tables, settings.
// Every record carries updated_at and deleted; the queue remembers which records changed and when.
import { DATA } from "./data.js";
import { STAT_SWITCH_KEYS, emptyStat, blankStat, UNLISTED_TEE } from "./model.js";
import { mirror } from "./idb.js";

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
    leagueMembers: s.leagueMembers || [], roundShares: s.roundShares || [], roundMembers: s.roundMembers || [], bag: s.bag || [],
    courses: s.courses || [], pch: s.pch || [], orphanScores: s.orphanScores || [], orphanStats: s.orphanStats || [], held: s.held || [], quarantine: s.quarantine || [],
    settings: s.settings || {} };
  st.settings.holes = st.settings.holes || {};  // the hole each round is open at, on this phone only
  if (!st.settings.deviceId) st.settings.deviceId = uid();
  // `themes` was the last set ticked on a graphics screen. The setting that replaced it dresses the whole app,
  // so a phone that never chose one starts on paper, the default, rather than its last render.
  if (!st.settings.theme) st.settings.theme = "paper";
  delete st.settings.themes;
  for (const r of st.rounds) {
    r.entries = r.entries || [];
    r.removed = r.removed || [];
    for (const e of [...r.entries, ...r.removed]) {
      e.scoreTs = e.scoreTs || e.scores.map(() => null);
      e.stats = e.stats || e.scores.map(() => null);       // one record per hole, or null for a hole with nothing on it
      e.statsTs = e.statsTs || e.scores.map(() => null);
      e.trackStats = !!e.trackStats;
      e.updated_at = e.updated_at || r.updated_at;
      // a seat from before seats existed: its contact is its id, and its account is whoever that contact was linked to
      if (!e.contactId) e.contactId = e.playerId;
      if (e.accountId === undefined) { const p = st.players.find(x => x.id === e.contactId); e.accountId = (p && p.linkedAccount) || null; }
      e.role = e.role || "player";
      e.members = e.members || [];
    }
    r.format = r.format || "stableford";
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
  const st = { players: s.players || [], rounds: s.rounds || [], leagues, leagueRounds, courses: [], pch: [], orphanScores: [], orphanStats: [], settings: s.settings || {} };
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
  mirror();   // the second copy, in IndexedDB, for the day the browser empties localStorage
  if (onSave) onSave();
}

/** Everything that arrived from other phones is already in state; persist it without queueing anything. */
export function afterPull() {
  reconcileNames();  // a phone on an older build can push an entry still under a since-renamed spelling
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* full */ }
  mirror();
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

/**
 * A card is never locked: whoever played a round can still correct it, however old it is. Kept as a function
 * because the screens ask it, and because a future league may want to close its own season.
 */
export function roundOpen(r) {
  return true;
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

/**
 * Makes the signed-in golfer a contact in their own address book, linked to their own account, and the one this
 * phone means by "me". Their name on a card and their line in a league both come from this record, and a round
 * they score for themselves has an entry claimed by them from the start.
 */
export function linkMe(account) {
  // An account with no name yet cannot be a contact: the welcome screen asks for one first, and a name is what
  // a card, a board and a league line are drawn from.
  if (!account || !account.name) return null;
  const p = upsertPlayer(account.name, account.hi ?? null, account.gender || "m");
  if (p.linkedAccount !== account.id || p.owner !== account.id) {
    p.linkedAccount = account.id;
    p.owner = p.owner || account.id;
    touch("players", p);
  }
  state.settings.meId = p.id;
  state.settings.welcomed = true;
  save();
  foldMe();
  return me() || p;
}

/**
 * A new phone signs in before its first pull, so it makes its own "me" and then pulls the one the old phone made:
 * two contacts, both mine and linked to me, and every card on the other one stops being mine. They fold into the
 * oldest, the same on every phone, so two phones healing at once cannot each delete the other's.
 */
export function foldMe() {
  const acct = myAccount();
  if (!acct) return false;
  const selves = state.players.filter(p => !p.deleted && p.owner === acct && p.linkedAccount === acct)
    .sort((a, b) => String(a.created || "9").localeCompare(String(b.created || "9")) || a.id.localeCompare(b.id));
  for (const drop of selves.slice(1)) mergePlayers(selves[0].id, drop.id);
  return selves.length > 1;
}

// ---------------------------------------------------------------- roster
/** Case, accent and punctuation insensitive key so "Maurits van 't Hag" and "maurits van t hag" are one player. */
export function nameKey(name) {
  return String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * A contact id used to be a hash of the name alone, so that two phones adding the same person converged on one
 * record. That is right for one group sharing everything and wrong for a product: everybody who ever typed
 * "Jan de Vries" got the same row, so your edit to your friend's handicap landed on a stranger's round.
 *
 * The id is now scoped to whoever's address book it is in. Two accounts adding the same golfer get two contacts,
 * which is correct -- they are two people's private records of one person -- and `linkedAccount` is what puts
 * them back together on a leaderboard once that golfer claims themself.
 */
export function playerId(name, owner = null) {
  const k = (owner ? owner + "\u0000" : "") + nameKey(name);
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < k.length; i++) { const c = k.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
  return "p" + (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** The account this phone is signed in as, or null. Set by sync.js once a session exists. */
export function myAccount() { return state.settings.accountId || null; }

export function players() { return live(state.players); }

/**
 * By current name or any earlier spelling (aliases), within my own address book only. Searching every contact
 * would hand me somebody else's record of a golfer with the same name, and my edits to it would land on their
 * rounds -- which is the whole reason contacts have an owner.
 *
 * A contact with no owner predates accounts. It is treated as mine so that signing in does not fork the roster;
 * the migration gives those rows an owner for good.
 */
export function findPlayer(name) {
  const k = nameKey(name), mine = myAccount();
  const matches = p => !p.deleted && (nameKey(p.name) === k || (p.aliases || []).includes(k));
  return state.players.find(p => matches(p) && p.owner === mine)
    || state.players.find(p => matches(p) && !p.owner)
    || null;
}

/** Returns the roster player for a name, creating one when new; updates the index and gender they last used. */
export function upsertPlayer(name, hi, gender) {
  let p = findPlayer(name);
  const ts = now();
  if (!p) {
    p = { id: playerId(name, myAccount()), owner: myAccount(), linkedAccount: null, name: name.trim(), hi,
      gender: gender || "m", created: today(), hiUpdated: ts, aliases: [], deleted: false };
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
    const e = { ...old, playerId: keepId, name: keep.name, deleted: false, updated_at: now(), scores: [...old.scores], scoreTs: old.scores.map(v => v === null ? null : now()),
      stats: [...(old.stats || old.scores.map(() => null))], statsTs: old.scores.map((_, h) => (old.stats || [])[h] ? now() : null) };
    r.removed = r.removed.filter(x => x.playerId !== keepId);
    r.entries.push(e);
    mark("round_entries", `${r.id}|${keepId}`, e.updated_at);
    e.scores.forEach((v, h) => { if (v !== null) mark("scores", `${r.id}|${keepId}|${h}`, e.scoreTs[h]); });
    e.stats.forEach((v, h) => { if (v) mark("hole_stats", `${r.id}|${keepId}|${h}`, e.statsTs[h]); });
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
function allCourses() {
  const out = new Map(DATA.courses.map(c => [c.slug, { ...c, source: c.source || "kit" }]));
  for (const c of state.courses) {
    if (c.deleted) out.delete(c.slug);
    else out.set(c.slug, { ...c.data, slug: c.slug, source: c.source || "phone" });
  }
  return [...out.values()];
}

/** The courses anyone can pick: an unlisted one belongs to its one round and is never offered again. */
export function courses() { return allCourses().filter(c => !c.unlisted); }

export function courseBy(slug) { return allCourses().find(c => c.slug === slug) || null; }

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

// ---------------------------------------------------------------- a course nobody has a card for
/** A round on a course the app does not know: its pars are filled in hole by hole while it is played. */
export function createUnlistedRound({ name, date, holes }) {
  const slug = `unlisted-${uid()}`;
  addCourse(slug, { name: "Unlisted course", unlisted: true, n: holes, first_hole: 1, par: new Array(holes).fill(null),
    stroke_index: [...Array(holes).keys()].map(h => h + 1), course_par: 0, tees: { [UNLISTED_TEE]: {} } });
  return createRound({ course: slug, name, date, defaultTee: UNLISTED_TEE, allowance: 100 });
}

export function setPar(r, h, par) {
  const c = state.courses.find(x => x.slug === r.course);
  if (!c || !c.data.unlisted || c.data.par[h] === par) return;
  const pars = c.data.par.map((p, k) => k === h ? par : p);
  addCourse(c.slug, { ...c.data, par: pars, course_par: pars.reduce((a, p) => a + (p || 0), 0) });
}

export function noteRecentCourse(slug) {
  if (slug.startsWith("unlisted-")) return;
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

export const ROUND_FORMATS = ["stableford", "stroke", "match", "matchpts", "scramble", "scramblepts", "scramblematch", "scramblematchpts"];

export function createRound({ course, name, date, defaultTee, allowance, brand = null, format = "stableford", leagueId = null, id = null }) {
  const r = { id: id || uid(), owner: myAccount(), course, name, date, defaultTee, allowance: Number(allowance) || 100, status: "setup", brand,
    format: ROUND_FORMATS.includes(format) ? format : "stableford", leagueId, live: false,
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

/**
 * The extras on one hole of one player: putts, fairway, and the rest, merged into whatever is already there.
 * Its own row and its own clock, apart from the score, so the phone keeping the card and the phone adding its
 * owner's putts can both write the same hole without one quietly undoing the other.
 */
export function setStat(r, e, h, patch) {
  const next = { ...blankStat(), ...(e.stats[h] || {}), ...patch };
  e.stats[h] = emptyStat(next) ? null : next;
  e.statsTs[h] = now();
  mark("hole_stats", `${r.id}|${e.playerId}|${h}`, e.statsTs[h]);
  save();
}

/** Whether this player's extras are being kept. Shared, not per phone: two scorers must agree on whose card has them. */
export function setTrackStats(r, e, on) {
  e.trackStats = !!on;
  saveEntry(r, e);
}

/**
 * Which extras this round is keeping on this phone. Off on every card until the Extras button on the score
 * screen (or the picker on Players) opens them, and remembered for the rest of that card.
 */
export function statsFor(rid) {
  const per = (state.settings.statsRound || {})[rid];
  if (per) return Object.fromEntries(STAT_SWITCH_KEYS.map(k => [k, !!per[k]]));
  // a card shows the extras this golfer keeps; a guest switched on by a scorer who keeps nothing gets all of them
  const k = myKeep();
  return Object.fromEntries(STAT_SWITCH_KEYS.map(x => [x, keepsAny(k) ? !!k[x] : true]));
}

// ---------------------------------------------------------------- which extras I keep: one setting, on the account
export const KEEP_PRESETS = {
  score: {}, putts: { putts: true }, all: { putts: true, fairway: true, bunker: true, penaltyShots: true },
};
export const keepsAny = k => !!k && STAT_SWITCH_KEYS.some(x => k[x]);
export function myKeep() { const k = state.settings.keep; return k && typeof k === "object" ? k : null; }
export function setMyKeep(k) { state.settings.keep = k || {}; save(); }
/** Which preset a set of kinds is, or "choose" when it is none of them. */
export function keepPreset(k) {
  for (const [name, p] of Object.entries(KEEP_PRESETS)) if (STAT_SWITCH_KEYS.every(x => !!(k || {})[x] === !!p[x])) return name;
  return "choose";
}
/** The account's own answer wins over whatever this phone last had. */
export function takeAccountKeep(account) {
  if (account && account.keep && JSON.stringify(account.keep) !== JSON.stringify(state.settings.keep)) { state.settings.keep = account.keep; save(); }
  if (account && account.units && account.units !== state.settings.units) { state.settings.units = account.units; save(); }
}
export const units = () => state.settings.units === "yd" ? "yd" : "m";
export const lengthIn = m => m === null || m === undefined ? null : units() === "yd" ? Math.round(m / 0.9144) : Math.round(m);
export const lengthOut = v => v === null || v === undefined || v === "" ? null : units() === "yd" ? Math.round(Number(v) * 0.9144 * 10) / 10 : Number(v);

export function setStatsFor(rid, kinds) {
  state.settings.statsRound = state.settings.statsRound || {};
  state.settings.statsRound[rid] = kinds;
  save();
}

/** What unlocking opens on a card: the kinds ticked in Settings, or everything until somebody narrows it. */
/** Turning the extras on turns on all of them; switching one back off afterwards is one tap in the sheet. */
export function defaultStats() {
  const on = state.settings.stats;
  return Object.fromEntries(STAT_SWITCH_KEYS.map(k => [k, on ? !!on[k] : true]));
}

export function setDefaultStats(kinds) { state.settings.stats = kinds; save(); }

/**
 * Whether the extras are drawn on the images as well as read back on screen. On by default: somebody who
 * took the trouble to write putts down on eighteen holes usually wants them on the card. One answer for
 * this phone, which the Images screen offers again per round and writes back when it is changed.
 */
export const statsOnImages = () => state.settings.statsImages !== false;
export function setStatsOnImages(on) { state.settings.statsImages = !!on; save(); }
/** What the Images screen last made on this phone, `{ kinds, themes, league, size }`, offered again on the next round. */
export const imageChoice = () => state.settings.images || {};
export function setImageChoice(choice) { state.settings.images = { ...imageChoice(), ...choice }; save(); }
export const IMAGE_SIZES = ["full", "phone", "both"];
// most people look at these on a phone, so that is the size until this phone has said otherwise
export const imageSize = () => IMAGE_SIZES.includes(imageChoice().size) ? imageChoice().size : "phone";

/** The Extras button: opens the ticked kinds for this card and every player on it, or shuts them again.
 * The only place a player's `trackStats` is turned on by default; anywhere else reads `cardKeepsStats`. */
export function unlockStats(r, on) {
  const kinds = Object.fromEntries(STAT_SWITCH_KEYS.map(k => [k, !!on]));
  setStatsFor(r.id, kinds);
  if (on) for (const e of r.entries) if (!e.trackStats) setTrackStats(r, e, true);
}

/** True when this round is keeping anything at all on this phone. */
export const anyStatsOn = rid => Object.values(statsFor(rid)).some(Boolean);

/**
 * Whether this card has ever been asked for extras. Which kinds are open is per phone, but *whose* card keeps
 * them is shared, so this is the one card-level fact both scorers can see -- and the only thing a player added
 * later can inherit. Read it rather than guessing again, or the two answers drift apart.
 */
export const cardKeepsStats = r => r.entries.some(e => e.trackStats);

export function deleteRound(id) {
  const r = state.rounds.find(x => x.id === id);
  if (r) { r.deleted = true; delete state.settings.holes[id]; if (state.settings.statsRound) delete state.settings.statsRound[id]; touch("rounds", r); save(); }
  if (r && (courseBy(r.course) || {}).unlisted) removeCourse(r.course);
}

/** Adds a player to a round: links to the roster, snapshots what they play with today. */
export function addEntry(round, n, { name, hi, tee, gender, courseHandicap, group = 1, fromHole = 1, trackStats = null, side = null, accountId = undefined }) {
  const known = findPlayer(name);  // a scan of an old card must not rewrite the index they play off today
  const stale = known && round.date && lastPlayedDate(known.id, round.id) > round.date;
  const p = upsertPlayer(name, stale ? null : hi, gender);
  const ghost = round.removed.find(x => x.playerId === p.id);  // taken out earlier: their scores come back with them
  round.removed = round.removed.filter(x => x.playerId !== p.id);
  const e = { playerId: p.id, name: p.name, hi, tee, gender: gender || "m", courseHandicap: courseHandicap ?? null, group, fromHole,
    scores: ghost ? ghost.scores : new Array(n).fill(null), scoreTs: ghost ? ghost.scoreTs : new Array(n).fill(null),
    stats: ghost ? ghost.stats : new Array(n).fill(null), statsTs: ghost ? ghost.statsTs : new Array(n).fill(null),
    // Whatever the card already does: nothing on a card nobody has asked, and keeping on one that has.
    trackStats: trackStats === null ? (ghost ? !!ghost.trackStats : cardKeepsStats(round)) : !!trackStats,
    // The account goes on the seat when this contact is that golfer (me, or a friend I added from the list);
    // the server keeps it only with their consent and otherwise holds it as a proposal.
    accountId: accountId !== undefined ? accountId : (p.linkedAccount || (ghost && ghost.accountId) || null), proposedAccount: null,
    contactId: p.id, side, role: "player", members: [],
    penalties: [], updated_at: now() };
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

/**
 * A scramble team: a seat that scores, whose members are seats that do not. The team's handicap is worked out
 * from its members (model.teamHandicap) and kept on the seat as its course handicap.
 */
export function addTeam(round, n, { name, members = [], tee, courseHandicap = null, hi = 0, gender = "m", group = 1 }) {
  const id = "t" + uid().replace(/-/g, "").slice(0, 15);
  const e = { playerId: id, name, hi, tee, gender, courseHandicap, group, fromHole: 1, scores: new Array(n).fill(null), scoreTs: new Array(n).fill(null),
    stats: new Array(n).fill(null), statsTs: new Array(n).fill(null), trackStats: false, accountId: null, proposedAccount: null, contactId: null,
    side: null, role: "team", members: [...members], penalties: [], updated_at: now() };
  round.entries.push(e);
  mark("round_entries", `${round.id}|${id}`, e.updated_at);
  for (const m of round.entries.filter(x => members.includes(x.playerId))) { m.role = "member"; m.side = id; saveEntry(round, m); }
  save();
  return e;
}

/** Puts members into a team (or none), keeping each member seat's side pointing at its team. */
export function setTeamMembers(round, team, members) {
  for (const m of round.entries) {
    if (m.role === "team") continue;
    const inIt = members.includes(m.playerId);
    if (inIt && (m.role !== "member" || m.side !== team.playerId)) { m.role = "member"; m.side = team.playerId; saveEntry(round, m); }
    if (!inIt && m.side === team.playerId) { m.role = "player"; m.side = null; saveEntry(round, m); }
  }
  team.members = [...members];
  saveEntry(round, team);
}

export function setSide(round, e, side) { e.side = side; saveEntry(round, e); }

// ---------------------------------------------------------------- a card of several groups, and events
export const groupOf = e => e.group || 1;
export const manyGroups = r => new Set(r.entries.map(groupOf)).size > 1;
/** Whether a group has handed its card in. */
export const groupIn = (r, g) => r.entries.some(e => groupOf(e) === g) && r.entries.filter(e => groupOf(e) === g).every(e => e.signed);

/** One group hands its card in. The day ends with the last group, so the first one in does not end it for everyone. */
export function signGroup(r, g) {
  for (const e of r.entries.filter(e => groupOf(e) === g && !e.signed)) { e.signed = true; saveEntry(r, e); }
  settleDay(r);
}

/** Two groups signing at once each see the other still out; whoever next sees every group in ends the day. */
export function settleDay(r) {
  if (r.status === "done" || !r.entries.length || !r.entries.every(e => e.signed)) return false;
  r.status = "done";
  saveRound(r);
  return true;
}

/** The golfer a seat is: their account when they hold it, otherwise the contact's identity. */
export function seatIdentity(e) {
  return e.accountId || identityOf(e.contactId || e.playerId);
}

/** Seats that play: a scramble's teams and everyone in a round of any other format; never a team's members. */
export const scoringSeats = r => r.entries.filter(e => e.role !== "member");

/** Whether this phone's account may score this card: the owner, or a member the server let on. */
export function isScorer(r) {
  const me = myAccount();
  if (!r) return false;
  if (!me || !r.owner || r.owner === me) return true;
  return state.roundMembers.some(m => !m.deleted && m.round_id === r.id && m.account_id === me);
}

/** The seat on this card that is me, if any. */
export function mySeat(r) {
  const me = myAccount(), mine = state.settings.meId;
  return (r.entries || []).find(e => (me && e.accountId === me) || (!e.accountId && mine && e.contactId === mine)) || null;
}

/** Rounds I played: a seat holds my account. Cards others scored for me count too. */
export function myRounds() {
  return rounds().filter(r => !!mySeat(r));
}

/** What model.compute expects from a stored round. */
/** The identity a contact belongs to: their own account once they have claimed themselves, otherwise itself. */
export function identityOf(id) {
  const p = state.players.find(x => x.id === id);
  return (p && p.linkedAccount) || id;
}

/**
 * The index a contact plays off today. A golfer who has claimed themselves keeps their own index on their
 * account, and that is the truth; this phone's copy is what it was the last time it typed them in. The entry
 * still snapshots whatever is used, so a round reproduces itself after the index moves.
 */
export function currentIndex(p) {
  return p && p.hiLinked !== null && p.hiLinked !== undefined ? p.hiLinked : (p ? p.hi : null);
}

/** What the backend says the linked golfers' own indexes are, by account id; kept on the contact, never pushed. */
export function applyLinkedIndexes(byAccount) {
  let changed = 0;
  for (const p of state.players) {
    if (!p.linkedAccount || !(p.linkedAccount in byAccount)) continue;
    const a = byAccount[p.linkedAccount];
    const hi = a && a.hi !== null && a.hi !== undefined ? Number(a.hi) : null;
    if (p.hiLinked !== hi) { p.hiLinked = hi; changed++; }
  }
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* full */ } mirror(); }
  return changed;
}

/** The spelling to show for an identity: the newest among the contacts pointing at it. */
export function identityName(key, fallback) {
  const mine = state.players.filter(p => !p.deleted && (p.linkedAccount === key || p.id === key));
  if (!mine.length) return fallback;
  mine.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return mine[0].name || fallback;
}

/**
 * `collapse` is what a league table needs: three people may each hold a contact for the same golfer, and those
 * are one line, not three. It rewrites each entry's id to its identity, which is all the model compares on, so
 * standings, head-to-heads and the stats posters all get it without knowing about contacts at all.
 *
 * A round's own screens never collapse -- they address entries by contact id, and the card belongs to whoever
 * was written on it that day.
 */
export function toModelRound(round, collapse = false) {
  const seen = new Set();
  const entries = [];
  for (const e of round.entries) {
    if (e.role === "member") continue;                         // a scramble team scores; its members do not
    // and a team is nobody's personal round, except in a match, where its members won or lost it
    if (collapse && e.role === "team" && !String(round.format || "").startsWith("scramblematch")) continue;
    const id = collapse ? seatIdentity(e) : e.playerId;
    if (seen.has(id)) continue;   // two contacts for one golfer on one card: a data error, and not two players
    seen.add(id);
    entries.push({ id, name: collapse && !e.accountId ? identityName(id, e.name) : e.name, hi: e.hi, tee: e.tee, gender: e.gender, group: e.group,
      courseHandicap: e.courseHandicap ?? getPch(e.contactId || e.playerId, round.course, e.tee), scores: e.scores, penalties: e.penalties, fromHole: e.fromHole || 1,
      stats: e.stats || [], trackStats: !!e.trackStats, side: e.side || null, role: e.role || "player", squad: e.squad || 0,
      members: (e.members || []).map(m => (round.entries.find(x => x.playerId === m) || {}).name).filter(Boolean),
      memberIds: collapse ? (e.members || []).map(m => round.entries.find(x => x.playerId === m)).filter(Boolean).map(seatIdentity) : null });
  }
  return {
    format: round.format || "stableford",
    name: round.name, date: round.date, defaultTee: round.defaultTee, allowance: round.allowance,
    final: round.status === "done",
    entries,
  };
}

// ---------------------------------------------------------------- leagues
export function leagues() { return live(state.leagues).sort((a, b) => a.name.localeCompare(b.name)); }

/** The leagues this account belongs to, as a set of ids. What a phone is allowed to pull follows from it. */
export function myLeagueIds() {
  const me = myAccount();
  return new Set(state.leagueMembers.filter(m => !m.deleted && m.account_id === me).map(m => m.league_id));
}

/** The rounds handed to me, as a set of ids; and, for one round, who it was handed to. */
export function sharedWithMe() {
  const me = myAccount();
  return new Set(state.roundShares.filter(x => !x.deleted && x.account_id === me).map(x => x.round_id));
}
export function sharesOf(roundId) {
  return state.roundShares.filter(x => !x.deleted && x.round_id === roundId);
}

/** Whether this phone's account was on a round's card, or created it. What a share sheet and a delete button ask. */
export function iPlayed(r) {
  const me = myAccount();
  if (!r) return false;
  if (me && r.owner === me) return true;
  return !!mySeat(r) || (!!me && state.roundMembers.some(m => !m.deleted && m.round_id === r.id && m.account_id === me));
}

/** My membership row in one league, which is what says whether I have claimed a player in it. */
export function myMembership(leagueId) {
  const me = myAccount();
  return state.leagueMembers.find(m => !m.deleted && m.league_id === leagueId && m.account_id === me) || null;
}

export const FORMATS = ["stableford", "stroke", "match", "matchpts", "soccer", "soccerpts", "gp", "gpstroke", "elo", "elopts", "elostroke", "elomatch"];
export const cleanFormats = f => { const x = FORMATS.filter(k => Array.isArray(f) && f.includes(k)); return x.length ? x : ["stableford"]; };

export function createLeague(name, bestN = 0, createdBy = null, formats = ["stableford"]) {
  const g = { id: uid(), owner: myAccount(), name, bestN: Number(bestN) || 0, createdBy, created: today(), deleted: false, formats: cleanFormats(formats), theme: null, icon: null, brand: null };
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

// ---------------------------------------------------------------- my bag: club distances, in metres, mine alone
export const STARTER_BAG = ["Driver", "3 wood", "5 wood", "4 hybrid", "5 iron", "6 iron", "7 iron", "8 iron", "9 iron", "PW", "50°", "54°", "58°"];

export function bag() {
  const me = myAccount() || "";
  return state.bag.filter(x => !x.deleted && x.account_id === me).sort((a, b) => (a.sort || 0) - (b.sort || 0));
}

export function saveClub(c) {
  const me = myAccount() || "";
  let x = state.bag.find(y => y.account_id === me && y.club_id === c.club_id);
  if (!x) { x = { account_id: me, club_id: c.club_id || uid().slice(0, 8), deleted: false }; state.bag.push(x); }
  Object.assign(x, { club: c.club, carry_m: c.carry_m ?? null, total_m: c.total_m ?? null, note: c.note || "", sort: c.sort ?? x.sort ?? bag().length, deleted: false });
  touch("club_bag", x, `${me}|${x.club_id}`);
  save();
  return x;
}

function reorderBag(list) {
  const me = myAccount() || "";
  list.forEach((x, i) => { if (x.sort !== i) { x.sort = i; touch("club_bag", x, `${me}|${x.club_id}`); } });
  save();
}

export function moveClub(clubId, step) {
  const list = bag(), i = list.findIndex(x => x.club_id === clubId), j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  reorderBag(list);
}

// A club that gets its carry for the first time slots in below the longer clubs and above the shorter ones;
// clubs with no carry yet don't count, so filling in a starter bag in any order leaves it where it is.
export function placeByCarry(clubId) {
  const list = bag(), i = list.findIndex(x => x.club_id === clubId), x = list[i];
  if (!x || !x.carry_m) return;
  const rest = list.filter(y => y !== x);
  let longer = -1, shorter = rest.length;
  rest.forEach((y, k) => {
    if (y.carry_m > x.carry_m) longer = k;
    else if (y.carry_m && y.carry_m < x.carry_m && shorter === rest.length) shorter = k;
  });
  const at = i <= longer ? longer + 1 : i > shorter ? shorter : i;
  if (at === i) return;
  rest.splice(at, 0, x);
  reorderBag(rest);
}

export function removeClub(clubId) {
  const me = myAccount() || "";
  const x = state.bag.find(y => y.account_id === me && y.club_id === clubId);
  if (!x) return;
  x.deleted = true;
  touch("club_bag", x, `${me}|${x.club_id}`);
  save();
}

/** The club whose carry is nearest a length, for a par 3. */
export function nearestClub(metres) {
  if (!metres) return null;
  let best = null;
  for (const c of bag()) if (c.carry_m && (!best || Math.abs(c.carry_m - metres) < Math.abs(best.carry_m - metres))) best = c;
  return best;
}

// ---------------------------------------------------------------- backup
export function exportJSON() {
  state.settings.lastExport = now();
  save();
  return JSON.stringify({ app: "hagolf", format: 3, exported: state.settings.lastExport, players: state.players, rounds: state.rounds,
    leagues: state.leagues, leagueRounds: state.leagueRounds, courses: state.courses, pch: state.pch, roundShares: state.roundShares }, null, 1);
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
    for (const e of [...r.entries, ...r.removed]) {
      e.scores = e.scores || []; e.scoreTs = e.scoreTs || e.scores.map(v => v === null ? null : stamp);
      e.stats = e.stats || e.scores.map(() => null); e.statsTs = e.statsTs || e.stats.map(x => x ? stamp : null);
      e.updated_at = e.updated_at || stamp;
    }
    const mine = state.rounds.find(x => x.id === r.id);
    if (!mine) {
      state.rounds.push(r); added++;
      mark("rounds", r.id, r.updated_at);
      r.entries.forEach(e => {
        mark("round_entries", `${r.id}|${e.playerId}`, e.updated_at);
        e.scores.forEach((v, h) => { if (v !== null) mark("scores", `${r.id}|${e.playerId}|${h}`, e.scoreTs[h]); });
        e.stats.forEach((v, h) => { if (v) mark("hole_stats", `${r.id}|${e.playerId}|${h}`, e.statsTs[h]); });
      });
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
    te.stats = te.stats || te.scores.map(() => null);
    te.statsTs = te.statsTs || te.stats.map(x => x ? theirs.updated_at : null);
    const i = mine.entries.findIndex(e => e.playerId === te.playerId);
    const j = mine.removed.findIndex(e => e.playerId === te.playerId);
    const me_ = i >= 0 ? mine.entries[i] : (j >= 0 ? mine.removed[j] : null);
    if (!me_) {
      (te.deleted ? mine.removed : mine.entries).push(te);
      mark("round_entries", `${mine.id}|${te.playerId}`, te.updated_at);
      te.scores.forEach((v, h) => { if (v !== null) mark("scores", `${mine.id}|${te.playerId}|${h}`, te.scoreTs[h]); });
      te.stats.forEach((v, h) => { if (v) mark("hole_stats", `${mine.id}|${te.playerId}|${h}`, te.statsTs[h]); });
      changed = true;
      continue;
    }
    if ((te.updated_at || "") > (me_.updated_at || "")) {
      const keep = { scores: me_.scores, scoreTs: me_.scoreTs, stats: me_.stats, statsTs: me_.statsTs };
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
    te.stats.forEach((v, h) => {
      if (!v || (te.statsTs[h] || "") <= (me_.statsTs[h] || "")) return;
      me_.stats[h] = v; me_.statsTs[h] = te.statsTs[h];
      mark("hole_stats", `${mine.id}|${te.playerId}|${h}`, te.statsTs[h]); changed = true;
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
    // The desktop kit reads players with .get() and ignores what it does not know, so carrying the extras
    // across costs it nothing and means an exported round is not a lossy copy of the one on the phone.
    if ((e.stats || []).some(Boolean)) {
      L.push("  hole_stats:");
      e.stats.forEach((x, h) => {
        if (!x) return;
        const f = [`hole: ${h + 1}`];
        if (x.putts !== null && x.putts !== undefined) f.push(`putts: ${x.putts}`);
        if (x.fairway) f.push(`fairway: ${x.fairway}`);
        if (x.gir !== null && x.gir !== undefined) f.push(`gir: ${x.gir ? "true" : "false"}`);
        if (x.penaltyShots) f.push(`penalty_shots: ${x.penaltyShots}`);
        if (x.bunker) f.push("bunker: true");
        L.push(`  - {${f.join(", ")}}`);
      });
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
