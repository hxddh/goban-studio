/**
 * Play: what a player can take back or do again, and what is kept only on
 * purpose. A line tried in the review (keep / discard), the review's edit
 * history, redo after undo, passing without a sheet, the game that is not
 * rated, counting a finished game again (its rating step replaced, not
 * added twice), looking at an unfinished game without continuing it, and
 * the free board.
 */
import { test, assert, bundle, sleep } from "./helpers.mjs";

const A = await bundle([
  'export { store } from "./src/web/js/data/store.js";',
  'export * as C from "./src/web/js/app/controller.js";',
  'export * as Lib from "./src/web/js/data/games.js";',
  'export * as P from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export { state, runToastAction } from "./src/web/js/app/store.js";',
  'export { setLang, t } from "./src/web/js/i18n.js";',
  'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
  'export { loadSGF } from "./src/web/js/sgf.js";',
  'export { newClock } from "./src/web/js/app/clock.js";',
]);
const { store, C, Lib, P, PM, state, runToastAction, setLang, t, Game, BLACK, WHITE, loadSGF, newClock } = A;
await store.open();
setLang("en");
state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", onboarded: true, teaching: false, experience: "player", liveAnalysis: false };
state.profile = PM.newProfile();
state.engine = { kind: "offline", available: false };

const clear = () => {
  if (state.review) C.dropReview();
  for (const r of Lib.listGames()) Lib.deleteGame(r.id);
  state.toasts = [];
  state.sheet = null;
};
const PTS = [[2, 2], [6, 6], [2, 6], [6, 2], [4, 4], [3, 3], [5, 5], [3, 5], [5, 3], [4, 2]];
/** A 9×9 game on the board with `n` moves. */
function boardWith(n, { opponent = "human", humanColor = BLACK, rated = opponent === "ai" } = {}) {
  const game = new Game({ size: 9 });
  for (let i = 0; i < n; i++) game.play(...PTS[i]);
  state.game = C.freshGameState(game, { opponent, humanColor, rated });
  state.review = null;
  state.space = "play";
  state.play = { ...state.play, view: "game", explorer: null };
  C.persistCurrent();
  return state.game;
}
/** A saved record of `n` moves, open in the review at move `at`. */
function reviewOf(n = 8, at = 4) {
  const game = new Game({ size: 9 });
  for (let i = 0; i < n; i++) game.play(...PTS[i]);
  game.setResult("B+R");
  const rec = Lib.saveGame(game, { name: "record", opponent: "human" });
  C.openReview(loadSGF(Lib.getGame(rec.id).sgf).game, { source: "record", recordId: rec.id, space: "library", startAt: at });
  return { rec, r: state.review, saved: () => loadSGF(Lib.getGame(rec.id).sgf).game };
}
const toastOf = (message) => state.toasts.find((x) => x.message === message);

/* ----------------------------------------------- a line being tried */

await test("play edits: a stone in the review starts a line being tried; ← and → stay in it; it is never saved", () => {
  clear();
  const { r, saved } = reviewOf(8, 4);
  const from = r.game.current;
  C.reviewPlay(7, 7);
  assert.ok(r.draft, "a line is being tried");
  assert.equal(r.draft.from, from);
  assert.equal(r.edits.dirty, false, "trying a move is not an edit");
  C.reviewPlay(7, 6);
  assert.equal(C.reviewDepth(), 6);
  // ← goes back inside the line, never past the position it left; → comes back along it.
  C.reviewStep(-1);
  C.reviewStep(-1);
  assert.equal(r.game.current, from);
  C.reviewStep(-1);
  assert.equal(r.game.current, from, "← stops at the position the line left");
  C.reviewStep(1);
  assert.equal(r.game.current, r.draft.head, "→ follows the line being tried, not the main line");
  // A comment typed meanwhile is saved; the line being tried is not.
  C.setComment("while trying", from);
  assert.equal(C.saveEdits(), true);
  assert.equal(saved().mainLine()[4].comment, "while trying");
  assert.equal(saved().mainLine()[4].children.length, 1, "no stray branch in the file");
  assert.equal(from.children.length, 2, "it is still on the board");
  // Leaving the review drops it.
  C.dropReview();
  assert.equal(saved().mainLine()[4].children.length, 1);
});

