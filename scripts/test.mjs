/**
 * Unit and data checks. Run with `npm test`.
 *
 * These tests deliberately exercise the contracts the UI relies on: rules,
 * scoring, SGF round trips, the four-language string table, lesson/puzzle
 * data and the offline opponent. They do not need a browser or a native SDK.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BLACK, WHITE, EMPTY, Game, coordLabel, formatPoints, territoryMap } from "../src/web/js/rules.js";
import { loadSGF } from "../src/web/js/sgf.js";
import { execFileSync } from "node:child_process";
import { chooseMove } from "../src/web/js/ai.js";
import { STRENGTHS, pickCandidate, strengthById, suggestHandicap } from "../src/web/js/engine.js";
import { parseInfo, parseVertex } from "../src/web/js/katago.js";
import * as S from "../src/web/js/solver.js";
import { OPENINGS } from "../src/web/js/content/openings.js";
import { CLASSICS } from "../src/web/js/content/classics.js";
import { PROBLEMS } from "../src/web/js/content/problems.js";
import { COURSE } from "../src/web/js/content/course.js";
import { MESSAGES } from "../src/web/js/messages.js";
import { LANG_IDS, setLang, t } from "../src/web/js/i18n.js";
import {
  DEFAULT_SETTINGS,
  KEYS,
  V1_KEYS,
  dailySet,
  loadProgress,
  loadSettings,
  markProblem,
  migrate,
  readJSON,
  removeKey,
  touchStreak,
  writeJSON,
} from "../src/web/js/persist.js";
import * as Lib from "../src/web/js/library.js";
import * as U from "../src/web/js/update.js";
import * as Host from "../src/web/js/host.js";
import { APP_VERSION } from "../src/web/js/version.js";
import * as Sign from "./signing-notes.mjs";
import * as Shots from "./screenshots.mjs";
import { PNG } from "pngjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let count = 0;
let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    count += 1;
    process.stdout.write(`ok ${count} - ${name}\n`);
  } catch (error) {
    failures += 1;
    console.error(`not ok ${count + failures} - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function setup(stones, turn = BLACK, size = 9) {
  const game = new Game({ size });
  game.setup(stones, turn);
  return game;
}

function newGame(size = 19, options = {}) {
  return new Game({ size, ...options });
}

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
  assert.equal(js.blackStones, undefined);
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
  assert.equal(score.blackTerritory, 1);
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

await test("SGF columns skip I on import and export", () => {
  const { game } = loadSGF("(;GM[1]FF[4]SZ[19];B[jd];W[qd])");
  const line = game.mainLine();
  assert.equal(line[1].move.x, 8);
  assert.equal(line[1].move.y, 3);
  assert.equal(line[2].move.x, 15);
  const sgf = game.toSGF();
  assert.match(sgf, /;B\[jd\]/);
  assert.match(sgf, /;W\[qd\]/);
});

await test("a Chinese-rules SGF is rejected instead of silently scored as Japanese", () => {
  assert.throws(
    () => loadSGF("(;GM[1]FF[4]SZ[9]KM[7.5]RU[Chinese];B[ee])"),
    (error) => error.code === "unsupported-rules" && error.rules === "Chinese",
  );
});

await test("an empty SGF is rejected, not silently accepted", () => {
  assert.throws(() => loadSGF("not an sgf"), /no root node/);
});

await test("every UI key exists in all four launch languages", () => {
  for (const [key, values] of Object.entries(MESSAGES)) {
    for (const lang of LANG_IDS) {
      assert.equal(typeof values[lang], "string", `${key} missing ${lang}`);
      assert.ok(values[lang].trim().length > 0, `${key} empty ${lang}`);
    }
  }
  setLang("ko");
  assert.equal(t("nav.play"), "대국");
  setLang("ja");
  assert.equal(t("nav.practice"), "練習");
  setLang("en");
  assert.equal(t("nav.library"), "Library");
  setLang("zh");
  assert.equal(t("nav.library"), "棋谱");
});

await test("every key the interface uses is in the string table", () => {
  const dir = path.join(root, "src/web/js/app");
  const used = new Set();
  for (const file of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    for (const m of src.matchAll(/\bt\("([a-zA-Z0-9_.-]+)"/g)) used.add(m[1]);
  }
  // Keys built at runtime from a fixed vocabulary.
  const dynamic = {
    "area.": ["top", "bottom", "left", "right", "center", "top-left", "top-right", "bottom-left", "bottom-right"],
    "error.": ["illegal", "occupied", "outside", "turn", "ko", "suicide", "superko"],
    "goal.": ["capture", "save", "kill", "live", "place"],
    "grade.": ["1", "2", "3", "4", "5"],
    "library.kind.": ["all", "won", "lost", "imported"],
    "settings.material.": ["plain", "wood", "ink"],
    "newGame.": ["quick", "medium", "full"],
  };
  for (const [prefix, list] of Object.entries(dynamic)) for (const v of list) used.add(prefix + v);
  for (const topic of new Set(PROBLEMS.map((p) => p.topic))) {
    used.add("topic." + topic);
    used.add("topic." + topic + ".desc");
  }
  const missing = [...used].filter((k) => !k.endsWith(".") && !MESSAGES[k]);
  assert.deepEqual(missing, [], "missing UI strings");
});

await test("all 20 classic games parse and carry four-language notes", () => {
  assert.equal(CLASSICS.length, 20);
  const seen = new Set();
  for (const classic of CLASSICS) {
    assert.ok(!seen.has(classic.id), `${classic.id} duplicate id`);
    seen.add(classic.id);
    for (const lang of LANG_IDS) {
      for (const field of ["title", "note"]) {
        assert.ok(classic[field]?.[lang]?.trim(), `${classic.id} ${field} ${lang}`);
      }
      assert.ok(classic.blackName?.[lang]?.trim(), `${classic.id} black ${lang}`);
      assert.ok(classic.whiteName?.[lang]?.trim(), `${classic.id} white ${lang}`);
    }
    const { game } = loadSGF(classic.sgf);
    assert.equal(game.size, 19, `${classic.id} board size`);
    assert.ok(game.mainLine().length > 100, `${classic.id} move count`);
    assert.equal(game.current.result, classic.result, `${classic.id} result preserved`);
  }
});

await test("all 40 openings are well-formed and legal in four languages", () => {
  assert.equal(OPENINGS.length, 40);
  const seen = new Set();
  const titles = new Set();
  const lines = new Set();
  for (const opening of OPENINGS) {
    for (const lang of LANG_IDS) {
      assert.ok(opening.title[lang]?.trim(), `${opening.id} title ${lang}`);
      assert.ok(opening.text[lang]?.trim(), `${opening.id} text ${lang}`);
    }
    assert.ok(!seen.has(opening.id), `${opening.id} duplicate id`);
    seen.add(opening.id);
    assert.ok(!titles.has(opening.title.en), `${opening.id} duplicate title`);
    titles.add(opening.title.en);
    const lineKey = JSON.stringify(opening.line);
    assert.ok(!lines.has(lineKey), `${opening.id} duplicate line`);
    lines.add(lineKey);
    const game = new Game({ size: opening.size || 19, komi: opening.komi ?? 6.5 });
    game.setup(opening.setup, opening.toMove);
    for (const move of opening.line) {
      assert.equal(game.play(move.x, move.y, { color: move.c }).ok, true, `${opening.id} illegal line`);
    }
  }
});

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

/** Correct first moves in diagram coordinates. */
function localCorrect(pz) {
  return S.solveFirstMoves(pz)
    .correct.map((c) => `${c.x - pz.box.x0},${c.y - pz.box.y0}`)
    .sort();
}

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

