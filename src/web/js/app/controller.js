/**
 * Everything the app does, as plain functions over the state.
 *
 * This file is the hub the views import: it boots the app (the store
 * first), owns the four spaces (Today, Play, Practice and Library; v12)
 * and history restore, the games' history, backups and onboarding, and
 * re-exports the play, review and learn controllers. None of it touches the DOM.
 */
import { BLACK, formatPoints } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { store } from "../data/store.js";
import { SETTINGS_KEY, loadSettings } from "../data/settings.js";
import { CURRENT_KEY, GAMES_PREFIX, migrateFile } from "../data/migrate.js";
import { BACKUPS_PREFIX, dropSnapshots, expireSnapshots, exportBackup as backupDoc, checkBackup, importBackup as restoreDoc, latestSnapshot, parseBackup, undoRestore as undoRestoreDoc } from "../data/backup.js";
import { normalizeProfile, recordClassic, setPriorRank } from "../model/player.js";
import { detectLang, setLang, t, tn } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, isPackaged, normalizePaths, openFileDialog, readFileBytes, readTextFile, revealDataDir } from "../host.js";
import { CLASSICS, onContentWait, preload as preloadContent, withContent } from "../content.js";
import { state, update, toast, dismissToastKey, runTask } from "./store.js";
import { PROFILE_KEY, applyAppearance, changeProfile, confirmAction, remember, setRestorer, setSetting, syncMenus } from "./ctl-core.js";
import { boardShown, playShowsBoard, exportSGF, maybeComputerMove, newGame, ponder, recommendedGame, restoreCurrent, resumeRecord, reviewCurrentGame, saveText, showFinished, suggestedOpponent, unfinishedGame } from "./play-ctl.js";
import { closeReview, dropReview, openReview, reviewGoto } from "./review-ctl.js";
import { allLessons, learnHome, openCatalog, openLesson, openMistakeDrill, openProblem, openShape, openTopic } from "./practice-ctl.js";
import { autoCheckForUpdates, restoreUpdateState } from "./update-ctl.js";
import { initModels } from "./models-ctl.js";
import { resumeBackground } from "../play/analysis.js";
import { closeExplorer } from "./explorer-ctl.js";

export * from "./ctl-core.js";
export * from "./play-ctl.js";
export * from "./review-ctl.js";
export * from "./practice-ctl.js";
export * from "./update-ctl.js";
export * from "./models-ctl.js";
export * from "../play/analysis.js";

export * from "./explorer-ctl.js";
export * from "../learn/session.js"; // Learn's path, today's session
export * from "../learn/placement.js"; // v10: the placement quiz
import { itemKey, todaysSession } from "../learn/session.js";
export * from "./capture-ctl.js"; // the beginner bridges (Learn)
import { resumeCapture } from "./capture-ctl.js";
export { CLASSICS, formatPoints };

/* ---------------------------------------------------------------- boot */

/** The files a write or removal last failed on (reset by whoever wants to name them). */
let failedKeys = [];

/** A file that could not be read or written: one toast, however many failed. */
function storeError(e) {
  console.error("store:", e);
  if (e.key && (e.op === "write" || e.op === "remove") && !failedKeys.includes(e.key)) failedKeys.push(e.key);
  const read = e.op === "read" || e.op === "list";
  toast(t(read ? "store.readFailed" : "store.writeFailed"), "error", 5000, { key: "store" });
}

/**
 * The files without which the app would take you for a new player. If one
 * of them cannot be read, the app does not start over on top of it: see
 * storeProblemOf and docs/storage.md, "Safe state".
 */
export const CORE_KEYS = [SETTINGS_KEY, PROFILE_KEY, CURRENT_KEY];
/** Read when needed, not at boot: the game files and the restore snapshots. */
export const LAZY_PREFIXES = [GAMES_PREFIX, BACKUPS_PREFIX];