await test("play edits: Discard (or Esc) returns to the position left; Keep adds the variation and saves it without a comment", () => {
  clear();
  const { r, saved } = reviewOf(8, 4);
  const from = r.game.current;
  C.reviewPlay(7, 7);
  C.reviewPlay(7, 6);
  assert.equal(C.discardDraft(), true);
  assert.equal(r.draft, null);
  assert.equal(r.game.current, from);
  assert.equal(from.children.length, 1, "the tried moves are gone");
  assert.equal(C.discardDraft(), false);
  // After a discard the keys follow the main line again.
  C.reviewStep(1);
  assert.equal(C.reviewIndex(), 5);
  C.reviewStep(-1);
  // Keep.
  C.reviewPlay(7, 7);
  assert.equal(C.keepDraft(), true);
  assert.equal(r.draft, null);
  assert.equal(r.edits.dirty, true, "a kept variation is an edit");
  assert.equal(C.saveEdits(), true);
  assert.equal(saved().mainLine()[4].children.length, 2, "kept, and saved with no comment typed");
  // Moving elsewhere while trying drops the line.
  C.reviewGoto(2);
  C.reviewPlay(0, 0);
  assert.ok(r.draft);
  C.reviewGoto(6);
  assert.equal(r.draft, null);
  assert.equal(r.game.mainLine()[2].children.length, 1, "moving away from a line being tried drops it");
  // A move that is already in the record is followed, not tried.
  C.reviewGoto(4);
  C.reviewPlay(7, 7);
  assert.equal(r.draft, null, "following a kept variation is not a new line");
  assert.equal(C.onMainLine(), false);
  C.dropReview();
});

await test("play edits: from the last move of a game still in play a line can be tried but not kept; earlier in the game it can", () => {
  clear();
  const g = boardWith(4);
  C.reviewCurrentGame();
  const r = state.review;
  const end = r.game.current;
  C.reviewPlay(7, 7);
  assert.ok(r.draft);
  assert.equal(C.draftKeepable(), false, "the game goes on from here");
  assert.equal(C.keepDraft(), false);
  assert.ok(r.draft, "still being tried");
  C.discardDraft();
  assert.equal(end.children.length, 0);
  C.reviewGoto(2);
  C.reviewPlay(7, 7);
  assert.equal(C.draftKeepable(), true);
  assert.equal(C.keepDraft(), true);
  C.dropReview();
  assert.equal(g.game.mainLine().length, 5, "the game is as long as it was");
  assert.equal(g.game.mainLine()[2].children.length, 2, "with the variation kept at move 2");
  assert.equal(g.game.current, g.game.mainLine()[4], "and the board back on its last move");
});

/* ------------------------------------------------- the edit history */

