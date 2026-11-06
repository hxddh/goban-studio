/**
 * Core: the problem solver — life and death, ladders, nets, snapbacks, ko, seki, capturing races and the endgame counting model.
 */
import { test, BLACK, EG_DOUBLE, EG_HANE, PROBLEMS, RACE, S, SEKI, WHITE, assert, egLine, egPuzzle, empty, execFileSync, libertiesAt, localCorrect, path, race, replay, results, root } from "./helpers.mjs";

await test("the solver proves classic shapes: straight three dies, straight four lives", () => {
  const straight3 = S.createPuzzle({ goal: "kill", diagram: [". . . O X ,", "o O O O X ,", "X X X X X ,", ", , , , , ,"] });
  assert.deepEqual(S.solveFirstMoves(straight3).correct, [{ x: 1, y: 0 }]);
  const live3 = S.createPuzzle({ goal: "live", diagram: [". . . O X ,", "o O O O X ,", "X X X X X ,", ", , , , , ,"] });
  assert.deepEqual(S.solveFirstMoves(live3).correct, [{ x: 1, y: 0 }]);
  const four = S.createPuzzle({ goal: "kill", diagram: [". . . . O X ,", "o O O O O X ,", "X X X X X X ,", ", , , , , , ,"] });
  const r = S.solveFirstMoves(four);
  assert.equal(r.exact, true);
  assert.equal(r.correct.length, 0, "straight four cannot be killed");
});

await test("the solver reads a ladder and answers a wrong move with the refutation", () => {
  const pz = S.createPuzzle({ goal: "capture", diagram: [". . . . . . . . .", ". . . . . . . . .", ". . . . . . . . .", ". . X o . . . . .", ". . . X X . . . .", ". . . . . . . . ."] });
  const first = S.solveFirstMoves(pz);
  assert.equal(first.exact, true);
  assert.deepEqual(first.correct, [{ x: 3, y: 2 }]);
  // A wrong first move: the defender escapes, and the solver says so.
  const st = S.initialState(pz);
  const wrong = S.play(pz, st, S.indexOf(pz, 4, 3));
  const r = S.reply(pz, wrong);
  assert.equal(r.refutes, true);
  // The solution line ends in a won position.
  let cur = S.initialState(pz);
  for (const m of S.solutionLine(pz)) cur = S.play(pz, cur, S.indexOf(pz, m.x, m.y));
  assert.equal(S.status(pz, cur), "won");
});

