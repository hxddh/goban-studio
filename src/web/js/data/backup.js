/**
 * Backups (docs/storage.md, "Backups"): every stored key as one JSON document
 *
 *   { app: "goban-studio", v: 13, at, data: { key: value } }
 *
 * `at` is when it was made (ms since 1970). The copies of damaged files
 * (bad/), the restore snapshots (backups/) and the games index (rebuilt
 * from the games) are left out.
 *
 * Import checks the document first (what it is, its version, every key
 * and the size of every file), brings every file to the current format
 * (data/migrate.js: v9 to v12 backups were `v: 9`), and only then
 * replaces the store with it. Before replacing, the store as it was is
 * copied to `backups/pre-restore-<time>/…` (one file per key, so no copy
 * outgrows the store's limit per file); undoRestore puts it back — after
 * a snapshot of its own, so an undo can itself be undone. A snapshot is
 * offered for SNAPSHOT_DAYS days and until the next backup is exported
 * (the player then holds a newer copy than the snapshot); after that it is
 * removed (expireSnapshots, dropSnapshots). After a restore the app
 * reloads from the store whatever happened, so memory and disk never mix
 * (app/controller.js).
 */
import { BAD_PREFIX, MAX_BYTES, validKey } from "./store.js";
import { INDEX_KEY, LEGACY_V, STORE_V, migrateFile } from "./migrate.js";

const BACKUP_APP = "goban-studio";
const BACKUP_V = STORE_V;
/** Restore snapshots: `backups/pre-restore-<time>/<key>`. */
export const BACKUPS_PREFIX = "backups/";
const SNAPSHOT_PREFIX = "backups/pre-restore-";

/** How long "Undo restore" is offered. */
export const SNAPSHOT_DAYS = 30;
const DAY_MS = 86400000;

/** Keys a backup leaves out. */
const NOT_BACKED_UP = [BAD_PREFIX, BACKUPS_PREFIX, INDEX_KEY];
const leftOut = (key) => NOT_BACKED_UP.some((p) => key.startsWith(p));

/**
 * The backup document of a store (see data/store.js) at `now`. Game files
 * not read yet are read first, so the backup is complete.
 */
export async function exportBackup(store, now = Date.now()) {
  await store.loadAll("", { except: [BAD_PREFIX, BACKUPS_PREFIX] });
  return backupOf(store, now);
}

/** The backup document of what the store has in memory (exportBackup reads the rest first). */
function backupOf(store, now = Date.now()) {
  return { app: BACKUP_APP, v: BACKUP_V, at: now, data: JSON.parse(JSON.stringify(store.snapshot({ except: NOT_BACKED_UP }))) };
}

const isObject = (v) => v !== null && typeof v === "object";
const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * Check a backup document without changing anything:
 *   { ok: true, summary: { keys, games, at }, data } (data: every file in
 *     the current format) or
 *   { ok: false, error: "notBackup" | "olderVersion" | "newerVersion" |
 *     "damaged" | "tooLarge", key? }
 */
export function checkBackup(doc) {
  if (!isObject(doc) || Array.isArray(doc) || doc.app !== BACKUP_APP) return { ok: false, error: "notBackup" };
  if (!Number.isInteger(doc.v)) return { ok: false, error: "notBackup" };
  // Was the first version with this format; nothing older is read.
  if (doc.v < LEGACY_V) return { ok: false, error: "olderVersion" };
  if (doc.v > BACKUP_V) return { ok: false, error: "newerVersion" };
  if (!isObject(doc.data) || Array.isArray(doc.data)) return { ok: false, error: "damaged" };
  const keys = Object.keys(doc.data).filter((k) => !leftOut(k));
  const data = {};
  for (const key of keys) {
    const value = doc.data[key];
    if (!validKey(key) || !isObject(value)) return { ok: false, error: "damaged", key };
    // The store could not write it back (data/store.js MAX_BYTES).
    if (bytesOf(value) > MAX_BYTES) return { ok: false, error: "tooLarge", key };
    // Files of an older backup carry no version (v9 to v12); a v13 file carries its own.
    try {
      data[key] = migrateFile(key, value).value;
    } catch (e) {
      if (e?.code === "newer") return { ok: false, error: "newerVersion", key };
      return { ok: false, error: "damaged", key };
    }
  }
  return { ok: true, summary: { keys: keys.length, games: keys.filter((k) => k.startsWith("games/")).length, at: Number.isFinite(doc.at) ? doc.at : null }, data };
}

/**
 * The keys of the latest restore snapshot (sorted), and when it was made;
 * null when there is none — or, given `now`, when it is older than
 * SNAPSHOT_DAYS.
 */
