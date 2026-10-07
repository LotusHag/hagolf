// The images: a round's boards and cards, and a league's standings and season sheets. Two screens, one shape --
// tiles of what each sheet looks like, a fold that says who is on them, the look folded to a row, and a button
// that says how many images the tap will make.
import * as S from "../store.js";
import * as E from "../entitlements.js";
import * as B from "../brand.js";
import { page, bind, esc, go, toast, plural, courseBy, noCourse, themePicker, bindLook, themeNamed, themeForRound, themeFor, leagueTheme, runJobs, slugFile, makeTheme, sizedLooks, sizedName, shopBtn, app, ICONS } from "../ui.js";
import { compute, leagueStats } from "../model.js";
import { grossLeaderboard, stablefordLeaderboard, bothBoards, holesPoster, standingsPoster } from "../posters.js";
import { statsFieldPoster, statsNinesPoster, statsPlayerPoster, statsExtrasPoster } from "../statsposters.js";
import { renderCards } from "../cards.js";
import { FORMAT_NAMES, leagueResults, standingsFor } from "./formats.js";
import { ninesForPoster, leagueRounds } from "./stats.js";
import { ui } from "../ui.js";

// Each kind is a tile showing an example of it, drawn on the showcase round and league by app/tests/examples.mjs.
const KINDS = [
  { key: "stbl", name: "Stableford leaderboard" },
  { key: "gross", name: "Gross leaderboard" },
  { key: "both", name: "Both boards on one sheet", full: true },
  { key: "holes", name: "How the holes played", full: true },
  { key: "cards", name: "Player cards", card: true },
];
// The season's sheets, in the order they are made. `nines` and `extras` are only there when there is something
// for them to say, so the key, not the position, is what everything else goes by.
const SHEETS = [
  { key: "field", name: "How this society scores" },
  { key: "nines", name: "The nines walked" },
  { key: "extras", name: "Putts, fairways and the rest" },
  { key: "players", name: "One image a player" },
];

const exampleOf = (k, basic) => `${k.key}${basic && !k.full ? "-basic" : ""}`;
const exImg = file => `<span class="gimg"><img src="img/examples/${file}.webp" alt="" width="400" height="200" loading="lazy" decoding="async"></span>`;

/** One tickable tile: an example of the image, what it is called, and the tick in the corner. */
const tile = (name, value, label, file, on, extra = "") =>
  `<label class="gtile ${on ? "on" : ""}"><input type="checkbox" name="${name}" value="${esc(value)}" ${on ? "checked" : ""}>${exImg(file)}<span class="gname">${esc(label)}${extra}</span><span class="gcheck" aria-hidden="true">${ICONS.check}</span></label>`;
/** A sheet the account cannot make still shows what it would be, and opens the shop rather than ticking. */
const lockedTile = (label, file, sku) =>
  `<button type="button" class="gtile locked" data-shop="${esc(sku)}">${exImg(file)}<span class="gname">${esc(label)}</span><span class="glock">${ICONS.lock}In the shop</span></button>`;
/** A fold whose summary says what is inside it, so a closed one never hides the answer. */
const fold = (label, says, rows) =>
  `<details class="foldrow" id="whose"><summary><b>${esc(label)}</b><span class="says">${esc(says)}</span></summary><div class="checks">${rows}</div></details>`;
/** Ticking the whole grid is the grid's own action, so it sits with the grid. */
const bulkRow = `<div class="gbulk"><button class="btn small" type="button" data-act="tick-all">Everything, every look</button></div>`;

const kindTile = (k, on, extra = "", open = false) => {
  const basic = !open && (k.card ? E.cardTier() !== "full" : E.boardTier() !== "full");
  if (k.full && basic) return lockedTile(k.name, exampleOf(k, basic), "boards");
  return tile("g", k.key, k.name, exampleOf(k, basic), on, extra);
};

// Full is the sheet as it has always been, Phone the same sheet one column wide and read down the screen
const SIZES = [
  { key: "full", name: "Full", shape: `<rect x="1" y="3" width="20" height="13" rx="1.5"/>` },
  { key: "phone", name: "Phone", shape: `<rect x="6.5" y="1" width="9" height="16" rx="2"/>` },
  { key: "both", name: "Both", shape: `<rect x="1" y="5" width="12" height="9" rx="1"/><rect x="15" y="2" width="6" height="14" rx="1.5"/>` },
];
const sizeField = () => `<h2>Size</h2><div class="eseg gsize" role="group" aria-label="Size">${SIZES.map(z =>
  `<button type="button" data-act="size" data-size="${z.key}" class="${S.imageSize() === z.key ? "on" : ""}" aria-pressed="${S.imageSize() === z.key}"><svg viewBox="0 0 22 18" aria-hidden="true">${z.shape}</svg>${z.name}</button>`).join("")}</div>`;
