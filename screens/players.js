// Who is playing: the card's rows, each with the two things that change from round to round, and the people to
// add -- friends first (their row is theirs at once), then everybody typed in before, then someone new.
import * as S from "../store.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, plural, andList, firstName, courseTitle, courseBy, noCourse, h2tip, tip, parseHI, hiOk, confirmSheet, promptSheet, avatar, sheet, teeColor, ui } from "../ui.js";
import { handicapFor, fmtHcp, fmtIndex, STAT_SWITCHES } from "../model.js";

/** Giving up on a round: it is thrown away everywhere. A finished one is deleted by whoever was on it. */
export function dropBtn(r) {
  if (r.status === "done" && !S.iPlayed(r)) return "";
  return `<p class="center" style="margin-top:18px"><button class="btn small danger" data-act="drop-round" data-rid="${r.id}">${r.status === "done" ? "Delete this round" : "Discard this round"}</button></p>`;
}

export async function dropRound(rid) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const scored = r.entries.reduce((n, e) => n + e.scores.filter(v => v !== null).length, 0);
  const yes = await confirmSheet(r.status === "done" ? "Delete this round?" : "Discard this round?",
    `${r.name} goes from every phone${scored ? `, with ${plural(scored, "score")} in it` : ""}. This cannot be undone.`, { label: r.status === "done" ? "Delete" : "Discard", danger: true });
  if (!yes) return;
  S.deleteRound(r.id);
  toast(`${r.name} deleted`);
  go("#play");
}

