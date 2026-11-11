/**
 * Practice: a problem's reply timers belong to the attempt that set them.
 * Retry, Show answer, another problem or another page before the reply
 * comes: nothing plays into the new attempt and nothing is recorded for the
 * problem that was left.
 */
import { test, PROBLEMS, assert, bundle, sleepMs } from "./helpers.mjs";

const { C, state, P, PM } = await bundle([
  'export * as C from "./src/web/js/app/practice-ctl.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export * as P from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
]);
state.settings = { ...P.DEFAULT_SETTINGS, confirmProblemMove: false };
state.profile = PM.newProfile();
const mq = PROBLEMS.find((p) => p.id === "endgame-hane-01");
const at = (q) => [q.x + mq.at[0], q.y + mq.at[1]];

await test("practice timers: Retry before the reply: the old attempt's reply never plays into the new one", async () => {
  C.openProblem(mq.id);
  const pr = state.practice.problem;
  const start = pr.st;
  C.practicePlay(...at(mq.answer[0]));
  assert.equal(pr.busy, true, "the reply is on its way");
  C.retryProblem();
  await sleepMs(700);
  assert.equal(pr.history.length, 0, "no stone of the old attempt");
  assert.equal(pr.busy, false);
  assert.equal(pr.status, "open");
  assert.equal(pr.feedback, null);
  assert.deepEqual(pr.st.board ?? null, start.board ?? null);
  // The new attempt plays as usual.
  C.practicePlay(...at(mq.answer[0]));
  for (let i = 0; i < 40 && pr.busy; i++) await sleepMs(50);
  assert.equal(pr.feedback, "keep");
});

await test("practice timers: leaving the problem before the reply: nothing plays and nothing is recorded", async () => {
  C.openProblem(mq.id);
  const pr = state.practice.problem;
  const tries = state.profile.problems?.[mq.id]?.tries || 0;
  C.practicePlay(...at(mq.answer[0]));
  C.practiceHome();
  assert.equal(state.practice.view, "home");
  await sleepMs(700);
  assert.equal(pr.history.length, 1, "only the learner's own move");
  assert.equal(pr.busy, true, "the reply never came to the page that was left");
  assert.equal(state.profile.problems?.[mq.id]?.tries || 0, tries, "no attempt recorded");
});

await test("practice timers: another problem before the reply: the first one's reply does not touch it", async () => {
  C.openProblem(mq.id);
  C.practicePlay(...at(mq.answer[0]));
  const other = PROBLEMS.find((p) => p.id !== mq.id && p.topic === mq.topic) || PROBLEMS.find((p) => p.id !== mq.id);
  C.openProblem(other.id);
  const pr = state.practice.problem;
  await sleepMs(700);
  assert.equal(pr.def.id, other.id);
  assert.equal(pr.history.length, 0);
  assert.equal(pr.feedback, null);
});
