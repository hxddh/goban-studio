/**
 * Practice: the week's focus in the browser — nothing without evidence; with
 * it, Practice's path names it with its reason in one line, links its lesson
 * and brings its problems, and Play's suggested game says why. Loaded by
 * scripts/ui-test.mjs before the visual baselines; receives its helpers
 * (check, assert, fresh, onboard, clickPoint, pointOf, origin, browser).
 */
export default async function ({ check, assert, fresh, onboard }) {
  /** Four analysed games where cuts cost five points each, in the player model's file. */
  async function seedGames(page) {
    await page.evaluate(() => {
      const key = "goban9:profile.json";
      const p = JSON.parse(localStorage.getItem(key) || '{"v":9}');
      const now = Date.now();
      const ph = (loss) => ({ loss, mistakes: 1, blunders: 0, moves: 30, accuracy: 0.6 });
      p.games = [0, 1, 2, 3].map((i) => ({ id: "plan-" + i, at: now - (i + 1) * 3600000, size: 19, color: 1, won: false, moves: 180, confidence: "high", phases: { opening: ph(2), middle: ph(7), endgame: ph(2) }, themes: { cut: 1 }, themeLoss: { cut: 5 } }));
      p.week = null;
      localStorage.setItem(key, JSON.stringify(p));
    });
    await page.reload();
    await page.waitForSelector(".page");
  }

  await check("practice focus: no focus line without evidence", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".practice-path");
    assert((await page.locator(".path-focus").count()) === 0, "focus shown without games");
    assert(!(await page.locator(".practice-path").innerText()).includes("This week's focus"), "a focus row without games");
    // Today's suggested game (v12).
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today .hero");
    assert(!(await page.textContent(".today .hero")).includes("focus"), "the suggestion names a focus without games");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("practice focus: the path names the week's focus with its reason and lesson, and brings its problems; Play's suggestion says why", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seedGames(page);
    await page.keyboard.press("Control+3");
    await page.waitForSelector(".practice-path .path-focus");
    const line = await page.textContent(".practice-path .path-focus");
    assert(line.includes("This week's focus: Cutting"), `the line: ${line}`);
    assert((await page.locator(".practice-path .path-focus .link").count()) === 1, "its lesson as a quiet link");
    const rows = await page.locator(".practice-path .path-row").allInnerTexts();
    // The focus's problems are one row, named after the theme, and the row says what the games showed (once: not in the line too).
    const focusRow = rows.find((r) => r.includes("Cutting ·"));
    assert(focusRow && focusRow.includes("Lost ≈20 points here in your last 4 games"), `no focus row with its reason: ${rows.join(" | ")}`);
    assert(!line.includes("Lost ≈20 points"), `the reason twice: ${line}`);
    assert(rows.length >= 2 && rows.length <= 8, `${rows.length} rows`);
    assert((await page.locator(".btn.primary:visible").count()) === 1, "one primary action on Practice");
    // The focus is kept for the week in the player model's file.
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("goban9:profile.json")).week?.focus?.[0] === "cut", null, { timeout: 2000 });
    // A focus row opens its problem, in today's session, saying why it is there.
    const i = rows.indexOf(focusRow);
    await page.locator(".practice-path .path-row").nth(i).click();
    await page.waitForFunction(() => window.__state.practice.view === "problem" && window.__state.practice.problem.def.theme === "cut" && !!window.__state.practice.daily);
    assert((await page.textContent(".panel .eyebrow")).includes("This week's focus: Cutting"), "the panel says why");
    // The lesson link opens the lesson on cutting.
    await page.keyboard.press("Control+3");
    await page.click(".practice-path .path-focus .link");
    await page.waitForFunction(() => window.__state.practice.view === "lesson" && /cut/.test(window.__state.practice.lesson.lesson.id));
    // Today's suggested game names it.
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".today .hero");
    assert((await page.textContent(".today .hero")).includes("this week's focus: Cutting"), "the suggestion says why");
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
