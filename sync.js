// Sync with a Supabase project over its REST API (PostgREST), no SDK. Local first: the phone keeps working
// offline, every change is queued, pushed when there is a connection, and other phones' changes are pulled by
// the server's own clock. Rows carry updated_at from the phone that wrote them; the newest write wins.
import { DATA } from "./data.js";
import * as S from "./store.js";

const ts = s => s ? new Date(s).getTime() : 0;  // Postgres returns +00:00, phones write Z: compare as numbers
const iso = s => s ? new Date(s).toISOString() : s;
const dev = () => S.state.settings.deviceId;
/** Newest updated_at wins; on an exact tie the higher device id wins, the same rule the server applies, so every phone converges. */
const newer = (row, existing) => ts(row.updated_at) > ts(existing.updated_at)
  || (ts(row.updated_at) === ts(existing.updated_at) && String(row.device_id || "") > String(existing.dev ?? dev()));

function findEntry(r, pid) {
  const i = r.entries.findIndex(e => e.playerId === pid), j = r.removed.findIndex(e => e.playerId === pid);
  return { e: i >= 0 ? r.entries[i] : j >= 0 ? r.removed[j] : null, i, j };
}

function roundFor(id) {
  let r = S.state.rounds.find(x => x.id === id);
  if (!r) { r = { id, stub: true, name: "", course: "", entries: [], removed: [], deleted: false, updated_at: null }; S.state.rounds.push(r); }
  return r;
}

const holesOf = c => c ? (c.par || []).length : 18;