await test("the solver reads nets (geta) of four shapes, and loose nets fail when three liberties count as escaped", () => {
  const nets = [
    // Open board, the ladder is broken by the white stone: only the tight net works.
    { at: [4, 4], diagram: [". . . . . . . . .", ". . . . . . . . .", ". . . X X . . . .", ". . X o . . . . .", ". . X . . . . . .", ". . . . . . . . .", ". . . . . . O . .", ". . . . . . . . .", ". . . . . . . . ."], net: "4,4", tight: true },
    // Near the corner: White pushes out twice and is still caught.
    { corner: "tl", diagram: [". . . . . . . .", "X . . . . . . .", ". . . . . . . .", "X o . . . . . .", ". X . X . . . .", ". . . . . . . ."], net: "2,2" },
    // On the side, cut off between two black stones.
    { at: [3, 0], diagram: [". . . . . . . . .", ". . . . X . X . .", ". . . X o . . . .", ". . X . . . O . .", ". . . . . X . . .", ". . . . . . . . .", ". . . . . . . . ."], net: "5,3" },
    // The classic diagonal net with a helper stone in the ladder's path.
    { at: [3, 0], diagram: [". . . . . . . .", ". . X . X . . .", ". X o . . . . .", ". X . . . . . .", ". . . . O . . .", ". . . . . . . .", ". . . . . . . ."], net: "3,3" },
  ];
  for (const n of nets) {
    const pz = S.createPuzzle({ goal: "capture", at: n.at, corner: n.corner, diagram: n.diagram });
    const v = S.validate(pz);
    assert.deepEqual(v.reasons, []);
    assert.deepEqual(localCorrect(pz), [n.net]);
    // A net, not an atari: the first move does not touch the stones.
    const k0 = S.indexOf(pz, pz.keys[0].x, pz.keys[0].y);
    assert.equal(libertiesAt(pz, S.play(pz, S.initialState(pz), S.indexOf(pz, v.line[0].x, v.line[0].y)), k0), libertiesAt(pz, S.initialState(pz), k0));
    // A loose net lets the stones reach three liberties and still catches them.
    let st = S.initialState(pz);
    let pushedTo3 = false;
    for (const m of v.line) {
      st = S.play(pz, st, S.indexOf(pz, m.x, m.y));
      const k = S.indexOf(pz, pz.keys[0].x, pz.keys[0].y);
      if (m.c === pz.keyColor && st.board[k] === pz.keyColor && libertiesAt(pz, st, k) >= 3) pushedTo3 = true;
    }
    assert.equal(S.status(pz, st), "won");
    if (n.tight) continue;
    assert.equal(pushedTo3, true, "the net lets the stones reach three liberties");
    // With the old rule (three liberties = escaped) a loose net cannot be expressed.
    const old = S.createPuzzle({ goal: "capture", at: n.at, corner: n.corner, diagram: n.diagram, escape: 3 });
    assert.ok(!localCorrect(old).includes(n.net));
  }
});

await test("the solver plays a snapback when an ordinary atari lets the stones connect out", () => {
  const pz = S.createPuzzle({ goal: "capture", at: [4, 0], diagram: [". X o . O O . .", ". X o . X O O .", ". . X X X . . .", ". . . . . . . .", ". . . . . . . ."] });
  const v = S.validate(pz);
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(localCorrect(pz), ["3,0"]);
  // Throw in, White captures, Black takes back three stones.
  assert.deepEqual(
    v.line.map((m) => `${m.x - pz.box.x0},${m.y - pz.box.y0}`),
    ["3,0", "3,1", "3,0"],
  );
  // The ordinary atari is refuted: White connects to its strong stones.
  const st = S.play(pz, S.initialState(pz), S.indexOf(pz, 7, 1));
  assert.equal(S.reply(pz, st).refutes, true);
});

await test("the solver tells a ko from an unconditional result and survives repeated ko captures", () => {
  // Bent four in the corner: the best Black can do is a ko.
  const diagram = [", , , X X X", ", X X X o O", ", X O O O .", ", X O . . ."];
  const plain = S.createPuzzle({ goal: "kill", corner: "br", diagram });
  assert.equal(S.outcome(plain, S.initialState(plain)), "ko");
  assert.ok(S.validate(plain).reasons.some((r) => r.includes("already lost")));
  const ko = S.createPuzzle({ goal: "kill", corner: "br", diagram, ko: "ok" });
  const v = S.validate(ko);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.result, "ko");
  // Play the ko out the way the app does: the opponent keeps retaking where
  // the rules allow, and every call returns.
  let st = S.initialState(ko);
  st = S.play(ko, st, S.indexOf(ko, v.first.correct[0].x, v.first.correct[0].y));
  for (let n = 0; n < 12; n++) {
    const r = S.reply(ko, st);
    if (!r || r.pass) break;
    st = S.play(ko, st, S.indexOf(ko, r.x, r.y));
    if (S.status(ko, st) !== "open") break;
    const moves = S.winningMoves(ko, st);
    if (!moves.length) break;
    st = S.play(ko, st, S.indexOf(ko, moves[0].x, moves[0].y));
  }
  // A ko the problem does not accept is refuted, not looped on.
  const corner = S.createPuzzle({ goal: "kill", corner: "br", diagram: [", , , X X X", ", X X X o O", ", X O O O .", ", X O . . ."] });
  assert.equal(S.status(corner, S.initialState(corner)), "lost");
});

