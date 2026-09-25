// Port of golf/model.py and golf/handicap.py. Same rules, same numbers: see app/tests/model.test.mjs.

// A hole with no score on a finished round counts as this many strokes, so one forgotten or picked-up
// hole no longer keeps a whole card off the boards. Keep in step with NO_SCORE in golf/model.py.
export const NO_SCORE = 10;

export function roundHalfUp(x) {
  // 0.5 rounds up; the epsilon absorbs binary floating point (22.6*122/113-2.9 = 21.4999...).
  return Math.floor(x + 0.5 + 1e-9);
}

export function courseHandicap(index, cr, slope, par, n) {
  // WHS. A 9-hole round uses half the index, not rounded first (that is how the club tables are built).
  if (n === 9) index = index / 2;
  else if (n !== 18) throw new Error(`course handicap knows 9 and 18 hole rounds, not ${n}`);
  return roundHalfUp(index * slope / 113 + (cr - par));
}

export function playingHandicap(ch, allowance = 100) {
  return allowance === 100 ? ch : roundHalfUp(ch * allowance / 100);
}

export function siRanks(si) {
  const order = si.map((v, h) => h).sort((a, b) => si[a] - si[b]);
  const ranks = new Array(si.length);
  order.forEach((h, r) => { ranks[h] = r + 1; });
  return ranks;
}

export function strokesPerHole(ch, si) {
  const n = si.length, ranks = siRanks(si);
  if (ch >= 0) {
    const base = Math.floor(ch / n), extra = ch % n;
    return ranks.map(r => base + (r <= extra ? 1 : 0));
  }
  const base = Math.floor(-ch / n), extra = (-ch) % n;
  return ranks.map(r => -(base + (r > n - extra ? 1 : 0)));
}

export function stableford(score, par, strokes) {
  return Math.max(0, 2 - (score - strokes - par));
}

export function ranks(values, lowerIsBetter = true) {
  return values.map(v => 1 + values.filter(w => lowerIsBetter ? w < v : w > v).length);
}

export function countbackSegments(n) {
  return n === 18 ? [9, 6, 3] : [6, 3];
}

export function outcome(delta) {
  return delta < 0 ? 0 : delta === 0 ? 1 : delta === 1 ? 2 : 3;
}

function mean(xs) {
  xs = xs.filter(x => x !== null && x !== undefined);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const sum = xs => xs.reduce((a, b) => a + b, 0);

function cmpTuple(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function fileSlug(name) {
  // File-name safe ASCII: Örjan Åström -> Orjan_Astrom, "van 't Hag" -> van_t_Hag
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7F]/g, "");
  return ascii.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "player";
}

/** Validates a course as build.py emits it and returns it with derived fields. */
export function prepareCourse(c) {
  const n = c.par.length;
  const first = c.first_hole || 1;
  const tees = {};
  for (const [tee, t] of Object.entries(c.tees)) {
    const par = t.par || c.par;
    tees[tee] = { ...t, par, par_total: sum(par), rated: Object.keys(t.ratings || {}).length > 0 };
  }
  return { ...c, n, tees, course_par: sum(c.par), labels: c.par.map((_, h) => String(first + h)) };
}

/**
 * The checks golf/model.py makes when it reads a course file, which nothing used to apply to a course typed
 * or scanned on a phone: those reach every other phone through the courses table without passing the desktop
 * kit at all. Throws an Error a person can act on. Takes a course in build.py's shape, before prepareCourse.
 */
export function validateCourse(c) {
  const name = c.name || c.slug || "course";
  const par = c.par, si = c.stroke_index;
  if (!Array.isArray(par) || !par.length || !Array.isArray(si) || !si.length) throw new Error(`${name}: needs par and stroke_index lists`);
  const n = par.length;
  if (n !== 9 && n !== 18) throw new Error(`${name}: ${n} holes, the handicap maths only knows 9 and 18 hole rounds`);
  if (par.some(p => !(p >= 3 && p <= 6))) throw new Error(`${name}: par needs a number between 3 and 6 for every hole`);
  if (si.length !== n) throw new Error(`${name}: par has ${n} holes but stroke_index has ${si.length}`);
  if (new Set(si).size !== n) throw new Error(`${name}: stroke_index has duplicates, every hole needs its own index`);
  if (!c.tees || !Object.keys(c.tees).length) throw new Error(`${name}: needs at least one tee with a course rating and slope`);
  for (const [tee, t] of Object.entries(c.tees)) {
    const tp = Array.isArray(t.par) ? t.par : par;
    if (tp.length !== n) throw new Error(`${name}: tee ${tee} par list has ${tp.length} holes for ${n}`);
    const parTotal = sum(tp);
    for (const [g, r] of Object.entries(t.ratings || {})) {
      if (!(r.cr > 0) || !(r.slope >= 55 && r.slope <= 155)) throw new Error(`${name}: tee ${tee} ${g === "f" ? "women's" : "men's"} rating needs a course rating and a slope between 55 and 155`);
      if (Math.abs(r.cr - parTotal) > 10) throw new Error(`${name}: tee ${tee} course rating ${r.cr} does not fit par ${parTotal} (an 18-hole rating on a 9-hole course?)`);
    }
    if (t.metres && t.metres.length !== n) throw new Error(`${name}: tee ${tee} has ${t.metres.length} lengths for ${n} holes`);
  }
  if ((c.nines || []).length && c.nines.length * 9 !== n) throw new Error(`${name}: nines lists ${c.nines.length} loops for ${n} holes`);
  return c;
}

// ---------------------------------------------------------------- clubs: a course is one way of walking a club
/**
 * A club draft -- what the "add a course" wizard has after the course database answered and the card was
 * photographed -- turned into one course per way of walking it: each nine on its own and, where the club has
 * two or more, every ordered pair. The rules are the ones courses/source/build_courses.py applies on the PC,
 * so a club added on a phone is put together the same way as one shipped with the kit:
 *   - the club's own numbers win wherever it publishes them, and a pair reversed is the same 18 holes;
 *   - otherwise an 18-hole rating is its two nines added with their slopes averaged, and its stroke index is
 *     the nines' difficulty order interleaved, odd numbers out and even back.
 * Every course says in `provenance` which of its numbers were published and which were worked out here.
 *
 * `club` is { name, slug, where, tees: [tee], loops: [{ key, name, short, family, alone, paired, par, rank,
 * stroke_index, metres: {tee: []}, ratings: {tee: {m|f: [cr, slope]}} }], layouts: [{ nines, slug, name,
 * stroke_index, ratings }] }.
 */
export function coursesFromClub(club) {
  const loops = club.loops || [];
  const nines = loops.filter(l => l.par.length === 9).map(l => l.key);
  const composes = nines.length >= 2;
  const keys = loops.map(l => [l.key]).concat(composes ? nines.flatMap(a => nines.filter(b => b !== a).map(b => [a, b])) : []);
  return keys.map(k => courseFromClub(club, k, composes));
}

const loopOf = (club, key) => (club.loops || []).find(l => l.key === key);
const layoutOf = (club, keys) => (club.layouts || []).find(l => String(l.nines) === String(keys));
const round1 = x => Math.round(x * 10) / 10;

/** The club's own ratings for these holes, and whether they are printed under the reverse order. */
function publishedRatings(club, keys) {
  const here = layoutOf(club, keys), back = layoutOf(club, [...keys].reverse());
  if (here && here.ratings) return { ratings: here.ratings, reversed: false };
  if (back && back.ratings) return { ratings: back.ratings, reversed: true };
  return null;
}

/** A nine the club does not rate on its own: its 18-hole tables minus the other nine, averaged. */
function nineRating(club, key) {
  const out = {};
  for (const tee of club.tees || []) {
    for (const g of ["m", "f"]) {
      const crs = [], srs = [];
      for (const other of (club.loops || []).map(l => l.key)) {
        if (other === key) continue;
        const base = ((loopOf(club, other).ratings || {})[tee] || {})[g];
        const pub = publishedRatings(club, [key, other]);
        const got = pub && (pub.ratings[tee] || {})[g];
        if (base && got) { crs.push(got[0] - base[0]); srs.push(2 * got[1] - base[1]); }
      }
      if (crs.length) (out[tee] = out[tee] || {})[g] = [round1(mean(crs)), Math.round(mean(srs))];
    }
  }
  return out;
}

