/**
 * v6 report: the controller.
 *
 * state.report = { recordId, space, status, progress, model, error }
 *   status   "analyzing" (our own whole-game pass), "waiting" (the post-game
 *            analysis of the game just played is still running; its
 *            progress is read from state.game.summary), "done", "missing"
 *   model    report-model.js buildReport(), also stored in the library
 *            record as rec.report so that reopening is instant.
 *
 * v7: every report analysis is a background job of the engine scheduler
 * (scheduler.js, queueReport), one per record. Who owns it decides what
 * stops it: a rated game's report belongs to "reports" and is made in the
 * background when the game ends, so opening it is instant; "Analyse all"
 * (report-batch.js) owns its own; any other report the player opens
 * belongs to that page, and closing the page cancels it. Positions already
 * analysed are kept (notePoints), so a cancelled report resumes where it
 * stopped. Opening a key moment opens the review of the game at that move;
 * the analysis made for the report is handed to the review so it opens at
 * once.
 */
import { BLACK } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Lib from "../library.js";
import * as Engine from "../engine.js";
import { t } from "../i18n.js";
import { addMistake, readJSON, writeJSON } from "../persist.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeBinaryFile } from "../host.js";
import { state, update, toast } from "./store.js";
import { back, canGoBack, remember, isRestoring } from "./ctl-core.js";
import { analyzeLine, openReview, reviewGoto } from "./review-ctl.js";
import { learnFromGame, reviewCurrentGame, saveToLibrary } from "./play-ctl.js";
import { openMistakeDrill } from "./practice-ctl.js";
import { REPORT_VERSION, buildReport, lineKey, reportDrills, reportFits } from "./report-model.js";

/** recordId → the scheduler job making its report. */
const jobs = new Map();
/** recordId → the last analysis made for a report (kept in memory only). */
const analyses = new Map();
/**
 * recordId → positions analysed so far (the post-game summary's, or a
 * stopped report's), with the main line they belong to ({ key, points }):
 * a record edited since (a variation promoted in the review) no longer
 * matches and its positions are not reused.
 */
const handed = new Map();
const handedPoints = (recordId, game) => {
  const h = handed.get(recordId);
  return h && h.key === lineKey(game) ? h.points : null;
};
/** The owner of the report page's own job (cancelled when the page closes). */
let pageOwner = null;

/** v7: positions of a record analysed elsewhere (the post-game summary), for its report. */
export function notePoints(recordId, points, game) {
  if (recordId && Array.isArray(points) && game) handed.set(recordId, { key: lineKey(game), points });
}

/** The running report job of a record, if any. */
export function reportJob(recordId) {
  const job = jobs.get(recordId);
  return job && !job.signal.aborted ? job : null;
}

/** A record whose stored report is current (an estimate is redone once KataGo is there). */
function reportCurrent(rec, game) {
  return reportFits(rec.report, game) && !(rec.report.confidence !== "high" && state.engine.available);
}

/**
 * v8: a one-time check, a few games at a time when the app is idle, that
 * drops stored reports that no longer fit their game. Since v7 saving an
 * edit drops such a report, but one stored before v7 for a game edited
 * later stays, and wantsReport() (which does not parse the game) would skip
 * that game for ever. Resolves the number dropped; once it has finished it
 * is not run again (REPORTS_CHECKED_KEY).
 */
export const REPORTS_CHECKED_KEY = "goban-studio.reportsChecked.v8";
const idle = () =>
  new Promise((resolve) => (typeof globalThis.requestIdleCallback === "function" ? globalThis.requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 0)));
let staleCheck = null;
export function dropStaleReports({ chunk = 10, wait = idle, force = false } = {}) {
  if (staleCheck) return staleCheck;
  if (!force && readJSON(REPORTS_CHECKED_KEY, null)) return Promise.resolve(0);
  staleCheck = (async () => {
    let dropped = 0;
    const ids = Lib.listGames()
      .filter((rec) => rec.report)
      .map((rec) => rec.id);
    for (let i = 0; i < ids.length; i += chunk) {
      await wait();
      // One read of the library per chunk; each game is checked and, if
      // need be, patched without waiting in between (nothing can write it
      // meanwhile).
      const byId = new Map(Lib.listGames().map((rec) => [rec.id, rec]));
      for (const id of ids.slice(i, i + chunk)) {
        const rec = byId.get(id);
        if (!rec?.report || jobs.has(id)) continue;
        let game = null;
        try {
          game = loadSGF(rec.sgf).game;
        } catch (_) {
          continue;
        }
        if (reportFits(rec.report, game)) continue;
        Lib.patchGame(id, { report: null });
        dropped++;
      }
    }
    writeJSON(REPORTS_CHECKED_KEY, { v: 1, at: Date.now(), dropped });
    return dropped;
  })().finally(() => {
    staleCheck = null;
  });
  return staleCheck;
}

