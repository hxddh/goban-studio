/**
 * Shell: the first run — every new player lands on Today, whose hero
 * offers what onboarding promised — and the boards a beginner is led
 * through (9×9, then 13×13, then 19×19).
 */
import { test, assert, bundle } from "./helpers.mjs";
import { MIDDLE_GAMES, SMALL_GAMES, finishedBySize, firstOffer, otherSize, suggestedSize } from "../../src/web/js/app/first-run.js";

await test("first run: the offer is what onboarding promised, until a game or a lesson has been done", () => {
  assert.equal(firstOffer({ experience: "new" }), "lesson");
  assert.equal(firstOffer({ experience: "rules" }), "small");
  assert.equal(firstOffer({ experience: "player" }), "full");
  // An existing profile (or one that never went through onboarding) has none.
  assert.equal(firstOffer({ experience: null }), null);
  assert.equal(firstOffer({}), null);
  // Taken up: a game played or in progress, or the first lesson done.
  for (const experience of ["new", "rules", "player"]) {
    assert.equal(firstOffer({ experience, games: 1 }), null, experience);
    assert.equal(firstOffer({ experience, gameStarted: true }), null, experience);
  }
  assert.equal(firstOffer({ experience: "new", lessonsDone: 1 }), null);
  assert.equal(firstOffer({ experience: "rules", lessonsDone: 3 }), "small", "lessons do not replace the first game");
});

await test("first run: a beginner plays 9×9, then 13×13, before the full board; a player goes straight to 19×19", () => {
  const size = (beginner, n9 = 0, n13 = 0, n19 = 0) => suggestedSize({ beginner, finished: { 9: n9, 13: n13, 19: n19 } });
  assert.ok(SMALL_GAMES >= 2 && MIDDLE_GAMES >= 1);
  // A beginner: the small board for the first games, then the middle one.
  for (let n = 0; n < SMALL_GAMES; n++) assert.equal(size(true, n), 9, `${n} games`);
  assert.equal(size(true, SMALL_GAMES), 13);
  assert.equal(size(true, SMALL_GAMES + 5, 9), 13, "13×13 while still a beginner");
  // Past the beginner ranks after coming up through the small boards: 13×13 first.
  assert.equal(size(false, SMALL_GAMES, 0), 13);
  assert.equal(size(false, SMALL_GAMES, MIDDLE_GAMES - 1), 13);
  assert.equal(size(false, SMALL_GAMES, MIDDLE_GAMES), 19);
  // Someone who already plays (no small-board history, or any 19×19 game): the full board.
  assert.equal(size(false), 19);
  assert.equal(size(false, 1, 0), 19, "a quick 9×9 or two does not make a player a beginner");
  assert.equal(size(false, SMALL_GAMES, 0, 1), 19, "has played the full board");
  assert.equal(suggestedSize(), 19);
  // The second offer is the next board up, and a quick 9×9 beside the full board.
  assert.deepEqual([9, 13, 19].map(otherSize), [13, 19, 9]);
});

await test("first run: finished games against the computer are what counts towards the next board", () => {
  const games = [
    { size: 9, result: "B+R", source: "game", opponent: "ai" },
    { size: 9, result: "W+2.5", source: "game", opponent: "ai" },
    { size: 9, result: null, source: "game", opponent: "ai" }, // unfinished
    { size: 9, result: "B+R", source: "import", opponent: "ai" }, // someone else's record
    { size: 9, result: "B+R", source: "game", opponent: "human" }, // two players at one board
    { size: 13, result: "B+1.5", source: "game", opponent: "ai" },
    { size: 15, result: "B+R", source: "game", opponent: "ai" }, // not a board the app plays
    null,
  ];
  assert.deepEqual(finishedBySize(games), { 9: 2, 13: 1, 19: 0 });
  assert.deepEqual(finishedBySize(), { 9: 0, 13: 0, 19: 0 });
});

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
]);
const { C, state, PM } = A;

function fresh(lang = "en") {
  state.settings = { ...A.DEFAULT_SETTINGS, lang, onboarded: false };
  state.profile = PM.newProfile();
  state.game = null;
  state.review = null;
  state.space = "play";
  state.sheet = { kind: "onboarding", step: 1 };
  state.learn = { view: "home", topic: null, theme: null, lesson: null, problem: null, daily: null, placement: null };
}

await test("first run: all three answers end on Today with nothing started; the hero's game is the one onboarding promised", () => {
  for (const [choice, rank, offer] of [["new", null, "lesson"], ["rules", null, "small"], ["player", 8, "full"]]) {
    fresh();
    C.finishOnboarding(choice, rank);
    assert.equal(state.space, "today", choice);
    assert.equal(state.sheet, null);
    assert.equal(state.game, null, `${choice}: no board was started`);
    assert.equal(state.learn.view, "home", `${choice}: no lesson was opened`);
    assert.equal(state.settings.onboarded, true);
    assert.equal(state.settings.experience, choice);
    assert.equal(C.firstRunOffer(), offer);
    const rec = C.recommendedGame();
    assert.equal(rec.first, offer);
    assert.equal(rec.handicap, 0, `${choice}: an even game`);
    if (choice === "player") {
      assert.equal(rec.size, 19);
      assert.equal(state.settings.playerRank, 8);
    } else {
      assert.equal(rec.size, 9);
      assert.equal(rec.opponentRank, 30, "the gentlest level");
      assert.equal(rec.quick.size, 13);
    }
  }
});

await test("first run: the hero's primary starts the promised game in one step, and the offer is then gone", () => {
  fresh();
  C.finishOnboarding("rules");
  C.startFirstRun();
  assert.equal(state.space, "play");
  assert.equal(state.game.game.size, 9);
  assert.equal(state.settings.opponentRank, 30, "the gentlest level of the ladder");
  assert.equal(state.game.game.handicap, 0);
  assert.equal(C.teachingOn(), true, "teaching is on for a beginner");
  // No move yet: going back to Today still shows the offer. One move of the player's: it is a game in progress.
  assert.equal(C.firstRunOffer(), "small");
  state.game.game.play(4, 4);
  assert.equal(C.firstRunOffer(), null);
  // A player who said they play, even at a beginner's rank, gets the 19×19 they were promised.
  fresh();
  C.finishOnboarding("player", 22);
  assert.equal(C.recommendedGame().size, 19);
  C.startFirstRun();
  assert.equal(state.game.game.size, 19);
  assert.equal(state.game.game.handicap, 0);
});
