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
import {
  HUMAN_VISITS,
  STRENGTHS,
  STRONG_VISIT_SCALE,
  analysisEngine,
  beginnerMove,
  humanMoveFromAnalysis,
  humanRequest,
  moveFromAnalysis,
  opponentMode,
  pickCandidate,
  rankParts,
  scaledVisits,
  strengthById,
  suggestHandicap,
} from "../src/web/js/engine.js";
import { analyse, anchorMap, egfExpected, egfNats, fitBT, goRLabel, mulberry32, profileGoR, wilson } from "./calibrate-strength.mjs";
import { enginePayload, parseInfo, parseVertex } from "../src/web/js/katago.js";
import * as M from "../src/web/js/models.js";
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
    "goal.": ["capture", "save", "kill", "live", "seki", "place"],
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

/** Seki positions: Black's key group (x) against White stones inside it, a solid white wall outside. */
const SEKI = {
  // No eyes, two shared liberties: whoever fills one is captured.
  pure: [". O O O . x O ,", "X X X X X X O ,", "O O O O O O O ,", ", , , , , , , ,"],
  // One eye each and one shared liberty.
  eyeEye: [". x O . O O . X O ,", "X X O O O O X X O ,", "O X X X X X X O O ,", "O O O O O O O O O ,", ", , , , , , , , , ,"],
  // Look-alike: Black's second space is not shared with White, so Black takes it and has two eyes.
  eyeAndSpace: [". x O . O O . . X O ,", "X X O O O O X X X O ,", "O X X X X X X O O O ,", "O O O O O O O O O O ,", ", , , , , , , , , , ,"],
  // Look-alike: one shared liberty and no eye; White captures first.
  short: ["X O O O . x O ,", "X X X X X X O ,", "O O O O O O O ,", ", , , , , , , ,"],
  // Look-alike: the "seki" leans on a point nobody may play (outside the region).
  fiat: [", O O O . x O ,", "X X X X X X O ,", "O O O O O O O ,", ", , , , , , , ,"],
};

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

/** Capturing races on the top edge: White (o) in columns 3-4, Black in column 5, walls outside. */
const RACE = {
  threeThree: [", X . O o X . O ,", ", X . O O X . O ,", ", X . O O X . O ,", ", X X X X O O O ,", ", , , , , , , , ,"],
  threeTwo: [", X . O o X . O ,", ", X . O O X . O ,", ", X . O O X X O ,", ", X X X X O O O ,", ", , , , , , , , ,"],
  twoThree: [", X . O o X . O ,", ", X . O O X . O ,", ", X X O O X . O ,", ", X X X X O O O ,", ", , , , , , , , ,"],
  // One outside liberty each and two shared: neither can approach (seki).
  shared: [", X . O o . X . O ,", ", X . O O . X . O ,", ", X X O O O X X O ,", ", , X X X X O O O ,", ", , , , , , , , , ,"],
  // Black has an eye, White has none: the shared liberties are Black's.
  eyeNoEye: [", X X . O o . X . X O ,", ", X X . O O . X X X O ,", ", X X X O O O X X X O ,", ", , X X X X X O O O O ,", ", , , , , , , , , , , ,"],
  // Black's big eye (square four) against White's one-point eye.
  bigSmall: [", X X . O . O . X . . X O ,", ", X X . O o O . X . . X O ,", ", X X X X O O O X X X X O ,", ", , , X X X X X O O O O O ,", ", , , , , , , , , , , , , ,"],
  // The same race with a one-point eye for Black: equal eyes, and White has more liberties.
  smallSmall: [", X X . O . O . X X . X O ,", ", X X . O o O . X X X X O ,", ", X X X X O O O X X X X O ,", ", , , X X X X X O O O O O ,", ", , , , , , , , , , , , , ,"],
};
const raceAt = (diagram, goal) => S.createPuzzle({ goal, diagram, at: [3, 0] });
/** Does Black capture White when Black moves first / when White moves first? */
function race(diagram) {
  const kill = raceAt(diagram, "kill");
  const live = raceAt(diagram, "live");
  const a = S.attackerWins(kill, S.initialState(kill), 600000);
  const b = S.attackerWins(live, S.initialState(live), 600000);
  assert.ok(a.exact && b.exact, "race search exact");
  return { blackFirst: a.win, whiteFirst: b.win, kill, live };
}

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
  // 1k allows up to 6 points: D4 and Q16, never K10 (8.9 points worse)
  // unless its 2% deliberate slip fires (the first draw below 0.02).
  for (let i = 0; i < 50; i++) {
    const m = pickCandidate(analysis, BLACK, strengthById("1k"), () => 0.05 + (i / 50) * 0.94);
    assert.ok(!(m.x === 9 && m.y === 9), "1k must not take a 9-point loss");
  }
  const slipped = pickCandidate(analysis, BLACK, strengthById("1k"), () => 0.01);
  assert.deepEqual(slipped, { x: 9, y: 9 }, "the deliberate slip picks outside the window");
  // White's point of view flips the score lead: K10 is White's best here.
  assert.deepEqual(pickCandidate(analysis, WHITE, { ...strengthById("2d"), temp: 0 }), { x: 3, y: 15 });
  assert.equal(new Set(STRENGTHS.map((s) => s.id)).size, STRENGTHS.length);
  // One stone per rank of the level's calibrated label.
  assert.equal(suggestHandicap(25, "15k", 19), 7);
  assert.equal(suggestHandicap(15, "10k", 19), 3);
  assert.equal(suggestHandicap(10, "10k", 19), 0);
  assert.equal(suggestHandicap(null, "10k", 19), 0);
});