/** Each table: rows to push for a set of keys, and how to apply an incoming row. */
const TABLES = {
  players: {
    collect: keys => S.state.players.filter(p => keys.has(p.id)).map(p => ({ id: p.id, name: p.name, hi: p.hi, gender: p.gender || "m",
      hi_updated: p.hiUpdated || null, aliases: p.aliases || [], created: p.created || null, deleted: !!p.deleted, updated_at: p.updated_at, device_id: dev() })),
    apply(r) {
      const rec = { id: r.id, name: r.name, hi: r.hi === null ? null : Number(r.hi), gender: r.gender || "m", hiUpdated: iso(r.hi_updated),
        aliases: r.aliases || [], created: r.created, deleted: !!r.deleted, updated_at: iso(r.updated_at), dev: r.device_id };
      return lww(S.state.players, p => p.id === r.id, rec, r);
    },
  },
  courses: {
    collect: keys => S.state.courses.filter(c => keys.has(c.slug)).map(c => ({ slug: c.slug, data: c.data, source: c.source || "phone",
      deleted: !!c.deleted, updated_at: c.updated_at, device_id: dev() })),
    apply: r => lww(S.state.courses, c => c.slug === r.slug, { slug: r.slug, data: r.data, source: r.source, deleted: !!r.deleted, updated_at: iso(r.updated_at), dev: r.device_id }, r),
  },
  rounds: {
    collect: keys => S.state.rounds.filter(r => keys.has(r.id) && !r.stub).map(r => ({ id: r.id, name: r.name, date: r.date || null, course: r.course,
      default_tee: r.defaultTee, allowance: r.allowance || 100, status: r.status, hole: r.hole || 0, created: r.created || null,
      deleted: !!r.deleted, updated_at: r.updated_at, device_id: dev() })),
    apply(r) {
      const mine = roundFor(r.id);
      if (mine.updated_at && !newer(r, mine)) return false;
      Object.assign(mine, { name: r.name, date: r.date, course: r.course, defaultTee: r.default_tee, allowance: r.allowance || 100,
        status: r.status, hole: r.hole || 0, created: iso(r.created), deleted: !!r.deleted, updated_at: iso(r.updated_at), dev: r.device_id, stub: false });
      const n = holesOf(S.courseBy(mine.course));
      for (const e of [...mine.entries, ...mine.removed]) {  // entries that arrived before the header were sized at 18
        if (e.scores.length !== n) { e.scores = Array.from({ length: n }, (_, h) => e.scores[h] ?? null); e.scoreTs = Array.from({ length: n }, (_, h) => e.scoreTs[h] ?? null); }
      }
      return true;
    },
  },
  round_entries: {
    collect(keys) {
      const rows = [];
      for (const r of S.state.rounds) for (const e of [...r.entries, ...r.removed]) {
        if (!keys.has(`${r.id}|${e.playerId}`)) continue;
        rows.push({ round_id: r.id, player_id: e.playerId, name: e.name, hi: e.hi, tee: e.tee, gender: e.gender || "m", course_handicap: e.courseHandicap ?? null,
          grp: e.group || 1, from_hole: e.fromHole || 1, penalties: e.penalties || [], deleted: !!e.deleted, updated_at: e.updated_at, device_id: dev() });
      }
      return rows;
    },
    apply(row) {
      const r = roundFor(row.round_id);
      const { e, i, j } = findEntry(r, row.player_id);
      if (e && !newer(row, e)) return false;
      const n = holesOf(S.courseBy(r.course));
      const rec = { playerId: row.player_id, name: row.name, hi: row.hi === null ? null : Number(row.hi), tee: row.tee, gender: row.gender || "m",
        courseHandicap: row.course_handicap, group: row.grp || 1, fromHole: row.from_hole || 1, penalties: row.penalties || [],
        deleted: !!row.deleted, updated_at: iso(row.updated_at), dev: row.device_id, scores: e ? e.scores : new Array(n).fill(null), scoreTs: e ? e.scoreTs : new Array(n).fill(null) };
      if (i >= 0) r.entries.splice(i, 1);
      if (j >= 0) r.removed.splice(j, 1);
      (rec.deleted ? r.removed : r.entries).push(rec);
      return true;
    },
  },
  scores: {
    collect(keys) {
      const rows = [];
      for (const r of S.state.rounds) for (const e of [...r.entries, ...r.removed]) e.scores.forEach((v, h) => {
        const k = `${r.id}|${e.playerId}|${h}`;
        if (keys.has(k)) rows.push({ round_id: r.id, player_id: e.playerId, hole: h, strokes: v, updated_at: e.scoreTs[h] || e.updated_at, device_id: dev() });
      });
      return rows;
    },
    apply(row) {
      const r = S.state.rounds.find(x => x.id === row.round_id);
      const e = r ? findEntry(r, row.player_id).e : null;
      if (!e) { S.state.orphanScores.push(row); return false; }  // entry not here yet; retried after every pull
      if (row.hole >= e.scores.length) return false;
      if (ts(e.scoreTs[row.hole]) >= ts(row.updated_at)) return false;
      e.scores[row.hole] = row.strokes;
      e.scoreTs[row.hole] = iso(row.updated_at);
      return true;
    },
  },
  leagues: {
    collect: keys => S.state.leagues.filter(g => keys.has(g.id)).map(g => ({ id: g.id, name: g.name, best_n: g.bestN || 0, created_by: g.createdBy || null,
      created: g.created || null, deleted: !!g.deleted, updated_at: g.updated_at, device_id: dev() })),
    apply: r => lww(S.state.leagues, g => g.id === r.id, { id: r.id, name: r.name, bestN: r.best_n || 0, createdBy: r.created_by, created: r.created, deleted: !!r.deleted, updated_at: iso(r.updated_at), dev: r.device_id }, r),
  },
  league_rounds: {
    collect: keys => S.state.leagueRounds.filter(x => keys.has(`${x.league_id}|${x.round_id}`)).map(x => ({ league_id: x.league_id, round_id: x.round_id,
      deleted: !!x.deleted, updated_at: x.updated_at, device_id: dev() })),
    apply: r => lww(S.state.leagueRounds, x => x.league_id === r.league_id && x.round_id === r.round_id, { league_id: r.league_id, round_id: r.round_id, deleted: !!r.deleted, updated_at: iso(r.updated_at), dev: r.device_id }, r),
  },
  player_course_handicap: {
    collect: keys => S.state.pch.filter(x => keys.has(`${x.player_id}|${x.course}|${x.tee}`)).map(x => ({ player_id: x.player_id, course: x.course, tee: x.tee, ch: x.ch ?? 0,
      deleted: !!x.deleted, updated_at: x.updated_at, device_id: dev() })),
    apply: r => lww(S.state.pch, x => x.player_id === r.player_id && x.course === r.course && x.tee === r.tee, { player_id: r.player_id, course: r.course, tee: r.tee, ch: r.ch, deleted: !!r.deleted, updated_at: iso(r.updated_at), dev: r.device_id }, r),
  },
};
const CONFLICT = { league_rounds: "league_id,round_id", round_entries: "round_id,player_id", scores: "round_id,player_id,hole", courses: "slug", player_course_handicap: "player_id,course,tee" };