function libertiesAt(pz, st, i) {
  const seen = new Set([i]);
  const stack = [i];
  const libs = new Set();
  while (stack.length) {
    const p = stack.pop();
    const x = p % pz.size;
    const y = (p / pz.size) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= pz.size || ny >= pz.size) continue;
      const q = ny * pz.size + nx;
      if (seen.has(q)) continue;
      if (st.board[q] === 0) libs.add(q);
      else if (st.board[q] === st.board[i]) {
        seen.add(q);
        stack.push(q);
      }
    }
  }
  return libs.size;
}

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

await test("every practice problem is verified and graded by the solver", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/check-problems.mjs")], { stdio: "inherit" });
});

await test("every course lesson is complete, four-language and solver-verified", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/check-course.mjs")], { stdio: "inherit" });
  assert.ok(COURSE.length >= 8);
});

await test("the offline opponent returns a legal move on 9x9 and 19x19", async () => {
  for (const size of [9, 19]) {
    const game = newGame(size);
    if (size === 9) game.play(4, 4);
    const move = await chooseMove(game, { level: 2, color: game.turn });
    if (move.pass) continue;
    assert.ok(move.x >= 0 && move.y >= 0 && move.x < size && move.y < size, `${size} bounds`);
    assert.equal(game.board.get([move.x, move.y]), EMPTY, `${size} occupied`);
    assert.equal(game.canPlay(move.x, move.y).ok, true, `${size} illegal`);
  }
});