await test("the strength ladder is monotonic and keeps its saved IDs", () => {
  // Saved settings, library games and ratings refer to these IDs.
  assert.deepEqual(
    STRENGTHS.map((s) => s.id),
    ["30k", "25k", "20k", "15k", "10k", "5k", "1k", "2d"],
  );
  for (let i = 1; i < STRENGTHS.length; i++) {
    const a = STRENGTHS[i - 1];
    const b = STRENGTHS[i];
    assert.ok(b.rank < a.rank, `${b.id} is labelled stronger than ${a.id}`);
    assert.ok(b.visits >= a.visits, `${b.id} searches at least as much as ${a.id}`);
    assert.ok(b.temp <= a.temp, `${b.id} samples no wider than ${a.id}`);
    assert.ok(b.maxLoss <= a.maxLoss, `${b.id} tolerates no bigger loss than ${a.id}`);
    assert.ok(b.slip <= a.slip, `${b.id} slips no more often than ${a.id}`);
    assert.ok(b.local >= a.local, `${b.id} offline fallback is no weaker than ${a.id}`);
    assert.ok((b.blunder ?? 0) <= (a.blunder ?? 0), `${b.id} blunders no more often than ${a.id}`);
    assert.ok(b.visits > a.visits || b.temp < a.temp || b.maxLoss < a.maxLoss || b.slip < a.slip || (b.blunder ?? 0) < (a.blunder ?? 0), `${b.id} differs from ${a.id}`);
  }
  for (const s of STRENGTHS) {
    assert.ok(Number.isInteger(s.rank) && s.rank <= 30 && s.rank >= -8, `${s.id} rank`);
    assert.ok(s.visits >= 1 && s.visits <= 1000, `${s.id} visits fit a laptop CPU`);
    const parts = rankParts(s.id);
    assert.ok(parts.n >= 1 && (parts.unit === "kyu" || parts.unit === "dan"));
  }
});

await test("a level's pick falls back to KataGo's own move when the app's rules forbid it", () => {
  const g = newGame(9);
  g.play(4, 4);
  // E5 (4,4) is occupied: the pick is illegal, so KataGo's choice is played.
  const analysis = {
    moves: [{ x: 4, y: 4, visits: 10, scoreLead: 1, winrate: 0.5, order: 0 }],
    play: { x: 2, y: 2 },
  };
  assert.deepEqual(moveFromAnalysis(g, analysis, strengthById("2d")), { x: 2, y: 2 });
  assert.equal(moveFromAnalysis(g, { moves: analysis.moves, play: { x: 4, y: 4 } }, strengthById("2d")), null);
});

