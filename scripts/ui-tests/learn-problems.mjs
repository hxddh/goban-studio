/**
 * Learn: problems in the browser — a solve after a miss, and reading the
 * widened problem window. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser).
 */
export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  /** The first capture problem: its first correct move and one legal wrong move inside its view. */
  async function openFirstProblem(page) {
    await page.keyboard.press("Control+2");
    await page.click(".catalog-link .group-row");
    await page.click(".topic-row >> nth=0");
    await page.click(".problem-card >> nth=0");
    await page.waitForFunction(() => window.__state.learn.view === "problem");
    // The view switches before the board mounts; wait for the problem's own board.
    await page.waitForFunction(() => {
      const P = window.__state.learn.problem;
      const b = window.__board;
      return P?.pz && b?.model?.size === P.pz.size && !!b.model.view && b.geom?.cell > 0;
    });
    return page.evaluate(() => {
      const P = window.__state.learn.problem;
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

  await check("learn problems: a problem solved after a miss is marked solved (not clean)", async () => {
    const page = await fresh();
    await onboard(page, 1);
    const p = await openFirstProblem(page);
    assert(p, "no wrong move found");
    await clickPoint(page, p.wrong.x, p.wrong.y);
    await page.waitForFunction(() => window.__state.learn.problem.feedback === "retry", null, { timeout: 5000 });
    await clickPoint(page, p.ok.x, p.ok.y);
    await page.waitForFunction(() => window.__state.learn.problem.status === "won", null, { timeout: 8000 });
    const rec = await page.evaluate((id) => window.__state.profile.problems[id], p.id);
    assert(rec.solved === true && rec.clean === false, `solved, not clean: ${JSON.stringify(rec)}`);
    assert(rec.streak === 0 && rec.tries === 1, `the miss still sets the schedule: ${JSON.stringify(rec)}`);
    // In the player model's file, once the store has written it.
    await page.waitForFunction((id) => JSON.parse(localStorage.getItem("goban9:profile.json") || "{}").problems?.[id]?.solved === true, p.id, { timeout: 2000 });
    await page.close();
  });

  await check("learn problems: row, column and board reading cover the widened problem window", async () => {
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
      const P = window.__state.learn.problem;
      let n = 0;
      for (let x = w.win.x0; x <= w.win.x1; x++) if (P.st.board[w.view.y1 * P.pz.size + x]) n++;
      return n;
    }, { w });
    assert(stones === 0 || said.includes(letter) || /\d/.test(said), `row reading: "${said}"`);
    assert(!/empty/i.test(said) || stones === 0, `a row with ${stones} stones read as empty: "${said}"`);
    await page.close();
  });

}