const pickSize = b => {
  S.setImageChoice({ size: b.dataset.size });
  b.parentElement.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
};
/** One sheet in the sizes asked for, the phone one named `_phone`, so a Both pair sits side by side. */
const sized = (jobs, T, label, make) => {
  for (const [Tz, tag] of sizedLooks(T)) jobs.push({ label: sizedName(label, tag), make: () => make(Tz) });
};
const sizeCount = () => S.imageSize() === "both" ? 2 : 1;

const bindGrid = (grid, after = null) => grid && grid.addEventListener("change", ev => {
  const t = ev.target.closest(".gtile");
  if (t) t.classList.toggle("on", ev.target.checked);
  if (after) after();
});
const ticked = name => [...document.querySelectorAll(`input[name=${name}]:checked`)].map(i => i.value);
const tickAll = names => {
  document.querySelectorAll(names.map(n => `input[name=${n}]`).join(", ")).forEach(i => { i.checked = true; });
  document.querySelectorAll(".tchip, label.gtile").forEach(l => l.classList.add("on"));
  document.querySelectorAll(".lookfold, .foldrow").forEach(d => { d.open = true; });
};

/**
 * The bar says what the tap will make, and the fold says who is on it, so neither has to be counted or opened.
 * All three are re-read on every change anywhere in the page.
 */
function wireLive(count, whoseSays, whoseApplies) {
  const btn = app.querySelector("footer.bar [data-act=generate]");
  const whose = app.querySelector("#whose"), opts = app.querySelector("#opts"), says = app.querySelector("#whose .says");
  const paint = () => {
    const n = count();
    if (btn) btn.textContent = n ? `Generate ${plural(n, "image")}` : "Generate images";
    if (says) says.textContent = whoseSays();
    // the question only stands while the sheet it is about is ticked, and the card goes with it when it empties
    if (whose) whose.hidden = !whoseApplies();
    if (opts) opts.hidden = ![...opts.children].some(c => !c.hidden);
  };
  app.querySelector("main").addEventListener("change", paint);
  paint();
  return paint;
}

