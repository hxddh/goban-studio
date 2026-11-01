/**
 * v3 app-logic checks: rating, clocks, mistake insight, problem windows and
 * the string table coverage of every v3 view. Run by `npm test`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rankToRating, ratingToRank, updateRating, startRating, expected } from "../src/web/js/app/rating.js";
import { newClock, tick, moveMade, formatClock } from "../src/web/js/app/clock.js";
import { ataris, lossSource, classifyMistake, settled, complexity, addWeakness, topWeaknesses } from "../src/web/js/app/insight.js";
import { MESSAGES } from "../src/web/js/messages.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let count = 0;
let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    count++;
    process.stdout.write(`ok ${count} - ${name}\n`);
  } catch (e) {
    failures++;
    console.error(`not ok - ${name}`);
    console.error(e);
  }
}

const empty = (n) => Array.from({ length: n }, () => Array(n).fill(0));

await test("ranks and ratings map both ways on the EGF scale", () => {
  assert.equal(rankToRating(1), 2000);
  assert.equal(rankToRating(0), 2100); // 1 dan
  assert.equal(rankToRating(-1), 2200); // 2 dan
  assert.equal(rankToRating(25), -400);
  assert.equal(ratingToRank(2000), 1);
  assert.equal(ratingToRank(2150), 0);
  assert.equal(ratingToRank(1450), 7);
  assert.equal(ratingToRank(-5000), 30);
  assert.ok(Math.abs(expected(1000, 1000) - 0.5) < 1e-9);
});

await test("winning raises the rating, losing lowers it, and early games move it more", () => {
  const r0 = startRating(15);
  const won = updateRating(r0, { opponentRating: rankToRating(15), won: true });
  const lost = updateRating(r0, { opponentRating: rankToRating(15), won: false });
  assert.ok(won.r > r0.r && lost.r < r0.r);
  assert.equal(won.games, 1);
  let r = { r: 1000, games: 30, history: [] };
  const late = updateRating(r, { opponentRating: 1000, won: true });
  const early = updateRating({ r: 1000, games: 0, history: [] }, { opponentRating: 1000, won: true });
  assert.ok(early.r - 1000 > late.r - 1000);
  // Handicap makes the opponent effectively weaker: a win is worth less.
  const withHc = updateRating({ r: 1000, games: 10, history: [] }, { opponentRating: 1000, handicap: 4, won: true });
  const even = updateRating({ r: 1000, games: 10, history: [] }, { opponentRating: 1000, won: true });
  assert.ok(withHc.r < even.r);
  assert.equal(won.history.length, 2);
});

await test("per-move clock flags after 30 seconds and resets after a move", () => {
  let c = newClock("move30");
  let r = tick(c, 1, 29);
  assert.equal(r.flagged, false);
  c = moveMade(r.clock, 1);
  assert.equal(c.b.left, 30);
  r = tick(c, 1, 30.5);
  assert.equal(r.flagged, true);
  assert.equal(newClock("none"), null);
});

await test("byo-yomi uses main time, then periods, then flags", () => {
  let c = newClock("byoyomi");
  let r = tick(c, -1, 600);
  assert.equal(r.flagged, false);
  assert.equal(r.clock.w.inByo, true);
  r = tick(r.clock, -1, 31); // one period used
  assert.equal(r.clock.w.periods, 2);
  r = tick(r.clock, -1, 61);
  assert.equal(r.flagged, true);
  assert.equal(formatClock({ left: 75 }), "1:15");
});

await test("atari detection finds chains with one liberty", () => {
  const b = empty(9);
  b[0][0] = -1;
  b[0][1] = 1;
  const list = ataris(b);
  assert.equal(list.length, 1);
  assert.equal(list[0].color, -1);
});

await test("loss source finds the group that died and classifies the mistake", () => {
  const n = 9;
  const b = empty(n);
  // A black group in the corner that dies after the mistake.
  b[0][0] = 1;
  b[0][1] = 1;
  b[1][0] = 1;
  b[1][1] = -1;
  const before = new Float32Array(n * n).fill(0);
  const after = new Float32Array(n * n).fill(0);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2]]) {
    before[y * n + x] = 0.8;
    after[y * n + x] = -0.9;
  }
  const src = lossSource(b, before, after, 1);
  assert.ok(src);
  assert.equal(src.kind, "group");
  assert.equal(src.stones.length, 3);
  assert.ok(src.size >= 7);
  const theme = classifyMistake({ signMapBefore: b, move: { x: 2, y: 2, color: 1 }, pv: [], source: src, mover: 1 });
  assert.ok(["eye-space", "race-outside", "vital-point"].includes(theme));
  assert.equal(lossSource(b, null, after, 1), null);
});

await test("settled ownership and complexity read the search", () => {
  assert.equal(settled(new Float32Array(81).fill(0.95)), true);
  assert.equal(settled(new Float32Array(81).fill(0.2)), false);
  const easy = complexity({ moves: [{ visits: 95, scoreLead: 3 }, { visits: 5, scoreLead: -2 }] });
  const hard = complexity({ moves: [{ visits: 40, scoreLead: 1 }, { visits: 35, scoreLead: 0.8 }, { visits: 25, scoreLead: 0.5 }] });
  assert.ok(hard > easy);
});

await test("weaknesses accumulate and fade with time", () => {
  const now = Date.now();
  let w = addWeakness({}, "ladder", now);
  w = addWeakness(w, "ladder", now);
  w = addWeakness(w, "eye-space", now);
  assert.equal(topWeaknesses(w, 1)[0].theme, "ladder");
  const later = addWeakness(w, null, now + 120 * 86400000);
  assert.deepEqual(Object.keys(later), []);
});

await test("every key the v3 views use is in the string table", () => {
  const dir = path.join(root, "src/web/js/app");
  const used = new Set();
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/\bt\("([a-zA-Z0-9_.-]+)"/g)) used.add(m[1]);
  }
  for (const k of ["time.none", "time.move30", "time.byoyomi"]) used.add(k);
  const missing = [...used].filter((k) => !k.endsWith(".") && !MESSAGES[k]);
  assert.deepEqual(missing, []);
  for (const [key, v] of Object.entries(MESSAGES)) for (const l of ["zh", "en", "ko", "ja"]) assert.ok(v[l]?.trim(), `${key} ${l}`);
});

if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} app tests passed.`);
