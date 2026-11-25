// A second copy of everything the phone holds, in IndexedDB.
//
// localStorage stays the working copy: every screen reads it synchronously and the app was built on that. But
// it is a few megabytes of a storage class browsers evict under pressure, which is not where a paid archive
// should live. So every save mirrors it here, and a cold start that finds localStorage empty puts it back
// before the app loads. Nothing else changes; if IndexedDB is missing or blocked, the app is exactly as it was.
//
// The backend has the rounds too, and a signed-in phone re-pulls its own. This is for the round scored an hour
// ago with no signal, and for the phone that never signs in.

const DB = "hagolf", STORE = "kv";
const KEYS = ["hagolf-v2", "hagolf-dirty", "hagolf-sync-cursors", "hagolf-sync-config", "hagolf-auth"];

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no IndexedDB"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("blocked"));
  });
}

const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

let timer = null;
/** Mirrors soon: a burst of taps on the scoring screen is one write. */
export function mirror() {
  clearTimeout(timer);
  timer = setTimeout(mirrorNow, 500);
}

export async function mirrorNow() {
  timer = null;
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite"), s = tx.objectStore(STORE);
    for (const k of KEYS) {
      const v = localStorage.getItem(k);
      if (v === null) s.delete(k); else s.put(v, k);
    }
    await done(tx);
    db.close();
    return true;
  } catch (e) { return false; }   // no IndexedDB, or it is blocked: localStorage still has everything
}

/** Puts the copy back when localStorage has been emptied. Returns how many keys came back. */
export async function restore() {
  if (localStorage.getItem("hagolf-v2")) return 0;
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readonly"), s = tx.objectStore(STORE);
    const got = await Promise.all(KEYS.map(k => new Promise(res => { const r = s.get(k); r.onsuccess = () => res([k, r.result]); r.onerror = () => res([k, undefined]); })));
    db.close();
    let n = 0;
    for (const [k, v] of got) if (typeof v === "string") { localStorage.setItem(k, v); n++; }
    return n;
  } catch (e) { return 0; }
}

/** Asks the browser not to evict this origin's storage under pressure. Granted or not, the app runs the same. */
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* not offered */ }
  return false;
}
