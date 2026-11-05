/**
 * Capture Go (吃子棋): the first player to capture any stone wins.
 *
 * A small opponent for the beginner's first games. It is pure (no DOM, no
 * state) and fast: a 9×9 board as a flat Int8Array, chains found by flood
 * fill, and a short forcing search for ladders and nets with a node budget,
 * so a move never takes more than a few milliseconds.
 *
 * What it does, in order:
 *   1. capture when it can (that wins);
 *   2. save its own stones in atari, by a move the opponent cannot ladder;
 *   3. play a forced capture it can read (a ladder, a net, a double atari);
 *   4. otherwise play reasonable shape near the action, with some
 *      randomness, avoiding moves the opponent could punish by force.
 *
 * Two levels: 1 is gentle (it reads two moves ahead and has more noise), 2
 * reads ladders to the edge and sees nets.
 *
 * A board is { size, cells: Int8Array(size*size) }, 1 = black, -1 = white,
 * 0 = empty; point p = y * size + x.
 */

const NEIGHBOURS = new Map();

function neighbours(size) {
  let nb = NEIGHBOURS.get(size);
  if (nb) return nb;
  nb = [];
  for (let p = 0; p < size * size; p++) {
    const x = p % size;
    const y = (p / size) | 0;
    const list = [];
    if (x > 0) list.push(p - 1);
    if (x < size - 1) list.push(p + 1);
    if (y > 0) list.push(p - size);
    if (y < size - 1) list.push(p + size);
    nb.push(list);
  }
  NEIGHBOURS.set(size, nb);
  return nb;
}

/** A board from a sign map (rows of 1 / -1 / 0), as the rules module keeps it. */
export function fromSignMap(signMap) {
  const size = signMap.length;
  const cells = new Int8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells[y * size + x] = signMap[y][x] || 0;
  return { size, cells };
}

/* -------------------------------------------------------------- chains */

let seen = new Int32Array(0);
let libSeen = new Int32Array(0);
let stamp = 0;

function scratch(n) {
  if (seen.length < n) {
    seen = new Int32Array(n);
    libSeen = new Int32Array(n);
    stamp = 0;
  }
  if (stamp > 2e9) {
    seen.fill(0);
    libSeen.fill(0);
    stamp = 0;
  }
  return ++stamp;
}

/** The chain through p: its stones and liberties. */
export function chainAt(board, p) {
  const { size, cells } = board;
  const nb = neighbours(size);
  const c = cells[p];
  const s = scratch(cells.length);
  const stones = [p];
  const libs = [];
  seen[p] = s;
  for (let i = 0; i < stones.length; i++) {
    for (const q of nb[stones[i]]) {
      const v = cells[q];
      if (v === c) {
        if (seen[q] !== s) {
          seen[q] = s;
          stones.push(q);
        }
      } else if (v === 0 && libSeen[q] !== s) {
        libSeen[q] = s;
        libs.push(q);
      }
    }
  }
  return { color: c, stones, libs };
}

/** Every chain on the board. */
export function chains(board) {
  const { cells } = board;
  const done = new Uint8Array(cells.length);
  const out = [];
  for (let p = 0; p < cells.length; p++) {
    if (!cells[p] || done[p]) continue;
    const ch = chainAt(board, p);
    for (const q of ch.stones) done[q] = 1;
    out.push(ch);
  }
  return out;
}

/**
 * Color c plays at p. Returns null when illegal (occupied or suicide), else
 * { captures: stones it would capture, libs: liberties of its chain after the
 * move (when it captures nothing), next: the board after the move (without
 * removing anything: in capture Go the game ends on the capture) }.
 */
export function tryMove(board, p, c) {
  const { size, cells } = board;
  if (cells[p] !== 0) return null;
  const nb = neighbours(size);
  let captures = 0;
  for (const q of nb[p]) {
    if (cells[q] === -c) {
      const ch = chainAt(board, q);
      if (ch.libs.length === 1) captures += ch.stones.length;
    }
  }
  const next = { size, cells: cells.slice() };
  next.cells[p] = c;
  if (captures) return { captures, libs: 99, next };
  const libs = chainAt(next, p).libs.length;
  if (libs === 0) return null;
  return { captures: 0, libs, next };
}

/** The points where color c captures right now, with how many stones each takes. */
export function captureMoves(board, c) {
  const out = new Map();
  for (const ch of chains(board)) {
    if (ch.color !== -c || ch.libs.length !== 1) continue;
    const p = ch.libs[0];
    out.set(p, (out.get(p) || 0) + ch.stones.length);
  }
  return out;
}

/** Does color c have any legal move? */
export function hasLegalMove(board, c) {
  for (let p = 0; p < board.cells.length; p++) if (board.cells[p] === 0 && tryMove(board, p, c)) return true;
  return false;
}

/* -------------------------------------------------------------- search */

const now = () => (globalThis.performance ? performance.now() : Date.now());

/** Out of nodes, or past the move's deadline (checked every 32 nodes). */
function spent(ctx) {
  if (++ctx.nodes > ctx.budget) return true;
  if ((ctx.nodes & 31) === 0 && ctx.deadline && now() > ctx.deadline) {
    ctx.budget = 0;
    return true;
  }
  return false;
}