function lww(list, match, rec, row) {
  const i = list.findIndex(match);
  if (i >= 0 && !newer(row, list[i])) return false;
  if (i >= 0) list[i] = rec; else list.push(rec);
  return true;
}

/** Rows held back during a pull because I had an unpushed change for them: applied once that change has gone out. */
function drainHeld() {
  const still = S.dirty();
  let changed = false;
  const held = S.state.held.splice(0);
  for (const { table, row } of held) {
    if ((still[table] || {})[keyOf(table, row)]) { S.state.held.push({ table, row }); continue; }
    if (TABLES[table].apply(row)) changed = true;
  }
  S.afterPull();
  return changed;
}

function keyOf(table, row) {
  if (table === "league_rounds") return `${row.league_id}|${row.round_id}`;
  if (table === "round_entries") return `${row.round_id}|${row.player_id}`;
  if (table === "scores") return `${row.round_id}|${row.player_id}|${row.hole}`;
  if (table === "courses") return row.slug;
  if (table === "player_course_handicap") return `${row.player_id}|${row.course}|${row.tee}`;
  return row.id;
}

const CFG_KEY = "hagolf-sync-config", CURSOR_KEY = "hagolf-sync-cursors";

function cursors() { try { return JSON.parse(localStorage.getItem(CURSOR_KEY)) || {}; } catch (e) { return {}; } }
export const sync = { status: "off", error: null, lastPull: null, config: null, pushing: false, pulling: false, timer: null };
window.__hagolfSync = sync;  // read by the tests
let listeners = [];

export function onChange(fn) { listeners.push(fn); }
const emit = detail => listeners.forEach(fn => fn(detail));

/** Build-time default from app/sync.json (DATA.sync), overridable on the phone. */
export function config() {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(CFG_KEY)); } catch (e) { local = null; }
  const c = local && local.url ? local : (DATA.sync && DATA.sync.url ? DATA.sync : null);
  return c && c.url && c.anonKey ? { url: c.url.replace(/\/+$/, ""), anonKey: c.anonKey, label: c.label || (DATA.sync && DATA.sync.label) || "" } : null;
}

export function isDefault() {
  const c = config();
  return !!(c && DATA.sync && c.url === DATA.sync.url && c.anonKey === DATA.sync.anonKey);
}

export function setConfig(c) {
  if (c && c.url) localStorage.setItem(CFG_KEY, JSON.stringify(c));
  else localStorage.removeItem(CFG_KEY);
  localStorage.removeItem(CURSOR_KEY);
  start();
}

export function enabled() { return !!sync.config; }

function headers(extra = {}) {
  return { apikey: sync.config.anonKey, Authorization: `Bearer ${sync.config.anonKey}`, "Content-Type": "application/json", ...extra };
}

async function rest(path, init = {}) {
  const res = await fetch(`${sync.config.url}/rest/v1/${path}`, { ...init, headers: headers(init.headers) });
  if (!res.ok) { const e = new Error(`${init.method || "GET"} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`); e.status = res.status; throw e; }
  const text = await res.text();
  return text.trim() ? JSON.parse(text) : null;
}

let pushPromise = null, pullPromise = null;

/** Pushes every queued change, table by table, as upserts; a key changed again during the request stays queued. */
export function push() {
  if (!sync.config) return Promise.resolve();
  if (pushPromise) return pushPromise;  // a caller during a push waits for it instead of being dropped
  pushPromise = doPush().finally(() => { pushPromise = null; });
  return pushPromise;
}

