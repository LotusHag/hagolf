// Sync with a Supabase project over its REST API (PostgREST), no SDK. Local first: the phone keeps working
// offline, every change is queued, pushed when there is a connection, and other phones' changes are pulled.
// Rows carry updated_at from the phone that wrote them; the newest write wins, on the server (trigger) and here.
import { DATA } from "./data.js";
import * as S from "./store.js";

const TABLES = {
  players: {
    list: () => S.state.players,
    key: r => r.id,
    toRow: p => ({ id: p.id, name: p.name, hi: p.hi, gender: p.gender || "m", hi_updated: p.hiUpdated || null, created: p.created || null,
      deleted: !!p.deleted, updated_at: p.updated_at }),
    fromRow: r => ({ id: r.id, name: r.name, hi: r.hi === null ? null : Number(r.hi), gender: r.gender || "m", hiUpdated: iso(r.hi_updated),
      created: r.created, deleted: !!r.deleted, updated_at: iso(r.updated_at) }),
  },
  rounds: {
    list: () => S.state.rounds,
    key: r => r.id,
    toRow: r => ({ id: r.id, name: r.name, date: r.date || null, course: r.course, default_tee: r.defaultTee, allowance: r.allowance || 100,
      status: r.status, hole: r.hole || 0, entries: r.entries, removed: r.removed || [], created: r.created || null, deleted: !!r.deleted, updated_at: r.updated_at }),
    fromRow: r => ({ id: r.id, name: r.name, date: r.date, course: r.course, defaultTee: r.default_tee, allowance: r.allowance || 100,
      status: r.status, hole: r.hole || 0, entries: r.entries || [], removed: r.removed || [], created: iso(r.created), deleted: !!r.deleted, updated_at: iso(r.updated_at) }),
    merge: (mine, theirs) => S.mergeRound(mine, theirs),
  },
  leagues: {
    list: () => S.state.leagues,
    key: r => r.id,
    toRow: g => ({ id: g.id, name: g.name, best_n: g.bestN || 0, created_by: g.createdBy || null, created: g.created || null,
      deleted: !!g.deleted, updated_at: g.updated_at }),
    fromRow: r => ({ id: r.id, name: r.name, bestN: r.best_n || 0, createdBy: r.created_by, created: r.created, deleted: !!r.deleted,
      updated_at: iso(r.updated_at) }),
  },
  league_rounds: {
    list: () => S.state.leagueRounds,
    key: r => `${r.league_id}|${r.round_id}`,
    toRow: x => ({ league_id: x.league_id, round_id: x.round_id, deleted: !!x.deleted, updated_at: x.updated_at }),
    fromRow: r => ({ league_id: r.league_id, round_id: r.round_id, deleted: !!r.deleted, updated_at: iso(r.updated_at) }),
    conflict: "league_id,round_id",
  },
};

const CFG_KEY = "hagolf-sync-config", CURSOR_KEY = "hagolf-sync-cursor";
const ts = s => s ? new Date(s).getTime() : 0;  // Postgres returns +00:00, phones write Z: compare as numbers
const iso = s => s ? new Date(s).toISOString() : s;
export const sync = { status: "off", error: null, lastPull: null, config: null, pushing: false, timer: null };
window.__hagolfSync = sync;  // read by the tests
let listeners = [];

export function onChange(fn) { listeners.push(fn); }
const emit = detail => listeners.forEach(fn => fn(detail));

/** Build-time default from app/sync.json (DATA.sync), overridable on the phone. */
export function config() {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(CFG_KEY)); } catch (e) { local = null; }
  const c = local && local.url ? local : (DATA.sync && DATA.sync.url ? DATA.sync : null);
  return c && c.url && c.anonKey ? { url: c.url.replace(/\/+$/, ""), anonKey: c.anonKey } : null;
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
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 || res.headers.get("content-length") === "0" ? null : res.json();
}

