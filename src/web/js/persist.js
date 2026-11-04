/**
 * The one door to stored state.
 *
 * Settings, learning progress and the game on the board are small JSON
 * values. The library is its own key because it is the largest and because
 * a quota failure there must not take the settings down with it. Every read
 * is guarded: a corrupt value falls back to a fresh default instead of
 * breaking the first frame.
 *
 * v2 keys replace the v1 keys. `migrate()` runs once at start: it carries
 * settings, opening/classic progress, the streak, the current game and the
 * library forward, and leaves the v1 keys untouched so a downgrade still
 * finds them.
 */
export const KEYS = {
  settings: "goban-studio.settings.v2",
  progress: "goban-studio.progress.v2",
  current: "goban-studio.current.v2",
  library: "goban-studio.library.v2",
};

export const V1_KEYS = {
  settings: "goban-studio.settings.v1",
  progress: "goban-studio.progress.v1",
  current: "goban-studio.current.v1",
  library: "goban-studio.library.v1",
};

export const DEFAULT_SETTINGS = {
  lang: null,
  appearance: "auto", // auto | light | dark
  board: "plain", // plain | wood | ink (v4)
  coords: true,
  sound: true,
  numbers: false,
  strength: "25k",
  playerRank: null, // self-assessed kyu (30…1) or dan as negative; null = new player
  experience: null, // "new" | "rules" | "player"
  onboarded: false,
  focus: false,
  // v3
  teaching: null, // null = decide from level (on for newer players)
  confirmMove: false, // two-click placement
  showEval: false, // win-rate bar while playing
  timeControl: "none", // none | move30 | byoyomi
  liveAnalysis: true, // candidate overlay in review
  autoStrength: true, // follow the rating when suggesting an opponent
  flatStones: false, // high-contrast flat stones (accessibility)
  // v4
  boardSize: 19, // the size you last chose for a new game
  autoUpdateCheck: false, // opt-in: ask GitHub for the latest release once a week
  // v5
  humanStyle: true, // with the optional human SL model installed, the opponent plays human-style
  v4: true, // settings have been through the v4 migration
};

/** v3 surfaces → v4 materials. */
const BOARD_V4 = { kaya: "plain", wood: "plain", katsura: "wood", paper: "plain", slate: "ink" };

const memory = new Map();

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch (_) {
    /* file:// or a locked-down WebView */
  }
  return {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  };
}

