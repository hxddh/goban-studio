/**
 * Review: a layer over any game, and the post-game review of your own
 * (docs/v9.md, "Two spaces → Play"). Whole-game analysis, the review model
 * made from it (play/review-model.js: the result, the balance, the three
 * phases, the key moments), live analysis of the position on the board,
 * free variations, the stories of the key mistakes, editing the record
 * (comments, marks, variations), and trying a key moment again from the
 * position before it, judged by KataGo.
 *
 * A saved game's analysis is stored once, in its file (play/analysis.js);
 * a review left before its pass is done hands the rest to the background
 * for your own games. Edits to a saved game are written back to its file.
 */
import { Game, coordLabel, formatPoints, influenceMap, MARK_KINDS, treeLayout as layoutTree } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { store } from "../data/store.js";
import { saveSettings } from "../data/settings.js";
import { addMistake, recordMistake } from "../model/player.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeBinaryFile } from "../host.js";
import { state, update, toast, announce } from "./store.js";
import { back, canGoBack, changeProfile, remember, isRestoring } from "./ctl-core.js";
import { describeMistakes, lossesOf } from "./explain.js";
import { freshGameState, parkCurrent, persistCurrent, maybeComputerMove, ponder } from "./play-ctl.js";
import { buildReview, drillOf, judgeTry, keyMovesOf as keyMistakes, reviewFits, tryMoments } from "../play/review-model.js";
import { analyzeLine, isOwnGame, knownPoints, notePoints, queueAnalysis, storeAnalysis, storedAnalysis, takeOver, visitsFor } from "../play/analysis.js";

// lossesOf / describeMistakes live in explain.js (pure, tested in Node).
export { lossesOf, describeMistakes };

/* --------------------------------------------------------- analysis */

/** Key mistakes of a review, using its refined analyses when there are any. */
function keyMovesOf(review) {
  return keyMistakes(review.game, review.points, review.meta.humanColor ?? null, review.refined);
}

/** The saved game a review is of: its record, or the record of the game in play. */
export function recordIdOf(r = state.review) {
  if (!r) return null;
  if (r.meta.recordId) return r.meta.recordId;
  if (r.source === "current" && state.game?.game === r.game) return state.game.recordId || null;
  return null;
}

/** A game of your own: the game in play, or a saved game played here (not imported, not a classic). */
export function ownGame(r = state.review) {
  if (!r || r.meta.classicId || r.source === "classic") return false;
  if (r.source === "current") return true;
  const id = recordIdOf(r);
  const rec = id && Games.getGame(id);
  return !!rec && rec.source !== "import";
}

/** The pass is done: store the analysis with the game, and keep it with the game in play. */
function persist(review) {
  if (review.analyzing || !review.points.every(Boolean)) return;
  if (review.source === "current" && state.game?.game === review.game) state.game.analysis = review.points;
  const id = recordIdOf(review);
  if (id && review.edits.dirty) saveEdits(review);
  if (id) storeAnalysis(id, review.game, review.points, { humanColor: review.meta.humanColor ?? null, refined: review.refined, keyMoves: review.keyMoves });
}

/**
 * v4: one deeper KataGo search of the position after each of the top three
 * mistakes (never more), for a sharper refutation line and ownership. Runs
 * after the whole-game pass; skipped without KataGo. Results are kept in
 * `review.refined[index]` and the key mistakes are explained again.
 */
async function refineKeyMoves(review) {
  if (!state.engine.available || review.engine !== "katago" || review.refining) return;
  const line = review.game.mainLine();
  const todo = review.keyMoves.filter((km) => !review.refined[km.index] && line[km.index]).slice(0, 3);
  if (!todo.length) return;
  // This pass owns the signal it started with: a main-line change cancels
  // it (results are stored by main-line index) and hands out a new one.
  const signal = review.ctl.signal;
  review.refining = true;
  update();
  const size = review.game.size;
  const visits = size === 19 ? 120 : size === 13 ? 160 : 200;
  let changed = false;
  for (const km of todo) {
    if (signal.aborted) break;
    let a = null;
    try {
      // Part of the whole-game pass: background lane.
      a = await Engine.analyzeNode(review.game, line[km.index], visits, { signal, lane: "background" });
    } catch (_) {
      a = null;
    }
    if (signal.aborted) return;
    if (a) {
      review.refined[km.index] = a;
      review.keyMoves = keyMovesOf(review);
      refreshModel(review);
      changed = true;
      update();
    }
  }
  if (signal.aborted) return;
  review.refining = false;
  if (changed) persist(review);
  update();
}

