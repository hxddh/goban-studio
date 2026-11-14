/**
 * Choosing the computer's move from an engine's analysis: a candidate
 * weighted by the opponent's strength (pickCandidate, moveFromAnalysis),
 * the human-style network's policy (humanMoveFromAnalysis), and the
 * gentlest opponent's own move (beginnerMove). Pure functions of their
 * arguments; engine.js asks the engines and re-exports these.
 */
import { BLACK, EMPTY } from "./rules.js";

function sample(list, weight, rnd) {
  const total = list.reduce((s, m) => s + weight(m), 0);
  if (!(total > 0)) return list[0];
  let r = rnd() * total;
  for (const m of list) {
    r -= weight(m);
    if (r <= 0) return m;
  }
  return list[list.length - 1];
}

/** Score lead from the mover's point of view. */
function moverLead(move, color) {
  return color === BLACK ? move.scoreLead : -move.scoreLead;
}

/**
 * Choose among KataGo's candidates for a strength level. Exported for the
 * test suite.
 */
export function pickCandidate(analysis, color, strength, rnd = Math.random) {
  let moves = analysis.moves.filter((m) => (m.visits || 0) > 0 && Number.isFinite(m.scoreLead));
  if (!moves.length) return analysis.play;
  // Pass only when it is the engine's own first choice: a weak level may
  // misjudge a fight, but it never gives up a turn at random.
  if (moves[0].pass) return { pass: true };
  moves = moves.filter((m) => !m.pass);
  const best = Math.max(...moves.map((m) => moverLead(m, color)));
  if (strength.temp === 0) return toMove(moves[0]);
  let pool = moves.filter((m) => best - moverLead(m, color) <= strength.maxLoss);
  if (!pool.length) pool = [moves[0]];
  // A deliberate slip: the weakest levels sometimes take a candidate outside
  // the loss window, like a beginner who misses the point.
  if (strength.slip > 0 && rnd() < strength.slip && moves.length > pool.length) {
    pool = moves.filter((m) => !pool.includes(m));
  }
  const pick = sample(pool, (m) => Math.pow(Math.max(1, m.visits), 1 / strength.temp), rnd);
  return toMove(pick);
}

/**
 * A move a beginner might play without reading: a legal point near the
 * stones already on the board, most often near the opponent's last move,
 * never filling one of its own eyes. KataGo's candidates are all moves a
 * strong network finds plausible, so choosing among them alone cannot play
 * below single-digit kyu; this is what lets the lowest levels really be
 * beginners (docs/strength.md). Exported for the test suite.
 */
export function beginnerMove(game, rnd = Math.random) {
  const size = game.size;
  const board = game.board;
  const color = game.turn;
  const last = game.current.move && !game.current.move.pass ? game.current.move : null;
  const stones = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (board.get([x, y]) !== EMPTY) stones.push([x, y]);
  const lo = size >= 13 ? 2 : 1;
  const hi = size - 1 - lo;
  const weights = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board.get([x, y]) !== EMPTY || ownEye(board, x, y, color, size)) continue;
      let w = 0;
      // Opening: the third and fourth lines, like every beginner's book.
      if (stones.length < 4 && x >= lo && x <= hi && y >= lo && y <= hi && (x <= lo + 1 || x >= hi - 1 || y <= lo + 1 || y >= hi - 1)) w = 1;
      for (const [sx, sy] of stones) {
        if (Math.max(Math.abs(sx - x), Math.abs(sy - y)) <= 2) {
          w = Math.max(w, 1);
          break;
        }
      }
      if (last && Math.max(Math.abs(last.x - x), Math.abs(last.y - y)) <= 2) w = 4;
      if (w && (x === 0 || y === 0 || x === size - 1 || y === size - 1)) w *= 0.3;
      weights[y * size + x] = w;
    }
  }
  // Sample, then check legality (cheaper than testing every point for ko).
  for (let tries = 0; tries < 12; tries++) {
    let total = 0;
    for (const w of weights) total += w;
    if (!(total > 0)) return null;
    let r = rnd() * total;
    let i = 0;
    for (; i < weights.length - 1; i++) {
      r -= weights[i];
      if (r <= 0 && weights[i] > 0) break;
    }
    const x = i % size;
    const y = Math.floor(i / size);
    if (weights[i] > 0 && game.canPlay(x, y).ok) return { x, y };
    weights[i] = 0;
  }
  return null;
}

/** A point whose every neighbour is the player's own stone or the edge. */
function ownEye(board, x, y, color, size) {
  for (const [nx, ny] of [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]) {
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (board.get([nx, ny]) !== color) return false;
  }
  return true;
}

export function toMove(m) {
  if (!m) return { pass: true };
  return m.pass ? { pass: true } : { x: m.x, y: m.y };
}

function legal(game, move) {
  if (!move || move.pass) return true;
  return game.canPlay(move.x, move.y).ok;
}

/**
 * The move a strength level plays from a finished KataGo search: the
 * level's pick, or KataGo's own choice when the pick is illegal under the
 * app's rules (superko). Null when neither is legal. Exported so the
 * calibration harness (scripts/calibrate-strength.mjs) measures exactly
 * what players get.
 */
export function moveFromAnalysis(game, analysis, strength, rnd = Math.random) {
  // A beginner's move now and then, except when KataGo would pass (the
  // game is over; a stray move then only drags it out).
  const top = analysis.moves?.[0];
  if (strength.blunder > 0 && !top?.pass && rnd() < strength.blunder) {
    const b = beginnerMove(game, rnd);
    if (b) return b;
  }
  let move = pickCandidate(analysis, game.turn, strength, rnd);
  if (!legal(game, move)) move = analysis.play;
  return legal(game, move) ? move : null;
}

/**
 * A human-style move from the human SL process's report: KataGo's own
 * choice (`play`, made with humanSLChosenMoveProp = 1, so it is the human
 * model's move except that KataGo's search decides when to pass), or a
 * beginner's move for the levels below the model's 20-kyu floor. Falls back
 * to KataGo's top candidate when the choice is illegal under the app's
 * superko rule. Exported for the tests and the calibration harness.
 */
export function humanMoveFromAnalysis(game, analysis, human, rnd = Math.random) {
  const top = analysis.moves?.[0];
  if (human.blunder > 0 && !top?.pass && rnd() < human.blunder) {
    const b = beginnerMove(game, rnd);
    if (b) return b;
  }
  let move = analysis.play;
  if (!legal(game, move) && top) move = toMove(top);
  return legal(game, move) ? move : null;
}
