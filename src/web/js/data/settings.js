/**
 * Settings: `settings.json` in the store (data/store.js).
 *
 *   loadSettings(store)       the stored settings over the defaults, checked
 *   saveSettings(store, s)    write them (debounced by the store)
 *
 * Pure apart from the store it is given; a missing or broken value falls
 * back to the default of that one setting, never to an error, and a number
 * outside its range is brought into it. The file carries the store's
 * format version `v` (data/migrate.js); the settings themselves do not.
 */
import { SETTINGS_KEY, STORE_V } from "./migrate.js";

export { SETTINGS_KEY };

export const DEFAULT_SETTINGS = {
  lang: null,
  appearance: "auto", // auto | light | dark
  coords: true,
  volume: "normal", // off | quiet | normal | loud (audio.js VOLUME_LEVELS)
  numbers: false,
  lastMoveMark: true, // the mark on the last stone played
  boardStyle: "standard", // standard | contrast (theme.js boardPalette)
  opponentRank: 30, // the opponent, a rank of the ladder (opponents.js)
  playerRank: null, // self-assessed kyu (30…1) or dan as 0, -1 …; null = new player
  experience: null, // "new" | "rules" | "player"
  onboarded: false,
  focus: false,
  largeText: false,
  teaching: null, // null = decide from the estimate (on for newer players)
  confirmMove: false, // two-click placement
  confirmProblemMove: false, // Two-click placement in problems
  showEval: false, // win-rate bar while playing
  timeControl: "none", // none | move30 | byoyomi
  liveAnalysis: true, // candidate overlay in review
  autoStrength: true, // follow the estimate when suggesting an opponent
  boardSize: 19, // the size last chosen for a new game
  autoUpdateCheck: false, // opt-in: ask GitHub for the latest release once a week
  // japanese | chinese | korean; null = never chosen: the rules of the
  // interface language (rulesForLang), read through defaultRulesOf.
  defaultRules: null,
  captureWins: 0, // capture Go games won (the beginner bridge, Practice)
  dailySize: 5, // problem items in a day of Practice: 3 | 5 | 10 (model/player.js RULES.DAILY_SIZES)
  firstCountSeen: false, // the one-time note on the first count was shown
};

/**
 * Ranks (the app's encoding: kyu 30…1, 0 = 1 dan, -1 = 2 dan …): the
 * opponent is a rank of the ladder (opponents.js RANKS, 30 … 6 dan), the
 * player's own rank 30 kyu … 9 dan.
 */
const OPPONENT_RANKS = [-6, 30];
const PLAYER_RANKS = [-8, 30];
/** Capture Go games won: a count, kept to a sane size. */
const MAX_COUNT = 1e6;

const clampInt = (v, [lo, hi]) => Math.max(lo, Math.min(hi, Math.round(v)));

const ONE_OF = {
  appearance: ["auto", "light", "dark"],
  boardSize: [9, 13, 19],
  defaultRules: [null, "japanese", "chinese", "korean"],
  volume: ["off", "quiet", "normal", "loud"],
  boardStyle: ["standard", "contrast"],
  timeControl: ["none", "move30", "byoyomi"],
  experience: [null, "new", "rules", "player"],
  dailySize: [3, 5, 10],
  lang: [null, "zh", "en", "ko", "ja"], // i18n.js LANG_IDS (null: detect)
};

/**
 * The rules a new profile starts with, by interface language: Chinese
 * rules (komi 7.5) in Chinese, Korean rules in Korean, Japanese rules in
 * Japanese and English.
 */
export function rulesForLang(lang) {
  return lang === "zh" ? "chinese" : lang === "ko" ? "korean" : "japanese";
}

/** The rules new games use: the player's choice, else those of the interface language. */
export function defaultRulesOf(settings) {
  return settings?.defaultRules || rulesForLang(settings?.lang);
}

/** Any stored value → complete settings. */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = { ...DEFAULT_SETTINGS, ...s };
  // Sound was a switch before it was a volume: off stays off.
  if (s.volume === undefined && s.sound === false) out.volume = "off";
  delete out.sound;
  // A settings file from before the rules followed the language always
  // carried the rules in use; one of an onboarded player without them
  // (older still) played Japanese rules. Only a new profile has none.
  if (s.defaultRules === undefined && s.onboarded === true) out.defaultRules = "japanese";
  for (const [k, allowed] of Object.entries(ONE_OF)) if (!allowed.includes(out[k])) out[k] = DEFAULT_SETTINGS[k];
  for (const k of ["coords", "numbers", "lastMoveMark", "onboarded", "focus", "largeText", "confirmMove", "confirmProblemMove", "showEval", "liveAnalysis", "autoStrength", "autoUpdateCheck", "firstCountSeen"]) {
    if (typeof out[k] !== "boolean") out[k] = DEFAULT_SETTINGS[k];
  }
  if (out.teaching !== true && out.teaching !== false) out.teaching = null;
  if (!Number.isFinite(out.opponentRank)) out.opponentRank = DEFAULT_SETTINGS.opponentRank;
  out.opponentRank = clampInt(out.opponentRank, OPPONENT_RANKS);
  if (out.playerRank != null && !Number.isFinite(out.playerRank)) out.playerRank = null;
  if (out.playerRank != null) out.playerRank = clampInt(out.playerRank, PLAYER_RANKS);
  if (!Number.isFinite(out.captureWins) || out.captureWins < 0) out.captureWins = 0;
  out.captureWins = Math.min(MAX_COUNT, Math.floor(out.captureWins));
  // The file's version is the store's business, not a setting.
  delete out.v;
  return out;
}

export function loadSettings(store) {
  return normalizeSettings(store.get(SETTINGS_KEY));
}

export function saveSettings(store, settings) {
  store.put(SETTINGS_KEY, { ...settings, v: STORE_V });
}
