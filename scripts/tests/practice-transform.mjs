/**
 * Practice: review transforms (practice/transform.js) — a problem shown again is
 * turned, mirrored and recoloured, and is still a proved problem: a
 * deterministic sample of 60 through the solver here (the whole bank:
 * `node scripts/check-transforms.mjs`), the colour words of every title and
 * hint in four languages, the board window, and the app showing a review
 * transformed while recording it under the problem's own id.
 */
import { test, assert, bundle, sleep, PROBLEMS, S } from "./helpers.mjs";
import * as T from "../../src/web/js/practice/transform.js";
import { checkTransformed, sample, transformFor } from "../check-transforms.mjs";

await test("practice transform: the eight symmetries are distinct, map the board onto itself and invert", () => {
  const size = 19;
  const seen = new Set();
  for (let sym = 0; sym < 8; sym++) {
    const key = [
      [0, 0],
      [3, 1],
      [18, 5],
    ]
      .map(([x, y]) => T.mapPoint(x, y, size, sym))
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
    seen.add(key);
    for (let x = 0; x < size; x += 3) {
      for (let y = 0; y < size; y += 4) {
        const p = T.mapPoint(x, y, size, sym);
        assert.ok(p.x >= 0 && p.x < size && p.y >= 0 && p.y < size);
        // Every symmetry has an inverse among the eight.
        assert.ok([0, 1, 2, 3, 4, 5, 6, 7].some((inv) => {
          const q = T.mapPoint(p.x, p.y, size, inv);
          return q.x === x && q.y === y;
        }));
      }
    }
  }
  assert.equal(seen.size, 8);
});

await test("practice transform: a transformed problem keeps its id, moves its diagram, region, keys and window, and swaps the colours", () => {
  const def = PROBLEMS.find((p) => p.id === "capture-basic-02"); // bottom right corner
  const t = { sym: 3, swap: true };
  const next = T.transformProblem(def, t);
  assert.equal(next.id, def.id);
  assert.deepEqual(next.shown, t);
  assert.equal(T.transformProblem(def, T.IDENTITY), def, "the identity is the problem itself");
  const a = S.createPuzzle(def);
  const b = S.createPuzzle(next);
  assert.equal(b.userColor, -a.userColor, "White to play");
  assert.equal(b.keyColor, -a.keyColor);
  const map = (p) => T.mapPoint(p.x, p.y, 19, t.sym);
  const key = (list) => list.map((p) => `${p.x},${p.y},${p.c ?? ""}`).sort().join(" ");
  assert.equal(key(b.stones), key(a.stones.map((s) => ({ ...map(s), c: -s.c }))), "the setup, mirrored and recoloured");
  assert.equal(key(b.keys), key(a.keys.map(map)));
  // The window the board frames goes with the diagram: from the bottom-right corner to the top-left.
  assert.equal(b.view.x0, 0);
  assert.equal(b.view.y0, 0);
  // The solver's answer is the written answer, mapped.
  const first = S.solveFirstMoves(b);
  const want = S.solveFirstMoves(a).correct.map(map);
  assert.deepEqual(first.correct.map((p) => `${p.x},${p.y}`).sort(), want.map((p) => `${p.x},${p.y}`).sort());
  // A colour swap turns "White" into "Black" in the hint, in all four languages.
  assert.match(def.hint.en, /White/);
  assert.match(next.hint.en, /Black/);
  assert.doesNotMatch(next.hint.en, /White/);
  assert.match(next.hint.zh, /黑/);
  assert.match(next.hint.ko, /흑/);
  assert.match(next.hint.ja, /黒/);
  // Endgame problems are turned but never recoloured, and their answer points move with the board.
  const eg = PROBLEMS.find((p) => p.goal === "endgame" && p.ask === "move");
  const egT = T.transformProblem(eg, { sym: 5, swap: true });
  assert.equal(egT.shown.swap, false);
  assert.equal(S.createPuzzle(egT).userColor, 1);
  assert.equal(egT.answer.length, eg.answer.length);
});

await test("practice transform: colour words in every title and hint swap both ways, and appear only as colours", () => {
  assert.equal(T.swapColourText("Black captures White's black stone.", "en"), "White captures Black's white stone.");
  assert.equal(T.swapColourText("黑先，白棋两口气。", "zh"), "白先，黑棋两口气。");
  assert.equal(T.swapColourText("흑은 백의 돌을", "ko"), "백은 흑의 돌을");
  assert.equal(T.swapColourText("黒が白石を取る", "ja"), "白が黒石を取る");
  assert.equal(T.swapColourText("Whiteboard", "en"), "Whiteboard", "whole words only");
  // Where the colour word stands in the bank's texts: always a colour.
  const after = { zh: /[黑白](?=[棋子地先])/g, ja: /[黒白](?=[の石をはがに地])/g, ko: /[흑백](?=[의돌을은 이에집]|$)/g };
  const any = { zh: /[黑白]/g, ja: /[黒白]/g, ko: /[흑백]/g };
  for (const p of PROBLEMS) {
    for (const field of ["title", "hint"]) {
      for (const lang of ["zh", "en", "ko", "ja"]) {
        const text = p[field][lang];
        assert.equal(T.swapColourText(T.swapColourText(text, lang), lang), text, `${p.id} ${field}.${lang}`);
        if (any[lang]) assert.equal((text.match(any[lang]) || []).length, (text.match(after[lang]) || []).length, `${p.id} ${field}.${lang}: a colour character that is not a colour? ${text}`);
      }
    }
  }
});

