/**
 * Reading a game the way a teacher would: what a mistake cost and where,
 * which kind of mistake it was, and which stones are in danger right now.
 *
 * Everything here is pure and works on sign maps (rows of 1 / -1 / 0) and
 * KataGo ownership arrays (Black's point of view, row-major), so the test
 * suite can exercise it without an engine.
 */

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function chains(signMap) {
  const size = signMap.length;
  const id = Array.from({ length: size }, () => new Int32Array(size).fill(-1));
  const out = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = signMap[y][x];
      if (!c || id[y][x] >= 0) continue;
      const stones = [];
      const libs = new Set();
      const stack = [[x, y]];
      id[y][x] = out.length;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        stones.push({ x: cx, y: cy });
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const v = signMap[ny][nx];
          if (v === 0) libs.add(ny * size + nx);
          else if (v === c && id[ny][nx] < 0) {
            id[ny][nx] = out.length;
            stack.push([nx, ny]);
          }
        }
      }
      out.push({ color: c, stones, libs: [...libs].map((i) => ({ x: i % size, y: Math.floor(i / size) })) });
    }
  }
  return { list: out, id };
}

/** Chains in atari (one liberty), split by colour. */
export function ataris(signMap) {
  const { list } = chains(signMap);
  return list.filter((c) => c.libs.length === 1);
}

/**
 * Where a move's loss came from. Compares ownership (mover's point of view)
 * before and after; returns the connected area that lost the most, with a
 * kind: "group" if the mover's own stones there turned dead, else "area".
 */
export function lossSource(signMapBefore, ownBefore, ownAfter, mover) {
  if (!ownBefore || !ownAfter) return null;
  const size = signMapBefore.length;
  const delta = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) delta[i] = (ownAfter[i] - ownBefore[i]) * mover;
  const seen = new Uint8Array(size * size);
  let best = null;
  for (let i = 0; i < size * size; i++) {
    if (seen[i] || delta[i] > -0.35) continue;
    const pts = [];
    let sum = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      pts.push(p);
      sum += delta[p];
      const x = p % size;
      const y = Math.floor(p / size);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const q = ny * size + nx;
        if (!seen[q] && delta[q] <= -0.25) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (!best || sum < best.sum) best = { pts, sum };
  }
  if (!best || best.sum > -1.5) return null;
  const points = best.pts.map((p) => ({ x: p % size, y: Math.floor(p / size) }));
  const own = points.filter((p) => signMapBefore[p.y][p.x] === mover);
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return {
    kind: own.length >= 1 && own.length * 3 >= points.length * 0.5 ? "group" : "area",
    points,
    stones: own,
    size: Math.round(-best.sum),
    center: { x: Math.round(cx), y: Math.round(cy) },
  };
}

/**
 * v4: where a mistake lost its points, from KataGo's ownership before the
 * move (what best play would keep: the root ownership of the position the
 * mover faced) and after it (the position as played, best play onwards).
 * Both arrays are Black's point of view, row-major.
 *
 * Returns { kind, points, regions, slow } where
 *   kind     "ko" | "semeai" | "group-died" | "group-lived" | "territory"
 *            | "tempo" | "loss" (no ownership: only the score is known)
 *   points   the loss in points (from the score lead), ≥ 0
 *   regions  up to three areas whose ownership flipped most, biggest first:
 *            { kind, points: [{x,y}], center, area, flip, share, pts,
 *              lost: [{x,y}] (mover's stones that died),
 *              lived: [{x,y}] (opponent stones that got away) }
 *   slow     tempo only: the move was played where nothing was left to gain
 *
 * `refutation` is the simulated punishing line (story.simulate facts) and is
 * only used to spot a ko; `best` is the engine's better move.
 */
