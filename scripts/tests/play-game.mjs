/**
 * Play: the game in play with a fake KataGo host — the computer's move
 * never waits for a background analysis, "Review so far" never adds moves
 * to the game, a game saved during the count counts again, and two SGF
 * quirks of real records. Loaded by scripts/test.mjs; receives the
 * runner's helpers.
 */
import { register } from "./helpers.mjs";

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
  return register(await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")));
}

export default async function ({ test, assert, root }) {

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


  // The app with a fake async KataGo host (as in core-scheduler.mjs).
  const A = await bundle(root, [
    'export * as Play from "./src/web/js/app/play-ctl.js";',
    'export * as Analysis from "./src/web/js/play/analysis.js";',
    'export * as Engine from "./src/web/js/engine.js";',
    'export * as Lib from "./src/web/js/data/games.js";',
    'export * as P from "./src/web/js/data/settings.js";',
    'export * as PM from "./src/web/js/model/player.js";',
    'export { store } from "./src/web/js/data/store.js";',
    'export * as Practice from "./src/web/js/app/practice-ctl.js";',
    'export * as Review from "./src/web/js/app/review-ctl.js";',
    'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
    'export { setLang } from "./src/web/js/i18n.js";',
    'export { state } from "./src/web/js/app/store.js";',
    'export { setRestorer } from "./src/web/js/app/ctl-core.js";',
    'export { loadSGF } from "./src/web/js/sgf.js";',
    'export { reviewFits } from "./src/web/js/play/review-model.js";',
  ]);
  const { Analysis, Engine, Lib, P, PM, Review, Game, BLACK, state, loadSGF, reviewFits } = A;
  // The store picks its backend on first use: the preview's, before the fake host below.
  await A.store.open();

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
  state.profile = PM.newProfile();
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
    await test("play game: the computer's move starts at once even in the middle of a background analysis, and the analysis still completes", async () => {
      delay = 120;
      const rec = twoPlayerRecord(14);
      const job = Analysis.queueAnalysis(rec.id);
      await until(() => job.progress > 0.2, 8000, "analysis progress");
      await sleep(20); // in the middle of a search
      const game = new Game({ size: 9 });
      fill(game, 6);
      const before = requests.length;
      const t0 = Date.now();
      const decided = Engine.decide(game, 30);
      await until(() => requests.length > before && requests.slice(before).some((r) => r.visits !== 40 && r.visits !== 80), 3000, "the computer's search");
      const mine = requests.slice(before).find((r) => r.visits !== 40 && r.visits !== 80);
      assert.ok(mine.at - t0 < 40, `the computer's search waited ${mine.at - t0} ms (a background search takes ${delay})`);
      assert.ok(cancels.length >= 1, "the running background search was cancelled on the host");
      const r = await decided;
      assert.ok(r.move, "the computer moved");
      await job.promise;
      const stored = Lib.getGame(rec.id).report;
      assert.ok(stored, "the review completed");
      assert.ok(reviewFits(stored, loadSGF(rec.sgf).game), "and fits its game");
      assert.equal(stored.moves, 14);
      assert.equal(Lib.getGame(rec.id).analysis.length, 15, "with its analysis, once");
      delay = 15;
    });





    await test("play game: a move tried in 'Review so far' never becomes a move of the game in play", async () => {
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
      Review.saveEdits(); // (0.4 s later, while the review is still open)
      const kept = loadSGF(A.Lib.loadCurrent().sgf).game;
      assert.equal(kept.mainLine().length, 4, "saved while reviewing: without the moves tried");
      assert.equal(kept.mainLine()[3].comment, "what if");
      assert.equal(state.review.game.moveNumber, 5, "which are still on screen");
      Review.setComment("what if?", last);
      Review.dropReview();
      assert.equal(g.game.moveNumber, 3, "the game is where it was");
      assert.equal(g.game.turn, -1, "and it is still White's turn");
      assert.equal(g.game.mainLine().length, 4);
      assert.deepEqual(g.game.current.children, []);
      assert.equal(g.game.current.comment, "what if?", "the comment is kept");
      assert.equal(loadSGF(A.Lib.loadCurrent().sgf).game.mainLine().length, 4, "the saved game has no extra moves");
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

    await test("play game: a game saved during the count opens counting again, not stuck without controls", async () => {
      const { Play } = A;
      Play.newGame({ size: 9, opponent: "human" });
      const g = state.game;
      for (const [x, y] of [[2, 2], [6, 6], [2, 6], [6, 2]]) g.game.play(x, y);
      g.game.pass();
      g.game.pass();
      assert.equal(g.game.phase, "scoring");
      Play.persistCurrent();
      // The app quits before the count is confirmed; the next launch restores the game.
      state.game = null;
      Play.restoreCurrent();
      const r = state.game;
      assert.equal(r.game.phase, "scoring");
      assert.ok(r.scoring, "the count is on screen again");
      await until(() => r.scoring?.source !== "pending", 3000, "dead stones");
      Play.confirmScore();
      assert.ok(r.game.current.result, "and it can be confirmed");
      // A finished game is restored as it was.
      Play.persistCurrent();
      Play.restoreCurrent();
      assert.equal(state.game.scoring, null);
      await until(() => Engine.sched.listJobs({ all: true }).length === 0, 5000, "idle");
    });

    await test("play game: an SGF whose first move is in the root node keeps that move", () => {
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

    await test("play game: a handicap game's SGF without KM gets a handicap game's komi, not 6.5", () => {
      assert.equal(loadSGF("(;GM[1]SZ[19]HA[2]AB[pd][dp];W[qp])").game.komi, 0.5);
      assert.equal(loadSGF("(;GM[1]SZ[19]RU[Chinese]AB[pd][dp][pp];W[qp])").game.komi, 0.5);
      assert.equal(loadSGF("(;GM[1]SZ[19]HA[2]KM[5.5]AB[pd][dp];W[qp])").game.komi, 5.5, "a stated komi stays");
      assert.equal(loadSGF("(;GM[1]SZ[9];B[ee])").game.komi, 6.5, "an even game as before");
      assert.equal(loadSGF("(;GM[1]SZ[9]RU[Chinese];B[ee])").game.komi, 7.5);
    });


  } finally {
    globalThis.zero = savedHost;
  }



}