await test("real-board rules: a captured point can be played again, and only replay: false keeps it empty", () => {
  // The old kill-false-eye-01: Black's atari captures four stones, but White
  // retakes on the captured point and lives. It only "worked" while a
  // captured point stayed out of play.
  const diagram = [", , , ,", "X X X X", "X O O O", "X X . O", ", X O .", ", X O O", ", X o O", ", X O ."];
  const real = S.createPuzzle({ goal: "kill", corner: "br", diagram });
  assert.equal(real.replay, true, "replay is the default");
  assert.deepEqual(localCorrect(real), []);
  assert.equal(S.status(real, S.initialState(real)), "lost");
  const old = S.createPuzzle({ goal: "kill", corner: "br", diagram, replay: false });
  assert.deepEqual(localCorrect(old), ["2,3"]);
});

await test("outsideReach() finds key stones that could breathe through a point nobody may play", () => {
  // The old life-expand-03: the first-line point above the eye space is ','.
  const open = [", , ,", ". O O", ". X O", ". X O", ". x O", ". X O", ". . O", "O O O", ", , ,"];
  const pz = S.createPuzzle({ goal: "live", at: [0, 8], diagram: open });
  assert.deepEqual(S.outsideReach(pz), [{ x: 0, y: 8 }]);
  // Closed by a white stone the group is dead, which is the real answer.
  const sealed = S.createPuzzle({ goal: "live", at: [0, 8], diagram: ["O , ,", ...open.slice(1)] });
  assert.deepEqual(S.outsideReach(sealed), []);
  assert.equal(S.status(sealed, S.initialState(sealed)), "lost");
  // Through captures: capturing a cutting stone to run out is still running out.
  const cut = S.createPuzzle({ goal: "live", corner: "tl", diagram: [". x O . ,", "X X X O ,", "O O O O ,", ", , , , ,"] });
  assert.equal(S.outsideReach(cut).length > 0, true);
  assert.deepEqual(S.outsideReach(cut, { throughCaptures: false }), []);
});

await test("a result that rests on superko is not reused on another line (the answer line stays a win)", () => {
  // The old life-vital-02: before results that depend on a repetition above
  // them stopped being cached, the answer line wandered into a loss.
  const pz = S.createPuzzle({ goal: "live", corner: "br", diagram: [", , , , , ,", ", , O O O O", ", O O X X x", ", O X X . .", ", O . O . .", ", O . X . ."] });
  const v = S.validate(pz);
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(localCorrect(pz), ["4,4"]);
});

await test("the solver's validate() rejects a start that is already decided", () => {
  // Already captured in all but name: two liberties and no way out.
  const dead = S.createPuzzle({ goal: "capture", corner: "tl", diagram: ["o . X .", ". X . .", "X . . .", ". . . ."] });
  assert.ok(S.validate(dead).reasons.some((r) => r.startsWith("starting position is already")));
  // Already alive: two real eyes.
  const alive = S.createPuzzle({ goal: "kill", diagram: [". o . O X ,", "O O O O X ,", "X X X X X ,", ", , , , , ,"] });
  assert.ok(S.validate(alive).reasons.some((r) => r.startsWith("starting position is already")));
});

await test("Benson's algorithm recognises two real eyes and rejects a false eye", () => {
  const alive = S.createPuzzle({ goal: "live", diagram: [". o . O X ,", "O O O O X ,", "X X X X X ,", ", , , , , ,"] });
  const st = S.initialState(alive);
  assert.equal(S.bensonAlive(alive, st.board, WHITE, [S.indexOf(alive, 1, 0)]), true);
  const single = S.createPuzzle({ goal: "live", diagram: [". . . o X ,", "O O O O X ,", "X X X X X ,", ", , , , , ,"] });
  const st2 = S.initialState(single);
  assert.equal(S.bensonAlive(single, st2.board, WHITE, [S.indexOf(single, 3, 0)]), false);
});

