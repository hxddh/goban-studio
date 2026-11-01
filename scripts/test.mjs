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
import { chooseMove } from "../src/web/js/ai.js";
import { analyze } from "../src/web/js/review.js";
import { BASICS } from "../src/web/js/content/basics.js";
import { LESSONS } from "../src/web/js/content/lessons.js";
import { OPENINGS } from "../src/web/js/content/openings.js";
import { CLASSICS } from "../src/web/js/content/classics.js";
import { TSUMEGO } from "../src/web/js/content/tsumego.js";
import { MESSAGES } from "../src/web/js/messages.js";
import { LANG_IDS, setLang, t } from "../src/web/js/i18n.js";
import { KEYS, duePuzzles, loadProgress, markPuzzle, touchStreak, writeJSON } from "../src/web/js/persist.js";
import * as Lib from "../src/web/js/library.js";

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
  assert.equal(t("nav.learn"), "学ぶ");
  setLang("en");
  assert.equal(t("nav.review"), "Review");
  setLang("zh");
  assert.equal(t("nav.library"), "棋谱");
});

await test("the rules primer is complete in all four languages", () => {
  assert.equal(BASICS.length, 8);
  for (const card of BASICS) {
    for (const lang of LANG_IDS) {
      assert.ok(card.title[lang]?.trim(), `${card.id} title ${lang}`);
      assert.ok(card.text[lang]?.trim(), `${card.id} text ${lang}`);
    }
  }
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
  for (const opening of OPENINGS) {
    for (const lang of LANG_IDS) {
      assert.ok(opening.title[lang]?.trim(), `${opening.id} title ${lang}`);
      assert.ok(opening.text[lang]?.trim(), `${opening.id} text ${lang}`);
      assert.ok(opening.hint[lang]?.trim(), `${opening.id} hint ${lang}`);
    }
    assert.ok(!seen.has(opening.id), `${opening.id} duplicate id`);
    seen.add(opening.id);
    const game = new Game({ size: opening.size || 19, komi: opening.komi ?? 6.5 });
    game.setup(opening.setup, opening.toMove);
    for (const move of opening.line) {
      assert.equal(game.play(move.x, move.y, { color: move.c }).ok, true, `${opening.id} illegal line`);
    }
  }
});

await test("all lesson and puzzle positions and lines are legal", () => {
  const items = [
    ...LESSONS.map((item) => ({ ...item, kind: "lesson" })),
    ...TSUMEGO.map((item) => ({ ...item, kind: "puzzle" })),
  ];
  assert.equal(LESSONS.length, 60);
  assert.equal(TSUMEGO.length, 300);
  for (const item of items) {
    assert.equal(item.size, 9, `${item.id} size`);
    assert.ok(item.line.length > 0, `${item.id} line`);
    assert.equal(item.line[0].c, item.toMove, `${item.id} first move color`);
    const seen = new Set();
    for (const stone of item.setup) {
      assert.ok(stone.x >= 0 && stone.y >= 0 && stone.x < 9 && stone.y < 9, `${item.id} setup bounds`);
      assert.ok(stone.c === BLACK || stone.c === WHITE, `${item.id} setup color`);
      const key = `${stone.x},${stone.y}`;
      assert.ok(!seen.has(key), `${item.id} duplicate setup`);
      seen.add(key);
    }
    for (const lang of LANG_IDS) {
      for (const field of ["title", "text", "hint"]) {
        const value = item[field]?.[lang];
        if (field === "text" && item.kind === "puzzle") continue;
        assert.equal(typeof value, "string", `${item.id} ${field} ${lang}`);
        assert.ok(value.length > 0, `${item.id} ${field} ${lang}`);
      }
    }
    const game = new Game({ size: item.size, komi: 6.5 });
    game.setup(item.setup, item.toMove);
    for (const move of item.line) {
      const result = game.play(move.x, move.y, { color: move.c });
      assert.equal(result.ok, true, `${item.id} solution illegal at ${move.x},${move.y}`);
    }
  }
});

