/**
 * Core: the solver (v13) — results cut short by the node budget never enter the transposition
 * table as results, and reply() / status() treat an inexact search as unknown.
 */
import { test, S, assert } from "./helpers.mjs";

const LADDER = [". . . . . . . . .", ". . . . . . . . .", ". . . . . . . . .", ". . X o . . . . .", ". . . X X . . . .", ". . . . . . . . ."];

await test("v13 solver: a search out of nodes stores nothing inexact, and a later full search is unaffected", () => {
  const pz = S.createPuzzle({ goal: "capture", diagram: LADDER });
  const st = S.initialState(pz);
  const right = S.play(pz, st, S.indexOf(pz, 3, 2));
  const tiny = S.attackerWins(pz, right, 3);
  assert.equal(tiny.exact, false);
  // Every node the tiny search left was cut short by the budget: none of its
  // results may be read back later as a (depth-limited) result.
  for (const tt of Object.values(pz._tt)) for (const e of tt.values()) assert.equal(e.exact, true);
  // Tiny searches from every first move, then the real proof: the same
  // answer as on a fresh puzzle.
  for (let x = 0; x < pz.size; x++) {
    for (let y = 0; y < pz.size; y++) {
      const n = S.play(pz, st, S.indexOf(pz, x, y));
      if (n) for (const budget of [2, 7, 40]) S.attackerWins(pz, n, budget);
    }
  }
  const fresh = S.createPuzzle({ goal: "capture", diagram: LADDER });
  const a = S.solveFirstMoves(pz);
  const b = S.solveFirstMoves(fresh);
  assert.equal(a.exact, true);
  assert.deepEqual(a.correct, b.correct);
  assert.deepEqual(a.correct, [{ x: 3, y: 2 }]);
});

await test("v13 solver: reply() and status() treat an inexact search as open, not as a win or a loss", () => {
  const pz = S.createPuzzle({ goal: "capture", diagram: LADDER });
  // Too shallow to read the ladder out: every search is inexact.
  pz.maxDepth = 2;
  const st = S.initialState(pz);
  const right = S.play(pz, st, S.indexOf(pz, 3, 2));
  assert.equal(S.attackerWins(pz, right, 1000).exact, false);
  // The learner (to move) has not lost: the search simply does not know.
  assert.equal(S.status(pz, st), "open");
  // After the right move the opponent answers, and nothing is decided.
  assert.equal(S.status(pz, right), "open");
  const r = S.reply(pz, right);
  assert.ok(r, "the opponent still answers");
  assert.equal(r.refutes, false, "an unproved line is not a refutation");
  // With the full depth the same positions are proved as before.
  const full = S.createPuzzle({ goal: "capture", diagram: LADDER });
  const st2 = S.initialState(full);
  const wrong = S.play(full, st2, S.indexOf(full, 4, 3));
  assert.equal(S.reply(full, wrong).refutes, true);
  assert.equal(S.status(full, S.play(full, st2, S.indexOf(full, 3, 2))), "open");
});
