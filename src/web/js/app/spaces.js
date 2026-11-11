/**
 * The four spaces (Today, Play, Practice, Library): going to one, Play's
 * top, focus mode, and putting back a place from the history.
 */
import { state, update } from "./store.js";
import { remember, setSetting, syncMenus } from "./ctl-core.js";
import { boardShown, playShowsBoard } from "./game-session.js";
import { reviewCurrentGame, showFinished } from "./game-end.js";
import { maybeComputerMove, ponder } from "./game-turn.js";
import { closeReview, dropReview } from "./review-session.js";
import { reviewGoto } from "./review-nav.js";
import { practiceHome, openCatalog, openLesson, openMistakeDrill, openProblem, openShape, openTopic } from "./practice-ctl.js";
import { closeExplorer } from "./explorer-ctl.js";
import { itemKey, todaysSession } from "../practice/session.js";
import { resumeCapture } from "./capture-ctl.js";
import { openClassic, openRecord } from "./library-ctl.js";

/* --------------------------------------------------------------- spaces */

/** The four spaces (Today, Play, Practice, Library), in sidebar order. */
export const SPACES = ["today", "play", "practice", "library"];

/**
 * Play's top: the board while a game is not over, else
 * what to play next. Any review open in Play closes.
 */
export function playHome() {
  const live = playShowsBoard() && !state.game.game.current.result;
  const view = live ? "game" : "home";
  if (state.space === "play" && state.play.view === view && !state.review) return;
  remember();
  if (state.review) dropReview();
  update((s) => {
    s.space = "play";
    s.play = { ...s.play, view };
    s.menu = null;
  });
  if (live) {
    maybeComputerMove();
    ponder();
  }
  syncMenus();
}

/** The board of the game on it (Play). */
export function playBoard() {
  if (boardShown() && !state.review) return showFinished();
  remember();
  if (state.review && (state.review.meta.space || "play") === "play") dropReview();
  update((s) => {
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
    s.menu = null;
  });
  // A finished game's board is its review.
  showFinished();
  maybeComputerMove();
  ponder();
  syncMenus();
}

export function goSpace(space) {
  if (!SPACES.includes(space)) return;
  // The space you are in again: back to its top level.
  if (space === state.space) {
    if (space === "practice") {
      if (state.review && (state.review.meta.space || "play") === "practice") {
        remember();
        dropReview();
        return update();
      }
      if (state.practice.view !== "home") return practiceHome();
      return;
    }
    if (space === "library") {
      if (state.review && state.review.meta.space === "library") return closeReview();
      if (state.play.explorer) return closeExplorer();
      return;
    }
    if (space === "today") return;
    return playShowsBoard() && !playReviewingNow() ? playBoard() : playHome();
  }
  remember();
  // A record or classic is read in the Library; leaving the Library
  // closes it (its edits are kept), so no other space carries it along.
  if (state.review?.meta.space === "library") dropReview();
  // Play is the board while a game is not over; a game restored at launch with no move of the player's leaves Play on
  // its home (play-ctl playShowsBoard).
  const board = space === "play" && playShowsBoard() && !state.game.game.current.result && !playReviewingNow();
  update((s) => {
    s.space = space;
    s.menu = null;
    if (board) s.play = { ...s.play, view: "game", explorer: s.play.explorer };
  });
  if (space === "play") {
    if (board) showFinished();
    maybeComputerMove();
    ponder();
  }
  syncMenus();
}

function playReviewingNow() {
  return !!state.review && (state.review.meta.space || "play") === "play";
}

export function toggleFocus() {
  setSetting("focus", !state.settings.focus);
}

/** Put the app back where a history entry says it was. */
export function restore(loc) {
  if (state.review) dropReview();
  state.space = loc.space;
  state.play = { ...state.play, ...loc.play };
  const p = loc.practice;
  if (loc.space === "practice") {
    // An item of today's session comes back inside the session.
    const s = p.daily ? todaysSession() : null;
    const within = (kind, id) => {
      if (!s) return undefined;
      const key = itemKey({ kind, id });
      if (!s.items.some((it) => it.key === key)) return undefined;
      s.current = key;
      return { daily: s };
    };
    if (p.view === "lesson" && p.lessonId) openLesson(p.lessonId, p.lessonIndex, within("lesson", p.lessonId));
    else if (p.view === "problem" && p.problemId) openProblem(p.problemId, within("problem", p.problemId));
    else if (p.view === "mistake" && p.mistakeId) openMistakeDrill(p.mistakeId, within("mistake", p.mistakeId));
    else if (p.view === "capture") resumeCapture({ from: p.captureFrom });
    else if (p.view === "catalog") openCatalog();
    else if (p.view === "topic" && p.shape) openShape(p.shape);
    else if (p.view === "topic" && p.topic) openTopic(p.topic, p.theme || null);
    else practiceHome();
  }
  const rv = loc.review;
  if (rv) {
    if (rv.source === "current") reviewCurrentGame();
    else if (rv.source === "record" && rv.recordId) openRecord(rv.recordId, { look: true });
    else if (rv.source === "classic" && rv.classicId) openClassic(rv.classicId);
    if (state.review && rv.index >= 0) reviewGoto(rv.index);
  }
  // A finished game's board is its review.
  showFinished();
  update();
}