/** { ratings by tee and gender, published: did the club give these?, reversed: from the other order? } */
function ratingsFor(club, keys) {
  if (keys.length === 1) {
    const lp = loopOf(club, keys[0]);
    if (lp.ratings && Object.keys(lp.ratings).length) return { ratings: lp.ratings, published: true, reversed: false };
    return { ratings: nineRating(club, keys[0]), published: false, reversed: false };
  }
  const pub = publishedRatings(club, keys);
  if (pub) return { ratings: pub.ratings, published: true, reversed: pub.reversed };
  const [a, b] = keys.map(k => ratingsFor(club, [k]).ratings);
  const out = {};
  for (const tee of club.tees || []) {
    for (const g of ["m", "f"]) {
      const x = (a[tee] || {})[g], y = (b[tee] || {})[g];
      if (x && y) (out[tee] = out[tee] || {})[g] = [round1(x[0] + y[0]), Math.round((x[1] + y[1]) / 2)];
    }
  }
  return { ratings: out, published: false, reversed: false };
}

/** { stroke index, published }. The order matters, so the reverse pair is no help here. */
function siFor(club, keys) {
  if (keys.length === 1) {
    const lp = loopOf(club, keys[0]);
    if (lp.stroke_index) return { si: lp.stroke_index, published: true };
    if (!lp.rank) throw new Error(`${lp.name || lp.key}: needs a stroke index, or the order its holes rank in`);
    return { si: lp.rank.map(r => 2 * r - 1), published: false };
  }
  const lay = layoutOf(club, keys);
  if (lay && lay.stroke_index) return { si: lay.stroke_index, published: true };
  const [a, b] = keys.map(k => loopOf(club, k));
  if (!a.rank || !b.rank) throw new Error(`${a.name} then ${b.name}: needs a stroke index on both nines`);
  return { si: a.rank.map(r => 2 * r - 1).concat(b.rank.map(r => 2 * r)), published: false };
}

function slugAndName(club, keys, composes) {
  const lay = layoutOf(club, keys);
  if (lay && lay.slug !== undefined && lay.slug !== null) return [lay.slug, lay.name];
  const lps = keys.map(k => loopOf(club, k));
  if (keys.length === 1) {
    const only = lps[0];
    const alone = only.alone === undefined ? only.key : only.alone;
    // Only a loop that is itself a nine is "…, 9 holes": a club can have two nines and a separate 18.
    return [alone, composes && only.par.length === 9 ? `${only.name}, 9 holes` : only.name];
  }
  const [a, b] = lps;
  const slug = `${a.paired || a.key}-${b.paired || b.key}`;
  if (a.family && a.family === b.family) return [slug, `${a.family} ${a.short} & ${b.short}`];
  return [slug, `${a.name} & ${b.name}`];
}

function courseFromClub(club, keys, composes) {
  const lps = keys.map(k => loopOf(club, k));
  const [tail, loopName] = slugAndName(club, keys, composes);
  const slug = [club.slug, tail].filter(Boolean).join("-");
  const par = lps.flatMap(l => l.par);
  const { ratings, published } = ratingsFor(club, keys);
  const { si, published: carded } = siFor(club, keys);
  const tees = {};
  for (const tee of club.tees || []) {
    const r = ratings[tee] || {};
    const metres = lps.flatMap(l => (l.metres || {})[tee] || []);
    const out = { ratings: {}, par, metres: metres.length === par.length ? metres : null };
    if (r.m) out.ratings.m = { cr: r.m[0], slope: r.m[1] };
    if (r.f) out.ratings.f = { cr: r.f[0], slope: r.f[1] };
    if (out.ratings.m || out.ratings.f || out.metres) tees[tee] = out;
  }
  const notes = [];
  if (!published) notes.push("ratings derived from the club's 18-hole tables, not published for this loop");
  if (!carded) notes.push("stroke index derived, no club card for this order");
  return {
    slug, name: club.name, loop: loopName, par, stroke_index: si, first_hole: 1,
    n: par.length, course_par: sum(par), tees,
    nines: composes ? keys.map(k => [club.slug, slugAndName(club, [k], composes)[0]].filter(Boolean).join("-")) : [],
    where: club.where || null,
    provenance: { ratings: published ? "published" : "derived", stroke_index: carded ? "published" : "derived" },
    source: club.source || "phone", notes,
  };
}

/** Course handicap, playing handicap and strokes per hole for one entry, before any score is in. Throws on bad input. */
export function handicapFor(courseIn, entry, defaultTee, allowance = 100) {
  const course = prepareCourse(courseIn);
  const tee = entry.tee || defaultTee;
  const t = course.tees[tee];
  if (!t) throw new Error(`tee '${tee}' is not on the course`);
  const hi = Number(entry.hi);
  if (!(hi >= -10 && hi <= 54)) throw new Error(`handicap index ${entry.hi} is outside the WHS range (+10 to 54)`);
  const gender = String(entry.gender || "m")[0];
  let ch;
  const override = entry.courseHandicap !== null && entry.courseHandicap !== undefined && entry.courseHandicap !== "";
  if (override) ch = Math.trunc(Number(entry.courseHandicap));
  else if (t.ratings && t.ratings[gender]) ch = courseHandicap(hi, t.ratings[gender].cr, t.ratings[gender].slope, t.par_total, course.n);
  else throw new Error(`the ${tee} tees have no ${gender === "f" ? "women's" : "men's"} rating on this course; pick another tee or set a course handicap`);
  const ph = playingHandicap(ch, Number(allowance) || 100);
  return { ch, ph, strokes: strokesPerHole(ph, course.stroke_index), par: t.par, tee };
}

/**
 * The gross and Stableford boards over a set of players on one course, countback and all, with the
 * places written onto the players. Shared by a round and by a league card of several rounds.
 */
function boards(players, n, segments) {
  const back = [...Array(n).keys()].reverse();
  const keyGross = p => [p.gross, ...segments.map(k => sum(p.scores.slice(n - k))), ...back.map(h => p.scores[h])];
  const keyPts = p => [-p.pts, ...segments.map(k => -sum(p.hpts.slice(n - k))), ...back.map(h => -p.hpts[h])];
  const finished = players.filter(p => !p.nr).sort((a, b) => cmpTuple(keyGross(a), keyGross(b)));
  const noReturn = players.filter(p => p.nr).sort((a, b) => cmpTuple([-a.holes_played, -a.pts], [-b.holes_played, -b.pts]));
  const stbl = [...players].sort((a, b) => cmpTuple(keyPts(a), keyPts(b)));
  // positions run 1, 2, 3 in board order: equal scores are separated by the countback, which the footer explains
  finished.forEach((p, i) => { p.gplace = i + 1; });
  noReturn.forEach(p => { p.gplace = null; });
  stbl.forEach((p, i) => { p.splace = i + 1; });
  players.forEach(p => { p.gtied = p.stied = false; p.gcb = p.scb = null; });
  return { gross_board: [...finished, ...noReturn], stbl_board: stbl };
}

/**
 * Computes a round. `course` is a DATA.courses entry, `round` is
 * { name, date, defaultTee, allowance, final, entries: [{ name, hi, tee, gender, courseHandicap, scores, penalties }] }.
 * On a final round (the default, and what Python always does) a hole with no score counts NO_SCORE strokes.
 * While one is still being scored (`final: false`) a card with holes left is listed in M.unfinished and left
 * off the boards instead, so the live view stays honest. Throws an Error with a readable message on bad input.
 */
