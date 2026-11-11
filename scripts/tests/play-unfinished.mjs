/**
 * Play, v13: nothing replaces a game in progress silently. New game, Play
 * from here (a review, the explorer) and resuming another game save it to
 * the Library as unfinished; opening it there continues it with the same
 * record; it is not rated or analysed until finished. And an export that
 * the app cannot write is an error, never a fake success.
 */
import { test, assert, bundle } from "./helpers.mjs";

const A = await bundle([
  'export { store } from "./src/web/js/data/store.js";',
  'export * as Play from "./src/web/js/app/play-ctl.js";',
  'export * as Review from "./src/web/js/app/review-ctl.js";',
  'export * as X from "./src/web/js/app/explorer-ctl.js";',
  'export * as Analysis from "./src/web/js/play/analysis.js";',
  'export * as Lib from "./src/web/js/data/games.js";',
  'export * as P from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { setLang, t } from "./src/web/js/i18n.js";',
  'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
  'export { loadSGF } from "./src/web/js/sgf.js";',
]);
const { store, Play, Review, X, Analysis, Lib, P, PM, state, setLang, t, Game, BLACK, WHITE, loadSGF } = A;
await store.open();
setLang("en");
state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", onboarded: true, teaching: false, experience: "player" };
state.profile = PM.newProfile();
state.engine = { kind: "offline", available: false };

const clear = () => {
  for (const r of Lib.listGames()) Lib.deleteGame(r.id);
  state.toasts = [];
};
/** A two-player game on the board with `n` moves. */
function boardWith(n, { opponent = "human", humanColor = BLACK } = {}) {
  const game = new Game({ size: 9 });
  const pts = [[2, 2], [6, 6], [2, 6], [6, 2], [4, 4], [3, 3], [5, 5], [3, 5], [5, 3], [4, 2]];
  for (let i = 0; i < n; i++) game.play(...pts[i]);
  state.game = Play.freshGameState(game, { opponent, humanColor, rated: opponent === "ai" });
  state.review = null;
  Play.persistCurrent();
  return state.game;
}

await test("play unfinished: New game saves the game in progress to the Library as unfinished, and says so", () => {
  clear();
  boardWith(3);
  Play.newGame({ size: 9, opponent: "human" });
  const list = Lib.listGames();
  assert.equal(list.length, 1, "the game in progress is in the Library");
  assert.equal(list[0].moves, 3);
  assert.equal(Lib.isUnfinished(list[0]), true);
  assert.equal(state.game.game.moveNumber, 0, "the new game is on the board");
  assert.ok(state.toasts.some((x) => x.message === t("v13.parked")));
  // An empty board, or one where only the computer moved, has nothing to keep.
  Play.newGame({ size: 9, opponent: "human" });
  const g = new Game({ size: 9 });
  g.play(4, 4);
  state.game = Play.freshGameState(g, { opponent: "ai", humanColor: WHITE });
  assert.equal(Play.unfinishedGame(), false);
  Play.newGame({ size: 9, opponent: "human" });
  assert.equal(Lib.listGames().length, 1, "nothing more was saved");
});

await test("play unfinished: opening it continues it on the same record; the game it replaces is kept too; finishing it updates that record", async () => {
  clear();
  boardWith(4, { opponent: "ai", humanColor: BLACK });
  state.game.clock = { kind: "move30", left: 12 };
  const parked = Play.parkCurrent();
  assert.ok(parked && parked.rated === true && parked.clock?.kind === "move30", "what it takes to continue is saved with it");
  Play.newGame({ size: 9, opponent: "human" });
  // Another game in progress (two moves: worth keeping), then the unfinished one is opened.
  state.game.game.play(1, 1);
  state.game.game.play(7, 7);
  await Play.resumeRecord(parked.id);
  const g = state.game;
  assert.equal(g.recordId, parked.id);
  assert.equal(g.game.moveNumber, 4);
  assert.equal(g.opponent, "ai");
  assert.equal(g.humanColor, BLACK);
  assert.equal(g.rated, true);
  assert.equal(state.space, "play");
  assert.equal(state.play.view, "game");
  assert.equal(Lib.listGames().length, 2, "the replaced game was parked as well");
  // Finished: the same entry, with its result.
  g.game.setResult("B+R");
  Play.saveToLibrary({ quiet: true });
  const rec = Lib.getGame(parked.id);
  assert.equal(rec.result, "B+R");
  assert.equal(Lib.isUnfinished(rec), false);
  assert.equal(Lib.listGames().length, 2, "no second copy");
});

