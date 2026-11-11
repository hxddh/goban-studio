/**
 * Offline fallback opponent.
 *
 * The packaged app plays every board size with KataGo (see engine.js). This
 * module is what remains when KataGo is not there — the browser preview, or
 * a sidecar that failed to start: Moka's 9×9 net, plus local heuristics and
 * shallow playouts elsewhere. Every returned move is checked against the same
 * legality rules the player uses, positional superko included (Game.canPlay):
 * a candidate that would repeat an earlier position is never chosen, so the
 * computer neither plays an illegal move nor passes because of one.
 *
 * Knowing when to stop. The engine never plays a move that only costs it
 * points (see `pointless`): into its own eye or its own sealed territory,
 * into self-atari, or a lone stone into a small sealed area of the
 * opponent's. When nothing else is left it passes, so a finished game ends
 * as soon as the opponent passes instead of after the engine has filled in
 * its own territory.
 *
 * The search is time-sliced with setTimeout, so the board keeps painting while
 * the computer thinks. There is no worker: zero:// only loads the one classic
 * bundle, and a main-thread search with a deadline is enough for this scope.
 */
import { BLACK, WHITE, EMPTY, territoryMap } from "./rules.js";

export const LEVELS = [
  { id: 1, budget: 220, candidates: 6, playouts: 0 },
  { id: 2, budget: 420, candidates: 8, playouts: 3 },
  { id: 3, budget: 900, candidates: 8, playouts: 8 },
  { id: 4, budget: 1800, candidates: 10, playouts: 14 },
  { id: 5, budget: 3200, candidates: 12, playouts: 22 },
];

const yieldNow = () => new Promise((resolve) => setTimeout(resolve, 0));

function isEye(board, x, y, color) {
  if (board.get([x, y]) !== EMPTY) return false;
  let own = 0;
  let opp = 0;
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
    if (!board.has([nx, ny])) {
      own++;
      continue;
    }
    const v = board.get([nx, ny]);
    if (v === color) own++;
    else if (v === -color) opp++;
  }
  if (opp > 0 || own < 3) return false;
  let safeDiag = 0;
  for (const [nx, ny] of [[x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]]) {
    if (!board.has([nx, ny]) || board.get([nx, ny]) === color) safeDiag++;
  }
  return safeDiag >= 3;
}

const AROUND = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * The empty regions of the board: for every empty point, the region it
 * belongs to as { owner, size }. `owner` is the colour whose stones alone
 * seal the region (rules.js territoryMap, so the open board around a few
 * stones belongs to nobody), 0 for a region both colours touch.
 */
function emptyRegions(board, size) {
  const owners = territoryMap(board);
  const out = Array.from({ length: size }, () => Array(size).fill(null));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board.get([x, y]) !== EMPTY || out[y][x]) continue;
      const region = { owner: owners[y][x], size: 0 };
      const stack = [[x, y]];
      out[y][x] = region;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        region.size++;
        for (const [dx, dy] of AROUND) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (board.get([nx, ny]) !== EMPTY || out[ny][nx]) continue;
          out[ny][nx] = region;
          stack.push([nx, ny]);
        }
      }
    }
  }
  return out;
}

/** A sealed area of the opponent's this small has no room to live in. */
const NO_ROOM = 6;

/**
 * Would a stone of `color` at (x, y) only cost points? True for
 *
 *   - its own eye;
 *   - a self-atari that captures nothing (the stone, or the group it
 *     joins, is left with one liberty);
 *   - its own sealed territory, unless the stone rescues a neighbouring
 *     group of its own that is in atari;
 *   - a sealed area of the opponent's of at most NO_ROOM points.
 *
 * A move that captures is never pointless. `regions` is emptyRegions() of
 * the same board.
 */
function pointless(board, color, x, y, regions) {
  if (isEye(board, x, y, color)) return true;
  let next;
  try {
    next = board.makeMove(color, [x, y], { preventSuicide: true, preventOverwrite: true, preventKo: false });
  } catch (_) {
    return true;
  }
  if ((next.getCaptures(color) || 0) > (board.getCaptures(color) || 0)) return false;
  if (next.getLiberties([x, y]).length <= 1) return true;
  const region = regions[y][x];
  if (!region || !region.owner) return false;
  if (region.owner !== color) return region.size <= NO_ROOM;
  for (const [dx, dy] of AROUND) {
    const p = [x + dx, y + dy];
    if (board.has(p) && board.get(p) === color && board.getLiberties(p).length === 1) return false;
  }
  return true;
}

