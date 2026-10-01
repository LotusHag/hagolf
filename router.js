// Hash routes, and the gate. Signed out, the only screens that exist are the way in and the pages a link
// opens -- a board, a card, an invite, a friend link -- which need no account by design.
import * as S from "./store.js";
import * as Y from "./sync.js";
import * as A from "./auth.js";
import { ui, paint, themeHere, hideToast, rememberIntent, desktopWeb } from "./ui.js";
import { welcome, signin, join, add } from "./screens/gate.js";
import { home } from "./screens/home.js";
import { play, newRound, loops } from "./screens/play.js";
import { players } from "./screens/players.js";
import { score } from "./screens/score.js";
import { review, attach } from "./screens/review.js";
import { graphics, leaguePoster, statsPoster } from "./screens/graphics.js";
import { leagues } from "./screens/leagues.js";
import { league } from "./screens/league.js";
import { people, person, player } from "./screens/people.js";
import { updates } from "./screens/updates.js";
import { me } from "./screens/me.js";
import { newCourse, scan } from "./screens/course.js";
import { board, card } from "./screens/public.js";
import { privacy, terms } from "./screens/legal.js";
import { shop } from "./screens/shop.js";

const screens = { home, welcome, signin, join, add, board, card, shop, play, new: newRound, loops, players, score, review, attach, graphics,
  people, person, player, leagues, league, leagueposter: leaguePoster, statsposter: statsPoster, updates, me, newcourse: newCourse, scan,
  legal: which => (which === "terms" ? terms() : privacy()) };

const OPEN_SCREENS = ["welcome", "signin", "board", "card", "join", "add", "legal"];
export const gated = () => Y.enabled() && !A.signedIn();

export function route() {
  hideToast();
  const [name, ...args] = location.hash.replace(/^#/, "").split("/");
  // in a browser there is one screen: how to install. The link screens stay open, since a shared board or an
  // invite is meant to be opened by somebody who has no app yet.
  if (desktopWeb() && !OPEN_SCREENS.includes(name)) return welcome();
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
  ui.expanded = name === "review" ? ui.expanded : null;
  if (name !== "review") ui.reviewOrder = {};
  if (name !== "people" && name !== "play") { ui.search = ""; ui.found = null; }
  if (name !== "new") ui.courseQ = "";   // the country chip is a preference and stays; the search box is not
  (screens[name] || home)(...args.map(decodeURIComponent));
}
