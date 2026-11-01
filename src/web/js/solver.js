/**
 * Life-and-death and capturing solver.
 *
 * Every practice problem in Goban Studio is checked by this module, in the
 * test suite and live in the app. A problem is a small position plus a goal
 * (capture, save, kill, live). The solver searches every reply inside the
 * problem's region, so:
 *
 *   - the test suite can prove each problem has a correct answer, list every
 *     correct first move, and measure how hard the problem is;
 *   - the app can answer *any* move the learner tries: a wrong move gets the
 *     real refutation, a right move gets the most stubborn defence.
 *
 * Rules: captures, no suicide, simple ko. A ko or a position the search
 * cannot settle inside its depth counts as a failure for the attacker, so a
 * problem is only "solved" when the result is unconditional.
 */

export const BLACK = 1;
export const WHITE = -1;

const PASS = -1;

/* ------------------------------------------------------------------ parse */

/**
 * Diagram notation, one string per row (spaces are ignored):
 *   X / O   black / white stone
 *   x / o   black / white key stone (the stones the goal is about)
 *   .       empty point inside the problem region
 *   ,       empty point outside the region (play there is a tenuki)
 * A problem without any ',' and without `region: "all"` treats every empty
 * point of the diagram as region.
 */
export function parseDiagram(rows) {
  const grid = rows.map((r) => r.replace(/\s+/g, "").split(""));
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  const stones = [];
  const keys = [];
  const region = [];
  let hasOutside = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x] ?? ",";
      if (ch === "X" || ch === "x") stones.push({ x, y, c: BLACK });
      else if (ch === "O" || ch === "o") stones.push({ x, y, c: WHITE });
      if (ch === "x" || ch === "o") keys.push({ x, y });
      if (ch === ".") region.push({ x, y });
      if (ch === ",") hasOutside = true;
      if (!"XOxo.,".includes(ch)) throw new Error(`bad diagram character '${ch}'`);
    }
  }
  return { w, h, stones, keys, region, hasOutside };
}

/**
 * Normalise a problem description into a puzzle the solver can run.
 *
 * problem = {
 *   diagram: [...rows], size = 19, corner = "tl" | "tr" | "bl" | "br",
 *   at: [x0, y0] (overrides corner), toMove = 1 | -1,
 *   goal: "capture" | "save" | "kill" | "live", escape = 3, maxDepth
 * }
 */
export function createPuzzle(problem) {
  const size = problem.size || 19;
  const d = parseDiagram(problem.diagram);
  let x0 = 0;
  let y0 = 0;
  if (problem.at) [x0, y0] = problem.at;
  else {
    const corner = problem.corner || "tl";
    if (corner.includes("r")) x0 = size - d.w;
    if (corner.includes("b")) y0 = size - d.h;
  }
  if (x0 < 0 || y0 < 0 || x0 + d.w > size || y0 + d.h > size) throw new Error("diagram does not fit the board");
  const shift = (p) => ({ ...p, x: p.x + x0, y: p.y + y0 });
  const stones = d.stones.map(shift);
  const keys = d.keys.map(shift);
  if (!keys.length) throw new Error("a problem needs at least one key stone");
  const keyColor = stones.find((s) => s.x === keys[0].x && s.y === keys[0].y).c;
  for (const k of keys) {
    const s = stones.find((st) => st.x === k.x && st.y === k.y);
    if (!s || s.c !== keyColor) throw new Error("key stones must share one colour");
  }
  const goal = problem.goal;
  if (!["capture", "save", "kill", "live"].includes(goal)) throw new Error(`unknown goal ${goal}`);
  const attackGoal = goal === "capture" || goal === "kill";
  const toMove = problem.toMove ?? (attackGoal ? -keyColor : keyColor);
  const userColor = toMove;
  if (attackGoal && userColor !== -keyColor) throw new Error("the attacker must move first in an attack problem");
  if (!attackGoal && userColor !== keyColor) throw new Error("the defender must move first in a defence problem");
  const lifeGoal = goal === "kill" || goal === "live";
  let region = null;
  if (lifeGoal || d.hasOutside) {
    region = d.region.map(shift);
    // Empty points inside the diagram are region unless marked ','.
  }
  if (lifeGoal && (!region || !region.length)) throw new Error("kill/live problems need a region");
  const view = viewFor(size, x0, y0, d.w, d.h);
  return {
    id: problem.id,
    size,
    stones,
    keys,
    keyColor,
    attacker: -keyColor,
    userColor,
    toMove,
    goal,
    lifeGoal,
    region,
    escape: problem.escape || 3,
    maxDepth: problem.maxDepth || (lifeGoal ? Math.min(40, (region?.length || 10) * 2 + 8) : 30),
    view,
  };
}

