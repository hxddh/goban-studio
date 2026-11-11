/**
 * Play: reading a game — atari, what a mistake cost and where, its kind, and the stories told about it.
 */
import { test, MESSAGES, assert, ataris, attributeLoss, classifyMistake, complexity, describe, describeMistakes, empty, keyOf, lossSource, mv, narrate, parse, setLang, settled, simulate, storyText, summaryOf, syntheticReview } from "./helpers.mjs";
import { REVIEW } from "../../src/web/js/messages/review.js";

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

await test("describeMistakes: attribution, theme and both stories for each key mistake", () => {
  const { game, points } = syntheticReview();
  const { top } = describeMistakes(game, points);
  assert.equal(top.length, 1);
  const km = top[0];
  assert.equal(km.index, 3); // Black's 6,2 let White take the corner
  assert.equal(km.move.color, 1);
  assert.equal(km.attribution.kind, "group-died");
  assert.ok(km.source && km.source.kind === "group", "the source is kept for the views");
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
  // The story's strings sit with the review's.
  for (const k of Object.keys(MESSAGES).filter((k) => k.startsWith("story.") || k.startsWith("lossKind."))) assert.ok(REVIEW[k], k);
});
