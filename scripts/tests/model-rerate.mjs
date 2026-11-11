/**
 * Model: a finished game counted again (model/rerate.js). Its rating step
 * is replaced, from the state the estimate had before the game, while it is
 * the last one on its board size; never added a second time.
 */
import { test, assert, BLACK } from "./helpers.mjs";
import * as PM from "../../src/web/js/model/player.js";
import { canRerate, rateBase, rerateGame } from "../../src/web/js/model/rerate.js";

const OPP = PM.implOpponent("L:10k", { size: 19 });
const game = (id, at, won, extra = {}) => ({ id, at, size: 19, won, result: won ? "B+3.5" : "W+2.5", moves: 180, color: BLACK, handicap: 0, opponent: OPP, ...extra });

await test("model rerate: the base is the estimate's state on that board before the game", () => {
  const p0 = PM.newProfile();
  const b0 = rateBase(p0, 19);
  assert.equal(b0.size, 19);
  assert.equal(b0.history, 0);
  assert.equal(b0.entry.games, 0, "nothing rated yet on this board: where the estimate starts");
  assert.deepEqual(b0.entry, p0.rating[19]);
  const p1 = PM.recordGame(p0, game("a", 1000, true));
  const b1 = rateBase(p1, 19);
  assert.equal(b1.entry.games, 1);
  assert.equal(b1.history, 1);
  assert.notEqual(b1.entry, p1.rating[19], "a copy, not the profile's own object");
});

await test("model rerate: a recount that turns a win into a loss gives the estimate a loss would have given, with one step in the history", () => {
  const p0 = PM.recordGame(PM.newProfile(), game("first", 1000, true));
  const base = rateBase(p0, 19);
  const won = PM.recordGame(p0, game("g", 2000, true));
  const lost = PM.recordGame(p0, game("g", 2000, false));
  assert.equal(canRerate(won, "g", base), true);
  const again = rerateGame(won, "g", { won: false, result: "W+2.5", opponent: OPP, base });
  assert.equal(again.rating[19].games, 2, "two rated games, not three");
  assert.equal(again.history.length, 2);
  assert.ok(Math.abs(again.rating[19].mu - lost.rating[19].mu) < 1e-9);
  assert.ok(Math.abs(again.rating[19].sigma - lost.rating[19].sigma) < 1e-9);
  const g = again.games.find((x) => x.id === "g");
  assert.equal(g.won, false);
  assert.equal(g.result, "W+2.5");
  assert.equal(g.rated, true);
  assert.equal(g.rating.after, lost.games.find((x) => x.id === "g").rating.after);
  assert.equal(again.games.length, 2, "still one entry for the game");
  assert.deepEqual(again.days, won.days, "no second practice day");
  // And back again: the same as never having been wrong.
  const back = rerateGame(again, "g", { won: true, result: "B+3.5", opponent: OPP, base });
  assert.ok(Math.abs(back.rating[19].mu - won.rating[19].mu) < 1e-9);
  assert.equal(back.history.length, 2);
});

await test("model rerate: a recount that ends in a draw takes the rating step back; one that gives a winner to a draw rates it", () => {
  const p0 = PM.newProfile();
  const base = rateBase(p0, 19);
  const won = PM.recordGame(p0, game("g", 2000, true));
  const drawn = rerateGame(won, "g", { won: null, result: "Draw", opponent: OPP, base });
  assert.deepEqual(drawn.rating[19], p0.rating[19], "the board's estimate is as before the game");
  assert.equal(drawn.history.length, 0);
  assert.equal(drawn.games.find((x) => x.id === "g").rated, false);
  assert.equal(drawn.games.find((x) => x.id === "g").won, null);
  const rated = rerateGame(drawn, "g", { won: true, result: "B+0.5", opponent: OPP, base });
  assert.equal(rated.rating[19].games, 1);
  assert.ok(Math.abs(rated.rating[19].mu - won.rating[19].mu) < 1e-9);
});

await test("model rerate: only the last rated game of a board can be replaced; an unrated one always can", () => {
  const p0 = PM.newProfile();
  const base = rateBase(p0, 19);
  let p = PM.recordGame(p0, game("old", 1000, true));
  p = PM.recordGame(p, game("new", 2000, false));
  assert.equal(canRerate(p, "old", base), false, "a later game on that board was rated from it");
  assert.deepEqual(rerateGame(p, "old", { won: false, result: "W+1.5", opponent: OPP, base }), p, "unchanged");
  assert.equal(canRerate(p, "new", rateBase(PM.recordGame(p0, game("old", 1000, true)), 19)), true);
  // A game on another board does not stand in the way.
  const other = PM.recordGame(PM.recordGame(p0, game("g", 1000, true)), { ...game("nine", 2000, true), size: 9 });
  assert.equal(canRerate(other, "g", base), true);
  // No base kept (a game from before this was stored): a rated game cannot be replaced.
  assert.equal(canRerate(PM.recordGame(p0, game("g", 1000, true)), "g", null), false);
  assert.equal(canRerate(p, "missing", base), false);
  // A game with an undo was never rated: recording it again changes only its result.
  const assisted = PM.recordGame(p0, game("a", 1000, true, { undos: 1 }));
  assert.equal(assisted.games[0].rated, false);
  assert.equal(canRerate(assisted, "a", null), true);
  const after = rerateGame(assisted, "a", { won: false, result: "W+4.5", opponent: OPP });
  assert.equal(after.games[0].won, false);
  assert.equal(after.games[0].rated, false, "still not rated");
  assert.deepEqual(after.rating[19], p0.rating[19]);
});
