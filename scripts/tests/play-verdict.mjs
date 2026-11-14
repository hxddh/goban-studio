/**
 * Play: the verdict on a move (play/verdict.js) — the points it lost
 * against the best move, and the word for them; the same threshold as the
 * teaching warning.
 */
import { test, assert } from "./helpers.mjs";
import { SLACK_FROM, mistakeFrom, moveLoss, tallyVerdicts, verdictOf } from "../../src/web/js/play/verdict.js";

await test("play verdict: the loss is the best move's lead minus the lead after the move, for the mover", () => {
  const before = { moves: [{ scoreLead: 3 }] };
  assert.equal(moveLoss(before, { scoreLead: 1 }, 1), 2, "Black lost two points");
  assert.equal(moveLoss(before, { scoreLead: 5 }, -1), 2, "White gained Black two: White lost two");
  assert.equal(moveLoss({ moves: [] }, { scoreLead: 1 }, 1), null, "no best move, nothing to say");
  assert.equal(moveLoss(before, { scoreLead: NaN }, 1), null);
});

await test("play verdict: the game's tally counts only the moves it kept, not one taken back", () => {
  // Moves 1 and 3 are on the main line; move "2b" was a mistake that was taken back.
  const line = [{ id: "root" }, { id: "1" }, { id: "2" }, { id: "3" }];
  const verdicts = { 1: 0.5, "2b": 9, 3: 2 };
  assert.deepEqual(tallyVerdicts(line, verdicts, 15), { good: 1, slack: 1, mistake: 0 });
  assert.deepEqual(tallyVerdicts(line, null, 15), { good: 0, slack: 0, mistake: 0 });
});

await test("play verdict: good below 1.5 points, slack from 1.5, a mistake at the teaching warning's threshold", () => {
  assert.equal(verdictOf(0, 15), "good");
  assert.equal(verdictOf(-2, 15), "good", "better than the engine's first choice is still good");
  assert.equal(verdictOf(SLACK_FROM, 15), "slack");
  assert.equal(verdictOf(3.9, 15), "slack");
  assert.equal(verdictOf(4, 15), "mistake");
  assert.equal(mistakeFrom(15), 4, "15 kyu");
  assert.equal(mistakeFrom(25), 4);
  assert.equal(mistakeFrom(8), 6, "8 kyu: wider");
  assert.equal(mistakeFrom(-2), 6, "3 dan");
  assert.equal(verdictOf(5, 8), "slack", "wider for the rank the warning is wider for");
  assert.equal(verdictOf(null, 15), null);
});
