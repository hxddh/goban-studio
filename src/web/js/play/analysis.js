/**
 * One analysis per game (docs/v9.md, "Two spaces → Play"): the whole-game
 * analysis of a saved game, stored once in its file (`analysis`), with the
 * review model made from it (`review`, play/review-model.js).
 *
 * The post-game review makes it while it is open (app/review-ctl.js); what
 * it has not finished when it is left goes on here, in the scheduler's
 * background lane, for the player's own games: a game just played gets its
 * review even when a new game starts at once, and the computer's move never
 * waits behind it. A short while after launch, with KataGo there, the
 * player's own games that lack one are analysed quietly, one after another
 * (autoAnalyse); quitting keeps the rest for the next launch. Imported
 * records are analysed when they are opened.
 *
 * Positions already analysed are kept (notePoints), with the main line
 * they belong to, so a stopped pass resumes where it stopped and an edited
 * game is analysed again.
 *
 * state.batch = { ids, done, total, current } while the quiet pass runs.
 */
import * as Games from "../data/games.js";
import * as Engine from "../engine.js";
import { store } from "../data/store.js";
import { loadSGF } from "../sgf.js";
import { t } from "../i18n.js";
import { state, update, updateSlice } from "../app/store.js";
import { learnFromGame } from "../app/learn-game.js";
import { REVIEW_VERSION, analysisFits, buildReview, lineKey, resultOf } from "./review-model.js";
import { humanMoveProbabilities } from "../katago.js";
import { PROFILES, normalizeMoveRank, rankFromLikelihoods } from "../model/move-rank.js";
import { recordGame } from "../model/record.js";
import { changeProfile } from "../app/ctl-core.js";

/* ---------------------------------------------------------- one pass */

/** Searches per position of the whole-game pass, by board size. */
export const visitsFor = (size) => (size === 19 ? 40 : size === 13 ? 56 : 80);

/**
 * Analyse every position of the main line. Returns an array aligned with
 * game.mainLine(); null when cancelled. Falls back to the offline estimate
 * per position when KataGo is not there. Every search is one job of the
 * scheduler's lane (background by default), so the computer's move and
 * what the player looks at always go first; `signal` cancels the pass, and
 * a search still queued then never runs. `existing` positions are kept.
 * @param {any} game
 * @param {{ visits?: number, signal?: AbortSignal, lane?: string, onProgress?: (done: number, total: number) => void, onPoint?: (i: number, point: any) => void, existing?: any[] }} [opts]
 */
