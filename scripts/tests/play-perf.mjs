/**
 * Play, performance: a clock tick re-renders the clocks only (not the
 * app and its board), and the board reads its font once per language,
 * text size and appearance instead of on every model update.
 */
import { test, assert, bundle } from "./helpers.mjs";

await test("play perf: a timed game's tick wakes the clocks, not the app", async () => {
  const realNow = performance.now;
  let now = 1000;
  performance.now = () => now;
  try {
    const A = await bundle([
      'export * as Play from "./src/web/js/app/play-ctl.js";',
      'export * as P from "./src/web/js/data/settings.js";',
      'export * as PM from "./src/web/js/model/player.js";',
      'export { state, subscribe, onClockTick } from "./src/web/js/app/store.js";',
      'export { newClock } from "./src/web/js/app/clock.js";',
      'export { Game, BLACK } from "./src/web/js/rules.js";',
    ]);
    const { Play, P, PM, state, subscribe, onClockTick, newClock, Game, BLACK } = A;
    state.settings = { ...P.DEFAULT_SETTINGS, onboarded: true };
    state.profile = PM.newProfile();
    state.game = Play.freshGameState(new Game({ size: 9 }), { opponent: "human", humanColor: BLACK, clock: newClock("byoyomi") });
    state.space = "play";
    state.play = { ...state.play, view: "game" };
    state.review = null;
    state.sheet = null;
    await new Promise((r) => setTimeout(r, 0));
    let renders = 0;
    let ticks = 0;
    const off1 = subscribe(() => renders++);
    const off2 = onClockTick(() => ticks++);
    const left = state.game.clock.b.left;
    for (let i = 0; i < 8; i++) {
      now += 250;
      Play.clockTick();
    }
    await new Promise((r) => setTimeout(r, 0));
    off1();
    off2();
    assert.ok(state.game.clock.b.left < left - 1.5, "Black's clock ran");
    assert.equal(ticks, 7, "each tick after the first woke the clocks");
    assert.equal(renders, 0, "the app did not re-render");
  } finally {
    performance.now = realNow;
  }
});

await test("play perf: the board reads its font once per language, text size and appearance", async () => {
  const { BoardView } = await import("../../src/web/js/board.js");
  const had = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  let reads = 0;
  const root = { lang: "en", dataset: { text: "normal", theme: "light" } };
  globalThis.document = { documentElement: root };
  globalThis.getComputedStyle = () => {
    reads++;
    return { getPropertyValue: () => (root.lang === "ja" ? "Hiragino Sans" : "Inter") };
  };
  try {
    const view = { canvas: {}, font: null, fontKey: null };
    const read = () => BoardView.prototype.readFont.call(view);
    for (let i = 0; i < 20; i++) read();
    assert.equal(reads, 1, "one style read for twenty updates");
    assert.equal(view.font, "Inter");
    root.lang = "ja";
    read();
    assert.equal(reads, 2, "a new language reads it again");
    assert.equal(view.font, "Hiragino Sans");
    root.dataset.text = "large";
    read();
    root.dataset.theme = "dark";
    read();
    assert.equal(reads, 4, "text size and appearance read it again");
    view.fontKey = null; // what resize() does
    read();
    assert.equal(reads, 5, "a resize reads it again");
  } finally {
    globalThis.document = had.document;
    globalThis.getComputedStyle = had.getComputedStyle;
  }
});
