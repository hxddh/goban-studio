/**
 * Review: a layer over any game. Whole-game analysis, live analysis of the
 * position on the board, free variations, explanations of key mistakes, and
 * turning a mistake into a drill.
 *
 * v5: a whole-game summary by phase (review.summary, see summary.js), the
 * trends across rated games, and editing the record itself: comments,
 * marks, deleting and promoting variations, and a layout of the game tree.
 * Edits to a saved game are written back to its library record.
 */
import { Game, influenceMap, MARK_KINDS, treeLayout as layoutTree } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import { markClassic, markOpening, addMistake } from "../persist.js";
import * as Lib from "../library.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { state, update, toast } from "./store.js";
import { back, canGoBack, remember, isRestoring } from "./ctl-core.js";
import { describeMistakes, lossesOf } from "./explain.js";
import { summarizeGame, trends } from "./summary.js";
import { freshGameState, persistCurrent, maybeComputerMove, ponder } from "./play-ctl.js";
import { openMistakeDrill } from "./practice-ctl.js";
import { reportFits } from "./report-model.js";

/* --------------------------------------------------------- analysis */

/**
 * Analyse every position of the main line. Returns an array aligned with
 * game.mainLine(); null when cancelled. Falls back to the offline estimate
 * per position when KataGo is not there.
 *
 * v7: every search is one background-lane job of the scheduler (engine.js),
 * so the computer's move and what the player looks at always go first;
 * `signal` (AbortSignal) cancels the pass, and a search still queued then
 * never runs.
 */
export async function analyzeLine(game, { visits = 40, signal = null, lane = "background", onProgress, onPoint, existing = null } = {}) {
  const line = game.mainLine();
  const points = new Array(line.length).fill(null);
  for (let i = 0; i < line.length; i++) {
    if (signal?.aborted) return null;
    // v5: positions already analysed (after an edit of the main line) are kept.
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

// lossesOf / describeMistakes live in explain.js (pure, tested in Node).
export { lossesOf, describeMistakes };

/** Key mistakes of a review, using its refined analyses when there are any. */
function keyMovesOf(review) {
  return describeMistakes(review.game, review.points, review.meta.humanColor ?? null, 3, review.refined).top;
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
      refreshSummary(review);
      update();
    }
  }
  if (signal.aborted) return;
  review.refining = false;
  update();
}

/** v7: stop every search a review started (leaving it, or a new pass). */
function stopReviewWork(r) {
  r?.ctl?.abort();
}

/* ------------------------------------------------------------- open */