/** v7: stop every search a review started (leaving it, or a new pass). */
function stopReviewWork(r) {
  r?.ctl?.abort();
}

/* ------------------------------------------------------------- open */

/**
 * Open the review of a game. meta: { source: "current" | "record" |
 * "classic", recordId, classic, classicId, name, humanColor, space, back,
 * startAt, autoJump, points, inPlace }. A saved game brings its stored
 * analysis (or the positions a stopped pass had); `inPlace` (the game just
 * ended) turns the board into its review without a history step.
 */
export function openReview(game, meta = {}) {
  stopReviewWork(state.review);
  stopLive();
  if (!isRestoring() && !meta.inPlace) remember();
  const line = game.mainLine();
  // v8: the game in play, still going: where it stands, so that moves tried
  // in the review never become the game's own moves (settleLive).
  const end = line[line.length - 1];
  const source = meta.source || "current";
  const live = source === "current" && state.game?.game === game && !end.result ? { end, kids: end.children.slice() } : null;
  const startAt = meta.startAt ?? line.length - 1;
  game.goto(line[Math.max(0, Math.min(line.length - 1, startAt))].id);
  const review = {
    live0: live,
    game,
    source,
    meta,
    points: new Array(line.length).fill(null),
    analyzing: false,
    analyzed: 0,
    engine: null,
    keyMoves: [],
    ownership: false,
    variation: null,
    focus: null, // highlighted key move
    live: null,
    hover: null,
    // v7: the review owns its searches; leaving it aborts this (scheduler.js).
    ctl: new AbortController(),
    // v4: deeper analyses after the top mistakes (index → analysis), and
    // whether that pass is running. See refineKeyMoves.
    refined: {},
    refining: false,
    // The review model (play/review-model.js buildReview), the board-click
    // mark tool (null | a MARK_KINDS entry) and the state of record edits.
    model: null,
    markTool: null,
    edits: { dirty: false, savedAt: 0, target: null },
    // A key moment tried again (tryAgain), or null.
    trial: null,
    // v6: records open on the final position and move to the first key
    // moment once the analysis is there, unless the player has moved.
    autoJump: !!meta.autoJump,
  };
  review.edits.target = editTarget(review);
  // What is known of this game's analysis: what the caller has, what its
  // file holds, or the positions a stopped pass had.
  const id = recordIdOf(review);
  const rec = id ? Games.getGame(id) : null;
  let points = meta.points && meta.points.length === line.length && meta.points.every(Boolean) ? meta.points : null;
  if (!points && rec) points = storedAnalysis(rec, game);
  let existing = null;
  if (!points && id) {
    takeOver(id);
    existing = knownPoints(id, game);
  }
  if (points) {
    review.points = points.slice();
    review.analyzed = line.length;
    review.engine = points[0]?.source || null;
    review.keyMoves = keyMovesOf(review);
    refreshModel(review);
  }
  update((s) => {
    s.review = review;
    s.space = meta.space || "play";
    s.sheet = null;
    s.menu = null;
  });
  if (!points) analyzeReview(review, { existing });
  else {
    if (review.autoJump) jumpToFirst(review);
    // A stored review older than this model, or none: write it again.
    if (id && !reviewFits(rec?.report, game)) persist(review);
    refineKeyMoves(review);
  }
  startLive();
}

/** The first key moment, once the analysis is there (autoJump). */
function jumpToFirst(review) {
  review.autoJump = false;
  const first = review.keyMoves.reduce((a, k) => (a == null || k.index < a ? k.index : a), null);
  const line = review.game.mainLine();
  if (first != null && line[first]) {
    review.game.goto(line[first].id);
    review.focus = first;
  }
}

/**
 * v8: leaving a review of the game in play: moves tried from its last
 * position are dropped, and its own line is the main line again, before
 * anything is saved or the game carries on.
 */
function settleLive(r) {
  const at = r?.live0;
  if (!at) return;
  at.end.children = at.end.children.filter((c) => at.kids.includes(c));
  if (!r.game.isMainLine(at.end)) r.game.promoteVariation(at.end);
}

/**
 * Leaving a review whose pass is not done: its positions are kept, and a
 * game of your own carries on being analysed in the background.
 */
function handOver(r) {
  if (!r || !r.analyzing) return;
  const id = recordIdOf(r);
  if (!id) return;
  notePoints(id, r.game, r.points);
  if (isOwnGame(Games.getGame(id))) queueAnalysis(id);
}