export function compute(courseIn, round) {
  const course = prepareCourse(courseIn);
  const n = course.n, si = course.stroke_index;
  const defaultTee = round.defaultTee || Object.keys(course.tees)[0];
  if (!course.tees[defaultTee]) throw new Error(`default tee '${defaultTee}' is not on the course`);
  const allowance = Number(round.allowance ?? 100);
  if (!(allowance >= 10 && allowance <= 100)) throw new Error("allowance must be between 10 and 100 percent");
  const M = {
    name: String(round.name || "Round"), date: round.date || null, course, defaultTee, allowance, n, si,
    labels: course.labels, par: course.tees[defaultTee].par, course_par: course.tees[defaultTee].par_total,
    segments: countbackSegments(n), unfinished: [],
  };
  const entries = round.entries || [];
  const teesUsed = new Set(entries.map(p => p.tee || defaultTee));
  const teeLine = teesUsed.size <= 1 ? defaultTee : "mixed tees";
  M.sub = [course.name, course.loop, `${n} holes`, teeLine, `par ${M.course_par}`].filter(Boolean).join("  ·  ");

  const players = [];
  const seen = new Set();
  for (const p of entries) {
    const name = String(p.name || "").trim();
    if (!name) continue;
    if (seen.has(name)) throw new Error(`two players are called '${name}', give one of them a distinguishing name`);
    seen.add(name);
    let scores = p.scores;
    const fromHole = Number(p.fromHole || 1) || 1;
    if (!(fromHole >= 1 && fromHole <= n)) throw new Error(`${name}: from hole must be between 1 and ${n}`);
    const skipped = [...Array(n).keys()].map(h => h < fromHole - 1);  // joined late: these holes were not played at all
    const empty = s => s === null || s === undefined || s === "";
    scores = !scores || scores.length !== n ? null : scores.map((s, h) => skipped[h] || empty(s) ? null : Number(s));
    const missing = scores ? scores.some((s, h) => !skipped[h] && s === null) : true;
    // A card with nothing on it at all is someone who did not play, not someone missing a hole.
    if (!scores || scores.every(s => s === null) || (missing && round.final === false)) {
      M.unfinished.push(name);
      continue;
    }
    if (scores.some(s => s !== null && !Number.isInteger(s))) throw new Error(`${name}: scores must be whole numbers`);
    if (scores.some(s => s !== null && (s < 0 || s > 30))) throw new Error(`${name}: a hole score outside 0 to 30 looks like a typo`);
    const tee = p.tee || defaultTee;
    const t = course.tees[tee];
    if (!t) throw new Error(`${name}: tee '${tee}' is not on the course`);
    const par = t.par;
    if (p.hi === null || p.hi === undefined || p.hi === "") throw new Error(`${name}: needs a handicap index`);
    const hi = Number(p.hi);
    if (!(hi >= -10 && hi <= 54)) throw new Error(`${name}: handicap index ${hi} is outside the WHS range (+10 to 54)`);
    const gender = String(p.gender || "m").toLowerCase()[0];
    if (gender !== "m" && gender !== "f") throw new Error(`${name}: gender must be m or f`);
    let ch;
    const override = p.courseHandicap !== null && p.courseHandicap !== undefined && p.courseHandicap !== "";
    if (override) ch = Math.trunc(Number(p.courseHandicap));
    else if (t.ratings && t.ratings[gender]) ch = courseHandicap(hi, t.ratings[gender].cr, t.ratings[gender].slope, t.par_total, n);
    else throw new Error(`${name} plays the ${tee} tees, which have no ${gender === "f" ? "women's" : "men's"} rating; ` +
                         `pick another tee or give ${name} a course handicap from the club table`);
    const ph = playingHandicap(ch, allowance);
    const pen = new Array(n).fill(0);
    const pens = [];
    for (const x of p.penalties || []) {
      const h = Number(x.hole), k = Number(x.strokes);
      if (!(h >= 1 && h <= n) || !(k >= 1)) throw new Error(`${name}: penalty on hole ${h} with ${k} strokes is not possible`);
      pen[h - 1] += k;
      pens.push({ hole: h, label: course.labels[h - 1], strokes: k, reason: String(x.reason || "") });
    }
    const picked = scores.map(s => s === 0);
    // Nothing entered, or picked up: the hole counts NO_SCORE strokes, plus any penalty, like every other hole.
    const filled = scores.map((s, h) => !skipped[h] && (s === null || s === 0));
    const sc = scores.map((s, h) => skipped[h] ? null : (filled[h] ? NO_SCORE : s) + pen[h]);
    const strokes = strokesPerHole(ph, si);
    const nets = sc.map((s, h) => s === null ? null : s - strokes[h]);
    const hpts = sc.map((s, h) => s === null ? 0 : stableford(s, par[h], strokes[h]));
    const deltas = sc.map((s, h) => s === null ? null : s - par[h]);
    const nr = skipped.some(Boolean);  // only a late start leaves a card without a gross now
    const played = sc.filter(x => x !== null).length;
    const counts = [0, 1, 2, 3].map(k => deltas.filter(d => d !== null && outcome(d) === k).length);
    // The extras hang off the strokes actually played, which is the raw score: a hole picked up or never
    // entered was not holed out, and the penalty strokes added on top of a card were never struck at all.
    const rawStats = Array.isArray(p.stats) ? p.stats : [];
    const holeStats = sc.map((_, h) => holeStat(rawStats[h], { strokes: skipped[h] || filled[h] ? null : scores[h], par: par[h] }));
    players.push({
      name, hi, ch, ph, ch_override: override, tee, par, gender, id: p.id ?? null, from_hole: fromHole, skipped, group: p.group || 1,
      raw_scores: scores, penalty: pen, penalties: pens, penalty_total: sum(pen), picked, filled, nr,
      holes_played: played, scores: sc, deltas,
      gross: nr ? null : sum(sc), topar: nr ? null : sum(sc) - sum(par),
      strokes, nets, net: nr ? null : sum(nets), hpts, pts: sum(hpts), counts,
      stats: holeStats, statline: statSummary(holeStats),
    });
  }
  M.players = players;
  M.field = players.length;
  M.stats_on = players.some(p => p.statline.any);   // nothing about the extras is drawn when nobody kept any

  for (let h = 0; h < n; h++) {
    const col = players.map(p => p.scores[h]);
    players.forEach((p, i) => {
      const others = col.filter((v, j) => j !== i && v !== null);
      const own = col[i];
      p.vsrest = p.vsrest || new Array(n).fill(null);
      p.rank = p.rank || new Array(n).fill(null);
      p.vsrest[h] = own === null ? null : (others.length ? own - sum(others) / others.length : 0);
      p.rank[h] = own === null ? null : 1 + others.filter(v => v < own).length;
    });
  }

  Object.assign(M, boards(players, n, M.segments));

  const dt = course.tees[defaultTee];
  const metres = dt.metres;
  const holes = [];
  for (let h = 0; h < n; h++) {
    const col = players.map(p => p.scores[h]).filter(v => v !== null);
    const avg = mean(col);
    const vspar = mean(players.map(p => p.deltas[h]));
    holes.push({
      hole: h + 1, label: course.labels[h], par: dt.par[h], si: si[h], metres: metres ? metres[h] : null, n: col.length,
      avg: avg !== null ? avg : dt.par[h], vspar: vspar !== null ? vspar : 0,
      counts: [0, 1, 2, 3].map(k => players.filter(p => p.deltas[h] !== null && outcome(p.deltas[h]) === k).length),
      avg_pts: mean(players.map(p => p.hpts[h])) || 0,
    });
  }
  ranks(holes.map(h => Math.round(h.vspar * 1e6) / 1e6), false).forEach((d, i) => { holes[i].difficulty = d; });
  M.holes = holes;
  return M;
}

// ---------------------------------------------------------------- formatting, as golf/theme.py
/** Fixed decimals with Python's round-half-even on exact ties, so 0.25 prints 0.2 as on the desktop. */
export function fix(v, d = 1) {
  const m = 10 ** d, x = v * m, f = Math.floor(x), diff = x - f;
  let r = diff === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x);
  if (r === 0) r = 0;
  return (r / m).toFixed(d);
}

export function fmtToPar(v) {
  v = Math.round(v);
  return v === 0 ? "E" : v > 0 ? `+${v}` : String(v);
}

export function fmtSigned(v, d = 1) {
  return (v > 0 ? "+" : "") + fix(v, d);
}

export function fmtHcp(v) {
  return v < 0 ? `+${-v}` : String(v);
}

export function fmtIndex(hi) {
  return hi < 0 ? `+${fix(-hi, 1)}` : fix(hi, 1);
}

// ---------------------------------------------------------------- the extras: putts, fairways and the rest
/**
 * What a card can record beyond the number of strokes. Each is its own switch: a phone that wants putts and
 * nothing else keeps putts and nothing else, and a card with every switch off is exactly the card the app
 * kept before any of this existed.
 *
 * `derived` marks the two that the app can work out for itself once putts are being kept, so their chip
 * arrives already answered and a tap only ever *corrects* it. `perHole` is what the scoring strip draws.
 */
export const STAT_KINDS = [
  { key: "putts", col: "putts", label: "Putts", short: "Putts", word: "putts", perHole: "count", derived: false,
    blurb: "How many of your strokes were putts. On its own this also gives greens in regulation, scrambling and putts per green." },
  { key: "fairway", col: "fairway", label: "Fairways hit", short: "Fairway", word: "fairways", perHole: "fairway", derived: false,
    blurb: "Whether the tee shot finished on the fairway. Not asked on a par 3, which has none." },
  { key: "gir", col: "gir", label: "Greens in regulation", short: "GIR", word: "greens", perHole: "bit", derived: true,
    blurb: "Whether the green was reached with two strokes left for par. Worked out from your putts where you keep them; tap only to correct it." },
  { key: "penaltyShots", col: "penalty_shots", label: "Penalty shots", short: "Penalties", word: "penalty shots", perHole: "count", derived: false,
    blurb: "How many of the strokes you took were penalties — water, out of bounds, an unplayable lie. These are already inside your score and are never added to it again." },
  { key: "bunker", col: "bunker", label: "Greenside bunkers", short: "Sand", word: "bunkers", perHole: "bit", derived: false,
    blurb: "Whether you played from a bunker by the green. Whether you saved par from it comes from your score." },
];
export const STAT_KEYS = STAT_KINDS.map(k => k.key);
export const statKind = key => STAT_KINDS.find(k => k.key === key) || null;