const SAMPLE_INFO =
  "info move D4 visits 30 utility 0.1 winrate 0.56 scoreMean 2.1 scoreStdev 9 scoreLead 2.4 scoreSelfplay 2 prior 0.2 lcb 0.5 utilityLcb 0 order 0 pv D4 Q16 D16 " +
  "info move Q16 visits 12 utility 0.05 winrate 0.53 scoreMean 1.1 scoreStdev 9 scoreLead 1.0 scoreSelfplay 1 prior 0.18 lcb 0.4 utilityLcb 0 order 1 pv Q16 D4 " +
  "info move K10 visits 3 utility -0.2 winrate 0.40 scoreMean -6 scoreStdev 9 scoreLead -6.5 scoreSelfplay -6 prior 0.01 lcb 0.3 utilityLcb 0 order 2 pv K10 " +
  "ownership " + Array.from({ length: 361 }, (_, i) => (i % 2 ? "0.5" : "-0.25")).join(" ");

await test("KataGo reports parse into candidates, lines and ownership", () => {
  const r = parseInfo(SAMPLE_INFO, 19);
  assert.equal(r.moves.length, 3);
  assert.deepEqual({ x: r.moves[0].x, y: r.moves[0].y }, { x: 3, y: 15 });
  assert.equal(r.moves[0].winrate, 0.56);
  assert.equal(r.moves[0].scoreLead, 2.4);
  assert.equal(r.moves[0].pv.length, 3);
  assert.deepEqual(r.moves[0].pv[1], { x: 15, y: 3 });
  assert.equal(r.ownership.length, 361);
  assert.equal(r.ownership[1], 0.5);
  assert.deepEqual(parseVertex("pass", 19), { pass: true });
  assert.deepEqual(parseVertex("J1", 9), { x: 8, y: 8 });
});

await test("the strength ladder keeps strong levels exact and weak levels inside their loss window", () => {
  const analysis = { moves: parseInfo(SAMPLE_INFO, 19).moves, play: { x: 3, y: 15 } };
  assert.deepEqual(pickCandidate(analysis, BLACK, strengthById("2d"), () => 0.99), { x: 3, y: 15 });
  // 10k allows up to 6 points: D4 and Q16, never K10 (8.9 points worse)
  // unless its 2% deliberate slip fires (the first draw below 0.02).
  for (let i = 0; i < 50; i++) {
    const m = pickCandidate(analysis, BLACK, strengthById("10k"), () => 0.05 + (i / 50) * 0.94);
    assert.ok(!(m.x === 9 && m.y === 9), "10k must not take a 9-point loss");
  }
  const slipped = pickCandidate(analysis, BLACK, strengthById("10k"), () => 0.01);
  assert.deepEqual(slipped, { x: 9, y: 9 }, "the deliberate slip picks outside the window");
  // White's point of view flips the score lead: K10 is White's best here.
  assert.deepEqual(pickCandidate(analysis, WHITE, { ...strengthById("2d"), temp: 0 }), { x: 3, y: 15 });
  assert.equal(new Set(STRENGTHS.map((s) => s.id)).size, STRENGTHS.length);
  assert.equal(suggestHandicap(25, "15k", 19), 9);
  assert.equal(suggestHandicap(15, "10k", 19), 5);
  assert.equal(suggestHandicap(10, "10k", 19), 0);
  assert.equal(suggestHandicap(null, "10k", 19), 0);
});

await test("the native bridge sends setup stones, handicap and moves to KataGo for any size", async () => {
  let script = "";
  globalThis.zero = {
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test" };
      if (command === "studio.katagoAnalyze") {
        script = Buffer.from(payload.b64, "base64").toString("utf8");
        assert.equal(payload.color, "B");
        return { ok: true, play: "C3", info: "info move C3 visits 10 winrate 0.6 scoreLead 3 order 0 pv C3 G7 ownership " + Array(81).fill("0.1").join(" ") };
      }
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const K = await import("../src/web/js/katago.js?bridge-test");
    const game = new Game({ size: 9, komi: 0.5, handicap: 2 });
    game.play(4, 4);
    const a = await K.analyze(game, { visits: 20 });
    assert.deepEqual(a.play, { x: 2, y: 6 });
    assert.equal(a.ownership.length, 81);
    assert.equal(a.winrate, 0.6);
    assert.match(script, /boardsize 9/);
    assert.match(script, /komi 0\.5/);
    assert.match(script, /kata-set-rules japanese/);
    assert.match(script, /kata-set-param maxVisits 20/);
    assert.match(script, /play B G7\nplay B C3/);
    assert.match(script, /play W E5$/);
  } finally {
    delete globalThis.zero;
  }
});

