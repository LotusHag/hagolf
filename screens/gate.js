// The way in. Signed out, the app is a mark and one button; the first time in, it asks your name and nothing
// else it cannot do without. A link opened before signing in shows what it is about first, remembers where it
// was going, and finishes the journey once the sign-in is done.
import * as S from "../store.js";
import * as Y from "../sync.js";
import * as A from "../auth.js";
import * as F from "../social.js";
import { page, bind, toast, esc, go, ui, parseHI, hiOk, sheet, firstName, avatar, plural, takeIntent, appBase, qrHtml, atDoor, installRoute, isAndroid, shortDate, courseBy, courseTitle, redraw } from "../ui.js";
import { fmtIndex } from "../model.js";
import { buildRound, courseOf } from "./public.js";
import { isNative, plugin } from "../native.js";

/** Where to go once signed in and named: whatever a link asked for, otherwise home. */
export function landed() {
  const intent = takeIntent();
  const to = intent && /^#(join|add|you|card|board|league|review)\//.test(intent) ? intent : "#home";
  // the gate was drawn under the link's own hash, and going to the hash already there fires nothing
  if (location.hash === to) redraw(); else go(to);
}

/** A signed-in account with a name becomes a contact in its own book, and what this phone means by "me". */
function settle(a) {
  if (!a || !a.name) return welcome();
  S.linkMe(a);
  landed();
}

export function welcome() {
  const acct = A.account();
  if (!Y.config()) return page("Hagolf", `<div class="gate"><div class="gatemark">Hagolf</div><p class="tag">This phone is not connected to a backend.</p><a class="btn" href="#me/backend">Connect</a></div>`, { bare: true });
  if (!acct) return gate();
  onboarding(acct);
}

// The signed Android package, stamped by app/build.py from app/android/hagolf.apk: the door hands over this
// file rather than asking Chrome to install the web app. Empty means none was built, and Android is shown its
// browser's own install instead, so a missing package degrades rather than offering a dead link.
const ANDROID_APK = "";

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
export function getApp() { return door(); }

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
    desktop: "Score on your phone; organise on this screen",
  }[kind];
  const btn = kind === "apk"
    ? `<a class="btn primary wide big" href="${esc(ANDROID_APK)}" download>Download Hagolf</a>`
    : `<button class="btn primary wide big" data-act="get">Download Hagolf</button>`;
  page("Hagolf", `<div class="gate">
      <div class="gatemark">Hagolf</div>
      <p class="tag">Score rounds, keep societies with friends, make the posters.</p>
      <div class="card install">
        <h3>Hagolf on your phone</h3>
        <p class="muted">It opens full screen from its own icon, and goes on scoring when there is no signal.</p>
        ${btn}
        <p class="muted small center under">${under}</p>
      </div>
      <p><a class="btn ghost wide" href="#home">Keep using it here in the browser</a></p>
      <p class="legal">Versions for the App Store and Google Play are on the way. On a laptop, Hagolf runs your societies and tournament boards on the big screen.</p>
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
      <p class="tag">Score rounds, keep societies with friends, make the posters.</p>
      <div class="card"><div id="gbtn"></div><div id="abtn"></div>
        ${ui.authMethods.includes("email") ? `<form id="signinf"><label>Email<input name="email" type="email" inputmode="email" autocapitalize="off" autocomplete="email" placeholder="you@example.com" required></label>
          <button class="btn primary wide" type="submit" style="margin-top:12px">Email me a code</button></form>` : ""}
        ${ui.signinEmail ? `<form id="codef"><p class="muted small">A code went to <b>${esc(ui.signinEmail)}</b>.</p><label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label><button class="btn primary wide" type="submit" style="margin-top:12px">Sign in</button></form>` : ""}
        <p id="gnone" class="muted small" hidden>Signing in is not set up on this backend yet.</p></div>
      <p class="legal">By continuing you agree to the <a href="#legal/terms">terms</a> and the <a href="#legal/privacy">privacy policy</a>. Only your name is ever shown to other people.</p>
      ${atDoor() ? `<p class="small"><a href="#get">Put Hagolf on this phone ›</a></p>` : ""}
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
        <label>Your name<input name="name" autocapitalize="words" autocomplete="name" value="${esc(acct.name || S.state.settings.nameHint || "")}" placeholder="e.g. Anne-Fleur van 't Hof" required></label>
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
  const other = otherWays(cfg, settleFn);
  // Google refuses to sign in inside an embedded web view, so the iOS app offers Apple and passkeys instead
  if (!cfg.google || isNative()) { if (none && !other && ui.authMethods.join(",") === "google") none.hidden = false; return; }
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

// Sign in with Apple, which App Store guideline 4.8 asks for beside Google: the native sheet inside the iOS app,
// Apple's own script on the web. Offered only when /auth/config says this backend has it.
const APPLE_JS = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
const APPLE_LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M16.37 1.43c0 1.14-.5 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.2-2.98.81-.94 2.15-1.64 3.25-1.68.03.13.06.28.06.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8C4 18.38 2.96 15.57 2.96 12.92c0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.68.95 3.6.95.87 0 2.22-1.01 3.9-1.01.62 0 2.89.06 4.38 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.95 4.45z"/></svg>`;
let ajsLoading = null;
function loadAppleJs() {
  if (window.AppleID && window.AppleID.auth) return Promise.resolve();
  if (!ajsLoading) {
    ajsLoading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = APPLE_JS; s.async = true; s.onload = res; s.onerror = () => rej(new Error("Apple's sign-in script could not be loaded"));
      document.head.appendChild(s);
    }).catch(e => { ajsLoading = null; throw e; });
  }
  return ajsLoading;
}
const randomHex = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
const cancelled = e => /popup_closed|user_cancel|cancel|1001/i.test(String((e && (e.error || e.message || e.code)) || e));
const nameOf = (first, last) => [first, last].filter(Boolean).join(" ").trim() || null;

