/**
 * The game on the board (state.game): its state, saving it as it goes, the
 * Library record of a finished game, and the unfinished game that is parked
 * and resumed.
 */
import { BLACK, WHITE } from "../rules.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { t } from "../i18n.js";
import { state, update, toast } from "./store.js";
import { saveEdits } from "./review-analysis.js";

/* ------------------------------------------------------------ state */

/** The signal of everything a game queued (cancelled when it is replaced). */
export const gameSignal = (g) => Engine.sched.ownerSignal(g?.owner);

/**
 * The opponent of a game from its meta: the implementation it was
 * played with (`impl`) when the app still knows it, else what plays its
 * `rank` now (the New game choice, or the `opponentRank` setting).
 */
export function opponentOf(meta = {}) {
  if (meta.impl && Engine.impl(meta.impl)) return { rank: Engine.implLabel(meta.impl), impl: meta.impl };
  const o = Engine.opponentFor(meta.rank ?? state.settings.opponentRank);
  return { rank: o.label, impl: o.impl };
}

export function freshGameState(game, meta = {}) {
  // A new game ends whatever the last one still had queued (its
  // pondering); the last game's analysis carries on in the background
  // (play/analysis.js).
  if (state.game?.owner) Engine.sched.cancelOwner(state.game.owner);
  return {
    owner: Engine.sched.newOwner("game"),
    game,
    recordId: meta.recordId || null,
    name: meta.name || "",
    opponent: meta.opponent === "human" ? "human" : "ai",
    humanColor: meta.humanColor === WHITE ? WHITE : BLACK,
    // The opponent is a rank; `impl` is what plays it (opponents.js),
    // `rank` the measured rank of that implementation, as shown.
    ...opponentOf(meta),
    thinking: false,
    engineFailed: false, // The computer could not move; the panel offers Retry
    pondering: false,
    gen: 0,
    hint: null,
    scoring: null,
    undos: meta.undos || 0,
    hints: meta.hints || 0,
    saved: !!meta.recordId,
    clock: meta.clock || null,
    eval: null, // latest analysis of the position on the board
    before: null, // analysis of the position before the player's move (teaching)
    pending: null, // teaching warning waiting for the player's choice
    proposal: false, // "the game looks finished — count?"
    proposalSeen: -1, // The move number of the last "keep playing"
    aiLow: 0,
    ghost: null, // two-click placement
    redo: [], // moves taken back that Redo can play again: one list of moves per undo
    passAsk: null, // the pass waiting for its inline confirmation: "first" | "ends"
    assistSaid: false, // "this game will not be rated" was said
    captureFx: null,
    analysis: null, // whole-game analysis, shared with review
    rated: !!meta.rated,
  };
}

export function persistCurrent() {
  const g = state.game;
  if (!g) return;
  Games.saveCurrent(g.game, {
    recordId: g.recordId,
    humanColor: g.humanColor,
    opponent: g.opponent,
    rank: g.rank,
    impl: g.impl,
    name: g.name,
    undos: g.undos,
    hints: g.hints,
    clock: g.clock,
    rated: g.rated,
  });
}

function recordMeta(g) {
  return {
    id: g.recordId,
    name: g.name,
    humanColor: g.humanColor,
    opponent: g.opponent,
    rank: g.opponent === "ai" ? g.rank : null,
    impl: g.opponent === "ai" ? g.impl : null,
    undos: g.undos,
    hints: g.hints,
    source: "game",
  };
}

/**
 * Finished or explicitly saved games go to the history (data/games.js);
 * nothing else does. A write that fails is said once by the store's toast.
 */
export function saveToLibrary({ quiet = false } = {}) {
  const g = state.game;
  if (!g || g.game.moveNumber === 0) return null;
  const rec = Games.saveGame(g.game, recordMeta(g));
  g.recordId = rec.id;
  g.saved = true;
  persistCurrent();
  update();
  if (!quiet) toast(t("toast.saved"), "success");
  return rec;
}

/* ------------------------------------------- Unfinished games */

/** Moves the player made in a game (both sides' in a game between two people). */
function humanMoves(g = state.game) {
  if (!g) return 0;
  let n = 0;
  for (const node of g.game.mainLine()) if (node.move && (g.opponent === "human" || node.move.color === g.humanColor)) n++;
  return n;
}

/**
 * A game in progress that replacing it would lose: no result, and at least
 * one move of the player's. Also what "a game in progress" means on
 * Today and Play's home (play/home.jsx gameInProgress), and whether Play
 * opens on the board at launch: a board where only the computer moved is
 * not one yet.
 */
export function unfinishedGame(g = state.game) {
  return !!g && !g.game.mainLine().at(-1)?.result && !g.game.current.result && humanMoves(g) > 0;
}

/**
 * Before anything replaces the game on the board (New game, Play from
 * here, a game of the Library resumed, the explorer's Play from here): a
 * game in progress is saved to the Library as unfinished, with what it
 * takes to continue it (docs/design.md, "Unfinished games"). Opening it
 * there continues it (resumeRecord). It is not rated until it is finished.
 * A game with fewer than KEEP_MOVES moves of the player's is not kept (a
 * stray click does not make a row in the Library), unless it is already
 * there. Returns its record, or null when there was nothing to keep.
 */
const KEEP_MOVES = 2;

export function parkCurrent({ quiet = false } = {}) {
  const g = state.game;
  if (!unfinishedGame(g)) return null;
  if (humanMoves(g) < KEEP_MOVES && !(g.recordId && Games.getGame(g.recordId))) return null;
  // A review of this game open on top (Review so far) keeps its edits.
  if (state.review?.source === "current" && state.review.game === g.game) saveEdits(state.review);
  const rec = Games.saveGame(g.game, { ...recordMeta(g), clock: g.clock || null, rated: !!g.rated });
  g.recordId = rec.id;
  g.saved = true;
  if (!quiet) toast(t("data.parked"));
  return rec;
}

/** Play shows a review instead of the live game. */
export function playReviewing() {
  return !!state.review && (state.review.meta.space || "play") === "play";
}

/**
 * The game's board is on screen — by the same rule Play draws it
 * (app.jsx PlaySpace): in Play, no review, and the game view or a game that
 * is not over. The clock, the report and the board's keys follow this.
 */
export function boardShown() {
  return state.space === "play" && !playReviewing() && playShowsBoard();
}

/**
 * Play shows the board (else its home): the game view, or a game in
 * progress (unfinishedGame). A game just started is in the game view; one
 * restored at launch with no move of the player's yet, or none at all,
 * leaves Play on its home with the suggested game.
 */
export function playShowsBoard() {
  return !!state.game && (state.play.view === "game" || unfinishedGame());
}

export function isComputerTurn() {
  const g = state.game;
  return !!g && g.opponent === "ai" && g.game.phase === "playing" && !g.game.current.result && g.game.turn !== g.humanColor;
}

export function gameOver(g = state.game) {
  return !!g.game.current.result;
}