/**
 * Can `att`, to move, force a capture within `depth` of its own moves? The
 * attacker's moves are ataris (and, with nets, the points next to a
 * two-liberty chain's liberties); the defender answers by extending,
 * counter-capturing or counter-atari. Running out of budget counts as "no".
 */
function attack(board, att, depth, ctx) {
  if (spent(ctx)) return false;
  const all = chains(board);
  for (const ch of all) if (ch.color === -att && ch.libs.length === 1) return true;
  if (depth <= 0) return false;
  // The attacker has a chain in atari itself: an atari that ignores it loses
  // the race; only moves that also save it are tried (the filter below).
  const cand = new Set();
  for (const ch of all) {
    // With nets: a short chain with three liberties can be blocked down to two.
    if (ctx.nets && depth >= 2 && ch.color === -att && ch.libs.length === 3 && ch.stones.length <= 3) for (const l of ch.libs) cand.add(l);
    if (ch.color !== -att || ch.libs.length !== 2) continue;
    for (const l of ch.libs) cand.add(l);
    if (ctx.nets && ch.stones.length <= 4) {
      const nb = neighbours(board.size);
      for (const l of ch.libs) for (const q of nb[l]) if (board.cells[q] === 0 && !ch.libs.includes(q)) cand.add(q);
      // The diagonal "geta" points beyond each liberty.
      for (const l of ch.libs) for (const q of diagonals(board.size, l)) if (board.cells[q] === 0) cand.add(q);
    }
  }
  for (const p of cand) {
    const r = tryMove(board, p, att);
    if (!r || r.libs === 1) continue;
    if (defend(r.next, att, depth - 1, ctx)) return true;
  }
  return false;
}

/** The defender (-att) is to move: does the attacker still capture by force? */
function defend(board, att, depth, ctx) {
  if (spent(ctx)) return false;
  const def = -att;
  const all = chains(board);
  for (const ch of all) if (ch.color === att && ch.libs.length === 1) return false;
  const atari = all.filter((ch) => ch.color === def && ch.libs.length === 1);
  const cand = new Set();
  if (atari.length) {
    for (const ch of atari) for (const l of ch.libs) cand.add(l);
  } else {
    const weak = all.filter((ch) => ch.color === def && ch.libs.length === 2);
    if (!weak.length) return false;
    for (const ch of weak) for (const l of ch.libs) cand.add(l);
    for (const ch of all) if (ch.color === att && ch.libs.length === 2) for (const l of ch.libs) cand.add(l);
  }
  for (const p of cand) {
    const r = tryMove(board, p, def);
    if (!r) continue;
    if (r.libs === 1 && atari.length) continue;
    if (!attack(r.next, att, depth, ctx)) return false;
  }
  return true;
}

const DIAG = new Map();
function diagonals(size, p) {
  let d = DIAG.get(size);
  if (!d) {
    d = [];
    for (let q = 0; q < size * size; q++) {
      const x = q % size;
      const y = (q / size) | 0;
      const list = [];
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size) list.push(ny * size + nx);
      }
      d.push(list);
    }
    DIAG.set(size, d);
  }
  return d[p];
}

/** Can `att`, to move, capture by force within `depth` moves? (for tests and hints) */
export function canForceCapture(board, att, { depth = 6, nets = true, budget = 4000 } = {}) {
  return attack(board, att, depth, { nodes: 0, budget, nets });
}

/* -------------------------------------------------------------- levels */

export const LEVELS = {
  1: { attackDepth: 1, safeDepth: 1, nets: false, budget: 300, noise: 3, safeChecks: 6 },
  2: { attackDepth: 6, safeDepth: 3, nets: true, budget: 1000, noise: 2, safeChecks: 10 },
};

/** The most a move may spend reading (ms). */
export const MOVE_MS = 25;

/** The level after `wins` capture games won by the player: gentle, then a little stronger. */
export function levelFor(wins) {
  return (wins || 0) >= 2 ? 2 : 1;
}

/* ---------------------------------------------------------------- move */

function line(size, p) {
  const x = p % size;
  const y = (p / size) | 0;
  return Math.min(x, y, size - 1 - x, size - 1 - y);
}

function distance(size, a, b) {
  return Math.max(Math.abs((a % size) - (b % size)), Math.abs(((a / size) | 0) - ((b / size) | 0)));
}

