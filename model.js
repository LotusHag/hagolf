// Port of golf/model.py and golf/handicap.py. Same rules, same numbers: see app/tests/model.test.mjs.

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
 * { name, date, defaultTee, allowance, entries: [{ name, hi, tee, gender, courseHandicap, scores, penalties }] }.
 * Entries without a full set of scores are listed in M.unfinished and left out of the boards, as in Python.
 * Throws an Error with a readable message on bad input.
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
    if (!scores || scores.length !== n || scores.some((s, h) => !skipped[h] && (s === null || s === undefined || s === ""))) {
      M.unfinished.push(name);
      continue;
    }
    scores = scores.map((s, h) => skipped[h] ? null : Number(s));
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
    const sc = scores.map((s, h) => picked[h] || skipped[h] ? null : s + pen[h]);
    const strokes = strokesPerHole(ph, si);
    const nets = sc.map((s, h) => s === null ? null : s - strokes[h]);
    const hpts = sc.map((s, h) => s === null ? 0 : stableford(s, par[h], strokes[h]));
    const deltas = sc.map((s, h) => s === null ? null : s - par[h]);
    const nr = picked.some(Boolean) || skipped.some(Boolean);
    const played = sc.filter(x => x !== null).length;
    const counts = [0, 1, 2, 3].map(k => deltas.filter(d => d !== null && outcome(d) === k).length);
    players.push({
      name, hi, ch, ph, ch_override: override, tee, par, gender, id: p.id ?? null, from_hole: fromHole, skipped, group: p.group || 1,
      raw_scores: scores, penalty: pen, penalties: pens, penalty_total: sum(pen), picked, nr,
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

/** Two players in a league: every attached round they both finished, who took more points, and the tally. */
export function headToHead(results, a, b) {
  const rounds = [];
  for (const M of results) {
    const pa = M.players.find(p => p.id === a), pb = M.players.find(p => p.id === b);
    if (!pa || !pb) continue;
    rounds.push({ id: M.id, name: M.name, date: M.date, ptsA: pa.pts, ptsB: pb.pts, grossA: pa.gross, grossB: pb.gross,
      winner: pa.pts > pb.pts ? "a" : pb.pts > pa.pts ? "b" : "tie" });
  }
  rounds.sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  const sumBy = k => rounds.reduce((s, r) => s + r[k], 0);
  return { rounds, winsA: rounds.filter(r => r.winner === "a").length, winsB: rounds.filter(r => r.winner === "b").length,
    ties: rounds.filter(r => r.winner === "tie").length, ptsA: sumBy("ptsA"), ptsB: sumBy("ptsB") };
}
