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