/**
 * What the store's open found that the player must hear about before
 * anything is written, or null:
 *   { kind: "list" }     nothing could be listed
 *   { kind: "files", failed, resettable, newer }
 *                        a core file could not be read (failed: [{ key,
 *                        kind, error, preserved }]); resettable when each
 *                        was only damaged and a copy of it is kept (bad/…);
 *                        newer when one was saved by a newer version.
 */
export function storeProblemOf(report) {
  if (!report) return null;
  if (report.listFailed) return { kind: "list", failed: [], resettable: false, newer: false };
  const failed = report.failed.filter((f) => CORE_KEYS.includes(f.key));
  if (!failed.length) return null;
  return { kind: "files", failed, resettable: failed.every((f) => f.kind === "parse" && !!f.preserved), newer: failed.some((f) => f.kind === "newer") };
}

/** How the page reloads (tests replace it). */
let reloader = () => location.reload();
export function setReloader(fn) {
  reloader = typeof fn === "function" ? fn : () => location.reload();
}
export function reloadApp() {
  reloader();
}

/** A word for after the reload (a restore): kept for the session only. */
const NOTE_KEY = "goban13:note";
function noteForReload(note) {
  try {
    sessionStorage.setItem(NOTE_KEY, note);
  } catch (_) {
    /* no session storage: the reload says nothing */
  }
}
function takeNote() {
  try {
    const n = sessionStorage.getItem(NOTE_KEY);
    sessionStorage.removeItem(NOTE_KEY);
    return n;
  } catch (_) {
    return null;
  }
}

/** The packaged app's bridge appears with the page; give it a moment before calling it missing. */
async function waitForBridge(ms = 1500) {
  const end = Date.now() + ms;
  while (!hasNative() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return hasNative();
}

/**
 * Start the app: open the store before the first render (settings, the
 * player model, the game on the board and the games index; the game files
 * themselves are read when a view needs one), bring what it read to the
 * current format (data/migrate.js), and only then decide what to show.
 *
 * v13 safety: in the packaged app a missing bridge is an error screen,
 * never a fresh start in the WebView's own storage; a core file that could
 * not be read puts the app in its safe state (read-only, no onboarding,
 * app/safety.jsx) instead of taking the player for a new one.
 */
export async function boot() {
  store.setErrorHandler(storeError);
  // A click that needs a content part not here yet shows that it is loading,
  // and says so when it could not be loaded (content.js, store.js runTask).
  onContentWait((part, load) => runTask("content:" + part, load, { label: t("task.loading"), error: t("task.contentFailed") }));
  if (isPackaged() && !hasNative() && !(await waitForBridge())) {
    const lang = detectLang();
    setLang(lang);
    update({ bootError: { kind: "bridge" }, settings: { ...loadSettings({ get: () => null }), lang } });
    return;
  }
  store.setMigrator(migrateFile);
  await store.open({ lazy: LAZY_PREFIXES, keepDamaged: CORE_KEYS });
  const problem = storeProblemOf(store.openReport);
  // Nothing is written while the player has not chosen what to do.
  if (problem) store.setReadOnly(true);
  // The games index (rebuilt from the files when it is missing or behind).
  const read = await Games.initIndex();
  if (read) store.evict(GAMES_PREFIX);
  const settings = loadSettings(store);
  if (!settings.lang) settings.lang = detectLang();
  // Games or a player model without settings are not a new player's (a
  // settings file lost, or reset in the safe state): no onboarding.
  if (!settings.onboarded && (problem || (!store.has(SETTINGS_KEY) && (store.has(PROFILE_KEY) || Games.listGames().length > 0)))) settings.onboarded = true;
  state.settings = settings;
  state.profile = normalizeProfile(store.get(PROFILE_KEY));
  state.storeProblem = problem ? { ...problem, continued: false } : null;
  setLang(settings.lang);
  Audio.setLevel(settings.volume);
  applyAppearance();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyAppearance);
  restoreCurrent();
  // Play opens on the board when a game is in progress (v13: one with a
  // move of the player's, play-ctl unfinishedGame), else on its home.
  state.space = "today";
  state.play = { ...state.play, view: unfinishedGame() ? "game" : "home" };
  if (!settings.onboarded) state.sheet = { kind: "onboarding", step: 0 };
  setRestorer(restore);
  state.ready = true;
  update();
  const note = takeNote();
  if (note) toast(t("v13.note." + note), note === "restorePartial" ? "warning" : "success", 7000);
  // Lesson steps, problem bodies and classic records follow on idle
  // (content.js). Nothing on screen reads them before it is opened, and
  // what opens them waits for them, so their arrival renders nothing.
  preloadContent(() => update());
  Engine.info().then((info) => {
    update({ engine: info });
    maybeComputerMove();
    ponder();
    // The background analyses quitting interrupted (play/analysis.js).
    resumeBackground();
  });
  // A restore snapshot nobody can undo any more is removed.
  if (!problem) expireSnapshots(store).catch(() => {});
  // Which optional networks are installed (a local status call).
  initModels().catch(() => {});
  // The opt-in weekly update check (no request unless it is on and due).
  if (hasNative()) setTimeout(() => autoCheckForUpdates().catch(() => {}), 4000);
  // How the last in-app update went (no request).
  if (hasNative()) setTimeout(() => restoreUpdateState().catch(() => {}), 600);
}

