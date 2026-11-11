/**
 * Life-and-death and capturing solver.
 *
 * Every practice problem in Goban Studio is checked by this module, in the
 * test suite and live in the app. A problem is a small position plus a goal
 * (capture, save, kill, live). Endgame problems (v6, goal "endgame") are
 * counted instead: see the counting section at the end of this file. The solver searches every reply inside the
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
 * Termination for life and death (kill / live / seki). The board outside the
 * region is fixed; a group lives when Benson's algorithm finds it
 * unconditionally alive, dies when a key stone is captured, and two passes in
 * a row leave it alive (seki counts as life, as under Japanese rules: a kill
 * that only reaches seki is a failure). The region is finite, the superko
 * rule forbids repeating a position, and the depth limit backs it up. Points
 * of captured stones are part of the region (real-board rules, `replay`).
 * Points outside the region (',') are never played, so a chain with a
 * liberty there can never be captured: key stones that join such a chain
 * have survived (in a race, by capturing the stones inside their wall and
 * joining it). The problem checks make sure no life or kill problem lets
 * its key stones reach such a liberty in the first place (outsideReach()),
 * so this rule only ends a race that is already won, and stops the search
 * reading on inside the captured space after it.
 *
 * Seki. A "strict" search changes one rule: two passes in a row are a win
 * for the attacker, so the defender must reach Benson life (or, in a race on
 * an open board, the escape count) by force. A group that survives the
 * ordinary search but not the strict one lives only because neither side can
 * make progress: that is seki, provided the stalemate is real. `sekiInfo()`
 * calls a position seki when all of these hold:
 *
 *   1. the attacker, moving first, cannot capture a key stone (every ko is
 *      counted against the defender);
 *   2. the defender, moving first, cannot reach independent life (strict
 *      search, every ko against the defender);
 *   3. nothing the key stones can reach (over empty points, their own
 *      stones and attacker chains that could be captured) breathes through
 *      a point nobody may play (outside the region, or outside the diagram
 *      for a problem without one): such stones can never be captured, so
 *      the key stones might survive only by fiat. This is conservative: a
 *      race between two groups that each lean on the other side's wall is
 *      not called seki, since the defender's wall is in reach;
 *   4. at least one key liberty is shared with an attacker chain whose own
 *      liberties are all playable: the stones the defender lives alongside
 *      are part of the fight, not the fixed wall outside it.
 *
 * Under 1 and 2, no shared liberty can be filled to advantage: filling it is
 * self-atari, or lets the other side capture, or changes nothing. A problem
 * with `goal: "seki"` is a "live" problem whose best result is seki:
 * `validate()` proves the defender survives, cannot live independently from
 * the start, and that the answer line ends in a position `sekiInfo()` calls
 * seki. Every ko counts against the learner, so bent four in the corner
 * (dead under Japanese rules) is never accepted as life or seki.
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
/** Every problem goal; "seki" is a defence goal (see createPuzzle). */
export const GOALS = ["capture", "save", "kill", "live", "seki", "endgame"];
const DEFAULT_ESCAPE = 4;
const DEFAULT_PUSHES = 2;

/* ------------------------------------------------------------------ parse */

/**
 * Diagram notation, one string per row (spaces are ignored):
 *   X / O   black / white stone
 *   x / o   black / white key stone (the stones the goal is about)
 *   .       empty point inside the problem region
 *   ,       empty point outside the region (play there is a tenuki)
 *   :       (endgame problems only) empty point counted at the end but not
 *           played: the inside of a territory
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
  const counted = [];
  let hasOutside = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x] ?? ",";
      if (ch === "X" || ch === "x") stones.push({ x, y, c: BLACK });
      else if (ch === "O" || ch === "o") stones.push({ x, y, c: WHITE });
      if (ch === "x" || ch === "o") keys.push({ x, y });
      if (ch === ".") region.push({ x, y });
      if (ch === ",") hasOutside = true;
      if (ch === ":") counted.push({ x, y });
      if (!"XOxo.,:".includes(ch)) throw new Error(`bad diagram character '${ch}'`);
    }
  }
  return { w, h, stones, keys, region, counted, hasOutside };
}

/**
 * Normalise a problem description into a puzzle the solver can run.
 *
 * problem = {
 *   diagram: [...rows], size = 19, corner = "tl" | "tr" | "bl" | "br",
 *   at: [x0, y0] (overrides corner), toMove = 1 | -1,
 *   goal: "capture" | "save" | "kill" | "live" | "seki",
 *   ko: "ok" (a ko is an acceptable result for the learner),
 *   escape = 4 (liberties that count as escaped, capture/save only), maxDepth,
 *   replay = true (captured points may be played again)
 * }
 *
 * `replay`: a problem's region is its '.' points. With `replay` (the
 * default) the points of the diagram's stones join it once they are
 * captured, as on a real board (throw back in, retake, fill an eye).
 * `replay: false` keeps the pre-v4 model, where a captured point stays out
 * of play; it exists only for experiments, and the problem and course checks
 * reject it, because an answer that needs a captured point to stay empty can
 * be refuted on a real board (see docs/problems-audit.md).
 *
 * Goals: "capture" / "save" are about the key stones on an open board,
 * "kill" / "live" about a group inside a region. "seki" is a defence goal
 * like "live" (the learner owns the key stones and moves first; a region is
 * required) whose best result is seki: the key stones survive, but no
 * defence gives them independent life. Survival is what the learner must
 * achieve; validate() also proves that independent life is out of reach and
 * that the answer ends in a real seki (see sekiInfo()). A "live" problem
 * still accepts seki as survival, and a "kill" that only reaches seki fails.
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
  if (problem.goal === "endgame") return countingPuzzle(problem, { size, d, x0, y0, stones, keys, shift });
  if (d.counted.length) throw new Error("':' (counted, not played) is for endgame problems only");
  if (!keys.length) throw new Error("a problem needs at least one key stone");
  const keyColor = stones.find((s) => s.x === keys[0].x && s.y === keys[0].y).c;
  for (const k of keys) {
    const s = stones.find((st) => st.x === k.x && st.y === k.y);
    if (!s || s.c !== keyColor) throw new Error("key stones must share one colour");
  }
  const goal = problem.goal;
  if (!GOALS.includes(goal)) throw new Error(`unknown goal ${goal}`);
  if (problem.ko !== undefined && problem.ko !== "ok") throw new Error(`unknown ko option ${problem.ko}`);
  const attackGoal = goal === "capture" || goal === "kill";
  const toMove = problem.toMove ?? (attackGoal ? -keyColor : keyColor);
  const userColor = toMove;
  if (attackGoal && userColor !== -keyColor) throw new Error("the attacker must move first in an attack problem");
  if (!attackGoal && userColor !== keyColor) throw new Error("the defender must move first in a defence problem");
  const lifeGoal = goal === "kill" || goal === "live" || goal === "seki";
  const replay = problem.replay ?? true;
  let region = null;
  if (lifeGoal || d.hasOutside) {
    region = d.region.map(shift);
    // Empty points inside the diagram are region unless marked ','.
  }
  if (lifeGoal && (!region || !region.length)) throw new Error("kill/live/seki problems need a region");
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
    sekiGoal: goal === "seki",
    replay,
    region,
    koOk: problem.ko === "ok",
    box: { x0, y0, x1: x0 + d.w - 1, y1: y0 + d.h - 1 },
    escape: problem.escape || DEFAULT_ESCAPE,
    pushes: problem.pushes ?? DEFAULT_PUSHES,
    maxDepth: problem.maxDepth || (lifeGoal ? lifeDepth(region?.length || 10, replay ? innerStones(problem.diagram) : 0, replay) : (problem.escape || DEFAULT_ESCAPE) >= 4 ? 60 : 30),
    view,
  };
}

/**
 * An endgame (counting) puzzle; see the counting section at the end. Black
 * is the learner and moves first; there are no key stones.
 */
