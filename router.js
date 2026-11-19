// Hash routes, and the gate. Signed out, the only screens that exist are the way in and the pages a link
// opens -- a board, a card, an invite, a friend link -- which need no account by design.
import * as S from "./store.js";
import * as Y from "./sync.js";
import * as A from "./auth.js";
import { ui, paint, themeHere, hideToast, rememberIntent } from "./ui.js";
import { keepAwake } from "./native.js";
import { welcome, signin, join, add, you, getApp } from "./screens/gate.js";
import { home } from "./screens/home.js";
import { play, newRound, loops } from "./screens/play.js";
import { players } from "./screens/players.js";
import { stats, bagPage } from "./screens/mine.js";
import { joinCard } from "./screens/together.js";
import { liveScreen } from "./screens/live.js";
import { score } from "./screens/score.js";
import { review, attach } from "./screens/review.js";
import { graphics, leagueImages } from "./screens/graphics.js";
import { leagues } from "./screens/leagues.js";
import { league } from "./screens/league.js";
import { people, person, player } from "./screens/people.js";
import { updates } from "./screens/updates.js";
import { me } from "./screens/me.js";
import { newCourse, scan } from "./screens/course.js";
import { board, card } from "./screens/public.js";
import { privacy, terms } from "./screens/legal.js";
import { partners, partner, admin, redeem } from "./screens/partner.js";
import { event, newEvent } from "./screens/event.js";

const screens = { home, welcome, signin, join, add, you, get: getApp, j: joinCard, live: liveScreen, stats, bag: bagPage, board, card, play, new: newRound, loops, players, score, review, attach, graphics,
  people, person, player, leagues, league, leagueimages: leagueImages, leagueposter: leagueImages, statsposter: leagueImages, updates, me, newcourse: newCourse, scan, partners, partner, admin, redeem, event, newevent: newEvent,
  legal: which => (which === "terms" ? terms() : privacy()) };

const OPEN_SCREENS = ["welcome", "signin", "board", "card", "join", "add", "you", "legal", "get", "live"];
// what a course, a company or the operator runs from a laptop: past the door in any browser, signing in on the page itself
const WEB_SCREENS = ["partner", "admin", "redeem"];
export const gated = () => Y.enabled() && !A.signedIn();

export function route() {
  hideToast();
  const [name, ...args] = location.hash.replace(/^#/, "").split("/");
  keepAwake(name === "score" || (name === "live" && args[1] === "tv"));
  // In any browser there is one screen: how to get Hagolf onto this device. The link screens stay open, since
  // a shared board, a card or an invite is meant to be opened by somebody who has no app yet, and the door
  // keeps its own way through for anyone it cannot actually help. The hash is left alone, so whoever walks
  // through arrives at the screen they asked for.
  if (WEB_SCREENS.includes(name)) { paint(themeHere()); return screens[name](...args.map(decodeURIComponent)); }
  if (gated() && !OPEN_SCREENS.includes(name)) {
    if (name && name !== "home") rememberIntent(location.hash);   // finish the journey once signed in
    return welcome();
  }
  // signed in but not yet named on this phone: the name step comes before anything else
  const a = A.account();
  if (a && (!a.name || !S.state.settings.welcomed) && !OPEN_SCREENS.includes(name)) {
    if (name && name !== "home") rememberIntent(location.hash);
    return welcome();
  }
  paint(themeHere());
  // the card on screen is the one watched live; anywhere else nothing is
  Y.watchRound(["score", "review", "players", "event"].includes(name) && args[0] ? decodeURIComponent(args[0]) : null);
  ui.expanded = name === "review" ? ui.expanded : null;
  if (name !== "people" && name !== "play") { ui.search = ""; ui.found = null; }
  if (name !== "new") ui.courseQ = "";   // the country chip is a preference and stays; the search box is not
  (screens[name] || home)(...args.map(decodeURIComponent));
}
