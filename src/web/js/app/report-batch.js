/**
 * v7: a report for each of the player's games that has none, one game
 * after another, in the scheduler's background lane (so a game being
 * played never waits for it).
 *
 * v8: automatic. There is no "Analyse all" button and no list of
 * background work: a short while after launch, with KataGo there, the
 * player's own games that lack a report are analysed quietly (autoAnalyse).
 * Imported records are not: they get their report when it is opened.
 *
 * Resumable: the games still to do are saved, so a batch interrupted by
 * quitting carries on at the next launch, and a game stopped half-way keeps
 * the positions it had (report-ctl).
 *
 * state.batch = { ids, done, total, current } while it runs, else null.
 */
import * as Games from "../data/games.js";
import * as Engine from "../engine.js";
import { store } from "../data/store.js";
import { t } from "../i18n.js";
import { state, update, toast } from "./store.js";
import { queueReport, reportJob, wantsReport } from "./report-ctl.js";

/** The games still to do, in the store (data/store.js). */
export const BATCH_KEY = "batch.json";
const saveBatch = (ids) => store.put(BATCH_KEY, { ids });
const clearBatch = () => store.has(BATCH_KEY) && store.remove(BATCH_KEY);
const OWNER = "batch";

let job = null;

/** The player's games that need a report, newest first. */
export function batchCandidates(games = Games.listGames()) {
  return games.filter((rec) => wantsReport(rec)).map((rec) => rec.id);
}

/** The batch running now, or null. */
export function batchState() {
  return state.batch || null;
}

/** "Analyse all": start (or resume) the batch. */
export function analyseAll({ ids = null } = {}) {
  if (job && !job.signal.aborted) return job;
  const todo = (ids || batchCandidates()).filter((id) => Games.getGame(id));
  if (!todo.length) {
    clearBatch();
    return null;
  }
  saveBatch(todo);
  const b = { ids: todo.slice(), done: 0, total: todo.length, current: null };
  state.batch = b;
  job = Engine.sched.startJob({
    kind: "batch",
    owner: OWNER,
    title: () => t("sched.job.batch", [Math.min(b.done + 1, b.total), b.total]),
    run: (me) => runBatch(me, b),
  });
  const mine = job;
  job.promise.then(() => {
    if (job === mine) job = null;
    if (state.batch === b) state.batch = null;
    update();
  });
  update();
  return job;
}

const aborted = (signal) => new Promise((resolve) => (signal.aborted ? resolve() : signal.addEventListener("abort", () => resolve(), { once: true })));

async function runBatch(me, b) {
  while (b.ids.length) {
    if (me.signal.aborted) break;
    const id = b.ids[0];
    b.current = id;
    me.setProgress(b.done / b.total);
    update();
    const one = queueReport(id, { owner: OWNER, signal: me.signal, hidden: true });
    if (one) {
      const tick = () => me.setProgress((b.done + (one.progress || 0)) / b.total);
      const off = Engine.sched.onChange(tick);
      try {
        // A report already running on its own (the game just played) is not
        // the batch's to stop; a cancel only stops waiting for it.
        await Promise.race([one.promise, aborted(me.signal)]);
      } finally {
        off();
      }
    }
    if (me.signal.aborted) break;
    b.ids.shift();
    b.done++;
    b.current = null;
    if (b.ids.length) saveBatch(b.ids);
    else clearBatch();
    update();
  }
  if (me.signal.aborted) {
    // Quitting keeps the rest for the next launch; a cancel forgets it.
    if (me.signal.reason !== "quit") clearBatch();
    return null;
  }
  clearBatch();
  return b.done;
}

/** Stop the batch (the game being analysed keeps what it has). */
export function cancelBatch() {
  Engine.sched.cancelOwner(OWNER);
}

/** At launch: carry on with a batch that quitting interrupted. */
export function resumeBatch() {
  const saved = store.get(BATCH_KEY);
  const ids = Array.isArray(saved?.ids) ? saved.ids.filter((id) => typeof id === "string") : [];
  if (!ids.length) return null;
  const rest = ids.filter((id) => {
    const rec = Games.getGame(id);
    return rec && wantsReport(rec);
  });
  if (!rest.length) {
    clearBatch();
    return null;
  }
  return analyseAll({ ids: rest });
}

/**
 * At launch, once the engine is known: the interrupted batch, and the
 * reports of recent rated games that quitting interrupted.
 */
export function resumeBackground() {
  resumeBatch();
  for (const rec of Games.listGames().slice(0, 20)) if (rec.rating && wantsReport(rec)) queueReport(rec.id);
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => autoAnalyse(), AUTO_DELAY_MS);
}

/** How long after launch the quiet analysis of older games starts. */
export const AUTO_DELAY_MS = 20000;
let autoTimer = null;

/**
 * v8: analyse the player's own games that have no report, quietly. Only
 * with KataGo (the offline estimate of the browser preview would cost the
 * page's own thread); `offline` lets tests run it anyway.
 */
export function autoAnalyse({ offline = false } = {}) {
  if (!state.engine?.available && !offline) return null;
  if (job && !job.signal.aborted) return job;
  const ids = batchCandidates().filter((id) => Games.getGame(id)?.source === "game");
  return ids.length ? analyseAll({ ids }) : null;
}

/**
 * The batch status of a Library row: null, { queued: true } or
 * { progress } (0…1) while its report is being made.
 */
export function rowAnalysis(id) {
  const one = reportJob(id);
  if (one) return { progress: one.progress || 0 };
  const b = state.batch;
  if (b && b.ids.includes(id)) return { queued: true };
  return null;
}
