/**
 * Core: the rules — moves, captures, ko, suicide, scoring under the three rulesets, seki, marks and the game tree.
 */
import { test, BLACK, DEFAULT_RULES, EMPTY, Game, MESSAGES, RULESETS, SEKI_BOARD_CLOSED, WALLS, WHITE, assert, branchedGame, coordLabel, defaultKomi, findSeki, formatPoints, fromRows, handicapCompensation, loadSGF, newGame, normalizeRules, setup, territoryMap, treeLayout } from "./helpers.mjs";

await test("coordinates skip I and count rows from the bottom", () => {
  assert.equal(coordLabel(0, 0, 19), "A19");
  assert.equal(coordLabel(8, 18, 19), "J1");
  assert.equal(coordLabel(8, 0, 9), "J9");
  assert.equal(formatPoints(6.5), "6.5");
  assert.equal(formatPoints(7), "7");
});

await test("a fresh game uses the standard 19x19 board", () => {
  const g = newGame();
  assert.equal(g.size, 19);
  assert.equal(g.komi, 6.5);
  assert.equal(g.mainLine().length, 1);
});

await test("a stone alternates turns and cannot be overwritten", () => {
  const g = newGame(9);
  assert.deepEqual(g.play(4, 4), { ok: true, node: g.current, captures: { black: 0, white: 0 } });
  assert.equal(g.turn, WHITE);
  assert.equal(g.moveNumber, 1);
  assert.equal(g.play(4, 4).reason, "occupied");
  assert.equal(g.play(-1, 0).reason, "outside");
});

await test("undo discards a leaf instead of leaving a hidden branch", () => {
  const g = newGame();
  g.play(4, 4);
  g.play(3, 3);
  assert.equal(g.root.children[0].children.length, 1);
  assert.equal(g.undo(), true);
  assert.equal(g.current.move.x, 4);
  assert.equal(g.root.children[0].children.length, 0);
  assert.equal(g.moveNumber, 1);
});

await test("capturing removes the group and counts prisoners", () => {
  const g = setup(
    [
      { x: 0, y: 0, color: WHITE },
      { x: 1, y: 0, color: BLACK },
    ],
    BLACK,
  );
  const result = g.play(0, 1);
  assert.equal(result.ok, true);
  assert.equal(g.board.get([0, 0]), EMPTY);
  assert.equal(g.board.get([0, 1]), BLACK);
  assert.equal(g.capturesOf(g.current).black, 1);
  assert.equal(g.turn, WHITE);
});

await test("suicide is rejected", () => {
  const g = setup(
    [
      { x: 3, y: 4, color: BLACK },
      { x: 5, y: 4, color: BLACK },
      { x: 4, y: 3, color: BLACK },
      { x: 4, y: 5, color: BLACK },
    ],
    WHITE,
  );
  assert.deepEqual(g.canPlay(4, 4), { ok: false, reason: "suicide" });
  assert.equal(g.play(4, 4).reason, "suicide");
});

await test("simple ko cannot be recaptured immediately", () => {
  const g = setup(
    [
      { x: 1, y: 1, color: WHITE },
      { x: 0, y: 1, color: BLACK },
      { x: 1, y: 0, color: BLACK },
      { x: 1, y: 2, color: BLACK },
      { x: 3, y: 1, color: WHITE },
      { x: 2, y: 0, color: WHITE },
      { x: 2, y: 2, color: WHITE },
    ],
    BLACK,
  );
  assert.equal(g.play(2, 1).ok, true);
  assert.equal(g.board.get([1, 1]), EMPTY);
  assert.equal(g.board.get([2, 1]), BLACK);
  assert.equal(g.canPlay(1, 1).reason, "ko");
  assert.equal(g.play(1, 1).reason, "ko");
});

