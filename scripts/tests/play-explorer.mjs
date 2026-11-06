/**
 * Play: the opening explorer controller.
 */
import { test, BLACK, assert, bundle, empty, loadSGF, root, setup } from "./helpers.mjs";

await test("play explorer: book moves, out of the book, back/forward, reset and play from here", async () => {
  const { X, state, P, PM, loadSGF, store } = await bundle([
    'export { store } from "./src/web/js/data/store.js";',
    'export * as X from "./src/web/js/app/explorer-ctl.js";',
    'export { state } from "./src/web/js/app/store.js";',
    'export * as P from "./src/web/js/data/settings.js";',
    'export * as PM from "./src/web/js/model/player.js";',
    'export { loadSGF } from "./src/web/js/sgf.js";',
  ]);
  // The preview's store, opened before any later file's fake host (its writes come a moment later).
  await store.open();
  state.settings = { ...P.DEFAULT_SETTINGS };
  state.profile = PM.newProfile();
  state.engine = { available: false };
  X.openExplorer("whole");
  assert.equal(state.space, "play", "the explorer is part of Play");
  assert.equal(state.play.explorer, "whole");
  assert.ok(X.explorerBook(), "the empty board is in the book");
  const first = X.explorerCandidates();
  assert.ok(first.length >= 4 && first.every((c) => c.label), "candidates carry letters");
  // Q16 is a book move; the verdict comes from the book.
  X.explorerPlay(15, 3);
  assert.ok(X.explorerBook());
  const v = X.lastMoveVerdict();
  assert.ok(v && v.inBook && v.tag === "joseki", JSON.stringify(v));
  assert.ok(X.explorerEval().source === "book");
  // A first-line move leaves the book: no candidates offline.
  X.explorerPlay(0, 0);
  assert.equal(X.explorerBook(), null);
  assert.deepEqual(X.explorerCandidates(), []);
  X.explorerStep(-1);
  assert.equal(X.explorerMoveCount(), 1);
  X.explorerStep(1);
  assert.equal(X.explorerMoveCount(), 2);
  X.explorerReset();
  assert.equal(X.explorerMoveCount(), 0);
  X.explorerStep(1);
  X.explorerStep(1);
  assert.equal(X.explorerMoveCount(), 2, "forward follows the line after a reset");
  X.explorerStep(-1);
  // The corner tree keeps its own position; the whole board is kept too.
  X.setExplorerMode("corner");
  assert.equal(X.explorerMoveCount(), 0);
  assert.equal(state.explorer.game.root.board.signMap.flat().filter(Boolean).length, 4, "the corner setup");
  X.explorerPlay(15, 3);
  X.explorerPlay(16, 5);
  assert.ok(X.explorerBook(), "star point, small knight's approach");
  X.setExplorerMode("whole");
  assert.equal(X.explorerMoveCount(), 1);
  X.setExplorerMode("corner");
  // Play from here: a game against the computer with the setup and the line.
  X.explorerPlayFromHere();
  assert.equal(state.space, "play");
  assert.equal(state.play.view, "game", "the new game is on its board");
  assert.equal(state.play.explorer, null, "the explorer is closed");
  const g = state.game.game;
  assert.equal(g.mainLine().length, 3);
  assert.equal(g.root.board.signMap.flat().filter(Boolean).length, 4);
  assert.equal(state.game.humanColor, BLACK);
  assert.equal(state.game.opponent, "ai");
  // Review: where a game leaves the whole-board book (Q16 D4 Q4, the named
  // two-star opening, then a first-line move; SGF columns include the i).
  const { game } = loadSGF("(;GM[1]SZ[19];B[pd];W[dp];B[pp];W[aa];B[dd])");
  assert.equal(X.bookExit(game), 3);
  assert.equal(X.bookExit(loadSGF("(;GM[1]SZ[9];B[ee])").game), null);
  X.closeExplorer();
  assert.equal(state.play.explorer, null);
});
