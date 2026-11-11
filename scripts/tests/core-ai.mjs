/**
 * Core: the offline opponent — it passes on a settled board, never plays a move that only costs it
 * points (its own eye, its own territory, self-atari), and its candidates and Moka's pick obey
 * positional superko.
 */
import { test, BLACK, EMPTY, WHITE, assert, chooseMove, fromRows, Game } from "./helpers.mjs";

// Black on the left, White on the right, every boundary point filled: the
// only empty points are each side's own eyes and territory.
const SETTLED = [".X.XO.O..", "XXXXOO.O.", ".X.XO.O..", "XXXXOOOOO", ".X.XO.O..", "XXXXOO.O.", ".X.XO.O..", "XXXXOOOOO", ".X.XO.O.."];

function settled(turn) {
  const g = fromRows(SETTLED);
  if (turn === WHITE) g.pass(); // Black passes; White (the engine) to move
  else g.root.turn = BLACK;
  return g;
}

await test("offline AI: on a settled board it passes at once after the opponent's pass, at every level", async () => {
  for (const level of [1, 2, 3, 4, 5]) {
    for (let k = 0; k < 3; k++) {
      const g = settled(WHITE);
      assert.equal(g.turn, WHITE);
      const m = await chooseMove(g, { level });
      assert.deepEqual(m, { pass: true }, `level ${level}: ${JSON.stringify(m)}`);
    }
  }
  // And as Black, without a pass before it: there is still nothing to play.
  for (const level of [1, 3, 5]) assert.deepEqual(await chooseMove(settled(BLACK), { level }), { pass: true }, `black, level ${level}`);
});

await test("offline AI: it never plays inside its own one-point eye or its own territory", async () => {
  // White has one dame left (E5 here, between the walls) besides its eyes
  // and territory: that is the move, at every level, every time.
  const rows = SETTLED.map((r, y) => (y === 4 ? ".X.X..O.." : r));
  for (const level of [1, 2, 3, 4, 5]) {
    for (let k = 0; k < 4; k++) {
      const g = fromRows(rows);
      g.pass();
      const m = await chooseMove(g, { level });
      assert.deepEqual([m.x, m.y], [4, 4], `level ${level}: ${JSON.stringify(m)}`);
    }
  }
  // A whole game against itself: no move ever lands on a point that was the
  // mover's own eye (all four neighbours its own stones or the edge), and
  // the game ends by two passes long before the move limit.
  for (const level of [1, 2]) {
    const g = new Game({ size: 9 });
    let n = 0;
    while (g.phase === "playing" && n < 300) {
      const color = g.turn;
      const board = g.board;
      const m = await chooseMove(g, { level });
      if (m.pass) g.pass();
      else {
        const around = [[m.x - 1, m.y], [m.x + 1, m.y], [m.x, m.y - 1], [m.x, m.y + 1]].filter((p) => board.has(p));
        const diagonals = [[m.x - 1, m.y - 1], [m.x + 1, m.y - 1], [m.x - 1, m.y + 1], [m.x + 1, m.y + 1]].filter((p) => board.has(p));
        const eye = around.every((p) => board.get(p) === color) && diagonals.every((p) => board.get(p) === color);
        assert.equal(eye, false, `level ${level}, move ${n + 1}: filled its own eye at ${m.x},${m.y}`);
        assert.equal(g.play(m.x, m.y).ok, true);
        // Unless it captured, the stone it played is not left in atari.
        const took = g.board.getCaptures(color) - board.getCaptures(color);
        if (!took) assert.ok(g.board.getLiberties([m.x, m.y]).length > 1, `level ${level}, move ${n + 1}: self-atari at ${m.x},${m.y}`);
      }
      n++;
    }
    assert.equal(g.phase, "scoring", `level ${level}: the game ended by passes after ${n} moves`);
  }
});

await test("offline AI: it does not reduce its own group to one liberty by filling its territory", async () => {
  // White's group in the corner has exactly two eyes; every other point is
  // settled. Filling either eye would leave the group in atari.
  const rows = ["O.O.OXXXX", "OOOOOXXXX", "XXXXXXXXX", "XXXX.XXXX", "XXXXXXX.X", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX"];
  for (const level of [1, 2, 3, 4, 5]) {
    const g = fromRows(rows);
    g.pass();
    assert.equal(g.turn, WHITE);
    assert.equal(g.board.get([1, 0]), EMPTY);
    assert.deepEqual(await chooseMove(g, { level }), { pass: true }, `level ${level}`);
  }
});

await test("offline AI: it still answers an atari inside its own territory, and still captures", async () => {
  // White's wall stone at E5 is in atari from outside; its only liberty is
  // inside White's own territory. Saving it is not a wasted move.
  const rows = [".....O...", ".....O...", ".....O...", "...XXO...", "..X.O....", "...XXO...", ".....O...", ".....O...", ".....O..."];
  const g = fromRows(rows);
  g.pass();
  for (const level of [3, 4, 5]) {
    const m = await chooseMove(g, { level });
    assert.equal(m.pass, undefined, `level ${level} played`);
  }
  // A capture on the last dame is taken rather than passed over.
  const cap = fromRows(["XO.O.....", "XO.O.....", ".OOO.....", "OO.......", ".........", ".........", ".........", ".........", "........."]);
  cap.pass();
  for (const level of [3, 4, 5]) {
    const m = await chooseMove(cap, { level });
    assert.deepEqual([m.x, m.y], [0, 2], `level ${level}: ${JSON.stringify(m)}`);
  }
});

await test("offline AI: a pointless pick from Moka is not played", async () => {
  const g = settled(WHITE);
  globalThis.GobanMoka = { chooseMove: () => ({ x: 6, y: 1 }) }; // White's own eye
  try {
    assert.deepEqual(await chooseMove(g, { level: 3 }), { pass: true });
  } finally {
    delete globalThis.GobanMoka;
  }
});

/* ---------------------------------------------------------- positional superko */

// A 4×4 cycle: after these moves, White at B4 (1, 0) would repeat an
// earlier position (superko), while simple ko allows it.
const CYCLE = [[2, 1], [0, 1], [2, 2], [1, 0], [0, 3], [1, 2], [1, 1], [0, 2], [3, 0], [2, 0], [0, 0]];

function cycleGame() {
  const g = new Game({ size: 4 });
  for (const [x, y] of CYCLE) g.play(x, y);
  return g;
}

await test("offline AI: a move that repeats a position is never chosen", async () => {
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

await test("offline AI: an illegal pick from Moka falls back to a legal move", async () => {
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
