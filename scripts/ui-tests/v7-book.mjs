/**
 * v7 browser checks: book. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser).
 */
export default async function ({ check, assert, fresh, onboard, clickPoint }) {
  /** Where the board's coordinate labels would be drawn, against the canvas. */
  const labelRoom = (page) =>
    page.evaluate(() => {
      const b = window.__board;
      const g = b.geom;
      const win = b.window();
      const cell = g.cell;
      const gap = Math.min(cell * 0.8, cell * 0.5 + 18);
      const fs = Math.max(10, Math.min(13, cell * 0.3));
      const ctx = b.canvas.getContext("2d");
      ctx.font = `500 ${fs}px ${b.font || "sans-serif"}`;
      const wide = ctx.measureText("10").width;
      const openL = win.x0 > 0 ? cell * 0.36 : 0;
      const openB = win.y1 < b.model.size - 1 ? cell * 0.36 : 0;
      return {
        view: b.model.view,
        left: g.ox + win.x0 * cell - gap - openL - wide / 2,
        bottom: g.oy + win.y1 * cell + gap + openB + fs / 2,
        w: g.w,
        h: g.h,
      };
    });

  await check("v7 book: corner joseki zoom to the corner with every coordinate on the canvas", async () => {
    for (const size of [{ width: 1200, height: 800 }, { width: 1600, height: 1000 }]) {
      const page = await fresh("en-US", size);
      await onboard(page, 1);
      await page.keyboard.press("Control+4");
      await page.click(".tabs-row .segmented button >> nth=3");
      await page.click('.collection-row[data-explorer="corner"]');
      await page.waitForSelector(".explorer-panel");
      await page.waitForFunction(() => window.__board?.model.view && window.__board.geom);
      const r = await labelRoom(page);
      assert(r.view.x0 === 9 && r.view.y0 === 0, `not the upper-right corner: ${JSON.stringify(r.view)}`);
      assert(r.left >= 0, `${size.width}: row numbers clipped (${r.left.toFixed(1)})`);
      assert(r.bottom <= r.h, `${size.width}: column letters clipped (${r.bottom.toFixed(1)} > ${r.h})`);
      // A move in the corner keeps the zoom; the toggle shows the whole board and back.
      await clickPoint(page, 15, 3);
      await page.waitForFunction(() => window.__state.explorer?.game.moveNumber === 1);
      assert(await page.evaluate(() => !!window.__board.model.view), "the zoom went away after a corner move");
      await page.click(".explorer-zoom");
      await page.waitForFunction(() => window.__board.model.view === null);
      const label = await page.getAttribute(".explorer-zoom", "aria-label");
      assert(label === "Zoom to the corner", `toggle label ${label}`);
      // A tenuki leaves the corner: the whole board shows and the toggle is gone.
      await clickPoint(page, 3, 9);
      await page.waitForFunction(() => window.__state.explorer?.game.moveNumber === 2);
      assert((await page.locator(".explorer-zoom").count()) === 0, "zoom toggle after a tenuki");
      await page.click(".explorer-layer .review-nav .icon-btn >> nth=1");
      await page.waitForFunction(() => window.__state.explorer?.game.moveNumber === 1);
      await page.click(".explorer-zoom");
      await page.waitForFunction(() => !!window.__board.model.view);
      // The whole-board tree never zooms.
      await page.click(".explorer-panel .segmented button >> nth=0");
      await page.waitForFunction(() => window.__state.explorer?.mode === "whole");
      await page.waitForFunction(() => window.__board.model.view === null);
      assert((await page.locator(".explorer-zoom").count()) === 0, "zoom toggle on the whole board");
      assert(page.errors.length === 0, page.errors.join("; "));
      await page.close();
    }
  });

  await check("v7 book: About this book names the network, the visits and the size", async () => {
    const page = await fresh();
    await onboard(page, 1);
    await page.keyboard.press("Control+4");
    await page.click(".tabs-row .segmented button >> nth=3");
    await page.click('.collection-row[data-explorer="corner"]');
    await page.waitForSelector(".explorer-about");
    await page.click(".explorer-about summary");
    const text = await page.textContent(".explorer-build");
    assert(/positions\. Network: \S+; \d[\d,]* visits per position; KataGo /.test(text), `about: ${text}`);
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });
}
