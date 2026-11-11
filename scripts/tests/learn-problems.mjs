/**
 * Learn: playing problems — the endgame questions and the problem window.
 */
import { test, PROBLEMS, assert, bundle, sleepMs } from "./helpers.mjs";

await test("learn problems: a tight problem window widens towards the open side", async () => {
  const { windowOf } = await import("../../src/web/js/board.js");
  // A bottom-right corner problem on 19×19: grows up and left only.
  assert.deepEqual(windowOf({ x0: 13, y0: 13, x1: 18, y1: 18 }, 19), { x0: 10, y0: 10, x1: 18, y1: 18 });
  // A centred window grows on both sides.
  const w = windowOf({ x0: 8, y0: 8, x1: 10, y1: 10 }, 19);
  assert.equal(w.x1 - w.x0, 8);
  assert.ok(w.x0 >= 4 && w.x1 <= 14);
  // A wide window keeps its width; a 9×9 board never goes past its edges.
  assert.deepEqual(windowOf({ x0: 0, y0: 14, x1: 18, y1: 18 }, 19), { x0: 0, y0: 10, x1: 18, y1: 18 });
  assert.deepEqual(windowOf({ x0: 2, y0: 2, x1: 4, y1: 4 }, 9), { x0: 0, y0: 0, x1: 8, y1: 8 });
  assert.deepEqual(windowOf(null, 13), { x0: 0, y0: 0, x1: 12, y1: 12 });
});

await test("learn problems: the endgame — practice plays a move question and answers a value question", async () => {
  const { C, state, P, PM } = await bundle([
    'export * as C from "./src/web/js/app/practice-ctl.js";',
    'export { state } from "./src/web/js/app/store.js";',
    'export * as P from "./src/web/js/data/settings.js";',
    'export * as PM from "./src/web/js/model/player.js";',
  ]);
  state.settings = { ...P.DEFAULT_SETTINGS };
  state.profile = PM.newProfile();
  // A value question: a wrong choice is marked, the right one solves it.
  const vq = PROBLEMS.find((p) => p.id === "endgame-count-01");
  C.openProblem(vq.id);
  let pr = state.learn.problem;
  assert.equal(C.goalText(pr.pz).includes("?") || C.goalText(pr.pz).includes("？"), true);
  C.practicePlay(5, 5);
  assert.equal(pr.history.length, 0, "a value question takes no moves");
  const wrong = vq.choices.find((v) => v !== vq.value);
  C.answerValue(wrong);
  assert.equal(pr.feedback, "wrong");
  assert.deepEqual(pr.wrongValues, [wrong]);
  assert.equal(C.feedbackKey(pr), "practice.endgame.valueWrong");
  C.answerValue(vq.value);
  assert.equal(pr.status, "won");
  assert.equal(C.feedbackKey(pr), vq.value === 1 ? "practice.endgame.valueRightOne" : "practice.endgame.valueRight");
  assert.deepEqual(C.endgameArgs(pr), [String(vq.value)]);
  assert.ok(pr.answer.length > 0, "the Black-first line is shown");
  // A move question: the right move, the computer's answer, until settled.
  const mq = PROBLEMS.find((p) => p.id === "endgame-hane-01");
  C.openProblem(mq.id);
  pr = state.learn.problem;
  const at = (q) => [q.x + mq.at[0], q.y + mq.at[1]];
  // A point the model does not read is refused, not played.
  C.practicePlay(...at({ x: 6, y: 1 }));
  assert.equal(pr.history.length, 0);
  C.practicePlay(...at(mq.answer[0]));
  for (let i = 0; i < 40 && pr.busy; i++) await sleepMs(50);
  assert.equal(pr.status, "open");
  assert.equal(pr.feedback, "keep", "White blocked; Black still has to connect");
  C.practicePlay(...at({ x: 4, y: 0 }));
  for (let i = 0; i < 40 && pr.status === "open"; i++) await sleepMs(50);
  assert.equal(pr.status, "won");
  assert.equal(C.feedbackKey(pr), mq.margin === 1 ? "practice.endgame.solvedOne" : "practice.endgame.solved");
  assert.deepEqual(C.endgameArgs(pr), [String(mq.margin)]);
});
