/**
 * Play: the report — its model, low-confidence estimates, drills and storage with the game.
 */
import { test, BLACK, R, WHITE, assert, loadSGF, reportGame } from "./helpers.mjs";
import { addMistake, newProfile } from "../../src/web/js/model/player.js";

await test("play report: the model has the result, the three phases and three key moments", () => {
  const { game, points } = reportGame({ losses: { 5: 3, 25: 8, 30: 4, 79: 2.5 } });
  const m = R.buildReport({ game, points, humanColor: BLACK, at: 1 });
  assert.equal(m.v, R.REPORT_VERSION);
  assert.equal(m.confidence, "high");
  assert.deepEqual([m.result, m.won, m.size, m.moves, m.rules, m.komi], ["W+R", false, 13, 80, game.rules, 6.5]);
  assert.deepEqual(m.players, ["black"]);
  assert.deepEqual(m.phases.map((p) => [p.id, p.from, p.to]), [["opening", 1, 20], ["middle", 21, 75], ["endgame", 76, 80]]);
  assert.deepEqual([m.phases[1].players.black.loss, m.phases[1].players.black.blunders], [8, 1]);
  assert.deepEqual([m.totals.black.loss, m.totals.black.mistakes, m.totals.black.blunders], [13.5, 2, 1]);
  assert.ok(m.takeaways.length > 0 && m.takeaways.every((tk) => tk.kind !== "estimate" && tk.key));
  // The player's three costliest moves, in game order, with the position before each.
  assert.deepEqual(m.moments.map((mo) => mo.index), [5, 25, 79]);
  const mo = m.moments[1];
  assert.deepEqual([mo.color, mo.loss, mo.best], [BLACK, 8, { x: 6, y: 6 }]);
  assert.equal(mo.thumb.length, 169);
  assert.equal(mo.thumb, R.thumbOf(game.mainLine()[24].board.signMap));
  assert.equal(mo.thumb[mo.played.y * 13 + mo.played.x], ".", "the move is not on the board yet");
  // It is plain JSON (it is stored with the library record) and knows its game.
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  assert.ok(R.reportFits(m, game));
  const longer = loadSGF(game.toSGF()).game;
  assert.ok(R.reportFits(m, longer), "the same moves read back from SGF");
  longer.goto(longer.mainLine().at(-1).id);
  longer.current.result = null;
  longer.play(6, 6, { force: true });
  assert.equal(R.reportFits(m, longer), false, "an edited main line needs a new report");
  assert.equal(R.reportFits({ ...m, v: 0 }, game), false);
  // A game between two people describes both sides; a won game says so.
  const both = R.buildReport({ game, points, humanColor: null });
  assert.deepEqual([both.players, both.won, both.moments.length], [["black", "white"], null, 3]);
  const won = reportGame({ result: "B+3.5" });
  assert.equal(R.buildReport({ ...won, humanColor: BLACK }).won, true);
  assert.equal(R.buildReport({ ...won, humanColor: WHITE }).won, false);
});

await test("play report: the low-confidence offline estimate shows turning points, not numbers", () => {
  const { game, points } = reportGame({ losses: { 25: 8, 27: 5 }, source: "estimate" });
  const m = R.buildReport({ game, points, humanColor: BLACK });
  assert.equal(m.confidence, "low");
  assert.equal(m.phases, null, "no per-phase numbers from an estimate");
  assert.equal(m.totals, null);
  assert.deepEqual(m.takeaways, []);
  assert.deepEqual(m.moments.map((mo) => mo.index), [25, 27]);
  for (const mo of m.moments) assert.deepEqual([mo.best, mo.loss, mo.why, mo.theme, mo.accept], [null, null, null, null, []]);
  // Nothing to practise without KataGo's better move.
  assert.deepEqual(R.drillMoments(m), []);
  assert.deepEqual(R.reportDrills(m, { sgf: game.toSGF(), gameKey: "g1", existing: [] }), { add: [], have: [] });
  // The estimate's tempo bias (the mover gains about a point each move) is not a turning point.
  const tempo = reportGame({ source: "estimate" });
  tempo.points.forEach((p, i) => (p.scoreLead = i % 2 ? 1.2 : -0.2));
  assert.deepEqual(R.turningPoints(tempo.game, tempo.points, BLACK), []);
  // No analysis at all.
  const none = R.buildReport({ game, points: points.map(() => null), humanColor: BLACK });
  assert.deepEqual([none.confidence, none.phases, none.moments], ["none", null, []]);
});

