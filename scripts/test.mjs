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

import { BLACK, WHITE, EMPTY, Game, coordLabel, formatPoints, territoryMap, treeLayout, RULESETS, DEFAULT_RULES, defaultKomi, handicapCompensation, normalizeRules, findSeki, rulesFromSgf } from "../src/web/js/rules.js";
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
import { analyse, anchorMap, egfExpected, egfNats, fitBT, goRLabel, humanStyleParams, mulberry32, profileGoR, wilson } from "./calibrate-strength.mjs";
import { enginePayload, parseInfo, parseVertex, positionPayload, katagoRules } from "../src/web/js/katago.js";
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
  MAX_GAME_RECORDS,
  addGameRecord,
  updateGameRecord,
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
import * as A11y from "../src/web/js/a11y.js";
import { PNG } from "pngjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Keys added after v6 live in src/web/js/messages/v7-*.js; the "one block"
// checks of earlier versions accept them there.
const LATER_KEYS = new Set(
  fs
    .readdirSync(path.join(root, "src/web/js/messages"))
    .filter((f) => /^v\d+-.*\.js$/.test(f))
    .flatMap((f) => [...fs.readFileSync(path.join(root, "src/web/js/messages", f), "utf8").matchAll(/^\s*"([^"]+)":\s*m\(/gm)].map((x) => x[1])),
);

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

await test("SGF columns are a..s with the i (FF[4]); pre-v7 Goban Studio records are read without it", () => {
  // Standard: i is the ninth column, j the tenth, s the nineteenth.
  const { game } = loadSGF("(;GM[1]FF[4]SZ[19];B[id];W[jd];B[sd])");
  const line = game.mainLine();
  assert.deepEqual([line[1].move.x, line[2].move.x, line[3].move.x], [8, 9, 18]);
  assert.equal(line[1].move.y, 3);
  const sgf = game.toSGF();
  assert.match(sgf, /;B\[id\];W\[jd\];B\[sd\]/);
  // Written by Goban Studio 6 or earlier: a..h, j..t.
  const old = loadSGF("(;GM[1]FF[4]AP[Goban Studio:6.0.0]SZ[19];B[jd];W[td])").game.mainLine();
  assert.deepEqual([old[1].move.x, old[2].move.x], [8, 18]);
  // Read back under the new rule, a re-saved old record keeps its moves.
  const again = loadSGF(loadSGF("(;GM[1]FF[4]AP[Goban Studio:5.1.0]SZ[19];B[jd];W[td])").game.toSGF()).game.mainLine();
  assert.deepEqual([again[1].move.x, again[2].move.x], [8, 18]);
  // Every bundled classic now loads without an illegal move.
  for (const c of CLASSICS) assert.deepEqual(loadSGF(c.sgf).warnings, [], c.id);
});

/* ------------------------------------------------------------ v5 rules */

/** A 9×9 board from rows of "X" (black), "O" (white) and "." (empty). */
function fromRows(rows, options = {}) {
  const game = new Game({ size: 9, ...options });
  const stones = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "X") stones.push({ x, y, color: BLACK });
    else if (c === "O") stones.push({ x, y, color: WHITE });
  }));
  game.setup(stones, BLACK);
  return game;
}

// Black wall on column E, White wall on column F: 36 / 27 points of
// territory, 9 stones each, no dame. A white stone sits dead at B8.
const WALLS = [
  "....XO...",
  ".O..XO...",
  "....XO...",
  "....XO...",
  "....XO...",
  "....XO...",
  "....XO...",
  "....XO...",
  "....XO...",
];

// Eye-versus-eye seki in the top-left corner: Black A9 B9 A8 (eye at the
// corner), White's group around it (eye at A6), one shared liberty at C9.
// Black's outer wall reaches column F, White's wall is column G.
const SEKI_BOARD = [
  ".X.OX.O..",
  "XXOOX.O..",
  "OOOXX.O..",
  ".OXX..O..",
  "OOX...O..",
  "XXX...O..",
  "......O..",
  "......O..",
  "......O..",
];
// Fill column F with black stones so the board is closed.
const SEKI_BOARD_CLOSED = SEKI_BOARD.map((row) => row.slice(0, 5) + "X" + row.slice(6));