await test("play edits: comments, marks, kept and deleted variations are undone and redone; a toast offers Undo for what was removed", () => {
  clear();
  const { r, saved } = reviewOf(8, 4);
  const node = r.game.current;
  assert.equal(C.canUndoEdit(), false);
  // One spell of typing is one step.
  C.setComment("T");
  C.setComment("To");
  C.setComment("Too slow");
  C.commitComment();
  assert.equal(saved().mainLine()[4].comment, "Too slow", "the comment is written when the box loses the focus");
  C.setComment("Too slow here");
  C.commitComment();
  assert.equal(C.reviewUndo(), true);
  assert.equal(node.comment, "Too slow");
  assert.equal(C.reviewUndo(), true);
  assert.equal(node.comment || "", "");
  assert.equal(C.reviewUndo(), false, "nothing left to undo");
  assert.equal(C.reviewRedo(), true);
  assert.equal(C.reviewRedo(), true);
  assert.equal(node.comment, "Too slow here");
  assert.equal(C.canRedoEdit(), false);
  // Marks.
  C.toggleMark("triangle", 1, 1);
  C.toggleMark("square", 1, 2);
  C.reviewUndo();
  assert.deepEqual(node.marks.map((m) => m.type), ["triangle"]);
  C.reviewRedo();
  assert.deepEqual(node.marks.map((m) => m.type), ["triangle", "square"]);
  state.toasts = [];
  assert.equal(C.clearMarks(), true);
  assert.equal(node.marks.length, 0);
  const cleared = toastOf(t("edit.marksCleared"));
  assert.equal(cleared?.action?.label, t("common.undoAction"));
  runToastAction(cleared.id);
  assert.equal(node.marks.length, 2, "the toast's Undo puts the marks back");
  // A kept variation, deleted, and brought back.
  C.reviewPlay(7, 7);
  C.reviewPlay(7, 6);
  C.keepDraft();
  const tip = r.game.current;
  state.toasts = [];
  C.deleteVariation();
  assert.equal(node.children.length, 1);
  assert.equal(r.game.current, node, "the board shows the branch point");
  const deleted = toastOf(t("review.variationDeleted"));
  assert.ok(deleted?.action, "Deleted variation · Undo");
  runToastAction(deleted.id);
  assert.equal(node.children.length, 2, "the variation is back");
  assert.equal(r.game.current, tip, "and the board is where it was");
  C.reviewUndo(); // the Keep itself
  assert.equal(node.children.length, 1);
  C.reviewRedo();
  assert.equal(node.children.length, 2);
  // Promoting is undone to the order it had.
  const main = r.game.mainLine()[5];
  C.gotoNode(tip);
  assert.equal(C.promoteVariation(), true);
  assert.notEqual(r.game.mainLine()[5], main);
  C.reviewUndo();
  assert.equal(r.game.mainLine()[5], main);
  C.saveEdits();
  assert.equal(saved().mainLine()[4].children.length, 2);
  // While a line is tried, undo takes back its last move.
  C.reviewGoto(2);
  C.reviewPlay(0, 0);
  C.reviewPlay(0, 1);
  C.reviewUndo();
  assert.ok(r.draft && r.game.current === r.draft.head);
  C.reviewUndo();
  assert.equal(r.draft, null);
  assert.equal(r.game.current, r.game.mainLine()[2]);
  C.dropReview();
});

await test("play edits: the last words of a comment are written when everything is written out (quitting)", async () => {
  clear();
  const { saved } = reviewOf(6, 3);
  C.setComment("typed just before quitting");
  await store.flush();
  assert.equal(saved().mainLine()[3].comment, "typed just before quitting");
  C.dropReview();
});

/* ------------------------------------------------------ undo and redo */

await test("play edits: redo plays the moves of the last undo again, the computer's reply included, until a new move is played", () => {
  clear();
  const g = boardWith(6, { opponent: "ai", humanColor: BLACK });
  g.clock = newClock("fischer");
  state.toasts = [];
  assert.equal(C.canRedo(), false);
  C.undo();
  assert.equal(g.game.moveNumber, 4, "the player's move and the reply to it");
  assert.equal(g.undos, 1);
  assert.equal(C.canRedo(), true);
  assert.ok(toastOf(t("play.unratedNow")), "the first undo of a rated game says it will not be rated");
  C.undo();
  assert.equal(g.game.moveNumber, 2);
  assert.equal(state.toasts.filter((x) => x.message === t("play.unratedNow")).length, 1, "said once per game");
  const clock = JSON.stringify(g.clock);
  C.redo();
  assert.equal(g.game.moveNumber, 4);
  C.redo();
  assert.equal(g.game.moveNumber, 6);
  assert.deepEqual(g.game.mainLine().slice(1).map((n) => [n.move.x, n.move.y]), PTS.slice(0, 6), "the same moves, in the same order");
  assert.equal(g.game.turn, BLACK, "it is the player's turn, with no new reply asked for");
  assert.equal(g.thinking, false);
  assert.equal(JSON.stringify(g.clock), clock, "redo adds no time: those moves were already paid for");
  assert.equal(g.undos, 2, "an undo redone still counts: the game was told it is not rated");
  assert.equal(C.canRedo(), false);
  assert.equal(C.unratedReason(g), t("play.unrated.undos"), "and it is not rated, as the notice said");
  // Against a person an undo is one move; a new move ends the redo.
  const h = boardWith(3);
  C.undo();
  assert.equal(h.game.moveNumber, 2);
  assert.equal(C.canRedo(), true);
  C.humanPlay(8, 8);
  assert.equal(h.game.moveNumber, 3);
  assert.equal(C.canRedo(), false, "a new move was played");
  C.redo();
  assert.equal(h.game.moveNumber, 3);
});

