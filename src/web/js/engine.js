/**
 * The one engine interface the app talks to.
 *
 *   decide(game, opponent)      the opponent's move at a rank (opponents.js)
 *   hint(game)                  the best move and its line, for the learner
 *   analyzeNode(game, node)     win rate, score lead and best line (review)
 *   deadStones(game)            stones KataGo considers dead (scoring)
 *
 * In the packaged app every call goes to KataGo, on every board size. When
 * KataGo is not available (the browser preview, or a sidecar that failed to
 * start) the calls fall back to Moka on 9×9 and the local heuristics
 * elsewhere, and `info()` says so, so the UI never presents a fallback as
 * the real thing.
 *
 * One opponent axis. The player chooses a rank; `levelFor(rank,
 * installed())` (opponents.js) names the implementation that measured
 * closest with the networks installed — human-style where it measured
 * well, the stronger network at the top, the standard ladder otherwise —
 * and `decide` plays it. With the stronger network installed, analysis,
 * review, hints and scoring use it. Every optional path falls back to the
 * shipped network when its process cannot answer.
 */
import { BLACK, EMPTY } from "./rules.js";
import * as KataGo from "./katago.js";
import { chooseMove as chooseLocal, evaluate as evaluateLocal } from "./ai.js";
import { scheduler } from "./scheduler.js";
import { impl, implLabel, ladder as ladderOf, levelFor } from "./opponents.js";

export { STRENGTHS, calibrated, IMPLS, RANKS, impl, implLabel, implTheta, ladder, levelFor, measured, nearest } from "./opponents.js";

/** Search budget of a human-style move in "raw" style (passes only). */
export const HUMAN_VISITS = 40;
/**
 * Analysis with the stronger network uses this share of the visits asked
 * for: it is several times slower per visit on a laptop CPU and much
 * stronger per visit, and the review should not get slower for it.
 */
export const STRONG_VISIT_SCALE = 0.5;

/** Display parts of a rank (rating.js encoding): 12 → 12 kyu, -3 → 4 dan. */
export function rankParts(rank) {
  const r = Math.round(Number(rank));
  return r > 0 ? { n: r, unit: "kyu" } : { n: 1 - r, unit: "dan" };
}

/**
 * Suggested handicap for a player of `playerRank` against an opponent that
 * plays at `opponentRank` (the measured rank shown) on a board of `size`.
 * One stone per rank on 19×19, scaled down on smaller boards; komi 0.5
 * whenever stones are given.
 */
export function suggestHandicap(playerRank, opponentRank, size) {
  if (playerRank == null || !Number.isFinite(Number(opponentRank))) return 0;
  const diff = playerRank - Number(opponentRank);
  if (diff <= 0) return 0;
  const perStone = size === 19 ? 1 : size === 13 ? 2.5 : 5;
  const stones = Math.floor(diff / perStone);
  if (stones < 2) return 0;
  return Math.min(size === 9 ? 5 : 9, stones);
}

/**
 * One search at a time, by priority (scheduler.js): the computer's move
 * first, then what the player is looking at, then pondering, then batch
 * work. The sidecar supersedes a running search with a new one, so nothing
 * else may reach KataGo. Every call takes `{ signal, lane }`; a caller that
 * no longer wants its result aborts its signal, and a search still queued
 * then never runs.
 */
export { LANES } from "./scheduler.js";
export const sched = scheduler;

/**
 * @typedef {object} SearchOptions
 * @property {AbortSignal} [signal] aborted when the result is no longer wanted
 * @property {string} [lane] the scheduler lane (scheduler.js LANES)
 * @property {any} [node] the position searched (default: the game's current node)
 * @property {number} [visits] the search budget
 * @property {(info: any) => void} [onInfo] partial results of a live search
 */
/**
 * One queued search as { analysis, cancelled }. `cancelled` is true when
 * the search was stopped (its signal, cancel(), quitting) rather than
 * answered: a null analysis then says nothing about the engine, and the
 * position it was for is no longer wanted.
 */
async function searchQ(game, opts = {}) {
  const { lane = "background", signal = null, ...rest } = opts;
  const status = { cancelled: false };
  const analysis = await scheduler.search((sig) => KataGo.analyze(game, { ...rest, signal: sig }), { lane, signal, preemptible: KataGo.canCancel(), status });
  return { analysis, cancelled: status.cancelled || !!signal?.aborted };
}

