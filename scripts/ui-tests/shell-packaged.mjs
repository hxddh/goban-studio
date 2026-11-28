/**
 * Shell: the packaged apps' user path, proved against the browser build.
 *
 * - The steps scripts/packaged-ui.mjs clicks in the packaged Windows app
 *   (scripts/packaged-ui-steps.mjs) pass here, on a new profile, one after
 *   the other, with no page error.
 * - The self-test's in-page user path (src/web/js/selftest-path.js, the
 *   `userPath` check the packaged macOS and Windows apps run) passes every
 *   step and puts the start back: the language, the place and the game.
 *   With the lessons and the opening book unreadable (as on the Mac in
 *   v16.0.0) it fails, at those two steps.
 *
 * Loaded by scripts/ui-test.mjs; receives its helpers.
 */
import { STEPS, runSteps } from "../packaged-ui-steps.mjs";
import { USER_PATH } from "../../src/web/js/selftest-path.js";

export default async function ({ check, assert, fresh, origin }) {
  await check("shell packaged: the packaged app's user path (scripts/packaged-ui-steps.mjs) passes in the browser build", async () => {
    const page = await fresh("en-US");
    await page.goto(origin + "/");
    const lines = [];
    const result = await runSteps(page, { log: (l) => lines.push(l) });
    assert(result.ok, `step "${result.failed}" failed:\n  ${lines.join("\n  ")}`);
    assert(result.steps.length === STEPS.length, `${result.steps.length} of ${STEPS.length} steps ran`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
    return result.steps.map((s) => `${s.name} ${s.ms} ms`).join(", ");
  });

  for (const locale of ["en-US", "zh-CN"]) {
    await check(`shell packaged: the self-test's user path passes every step and puts the start back (${locale})`, async () => {
      const page = await fresh(locale);
      await page.goto(origin + "/");
      // A player with a game on the board, on Today (the self-test runs wherever the app opened).
      await page.waitForSelector(".ob-card");
      await page.click(".choice >> nth=1");
      await page.waitForSelector(".page.today .hero .btn.primary");
      await page.click(".today .hero .btn.primary");
      await page.waitForFunction(() => window.__state.game?.game.size === 9);
      await page.keyboard.press("Control+1");
      await page.waitForFunction(() => window.__state.space === "today");
      const before = await page.evaluate(() => ({ lang: window.__state.settings.lang, space: window.__state.space, game: window.__state.game?.game.size, moves: window.__state.game?.game.moveNumber }));
      const result = await page.evaluate(() => window.__userPath());
      assert(JSON.stringify(Object.keys(result.steps)) === JSON.stringify(USER_PATH), `steps ${Object.keys(result.steps).join(", ")}`);
      const failed = Object.entries(result.steps).filter(([, s]) => !s.ok);
      assert(result.ok && !failed.length, failed.map(([n, s]) => `${n}: ${s.error}`).join("; "));
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({ lang: window.__state.settings.lang, space: window.__state.space, game: window.__state.game?.game.size, moves: window.__state.game?.game.moveNumber }));
      assert(JSON.stringify(after) === JSON.stringify(before), `start not put back: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      // The page shows it too: Today, in the language it started in.
      const words = { en: "Today", zh: "今天" };
      await page.waitForSelector(".page.today");
      assert((await page.textContent("nav")).includes(words[before.lang]), "the sidebar is back in its language");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
      return Object.entries(result.steps).map(([n, s]) => `${n} ${s.ms} ms`).join(", ");
    });
  }

  await check("shell packaged: a part of the package that cannot be read fails the self-test's user path at that step (v16.0.0's macOS fault)", async () => {
    const page = await fresh("en-US");
    // The lessons' steps and the opening book unreadable, as they were on the Mac in v16.0.0.
    await page.route(/\/content\/(course|book)\.json$/, (route) => route.abort());
    await page.goto(origin + "/");
    await page.waitForSelector(".ob-card");
    const result = await page.evaluate(() => window.__userPath());
    const failed = Object.entries(result.steps).filter(([, s]) => !s.ok).map(([n]) => n);
    assert(!result.ok && JSON.stringify(failed) === JSON.stringify(["lesson", "explorer"]), `failed: ${failed.join(", ") || "none"}`);
    await page.close();
    return `failed ${failed.join(", ")}: ${result.steps.lesson.error.slice(0, 60)}`;
  });
}