await test("Japanese territory scoring counts territory, prisoners and komi", () => {
  const shape = [
    { x: 1, y: 0, color: BLACK },
    { x: 0, y: 1, color: BLACK },
  ];
  const japanese = setup(shape, BLACK);
  const js = japanese.score();
  assert.equal(js.black, 1);
  assert.equal(js.white, 6.5);
  assert.equal(js.result, "W+5.5");
  assert.equal(js.method, "territory");
  assert.equal(js.rules, "japanese");
  assert.equal(js.blackStones, null);
  assert.equal(js.blackPrisoners, 0);
});

await test("dead stones are removed before scoring", () => {
  const g = setup(
    [
      { x: 1, y: 0, color: BLACK },
      { x: 0, y: 1, color: BLACK },
      { x: 0, y: 0, color: WHITE },
    ],
    BLACK,
  );
  const score = g.score([{ x: 0, y: 0 }]);
  // White's only stone is dead, so White has nothing alive: the corner eye
  // and the open board are Black's (81 points less Black's two stones).
  assert.equal(score.blackTerritory, 79);
  assert.equal(score.board.get([0, 0]), EMPTY);
});

await test("territory is not awarded for an open, sparse board", () => {
  const g = newGame();
  g.play(4, 4);
  const t = territoryMap(g.board);
  assert.equal(t.flat().every((v) => v === 0), true);
});

await test("a wall that does not separate the board earns no territory", () => {
  const g = setup(
    [
      { x: 2, y: 2, color: BLACK },
      { x: 3, y: 2, color: BLACK },
      { x: 4, y: 2, color: BLACK },
    ],
    BLACK,
  );
  const t = territoryMap(g.board);
  assert.equal(t.flat().every((v) => v === 0), true);
});

// v13: a region that reaches all four sides is territory once the other
// colour has stones in the game (they lie in a region of their own).
const CORNER_LIFE = [
  "..OX.....",
  "..OX.....",
  "OOOX.....",
  "XXXX.....",
  ".........",
  ".........",
  ".........",
  ".........",
  ".........",
];

await test("scoring: a corner group alive and the rest owned by one side, under all three rulesets", () => {
  const counts = territoryMap(fromRows(CORNER_LIFE).board).flat();
  assert.equal(counts.filter((v) => v === BLACK).length, 65);
  assert.equal(counts.filter((v) => v === WHITE).length, 4);
  const jp = fromRows(CORNER_LIFE).score();
  assert.equal(jp.blackTerritory, 65);
  assert.equal(jp.whiteTerritory, 4);
  assert.equal(jp.neutral, 0);
  assert.equal(jp.black, 65);
  assert.equal(jp.white, 10.5);
  assert.equal(jp.result, "B+54.5");
  const kr = fromRows(CORNER_LIFE, { rules: "korean" }).score();
  assert.equal(kr.result, "B+54.5");
  // Area: the same territory plus the stones on the board.
  const cn = fromRows(CORNER_LIFE, { rules: "chinese" }).score();
  assert.equal(cn.blackTerritory, 65);
  assert.equal(cn.blackStones, 7);
  assert.equal(cn.whiteStones, 5);
  assert.equal(cn.black, 72);
  assert.equal(cn.white, 16.5);
  assert.equal(cn.result, "B+55.5");
  assert.equal(cn.black + cn.white - cn.komi, 81);
});

await test("scoring: a side group alive and the rest owned; colours swapped", () => {
  const side = [
    ".XO...OX.",
    ".XO...OX.",
    ".XOOOOOX.",
    ".XXXXXXX.",
    ".........",
    ".........",
    ".........",
    ".........",
    ".........",
  ];
  const s = fromRows(side).score();
  assert.equal(s.blackTerritory, 53);
  assert.equal(s.whiteTerritory, 6);
  assert.equal(s.neutral, 0);
  // The same with the colours swapped: White owns the open board.
  const swap = (rows) => rows.map((r) => r.replace(/X/g, "o").replace(/O/g, "X").replace(/o/g, "O"));
  const w = fromRows(swap(CORNER_LIFE), { rules: "chinese" }).score();
  assert.equal(w.whiteTerritory, 65);
  assert.equal(w.blackTerritory, 4);
  assert.equal(w.result, "W+" + (65 + 7 + 7.5 - 9));
});