/** A quick shape score for color c at p (r = tryMove's result). */
function shapeScore(board, p, c, r, last, stones) {
  const { size, cells } = board;
  const nb = neighbours(size);
  let s = 0;
  // Liberties: room to breathe; two is thin, one is self-atari.
  s += Math.min(r.libs, 4) * 0.8;
  if (r.libs === 2) s -= 1.2;
  if (r.libs === 1) s -= 8;
  const mine = new Set();
  const theirs = new Set();
  for (const q of nb[p]) {
    if (cells[q] === c) mine.add(chainAt(board, q));
    else if (cells[q] === -c) theirs.add(chainAt(board, q));
  }
  const myKeys = new Set();
  for (const ch of mine) {
    const k = Math.min(...ch.stones);
    if (myKeys.has(k)) continue;
    myKeys.add(k);
    // Strengthen a short-of-liberties chain.
    if (ch.libs.length <= 2 && r.libs > ch.libs.length) s += 2.2;
  }
  if (myKeys.size >= 2) s += 0.9; // connect
  const theirKeys = new Set();
  for (const ch of theirs) {
    const k = Math.min(...ch.stones);
    if (theirKeys.has(k)) continue;
    theirKeys.add(k);
    const after = ch.libs.length - 1;
    if (after === 1) s += 2.0;
    else if (after === 2) s += 1.2;
    else if (after === 3) s += 0.4;
  }
  if (theirKeys.size >= 2) s += 0.9; // cut
  // Near the action.
  if (stones) {
    let d = 9;
    for (let q = 0; q < cells.length && d > 1; q++) if (cells[q]) d = Math.min(d, distance(size, p, q));
    if (d === 1) s += 1;
    else if (d === 2) s += 0.8;
    else s -= 0.3 * (d - 2);
  } else {
    // An empty board: somewhere around the centre.
    s += 2 - 0.6 * distance(size, p, (size * size - 1) / 2);
  }
  if (last != null && last >= 0 && distance(size, p, last) <= 2) s += 0.7;
  // The edge is a poor place to start a fight.
  const ln = line(size, p);
  if (ln === 0) s -= 1.6;
  else if (ln === 1 && stones < 12) s -= 0.5;
  return s;
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/**
 * The computer's move for color c: { p, x, y, why } or null when it has no
 * legal move. `why` is "capture" | "save" | "attack" | "shape" (for tests).
 * Options: level (1 | 2), last (the opponent's last point or null), rng.
 */
export function chooseCaptureMove(board, c, { level = 1, last = null, rng = Math.random } = {}) {
  const L = LEVELS[level] || LEVELS[1];
  const { size, cells } = board;
  const at = (p, why) => ({ p, x: p % size, y: (p / size) | 0, why });
  // Every read shares one deadline, so a move stays well under 50 ms.
  const deadline = now() + MOVE_MS;
  const ctx = (budget = L.budget) => ({ nodes: 0, budget, nets: L.nets, deadline });

  // 1. Capture: that wins.
  const caps = captureMoves(board, c);
  if (caps.size) {
    const best = Math.max(...caps.values());
    return at(pick([...caps].filter(([, n]) => n === best).map(([p]) => p), rng), "capture");
  }

  const all = chains(board);
  const stones = all.reduce((n, ch) => n + ch.stones.length, 0);

  // 2. Save a chain in atari (all of them are, if one move can).
  const inAtari = all.filter((ch) => ch.color === c && ch.libs.length === 1);
  if (inAtari.length) {
    const saves = [];
    for (const ch of inAtari) {
      const p = ch.libs[0];
      const r = tryMove(board, p, c);
      if (!r || r.libs < 2) continue;
      if (captureMoves(r.next, -c).size) continue; // another chain still hangs
      const doomed = attack(r.next, -c, L.safeDepth, ctx());
      saves.push({ p, r, doomed, score: shapeScore(board, p, c, r, last, stones) + ch.stones.length });
    }
    const safe = saves.filter((s) => !s.doomed);
    const from = safe.length ? safe : saves;
    if (from.length) {
      from.sort((a, b) => b.score - a.score);
      return at(from[0].p, "save");
    }
  }

  // 3. A capture it can force (ladder, net, double atari).
  const tries = new Set();
  for (const ch of all) {
    if (ch.color !== -c || ch.libs.length > 2) continue;
    for (const l of ch.libs) tries.add(l);
    if (L.nets && ch.libs.length === 2) {
      const nb = neighbours(size);
      for (const l of ch.libs) {
        for (const q of nb[l]) if (cells[q] === 0) tries.add(q);
        for (const q of diagonals(size, l)) if (cells[q] === 0) tries.add(q);
      }
    }
  }
  const wins = [];
  for (const p of tries) {
    const r = tryMove(board, p, c);
    if (!r || r.libs === 1) continue;
    if (defend(r.next, c, L.attackDepth, ctx())) wins.push(p);
  }
  if (wins.length) return at(pick(wins, rng), "attack");

  // 4. Shape near the action, with some randomness, avoiding moves the
  // opponent could punish by force.
  const scored = [];
  for (let p = 0; p < cells.length; p++) {
    if (cells[p] !== 0) continue;
    const r = tryMove(board, p, c);
    if (!r) continue;
    scored.push({ p, r, score: shapeScore(board, p, c, r, last, stones) + rng() * L.noise });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  // The opponent's threats right now (a chain of ours it can capture by force).
  for (const s of scored.slice(0, L.safeChecks)) {
    if (s.r.libs === 1) continue;
    if (captureMoves(s.r.next, -c).size) continue;
    if (!attack(s.r.next, -c, L.safeDepth, ctx())) return at(s.p, "shape");
  }
  const fallback = scored.find((s) => s.r.libs > 1) || scored[0];
  return at(fallback.p, "shape");
}
