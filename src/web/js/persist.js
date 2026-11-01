/**
 * The one door to stored state.
 *
 * Settings, learning progress and the current game are small JSON values.
 * The library is its own key because it is the largest and because a quota
 * failure there must not take the settings down with it. Every read is
 * guarded: a corrupt value falls back to a fresh default instead of breaking
 * the first frame.
 */
export const KEYS = {
  settings: "goban-studio.settings.v1",
  progress: "goban-studio.progress.v1",
  current: "goban-studio.current.v1",
  library: "goban-studio.library.v1",
};

export const DEFAULT_SETTINGS = {
  lang: null,
  theme: "wood",
  coords: true,
  sound: true,
  numbers: false,
  level: 2,
  firstRun: true,
};

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

export function loadSettings() {
  const s = readJSON(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...s };
}

export function saveSettings(settings) {
  return writeJSON(KEYS.settings, settings);
}

export function loadProgress() {
  const p = readJSON(KEYS.progress, {});
  return {
    lessons: p.lessons && typeof p.lessons === "object" ? p.lessons : {},
    puzzles: p.puzzles && typeof p.puzzles === "object" ? p.puzzles : {},
    daily: p.daily && typeof p.daily === "object" ? p.daily : null,
    streak: p.streak && typeof p.streak === "object" ? p.streak : { count: 0, last: null },
  };
}

export function saveProgress(progress) {
  return writeJSON(KEYS.progress, progress);
}

export function markLesson(progress, id) {
  progress.lessons[id] = { done: true, at: Date.now() };
  saveProgress(progress);
  return progress;
}

const LADDER = [1, 3, 7, 21];
const DAY = 86400000;
export function todayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function markPuzzle(progress, id, correct) {
  const prev = progress.puzzles[id] || { solved: false, attempts: 0, streak: 0, due: 0, last: 0 };
  const next = { ...prev, attempts: prev.attempts + 1, last: Date.now() };
  if (correct) {
    next.solved = true;
    next.streak = (prev.streak || 0) + 1;
    const rung = Math.min(LADDER.length - 1, Math.max(0, next.streak - 1));
    next.due = Date.now() + LADDER[rung] * DAY;
  } else {
    next.streak = 0;
    next.due = Date.now();
  }
  progress.puzzles[id] = next;
  saveProgress(progress);
  return progress;
}

export function duePuzzles(progress, all, limit = 5, now = Date.now()) {
  const due = all.filter((p) => {
    const e = progress.puzzles[p.id];
    return e && !e.solved ? true : e && e.due && e.due <= now;
  });
  const rest = all.filter((p) => !due.includes(p));
  const out = [];
  for (const p of due) {
    if (out.length >= limit) break;
    out.push(p);
  }
  let seed = Number(todayKey().replace(/-/g, "")) || 1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const shuffled = rest.slice().sort(() => rand() - 0.5);
  for (const p of shuffled) {
    if (out.length >= limit) break;
    out.push(p);
  }
  return out;
}

export function touchStreak(progress) {
  const today = todayKey();
  if (progress.streak.last === today) return progress;
  const yesterday = todayKey(new Date(Date.now() - DAY));
  progress.streak.count = progress.streak.last === yesterday ? (progress.streak.count || 0) + 1 : 1;
  progress.streak.last = today;
  saveProgress(progress);
  return progress;
}
