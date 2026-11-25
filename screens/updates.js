// The inbox. Every kind of news is one line with the thing it is about, and the ones that ask for a tap carry
// their buttons. Read rows stay, greyed, so the week's history is there to scroll.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as N from "../notify.js";
import * as F from "../social.js";
import * as Y from "../sync.js";
import { page, bind, esc, go, toast, firstName, fmtDate, ago, ordinal, courseBy, courseTitle, ICONS, emptyState, resumeHash } from "../ui.js";

const ICON_OF = { round_added: "card", round_shared: "card", card_public: "link", league_invite: "mail", league_joined: "users", league_round: "trophy",
  claim_made: "shield", friend_request: "friend", friend_accepted: "people", contact_linked: "people", friends_stats: "chart", round_seated: "golf", event_draw: "flag" };

/** Where tapping a line goes. */
function hrefOf(n) {
  if (["round_added", "round_shared", "card_public"].includes(n.kind)) return S.getRound(n.round_id) ? `#review/${n.round_id}` : null;
  if (n.kind === "event_draw") return `#event/${n.round_id}`;
  if (n.kind === "round_seated") return S.getRound(n.round_id) ? resumeHash(S.getRound(n.round_id)) : null;
  if (["league_joined", "league_round", "claim_made"].includes(n.kind)) return n.league_id ? `#league/${n.league_id}` : null;
  if (["friend_request", "friend_accepted", "contact_linked"].includes(n.kind)) return n.account_id ? `#person/${n.account_id}` : null;
  if (n.kind === "friends_stats") return "#people";
  if (["event_spot_given", "event_taken"].includes(n.kind)) return `#series/${encodeURIComponent(String(n.ref).split("|")[0])}`;
  return null;
}

/** The sentence a line says. */
function textOf(n) {
  const who = n.actor_name ? esc(firstName(n.actor_name)) : "Someone";
  const c = n.course ? courseBy(n.course) : null;
  const where = c ? esc(courseTitle(c)) : esc(n.name || "");
  switch (n.kind) {
    case "round_added": return `<b>${who}</b> added a round you played: ${where}${n.date ? `, ${esc(fmtDate(n.date))}` : ""}`;
    case "round_shared": return `<b>${who}</b> shared a card with you: ${where}${n.date ? `, ${esc(fmtDate(n.date))}` : ""}`;
    case "card_public": return `<b>${who}</b> made a link to a card you are on: ${where}`;
    case "league_invite": return `<b>${who}</b> invited you to <b>${esc(n.league_name)}</b>`;
    case "league_joined": return `<b>${esc(n.payload.name || who)}</b> joined <b>${esc(n.league_name)}</b>`;
    case "league_round": { const k = (n.payload.rounds || []).length; return `${k === 1 ? "A round was" : `${k} rounds were`} added to <b>${esc(n.league_name)}</b>`; }
    case "claim_made": return `<b>${who}</b> took the name <b>${esc(n.payload.name || "?")}</b> in ${esc(n.league_name)}`;
    case "contact_linked": return `<b>${esc(n.payload.name || who)}</b> is on Hagolf: the rounds you kept are theirs too now`;
    case "friends_stats": return "Friends can now see each other's stats. Tap a friend to see theirs.";
    case "friend_request": return `<b>${esc(n.name || who)}</b> wants to be your friend`;
    case "friend_accepted": return `You and <b>${esc(n.name || who)}</b> are friends`;
    case "round_seated": return `<b>${who}</b> put you on their card: ${where}`;
    case "event_draw": { const p = n.payload || {}, hole = c ? c.first_hole + (p.hole || 1) - 1 : p.hole || 1;
      return `${esc(n.name || "Your event")}${n.date ? `, ${esc(fmtDate(n.date))}` : ""}: you're off ${p.time ? `at <b>${esc(p.time)}</b> ` : ""}from the ${ordinal(hole)}${(p.with || []).length ? ` with ${esc(p.with.map(firstName).join(", "))}` : ""}`; }
    case "event_spot": return `<b>${esc((n.payload || {}).by || who)}</b> sent you a place in <b>${esc((n.payload || {}).event || "an event")}</b>`;
    case "event_spot_given": return `<b>${who}</b> put you in <b>${esc((n.payload || {}).event || "an event")}</b>`;
    case "event_taken": return `<b>${esc((n.payload || {}).name || who)}</b> took a place in <b>${esc((n.payload || {}).event || "your event")}</b>`;
    default: return esc(n.kind);
  }
}

