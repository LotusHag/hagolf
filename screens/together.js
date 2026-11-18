// Scoring together: coming onto somebody else's card by a link or a code, and onto your society's day card by
// one tap. Either way you end up as a scorer on the one card, with your own seat on it.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as Y from "../sync.js";
import { page, bind, esc, go, toast, courseBy, courseTitle, fmtDate, sheet, rememberIntent, resumeHash, plural, shareLink } from "../ui.js";
import { formatLabel } from "./home.js";
import { seatOnEvent } from "./event.js";

/** A society's day on one loop is one card, whichever phone starts it first and however offline it is. */
export function dayCardId(leagueId, date, slug) {
  const k = `${leagueId}|${date}|${slug}`;
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < k.length; i++) { const c = k.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
  return "d" + (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** My seat on a card, made from my own contact and account, prefilled the way every card is. */
export function seatMe(r, group = 1) {
  const c = courseBy(r.course), me = S.me(), a = A.account();
  if (!c || !me) return null;
  const tees = Object.keys(c.tees);
  const hi = S.currentIndex(me) ?? (a ? a.hi : null) ?? 54;
  return S.addEntry(r, c.n, { name: me.name, hi, tee: S.lastTee(me.id, r.course, tees) || r.defaultTee, gender: me.gender || "m", courseHandicap: null,
    accountId: S.myAccount(), group, trackStats: S.keepsAny(S.myKeep()) });
}

async function whichGroup(r) {
  const groups = [...new Set(r.entries.map(e => e.group || 1))].sort((a, b) => a - b);
  const next = (groups[groups.length - 1] || 0) + 1;
  if (!r.entries.length) return 1;
  const v = await sheet({ title: "Which group are you in?", lead: `${plural(r.entries.length, "player")} on the card so far.`,
    body: `<div class="fmtgrid">${groups.map(g => `<button class="fmttile" data-sheet="${g}"><b>Group ${g}</b><small>${esc(r.entries.filter(e => (e.group || 1) === g).map(e => e.name.split(" ")[0]).join(", "))}</small></button>`).join("")}
      <button class="fmttile" data-sheet="${next}"><b>Group ${next}</b><small>a new group</small></button></div>` });
  return v ? Number(v) : null;
}

/** I'm playing: onto today's day card of my society, as a scorer with my own seat. */
export async function joinDay(rid) {
  const r = S.getRound(rid);
  if (!r) return toast("That day card isn't on this phone yet");
  if (S.mySeat(r)) return go(resumeHash(r));
  const g = await whichGroup(r);
  if (g === null) return;
  try { if (A.signedIn() && r.owner !== S.myAccount()) await A.api(`/round/${rid}/dayjoin`, {}); } catch (e) { return toast(e.message, 5000); }
  if (A.signedIn()) await Y.pull();
  seatMe(r, g);
  if (r.status === "setup") { r.status = "scoring"; S.saveRound(r); }
  go(`#score/${rid}/${S.holeOf(r)}`);
}

/** Shows a day on a public live board, for the people at home and the clubhouse screen; or takes it off. */
export async function liveSheet(r) {
  if (!A.signedIn()) return toast("Sign in first");
  try {
    await Y.push();
    if (r.live && !await sheet({ title: "This round is live", lead: "Anyone with the link sees the board as it stands.",
      actions: [{ label: "Share the link again", value: "share", kind: "primary" }, { label: "Stop showing it live", value: "off", kind: "danger" }, { label: "Close", value: "no" }] })
      .then(async v => { if (v === "off") { await A.api(`/round/${r.id}/golive`, { on: false }); r.live = false; S.afterPull(); toast("No longer live"); return false; } return v === "share"; })) return;
    const res = await A.api(`/round/${r.id}/golive`, { on: true });
    r.live = true; S.afterPull();
    const v = await sheet({ title: "Live board", lead: "Every group on one board, updated with every score. No sign-in needed to look. Put it on the clubhouse screen with the TV link.",
      body: `<div class="linkbox">${esc(res.url)}</div>`, actions: [{ label: "Send the link", value: "share", kind: "primary" }, { label: "Open the TV board", value: "tv" }, { label: "Done", value: "no" }] });
    if (v === "share") await shareLink(res.url, `${r.name}, live`, `${r.name}: follow it live`);
    if (v === "tv") window.open(`${res.url}/tv`, "_blank");
  } catch (e) { toast(e.message, 5000); }
}

/** #j/<code>: an invite onto a card. Which seat is me, or add me. */
export async function joinCard(code) {
  if (!code) return go("#home");
  if (!A.signedIn()) { rememberIntent(`#j/${code}`); return go("#welcome"); }
  page("Join a card", `<p class="muted center">Opening the card…</p>`, { back: "#home", bell: false });
  let info;
  try { info = await A.api(`/round/invite/${encodeURIComponent(code)}`); } catch (e) {
    return page("Join a card", `<div class="banner warn">${esc(e.message)}</div><a class="btn" href="#home">Back to Play</a>`, { back: "#home" });
  }
  const r = info.round, c = courseBy(r.course);
  const free = info.seats.filter(s => !s.taken && !s.mine);
  const mine = info.seats.find(s => s.mine);
  page("Join a card", `
    <div class="card"><div class="k caps">${esc(formatLabel(r.format))}</div><div class="name">${esc(r.name)}</div>
      <div class="muted small">${esc(c ? courseTitle(c) : r.course)} · ${esc(fmtDate(r.date))}</div></div>
    ${mine ? `<p>You're already on this card as <b>${esc(mine.name)}</b>.</p><button class="btn primary wide" data-act="go">Score it</button>`
      : `<h2>Which one is you?</h2>
        <div class="list">${free.map(s => `<button data-act="seat" data-seat="${esc(s.id)}"><div class="name">${esc(s.name)}</div><span class="chev">›</span></button>`).join("")}</div>
        <button class="btn wide" data-act="addme">I'm not on it yet: add me</button>`}
    <p class="muted small center">You'll score this card with them, live, until it's saved.</p>`, { back: "#home", bell: false });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    try {
      if (b.dataset.act !== "go") await A.api("/round/join", { code, seat: b.dataset.seat || null });
      await Y.fetchRound(r.id);
      const local = S.getRound(r.id);
      if (!local) return toast("The card didn't arrive; try again in a moment");
      if (b.dataset.act === "addme" && !S.mySeat(local)) { const e = seatMe(local); if (e && local.event) seatOnEvent(local, courseBy(local.course), e); }
      go(local.event ? `#event/${r.id}` : `#score/${r.id}/${S.holeOf(local)}`);
    } catch (e) { toast(e.message, 5000); }
  });
}