await test("async KataGo hosts get a structured position, stream partial reports and cancel", async () => {
  const sent = [];
  const listeners = new Map();
  const replies = new Map();
  const info9 = (visits) => `info move C3 visits ${visits} winrate 0.6 scoreLead 3 order 0 pv C3 G7 ownership ` + Array(81).fill("0.1").join(" ");
  globalThis.zero = {
    on: (name, fn) => {
      listeners.set(name, fn);
      return () => listeners.delete(name);
    },
    invoke: async (command, payload) => {
      sent.push({ command, payload });
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true };
      if (command === "studio.katagoCancel") {
        replies.get(payload.id)?.({ ok: false, id: payload.id, cancelled: true });
        return { ok: true, cancelled: 1 };
      }
      if (command === "studio.katagoAnalyzeAsync") return new Promise((resolve) => replies.set(payload.id, resolve));
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const K = await import("../src/web/js/katago.js?bridge-async");
    assert.equal((await K.status()).async, true);
    const game = new Game({ size: 9, komi: 0.5, handicap: 2 });
    game.play(4, 4);
    game.pass();
    const partials = [];
    const pending = K.analyze(game, { visits: 20, onInfo: (p) => partials.push(p) });
    await new Promise((r) => setTimeout(r, 0));
    const req = sent.find((s) => s.command === "studio.katagoAnalyzeAsync").payload;
    assert.equal(req.size, 9);
    assert.equal(req.komi, 0.5);
    assert.equal(req.setup, "B G7 B C3");
    assert.equal(req.moves, "W E5 B pass");
    assert.equal(req.color, "W");
    assert.equal(req.visits, 20);
    assert.equal(req.stream, true);
    listeners.get("katago:info")({ id: req.id, info: info9(4) });
    listeners.get("katago:info")({ id: "someone-else", info: info9(5) });
    assert.equal(partials.length, 1);
    assert.equal(partials[0].visits, 4);
    assert.deepEqual(partials[0].play, { x: 2, y: 6 });
    replies.get(req.id)({ ok: true, id: req.id, play: "C3", info: info9(20), sync: { reset: false, undo: 0, play: 1 } });
    const a = await pending;
    assert.equal(a.visits, 20);
    assert.equal(a.ownership.length, 81);
    assert.deepEqual(a.sync, { reset: false, undo: 0, play: 1 });

    // Abort: cancel goes to the host and the call resolves null.
    const controller = new AbortController();
    const aborted = K.analyze(game, { visits: 20, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    assert.equal(await aborted, null);
    const cancelReq = sent.filter((s) => s.command === "studio.katagoCancel").at(-1).payload;
    assert.equal(cancelReq.id, sent.filter((s) => s.command === "studio.katagoAnalyzeAsync").at(-1).payload.id);

    // cancel(): everything in flight resolves null; a superseded reply is null.
    const third = K.analyze(game, { visits: 20 });
    await new Promise((r) => setTimeout(r, 0));
    K.cancel();
    assert.equal(await third, null);
    assert.deepEqual(sent.at(-1), { command: "studio.katagoCancel", payload: {} });
    const fourth = K.analyze(game, { visits: 20 });
    await new Promise((r) => setTimeout(r, 0));
    const id4 = sent.filter((s) => s.command === "studio.katagoAnalyzeAsync").at(-1).payload.id;
    replies.get(id4)({ ok: false, id: id4, cancelled: true });
    assert.equal(await fourth, null);
  } finally {
    delete globalThis.zero;
  }
});

await test("v1 data migrates to v2 without losing games or settings", () => {
  for (const k of [...Object.values(KEYS), ...Object.values(V1_KEYS)]) removeKey(k);
  const g = newGame(9);
  g.play(4, 4);
  writeJSON(V1_KEYS.settings, { lang: "ja", theme: "night", coords: true, sound: false, level: 4, firstRun: false });
  writeJSON(V1_KEYS.progress, { openings: { a: { done: true } }, classics: {}, streak: { count: 3, last: "2026-10-31" }, puzzles: { "cap-1": {} } });
  writeJSON(V1_KEYS.library, { games: [{ id: "x", sgf: g.toSGF(), size: 9, moves: 1, level: 2 }] });
  migrate();
  const s = loadSettings();
  assert.equal(s.lang, "ja");
  assert.equal(s.appearance, "dark");
  assert.equal(s.board, "ink");
  assert.equal(s.strength, "10k");
  assert.equal(s.onboarded, true);
  const p = loadProgress();
  assert.equal(p.streak.count, 3);
  assert.equal(p.openings.a.done, true);
  assert.deepEqual(p.problems, {});
  const games = Lib.listGames();
  assert.equal(games.length, 1);
  assert.equal(games[0].strength, "20k");
});

await test("the library holds finished and saved games; the current game is separate", () => {
  writeJSON(KEYS.library, { games: [] });
  const g = newGame();
  g.play(4, 4);
  g.play(3, 3);
  Lib.saveCurrent(g, { opponent: "ai" });
  assert.equal(Lib.listGames().length, 0, "playing does not fill the library");
  assert.equal(loadSGF(Lib.loadCurrent().sgf).game.mainLine().length, 3);
  const rec = Lib.saveGame(g, { name: "test game", opponent: "ai", humanColor: BLACK });
  assert.equal(Lib.listGames().length, 1);
  assert.equal(Lib.getGame(rec.id).moves, 2);
  assert.equal(Lib.getGame(rec.id).thumb.length, 361);
  Lib.renameGame(rec.id, "renamed");
  assert.equal(Lib.getGame(rec.id).name, "renamed");
  g.setResult("B+3.5");
  Lib.saveGame(g, { id: rec.id, opponent: "ai", humanColor: BLACK });
  const imp = newGame(9);
  imp.play(1, 1);
  Lib.saveGame(imp, { name: "imported", source: "import" });
  const all = Lib.listGames();
  assert.equal(Lib.filterGames(all, { kind: "won" }).length, 1);
  assert.equal(Lib.filterGames(all, { kind: "lost" }).length, 0);
  assert.equal(Lib.filterGames(all, { kind: "imported" }).length, 1);
  assert.equal(Lib.filterGames(all, { query: "RENAMED" }).length, 1);
  Lib.deleteGame(rec.id);
  assert.equal(Lib.listGames().length, 1);
});

await test("today's five puts due reviews first and the review ladder spaces repeats", () => {
  writeJSON(KEYS.progress, {});
  const progress = loadProgress();
  const grades = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const picks = dailySet(progress, PROBLEMS, grades, 5);
  assert.equal(picks.length, 5);
  assert.equal(new Set(picks.map((p) => p.id)).size, 5);
  const now = Date.now();
  const id = PROBLEMS[PROBLEMS.length - 1].id;
  markProblem(progress, id, { solved: false }, now - 3 * 86400000);
  const again = dailySet(progress, PROBLEMS, grades, 5, now);
  assert.equal(again[0].id, id, "a failed problem comes back first");
  markProblem(progress, id, { solved: true, clean: true }, now);
  assert.equal(progress.problems[id].streak, 1);
  assert.ok(progress.problems[id].due > now);
  markProblem(progress, id, { solved: true, clean: false }, now);
  assert.equal(progress.problems[id].streak, 0, "a solve with help resets the ladder");
  touchStreak(progress);
  assert.equal(progress.streak.count, 1);
  assert.deepEqual(Object.keys(DEFAULT_SETTINGS).sort(), Object.keys(loadSettings()).sort());
  void readJSON;
});

await test("Moka 9x9 assets are present and attributed", () => {
  for (const file of ["host.js", "index.js", "worker.js", "go-model.json", "go-model.bin", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(fs.existsSync(path.join(root, "src/web/moka", file)), `moka/${file}`);
  }
  const model = JSON.parse(fs.readFileSync(path.join(root, "src/web/moka/go-model.json"), "utf8"));
  assert.equal(model.architecture.boardSize, 9);
  assert.equal(fs.statSync(path.join(root, "src/web/moka/go-model.bin")).size, model.weightsBytes);
});

await test("design tokens meet the contrast rules in docs/design.md (light and dark)", () => {
  const css = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8");
  const block = (sel) => css.slice(css.indexOf(sel + " {"), css.indexOf("}", css.indexOf(sel + " {")));
  const tokens = (b) => Object.fromEntries([...b.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const light = tokens(block(":root"));
  const dark = { ...light, ...tokens(block(':root[data-theme="dark"]')) };
  for (const [name, t] of [["light", light], ["dark", dark]]) {
    for (const bg of ["bg", "surface", "sidebar"]) {
      assert.ok(ratio(t.text, t[bg]) >= 7, `${name} text on ${bg}`);
      assert.ok(ratio(t["text-2"], t[bg]) >= 4.5, `${name} text-2 on ${bg}: ${ratio(t["text-2"], t[bg]).toFixed(2)}`);
      assert.ok(ratio(t["text-3"], t[bg]) >= 3, `${name} text-3 on ${bg}: ${ratio(t["text-3"], t[bg]).toFixed(2)}`);
    }
    assert.ok(ratio(t["on-primary"], t.text) >= 7, `${name} primary button label`);
    assert.ok(ratio(t.bad, t.surface) >= 3, `${name} bad on surface`);
    assert.ok(ratio(t.good, t.surface) >= 3, `${name} good on surface`);
  }
});

await test("the native-speaker review sheet matches messages.js", () => {
  const csv = fs.readFileSync(path.join(root, "docs/l10n/strings.csv"), "utf8").replace(/^\ufeff/, "");
  const keys = csv.split("\n").slice(1).filter(Boolean).map((l) => JSON.parse(l.slice(0, l.indexOf('",') + 1)));
  assert.deepEqual(keys, Object.keys(MESSAGES), "run: node scripts/export-strings.mjs");
});

await test("static page inputs and build script are present", () => {
  for (const file of ["index.html", "styles.css", "js/main.jsx", "js/app/app.jsx"]) {
    assert.ok(fs.existsSync(path.join(root, "src/web", file)), `src/web/${file}`);
  }
  assert.ok(fs.existsSync(path.join(root, "scripts/bundle.mjs")));
  const html = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8");
  assert.match(html, /js\/bundle\.js/);
  // WebView2 injects window.zero as an inline script; without unsafe-inline
  // its CSP drops the bridge and the packaged page silently becomes static.
  assert.match(html, /script-src 'self' 'unsafe-inline'/);
});

/* ------------------------------------------------------------ v4 release */

await test("v4: versions compare as semver (v-prefix, missing parts, pre-releases)", () => {
  assert.deepEqual(U.parseVersion("v4.1.0"), { major: 4, minor: 1, patch: 0, pre: [] });
  assert.deepEqual(U.parseVersion("4.1"), { major: 4, minor: 1, patch: 0, pre: [] });
  assert.deepEqual(U.parseVersion("4.0.0-beta.2+build.7").pre, ["beta", "2"]);
  for (const bad of ["", "latest", "v", "4.x", "release-4", null, undefined]) assert.equal(U.parseVersion(bad), null, String(bad));
  assert.equal(U.compareVersions("v3.0.0", "3.0.0"), 0);
  assert.equal(U.compareVersions("3.0.1", "3.0.0"), 1);
  assert.equal(U.compareVersions("3.10.0", "3.9.9"), 1, "numeric, not lexical");
  assert.equal(U.compareVersions("4.0.0-beta.1", "4.0.0"), -1, "a pre-release is older than its release");
  assert.equal(U.compareVersions("4.0.0-beta.2", "4.0.0-beta.10"), -1);
  assert.equal(U.compareVersions("4.0.0-alpha", "4.0.0-beta"), -1);
  assert.equal(U.compareVersions("4.0.0-1", "4.0.0-alpha"), -1, "numeric identifiers sort first");
  assert.equal(U.compareVersions("4.0.0-beta", "4.0.0-beta.1"), -1);
  assert.equal(U.compareVersions("nonsense", "3.0.0"), null);
  assert.equal(U.isNewer("v4.0.0", "3.0.0"), true);
  assert.equal(U.isNewer("v3.0.0", "3.0.0"), false);
  assert.equal(U.isNewer("v2.9.9", "3.0.0"), false);
  assert.equal(U.isNewer("garbage", "3.0.0"), false);
  assert.equal(U.isNewer(`v${APP_VERSION}`), false, "the running version is not an update");
});

await test("v4: the weekly check is off by default and runs at most once a week", () => {
  assert.equal(DEFAULT_SETTINGS.autoUpdateCheck, false, "opt-in");
  assert.equal(loadSettings().autoUpdateCheck, false);
  const now = Date.UTC(2026, 10, 1);
  assert.equal(U.isCheckDue({ enabled: false, lastCheck: 0, now }), false, "never when off");
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: 0, now }), true, "first check when on");
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: now - U.WEEK_MS + 60000, now }), false);
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: now - U.WEEK_MS, now }), true);
  assert.equal(U.isCheckDue({ enabled: true, lastCheck: now + 3600000, now }), false, "a clock set back is not 'never checked'");
  assert.equal(U.nextCheckAt({ enabled: false, lastCheck: 0, now }), null);
  assert.equal(U.nextCheckAt({ enabled: true, lastCheck: now - 1000, now }), now - 1000 + U.WEEK_MS);
  assert.equal(U.nextCheckAt({ enabled: true, lastCheck: 0, now }), now);
});