export function readJSON(key, fallback) {
  try {
    const raw = storage().getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    storage().setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export function removeKey(key) {
  try {
    storage().removeItem(key);
  } catch (_) {}
}

const LEVEL_TO_STRENGTH = { 1: "25k", 2: "20k", 3: "15k", 4: "10k", 5: "5k" };

/** Carry v1 data forward once. Safe to call on every start. */
export function migrate() {
  const has = (k) => {
    try {
      return storage().getItem(k) != null;
    } catch (_) {
      return false;
    }
  };
  if (!has(KEYS.settings) && has(V1_KEYS.settings)) {
    const v1 = readJSON(V1_KEYS.settings, {});
    const next = { ...DEFAULT_SETTINGS };
    if (v1.lang) next.lang = v1.lang;
    if (typeof v1.coords === "boolean") next.coords = v1.coords;
    if (typeof v1.sound === "boolean") next.sound = v1.sound;
    if (typeof v1.numbers === "boolean") next.numbers = v1.numbers;
    if (v1.theme === "night") {
      next.appearance = "dark";
      next.board = "ink";
    } else if (v1.theme === "paper") next.board = "plain";
    if (LEVEL_TO_STRENGTH[v1.level]) next.strength = LEVEL_TO_STRENGTH[v1.level];
    // Someone who used v1 has seen the rules and the board.
    next.onboarded = v1.firstRun === false;
    if (next.onboarded) next.experience = "rules";
    writeJSON(KEYS.settings, next);
  }
  if (!has(KEYS.progress) && has(V1_KEYS.progress)) {
    const v1 = readJSON(V1_KEYS.progress, {});
    // v1 lessons and drills no longer exist; openings, classics and the
    // streak do.
    writeJSON(KEYS.progress, {
      ...emptyProgress(),
      openings: v1.openings && typeof v1.openings === "object" ? v1.openings : {},
      classics: v1.classics && typeof v1.classics === "object" ? v1.classics : {},
      streak: v1.streak && typeof v1.streak === "object" ? v1.streak : { count: 0, last: null },
    });
  }
  if (!has(KEYS.current) && has(V1_KEYS.current)) {
    const v1 = readJSON(V1_KEYS.current, null);
    if (v1 && v1.sgf) {
      writeJSON(KEYS.current, {
        sgf: v1.sgf,
        humanColor: v1.humanColor,
        opponent: v1.opponent,
        strength: LEVEL_TO_STRENGTH[v1.level] || DEFAULT_SETTINGS.strength,
        name: v1.name || "",
        savedAt: v1.savedAt || Date.now(),
      });
    }
  }
  if (!has(KEYS.library) && has(V1_KEYS.library)) {
    const v1 = readJSON(V1_KEYS.library, { games: [] });
    const games = (Array.isArray(v1.games) ? v1.games : [])
      .filter((g) => g && typeof g.sgf === "string")
      .map((g) => ({
        ...g,
        strength: LEVEL_TO_STRENGTH[g.level] || null,
        source: "game",
      }));
    writeJSON(KEYS.library, { v: 2, games });
  }
}

export function loadSettings() {
  const s = readJSON(KEYS.settings, {});
  const out = { ...DEFAULT_SETTINGS, ...s };
  if (!["auto", "light", "dark"].includes(out.appearance)) out.appearance = "auto";
  // v4: three materials, and coordinates on for the standard board. A v3
  // user who never touched them had the old defaults (kaya, no coordinates).
  if (!s.v4) {
    out.board = BOARD_V4[out.board] || "plain";
    if (s.coords === false && (s.board === undefined || s.board === "kaya")) out.coords = true;
    out.v4 = true;
  }
  if (!["plain", "wood", "ink"].includes(out.board)) out.board = "plain";
  if (![9, 13, 19].includes(out.boardSize)) out.boardSize = 19;
  return out;
}

export function saveSettings(settings) {
  return writeJSON(KEYS.settings, settings);
}

function emptyProgress() {
  return { lessons: {}, problems: {}, openings: {}, classics: {}, daily: null, streak: { count: 0, last: null }, rating: null, weakness: {}, mistakes: [] };
}

export function loadProgress() {
  const p = readJSON(KEYS.progress, {});
  const obj = (v) => (v && typeof v === "object" ? v : {});
  return {
    lessons: obj(p.lessons),
    problems: obj(p.problems),
    openings: obj(p.openings),
    classics: obj(p.classics),
    daily: p.daily && typeof p.daily === "object" ? p.daily : null,
    streak: p.streak && typeof p.streak === "object" ? p.streak : { count: 0, last: null },
    rating: p.rating && typeof p.rating === "object" && Number.isFinite(p.rating.r) ? p.rating : null,
    weakness: obj(p.weakness),
    mistakes: Array.isArray(p.mistakes) ? p.mistakes.slice(0, 200) : [],
  };
}

/**
 * A mistake from one of your games, kept as a drill: the position before the
 * move (SGF + move index), what you played and what KataGo preferred. It
 * comes back in Today's five on the same spaced-review ladder as problems.
 */
export function addMistake(progress, m) {
  const id = m.id || `${m.gameKey}-${m.index}`;
  if (progress.mistakes.some((x) => x.id === id)) return progress;
  progress.mistakes.unshift({ ...m, id, added: Date.now(), streak: 0, due: Date.now(), attempts: 0 });
  progress.mistakes = progress.mistakes.slice(0, 200);
  saveProgress(progress);
  return progress;
}

export function markMistake(progress, id, { solved }, now = Date.now()) {
  const m = progress.mistakes.find((x) => x.id === id);
  if (!m) return progress;
  m.attempts = (m.attempts || 0) + 1;
  m.streak = solved ? (m.streak || 0) + 1 : 0;
  m.due = now + (solved ? LADDER[Math.min(LADDER.length - 1, m.streak - 1)] : 1) * DAY;
  m.solved = m.solved || solved;
  saveProgress(progress);
  return progress;
}

export function saveProgress(progress) {
  return writeJSON(KEYS.progress, progress);
}

/** A lesson finished, or its furthest step reached. */
export function markLesson(progress, id, { step = null, done = false } = {}) {
  const prev = progress.lessons[id] || { done: false, step: 0 };
  const next = { ...prev, at: Date.now() };
  if (step != null) next.step = Math.max(prev.step || 0, step);
  if (done) next.done = true;
  progress.lessons[id] = next;
  saveProgress(progress);
  return progress;
}

export function markOpening(progress, id) {
  progress.openings[id] = { done: true, at: Date.now() };
  saveProgress(progress);
  return progress;
}

export function markClassic(progress, id) {
  progress.classics[id] = { done: true, at: Date.now() };
  saveProgress(progress);
  return progress;
}

/** Spaced review: 1, 3, 7, 21 days after consecutive clean solves. */
export const LADDER = [1, 3, 7, 21];
export const DAY = 86400000;

export function todayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/**
 * Record one attempt. `clean` is a first-try solve without hint or answer;
 * anything else resets the ladder so the problem comes back tomorrow.
 */
export function markProblem(progress, id, { solved, clean = solved }, now = Date.now()) {
  const prev = progress.problems[id] || { solved: false, attempts: 0, streak: 0, due: 0, last: 0 };
  const next = { ...prev, attempts: prev.attempts + 1, last: now };
  if (solved) next.solved = true;
  if (solved && clean) {
    next.streak = (prev.streak || 0) + 1;
    const rung = Math.min(LADDER.length - 1, next.streak - 1);
    next.due = now + LADDER[rung] * DAY;
  } else {
    next.streak = 0;
    next.due = now + DAY;
  }
  progress.problems[id] = next;
  saveProgress(progress);
  return progress;
}

/**
 * Today's five: problems due for review first, then new problems at the
 * learner's level (the lowest grade with unsolved problems, and one above).
 * Stable for a given day.
 */
export function dailySet(progress, problems, grades, limit = 5, now = Date.now()) {
  const due = problems
    .filter((p) => {
      const e = progress.problems[p.id];
      return e && e.due && e.due <= now;
    })
    .sort((a, b) => progress.problems[a.id].due - progress.problems[b.id].due);
  const out = due.slice(0, limit);
  const unseen = problems.filter((p) => !progress.problems[p.id]);
  const gradeOf = (p) => grades[p.id]?.grade || 1;
  const level = unseen.length ? Math.min(...unseen.map(gradeOf)) : 1;
  let seed = Number(todayKey(new Date(now)).replace(/-/g, "")) || 1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const pool = unseen.filter((p) => gradeOf(p) <= level + 1).sort((a, b) => gradeOf(a) - gradeOf(b) || rand() - 0.5);
  for (const p of pool) {
    if (out.length >= limit) break;
    if (!out.includes(p)) out.push(p);
  }
  for (const p of problems) {
    if (out.length >= limit) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function touchStreak(progress, now = Date.now()) {
  const today = todayKey(new Date(now));
  if (progress.streak.last === today) return progress;
  const yesterday = todayKey(new Date(now - DAY));
  progress.streak.count = progress.streak.last === yesterday ? (progress.streak.count || 0) + 1 : 1;
  progress.streak.last = today;
  saveProgress(progress);
  return progress;
}

export function clearAll() {
  for (const k of [...Object.values(KEYS), ...Object.values(V1_KEYS)]) removeKey(k);
}
