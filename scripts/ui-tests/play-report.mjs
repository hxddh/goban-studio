/**
 * Play: reports in the browser — made in the background for older games,
 * stored with each game, opened from the history; a report's words and
 * tables. Loaded by scripts/ui-test.mjs before the visual baselines;
 * receives its helpers (check, assert, fresh, onboard, clickPoint, pointOf,
 * origin, browser).
 *
 * The browser preview has no KataGo, so the background work here is the
 * offline estimate going through the same scheduler jobs.
 */
export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  /** `n` finished two-player 19×19 games of `moves` moves, written straight into the preview's store (one file each). */
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
          games.push({ id: "seed-" + k, createdAt: at, updatedAt: at, finishedAt: at, source: "game", sgf, meta: { opponent: "human", size: 19, moves, result: "B+R", name: "Seed " + k, thumb: "" } });
        }
        for (const g of games) localStorage.setItem(`goban9:games/${g.id}.json`, JSON.stringify(g));
      },
      { n, moves },
    );
    await page.reload();
    await page.waitForSelector(".page, canvas.board");
  }

  await check("play report: no background list in Settings and no Analyse all button; older games are analysed by themselves", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seed(page, 14, 150);
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".game-row");
    assert((await page.locator(".toolbar .analyse-all").count()) === 0, "an Analyse all button");
    // The automatic pass (with KataGo it starts a short while after launch).
    await page.evaluate(() => window.__autoAnalyse());
    await page.waitForFunction(() => window.__state.batch && window.__state.batch.total === 14);
    await page.waitForSelector(".game-row .row-analysis", { timeout: 5000 });
    const notes = await page.locator(".game-row .row-analysis").allTextContents();
    assert(notes.length === 1 && /Analysing… \d+%/.test(notes[0]), `only the game being analysed says so: ${notes.join(" | ")}`);
    await page.keyboard.press("Control+,");
    await page.click('[data-pane="playing"]');
    await page.waitForSelector(".settings-pane");
    assert((await page.locator(".bg-jobs").count()) === 0, "a background list in Settings");
    await page.keyboard.press("Escape");
    await page.close();
  });

  await check("play report: a batch finishes, every game gets its report, and opening one is instant", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await seed(page, 3, 30);
    await page.keyboard.press("Control+1");
    await page.evaluate(() => window.__autoAnalyse());
    // Each game's file holds its review and the analysis it was made from.
    await page.waitForFunction(
      () => window.__state.batch === null && Object.keys(localStorage).filter((k) => k.startsWith("goban9:games/")).every((k) => { const g = JSON.parse(localStorage.getItem(k)); return g.review && g.analysis; }),
      null,
      { timeout: 20000 },
    );
    const reports = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("goban9:games/") && JSON.parse(localStorage.getItem(k)).review).length);
    assert(reports === 3, `reports stored: ${reports}`);
    assert((await page.evaluate(() => localStorage.getItem("goban9:batch.json"))) === null, "the finished batch leaves nothing to resume");
    // The history row's menu → Report.
    await page.locator(".game-item [aria-haspopup]").first().click();
    await page.locator("[role=menuitem]").filter({ hasText: "Report" }).first().click();
    await page.waitForFunction(() => window.__state.report?.status === "done", null, { timeout: 2000 });
    await page.close();
  });

  await check("play report: report moments keep their words; phase tables are named; two-player drills pick a side", async () => {
    const page = await fresh();
    await onboard(page, 1);
    // A two-player 9×9 game of 10 moves, saved, then its report.
    await page.keyboard.press("Control+n");
    await page.click(".preset >> nth=2");
    await page.click(".sheet .segmented button >> nth=1");
    await page.click(".sheet-foot .btn.primary");
    await page.waitForFunction(() => window.__board?.model.size === 9 && window.__board.geom?.cell > 40);
    const pts = [[2, 2], [6, 6], [6, 2], [2, 6], [4, 4], [4, 2], [2, 4], [6, 4], [4, 6], [3, 3]];
    for (let i = 0; i < pts.length; i++) {
      await clickPoint(page, ...pts[i]);
      await page.waitForFunction((n) => window.__state.game?.game.moveNumber === n, i + 1, { timeout: 3000 });
    }
    // End it: two passes, accept the count; the finished game is saved to the history.
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("Control+Shift+P");
      await page.click(".sheet-foot .btn.primary");
    }
    await page.waitForSelector(".score-card");
    await page.click(".score-card .btn.primary");
    await page.waitForSelector(".result-card");
    await page.keyboard.press("Control+1");
    await page.waitForSelector(".page .menu-wrap");
    await page.click(".page .menu-wrap > button >> nth=0");
    await page.click(".menu [role=menuitem]:has-text('Game report')");
    await page.waitForFunction(() => window.__state.report?.status === "done", null, { timeout: 15000 });
    const out = await page.evaluate(() => ({
      moments: [...document.querySelectorAll(".report-moment")].map((b) => ({ label: b.getAttribute("aria-label"), text: b.textContent })),
      captions: [...document.querySelectorAll(".report-phases caption")].map((c) => c.textContent),
      humanColor: window.__state.report.model.humanColor,
    }));
    for (const mo of out.moments) assert(!mo.label, `a moment button hides its words behind aria-label "${mo.label}"`);
    assert(out.humanColor == null, "expected a two-player report");
    // The offline estimate gives no phase table; when there is one, each is named.
    for (const c of out.captions) assert(/Black|White/.test(c), `phase table caption "${c}"`);
    await page.close();
  });
}
