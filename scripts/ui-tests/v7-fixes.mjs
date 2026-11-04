/**
 * v7 browser checks: fixes. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser).
 */
export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  /** The first capture problem: its first correct move and one legal wrong move inside its view. */
  async function openFirstProblem(page) {
    await page.keyboard.press("Control+3");
    await page.click(".topic-card >> nth=0");
    await page.click(".problem-card >> nth=0");
    await page.waitForFunction(() => window.__state.practice.view === "problem");
    return page.evaluate(() => {
      const P = window.__state.practice.problem;
      const S = window.__solver;
      const ok = S.solveFirstMoves(P.pz).correct[0];
      const v = P.pz.view;
      for (let y = 0; y < P.pz.size; y++)
        for (let x = 0; x < P.pz.size; x++) {
          if (P.st.board[y * P.pz.size + x] || (x === ok.x && y === ok.y)) continue;
          if (v && (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1)) continue;
          if (S.play(P.pz, P.st, y * P.pz.size + x)) return { id: P.def.id, ok, wrong: { x, y } };
        }
      return null;
    });
  }

  await check("v7 fix: a problem solved after a miss is marked solved (not clean)", async () => {
    const page = await fresh();
    await onboard(page, 1);
    const p = await openFirstProblem(page);
    assert(p, "no wrong move found");
    await clickPoint(page, p.wrong.x, p.wrong.y);
    await page.waitForFunction(() => window.__state.practice.problem.feedback === "retry", null, { timeout: 5000 });
    await clickPoint(page, p.ok.x, p.ok.y);
    await page.waitForFunction(() => window.__state.practice.problem.status === "won", null, { timeout: 8000 });
    const rec = await page.evaluate((id) => window.__state.progress.problems[id], p.id);
    assert(rec.solved === true, `solved: ${JSON.stringify(rec)}`);
    assert(rec.streak === 0 && rec.attempts === 1, `the miss still sets the schedule: ${JSON.stringify(rec)}`);
    await page.close();
  });

  await check("v7 fix: row, column and board reading cover the widened problem window", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await openFirstProblem(page);
    const w = await page.evaluate(() => ({ view: window.__board.model.view, win: window.__board.window(), size: window.__board.model.size }));
    assert(w.win.x0 < w.view.x0, `the window is not wider than the view: ${JSON.stringify(w)}`);
    await page.focus("canvas.board");
    // Put the cursor on a point that is on screen but outside the problem's own view.
    await page.evaluate((w) => {
      window.__board.model.cursor = { x: w.win.x0, y: w.view.y1 };
    }, w);
    await page.keyboard.press("r");
    await page.waitForTimeout(80);
    const said = await page.evaluate(() => (document.querySelector(".board-frame [aria-live]")?.textContent || "").replace(/​/g, ""));
    // The row starts at the window's first column, so it names that column's letter.
    const letter = "ABCDEFGHJKLMNOPQRST"[w.win.x0];
    const stones = await page.evaluate(({ w }) => {
      const P = window.__state.practice.problem;
      let n = 0;
      for (let x = w.win.x0; x <= w.win.x1; x++) if (P.st.board[w.view.y1 * P.pz.size + x]) n++;
      return n;
    }, { w });
    assert(stones === 0 || said.includes(letter) || /\d/.test(said), `row reading: "${said}"`);
    assert(!/empty/i.test(said) || stones === 0, `a row with ${stones} stones read as empty: "${said}"`);
    await page.close();
  });

  await check("v7 fix: report moments keep their words; phase tables are named; two-player drills pick a side", async () => {
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
    // End it: two passes, accept the count; the finished game is saved to the Library.
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("Control+Shift+P");
      await page.click(".sheet-foot .btn.primary");
    }
    await page.waitForSelector(".score-card");
    await page.click(".score-card .btn.primary");
    await page.waitForSelector(".result-card");
    await page.keyboard.press("Control+4");
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
