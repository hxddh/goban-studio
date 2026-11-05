/**
 * v7 browser checks: scheduler. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser).
 *
 * The browser preview has no KataGo, so the background work here is the
 * offline estimate going through the same scheduler jobs.
 */
export default async function ({ check, assert, fresh, onboard }) {
  /** `n` finished two-player 19×19 records of `moves` moves, written straight into storage. */
  async function seed(page, n, moves) {
    await page.evaluate(
      ({ n, moves }) => {
        const L = "abcdefghijklmnopqrs";
        const games = [];
        for (let k = 0; k < n; k++) {
          let sgf = "(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]RE[B+R]";
          let i = 0;
          for (let y = 0; y < 19 && i < moves; y += 2) for (let x = 0; x < 19 && i < moves; x++, i++) sgf += `;${i % 2 ? "W" : "B"}[${L[x]}${L[y]}]`;
          sgf += ")";
          const at = Date.now() - k * 60000;
          games.push({ id: "seed-" + k, createdAt: at, updatedAt: at, source: "game", opponent: "human", size: 19, moves, result: "B+R", name: "Seed " + k, sgf, thumb: "" });
        }
        localStorage.setItem("goban-studio.library.v2", JSON.stringify({ v: 2, games }));
      },
      { n, moves },
    );
    await page.reload();
    await page.waitForSelector(".page, canvas.board");
  }

  await check("v8: no background list in Settings and no Analyse all button; older games are analysed by themselves", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seed(page, 14, 150);
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-row");
    assert((await page.locator(".toolbar .analyse-all").count()) === 0, "an Analyse all button");
    // The automatic pass (with KataGo it starts a short while after launch).
    await page.evaluate(() => window.__autoAnalyse());
    await page.waitForFunction(() => window.__state.batch && window.__state.batch.total === 14);
    await page.waitForSelector(".game-row .row-analysis", { timeout: 5000 });
    const notes = await page.locator(".game-row .row-analysis").allTextContents();
    assert(notes.length === 1 && /Analysing… \d+%/.test(notes[0]), `only the game being analysed says so: ${notes.join(" | ")}`);
    await page.keyboard.press("Control+,");
    await page.click('[data-pane="engine"]');
    await page.waitForSelector(".settings-pane");
    assert((await page.locator(".bg-jobs").count()) === 0, "a background list in Settings");
    await page.keyboard.press("Escape");
    await page.close();
  });

  await check("v7 scheduler: a batch finishes, every game gets its report, and opening one is instant", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seed(page, 3, 30);
    await page.keyboard.press("Control+4");
    await page.evaluate(() => window.__autoAnalyse());
    await page.waitForFunction(() => window.__state.batch === null && JSON.parse(localStorage.getItem("goban-studio.library.v2")).games.every((g) => g.report), null, { timeout: 20000 });
    const reports = await page.evaluate(() => JSON.parse(localStorage.getItem("goban-studio.library.v2")).games.filter((g) => g.report).length);
    assert(reports === 3, `reports stored: ${reports}`);
    // The library row's menu → Report.
    await page.locator(".game-item [aria-haspopup]").first().click();
    await page.locator("[role=menuitem]").filter({ hasText: "Report" }).first().click();
    await page.waitForFunction(() => window.__state.report?.status === "done", null, { timeout: 2000 });
    await page.close();
  });
}