/* ------------------------------------------------------ the safe state */

/** Try again: the page reloads and the store is opened afresh. */
export function retryStore() {
  reloadApp();
}

/** Use the app as it is, writing nothing (a banner says so and offers Retry). */
export function continueReadOnly() {
  update((s) => {
    if (s.storeProblem) s.storeProblem = { ...s.storeProblem, continued: true };
  });
}

/**
 * Start the damaged core files over (only when each was merely damaged and
 * its copy is kept under bad/): nothing held in memory is written, the
 * damaged files are removed, and the app reloads.
 */
export async function resetDamaged() {
  const p = state.storeProblem;
  if (!p?.resettable) return false;
  update((s) => (s.storeProblem = { ...s.storeProblem, resetFailed: null }));
  store.discardHeld();
  for (const f of p.failed) store.block(f.key, false);
  store.setReadOnly(false);
  failedKeys = [];
  for (const f of p.failed) store.remove(f.key);
  const ok = await store.flush();
  if (!ok) {
    store.setReadOnly(true);
    // Say which files are still there (the screen shows it: app/safety.jsx).
    const left = failedKeys.length ? failedKeys : p.failed.map((f) => f.key);
    update((s) => (s.storeProblem = { ...s.storeProblem, resetFailed: left }));
    return false;
  }
  reloadApp();
  return true;
}

/* --------------------------------------------------------------- spaces */

/** The four spaces (v12: Today, Play, Practice, Library), in sidebar order. */
export const SPACES = ["today", "play", "learn", "library"];

/**
 * Play's top: the board while a game is not over (v12, as before v9), else
 * what to play next. Any review open in Play closes.
 */
export function playHome() {
  const live = playShowsBoard() && !state.game.game.current.result;
  const view = live ? "game" : "home";
  if (state.space === "play" && state.play.view === view && !state.review) return;
  remember();
  if (state.review) dropReview();
  update((s) => {
    s.space = "play";
    s.play = { ...s.play, view };
    s.menu = null;
  });
  if (live) {
    maybeComputerMove();
    ponder();
  }
  syncMenus();
}

/** The board of the game on it (Play). */
export function playBoard() {
  if (boardShown() && !state.review) return showFinished();
  remember();
  if (state.review && (state.review.meta.space || "play") === "play") dropReview();
  update((s) => {
    s.space = "play";
    s.play = { ...s.play, view: "game", explorer: null };
    s.menu = null;
  });
  // A finished game's board is its review.
  showFinished();
  maybeComputerMove();
  ponder();
  syncMenus();
}