/**
 * An analysis search on the analysis engine (the stronger network when it is
 * installed, with scaled visits), falling back to the shipped network when
 * that process cannot answer. A cancelled search is neither a failure of
 * the stronger process nor a reason to search the same position again.
 */
async function analysisR(game, opts = {}) {
  const engine = analysisEngine();
  if (engine === "standard") return searchQ(game, opts);
  const first = await searchQ(game, { ...opts, engine, visits: scaledVisits(opts.visits ?? 64, engine) });
  if (first.cancelled) return { analysis: null, cancelled: true };
  if (first.analysis) {
    strongAnswered();
    return first;
  }
  strongFailed();
  return searchQ(game, opts);
}
const analysisQ = (game, opts = {}) => analysisR(game, opts).then((r) => r.analysis);

let cached = null;
export async function info() {
  if (cached) return cached;
  const st = await KataGo.status();
  cached = st?.available
    ? { kind: "katago", name: st.version || "KataGo", available: true }
    : { kind: "offline", name: "", available: false };
  return cached;
}

/* ------------------------------------------------- optional networks */

/**
 * Which optional networks are installed. Set by the models controller
 * (app/models-ctl.js) from the host's status; all false until then.
 */
const models = { strong: false, human: false };
/**
 * Consecutive failures of the strong process. After two, the standard one
 * is used instead, but not for good: STRONG_RETRY_MS after the last
 * failure the strong process is tried again, and any answer from it clears
 * the count. Only a search that ran and came back empty is a failure; a
 * cancelled one is not (see searchQ).
 */
let strongFailures = 0;
let strongFailedAt = 0;
/** How long the strong process rests after two failures in a row. */
export const STRONG_RETRY_MS = 2 * 60 * 1000;

function strongFailed() {
  strongFailures++;
  strongFailedAt = Date.now();
}

function strongAnswered() {
  strongFailures = 0;
}

/** @param {{ strong?: boolean, human?: boolean }} [installed] */
export function setModels({ strong, human } = {}) {
  if (strong !== undefined) {
    if (strong && !models.strong) strongFailures = 0;
    models.strong = !!strong;
  }
  if (human !== undefined) models.human = !!human;
}

export function modelsState(now = Date.now()) {
  const resting = strongFailures >= 2 && now - strongFailedAt < STRONG_RETRY_MS;
  return { ...models, strongUsable: models.strong && !resting };
}

/** The process for analysis, review, hints and scoring. */
export function analysisEngine(m = modelsState()) {
  return m.strong && m.strongUsable !== false ? "strong" : "standard";
}

/** Visits to ask of `engine` for an analysis the app sizes for the shipped network. */
export function scaledVisits(visits, engine) {
  return engine === "strong" ? Math.max(1, Math.round(visits * STRONG_VISIT_SCALE)) : visits;
}

/**
 * What the opponent ladder can reach now (opponents.js `installed`): the
 * human-style network when installed, the stronger one while its process
 * answers. Pure; `m` is for the tests.
 */
export function installed(m = modelsState()) {
  return { human: !!m.human, strong: !!m.strong && m.strongUsable !== false };
}

/** The ladder as the player can choose it now (opponents.js ladder). */
export function currentLadder() {
  return ladderOf(installed());
}

/** What plays `rank` now: { rank, label, impl } (opponents.js levelFor). */
export function opponentFor(rank) {
  return levelFor(rank, installed());
}

/**
 * The implementation that plays an opponent `{ rank, impl }` (or a bare
 * rank) with `inst`: its own implementation while that can play, else
 * what plays its rank.
 * @param {any} opp
 * @param {{ human?: boolean, strong?: boolean }} [inst]
 */
