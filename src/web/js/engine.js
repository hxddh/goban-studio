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
 *
 * v5: optional networks (models.js). With the stronger network installed,
 * analysis, review, hints, scoring and the top level use it; with the human
 * SL model installed and `settings.humanStyle` on, the opponent plays like a
 * human of its level (`opponentMode`). Every optional path falls back to the
 * shipped network when its process cannot answer.
 */
import { BLACK, WHITE, EMPTY } from "./rules.js";
import * as KataGo from "./katago.js";
import { chooseMove as chooseLocal, evaluate as evaluateLocal } from "./ai.js";

/**
 * Strength ladder, calibrated by self-play and against KataGo's human SL
 * model (docs/strength.md, scripts/calibrate-strength.mjs). IDs are stable
 * (saved settings and games refer to them) even where the measured label
 * differs; `rank` is the measured 19×19 label (kyu > 0, 0 = 1 dan,
 * -1 = 2 dan …), shown as "≈". The weakest level measured below the
 * scale's floor (≈34 kyu, extrapolated) and is shown as 30 kyu.
 *
 *   visits   KataGo's search budget
 *   maxLoss  choose only among candidates within this many points of the best
 *   temp     how widely to sample those candidates (0 = always the best)
 *   slip     chance of taking a searched candidate outside the window
 *   blunder  chance of a beginner's move instead (see beginnerMove): the
 *            lever for every level below ≈ 2 kyu, since even KataGo's worst
 *            candidates are moves a strong network finds plausible
 *   local    offline fallback level (ai.js) when KataGo is unavailable
 *
 * v5, used only when the optional networks are installed:
 *
 *   human    the human-style opponent: KataGo's human SL model imitating
 *            `profile` (a KataGo humanSLProfile). `style` "raw" plays the
 *            profile's own move distribution at one network evaluation
 *            (KataGo's gtp_human5k_example.cfg); "search" keeps the style
 *            but lets `visits` of search veto losing moves
 *            (gtp_human9d_search_example.cfg) — the raw policy alone does
 *            not reach single-digit kyu against these programs (v4
 *            measurement, docs/strength.md). The model has no profile
 *            below 20 kyu, so the weakest levels add the level's own kind
 *            of beginner's move (`blunder`). Profiles follow the v4 anchor
 *            measurements: rank_20k measured ≈ 17 kyu and rank_15k ≈ 14 kyu
 *            on the ladder's scale.
 *   strong   the top level with the stronger network: `visits` of its
 *            search (the larger network is several times slower per visit
 *            and much stronger per visit).
 */
export const STRENGTHS = [
  { id: "30k", rank: 30, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 1.0, local: 1, human: { profile: "rank_20k", blunder: 0.9 } },
  { id: "25k", rank: 29, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.95, local: 1, human: { profile: "rank_20k", blunder: 0.7 } },
  { id: "20k", rank: 23, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.75, local: 2, human: { profile: "rank_20k", blunder: 0.35 } },
  { id: "15k", rank: 18, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.6, local: 3, human: { profile: "rank_20k" } },
  { id: "10k", rank: 12, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.25, local: 4, human: { profile: "rank_12k" } },
  { id: "5k", rank: 7, visits: 8, temp: 2.0, maxLoss: 40, slip: 0.3, blunder: 0.09, local: 5, human: { profile: "rank_7k", style: "search", visits: 24 } },
  { id: "1k", rank: 2, visits: 32, temp: 0.7, maxLoss: 6, slip: 0.02, blunder: 0, local: 5, human: { profile: "rank_2k", style: "search", visits: 64 } },
  { id: "2d", rank: -3, visits: 160, temp: 0, maxLoss: 0, slip: 0, blunder: 0, local: 5, human: { profile: "rank_4d", style: "search", visits: 200 }, strong: { visits: 64 } },
];

/** Search budget of a human-style move in "raw" style (passes only). */
export const HUMAN_VISITS = 40;
/**
 * Analysis with the stronger network uses this share of the visits asked
 * for: it is several times slower per visit on a laptop CPU and much
 * stronger per visit, and the review should not get slower than v4's.
 */
export const STRONG_VISIT_SCALE = 0.5;

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

/**
 * One search at a time. The sidecar supersedes a running search with a new
 * one; queueing here keeps the whole-game review, live analysis, pondering
 * and the opponent from cancelling each other. A caller that no longer
 * wants its result aborts its own signal.
 */
let chain = Promise.resolve();
function queued(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}
const analyzeQ = (game, opts) => queued(() => (opts?.signal?.aborted ? null : KataGo.analyze(game, opts)));