await test("beginner moves are legal, local and never fill the player's own eye", () => {
  const rnd = mulberry32(3);
  const g = newGame(9);
  // Black's eye at A9 (0,0): B9 and A8 are black.
  g.play(1, 0);
  g.play(8, 8);
  g.play(0, 1);
  g.play(7, 7);
  for (let i = 0; i < 200; i++) {
    const m = beginnerMove(g, rnd);
    assert.ok(m && g.canPlay(m.x, m.y).ok, "legal");
    assert.ok(!(m.x === 0 && m.y === 0), "never its own eye");
    let near = false;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (g.board.get([x, y]) !== EMPTY && Math.max(Math.abs(x - m.x), Math.abs(y - m.y)) <= 2) near = true;
    assert.ok(near, "near the stones on the board");
  }
  // An empty 19×19 board: the third or fourth line.
  const e = newGame(19);
  for (let i = 0; i < 50; i++) {
    const m = beginnerMove(e, rnd);
    const line = Math.min(m.x, m.y, 18 - m.x, 18 - m.y);
    assert.ok(line === 2 || line === 3, `opening on the 3rd/4th line, got ${line + 1}`);
  }
  // A level with blunder 1 always plays a beginner move, unless KataGo passes.
  const analysis = { moves: [{ x: 4, y: 4, visits: 10, scoreLead: 1, order: 0 }], play: { x: 4, y: 4 } };
  const level = { ...strengthById("30k"), blunder: 1 };
  const g2 = newGame(9);
  g2.play(2, 2);
  const m = moveFromAnalysis(g2, analysis, level, mulberry32(1));
  assert.ok(Math.max(Math.abs(m.x - 2), Math.abs(m.y - 2)) <= 2);
  assert.deepEqual(moveFromAnalysis(g2, { moves: [{ pass: true, visits: 10, scoreLead: 0 }], play: { pass: true } }, level, mulberry32(1)), { pass: true });
});

await test("the calibration fit recovers known strengths and maps them onto the EGF scale", () => {
  // EGF expectancy: one rank at 10k is worth about two wins in three.
  assert.ok(Math.abs(egfExpected(1200, 1100) - 0.659) < 0.01);
  assert.ok(Math.abs(egfExpected(2200, 2100) - 0.73) < 0.01);
  assert.ok(Math.abs(egfNats(1000, 1100) - 100 / (205 - 1050 / 20)) < 0.01);
  assert.equal(profileGoR("rank_5k"), 1600);
  assert.equal(profileGoR("rank_2d"), 2200);
  assert.equal(goRLabel(1600), "5k");
  assert.equal(goRLabel(2100), "1d");
  assert.equal(goRLabel(2180), "2d");
  const [lo, hi] = wilson(20, 40);
  assert.ok(lo > 0.34 && lo < 0.36 && hi > 0.64 && hi < 0.66);

  const truth = { "L:a": 0, "L:b": 0.7, "L:c": 1.5, "H:rank_10k": 1.1 };
  const players = Object.keys(truth);
  const rnd = mulberry32(7);
  const games = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (let k = 0; k < 800; k++) {
        const [black, white] = k % 2 ? [players[i], players[j]] : [players[j], players[i]];
        const p = 1 / (1 + Math.exp(-(truth[black] - truth[white] + 0.2)));
        games.push({ black, white, winner: rnd() < p ? "B" : "W", plies: 100, reason: "passes" });
      }
    }
  }
  const fit = fitBT(games, players, { ref: "L:a" });
  for (const p of players) assert.ok(Math.abs(fit.theta[p] - truth[p]) < 0.15, `${p} θ ${fit.theta[p]}`);
  assert.ok(Math.abs(fit.eta - 0.2) < 0.1);
  // One anchor: its own rating, and the EGF curve elsewhere.
  const m = anchorMap(fit.theta, [{ player: "H:rank_10k", gor: 1100 }]);
  assert.equal(Math.round(m.map(fit.theta["H:rank_10k"])), 1100);
  assert.ok(m.map(fit.theta["L:c"]) > 1100 && m.map(fit.theta["L:a"]) < 1100);
  const r = analyse(games, { boot: 20 });
  assert.equal(r.rows.length, 4);
  for (const row of r.rows) assert.ok(row.lo <= row.theta + 1e-9 && row.theta <= row.hi + 1e-9 || row.player === "L:a");
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
  assert.match(messages, /\/\/ v4 release\r?\n/);
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

/* ------------------------------------------------------------ v5 models */