function viewFor(size, x0, y0, w, h) {
  // Show the diagram plus two lines of open board towards the centre so the
  // problem reads as a corner/side of a real board.
  const pad = 2;
  let vx0 = x0 === 0 ? 0 : Math.max(0, x0 - pad);
  let vy0 = y0 === 0 ? 0 : Math.max(0, y0 - pad);
  let vx1 = x0 + w >= size ? size - 1 : Math.min(size - 1, x0 + w - 1 + pad);
  let vy1 = y0 + h >= size ? size - 1 : Math.min(size - 1, y0 + h - 1 + pad);
  // Keep the window roughly square and at least 7 lines.
  const minSpan = Math.min(size, 7);
  while (vx1 - vx0 + 1 < minSpan) {
    if (vx1 < size - 1) vx1++;
    else vx0--;
  }
  while (vy1 - vy0 + 1 < minSpan) {
    if (vy1 < size - 1) vy1++;
    else vy0--;
  }
  const span = Math.max(vx1 - vx0, vy1 - vy0);
  while (vx1 - vx0 < span) {
    if (vx0 > 0 && (vx1 >= size - 1 || x0 > 0)) vx0--;
    else if (vx1 < size - 1) vx1++;
    else break;
  }
  while (vy1 - vy0 < span) {
    if (vy0 > 0 && (vy1 >= size - 1 || y0 > 0)) vy0--;
    else if (vy1 < size - 1) vy1++;
    else break;
  }
  return { x0: vx0, y0: vy0, x1: vx1, y1: vy1 };
}

/* ------------------------------------------------------------------ board */

const ctxCache = new Map();

function context(size) {
  if (ctxCache.has(size)) return ctxCache.get(size);
  const n = size * size;
  const nbr = [];
  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const list = [];
    if (x > 0) list.push(i - 1);
    if (x < size - 1) list.push(i + 1);
    if (y > 0) list.push(i - size);
    if (y < size - 1) list.push(i + size);
    nbr.push(list);
  }
  let seed = 0x9e3779b9 ^ size;
  const rnd = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed;
  };
  const zb = new Uint32Array(n * 2);
  const zw = new Uint32Array(n * 2);
  for (let i = 0; i < n * 2; i++) {
    zb[i] = rnd();
    zw[i] = rnd();
  }
  const c = { size, n, nbr, zb, zw, mark: new Uint32Array(n), stamp: 1 };
  ctxCache.set(size, c);
  return c;
}

function zKey(c, i, color) {
  const o = color === BLACK ? 0 : 1;
  return [c.zb[i * 2 + o], c.zw[i * 2 + o]];
}

function nextStamp(c) {
  c.stamp++;
  if (c.stamp > 0xfffffff0) {
    c.mark.fill(0);
    c.stamp = 1;
  }
  return c.stamp;
}

/** Stones and liberties of the chain at i. */
function chain(c, board, i) {
  const color = board[i];
  const stones = [];
  const libs = [];
  const s = nextStamp(c);
  const stack = [i];
  c.mark[i] = s;
  while (stack.length) {
    const p = stack.pop();
    stones.push(p);
    for (const q of c.nbr[p]) {
      if (c.mark[q] === s) continue;
      if (board[q] === color) {
        c.mark[q] = s;
        stack.push(q);
      } else if (board[q] === 0) {
        c.mark[q] = s;
        libs.push(q);
      }
    }
  }
  return { stones, libs };
}

export function initialState(pz) {
  const c = context(pz.size);
  const board = new Int8Array(c.n);
  let h1 = 0;
  let h2 = 0;
  for (const s of pz.stones) {
    const i = s.y * pz.size + s.x;
    board[i] = s.c;
    const [a, b] = zKey(c, i, s.c);
    h1 ^= a;
    h2 ^= b;
  }
  return { board, toMove: pz.toMove, ko: -1, passes: 0, h1, h2 };
}

