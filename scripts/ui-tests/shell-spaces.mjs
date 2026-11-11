/**
 * Shell: the four spaces in the browser (v12) — Today, Play, Practice and
 * Library (and Settings); Today leads with one hero, Play is the board,
 * Practice has the path and the catalog, the Library the games;
 * everything survives a reload through the store, and a write that fails
 * is said once. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser, audit).
 */
export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  await check("shell spaces: four spaces in the sidebar; Today leads with one hero, Play is the board, Practice has the path and the catalog, the Library the games", async () => {
    const page = await fresh();
    await onboard(page, 1);
    const items = await page.locator(".sidebar .sb-list .sb-item").allInnerTexts();
    assert(JSON.stringify(items.map((s) => s.trim())) === JSON.stringify(["Today", "Play", "Practice", "Library"]), `sidebar: ${items.join(", ")}`);
    assert((await page.locator(".sidebar .sb-foot .sb-item").innerText()).trim() === "Settings", "Settings below");
    // The first game ("I know the rules", started from Today's hero) is on the board; Play again stays on it.
    assert(await page.evaluate(() => window.__state.space === "play" && window.__state.play.view === "game"), "the first game is on the board");
    await page.click(".sidebar .sb-item >> nth=1");
    assert(await page.evaluate(() => window.__state.space === "play" && window.__state.play.view === "game"), "Play again: the board");
    // Today: the suggested game before any move, one primary.
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today .hero");
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary action on Today");
    assert((await page.textContent(".today .hero")).includes("Suggested game"), "the suggested game before any move");
    // A move makes it a game in progress: Today offers to continue it.
    await page.keyboard.press("Control+2");
    await page.waitForFunction(() => window.__state.play.view === "game" && window.__board?.geom?.cell > 20);
    await clickPoint(page, 2, 2);
    await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today .hero");
    assert((await page.textContent(".today .hero")).includes("Game in progress"), "the game in progress leads Today");
    await page.click(".today .hero .btn.primary");
    await page.waitForFunction(() => window.__state.space === "play" && window.__state.play.view === "game");
    // Practice: the path, one primary (start it), then the course and the problems on the same page.
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".learn-path .path-row");
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary action on Practice");
    assert(await page.evaluate(() => document.querySelector(".learn-path").compareDocumentPosition(document.querySelector(".learn-home .catalog")) & Node.DOCUMENT_POSITION_FOLLOWING), "the path comes before the catalog");
    assert((await page.locator(".learn-home .units").count()) === 1 && (await page.locator(".learn-home .topic-row").count()) === 8, "the course and the topics are on the page");
    // The Library: your games, the classics, the explorer, Import SGF.
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".library-home .collection-row");
    assert((await page.locator(".library-home .home-explorer [data-explorer]").count()) === 2, "the explorer's rows: the whole board and the corner");
    assert(await page.evaluate(() => !!(document.querySelector(".home-explorer").compareDocumentPosition(document.querySelector(".home-classics")) & Node.DOCUMENT_POSITION_FOLLOWING)), "the explorer has its own section, before the classics");
    assert((await page.locator(".btn.primary:visible").count()) === 0, "no primary in the Library");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("shell spaces: after a reload the game, the settings and a lesson's progress come back from the store", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await clickPoint(page, 4, 4);
    await page.waitForFunction(() => window.__state.game.game.moveNumber >= 1);
    await page.keyboard.press("Control+3");
    await page.click(".learn-path .btn.primary");
    await page.waitForSelector(".steps");
    await page.waitForFunction(() => !!localStorage.getItem("goban9:current.json"), null, { timeout: 3000 });
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:")).sort());
    assert(keys.includes("goban9:settings.json") && keys.includes("goban9:current.json"), `stored: ${keys.join(", ")}`);
    assert(!(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("goban-studio.")))), "nothing under the old keys");
    await page.reload();
    // The app opens on Today, which offers the game in progress; Play is its board.
    await page.waitForSelector(".today .hero");
    const s = await page.evaluate(() => ({ space: window.__state.space, view: window.__state.play.view, moves: window.__state.game.game.moveNumber, sheet: window.__state.sheet, onboarded: window.__state.settings.onboarded }));
    assert(s.space === "today" && s.view === "game" && s.moves >= 1 && !s.sheet && s.onboarded, JSON.stringify(s));
    assert((await page.textContent(".today .hero")).includes("Game in progress"), "the game is offered again");
    await page.keyboard.press("Control+2");
    await page.waitForSelector("canvas.board");
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
