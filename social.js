// Friends, on the phone: a cached copy of what the backend says, refreshed when asked, so the People tab draws
// at once and offline. Not a synced table: friendship is state the server decides, with actions, like
// membership, and there is no newest-wins to thread through sync.js.
import * as A from "./auth.js";

const KEY = "hagolf-friends";
const EMPTY = { friends: [], incoming: [], outgoing: [], blocked: [] };

export function held() {
  try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { return { ...EMPTY }; }
}
const keep = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* full */ } };

let listeners = [];
export function onChange(fn) { listeners.push(fn); }
const emit = () => listeners.forEach(fn => fn());

/** Asks the backend. Quiet about failure: the cached copy stands. */
export async function refresh() {
  if (!A.signedIn()) { try { localStorage.removeItem(LOOKS); } catch (e) { /* blocked */ } if (held().friends.length) { keep(EMPTY); emit(); } return held(); }
  try {
    const r = await A.api("/friends");
    const next = { ...EMPTY, ...r };
    if (JSON.stringify(next) !== JSON.stringify(held())) { keep(next); emit(); }
    return next;
  } catch (e) { return held(); }
}

export const friendById = id => held().friends.find(f => f.id === id) || null;
/** The golfer an account has made, where this phone knows it: mine, a friend's, or one asking or asked. */
export function lookOf(id) {
  const me = A.account();
  if (me && me.id === id) return me.look || null;
  const h = held();
  return ([...h.friends, ...h.incoming, ...h.outgoing].find(p => p.id === id) || {}).look || memberLooks()[id] || null;
}

// society members' golfers, as the members list last gave them, so a board draws them at once and offline
const LOOKS = "hagolf-member-looks";
function memberLooks() {
  try { return JSON.parse(localStorage.getItem(LOOKS)) || {}; } catch (e) { return {}; }
}
/** Keeps the golfers a members list carries. True when any of them changed. */
function keepLooks(members) {
  const had = memberLooks(), next = { ...had };
  for (const m of members) if (m.id) { if (m.look) next[m.id] = m.look; else delete next[m.id]; }
  if (JSON.stringify(next) === JSON.stringify(had)) return false;
  try { localStorage.setItem(LOOKS, JSON.stringify(next)); } catch (e) { /* full */ }
  return true;
}

export const search = q => A.api(`/friends/search?q=${encodeURIComponent(q)}`);
export const game = id => A.api(`/friends/${encodeURIComponent(id)}/game`);
export async function linkFriend(handle) {
  const r = await A.api("/friends/link", { handle });
  await refresh();
  return r;
}

/** Every action re-reads the list afterwards, so the screen shows what the server holds and not what was hoped. */
async function act(what, accountId) {
  const r = await A.api(`/friends/${what}`, { accountId });
  await refresh();
  return r;
}
export const request = id => act("request", id);
export const accept = id => act("accept", id);
export const decline = id => act("decline", id);
export const remove = id => act("remove", id);
export const block = id => act("block", id);
export const unblock = id => act("unblock", id);

// ---------------------------------------------------------------- a name on my cards, and its golfer
export const contactLink = contactId => A.api(`/contact/${encodeURIComponent(contactId)}/link`, {});
export const contactUnlink = contactId => A.api(`/contact/${encodeURIComponent(contactId)}/unlink`, {});
export async function openGolfer(token) {
  const r = await A.api("/golfer/open", { token });
  await refresh();
  return r;
}

// ---------------------------------------------------------------- cards
export const shareRound = (roundId, accountIds) => A.api(`/round/${encodeURIComponent(roundId)}/share`, { accountIds });
export const unshareRound = (roundId, accountId) => A.api(`/round/${encodeURIComponent(roundId)}/unshare`, { accountId });
export const cardLink = (roundId, reset = false) => A.api(`/round/${encodeURIComponent(roundId)}/link`, { reset });
export const cardUnlink = roundId => A.api(`/round/${encodeURIComponent(roundId)}/unlink`, {});
export const cardShares = roundId => A.api(`/round/${encodeURIComponent(roundId)}/shares`, {});
export const unclaimSeat = (roundId, seat) => A.api(`/round/${encodeURIComponent(roundId)}/unclaim`, { seat });

// ---------------------------------------------------------------- leagues
export const inviteFriend = (leagueId, accountId) => A.api(`/league/${encodeURIComponent(leagueId)}/invite`, { forAccount: accountId });
export const inviteLink = (leagueId, reusable = false, forPlayer = null) => A.api(`/league/${encodeURIComponent(leagueId)}/invite`, { reusable, forPlayer });
export const invitesOf = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/invites`);
export const revokeInvite = (leagueId, id) => A.api(`/league/${encodeURIComponent(leagueId)}/revoke`, { id });
export const joinLeague = token => A.api("/league/join", { token });
export const declineInvite = token => A.api("/league/decline", { token });
export const leaveLeague = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/leave`, {});
export async function membersOf(leagueId) {
  const r = await A.api(`/league/${encodeURIComponent(leagueId)}/members`);
  r.looksChanged = keepLooks(r.members || []);
  return r;
}
export const candidatesOf = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/candidates`);
export const claim = (leagueId, name) => A.api(`/league/${encodeURIComponent(leagueId)}/claim`, { name });
export const unclaim = (leagueId, accountId = null) => A.api(`/league/${encodeURIComponent(leagueId)}/unclaim`, accountId ? { accountId } : {});
export const setVisibility = (leagueId, body) => A.api(`/league/${encodeURIComponent(leagueId)}/visibility`, body);

// ---------------------------------------------------------------- what a link says before anybody signs in
async function open(path) {
  const origin = A.origin();
  if (!origin) throw new Error("This phone is not connected to a backend.");
  const res = await fetch(`${origin}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `${res.status}`), { status: res.status });
  return data;
}
export const previewInvite = token => open(`/public/invite/${encodeURIComponent(token)}`);
export const previewHandle = handle => open(`/public/handle/${encodeURIComponent(handle)}`);
export const previewGolfer = token => open(`/public/golfer/${encodeURIComponent(token)}`);
export const publicCard = token => open(`/public/card/${encodeURIComponent(token)}`);
export const publicBoard = token => open(`/public/league/${encodeURIComponent(token)}`);