export function players(rid, keep = false) {
  const r = S.getRound(rid);
  if (!r) return go("#play");
  const c = courseBy(r.course);
  if (!c) return noCourse(r);
  const tees = Object.keys(c.tees);
  const inRound = new Set(r.entries.map(e => e.playerId));
  const me = S.me();
  const friends = F.held().friends;
  const linkedIds = new Set(S.players().map(p => p.linkedAccount).filter(Boolean));
  const inRoundAccounts = new Set(r.entries.map(e => S.identityOf(e.playerId)));
  // friends who are not yet a contact of mine, or whose contact is not on the card
  const friendChips = friends.filter(f => !inRoundAccounts.has(f.id) && f.id !== A.account()?.id);
  const roster = S.players().filter(p => !inRound.has(p.id) && !friends.some(f => f.id === p.linkedAccount && !inRoundAccounts.has(f.id))).sort((a, b) => a.name.localeCompare(b.name));
  const showGroups = r.entries.length > 4 || r.entries.some(e => (e.group || 1) > 1);
  const kinds = S.statsFor(rid), statsOn = S.anyStatsOn(rid);
  // every row the same shape: one tile a field, each with its label over a control of the same height, so a
  // card reads down a column instead of across a line of boxes that are all a different size
  const field = (label, control, wide = false) => `<div class="efield${wide ? " wide" : ""}"><span class="flab">${label}</span>${control}</div>`;
  const rows = r.entries.map((e, i) => {
    let hc = "", missing = false;
    const ov = e.courseHandicap ?? S.getPch(e.playerId, r.course, e.tee);
    const hasOv = ov !== null && ov !== undefined;
    try { const h = handicapFor(c, { ...e, courseHandicap: ov }, r.defaultTee, r.allowance); hc = `course hcp ${fmtHcp(h.ch)}`; }
    catch (err) { hc = `<span class="warn">${esc(err.message)}</span>`; missing = true; }
    const isMe = me && e.playerId === me.id;
    // the handicap pair, then the tee, then the rest; an odd one left over takes the whole line rather than
    // sitting beside a hole in the grid
    const hcp = [
      ["Index", `<input class="efv hi" data-act="hi" data-i="${i}" inputmode="decimal" value="${esc(fmtIndex(Number(e.hi)))}" aria-label="Handicap index">`],
      ...(missing || hasOv ? [["Course hcp", `<input class="efv" data-act="pch" data-i="${i}" inputmode="numeric" value="${hasOv ? ov : ""}" placeholder="club table" aria-label="Course handicap from the club table">`]] : []),
    ];
    const rest = [
      ["Starts at", `<select class="efv" data-act="from" data-i="${i}" aria-label="Starts at hole">${c.par.map((_, k) => `<option value="${k + 1}" ${(e.fromHole || 1) === k + 1 ? "selected" : ""}>Hole ${c.first_hole + k}</option>`).join("")}</select>`],
      ...(showGroups ? [["Group", `<div class="eseg">${[1, 2, 3, 4].map(g => `<button data-act="grp" data-i="${i}" data-g="${g}" class="${(e.group || 1) === g ? "on" : ""}">${g}</button>`).join("")}</div>`]] : []),
      ...(statsOn ? [["Extras", `<div class="eseg"><button data-act="trk" data-i="${i}" class="${e.trackStats ? "on" : ""}">${e.trackStats ? "keeping" : "not kept"}</button></div>`]] : []),
    ];
    const pair = fs => fs.map(([l, ctl], k) => field(l, ctl, fs.length % 2 === 1 && k === fs.length - 1)).join("");
    // the tee is a colour on the ground, so it is picked as that colour and not read off a list of words
    const teePick = field(`Tee · ${esc(e.tee)}`, `<div class="tees">${tees.map(t => `<button class="tee ${t === e.tee ? "on" : ""}" style="--c:${teeColor(t)}" data-act="tee" data-i="${i}" data-t="${esc(t)}" aria-label="${esc(t)} tee" aria-pressed="${t === e.tee}"><i></i></button>`).join("")}</div>`, true);
    const fields = pair(hcp) + teePick + pair(rest);
    return `<div class="card entry"><div class="row"><div><div class="name">${esc(e.name)}${isMe ? ` <span class="pill done">you</span>` : ""}</div><div class="muted small">${e.gender === "f" ? "women's" : "men's"} rating · ${hc}${hasOv ? " (club table)" : ""}</div></div>
        <button class="x" data-act="remove-entry" data-i="${i}" aria-label="Remove">×</button></div>
      <div class="efields">${fields}</div></div>`;
  }).join("");
  const chip = (act, id, name, sub, on = false) => `<button class="pchip ${on ? "on" : ""}" data-act="${act}" data-id="${esc(id)}"><span><span class="plus">+</span>${esc(name)}</span><small>${esc(sub)}</small></button>`;
  const body = `
    <h2>Before you start</h2>
    ${statsPicker(rid, kinds, r)}
    ${h2tip(`${plural(r.entries.length, "player")} on this card`, `<p>Each player's handicap index is turned into a course handicap for the tee they are standing on: the index is stretched by this course's slope and shifted by its rating, so the same index gives more strokes off a harder tee.</p>
      <p>Index and tee are asked again every round, filled in with what that player last used, because both change. Type over either one and the course handicap follows.</p>
      <p>If the club's own table gives a different number, put it in the course handicap box and that is what counts; it is remembered for this course and tee.</p>`)}
    ${rows || `<p class="muted small">Nobody yet. Tap names below to add them.</p>`}
    ${me && !inRound.has(me.id) ? `<h2>You</h2><div class="chips-wrap">${chip("add-roster", me.id, me.name, S.currentIndex(me) !== null && S.currentIndex(me) !== undefined ? `index ${fmtIndex(Number(S.currentIndex(me)))}` : "add your index", true)}</div>` : ""}
    ${friendChips.length ? `<h2>Friends</h2><div class="chips-wrap">${friendChips.map(f => chip("add-friend", f.id, f.name, f.hi !== null && f.hi !== undefined ? `index ${fmtIndex(Number(f.hi))}` : "no index yet")).join("")}</div>` : ""}
    ${roster.filter(p => !me || p.id !== me.id).length ? `<h2>Played with before</h2><div class="chips-wrap">${roster.filter(p => !me || p.id !== me.id).map(p => chip("add-roster", p.id, p.name, p.hi !== null && p.hi !== undefined ? `index ${fmtIndex(Number(p.hi))}` : "no index yet")).join("")}</div>` : ""}
    <form id="addf" class="card form ${roster.length || r.entries.length || friendChips.length ? "" : "open"}">
      <h2>Someone new</h2>
      <label>Name<input id="pname" autocomplete="off" autocapitalize="words" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
      <div class="two">
        <label>Handicap index<input id="phi" inputmode="decimal" placeholder="18,4 or +2.1" required></label>
        <label>Tee<select id="ptee">${tees.map(t => `<option ${t === r.defaultTee ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <div class="two">
        <label>Rating<select id="pgender"><option value="m">Men's</option><option value="f">Women's</option></select></label>
        <label>Course hcp <span class="muted">(optional)</span><input id="pch" inputmode="numeric" placeholder="from club table"></label></div>
      <button class="btn primary" type="submit">Add player</button>
    </form>
    <button class="btn addbtn ${roster.length || r.entries.length || friendChips.length ? "" : "hidden"}" data-act="toggle-add"><span class="plus">+</span> Someone new</button>
    ${dropBtn(r)}`;
  const bar = !r.entries.length ? `<button class="btn" disabled>Add players to start</button>`
    : r.status === "done" ? `<a class="btn primary" href="#review/${rid}">Back to the card ›</a>`
    : `<button class="btn primary" data-act="start-scoring" data-rid="${rid}">${r.status === "setup" ? "Start scoring ›" : "Back to scoring ›"}</button>`;
  page("Who is playing?", body, { back: r.status === "done" ? `#review/${rid}` : "#play", bar, sub: `${r.name} · ${courseTitle(c)}`, keepScroll: keep });

  /** An index for somebody the app does not know one for, asked once. */
  const askIndex = async name => {
    const v = await promptSheet(`${firstName(name)}'s handicap index`, "For example 18,4 or +2.1.", { placeholder: "18,4", inputmode: "decimal", label: "Add" });
    if (v === null) return null;
    const hi = parseHI(v);
    if (!hiOk(hi)) { toast("Handicap index between +10 and 54, e.g. 18,4"); return null; }
    return hi;
  };
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "toggle-add") { const f = document.getElementById("addf"); f.classList.add("open"); b.classList.add("hidden"); document.getElementById("pname").focus(); f.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (act === "start-scoring") return go(`#score/${r.id}/${S.holeOf(r)}`);
    if (act === "drop-round") return dropRound(rid);
    if (act === "remove-entry") {
      const i = Number(b.dataset.i), e = r.entries[i];
      if (e.scores.every(s => s === null) || await confirmSheet(`Remove ${e.name}?`, "Their scores on this card go too.", { label: "Remove", danger: true })) { S.removeEntry(r, i); players(rid); }
      return;
    }
    if (act === "add-roster") {
      const p = S.players().find(x => x.id === b.dataset.id);
      let hi = S.currentIndex(p);
      if (hi === null || hi === undefined) {
        hi = await askIndex(p.name);
        if (hi === null) return;
        if (me && p.id === me.id && A.signedIn()) { try { await A.update({ hi }); } catch (e) { /* the entry still carries it */ } }
      }
      S.addEntry(r, c.n, { name: p.name, hi, tee: S.lastTee(p.id, r.course, tees) || r.defaultTee, gender: p.gender || "m", courseHandicap: null });
      return players(rid);
    }
    if (act === "add-friend") {
      // a friend's row is linked to their account from the start, so the round is theirs to see and correct
      const f = F.friendById(b.dataset.id);
      if (!f) return;
      let hi = f.hi;
      if (hi === null || hi === undefined) { hi = await askIndex(f.name); if (hi === null) return; }
      const p = S.upsertPlayer(f.name, hi, "m");
      if (p.linkedAccount !== f.id) { p.linkedAccount = f.id; S.touch("players", p); S.save(); }
      S.addEntry(r, c.n, { name: p.name, hi, tee: S.lastTee(p.id, r.course, tees) || r.defaultTee, gender: p.gender || "m", courseHandicap: null });
      return players(rid);
    }
    if (act === "grp") { const e = r.entries[Number(b.dataset.i)]; e.group = Number(b.dataset.g); S.saveEntry(r, e); return players(rid, true); }
    if (act === "tee") { const e = r.entries[Number(b.dataset.i)]; e.tee = b.dataset.t; S.saveEntry(r, e); return players(rid, true); }
    if (act === "trk") { const e = r.entries[Number(b.dataset.i)]; S.setTrackStats(r, e, !e.trackStats); return players(rid, true); }
    // the panel itself: the tick turns all of them on or all of them off, the chevron only folds the detail away
    if (act === "x-all") { S.unlockStats(r, !(Object.values(S.statsFor(rid)).some(Boolean) && S.cardKeepsStats(r))); ui.extrasOpen = true; return players(rid, true); }
    if (act === "x-fold") { ui.extrasOpen = !ui.extrasOpen; return players(rid, true); }
    if (act === "x-kind") {
      const k = b.dataset.k, next = { ...S.statsFor(rid), [k]: !S.statsFor(rid)[k] };
      S.setStatsFor(rid, next);
      if (Object.values(next).some(Boolean) && !S.cardKeepsStats(r)) {
        const m = r.entries.find(e => e.playerId === S.state.settings.meId) || r.entries[0];
        if (m) S.setTrackStats(r, m, true);
      }
      return players(rid, true);
    }
    if (act === "x-who") {
      const all = b.dataset.who === "all";
      const m = r.entries.find(e => e.playerId === S.state.settings.meId);
      for (const e of r.entries) S.setTrackStats(r, e, all || e === m);
      return players(rid, true);
    }
  });
  document.querySelector("main").addEventListener("change", ev => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const e = r.entries[Number(el.dataset.i)];
    if (el.dataset.act === "from") { e.fromHole = Number(el.value); S.saveEntry(r, e); players(rid, true); }
    if (el.dataset.act === "hi") {
      const hi = parseHI(el.value);
      if (!hiOk(hi)) { el.value = fmtIndex(Number(e.hi)); return toast("Handicap index between +10 and 54, e.g. 18,4"); }
      S.setEntryHi(r, e, hi); players(rid, true);
    }
    if (el.dataset.act === "pch") {
      const raw = el.value.trim(), v = Number(raw);
      if (raw !== "" && !Number.isInteger(v)) return toast("Course handicap must be a whole number");
      e.courseHandicap = null;
      S.saveEntry(r, e);
      S.setPch(e.playerId, r.course, e.tee, raw === "" ? null : v);
      players(rid, true);
    }
  });
  const f = document.getElementById("addf"), nameEl = document.getElementById("pname");
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    const name = nameEl.value.trim();
    const hi = parseHI(document.getElementById("phi").value);
    const tee = document.getElementById("ptee").value, gender = document.getElementById("pgender").value;
    const chRaw = document.getElementById("pch").value.trim();
    const courseHandicap = chRaw === "" ? null : Number(chRaw);
    if (!name) return toast("Give the player a name");
    if (!hiOk(hi)) return toast("Handicap index between +10 and 54, e.g. 18,4");
    if (chRaw !== "" && !Number.isInteger(courseHandicap)) return toast("Course handicap must be a whole number");
    if (r.entries.some(e => S.nameKey(e.name) === S.nameKey(name))) return toast(`${name} is already on this card`);
    const known = S.findPlayer(name);
    if (known) toast(`${known.name} was already known; added with today's index`, 3500);
    S.addEntry(r, c.n, { name: known ? known.name : name, hi, tee, gender, courseHandicap });
    players(rid);
  });
  if (f.classList.contains("open")) nameEl.focus();
}