export function attributeLoss({ signMapBefore, ownBefore, ownAfter, mover, move = null, best = null, loss = 0, refutation = [] }) {
  const points = Math.max(0, Number(loss) || 0);
  const size = signMapBefore.length;
  const far = best && !best.pass && move && !move.pass ? Math.max(Math.abs(best.x - move.x), Math.abs(best.y - move.y)) >= 4 : false;
  if (!ownBefore || !ownAfter) return { kind: "loss", points, regions: [], slow: false };
  const N = size * size;
  const delta = new Float32Array(N);
  let total = 0;
  for (let i = 0; i < N; i++) {
    delta[i] = (ownAfter[i] - ownBefore[i]) * mover;
    if (delta[i] < -0.1) total -= delta[i];
  }
  // Connected areas that flipped against the mover (8-neighbour, so a
  // diagonal shape stays one area).
  const seen = new Uint8Array(N);
  const raw = [];
  for (let i = 0; i < N; i++) {
    if (seen[i] || delta[i] > -0.35) continue;
    const pts = [];
    let sum = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      pts.push(p);
      sum -= delta[p];
      const x = p % size;
      const y = (p - x) / size;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const q = ny * size + nx;
          if (!seen[q] && delta[q] <= -0.2) {
            seen[q] = 1;
            stack.push(q);
          }
        }
    }
    if (sum >= 1) raw.push({ pts, sum });
  }
  raw.sort((a, b) => b.sum - a.sum);
  const { list, id } = chains(signMapBefore);
  const avg = (stones, own) => stones.reduce((s, p) => s + own[p.y * size + p.x], 0) / stones.length;
  const regions = raw.slice(0, 3).map((r) => {
    const pts = r.pts.map((p) => ({ x: p % size, y: Math.floor(p / size) }));
    const ids = new Set();
    for (const p of pts) if (signMapBefore[p.y][p.x]) ids.add(id[p.y][p.x]);
    const lost = [];
    const lived = [];
    const lostChains = [];
    const livedChains = [];
    for (const ci of ids) {
      const c = list[ci];
      const b = avg(c.stones, ownBefore) * mover;
      const a = avg(c.stones, ownAfter) * mover;
      if (c.color === mover && b > -0.1 && a < -0.3) {
        lost.push(...c.stones);
        lostChains.push(c);
      } else if (c.color === -mover && b > 0.3 && a < -0.1) {
        lived.push(...c.stones);
        livedChains.push(c);
      }
    }
    // A race: a dying chain of the mover's touching an enemy chain that lived.
    let semeai = false;
    if (lostChains.length && livedChains.length) {
      const near = new Set(livedChains.flatMap((c) => c.stones.map((s) => s.y * size + s.x)));
      semeai = lostChains.some((c) =>
        c.stones.some((s) =>
          DIRS.some(([dx, dy]) => {
            const nx = s.x + dx;
            const ny = s.y + dy;
            return nx >= 0 && ny >= 0 && nx < size && ny < size && near.has(ny * size + nx);
          }),
        ),
      );
    }
    const kind = semeai ? "semeai" : lost.length ? "group-died" : lived.length ? "group-lived" : "territory";
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const center = { x: Math.round(cx), y: Math.round(cy) };
    const share = total > 0 ? r.sum / total : 0;
    return {
      kind,
      points: pts,
      center,
      area: areaName(center.x, center.y, size),
      flip: Math.round(r.sum * 10) / 10,
      share: Math.round(share * 100) / 100,
      pts: Math.round(points * share * 2) / 2,
      lost,
      lived,
    };
  });
  const main = regions[0] || null;
  // A ko in the punishing line, near the area that flipped.
  const koNear = (refutation || []).some(
    (f) => f.ko && f.move && !f.move.pass && (!main || main.points.some((p) => Math.abs(p.x - f.move.x) + Math.abs(p.y - f.move.y) <= 3)),
  );
  let kind;
  let slow = false;
  if (koNear && main) kind = "ko";
  else if (main && main.kind !== "territory") kind = main.kind;
  else {
    // Territory, or tempo: the better move was elsewhere and the loss is
    // where it would have been played, or spread thin over the board.
    const nearBest = main && best && !best.pass ? main.points.some((p) => Math.max(Math.abs(p.x - best.x), Math.abs(p.y - best.y)) <= 2) : false;
    const nearMove = main && move && !move.pass ? main.points.some((p) => Math.max(Math.abs(p.x - move.x), Math.abs(p.y - move.y)) <= 2) : false;
    const spread = !main || main.share < 0.35;
    if (far && (spread || (nearBest && !nearMove))) {
      kind = "tempo";
      const at = move && !move.pass ? ownBefore[move.y * size + move.x] : 0;
      slow = Math.abs(at) >= 0.7;
    } else kind = main ? "territory" : "loss";
  }
  return { kind, points, regions, slow };
}

