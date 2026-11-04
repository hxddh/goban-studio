/**
 * v7 tests: fixes. Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 */
export default async function ({ test, assert }) {
  const P = await import("../../src/web/js/persist.js");
  const A = await import("../../src/web/js/a11y.js");
  const R = await import("../../src/web/js/app/report-model.js");
  const { setLang } = await import("../../src/web/js/i18n.js");

  await test("v7 fix: a later success after a miss marks the problem solved, keeps the miss's schedule", () => {
    const progress = { problems: {} };
    P.markProblem(progress, "p", { solved: false }, 1000);
    const miss = { ...progress.problems.p };
    P.markSolvedLate(progress, "p", 2000);
    const now = progress.problems.p;
    assert.equal(now.solved, true);
    assert.deepEqual([now.attempts, now.streak, now.due], [miss.attempts, miss.streak, miss.due]);
    // A late success with no earlier record still counts once.
    P.markSolvedLate(progress, "q", 3000);
    assert.deepEqual([progress.problems.q.solved, progress.problems.q.attempts, progress.problems.q.streak], [true, 1, 0]);
  });

  await test("v7 fix: reading a problem board uses the window that is drawn", () => {
    setLang("en");
    const size = 19;
    const board = Array.from({ length: size }, () => new Array(size).fill(0));
    // Stones at K5 and P5 (x 9 and 14); the problem's own view starts at x 13.
    board[14][9] = 1;
    board[14][14] = -1;
    const model = { size, view: { x0: 13, y0: 13, x1: 18, y1: 18 } };
    const w = A.shownWindow(model);
    assert.deepEqual(w, { x0: 10, y0: 10, x1: 18, y1: 18 });
    assert.match(A.rowText(board, 14, { size, view: w }), /P/);
    assert.equal(A.shownWindow({ size, view: null }), null);
    // The whole drawn window is counted, not just the original six columns.
    board[11][10] = 1; // L8: inside the window, outside the view
    const all = A.boardText(board, { size, view: w });
    assert.match(all, /black 1, white 1/);
    assert.match(all, /Row 8: black L/);
  });

  await test("v7 fix: a two-player report drills one side at a time", () => {
    const mo = (index, color, loss) => ({ index, color, loss, best: { x: 0, y: 0 }, played: { x: 1, y: 1 }, accept: [] });
    const report = { confidence: "high", moments: [mo(10, 1, 8), mo(11, -1, 9), mo(20, 1, 5)] };
    assert.deepEqual(R.drillMoments(report, 3, 1).map((m) => m.index), [10, 20]);
    assert.deepEqual(R.drillMoments(report, 3, -1).map((m) => m.index), [11]);
    assert.equal(R.drillMoments(report).length, 3);
    const d = R.reportDrills(report, { sgf: "(;)", gameKey: "g", color: -1 });
    assert.deepEqual(d.add.map((x) => x.index), [11]);
  });
}