export function resolveOpponent(opp, inst = installed()) {
  const o = opp && typeof opp === "object" ? opp : { rank: opp };
  const it = o.impl ? impl(o.impl) : null;
  const can = it && (it.kind === "standard" || (it.kind === "human" && inst.human) || (it.kind === "strong" && inst.strong));
  if (can) return it;
  const rank = Number.isFinite(Number(o.rank)) ? Number(o.rank) : it ? implLabel(it.id) : undefined;
  return impl(levelFor(rank, inst).impl);
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

function toMove(m) {
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

/** The human SL process's search request for a level (katago.js options). */
export function humanRequest(human) {
  const style = human.style === "search" ? "search" : "raw";
  return { engine: "human", profile: human.profile, humanStyle: style, visits: human.visits ?? HUMAN_VISITS };
}

/**
 * The computer's move plus the search behind it, so the caller can judge
 * the position (teaching warnings, resignation, "shall we count?") and pace
 * its reply. `opponent` is `{ rank, impl }` (what the game was started
 * with) or a bare rank. `analysis` is null when KataGo is not available.
 * `impl` names the implementation that chose the move, and `mode` its kind
 * ("human", "strong", "standard", or "offline" for the local fallback).
 * When an optional process cannot answer, the nearest standard level plays
 * the move (and `impl` says so).
 *
 * A search that was cancelled (the signal, or cancel(): the player took
 * the move back, started another game) ends the decision there: the result
 * has no move and `cancelled: true`. Nothing else is searched and the
 * offline engine is not asked, because the position is no longer wanted.
 * @param {any} game
 * @param {any} opponent
 * @param {SearchOptions} [opts]
 */
export async function decide(game, opponent, { signal, lane = "move", node = game.current } = {}) {
  const inst = installed();
  let it = resolveOpponent(opponent, inst);
  const rank = opponent && typeof opponent === "object" && Number.isFinite(Number(opponent.rank)) ? Number(opponent.rank) : Number.isFinite(Number(opponent)) ? Number(opponent) : implLabel(it.id);
  if (it.kind === "human") {
    const { analysis, cancelled } = await searchQ(game, { ...humanRequest(it.level.human), node, signal, lane });
    if (cancelled) return { move: null, analysis: null, mode: "human", impl: it.id, cancelled: true };
    const move = analysis && humanMoveFromAnalysis(game, analysis, it.level.human);
    if (move) return { move, analysis, mode: "human", impl: it.id };
    // The human process could not answer: what plays the rank without it.
    it = impl(levelFor(rank, { strong: inst.strong }).impl);
  }
  if (it.kind === "strong") {
    const { analysis, cancelled } = await searchQ(game, { visits: it.level.strong.visits, engine: "strong", node, signal, lane });
    if (cancelled) return { move: null, analysis: null, mode: "strong", impl: it.id, cancelled: true };
    if (analysis) strongAnswered();
    else strongFailed();
    const move = analysis && moveFromAnalysis(game, analysis, it.level);
    if (move) return { move, analysis, mode: "strong", impl: it.id };
    it = impl(levelFor(rank, {}).impl);
  }
  const { analysis, cancelled } = await searchQ(game, { visits: it.level.visits, node, signal, lane });
  if (cancelled) return { move: null, analysis: null, mode: "standard", impl: it.id, cancelled: true };
  if (analysis) {
    const move = moveFromAnalysis(game, analysis, it.level);
    if (move) return { move, analysis, mode: "standard", impl: it.id };
  }
  const move = await chooseLocal(game, { level: it.level.local, color: game.turn });
  return { move, analysis: null, mode: "offline", impl: it.id };
}

/**
 * The offline engine's move (ai.js) at the local level of what plays
 * `opponent` here: the computer's move when the search could not give one
 * (app/play-ctl.js falls back to it before it offers Retry).
 */
export async function offlineMove(game, opponent) {
  const it = resolveOpponent(opponent, installed());
  const std = it.kind === "standard" ? it : impl(levelFor(implLabel(it.id), {}).impl);
  return chooseLocal(game, { level: std?.level?.local ?? 3, color: game.turn });
}

/**
 * A quick look at the position (for teaching mode and the eval bar): pondering.
 * @param {any} game
 * @param {SearchOptions} [opts]
 */
export async function evaluate(game, { node = game.current, visits = 48, signal, lane = "live" } = {}) {
  return analysisQ(game, { node, visits, signal, lane });
}

/**
 * Live analysis of the position on screen (review, explorer), with partial results.
 * @param {any} game
 * @param {any} node
 * @param {SearchOptions} [opts]
 */
export async function live(game, node, { visits = 240, onInfo, signal, lane = "interactive" } = {}) {
  return analysisQ(game, { node, visits, onInfo, signal, lane });
}

/**
 * Stop the searches of the play view (the computer's move, hints, counting,
 * pondering and the position on screen): queued ones never run, a running
 * one is cancelled. Background work (reviews, reports) carries on; it is
 * stopped through its owner (scheduler.js cancelOwner).
 */
export function cancel() {
  scheduler.cancelLanes(["move", "interactive", "live"]);
}

export async function chooseMove(game, opponent, opts = {}) {
  // Never resign, never pass early while the board is open: KataGo's own
  // choice is a pass only when the game is really over.
  const { move, impl: played, cancelled } = await decide(game, opponent, opts);
  if (move || cancelled) return move;
  const std = impl(played)?.kind === "standard" ? impl(played) : impl(levelFor(implLabel(played), {}).impl);
  return chooseLocal(game, { level: std.level.local, color: game.turn });
}

/**
 * The engine's suggestion for the side to move, with a short line (the player waits on it).
 * @param {any} game
 * @param {SearchOptions} [opts]
 */
export async function hint(game, { signal, lane = "move", node = game.current } = {}) {
  // The position asked about, fixed now (a queued search would otherwise read the board when it runs).
  const { analysis, cancelled } = await analysisR(game, { node, visits: 200, signal, lane });
  if (analysis?.moves?.length) {
    const top = analysis.moves[0];
    return { ...toMove(top), pv: top.pv || [], source: "katago" };
  }
  // Cancelled, or the board moved on meanwhile (an undo): no answer for a position no longer wanted.
  if (cancelled || game.current !== node) return null;
  const move = await chooseLocal(game, { level: 4, color: game.turn });
  return { ...move, pv: [], source: "offline" };
}

/**
 * Review data for one position: Black-POV win rate and score lead, and the
 * best move with its line. `visits` trades accuracy for speed.
 * @param {any} game
 * @param {any} node
 * @param {number} [visits]
 * @param {SearchOptions} [opts]
 */
export async function analyzeNode(game, node, visits = 48, { signal, lane = "background" } = {}) {
  const a = await analysisQ(game, { node, visits, signal, lane });
  if (a && a.moves.length) {
    const top = a.moves[0];
    return {
      source: "katago",
      winrate: top.winrate,
      scoreLead: top.scoreLead,
      best: toMove(top),
      pv: top.pv || [],
      moves: a.moves,
      ownership: a.ownership,
    };
  }
  return null;
}

/** Offline stand-in for analyzeNode: a heuristic score estimate. */
export function estimateNode(game, node) {
  // White's points for nothing on the board: komi, plus the handicap
  // compensation under Chinese rules (0 otherwise). The board heuristic is
  // a rough balance either way; area and territory scores differ by little
  // more than the captures.
  const lead = evaluateLocal(node.board, BLACK, game.size) - game.komi - (game.handicapCompensation || 0);
  return { source: "estimate", winrate: 1 / (1 + Math.exp(-lead / 8)), scoreLead: lead, best: null, pv: [], ownership: null };
}

/**
 * Dead stones at the end of the game, from KataGo's ownership. A stone is
 * dead when the area under it clearly belongs to the other colour. Returns
 * [] when the engine is unavailable; the player marks stones by hand then.
 * @param {any} game
 * @param {SearchOptions} [opts]
 */
export async function deadStones(game, { signal, lane = "interactive", node = game.current } = {}) {
  const a = await analysisQ(game, { node, visits: 160, signal, lane });
  if (!a?.ownership) return { stones: [], source: "manual" };
  return { stones: deadFromOwnership(node.board, a.ownership), source: "katago", ownership: a.ownership };
}

/**
 * The dead stones of a finished board from KataGo's ownership (Black's
 * point of view, row-major), decided chain by chain: a chain is dead when
 * the mean ownership under it clearly belongs to the other colour, so a
 * chain is never split into dead and living stones. Seki stones (ownership
 * near zero) live; a stone left in atari inside the other side's area is
 * dead. Exported for the tests.
 */
export function deadFromOwnership(board, ownership, threshold = 0.45) {
  const size = board.width;
  const seen = new Set();
  const dead = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = board.get([x, y]);
      if (v === EMPTY || seen.has(y * size + x)) continue;
      const chain = board.getChain([x, y]);
      let sum = 0;
      for (const [cx, cy] of chain) {
        seen.add(cy * size + cx);
        sum += ownership[cy * size + cx];
      }
      if (v * (sum / chain.length) < -threshold) for (const [cx, cy] of chain) dead.push({ x: cx, y: cy });
    }
  }
  return dead.sort((p, q) => p.y - q.y || p.x - q.x);
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