export function graphics(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  let M;
  try { M = compute(c, S.toModelRound(r)); } catch (err) { return page("Images", `<div class="banner warn">${esc(err.message)}</div>`, { back: `#review/${rid}` }); }
  const leagues = S.leaguesOfRound(rid);
  // a partner's round makes everything for everybody on it, in the partner's look and nothing else
  const brand = B.brandOfRound(rid), brandT = brand && B.brandTheme(brand);
  const themeLeague = leagues.find(leagueTheme);
  const boardTier = brand ? "full" : E.boardTier(), cardTier = brand ? "full" : E.cardTier();
  const offered = KINDS.filter(k => !B.kindsOf(brand) || B.kindsOf(brand).includes(k.key));
  // what was made last time on this phone, less anything the account no longer holds
  const saved = S.imageChoice();
  const can = k => !k.full || boardTier === "full";
  const kinds = offered.filter(k => can(k) && (saved.kinds || []).includes(k.key)).map(k => k.key);
  const picked = kinds.length ? kinds : [offered[0].key];
  const savedThemes = (saved.themes || []).filter(n => themeNamed(n) && E.canTheme(n));
  const themes = brandT ? [brandT.name] : themeLeague || !savedThemes.length ? [themeForRound(rid).name] : savedThemes;
  const missing = [...(boardTier === "full" ? [] : ["boards"]), ...(cardTier === "full" ? [] : ["card"])];
  const whose = () => { const n = ticked("card").length; return n === M.players.length ? "Everyone" : n ? `${n} of ${M.players.length}` : "Nobody"; };
  const body = `
    <h2>Which images</h2>
    <div class="ggrid">${offered.map(k => kindTile(k, picked.includes(k.key), k.card ? ` <small>${M.field}</small>` : "", !!brand)).join("")}</div>
    ${bulkRow}
    <div class="card checks gmore" id="opts">
      ${fold("Whose cards", whose(), M.players.map(p => `<label><input type="checkbox" name="card" value="${esc(p.name)}" checked> ${esc(p.name)}</label>`).join(""))}
      ${M.stats_on && cardTier === "full"
        ? `<label><input type="checkbox" name="cx" ${S.statsOnImages() ? "checked" : ""}> Putts, fairways and the rest on the cards <span class="muted">&nbsp;(${plural(M.players.filter(p => p.statline.any).length, "card")} kept them)</span></label>`
        : ""}
    </div>
    ${missing.length ? shopBtn("More images in the shop", missing) : ""}
    ${sizeField()}
    <h2>Look</h2>
    ${brand ? brandLook(brand, brandT || themeForRound(rid)) : themePicker(themes, themeLeague ? `${esc(themeLeague.name)} is set to ${esc(themeLeague.theme)}.` : "")}
    <div id="out"></div>`;
  page("Images", body, { back: `#review/${rid}`, bar: `<button class="btn primary" data-act="generate">Generate images</button>`, sub: r.name });
  let everything = false;   // "every look" is a one-off, not a choice to offer again on the next round
  const count = () => {
    const want = ticked("g"), looks = Math.max(ticked("theme").length, 1) * sizeCount();
    return looks * (want.filter(k => k !== "cards").length + (want.includes("cards") ? ticked("card").length : 0));
  };
  const paint = wireLive(count, whose, () => ticked("g").includes("cards"));
  bindGrid(app.querySelector(".ggrid"), () => S.setImageChoice({ kinds: ticked("g") }));
  bindLook(app.querySelector(".lookfold"));
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tick-all") {
      tickAll(["g", "theme"]);
      everything = true;
      S.setImageChoice({ kinds: ticked("g") });
      paint();
      return;
    }
    if (b.dataset.act === "size") { pickSize(b); paint(); return; }
    if (b.dataset.act !== "generate") return;
    const want = ticked("g");
    const chosen = brand ? themes : ticked("theme").filter(n => E.canTheme(n) || themes.includes(n));
    const cardNames = ticked("card");
    const cx = document.querySelector("input[name=cx]");
    const cardOpts = { extras: !!(cx && cx.checked) };
    if (cx) S.setStatsOnImages(cardOpts.extras);
    if (!want.length) return toast("Tick at least one image");
    if (want.includes("cards") && !cardNames.length) return toast("Pick at least one card under Whose cards");
    if (!chosen.length) return toast("Pick at least one look");
    S.setImageChoice(everything || themeLeague || brand ? { kinds: want } : { kinds: want, themes: chosen });
    const jobs = [];
    for (const tn of chosen) {
      const prefix = chosen.length > 1 ? `${tn}/` : "";
      const tier = boardTier;
      const T = makeTheme(themeNamed(tn));
      const add = (label, make) => sized(jobs, T, `${prefix}${label}`, make);
      if (want.includes("gross")) add("1_leaderboard_gross.png", Tz => grossLeaderboard(M, Tz, tier));
      if (want.includes("stbl")) add("2_leaderboard_stableford.png", Tz => stablefordLeaderboard(M, Tz, tier));
      if (want.includes("holes") && tier === "full") add("3_holes.png", Tz => holesPoster(M, Tz));
      if (want.includes("both") && tier === "full") add("4_leaderboard_both.png", Tz => bothBoards(M, Tz));
      if (want.includes("cards")) for (const p of M.players.filter(p => cardNames.includes(p.name))) add(renderCards(M, T, [p.name], cardTier, cardOpts)[0].file, Tz => renderCards(M, Tz, [p.name], cardTier, cardOpts)[0].fig);
    }
    await B.withBrand(brand, r.date, () => runJobs(jobs, slugFile(r.name)));
  });
}

/** In a partner's round the look is the partner's: one fixed row instead of the picker, saying whose. */
const brandLook = (b, t) => `<div class="card brandlook"><input type="checkbox" name="theme" value="${esc(t.name)}" checked hidden>
  <span class="fstrip"><i style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT}"></i></span>
  <div><div class="name">${esc(b.name)}</div><div class="muted small">This round wears ${esc(b.name)}'s look, so every board and card is made in full for everyone on it.</div></div></div>`;

/**
 * A league's images: its standings first, then the season's sheets. One screen, because both are the same
 * question -- what do I post about this league -- and splitting them meant knowing the answer before asking.
 * Without the season pack the sheets are still tiles of what they would be, which open the shop.
 */