// On the web the popup must open inside the tap itself, so the script is loaded and primed before the tap.
let webAttempt = null;
function primeAppleWeb(cfg) {
  webAttempt = { nonce: randomHex(), state: randomHex() };
  window.AppleID.auth.init({ clientId: cfg.apple.web, scope: "name email", redirectURI: `${location.origin}/`, usePopup: true, ...webAttempt });
}

async function appleSignIn(cfg) {
  if (isNative()) {
    const nonce = randomHex();
    const { response: r } = await plugin("SignInWithApple").authorize({ clientId: cfg.apple.web || "", redirectURI: `${location.origin}/`,
      scopes: "email name", state: randomHex(), nonce });
    return A.signInWithApple(r.identityToken, nameOf(r.givenName, r.familyName), nonce);
  }
  if (!webAttempt) throw new Error("Apple's sign-in is still loading; try again in a moment.");
  const { nonce, state } = webAttempt;
  let r;
  try { r = await window.AppleID.auth.signIn(); } finally { primeAppleWeb(cfg); }
  if (r.authorization.state && r.authorization.state !== state) throw new Error("That sign-in was not started here.");
  const n = r.user && r.user.name;
  return A.signInWithApple(r.authorization.id_token, n ? nameOf(n.firstName, n.lastName) : null, nonce);
}

