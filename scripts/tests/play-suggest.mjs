/**
 * Play's suggested game: beginners start on 9×9 (with the standard board
 * as the other option); stronger players on 19×19 with a quick 9×9 beside.
 */
import { test, assert, bundle } from "./helpers.mjs";

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export { classicYear, CLASSICS_SHOWN } from "./src/web/js/play/home.jsx";',
  'export { CLASSICS } from "./src/web/js/content/classics.js";',
]);
const { C, state, PM } = A;

function player(rank) {
  state.settings = { ...A.DEFAULT_SETTINGS, lang: "en", onboarded: true, experience: rank >= 25 ? "new" : "player", playerRank: rank };
  state.profile = PM.newProfile({ rank });
}

await test("play suggest: a beginner is offered 9×9 first, with 19×19 as the other option", () => {
  player(30);
  const r = C.recommendedGame();
  assert.equal(r.size, 9);
  assert.equal(r.quick.size, 19);
  player(C.BEGINNER_RANK);
  assert.equal(C.recommendedGame().size, 9, "at the threshold still 9×9");
});

await test("play suggest: a stronger player is offered the standard board, with a quick 9×9 beside it", () => {
  player(12);
  const r = C.recommendedGame();
  assert.equal(r.size, 19);
  assert.equal(r.quick.size, 9);
});

await test("play home: classics show the year only, and the first few until All classics", () => {
  assert.equal(A.classicYear("1846-09-11,14,15"), "1846");
  assert.equal(A.classicYear("1933-10-16..1934-01-29"), "1933");
  assert.equal(A.classicYear(""), "");
  for (const g of A.CLASSICS) assert.match(A.classicYear(g.date), /^\d{4}$/, g.id);
  assert.ok(A.CLASSICS_SHOWN < A.CLASSICS.length && A.CLASSICS_SHOWN <= 4);
});

await test("classics: 3 to 5 moments each, in order, on moves of the game, in four languages; claims agree with KataGo", async () => {
  const fs = await import("node:fs");
  const { mainLine } = await import("../check-classics-katago.mjs");
  const data = JSON.parse(fs.readFileSync(new URL("../../docs/classics-katago.json", import.meta.url), "utf8"));
  const byId = Object.fromEntries(data.games.map((g) => [g.id, g]));
  for (const c of A.CLASSICS) {
    const ms = c.moments || [];
    assert.ok(ms.length >= 3 && ms.length <= 5, `${c.id}: ${ms.length} moments`);
    const n = mainLine(c.sgf).moves.length;
    ms.forEach((mo, i) => {
      assert.ok(Number.isInteger(mo.index) && mo.index >= 1 && mo.index <= n, `${c.id} ${mo.index}`);
      if (i) assert.ok(mo.index > ms[i - 1].index, `${c.id}: moments in game order`);
      for (const k of ["title", "note"]) for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(mo[k]?.[lang]?.trim(), `${c.id} ${mo.index} ${k}.${lang}`);
      // A moment that calls the move a mistake or the best move says what KataGo says.
      const g = byId[c.id];
      assert.ok(g, `${c.id} in docs/classics-katago.json`);
      const mv = g.moves[mo.index - 1];
      if (mo.claim === "mistake") assert.ok(mv.loss >= 3, `${c.id} ${mo.index}: a mistake loses ${mv.loss}`);
      if (mo.claim === "best") assert.ok(mv.move === mv.best || mv.loss <= 1, `${c.id} ${mo.index}: best move loses ${mv.loss}`);
      if (mo.claim) assert.ok(["mistake", "best"].includes(mo.claim), mo.claim);
    });
  }
});

await test("play review to practice: a theme takeaway opens an unsolved problem of that theme near the level; Next stays in the theme", async () => {
  player(12);
  state.learn = { view: "home", topic: null, theme: null, lesson: null, problem: null, daily: null, placement: null };
  await C.practiseTheme("cut", "connect");
  assert.equal(state.learn.view, "problem");
  const first = state.learn.problem.def;
  assert.equal(first.theme, "cut");
  assert.equal(state.learn.theme, "cut");
  // Solved ones are passed over.
  state.profile = { ...state.profile, problems: { ...state.profile.problems, [first.id]: { solved: true, tries: 1, last: 1 } } };
  await C.practiseTheme("cut", "connect");
  assert.notEqual(state.learn.problem.def.id, first.id);
  C.nextProblem();
  assert.equal(state.learn.problem.def.theme, "cut", "Next stays in the theme");
  // A theme with too few problems falls back to its topic.
  await C.practiseTheme("no-such-theme", "capture");
  assert.equal(state.learn.problem.def.topic, "capture");
  assert.equal(state.learn.theme, null);
});
