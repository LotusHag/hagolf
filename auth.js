// Signing in, on the phone. One account is the person holding it; the people they play with never need one.
//
// The session is an access token that lasts minutes and a refresh token that lasts months, both kept in
// browser storage. That is the right place for now: the app is served from one origin and the Worker from
// another, so an httpOnly cookie cannot carry the refresh token yet; the Worker sets one anyway, and when both
// move to one domain the cookie takes over and this file loses its refresh token without anything else changing.
//
// Offline is the ordinary case, not the exception. A token that expires on the ninth tee with no signal must
// not lose a score: sync.js keeps the queue, asks here for a refresh when it next sees a 401, and only when the
// refresh itself is refused does the phone consider itself signed out -- keeping every round it holds.
import * as S from "./store.js";
import { mirror } from "./idb.js";

const KEY = "hagolf-auth";
const GRACE = 30000;   // refresh this many ms before the access token actually expires

export const session = { account: null, access: null, refresh: null, expiresAt: 0 };
let listeners = [];
export function onChange(fn) { listeners.push(fn); }
const emit = () => listeners.forEach(fn => fn(session));

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.refresh) Object.assign(session, s);
  } catch (e) { /* nothing saved */ }
  if (session.account) S.state.settings.accountId = session.account.id;
}
load();

function save() {
  if (session.refresh) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
  S.state.settings.accountId = session.account ? session.account.id : null;
  S.save();
  emit();
}

/** The Worker's origin, taken from the sync configuration so a self-hosted backend signs in against itself. */
let origin = null;
export function setOrigin(url) { origin = url ? url.replace(/\/+$/, "") : null; }