/** The ways in beside Google's button: Apple where this backend offers it, and passkeys inside the iOS app. */
function otherWays(cfg, settleFn) {
  const slot = document.getElementById("abtn");
  if (!slot) return false;
  const native = isNative();
  const apple = !!cfg.apple && (native ? !!plugin("SignInWithApple") : !!cfg.apple.web);
  const passkey = native && (cfg.methods || []).includes("passkey") && A.passkeysAvailable();
  if (native) document.getElementById("gbtn").style.display = "none";
  // Apple's rules: a black button on light ground, a white one on dark, and every look here is one or the other
  const [r, g, b] = (getComputedStyle(slot).color.match(/\d+/g) || [0, 0, 0]).map(Number);
  const [bg, fg] = r * 0.299 + g * 0.587 + b * 0.114 > 140 ? ["#fff", "#000"] : ["#000", "#fff"];
  slot.innerHTML = (apple ? `<button class="btn wide" data-act="apple" style="background:${bg};color:${fg};border-color:${bg};border-radius:999px;margin-top:10px">${APPLE_LOGO}Sign in with Apple</button>` : "")
    + (passkey ? `<button class="btn wide" data-act="passkey" style="border-radius:999px;margin-top:10px">Sign in with a passkey</button>` : "");
  if (apple && !native) loadAppleJs().then(() => primeAppleWeb(cfg)).catch(() => { const b = slot.querySelector("[data-act=apple]"); if (b) b.remove(); });
  slot.onclick = async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    let a;
    try { a = b.dataset.act === "apple" ? await appleSignIn(cfg) : await A.signInWithPasskey(); }
    catch (e) { if (!cancelled(e)) toast((e && (e.message || e.error)) || "Could not sign in", 6000); return; }
    settleFn(a);
  };
  return apple || passkey;
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
export function previewPage(title, body, intent) {
  const draw = () => {
    page(title, `<div class="gate"><div class="gatemark">Hagolf</div><div class="card preview">${body}</div>
      <div class="card"><div id="gbtn"></div><div id="abtn"></div><p id="gnone" class="muted small" hidden>Signing in is not set up on this backend yet.</p></div>
      <p class="legal">You only need ${isNative() ? "your Apple ID" : "a Google account"} and a name. <a href="#legal/privacy">Privacy</a></p></div>`, { bare: true });
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
  page("Joining…", `<p class="muted center">Joining the society…</p>`, { back: "#leagues" });
  let r;
  try { r = await F.joinLeague(token); } catch (e) { toast(e.message, 6000); return go("#leagues"); }
  await Y.pull();
  if (r.candidates && r.candidates.length) await claimSheet(r.league.id, r.candidates);
  toast(`You are in ${r.league.name}`);
  go(`#league/${r.league.id}`);
}

/** Why a card cannot be ticked, or what to know before ticking it. */
const cardNote = c => c.taken === "held" ? "somebody else has this one" : c.taken === "seated" ? "you are already on this card"
  : c.clash ? "you played somewhere else that day" : "";

/** A card as a claim lists it: where, then when and what it was called. */
export const claimCard = c => ({ key: c.round, taken: c.taken, clash: c.clash, title: courseTitle(courseBy(c.course) || { name: c.course }),
  sub: [c.date ? shortDate(c.date) : "", c.name].filter(Boolean).join(" · ") });

/** The cards as ticks: one a row, with any reason not to tick it under it. A card that cannot be taken is greyed. */
export const cardTicks = (cards, ticked) => `<div class="fmtlist">${cards.map(c => `<label><input type="checkbox" name="card" value="${esc(c.key)}" ${c.taken ? "disabled" : ticked ? "checked" : ""}>
  <span><b>${esc(c.title)}</b><small>${esc([c.sub, cardNote(c)].filter(Boolean).join(" · "))}</small></span></label>`).join("")}</div>`;

/** What the ticks say: the cards ticked and the ones left, or null with a word when none is ticked. */
export function readTicks(el) {
  const boxes = [...el.querySelectorAll("input[name=card]:not(:disabled)")];
  if (!boxes.some(b => b.checked)) { toast("Tick at least one card that is yours"); return null; }
  return { mine: boxes.filter(b => b.checked).map(b => b.value), not: boxes.filter(b => !b.checked).map(b => b.value) };
}

/** Which of these cards are you? Resolves to the ticks, or null when cancelled or nothing was ticked. */
export async function cardsSheet({ title, lead, cards, ticked }) {
  let el = null;
  const v = await sheet({ title, lead, body: cardTicks(cards, ticked),
    actions: [{ label: "These are me", value: "ok", kind: "primary" }, { label: "Cancel", value: "no" }], onOpen: e => { el = e; } });
  return v === "ok" && el ? readTicks(el) : null;
}

/** A golfer on a society's cards in a line: its rounds, and when another has the same name, what tells them apart. */
export function candidateSub(c, all) {
  const twin = all.filter(x => x.key === c.key).length > 1;
  return [plural(c.rounds, "round"), ...(twin ? [c.hi !== null && c.hi !== undefined ? `index ${fmtIndex(Number(c.hi))}` : "",
    c.by ? `kept by ${c.by}` : "", c.last ? `last ${shortDate(c.last)}` : ""] : [])].filter(Boolean).join(" · ");
}

/**
 * "Which one are you?" after joining a society whose cards already carry names. One row a golfer, so two people
 * of the same name are two rows, told apart by index, who keeps them and when they last played. The name that
 * is the account's own comes first. Then the golfer's cards here, all ticked: untick one that was somebody else.
 * A pick stands at once; the organisers can undo a wrong one.
 */
export async function claimSheet(leagueId, candidates) {
  const free = candidates.filter(c => !c.claimedBy);
  if (!free.length) return;
  const mine = S.nameKey((A.account() || {}).name || "");
  free.sort((x, y) => (y.key === mine) - (x.key === mine));
  const sub = c => candidateSub(c, free);
  const v = await sheet({ title: "Which one are you?", lead: "Your rounds in this society come with your name.",
    body: `<div class="list">${free.map(c => `<button data-act="${esc(c.id)}" data-sheet-act><span class="lead">${avatar(c.name)}<div><div class="name">${esc(c.name)}</div><div class="muted small">${esc(sub(c))}</div></div></span><span class="chev">›</span></button>`).join("")}</div>`,
    actions: [{ label: "I'm not on a card yet", value: "none" }] });
  if (!v || v === "none") return;
  const c = free.find(x => x.id === v);
  const cards = (c.cards || []).map(claimCard);
  const ticks = cards.filter(x => !x.taken).length > 1
    ? await cardsSheet({ title: `Which of these were you?`, lead: `Untick any card that was another ${firstName(c.name)}.`, cards, ticked: true })
    : { not: [] };
  if (!ticks) return;
  try {
    await F.claim(leagueId, c.id, ticks.not);
    toast(`You are ${c.name} here`);
    await Y.pull();
  } catch (e) { toast(e.message, 5000); }
}

/** `#add/<handle>`: somebody's friend link. Handing it out was their yes, so opening it makes you friends. */
export async function add(handle) {
  if (!handle) return go("#people");
  page("Add a friend", `<p class="muted center">Looking…</p>`, { bare: !A.signedIn() });
  let p;
  try { p = (await F.previewHandle(handle)).person; } catch (e) { if (!A.signedIn()) return previewPage("Add a friend", `<h3>Nobody by that link</h3>`, "#people"); toast("Nobody by that link", 4000); return go("#people"); }
  const who = `<div class="person">${avatar(p.name, "big", p.look)}<div class="who"><div class="name">${esc(p.name)}</div><div class="handle">wants to be your friend on Hagolf</div></div></div>`;
  if (!A.signedIn()) return previewPage("Add a friend", who, `#add/${handle}`);
  if (F.held().friends.some(f => f.handle === p.handle)) { toast(`${firstName(p.name)} is already a friend`); return go("#people"); }
  const v = await sheet({ title: `Add ${firstName(p.name)}?`, body: who, actions: [{ label: "Add as a friend", value: "ok", kind: "primary" }, { label: "Not now", value: "no" }] });
  if (v === "ok") { try { await F.linkFriend(handle); toast(`You and ${firstName(p.name)} are friends`); } catch (e) { toast(e.message, 5000); } }
  go("#people");
}

/** The cards on a golfer's link, each with that golfer's points and who else was on it. */
function golferCards(P) {
  return P.cards.map(card => {
    const course = courseOf(card.round.course, card.course ? [card.course] : []);
    let pts = null;
    try { const M = course && buildRound(card, card.round, card.entries, card.scores, course); const me = M && M.players.find(x => x.id === card.you); pts = me ? me.pts : null; } catch (e) { /* the card still lists */ }
    const others = card.entries.filter(e => e.id !== card.you).map(e => firstName(e.name));
    return { key: card.key, title: course ? course.name : card.round.name,
      sub: [card.round.date ? shortDate(card.round.date) : "", others.length ? `with ${others.join(", ")}` : "", pts !== null ? `${pts} pts` : ""].filter(Boolean).join(" · ") };
  });
}

/** `#you/<token>`: the link a scorer sent with your cards on it. "These are mine" makes them yours. */
export async function you(token) {
  if (!token) return go("#home");
  page("Your rounds", `<p class="muted center">Looking…</p>`, { bare: !A.signedIn() });
  let P;
  try { P = await F.previewGolfer(token); }
  catch (e) { const gone = `<h3>This link has been used</h3><p class="muted">Ask for a new one, or sign in: rounds already yours are waiting.</p>`; return A.signedIn() ? (toast("This link has been used", 5000), go("#home")) : previewPage("Your rounds", gone, "#home"); }
  const head = `<h3>${P.by ? `${esc(P.by)} kept your score` : "Your scores"}</h3><p class="muted">${plural(P.cards.length, "round")} as ${esc(P.name)}</p>`;
  const cards = golferCards(P);
  if (!A.signedIn()) return previewPage("Your rounds", `${head}<div class="list">${cards.map(c => `<div><div><div class="name">${esc(c.title)}</div><div class="muted small">${esc(c.sub)}</div></div></div>`).join("")}</div>`, `#you/${token}`);
  page("Your rounds", `<div class="card">${head}${cards.length > 1 ? `<p class="muted small">Untick any round that was somebody else.</p>` : ""}</div>${cardTicks(cards, true)}
    <div class="btnrow"><button class="btn primary" data-act="mine">These are mine</button><button class="btn" data-act="not">Not me</button></div>`, { back: "#home" });
  bind(async ev => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "not") return go("#home");
    const ticks = cards.length ? readTicks(document.querySelector("main") || document) : { not: [] };
    if (!ticks) return;
    b.disabled = true;
    try {
      const r = await F.openGolfer(token, ticks.not);
      await Y.pull();
      toast(`${plural(r.rounds, "round")} added to yours`);
      go("#stats/rounds");
    } catch (e) { b.disabled = false; toast(e.message, 5000); }
  });
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
