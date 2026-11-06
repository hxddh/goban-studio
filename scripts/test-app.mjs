/**
 * v3 app-logic checks: rating, clocks, mistake insight, problem windows and
 * the string table coverage of every v3 view. Run by `npm test`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { weekStart } from "../src/web/js/app/week.js";
import { rankToRating, ratingToRank } from "../src/web/js/app/rating.js";
import { expectedScore, levelTheta, migrateEstimate, rateGame, startEstimate } from "../src/web/js/app/strength.js";
import { newClock, tick, moveMade, formatClock } from "../src/web/js/app/clock.js";
import { ataris, lossSource, classifyMistake, settled, complexity, addWeakness, topWeaknesses } from "../src/web/js/app/insight.js";
import { attributeLoss } from "../src/web/js/app/insight.js";
import { describe, narrate, simulate, storyText } from "../src/web/js/app/story.js";
import { describeMistakes, summaryOf } from "../src/web/js/app/explain.js";
import { BLACK, WHITE, Game, MARK_KINDS } from "../src/web/js/rules.js";
import { PHASES, gameRecord, phaseBoundaries, phaseThresholds, recordAnalysis, settledShare, summarizeGame, themeCounts, trends } from "../src/web/js/app/summary.js";
import { setLang } from "../src/web/js/i18n.js";
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

await test("the week begins on Monday at 00:00 local time", () => {
  const now = new Date(2026, 10, 4, 15, 0); // Wednesday
  const mon = weekStart(now);
  assert.equal(new Date(mon).getDay(), 1);
  assert.equal(new Date(mon).getHours(), 0);
  assert.equal(weekStart(new Date(mon)), mon);
});

await test("ranks and ratings map both ways on the EGF scale", () => {
  assert.equal(rankToRating(1), 2000);
  assert.equal(rankToRating(0), 2100); // 1 dan
  assert.equal(rankToRating(-1), 2200); // 2 dan
  assert.equal(rankToRating(25), -400);
  assert.equal(ratingToRank(2000), 1);
  assert.equal(ratingToRank(2150), 0);
  assert.equal(ratingToRank(1450), 7);
  assert.equal(ratingToRank(-5000), 30);
  // v6: an equal opponent is an even game.
  assert.ok(Math.abs(expectedScore(5, 5) - 0.5) < 1e-9);
});

await test("winning raises the rating, losing lowers it, and early games move it more", () => {
  // v6: the strength estimate (strength.js) replaces the v5 Elo update.
  const r0 = startEstimate(12, 0);
  const won = rateGame(r0, { level: "10k", won: true, at: 0 });
  const lost = rateGame(r0, { level: "10k", won: false, at: 0 });
  assert.ok(won.r > r0.r && lost.r < r0.r);
  assert.equal(won.games, 1);
  const late = rateGame(migrateEstimate({ r: 1000, games: 30, history: [] }, 0), { level: "10k", won: true, at: 0 });
  const early = rateGame(migrateEstimate({ r: 1000, games: 0, history: [] }, 0), { level: "10k", won: true, at: 0 });
  assert.ok(early.r - 1000 > late.r - 1000);
  // Handicap makes the opponent effectively weaker: a win is worth less.
  const base = migrateEstimate({ r: 1000, games: 10, history: [] }, 0);
  const withHc = rateGame(base, { level: "10k", handicap: 4, won: true, at: 0 });
  const even = rateGame(base, { level: "10k", won: true, at: 0 });
  assert.ok(withHc.r < even.r);
  assert.ok(levelTheta("10k", { handicap: 4 }) < levelTheta("10k"));
  assert.equal(won.history.length, 2);
  assert.equal(rankToRating(12), 900);
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

/* ------------------------------------------------- v4 review: stories */

/** Sign map from rows of X (Black), O (White) and . (empty), padded to `n`. */
function parse(rows, n = 9) {
  const b = empty(n);
  rows.forEach((r, y) => [...r.replace(/\s+/g, "")].forEach((ch, x) => (b[y][x] = ch === "X" ? 1 : ch === "O" ? -1 : 0)));
  return b;
}
const mv = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const keyOf = (b, color, x, y, opts) => describe(simulate(b, color, [{ x, y }], opts)[0]).key;

await test("story: single moves are described from the board", () => {
  // Capture and atari.
  assert.equal(keyOf(parse([".X", "XOX"]), 1, 1, 2), "story.capture1");
  assert.equal(keyOf(parse([".X", "XO"]), 1, 2, 1), "story.atari1");
  // Double atari: two white stones left with one liberty each.
  const da = parse(["....", "...X", "...OX", ".XO", "..X"]);
  assert.equal(keyOf(da, 1, 2, 2), "story.doubleAtari");
  // Connect two black stones; cut two white ones.
  assert.equal(keyOf(parse(["", ".X.X"]), 1, 2, 1), "story.connect");
  assert.equal(keyOf(parse(["..X", ".O", "..O"]), 1, 2, 1), "story.cut");
  // Hane round a white stone; plain extension.
  assert.equal(keyOf(parse(["", "", "..XO"]), 1, 3, 3), "story.hane");
  assert.equal(keyOf(parse(["", "", "..XO"]), 1, 2, 3), "story.extend");
  // Attach to a lone white stone.
  assert.equal(keyOf(parse(["", "", "....O"]), 1, 4, 3), "story.attach");
  // Escape: a black stone in atari runs out.
  assert.equal(keyOf(parse([".O", "OXO"]), 1, 1, 2), "story.escape");
  // Second eye on the edge: (1,0) is one eye, (4,0) makes (3,0) the second.
  const eye = parse(["X.X..O", "XXXXXO", "OOOOOO"]);
  assert.equal(keyOf(eye, 1, 4, 0), "story.secondEye");
  // A white stone on the diagonal makes the edge eye at (1,0) false.
  const fe = parse(["X.XX", "XX"]);
  assert.equal(keyOf(fe, -1, 2, 1), "story.removeEye");
});

