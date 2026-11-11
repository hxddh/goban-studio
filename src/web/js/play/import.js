/**
 * Importing records, the parts that are plain logic (the controller,
 * app/controller.js, does the files, the store and the toasts):
 *
 * - looksLikeSgf(text)         whether pasted text is worth trying as SGF
 * - playersOf(black, white)     the names of a record, when it has any
 * - describeEntry(game, i)     one row of the collection chooser
 * - splitCollection(text)       the games of a file, as separate SGF texts
 * - listCollection(texts, { from, count })
 *                              the rows of a page of a file with several games
 * - importSummary(done)        what a finished import says, and its details
 * - relativeDay(at, now)       "today" … "6 days ago" for the history's rows
 */
import { loadSGF } from "../sgf.js";

/** Games per page of the collection chooser. */
export const COLLECTION_PAGE = 50;
/** "Import all" asks first above this many games. */
export const IMPORT_ALL_CONFIRM = 50;

/** Text that starts like an SGF file: "(;" after any white space or a byte-order mark. */
export function looksLikeSgf(text) {
  return typeof text === "string" && /^[\s﻿]*\(\s*;/.test(text) && text.includes(")");
}

/**
 * The players of a record, { black, white }, or null when it names none
 * (a record without PB and PW reads as "Black" and "White": no names).
 */
export function playersOf(black, white) {
  const b = String(black || "").trim();
  const w = String(white || "").trim();
  if ((!b && !w) || (b === "Black" && w === "White")) return null;
  return { black: b || "?", white: w || "?" };
}

/** One game of a file, as the chooser lists it. */
function describeEntry(game, index) {
  const line = game.mainLine();
  const who = playersOf(game.playerBlack, game.playerWhite);
  return {
    index,
    size: game.size,
    black: who ? who.black : "",
    white: who ? who.white : "",
    date: game.dateText || "",
    result: line[line.length - 1]?.result || null,
    moves: Math.max(0, line.length - 1),
    // A problem of a collection: stones set up, few or no moves.
    setup: game.root.board.signMap.some((row) => row.some(Boolean)),
  };
}

/**
 * The games of a collection as separate SGF texts: the file cut at its
 * top-level "( … )" groups (brackets inside a property value, with their
 * escapes, are skipped). Reading one game then costs that game, not the
 * whole file again.
 */
export function splitCollection(text) {
  const s = String(text || "");
  const out = [];
  let depth = 0;
  let start = -1;
  let inValue = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inValue) {
      if (ch === "\\") i++;
      else if (ch === "]") inValue = false;
      continue;
    }
    if (ch === "[") inValue = depth > 0;
    else if (ch === "(") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

/**
 * The games `from` … `from + count − 1` of a collection (`texts`: what
 * splitCollection gave), each as describeEntry gives it; a game that
 * cannot be read is { index, error: code } (the others still list).
 * { total, from, entries }.
 */
export function listCollection(texts, { from = 0, count = COLLECTION_PAGE } = {}) {
  const total = texts.length;
  const start = Math.max(0, Math.min(total, Math.floor(from) || 0));
  const end = Math.min(total, start + Math.max(1, Math.floor(count) || COLLECTION_PAGE));
  const entries = [];
  for (let i = start; i < end; i++) {
    try {
      entries.push(describeEntry(loadSGF(texts[i]).game, i));
    } catch (e) {
      entries.push({ index: i, error: e?.code || "unreadable" });
    }
  }
  return { total, from: start, entries };
}

/**
 * What an import came to. `done` is a list of
 *   { name, id?, warnings?: string[], error?: string }
 * one per file (or per game of a collection): `id` when it was saved,
 * `error` (a sentence) when it was not. Returns { imported, failed, ids,
 * notes }, where notes is every warning and error with the name of its
 * file: [{ name, text, tone: "warning" | "error" }].
 */
export function importSummary(done) {
  const ids = [];
  const notes = [];
  let failed = 0;
  for (const d of done || []) {
    if (d.id) ids.push(d.id);
    if (d.error) {
      failed++;
      notes.push({ name: d.name || "", text: d.error, tone: "error" });
    }
    for (const w of d.warnings || []) notes.push({ name: d.name || "", text: w, tone: "warning" });
  }
  return { imported: ids.length, failed, ids, notes };
}

/**
 * How many days ago `at` was, by the calendar (0 today, 1 yesterday …), or
 * null when it is not within the last week (or in the future): the rows of
 * the history say "Yesterday" for those and a date for the rest.
 */
export function relativeDay(at, now = Date.now()) {
  if (!Number.isFinite(at) || at > now + 60_000) return null;
  const day = (ms) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  return days >= 0 && days < 7 ? days : null;
}
