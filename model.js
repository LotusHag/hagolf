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
    players.push({
      name, hi, ch, ph, ch_override: override, tee, par, gender, id: p.id ?? null, from_hole: fromHole, skipped, group: p.group || 1,
      raw_scores: scores, penalty: pen, penalties: pens, penalty_total: sum(pen), picked, filled, nr,
      holes_played: played, scores: sc, deltas,
      gross: nr ? null : sum(sc), topar: nr ? null : sum(sc) - sum(par),
      strokes, nets, net: nr ? null : sum(nets), hpts, pts: sum(hpts), counts,
    });
  }
  M.players = players;
  M.field = players.length;

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

  const segs = M.segments;
  const back = [...Array(n).keys()].reverse();
  const keyGross = p => [p.gross, ...segs.map(k => sum(p.scores.slice(n - k))), ...back.map(h => p.scores[h])];
  const keyPts = p => [-p.pts, ...segs.map(k => -sum(p.hpts.slice(n - k))), ...back.map(h => -p.hpts[h])];
  const finished = players.filter(p => !p.nr).sort((a, b) => cmpTuple(keyGross(a), keyGross(b)));
  const noReturn = players.filter(p => p.nr).sort((a, b) => cmpTuple([-a.holes_played, -a.pts], [-b.holes_played, -b.pts]));
  M.gross_board = [...finished, ...noReturn];
  M.stbl_board = [...players].sort((a, b) => cmpTuple(keyPts(a), keyPts(b)));
  // positions run 1, 2, 3 in board order: equal scores are separated by the countback, which the footer explains
  finished.forEach((p, i) => { p.gplace = i + 1; });
  noReturn.forEach(p => { p.gplace = null; });
  M.stbl_board.forEach((p, i) => { p.splace = i + 1; });
  players.forEach(p => { p.gtied = p.stied = false; p.gcb = p.scb = null; });

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

// ---------------------------------------------------------------- seasons: standings for a group across rounds
/**
 * `results` is a list of computed rounds (M) with `.id`; `memberIds` the roster ids in the group; `bestN` 0 for all.
 * Only members count, so a guest never changes the table. Returns rows sorted by running total then average.
 */
