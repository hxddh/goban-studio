/**
 * Play: teaching reasons in warnings and hints, in the browser. Loaded by scripts/ui-test.mjs before the
 * visual baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser, audit).
 *
 * The browser preview has no KataGo, so the teaching warning (which needs the engine's searches) is
 * covered by the node flow test in scripts/tests/play-teaching.mjs; here the offline hint shows its
 * reason, and the panel stays clean.
 */
export default async function ({ check, assert, fresh, onboard, clickPoint, audit }) {
  await check("play teaching: a hint that captures says so, on screen and to screen readers", async () => {
    const page = await fresh();
    await onboard(page, 1);
    // A two-player 19×19 game (the offline hint is deterministic there): Black K10, White L10,
    // Black M10, White D4, Black L11, White Q16. White's L10 is in atari; the hint takes it at L9.
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=0");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__board?.model.size === 19);
    for (const [x, y] of [[9, 9], [10, 9], [11, 9], [3, 15], [10, 8], [15, 3]]) await clickPoint(page, x, y);
    await page.waitForFunction(() => window.__state.game.game.moveNumber === 6);
    await page.keyboard.press("Control+Shift+H");
    await page.waitForFunction(() => window.__state.game.hint, null, { timeout: 8000 });
    const hint = await page.evaluate(() => window.__state.game.hint);
    assert(hint.x === 10 && hint.y === 10, `hint at ${hint.x},${hint.y}`);
    const note = page.locator(".panel .note").filter({ hasText: "Consider" });
    await note.waitFor();
    const text = (await note.textContent()).trim();
    assert(text === "Consider L9 — it captures a stone.", `hint text: ${text}`);
    await page.waitForFunction(() => /Consider L9 — it captures a stone\./.test(window.__state.announce || ""), null, { timeout: 2000 });
    if (audit) await audit(page, "hint with a reason");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
