/**
 * Learn: the beginner bridges — capture Go and its small opponent, the
 * lesson-to-game bridges, the first count. Loaded by scripts/test.mjs;
 * receives the runner's helpers.
 */
import fs from "node:fs";
import path from "node:path";
import * as A from "../../src/web/js/capture-ai.js";
import { bridgeAfter, CAPTURE_AFTER, FIRST_GAME, FIRST_GAME_AFTER, measuredRank, newProfile } from "../../src/web/js/model/player.js";
import { COURSE } from "../../src/web/js/content/course.js";
import { RANKS } from "../../src/web/js/engine.js";
import { MESSAGES } from "../../src/web/js/messages.js";
import { LEARN } from "../../src/web/js/messages/learn.js";

/** A board from rows of X (black), O (white) and dots. */
function parse(rows) {
  const size = rows.length;
  const cells = new Int8Array(size * size);
  rows.forEach((r, y) => [...r].forEach((ch, x) => (cells[y * size + x] = ch === "X" ? 1 : ch === "O" ? -1 : 0)));
  return { size, cells };
}

const EMPTY_ROWS = (n) => Array.from({ length: n }, () => ".........");
const board = (...rows) => parse([...rows, ...EMPTY_ROWS(9 - rows.length)]);

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}

/** One capture game between two levels; returns the winner and the slowest move (ms). */
/** Every move's time in the self-play games (for the percentile check). */
const TIMES = [];

function selfPlay(levelBlack, levelWhite, seed) {
  const rng = seeded(seed);
  const b = { size: 9, cells: new Int8Array(81) };
  let c = 1;
  let last = null;
  let slowest = 0;
  for (let i = 0; i < 81; i++) {
    const t0 = performance.now();
    const m = A.chooseCaptureMove(b, c, { level: c === 1 ? levelBlack : levelWhite, last, rng });
    const ms = performance.now() - t0;
    slowest = Math.max(slowest, ms);
    TIMES.push(ms);
    if (!m) return { winner: -c, slowest, moves: i };
    const r = A.tryMove(b, m.p, c);
    if (!r) throw new Error("the computer chose an illegal move");
    if (r.captures) return { winner: c, slowest, moves: i + 1 };
    b.cells[m.p] = c;
    last = m.p;
    c = -c;
  }
  return { winner: 0, slowest, moves: 81 };
}

