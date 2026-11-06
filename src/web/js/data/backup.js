/**
 * v9 backups (docs/v9.md, "Backups"): every stored key as one JSON document
 *
 *   { app: "goban-studio", v: 9, at, data: { key: value } }
 *
 * `at` is when it was made (ms since 1970). Import checks the document
 * first and then replaces everything in the store with it. v9 reads no
 * data from earlier versions, so an older backup is refused too.
 */
import { validKey } from "./store.js";

export const BACKUP_APP = "goban-studio";
export const BACKUP_V = 9;

/** The backup document of a store (see data/store.js) at `now`. */
export function exportBackup(store, now = Date.now()) {
  return { app: BACKUP_APP, v: BACKUP_V, at: now, data: JSON.parse(JSON.stringify(store.snapshot())) };
}

const isObject = (v) => v !== null && typeof v === "object";

/**
 * Check a backup document without changing anything:
 *   { ok: true, summary: { keys, games, at } } or
 *   { ok: false, error: "notBackup" | "olderVersion" | "newerVersion" | "damaged", key? }
 */
export function checkBackup(doc) {
  if (!isObject(doc) || Array.isArray(doc) || doc.app !== BACKUP_APP) return { ok: false, error: "notBackup" };
  if (!Number.isInteger(doc.v)) return { ok: false, error: "notBackup" };
  if (doc.v < BACKUP_V) return { ok: false, error: "olderVersion" };
  if (doc.v > BACKUP_V) return { ok: false, error: "newerVersion" };
  if (!isObject(doc.data) || Array.isArray(doc.data)) return { ok: false, error: "damaged" };
  const keys = Object.keys(doc.data);
  for (const key of keys) {
    if (!validKey(key) || !isObject(doc.data[key])) return { ok: false, error: "damaged", key };
  }
  return { ok: true, summary: { keys: keys.length, games: keys.filter((k) => k.startsWith("games/")).length, at: Number.isFinite(doc.at) ? doc.at : null } };
}

/**
 * Replace everything in `store` with the backup and write it out.
 * Returns checkBackup's answer; with `ok`, also `written` (false when a
 * write failed: the store's onError has said which).
 */
export async function importBackup(store, doc) {
  const c = checkBackup(doc);
  if (!c.ok) return c;
  store.replaceAll(JSON.parse(JSON.stringify(doc.data)));
  const written = await store.flush();
  return { ...c, written };
}

/** A backup document from its file's text; null when it is not JSON. */
export function parseBackup(text) {
  try {
    return JSON.parse(String(text).replace(/^﻿/, ""));
  } catch (_) {
    return null;
  }
}
