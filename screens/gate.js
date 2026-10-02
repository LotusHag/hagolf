// The way in. Signed out, the app is a mark and one button; the first time in, it asks your name and nothing
// else it cannot do without. A link opened before signing in shows what it is about first, remembers where it
// was going, and finishes the journey once the sign-in is done.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { page, bind, toast, esc, go, ui, parseHI, hiOk, sheet, firstName, avatar, plural, takeIntent, appBase, shareLink, qrHtml, atDoor, installRoute, isAndroid, ICONS } from "../ui.js";
import { fmtIndex } from "../model.js";

/** Where to go once signed in and named: whatever a link asked for, otherwise home. */
export function landed() {
  const intent = takeIntent();
  go(intent && /^#(join|add|card|board|league|review)\//.test(intent) ? intent : "#home");
}

/** A signed-in account with a name becomes a contact in its own book, and what this phone means by "me". */
function settle(a) {
  if (!a || !a.name) return welcome();
  S.linkMe(a);
  landed();
}

export function welcome() {
  if (atDoor()) return door();
  const acct = A.account();
  if (!Y.config()) return page("Hagolf", `<div class="gate"><div class="gatemark">Hagolf</div><p class="tag">This phone is not connected to a backend.</p><a class="btn" href="#me/backend">Connect</a></div>`, { bare: true });
  if (!acct) return gate();
  onboarding(acct);
}

// The signed Android package, stamped by app/build.py from app/android/hagolf.apk: the door hands over this
// file rather than asking Chrome to install the web app. Empty means none was built, and Android is shown its
// browser's own install instead, so a missing package degrades rather than offering a dead link.
const ANDROID_APK = "./hagolf.apk";

/**
 * The door. app.hagolf.app hands out Hagolf; it is not where Hagolf is used. Every browser that is not already
 * the installed app meets one card with one button, and the button always says the same thing, because from
 * where the reader stands it is always the same thing: get the app onto this device.
 *
 * What it does underneath is whatever that device actually permits. Android is handed a signed package, or
 * failing that Chrome's own install prompt. An iPhone cannot be handed a file by anybody -- Apple allows no
 * install outside the App Store -- so there the button opens Safari's Add to Home Screen, which produces the
 * same app: own icon, full screen, offline. A browser living inside WhatsApp or Instagram can install nothing
 * at all and is shown the way out first. A desktop is not the thing you carry round a course, so it is given
 * the address and a QR for the phone that is.
 *
 * There is no way past, by design. The screens a link opens never arrive here, so a shared card, a board or an
 * invite still opens for somebody who has no app yet; this is only the front door.
 */
function door() {
  // Only an Android is handed the Android package, and it is handed it whatever its browser is: desktop Chrome
  // fires the same install prompt, and a browser inside another app can still take a download.
  const kind = ANDROID_APK && isAndroid() ? "apk" : installRoute();
  const under = {
    apk: "Android package &middot; installs from your downloads",
    prompt: "Installs straight from this browser",
    ios: "Adds it to your home screen &mdash; nothing to download",
    "ios-elsewhere": "Open it in Safari first",
    android: "Adds it to your home screen",
    "android-elsewhere": "Open it in Chrome first",
    desktop: "Hagolf lives on the phone you carry round the course",
  }[kind];
  const btn = kind === "apk"
    ? `<a class="btn primary wide big" href="${esc(ANDROID_APK)}" download>Download Hagolf</a>`
    : `<button class="btn primary wide big" data-act="get">Download Hagolf</button>`;
  page("Hagolf", `<div class="gate">
      <div class="gatemark">Hagolf</div>
      <p class="tag">Score rounds, keep leagues with friends, make the posters.</p>
      <div class="card install">
        <h3>Hagolf on your phone</h3>
        <p class="muted">It opens full screen from its own icon, and goes on scoring when there is no signal.</p>
        ${btn}
        <p class="muted small center under">${under}</p>
      </div>
      <p class="legal">Versions for the App Store and Google Play are on the way. You sign in once it is open on your phone; only your name is ever shown to other people.</p>
    </div>`, { bare: true });
  bind(ev => { if (ev.target.closest("[data-act=get]")) howTo(kind); });
}

// The iPhone's own buttons, drawn small, so each step can be matched to the screen in any language.
const ico = d => `<span class="key" aria-hidden="true"><svg viewBox="0 0 20 20">${d}</svg></span>`;
const KEY = {
  share: ico(`<path d="M10 2.8v9.4M6.6 6.2 10 2.8l3.4 3.4M7.4 8.6H5.6v8.6h8.8V8.6h-1.8"/>`),
  dots: ico(`<circle class="dot" cx="4.6" cy="10" r="1.5"/><circle class="dot" cx="10" cy="10" r="1.5"/><circle class="dot" cx="15.4" cy="10" r="1.5"/>`),
  more: ico(`<path d="M5.8 8 10 12.2 14.2 8"/>`),
  plus: ico(`<rect x="3.6" y="3.6" width="12.8" height="12.8" rx="3.2"/><path d="M10 6.8v6.4M6.8 10h6.4"/>`),
  on: `<span class="key toggle" aria-hidden="true"></span>`,
  add: `<span class="key add">Add</span>`,
};

/** What the button does on a device that cannot simply be handed the app: its own browser's steps. */
function howTo(kind) {
  if (kind === "prompt" && window.__installPrompt) { const p = window.__installPrompt; window.__installPrompt = null; return p.prompt(); }
  const steps = {
    ios: { title: "Add Hagolf to your home screen", lead: "A few taps, and it is the same app: its own icon, full screen, and scoring with no signal.",
      body: `<ol class="steps"><li>Tap <span class="nw"><b>Share</b> ${KEY.share}.</span> On newer iPhones it sits <span class="nw">behind ${KEY.dots}</span> beside the address.</li>
             <li>The row of round buttons ends in <span class="nw"><b>View More</b> ${KEY.more}.</span> Tap it, then <span class="nw"><b>Add to Home Screen</b> ${KEY.plus}.</span></li>
             <li>Leave <b>Open as Web App</b> switched <span class="nw">on ${KEY.on},</span> <span class="nw">tap ${KEY.add}</span> at the top, and open Hagolf from its new icon.</li></ol>
             <p class="muted small">Apple allows no app to be installed from a file, so this is how every iPhone app that is not in the App Store arrives.</p>` },
    "ios-elsewhere": { title: "Open this in Safari first", lead: "You are reading this inside another app, and only Safari can put Hagolf on an iPhone's home screen.",
      body: `<ol class="steps"><li>Tap <b>Share</b> or <b>&#8230;</b> in this app's bar.</li><li>Choose <b>Open in Safari</b>.</li><li>There, tap <b>Download Hagolf</b> again for the rest.</li></ol>` },
    android: { title: "Add Hagolf to your home screen", lead: "It opens full screen from its own icon, and goes on scoring with no signal.",
      body: `<ol class="steps"><li>Open the browser's menu (&#8942;).</li><li>Choose <b>Install app</b>, or <b>Add to Home screen</b>.</li><li>Open Hagolf from your home screen.</li></ol>` },
    "android-elsewhere": { title: "Open this in Chrome first", lead: "You are reading this inside another app, which cannot install anything.",
      body: `<ol class="steps"><li>Open the menu (&#8942;) in this app's bar.</li><li>Choose <b>Open in Chrome</b>, or <b>Open in browser</b>.</li><li>Install it from there.</li></ol>` },
    desktop: { title: "Hagolf lives on your phone", lead: "Scan this with your phone's camera, or open the address there.",
      body: `${qrHtml(appBase())}<a class="linkbox" href="${esc(appBase())}">${esc(appBase().replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` },
  }[kind] || {};
  sheet({ ...steps, actions: [{ label: "Got it", kind: "primary", value: "ok" }] });
}

/** The gate: the mark, one line, one button. */
function gate() {
  page("Hagolf", `<div class="gate">
      <div class="gatemark">Hagolf</div>
      <p class="tag">Score rounds, keep leagues with friends, make the posters.</p>
      <div class="card"><div id="gbtn"></div>
        ${ui.authMethods.includes("email") ? `<form id="signinf"><label>Email<input name="email" type="email" inputmode="email" autocapitalize="off" autocomplete="email" placeholder="you@example.com" required></label>
          <button class="btn primary wide" type="submit" style="margin-top:12px">Email me a code</button></form>` : ""}
        ${ui.signinEmail ? `<form id="codef"><p class="muted small">A code went to <b>${esc(ui.signinEmail)}</b>.</p><label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button class="btn primary wide" type="submit" style="margin-top:12px">Sign in</button></form>` : ""}
        <p id="gnone" class="muted small" hidden>Signing in is not set up on this backend yet.</p></div>
      <p class="legal">By continuing you agree to the <a href="#legal/terms">terms</a> and the <a href="#legal/privacy">privacy policy</a>. Only your name is ever shown to other people.</p>
    </div>`, { bare: true });
  googleButton(settle);
  const signinf = document.getElementById("signinf");
  if (signinf) signinf.addEventListener("submit", async ev => {
    ev.preventDefault();
    const email = ev.target.email.value.trim();
    try { await A.request(email); } catch (e) { return toast(`Could not send it: ${e.message}`, 6000); }
    ui.signinEmail = email;
    gate();
  });
  const codef = document.getElementById("codef");
  if (codef) codef.addEventListener("submit", async ev => {
    ev.preventDefault();
    let a;
    try { a = await A.finishCode(ui.signinEmail, ev.target.code.value); } catch (e) { return toast(e.message, 6000); }
    ui.signinEmail = null;
    settle(a);
  });
}

/**
 * Your name, always, the first time: Google's spelling is only a suggestion. The handicap index is asked but
 * not required; a round asks for it again before you play.
 */
function onboarding(acct) {
  page("Welcome", `<div class="gate onb">
      <h1>${acct.name ? "Is this you?" : "What is your name?"}</h1>
      <p class="lead">This is how you appear to the people you play with. Never your email.</p>
      <form id="mef" class="card">
        <label>Your name<input name="name" autocapitalize="words" autocomplete="name" value="${esc(acct.name || "")}" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
        <div class="two"><label>Handicap index <span class="muted">(optional)</span><input name="hi" inputmode="decimal" placeholder="18,4 or +2.1" value="${acct.hi !== null && acct.hi !== undefined ? esc(fmtIndex(Number(acct.hi))) : ""}"></label>
        <label>Rating<select name="gender"><option value="m" ${acct.gender !== "f" ? "selected" : ""}>Men's</option><option value="f" ${acct.gender === "f" ? "selected" : ""}>Women's</option></select></label></div>
        <button class="btn primary wide" type="submit" style="margin-top:16px">That's me</button>
      </form>
      <button class="btn ghost" data-act="signout">Not you? Sign out</button>
    </div>`, { bare: true });
  document.getElementById("mef").addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = ev.target, name = f.name.value.trim();
    if (!name) return toast("A name is needed");
    const raw = f.hi.value.trim();
    const hi = raw ? parseHI(raw) : null;
    if (raw && !hiOk(hi)) return toast("Handicap index between +10 and 54, e.g. 18,4");
    try { settle(await A.update({ name, hi, gender: f.gender.value })); } catch (e) { toast(e.message, 5000); }
  });
  bind(async ev => {
    const b = ev.target.closest("[data-act=signout]");
    if (b) { await A.signOut(); welcome(); }
  });
}

