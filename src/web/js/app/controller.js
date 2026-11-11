/**
 * Everything the app does, as plain functions over the state: the one door
 * the views use (`C.name`). Nothing is defined here; each name comes from
 * the module that owns it, listed by area, and a name is listed only when a
 * view or a test uses it — everything else stays inside its module. None of
 * it touches the DOM.
 */

// The app itself: starting up, the four spaces, the Library's games, the player's data
export { boot, finishOnboarding, startFirstRun, setPlayerRank } from "./boot.js";
export { SPACES, playHome, playBoard, goSpace, toggleFocus, restore } from "./spaces.js";
export { openRecord, lookAtRecord, reviewUnfinished, clearUnfinished, openClassic, deleteRecord, renameRecord, exportRecord, undoImport, importSGFText, importFromCollection, importAllFromCollection, importSources, importFiles, importPaths, pickImport, pasteSGF } from "./library-ctl.js";
export { setReloader, retryStore, continueReadOnly, resetDamaged, exportBackup, importBackup, restoreSnapshot, revealDataFolder, undoRestore, clearData, clearDataNow } from "./data-ctl.js";

// The shell: settings, sheets, history, menus
export { changeProfile, playerEstimate, playerRankNow, defaultRules, tx, setSetting, onMenusChanged, syncMenus, openSheet, closeSheet, resultText, teachingOn, setRestorer, canGoBack, canGoForward, back, forward } from "./ctl-core.js";
export { t } from "../i18n.js";

// Play: the game on the board
export { opponentOf, freshGameState, persistCurrent, saveToLibrary, unfinishedGame, parkCurrent, playReviewing, boardShown, playShowsBoard, isComputerTurn } from "./game-session.js";
export { clockTick, toggleDead, confirmScore, unratedReason, openPostGame, showFinished, ratingChange, reviewUnrated, resultHeadline, reviewCurrentGame, exportSGF, saveText } from "./game-end.js";
export { canPlayHere, humanPlay, clearGhost, ponder, moveSources, maybeComputerMove, retryComputerMove, teachTakeBack, teachKeep, teachShowBest, undo, canRedo, redo, requestPass, passAskText, passNow, cancelPass, acceptCount, dismissProposal, requestResign, askHint, resumePlay } from "./game-turn.js";
export { restoreCurrent, resumeRecord, suggestedOpponent, BEGINNER_RANK, firstRunOffer, recommendedGame, newGame, continueCurrent, openNewGame, playFromHere } from "./game-start.js";
export { thinkTime } from "./feel.js";

// Review
export { recordIdOf, ownGame, reviewIndex, reviewDepth, onMainLine, toggleLive, currentEval, toggleOwnership, reviewOwnershipMap } from "./review-position.js";
export { reviewModel, reviewRating, saveEdits } from "./review-analysis.js";
export { reviewGoto, gotoNode, reviewStep, backToMainLine, branchPoints, discardDraft, draftKeepable } from "./review-nav.js";
export { keepDraft, canUndoEdit, canRedoEdit, reviewUndo, reviewRedo, deleteVariation, setComment, commitComment, toggleMark, setMarkTool, clearMarks, deleteBranch, promoteVariation, treeLayout } from "./review-edit.js";
export { showVariation, showStory, storyStep, focusMistake } from "./review-insight.js";
export { canTry, triable, tryAgain, tryMove, tryRetry, tryNext, closeTrial, canRecount, startRecount, cancelRecount, confirmRecount } from "./review-try.js";
export { openReview, closeReview, dropReview, reviewPlay } from "./review-session.js";
export { openFreeBoard, freeBoardEmpty, setFreeBoardSize, saveFreeBoard, exportReviewImage } from "./review-board.js";
export { lossesOf, describeMistakes } from "./explain.js";

// Practice: lessons and problems, today's session, placement, the beginner's bridges
export { gradeOf, gradeBandText, allLessons, nextLesson, openLesson, lessonContinue, lessonBack, practiceHome, openCatalog, openTopic, openShape, problemsOfTopic, problemsOfTheme, practiseTheme, problemsOfShape, shapeName, themeName, openProblem, practicePlay, feedbackKey, endgameArgs, answerValue, retryProblem, undoProblemMove, clearProblemGhost, problemHint, showAnswer, nextProblem, prevProblem, goalText, defGoalText, defToMove, problemNamed, nameKnown, stepGoalText, revealMistake, nextAfterMistake } from "./practice-ctl.js";
export { practicePath, focusName, weekFocus, todaysSession, setDailySize, upNext, pathNow, sessionPlace, sessionItem, startPath, openPathItem, itemDone, lessonFinished, continuePath, resetSession } from "../practice/session.js";
export { placementOffered, placementPlace, startPlacement, placementAnswer, continuePlacement, skipPlacement } from "../practice/placement.js";
export { startFirstGame, startCapture, captureAgain, captureCanPlay, capturePlay, captureResultLine } from "./capture-ctl.js";
export { COURSE, PROBLEMS, SHAPES, THEMES } from "../content.js";

// The Library's background analysis and the opening explorer
export { storedAnalysis, storeAnalysis, moveRankOf, analysisJob, wantsAnalysis, queueAnalysis, BATCH_KEY, batchCandidates, analyseAll, cancelBatch, resumeBatch, autoAnalyse, rowAnalysis } from "../play/analysis.js";
export { theBook, openExplorer, closeExplorer, explorerState, setExplorerMode, explorerBook, lastMoveVerdict, explorerCandidates, LOSS_NOISE, candidateShows, explorerEval, isLocal, explorerZoomable, explorerView, toggleExplorerZoom, pointLabel, explorerPlay, explorerStep, explorerCanStep, explorerReset, explorerMoveCount, explorerPlayFromHere, bookExit } from "./explorer-ctl.js";
export { decodeMove } from "../book.js";

// Updates and optional networks
export { canCheckUpdates, checkForUpdates, openReleasePage, downloadUpdate, cancelUpdate, applyUpdate, restoreUpdateState } from "./update-ctl.js";
export { modelErrorText, refreshModels, downloadModel, cancelModelDownload, removeModel } from "./models-ctl.js";

// Content the views read here
export { CLASSICS } from "../content.js";
