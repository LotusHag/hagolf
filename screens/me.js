// Me: who you are, and every setting, each on its own short screen instead of one long one.
import { DATA } from "../data.js";
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as N from "../notify.js";
import * as E from "../entitlements.js";
import * as F from "../social.js";
import { page, bind, esc, go, toast, ui, plural, fmtDate, courseTitle, avatar, sheet, confirmSheet, promptSheet, alertSheet, shareLink, qrHtml, saveFiles, slugFile, themeRadios, bindChips, appTheme, paint, themeHere, applyBrand, parseHI, hiOk, app, ICONS, roundStatus, roundWhere, FAMILIES, themesIn } from "../ui.js";
import { fmtIndex, STAT_SWITCHES, STAT_SWITCH_KEYS } from "../model.js";
import { KINDS_WORDS } from "./kinds.js";
import { myLink } from "./people.js";

const row = (href, icon, title, sub = "") => `<a href="${href}"><span class="lead">${ICONS[icon]}<div><div class="name">${esc(title)}</div>${sub ? `<div class="muted small">${sub}</div>` : ""}</div></span><span class="chev">›</span></a>`;

export async function resyncNow() {
  toast("Fetching everything…", 4000);
  const n = await Y.resync();
  toast(Y.sync.status === "error" ? `Could not fetch: ${Y.sync.error}` : `Fetched ${plural(n.rounds, "round")}, ${plural(n.players, "player")}, ${plural(n.leagues, "league")}`, 5000);
  location.reload();
}

export function me(section) {
  if (section) return SECTIONS[section] ? SECTIONS[section]() : go("#me");
  const acct = A.account(), mine = S.me();
  const st = Y.sync;
  const syncWord = st.status === "off" ? "Not connected" : st.status === "error" ? "Sync problem" : st.status === "signedout" ? "Signed out" : st.status === "syncing" ? "Syncing…" : "Synced";
  page("Me", `
    ${acct ? `<div class="person">${avatar(acct.name || "?", "big")}<div class="who"><div class="name">${esc(acct.name || "No name yet")}</div>
      <div class="handle">${[acct.handle ? `@${esc(acct.handle)}` : "", acct.hi !== null && acct.hi !== undefined ? `index ${esc(fmtIndex(Number(acct.hi)))}` : "no index yet"].filter(Boolean).join(" · ")}</div></div><a class="btn small" href="#me/account">Edit</a></div>`
      : `<div class="card"><div class="muted small">Not signed in.</div><a class="btn primary" href="#welcome" style="margin-top:8px">Sign in</a></div>`}
    ${mine ? `<div class="list">${row(`#player/${mine.id}`, "card", "My rounds", `${plural(S.roundsOf(mine.id).filter(r => r.status === "done").length, "round")} on your cards`)}</div>` : ""}
    <h2>Settings</h2>
    <div class="list">
      ${row("#me/updates", "bell", "Updates and notifications", N.pushState() === "granted" && S.state.settings.push ? "Push on" : "Push off")}
      ${row("#me/privacy", "shield", "Privacy", acct ? `Found by ${acct.discoverable === "everyone" ? "everyone" : acct.discoverable === "nobody" ? "nobody" : "people in your leagues"}` : "")}
      ${row("#me/look", "sun", "Appearance", `${esc(appTheme().name)} theme`)}
      ${row("#me/scoring", "golf", "Scoring extras", STAT_SWITCH_KEYS.every(k => S.defaultStats()[k]) ? "Everything, once a card asks" : STAT_SWITCH_KEYS.some(k => S.defaultStats()[k]) ? STAT_SWITCHES.filter(k => S.defaultStats()[k.key]).map(k => k.short).join(", ") : "Nothing")}
      ${row("#me/courses", "flag", "Courses", `${S.courses().length} courses`)}
      ${row("#me/data", "db", "Data and backup", "Export, import, download or delete")}
      ${acct ? row("#me/club", "users", "Club", acct.club ? esc(acct.club.name) : "Join with a code, or start one") : ""}
      ${row("#me/backend", "settings", "Connection", `${syncWord}${st.lastPull ? " · " + st.lastPull.slice(11, 16) : ""}`)}
      ${row("#me/about", "info", "About Hagolf", `v${DATA.version.slice(4, 8)}.${DATA.version.slice(9)}`)}
    </div>
    ${acct ? `<div class="btnrow" style="margin-top:20px"><button class="btn" data-act="signout">${ICONS.logout} Sign out</button></div>` : ""}`,
    { back: "#home", tabs: "me" });
  bind(async ev => {
    const b = ev.target.closest("[data-act=signout]");
    if (!b) return;
    if (!await confirmSheet("Sign out?", "Everything on this phone stays. Sign in again to keep syncing.", { label: "Sign out" })) return;
    await A.signOut();
    go("#welcome");
  });
}

