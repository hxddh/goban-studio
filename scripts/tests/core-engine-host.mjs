/**
 * Core: the engine against a host that behaves like src/main.zig submitJob — one KataGo job at
 * a time, and a new request supersedes the running one, which is answered
 * `{ ok: false, cancelled: true }`. The reading of the player's moves by rank goes through the
 * scheduler and never cuts into a search; a search the host superseded is asked again, and is
 * never a failure of the stronger network nor a reason for an offline move.
 *
 * A fake native host stands in for KataGo (this file has a process of its own).
 */
import { test, Game, assert, BLACK } from "./helpers.mjs";
import * as Engine from "../../src/web/js/engine.js";

const INFO = "info move D4 visits 10 winrate 0.5 scoreLead 0 prior 0.1 order 0 pv D4";
const log = []; // every job the host was given: { kind, id, engine }
const cancels = [];
let running = null;
/** delay: ms per kind; supersede(kind, payload): answer this request `cancelled` at once. */
const host = { delay: { analyze: 40, policy: 40 }, supersede: () => false };

function submit(kind, p, answer) {
  log.push({ kind, id: p.id, engine: p.engine || "standard" });
  if (running) {
    // The host's submitJob: the running job is superseded.
    clearTimeout(running.timer);
    running.resolve({ ok: false, id: running.id, cancelled: true });
    running = null;
  }
  if (host.supersede(kind, p)) return Promise.resolve({ ok: false, id: p.id, cancelled: true });
  return new Promise((resolve) => {
    const job = { id: p.id, resolve };
    job.timer = setTimeout(() => {
      if (running === job) running = null;
      resolve(answer);
    }, host.delay[kind]);
    running = job;
  });
}