/** Cheap check without parsing the game: it may need a report. */
export function wantsReport(rec) {
  if (!hasReport(rec)) return false;
  const r = rec.report;
  return !r || r.v !== REPORT_VERSION || (r.confidence !== "high" && state.engine.available);
}

/** The opponent as a job title names it. */
function gameTitle(rec) {
  if (rec.opponent === "ai" && rec.strength) {
    const r = Engine.rankParts(rec.strength);
    return t("sched.job.game", [t(r.unit === "kyu" ? "rank.kyu" : "rank.dan", [r.n])]);
  }
  return t("sched.job.report");
}

/**
 * v7: make the report of a record in the background (scheduler background
 * lane). Returns the job (the running one if there is one), or null when
 * the record needs none. `owner` is who may cancel it; `signal` a parent's
 * (a batch); `hidden` keeps it out of the Settings list (a batch lists
 * itself).
 */
export function queueReport(recordId, { owner = "reports", signal = null, hidden = false, any = false } = {}) {
  const have = reportJob(recordId);
  if (have) return have;
  const found = recordOf(recordId);
  if (!found || (!any && !hasReport(found.rec)) || reportCurrent(found.rec, found.game)) return null;
  const { rec, game } = found;
  const job = Engine.sched.startJob({
    kind: "report",
    owner,
    signal,
    hidden,
    title: () => gameTitle(rec),
    meta: { recordId },
    run: (job) => analyse(recordId, game, humanColorOf(rec), job),
  });
  jobs.set(recordId, job);
  job.promise.then((model) => {
    if (jobs.get(recordId) === job) jobs.delete(recordId);
    reportDone(recordId, model);
    update();
  });
  update();
  return job;
}

/** A report job ended: show it if its page is open. */
function reportDone(recordId, model) {
  const r = state.report;
  if (!r || r.recordId !== recordId) return;
  if (model) {
    r.model = model;
    r.status = "done";
  } else if (reportJob(recordId)) return;
  else r.status = r.model ? "done" : "stopped";
}

/** Games that get a report: played here (not imported), long enough to analyse. */
export function hasReport(rec) {
  return !!rec && rec.source !== "import" && (rec.moves || 0) >= 8;
}

function recordOf(id) {
  const rec = Lib.getGame(id);
  if (!rec) return null;
  try {
    return { rec, game: loadSGF(rec.sgf).game };
  } catch (_) {
    return null;
  }
}

const humanColorOf = (rec) => (rec.opponent === "ai" ? (rec.humanColor === -1 ? -1 : 1) : null);

/** The game in play is this record. */
const liveGame = (id) => (state.game && state.game.recordId === id ? state.game : null);

export function openReport(recordId, { space = state.space } = {}) {
  const found = recordOf(recordId);
  if (!found) {
    toast(t("report.missing"), "warn");
    return;
  }
  if (!isRestoring()) remember();
  const { rec, game } = found;
  const stored = reportFits(rec.report, game) ? rec.report : null;
  // An estimate is redone once KataGo is there.
  const redo = stored && stored.confidence !== "high" && state.engine.available;
  if (state.report && state.report.recordId !== recordId) cancelPage();
  update((s) => {
    s.report = { recordId, space, status: stored && !redo ? "done" : "analyzing", progress: 0, model: stored, error: null };
    s.menu = null;
    s.sheet = null;
  });
  if (stored && !redo) return;
  // A report made in the background (a rated game, "Analyse all") keeps its
  // owner; any other belongs to this page.
  let job = reportJob(recordId);
  if (!job) {
    const owner = rec.rating ? "reports" : (pageOwner = pageOwner || Engine.sched.newOwner("report"));
    job = queueReport(recordId, { owner, any: true });
  }
  if (!job) {
    state.report.status = stored ? "done" : "stopped";
    update();
  }
}

/** v7: stop the report page's own analysis (closing it). */
function cancelPage() {
  if (!pageOwner) return;
  Engine.sched.cancelOwner(pageOwner);
  pageOwner = null;
}

