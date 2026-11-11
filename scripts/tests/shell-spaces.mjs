/**
 * Shell: the two spaces (docs/v9.md, "Two spaces") over the store — boot
 * opens the store before anything is read, onboarding opens Play or Practice,
 * the sidebar, the keyboard and the native menus name exactly Play and
 * Practice, back and forward move between them, and a write that fails is one
 * toast. The controller runs in Node with a minimal window.
 */
import { test, assert, bundle, fs, path, root, sleep } from "./helpers.mjs";

// What boot touches of the page: the theme on <html>, the colour-scheme
// query, the idle callback the content loader waits for.
const had = { window: globalThis.window, document: globalThis.document, matchMedia: globalThis.matchMedia };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document = { documentElement: { dataset: {}, lang: "" }, hidden: false, getElementById: () => null };
globalThis.window = { requestIdleCallback: () => 0 };

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state, toast } from "./src/web/js/app/store.js";',
  'export { store, createStore } from "./src/web/js/data/store.js";',
  'export { SPACES } from "./src/web/js/app/chrome.jsx";',
  'export { COMMANDS, menuSpec } from "./src/web/js/app/app.jsx";',
  'export { setLang, t } from "./src/web/js/i18n.js";',
  'export { matchShortcut, shortcutRows } from "./src/web/js/app/shortcuts.js";',
]);
const { C, state, store } = A;