export function leagueImages(gid) {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const { Ms, members } = leagueResults(g);
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return page("Images", `<p class="muted center" style="margin:30px 0">No finished rounds in this society yet.</p>`, { back: `#league/${gid}`, sub: g.name });
  const formats = S.cleanFormats(g.formats);
  const N = ninesForPoster(leagueRounds(gid), members);
  const anyX = St.field.statline.any;
  const brand = B.brandOfLeague(g), brandT = brand && B.brandTheme(brand);
  const season = brand || E.seasonAllowed();
  const sheets = SHEETS.filter(k => (k.key !== "nines" || N.length) && (k.key !== "extras" || anyX));
  const extraOf = { field: plural(St.field.cards, "card"), nines: plural(N.length, "loop"),
    extras: `${plural(St.players.filter(p => p.statline.any).length, "player")} keep them`, players: plural(St.players.length, "player") };
  const who = St.players.some(p => p.id === ui.statsWho[gid]) ? ui.statsWho[gid] : "";
  const themes = [(brandT || themeFor(g)).name];
  // the tiles are one list under one name, so what was picked last time is one list to remember
  const here = [...formats.map(f => `standings:${f}`), ...(season ? sheets.map(k => `stats:${k.key}`) : [])];
  const saved = (S.imageChoice().league || []).filter(v => here.includes(v));
  const picked = saved.length ? saved
    : [...formats.map(f => `standings:${f}`), ...(season ? ["stats:field", ...(who ? ["stats:players"] : [])] : [])];
  const whose = () => { const n = ticked("sp").length; return n === St.players.length ? "Everyone" : n ? `${n} of ${St.players.length}` : "Nobody"; };
  page("Images", `
    <h2>Which images</h2>
    <div class="ggrid">
      ${formats.map(f => tile("gi", `standings:${f}`, FORMAT_NAMES[f], `st-${f}`, picked.includes(`standings:${f}`))).join("")}
      ${sheets.map(k => season ? tile("gi", `stats:${k.key}`, k.name, `sf-${k.key === "players" ? "player" : k.key}`, picked.includes(`stats:${k.key}`), ` <small>${extraOf[k.key]}</small>`)
        : lockedTile(k.name, `sf-${k.key === "players" ? "player" : k.key}`, "season")).join("")}
    </div>
    ${season ? `${bulkRow}<div class="card checks gmore" id="opts">
      ${fold("Whose sheets", whose(), St.players.map(p => `<label><input type="checkbox" name="sp" value="${esc(p.id)}" ${!who || p.id === who ? "checked" : ""}> ${esc(p.name)} <span class="muted">&nbsp;(${plural(p.played, "round")})</span></label>`).join(""))}
      ${anyX ? `<label><input type="checkbox" name="sx" ${S.statsOnImages() ? "checked" : ""}> Put the extras on the sheets too <span class="muted">&nbsp;(a band at the foot, never in the headline figures)</span></label>` : ""}
    </div>` : `<p class="muted small gsays">The season pack makes the sheets above: how the society scores, the nines walked, and one image a player.</p>
      ${shopBtn("See what the season pack makes", "season")}`}
    ${sizeField()}
    <h2>Look</h2>
    ${brand ? brandLook(brand, brandT || themeFor(g)) : themePicker(themes, leagueTheme(g) ? `${esc(g.name)} is set to ${esc(g.theme)}.` : "")}
    <div id="out"></div>`,
    { back: `#league/${gid}`, sub: g.name, bar: `<button class="btn primary" data-act="generate">Generate images</button>` });
  const count = () => {
    const want = ticked("gi"), looks = Math.max(ticked("theme").length, 1) * sizeCount();
    return looks * (want.filter(v => v !== "stats:players").length + (want.includes("stats:players") ? ticked("sp").length : 0));
  };
  const paint = wireLive(count, whose, () => ticked("gi").includes("stats:players"));
  bindGrid(app.querySelector(".ggrid"), () => S.setImageChoice({ league: ticked("gi") }));
  bindLook(app.querySelector(".lookfold"));
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "tick-all") { tickAll(["gi", "sp", "theme"]); S.setImageChoice({ league: ticked("gi") }); paint(); return; }
    if (b.dataset.act === "size") { pickSize(b); paint(); return; }
    if (b.dataset.act !== "generate") return;
    const want = ticked("gi");
    const pids = want.includes("stats:players") ? ticked("sp") : [];
    const chosen = brand ? themes : ticked("theme").filter(n => E.canTheme(n) || themes.includes(n));
    const sx = document.querySelector("input[name=sx]");
    const opts = { extras: !!(sx && sx.checked) };
    if (sx) S.setStatsOnImages(opts.extras);
    if (!want.length) return toast("Tick at least one image");
    if (want.includes("stats:players") && !pids.length) return toast("Pick at least one player under Whose sheets");
    if (!chosen.length) return toast("Pick at least one look");
    const jobs = [];
    for (const tn of chosen) {
      const prefix = chosen.length > 1 ? `${tn}/` : "";
      const T0 = makeTheme(themeNamed(tn));
      const add = (label, make) => sized(jobs, T0, `${prefix}${label}`, make);
      formats.filter(f => want.includes(`standings:${f}`)).forEach((f, k) =>
        add(`${4 + k}_standings_${f}.png`, T => standingsPoster(standingsFor(g, Ms, members, f), g, T, f)));
      if (want.includes("stats:field")) add("6_stats_field.png", T => statsFieldPoster(St, g, T, opts));
      if (want.includes("stats:nines")) add("7_stats_nines.png", T => statsNinesPoster(N, g, T));
      if (want.includes("stats:extras")) add("9_stats_extras.png", T => statsExtrasPoster(St, g, T));
      for (const pid of pids) { const p = St.players.find(x => x.id === pid); if (p) add(`8_stats_${slugFile(p.name)}.png`, T => statsPlayerPoster(St, p, g, T, opts)); }
    }
    await B.withBrand(brand, null, () => runJobs(jobs, slugFile(g.name)));
  });
}
