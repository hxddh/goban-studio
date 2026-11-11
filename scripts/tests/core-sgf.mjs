/**
 * Core: SGF (FF[4]) — round trips of moves, setup, comments, markup, rules and unknown properties.
 */
import { test, BLACK, CLASSICS, Game, MESSAGES, WHITE, assert, loadSGF, newGame, rulesFromSgf, setup } from "./helpers.mjs";

await test("SGF export/import keeps moves, comments, setup and variations", () => {
  const g = setup(
    [
      { x: 0, y: 0, color: WHITE },
      { x: 1, y: 0, color: BLACK },
    ],
    BLACK,
  );
  g.play(0, 1);
  g.current.comment = "first branch";
  const branchPoint = g.current;
  g.play(1, 1);
  g.goto(branchPoint.id);
  g.play(2, 1);
  g.goto(g.root.id);
  g.current.result = "B+2.5";

  const sgf = g.toSGF();
  assert.match(sgf, /^\(;GM\[1\]/);
  assert.match(sgf, /RU\[Japanese\]/);
  assert.match(sgf, /AB\[ba\]/);
  assert.match(sgf, /AW\[aa\]/);
  assert.match(sgf, /RE\[B\+2\.5\]/);
  const { game, warnings } = loadSGF(sgf);
  assert.deepEqual(warnings, []);
  assert.equal(game.size, 9);
  assert.equal(game.komi, 6.5);
  assert.equal(game.mainLine().length, 3);
  assert.equal(game.root.children.length, 1);
  assert.equal(game.root.children[0].children.length, 2);
  assert.equal(game.root.board.get([0, 0]), WHITE);
  assert.equal(game.root.board.get([1, 0]), BLACK);
  assert.equal(game.current.result, "B+2.5");
  // A library game opens at the end of its main line, ready for display and
  // review, rather than at an empty root.
  assert.equal(game.current.move.x, 1);
  assert.equal(game.current.move.y, 1);
});

await test("SGF import accepts pass, setup, comments and four-digit dates", () => {
  const text = `(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]DT[2025-10-02]AB[aa]AW[bb]PL[W];W[cc]C[hello];B[];W[dd])`;
  const { game, warnings } = loadSGF(text);
  assert.deepEqual(warnings, []);
  assert.equal(game.size, 9);
  assert.equal(game.rules, "japanese");
  assert.equal(game.komi, 6.5);
  assert.equal(game.date.getFullYear(), 2025);
  assert.equal(game.date.getMonth(), 9);
  assert.equal(game.date.getDate(), 2);
  assert.equal(game.root.board.get([0, 0]), BLACK);
  assert.equal(game.root.board.get([1, 1]), WHITE);
  const line = game.mainLine();
  assert.equal(line.length, 4);
  assert.equal(line[1].move.color, WHITE);
  assert.equal(line[1].comment, "hello");
  assert.equal(line[2].move.pass, true);
  assert.equal(line[3].move.color, WHITE);
});

await test("SGF columns are a..s with the i (FF[4])", () => {
  // Standard: i is the ninth column, j the tenth, s the nineteenth.
  const { game } = loadSGF("(;GM[1]FF[4]SZ[19];B[id];W[jd];B[sd])");
  const line = game.mainLine();
  assert.deepEqual([line[1].move.x, line[2].move.x, line[3].move.x], [8, 9, 18]);
  assert.equal(line[1].move.y, 3);
  const sgf = game.toSGF();
  assert.match(sgf, /;B\[id\];W\[jd\];B\[sd\]/);
  // The application tag never changes how columns are read.
  const tagged = loadSGF("(;GM[1]FF[4]AP[Goban Studio:6.0.0]SZ[19];B[id];W[sd])").game.mainLine();
  assert.deepEqual([tagged[1].move.x, tagged[2].move.x], [8, 18]);
  // Every bundled classic now loads without an illegal move.
  for (const c of CLASSICS) assert.deepEqual(loadSGF(c.sgf).warnings, [], c.id);
});

await test("rules: SGF round trip keeps RU, komi and handicap for each ruleset", () => {
  for (const [rules, ru, komi] of [["japanese", "Japanese", 6.5], ["chinese", "Chinese", 7.5], ["korean", "Korean", 6.5]]) {
    const g = new Game({ size: 9, rules });
    g.play(4, 4);
    const sgf = g.toSGF();
    assert.match(sgf, new RegExp(`RU\\[${ru}\\]`));
    assert.match(sgf, new RegExp(`KM\\[${komi}\\]`));
    const back = loadSGF(sgf).game;
    assert.equal(back.rules, rules);
    assert.equal(back.komi, komi);
    assert.equal(back.toSGF(), sgf);
  }
  const h = new Game({ size: 19, rules: "chinese", handicap: 4 });
  h.play(16, 16);
  const back = loadSGF(h.toSGF()).game;
  assert.equal(back.handicap, 4);
  assert.equal(back.komi, 0.5);
  assert.equal(back.handicapCompensation, 4);
  // Setup with White stones is a position, not a handicap.
  const pos = loadSGF("(;GM[1]FF[4]SZ[9]RU[Chinese]AB[aa][bb]AW[cc])").game;
  assert.equal(pos.handicap, 0);
  assert.equal(pos.handicapCompensation, 0);
  // No RU is Japanese; a missing KM takes the ruleset's komi.
  const old = loadSGF("(;GM[1]FF[4]SZ[9];B[ee])").game;
  assert.equal(old.rules, "japanese");
  assert.equal(old.komi, 6.5);
  assert.equal(loadSGF("(;GM[1]FF[4]SZ[9]RU[Chinese];B[ee])").game.komi, 7.5);
});

await test("rules: SGF import accepts Japanese, Chinese and Korean spellings and rejects the rest", () => {
  const ru = (v) => loadSGF(`(;GM[1]FF[4]SZ[9]KM[7]RU[${v}];B[ee])`).game.rules;
  for (const v of ["Japanese", "japanese", "JP", "jp", "uchikomi", "日本", "日本ルール", "日本规则"]) assert.equal(ru(v), "japanese", v);
  for (const v of ["Chinese", "chinese", "CN", "cn", "China", "中国", "中国规则"]) assert.equal(ru(v), "chinese", v);
  for (const v of ["Korean", "korean", "KR", "kr", "한국", "韩国规则"]) assert.equal(ru(v), "korean", v);
  assert.equal(rulesFromSgf(""), "japanese");
  for (const v of ["AGA", "BGA", "NZ", "Ing", "GOE", "Tromp-Taylor", "French", "Chinese/Japanese", "AGA (Japanese)"]) {
    assert.equal(rulesFromSgf(v), null, v);
    assert.throws(
      () => loadSGF(`(;GM[1]FF[4]SZ[9]KM[7.5]RU[${v}];B[ee])`),
      (error) => error.code === "unsupported-rules" && error.rules === v,
      v,
    );
  }
  assert.ok(MESSAGES["rules.unsupported"].en.includes("{0}"));
});

await test("an empty SGF is rejected, not silently accepted", () => {
  assert.throws(() => loadSGF("not an sgf"), /no root node/);
});

await test("SGF comments and markup survive a round trip on every node", () => {
  const g = newGame(9);
  g.setRootComment("Game notes\nline two ] with a bracket \\ and a backslash");
  g.toggleMark(g.root, 4, 4, "triangle");
  g.play(2, 2);
  const a = g.current;
  g.setComment(a, "A [solid] start");
  g.toggleMark(a, 3, 3, "square");
  g.toggleMark(a, 5, 5, "circle");
  g.toggleMark(a, 6, 6, "cross");
  g.toggleMark(a, 7, 7, "label");
  g.toggleMark(a, 8, 8, "label");
  g.toggleMark(a, 0, 8, "label", "x:y]");
  g.play(6, 6);
  const sgf = g.toSGF();
  assert.match(sgf, /TR\[ee\]/);
  assert.ok(sgf.includes(";B[cc]C[A [solid\\] start]SQ[dd]CR[ff]MA[gg]LB[hh:A][ii:B][ai:x:y\\]]"), sgf);
  const back = loadSGF(sgf).game;
  assert.equal(back.root.comment, g.root.comment);
  assert.deepEqual(back.root.marks, [{ x: 4, y: 4, type: "triangle" }]);
  const b = back.mainLine()[1];
  assert.equal(b.comment, "A [solid] start");
  const byType = Object.fromEntries(b.marks.filter((m) => m.type !== "label").map((m) => [m.type, [m.x, m.y]]));
  assert.deepEqual(byType, { square: [3, 3], circle: [5, 5], cross: [6, 6] });
  assert.deepEqual(b.marks.filter((m) => m.type === "label").map((m) => [m.x, m.y, m.text]), [[7, 7, "A"], [8, 8, "B"], [0, 8, "x:y]"]]);
  assert.equal(back.toSGF(), sgf, "a second round trip is byte-identical");
});

await test("unknown SGF properties are kept on the root and on moves", () => {
  const text =
    "(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]GN[Club final]PC[Seoul]BR[3k]WR[2k]EV[Spring cup]XY[a\\]b][c]C[root]" +
    ";B[ee]BL[295.5]OB[0]N[Tengen];W[cc]MN[2]TB[aa:bb]" +
    "(;B[gg]C[main])(;B[gc]LB[gg:1]C[side]XX[keep me]))";
  const { game, warnings } = loadSGF(text);
  assert.deepEqual(warnings, []);
  assert.deepEqual(game.root.extra, { GN: ["Club final"], PC: ["Seoul"], BR: ["3k"], WR: ["2k"], XY: ["a]b", "c"] });
  assert.equal(game.event, "Spring cup");
  const [, b1, w2] = game.mainLine();
  assert.deepEqual(b1.extra, { BL: ["295.5"], OB: ["0"], N: ["Tengen"] });
  assert.deepEqual(w2.extra, { MN: ["2"], TB: ["aa:bb"] });
  const side = w2.children[1];
  assert.deepEqual(side.extra, { XX: ["keep me"] });
  assert.deepEqual(side.marks, [{ x: 6, y: 6, type: "label", text: "1" }]);
  const out = game.toSGF();
  for (const s of ["GN[Club final]", "PC[Seoul]", "BR[3k]", "WR[2k]", "EV[Spring cup]", "XY[a\\]b][c]", "BL[295.5]OB[0]N[Tengen]", "MN[2]TB[aa:bb]", "XX[keep me]", "LB[gg:1]"]) assert.ok(out.includes(s), s);
  const again = loadSGF(out).game;
  assert.deepEqual(again.root.extra, game.root.extra);
  assert.deepEqual(again.mainLine()[2].children[1].extra, { XX: ["keep me"] });
  assert.equal(again.toSGF(), out);
});

await test("a set-up position records who plays first, and move-less nodes fold into the move before", () => {
  const { game } = loadSGF("(;GM[1]FF[4]SZ[9]AB[aa][bb]AW[cc]PL[W];W[dd];C[a note]TR[ee];B[ff])");
  const line = game.mainLine();
  assert.equal(line.length, 3);
  assert.equal(line[1].comment, "a note");
  assert.deepEqual(line[1].marks, [{ x: 4, y: 4, type: "triangle" }]);
  const out = game.toSGF();
  assert.match(out, /PL\[W\]/);
  assert.equal(loadSGF(out).game.root.turn, WHITE);
});
