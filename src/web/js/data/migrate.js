/**
 * Versions of the stored files and the steps between them
 * (docs/storage.md, "Versions and migrations").
 *
 * Every file the data layer owns carries its format version as `v`:
 * settings.json, current.json, games-index.json and games/<id>.json. v9 to
 * Wrote them without one and in the same format, so a file without `v`
 * is a v9 file. A file is brought to STORE_V one step at a time
 * (MIGRATIONS[n] turns version n into n + 1) when it is read: when the
 * store opens or loads it (data/store.js `migrate`), and for every file of
 * a backup being restored (data/backup.js). A file of a newer version than
 * this app knows is refused, never rewritten: the store write-blocks it and
 * the app says so (app/safety.jsx).
 *
 * profile.json is the player model's (model/player.js): its `v` is
 * PROFILE_V and normalizeProfile moves it on; here it is only refused when
 * it is newer than that. Other keys (the practice session, the update state,
 * the analysis queue) belong to their modules, which check them.
 */
import { NewerVersionError } from "./store.js";
import { packAnalysis } from "./pack.js";
import { PROFILE_V } from "../model/player.js";

/** The format this version writes. */
export const STORE_V = 13;
/** A file without `v`: v9 to v12 wrote that format. */
export const LEGACY_V = 9;

export const PROFILE_KEY = "profile.json";
export const SETTINGS_KEY = "settings.json";
export const CURRENT_KEY = "current.json";
export const INDEX_KEY = "games-index.json";
export const GAMES_PREFIX = "games/";

/** Keys whose files carry the store's version. */
export function versioned(key) {
  return key === SETTINGS_KEY || key === CURRENT_KEY || key === INDEX_KEY || (key.startsWith(GAMES_PREFIX) && key.endsWith(".json"));
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (key, value) => value;

/**
 * MIGRATIONS[n](key, value) → the value in version n + 1. Each step is
 * pure and returns the value itself when it changes nothing.
 */
export const MIGRATIONS = {
  // v9 → v10, v10 → v11, v11 → v12: the stored format did not change.
  9: same,
  10: same,
  11: same,
  // v12 → v13: a game's analysis keeps one settled share per position and
  // ownership maps only around the key moments (data/pack.js).
  12: (key, value) => {
    if (key.startsWith(GAMES_PREFIX) && Array.isArray(value.analysis)) return { ...value, analysis: packAnalysis(value.analysis) };
    return value;
  },
};

/** The version a stored value says it is (LEGACY_V when it says nothing usable). */
export function versionOf(value) {
  const v = value?.v;
  return Number.isInteger(v) && v >= LEGACY_V ? v : LEGACY_V;
}

/**
 * A file as read → `{ value, changed }` in the current format; throws
 * NewerVersionError for a file of a newer version. The store's `migrate`.
 */
export function migrateFile(key, value) {
  if (key === PROFILE_KEY) {
    if (isObject(value) && Number.isInteger(value.v) && value.v > PROFILE_V) throw new NewerVersionError(value.v);
    return { value, changed: false };
  }
  if (!versioned(key) || !isObject(value)) return { value, changed: false };
  let v = versionOf(value);
  if (v > STORE_V) throw new NewerVersionError(v);
  let out = value;
  for (; v < STORE_V; v++) out = MIGRATIONS[v](key, out);
  if (out.v === STORE_V) return { value: out, changed: out !== value };
  return { value: { ...out, v: STORE_V }, changed: true };
}
