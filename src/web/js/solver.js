/**
 * Life-and-death and capturing solver.
 *
 * Every practice problem in Goban Studio is checked by this module, in the
 * test suite and live in the app. A problem is a small position plus a goal
 * (capture, save, kill, live). The solver searches every reply inside the
 * problem's area, so:
 *
 *   - the test suite can prove each problem has a correct answer, list every
 *     correct first move, and measure how hard the problem is;
 *   - the app can answer *any* move the learner tries: a wrong move gets the
 *     real refutation, a right move gets the most stubborn defence.
 *
 * Search: depth-first alpha-beta over a boolean result (does the attacker
 * win?) with iterative deepening, a transposition table shared by every
 * search on one puzzle, and a node budget. A result reached through the depth
 * or node limit is marked inexact; the test suite rejects any problem whose
 * proof is inexact. Every search terminates: each line is bounded by the
 * depth limit, and within it by the finite problem area plus superko.
 *
 * Rules: captures, no suicide, simple ko, and positional superko inside the
 * line being read (a move may not recreate a board position already on the
 * current search path), so repeated ko captures can never loop.
 *
 * Ko results. A ko is resolved by assuming one side, the "ko master", has
 * enough ko threats: the ko master may retake a ko at once (the threat and
 * its answer are played elsewhere), the other side must wait a move as the
 * ko rule says. Such a retake is the only move exempt from the superko test,
 * and since the other side's next capture must create a new position, the
 * search still cannot cycle. Every question is asked against the learner:
 * by default the opponent is ko master, so a learner's "win" is an
 * unconditional win. A problem with `ko: "ok"` makes the learner ko master,
 * so getting a ko (the best result in a "make ko" problem) counts as solved.
 * `outcome()` tells the two apart ("win" / "ko" / "loss"), and `validate()`
 * proves that a `ko: "ok"` problem really is a ko: the learner can force a ko
 * but cannot win unconditionally.
 *
 * Termination for life and death (kill / live). The board outside the
 * region is fixed; a group lives when Benson's algorithm finds it
 * unconditionally alive, dies when a key stone is captured, and two passes in
 * a row leave it alive (seki counts as life). The region is finite, the
 * superko rule forbids repeating a position, and the depth limit backs it up.
 *
 * Termination for capturing races on an open board (capture / save), with
 * E = `escape` (default 4): the key stones are captured when any of them is
 * taken off the board, and they escape when every key chain has E
 * liberties. E = 3 cannot express nets: after a loose net the stones push out
 * to 3 liberties before they are caught. E = 4 can, and three bounded rules
 * (for E >= 4) keep it cheap to read and make "escape" mean "no forcing
 * sequence captures them" rather than a raw liberty count:
 *
 *   1. Liberty pressure. With E - 1 liberties and the attacker to move, the
 *      attacker may only play forcing moves: fill a liberty of the key chain
 *      or save its own stones in atari next to it. A quiet move there gives
 *      the defender a free move toward E liberties, so it is not a forcing
 *      capture; with E - 2 liberties or fewer, the points next to the
 *      liberties are tried as well (nets, loose ladders, throw-ins).
 *   2. Bounded pushes. Each time the attacker faces a chain with E - 1
 *      liberties counts as a push; after `pushes` (default 2) of them the
 *      chain has escaped, and a net may only be cast before the first push.
 *      This is the radius of the attacker's forcing sequence: a geta that
 *      answers each push with a block works, an open-ended chase does not.
 *   3. Bounded area. Moves are only read inside the problem's diagram. A
 *      liberty outside the diagram still counts, but nobody may fill it, so
 *      a group that runs out of the diagram has escaped.
 *
 * So a net works exactly when the attacker can answer every push with a
 * block until the stones run out of liberties; a ladder is the special case
 * where the defender never gets past 2. Rule 3 makes the diagram part of the
 * problem: a diagram must show the stones (ladder breakers, edges) that
 * decide the chase. The capture problems added with these rules were also
 * re-proved with their diagrams padded by four lines of open board, with the
 * same answers. Problems about racing to 3 liberties (the beginner
 * course and a few beginner problems) set `escape: 3`, which turns rules 1–2
 * off and keeps the old semantics.
 */