/** Google's own button, drawn by Google's own script; loaded only when the gate is shown. */
let gisLoading = null;
function loadGis() {
  if (window.google && window.google.accounts) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true; s.onload = res; s.onerror = () => rej(new Error("Google's sign-in script could not be loaded"));
      document.head.appendChild(s);
    }).catch(e => { gisLoading = null; throw e; });
  }
  return gisLoading;
}
async function googleButton(settleFn, redraw = gate) {
  const slot = document.getElementById("gbtn");
  if (!slot) return;
  let cfg;
  try { cfg = await A.config(); } catch (e) { return; }
  const m = (cfg.methods || ["google"]).join(",");
  if (m !== ui.authMethods.join(",")) { ui.authMethods = cfg.methods || ["google"]; return redraw(); }
  const none = document.getElementById("gnone");
  if (!cfg.google) { if (none && ui.authMethods.join(",") === "google") none.hidden = false; return; }
  try { await loadGis(); } catch (e) { if (none) { none.hidden = false; none.textContent = "Google's sign-in could not be loaded. Check the connection and try again."; } return; }
  if (!document.getElementById("gbtn")) return;
  window.google.accounts.id.initialize({
    client_id: cfg.google,
    callback: async ({ credential }) => {
      let a;
      try { a = await A.signInWithGoogle(credential); } catch (e) { return toast(e.message, 6000); }
      settleFn(a);
    },
  });
  window.google.accounts.id.renderButton(slot, { theme: "outline", size: "large", width: 300, text: "continue_with", shape: "pill" });
}

