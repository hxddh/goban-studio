/**
 * The one engine interface the app talks to.
 *
 *   chooseMove(game, strength)  the opponent's move at a rank-like strength
 *   hint(game)                  the best move and its line, for the learner
 *   analyzeNode(game, node)     win rate, score lead and best line (review)
 *   deadStones(game)            stones KataGo considers dead (scoring)
 *
 * In the packaged app every call goes to KataGo, on every board size. When
 * KataGo is not available (the browser preview, or a sidecar that failed to
 * start) the calls fall back to Moka on 9×9 and the local heuristics
 * elsewhere, and `info()` says so, so the UI never presents a fallback as
 * the real thing.
 */
import { BLACK, WHITE, EMPTY } from "./rules.js";
import * as KataGo from "./katago.js";
import { chooseMove as chooseLocal, evaluate } from "./ai.js";

/**
 * Strength ladder. Ranks are honest approximations for the bundled b6c96
 * network: weaker levels search less and choose among the candidate moves
 * KataGo considered, never a move that loses more than `maxLoss` points
 * (except the occasional deliberate slip at the weakest levels).
 */
export const STRENGTHS = [
  { id: "30k", rank: 30, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, local: 1 },
  { id: "25k", rank: 25, visits: 10, temp: 1.6, maxLoss: 28, slip: 0.2, local: 1 },
  { id: "20k", rank: 20, visits: 14, temp: 1.3, maxLoss: 18, slip: 0.12, local: 2 },
  { id: "15k", rank: 15, visits: 20, temp: 1.0, maxLoss: 11, slip: 0.06, local: 3 },
  { id: "10k", rank: 10, visits: 32, temp: 0.7, maxLoss: 6, slip: 0.02, local: 4 },
  { id: "5k", rank: 5, visits: 64, temp: 0.45, maxLoss: 3.5, slip: 0, local: 5 },
  { id: "1k", rank: 1, visits: 160, temp: 0.2, maxLoss: 1.5, slip: 0, local: 5 },
  { id: "2d", rank: -2, visits: 500, temp: 0, maxLoss: 0, slip: 0, local: 5 },
];

export function strengthById(id) {
  return STRENGTHS.find((s) => s.id === id) || STRENGTHS[1];
}

/** Display a rank: 25k → "25 级", 2d → "2 段" (via i18n keys). */
export function rankParts(id) {
  const s = strengthById(id);
  return s.rank > 0 ? { n: s.rank, unit: "kyu" } : { n: 1 - s.rank, unit: "dan" };
}

/**
 * Suggested handicap for a player of `playerRank` against `strengthId` on a
 * board of `size`. One stone per rank on 19×19, scaled down on smaller
 * boards; komi 0.5 whenever stones are given.
 */
export function suggestHandicap(playerRank, strengthId, size) {
  if (playerRank == null) return 0;
  const diff = playerRank - strengthById(strengthId).rank;
  if (diff <= 0) return 0;
  const perStone = size === 19 ? 1 : size === 13 ? 2.5 : 5;
  const stones = Math.floor(diff / perStone);
  if (stones < 2) return 0;
  return Math.min(size === 9 ? 5 : 9, stones);
}

let cached = null;
export async function info() {
  if (cached) return cached;
  const st = await KataGo.status();
  cached = st?.available
    ? { kind: "katago", name: st.version || "KataGo", available: true }
    : { kind: "offline", name: "", available: false };
  return cached;
}

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
  const moves = analysis.moves.filter((m) => (m.visits || 0) > 0 && Number.isFinite(m.scoreLead));
  if (!moves.length) return analysis.play;
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

function toMove(m) {
  if (!m) return { pass: true };
  return m.pass ? { pass: true } : { x: m.x, y: m.y };
}

function legal(game, move) {
  if (!move || move.pass) return true;
  return game.canPlay(move.x, move.y).ok;
}

export async function chooseMove(game, strengthId) {
  const strength = strengthById(strengthId);
  const analysis = await KataGo.analyze(game, { visits: strength.visits });
  if (analysis) {
    // Never resign, never pass early while the board is open: KataGo's own
    // choice is a pass only when the game is really over.
    let move = pickCandidate(analysis, game.turn, strength);
    if (!legal(game, move)) move = analysis.play;
    if (legal(game, move)) return move;
  }
  return chooseLocal(game, { level: strength.local, color: game.turn });
}

/** The engine's suggestion for the side to move, with a short line. */
export async function hint(game) {
  const analysis = await KataGo.analyze(game, { visits: 200 });
  if (analysis?.moves?.length) {
    const top = analysis.moves[0];
    return { ...toMove(top), pv: top.pv || [], source: "katago" };
  }
  const move = await chooseLocal(game, { level: 4, color: game.turn });
  return { ...move, pv: [], source: "offline" };
}

/**
 * Review data for one position: Black-POV win rate and score lead, and the
 * best move with its line. `visits` trades accuracy for speed.
 */
export async function analyzeNode(game, node, visits = 48) {
  const a = await KataGo.analyze(game, { node, visits });
  if (a && a.moves.length) {
    const top = a.moves[0];
    return {
      source: "katago",
      winrate: top.winrate,
      scoreLead: top.scoreLead,
      best: toMove(top),
      pv: top.pv || [],
      ownership: a.ownership,
    };
  }
  return null;
}

/** Offline stand-in for analyzeNode: a heuristic score estimate. */
export function estimateNode(game, node) {
  const lead = evaluate(node.board, BLACK, game.size) - game.komi;
  return { source: "estimate", winrate: 1 / (1 + Math.exp(-lead / 8)), scoreLead: lead, best: null, pv: [], ownership: null };
}

/**
 * Dead stones at the end of the game, from KataGo's ownership. A stone is
 * dead when the area under it clearly belongs to the other colour. Returns
 * [] when the engine is unavailable; the player marks stones by hand then.
 */
export async function deadStones(game) {
  const a = await KataGo.analyze(game, { visits: 160 });
  if (!a?.ownership) return { stones: [], source: "manual" };
  const size = game.size;
  const signMap = game.board.signMap;
  const dead = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = signMap[y][x];
      if (v === EMPTY) continue;
      const own = a.ownership[y * size + x];
      if ((v === BLACK && own < -0.45) || (v === WHITE && own > 0.45)) dead.push({ x, y });
    }
  }
  return { stones: dead, source: "katago", ownership: a.ownership };
}

/** Coarse location name for a point, for review sentences. */
export function areaOf(x, y, size) {
  const third = size / 3;
  const col = x < third ? "left" : x >= size - third ? "right" : "center";
  const row = y < third ? "top" : y >= size - third ? "bottom" : "center";
  if (row === "center" && col === "center") return "center";
  if (row === "center") return col;
  if (col === "center") return row;
  return `${row}-${col}`;
}
