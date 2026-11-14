/**
 * The review's whole-game analysis, its key mistakes and its model, kept
 * with their positions as the record is edited; and the edits written to
 * the record or the game in play.
 */
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { store } from "../data/store.js";
import { t } from "../i18n.js";
import { state, update, updateSlice } from "./store.js";
import { persistLive } from "./ctl-core.js";
import { buildReview, keyMovesOf as keyMistakes, reviewFits } from "../play/review-model.js";
import { analyzeLine, storeAnalysis, visitsFor } from "../play/analysis.js";
import { recordIdOf, startLive } from "./review-position.js";

/* --------------------------------------------------------- analysis */

/** Key mistakes of a review, using its refined analyses when there are any. */
export function keyMovesOf(review) {
  return keyMistakes(review.game, review.points, review.meta.humanColor ?? null, review.refined);
}

/** The pass is done: store the analysis with the game, and keep it with the game in play. */
export function persist(review) {
  if (review.analyzing || !review.points.every(Boolean)) return;
  if (review.source === "current" && state.game?.game === review.game) state.game.analysis = review.points;
  const id = recordIdOf(review);
  if (id && review.edits.dirty) saveEdits(review);
  if (id) storeAnalysis(id, review.game, review.points, { humanColor: review.meta.humanColor ?? null, refined: review.refined, keyMoves: review.keyMoves });
}

/**
 * One deeper KataGo search of the position after each of the top three
 * mistakes (never more), for a sharper refutation line and ownership. Runs
 * after the whole-game pass; skipped without KataGo. Results are kept in
 * `review.refined[index]` and the key mistakes are explained again.
 */
export async function refineKeyMoves(review) {
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

/** Stop every search a review started (leaving it, or a new pass). */
export function stopReviewWork(r) {
  r?.ctl?.abort();
}

/** The first key moment, once the analysis is there (autoJump). */
export function jumpToFirst(review) {
  review.autoJump = false;
  const first = review.keyMoves.reduce((a, k) => (a == null || k.index < a ? k.index : a), null);
  const line = review.game.mainLine();
  if (first != null && line[first]) {
    review.game.goto(line[first].id);
    review.focus = first;
  }
}

export async function analyzeReview(review, { existing = null } = {}) {
  const game = review.game;
  const signal = review.ctl.signal;
  review.analyzing = true;
  if (existing) {
    existing.forEach((p, i) => p && (review.points[i] = p));
    review.analyzed = existing.filter(Boolean).length;
  }
  update();
  // A background job of the scheduler, owned by this review.
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
            updateSlice("review");
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

/* ------------------------------------------------- the review model */

export function refreshModel(review) {
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

/* ------------------------------------------ Editing the record */

/** Where edits are saved: "record" (its file), "current" (the game in play) or null (kept in memory only: classics). */
export function editTarget(r) {
  if (r.source === "record" && r.meta.recordId) return "record";
  if (r.source === "current" && state.game?.game === r.game) return "current";
  return null;
}

let saveTimer = 0;

// Quitting (or anything else that writes everything out) takes the last words of a comment with it.
store.onFlush?.(() => {
  if (state.review?.edits?.dirty) saveEdits(state.review);
});

export function edited(r, { mainBefore = null } = {}) {
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
 * one, when the comment box loses the focus, when the review closes, and
 * before the store writes everything out: quitting). Returns true when
 * something was saved.
 */
export function saveEdits(r = state.review) {
  clearTimeout(saveTimer);
  if (!r?.edits?.dirty) return false;
  // A line being tried is not part of the record: it is left out of what is written.
  const d = r.draft;
  if (d && d.from.children.includes(d.head)) {
    const kids = d.from.children;
    d.from.children = kids.filter((c) => c !== d.head);
    try {
      return writeEdits(r);
    } finally {
      d.from.children = kids;
    }
  }
  return writeEdits(r);
}

function writeEdits(r) {
  const target = editTarget(r);
  if (target === "record") {
    if (!Games.getGame(r.meta.recordId)) return false;
    if (!saveRecord(r.meta.recordId, r.game)) return false;
  } else if (target === "current") {
    // Moves tried from where the game in play stands are not saved
    // with it (the review is still open; settleLive drops them on leaving).
    const at = r.live0;
    const all = at?.end.children;
    if (at) at.end.children = all.filter((c) => at.kids.includes(c));
    try {
      persistLive();
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

export const nodeOf = (r, node) => (node == null ? r.game.current : typeof node === "object" ? node : r.game.nodeById(node));
