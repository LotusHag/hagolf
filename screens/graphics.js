// The images: a round's boards and cards, a league's standings, and its stats, in any look the account holds.
import * as S from "../store.js";
import * as E from "../entitlements.js";
import { page, bind, esc, go, toast, plural, courseBy, noCourse, themeChips, bindChips, themeNamed, themeForRound, themeFor, leagueTheme, runJobs, slugFile, makeTheme, shopBtn, app } from "../ui.js";
import { compute, leagueStats } from "../model.js";
import { grossLeaderboard, stablefordLeaderboard, bothBoards, holesPoster, standingsPoster } from "../posters.js";
import { statsFieldPoster, statsNinesPoster, statsPlayerPoster, statsExtrasPoster } from "../statsposters.js";
import { renderCards } from "../cards.js";
import { FORMAT_NAMES, leagueResults, standingsFor } from "./formats.js";
import { ninesForPoster, leagueRounds } from "./stats.js";
import { ui } from "../ui.js";

export function graphics(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) { return page("Images", `<div class="banner warn">${esc(err.message)}</div>`, { back: `#review/${rid}` }); }
  const leagues = S.leaguesOfRound(rid);
  const themeLeague = leagues.find(leagueTheme);
  const themes = [themeForRound(rid).name];
  // An image the account cannot make is not offered at all; what it is missing is one button under the list.
  const missing = [...(E.boardTier() === "full" ? [] : ["boards"]), ...(E.cardTier() === "full" ? [] : ["card"])];
  const body = `
    <h2>Which images</h2>
    <div class="card checks">
      <label><input type="checkbox" name="g" value="stbl" checked> Stableford leaderboard</label>
      <label><input type="checkbox" name="g" value="gross"> Gross leaderboard</label>
      ${E.boardTier() === "full" ? `<label><input type="checkbox" name="g" value="both"> Both boards on one sheet</label><label><input type="checkbox" name="g" value="holes"> How the holes played</label>` : ""}
      <label><input type="checkbox" name="g" value="cards"> Player cards <span class="muted">&nbsp;(${M.field})</span></label>
      <details><summary class="muted small">Only some players' cards</summary>${M.players.map(p => `<label><input type="checkbox" name="card" value="${esc(p.name)}" checked> ${esc(p.name)}</label>`).join("")}</details>
      ${M.stats_on && E.cardTier() === "full"
        ? `<label><input type="checkbox" name="cx" ${S.statsOnImages() ? "checked" : ""}> Putts, fairways and the rest on the cards <span class="muted">&nbsp;(${plural(M.players.filter(p => p.statline.any).length, "card")} kept them)</span></label>`
        : ""}
      <button class="btn small" type="button" data-act="tick-all">Everything, every theme</button>
    </div>
    ${missing.length ? shopBtn("More images in the shop", missing) : ""}
    <h2>Theme</h2>
    ${themeLeague ? `<p class="muted small" style="margin:-2px 4px 8px">${esc(themeLeague.name)} is set to ${esc(themeLeague.theme)}.</p>` : ""}
    <div class="themes">${themeChips(themes)}</div>
    <div id="out"></div>`;
  page("Images", body, { back: `#review/${rid}`, bar: `<button class="btn primary" data-act="generate">Generate images</button>`, sub: r.name });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tick-all") {
      document.querySelectorAll("input[name=g], input[name=theme]").forEach(i => { i.checked = true; });
      document.querySelectorAll(".tchip").forEach(l => l.classList.add("on"));
      return;
    }
    if (b.dataset.act !== "generate") return;
    const want = [...document.querySelectorAll("input[name=g]:checked")].map(i => i.value);
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value).filter(n => E.canTheme(n) || themes.includes(n));
    const cardNames = [...document.querySelectorAll("input[name=card]:checked")].map(i => i.value);
    const cx = document.querySelector("input[name=cx]");
    const cardOpts = { extras: !!(cx && cx.checked) };
    if (cx) S.setStatsOnImages(cardOpts.extras);
    if (!want.length) return toast("Tick at least one image");
    if (!chosen.length) return toast("Pick at least one theme");
    const jobs = [];
    for (const tn of chosen) {
      const T = makeTheme(themeNamed(tn));
      const prefix = chosen.length > 1 ? `${tn}/` : "";
      const tier = E.boardTier(), cardTier = E.cardTier();
      if (want.includes("gross")) jobs.push({ label: `${prefix}1_leaderboard_gross.png`, make: () => grossLeaderboard(M, T, tier) });
      if (want.includes("stbl")) jobs.push({ label: `${prefix}2_leaderboard_stableford.png`, make: () => stablefordLeaderboard(M, T, tier) });
      if (want.includes("holes") && tier === "full") jobs.push({ label: `${prefix}3_holes.png`, make: () => holesPoster(M, T) });
      if (want.includes("both") && tier === "full") jobs.push({ label: `${prefix}4_leaderboard_both.png`, make: () => bothBoards(M, T) });
      if (want.includes("cards")) for (const p of M.players.filter(p => cardNames.includes(p.name))) jobs.push({ label: `${prefix}${renderCards(M, T, [p.name], cardTier, cardOpts)[0].file}`, make: () => renderCards(M, T, [p.name], cardTier, cardOpts)[0].fig });
    }
    await runJobs(jobs, slugFile(r.name));
  });
  bindChips(app.querySelector(".themes"));
}

