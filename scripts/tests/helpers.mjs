/**
 * The test harness and the helpers the area files share (scripts/tests/*.mjs).
 *
 * `test(name, fn)` runs one check and counts it; `results()` is what the
 * runner (scripts/test.mjs) reports. The helpers below build positions,
 * games and analyses for the rules, solver, review and report checks.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { PNG } from "pngjs";

import { BLACK, WHITE, EMPTY, Game, MARK_KINDS, coordLabel, formatPoints, territoryMap, treeLayout, RULESETS, DEFAULT_RULES, defaultKomi, handicapCompensation, normalizeRules, findSeki, rulesFromSgf } from "../../src/web/js/rules.js";
import { loadSGF } from "../../src/web/js/sgf.js";
import { chooseMove } from "../../src/web/js/ai.js";
import { HUMAN_VISITS, STRENGTHS, STRONG_VISIT_SCALE, analysisEngine, beginnerMove, humanMoveFromAnalysis, humanRequest, installed, moveFromAnalysis, pickCandidate, rankParts, scaledVisits, calibrated, suggestHandicap } from "../../src/web/js/engine.js";
import { analyse, anchorMap, egfExpected, egfNats, fitBT, goRLabel, humanStyleParams, mulberry32, profileGoR, wilson } from "../calibrate-strength.mjs";
import { enginePayload, parseInfo, parseVertex, positionPayload, katagoRules } from "../../src/web/js/katago.js";
import * as M from "../../src/web/js/models.js";
import * as S from "../../src/web/js/solver.js";
import { CLASSICS } from "../../src/web/js/content/classics.js";
import { PROBLEMS } from "../../src/web/js/content/problems.js";
import { COURSE } from "../../src/web/js/content/course.js";
import { MESSAGES } from "../../src/web/js/messages.js";
import { LANG_IDS, setLang, t } from "../../src/web/js/i18n.js";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings } from "../../src/web/js/data/settings.js";
import { createStore, localBackend } from "../../src/web/js/data/store.js";
import * as U from "../../src/web/js/update.js";
import * as Host from "../../src/web/js/host.js";
import { APP_VERSION } from "../../src/web/js/version.js";
import * as Sign from "../signing-notes.mjs";
import * as Shots from "../screenshots.mjs";
import * as A11y from "../../src/web/js/a11y.js";
import { newClock, tick, moveMade, formatClock } from "../../src/web/js/app/clock.js";
import { ataris, lossSource, classifyMistake, settled, complexity, attributeLoss } from "../../src/web/js/app/insight.js";
import { describe, narrate, simulate, storyText } from "../../src/web/js/app/story.js";
import { describeMistakes, summaryOf } from "../../src/web/js/app/explain.js";
import { PHASES, gameRecord, phaseBoundaries, phaseThresholds, recordAnalysis, settledShare, summarizeGame, themeCounts, trends } from "../../src/web/js/app/summary.js";

export { assert, fs, path, execFileSync, PNG };
export { BLACK, WHITE, EMPTY, Game, MARK_KINDS, coordLabel, formatPoints, territoryMap, treeLayout, RULESETS, DEFAULT_RULES, defaultKomi, handicapCompensation, normalizeRules, findSeki, rulesFromSgf };
export { loadSGF, chooseMove };
export { HUMAN_VISITS, STRENGTHS, STRONG_VISIT_SCALE, analysisEngine, beginnerMove, humanMoveFromAnalysis, humanRequest, installed, moveFromAnalysis, pickCandidate, rankParts, scaledVisits, calibrated, suggestHandicap };
export { analyse, anchorMap, egfExpected, egfNats, fitBT, goRLabel, humanStyleParams, mulberry32, profileGoR, wilson };
export { enginePayload, parseInfo, parseVertex, positionPayload, katagoRules };
export { M, S, CLASSICS, PROBLEMS, COURSE, MESSAGES, LANG_IDS, setLang, t, DEFAULT_SETTINGS, loadSettings, normalizeSettings, createStore, localBackend, U, Host, APP_VERSION, Sign, Shots, A11y };
export { newClock, tick, moveMade, formatClock, ataris, lossSource, classifyMistake, settled, complexity, attributeLoss, describe, narrate, simulate, storyText, describeMistakes, summaryOf };
export { PHASES, gameRecord, phaseBoundaries, phaseThresholds, recordAnalysis, settledShare, summarizeGame, themeCounts, trends };

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let count = 0;
let failures = 0;
export async function test(name, fn) {
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
export const results = () => ({ count, failures });

let bundles = 0;
/** Bundle app modules (with their store) for a test: one shared state. */
export async function bundle(lines) {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    // Each bundle is a module of its own (an identical data: URL would be the same instance).
    stdin: { contents: [...lines, `export const BUNDLE = ${++bundles};`].join("\n"), resolveDir: root, loader: "js" },
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    loader: { ".json": "json" },
    write: false,
    logLevel: "error",
  });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
}

