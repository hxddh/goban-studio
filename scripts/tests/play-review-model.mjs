/**
 * Play: the post-game review's model — the result, the three phases and the
 * key moments; the offline estimate's honesty; which moments can be tried
 * again, the drill each one is, and how a tried move is judged.
 */
import { test, BLACK, R, WHITE, assert, loadSGF, reportGame } from "./helpers.mjs";
import { addMistake, newProfile, recordMistake, due, DAY } from "../../src/web/js/model/player.js";

await test("play review model: a theme takeaway keeps its theme and topic (the review's Practise these link)", () => {
  const { game, points } = reportGame({ losses: { 5: 3, 25: 8, 30: 4, 79: 2.5 } });
  const kms = R.keyMovesOf(game, points, BLACK).map((km) => ({ ...km, theme: "cut" }));
  const m = R.buildReview({ game, points, humanColor: BLACK, keyMoves: kms, at: 1 });
  const tk = m.takeaways.find((x) => x.kind === "theme");
  assert.ok(tk, JSON.stringify(m.takeaways.map((x) => x.kind)));
  assert.equal(tk.theme, "cut");
  assert.ok(tk.topic, "the theme's topic");
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
});

await test("play review model: the result, the three phases and three key moments", () => {
  const { game, points } = reportGame({ losses: { 5: 3, 25: 8, 30: 4, 79: 2.5 } });
  const m = R.buildReview({ game, points, humanColor: BLACK, at: 1 });
  assert.equal(m.v, R.REVIEW_VERSION);
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
  // It is plain JSON (it is stored in the game's file) and knows its game.
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  assert.ok(R.reviewFits(m, game));
  const longer = loadSGF(game.toSGF()).game;
  assert.ok(R.reviewFits(m, longer), "the same moves read back from SGF");
  longer.goto(longer.mainLine().at(-1).id);
  longer.current.result = null;
  longer.play(6, 6, { force: true });
  assert.equal(R.reviewFits(m, longer), false, "an edited main line needs a new review");
  assert.equal(R.reviewFits({ ...m, v: 1 }, game), false, "a v1 report is not this model");
  // A game between two people describes both sides; a won game says so.
  const both = R.buildReview({ game, points, humanColor: null });
  assert.deepEqual([both.players, both.won, both.moments.length], [["black", "white"], null, 3]);
  const won = reportGame({ result: "B+3.5" });
  assert.equal(R.buildReview({ ...won, humanColor: BLACK }).won, true);
  assert.equal(R.buildReview({ ...won, humanColor: WHITE }).won, false);
  // The key mistakes the review already has give the same model.
  const kms = R.keyMovesOf(game, points, BLACK);
  assert.deepEqual(R.buildReview({ game, points, humanColor: BLACK, keyMoves: kms, at: 1 }), m);
  // An analysis is of these moves only when every position is there.
  assert.ok(R.analysisFits(points, game));
  assert.equal(R.analysisFits(points.slice(1), game), false);
  assert.equal(R.analysisFits(points.map((p, i) => (i === 3 ? null : p)), game), false);
});

await test("play review model: the offline estimate shows turning points — no phase numbers, no loss, no better move", () => {
  const { game, points } = reportGame({ losses: { 25: 8, 27: 5 }, source: "estimate" });
  const m = R.buildReview({ game, points, humanColor: BLACK });
  assert.equal(m.confidence, "low");
  assert.equal(m.phases, null, "no per-phase numbers from an estimate");
  assert.equal(m.totals, null);
  assert.deepEqual(m.takeaways, []);
  assert.deepEqual(m.moments.map((mo) => mo.index), [25, 27]);
  for (const mo of m.moments) assert.deepEqual([mo.best, mo.loss, mo.why, mo.theme, mo.accept], [null, null, null, null, []]);
  // Nothing to try again without KataGo's better move.
  assert.deepEqual(R.tryMoments(m), []);
  // The estimate's tempo bias (the mover gains about a point each move) is not a turning point.
  const tempo = reportGame({ source: "estimate" });
  tempo.points.forEach((p, i) => (p.scoreLead = i % 2 ? 1.2 : -0.2));
  assert.deepEqual(R.turningPoints(tempo.game, tempo.points, BLACK), []);
  // No analysis at all.
  const none = R.buildReview({ game, points: points.map(() => null), humanColor: BLACK });
  assert.deepEqual([none.confidence, none.phases, none.moments], ["none", null, []]);
});