await test("scoring: open regions stay dame until living stones of both colours divide the board", () => {
  // Both colours touch the open region: dame.
  const early = fromRows([".........", ".........", "..X......", ".........", ".........", ".........", "......O..", ".........", "........."]);
  assert.equal(territoryMap(early.board).flat().every((v) => v === 0), true);
  // One colour only (a lone stone, an open wall): dame, as before.
  const lone = fromRows([".........", ".........", ".........", ".........", "....X....", ".........", ".........", ".........", "........."]);
  assert.equal(lone.score().blackTerritory, 0);
  // A gap in the wall joins White's corner to the open board: dame.
  const gap = CORNER_LIFE.map((r, y) => (y === 3 ? "XX.X....." : r));
  const g = fromRows(gap).score();
  assert.equal(g.blackTerritory, 0);
  // White's invasion in the open board is marked dead: the board was
  // separated, so Black owns everything but White's living corner.
  const invaded = CORNER_LIFE.map((r, y) => (y === 6 ? "......O.." : r));
  const d = fromRows(invaded).score([{ x: 6, y: 6 }]);
  assert.equal(d.blackTerritory, 65);
  assert.equal(d.blackPrisoners, 1);
  // The same stone left unmarked is alive as far as the count knows: it
  // shares the open board with Black's wall, so that stays dame.
  assert.equal(fromRows(invaded).score().blackTerritory, 0);
});

const ALL_DEAD = [".........", ".........", "..X...X..", ".........", "....O....", "...OO....", "..X...X..", ".........", "........."];
const ALL_DEAD_STONES = [{ x: 4, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 5 }];

await test("scoring: when every stone of one side is dead, the open board belongs to the other", () => {
  for (const rules of ["japanese", "chinese", "korean"]) {
    // Black has four stones, White three, all marked dead (the engine does
    // this by itself at the count).
    const s = fromRows(ALL_DEAD, { rules }).score(ALL_DEAD_STONES);
    assert.equal(s.blackTerritory, 77, rules);
    assert.equal(s.whiteTerritory, 0, rules);
    assert.equal(s.neutral, 0, rules);
    assert.equal(s.result[0], "B", `${rules}: ${s.result}`);
    // Territory: 77 + 3 prisoners against komi 6.5. Area: 77 + 4 stones against komi 7.5.
    assert.equal(s.result, "B+73.5", rules);
    // White's living corner marked dead as well: Black has the whole board.
    const corner = fromRows(CORNER_LIFE, { rules });
    const whites = [];
    corner.board.signMap.forEach((row, y) => row.forEach((v, x) => v === WHITE && whites.push({ x, y })));
    const c = corner.score(whites);
    const blacks = 81 - 65 - 4 - whites.length; // 65 + 4 points of territory with White alive
    assert.equal(c.blackTerritory, 81 - blacks, rules);
    assert.equal(c.neutral, 0, rules);
    assert.equal(c.result, rules === "chinese" ? "B+73.5" : "B+" + (81 - blacks + whites.length - 6.5), rules);
    // Colours swapped: White owns the board.
    const swap = (rows) => rows.map((r) => r.replace(/X/g, "o").replace(/O/g, "X").replace(/o/g, "O"));
    const w = fromRows(swap(ALL_DEAD), { rules }).score(ALL_DEAD_STONES);
    assert.equal(w.whiteTerritory, 77, rules);
    assert.equal(w.blackTerritory, 0, rules);
  }
});

