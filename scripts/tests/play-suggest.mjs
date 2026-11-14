/**
 * Play's suggested game: beginners start on 9×9 (with 13×13, the next
 * board up, as the other option); stronger players on 19×19 with a quick
 * 9×9 beside. The steps between the boards: scripts/tests/shell-first-run.mjs.
 */
import { test, assert, bundle } from "./helpers.mjs";

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export { classicYear } from "./src/web/js/app/play.jsx";',
  'export { CLASSICS_SHOWN } from "./src/web/js/play/library.jsx";',
  'export { CLASSICS } from "./src/web/js/content/classics.js";',
  'export { weekCounts } from "./src/web/js/app/today.jsx";',
]);
const { C, state, PM } = A;

function player(rank) {
  state.settings = { ...A.DEFAULT_SETTINGS, lang: "en", onboarded: true, experience: rank >= 25 ? "new" : "player", playerRank: rank };
  state.profile = PM.newProfile({ rank });
}

await test("play suggest: a beginner is offered 9×9 first, with 13×13 as the other option", () => {
  player(30);
  const r = C.recommendedGame();
  assert.equal(r.size, 9);
  assert.equal(r.quick.size, 13);
  player(C.BEGINNER_RANK);
  // (Not on the first day, when the hero offers what onboarding promised: scripts/tests/shell-first-run.mjs.)
  state.settings.experience = null;
  assert.equal(C.recommendedGame().size, 9, "at the threshold still 9×9");
});

await test("play suggest: a stronger player is offered the standard board, with a quick 9×9 beside it", () => {
  player(12);
  const r = C.recommendedGame();
  assert.equal(r.size, 19);
  assert.equal(r.quick.size, 9);
});

await test("today: this week counts finished games of your own and problems solved in the last seven days", () => {
  const now = Date.UTC(2026, 10, 7);
  const day = 86400000;
  const games = [
    { source: "game", result: "B+R", finishedAt: now - day },
    { source: "game", result: "W+3.5", finishedAt: now - 6 * day },
    { source: "game", result: "W+R", finishedAt: now - 8 * day },
    { source: "game", result: null, updatedAt: now },
    { source: "import", result: "B+R", updatedAt: now },
  ];
  // c was solved nine days ago and missed again yesterday: an attempt, not a solve this week.
  const problems = { a: { solved: true, last: now - day, solvedAt: now - day }, b: { solved: false, last: now }, c: { solved: true, last: now - day, solvedAt: now - 9 * day } };
  assert.deepEqual(A.weekCounts(now, games, problems), { played: 2, solved: 1 });
  // recordProblem keeps when it was solved apart from when it was last tried.
  let p = A.PM.recordProblem(A.PM.newProfile(), "x", { solved: true }, now - 9 * day);
  p = A.PM.recordProblem(p, "x", { solved: false }, now - day);
  assert.equal(p.problems.x.solvedAt, now - 9 * day);
  assert.equal(p.problems.x.last, now - day);
  assert.deepEqual(A.weekCounts(now, [], p.problems), { played: 0, solved: 0 });
  assert.deepEqual(A.weekCounts(now, [], {}), { played: 0, solved: 0 });
});

await test("play home: classics show the year only, and the first few until All classics", () => {
  assert.equal(A.classicYear("1846-09-11,14,15"), "1846");
  assert.equal(A.classicYear("1933-10-16..1934-01-29"), "1933");
  assert.equal(A.classicYear(""), "");
  for (const g of A.CLASSICS) assert.match(A.classicYear(g.date), /^\d{4}$/, g.id);
  assert.ok(A.CLASSICS_SHOWN < A.CLASSICS.length && A.CLASSICS_SHOWN <= 4);
});

await test("classics: the moments are the famous moves, written in four languages, on moves of the game; none claims more than KataGo found", async () => {
  const fs = await import("node:fs");
  const { mainLine } = await import("../check-classics-katago.mjs");
  const data = JSON.parse(fs.readFileSync(new URL("../../docs/classics-katago.json", import.meta.url), "utf8"));
  const byId = Object.fromEntries(data.games.map((g) => [g.id, g]));
  let written = 0;
  for (const c of A.CLASSICS) {
    const ms = c.moments || [];
    assert.ok(ms.length <= 5, `${c.id}: ${ms.length} moments`);
    const n = mainLine(c.sgf).moves.length;
    ms.forEach((mo, i) => {
      written++;
      assert.ok(Number.isInteger(mo.index) && mo.index >= 1 && mo.index <= n, `${c.id} ${mo.index}`);
      if (i) assert.ok(mo.index > ms[i - 1].index, `${c.id}: moments in game order`);
      for (const k of ["title", "note"]) for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(mo[k]?.[lang]?.trim(), `${c.id} ${mo.index} ${k}.${lang}`);
      // Written moments only, and none calls a move a mistake or the best move unless KataGo agrees.
      // A game the last check ran out of time on is listed as missing; its claims wait for the rerun.
      if (!byId[c.id]) return assert.ok(data.missing?.includes(c.id), `${c.id}: neither checked nor listed as missing`);
      const mv = byId[c.id].moves[mo.index - 1];
      if (mo.claim === "mistake") assert.ok(mv.loss >= 3, `${c.id} ${mo.index}: a mistake loses ${mv.loss}`);
      if (mo.claim === "best") assert.ok(mv.move === mv.best || mv.loss <= 1, `${c.id} ${mo.index}: best move loses ${mv.loss}`);
      assert.ok(mo.best == null && mo.loss == null, `${c.id} ${mo.index}: no KataGo numbers in a moment`);
    });
  }
  assert.ok(written >= 5, `${written} written moments`);
});

await test("play review to practice: a theme takeaway opens an unsolved problem of that theme near the level; Next stays in the theme", async () => {
  player(12);
  state.practice = { view: "home", topic: null, theme: null, lesson: null, problem: null, daily: null, placement: null };
  await C.practiseTheme("cut", "connect");
  assert.equal(state.practice.view, "problem");
  const first = state.practice.problem.def;
  assert.equal(first.theme, "cut");
  assert.equal(state.practice.theme, "cut");
  // Solved ones are passed over.
  state.profile = { ...state.profile, problems: { ...state.profile.problems, [first.id]: { solved: true, tries: 1, last: 1 } } };
  await C.practiseTheme("cut", "connect");
  assert.notEqual(state.practice.problem.def.id, first.id);
  C.nextProblem();
  assert.equal(state.practice.problem.def.theme, "cut", "Next stays in the theme");
  // A theme with too few problems falls back to its topic.
  await C.practiseTheme("no-such-theme", "capture");
  assert.equal(state.practice.problem.def.topic, "capture");
  assert.equal(state.practice.theme, null);
});
