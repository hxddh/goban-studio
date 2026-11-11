/**
 * Opening a game for review and closing it, and what a click on the
 * review's board means in the mode it is in.
 */
import * as Games from "../data/games.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { state, update, toast, announce } from "./store.js";
import { back, canGoBack, remember, isRestoring, resumeLive } from "./ctl-core.js";
import { reviewFits } from "../play/review-model.js";
import { isOwnGame, knownPoints, notePoints, queueAnalysis, storedAnalysis, takeOver } from "../play/analysis.js";
import { attach, detach, leaveModes, recordIdOf, startLive, stopLive } from "./review-position.js";
import { analyzeReview, editTarget, edited, jumpToFirst, keyMovesOf, persist, refineKeyMoves, refreshModel, saveEdits, stopReviewWork } from "./review-analysis.js";
import { recountToggle, tryMove } from "./review-try.js";
import { record, toggleMark } from "./review-edit.js";
import { gotoNode } from "./review-nav.js";

/* ------------------------------------------------------------- open */

/**
 * Open the review of a game. meta: { source: "current" | "record" |
 * "classic", recordId, classic, classicId, name, humanColor, space, back,
 * startAt, autoJump, points, inPlace }. A saved game brings its stored
 * analysis (or the positions a stopped pass had); `inPlace` (the game just
 * ended) turns the board into its review without a history step.
 */
export function openReview(game, meta = {}) {
  // The review open before is closed for good first, as leaving it
  // would: its tried moves dropped (settleLive), its pass handed over, its
  // edits saved, and the game in play back on its last move. Before, only
  // its searches stopped, and a live game left one move back took the next
  // move as a branch.
  if (state.review) dropReview(state.review, { resume: false });
  stopLive();
  if (!isRestoring() && !meta.inPlace) remember();
  const line = game.mainLine();
  // The game in play, still going: where it stands, so that moves tried
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
    // The review owns its searches; leaving it aborts this (scheduler.js).
    ctl: new AbortController(),
    // Deeper analyses after the top mistakes (index → analysis), and
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
    // A line being tried on the board: { from, head } (the position it left, its first move), or null.
    draft: null,
    // The edits made in this review, for undo and redo.
    history: { undo: [], redo: [] },
    // A finished game counted again: { dead, score, source, token }, or null.
    recount: null,
    // Records open on the final position and move to the first key
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
  // A free board has no game to analyse: the position on it is looked at live.
  if (meta.free && !points) review.autoJump = false;
  else if (!points) analyzeReview(review, { existing });
  else {
    if (review.autoJump) jumpToFirst(review);
    // A stored review older than this model, or none: write it again.
    if (id && !reviewFits(rec?.report, game)) persist(review);
    refineKeyMoves(review);
  }
  startLive();
}

/**
 * Leaving a review of the game in play: moves tried from its last
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
  leaveModes(r);
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

/**
 * Leave a review without touching history (restore, a new game, another
 * review). `resume: false` (another review opens) leaves the game in play
 * waiting: the computer does not start its move under the new review.
 */
export function dropReview(r = state.review, { resume = true } = {}) {
  if (!r) return;
  leaveModes(r);
  settleLive(r);
  saveEdits(r);
  stopReviewWork(r);
  stopLive();
  handOver(r);
  if (r.source === "current" && state.game && state.game.game === r.game) {
    const line = state.game.game.mainLine();
    state.game.game.goto(line[line.length - 1].id);
    if (resume) resumeLive();
  }
  if (state.review === r) state.review = null;
}

/**
 * A move on the review board opens (or follows) a variation from the
 * position on screen; while a key moment is tried again, it is the try.
 */
export function reviewPlay(x, y) {
  const r = state.review;
  if (!r) return;
  if (r.recount) return recountToggle(x, y);
  if (r.trial) return tryMove(x, y);
  if (r.markTool) return toggleMark(r.markTool, x, y);
  const cur = r.game.current;
  const existing = cur.children.find((c) => c.move && !c.move.pass && c.move.x === x && c.move.y === y);
  if (existing) return gotoNode(existing);
  const before = r.game.mainLine();
  const res = r.game.play(x, y);
  if (!res.ok) {
    toast(t("error." + (res.reason || "illegal")), "warn");
    return;
  }
  Audio.stone(false);
  r.variation = null;
  r.autoJump = false;
  const node = r.game.current;
  if (r.meta.free) {
    // A free board: the stone is part of the record at once.
    const index = cur.children.indexOf(node);
    record(r, { kind: "move", at: cur, atRedo: node, undo: () => detach(r, cur, node), redo: () => attach(cur, node, index) });
    edited(r, { mainBefore: before });
  } else {
    if (!r.draft) {
      r.draft = { from: cur, head: node };
      announce(t("review.draft"));
    }
    update();
  }
  startLive();
}
