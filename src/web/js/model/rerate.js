/**
 * Counting a finished game again (the review's "Count again") can change
 * who won, and so what the game did to the strength estimate. A rating
 * step cannot be taken out of the middle of the estimate, so it is
 * replaced only while it is the last one on its board size:
 *
 *   rateBase(profile, size)       what to keep before a game is recorded:
 *                                 the estimate's state on that board and
 *                                 the length of the rating history
 *   canRerate(profile, id, base)  the game's rating can be replaced now
 *   rerateGame(profile, id, { won, result, opponent, base })
 *                                 the profile with the game recorded again
 *                                 from `base` under its new result
 *
 * A game that was never rated and has no base (assisted, too short, a
 * draw) can always be recorded again: nothing has to be taken back.
 */
import { normalizeProfile } from "./profile.js";
import { recordGame } from "./record.js";

/** The state to put back if a game recorded next is counted again. */
export function rateBase(profile, size) {
  const p = normalizeProfile(profile);
  const entry = p.rating[size];
  return { size, entry: entry ? { ...entry } : null, history: p.history.length };
}

const touched = (g) => g.rated || g.moveRankUsed;

/**
 * Whether `id`'s rating can be replaced: nothing on its board size was
 * rated after it, and its base is known. (Reads the profile's games as
 * they are: a view may ask on every render.)
 */
export function canRerate(profile, id, base = null) {
  const games = Array.isArray(profile?.games) ? profile.games : [];
  const g = games.find((x) => x.id === String(id));
  if (!g) return false;
  if (!touched(g)) return true;
  if (!base || base.size !== g.size) return false;
  return !games.some((o) => o.id !== g.id && o.size === g.size && o.at >= g.at && touched(o));
}

/**
 * Record the game `id` again with a new result. Its earlier rating step is
 * taken back first (the estimate of its board returns to `base`, and its
 * point leaves the history), then the game is rated as recordGame rates a
 * new one. Returns the profile unchanged when the step cannot be replaced
 * (canRerate).
 * @param {any} profile
 * @param {string} id
 * @param {{ won?: boolean, result?: string, opponent?: any, base?: any }} [change]
 */
export function rerateGame(profile, id, { won, result, opponent = undefined, base = null } = {}) {
  const p = normalizeProfile(profile);
  const g = p.games.find((x) => x.id === String(id));
  if (!g || !canRerate(p, id, base)) return p;
  let { rating, history } = p;
  if (touched(g)) {
    rating = { ...rating };
    if (base.entry) rating[g.size] = { ...base.entry };
    else delete rating[g.size];
    const at = history.findLastIndex((h) => h.at === g.at && h.size === g.size);
    if (g.rated && at >= 0) history = history.filter((_, i) => i !== at);
  }
  const games = p.games.map((x) => (x === g ? { ...x, rated: false, rating: null, moveRankUsed: false, won: null, result: null } : x));
  return recordGame({ ...p, rating, history, games }, { id: g.id, at: g.at, size: g.size, won: won === true ? true : won === false ? false : null, result: result || null, opponent });
}