/**
 * Leave the review (Esc, the crumb): Back to where it was opened from. The
 * review of the game that ended is that game's board, so leaving it goes
 * to Play's home (and Back returns to it).
 */
export function closeReview() {
  const r = state.review;
  if (!r) return;
  settleLive(r);
  saveEdits(r);
  if (r.source === "current" && state.game?.game === r.game && r.game.mainLine().at(-1).result) {
    remember();
    dropReview(r);
    update((s) => {
      s.review = null;
      s.space = "play";
      s.play = { ...s.play, view: "home", explorer: null };
    });
    return;
  }
  if (canGoBack() && back()) return;
  dropReview(r);
  const target = r.meta?.back;
  update((s) => {
    s.review = null;
    if (target) s.space = target;
  });
}

/** Leave a review without touching history (restore, a new game). */
export function dropReview(r = state.review) {
  if (!r) return;
  settleLive(r);
  saveEdits(r);
  stopReviewWork(r);
  stopLive();
  handOver(r);
  if (r.source === "current" && state.game && state.game.game === r.game) {
    const line = state.game.game.mainLine();
    state.game.game.goto(line[line.length - 1].id);
    maybeComputerMove();
    ponder();
  }
  if (state.review === r) state.review = null;
}

async function analyzeReview(review, { existing = null } = {}) {
  const game = review.game;
  const signal = review.ctl.signal;
  review.analyzing = true;
  if (existing) {
    existing.forEach((p, i) => p && (review.points[i] = p));
    review.analyzed = existing.filter(Boolean).length;
  }
  update();
  // v7: a background job of the scheduler, owned by this review.
  const job = Engine.sched.startJob({
    kind: "review",
    signal,
    title: () => t("sched.job.review"),
    run: (job) =>
      analyzeLine(game, {
        visits: visitsFor(game.size),
        signal: job.signal,
        existing,
        onPoint: (i, p) => {
          review.points[i] = p;
          review.engine = p.source;
        },
        onProgress: (k, n) => {
          review.analyzed = k;
          job.setProgress(k / n);
          if (k % 4 === 0 || k === n) {
            review.keyMoves = keyMovesOf(review);
            if (k % 16 === 0 || k === n) refreshModel(review);
            update();
          }
        },
      }),
  });
  const points = await job.promise;
  if (signal.aborted) return;
  review.analyzing = false;
  review.keyMoves = keyMovesOf(review);
  refreshModel(review);
  if (!points) {
    // Stopped: keep what is there.
    update();
    return;
  }
  review.engine = points.find((p) => p.source === "estimate") ? "estimate" : points[0]?.source || review.engine;
  persist(review);
  if (review.autoJump && state.review === review) {
    jumpToFirst(review);
    startLive();
  }
  update();
  refineKeyMoves(review);
}

/* ------------------------------------------------------- navigation */

export function reviewIndex() {
  const r = state.review;
  if (!r) return 0;
  const line = r.game.mainLine();
  const i = line.findIndex((n) => n.id === r.game.current.id);
  return i;
}

/** Depth of the current node from the root (works inside variations). */
export function reviewDepth() {
  const r = state.review;
  let d = 0;
  for (let n = r?.game.current; n && n.parent; n = n.parent) d++;
  return d;
}

export function onMainLine() {
  return reviewIndex() >= 0;
}

export function reviewGoto(index) {
  const r = state.review;
  if (!r) return;
  const line = r.game.mainLine();
  const i = Math.max(0, Math.min(line.length - 1, index));
  gotoNode(line[i]);
}

export function gotoNode(node) {
  const r = state.review;
  if (!r || !node) return;
  r.autoJump = false;
  r.trial = null;
  r.game.goto(node.id);
  r.variation = null;
  update();
  startLive();
}

export function reviewStep(delta) {
  const r = state.review;
  if (!r) return;
  let node = r.game.current;
  if (delta < 0) for (let k = 0; k < -delta && node.parent; k++) node = node.parent;
  else for (let k = 0; k < delta && node.children[0]; k++) node = node.children[0];
  gotoNode(node);
}

/** Back from a variation to the main-line move it branched from. */
export function backToMainLine() {
  const r = state.review;
  if (!r) return;
  const main = new Set(r.game.mainLine().map((n) => n.id));
  let n = r.game.current;
  while (n && !main.has(n.id)) n = n.parent;
  gotoNode(n || r.game.root);
}