/**
 * The extras, in one sheet that stays open while you work it. Turning them on turns on *all* of them, because
 * that is the answer nine times in ten; switching one back off is one tap, and the sheet does not shut under
 * you when you do, so turning two off costs two taps rather than two round trips.
 */
export async function extrasSheet(rid) {
  const r = S.getRound(rid);
  if (!r) return;
  const draw = el => {
    const kinds = S.statsFor(rid);
    const on = Object.values(kinds).some(Boolean) && S.cardKeepsStats(r);
    const who = r.entries.filter(e => e.trackStats);
    const mine = r.entries.find(e => e.playerId === S.state.settings.meId) || null;
    // what each one is lives behind the i, so the sheet stays a set of switches rather than a page of prose
    el.querySelector("#xbody").innerHTML = `
      <button class="xmaster ${on ? "on" : ""}" data-act="x-all"><b>${on ? "Keeping them" : "Not kept"}</b>
        <small>${on ? "Tap to stop keeping anything" : "Tap to keep putts, fairways, bunker shots and penalties"}</small></button>
      ${on ? `<p class="pickline" style="margin:14px 0 0">Keeping</p>
        <div class="statpick">${STAT_SWITCHES.map(k =>
          `<button data-act="x-kind" data-k="${k.key}" class="${kinds[k.key] ? "on" : ""}">${esc(k.label)}</button>`).join("")}</div>
        ${tip(STAT_SWITCHES.map(k => `<p><b>${esc(k.label)}</b> — ${esc(k.blurb)}</p>`).join(""), "What each one is")}
        <p class="pickline">Keep them for</p>
        <div class="statpick">
          <button data-act="x-who" data-who="me" class="${who.length === 1 && mine && who[0] === mine ? "on" : ""}">Just me</button>
          <button data-act="x-who" data-who="all" class="${who.length === r.entries.length && r.entries.length ? "on" : ""}">Everyone here</button>
        </div>` : ""}`;
  };
  await sheet({
    title: "Putts, fairways and the rest",
    lead: "Kept beside the score on every hole. Switch off anything you do not want; this stays open.",
    body: `<div id="xbody"></div>`,
    actions: [{ label: "Done", value: "no", kind: "primary" }],
    onOpen: el => {
      draw(el);
      // these carry no `data-sheet-act`, so the sheet's own handler ignores them and the popout stays put
      el.addEventListener("click", ev => {
        const b = ev.target.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "x-all") S.unlockStats(r, !(Object.values(S.statsFor(rid)).some(Boolean) && S.cardKeepsStats(r)));
        else if (act === "x-kind") {
          const k = b.dataset.k, next = { ...S.statsFor(rid), [k]: !S.statsFor(rid)[k] };
          S.setStatsFor(rid, next);
          if (Object.values(next).some(Boolean) && !S.cardKeepsStats(r)) {
            const m = r.entries.find(e => e.playerId === S.state.settings.meId) || r.entries[0];
            if (m) S.setTrackStats(r, m, true);
          }
        } else if (act === "x-who") {
          const all = b.dataset.who === "all";
          const m = r.entries.find(e => e.playerId === S.state.settings.meId);
          for (const e of r.entries) S.setTrackStats(r, e, all || e === m);
        } else return;
        draw(el);
      });
    },
  });
}