export function openReview(game, meta = {}) {
  stopReviewWork(state.review);
  stopLive();
  if (!isRestoring()) remember();
  const line = game.mainLine();
  // v8: the game in play, still going: where it stands, so that moves tried
  // in the review never become the game's own moves (settleLive).
  const end = line[line.length - 1];
  const live = (meta.source || "current") === "current" && state.game?.game === game && !end.result ? { end, kids: end.children.slice() } : null;
  const startAt = meta.startAt ?? line.length - 1;
  game.goto(line[Math.max(0, Math.min(line.length - 1, startAt))].id);
  const review = {
    live0: live,
    game,
    source: meta.source || "current",
    meta,
    points: meta.points ? meta.points.slice() : new Array(line.length).fill(null),
    analyzing: false,
    analyzed: meta.points ? line.length : 0,
    engine: meta.points ? meta.points[0]?.source : null,
    keyMoves: [],
    ownership: false,
    variation: null,
    focus: null, // highlighted key move
    live: null,
    hover: null,
    guess: meta.guess ? { color: meta.guessColor ?? null, right: 0, tries: 0, last: null } : null,
    // v7: the review owns its searches; leaving it aborts this (scheduler.js).
    ctl: new AbortController(),
    // v4: deeper analyses after the top mistakes (index → analysis), and
    // whether that pass is running. See refineKeyMoves.
    refined: {},
    refining: false,
    // v5: whole-game summary (summary.js summarizeGame), the board-click
    // mark tool (null | a MARK_KINDS entry) and the state of record edits.
    summary: null,
    markTool: null,
    edits: { dirty: false, savedAt: 0, target: null },
    // v6: records open on the final position and move to the first key
    // moment once the analysis is done, unless the player has moved.
    autoJump: !!meta.autoJump,
  };
  review.edits.target = editTarget(review);
  if (meta.points) {
    review.keyMoves = keyMovesOf(review);
    refreshSummary(review);
  }
  update((s) => {
    s.review = review;
    s.space = meta.space || "play";
    s.sheet = null;
    s.menu = null;
  });
  if (!meta.guess && !meta.points) analyzeReview(review);
  else if (!meta.guess) refineKeyMoves(review);
  startLive();
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

export function closeReview() {
  const r = state.review;
  settleLive(r);
  if (r) saveEdits(r);
  if (canGoBack() && back()) return;
  stopReviewWork(r);
  stopLive();
  dropReview(r);
  const target = r?.meta?.back;
  update((s) => {
    s.review = null;
    if (target) s.space = target;
  });
}

/** Leave a review without touching history (used by restore). */
export function dropReview(r = state.review) {
  if (!r) return;
  settleLive(r);
  saveEdits(r);
  stopReviewWork(r);
  stopLive();
  if (r.source === "current" && state.game) {
    const line = state.game.game.mainLine();
    state.game.game.goto(line[line.length - 1].id);
    maybeComputerMove();
    ponder();
  }
  state.review = null;
}

async function analyzeReview(review, { existing = null } = {}) {
  const game = review.game;
  const signal = review.ctl.signal;
  review.analyzing = true;
  update();
  const size = game.size;
  const visits = size === 19 ? 40 : size === 13 ? 56 : 80;
  // v7: a background job of the scheduler, owned by this review (and
  // listed in Settings, where it can be stopped).
  const job = Engine.sched.startJob({
    kind: "review",
    signal,
    title: () => t("sched.job.review"),
    run: (job) =>
      analyzeLine(game, {
        visits,
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
            if (k % 16 === 0 || k === n) refreshSummary(review);
            update();
          }
        },
      }),
  });
  const points = await job.promise;
  if (signal.aborted) return;
  if (!points) {
    // Stopped from Settings: keep what is there.
    review.analyzing = false;
    review.keyMoves = keyMovesOf(review);
    refreshSummary(review);
    update();
    return;
  }
  review.analyzing = false;
  review.keyMoves = keyMovesOf(review);
  refreshSummary(review);
  if (review.source === "current" && state.game?.game === game) state.game.analysis = review.points;
  if (review.autoJump && state.review === review) {
    review.autoJump = false;
    const first = review.keyMoves.reduce((a, k) => (a == null || k.index < a ? k.index : a), null);
    const line = game.mainLine();
    if (first != null && line[first]) {
      game.goto(line[first].id);
      review.focus = first;
      startLive();
    }
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
  r.game.goto(node.id);
  r.variation = null;
  if (r.guess) r.guess.last = null;
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
 * A move on the review board: in guess mode it is a guess; otherwise it
 * opens (or follows) a variation from the position on screen.
 */
export function reviewPlay(x, y) {
  const r = state.review;
  if (!r) return;
  if (r.guess) return guessPlay(x, y);
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

/* ------------------------------------------- v5: whole-game summary */

function refreshSummary(review) {
  if (!review) return null;
  try {
    review.summary = summarizeGame(review);
  } catch (e) {
    console.error("summary failed", e);
    review.summary = null;
  }
  return review.summary;
}

/** The summary of the review on screen (computed on demand), or null. */
export function reviewSummary() {
  const r = state.review;
  if (!r) return null;
  return r.summary || refreshSummary(r);
}

/** Trends across the last `n` rated games (summary.js trends). */
export function gameTrends(n = 10) {
  return trends(state.progress, { n });
}

/* ------------------------------------------ v5: editing the record */

/** Where edits are saved: "record" (library), "current" (the game in play) or null (kept in memory only: classics, openings). */
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
 * new game). A stored report of other moves (a variation promoted, moves
 * deleted) is dropped, so a new one is made; comments and marks keep it.
 * Returns false when it could not be written (storage full).
 */
function saveRecord(id, game) {
  const rec = Lib.saveGame(game, { id, keepPlace: true });
  if (!rec) {
    toast(t("toast.saveFailed"), "error");
    return false;
  }
  if (rec.report && !reportFits(rec.report, game)) Lib.patchGame(id, { report: null });
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
    if (!Lib.getGame(r.meta.recordId)) return false;
    if (!saveRecord(r.meta.recordId, r.game)) return false;
  } else if (target === "current") {
    // v8: moves tried from where the game in play stands are not saved
    // with it (the review is still open; settleLive drops them on leaving).
    const at = r.live0;
    const all = at?.end.children;
    if (at) at.end.children = all.filter((c) => at.kids.includes(c));
    try {
      persistCurrent();
      if (state.game.recordId && Lib.getGame(state.game.recordId)) saveRecord(state.game.recordId, r.game);
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
  r.keyMoves = keyMovesOf(r);
  refreshSummary(r);
  if (r.source === "current" && state.game?.game === r.game && state.game.analysis) state.game.analysis = r.points;
  // Passes in flight write by main-line index: stop them (whole-game and
  // refinement alike) and start over with what is known.
  const wasRefining = r.refining;
  stopReviewWork(r);
  r.ctl = new AbortController();
  r.refining = false;
  if (r.analyzing || (hadAny && !r.guess && r.points.some((p) => !p))) analyzeReview(r, { existing: r.points.slice() });
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
  if (!r || r.guess || !state.settings.liveAnalysis || !state.engine.available) {
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
  import("../persist.js").then((m) => m.saveSettings(state.settings));
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

/** Turn a key mistake into a drill and start it. */
export function practiceThis(km) {
  const r = state.review;
  if (!r || !km.best || km.best.pass) return;
  const key = r.meta.recordId || r.meta.classicId || r.meta.openingId || "game-" + r.game.root.id;
  const m = {
    gameKey: key,
    index: km.index,
    sgf: r.game.toSGF(),
    color: km.move.color,
    played: { x: km.move.x, y: km.move.y },
    best: { x: km.best.x, y: km.best.y },
    accept: km.accept,
    loss: km.loss,
    theme: km.theme,
    size: r.game.size,
    // v8: a drill from a classic game or a pro opening is not the player's
    // own mistake; the training plan leaves it out of the weak themes.
    ...(r.meta.classicId || r.meta.openingId ? { own: false } : {}),
  };
  addMistake(state.progress, m);
  const id = `${key}-${km.index}`;
  openMistakeDrill(id);
}

/* -------------------------------------------------------- guessing */

export function guessPlay(x, y) {
  const r = state.review;
  if (!r?.guess) return;
  const line = r.game.mainLine();
  const i = reviewIndex();
  const next = line[i + 1];
  if (!next?.move) return;
  r.guess.tries++;
  if (!next.move.pass && next.move.x === x && next.move.y === y) {
    r.guess.right++;
    r.guess.last = "right";
    Audio.correct ? Audio.correct() : Audio.stone(false);
    advanceGuess();
  } else {
    r.guess.last = "wrong";
    r.guess.wrongAt = { x, y };
    Audio.wrong?.();
    update();
  }
}

export function revealGuess() {
  const r = state.review;
  if (!r?.guess || r.guess.done) return;
  r.guess.last = "revealed";
  advanceGuess();
}

function advanceGuess() {
  const r = state.review;
  const line = r.game.mainLine();
  let i = reviewIndex() + 1;
  r.game.goto(line[i].id);
  const color = r.guess.color;
  while (color != null && i + 1 < line.length && line[i + 1].move?.color !== color) {
    i++;
    r.game.goto(line[i].id);
  }
  if (i >= line.length - 1) {
    r.guess.done = true;
    if (r.meta.openingId) markOpening(state.progress, r.meta.openingId);
    if (r.meta.classicId) markClassic(state.progress, r.meta.classicId);
    Audio.win();
  }
  update();
}

export function toggleGuess() {
  const r = state.review;
  if (!r) return;
  r.guess = r.guess ? null : { color: null, right: 0, tries: 0, last: null };
  if (r.guess) {
    // v8: guessing needs a next move of the game: from a variation, the
    // main-line move it left; from the last move, the start of the game.
    const line = r.game.mainLine();
    let n = r.game.current;
    while (n.parent && !line.includes(n)) n = n.parent;
    if (n === line[line.length - 1]) n = line[0];
    r.game.goto(n.id);
    r.variation = null;
    stopLive();
    r.live = null;
  } else startLive();
  update();
}

/* ---------------------------------------------------- play from here */

function moveList(node) {
  const out = [];
  for (let n = node; n && n.parent; n = n.parent) out.push(n.move);
  return out.reverse();
}

export function playFromHere() {
  const r = state.review;
  if (!r) return;
  const src = r.game;
  const node = src.current;
  // v5: the record's rules and handicap carry over (the handicap is what
  // the Chinese count compensates); the root stones are set up below.
  const game = new Game({ size: src.size, rules: src.rules, komi: src.komi, handicap: src.handicap });
  const root = src.root.board.signMap;
  const setup = [];
  for (let y = 0; y < src.size; y++) for (let x = 0; x < src.size; x++) if (root[y][x]) setup.push({ x, y, c: root[y][x] });
  if (setup.length) game.setup(setup, src.root.turn);
  for (const m of moveList(node)) {
    if (m.pass) game.pass({ color: m.color, force: true });
    else game.play(m.x, m.y, { color: m.color, force: true });
  }
  game.current.result = null;
  if (game.current.phase !== "playing") game.current.phase = "playing";
  stopReviewWork(r);
  stopLive();
  if (state.game) state.game.gen++;
  remember();
  const humanColor = game.turn;
  update((s) => {
    s.game = freshGameState(game, { opponent: "ai", humanColor });
    s.review = null;
    s.space = "play";
  });
  persistCurrent();
  maybeComputerMove();
  ponder();
}

/** Re-open a game from history (restore). */
export function reopenFromLocation(loc, opener) {
  const rv = loc.review;
  if (!rv) return;
  opener(rv);
  if (state.review && rv.index >= 0) reviewGoto(rv.index);
}

export { loadSGF };