await test("play edits: a game with undos or hints says why it was not rated", () => {
  assert.equal(C.unratedReason({ opponent: "ai", undos: 2, hints: 0 }), t("play.unrated.undos"));
  assert.equal(C.unratedReason({ opponent: "ai", undos: 0, hints: 1 }), t("play.unrated.hints"));
  assert.equal(C.unratedReason({ opponent: "ai", undos: 1, hints: 3 }), t("play.unrated.both"));
  assert.equal(C.unratedReason({ opponent: "ai", undos: 0, hints: 0 }), "");
  assert.equal(C.unratedReason({ opponent: "human", undos: 4 }), "", "a game between two people is never rated");
});

/* ------------------------------------------------------------- pass */

await test("play edits: the first pass is confirmed in the panel, later ones are played at once, and a pass that ends the game is confirmed", () => {
  clear();
  const g = boardWith(4);
  state.sheet = null;
  C.requestPass();
  assert.equal(state.sheet, null, "no sheet");
  assert.equal(g.passAsk, "first");
  assert.equal(g.game.moveNumber, 4, "nothing was played yet");
  assert.equal(C.passAskText(), t("play.passAsk"));
  assert.equal(C.cancelPass(), true);
  assert.equal(g.passAsk, null);
  C.requestPass();
  C.passNow();
  assert.equal(g.game.moveNumber, 5);
  assert.equal(g.game.current.move.pass, true);
  // The other side: its pass would end the game, so it is asked.
  C.requestPass();
  assert.equal(g.passAsk, "ends");
  assert.ok(C.passAskText().includes("Black"), C.passAskText());
  // A move instead: the question goes.
  C.humanPlay(8, 8);
  assert.equal(g.passAsk, null);
  assert.equal(g.game.moveNumber, 6);
  // Black has passed before: this pass is played at once, and Undo takes it back.
  C.requestPass();
  assert.equal(g.passAsk, null);
  assert.equal(g.game.moveNumber, 7);
  C.undo();
  assert.equal(g.game.moveNumber, 6);
  C.redo();
  assert.equal(g.game.moveNumber, 7);
  // White answers the pass: asked, and asking again (the shortcut twice) confirms; the count starts.
  C.requestPass();
  assert.equal(g.passAsk, "ends");
  C.requestPass();
  assert.equal(g.game.phase, "scoring");
  assert.ok(g.scoring, "two passes lead to the count");
});

/* ------------------------------------------------------ count again */

/** A 9×9 game against the computer that Black wins by 2.5 when nothing is dead: two walls, eighteen moves. */
async function countedGame() {
  const game = new Game({ size: 9 });
  for (let y = 0; y < 9; y++) {
    game.play(4, y);
    game.play(5, y);
  }
  state.game = C.freshGameState(game, { opponent: "ai", humanColor: BLACK, rated: true });
  state.review = null;
  state.space = "today"; // away from the board: the review is opened by the test
  C.persistCurrent();
  C.acceptCount();
  for (let k = 0; k < 400 && state.game.scoring?.source === "pending"; k++) await sleep(5);
  C.confirmScore();
  return state.game;
}

