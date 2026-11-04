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

  await check("v7 scheduler: Settings shows nothing in the background when idle", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+,");
    await page.click('[data-pane="engine"]');
    await page.waitForSelector(".settings-pane");
    assert((await page.locator(".bg-jobs").count()) === 0, "a background list while idle");
    await page.close();
  });

  await check("v7 scheduler: Analyse all runs in the background, shows on rows and in Settings, and stops", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seed(page, 14, 150);
    await page.keyboard.press("Control+4");
    const button = page.locator(".toolbar .analyse-all");
    await button.waitFor();
    assert((await button.textContent()).includes("Analyse all"), "the button");
    await button.click();
    await page.waitForFunction(() => window.__state.batch && window.__state.batch.total === 14);
    await page.waitForSelector(".game-row .row-analysis", { timeout: 5000 });
    const notes = await page.locator(".game-row .row-analysis").allTextContents();
    assert(notes.some((s) => /Analysing… \d+%|Waiting to be analysed/.test(s)), `row notes: ${notes.join(" | ")}`);
    // Settings → Opponents and analysis: the batch, with its progress and Stop.
    await page.keyboard.press("Control+,");
    await page.click('[data-pane="engine"]');
    const job = page.locator(".bg-job");
    await job.first().waitFor({ timeout: 5000 });
    const text = await job.first().textContent();
    assert(/Analysing your games — \d+ of 14 — \d+%/.test(text), `job text: ${text}`);
    assert((await page.locator(".settings-sheet .btn.primary").count()) <= 1, "no extra primary button");
    await job.first().locator("button").click();
    await page.waitForFunction(() => !window.__state.batch, null, { timeout: 5000 });
    await page.waitForFunction(() => !document.querySelector(".bg-jobs"), null, { timeout: 5000 });
    const saved = await page.evaluate(() => localStorage.getItem("goban-studio.batch.v7"));
    assert(saved === null, "a cancelled batch is forgotten");
    await page.keyboard.press("Escape");
    // Library offers it again for the games still without a report.
    await page.waitForFunction(() => document.querySelector(".toolbar .analyse-all")?.textContent.includes("Analyse all"), null, { timeout: 5000 });
    await page.close();
  });

  await check("v7 scheduler: a batch finishes, every game gets its report, and opening one is instant", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seed(page, 3, 30);
    await page.keyboard.press("Control+4");
    await page.locator(".toolbar .analyse-all").click();
    await page.waitForFunction(() => !window.__state.batch, null, { timeout: 20000 });
    const reports = await page.evaluate(() => JSON.parse(localStorage.getItem("goban-studio.library.v2")).games.filter((g) => g.report).length);
    assert(reports === 3, `reports stored: ${reports}`);
    assert((await page.locator(".toolbar .analyse-all").count()) === 0, "nothing left to analyse");
    // The library row's menu → Report.
    await page.locator(".game-item [aria-haspopup]").first().click();
    await page.locator("[role=menuitem]").filter({ hasText: "Report" }).first().click();
    await page.waitForFunction(() => window.__state.report?.status === "done", null, { timeout: 2000 });
    await page.close();
  });
}
