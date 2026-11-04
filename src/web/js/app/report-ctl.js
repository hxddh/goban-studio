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
 * One analysis job per record runs at a time and keeps running when the
 * page is left, so the report is stored even if nobody waits for it.
 * Opening a key moment opens the review of the game at that move; the
 * analysis made for the report is handed to the review so it opens at once.
 */
import { BLACK } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Lib from "../library.js";
import { t } from "../i18n.js";
import { addMistake } from "../persist.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeBinaryFile } from "../host.js";
import { state, update, toast } from "./store.js";
import { back, canGoBack, remember, isRestoring } from "./ctl-core.js";
import { analyzeLine, openReview, reviewGoto } from "./review-ctl.js";
import { reviewCurrentGame, saveToLibrary } from "./play-ctl.js";
import { openMistakeDrill } from "./practice-ctl.js";
import { buildReport, reportDrills, reportFits } from "./report-model.js";

/** recordId → { promise, progress, points } */
const jobs = new Map();
/** recordId → the last analysis made for a report (kept in memory only). */
const analyses = new Map();

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
  update((s) => {
    s.report = { recordId, space, status: stored && !redo ? "done" : "analyzing", progress: 0, model: stored, error: null };
    s.menu = null;
    s.sheet = null;
  });
  if (!stored || redo) runJob(recordId, game, humanColorOf(rec));
}

function runJob(recordId, game, humanColor) {
  let job = jobs.get(recordId);
  if (!job) {
    job = { progress: 0, promise: null };
    jobs.set(recordId, job);
    job.promise = analyse(recordId, game, humanColor, job).finally(() => jobs.delete(recordId));
  }
  job.promise.then((model) => {
    const r = state.report;
    if (!r || r.recordId !== recordId) return;
    if (model) {
      r.model = model;
      r.status = "done";
    } else if (!r.model) r.status = "missing";
    else r.status = "done";
    update();
  });
}

async function analyse(recordId, game, humanColor, job) {
  const setProgress = (p, status = "analyzing") => {
    job.progress = p;
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
      await g.summaryJob;
    } catch (_) {}
    clearInterval(poll);
  }
  if (g?.analysis?.length === n && g.analysis.every(Boolean)) points = g.analysis;
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
  if (!points) {
    const size = game.size;
    points = await analyzeLine(game, {
      existing,
      visits: size === 19 ? 40 : size === 13 ? 56 : 80,
      onProgress: (k, total) => {
        if (k % 4 === 0 || k === total) setProgress(k / total);
      },
    });
  }
  if (!points) return null;
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
  return model;
}

/** Progress 0…1 of the report on screen. */
export function reportProgress() {
  const r = state.report;
  if (!r) return 0;
  if (r.status === "waiting") return liveGame(r.recordId)?.summary?.progress ?? r.progress;
  return r.progress;
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
  update((s) => {
    s.report = null;
  });
}

/** Leave the report without touching history (restore, goSpace). */
export function dropReport() {
  state.report = null;
}

/** Back/forward: put the report back where a history entry says it was. */
export function restoreReport(loc) {
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
  const blob = await renderReportPNG(r.model, { date: rec?.updatedAt || r.model.at });
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
