/**
 * Shell: how much of the interface one change re-renders. Loaded by
 * scripts/ui-test.mjs before the visual baselines; receives its helpers.
 *
 * The page counts component renders (window.__renders, app/debug.js) and
 * the store's notifications. A change that concerns one area (app/store.js
 * updateSlice) re-renders the components that read it, not the shell: a
 * move in Play, a tick of the review's analysis, a problem attempt. The
 * shell itself (Shell: the sidebar, the sheets layer, the messages) does
 * not render for them at all. The totals have about twice the headroom of
 * what is measured; with the whole tree re-rendered on each notification
 * a move measured 170 and an attempt 296.
 *
 *   RENDER_REPORT=1 (or =all) node scripts/ui-test.mjs   prints the counts
 */
export const RENDERS = {
  move: 130, // a move and the computer's reply, every render it causes (63 measured)
  analysisTick: 90, // renders per notification while a review is analysed (47)
  attempt: 150, // a wrong answer to a problem and its reset (77)
};

const settle = (page) => page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 400)));
// RENDER_REPORT=all names every component that rendered, not the top six.
const TOP = process.env.RENDER_REPORT === "all" ? Infinity : 6;
const read = (page) => page.evaluate((top) => {
  const c = window.__renders;
  const names = Object.entries(c.by).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, n]) => `${k} ${n}`).join(", ");
  return { total: c.total, batches: c.batches, shell: c.by.Shell || 0, top: names };
}, TOP);

export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  /** Measure what one change re-renders: `act` runs it and waits until it is done. */
  async function measure(page, act) {
    await settle(page);
    await page.evaluate(() => window.__renders.reset());
    await act();
    await settle(page);
    return read(page);
  }

  await check("shell renders: a move, a review's analysis and a problem attempt re-render only what they change", async () => {
    // A move in Play and the computer's reply (offline engine).
    const page = await fresh();
    await onboard(page, 1);
    await page.waitForFunction(() => window.__state.game && !window.__state.game.thinking && window.__board?.geom);
    const move = await measure(page, async () => {
      const n = await page.evaluate(() => window.__state.game.game.moveNumber);
      await clickPoint(page, 2, 2);
      await page.waitForFunction((n) => window.__state.game.game.moveNumber >= n + 2 && !window.__state.game.thinking, n, { timeout: 8000 });
    });

    // A 150-move game opened from the history, analysed on the spot: renders per notification.
    await page.evaluate(() => {
      const L = "abcdefghijklmnopqrs";
      let sgf = "(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]RE[W+R]PB[You]PW[KataGo]";
      for (let i = 0, y = 0; y < 19 && i < 150; y += 2) for (let x = 0; x < 19 && i < 150; x++, i++) sgf += `;${i % 2 ? "W" : "B"}[${L[x]}${L[y]}]`;
      const at = Date.now();
      const meta = { opponent: "ai", rank: 12, impl: "L:10k", humanColor: 1, size: 19, moves: 150, result: "W+R", name: "Seed", thumb: "" };
      localStorage.setItem("goban9:games/seed.json", JSON.stringify({ id: "seed", createdAt: at, updatedAt: at, finishedAt: at, source: "game", sgf: sgf + ")", meta }));
    });
    await page.reload();
    await page.waitForSelector(".page, canvas.board");
    await page.keyboard.press("Control+4");
    await page.waitForSelector(".game-row");
    await page.click(".game-row >> nth=0");
    await page.waitForFunction(() => window.__state.review?.analyzing, null, { timeout: 5000 });
    await page.evaluate(() => window.__renders.reset());
    await page.waitForFunction(() => window.__state.review && !window.__state.review.analyzing && window.__state.review.model, null, { timeout: 15000 });
    await settle(page);
    const tick = await read(page);
    const perTick = Math.round(tick.total / Math.max(1, tick.batches));
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();

    // A wrong answer to the first capture problem, and the reset that follows.
    const p2 = await fresh();
    await onboard(p2, 1);
    await p2.keyboard.press("Control+3");
    await p2.click(".topic-row >> nth=0");
    await p2.click(".problem-card >> nth=0");
    await p2.waitForFunction(() => {
      const P = window.__state.practice.problem;
      return P?.pz && window.__board?.model?.size === P.pz.size && window.__board.geom?.cell > 0;
    });
    const wrong = await p2.evaluate(() => {
      const P = window.__state.practice.problem;
      const S = window.__solver;
      const ok = S.solveFirstMoves(P.pz).correct;
      const v = P.pz.view;
      for (let y = 0; y < P.pz.size; y++)
        for (let x = 0; x < P.pz.size; x++) {
          if (P.st.board[y * P.pz.size + x] || ok.some((m) => m.x === x && m.y === y)) continue;
          if (v && (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1)) continue;
          if (S.play(P.pz, P.st, y * P.pz.size + x)) return { x, y };
        }
      return null;
    });
    assert(wrong, "no wrong move found");
    const attempt = await measure(p2, async () => {
      await clickPoint(p2, wrong.x, wrong.y);
      await p2.waitForFunction(() => window.__state.practice.problem.feedback === "retry", null, { timeout: 5000 });
    });
    assert(p2.errors.length === 0, p2.errors.join("; "));
    await p2.close();

    const report = `move ${move.total} renders in ${move.batches} notifications [${move.top}]; analysis ${perTick} per notification (${tick.total} in ${tick.batches}) [${tick.top}]; attempt ${attempt.total} in ${attempt.batches} [${attempt.top}]`;
    if (process.env.RENDER_REPORT) console.log(report);
    assert(move.shell === 0 && attempt.shell === 0, `the shell re-rendered: ${report}`);
    // The analysis starts and ends with an update() of everything (the review's state changes).
    assert(tick.shell <= 2, `the shell re-rendered during the analysis: ${report}`);
    assert(move.total < RENDERS.move, `a move: ${report}`);
    assert(perTick < RENDERS.analysisTick, `analysis: ${report}`);
    assert(attempt.total < RENDERS.attempt, `attempt: ${report}`);
    return report;
  });
}
