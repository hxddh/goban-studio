/**
 * Moka 9×9 neural opponent, loaded as an ES module beside the classic app
 * bundle. The model is Moka v2.1, a 244,529-parameter INT8 policy/value
 * network distilled from KataGo b18 (MIT, see LICENSE and
 * THIRD_PARTY_NOTICES.md). It is used
 * only on 9×9; 13×13 and 19×19 stay on the local heuristic engine.
 *
 * The worker keeps inference off the UI thread. If a WebView cannot start a
 * module worker, the import or the model fails, ai.js falls back silently to
 * the heuristic opponent. Nothing here is required for the game to work.
 */
import {
  GoModelWorkerClient,
  createGameState,
  encodeStudentFeatures,
  getLegalMoves,
  playMove,
} from "./index.js";

let client = null;
let starting = null;
let unavailable = false;

function initialize() {
  if (starting) return starting;
  starting = (async () => {
    const worker = new Worker(new URL("worker.js", import.meta.url), { type: "module" });
    const next = new GoModelWorkerClient(worker);
    await next.initialize({
      manifestUrl: new URL("go-model.json", import.meta.url).href,
      weightsUrl: new URL("go-model.bin", import.meta.url).href,
    });
    client = next;
    return next;
  })().catch((error) => {
    console.warn("Moka 9×9 engine unavailable; using the heuristic opponent.", error);
    unavailable = true;
    throw error;
  });
  return starting;
}

function stateFor(game) {
  if (!game || game.size !== 9 || game.handicap > 0) return null;
  // Setup stones are not part of Moka's move history.
  if (game.root.board.signMap.flat().some((value) => value !== 0)) return null;
  // v13: nor is a record's mid-game setup (rules.js node.setup).
  let state = createGameState();
  for (const node of game.path.slice(1)) {
    if (node.setup) return null;
    const move = node.move;
    if (!move) continue;
    const index = move.pass ? 81 : move.y * 9 + move.x;
    const next = playMove(state, index);
    if (!next) return null;
    state = next;
  }
  if (state.nextColor !== game.turn) return null;
  return state;
}

export async function ensure() {
  if (client) return client;
  if (unavailable) return null;
  try {
    return await initialize();
  } catch (_) {
    return null;
  }
}

export async function chooseMove(game, { level = 3 } = {}) {
  if (game?.size !== 9) return null;
  const model = await ensure();
  if (!model) return null;
  const state = stateFor(game);
  if (!state) return null;
  try {
    const inference = await model.infer(encodeStudentFeatures(state));
    const legal = getLegalMoves(state);
    if (!legal.length) return { pass: true };
    const ordered = legal
      .map((move) => ({ move, score: inference.policyLogits[move] ?? -Infinity }))
      .sort((a, b) => b.score - a.score);
    // Easy levels sample a little among the top policy moves so the opponent
    // is not a deterministic lookup table; the stronger levels take the best.
    const width = level <= 1 ? 3 : level === 2 ? 2 : 1;
    const pick = ordered[Math.floor(Math.random() * Math.min(width, ordered.length))].move;
    return pick === 81 ? { pass: true } : { x: pick % 9, y: Math.floor(pick / 9) };
  } catch (error) {
    console.warn("Moka inference failed; using the heuristic opponent.", error);
    return null;
  }
}

export const engine = "Moka 9×9";

if (typeof window !== "undefined") {
  window.GobanMoka = { chooseMove, ensure, engine };
}