/** Variations in the game: main-line nodes with more than one child. */
export function branchPoints() {
  const r = state.review;
  if (!r) return [];
  return r.game
    .mainLine()
    .map((n, i) => ({ node: n, index: i, count: n.children.length - 1 }))
    .filter((b) => b.count > 0);
}

/**
 * A move on the review board opens (or follows) a variation from the
 * position on screen; while a key moment is tried again, it is the try.
 */
export function reviewPlay(x, y) {
  const r = state.review;
  if (!r) return;
  if (r.trial) return tryMove(x, y);
  if (r.markTool) return toggleMark(r.markTool, x, y);
  const cur = r.game.current;
  const existing = cur.children.find((c) => c.move && !c.move.pass && c.move.x === x && c.move.y === y);
  if (existing) return gotoNode(existing);
  const res = r.game.play(x, y);
  if (!res.ok) {
    toast(t("error." + (res.reason || "illegal")), "warn");
    return;
  }
  Audio.stone(false);
  r.variation = null;
  update();
  startLive();
}

/** Remove the variation the board is in (back to its branch point). */
export function deleteVariation() {
  const r = state.review;
  if (!r || onMainLine()) return;
  const main = new Set(r.game.mainLine().map((n) => n.id));
  let n = r.game.current;
  while (n.parent && !main.has(n.parent.id)) n = n.parent;
  deleteBranch(n);
}

/* ------------------------------------------------- the review model */

function refreshModel(review) {
  if (!review) return null;
  try {
    review.model = buildReview({ game: review.game, points: review.points, humanColor: review.meta.humanColor ?? null, refined: review.refined, keyMoves: review.keyMoves });
  } catch (e) {
    console.error("review model failed", e);
    review.model = null;
  }
  return review.model;
}

/** The model of the review on screen (computed on demand), or null. */
export function reviewModel() {
  const r = state.review;
  if (!r) return null;
  return r.model || refreshModel(r);
}

/**
 * The change of the strength estimate a rated game made ({ before, after },
 * saved in its file when it ended), or null.
 */
export function reviewRating(r = state.review) {
  const id = recordIdOf(r);
  const rt = id ? Games.getGame(id)?.rating : null;
  return rt?.before && rt?.after && Number.isFinite(rt.before.rank) && Number.isFinite(rt.after.rank) ? rt : null;
}

/* ------------------------------------------ v5: editing the record */

/** Where edits are saved: "record" (its file), "current" (the game in play) or null (kept in memory only: classics). */
function editTarget(r) {
  if (r.source === "record" && r.meta.recordId) return "record";
  if (r.source === "current" && state.game?.game === r.game) return "current";
  return null;
}

let saveTimer = 0;

function edited(r, { mainBefore = null } = {}) {
  r.edits = { ...r.edits, dirty: true, target: editTarget(r) };
  if (mainBefore) realign(r, mainBefore);
  if (r.edits.target) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveEdits(r), 400);
  }
  update();
}

/**
 * Save edited moves to a record, where it is in the list (an edit is not a
 * new game). A stored review of other moves (a variation promoted, moves
 * deleted) goes with its analysis, so a new one is made; comments and
 * marks keep them.
 */
function saveRecord(id, game) {
  const rec = Games.saveGame(game, { id, keepPlace: true });
  if ((rec.report && !reviewFits(rec.report, game)) || (rec.analysis && rec.analysis.length !== game.mainLine().length)) Games.patchGame(id, { review: null, analysis: null });
  return true;
}

/**
 * Write pending edits now (they are otherwise saved 0.4 s after the last
 * one, and when the review closes). Returns true when something was saved.
 */
export function saveEdits(r = state.review) {
  clearTimeout(saveTimer);
  if (!r?.edits?.dirty) return false;
  const target = editTarget(r);
  if (target === "record") {
    if (!Games.getGame(r.meta.recordId)) return false;
    if (!saveRecord(r.meta.recordId, r.game)) return false;
  } else if (target === "current") {
    // v8: moves tried from where the game in play stands are not saved
    // with it (the review is still open; settleLive drops them on leaving).
    const at = r.live0;
    const all = at?.end.children;
    if (at) at.end.children = all.filter((c) => at.kids.includes(c));
    try {
      persistCurrent();
      if (state.game.recordId && Games.getGame(state.game.recordId)) saveRecord(state.game.recordId, r.game);
    } finally {
      if (at) at.end.children = all;
    }
  } else return false;
  r.edits = { ...r.edits, dirty: false, savedAt: Date.now(), target };
  return true;
}

