/**
 * Core: SGF, real-world records — setup after the root and in the middle of a game,
 * board sizes, invalid points, HA without AB, CA charsets, and records too long or deep for recursion.
 */
import GoBoard from "@sabaki/go-board";
import { test, BLACK, Game, MESSAGES, WHITE, assert, loadSGF, positionPayload, setLang, treeLayout } from "./helpers.mjs";
import { decodeSgfBytes, sgfCharset } from "../../src/web/js/sgf.js";

setLang("en");

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));

await test("SGF: setup in a move-less node right after the root is the starting position, and survives export", () => {
  const { game, warnings } = loadSGF("(;GM[1]SZ[9];AB[cc][dd]AW[ee];B[gg])");
  assert.deepEqual(warnings, []);
  assert.equal(game.root.board.get([2, 2]), BLACK);
  assert.equal(game.root.board.get([3, 3]), BLACK);
  assert.equal(game.root.board.get([4, 4]), WHITE);
  const line = game.mainLine();
  assert.equal(line.length, 2);
  assert.equal(line[1].move.color, BLACK);
  // Black's first move says who starts.
  assert.equal(game.root.turn, BLACK);
  const out = game.toSGF();
  assert.match(out, /AB\[cc\]\[dd\]AW\[ee\]PL\[B\]/);
  const again = loadSGF(out).game;
  assert.equal(again.root.board.get([4, 4]), WHITE);
  assert.equal(again.toSGF(), out);
  // A chain of move-less nodes, with AE and a comment, still folds into the root.
  const chain = loadSGF("(;GM[1]SZ[9]AB[aa];AB[bb]C[setup];AE[aa]AW[cc];W[dd])").game;
  assert.equal(chain.root.board.get([0, 0]), 0);
  assert.equal(chain.root.board.get([1, 1]), BLACK);
  assert.equal(chain.root.board.get([2, 2]), WHITE);
  assert.equal(chain.root.comment, "setup");
  assert.equal(chain.root.turn, WHITE);
});

await test("SGF: setup later in the game is on the board for the moves after it, and is written back", () => {
  // White's corner stone gets a black neighbour from the setup, which also
  // clears Black's centre stone; Black then captures in one move.
  const text = "(;GM[1]FF[4]SZ[9];B[ee];W[aa];AB[ba]AE[ee]C[edited];B[ab]C[capture];W[cc])";
  const { game, warnings } = loadSGF(text);
  assert.deepEqual(warnings, []);
  const line = game.mainLine();
  assert.equal(line.length, 5);
  const cap = line[3];
  assert.deepEqual(cap.setup, { black: [{ x: 1, y: 0 }], white: [], empty: [{ x: 4, y: 4 }] });
  assert.equal(cap.board.get([0, 0]), 0, "White's corner stone is captured");
  assert.equal(cap.board.get([4, 4]), 0, "AE cleared the centre");
  assert.equal(cap.board.get([1, 0]), BLACK);
  assert.equal(game.capturesOf(cap).black, 1);
  // The move-less node's comment stays on the move before it, as before.
  assert.equal(line[2].comment, "edited");
  assert.equal(cap.comment, "capture");
  const out = game.toSGF();
  assert.ok(out.includes(";W[aa]C[edited];AE[ee]AB[ba];B[ab]C[capture];W[cc]"), out);
  assert.equal(loadSGF(out).game.toSGF(), out);
  // A move onto a set-up stone is illegal, and says so.
  const occupied = loadSGF("(;GM[1]SZ[9];B[ee];AW[cc];B[cc])");
  assert.equal(occupied.warnings.length, 1);
  assert.match(occupied.warnings[0], /Move 2 \(cc\) is illegal/);
});

await test("SGF: KataGo is sent the position a mid-game setup produced, and the moves after it", () => {
  const { game } = loadSGF("(;GM[1]FF[4]SZ[9];B[ee];W[aa];AB[ba]AE[ee];B[ab];W[cc])");
  const end = game.mainLine().at(-1);
  const p = positionPayload(game, end);
  // The base is the board after the setup (before Black's capture).
  assert.deepEqual(p.setup.split(" ").length, 4);
  assert.equal(p.setup, "W A9 B B9");
  assert.equal(p.moves, "B A8 W C7");
  // Before the setup: the root and the moves from it, as before.
  const early = positionPayload(game, game.mainLine()[2]);
  assert.equal(early.setup, "");
  assert.equal(early.moves, "B E5 W A9");
  // Superko history does not reach across an edited board.
  assert.equal(game.mainLine()[3].setup !== null, true);
});