await test("the solver recognises seki and tells it from life, death and look-alikes", () => {
  const info = (diagram) => {
    const pz = S.createPuzzle({ goal: "seki", diagram });
    return S.sekiInfo(pz, S.initialState(pz));
  };
  const pure = info(SEKI.pure);
  assert.equal(pure.result, "seki");
  assert.deepEqual(pure.shared, [{ x: 0, y: 0 }, { x: 4, y: 0 }]);
  const eyeEye = info(SEKI.eyeEye);
  assert.equal(eyeEye.result, "seki");
  assert.deepEqual(eyeEye.shared, [{ x: 6, y: 0 }]);
  assert.equal(info(SEKI.eyeAndSpace).result, "alive");
  assert.equal(info(SEKI.short).result, "dead");
  assert.equal(info(SEKI.fiat).result, "unknown");
  // Neither side can fill a shared liberty of the pure seki: Black's fill is
  // self-atari and White captures; White's fill lets Black capture.
  const pz = S.createPuzzle({ goal: "seki", diagram: SEKI.pure });
  const st = S.initialState(pz);
  const blackFills = S.play(pz, st, S.indexOf(pz, 0, 0));
  assert.equal(S.attackerWins(pz, blackFills, 100000, pz.attacker).win, true);
  const whiteFills = S.play(pz, { ...st, toMove: WHITE }, S.indexOf(pz, 0, 0));
  assert.equal(S.attackerWins(pz, whiteFills, 100000, pz.attacker).win, false);
  // A kill problem that only reaches seki is a failure (Japanese rules): the
  // attacker cannot capture, and the position is not already "won" for it.
  const kill = S.createPuzzle({ goal: "kill", diagram: SEKI.pure.map((r) => r.replace(/[XOxo]/g, (c) => ({ X: "O", O: "X", x: "o", o: "x" })[c])) });
  assert.equal(S.attackerWins(kill, S.initialState(kill), 100000).win, false);
});

await test('goal "seki": the learner must survive, cannot live independently, and the answer ends in seki', () => {
  const problem = { goal: "seki", diagram: [". . . . . x O ,", ". . O O O X O ,", "X X X X X X O ,", "O O O O O O O ,", ", , , , , , , ,"] };
  const pz = S.createPuzzle(problem);
  assert.equal(pz.sekiGoal, true);
  assert.equal(pz.userColor, BLACK);
  const v = S.validate(pz);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.result, "seki");
  assert.deepEqual(localCorrect(pz), ["1,1"]);
  let st = S.initialState(pz);
  for (const m of v.line) st = S.play(pz, st, S.indexOf(pz, m.x, m.y));
  assert.equal(S.status(pz, st), "won");
  assert.equal(S.sekiInfo(pz, st).result, "seki");
  // The same idea with a group that can make two eyes is not a seki problem.
  const twoEyes = S.createPuzzle({ goal: "seki", diagram: [". . O X ,", ". o O X ,", "O O O X ,", "X X X X ,", ", , , , ,"].map((r) => r.replace(/[XOxo]/g, (c) => ({ X: "O", O: "X", x: "o", o: "x" })[c])) });
  assert.ok(S.validate(twoEyes).reasons.some((r) => r.includes("can live independently")));
  // goal "live" still accepts seki as survival.
  const live = S.createPuzzle({ ...problem, goal: "live" });
  assert.deepEqual(S.validate(live).reasons, []);
});