await test("play edits: counting a finished game again replaces its result and its rating step, never adds a second one", async () => {
  clear();
  state.profile = PM.newProfile();
  const g = await countedGame();
  const id = g.recordId;
  let rec = Lib.getGame(id);
  assert.equal(rec.result, "B+2.5");
  assert.ok(rec.rateBase?.eligible, "what the recount needs is kept with the game");
  const won = state.profile;
  assert.equal(won.games.find((x) => x.id === id).won, true);
  assert.equal(won.rating[9].games, 1);
  assert.equal(won.history.length, 1);
  // What losing that game would have done, from the same start.
  const lost = PM.recordGame(PM.newProfile(), { id: "x", at: won.games[0].at, size: 9, won: false, result: "W+70.5", moves: 20, color: BLACK, handicap: 0, opponent: rec.rateBase.opponent });
  // The review of the record: Count again.
  C.openReview(loadSGF(rec.sgf).game, { source: "record", recordId: id, humanColor: BLACK, space: "library" });
  const r = state.review;
  assert.equal(C.canRecount(), true);
  await C.startRecount();
  assert.ok(r.recount && r.recount.source !== "pending");
  assert.equal(r.game.current, r.game.mainLine().at(-1), "the final position is on the board");
  assert.ok(r.recount.score.territory, "with the territory to show on it");
  // Nothing changed: the same result, nothing rewritten.
  const same = r.recount.score.result;
  assert.equal(same, "B+2.5");
  // Black's wall is marked dead: White wins.
  C.reviewPlay(4, 0);
  assert.equal(r.recount.dead.length, 9, "a click marks the whole chain");
  assert.match(r.recount.score.result, /^W\+/);
  const result = r.recount.score.result;
  state.toasts = [];
  assert.equal(C.confirmRecount(), true);
  assert.equal(r.recount, null);
  rec = Lib.getGame(id);
  assert.equal(rec.result, result, "the stored result is the new one");
  assert.equal(loadSGF(rec.sgf).game.mainLine().at(-1).result, result);
  const p = state.profile;
  const mine = p.games.find((x) => x.id === id);
  assert.equal(mine.won, false);
  assert.equal(mine.rated, true);
  assert.equal(p.rating[9].games, 1, "one rated game, not two");
  assert.equal(p.history.length, 1, "one point in the history");
  assert.ok(Math.abs(p.rating[9].mu - lost.rating[9].mu) < 1e-9, "the estimate is what a loss from the same start gives");
  assert.ok(p.rating[9].mu < won.rating[9].mu);
  assert.ok(rec.rating?.after, "the result line's change is the new one");
  assert.ok(toastOf(t("recount.updated", [C.resultText(result)])));
  // Counting again with the same result changes nothing.
  await C.startRecount();
  C.reviewPlay(4, 0);
  assert.equal(C.confirmRecount(), false);
  assert.equal(state.profile, p, "the player model is untouched");
  // Esc leaves a recount.
  await C.startRecount();
  assert.equal(C.cancelRecount(), true);
  assert.equal(Lib.getGame(id).result, result);
  // Once another game on that board is rated, this one's step can no longer be replaced.
  C.changeProfile((q) => PM.recordGame(q, { id: "later", at: mine.at + 1000, size: 9, won: true, result: "B+R", moves: 30, color: BLACK, handicap: 0, opponent: rec.rateBase.opponent }));
  assert.equal(C.canRecount(), false);
  C.dropReview();
});

await test("play edits: Count again is for counted games of your own: not a resignation, a classic or an imported record", async () => {
  clear();
  state.profile = PM.newProfile();
  // A game between two people, counted: always possible (nothing is rated).
  const game = new Game({ size: 9 });
  for (let y = 0; y < 9; y++) {
    game.play(4, y);
    game.play(5, y);
  }
  game.pass();
  game.pass();
  game.setResult("B+2.5");
  const mine = Lib.saveGame(game, { opponent: "human" });
  C.openReview(loadSGF(Lib.getGame(mine.id).sgf).game, { source: "record", recordId: mine.id, space: "library" });
  assert.equal(C.canRecount(), true);
  await C.startRecount();
  C.reviewPlay(5, 0);
  assert.equal(C.confirmRecount(), true);
  assert.match(Lib.getGame(mine.id).result, /^B\+/);
  assert.notEqual(Lib.getGame(mine.id).result, "B+2.5");
  assert.equal(state.profile.games.length, 0, "a game between two people is not recorded");
  C.dropReview();
  // Resigned, or imported: not offered.
  const { r } = reviewOf(6, 3);
  assert.equal(C.canRecount(r), false, "a resignation has no count");
  C.dropReview();
  const imp = Lib.saveGame(game, { source: "import", name: "someone's game" });
  C.openReview(loadSGF(Lib.getGame(imp.id).sgf).game, { source: "record", recordId: imp.id, space: "library" });
  assert.equal(C.canRecount(), false);
  C.dropReview();
});

/* ----------------------------------------------- unfinished games */

await test("play edits: a game with fewer than two moves of the player's is not kept when it is replaced", () => {
  clear();
  // One stray click against the computer (and its reply).
  boardWith(2, { opponent: "ai", humanColor: BLACK });
  assert.equal(C.parkCurrent(), null);
  C.newGame({ size: 9, opponent: "human" });
  assert.equal(Lib.listGames().length, 0, "no row for a single click");
  // Two moves of the player's are a game worth keeping.
  boardWith(4, { opponent: "ai", humanColor: BLACK });
  assert.ok(C.parkCurrent({ quiet: true }));
  assert.equal(Lib.listGames().filter(Lib.isUnfinished).length, 1);
});