/**
 * Before you start: one checkbox. Ticked, it folds out into what is kept and who it is kept for, and the fold
 * shuts again without switching anything off -- so narrowing it is taps on the page, not a trip to a sheet.
 */
function statsPicker(rid, kinds, r) {
  const on = Object.values(kinds).some(Boolean) && S.cardKeepsStats(r);
  const open = on && ui.extrasOpen;
  const mine = r.entries.find(e => e.playerId === S.state.settings.meId) || null;
  const who = r.entries.filter(e => e.trackStats);
  const justMe = who.length === 1 && mine && who[0] === mine;
  const kept = STAT_SWITCHES.filter(k => kinds[k.key]);
  const line = !on ? "Just the score on every hole"
    : `${andList(kept.map(k => k.short.toLowerCase()))}${who.length ? ` · ${justMe ? "just me" : who.length === r.entries.length ? "everyone here" : andList(who.map(e => firstName(e.name)))}` : " · for nobody yet"}`;
  return `<div class="card xpanel" id="statpick">
    <div class="xhead">
      <button class="xcheck" data-act="x-all" role="switch" aria-checked="${on}">
        <span class="tick ${on ? "on" : ""}">${on ? "✓" : ""}</span>
        <span class="xcw"><b>Keep putts, fairways and the rest</b><small>${esc(line)}</small></span></button>
      ${on ? `<button class="xfold ${open ? "open" : ""}" data-act="x-fold" aria-expanded="${open}" aria-label="What is kept">▾</button>` : ""}
    </div>
    ${open ? `<div class="xmore">
      <p class="pickline">Keeping</p>
      <div class="statpick">${STAT_SWITCHES.map(k => `<button data-act="x-kind" data-k="${k.key}" class="${kinds[k.key] ? "on" : ""}">${esc(k.label)}</button>`).join("")}</div>
      ${tip(STAT_SWITCHES.map(k => `<p><b>${esc(k.label)}</b> — ${esc(k.blurb)}</p>`).join(""), "What each one is")}
      <p class="pickline">Keep them for</p>
      <div class="statpick">
        <button data-act="x-who" data-who="me" class="${justMe ? "on" : ""}">Just me</button>
        <button data-act="x-who" data-who="all" class="${who.length === r.entries.length && r.entries.length ? "on" : ""}">Everyone here</button>
      </div></div>` : ""}</div>`;
}
