// The Shots tab: strokes gained first, then the ball's own way round -- off the tee, into the green, around it, and in.
import { esc, plural, h2tip } from "../ui.js";
import { fix, fmtSigned, fmtPct, strokesGained } from "../model.js";
import { SG_TIP } from "./extras.js";

const signClass = v => v > 0.05 ? "up" : v < -0.05 ? "down" : "";
const pctOf = (part, of) => of ? Math.round((part / of) * 100) : 0;

/** A figure that leads a section: the number big, what it is under it. */
export const lead = (big, label, sub = "", cls = "") => `<div><b class="num ${cls}">${esc(big)}</b><small>${esc(label)}</small>${sub ? `<i>${esc(sub)}</i>` : ""}</div>`;
export const leads = xs => `<div class="sleads">${xs.join("")}</div>`;

/** One row out from a zero line, left for strokes lost and right for strokes gained, all on one scale. */
function divRows(rows) {
  const top = Math.max(1, ...rows.map(r => Math.abs(r.v)));
  return `<div class="dvrows">${rows.map(r => {
    const w = (Math.abs(r.v) / top) * 50;
    return `<div class="dvrow"><span>${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>
      <div class="dvtrack"><i class="${signClass(r.v) || "flat"}" style="left:${r.v >= 0 ? 50 : 50 - w}%;width:${w}%"></i></div>
      <b class="num ${signClass(r.v)}">${fmtSigned(r.v, 2)}</b></div>`;
  }).join("")}</div>`;
}

/** A share of attempts as a filled track, always a percentage, with the count it came from beside the name. */
const meter = (label, part, of, cls = "") => `<div class="mrow"><span>${esc(label)}<small>${part} of ${of}</small></span>
  <div class="mtrack"><i class="${cls}" style="width:${pctOf(part, of)}%"></i></div><b class="num">${pctOf(part, of)}%</b></div>`;

/**
 * Rows of one measure on one scale from zero, each with a line of detail under it. `mark` is the level every bar is
 * read against; a bar that passes it is drawn in the good colour.
 */
export function barRows(rows, { top = 0, mark = null } = {}) {
  const max = Math.max(top, mark || 0, ...rows.map(r => r.v), 0.01);
  const at = v => `${Math.min(100, Math.max(0, (v / max) * 100)).toFixed(1)}%`;
  return `<div class="brows">${rows.map(r => `<div class="brow"><div class="bhead"><span>${esc(r.label)}</span><b class="num">${esc(r.big)}</b></div>
    <div class="btrack"><i class="${mark !== null && r.v > mark ? "up" : ""}" style="width:${at(r.v)}"></i>${mark === null ? "" : `<em style="left:${at(mark)}"></em>`}</div>
    ${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</div>`).join("")}</div>`;
}
export const markKey = words => `<p class="bkey"><em></em>${esc(words)}</p>`;

// ---------------------------------------------------------------- strokes gained
function sgSection(sg, who) {
  if (!sg || sg.total === null || !sg.holes) return "";
  // a split over a hole or two, scaled to 18, is one putt multiplied into a verdict
  const per = sg.split && sg.split.holes >= 9 ? sg.split.per18 : null;
  const pars = Object.keys(sg.byPar || {}).filter(k => sg.byPar[k].holes >= 3).sort();
  const split = per ? divRows([
    { label: "Tee to green", v: per.teeToGreen },
    { label: "Putting", v: per.putting },
  ]) : "";
  const note = per ? "" : sg.split ? `Putting splits off after 9 holes with putts on both cards; ${sg.split.holes} so far.` : "";
  // the split is measured only against players who kept putts too, a different baseline from the total's
  const splitTip = per && (sg.split.holes < sg.holes || Math.abs(per.total - sg.per18) >= 0.05)
    ? `<p>Here tee to green and putting are measured only against the players who kept putts as well, over ${plural(sg.split.holes, "hole")}. Against them you gained ${fmtSigned(per.total, 2)} a round, which is what the two add up to.</p>` : "";
  return `${h2tip("Strokes gained", SG_TIP + `<p><b>By the kind of hole</b> is the same total split between par 3s, 4s and 5s, so the three add back up to it.</p>${splitTip}`, "gained")}
    <div class="card sgcard">
      <div class="sgtop"><b class="num ${signClass(sg.per18)}">${fmtSigned(sg.per18, 2)}</b>
        <span>a round against ${esc(who)}<small>${plural(sg.holes, "hole")}${sg.rounds > 1 ? ` over ${plural(sg.rounds, "round")}` : ""}</small></span></div>
      ${split}
      ${note ? `<p class="muted small" style="margin:10px 0 0">${esc(note)}</p>` : ""}
      ${pars.length > 1 ? `<div class="subhead">By the kind of hole</div>${divRows(pars.map(k => ({ label: `Par ${k}s`, sub: `${fmtSigned(sg.byPar[k].perHole, 2)} a hole`, v: sg.byPar[k].per18 })))}` : ""}
    </div>`;
}

// ---------------------------------------------------------------- off the tee
/** Where the tee shots went, fanned out from the tee: the longer the arm, the more often the ball went that way. */
function teeFan(hit, left, right) {
  const total = hit + left + right;
  if (!total) return "";
  const W = 300, R = 118, H = R + 50, cx = W / 2, cy = H - 8, r0 = 30;
  const arms = [["left", left, -62, -22], ["hit", hit, -20, 20], ["right", right, 22, 62]];
  const top = Math.max(...arms.map(a => a[1]));
  const pt = (deg, r) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
  const wedge = (a0, a1, r) => {
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r), [u0, v0] = pt(a0, r0 * 0.4), [u1, v1] = pt(a1, r0 * 0.4);
    return `M${u0.toFixed(1)},${v0.toFixed(1)} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} L${u1.toFixed(1)},${v1.toFixed(1)} Z`;
  };
  const words = { left: "left", hit: "fairway", right: "right" };
  const svg = arms.map(([k, n, a0, a1]) => {
    // the area of an arm, not its length, is what the eye reads, so the length goes with the square root
    const r = n ? r0 + (R - r0) * Math.sqrt(n / top) : r0 * 0.4;
    // every label sits just past the grey wedge, off the arms, so a short arm never has its number drawn across it
    const [lx, ly] = pt((a0 + a1) / 2, R + 14);
    return `<path class="fanbg" d="${wedge(a0, a1, R)}"></path><path class="fan ${k}" d="${wedge(a0, a1, r)}"><title>${esc(`${words[k]}: ${n} of ${total}`)}</title></path>
      <text class="fanv" x="${lx.toFixed(1)}" y="${(ly - 12).toFixed(1)}">${pctOf(n, total)}%</text><text class="fanl" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${words[k]}</text>`;
  }).join("");
  return `<svg class="teefan" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Tee shots: ${pctOf(left, total)}% left, ${pctOf(hit, total)}% on the fairway, ${pctOf(right, total)}% right`)}">${svg}<circle class="fantee" cx="${cx}" cy="${cy}" r="4"></circle></svg>`;
}