await test("play edits: 'Look at it' opens an unfinished game in the review without continuing it or setting the board's game aside", () => {
  clear();
  boardWith(6);
  const parked = C.parkCurrent({ quiet: true });
  const g = boardWith(4);
  const before = Lib.listGames().length;
  C.lookAtRecord(parked.id);
  assert.equal(state.review?.source, "record");
  assert.equal(state.review.meta.recordId, parked.id);
  assert.equal(state.space, "library");
  assert.equal(state.game, g, "the game on the board is still the game on the board");
  assert.equal(g.game.moveNumber, 4);
  assert.equal(Lib.listGames().length, before, "and it was not saved aside");
  assert.equal(C.reviewUnfinished(), true, "the review offers to continue it");
  C.dropReview();
  // Opening the row itself continues the game.
  C.openRecord(parked.id);
  assert.equal(state.game.recordId, parked.id);
  assert.equal(state.review, null);
});

await test("play edits: Clear unfinished games asks first, then removes them all; the board's game stays on the board", () => {
  clear();
  for (let i = 0; i < 4; i++) {
    boardWith(4 + i);
    C.parkCurrent({ quiet: true });
  }
  const g = state.game;
  const done = new Game({ size: 9 });
  done.play(2, 2);
  done.setResult("B+R");
  Lib.saveGame(done, { opponent: "human" });
  assert.equal(Lib.listGames().filter(Lib.isUnfinished).length, 4);
  C.clearUnfinished();
  assert.equal(state.sheet?.kind, "confirm");
  assert.equal(state.sheet.danger, true);
  assert.equal(Lib.listGames().length, 5, "nothing goes before the confirmation");
  state.sheet.onConfirm();
  assert.equal(Lib.listGames().filter(Lib.isUnfinished).length, 0);
  assert.equal(Lib.listGames().length, 1, "finished games are untouched");
  assert.equal(state.game, g);
  assert.equal(g.recordId, null, "the board's game no longer points at a deleted record");
});

/* ------------------------------------------------------ a free board */

await test("play edits: the free board takes stones as the record itself, in turn; its size while empty; Save to Library keeps it", () => {
  clear();
  boardWith(4);
  const g = state.game;
  C.openFreeBoard(13);
  const r = state.review;
  assert.equal(r.meta.free, true);
  assert.equal(state.space, "library");
  assert.equal(r.game.size, 13);
  assert.equal(r.analyzing, false, "an empty board is not analysed as a game");
  assert.equal(C.freeBoardEmpty(), true);
  C.setFreeBoardSize(9);
  assert.equal(state.review.game.size, 9);
  C.reviewPlay(2, 2);
  C.reviewPlay(6, 6);
  assert.equal(r.draft, null, "no line being tried: the stones are the record");
  assert.deepEqual(r.game.mainLine().slice(1).map((n) => n.move.color), [BLACK, WHITE], "black and white alternate");
  assert.equal(C.freeBoardEmpty(), false);
  C.setFreeBoardSize(19);
  assert.equal(r.game.size, 9, "the size is fixed once a stone is down");
  C.reviewUndo();
  assert.equal(r.game.mainLine().length, 2);
  C.reviewRedo();
  assert.equal(r.game.mainLine().length, 3);
  // Stepping back and playing elsewhere is a variation.
  C.reviewStep(-1);
  C.reviewPlay(4, 4);
  assert.equal(r.game.mainLine()[1].children.length, 2);
  assert.equal(Lib.listGames().length, 0, "nothing is saved until asked");
  const rec = C.saveFreeBoard();
  assert.equal(rec.source, "board");
  assert.equal(Lib.isUnfinished(Lib.getGame(rec.id)), false, "a board is not a game to continue");
  assert.equal(r.source, "record");
  C.reviewPlay(5, 5);
  C.saveEdits();
  const saved = loadSGF(Lib.getGame(rec.id).sgf).game;
  assert.equal(saved.mainLine()[1].children.length, 2);
  assert.equal(saved.mainLine()[1].children[1].children.length, 1, "later stones are saved with the record");
  assert.equal(state.game, g, "the game in play is untouched");
  C.dropReview();
  // Opening it again from the Library is the free board again.
  C.openRecord(rec.id);
  assert.equal(state.review.meta.free, true);
  C.dropReview();
});