/** Pushes every queued change, table by table, as upserts. */
export async function push() {
  if (!sync.config || sync.pushing) return;
  const dirty = S.dirty();
  if (!Object.values(dirty).some(ids => ids.length)) return;
  sync.pushing = true;
  sync.status = "syncing";
  emit({ status: true });
  try {
    for (const [table, ids] of Object.entries(dirty)) {
      if (!ids.length) continue;
      const t = TABLES[table];
      const rows = t.list().filter(r => ids.includes(t.key(r))).map(t.toRow);
      if (!rows.length) { S.clearDirty(table, ids); continue; }
      await rest(`${table}?on_conflict=${t.conflict || "id"}`, { method: "POST", body: JSON.stringify(rows),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
      S.clearDirty(table, ids);
    }
    sync.status = "idle";
    sync.error = null;
  } catch (e) {
    sync.status = "error";
    sync.error = e.message;
    console.warn("sync push", e);
  } finally {
    sync.pushing = false;
    emit({ status: true });
  }
}

const PAGE = 1000;

/**
 * Pulls rows the server has accepted since the last pull (by the server's own clock, so a phone with a slow clock
 * cannot slip a change past everyone's cursor) and merges them: newest updated_at wins, a record with my own
 * unpushed change is left alone until that change has gone out, and rounds merge per player.
 */
export async function pull() {
  if (!sync.config) return;
  sync.status = "syncing";
  emit({ status: true });
  const cursor = localStorage.getItem(CURSOR_KEY) || "1970-01-01T00:00:00Z";
  let changed = false, maxTs = cursor;
  try {
    for (const [table, t] of Object.entries(TABLES)) {
      let since = cursor, page;
      do {
        page = await rest(`${table}?select=*&server_ts=gt.${encodeURIComponent(since)}&order=server_ts.asc&limit=${PAGE}`);
        const dirtyIds = new Set(S.dirty()[table] || []);
        for (const row of page) {
          const rec = t.fromRow(row);
          const k = t.key(rec);
          since = row.server_ts;
          if (ts(row.server_ts) > ts(maxTs)) maxTs = row.server_ts;
          const list = t.list();
          const i = list.findIndex(x => t.key(x) === k);
          const mine = i >= 0 ? list[i] : null;
          if (mine && t.merge) {
            const merged = t.merge(mine, rec);
            if (JSON.stringify(merged) === JSON.stringify(mine)) continue;
            list[i] = merged;
            if (JSON.stringify(merged) !== JSON.stringify(rec)) S.touch(table, merged);  // my part of the merge still has to go out
            changed = true;
            continue;
          }
          if (dirtyIds.has(k)) continue;  // my unpushed change wins for now; the server's rule decides after the push
          if (mine && ts(mine.updated_at) >= ts(rec.updated_at)) continue;  // already have this or newer
          if (i >= 0) list[i] = rec; else list.push(rec);
          changed = true;
        }
      } while (page.length === PAGE);
    }
    if (changed) S.afterPull();
    localStorage.setItem(CURSOR_KEY, maxTs);
    sync.status = "idle";
    sync.error = null;
    sync.lastPull = new Date().toISOString();
  } catch (e) {
    sync.status = "error";
    sync.error = e.message;
    console.warn("sync pull", e);
  }
  emit({ status: true, changed });
  return changed;
}

let pushTimer = null;
/** Called by the store after every save: pushes a moment later so a burst of taps is one request. */
export function schedulePush() {
  if (!sync.config || pushTimer) return;
  if (!Object.values(S.dirty()).some(ids => ids.length)) return;
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

/** Tries the connection settings once and returns the number of leagues seen, or throws. */
export async function test(c) {
  const res = await fetch(`${c.url.replace(/\/+$/, "")}/rest/v1/leagues?select=id&limit=1`,
    { headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}` } });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).length;
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pushAndPull(); });
window.addEventListener("online", () => pushAndPull());
