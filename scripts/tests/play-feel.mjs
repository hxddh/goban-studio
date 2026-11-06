/**
 * Play: how the computer plays — think time, resigning, the count. Loaded by scripts/test.mjs (every file in
 * scripts/tests/, in name order); receives the runner's helpers.
 *
 * The pure rules first (app/feel.js: think time, resignation, the count
 * proposal; engine.js deadFromOwnership; rules.js scoring of typical
 * endings), then the play controller with a fake KataGo host (the pattern
 * of core-scheduler.mjs): the computer resigns in time and only then, offers
 * the count only on a settled board, and the end-of-game marking can be
 * corrected group by group.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, what = "condition") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(5);
  }
}

const LETTERS = "ABCDEFGHJKLMNOPQRST";
const vertex = (m, size) => (m.pass ? "pass" : LETTERS[m.x] + (size - m.y));

/** A KataGo `info` report: candidates `{ x, y | pass, visits, winrate, lead }`, then ownership. */
function infoOf(size, cands, ownership = null) {
  const moves = cands.map((c, i) => `info move ${vertex(c, size)} visits ${c.visits ?? 20} winrate ${c.winrate} scoreLead ${c.lead} order ${i} pv ${vertex(c, size)}`);
  return moves.join(" ") + (ownership ? " ownership " + Array.from(ownership).join(" ") : "");
}

/** Board rows ("X" black, "O" white, "." empty) → a Game set up with them. */
function fromRows(Game, BLACK, WHITE, rows, opts = {}) {
  const stones = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && stones.push({ x, y, c: ch === "X" ? BLACK : WHITE })));
  const game = new Game({ size: rows.length, ...opts });
  game.setup(stones, opts.turn ?? BLACK);
  return game;
}

/**
 * Eye-versus-eye seki in the top-left corner (scripts/test.mjs SEKI_BOARD),
 * closed by Black's column F and White's column G, plus three stones that
 * are dead at the end: a white stone in atari at E2 inside Black's area
 * (Black D2 and E1 around it), and a black stone at J5 in White's area.
 */
const ENDING = [
  ".X.OXXO..",
  "XXOOXXO..",
  "OOOXXXO..",
  ".OXX.XO..",
  "OOX..XO.X",
  "XXX..XO..",
  ".....XO..",
  "...XOXO..",
  "....XXO..",
];
const DEAD = [
  { x: 4, y: 7 },
  { x: 8, y: 4 },
];