/** The ways a fairway can be missed. The app writes `hit` or `miss`; the rest are for a card read off paper. */
export const FAIRWAY_MISSES = ["left", "right", "short", "long"];
const isMiss = f => f !== null && f !== undefined && f !== "hit";

/** A par 3 has no fairway, so asking about one is asking a question with no answer. */
export const hasFairway = par => par >= 4;

/**
 * Greens in regulation, from strokes and putts alone: the ball was on the green after `strokes - putts`,
 * and regulation is two strokes fewer than par. This is why putts are the one extra worth having -- they
 * carry GIR, scrambling and putts per green with them.
 */
export function girFrom(strokes, putts, par) {
  if (strokes === null || putts === null) return null;
  return strokes - putts <= par - 2;
}

/** An empty per-hole record, which is what every hole starts as. */
export const blankStat = () => ({ putts: null, fairway: null, gir: null, penaltyShots: null, bunker: null });

/** True when a per-hole record says nothing at all, and so need not be stored or synced. */
export const emptyStat = x => !x || STAT_KEYS.every(k => x[k] === null || x[k] === undefined);

/**
 * One hole's extras, resolved: what was recorded, with GIR filled in from the putts when it was not answered
 * by hand. `strokes` is what was actually played -- null on a hole picked up or never entered, because a hole
 * that was not holed out has no meaningful putt count and must not be averaged as though it had.
 */
export function holeStat(raw, { strokes, par }) {
  const x = { ...blankStat(), ...(raw || {}) };
  const played = strokes !== null && strokes !== undefined;
  const putts = played ? x.putts : null;
  const gir = x.gir === null || x.gir === undefined ? girFrom(played ? strokes : null, putts, par) : !!x.gir;
  return {
    par, strokes: played ? strokes : null,
    putts,
    fairway: hasFairway(par) ? (x.fairway ?? null) : null,
    gir,
    penaltyShots: x.penaltyShots ?? null,
    bunker: x.bunker === null || x.bunker === undefined ? null : !!x.bunker,
    topar: played ? strokes - par : null,
  };
}

const ratio = (hit, of) => of ? hit / of : null;

/**
 * The extras over any set of holes -- one round, one season, one player, a whole league. Every section counts
 * only the holes that answered it, so turning a switch on halfway through a season skews nothing: a putting
 * average over nine holes says nine holes.
 *
 * Scrambling and sand saves are not asked for anywhere. They fall out: a scramble is a green missed and par
 * still made, a sand save is a bunker visited and par still made.
 */
export function statSummary(holes) {
  const hs = holes.filter(Boolean);
  const withPutts = hs.filter(h => h.putts !== null);
  const girHoles = hs.filter(h => h.gir !== null);
  const greens = girHoles.filter(h => h.gir);
  const missed = girHoles.filter(h => !h.gir && h.topar !== null);
  const fw = hs.filter(h => hasFairway(h.par) && h.fairway !== null);
  const sand = hs.filter(h => h.bunker !== null && h.bunker);
  const pen = hs.filter(h => h.penaltyShots !== null);
  const puttsOnGreens = withPutts.filter(h => h.gir);
  const total = xs => xs.reduce((a, h) => a + h.putts, 0);
  // Holes that actually answered something, not holes on the card. Every hole carries a record once anything
  // is switched on, so counting those would tell somebody who marked one green that it was "over 18 holes".
  const said = h => STAT_KEYS.some(k => h[k] !== null && h[k] !== undefined);
  return {
    holes: hs.filter(said).length,
    any: withPutts.length + fw.length + girHoles.length + sand.length + pen.length > 0,
    putts: !withPutts.length ? null : {
      holes: withPutts.length, total: total(withPutts), avg: mean(withPutts.map(h => h.putts)),
      per18: mean(withPutts.map(h => h.putts)) * 18,
      one: withPutts.filter(h => h.putts === 1).length,
      none: withPutts.filter(h => h.putts === 0).length,
      three: withPutts.filter(h => h.putts >= 3).length,
      onGir: puttsOnGreens.length ? mean(puttsOnGreens.map(h => h.putts)) : null,
      onGirHoles: puttsOnGreens.length,
    },
    fairway: !fw.length ? null : {
      holes: fw.length, hit: fw.filter(h => h.fairway === "hit").length,
      pct: ratio(fw.filter(h => h.fairway === "hit").length, fw.length),
      misses: Object.fromEntries(FAIRWAY_MISSES.map(m => [m, fw.filter(h => h.fairway === m).length])),
      vague: fw.filter(h => isMiss(h.fairway) && !FAIRWAY_MISSES.includes(h.fairway)).length,
    },
    gir: !girHoles.length ? null : { holes: girHoles.length, hit: greens.length, pct: ratio(greens.length, girHoles.length) },
    scramble: !missed.length ? null : {
      holes: missed.length, saved: missed.filter(h => h.topar <= 0).length,
      pct: ratio(missed.filter(h => h.topar <= 0).length, missed.length),
    },
    sand: !sand.length ? null : {
      holes: sand.length, saved: sand.filter(h => h.topar !== null && h.topar <= 0).length,
      pct: ratio(sand.filter(h => h.topar !== null && h.topar <= 0).length, sand.length),
    },
    penalty: !pen.length ? null : { holes: pen.length, total: pen.reduce((a, h) => a + h.penaltyShots, 0) },
  };
}

/** Which switches a set of holes actually answered, so a table only ever shows columns with something in them. */
export function statKindsPresent(summary) {
  if (!summary) return [];
  return STAT_KINDS.filter(k => k.key === "putts" ? summary.putts : k.key === "fairway" ? summary.fairway
    : k.key === "gir" ? summary.gir : k.key === "penaltyShots" ? summary.penalty : summary.sand);
}