/**
 * After the main line changed (promote / delete), keep each analysis with
 * its position: points and refined analyses follow their nodes; positions
 * new to the main line are analysed, unless nothing had been analysed yet.
 */
function realign(r, before) {
  const line = r.game.mainLine();
  if (line.length === before.length && line.every((n, i) => n === before[i])) return;
  const at = new Map(before.map((n, i) => [n, i]));
  const hadAny = r.points.some(Boolean);
  r.points = line.map((n) => (at.has(n) ? r.points[at.get(n)] : null));
  const refined = {};
  for (const [i, a] of Object.entries(r.refined)) {
    const j = line.indexOf(before[i]);
    if (j >= 0) refined[j] = a;
  }
  r.refined = refined;
  r.analyzed = r.points.filter(Boolean).length;
  r.variation = null;
  r.focus = null;
  r.trial = null;
  r.keyMoves = keyMovesOf(r);
  refreshModel(r);
  if (r.source === "current" && state.game?.game === r.game && state.game.analysis) state.game.analysis = r.points;
  // Passes in flight write by main-line index: stop them (whole-game and
  // refinement alike) and start over with what is known.
  const wasRefining = r.refining;
  stopReviewWork(r);
  r.ctl = new AbortController();
  r.refining = false;
  if (r.analyzing || (hadAny && r.points.some((p) => !p))) analyzeReview(r, { existing: r.points.slice() });
  else if (wasRefining) refineKeyMoves(r);
}

const nodeOf = (r, node) => (node == null ? r.game.current : typeof node === "object" ? node : r.game.nodeById(node));

/** Set the comment of a node (default: the one on the board). "" clears it. */
export function setComment(text, node = null) {
  const r = state.review;
  if (!r) return false;
  const n = nodeOf(r, node);
  if (!n || (n.comment || "") === String(text ?? "")) return false;
  r.game.setComment(n, text);
  edited(r);
  return true;
}

/**
 * Board marks. toggleMark(kind, x, y[, text]) toggles a mark on the node on
 * the board; toggleMark(kind) with no point picks (or drops, when it is the
 * current one) the mark tool, so that board clicks place marks instead of
 * stones. kind: "triangle" | "square" | "circle" | "cross" | "label"; null
 * drops the tool.
 */
export function toggleMark(kind, x = null, y = null, text = null) {
  const r = state.review;
  if (!r) return null;
  if (x == null || y == null) {
    setMarkTool(r.markTool === kind ? null : kind);
    return null;
  }
  if (!MARK_KINDS.includes(kind)) return null;
  const mark = r.game.toggleMark(r.game.current, x, y, kind, text);
  edited(r);
  return mark;
}

export function setMarkTool(kind) {
  const r = state.review;
  if (!r) return;
  r.markTool = MARK_KINDS.includes(kind) ? kind : null;
  update();
}

/** Remove every mark on a node (default: the one on the board). */
export function clearMarks(node = null) {
  const r = state.review;
  const n = r && nodeOf(r, node);
  if (!n?.marks?.length) return false;
  n.marks = [];
  edited(r);
  return true;
}

/**
 * Delete a node and everything after it (default: the node on the board).
 * Deleting a main-line move makes its next variation the main line there;
 * the UI should confirm that first. The root cannot be deleted.
 */
export function deleteBranch(node = null) {
  const r = state.review;
  if (!r) return false;
  const n = nodeOf(r, node);
  if (!n?.parent) return false;
  const before = r.game.mainLine();
  const parent = r.game.deleteNode(n);
  if (!parent) return false;
  edited(r, { mainBefore: before });
  // The cursor was inside the deleted branch: show the branch point.
  if (r.game.current === parent) gotoNode(parent);
  return true;
}

/** Make the line through a node (default: the one on the board) the main line. */
export function promoteVariation(node = null) {
  const r = state.review;
  if (!r) return false;
  const n = nodeOf(r, node);
  const before = r.game.mainLine();
  if (!n || !r.game.promoteVariation(n)) return false;
  edited(r, { mainBefore: before });
  return true;
}

/** The game tree laid out for the variation mini-map (rules.treeLayout). */
export function treeLayout() {
  const r = state.review;
  return r ? layoutTree(r.game) : null;
}

/* ------------------------------------------------------ live analysis */

let liveCtl = null;
let liveTimer = 0;