export const BLACK = 1;
export const WHITE = -1;

const PASS = -1;
const DEFAULT_ESCAPE = 4;
const DEFAULT_PUSHES = 2;

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
 *   goal: "capture" | "save" | "kill" | "live",
 *   ko: "ok" (a ko is an acceptable result for the learner),
 *   escape = 4 (liberties that count as escaped, capture/save only), maxDepth
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
  if (problem.ko !== undefined && problem.ko !== "ok") throw new Error(`unknown ko option ${problem.ko}`);
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
    koOk: problem.ko === "ok",
    box: { x0, y0, x1: x0 + d.w - 1, y1: y0 + d.h - 1 },
    escape: problem.escape || DEFAULT_ESCAPE,
    pushes: problem.pushes ?? DEFAULT_PUSHES,
    maxDepth: problem.maxDepth || (lifeGoal ? Math.min(40, (region?.length || 10) * 2 + 8) : (problem.escape || DEFAULT_ESCAPE) >= 4 ? 60 : 30),
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
  return { board, toMove: pz.toMove, ko: -1, passes: 0, h1: h1 >>> 0, h2: h2 >>> 0 };
}

/**
 * Play at index i (or PASS). Returns a new state or null when illegal.
 * `ignoreKo` lets the ko master retake a ko at once (search only).
 */
export function play(pz, st, i, ignoreKo = false) {
  const c = context(pz.size);
  const color = st.toMove;
  if (i === PASS) return { board: st.board, toMove: -color, ko: -1, passes: st.passes + 1, h1: st.h1, h2: st.h2, last: PASS };
  if (st.board[i] !== 0 || (i === st.ko && !ignoreKo)) return null;
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
  return { board, toMove: -color, ko, passes: 0, h1: h1 >>> 0, h2: h2 >>> 0, last: i, captured };
}

/** A board-only position key (positional superko). */
function posKey(st) {
  return (st.h1 & 0x1fffff) * 4294967296 + st.h2;
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
  if (!pz._keyIdx) pz._keyIdx = pz.keys.map((k) => k.y * pz.size + k.x);
  return pz._keyIdx;
}

/**
 * The key chains at a glance: whether a key stone is gone, the fewest
 * liberties among the key chains, all their liberties, and the attacker
 * chains touching them.
 */
function keyInfo(pz, board, keyIdx) {
  const c = context(pz.size);
  const libs = new Set();
  // liberty -> fewest liberties of a key chain it belongs to
  const libMin = new Map();
  const chains = [];
  const enemies = [];
  let minLibs = Infinity;
  let libSum = 0;
  const seenStone = new Set();
  const seenEnemy = new Set();
  for (const k of keyIdx) {
    if (board[k] !== pz.keyColor) return { captured: true, minLibs: 0, libs, enemies, libSum: 0 };
    if (seenStone.has(k)) continue;
    const ch = chain(c, board, k);
    chains.push(ch);
    minLibs = Math.min(minLibs, ch.libs.length);
    libSum += ch.libs.length;
    for (const l of ch.libs) {
      libs.add(l);
      libMin.set(l, Math.min(libMin.get(l) ?? Infinity, ch.libs.length));
    }
    for (const s of ch.stones) seenStone.add(s);
    for (const s of ch.stones) {
      for (const q of c.nbr[s]) {
        if (board[q] !== pz.attacker || seenEnemy.has(q)) continue;
        const ec = chain(c, board, q);
        for (const p of ec.stones) seenEnemy.add(p);
        enemies.push(ec);
      }
    }
  }
  return { captured: false, minLibs, libs, libMin, chains, enemies, libSum };
}

/** Fewest liberties among the key chains (0 when a key stone is gone). */
function keyLiberties(pz, board, keyIdx) {
  return keyInfo(pz, board, keyIdx).minLibs;
}