globalThis.zero = {
  on() {},
  invoke(cmd, p) {
    if (cmd === "studio.katagoStatus") return Promise.resolve({ available: true, async: true, stream: true, models: true, humanPolicy: true, version: "fake" });
    if (cmd === "studio.katagoAnalyzeAsync") return submit("analyze", p, { ok: true, id: p.id, engine: p.engine || "standard", play: "D4", info: INFO });
    if (cmd === "studio.katagoHumanPolicy") return submit("policy", p, { ok: true, id: p.id, moves: [{ index: 0, p: { rank_10k: 0.25 } }] });
    if (cmd === "studio.katagoCancel") {
      cancels.push(p.id);
      if (running && (!p.id || running.id === p.id)) {
        clearTimeout(running.timer);
        running.resolve({ ok: false, id: running.id, cancelled: true });
        running = null;
      }
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve(null);
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const kinds = () => log.map((j) => (j.kind === "analyze" ? j.engine : j.kind));
function reset(models = {}) {
  log.length = 0;
  cancels.length = 0;
  host.delay = { analyze: 40, policy: 40 };
  host.supersede = () => false;
  Engine.setModels({ strong: false, human: false });
  Engine.setModels(models);
}
function position() {
  const game = new Game({ size: 9 });
  for (const [x, y] of [[4, 4], [2, 2], [6, 6], [2, 6]]) game.play(x, y);
  return game;
}
const strongOpp = () => ({ rank: Engine.currentLadder().at(-1).label });
const firstOpp = () => ({ rank: Engine.currentLadder()[0].label });

await test("engine host: the reading of the player's moves asked while the computer's move is searched waits; the move is KataGo's", async () => {
  reset({ strong: true });
  const game = position();
  assert.equal(Engine.resolveOpponent(strongOpp()).kind, "strong");
  const move = Engine.decide(game, strongOpp(), {});
  await wait(5);
  const reading = Engine.humanPolicy(game, BLACK, ["rank_10k"]);
  const r = await move;
  assert.equal(r.mode, "strong", "the move came from the search it asked for");
  assert.ok(r.move && !r.cancelled);
  assert.deepEqual(await reading, [{ index: 0, p: { rank_10k: 0.25 } }]);
  assert.deepEqual(kinds(), ["strong", "policy"], "the reading reached the host after the move, and nothing was searched twice");
  assert.equal(Engine.modelsState().strongUsable, true);
});

await test("engine host: the reading gives way to a move and to the position on screen, and is asked again", async () => {
  reset({});
  const game = position();
  host.delay.policy = 100;
  const reading = Engine.humanPolicy(game, BLACK, ["rank_10k"]);
  await wait(10);
  const r = await Engine.decide(game, firstOpp(), {});
  assert.equal(r.mode, "standard");
  assert.ok(r.move);
  assert.deepEqual(await reading, [{ index: 0, p: { rank_10k: 0.25 } }]);
  assert.deepEqual(kinds(), ["policy", "standard", "policy"]);
  assert.equal(cancels[0], log[0].id, "the reading was stopped by its own id");
  // The review's position on screen (the interactive lane) goes first too.
  reset({});
  host.delay.policy = 100;
  const again = Engine.humanPolicy(game, BLACK, ["rank_10k"]);
  await wait(10);
  assert.ok(await Engine.live(game, game.current, { visits: 20 }));
  assert.ok(await again);
  assert.deepEqual(kinds(), ["policy", "standard", "policy"]);
  // A cancelled reading is just null, and is not asked again.
  reset({});
  const ctl = new AbortController();
  const dropped = Engine.humanPolicy(game, BLACK, ["rank_10k"], { signal: ctl.signal });
  await wait(10);
  ctl.abort();
  assert.equal(await dropped, null);
  await wait(60);
  assert.deepEqual(kinds(), ["policy"]);
});

await test("engine host: a search the host superseded is asked again; it is no failure of the stronger network", async () => {
  reset({ strong: true });
  const game = position();
  for (let k = 0; k < 3; k++) {
    log.length = 0;
    let first = true;
    host.supersede = (kind) => kind === "analyze" && first && !(first = false);
    const r = await Engine.decide(game, strongOpp(), {});
    assert.equal(r.mode, "strong", "the computer's move is the stronger network's, not a fallback");
    assert.ok(r.move);
    assert.deepEqual(kinds(), ["strong", "strong"]);
    assert.equal(Engine.modelsState().strongUsable, true);
  }
  // Review analysis likewise: an answer, not an empty position.
  let first = true;
  host.supersede = (kind) => kind === "analyze" && first && !(first = false);
  const p = await Engine.analyzeNode(game, game.current, 20);
  assert.equal(p?.source, "katago");
  assert.equal(Engine.analysisEngine(), "strong");
});

await test("engine host: a search that keeps being superseded is reported cancelled: no offline move, no failure, no estimate", async () => {
  reset({ strong: true });
  const game = position();
  host.supersede = () => true;
  for (let k = 0; k < 2; k++) {
    log.length = 0;
    const r = await Engine.decide(game, strongOpp(), {});
    assert.deepEqual([r.move, r.cancelled, r.superseded], [null, true, true]);
    assert.notEqual(r.mode, "offline");
    assert.equal(log.length, Engine.SUPERSEDED_RETRIES + 1, "asked again a few times, then given up");
  }
  assert.equal(Engine.modelsState().strongUsable, true, "two superseded searches are not two failures");
  assert.equal(await Engine.chooseMove(game, strongOpp(), {}), null, "no offline move behind it either");
  const status = {};
  assert.equal(await Engine.analyzeNode(game, game.current, 20, { status }), null);
  assert.equal(status.stopped, true, "the review is told the search was stopped, so it stores no estimate");
  assert.equal(await Engine.humanPolicy(game, BLACK, ["rank_10k"]), null);
  // Answering again, it plays.
  host.supersede = () => false;
  assert.ok((await Engine.decide(game, strongOpp(), {})).move);
  assert.equal(Engine.modelsState().strongUsable, true);
});