export function latestSnapshot(store, now = null) {
  const keys = store.list(SNAPSHOT_PREFIX);
  let best = null;
  for (const k of keys) {
    const m = /^backups\/pre-restore-(\d+)\//.exec(k);
    if (m && (best == null || Number(m[1]) > best)) best = Number(m[1]);
  }
  if (best == null) return null;
  if (now != null && now - best > SNAPSHOT_DAYS * DAY_MS) return null;
  const prefix = `${SNAPSHOT_PREFIX}${best}/`;
  return { at: best, prefix, keys: keys.filter((k) => k.startsWith(prefix)) };
}

/**
 * Copy the store as it is to a new snapshot and drop the older ones;
 * resolves to the snapshot's prefix, or null when it could not be written
 * (nothing is restored then).
 */
async function writeSnapshot(store, now = Date.now()) {
  if (!(await store.flush())) return null;
  await store.loadAll("", { except: [BAD_PREFIX, BACKUPS_PREFIX] });
  const prefix = `${SNAPSHOT_PREFIX}${now}/`;
  const old = store.list(BACKUPS_PREFIX);
  const data = store.snapshot({ except: NOT_BACKED_UP });
  for (const [key, value] of Object.entries(data)) {
    const to = prefix + key;
    if (!validKey(to)) return null;
    store.put(to, value);
  }
  if (!(await store.flush())) {
    // Nothing half-made stays behind to be taken for the latest snapshot.
    for (const key of Object.keys(data)) store.remove(prefix + key);
    return null;
  }
  // Only the newest snapshot is kept; it is not kept in memory either.
  for (const key of old) store.remove(key);
  await store.flush();
  store.evict(BACKUPS_PREFIX);
  return prefix;
}

/**
 * Replace everything in `store` with the backup and write it out, after a
 * snapshot of what was there. Returns checkBackup's answer; with `ok`,
 * also `snapshot` (its prefix) and `written` (false when a write failed:
 * the store's onError has said which). `{ ok: false, error: "snapshot" }`
 * when the snapshot could not be written (nothing was replaced).
 */
export async function importBackup(store, doc, { now = Date.now() } = {}) {
  const c = checkBackup(doc);
  if (!c.ok) return c;
  const snapshot = await writeSnapshot(store, now);
  if (!snapshot) return { ok: false, error: "snapshot" };
  // Writes held in memory (a read-only session) are not what is restored.
  store.discardHeld();
  store.replaceAll(c.data, { keep: [BACKUPS_PREFIX] });
  const written = await store.flush();
  const { data, ...rest } = c;
  return { ...rest, snapshot, written };
}

/** Remove every restore snapshot (a backup was exported, or the snapshot is too old to offer). */
export async function dropSnapshots(store) {
  const keys = store.list(BACKUPS_PREFIX);
  if (!keys.length) return true;
  for (const key of keys) store.remove(key);
  const ok = await store.flush();
  store.evict(BACKUPS_PREFIX);
  return ok;
}

/** Remove the snapshot once it is older than SNAPSHOT_DAYS (at launch). Resolves to whether one was removed. */
export async function expireSnapshots(store, now = Date.now()) {
  if (!latestSnapshot(store) || latestSnapshot(store, now)) return false;
  await dropSnapshots(store);
  return true;
}

/**
 * Put the latest snapshot back (Settings, "Undo restore"). What is there
 * now is snapshotted first, in its place, so the undo can be undone the
 * same way. { ok, written, at } or { ok: false, error: "noSnapshot" |
 * "damaged" | "snapshot" } ("snapshot": what is there could not be copied
 * first, and nothing was replaced).
 */
export async function undoRestore(store, { now = Date.now() } = {}) {
  const snap = latestSnapshot(store);
  if (!snap) return { ok: false, error: "noSnapshot" };
  const data = {};
  for (const key of snap.keys) {
    let value;
    try {
      value = await store.load(key);
    } catch (_) {
      return { ok: false, error: "damaged", key };
    }
    if (value === undefined) continue;
    data[key.slice(snap.prefix.length)] = JSON.parse(JSON.stringify(value));
  }
  // The newer snapshot replaces the one being put back (now held in `data`).
  if (!(await writeSnapshot(store, Math.max(now, snap.at + 1)))) return { ok: false, error: "snapshot" };
  store.discardHeld();
  store.replaceAll(data, { keep: [BACKUPS_PREFIX] });
  const written = await store.flush();
  store.evict(BACKUPS_PREFIX);
  return { ok: true, written, at: snap.at };
}

/** A backup document from its file's text; null when it is not JSON. */
export function parseBackup(text) {
  try {
    return JSON.parse(String(text).replace(/^﻿/, ""));
  } catch (_) {
    return null;
  }
}