function countingPuzzle(problem, { size, d, x0, y0, stones, keys, shift }) {
  if (keys.length) throw new Error("an endgame problem has no key stones");
  if (!d.hasOutside) throw new Error("an endgame problem needs a sealed region (',' outside it)");
  if (problem.toMove !== undefined && problem.toMove !== BLACK) throw new Error("Black moves first in an endgame problem");
  if (!["move", "value"].includes(problem.ask)) throw new Error(`unknown ask ${problem.ask}`);
  return {
    id: problem.id,
    size,
    stones,
    keys: [],
    keyColor: 0,
    attacker: 0,
    userColor: BLACK,
    toMove: BLACK,
    goal: "endgame",
    counting: true,
    ask: problem.ask,
    answer: problem.answer,
    margin: problem.margin,
    value: problem.value,
    choices: problem.choices,
    lifeGoal: false,
    sekiGoal: false,
    replay: true,
    region: d.region.map(shift),
    counted: d.counted.map(shift),
    koOk: false,
    box: { x0, y0, x1: x0 + d.w - 1, y1: y0 + d.h - 1 },
    maxDepth: 0,
    view: viewFor(size, x0, y0, d.w, d.h),
  };
}

/**
 * Depth limit for life and death: twice the points in play plus a margin.
 * With `replay` the stones that do not touch the outside (',') can be
 * captured and their points played again, so they count as points in play.
 */
function lifeDepth(regionSize, inner, replay) {
  return Math.min(replay ? 60 : 40, (regionSize + inner) * 2 + 8);
}

/** Stones in a diagram with no ',' next to them (the ones inside the fight). */
function innerStones(rows) {
  const grid = rows.map((r) => r.replace(/\s+/g, "").split(""));
  let n = 0;
  grid.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (!"XOxo".includes(ch)) return;
      const nb = [grid[y - 1]?.[x], grid[y + 1]?.[x], row[x - 1], row[x + 1]];
      if (!nb.includes(",")) n++;
    }),
  );
  return n;
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
  // hist: the start is the first position of the real line (withHistory).
  return { board, toMove: pz.toMove, ko: -1, passes: 0, h1: h1 >>> 0, h2: h2 >>> 0, hist: [] };
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

/**
 * v13: the positions already played on a real line (a solution line, a
 * learner's attempt) before `st`, as posKeys. A search started from a
 * position on such a line treats them as part of its path, so positional
 * superko forbids recreating them exactly as it would in the game; without
 * them a fresh search could answer with a recapture the line has already
 * made illegal (seki-01). Only line-level states carry it; the search's
 * own states do not (the search keeps its own path).
 */
function withHistory(prev, next) {
  if (!next || next === prev) return next;
  next.hist = (prev.hist || []).concat(posKey(prev));
  return next;
}

/** True when `next` recreates a position already played on its line. */
function repeatsLine(next) {
  return !!(next && next.hist && next.hist.includes(posKey(next)));
}

/* -------------------------------------------------------------- analysis */

/**
 * Benson's unconditional life for the chains of `color` touching `keys`.
 *
 * Every stone lies inside the diagram, so only the diagram plus a margin of
 * two lines is scanned: a region that reaches the second line outside the
 * diagram contains a point no stone touches, so it can never be vital, and
 * the rest of the board does not change the answer.
 */