export function stopLive() {
  clearTimeout(liveTimer);
  if (liveCtl) liveCtl.abort();
  liveCtl = null;
}

/** Analyse the position on screen (debounced), streaming partial results. */
export function startLive() {
  stopLive();
  const r = state.review;
  if (!r || r.trial || !state.settings.liveAnalysis || !state.engine.available) {
    if (r) r.live = null;
    return;
  }
  const node = r.game.current;
  liveTimer = setTimeout(async () => {
    const ctl = new AbortController();
    liveCtl = ctl;
    const apply = (a) => {
      if (!a || state.review !== r || r.game.current !== node) return;
      r.live = { nodeId: node.id, moves: a.moves, winrate: a.winrate, scoreLead: a.scoreLead, ownership: a.ownership, visits: a.visits, done: false };
      update();
    };
    let a = null;
    try {
      a = await Engine.live(r.game, node, { visits: 260, signal: ctl.signal, onInfo: apply });
    } catch (_) {}
    if (ctl.signal.aborted) return;
    apply(a);
    if (r.live && r.live.nodeId === node.id) r.live.done = true;
    update();
  }, 140);
}

export function toggleLive() {
  const on = !state.settings.liveAnalysis;
  state.settings = { ...state.settings, liveAnalysis: on };
  saveSettings(store, state.settings);
  if (on) startLive();
  else {
    stopLive();
    if (state.review) state.review.live = null;
  }
  update();
}

/** Current position's numbers: live analysis first, else the whole-game pass. */
export function currentEval() {
  const r = state.review;
  if (!r) return null;
  if (r.live && r.live.nodeId === r.game.current.id) return r.live;
  const i = reviewIndex();
  return i >= 0 ? r.points[i] : null;
}

export function toggleOwnership() {
  if (!state.review) return;
  state.review.ownership = !state.review.ownership;
  update();
}

export function reviewOwnershipMap() {
  const r = state.review;
  if (!r?.ownership) return null;
  const e = currentEval();
  if (e?.ownership) return e.ownership;
  return influenceMap(r.game.current.board);
}

/* ------------------------------------------------------ key mistakes */

/** Show a line on the board: what was played, or the engine's better line. */
export function showVariation(km, kind) {
  const r = state.review;
  if (!r) return;
  r.trial = null;
  r.game.goto(r.game.mainLine()[km.index - 1].id);
  const color = km.move.color;
  let moves = [];
  if (kind === "played") {
    const line = r.game.mainLine().slice(km.index, km.index + 6);
    moves = line.filter((n) => n.move && !n.move.pass).map((n, i) => ({ x: n.move.x, y: n.move.y, c: n.move.color, n: i + 1 }));
  } else {
    let c = color;
    moves = (km.pv || [])
      .slice(0, 6)
      .map((v, i) => {
        const m = v.pass ? null : { x: v.x, y: v.y, c, n: i + 1 };
        c = -c;
        return m;
      })
      .filter(Boolean);
  }
  r.variation = { kind, index: km.index, moves };
  r.focus = km.index;
  update();
  startLive();
}

/**
 * v4: play a key mistake's story up to `step` (0-based) on the board.
 * `line` is "better" or "played" (km.story[line]). Sets r.variation to
 * { kind: line, index, moves, story: true, step }; moves are the story's
 * moves 0..step in the {x, y, c, n} shape the board draws.
 */
export function showStory(km, line, step = 0) {
  const r = state.review;
  const steps = km?.story?.[line];
  if (!r || !steps?.length) return;
  r.trial = null;
  const upto = Math.max(0, Math.min(steps.length - 1, step));
  r.game.goto(r.game.mainLine()[km.index - 1].id);
  const moves = steps
    .slice(0, upto + 1)
    .map((s) => (s.move.pass ? null : { x: s.move.x, y: s.move.y, c: s.color, n: s.n }))
    .filter(Boolean);
  r.variation = { kind: line, index: km.index, moves, story: true, step: upto };
  r.focus = km.index;
  update();
  startLive();
}

/** Step through the story on the board: delta +1 / −1 from the shown step. */
export function storyStep(delta) {
  const r = state.review;
  const v = r?.variation;
  if (!v?.story) return;
  const km = r.keyMoves.find((k) => k.index === v.index);
  if (km) showStory(km, v.kind, v.step + delta);
}

export function focusMistake(km) {
  const r = state.review;
  if (!r) return;
  r.focus = km.index;
  if (km.story?.played?.length) showStory(km, "played", 0);
  else showVariation(km, "played");
}

