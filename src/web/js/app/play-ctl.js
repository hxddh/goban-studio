/**
 * Play's controller, by what it does (the views and controller.js import
 * from here):
 *   ./game-session.js  the game on the board: its state, saving, the unfinished game
 *   ./game-end.js      the clock, the count, the result and the rating, files
 *   ./game-turn.js     a move, the computer's reply, teaching, undo, pass, hints
 *   ./game-start.js    which game to offer, and starting or resuming one
 *
 * Each part imports only the ones above it. When a game ends, the same
 * board turns into its post-game review (review-ctl.js), in place.
 */
export { opponentOf, freshGameState, persistCurrent, saveToLibrary, unfinishedGame, parkCurrent, playReviewing, boardShown, playShowsBoard, isComputerTurn } from "./game-session.js";
export { restoreCurrent, resumeRecord, suggestedOpponent, BEGINNER_RANK, firstRunOffer, recommendedGame, newGame, continueCurrent, openNewGame, playFromHere } from "./game-start.js";
export { canPlayHere, humanPlay, clearGhost, ponder, moveSources, maybeComputerMove, retryComputerMove, teachTakeBack, teachKeep, teachShowBest, undo, canRedo, redo, requestPass, passAskText, passNow, cancelPass, acceptCount, dismissProposal, requestResign, askHint, resumePlay } from "./game-turn.js";
export { clockTick, toggleDead, confirmScore, unratedReason, openPostGame, showFinished, ratingChange, reviewUnrated, resultHeadline, reviewCurrentGame, exportSGF, saveText } from "./game-end.js";
export { thinkTime } from "./feel.js";
export { learnFromGame } from "./learn-game.js";