export function bensonAlive(pz, board, color, keyIdx) {
  const c = context(pz.size);
  const size = pz.size;
  const b = pz.box;
  const ax0 = Math.max(0, b.x0 - 2);
  const ay0 = Math.max(0, b.y0 - 2);
  const ax1 = Math.min(size - 1, b.x1 + 2);
  const ay1 = Math.min(size - 1, b.y1 + 2);
  if (!c.bensonChain) {
    c.bensonChain = new Int32Array(c.n);
    c.bensonRegion = new Int32Array(c.n);
  }
  const chainOf = c.bensonChain;
  const regionOf = c.bensonRegion;
  for (let y = ay0; y <= ay1; y++) {
    for (let x = ax0; x <= ax1; x++) {
      chainOf[y * size + x] = -1;
      regionOf[y * size + x] = -1;
    }
  }
  const inArea = (i) => {
    const x = i % size;
    const y = (i / size) | 0;
    return x >= ax0 && x <= ax1 && y >= ay0 && y <= ay1;
  };
  // A point at least two lines outside the diagram touches no stone.
  const far = (i) => {
    const x = i % size;
    const y = (i / size) | 0;
    return x < b.x0 - 1 || x > b.x1 + 1 || y < b.y0 - 1 || y > b.y1 + 1;
  };
  const chains = [];
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const i = y * size + x;
      if (board[i] !== color || chainOf[i] >= 0) continue;
      const ch = chain(c, board, i);
      const id = chains.length;
      for (const p of ch.stones) chainOf[p] = id;
      chains.push({ libs: new Set(ch.libs), alive: true });
    }
  }
  const regions = [];
  for (let y = ay0; y <= ay1; y++) {
    for (let x = ax0; x <= ax1; x++) {
      const i = y * size + x;
      if (board[i] === color || regionOf[i] >= 0) continue;
      const id = regions.length;
      const pts = [];
      const borders = new Set();
      let open = false;
      const stack = [i];
      regionOf[i] = id;
      while (stack.length) {
        const p = stack.pop();
        pts.push(p);
        if (far(p)) open = true;
        for (const q of c.nbr[p]) {
          if (!inArea(q)) continue;
          if (board[q] === color) borders.add(chainOf[q]);
          else if (regionOf[q] < 0) {
            regionOf[q] = id;
            stack.push(q);
          }
        }
      }
      regions.push({ pts, borders, healthy: true, open });
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let id = 0; id < chains.length; id++) {
      const ch = chains[id];
      if (!ch.alive) continue;
      let vital = 0;
      for (const r of regions) {
        if (r.open || !r.healthy || !r.borders.has(id)) continue;
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
  return keyIdx.every((i) => board[i] === color && chains[chainOf[i]]?.alive);
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

/**
 * Every key chain has a liberty nobody may play (outside the region), so no
 * sequence can capture it: chains only grow, and that liberty stays empty.
 * In a race this is the key stones joining their own outside wall after
 * capturing the stones inside it; the problem check makes sure no life or
 * kill problem lets the key stones reach such a liberty at all (see
 * outsideReach()).
 */
function keysOutOfReach(pz, chains) {
  for (const ch of chains) if (!ch.libs.some((l) => !playable(pz, l))) return false;
  return true;
}

/**
 * Benson life of the key chains, cached per position (the search meets the
 * same positions again across iterations and searches). A chain with fewer
 * than two liberties cannot have two vital regions.
 */
function keyBenson(pz, st, keyIdx, chains) {
  for (const ch of chains) if (ch.libs.length < 2) return false;
  if (!pz._benson || pz._benson.size > 1000000) pz._benson = new Map();
  const k = posKey(st);
  let alive = pz._benson.get(k);
  if (alive === undefined) {
    alive = bensonAlive(pz, st.board, pz.keyColor, keyIdx);
    pz._benson.set(k, alive);
  }
  return alive;
}

/**
 * +1: attacker has won, -1: defender has won, 0: undecided. In a strict
 * search two passes are a win for the attacker: the defender must reach
 * independent life (or escape) by force.
 */
function terminal(pz, st, keyIdx, info = null, strict = false) {
  for (const i of keyIdx) if (st.board[i] !== pz.keyColor) return 1;
  if (st.passes >= 2 && !strict) return -1;
  if (pz.lifeGoal) {
    const chains = (info || keyInfo(pz, st.board, keyIdx)).chains;
    // A strict search asks for life of the stones' own (Benson); sekiInfo()
    // calls an uncapturable-by-fiat group "unknown" instead.
    if (!strict && keysOutOfReach(pz, chains)) return -1;
    if (keyBenson(pz, st, keyIdx, chains)) return -1;
  } else if ((info || keyInfo(pz, st.board, keyIdx)).minLibs >= pz.escape) return -1;
  if (st.passes >= 2) return 1;
  return 0;
}

/**
 * The points either side may play: the region's empty points and, with
 * `replay`, the points of the diagram's stones once those are captured (a
 * captured point is part of the fight: it can be retaken, filled or made an
 * eye). Without `replay` a captured point stays out of play; see createPuzzle.
 */
function regionSet(pz) {
  if (!pz._region && pz.region) {
    const pts = [...pz.region, ...(pz.replay ? pz.stones : [])].map((p) => p.y * pz.size + p.x);
    pz._region = [...new Set(pts)];
  }
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
    if (st.hist) {
      withHistory(st, next);
      if (i !== PASS && !retake && repeatsLine(next)) continue;
    }
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
  // Joining the key stones to a chain that can never be captured settles it.
  if (onLib && pz.lifeGoal) {
    for (const q of c.nbr[i]) {
      if (board[q] !== pz.keyColor || info.chains.some((ch) => ch.stones.includes(q))) continue;
      if (chain(c, board, q).libs.some((l) => !playable(pz, l))) {
        score += 100;
        break;
      }
    }
  }
  return score;
}

class Search {
  constructor(pz, master, budget = 150000, strict = false) {
    this.pz = pz;
    this.master = master;
    this.strict = strict;
    this.keyIdx = keyIndices(pz);
    // One table per ko master (and per strictness), shared by every search on
    // this puzzle: positions repeat across first-move checks, replies and
    // status checks.
    if (!pz._tt) pz._tt = {};
    const slot = strict ? `${master}s` : master;
    let tt = pz._tt[slot];
    if (!tt || tt.size > 1500000) tt = pz._tt[slot] = new Map();
    this.tt = tt;
    // Positions on the current line: posKey -> ply of its first occurrence.
    this.path = new Map();
    this.ply = 0;
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
    const term = terminal(pz, st, this.keyIdx, info, this.strict);
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
    const ply = this.ply++;
    const seen = this.path.get(pk);
    this.path.set(pk, seen === undefined ? ply : seen);
    let exact = true;
    let result = !attacking; // attacker: assume loss until a win; defender: assume attacker wins
    // The shallowest ply of the line this result depends on (see below).
    let dep = Infinity;
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
      if (i !== PASS && !retake) {
        const rep = this.path.get(posKey(next));
        if (rep !== undefined) {
          dep = Math.min(dep, rep);
          continue;
        }
      }
      const r = this.run(next, depth - 1, pushes);
      if (!r.exact) exact = false;
      if ((attacking && r.win) || (!attacking && !r.win)) {
        result = attacking;
        exact = r.exact;
        dep = r.dep ?? Infinity;
        break;
      }
      dep = Math.min(dep, r.dep ?? Infinity);
    }
    this.ply--;
    if (seen === undefined) this.path.delete(pk);
    const out = { win: result, exact, depth, pushes, dep };
    // A result that rests on a move forbidden by superko, because it repeats
    // a position played above this one, holds only on this line (the graph
    // history problem): it is returned but not stored, so another line that
    // reaches this position reads it afresh.
    //
    // v13: once the node budget has run out, every unfinished subtree
    // answers "the attacker does not win", so an inexact result computed
    // after that point is an artefact of the budget, not of the depth: it
    // is returned (marked inexact) but never stored, or a later search with
    // budget left would read it back as a depth-limited result. Inexact
    // results stored before the budget ran out are depth-limited only.
    //
    // v13: only a result that rests on no repetition at all is stored
    // (dep === Infinity). Storing results whose repetition was found at
    // this very ply (dep === ply) let a position's value depend on the
    // order the search reached it: life-vital-20 proved one correct move as
    // written and two in every other orientation; without the table, and
    // with this rule, every orientation proves both.
    if (dep === Infinity && (exact || !this.exhausted)) this.tt.set(k, { win: result, exact, depth, pushes });
    return out;
  }
}

/**
 * Does the attacker win from `st` (with st.toMove to play)? `master` is the
 * ko master; by default the side the learner is playing against. `strict`
 * makes two passes a win for the attacker (see the header on seki).
 */
export function attackerWins(pz, st, budget, master = -pz.userColor, strict = false) {
  const s = new Search(pz, master, budget, strict);
  // The real line's earlier positions are on the path at ply -1: a result
  // that rests on them is never stored (see run()).
  if (st.hist) for (const k of st.hist) if (!s.path.has(k)) s.path.set(k, -1);
  // Iterative deepening: short wins (most of them) are found before the
  // search wanders down a long line; shallow results stay in the table.
  let r;
  for (let depth = Math.min(6, pz.maxDepth); ; depth = Math.min(pz.maxDepth, depth * 2)) {
    r = s.run(st, depth);
    if (r.win || r.exact || s.exhausted || depth >= pz.maxDepth) break;
  }
  return { win: r.win, exact: r.exact && !s.exhausted, nodes: s.nodes };
}

/**
 * Learner's result; `koOk` true makes the learner ko master, `strict` asks a
 * defending learner for independent life (seki is not enough). `exact`
 * false means the search ran out of depth or nodes: `win` is then a guess
 * that reply() and status() treat as unknown, never as a result.
 */
function userWins(pz, st, budget, koOk = pz.koOk, strict = false) {
  const master = koOk ? pz.userColor : -pz.userColor;
  const r = attackerWins(pz, st, budget, master, strict);
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
export function solveFirstMoves(pz, budget = 600000, { deadline = Infinity } = {}) {
  if (pz.counting) return countSolveFirstMoves(pz);
  const st = initialState(pz);
  const keyIdx = keyIndices(pz);
  const moves = candidates(pz, st, keyIdx);
  const correct = [];
  let nodes = 0;
  let exact = true;
  for (const m of moves) {
    // v7 (problem import): a wall-clock limit; the result is then inexact.
    if (Date.now() > deadline) {
      exact = false;
      return { correct: correct.map((i) => pointOf(pz, i)), tried: moves.length, nodes, exact, timedOut: true };
    }
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
  if (pz.counting) return countStatus(pz, st) === "lost" ? "loss" : "win";
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
  if (pz.counting) return countReply(pz, st);
  const keyIdx = keyIndices(pz);
  if (terminal(pz, st, keyIdx)) return null;
  const moves = candidates(pz, st, keyIdx);
  // v13: only a proved loss is a refutation; an inexact one is unknown.
  const loses = (r) => r.exact && !r.win;
  for (const m of moves) {
    if (loses(userWins(pz, m.next))) return { ...pointOf(pz, m.i), refutes: true };
  }
  // A lost side plays the move a person would: the best shape, which for
  // the stones under attack means the most liberties (extend, connect,
  // capture), so an answer line reads like a teacher's.
  let best = moves.length ? moves[0].i : null;
  // In a ko problem the opponent fights the ko rather than lose outright.
  if (pz.koOk) {
    const fight = moves.find((m) => loses(userWins(pz, m.next, undefined, false)));
    if (fight) best = fight.i;
  }
  // In a seki problem the opponent keeps the learner from independent life,
  // so the answer ends in the seki the problem is about.
  if (pz.sekiGoal) {
    const firm = moves.find((m) => loses(userWins(pz, m.next, undefined, pz.koOk, true)));
    if (firm) best = firm.i;
  }
  if (loses(userWins(pz, st))) return { pass: true, refutes: true, ko: st.ko >= 0 };
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
  if (pz.counting) return countStatus(pz, st);
  const keyIdx = keyIndices(pz);
  const term = terminal(pz, st, keyIdx);
  const attackGoal = pz.userColor === pz.attacker;
  if (term) return (term > 0) === attackGoal ? "won" : "lost";
  // v13: only proved results decide; an inexact search (out of depth or
  // nodes) leaves the problem open.
  const wins = (r) => r.exact && r.win;
  const loses = (r) => r.exact && !r.win;
  // A ko problem is solved once the ko is on the board and the learner, with
  // the threats, wins it: the fight itself is played with ko threats
  // elsewhere, which a problem board does not show.
  if (pz.koOk && st.ko >= 0 && wins(userWins(pz, st))) return "won";
  if (st.toMove !== pz.userColor) return loses(userWins(pz, st)) ? "lost" : "open";
  // Settled: the learner wins even if the opponent moves next.
  const tenuki = { ...st, toMove: -pz.userColor, ko: -1, passes: 0 };
  if (wins(userWins(pz, tenuki))) return "won";
  if (loses(userWins(pz, st))) return "lost";
  return "open";
}

/** A best line for the learner from the start, for "show answer". */
export function solutionLine(pz, limit = 24) {
  if (pz.counting) return countSolutionLine(pz);
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
      const next = withHistory(st, play(pz, st, indexOf(pz, r.x, r.y)));
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
  if (pz.counting) return countDifficulty(pz);
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
 * line }: `reasons` lists every defect found, `result` is "win", "ko" or
 * "seki" (the learner's best result from the start). A problem is fair when every chain
 * breathes, the start is not already decided, the first-move search is
 * exact with one to `maxCorrect` correct moves, a `ko: "ok"` problem really
 * is a ko (no unconditional answer exists, a ko does), a `goal: "seki"`
 * problem really is a seki (no independent life exists, and the answer ends
 * in a position sekiInfo() calls seki), and the solution line is legal and
 * ends in a won position.
 */
export function validate(pz, { maxCorrect = 3, first = null, line = null } = {}) {
  if (pz.counting) return countValidate(pz, { maxCorrect, line });
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
  if (pz.sekiGoal) {
    // The best result really is seki: no defence reaches independent life.
    const indep = userWins(pz, st0, 600000, pz.koOk, true);
    if (!indep.exact) reasons.push("the independent-life search is not exact");
    if (indep.win) reasons.push('goal "seki" but the learner can live independently');
    result = "seki";
  }
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
    else if (pz.sekiGoal) {
      const s = sekiInfo(pz, st);
      if (s.result !== "seki") reasons.push(`the solution line ends in ${s.result}, not seki (${s.why})`);
    }
  }
  return { ok: !reasons.length, reasons, result, first, line };
}

export { PASS };

/** The learner's winning moves from `st` (learner to move). For hints. */
export function winningMoves(pz, st) {
  if (pz.counting) return countWinningMoves(pz, st);
  const keyIdx = keyIndices(pz);
  const out = [];
  for (const m of candidates(pz, st, keyIdx)) {
    if (userWins(pz, m.next).win) out.push(pointOf(pz, m.i));
  }
  return out;
}

/* ------------------------------------------------------------------ seki */

function playable(pz, i) {
  const region = regionSet(pz);
  if (region) {
    if (!pz._regionSet) pz._regionSet = new Set(region);
    return pz._regionSet.has(i);
  }
  return inBox(pz, i);
}

/**
 * Can the key stones ever breathe through a point nobody may play? Spread
 * from the key stones over empty points and their own stones and, with
 * `throughCaptures`, over attacker chains that could be captured (all their
 * liberties playable). Reaching an empty point outside the problem area, or
 * a defending chain with a liberty there, means the key stones might
 * survive only because that liberty can never be filled: on a real board it
 * is open space the opponent could take, so the problem would be deciding
 * life by fiat. Returns the offending points ({x, y}), empty when the key
 * stones are sealed in.
 *
 * Life and kill problems use `throughCaptures: true` (capturing a cutting
 * stone to run out is still running out). Capturing races use false: there
 * the outside walls of both sides are taken as alive, and the race is over
 * once the key stones capture the stones they are racing (the search still
 * reads on after that capture, see keysOutOfReach()).
 */
export function outsideReach(pz, { throughCaptures = true, st = initialState(pz) } = {}) {
  const c = context(pz.size);
  const board = st.board;
  const keyIdx = keyIndices(pz);
  const seen = new Uint8Array(board.length);
  const stack = [];
  for (const k of keyIdx) {
    if (board[k] !== pz.keyColor || seen[k]) continue;
    seen[k] = 1;
    stack.push(k);
  }
  const hits = new Set();
  const libsPlayable = (i) => chain(c, board, i).libs.every((l) => playable(pz, l));
  while (stack.length) {
    const p = stack.pop();
    if (board[p] === 0) {
      if (!playable(pz, p)) {
        hits.add(p);
        continue;
      }
    } else if (board[p] === pz.keyColor) {
      if (!libsPlayable(p)) {
        hits.add(p);
        continue;
      }
    } else if (!throughCaptures || !libsPlayable(p)) continue;
    for (const q of c.nbr[p]) {
      if (seen[q]) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  return [...hits].sort((a, b) => a - b).map((i) => pointOf(pz, i));
}

/**
 * How the key stones stand in a position, whoever is to move:
 *
 *   result  "dead"    the attacker, moving first, captures a key stone
 *           "alive"   the defender, moving first, reaches independent life
 *                     (Benson life, or the escape count off a region)
 *           "seki"    neither, and the stalemate is real (rules 3 and 4 in
 *                     the header): the groups share liberties nobody can
 *                     fill to advantage
 *           "unknown" neither, but the defender survives only through a
 *                     liberty outside the problem area or next to the fixed
 *                     wall alone, or a search ran out of budget
 *   shared  for "seki", the shared liberties as {x, y}
 *   why     a short reason when the result is not "seki"
 *
 * Every ko counts against the defender in both searches.
 */
export function sekiInfo(pz, st, budget = 300000) {
  const c = context(pz.size);
  const keyIdx = keyIndices(pz);
  const board = st.board;
  const info = keyInfo(pz, board, keyIdx);
  if (info.captured) return { result: "dead", shared: [], why: "a key stone is captured" };
  const att = { ...st, toMove: pz.attacker, ko: st.toMove === pz.attacker ? st.ko : -1, passes: 0 };
  const r1 = attackerWins(pz, att, budget, pz.attacker);
  if (r1.win) return { result: "dead", shared: [], why: "the attacker captures" };
  if (!r1.exact) return { result: "unknown", shared: [], why: "the capture search is not exact" };
  const def = { ...st, toMove: pz.keyColor, ko: st.toMove === pz.keyColor ? st.ko : -1, passes: 0 };
  const r2 = attackerWins(pz, def, budget, pz.attacker, true);
  if (!r2.exact) return { result: "unknown", shared: [], why: "the life search is not exact" };
  if (!r2.win) return { result: "alive", shared: [], why: "independent life" };
  // Rule 3: nothing the key stones can reach breathes through a point nobody
  // may play. Spread from the key chains over empty points, defending
  // stones and attacker chains that could be captured (all their liberties
  // playable); a defending chain met on the way with an unplayable liberty
  // can never be captured, so the key stones might live only by joining it.
  {
    const reach = new Uint8Array(board.length);
    const stack = [...keyIdx];
    for (const k of keyIdx) reach[k] = 1;
    const libsPlayable = new Map();
    const allPlayable = (i) => {
      if (!libsPlayable.has(i)) {
        const ch = chain(c, board, i);
        const ok = ch.libs.every((x) => playable(pz, x));
        for (const p of ch.stones) libsPlayable.set(p, ok);
      }
      return libsPlayable.get(i);
    };
    while (stack.length) {
      const p = stack.pop();
      if (board[p] === 0 ? !playable(pz, p) : !allPlayable(p)) {
        if (board[p] !== pz.attacker) return { result: "unknown", shared: [], why: "the key stones reach a liberty outside the problem area" };
        continue;
      }
      for (const q of c.nbr[p]) {
        if (reach[q]) continue;
        reach[q] = 1;
        stack.push(q);
      }
    }
  }
  // Attacker chains next to a key liberty whose own liberties are all in play.
  const shared = new Set();
  const seen = new Set();
  for (const l of info.libs) {
    for (const q of c.nbr[l]) {
      if (board[q] !== pz.attacker || seen.has(q)) continue;
      const ec = chain(c, board, q);
      for (const p of ec.stones) seen.add(p);
      if (!ec.libs.every((x) => playable(pz, x))) continue;
      for (const x of ec.libs) if (info.libs.has(x)) shared.add(x);
    }
  }
  if (!shared.size) return { result: "unknown", shared: [], why: "no liberty is shared with stones inside the fight" };
  return { result: "seki", shared: [...shared].sort((a, b) => a - b).map((i) => pointOf(pz, i)) };
}

/** Board as rows of signs, for the renderer. */
export function signMap(pz, st) {
  const rows = [];
  for (let y = 0; y < pz.size; y++) rows.push(Array.from(st.board.subarray(y * pz.size, (y + 1) * pz.size)));
  return rows;
}

/* -------------------------------------------------------------- counting */

/**
 * Counting mode (v6): endgame problems, `goal: "endgame"`.
 *
 * The solver proves an endgame answer by exact minimax counting of the
 * local position under Japanese counting: the score is territory plus
 * prisoners, Black's minus White's, and play goes on until both sides pass,
 * so sente, gote and the value of every follow-up are read out. The play
 * area is the diagram's '.' points, its ':' points (counted at the end but
 * never played, except to capture: the inside of a territory) and the points
 * of every stone that can be captured. It must be sealed: no '.' or ':'
 * point touches a ',' point, so a wall (a chain with a liberty on a ','
 * point) can never be captured. Several sealed areas in one diagram form
 * one sum game, so "which move is biggest" is answered by the same search.
 *
 * The model:
 *
 *   - Black and White alternate; either may pass (tenuki: the rest of the
 *     board is settled). Two passes in a row end the play. Captures, no
 *     suicide, simple ko; neither side has ko threats. A point where a stone
 *     was captured stays closed to that colour for the rest of the line
 *     (state `closed`), so no line can repeat a position and every search
 *     is finite without superko; it also makes taking a ko final.
 *   - A player does not fill an area their own stones alone enclose, unless
 *     a chain of theirs next to the point has one or two liberties, and
 *     does not play into an area the opponent alone encloses, or on a ':'
 *     point, unless the stone captures. In areas this small such a stone is
 *     dead, and under Japanese counting it only hands over a prisoner.
 *   - When play ends, dead stones come off as prisoners (countFinal()): a
 *     chain the other colour alone encloses, with no way to its own wall,
 *     and a chain in atari whose liberty the other side may play. Two
 *     touching chains of different colours, both in atari, are a fight
 *     still on: such an end is unsettled, and passing into it is not
 *     allowed while a move is left.
 *   - Territory is an empty area enclosed by one colour alone; an area that
 *     touches both colours is neutral (dame).
 *   - An unsettled end that cannot be avoided is scored as a huge win and
 *     as a huge loss for Black in two more searches; a count is exact when
 *     all three agree (countExact()), and the problem check requires it.
 *
 * A value is Black's future score from a position: the prisoners still to
 * be taken plus the territory at the end. Two questions are asked:
 *
 *   ask: "move"   Black, to play, must find the move with the best count.
 *                 `answer` lists the correct first moves in diagram
 *                 coordinates and `margin` the points the best move gains
 *                 over the best other choice (passing included); the check
 *                 proves both.
 *   ask: "value"  How many points is the local move worth? `value` is the
 *                 deiri count: Black's result when Black plays first minus
 *                 Black's result when White plays first, each followed by
 *                 best play. `choices` are the values the app offers.
 */

/** Points of the play area: the region plus every capturable stone. */
function countingArea(pz) {
  if (pz._area) return pz._area;
  const c = context(pz.size);
  const st = initialState(pz);
  const region = new Set(pz.region.map((p) => p.y * pz.size + p.x));
  const counted = new Set(pz.counted.map((p) => p.y * pz.size + p.x));
  const fixed = new Set();
  for (const s of pz.stones) {
    const i = s.y * pz.size + s.x;
    if (fixed.has(i)) continue;
    const ch = chain(c, st.board, i);
    // A liberty on a point nobody plays: this chain can never be captured.
    if (ch.libs.some((l) => !region.has(l))) for (const p of ch.stones) fixed.add(p);
  }
  // area: counted at the end; play: where stones may be played.
  const area = new Uint8Array(c.n);
  const playable = new Uint8Array(c.n);
  for (const i of region) area[i] = playable[i] = 1;
  for (const i of counted) area[i] = 1;
  for (const s of pz.stones) {
    const i = s.y * pz.size + s.x;
    if (!fixed.has(i)) area[i] = playable[i] = 1;
  }
  pz._area = area;
  pz._areaList = [];
  pz._playList = [];
  for (let i = 0; i < c.n; i++) {
    if (area[i]) pz._areaList.push(i);
    if (playable[i]) pz._playList.push(i);
  }
  pz._fixed = fixed;
  pz._playable = playable;
  return area;
}

/**
 * Empty areas of the play area: for every empty point the id of its area,
 * and for each area its size and border mask (1 Black, 2 White, 4 a point
 * outside the play area).
 */
function emptyAreas(pz, board, points = null) {
  const c = context(pz.size);
  const area = countingArea(pz);
  points = points || pz._areaList;
  // One buffer per puzzle: a caller is done with it before the next call.
  if (!pz._areaId) pz._areaId = new Int32Array(c.n);
  const id = pz._areaId;
  for (const i of points) id[i] = -1;
  const masks = [];
  const sizes = [];
  for (const i of points) {
    if (board[i] !== 0 || id[i] >= 0) continue;
    const k = masks.length;
    let mask = 0;
    let n = 0;
    const stack = [i];
    id[i] = k;
    while (stack.length) {
      const p = stack.pop();
      n++;
      for (const q of c.nbr[p]) {
        const v = board[q];
        if (v === BLACK) mask |= 1;
        else if (v === WHITE) mask |= 2;
        else if (!area[q]) mask |= 4;
        else if (id[q] < 0) {
          id[q] = k;
          stack.push(q);
        }
      }
    }
    masks.push(mask);
    sizes.push(n);
  }
  return { id, masks, sizes };
}

/**
 * Count a finished position. Dead stones come off first, as prisoners:
 *
 *   1. enclosed: a chain whose own area (the empty points and stones of its
 *      colour it reaches inside the play area) touches no wall of its
 *      colour and no point outside the problem, so the other colour alone
 *      surrounds it in a space too small to live in;
 *   2. in atari: a chain with one liberty inside the play area that the
 *      other colour may play (not closed to it): its owner chose not to
 *      save it, and taking it is final (the taker's point stays closed to
 *      the owner, so a ko cannot be retaken).
 *
 * If two chains of different colours, both in atari, touch, the fight is
 * still on (whoever moves takes), and the end is unsettled. Then territory
 * is counted: an empty area enclosed by one colour alone. Returns
 * { score, unsettled }, `score` being Black's territory and prisoners
 * minus White's.
 */
function countFinal(pz, board, points = null, closed = []) {
  const c = context(pz.size);
  const area = countingArea(pz);
  points = points || pz._areaList;
  let b = board;
  let prisoners = 0;
  let unsettled = false;
  const dead = [];
  const colours = new Set();
  const seen = new Uint8Array(c.n);
  const reach = new Uint8Array(c.n);
  for (const i of points) {
    if (!b[i] || seen[i]) continue;
    const color = b[i];
    // Rule 1: flood the chain's own area.
    let alive = false;
    const stones = [];
    const stack = [i];
    for (const p of points) reach[p] = 0;
    reach[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      if (b[p] === color) stones.push(p);
      for (const q of c.nbr[p]) {
        if (reach[q]) continue;
        if (!area[q]) {
          if (b[q] === color || b[q] === 0) alive = true;
          continue;
        }
        if (b[q] === -color) continue;
        reach[q] = 1;
        stack.push(q);
      }
    }
    for (const p of stones) seen[p] = 1;
    if (!alive) {
      dead.push({ color, stones, lib: -1 });
      colours.add(color);
      continue;
    }
    // Rule 2: every chain of this colour in the area, one at a time.
    for (const p of stones) {
      if (seen[p] === 2) continue;
      const ch = chain(c, b, p);
      for (const q of ch.stones) seen[q] = 2;
      if (ch.libs.length !== 1 || !area[ch.libs[0]]) continue;
      if (closed.includes(ch.libs[0] * 2 + (color === BLACK ? 1 : 0))) continue;
      dead.push({ color, stones: ch.stones, lib: ch.libs[0] });
      colours.add(color);
    }
  }
  if (colours.size > 1) {
    // Dead chains of both colours: two chains in atari that touch are a
    // fight still on (whoever moves captures), not dead stones.
    const owner = new Map();
    for (const d of dead) if (d.lib >= 0) for (const p of d.stones) owner.set(p, d.color);
    for (const d of dead) if (d.lib >= 0) for (const p of d.stones) for (const q of c.nbr[p]) if (owner.get(q) === -d.color) unsettled = true;
  }
  if (dead.length) {
    b = b.slice();
    for (const d of dead) {
      for (const p of d.stones) b[p] = 0;
      prisoners += d.color === WHITE ? d.stones.length : -d.stones.length;
    }
  }
  const { masks, sizes } = emptyAreas(pz, b, points);
  let terr = 0;
  for (let k = 0; k < masks.length; k++) {
    if (masks[k] === 1) terr += sizes[k];
    else if (masks[k] === 2) terr -= sizes[k];
  }
  return { score: terr + prisoners, unsettled };
}

/**
 * The moves the counting model allows from `st` (see the header above),
 * each with its next state and the prisoners it takes (Black's minus
 * White's). Pass is not included. A counting state carries `closed`: the
 * points where a stone has been captured, each closed to that colour
 * (encoded i * 2, plus 1 for White).
 */
function countingCandidates(pz, st) {
  const out = [];
  for (const p of countingPoints(pz, st)) {
    const m = countingPlay(pz, st, p.i);
    if (m) out.push(m);
  }
  return out;
}

/**
 * The points the model allows from `st` before the move is played (a
 * suicide is found by countingPlay()), each with an ordering score: a
 * capture first, then contact with the opponent's stones.
 */
function countingPoints(pz, st, points = null) {
  const c = context(pz.size);
  const board = st.board;
  countingArea(pz);
  points = points || pz._areaList;
  const areas = emptyAreas(pz, board, points);
  const closed = st.closed || [];
  const me = st.toMove;
  const code = me === BLACK ? 0 : 1;
  const out = [];
  for (const i of points) {
    if (board[i] !== 0 || i === st.ko) continue;
    if (closed.length && closed.includes(i * 2 + code)) continue;
    let captures = 0;
    let order = 0;
    let shortOwn = false;
    for (const q of c.nbr[i]) {
      const v = board[q];
      if (v === -me) {
        order += 3;
        const ch = chain(c, board, q);
        if (ch.libs.length === 1) captures += ch.stones.length;
      } else if (v === me) {
        order += 1;
        if (!shortOwn && chain(c, board, q).libs.length <= 2) shortOwn = true;
      }
    }
    const mask = areas.masks[areas.id[i]];
    const owner = mask === 1 ? BLACK : mask === 2 ? WHITE : 0;
    // Inside your own enclosed area: only to save a short chain.
    if (owner === me && !shortOwn) continue;
    // Inside the opponent's enclosed area, or on a counted point: only a
    // capture.
    if ((!pz._playable[i] || owner === -me) && !captures) continue;
    out.push({ i, order: order + captures * 10 });
  }
  return out;
}

/** Play a point countingPoints() allowed: { i, next, gain } or null (suicide). */
function countingPlay(pz, st, i) {
  const next = play(pz, st, i);
  if (!next) return null;
  const closed = st.closed || [];
  next.closed = closed;
  if (next.captured) {
    const add = [];
    const them = st.toMove === BLACK ? 1 : 0;
    for (const p of pz._areaList) if (st.board[p] === -st.toMove && next.board[p] === 0) add.push(p * 2 + them);
    next.closed = [...closed, ...add].sort((x, y) => x - y);
  }
  const gain = (next.captured || 0) * (st.toMove === BLACK ? 1 : -1);
  // Prisoners taken since the start (Black's minus White's), for the app.
  next.taken = (st.taken || 0) + gain;
  return { i, next, gain };
}

/**
 * Passing after a pass ends the play, which is not allowed while the end
 * would be unsettled and a move is left: the play goes on, as a
 * confirmation would.
 */
function passAllowed(pz, st, moves) {
  if (st.passes !== 1 || !moves.length) return true;
  return !countFinal(pz, st.board, null, st.closed || []).unsettled;
}

/** A pass that keeps the closed points. */
function countPass(pz, st) {
  const next = play(pz, st, PASS);
  next.closed = st.closed || [];
  next.taken = st.taken || 0;
  return next;
}

/**
 * The local games. The play area falls into separate sealed areas, and a
 * move in one never changes another, so each area is read once as a graph
 * of local positions (its stones and closed points), with each colour's
 * moves from it, the prisoners they take and the ko they leave, and its
 * own final count. The search then runs over tuples of local positions,
 * which is what makes a sum of several areas cheap to read.
 */
function countGraph(pz) {
  if (pz._graph) return pz._graph;
  const c = context(pz.size);
  countingArea(pz);
  const areaOf = new Int32Array(c.n).fill(-1);
  const areas = [];
  for (const i of pz._areaList) {
    if (areaOf[i] >= 0) continue;
    const pts = [];
    const stack = [i];
    areaOf[i] = areas.length;
    while (stack.length) {
      const p = stack.pop();
      pts.push(p);
      for (const q of c.nbr[p]) {
        if (pz._area[q] && areaOf[q] < 0) {
          areaOf[q] = areas.length;
          stack.push(q);
        }
      }
    }
    pts.sort((x, y) => x - y);
    areas.push(pts);
  }
  const base = initialState(pz).board;
  pz._graph = { areas, areaOf, base, locals: areas.map(() => ({ ids: new Map(), nodes: [] })) };
  return pz._graph;
}

/** The id of area a's local position on `board` with `closed`. */
function localNode(pz, G, a, board, closed) {
  const pts = G.areas[a];
  let key = "";
  for (const i of pts) key += board[i] === BLACK ? "x" : board[i] === WHITE ? "o" : ".";
  const mine = closed.filter((v) => G.areaOf[v >> 1] === a);
  if (mine.length) key += "|" + mine.join(",");
  const L = G.locals[a];
  let id = L.ids.get(key);
  if (id !== undefined) return id;
  const b = G.base.slice();
  for (const i of pts) b[i] = board[i];
  id = L.nodes.length;
  L.nodes.push({ board: b, closed: mine, opts: [null, null], final: null });
  L.ids.set(key, id);
  return id;
}

/** Moves of `color` from a local position, best guesses first. */
function localOptions(pz, G, a, id, color) {
  const node = G.locals[a].nodes[id];
  const k = color === BLACK ? 0 : 1;
  if (node.opts[k]) return node.opts[k];
  const st = { board: node.board, toMove: color, ko: -1, passes: 0, h1: 0, h2: 0, closed: node.closed };
  const out = [];
  for (const p of countingPoints(pz, st, G.areas[a])) {
    const m = countingPlay(pz, st, p.i);
    if (!m) continue;
    out.push({ i: p.i, a, child: localNode(pz, G, a, m.next.board, m.next.closed), gain: m.gain, ko: m.next.ko, order: p.order });
  }
  out.sort((x, y) => y.order - x.order);
  node.opts[k] = out;
  return out;
}

function localFinal(pz, G, a, id) {
  const node = G.locals[a].nodes[id];
  if (!node.final) node.final = countFinal(pz, node.board, G.areas[a], node.closed);
  return node.final;
}

/**
 * The search. `bias` says how an unsettled end is scored: 0 by the removal
 * rules above (the best guess), +1 or -1 as a win or a loss for Black far
 * larger than any count. Minimax is monotone in the end scores, so when the
 * two extremes give the same value, no unsettled end can change it: that is
 * how a value is proved exact (see countExact()).
 */
const UNSETTLED = 1000;

class CountSearch {
  constructor(pz, bias = 0) {
    this.pz = pz;
    this.G = countGraph(pz);
    if (!pz._countMemo) pz._countMemo = new Map();
    if (!pz._countMemo.has(bias)) pz._countMemo.set(bias, new Map());
    // key -> [lo, hi]: the value is known to lie in lo..hi.
    this.tt = pz._countMemo.get(bias);
    this.bias = bias;
    this.nodes = 0;
    // No count can reach this: every point and every prisoner, twice over.
    this.bound = 2 * pz._areaList.length + 4;
  }

  /** The search state of a full position: local ids, side, passes, ko. */
  of(st) {
    const G = this.G;
    const ids = G.areas.map((_, a) => localNode(this.pz, G, a, st.board, st.closed || []));
    return { ids, toMove: st.toMove, passes: Math.min(2, st.passes || 0), ko: st.ko ?? -1 };
  }

  final(s) {
    let score = 0;
    let unsettled = false;
    s.ids.forEach((id, a) => {
      const f = localFinal(this.pz, this.G, a, id);
      score += f.score;
      if (f.unsettled) unsettled = true;
    });
    return { score, unsettled };
  }

  /** Does Black's future score from s reach at least g? */
  ge(s, g) {
    const k = `${s.ids.join(",")}:${s.toMove}:${s.passes}:${s.ko}`;
    let e = this.tt.get(k);
    if (e) {
      if (e[0] >= g) return true;
      if (e[1] < g) return false;
    } else {
      e = [-Infinity, Infinity];
      this.tt.set(k, e);
    }
    this.nodes++;
    if (s.passes >= 2) {
      const f = this.final(s);
      if (f.unsettled) this.pz._sawUnsettled = true;
      const v = f.unsettled && this.bias ? this.bias * UNSETTLED : f.score;
      e[0] = e[1] = v;
      return v >= g;
    }
    const max = s.toMove === BLACK;
    const opts = [];
    s.ids.forEach((id, a) => {
      for (const o of localOptions(this.pz, this.G, a, id, s.toMove)) if (o.i !== s.ko) opts.push(o);
    });
    opts.sort((x, y) => y.order - x.order);
    // Ending the play while it is unsettled is allowed only when no move is
    // left (passAllowed()). Otherwise passing is read after the contact
    // moves.
    const hold = s.passes === 1 && opts.length > 0 && this.final(s).unsettled;
    if (!hold) {
      const at = opts.findIndex((o) => o.order < 3);
      opts.splice(at < 0 ? opts.length : at, 0, null);
    }
    for (const o of opts) {
      let next;
      let gain = 0;
      if (o === null) next = { ids: s.ids, toMove: -s.toMove, passes: s.passes + 1, ko: -1 };
      else {
        const ids = s.ids.slice();
        ids[o.a] = o.child;
        next = { ids, toMove: -s.toMove, passes: 0, ko: o.ko };
        gain = o.gain;
      }
      const r = this.ge(next, g - gain);
      if (max && r) {
        e[0] = Math.max(e[0], g);
        return true;
      }
      if (!max && !r) {
        e[1] = Math.min(e[1], g - 1);
        return false;
      }
    }
    if (max) e[1] = Math.min(e[1], g - 1);
    else e[0] = Math.max(e[0], g);
    return !max;
  }

  /**
   * Black's future score from a full position: null-window tests stepping
   * from `guess` (MTD(f)), then by bisection once the value is bracketed.
   */
  run(st, guess = 0) {
    const s = this.of(st);
    if (this.bias) {
      if (this.ge(s, this.bound + 1)) return { value: UNSETTLED, nodes: this.nodes };
      if (!this.ge(s, -this.bound)) return { value: -UNSETTLED, nodes: this.nodes };
    }
    let lo = -this.bound;
    let hi = this.bound;
    let g = Math.max(lo, Math.min(hi, guess));
    // Invariant: lo <= value <= hi.
    while (lo < hi) {
      if (this.ge(s, g)) lo = g;
      else hi = g - 1;
      const e = this.tt.get(`${s.ids.join(",")}:${s.toMove}:${s.passes}:${s.ko}`);
      if (e) {
        lo = Math.max(lo, e[0]);
        hi = Math.min(hi, e[1]);
      }
      if (lo >= hi) break;
      g = g <= lo ? lo + 1 : g > hi ? hi : Math.floor((lo + hi + 1) / 2);
      if (g === lo) g = lo + 1;
    }
    return { value: lo, nodes: this.nodes };
  }
}

/** Black's best future score from `st` (counting puzzles). */
export function countValue(pz, st, bias = 0) {
  return new CountSearch(pz, bias).run(st);
}

/**
 * Is Black's value from `st` independent of how unsettled ends are scored?
 * Returns { value, exact }.
 */
export function countExact(pz, st) {
  const r = countValue(pz, st);
  // No unsettled end was ever read: nothing to prove.
  if (!pz._sawUnsettled) return { ...r, exact: true };
  const hi = countValue(pz, st, 1).value;
  const lo = countValue(pz, st, -1).value;
  return { value: r.value, exact: hi === lo && lo === r.value, nodes: r.nodes };
}

/**
 * Every choice from `st`: the moves the model allows and the pass, each
 * with the score it leads to (Black's, the move's own prisoners included).
 */
export function countMoves(pz, st, { prove = false } = {}) {
  const out = [];
  const s = new CountSearch(pz);
  let exact = true;
  const cands = countingCandidates(pz, st);
  // The position's own value is the first guess for every choice.
  const v = st.passes >= 2 ? 0 : s.run(st).value;
  if (passAllowed(pz, st, cands)) {
    const pass = countPass(pz, st);
    out.push({ i: PASS, pass: true, next: pass, value: s.run(pass, v).value });
  }
  for (const m of cands) out.push({ i: m.i, ...pointOf(pz, m.i), next: m.next, value: s.run(m.next, v - m.gain).value + m.gain });
  if (prove) exact = out.every((m) => countExact(pz, m.next).exact);
  return { moves: out, exact, nodes: s.nodes };
}

/**
 * The deiri count of a position: Black's result with Black to play minus
 * Black's result with White to play.
 */
export function deiri(pz, st = initialState(pz)) {
  const b = countExact(pz, { ...st, toMove: BLACK, passes: 0, ko: -1 });
  const w = countExact(pz, { ...st, toMove: WHITE, passes: 0, ko: -1 });
  return { value: b.value - w.value, black: b.value, white: w.value, exact: b.exact && w.exact };
}

/** The learner's target: the best result from the start. */
function countTarget(pz) {
  if (pz._target === undefined) pz._target = countValue(pz, initialState(pz)).value;
  return pz._target;
}

/** Is score a better than b for the learner? */
const better = (pz, a, b) => (pz.userColor === BLACK ? a > b : a < b);

/** Distance from the last move, so replies stay where the play is. */
function near(pz, i, last) {
  if (last === undefined || last === null || last < 0) return 0;
  const a = pointOf(pz, i);
  const b = pointOf(pz, last);
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * The best choices for the side to move, best first. Among equal choices
 * the learner's side prefers a move to a pass (the line is shown to the
 * end); the other side answers next to the last move if that is as good,
 * else passes (it plays elsewhere rather than fill a neutral point). Then
 * moves near the last move come first.
 */
function countBest(pz, st, learner = st.toMove === pz.userColor) {
  const { moves } = countMoves(pz, st);
  const max = st.toMove === BLACK;
  let best = moves[0].value;
  for (const m of moves) if (max ? m.value > best : m.value < best) best = m.value;
  const top = moves.filter((m) => m.value === best);
  const touching = (m) => {
    if (m.pass || st.last === undefined || st.last === null || st.last < 0) return false;
    const a = pointOf(pz, m.i);
    const b = pointOf(pz, st.last);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
  };
  const rank = (m) => (learner ? (m.pass ? 1 : 0) : touching(m) ? 0 : m.pass ? 1 : 2);
  top.sort((a, b) => rank(a) - rank(b) || near(pz, a.i, st.last) - near(pz, b.i, st.last) || a.i - b.i);
  return { best, top, moves };
}

function countSolveFirstMoves(pz) {
  const st = initialState(pz);
  const { moves, exact, nodes } = countMoves(pz, st, { prove: true });
  const target = countTarget(pz);
  const correct = moves.filter((m) => !m.pass && m.value === target).map((m) => ({ x: m.x, y: m.y }));
  let second = null;
  for (const m of moves) if (m.value !== target && (second === null || better(pz, m.value, second))) second = m.value;
  return { correct, tried: moves.length - 1, nodes, exact, target, second, passValue: moves[0].value };
}

function countReply(pz, st) {
  if (st.passes >= 2) return null;
  const { best, top } = countBest(pz, st);
  const wrong = better(pz, countTarget(pz), best + (st.taken || 0));
  const m = top[0];
  if (m.pass) return { pass: true, refutes: wrong };
  return { x: m.x, y: m.y, refutes: wrong };
}

/**
 * Where the learner stands (see status()). A position's value counts only
 * what is still to come, so the prisoners taken so far are added to it.
 */
function countStatus(pz, st) {
  const target = countTarget(pz);
  const taken = st.taken || 0;
  const v = countValue(pz, st).value + taken;
  if (better(pz, target, v)) return "lost";
  if (st.toMove !== pz.userColor) return st.passes >= 2 ? "won" : "open";
  // Settled: passing now loses nothing.
  if (!passAllowed(pz, st, countingCandidates(pz, st))) return "open";
  const pass = countValue(pz, countPass(pz, st)).value + taken;
  return better(pz, target, pass) ? "open" : "won";
}

function countWinningMoves(pz, st) {
  const { best, top } = countBest(pz, st);
  if (better(pz, countTarget(pz), best + (st.taken || 0))) return [];
  return top.filter((m) => !m.pass).map((m) => ({ x: m.x, y: m.y }));
}

function countSolutionLine(pz, limit = 30) {
  let st = initialState(pz);
  const line = [];
  for (let n = 0; n < limit && st.passes < 2; n++) {
    if (st.toMove === pz.userColor && countStatus(pz, st) === "won") break;
    const m = countBest(pz, st).top[0];
    if (!m.pass) line.push({ x: m.x, y: m.y, c: st.toMove });
    else if (st.toMove === pz.userColor) break;
    st = m.next;
  }
  return line;
}

/**
 * A best line with `toMove` playing first, played until both sides pass;
 * passes are left out. For a value question: Black first, White first.
 */
export function countLine(pz, toMove = BLACK, limit = 30) {
  let st = { ...initialState(pz), toMove };
  const line = [];
  for (let n = 0; n < limit && st.passes < 2; n++) {
    const m = countBest(pz, st, true).top[0];
    if (!m.pass) line.push({ x: m.x, y: m.y, c: st.toMove });
    st = m.next;
  }
  return line;
}

/**
 * Play a move for the app (any puzzle). For a counting puzzle it follows
 * the model: the closed points are kept, and a legal move the model does
 * not read (filling your own settled area, or a dead stone in the
 * opponent's) comes back as { outside: true } instead of a position.
 * Returns { next }, { outside: true } or null (an illegal move).
 */
export function playMove(pz, st, i) {
  if (!pz.counting) {
    const next = withHistory(st, play(pz, st, i));
    if (i !== PASS && repeatsLine(next)) return null;
    return next ? { next } : null;
  }
  if (i === PASS) return { next: countPass(pz, st) };
  if (countingPoints(pz, st).some((p) => p.i === i)) {
    const m = countingPlay(pz, st, i);
    return m ? { next: m.next } : null;
  }
  return play(pz, st, i) ? { outside: true } : null;
}

/** The number of separate sealed areas (local games) in a problem. */
export function countAreas(pz) {
  const c = context(pz.size);
  countingArea(pz);
  const seen = new Uint8Array(c.n);
  let n = 0;
  for (const i of pz._areaList) {
    if (seen[i]) continue;
    n++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      for (const q of c.nbr[p]) {
        if (pz._area[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
  }
  return n;
}

/**
 * Difficulty of a counting problem, on the same scale as difficulty():
 * moves to find, tempting wrong moves, separate areas to compare, how
 * close the best other choice is, and the size of the proof. A value
 * question grows with the value and the length of both lines.
 */
function countDifficulty(pz) {
  const first = countSolveFirstMoves(pz);
  const line = countSolutionLine(pz);
  const userMoves = line.filter((m) => m.c === pz.userColor).length;
  const wrong = Math.max(0, first.tried - first.correct.length);
  const margin = first.second === null ? 0 : Math.abs(first.target - first.second);
  const areas = countAreas(pz);
  let score;
  if (pz.ask === "value") {
    const dv = deiri(pz);
    const lines = countLine(pz, BLACK).length + countLine(pz, WHITE).length;
    score = 3 + Math.log2(1 + Math.abs(dv.value)) * 0.9 + lines * 0.45 + Math.log2(1 + first.nodes) * 0.12;
  } else {
    score = 2.4 + userMoves * 0.75 + Math.log2(1 + wrong) * 0.5 + (areas - 1) * 0.9 + (margin <= 1 ? 1.2 : margin <= 2 ? 0.6 : 0) + Math.log2(1 + first.nodes) * 0.12 - (first.correct.length - 1) * 0.8;
  }
  let grade = 1;
  if (score >= 6) grade = 2;
  if (score >= 9) grade = 3;
  if (score >= 12) grade = 4;
  if (score >= 15) grade = 5;
  return { score: Math.round(score * 10) / 10, grade, userMoves, correct: first.correct, nodes: first.nodes, exact: first.exact, line, margin };
}

/**
 * Prove a counting problem (see the header of this section): the region is
 * sealed and every stone belongs to a safe wall, every search is exact, the
 * best move beats passing, there are one to `maxCorrect` correct first
 * moves, the stored `answer`, `margin`, `value` and `choices` match the
 * proof, and the solution line is legal and keeps the best count.
 */
function countValidate(pz, { maxCorrect = 3, line = null } = {}) {
  const reasons = [];
  const c = context(pz.size);
  const st0 = initialState(pz);
  if (!everyChainBreathes(pz, st0.board)) reasons.push("a chain in the diagram has no liberties");
  countingArea(pz);
  for (const i of pz._areaList) {
    if (st0.board[i] === 0 && c.nbr[i].some((q) => !pz._area[q] && st0.board[q] === 0)) reasons.push(`point ${JSON.stringify(pointOf(pz, i))} touches a point outside the problem`);
  }
  const first = countSolveFirstMoves(pz);
  if (!first.exact) reasons.push("the counting search is not exact (an unsettled end changes the count)");
  if (!better(pz, first.target, first.passValue)) reasons.push("passing is as good as any move: nothing to play");
  if (first.correct.length < 1) reasons.push("no correct first move");
  if (first.correct.length > maxCorrect) reasons.push(`${first.correct.length} correct first moves (max ${maxCorrect})`);
  const local = (p) => `${p.x - pz.box.x0},${p.y - pz.box.y0}`;
  if (pz.ask === "move") {
    const want = (pz.answer || []).map((p) => `${p.x},${p.y}`).sort().join(" ");
    const have = first.correct.map(local).sort().join(" ");
    if (want !== have) reasons.push(`answer ${want || "(none)"} differs from the proved correct moves ${have}`);
    const margin = first.second === null ? null : Math.abs(first.target - first.second);
    if (pz.margin !== margin) reasons.push(`margin ${pz.margin} differs from the proved margin ${margin}`);
  } else if (pz.ask === "value") {
    const dv = deiri(pz);
    if (!dv.exact) reasons.push("the deiri count is not exact");
    if (pz.value !== dv.value) reasons.push(`value ${pz.value} differs from the proved deiri ${dv.value}`);
    const ch = pz.choices || [];
    if (ch.length < 3 || ch.length > 4 || new Set(ch).size !== ch.length) reasons.push("a value question needs three or four different choices");
    if (!ch.includes(dv.value)) reasons.push("the choices do not include the value");
  } else reasons.push(`unknown ask ${pz.ask}`);
  line = line || countSolutionLine(pz);
  let st = st0;
  for (const m of line) {
    if (st.toMove !== m.c) st = countPass(pz, st);
    const next = countingCandidates(pz, st).find((n) => n.i === indexOf(pz, m.x, m.y))?.next;
    if (!next) {
      reasons.push("the solution line contains an illegal move");
      break;
    }
    st = next;
  }
  if (st.toMove !== pz.userColor) st = countPass(pz, st);
  if (countStatus(pz, st) !== "won") reasons.push("the solution line does not end with the best count");
  return { ok: !reasons.length, reasons, result: "win", first, line };
}