/** +1: attacker has won, -1: defender has won, 0: undecided. */
function terminal(pz, st, keyIdx, info = null) {
  for (const i of keyIdx) if (st.board[i] !== pz.keyColor) return 1;
  if (st.passes >= 2) return -1;
  if (pz.lifeGoal) {
    if (bensonAlive(pz, st.board, pz.keyColor, keyIdx)) return -1;
  } else if ((info || keyInfo(pz, st.board, keyIdx)).minLibs >= pz.escape) return -1;
  return 0;
}

function regionSet(pz) {
  if (!pz._region && pz.region) pz._region = pz.region.map((p) => p.y * pz.size + p.x);
  return pz._region;
}

function inBox(pz, i) {
  const x = i % pz.size;
  const y = (i / pz.size) | 0;
  const b = pz.box;
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

/** The points worth trying for the side to move (see the file header). */
function candidatePoints(pz, st, info, pushes) {
  const c = context(pz.size);
  const board = st.board;
  const region = regionSet(pz);
  const set = new Set();
  if (region) {
    for (const i of region) if (board[i] === 0) set.add(i);
    return set;
  }
  const attacking = st.toMove === pz.attacker;
  const minLibs = info.minLibs;
  // Liberty pressure: with E - 1 liberties the attacker must force.
  const pressure = pz.escape >= 4 && minLibs >= pz.escape - 1;
  // In atari there is nothing to do but capture or run; nets are cast
  // before the stones first gain room (pushes === 0).
  const wide = !pressure && minLibs >= 2 && (!attacking || pushes === 0);
  for (const l of info.libs) {
    set.add(l);
    if (wide) for (const q of c.nbr[l]) if (board[q] === 0) set.add(q);
  }
  for (const ec of info.enemies) {
    if (ec.libs.length === 1 || (ec.libs.length === 2 && !(attacking && pressure))) for (const l of ec.libs) set.add(l);
  }
  for (const i of set) if (!inBox(pz, i)) set.delete(i);
  return set;
}

/**
 * Candidate moves for the side to move, best guesses first. `master` is the
 * ko master, who may also retake a ko at once.
 */
function candidates(pz, st, keyIdx, master = 0, pushes = 0) {
  const attacking = st.toMove === pz.attacker;
  const info = keyInfo(pz, st.board, keyIdx);
  const moves = [];
  for (const i of candidatePoints(pz, st, info, pushes)) {
    let next = play(pz, st, i);
    let retake = false;
    if (!next && i === st.ko && st.toMove === master) {
      next = play(pz, st, i, true);
      retake = !!next;
    }
    if (!next) continue;
    moves.push({ i, next, retake, score: moveScore(pz, next, i, attacking, keyIdx) });
  }
  moves.sort((a, b) => b.score - a.score);
  return moves;
}

/** Shape score of a played move: liberties for the defender, pressure for the attacker. */
function moveScore(pz, next, i, attacking, keyIdx) {
  const c = context(pz.size);
  const info = keyInfo(pz, next.board, keyIdx);
  if (info.captured) return attacking ? 1000 : -1000;
  const own = chain(c, next.board, i);
  // A defender stone that joins the key chain is a natural extension.
  const joins = !attacking && keyIdx.some((k) => own.stones.includes(k)) ? 2 : 0;
  return (attacking ? -info.libSum * 3 : info.libSum * 3) + own.libs.length + (next.captured || 0) * 4 + joins;
}

/** The same ordering estimated before playing, for the search. */
function quickScore(pz, st, i, info, attacking) {
  const c = context(pz.size);
  const board = st.board;
  let empties = 0;
  let fresh = 0;
  for (const q of c.nbr[i]) {
    if (board[q] === 0) {
      empties++;
      if (!info.libs.has(q)) fresh++;
    }
  }
  const onLib = info.libs.has(i);
  if (attacking) {
    // Capture first, then atari, then other liberty fills.
    const n = onLib ? info.libMin.get(i) : 0;
    if (n === 1) return 1000;
    return (onLib ? 3 + (n === 2 ? 3 : 0) : 0) + empties;
  }
  let captures = 0;
  for (const ec of info.enemies) if (ec.libs.length === 1 && ec.libs[0] === i) captures += ec.stones.length;
  let score = (onLib ? 3 * (fresh - 1) : 0) + empties + captures * 7;
  // Joining two key chains into one is usually the way out.
  if (onLib && info.chains.length > 1 && info.chains.filter((ch) => ch.libs.includes(i)).length > 1) score += 20;
  return score;
}

class Search {
  constructor(pz, master, budget = 150000) {
    this.pz = pz;
    this.master = master;
    this.keyIdx = keyIndices(pz);
    // One table per ko master, shared by every search on this puzzle:
    // positions repeat across first-move checks, replies and status checks.
    if (!pz._tt) pz._tt = {};
    let tt = pz._tt[master];
    if (!tt || tt.size > 1500000) tt = pz._tt[master] = new Map();
    this.tt = tt;
    this.path = new Map();
    this.nodes = 0;
    this.budget = budget;
    this.exhausted = false;
  }

  key(st) {
    return `${st.h1},${st.h2},${st.toMove},${st.ko},${st.passes}`;
  }

  /** Returns { win: attacker wins, exact } */
  run(st, depth, pushes = 0) {
    this.nodes++;
    if (this.nodes > this.budget) {
      this.exhausted = true;
      return { win: false, exact: false };
    }
    const pz = this.pz;
    const info = keyInfo(pz, st.board, this.keyIdx);
    if (info.captured) return { win: true, exact: true };
    const term = terminal(pz, st, this.keyIdx, info);
    if (term) return { win: term > 0, exact: true };
    const attacking = st.toMove === pz.attacker;
    if (!pz.lifeGoal && attacking && pz.escape >= 4 && info.minLibs === pz.escape - 1) {
      // Liberty pressure, part 3: a chain that keeps regaining E - 1
      // liberties is not being captured by a forcing sequence.
      if (++pushes > pz.pushes) return { win: false, exact: true };
    }
    if (depth <= 0) return { win: false, exact: false };
    const k = this.key(st);
    const hit = this.tt.get(k);
    // A win with fewer pushes left is a win with more; a loss the other way.
    if (hit && (hit.exact || hit.depth >= depth) && (hit.win ? hit.pushes >= pushes : hit.pushes <= pushes)) return hit;
    const order = [];
    for (const i of candidatePoints(pz, st, info, pushes)) order.push({ i, s: quickScore(pz, st, i, info, attacking) });
    order.sort((a, b) => b.s - a.s);
    order.push({ i: PASS });
    const pk = posKey(st);
    this.path.set(pk, (this.path.get(pk) || 0) + 1);
    let exact = true;
    let result = !attacking; // attacker: assume loss until a win; defender: assume attacker wins
    for (const { i } of order) {
      let next = play(pz, st, i);
      let retake = false;
      if (!next && i === st.ko && st.toMove === this.master) {
        next = play(pz, st, i, true);
        retake = !!next;
      }
      if (!next) continue;
      // Superko inside the line; the ko master's retake stands for a threat
      // exchange played elsewhere, so it is not a repetition.
      if (i !== PASS && !retake && this.path.has(posKey(next))) continue;
      const r = this.run(next, depth - 1, pushes);
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
    const left = this.path.get(pk) - 1;
    if (left) this.path.set(pk, left);
    else this.path.delete(pk);
    const out = { win: result, exact, depth, pushes };
    this.tt.set(k, out);
    return out;
  }
}

/**
 * Does the attacker win from `st` (with st.toMove to play)? `master` is the
 * ko master; by default the side the learner is playing against.
 */
export function attackerWins(pz, st, budget, master = -pz.userColor) {
  const s = new Search(pz, master, budget);
  // Iterative deepening: short wins (most of them) are found before the
  // search wanders down a long line; shallow results stay in the table.
  let r;
  for (let depth = Math.min(6, pz.maxDepth); ; depth = Math.min(pz.maxDepth, depth * 2)) {
    r = s.run(st, depth);
    if (r.win || r.exact || s.exhausted || depth >= pz.maxDepth) break;
  }
  return { win: r.win, exact: r.exact && !s.exhausted, nodes: s.nodes };
}

/** Learner's result; `koOk` true makes the learner ko master. */
function userWins(pz, st, budget, koOk = pz.koOk) {
  const master = koOk ? pz.userColor : -pz.userColor;
  const r = attackerWins(pz, st, budget, master);
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
 * The learner's result from `st` with best play: "win" (unconditional),
 * "ko" (the learner gets a ko, i.e. wins only with enough ko threats) or
 * "loss". Independent of the problem's `ko` option.
 */
export function outcome(pz, st) {
  if (userWins(pz, st, undefined, false).win) return "win";
  if (userWins(pz, st, undefined, true).win) return "ko";
  return "loss";
}

/**
 * The computer's reply for the side that is not the learner. A winning reply
 * if one exists (the learner made a mistake); otherwise the reply that makes
 * the learner work hardest. `{ pass: true, refutes: true, ko: true }` means
 * the learner's move only leads to a ko the problem does not accept: the
 * refutation is to retake after a ko threat, which a problem board cannot
 * show.
 */
export function reply(pz, st) {
  const keyIdx = keyIndices(pz);
  if (terminal(pz, st, keyIdx)) return null;
  const moves = candidates(pz, st, keyIdx);
  for (const m of moves) {
    const r = userWins(pz, m.next);
    if (!r.win) return { ...pointOf(pz, m.i), refutes: true };
  }
  // A lost side plays the move a person would: the best shape, which for
  // the stones under attack means the most liberties (extend, connect,
  // capture), so an answer line reads like a teacher's.
  let best = moves.length ? moves[0].i : null;
  // In a ko problem the opponent fights the ko rather than lose outright.
  if (pz.koOk) {
    const fight = moves.find((m) => !userWins(pz, m.next, undefined, false).win);
    if (fight) best = fight.i;
  }
  if (!userWins(pz, st).win) return { pass: true, refutes: true, ko: st.ko >= 0 };
  if (best === null) return { pass: true, refutes: false };
  return { ...pointOf(pz, best), refutes: false };
}

/**
 * Where the learner stands:
 *   "won"   the goal is reached, or (learner to move) it is reached even if
 *           the learner passes now
 *   "lost"  no move wins any more
 *   "open"  keep going
 * Called with the opponent to move (right after a learner's move), only a
 * finished goal counts as "won": the opponent always gets to answer, so a
 * right move is met by the most stubborn defence before the problem ends.
 */
export function status(pz, st) {
  const keyIdx = keyIndices(pz);
  const term = terminal(pz, st, keyIdx);
  const attackGoal = pz.userColor === pz.attacker;
  if (term) return (term > 0) === attackGoal ? "won" : "lost";
  // A ko problem is solved once the ko is on the board and the learner, with
  // the threats, wins it: the fight itself is played with ko threats
  // elsewhere, which a problem board does not show.
  if (pz.koOk && st.ko >= 0 && userWins(pz, st).win) return "won";
  if (st.toMove !== pz.userColor) return userWins(pz, st).win ? "open" : "lost";
  // Settled: the learner wins even if the opponent moves next.
  const tenuki = { ...st, toMove: -pz.userColor, ko: -1, passes: 0 };
  if (userWins(pz, tenuki).win) return "won";
  if (!userWins(pz, st).win) return "lost";
  return "open";
}

/** A best line for the learner from the start, for "show answer". */
export function solutionLine(pz, limit = 24) {
  let st = initialState(pz);
  const line = [];
  const keyIdx = keyIndices(pz);
  let sawKo = false;
  for (let n = 0; n < limit; n++) {
    if (st.toMove === pz.userColor) {
      // A capture is shown through to the capture itself; other goals stop
      // once they are settled.
      // A ko problem's line goes on until the ko is on the board.
      if (n > 0 && pz.goal !== "capture" && (!pz.koOk || sawKo) && status(pz, st) === "won") break;
      const moves = candidates(pz, st, keyIdx);
      let pick = null;
      let fastest = Infinity;
      for (const m of moves) {
        const r = userWins(pz, m.next);
        if (r.win && terminal(pz, m.next, keyIdx)) {
          pick = m;
          break;
        }
        if (r.win && r.nodes < fastest) {
          fastest = r.nodes;
          pick = m;
        }
      }
      if (!pick) break;
      line.push({ ...pointOf(pz, pick.i), c: st.toMove });
      st = pick.next;
      if (st.ko >= 0) sawKo = true;
      if (terminal(pz, st, keyIdx)) break;
    } else {
      const r = reply(pz, st);
      if (!r || r.pass) break;
      const next = play(pz, st, indexOf(pz, r.x, r.y));
      if (!next) break;
      line.push({ x: r.x, y: r.y, c: st.toMove });
      st = next;
      if (st.ko >= 0) sawKo = true;
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

/** True when every chain on the board has at least one liberty. */
function everyChainBreathes(pz, board) {
  const c = context(pz.size);
  for (let i = 0; i < board.length; i++) if (board[i] && !chain(c, board, i).libs.length) return false;
  return true;
}

/**
 * Prove a puzzle is a fair problem. Returns { ok, reasons, result, first,
 * line }: `reasons` lists every defect found, `result` is "win" or "ko" (the
 * learner's best result from the start). A problem is fair when every chain
 * breathes, the start is not already decided, the first-move search is
 * exact with one to `maxCorrect` correct moves, a `ko: "ok"` problem really
 * is a ko (no unconditional answer exists, a ko does), and the solution line
 * is legal and ends in a won position.
 */
export function validate(pz, { maxCorrect = 3, first = null, line = null } = {}) {
  const reasons = [];
  const st0 = initialState(pz);
  if (!everyChainBreathes(pz, st0.board)) reasons.push("a chain in the diagram has no liberties");
  const start = status(pz, st0);
  if (start !== "open") reasons.push(`starting position is already ${start}`);
  first = first || solveFirstMoves(pz);
  if (!first.exact) reasons.push("the first-move search is not exact (depth or node budget)");
  if (first.correct.length < 1) reasons.push("no correct first move");
  if (first.correct.length > maxCorrect) reasons.push(`${first.correct.length} correct first moves (max ${maxCorrect})`);
  let result = pz.koOk ? "ko" : "win";
  if (pz.koOk) {
    const uncond = userWins(pz, st0, 600000, false);
    if (!uncond.exact) reasons.push("the unconditional search is not exact");
    if (uncond.win) {
      result = "win";
      reasons.push('ko: "ok" but the learner can win without a ko');
    }
  }
  line = line || solutionLine(pz);
  let st = st0;
  let legal = true;
  for (const m of line) {
    const next = st.toMove === m.c ? play(pz, st, indexOf(pz, m.x, m.y)) : null;
    if (!next) {
      legal = false;
      break;
    }
    st = next;
  }
  if (!legal) reasons.push("the solution line contains an illegal move");
  else {
    // The opponent had no move worth playing: the learner is on move again.
    if (st.toMove !== pz.userColor && !terminal(pz, st, keyIndices(pz))) st = play(pz, st, PASS);
    if (status(pz, st) !== "won") reasons.push("the solution line does not end in a win");
  }
  return { ok: !reasons.length, reasons, result, first, line };
}

export { PASS };

/** The learner's winning moves from `st` (learner to move). For hints. */
export function winningMoves(pz, st) {
  const keyIdx = keyIndices(pz);
  const out = [];
  for (const m of candidates(pz, st, keyIdx)) {
    if (userWins(pz, m.next).win) out.push(pointOf(pz, m.i));
  }
  return out;
}

/** Board as rows of signs, for the renderer. */
export function signMap(pz, st) {
  const rows = [];
  for (let y = 0; y < pz.size; y++) rows.push(Array.from(st.board.subarray(y * pz.size, (y + 1) * pz.size)));
  return rows;
}
