/**
 * Play: the opening explorer controller.
 */
import { test, BLACK, assert, bundle } from "./helpers.mjs";

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
  assert.equal(state.space, "library", "the explorer is part of the Library");
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

await test("play explorer: a row says nothing that is noise: no loss within half a point, no win rate for the book's good moves, no visits unless a search is running", async () => {
  const { X } = await bundle(['export * as X from "./src/web/js/app/explorer-ctl.js";']);
  assert.equal(X.LOSS_NOISE, 0.5);
  // A book move within the noise: only what kind of move it is.
  assert.deepEqual(X.candidateShows({ source: "book", loss: 0.1, winrate: 0.49, visits: 400, tag: "joseki" }), { loss: null, winrate: false, visits: false });
  assert.deepEqual(X.candidateShows({ source: "book", loss: 0, winrate: 0.5, visits: 0, tag: "joseki" }), { loss: null, winrate: false, visits: false });
  assert.deepEqual(X.candidateShows({ source: "book", loss: 0.49, winrate: 0.5, visits: 0 }), { loss: null, winrate: false, visits: false });
  // A move that costs something: what it costs, and the win rate that goes with it.
  assert.deepEqual(X.candidateShows({ source: "book", loss: 4.46, winrate: 0.31, visits: 400, tag: "mistake" }), { loss: 4.5, winrate: true, visits: false });
  assert.deepEqual(X.candidateShows({ source: "book", loss: 0.5, winrate: 0.47, visits: 0 }), { loss: 0.5, winrate: true, visits: false });
  // Live candidates: the search's numbers mean something, but never "0 visits".
  assert.deepEqual(X.candidateShows({ source: "live", loss: 0, winrate: 0.55, visits: 120 }), { loss: null, winrate: true, visits: true });
  assert.deepEqual(X.candidateShows({ source: "live", loss: 2, winrate: 0.4, visits: 0 }), { loss: 2, winrate: true, visits: false });
  assert.deepEqual(X.candidateShows({ source: "book", loss: null, winrate: undefined, visits: 0 }), { loss: null, winrate: false, visits: false });
});