export function goSpace(space) {
  if (!SPACES.includes(space)) return;
  // The space you are in again: back to its top level.
  if (space === state.space) {
    if (space === "learn") {
      if (state.review && (state.review.meta.space || "play") === "learn") {
        remember();
        dropReview();
        return update();
      }
      if (state.learn.view !== "home") return learnHome();
      return;
    }
    if (space === "library") {
      if (state.review && state.review.meta.space === "library") return closeReview();
      if (state.play.explorer) return closeExplorer();
      return;
    }
    if (space === "today") return;
    return playShowsBoard() && !playReviewingNow() ? playBoard() : playHome();
  }
  remember();
  // v12: a record or classic is read in the Library; leaving the Library
  // closes it (its edits are kept), so no other space carries it along.
  if (state.review?.meta.space === "library") dropReview();
  // Play is the board while a game is not over (v12, as before v9); v13:
  // a game restored at launch with no move of the player's leaves Play on
  // its home (play-ctl playShowsBoard).
  const board = space === "play" && playShowsBoard() && !state.game.game.current.result && !playReviewingNow();
  update((s) => {
    s.space = space;
    s.menu = null;
    if (board) s.play = { ...s.play, view: "game", explorer: s.play.explorer };
  });
  if (space === "play") {
    if (board) showFinished();
    maybeComputerMove();
    ponder();
  }
  syncMenus();
}

function playReviewingNow() {
  return !!state.review && (state.review.meta.space || "play") === "play";
}

export function toggleFocus() {
  setSetting("focus", !state.settings.focus);
}

/** Put the app back where a history entry says it was. */
export function restore(loc) {
  if (state.review) dropReview();
  state.space = loc.space;
  state.play = { ...state.play, ...loc.play };
  const p = loc.learn;
  if (loc.space === "learn") {
    // An item of today's session comes back inside the session.
    const s = p.daily ? todaysSession() : null;
    const within = (kind, id) => {
      if (!s) return undefined;
      const key = itemKey({ kind, id });
      if (!s.items.some((it) => it.key === key)) return undefined;
      s.current = key;
      return { daily: s };
    };
    if (p.view === "lesson" && p.lessonId) openLesson(p.lessonId, p.lessonIndex, within("lesson", p.lessonId));
    else if (p.view === "problem" && p.problemId) openProblem(p.problemId, within("problem", p.problemId));
    else if (p.view === "mistake" && p.mistakeId) openMistakeDrill(p.mistakeId, within("mistake", p.mistakeId));
    else if (p.view === "capture") resumeCapture({ from: p.captureFrom });
    else if (p.view === "catalog") openCatalog();
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
  // A finished game's board is its review.
  showFinished();
  update();
}

/* ---------------------------------------------------- the games' history */

export function openRecord(id) {
  // A game's file is read when it is opened: a slow read shows that it is
  // loading, and one that fails says so and offers Retry (store.js runTask).
  if (!Games.isLoaded(id)) {
    const load = async () => {
      const rec = await Games.loadGame(id);
      // The task says what failed, with Retry: the store's own toast would say it twice.
      if (!rec) dismissToastKey("store");
      // (Inside the task, so a Retry that works opens the game too.)
      else openRecord(id);
      return rec;
    };
    return runTask("game:" + id, load, { label: t("task.openingGame"), error: t("task.gameFailed"), failed: (rec) => !rec });
  }
  const rec = Games.getGame(id);
  if (!rec) return;
  // A game left unfinished continues where it stopped (play-ctl resumeRecord).
  if (Games.isUnfinished(rec)) return resumeRecord(id);
  try {
    const { game } = loadSGF(rec.sgf);
    // The same review as after a game: its stored analysis opens at once.
    openReview(game, { source: "record", recordId: rec.id, name: rec.name, humanColor: rec.opponent === "ai" ? rec.humanColor : null, space: "library", back: "library", autoJump: true });
  } catch (e) {
    console.error("SGF open failed", e);
    toast(t("library.importError"), "error");
  }
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
    openReview(game, { source: "classic", classic: c, classicId: c.id, startAt: (c.moments?.find((m) => m.title) ?? c.moments?.[0])?.index, autoJump: !c.moments?.length, space: "library", back: "library" });
  } catch (e) {
    console.error("classic open failed", e);
    toast(t("library.importError"), "error");
  }
}

