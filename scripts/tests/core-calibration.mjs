/**
 * Core: the calibration runs and the measured ladder. Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 */
import fs from "node:fs";
import path from "node:path";

import { analyse, discounted, fitBT, fixedImpls, handicapKomi, mergeGames, mulberry32, natsToRanks, parseHandicap, parseShard, pendingGames, planMatrix, planTasks, rootStones, stoneValue } from "../calibrate-strength.mjs";
import { STRENGTHS, implLabel, implTheta, ladder } from "../../src/web/js/engine.js";
import { IMPLS, MEASURED, thetaToGoR } from "../../src/web/js/opponents.js";
import { RANKS_PER_STONE, levelTheta } from "../../src/web/js/model/ladder.js";
import { Game, handicapPoints } from "../../src/web/js/rules.js";

/** The names v7's games were played under → the shipped levels (docs/strength.md, v7). */
export const V7_ALIAS = {
  "HL:5k": "CH:s7k24",
  "HL:15k": "CH:r20k",
  "HL:1k": "CH:s2k64",
  "CH:s7k24b12": "HL:5k",
  "CH:r20kb12": "HL:15k",
  "CH:s4k32": "HL:1k",
};

export default async function ({ test, assert, root }) {
  const candidates = JSON.parse(fs.readFileSync(path.join(root, "docs/calibration/v7-candidates.json"), "utf8"));

  test("core calibration: --shard parses I/N and rejects nonsense", () => {
    assert.equal(parseShard(undefined), null);
    assert.deepEqual(parseShard("2/5"), { index: 2, count: 5 });
    assert.throws(() => parseShard("5/5"));
    assert.throws(() => parseShard("1/0"));
    assert.throws(() => parseShard("a/b"));
  });

  test("core calibration: shards split a schedule into disjoint slices that cover it", () => {
    const opt = { size: 19, komi: 6.5, games: 5, pairs: "HL:10k-L:10k,CH:s10k8-L:5k,L:1k-C:v400", tag: "t", anchors: [] };
    const all = planTasks(opt, candidates).map((t) => t.key);
    assert.equal(all.length, 15);
    const slices = [0, 1, 2, 3].map((i) => planTasks({ ...opt, shard: { index: i, count: 4 } }, candidates).map((t) => t.key));
    const union = slices.flat();
    assert.equal(new Set(union).size, union.length, "slices overlap");
    assert.deepEqual([...union].sort(), [...all].sort());
    // Slices are balanced and keep the round-robin (every pair early on).
    assert.ok(Math.max(...slices.map((s) => s.length)) - Math.min(...slices.map((s) => s.length)) <= 1);
    // Done games are skipped after slicing, so a rerun keeps its slice.
    const s0 = planTasks({ ...opt, shard: { index: 0, count: 4 } }, candidates, new Set([slices[0][0]]));
    assert.deepEqual(
      s0.map((t) => t.key),
      slices[0].slice(1),
    );
  });

  test("core calibration: CH: candidates play as human-style levels, colours alternate", () => {
    const [g0, g1] = planTasks({ size: 9, komi: 6.5, games: 2, pairs: "CH:s7k24b5-HL:5k", anchors: [] }, candidates);
    assert.equal(g0.black.kind, "humanLadder");
    assert.deepEqual(g0.black.strength.human, { profile: "rank_7k", style: "search", visits: 24, blunder: 0.05 });
    assert.equal(g1.white.spec, "CH:s7k24b5");
    assert.throws(() => planTasks({ size: 9, komi: 6.5, games: 1, pairs: "CH:v400-L:2d", anchors: [] }, candidates), /human-style candidate/);
    for (const [name, c] of Object.entries(candidates)) {
      if (c.human) assert.match(c.human.profile, /^rank_\d+[kd]$/, name);
      else assert.ok(c.visits > 0, name);
    }
  });

  test("core calibration: handicap pairs give A the stones and Black, at the app's komi (v11)", () => {
    assert.deepEqual(parseHandicap("L:10k-L:5k@h3"), ["L:10k-L:5k", 3]);
    assert.deepEqual(parseHandicap("L:10k-L:5k"), ["L:10k-L:5k", 0]);
    assert.throws(() => parseHandicap("L:10k-L:5k@h0"));
    assert.throws(() => parseHandicap("L:10k-L:5k@h10"));
    const tasks = planTasks({ size: 13, komi: 6.5, games: 4, pairs: "L:10k-L:5k@h2,L:20k-L:15k@h1,L:10k-L:5k", tag: "v11", anchors: [] });
    const h2 = tasks.filter((t) => t.handicap === 2);
    assert.equal(h2.length, 4);
    // The receiver keeps Black in every game; even games still alternate.
    assert.ok(h2.every((t) => t.black.spec === "L:10k" && t.white.spec === "L:5k"));
    assert.deepEqual(tasks.filter((t) => !t.handicap).map((t) => t.black.spec), ["L:10k", "L:5k", "L:10k", "L:5k"]);
    // Komi 0.5 whenever stones are given, one stone included (play-ctl.js newGame).
    assert.ok(tasks.filter((t) => t.handicap).every((t) => t.komi === 0.5));
    assert.equal(handicapKomi(1), 0.5);
    assert.equal(handicapKomi(0), 6.5);
    // Keys: the stone count is part of a handicap game's key; even keys are as before.
    assert.equal(h2[0].key, "13|0.5|L:10k|L:5k|0|h2|v11");
    assert.equal(tasks.find((t) => t.handicap === 1).key, "13|0.5|L:20k|L:15k|0|h1|v11");
    assert.equal(tasks.find((t) => !t.handicap).key, "13|6.5|L:10k|L:5k|0|v11");
    // A suffix on a macro applies to each pair it expands to.
    const adj = planTasks({ size: 13, komi: 6.5, games: 1, pairs: "adjacent@h2", anchors: [] });
    assert.equal(adj.length, STRENGTHS.length - 1);
    assert.ok(adj.every((t) => t.handicap === 2));
  });

  test("core calibration: handicap stones reach KataGo where the app puts them (v11)", () => {
    // v13: a handicap of one is no stone: Black plays first, at the handicap komi.
    const one = new Game({ size: 13, komi: handicapKomi(1), handicap: 1 });
    assert.deepEqual(rootStones(one), []);
    assert.equal(one.turn, 1);
    assert.equal(one.komi, 0.5);
    for (const n of [2, 3, 4]) {
      const game = new Game({ size: 13, komi: handicapKomi(n), handicap: n });
      const stones = rootStones(game);
      assert.equal(stones.length, n);
      assert.ok(stones.every((s) => s.startsWith("B ")));
      // The same points as rules.js handicapPoints, and White moves first.
      const want = handicapPoints(13, n).map(([x, y]) => `B ${"ABCDEFGHJKLMN"[x]}${13 - y}`);
      assert.deepEqual([...stones].sort(), [...want].sort());
      assert.equal(game.turn, -1);
    }
    assert.deepEqual(rootStones(new Game({ size: 13 })), []);
  });

  test("core calibration: the handicap fit recovers a planted stone value (v11)", () => {
    // The discount is the app's own: a level giving N stones on 13×13 is
    // rated N·RANKS_PER_STONE ranks weaker (model/ladder.js levelTheta).
    const t13 = (id) => MEASURED.standard[id][13];
    for (const id of ["15k", "10k", "1k"]) {
      assert.ok(Math.abs(levelTheta(id, { size: 13, handicap: 3 }) - discounted(t13(id), 3 * RANKS_PER_STONE[13], 13)) < 1e-9, id);
      assert.ok(Math.abs(natsToRanks(t13(id), t13(id) - discounted(t13(id), 4, 13), 13) - 4) < 1e-6, id);
    }
    const rnd = mulberry32(11);
    const planted = 1.8;
    const games = [];
    const pairs = [["20k", "15k"], ["15k", "10k"], ["10k", "5k"], ["5k", "1k"], ["20k", "10k"], ["10k", "1k"]];
    for (const [a, b] of pairs) {
      for (const h of [1, 2, 3, 4]) {
        for (let g = 0; g < 40; g++) {
          const z = t13(a) - discounted(t13(b), h * planted, 13);
          games.push({ size: 13, handicap: h, black: `L:${a}`, white: `L:${b}`, winner: rnd() < 1 / (1 + Math.exp(-z)) ? "B" : "W", plies: 100, reason: "passes" });
        }
      }
    }
    const fixed = Object.fromEntries(STRENGTHS.map((s) => [`L:${s.id}`, t13(s.id)]));
    const sv = stoneValue(games, fixed, 13);
    assert.ok(Math.abs(sv.ranks - planted) < 0.3, `stone value ${sv.ranks}`);
    assert.equal(sv.games, games.filter((g) => g.handicap >= 2).length);
    // γ grows with the stones; even-game θ are untouched by the handicap terms.
    const { gamma, theta } = fitBT(games, Object.keys(fixed), { fixed });
    assert.deepEqual(Object.keys(gamma).map(Number), [1, 2, 3, 4]);
    for (let h = 2; h <= 4; h++) assert.ok(gamma[h] > gamma[h - 1], `γ${h}`);
    assert.equal(theta["L:10k"], t13("10k"));
    const r = analyse(games, { fixed, boot: 40, size: 13 });
    assert.ok(r.stoneValue.lo <= r.stoneValue.ranks && r.stoneValue.ranks <= r.stoneValue.hi);
    assert.equal(r.handicap.length, 4);
    assert.ok(r.pairs.every((p) => p.h >= 1 && p.a === `L:${pairs.find(([a, b]) => p.a === `L:${a}` && p.b === `L:${b}`)[0]}`));
    assert.equal(stoneValue(games.map((g) => ({ ...g, handicap: 0 })), fixed, 13), null);
    // Without the ladder held, θ has an arbitrary origin: no value in ranks.
    const free = analyse(games, { boot: 10, size: 13 });
    assert.equal(free.framed, false);
    assert.equal(free.stoneValue, null);
    assert.equal(free.stoneValue1, null);
    assert.equal(free.handicap.length, 4);
  });

  test("core calibration: --fixed impls holds the whole current ladder (v11)", () => {
    const f = fixedImpls(19);
    for (const i of IMPLS) assert.equal(f[i.id], i.theta[19], i.id);
    assert.equal(f["L:30k"], 0);
    assert.equal(fixedImpls(13)["C:b18"], undefined, "not measured on 13×13");
    // The anchor run's bridges play exactly the settings the ladder plays.
    const v11 = JSON.parse(fs.readFileSync(path.join(root, "docs/calibration/v11-candidates.json"), "utf8"));
    for (const [name, c] of Object.entries(v11)) {
      const { local, ...level } = IMPLS.find((i) => i.id === `C:${name}`).level;
      assert.deepEqual(c, level, name);
    }
  });

  test("core calibration: merge keeps one line per game key and drops torn lines", () => {
    const a = { key: "k1", winner: "B" };
    const out = mergeGames([a], [`${JSON.stringify(a)}\n${JSON.stringify({ key: "k2", winner: "W" })}\n{"key":"k3"`, JSON.stringify({ key: "k2", winner: "B" })]);
    assert.deepEqual(out, [{ key: "k2", winner: "W" }]);
  });

  test("core calibration: the committed plan is a valid runner matrix", () => {
    const plan = JSON.parse(fs.readFileSync(path.join(root, "docs/calibration/plan.json"), "utf8"));
    const m = planMatrix(plan);
    assert.ok(m.include.length >= 1 && m.include.length <= 256);
    for (const r of plan.runs) {
      // Every pair resolves (players exist, candidates have the right kind).
      const opt = { size: r.size, komi: 6.5, games: 1, pairs: r.pairs, anchors: [] };
      assert.ok(planTasks(opt, r.candidates ? JSON.parse(fs.readFileSync(path.join(root, r.candidates), "utf8")) : {}).length > 0, r.id);
    }
    assert.throws(() => planMatrix({ runs: [{ id: "x y", size: 9, games: 1, pairs: "adjacent" }] }));
    assert.throws(() => planMatrix({ runs: [] }));
    // v11: runs whose games are all committed get no jobs (the v8 runs).
    for (const r of plan.runs.filter((x) => x.id.startsWith("v8-"))) assert.equal(pendingGames(r, root), 0, r.id);
    const skip = planMatrix(plan, { pending: (r) => !r.id.startsWith("v8-") });
    assert.ok(skip.include.every((j) => !j.run.startsWith("v8-")));
    // A plan that is all done is an empty matrix (the play jobs are skipped), not an error.
    assert.deepEqual(planMatrix(plan, { pending: () => false }), { include: [] });
    assert.ok(/needs\.plan\.outputs\.matrix != '\{"include":\[\]\}'/.test(fs.readFileSync(new URL("../../.github/workflows/calibrate.yml", import.meta.url), "utf8")), "the workflow skips an empty matrix");
  });

  test("core calibration: the workflow runs only on calibrate/** branches", () => {
    const yml = fs.readFileSync(path.join(root, ".github/workflows/calibrate.yml"), "utf8");
    const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
    assert.match(on, /push:\s*\n\s*branches: \["calibrate\/\*\*"\]/);
    assert.doesNotMatch(on, /pull_request|workflow_dispatch|schedule|main|v7/);
    // Downloads are checked against pinned hashes.
    assert.match(yml, /KATAGO_SHA256: [0-9a-f]{64}/);
    assert.match(yml, /sha256sum -c/g);
    assert.ok(yml.includes("src/models.zig"));
  });

  test("core calibration: every level's measured strength exists on both boards", () => {
    for (const s of STRENGTHS) {
      for (const mode of ["standard", "human"]) {
        const m = MEASURED[mode][s.id];
        assert.ok(Number.isFinite(m?.[19]) && Number.isFinite(m?.[9]), `${mode} ${s.id}`);
      }
    }
  });

  test("core calibration: the human-style ladder has no gap and its labels follow the measurement", () => {
    // v9: the ladder with the human-style network installed (opponents.js).
    const entries = ladder({ human: true });
    for (let i = 1; i < entries.length; i++) {
      const [a, b] = [entries[i - 1].label, entries[i].label];
      assert.ok(b < a, `${entries[i].impl}: label not above the rank below`);
      assert.ok(a - b <= 6, `${entries[i].impl}: a gap of ${a - b} ranks`);
    }
    // Each label is the measured 19×19 rank (the 30-kyu floor aside).
    for (const e of entries) {
      const measured = Math.round((2100 - thetaToGoR(implTheta(e.impl, 19))) / 100);
      assert.equal(e.label, Math.min(30, measured), e.impl);
    }
    assert.ok(implLabel("LS:2d") <= implLabel("HL:2d"));
    // The changed levels play exactly the measured candidates.
    const h = Object.fromEntries(STRENGTHS.map((s) => [s.id, s.human]));
    for (const [id, name] of [["15k", "r20kb12"], ["5k", "s7k24b12"], ["1k", "s4k32"]]) {
      const { rank, ...play } = h[id];
      assert.deepEqual(play, candidates[name].human, id);
    }
  });

  test("core calibration: the committed games reproduce the measured human-style strengths", () => {
    const dir = path.join(root, "docs/calibration/results");
    const games = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
      .map((g) => ({ ...g, black: V7_ALIAS[g.black] || g.black, white: V7_ALIAS[g.white] || g.white }));
    assert.equal(new Set(games.map((g) => g.key)).size, games.length, "a game is in two files");
    for (const size of [19, 9]) {
      const gs = games.filter((g) => g.size === size);
      const players = [...new Set(gs.flatMap((g) => [g.black, g.white]))];
      const fixed = Object.fromEntries(STRENGTHS.map((s) => [`L:${s.id}`, MEASURED.standard[s.id][size]]));
      const { theta } = fitBT(gs, players, { fixed });
      for (const s of STRENGTHS) {
        const got = theta[`HL:${s.id}`];
        assert.ok(Math.abs(got - MEASURED.human[s.id][size]) < 0.01, `${size}×${size} HL:${s.id} fits ${got}`);
      }
      assert.ok(Math.abs(theta["LS:2d"] - MEASURED.strong["2d"][size]) < 0.01, `${size}×${size} LS:2d`);
    }
    assert.equal(games.filter((g) => g.size === 19 && g.key.endsWith("|v7")).length, 708);
    assert.equal(games.filter((g) => g.size === 9 && g.key.endsWith("|v7")).length, 824);
  });
}