await test("SGF: setup at the start of a variation stays in that variation; trailing setup is a warning", () => {
  const { game, warnings } = loadSGF("(;GM[1]SZ[9];B[ee](;AW[cc];W[dd])(;W[ff])(;AB[aa]))");
  const b = game.mainLine()[1];
  assert.equal(b.children.length, 2);
  assert.equal(b.children[0].board.get([2, 2]), WHITE);
  assert.equal(b.children[1].board.get([2, 2]), 0);
  assert.equal(b.board.get([2, 2]), 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /end of a line/);
});

await test("SGF: a board size the app cannot play is a clear error, not a 19×19 board", () => {
  for (const sz of ["15", "7", "25", "19:13", "x"]) {
    assert.throws(
      () => loadSGF(`(;GM[1]FF[4]SZ[${sz}];B[aa])`),
      (e) => e.code === "unsupported-size" && e.size === sz,
      sz,
    );
  }
  assert.equal(loadSGF("(;GM[1]SZ[ 13 ];B[aa])").game.size, 13);
  assert.equal(loadSGF("(;GM[1]SZ[9:9];B[aa])").game.size, 9);
  assert.equal(loadSGF("(;GM[1];B[aa])").game.size, 19);
  for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(MESSAGES["sgf.unsupportedSize"][lang].includes("{0}"), lang);
});

await test("SGF: only an empty value or tt is a pass; other invalid points are warnings", () => {
  const ok = loadSGF("(;GM[1]SZ[19];B[];W[tt];B[pd])");
  assert.deepEqual(ok.warnings, []);
  const okLine = ok.game.mainLine();
  assert.equal(okLine[1].move.pass, true);
  assert.equal(okLine[2].move.pass, true);
  assert.equal(okLine[3].move.x, 15);
  // tt is a pass on the small boards too (FF[3] convention, sizes up to 19).
  assert.equal(loadSGF("(;GM[1]SZ[9];B[tt])").game.mainLine()[1].move.pass, true);
  const bad = loadSGF("(;GM[1]SZ[9];B[zz];W[A1];B[ee]TR[qq];W[abc])");
  const line = bad.game.mainLine();
  assert.equal(line.length, 5);
  assert.equal(line[1].move.pass, true);
  assert.equal(line[2].move.pass, true);
  assert.equal(line[3].move.x, 4);
  assert.equal(line[4].move.pass, true);
  assert.deepEqual(bad.warnings, [
    'Move 1 has an invalid point "zz"; it was read as a pass.',
    'Move 2 has an invalid point "A1"; it was read as a pass.',
    'The record has an invalid point "qq"; it was ignored.',
    'Move 4 has an invalid point "abc"; it was read as a pass.',
  ]);
  // A bad setup point is skipped with a warning; the good ones stay.
  const setup = loadSGF("(;GM[1]SZ[9]AB[aa][zz];W[ee])");
  assert.equal(setup.game.root.board.get([0, 0]), BLACK);
  assert.equal(setup.warnings.length, 1);
  for (const key of ["sgf.warn.badMove", "sgf.warn.illegalMove", "sgf.warn.badPoint", "sgf.warn.trailingSetup"]) {
    for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(MESSAGES[key][lang], `${key} ${lang}`);
  }
});

