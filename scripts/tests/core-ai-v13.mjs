/**
 * Core: the offline opponent (v13) — its candidates, and Moka's pick, obey positional superko.
 */
import { test, WHITE, Game, assert, chooseMove } from "./helpers.mjs";

// A 4×4 cycle: after these moves, White at B4 (1, 0) would repeat an
// earlier position (superko), while simple ko allows it.
const CYCLE = [[2, 1], [0, 1], [2, 2], [1, 0], [0, 3], [1, 2], [1, 1], [0, 2], [3, 0], [2, 0], [0, 0]];

function cycleGame() {
  const g = new Game({ size: 4 });
  for (const [x, y] of CYCLE) g.play(x, y);
  return g;
}

await test("v13 offline AI: a move that repeats a position is never chosen", async () => {
  const g = cycleGame();
  assert.equal(g.turn, WHITE);
  assert.equal(g.canPlay(1, 0).reason, "superko");
  // Superko is the only thing wrong with B4: the board alone allows it.
  const a = g.board.analyzeMove(WHITE, [1, 0]);
  assert.equal(a.ko || a.suicide || a.overwrite, false);
  for (const level of [1, 2, 3]) {
    for (let k = 0; k < 15; k++) {
      const m = await chooseMove(g, { level });
      assert.ok(m.pass || g.canPlay(m.x, m.y).ok, `level ${level}: ${JSON.stringify(m)}`);
    }
  }
});

await test("v13 offline AI: an illegal pick from Moka falls back to a legal move", async () => {
  const g = new Game({ size: 9 });
  g.play(4, 4);
  const calls = [];
  globalThis.GobanMoka = {
    chooseMove: (game) => {
      calls.push(game.moveNumber);
      return { x: 4, y: 4 }; // occupied
    },
  };
  try {
    const m = await chooseMove(g, { level: 1 });
    assert.equal(calls.length, 1);
    assert.ok(!m.pass && g.canPlay(m.x, m.y).ok, JSON.stringify(m));
    globalThis.GobanMoka.chooseMove = () => ({ x: 2, y: 6 });
    assert.deepEqual(await chooseMove(g, { level: 1 }), { x: 2, y: 6 });
  } finally {
    delete globalThis.GobanMoka;
  }
});