/**
 * Delete a game from the Library: it goes at once, and a toast offers Undo
 * for a few seconds (data/games.js trashGame). The file is deleted when the
 * toast goes, when another game is deleted, and before the app quits.
 */
export function deleteRecord(id) {
  if (!Games.trashGame(id)) return;
  update();
  toast(t("library.deleted"), "info", {
    key: "game-deleted",
    replace: true,
    action: {
      label: t("common.undoAction"),
      run: () => {
        if (Games.restoreGame(id)) update();
      },
    },
    // Gone without Undo: the delete is final (unless a newer delete already made it so).
    onClose: (reason) => {
      if (reason !== "action" && Games.trashedGame() === id) Games.commitTrash();
    },
  });
}

export function renameRecord(id, name) {
  Games.renameGame(id, name);
  update();
}

export async function exportRecord(id) {
  const rec = Games.isLoaded(id) ? Games.getGame(id) : await Games.loadGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    exportSGF(game, rec.name || "goban-studio");
  } catch (_) {
    toast(t("library.importError"), "error");
  }
}

/** `text` is the record's text, or its raw bytes (loadSGF decodes them and says when it had to guess the charset). */
export async function importSGFText(text, name = "goban-studio.sgf") {
  const { game, warnings } = loadSGF(text);
  const rec = Games.saveGame(game, { name: String(name).replace(/\.sgf$/i, ""), source: "import" });
  if (!state.settings.onboarded) {
    setSetting("onboarded", true);
    update({ sheet: null });
  }
  openReview(game, { source: "record", recordId: rec.id, name: rec.name, space: "library", back: "library", autoJump: true });
  if (warnings.length) toast(warnings[0], "warning");
}

/** A record under rules the app cannot score names those rules. */
function importErrorText(e) {
  if (e?.code === "unsupported-size") return t("sgf.unsupportedSize", [String(e.size || "?")]);
  if (e?.code !== "unsupported-rules") return t("library.importError");
  const name = String(e.rules || "").replace(/\s+/g, " ").trim().slice(0, 40) || "?";
  return t("rules.unsupported", [name]);
}