/** A ratio as a percentage, for display. Named apart from the app's own `pct`, which takes a part and a whole. */
export const fmtPct = v => v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`;

// ---------------------------------------------------------------- strokes gained, against the people who were there
/**
 * Strokes gained, with the field as the baseline instead of a tour.
 *
 * The published version of this statistic needs the distance and lie of every shot and a tour benchmark to
 * subtract from. Neither exists on a scorecard, so this does the thing a scorecard *can* support honestly:
 * it compares you with the people who played the same holes on the same day. Positive means you took fewer
 * strokes than they did.
 *
 *     total       = what they averaged on the hole  −  what you took
 *     putting     = what they averaged in putts     −  what you putted
 *     tee to green = total − putting
 *
 * The three are additive because an average is linear, so the split always adds back up to the whole. Off
 * the tee and approach are NOT separated: knowing the fairway was missed says nothing about how far away
 * the next shot was, and inventing that split is where this would stop being true.
 *
 * Two hole sets, kept apart on purpose. `total` runs over every hole you and somebody else both holed out.
 * The split runs only over the holes where putts were written down on *both* cards -- in a fourball where
 * only you count putts there is no putting baseline, and the honest answer is to say so rather than to
 * compare your putts against a number nobody recorded.
 *
 * A hole picked up or never finished is left out of all of it: there is no stroke count to gain against.
 *
 * `cards` are computed rounds (use `leagueCards` first for a league, so every group that walked the same
 * loop that day is one field). `against` names one opponent for a head-to-head, or is null for the field.
 */
export function strokesGained(cards, pid, { basis = "gross", against = null } = {}) {
  const value = (p, h) => basis === "net" ? p.nets[h] : p.scores[h];
  const holed = (p, h) => p.scores[h] !== null && !p.skipped[h] && !p.filled[h];
  const puttsOf = (p, h) => (p.stats && p.stats[h] && p.stats[h].putts !== null && p.stats[h].putts !== undefined) ? p.stats[h].putts : null;
  let holes = 0, total = 0, splitHoles = 0, splitTotal = 0, putting = 0, rounds = 0, opponents = new Set();
  for (const card of cards) {
    const me = card.players.find(p => p.id !== null && p.id === pid);
    if (!me) continue;
    const others = card.players.filter(p => p !== me && (against === null ? true : p.id === against));
    if (!others.length) continue;
    let counted = 0;
    for (let h = 0; h < card.n; h++) {
      if (!holed(me, h)) continue;
      const pool = others.filter(o => holed(o, h));
      if (!pool.length) continue;
      holes++; counted++;
      total += mean(pool.map(o => value(o, h))) - value(me, h);
      const myPutts = puttsOf(me, h);
      if (myPutts === null) continue;
      const poolP = pool.filter(o => puttsOf(o, h) !== null);
      if (!poolP.length) continue;
      splitHoles++;
      splitTotal += mean(poolP.map(o => value(o, h))) - value(me, h);
      putting += mean(poolP.map(o => puttsOf(o, h))) - myPutts;
    }
    if (counted) { rounds++; for (const o of others) if (o.id) opponents.add(o.id); }
  }
  const per18 = v => holes ? (v / holes) * 18 : null;
  return {
    basis, holes, rounds, opponents: opponents.size, total: holes ? total : null, per18: per18(total),
    // The split only speaks where both cards kept putts; `holes` above is the wider set.
    split: !splitHoles ? null : {
      holes: splitHoles, total: splitTotal, putting, teeToGreen: splitTotal - putting,
      per18: { total: (splitTotal / splitHoles) * 18, putting: (putting / splitHoles) * 18, teeToGreen: ((splitTotal - putting) / splitHoles) * 18 },
    },
  };
}

// ---------------------------------------------------------------- nines: an 18-hole round split back into its loops
/**
 * The nines of a round exactly as they played that day: a slice of the finished round, nothing re-scored,
 * so the strokes received are the ones the player actually had. This is what the round's own screens show.
 * Returns one entry per nine (two for an 18, one for a nine), or null when the course does not declare nines.
 */
export function halves(M, p) {
  const nines = (M.course && M.course.nines) || [];
  if (nines.length < 1 || M.n !== nines.length * 9) return null;
  return nines.map((slug, i) => {
    const from = i * 9, sc = p.scores.slice(from, from + 9), par = p.par.slice(from, from + 9);
    const whole = sc.every(x => x !== null);
    return {
      slug, from, holes: sc.filter(x => x !== null).length,
      gross: whole ? sum(sc) : null,
      topar: whole ? sum(sc) - sum(par) : null,
      net: whole ? sum(p.nets.slice(from, from + 9)) : null,
      pts: sum(p.hpts.slice(from, from + 9)),
    };
  });
}

/**
 * Holes [from, from+9) lifted out and computed as a nine-hole round on `nineCourse`, which carries that
 * loop's own stroke index and its own course rating and slope. Strokes received are worked out again from
 * the nine's rating, so a loop walked inside an 18 is on the same footing as the same loop walked alone.
 * That makes it the right basis for "how does this player do on Noord" and the wrong one for "what did
 * they score that day" -- use halves() for the latter. Throws if the nine cannot rate the player's tee.
 */
export function computeNine(nineCourse, round, from) {
  const shift = p => ({ ...p, hole: Number(p.hole) - from });
  const entries = (round.entries || []).map(e => ({
    ...e,
    courseHandicap: null,  // an 18-hole course handicap means nothing here; the nine has its own rating
    scores: (e.scores || []).slice(from, from + 9),
    fromHole: Math.max(1, Math.min(9, (Number(e.fromHole || 1) || 1) - from)),
    penalties: (e.penalties || []).filter(p => Number(p.hole) > from && Number(p.hole) <= from + 9).map(shift),
  }));
  return compute(nineCourse, { ...round, final: true, entries });
}

// ---------------------------------------------------------------- seasons: what a league counts as one card
/**
 * A league's unit is the day, not the sheet a group handed in. Every round attached to a league with the
 * same date on the same loop is one card, so two fourballs round the Noord on a Sunday are one field of
 * eight and not two fields of four weighed against each other. Nothing caps how many players that comes
 * to. A round with no date stays on its own: an undated sheet says nothing about which day it belongs to.
 *
 * The same player twice on one card is two goes at it and counts twice -- unless the scores are identical
 * as well, which is one sheet handed in by both groups. Every league table below groups its rounds this
 * way before it counts anything, so callers pass the computed rounds; grouping again changes nothing.
 */
export function leagueCards(results) {
  const by = new Map();
  for (const M of results) {
    const key = M.date ? `${M.date}|${(M.course && (M.course.slug || M.course.name)) || ""}` : `round|${M.id}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(M);
  }
  return [...by.entries()].map(([key, Ms]) => oneCard(key, Ms));
}

/** One day's rounds as a single card, shaped like a computed round so every table reads it the same way. */
function oneCard(key, Ms) {
  const players = [];
  const sheets = new Set();
  for (const M of Ms) for (const p of M.players) {
    // the same name against the same holes is one sheet handed in twice; anything else is a second go
    const sheet = p.raw_scores ? `${p.id ?? p.name}|${p.raw_scores.join(",")}` : null;
    if (sheet !== null && sheets.has(sheet)) continue;
    if (sheet !== null) sheets.add(sheet);
    players.push({ ...p, roundId: p.roundId ?? M.id, roundName: p.roundName ?? M.name });
  }
  const card = { ...Ms[0], id: key, key, rounds: Ms, players, field: players.length,
    name: [...new Set(Ms.map(M => M.name))].join(" · ") };
  // a card of one round is that round's board again; several need the countback run over the lot. The
  // per-hole field figures (`holes`, and each player's `vsrest`) stay as the round computed them: nothing
  // a league reads goes through them, and every table below works off the players and the boards.
  if (card.n && card.segments && players.every(p => p.hpts && p.scores)) Object.assign(card, boards(players, card.n, card.segments));
  else card.stbl_board = [...players].sort((a, b) => (b.pts || 0) - (a.pts || 0));
  return card;
}

// ---------------------------------------------------------------- seasons: standings for a group across rounds
/**
 * `results` is a list of computed rounds (M) with `.id`; `memberIds` the roster ids in the group; `bestN` 0 for all.
 * Only members count, so a guest never changes the table. Returns rows sorted by running total then average.
 */
export function standings(results, memberIds, bestN = 0) {
  const members = new Set(memberIds);
  const rows = new Map();
  const roundsIn = [];
  for (const M of leagueCards(results)) {
    const mine = M.players.filter(p => p.id !== null && members.has(p.id));
    if (!mine.length) continue;
    roundsIn.push(M);
    const best = Math.max(...mine.map(p => p.pts));
    for (const p of mine) {
      if (!rows.has(p.id)) rows.set(p.id, { id: p.id, name: p.name, rounds: [], wins: 0, gross_topar: [], hi: p.hi });
      const r = rows.get(p.id);
      r.name = p.name;
      r.hi = p.hi;
      r.rounds.push({ round: p.roundId ?? M.id, name: M.name, date: M.date, pts: p.pts, gross: p.gross, topar: p.topar, net: p.net });
      if (p.pts === best) r.wins += 1;
    }
  }
  const out = [...rows.values()].map(r => {
    const pts = r.rounds.map(x => x.pts);
    const sortedPts = [...pts].sort((a, b) => b - a);
    const counted = bestN > 0 ? sortedPts.slice(0, bestN) : sortedPts;
    return {
      ...r, played: pts.length, total: sum(pts), counted: sum(counted), counted_n: counted.length,
      avg: pts.length ? sum(pts) / pts.length : 0, best: pts.length ? Math.max(...pts) : 0,
    };
  });
  out.sort((a, b) => b.counted - a.counted || b.avg - a.avg || b.best - a.best || a.name.localeCompare(b.name));
  out.forEach((r, i) => { r.place = i + 1; r.tied = false; });
  return { rows: out, rounds: roundsIn, bestN };
}

/**
 * Stroke play league: net score against par per round (so 9- and 18-hole rounds compare), lowest total wins.
 * A round without a return (pick-up or late start) does not count for that player.
 */
