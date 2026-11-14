/**
 * Practice: problems in the browser — a solve after a miss, a problem first
 * shown White to play, and reading the widened problem window. Loaded by scripts/ui-test.mjs before the visual
 * baselines; receives its helpers (check, assert, fresh, onboard,
 * clickPoint, pointOf, origin, browser).
 */
export default async function ({ check, assert, fresh, onboard, clickPoint, origin }) {
  /** The first capture problem: its first correct move and one legal wrong move inside its view. */
  async function openFirstProblem(page) {
    await page.keyboard.press("Control+3");
    await page.click(".topic-row >> nth=0");
    await page.click(".problem-card >> nth=0");
    await page.waitForFunction(() => window.__state.practice.view === "problem");
    // The view switches before the board mounts; wait for the problem's own board.
    await page.waitForFunction(() => {
      const P = window.__state.practice.problem;
      const b = window.__board;
      return P?.pz && b?.model?.size === P.pz.size && !!b.model.view && b.geom?.cell > 0;
    });
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

  await check("practice problems: a problem solved after a miss is marked solved (not clean)", async () => {
    const page = await fresh();
    await onboard(page, 1);
    const p = await openFirstProblem(page);
    assert(p, "no wrong move found");
    await clickPoint(page, p.wrong.x, p.wrong.y);
    await page.waitForFunction(() => window.__state.practice.problem.feedback === "retry", null, { timeout: 5000 });
    await clickPoint(page, p.ok.x, p.ok.y);
    await page.waitForFunction(() => window.__state.practice.problem.status === "won", null, { timeout: 8000 });
    const rec = await page.evaluate((id) => window.__state.profile.problems[id], p.id);
    assert(rec.solved === true && rec.clean === false, `solved, not clean: ${JSON.stringify(rec)}`);
    assert(rec.streak === 0 && rec.tries === 1, `the miss still sets the schedule: ${JSON.stringify(rec)}`);
    // In the player model's file, once the store has written it.
    await page.waitForFunction((id) => JSON.parse(localStorage.getItem("goban9:profile.json") || "{}").problems?.[id]?.solved === true, p.id, { timeout: 2000 });
    await page.close();
  });

  await check("practice problems: a problem first shown in White says White to play on its tile and board, and takes White's answer", async () => {
    const page = await fresh();
    // A player whose seed makes some of the life problems White to play (practice/transform.js firstTransform).
    const profile = { v: 13, rating: {}, history: [], games: [], problems: {}, mistakes: [], lessons: {}, classics: {}, week: null, placement: { skipped: true, at: 1 }, days: {}, marks: {}, seed: "1f3a9c2e" };
    await page.addInitScript((p) => {
      if (localStorage.getItem("goban9:settings.json")) return;
      localStorage.setItem("goban9:settings.json", JSON.stringify({ v: 13, onboarded: true, lang: "en", experience: "player", playerRank: 18 }));
      localStorage.setItem("goban9:profile.json", JSON.stringify(p));
    }, profile);
    await page.goto(origin + "/");
    await page.waitForFunction(() => window.__state?.ready && window.__state.profile.seed === "1f3a9c2e");
    await page.keyboard.press("Control+3");
    await page.click(".topic-row[data-topic=life]");
    await page.waitForSelector(".problem-card");
    const tiles = await page.evaluate(() => [...document.querySelectorAll(".problem-card")].map((el) => ({ label: el.getAttribute("aria-label"), white: !!el.querySelector(".tile-foot .stone.w"), black: !!el.querySelector(".tile-foot .stone.b") })));
    const whites = tiles.filter((x) => x.white);
    assert(whites.length > 0 && whites.length < tiles.length, `the life problems are all one colour: ${whites.length} of ${tiles.length} White`);
    for (const x of tiles) assert(x.white === /White to play/.test(x.label) && x.black === /Black to play/.test(x.label), `the stone and the label disagree: ${JSON.stringify(x)}`);
    const at = tiles.findIndex((x) => x.white);
    await page.click(`.problem-card >> nth=${at}`);
    await page.waitForFunction(() => {
      const P = window.__state.practice.problem;
      return P?.pz && window.__board?.model?.size === P.pz.size && window.__board.geom?.cell > 0;
    });
    const shown = await page.evaluate(() => {
      const P = window.__state.practice.problem;
      return { id: P.def.id, shown: P.def.shown, user: P.pz.userColor, h1: document.querySelector(".panel h1").innerText.trim(), hover: window.__board.model.hoverColor };
    });
    assert(shown.user === -1 && shown.shown?.swap === true && shown.shown.sym === 0, `not White to play as written: ${JSON.stringify(shown)}`);
    assert(/^White to play: (live|seki)$/.test(shown.h1), `the heading: ${shown.h1}`);
    // White's right answer, move by move as the solver gives it.
    for (let i = 0; i < 12; i++) {
      const st = await page.evaluate(() => ({ status: window.__state.practice.problem.status, busy: window.__state.practice.problem.busy }));
      if (st.status === "won") break;
      assert(st.status === "open", `the right answer was not taken: ${st.status}`);
      if (!st.busy) {
        const next = await page.evaluate(() => window.__solver.winningMoves(window.__state.practice.problem.pz, window.__state.practice.problem.st)[0]);
        await clickPoint(page, next.x, next.y);
      }
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(() => window.__state.practice.problem.status === "won", null, { timeout: 8000 });
    const rec = await page.evaluate((id) => window.__state.profile.problems[id], shown.id);
    assert(rec?.solved === true && rec.clean === true && rec.tries === 1, `recorded under ${shown.id}: ${JSON.stringify(rec)}`);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("goban9:profile.json") || "{}").seed === "1f3a9c2e", null, { timeout: 2000 });
    assert(page.errors.length === 0, page.errors.join("; "));
    await page.close();
  });

  await check("practice problems: row, column and board reading cover the widened problem window", async () => {
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

}