await test("story: opening moves on 19×19 read the whole-board situation", () => {
  const b = empty(19);
  assert.equal(keyOf(b, 1, 3, 3), "story.corner");
  b[3][3] = -1;
  assert.equal(keyOf(b, 1, 5, 2), "story.approach");
  b[15][15] = 1;
  b[3][15] = 1;
  assert.equal(keyOf(b, 1, 9, 3), "story.bigPoint");
  const step = describe(simulate(b, 1, [{ x: 9, y: 3 }])[0]);
  assert.deepEqual(step.params[1], { key: "area.top" });
  // Invading between two white stones, with and without ownership.
  b[3][7] = -1;
  b[3][11] = -1;
  assert.equal(keyOf(b, 1, 9, 3), "story.invade");
  const own = new Float32Array(361).fill(0);
  own[3 * 19 + 9] = -0.8; // White's area (Black's point of view)
  assert.equal(keyOf(b, 1, 9, 3, { ownership: own }), "story.invade");
  own[3 * 19 + 9] = 0.6;
  assert.notEqual(keyOf(b, 1, 9, 3, { ownership: own }), "story.invade");
});

await test("story: a ladder is told as a ladder, and the line stops at a capture", () => {
  const b = parse(["", "", "", "....X", "...XO", ".....X"]);
  const pv = mv([[4, 5], [5, 4], [6, 4], [5, 3], [5, 2], [6, 3], [7, 3], [6, 2], [6, 1], [7, 2], [8, 2], [7, 1], [7, 0], [8, 1], [8, 0]]);
  const facts = simulate(b, 1, pv);
  assert.equal(facts.length, pv.length);
  assert.equal(facts[0].ladder, "start");
  assert.equal(facts[1].ladder, "run");
  assert.equal(facts[2].ladder, "chase");
  assert.equal(facts[14].captured.length, 8);
  const steps = narrate(facts);
  assert.equal(steps.length, 6);
  assert.deepEqual(
    steps.slice(0, 3).map((s) => s.key),
    ["story.ladderStarts", "story.ladderRun", "story.ladder"],
  );
  assert.equal(steps[0].color, 1);
  assert.equal(steps[1].color, -1);
  assert.deepEqual(steps[0].targets, [{ x: 4, y: 4 }]);
  // Not a ladder: one atari, then the stone runs to freedom.
  const free = simulate(parse(["", "", "", "....X", "...XO"]), 1, mv([[5, 4], [4, 5]]));
  assert.equal(free[0].ladder, undefined);
  // A short decisive line stops after the capture once three steps are told.
  const cap = narrate(simulate(parse([".X", "XOX", "...", "", "", "", "......X"]), 1, mv([[6, 5], [7, 7], [1, 2], [2, 7], [3, 7]])));
  assert.equal(cap[2].key, "story.capture1");
  assert.equal(cap.length, 3);
});

await test("story: ko, retaking the ko and snapback come from the rules", () => {
  const ko = parse([".XO", "XO.O", ".XO"]);
  const f = simulate(ko, 1, mv([[2, 1], [6, 6], [6, 7], [1, 1]]));
  assert.equal(f[0].ko, true);
  assert.equal(describe(f[0]).key, "story.takeKo");
  assert.equal(describe(f[3]).key, "story.retakeKo");
  assert.deepEqual(f[0].captured, [{ x: 1, y: 1 }]);
  const sb = parse(["..XO.OX", "..XO.OX", "...XXX"]);
  const s = simulate(sb, 1, mv([[4, 0], [4, 1], [4, 0]]));
  assert.equal(describe(s[0]).key, "story.throwIn");
  assert.equal(describe(s[1]).key, "story.capture1");
  assert.equal(describe(s[2]).key, "story.snapback");
  assert.deepEqual(describe(s[2]).params[1], 5);
  // An illegal move ends the line instead of throwing.
  assert.equal(simulate(ko, 1, mv([[1, 0]])).length, 0);
});

