/**
 * v8 tests: bug fixes. Loaded by scripts/test.mjs (every file in
 * scripts/tests/, in name order); receives the runner's helpers.
 *
 * The v7 leftovers first (a background search pre-empted for the
 * computer's move, classic-game drills kept out of the weak themes,
 * imported problems in the Daily five's reviews, stale reports dropped
 * once), then the bugs found in v8, each with the test that showed it.
 */
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, what = "condition") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(3);
  }
}

/** Bundle app modules (with JSX and JSON) into one fresh module instance. */
async function bundle(root, lines) {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: { contents: lines.join("\n"), resolveDir: root, loader: "js" },
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
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
}

export default async function ({ test, assert, root }) {
  const { createScheduler } = await import("../../src/web/js/scheduler.js");
  const Plan = await import("../../src/web/js/app/plan.js");
  const persist = await import("../../src/web/js/persist.js");
  const { PROBLEMS } = await import("../../src/web/js/content/problems.js");
  const GRADES = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const DAY = persist.DAY;

  /* ------------------------------------------- A1: pre-empting a search */

  /** A search that takes `ms`, logs when it starts, and stops on abort. */
  const slow = (log, name, ms = 10) => (signal) =>
    new Promise((resolve) => {
      log.push(name);
      const id = setTimeout(() => resolve(name), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(id);
        resolve(null);
      });
    });

  await test("v8 fix: a move pre-empts a running background search, which runs again and resolves", async () => {
    const s = createScheduler();
    const log = [];
    const bg = s.search(slow(log, "bg", 200), { lane: "background" });
    const bg2 = s.search(slow(log, "bg2", 5), { lane: "background" });
    await sleep(20);
    const t0 = Date.now();
    let startedAt = 0;
    const move = s.search((sig) => {
      startedAt = Date.now();
      return slow(log, "move", 5)(sig);
    }, { lane: "move" });
    assert.equal(await move, "move");
    assert.ok(startedAt - t0 < 20, `the move started at once (${startedAt - t0} ms)`);
    assert.equal(await bg, "bg", "the pre-empted search ran again and resolved its own value");
    assert.equal(await bg2, "bg2");
    assert.deepEqual(log, ["bg", "move", "bg", "bg2"], "it went back to the front of its lane");
    assert.equal(s.snapshot().preemptions, 1);

    // Lanes other than "move" never pre-empt; nor does a move pre-empt a
    // search that is not pre-emptible, or one of a higher lane.
    log.length = 0;
    const a = s.search(slow(log, "a", 40), { lane: "background" });
    await sleep(2);
    const look = s.search(slow(log, "look", 1), { lane: "interactive" });
    const lv = s.search(slow(log, "live", 1), { lane: "live" });
    await Promise.all([a, look, lv]);
    const b = s.search(slow(log, "b", 40), { lane: "background", preemptible: false });
    await sleep(2);
    await s.search(slow(log, "m", 1), { lane: "move" });
    await b;
    const c = s.search(slow(log, "c", 30), { lane: "live" });
    await sleep(2);
    await s.search(slow(log, "m2", 1), { lane: "move" });
    await c;
    assert.deepEqual(log, ["a", "look", "live", "b", "m", "c", "m2"]);
    assert.equal(s.snapshot().preemptions, 1);

    // Cancelling the pre-empted search while it waits to run again: it never runs.
    log.length = 0;
    const ctl = new AbortController();
    const d = s.search(slow(log, "d", 100), { lane: "background", signal: ctl.signal });
    await sleep(2);
    const m3 = s.search(slow(log, "m3", 20), { lane: "move" });
    await sleep(2);
    ctl.abort();
    assert.equal(await d, null);
    await m3;
    await sleep(5);
    assert.deepEqual(log, ["d", "m3"]);
    assert.deepEqual(s.snapshot().queued, { move: 0, interactive: 0, live: 0, background: 0 });
  });

  // The app with a fake async KataGo host (as in v7-scheduler.mjs).
  const A = await bundle(root, [
    'export * as Play from "./src/web/js/app/play-ctl.js";',
    'export * as Report from "./src/web/js/app/report-ctl.js";',
    'export * as Batch from "./src/web/js/app/report-batch.js";',
    'export * as Engine from "./src/web/js/engine.js";',
    'export * as Lib from "./src/web/js/library.js";',
    'export * as P from "./src/web/js/persist.js";',
    'export * as Practice from "./src/web/js/app/practice-ctl.js";',
    'export * as PlanCtl from "./src/web/js/app/plan-ctl.js";',
    'export * as Store from "./src/web/js/app/collections-store.js";',
    'export * as Review from "./src/web/js/app/review-ctl.js";',
    'export * as I from "./src/web/js/problem-import.js";',
    'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
    'export { setLang } from "./src/web/js/i18n.js";',
    'export { state } from "./src/web/js/app/store.js";',
    'export { setRestorer } from "./src/web/js/app/ctl-core.js";',
    'export { loadSGF } from "./src/web/js/sgf.js";',
    'export { reportFits, buildReport } from "./src/web/js/app/report-model.js";',
  ]);
  const { Report, Engine, Lib, P, Practice, PlanCtl, Store, Review, I, Game, BLACK, state, loadSGF, reportFits } = A;

  const requests = [];
  const cancels = [];
  const pending = new Map();
  let delay = 15;
  const info = (size, visits) =>
    `info move A1 visits ${visits} winrate 0.5 scoreLead 0.5 order 0 pv A1 ownership ` + Array(size * size).fill("0").join(" ");
  const host = {
    on: () => () => {},
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true };
      if (command === "studio.katagoCancel") {
        cancels.push(payload.id || null);
        for (const [id, done] of pending) if (!payload.id || payload.id === id) done({ ok: false, id, cancelled: true });
        return { ok: true };
      }
      if (command === "studio.katagoAnalyzeAsync") {
        requests.push({ id: payload.id, visits: payload.visits, moves: payload.moves || "", at: Date.now() });
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            pending.delete(payload.id);
            resolve({ ok: true, id: payload.id, play: "pass", info: info(payload.size, payload.visits) });
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
  const savedHost = globalThis.zero;
  globalThis.zero = host;
  A.setLang("en");
  state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", teaching: false, showEval: false, onboarded: true, confirmMove: false, experience: "player" };
  state.progress = P.loadProgress();
  state.engine = { kind: "katago", name: "KataGo test", available: true };

  function fill(game, n) {
    let k = 0;
    for (let y = 1; y < game.size - 1 && k < n; y += 2) {
      for (let x = 1; x < game.size - 1 && k < n; x++) if (game.play(x, y).ok) k++;
    }
  }
  function twoPlayerRecord(moves = 12, name = "") {
    const game = new Game({ size: 9, komi: 6.5 });
    fill(game, moves);
    game.setResult("B+R");
    return Lib.saveGame(game, { opponent: "human", name, source: "game" });
  }

  try {
    await test("v8 fix: the computer's move starts at once even in the middle of a background report, and the report still completes", async () => {
      delay = 120;
      const rec = twoPlayerRecord(14);
      const job = Report.queueReport(rec.id);
      await until(() => job.progress > 0.2, 8000, "report progress");
      await sleep(20); // in the middle of a search
      const game = new Game({ size: 9 });
      fill(game, 6);
      const before = requests.length;
      const t0 = Date.now();
      const decided = Engine.decide(game, "30k");
      await until(() => requests.length > before && requests.slice(before).some((r) => r.visits !== 40 && r.visits !== 80), 3000, "the computer's search");
      const mine = requests.slice(before).find((r) => r.visits !== 40 && r.visits !== 80);
      assert.ok(mine.at - t0 < 40, `the computer's search waited ${mine.at - t0} ms (a background search takes ${delay})`);
      assert.ok(cancels.length >= 1, "the running background search was cancelled on the host");
      const r = await decided;
      assert.ok(r.move, "the computer moved");
      await job.promise;
      const stored = Lib.getGame(rec.id).report;
      assert.ok(stored, "the report completed");
      assert.ok(reportFits(stored, loadSGF(rec.sgf).game), "and fits its game");
      assert.equal(stored.moves, 14);
      delay = 15;
    });

    /* ------------------------------------- A4: stale reports, once at idle */

    await test("v8 fix: reports stored before v7 for games edited later are dropped once, at idle", async () => {
      await until(() => Engine.sched.listJobs({ all: true }).length === 0, 8000, "idle");
      for (const r of Lib.listGames()) Lib.deleteGame(r.id);
      P.removeKey(Report.REPORTS_CHECKED_KEY);
      const a = twoPlayerRecord(12, "fits");
      const b = twoPlayerRecord(12, "edited");
      await Report.queueReport(a.id).promise;
      await Report.queueReport(b.id).promise;
      const reportB = Lib.getGame(b.id).report;
      assert.ok(Lib.getGame(a.id).report && reportB);
      // b is edited the way pre-v7 builds saved it: new moves, old report kept.
      const other = new Game({ size: 9, komi: 6.5 });
      other.play(4, 4);
      fill(other, 11);
      other.setResult("B+R");
      Lib.saveGame(other, { id: b.id, opponent: "human", source: "game" });
      assert.deepEqual(Lib.getGame(b.id).report, reportB, "the old report is still there");
      assert.equal(Report.wantsReport(Lib.getGame(b.id)), false, "so Analyse all skips it");
      // The check does not block: it waits for idle between chunks.
      let gate;
      const waits = [];
      const wait = () => new Promise((r) => waits.push(r));
      const p = Report.dropStaleReports({ chunk: 1, wait });
      assert.equal(waits.length, 1, "it waits for idle before the first game");
      assert.ok(Lib.getGame(b.id).report, "nothing done synchronously");
      while (waits.length) {
        gate = waits.shift();
        gate();
        await sleep(1);
      }
      assert.equal(await p, 1);
      assert.ok(Lib.getGame(a.id).report, "a fitting report is kept");
      assert.equal(Lib.getGame(b.id).report ?? null, null, "the stale one is dropped");
      assert.equal(Report.wantsReport(Lib.getGame(b.id)), true, "Analyse all makes it again");
      // Once: the next launch does not check again.
      Lib.patchGame(b.id, { report: reportB });
      assert.equal(await Report.dropStaleReports({ wait: () => Promise.resolve() }), 0);
      assert.ok(Lib.getGame(b.id).report);
      for (const r of Lib.listGames()) Lib.deleteGame(r.id);
    });

    /* --------------------------- A3: imported problems in the Daily five */

    const dir = path.join(root, "tests/fixtures/problems");
    const files = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".sgf"))
      .sort()
      .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));
    const rows = I.readProblemFiles(files).map((e) => I.analyseEntry(e));
    const col = I.buildCollection(rows, { name: "Mine", id: "cdaily" });
    Store.addCollection(col);

    await test("v8 fix: due reviews of imported problems take part in the Daily five; new ones stay in their collection", () => {
      const now = Date.now();
      state.progress = { ...P.loadProgress(), games: [], mistakes: [], problems: {}, daily: null };
      // Nothing tried: no imported problem in today's five.
      const fresh = Practice.buildDaily(now);
      assert.equal(fresh.length, 5);
      assert.ok(fresh.every((i) => !i.id.startsWith("u-")), "new imported problems are not offered");
      // One imported problem missed two days ago, now due; another tried and not due.
      const [u1, u2] = col.problems;
      state.progress.problems[u1.id] = { solved: false, attempts: 1, streak: 0, due: now - DAY, last: now - 2 * DAY };
      state.progress.problems[u2.id] = { solved: true, attempts: 1, streak: 1, due: now + 3 * DAY, last: now - DAY };
      const due = Practice.buildDaily(now);
      assert.ok(due.some((i) => i.id === u1.id), "the due imported problem is a review");
      assert.ok(!due.some((i) => i.id === u2.id), "one not yet due is not");
      assert.equal(due.length, 5);
      // With a focus (the plan chooses): it takes a review slot.
      state.progress.games = [0, 1, 2, 3].map((i) => ({ id: "g" + i, at: now - (i + 8) * DAY, size: 19, color: 1, won: false, moves: 200, confidence: "high", phases: { opening: { loss: 2 }, middle: { loss: 6 }, endgame: { loss: 2 } }, themes: { cut: 1 }, themeLoss: { cut: 5 } }));
      const planned = Practice.buildDaily(now);
      const item = planned.find((i) => i.id === u1.id);
      assert.ok(item, "the plan keeps the imported review");
      assert.equal(item.role, "review");
      assert.ok(!planned.some((i) => i.id === u2.id));
      // A set saved with it stays whole when read back today.
      state.progress.daily = { date: P.todayKey(), items: planned, index: 0, done: [] };
      assert.equal(Practice.todaysDaily().items.length, 5, "an imported problem is not dropped as unknown");
      Practice.startDaily();
      if (planned[0].id === u1.id) assert.equal(state.practice.problem.def.id, u1.id);
      state.progress.daily = { date: P.todayKey(), items: [{ kind: "p", id: u1.id }], index: 0, done: [] };
      Practice.startDaily();
      assert.equal(state.practice.view, "problem");
      assert.equal(state.practice.problem.def.id, u1.id, "the imported problem opens from the Daily five");
      state.progress.games = [];
    });

    /* ------------------------ A2: classic-game drills and the weak themes */

    await test("v8 fix: drills from reviewed classic games do not count toward the weak themes", () => {
      const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime();
      const drill = (i, extra = {}) => ({ id: "d" + i, gameKey: "g" + i, theme: "ladder", attempts: 1, streak: 0, due: NOW - DAY, added: NOW - 3 * DAY, ...extra });
      const own = [0, 1, 2, 3, 4].map((i) => drill(i));
      const base = { lessons: {}, problems: {}, games: [], weakness: {}, daily: null };
      const m1 = Plan.playerModel({ ...base, mistakes: own }, { problems: PROBLEMS, grades: GRADES, now: NOW });
      assert.equal(m1.focus[0]?.key, "ladder", "the player's own drills make a claim");
      // The same drills from a classic game: marked (new) or known by their key (older).
      const marked = own.map((m) => ({ ...m, own: false }));
      const m2 = Plan.playerModel({ ...base, mistakes: marked }, { problems: PROBLEMS, grades: GRADES, now: NOW });
      assert.equal(m2.focus.length, 0);
      assert.equal(m2.areas.find((a) => a.key === "ladder"), undefined);
      const legacy = own.map((m, i) => ({ ...m, gameKey: "ear-reddening", id: "ear-reddening-" + (100 + i) }));
      const foreign = new Set(["ear-reddening"]);
      const m3 = Plan.playerModel({ ...base, mistakes: legacy }, { problems: PROBLEMS, grades: GRADES, now: NOW, foreign });
      assert.equal(m3.focus.length, 0, "older classic drills are known by their game key");
      assert.equal(Plan.weeklyModel({ ...base, mistakes: legacy }, { problems: PROBLEMS, grades: GRADES, now: NOW, foreign, weekStart: NOW - DAY }).focus.length, 0);
      assert.equal(Plan.ownDrill({ gameKey: "abc" }, foreign), true);

      // In the app: the classic and opening ids are the foreign keys.
      const now = Date.now();
      state.progress = { ...P.loadProgress(), games: [], problems: {}, planWeek: null, mistakes: legacy.map((m) => ({ ...m, due: now - DAY, added: now - 3 * DAY, last: now - 2 * DAY })) };
      assert.notEqual(PlanCtl.trainingFocus(now).status, "focus");
      state.progress.mistakes = own.map((m) => ({ ...m, due: now - DAY, added: now - 3 * DAY }));
      assert.equal(PlanCtl.trainingFocus(now).items[0]?.key, "ladder");
      state.progress.planWeek = null;
    });

    await test("v8 fix: practising a mistake from a classic game's review marks the drill as not the player's own", () => {
      state.progress = { ...P.loadProgress(), mistakes: [] };
      const game = new Game({ size: 9 });
      fill(game, 10);
      Review.openReview(game, { source: "classic", classicId: "ear-reddening", startAt: 0 });
      const km = { index: 5, move: { color: BLACK, x: 1, y: 1 }, best: { x: 4, y: 4 }, accept: [{ x: 4, y: 4 }], loss: 5, theme: "ladder" };
      Review.practiceThis(km);
      assert.equal(state.progress.mistakes[0].own, false);
      state.review = null;
      Review.openReview(game, { source: "record", recordId: "r1", startAt: 0 });
      Review.practiceThis({ ...km, index: 6 });
      assert.equal(state.progress.mistakes[0].own, undefined, "a drill from the player's game is their own");
      state.review = null;
    });

    /* ------------------------------------------------- bugs found in v8 */

    await test("v8 fix: a move tried in 'Review so far' never becomes a move of the game in play", async () => {
      const { Play } = A;
      Play.newGame({ size: 9, opponent: "human" });
      const g = state.game;
      for (const [x, y] of [[2, 2], [6, 6], [2, 6]]) g.game.play(x, y);
      Play.persistCurrent();
      const last = g.game.current;
      Play.reviewCurrentGame();
      assert.equal(state.review.source, "current");
      Review.reviewPlay(4, 4); // from the last position: White "plays" E5 in the review
      Review.reviewPlay(5, 5);
      assert.equal(state.review.game.moveNumber, 5);
      Review.setComment("what if", last); // an edit saves the game in play
      Review.dropReview();
      assert.equal(g.game.moveNumber, 3, "the game is where it was");
      assert.equal(g.game.turn, -1, "and it is still White's turn");
      assert.equal(g.game.mainLine().length, 4);
      assert.deepEqual(g.game.current.children, []);
      assert.equal(g.game.current.comment, "what if", "the comment is kept");
      assert.equal(loadSGF(A.P.readJSON(A.P.KEYS.current, null).sgf).game.mainLine().length, 4, "the saved game has no extra moves");
      // A variation tried earlier in the game stays, as before.
      Play.reviewCurrentGame();
      Review.reviewGoto(1);
      Review.reviewPlay(7, 7);
      // Back, as the app does it (controller.js restore drops the review).
      A.setRestorer(() => state.review && Review.dropReview());
      Review.closeReview();
      A.setRestorer(() => {});
      assert.equal(g.game.moveNumber, 3);
      assert.equal(g.game.mainLine().length, 4);
      assert.equal(g.game.mainLine()[1].children.length, 2, "the variation at move 1 is kept");
    });

    await test("v8 fix: an SGF whose first move is in the root node keeps that move", () => {
      const { game } = loadSGF("(;GM[1]FF[4]SZ[9]C[root note]B[ee];W[cc];B[gg])");
      const line = game.mainLine();
      assert.equal(line.length, 4, "three moves");
      assert.deepEqual(line[1].move, { color: BLACK, x: 4, y: 4, pass: false });
      assert.equal(game.root.comment, "root note");
      assert.equal(game.root.extra, null, "the move is not kept as an unknown root property");
      const back = loadSGF(game.toSGF()).game.mainLine();
      assert.deepEqual(back.map((n) => n.move && `${n.move.x},${n.move.y}`), [null, "4,4", "2,2", "6,6"]);
      // With variations after it.
      const v = loadSGF("(;SZ[9]W[ee](;B[cc])(;B[gg]))").game;
      assert.equal(v.mainLine()[1].move.color, -1);
      assert.equal(v.mainLine()[1].children.length, 2);
    });

    await test("v8 fix: a Daily five naming a drill that is no longer kept skips it instead of stopping", () => {
      const now = Date.now();
      state.progress = { ...P.loadProgress(), games: [], problems: {}, mistakes: [], daily: null };
      const ids = PROBLEMS.slice(0, 4).map((p) => p.id);
      state.progress.daily = { date: P.todayKey(), items: [{ kind: "m", id: "gone-12" }, ...ids.map((id) => ({ kind: "p", id }))], index: 0, done: [] };
      state.practice = { ...state.practice, view: "home" };
      Practice.startDaily();
      assert.equal(state.practice.view, "problem", "the set opens on the next item");
      assert.equal(state.practice.problem.def.id, ids[0]);
      assert.equal(state.progress.daily.items.length, 4);
      assert.ok(now > 0);
    });

    await test("v8 fix: Library's won and lost filters leave draws out", () => {
      const g = (result, humanColor = BLACK) => ({ id: result + humanColor, result, opponent: "ai", source: "game", humanColor });
      const all = [g("B+3.5"), g("W+R"), g("Draw"), g("Draw", -1), g("0"), g("Void"), g("W+T", -1)];
      assert.deepEqual(Lib.filterGames(all, { kind: "won" }).map((x) => x.id), ["B+3.51", "W+T-1"]);
      assert.deepEqual(Lib.filterGames(all, { kind: "lost" }).map((x) => x.id), ["W+R1"]);
    });
  } finally {
    globalThis.zero = savedHost;
  }

  await test("v8 fix: a broken streak shows as none, not the old count", () => {
    const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
    const p = { streak: { count: 12, last: "2026-10-20" } };
    assert.equal(persist.currentStreak(p, at(2026, 10, 20)), 12, "today");
    assert.equal(persist.currentStreak(p, at(2026, 10, 21, 23)), 12, "yesterday: still alive");
    assert.equal(persist.currentStreak(p, at(2026, 10, 22, 0)), 0, "two days later: broken");
    assert.equal(persist.currentStreak({ streak: { count: 0, last: null } }, at(2026, 10, 22)), 0);
    assert.equal(persist.currentStreak({}, at(2026, 10, 22)), 0);
    // In the app (Today and the Daily five's last page read it from here).
    state.progress = { ...P.loadProgress(), streak: { count: 5, last: P.todayKey(new Date(Date.now() - 3 * DAY)) } };
    assert.equal(Practice.streakNow(), 0);
    state.progress.streak.last = P.todayKey();
    assert.equal(Practice.streakNow(), 5);
  });

  await test("v8 fix: the streak carries over the night after a 23-hour day (daylight saving)", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      // 8 March 2026 has 23 hours there; 00:30 on the 9th minus 24 h is the 7th.
      const now = new Date(2026, 2, 9, 0, 30, 0).getTime();
      assert.equal(persist.todayKey(new Date(now - DAY)), "2026-03-07", "the clock really jumps");
      const p = { streak: { count: 4, last: "2026-03-08" }, problems: {}, lessons: {} };
      persist.touchStreak(p, now);
      assert.deepEqual(p.streak, { count: 5, last: "2026-03-09" });
      assert.equal(persist.currentStreak({ streak: { count: 4, last: "2026-03-08" } }, now), 4);
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
}
