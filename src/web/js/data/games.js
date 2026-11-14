/**
 * Games (docs/storage.md): one file per game, a small index of them, and
 * the game in progress, in the store (data/store.js).
 *
 *   games/<id>.json     { v, id, createdAt, updatedAt, finishedAt, source,
 *                         sgf, meta, analysis?, review? }
 *   games-index.json    { v, games: { <id>: { id, createdAt, updatedAt,
 *                         finishedAt, source, meta, review, analyzed } } }
 *   current.json        the game on the board: { v, sgf, size, rules,
 *                         moves, savedAt, ...its meta }
 *
 * `meta` holds what the history list shows without parsing the SGF (size,
 * moves, result, date, names, thumbnail) and how the game was played
 * (opponent, rank, impl, humanColor, rating …). `analysis` is the
 * whole-game analysis (one point per position, packed: data/pack.js) and
 * `review` the post-game review built from it (play/review-model.js), so
 * both live with their game and go when it goes.
 *
 * The game files are read only when one is needed (the store opens
 * `games/` lazily); the history, Today and the background analysis read
 * the index, which every save and delete keeps up to date and initIndex
 * rebuilds from the files when it is missing or behind. getGame answers at
 * once: the whole record when its file is read, else what the index knows
 * (sgf, analysis and report null, `loaded` false); loadGame reads the file.
 * Saving or patching a game whose file is not read yet changes the index at
 * once and the file as soon as it is read, so nothing in it is lost.
 *
 * Readers get a record: the file flattened, meta fields at the top, with
 * `report` for `review` (getGame, listGames). The current game and the
 * history are kept apart; a game in progress that is replaced is saved to
 * the history as unfinished (app/play-ctl.js parkCurrent) and opening it
 * continues it.
 *
 * Deleting from the Library can be undone for a few seconds: see
 * trashGame, restoreGame and commitTrash below.
 */
import { store as appStore } from "./store.js";
import { CURRENT_KEY, GAMES_PREFIX, INDEX_KEY, STORE_V } from "./migrate.js";
import { packAnalysis } from "./pack.js";

export { CURRENT_KEY, GAMES_PREFIX, INDEX_KEY, packAnalysis };
const FILE_FIELDS = ["id", "createdAt", "updatedAt", "finishedAt", "source", "sgf"];
const ID = /^[a-z0-9_-]+$/;

let store = appStore;
/** Tests point the module at their own store (null: the app's again). */
export function useStore(s) {
  store = s || appStore;
}

export const gameKey = (id) => `${GAMES_PREFIX}${id}.json`;
const idOfKey = (key) => {
  const id = key.startsWith(GAMES_PREFIX) && key.endsWith(".json") ? key.slice(GAMES_PREFIX.length, -5) : "";
  return ID.test(id) ? id : null;
};

function newId() {
  return Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
}

/** Final position as one character per point: b, w or '.'. */
export function thumbnail(game) {
  const line = game.mainLine();
  const node = line[line.length - 1];
  return node.board.signMap.map((row) => row.map((v) => (v > 0 ? "b" : v < 0 ? "w" : ".")).join("")).join("");
}

/** A record's ruleset; anything missing or unknown is Japanese. */
export function recordRules(rec) {
  return ["japanese", "chinese", "korean"].includes(rec?.rules) ? rec.rules : "japanese";
}

/** What the history list shows of a game, without parsing it again. */
export function describeGame(game) {
  return {
    size: game.size,
    rules: game.rules,
    komi: game.komi,
    handicap: game.handicap,
    moves: Math.max(0, game.mainLine().length - 1),
    result: game.mainLine().at(-1)?.result || game.current.result || null,
    date: game.dateText || (game.date instanceof Date && !Number.isNaN(game.date.getTime()) ? game.date.toISOString() : ""),
    playerBlack: game.playerBlack,
    playerWhite: game.playerWhite,
    thumb: thumbnail(game),
  };
}