await test("SGF: HA without AB places no stones; HA[0]; HA with AB places them once", () => {
  const text = "(;GM[1]FF[4]SZ[19]RU[Chinese]HA[2]KM[0.5];B[pd];B[dp];W[qp])";
  const { game, warnings } = loadSGF(text);
  assert.deepEqual(warnings, []);
  assert.equal(game.root.board.signMap.flat().filter((v) => v).length, 0);
  assert.equal(game.root.turn, BLACK);
  assert.equal(game.handicap, 2);
  assert.equal(game.handicapCompensation, 2);
  const end = game.mainLine().at(-1);
  assert.equal(end.board.signMap.flat().filter((v) => v === BLACK).length, 2);
  const out = game.toSGF();
  assert.match(out, /HA\[2\]/);
  assert.doesNotMatch(out, /AB\[/);
  const back = loadSGF(out).game;
  assert.equal(back.handicap, 2);
  assert.equal(back.root.board.signMap.flat().filter((v) => v).length, 0);
  assert.equal(back.toSGF(), out);
  // HA[0] is an even game with the even komi.
  const even = loadSGF("(;GM[1]SZ[19]HA[0];B[pd])").game;
  assert.equal(even.handicap, 0);
  assert.equal(even.komi, 6.5);
  // HA with AB: the stones once, White to move, the handicap komi.
  const placed = loadSGF("(;GM[1]SZ[19]RU[Chinese]HA[3]AB[pd][dp][pp];W[dd])").game;
  assert.equal(placed.root.board.signMap.flat().filter((v) => v === BLACK).length, 3);
  assert.equal(placed.handicap, 3);
  assert.equal(placed.komi, 0.5);
  assert.equal(placed.handicapCompensation, 3);
  assert.equal(placed.root.turn, WHITE);
});

await test("SGF: bytes are decoded by the record's CA charset", () => {
  const cases = [
    ["GB2312", [186, 218, 183, 189], "黑方"],
    ["GBK", [186, 218, 183, 189], "黑方"],
    ["gb18030", [186, 218, 183, 189], "黑方"],
    ["Big5", [182, 194, 164, 232], "黑方"],
    ["Shift_JIS", [141, 149, 148, 212], "黒番"],
    ["SJIS", [141, 149, 148, 212], "黒番"],
    ["EUC-JP", [185, 245, 200, 214], "黒番"],
    ["EUC-KR", [200, 230, 185, 248], "흑번"],
    ["ISO-8859-1", [77, 252, 108, 108, 101, 114], "Müller"],
  ];
  for (const [ca, name, want] of cases) {
    const text = decodeSgfBytes(bytes(`(;GM[1]FF[4]CA[${ca}]SZ[9]PB[`, name, "];B[ee])"));
    assert.equal(loadSGF(text).game.playerBlack, want, ca);
  }
  // UTF-8: with or without CA, with a BOM, and mislabelled by an old CA.
  const utf8 = [...Buffer.from("黑方", "utf8")];
  for (const head of ["(;GM[1]CA[UTF-8]PB[", "(;GM[1]PB[", "(;GM[1]CA[GB2312]PB["]) {
    assert.equal(loadSGF(decodeSgfBytes(bytes(head, utf8, "])"))).game.playerBlack, "黑方", head);
  }
  assert.equal(loadSGF(decodeSgfBytes(bytes([0xef, 0xbb, 0xbf], "(;GM[1]PB[", utf8, "])"))).game.playerBlack, "黑方");
  // No CA and not UTF-8: ISO-8859-1, the FF[4] default.
  assert.equal(loadSGF(decodeSgfBytes(bytes("(;GM[1]PB[", [77, 252, 108, 108, 101, 114], "])"))).game.playerBlack, "Müller");
  // An ArrayBuffer works as well (File.arrayBuffer()).
  assert.equal(decodeSgfBytes(bytes("(;GM[1])").buffer), "(;GM[1])");
  assert.equal(sgfCharset("cp936"), "gb18030");
  assert.equal(sgfCharset("ks_c_5601-1987"), "euc-kr");
  assert.equal(sgfCharset("nonsense"), null);
});

/** A random legal game of `n` moves (passes when nothing is left), as SGF. */
function longRecord(n) {
  let board = GoBoard.fromDimensions(19);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let color = BLACK;
  let s = "(;GM[1]FF[4]SZ[19]KM[6.5]";
  for (let k = 0; k < n; k++) {
    let move = "";
    for (let tries = 0; tries < 30; tries++) {
      const x = Math.floor(rnd() * 19);
      const y = Math.floor(rnd() * 19);
      if (board.get([x, y]) !== 0) continue;
      const a = board.analyzeMove(color, [x, y]);
      if (a.suicide || a.ko) continue;
      board = board.makeMove(color, [x, y]);
      move = String.fromCharCode(97 + x, 97 + y);
      break;
    }
    s += `;${color === BLACK ? "B" : "W"}[${move}]`;
    color = -color;
  }
  return s + ")";
}

await test("SGF: a 10,000-move record loads and exports without recursion, in linear time", () => {
  // Near-linear, not a wall-clock budget (shared runners vary several-fold):
  // four times the moves may take at most about eleven times as long
  // (locally ≈5×: the superko check still walks the line's hashes); the
  // O(n²) reader this replaced took sixteen times as long or more.
  // The best of three runs: one stall of a busy machine during a single run
  // is not a slower reader.
  const time = (text) => {
    let best = null;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const r = loadSGF(text);
      const ms = performance.now() - t0;
      if (!best || ms < best.ms) best = { r, ms };
    }
    return best;
  };
  const small = longRecord(2500);
  time(small); // warm up the JIT before measuring
  const a = time(small);
  const text = longRecord(10000);
  const { r, ms } = time(text);
  const { game, warnings } = r;
  assert.deepEqual(warnings, []);
  assert.equal(game.mainLine().length, 10001);
  const out = game.toSGF();
  assert.equal(out.split(";").length - 1, 10001);
  assert.equal(loadSGF(out).game.mainLine().length, 10001);
  assert.ok(ms < Math.max(11 * a.ms, 200), `10,000 moves ${Math.round(ms)} ms vs 2,500 moves ${Math.round(a.ms)} ms`);
});