await test("loss attribution: a group that died, a lost race, territory, tempo, ko", () => {
  const n = 9;
  const own = () => new Float32Array(n * n);
  // A black corner group dies.
  const b = parse(["XX", "XO"]);
  let before = own();
  let after = own();
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2]]) {
    before[y * n + x] = 0.8;
    after[y * n + x] = -0.9;
  }
  let a = attributeLoss({ signMapBefore: b, ownBefore: before, ownAfter: after, mover: 1, move: { x: 2, y: 2 }, best: { x: 1, y: 2 }, loss: 8.3 });
  assert.equal(a.kind, "group-died");
  assert.equal(a.points, 8.3);
  assert.equal(a.regions[0].lost.length, 3);
  assert.equal(a.regions[0].area, "top-left");
  assert.equal(a.regions[0].pts, 8.5);
  assert.equal(summaryOf(a, { x: 1, y: 2 }, 9).key, "story.sum.groupDied");

  // A capturing race: black and white chains side by side, white lives.
  const race = parse(["XXO", "OOO", "..."]);
  before = own();
  after = own();
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 3; y++) {
      before[y * n + x] = 0.7;
      after[y * n + x] = -0.8;
    }
  a = attributeLoss({ signMapBefore: race, ownBefore: before, ownAfter: after, mover: 1, move: { x: 6, y: 6 }, best: { x: 3, y: 0 }, loss: 10 });
  assert.equal(a.kind, "semeai");
  assert.equal(classifyMistake({ signMapBefore: race, mover: 1, attribution: a, facts: [] }), "race-outside");

  // Territory: an empty area next to the move flips.
  const terr = empty(9);
  before = own();
  after = own();
  for (let x = 5; x < 9; x++)
    for (let y = 5; y < 9; y++) {
      before[y * n + x] = 0.6;
      after[y * n + x] = -0.4;
    }
  a = attributeLoss({ signMapBefore: terr, ownBefore: before, ownAfter: after, mover: 1, move: { x: 5, y: 4 }, best: { x: 6, y: 5 }, loss: 6 });
  assert.equal(a.kind, "territory");
  assert.equal(a.regions[0].area, "bottom-right");

  // Tempo: the move was inside Black's settled corner; the loss is where the best move was.
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) before[y * n + x] = 0.95;
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) after[y * n + x] = 0.95;
  a = attributeLoss({ signMapBefore: terr, ownBefore: before, ownAfter: after, mover: 1, move: { x: 1, y: 1 }, best: { x: 6, y: 6 }, loss: 6 });
  assert.equal(a.kind, "tempo");
  assert.equal(a.slow, true);
  assert.equal(summaryOf(a, { x: 6, y: 6 }, 9).key, "story.sum.slow");
  a = attributeLoss({ signMapBefore: terr, ownBefore: before, ownAfter: after, mover: 1, move: { x: 4, y: 0 }, best: { x: 6, y: 6 }, loss: 6 });
  assert.equal(a.kind, "tempo");
  assert.equal(a.slow, false);
  assert.deepEqual(summaryOf(a, { x: 6, y: 6 }, 9), { key: "story.sum.bigPoint", params: [{ key: "area.bottom-right" }, "6"] });

  // Ko: the punishing line takes a ko in the area that flipped.
  a = attributeLoss({ signMapBefore: terr, ownBefore: before, ownAfter: after, mover: 1, move: { x: 5, y: 4 }, best: { x: 6, y: 5 }, loss: 6, refutation: [{ ko: true, move: { x: 6, y: 6 } }] });
  assert.equal(a.kind, "ko");
  assert.equal(classifyMistake({ signMapBefore: terr, mover: 1, attribution: a, facts: [] }), "ko");

  // White's point of view: the same area flipping the other way is White's loss.
  a = attributeLoss({ signMapBefore: terr, ownBefore: after, ownAfter: before, mover: -1, move: { x: 5, y: 4 }, best: { x: 6, y: 5 }, loss: 6 });
  assert.equal(a.kind, "territory");

  // No ownership (offline estimate): only the score is known.
  a = attributeLoss({ signMapBefore: terr, ownBefore: null, ownAfter: null, mover: 1, loss: 3 });
  assert.deepEqual(a, { kind: "loss", points: 3, regions: [], slow: false });
  assert.deepEqual(summaryOf(a, null, 9), { key: "story.sum.loss", params: ["3"] });
});

await test("classifying a mistake reads the punishing line: ladder, vital point, cut", () => {
  const n = 9;
  // Black's stone at (4,4) dies in a ladder after Black played elsewhere.
  const b = parse(["", "", "", "....O", "...OX", ".....O"]);
  const before = new Float32Array(n * n);
  const after = new Float32Array(n * n);
  for (let x = 3; x < 9; x++)
    for (let y = 0; y < 6; y++) {
      before[y * n + x] = 0.5;
      after[y * n + x] = -0.6;
    }
  // The white stones were alive all along.
  for (const [x, y] of [[4, 3], [3, 4], [5, 5]]) before[y * n + x] = after[y * n + x] = -0.9;
  const pv = mv([[4, 5], [5, 4], [6, 4], [5, 3], [5, 2], [6, 3], [7, 3]]);
  const facts = simulate(b, -1, pv);
  const att = attributeLoss({ signMapBefore: b, ownBefore: before, ownAfter: after, mover: 1, move: { x: 0, y: 8 }, best: { x: 4, y: 5 }, loss: 7, refutation: facts });
  assert.equal(att.kind, "group-died");
  assert.equal(classifyMistake({ signMapBefore: b, mover: 1, attribution: att, facts }), "ladder");
  // A placement inside Black's eye space kills: vital point.
  const g = parse(["X...X", "XXXXX", "OOOOO"]);
  const own0 = new Float32Array(n * n);
  const own1 = new Float32Array(n * n);
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 2; y++) {
      own0[y * n + x] = 0.9;
      own1[y * n + x] = -0.9;
    }
  const f2 = simulate(g, -1, mv([[2, 0]]));
  const a2 = attributeLoss({ signMapBefore: g, ownBefore: own0, ownAfter: own1, mover: 1, move: { x: 8, y: 8 }, best: { x: 2, y: 0 }, loss: 12, refutation: f2 });
  assert.equal(classifyMistake({ signMapBefore: g, signMapAfter: g, mover: 1, attribution: a2, facts: f2 }), "vital-point");
  // Territory lost to a cut.
  const c = parse(["", "", "..X", "...X", "", "", "", "", ""]);
  const o0 = new Float32Array(n * n);
  const o1 = new Float32Array(n * n);
  for (let x = 2; x < 6; x++)
    for (let y = 2; y < 6; y++) {
      o0[y * n + x] = 0.6;
      o1[y * n + x] = -0.5;
    }
  // The two black stones themselves survive; the area between them is lost.
  for (const [x, y] of [[2, 2], [3, 3]]) o0[y * n + x] = o1[y * n + x] = 0.9;
  const f3 = simulate(c, -1, mv([[3, 2]]));
  assert.equal(f3[0].cuts, 2);
  const a3 = attributeLoss({ signMapBefore: c, ownBefore: o0, ownAfter: o1, mover: 1, move: { x: 2, y: 3 }, best: { x: 3, y: 2 }, loss: 5, refutation: f3 });
  assert.equal(a3.kind, "territory");
  assert.equal(classifyMistake({ signMapBefore: c, mover: 1, attribution: a3, facts: f3 }), "cut");
  // Tempo is strategic: no tactical theme.
  assert.equal(classifyMistake({ signMapBefore: c, mover: 1, attribution: { kind: "tempo", regions: [], points: 3 }, facts: [] }), null);
});

