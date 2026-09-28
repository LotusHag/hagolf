// The catalogue, in one place and out of the scoring flow. Buying happens on Stripe's page.
import { DATA } from "../data.js";
import * as A from "../auth.js";
import * as E from "../entitlements.js";
import { page, bind, esc, go, toast } from "../ui.js";

export async function shop(state) {
  if (state === "thanks") {
    try { await A.whoami(); } catch (e) { /* offline: the next refresh brings it */ }
    toast("Thank you. It is yours, on every phone you sign in on.", 5000);
    return go("#shop");
  }
  if (!A.account()) return page("Shop", `<div class="banner"><a href="#welcome">Sign in</a> first: what you buy follows your account to every phone.</div>`, { back: "#me" });
  page("Shop", `<p class="muted center" style="margin-top:30px">Loading…</p>`, { back: "#me" });
  let cat;
  try { cat = await A.api("/shop/catalogue"); } catch (e) { return page("Shop", `<div class="banner warn">${esc(e.message)}</div>`, { back: "#me" }); }
  const eur = c => `€${(c / 100).toFixed(2).replace(".", ",")}`;
  const row = c => `<div class="card"><div class="row"><div><div class="name">${esc(c.name)}</div><div class="muted small">${esc(c.blurb)}</div></div>
    ${c.owned ? `<span class="pill done">Yours</span>` : `<button class="btn small primary" data-act="buy" data-sku="${esc(c.sku)}" ${cat.stripe ? "" : "disabled"}>${eur(c.price)}</button>`}</div></div>`;
  const all = cat.skus.some(c => (c.sku === "pass" || c.sku === "skins") && c.owned);
  const skins = DATA.themes.filter(t => !cat.freeThemes.includes(t.name)).map(t => ({ sku: `skin:${t.name}`, name: `The ${t.name} skin`, blurb: t.blurb || "", price: cat.skinPrice, owned: all || cat.skins.includes(t.name) }));
  page("Shop", `
    <p class="muted small" style="margin:4px 4px 10px">Scoring a round, keeping a league and inviting people are free, and always will be. What is sold is how the output looks and how much it says.${cat.open ? "" : " <b>Nothing is gated yet.</b>"}${cat.stripe ? "" : " Buying is not open yet."}</p>
    ${cat.skus.filter(c => c.sku !== "skins").map(row).join("")}
    <h2>Skins</h2>
    <p class="muted small" style="margin:-4px 4px 10px">A skin dresses the app itself as well as every poster and card. ${esc(cat.freeThemes.join(" and "))} are free.</p>
    ${row(cat.skus.find(c => c.sku === "skins"))}${skins.map(row).join("")}
    <p class="foot">Bought once, on the web, never inside an app store. Yours on every phone you sign in on.</p>`, { back: "#me", sub: "Bought once, yours on every phone" });
  bind(async ev => {
    const b = ev.target.closest("[data-act=buy]");
    if (!b) return;
    b.disabled = true;
    try { const r = await A.api("/shop/checkout", { sku: b.dataset.sku }); location.href = r.url; } catch (e) { toast(e.message, 5000); b.disabled = false; }
  });
}
