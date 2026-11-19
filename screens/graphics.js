// The images: a round's boards and cards, and a league's standings and season sheets. Two screens, one shape --
// tiles of what each sheet looks like, a fold that says who is on them, the size and look folded to one row,
// and a button that says how many images the tap will make. Each opens on whatever the door it came from was
// showing; the one-tap doors themselves are in images.js.
import * as S from "../store.js";
import * as B from "../brand.js";
import { page, bind, esc, go, toast, plural, courseBy, noCourse, themePicker, bindLook, themeNamed, darkNow, themeForRound, themeFor, leagueTheme, leagueLookName, lookTitle, runJobs, makeTheme, sizedLooks, app, ICONS, ui } from "../ui.js";
import { compute, leagueStats } from "../model.js";
import { standingsPoster } from "../posters.js";
import { statsFieldPoster, statsNinesPoster, statsPlayerPoster, statsExtrasPoster } from "../statsposters.js";
import { renderCards } from "../cards.js";
import { BRAND_STYLES, dayOutSheet, personalSheet, leagueSheet } from "../brandsheets.js";
import { FORMAT_NAMES, leagueResults, standingsFor, shownSeason } from "./formats.js";
import { ninesForPoster, leagueRounds } from "./stats.js";
import { ROUND_IMAGES, roundKinds, roundDefault } from "../images.js";

// The season's sheets, in the order they are made. `nines` and `extras` are only there when there is something
// for them to say, so the key, not the position, is what everything else goes by.
const SHEETS = [
  { key: "field", name: "How this society scores" },
  { key: "nines", name: "The nines walked" },
  { key: "extras", name: "Putts, fairways and the rest" },
  { key: "players", name: "One image a player" },
];

// Each tile shows an example of its image, drawn on the showcase round and league by app/tests/examples.mjs.
const exImg = file => `<span class="gimg"><img src="img/examples/${file}.webp" alt="" width="400" height="200" loading="lazy" decoding="async"></span>`;

/** One tickable tile: an example of the image, what it is called, and the tick in the corner. */
const tile = (name, value, label, file, on, extra = "") =>
  `<label class="gtile ${on ? "on" : ""}"><input type="checkbox" name="${name}" value="${esc(value)}" ${on ? "checked" : ""}>${exImg(file)}<span class="gname">${esc(label)}${extra}</span><span class="gcheck" aria-hidden="true">${ICONS.check}</span></label>`;
/** A fold whose summary says what is inside it, so a closed one never hides the answer. */
const fold = (id, label, says, rows) =>
  `<details class="foldrow" id="${id}"><summary><b>${esc(label)}</b><span class="says">${esc(says)}</span></summary><div class="checks">${rows}</div></details>`;

// Full is the sheet as it has always been, Phone the same sheet one column wide and read down the screen
const SIZES = [
  { key: "full", name: "Full", shape: `<rect x="1" y="3" width="20" height="13" rx="1.5"/>` },
  { key: "phone", name: "Phone", shape: `<rect x="6.5" y="1" width="9" height="16" rx="2"/>` },
  { key: "both", name: "Both", shape: `<rect x="1" y="5" width="12" height="9" rx="1"/><rect x="15" y="2" width="6" height="14" rx="1.5"/>` },
];
const sizeField = () => `<div class="optfield"><span class="optlab">Size</span><div class="eseg gsize" role="group" aria-label="Size">${SIZES.map(z =>
  `<button type="button" data-act="size" data-size="${z.key}" class="${S.imageSize() === z.key ? "on" : ""}" aria-pressed="${S.imageSize() === z.key}"><svg viewBox="0 0 22 18" aria-hidden="true">${z.shape}</svg>${z.name}</button>`).join("")}</div></div>`;
const pickSize = b => {
  S.setImageChoice({ size: b.dataset.size });
  b.parentElement.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
};
const sizeCount = () => S.imageSize() === "both" ? 2 : 1;
// Light, dark or both, for this session: until one is picked, the version the phone is in now
let imgMode = null;
const modeNow = () => imgMode || (darkNow() ? "dark" : "light");
const modeField = () => `<div class="optfield"><span class="optlab">Light or dark</span><div class="eseg gsize" role="group" aria-label="Light or dark">${[["light", "Light"], ["dark", "Dark"], ["both", "Both"]].map(([k, l]) =>
  `<button type="button" data-act="imode" data-m="${k}" class="${modeNow() === k ? "on" : ""}" aria-pressed="${modeNow() === k}">${l}</button>`).join("")}</div></div>`;
