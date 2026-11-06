/**
 * Play: the review controller — edits, variations and their storage in the game's file.
 */
import { test, BLACK, assert, bundle, sleep, v5Review } from "./helpers.mjs";

/** The review controller, bundled with the state and the games' store so they share one state. */
const loadControllers = () =>
  bundle([
    'export * as R from "./src/web/js/app/review-ctl.js";',
    'export { state } from "./src/web/js/app/store.js";',
    'export * as Lib from "./src/web/js/data/games.js";',
    'export * as P from "./src/web/js/data/settings.js";',
    'export * as PM from "./src/web/js/model/player.js";',
    'export { loadSGF } from "./src/web/js/sgf.js";',
    'export { buildReport, reportFits } from "./src/web/js/app/report-model.js";',
  ]);

await test("play review: saving edited moves drops a stored report of the old moves; comments keep it", async () => {
  const { R, state, Lib, P, PM, loadSGF, buildReport, reportFits } = await loadControllers();
  state.settings = { ...P.DEFAULT_SETTINGS, liveAnalysis: false };
  state.profile = PM.newProfile();
  const base = v5Review({ losses: { 25: 8 } });
  const rec = Lib.saveGame(base.game, { name: "v7 stale report", opponent: "ai", humanColor: BLACK });
  Lib.patchGame(rec.id, { report: buildReport({ game: loadSGF(rec.sgf).game, points: base.points, humanColor: BLACK }) });
  assert.ok(reportFits(Lib.getGame(rec.id).report, loadSGF(rec.sgf).game));
  R.openReview(loadSGF(rec.sgf).game, { source: "record", recordId: rec.id, humanColor: BLACK, points: base.points, startAt: 10 });
  // A comment only: the report still describes the game.
  R.setComment("note");
  R.saveEdits();
  assert.ok(Lib.getGame(rec.id).report, "a comment keeps the report");
  // A variation promoted to the main line: the stored report is of other moves.
  R.reviewGoto(30);
  R.reviewPlay(6, 6);
  assert.equal(R.promoteVariation(), true);
  R.saveEdits();
  assert.equal(Lib.getGame(rec.id).report, null, "a report of the old moves is dropped");
  R.dropReview();
  Lib.deleteGame(rec.id);
});

await test("play review: the controller edits comments, marks and variations and saves them to the library", async () => {
  const { R, state, Lib, P, PM, loadSGF } = await loadControllers();
  state.settings = { ...P.DEFAULT_SETTINGS, liveAnalysis: false };
  state.profile = PM.newProfile();
  const base = v5Review({ losses: { 25: 8 } });
  const rec = Lib.saveGame(base.game, { name: "v5 test", opponent: "ai", humanColor: BLACK });
  const { game } = loadSGF(rec.sgf);
  R.openReview(game, { source: "record", recordId: rec.id, humanColor: BLACK, points: base.points, startAt: 10 });
  const r = state.review;
  assert.equal(r.edits.target, "record");
  assert.equal(r.summary.confidence, "high");
  assert.equal(R.reviewSummary(), r.summary);
  assert.equal(r.summary.phases[1].players.black.blunders, 1);

  // Comment and marks on the move on the board, saved to the record.
  assert.equal(R.setComment("Too slow here"), true);
  assert.equal(R.setComment("Too slow here"), false, "no change, no edit");
  R.toggleMark("triangle");
  assert.equal(r.markTool, "triangle");
  R.reviewPlay(6, 6);
  assert.equal(r.game.current.children.length, 1, "with the tool, a click marks instead of playing");
  assert.deepEqual(r.game.current.marks, [{ x: 6, y: 6, type: "triangle" }]);
  R.toggleMark("label", 7, 7);
  R.toggleMark("triangle");
  assert.equal(r.markTool, null);
  assert.equal(r.edits.dirty, true);
  assert.equal(R.saveEdits(), true);
  let saved = loadSGF(Lib.getGame(rec.id).sgf).game.mainLine()[10];
  assert.equal(saved.comment, "Too slow here");
  assert.deepEqual(saved.marks.map((m) => m.type), ["triangle", "label"]);
  assert.equal(Lib.getGame(rec.id).name, "v5 test", "the record keeps its name and facts");
  assert.equal(Lib.getGame(rec.id).humanColor, BLACK);

  // A variation, promoted to the main line: analyses follow their positions.
  R.reviewGoto(30);
  const oldLine = r.game.mainLine();
  R.reviewPlay(6, 6); // a new move 31 for Black
  const branch = r.game.current;
  assert.equal(R.onMainLine(), false);
  const tree = R.treeLayout();
  assert.ok(tree.nodes.some((n) => n.node === branch && n.y === 1 && n.isCurrent));
  assert.equal(R.promoteVariation(), true);
  assert.equal(r.game.mainLine()[31], branch);
  assert.equal(r.points.length, 32);
  assert.equal(r.points[30], base.points[30], "the analysis of an unchanged position is kept");
  // The new position is analysed (offline here: the estimate).
  for (let k = 0; k < 200 && r.analyzing; k++) await sleep(5);
  assert.equal(r.analyzing, false);
  assert.equal(r.points[31]?.source, "estimate");
  assert.equal(r.summary.moves, 31);
  assert.equal(r.summary.confidence, "low", "partly estimated");
  R.saveEdits();
  saved = loadSGF(Lib.getGame(rec.id).sgf).game;
  assert.equal(saved.mainLine().length, 32);
  assert.equal(saved.mainLine()[30].children.length, 2, "the old main line is kept as a variation");

  // Delete the old line (now a variation); the main line is untouched.
  const oldNext = oldLine[31];
  assert.equal(R.deleteBranch(oldNext), true);
  assert.equal(r.game.mainLine()[30].children.length, 1);
  assert.equal(R.deleteBranch(r.game.root), false);
  // deleteVariation() from inside a variation goes back to the branch point.
  R.reviewGoto(5);
  R.reviewPlay(12, 5);
  R.reviewPlay(12, 4);
  R.deleteVariation();
  assert.equal(r.game.current, r.game.mainLine()[5]);
  assert.equal(r.game.mainLine()[5].children.length, 1);
  R.dropReview();
  saved = loadSGF(Lib.getGame(rec.id).sgf).game;
  assert.equal(saved.mainLine()[30].children.length, 1, "leaving the review saved the last edits");
  assert.equal(typeof R.gameTrends().games, "number");
});