/** Analyse the report on screen again after it was stopped. */
export function retryReport() {
  const r = state.report;
  if (!r) return;
  r.status = "analyzing";
  openReport(r.recordId, { space: r.space });
}

const aborted = (signal) => new Promise((resolve) => (signal.aborted ? resolve() : signal.addEventListener("abort", () => resolve(), { once: true })));

async function analyse(recordId, game, humanColor, job) {
  const setProgress = (p, status = "analyzing") => {
    job.setProgress(p);
    const r = state.report;
    if (r && r.recordId === recordId) {
      r.progress = p;
      r.status = status;
      update();
    }
  };
  const n = game.mainLine().length;
  let points = null;
  let refined = null;
  // The game just played: its post-game analysis may be running, or done.
  const g = liveGame(recordId);
  if (g?.summaryJob && g.summary?.status === "analyzing") {
    setProgress(g.summary.progress || 0, "waiting");
    const poll = setInterval(() => g.summary?.status === "analyzing" && setProgress(g.summary.progress || 0, "waiting"), 250);
    try {
      await Promise.race([g.summaryJob, aborted(job.signal)]);
    } catch (_) {}
    clearInterval(poll);
    if (job.signal.aborted) return null;
  }
  if (g?.analysis?.length === n && g.analysis.every(Boolean)) points = g.analysis;
  // Positions analysed by the post-game summary, or by a report that was stopped.
  const known = handedPoints(recordId, game);
  if (!points && known?.length === n && known.every(Boolean)) points = known;
  // A review of this record that has finished its pass.
  const rv = state.review;
  if (!points && rv && rv.meta.recordId === recordId && !rv.analyzing && rv.points.length === n && rv.points.every(Boolean)) {
    points = rv.points;
    refined = rv.refined;
  }
  // With KataGo here, positions that fell back to the offline estimate are
  // analysed again; only KataGo's own analyses are reused.
  let existing = null;
  if (points && state.engine.available && points.some((p) => p.source !== "katago")) {
    existing = points.map((p) => (p.source === "katago" ? p : null));
    points = null;
    refined = null;
  }
  // A partial analysis: keep what fits (KataGo's own, or anything offline).
  if (!points && !existing && known?.length === n && known.some(Boolean)) {
    existing = known.map((p) => (p && (p.source === "katago" || !state.engine.available) ? p : null));
  }
  if (!points) {
    const size = game.size;
    const partial = existing ? existing.slice() : new Array(n).fill(null);
    handed.set(recordId, { key: lineKey(game), points: partial });
    points = await analyzeLine(game, {
      existing,
      signal: job.signal,
      visits: size === 19 ? 40 : size === 13 ? 56 : 80,
      onPoint: (i, p) => {
        partial[i] = p;
      },
      onProgress: (k, total) => {
        if (k % 4 === 0 || k === total) setProgress(k / total);
      },
    });
  }
  if (!points) return null;
  handed.delete(recordId);
  analyses.set(recordId, points);
  let model;
  try {
    model = buildReport({ game, points, humanColor, refined });
  } catch (e) {
    console.error("report failed", e);
    return null;
  }
  // Store it with the game unless the record changed meanwhile.
  const now = recordOf(recordId);
  if (now && reportFits(model, now.game)) Lib.patchGame(recordId, { report: model });
  // v7: a rated game whose post-game summary a new game cancelled: fill in
  // what the summary would have (trend record, weaknesses, drills), once.
  if (now?.rec.rating && humanColor != null && !now.rec.learned && points.every((p) => p?.source === "katago")) {
    learnFromGame({ game, points, humanColor, recordId });
  }
  return model;
}

/** Progress 0…1 of the report on screen. */
export function reportProgress() {
  const r = state.report;
  if (!r) return 0;
  if (r.status === "waiting") return liveGame(r.recordId)?.summary?.progress ?? r.progress;
  return reportJob(r.recordId)?.progress ?? r.progress;
}

/**
 * v7: the rating change of the game on screen, from its record
 * ({ before: { rank, pm }, after: { rank, pm } }, saved when a rated game
 * ends), or null.
 */
export function reportRating() {
  const r = state.report;
  const rec = r && Lib.getGame(r.recordId);
  const rt = rec?.rating;
  return rt?.before && rt?.after && Number.isFinite(rt.before.rank) && Number.isFinite(rt.after.rank) ? rt : null;
}

/** The report page is what the current place shows. */
export function reportVisible() {
  const r = state.report;
  if (!r || r.space !== state.space) return false;
  if (state.review && (state.review.meta.space || "play") === state.space) return false;
  // In Play the report belongs to the game that just ended.
  if (r.space === "play" && state.game?.recordId !== r.recordId) return false;
  return true;
}