/**
 * An analysis search on the analysis engine (the stronger network when it is
 * installed, with scaled visits), falling back to the shipped network when
 * that process cannot answer.
 */
async function analysisQ(game, opts = {}) {
  const engine = analysisEngine();
  if (engine === "standard") return analyzeQ(game, opts);
  const a = await analyzeQ(game, { ...opts, engine, visits: scaledVisits(opts.visits ?? 64, engine) });
  if (a || opts.signal?.aborted) {
    if (a) strongFailures = 0;
    return a;
  }
  strongFailures++;
  return analyzeQ(game, opts);
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

/* ------------------------------------------------- optional networks (v5) */

/**
 * Which optional networks are installed and wanted. Set by the models
 * controller (app/models-ctl.js) from the host's status and
 * `settings.humanStyle`; all false until then.
 */
const models = { strong: false, human: false, humanStyle: true };
/** Consecutive failures of the strong process; after two, use the standard one. */
let strongFailures = 0;

export function setModels({ strong, human, humanStyle } = {}) {
  if (strong !== undefined) {
    if (strong && !models.strong) strongFailures = 0;
    models.strong = !!strong;
  }
  if (human !== undefined) models.human = !!human;
  if (humanStyle !== undefined) models.humanStyle = humanStyle !== false;
}

export function modelsState() {
  return { ...models, strongUsable: models.strong && strongFailures < 2 };
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
 * How the opponent plays at `strength`: "human" (human SL model, when
 * installed and `humanStyle` is on), "strong" (the stronger network, for
 * the levels that have a `strong` entry), else "standard". Pure; `m` is
 * for the tests.
 */
export function opponentMode(strengthOrId, m = modelsState()) {
  const s = typeof strengthOrId === "string" ? strengthById(strengthOrId) : strengthOrId;
  if (m.human && m.humanStyle && s?.human) return "human";
  if (m.strong && m.strongUsable !== false && s?.strong) return "strong";
  return "standard";
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
 * its reply. `analysis` is null when KataGo is not available. `mode` says
 * how the move was chosen ("human", "strong", "standard" or "offline").
 */
export async function decide(game, strengthId, { signal } = {}) {
  const strength = strengthById(strengthId);
  const mode = opponentMode(strength);
  if (mode === "human") {
    const analysis = await analyzeQ(game, { ...humanRequest(strength.human), signal });
    if (signal?.aborted) return { move: null, analysis: null, mode };
    const move = analysis && humanMoveFromAnalysis(game, analysis, strength.human);
    if (move) return { move, analysis, mode };
    // The human process could not answer: the level's standard play.
  }
  if (mode === "strong") {
    const analysis = await analyzeQ(game, { visits: strength.strong.visits, engine: "strong", signal });
    if (signal?.aborted) return { move: null, analysis: null, mode };
    const move = analysis && moveFromAnalysis(game, analysis, strength);
    if (move) {
      strongFailures = 0;
      return { move, analysis, mode };
    }
    if (!analysis) strongFailures++;
  }
  const analysis = await analyzeQ(game, { visits: strength.visits, signal });
  if (signal?.aborted) return { move: null, analysis: null, mode: "standard" };
  if (analysis) {
    const move = moveFromAnalysis(game, analysis, strength);
    if (move) return { move, analysis, mode: "standard" };
  }
  const move = await chooseLocal(game, { level: strength.local, color: game.turn });
  return { move, analysis: null, mode: "offline" };
}

/** A quick look at the position (for teaching mode and the eval bar). */
export async function evaluate(game, { node = game.current, visits = 48, signal } = {}) {
  return analysisQ(game, { node, visits, signal });
}

/** Live analysis for review, with partial results while it searches. */
export async function live(game, node, { visits = 240, onInfo, signal } = {}) {
  return analysisQ(game, { node, visits, onInfo, signal });
}

export function cancel() {
  KataGo.cancel?.();
}

export async function chooseMove(game, strengthId) {
  // Never resign, never pass early while the board is open: KataGo's own
  // choice is a pass only when the game is really over.
  const { move } = await decide(game, strengthId);
  return move || chooseLocal(game, { level: strengthById(strengthId).local, color: game.turn });
}

/** The engine's suggestion for the side to move, with a short line. */
export async function hint(game) {
  const analysis = await analysisQ(game, { visits: 200 });
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
export async function analyzeNode(game, node, visits = 48, { signal } = {}) {
  const a = await analysisQ(game, { node, visits, signal });
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
 */
export async function deadStones(game) {
  const a = await analysisQ(game, { visits: 160 });
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