export const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const sleepMs = sleep;
export const empty = (n) => Array.from({ length: n }, () => Array(n).fill(0));

export function setup(stones, turn = BLACK, size = 9) {
  const game = new Game({ size });
  game.setup(stones, turn);
  return game;
}

export function newGame(size = 19, options = {}) {
  return new Game({ size, ...options });
}


/* ---------------------------------------- rules */

/** A 9×9 board from rows of "X" (black), "O" (white) and "." (empty). */
export function fromRows(rows, options = {}) {
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
export const WALLS = [
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
export const SEKI_BOARD = [
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
export const SEKI_BOARD_CLOSED = SEKI_BOARD.map((row) => row.slice(0, 5) + "X" + row.slice(6));


/** Correct first moves in diagram coordinates. */
export function localCorrect(pz) {
  return S.solveFirstMoves(pz)
    .correct.map((c) => `${c.x - pz.box.x0},${c.y - pz.box.y0}`)
    .sort();
}


export function libertiesAt(pz, st, i) {
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


/** Seki positions: Black's key group (x) against White stones inside it, a solid white wall outside. */
export const SEKI = {
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


/** Capturing races on the top edge: White (o) in columns 3-4, Black in column 5, walls outside. */
export const RACE = {
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
export const raceAt = (diagram, goal) => S.createPuzzle({ goal, diagram, at: [3, 0] });
/** Does Black capture White when Black moves first / when White moves first? */
export function race(diagram) {
  const kill = raceAt(diagram, "kill");
  const live = raceAt(diagram, "live");
  const a = S.attackerWins(kill, S.initialState(kill), 600000);
  const b = S.attackerWins(live, S.initialState(live), 600000);
  assert.ok(a.exact && b.exact, "race search exact");
  return { blackFirst: a.win, whiteFirst: b.win, kill, live };
}


export const SAMPLE_INFO =
  "info move D4 visits 30 utility 0.1 winrate 0.56 scoreMean 2.1 scoreStdev 9 scoreLead 2.4 scoreSelfplay 2 prior 0.2 lcb 0.5 utilityLcb 0 order 0 pv D4 Q16 D16 " +
  "info move Q16 visits 12 utility 0.05 winrate 0.53 scoreMean 1.1 scoreStdev 9 scoreLead 1.0 scoreSelfplay 1 prior 0.18 lcb 0.4 utilityLcb 0 order 1 pv Q16 D4 " +
  "info move K10 visits 3 utility -0.2 winrate 0.40 scoreMean -6 scoreStdev 9 scoreLead -6.5 scoreSelfplay -6 prior 0.01 lcb 0.3 utilityLcb 0 order 2 pv K10 " +
  "ownership " + Array.from({ length: 361 }, (_, i) => (i % 2 ? "0.5" : "-0.25")).join(" ");


/* ---------------------------------------- release */





export function branchedGame() {
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


/* ---------------------------------------- updater */


/* ---------------------------------------- models */


/* ---------------------------------------- report */

export const R = await import("../../src/web/js/app/report-model.js");

/**
 * A 13×13 game of 80 moves with no captures (Black fills the top rows,
 * White the bottom) and a whole-game analysis where each listed move loses
 * the given points; the engine's best move is always the empty 7-7 point.
 */
export function reportGame({ losses = {}, source = "katago", result = "W+R" } = {}) {
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


/* ------------------------------------------------------------ v6 a11y */

// A small 9×9 position, rows as drawn (y = 0 is row 9 at the top):
// black D6 E6 (a group of two), white F6 in atari from black G6 and F7.
export function a11yBoard() {
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


/* ---------------------------------------- advanced */


/* ---------------------------------------- explorer */

export const Book = await import("../../src/web/js/book.js");
export const BOOK_RAW = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/book.json"), "utf8"));
export const BOOK = Book.loadBook(BOOK_RAW);
export const emptyMap = () => Array.from({ length: 19 }, () => Array(19).fill(EMPTY));
export const xy = (s) => Book.decodeMove(s);
export const gtp = (s) => ({ x: "ABCDEFGHJKLMNOPQRST".indexOf(s[0]), y: 19 - Number(s.slice(1)) });
/** Replay GTP moves on a tree's setup: { signMap, toMove }. */
export function replay(tree, moves) {
  let m = Book.setupSignMap(tree.tree, 19);
  let toMove = tree.tree.toMove === "W" ? WHITE : BLACK;
  for (const s of moves) {
    const p = gtp(s);
    m = Book.playOn(m, p.x, p.y, toMove);
    toMove = -toMove;
  }
  return { signMap: m, toMove };
}
export const symMap = (m, s) => {
  const out = emptyMap();
  for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) if (m[y][x]) {
    const [u, v] = Book.applySym(s, x, y);
    out[v][u] = m[y][x];
  }
  return out;
};


/* ---------------------------------------- endgame */

/** A counting puzzle on the top edge of a 19×19 board. */
export const egPuzzle = (diagram, extra = {}) => S.createPuzzle({ goal: "endgame", ask: "move", diagram, corner: "tl", ...extra });
export const egLine = (line) => line.map((m) => `${m.c === BLACK ? "B" : "W"}${m.x},${m.y}`).join(" ");
// Both walls stop on the second line; ':' is counted territory nobody plays.
export const EG_HANE = ["X : . . . . . O", "X : : : X O : O", "X X X X X O O O", ", , , , , , , ,"];


export const EG_DOUBLE = [
  ", , , , , , ,",
  ", X X O O O ,",
  ", X X X O O ,",
  ", X X O . O ,",
  ", X X . O O ,",
  ", X . X O O ,",
  ", X X O O O ,",
  ", , , , , , ,",
];




/* ------------------------------------------------- v4 review: stories */

/** Sign map from rows of X (Black), O (White) and . (empty), padded to `n`. */
export function parse(rows, n = 9) {
  const b = empty(n);
  rows.forEach((r, y) => [...r.replace(/\s+/g, "")].forEach((ch, x) => (b[y][x] = ch === "X" ? 1 : ch === "O" ? -1 : 0)));
  return b;
}
export const mv = (pairs) => pairs.map(([x, y]) => ({ x, y }));
export const keyOf = (b, color, x, y, opts) => describe(simulate(b, color, [{ x, y }], opts)[0]).key;


/** A 9×9 game and a synthetic whole-game analysis with one big mistake. */
export function syntheticReview({ engine = true } = {}) {
  const game = new Game({ size: 9, komi: 6.5 });
  game.setup(
    [
      { x: 0, y: 0, c: 1 },
      { x: 1, y: 0, c: 1 },
      { x: 0, y: 1, c: 1 },
      { x: 1, y: 1, c: -1 },
    ],
    1,
  );
  for (const [x, y] of [[6, 6], [2, 2], [6, 2], [2, 0], [5, 5], [3, 3]]) game.play(x, y);
  const line = game.mainLine();
  const n = 9;
  const lead = [5, 5.2, 4.8, -4, -3.8, -4.2, -4];
  const points = line.map((node, i) => {
    if (!engine) return { source: "estimate", winrate: 0.5, scoreLead: lead[i], best: null, pv: [], ownership: null };
    const own = new Float32Array(n * n);
    const dead = i >= 3; // after Black's 6,2 (index 3) the corner cannot be saved
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2]]) own[y * n + x] = dead ? -0.9 : 0.8;
    // At index 2 Black is to play: the engine's line saves the corner. At
    // index 3 (after Black's 6,2) its line is White's refutation.
    const best = i === 2 ? { x: 2, y: 0 } : { x: 4, y: 4 };
    const pv = i === 2 ? mv([[2, 0], [2, 1], [1, 2], [3, 1]]) : i === 3 ? mv([[2, 0], [0, 2], [1, 2], [0, 3]]) : [{ x: 4, y: 4 }];
    return { source: "katago", winrate: 0.5, scoreLead: lead[i], best, pv, moves: [{ ...best, visits: 30, scoreLead: lead[i] }], ownership: own };
  });
  return { game, points };
}




/**
 * A 13×13 game of 80 moves with no captures (Black fills the top rows,
 * White the bottom), and an analysis where each listed move loses the given
 * points. Phases on 13×13 by move number: opening 1–20, endgame from 76.
 */
export function v5Review({ losses = {}, source = "katago", settledFrom = null, humanColor = BLACK } = {}) {
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
  const line = game.mainLine();
  const lead = [0];
  for (let i = 1; i < line.length; i++) {
    const loss = losses[i] || 0;
    lead[i] = lead[i - 1] + (line[i].move.color === BLACK ? -loss : loss);
  }
  const points = line.map((n, i) => {
    let ownership = null;
    if (settledFrom != null) {
      ownership = new Float32Array(size * size);
      const firm = i >= settledFrom ? 0.8 : 0.3;
      for (let k = 0; k < ownership.length; k++) ownership[k] = k < firm * ownership.length ? 0.95 : 0.1;
    }
    const best = { x: 6, y: 6 };
    return source === "katago"
      ? { source, winrate: 0.5, scoreLead: lead[i], best, pv: [best], moves: [{ ...best, visits: 20, scoreLead: lead[i] }], ownership }
      : { source, winrate: 0.5, scoreLead: lead[i], best: null, pv: [], ownership: null };
  });
  return { game, points, meta: { humanColor }, keyMoves: [] };
}