/** Play at index i (or PASS). Returns a new state or null when illegal. */
export function play(pz, st, i) {
  const c = context(pz.size);
  const color = st.toMove;
  if (i === PASS) return { board: st.board, toMove: -color, ko: -1, passes: st.passes + 1, h1: st.h1, h2: st.h2, last: PASS };
  if (st.board[i] !== 0 || i === st.ko) return null;
  const board = st.board.slice();
  board[i] = color;
  let [h1, h2] = zKey(c, i, color);
  h1 ^= st.h1;
  h2 ^= st.h2;
  let captured = 0;
  let capturedAt = -1;
  for (const q of c.nbr[i]) {
    if (board[q] !== -color) continue;
    const ch = chain(c, board, q);
    if (ch.libs.length) continue;
    for (const p of ch.stones) {
      const [a, b] = zKey(c, p, -color);
      h1 ^= a;
      h2 ^= b;
      board[p] = 0;
    }
    captured += ch.stones.length;
    capturedAt = ch.stones[0];
  }
  const own = chain(c, board, i);
  if (!own.libs.length) return null; // suicide
  let ko = -1;
  if (captured === 1 && own.stones.length === 1 && own.libs.length === 1) ko = capturedAt;
  return { board, toMove: -color, ko, passes: 0, h1: h1 >>> 0, h2: h2 >>> 0, last: i };
}

/* -------------------------------------------------------------- analysis */

/** Benson's unconditional life for the chains of `color` touching `keys`. */
export function bensonAlive(pz, board, color, keyIdx) {
  const c = context(pz.size);
  const n = c.n;
  const chainOf = new Int32Array(n).fill(-1);
  const chains = [];
  for (let i = 0; i < n; i++) {
    if (board[i] !== color || chainOf[i] >= 0) continue;
    const ch = chain(c, board, i);
    const id = chains.length;
    for (const p of ch.stones) chainOf[p] = id;
    chains.push({ libs: new Set(ch.libs), alive: true });
  }
  const regionOf = new Int32Array(n).fill(-1);
  const regions = [];
  for (let i = 0; i < n; i++) {
    if (board[i] === color || regionOf[i] >= 0) continue;
    const id = regions.length;
    const pts = [];
    const borders = new Set();
    const stack = [i];
    regionOf[i] = id;
    while (stack.length) {
      const p = stack.pop();
      pts.push(p);
      for (const q of c.nbr[p]) {
        if (board[q] === color) borders.add(chainOf[q]);
        else if (regionOf[q] < 0) {
          regionOf[q] = id;
          stack.push(q);
        }
      }
    }
    regions.push({ pts, borders, healthy: true });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let id = 0; id < chains.length; id++) {
      const ch = chains[id];
      if (!ch.alive) continue;
      let vital = 0;
      for (const r of regions) {
        if (!r.healthy || !r.borders.has(id)) continue;
        let all = true;
        for (const p of r.pts) {
          if (board[p] === 0 && !ch.libs.has(p)) {
            all = false;
            break;
          }
        }
        if (all) vital++;
        if (vital >= 2) break;
      }
      if (vital < 2) {
        ch.alive = false;
        changed = true;
        for (const r of regions) if (r.borders.has(id)) r.healthy = false;
      }
    }
  }
  return keyIdx.every((i) => board[i] === color && chains[chainOf[i]].alive);
}

function keyIndices(pz) {
  return pz.keys.map((k) => k.y * pz.size + k.x);
}

/** +1: attacker has won, -1: defender has won, 0: undecided. */
function terminal(pz, st, keyIdx) {
  for (const i of keyIdx) if (st.board[i] !== pz.keyColor) return 1;
  if (st.passes >= 2) return -1;
  const c = context(pz.size);
  if (pz.lifeGoal) {
    if (bensonAlive(pz, st.board, pz.keyColor, keyIdx)) return -1;
  } else {
    let minLibs = Infinity;
    for (const i of keyIdx) minLibs = Math.min(minLibs, chain(c, st.board, i).libs.length);
    if (minLibs >= pz.escape) return -1;
  }
  return 0;
}

function regionSet(pz) {
  if (!pz._region && pz.region) pz._region = pz.region.map((p) => p.y * pz.size + p.x);
  return pz._region;
}

