/**
 * v7: the engine scheduler. Every KataGo search the app makes goes through
 * one of these lanes, highest first:
 *
 *   move         the computer's move, and a hint the player is waiting on
 *   interactive  what the player is looking at: the position in a review or
 *                the explorer past the book, counting at the end of a game
 *   live         pondering during play (teaching, the win-rate bar)
 *   background   batch work: whole-game review passes, the post-game
 *                summary, reports, "Analyse all"
 *
 * One search runs at a time (the host's KataGo serves one request; a new one
 * would supersede the running one). When a search ends, the next one comes
 * from the highest lane that has work queued, so nothing new from a lower
 * lane starts while higher work waits. v8: a computer's move (the move
 * lane) also pre-empts a background search that is already running: that
 * search is stopped and goes back to the front of its lane, and its caller
 * simply gets the result of the second run (a report keeps the positions it
 * has and carries on). A search is pre-emptible unless it was queued with
 * `preemptible: false` (a host that cannot cancel a search).
 *
 * Cancellation is one model everywhere: AbortSignal.
 *
 *   search(fn, { lane, signal })   queue one search; fn(signal) runs when its
 *                                  turn comes. Resolves fn's value, or null
 *                                  when the signal aborts first (a queued
 *                                  search then never runs).
 *   ownerSignal(owner)             the signal of a named owner ("game:3",
 *                                  "review:2", "reports", …). Everything
 *                                  started with it stops on cancelOwner.
 *   startJob({ kind, owner, … })   a tracked piece of background work with
 *                                  progress and a cancel, shown in Settings →
 *                                  Opponents and analysis while it runs.
 *   cancelLanes(lanes)             stop queued and running searches of those
 *                                  lanes (engine.js cancel(): the play view's
 *                                  "never mind that move").
 *   cancelAll(reason)              everything (quitting).
 *
 * Pure apart from timers; createScheduler() makes a fresh one for the tests.
 */

export const LANES = ["move", "interactive", "live", "background"];

const laneIndex = (lane) => {
  const i = LANES.indexOf(lane);
  return i >= 0 ? i : LANES.length - 1;
};

/**
 * Abort `target` (an AbortController) when any of `signals` aborts.
 * Returns the function that detaches the listeners again.
 */
export function linkSignals(target, signals) {
  const offs = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      target.abort(s.reason);
      break;
    }
    const f = () => target.abort(s.reason);
    s.addEventListener("abort", f, { once: true });
    offs.push(() => s.removeEventListener("abort", f));
  }
  return () => {
    for (const off of offs) off();
    offs.length = 0;
  };
}

/** One signal that aborts when any of `signals` does (null entries ignored). */
export function anySignal(...signals) {
  const list = signals.filter(Boolean);
  if (list.length === 1) return list[0];
  const ctl = new AbortController();
  linkSignals(ctl, list);
  return ctl.signal;
}

