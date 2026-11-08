/**
 * Play, v13: late answers never land on a position that is gone, and the
 * game is never stuck on the computer's turn.
 *
 * With a fake KataGo host whose answers the checks release by hand (and
 * which can ignore cancels, as a busy host may): a hint that arrives after
 * an undo is dropped; the first count's dead stones do not overwrite a
 * second count after Resume; the engine's searches are for the position
 * they were asked for, not the one on the board when they run; a computer
 * move the engine cannot give comes from the offline engine, and when that
 * fails too the game offers Retry; opening another review closes the one
 * before (the live game is back on its last move, no accidental branch);
 * and Play's home is shown when no game is in progress.
 */
import { register, TEARDOWN_EXPORTS } from "./helpers.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, what = "condition") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(3);
  }
}

async function bundle(root, lines) {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: { contents: [...lines, ...TEARDOWN_EXPORTS].join("\n"), resolveDir: root, loader: "js" },
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    loader: { ".json": "json" },
    write: false,
    logLevel: "error",
  });
  return register(await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")));
}

export default async function ({ test, assert, root }) {
  const A = await bundle(root, [
    'export * as Play from "./src/web/js/app/play-ctl.js";',
    'export * as Review from "./src/web/js/app/review-ctl.js";',
    'export * as Engine from "./src/web/js/engine.js";',
    'export * as Lib from "./src/web/js/data/games.js";',
    'export * as P from "./src/web/js/data/settings.js";',
    'export * as PM from "./src/web/js/model/player.js";',
    'export { store } from "./src/web/js/data/store.js";',
    'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
    'export { setLang, t } from "./src/web/js/i18n.js";',
    'export { state } from "./src/web/js/app/store.js";',
  ]);
  const { Play, Review, Engine, Lib, P, PM, Game, BLACK, WHITE, state, t } = A;
  await A.store.open();

  /* The fake host: each search waits until the check answers it. */
  const requests = [];
  let honorCancel = true;
  const answer = (req, { move = "E5", ownership = null } = {}) => {
    const own = ownership || Array(req.size * req.size).fill("0");
    req.resolve({ ok: true, id: req.id, play: move, info: `info move ${move} visits 50 winrate 0.5 scoreLead 0.5 order 0 pv ${move} ownership ${own.join(" ")}` });
  };
  globalThis.zero = {
    on: () => () => {},
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true };
      if (command === "studio.katagoCancel") {
        if (honorCancel) for (const r of requests) if (!r.done && (!payload.id || payload.id === r.id)) r.resolve({ ok: false, id: r.id });
        return { ok: true };
      }
      if (command === "studio.katagoAnalyzeAsync") {
        return new Promise((resolve) => {
          const req = { id: payload.id, size: payload.size, moves: (payload.moves || "").trim(), visits: payload.visits, done: false };
          req.resolve = (v) => {
            req.done = true;
            resolve(v);
          };
          requests.push(req);
        });
      }
      throw new Error("unexpected command " + command);
    },
  };
  A.setLang("en");
  state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", teaching: false, showEval: false, onboarded: true, confirmMove: false, experience: "player" };
  state.profile = PM.newProfile();
  state.engine = { kind: "katago", name: "KataGo test", available: true };
  const open = () => requests.filter((r) => !r.done);
  // A hint searches with 200 visits (engine.js hint); pondering with 64.
  const hintReq = () => open().find((r) => r.visits === 200);
  const moveCount = (req) => (req.moves ? req.moves.split(/\s+/).length / 2 : 0);

  function liveGame(n, { opponent = "human", humanColor = BLACK } = {}) {
    const game = new Game({ size: 9 });
    const pts = [[2, 2], [6, 6], [2, 6], [6, 2], [4, 4], [3, 3], [5, 5], [3, 5]];
    for (let i = 0; i < n; i++) game.play(...pts[i]);
    state.game = Play.freshGameState(game, { opponent, humanColor });
    state.review = null;
    state.space = "play";
    state.play = { ...state.play, view: "game", explorer: null };
    return state.game;
  }
  const settle = async () => {
    for (const r of open()) r.resolve({ ok: false, id: r.id });
    await sleep(5);
  };

  await test("play races: a hint that arrives after an undo is dropped (not shown, not counted)", async () => {
    honorCancel = false; // a busy host answers anyway
    const g = liveGame(4);
    const hinted = Play.askHint();
    await until(() => hintReq(), 2000, "the hint's search");
    const late = hintReq();
    assert.equal(moveCount(late), 4, "asked for the position on the board");
    Play.undo();
    assert.equal(g.thinking, false);
    answer(late, { move: "E5" });
    await hinted;
    await sleep(5);
    assert.equal(g.hint, null, "no hint for a position that is gone");
    assert.equal(g.hints, 0, "a dropped hint is not counted");
    assert.equal(g.game.moveNumber, 3);
    // The next hint, for the position now on the board, is shown (pondering is answered first).
    await until(() => open().length > 0, 2000, "pondering");
    await settle();
    const again = Play.askHint();
    await until(() => hintReq(), 2000, "the second hint's search");
    assert.equal(moveCount(hintReq()), 3);
    answer(hintReq(), { move: "E5" });
    await again;
    assert.deepEqual([g.hint?.x, g.hint?.y], [4, 4]);
    assert.equal(g.hints, 1);
    honorCancel = true;
    await settle();
  });

  await test("play races: the engine's searches are for the position asked about, not the one on the board when they run", async () => {
    const game = new Game({ size: 9 });
    for (const p of [[2, 2], [6, 6], [2, 6], [6, 2]]) game.play(...p);
    const at2 = game.mainLine()[2];
    for (const [name, call] of [
      ["hint", () => Engine.hint(game, { node: at2 })],
      ["decide", () => Engine.decide(game, { rank: 10 }, { node: at2 })],
      ["deadStones", () => Engine.deadStones(game, { node: at2 })],
    ]) {
      const p = call();
      await until(() => open().length === 1, 2000, name);
      assert.equal(moveCount(open()[0]), 2, `${name}: the moves to the node given`);
      answer(open()[0], { move: "E5" });
      await p;
    }
  });

  await test("play races: Resume and a second count: the first count's late dead stones do not overwrite it", async () => {
    honorCancel = false;
    const g = liveGame(6);
    Play.acceptCount(); // both pass: the count starts and asks for the dead stones
    await until(() => open().length === 1, 2000, "the first count's search");
    const first = open()[0];
    assert.equal(g.scoring?.source, "pending");
    Play.resumePlay();
    assert.equal(g.scoring, null);
    Play.acceptCount();
    await until(() => open().some((r) => r !== first), 2000, "the second count's search");
    const second = open().find((r) => r !== first);
    // The first answer comes late, calling stones dead.
    const dead = Array(81).fill("0");
    for (const [x, y] of [[2, 2], [2, 6], [4, 4]]) dead[y * 9 + x] = "-1";
    answer(first, { move: "pass", ownership: dead });
    await sleep(10);
    assert.equal(g.scoring?.source, "pending", "still waiting for its own answer");
    answer(second, { move: "pass" });
    await until(() => g.scoring?.source === "katago", 2000, "the second count's answer");
    assert.deepEqual(g.scoring.dead, [], "the second count's own dead stones");
    honorCancel = true;
    await settle();
  });

  await test("play races: the engine fails on the computer's turn: the offline engine plays; when that fails too, Retry", async () => {
    const saved = { ...Play.moveSources };
    try {
      const g = liveGame(1, { opponent: "ai", humanColor: BLACK });
      assert.equal(Play.isComputerTurn(), true);
      Play.moveSources.decide = async () => {
        throw new Error("engine down");
      };
      Play.moveSources.offline = async () => ({ x: 6, y: 6 });
      await Play.maybeComputerMove();
      await until(() => g.game.moveNumber === 2, 3000, "the offline move");
      assert.equal(g.game.current.move.x, 6);
      assert.equal(g.opponentMode, "offline");
      assert.equal(g.engineFailed, false);
      await settle();
      // Both fail: no move, no thinking, and Retry on offer.
      assert.ok(g.game.play(2, 6).ok);
      Play.moveSources.decide = async () => ({ move: null, analysis: null });
      Play.moveSources.offline = async () => {
        throw new Error("offline down too");
      };
      state.toasts = [];
      await Play.maybeComputerMove();
      assert.equal(g.thinking, false);
      assert.equal(g.engineFailed, true, "Retry is offered");
      assert.equal(Play.isComputerTurn(), true, "still the computer's turn, but not stuck");
      await until(() => state.announce.includes(t("v13ui.engineFailed")), 1000, "the announcement");
      // Retry with the engine back.
      Play.moveSources.decide = saved.decide;
      Play.moveSources.offline = async () => ({ x: 6, y: 2 });
      Play.moveSources.decide = async () => ({ move: { x: 6, y: 2 }, analysis: null, mode: "standard" });
      Play.retryComputerMove();
      await until(() => g.game.moveNumber === 4, 3000, "the move after Retry");
      assert.equal(g.engineFailed, false);
      // An undo clears the offer too.
      Play.moveSources.decide = async () => null;
      Play.moveSources.offline = async () => null;
      assert.ok(g.game.play(4, 4).ok);
      await Play.maybeComputerMove();
      assert.equal(g.engineFailed, true);
      Play.undo();
      assert.equal(g.engineFailed, false);
    } finally {
      Object.assign(Play.moveSources, saved);
      await settle();
    }
  });

  await test("play races: opening another review closes the one before: back to the live game, no accidental branch", async () => {
    state.engine = { kind: "offline", available: false };
    const g = liveGame(4);
    // Step back in the live game (← opens its review one move back).
    Play.reviewCurrentGame();
    Review.reviewStep(-1);
    assert.equal(g.game.current, g.game.mainLine()[3]);
    // An SGF opens in the Library meanwhile.
    const other = new Game({ size: 9 });
    other.play(4, 4);
    Review.openReview(other, { source: "record", space: "library", back: "library" });
    assert.equal(state.review.game, other);
    assert.equal(g.game.current, g.game.mainLine().at(-1), "the live game is back on its last move");
    // Back to Play: the next move continues the game.
    Play.continueCurrent();
    assert.equal(state.review, null);
    Play.humanPlay(4, 4);
    const line = g.game.mainLine();
    assert.equal(line.length, 6, "the move is on the main line");
    assert.equal(line[4].children.length, 1, "no branch at the last move");
    state.engine = { kind: "katago", name: "KataGo test", available: true };
    await settle();
  });

  await test("play races: no game in progress at launch: Play shows its home; a board where only the computer moved is not a game in progress", async () => {
    Lib.clearCurrent();
    state.game = null;
    Play.restoreCurrent();
    assert.equal(state.game, null, "no blank rated board against opponentRank");
    state.play = { ...state.play, view: "home" };
    assert.equal(Play.playShowsBoard(), false);
    // The computer (Black) moved, the player (White) has not.
    const game = new Game({ size: 9 });
    game.play(4, 4);
    state.game = Play.freshGameState(game, { opponent: "ai", humanColor: WHITE });
    assert.equal(Play.unfinishedGame(), false);
    assert.equal(Play.playShowsBoard(), false, "restored at launch (home view): Play's home");
    state.play = { ...state.play, view: "game" };
    assert.equal(Play.playShowsBoard(), true, "a game just started is on the board");
    state.play = { ...state.play, view: "home" };
    game.play(3, 3);
    assert.equal(Play.unfinishedGame(), true);
    assert.equal(Play.playShowsBoard(), true, "a game with a move of the player's is on the board");
    await settle();
  });
}
