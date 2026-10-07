// The privacy policy and the terms, in plain words, inside the app where they can be read offline.
// Written for a small golf app run from the Netherlands; a lawyer should read them before anything is sold.
import { page } from "../ui.js";

const back = () => (history.length > 1 ? "#home" : "#welcome");

export function privacy() {
  page("Privacy", `<div class="prose">
    <p><b>Hagolf</b> is a scoring app for golf societies. This page says what it keeps about you, why, and what you can do about it. It is written to be read, not to be skimmed.</p>
    <h3>Who is responsible</h3>
    <p>The person who runs this Hagolf backend. On the public app that is the maintainer of hagolf.app; contact details are on the About page under Me.</p>
    <h3>What is kept, and why</h3>
    <ul>
      <li><b>Your account:</b> the email address of the Google account you sign in with, your name, your handle, your handicap index and rating, and the settings you choose. The email is used to sign you in and to reach you about your account. It is never shown to other people: everywhere in the app you are your name.</li>
      <li><b>Your golf:</b> the rounds you score or are scored into, hole by hole, with the extras you switch on (putts, fairways and so on), the societies you are in, and the people in your address book with the index they last played off.</li>
      <li><b>Your friends:</b> who you asked, who asked you, who said yes, and whom you blocked.</li>
      <li><b>What changed:</b> every correction to a card is logged with what it was, what it became, and which account made it, so a card can be corrected years later and still say who did.</li>
      <li><b>Where to wake your phone:</b> if you switch notifications on, the push address your phone gives us. The push itself carries no content at all.</li>
      <li><b>Photographs of scorecards</b> you choose to scan are sent to the scan service (Anthropic) to read the numbers, and are not kept afterwards.</li>
    </ul>
    <h3>Who sees what</h3>
    <ul>
      <li>A round is seen by the people on it, by the members of the societies it counts for, and by anyone you share it with. A card you make a public link for is readable by anyone with the link; the people on it are told.</li>
      <li>A society's table is seen by its members. Its organiser can make it readable by link or public; you can ask to appear as initials on any board that is not private.</li>
      <li>Your name and handle can be found by search only by people who share a society with you, unless you switch that to everyone or to nobody. A friend link you hand out always works.</li>
      <li>Nobody sees your email address, your friends list, or your inbox.</li>
    </ul>
    <h3>Who we work with</h3>
    <p>The backend runs on Cloudflare (Workers and D1, in the EU where possible). Sign-in is by Google. Scorecard photographs are read by Anthropic. Purchases, where the shop is on, go through Stripe, which handles your payment details; we only learn what was bought. Nobody else receives your data, and nothing is sold to anybody.</p>
    <h3>How long</h3>
    <p>Your account and your golf are kept until you delete them. Sign-in sessions last 90 days. Invite links expire after 30 days. Updates in your inbox are kept for about 90 days. A nightly copy of the database is kept for recovery.</p>
    <h3>Your rights</h3>
    <ul>
      <li><b>See everything:</b> Me › Data › Download my data gives you everything the account can see, as one file.</li>
      <li><b>Correct it:</b> your name, handle, index and settings are yours to change; any card you were on is yours to correct.</li>
      <li><b>Delete it:</b> Me › Data › Delete my account removes the account and everything that is its own, for good. Other people's records of rounds you played stay theirs, with your name taken off them.</li>
      <li>You can complain to the Autoriteit Persoonsgegevens if you think something is wrong.</li>
    </ul>
    <h3>On your phone</h3>
    <p>The app keeps a copy of your data in the browser's storage so it works without a signal. It uses no advertising and no tracking. Signing out on this phone removes the session; the data stays until you clear it.</p>
    <p class="muted small">Last changed 28 September 2026.</p></div>`, { back: back(), bell: false });
}

export function terms() {
  page("Terms", `<div class="prose">
    <p>Hagolf is offered as it is, for scoring golf with people you know. By using it you agree to these terms.</p>
    <h3>Your account</h3>
    <p>You need a Google account and a real name. One person, one account. You are responsible for what is done from it; sign out on phones that are not yours.</p>
    <h3>Other people</h3>
    <p>The people on your cards are real. Enter their scores honestly, share cards only where they would expect it, and do not use search, invites or sharing to bother anyone. Blocking is available to everyone, and an account used to harass people will be closed.</p>
    <h3>Your golf</h3>
    <p>Your rounds are yours. Cards are shared records: everybody who was on one may correct it, and every correction is logged. A society's organiser decides how it is scored and who may read its table.</p>
    <h3>What we promise, and do not</h3>
    <p>We work to keep the service up and your data safe, and to fix what breaks. We do not promise that it is never down, that a handicap worked out here is the one your club would give you, or that a rating for a course is correct: check the card in the clubhouse before a competition.</p>
    <h3>Ending</h3>
    <p>You can delete your account at any time. We may close accounts that break these terms. Purchases, where the shop is on, are one-off and not refunded after use unless the law says otherwise.</p>
    <h3>Changes</h3>
    <p>If these terms change in a way that matters, the app says so before you continue.</p>
    <p class="muted small">Last changed 28 September 2026.</p></div>`, { back: back(), bell: false });
}