await test("SGF: 5,000 nested variations load and export without recursion", () => {
  const color = (i) => (i % 2 ? "W" : "B");
  const N = 5000;
  // Deep main line, a one-move variation at every level.
  let deep = "(;GM[1]FF[4]SZ[9]";
  for (let i = 0; i < N; i++) deep += `(;${color(i)}[]`;
  for (let i = N - 1; i >= 1; i--) deep += `)(;${color(i)}[ab]C[v${i}])`;
  deep += "))";
  const a = loadSGF(deep).game;
  assert.equal(a.mainLine().length, N + 1);
  let count = 0;
  const stack = [a.root];
  while (stack.length) {
    const n = stack.pop();
    count++;
    stack.push(...n.children);
  }
  assert.equal(count, 1 + N + (N - 1));
  const out = a.toSGF();
  assert.equal(loadSGF(out).game.toSGF(), out);
  // Each deeper level in the second variation: nesting 5,000 parentheses deep.
  let nested = "(;GM[1]FF[4]SZ[9]";
  for (let i = 0; i < N; i++) nested += `(;${color(i)}[ab])(;${color(i)}[]`;
  nested += ")".repeat(N) + ")";
  const b = loadSGF(nested).game;
  let depth = 0;
  for (let n = b.root; n.children.length; n = n.children[n.children.length - 1]) depth++;
  assert.equal(depth, N);
  const outB = b.toSGF();
  assert.equal(loadSGF(outB).game.toSGF(), outB);
  // The variation map lays it out without recursion too.
  assert.equal(treeLayout(b).nodes.length, 1 + 2 * N);
});

await test("SGF: comments and marks of move-less variation nodes survive export", () => {
  const text = "(;GM[1]FF[4]SZ[9](;C[root note]TR[aa];B[ee])(;B[cc](;W[dd])(;C[side note]SQ[bb]LB[cc:X])))";
  const { game } = loadSGF(text);
  assert.equal(game.root.comment, "root note");
  const cc = game.root.children[1];
  assert.equal(cc.comment, "side note");
  assert.deepEqual(cc.marks.map((m) => m.type).sort(), ["label", "square"]);
  const out = game.toSGF();
  for (const s of ["C[root note]", "TR[aa]", "C[side note]", "SQ[bb]", "LB[cc:X]"]) assert.ok(out.includes(s), s);
  const back = loadSGF(out).game;
  assert.equal(back.root.children[1].comment, "side note");
  assert.equal(back.toSGF(), out);
});

await test("rules: a handicap of one is no stone, Black first, handicap komi; sizes without points play even", () => {
  for (const rules of ["japanese", "chinese", "korean"]) {
    const g = new Game({ size: 19, rules, handicap: 1 });
    assert.equal(g.root.board.signMap.flat().filter((v) => v).length, 0, rules);
    assert.equal(g.turn, BLACK);
    assert.equal(g.komi, 0.5);
    assert.equal(g.handicapCompensation, 0);
  }
  const odd = new Game({ size: 7, handicap: 4 });
  assert.equal(odd.handicap, 0);
  assert.equal(odd.turn, BLACK);
  assert.equal(odd.komi, 6.5);
  assert.equal(odd.root.board.signMap.flat().filter((v) => v).length, 0);
});

await test("rules: positional superko still holds with the cached hashes", () => {
  // A 4×4 cycle (found by search): the twelfth move would recreate the
  // board after the ninth, which simple ko alone does not forbid.
  const moves = [[2, 1], [0, 1], [2, 2], [1, 0], [0, 3], [1, 2], [1, 1], [0, 2], [3, 0], [2, 0], [0, 0]];
  const g = new Game({ size: 4 });
  for (const [x, y] of moves) assert.equal(g.play(x, y).ok, true);
  assert.deepEqual(g.canPlay(1, 0), { ok: false, reason: "superko" });
  assert.equal(g.play(1, 0).reason, "superko");
  // The hash is cached per node and follows a board replaced on the node.
  const h = new Game({ size: 9 });
  h.play(4, 4);
  h.undo();
  h.setup([{ x: 4, y: 4, color: BLACK }], WHITE);
  h.play(3, 3);
  assert.equal(h.canPlay(5, 5).ok, true);
  // A forced import move is not checked, and SGF setup ends the history.
  const r = loadSGF("(;GM[1]SZ[9];B[ee];W[ff];AE[ee][ff];B[ee];W[ff])").game;
  assert.equal(r.mainLine().length, 5);
});
