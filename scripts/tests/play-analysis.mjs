/**
 * Play: one analysis per game, with a fake KataGo host (the app's
 * controllers bundled together, as in the app). A game that ends turns
 * into its review in place; the review's analysis is the game's, stored
 * once in its file; trying a key moment again is judged by KataGo and kept
 * in the player model like a drill; a game opened from the history opens
 * in the same review; a new game's computer move never waits for the last
 * game's analysis, which carries on in the background; the quiet pass over
 * older games is cancellable and resumable; the offline preview estimates.
 * Loaded by scripts/test.mjs; receives the runner's helpers.
 */
import fs from "node:fs";
import { register, TEARDOWN_EXPORTS } from "./helpers.mjs";
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
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: [
        'export * as C from "./src/web/js/app/controller.js";',
        'export * as Analysis from "./src/web/js/play/analysis.js";',
        'export * as Image from "./src/web/js/play/review-image.js";',
        'export * as Engine from "./src/web/js/engine.js";',
        'export * as Lib from "./src/web/js/data/games.js";',
        'export * as P from "./src/web/js/data/settings.js";',
        'export * as PM from "./src/web/js/model/player.js";',
        'export { store } from "./src/web/js/data/store.js";',
        'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
        'export { setLang } from "./src/web/js/i18n.js";',
        'export { state } from "./src/web/js/app/store.js";',
        'export { setRestorer } from "./src/web/js/app/ctl-core.js";',
        'export { loadSGF } from "./src/web/js/sgf.js";',
        'export { reviewFits, tryMoments } from "./src/web/js/play/review-model.js";',
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
  const { C, Analysis, Image, Engine, Lib, P, PM, Game, BLACK, WHITE, state, store, loadSGF, reviewFits, tryMoments } = A;
  // The store picks its backend on first use: the preview's, before the fake host below.
  await store.open();

  // A fake async KataGo host: every search takes `delay` ms; the log keeps
  // each request (visits tell who asked: the computer at 30 kyu uses 8, the
  // whole-game pass 40 on 19×19 and 80 on 9×9, a judgement 160 / 240).
  const requests = [];
  const pending = new Map();
  let delay = 15;
  // Black's 11th and 21st moves of a 19×19 game each lose 6 points (so a
  // finished game has two key mistakes); KataGo's best move is always A1
  // (empty), and the second candidate B1 is 1 point worse.
  const info = (size, visits, moves = "") => {
    const n = size * size;
    const k = moves.trim() ? moves.trim().split(/\s+/).length / 2 : 0;
    const lead = size === 19 ? 0.5 - (k >= 11 ? 6 : 0) - (k >= 21 ? 6 : 0) : 0.5;
    const wr = 1 / (1 + Math.exp(-lead / 8));
    // Black to move: B1 is a point worse for Black; White to move: for White.
    const b1 = k % 2 === 0 ? lead - 1 : lead + 1;
    const wr1 = 1 / (1 + Math.exp(-b1 / 8));
    const own = "ownership " + Array(n).fill("0").join(" ");
    return `info move A1 visits ${visits} winrate ${wr} scoreLead ${lead} order 0 pv A1 info move B1 visits ${Math.max(1, visits >> 2)} winrate ${wr1} scoreLead ${b1} order 1 pv B1 ${own}`;
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
        requests.push({ id: payload.id, visits: payload.visits, moves: payload.moves || "", at: Date.now() });
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
      // A store that an earlier file left unopened writes to whatever host is there: nothing.
      if (command === "studio.storeWrite" || command === "studio.storeRemove") return { ok: true };
      if (command === "studio.storeList") return [];
      if (command === "studio.storeRead") return null;
      throw new Error("unexpected command " + command);
    },
  };
  A.setLang("en");
  for (const rec of Lib.listGames()) Lib.deleteGame(rec.id);
  state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", teaching: false, showEval: false, onboarded: true, confirmMove: false, liveAnalysis: false };
  state.profile = PM.newProfile();
  state.engine = { kind: "katago", name: "KataGo test", available: true };
  // Back/forward as the app does it (controller.js restore drops the review).
  A.setRestorer((loc) => {
    if (state.review) C.dropReview();
    state.space = loc.space;
    state.play = { ...state.play, ...loc.play };
  });
  const idle = (ms = 8000) => until(() => Engine.sched.listJobs({ all: true }).length === 0, ms, "idle");

  /** Play `n` alternating moves straight onto the game (no controller). */
  function fill(game, n) {
    let k = 0;
    for (let y = 2; y < game.size - 2 && k < n; y += 2) {
      for (let x = 2; x < game.size - 2 && k < n; x++) {
        if (game.play(x, y).ok) k++;
      }
    }
  }

  /** A rated game against the computer that the player resigns: its board turns into its review. */
  function finishRatedGame(moves = 40) {
    C.newGame({ size: 19, color: BLACK, opponentRank: 30 });
    const g = state.game;
    fill(g.game, moves);
    C.requestResign();
    state.sheet.onConfirm();
    state.sheet = null;
    return g;
  }

  /** A two-player record of `moves` moves. */
  function twoPlayerRecord(moves = 12, name = "", source = "game") {
    const game = new Game({ size: 9, komi: 6.5 });
    fill(game, moves);
    game.setResult("B+R");
    return Lib.saveGame(game, { opponent: "human", name, source });
  }

  try {
    await test("play analysis: a game that ends becomes its review in place; the analysis is stored once in its file", async () => {
      const g = finishRatedGame(40);
      const r = state.review;
      assert.ok(r, "the review opened by itself");
      assert.equal(r.source, "current");
      assert.equal(r.game, g.game, "on the same board");
      assert.equal(r.meta.inPlace, true, "no history step");
      assert.equal(state.play.view, "game");
      assert.equal(C.recordIdOf(r), g.recordId);
      assert.ok(r.analyzing, "its analysis is the review's pass");
      await until(() => !r.analyzing && !r.refining, 15000, "the analysis");
      const rec = Lib.getGame(g.recordId);
      assert.ok(Array.isArray(rec.analysis) && rec.analysis.length === 41, "the analysis, in the game's file");
      assert.ok(reviewFits(rec.report, loadSGF(rec.sgf).game), "and the review made from it");
      assert.equal(rec.report.confidence, "high");
      assert.deepEqual(rec.report.moments.map((m) => m.index), [11, 21], "Black's two costly moves");
      assert.deepEqual(r.model.moments.map((m) => m.index), rec.report.moments.map((m) => m.index), "one model: on screen and stored");
      assert.equal(r.model.phases.length > 0, true, "the three phases (KataGo)");
      assert.ok(rec.rating?.before && rec.rating?.after, "the rating change stored");
      assert.match(Image.ratingChangeText(C.reviewRating()), /^Strength ≈ \d+ kyu/);
      // The game taught the player model once: its phases, its two costliest mistakes as drills.
      assert.equal(rec.learned, true);
      const trend = state.profile.games.find((x) => x.id === g.recordId);
      assert.ok(trend.phases && trend.confidence === "high");
      assert.deepEqual(state.profile.mistakes.filter((m) => m.gameId === g.recordId).map((m) => m.index).sort((a, b) => a - b), [11, 21]);
      // The review jumped to its first key moment once the analysis was there.
      assert.equal(r.game.current.id, r.game.mainLine()[11].id);
      // Esc leaves it for Play's home; Back returns to it.
      C.closeReview();
      assert.equal(state.review, null);
      assert.equal(state.play.view, "home");
      // The board of a finished game is its review again.
      C.playBoard();
      assert.ok(state.review && state.review.source === "current");
      assert.equal(state.review.analyzing, false, "the analysis is there at once");
      C.dropReview();
      await idle();
    });

    await test("play analysis: a game finished after an undo is kept in the player's games but does not move the rating", async () => {
      state.profile = PM.newProfile();
      const rating = JSON.stringify(state.profile.rating);
      C.newGame({ size: 19, color: BLACK, opponentRank: 30 });
      const g = state.game;
      fill(g.game, 20);
      C.undo();
      assert.equal(g.undos, 1);
      fill(g.game, 30);
      C.requestResign();
      state.sheet.onConfirm();
      state.sheet = null;
      const rec = state.profile.games.find((x) => x.id === g.recordId);
      assert.ok(rec, "the game is in the player's list");
      assert.equal(rec.assisted, true);
      assert.equal(rec.undos, 1);
      assert.equal(rec.rated, false);
      assert.equal(rec.rating, null);
      assert.equal(JSON.stringify(state.profile.rating), rating, "the estimate did not move");
      assert.deepEqual(state.profile.history, []);
      assert.ok(!g.ratingChange, "no rating change to show");
      C.dropReview();
      await idle();
    });

    await test("play analysis: try again from the position — KataGo judges, a miss shows its better move, each try is a drill", async () => {
      state.profile = PM.newProfile();
      const g = finishRatedGame(40);
      const r = state.review;
      await until(() => !r.analyzing && !r.refining, 15000, "the analysis");
      const moments = tryMoments(r.model);
      assert.deepEqual(moments.map((m) => m.index), [11, 21]);
      assert.ok(C.canTry(11) && C.canTry(21) && !C.canTry(5), "the key moments of your own game, with KataGo");
      const drills = () => state.profile.mistakes.filter((m) => m.gameId === g.recordId);
      // The board goes to the position before the mistake.
      C.tryAgain(11);
      const tr = r.trial;
      assert.ok(tr && tr.status === "open");
      assert.equal(r.game.current.id, r.game.mainLine()[10].id);
      const moves = r.game.mainLine().length;
      // A move KataGo searched and found 1 point worse: one it accepts (within 1.5), good.
      await C.tryMove(1, 18); // B1 on 19×19
      assert.equal(tr.status, "good", `verdict ${tr.status} ${tr.loss}`);
      assert.equal(tr.loss, 0);
      assert.deepEqual(tr.accept.map((p) => [p.x, p.y]).sort(), [[0, 18], [1, 18]]);
      let d = drills().find((m) => m.index === 11);
      assert.deepEqual([d.tries, d.streak, d.solved], [1, 1, true], "the try is in the player model");
      assert.ok(d.due > Date.now(), "and comes back later on the ladder");
      // Again, with a move KataGo did not search: it looks at the position
      // after it (in the fake, every move there loses 6 points).
      C.tryRetry();
      assert.equal(tr.status, "open");
      const seen = requests.length;
      await C.tryMove(9, 9);
      assert.ok(requests.slice(seen).some((q) => q.visits === 160), "a search of the position after the try");
      assert.equal(tr.status, "bad");
      assert.equal(tr.loss, 6);
      assert.deepEqual(tr.best, { x: 0, y: 18 }, "KataGo's better move (A1) is shown");
      d = drills().find((m) => m.index === 11);
      assert.deepEqual([d.tries, d.streak], [2, 0], "a miss starts the ladder again");
      assert.ok(PM.due(state.profile, Date.now() + PM.DAY + 1000).mistakes.some((m) => m.id === d.id), "a missed moment comes back in Learn tomorrow");
      assert.equal(r.game.mainLine().length, moves, "a try never becomes a move of the game");
      assert.equal(r.game.current.children.length, 1, "nor a variation");
      // Move on: the next moment.
      C.tryNext();
      assert.equal(r.trial.index, 21);
      assert.equal(r.game.current.id, r.game.mainLine()[20].id);
      await C.tryMove(15, 15);
      assert.equal(r.trial.status, "bad");
      // Done: back to the review at the moment as played.
      C.tryNext();
      assert.equal(r.trial, null);
      assert.equal(r.game.current.id, r.game.mainLine()[21].id);
      // Esc while trying leaves the try, not the review.
      C.tryAgain(21);
      C.closeTrial();
      assert.ok(state.review && !state.review.trial);
      C.dropReview();
      await idle();
    });

    await test("play analysis: no try again for a classic, an imported game, the offline estimate, or without KataGo", async () => {
      const game = new Game({ size: 19 });
      fill(game, 40);
      game.setResult("W+R");
      C.openReview(game, { source: "classic", classicId: "ear-reddening", startAt: 0 });
      await until(() => !state.review.analyzing && !state.review.refining, 15000, "classic analysis");
      assert.equal(state.review.model.confidence, "high");
      assert.equal(C.ownGame(), false);
      assert.deepEqual(C.triable(), [], "a classic");
      C.dropReview();
      const imp = Lib.saveGame(game, { name: "imported", source: "import" });
      C.openRecord(imp.id);
      await until(() => !state.review.analyzing && !state.review.refining, 15000, "import analysis");
      assert.deepEqual(C.triable(), [], "an imported record");
      C.dropReview();
      // Offline: the estimate, turning points only, nothing to try.
      const saved = globalThis.zero;
      delete globalThis.zero;
      state.engine = { kind: "offline", name: "", available: false };
      try {
        const own = Lib.saveGame(game, { name: "own", opponent: "ai", humanColor: BLACK, source: "game" });
        C.openRecord(own.id);
        await until(() => !state.review.analyzing, 15000, "estimate");
        const m = state.review.model;
        assert.equal(m.confidence, "low");
        assert.equal(m.phases, null, "no phase numbers");
        assert.ok(m.moments.every((mo) => mo.best === null && mo.loss === null), "no better move, no loss");
        assert.deepEqual(C.triable(), []);
        assert.equal(C.canTry(m.moments[0]?.index ?? 21), false);
        C.dropReview();
      } finally {
        globalThis.zero = saved;
        state.engine = { kind: "katago", name: "KataGo test", available: true };
      }
      await idle();
    });

    await test("play analysis: a game from the history opens in the same review, its stored analysis at once", async () => {
      await idle();
      const g = finishRatedGame(40);
      await until(() => !state.review.analyzing && !state.review.refining, 15000, "the analysis");
      C.dropReview();
      C.playHome();
      const seen = requests.length;
      C.openRecord(g.recordId);
      const r = state.review;
      assert.equal(r.source, "record");
      assert.equal(r.analyzing, false, "no new analysis");
      assert.equal(requests.length, seen, "no search at all");
      assert.equal(r.model.confidence, "high");
      assert.deepEqual(r.model.moments, Lib.getGame(g.recordId).report.moments);
      assert.ok(C.canTry(r.model.moments[0].index), "and its moments can be tried again");
      assert.equal(r.game.current.id, r.game.mainLine()[r.model.moments[0].index].id, "open on the first key moment");
      C.dropReview();
      await idle();
    });

    await test("play analysis: a stored analysis is used only for its own moves; only a finished game teaches the player model", async () => {
      await idle();
      const g = finishRatedGame(40);
      await until(() => !state.review.analyzing && !state.review.refining, 15000, "the analysis");
      C.dropReview();
      const rec = Lib.getGame(g.recordId);
      const game = loadSGF(rec.sgf).game;
      assert.ok(Analysis.storedAnalysis(rec, game), "its own moves: used");
      // The same number of moves, the last one elsewhere, saved over the same file.
      const line = game.mainLine();
      const moves = [...rec.sgf.matchAll(/;([BW])\[([a-i]{2})\]/g)];
      const lastMove = moves[moves.length - 1];
      const unused = ["aa", "ia", "ai", "ii", "ba", "ab"].find((c) => !rec.sgf.includes(`[${c}]`));
      const sgf = rec.sgf.slice(0, lastMove.index) + `;${lastMove[1]}[${unused}]` + rec.sgf.slice(lastMove.index + lastMove[0].length);
      const other = loadSGF(sgf).game;
      assert.equal(other.mainLine().length, line.length);
      Lib.saveGame(other, { id: g.recordId, keepPlace: true });
      const again = Lib.getGame(g.recordId);
      assert.equal(again.analysis.length, line.length, "the old analysis is still in the file");
      assert.equal(Analysis.storedAnalysis(again, other), null, "but not taken for the new moves");

      // "Review so far" of a game still in play: stored, but the game does not teach yet.
      const live = new Game({ size: 9, komi: 6.5 });
      fill(live, 20);
      const saved = Lib.saveGame(live, { opponent: "ai", humanColor: BLACK, rated: true });
      const points = live.mainLine().map((_, i) => ({ source: "katago", scoreLead: i % 2 ? 1 : -1, winrate: 0.5, visits: 50, moves: [] }));
      const mistakesBefore = state.profile.mistakes.length;
      assert.ok(Analysis.storeAnalysis(saved.id, live, points, { humanColor: BLACK }), "a review of the game so far");
      assert.notEqual(Lib.getGame(saved.id).learned, true, "not used up before the game ends");
      assert.equal(state.profile.mistakes.length, mistakesBefore);
      live.setResult("W+R");
      Lib.saveGame(live, { id: saved.id, keepPlace: true });
      assert.ok(Analysis.storeAnalysis(saved.id, live, points, { humanColor: BLACK }));
      assert.equal(Lib.getGame(saved.id).learned, true, "the finished game teaches it, once");
      await idle();
    });

    await test("play analysis: a new game's computer move does not wait for the last game's analysis, which goes on in the background", async () => {
      delay = 15;
      const g1 = finishRatedGame(40);
      assert.ok(g1.recordId, "saved");
      await until(() => requests.filter((r) => r.visits === 40).length >= 3, 4000, "the review's searches");
      // New game with the computer as Black: its first move comes next.
      const before = requests.length;
      C.newGame({ size: 19, color: WHITE, opponentRank: 30 });
      const g2 = state.game;
      assert.equal(state.review, null, "the new game left the review");
      await until(() => requests.slice(before).some((r) => r.visits === 8), 2000, "the computer's search");
      const first = requests.slice(before).findIndex((r) => r.visits === 8);
      assert.ok(first <= 1, `the computer's search waited behind ${first} searches`);
      await until(() => g2.game.moveNumber === 1, 3000, "the computer's move");
      // The old game's analysis carries on in the background ("games").
      const job = C.analysisJob(g1.recordId);
      assert.ok(job, "handed to the background");
      assert.equal(job.owner, "games");
      // A third game: even with that analysis running, the computer goes next.
      const mark = requests.length;
      C.newGame({ size: 19, color: WHITE, opponentRank: 30 });
      const g3 = state.game;
      await until(() => requests.slice(mark).some((r) => r.visits === 8), 2000, "the computer's search");
      assert.ok(requests.slice(mark).findIndex((r) => r.visits === 8) <= 1);
      assert.equal(job.signal.aborted, false, "a new game does not cancel it");
      await until(() => g3.game.moveNumber === 1, 3000, "the computer's move");
      await job.promise;
      const rec = Lib.getGame(g1.recordId);
      assert.ok(rec.report && rec.analysis, "stored in the background");
      assert.equal(rec.report.confidence, "high");
      assert.equal(rec.learned, true, "and the game taught the player model");
      // Only once: analysing it again adds nothing.
      const p = JSON.stringify(state.profile);
      Lib.patchGame(g1.recordId, { review: null });
      await C.queueAnalysis(g1.recordId).promise;
      assert.equal(JSON.stringify(state.profile), p, "nothing counted twice");
      await idle();
    });

    await test("play analysis: leaving the review of an imported game keeps its positions; an edited game is analysed again", async () => {
      await idle();
      delay = 25;
      const rec = twoPlayerRecord(14, "imp", "import");
      C.openRecord(rec.id);
      const r = state.review;
      await until(() => r.analyzed > 4, 3000, "progress");
      C.dropReview();
      assert.equal(C.analysisJob(rec.id), null, "an imported game is not analysed in the background");
      assert.equal(Lib.getGame(rec.id).report, null);
      // Opened again, it resumes from the positions it had.
      const seen = requests.length;
      C.openRecord(rec.id);
      await until(() => !state.review.analyzing, 5000, "the rest");
      const searched = requests.slice(seen).filter((q) => q.visits === 80).length;
      assert.ok(searched < 13, `kept the positions already analysed (${searched})`);
      assert.ok(Lib.getGame(rec.id).report, "stored");
      C.dropReview();
      // A stopped pass's positions are not reused after the moves were edited.
      const rec2 = twoPlayerRecord(14, "imp2", "import");
      C.openRecord(rec2.id);
      await until(() => state.review.analyzed > 4, 3000, "progress");
      C.dropReview();
      const other = new Game({ size: 9, komi: 6.5 });
      other.play(4, 4);
      fill(other, 13);
      other.setResult("B+R");
      Lib.saveGame(other, { id: rec2.id, source: "import" });
      const seen2 = requests.length;
      C.openRecord(rec2.id);
      await until(() => !state.review.analyzing, 5000, "all of it");
      const again = requests.slice(seen2).filter((q) => q.visits === 80).length;
      assert.ok(again >= 14, `every position analysed again (${again})`);
      assert.ok(reviewFits(Lib.getGame(rec2.id).report, other), "the review is of the edited moves");
      C.dropReview();
      delay = 15;
      await idle();
    });

    await test("play analysis: the quiet pass over older games stores each one, cancels, and resumes after quitting", async () => {
      await idle();
      for (const r of Lib.listGames()) Lib.deleteGame(r.id);
      const recs = [twoPlayerRecord(10, "a"), twoPlayerRecord(10, "b"), twoPlayerRecord(10, "c"), twoPlayerRecord(10, "d")];
      assert.equal(C.batchCandidates().length, 4);
      let job = C.analyseAll();
      assert.ok(Engine.sched.listJobs().some((j) => j.kind === "batch"));
      assert.equal(Engine.sched.listJobs().filter((j) => j.kind === "analysis").length, 0, "its games are not listed separately");
      await until(() => state.batch?.done >= 1, 5000, "first game");
      assert.ok(C.rowAnalysis(state.batch.ids[1])?.queued);
      C.cancelBatch();
      assert.equal(await job.promise, null);
      assert.equal(store.get(C.BATCH_KEY) ?? null, null);
      assert.equal(state.batch, null);
      const left = C.batchCandidates().length;
      assert.ok(left >= 1 && left <= 3);
      // Quitting keeps the rest; the next launch carries on.
      job = C.analyseAll();
      await until(() => Engine.sched.listJobs({ all: true }).some((j) => j.kind === "analysis"), 3000, "a game");
      Engine.sched.cancelAll("quit");
      await job.promise;
      assert.ok((store.get(C.BATCH_KEY) ?? null)?.ids?.length >= 1, "saved for the next launch");
      job = C.resumeBatch();
      assert.ok(job);
      await job.promise;
      assert.equal(C.batchCandidates().length, 0);
      for (const r of recs) {
        const rec = Lib.getGame(r.id);
        assert.ok(rec.report && rec.analysis?.length === 11, r.name);
      }
      assert.equal(store.get(C.BATCH_KEY) ?? null, null);
      assert.equal(Engine.sched.listJobs().length, 0);
    });

    await test("play analysis: the browser preview (no KataGo) still analyses, with the offline estimate", async () => {
      await idle();
      const saved = globalThis.zero;
      delete globalThis.zero;
      try {
        state.engine = { kind: "offline", name: "", available: false };
        const rec = twoPlayerRecord(12);
        const job = C.queueAnalysis(rec.id);
        await job.promise;
        assert.equal(Lib.getGame(rec.id).report.confidence, "low", "an estimate, made in the background");
        const game = new Game({ size: 9 });
        fill(game, 10);
        assert.equal(await Engine.analyzeNode(game, game.current, 40), null, "no KataGo: the caller uses the estimate");
      } finally {
        globalThis.zero = saved;
        state.engine = { kind: "katago", name: "KataGo test", available: true };
      }
    });

    await test("play analysis: no report page, no report state, no old serial chain left", () => {
      const src = (f) => fs.readFileSync(path.join(root, f), "utf8");
      for (const f of ["report.jsx", "report-ctl.js", "report-batch.js", "report-model.js", "report-status.jsx", "report-draw.js"]) assert.ok(!fs.existsSync(path.join(root, "src/web/js/app", f)), f);
      assert.equal("report" in state, false, "no state.report");
      for (const f of ["src/web/js/app/review-ctl.js", "src/web/js/app/play-ctl.js", "src/web/js/play/analysis.js"]) assert.doesNotMatch(src(f), /\.cancelled\b|summaryToken|state\.report/, f);
    });
  } finally {
    delete globalThis.zero;
  }
}
