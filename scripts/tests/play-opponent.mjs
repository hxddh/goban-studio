/**
 * v9 tests: one opponent axis (opponents.js, engine.js decide, the play
 * controller). Loaded by scripts/test.mjs (every file in scripts/tests/, in
 * name order); receives the runner's helpers.
 *
 * The pure ladder first: the ranks, what plays each with which networks
 * installed, the measured strengths behind the labels; then the engine
 * playing a rank through a fake KataGo host, falling back when an optional
 * process cannot answer; then what a game stores.
 */
import fs from "node:fs";
import { register, TEARDOWN_EXPORTS } from "./helpers.mjs";
import path from "node:path";

import * as O from "../../src/web/js/opponents.js";
import { fitBT } from "../calibrate-strength.mjs";
import { V7_ALIAS } from "./core-calibration.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INSTALLS = [{}, { human: true }, { strong: true }, { human: true, strong: true }];
const name = (i) => JSON.stringify(i);

export default async function ({ test, assert, root }) {
  await test("play opponent: the ladder is short, evenly spaced, and each label is the measured rank", () => {
    assert.deepEqual(O.RANKS, [30, 24, 18, 15, 12, 10, 7, 4, 1, -3, -6]);
    for (const inst of INSTALLS) {
      const l = O.ladder(inst);
      assert.ok(l.length >= 10 && l.length <= O.RANKS.length, name(inst));
      for (let i = 0; i < l.length; i++) {
        const e = l[i];
        assert.deepEqual(Object.keys(e).sort(), ["impl", "label", "rank"]);
        assert.ok(O.RANKS.includes(e.rank), `${e.rank}`);
        // The label shown is what the implementation measured on 19×19, rounded…
        assert.equal(e.label, O.roundRank(O.implRank(e.impl)), e.impl);
        // …and within a rank of the rank chosen.
        assert.ok(Math.abs(e.label - e.rank) <= 1, `${name(inst)} ${e.rank}: plays ${e.label} (${e.impl})`);
        if (i) {
          const gap = l[i - 1].label - e.label;
          assert.ok(gap >= 2 && gap <= 6, `${name(inst)}: ${l[i - 1].label} → ${e.label}`);
          assert.ok(O.implTheta(e.impl, 19) > O.implTheta(l[i - 1].impl, 19), "stronger up the ladder");
        }
      }
    }
  });

  await test("play opponent: each rank maps to the closest measured implementation, human-style where it measured well", () => {
    const table = (inst) => O.ladder(inst).map((e) => `${e.rank}:${e.impl}:${e.label}`);
    assert.deepEqual(table({}), ["30:L:25k:29", "24:L:20k:23", "18:L:15k:18", "15:C:b40:15", "12:L:10k:12", "10:C:b18:10", "7:L:5k:7", "4:C:b0:5", "1:L:1k:2", "-3:L:2d:-3"]);
    assert.deepEqual(table({ human: true }), ["30:HL:25k:30", "24:HL:20k:24", "18:HL:15k:18", "15:CH:r20k:15", "12:HL:10k:12", "10:C:b18:10", "7:HL:5k:7", "4:CH:s7k24:3", "1:HL:1k:1", "-3:L:2d:-3", "-6:HL:2d:-6"]);
    // The stronger network alone reaches the top; with both, the human-style 2d (it measured closer to 7 dan).
    assert.deepEqual(table({ strong: true }).at(-1), "-6:LS:2d:-7");
    assert.deepEqual(table({ human: true, strong: true }), table({ human: true }));
    // Missing networks: the nearest standard level, shown at its own rank.
    for (const r of O.RANKS) {
      const e = O.levelFor(r, {});
      assert.equal(O.impl(e.impl).kind, "standard", `${r}`);
      for (const inst of INSTALLS) {
        const got = O.levelFor(r, inst);
        const it = O.impl(got.impl);
        assert.ok(it.kind === "standard" || inst[it.kind], `${name(inst)} ${r}: ${got.impl} is not installed`);
        // Nothing reachable measured closer, except a human-style one within the slack.
        const d = (id) => Math.abs(O.implRank(id) - r);
        for (const other of O.IMPLS) {
          if (!(other.kind === "standard" || inst[other.kind])) continue;
          assert.ok(d(got.impl) <= d(other.id) + O.HUMAN_SLACK + 1e-9, `${name(inst)} ${r}: ${other.id} is closer than ${got.impl}`);
        }
        if (it.kind === "human") assert.ok(d(got.impl) <= 1, `${got.impl} within one rank of ${r}`);
      }
    }
    // Without the optional networks the 7-dan rank is the 4-dan level: one entry, not two.
    assert.equal(O.levelFor(-6, {}).impl, "L:2d");
    assert.equal(O.ladder({}).filter((e) => e.impl === "L:2d").length, 1);
    assert.equal(O.ladder({}).at(-1).rank, -3);
    // Any rank has an answer (a stored one, or one from the estimate).
    for (const r of [35, 30, 21, 8, 0, -9, "x", null]) assert.ok(O.impl(O.levelFor(r, { human: true }).impl), `${r}`);
    assert.equal(O.nearest(29, {}).rank, 30);
    assert.equal(O.nearest(5, {}).rank, 4, "by the rank it plays at");
    assert.equal(O.nearest(-6, {}).rank, -3, "a rank the ladder cannot reach: the nearest it can");
    assert.equal(O.nearest(15, { human: true }).rank, 15);
  });

  await test("play opponent: measured() is the implementation's θ on each board, measured or derived from its kind", () => {
    for (const inst of INSTALLS) {
      for (const e of O.ladder(inst)) {
        for (const size of [9, 13, 19]) {
          const t = O.measured(e.rank, size, inst);
          assert.ok(Number.isFinite(t), `${e.impl} ${size}`);
          assert.equal(t, O.implTheta(e.impl, size));
        }
      }
    }
    // The calibrated levels are their measurements.
    for (const s of O.STRENGTHS) {
      for (const [prefix, mode] of [["L:", "standard"], ["HL:", "human"]]) {
        if (!O.impl(prefix + s.id)) continue;
        for (const size of [9, 13, 19]) assert.equal(O.implTheta(prefix + s.id, size), O.MEASURED[mode][s.id][size]);
      }
    }
    assert.equal(O.implTheta("LS:2d", 13), O.MEASURED.strong["2d"][13]);
    // Bridges keep what was measured (C:b40 on 13×13 in v8, the v6 settings on 9×9 in v7)…
    assert.equal(O.implTheta("C:b40", 13), 6.36);
    assert.equal(O.implTheta("CH:r20k", 9), 5.3);
    assert.ok(!O.derived("C:b40", 13) && O.derived("C:b40", 9) && O.derived("C:b18", 13) && !O.derived("L:10k", 9));
    // …and a board they were not measured on lies between their measured neighbours of the same kind.
    const between = (id, size, lo, hi) => {
      const t = O.implTheta(id, size);
      assert.ok(t > O.implTheta(lo, size) && t < O.implTheta(hi, size), `${id} ${size}: ${t}`);
    };
    between("C:b40", 9, "L:15k", "L:10k");
    between("C:b18", 9, "L:10k", "L:5k");
    between("C:b18", 13, "L:10k", "L:5k");
    between("C:b0", 13, "L:5k", "L:1k");
    between("CH:r20k", 13, "HL:15k", "HL:10k");
    between("CH:s7k24", 13, "HL:5k", "HL:1k");
    // Every 19×19 strength lies inside its published interval (GoR, within rounding).
    for (const it of O.IMPLS) {
      const g = O.thetaToGoR(it.theta[19]);
      assert.ok(it.gor[0] <= g + 1 && g - 1 <= it.gor[1], `${it.id}: ${g} outside ${it.gor}`);
    }
  });

  await test("play opponent: the implementations play exactly the settings that were measured", () => {
    const v7 = JSON.parse(fs.readFileSync(path.join(root, "docs/calibration/v7-candidates.json"), "utf8"));
    const v8 = JSON.parse(fs.readFileSync(path.join(root, "docs/calibration/v8-candidates.json"), "utf8"));
    const play = (id) => O.impl(id).level;
    assert.deepEqual(play("CH:r20k").human, v7.r20k.human);
    assert.deepEqual(play("CH:s7k24").human, v7.s7k24.human);
    const { local, ...b40 } = play("C:b40");
    assert.deepEqual(b40, v8.b40);
    // C:bNN: the 8-visit base level with blunder 0.NN (docs/strength.md, v4).
    const base = { visits: 8, temp: 2, maxLoss: 40, slip: 0.3 };
    for (const [id, blunder] of [["C:b18", 0.18], ["C:b0", 0], ["C:b40", 0.4]]) {
      const { local, ...rest } = play(id);
      assert.deepEqual(rest, { ...base, blunder }, id);
      assert.ok(local >= 1 && local <= 5);
    }
    for (const it of O.IMPLS) {
      const [kind, cid] = it.id.split(":");
      const s = O.calibrated(cid);
      if (kind === "L") assert.deepEqual({ ...play(it.id) }, (({ human, strong, rank, id, ...r }) => r)(s), it.id);
      if (kind === "HL") assert.deepEqual(play(it.id).human, s.human, it.id);
      if (kind === "LS") assert.deepEqual(play(it.id).strong, s.strong, it.id);
      assert.equal(it.kind, { L: "standard", C: "standard", HL: "human", CH: "human", LS: "strong" }[kind], it.id);
    }
  });

  await test("play opponent: the committed games reproduce the measured strengths of the v6 human settings", () => {
    const dir = path.join(root, "docs/calibration/results");
    const games = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)))
      .map((g) => ({ ...g, black: V7_ALIAS[g.black] || g.black, white: V7_ALIAS[g.white] || g.white }));
    for (const size of [19, 9]) {
      const gs = games.filter((g) => g.size === size);
      const players = [...new Set(gs.flatMap((g) => [g.black, g.white]))];
      const fixed = Object.fromEntries(O.STRENGTHS.map((s) => [`L:${s.id}`, O.MEASURED.standard[s.id][size]]));
      const { theta } = fitBT(gs, players, { fixed });
      for (const id of ["CH:r20k", "CH:s7k24"]) assert.ok(Math.abs(theta[id] - O.impl(id).theta[size]) < 0.01, `${size}×${size} ${id}: ${theta[id]}`);
    }
  });

  /* ----------------------------------------- the engine, with a fake host */

  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: [
        'export * as Play from "./src/web/js/app/play-ctl.js";',
        'export * as Engine from "./src/web/js/engine.js";',
        // A bundle of its own: an identical one would be the same module, with another file's KataGo status cached.
        'export { RANKS } from "./src/web/js/opponents.js";',
        'export * as Lib from "./src/web/js/data/games.js";',
        'export * as P from "./src/web/js/data/settings.js";',
        'export * as PM from "./src/web/js/model/player.js";',
        'export { store } from "./src/web/js/data/store.js";',
        'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
        'export { setLang } from "./src/web/js/i18n.js";',
        'export { state } from "./src/web/js/app/store.js";',
        ...TEARDOWN_EXPORTS,
      ].join("\n"),
      resolveDir: root,
      loader: "js",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: { ".json": "json" },
    write: false,
    logLevel: "error",
  });
  const A = register(await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")));
  const { Play, Engine, Lib, P, PM, Game, BLACK, state, store } = A;
  // The store picks its backend on first use: the preview's, before the fake host below.
  await store.open();

  // A fake host: every search answers D4 with one candidate, except the
  // engines listed in `failing`, which do not answer.
  const searches = [];
  const failing = new Set();
  const savedHost = globalThis.zero;
  globalThis.zero = {
    on: () => () => {},
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true, models: true };
      if (command === "studio.katagoCancel") return { ok: true };
      if (command === "studio.katagoAnalyzeAsync") {
        searches.push(payload);
        await sleep(1);
        const engine = payload.engine || "standard";
        if (failing.has(engine)) return { ok: false };
        return { ok: true, id: payload.id, engine, play: "D4", info: "info move D4 visits 20 winrate 0.5 scoreLead 0.5 order 0 pv D4" };
      }
      throw new Error("unexpected command " + command);
    },
  };
  const realNow = performance.now.bind(performance);
  let skew = 0;
  performance.now = () => realNow() + (skew += 5000);

  try {
    const fresh = () => new Game({ size: 19 });

    await test("play opponent: the engine plays the rank's implementation and falls back to the nearest standard level", async () => {
      Engine.setModels({ human: true, strong: false });
      searches.length = 0;
      let r = await Engine.decide(fresh(), 12);
      assert.equal(r.impl, "HL:10k");
      assert.equal(r.mode, "human");
      assert.equal(searches[0].engine, "human");
      assert.equal(searches[0].profile, "rank_12k");
      // The human process does not answer: the standard level nearest what was asked.
      failing.add("human");
      searches.length = 0;
      r = await Engine.decide(fresh(), { rank: 3, impl: "CH:s7k24" });
      assert.equal(r.mode, "standard");
      assert.equal(r.impl, "L:1k", "3 kyu without the human network: the standard level that measured 2 kyu");
      assert.deepEqual(searches.map((s) => s.engine || "standard"), ["human", "standard"]);
      failing.clear();
      // An implementation that cannot play any more (the network was removed) is replaced by what plays its rank.
      Engine.setModels({ human: false, strong: false });
      r = await Engine.decide(fresh(), { rank: -7, impl: "LS:2d" });
      assert.equal(r.impl, "L:2d");
      // The stronger network plays the top when installed; its failure falls back too.
      Engine.setModels({ human: false, strong: true });
      r = await Engine.decide(fresh(), -6);
      assert.equal(r.impl, "LS:2d");
      assert.equal(r.mode, "strong");
      failing.add("strong");
      r = await Engine.decide(fresh(), -6);
      assert.equal(r.impl, "L:2d");
      failing.clear();
      // Without KataGo: the local fallback, for the standard level of the rank.
      assert.deepEqual(Engine.installed({ human: true, strong: true, strongUsable: false }), { human: true, strong: false });
    });

    await test("play opponent: a game stores its rank and implementation, never a strength id, and is rated against what played", async () => {
      Engine.setModels({ human: true, strong: false });
      A.setLang("en");
      for (const rec of Lib.listGames()) Lib.deleteGame(rec.id);
      state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", teaching: false, showEval: false, onboarded: true, confirmMove: false };
      state.profile = PM.newProfile();
      state.engine = { kind: "katago", name: "KataGo test", available: true };
      assert.equal(state.settings.opponentRank, 30);
      assert.ok(!("strength" in state.settings) && !("humanStyle" in state.settings));
      Play.newGame({ size: 19, color: BLACK, opponentRank: 4 });
      const g = state.game;
      assert.equal(g.impl, "CH:s7k24");
      assert.equal(g.rank, 3, "the rank shown is what plays it");
      assert.equal(state.settings.opponentRank, 4, "the choice is remembered as a rank");
      assert.ok(!("strength" in g));
      // The computer's move, then the stored game in progress.
      g.game.play(15, 3);
      await Play.maybeComputerMove({ afterHuman: true });
      assert.equal(g.played, "CH:s7k24");
      Play.persistCurrent();
      const cur = Lib.loadCurrent();
      assert.equal(cur.rank, 3);
      assert.equal(cur.impl, "CH:s7k24");
      assert.ok(!("strength" in cur));
      // A restored game keeps its implementation; without the network, the standard level of its rank.
      assert.equal(Play.opponentOf(cur).impl, "CH:s7k24");
      Engine.setModels({ human: false });
      assert.deepEqual(Play.opponentOf({ rank: 3 }), { rank: 2, impl: "L:1k" });
      Engine.setModels({ human: true });
      // The library record and the suggestion carry ranks.
      const rec = Play.saveToLibrary({ quiet: true });
      const saved = Lib.getGame(rec.id);
      assert.equal(saved.rank, 3);
      assert.equal(saved.impl, "CH:s7k24");
      assert.ok(!("strength" in saved));
      const sug = Play.recommendedGame();
      assert.ok(O.RANKS.includes(sug.opponentRank) && Number.isInteger(sug.label) && O.RANKS.includes(sug.quick.opponentRank));
      assert.ok(!("strength" in sug) && !("strength" in sug.quick));
      // The rating: a win against what played moves the estimate by that implementation's θ.
      const prev = PM.priorRating(5, 0);
      const a = PM.updateRating(prev, { opponent: PM.implOpponent("CH:s7k24", { size: 19 }), won: true, at: 0 });
      const b = PM.updateRating(prev, { opponent: O.measured(4, 19, { human: true }), won: true, at: 0 });
      assert.equal(a.mu, b.mu);
      // Handicap stones make the opponent effectively weaker, on each board's own scale.
      assert.ok(PM.implOpponent("L:10k", { handicap: 4 }) < PM.implOpponent("L:10k"));
      assert.ok(PM.implOpponent("L:10k", { size: 9, handicap: 2 }) < PM.implOpponent("L:10k", { size: 9 }));
      const src = fs.readFileSync(path.join(root, "src/web/js/app/play-ctl.js"), "utf8");
      assert.match(src, /const impl = g\.played \|\| Engine\.resolveOpponent\(/);
      assert.match(src, /opponent: implOpponent\(impl, \{ size, handicap \}\)/);
    });
  } finally {
    globalThis.zero = savedHost;
    performance.now = realNow;
    Engine.setModels({ human: false, strong: false });
  }

  await test("play opponent: no mode wording or human-style switch is left in the interface", async () => {
    const { MESSAGES } = await import("../../src/web/js/messages.js");
    for (const k of Object.keys(MESSAGES)) assert.ok(!/^models\.(mode\.|humanStyle)/.test(k), k);
    const files = ["app/sheets.jsx", "app/play.jsx", "app/models-ctl.js", "app/play-ctl.js", "app/controller.js", "play/home.jsx", "data/settings.js"];
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, "src/web/js", f), "utf8");
      assert.doesNotMatch(src, /humanStyle|opponentMode\(|models\.mode\.|STRENGTHS|strengthById|labelRank/, f);
      assert.doesNotMatch(src, /\bstrength: /, `${f} passes no strength id`);
    }
  });
}