await test("v4: host replies become available / current / error / unavailable", () => {
  const ok = { ok: true, latest: "v4.1.0", url: "https://github.com/hxddh/goban-studio/releases/tag/v4.1.0", notes: "New", publishedAt: "2026-11-01T00:00:00Z" };
  assert.deepEqual(U.interpretReply(ok, "4.0.0"), { status: "available", latest: "v4.1.0", current: "4.0.0", url: ok.url, publishedAt: ok.publishedAt, notes: "New" });
  assert.equal(U.interpretReply(ok, "4.1.0").status, "current");
  assert.equal(U.interpretReply(ok, "5.0.0").status, "current", "an older release is not offered");
  assert.deepEqual(U.interpretReply({ ok: false, error: "unavailable" }), { status: "unavailable" });
  assert.deepEqual(U.interpretReply({ ok: false, error: "RateLimited" }), { status: "error", error: "RateLimited" });
  assert.deepEqual(U.interpretReply({ ok: true, latest: "<b>" }), { status: "error", error: "BadResponse" });
  assert.deepEqual(U.interpretReply(null), { status: "error", error: "BadResponse" });
});

await test("v4: without a native host there is no update request and the API says unavailable", async () => {
  assert.equal(globalThis.zero, undefined);
  assert.deepEqual(await Host.checkUpdate(), { ok: false, error: "unavailable" });
  assert.equal(await Host.openReleasePage(), false);
  assert.equal(Host.canCheckUpdates(), false);
  assert.equal(U.canCheckUpdates(), false);
  assert.deepEqual(await U.checkNow(), { status: "unavailable" });
  assert.equal(await U.autoCheckIfDue({ autoUpdateCheck: true }), null, "the weekly check needs a host");
});