await test("play report: practising a game adds its worst mistakes as drills, never twice", () => {
  const { game, points } = reportGame({ losses: { 5: 3, 25: 8, 41: 1.5, 79: 2.5 } });
  const m = R.buildReport({ game, points, humanColor: BLACK });
  const sgf = game.toSGF();
  // Worst first; 1.5 points is not a mistake.
  assert.deepEqual(R.drillMoments(m).map((mo) => mo.index), [25, 5, 79]);
  let profile = newProfile();
  const first = R.reportDrills(m, { sgf, gameId: "rec-1", existing: profile.mistakes });
  assert.deepEqual(first.add.map((d) => d.id), ["rec-1-25", "rec-1-5", "rec-1-79"]);
  assert.deepEqual(first.have, []);
  const d = first.add[0];
  assert.deepEqual([d.gameId, d.index, d.sgf, d.color, d.best, d.loss, d.size], ["rec-1", 25, sgf, BLACK, { x: 6, y: 6 }, 8, 13]);
  assert.deepEqual(d.played, m.moments[1].played);
  assert.ok(d.accept.some((p) => p.x === 6 && p.y === 6));
  for (const e of first.add) profile = addMistake(profile, e, 0);
  assert.equal(profile.mistakes.length, 3);
  assert.deepEqual(profile.mistakes.map((x) => x.id).sort(), ["rec-1-25", "rec-1-5", "rec-1-79"], "the player model keeps the report's ids");
  // Again: nothing new, the three are found.
  const again = R.reportDrills(m, { sgf, gameId: "rec-1", existing: profile.mistakes });
  assert.deepEqual(again.add, []);
  assert.deepEqual(again.have.sort(), ["rec-1-25", "rec-1-5", "rec-1-79"]);
  // A drill made from the review under another key is the same position.
  const fromReview = [{ id: "game-7-25", gameId: "game-7", index: 25, sgf }];
  const mixed = R.reportDrills(m, { sgf, gameId: "rec-1", existing: fromReview });
  assert.deepEqual(mixed.add.map((x) => x.index), [5, 79]);
  assert.deepEqual(mixed.have, ["game-7-25"]);
  // At most three, and a clean game has none.
  const many = reportGame({ losses: { 3: 3, 5: 4, 7: 5, 9: 6 } });
  assert.ok(R.drillMoments(R.buildReport({ ...many, humanColor: BLACK })).length <= R.MAX_DRILLS);
  const clean = reportGame();
  assert.deepEqual(R.drillMoments(R.buildReport({ ...clean, humanColor: BLACK })), []);
});

await test("play report: a stored report no longer fits once the result changes", () => {
  const { game, points } = reportGame({ losses: { 25: 8 }, result: null });
  const m = R.buildReport({ game, points, humanColor: BLACK, at: 1 });
  assert.ok(R.reportFits(m, game), "the unfinished game");
  game.setResult("W+R");
  assert.ok(!R.reportFits(m, game), "resigned with no new move: the old report is stale");
  assert.ok(R.reportFits(R.buildReport({ game, points, humanColor: BLACK, at: 2 }), game));
});

await test("play report: a two-player report drills one side at a time", () => {
  const mo = (index, color, loss) => ({ index, color, loss, best: { x: 0, y: 0 }, played: { x: 1, y: 1 }, accept: [] });
  const report = { confidence: "high", moments: [mo(10, 1, 8), mo(11, -1, 9), mo(20, 1, 5)] };
  assert.deepEqual(R.drillMoments(report, 3, 1).map((m) => m.index), [10, 20]);
  assert.deepEqual(R.drillMoments(report, 3, -1).map((m) => m.index), [11]);
  assert.equal(R.drillMoments(report).length, 3);
  const d = R.reportDrills(report, { sgf: "(;)", gameId: "g", color: -1 });
  assert.deepEqual(d.add.map((x) => x.index), [11]);
  assert.equal(d.add[0].id, "g-11");
});
