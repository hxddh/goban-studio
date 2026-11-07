/**
 * Learn: the placement quiz (learn/placement.js over model/player.js). Six
 * problems on a staircase; the first answer to each counts; the grade it
 * ends on is stored and shapes the path; skipping is remembered.
 */
import { test, assert, bundle, sleep } from "./helpers.mjs";

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export * as S from "./src/web/js/solver.js";',
  'export { GRADES } from "./src/web/js/content.js";',
  'export { setLang } from "./src/web/js/i18n.js";',
]);
const { C, state, PM, S, GRADES } = A;

function knowsRules() {
  state.settings = { ...A.DEFAULT_SETTINGS, lang: "en", onboarded: true, experience: "rules", playerRank: 25 };
  state.profile = PM.newProfile({ rank: 25 });
  state.space = "learn";
  state.learn = { view: "home", topic: null, lesson: null, problem: null, daily: null, placement: null };
  C.resetSession();
  A.setLang("en");
}

/** Solve the problem on the board move by move (waiting for each reply), or show the answer. */
async function answer(right) {
  const P = state.learn.problem;
  if (!right) return C.showAnswer();
  for (let guard = 0; guard < 20 && P.status !== "won"; guard++) {
    while (P.busy) await sleep(20);
    if (P.status === "won") break;
    const mv = S.winningMoves(P.pz, P.st)[0];
    if (!mv) break;
    C.practicePlay(mv.x, mv.y);
    await sleep(0);
  }
  while (P.busy) await sleep(20);
  assert.equal(P.status, "won", P.def.id);
}

await test("learn placement: offered once to someone who knows the rules; six problems up and down; the grade shapes the path", async () => {
  knowsRules();
  assert.equal(C.placementOffered(), true);
  C.startPlacement();
  const seen = [];
  // Right up to grade 3, wrong above it.
  for (let i = 0; i < 6; i++) {
    assert.equal(state.learn.view, "problem");
    const id = state.learn.problem.def.id;
    assert.ok(!seen.includes(id), "each problem once");
    seen.push(id);
    assert.deepEqual(C.placementPlace(), { n: i + 1, total: 6 });
    await answer(GRADES[id].grade <= 3);
    C.nextProblem();
  }
  assert.equal(GRADES[seen[0]].grade, 2, "starts at grade 2");
  assert.equal(state.learn.view, "home", "back on Learn's home");
  assert.equal(state.learn.placement, null);
  assert.equal(state.profile.placement.grade, 3);
  assert.equal(C.placementOffered(), false, "not offered again");
  // Recorded like any problem: the first answer of each.
  for (const id of seen) assert.ok(state.profile.problems[id], id);
  // The path now starts past the beginner units, with problems near grade 3.
  const items = C.pathNow().items;
  const lesson = items.find((it) => it.kind === "lesson");
  assert.ok(lesson && !lesson.unit.startsWith("u1"), JSON.stringify(lesson));
  assert.ok(!items.some((it) => it.kind === "capture"), "no capture Go");
});

await test("learn placement: Continue without an answer counts as missed; leaving ends it unfinished; Not now is remembered", () => {
  knowsRules();
  C.startPlacement();
  const first = state.learn.problem.def.id;
  C.nextProblem(); // no answer
  assert.equal(state.learn.placement.results[0].id, first);
  assert.equal(state.learn.placement.results[0].solved, false);
  assert.equal(GRADES[state.learn.problem.def.id].grade, 1, "one grade down");
  C.learnHome();
  assert.equal(state.learn.placement, null, "left: ended unfinished");
  assert.equal(state.profile.placement, null, "nothing stored");
  assert.equal(C.placementOffered(), true, "offered again");
  C.skipPlacement();
  assert.equal(C.placementOffered(), false);
  assert.equal(state.profile.placement.skipped, true);
  // A beginner is never asked.
  knowsRules();
  state.settings = { ...state.settings, experience: "new" };
  assert.equal(C.placementOffered(), false);
});