await test("capturing races: liberty counts, who moves first, shared liberties, eyes and big eyes", () => {
  // 3 against 3, no shared liberty: whoever moves first wins, and only by filling an outside liberty.
  const r33 = race(RACE.threeThree);
  assert.deepEqual([r33.blackFirst, r33.whiteFirst], [true, false]);
  assert.deepEqual(localCorrect(r33.kill), ["2,0", "2,1", "2,2"]);
  assert.deepEqual(localCorrect(r33.live), ["6,0", "6,1", "6,2"]);
  // 3 against 2: the side with fewer liberties loses even moving first.
  const r32 = race(RACE.threeTwo);
  assert.deepEqual([r32.blackFirst, r32.whiteFirst], [false, false]);
  const r23 = race(RACE.twoThree);
  assert.deepEqual([r23.blackFirst, r23.whiteFirst], [true, true]);
  // Two shared liberties and one outside liberty each: neither side can
  // capture, whoever moves first (seki); here Black's group is the key.
  const sh = race(RACE.shared);
  assert.equal(sh.blackFirst, false);
  assert.equal(sh.whiteFirst, false);
  const swapKey = RACE.shared.map((r) => r.replace("o", "O").replace(/^(, X \. O O \. )X/, "$1x"));
  const blackKey = S.createPuzzle({ goal: "kill", diagram: swapKey, at: [3, 0], toMove: WHITE });
  assert.equal(S.attackerWins(blackKey, S.initialState(blackKey), 600000).win, false, "White cannot capture Black either");
  // Eye against no eye: Black wins even if White moves first.
  const en = race(RACE.eyeNoEye);
  assert.deepEqual([en.blackFirst, en.whiteFirst], [true, true]);
  // Big eye against small eye wins even moving second; with equal one-point
  // eyes the same liberties lose even moving first.
  const bs = race(RACE.bigSmall);
  assert.deepEqual([bs.blackFirst, bs.whiteFirst], [true, true]);
  const ss = race(RACE.smallSmall);
  assert.deepEqual([ss.blackFirst, ss.whiteFirst], [false, false]);
});

await test("every practice problem is verified and graded by the solver", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/check-problems.mjs")], { stdio: "inherit" });
});

await test("endgame: a first-line hane and connection is gote, worth 2 points counted both ways", () => {
  const pz = egPuzzle(EG_HANE);
  const d = S.deiri(pz);
  assert.deepEqual([d.value, d.black, d.white, d.exact], [2, 5, 3, true], "Black first: 5; White first: 3");
  // Black hanes, White blocks, Black connects: gote. White's hane is the mirror.
  assert.equal(egLine(S.countLine(pz, BLACK)), "B5,0 W6,0 B4,0");
  assert.equal(egLine(S.countLine(pz, WHITE)), "W4,0 B3,0 W5,0");
  const f = S.solveFirstMoves(pz);
  assert.deepEqual(f.correct, [{ x: 5, y: 0 }]);
  assert.equal(f.target - f.second, 1, "blocking at home instead is one point worse");
});

await test("endgame: counted points (':') give the same proof as playing them out", () => {
  const sealed = egPuzzle(EG_HANE);
  const open = egPuzzle(EG_HANE.map((r) => r.replace(/:/g, ".")));
  const a = S.deiri(sealed);
  const b = S.deiri(open);
  assert.deepEqual([a.value, a.black, a.white], [b.value, b.black, b.white]);
  assert.deepEqual(S.solveFirstMoves(sealed).correct, S.solveFirstMoves(open).correct);
});

await test("endgame: a sente push keeps sente; blocking the opponent's sente push is reverse sente", () => {
  const push = egPuzzle(["X : . . X . . O", "X : : : X O : O", "X X X X X O O O", ", , , , , , , ,"]);
  assert.equal(S.deiri(push).value, 1);
  assert.equal(egLine(S.countLine(push, BLACK)), "B5,0 W6,0", "White has to block: Black keeps sente");
  assert.equal(egLine(S.countLine(push, WHITE)), "W5,0", "White's move there is gote");
  const block = egPuzzle(["X . . O . . : O", "X : X O : : : O", "X X X O O O O O", ", , , , , , , ,"]);
  assert.equal(S.deiri(block).value, 1);
  assert.equal(egLine(S.countLine(block, BLACK)), "B2,0", "Black's block is gote");
  assert.equal(egLine(S.countLine(block, WHITE)), "W2,0 B1,0", "White's push is sente");
});

