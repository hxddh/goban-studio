/**
 * v9 browser checks: one opponent axis. Loaded by scripts/ui-test.mjs
 * before the visual baselines; receives its helpers (check, assert, fresh,
 * onboard, clickPoint, pointOf, origin, browser, audit).
 *
 * The browser preview has no optional networks, so the ladder is the
 * standard one: each rank shows the measured rank of the level that plays
 * it (opponents.js).
 */
import { ladder } from "../../src/web/js/opponents.js";

const label = (r) => (r > 0 ? `≈ ${r} kyu` : `≈ ${1 - r} dan`);
const MODE_WORDS = /human-style|stronger network|plays like a person/i;

export default async function ({ check, assert, fresh, onboard, audit }) {
  await check("opponent: New game chooses a rank on one slider, shown as the measured rank, with no mode wording", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+n");
    const range = page.locator(".sheet input[type=range]");
    await range.waitFor();
    const want = ladder({});
    assert(Number(await range.getAttribute("max")) === want.length - 1, `max ${await range.getAttribute("max")}`);
    const seen = [];
    for (let i = 0; i < want.length; i++) {
      await range.fill(String(i));
      const out = (await page.textContent(".sheet .slider-field output")).trim();
      assert((await range.getAttribute("aria-valuetext")) === out, "the slider says what it shows");
      seen.push(out);
    }
    assert(JSON.stringify(seen) === JSON.stringify(want.map((e) => label(e.label))), seen.join(", "));
    assert(seen[0] === "≈ 29 kyu" && seen.at(-1) === "≈ 4 dan", seen.join(", "));
    assert(!MODE_WORDS.test(await page.textContent(".sheet")), "mode wording in New game");
    await audit(page, "new game, opponent rank");
    // 12 kyu: the rank is remembered and the game is played (and shown) at it.
    const i12 = want.findIndex((e) => e.rank === 12);
    await range.fill(String(i12));
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__state.game && !window.__state.sheet);
    const g = await page.evaluate(() => ({ rank: window.__state.game.rank, impl: window.__state.game.impl, chosen: window.__state.settings.opponentRank, strength: window.__state.game.strength }));
    assert(g.rank === 12 && g.impl === "L:10k" && g.chosen === 12 && g.strength === undefined, JSON.stringify(g));
    const players = await page.textContent(".players");
    assert(players.includes("≈ 12 kyu") && !MODE_WORDS.test(players), players);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return seen.join(" · ");
  });

  await check("opponent: with the suggestion off, New game opens at the remembered rank; Settings has no human-style switch", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.evaluate(() => {
      window.__state.settings.autoStrength = false;
      window.__state.settings.opponentRank = 4;
    });
    await page.keyboard.press("Control+n");
    await page.waitForSelector(".sheet .slider-field output");
    const out = (await page.textContent(".sheet .slider-field output")).trim();
    assert(out === "≈ 5 kyu", `4 kyu is played by the standard level that measured 5 kyu, got ${out}`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !window.__state.sheet);
    await page.keyboard.press("Control+,");
    await page.waitForSelector(".sheet");
    const text = await page.textContent(".sheet");
    assert(!/Opponent plays human-style|Level labels are approximate/.test(text), "the human-style switch is gone");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
