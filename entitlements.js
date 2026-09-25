// What this phone may render, from what its account holds. The list travels with the session, so it is here
// offline exactly as long as the session is: a phone on the tenth with no signal still renders in a skin that
// was paid for, and nothing is ever checked live.
//
// The gate is only closed for a signed-in account on a backend that has the catalogue switched on (`shop`
// in the account). A solo phone with no backend, or a backend that has not thrown the switch, is the app as it
// always was -- nothing is taken away from anyone until the day everything that exists is grandfathered.
//
// Read access is never revoked: a league already ranked on a format its owner no longer holds keeps
// rendering, a league theme already chosen keeps painting. The gate is on choosing, not on what was chosen.
import * as A from "./auth.js";

export const FREE_THEMES = ["hagolf", "paper"];
export const FORMAT_SKU = { match: "matchplay", matchpts: "matchplay", soccer: "matchplay", soccerpts: "matchplay", gp: "grandprix", gpstroke: "grandprix" };

export const enforced = () => { const a = A.account(); return !!(a && a.shop); };
export function skus() { const a = A.account(); return new Set((a && a.entitlements) || []); }

export function has(sku) {
  if (!enforced()) return true;
  const s = skus();
  return s.has("pass") || s.has(sku);
}

export const canTheme = name => FREE_THEMES.includes(name) || has("skins") || has(`skin:${name}`);
export const boardTier = () => has("boards") ? "full" : "basic";
export const cardTier = () => has("card") ? "full" : "basic";
export const formatAllowed = f => !FORMAT_SKU[f] || has(FORMAT_SKU[f]);
export const marked = () => !has("nomark");
export const seasonAllowed = () => has("season");