/** Candidate moves for the side to move, best guesses first. */
function candidates(pz, st, keyIdx) {
  const c = context(pz.size);
  const board = st.board;
  const color = st.toMove;
  const attacking = color === pz.attacker;
  const set = new Set();
  const region = regionSet(pz);
  if (region) {
    for (const i of region) if (board[i] === 0) set.add(i);
  } else {
    const keyLibs = new Set();
    const adjacentEnemies = new Map();
    for (const k of keyIdx) {
      if (board[k] !== pz.keyColor) continue;
      const ch = chain(c, board, k);
      for (const l of ch.libs) keyLibs.add(l);
      for (const s of ch.stones) {
        for (const q of c.nbr[s]) {
          if (board[q] === pz.attacker && !adjacentEnemies.has(q)) {
            const ec = chain(c, board, q);
            for (const p of ec.stones) adjacentEnemies.set(p, ec);
          }
        }
      }
    }
    for (const l of keyLibs) {
      set.add(l);
      for (const q of c.nbr[l]) if (board[q] === 0) set.add(q);
    }
    const seen = new Set();
    for (const ec of adjacentEnemies.values()) {
      if (seen.has(ec)) continue;
      seen.add(ec);
      if (ec.libs.length <= 2) for (const l of ec.libs) set.add(l);
    }
  }
  const moves = [];
  for (const i of set) {
    const next = play(pz, st, i);
    if (!next) continue;
    moves.push({ i, next, score: moveScore(pz, st, next, i, attacking, keyIdx) });
  }
  moves.sort((a, b) => b.score - a.score);
  return moves;
}

function moveScore(pz, st, next, i, attacking, keyIdx) {
  const c = context(pz.size);
  let keyLibs = 0;
  let captured = false;
  for (const k of keyIdx) {
    if (next.board[k] !== pz.keyColor) {
      captured = true;
      break;
    }
    keyLibs += chain(c, next.board, k).libs.length;
  }
  if (captured) return attacking ? 1000 : -1000;
  const ownLibs = chain(c, next.board, i).libs.length;
  let removed = 0;
  for (let p = 0; p < next.board.length; p++) if (st.board[p] !== 0 && next.board[p] === 0) removed++;
  return (attacking ? -keyLibs * 3 : keyLibs * 3) + ownLibs + removed * 4;
}

class Search {
  constructor(pz, budget = 150000) {
    this.pz = pz;
    this.keyIdx = keyIndices(pz);
    // The table is shared by every search on this puzzle: positions repeat
    // across first-move checks, replies and status checks.
    if (!pz._tt || pz._tt.size > 1500000) pz._tt = new Map();
    this.tt = pz._tt;
    this.nodes = 0;
    this.budget = budget;
    this.exhausted = false;
  }

  key(st) {
    return `${st.h1},${st.h2},${st.toMove},${st.ko},${st.passes}`;
  }

  /** Returns { win: attacker wins, exact } */
  run(st, depth) {
    this.nodes++;
    if (this.nodes > this.budget) {
      this.exhausted = true;
      return { win: false, exact: false };
    }
    const term = terminal(this.pz, st, this.keyIdx);
    if (term) return { win: term > 0, exact: true };
    if (depth <= 0) return { win: false, exact: false };
    const k = this.key(st);
    const hit = this.tt.get(k);
    if (hit && (hit.exact || hit.depth >= depth)) return hit;
    const attacking = st.toMove === this.pz.attacker;
    const moves = candidates(this.pz, st, this.keyIdx);
    let exact = true;
    let result = !attacking; // attacker: assume loss until a win; defender: assume attacker wins
    const list = moves.map((m) => m.next);
    const pass = play(this.pz, st, PASS);
    list.push(pass);
    for (const next of list) {
      const r = this.run(next, depth - 1);
      if (!r.exact) exact = false;
      if (attacking && r.win) {
        result = true;
        exact = r.exact;
        break;
      }
      if (!attacking && !r.win) {
        result = false;
        exact = r.exact;
        break;
      }
    }
    const out = { win: result, exact, depth };
    this.tt.set(k, out);
    return out;
  }
}

/** Does the attacker win from `st` (with st.toMove to play)? */
export function attackerWins(pz, st, budget) {
  const s = new Search(pz, budget);
  const r = s.run(st, pz.maxDepth);
  return { win: r.win, exact: r.exact && !s.exhausted, nodes: s.nodes };
}

function userWins(pz, st, budget) {
  const r = attackerWins(pz, st, budget);
  const attackGoal = pz.userColor === pz.attacker;
  return { win: attackGoal ? r.win : !r.win, nodes: r.nodes, exact: r.exact };
}

export function indexOf(pz, x, y) {
  return y * pz.size + x;
}