/** A 9×9 game and a synthetic whole-game analysis with one big mistake. */
function syntheticReview({ engine = true } = {}) {
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

await test("describeMistakes: attribution, theme and both stories for each key mistake", () => {
  const { game, points } = syntheticReview();
  const { top } = describeMistakes(game, points);
  assert.equal(top.length, 1);
  const km = top[0];
  assert.equal(km.index, 3); // Black's 6,2 let White take the corner
  assert.equal(km.move.color, 1);
  assert.equal(km.attribution.kind, "group-died");
  assert.ok(km.source && km.source.kind === "group", "legacy source kept for the v3 view");
  assert.equal(km.story.summary.key, "story.sum.groupDied");
  assert.ok(km.story.better.length >= 3 && km.story.better.length <= 6);
  assert.deepEqual(km.story.better[0].move, { x: 2, y: 0 });
  assert.equal(km.story.better[0].color, 1);
  assert.equal(km.story.playedFrom, "engine");
  assert.deepEqual(km.story.played[0].move, { x: 6, y: 2 });
  assert.equal(km.story.played[1].color, -1);
  assert.deepEqual(km.story.played[1].move, { x: 2, y: 0 });
  for (const s of [...km.story.better, ...km.story.played]) {
    assert.ok(MESSAGES[s.key], s.key);
    assert.ok(Array.isArray(s.params) && s.n >= 1);
  }
  // A deeper analysis of the position after the mistake replaces the refutation.
  const refined = { 3: { ...points[3], pv: mv([[1, 2], [2, 1]]) } };
  const again = describeMistakes(game, points, null, 3, refined).top[0];
  assert.equal(again.refined, true);
  assert.deepEqual(again.story.played[1].move, { x: 1, y: 2 });
});

await test("describeMistakes degrades without KataGo: game continuation, score-only summary", () => {
  const { game, points } = syntheticReview({ engine: false });
  const km = describeMistakes(game, points).top[0];
  assert.equal(km.attribution.kind, "loss");
  assert.equal(km.theme, null);
  assert.deepEqual(km.story.better, []);
  assert.equal(km.story.playedFrom, "game");
  assert.deepEqual(km.story.played[0].move, { x: 6, y: 2 });
  assert.ok(km.story.played.length >= 3);
  assert.equal(km.story.summary.key, "story.sum.loss");
  // Missing points entirely: nothing to explain, nothing thrown.
  assert.deepEqual(describeMistakes(game, points.map(() => null)).top, []);
});

await test("story text is complete in all four languages", () => {
  const { game, points } = syntheticReview();
  const km = describeMistakes(game, points).top[0];
  const entries = [km.story.summary, ...km.story.better, ...km.story.played];
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("story.") && !k.startsWith("story.sum.") && !["story.title", "story.better", "story.played", "story.playedGame", "story.step", "story.refining"].includes(k));
  for (const k of keys) entries.push({ key: k, params: [{ key: "common.black" }, { key: "area.top" }] });
  for (const lang of ["zh", "en", "ko", "ja"]) {
    setLang(lang);
    for (const e of entries) {
      const s = storyText(e);
      assert.ok(s && !/\{\d\}/.test(s) && !s.includes("story."), `${lang} ${e.key}: ${s}`);
    }
  }
  setLang("en");
  assert.equal(storyText({ key: "story.capture", params: [{ key: "common.white" }, 3] }), "White captures 3 stones");
  assert.equal(storyText(null), "");
  // The v4 strings sit in one block.
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8");
  const block = src.slice(src.indexOf("// v4 review"), src.indexOf("// end v4 review"));
  for (const k of Object.keys(MESSAGES).filter((k) => k.startsWith("story.") || k.startsWith("lossKind."))) assert.ok(block.includes(`"${k}"`), k);
});

/* ------------------------------------------------------------------ v5 */

/**
 * A 13×13 game of 80 moves with no captures (Black fills the top rows,
 * White the bottom), and an analysis where each listed move loses the given
 * points. Phases on 13×13 by move number: opening 1–20, endgame from 76.
 */
