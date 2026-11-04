/**
 * v7 tests: calibration. Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 */
import fs from "node:fs";
import path from "node:path";

import { fitBT, mergeGames, parseShard, planMatrix, planTasks } from "../calibrate-strength.mjs";
import { STRENGTHS, labelRank } from "../../src/web/js/engine.js";
import { MEASURED, thetaToGoR } from "../../src/web/js/app/strength.js";

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

  test("v7 calibration: --shard parses I/N and rejects nonsense", () => {
    assert.equal(parseShard(undefined), null);
    assert.deepEqual(parseShard("2/5"), { index: 2, count: 5 });
    assert.throws(() => parseShard("5/5"));
    assert.throws(() => parseShard("1/0"));
    assert.throws(() => parseShard("a/b"));
  });

  test("v7 calibration: shards split a schedule into disjoint slices that cover it", () => {
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

  test("v7 calibration: CH: candidates play as human-style levels, colours alternate", () => {
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

  test("v7 calibration: merge keeps one line per game key and drops torn lines", () => {
    const a = { key: "k1", winner: "B" };
    const out = mergeGames([a], [`${JSON.stringify(a)}\n${JSON.stringify({ key: "k2", winner: "W" })}\n{"key":"k3"`, JSON.stringify({ key: "k2", winner: "B" })]);
    assert.deepEqual(out, [{ key: "k2", winner: "W" }]);
  });

  test("v7 calibration: the committed plan is a valid runner matrix", () => {
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
  });

  test("v7 calibration: the workflow runs only on calibrate/** branches", () => {
    const yml = fs.readFileSync(path.join(root, ".github/workflows/calibrate.yml"), "utf8");
    const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
    assert.match(on, /push:\s*\n\s*branches: \["calibrate\/\*\*"\]/);
    assert.doesNotMatch(on, /pull_request|workflow_dispatch|schedule|main|v7/);
    // Downloads are checked against pinned hashes.
    assert.match(yml, /KATAGO_SHA256: [0-9a-f]{64}/);
    assert.match(yml, /sha256sum -c/g);
    assert.ok(yml.includes("src/models.zig"));
  });

  test("v7 calibration: every level's measured strength exists on both boards", () => {
    for (const s of STRENGTHS) {
      for (const mode of ["standard", "human"]) {
        const m = MEASURED[mode][s.id];
        assert.ok(Number.isFinite(m?.[19]) && Number.isFinite(m?.[9]), `${mode} ${s.id}`);
      }
      assert.ok(Number.isInteger(labelRank(s, "human")));
    }
  });

  test("v7 calibration: the human-style ladder has no gap and its labels follow the measurement", () => {
    const ranks = STRENGTHS.map((s) => labelRank(s, "human"));
    for (let i = 1; i < ranks.length; i++) {
      assert.ok(ranks[i] < ranks[i - 1], `${STRENGTHS[i].id}: label not above the level below`);
      assert.ok(ranks[i - 1] - ranks[i] <= 6, `${STRENGTHS[i].id}: a gap of ${ranks[i - 1] - ranks[i]} ranks`);
    }
    // Each label is within a rank of the measured 19×19 rank (the bottom is
    // shown at the 30-kyu floor; the top two are the lower ends of their intervals).
    const near = (id, mode, label) => {
      const measured = Math.round((2100 - thetaToGoR(MEASURED[mode][id][19])) / 100);
      if (label === 30 && measured >= 30) return;
      assert.ok(Math.abs(measured - label) <= 1, `${mode} ${id}: label ${label}, measured ${measured}`);
    };
    for (const s of STRENGTHS) near(s.id, "human", labelRank(s, "human"));
    near("2d", "strong", labelRank("2d", "strong"));
    assert.ok(labelRank("2d", "strong") <= labelRank("2d", "human"));
    // The changed levels play exactly the measured candidates.
    const h = Object.fromEntries(STRENGTHS.map((s) => [s.id, s.human]));
    for (const [id, name] of [["15k", "r20kb12"], ["5k", "s7k24b12"], ["1k", "s4k32"]]) {
      const { rank, ...play } = h[id];
      assert.deepEqual(play, candidates[name].human, id);
    }
  });

  test("v7 calibration: the committed games reproduce the measured human-style strengths", () => {
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
