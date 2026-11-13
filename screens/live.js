// #live/<token>: a tournament day as everyone sees it, live. No account needed -- it is a link for the people at
// home and a screen in the clubhouse (#live/<token>/tv). Every group, ranked as it stands, redrawn the moment a
// score goes in anywhere on the card.
import * as Y from "../sync.js";
import * as Mo from "../model.js";
import { page, bind, esc, go, ui, plural, fmtDate, courseTitle, firstName } from "../ui.js";
import { courseOf } from "./public.js";
import { liveBoard, formatLabel } from "./home.js";

let sock = null, sockFor = null;

function listen(token, redraw) {
  if (sockFor === token && sock) return;
  if (sock) { try { sock.close(); } catch (e) { /* already */ } }
  sockFor = token;
  const c = Y.config();
  if (!c || typeof WebSocket === "undefined") return;
  try {
    sock = new WebSocket(`${c.url.replace(/^http/, "ws")}/public/live/${encodeURIComponent(token)}`);
    sock.onmessage = () => { if (location.hash.startsWith(`#live/${token}`)) redraw(); };
    sock.onclose = () => { sock = null; if (location.hash.startsWith(`#live/${token}`)) setTimeout(() => { sockFor = null; listen(token, redraw); }, 5000); };
  } catch (e) { sock = null; }
}

/** The day in the shape the app's own live board reads. */
function asRound(P, course) {
  const n = course.n || course.par.length;
  const r = { id: "live", format: P.round.format, course: P.round.course, defaultTee: P.round.defaultTee, allowance: P.round.allowance || 100, entries: [] };
  for (const e of P.entries) {
    const scores = new Array(n).fill(null);
    for (const s of P.scores) if (s.id === e.id && s.hole < n) scores[s.hole] = s.strokes;
    r.entries.push({ playerId: e.id, contactId: null, name: e.name, hi: e.hi, tee: e.tee, gender: e.gender || "m", courseHandicap: e.courseHandicap, group: e.group || 1,
      fromHole: e.fromHole || 1, scores, penalties: e.penalties || [], role: e.role || "player", side: e.side || null, members: e.members || [] });
  }
  return r;
}

export async function liveScreen(token, mode) {
  if (!token) return go("#home");
  const tv = mode === "tv";
  const c = Y.config();
  let P;
  try {
    const res = await fetch(`${c ? c.url : ""}/public/live/${encodeURIComponent(token)}/board`);
    if (!res.ok) throw Object.assign(new Error(res.status === 404 ? "This day is not live, or the link is not right." : `The board failed (${res.status})`), { status: res.status });
    P = await res.json();
  } catch (e) {
    return page("Live", `<div class="banner warn">${esc(e.message)}</div>`, { back: "#home", brand: true, bell: false, bare: tv });
  }
  const course = courseOf(P.round.course, P.courses);
  if (!course) return page("Live", `<div class="banner warn">The course of this day did not come with it.</div>`, { back: "#home", bell: false });
  const r = asRound(P, course);
  let body;
  if (r.format === "match" && Mo.matchPlay) {
    let M = null;
    try { M = Mo.matchPlay(course, { format: "match", name: P.round.name, defaultTee: r.defaultTee, allowance: r.allowance, final: false,
      entries: r.entries.map(e => ({ id: e.playerId, name: e.name, hi: e.hi, tee: e.tee, gender: e.gender, courseHandicap: e.courseHandicap, scores: e.scores, side: e.side, fromHole: e.fromHole, penalties: e.penalties })) }); } catch (e) { M = null; }
    body = M ? `<div class="livematch"><div class="side">${esc(M.sides.A.join(" & "))}</div><div class="state num">${esc(M.result || M.status)}</div><div class="side">${esc(M.sides.B.join(" & "))}</div></div>
      <div class="holeline">${M.holes.map(h => `<span class="${h.winner === "A" ? "a" : h.winner === "B" ? "b" : h.winner === "halved" ? "h" : ""}">${course.first_hole + h.hole - 1}</span>`).join("")}</div>`
      : `<p class="muted center">The match has not started.</p>`;
  } else {
    const L = liveBoard(r, course);
    const groups = [...new Set(r.entries.map(e => e.group || 1))].sort((a, b) => a - b);
    const gf = !tv && groups.includes(ui.liveGroup) ? ui.liveGroup : 0;
    const rows = (L ? L.rows : []).filter(x => !gf || x.group === gf);
    body = `${!tv && groups.length > 1 ? `<div class="filter">${[0, ...groups].map(g => `<button data-act="g" data-g="${g}" class="${gf === g ? "on" : ""}">${g ? `Group ${g}` : "Everyone"}</button>`).join("")}</div>` : ""}
      <div class="ranking liverank">${rows.map(x => `<div class="rankrow ${x.place === 1 ? "p1" : ""}"><span class="pos">${x.place ?? "–"}</span><span class="t"><b>${esc(tv ? x.name : x.name)}</b><small>${esc(x.sub)}${groups.length > 1 ? ` · group ${x.group}` : ""}</small></span><span class="v">${esc(x.main)}</span></div>`).join("")
        || `<p class="muted center" style="padding:20px">No scores in yet.</p>`}</div>`;
  }
  const title = P.round.league || P.round.name;
  const sub = `${formatLabel(r.format)} · ${courseTitle(course)} · ${fmtDate(P.round.date)}`;
  if (tv) {
    page(title, `<div class="tvboard"><div class="tvhead"><h1>${esc(title)}</h1><p>${esc(sub)} · <span class="livedot">live</span></p></div>${body}</div>`, { bare: true });
  } else {
    page(title, `<p class="center"><span class="livedot">live</span> ${esc(plural(r.entries.filter(e => e.role !== "member").length, r.format === "scramble" ? "team" : "player"))}</p>${body}
      <p class="muted small center" style="margin-top:18px">Shared from Hagolf. <a href="#live/${esc(token)}/tv">Show it on a big screen ›</a></p>`, { back: "#home", brand: false, bell: false, sub });
  }
  listen(token, () => liveScreen(token, mode));
  bind(ev => { const b = ev.target.closest("[data-act=g]"); if (b) { ui.liveGroup = Number(b.dataset.g); liveScreen(token, mode); } });
}