export default async function ({ test, assert, root }) {
  const F = await import("../../src/web/js/app/feel.js");
  const E = await import("../../src/web/js/engine.js");
  const R = await import("../../src/web/js/rules.js");
  const { BLACK, WHITE, EMPTY, Game } = R;

  /* ------------------------------------------------- 13×13 calibration */

  const SE = await import("../../src/web/js/model/player.js");
  const fs = await import("node:fs");
  const path = await import("node:path");

  await test("play calibration: every level is measured on 13×13, in order, between its 9×9 and 19×19 spans", () => {
    const ids = E.STRENGTHS.map((s) => s.id);
    for (const mode of ["standard", "human"]) {
      for (const id of ids) assert.ok(Number.isFinite(SE.MEASURED[mode][id][13]), `${mode} ${id}`);
    }
    assert.ok(Number.isFinite(SE.MEASURED.strong["2d"][13]));
    const std = ids.map((id) => SE.MEASURED.standard[id][13]);
    assert.equal(std[0], 0, "the weakest level is the reference");
    for (let i = 1; i < std.length; i++) assert.ok(std[i] > std[i - 1], `${ids[i]} above ${ids[i - 1]}`);
    // The ladder spans less on the smaller board.
    const span = (b) => SE.MEASURED.standard["2d"][b] - SE.MEASURED.standard["30k"][b];
    assert.ok(span(9) < span(13) && span(13) < span(19), `${span(9)} < ${span(13)} < ${span(19)}`);
    // The games behind it are committed.
    for (const run of ["v8-13a", "v8-13b", "v8-13c"]) {
      const file = path.join(root, "docs/calibration/results", run + ".jsonl");
      const games = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      assert.ok(games.length >= 100 && games.every((g) => g.size === 13), run);
    }
  });

  await test("play calibration: 13×13 games are compared on the measured 13×13 scale", () => {
    for (const s of E.STRENGTHS) {
      const m = SE.MEASURED.standard[s.id];
      assert.ok(Math.abs(SE.onBoard(m[19], 13) - m[13]) < 1e-9, `${s.id}: 19×19 → 13×13 through the measured pair`);
      assert.ok(Math.abs(SE.fromBoard(m[13], 13) - m[19]) < 1e-9, `${s.id}: and back`);
      if (E.impl("L:" + s.id)) assert.equal(SE.implOpponent("L:" + s.id, { size: 13 }), m[13]);
      if (E.impl("HL:" + s.id)) assert.equal(SE.implOpponent("HL:" + s.id, { size: 13 }), SE.MEASURED.human[s.id][13]);
    }
    for (let t = -5; t < 35; t += 0.5) {
      assert.ok(SE.onBoard(t + 0.5, 13) > SE.onBoard(t, 13), "monotone");
      assert.ok(Math.abs(SE.fromBoard(SE.onBoard(t, 13), 13) - t) < 1e-9, "inverse");
    }
    // Human-style 2d is far above the standard 2d on 19×19, not on 13×13.
    const gap = (b) => SE.MEASURED.human["2d"][b] - SE.MEASURED.standard["2d"][b];
    assert.ok(gap(19) > 3 && gap(13) < 1.5, `${gap(19)} vs ${gap(13)}`);
    // A 13×13 result says less about 19×19 strength than a 19×19 one, more than a 9×9 one.
    const est = SE.priorRating(10, 0);
    const moved = (size) => SE.updateRating(est, { opponent: SE.onBoard(est.mu, size), size, won: true, at: 0 }).mu - est.mu;
    assert.ok(moved(9) < moved(13) && moved(13) < moved(19), `${moved(9)} ${moved(13)} ${moved(19)}`);
    // Handicap stones on 13×13 still weaken the level.
    assert.ok(SE.implOpponent("L:5k", { size: 13, handicap: 3 }) < SE.implOpponent("L:5k", { size: 13 }));
  });

  /* ------------------------------------------------------- think time */

  // v9: every rank the opponent can play at, whatever is installed (opponents.js), weakest first.
  const LEVELS = [...new Set([{}, { human: true }, { strong: true }, { human: true, strong: true }].flatMap((i) => E.ladder(i).map((e) => e.label)))].sort((a, b) => b - a);

  const obvious = { moves: [{ visits: 152, scoreLead: 2 }, { visits: 5, scoreLead: -6 }, { visits: 3, scoreLead: -9 }] };
  const complex = { moves: [{ visits: 40, scoreLead: 0.4 }, { visits: 38, scoreLead: 0.3 }, { visits: 35, scoreLead: 0.1 }, { visits: 30, scoreLead: 0 }] };
  const middling = { moves: [{ visits: 90, scoreLead: 1.5 }, { visits: 40, scoreLead: 0 }, { visits: 30, scoreLead: -1 }] };
  const fixed = (v) => () => v;

  await test("play feel: the computer's think time stays between 0.35 s and 3.5 s at every level, board and phase", () => {
    assert.equal(F.THINK_MIN, 350);
    assert.equal(F.THINK_MAX, 3500);
    for (const s of LEVELS) {
      for (const size of [9, 13, 19]) {
        for (const n of [0, 10, 40, 120, 250, size * size]) {
          for (const a of [null, obvious, middling, complex]) {
            for (const r of [0, 0.5, 0.999]) {
              const ms = F.thinkTime(s, a, n, size, fixed(r));
              assert.ok(ms >= 350 && ms <= 3500, `${s} ${size} move ${n}: ${ms} ms`);
            }
          }
        }
      }
    }
  });

  await test("play feel: an obvious move is answered at least twice as fast as a hard one, and the opening is brisk", () => {
    for (const s of LEVELS) {
      const easy = F.thinkTime(s, obvious, 100, 19, fixed(0.5));
      const hard = F.thinkTime(s, complex, 100, 19, fixed(0.5));
      assert.ok(hard >= 2 * easy, `${s}: ${easy} vs ${hard} ms`);
      assert.ok(F.thinkTime(s, complex, 10, 19, fixed(0.5)) < hard, `${s}: the opening is quicker`);
      assert.ok(F.thinkTime(s, complex, 300, 19, fixed(0.5)) < hard, `${s}: the endgame is quicker`);
    }
    // Stronger levels never answer faster than weaker ones in the same position.
    for (const a of [obvious, middling, complex]) {
      const times = LEVELS.map((s) => F.thinkTime(s, a, 100, 19, fixed(0.5)));
      for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], `${LEVELS[i]} quicker than ${LEVELS[i - 1]}: ${times}`);
    }
    // The gentlest level is quick, the strongest takes its time but is never sluggish.
    assert.ok(F.thinkTime(30, middling, 100, 19, fixed(0.5)) <= 1000);
    assert.ok(F.thinkTime(-7, middling, 100, 19, fixed(0.5)) <= 2500);
    assert.ok(F.thinkTime(-7, obvious, 100, 19, fixed(0.5)) <= 1200, "an obvious move, even at the top");
  });

  await test("play feel: think time varies by about ±15% from move to move, never mechanically", () => {
    for (const s of LEVELS) {
      const lo = F.thinkTime(s, middling, 100, 19, fixed(0));
      const hi = F.thinkTime(s, middling, 100, 19, fixed(0.999));
      if (lo > 350 && hi < 3500) {
        assert.ok(hi / lo > 1.25 && hi / lo < 1.4, `${s}: ${lo}–${hi} ms`);
      }
    }
    // Spread over a game's positions: more than a factor of two between the
    // quickest and slowest replies for every level.
    for (const s of LEVELS) {
      const all = [];
      for (const a of [obvious, middling, complex]) for (const n of [10, 100, 300]) all.push(F.thinkTime(s, a, n, 19, fixed(0.5)));
      assert.ok(Math.max(...all) / Math.min(...all) >= 2, `${s}: ${all}`);
    }
  });

  /* ------------------------------------------------------- resignation */

  const settledOwn = (size, sign) => new Float32Array(size * size).fill(0.95 * sign);
  const openOwn = (size) => new Float32Array(size * size).fill(0.2);
  // Black's point of view: the computer is White here.
  const lostForWhite = (lead, own) => ({ winrate: 0.995, scoreLead: lead, ownership: own });
  const steps = (id, a, k, { size = 19, n = 200, aiColor = WHITE } = {}) => {
    let low = 0;
    const out = [];
    for (let i = 0; i < k; i++) {
      const v = F.resignStep(low, { rank: id, analysis: a, aiColor, moveNumber: n + 2 * i, size });
      low = v.low;
      out.push(v.resign);
    }
    return out;
  };

  await test("play feel: the computer resigns a clearly lost, settled game after three searches in a row", () => {
    const resigning = LEVELS.filter((r) => r <= F.RESIGN_FROM_RANK);
    assert.deepEqual(resigning, [15, 12, 10, 7, 5, 3, 2, 1, -3, -6, -7]);
    for (const id of resigning) {
      for (const size of [9, 13, 19]) {
        const r = steps(id, lostForWhite(30, settledOwn(size, 1)), 3, { size, n: Math.ceil((size * size) / 2) });
        assert.deepEqual(r, [false, false, true], `${id} on ${size}×${size}`);
      }
      // Black's side too.
      assert.deepEqual(steps(id, { winrate: 0.004, scoreLead: -30, ownership: settledOwn(19, -1) }, 3, { aiColor: BLACK }), [false, false, true]);
    }
    // One search that is not hopeless starts the count again.
    let low = 0;
    const lost = lostForWhite(40, settledOwn(19, 1));
    for (const a of [lost, lost, { ...lost, winrate: 0.9 }, lost, lost]) {
      const v = F.resignStep(low, { rank: -3, analysis: a, aiColor: WHITE, moveNumber: 200, size: 19 });
      assert.equal(v.resign, false);
      low = v.low;
    }
    assert.equal(low, 2);
  });

  await test("play feel: the computer never resigns while ahead, in an open position, early, offline, or at the gentlest levels", () => {
    for (const s of LEVELS) {
      // Ahead, or level: never.
      for (const a of [{ winrate: 0.01, scoreLead: -25, ownership: settledOwn(19, -1) }, { winrate: 0.5, scoreLead: 0.5, ownership: settledOwn(19, 1) }]) {
        assert.ok(!steps(s, a, 8).some(Boolean), `${s} resigned while ahead or level`);
      }
      // Behind by 30 with most of the board open: a weak opponent could still throw it away.
      const open = lostForWhite(30, openOwn(19));
      assert.ok(!steps(s, open, 8, { n: 120 }).some(Boolean), `${s} resigned an open game`);
      // In the opening, however it looks.
      assert.ok(!steps(s, lostForWhite(60, settledOwn(19, 1)), 8, { n: 20 }).some(Boolean), `${s} resigned in the opening`);
      // No analysis (the offline engine): never.
      assert.ok(!steps(s, null, 8).some(Boolean));
      assert.ok(!steps(s, { winrate: null, scoreLead: null }, 8).some(Boolean));
      // The gentlest levels play every game out.
      if (s > F.RESIGN_FROM_RANK) assert.ok(!steps(s, lostForWhite(200, settledOwn(19, 1)), 20).some(Boolean), `${s} resigned`);
    }
    // How open the board is sets the margin: a quarter of the open points
    // for the two strongest levels, half for the others.
    const halfOpen = new Float32Array(361).map((_, i) => (i < 200 ? 0.95 : 0.1)); // 161 open points
    assert.equal(F.openPoints(halfOpen), 161);
    assert.deepEqual(steps(-3, lostForWhite(42, halfOpen), 3), [false, false, true]);
    assert.ok(!steps(-3, lostForWhite(38, halfOpen), 6).some(Boolean));
    assert.ok(!steps(12, lostForWhite(78, halfOpen), 6).some(Boolean));
    assert.deepEqual(steps(12, lostForWhite(82, halfOpen), 3), [false, false, true]);
    // Without ownership every empty point counts as open.
    assert.ok(!F.resignStep(2, { rank: -3, analysis: { winrate: 0.99, scoreLead: 30 }, aiColor: WHITE, moveNumber: 150, size: 19, empty: 200 }).resign);
    assert.ok(F.resignStep(2, { rank: -3, analysis: { winrate: 0.99, scoreLead: 30 }, aiColor: WHITE, moveNumber: 250, size: 19, empty: 100 }).resign);
  });

  /* ------------------------------------------------------- the count */

  await test("play feel: the count is offered only on a settled board where no move is worth anything", () => {
    const own = settledOwn(9, 1).map((_, i) => (i % 9 < 4 ? 0.95 : i % 9 > 4 ? -0.95 : 0.9));
    const dame = [{ x: 4, y: 0, visits: 30, winrate: 0.1, scoreLead: -6.5 }, { x: 4, y: 1, visits: 20, winrate: 0.1, scoreLead: -6.4 }];
    assert.equal(F.countReady({ moves: dame, ownership: own }, 40, 9), true, "only dame left");
    assert.equal(F.countReady({ moves: [{ pass: true, visits: 30, winrate: 0.1, scoreLead: -6.5 }], ownership: own }, 40, 9), true, "KataGo passes");
    assert.equal(F.countReady({ moves: dame, ownership: own }, 20, 9), false, "too early in the game");
    assert.equal(F.countReady({ moves: dame, ownership: openOwn(9) }, 40, 9), false, "the board is still open");
    assert.equal(F.countReady({ moves: dame, ownership: null }, 40, 9), false, "no ownership: no offer");
    const gote = [{ x: 4, y: 0, visits: 30, winrate: 0.2, scoreLead: -4.5 }, { x: 4, y: 1, visits: 20, winrate: 0.1, scoreLead: -6.5 }];
    assert.equal(F.countReady({ moves: gote, ownership: own }, 40, 9), false, "a two-point move is left");
    // A candidate KataGo never searched does not count as the second choice.
    const unsearched = [dame[0], { ...dame[1], visits: 0 }, { x: 4, y: 2, visits: 3, winrate: 0.1, scoreLead: -9 }];
    assert.equal(F.countReady({ moves: unsearched, ownership: own }, 40, 9), false);
    assert.equal(F.countReady(null, 40, 9), false);
  });

  /* -------------------------------------------- dead stones and scoring */

  /** KataGo-like ownership for a board whose dead stones are `dead`. */
  function ownershipFor(game, dead, { seki = 0.04 } = {}) {
    const s = game.score(dead);
    const size = game.size;
    const sekiKeys = new Set(s.seki.map((p) => p.y * size + p.x));
    const deadKeys = new Set(dead.map((p) => p.y * size + p.x));
    const own = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const k = y * size + x;
        const v = game.board.get([x, y]);
        if (v !== EMPTY) own[k] = sekiKeys.has(k) ? seki * v : deadKeys.has(k) ? -0.9 * v : 0.95 * v;
        else own[k] = s.territory[y][x] * 0.95;
      }
    }
    // Seki eyes and the shared liberty belong to nobody.
    for (const p of s.sekiPoints) own[p.y * size + p.x] = 0;
    return own;
  }

  await test("play feel: dead stones from ownership, chain by chain: seki lives, a stone left in atari is dead", () => {
    const game = fromRows(Game, BLACK, WHITE, ENDING);
    assert.equal(game.board.getLiberties([4, 7]).length, 1, "the white stone is in atari");
    const own = ownershipFor(game, DEAD);
    const dead = E.deadFromOwnership(game.board, own);
    assert.deepEqual(dead, [...DEAD].sort((p, q) => p.y - q.y || p.x - q.x));
    // A chain is decided as a whole: one stone past the threshold does not
    // split it (the chain's mean stays near zero, so it lives).
    const split = Float32Array.from(own);
    split[0 * 9 + 3] = 0.9; // White D9 of the seki group, as if dead
    assert.deepEqual(E.deadFromOwnership(game.board, split), dead, "the seki group is not split");
    // Clearly dead as a whole (mean past the threshold): the whole chain.
    const all = Float32Array.from(own);
    for (const p of [[3, 0], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3], [0, 4], [1, 4]]) all[p[1] * 9 + p[0]] = 0.6;
    const marked = E.deadFromOwnership(game.board, all);
    assert.equal(marked.length, DEAD.length + 9);
    // An unclear stone (|ownership| under 0.45) is given the benefit of the doubt.
    const unclear = Float32Array.from(own);
    unclear[4 * 9 + 8] = -0.4;
    assert.deepEqual(E.deadFromOwnership(game.board, unclear), [{ x: 4, y: 7 }]);
  });

  await test("play feel: a typical ending counts right under Japanese, Korean and Chinese rules", () => {
    const counts = {};
    for (const rules of ["japanese", "korean", "chinese"]) {
      const game = fromRows(Game, BLACK, WHITE, ENDING, { rules, komi: R.defaultKomi(rules) });
      const s = game.score(DEAD);
      counts[rules] = s;
      assert.equal(s.dead.length, 2);
      assert.equal(s.seki.length, 12, `${rules}: both seki groups`);
      // The dead stones' points belong to the side around them.
      assert.equal(s.territory[7][4], BLACK);
      assert.equal(s.territory[4][8], WHITE);
      if (s.method === "territory") {
        // Seki eyes are no one's territory; each dead stone is a prisoner.
        assert.equal(s.territory[0][0], EMPTY);
        assert.equal(s.territory[3][0], EMPTY);
        assert.equal(s.blackPrisoners, 1);
        assert.equal(s.whitePrisoners, 1);
      } else {
        assert.equal(s.territory[0][0], BLACK);
        assert.equal(s.territory[3][0], WHITE);
      }
    }
    const j = counts.japanese;
    assert.deepEqual([j.blackTerritory, j.whiteTerritory, j.neutral, j.black, j.white, j.result], [18, 18, 3, 19, 25.5, "W+6.5"]);
    assert.equal(counts.korean.result, j.result, "Korean rules count as Japanese");
    const c = counts.chinese;
    assert.deepEqual([c.blackStones, c.blackTerritory, c.whiteStones, c.whiteTerritory, c.neutral, c.black, c.white, c.result], [24, 19, 18, 19, 1, 43, 44.5, "W+1.5"]);
    // Left on the board, the dead stones spoil both areas around them.
    const alive = fromRows(Game, BLACK, WHITE, ENDING).score([]);
    assert.ok(alive.blackTerritory < j.blackTerritory && alive.whiteTerritory < j.whiteTerritory, `${alive.blackTerritory} ${alive.whiteTerritory}`);
  });

  /* ------------------------------------------- the controller, fake host */

  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: [
        'export * as Play from "./src/web/js/app/play-ctl.js";',
        'export * as Engine from "./src/web/js/engine.js";',
        'export * as Lib from "./src/web/js/data/games.js";',
        'export * as P from "./src/web/js/data/settings.js";',
        'export * as PM from "./src/web/js/model/player.js";',
        'export { store } from "./src/web/js/data/store.js";',
        'export { Game, BLACK, WHITE } from "./src/web/js/rules.js";',
        'export { setLang } from "./src/web/js/i18n.js";',
        'export { state } from "./src/web/js/app/store.js";',
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
  const { Play, Lib, P, state, PM, store } = A;
  // The store picks its backend on first use: the preview's, before any fake host.
  await store.open();

  // The fake host answers every search with `respond(payload)` → { info, play }.
  let respond = () => ({ info: "", play: "pass" });
  const searches = [];
  globalThis.zero = {
    on: () => () => {},
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true };
      if (command === "studio.katagoCancel") return { ok: true };
      if (command === "studio.katagoAnalyzeAsync") {
        searches.push(payload);
        await sleep(2);
        const r = respond(payload);
        return { ok: true, id: payload.id, play: r.play || "pass", info: r.info };
      }
      throw new Error("unexpected command " + command);
    },
  };
  // The computer's pacing waits up to 3.5 s a move. Only the pacing test
  // keeps the real clock; elsewhere every reading of performance.now() is
  // seconds after the last, so no reply waits.
  const realNow = performance.now.bind(performance);
  let fast = true;
  let skew = 0;
  performance.now = () => realNow() + (fast ? (skew += 5000) : skew);
  A.setLang("en");
  for (const rec of Lib.listGames()) Lib.deleteGame(rec.id);
  state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", teaching: false, showEval: false, onboarded: true, confirmMove: false };
  state.profile = PM.newProfile();
  state.engine = { kind: "katago", name: "KataGo test", available: true };

  /** The first empty point of column E (the dame between the walls). */
  const dameOf = (game) => {
    for (let y = 0; y < game.size; y++) if (!game.board.get([4, y]) && game.canPlay(4, y).ok) return { x: 4, y };
    return null;
  };
  /**
   * A finished-looking 9×9 game against the computer (White): Black walls on
   * C and D, White walls on F and G, column E empty. 36 moves; Black to play.
   */
  function wallsGame(strength) {
    Play.newGame({ size: 9, color: BLACK, opponentRank: strength, rules: "japanese" });
    const g = state.game;
    for (let y = 0; y < 9; y++) {
      g.game.play(2, y);
      g.game.play(5, y);
    }
    for (let y = 0; y < 9; y++) {
      g.game.play(3, y);
      g.game.play(6, y);
    }
    return g;
  }
  // Column E is dame: its stones belong to their colour, its empty points
  // (firm for the test's purpose) to nobody in the count.
  const wallsOwnership = () => {
    const board = state.game.game.board;
    return new Float32Array(81).map((_, i) => (i % 9 < 4 ? 0.95 : i % 9 > 4 ? -0.95 : 0.9 * (board.get([4, Math.floor(i / 9)]) || 1)));
  };
  /** The computer's report on the walls board: two dame, worth the same. */
  const dameReport = ({ winrate = 0.2, lead = -6.5, ownership = wallsOwnership() } = {}) => {
    const game = state.game.game;
    const d = dameOf(game);
    const e = { x: 4, y: d.y + 1 < 9 && !game.board.get([4, d.y + 1]) ? d.y + 1 : d.y };
    return { info: infoOf(9, [{ ...d, visits: 30, winrate, lead }, { ...e, visits: 10, winrate, lead: lead + 0.1 }], ownership), play: vertex(d, 9) };
  };
  async function humanThenReply(g, x, y) {
    const n = g.game.moveNumber;
    Play.humanPlay(x, y);
    assert.equal(g.game.moveNumber, n + 1, "the player's move");
    await until(() => !g.thinking && (g.game.moveNumber === n + 2 || g.game.current.result), 6000, "the computer's reply");
  }

  await test("play feel: the computer takes at least the minimum think time, and its pace follows the position", async () => {
    fast = false;
    try {
      const g = wallsGame(30);
      respond = () => dameReport();
      const t0 = Date.now();
      await humanThenReply(g, 4, 8);
      const ms = Date.now() - t0;
      assert.ok(ms >= F.THINK_MIN - 5, `answered in ${ms} ms`);
      assert.ok(ms < 1500, `a quiet move at 30 kyu took ${ms} ms`);
    } finally {
      fast = true;
    }
  });

  await test("play feel: on a settled board the count is offered on the player's turn, with nothing pondering", async () => {
    const g = wallsGame(-3);
    respond = () => dameReport();
    assert.equal(g.proposal, false);
    await humanThenReply(g, 4, 8);
    assert.equal(g.game.turn, BLACK, "the player's turn");
    assert.equal(g.proposal, true, "the count is offered");
    // "Keep playing": not again for three moves each.
    Play.dismissProposal();
    await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.proposal, false, "not right after keep playing");
    await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.proposal, true, "offered again three moves each later");
    // Accepting: both pass and the count starts.
    respond = () => ({ info: infoOf(9, [{ pass: true, winrate: 0.2, lead: -6.5 }], wallsOwnership()), play: "pass" });
    Play.acceptCount();
    assert.ok(g.scoring, "scoring");
    await until(() => g.scoring?.source === "katago", 3000, "the marking");
    assert.deepEqual(g.scoring.dead, []);
    assert.equal(g.scoring.score.result, "W+6.5");
  });

  await test("play feel: no count offer while the board is open or a move is still worth points", async () => {
    let g = wallsGame(-3);
    respond = () => dameReport({ ownership: new Float32Array(81).fill(0.3) });
    await humanThenReply(g, 4, 8);
    assert.equal(g.proposal, false, "open board");
    g = wallsGame(-3);
    respond = () => {
      const r = dameReport();
      // The best move gains three points over the next one.
      return { ...r, info: r.info.replace(/scoreLead -6.4/, "scoreLead -9.5") };
    };
    await humanThenReply(g, 4, 8);
    assert.equal(g.proposal, false, "a move worth three points is left");
  });

  await test("play feel: a clearly lost computer resigns on its third hopeless search; a winning or gentle one plays on", async () => {
    // 2d, White, 40 points behind on a settled board.
    let g = wallsGame(-3);
    respond = () => dameReport({ winrate: 0.998, lead: 40 });
    await humanThenReply(g, 4, 8);
    await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.game.current.result, null, "not after two searches");
    await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.game.current.result, "B+R", "resigned on the third");
    assert.equal(g.game.moveNumber, 36 + 5, "two replies, then the resignation");
    assert.ok(state.toasts.some((x) => /resigned/.test(x.message)), "it says so");

    // An undo forgets the streak.
    g = wallsGame(-3);
    await humanThenReply(g, 4, 8);
    await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    Play.undo();
    await until(() => !g.thinking, 3000, "idle after undo");
    await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.game.current.result, null, "the streak restarted after the undo");

    // The computer ahead: never.
    g = wallsGame(-3);
    respond = () => dameReport({ winrate: 0.002, lead: -40 });
    for (let i = 0; i < 4; i++) await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.game.current.result, null);

    // The gentlest levels play it out, however lost.
    g = wallsGame("15k");
    respond = () => dameReport({ winrate: 0.999, lead: 60 });
    for (let i = 0; i < 4; i++) await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.game.current.result, null);

    // 10 kyu, 30 points behind with the board still open: plays on.
    g = wallsGame("10k");
    respond = () => dameReport({ winrate: 0.995, lead: 30, ownership: new Float32Array(81).fill(0.2) });
    for (let i = 0; i < 4; i++) await humanThenReply(g, dameOf(g.game).x, dameOf(g.game).y);
    assert.equal(g.game.current.result, null);
  });

  /** A two-player game set up with `rows`, counted (both pass). */
  async function countBoard(rows, own) {
    const game = fromRows(A.Game, A.BLACK, A.WHITE, rows, { rules: "japanese" });
    state.game = Play.freshGameState(game, { opponent: "human" });
    respond = () => ({ info: infoOf(9, [{ pass: true, winrate: 0.3, lead: -5 }], own), play: "pass" });
    Play.acceptCount();
    const g = state.game;
    assert.equal(g.scoring.source, "pending");
    // A click while KataGo is still marking changes nothing.
    Play.toggleDead(4, 7);
    assert.deepEqual(g.scoring.dead, []);
    await until(() => g.scoring?.source === "katago", 3000, "the marking");
    return g;
  }

  await test("play feel: the end-of-game marking finds the dead stones, keeps the seki, and scores", async () => {
    const own = ownershipFor(fromRows(Game, BLACK, WHITE, ENDING), DEAD);
    const g = await countBoard(ENDING, own);
    assert.deepEqual(g.scoring.dead, [...DEAD].sort((p, q) => p.y - q.y || p.x - q.x));
    assert.equal(g.scoring.score.result, "W+6.5");
    assert.equal(g.scoring.score.seki.length, 12);
    Play.confirmScore();
    assert.equal(g.game.current.result, "W+6.5");
  });

  await test("play feel: one click on a group fixes a misjudged marking, and a second click undoes it", async () => {
    // KataGo misjudges: the seki's white group as dead, the dead black J5 as alive.
    const own = ownershipFor(fromRows(Game, BLACK, WHITE, ENDING), DEAD);
    for (const [x, y] of [[3, 0], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3], [0, 4], [1, 4]]) own[y * 9 + x] = 0.7;
    own[4 * 9 + 8] = 0.95;
    const g = await countBoard(ENDING, own);
    assert.equal(g.scoring.dead.length, 10, "nine seki stones and E2");
    const wrong = g.scoring.score.result;
    Play.toggleDead(2, 2); // one stone of the white group: the whole chain lives
    assert.equal(g.scoring.dead.length, 1);
    Play.toggleDead(8, 4); // J5 is dead
    assert.deepEqual(g.scoring.dead.map((p) => `${p.x},${p.y}`).sort(), ["4,7", "8,4"]);
    assert.equal(g.scoring.score.result, "W+6.5", "the right count");
    assert.notEqual(wrong, "W+6.5");
    Play.toggleDead(8, 4);
    assert.deepEqual(g.scoring.dead, [{ x: 4, y: 7 }], "a second click brings it back");
    Play.toggleDead(5, 5); // F4, a stone of Black's outer wall: the whole chain
    assert.equal(g.scoring.dead.filter((p) => p.x === 5).length, 9, "the whole wall, as one chain");
    Play.toggleDead(5, 5);
    Play.toggleDead(4, 4); // empty: nothing
    assert.deepEqual(g.scoring.dead, [{ x: 4, y: 7 }]);
    Play.resumePlay();
    assert.equal(g.scoring, null);
  });

  // Nothing of these games keeps running into the next file's fake host.
  A.Engine.sched.cancelAll("quit");
  await sleep(20);
  performance.now = realNow;
}
