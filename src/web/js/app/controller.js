/**
 * Everything the app does, as plain functions over the state.
 *
 * This file is the hub the views import: it boots the app (the store
 * first), owns the two spaces (Play and Learn) and history restore, the
 * games' history, backups and onboarding, and re-exports the play, review
 * and learn controllers. None of it touches the DOM.
 */
import { BLACK, formatPoints } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { store } from "../data/store.js";
import { loadSettings } from "../data/settings.js";
import { exportBackup as backupDoc, checkBackup, importBackup as restoreDoc, parseBackup } from "../data/backup.js";
import { normalizeProfile, recordClassic, setPriorRank } from "../model/player.js";
import { detectLang, setLang, t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, openFileDialog, readTextFile } from "../host.js";
import { CLASSICS, preload as preloadContent, withContent } from "../content.js";
import { state, update, toast } from "./store.js";
import { PROFILE_KEY, applyAppearance, changeProfile, confirmAction, remember, setRestorer, setSetting, syncMenus } from "./ctl-core.js";
import { maybeComputerMove, newGame, ponder, restoreCurrent, reviewCurrentGame, suggestedOpponent } from "./play-ctl.js";
import { dropReview, openReview, reviewGoto } from "./review-ctl.js";
import { allLessons, learnHome, openLesson, openMistakeDrill, openProblem, openShape, openTopic } from "./practice-ctl.js";
import { autoCheckForUpdates, restoreUpdateState } from "./update-ctl.js";
import { initModels } from "./models-ctl.js";
import { dropReport, restoreReport } from "./report-ctl.js";
import { resumeBackground } from "./report-batch.js";
import { closeExplorer } from "./explorer-ctl.js";

export * from "./ctl-core.js";
export * from "./play-ctl.js";
export * from "./review-ctl.js";
export * from "./practice-ctl.js";
export * from "./update-ctl.js";
export * from "./models-ctl.js";
export * from "./report-ctl.js";
export * from "./report-batch.js";

export * from "./explorer-ctl.js";
export * from "./plan-ctl.js";
export * from "./capture-ctl.js"; // the beginner bridges (Learn)
import { resumeCapture } from "./capture-ctl.js";
export { CLASSICS, formatPoints };

/* ---------------------------------------------------------------- boot */

/** A file that could not be read or written: one toast, however many failed. */
function storeError(e) {
  console.error("store:", e);
  const read = e.op === "read" || e.op === "list";
  toast(t(read ? "store.readFailed" : "store.writeFailed"), "error", 5000, { key: "store" });
}

/**
 * Start the app: open the store (every file into memory) before the first
 * render; settings, the player model and the game on the board come from
 * it. v9 reads nothing saved by earlier versions.
 */
export async function boot() {
  store.setErrorHandler(storeError);
  await store.open();
  const settings = loadSettings(store);
  if (!settings.lang) settings.lang = detectLang();
  state.settings = settings;
  state.profile = normalizeProfile(store.get(PROFILE_KEY));
  setLang(settings.lang);
  Audio.setSound(settings.sound);
  applyAppearance();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyAppearance);
  restoreCurrent();
  state.space = "play";
  state.play = { ...state.play, view: "home" };
  if (!settings.onboarded) state.sheet = { kind: "onboarding", step: 0 };
  setRestorer(restore);
  state.ready = true;
  update();
  // Lesson steps, problem bodies and classic records follow on idle
  // (content.js). Nothing on screen reads them before it is opened, and
  // what opens them waits for them, so their arrival renders nothing.
  preloadContent();
  Engine.info().then((info) => {
    update({ engine: info });
    maybeComputerMove();
    ponder();
    // Background reports and "Analyse all" that quitting interrupted.
    resumeBackground();
  });
  // Which optional networks are installed (a local status call).
  initModels().catch(() => {});
  // The opt-in weekly update check (no request unless it is on and due).
  if (hasNative()) setTimeout(() => autoCheckForUpdates().catch(() => {}), 4000);
  // How the last in-app update went (no request).
  if (hasNative()) setTimeout(() => restoreUpdateState().catch(() => {}), 600);
}

/* --------------------------------------------------------------- spaces */

/** The two spaces (docs/v9.md, "Two spaces"), in sidebar order. */
export const SPACES = ["play", "learn"];

/** Play's home: the game in progress or the suggested game, then the history. */
export function playHome() {
  if (state.space === "play" && state.play.view === "home" && !state.review && !state.report && !state.play.explorer) return;
  remember();
  if (state.review) dropReview();
  if (state.report) dropReport();
  update((s) => {
    s.space = "play";
    s.play = { ...s.play, view: "home", explorer: null };
    s.menu = null;
  });
  syncMenus();
}

