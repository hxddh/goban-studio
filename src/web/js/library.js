/**
 * Saved games and the game currently on the board.
 *
 * A record is the SGF plus the handful of facts the list needs without
 * parsing: size, move count, result, date. The library is capped so a quota
 * failure cannot grow without bound.
 */
import { KEYS, readJSON, writeJSON } from "./persist.js";

export const MAX_GAMES = 200;

export function listGames() {
  const v = readJSON(KEYS.library, { games: [] });
  const games = Array.isArray(v.games) ? v.games : [];
  return games.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function writeGames(games) {
  return writeJSON(KEYS.library, { v: 1, games: games.slice(0, MAX_GAMES) });
}

export function newId() {
  return Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
}

export function describeGame(game) {
  return {
    size: game.size,
    rules: game.rules,
    komi: game.komi,
    handicap: game.handicap,
    moves: game.moveNumber,
    result: game.current.result || null,
    date: game.date instanceof Date ? game.date.toISOString() : String(game.date),
  };
}

export function saveGame(game, { id = null, name = "", ...meta } = {}) {
  const games = listGames();
  const desc = describeGame(game);
  const sgf = game.toSGF();
  const existing = id ? games.find((g) => g.id === id) : null;
  const rec = existing || {
    id: id || newId(),
    createdAt: Date.now(),
  };
  Object.assign(rec, desc, meta, {
    sgf,
    name: name || rec.name || "",
    updatedAt: Date.now(),
  });
  const next = games.filter((g) => g.id !== rec.id);
  next.unshift(rec);
  writeGames(next);
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

export function saveCurrent(game, meta = {}) {
  const desc = describeGame(game);
  return writeJSON(KEYS.current, {
    ...desc,
    ...meta,
    sgf: game.toSGF(),
    savedAt: Date.now(),
  });
}

export function loadCurrent() {
  return readJSON(KEYS.current, null);
}

export function clearCurrent() {
  return writeJSON(KEYS.current, null);
}