const sub = (title, body, extra = {}) => page(title, body, { back: "#me", bell: false, ...extra });

// ---------------------------------------------------------------- account
function account() {
  const a = A.account();
  if (!a) return go("#me");
  sub("Your account", `
    <form id="acctf" class="card">
      <label style="margin-top:0">Name<input name="name" value="${esc(a.name || "")}" autocapitalize="words" required></label>
      <div class="two"><label>Handicap index<input name="hi" inputmode="decimal" value="${a.hi !== null && a.hi !== undefined ? esc(fmtIndex(Number(a.hi))) : ""}" placeholder="18,4"></label>
      <label>Rating<select name="gender"><option value="m" ${a.gender !== "f" ? "selected" : ""}>Men's</option><option value="f" ${a.gender === "f" ? "selected" : ""}>Women's</option></select></label></div>
      <label>Handle <span class="muted">(your friend link)</span><input name="handle" value="${esc(a.handle || "")}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="e.g. maurits-h"></label>
      <div class="linkbox">${esc(myLink())}</div>
      <button class="btn primary wide" type="submit" style="margin-top:14px">Save</button>
    </form>
    <div class="btnrow"><button class="btn" data-act="mylink">${ICONS.link} Share my link</button><button class="btn" data-act="myqr">${ICONS.qr} My QR code</button></div>
    <p class="muted small" style="margin:14px 4px">Signed in with Google. Your email address is used to sign you in and is never shown to anyone.</p>
    <div class="btnrow"><button class="btn small" data-act="signout-all">Sign out on every phone</button></div>`);
  document.getElementById("acctf").addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = ev.target, raw = f.hi.value.trim(), hi = raw ? parseHI(raw) : null;
    if (!f.name.value.trim()) return toast("A name is needed");
    if (raw && !hiOk(hi)) return toast("Handicap index between +10 and 54");
    try {
      const acct = await A.update({ name: f.name.value.trim(), hi, gender: f.gender.value, handle: f.handle.value.trim() || a.handle });
      S.linkMe(acct);
      const p = S.me();
      if (p && (p.name !== acct.name || p.hi !== acct.hi || p.gender !== acct.gender)) { p.hi = acct.hi; p.gender = acct.gender; if (p.name !== acct.name) S.renamePlayer(p, acct.name); else { S.touch("players", p); S.save(); } }
      toast("Saved"); account();
    } catch (e) { toast(e.message, 5000); }
  });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "mylink") return shareLink(myLink(), "Add me on Hagolf", `Add me on Hagolf: ${myLink()}`);
    if (b.dataset.act === "myqr") return sheet({ title: "Your friend link", lead: "Let them scan this with their camera.", body: `${qrHtml(myLink())}<div class="linkbox">${esc(myLink())}</div>`, actions: [{ label: "Done", value: "ok", kind: "primary" }] });
    if (b.dataset.act === "signout-all") { if (await confirmSheet("Sign out everywhere?", "Every phone signed in as you is signed out, and notifications stop.", { label: "Sign out everywhere", danger: true })) { await A.signOut(true); go("#welcome"); } }
  });
}