await test("endgame: double sente is sente for both sides and comes before everything", () => {
  const pz = S.createPuzzle({ goal: "endgame", ask: "value", value: 2, choices: [1, 2, 3, 4], diagram: EG_DOUBLE, at: [4, 4] });
  assert.equal(S.deiri(pz).value, 2);
  // Whoever plays the shared point gives atari, and the other side connects.
  assert.equal(egLine(S.countLine(pz, BLACK)), "B7,8 W8,7");
  assert.equal(egLine(S.countLine(pz, WHITE)), "W7,8 B6,9");
  assert.ok(S.validate(pz).ok);
  const sum = PROBLEMS.find((p) => p.id === "endgame-order-04");
  const f = S.solveFirstMoves(S.createPuzzle(sum));
  assert.equal(f.correct.length, 1);
  assert.deepEqual(f.correct[0], { x: sum.answer[0].x + sum.at[0], y: sum.answer[0].y + sum.at[1] }, "the double sente point, before a sente push and a reverse sente block");
});

await test("endgame: in a sum of two areas the sente atari comes before the bigger gote move", () => {
  const pz = egPuzzle(["X : . . O . : O X : . . . . . O ,", "X : X X X O : O X : : : X O : O ,", "X X X X X O O O X X X X X O O O ,", ", , , , , , , , , , , , , , , , ,"]);
  const f = S.solveFirstMoves(pz);
  assert.deepEqual(f.correct, [{ x: 3, y: 0 }]);
  assert.equal(egLine(S.solutionLine(pz)), "B3,0 W5,0 B13,0 W14,0 B12,0", "sente atari, White connects, then the hane and connection");
  assert.equal(S.countAreas(pz), 2);
});

await test("endgame: when play ends, enclosed and atari'd stones are dead, as a Japanese count treats them", () => {
  // A white stone inside Black's sealed area: Black need not capture it.
  const pz = egPuzzle(["X X X X ,", "X . O X ,", "X . . X ,", "X X X X ,", ", , , , ,"]);
  const st = S.initialState(pz);
  assert.equal(S.countValue(pz, st).value, 5, "4 points of territory and 1 prisoner");
  assert.equal(S.countValue(pz, { ...st, toMove: WHITE }).value, 5, "White cannot save it");
  assert.ok(S.validate(pz).reasons.includes("passing is as good as any move: nothing to play"));
  // A move the model does not read (a dead stone in the opponent's area) is
  // refused for the app instead of being played.
  const hane = egPuzzle(EG_HANE);
  assert.deepEqual(S.playMove(hane, S.initialState(hane), S.indexOf(hane, 6, 1)), { outside: true });
  assert.ok(S.playMove(hane, S.initialState(hane), S.indexOf(hane, 5, 0)).next);
});

await test("endgame: the monkey jump is the large knight's slide from the second-line stone", () => {
  const p = PROBLEMS.find((x) => x.id === "endgame-monkey-01");
  assert.equal(p.theme, "monkey-jump");
  const pz = S.createPuzzle(p);
  const f = S.solveFirstMoves(pz);
  assert.equal(f.correct.length, 1);
  // From the end of Black's second-line stones, three along the first line.
  const m = { x: f.correct[0].x - pz.box.x0, y: f.correct[0].y - pz.box.y0 };
  assert.deepEqual(m, p.answer[0]);
  const rows = p.diagram.map((r) => r.replace(/\s+/g, ""));
  const second = rows.length - 2;
  const first = rows.length - 1;
  assert.equal(m.y, first);
  assert.equal(rows[second][m.x - 3], "X", "a black second-line stone a large knight's move away");
});
