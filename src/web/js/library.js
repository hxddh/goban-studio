/**
 * Saved games and the one game in progress.
 *
 * v2 keeps two things apart:
 *   - the current game: exactly one, overwritten on every move, offered as
 *     "Continue";
 *   - the library: games the player finished, saved on purpose, or imported.
 * An abandoned game never fills the library. A record is the SGF plus the
 * facts the list needs without parsing (size, moves, result, date) and a
 * compact final-position thumbnail.
 */
import { KEYS, readJSON, writeJSON, removeKey } from "./persist.js";

export const MAX_GAMES = 500;

export function listGames() {
  const v = readJSON(KEYS.library, { games: [] });
  const games = Array.isArray(v.games) ? v.games : [];
  return games.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function writeGames(games) {
  return writeJSON(KEYS.library, { v: 2, games: games.slice(0, MAX_GAMES) });
}

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

export function describeGame(game) {
  return {
    size: game.size,
    // v5: "japanese" | "chinese" | "korean". Records saved before v5 have
    // "japanese" here (or nothing); read them with recordRules().
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

/**
 * Save (or update) a record. `source` is "game" for a game played here,
 * "import" for an opened SGF.
 */
export function saveGame(game, { id = null, name = "", source = "game", ...meta } = {}) {
  const games = listGames();
  const existing = id ? games.find((g) => g.id === id) : null;
  const rec = existing || { id: id || newId(), createdAt: Date.now(), source };
  Object.assign(rec, describeGame(game), meta, {
    sgf: game.toSGF(),
    name: name || rec.name || "",
    updatedAt: Date.now(),
  });
  const next = games.filter((g) => g.id !== rec.id);
  next.unshift(rec);
  writeGames(next);
  return rec;
}

export function renameGame(id, name) {
  const games = listGames();
  const rec = games.find((g) => g.id === id);
  if (!rec) return null;
  rec.name = String(name || "").slice(0, 120);
  writeGames(games);
  return rec;
}

export function deleteGame(id) {
  const next = listGames().filter((g) => g.id !== id);
  writeGames(next);
  return next;
}

export function getGame(id) {
  return listGames().find((g) => g.id === id) || null;
}

export function clearLibrary() {
  writeGames([]);
}

/**
 * Filter the list: kind "all" | "won" | "lost" | "imported"; `query` matches
 * name and player names. Wins and losses are from the player's side.
 */
export function filterGames(games, { kind = "all", query = "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return games.filter((g) => {
    if (kind === "imported" && g.source !== "import") return false;
    if (kind === "won" || kind === "lost") {
      if (g.source === "import" || !g.result || g.opponent !== "ai") return false;
      const blackWon = g.result.startsWith("B");
      const humanBlack = g.humanColor !== -1;
      const won = blackWon === humanBlack && !/draw/i.test(g.result);
      if ((kind === "won") !== won) return false;
    }
    if (!q) return true;
    return [g.name, g.playerBlack, g.playerWhite].some((v) => String(v || "").toLowerCase().includes(q));
  });
}

export function saveCurrent(game, meta = {}) {
  return writeJSON(KEYS.current, {
    ...meta,
    sgf: game.toSGF(),
    size: game.size,
    rules: game.rules,
    moves: game.moveNumber,
    savedAt: Date.now(),
  });
}

export function loadCurrent() {
  return readJSON(KEYS.current, null);
}

export function clearCurrent() {
  removeKey(KEYS.current);
}