await test("v4: checkNow / autoCheckIfDue ask only when allowed and remember successful checks", async () => {
  const store = new Map();
  const read = (k, fallback) => (store.has(k) ? store.get(k) : fallback);
  const write = (k, v) => store.set(k, v);
  let calls = 0;
  const check = async () => {
    calls++;
    return { ok: true, latest: "v9.0.0", url: "https://github.com/hxddh/goban-studio/releases/tag/v9.0.0", notes: "x" };
  };
  const now = Date.UTC(2026, 10, 1);
  const deps = { check, read, write, hasHost: true, current: "4.0.0" };
  assert.equal(await U.autoCheckIfDue({ autoUpdateCheck: false }, { ...deps, now }), null);
  assert.equal(await U.autoCheckIfDue({}, { ...deps, now }), null, "missing setting means off");
  assert.equal(calls, 0, "no request while the weekly check is off");
  const first = await U.autoCheckIfDue({ autoUpdateCheck: true }, { ...deps, now });
  assert.equal(first.status, "available");
  assert.equal(calls, 1);
  assert.equal(U.loadUpdateState(read).lastCheck, now);
  assert.equal(await U.autoCheckIfDue({ autoUpdateCheck: true }, { ...deps, now: now + 86400000 }), null, "not again the next day");
  assert.equal(calls, 1);
  assert.equal((await U.autoCheckIfDue({ autoUpdateCheck: true }, { ...deps, now: now + U.WEEK_MS })).status, "available");
  assert.equal(calls, 2);
  // A failed check does not count as this week's check.
  const failing = { ...deps, check: async () => ({ ok: false, error: "Network" }) };
  const later = now + 3 * U.WEEK_MS;
  assert.deepEqual(await U.checkNow({ ...failing, now: later }), { status: "error", error: "Network" });
  assert.equal(U.loadUpdateState(read).lastCheck, now + U.WEEK_MS);
  const throwing = { ...deps, check: async () => { throw new Error("bridge"); } };
  assert.deepEqual(await U.checkNow({ ...throwing, now: later }), { status: "error", error: "Network" });
});