// ---------------------------------------------------------------- updates
function updatesSettings() {
  const a = A.account();
  const mutes = new Set((a && a.mutes) || []);
  sub("Updates", `
    <div class="card">
      ${N.pushPossible() ? `<label class="switch"><span>Notify this phone<small>A push that says only that there is something new. The app then says what.</small></span><input type="checkbox" id="pushtoggle" ${N.pushState() === "granted" && S.state.settings.push ? "checked" : ""}></label>
        ${N.pushState() === "denied" ? `<p class="muted small">Notifications are blocked for Hagolf on this phone; turn them back on in its settings.</p>` : ""}` : `<p class="muted small">This phone cannot show notifications${/iPhone|iPad/.test(navigator.userAgent) ? " until Hagolf is on the home screen (Share, then Add to Home Screen)" : ""}. The inbox still says everything.</p>`}
    </div>
    <h2>What gets pushed</h2>
    <p class="muted small" style="margin:-4px 4px 8px">Everything still lands in your inbox; this is only about waking the phone.</p>
    <div class="card">${Object.entries(KINDS_WORDS).map(([k, w]) => `<label class="switch"><span>${esc(w)}</span><input type="checkbox" data-mute="${k}" ${mutes.has(k) ? "" : "checked"} ${a ? "" : "disabled"}></label>`).join("")}</div>`);
  const pt = document.getElementById("pushtoggle");
  if (pt) pt.addEventListener("change", async ev => {
    if (ev.target.checked) { try { await N.enablePush(); toast("You will be told when there is something new"); } catch (e) { toast(e.message, 6000); } }
    else { await N.disablePush(); toast("Notifications off"); }
    updatesSettings();
  });
  app.querySelectorAll("[data-mute]").forEach(el => el.addEventListener("change", async () => {
    const next = [...app.querySelectorAll("[data-mute]")].filter(x => !x.checked).map(x => x.dataset.mute);
    try { await A.update({ mutes: next }); } catch (e) { toast(e.message, 5000); }
  }));
}