/** A game played here that has no result: saved when it was replaced, or by hand mid-game. */
export function isUnfinished(rec) {
  return !!rec && rec.source === "game" && !rec.result;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/* ------------------------------------------------------------- the index */

/** What the index keeps of a file. */
function entryOf(file) {
  if (!isObject(file) || typeof file.id !== "string" || !ID.test(file.id) || typeof file.sgf !== "string") return null;
  const r = isObject(file.review) ? file.review : null;
  return {
    id: file.id,
    createdAt: file.createdAt ?? null,
    updatedAt: file.updatedAt ?? null,
    finishedAt: file.finishedAt ?? null,
    source: file.source ?? null,
    meta: isObject(file.meta) ? file.meta : {},
    review: r ? { v: r.v ?? null, confidence: r.confidence ?? null, lineKey: r.lineKey ?? null, swing: swingOf(r) } : null,
    analyzed: Array.isArray(file.analysis) && file.analysis.length > 0,
  };
}

/**
 * The biggest swing of a stored review, for the history's row: { index,
 * loss } of the costliest key moment KataGo found, or null (no review, the
 * offline estimate, or no moment with a loss).
 */
function swingOf(review) {
  if (review.swing && Number.isFinite(review.swing.index) && Number.isFinite(review.swing.loss)) return { index: review.swing.index, loss: review.swing.loss };
  if (review.confidence !== "high" || !Array.isArray(review.moments)) return null;
  let top = null;
  for (const mo of review.moments) if (Number.isFinite(mo?.loss) && Number.isFinite(mo?.index) && mo.loss > 0 && (!top || mo.loss > top.loss)) top = { index: mo.index, loss: Math.round(mo.loss * 2) / 2 };
  return top;
}

const validEntry = (e) => isObject(e) && typeof e.id === "string" && ID.test(e.id) && isObject(e.meta);

/** store → Map(id → entry): the index in memory. */
const indexes = new WeakMap();

/**
 * The index of the store in use. Built at once from what is in memory (the
 * files read, the stored index for the rest) when initIndex has not run;
 * a file neither read nor indexed is left out until initIndex reads it.
 */
function index() {
  let m = indexes.get(store);
  if (m) return m;
  m = new Map();
  const stored = store.get(INDEX_KEY);
  const games = isObject(stored?.games) ? stored.games : {};
  for (const key of store.list(GAMES_PREFIX)) {
    const id = idOfKey(key);
    if (!id) continue;
    const e = store.isLoaded(key) ? entryOf(store.get(key)) : validEntry(games[id]) ? games[id] : null;
    if (e) m.set(id, e);
  }
  indexes.set(store, m);
  return m;
}

function saveIndex() {
  store.put(INDEX_KEY, { v: STORE_V, games: Object.fromEntries(index()) });
}

/**
 * At boot, after the store opened: the index, checked against the game
 * files on disk. Files the index does not know (or a missing index) are
 * read, side by side; entries without a file are dropped; the index is
 * written again when it changed. Returns the number of game files read.
 */
export async function initIndex() {
  commitTrash();
  indexes.delete(store);
  const stored = store.get(INDEX_KEY);
  const games = stored && isObject(stored.games) ? stored.games : null;
  const keys = store.list(GAMES_PREFIX).filter(idOfKey);
  const missing = keys.filter((k) => !store.isLoaded(k) && !validEntry(games?.[idOfKey(k)]));
  // Side by side, a few at a time (a format migration reads every game once).
  let next = 0;
  const worker = async () => {
    while (next < missing.length) await store.load(missing[next++]).catch(() => {});
  };
  await Promise.all(Array.from({ length: Math.min(8, missing.length) }, worker));
  const m = index();
  const ids = games ? Object.keys(games) : [];
  const changed = !games || stored.v !== STORE_V || missing.length > 0 || ids.length !== m.size || ids.some((id) => !m.has(id));
  if (changed && m.size + ids.length > 0) saveIndex();
  return missing.length;
}

/** The record readers use, from a file. */
function toRecord(file) {
  const e = entryOf(file);
  if (!e) return null;
  const rec = { ...e.meta };
  for (const k of FILE_FIELDS) rec[k] = file[k] ?? null;
  rec.report = file.review ?? null;
  rec.analysis = file.analysis ?? null;
  return withInfo(rec, e, true);
}

/** The record readers use, from the index (the file is not read). */
function entryRecord(e) {
  const rec = { ...e.meta };
  for (const k of FILE_FIELDS) rec[k] = e[k] ?? null;
  rec.sgf = null;
  rec.report = null;
  rec.analysis = null;
  return withInfo(rec, e, false);
}

/** Whether the review and analysis are there, as the index says (wantsAnalysis reads these). */
function withInfo(rec, e, loaded) {
  rec.reviewV = e.review?.v ?? null;
  rec.reviewConfidence = e.review?.confidence ?? null;
  rec.swing = e.review?.swing ?? null;
  rec.analyzed = !!e.analyzed;
  rec.loaded = loaded;
  return rec;
}

function readFile(id) {
  const f = store.get(gameKey(id));
  return f && typeof f === "object" ? f : null;
}

function writeFile(file) {
  const out = file.v === STORE_V ? file : { ...file, v: STORE_V };
  store.put(gameKey(out.id), out);
  // A game held for an undo stays out of the index (a change that was
  // waiting for its file lands in the file alone).
  if (trashed(out.id)) return;
  const e = entryOf(out);
  if (e) index().set(out.id, e);
  saveIndex();
}

/** The game file is on disk but not read yet. */
const unread = (id) => store.has(gameKey(id)) && !store.isLoaded(gameKey(id));

/** A file-shaped stand-in from the index, for a change made before the file is read. */
function shellOf(id) {
  const e = index().get(id);
  return e ? { id, createdAt: e.createdAt, updatedAt: e.updatedAt, finishedAt: e.finishedAt, source: e.source, sgf: "", meta: { ...e.meta }, review: e.review, analysis: e.analyzed ? [] : undefined } : null;
}

/**
 * Change a game's file with `fn(file) → file`. When the file is not read
 * yet the index changes now and the file once it is read (fn runs again on
 * the real file). Returns the record of the result.
 */
function change(id, fn) {
  if (!unread(id)) {
    const out = fn(readFile(id));
    if (!out) return null;
    writeFile(out);
    return toRecord(out);
  }
  const shell = shellOf(id);
  // (No entry either: saveGame starts the file afresh in the index; a patch has nothing to show.)
  const preview = fn(shell);
  if (preview) {
    const e = entryOf({ ...preview, sgf: preview.sgf || "" });
    if (e) {
      // What the index knows until the file is read (the review and analysis stay as they were).
      index().set(id, { ...e, review: shell?.review ?? null, analyzed: !!index().get(id)?.analyzed });
      saveIndex();
    }
  }
  store
    .load(gameKey(id))
    .then(() => {
      const f = readFile(id);
      const out = f ? fn(f) : null;
      if (out) writeFile(out);
    })
    .catch(() => {});
  return preview ? entryRecord(index().get(id)) : null;
}

/** Every game, most recently changed first (from the index: no file is read). */
export function listGames() {
  const out = [];
  for (const [id, e] of index()) {
    const file = store.isLoaded(gameKey(id)) ? readFile(id) : null;
    out.push(file ? toRecord(file) || entryRecord(e) : entryRecord(e));
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** A game's record: whole when its file is read, else the index's (sgf null, `loaded` false). */
export function getGame(id) {
  if (!id || !ID.test(String(id)) || trashed(id)) return null;
  if (!unread(id)) return toRecord(readFile(id));
  const e = index().get(id);
  return e ? entryRecord(e) : null;
}

/** The file of a game is read (getGame has its sgf, analysis and review). */
export function isLoaded(id) {
  return !!id && ID.test(String(id)) && !unread(id);
}

/** Read a game's file; its whole record, or null (missing, or unreadable: the store said so). */
export async function loadGame(id) {
  if (!id || !ID.test(String(id)) || trashed(id)) return null;
  try {
    await store.load(gameKey(id));
  } catch (_) {
    return null;
  }
  const rec = toRecord(readFile(id));
  if (rec) {
    const e = entryOf(readFile(id));
    const had = index().get(id);
    // An index entry behind its file (an older version saved it) is brought up to date.
    if (e && JSON.stringify(had) !== JSON.stringify(e)) {
      index().set(id, e);
      saveIndex();
    }
  }
  return rec;
}

/**
 * Save a game (a new file, or the file `id`); returns its record.
 * `source` is "game" for a game played here, "import" for an opened SGF;
 * the rest of the options go to its meta. `keepPlace` keeps an edited game
 * where it is in the history instead of moving it to the top. `finishedAt`
 * is set the first time a game is saved with a result.
 * @param {any} game
 * @param {{ id?: string, name?: string, source?: string, keepPlace?: boolean, [meta: string]: any }} [opts]
 */
export function saveGame(game, { id = null, name = "", source = "game", keepPlace = false, ...meta } = {}) {
  const now = Date.now();
  const sgf = game.toSGF();
  const desc = describeGame(game);
  const apply = (existing) => {
    const file = existing ? { ...existing, meta: { ...(existing.meta || {}) } } : { id: id || newId(), createdAt: now, updatedAt: now, finishedAt: null, source, sgf: "", meta: {} };
    const hadResult = !!file.meta.result;
    Object.assign(file.meta, desc, meta, { name: name || file.meta.name || "" });
    delete file.meta.id;
    file.sgf = sgf;
    if (existing && keepPlace) file.meta.editedAt = now;
    else file.updatedAt = now;
    if (file.meta.result && !hadResult && !file.finishedAt) file.finishedAt = now;
    return file;
  };
  // Saving over a game that is waiting for its undo: the delete happens first.
  if (id && trashed(id)) commitTrash();
  if (id && store.has(gameKey(id))) return change(id, apply);
  const file = apply(null);
  writeFile(file);
  return toRecord(file);
}

/**
 * Merge fields into a game without moving it in the history. `report` and
 * `analysis` go to the file's review and analysis (null removes them); the
 * file's times and source to the file; everything else to its meta. The id
 * and the moves (saveGame) are not patched.
 */
export function patchGame(id, patch) {
  if (!id || !ID.test(String(id)) || trashed(id) || !store.has(gameKey(id))) return null;
  const packed = { ...(patch || {}) };
  if (packed.analysis != null) packed.analysis = packAnalysis(packed.analysis);
  return change(id, (f) => {
    if (!f) return null;
    const file = { ...f, meta: { ...(f.meta || {}) } };
    for (const [k, v] of Object.entries(packed)) {
      if (k === "report" || k === "review" || k === "analysis") {
        const field = k === "analysis" ? "analysis" : "review";
        if (v == null) delete file[field];
        else file[field] = v;
      } else if (k === "createdAt" || k === "updatedAt" || k === "finishedAt" || k === "source") file[k] = v;
      else if (!FILE_FIELDS.includes(k)) file.meta[k] = v;
    }
    return file;
  });
}

export function renameGame(id, name) {
  return patchGame(id, { name: String(name || "").slice(0, 120) });
}

export function deleteGame(id) {
  if (!id || !ID.test(String(id))) return;
  if (trashed(id)) trash.delete(store);
  const known = store.has(gameKey(id));
  if (known) store.remove(gameKey(id));
  if (index().delete(id) || known) saveIndex();
}

/* ------------------------------------------------- delete, with an undo */

/*
 * A delete the player can take back (the Library's "Deleted · Undo").
 *
 *   trashGame(id)      the game leaves the list at once; its file stays
 *   restoreGame(id)    put it back exactly as it was (file and index entry)
 *   commitTrash()      delete the file for good
 *
 * One game is held at a time, in memory only: trashing another commits the
 * one before, and so does writing everything out (the app does that before
 * it quits, a backup or a restore: app/controller.js). While it is held
 * the game is gone for every reader (listGames, getGame, loadGame) and
 * cannot be patched; saving a game under its id commits the delete first.
 * Should the app die before the commit, the file is still there and the
 * next start lists the game again (initIndex): an undo, never a loss.
 */

/** store → { id, entry, at }: the game held, and where it was in the index. */
const trash = new WeakMap();
/** Stores whose flush commits the trash. */
const hooked = new WeakSet();
const trashed = (id) => trash.get(store)?.id === id;

/** The id of the game held for an undo, or null. */
export function trashedGame() {
  return trash.get(store)?.id ?? null;
}

/** Take a game out of the history, keeping its file for restoreGame. Returns its id, or null when there is no such game. */
export function trashGame(id) {
  if (!id || !ID.test(String(id))) return null;
  commitTrash();
  const m = index();
  const entry = m.get(id);
  if (!entry) return null;
  trash.set(store, { id, entry, at: [...m.keys()].indexOf(id) });
  // Writing everything out (quit, a backup) makes the delete final.
  if (!hooked.has(store) && typeof store.onFlush === "function") {
    const st = store;
    st.onFlush(() => commitTrashOf(st));
    hooked.add(st);
  }
  m.delete(id);
  saveIndex();
  return id;
}

/** Put the held game back: the same index entry in the same place; its file was never touched. */
export function restoreGame(id) {
  const held = trash.get(store);
  if (!held || held.id !== id) return false;
  trash.delete(store);
  const m = index();
  const entries = [...m];
  entries.splice(Math.min(held.at, entries.length), 0, [held.id, held.entry]);
  m.clear();
  for (const [k, v] of entries) m.set(k, v);
  saveIndex();
  return true;
}

/** Delete the held game's file for good. Returns the id deleted, or null when nothing was held. */
export function commitTrash() {
  return commitTrashOf(store);
}

function commitTrashOf(st) {
  const held = trash.get(st);
  if (!held) return null;
  trash.delete(st);
  if (st.has(gameKey(held.id))) st.remove(gameKey(held.id));
  return held.id;
}

/**
 * Filter the list: kind "all" | "won" | "lost" | "imported"; `query`
 * matches name and player names. Wins and losses are from the player's side.
 */
export function filterGames(games, { kind = "all", query = "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return games.filter((g) => {
    if (kind === "imported" && g.source !== "import") return false;
    if (kind === "won" || kind === "lost") {
      if (g.source === "import" || !g.result || g.opponent !== "ai") return false;
      // A draw (or a result with no winner) is neither won nor lost.
      if (!/^[BW]\+/i.test(g.result)) return false;
      const won = /^B/i.test(g.result) === (g.humanColor !== -1);
      if ((kind === "won") !== won) return false;
    }
    if (!q) return true;
    return [g.name, g.playerBlack, g.playerWhite].some((v) => String(v || "").toLowerCase().includes(q));
  });
}

/** How the list can be ordered. */
export const SORTS = ["newest", "oldest", "result"];

/** 0 won, 1 lost, 2 anything else (a draw, a game between two people, an imported record), for the "result" order. */
function resultRank(g) {
  if (g.source === "import" || g.opponent !== "ai" || !/^[BW]\+/i.test(g.result || "")) return 2;
  return /^B/i.test(g.result) === (g.humanColor !== -1) ? 0 : 1;
}

/**
 * Order a list of records: "newest" (most recently changed first, as
 * listGames gives them), "oldest", or "result" (your wins, then your
 * losses, then the rest; newest first within each). Returns a new array.
 */
export function sortGames(games, sort = "newest") {
  const byNew = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  const out = [...games];
  if (sort === "oldest") return out.sort((a, b) => byNew(b, a));
  if (sort === "result") return out.sort((a, b) => resultRank(a) - resultRank(b) || byNew(a, b));
  return out.sort(byNew);
}

/**
 * The history in its two groups: games left unfinished (isUnfinished), and
 * everything else (finished games, imported records, boards saved from the
 * free board). Each keeps the order it came in.
 */
export function groupGames(games) {
  const unfinished = [];
  const finished = [];
  for (const g of games) (isUnfinished(g) ? unfinished : finished).push(g);
  return { unfinished, finished };
}

/** Delete several games for good (an import taken back, the unfinished games cleared). Returns how many went. */
export function deleteGames(ids) {
  let n = 0;
  for (const id of ids || []) {
    if (!id || !ID.test(String(id)) || !index().has(id)) continue;
    deleteGame(id);
    n++;
  }
  return n;
}

/* ---------------------------------------------------- the game on the board */

export function saveCurrent(game, meta = {}) {
  store.put(CURRENT_KEY, { ...meta, v: STORE_V, sgf: game.toSGF(), size: game.size, rules: game.rules, moves: game.moveNumber, savedAt: Date.now() });
}

export function loadCurrent() {
  const v = store.get(CURRENT_KEY);
  return v && typeof v === "object" ? v : null;
}

export function clearCurrent() {
  if (store.has(CURRENT_KEY)) store.remove(CURRENT_KEY);
}