await test("v4: the native update commands are fixed to this repository", () => {
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8");
  const zig = fs.readFileSync(path.join(root, "src/update.zig"), "utf8");
  assert.match(main, /"studio\.checkUpdate"/);
  assert.match(main, /"studio\.openReleasePage"/);
  assert.match(zig, /releases_api_url = "https:\/\/api\.github\.com\/repos\/hxddh\/goban-studio\/releases\/latest"/);
  assert.match(zig, /releases_page_url = "https:\/\/github\.com\/hxddh\/goban-studio\/releases\/latest"/);
  // openReleasePage never reads the page's payload.
  const open = main.slice(main.indexOf("fn openReleasePage("), main.indexOf("fn spawnBrowser("));
  assert.match(open, /_ = invocation;/);
  assert.doesNotMatch(open, /payload/);
  // The page itself still cannot reach the network.
  const html = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8");
  assert.match(html, /connect-src 'self'/);
  const zon = fs.readFileSync(path.join(root, "app.zon"), "utf8");
  assert.match(zon, /external_links = \.\{ \.action = "deny" \}/);
  const messages = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8");
  assert.match(messages, /\/\/ v4 release\n/);
  for (const key of ["update.check", "update.auto", "update.available", "update.current", "update.error", "update.unavailable", "update.download"]) assert.ok(MESSAGES[key], key);
});