export function strokeStandings(results, memberIds, bestN = 0) {
  const members = new Set(memberIds);
  const rows = new Map();
  const cards = leagueCards(results);
  for (const M of cards) {
    const mine = M.players.filter(p => p.id !== null && members.has(p.id));
    if (!mine.length) continue;
    const returned = mine.filter(p => p.net !== null);
    const best = returned.length ? Math.min(...returned.map(p => p.net - M.course_par)) : null;
    for (const p of mine) {
      if (!rows.has(p.id)) rows.set(p.id, { id: p.id, name: p.name, rounds: [], wins: 0, nr: 0 });
      const r = rows.get(p.id);
      r.name = p.name;
      if (p.net === null) { r.nr += 1; continue; }
      const topar = p.net - M.course_par;
      r.rounds.push({ round: p.roundId ?? M.id, name: M.name, date: M.date, net: p.net, topar });
      if (topar === best) r.wins += 1;
    }
  }
  const out = [...rows.values()].map(r => {
    const tp = r.rounds.map(x => x.topar).sort((a, b) => a - b);
    const counted = bestN > 0 ? tp.slice(0, bestN) : tp;
    return { ...r, played: tp.length, counted: sum(counted), counted_n: counted.length, avg: tp.length ? sum(tp) / tp.length : 0, best: tp.length ? tp[0] : null };
  });
  out.sort((a, b) => (b.played > 0) - (a.played > 0) || a.counted - b.counted || a.avg - b.avg || (a.best ?? 99) - (b.best ?? 99) || a.name.localeCompare(b.name));
  out.forEach((r, i) => { r.place = i + 1; });
  return { rows: out, rounds: cards, bestN };
}

/**
 * What one hole is worth to a player in a given currency, lowest wins:
 *   "net"    net strokes -- ordinary golf matchplay.
 *   "points" Stableford points, negated. Points floor at zero, so two blow-ups halve the hole
 *            where net strokes would still separate them.
 *   "gross"  strokes as they were taken, handicaps ignored.
 */
const holeValue = (p, h, basis) => basis === "points" ? -p.hpts[h] : basis === "gross" ? p.scores[h] : p.nets[h];
/** A whole round in the same currency as it is read, and again as a value where lowest wins. */
const roundScore = (p, basis) => basis === "points" ? p.pts : basis === "gross" ? p.gross : p.net;
const roundValue = (p, basis) => basis === "points" ? -p.pts : roundScore(p, basis);

/**
 * One match, hole by hole, in the currency `basis` names (see `holeValue`).
 * A hole only one of them returned goes to the other. Returns holes up for a (negative = b up).
 */
export function matchResult(pa, pb, basis = "net") {
  let up = 0, holes = 0;
  for (let h = 0; h < pa.nets.length; h++) {
    const na = pa.nets[h] === null, nb = pb.nets[h] === null;
    if (na && nb) continue;
    holes++;
    if (na) { up--; continue; }
    if (nb) { up++; continue; }
    const x = holeValue(pa, h, basis), y = holeValue(pb, h, basis);
    if (x < y) up++; else if (y < x) up--;
  }
  return { up, holes };
}

/**
 * Matchplay league: every pair who shared a round played a match on net score, hole by hole.
 * `win` and `draw` set what a result is worth, so the same maths gives a golf matchplay table
 * (2 and 1) or a football one (3 and 1).
 */
export function matchStandings(results, memberIds, win = 2, draw = 1, basis = "net") {
  const members = new Set(memberIds);
  const rows = new Map();
  const row = p => { if (!rows.has(p.id)) rows.set(p.id, { id: p.id, name: p.name, played: 0, won: 0, drawn: 0, lost: 0, up: 0 }); const r = rows.get(p.id); r.name = p.name; return r; };
  const cards = leagueCards(results);
  for (const M of cards) {
    const mine = M.players.filter(p => p.id !== null && members.has(p.id));
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      if (mine[i].id === mine[j].id) continue;  // two goes on the same day is not a match against yourself
      const { up, holes } = matchResult(mine[i], mine[j], basis);
      if (!holes) continue;
      const a = row(mine[i]), b = row(mine[j]);
      a.played++; b.played++; a.up += up; b.up -= up;
      if (up > 0) { a.won++; b.lost++; } else if (up < 0) { b.won++; a.lost++; } else { a.drawn++; b.drawn++; }
    }
  }
  const out = [...rows.values()].map(r => ({ ...r, points: win * r.won + draw * r.drawn }));
  out.sort((a, b) => b.points - a.points || b.up - a.up || b.won - a.won || a.name.localeCompare(b.name));
  out.forEach((r, i) => { r.place = i + 1; });
  return { rows: out, rounds: cards, win, draw, basis };
}

// The classic Formula 1 points table: winning a round is worth far more than turning up.
export const GP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/**
 * The day's finishing order among a league's own players, so a guest never takes a position off them.
 * On Stableford that is the round's own board, countback and all; on net strokes it is net against par
 * with the same countback run on net scores, and a player without a card is not in the order at all.
 */
function gpBoard(M, members, basis) {
  const mine = M.stbl_board.filter(p => p.id !== null && members.has(p.id));
  if (basis !== "net") return { order: mine, nr: [] };
  const n = M.n, segments = M.segments || [], back = [...Array(n).keys()].reverse();
  const key = p => [p.net, ...segments.map(k => sum(p.nets.slice(n - k))), ...back.map(h => p.nets[h])];
  const returned = mine.filter(p => p.net !== null && !p.nr);
  return { order: [...returned].sort((a, b) => cmpTuple(key(a), key(b))), nr: mine.filter(p => !returned.includes(p)) };
}

/**
 * Grand Prix scoring: each round hands out points by finishing position, as Formula 1 does, so one
 * good day counts for more than being steadily mid-table. `basis` is what settles the day: "points"
 * the Stableford board, "net" net score against par. A small turnout still gives the winner full points.
 */
export function gpStandings(results, memberIds, bestN = 0, table = GP_POINTS, basis = "points") {
  const members = new Set(memberIds);
  const rows = new Map();
  const cards = leagueCards(results);
  const row = p => {
    if (!rows.has(p.id)) rows.set(p.id, { id: p.id, name: p.name, scores: [], wins: 0, best: 0, nr: 0 });
    const r = rows.get(p.id);
    r.name = p.name;
    return r;
  };
  for (const M of cards) {
    const { order, nr } = gpBoard(M, members, basis);
    for (const p of nr) row(p).nr += 1;   // no card, no position, no points
    order.forEach((p, i) => {
      const r = row(p);
      const pts = table[i] ?? 0;
      r.scores.push(pts);
      if (i === 0) r.wins += 1;
      r.best = Math.max(r.best, pts);
    });
  }
  const out = [...rows.values()].map(r => {
    const sorted = [...r.scores].sort((a, b) => b - a);
    const counted = bestN > 0 ? sorted.slice(0, bestN) : sorted;
    return { ...r, played: r.scores.length, total: sum(r.scores), counted: sum(counted),
      avg: r.scores.length ? sum(r.scores) / r.scores.length : 0 };
  });
  out.sort((a, b) => b.counted - a.counted || b.wins - a.wins || b.best - a.best || a.name.localeCompare(b.name));
  out.forEach((r, i) => { r.place = i + 1; });
  return { rows: out, rounds: cards, bestN, table, basis };
}

/**
 * Two players in a league: every attached round they both played, and every way of comparing them --
 * points, net, gross, birdies, the holes, the match, the run of results at the end.
 * `basis` is the currency a round and a hole are settled in ("points", "net" or "gross"); the rest of
 * the numbers are there whichever is chosen. A round only one of them returned a card for goes to the
 * one who did, the way a hole does.
 */