/** The emailed link, tapped on this phone: `#signin/<token>`. */
export async function signin(token) {
  if (!token) return welcome();
  page("Signing in…", `<p class="muted center">One moment…</p>`, { back: "" });
  let a;
  try { a = await A.finish(token); } catch (e) { toast(`Could not sign in: ${e.message}`, 6000); return go("#welcome"); }
  settle(a);
}

/**
 * A page a link opens for somebody who is not signed in: what it is about, and Google's button right here. The
 * sign-in happens in this browser, never via #welcome, which in a browser is the door and would drop the link.
 */
function previewPage(title, body, intent) {
  const draw = () => {
    page(title, `<div class="gate"><div class="gatemark">Hagolf</div><div class="card preview">${body}</div>
      <div class="card"><div id="gbtn"></div><p id="gnone" class="muted small" hidden>Signing in is not set up on this backend yet.</p></div>
      <p class="legal">You only need a Google account and a name. <a href="#legal/privacy">Privacy</a></p></div>`, { bare: true });
    googleButton(a => {
      if (!a || !a.name) return welcome();
      S.linkMe(a);
      // the link is usually still the hash, and assigning the same hash fires nothing
      if (location.hash === intent) dispatchEvent(new HashChangeEvent("hashchange")); else go(intent);
    }, draw);
  };
  draw();
}