/** The same names as engine.areaOf (kept here so this module stays engine-free). */
export function areaName(x, y, size) {
  const third = size / 3;
  const col = x < third ? "left" : x >= size - third ? "right" : "center";
  const row = y < third ? "top" : y >= size - third ? "bottom" : "center";
  if (row === "center" && col === "center") return "center";
  if (row === "center") return col;
  if (col === "center") return row;
  return `${row}-${col}`;
}

/** Is (x, y) in a small empty area enclosed by `color` stones and the edge (an eye space)? */
export function inEyeSpace(signMap, x, y, color, limit = 7) {
  const size = signMap.length;
  if (signMap[y]?.[x] !== 0) return false;
  const seen = new Set([y * size + x]);
  const stack = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (++n > limit) return false;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const v = signMap[ny][nx];
      if (v === -color) return false;
      if (v === 0 && !seen.has(ny * size + nx)) {
        seen.add(ny * size + nx);
        stack.push([nx, ny]);
      }
    }
  }
  return true;
}

/**
 * Recognise the kind of mistake from the position, the mistake and the
 * punishing line. Returns a theme id from the problem vocabulary, or null
 * when the mistake was strategic (no tactical pattern). Heuristics, named
 * honestly in the UI as "looks like".
 *
 * v4: given `attribution` (attributeLoss) and `facts` (story.simulate of the
 * punishing line from `signMapAfter`, the board after the mistake, with the
 * opponent's reply first), the theme is read off that line: a real ladder,
 * snapback or double atari, a lost race (shared or outside liberties), a
 * ko, a placement inside the eye space, a cut. Without them it falls back to
 * the v3 heuristics.
 */
export function classifyMistake({ signMapBefore, signMapAfter = null, move, pv = [], source, mover, attribution = null, facts = null }) {
  if (attribution && facts) {
    const size = signMapBefore.length;
    const kind = attribution.kind;
    const main = attribution.regions[0];
    const after = signMapAfter || signMapBefore;
    const reply = facts[0] && !facts[0].pass && facts[0].color === -mover ? facts[0] : null;
    const theirs = facts.filter((f) => f.color === -mover && !f.pass);
    if (kind === "ko") return "ko";
    if (kind === "tempo" || kind === "loss") return null;
    if (theirs.some((f) => f.ladder === "start" || f.ladder === "chase")) return "ladder";
    if (theirs.some((f) => f.snapback)) return "snapback";
    if (theirs.slice(0, 2).some((f) => f.ataris.length >= 2)) return "double-atari";
    if (kind === "semeai" && main) {
      const ch = chains(after);
      const at = (stones) => [...new Set(stones.filter((s) => after[s.y][s.x]).map((s) => ch.id[s.y][s.x]))].map((i) => ch.list[i]);
      let shared = 0;
      for (const a of at(main.lost))
        for (const b of at(main.lived)) shared = Math.max(shared, a.libs.filter((l) => b.libs.some((m) => m.x === l.x && m.y === l.y)).length);
      return shared >= 2 ? "race-shared" : "race-outside";
    }
    if (kind === "group-died" && main) {
      if (reply && inEyeSpace(after, reply.move.x, reply.move.y, mover)) return "vital-point";
      const nearEdge = main.lost.some((s) => Math.min(s.x, s.y, size - 1 - s.x, size - 1 - s.y) <= 2);
      return nearEdge ? "eye-space" : "vital-point";
    }
    if (kind === "group-lived") return "vital-point";
    if (kind === "territory" && reply && reply.cuts >= 2) return "cut";
    return null;
  }
  if (!source) return null;
  const size = signMapBefore.length;
  // A ladder: the punishing line is a run of ataris on one chain, moving diagonally.
  if (pv.length >= 4) {
    const firsts = pv.slice(0, 6).filter((m, i) => i % 2 === 0 && !m.pass);
    const diag = firsts.every((m, i) => i === 0 || (Math.abs(m.x - firsts[i - 1].x) <= 2 && Math.abs(m.y - firsts[i - 1].y) <= 2));
    if (firsts.length >= 3 && diag && source.kind === "group" && source.stones.length <= 8) return "ladder";
  }
  if (source.kind === "group") {
    // Near an opposing weak chain: a capturing race.
    const { list, id } = chains(signMapBefore);
    const mine = new Set(source.stones.map((s) => id[s.y][s.x]));
    for (const ci of mine) {
      const c = list[ci];
      if (!c) continue;
      for (const s of c.stones) {
        for (const [dx, dy] of DIRS) {
          const nx = s.x + dx;
          const ny = s.y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (signMapBefore[ny][nx] === -mover) {
            const opp = list[id[ny][nx]];
            if (opp && opp.libs.length <= Math.max(3, c.libs.length + 1) && c.libs.length <= 4) return "race-outside";
          }
        }
      }
    }
    // A group on the edge or corner that died: life and death.
    const nearEdge = source.stones.some((s) => Math.min(s.x, s.y, size - 1 - s.x, size - 1 - s.y) <= 2);
    if (nearEdge) return "eye-space";
    return "vital-point";
  }
  // Territory lost right next to the move: often a cut.
  if (move && !move.pass && source.points.length >= 4) {
    const touching = pv[0] && !pv[0].pass ? source.points.some((p) => Math.abs(p.x - pv[0].x) + Math.abs(p.y - pv[0].y) <= 1) : false;
    if (touching) return "cut";
  }
  return null;
}