function legalMoves(board, color, size) {
  const out = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board.get([x, y]) !== EMPTY) continue;
      const a = board.analyzeMove(color, [x, y]);
      if (a.overwrite || a.suicide || a.ko) continue;
      out.push({ x, y });
    }
  }
  return out;
}

function groupLiberties(board, x, y) {
  if (board.get([x, y]) === EMPTY) return 0;
  return board.getLiberties([x, y]).length;
}

/** A cheap static evaluation from `color`'s point of view. */
export function evaluate(board, color, size) {
  let stones = 0;
  let liberties = 0;
  let atari = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = board.get([x, y]);
      if (!v) continue;
      if (v === color) stones++;
      else stones--;
      const lib = board.getLiberties([x, y]).length;
      if (v === color) liberties += Math.min(lib, 4) * 0.15;
      if (lib === 1) atari += v === color ? -2.2 : 2.2;
    }
  }
  let terr = 0;
  const t = territoryMap(board);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (t[y][x] === color) terr++;
      else if (t[y][x] === -color) terr--;
    }
  }
  return stones + liberties + atari + terr * 1.4 + (board.getCaptures(color) || 0) * 1.6;
}

function moveHeuristic(board, color, x, y, size, lastMove) {
  if (isEye(board, x, y, color)) return -1000;
  let score = 0;
  const next = board.makeMove(color, [x, y]);
  const captured = (next.getCaptures(color) || 0) - (board.getCaptures(color) || 0);
  score += captured * 14;
  // Atari / saved groups around the new stone.
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
    if (!next.has([nx, ny])) continue;
    const v = next.get([nx, ny]);
    if (v === 0) continue;
    const lib = next.getLiberties([nx, ny]).length;
    if (v === -color && lib === 1) score += 7;
    if (v === color && lib === 1) score -= 4;
    if (v === color && lib === 2) score += 1.5;
  }
  // Save a group that was in atari before the move.
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
    if (!board.has([nx, ny])) continue;
    if (board.get([nx, ny]) === color && groupLiberties(board, nx, ny) === 1) score += 8;
  }
  if (lastMove && !lastMove.pass) {
    const d = Math.abs(lastMove.x - x) + Math.abs(lastMove.y - y);
    if (d <= 3) score += 2.5 - d * 0.4;
  }
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (edge === 0) score -= 3;
  else if (edge === 1) score -= 0.6;
  else if (edge === 2 || edge === 3) score += 1.2;
  // Prefer the upper/right side slightly less than the centre in the opening.
  const center = (size - 1) / 2;
  score -= (Math.abs(x - center) + Math.abs(y - center)) * 0.04;
  return score;
}

function candidates(board, color, size, lastMove, limit, legal = null) {
  const list = [];
  const regions = emptyRegions(board, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board.get([x, y]) !== EMPTY) continue;
      const a = board.analyzeMove(color, [x, y]);
      if (a.overwrite || a.suicide || a.ko) continue;
      if (legal && !legal(x, y)) continue;
      if (pointless(board, color, x, y, regions)) continue;
      list.push({ x, y, score: moveHeuristic(board, color, x, y, size, lastMove) });
    }
  }
  list.sort((a, b) => b.score - a.score);
  return list.slice(0, limit);
}

