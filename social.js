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
  if (!A.signedIn()) { if (held().friends.length) { keep(EMPTY); emit(); } return held(); }
  try {
    const r = await A.api("/friends");
    const next = { ...EMPTY, ...r };
    if (JSON.stringify(next) !== JSON.stringify(held())) { keep(next); emit(); }
    return next;
  } catch (e) { return held(); }
}

export const isFriend = id => held().friends.some(f => f.id === id);
export const friendById = id => held().friends.find(f => f.id === id) || null;

export const search = q => A.api(`/friends/search?q=${encodeURIComponent(q)}`);
export const resolve = handle => A.api(`/friends/resolve?handle=${encodeURIComponent(handle)}`);

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

// ---------------------------------------------------------------- cards
export const shareRound = (roundId, accountIds) => A.api(`/round/${encodeURIComponent(roundId)}/share`, { accountIds });
export const unshareRound = (roundId, accountId) => A.api(`/round/${encodeURIComponent(roundId)}/unshare`, { accountId });
export const cardLink = (roundId, reset = false) => A.api(`/round/${encodeURIComponent(roundId)}/link`, { reset });
export const cardUnlink = roundId => A.api(`/round/${encodeURIComponent(roundId)}/unlink`, {});
export const cardShares = roundId => A.api(`/round/${encodeURIComponent(roundId)}/shares`, {});

// ---------------------------------------------------------------- leagues
export const inviteFriend = (leagueId, accountId) => A.api(`/league/${encodeURIComponent(leagueId)}/invite`, { forAccount: accountId });
export const inviteLink = (leagueId, reusable = false) => A.api(`/league/${encodeURIComponent(leagueId)}/invite`, { reusable });
export const invitesOf = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/invites`);
export const revokeInvite = (leagueId, id) => A.api(`/league/${encodeURIComponent(leagueId)}/revoke`, { id });
export const joinLeague = token => A.api("/league/join", { token });
export const declineInvite = token => A.api("/league/decline", { token });
export const leaveLeague = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/leave`, {});
export const membersOf = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/members`);
export const candidatesOf = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/candidates`);
export const claim = (leagueId, name) => A.api(`/league/${encodeURIComponent(leagueId)}/claim`, { name });
export const confirmClaim = (leagueId, accountId) => A.api(`/league/${encodeURIComponent(leagueId)}/confirm`, { accountId });
export const pendingClaims = leagueId => A.api(`/league/${encodeURIComponent(leagueId)}/pending`);
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
export const publicCard = token => open(`/public/card/${encodeURIComponent(token)}`);
export const publicBoard = token => open(`/public/league/${encodeURIComponent(token)}`);