const pickMode = b => {
  imgMode = b.dataset.m;
  b.parentElement.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
};
const modeCount = () => modeNow() === "both" ? 2 : 1;
/** A look in each version asked for, with the word its files carry. */
const versionsOf = tn => (modeNow() === "both" ? [false, true] : [modeNow() === "dark"]).map(d => [makeTheme(themeNamed(tn, d)), modeNow() === "both" && d ? "dark" : ""]);

/** Size, light or dark, and the look: one row that says what they are set to, open only to change them. */
const SIZE_WORD = { full: "full size", phone: "phone size", both: "full and phone" };
const MODE_WORD = { light: "light", dark: "dark", both: "light and dark" };
const optsSays = brand => {
  const looks = ticked("theme").map(n => themeNamed(n)).filter(Boolean);
  return [looks.length === 1 ? lookTitle(looks[0]) : looks.length ? plural(looks.length, "look") : "no look", brand ? "" : MODE_WORD[modeNow()], SIZE_WORD[S.imageSize()]].filter(Boolean).join(" · ");
};
const optsFold = (brand, look) => `<details class="foldrow optsfold" id="lookopts"><summary><b>Size and look</b><span class="says"></span></summary>
  <div class="opts">${sizeField()}${brand ? "" : modeField()}<span class="optlab">Look</span>${look}</div></details>`;

const bindGrid = (grid, after = null) => grid && grid.addEventListener("change", ev => {
  const t = ev.target.closest(".gtile");
  if (t) t.classList.toggle("on", ev.target.checked);
  if (after) after();
});
const ticked = name => [...document.querySelectorAll(`input[name=${name}]:checked`)].map(i => i.value);

/**
 * The bar says what the tap will make, and the folds say who is on it and how it will look, so nothing has to be
 * counted or opened. All of it is re-read on every change anywhere in the page.
 */
function wireLive(count, whoseSays, whoseApplies, brand) {
  const btn = app.querySelector("footer.bar [data-act=generate]");
  const whose = app.querySelector("#whose"), opts = app.querySelector("#opts"), says = app.querySelector("#whose .says");
  const look = app.querySelector("#lookopts .says");
  const paint = () => {
    const n = count();
    if (btn) btn.textContent = n ? `Make ${plural(n, "image")}` : "Make images";
    if (says) says.textContent = whoseSays();
    if (look) look.textContent = optsSays(brand);
    // the question only stands while the sheet it is about is ticked, and the card goes with it when it empties
    if (whose) whose.hidden = !whoseApplies();
    if (opts) opts.hidden = ![...opts.children].some(c => !c.hidden);
  };
  app.querySelector("main").addEventListener("change", paint);
  paint();
  return paint;
}

/**
 * Every job for one image in every look, version and size asked for. `name` is what a person calls the image;
 * the look, "dark" and "phone" are added to it only when there is more than one of them to tell apart.
 */