/** One line; `compact` is the Home preview. */
export function noteLine(n, compact = false) {
  const key = N.keyOf(n);
  const acts = n.kind === "league_invite" ? `<div class="btnrow"><button class="btn small primary" data-act="join" data-token="${esc(n.token)}" data-key="${esc(key)}">Join</button><button class="btn small" data-act="decline-invite" data-token="${esc(n.token)}" data-key="${esc(key)}">No thanks</button></div>`
    : n.kind === "friend_request" ? `<div class="btnrow"><button class="btn small primary" data-act="accept" data-id="${esc(n.account_id)}" data-key="${esc(key)}">Accept</button><button class="btn small" data-act="decline" data-id="${esc(n.account_id)}" data-key="${esc(key)}">No</button></div>`
    : n.kind === "contact_linked" ? `<div class="btnrow"><button class="btn small" data-act="not-them" data-contact="${esc(n.contact_id)}" data-name="${esc(firstName(n.payload.name || ""))}" data-key="${esc(key)}">Not ${esc(firstName(n.payload.name || "them"))}</button></div>`
    : n.kind === "claim_made" && n.claimant ? `<div class="btnrow"><button class="btn small" data-act="unclaim" data-league="${esc(n.league_id)}" data-id="${esc(n.claimant)}" data-key="${esc(key)}">Undo</button></div>` : "";
  const href = hrefOf(n);
  return `<${href ? "a" : "div"} class="note ${n.seen ? "" : "unread"}" ${href ? `href="${href}" data-act="open" data-key="${esc(key)}"` : ""}>
    <span class="ic">${ICONS[ICON_OF[n.kind] || "bell"]}</span>
    <div class="body"><p>${textOf(n)}</p><small>${esc(ago(n.created))}</small>${compact ? "" : acts}</div></${href ? "a" : "div"}>`;
}

export function updates() {
  if (!A.signedIn()) return page("Updates", `<div class="banner"><a href="#welcome">Sign in</a> to be told when a round is added, a card shared or a society invites you.</div>`, { back: "#home", bell: false });
  const all = N.held();
  const dayOf = iso => { const d = new Date(iso); const today = new Date(); const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000); return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "This week" : "Earlier"; };
  const groups = [];
  for (const n of all) { const d = dayOf(n.created); if (!groups.length || groups[groups.length - 1].label !== d) groups.push({ label: d, items: [] }); groups[groups.length - 1].items.push(n); }
  page("Updates", `${all.length ? groups.map(g => `<h2 class="daylabel">${g.label}</h2><div class="list">${g.items.map(n => noteLine(n)).join("")}</div>`).join("")
      + (all.some(n => !n.seen) ? `<p class="center"><button class="btn ghost small" data-act="seen-all">Mark all as read</button></p>` : "")
    : emptyState("bell", "Nothing yet", "When somebody adds a round you played, shares a card, or invites you to a society, it lands here.")}
    <p class="center"><a class="muted small" href="#me/updates">Which updates reach this phone ›</a></p>`, { back: "#home", bell: false });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, key = b.dataset.key;
    if (act === "open") { if (key) N.markSeen([key]); return; }   // the link itself navigates
    ev.preventDefault();
    try {
      if (act === "seen-all") await N.markSeen();
      if (act === "join") { N.drop(key); return go(`#join/${b.dataset.token}`); }
      if (act === "decline-invite") { await F.declineInvite(b.dataset.token); N.drop(key); }
      if (act === "accept") { await F.accept(b.dataset.id); N.drop(key); toast("You are now friends"); }
      if (act === "decline") { await F.decline(b.dataset.id); N.drop(key); }
      if (act === "unclaim") { await F.unclaim(b.dataset.league, b.dataset.id); N.drop(key); toast("Undone"); await Y.pull(); }
      if (act === "not-them") { await F.contactUnlink(b.dataset.contact); N.drop(key); toast(`Back to just a name`); await Y.resync(); }
    } catch (e) { toast(e.message, 5000); }
    updates();
  });
  const before = JSON.stringify(all);
  N.refresh().then(next => { if (location.hash === "#updates" && JSON.stringify(next) !== before) updates(); });
}