await test("v5: model status replies normalize; the browser preview is unavailable", async () => {
  const none = M.initialModels();
  assert.equal(none.available, false);
  assert.equal(none.human.status, "unavailable");
  assert.equal(none.strong.total, M.MODELS.strong.bytes);
  // No host: no call is made and both kinds are unavailable.
  let called = 0;
  const invoke = async () => {
    called++;
    return {};
  };
  assert.deepEqual(await M.fetchStatus({ hasHost: false, invoke }), none);
  assert.equal((await M.download("human", { hasHost: false, invoke })).ok, false);
  assert.equal(called, 0);
  assert.equal(M.canDownload(), false);

  const raw = {
    available: true,
    human: { status: "downloading", bytes: 49_533_115, total: 99_066_230, idleMs: 31_000, needed: 0, name: "b18c384nbt-humanv0", error: "" },
    strong: { status: "failed", bytes: 0, total: 48_038_914, idleMs: 0, needed: 112_000_000, name: "g170e", error: "DiskFull" },
  };
  const st = M.normalizeStatus(raw);
  assert.equal(st.available, true);
  assert.equal(st.human.status, "downloading");
  assert.equal(st.human.progress, 0.5);
  assert.equal(st.human.stalled, true);
  assert.equal(M.percent(st.human), 50);
  assert.equal(st.strong.error, "DiskFull");
  assert.equal(st.strong.needed, 112_000_000);
  assert.equal(M.needsPolling(st), true);
  assert.equal(M.isInstalled(st, "human"), false);
  // An unknown status or a missing record is "unavailable", never "ready".
  assert.equal(M.normalizeOne("human", { status: "hacked", bytes: 1 }).status, "unavailable");
  assert.equal(M.normalizeStatus({ available: false, human: raw.human }).human.status, "unavailable");
  // Bytes are clamped to the file size; ready is 100 %, nothing else is.
  assert.equal(M.normalizeOne("strong", { status: "partial", bytes: 9e9, total: 100 }).bytes, 100);
  assert.equal(M.percent(M.normalizeOne("strong", { status: "verifying", bytes: 100, total: 100 })), 99);
  assert.equal(M.percent(M.normalizeOne("strong", { status: "ready", bytes: 100, total: 100 })), 100);
});

await test("v5: model actions name a kind only, and report what changed", async () => {
  const calls = [];
  const status = { available: true, human: { status: "downloading", bytes: 0, total: 1 }, strong: { status: "absent", bytes: 0, total: 1 } };
  const invoke = async (command, payload) => {
    calls.push([command, payload]);
    return command === "studio.modelStatus" ? status : { ok: true, models: status };
  };
  const deps = { hasHost: true, invoke };
  assert.equal((await M.download("human", deps)).ok, true);
  await M.cancel("human", deps);
  await M.remove("strong", deps);
  await M.fetchStatus(deps);
  assert.deepEqual(calls, [
    ["studio.modelDownload", { kind: "human" }],
    ["studio.modelCancel", { kind: "human" }],
    ["studio.modelRemove", { kind: "strong" }],
    ["studio.modelStatus", {}],
  ]);
  await assert.rejects(() => M.download("https://example.com/x.bin.gz", deps), /unknown model kind/);
  // A failing host call is an error result, not an exception.
  const broken = await M.download("human", { hasHost: true, invoke: async () => Promise.reject(new Error("x")) });
  assert.deepEqual([broken.ok, broken.error], [false, "Unavailable"]);

  const before = M.normalizeStatus({ available: true, human: { status: "downloading", bytes: 5, total: 10 }, strong: { status: "verifying", bytes: 10, total: 10 } });
  const after = M.normalizeStatus({ available: true, human: { status: "failed", bytes: 5, total: 10, error: "Network" }, strong: { status: "ready", bytes: 10, total: 10 } });
  assert.deepEqual(M.transitions(before, after), [
    { kind: "human", event: "failed" },
    { kind: "strong", event: "ready" },
  ]);
  assert.deepEqual(M.transitions(after, after), []);
  assert.equal(M.errorKey("DiskFull"), "models.error.DiskFull");
  assert.equal(M.errorKey("TlsInitializationFailed"), "models.error.generic");
  for (const e of M.ERROR_KEYS) assert.ok(MESSAGES[`models.error.${e}`], e);
  assert.equal(M.megabytes(99_066_230), "99");
  assert.equal(M.megabytes(9_500_000), "9.5");
});