await test("scoring: the open board is nobody's until one side has lost every stone", () => {
  // Nothing marked dead: both colours touch the open board.
  const unmarked = fromRows(ALL_DEAD).score();
  assert.equal(unmarked.blackTerritory, 0);
  assert.equal(unmarked.neutral, 74);
  // Only some of White's stones marked: a living white stone is left.
  const some = fromRows(ALL_DEAD).score(ALL_DEAD_STONES.slice(0, 1));
  assert.equal(some.blackTerritory, 0);
  // Two stones, nothing marked: neutral, as on any board passed out early.
  const two = fromRows([".........", ".........", "..X......", ".........", ".........", ".........", "......O..", ".........", "........."]).score();
  assert.equal(two.blackTerritory + two.whiteTerritory, 0);
  assert.equal(two.neutral, 79);
  // One side never played at all: a lone stone establishes nothing.
  const lone = fromRows([".........", ".........", ".........", ".........", "....X....", ".........", ".........", ".........", "........."]).score();
  assert.equal(lone.blackTerritory, 0);
  assert.equal(lone.result, "W+6.5");
  // territoryMap on its own (no count) knows nothing of dead stones.
  const bare = fromRows(ALL_DEAD.map((r) => r.replace(/O/g, ".")));
  assert.equal(territoryMap(bare.board).flat().every((v) => v === 0), true);
  assert.equal(territoryMap(bare.board, { conceded: new Set([WHITE]) }).flat().filter((v) => v === BLACK).length, 77);
});

await test("scoring: a side whose stones were all captured in play has conceded the open board", () => {
  const g = new Game({ size: 9 });
  // White's lone corner stone is captured; Black has two stones, White none.
  g.play(1, 0); // B
  g.play(0, 0); // W
  g.play(0, 1); // B captures
  assert.equal(g.board.get([0, 0]), EMPTY);
  g.pass();
  g.pass();
  const s = g.score();
  assert.equal(s.blackTerritory, 79);
  assert.equal(s.blackPrisoners, 1);
  assert.equal(s.result[0], "B");
});