function teeSection(x) {
  const f = x.fairway;
  if (!f || f.holes < 4) return "";
  const L = f.misses.left, R = f.misses.right, sideless = f.holes - f.hit - L - R;
  const bias = L + R < 4 ? "" : Math.abs(L - R) <= Math.max(1, (L + R) * 0.15) ? "Misses go both ways."
    : `Misses go ${L > R ? "left" : "right"}: ${Math.max(L, R)} of ${L + R}.`;
  const ff = x.fromFairway;
  return `${h2tip("Off the tee", `<p>Every par 4 and par 5 where the tee shot was kept: on the fairway, or missed left or right. A par 3 has no fairway, so it is never asked.</p>
      <p><b>From the fairway</b> and <b>from the rough</b> are how often the green was then hit in regulation, which is what finding the fairway is worth to you.</p>${sideless > 0 ? `<p>${plural(sideless, "miss", "misses")} kept without a side ${sideless === 1 ? "is" : "are"} left out of the fan.</p>` : ""}`, "tee")}
    <div class="card">
      ${leads([lead(fmtPct(f.pct), "fairways hit", `${f.hit} of ${f.holes}`)])}
      ${teeFan(f.hit, L, R)}
      ${bias ? `<p class="muted small center" style="margin:4px 0 0">${esc(bias)}</p>` : ""}
      ${ff ? `<div class="subhead">Greens hit after it</div>${meter("From the fairway", ff.hit.gir, ff.hit.holes, "up")}${meter("From the rough", ff.miss.gir, ff.miss.holes)}` : ""}
    </div>`;
}

