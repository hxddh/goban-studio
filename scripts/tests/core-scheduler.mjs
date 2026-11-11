/**
 * Core: the engine scheduler. Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 *
 * The engine scheduler (src/web/js/scheduler.js) on its own: lanes,
 * pre-emption, owners and jobs. How the app's analyses use it (a new
 * game's computer move never waits for the last game's analysis, the
 * quiet pass over older games) is in play-analysis.mjs.
 */
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  await test("core scheduler: higher lanes run first; a running search is never killed for them", async () => {
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
    // The move pre-empts the running background search, which runs again.
    assert.deepEqual(log, ["bg0", "move", "look", "live", "bg0", "bg1", "bg2", "bg3", "bg4"]);
    assert.equal(out[0], "bg0", "the pre-empted background search still resolves its value");
  });

  await test("core scheduler: an aborted search never runs; owners, lanes and jobs cancel", async () => {
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

  await test("core scheduler: a move pre-empts a running background search, which runs again and resolves", async () => {
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

  await test("core scheduler: strings in four languages; no old serial chain or tokens left", async () => {
    const { MESSAGES } = await import("../../src/web/js/messages.js");
    const holes = (v) => [...v.matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join();
    const sched = Object.entries(MESSAGES).filter(([k]) => k.startsWith("sched."));
    assert.ok(sched.length >= 1, "the background-work strings");
    for (const [k, v] of sched) {
      for (const lang of ["zh", "en", "ko", "ja"]) {
        assert.ok(v[lang]?.trim(), `${k} ${lang}`);
        assert.equal(holes(v[lang]), holes(v.en), `${k} ${lang}`);
      }
    }
    const src = (f) => fs.readFileSync(path.join(root, f), "utf8");
    const engine = src("src/web/js/engine.js");
    assert.doesNotMatch(engine, /function queued\(/);
    for (const f of ["src/web/js/app/review-ctl.js", "src/web/js/app/play-ctl.js", "src/web/js/play/analysis.js"]) {
      assert.doesNotMatch(src(f), /\.cancelled\b|summaryToken/, f);
    }
  });
}
