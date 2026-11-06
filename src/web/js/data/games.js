/**
 * v9 games (docs/v9.md, "Storage"): one file per game, and the game in
 * progress, in the store (data/store.js).
 *
 *   games/<id>.json   { id, createdAt, updatedAt, finishedAt, source, sgf,
 *                       meta, analysis?, review? }
 *   current.json      the game on the board: { sgf, size, rules, moves,
 *                       savedAt, ...its meta }
 *
 * `meta` holds what the history list shows without parsing the SGF (size,
 * moves, result, date, names, thumbnail) and how the game was played
 * (opponent, rank, impl, humanColor, rating …). `analysis` is the
 * whole-game analysis (one point per position) and `review` the post-game
 * review built from it (app/report-model.js), so both live with their game
 * and go when it goes.
 *
 * Readers get a record: the file flattened, meta fields at the top, with
 * `report` for `review` (getGame, listGames). The current game and the
 * history are kept apart: an abandoned game never fills the history.
 */
import { store as appStore } from "./store.js";

export const CURRENT_KEY = "current.json";
export const GAMES_PREFIX = "games/";
const FILE_FIELDS = ["id", "createdAt", "updatedAt", "finishedAt", "source", "sgf"];

let store = appStore;
/** Tests point the module at their own store (null: the app's again). */
export function useStore(s) {
  store = s || appStore;
}

export const gameKey = (id) => `${GAMES_PREFIX}${id}.json`;

export function newId() {
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
    date: game.date instanceof Date ? game.date.toISOString() : String(game.date),
    playerBlack: game.playerBlack,
    playerWhite: game.playerWhite,
    thumb: thumbnail(game),
  };
}

/** A stored file → the record readers use. */
function toRecord(file) {
  if (!file || typeof file !== "object" || typeof file.id !== "string" || typeof file.sgf !== "string") return null;
  const rec = { ...(file.meta || {}) };
  for (const k of FILE_FIELDS) rec[k] = file[k] ?? null;
  rec.report = file.review ?? null;
  rec.analysis = file.analysis ?? null;
  return rec;
}

function readFile(id) {
  const f = store.get(gameKey(id));
  return f && typeof f === "object" ? f : null;
}

function writeFile(file) {
  store.put(gameKey(file.id), file);
}

/** Every game, most recently changed first. */
export function listGames() {
  const out = [];
  for (const key of store.list(GAMES_PREFIX)) {
    const rec = toRecord(store.get(key));
    if (rec) out.push(rec);
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getGame(id) {
  if (!id || !/^[a-z0-9_-]+$/.test(String(id))) return null;
  return toRecord(readFile(id));
}

/**
 * Save a game (a new file, or the file `id`); returns its record.
 * `source` is "game" for a game played here, "import" for an opened SGF;
 * the rest of the options go to its meta. `keepPlace` keeps an edited game
 * where it is in the history instead of moving it to the top. `finishedAt`
 * is set the first time a game is saved with a result.
 */
export function saveGame(game, { id = null, name = "", source = "game", keepPlace = false, ...meta } = {}) {
  const existing = id ? readFile(id) : null;
  const now = Date.now();
  const file = existing ? { ...existing, meta: { ...(existing.meta || {}) } } : { id: id || newId(), createdAt: now, updatedAt: now, finishedAt: null, source, sgf: "", meta: {} };
  const hadResult = !!file.meta.result;
  Object.assign(file.meta, describeGame(game), meta, { name: name || file.meta.name || "" });
  delete file.meta.id;
  file.sgf = game.toSGF();
  if (existing && keepPlace) file.meta.editedAt = now;
  else file.updatedAt = now;
  if (file.meta.result && !hadResult && !file.finishedAt) file.finishedAt = now;
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
  const f = readFile(id);
  if (!f) return null;
  const file = { ...f, meta: { ...(f.meta || {}) } };
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === "report" || k === "review" || k === "analysis") {
      const field = k === "analysis" ? "analysis" : "review";
      if (v == null) delete file[field];
      else file[field] = v;
    } else if (k === "createdAt" || k === "updatedAt" || k === "finishedAt" || k === "source") file[k] = v;
    else if (!FILE_FIELDS.includes(k)) file.meta[k] = v;
  }
  writeFile(file);
  return toRecord(file);
}

export function renameGame(id, name) {
  return patchGame(id, { name: String(name || "").slice(0, 120) });
}

export function deleteGame(id) {
  if (readFile(id)) store.remove(gameKey(id));
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

/* ---------------------------------------------------- the game on the board */

export function saveCurrent(game, meta = {}) {
  store.put(CURRENT_KEY, { ...meta, sgf: game.toSGF(), size: game.size, rules: game.rules, moves: game.moveNumber, savedAt: Date.now() });
}

export function loadCurrent() {
  const v = store.get(CURRENT_KEY);
  return v && typeof v === "object" ? v : null;
}

export function clearCurrent() {
  if (store.has(CURRENT_KEY)) store.remove(CURRENT_KEY);
}
