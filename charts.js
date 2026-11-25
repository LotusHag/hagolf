// Charts draw themselves the first time they come into view after the app opens, in the theme's own hand
// (themes/<name>.motion.css sets how), and after that they are simply there: a second visit, a redraw from a sync
// or scrolling back up shows them still. DESIGN-RULES.md, "Motion that does not look generated", sets the limits.

// what each kind of mark is, and the way it grows: from its left edge, its right edge, the bottom, swept on, or
// out from the tee; a donut's segments are drawn round in order
const PARTS = [
  [".dbar, .tug, svg.tchart, svg.tspark, svg.sandpit .pballs", "wipe"],
  [".tbar > i, .btrack > i, .mtrack > i, .dvtrack > i:not(.down)", "x"],
  [".dvtrack > i.down", "xr"],
  [".fchart .fbar, .fchart .fghost, .pplot > i, .mchart .mbar", "y"],
  ["svg.teefan path.fan", "fan"],
  ["svg.donut .dseg", "ring"],
];

const played = new Set();
let hiddenAt = 0;
// a phone that comes back to the app after a long while has, to its owner, opened it again
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) played.clear();
});

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ms = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
let io = null;

// Each theme sets the donut's centre in its own font, so whether it fits the hole is measured, not assumed. The hole is
// 90 across at its middle but narrower where the figure's top and the label sit.
const FIG = 76, LABEL = 78, LOW = 70;
const shrinkTo = (el, w, room) => { if (w > room) el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * room) / w}px`; };
export function fitDonuts(main) {
  if (!main) return;
  main.querySelectorAll("svg.donut").forEach(svg => {
    const big = svg.querySelector(".dbig"), small = svg.querySelector(".dsmall");
    if (!big || !small) return;
    const words = small.dataset.words ?? (small.dataset.words = small.textContent);
    small.textContent = words;
    big.style.fontSize = small.style.fontSize = "";
    big.setAttribute("y", 70); small.setAttribute("y", 89);
    const w = small.getComputedTextLength();
    if (!w) return;
    const mid = words.length / 2, cut = [...words].reduce((b, c, i) => c === " " && Math.abs(i - mid) < Math.abs(b - mid) ? i : b, -1);
    if (w > LABEL && cut > 0) {
      small.innerHTML = "";
      [words.slice(0, cut), words.slice(cut + 1)].forEach((line, i) => {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        t.setAttribute("x", 70); t.setAttribute("dy", i ? 11 : 0); t.textContent = line;
        small.append(t);
      });
      big.setAttribute("y", 69); small.setAttribute("y", 85);
      // the lower line sits where the hole is narrower
      shrinkTo(small, Math.max(...[...small.children].map(t => t.getComputedTextLength())), LOW);
    } else shrinkTo(small, w, LABEL);
    shrinkTo(big, big.getComputedTextLength(), FIG);
  });
}
// a theme's font arriving late changes every width measured before it
document.fonts?.addEventListener?.("loadingdone", () => fitDonuts(document.querySelector("#app main")));

/** Readies every chart on a freshly drawn screen; each plays when it is first seen, `after` ms from now at the soonest. */
export function charts(main, after = 0) {
  if (io) io.disconnect();
  if (!main || still()) return;
  const groups = new Map();
  for (const [sel, kind] of PARTS) main.querySelectorAll(sel).forEach(el => {
    const g = el.closest(".card") || el.parentElement;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([el, kind]);
  });
  if (!groups.size) return;
  const cards = [...main.querySelectorAll(".card")], css = getComputedStyle(document.documentElement);
  const sweep = ms(css.getPropertyValue("--chart-sweep"), 220), dur = ms(css.getPropertyValue("--chart-dur"), 420);
  const waiting = [];
  for (const [g, parts] of groups) {
    const key = `${location.hash}|${cards.indexOf(g)}|${parts[0][1]}|${parts.length}`;
    if (played.has(key)) continue;
    // left to right, top to bottom: the order the marks sit on the page, not the order they were found in
    parts.sort((a, b) => a[0].compareDocumentPosition(b[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const n = parts.length;
    parts.forEach(([el, kind], i) => {
      el.classList.add(`cg-${kind}`);
      if (kind === "ring") {
        // each segment drawn in the time its share of the ring takes, starting where the last one stopped
        const r = Number(el.getAttribute("r")) || 1, C = 2 * Math.PI * r;
        const on = parseFloat(el.getAttribute("stroke-dasharray")) || 0, off = -parseFloat(el.getAttribute("stroke-dashoffset") || 0);
        el.style.setProperty("--d", `${Math.round((off / C) * dur)}ms`);
        el.style.setProperty("--dur", `${Math.max(40, Math.round((on / C) * dur))}ms`);
      } else el.style.setProperty("--d", `${n > 1 ? Math.round((i / (n - 1)) * sweep) : 0}ms`);
    });
    g.classList.add("chart-wait");
    g.dataset.chartKey = key;
    waiting.push(g);
  }
  if (!waiting.length) return;
  io = new IntersectionObserver(seen => seen.forEach(e => {
    if (!e.isIntersecting) return;
    const g = e.target;
    io.unobserve(g);
    played.add(g.dataset.chartKey);
    g.classList.replace("chart-wait", "chart-in");
    setTimeout(() => g.classList.remove("chart-in"), dur + sweep + 120);
  }), { threshold: 0.25 });
  setTimeout(() => waiting.forEach(g => g.isConnected && io && io.observe(g)), after);
}
