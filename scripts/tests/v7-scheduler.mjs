/**
 * v7 tests: scheduler. Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 *
 * The engine scheduler (src/web/js/scheduler.js) on its own, then the app's
 * controllers bundled with a fake KataGo host: a new game's computer move
 * never waits for an earlier game's background analysis, owners cancel
 * what they queued, reports are made in the background with the rating
 * change, and "Analyse all" is cancellable and resumable.
 */
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, what = "condition") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(5);
  }
}

export default async function ({ test, assert, root }) {
  const { createScheduler, LANES, anySignal } = await import("../../src/web/js/scheduler.js");

  /** A search that takes `ms` and logs when it starts. */
  const slow = (log, name, ms = 10) => (signal) =>
    new Promise((resolve) => {
      log.push(name);
      const id = setTimeout(() => resolve(name), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(id);
        resolve(null);
      });
    });

  await test("v7 scheduler: higher lanes run first; a running search is never killed for them", async () => {
    assert.deepEqual(LANES, ["move", "interactive", "live", "background"]);
    const s = createScheduler();
    const log = [];
    const all = [];
    for (let i = 0; i < 5; i++) all.push(s.search(slow(log, "bg" + i), { lane: "background" }));
    await sleep(1);
    assert.deepEqual(log, ["bg0"], "one search at a time");
    all.push(s.search(slow(log, "live"), { lane: "live" }));
    all.push(s.search(slow(log, "look"), { lane: "interactive" }));
    all.push(s.search(slow(log, "move"), { lane: "move" }));
    assert.equal(s.snapshot().running, "background");
    const out = await Promise.all(all);
    assert.deepEqual(log, ["bg0", "move", "look", "live", "bg1", "bg2", "bg3", "bg4"]);
    assert.equal(out[0], "bg0", "the running background search finished, not killed");
  });

  await test("v7 scheduler: an aborted search never runs; owners, lanes and jobs cancel", async () => {
    const s = createScheduler();
    const log = [];
    const ctl = new AbortController();
    const a = s.search(slow(log, "a"), { lane: "background" });
    const b = s.search(slow(log, "b"), { lane: "background", signal: ctl.signal });
    ctl.abort();
    assert.equal(await b, null);
    assert.equal(await a, "a");
    assert.deepEqual(log, ["a"]);

    // An owner: every search and job started with it stops.
    const owner = s.newOwner("game");
    const job = s.startJob({
      kind: "summary",
      owner,
      title: () => "x",
      run: async (job) => {
        for (let i = 0; i < 50; i++) if ((await s.search(slow(log, "j" + i, 5), { signal: job.signal })) == null) return "stopped";
        return "done";
      },
    });
    assert.equal(s.listJobs().length, 1);
    await sleep(12);
    s.cancelOwner(owner);
    assert.equal(await job.promise, null);
    assert.equal(s.listJobs().length, 0, "nothing listed when idle");
    assert.ok(s.ownerSignal(owner).aborted, "a unique owner stays cancelled");
    assert.ok(!s.ownerSignal("reports").aborted);
    s.cancelOwner("reports");
    assert.ok(!s.ownerSignal("reports").aborted, "a fixed owner name is fresh again");

    // cancelLanes: queued and running searches of those lanes only.
    log.length = 0;
    const m1 = s.search(slow(log, "m1", 30), { lane: "move" });
    const m2 = s.search(slow(log, "m2"), { lane: "move" });
    const bg = s.search(slow(log, "bg"), { lane: "background" });
    await sleep(1);
    s.cancelLanes(["move"]);
    assert.equal(await m1, null);
    assert.equal(await m2, null);
    assert.equal(await bg, "bg");
    assert.deepEqual(log, ["m1", "bg"]);

    // Hidden jobs are not listed; cancelJob and cancelAll stop jobs.
    const h = s.startJob({ kind: "report", hidden: true, run: (j) => s.search(slow(log, "h", 50), { signal: j.signal }) });
    const v = s.startJob({ kind: "batch", run: (j) => s.search(slow(log, "v", 50), { signal: j.signal }) });
    assert.deepEqual(s.listJobs().map((j) => j.kind), ["batch"]);
    assert.equal(s.listJobs({ all: true }).length, 2);
    s.cancelJob(v.id);
    assert.equal(await v.promise, null);
    s.cancelAll("quit");
    assert.equal(await h.promise, null);
    assert.equal(h.signal.reason, "quit");
    const x = new AbortController();
    const y = new AbortController();
    const any = anySignal(x.signal, null, y.signal);
    y.abort("why");
    assert.ok(any.aborted);
    assert.equal(any.reason, "why");
  });

  /* ---------------------------------------------- the app, with a fake host */

  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: [
        'export * as Play from "./src/web/js/app/play-ctl.js";',
        'export * as Report from "./src/web/js/app/report-ctl.js";',
        'export * as Batch from "./src/web/js/app/report-batch.js";',
        'export * as Status from "./src/web/js/app/report-status.jsx";',
        'export * as Engine from "./src/web/js/engine.js";',
        'export * as Lib from "./src/web/js/library.js";',
        'export * as P from "./src/web/js/persist.js";',
        'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
        'export { setLang } from "./src/web/js/i18n.js";',
        'export { state } from "./src/web/js/app/store.js";',
        'export { setRestorer } from "./src/web/js/app/ctl-core.js";',
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
  const A = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  const { Play, Report, Batch, Status, Engine, Lib, P, Game, BLACK, WHITE, state } = A;

  // A fake async KataGo host: every search takes `delay` ms; the log keeps
  // each request (visits tell who asked: the computer at 30 kyu uses 8, the
  // post-game summary 32 on 19×19, a report 40 / 80).
  const requests = [];
  const pending = new Map();
  let delay = 15;
  // Black's 11th and 21st moves of a 19×19 game each lose 6 points (so a
  // finished game has two drills); the best move is always A1 (empty).
  const info = (size, visits, moves = "") => {
    const n = size * size;
    const k = moves.trim() ? moves.trim().split(/\s+/).length / 2 : 0;
    const lead = size === 19 ? 0.5 - (k >= 11 ? 6 : 0) - (k >= 21 ? 6 : 0) : 0.5;
    const wr = 1 / (1 + Math.exp(-lead / 8));
    return `info move A1 visits ${visits} winrate ${wr} scoreLead ${lead} order 0 pv A1 ownership ` + Array(n).fill("0").join(" ");
  };
  globalThis.zero = {
    on: () => () => {},
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true };
      if (command === "studio.katagoCancel") {
        for (const [id, done] of pending) if (!payload.id || payload.id === id) done({ ok: false, id, cancelled: true });
        return { ok: true };
      }
      if (command === "studio.katagoAnalyzeAsync") {
        requests.push({ id: payload.id, visits: payload.visits, at: Date.now() });
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            pending.delete(payload.id);
            resolve({ ok: true, id: payload.id, play: "pass", info: info(payload.size, payload.visits, payload.moves || "") });
          }, delay);
          pending.set(payload.id, (v) => {
            clearTimeout(timer);
            pending.delete(payload.id);
            resolve(v);
          });
        });
      }
      throw new Error("unexpected command " + command);
    },
  };
  A.setLang("en");
  P.clearAll?.();
  for (const rec of Lib.listGames()) Lib.deleteGame(rec.id);
  state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", teaching: false, showEval: false, onboarded: true, confirmMove: false };
  state.progress = P.loadProgress();
  state.engine = { kind: "katago", name: "KataGo test", available: true };
  // Back/forward as the app does it (controller.js restore), for the report page.
  A.setRestorer((loc) => {
    state.space = loc.space;
    Report.restoreReport(loc);
  });

  /** Play `n` alternating moves straight onto the game (no controller). */
  function fill(game, n) {
    let k = 0;
    for (let y = 2; y < game.size - 2 && k < n; y += 2) {
      for (let x = 2; x < game.size - 2 && k < n; x++) {
        if (game.play(x, y).ok) k++;
      }
    }
  }

  /** A rated game against the computer that the player resigns. */
  function finishRatedGame(moves = 40) {
    Play.newGame({ size: 19, color: BLACK, strength: "30k" });
    const g = state.game;
    fill(g.game, moves);
    Play.requestResign();
    state.sheet.onConfirm();
    state.sheet = null;
    return g;
  }

  await test("v7 scheduler: a new game's computer move does not wait for the last game's background analysis", async () => {
    const g1 = finishRatedGame(40);
    assert.ok(g1.recordId, "saved");
    assert.equal(g1.summary?.status, "analyzing");
    await until(() => requests.filter((r) => r.visits === 32).length >= 3, 4000, "summary searches");
    const summaryJob = Engine.sched.listJobs().find((j) => j.kind === "summary");
    assert.ok(summaryJob, "the summary is a listed background job");
    assert.match(summaryJob.title(), /Analysing your game against ≈ 30 kyu/);

    // New game with the computer as Black: its first move comes next.
    const before = requests.length;
    Play.newGame({ size: 19, color: WHITE, strength: "30k" });
    const g2 = state.game;
    await until(() => requests.slice(before).some((r) => r.visits === 8), 2000, "the computer's search");
    const first = requests.slice(before).findIndex((r) => r.visits === 8);
    assert.ok(first <= 1, `the computer's search waited behind ${first} searches`);
    assert.equal(summaryJob.signal.aborted, true, "the new game cancelled the old game's summary");
    await until(() => g2.game.moveNumber === 1, 3000, "the computer's move");

    // The old game's report carries on in the background ("reports").
    await until(() => Report.reportJob(g1.recordId), 2000, "background report");
    const rep = Report.reportJob(g1.recordId);
    assert.equal(rep.owner, "reports");
    // A third game: even with that report running, the computer goes next.
    await until(() => rep.progress > 0.1, 4000, "report progress");
    const mark = requests.length;
    Play.newGame({ size: 19, color: WHITE, strength: "30k" });
    const g3 = state.game;
    await until(() => requests.slice(mark).some((r) => r.visits === 8), 2000, "the computer's search");
    assert.ok(requests.slice(mark).findIndex((r) => r.visits === 8) <= 1);
    assert.equal(rep.signal.aborted, false, "a new game does not cancel the report");
    await until(() => g3.game.moveNumber === 1, 3000, "the computer's move");

    // The report is stored, so opening it is instant, and shows the rating change.
    await rep.promise;
    const rec = Lib.getGame(g1.recordId);
    assert.ok(rec.report, "report stored in the background");
    assert.equal(rec.report.confidence, "high");
    assert.ok(rec.rating?.before && rec.rating?.after, "rating change stored");
    Report.openReport(g1.recordId, { space: "library" });
    assert.equal(state.report.status, "done");
    assert.match(Status.ratingChangeText(Report.reportRating()), /^Strength ≈ \d+ kyu/);
    Report.closeReport();
  });

  await test("v7 scheduler: when a new game cuts the summary short, the background report fills in what it would have, once", async () => {
    await until(() => Engine.sched.listJobs({ all: true }).length === 0, 8000, "idle");
    const drillsOf = (id) => state.progress.mistakes.filter((m) => m.gameKey === id).map((m) => m.id).sort();
    const trendOf = (id) => state.progress.games.find((r) => r.id === id);

    // Interrupted: a new game starts while the summary is still running.
    const g1 = finishRatedGame(40);
    const id1 = g1.recordId;
    assert.equal(trendOf(id1)?.phases ?? null, null, "no analysis in the trend record yet");
    await until(() => requests.filter((r) => r.visits === 32).length >= 1, 4000, "summary started");
    Play.newGame({ size: 19, color: BLACK, strength: "30k" });
    assert.notEqual(g1.summary?.status, "done");
    await until(() => Report.reportJob(id1), 3000, "background report");
    await Report.reportJob(id1).promise;
    const t1 = trendOf(id1);
    assert.ok(t1.phases, "per-phase losses filled in by the report");
    assert.equal(t1.confidence, "high");
    assert.ok(t1.themeLoss && typeof t1.themeLoss === "object", "the plan's themeLoss");
    assert.deepEqual(drillsOf(id1), [`${id1}-11`, `${id1}-21`].sort(), "the two costliest mistakes as drills, summary ids");
    assert.equal(Lib.getGame(id1).learned, true);

    // Only once: making the report again adds nothing.
    const weak = JSON.stringify(state.progress.weakness);
    Lib.patchGame(id1, { report: null });
    await Report.queueReport(id1).promise;
    assert.deepEqual(drillsOf(id1), [`${id1}-11`, `${id1}-21`].sort());
    assert.equal(JSON.stringify(state.progress.weakness), weak, "weaknesses not counted twice");

    // Not interrupted: the summary does it, and the report then does not again.
    const g2 = finishRatedGame(40);
    const id2 = g2.recordId;
    await until(() => g2.summary?.status === "done", 8000, "summary done");
    assert.equal(Lib.getGame(id2).learned, true, "the summary marked it");
    const weak2 = JSON.stringify(state.progress.weakness);
    await until(() => Lib.getGame(id2).report, 8000, "report");
    assert.deepEqual(drillsOf(id2), [`${id2}-11`, `${id2}-21`].sort());
    assert.equal(JSON.stringify(state.progress.weakness), weak2);
    assert.ok(trendOf(id2).phases);
  });

  await test("v7 scheduler: rating change text, before → after with the ± of the new estimate", () => {
    assert.equal(Status.ratingChangeText({ before: { rank: 12, pm: 2 }, after: { rank: 11, pm: 1 } }), "Strength ≈ 12 kyu → ≈ 11 kyu (±1)");
    assert.equal(Status.ratingChangeText({ before: { rank: 1, pm: 2 }, after: { rank: 0, pm: 2 } }), "Strength ≈ 1 kyu → ≈ 1 dan (±2)");
    assert.equal(Status.ratingChangeText({ before: { rank: 5, pm: 1 }, after: { rank: 5, pm: 1 } }), "Strength ≈ 5 kyu (±1), unchanged");
    assert.equal(Status.ratingChangeText(null), "");
    const ch = Play.ratingChange({ v: 6, mu: 5, sigma: 1, games: 3, at: 0, history: [] }, { v: 6, mu: 6, sigma: 0.9, games: 4, at: 0, history: [] }, 0);
    assert.ok(ch.after.r > ch.before.r && ch.after.pm >= 1);
  });

  /** A two-player record of `moves` moves. */
  function twoPlayerRecord(moves = 12, name = "") {
    const game = new Game({ size: 9, komi: 6.5 });
    fill(game, moves);
    game.setResult("B+R");
    return Lib.saveGame(game, { opponent: "human", name, source: "game" });
  }

  await test("v7 scheduler: closing a report cancels the analysis it started", async () => {
    delay = 25;
    const rec = twoPlayerRecord(14);
    Report.openReport(rec.id, { space: "library" });
    const job = Report.reportJob(rec.id);
    assert.ok(job && job.owner.startsWith("report:"), "owned by the page");
    await until(() => job.progress > 0, 3000, "progress");
    Report.closeReport();
    assert.equal(job.signal.aborted, true);
    assert.equal(await job.promise, null);
    assert.equal(Lib.getGame(rec.id).report, undefined);
    // Opened again, it resumes from the positions it had.
    const seen = requests.length;
    Report.openReport(rec.id, { space: "library" });
    await Report.reportJob(rec.id).promise;
    assert.ok(Lib.getGame(rec.id).report);
    assert.ok(requests.length - seen < 15, "kept the positions already analysed");
    Report.closeReport();
    delay = 15;
  });

  await test("v7 scheduler: Analyse all makes the missing reports, cancels, and resumes after quitting", async () => {
    for (const r of Lib.listGames()) Lib.deleteGame(r.id);
    const recs = [twoPlayerRecord(10, "a"), twoPlayerRecord(10, "b"), twoPlayerRecord(10, "c"), twoPlayerRecord(10, "d")];
    assert.equal(Batch.batchCandidates().length, 4);
    // Cancel: the rest is forgotten.
    let job = Batch.analyseAll();
    assert.ok(Engine.sched.listJobs().some((j) => j.kind === "batch"));
    assert.equal(Engine.sched.listJobs().filter((j) => j.kind === "report").length, 0, "its reports are not listed separately");
    await until(() => state.batch?.done >= 1, 5000, "first game");
    assert.ok(Batch.rowAnalysis(state.batch.ids[1])?.queued);
    Batch.cancelBatch();
    assert.equal(await job.promise, null);
    assert.equal(P.readJSON(Batch.BATCH_KEY, null), null);
    assert.equal(state.batch, null);
    const left = Batch.batchCandidates().length;
    assert.ok(left >= 1 && left <= 3);
    // Quitting keeps the rest; the next launch carries on.
    job = Batch.analyseAll();
    await until(() => Engine.sched.listJobs({ all: true }).some((j) => j.kind === "report"), 3000, "a report");
    Engine.sched.cancelAll("quit");
    await job.promise;
    assert.ok(P.readJSON(Batch.BATCH_KEY, null)?.ids?.length >= 1, "saved for the next launch");
    job = Batch.resumeBatch();
    assert.ok(job);
    await job.promise;
    assert.equal(Batch.batchCandidates().length, 0);
    for (const r of recs) assert.ok(Lib.getGame(r.id).report, r.name);
    assert.equal(P.readJSON(Batch.BATCH_KEY, null), null);
    assert.equal(Engine.sched.listJobs().length, 0);
  });

  await test("v7 scheduler: the browser preview (no KataGo) still analyses with the offline estimate", async () => {
    await until(() => Engine.sched.listJobs({ all: true }).length === 0, 5000, "idle");
    const saved = globalThis.zero;
    delete globalThis.zero;
    try {
      state.engine = { kind: "offline", name: "", available: false };
      const rec = twoPlayerRecord(12);
      const job = Report.queueReport(rec.id);
      await job.promise;
      assert.equal(Lib.getGame(rec.id).report.confidence, "low", "an estimate, made in the background");
      const game = new Game({ size: 9 });
      fill(game, 10);
      const a = await Engine.analyzeNode(game, game.current, 40);
      assert.equal(a, null, "no KataGo: the caller uses the estimate");
      const r = await Engine.decide(game, "30k");
      assert.equal(r.mode, "offline");
      assert.ok(r.move);
    } finally {
      globalThis.zero = saved;
      state.engine = { kind: "katago", name: "KataGo test", available: true };
    }
  });

  await test("v7 scheduler: strings in four languages; no old serial chain or tokens left", async () => {
    const { V7_SCHEDULER } = await import("../../src/web/js/messages/v7-scheduler.js");
    const holes = (v) => [...v.matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join();
    assert.ok(Object.keys(V7_SCHEDULER).length >= 15);
    for (const [k, v] of Object.entries(V7_SCHEDULER)) {
      assert.ok(k.startsWith("sched."), k);
      for (const lang of ["zh", "en", "ko", "ja"]) {
        assert.ok(v[lang]?.trim(), `${k} ${lang}`);
        assert.equal(holes(v[lang]), holes(v.en), `${k} ${lang}`);
      }
    }
    const src = (f) => fs.readFileSync(path.join(root, f), "utf8");
    const engine = src("src/web/js/engine.js");
    assert.doesNotMatch(engine, /function queued\(/);
    for (const f of ["src/web/js/app/review-ctl.js", "src/web/js/app/play-ctl.js", "src/web/js/app/report-ctl.js"]) {
      assert.doesNotMatch(src(f), /\.cancelled\b|summaryToken/, f);
    }
  });
}