await test("v5 rules: rulesets, defaults and handicap compensation", () => {
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

await test("v5 rules: area and territory scores of the same position", () => {
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

await test("v5 rules: Chinese handicap games give White N points for N stones", () => {
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

await test("v5 rules: seki has no territory under Japanese and Korean rules, and counts under Chinese", () => {
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

await test("v5 rules: unfilled dame between living groups is not seki", () => {
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

await test("v5 rules: SGF round trip keeps RU, komi and handicap for each ruleset", () => {
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
  // No RU (records before v5) is Japanese; a missing KM takes the ruleset's komi.
  const old = loadSGF("(;GM[1]FF[4]SZ[9];B[ee])").game;
  assert.equal(old.rules, "japanese");
  assert.equal(old.komi, 6.5);
  assert.equal(loadSGF("(;GM[1]FF[4]SZ[9]RU[Chinese];B[ee])").game.komi, 7.5);
});

await test("v5 rules: SGF import accepts Japanese, Chinese and Korean spellings and rejects the rest", () => {
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

await test("v5 rules: KataGo is told the game's rules on both bridge paths", async () => {
  // Async (structured) payload.
  const cn = new Game({ size: 9, rules: "chinese", handicap: 2 });
  cn.play(4, 4);
  const payload = positionPayload(cn);
  assert.equal(payload.rules, "chinese");
  // Komi is the game's own; KataGo adds the handicap compensation itself.
  assert.equal(payload.komi, 0.5);
  assert.equal(payload.setup, "B G7 B C3");
  assert.equal(positionPayload(new Game({ size: 9, rules: "korean" })).rules, "korean");
  assert.equal(positionPayload(new Game({ size: 9 })).rules, "japanese");
  assert.equal(katagoRules({}), "japanese");
  // White setup stones go first, so a set-up position is not read as a handicap.
  const pos = loadSGF("(;GM[1]FF[4]SZ[9]RU[Chinese]AB[aa][bb]AW[cc])").game;
  assert.equal(positionPayload(pos).setup, "W C7 B A9 B B8");

  // Sync (GTP script) path.
  const scripts = [];
  globalThis.zero = {
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test" };
      if (command === "studio.katagoAnalyze") {
        scripts.push(Buffer.from(payload.b64, "base64").toString("utf8"));
        return { ok: true, play: "C3", info: "info move C3 visits 10 winrate 0.6 scoreLead 3 order 0 pv C3" };
      }
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const K = await import("../src/web/js/katago.js?bridge-rules");
    for (const rules of ["japanese", "chinese", "korean"]) {
      await K.analyze(new Game({ size: 9, rules }), { visits: 8 });
      const script = scripts.at(-1);
      assert.match(script, new RegExp(`^kata-set-rules ${rules}$`, "m"));
      assert.equal(script.match(/kata-set-rules/g).length, 1);
      assert.match(script, new RegExp(`^komi ${defaultKomi(rules)}$`, "m"));
    }
  } finally {
    delete globalThis.zero;
  }
});

await test("v5 rules: the defaultRules setting and library records", () => {
  assert.equal(DEFAULT_SETTINGS.defaultRules, "japanese");
  removeKey(KEYS.settings);
  assert.equal(loadSettings().defaultRules, "japanese");
  writeJSON(KEYS.settings, { defaultRules: "chinese" });
  assert.equal(loadSettings().defaultRules, "chinese");
  writeJSON(KEYS.settings, { defaultRules: "aga" });
  assert.equal(loadSettings().defaultRules, "japanese");
  removeKey(KEYS.settings);
  const g = new Game({ size: 9, rules: "korean" });
  g.play(4, 4);
  assert.equal(Lib.describeGame(g).rules, "korean");
  assert.equal(Lib.recordRules({}), "japanese");
  assert.equal(Lib.recordRules({ rules: "chinese" }), "chinese");
  const messages = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(messages.match(/\/\/ v5 rules\r?\n/g)?.length, 1);
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
    "tip.opening.": ["1", "2", "3"],
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
  assert.ok(COURSE.length >= 13);
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
  const grades = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8").replace(/\r\n/g, "\n"));
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
  const model = JSON.parse(fs.readFileSync(path.join(root, "src/web/moka/go-model.json"), "utf8").replace(/\r\n/g, "\n"));
  assert.equal(model.architecture.boardSize, 9);
  assert.equal(fs.statSync(path.join(root, "src/web/moka/go-model.bin")).size, model.weightsBytes);
});

await test("design tokens meet the contrast rules in docs/design.md (light and dark)", () => {
  const css = fs.readFileSync(path.join(root, "src/web/styles.css"), "utf8").replace(/\r\n/g, "\n");
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
  const csv = fs.readFileSync(path.join(root, "docs/l10n/strings.csv"), "utf8").replace(/\r\n/g, "\n").replace(/^\ufeff/, "");
  const keys = csv.split("\n").slice(1).filter(Boolean).map((l) => JSON.parse(l.slice(0, l.indexOf('",') + 1)));
  assert.deepEqual(keys, Object.keys(MESSAGES), "run: node scripts/export-strings.mjs");
});

await test("v5: a backup carries every stored key and restores it", async () => {
  const P = await import("../src/web/js/persist.js");
  for (const k of Object.values(P.KEYS)) P.removeKey(k);
  P.writeJSON(P.KEYS.settings, { lang: "ko", boardSize: 13 });
  P.writeJSON(P.KEYS.progress, { lessons: { a: { done: true } }, problems: { p1: { solved: true }, p2: {} } });
  P.writeJSON(P.KEYS.library, { v: 2, games: [{ id: "g1" }, { id: "g2" }] });
  const doc = JSON.parse(JSON.stringify(P.exportBackup("5.0.0", new Date("2026-11-04T00:00:00Z"))));
  assert.equal(doc.app, "goban-studio");
  assert.deepEqual(P.checkBackup(doc).summary, { games: 2, lessons: 1, problems: 1, exportedAt: "2026-11-04T00:00:00.000Z", version: "5.0.0" });
  for (const k of Object.values(P.KEYS)) P.removeKey(k);
  assert.equal(P.restoreBackup(doc).ok, true);
  assert.equal(P.readJSON(P.KEYS.settings, {}).boardSize, 13);
  assert.equal(P.readJSON(P.KEYS.library, {}).games.length, 2);
  assert.equal(P.readJSON(P.KEYS.current, null), null);
  assert.equal(P.checkBackup({ app: "other" }).error, "notBackup");
  assert.equal(P.checkBackup({ ...doc, format: 99 }).error, "newerFormat");
  assert.equal(P.checkBackup({ ...doc, data: { ...doc.data, settings: "x" } }).error, "damaged");
});

await test("v6 ui: a tight problem window widens towards the open side", async () => {
  const { windowOf } = await import("../src/web/js/board.js");
  // A bottom-right corner problem on 19×19: grows up and left only.
  assert.deepEqual(windowOf({ x0: 13, y0: 13, x1: 18, y1: 18 }, 19), { x0: 10, y0: 10, x1: 18, y1: 18 });
  // A centred window grows on both sides.
  const w = windowOf({ x0: 8, y0: 8, x1: 10, y1: 10 }, 19);
  assert.equal(w.x1 - w.x0, 8);
  assert.ok(w.x0 >= 4 && w.x1 <= 14);
  // A wide window keeps its width; a 9×9 board never goes past its edges.
  assert.deepEqual(windowOf({ x0: 0, y0: 14, x1: 18, y1: 18 }, 19), { x0: 0, y0: 10, x1: 18, y1: 18 });
  assert.deepEqual(windowOf({ x0: 2, y0: 2, x1: 4, y1: 4 }, 9), { x0: 0, y0: 0, x1: 8, y1: 8 });
  assert.deepEqual(windowOf(null, 13), { x0: 0, y0: 0, x1: 12, y1: 12 });
});

await test("v5: a restore that cannot write leaves the old data in place", async () => {
  const P = await import("../src/web/js/persist.js");
  const doc = { app: "goban-studio", format: 1, version: "5.0.0", exportedAt: "2026-11-04T00:00:00.000Z", data: { settings: { lang: "ja" }, library: { v: 2, games: [{ id: "new" }] } } };
  const map = new Map();
  const full = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (k === P.KEYS.library && v.includes('"new"')) throw new Error("QuotaExceededError");
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: full, configurable: true, writable: true });
  try {
    P.writeJSON(P.KEYS.settings, { lang: "en" });
    P.writeJSON(P.KEYS.library, { v: 2, games: [{ id: "old" }] });
    P.writeJSON(P.KEYS.progress, { lessons: { a: { done: true } } });
    if (!P.checkBackup(doc).ok) throw new Error("fixture: " + P.checkBackup(doc).error);
    assert.deepEqual(P.restoreBackup(doc), { ok: false, error: "storage" });
    assert.equal(P.readJSON(P.KEYS.settings, {}).lang, "en");
    assert.equal(P.readJSON(P.KEYS.library, {}).games[0].id, "old");
    assert.equal(P.readJSON(P.KEYS.progress, {}).lessons.a.done, true);
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
});

await test("v5: removing a network retries while the engine is busy, without blocking", async () => {
  let calls = 0;
  const invoke = async (cmd) => {
    calls++;
    return calls < 3 ? { ok: false, error: "Busy", models: {} } : { ok: true, models: {} };
  };
  const r = await M.remove("human", { invoke, hasHost: true, sleep: async () => {} });
  assert.equal(r.ok, true);
  assert.equal(calls, 3);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /if \(!self\.katago\.stopSlot\(modelSlot\(kind\)\)\) return modelReply\(self, output, false, "Busy"\);/);
  const engine = fs.readFileSync(path.join(root, "src/engine.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(engine, /pub fn stopSlot\(self: \*Worker, slot: Slot\) bool \{\n\s+\/\/ Never wait on the worker/);
});

await test("static page inputs and build script are present", () => {
  for (const file of ["index.html", "styles.css", "js/main.jsx", "js/app/app.jsx"]) {
    assert.ok(fs.existsSync(path.join(root, "src/web", file)), `src/web/${file}`);
  }
  assert.ok(fs.existsSync(path.join(root, "scripts/bundle.mjs")));
  const html = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8").replace(/\r\n/g, "\n");
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
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  const zig = fs.readFileSync(path.join(root, "src/update.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /"studio\.checkUpdate"/);
  assert.match(main, /"studio\.openReleasePage"/);
  assert.match(zig, /releases_api_url = "https:\/\/api\.github\.com\/repos\/hxddh\/goban-studio\/releases\/latest"/);
  assert.match(zig, /releases_page_url = "https:\/\/github\.com\/hxddh\/goban-studio\/releases\/latest"/);
  // openReleasePage never reads the page's payload.
  const open = main.slice(main.indexOf("fn openReleasePage("), main.indexOf("fn spawnBrowser("));
  assert.match(open, /_ = invocation;/);
  assert.doesNotMatch(open, /payload/);
  // The page itself still cannot reach the network.
  const html = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8").replace(/\r\n/g, "\n");
  assert.match(html, /connect-src 'self'/);
  const zon = fs.readFileSync(path.join(root, "app.zon"), "utf8").replace(/\r\n/g, "\n");
  assert.match(zon, /external_links = \.\{ \.action = "deny" \}/);
  const messages = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(messages, /\/\/ v4 release\r?\n/);
  for (const key of ["update.check", "update.auto", "update.available", "update.current", "update.error", "update.unavailable", "update.download"]) assert.ok(MESSAGES[key], key);
});

await test("v4: release notes and package READMEs say how the build was really signed", () => {
  const v3 = fs.readFileSync(path.join(root, ".github/release-notes/v3.0.0.md"), "utf8").replace(/\r\n/g, "\n");
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
  const tour = fs.readFileSync(path.join(root, "src/web/js/tour.js"), "utf8").replace(/\r\n/g, "\n");
  const steps = tour.slice(tour.indexOf("export const STEPS"), tour.indexOf("async function waitForAck"));
  const names = [...steps.matchAll(/name: "([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["today", "game19", "review", "practice", "settings"]);
  for (const fn of ["C.goSpace(", "C.newGame(", "C.reviewCurrentGame(", "C.openSheet(\"settings\")"]) assert.ok(tour.includes(fn), fn);
  const app = fs.readFileSync(path.join(root, "src/web/js/app/app.jsx"), "utf8").replace(/\r\n/g, "\n");
  assert.match(app, /c\?\.tour && import\("\.\.\/tour\.js"\)/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /GOBAN_TOUR_OUT/);
  for (const wf of ["build-macos.yml", "build-windows.yml"]) {
    const y = fs.readFileSync(path.join(root, ".github/workflows", wf), "utf8").replace(/\r\n/g, "\n");
    assert.match(y, /scripts\/tour-app\.mjs/, wf);
    assert.match(y, wf.includes("macos") ? /native-screenshots-macos/ : /native-screenshots-windows/, wf);
  }
});

/* ------------------------------------------------------------------ v5 */

await test("v5: SGF comments and markup survive a round trip on every node", () => {
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

await test("v5: unknown SGF properties are kept on the root and on moves", () => {
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

await test("v5: a set-up position records who plays first, and move-less nodes fold into the move before", () => {
  const { game } = loadSGF("(;GM[1]FF[4]SZ[9]AB[aa][bb]AW[cc]PL[W];W[dd];C[a note]TR[ee];B[ff])");
  const line = game.mainLine();
  assert.equal(line.length, 3);
  assert.equal(line[1].comment, "a note");
  assert.deepEqual(line[1].marks, [{ x: 4, y: 4, type: "triangle" }]);
  const out = game.toSGF();
  assert.match(out, /PL\[W\]/);
  assert.equal(loadSGF(out).game.root.turn, WHITE);
});

await test("v5: marks toggle, replace and take the next free letter", () => {
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

function branchedGame() {
  // Main line 1-2-3-4-5; a variation at move 2 (2a-3a), one at move 4 (4b),
  // a second at move 2 (2c), and a sub-variation inside 2a (after 2a: 3x).
  const g = newGame(9);
  const ids = {};
  const at = (node) => g.goto(node.id);
  g.play(0, 0);
  ids[1] = g.current;
  g.play(1, 0);
  ids[2] = g.current;
  g.play(2, 0);
  ids[3] = g.current;
  g.play(3, 0);
  ids[4] = g.current;
  g.play(4, 0);
  ids[5] = g.current;
  at(ids[1]);
  g.play(1, 1);
  ids["2a"] = g.current;
  g.play(2, 1);
  ids["3a"] = g.current;
  at(ids["2a"]);
  g.play(2, 2);
  ids["3x"] = g.current;
  at(ids[3]);
  g.play(3, 3);
  ids["4b"] = g.current;
  at(ids[1]);
  g.play(1, 2);
  ids["2c"] = g.current;
  ids["2c"].comment = "idea";
  return { g, ids };
}

await test("v5: tree layout puts the main line on row 0 and nests variations without overlaps", () => {
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

await test("v5: deleting and promoting variations edit the tree and the SGF", () => {
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

await test("v5: progress gains bounded, validated per-game records (migrated from v4)", () => {
  for (const k of Object.values(KEYS)) removeKey(k);
  writeJSON(KEYS.progress, { problems: { a: { solved: true } }, rating: { r: 1200, games: 3, history: [{ at: 1, r: 1100 }, { at: 2, r: 1200 }] } });
  migrate();
  const raw = readJSON(KEYS.progress, {});
  assert.equal(raw.v, 5);
  assert.deepEqual(raw.games, []);
  assert.equal(raw.problems.a.solved, true, "nothing else changes");
  const p = loadProgress();
  assert.deepEqual(p.games, []);
  const rec = (i, extra = {}) => ({ id: "g" + i, at: 1000 + i, size: 9, color: -1, result: "W+3.5", won: true, phases: { opening: { loss: 1, mistakes: 0, blunders: 0, moves: 5 }, middle: { loss: "4" }, endgame: null }, themes: { ladder: 1, bad: -2 }, ...extra });
  for (let i = 0; i < MAX_GAME_RECORDS + 5; i++) addGameRecord(p, rec(i), { save: false });
  assert.equal(p.games.length, MAX_GAME_RECORDS);
  assert.equal(p.games[0].id, "g" + (MAX_GAME_RECORDS + 4), "newest first");
  const g0 = p.games[0];
  assert.deepEqual(g0.phases.middle, { loss: 4, mistakes: 0, blunders: 0, moves: 0, accuracy: null });
  assert.deepEqual(g0.phases.endgame, { loss: 0, mistakes: 0, blunders: 0, moves: 0, accuracy: null });
  assert.deepEqual(g0.themes, { ladder: 1 });
  assert.equal(g0.confidence, "low");
  assert.equal(g0.date.length, 10);
  // Replace by id, then patch.
  addGameRecord(p, rec(MAX_GAME_RECORDS + 4, { result: "B+R", won: false }), { save: false });
  assert.equal(p.games.length, MAX_GAME_RECORDS);
  assert.equal(p.games[0].won, false);
  updateGameRecord(p, p.games[0].id, { confidence: "high", themes: { cut: 2 } });
  assert.equal(loadProgress().games[0].confidence, "high");
  assert.deepEqual(loadProgress().games[0].themes, { cut: 2 });
  assert.equal(updateGameRecord(p, "missing", {}), null);
  // Junk in storage is dropped, not fatal.
  writeJSON(KEYS.progress, { v: 5, games: [null, { at: "x", size: 9 }, { at: 5, size: 7 }, { id: "ok", at: 5, size: 13 }, { id: "ok", at: 6, size: 13 }] });
  assert.deepEqual(loadProgress().games.map((g) => g.id), ["ok"]);
});

/* ------------------------------------------------------------ v5 updater */

await test("v5: without a native host the install API says unavailable and asks nothing", async () => {
  assert.equal(globalThis.zero, undefined);
  for (const call of [Host.updateStatus, () => Host.updateDownload("v9.0.0"), Host.updateCancel, Host.updateApply]) {
    assert.deepEqual(await call(), { ok: false, error: "unavailable" });
  }
  const info = await U.installInfo();
  assert.equal(info.can, false);
  assert.equal(info.blocked, "Unsupported");
  assert.deepEqual(await U.downloadNow("v9.0.0", { pollMs: 1 }), { ok: false, error: "Unsupported" });
  assert.deepEqual(await U.applyNow(), { ok: false, error: "Unsupported" });
});

await test("v5: install status, download replies and error explanations", () => {
  const s = U.interpretInstallStatus({ ok: true, phase: "downloading", tag: "v5.1.0", received: 50, total: 200, error: "", canInstall: true, blocked: "", justUpdated: false, installFailed: false });
  assert.equal(s.phase, "downloading");
  assert.equal(s.progress, 0.25);
  assert.equal(s.canInstall, true);
  assert.equal(U.interpretInstallStatus({ ok: true, phase: "downloading", received: 5, total: 0 }).progress, null, "unknown size");
  assert.equal(U.interpretInstallStatus({ ok: true, phase: "nonsense" }).phase, "idle");
  const ro = U.interpretInstallStatus({ ok: true, phase: "idle", canInstall: true, blocked: "ReadOnlyLocation" });
  assert.equal(ro.canInstall, false, "a block always wins");
  assert.equal(ro.blocked, "ReadOnlyLocation");
  assert.equal(U.interpretInstallStatus(null).phase, "unavailable");
  assert.equal(U.interpretInstallStatus({ ok: true, justUpdated: true }).justUpdated, true);

  assert.deepEqual(U.interpretDownloadReply({ ok: true, phase: "ready", tag: "v5.1.0", asset: "GobanStudio-macOS-arm64.zip" }), { ok: true, tag: "v5.1.0" });
  assert.deepEqual(U.interpretDownloadReply({ ok: false, error: "ChecksumMismatch" }), { ok: false, error: "ChecksumMismatch" });
  assert.deepEqual(U.interpretDownloadReply({ ok: false, error: "unavailable" }), { ok: false, error: "Unsupported" });
  assert.deepEqual(U.interpretDownloadReply("x"), { ok: false, error: "BadResponse" });

  assert.equal(U.installStatusOf("downloading"), "downloading");
  assert.equal(U.installStatusOf("verifying"), "downloading");
  assert.equal(U.installStatusOf("unpacking"), "downloading");
  assert.equal(U.installStatusOf("ready"), "ready");
  assert.equal(U.installStatusOf("installing"), "installing");
  assert.equal(U.installStatusOf("failed"), null);
  assert.deepEqual(["downloading", "verifying", "unpacking"].map(U.installStepOf), ["download", "verify", "unpack"]);

  // Every error the host can answer is explained in all four languages.
  for (const code of U.INSTALL_ERRORS) {
    const key = U.installMessageKey(code);
    assert.ok(MESSAGES[key], `${code} → ${key}`);
  }
  for (const code of U.INSTALL_BLOCKED) assert.equal(U.installFallsBack(code), true, code);
  for (const code of ["ChecksumMismatch", "NoAsset", "BadPackage"]) assert.equal(U.installFallsBack(code), true, code);
  for (const code of ["Network", "Stalled", "Cancelled", "Disk"]) assert.equal(U.installFallsBack(code), false, `${code} can be retried`);
  assert.equal(U.installMessageKey("ReadOnlyLocation"), "update.readOnly");
  assert.equal(U.installMessageKey("Translocated"), "update.translocated");
  assert.equal(U.formatBytes(512 * 1024), "512 KB");
  assert.equal(U.formatBytes(98.04 * 1024 * 1024), "98.0 MB");
});

await test("v5: a download reports progress until the host answers", async () => {
  const seen = [];
  let polls = 0;
  let finish;
  const download = (tag) => {
    assert.equal(tag, "v5.1.0");
    return new Promise((resolve) => (finish = resolve));
  };
  const status = async () => {
    polls++;
    const phase = polls < 3 ? "downloading" : polls < 4 ? "verifying" : "unpacking";
    if (polls === 5) finish({ ok: true, phase: "ready", tag: "v5.1.0", asset: "x" });
    return { ok: true, phase, tag: "v5.1.0", received: polls * 10, total: 100, canInstall: true };
  };
  const sleep = () => new Promise((r) => setImmediate(r));
  const result = await U.downloadNow("v5.1.0", { download, status, sleep, onProgress: (s) => seen.push([s.phase, s.received]) });
  assert.deepEqual(result, { ok: true, tag: "v5.1.0" });
  assert.deepEqual(seen.slice(0, 4), [
    ["downloading", 10],
    ["downloading", 20],
    ["verifying", 30],
    ["unpacking", 40],
  ]);
  const failed = await U.downloadNow("v5.1.0", { download: async () => ({ ok: false, error: "Stalled" }), status, sleep });
  assert.deepEqual(failed, { ok: false, error: "Stalled" });
  const threw = await U.downloadNow("v5.1.0", {
    download: async () => {
      throw new Error("bridge");
    },
    status,
    sleep,
  });
  assert.deepEqual(threw, { ok: false, error: "Network" });
  assert.deepEqual(await U.applyNow({ apply: async () => ({ ok: true, phase: "installing" }) }), { ok: true });
  assert.deepEqual(await U.applyNow({ apply: async () => ({ ok: false, error: "ReadOnlyLocation" }) }), { ok: false, error: "ReadOnlyLocation" });
});

await test("v5: the interface goes available → downloading → ready → installing through the host", async () => {
  const calls = [];
  let phase = "idle";
  const host = {
    "studio.checkUpdate": () => ({ ok: true, latest: "v99.0.0", url: "https://github.com/hxddh/goban-studio/releases/tag/v99.0.0", notes: "New", publishedAt: "" }),
    "studio.updateStatus": () => ({ ok: true, phase, tag: "v99.0.0", received: 3, total: 6, error: "", canInstall: true, blocked: "", justUpdated: false, installFailed: false }),
    "studio.updateDownload": async (p) => {
      assert.deepEqual(p, { tag: "v99.0.0" }, "the page names only the tag, never a URL");
      phase = "downloading";
      await new Promise((r) => setTimeout(r, 30));
      phase = "ready";
      return { ok: true, phase: "ready", tag: "v99.0.0", asset: "GobanStudio-macOS-arm64.zip" };
    },
    "studio.updateCancel": () => ({ ok: true, phase: "idle" }),
    "studio.updateApply": () => ({ ok: true, phase: "installing" }),
  };
  globalThis.zero = {
    invoke: async (command, payload) => {
      calls.push(command);
      if (!host[command]) throw new Error(`unknown command ${command}`);
      return host[command](payload);
    },
  };
  try {
    const store = await import("../src/web/js/app/store.js");
    const C = await import("../src/web/js/app/update-ctl.js");
    store.state.settings = { autoUpdateCheck: false };
    const found = await C.checkForUpdates({ quiet: true });
    assert.equal(found.status, "available");
    assert.deepEqual(found.install, { can: true, blocked: "" });
    const pending = C.downloadUpdate();
    assert.equal(store.state.updateCheck.status, "downloading");
    assert.equal(store.state.updateCheck.notes, "New", "the release notes stay on screen");
    assert.equal((await pending).status, "ready");
    assert.equal(store.state.updateCheck.latest, "v99.0.0");
    // Discarding the download goes back to "available".
    await C.cancelUpdate();
    assert.equal(store.state.updateCheck.status, "available");
    phase = "idle";
    await C.downloadUpdate();
    assert.equal(store.state.updateCheck.status, "ready");
    await C.applyUpdate();
    assert.equal(store.state.updateCheck.status, "installing");
    assert.ok(calls.includes("studio.updateApply"));

    // A read-only installation never downloads: it explains and falls back.
    host["studio.updateStatus"] = () => ({ ok: true, phase: "idle", tag: "", received: 0, total: 0, error: "", canInstall: false, blocked: "ReadOnlyLocation" });
    store.state.updateCheck = null;
    const ro = await C.checkForUpdates({ quiet: true });
    assert.deepEqual(ro.install, { can: false, blocked: "ReadOnlyLocation" });
    const before = calls.filter((c) => c === "studio.updateDownload").length;
    await C.downloadUpdate();
    assert.equal(calls.filter((c) => c === "studio.updateDownload").length, before);

    // A failed download returns to "available" with the reason.
    host["studio.updateStatus"] = () => ({ ok: true, phase: "idle", canInstall: true, blocked: "" });
    host["studio.updateDownload"] = async () => ({ ok: false, error: "ChecksumMismatch" });
    store.state.updateCheck = null;
    await C.checkForUpdates({ quiet: true });
    const bad = await C.downloadUpdate();
    assert.equal(bad.status, "available");
    assert.equal(bad.installError, "ChecksumMismatch");

    // After a restart: the new version says so; a rolled-back one says that.
    host["studio.updateStatus"] = () => ({ ok: true, phase: "idle", canInstall: true, blocked: "", justUpdated: true });
    const restored = await C.restoreUpdateState();
    assert.equal(restored.justUpdated, true);
    assert.ok(store.state.toasts.some((x) => x.message === t("update.installed", [APP_VERSION])));
  } finally {
    delete globalThis.zero;
  }
});

await test("v5: the native install commands are fixed to this repository's release downloads", () => {
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  const zig = fs.readFileSync(path.join(root, "src/install.zig"), "utf8").replace(/\r\n/g, "\n");
  for (const cmd of ["studio.updateStatus", "studio.updateCancel", "studio.updateDownload", "studio.updateApply"]) assert.match(main, new RegExp(`"${cmd.replace(".", "\\.")}"`), cmd);
  assert.match(zig, /download_prefix = "https:\/\/github\.com\/hxddh\/goban-studio\/releases\/download\/"/);
  // The page's payload carries a tag and nothing else; no URL is ever read from it.
  const payload = main.slice(main.indexOf("const DownloadPayload"), main.indexOf("fn updateDownload("));
  assert.match(payload, /tag: \[\]const u8/);
  assert.doesNotMatch(payload, /url|path/i);
  // Every asset this app can install is one the release publishes.
  const release = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  for (const asset of ["GobanStudio-macOS-arm64.zip", "GobanStudio-macOS-x64.zip", "GobanStudio-Windows-x64.zip", "SHA256SUMS"]) {
    assert.ok(zig.includes(`"${asset}"`) || asset === "SHA256SUMS", asset);
    assert.ok(release.includes(asset), `release.yml publishes ${asset}`);
  }
  // The helpers are embedded in the app, not downloaded.
  assert.match(zig, /@embedFile\("updater\/apply-macos\.sh"\)/);
  assert.match(zig, /@embedFile\("updater\/apply-windows\.ps1"\)/);
  const messages = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(messages.split("// v5 updater\n").length, 2, "one v5 updater block");
  for (const key of ["update.install", "update.restart", "update.ready", "update.installed", "update.rolledBack", "update.readOnly"]) assert.ok(MESSAGES[key], key);
});

await test("v5: both platform builds test the update helpers, and an Intel Mac build is released", () => {
  const mac = fs.readFileSync(path.join(root, ".github/workflows/build-macos.yml"), "utf8").replace(/\r\n/g, "\n");
  const win = fs.readFileSync(path.join(root, ".github/workflows/build-windows.yml"), "utf8").replace(/\r\n/g, "\n");
  const release = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8").replace(/\r\n/g, "\n");
  for (const y of [mac, win]) assert.match(y, /scripts\/test-updater\.mjs/);
  assert.match(release, /macos-15-intel/);
  assert.match(release, /GobanStudio-macOS-x64\.dmg/);
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8").replace(/\r\n/g, "\n");
  assert.match(readme, /GobanStudio-macOS-x64\.dmg/);
  assert.match(readme, /Windows on ARM/);
  const status = { macos: Sign.normalizeStatus("macos", { mode: "adhoc" }), win: Sign.normalizeStatus("windows", {}) };
  const table = Sign.firstLaunchTable(status.macos, status.win, status.macos);
  assert.match(table, /\| macOS \(Intel\) \| `GobanStudio-macOS-x64\.dmg`/);
  assert.equal(Sign.firstLaunchTable(status.macos, status.win).split("\n").length, 4, "without an Intel status the table keeps its v4 rows");
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
  // v7: beginner moves fall up the ladder within each style (the search
  // style at 5k needs its own to play at the level, docs/strength.md v7).
  const prevBlunder = { raw: Infinity, search: Infinity };
  for (const s of STRENGTHS) {
    assert.ok(s.human && valid(s.human.profile), s.id);
    assert.ok(!s.human.style || ["raw", "search"].includes(s.human.style), s.id);
    const v = strengthOf(s.human.profile);
    assert.ok(v >= prev, `${s.id}: profile weaker than the level below`);
    const b = s.human.blunder ?? 0;
    const style = s.human.style || "raw";
    assert.ok(b <= prevBlunder[style], `${s.id}: more beginner moves than the level below`);
    if (style === "raw") assert.ok(b < s.blunder || s.blunder === 0, `${s.id}: human style adds no beginner moves of its own`);
    prev = v;
    prevBlunder[style] = b;
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
  const zig = fs.readFileSync(path.join(root, "src/models.zig"), "utf8").replace(/\r\n/g, "\n");
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
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  for (const name of ["studio.modelStatus", "studio.modelDownload", "studio.modelCancel", "studio.modelRemove"]) assert.ok(main.includes(`"${name}"`), name);
  // The page names a kind; the payload has no URL or path field.
  assert.match(main, /const ModelPayload = struct \{\n    kind: \[\]const u8 = "",\n\};/);
  // The human process: the shipped config, KataGo's human recipe, Black's view.
  const cfg = fs.readFileSync(path.join(root, "engine/model/human.cfg"), "utf8").replace(/\r\n/g, "\n");
  for (const line of ["humanSLChosenMoveProp = 1.0", "humanSLChosenMoveIgnorePass = true", "reportAnalysisWinratesAs = BLACK", "ignorePreRootHistory = false", "allowResignation = false", "ponderingEnabled = false"]) {
    assert.ok(cfg.includes(line), line);
  }
  assert.doesNotMatch(cfg, /humanSLProfile\s*=/, "the profile is set per request");
  const engineZig = fs.readFileSync(path.join(root, "src/engine.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(engineZig, /"-human-model", extra, "-config", resolved\.human_config/);
});

await test("v5: the calibration harness sends the app's own human-style parameters", () => {
  const p = humanStyleParams();
  assert.equal(p.raw.length, 9);
  assert.deepEqual(p.raw.map(([k]) => k), p.search.map(([k]) => k));
  assert.deepEqual(Object.fromEntries(p.search).humanSLChosenMovePiklLambda, "0.08");
  // The raw style is the shipped human.cfg's starting point.
  const cfg = fs.readFileSync(path.join(root, "engine/model/human.cfg"), "utf8").replace(/\r\n/g, "\n");
  for (const [k, v] of p.raw) assert.equal(Number(new RegExp(`^${k} = (\\S+)`, "m").exec(cfg)?.[1]), Number(v), k);
});

await test("v5: the strings are one block in four languages", () => {
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(src.split("// v5 models").length, 2);
  const block = src.slice(src.indexOf("// v5 models"));
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("models."));
  assert.ok(keys.length >= 30);
  for (const k of keys) assert.ok(block.includes(`"${k}"`) || LATER_KEYS.has(k), `${k} outside the v5 block`);
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
  const st = fs.readFileSync(path.join(root, "src/web/js/selftest.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(st, /if \(cfg\.models\) await modelChecks\(checks, report, cfg\)/);
  for (const k of ["modelsResume", "modelsHuman", "modelsStrong", "modelsRemove"]) assert.ok(st.includes(`checks.${k} =`), k);
  const app = fs.readFileSync(path.join(root, "scripts/selftest-app.mjs"), "utf8").replace(/\r\n/g, "\n");
  assert.match(app, /GOBAN_MODELS_DIR: modelsDir/);
  assert.match(app, /fs\.rmSync\(modelsDir/);
  const main = fs.readFileSync(path.join(root, "src/main.zig"), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /GOBAN_SELFTEST_MODELS/);
  assert.match(main, /GOBAN_MODELS_DIR/);
});

/* --------------------------------------------------------------- v6 report */

const R = await import("../src/web/js/app/report-model.js");
const { addMistake } = await import("../src/web/js/persist.js");

/**
 * A 13×13 game of 80 moves with no captures (Black fills the top rows,
 * White the bottom) and a whole-game analysis where each listed move loses
 * the given points; the engine's best move is always the empty 7-7 point.
 */
function reportGame({ losses = {}, source = "katago", result = "W+R" } = {}) {
  const size = 13;
  const game = new Game({ size, komi: 6.5 });
  const bl = [];
  const wh = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < size; x++) bl.push([x, y]);
  for (let y = 12; y > 6; y--) for (let x = 0; x < size; x++) wh.push([x, y]);
  for (let i = 0; i < 40; i++) {
    assert.ok(game.play(...bl[i]).ok);
    assert.ok(game.play(...wh[i]).ok);
  }
  if (result) game.setResult(result);
  const line = game.mainLine();
  const lead = [0];
  for (let i = 1; i < line.length; i++) lead[i] = lead[i - 1] + (line[i].move.color === BLACK ? -(losses[i] || 0) : losses[i] || 0);
  const best = { x: 6, y: 6 };
  const points = line.map((n, i) =>
    source === "katago"
      ? { source, winrate: 0.5, scoreLead: lead[i], best, pv: [best], moves: [{ ...best, visits: 20, scoreLead: lead[i] }], ownership: null }
      : { source, winrate: 0.5, scoreLead: lead[i], best: null, pv: [], ownership: null },
  );
  return { game, points };
}

await test("v6 report: the model has the result, the three phases and three key moments", () => {
  const { game, points } = reportGame({ losses: { 5: 3, 25: 8, 30: 4, 79: 2.5 } });
  const m = R.buildReport({ game, points, humanColor: BLACK, at: 1 });
  assert.equal(m.v, R.REPORT_VERSION);
  assert.equal(m.confidence, "high");
  assert.deepEqual([m.result, m.won, m.size, m.moves, m.rules, m.komi], ["W+R", false, 13, 80, game.rules, 6.5]);
  assert.deepEqual(m.players, ["black"]);
  assert.deepEqual(m.phases.map((p) => [p.id, p.from, p.to]), [["opening", 1, 20], ["middle", 21, 75], ["endgame", 76, 80]]);
  assert.deepEqual([m.phases[1].players.black.loss, m.phases[1].players.black.blunders], [8, 1]);
  assert.deepEqual([m.totals.black.loss, m.totals.black.mistakes, m.totals.black.blunders], [13.5, 2, 1]);
  assert.ok(m.takeaways.length > 0 && m.takeaways.every((tk) => tk.kind !== "estimate" && tk.key));
  // The player's three costliest moves, in game order, with the position before each.
  assert.deepEqual(m.moments.map((mo) => mo.index), [5, 25, 79]);
  const mo = m.moments[1];
  assert.deepEqual([mo.color, mo.loss, mo.best], [BLACK, 8, { x: 6, y: 6 }]);
  assert.equal(mo.thumb.length, 169);
  assert.equal(mo.thumb, R.thumbOf(game.mainLine()[24].board.signMap));
  assert.equal(mo.thumb[mo.played.y * 13 + mo.played.x], ".", "the move is not on the board yet");
  // It is plain JSON (it is stored with the library record) and knows its game.
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  assert.ok(R.reportFits(m, game));
  const longer = loadSGF(game.toSGF()).game;
  assert.ok(R.reportFits(m, longer), "the same moves read back from SGF");
  longer.goto(longer.mainLine().at(-1).id);
  longer.current.result = null;
  longer.play(6, 6, { force: true });
  assert.equal(R.reportFits(m, longer), false, "an edited main line needs a new report");
  assert.equal(R.reportFits({ ...m, v: 0 }, game), false);
  // A game between two people describes both sides; a won game says so.
  const both = R.buildReport({ game, points, humanColor: null });
  assert.deepEqual([both.players, both.won, both.moments.length], [["black", "white"], null, 3]);
  const won = reportGame({ result: "B+3.5" });
  assert.equal(R.buildReport({ ...won, humanColor: BLACK }).won, true);
  assert.equal(R.buildReport({ ...won, humanColor: WHITE }).won, false);
});

await test("v6 report: the low-confidence offline estimate shows turning points, not numbers", () => {
  const { game, points } = reportGame({ losses: { 25: 8, 27: 5 }, source: "estimate" });
  const m = R.buildReport({ game, points, humanColor: BLACK });
  assert.equal(m.confidence, "low");
  assert.equal(m.phases, null, "no per-phase numbers from an estimate");
  assert.equal(m.totals, null);
  assert.deepEqual(m.takeaways, []);
  assert.deepEqual(m.moments.map((mo) => mo.index), [25, 27]);
  for (const mo of m.moments) assert.deepEqual([mo.best, mo.loss, mo.why, mo.theme, mo.accept], [null, null, null, null, []]);
  // Nothing to practise without KataGo's better move.
  assert.deepEqual(R.drillMoments(m), []);
  assert.deepEqual(R.reportDrills(m, { sgf: game.toSGF(), gameKey: "g1", existing: [] }), { add: [], have: [] });
  // The estimate's tempo bias (the mover gains about a point each move) is not a turning point.
  const tempo = reportGame({ source: "estimate" });
  tempo.points.forEach((p, i) => (p.scoreLead = i % 2 ? 1.2 : -0.2));
  assert.deepEqual(R.turningPoints(tempo.game, tempo.points, BLACK), []);
  // No analysis at all.
  const none = R.buildReport({ game, points: points.map(() => null), humanColor: BLACK });
  assert.deepEqual([none.confidence, none.phases, none.moments], ["none", null, []]);
});

await test("v6 report: practising a game adds its worst mistakes as drills, never twice", () => {
  const { game, points } = reportGame({ losses: { 5: 3, 25: 8, 41: 1.5, 79: 2.5 } });
  const m = R.buildReport({ game, points, humanColor: BLACK });
  const sgf = game.toSGF();
  // Worst first; 1.5 points is not a mistake.
  assert.deepEqual(R.drillMoments(m).map((mo) => mo.index), [25, 5, 79]);
  const progress = { mistakes: [] };
  const first = R.reportDrills(m, { sgf, gameKey: "rec-1", existing: progress.mistakes });
  assert.deepEqual(first.add.map((d) => d.id), ["rec-1-25", "rec-1-5", "rec-1-79"]);
  assert.deepEqual(first.have, []);
  const d = first.add[0];
  assert.deepEqual([d.gameKey, d.index, d.sgf, d.color, d.best, d.loss, d.size], ["rec-1", 25, sgf, BLACK, { x: 6, y: 6 }, 8, 13]);
  assert.deepEqual(d.played, m.moments[1].played);
  assert.ok(d.accept.some((p) => p.x === 6 && p.y === 6));
  for (const e of first.add) addMistake(progress, e);
  assert.equal(progress.mistakes.length, 3);
  // Again: nothing new, the three are found.
  const again = R.reportDrills(m, { sgf, gameKey: "rec-1", existing: progress.mistakes });
  assert.deepEqual(again.add, []);
  assert.deepEqual(again.have.sort(), ["rec-1-25", "rec-1-5", "rec-1-79"]);
  // A drill made from the review under another key is the same position.
  const fromReview = [{ id: "game-7-25", gameKey: "game-7", index: 25, sgf }];
  const mixed = R.reportDrills(m, { sgf, gameKey: "rec-1", existing: fromReview });
  assert.deepEqual(mixed.add.map((x) => x.index), [5, 79]);
  assert.deepEqual(mixed.have, ["game-7-25"]);
  // At most three, and a clean game has none.
  const many = reportGame({ losses: { 3: 3, 5: 4, 7: 5, 9: 6 } });
  assert.ok(R.drillMoments(R.buildReport({ ...many, humanColor: BLACK })).length <= R.MAX_DRILLS);
  const clean = reportGame();
  assert.deepEqual(R.drillMoments(R.buildReport({ ...clean, humanColor: BLACK })), []);
});

await test("v6 report: the report is stored with its library record without moving it", () => {
  Lib.clearLibrary();
  const a = Lib.saveGame(reportGame().game, { name: "a" });
  const b = Lib.saveGame(reportGame({ result: "B+2.5" }).game, { name: "b" });
  const order = Lib.listGames().map((g) => g.id);
  assert.ok(Lib.patchGame(a.id, { report: { v: 1, lineKey: "x" } }));
  assert.deepEqual(Lib.listGames().map((g) => g.id), order);
  assert.deepEqual(Lib.getGame(a.id).report, { v: 1, lineKey: "x" });
  assert.equal(Lib.getGame(b.id).report, undefined);
  // Saving the game again (review edits) keeps the report; reportFits decides if it still holds.
  Lib.saveGame(reportGame().game, { id: a.id });
  assert.deepEqual(Lib.getGame(a.id).report, { v: 1, lineKey: "x" });
  assert.equal(Lib.patchGame("nope", { report: {} }), null);
  Lib.clearLibrary();
});

await test("v6 report: the strings are one block in four languages", () => {
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(src.split("// v6 report").length, 2);
  const block = src.slice(src.indexOf("// v6 report"), src.indexOf("// end v6 report"));
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("report."));
  assert.ok(keys.length >= 20);
  for (const k of keys) {
    assert.ok(block.includes(`"${k}"`) || LATER_KEYS.has(k), `${k} outside the v6 block`);
    const holes = (v) => [...v.matchAll(/\{(\d)\}/g)].map((x) => x[1]).sort().join();
    for (const lang of LANG_IDS) {
      assert.ok(MESSAGES[k][lang].trim(), `${k} ${lang}`);
      assert.equal(holes(MESSAGES[k][lang]), holes(MESSAGES[k].en), `${k} ${lang}`);
    }
  }
  // The result card leads to the report after a rated game; Library rows offer it.
  const play = fs.readFileSync(path.join(root, "src/web/js/app/play.jsx"), "utf8");
  assert.match(play, /kind="primary" icon="chart"[^>]*onClick=\{C\.openCurrentReport\}/);
  const lib = fs.readFileSync(path.join(root, "src/web/js/app/library.jsx"), "utf8");
  assert.match(lib, /C\.openReport\(g\.id, \{ space: "library" \}\)/);
});

await test("v6 report: a stored report no longer fits once the result changes", () => {
  const { game, points } = reportGame({ losses: { 25: 8 }, result: null });
  const m = R.buildReport({ game, points, humanColor: BLACK, at: 1 });
  assert.ok(R.reportFits(m, game), "the unfinished game");
  game.setResult("W+R");
  assert.ok(!R.reportFits(m, game), "resigned with no new move: the old report is stale");
  assert.ok(R.reportFits(R.buildReport({ game, points, humanColor: BLACK, at: 2 }), game));
});

/* ------------------------------------------------------------ v6 a11y */

// A small 9×9 position, rows as drawn (y = 0 is row 9 at the top):
// black D6 E6 (a group of two), white F6 in atari from black G6 and F7.
function a11yBoard() {
  const b = Array.from({ length: 9 }, () => new Array(9).fill(0));
  const put = (coord, c) => {
    const x = "ABCDEFGHJ".indexOf(coord[0]);
    const y = 9 - Number(coord.slice(1));
    b[y][x] = c;
  };
  for (const p of ["D6", "E6", "G6", "F7"]) put(p, BLACK);
  put("F6", WHITE);
  put("J1", WHITE);
  return b;
}

await test("v6 a11y: points read their coordinate (no I), stone, group and liberties", () => {
  setLang("en");
  const b = a11yBoard();
  assert.equal(A11y.coordName(8, 0, 9), "J9");
  assert.equal(A11y.coordName(3, 15, 19), "D4");
  assert.equal(A11y.pointText(b, 0, 0), "A9, empty");
  assert.equal(A11y.pointText(b, 3, 3), "D6, black");
  assert.equal(A11y.pointText(b, 3, 3, { detail: true }), "D6, black, group of 2, 5 liberties");
  assert.equal(A11y.pointText(b, 5, 3, { detail: true }), "F6, white, 1 liberty, in atari");
  assert.equal(A11y.pointText(b, 8, 8, { detail: true, last: { x: 8, y: 8, color: WHITE } }), "J1, white, last move, 2 liberties");
  assert.equal(A11y.pointText(b, 0, 0, { marked: true }), "A9, empty, marked");
  assert.deepEqual(A11y.groupAt(b, 4, 3).stones.length, 2);
  assert.equal(A11y.groupAt(b, 0, 0), null);
  setLang("zh");
  assert.equal(A11y.pointText(b, 5, 3, { detail: true }), "F6，白子，只剩 1 口气，被打吃");
  setLang("ja");
  assert.equal(A11y.pointText(b, 3, 3, { detail: true }), "D6、黒石、2子のかたまり、呼吸点 5つ");
  setLang("ko");
  assert.equal(A11y.pointText(b, 0, 0), "A9, 빈 점");
  setLang("en");
});

await test("v6 a11y: moves, captures, passes and the computer's move are announced", () => {
  setLang("en");
  assert.equal(A11y.moveText({ color: BLACK, x: 3, y: 15, size: 19 }), "Black D4");
  assert.equal(A11y.moveText({ color: WHITE, x: 15, y: 3, size: 19, captured: 2 }), "White Q16, captures 2");
  assert.equal(A11y.moveText({ color: WHITE, pass: true }), "White passes");
  assert.equal(A11y.moveText({ color: WHITE, x: 15, y: 3, size: 19, computer: true }), "Computer: White Q16");
  setLang("zh");
  assert.equal(A11y.moveText({ color: BLACK, x: 3, y: 15, size: 19, captured: 1 }), "黑 D4，提 1 子");
  assert.equal(A11y.moveText({ color: BLACK, pass: true }), "黑停一手");
  setLang("ko");
  assert.equal(A11y.moveText({ color: WHITE, x: 15, y: 3, size: 19, computer: true }), "컴퓨터: 백 Q16");
  setLang("ja");
  assert.equal(A11y.moveText({ color: BLACK, x: 3, y: 15, size: 19, captured: 3 }), "黒 D4、3子取る");
  setLang("en");
});

await test("v6 a11y: review steps say the move number and, with analysis, the point loss", () => {
  setLang("en");
  const move = { color: BLACK, x: 3, y: 15 };
  assert.equal(A11y.reviewMoveText({ number: 0 }), "Start of the game");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19 }), "Move 12, Black D4");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: 3.4 }), "Move 12, Black D4, loses about 3.5 points");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: -0.6 }), "Move 12, Black D4, no loss");
  assert.equal(A11y.reviewMoveText({ number: 7, move, size: 19, captured: 1, loss: 0.2 }), "Move 7, Black D4, captures 1, no loss");
  setLang("zh");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: 3 }), "第 12 手，黑 D4，约亏 3 目");
  setLang("ja");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: 3 }), "12手目、黒 D4、約3目の損");
  setLang("en");
});

await test("v6 a11y: rows, columns and the whole board are read stone by stone", () => {
  setLang("en");
  const b = a11yBoard();
  assert.equal(A11y.rowText(b, 3), "Row 6: black D, E, G; white F");
  assert.equal(A11y.rowText(b, 0), "Row 9: empty");
  assert.equal(A11y.columnText(b, 5), "Column F: black 7; white 6");
  assert.equal(A11y.boardText(b), "Stones: black 4, white 2. Row 7: black F. Row 6: black D, E, G; white F. Row 1: white J");
  // A problem window reads only what is on screen.
  assert.equal(A11y.boardText(b, { view: { x0: 6, y0: 6, x1: 8, y1: 8 } }), "Stones: black 0, white 1. Row 1: white J");
  assert.equal(A11y.boardText(Array.from({ length: 9 }, () => new Array(9).fill(0))), "The board is empty");
  setLang("zh");
  assert.equal(A11y.rowText(b, 3), "第 6 行：黑子 D、E、G；白子 F");
  setLang("ko");
  assert.equal(A11y.rowText(b, 3), "6줄: 흑돌 D, E, G; 백돌 F");
  setLang("en");
});

await test("v6 a11y: turn, captured stones, last move and the board's name", () => {
  setLang("en");
  assert.equal(A11y.turnText(WHITE), "White to play");
  assert.equal(A11y.capturesText(3, 1), "Black has captured 3, White 1");
  assert.equal(A11y.lastMoveText(null, 19), "No moves yet");
  assert.equal(A11y.lastMoveText({ color: BLACK, x: 15, y: 3 }, 19), "Last move: Black Q16");
  assert.equal(A11y.lastMoveText({ color: WHITE, pass: true }, 19), "Last move: White passes");
  assert.equal(A11y.boardName(13), "Go board, 13 by 13");
  setLang("zh");
  assert.equal(A11y.turnText(BLACK), "轮到黑下");
  assert.equal(A11y.boardName(19), "19 路棋盘");
  setLang("en");
});

await test("v6 a11y: every a11y string exists in four languages with the same placeholders", () => {
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("a11y."));
  assert.ok(keys.length > 40, `only ${keys.length} a11y strings`);
  const holes = (v) => [...new Set([...v.matchAll(/\{(\d)\}/g)].map((m) => m[1]))].sort().join();
  for (const k of keys) for (const lang of LANG_IDS) {
    assert.ok(MESSAGES[k][lang].length, `${k} ${lang}`);
    assert.equal(holes(MESSAGES[k][lang]), holes(MESSAGES[k].en), `${k} ${lang}`);
  }
  // The shortcuts sheet documents the board keys, in every language.
  for (const lang of LANG_IDS) {
    setLang(lang);
    for (const [k, v] of [...A11y.boardKeyRows(), ...A11y.a11yKeyRows()]) assert.ok(k && v && !v.startsWith("a11y."), `${lang}: ${k}`);
  }
  setLang("en");
  const app = fs.readFileSync(path.join(root, "src/web/js/app/announcer.js"), "utf8");
  for (const key of ["i", "m", "t", "c", "r", "k", "b"]) assert.ok(app.includes(`case "${key}":`), `board key ${key}`);
});

/* ------------------------------------------------------------ v6 advanced */

await test("v6 advanced: the advanced units follow the intermediate ones and keep every earlier lesson id", () => {
  const levels = COURSE.map((u) => u.level || "beginner");
  const order = ["beginner", "intermediate", "advanced"];
  for (let i = 1; i < levels.length; i++) assert.ok(order.indexOf(levels[i]) >= order.indexOf(levels[i - 1]), `unit ${COURSE[i].id} out of order`);
  const adv = COURSE.filter((u) => u.level === "advanced");
  assert.ok(adv.length >= 4 && adv.length <= 6, `${adv.length} advanced units`);
  const lessons = adv.flatMap((u) => u.lessons);
  assert.ok(lessons.length >= 15 && lessons.length <= 20, `${lessons.length} advanced lessons`);
  for (const l of lessons) assert.match(l.id, /^adv-/);
  // The beginner and intermediate lessons are unchanged and come first.
  const before = COURSE.filter((u) => u.level !== "advanced").flatMap((u) => u.lessons.map((l) => l.id));
  for (const id of ["stones-board", "game-dead", "opening-corner-points", "fight-split"]) assert.ok(before.includes(id), id);
  const all = COURSE.flatMap((u) => u.lessons.map((l) => l.id));
  assert.deepEqual(all.slice(0, before.length), before);
  // Every advanced problem step proves under validate() (check-course does too).
  for (const l of lessons)
    for (const st of l.steps)
      if (st.kind === "problem") {
        const v = S.validate(S.createPuzzle(st.problem));
        assert.ok(v.ok, `${l.id}: ${v.reasons.join("; ")}`);
        if (st.problem.ko === "ok") assert.equal(v.result, "ko", l.id);
        if (st.problem.goal === "seki") assert.equal(v.result, "seki", l.id);
      }
});

await test("v6 advanced: the next lesson sends players of about 5 kyu and stronger to the advanced course", async () => {
  const { pickNextLesson, ADVANCED_RANK } = await import("../src/web/js/app/course-path.js");
  assert.equal(ADVANCED_RANK, 5);
  const all = [];
  for (const unit of COURSE) for (const lesson of unit.lessons) all.push({ unit, lesson });
  const firstOf = (level) => all.find((x) => (x.unit.level || "beginner") === level).lesson.id;
  const none = () => false;
  const next = (done, who) => pickNextLesson(all, (id) => done.has(id), who)?.lesson.id;
  // A new player starts at the beginning; a 10 kyu player at the intermediate course.
  assert.equal(next(new Set(), { experience: "new", playerRank: 30 }), firstOf("beginner"));
  assert.equal(next(new Set(), { experience: "player", playerRank: 10 }), firstOf("intermediate"));
  // 5 kyu, 3 kyu and 2 dan who skipped the intermediate course go to the advanced one.
  for (const playerRank of [5, 3, -1]) assert.equal(pickNextLesson(all, none, { experience: "player", playerRank }).lesson.id, firstOf("advanced"), `rank ${playerRank}`);
  // The rating from games counts as the estimate: a 10 kyu self-assessment rated 4 kyu.
  assert.equal(next(new Set(), { experience: "player", playerRank: 10, rating: 1700 }), firstOf("advanced"));
  // ... and a 5 kyu self-assessment whose games say 9 kyu stays in the intermediate course.
  assert.equal(next(new Set(), { experience: "player", playerRank: 5, rating: 1200 }), firstOf("intermediate"));
  // Part way through the intermediate course: finish it first.
  const mids = all.filter((x) => x.unit.level === "intermediate").map((x) => x.lesson.id);
  assert.equal(next(new Set(mids.slice(0, 2)), { experience: "player", playerRank: 4 }), mids[2]);
  // Finished it: on to the advanced course, even with beginner lessons left open.
  assert.equal(next(new Set(mids), { experience: "player", playerRank: 4 }), firstOf("advanced"));
  // A 10 kyu player who finished the intermediate course is not pushed past the basics.
  assert.equal(next(new Set(mids), { experience: "player", playerRank: 10 }), firstOf("beginner"));
  // Everything done: nothing next.
  assert.equal(pickNextLesson(all, () => true, { playerRank: 1 }), null);
});

await test("v6 advanced: the strings are one block in four languages and the course map shows the level", () => {
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(src.split("// v6 advanced\n").length, 2, "one v6 advanced block");
  const block = src.slice(src.indexOf("// v6 advanced"));
  assert.ok(block.includes('"course.advanced"'));
  for (const lang of LANG_IDS) assert.ok(MESSAGES["course.advanced"][lang].trim(), lang);
  const jsx = fs.readFileSync(path.join(root, "src/web/js/app/practice.jsx"), "utf8");
  assert.match(jsx, /course\.advanced/);
  const ctl = fs.readFileSync(path.join(root, "src/web/js/app/practice-ctl.js"), "utf8");
  assert.match(ctl, /pickNextLesson\(allLessons\(\)/);
});

/* ------------------------------------------------------- v6 explorer */

const Book = await import("../src/web/js/book.js");
const BOOK_RAW = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/book.json"), "utf8"));
const BOOK = Book.loadBook(BOOK_RAW);
const emptyMap = () => Array.from({ length: 19 }, () => Array(19).fill(EMPTY));
const xy = (s) => Book.decodeMove(s);
const gtp = (s) => ({ x: "ABCDEFGHJKLMNOPQRST".indexOf(s[0]), y: 19 - Number(s.slice(1)) });
/** Replay GTP moves on a tree's setup: { signMap, toMove }. */
function replay(tree, moves) {
  let m = Book.setupSignMap(tree.tree, 19);
  let toMove = tree.tree.toMove === "W" ? WHITE : BLACK;
  for (const s of moves) {
    const p = gtp(s);
    m = Book.playOn(m, p.x, p.y, toMove);
    toMove = -toMove;
  }
  return { signMap: m, toMove };
}
const symMap = (m, s) => {
  const out = emptyMap();
  for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) if (m[y][x]) {
    const [u, v] = Book.applySym(s, x, y);
    out[v][u] = m[y][x];
  }
  return out;
};

await test("v6 explorer: the shipped book has both trees, its network and a compact size", () => {
  assert.equal(BOOK_RAW.format, Book.BOOK_FORMAT);
  assert.ok(BOOK_RAW.network && typeof BOOK_RAW.network === "string", "the network that made the book is recorded");
  assert.ok(BOOK_RAW.visits > 0);
  assert.equal(BOOK_RAW.komi, 6.5);
  const bytes = fs.statSync(path.join(root, "src/web/js/content/book.json")).size;
  // v7: the book grew with the stronger network; scripts/tests/v7-book.mjs checks its gzipped size.
  assert.ok(bytes < 1024 * 1024, `book is ${bytes} bytes`);
  for (const id of ["whole", "corner"]) {
    const tree = BOOK_RAW.trees[id];
    assert.ok(tree && tree.nodes.length > 40, `${id}: ${tree?.nodes.length} records`);
    tree.nodes.forEach((rec, i) => {
      assert.ok(rec[0] < i, `${id} ${i}: parent after child`);
      if (i === 0) assert.equal(rec[0], -1);
      if (rec.length === 3) {
        assert.ok(rec[2] < tree.nodes.length && tree.nodes[rec[2]].length === 6, `${id} ${i}: edge target`);
        return;
      }
      assert.equal(rec.length, 6, `${id} ${i}: record shape`);
      assert.ok(rec[2] >= 0 && rec[2] <= 1000 && rec[4] > 0, `${id} ${i}: values`);
      for (const c of rec[5]) assert.ok(c.length === 4 && /^[a-s]{2}$/.test(c[0]) && c[1] >= 0, `${id} ${i}: candidate ${c}`);
    });
    // No position is stored twice (transpositions and symmetry share one).
    const t = BOOK.trees[id];
    assert.equal(t.byKey.size, t.nodes.length, `${id}: duplicate positions`);
  }
  // The corner setup is symmetric along the upper-right diagonal.
  const c = BOOK.trees.corner;
  assert.deepEqual(c.group, Book.GROUPS.corner);
  const setup = Book.setupSignMap(c.tree);
  assert.deepEqual(symMap(setup, 7), setup);
  assert.equal(Book.stonesOf(setup).length, 4);
});

await test("v6 explorer: every named line is in the book and named", () => {
  const src = fs.readFileSync(path.join(root, "scripts/make-book.mjs"), "utf8");
  for (const id of ["whole", "corner"]) {
    const tree = BOOK.trees[id];
    const block = src.slice(src.indexOf(`  ${id}: [`), src.indexOf("],", src.indexOf(`  ${id}: [`)));
    const lines = [...block.matchAll(/\{ name: (null|"([^"]+)"), moves: "([^"]+)" \}/g)];
    assert.ok(lines.length >= 5, `${id}: ${lines.length} lines`);
    for (const [, , name, moves] of lines) {
      const ms = moves.split(" ");
      for (let i = 0; i <= ms.length; i++) {
        const { signMap, toMove } = replay(tree, ms.slice(0, i));
        const hit = Book.lookup(tree, signMap, toMove);
        assert.ok(hit, `${id} ${moves}: not in the book after ${i} moves`);
        if (i === ms.length && name) assert.equal(hit.node.name, name, `${id} ${moves}`);
      }
      if (name) for (const lang of LANG_IDS) assert.ok(MESSAGES[`explorer.name.${id}.${name}`]?.[lang], `explorer.name.${id}.${name} ${lang}`);
    }
  }
});

await test("v6 explorer: lookup gives continuations with point losses and tags", () => {
  const whole = BOOK.trees.whole;
  const hit = Book.lookup(whole, emptyMap(), BLACK);
  assert.ok(hit && hit.continuations.length >= 3);
  // All four star points are book moves from the empty board.
  for (const p of ["Q16", "D4", "D16", "Q4"].map(gtp)) {
    const c = hit.continuations.find((k) => k.x === p.x && k.y === p.y);
    assert.ok(c && c.inBook && c.tag === "joseki", `star point ${p.x},${p.y}: ${JSON.stringify(c && { ...c, node: null })}`);
  }
  for (const c of hit.continuations) {
    assert.ok(c.loss >= 0 && Number.isFinite(c.score) && c.winrate >= 0 && c.winrate <= 1);
    assert.equal(c.tag, Book.tagOf(c.loss, c.inBook));
  }
  // Book moves first, then KataGo's other candidates, each group best first.
  const primary = hit.continuations.filter((c) => !c.image);
  for (let i = 1; i < primary.length; i++) {
    const [a, b] = [primary[i - 1], primary[i]];
    assert.ok(a.inBook > b.inBook || (a.inBook === b.inBook && b.loss >= a.loss), `order at ${i}`);
  }
  assert.equal(Book.tagOf(0), "joseki");
  assert.equal(Book.tagOf(Book.JOSEKI_LOSS), "joseki");
  assert.equal(Book.tagOf(0, false), "good");
  assert.equal(Book.tagOf(Book.JOSEKI_LOSS + 0.1), "playable");
  assert.equal(Book.tagOf(Book.PLAYABLE_LOSS + 0.1), "mistake");
  // A first-line move leaves the book.
  const out = replay(whole, ["A19"]);
  assert.equal(Book.lookup(whole, out.signMap, out.toMove), null);
  const j = Book.judgeMove(whole, emptyMap(), BLACK, 0, 0);
  assert.ok(j === null || j.tag !== "joseki");
});

await test("v6 explorer: whole-board positions match under all eight symmetries", () => {
  const whole = BOOK.trees.whole;
  const base = replay(whole, ["Q16", "D4", "Q4"]);
  const ref = Book.lookup(whole, base.signMap, base.toMove);
  assert.ok(ref, "two star points in the book");
  for (let s = 0; s < 8; s++) {
    const m = symMap(base.signMap, s);
    const hit = Book.lookup(whole, m, base.toMove);
    assert.ok(hit, `symmetry ${s}`);
    assert.equal(hit.node, ref.node);
    // Every continuation is the image of the reference continuation.
    const want = new Set(ref.continuations.map((c) => Book.applySym(s, c.x, c.y).join(",")));
    const got = new Set(hit.continuations.map((c) => `${c.x},${c.y}`));
    assert.deepEqual([...got].sort(), [...want].sort(), `symmetry ${s}`);
    for (const c of hit.continuations) assert.equal(m[c.y][c.x], EMPTY, `symmetry ${s}: continuation on a stone`);
  }
  // The symmetry table: each entry undoes its inverse.
  for (let s = 0; s < 8; s++) {
    const [a, b] = Book.applySym(s, 3, 15);
    assert.deepEqual(Book.applySym(Book.INVERSE[s], a, b), [3, 15]);
  }
});

await test("v6 explorer: transpositions reach the same position", () => {
  const whole = BOOK.trees.whole;
  const a = replay(whole, ["Q16", "D4", "Q4", "D16"]);
  const b = replay(whole, ["Q4", "D16", "Q16", "D4"]);
  const ha = Book.lookup(whole, a.signMap, a.toMove);
  const hb = Book.lookup(whole, b.signMap, b.toMove);
  assert.ok(ha && hb && ha.node === hb.node);
  // A synthetic tree: one position by two move orders, stored once with an
  // edge record for the second order.
  const tree = {
    size: 19, toMove: "B", symmetry: "none", setup: { b: [], w: [] },
    nodes: [
      [-1, "", 500, 0, 10, [["pd", 5, 500, 0], ["dp", 5, 500, 0]]],
      [0, "pd", 500, 0, 10, [["dd", 9, 500, 0]]],
      [0, "dp", 500, 0, 10, [["dd", 9, 500, 0]]],
      [1, "dd", 500, 0, 10, [["dp", 9, 500, 0]]],
      [2, "dd", 500, 0, 10, [["pd", 9, 500, 0]]],
      [3, "dp", 520, 10, 10, []],
      [4, "pd", 5],
    ],
  };
  const t = Book.indexTree("t", tree);
  const n4 = t.nodes.find((n) => n.index === 4);
  const edge = n4.edges.find((e) => e.move === "pd");
  assert.ok(edge && edge.node.index === 5, "the edge record links the second order");
  const hit = Book.lookup(t, t.nodes.find((n) => n.index === 5).signMap, WHITE);
  assert.equal(hit.node.index, 5);
  const c = Book.lookup(t, n4.signMap, n4.toMove).continuations.find((k) => k.move === "pd");
  assert.ok(c.inBook && c.score === 1);
  // Under "none" a mirrored position is not the same.
  assert.equal(Book.lookup(t, symMap(n4.signMap, 1), n4.toMove), null);
  assert.throws(() => Book.loadBook({ format: 99 }));
});

await test("v6 explorer: corner joseki are normalised along the corner's diagonal only", () => {
  const corner = BOOK.trees.corner;
  // The small knight's approach from below (R14) and from the left (O17)
  // are one position: the setup is symmetric along that diagonal.
  const a = replay(corner, ["Q16", "R14"]);
  const b = replay(corner, ["Q16", "O17"]);
  const ha = Book.lookup(corner, a.signMap, a.toMove);
  const hb = Book.lookup(corner, b.signMap, b.toMove);
  assert.ok(ha && hb && ha.node === hb.node);
  for (const c of hb.continuations) {
    const [u, v] = Book.applySym(7, c.x, c.y);
    assert.ok(ha.continuations.some((k) => k.x === u && k.y === v), "continuations mirror");
  }
  // The 3-3 invasion blocks from either side are the same position too.
  const c1 = replay(corner, ["Q16", "R17", "Q17"]);
  const c2 = replay(corner, ["Q16", "R17", "R16"]);
  const h1 = Book.lookup(corner, c1.signMap, c1.toMove);
  assert.ok(h1 && h1.node === Book.lookup(corner, c2.signMap, c2.toMove)?.node);
  // The same joseki in another corner is not: the other corners hold the setup.
  const rot = symMap(a.signMap, 1);
  assert.equal(Book.lookup(corner, rot, a.toMove), null);
  // The corner book's continuations include the expanded local moves.
  assert.ok(ha.continuations.some((k) => k.inBook && k.x >= 9 && k.y <= 9));
});

await test("v6 explorer: a game's book depth counts the moves that stay in the book", () => {
  const whole = BOOK.trees.whole;
  const mv = (s, c) => ({ ...gtp(s), color: c });
  assert.equal(Book.bookDepth(whole, []), 0);
  assert.equal(Book.bookDepth(whole, [mv("Q16", BLACK), mv("D4", WHITE), mv("Q4", BLACK)]), 3);
  assert.equal(Book.bookDepth(whole, [mv("Q16", BLACK), mv("A1", WHITE), mv("Q4", BLACK)]), 1);
  assert.equal(Book.bookDepth(whole, [mv("A19", BLACK)]), 0);
  assert.equal(Book.bookDepth(whole, [{ pass: true }]), 0);
});

await test("v6 explorer: the strings are one block in four languages", () => {
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(src.split("// v6 explorer").length, 2);
  const block = src.slice(src.indexOf("// v6 explorer"), src.indexOf("// end v6 explorer"));
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("explorer."));
  assert.ok(keys.length >= 40);
  const holes = (v) => [...v.matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join();
  for (const k of keys) {
    assert.ok(block.includes(`"${k}"`) || LATER_KEYS.has(k), `${k} outside the v6 explorer block`);
    for (const lang of LANG_IDS) assert.ok(MESSAGES[k][lang]?.trim(), `${k} ${lang}`);
    for (const lang of LANG_IDS) assert.equal(holes(MESSAGES[k][lang]), holes(MESSAGES[k].en), `${k} ${lang}`);
  }
  for (const tag of ["joseki", "standard", "good", "playable", "mistake"]) assert.ok(MESSAGES[`explorer.tag.${tag}`]);
  const csv = fs.readFileSync(path.join(root, "docs/l10n/strings.csv"), "utf8");
  assert.ok(csv.includes('"explorer.title"'), "run node scripts/export-strings.mjs");
});

/* ------------------------------------------------------------ v6 endgame */

/** A counting puzzle on the top edge of a 19×19 board. */
const egPuzzle = (diagram, extra = {}) => S.createPuzzle({ goal: "endgame", ask: "move", diagram, corner: "tl", ...extra });
const egLine = (line) => line.map((m) => `${m.c === BLACK ? "B" : "W"}${m.x},${m.y}`).join(" ");
// Both walls stop on the second line; ':' is counted territory nobody plays.
const EG_HANE = ["X : . . . . . O", "X : : : X O : O", "X X X X X O O O", ", , , , , , , ,"];

await test("v6 endgame: a first-line hane and connection is gote, worth 2 points counted both ways", () => {
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

await test("v6 endgame: counted points (':') give the same proof as playing them out", () => {
  const sealed = egPuzzle(EG_HANE);
  const open = egPuzzle(EG_HANE.map((r) => r.replace(/:/g, ".")));
  const a = S.deiri(sealed);
  const b = S.deiri(open);
  assert.deepEqual([a.value, a.black, a.white], [b.value, b.black, b.white]);
  assert.deepEqual(S.solveFirstMoves(sealed).correct, S.solveFirstMoves(open).correct);
});

await test("v6 endgame: a sente push keeps sente; blocking the opponent's sente push is reverse sente", () => {
  const push = egPuzzle(["X : . . X . . O", "X : : : X O : O", "X X X X X O O O", ", , , , , , , ,"]);
  assert.equal(S.deiri(push).value, 1);
  assert.equal(egLine(S.countLine(push, BLACK)), "B5,0 W6,0", "White has to block: Black keeps sente");
  assert.equal(egLine(S.countLine(push, WHITE)), "W5,0", "White's move there is gote");
  const block = egPuzzle(["X . . O . . : O", "X : X O : : : O", "X X X O O O O O", ", , , , , , , ,"]);
  assert.equal(S.deiri(block).value, 1);
  assert.equal(egLine(S.countLine(block, BLACK)), "B2,0", "Black's block is gote");
  assert.equal(egLine(S.countLine(block, WHITE)), "W2,0 B1,0", "White's push is sente");
});

const EG_DOUBLE = [
  ", , , , , , ,",
  ", X X O O O ,",
  ", X X X O O ,",
  ", X X O . O ,",
  ", X X . O O ,",
  ", X . X O O ,",
  ", X X O O O ,",
  ", , , , , , ,",
];

await test("v6 endgame: double sente is sente for both sides and comes before everything", () => {
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

await test("v6 endgame: in a sum of two areas the sente atari comes before the bigger gote move", () => {
  const pz = egPuzzle(["X : . . O . : O X : . . . . . O ,", "X : X X X O : O X : : : X O : O ,", "X X X X X O O O X X X X X O O O ,", ", , , , , , , , , , , , , , , , ,"]);
  const f = S.solveFirstMoves(pz);
  assert.deepEqual(f.correct, [{ x: 3, y: 0 }]);
  assert.equal(egLine(S.solutionLine(pz)), "B3,0 W5,0 B13,0 W14,0 B12,0", "sente atari, White connects, then the hane and connection");
  assert.equal(S.countAreas(pz), 2);
});

await test("v6 endgame: when play ends, enclosed and atari'd stones are dead, as a Japanese count treats them", () => {
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

await test("v6 endgame: the monkey jump is the large knight's slide from the second-line stone", () => {
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

await test("v6 endgame: at least 30 endgame problems over grades 1–5, with their own topic and themes", async () => {
  const grades = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const eg = PROBLEMS.filter((p) => p.goal === "endgame");
  assert.ok(eg.length >= 30, `${eg.length} endgame problems`);
  for (const p of eg) assert.equal(p.topic, "endgame", p.id);
  const byGrade = [1, 2, 3, 4, 5].map((g) => eg.filter((p) => grades[p.id].grade === g).length);
  assert.ok(byGrade.every((n) => n > 0), `grades ${byGrade.join("/")}`);
  const themes = new Set(eg.map((p) => p.theme));
  for (const t of ["hane-connect", "monkey-jump", "double-sente", "sente-gote", "reverse-sente", "endgame-compare", "deiri"]) assert.ok(themes.has(t), t);
  for (const p of eg.filter((x) => x.ask === "value")) assert.ok(p.choices.includes(p.value), p.id);
  assert.ok(eg.some((p) => S.countAreas(S.createPuzzle(p)) >= 3), "some problems compare three areas");
  const jsx = fs.readFileSync(path.join(root, "src/web/js/app/practice.jsx"), "utf8");
  assert.match(jsx, /export const TOPICS = \[[^\]]*"endgame"\]/);
});

await test("v6 endgame: practice plays a move question and answers a value question", async () => {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: ['export * as C from "./src/web/js/app/practice-ctl.js";', 'export { state } from "./src/web/js/app/store.js";', 'export * as P from "./src/web/js/persist.js";'].join("\n"),
      resolveDir: root,
      loader: "js",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    loader: { ".json": "json" },
    write: false,
    logLevel: "error",
  });
  const { C, state, P } = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  state.settings = { ...P.DEFAULT_SETTINGS };
  state.progress = P.loadProgress();
  // A value question: a wrong choice is marked, the right one solves it.
  const vq = PROBLEMS.find((p) => p.id === "endgame-count-01");
  C.openProblem(vq.id);
  let pr = state.practice.problem;
  assert.equal(C.goalText(pr.pz).includes("?") || C.goalText(pr.pz).includes("？"), true);
  C.practicePlay(5, 5);
  assert.equal(pr.history.length, 0, "a value question takes no moves");
  const wrong = vq.choices.find((v) => v !== vq.value);
  C.answerValue(wrong);
  assert.equal(pr.feedback, "wrong");
  assert.deepEqual(pr.wrongValues, [wrong]);
  assert.equal(C.feedbackKey(pr), "practice.endgame.valueWrong");
  C.answerValue(vq.value);
  assert.equal(pr.status, "won");
  assert.equal(C.feedbackKey(pr), vq.value === 1 ? "practice.endgame.valueRightOne" : "practice.endgame.valueRight");
  assert.deepEqual(C.endgameArgs(pr), [String(vq.value)]);
  assert.ok(pr.answer.length > 0, "the Black-first line is shown");
  // A move question: the right move, the computer's answer, until settled.
  const mq = PROBLEMS.find((p) => p.id === "endgame-hane-01");
  C.openProblem(mq.id);
  pr = state.practice.problem;
  const at = (q) => [q.x + mq.at[0], q.y + mq.at[1]];
  // A point the model does not read is refused, not played.
  C.practicePlay(...at({ x: 6, y: 1 }));
  assert.equal(pr.history.length, 0);
  C.practicePlay(...at(mq.answer[0]));
  for (let i = 0; i < 40 && pr.busy; i++) await sleepMs(50);
  assert.equal(pr.status, "open");
  assert.equal(pr.feedback, "keep", "White blocked; Black still has to connect");
  C.practicePlay(...at({ x: 4, y: 0 }));
  for (let i = 0; i < 40 && pr.status === "open"; i++) await sleepMs(50);
  assert.equal(pr.status, "won");
  assert.equal(C.feedbackKey(pr), mq.margin === 1 ? "practice.endgame.solvedOne" : "practice.endgame.solved");
  assert.deepEqual(C.endgameArgs(pr), [String(mq.margin)]);
});

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

await test("v6 endgame: the fighting unit teaches the leaning attack and sabaki, after the v5 lessons", () => {
  const unit = COURSE.find((u) => u.id === "fighting");
  const ids = unit.lessons.map((l) => l.id);
  assert.deepEqual(ids, ["fight-cutting-stones", "fight-attack-distance", "fight-split", "fight-leaning", "fight-sabaki"]);
  for (const id of ["fight-leaning", "fight-sabaki"]) {
    const lesson = unit.lessons.find((l) => l.id === id);
    const problems = lesson.steps.filter((s) => s.kind === "problem");
    assert.ok(problems.length >= 2, `${id} has solver-proved steps`);
    for (const s of problems) assert.ok(S.validate(S.createPuzzle(s.problem)).ok, id);
  }
  // The leaning stones are what make the capture work: without them it fails.
  const lean = unit.lessons.find((l) => l.id === "fight-leaning").steps[1].problem;
  const without = { ...lean, diagram: lean.diagram.map((r, y) => (y === 3 ? r.replace(/X O \.$/, ". O .") : r)) };
  assert.notEqual(without.diagram[3], lean.diagram[3]);
  assert.equal(S.status(S.createPuzzle(without), S.initialState(S.createPuzzle(without))), "lost");
});

await test("v6 endgame: the strings are one block in four languages", () => {
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(src.split("// v6 endgame").length, 2);
  const block = src.slice(src.indexOf("// v6 endgame"), src.indexOf("// end v6 endgame"));
  const keys = Object.keys(MESSAGES).filter((k) => k.includes("endgame") || ["theme.hane-connect", "theme.sente-gote", "theme.reverse-sente", "theme.double-sente", "theme.monkey-jump", "theme.deiri"].includes(k));
  assert.ok(keys.length >= 35);
  for (const k of keys) {
    if (k === "phase.endgame" || k === "phaseIn.endgame") continue;
    assert.ok(block.includes(`"${k}"`) || LATER_KEYS.has(k), `${k} outside the v6 block`);
    for (const lang of LANG_IDS) assert.ok(MESSAGES[k][lang].trim(), `${k} ${lang}`);
    const holes = (v) => [...v.matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join();
    for (const lang of LANG_IDS) assert.equal(holes(MESSAGES[k][lang]), holes(MESSAGES[k].en), `${k} ${lang}`);
  }
});

const SE = await import("../src/web/js/app/strength.js");

await test("v6 strength: one rated game is a Glicko step against the level's measured strength", () => {
  // θ ↔ GoR uses the ladder's own anchor: rank_10k (θ 11.65) is 10 kyu.
  assert.equal(Math.round(SE.thetaToGoR(11.65)), 1100);
  assert.equal(Math.round(SE.thetaToGoR(SE.MEASURED.standard["2d"][19])), 2429);
  for (const g of [-1500, 0, 1100, 2400]) assert.ok(Math.abs(SE.thetaToGoR(SE.gorToTheta(g)) - g) < 1e-6);
  // By hand: prior N(mu, 2.5²), +0.2² before the game, against L:10k on 19×19.
  const est = SE.startEstimate(12, 0);
  const opp = SE.MEASURED.standard["10k"][19];
  assert.equal(SE.levelTheta("10k"), opp);
  const v0 = Math.min(SE.SIGMA0 ** 2, SE.SIGMA0 ** 2 + SE.SIGMA_GAME ** 2);
  const g = 1 / Math.sqrt(1 + (3 * SE.SIGMA_LEVEL ** 2) / Math.PI ** 2);
  const e = 1 / (1 + Math.exp(-g * (est.mu - opp)));
  const v = 1 / (1 / v0 + g * g * e * (1 - e));
  const won = SE.rateGame(est, { level: "10k", won: true, at: 0 });
  assert.ok(Math.abs(won.mu - (est.mu + v * g * (1 - e))) < 2e-3, `${won.mu}`);
  assert.ok(Math.abs(won.sigma - Math.sqrt(v)) < 2e-3);
  const lost = SE.rateGame(est, { level: "10k", won: false, at: 0 });
  assert.ok(Math.abs(lost.mu - (est.mu - v * g * e)) < 2e-3);
  // Beating a stronger level moves you more than beating a weaker one.
  assert.ok(SE.rateGame(est, { level: "5k", won: true, at: 0 }).mu - est.mu > SE.rateGame(est, { level: "15k", won: true, at: 0 }).mu - est.mu);
  // The stored shape: v6 fields plus the GoR `r` every v5 reader uses.
  assert.deepEqual(Object.keys(won).sort(), ["at", "games", "history", "mu", "r", "sigma", "v"]);
  assert.equal(won.r, Math.round(SE.thetaToGoR(won.mu)));
  const h = won.history[won.history.length - 1];
  assert.ok(h.lo < h.r && h.r < h.hi);
  // Handicap: given stones make the level weaker, given away stronger.
  assert.ok(SE.levelTheta("10k", { handicap: 3 }) < opp && SE.levelTheta("10k", { handicap: -3 }) > opp);
  assert.equal(SE.levelTheta("10k", { handicap: 1 }), opp, "one stone is not a handicap");
  // A board size maps through the levels' measured 19×19 ↔ 9×9 pairs.
  for (const s of STRENGTHS) assert.ok(Math.abs(SE.onBoard(SE.MEASURED.standard[s.id][19], 9) - SE.MEASURED.standard[s.id][9]) < 1e-9, s.id);
  for (const t19 of [-8, 0, 3.3, 12, 20, 30]) for (const size of [9, 13]) assert.ok(Math.abs(SE.fromBoard(SE.onBoard(t19, size), size) - t19) < 1e-6, `${t19} ${size}`);
});

await test("v6 strength: the uncertainty shrinks with games, less on 9×9, and grows with time away", () => {
  const play = (size, n) => {
    let est = SE.startEstimate(15, 0);
    const sig = [est.sigma];
    for (let i = 0; i < n; i++) {
      est = SE.rateGame(est, { level: "15k", size, won: i % 2 === 0, at: 0 });
      sig.push(est.sigma);
    }
    return { est, sig };
  };
  const big = play(19, 60);
  for (let i = 1; i < 15; i++) assert.ok(big.sig[i] < big.sig[i - 1], `game ${i}`);
  // It settles (per-game spread keeps it from reaching zero), near one rank.
  assert.ok(Math.abs(big.sig[60] - big.sig[50]) < 0.01);
  assert.ok(big.sig[60] > 0.4 && big.sig[60] < 0.9, `${big.sig[60]}`);
  const now = SE.estimateNow(big.est, 0);
  assert.equal(now.pm, 1);
  assert.equal(now.games, 60);
  const small = play(9, 60);
  assert.ok(small.sig[60] > big.sig[60], "a 9×9 game says less about 19×19 strength");
  // Time away widens the band, never beyond the prior.
  const later = SE.estimateNow(big.est, 90 * 86400000);
  assert.ok(later.sigma > now.sigma && later.pm >= now.pm);
  assert.ok(SE.sigmaAt(big.est, 1e13) <= SE.SIGMA0 + 1e-9);
  // Even results against a level converge to that level's strength.
  assert.ok(Math.abs(big.est.mu - SE.MEASURED.standard["15k"][19]) < 1, `${big.est.mu}`);
  // History is kept, bounded.
  assert.equal(big.est.history.length, 61);
  let long = SE.startEstimate(15, 0);
  for (let i = 0; i < 230; i++) long = SE.rateGame(long, { level: "15k", won: i % 2 === 0, at: i });
  assert.equal(long.history.length, 200);
  assert.equal(long.games, 230);
});

await test("v6 strength: v5 ratings and their history migrate to an estimate with a band", () => {
  const old = { r: 1200, games: 3, history: [{ at: 10, r: 900 }, { at: 20, r: 1000 }, { at: 30, r: 1100 }, { at: 40, r: 1200 }] };
  const est = SE.migrateEstimate(old, 50);
  assert.equal(est.v, 6);
  assert.equal(est.r, 1200);
  assert.equal(est.games, 3);
  assert.equal(est.at, 40);
  assert.deepEqual(est.history.map((h) => [h.at, h.r]), old.history.map((h) => [h.at, h.r]));
  for (const h of est.history) assert.ok(h.lo < h.r && h.r < h.hi);
  // Older points (fewer games) carry wider bands.
  const width = (h) => SE.gorToTheta(h.hi) - SE.gorToTheta(h.lo);
  for (let i = 1; i < est.history.length; i++) assert.ok(width(est.history[i]) < width(est.history[i - 1]));
  assert.ok(est.sigma < SE.SIGMA0);
  // Idempotent; v6 passes through; junk becomes null.
  assert.equal(SE.migrateEstimate(est), est);
  assert.equal(SE.migrateEstimate(null), null);
  assert.equal(SE.migrateEstimate({ r: "x" }), null);
  // A v5 rating without history still gets one point.
  assert.equal(SE.migrateEstimate({ r: 800, games: 0 }, 5).history.length, 1);
  // Through storage: v4/v5 progress keeps its rating, and it migrates.
  for (const k of Object.values(KEYS)) removeKey(k);
  writeJSON(KEYS.progress, { problems: {}, rating: old });
  migrate();
  const p = loadProgress();
  const m = SE.migrateEstimate(p.rating);
  assert.equal(m.r, 1200);
  // The migrated estimate keeps updating.
  const next = SE.rateGame(m, { level: "10k", won: true, at: 60 });
  assert.equal(next.games, 4);
  assert.equal(next.history.length, 5);
  for (const k of Object.values(KEYS)) removeKey(k);
  // The app migrates at boot and rates with the new model.
  const ctl = fs.readFileSync(path.join(root, "src/web/js/app/controller.js"), "utf8");
  assert.match(ctl, /migrateEstimate\(state\.progress\.rating\)/);
  const play = fs.readFileSync(path.join(root, "src/web/js/app/play-ctl.js"), "utf8");
  assert.match(play, /rateGame\(prev, \{ level: g\.strength, mode, size: g\.game\.size, handicap, won \}\)/);
});

await test("v6 strength: the recommended opponent is the level you are expected to play evenly", () => {
  // At a level's measured strength, that level is the suggestion, on both boards.
  for (const s of STRENGTHS) {
    const at = { mu: SE.MEASURED.standard[s.id][19] };
    assert.equal(SE.recommendStrength(at), s.id, s.id);
    assert.equal(SE.recommendStrength(at, { size: 9 }), s.id, `9×9 ${s.id}`);
  }
  // Between two levels: the nearer by expected score.
  const mid = (SE.MEASURED.standard["10k"][19] + SE.MEASURED.standard["5k"][19]) / 2;
  assert.equal(SE.recommendStrength({ mu: mid - 0.3 }), "10k");
  assert.equal(SE.recommendStrength({ mu: mid + 0.3 }), "5k");
  // A prior of 12 kyu (the 10k level's label) suggests that level.
  assert.equal(SE.recommendStrength(SE.startEstimate(12)), "10k");
  // Winning streaks move the suggestion up.
  let est = SE.startEstimate(18, 0);
  assert.equal(SE.recommendStrength(est), "15k");
  for (let i = 0; i < 8; i++) est = SE.rateGame(est, { level: SE.recommendStrength(est), won: true, at: i });
  assert.ok(STRENGTHS.findIndex((s) => s.id === SE.recommendStrength(est)) > STRENGTHS.findIndex((s) => s.id === "15k"));
  // The mode each level would be played in is taken into account.
  for (const s of STRENGTHS) {
    const mode = SE.MEASURED.human[s.id] ? "human" : "standard";
    assert.ok(Number.isFinite(SE.levelTheta(s.id, { mode, size: 19 })) && Number.isFinite(SE.levelTheta(s.id, { mode, size: 9 })));
  }
  const ctl = fs.readFileSync(path.join(root, "src/web/js/app/play-ctl.js"), "utf8");
  assert.match(ctl, /recommendStrength\(est, \{ size: 19, modeOf \}\)/);
  assert.match(ctl, /recommendStrength\(est, \{ size: 9, modeOf \}\)/);
});

await test("v6 strength: the calibration fit can hold the measured ladder and place new players in its frame", () => {
  const rnd = mulberry32(7);
  const truth = { "L:a": 0, "L:b": 3, "L:c": 9, "HL:x": 4.2, "HL:y": 8 };
  const games = [];
  const pairs = [["HL:x", "L:a"], ["HL:x", "L:b"], ["HL:x", "L:c"], ["HL:y", "L:b"], ["HL:y", "L:c"], ["HL:x", "HL:y"]];
  for (const [p, q] of pairs) {
    for (let k = 0; k < 600; k++) {
      const [black, white] = k % 2 ? [p, q] : [q, p];
      const pr = 1 / (1 + Math.exp(-(truth[black] - truth[white])));
      games.push({ black, white, winner: rnd() < pr ? "B" : "W", plies: 60, reason: "passes" });
    }
  }
  const fixed = { "L:a": 0, "L:b": 3, "L:c": 9 };
  const fit = fitBT(games, Object.keys(truth), { fixed });
  for (const p of Object.keys(fixed)) assert.equal(fit.theta[p], fixed[p], p);
  for (const p of ["HL:x", "HL:y"]) assert.ok(Math.abs(fit.theta[p] - truth[p]) < 0.25, `${p} ${fit.theta[p]}`);
  // A clean sweep against a far-away fixed player stays finite.
  const sweep = Array.from({ length: 20 }, (_, k) => ({ black: k % 2 ? "HL:z" : "L:c", white: k % 2 ? "L:c" : "HL:z", winner: k % 2 ? "B" : "W" }));
  const fz = fitBT(sweep, ["L:c", "HL:z"], { fixed: { "L:c": 9 } });
  assert.ok(Number.isFinite(fz.theta["HL:z"]) && fz.theta["HL:z"] > 9);
  // With a map, rows get GoR in the v4 frame and the held players have no spread.
  const r = analyse(games, { boot: 10, fixed, gorMap: SE.thetaToGoR });
  const row = (p) => r.rows.find((x) => x.player === p);
  assert.equal(row("L:b").lo, 3);
  assert.equal(Math.round(row("L:c").gor), Math.round(SE.thetaToGoR(9)));
});

await test("v6 strength: human-style and stronger-network labels follow the v6 measurement", async () => {
  const E = await import("../src/web/js/engine.js");
  // v7 values (docs/strength.md, v7; the v7 tests check the whole ladder).
  assert.equal(E.labelRank("1k", "human"), 1);
  assert.equal(E.labelRank("2d", "human"), -5);
  assert.equal(E.labelRank("2d", "strong"), -6);
  for (const id of ["30k", "25k", "20k", "15k", "10k", "5k"]) assert.equal(E.labelRank(id, "human"), strengthById(id).rank, id);
  for (const s of STRENGTHS) assert.equal(E.labelRank(s.id, "standard"), s.rank);
  assert.deepEqual(rankParts("1k", "human"), { n: 1, unit: "kyu" });
  assert.deepEqual(rankParts("2d", "strong"), { n: 7, unit: "dan" });
  assert.deepEqual(rankParts("5k", "standard"), { n: 7, unit: "kyu" });
  // Every mode's measured strength is ordered as its labels are, on 19×19.
  for (const mode of ["standard", "human"]) {
    for (let i = 1; i < STRENGTHS.length; i++) {
      const a = SE.levelTheta(STRENGTHS[i - 1].id, { mode });
      const b = SE.levelTheta(STRENGTHS[i].id, { mode });
      assert.ok(b > a, `${mode} ${STRENGTHS[i].id}`);
    }
  }
  assert.ok(SE.levelTheta("2d", { mode: "strong" }) > SE.levelTheta("2d"));
  assert.ok(SE.levelTheta("2d", { mode: "strong", size: 9 }) > SE.levelTheta("2d", { size: 9 }));
});

await test("v6 strength: strings in one block, four languages; the chart uses design tokens", () => {
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8");
  const block = src.slice(src.indexOf("// v6 strength"));
  for (const k of ["strength.label", "strength.about"]) {
    assert.ok(block.includes(`"${k}"`), k);
    for (const lang of LANG_IDS) assert.ok(MESSAGES[k][lang].trim(), `${k} ${lang}`);
  }
  for (const lang of LANG_IDS) assert.ok(MESSAGES["strength.label"][lang].includes("±{1}"), lang);
  const chart = fs.readFileSync(path.join(root, "src/web/js/app/strength-chart.jsx"), "utf8");
  assert.doesNotMatch(chart, /#[0-9a-fA-F]{3,6}\b/, "no literal colours");
  for (const tok of ["--text-2", "--text-3", "--text"]) assert.ok(chart.includes(`var(${tok})`), tok);
});

// v7: each area's tests live in scripts/tests/*.mjs (in name order).
for (const f of fs.readdirSync(path.join(root, "scripts/tests")).filter((n) => n.endsWith(".mjs")).sort()) {
  const mod = await import("./tests/" + f);
  await mod.default({ test, assert, root });
}

if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} tests passed.`);
// Toast timers from the v5 interface test would keep Node alive for seconds.
process.exit(0);
