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
 * Recognise the kind of mistake from the position, the mistake and the
 * punishing line. Returns a theme id from the problem vocabulary, or null
 * when the mistake was strategic (no tactical pattern). Heuristics, named
 * honestly in the UI as "looks like".
 */
export function classifyMistake({ signMapBefore, move, pv = [], source, mover }) {
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