await test("SGF export: RE and DT", () => {
  // RE is written from the end of the main line wherever the cursor is.
  const g = loadSGF("(;SZ[9]RE[B+3.5];B[aa](;W[bb];B[cc])(;W[dd]))").game;
  g.goto(g.root.children[0].children[1]);
  assert.match(g.toSGF(), /RE\[B\+3\.5\]/);
  const back = loadSGF(g.toSGF()).game;
  assert.equal(back.mainLine().at(-1).result, "B+3.5");
  // A game played here is dated today; one made without a date has no DT.
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  assert.ok(new Game({ size: 9 }).toSGF().includes(`DT[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}]`));
  assert.equal(/DT\[/.test(new Game({ size: 9, date: null }).toSGF()), false);
  assert.ok(new Game({ size: 9, date: null, dateText: "1846" }).toSGF().includes("DT[1846]"));
});

await test("rules: rulesets, defaults and handicap compensation", () => {
  assert.deepEqual(RULESETS.map((r) => r.id), ["japanese", "chinese", "korean"]);
  assert.deepEqual(RULESETS.map((r) => r.method), ["territory", "area", "territory"]);
  assert.deepEqual(RULESETS.map((r) => r.katago), ["japanese", "chinese", "korean"]);
  for (const r of RULESETS) {
    assert.ok(MESSAGES[r.labelKey], r.labelKey);
    assert.ok(MESSAGES[r.noteKey], r.noteKey);
  }
  assert.equal(DEFAULT_RULES, "japanese");
  assert.equal(defaultKomi("japanese"), 6.5);
  assert.equal(defaultKomi("chinese"), 7.5);
  assert.equal(defaultKomi("korean"), 6.5);
  for (const r of ["japanese", "chinese", "korean"]) assert.equal(defaultKomi(r, 4), 0.5);
  assert.equal(handicapCompensation("chinese", 4), 4);
  assert.equal(handicapCompensation("chinese", 1), 0);
  assert.equal(handicapCompensation("japanese", 4), 0);
  assert.equal(handicapCompensation("korean", 9), 0);
  assert.equal(normalizeRules("Chinese"), "chinese");
  assert.equal(normalizeRules("aga"), "japanese");
  assert.equal(normalizeRules(undefined), "japanese");
  // A Game without rules is Japanese with komi 6.5, as before v5.
  const g = new Game({ size: 9 });
  assert.equal(g.rules, "japanese");
  assert.equal(g.komi, 6.5);
  const c = new Game({ size: 19, rules: "chinese" });
  assert.equal(c.komi, 7.5);
  const ch = new Game({ size: 19, rules: "chinese", handicap: 4 });
  assert.equal(ch.komi, 0.5);
  assert.equal(ch.handicapCompensation, 4);
  assert.equal(new Game({ rules: "nonsense" }).rules, "japanese");
});

await test("rules: area and territory scores of the same position", () => {
  const dead = [{ x: 1, y: 1 }];
  const jp = fromRows(WALLS).score(dead);
  assert.equal(jp.method, "territory");
  assert.equal(jp.blackTerritory, 36);
  assert.equal(jp.whiteTerritory, 27);
  assert.equal(jp.blackPrisoners, 1);
  assert.equal(jp.whitePrisoners, 0);
  assert.equal(jp.black, 37);
  assert.equal(jp.white, 33.5);
  assert.equal(jp.result, "B+3.5");
  assert.equal(jp.neutral, 0);

  const cn = fromRows(WALLS, { rules: "chinese" }).score(dead);
  assert.equal(cn.method, "area");
  assert.equal(cn.komi, 7.5);
  assert.equal(cn.blackStones, 9);
  assert.equal(cn.whiteStones, 9);
  assert.equal(cn.blackTerritory, 36);
  assert.equal(cn.whiteTerritory, 27);
  assert.equal(cn.blackPrisoners, null);
  assert.equal(cn.handicapCompensation, 0);
  assert.equal(cn.black, 45);
  assert.equal(cn.white, 43.5);
  assert.equal(cn.result, "B+1.5");
  assert.equal(cn.dead.length, 1);

  const kr = fromRows(WALLS, { rules: "korean" }).score(dead);
  assert.equal(kr.method, "territory");
  assert.equal(kr.result, jp.result);

  // Captures made during play count under territory scoring only.
  const cap = new Game({ size: 9, rules: "chinese" });
  const capJ = new Game({ size: 9 });
  for (const g of [cap, capJ]) {
    g.setup([{ x: 0, y: 1, color: BLACK }, { x: 0, y: 0, color: WHITE }], BLACK);
    g.play(1, 0); // captures A9
    assert.equal(g.score().captures.black, 1);
  }
  assert.equal(capJ.score().blackPrisoners, 1);
  assert.equal(cap.score().blackPrisoners, null);
  assert.equal(cap.score().black, cap.score().blackStones + cap.score().blackTerritory);
});

await test("rules: Chinese handicap games give White N points for N stones", () => {
  const cn = fromRows(WALLS, { rules: "chinese", handicap: 4 });
  assert.equal(cn.komi, 0.5);
  const s = cn.score([{ x: 1, y: 1 }]);
  assert.equal(s.handicap, 4);
  assert.equal(s.handicapCompensation, 4);
  assert.equal(s.black, 45);
  assert.equal(s.white, 9 + 27 + 0.5 + 4);
  assert.equal(s.result, "B+4.5");
  // The same game under Japanese rules: komi 0.5, no compensation.
  const jp = fromRows(WALLS, { handicap: 4 }).score([{ x: 1, y: 1 }]);
  assert.equal(jp.handicapCompensation, 0);
  assert.equal(jp.white, 27.5);
  assert.equal(jp.result, "B+9.5");
});

await test("rules: seki has no territory under Japanese and Korean rules, and counts under Chinese", () => {
  const board = fromRows(SEKI_BOARD_CLOSED).board;
  const seki = findSeki(board);
  assert.deepEqual(seki.points, [{ x: 2, y: 0 }]);
  // Black's corner group (3 stones) and White's inner group (9 stones).
  assert.equal(seki.stones.filter((s) => s.color === BLACK).length, 3);
  assert.equal(seki.stones.filter((s) => s.color === WHITE).length, 9);

  for (const rules of ["japanese", "korean"]) {
    const s = fromRows(SEKI_BOARD_CLOSED, { rules }).score();
    assert.equal(s.method, "territory");
    // A9 (Black's eye) and A6 (White's eye) are not territory.
    assert.equal(s.territory[0][0], EMPTY);
    assert.equal(s.territory[3][0], EMPTY);
    assert.equal(s.blackTerritory, 20);
    assert.equal(s.whiteTerritory, 18);
    assert.equal(s.neutral, 3);
    assert.equal(s.result, "W+4.5");
    assert.equal(s.seki.length, 12);
  }
  const c = fromRows(SEKI_BOARD_CLOSED, { rules: "chinese" }).score();
  assert.equal(c.method, "area");
  // The seki eyes count for their owners; the shared liberty for nobody.
  assert.equal(c.territory[0][0], BLACK);
  assert.equal(c.territory[3][0], WHITE);
  assert.equal(c.blackTerritory, 21);
  assert.equal(c.whiteTerritory, 19);
  assert.equal(c.blackStones, 22);
  assert.equal(c.whiteStones, 18);
  assert.equal(c.neutral, 1);
  assert.equal(c.black, 43);
  assert.equal(c.white, 44.5);
  assert.equal(c.result, "W+1.5");
});

await test("rules: unfilled dame between living groups is not seki", () => {
  const open = fromRows(WALLS.map((row) => row.slice(0, 3) + "X." + row.slice(5)));
  const seki = findSeki(open.board);
  assert.deepEqual(seki.points, []);
  const s = open.score([{ x: 1, y: 1 }]);
  assert.equal(s.neutral, 9);
  assert.equal(s.blackTerritory, 27);
  assert.equal(s.whiteTerritory, 27);
  // A group in atari next to the dame is a capture, not seki.
  const atari = setup([
    { x: 0, y: 0, color: WHITE },
    { x: 1, y: 0, color: BLACK },
    { x: 1, y: 1, color: BLACK },
  ]);
  assert.deepEqual(findSeki(atari.board).points, []);
});

await test("marks toggle, replace and take the next free letter", () => {
  const g = newGame(9);
  g.play(4, 4);
  const n = g.current;
  assert.deepEqual(g.toggleMark(n, 1, 1, "triangle"), { x: 1, y: 1, type: "triangle" });
  assert.deepEqual(g.toggleMark(n, 1, 1, "square"), { x: 1, y: 1, type: "square" }, "another kind replaces");
  assert.equal(n.marks.length, 1);
  assert.equal(g.toggleMark(n, 1, 1, "square"), null, "the same kind removes");
  assert.equal(n.marks.length, 0);
  assert.equal(g.toggleMark(n, 0, 0, "label").text, "A");
  assert.equal(g.toggleMark(n, 0, 1, "label").text, "B");
  g.toggleMark(n, 0, 0, "label");
  assert.equal(g.toggleMark(n, 0, 2, "label").text, "A", "a freed letter is reused");
  assert.equal(g.toggleMark(n, 9, 0, "circle"), null, "off the board");
  assert.equal(g.toggleMark(n, 2, 2, "star"), null, "unknown kind");
  assert.equal(n.marks.length, 2);
  g.setComment(n, "line\r\nbreak");
  assert.equal(n.comment, "line\nbreak");
});

await test("tree layout puts the main line on row 0 and nests variations without overlaps", () => {
  const { g, ids } = branchedGame();
  g.goto(ids["3a"].id);
  const L = treeLayout(g);
  const at = new Map(L.nodes.map((n) => [n.node, n]));
  assert.equal(L.nodes.length, 11);
  for (const k of [1, 2, 3, 4, 5]) {
    assert.equal(at.get(ids[k]).y, 0);
    assert.equal(at.get(ids[k]).x, k);
    assert.equal(at.get(ids[k]).isMain, true);
  }
  assert.deepEqual([at.get(g.root).x, at.get(g.root).y], [0, 0]);
  // The later branch (at move 3) is nearest the main line.
  assert.deepEqual([at.get(ids["4b"]).x, at.get(ids["4b"]).y], [4, 1]);
  assert.deepEqual([at.get(ids["2a"]).x, at.get(ids["2a"]).y], [2, 2]);
  assert.deepEqual([at.get(ids["3a"]).x, at.get(ids["3a"]).y], [3, 2]);
  assert.deepEqual([at.get(ids["3x"]).x, at.get(ids["3x"]).y], [3, 3]);
  assert.deepEqual([at.get(ids["2c"]).x, at.get(ids["2c"]).y], [2, 4]);
  assert.equal(at.get(ids["2a"]).isMain, false);
  assert.equal(at.get(ids["2c"]).hasComment, true);
  assert.equal(at.get(ids["3a"]).isCurrent, true);
  assert.equal(at.get(ids["2a"]).onPath, true);
  assert.equal(at.get(ids[2]).onPath, false);
  assert.deepEqual(L.current, { x: 3, y: 2 });
  assert.equal(L.width, 6);
  assert.equal(L.height, 5);
  // No two nodes share a cell, and no edge's vertical run crosses a node.
  const cells = new Set(L.nodes.map((n) => `${n.x},${n.y}`));
  assert.equal(cells.size, L.nodes.length);
  assert.equal(L.edges.length, L.nodes.length - 1);
  for (const e of L.edges) {
    for (let i = 1; i < e.points.length - 1; i++) assert.ok(!cells.has(e.points[i].join(",")), "bend on a node");
    const [[x0, y0], [x1, y1]] = [e.points[0], e.points[e.points.length - 1]];
    for (let y = y0 + 1; y < y1 - 0; y++) if (e.points.length > 2) assert.ok(!cells.has(`${x0},${y}`), `edge through ${x0},${y}`);
    assert.equal(x1 - x0, 1);
  }
  const toC = L.edges.find((e) => e.to.x === 2 && e.to.y === 4);
  assert.deepEqual(toC.points, [[1, 0], [1, 3], [2, 4]]);
});

await test("deleting and promoting variations edit the tree and the SGF", () => {
  const { g, ids } = branchedGame();
  assert.equal(g.isMainLine(ids[5]), true);
  assert.equal(g.isMainLine(ids["3a"]), false);
  assert.equal(g.promoteVariation(ids["3x"]), true);
  assert.deepEqual(g.mainLine().map((n) => n.id), [g.root.id, ids[1].id, ids["2a"].id, ids["3x"].id]);
  assert.deepEqual(ids[1].children.map((n) => n.id), [ids["2a"].id, ids[2].id, ids["2c"].id], "others keep their order");
  assert.equal(g.promoteVariation(ids["3x"]), false, "already the main line");
  // Round trip keeps the new order.
  const back = loadSGF(g.toSGF()).game;
  assert.deepEqual(back.mainLine().map((n) => [n.move?.x, n.move?.y]).slice(1), [[0, 0], [1, 1], [2, 2]]);
  assert.equal(back.mainLine()[1].children.length, 3);
  // Delete a whole branch with the cursor inside: the cursor moves up.
  g.goto(ids[4].id);
  assert.equal(g.deleteNode(ids[3]), ids[2]);
  assert.equal(g.current, ids[2]);
  assert.equal(ids[2].children.length, 0);
  assert.equal(g.deleteNode(g.root), null, "the root stays");
  // Deleting the first child makes the next variation the main line there.
  g.deleteNode(ids["2a"]);
  assert.deepEqual(g.mainLine().map((n) => n.id), [g.root.id, ids[1].id, ids[2].id]);
  assert.equal(treeLayout(g).nodes.length, 4);
});