export function closeReport() {
  if (canGoBack() && back()) return;
  cancelPage();
  update((s) => {
    s.report = null;
  });
}

/** Leave the report without touching history (restore, goSpace). */
export function dropReport() {
  cancelPage();
  state.report = null;
}

/** Back/forward: put the report back where a history entry says it was. */
export function restoreReport(loc) {
  // Coming back to the same report keeps its analysis going.
  if (!loc?.report?.recordId || loc.report.recordId !== state.report?.recordId) cancelPage();
  state.report = null;
  if (loc?.report?.recordId) openReport(loc.report.recordId, { space: loc.report.space });
}

/** From the result card: the report of the game that just ended. */
export function openCurrentReport() {
  const g = state.game;
  if (!g) return;
  if (!g.recordId || !Lib.getGame(g.recordId)) {
    // Saved quietly at the end of every game; save now if that failed.
    const rec = saveToLibrary({ quiet: true });
    if (rec) openReport(rec.id, { space: "play" });
    return;
  }
  openReport(g.recordId, { space: "play" });
}

/** A key moment: the review of the game at that move. */
export function openReportMove(index) {
  const r = state.report;
  if (!r) return;
  const g = liveGame(r.recordId);
  if (r.space === "play" && g) {
    // remember() inside the review captures this page, so Back returns here.
    reviewCurrentGame();
  } else {
    const found = recordOf(r.recordId);
    if (!found) return;
    const { rec, game } = found;
    const points = analyses.get(r.recordId);
    openReview(game, {
      source: "record",
      recordId: rec.id,
      name: rec.name,
      humanColor: humanColorOf(rec),
      space: r.space,
      back: r.space,
      startAt: index,
      points: points && points.length === game.mainLine().length ? points : null,
    });
  }
  state.report = null;
  if (state.review) {
    reviewGoto(index);
    state.review.focus = index;
  }
  update();
}

/** The whole game in review, from its start. */
export function openReportReview() {
  openReportMove(0);
}

/** The drills this report can add, and the ones already in practice. */
/** In a game between two people: whose mistakes to practise (BLACK / WHITE). */
export function reportDrillColor() {
  const r = state.report;
  if (!r?.model || r.model.humanColor != null) return null;
  return r.drillColor ?? BLACK;
}

export function setReportDrillColor(color) {
  if (!state.report) return;
  state.report.drillColor = color;
  update();
}

export function reportPractice() {
  const r = state.report;
  if (!r?.model) return { add: [], have: [] };
  const rec = Lib.getGame(r.recordId);
  if (!rec) return { add: [], have: [] };
  return reportDrills(r.model, { sgf: rec.sgf, gameKey: rec.id, existing: state.progress.mistakes, color: reportDrillColor() });
}

/** "Practise this game": add the worst mistakes as drills and start the first. */
export function practiseReport() {
  const { add, have } = reportPractice();
  for (const m of add) addMistake(state.progress, m);
  const first = add[0]?.id || have[0];
  if (!first) return;
  if (add.length) toast(t("report.added", [add.length]));
  // The drill remembers this page, so Back returns to the report.
  openMistakeDrill(first);
  state.report = null;
  update();
}

/* ---------------------------------------------------------- export */

/** Save the report as a PNG: the native save dialog, or a download. */
export async function exportReportImage() {
  const r = state.report;
  if (!r?.model) return;
  update({ menu: null });
  const { renderReportPNG } = await import("./report-draw.js");
  const rec = Lib.getGame(r.recordId);
  const day = new Date(rec?.updatedAt || Date.now()).toISOString().slice(0, 10);
  const filename = `goban-studio-report-${day}.png`;
  const blob = await renderReportPNG(r.model, { date: rec?.updatedAt || r.model.at, rating: reportRating() });
  if (!blob) return toast(t("report.exportFailed"), "warn");
  if (hasNative() && hasFileDialogs()) {
    const path = await saveFileDialog({ title: t("report.exportImage"), defaultName: filename });
    if (path == null || (Array.isArray(path) && path.length === 0)) return;
    const chosen = normalizePaths(path)[0];
    if (chosen && (await writeBinaryFile(chosen, new Uint8Array(await blob.arrayBuffer())))) {
      revealPath(chosen);
      toast(t("report.exported"));
    } else toast(t("report.exportFailed"), "warn");
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("report.exported"));
}