await test("play unfinished: an unfinished game is not rated and not analysed in the background", () => {
  clear();
  boardWith(10, { opponent: "ai", humanColor: BLACK });
  const rec = Play.parkCurrent();
  assert.ok(rec.moves >= 8);
  assert.equal(state.profile.games.length, 0, "the player model has not heard of it");
  assert.deepEqual(Analysis.batchCandidates(), [], "the quiet pass leaves it alone");
  assert.equal(Analysis.wantsAnalysis(Lib.getGame(rec.id)), false);
});

await test("play unfinished: Play from here in a review, and in the explorer, keep the game in progress", () => {
  clear();
  boardWith(3);
  const imp = new Game({ size: 9 });
  imp.play(4, 4);
  imp.play(5, 5);
  const r = Lib.saveGame(imp, { source: "import", name: "record" });
  Review.openReview(loadSGF(r.sgf ?? Lib.getGame(r.id).sgf).game, { source: "record", recordId: r.id, space: "library" });
  Play.playFromHere();
  assert.equal(Lib.listGames().filter((x) => Lib.isUnfinished(x)).length, 1, "the game in progress went to the Library");
  assert.equal(state.review, null);
  // The explorer's Play from here.
  state.game.game.play(0, 0);
  state.game.humanColor = state.game.game.turn === BLACK ? WHITE : BLACK;
  state.game.opponent = "human";
  X.openExplorer("whole");
  X.explorerPlay(15, 3);
  X.explorerPlayFromHere();
  assert.equal(Lib.listGames().filter((x) => Lib.isUnfinished(x)).length, 2, "and again from the explorer");
  assert.equal(state.play.explorer, null);
});

await test("play export: in the app, a file that cannot be written is an error toast, never a download link", async () => {
  const saved = globalThis.zero;
  const calls = [];
  try {
    globalThis.zero = {
      invoke: async (command) => {
        calls.push(command);
        // v13: the save dialog is the host's own command; the write fails.
        if (command === "studio.saveFileDialog") return "/read-only/game.sgf";
        throw new Error("EACCES");
      },
      on: () => () => {},
    };
    state.toasts = [];
    const ok = await Play.saveText("game.sgf", "(;GM[1])", "application/x-go-sgf");
    assert.equal(ok, false);
    assert.ok(calls.includes("studio.writeTextFile"), "the native write was tried");
    const last = state.toasts.at(-1);
    assert.equal(last.tone, "error");
    assert.equal(last.message, t("v13.exportFailed"));
    assert.ok(!state.toasts.some((x) => x.message === t("toast.exported")), "no fake success");
    // A dialog that fails is an error too (no download link in a WebView).
    globalThis.zero = { invoke: async () => { throw new Error("no dialog"); }, on: () => () => {} };
    state.toasts = [];
    assert.equal(await Play.saveText("game.sgf", "(;)"), false);
    assert.ok(!state.toasts.some((x) => x.message === t("toast.exported")), "no fake success");
    // Cancelling the dialog (the host answers null) says nothing.
    globalThis.zero = { invoke: async () => null, on: () => () => {} };
    state.toasts = [];
    assert.equal(await Play.saveText("game.sgf", "(;)"), false);
    assert.equal(state.toasts.length, 0);
  } finally {
    globalThis.zero = saved;
  }
});