export function standings(results, memberIds, bestN = 0) {
  const members = new Set(memberIds);
  const rows = new Map();
  const roundsIn = [];
  for (const M of results) {
    const mine = M.players.filter(p => p.id !== null && members.has(p.id));
    if (!mine.length) continue;
    roundsIn.push(M);
    const best = Math.max(...mine.map(p => p.pts));
    for (const p of mine) {
      if (!rows.has(p.id)) rows.set(p.id, { id: p.id, name: p.name, rounds: [], wins: 0, gross_topar: [], hi: p.hi });
      const r = rows.get(p.id);
      r.name = p.name;
      r.hi = p.hi;
      r.rounds.push({ round: M.id, name: M.name, date: M.date, pts: p.pts, gross: p.gross, topar: p.topar, net: p.net });
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
  for (const M of results) {
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
      r.rounds.push({ round: M.id, name: M.name, date: M.date, net: p.net, topar });
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
  return { rows: out, rounds: results, bestN };
}

/**
 * One match, hole by hole. `basis` decides what wins a hole and it changes results:
 *   "net"    net strokes, lower wins -- ordinary golf matchplay.
 *   "points" Stableford points, higher wins. Points floor at zero, so two blow-ups halve the hole
 *            where net strokes would still separate them.
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
    if (basis === "points") {
      if (pa.hpts[h] > pb.hpts[h]) up++; else if (pb.hpts[h] > pa.hpts[h]) up--;
    } else if (pa.nets[h] < pb.nets[h]) up++; else if (pb.nets[h] < pa.nets[h]) up--;
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
  for (const M of results) {
    const mine = M.players.filter(p => p.id !== null && members.has(p.id));
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
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
  return { rows: out, rounds: results, win, draw, basis };
}

// The classic Formula 1 points table: winning a round is worth far more than turning up.
export const GP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/**
 * Grand Prix scoring: each round hands out points by finishing position, as Formula 1 does, so one
 * good day counts for more than being steadily mid-table. Position is taken among the league's own
 * players on the day (from the Stableford board, countback and all), so a guest cannot take the win
 * and a small turnout still gives the winner full points.
 */
export function gpStandings(results, memberIds, bestN = 0, table = GP_POINTS) {
  const members = new Set(memberIds);
  const rows = new Map();
  for (const M of results) {
    const mine = M.stbl_board.filter(p => p.id !== null && members.has(p.id));
    mine.forEach((p, i) => {
      if (!rows.has(p.id)) rows.set(p.id, { id: p.id, name: p.name, scores: [], wins: 0, best: 0 });
      const r = rows.get(p.id);
      r.name = p.name;
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
  return { rows: out, rounds: results, bestN, table };
}

/**
 * Two players in a league: every attached round they both played, and every way of comparing them --
 * points, gross, holes won on net, birdies, the match, the run of results at the end.
 */
export function headToHead(results, a, b, basis = "net") {
  const rounds = [];
  for (const M of results) {
    const pa = M.players.find(p => p.id === a), pb = M.players.find(p => p.id === b);
    if (!pa || !pb) continue;
    const m = matchResult(pa, pb, basis);
    let holesA = 0, holesB = 0, halved = 0;
    for (let h = 0; h < pa.nets.length; h++) {
      const na = pa.nets[h] === null, nb = pb.nets[h] === null;
      if (na && nb) continue;
      if (na) { holesB++; continue; }
      if (nb) { holesA++; continue; }
      // settled the way matchResult settles a hole, so the tally and the running match never disagree
      const x = basis === "points" ? -pa.hpts[h] : pa.nets[h], y = basis === "points" ? -pb.hpts[h] : pb.nets[h];
      if (x < y) holesA++; else if (y < x) holesB++; else halved++;
    }
    rounds.push({ id: M.id, name: M.name, date: M.date, where: M.course.loop || M.course.name,
      ptsA: pa.pts, ptsB: pb.pts, grossA: pa.gross, grossB: pb.gross, netA: pa.net, netB: pb.net,
      birdiesA: pa.counts[0], birdiesB: pb.counts[0], holesA, holesB, halved,
      winner: pa.pts > pb.pts ? "a" : pb.pts > pa.pts ? "b" : "tie", up: m.up, matchWinner: m.up > 0 ? "a" : m.up < 0 ? "b" : "tie" });
  }
  rounds.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  const sumBy = k => rounds.reduce((s, r) => s + r[k], 0);
  const avg = k => rounds.length ? sumBy(k) / rounds.length : 0;
  const bestOf = (k, lowest) => {
    const xs = rounds.map(r => r[k]).filter(v => v !== null);
    return xs.length ? (lowest ? Math.min(...xs) : Math.max(...xs)) : null;
  };
  // Gross only compares over the rounds where both of them returned a card.
  const both = rounds.filter(r => r.grossA !== null && r.grossB !== null);
  const avgGross = k => both.length ? both.reduce((s, r) => s + r[k], 0) / both.length : null;
  const widest = who => rounds.filter(r => r.winner === who)
    .reduce((best, r) => !best || Math.abs(r.ptsA - r.ptsB) > Math.abs(best.ptsA - best.ptsB) ? r : best, null);
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
    avgGrossA: avgGross("grossA"), avgGrossB: avgGross("grossB"), bestGrossA: bestOf("grossA", true), bestGrossB: bestOf("grossB", true),
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
  for (const M of results) {
    const rank = siRanks(M.si);
    const where = M.course.loop || M.course.name;
    for (const p of M.players) {
      if (p.id === null || !members.has(p.id)) continue;
      for (let h = 0; h < M.n; h++) {
        if (p.scores[h] === null) continue;
        out.push({
          pid: p.id, round: M.id, where, hole: h, label: M.labels[h], si: M.si[h],
          band: rank[h] <= M.n / 3 ? 0 : rank[h] > (2 * M.n) / 3 ? 2 : 1,  // hardest third, middle, easiest third
          par: p.par[h], score: p.scores[h], delta: p.deltas[h], pts: p.hpts[h], bucket: scoreBucket(p.deltas[h]),
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
  return { ...part(hs), counts, byPar, bands: [0, 1, 2].map(b => part(hs.filter(h => h.band === b))) };
}

/** The holes of a set of rounds ranked by how far over par they were played, hardest first. */
function holeDifficulty(hs) {
  const m = new Map();
  for (const h of hs) {
    const k = `${h.where}|${h.label}`;
    if (!m.has(k)) m.set(k, { where: h.where, label: h.label, par: h.par, si: h.si, xs: [] });
    m.get(k).xs.push(h);
  }
  return [...m.values()].filter(x => x.xs.length >= 2)
    .map(x => ({ where: x.where, label: x.label, par: x.par, si: x.si, n: x.xs.length,
      vspar: mean(x.xs.map(h => h.delta)), pts: mean(x.xs.map(h => h.pts)) }))
    .sort((a, b) => b.vspar - a.vspar || a.si - b.si);
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
    id: M.id, name: M.name, date: M.date, where: M.course.loop || M.course.name, n,
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
  const holes = statHoles(results, memberIds);
  const rounds = [];
  const names = new Map();
  for (const M of results) {
    const mine = M.players.filter(p => p.id !== null && members.has(p.id));
    const board = M.stbl_board.filter(p => p.id !== null && members.has(p.id));
    for (const p of mine) {
      names.set(p.id, p.name);
      rounds.push(roundLine(M, p, mine.filter(q => q !== p), board.indexOf(p) + 1, board.length));
    }
  }
  rounds.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  const best = (xs, key, lowest = false) => xs.filter(x => x[key] !== null)
    .sort((a, b) => (lowest ? a[key] - b[key] : b[key] - a[key]) || String(a.date || "").localeCompare(String(b.date || "")))[0] || null;

  const players = [...names.keys()].map(id => {
    const rs = rounds.filter(r => r.pid === id);
    const mineRounds = new Set(rs.map(r => r.id));
    const mine = tally(holes.filter(h => h.pid === id));
    // the rest of the league, on the same days only, so the comparison is like for like
    const rest = tally(holes.filter(h => h.pid !== id && mineRounds.has(h.round)));
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

  const diff = holeDifficulty(holes);
  const field = {
    ...tally(holes), players: players.length, cards: rounds.length,
    rounds: new Set(rounds.map(r => r.id)).size,
    avgPts: mean(rounds.map(r => r.pts)), avgTopar: mean(rounds.map(r => r.topar)),
    bestRound: best(rounds, "pts"), lowRound: best(rounds, "topar", true),
    mostBirdies: rounds.map(r => ({ ...r, birdies: r.counts[0] + r.counts[1] })).sort((a, b) => b.birdies - a.birdies)[0] || null,
    bounce: sum(rounds.map(r => r.chances)) ? sum(rounds.map(r => r.backs)) / sum(rounds.map(r => r.chances)) : null,
    hardest: diff.slice(0, 5), easiest: [...diff].reverse().slice(0, 5),
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
 * head-to-head cannot say: whether the other one's own day moves theirs. Everything is points a hole,
 * because a league mixes nines and eighteens and half a round must not sit beside a whole one; `scale`
 * is the hole count when every shared round has the same one, null when they mix, and only then does
 * the screen multiply back up to a round.
 *
 * `onGood` and `onBad` are what the player scored on the rounds where the rival beat their own average
 * over those same rounds, and on the rounds where they did not: measured against the rival's own
 * average, so a good player is not simply always on song and a weak one never. Both sides need two
 * rounds before either appears. `rounds` is the list leagueStats returns, so guests are already out.
 */
export function rivals(rounds, pid) {
  const byRound = new Map(rounds.filter(r => r.pid === pid && r.n).map(r => [r.id, r]));
  const others = new Map();
  for (const r of rounds) {
    if (r.pid === pid || !r.n || !byRound.has(r.id)) continue;
    if (!others.has(r.pid)) others.set(r.pid, { id: r.pid, name: r.player, pairs: [] });
    others.get(r.pid).pairs.push({ me: byRound.get(r.id), them: r });
  }
  const rate = r => r.pts / r.n;
  return [...others.values()].map(o => {
    const pairs = o.pairs.sort((a, b) => String(a.me.date || "").localeCompare(String(b.me.date || "")));
    const ns = new Set(pairs.map(p => p.me.n));
    const myRate = pairs.map(p => rate(p.me)), theirRate = pairs.map(p => rate(p.them));
    const theirAvg = mean(theirRate);
    // A round that lands on their average is neither a good day nor a bad one. The tolerance matters:
    // the mean of a list of rates and one of those same rates can differ in the last bit, and with small
    // integer point totals a round sitting exactly on the average is an ordinary occurrence, not a freak.
    const EPS = 1e-9;
    const good = pairs.filter(p => rate(p.them) > theirAvg + EPS), bad = pairs.filter(p => rate(p.them) < theirAvg - EPS);
    const split = good.length >= 2 && bad.length >= 2;
    const onGood = split ? mean(good.map(p => rate(p.me))) : null;
    const onBad = split ? mean(bad.map(p => rate(p.me))) : null;
    const won = pairs.filter(p => rate(p.me) > rate(p.them)).length;
    const lost = pairs.filter(p => rate(p.me) < rate(p.them)).length;
    return {
      id: o.id, name: o.name, played: pairs.length, scale: ns.size === 1 ? [...ns][0] : null,
      myAvg: mean(myRate), theirAvg, won, lost, tied: pairs.length - won - lost,
      goodN: good.length, badN: bad.length, onGood, onBad,
      lift: split ? onGood - onBad : null, corr: correlation(myRate, theirRate), pairs,
    };
  }).sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));
}