await test("v5: the opponent mode follows what is installed and the humanStyle setting", () => {
  const none = { strong: false, human: false, humanStyle: true };
  const human = { strong: false, human: true, humanStyle: true };
  const off = { strong: true, human: true, humanStyle: false };
  const strong = { strong: true, human: false, humanStyle: true };
  for (const s of STRENGTHS) {
    assert.equal(opponentMode(s.id, none), "standard", s.id);
    assert.equal(opponentMode(s.id, human), "human", s.id);
    assert.equal(opponentMode(s.id, off), s.strong ? "strong" : "standard", s.id);
  }
  // The stronger network plays only the top level; everything below keeps
  // the network its label was measured with.
  assert.deepEqual(STRENGTHS.filter((s) => opponentMode(s, strong) === "strong").map((s) => s.id), ["2d"]);
  assert.equal(opponentMode("2d", { ...strong, strongUsable: false }), "standard");
  assert.equal(DEFAULT_SETTINGS.humanStyle, true);
  // Analysis uses the stronger network when installed, with fewer visits.
  assert.equal(analysisEngine(none), "standard");
  assert.equal(analysisEngine(strong), "strong");
  assert.equal(scaledVisits(240, "strong"), Math.round(240 * STRONG_VISIT_SCALE));
  assert.equal(scaledVisits(240, "standard"), 240);
  assert.equal(scaledVisits(1, "strong"), 1);
});

await test("v5: every level has a valid human SL profile, in ladder order", () => {
  // The same rule as engine.zig validProfile.
  const valid = (p) => /^(rank|preaz)_([1-9]|1\d|20)k$|^(rank|preaz)_[1-9]d$/.test(p);
  const strengthOf = (p) => {
    const m = /_(\d+)([kd])$/.exec(p);
    return m[2] === "k" ? -Number(m[1]) : Number(m[1]);
  };
  let prev = -Infinity;
  let prevBlunder = Infinity;
  for (const s of STRENGTHS) {
    assert.ok(s.human && valid(s.human.profile), s.id);
    assert.ok(!s.human.style || ["raw", "search"].includes(s.human.style), s.id);
    const v = strengthOf(s.human.profile);
    assert.ok(v >= prev, `${s.id}: profile weaker than the level below`);
    const b = s.human.blunder ?? 0;
    assert.ok(b <= prevBlunder, `${s.id}: more beginner moves than the level below`);
    assert.ok(b < s.blunder || s.blunder === 0, `${s.id}: human style adds no beginner moves of its own`);
    prev = v;
    prevBlunder = b;
    const req = humanRequest(s.human);
    assert.equal(req.engine, "human");
    assert.ok(req.visits >= 1 && req.visits <= 400, s.id);
  }
  assert.equal(humanRequest({ profile: "rank_10k" }).visits, HUMAN_VISITS);
  assert.equal(humanRequest({ profile: "rank_10k", style: "bogus" }).humanStyle, "raw");
  assert.deepEqual(enginePayload({ engine: "human", profile: "rank_12k", humanStyle: "search" }), { engine: "human", profile: "rank_12k", humanStyle: "search" });
  assert.deepEqual(enginePayload({ engine: "strong", profile: "x" }), { engine: "strong" });
  // The standard engine sends exactly the v4 request.
  assert.deepEqual(enginePayload({}), {});
});

await test("v5: a human-style move is KataGo's human choice, legal, with beginner moves only below 20 kyu", () => {
  const game = new Game({ size: 9, komi: 6.5 });
  game.play(4, 4);
  const analysis = {
    moves: [{ x: 2, y: 2, visits: 10, scoreLead: 0.5, winrate: 0.5 }],
    play: { x: 6, y: 2 },
  };
  assert.deepEqual(humanMoveFromAnalysis(game, analysis, { profile: "rank_12k" }), { x: 6, y: 2 });
  // An illegal choice (occupied) falls back to KataGo's top candidate.
  assert.deepEqual(humanMoveFromAnalysis(game, { ...analysis, play: { x: 4, y: 4 } }, { profile: "rank_12k" }), { x: 2, y: 2 });
  // KataGo's pass (its search decides passes) is kept.
  assert.deepEqual(humanMoveFromAnalysis(game, { moves: [{ pass: true, visits: 10, scoreLead: 0 }], play: { pass: true } }, { profile: "rank_20k", blunder: 1 }), { pass: true });
  // blunder: 1 always plays a beginner's move when KataGo would not pass.
  const rnd = mulberry32(7);
  for (let i = 0; i < 20; i++) {
    const m = humanMoveFromAnalysis(game, analysis, { profile: "rank_20k", blunder: 1 }, rnd);
    assert.ok(m && !m.pass && game.canPlay(m.x, m.y).ok);
  }
});

