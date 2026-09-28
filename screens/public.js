// What a link opens for anybody: a league's board, or one card. Read from the public endpoints with no session,
// drawn with the same tables the app uses for its own, so the two can never disagree.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { page, bind, esc, go, ui, plural, courseBy, subtabs, tip, paint, themeNamed, appTheme, fmtDate, ordinal } from "../ui.js";
import { compute, fmtToPar, fmtHcp, outcome, NO_SCORE } from "../model.js";
import { FORMAT_NAMES, FORMAT_NOTES, standingsFor, standingsTable } from "./formats.js";

const courseOf = (slug, list) => courseBy(slug) || (() => { const k = (list || []).find(x => x.slug === slug); return k && k.data ? { ...k.data, slug } : null; })();

function buildRound(P, r, entriesIn, scoresIn, course) {
  const n = course.n || (course.par || []).length;
  const entries = entriesIn.map(e => {
    const scores = new Array(n).fill(null);
    for (const s of scoresIn) if (s.id === e.id && s.hole < n) scores[s.hole] = s.strokes;
    return { id: e.id, name: e.name, hi: e.hi, tee: e.tee, gender: e.gender || "m", group: e.group || 1, courseHandicap: e.courseHandicap, scores, penalties: e.penalties || [], fromHole: e.fromHole || 1 };
  });
  return Object.assign(compute(course, { name: r.name, date: r.date, defaultTee: r.defaultTee, allowance: r.allowance || 100, final: true, entries }), { id: r.id });
}

const signInLine = () => A.signedIn() ? "" : ` <a href="#welcome">Sign in</a> to keep rounds and leagues of your own.`;

export async function board(token) {
  if (!token) return go("#home");
  page("Board", `<p class="muted center" style="margin-top:40px">Loading the board…</p>`, { back: "#home", brand: true, bell: false });
  let P;
  try { P = await F.publicBoard(token); }
  catch (e) { return page("Board", `<div class="banner warn">${e.status === 404 ? "This board is private, or the link is not right." : esc(e.message)}</div>`, { back: "#home", brand: true, bell: false }); }
  const Ms = [];
  for (const r of P.rounds) {
    const course = courseOf(r.course, P.courses);
    if (!course) continue;
    try { Ms.push(buildRound(P, r, P.entries.filter(e => e.roundId === r.id), P.scores.filter(s => s.roundId === r.id), course)); }
    catch (e) { console.warn("board: round left out", r.id, e.message); }
  }
  const g = { id: P.league.id, name: P.league.name, formats: S.cleanFormats(P.league.formats), bestN: P.league.bestN || 0, theme: P.league.theme || null };
  paint(themeNamed(g.theme) || appTheme());
  const members = [...new Set(Ms.flatMap(M => M.players.map(p => p.id)))];
  const pick = g.formats.includes(ui.boardFmt) ? ui.boardFmt : g.formats[0];
  const body = Ms.length ? `
      ${g.formats.length > 1 ? subtabs(g.formats.map(f => `<button data-act="bfmt" data-f="${f}" class="${f === pick ? "on" : ""}">${FORMAT_NAMES[f]}</button>`).join("")) : ""}
      ${standingsTable(pick, standingsFor(g, Ms, members, pick), g, null)}
      ${tip(FORMAT_NOTES[pick], "How this table is scored")}`
    : `<p class="muted center" style="margin:30px 0 14px">No finished rounds on this board yet.</p>`;
  page(g.name, `${body}<p class="muted small center" style="margin-top:18px">${P.league.showHandicaps ? "" : "Handicaps are not shown on this board. "}Shared from Hagolf.${signInLine()}</p>`,
    { back: "#home", brand: true, bell: false, sub: `${plural(P.rounds.length, "round")} · ${g.formats.map(f => FORMAT_NAMES[f]).join(", ")}` });
  bind(ev => { const b = ev.target.closest("[data-act=bfmt]"); if (b) { ui.boardFmt = b.dataset.f; board(token); } });
}

/** `#card/<token>`: one round, read only, for whoever has the link. */
export async function card(token) {
  if (!token) return go("#home");
  page("Card", `<p class="muted center" style="margin-top:40px">Loading the card…</p>`, { back: "#home", brand: true, bell: false });
  let P;
  try { P = await F.publicCard(token); }
  catch (e) { return page("Card", `<div class="banner warn">${e.status === 404 ? "This card is not shared any more, or the link is not right." : esc(e.message)}</div>`, { back: "#home", brand: true, bell: false }); }
  const course = courseOf(P.round.course, P.course ? [P.course] : []);
  if (!course) return page("Card", `<div class="banner warn">The course of this card is not known here.</div>`, { back: "#home", brand: true, bell: false });
  let M;
  try { M = buildRound(P, P.round, P.entries, P.scores, course); } catch (e) { return page("Card", `<div class="banner warn">${esc(e.message)}</div>`, { back: "#home", brand: true, bell: false }); }
  const c = course;
  const chips = p => p.scores.map((v, i) => {
    const par = c.par[i];
    const cls = p.skipped[i] ? "empty" : v === null ? "empty" : v === 0 ? "pick" : ["under", "par", "bogey", "double"][outcome(v - par)];
    return `<span class="chip ${cls}"><small>${(c.first_hole || 1) + i}</small>${p.skipped[i] ? "—" : v === null ? "–" : v === 0 ? String(NO_SCORE) : v}</span>`;
  }).join("");
  const rows = M.stbl_board.map(p => `<div class="card pl ${ui.expanded === p.id ? "open" : ""}">
      <button class="row plain" data-act="expand" data-pid="${esc(p.id)}">
        <div class="who"><span class="pos ${p.splace === 1 ? "p1" : ""}">${p.splace}</span><div><div class="name">${esc(p.name)}</div><div class="muted small">hcp ${fmtHcp(p.ph)} · ${esc(p.tee)}</div></div></div>
        <div class="nums"><span><b class="num">${p.gross === null ? "NR" : p.gross}</b><small>gross${p.topar !== null ? " " + fmtToPar(p.topar) : ""}</small></span><span><b class="num">${p.net === null ? "NR" : p.net}</b><small>net</small></span><span class="acc"><b class="num">${p.pts}</b><small>pts</small></span></div></button>
      ${ui.expanded === p.id ? `<div class="chips">${chips(p)}</div>` : ""}</div>`).join("");
  page(P.round.name, `<p class="muted small" style="margin:4px 4px 8px">${esc(fmtDate(P.round.date))} · ${esc(c.loop ? `${c.name} · ${c.loop}` : c.name)} · ${plural(M.field, "player")}</p>${rows}
    <p class="muted small center" style="margin-top:18px">Shared from Hagolf. Tap a player for their holes.${signInLine()}</p>`,
    { back: "#home", brand: true, bell: false, sub: "Shared card" });
  bind(ev => { const b = ev.target.closest("[data-act=expand]"); if (b) { ui.expanded = ui.expanded === b.dataset.pid ? null : b.dataset.pid; card(token); } });
}
