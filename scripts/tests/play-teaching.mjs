/**
 * Play: teaching reasons in warnings and hints. Loaded by scripts/test.mjs (every file in
 * scripts/tests/, in name order); receives the runner's helpers.
 *
 * The reason chooser (src/web/js/app/teach-why.js) on constructed positions (atari, cut, eye space,
 * ladder, and positions where no reason is confident), then the play controller with a fake KataGo
 * host: a teaching warning shows and announces its reason, and costs no extra search.
 */
import fs from "node:fs";
import { register, TEARDOWN_EXPORTS } from "./helpers.mjs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, what = "condition") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(5);
  }
}

/** A sign map from rows of "X" (Black), "O" (White) and "." */
const board = (rows) => rows.map((r) => r.replace(/\s+/g, "").split("").map((c) => (c === "X" ? 1 : c === "O" ? -1 : 0)));
/** Black-view ownership: `v` on the given points, 0 elsewhere. */
function own(size, pts, v) {
  const a = new Float32Array(size * size);
  for (const [x, y] of pts) a[y * size + x] = v;
  return a;
}

export default async function ({ test, assert, root }) {
  const { warningReason, hintReason, warningText, hintText } = await import("../../src/web/js/app/teach-why.js");
  const { setLang } = await import("../../src/web/js/i18n.js");
  const { MESSAGES } = await import("../../src/web/js/messages.js");
  const { PLAY } = await import("../../src/web/js/messages/play.js");
  setLang("en");
  const E = ". . . . . . . . .";

  await test("play teaching: a move that puts itself in atari is taken at once", () => {
    // White at C9 and B8; Black's B9 has one liberty (A9) and White takes it.
    const before = board([". . O . . . . . .", ". O . . . . . . .", E, E, E, E, E, E, E]);
    const r = warningReason({
      signMapBefore: before,
      move: { x: 1, y: 0 },
      mover: 1,
      loss: 6,
      before: { moves: [{ x: 4, y: 4, pv: [{ x: 4, y: 4 }], scoreLead: 0.5 }], ownership: null },
      after: { moves: [{ x: 0, y: 0, pv: [{ x: 0, y: 0 }] }], ownership: null },
    });
    assert.equal(r?.key, "why.warn.selfAtari");
    assert.equal(warningText("6", r), "This move may cost about 6 points — White can capture it at once.");
  });

  await test("play teaching: a group that loses its eye space is named at its point", () => {
    // Black's corner group has a straight three (A9–C9); Black plays elsewhere and White takes the
    // vital point B9. Ownership: the group was Black's before and is White's after.
    const before = board([". . . X O . . . .", "X X X X O . . . .", "O O O O O . . . .", E, E, E, E, E, E]);
    const group = [[0, 1], [1, 1], [2, 1], [3, 1], [3, 0], [0, 0], [1, 0], [2, 0]];
    const r = warningReason({
      signMapBefore: before,
      move: { x: 8, y: 8 },
      mover: 1,
      loss: 16,
      before: { moves: [{ x: 1, y: 0, pv: [{ x: 1, y: 0 }], scoreLead: 0 }], ownership: own(9, group, 0.9) },
      after: { moves: [{ x: 1, y: 0, pv: [{ x: 1, y: 0 }] }], ownership: own(9, group, -0.9) },
    });
    assert.equal(r?.key, "why.warn.noEyes");
    assert.equal(r.params[0], "B8", "the stone nearest White's vital point");
    assert.equal(warningText("16", r), "This move may cost about 16 points — your group at B8 can no longer make two eyes.");
    setLang("zh");
    assert.equal(warningText("16", r), "这一手可能损失约 16 目——你在 B8 的棋做不出两只眼了。");
    setLang("en");
  });

  await test("play teaching: a punishing line that is a ladder says so", () => {
    // Black's E5 stone; White's E6, D5 and F4 wait. Black plays elsewhere; White ataris at F5,
    // Black runs to E4, White ataris again at E3 and the chase zig-zags down: a ladder.
    const before = board([E, E, E, ". . . . O . . . .", ". . . O X . . . .", ". . . . . O . . .", E, E, E]);
    const stone = [[4, 4]];
    const r = warningReason({
      signMapBefore: before,
      move: { x: 0, y: 8 },
      mover: 1,
      loss: 8,
      before: { moves: [{ x: 4, y: 5, scoreLead: 0 }], ownership: own(9, stone, 0.4) },
      after: { moves: [{ x: 5, y: 4, pv: [{ x: 5, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 3, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 6 }, { x: 3, y: 7 }] }], ownership: own(9, stone, -0.95) },
    });
    assert.equal(r?.key, "why.warn.ladder");
    assert.equal(warningText("8", r), "This move may cost about 8 points — White can catch your stones in a ladder.");
  });

  await test("play teaching: no confident reason means the plain number, never a guess", () => {
    const before = board([E, E, ". . X . . . O . .", E, E, E, ". . O . . . X . .", E, E]);
    // No ownership, a quiet line: nothing to say.
    const quiet = warningReason({
      signMapBefore: before,
      move: { x: 4, y: 4 },
      mover: 1,
      loss: 5,
      before: { moves: [{ x: 2, y: 4, scoreLead: 0 }], ownership: null },
      after: { moves: [{ x: 6, y: 4, pv: [{ x: 6, y: 4 }, { x: 2, y: 4 }] }], ownership: null },
    });
    assert.equal(quiet, null);
    assert.equal(warningText("5", quiet), "This move may cost about 5 points.");
    // A loss spread thin over the board (no region carries it) has no reason either.
    const thin = warningReason({
      signMapBefore: before,
      move: { x: 4, y: 4 },
      mover: 1,
      loss: 5,
      before: { moves: [{ x: 2, y: 4, scoreLead: 0 }], ownership: own(9, [], 0) },
      after: { moves: [{ x: 6, y: 4, pv: [{ x: 6, y: 4 }] }], ownership: own(9, [[0, 0], [8, 8], [0, 8], [8, 0]], -0.3) },
    });
    assert.equal(thin, null);
    // Bad input never throws.
    assert.equal(warningReason({ signMapBefore: before, move: { x: 2, y: 2 }, mover: 1, after: {} }), null);
    assert.equal(hintReason(before, 1, { pass: true }), null);
  });

  await test("play teaching: hints say what the move does (capture, atari, cut, connect, corner)", () => {
    const center = board([E, E, E, ". . . . X . . . .", ". . . X O X . . .", E, E, E, E]);
    const cap = hintReason(center, 1, { x: 4, y: 5, pv: [{ x: 4, y: 5 }] });
    assert.equal(cap?.key, "why.hint.capture1");
    assert.equal(hintText("E4", cap), "Consider E4 — it captures a stone.");
    const two = board([E, E, E, E, ". . . X O X . . .", E, E, E, E]);
    assert.equal(hintReason(two, 1, { x: 4, y: 3, pv: [] })?.key, "why.hint.atari");
    // A real cut: White's D6 and E5 touch only diagonally and share no other liberty (E6 is Black's).
    const cut = board([E, E, E, ". . . O X . . . .", ". . . . O . . . .", E, E, E, E]);
    const r = hintReason(cut, 1, { x: 3, y: 4, pv: [{ x: 3, y: 4 }] });
    assert.equal(r?.key, "why.hint.cut");
    assert.equal(hintText("D5", r), "Consider D5 — it cuts White apart.");
    setLang("zh");
    assert.equal(hintText("D5", r), "可以考虑 D5——把白棋分断。");
    setLang("en");
    // Not a cut when the two white stones still share a liberty (E6 empty): no reason at all.
    const open = board([E, E, E, ". . . O . . . . .", ". . . . O . . . .", E, E, E, E]);
    assert.equal(hintReason(open, 1, { x: 3, y: 4, pv: [] }), null);
    // Joining two black stones.
    const join = board([E, E, E, ". . . X . X . . .", E, E, E, E, E]);
    assert.equal(hintReason(join, 1, { x: 4, y: 3, pv: [] })?.key, "why.hint.connect");
    // An empty corner on 19×19; a quiet point in the centre has no reason.
    const empty = Array.from({ length: 19 }, () => Array(19).fill(0));
    empty[3][15] = -1;
    assert.equal(hintReason(empty, 1, { x: 3, y: 15, pv: [] })?.key, "why.hint.corner");
    assert.equal(hintReason(empty, 1, { x: 9, y: 9, pv: [] }), null);
    // A working ladder in the hint's line.
    const lad = board([E, E, E, ". . . . O . . . .", ". . . O X . . . .", ". . . . . O . . .", E, E, E]);
    const ladder = hintReason(lad, -1, { x: 5, y: 4, pv: [{ x: 5, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 3, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 6 }, { x: 3, y: 7 }] });
    assert.equal(ladder?.key, "why.hint.ladder");
  });

  await test("play teaching: every reason string exists in four languages with matching placeholders", () => {
    const holes = (v) => [...new Set([...v.matchAll(/\{(\d)\}/g)].map((m) => m[1]))].sort().join();
    for (const k of Object.keys(PLAY)) {
      assert.ok(MESSAGES[k], k);
      for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(MESSAGES[k][lang].trim(), `${k} ${lang}`);
      for (const lang of ["zh", "ko", "ja"]) assert.equal(holes(MESSAGES[k][lang]), holes(MESSAGES[k].en), `${k} ${lang}`);
    }
    // Chinese uses the standard terms.
    assert.match(MESSAGES["why.warn.ladder"].zh, /征子/);
    assert.match(MESSAGES["why.warn.snapback"].zh, /倒扑/);
    assert.match(MESSAGES["why.warn.noEyes"].zh, /两只眼/);
  });

  /* ---------------------------------------------- the play flow, with a fake host */

  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    stdin: {
      contents: [
        'export * as Play from "./src/web/js/app/play-ctl.js";',
        'export * as Lib from "./src/web/js/data/games.js";',
        'export * as P from "./src/web/js/data/settings.js";',
        'export * as PM from "./src/web/js/model/player.js";',
        'export { store } from "./src/web/js/data/store.js";',
        'export { BLACK, WHITE } from "./src/web/js/rules.js";',
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
  const { Play, Lib, P, BLACK, state, PM, store } = A;
  // The store picks its backend on first use: the preview's, before any fake host.
  await store.open();

  // The fake host: before Black's 3rd move the position is even (best E5);
  // after Black's B9 (a self-atari) White leads by 8 and its line takes at A9.
  const requests = [];
  const info = (size, visits, moves) => {
    const k = moves.trim() ? moves.trim().split(/\s+/).length / 2 : 0;
    const zeros = Array(size * size).fill("0").join(" ");
    if (k === 5) return `info move A9 visits ${visits} winrate 0.2 scoreLead -8 order 0 pv A9 E5 ownership ${zeros}`;
    return `info move E5 visits ${visits} winrate 0.5 scoreLead 0.5 order 0 pv E5 ownership ${zeros}`;
  };
  globalThis.zero = {
    on: () => () => {},
    invoke: async (command, payload) => {
      if (command === "studio.katagoStatus") return { available: true, engine: "KataGo", version: "KataGo test", async: true, stream: true };
      if (command === "studio.katagoCancel") return { ok: true };
      if (command === "studio.katagoAnalyzeAsync") {
        requests.push({ visits: payload.visits, moves: payload.moves || "" });
        await sleep(5);
        return { ok: true, id: payload.id, play: "A9", info: info(payload.size, payload.visits, payload.moves || "") };
      }
      throw new Error("unexpected command " + command);
    },
  };

  await test("play teaching: the warning shows and announces its reason, with no extra search", async () => {
    A.setLang("en");
    for (const rec of Lib.listGames()) Lib.deleteGame(rec.id);
    state.settings = { ...P.DEFAULT_SETTINGS, lang: "en", teaching: true, showEval: false, onboarded: true, confirmMove: false };
    state.profile = PM.newProfile();
    state.engine = { kind: "katago", name: "KataGo test", available: true };
    Play.newGame({ size: 9, color: BLACK, opponentRank: 30 });
    const g = state.game;
    // B J1, W C9, B J2, W B8: now Black's B9 would have one liberty.
    for (const [x, y] of [[8, 8], [2, 0], [8, 7], [1, 1]]) assert.ok(g.game.play(x, y).ok);
    await Play.ponder();
    assert.ok(g.before, "pondered");
    const searches = requests.length;
    Play.humanPlay(1, 0);
    await until(() => g.pending, 3000, "the teaching warning");
    assert.equal(requests.length - searches, 1, "one search: the computer's own");
    assert.equal(g.pending.reason?.key, "why.warn.selfAtari");
    await until(() => state.announce, 1000, "the announcement");
    assert.match(state.announce, /This move may cost about 9 points — White can capture it at once\./);
    // The card's text (play.jsx renders warningText).
    assert.equal(warningText("8.5", g.pending.reason), "This move may cost about 8.5 points — White can capture it at once.");
    Play.teachTakeBack();
    assert.equal(g.pending, null);
  });

  await test("play teaching: the hint reads its reason off the board", async () => {
    const g = state.game;
    await until(() => !g.thinking, 2000, "idle");
    // Black to play; the engine's hint is E5, a quiet point: no reason is invented.
    await Play.askHint();
    assert.deepEqual([g.hint?.x, g.hint?.y], [4, 4]);
    assert.equal(g.hint.reason, null);
    const src = fs.readFileSync(path.join(root, "src/web/js/app/play.jsx"), "utf8");
    assert.ok(src.includes("hintText(") && src.includes("warningText("), "play.jsx shows both reasons");
  });
}
