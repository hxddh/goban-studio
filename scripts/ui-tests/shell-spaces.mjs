/**
 * Shell: the two spaces in the browser — the sidebar has exactly Play and
 * Learn (and Settings), Play is its home or the board, Learn's top is the
 * path, everything survives a reload through the store, and a write that
 * fails is said once. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser, audit).
 */
export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  await check("shell spaces: two spaces in the sidebar; Play is its home or the board, with one primary action", async () => {
    const page = await fresh();
    await onboard(page, 1);
    const items = await page.locator(".sidebar .sb-list .sb-item").allInnerTexts();
    assert(JSON.stringify(items.map((s) => s.trim())) === JSON.stringify(["Play", "Learn"]), `sidebar: ${items.join(", ")}`);
    assert((await page.locator(".sidebar .sb-foot .sb-item").innerText()).trim() === "Settings", "Settings below");
    // Onboarding ("I know the rules") opened the board; Play again goes to its home.
    assert(await page.evaluate(() => window.__state.space === "play" && window.__state.play.view === "game"), "onboarding opens the board");
    await page.click(".sidebar .sb-item >> nth=0");
    await page.waitForSelector(".play-home");
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary action on Play's home");
    assert((await page.textContent(".play-home .hero")).includes("Suggested game"), "the suggested game before any move");
    // A move makes it a game in progress: the home offers to continue it.
    await page.keyboard.press("Control+[");
    await page.waitForFunction(() => window.__state.play.view === "game" && window.__board?.geom?.cell > 20);
    await clickPoint(page, 2, 2);
    await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".play-home .hero");
    assert((await page.textContent(".play-home .hero")).includes("Game in progress"), "the game in progress leads the home");
    await page.click(".play-home .hero .btn.primary");
    await page.waitForFunction(() => window.__state.play.view === "game");
    // Learn: the path, one primary (start it), then one row to the catalog.
    await page.keyboard.press("Control+2");
    await page.waitForSelector(".learn-path .path-row");
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary action on Learn");
    assert(await page.evaluate(() => document.querySelector(".learn-path").compareDocumentPosition(document.querySelector(".catalog-link")) & Node.DOCUMENT_POSITION_FOLLOWING), "the path comes before the catalog");
    assert((await page.locator(".learn-home .units, .learn-home .topic-row").count()) === 0, "the catalog is one row away, not on the home");
    // Cmd+3 and Cmd+4 go nowhere now.
    for (const k of ["3", "4"]) {
      await page.keyboard.press("Control+" + k);
      await page.waitForTimeout(50);
      assert((await page.evaluate(() => window.__state.space)) === "learn", `Cmd+${k} moved`);
    }
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell spaces: after a reload the game, the settings and a lesson's progress come back from the store", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await clickPoint(page, 4, 4);
    await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
    await page.keyboard.press("Control+2");
    await page.click(".learn-path .btn.primary");
    await page.waitForSelector(".steps");
    await page.waitForFunction(() => !!localStorage.getItem("goban9:current.json"), null, { timeout: 3000 });
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:")).sort());
    assert(keys.includes("goban9:settings.json") && keys.includes("goban9:current.json"), `stored: ${keys.join(", ")}`);
    assert(!(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("goban-studio.")))), "nothing under the old keys");
    await page.reload();
    await page.waitForSelector(".play-home");
    const s = await page.evaluate(() => ({ space: window.__state.space, view: window.__state.play.view, moves: window.__state.game.game.moveNumber, sheet: window.__state.sheet, onboarded: window.__state.settings.onboarded }));
    assert(s.space === "play" && s.view === "home" && s.moves >= 1 && !s.sheet && s.onboarded, JSON.stringify(s));
    assert((await page.textContent(".play-home .hero")).includes("Game in progress"), "the game is offered again");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell spaces: a write the store cannot make is one toast, however many files fail", async () => {
    const page = await fresh();
    await onboard(page, 1);
    // The preview's storage refuses everything from now on (a full disk).
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("QuotaExceededError");
      };
    });
    await page.keyboard.press("Control+,");
    await page.waitForSelector(".sheet");
    await page.keyboard.press("Escape");
    // Several files change at once: settings, the game on the board, the player model.
    await page.keyboard.press("Control+Period"); // focus mode: a setting
    await clickPoint(page, 2, 2);
    await page.keyboard.press("Control+Period");
    await page.waitForFunction(() => window.__state.toasts.some((t) => t.key === "store"), null, { timeout: 3000 });
    await page.waitForTimeout(500);
    const toasts = await page.evaluate(() => window.__state.toasts.filter((t) => t.key === "store").length);
    assert(toasts === 1, `${toasts} toasts for the failed writes`);
    assert((await page.locator(".toast.error").count()) === 1, "one error toast on screen");
    assert((await page.textContent(".toast.error")).includes("Couldn't save your changes"), "it says what happened");
    await page.close();
  });
}