/** `#join/<token>`: an invite to a league. (An old-style connection payload still connects the phone.) */
export async function join(arg) {
  if (!arg) return go("#leagues");
  if (arg.startsWith("eyJ")) return connect(arg);
  const token = arg;
  if (!A.signedIn()) {
    page("Invitation", `<p class="muted center">Looking…</p>`, { bare: true });
    let p;
    try { p = await F.previewInvite(token); } catch (e) { return previewPage("Invitation", `<h3>This invite has expired</h3><p class="muted">Ask for a new link.</p>`, "#leagues"); }
    return previewPage("Invitation", `<h3>${esc(p.league.name)}</h3><p class="muted">${p.by ? `${esc(p.by)} invited you.` : "You are invited."} ${plural(p.league.members, "member")} so far.</p>`, `#join/${token}`);
  }
  page("Joining…", `<p class="muted center">Joining the league…</p>`, { back: "#leagues" });
  let r;
  try { r = await F.joinLeague(token); } catch (e) { toast(e.message, 6000); return go("#leagues"); }
  await Y.pull();
  if (r.candidates && r.candidates.length) await claimSheet(r.league.id, r.candidates);
  toast(`You are in ${r.league.name}`);
  go(`#league/${r.league.id}`);
}

/** "Which one is you?" after joining a league whose cards already carry names. */
export async function claimSheet(leagueId, candidates) {
  const free = candidates.filter(c => !c.claimedBy);
  if (!free.length) return;
  const v = await sheet({ title: "Which one is you?", lead: "These names are on this league's cards. Pick yours and those rounds become yours.",
    body: `<div class="list">${free.map(c => `<button data-act="${esc(c.key)}" data-sheet-act><span class="lead">${avatar(c.name)}<div><div class="name">${esc(c.name)}</div><div class="muted small">${plural(c.rounds, "round")}</div></div></span><span class="chev">›</span></button>`).join("")}</div>`,
    actions: [{ label: "None of these, I'm new here", value: "none" }] });
  if (!v || v === "none") return;
  const c = free.find(x => x.key === v);
  try {
    const r = await F.claim(leagueId, c.name);
    toast(r.state === "pending" ? "Claim sent to the organiser" : `You are ${c.name} here`);
    await Y.pull();
  } catch (e) { toast(e.message, 5000); }
}

/** `#add/<handle>`: somebody's friend link. */
export async function add(handle) {
  if (!handle) return go("#people");
  if (!A.signedIn()) {
    page("Add a friend", `<p class="muted center">Looking…</p>`, { bare: true });
    let p;
    try { p = await F.previewHandle(handle); } catch (e) { return previewPage("Add a friend", `<h3>Nobody by that link</h3>`, "#people"); }
    return previewPage("Add a friend", `<div class="person">${avatar(p.person.name, "big")}<div class="who"><div class="name">${esc(p.person.name)}</div><div class="handle">wants to add you on Hagolf</div></div></div>`, `#add/${handle}`);
  }
  let r;
  try { r = await F.resolve(handle); } catch (e) { toast("Nobody by that link", 4000); return go("#people"); }
  const p = r.person;
  if (p.state === "accepted") { toast(`${firstName(p.name)} is already a friend`); return go("#people"); }
  const v = await sheet({ title: `Add ${p.name}?`, body: `<div class="person">${avatar(p.name, "big")}<div class="who"><div class="name">${esc(p.name)}</div><div class="handle">@${esc(p.handle || "")}</div></div></div>`,
    actions: [{ label: p.state === "requested" && !p.byMe ? "Accept" : "Add as a friend", value: "ok", kind: "primary" }, { label: "Not now", value: "no" }] });
  if (v === "ok") { try { await F.request(p.id); toast(p.state === "requested" && !p.byMe ? `You and ${firstName(p.name)} are friends` : "Request sent"); } catch (e) { toast(e.message, 5000); } }
  go("#people");
}

/** A phone pointed at a backend by an old-style join link. */
async function connect(payload) {
  let c;
  try { c = Y.parseJoin(payload); } catch (e) { toast("That link is not readable"); return go("#home"); }
  page("Connecting…", `<p class="muted center">Connecting to ${esc(c.label || c.url)}…</p>`, { back: "" });
  try { await Y.test(c); } catch (err) { toast(`Could not connect: ${err.message}`, 6000); return go("#me/backend"); }
  Y.setConfig({ url: c.url, anonKey: c.anonKey, label: c.label || "" });
  S.state.settings.welcomed = false;
  S.save();
  go("#welcome");
}