// ---------------------------------------------------------------- into the green
function approachSection(x) {
  const g = x.gir;
  if (!g || g.holes < 4) return "";
  const pars = Object.keys(x.girByPar || {}).filter(k => x.girByPar[k].holes >= 3).sort();
  const extra = [];
  if (x.birdies && x.birdies.holes >= 6) extra.push(lead(fmtPct(x.birdies.pct), "greens turned into birdies", `${x.birdies.made} of ${x.birdies.holes}`));
  if (x.fromGir) extra.push(lead(fix(x.fromGir.edge, 2), "strokes a green saves", `${fmtSigned(x.fromGir.hit.topar, 2)} on, ${fmtSigned(x.fromGir.miss.topar, 2)} off`));
  return `${h2tip("Into the green", `<p><b>Greens in regulation</b>: on the green with two strokes still left for par. Worked out from your strokes and your putts, never asked for.</p>
      <p><b>Greens turned into birdies</b> is how often a green in regulation became a birdie or better. <b>Strokes a green saves</b> is how much better against par you play a hole where you hit the green than one where you missed it.</p>`, "approach")}
    <div class="card">
      ${leads([lead(fmtPct(g.pct), "greens in regulation", `${g.hit} of ${g.holes}`), lead(fix((g.hit / g.holes) * 18, 1), "greens a round")])}
      ${pars.length > 1 ? `<div class="subhead">By the kind of hole</div>${pars.map(k => meter(`Par ${k}s`, x.girByPar[k].hit, x.girByPar[k].holes, "up")).join("")}` : ""}
      ${extra.length ? `<div class="sgap"></div>${leads(extra)}` : ""}
    </div>`;
}

// ---------------------------------------------------------------- around it
function shortSection(x) {
  const rows = [];
  if (x.upDown && x.upDown.holes >= 4) rows.push(meter("Up and down", x.upDown.made, x.upDown.holes, "up"));
  if (x.sand && x.sand.holes >= 3) rows.push(meter("Sand saves", x.sand.saved, x.sand.holes, "up"));
  const pen = x.penalty && x.penalty.holes >= 9 ? x.penalty : null;
  if (!rows.length && !pen) return "";
  return `${h2tip("Around the green", `<p><b>Up and down</b>: the green missed in regulation and par or better made anyway. <b>Sand saves</b> ask the same of a greenside bunker. Neither is asked for; both come from your score.</p>
      <p><b>Penalty shots</b> are counted a round of 18, over the holes where you kept them.</p>`, "bunker")}
    <div class="card">${rows.join("")}
      ${pen ? `${rows.length ? `<div class="sgap"></div>` : ""}${leads([lead(fix((pen.total / pen.holes) * 18, 1), "penalty shots a round", `${pen.total} over ${plural(pen.holes, "hole")}`)])}` : ""}</div>`;
}

// ---------------------------------------------------------------- on it
/** How many putts each green took, as columns: what share of holes were one-putts, two, three or more. */
function puttColumns(p) {
  const two = p.holes - p.none - p.one - p.three;
  const cols = [[p.none, "holed off", "it"], [p.one, "one", "putt"], [two, "two", "putts"], [p.three, "three+", "putts"]]
    .map(([n, a, b], i) => ({ n, a, b, k: ["chip", "one", "two", "three"][i] })).filter(c => c.k !== "chip" || c.n);
  const top = Math.max(...cols.map(c => c.n), 1);
  return `<div class="pcols">${cols.map(c => `<div class="pcol"><b class="num">${pctOf(c.n, p.holes)}%</b>
      <div class="pplot"><i class="${c.k}" style="height:${Math.max((c.n / top) * 100, c.n ? 3 : 0)}%"></i></div>
      <small>${esc(c.a)} ${esc(c.b)}<i>${c.n}</i></small></div>`).join("")}</div>`;
}

function puttSection(x) {
  const p = x.putts;
  if (!p || p.holes < 4) return "";
  const heads = [lead(fix(p.per18, 1), "putts a round", `over ${plural(p.holes, "hole")}`)];
  if (p.onGir !== null && p.onGirHoles >= 5) heads.push(lead(fix(p.onGir, 2), "putts a green hit", plural(p.onGirHoles, "green")));
  heads.push(lead(fix((p.three / p.holes) * 18, 1), "three-putts a round"));
  return `${h2tip("On the green", `<p>Every hole where putts were kept. <b>Putts a round</b> is the average scaled to 18 holes. <b>Putts a green hit</b> counts only the greens reached in regulation, where the first putt is usually the long one, so it is the fairer measure of the putter.</p>
      <p>The columns are how many putts each hole took, as a share of the holes. A hole chipped in or holed from off the green took none.</p>`, "putt")}
    <div class="card">${leads(heads)}${puttColumns(p)}</div>`;
}

/** The whole tab. `cards` are league cards for strokes gained; `x` the player's summed extras. */
export function shotsBody(x, cards, pid, who) {
  const sg = cards.length ? strokesGained(cards, pid) : null;
  const any = x && x.any;
  return [
    sgSection(sg, who),
    any ? teeSection(x) : "",
    any ? approachSection(x) : "",
    any ? shortSection(x) : "",
    any ? puttSection(x) : "",
  ].join("");
}