export function headToHead(results, a, b, basis = "net") {
  const rounds = [];
  for (const M of leagueCards(results)) {
    // a card is the whole day, so a group each and never a word between them is still a meeting
    for (const pa of M.players.filter(p => p.id === a)) for (const pb of M.players.filter(p => p.id === b)) {
      const m = matchResult(pa, pb, basis);
      let holesA = 0, holesB = 0, halved = 0;
      for (let h = 0; h < pa.nets.length; h++) {
        const na = pa.nets[h] === null, nb = pb.nets[h] === null;
        if (na && nb) continue;
        if (na) { holesB++; continue; }
        if (nb) { holesA++; continue; }
        // settled the way matchResult settles a hole, so the tally and the running match never disagree
        const x = holeValue(pa, h, basis), y = holeValue(pb, h, basis);
        if (x < y) holesA++; else if (y < x) holesB++; else halved++;
      }
      // the round in the chosen currency: what the board shows, who took the day, and by how much
      const va = roundValue(pa, basis), vb = roundValue(pb, basis);
      const sa = roundScore(pa, basis), sb = roundScore(pb, basis);
      const winner = va === null && vb === null ? "tie" : va === null ? "b" : vb === null ? "a"
        : va < vb ? "a" : vb < va ? "b" : "tie";
      rounds.push({ id: pa.roundId ?? M.id, name: M.name, date: M.date, where: M.course.loop || M.course.name,
        ptsA: pa.pts, ptsB: pb.pts, grossA: pa.gross, grossB: pb.gross, netA: pa.net, netB: pb.net,
        scoreA: sa, scoreB: sb,
        margin: va === null || vb === null ? null : Math.abs(va - vb),
        birdiesA: pa.counts[0], birdiesB: pb.counts[0], holesA, holesB, halved,
        winner, up: m.up, matchWinner: m.up > 0 ? "a" : m.up < 0 ? "b" : "tie" });
    }
  }
  rounds.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  const sumBy = k => rounds.reduce((s, r) => s + r[k], 0);
  const avg = k => rounds.length ? sumBy(k) / rounds.length : 0;
  const bestOf = (k, lowest) => {
    const xs = rounds.map(r => r[k]).filter(v => v !== null);
    return xs.length ? (lowest ? Math.min(...xs) : Math.max(...xs)) : null;
  };
  // Strokes only compare over the rounds where both of them returned a card.
  const both = rounds.filter(r => r.grossA !== null && r.grossB !== null);
  const avgBoth = k => both.length ? both.reduce((s, r) => s + r[k], 0) / both.length : null;
  const widest = who => rounds.filter(r => r.winner === who && r.margin !== null)
    .reduce((best, r) => !best || r.margin > best.margin ? r : best, null);
  // The run at the end of the list. A halved round breaks it, so a streak is always one name repeated.
  let streak = { who: null, n: 0 };
  for (let i = rounds.length - 1; i >= 0; i--) {
    const w = rounds[i].winner;
    if (w === "tie" || (streak.who && w !== streak.who)) break;
    streak = { who: w, n: streak.n + 1 };
  }
  return { rounds, streak,
    winsA: rounds.filter(r => r.winner === "a").length, winsB: rounds.filter(r => r.winner === "b").length,
    ties: rounds.filter(r => r.winner === "tie").length, ptsA: sumBy("ptsA"), ptsB: sumBy("ptsB"),
    avgPtsA: avg("ptsA"), avgPtsB: avg("ptsB"), bestPtsA: bestOf("ptsA", false), bestPtsB: bestOf("ptsB", false),
    avgGrossA: avgBoth("grossA"), avgGrossB: avgBoth("grossB"), bestGrossA: bestOf("grossA", true), bestGrossB: bestOf("grossB", true),
    avgNetA: avgBoth("netA"), avgNetB: avgBoth("netB"), bestNetA: bestOf("netA", true), bestNetB: bestOf("netB", true),
    birdiesA: sumBy("birdiesA"), birdiesB: sumBy("birdiesB"),
    holesA: sumBy("holesA"), holesB: sumBy("holesB"), holesHalved: sumBy("halved"), up: sumBy("up"),
    widestA: widest("a"), widestB: widest("b"),
    matchA: rounds.filter(r => r.matchWinner === "a").length, matchB: rounds.filter(r => r.matchWinner === "b").length, matchTies: rounds.filter(r => r.matchWinner === "tie").length };
}

// ---------------------------------------------------------------- statistics over a set of rounds
/**
 * The six ways a hole ends, good to bad. Kept to six so the distribution still reads as one ring;
 * the donut and every distribution bar in the app go in this order.
 */
export const SCORE_BUCKETS = [
  { key: "eagle", label: "Eagle or better", short: "Eagle+" },
  { key: "birdie", label: "Birdie", short: "Birdie" },
  { key: "par", label: "Par", short: "Par" },
  { key: "bogey", label: "Bogey", short: "Bogey" },
  { key: "double", label: "Double bogey", short: "Double" },
  { key: "triple", label: "Triple or worse", short: "Triple+" },
];

export function scoreBucket(delta) {
  return delta <= -2 ? 0 : delta === -1 ? 1 : delta === 0 ? 2 : delta === 1 ? 3 : delta === 2 ? 4 : 5;
}

/** Sample standard deviation: how far a player's rounds scatter around their own average. */
export function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map(x => (x - m) ** 2)) / (xs.length - 1));
}

/**
 * Every hole every one of these players has walked in these rounds, as one flat list. Each row carries
 * what the hole was (par, stroke index, how hard it ranks on its card) and what they did with it, so any
 * split -- by par, by difficulty, by player -- is one filter away. Holes nobody played (a late start) are
 * left out; a hole counted NO_SCORE is a hole that was walked and belongs in the numbers.
 */
export function statHoles(results, memberIds) {
  const members = new Set(memberIds);
  const out = [];
  for (const M of leagueCards(results)) {
    const rank = siRanks(M.si);
    const where = M.course.loop || M.course.name;
    for (const p of M.players) {
      if (p.id === null || !members.has(p.id)) continue;
      for (let h = 0; h < M.n; h++) {
        if (p.scores[h] === null) continue;
        out.push({
          pid: p.id, card: M.key ?? M.id, round: p.roundId ?? M.id, where, hole: h, label: M.labels[h], si: M.si[h],
          band: rank[h] <= M.n / 3 ? 0 : rank[h] > (2 * M.n) / 3 ? 2 : 1,  // hardest third, middle, easiest third
          par: p.par[h], score: p.scores[h], delta: p.deltas[h], pts: p.hpts[h], bucket: scoreBucket(p.deltas[h]),
          stat: p.stats ? p.stats[h] : null,   // so any split of these holes can be summarised the same way
        });
      }
    }
  }
  return out;
}

/** Counts and averages over a set of holes, split by par and by how hard the hole ranks on its card. */
function tally(hs) {
  const counts = new Array(SCORE_BUCKETS.length).fill(0);
  for (const h of hs) counts[h.bucket]++;
  const part = xs => ({
    holes: xs.length, avg: mean(xs.map(h => h.score)), vspar: mean(xs.map(h => h.delta)), pts: mean(xs.map(h => h.pts)),
    counts: SCORE_BUCKETS.map((_, k) => xs.filter(h => h.bucket === k).length),
  });
  const byPar = {};
  for (const par of [...new Set(hs.map(h => h.par))].sort((a, b) => a - b)) byPar[par] = part(hs.filter(h => h.par === par));
  // One line covers both the player and the field, since both come through here.
  return { ...part(hs), counts, byPar, bands: [0, 1, 2].map(b => part(hs.filter(h => h.band === b))),
    statline: statSummary(hs.map(h => h.stat)) };
}

/**
 * One player's line from one round, with what the rest of the league did that day beside it.
 * `place` is their position among the league's own players, as the league's tables take it, so a
 * guest can never take a win off a member; `splace` is where they came on the day among everyone.
 */
function roundLine(M, p, others, place, of) {
  const n = M.n, counts = new Array(SCORE_BUCKETS.length).fill(0);
  let chances = 0, backs = 0, blowups = 0;
  for (let h = 0; h < n; h++) {
    const d = p.deltas[h];
    if (d === null) continue;
    counts[scoreBucket(d)]++;
    if (d >= 2) blowups++;
    // bounce-back: the hole straight after dropping a shot, played in par or better
    if (d >= 1 && h + 1 < n && p.deltas[h + 1] !== null) { chances++; if (p.deltas[h + 1] <= 0) backs++; }
  }
  const half = Math.floor(n / 2);  // points a hole in each half: a nine and an eighteen only average together per hole
  const otherTopar = others.map(q => q.topar).filter(v => v !== null);
  return {
    id: p.roundId ?? M.id, card: M.key ?? M.id, name: M.name, date: M.date, where: M.course.loop || M.course.name, n,
    pid: p.id, player: p.name, pts: p.pts, gross: p.gross, topar: p.topar, net: p.net, ph: p.ph,
    place, of, splace: p.splace, field: M.field, counts, holes: p.holes_played,
    penalties: p.penalty_total, counted10: p.filled.filter(Boolean).length,
    chances, backs, blowups, first: sum(p.hpts.slice(0, half)) / half, last: sum(p.hpts.slice(n - half)) / half,
    fieldPts: others.length ? mean(others.map(q => q.pts)) : null,
    fieldTopar: otherTopar.length ? mean(otherTopar) : null,
  };
}

/**
 * Everything the rounds of a league can say about the players in it: the field as a whole, and each
 * player both on their own and against the rest of the field on exactly the rounds they were there for.
 * `results` is a list of computed rounds (M) with `.id`, `memberIds` the league's own players, so a
 * guest never moves a number. Returns { rounds, holes, field, players } with players sorted by average
 * points. Everything on the Stats screen is read straight off this.
 */