await test("v4: release notes and package READMEs say how the build was really signed", () => {
  const v3 = fs.readFileSync(path.join(root, ".github/release-notes/v3.0.0.md"), "utf8");
  const adhoc = Sign.normalizeStatus("macos", { mode: "adhoc" });
  const unsigned = Sign.normalizeStatus("windows", {});
  const notarized = Sign.normalizeStatus("macos", { mode: "developer-id", notarized: true });
  const signedWin = Sign.normalizeStatus("windows", { mode: "authenticode", timestamped: true });
  const plain = Sign.applyToNotes(v3, adhoc, unsigned);
  assert.match(plain, /Ad-hoc signed, \*\*not notarized\*\*/);
  assert.match(plain, /\*\*Not Authenticode-signed\.\*\*/);
  assert.equal(plain.split("| macOS (Apple Silicon)").length, 2, "one macOS row");
  const signed = Sign.applyToNotes(v3, notarized, signedWin);
  assert.match(signed, /notarized by Apple/);
  assert.match(signed, /\*\*Authenticode-signed\.\*\*/);
  assert.doesNotMatch(signed, /Ad-hoc|Not Authenticode/);
  assert.ok(signed.includes("## Playing"), "the rest of the notes is kept");
  // Markers win; a notes file without the section gets one.
  const marked = Sign.applyToNotes("# T\n\n<!-- first-launch -->\nold\n<!-- /first-launch -->\n\nBody\n", notarized, unsigned);
  assert.match(marked, /<!-- first-launch -->\n\| Platform/);
  assert.doesNotMatch(marked, /\nold\n/);
  assert.match(Sign.applyToNotes("# T\n\nBody\n", adhoc, unsigned), /^# T\n\n## Download and first launch\n\n\| Platform/);
  // "notarized" without Developer ID cannot be claimed.
  assert.equal(Sign.normalizeStatus("macos", { mode: "adhoc", notarized: true }).notarized, false);
  for (const platform of ["macos", "windows"]) {
    const file = path.join(root, `packaging/README-${platform === "macos" ? "macOS" : "Windows"}.txt`);
    const text = fs.readFileSync(file, "utf8");
    const off = Sign.normalizeStatus(platform, {});
    assert.equal(Sign.applyToReadme(text, off), text.replace(/\r\n/g, "\n"), `${platform} unsigned README unchanged`);
    const on = platform === "macos" ? notarized : signedWin;
    const out = Sign.applyToReadme(text, on);
    assert.notEqual(out, text);
    assert.doesNotMatch(out, /ad-hoc signed|not Authenticode-signed/);
    assert.match(out, /Check for updates/, "the README states the one network request");
  }
});

await test("v4: screenshot checks catch blank and repeated screens", () => {
  const make = (w, h, fn) => {
    const png = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = fn(x, y);
        const i = (y * w + x) * 4;
        png.data[i] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = 255;
      }
    return PNG.sync.read(PNG.sync.write(png));
  };
  const black = make(200, 120, () => [0, 0, 0]);
  const today = make(200, 120, (x, y) => [(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256]);
  const game = make(200, 120, (x, y) => (x > 60 && x < 160 ? [220, 180, 110] : [(x * 11) % 256, (y * 3) % 256, 90]));
  assert.equal(Shots.isBlank(Shots.imageStats(black)), true);
  assert.equal(Shots.isBlank(Shots.imageStats(today)), false);
  assert.equal(Shots.diffFraction(today, today), 0);
  assert.ok(Shots.diffFraction(today, game) > 0.3);
  assert.equal(Shots.diffFraction(today, make(100, 100, () => [1, 2, 3])), 1, "different sizes differ");
  assert.equal(Shots.checkSequence([{ name: "today", png: today }, { name: "game", png: game }]).ok, true);
  const repeated = Shots.checkSequence([{ name: "today", png: today }, { name: "game", png: today }]);
  assert.equal(repeated.ok, false);
  assert.match(repeated.failures[0], /game: same as the previous screen/);
  assert.match(Shots.checkSequence([{ name: "blank", png: black }]).failures[0], /blank/);
  assert.equal(Shots.checkSequence([]).ok, false);
});

await test("v4: the screenshot tour visits five screens and starts only with GOBAN_TOUR_OUT", () => {
  const tour = fs.readFileSync(path.join(root, "src/web/js/tour.js"), "utf8");
  const steps = tour.slice(tour.indexOf("export const STEPS"), tour.indexOf("async function waitForAck"));
  const names = [...steps.matchAll(/name: "([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["today", "game19", "review", "practice", "settings"]);
  for (const fn of ["C.goSpace(", "C.newGame(", "C.reviewCurrentGame(", "C.openSheet(\"settings\")"]) assert.ok(tour.includes(fn), fn);
  const app = fs.readFileSync(path.join(root, "src/web/js/app/app.jsx"), "utf8");
  assert.match(app, /c\?\.tour && import\("\.\.\/tour\.js"\)/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8");
  assert.match(main, /GOBAN_TOUR_OUT/);
  for (const wf of ["build-macos.yml", "build-windows.yml"]) {
    const y = fs.readFileSync(path.join(root, ".github/workflows", wf), "utf8");
    assert.match(y, /scripts\/tour-app\.mjs/, wf);
    assert.match(y, wf.includes("macos") ? /native-screenshots-macos/ : /native-screenshots-windows/, wf);
  }
});

if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} tests passed.`);