export function createScheduler() {
  const queues = LANES.map(() => []);
  let running = null;
  const owners = new Map();
  const jobs = new Map();
  const listeners = new Set();
  let nextJob = 0;
  let nextOwner = 0;
  let notifying = false;
  let preemptions = 0;

  function emit() {
    if (notifying) return;
    notifying = true;
    queueMicrotask(() => {
      notifying = false;
      for (const l of listeners) {
        try {
          l();
        } catch (_) {}
      }
    });
  }

  function pump() {
    if (running) return;
    for (const q of queues) {
      while (q.length) {
        const e = q.shift();
        if (e.state !== "queued") continue;
        start(e);
        return;
      }
    }
  }

  function start(e) {
    e.state = "running";
    running = e;
    // One controller per run: pre-empting stops this run only, not the entry.
    const run = new AbortController();
    const unlinkRun = linkSignals(run, [e.ctl.signal]);
    e.run = run;
    let p;
    try {
      p = Promise.resolve(e.fn(run.signal));
    } catch (err) {
      p = Promise.reject(err);
    }
    const again = () => e.preempted && !e.ctl.signal.aborted;
    p.then(
      (v) => again() || e.resolve(e.ctl.signal.aborted ? null : v),
      (err) => again() || (e.ctl.signal.aborted ? e.resolve(null) : e.reject(err)),
    ).finally(() => {
      unlinkRun();
      e.run = null;
      if (running === e) running = null;
      if (again()) {
        // Pre-empted: back to the front of its lane, to run again.
        e.preempted = false;
        e.state = "queued";
        queues[e.lane].unshift(e);
      } else {
        e.state = "done";
        e.unlink();
      }
      pump();
    });
  }

  /** v8: stop a running background search for a move; it runs again later. */
  function preempt() {
    const e = running;
    if (!e || e.lane !== LANES.length - 1 || !e.preemptible || e.preempted || !e.run) return;
    e.preempted = true;
    preemptions++;
    e.run.abort("preempted");
  }

  /** Queue one search. See the file comment. */
  function search(fn, { lane = "background", signal = null, preemptible = true } = {}) {
    const li = laneIndex(lane);
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return resolve(null);
      const ctl = new AbortController();
      const entry = { lane: li, fn, ctl, resolve, reject, state: "queued", unlink: () => {}, preemptible, preempted: false, run: null };
      ctl.signal.addEventListener(
        "abort",
        () => {
          if (entry.state !== "queued") return;
          entry.state = "done";
          const q = queues[li];
          const i = q.indexOf(entry);
          if (i >= 0) q.splice(i, 1);
          entry.unlink();
          resolve(null);
        },
        { once: true },
      );
      entry.unlink = linkSignals(ctl, [signal]);
      if (entry.state !== "queued") return;
      queues[li].push(entry);
      if (li === 0) preempt();
      pump();
    });
  }

  /**
   * A fresh owner name with a prefix ("game" → "game:4"). Unlike a fixed
   * name ("reports"), it stays cancelled: work it starts afterwards (a late
   * callback of a game that was replaced) never runs.
   */
  const unique = new Set();
  function newOwner(prefix = "owner") {
    const name = `${prefix}:${++nextOwner}`;
    unique.add(name);
    return name;
  }

  function ownerSignal(owner) {
    if (!owner) return null;
    let ctl = owners.get(owner);
    if (!ctl) {
      ctl = new AbortController();
      owners.set(owner, ctl);
    }
    return ctl.signal;
  }

  /** Cancel everything `owner` started; a fixed name can be used again afterwards. */
  function cancelOwner(owner, reason = "cancelled") {
    if (!owner) return;
    if (unique.has(owner)) {
      const sig = ownerSignal(owner);
      if (!sig.aborted) owners.get(owner).abort(reason);
      return;
    }
    const ctl = owners.get(owner);
    if (!ctl) return;
    owners.delete(owner);
    ctl.abort(reason);
  }

  function cancelLanes(lanes, reason = "cancelled") {
    const set = new Set(lanes.map(laneIndex));
    for (const li of set) for (const e of queues[li].slice()) e.ctl.abort(reason);
    if (running && set.has(running.lane)) running.ctl.abort(reason);
  }

  /**
   * A tracked job. `run(job)` starts at once; its searches go through
   * search() with `job.signal`. job.setProgress(0…1) reports progress;
   * job.cancel() aborts it. `title()` is how Settings names it; `hidden`
   * jobs (parts of a larger job) are not listed. Resolves run's value, or
   * null when cancelled or failed.
   */
  function startJob({ kind = "job", owner = null, signal = null, title = null, hidden = false, meta = {}, run }) {
    const ctl = new AbortController();
    const unlink = linkSignals(ctl, [ownerSignal(owner), signal]);
    const job = {
      id: `job${++nextJob}`,
      kind,
      owner,
      title,
      hidden,
      meta,
      progress: 0,
      detail: null,
      signal: ctl.signal,
      startedAt: Date.now(),
      cancel: (reason = "cancelled") => ctl.abort(reason),
      setProgress(p, detail = null) {
        const v = Math.max(0, Math.min(1, Number(p) || 0));
        if (v === job.progress && (detail == null || detail === job.detail)) return;
        job.progress = v;
        if (detail != null) job.detail = detail;
        emit();
      },
      promise: null,
    };
    jobs.set(job.id, job);
    ctl.signal.addEventListener("abort", emit, { once: true });
    emit();
    job.promise = (async () => {
      try {
        if (ctl.signal.aborted) return null;
        const v = await run(job);
        return ctl.signal.aborted ? null : v;
      } catch (e) {
        if (!ctl.signal.aborted) console.error(`background ${kind} failed`, e);
        return null;
      } finally {
        unlink();
        jobs.delete(job.id);
        emit();
      }
    })();
    return job;
  }

  function cancelJob(id, reason = "cancelled") {
    jobs.get(id)?.cancel(reason);
  }

  function cancelAll(reason = "quit") {
    for (const owner of [...owners.keys()]) cancelOwner(owner, reason);
    for (const job of [...jobs.values()]) job.cancel(reason);
    cancelLanes(LANES, reason);
  }

  /** The jobs running now, oldest first (hidden ones only with `all`). */
  function listJobs({ all = false } = {}) {
    return [...jobs.values()].filter((j) => all || !j.hidden);
  }

  /** What is queued and running, for the tests and the debug console. */
  function snapshot() {
    return {
      running: running ? LANES[running.lane] : null,
      queued: Object.fromEntries(LANES.map((l, i) => [l, queues[i].length])),
      preemptions,
    };
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { search, newOwner, ownerSignal, cancelOwner, cancelLanes, startJob, cancelJob, cancelAll, listJobs, snapshot, onChange };
}

/** The app's one scheduler. */
export const scheduler = createScheduler();

// Quitting (or reloading the page) stops everything; a batch keeps its
// place and resumes at the next launch (play/analysis.js).
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("pagehide", () => scheduler.cancelAll("quit"));
}
