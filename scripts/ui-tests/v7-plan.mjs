/**
 * v7 browser checks: plan. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser).
 */
export default async function ({ check, assert, fresh, onboard }) {
  /** Four analysed games where cuts cost five points each. */
  async function seedGames(page) {
    await page.evaluate(() => {
      const key = "goban-studio.progress.v2";
      const p = JSON.parse(localStorage.getItem(key) || "{}");
      const now = Date.now();
      const ph = (loss) => ({ loss, mistakes: 1, blunders: 0, moves: 30, accuracy: 0.6 });
      p.games = [0, 1, 2, 3].map((i) => ({ id: "plan-" + i, at: now - (i + 1) * 3600000, size: 19, color: 1, won: false, moves: 180, confidence: "high", phases: { opening: ph(2), middle: ph(7), endgame: ph(2) }, themes: { cut: 1 }, themeLoss: { cut: 5 } }));
      p.v = 5;
      localStorage.setItem(key, JSON.stringify(p));
    });
    await page.reload();
    await page.waitForSelector(".page");
  }

  await check("v7 plan: no focus and no empty card without evidence", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today");
    assert((await page.locator(".plan-focus").count()) === 0, "focus section shown without games");
    await page.keyboard.press("Control+3");
    assert((await page.locator(".plan-row, .plan-mark").count()) === 0, "focus shown in practice without games");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("v7 plan: this week's focus on Today and Practice, linking to the lesson and the problems", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seedGames(page);
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".plan-focus .plan-row");
    const row = await page.locator(".plan-focus .plan-row").first();
    assert((await row.getAttribute("data-focus")) === "cut", "the focus is cutting");
    const text = await row.innerText();
    assert(/≈20 points/.test(text) && /4 games/.test(text), `evidence: ${text}`);
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary action on Today");
    assert((await page.locator(".plan-focus .btn.primary").count()) === 0, "the focus is quiet");
    await row.locator(".plan-lesson").click();
    await page.waitForFunction(() => window.__state.practice.view === "lesson" && window.__state.practice.lesson.lesson.id === "connect-cut");
    await page.keyboard.press("Control+1");
    await page.locator(".plan-focus .plan-row .btn").first().click();
    await page.waitForFunction(() => window.__state.practice.view === "topic" && window.__state.practice.topic === "connect" && window.__state.practice.theme === "cut");
    await page.click(".crumb");
    await page.waitForFunction(() => window.__state.practice.view === "home");
    await page.waitForSelector(".plan-row");
    assert((await page.locator(".topic-card.focus .plan-mark").count()) === 1, "one topic tile marked");
    assert((await page.locator(".topic-card.focus").innerText()).includes("Focus"), "the connect tile carries the mark");
    // Today's five follows the focus.
    await page.locator(".group-row .btn", { hasText: /Start/ }).first().click();
    const items = await page.evaluate(() => window.__state.progress.daily.items);
    assert(items.length === 5 && items.some((i) => i.role === "focus" && i.why === "cut"), JSON.stringify(items));
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