await test("practice transform: 60 problems across the bank are still proved after a turn and a colour swap", () => {
  const t0 = performance.now();
  const list = sample(60);
  assert.equal(list.length, 60);
  const kinds = new Set(list.map((p) => p.goal));
  for (const g of ["capture", "kill", "live", "endgame"]) assert.ok(kinds.has(g), `the sample has ${g} problems`);
  for (const def of list) {
    const t = transformFor(def);
    assert.ok(t.sym !== 0 || T.allowedSyms(def).length === 1);
    assert.deepEqual(checkTransformed(def, t), [], `${def.id} ${JSON.stringify(t)}`);
  }
  assert.ok(performance.now() - t0 < 60000, "within a minute");
});

await test("practice transform: a problem's first showing is as written, White to play for about half the problems, the same each time on a profile", () => {
  const swappable = PROBLEMS.filter(T.canSwap);
  const seeds = ["0", "1f3a9c2e", "deadbeef", "7", "a0b1c2d3", "zz"];
  const shares = [];
  for (const seed of seeds) {
    let white = 0;
    for (const def of swappable) {
      const t = T.firstTransform(def, seed);
      assert.equal(t.sym, 0, `${def.id}: the first showing is never turned`);
      assert.deepEqual(T.firstTransform(def, seed), t, "the same on the same profile");
      if (t.swap) white++;
    }
    shares.push(white / swappable.length);
  }
  for (const [i, share] of shares.entries()) assert.ok(share > 0.44 && share < 0.56, `seed ${seeds[i]}: ${(share * 100).toFixed(1)}% White to play`);
  // Another profile gets another half: two seeds agree on about half the problems, not all.
  const agree = swappable.filter((d) => T.firstTransform(d, seeds[1]).swap === T.firstTransform(d, seeds[2]).swap).length / swappable.length;
  assert.ok(agree > 0.4 && agree < 0.6, `two profiles agree on ${(agree * 100).toFixed(1)}%`);
  // Endgame problems count with Black first: never recoloured.
  for (const def of PROBLEMS.filter((p) => p.goal === "endgame")) for (const seed of seeds) assert.deepEqual(T.firstTransform(def, seed), T.IDENTITY);
  // The tile's definition is the board's: the same colours, kept for the grid.
  const def = swappable.find((d) => T.firstTransform(d, seeds[1]).swap);
  const tile = T.firstShown(def, seeds[1]);
  assert.equal(T.firstShown(def, seeds[1]), tile, "kept");
  assert.deepEqual(tile.shown, { sym: 0, swap: true });
  assert.equal(S.createPuzzle(tile).userColor, -S.createPuzzle(def).userColor);
  assert.equal(T.firstShown({ id: def.id, topic: def.topic }, seeds[1]).diagram, undefined, "before the body arrives: as it is");
});

await test("practice transform: a review's transform is reproducible, never the written problem, within the allowed symmetries", () => {
  const def = PROBLEMS.find((p) => p.goal === "kill");
  assert.deepEqual(T.reviewTransform(def, 0), T.firstTransform(def), "first showing: its first transform");
  for (const seed of ["a", "b", "c", "d"]) {
    const first = T.firstTransform(def, seed);
    for (let tries = 1; tries <= 20; tries++) {
      const t = T.reviewTransform(def, tries, seed);
      assert.ok(t.sym !== 0 || t.swap !== first.swap, `${seed} ${tries}: a review never looks like the first showing`);
    }
  }
  const seen = new Set();
  for (let tries = 1; tries <= 40; tries++) {
    const t = T.reviewTransform(def, tries);
    assert.deepEqual(T.reviewTransform(def, tries), t);
    assert.ok(t.sym !== 0 || t.swap);
    seen.add(`${t.sym}${t.swap}`);
  }
  assert.ok(seen.size >= 8, "varied from one review to the next");
  const limited = PROBLEMS.find((p) => p.id === "capture-ladder-01");
  if (limited) for (let tries = 1; tries < 40; tries++) assert.ok(T.allowedSyms(limited).includes(T.reviewTransform(limited, tries).sym));
  const eg = PROBLEMS.find((p) => p.goal === "endgame");
  for (let tries = 1; tries < 10; tries++) assert.equal(T.reviewTransform(eg, tries).swap, false);
});

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export * as S from "./src/web/js/solver.js";',
  'export { setLang } from "./src/web/js/i18n.js";',
]);