export async function importFromFile(file) {
  if (!file) return;
  try {
    await importSGFText(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (e) {
    toast(importErrorText(e), "error");
  }
}

export async function importFromPath(path) {
  try {
    const bytes = await readFileBytes(path);
    if (bytes == null) throw new Error("read failed");
    await importSGFText(bytes, String(path).split(/[/\\]/).pop() || "goban-studio.sgf");
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
  await store.flush();
  const doc = await backupDoc(store);
  const day = new Date().toISOString().slice(0, 10);
  const saved = await saveText(`goban-studio-backup-${day}.json`, JSON.stringify(doc), "application/json", { done: t("v13.backupSaved") });
  // With a backup just saved, the copy kept from before the last restore has done its job.
  if (saved && !store.readOnly) {
    await dropSnapshots(store);
    update();
  }
  return saved;
}

/** What a restore says when it cannot go ahead. */
function restoreError(error) {
  return t(error === "snapshot" ? "v13.restore.snapshotFailed" : error === "tooLarge" ? "v13.backup.tooLarge" : error === "noSnapshot" ? "v13.undoRestore.none" : "backup.error." + error);
}

/**
 * After a restore (or its undo), whatever happened: nothing in memory may
 * be written over what is on disk now, and the app reads it all again.
 */
function reloadAfterRestore(note) {
  store.setReadOnly(true);
  noteForReload(note);
  reloadApp();
}

/** Pick a backup file, say what it holds, and replace everything on confirm. */
export async function importBackup() {
  if (store.readOnly) return toast(t("v13.readOnlyNow"), "warning");
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
  return offerRestore(parseBackup(text));
}

/** Check a backup document and, on confirm, restore it (importBackup once the file is read). */
export function offerRestore(doc) {
  const c = checkBackup(doc);
  if (!c.ok) return toast(restoreError(c.error), "error");
  confirmAction({
    title: t("backup.confirmTitle"),
    body: tn("backup.confirmFiles", c.summary.games, [c.summary.games, c.summary.keys]) + " " + t("v13.restore.safety"),
    confirm: t("backup.restore"),
    danger: true,
    onConfirm: () => restoreNow(doc),
  });
}

/** Restore `doc` now: a snapshot of what is there first, then the backup, then a reload. */
export async function restoreNow(doc) {
  const r = await restoreDoc(store, doc);
  if (!r.ok) return toast(restoreError(r.error), "error");
  reloadAfterRestore(r.written ? "restored" : "restorePartial");
}

/**
 * The latest restore snapshot ({ at, keys }), for Settings' "Undo restore";
 * null when there is none, or it is older than 30 days (data/backup.js
 * SNAPSHOT_DAYS).
 */
export function restoreSnapshot(now = Date.now()) {
  return latestSnapshot(store, now);
}

/** Show the folder that holds the player's data in Finder / Explorer (Settings → Data; the packaged app only). */
export async function revealDataFolder() {
  const r = await revealDataDir();
  if (!r.ok) toast(t("settings.reveal.failed"), "error");
  return r.ok;
}

/** Put back what was there before the last restore (Settings). */
export function undoRestore() {
  if (store.readOnly) return toast(t("v13.readOnlyNow"), "warning");
  if (!latestSnapshot(store, Date.now())) return toast(restoreError("noSnapshot"), "error");
  confirmAction({
    title: t("v13.undoRestore.title"),
    body: t("v13.undoRestore.body"),
    confirm: t("v13.undoRestore.confirm"),
    danger: true,
    onConfirm: () => undoRestoreNow(),
  });
}

export async function undoRestoreNow() {
  const r = await undoRestoreDoc(store);
  if (!r.ok) return toast(restoreError(r.error), "error");
  reloadAfterRestore(r.written ? "undone" : "restorePartial");
}

export function clearData() {
  if (store.readOnly) return toast(t("v13.readOnlyNow"), "warning");
  confirmAction({
    title: t("settings.clearConfirm"),
    body: t("settings.clearBody"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => clearDataNow(),
  });
}

/** Remove every stored file, then start afresh; a file that could not be removed is named, with Retry. */
export async function clearDataNow() {
  failedKeys = [];
  for (const key of store.list("")) store.remove(key);
  if (await store.flush()) return reloadApp();
  const left = failedKeys.length ? failedKeys : store.pending();
  const name = left.length > 1 ? t("clear.failedMore", [left[0], left.length - 1]) : left[0] || "";
  dismissToastKey("store");
  toast(t("clear.failed", [name]), "error", { key: "clear", replace: true, action: { label: t("common.retry"), run: () => clearDataNow() } });
}

/* ----------------------------------------------------------- onboarding */

/**
 * The last onboarding answer: language and experience are known. Every
 * new player lands on Today, whose hero offers what the answer asked for
 * in one click (startFirstRun): lesson one for someone who never played,
 * a gentle 9×9 game for someone who knows the rules, the full board for a
 * player. Nobody is dropped onto a board or into a lesson before seeing
 * the app's home.
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
    st.space = "today";
  });
  setSetting("onboarded", true);
}

/**
 * Start what onboarding promised (the primary of Today's first hero):
 * lesson one, or the suggested first game — the small board against the
 * gentlest level with teaching on, or an even game on the full board.
 */
export function startFirstRun() {
  const rec = recommendedGame();
  if (rec.first === "lesson") {
    return withContent("course", () => {
      const first = allLessons()[0];
      if (first) openLesson(first.lesson.id, 0);
    });
  }
  return newGame({ size: rec.size, opponent: "ai", color: BLACK, opponentRank: rec.opponentRank, handicap: rec.handicap });
}

/** Your level changed by hand in Settings: the estimate starts from it again. */
export function setPlayerRank(rank) {
  setSetting("playerRank", rank);
  changeProfile((p) => setPriorRank(p, rank ?? 30, Date.now()));
  update();
}