export function pointOf(pz, i) {
  return { x: i % pz.size, y: (i / pz.size) | 0 };
}

/**
 * Every correct first move for the learner, plus the work it took to prove
 * them. A problem is valid when the list is non-empty and every move outside
 * the list loses.
 */
export function solveFirstMoves(pz, budget = 600000) {
  const st = initialState(pz);
  const keyIdx = keyIndices(pz);
  const moves = candidates(pz, st, keyIdx);
  const correct = [];
  let nodes = 0;
  let exact = true;
  for (const m of moves) {
    const r = userWins(pz, m.next, budget);
    nodes += r.nodes;
    if (!r.exact) exact = false;
    if (r.win) correct.push(m.i);
  }
  return { correct: correct.map((i) => pointOf(pz, i)), tried: moves.length, nodes, exact };
}

/**
 * The computer's reply for the side that is not the learner. A winning reply
 * if one exists (the learner made a mistake); otherwise the reply that makes
 * the learner work hardest.
 */
export function reply(pz, st) {
  const keyIdx = keyIndices(pz);
  if (terminal(pz, st, keyIdx)) return null;
  const moves = candidates(pz, st, keyIdx);
  let best = null;
  let bestCost = -1;
  for (const m of moves) {
    const r = userWins(pz, m.next);
    if (!r.win) return { ...pointOf(pz, m.i), refutes: true };
    if (r.nodes > bestCost) {
      bestCost = r.nodes;
      best = m.i;
    }
  }
  if (best === null) return { pass: true, refutes: false };
  return { ...pointOf(pz, best), refutes: false };
}

/**
 * Where the learner stands after a move, with the learner to play again:
 *   "won"   the goal is reached, or reached even if the learner passes now
 *   "lost"  no move wins any more
 *   "open"  keep going
 */
export function status(pz, st) {
  const keyIdx = keyIndices(pz);
  const term = terminal(pz, st, keyIdx);
  const attackGoal = pz.userColor === pz.attacker;
  if (term) return (term > 0) === attackGoal ? "won" : "lost";
  // Settled: the learner wins even if the opponent moves next.
  const tenuki = { ...st, toMove: -pz.userColor, ko: -1, passes: 0 };
  if (userWins(pz, tenuki).win) return "won";
  if (st.toMove === pz.userColor && !userWins(pz, st).win) return "lost";
  return "open";
}

/** A best line for the learner from the start, for "show answer". */
export function solutionLine(pz, limit = 24) {
  let st = initialState(pz);
  const line = [];
  const keyIdx = keyIndices(pz);
  for (let n = 0; n < limit; n++) {
    if (st.toMove === pz.userColor) {
      if (n > 0 && status(pz, st) === "won") break;
      const moves = candidates(pz, st, keyIdx);
      let pick = null;
      let fastest = Infinity;
      for (const m of moves) {
        const r = userWins(pz, m.next);
        if (r.win && r.nodes < fastest) {
          fastest = r.nodes;
          pick = m;
        }
      }
      if (!pick) break;
      line.push({ ...pointOf(pz, pick.i), c: st.toMove });
      st = pick.next;
      if (terminal(pz, st, keyIdx)) break;
    } else {
      const r = reply(pz, st);
      if (!r || r.pass) break;
      const next = play(pz, st, indexOf(pz, r.x, r.y));
      if (!next) break;
      line.push({ x: r.x, y: r.y, c: st.toMove });
      st = next;
    }
  }
  return line;
}

/**
 * Solver-measured difficulty: how many moves the learner must find, how
 * large the proof is, and how many tempting first moves fail. Returns a
 * score and a 1–5 grade; the grades are calibrated in the test suite.
 */
export function difficulty(pz) {
  const first = solveFirstMoves(pz);
  const line = solutionLine(pz);
  const userMoves = line.filter((m) => m.c === pz.userColor).length;
  const wrong = Math.max(0, first.tried - first.correct.length);
  const score = userMoves * 1.1 + Math.log2(1 + first.nodes) * 0.6 + Math.log2(1 + wrong) * 0.5 - (first.correct.length - 1) * 0.8;
  let grade = 1;
  if (score >= 6) grade = 2;
  if (score >= 9) grade = 3;
  if (score >= 12) grade = 4;
  if (score >= 15) grade = 5;
  return { score: Math.round(score * 10) / 10, grade, userMoves, correct: first.correct, nodes: first.nodes, exact: first.exact, line };
}

export { PASS };