/** A key moment as the model stores it (move, better move, loss), by its index. */
export function momentAt(index, r = state.review) {
  return r?.model?.moments.find((m) => m.index === index) || null;
}

/* ------------------------------------------------- try the moment again */

/**
 * "Try again" is offered for up to three key moments of a game of your own
 * that KataGo analysed (review-model tryMoments), and only with KataGo
 * here to judge the move.
 */
export function canTry(index, r = state.review) {
  if (!r || r.analyzing || !state.engine.available || !ownGame(r)) return false;
  return tryMoments(r.model).some((m) => m.index === index);
}

/** The moments of the review on screen that can be tried again, in game order. */
export function triable(r = state.review) {
  return r && !r.analyzing && state.engine.available && ownGame(r) ? tryMoments(r.model) : [];
}

/** Searches per judgement, by board size. */
const judgeVisits = (size) => (size === 19 ? 160 : size === 13 ? 200 : 240);

/** The position of a node as a game of its own (root stones, then the moves to it). */
function gameAt(src, node) {
  // v13: the root stones are copied, not placed again from the handicap, and
  // a record's mid-game setup (node.setup) is replayed with its move.
  const game = new Game({ size: src.size, rules: src.rules, komi: src.komi, handicap: src.handicap, placeHandicap: false });
  const root = src.root.board.signMap;
  const setup = [];
  for (let y = 0; y < src.size; y++) for (let x = 0; x < src.size; x++) if (root[y][x]) setup.push({ x, y, c: root[y][x] });
  if (setup.length) game.setup(setup, src.root.turn);
  const line = [];
  for (let n = node; n && n.parent; n = n.parent) line.unshift(n);
  for (const { move: m, setup: s } of line) {
    if (m.pass) game.pass({ color: m.color, force: true, setup: s });
    else game.play(m.x, m.y, { color: m.color, force: true, setup: s });
  }
  game.current.result = null;
  if (game.current.phase !== "playing") game.current.phase = "playing";
  return game;
}

/** The drill a moment is in the player model (added the first time it is tried). */
function drillFor(r, mo) {
  const gameId = recordIdOf(r) || "game-" + r.game.root.id;
  const drill = drillOf(mo, { sgf: r.game.toSGF(), gameId, size: r.game.size });
  changeProfile((p) => addMistake(p, drill, Date.now()));
  const have = state.profile.mistakes.find((m) => m.id === drill.id || (m.gameId === gameId && m.index === mo.index));
  return have?.id || drill.id;
}

/**
 * Try a key moment again: the board goes to the position before the
 * mistake, and the next move on it is judged by KataGo (tryMove). KataGo's
 * own look at that position starts at once, while the player thinks.
 */
export function tryAgain(index) {
  const r = state.review;
  if (!canTry(index, r)) return;
  const mo = momentAt(index, r);
  const line = r.game.mainLine();
  const node = line[index - 1];
  stopLive();
  r.variation = null;
  r.markTool = null;
  r.autoJump = false;
  r.game.goto(node.id);
  r.focus = index;
  r.live = null;
  const ctl = new AbortController();
  r.trial?.ctl?.abort();
  const pos = gameAt(r.game, node);
  const trial = { index, color: mo.color, best: mo.best, accept: mo.accept || [], loss: null, tried: null, status: "open", ctl, pos, drillId: drillFor(r, mo), before: null };
  trial.beforeP = Engine.analyzeNode(pos, pos.current, judgeVisits(pos.size), { signal: ctl.signal, lane: "interactive" })
    .catch(() => null)
    .then((a) => (trial.before = a || r.points[index - 1] || null));
  r.trial = trial;
  announce(t("try.prompt", [t(mo.color > 0 ? "common.black" : "common.white")]));
  update();
}

