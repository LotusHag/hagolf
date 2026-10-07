// Leagues: the ones you are in, invitations waiting, and the two ways into another.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as N from "../notify.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, plural, ordinal, ICONS, emptyState, sheet, promptSheet, leagueBadge } from "../ui.js";
import { FORMAT_NAMES, FORMAT_MODE, FORMAT_BLURB, leagueResults, standingsFor, standingValue, myRow } from "./formats.js";

export function leagues() {
  const me = S.me();
  const invites = N.held().filter(n => n.kind === "league_invite");
  // the league's own first way of scoring, as Home reads it: a stroke-play league showed a Stableford place here
  const rows = S.leagues().map(g => {
    const { Ms, members } = leagueResults(g);
    const kind = S.cleanFormats(g.formats)[0];
    const Sx = standingsFor(g, Ms, members, kind);
    const mine = myRow(Sx.rows, me);
    const fmts = S.cleanFormats(g.formats).map(f => FORMAT_NAMES[f]).join(" · ");
    return `<a href="#league/${g.id}"><span class="lead">${leagueBadge(g)}<div><div class="name">${esc(g.name)}</div><div class="muted small">${plural(S.leagueRoundIds(g.id).length, "round")} · ${fmts}${Sx.rows[0] ? ` · leads: ${esc(Sx.rows[0].name)}` : ""}</div></div></span>
      ${mine ? `<span class="pill done">${ordinal(mine.place)} · ${standingValue(kind, mine)}</span>` : `<span class="chev">›</span>`}</a>`;
  }).join("");
  page("Societies", `
    ${invites.length ? `<h2>Invitations</h2><div class="list">${invites.map(n => `<div><span class="lead">${ICONS.mail}<div><div class="name">${esc(n.league_name)}</div><div class="muted small">${n.actor_name ? `${esc(n.actor_name)} invited you` : "You are invited"}</div></div></span>
      <span class="btnrow" style="margin:0;flex:none"><button class="btn small primary" data-act="accept" data-token="${esc(n.token)}" data-key="${esc(N.keyOf(n))}">Join</button><button class="btn small" data-act="decline" data-token="${esc(n.token)}" data-key="${esc(N.keyOf(n))}">No</button></span></div>`).join("")}</div>` : ""}
    ${rows ? `<h2>Your societies</h2><div class="list">${rows}</div>` : emptyState("trophy", "No societies yet", "A society is a running table over the rounds added to it.")}
    <div class="btnrow"><button class="btn" data-act="new">${ICONS.plus} New society</button><button class="btn" data-act="join">${ICONS.link} Join with a link</button></div>`, { back: "", tabs: "leagues" });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "new") return newLeagueSheet();
    if (b.dataset.act === "join") {
      const v = await promptSheet("Join a society", "Paste the invite link, or the code at the end of it.", { placeholder: "https://…/#join/…", label: "Join" });
      if (!v) return;
      const m = v.match(/#join\/([A-Za-z0-9_-]+)/) || v.match(/^([A-Za-z0-9_-]{16,})$/);
      if (!m) return toast("That is not an invite link");
      return go(`#join/${m[1]}`);
    }
    if (b.dataset.act === "accept") return go(`#join/${b.dataset.token}`);
    if (b.dataset.act === "decline") {
      try { await F.declineInvite(b.dataset.token); } catch (e) { /* gone already */ }
      N.drop(b.dataset.key);
      leagues();
    }
  });
}

/** Name it, choose how it is scored, done. Everything else lives under the league's Settings. */
export async function newLeagueSheet() {
  if (!A.signedIn()) return toast("Sign in to make a society");
  let made = null;
  await sheet({ title: "New society", body: `<form id="newg"><label style="margin-top:0">Name<input name="name" placeholder="e.g. Thursday society" required></label>
      <label>Scored by</label><div class="fmtlist">${S.FORMATS.map(f => `<label><input type="checkbox" name="fmt" value="${f}" ${f === "stableford" ? "checked" : ""}> <span><b>${FORMAT_NAMES[f]}</b><small>${FORMAT_MODE[f]} · ${FORMAT_BLURB[f]}</small></span></label>`).join("")}</div></form>`,
    actions: [{ label: "Create", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }],
    onOpen: (el, close) => {
      const f = el.querySelector("#newg");
      f.querySelector("input[name=name]").focus();
      const submit = () => {
        const name = f.name.value.trim();
        if (!name) return toast("Give the society a name");
        const fmts = [...f.querySelectorAll("input[name=fmt]:checked")].map(i => i.value);
        made = S.createLeague(name, 0, S.me() ? S.me().name : null, fmts);
        close("ok");
      };
      f.addEventListener("submit", ev => { ev.preventDefault(); submit(); });
      el.querySelector("[data-sheet=ok]").addEventListener("click", ev => { ev.stopPropagation(); submit(); });
    } });
  if (made) go(`#league/${made.id}`);
}