function playout(board, color, size, maxMoves) {
  let b = board.clone();
  let turn = color;
  let passes = 0;
  for (let n = 0; n < maxMoves && passes < 2; n++) {
    const moves = legalMoves(b, turn, size).filter((m) => !isEye(b, m.x, m.y, turn));
    if (!moves.length) {
      turn = -turn;
      passes++;
      continue;
    }
    // A light policy: sample a small set, prefer moves near the last move and
    // captures. This is not a strong engine; it is a plausible opponent.
    let pick = moves[Math.floor(Math.random() * moves.length)];
    if (Math.random() < 0.45 && moves.length > 1) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < Math.min(7, moves.length); i++) {
        const m = moves[Math.floor(Math.random() * moves.length)];
        const score = moveHeuristic(b, turn, m.x, m.y, size, null);
        if (score > bestScore) {
          bestScore = score;
          best = m;
        }
      }
      if (best) pick = best;
    }
    const next = b.makeMove(turn, [pick.x, pick.y]);
    if (!next || next.get([pick.x, pick.y]) !== turn) {
      turn = -turn;
      passes++;
      continue;
    }
    b = next;
    turn = -turn;
    passes = 0;
  }
  let black = 0;
  let white = 0;
  const t = territoryMap(b);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = b.get([x, y]);
      if (v === BLACK) black++;
      else if (v === WHITE) white++;
      else if (t[y][x] === BLACK) black++;
      else if (t[y][x] === WHITE) white++;
    }
  }
  return color === BLACK ? black - white : white - black;
}

/**
 * Pick a move. Never mutates the game; returns {x,y} or {pass:true}.
 */
async function chooseMoka(game, level) {
  if (game.size !== 9) return null;
  const host = typeof globalThis !== "undefined" ? globalThis.GobanMoka : null;
  if (!host || typeof host.chooseMove !== "function") return null;
  try {
    return await host.chooseMove(game, { level });
  } catch (_) {
    return null;
  }
}

/**
 * Is (x, y) legal for `color` under the game's own rules? For the side to
 * move that is Game.canPlay (superko included); the board alone cannot know
 * the history.
 */
function legalFor(game, color) {
  if (color !== game.turn || game.phase !== "playing") return null;
  return (x, y) => game.canPlay(x, y).ok;
}

export async function chooseMove(game, { level = 3, color = game.turn } = {}) {
  const size = game.size;
  const legal = legalFor(game, color);
  const neural = await chooseMoka(game, level);
  // Moka knows the moves but not the app's superko rule: its pick is
  // checked like any other, and the heuristic opponent takes over if it fails.
  // Nor does it get to throw points away: a pointless pick goes to the
  // heuristics too, which pass when there is nothing worth playing.
  const board = game.board.clone();
  if (neural && (neural.pass || ((!legal || legal(neural.x, neural.y)) && !pointless(board, color, neural.x, neural.y, emptyRegions(board, size))))) return neural;
  const lastMove = game.lastMove;
  const cfg = LEVELS.find((l) => l.id === level) || LEVELS[2];
  const started = performance.now();
  const deadline = started + cfg.budget;
  const moves = candidates(board, color, size, lastMove, cfg.candidates, legal);
  if (!moves.length) return { pass: true };

  // 19x19 playouts are too expensive in a WebView; use the heuristic list and
  // a short lookahead. The result is a beginner-friendly move, which is the
  // product's target, not a claim of engine strength.
  if (size >= 19 || cfg.playouts === 0) {
    return pickWeighted(moves, level);
  }

  let best = moves[0];
  let bestValue = -Infinity;
  let playouts = 0;
  const maxMoves = size <= 9 ? 110 : 150;
  const perCandidate = cfg.playouts;
  for (const m of moves) {
    let value = m.score;
    for (let i = 0; i < perCandidate; i++) {
      if (performance.now() > deadline) break;
      const after = board.makeMove(color, [m.x, m.y]);
      value += playout(after, -color, size, maxMoves) / Math.max(1, perCandidate) * 0.9;
      playouts++;
      if (playouts % 4 === 0) await yieldNow();
    }
    if (value > bestValue) {
      bestValue = value;
      best = m;
    }
    if (performance.now() > deadline) break;
    await yieldNow();
  }
  // A little randomness at the lower levels keeps the opponent from feeling
  // like a lookup table; the top level always takes its best result.
  if (level <= 2 && moves.length > 1 && Math.random() < 0.35) {
    return moves[1 + Math.floor(Math.random() * Math.min(3, moves.length - 1))];
  }
  return { x: best.x, y: best.y };
}

function pickWeighted(moves, level) {
  const n = level <= 1 ? Math.min(5, moves.length) : level === 2 ? Math.min(3, moves.length) : 1;
  const pick = moves[Math.floor(Math.random() * n)];
  return { x: pick.x, y: pick.y };
}