await test("play review model: up to three moments can be tried again, each a drill of the game", () => {
  const { game, points } = reportGame({ losses: { 5: 3, 25: 8, 41: 1.5, 79: 2.5 } });
  const m = R.buildReview({ game, points, humanColor: BLACK });
  // 1.5 points is not a mistake; in game order.
  assert.deepEqual(R.tryMoments(m).map((mo) => mo.index), [5, 25, 79]);
  const many = reportGame({ losses: { 3: 3, 5: 4, 7: 5, 9: 6 } });
  const mm = R.buildReview({ ...many, humanColor: BLACK });
  assert.ok(R.tryMoments(mm).length <= R.MAX_TRIES);
  assert.deepEqual(R.tryMoments(R.buildReview({ ...reportGame(), humanColor: BLACK })), [], "a clean game has none");
  // The drill of a moment: the position before it, what was played and KataGo's move.
  const sgf = game.toSGF();
  const d = R.drillOf(m.moments[1], { sgf, gameId: "rec-1", size: 13 });
  assert.deepEqual([d.id, d.gameId, d.index, d.sgf, d.color, d.best, d.loss, d.size], ["rec-1-25", "rec-1", 25, sgf, BLACK, { x: 6, y: 6 }, 8, 13]);
  assert.deepEqual(d.played, m.moments[1].played);
  assert.ok(d.accept.some((p) => p.x === 6 && p.y === 6));
  // In the player model like any drill: once, and each try on the review schedule (v13: the memory model).
  let p = addMistake(newProfile(), d, 0);
  p = addMistake(p, d, 0);
  assert.equal(p.mistakes.length, 1);
  p = recordMistake(p, d.id, { solved: false }, 0);
  assert.equal(p.mistakes[0].due, DAY, "a missed moment comes back tomorrow");
  assert.deepEqual(due(p, DAY).mistakes.map((x) => x.id), ["rec-1-25"], "in Learn's due list");
  p = recordMistake(p, d.id, { solved: true }, DAY);
  p = recordMistake(p, d.id, { solved: true }, 2 * DAY);
  assert.deepEqual([p.mistakes[0].tries, p.mistakes[0].streak], [3, 2]);
  assert.ok(p.mistakes[0].due >= 5 * DAY, "found twice: at least three days later");
});

await test("play review model: a tried move is judged against KataGo's best, within MISTAKE is good", () => {
  const before = { scoreLead: 3, moves: [{ x: 6, y: 6, visits: 50, scoreLead: 3 }, { x: 2, y: 2, visits: 10, scoreLead: 1.5 }, { x: 9, y: 9, visits: 4, scoreLead: -4 }, { x: 1, y: 1, visits: 0, scoreLead: -20 }] };
  // KataGo's move and the moves it would accept are good at once.
  assert.deepEqual(R.judgeTry({ tried: { x: 6, y: 6 }, color: BLACK, before, accept: [{ x: 6, y: 6 }] }), { good: true, loss: 0 });
  // A searched candidate is read off the same search.
  assert.deepEqual(R.judgeTry({ tried: { x: 2, y: 2 }, color: BLACK, before }), { good: true, loss: 1.5 });
  assert.deepEqual(R.judgeTry({ tried: { x: 9, y: 9 }, color: BLACK, before }), { good: false, loss: 7 });
  // Anything else needs KataGo's look at the position after it (Black's lead).
  assert.equal(R.judgeTry({ tried: { x: 1, y: 1 }, color: BLACK, before }), null, "a candidate with no visits says nothing");
  assert.deepEqual(R.judgeTry({ tried: { x: 1, y: 1 }, color: BLACK, before, after: { scoreLead: 0.5 } }), { good: false, loss: 2.5 });
  assert.deepEqual(R.judgeTry({ tried: { x: 1, y: 1 }, color: BLACK, before, after: { scoreLead: 1 } }), { good: true, loss: 2 }, "exactly MISTAKE is still good");
  // White's side: a lower Black lead is better for White.
  const w = { scoreLead: -3, moves: [{ x: 6, y: 6, visits: 50, scoreLead: -3 }] };
  assert.deepEqual(R.judgeTry({ tried: { x: 0, y: 0 }, color: WHITE, before: w, after: { scoreLead: 2 } }), { good: false, loss: 5 });
  assert.deepEqual(R.judgeTry({ tried: { x: 0, y: 0 }, color: WHITE, before: w, after: { scoreLead: -5 } }), { good: true, loss: 0 }, "better than KataGo's first guess");
  assert.equal(R.judgeTry({ tried: { x: 0, y: 0 }, color: BLACK, before: null, after: null }), null);
});

await test("play review model: a stored review no longer fits once the result changes", () => {
  const { game, points } = reportGame({ losses: { 25: 8 }, result: null });
  const m = R.buildReview({ game, points, humanColor: BLACK, at: 1 });
  assert.ok(R.reviewFits(m, game), "the unfinished game");
  game.setResult("W+R");
  assert.ok(!R.reviewFits(m, game), "resigned with no new move: the old review is stale");
  assert.ok(R.reviewFits(R.buildReview({ game, points, humanColor: BLACK, at: 2 }), game));
});