function v5Review({ losses = {}, source = "katago", settledFrom = null, humanColor = BLACK } = {}) {
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

await test("v5: phase boundaries scale with the board and follow KataGo's ownership when there is one", () => {
  assert.deepEqual(phaseThresholds(19), { openingEnd: 43, endgameStart: 162 });
  assert.deepEqual(phaseThresholds(13), { openingEnd: 20, endgameStart: 76 });
  assert.deepEqual(phaseThresholds(9), { openingEnd: 10, endgameStart: 36 });
  const plain = v5Review();
  const b = phaseBoundaries(13, plain.points, plain.points.length);
  assert.deepEqual([b.opening, b.middle, b.endgame, b.method], [[1, 20], [21, 75], [76, 80], "moves"]);
  const owned = v5Review({ settledFrom: 60 });
  const o = phaseBoundaries(13, owned.points, owned.points.length);
  assert.deepEqual([o.middle, o.endgame, o.method], [[21, 59], [60, 80], "ownership"]);
  const never = v5Review({ settledFrom: 999 });
  const nv = phaseBoundaries(13, never.points, never.points.length);
  assert.equal(nv.endgame[0] > nv.endgame[1], true, "a game that never settled has no endgame");
  // A short game is all opening.
  const short = phaseBoundaries(19, [], 12);
  assert.deepEqual(short.opening, [1, 11]);
  assert.ok(short.middle[0] > short.middle[1] && short.endgame[0] > short.endgame[1]);
  assert.equal(settledShare(null), null);
});

await test("v5: summarizeGame counts losses, mistakes, blunders and accuracy per phase and player", () => {
  const review = v5Review({ losses: { 5: 3, 25: 8, 79: 2.5, 30: 4 } });
  const s = summarizeGame(review);
  assert.equal(s.confidence, "high");
  assert.equal(s.source, "katago");
  assert.equal(s.moves, 80);
  const [op, mid, end] = s.phases;
  assert.deepEqual([op.id, op.from, op.to, mid.from, mid.to, end.from, end.to], ["opening", 1, 20, 21, 75, 76, 80]);
  assert.deepEqual([op.players.black.loss, op.players.black.mistakes, op.players.black.blunders], [3, 1, 0]);
  assert.deepEqual([mid.players.black.loss, mid.players.black.mistakes, mid.players.black.blunders], [8, 0, 1]);
  assert.deepEqual([end.players.black.loss, end.players.black.mistakes], [2.5, 1]);
  assert.deepEqual([mid.players.white.loss, mid.players.white.mistakes], [4, 1]);
  assert.equal(mid.players.black.worst.index, 25);
  assert.equal(mid.players.black.worst.coord, "N13");
  assert.equal(op.players.black.moves, 10);
  assert.equal(op.players.black.measured, 10);
  assert.equal(op.players.black.accuracy, 0.9);
  const tot = s.players.black;
  assert.deepEqual([tot.moves, tot.loss, tot.mistakes, tot.blunders], [40, 13.5, 2, 1]);
  assert.equal(tot.accuracy, 0.925);
  assert.equal(tot.basis.candidates, 0, "the played moves were not KataGo's candidates here");
  // Three takeaways for the player (Black): where the points went, the
  // costliest move, and the steady opening.
  assert.deepEqual(s.takeaways.map((t) => t.kind), ["phase", "worst", "steady"]);
  assert.equal(s.takeaways[0].key, "gameSummary.take.worstPhase");
  assert.deepEqual(s.takeaways[0].params.slice(0, 3), [{ key: "phaseIn.middle" }, "8", 59]);
  assert.equal(s.takeaways[1].index, 25);
  assert.equal(s.takeaways[2].phase, "opening");
  // Without a player's colour both sides are described, with *Of keys.
  const both = summarizeGame({ ...review, meta: {} });
  assert.ok(both.takeaways.length === 3 && both.takeaways.every((t) => /Of$/.test(t.key)));
});

await test("v5: accuracy reads the candidate list when the played move is one of KataGo's candidates", () => {
  const review = v5Review({ losses: { 3: 3 } });
  const mv = review.game.mainLine()[3].move;
  // KataGo saw the played move as only half a point worse than its best.
  review.points[2].moves = [{ x: 6, y: 6, visits: 30, scoreLead: 0 }, { x: mv.x, y: mv.y, visits: 12, scoreLead: -0.5 }];
  const s = summarizeGame(review);
  assert.equal(s.players.black.basis.candidates, 1);
  assert.equal(s.players.black.accuracy, 1, "within a point by the candidate list");
  assert.equal(s.players.black.mistakes, 1, "the loss itself still comes from the lead change");
});

await test("v5: summarizeGame degrades with the offline estimate and with no analysis", () => {
  const s = summarizeGame(v5Review({ losses: { 25: 8, 27: 5 }, source: "estimate" }));
  assert.equal(s.confidence, "low");
  assert.equal(s.players.black.accuracy, null, "accuracy is not claimed from an estimate");
  assert.equal(s.players.black.loss, 13);
  assert.deepEqual(s.takeaways.map((t) => t.kind), ["phase", "worst", "estimate"]);
  assert.equal(s.takeaways[2].key, "gameSummary.estimate");
  const none = v5Review();
  const empty = summarizeGame({ ...none, points: none.points.map(() => null) });
  assert.equal(empty.confidence, "none");
  assert.deepEqual(empty.takeaways, []);
  assert.equal(empty.players.black.moves, 40);
  assert.equal(empty.players.black.measured, 0);
  // A partly analysed KataGo review is low confidence until it is done.
  const part = v5Review();
  part.points = part.points.map((p, i) => (i < 40 ? p : null));
  assert.equal(summarizeGame(part).confidence, "low");
  // A clean game says so.
  assert.deepEqual(summarizeGame(v5Review()).takeaways.map((t) => t.kind).slice(0, 2), ["clean", "steady"]);
  // Key-mistake themes become a takeaway.
  const th = v5Review({ losses: { 25: 3 } });
  th.keyMoves = [{ theme: "ladder", move: { color: BLACK } }, { theme: "ladder", move: { color: BLACK } }];
  const ts = summarizeGame(th);
  const theme = ts.takeaways.find((t) => t.kind === "theme");
  assert.ok(theme && theme.topic === "capture" && theme.params[1] === 2);
  assert.deepEqual(ts.themes, { ladder: 2 });
});

await test("v5: takeaways and summary strings read in all four languages, in one v5 block", () => {
  const entries = [];
  for (const r of [v5Review({ losses: { 5: 3, 25: 8, 79: 2.5, 9: 7 } }), v5Review({ losses: { 25: 3 } }), v5Review({ losses: { 25: 8 }, source: "estimate" }), v5Review()]) {
    for (const hc of [BLACK, null]) {
      const rv = { ...r, meta: { humanColor: hc }, keyMoves: [{ theme: "cut", move: { color: BLACK } }] };
      entries.push(...summarizeGame(rv).takeaways);
    }
  }
  const kinds = new Set(entries.map((e) => e.key));
  for (const k of ["gameSummary.take.worstPhase", "gameSummary.take.worstMove", "gameSummary.take.blunders", "gameSummary.take.theme", "gameSummary.take.steady", "gameSummary.take.clean", "gameSummary.estimate", "gameSummary.take.worstPhaseOf", "gameSummary.take.cleanOf"]) assert.ok(kinds.has(k), k);
  for (const lang of ["zh", "en", "ko", "ja"]) {
    setLang(lang);
    for (const e of entries) {
      const s = storyText(e);
      assert.ok(s && !/\{\d\}/.test(s) && !/\b(gameSummary|phase|phaseIn|theme)\.[a-z]/.test(s), `${lang} ${e.key}: ${s}`);
    }
  }
  setLang("en");
  const first = summarizeGame(v5Review({ losses: { 5: 3, 25: 8, 79: 2.5 } })).takeaways;
  assert.equal(storyText(first[0]), "Most of your points went in the middle game: about 8 points (59% of the total).");
  assert.equal(storyText(first[1]), "Your costliest move was move 25 (N13): about 8 points.");
  setLang("ja");
  assert.equal(storyText(first[0]), "損の多くは中盤でした。約8目（全体の59%）です。");
  setLang("en");
  const src = fs.readFileSync(path.join(root, "src/web/js/messages.js"), "utf8");
  const block = src.slice(src.indexOf("// v5 review"), src.indexOf("// end v5 review"));
  const v5 = Object.keys(MESSAGES).filter((k) => /^(gameSummary|trend|edit|phase|phaseIn)\./.test(k));
  assert.ok(v5.length >= 50);
  for (const k of v5) assert.ok(block.includes(`"${k}"`), k);
  for (const p of PHASES) assert.ok(MESSAGES["phase." + p] && MESSAGES["phaseIn." + p]);
  for (const kind of MARK_KINDS) assert.ok(MESSAGES["edit.mark." + kind], kind);
});

await test("v5: a rated game becomes a compact record, and trends compare the earlier and recent games", () => {
  const review = v5Review({ losses: { 5: 3, 25: 8, 79: 2.5 } });
  const s = summarizeGame(review);
  const rec = gameRecord({ id: "abc", game: review.game, color: BLACK, opponent: "15k", won: false, rating: { before: 1000, after: 980, delta: -20 }, summary: s, themes: { ladder: 1 }, at: Date.UTC(2026, 10, 1) });
  assert.equal(rec.id, "abc");
  assert.equal(rec.size, 13);
  assert.equal(rec.rules, "japanese");
  assert.equal(rec.moves, 80);
  assert.equal(rec.confidence, "high");
  assert.deepEqual(rec.phases.middle, { loss: 8, mistakes: 0, blunders: 1, moves: 28, accuracy: Math.round((27 / 28) * 1000) / 1000 });
  // Written at the end of the game, completed by the analysis.
  const bare = gameRecord({ id: "x", game: review.game, color: WHITE, won: true });
  assert.equal(bare.phases, null);
  assert.equal(bare.confidence, null);
  assert.deepEqual(Object.keys(recordAnalysis(s, WHITE, { cut: 1 })).sort(), ["confidence", "phases", "themes"]);
  assert.deepEqual(themeCounts([{ theme: "cut", move: { color: 1 } }, { theme: "cut", move: { color: -1 } }, { theme: null, move: { color: 1 } }], 1), { cut: 1 });

  // Six analysed games, newest first: the recent three lose less in the
  // middle game and stopped running into ladders, but started getting cut.
  const mk = (i, mid, themes, rating) => ({ id: "g" + i, at: 1000 + i, size: 9, color: 1, won: i % 2 === 0, phases: { opening: { loss: 2 }, middle: { loss: mid, mistakes: 2, blunders: 1 }, endgame: { loss: 3, mistakes: 1 } }, confidence: "high", themes, rating });
  const progress = {
    games: [
      mk(6, 8, { cut: 1 }, { before: 1060, after: 1080, delta: 20 }),
      mk(5, 7, { cut: 1 }, { before: 1050, after: 1060, delta: 10 }),
      mk(4, 9, { cut: 1 }, { before: 1040, after: 1050, delta: 10 }),
      mk(3, 20, { ladder: 2 }, { before: 1030, after: 1040, delta: 10 }),
      mk(2, 22, { ladder: 2 }, { before: 1010, after: 1030, delta: 20 }),
      mk(1, 18, { ladder: 2 }, { before: 1000, after: 1010, delta: 10 }),
      { id: "u", at: 900, size: 19, color: -1, won: false, phases: null }, // never analysed
    ],
  };
  const tr = trends(progress, { n: 10 });
  assert.equal(tr.games, 7);
  assert.equal(tr.analysed, 6);
  assert.deepEqual(tr.record, { won: 3, lost: 4, other: 0 });
  assert.equal(tr.avgLoss.middle, 14);
  assert.equal(tr.avgLoss.opening, 2);
  assert.equal(tr.avgLoss.total, 19);
  assert.equal(tr.avgMistakes, 3);
  assert.equal(tr.avgBlunders, 1);
  assert.deepEqual(tr.phaseTrend.middle, { earlier: 20, recent: 8, direction: "better" });
  assert.equal(tr.phaseTrend.opening.direction, "same");
  assert.equal(tr.phaseTrend.total.direction, "better");
  const ladder = tr.themes.find((t) => t.theme === "ladder");
  const cut = tr.themes.find((t) => t.theme === "cut");
  assert.deepEqual([ladder.count, ladder.direction, ladder.topic], [6, "better", "capture"]);
  assert.deepEqual([cut.count, cut.direction, cut.topic], [3, "worse", "connect"]);
  assert.equal(tr.themes[0].theme, "ladder", "most common first");
  assert.deepEqual(tr.rating, { from: 1000, to: 1080, delta: 80, games: 6 });
  // A narrower window, and too few games for a direction.
  const two = trends(progress, { n: 2 });
  assert.equal(two.analysed, 2);
  assert.equal(two.phaseTrend.middle.direction, null);
  // No records: rating falls back to the rating history.
  const empty = trends({ games: [], rating: { r: 1100, history: [{ at: 1, r: 1000 }, { at: 2, r: 1050 }, { at: 3, r: 1100 }] } });
  assert.equal(empty.games, 0);
  assert.equal(empty.avgLoss.total, null);
  assert.deepEqual(empty.rating, { from: 1000, to: 1100, delta: 100, games: 2 });
  assert.equal(trends(null).games, 0);
});

/** The review controller, bundled with its store and the library so they share one state. */
async function loadControllers() {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: [
        'export * as R from "./src/web/js/app/review-ctl.js";',
        'export { state } from "./src/web/js/app/store.js";',
        'export * as Lib from "./src/web/js/library.js";',
        'export * as P from "./src/web/js/persist.js";',
        'export { loadSGF } from "./src/web/js/sgf.js";',
        'export { buildReport, reportFits } from "./src/web/js/app/report-model.js";',
      ].join("\n"),
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
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
}

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

await test("v7: saving edited moves drops a stored report of the old moves; comments keep it", async () => {
  const { R, state, Lib, P, loadSGF, buildReport, reportFits } = await loadControllers();
  state.settings = { ...P.DEFAULT_SETTINGS, liveAnalysis: false };
  state.progress = P.loadProgress();
  const base = v5Review({ losses: { 25: 8 } });
  const rec = Lib.saveGame(base.game, { name: "v7 stale report", opponent: "ai", humanColor: BLACK });
  Lib.patchGame(rec.id, { report: buildReport({ game: loadSGF(rec.sgf).game, points: base.points, humanColor: BLACK }) });
  assert.ok(reportFits(Lib.getGame(rec.id).report, loadSGF(rec.sgf).game));
  R.openReview(loadSGF(rec.sgf).game, { source: "record", recordId: rec.id, humanColor: BLACK, points: base.points, startAt: 10 });
  // A comment only: the report still describes the game.
  R.setComment("note");
  R.saveEdits();
  assert.ok(Lib.getGame(rec.id).report, "a comment keeps the report");
  // A variation promoted to the main line: the stored report is of other moves.
  R.reviewGoto(30);
  R.reviewPlay(6, 6);
  assert.equal(R.promoteVariation(), true);
  R.saveEdits();
  assert.equal(Lib.getGame(rec.id).report, null, "a report of the old moves is dropped");
  R.dropReview();
  Lib.deleteGame(rec.id);
});

await test("v5: the review controller edits comments, marks and variations and saves them to the library", async () => {
  const { R, state, Lib, P, loadSGF } = await loadControllers();
  state.settings = { ...P.DEFAULT_SETTINGS, liveAnalysis: false };
  state.progress = P.loadProgress();
  const base = v5Review({ losses: { 25: 8 } });
  const rec = Lib.saveGame(base.game, { name: "v5 test", opponent: "ai", humanColor: BLACK });
  const { game } = loadSGF(rec.sgf);
  R.openReview(game, { source: "record", recordId: rec.id, humanColor: BLACK, points: base.points, startAt: 10 });
  const r = state.review;
  assert.equal(r.edits.target, "record");
  assert.equal(r.summary.confidence, "high");
  assert.equal(R.reviewSummary(), r.summary);
  assert.equal(r.summary.phases[1].players.black.blunders, 1);

  // Comment and marks on the move on the board, saved to the record.
  assert.equal(R.setComment("Too slow here"), true);
  assert.equal(R.setComment("Too slow here"), false, "no change, no edit");
  R.toggleMark("triangle");
  assert.equal(r.markTool, "triangle");
  R.reviewPlay(6, 6);
  assert.equal(r.game.current.children.length, 1, "with the tool, a click marks instead of playing");
  assert.deepEqual(r.game.current.marks, [{ x: 6, y: 6, type: "triangle" }]);
  R.toggleMark("label", 7, 7);
  R.toggleMark("triangle");
  assert.equal(r.markTool, null);
  assert.equal(r.edits.dirty, true);
  assert.equal(R.saveEdits(), true);
  let saved = loadSGF(Lib.getGame(rec.id).sgf).game.mainLine()[10];
  assert.equal(saved.comment, "Too slow here");
  assert.deepEqual(saved.marks.map((m) => m.type), ["triangle", "label"]);
  assert.equal(Lib.getGame(rec.id).name, "v5 test", "the record keeps its name and facts");
  assert.equal(Lib.getGame(rec.id).humanColor, BLACK);

  // A variation, promoted to the main line: analyses follow their positions.
  R.reviewGoto(30);
  const oldLine = r.game.mainLine();
  R.reviewPlay(6, 6); // a new move 31 for Black
  const branch = r.game.current;
  assert.equal(R.onMainLine(), false);
  const tree = R.treeLayout();
  assert.ok(tree.nodes.some((n) => n.node === branch && n.y === 1 && n.isCurrent));
  assert.equal(R.promoteVariation(), true);
  assert.equal(r.game.mainLine()[31], branch);
  assert.equal(r.points.length, 32);
  assert.equal(r.points[30], base.points[30], "the analysis of an unchanged position is kept");
  // The new position is analysed (offline here: the estimate).
  for (let k = 0; k < 200 && r.analyzing; k++) await sleep(5);
  assert.equal(r.analyzing, false);
  assert.equal(r.points[31]?.source, "estimate");
  assert.equal(r.summary.moves, 31);
  assert.equal(r.summary.confidence, "low", "partly estimated");
  R.saveEdits();
  saved = loadSGF(Lib.getGame(rec.id).sgf).game;
  assert.equal(saved.mainLine().length, 32);
  assert.equal(saved.mainLine()[30].children.length, 2, "the old main line is kept as a variation");

  // Delete the old line (now a variation); the main line is untouched.
  const oldNext = oldLine[31];
  assert.equal(R.deleteBranch(oldNext), true);
  assert.equal(r.game.mainLine()[30].children.length, 1);
  assert.equal(R.deleteBranch(r.game.root), false);
  // deleteVariation() from inside a variation goes back to the branch point.
  R.reviewGoto(5);
  R.reviewPlay(12, 5);
  R.reviewPlay(12, 4);
  R.deleteVariation();
  assert.equal(r.game.current, r.game.mainLine()[5]);
  assert.equal(r.game.mainLine()[5].children.length, 1);
  R.dropReview();
  saved = loadSGF(Lib.getGame(rec.id).sgf).game;
  assert.equal(saved.mainLine()[30].children.length, 1, "leaving the review saved the last edits");
  assert.equal(typeof R.gameTrends().games, "number");
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

await test("v6 explorer: book moves, out of the book, back/forward, reset and play from here", async () => {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: ['export * as X from "./src/web/js/app/explorer-ctl.js";', 'export { state } from "./src/web/js/app/store.js";', 'export * as P from "./src/web/js/persist.js";', 'export { loadSGF } from "./src/web/js/sgf.js";'].join("\n"),
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
  const { X, state, P, loadSGF } = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  state.settings = { ...P.DEFAULT_SETTINGS };
  state.progress = P.loadProgress();
  state.engine = { available: false };
  X.openExplorer("whole");
  assert.equal(state.space, "library");
  assert.equal(state.library.explorer, "whole");
  assert.ok(X.explorerBook(), "the empty board is in the book");
  const first = X.explorerCandidates();
  assert.ok(first.length >= 4 && first.every((c) => c.label), "candidates carry letters");
  // Q16 is a book move; the verdict comes from the book.
  X.explorerPlay(15, 3);
  assert.ok(X.explorerBook());
  const v = X.lastMoveVerdict();
  assert.ok(v && v.inBook && v.tag === "joseki", JSON.stringify(v));
  assert.ok(X.explorerEval().source === "book");
  // A first-line move leaves the book: no candidates offline.
  X.explorerPlay(0, 0);
  assert.equal(X.explorerBook(), null);
  assert.deepEqual(X.explorerCandidates(), []);
  X.explorerStep(-1);
  assert.equal(X.explorerMoveCount(), 1);
  X.explorerStep(1);
  assert.equal(X.explorerMoveCount(), 2);
  X.explorerReset();
  assert.equal(X.explorerMoveCount(), 0);
  X.explorerStep(1);
  X.explorerStep(1);
  assert.equal(X.explorerMoveCount(), 2, "forward follows the line after a reset");
  X.explorerStep(-1);
  // The corner tree keeps its own position; the whole board is kept too.
  X.setExplorerMode("corner");
  assert.equal(X.explorerMoveCount(), 0);
  assert.equal(state.explorer.game.root.board.signMap.flat().filter(Boolean).length, 4, "the corner setup");
  X.explorerPlay(15, 3);
  X.explorerPlay(16, 5);
  assert.ok(X.explorerBook(), "star point, small knight's approach");
  X.setExplorerMode("whole");
  assert.equal(X.explorerMoveCount(), 1);
  X.setExplorerMode("corner");
  // Play from here: a game against the computer with the setup and the line.
  X.explorerPlayFromHere();
  assert.equal(state.space, "play");
  const g = state.game.game;
  assert.equal(g.mainLine().length, 3);
  assert.equal(g.root.board.signMap.flat().filter(Boolean).length, 4);
  assert.equal(state.game.humanColor, BLACK);
  assert.equal(state.game.opponent, "ai");
  // Review: where a game leaves the whole-board book (Q16 D4 Q4, the named
  // two-star opening, then a first-line move; SGF columns include the i).
  const { game } = loadSGF("(;GM[1]SZ[19];B[pd];W[dp];B[pp];W[aa];B[dd])");
  assert.equal(X.bookExit(game), 3);
  assert.equal(X.bookExit(loadSGF("(;GM[1]SZ[9];B[ee])").game), null);
  X.closeExplorer();
  assert.equal(state.library.explorer, null);
});

if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} app tests passed.`);