await test("v5: the downloader fetches only pinned KataGo release files, verified before use", () => {
  const zig = fs.readFileSync(path.join(root, "src/models.zig"), "utf8");
  const urls = [...zig.matchAll(/\.url = "([^"]+)"/g)].map((m) => m[1]);
  // No other address is ever built: every http(s) literal outside the specs is a test value.
  assert.equal([...zig.slice(0, zig.indexOf("// ------------------------------------------------------------------ tests")).matchAll(/"https?:\/\//g)].length, 2);
  assert.deepEqual(urls, [
    "https://github.com/lightvector/KataGo/releases/download/v1.15.0/b18c384nbt-humanv0.bin.gz",
    "https://github.com/lightvector/KataGo/releases/download/v1.3.2/g170e-b15c192-s1672170752-d466197061.txt.gz",
  ]);
  assert.match(zig, /\.sha256 = "637746e44f0efe00ad1245a50aa9bbf0716efe364c43965ead97bd6835d84ab5"/);
  assert.match(zig, /\.sha256 = "09456899f1b9155217f4ca059cf8a68f79b7eba22cf6b7c00ffb7f17ce067967"/);
  assert.match(zig, /\.size = 99_066_230/);
  assert.match(zig, /\.size = 48_038_914/);
  assert.equal(M.MODELS.human.bytes, 99_066_230);
  assert.equal(M.MODELS.strong.bytes, 48_038_914);
  // Only the verified file is renamed into place, inside the models folder.
  assert.match(zig, /if \(!std\.mem\.eql\(u8, &hex, s\.sha256\)\)/);
  assert.match(zig, /renameAbsolute\(part, final/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8");
  for (const name of ["studio.modelStatus", "studio.modelDownload", "studio.modelCancel", "studio.modelRemove"]) assert.ok(main.includes(`"${name}"`), name);
  // The page names a kind; the payload has no URL or path field.
  assert.match(main, /const ModelPayload = struct \{\n    kind: \[\]const u8 = "",\n\};/);
  // The human process: the shipped config, KataGo's human recipe, Black's view.
  const cfg = fs.readFileSync(path.join(root, "engine/model/human.cfg"), "utf8");
  for (const line of ["humanSLChosenMoveProp = 1.0", "humanSLChosenMoveIgnorePass = true", "reportAnalysisWinratesAs = BLACK", "ignorePreRootHistory = false", "allowResignation = false", "ponderingEnabled = false"]) {
    assert.ok(cfg.includes(line), line);
  }
  assert.doesNotMatch(cfg, /humanSLProfile\s*=/, "the profile is set per request");
  const engineZig = fs.readFileSync(path.join(root, "src/engine.zig"), "utf8");
  assert.match(engineZig, /"-human-model", extra, "-config", resolved\.human_config/);
});

await test("v5: the strings are one block in four languages", () => {
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8");
  assert.equal(src.split("// v5 models").length, 2);
  const block = src.slice(src.indexOf("// v5 models"));
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("models."));
  assert.ok(keys.length >= 30);
  for (const k of keys) assert.ok(block.includes(`"${k}"`), `${k} outside the v5 block`);
  for (const k of ["models.title", "models.download", "models.cancel", "models.remove", "models.humanStyle", "models.unavailable", "models.error.generic"]) {
    for (const lang of LANG_IDS) assert.ok(MESSAGES[k][lang].trim(), `${k} ${lang}`);
  }
  // Placeholders agree across languages.
  for (const k of keys) {
    const holes = (v) => [...v.matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join();
    const en = holes(MESSAGES[k].en);
    for (const lang of LANG_IDS) assert.equal(holes(MESSAGES[k][lang]), en, `${k} ${lang}`);
  }
});

await test("v5: the packaged self-test checks the downloads only when the workflow asks", () => {
  const st = fs.readFileSync(path.join(root, "src/web/js/selftest.js"), "utf8");
  assert.match(st, /if \(cfg\.models\) await modelChecks\(checks, report\)/);
  for (const k of ["modelsResume", "modelsHuman", "modelsStrong", "modelsRemove"]) assert.ok(st.includes(`checks.${k} =`), k);
  const app = fs.readFileSync(path.join(root, "scripts/selftest-app.mjs"), "utf8");
  assert.match(app, /GOBAN_MODELS_DIR: modelsDir/);
  assert.match(app, /fs\.rmSync\(modelsDir/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8");
  assert.match(main, /GOBAN_SELFTEST_MODELS/);
  assert.match(main, /GOBAN_MODELS_DIR/);
});

if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} tests passed.`);