/** The board of the game on it (Play). */
export function playBoard() {
  if (state.space === "play" && state.play.view === "game" && !state.review && !state.report) return;
  remember();
  if (state.review && (state.review.meta.space || "play") === "play") dropReview();
  if (state.report && state.report.space === "play") dropReport();
  update((s) => {
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
    s.menu = null;
  });
  maybeComputerMove();
  ponder();
  syncMenus();
}

export function goSpace(space) {
  if (!SPACES.includes(space)) return;
  // The space you are in again: back to its top level.
  if (space === state.space) {
    if (space === "learn") {
      if (state.report && state.report.space === "learn") {
        remember();
        dropReport();
        return update();
      }
      if (state.review && (state.review.meta.space || "play") === "learn") {
        remember();
        dropReview();
        return update();
      }
      if (state.learn.view !== "home") return learnHome();
      return;
    }
    if (state.play.explorer && !state.review) return closeExplorer();
    return playHome();
  }
  remember();
  update((s) => {
    s.space = space;
    s.menu = null;
  });
  if (space === "play") {
    maybeComputerMove();
    ponder();
  }
  syncMenus();
}

export function toggleFocus() {
  setSetting("focus", !state.settings.focus);
}

/** Put the app back where a history entry says it was. */
function restore(loc) {
  if (state.review) dropReview();
  state.space = loc.space;
  state.play = { ...state.play, ...loc.play };
  const p = loc.learn;
  if (loc.space === "learn") {
    if (p.view === "lesson" && p.lessonId) openLesson(p.lessonId, p.lessonIndex);
    else if (p.view === "problem" && p.problemId) openProblem(p.problemId);
    else if (p.view === "mistake" && p.mistakeId) openMistakeDrill(p.mistakeId);
    else if (p.view === "capture") resumeCapture({ from: p.captureFrom });
    else if (p.view === "topic" && p.shape) openShape(p.shape);
    else if (p.view === "topic" && p.topic) openTopic(p.topic, p.theme || null);
    else learnHome();
  }
  const rv = loc.review;
  if (rv) {
    if (rv.source === "current") reviewCurrentGame();
    else if (rv.source === "record" && rv.recordId) openRecord(rv.recordId);
    else if (rv.source === "classic" && rv.classicId) openClassic(rv.classicId);
    if (state.review && rv.index >= 0) reviewGoto(rv.index);
  }
  // The report page, when the entry had one open.
  restoreReport(loc);
  update();
}

/* ---------------------------------------------------- the games' history */

export function openRecord(id) {
  const rec = Games.getGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    openReview(game, { source: "record", recordId: rec.id, name: rec.name, humanColor: rec.opponent === "ai" ? rec.humanColor : null, space: "play", back: "play", autoJump: true, points: analysisOf(rec, game) });
  } catch (e) {
    console.error("SGF open failed", e);
    toast(t("library.importError"), "error");
  }
}

/** The stored whole-game analysis of a record, when it is of these moves. */
function analysisOf(rec, game) {
  const a = rec.analysis;
  return Array.isArray(a) && a.length === game.mainLine().length && a.every(Boolean) ? a : null;
}

export function openClassic(id) {
  return withContent("classics", () => showClassic(id));
}

function showClassic(id) {
  const c = CLASSICS.find((g) => g.id === id);
  if (!c) return;
  try {
    const { game } = loadSGF(c.sgf);
    changeProfile((p) => recordClassic(p, c.id, Date.now()));
    openReview(game, { source: "classic", classic: c, classicId: c.id, startAt: c.moment, autoJump: c.moment == null, space: "play", back: "play" });
  } catch (e) {
    toast(t("library.importError"), "error");
  }
}

export function deleteRecord(id) {
  confirmAction({
    title: t("library.deleteConfirm"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => {
      Games.deleteGame(id);
      update();
    },
  });
}

export function renameRecord(id, name) {
  Games.renameGame(id, name);
  update();
}

export async function exportRecord(id) {
  const rec = Games.getGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    const { exportSGF } = await import("./play-ctl.js");
    exportSGF(game, rec.name || "goban-studio");
  } catch (_) {
    toast(t("library.importError"), "error");
  }
}

export async function importSGFText(text, name = "goban-studio.sgf") {
  const { game, warnings } = loadSGF(text);
  const rec = Games.saveGame(game, { name: String(name).replace(/\.sgf$/i, ""), source: "import" });
  if (!state.settings.onboarded) {
    setSetting("onboarded", true);
    update({ sheet: null });
  }
  openReview(game, { source: "record", recordId: rec.id, name: rec.name, space: "play", back: "play", autoJump: true });
  if (warnings.length) toast(warnings[0], "warn");
}