export function leaguePoster(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const formats = S.cleanFormats(g.formats);
  const themes = [themeFor(g).name];
  page("Standings poster", `
    ${formats.length > 1 ? `<h2>Which standings</h2><div class="card checks">${formats.map(f => `<label><input type="checkbox" name="sf" value="${f}" checked> ${FORMAT_NAMES[f]}</label>`).join("")}</div>` : ""}
    <h2>Theme</h2><div class="themes">${themeChips(themes)}</div><div id="out"></div>`,
    { back: `#league/${gid}`, bar: `<button class="btn primary" data-act="generate">Generate image${formats.length > 1 ? "s" : ""}</button>` });
  bindChips(app.querySelector(".themes"));
  bind(async ev => {
    if (!ev.target.closest("[data-act=generate]")) return;
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value).filter(n => E.canTheme(n) || themes.includes(n));
    if (!chosen.length) return toast("Pick at least one theme");
    const want = formats.length > 1 ? [...document.querySelectorAll("input[name=sf]:checked")].map(i => i.value) : formats;
    if (!want.length) return toast("Pick at least one set of standings");
    const { Ms, members } = leagueResults(g);
    const jobs = [];
    chosen.forEach(tn => want.forEach((f, k) => jobs.push({ label: `${chosen.length > 1 ? tn + "/" : ""}${4 + k}_standings_${f}.png`, make: () => standingsPoster(standingsFor(g, Ms, members, f), g, makeTheme(themeNamed(tn)), f) })));
    await runJobs(jobs, slugFile(g.name));
  });
}

export function statsPoster(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const { Ms, members } = leagueResults(g);
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return page("Stats images", `<p class="muted center" style="margin:30px 0">No finished rounds in this league yet.</p>`, { back: `#league/${gid}` });
  if (!E.seasonAllowed()) {
    page("Stats images", `<div class="banner"><b>The season pack</b> makes these: how the league scores, the nines walked, and one image a player.</div>
      ${shopBtn("See what it makes", "season")}`, { back: `#league/${gid}`, sub: g.name });
    return;
  }
  const N = ninesForPoster(leagueRounds(gid), members);
  const anyX = St.field.statline.any;
  const who = St.players.some(p => p.id === ui.statsWho[gid]) ? ui.statsWho[gid] : "";
  const themes = [themeFor(g).name];
  page("Stats images", `
    <h2>Which images</h2>
    <div class="card checks">
      <label><input type="checkbox" name="si" value="field" checked> How this league scores <span class="muted">&nbsp;(the field over ${plural(St.field.cards, "card")})</span></label>
      ${N.length ? `<label><input type="checkbox" name="si" value="nines" checked> The nines walked <span class="muted">&nbsp;(${plural(N.length, "loop")})</span></label>` : ""}
      ${anyX ? `<label><input type="checkbox" name="si" value="extras" checked> Putts, fairways and the rest <span class="muted">&nbsp;(${plural(St.players.filter(p => p.statline.any).length, "player")} keep them)</span></label>` : ""}
      <label class="muted small" style="margin-top:6px">One image a player</label>
      ${St.players.map(p => `<label><input type="checkbox" name="sp" value="${esc(p.id)}" ${p.id === who ? "checked" : ""}> ${esc(p.name)} <span class="muted">&nbsp;(${plural(p.played, "round")})</span></label>`).join("")}
      <button class="btn small" type="button" data-act="tick-all">Everyone, every theme</button>
      ${anyX ? `<label class="foldrow"><input type="checkbox" name="sx" ${S.statsOnImages() ? "checked" : ""}> Put the extras on the sheets above too <span class="muted">&nbsp;(a band at the foot, never in the headline figures)</span></label>` : ""}
    </div>
    <h2>Theme</h2><div class="themes">${themeChips(themes)}</div><div id="out"></div>`,
    { back: `#league/${gid}`, sub: g.name, bar: `<button class="btn primary" data-act="generate">Generate images</button>` });
  bindChips(app.querySelector(".themes"));
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tick-all") { document.querySelectorAll("input[name=si], input[name=sp], input[name=theme]").forEach(i => { i.checked = true; }); document.querySelectorAll(".tchip").forEach(l => l.classList.add("on")); return; }
    if (b.dataset.act !== "generate") return;
    const want = [...document.querySelectorAll("input[name=si]:checked")].map(i => i.value);
    const pids = [...document.querySelectorAll("input[name=sp]:checked")].map(i => i.value);
    const chosen = [...document.querySelectorAll("input[name=theme]:checked")].map(i => i.value).filter(n => E.canTheme(n) || themes.includes(n));
    const sx = document.querySelector("input[name=sx]");
    const opts = { extras: !!(sx && sx.checked) };
    if (sx) S.setStatsOnImages(opts.extras);
    if (!want.length && !pids.length) return toast("Tick at least one image");
    if (!chosen.length) return toast("Pick at least one theme");
    const jobs = [];
    for (const tn of chosen) {
      const T = makeTheme(themeNamed(tn));
      const prefix = chosen.length > 1 ? `${tn}/` : "";
      if (want.includes("field")) jobs.push({ label: `${prefix}6_stats_field.png`, make: () => statsFieldPoster(St, g, T, opts) });
      if (want.includes("nines") && N.length) jobs.push({ label: `${prefix}7_stats_nines.png`, make: () => statsNinesPoster(N, g, T) });
      if (want.includes("extras") && anyX) jobs.push({ label: `${prefix}9_stats_extras.png`, make: () => statsExtrasPoster(St, g, T) });
      for (const pid of pids) { const p = St.players.find(x => x.id === pid); if (p) jobs.push({ label: `${prefix}8_stats_${slugFile(p.name)}.png`, make: () => statsPlayerPoster(St, p, g, T, opts) }); }
    }
    await runJobs(jobs, `${slugFile(g.name)}_stats`);
  });
}
