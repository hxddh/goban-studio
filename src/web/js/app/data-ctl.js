/**
 * The player's data as a whole: a write that failed (one toast), the safe state
 * when stored files cannot be read, backups and restore with their snapshot
 * and Undo, the data folder, clearing everything. The page reloads after the store changes under it.
 */
import { store } from "../data/store.js";
import { dropSnapshots, exportBackup as backupDoc, checkBackup, importBackup as restoreDoc, latestSnapshot, parseBackup, undoRestore as undoRestoreDoc } from "../data/backup.js";
import { t, tn } from "../i18n.js";
import { hasFileDialogs, hasNative, normalizePaths, openFileDialog, readTextFile, revealDataDir } from "../host.js";
import { state, update, toast, dismissToastKey } from "./store.js";
import { confirmAction } from "./ctl-core.js";
import { saveText } from "./game-end.js";

/* ---------------------------------------------------------------- boot */

/** The files a write or removal last failed on (reset by whoever wants to name them). */
let failedKeys = [];

/** A file that could not be read or written: one toast, however many failed. */
export function storeError(e) {
  console.error("store:", e);
  if (e.key && (e.op === "write" || e.op === "remove") && !failedKeys.includes(e.key)) failedKeys.push(e.key);
  const read = e.op === "read" || e.op === "list";
  toast(t(read ? "store.readFailed" : "store.writeFailed"), "error", 5000, { key: "store" });
}

/** How the page reloads (tests replace it). */
let reloader = () => location.reload();
export function setReloader(fn) {
  reloader = typeof fn === "function" ? fn : () => location.reload();
}
function reloadApp() {
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
export function takeNote() {
  try {
    const n = sessionStorage.getItem(NOTE_KEY);
    sessionStorage.removeItem(NOTE_KEY);
    return n;
  } catch (_) {
    return null;
  }
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

/* ----------------------------------------------------------------- backup */

/** Every stored file as one JSON document (data/backup.js). */
export async function exportBackup() {
  await store.flush();
  const doc = await backupDoc(store);
  const day = new Date().toISOString().slice(0, 10);
  const saved = await saveText(`goban-studio-backup-${day}.json`, JSON.stringify(doc), "application/json", { done: t("backup.saved") });
  // With a backup just saved, the copy kept from before the last restore has done its job.
  if (saved && !store.readOnly) {
    await dropSnapshots(store);
    update();
  }
  return saved;
}

/** What a restore says when it cannot go ahead. */
function restoreError(error) {
  return t(error === "snapshot" ? "backup.restore.snapshotFailed" : error === "tooLarge" ? "backup.tooLarge" : error === "noSnapshot" ? "backup.undoRestore.none" : "backup.error." + error);
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
  if (store.readOnly) return toast(t("safe.readOnlyNow"), "warning");
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
    body: tn("backup.confirmFiles", c.summary.games, [c.summary.games, c.summary.keys]) + " " + t("backup.restore.safety"),
    confirm: t("backup.restore"),
    danger: true,
    onConfirm: () => restoreNow(doc),
  });
}

/** Restore `doc` now: a snapshot of what is there first, then the backup, then a reload. */
async function restoreNow(doc) {
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
  if (store.readOnly) return toast(t("safe.readOnlyNow"), "warning");
  if (!latestSnapshot(store, Date.now())) return toast(restoreError("noSnapshot"), "error");
  confirmAction({
    title: t("backup.undoRestore.title"),
    body: t("backup.undoRestore.body"),
    confirm: t("backup.undoRestore.confirm"),
    danger: true,
    onConfirm: () => undoRestoreNow(),
  });
}

async function undoRestoreNow() {
  const r = await undoRestoreDoc(store);
  if (!r.ok) return toast(restoreError(r.error), "error");
  reloadAfterRestore(r.written ? "undone" : "restorePartial");
}

export function clearData() {
  if (store.readOnly) return toast(t("safe.readOnlyNow"), "warning");
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
