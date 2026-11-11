/**
 * Core: the engine and cancellation — a cancelled search is not a failure of the stronger network,
 * starts no second search for the abandoned position and produces no offline move; the stronger
 * network comes back after failures.
 *
 * A fake native host stands in for KataGo (this file has a process of its own).
 */
import { test, Game, assert } from "./helpers.mjs";
import * as Engine from "../../src/web/js/engine.js";
import { createScheduler } from "../../src/web/js/scheduler.js";

const searches = []; // every search the host was asked for: { id, engine, moves }
const open = new Map();
/** What the host does with a search: "answer" after `delay` ms, or "fail" (the process is gone). */
const host = { delay: 60, mode: () => "answer" };
globalThis.zero = {
  on() {},
  invoke(cmd, p) {
    if (cmd === "studio.katagoStatus") return Promise.resolve({ available: true, async: true, stream: true, models: true, version: "fake" });
    if (cmd === "studio.katagoAnalyzeAsync") {
      const engine = p.engine || "standard";
      searches.push({ id: p.id, engine, moves: (p.moves || []).length });
      if (host.mode(engine) === "fail") return Promise.resolve({ ok: false });
      return new Promise((resolve) => {
        open.set(p.id, resolve);
        setTimeout(() => {
          open.delete(p.id);
          resolve({ ok: true, play: "D4", info: "info move D4 visits 10 winrate 0.5 scoreLead 0 prior 0.1 order 0 pv D4" });
        }, host.delay);
      });
    }
    if (cmd === "studio.katagoCancel") {
      for (const [id, resolve] of open) {
        resolve({ ok: false });
        open.delete(id);
      }
      return Promise.resolve({});
    }
    return Promise.resolve(null);
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = () => assert.deepEqual(Engine.sched.snapshot().running, null);
const reset = (models) => {
  searches.length = 0;
  host.delay = 60;
  host.mode = () => "answer";
  Engine.setModels({ strong: false, human: false });
  Engine.setModels(models);
};

await test("scheduler: search() tells a cancelled search from one that came back empty", async () => {
  const s = createScheduler();
  // An answer of null from the search itself is not a cancellation.
  const empty = {};
  assert.equal(await s.search(async () => null, { lane: "move", status: empty }), null);
  assert.equal(empty.cancelled, undefined);
  // cancelLanes on a running search.
  const running = {};
  const p = s.search(() => wait(40).then(() => "late"), { lane: "move", status: running });
  await wait(5);
  s.cancelLanes(["move"]);
  assert.equal(await p, null);
  assert.equal(running.cancelled, true);
  // The caller's signal, on a queued search that then never runs.
  const ctl = new AbortController();
  let ran = false;
  const first = s.search(() => wait(20), { lane: "move" });
  const queued = {};
  const q = s.search(async () => (ran = true), { lane: "move", signal: ctl.signal, status: queued });
  ctl.abort();
  assert.equal(await q, null);
  await first;
  await wait(5);
  assert.equal(ran, false);
  assert.equal(queued.cancelled, true);
  // A signal that is already aborted.
  const before = {};
  assert.equal(await s.search(async () => 1, { lane: "move", signal: ctl.signal, status: before }), null);
  assert.equal(before.cancelled, true);
  // A pre-empted background search runs again and is not cancelled.
  const bg = {};
  let runs = 0;
  const b = s.search((sig) => new Promise((res) => { runs++; const t = setTimeout(() => res("done"), 30); sig.addEventListener("abort", () => { clearTimeout(t); res(null); }); }), { lane: "background", status: bg });
  await wait(5);
  await s.search(async () => "move", { lane: "move" });
  assert.equal(await b, "done");
  assert.equal(runs, 2);
  assert.equal(bg.cancelled, undefined);
});

for (const [name, models, rank] of [["standard", {}, "first"], ["human-style", { strong: true, human: true }, "last"], ["strong", { strong: true }, "last"]]) {
  await test(`engine decide(): cancelled while the ${name} search runs, it stops there`, async () => {
    reset(models);
    const ladder = Engine.currentLadder();
    const opp = { rank: (rank === "first" ? ladder[0] : ladder.at(-1)).label };
    const game = new Game({ size: 13 });
    game.play(3, 3);
    const signal = Engine.sched.ownerSignal(Engine.sched.newOwner("game"));
    const node = game.current;
    const t0 = performance.now();
    const p = Engine.decide(game, opp, { signal, node });
    await wait(15);
    assert.equal(searches.length, 1, "the search is running");
    // What the play view does on Undo: cancel, then take the move back.
    Engine.cancel();
    game.undo();
    const r = await p;
    assert.equal(r.move, null);
    assert.equal(r.analysis, null);
    assert.equal(r.cancelled, true);
    assert.notEqual(r.mode, "offline", "no offline move for the abandoned position");
    assert.ok(performance.now() - t0 < host.delay, "it did not wait for another search");
    await wait(host.delay + 20);
    assert.equal(searches.length, 1, "no fallback search was started after the cancel");
    idle();
    assert.equal(Engine.modelsState().strongUsable, !!models.strong);
    // chooseMove() gives no move either.
    const again = Engine.chooseMove(game, opp, { signal });
    await wait(15);
    Engine.cancel();
    assert.equal(await again, null);
  });
}

await test("engine decide(): the caller's signal aborted is a cancellation too", async () => {
  reset({});
  const game = new Game({ size: 9 });
  const owner = Engine.sched.newOwner("game");
  const p = Engine.decide(game, { rank: Engine.currentLadder()[0].label }, { signal: Engine.sched.ownerSignal(owner) });
  await wait(15);
  Engine.sched.cancelOwner(owner);
  const r = await p;
  assert.deepEqual([r.move, r.cancelled], [null, true]);
  await wait(host.delay + 20);
  assert.equal(searches.length, 1);
  // Not cancelled: the move arrives as before, without the flag.
  const ok = await Engine.decide(game, { rank: Engine.currentLadder()[0].label }, {});
  assert.ok(ok.move && !ok.move.pass);
  assert.equal(ok.cancelled, undefined);
  assert.equal(ok.mode, "standard");
});

await test("engine: hints cancelled by Undo do not count against the stronger network", async () => {
  reset({ strong: true });
  const game = new Game({ size: 9 });
  const signal = Engine.sched.ownerSignal(Engine.sched.newOwner("game"));
  assert.equal(Engine.analysisEngine(), "strong");
  for (let k = 0; k < 4; k++) {
    game.play(2 + k, 2);
    const p = Engine.hint(game, { signal });
    await wait(15);
    Engine.cancel();
    game.undo();
    assert.equal(await p, null, "no hint for a position that is gone");
  }
  await wait(host.delay + 20);
  assert.deepEqual(searches.map((s) => s.engine), ["strong", "strong", "strong", "strong"], "no standard search behind a cancelled one");
  assert.equal(Engine.modelsState().strongUsable, true);
  assert.equal(Engine.analysisEngine(), "strong");
  const h = await Engine.hint(game, { signal });
  assert.equal(h.source, "katago");
  assert.equal(searches.at(-1).engine, "strong");
  // Cancelled without the board moving: still no offline guess.
  const p = Engine.hint(game, { signal });
  await wait(15);
  Engine.cancel();
  assert.equal(await p, null);
  // Evaluations and live analysis, likewise.
  const e = Engine.evaluate(game, { signal });
  await wait(15);
  Engine.cancel();
  assert.equal(await e, null);
  assert.equal(Engine.modelsState().strongUsable, true);
});

await test("engine: the stronger network rests after two real failures, and comes back", async () => {
  reset({ strong: true });
  const game = new Game({ size: 9 });
  game.play(4, 4);
  // One failure, then an answer: the count starts again.
  host.mode = (engine) => (engine === "strong" ? "fail" : "answer");
  assert.ok(await Engine.evaluate(game), "the standard network answered instead");
  assert.deepEqual(searches.map((s) => s.engine), ["strong", "standard"]);
  assert.equal(Engine.modelsState().strongUsable, true);
  host.mode = () => "answer";
  assert.ok(await Engine.evaluate(game));
  assert.equal(searches.at(-1).engine, "strong");
  host.mode = (engine) => (engine === "strong" ? "fail" : "answer");
  assert.ok(await Engine.evaluate(game));
  assert.equal(Engine.modelsState().strongUsable, true, "one failure after a success is one failure");
  // A second failure in a row: the standard network is used from here on.
  assert.ok(await Engine.evaluate(game));
  assert.equal(Engine.modelsState().strongUsable, false);
  assert.equal(Engine.analysisEngine(), "standard");
  assert.deepEqual(Engine.installed(), { human: false, strong: false });
  searches.length = 0;
  assert.ok(await Engine.evaluate(game));
  assert.deepEqual(searches.map((s) => s.engine), ["standard"]);
  // Later it is tried again…
  const later = Date.now() + Engine.STRONG_RETRY_MS + 1;
  assert.equal(Engine.modelsState(later - 2000).strongUsable, false);
  assert.equal(Engine.modelsState(later).strongUsable, true);
  const realNow = Date.now;
  Date.now = () => realNow() + Engine.STRONG_RETRY_MS + 1000;
  try {
    assert.equal(Engine.analysisEngine(), "strong");
    // …and if it still fails, it rests again.
    searches.length = 0;
    assert.ok(await Engine.evaluate(game));
    assert.deepEqual(searches.map((s) => s.engine), ["strong", "standard"]);
    assert.equal(Engine.modelsState().strongUsable, false);
    Date.now = () => realNow() + 2 * Engine.STRONG_RETRY_MS + 2000;
    // If it answers, it is back for good.
    host.mode = () => "answer";
    assert.equal(Engine.modelsState().strongUsable, true);
    assert.ok(await Engine.evaluate(game));
    assert.equal(searches.at(-1).engine, "strong");
  } finally {
    Date.now = realNow;
  }
  assert.equal(Engine.modelsState().strongUsable, true, "an answer cleared the failures");
  assert.equal(Engine.analysisEngine(), "strong");
});

await test("engine decide(): a strong opponent that fails falls back, counts as a failure, and recovers", async () => {
  reset({ strong: true });
  const game = new Game({ size: 9 });
  game.play(4, 4);
  const opp = { rank: Engine.currentLadder().at(-1).label };
  assert.equal(Engine.resolveOpponent(opp).kind, "strong");
  host.mode = (engine) => (engine === "strong" ? "fail" : "answer");
  const a = await Engine.decide(game, opp, {});
  assert.equal(a.mode, "standard");
  assert.ok(a.move);
  assert.equal(Engine.modelsState().strongUsable, true);
  host.mode = () => "answer";
  const b = await Engine.decide(game, opp, {});
  assert.equal(b.mode, "strong");
  host.mode = (engine) => (engine === "strong" ? "fail" : "answer");
  await Engine.decide(game, opp, {});
  assert.equal(Engine.modelsState().strongUsable, true, "the success in between cleared the first failure");
});
