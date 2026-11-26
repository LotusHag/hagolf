// A society whose members are kept on a list elsewhere (the Golf Goons' roster on golfgoons.org, src/goons.js on the
// Worker). The Worker says so in the members answer, so this shows only for that society: founders keep the list here
// as on the site, and nobody else can invite, take out or join round it.
import * as A from "../auth.js";
import { esc, sect, toast, sheet, confirmSheet, plural } from "../ui.js";

const host = roster => { try { return new URL(roster.site).host; } catch { return "its site"; } };

/** The Worker's word on the roster, with every address on it for a founder, who alone may read them. */
export const withList = async roster => roster && roster.founder ? { ...roster, list: (await A.api("/goons/roster")).roster } : roster;

/** How somebody joins, and for a founder every address on the list with Remove, then Add. */
export function rosterJoin(g, roster) {
  const says = `<p class="muted small says">Who is in ${esc(g.name)} is kept on its members list on ${esc(host(roster))}. A founder puts the address somebody signs in with on the list, and signing in with it puts them in, here and on the site. Taking it off takes them out; their cards stay.</p>`;
  if (!roster.founder) return `${sect("Joining")}${says}`;
  const row = r => `<div><span class="lead"><div><div class="name">${esc(r.name)}${r.founder ? ` <span class="muted small">Founder</span>` : ""}</div>
    <div class="muted small">${esc(r.email)} · ${r.account ? `signs in as ${esc(r.account)}` : "not signed in yet"}</div></div></span>
    ${r.founder ? "" : `<button class="btn small" data-act="roster-out" data-email="${esc(r.email)}" data-name="${esc(r.name)}">Remove</button>`}</div>`;
  return `${sect("Joining", `<span class="muted small">${plural(roster.list.length, "address", "addresses")}</span>`)}${says}
    <div class="list">${roster.list.map(row).join("")}</div>
    <button class="btn wide" data-act="roster-add">Add a member</button>`;
}

/** Leaving a roster society is resigning; a founder stays a member, as the rules name them. */
export const rosterLeave = roster => roster.founder ? "" : `<div class="center lfoot"><button class="btn ghost quietdanger" data-act="leave">Resign</button></div>`;
export const resignWords = g => ["Resign?", `Your address comes off the members list and you leave ${g.name}. Your rounds stay on its cards.`];

/** The list's own buttons. Resolves true once the list changed, so the page draws it again. */
export async function rosterAct(ev) {
  const b = ev.target.closest("[data-act=roster-add], [data-act=roster-out]");
  if (!b) return false;
  if (b.dataset.act === "roster-add") {
    const said = { name: "", email: "" };
    const v = await sheet({ title: "Add a member", lead: "They get an email asking them to sign in with this address.",
      body: `<form id="rosteradd"><label>Name<input name="name" autocomplete="off"></label>
        <label>The address they sign in with<input name="email" type="email" inputmode="email" autocapitalize="off" autocomplete="off"></label></form>`,
      actions: [{ label: "Add", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }],
      onOpen: (el, close) => {
        const f = el.querySelector("#rosteradd");
        f.addEventListener("input", ev => { said[ev.target.name] = ev.target.value.trim(); });
        f.addEventListener("submit", e => { e.preventDefault(); close("ok"); });
        f.querySelector("input").focus();
      } });
    if (v !== "ok") return false;
    try { await A.api("/goons/roster", said); toast(`${said.name} is on the list`); return true; }
    catch (e) { toast(e.message, 5000); return false; }
  }
  if (!await confirmSheet(`Take ${b.dataset.name} off the list?`, "They leave the society. Their cards stay.", { label: "Take off", danger: true })) return false;
  try { await A.api("/goons/roster/remove", { email: b.dataset.email }); toast("Taken off the list"); return true; }
  catch (e) { toast(e.message, 5000); return false; }
}