try {
  await test("shell: boot opens the store first, then reads settings, the player model and the game from it", async () => {
    // A first launch: nothing stored. The onboarding sheet, on Today (v12).
    await C.boot();
    assert.equal(state.ready, true);
    assert.equal(state.space, "today");
    // v13: no game in progress, so Play opens on its home (the suggested
    // game with its handicap, and New game), not a blank board against opponentRank.
    assert.equal(state.play.view, "home", "v13: Play's home, not an empty board");
    assert.equal(state.sheet?.kind, "onboarding");
    assert.equal(state.profile.v, 13, "an empty profile (v13: the player model's own version)");
    assert.equal(state.profile.games.length, 0);
    assert.equal(state.game, null, "no blank game is made up");
    assert.equal(C.playShowsBoard(), false);
    assert.ok(!("progress" in state), "no old progress object");
    // The source: boot awaits store.open() before it reads anything, and start() awaits boot before the first render.
    const ctl = fs.readFileSync(path.join(root, "src/web/js/app/controller.js"), "utf8");
    const at = ctl.indexOf("export async function boot()");
    assert.ok(at > 0);
    const body = ctl.slice(at, ctl.indexOf("\n}\n", at));
    assert.ok(body.indexOf("await store.open()") < body.indexOf("loadSettings(store)"), "the store opens before the settings are read");
    const app = fs.readFileSync(path.join(root, "src/web/js/app/app.jsx"), "utf8");
    assert.ok(app.indexOf("await C.boot()") > 0 && app.indexOf("await C.boot()") < app.indexOf("  render(\n"), "the first render waits for boot");
  });

  await test("shell: four spaces, Today, Play, Practice and Library, in the sidebar, the keyboard and the native menus", () => {
    A.setLang("en");
    assert.deepEqual(A.SPACES.map((s) => s.id), ["today", "play", "practice", "library"]);
    assert.deepEqual(C.SPACES, ["today", "play", "practice", "library"]);
    const go = A.menuSpec().find((m) => m.title === "Go");
    const items = go.items.filter((i) => i.command?.startsWith("go.") && i.key && /^\d$/.test(i.key));
    assert.deepEqual(items.map((i) => [i.label, i.command, i.key]), [["Today", "go.today", "1"], ["Play", "go.play", "2"], ["Practice", "go.practice", "3"], ["Library", "go.library", "4"]]);
    for (const c of ["go.today", "go.play", "go.practice", "go.library"]) assert.ok(c in A.COMMANDS, c);
    // Cmd+1 to Cmd+4, from the one table the key handler, the menus and the shortcuts sheet share.
    for (const [k, c] of [["1", "go.today"], ["2", "go.play"], ["3", "go.practice"], ["4", "go.library"]]) assert.equal(A.matchShortcut({ key: k, shiftKey: false })?.command, c, "Cmd+" + k);
    const row = A.shortcutRows({ mod: "⌘", shift: "⇧", t: A.t }).find(([keys]) => keys === "⌘1 – 4");
    assert.equal(row?.[1], "Today / Play / Practice / Library", "the shortcuts sheet says so");
  });

  await test("shell: onboarding asks experience and ends on Today; its first offer opens lesson one for a new player and a game for everyone else", async () => {
    // A new player: Today, nothing started; the offer is lesson one; the prior is 30 kyu on every board.
    C.finishOnboarding("new");
    assert.equal(state.sheet, null);
    assert.equal(state.space, "today");
    assert.equal(state.practice.view, "home");
    assert.equal(C.firstRunOffer(), "lesson");
    C.startFirstRun();
    await sleep(0);
    assert.equal(state.space, "practice");
    assert.equal(state.practice.view, "lesson");
    assert.equal(state.practice.lesson.index, 0);
    assert.equal(state.settings.onboarded, true);
    assert.equal(state.settings.experience, "new");
    assert.equal(C.playerEstimate().rank, 30);
    // Someone who knows the rules: Today, then a 9×9 game against the gentlest rank, teaching on.
    C.finishOnboarding("rules");
    assert.equal(state.space, "today");
    assert.equal(state.game, null);
    C.startFirstRun();
    assert.equal(state.space, "play");
    assert.equal(state.play.view, "game");
    assert.equal(state.game.game.size, 9);
    assert.equal(state.settings.opponentRank, 30);
    assert.equal(C.teachingOn(), true);
    // A player: the full board, against the suggested opponent for the rank they gave.
    C.finishOnboarding("player", 10);
    assert.equal(state.space, "today");
    C.startFirstRun();
    assert.equal(state.game.game.size, 19);
    assert.equal(C.playerEstimate().rank, 10);
    assert.equal(state.settings.opponentRank, C.suggestedOpponent(19).opponentRank);
    // The settings and the player model are in the store.
    assert.equal(await store.flush(), true);
    assert.equal(store.get("settings.json").onboarded, true);
    assert.equal(store.get("profile.json").v, 13);
    assert.ok(store.get("current.json")?.sgf, "the game on the board is saved");
  });

  await test("shell: Play is the board; the space again goes back to its top; back and forward cross spaces", () => {
    // On the board after onboarding; Play again stays on the board (v12).
    assert.equal(state.play.view, "game");
    const game = state.game;
    C.goSpace("play");
    assert.equal(state.play.view, "game");
    assert.equal(state.game, game);
    // Today and back to the board.
    C.goSpace("today");
    assert.equal(state.space, "today");
    C.goSpace("play");
    assert.equal(state.space, "play");
    assert.equal(state.play.view, "game");
    // To Practice and back.
    C.goSpace("practice");
    assert.equal(state.space, "practice");
    C.openTopic("capture");
    assert.equal(state.practice.view, "topic");
    C.goSpace("practice");
    assert.equal(state.practice.view, "home", "Practice again: its home");
    assert.equal(C.back(), true);
    assert.equal(state.practice.view, "topic");
    assert.equal(C.back(), true);
    assert.equal(state.space, "practice");
    assert.equal(state.practice.view, "lesson", "where Practice was when we came in");
    assert.equal(C.back(), true);
    assert.equal(state.space, "play");
    assert.equal(state.play.view, "game", "back to the board");
    assert.equal(C.forward(), true);
    assert.equal(state.space, "practice");
    C.goSpace("nowhere");
    assert.equal(state.space, "practice", "only the four spaces");
    // The Library: a classic opens there, and the Library again closes it.
    C.goSpace("library");
    assert.equal(state.space, "library");
    C.openClassic(C.CLASSICS[0].id);
    assert.equal(state.space, "library");
    assert.equal(state.review?.meta.space, "library", "a classic opens in the Library");
    assert.equal(state.profile.classics[C.CLASSICS[0].id]?.done, true, "and is kept as seen");
    C.goSpace("library");
    assert.equal(state.review, null);
    assert.equal(state.space, "library");
    // A classic left open in the Library does not hold back the report of a game finished in Play.
    C.openClassic(C.CLASSICS[0].id);
    assert.equal(state.review?.meta.space, "library");
    C.goSpace("play");
    assert.equal(state.space, "play");
    assert.equal(state.review, null, "leaving the Library closes its review");
    // Play again stays on the board (its clock, keys and report need the game view).
    C.goSpace("play");
    assert.equal(state.play.view, "game");
    // Back from Practice returns to the board, not to the classic.
    C.goSpace("practice");
    assert.equal(C.back(), true);
    assert.equal(state.space, "play");
    assert.equal(state.review, null);
    assert.equal(state.play.view, "game");
    // "Review so far" during the game, then Play again: the board, its clock, keys and report.
    state.game.game.play(3, 3);
    C.reviewCurrentGame();
    assert.equal(C.playReviewing(), true);
    C.goSpace("play");
    assert.equal(state.review, null);
    assert.equal(C.boardShown(), true, "the board is on screen for the clock, keys and report");
    const g = state.game.game;
    g.play(2, 2);
    g.play(6, 6);
    g.resign(g.turn);
    C.showFinished();
    assert.equal(state.review?.source, "current", "the finished game's report opens");
    assert.equal(state.review.meta.space, "play");
  });

  await test("shell: Practice's top is the path, one ordered list, and its problems are one session", () => {
    C.resetSession();
    const path0 = C.practicePath();
    assert.ok(path0.length >= 2);
    assert.equal(path0[0].kind, "lesson", "the next lesson first");
    assert.deepEqual(C.pathNow().items, path0, "the home shows the path until a session starts");
    const second = path0.find((i) => i.kind === "problem");
    C.openPathItem(second.key);
    assert.equal(state.practice.view, "problem");
    assert.equal(state.practice.problem.def.id, second.id);
    assert.deepEqual(C.todaysSession().items.map((i) => i.key), path0.map((i) => i.key), "the session is the path, in its order");
    assert.equal(state.practice.daily.current, second.key);
  });

  await test("shell: a write that fails is one toast, however many keys fail", async () => {
    const failing = A.createStore({
      backend: { kind: "local", list: async () => [], read: async () => null, write: async () => Promise.reject(new Error("DiskFull")), remove: async () => {} },
      delay: 1,
    });
    // The app's handler, on a store that cannot write.
    const ctl = fs.readFileSync(path.join(root, "src/web/js/app/controller.js"), "utf8");
    assert.match(ctl, /store\.setErrorHandler\(storeError\)/);
    assert.match(ctl, /toast\(t\(read \? "store\.readFailed" : "store\.writeFailed"\), "error", 5000, \{ key: "store" \}\)/);
    const before = state.toasts.length;
    const errors = [];
    failing.setErrorHandler((e) => {
      errors.push(e);
      // the handler boot installs (storeError), with its toast key
      A.toast("x", "error", 5000, { key: "store" });
    });
    for (const k of ["a.json", "b.json", "c.json"]) failing.put(k, { k });
    assert.equal(await failing.flush(), false);
    assert.equal(errors.length, 3);
    assert.equal(state.toasts.length - before, 1, "one toast");
  });
} finally {
  A.C.sched?.cancelAll?.("quit");
  for (const [k, v] of Object.entries(had)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
}