export default async function ({ test, assert, root }) {
  await test("learn capture Go: the computer always captures when it can", () => {
    // Random positions with no capture yet; whenever one is available, it takes it.
    let checked = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seeded(seed);
      const b = { size: 9, cells: new Int8Array(81) };
      const n = 8 + Math.floor(rng() * 30);
      for (let i = 0; i < n; i++) {
        const p = Math.floor(rng() * 81);
        if (!b.cells[p]) b.cells[p] = rng() < 0.5 ? 1 : -1;
      }
      if (A.chains(b).some((ch) => ch.libs.length === 0)) continue;
      const caps = A.captureMoves(b, -1);
      if (!caps.size) continue;
      for (const level of [1, 2]) {
        const m = A.chooseCaptureMove(b, -1, { level, rng });
        assert.equal(m.why, "capture", `seed ${seed} level ${level}`);
        assert.ok(caps.has(m.p), `seed ${seed}: plays a capturing point`);
      }
      checked++;
    }
    assert.ok(checked > 50, `only ${checked} positions had a capture`);
  });

  await test("learn capture Go: the computer saves its stone in atari", () => {
    // White's centre stone is in atari; extending gives it room.
    const b = board(".........", ".........", ".........", "....X....", "...XOX...", ".........");
    for (const level of [1, 2]) {
      const m = A.chooseCaptureMove(b, -1, { level, rng: seeded(level) });
      assert.equal(m.why, "save");
      assert.deepEqual([m.x, m.y], [4, 5]);
      const r = A.tryMove(b, m.p, -1);
      assert.ok(r.libs >= 2);
    }
  });

  await test("learn capture Go: ladders and nets are read; the gentle level reads less", () => {
    // A ladder: White's stone has two liberties and every escape is ataried to the edge.
    const ladder = board(".........", "..X......", ".XO......", "...X.....");
    assert.equal(A.canForceCapture(ladder, 1, { depth: 8, nets: false }), true);
    assert.equal(A.canForceCapture(ladder, 1, { depth: 1, nets: false }), false, "too deep for one move");
    const strong = A.chooseCaptureMove(ladder, 1, { level: 2, rng: seeded(3) });
    assert.equal(strong.why, "attack");
    // The answer works: after it, White cannot escape by force.
    assert.equal(A.canForceCapture(A.tryMove(ladder, strong.p, 1).next, 1, { depth: 8 }), true);
    // A net (geta): no ladder works, but the diagonal point catches the stone.
    const net = board(".........", ".........", ".........", ".O..X.X..", "...XO....", "..X......", "...X.....");
    assert.equal(A.canForceCapture(net, 1, { depth: 8, nets: false }), false, "no ladder here");
    assert.equal(A.canForceCapture(net, 1, { depth: 6, nets: true }), true, "the net works");
    const geta = A.chooseCaptureMove(net, 1, { level: 2, rng: seeded(4) });
    assert.equal(geta.why, "attack");
    assert.deepEqual([geta.x, geta.y], [5, 5]);
    assert.notEqual(A.chooseCaptureMove(net, 1, { level: 1, rng: seeded(4) }).why, "attack", "the gentle level does not see nets");
    // A double atari is seen at both levels.
    const dbl = board(".........", "...X.....", "..XO.....", ".XO......");
    for (const level of [1, 2]) {
      const m = A.chooseCaptureMove(dbl, 1, { level, rng: seeded(5) });
      assert.equal(m.why, "attack", `level ${level}`);
      assert.deepEqual([m.x, m.y], [3, 3], `level ${level}`);
    }
  });

  await test("learn capture Go: the computer defuses a ladder threat before it starts", () => {
    // White's stone has two liberties and Black threatens to ladder or net
    // it. The stronger level answers so that no forced capture remains.
    const b = board(".........", "..X......", ".XO......");
    for (let seed = 1; seed <= 20; seed++) {
      const m = A.chooseCaptureMove(b, -1, { level: 2, rng: seeded(seed) });
      const r = A.tryMove(b, m.p, -1);
      assert.ok(r && r.libs >= 2, `seed ${seed}: no self-atari`);
      assert.equal(A.canForceCapture(r.next, 1, { depth: 6, budget: 20000 }), false, `seed ${seed}: (${m.x},${m.y}) still loses by force`);
    }
  });

  await test("learn capture Go: two levels, stronger after two wins, every move well under 50 ms", () => {
    assert.equal(A.levelFor(0), 1);
    assert.equal(A.levelFor(1), 1);
    assert.equal(A.levelFor(2), 2);
    assert.equal(A.levelFor(9), 2);
    assert.deepEqual(Object.keys(A.LEVELS), ["1", "2"]);
    let strongWins = 0;
    let games = 0;
    let slowest = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const [b, w] of [[2, 1], [1, 2]]) {
        const g = selfPlay(b, w, seed);
        slowest = Math.max(slowest, g.slowest);
        if (g.winner === (b === 2 ? 1 : -1)) strongWins++;
        games++;
        assert.ok(g.moves >= 2, "a game lasts more than one move");
      }
    }
    assert.ok(strongWins / games > 0.5, `level 2 won ${strongWins} of ${games}`);
    // Each move's reading stops at a 25 ms deadline (capture-ai.js MOVE_MS).
    // Well under 50 ms for 99 moves in 100; a single garbage-collection or
    // compilation pause on a busy machine may take one longer, but never
    // anything a player would notice (the reply is paced at 380–740 ms).
    const sorted = TIMES.slice().sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    assert.ok(p99 < 50, `99th percentile ${p99.toFixed(1)} ms over ${sorted.length} moves`);
    assert.ok(slowest < 250, `slowest move ${slowest.toFixed(1)} ms`);
  });

  await test("learn capture Go: suicide is illegal and a full board has no move", () => {
    // The corner point is surrounded by White: Black may not play there.
    const b = board(".O.......", "O........");
    assert.equal(A.tryMove(b, 0, 1), null);
    assert.ok(A.tryMove(b, 0, -1));
    // Unless it captures: then it is legal (and wins).
    const c = board(".OX......", "OX.......", "X........");
    assert.equal(A.tryMove(c, 0, 1).captures, 2);
    assert.equal(A.hasLegalMove(board("........."), 1), true);
  });

  await test("learn bridges: capture Go after the capturing lessons, the first 9×9 game after the life basics", () => {
    const ids = COURSE.flatMap((u) => u.lessons.map((l) => l.id));
    for (const id of [...CAPTURE_AFTER, ...FIRST_GAME_AFTER]) assert.ok(ids.includes(id), id);
    const stones = COURSE.find((u) => u.id === "stones").lessons.map((l) => l.id);
    const at = stones.indexOf("stones-capture");
    assert.deepEqual(CAPTURE_AFTER, stones.slice(at, at + 3), "the capturing lesson and the two after it");
    const life = COURSE.find((u) => u.id === "life").lessons.map((l) => l.id);
    assert.ok(FIRST_GAME_AFTER.every((id) => life.includes(id)));
    assert.equal(FIRST_GAME_AFTER.at(-1), life.at(-1), "and at the end of the life unit");
    assert.equal(FIRST_GAME.size, 9);
    assert.equal(measuredRank(FIRST_GAME.level), RANKS[0], "the gentlest rank");
    const none = newProfile();
    assert.equal(bridgeAfter("stones-capture", none), "capture");
    assert.equal(bridgeAfter("stones-suicide", none), "capture");
    assert.equal(bridgeAfter("stones-ko", none), null);
    assert.equal(bridgeAfter("stones-capture", none, { captureWins: 1 }), "capture");
    assert.equal(bridgeAfter("stones-capture", none, { captureWins: 2 }), null, "two wins: no longer offered");
    assert.equal(bridgeAfter("life-two-eyes", none), "firstGame");
    assert.equal(bridgeAfter("life-space", none), "firstGame");
    assert.equal(bridgeAfter("life-eye", none), null);
    assert.equal(bridgeAfter("life-two-eyes", { ...none, games: [{ id: "1" }] }), null, "not after a first game");
    // The page reads it from the player model and the capture wins setting.
    const done = fs.readFileSync(path.join(root, "src/web/js/app/beginner.jsx"), "utf8");
    assert.match(done, /bridgeAfter\(L\.lesson\.id, state\.profile, \{ captureWins: state\.settings\.captureWins \}\)/);
  });

  await test("learn beginner: capture games stay out of the game, the history of games and the player model", () => {
    const src = fs.readFileSync(path.join(root, "src/web/js/app/capture-ctl.js"), "utf8");
    // Its own state in Learn; none of the rated-game machinery.
    for (const word of ["state.game", "Games.", "saveGame", "recordGame", "changeProfile", "queueReport", "persistCurrent", "state.profile"]) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.ok(!code.includes(word), `capture-ctl uses ${word}`);
    }
    // Not in New game, Play or the sidebar: in Learn only (its path and the lesson-complete page).
    for (const f of ["app/sheets.jsx", "app/app.jsx", "app/chrome.jsx", "play/home.jsx", "app/play.jsx"]) {
      const s = fs.readFileSync(path.join(root, "src/web/js", f), "utf8");
      assert.ok(!/capture\.play|startCapture/.test(s), `${f} offers capture Go`);
    }
    assert.match(fs.readFileSync(path.join(root, "src/web/js/learn/session.js"), "utf8"), /startCapture\(\{ daily: s \}\)/, "an item of the path");
  });

  await test("learn beginner: strings in four languages; the first-count note is at most three sentences", () => {
    for (const [key, v] of Object.entries(LEARN)) {
      assert.deepEqual(MESSAGES[key], v, key);
      for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(v[lang]?.trim(), `${key} ${lang}`);
    }
    const note = LEARN["firstCount.note"];
    for (const lang of ["zh", "ja"]) assert.ok((note[lang].match(/。/g) || []).length <= 3, lang);
    for (const lang of ["en", "ko"]) assert.ok((note[lang].match(/\.(\s|$)/g) || []).length <= 3, lang);
    assert.ok(note.zh.includes("死子") && note.zh.includes("贴目"), "the Chinese uses 死子 and 贴目");
    assert.ok(LEARN["capture.title"].zh === "吃子棋");
    assert.ok(LEARN["onboarding.rulesHelp"].en.includes("9×9"));
    // The old 19×19 wording is gone from the base table (one source per key).
    const base = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8");
    assert.ok(!base.includes('"onboarding.rulesHelp"'));
  });
}