/** A record under rules the app cannot score names those rules. */
function importErrorText(e) {
  if (e?.code !== "unsupported-rules") return t("library.importError");
  const name = String(e.rules || "").replace(/\s+/g, " ").trim().slice(0, 40) || "?";
  return t("rules.unsupported", [name]);
}

export async function importFromFile(file) {
  if (!file) return;
  try {
    await importSGFText(await file.text(), file.name);
  } catch (e) {
    toast(importErrorText(e), "error");
  }
}

export async function importFromPath(path) {
  try {
    const text = await readTextFile(path);
    if (text == null) throw new Error("read failed");
    await importSGFText(text, String(path).split(/[/\\]/).pop() || "goban-studio.sgf");
  } catch (e) {
    console.error("SGF import failed", e);
    toast(importErrorText(e), "error");
  }
}

export async function pickImport() {
  update({ menu: null });
  if (hasNative() && hasFileDialogs()) {
    const files = await openFileDialog({ title: t("library.import"), allowMultiple: false });
    const paths = normalizePaths(files);
    if (paths.length) importFromPath(paths[0]);
    return;
  }
  document.getElementById("file-input")?.click();
}

/* ----------------------------------------------------------------- backup */

/** Every stored file as one JSON document (data/backup.js). */
export async function exportBackup() {
  const { saveText } = await import("./play-ctl.js");
  await store.flush();
  const doc = backupDoc(store);
  const day = new Date().toISOString().slice(0, 10);
  await saveText(`goban-studio-backup-${day}.json`, JSON.stringify(doc), "application/json");
}

/** Pick a backup file, say what it holds, and replace everything on confirm. */
export async function importBackup() {
  let text = null;
  if (hasNative() && hasFileDialogs()) {
    const files = await openFileDialog({ title: t("backup.import"), allowMultiple: false });
    const path = normalizePaths(files)[0];
    if (!path) return;
    text = await readTextFile(path);
  } else {
    text = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        f.text().then(resolve, () => resolve(null));
      };
      input.click();
    });
  }
  if (text == null) return;
  const doc = parseBackup(text);
  const c = checkBackup(doc);
  if (!c.ok) return toast(t("backup.error." + c.error), "warn");
  confirmAction({
    title: t("backup.confirmTitle"),
    body: t("backup.confirmFiles", [c.summary.games, c.summary.keys]),
    confirm: t("backup.restore"),
    danger: true,
    onConfirm: async () => {
      const r = await restoreDoc(store, doc);
      if (!r.ok) return toast(t("backup.error." + r.error), "warn");
      if (!r.written) return; // the store's toast has said so
      location.reload();
    },
  });
}

export function clearData() {
  confirmAction({
    title: t("settings.clearConfirm"),
    body: t("settings.clearBody"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: async () => {
      for (const key of store.list("")) store.remove(key);
      if (await store.flush()) location.reload();
    },
  });
}

/* ----------------------------------------------------------- onboarding */

/**
 * The last onboarding answer: language and experience are known; open
 * Learn for a new player (lesson one, with the beginner bridges after it),
 * Play for everyone else (a 9×9 game for someone who knows the rules, the
 * full board for a player).
 */
export function finishOnboarding(choice, rank = null) {
  const s = state.settings;
  const next = { ...s, onboarded: true, experience: choice };
  if (choice === "new") next.playerRank = 30;
  else if (choice === "rules") next.playerRank = 25;
  else next.playerRank = rank ?? 15;
  changeProfile((p) => setPriorRank(p, next.playerRank, Date.now()));
  // The gentlest rank of the ladder for a beginner, else the suggested game's.
  const opponentRank = choice === "new" || choice === "rules" ? 30 : suggestedOpponent(19).opponentRank;
  next.opponentRank = opponentRank;
  update((st) => {
    st.settings = next;
    st.sheet = null;
  });
  setSetting("onboarded", true);
  if (choice === "new") {
    withContent("course", () => {
      const first = allLessons()[0];
      if (first) openLesson(first.lesson.id, 0);
    });
  } else if (choice === "rules") {
    // The small board first, against a gentle level, teaching on (teachingOn).
    newGame({ size: 9, opponent: "ai", color: BLACK, opponentRank, handicap: 0 });
  } else {
    newGame({ size: 19, opponent: "ai", color: BLACK, opponentRank, handicap: 0 });
  }
}

/** Your level changed by hand in Settings: the estimate starts from it again. */
export function setPlayerRank(rank) {
  setSetting("playerRank", rank);
  changeProfile((p) => setPriorRank(p, rank ?? 30, Date.now()));
  update();
}
