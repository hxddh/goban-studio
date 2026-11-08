/**
 * v9 settings: `settings.json` in the store (data/store.js).
 *
 *   loadSettings(store)       the stored settings over the defaults, checked
 *   saveSettings(store, s)    write them (debounced by the store)
 *
 * Pure apart from the store it is given; a missing or broken value falls
 * back to the default of that one setting, never to an error.
 */
export const SETTINGS_KEY = "settings.json";

export const DEFAULT_SETTINGS = {
  lang: null,
  appearance: "auto", // auto | light | dark
  coords: true,
  sound: true,
  numbers: false,
  opponentRank: 30, // the opponent, a rank of the ladder (opponents.js)
  playerRank: null, // self-assessed kyu (30…1) or dan as 0, -1 …; null = new player
  experience: null, // "new" | "rules" | "player"
  onboarded: false,
  focus: false,
  largeText: false,
  teaching: null, // null = decide from the estimate (on for newer players)
  confirmMove: false, // two-click placement
  confirmProblemMove: false, // v13: two-click placement in problems
  showEval: false, // win-rate bar while playing
  timeControl: "none", // none | move30 | byoyomi
  liveAnalysis: true, // candidate overlay in review
  autoStrength: true, // follow the estimate when suggesting an opponent
  boardSize: 19, // the size last chosen for a new game
  autoUpdateCheck: false, // opt-in: ask GitHub for the latest release once a week
  defaultRules: "japanese", // japanese | chinese | korean
  captureWins: 0, // capture Go games won (the beginner bridge, Learn)
  firstCountSeen: false, // the one-time note on the first count was shown
};

const ONE_OF = {
  appearance: ["auto", "light", "dark"],
  boardSize: [9, 13, 19],
  defaultRules: ["japanese", "chinese", "korean"],
  timeControl: ["none", "move30", "byoyomi"],
  experience: [null, "new", "rules", "player"],
};

/** Any stored value → complete settings. */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = { ...DEFAULT_SETTINGS, ...s };
  for (const [k, allowed] of Object.entries(ONE_OF)) if (!allowed.includes(out[k])) out[k] = DEFAULT_SETTINGS[k];
  for (const k of ["coords", "sound", "numbers", "onboarded", "focus", "largeText", "confirmMove", "confirmProblemMove", "showEval", "liveAnalysis", "autoStrength", "autoUpdateCheck", "firstCountSeen"]) {
    if (typeof out[k] !== "boolean") out[k] = DEFAULT_SETTINGS[k];
  }
  if (out.teaching !== true && out.teaching !== false) out.teaching = null;
  if (!Number.isFinite(out.opponentRank)) out.opponentRank = DEFAULT_SETTINGS.opponentRank;
  if (out.playerRank != null && !Number.isFinite(out.playerRank)) out.playerRank = null;
  if (!Number.isFinite(out.captureWins) || out.captureWins < 0) out.captureWins = 0;
  return out;
}

export function loadSettings(store) {
  return normalizeSettings(store.get(SETTINGS_KEY));
}

export function saveSettings(store, settings) {
  store.put(SETTINGS_KEY, settings);
}