// ---------------------------------------------------------------- privacy
function privacySettings() {
  const a = A.account();
  if (!a) return go("#me");
  sub("Privacy", `
    <div class="card"><h2 style="margin-top:0">Who can find you by name</h2>
      <p class="muted small" style="margin:0 0 6px">Your friend link always works. This is only about the search box.</p>
      <div class="segpick">${[["leagues", "People in my leagues"], ["everyone", "Everyone"], ["nobody", "Nobody"]].map(([v, l]) => `<button data-act="disc" data-v="${v}" class="${(a.discoverable || "leagues") === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div class="card"><label class="switch"><span>Keep me off shared boards<small>Initials instead of your name on any board or card that is not private.</small></span><input type="checkbox" id="hidepub" ${a.hidePublic ? "checked" : ""}></label></div>
    <div class="list">${row("#legal/privacy", "shield", "Privacy policy", "What is kept, who sees it, and your rights")}${row("#legal/terms", "info", "Terms")}</div>
    <p class="muted small" style="margin:14px 4px">Blocked people are under People. Your data, and deleting your account, are under Data and backup.</p>`);
  bind(async ev => {
    const b = ev.target.closest("[data-act=disc]");
    if (!b) return;
    try { await A.update({ discoverable: b.dataset.v }); privacySettings(); } catch (e) { toast(e.message, 5000); }
  });
  document.getElementById("hidepub").addEventListener("change", async ev => {
    try { await A.update({ hidePublic: ev.target.checked }); toast(ev.target.checked ? "You are initials on shared boards from now on" : "Your name is back on shared boards"); } catch (e) { toast(e.message, 5000); }
  });
}

// ---------------------------------------------------------------- appearance
function look() {
  sub("Appearance", `<p class="muted small" style="margin:4px 4px 10px">The look of the app itself, and of every poster and card it makes. A league that has picked its own wears that instead.</p>
    <div class="themes">${themeRadios("apptheme", appTheme().name)}</div>`);
  bindChips(app.querySelector(".themes"), v => { S.setSetting("theme", v); S.setSetting("themeChosen", true); paint(themeHere()); toast("Saved"); });
}

// ---------------------------------------------------------------- scoring extras
function scoring() {
  const dstats = S.defaultStats();
  sub("Scoring extras", `<p class="muted small" style="margin:4px 4px 10px">Every card starts with the score and nothing else. The Extras button on the scoring screen opens what is ticked here for that card, one tap on the hole each; anything left off never appears.</p>
    <div class="card"><div class="statpick">${STAT_SWITCHES.map(k => `<button data-act="def-stat" data-k="${k.key}" class="${dstats[k.key] ? "on" : ""}">${esc(k.label)}</button>`).join("")}</div>
      ${STAT_SWITCH_KEYS.some(k => dstats[k]) ? `<p class="muted small" style="margin:10px 0 0">${STAT_SWITCHES.filter(k => dstats[k.key]).map(k => `<b>${esc(k.short)}</b> · ${esc(k.blurb)}`).join("<br>")}</p>` : `<p class="muted small" style="margin:10px 0 0">Nothing ticked, so the Extras button opens everything.</p>`}</div>`);
  bind(ev => { const b = ev.target.closest("[data-act=def-stat]"); if (b) { S.setDefaultStats({ ...dstats, [b.dataset.k]: !dstats[b.dataset.k] }); scoring(); } });
}

// ---------------------------------------------------------------- courses
function courses() {
  const phoneCourses = S.state.courses.filter(c => !c.deleted && (c.source || "phone") === "phone");
  sub("Courses", `<div class="card"><div class="muted small">${S.courses().length} courses on this phone, ${plural(phoneCourses.length, "course")} added on phones.</div>
      ${phoneCourses.map(c => `<div class="kv"><span>${esc(courseTitle(c.data))}</span><button class="btn small danger" data-act="del-course" data-slug="${esc(c.slug)}">Remove</button></div>`).join("")}
      <a class="btn small" href="#newcourse" style="margin-top:8px">Add a club</a></div>`);
  bind(async ev => {
    const b = ev.target.closest("[data-act=del-course]");
    if (!b) return;
    const c = S.state.courses.find(x => x.slug === b.dataset.slug);
    const used = S.rounds().filter(r => r.course === b.dataset.slug).length;
    if (used) return toast(`${plural(used, "round")} use this course; delete those first`);
    if (await confirmSheet("Remove this course?", `${courseTitle(c.data)} goes from every phone.`, { label: "Remove", danger: true })) { S.removeCourse(b.dataset.slug); courses(); }
  });
}

// ---------------------------------------------------------------- data
function data() {
  const acct = A.account();
  const done = S.rounds().filter(r => r.status === "done");
  sub("Data and backup", `
    <div class="card"><div class="muted small">${S.players().length} players · ${S.rounds().length} rounds · ${S.leagues().length} leagues${S.state.settings.lastExport ? ` · last export ${S.state.settings.lastExport.slice(0, 16).replace("T", " ")}` : ""}</div>
      <div class="two"><button class="btn primary" data-act="export">Export backup</button><label class="btn">Import backup<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
    ${acct ? `<h2>Your account</h2><div class="card"><p class="muted small" style="margin:0 0 8px">Everything the account can see, as one file; or the account and everything that is its own, gone for good. Other people's records of you stay theirs, with your name taken off.</p>
      <div class="two"><button class="btn" data-act="export-me">Download my data</button><button class="btn danger" data-act="erase-me">Delete my account</button></div></div>` : ""}
    <h2>For the desktop kit</h2>
    <p class="muted small" style="margin:-4px 4px 8px">A round as a tournament.yaml file for the desktop scripts.</p>
    <div class="list">${done.slice(0, 20).map(r => `<div><div><div class="name">${esc(r.name)}</div><div class="muted small">${esc(roundWhere(r))} · ${esc(fmtDate(r.date))}</div></div><button class="btn small" data-act="yaml" data-rid="${r.id}">tournament.yaml</button></div>`).join("") || `<div class="muted small">No finished rounds yet.</div>`}</div>
    ${S.state.quarantine.length ? `<h2>Refused by the server</h2><div class="card"><div class="muted small">${S.state.quarantine.slice(-5).map(q => `${esc(q.table)} · ${esc(q.reason)}`).join("<br>")}</div><button class="btn small danger" data-act="clear-q" style="margin-top:8px">Clear this list</button></div>` : ""}`);
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "export") { await saveFiles([new File([S.exportJSON()], `hagolf-backup-${S.today()}.json`, { type: "application/json" })], "Hagolf backup"); return data(); }
    if (act === "yaml") { const r = S.getRound(b.dataset.rid); return saveFiles([new File([S.toYAML(r)], `${slugFile(r.name).toLowerCase()}-tournament.yaml`, { type: "text/plain" })], r.name); }
    if (act === "clear-q") { S.state.quarantine = []; S.save(); return data(); }
    if (act === "export-me") {
      try { const d = await A.api("/account/export"); await saveFiles([new File([JSON.stringify(d, null, 1)], `hagolf-${d.exported.slice(0, 10)}.json`, { type: "application/json" })], "My Hagolf data"); } catch (e) { toast(e.message, 5000); }
      return;
    }
    if (act === "erase-me") {
      const word = await promptSheet("Delete your account?", "Your rounds, your address book and what you bought go, on every phone, for good. Other people's records of you stay theirs, with your name taken off. Type DELETE to confirm.", { placeholder: "DELETE", label: "Delete my account" });
      if (word === null) return;
      try { await A.api("/account/erase", { confirm: word }); A.forget(); toast("Your account is gone. What is on this phone stays until you clear it.", 6000); go("#welcome"); }
      catch (e) { toast(e.message, 6000); }
    }
  });
  document.getElementById("imp").addEventListener("change", async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try { const res = S.importJSON(await f.text()); toast(`Imported: ${plural(res.added, "record")} added or updated`, 5000); data(); } catch (err) { toast(err.message, 5000); }
  });
}

// ---------------------------------------------------------------- club
function club() {
  const acct = A.account();
  if (!acct) return go("#me");
  sub("Club", acct.club ? `<div class="card"><div class="row"><div><div class="name">${esc(acct.club.name)}</div><div class="muted small">${acct.club.role === "owner" ? "You run this club." : acct.club.role === "organiser" ? "You organise this club." : "You are a member."} Its look is on this phone${acct.club.theme ? ` (${esc(acct.club.theme)})` : ""} and everything in the shop is yours while you are.</div></div>
        ${acct.club.role === "owner" ? "" : `<button class="btn small" data-act="club-leave">Leave</button>`}</div>
      ${["owner", "organiser"].includes(acct.club.role) ? `<details style="margin-top:10px" class="foldrow"><summary>Run the club</summary>
        ${ui.clubCode ? `<p class="small"><b>Join code: ${esc(ui.clubCode)}</b> · read it out or send it; a new one replaces it.</p>` : ""}
        <div class="two"><button class="btn small" data-act="club-code">${ui.clubCode ? "New join code" : "Show a join code"}</button><button class="btn small" data-act="club-members">Who is in</button></div>
        <form id="clubf" style="margin-top:10px"><label>Club name<input name="name" value="${esc(acct.club.name)}"></label>
          <label>The club's look<select name="theme"><option value="">The app's own</option>${FAMILIES.map(f => `<optgroup label="${esc(f.name)}">${themesIn(f.key).map(t => `<option value="${t.name}" ${acct.club.theme === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>
          <button class="btn small primary" type="submit" style="margin-top:10px">Save the look</button></form></details>` : ""}</div>`
    : `<div class="card"><p class="muted small" style="margin:0 0 8px">A club gives every member its own look and everything in the shop, for as long as they are in it. Your rounds stay yours either way.</p>
        <form id="joinclubf"><label>Join code<input name="code" placeholder="ABCD2345" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="8"></label>
          <button class="btn primary wide" type="submit" style="margin-top:12px">Join the club</button></form>
        <button class="btn small" data-act="club-create" style="margin-top:8px">Start a club</button></div>`);
  const clubf = document.getElementById("clubf");
  if (clubf) clubf.addEventListener("submit", async ev => { ev.preventDefault(); try { await A.api(`/club/${acct.club.id}/brand`, { name: ev.target.name.value.trim(), theme: ev.target.theme.value || null }); await A.whoami(); applyBrand(); toast("Saved"); } catch (e) { toast(e.message, 5000); } club(); });
  const joinclubf = document.getElementById("joinclubf");
  if (joinclubf) joinclubf.addEventListener("submit", async ev => { ev.preventDefault(); try { const r = await A.api("/club/join", { code: ev.target.code.value }); await A.whoami(); applyBrand(); toast(`Welcome to ${r.club.name}`); } catch (e) { toast(e.message, 5000); } club(); });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "club-create") {
      const name = await promptSheet("Start a club", "The club's name.", { placeholder: "Golfclub …", label: "Start" });
      if (!name) return;
      try { const r = await A.api("/club", { name }); ui.clubCode = r.code; await A.whoami(); applyBrand(); toast(`${r.name} started`, 5000); } catch (e) { toast(e.message, 5000); }
      return club();
    }
    if (act === "club-leave") { if (!await confirmSheet("Leave the club?", "Its look and everything it gave you go; your rounds stay yours.", { label: "Leave", danger: true })) return; try { await A.api("/club/leave", {}); await A.whoami(); applyBrand(); toast("You have left the club"); } catch (e) { toast(e.message, 5000); } return club(); }
    if (act === "club-code") { try { ui.clubCode = (await A.api(`/club/${acct.club.id}/code`, {})).code; } catch (e) { toast(e.message, 5000); } return club(); }
    if (act === "club-members") { try { const r = await A.api(`/club/${acct.club.id}/members`); await alertSheet("Members", "", `<div class="list">${r.members.map(m => `<div><span class="lead">${avatar(m.name || "?")}<div><div class="name">${esc(m.name || "Somebody")}</div><div class="muted small">${esc(m.role)}</div></div></span></div>`).join("") || `<div class="muted small">Nobody yet</div>`}</div>`); } catch (e) { toast(e.message, 5000); } }
  });
}

// ---------------------------------------------------------------- the connection
function backend() {
  const cfg = Y.config() || { url: "", anonKey: "", label: "" };
  const st = Y.sync;
  const status = st.status === "off" ? "Not connected" : st.status === "error" ? `Problem: ${st.error}` : st.status === "syncing" ? "Syncing…" : `Synced with ${cfg.label || "the backend"}${st.lastPull ? " · last check " + st.lastPull.slice(11, 16) : ""}`;
  sub("Connection", `
    <div class="card"><div class="row"><div><div class="name">${esc(status)}</div><div class="muted small">Your rounds and leagues live on the backend and follow your account to any phone.</div></div><button class="btn small" data-act="sync-now">Sync now</button></div>
      <div class="btnrow"><button class="btn small" data-act="resync">Fetch everything again</button>${DATA.sync && !Y.isDefault() ? `<button class="btn small" data-act="sync-default">Back to the built-in connection</button>` : ""}</div></div>
    <details class="card foldrow"><summary>Point this phone at another backend</summary>
      <p class="muted small">Only for somebody running their own Hagolf backend.</p>
      <form id="syncf">
        <label>Address<input name="url" value="${esc(cfg.url)}" placeholder="https://hagolf.….workers.dev" autocapitalize="off" autocorrect="off"></label>
        <label>Key<input name="anonKey" value="${esc(cfg.anonKey)}" autocapitalize="off" autocorrect="off"></label>
        <label>Name<input name="label" value="${esc(cfg.label || "")}" placeholder="e.g. Hagolf"></label>
        <button class="btn primary wide" type="submit" style="margin-top:12px">Test and save</button></form></details>`);
  document.getElementById("syncf").addEventListener("submit", async ev => {
    ev.preventDefault();
    const c = { url: ev.target.url.value.trim(), anonKey: ev.target.anonKey.value.trim(), label: ev.target.label.value.trim() };
    if (!c.url && !c.anonKey) { Y.setConfig(null); toast("Sync switched off on this phone"); return backend(); }
    if (!c.url.startsWith("http") || !c.anonKey) return toast("Both the address and the key are needed");
    try { await Y.test(c); } catch (err) { return toast(`Could not connect: ${err.message}`, 6000); }
    Y.setConfig(DATA.sync && c.url === DATA.sync.url && c.anonKey === DATA.sync.anonKey ? null : c);
    toast("Connected"); backend();
  });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "sync-now") { await Y.pushAndPull(); toast(Y.sync.status === "error" ? `Sync problem: ${Y.sync.error}` : "Synced"); backend(); }
    if (b.dataset.act === "resync") await resyncNow();
    if (b.dataset.act === "sync-default") { Y.setConfig(null); backend(); }
  });
}

function about() {
  sub("About", `<div class="prose"><p><b>Hagolf</b> scores a round on the phone, keeps leagues with the people you play with, and makes the posters and player cards, in any look.</p>
    <p>Version ${esc(DATA.version)} · ${S.courses().length} courses · ${DATA.themes.length} themes.</p>
    <p>Handicaps follow the World Handicap System: course handicap from index, slope and rating, strokes by stroke index, Stableford against net par. Check a course's rating against the card in the clubhouse before a competition.</p></div>
    <div class="list">${row("#legal/privacy", "shield", "Privacy policy")}${row("#legal/terms", "info", "Terms")}</div>`);
}

const SECTIONS = { account, updates: updatesSettings, privacy: privacySettings, look, scoring, courses, data, club, backend, about };