export async function analyzeLine(game, { visits = 40, signal = null, lane = "background", onProgress, onPoint, existing = null } = {}) {
  const line = game.mainLine();
  const points = new Array(line.length).fill(null);
  for (let i = 0; i < line.length; i++) {
    if (signal?.aborted) return null;
    if (existing?.[i]) {
      points[i] = existing[i];
      onProgress?.(i + 1, line.length);
      continue;
    }
    let p = null;
    try {
      p = await Engine.analyzeNode(game, line[i], visits, { signal, lane });
    } catch (_) {
      p = null;
    }
    // A cancelled search is not an answer: never store an estimate for it.
    if (signal?.aborted) return null;
    if (!p) p = Engine.estimateNode(game, line[i]);
    points[i] = p;
    onPoint?.(i, p);
    onProgress?.(i + 1, line.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return points;
}

/* ------------------------------------------- positions known so far */

/** recordId → { key, points }: positions analysed so far, with the main line they are of. */
const known = new Map();

/** Keep the positions of a game analysed so far (a review left, a pass stopped). */
export function notePoints(recordId, game, points) {
  if (recordId && game && Array.isArray(points) && points.some(Boolean)) known.set(recordId, { key: lineKey(game), points: points.slice() });
}

/**
 * The positions known for a record, when they are of these moves: with
 * KataGo here only KataGo's own (an estimate is redone), else any.
 */
export function knownPoints(recordId, game) {
  const h = known.get(recordId);
  if (!h || h.key !== lineKey(game) || h.points.length !== game.mainLine().length) return null;
  const pts = h.points.map((p) => (p && (p.source === "katago" || !state.engine.available) ? p : null));
  return pts.some(Boolean) ? pts : null;
}

function recordOf(id) {
  const rec = Games.getGame(id);
  if (!rec) return null;
  try {
    return { rec, game: loadSGF(rec.sgf).game };
  } catch (_) {
    return null;
  }
}

/** The player's colour in a record (null: two people, or an imported game). */
const humanColorOf = (rec) => (rec?.opponent === "ai" ? (rec.humanColor === -1 ? -1 : 1) : null);

/** A game played here (not imported), long enough to analyse. */
export function isOwnGame(rec) {
  return !!rec && rec.source !== "import" && (rec.moves || 0) >= 8;
}

/**
 * The stored analysis of a record when it is current: of these moves, and
 * KataGo's when KataGo is here (an offline estimate is redone then).
 */
export function storedAnalysis(rec, game) {
  const a = rec?.analysis;
  if (!analysisFits(a, game)) return null;
  // Of these very moves: the analysis is stored with its review, which names
  // the main line it was made for (a game saved again with other moves at
  // the same count keeps the old file's analysis until it is analysed anew).
  if (rec.report?.lineKey !== lineKey(game)) return null;
  if (state.engine.available && a.some((p) => p.source !== "katago")) return null;
  return a;
}

/**
 * A finished whole-game analysis of a record: its review model, stored in
 * the game's file with the analysis (unless the record changed meanwhile).
 * A game against the computer analysed by KataGo also teaches the player model once
 * (play-ctl learnFromGame: the game's phases and themes, its two costliest
 * mistakes as drills). Returns the model, or null.
 */
export function storeAnalysis(recordId, game, points, { humanColor = null, refined = null, keyMoves = null } = {}) {
  if (!recordId || !analysisFits(points, game)) return null;
  let model;
  try {
    model = buildReview({ game, points, humanColor, refined, keyMoves });
  } catch (e) {
    console.error("review failed", e);
    return null;
  }
  known.delete(recordId);
  const now = recordOf(recordId);
  if (!now || lineKey(now.game) !== model.lineKey) return model;
  Games.patchGame(recordId, { review: model, analysis: points });
  // Once per game, and only for the finished game ("Review so far" of a
  // game still in play does not use it up).
  if (humanColor != null && resultOf(game) && !now.rec.learned && points.every((p) => p.source === "katago")) {
    learnFromGame({ game, points, humanColor, recordId });
  }
  // The second reading of the player's strength, from their own moves.
  // Finished games only: an unfinished game in the library is never read for strength.
  if (humanColor != null && resultOf(game) && !now.rec.unfinished && !now.rec.moveRank && points.every((p) => p.source === "katago")) estimateMoveRank(recordId, game, humanColor);
  return model;
}

/* -------------------------------------- Your moves, read by rank */

/**
 * After a finished game's analysis, with the human-style model installed
 * and a host that can read its policy (katago.js humanMoveProbabilities):
 * how likely the player's moves were for each rank profile, read as a rank
 * with its range (model/move-rank.js). Stored with the game (`moveRank`)
 * and in the player model, where it is only a weak prior (player.js
 * applyMoveRank). Resolves the reading, or null when it cannot be made.
 */
async function estimateMoveRank(recordId, game, humanColor, { signal = null } = {}) {
  if (!recordId || !Engine.installed().human) return null;
  const rows = await humanMoveProbabilities(game, humanColor, PROFILES.map((p) => p.id), { signal });
  const reading = rows && rankFromLikelihoods(rows);
  if (!reading || signal?.aborted || !Games.getGame(recordId)) return null;
  const moveRank = { rank: reading.rank, lo: reading.lo, hi: reading.hi, n: reading.n, at: Date.now() };
  Games.patchGame(recordId, { moveRank });
  changeProfile((p) => recordGame(p, { id: String(recordId), moveRank }));
  update();
  return moveRank;
}

/** The stored reading of the game a review shows, or null (no human model, no capable host, too short). */
export function moveRankOf(review = state.review) {
  const id = review?.meta?.recordId || (review?.source === "current" ? state.game?.recordId : null);
  return id ? normalizeMoveRank(Games.getGame(id)?.moveRank) : null;
}

/* ------------------------------------------------ background passes */

/** recordId → the scheduler job analysing it. */
const jobs = new Map();

/** The running analysis job of a record, if any. */
export function analysisJob(recordId) {
  const job = jobs.get(recordId);
  return job && !job.signal.aborted ? job : null;
}

/** Stop a record's background pass (the review takes over); its positions are kept. */
export function takeOver(recordId) {
  analysisJob(recordId)?.cancel("review");
  jobs.delete(recordId);
}

/**
 * Cheap check without parsing the game: an own finished game whose stored
 * review is missing or old. Works on the index's record too (the game
 * file need not be read; data/games.js reviewV, reviewConfidence,
 * analyzed). A game left unfinished is not analysed until it is finished.
 */
export function wantsAnalysis(rec) {
  if (!isOwnGame(rec) || Games.isUnfinished(rec)) return false;
  const v = rec.report ? rec.report.v : rec.reviewV;
  const confidence = rec.report ? rec.report.confidence : rec.reviewConfidence;
  const analyzed = Array.isArray(rec.analysis) || (rec.analysis == null && rec.loaded === false && !!rec.analyzed);
  return v == null || v !== REVIEW_VERSION || !analyzed || (confidence !== "high" && state.engine.available);
}

/** The opponent as a job title names it. */
function gameTitle(rec) {
  if (rec.opponent === "ai" && rec.rank != null) {
    const r = Engine.rankParts(rec.rank);
    return t("sched.job.game", [t(r.unit === "kyu" ? "rank.kyu" : "rank.dan", [r.n])]);
  }
  return t("sched.job.report");
}

/**
 * Analyse a record in the background. Returns the job (the running one if
 * there is one), or null when the record needs none. `owner` is who may
 * cancel it; `signal` a parent's (the quiet pass); `hidden` keeps it out of
 * the job list; `any` analyses an imported record too.
 */
export function queueAnalysis(recordId, { owner = "games", signal = null, hidden = false, any = false } = {}) {
  const have = analysisJob(recordId);
  if (have) return have;
  let run;
  let rec;
  if (Games.isLoaded(recordId)) {
    const found = recordOf(recordId);
    if (!found || (!any && !isOwnGame(found.rec)) || (storedAnalysis(found.rec, found.game) && !wantsAnalysis(found.rec))) return null;
    rec = found.rec;
    run = (me) => analyse(recordId, found.game, humanColorOf(rec), me, rec.analysis);
  } else {
    // The game's file is not read yet; the index says whether it needs
    // an analysis, and the job reads the file first.
    rec = Games.getGame(recordId);
    if (!rec || (!any && !isOwnGame(rec)) || !wantsAnalysis(rec)) return null;
    run = async (me) => {
      await Games.loadGame(recordId);
      if (me.signal.aborted) return null;
      const found = recordOf(recordId);
      if (!found || (storedAnalysis(found.rec, found.game) && !wantsAnalysis(found.rec))) return null;
      return analyse(recordId, found.game, humanColorOf(found.rec), me, found.rec.analysis);
    };
  }
  const job = Engine.sched.startJob({
    kind: "analysis",
    owner,
    signal,
    hidden,
    title: () => gameTitle(rec),
    meta: { recordId },
    run,
  });
  jobs.set(recordId, job);
  job.promise.then(() => {
    if (jobs.get(recordId) === job) jobs.delete(recordId);
    update();
  });
  update();
  return job;
}

/** Positions of a stored analysis worth keeping: KataGo's, or any without KataGo. */
function reusable(points, game) {
  if (!Array.isArray(points) || points.length !== game.mainLine().length) return null;
  const pts = points.map((p) => (p && Number.isFinite(p.scoreLead) && (p.source === "katago" || !state.engine.available) ? p : null));
  return pts.some(Boolean) ? pts : null;
}

async function analyse(recordId, game, humanColor, job, stored = null) {
  const n = game.mainLine().length;
  const existing = knownPoints(recordId, game) || reusable(stored, game);
  const partial = existing ? existing.slice() : new Array(n).fill(null);
  const points = await analyzeLine(game, {
    existing,
    signal: job.signal,
    visits: visitsFor(game.size),
    onPoint: (i, p) => {
      partial[i] = p;
      notePoints(recordId, game, partial);
    },
    onProgress: (k, total) => {
      if (k % 4 === 0 || k === total) job.setProgress(k / total);
    },
  });
  if (!points) return null;
  return storeAnalysis(recordId, game, points, { humanColor });
}

/* --------------------------------------- the quiet pass over old games */

/** The games still to do, in the store (data/store.js). */
export const BATCH_KEY = "batch.json";
const saveBatch = (ids) => store.put(BATCH_KEY, { ids });
const clearBatch = () => store.has(BATCH_KEY) && store.remove(BATCH_KEY);
const OWNER = "batch";

let batch = null;

/** The player's games that need an analysis, newest first. */
export function batchCandidates(games = Games.listGames()) {
  return games.filter((rec) => wantsAnalysis(rec)).map((rec) => rec.id);
}

/** Start (or resume) the quiet pass over `ids` (default: every game that needs one). */
export function analyseAll({ ids = null } = {}) {
  if (batch && !batch.signal.aborted) return batch;
  const todo = (ids || batchCandidates()).filter((id) => Games.getGame(id));
  if (!todo.length) {
    clearBatch();
    return null;
  }
  saveBatch(todo);
  const b = { ids: todo.slice(), done: 0, total: todo.length, current: null };
  state.batch = b;
  batch = Engine.sched.startJob({
    kind: "batch",
    owner: OWNER,
    title: () => t("sched.job.batch", [Math.min(b.done + 1, b.total), b.total]),
    run: (me) => runBatch(me, b),
  });
  const mine = batch;
  batch.promise.then(() => {
    if (batch === mine) batch = null;
    if (state.batch === b) state.batch = null;
    update();
  });
  update();
  return batch;
}

/** @type {(signal: AbortSignal) => Promise<void>} */
const aborted = (signal) => new Promise((resolve) => (signal.aborted ? resolve() : signal.addEventListener("abort", () => resolve(), { once: true })));

async function runBatch(me, b) {
  while (b.ids.length) {
    if (me.signal.aborted) break;
    const id = b.ids[0];
    b.current = id;
    me.setProgress(b.done / b.total);
    updateSlice("batch");
    const one = queueAnalysis(id, { owner: OWNER, signal: me.signal, hidden: true });
    if (one) {
      const tick = () => me.setProgress((b.done + (one.progress || 0)) / b.total);
      const off = Engine.sched.onChange(tick);
      try {
        // A pass already running on its own (the game just played) is not
        // the batch's to stop; a cancel only stops waiting for it.
        await Promise.race([one.promise, aborted(me.signal)]);
      } finally {
        off();
      }
    }
    if (me.signal.aborted) break;
    b.ids.shift();
    b.done++;
    b.current = null;
    if (b.ids.length) saveBatch(b.ids);
    else clearBatch();
    updateSlice("batch");
  }
  if (me.signal.aborted) {
    // Quitting keeps the rest for the next launch; a cancel forgets it.
    if (me.signal.reason !== "quit") clearBatch();
    return null;
  }
  clearBatch();
  return b.done;
}

/** Stop the quiet pass (the game being analysed keeps what it has). */
export function cancelBatch() {
  Engine.sched.cancelOwner(OWNER);
}

/** At launch: carry on with a pass that quitting interrupted. */
export function resumeBatch() {
  const saved = store.get(BATCH_KEY);
  const ids = Array.isArray(saved?.ids) ? saved.ids.filter((id) => typeof id === "string") : [];
  if (!ids.length) return null;
  const rest = ids.filter((id) => wantsAnalysis(Games.getGame(id)));
  if (!rest.length) {
    clearBatch();
    return null;
  }
  return analyseAll({ ids: rest });
}

/** How long after launch the quiet pass over older games starts. */
const AUTO_DELAY_MS = 20000;
let autoTimer = null;

/**
 * At launch, once the engine is known: the interrupted pass, the recent
 * rated games that quitting interrupted, and a while later the rest.
 */
export function resumeBackground() {
  resumeBatch();
  for (const rec of Games.listGames().slice(0, 20)) if (rec.rating && wantsAnalysis(rec)) queueAnalysis(rec.id);
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => autoAnalyse(), AUTO_DELAY_MS);
}

/**
 * Analyse the player's own games that have none, quietly. Only with KataGo
 * (the offline estimate of the browser preview would cost the page's own
 * thread); `offline` lets tests run it anyway.
 */
export function autoAnalyse({ offline = false } = {}) {
  if (!state.engine?.available && !offline) return null;
  if (batch && !batch.signal.aborted) return batch;
  const ids = batchCandidates().filter((id) => Games.getGame(id)?.source === "game");
  return ids.length ? analyseAll({ ids }) : null;
}

/** A history row while its game is analysed: { progress } (0…1), { queued: true } or null. */
export function rowAnalysis(id) {
  const one = analysisJob(id);
  if (one) return { progress: one.progress || 0 };
  const b = state.batch;
  if (b && b.ids.includes(id)) return { queued: true };
  return null;
}
