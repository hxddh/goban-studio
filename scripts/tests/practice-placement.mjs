/**
 * Practice: the placement quiz (practice/placement.js over model/player.js).
 * 10–12 problems on a staircase, drawn per player (a seed), with life and
 * death among them; the first answer to each counts; the grade it ends on
 * is stored and shapes the path; skipping is remembered.
 */
import { test, assert, bundle, sleep, pinDate } from "./helpers.mjs";

// The path is drawn from the day: the same day whenever the tests run.
pinDate();

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export * as S from "./src/web/js/solver.js";',
  'export { GRADES, PROBLEMS } from "./src/web/js/content.js";',
  'export { setLang } from "./src/web/js/i18n.js";',
]);
const { C, state, PM, S, GRADES, PROBLEMS } = A;

function knowsRules() {
  state.settings = { ...A.DEFAULT_SETTINGS, lang: "en", onboarded: true, experience: "rules", playerRank: 25 };
  state.profile = PM.newProfile({ rank: 25 });
  state.space = "practice";
  state.practice = { view: "home", topic: null, lesson: null, problem: null, daily: null, placement: null };
  C.resetSession();
  A.setLang("en");
}

/** Solve the problem on the board move by move (waiting for each reply), or show the answer. */
async function answer(right) {
  const P = state.practice.problem;
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

/** Take the whole quiz with `seed`, answering right up to `upTo`; the problems seen. */
async function takeQuiz(seed, upTo) {
  C.startPlacement({ seed });
  const seen = [];
  for (let i = 0; state.practice.placement && i < PM.PLACEMENT.MAX + 1; i++) {
    assert.equal(state.practice.view, "problem");
    const id = state.practice.problem.def.id;
    assert.ok(!seen.includes(id), "each problem once");
    assert.ok(!state.practice.problem.def.shown, "the quiz shows problems as written");
    seen.push(id);
    assert.deepEqual(C.placementPlace(), { n: i + 1, total: i + 1 > PM.PLACEMENT.MIN ? PM.PLACEMENT.MAX : PM.PLACEMENT.MIN });
    await answer(GRADES[id].grade <= upTo);
    C.nextProblem();
  }
  return seen;
}

await test("practice placement: offered once to someone who knows the rules; 10–12 problems drawn per player, up and down; the grade shapes the path", async () => {
  knowsRules();
  assert.equal(C.placementOffered(), true);
  // Right up to grade 3, wrong above it.
  const seen = await takeQuiz(11, 3);
  assert.ok(seen.length >= PM.PLACEMENT.MIN && seen.length <= PM.PLACEMENT.MAX, `${seen.length} problems`);
  assert.equal(GRADES[seen[0]].grade, 2, "starts at grade 2");
  const goals = seen.map((id) => PROBLEMS.find((d) => d.id === id).goal);
  assert.ok(goals.filter((g) => g === "kill" || g === "live").length >= 3, `life and death: ${goals}`);
  assert.equal(state.practice.view, "home", "back on Practice's home");
  assert.equal(state.practice.placement, null);
  assert.equal(state.profile.placement.grade, 3);
  assert.equal(C.placementOffered(), false, "not offered again");
  // Recorded like any problem: the first answer of each.
  for (const id of seen) assert.ok(state.profile.problems[id], id);
  // The path now starts past the beginner units, with problems near grade 3.
  const items = C.pathNow().items;
  const lesson = items.find((it) => it.kind === "lesson");
  assert.ok(lesson && !lesson.unit.startsWith("u1"), JSON.stringify(lesson));
  assert.ok(!items.some((it) => it.kind === "capture"), "no capture Go");
  // Another player (another seed) gets another quiz; the same seed the same one.
  knowsRules();
  const again = await takeQuiz(11, 3);
  knowsRules();
  const other = await takeQuiz(12, 3);
  assert.deepEqual(again, seen);
  assert.notDeepEqual(other, seen);
});

await test("practice placement: four misses in a row from the start end the quiz there, at grade 1", async () => {
  knowsRules();
  const seen = await takeQuiz(5, 0);
  assert.equal(seen.length, PM.PLACEMENT.FLOOR, "no more problems after the first four are missed");
  assert.deepEqual(seen.map((id) => GRADES[id].grade), [2, 1, 1, 1]);
  assert.equal(state.practice.placement, null);
  assert.equal(state.practice.view, "home");
  assert.equal(state.profile.placement.grade, 1);
  assert.equal(C.placementOffered(), false);
  // One solve among the first four: the quiz goes on to its usual length.
  knowsRules();
  const longer = await takeQuiz(5, 1);
  assert.ok(longer.length >= PM.PLACEMENT.MIN, `${longer.length} problems`);
  assert.equal(state.profile.placement.grade, 1);
});

await test("practice placement: Continue without an answer counts as missed; leaving ends it unfinished; Not now is remembered", () => {
  knowsRules();
  C.startPlacement({ seed: 3 });
  const first = state.practice.problem.def.id;
  C.nextProblem(); // no answer
  assert.equal(state.practice.placement.results[0].id, first);
  assert.equal(state.practice.placement.results[0].solved, false);
  assert.equal(GRADES[state.practice.problem.def.id].grade, 1, "one grade down");
  C.practiceHome();
  assert.equal(state.practice.placement, null, "left: ended unfinished");
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