/** The move tried: judged against KataGo's best, and kept in the player model like a drill. */
export async function tryMove(x, y) {
  const r = state.review;
  const tr = r?.trial;
  if (!tr || tr.status !== "open") return;
  const ok = tr.pos.canPlay(x, y);
  if (!ok.ok) {
    toast(t("error." + (ok.reason || "illegal")), "warn");
    return;
  }
  Audio.stone(false);
  tr.tried = { x, y };
  tr.status = "judging";
  update();
  const before = await tr.beforeP;
  if (r.trial !== tr || tr.ctl.signal.aborted) return;
  let verdict = judgeTry({ tried: tr.tried, color: tr.color, before, accept: tr.accept });
  if (!verdict) {
    const after = tr.pos;
    const res = after.play(x, y);
    let a = null;
    if (res.ok) {
      try {
        a = await Engine.analyzeNode(after, after.current, judgeVisits(after.size), { signal: tr.ctl.signal, lane: "interactive" });
      } catch (_) {
        a = null;
      }
      after.undo();
    }
    if (r.trial !== tr || tr.ctl.signal.aborted) return;
    verdict = judgeTry({ tried: tr.tried, color: tr.color, before, after: a, accept: tr.accept });
  }
  if (!verdict) {
    // No answer from KataGo: nothing is counted, the move can be tried again.
    tr.status = "open";
    tr.tried = null;
    toast(t("try.noJudge"), "warn");
    update();
    return;
  }
  tr.loss = verdict.loss;
  tr.status = verdict.good ? "good" : "bad";
  changeProfile((p) => recordMistake(p, tr.drillId, { solved: verdict.good }, Date.now()));
  if (verdict.good) Audio.correct?.();
  else Audio.wrong?.();
  announce(tryVerdictText(tr, r.game.size));
  update();
}

/** What the verdict says, for the screen reader (the panel shows the same). */
function tryVerdictText(tr, size) {
  if (tr.status === "good") return t("try.good");
  const best = tr.best ? coordLabel(tr.best.x, tr.best.y, size) : "";
  return t("try.bad", [formatPoints(tr.loss), best]);
}

/** Another go at the same moment. */
export function tryRetry() {
  const tr = state.review?.trial;
  if (!tr) return;
  tr.status = "open";
  tr.tried = null;
  tr.loss = null;
  update();
}

/** Move on: the next moment to try, or back to the review. */
export function tryNext() {
  const r = state.review;
  const tr = r?.trial;
  if (!tr) return;
  const next = triable(r).find((m) => m.index > tr.index);
  if (next) return tryAgain(next.index);
  closeTrial();
}

/** Stop trying (Esc): the review shows the moment as it was played. */
export function closeTrial() {
  const r = state.review;
  const tr = r?.trial;
  if (!tr) return;
  tr.ctl.abort();
  r.trial = null;
  const line = r.game.mainLine();
  if (line[tr.index]) r.game.goto(line[tr.index].id);
  r.focus = tr.index;
  update();
  startLive();
}

/* ---------------------------------------------------- play from here */

export function playFromHere() {
  const r = state.review;
  if (!r) return;
  // v5: the record's rules and handicap carry over (the handicap is what
  // the Chinese count compensates); the root stones are set up.
  const game = gameAt(r.game, r.game.current);
  // v13: the game in progress goes to the Library as unfinished first.
  parkCurrent();
  dropReview(r);
  if (state.game) state.game.gen++;
  remember();
  const humanColor = game.turn;
  update((s) => {
    s.game = freshGameState(game, { opponent: "ai", humanColor });
    s.review = null;
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
  });
  persistCurrent();
  maybeComputerMove();
  ponder();
}

/* ---------------------------------------------------------- export */

/** Save the review as a PNG: the native save dialog, or a download. */
export async function exportReviewImage() {
  const r = state.review;
  const model = r && !r.analyzing ? reviewModel() : null;
  if (!model) return;
  update({ menu: null });
  const { renderReviewPNG } = await import("../play/review-image.js");
  const rec = recordIdOf(r) ? Games.getGame(recordIdOf(r)) : null;
  const date = rec?.finishedAt || rec?.updatedAt || model.at;
  const day = new Date(date || Date.now()).toISOString().slice(0, 10);
  const filename = `goban-studio-review-${day}.png`;
  const blob = await renderReviewPNG(model, { date, rating: reviewRating(r) });
  if (!blob) return toast(t("report.exportFailed"), "warn");
  // v13: in the app a failed write is an error, never a download link (a WebView ignores those).
  if (hasNative()) {
    if (!hasFileDialogs()) return toast(t("report.exportFailed"), "error", 6000);
    const path = await saveFileDialog({ title: t("report.exportImage"), defaultName: filename });
    if (path == null || (Array.isArray(path) && path.length === 0)) return;
    const chosen = normalizePaths(path)[0];
    if (chosen && (await writeBinaryFile(chosen, new Uint8Array(await blob.arrayBuffer())))) {
      revealPath(chosen);
      toast(t("report.exported"));
    } else toast(t("report.exportFailed"), "error", 6000);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("report.exported"));
}

export { loadSGF };