async function call(path, body, extra = {}, method = body === undefined ? "GET" : "POST") {
  if (!origin) throw new Error("This phone is not connected to a backend.");
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: { "content-type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { error: text.slice(0, 200) }; }
  if (!res.ok) { const e = new Error((data && (data.error || data.message)) || `${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

function take(data) {
  session.account = data.account;
  session.access = data.access;
  session.refresh = data.refresh;
  session.expiresAt = Date.now() + (data.expiresIn || 900) * 1000;
  save();
}

export const signedIn = () => !!session.refresh;
export const account = () => session.account;

/** Asks for a sign-in link. The answer is the same whether or not the address has an account. */
export async function request(email) {
  return call("/auth/request", { email, deviceId: S.state.settings.deviceId });
}

/** The link was tapped: exchange its token for a session. */
export async function finish(token) {
  take(await call("/auth/callback", { token, deviceId: S.state.settings.deviceId }));
  return session.account;
}

/**
 * The code from the same email, typed in. This is the path that works from an app on the home screen: on an
 * iPhone the link opens in Safari, which does not share storage with the installed app, so a session made by
 * the link would land in the wrong place.
 */
export async function finishCode(email, code) {
  take(await call("/auth/callback", { email, code: String(code).replace(/\D/g, ""), deviceId: S.state.settings.deviceId }));
  return session.account;
}

let refreshing = null;
/**
 * A new access token, from the refresh token. One in flight at a time, so a burst of 401s from a push of many
 * tables does not spend the refresh token twice -- the second use would look like a replay and end the session.
 */
export function refresh() {
  if (!session.refresh) return Promise.reject(Object.assign(new Error("not signed in"), { status: 401 }));
  if (refreshing) return refreshing;
  refreshing = call("/auth/refresh", { refresh: session.refresh })
    .then(data => { take(data); return session.access; })
    .catch(e => {
      // Only a refusal means the session is over. A network failure means we are offline, and the session is
      // exactly as good as it was a moment ago.
      if (e.status === 401) forget();
      throw e;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** A bearer token good for at least a little while, refreshing first if it is about to run out. */
export async function bearer() {
  if (!session.refresh) return null;
  if (!session.access || Date.now() > session.expiresAt - GRACE) {
    try { await refresh(); } catch (e) { if (!session.refresh) return null; /* offline: use what we have */ }
  }
  return session.access;
}

/** Drops the session on this phone without asking the server; everything the phone holds stays. */
export function forget() {
  session.account = null; session.access = null; session.refresh = null; session.expiresAt = 0;
  save();
}

export async function signOut(everywhere = false) {
  const refreshToken = session.refresh;
  forget();
  if (refreshToken) { try { await call("/auth/signout", { refresh: refreshToken, everywhere }); } catch (e) { /* the server will expire it */ } }
}

/** Updates my own name, index or rating on the account, which is what a linked contact prefills from. */
export async function update(fields) {
  const token = await bearer();
  const data = await fetch(`${origin}/auth/me`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(fields) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d; });
  session.account = data.account;
  save();
  return session.account;
}

/** A signed-in call to the backend: leagues, invites, claims, visibility. Throws with the server's words. */
export async function api(path, body, method) {
  const token = await bearer();
  if (!token) throw Object.assign(new Error("Sign in first."), { status: 401 });
  return call(path, body, { authorization: `Bearer ${token}` }, method);
}

// ---------------------------------------------------------------- what this backend offers
let cfg = null;
/** Which ways in this backend has, fetched once: the Google client id, the push key, whether the shop is on. */
export async function config() {
  if (cfg) return cfg;
  try { cfg = await call("/auth/config"); } catch (e) { cfg = { google: null, push: null, email: true }; }
  return cfg;
}

/**
 * Signs in with a Google ID token. The token is verified by the Worker against Google's published keys -- one
 * that is merely decoded is one anybody can forge -- and the account is keyed on the email address, so the
 * same person signing in by Google or by emailed code lands on the same account.
 */
export async function signInWithGoogle(credential) {
  take(await call("/auth/google", { credential, deviceId: S.state.settings.deviceId }));
  return session.account;
}

// ---------------------------------------------------------------- passkeys
// The phone's own lock as the second way in, after the first email. The options and the answer travel as
// base64url, since that is what JSON carries and what the Worker reads.
const ab64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unab64 = s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));

export const passkeysAvailable = () => typeof PublicKeyCredential !== "undefined" && !!navigator.credentials;

/** Registers this phone's passkey against the signed-in account. */
export async function registerPasskey(label) {
  const o = await api("/auth/passkey/register/options", {});
  const publicKey = { ...o, challenge: unab64(o.challenge), user: { ...o.user, id: unab64(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map(c => ({ ...c, id: unab64(c.id) })) };
  const cred = await navigator.credentials.create({ publicKey });
  return api("/auth/passkey/register", { id: cred.id, label, response: {
    clientDataJSON: ab64(cred.response.clientDataJSON), attestationObject: ab64(cred.response.attestationObject) } });
}

/** Signs in with a passkey. With an address the authenticator is told which keys to offer; without, it offers its own. */
export async function signInWithPasskey(email = null) {
  const o = await call("/auth/passkey/login/options", { email });
  const publicKey = { challenge: unab64(o.challenge), rpId: o.rpId, userVerification: o.userVerification, timeout: o.timeout,
    allowCredentials: (o.allowCredentials || []).map(c => ({ ...c, id: unab64(c.id) })) };
  const cred = await navigator.credentials.get({ publicKey });
  take(await call("/auth/passkey/login", { id: cred.id, deviceId: S.state.settings.deviceId, response: {
    clientDataJSON: ab64(cred.response.clientDataJSON), authenticatorData: ab64(cred.response.authenticatorData),
    signature: ab64(cred.response.signature), userHandle: cred.response.userHandle ? ab64(cred.response.userHandle) : null } }));
  return session.account;
}

/** Re-reads the account from the server, when something may have changed it elsewhere. */
export async function whoami() {
  const token = await bearer();
  if (!token) return null;
  const data = await call("/auth/me", undefined, { authorization: `Bearer ${token}` });
  session.account = data.account;
  save();
  return session.account;
}