await test("the built-in opponent returns a legal move on 9x9 and 19x19", async () => {
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

await test("the native bridge sends a Japanese KataGo position and parses its move", async () => {
  let script = "";
  globalThis.zero = {
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo 19x19", version: "KataGo test" };
      if (command === "studio.katagoMove") {
        script = Buffer.from(payload.b64, "base64").toString("utf8");
        assert.equal(payload.color, "W");
        return { ok: true, move: "D4" };
      }
      throw new Error("unexpected command " + command);
    },
  };
  try {
    const { chooseMove: chooseKataGo } = await import("../src/web/js/katago.js?bridge-test");
    const game = newGame(19);
    game.play(15, 3);
    const move = await chooseKataGo(game, { level: 2 });
    assert.deepEqual(move, { x: 3, y: 15 });
    assert.match(script, /boardsize 19/);
    assert.match(script, /komi 6\.5/);
    assert.match(script, /kata-set-rules japanese/);
    assert.match(script, /play B Q16/);
  } finally {
    delete globalThis.zero;
  }
});

await test("review produces one point per main-line node", () => {
  const g = newGame();
  g.play(4, 4);
  g.play(3, 3);
  g.play(2, 2);
  const review = analyze(g);
  assert.equal(review.points.length, 4);
  assert.equal(review.moves, 3);
  assert.equal(review.counts.good + review.counts.inaccuracy + review.counts.mistake + review.counts.blunder, 3);
});

await test("the library keeps, opens and deletes a record", () => {
  writeJSON(KEYS.library, { games: [] });
  const g = newGame();
  g.play(4, 4);
  g.play(3, 3);
  const rec = Lib.saveGame(g, { name: "test game" });
  assert.equal(Lib.listGames().length, 1);
  assert.equal(Lib.getGame(rec.id).name, "test game");
  assert.equal(Lib.getGame(rec.id).moves, 2);
  const opened = loadSGF(rec.sgf).game;
  assert.equal(opened.mainLine().length, 3);
  Lib.deleteGame(rec.id);
  assert.equal(Lib.listGames().length, 0);
});

await test("due puzzles are stable and progress respects the review ladder", () => {
  writeJSON(KEYS.progress, {});
  const progress = loadProgress();
  const picks = duePuzzles(progress, TSUMEGO, 5);
  assert.equal(picks.length, 5);
  assert.equal(new Set(picks.map((p) => p.id)).size, 5);
  markPuzzle(progress, "cap-1", true);
  assert.equal(progress.puzzles["cap-1"].solved, true);
  assert.ok(progress.puzzles["cap-1"].due > Date.now());
  markPuzzle(progress, "cap-1", false);
  assert.equal(progress.puzzles["cap-1"].solved, true);
  assert.equal(progress.puzzles["cap-1"].streak, 0);
  touchStreak(progress);
  assert.equal(progress.streak.count, 1);
});

await test("Moka 9x9 assets are present and attributed", () => {
  for (const file of ["host.js", "index.js", "worker.js", "go-model.json", "go-model.bin", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(fs.existsSync(path.join(root, "src/web/moka", file)), `moka/${file}`);
  }
  const model = JSON.parse(fs.readFileSync(path.join(root, "src/web/moka/go-model.json"), "utf8"));
  assert.equal(model.architecture.boardSize, 9);
  assert.equal(fs.statSync(path.join(root, "src/web/moka/go-model.bin")).size, model.weightsBytes);
});

await test("static page inputs and build script are present", () => {
  for (const file of ["index.html", "styles.css", "fonts/inter-latin-wght-normal.woff2"]) {
    assert.ok(fs.existsSync(path.join(root, "src/web", file)), `src/web/${file}`);
  }
  assert.ok(fs.existsSync(path.join(root, "scripts/bundle.mjs")));
  assert.match(fs.readFileSync(path.join(root, "src/web/index.html"), "utf8"), /js\/bundle\.js/);
});

if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} tests passed.`);
