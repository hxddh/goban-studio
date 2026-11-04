/**
 * v7: your own problem collections, as stored data. Kept apart from the
 * controller (collections-ctl.js) so practice-ctl.js can look problems up
 * without importing the import machinery.
 *
 * Stored under persist.KEYS.collections (so backups carry them):
 *   { v: 1, collections: [{ v, id, name, created, problems, report }] }
 * See buildCollection() in ../problem-import.js for the shapes.
 */
import { KEYS, readJSON, writeJSON } from "../persist.js";
import { normalizeCollections } from "../problem-import.js";
import { t } from "../i18n.js";

let cache = null;

export function loadCollections() {
  if (!cache) cache = normalizeCollections(readJSON(KEYS.collections, { v: 1, collections: [] }));
  return cache.collections;
}

export function saveCollections(list = loadCollections()) {
  cache = { v: 1, collections: list };
  return writeJSON(KEYS.collections, cache);
}

/** Forget the cached copy (after a restore, in tests). */
export function reloadCollections() {
  cache = null;
  return loadCollections();
}

export function getCollection(id) {
  return loadCollections().find((c) => c.id === id) || null;
}

export function addCollection(col) {
  const list = [...loadCollections(), col];
  return saveCollections(list);
}

export function renameCollection(id, name) {
  const c = getCollection(id);
  if (!c) return false;
  c.name = String(name || "").slice(0, 120) || c.name;
  return saveCollections();
}

export function removeCollection(id) {
  return saveCollections(loadCollections().filter((c) => c.id !== id));
}

/** A problem from one of your collections by id, or null. */
export function findUserProblem(id) {
  if (typeof id !== "string" || !id.startsWith("u-")) return null;
  for (const c of loadCollections()) {
    const p = c.problems.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

export function collectionProblems(id) {
  return getCollection(id)?.problems || [];
}

/**
 * A stored problem dressed for the problem view: a title (its name in the
 * file, or "Problem n") and the file's comment as the hint.
 */
export function userProblemDef(id) {
  const p = findUserProblem(id);
  if (!p) return null;
  const title = p.name || t("v7problems.problemN", [p.n]);
  return { ...p, title: { en: title, zh: title, ko: title, ja: title }, hint: p.comment ? { en: p.comment, zh: p.comment, ko: p.comment, ja: p.comment } : null };
}