function adder(jobs, title, looks) {
  return (name, make) => {
    for (const { T, look, dark } of looks) for (const [Tz, tag] of sizedLooks(T)) {
      const parts = [name, look, dark, tag ? "phone" : ""].filter(Boolean);
      jobs.push({ label: parts.join(" · "), file: `${title} - ${parts.join(" - ")}.png`.replace(/[\\/:*?"<>|]+/g, "-"), make: () => make(Tz) });
    }
  };
}
const looksOf = (chosen, brand) => chosen.flatMap(tn => (brand ? [[makeTheme(themeNamed(tn)), ""]] : versionsOf(tn))
  .map(([T, dark]) => ({ T, dark, look: chosen.length > 1 ? lookTitle(themeNamed(tn)) : "" })));

export function graphics(rid, want = "") {
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
  const offered = roundKinds(M, brand).map(k => k === "cards" ? { key: k, name: "Player cards", card: true } : { key: k, name: ROUND_IMAGES[k].name });
  const bsHere = brand ? ["dayout", "personal"].flatMap(kind => BRAND_STYLES[kind].map(s => `bs:${kind}:${s.key}`)) : [];
  const here = [...offered.map(k => k.key), ...bsHere];
  // the image the door was showing; otherwise what was made last time on this phone, as far as this card has it
  const saved = (S.imageChoice().kinds || []).filter(v => here.includes(v));
  const picked = here.includes(want) ? [want] : saved.length ? saved : brand ? [`bs:dayout:${styleOf(brand, "dayout")}`] : [roundDefault(M, r)];
  const savedThemes = (S.imageChoice().themes || []).filter(n => themeNamed(n));
  const themes = brand ? [(brandT || themeForRound(rid)).name] : themeLeague || !savedThemes.length ? [themeForRound(rid).name] : savedThemes;
  const whose = () => { const n = ticked("card").length; return n === M.players.length ? "Everyone" : n ? `${n} of ${M.players.length}` : "Nobody"; };
  const look = brand ? brandLook(brand, brandT || themeForRound(rid)) : themePicker(themes, themeLeague ? `${esc(themeLeague.name)} is set to ${esc(leagueLookName(themeLeague))}.` : "");
  const body = `
    ${brand ? `<h2>${esc(brand.name)}'s own</h2><p class="muted small gsays">Few words, the logo at the centre.</p>
      <div class="ggrid">${brandTiles(brand, "g", ["dayout", "personal"], picked, { personal: ` <small>${M.field}</small>` })}</div><h2>Every board and card</h2>` : `<h2>Which images</h2>`}
    <div class="ggrid">${offered.map(k => tile("g", k.key, k.name, k.key, picked.includes(k.key), k.card ? ` <small>${M.field}</small>` : "")).join("")}</div>
    <div class="card checks gmore" id="opts">
      ${fold("whose", "Whose cards", whose(), M.players.map(p => `<label><input type="checkbox" name="card" value="${esc(p.name)}" checked> ${esc(p.name)}</label>`).join(""))}
      ${M.stats_on
        ? `<label><input type="checkbox" name="cx" ${S.statsOnImages() ? "checked" : ""}> Putts, fairways and the rest on the cards <span class="muted">&nbsp;(${plural(M.players.filter(p => p.statline.any).length, "card")} kept them)</span></label>`
        : ""}
    </div>
    ${optsFold(brand, look)}
    <div id="out"></div>`;
  page("Images", body, { back: `#review/${rid}`, bar: `<button class="btn primary" data-act="generate">Make images</button>`, sub: r.name });
  const count = () => {
    const want = ticked("g"), looks = Math.max(ticked("theme").length, 1) * sizeCount() * (brand ? 1 : modeCount());
    const perCard = k => k === "cards" || k.startsWith("bs:personal:");
    return looks * (want.filter(k => !perCard(k)).length + want.filter(perCard).length * ticked("card").length);
  };
  const cardsWanted = () => ticked("g").some(k => k === "cards" || k.startsWith("bs:personal:"));
  const paint = wireLive(count, whose, cardsWanted, brand);
  app.querySelectorAll(".ggrid").forEach(gr => bindGrid(gr, () => S.setImageChoice({ kinds: ticked("g") })));
  bindLook(app.querySelector(".lookfold"), paint);
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "size") { pickSize(b); paint(); return; }
    if (b.dataset.act === "imode") { pickMode(b); paint(); return; }
    if (b.dataset.act !== "generate") return;
    const want = ticked("g");
    const chosen = brand ? themes : ticked("theme");
    const cardNames = ticked("card");
    const cx = document.querySelector("input[name=cx]");
    const cardOpts = { extras: !!(cx && cx.checked) };
    if (cx) S.setStatsOnImages(cardOpts.extras);
    if (!want.length) return toast("Tick at least one image");
    if (cardsWanted() && !cardNames.length) return toast("Pick at least one card under Whose cards");
    if (!chosen.length) return toast("Pick at least one look");
    S.setImageChoice(themeLeague || brand ? { kinds: want } : { kinds: want, themes: chosen });
    const jobs = [];
    const add = adder(jobs, r.name, looksOf(chosen, brand));
    for (const k of offered.map(o => o.key).filter(k => k !== "cards" && want.includes(k))) add(ROUND_IMAGES[k].name, Tz => ROUND_IMAGES[k].make(M, Tz));
    if (want.includes("cards")) for (const p of M.players.filter(p => cardNames.includes(p.name))) add(p.name, Tz => renderCards(M, Tz, [p.name], cardOpts)[0].fig);
    for (const { kind, style } of bsOf(want)) {
      const sname = BRAND_STYLES[kind].find(s => s.key === style).name;
      if (kind === "dayout") add(`${BS_NAMES.dayout} (${sname})`, Tz => dayOutSheet(M, Tz, style));
      if (kind === "personal") M.players.filter(p => cardNames.includes(p.name)).forEach(p => add(`${p.name} (${sname})`, Tz => personalSheet(M, p.name, Tz, style)));
    }
    await B.withBrand(brand, r.date, () => runJobs(jobs));
  });
}

// A partner's own sheets, few words and its logo at the centre: one tile a style, named "bs:<kind>:<style>".
const BS_NAMES = { dayout: "Day out board", personal: "Personal card", league: "Society table" };
const styleOf = (b, kind) => { const s = b && b.template && b.template.styles && b.template.styles[kind]; return BRAND_STYLES[kind].some(x => x.key === s) ? s : BRAND_STYLES[kind][0].key; };
const brandTiles = (b, name, kinds, picked, extra = {}) => kinds.flatMap(kind => BRAND_STYLES[kind].map(s => {
  const v = `bs:${kind}:${s.key}`;
  return tile(name, v, `${BS_NAMES[kind]} · ${s.name}`, `bs-${kind}-${s.key}-${b.kind === "company" ? "company" : "course"}`, picked.includes(v), extra[kind] || "");
})).join("");
const bsOf = want => want.filter(v => v.startsWith("bs:")).map(v => { const [, kind, style] = v.split(":"); return { kind, style }; });

/** In a partner's round the look is the partner's: one fixed row instead of the picker, saying whose. */
const brandLook = (b, t) => `<div class="card brandlook"><input type="checkbox" name="theme" value="${esc(t.name)}" checked hidden>
  <span class="fstrip"><i style="--tbg:${t.BG};--tpanel:${t.PANEL};--tacc:${t.ACCENT}"></i></span>
  <div><div class="name">${esc(b.name)}</div><div class="muted small">This round wears ${esc(b.name)}'s look.</div></div></div>`;

/**
 * A league's images: its standings first, then the season's sheets. One screen, because both are the same
 * question -- what do I post about this league -- and splitting them meant knowing the answer before asking.
 */
export function leagueImages(gid, want = "") {
  const g = S.getLeague(gid);
  if (!g) return go("#leagues");
  const { Ms, members } = leagueResults(g, shownSeason(g));
  const St = leagueStats(Ms, members);
  if (!St.rounds.length) return page("Images", `<p class="muted center" style="margin:30px 0">No finished rounds in this society yet.</p>`, { back: `#league/${gid}`, sub: g.name });
  const formats = S.cleanFormats(g.formats);
  const N = ninesForPoster(leagueRounds(gid), members);
  const anyX = St.field.statline.any;
  const brand = B.brandOfLeague(g), brandT = brand && B.brandTheme(brand);
  const sheets = SHEETS.filter(k => (k.key !== "nines" || N.length) && (k.key !== "extras" || anyX));
  const extraOf = { field: plural(St.field.cards, "card"), nines: plural(N.length, "loop"),
    extras: `${plural(St.players.filter(p => p.statline.any).length, "player")} keep them`, players: plural(St.players.length, "player") };
  const who = St.players.some(p => p.id === ui.statsWho[gid]) ? ui.statsWho[gid] : "";
  const themes = [(brandT || themeFor(g)).name];
  // the tiles are one list under one name, so what was picked last time is one list to remember
  const bsHere = brand ? BRAND_STYLES.league.map(s => `bs:league:${s.key}`) : [];
  const here = [...bsHere, ...formats.map(f => `standings:${f}`), ...sheets.map(k => `stats:${k.key}`)];
  const saved = (S.imageChoice().league || []).filter(v => here.includes(v));
  // the door's own image first; with no door, the table the society plays on, never every table at once
  const picked = here.includes(want) ? [want] : saved.length ? saved : brand ? [`bs:league:${styleOf(brand, "league")}`]
    : [`standings:${formats[0]}`, ...(who ? ["stats:players"] : [])];
  const whose = () => { const n = ticked("sp").length; return n === St.players.length ? "Everyone" : n ? `${n} of ${St.players.length}` : "Nobody"; };
  const look = brand ? brandLook(brand, brandT || themeFor(g)) : themePicker(themes, leagueTheme(g) ? `${esc(g.name)} is set to ${esc(leagueLookName(g))}.` : "");
  page("Images", `
    <h2>Which images</h2>
    ${brand ? `<p class="muted small gsays">${esc(brand.name)}'s own: few words, the logo at the centre${formats.length > 1 ? `, one for each way the society is scored` : ""}.</p>
      <div class="ggrid">${brandTiles(brand, "gi", ["league"], picked)}</div><h2>Every sheet</h2>` : ""}
    <div class="ggrid">
      ${formats.map(f => tile("gi", `standings:${f}`, FORMAT_NAMES[f], `st-${f}`, picked.includes(`standings:${f}`))).join("")}
      ${sheets.map(k => tile("gi", `stats:${k.key}`, k.name, `sf-${k.key === "players" ? "player" : k.key}`, picked.includes(`stats:${k.key}`), ` <small>${extraOf[k.key]}</small>`)).join("")}
    </div>
    <div class="card checks gmore" id="opts">
      ${fold("whose", "Whose sheets", whose(), St.players.map(p => `<label><input type="checkbox" name="sp" value="${esc(p.id)}" ${!who || p.id === who ? "checked" : ""}> ${esc(p.name)} <span class="muted">&nbsp;(${plural(p.played, "round")})</span></label>`).join(""))}
      ${anyX ? `<label><input type="checkbox" name="sx" ${S.statsOnImages() ? "checked" : ""}> Put the extras on the sheets too <span class="muted">&nbsp;(a band at the foot, never in the headline figures)</span></label>` : ""}
    </div>
    ${optsFold(brand, look)}
    <div id="out"></div>`,
    { back: `#league/${gid}`, sub: g.name, bar: `<button class="btn primary" data-act="generate">Make images</button>` });
  const count = () => {
    const want = ticked("gi"), looks = Math.max(ticked("theme").length, 1) * sizeCount() * (brand ? 1 : modeCount());
    return looks * (want.filter(v => v !== "stats:players" && !v.startsWith("bs:")).length + bsOf(want).length * formats.length + (want.includes("stats:players") ? ticked("sp").length : 0));
  };
  const paint = wireLive(count, whose, () => ticked("gi").includes("stats:players"), brand);
  app.querySelectorAll(".ggrid").forEach(gr => bindGrid(gr, () => S.setImageChoice({ league: ticked("gi") })));
  bindLook(app.querySelector(".lookfold"), paint);
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "size") { pickSize(b); paint(); return; }
    if (b.dataset.act === "imode") { pickMode(b); paint(); return; }
    if (b.dataset.act !== "generate") return;
    const want = ticked("gi");
    const pids = want.includes("stats:players") ? ticked("sp") : [];
    const chosen = brand ? themes : ticked("theme");
    const sx = document.querySelector("input[name=sx]");
    const opts = { extras: !!(sx && sx.checked) };
    if (sx) S.setStatsOnImages(opts.extras);
    if (!want.length) return toast("Tick at least one image");
    if (want.includes("stats:players") && !pids.length) return toast("Pick at least one player under Whose sheets");
    if (!chosen.length) return toast("Pick at least one look");
    const jobs = [];
    const add = adder(jobs, g.name, looksOf(chosen, brand));
    for (const { style } of bsOf(want)) formats.forEach(f => add(`${BS_NAMES.league} (${BRAND_STYLES.league.find(s => s.key === style).name}, ${FORMAT_NAMES[f]})`, T => leagueSheet(standingsFor(g, Ms, members, f), g, T, f, style)));
    formats.filter(f => want.includes(`standings:${f}`)).forEach(f => add(`Table, ${FORMAT_NAMES[f]}`, T => standingsPoster(standingsFor(g, Ms, members, f), g, T, f)));
    if (want.includes("stats:field")) add("How this society scores", T => statsFieldPoster(St, g, T, opts));
    if (want.includes("stats:nines")) add("The nines walked", T => statsNinesPoster(N, g, T));
    if (want.includes("stats:extras")) add("Putts, fairways and the rest", T => statsExtrasPoster(St, g, T));
    for (const pid of pids) { const p = St.players.find(x => x.id === pid); if (p) add(p.name, T => statsPlayerPoster(St, p, g, T, opts)); }
    await B.withBrand(brand, null, () => runJobs(jobs));
  });
}