await test("practice transform: in the app, a problem tried before comes back transformed and is recorded under its own id", async () => {
  const { C, state, PM } = A;
  A.setLang("en");
  state.settings = { ...A.DEFAULT_SETTINGS, lang: "en", onboarded: true, experience: "player", playerRank: 10 };
  state.profile = PM.newProfile({ rank: 10 });
  state.space = "practice";
  state.practice = { view: "home", topic: null, lesson: null, problem: null, daily: null, placement: null };
  const id = "capture-basic-02";
  state.profile.seed = "1";
  assert.equal(T.firstTransform(PROBLEMS.find((p) => p.id === id), "1").swap, false);
  C.openProblem(id);
  assert.equal(state.practice.problem.def.shown, undefined, "the first time, in Black on this profile: as written");
  C.showAnswer();
  assert.equal(state.profile.problems[id].tries, 1);
  assert.equal(state.profile.seed, "1", "the seed is kept with the profile");
  C.openProblem(id);
  const P = state.practice.problem;
  const t = T.reviewTransform(PROBLEMS.find((p) => p.id === id), 1, "1");
  assert.deepEqual(P.def.shown, t);
  assert.equal(P.def.id, id);
  if (t.swap) assert.equal(P.pz.userColor, -1, "White to play");
  // Solve it as shown: the result belongs to the same problem.
  for (let guard = 0; guard < 10 && P.status !== "won"; guard++) {
    while (P.busy) await sleep(20);
    if (P.status === "won") break;
    const mv = A.S.winningMoves(P.pz, P.st)[0];
    C.practicePlay(mv.x, mv.y);
    await sleep(0);
  }
  while (P.busy) await sleep(20);
  assert.equal(P.status, "won");
  assert.equal(state.profile.problems[id].tries, 2);
  assert.equal(state.profile.problems[id].solved, true);
});

await test("practice transform: in the app, a problem first shown in White says White to play, takes White's answer and is recorded under its own id", async () => {
  const { C, state, PM } = A;
  A.setLang("en");
  const seed = "1f3a9c2e";
  state.profile = { ...PM.newProfile({ rank: 10 }), seed };
  const written = PROBLEMS.find((p) => p.goal === "live" && T.firstTransform(p, seed).swap && S.createPuzzle(p).userColor === 1);
  const id = written.id;
  C.openProblem(id);
  const P = state.practice.problem;
  assert.deepEqual(P.def.shown, { sym: 0, swap: true });
  assert.equal(P.def.id, id);
  assert.equal(P.pz.userColor, -1, "White to play");
  assert.equal(C.goalText(P.pz), "White to play: live");
  assert.equal(C.defGoalText(T.firstShown(written, seed)), "White to play: live", "the tile says the same");
  assert.equal(C.defToMove(T.firstShown(written, seed)), -1);
  // The hint points at one of White's right moves.
  C.problemHint();
  assert.ok(P.hintAt && A.S.solveFirstMoves(P.pz).correct.some((m) => m.x === P.hintAt.x && m.y === P.hintAt.y));
  for (let guard = 0; guard < 10 && P.status !== "won"; guard++) {
    while (P.busy) await sleep(20);
    if (P.status === "won") break;
    const mv = A.S.winningMoves(P.pz, P.st)[0];
    C.practicePlay(mv.x, mv.y);
    await sleep(0);
  }
  while (P.busy) await sleep(20);
  assert.equal(P.status, "won");
  assert.equal(state.profile.problems[id].tries, 1);
  assert.equal(state.profile.problems[id].solved, true);
  assert.equal(state.profile.seed, seed);
  // The answer, shown on a new profile with the same seed, starts with White's move.
  state.profile = { ...PM.newProfile({ rank: 10 }), seed };
  C.openProblem(id);
  C.showAnswer();
  assert.equal(state.practice.problem.answer[0].c, -1);
});

await test("practice transform: Confirm moves in problems — the first click shows the stone, the same point again plays it, Esc cancels", async () => {
  const { C, state, PM } = A;
  state.settings = { ...state.settings, confirmProblemMove: true };
  state.profile = PM.newProfile({ rank: 10 });
  const id = "capture-basic-02";
  C.openProblem(id);
  const P = state.practice.problem;
  const [right] = A.S.winningMoves(P.pz, P.st);
  const wrong = A.S.solveFirstMoves(P.pz).correct.some((m) => m.x === right.x - 1 && m.y === right.y) ? { x: right.x, y: right.y - 1 } : { x: right.x - 1, y: right.y };
  C.practicePlay(wrong.x, wrong.y);
  assert.deepEqual(P.ghost, wrong, "a ghost stone, nothing played");
  assert.equal(P.history.length, 0);
  assert.equal(state.profile.problems[id], undefined, "nothing recorded");
  assert.equal(C.clearProblemGhost(), true, "Esc takes it away");
  assert.equal(P.ghost, null);
  assert.equal(C.clearProblemGhost(), false);
  C.practicePlay(wrong.x, wrong.y);
  C.practicePlay(right.x, right.y);
  assert.deepEqual(P.ghost, right, "another point moves the ghost");
  C.practicePlay(right.x, right.y);
  assert.equal(P.ghost, null);
  assert.equal(P.history.length, 1, "the second click on the same point plays");
  while (P.busy) await sleep(20);
  assert.equal(P.status, "won");
  assert.equal(state.profile.problems[id].clean, true);
  state.settings = { ...state.settings, confirmProblemMove: false };
});