export function leagueStats(results, memberIds) {
  const members = new Set(memberIds);
  const cards = leagueCards(results);
  const holes = statHoles(cards, memberIds);
  const rounds = [];
  const names = new Map();
  for (const M of cards) {
    const mine = M.players.filter(p => p.id !== null && members.has(p.id));
    const board = M.stbl_board.filter(p => p.id !== null && members.has(p.id));
    for (const p of mine) {
      names.set(p.id, p.name);
      rounds.push(roundLine(M, p, mine.filter(q => q.id !== p.id), board.indexOf(p) + 1, board.length));
    }
  }
  rounds.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  const best = (xs, key, lowest = false) => xs.filter(x => x[key] !== null)
    .sort((a, b) => (lowest ? a[key] - b[key] : b[key] - a[key]) || String(a.date || "").localeCompare(String(b.date || "")))[0] || null;

  const players = [...names.keys()].map(id => {
    const rs = rounds.filter(r => r.pid === id);
    const myCards = new Set(rs.map(r => r.card));
    const mine = tally(holes.filter(h => h.pid === id));
    // the rest of the league, on the same days only, so the comparison is like for like
    const rest = tally(holes.filter(h => h.pid !== id && myCards.has(h.card)));
    const pts = rs.map(r => r.pts);
    const topars = rs.map(r => r.topar).filter(v => v !== null);
    const vs = rs.filter(r => r.fieldPts !== null);
    const vsTopar = rs.filter(r => r.fieldTopar !== null && r.topar !== null);
    const chances = sum(rs.map(r => r.chances)), backs = sum(rs.map(r => r.backs));
    // the run of rounds at the end in which they were above the rest of the field
    let streak = 0;
    for (let i = rs.length - 1; i >= 0; i--) {
      if (rs[i].fieldPts === null || rs[i].pts <= rs[i].fieldPts) break;
      streak++;
    }
    const half = Math.floor(rs.length / 2);
    return {
      id, name: names.get(id), played: rs.length, rounds: rs, ...mine, rest,
      totalPts: sum(pts), avgPts: mean(pts), bestPts: pts.length ? Math.max(...pts) : null,
      worstPts: pts.length ? Math.min(...pts) : null, consistency: stdev(pts),
      avgTopar: mean(topars), bestTopar: topars.length ? Math.min(...topars) : null,
      returns: topars.length, wins: rs.filter(r => r.place === 1).length,
      podiums: rs.filter(r => r.place <= 3).length, avgPlace: mean(rs.map(r => r.place)),
      vsField: vs.length ? mean(vs.map(r => r.pts - r.fieldPts)) : null,
      beat: vs.filter(r => r.pts > r.fieldPts).length, beatOf: vs.length,
      vsFieldTopar: vsTopar.length ? mean(vsTopar.map(r => r.topar - r.fieldTopar)) : null,
      streak, form: rs.length >= 3 ? mean(rs.slice(-3).map(r => r.pts)) : null,
      trend: rs.length >= 4 ? mean(rs.slice(half).map(r => r.pts)) - mean(rs.slice(0, half).map(r => r.pts)) : null,
      bounce: chances ? backs / chances : null, bounceOf: chances,
      blowups: rs.length ? sum(rs.map(r => r.blowups)) / rs.length : null,
      penalties: sum(rs.map(r => r.penalties)), counted10: sum(rs.map(r => r.counted10)),
      firstHalf: mean(rs.map(r => r.first)), lastHalf: mean(rs.map(r => r.last)),
      bestRound: best(rs, "pts"), lowRound: best(rs, "topar", true),
      mostBirdies: rs.map(r => ({ ...r, birdies: r.counts[0] + r.counts[1] }))
        .sort((a, b) => b.birdies - a.birdies)[0] || null,
    };
  }).sort((a, b) => (b.avgPts ?? -1) - (a.avgPts ?? -1) || b.played - a.played || a.name.localeCompare(b.name));

  const field = {
    ...tally(holes), players: players.length, rounds: rounds.length,
    cards: new Set(rounds.map(r => r.card)).size,
    avgPts: mean(rounds.map(r => r.pts)), avgTopar: mean(rounds.map(r => r.topar)),
    bestRound: best(rounds, "pts"), lowRound: best(rounds, "topar", true),
    mostBirdies: rounds.map(r => ({ ...r, birdies: r.counts[0] + r.counts[1] })).sort((a, b) => b.birdies - a.birdies)[0] || null,
    bounce: sum(rounds.map(r => r.chances)) ? sum(rounds.map(r => r.backs)) / sum(rounds.map(r => r.chances)) : null,
  };
  return { rounds, holes, field, players };
}

// ---------------------------------------------------------------- one player against another

/** Pearson correlation. Null under three pairs, or when one side never moves and there is nothing to correlate. */
export function correlation(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * A player against each of the others over the rounds they actually shared, and the thing a
 * head-to-head cannot say: whether the other one's own day moves theirs. `basis` is the currency --
 * Stableford points, net strokes or gross strokes -- and everything is read a hole at a time, because a
 * league mixes nines and eighteens and half a round must not sit beside a whole one; `scale` is the hole
 * count when every shared round has the same one, null when they mix, and only then does the screen
 * multiply back up to a round. On strokes a round only one of them returned a card for cannot be
 * compared and drops out, so `played` is the rounds this currency can actually speak for.
 *
 * `onGood` and `onBad` are what the player scored on the rounds where the rival played better than their
 * own average over those same rounds, and on the rounds where they did not: measured against the rival's
 * own average, so a good player is not simply always on song and a weak one never. Both sides need two
 * rounds before either appears. `rounds` is the list leagueStats returns, so guests are already out.
 * `lift` and `corr` are in better-is-more terms whatever the currency; `myAvg`, `theirAvg`, `onGood` and
 * `onBad` are the numbers as they are read, and `lower` says which way round that is.
 */
export function rivals(rounds, pid, basis = "points") {
  const ours = new Map();  // card -> the player's own line from that day, or lines, if they went round twice
  for (const r of rounds) {
    if (r.pid !== pid || !r.n) continue;
    const k = r.card ?? r.id;
    if (!ours.has(k)) ours.set(k, []);
    ours.get(k).push(r);
  }
  const others = new Map();
  for (const r of rounds) {
    if (r.pid === pid || !r.n) continue;
    const mine = ours.get(r.card ?? r.id);
    if (!mine) continue;
    if (!others.has(r.pid)) others.set(r.pid, { id: r.pid, name: r.player, pairs: [] });
    for (const me of mine) others.get(r.pid).pairs.push({ me, them: r });
  }
  const lower = basis !== "points";
  const score = r => basis === "points" ? r.pts : basis === "gross" ? r.gross : r.net;
  const rate = r => { const v = score(r); return v === null ? null : v / r.n; };  // a hole at a time, as it is read
  const value = r => { const x = rate(r); return x === null ? null : lower ? -x : x; };  // and again, where more is better
  return [...others.values()].map(o => {
    const pairs = o.pairs.filter(p => rate(p.me) !== null && rate(p.them) !== null)
      .sort((a, b) => String(a.me.date || "").localeCompare(String(b.me.date || "")));
    if (!pairs.length) return null;
    const ns = new Set(pairs.map(p => p.me.n));
    const myRate = pairs.map(p => rate(p.me)), theirRate = pairs.map(p => rate(p.them));
    const myValue = pairs.map(p => value(p.me)), theirValue = pairs.map(p => value(p.them));
    const theirMean = mean(theirValue);
    // A round that lands on their average is neither a good day nor a bad one. The tolerance matters:
    // the mean of a list of rates and one of those same rates can differ in the last bit, and with small
    // integer point totals a round sitting exactly on the average is an ordinary occurrence, not a freak.
    const EPS = 1e-9;
    const good = pairs.filter(p => value(p.them) > theirMean + EPS), bad = pairs.filter(p => value(p.them) < theirMean - EPS);
    const split = good.length >= 2 && bad.length >= 2;
    const onGood = split ? mean(good.map(p => rate(p.me))) : null;
    const onBad = split ? mean(bad.map(p => rate(p.me))) : null;
    const won = pairs.filter(p => value(p.me) > value(p.them)).length;
    const lost = pairs.filter(p => value(p.me) < value(p.them)).length;
    return {
      id: o.id, name: o.name, played: pairs.length, scale: ns.size === 1 ? [...ns][0] : null, basis, lower,
      myAvg: mean(myRate), theirAvg: mean(theirRate), won, lost, tied: pairs.length - won - lost,
      goodN: good.length, badN: bad.length, onGood, onBad,
      lift: split ? mean(good.map(p => value(p.me))) - mean(bad.map(p => value(p.me))) : null,
      corr: correlation(myValue, theirValue), pairs,
    };
  }).filter(Boolean).sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));
}