async function doPush() {
  const dirty = S.dirty();
  if (!Object.values(dirty).some(m => Object.keys(m).length)) return;
  sync.pushing = true;
  sync.status = "syncing";
  emit({ status: true });
  try {
    let refused = null;
    for (const table of Object.keys(TABLES)) {
      const all = Object.keys(dirty[table] || {});
      for (let i = 0; i < all.length; i += BATCH) {  // a season of offline scoring goes out in slices the server can take in one transaction
        const sent = Object.fromEntries(all.slice(i, i + BATCH).map(k => [k, dirty[table][k]]));
        const rows = TABLES[table].collect(new Set(Object.keys(sent)));
        try {
          const out = rows.length ? await rest(`${table}?on_conflict=${CONFLICT[table] || "id"}`, { method: "POST", body: JSON.stringify(rows),
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" } }) : null;
          if (out && Array.isArray(out.rejected) && out.rejected.length) {  // the Worker took the rest and named the rows it will never take
            const bad = {};
            for (const x of out.rejected) if (x.key in sent) { bad[x.key] = sent[x.key]; delete sent[x.key]; }
            S.quarantine(table, bad, out.rejected[0].message);
            refused = out.rejected[0].message;
          }
          S.clearDirty(table, sent);
        } catch (e) {
          if (e.status && e.status >= 400 && e.status < 500) { S.quarantine(table, sent, e.message); refused = e.message; continue; }  // the server will never take these: park them, keep going
          throw e;
        }
      }
    }
    const changed = drainHeld();
    sync.status = "idle";
    sync.error = refused ? `some changes were refused by the server (${refused.slice(0, 80)}); see Settings` : null;
    sync.pushing = false;
    emit({ status: true, changed });
    return;
  } catch (e) {
    sync.status = "error";
    sync.error = e.message;
    console.warn("sync push", e);
  } finally {
    sync.pushing = false;
    emit({ status: true });
  }
}

const PAGE = 1000, BATCH = 200;

/**
 * Pulls rows the server accepted since the last pull (by the server's clock, so a phone with a slow clock cannot
 * slip a change past everyone's cursor) and applies them: newest updated_at wins, a record with my own unpushed
 * change is left alone until that change has gone out.
 */
export function pull() {
  if (!sync.config) return Promise.resolve(false);
  if (pullPromise) return pullPromise;
  pullPromise = doPull().finally(() => { pullPromise = null; });
  return pullPromise;
}

async function doPull() {
  sync.pulling = true;
  sync.status = "syncing";
  emit({ status: true });
  const cur = cursors();  // one cursor per table: a row landing in an already-read table during the pull is not skipped
  let changed = drainHeld();
  try {
    for (const [table, t] of Object.entries(TABLES)) {
      let since = cur[table] || "1970-01-01T00:00:00Z", page;
      do {
        page = await rest(`${table}?select=*&server_ts=gt.${encodeURIComponent(since)}&order=server_ts.asc&limit=${PAGE}`);
        const dirtyKeys = S.dirty()[table] || {};
        for (const row of page) {
          since = row.server_ts;
          if (dirtyKeys[keyOf(table, row)]) { S.state.held.push({ table, row }); changed = true; continue; }  // mine is unpushed: decide after the push
          if (t.apply(row)) changed = true;
        }
        cur[table] = since;
        localStorage.setItem(CURSOR_KEY, JSON.stringify(cur));
      } while (page.length === PAGE);
    }
    const orphans = S.state.orphanScores.splice(0);  // scores that arrived before their entry
    for (const row of orphans) { if (TABLES.scores.apply(row)) changed = true; }
    if (changed || orphans.length || S.state.orphanScores.length) S.afterPull();
    sync.status = "idle";
    sync.error = null;
    sync.lastPull = new Date().toISOString();
  } catch (e) {
    sync.status = "error";
    sync.error = e.message;
    console.warn("sync pull", e);
  } finally {
    sync.pulling = false;
  }
  emit({ status: true, changed });
  return changed;
}

let pushTimer = null;
/** Called by the store after every save: pushes a moment later so a burst of taps is one request. */
export function schedulePush() {
  if (!sync.config || pushTimer || !S.hasDirty()) return;
  pushTimer = setTimeout(() => { pushTimer = null; push(); }, 800);
}

export async function pushAndPull() {
  await push();
  return pull();
}

export function start() {
  sync.config = config();
  clearInterval(sync.timer);
  if (!sync.config) { sync.status = "off"; emit({ status: true }); return; }
  sync.status = "idle";
  pushAndPull();
  sync.timer = setInterval(() => { if (document.visibilityState === "visible") pushAndPull(); }, 20000);
}

/** Tries connection settings once; throws with the server's answer when they do not work. */
export async function test(c) {
  const res = await fetch(`${c.url.replace(/\/+$/, "")}/rest/v1/leagues?select=id&limit=1`,
    { headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}` } });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).length;
}

/** The join link an organiser hands out: everything a phone needs to connect, in the URL fragment. */
export function joinLink(base, organiser = false) {
  const c = config();
  if (!c) return null;
  const json = JSON.stringify({ url: c.url, anonKey: c.anonKey, label: c.label, organiser });
  const payload = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base}#join/${payload}`;
}

export function parseJoin(payload) {
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((payload.length + 3) % 4);
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pushAndPull(); });
window.addEventListener("online", () => pushAndPull());