/** Problem topic (practice collection) for a theme, to recommend a set. */
export const THEME_TOPIC = {
  ladder: "capture",
  net: "capture",
  snapback: "capture",
  "throw-in": "capture",
  "double-atari": "capture",
  shortage: "capture",
  "connect-and-die": "capture",
  cut: "connect",
  "vital-point": "kill",
  "eye-space": "life",
  "false-eye": "kill",
  ko: "life",
  "race-outside": "race",
  "race-shared": "race",
};

/** Decay old weaknesses so the recommendation follows recent games. */
export function addWeakness(weak = {}, theme, now = Date.now()) {
  const out = {};
  for (const [k, v] of Object.entries(weak)) {
    const ageDays = (now - (v.last || now)) / 86400000;
    const score = v.score * Math.pow(0.5, ageDays / 21);
    if (score > 0.05) out[k] = { ...v, score };
  }
  if (theme) {
    const prev = out[theme] || { score: 0, count: 0 };
    out[theme] = { score: prev.score + 1, count: (prev.count || 0) + 1, last: now };
  }
  return out;
}

export function topWeaknesses(weak = {}, n = 2) {
  return Object.entries(weak)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, n)
    .map(([theme, v]) => ({ theme, ...v }));
}

/** How hard the position looks: drives the computer's thinking time. */
export function complexity(analysis) {
  const moves = (analysis?.moves || []).filter((m) => m.visits > 0);
  if (moves.length < 2) return 0.3;
  const total = moves.reduce((s, m) => s + m.visits, 0);
  const share = moves[0].visits / total;
  const spread = Math.abs((moves[0].scoreLead ?? 0) - (moves[1].scoreLead ?? 0));
  // One obvious move → low; several close candidates → high.
  return Math.max(0, Math.min(1, (1 - share) * 1.3 + (spread < 1 ? 0.25 : 0)));
}

/** Is the game effectively over? Ownership settled nearly everywhere. */
export function settled(ownership, threshold = 0.9) {
  if (!ownership) return false;
  let firm = 0;
  for (const v of ownership) if (Math.abs(v) >= 0.85) firm++;
  return firm / ownership.length >= threshold;
}
