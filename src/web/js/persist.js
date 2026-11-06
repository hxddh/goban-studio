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
  // v7: your own problem collections (problem-import.js, app/collections-store.js)
  collections: "goban-studio.collections.v1",
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
  opponentRank: 30, // v9: the opponent, a rank of the ladder (opponents.js)
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
  v4: true, // settings have been through the v4 migration
  // v5
  defaultRules: "japanese", // japanese | chinese | korean: new games use it unless the New game sheet chooses
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

// v9: v1 levels as ranks of the opponent ladder (opponents.js RANKS; what their settings measured)
const LEVEL_TO_RANK = { 1: 30, 2: 24, 3: 18, 4: 12, 5: 7 };

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
    if (LEVEL_TO_RANK[v1.level]) next.opponentRank = LEVEL_TO_RANK[v1.level];
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
  // v5: progress gains per-game records (and a version).
  if (has(KEYS.progress)) {
    const p = readJSON(KEYS.progress, null);
    if (p && !(p.v >= 5)) writeJSON(KEYS.progress, migrateProgress(p));
  }
  if (!has(KEYS.current) && has(V1_KEYS.current)) {
    const v1 = readJSON(V1_KEYS.current, null);
    if (v1 && v1.sgf) {
      writeJSON(KEYS.current, {
        sgf: v1.sgf,
        humanColor: v1.humanColor,
        opponent: v1.opponent,
        rank: LEVEL_TO_RANK[v1.level] ?? DEFAULT_SETTINGS.opponentRank,
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
        rank: LEVEL_TO_RANK[g.level] ?? null,
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
  // v5: anything but the three rulesets (missing, old, corrupt) is Japanese.
  if (!["japanese", "chinese", "korean"].includes(out.defaultRules)) out.defaultRules = "japanese";
  return out;
}

export function saveSettings(settings) {
  return writeJSON(KEYS.settings, settings);
}

function emptyProgress() {
  return { v: 5, lessons: {}, problems: {}, openings: {}, classics: {}, daily: null, streak: { count: 0, last: null }, rating: null, weakness: {}, mistakes: [], games: [] };
}

/* ------------------------------------------- v5: per-game records */

/** How many per-game records progress keeps (newest first). */
export const MAX_GAME_RECORDS = 50;
export const PHASES = ["opening", "middle", "endgame"];

const num = (v, d = null) => (v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);

function dayOf(at) {
  const d = new Date(at);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/**
 * A stored record of one rated game against the computer (see
 * app/summary.js gameRecord), checked and normalised; null when unusable.
 *   { v: 1, id, at, date, size, rules, komi, handicap, color, opponent,
 *     result, won, moves, confidence: "high" | "low" | null,
 *     phases: { opening|middle|endgame: { loss, mistakes, blunders, moves,
 *               accuracy } } | null,
 *     themes: { theme: count }, themeLoss?: { theme: points } (v7),
 *     rating: { before, after, delta } | null }
 */
export function normalizeGameRecord(r) {
  if (!r || typeof r !== "object") return null;
  const at = num(r.at);
  const size = num(r.size);
  if (at == null || ![9, 13, 19].includes(size)) return null;
  let phases = null;
  if (r.phases && typeof r.phases === "object") {
    phases = {};
    for (const p of PHASES) {
      const s = r.phases[p] && typeof r.phases[p] === "object" ? r.phases[p] : {};
      phases[p] = { loss: num(s.loss, 0), mistakes: num(s.mistakes, 0), blunders: num(s.blunders, 0), moves: num(s.moves, 0), accuracy: num(s.accuracy) };
    }
  }
  const themes = {};
  if (r.themes && typeof r.themes === "object") for (const [k, v] of Object.entries(r.themes)) if (num(v, 0) > 0) themes[k] = num(v);
  // v7 plan: the points each theme cost (app/plan.js themeLosses); older records have none.
  let themeLoss = null;
  if (r.themeLoss && typeof r.themeLoss === "object") {
    themeLoss = {};
    for (const [k, v] of Object.entries(r.themeLoss)) if (num(v, -1) >= 0) themeLoss[k] = num(v);
  }
  const rt = r.rating && typeof r.rating === "object" && num(r.rating.after) != null ? { before: num(r.rating.before), after: num(r.rating.after), delta: num(r.rating.delta, 0) } : null;
  return {
    v: 1,
    id: String(r.id ?? at),
    at,
    date: typeof r.date === "string" && r.date ? r.date : dayOf(at),
    size,
    rules: r.rules ? String(r.rules) : null,
    komi: num(r.komi),
    handicap: num(r.handicap, 0),
    color: r.color === -1 ? -1 : 1,
    opponent: r.opponent ? String(r.opponent) : null,
    result: r.result ? String(r.result) : null,
    won: r.won === true ? true : r.won === false ? false : null,
    moves: num(r.moves, 0),
    confidence: phases ? (r.confidence === "high" ? "high" : "low") : null,
    phases,
    themes,
    ...(themeLoss ? { themeLoss } : {}),
    rating: rt,
  };
}

/** Records as stored → a clean list, newest first, bounded. */
export function normalizeGameRecords(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const r = normalizeGameRecord(raw);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_GAME_RECORDS);
}

/** Add or replace (same id) a record and save. */
export function addGameRecord(progress, record, { save = true } = {}) {
  const rec = normalizeGameRecord(record);
  if (!rec) return null;
  progress.games = normalizeGameRecords([rec, ...(progress.games || []).filter((g) => g.id !== rec.id)]);
  if (save) saveProgress(progress);
  return rec;
}

/** Merge fields into a stored record (by id) and save; null when missing. */
export function updateGameRecord(progress, id, patch, { save = true } = {}) {
  const i = (progress.games || []).findIndex((g) => g.id === String(id));
  if (i < 0) return null;
  const rec = normalizeGameRecord({ ...progress.games[i], ...patch });
  if (!rec) return null;
  progress.games[i] = rec;
  if (save) saveProgress(progress);
  return rec;
}

/**
 * v5 progress migration. v2–v4 progress has no `v` and no `games`; it gains
 * an empty list. Rating history is kept as it is: the trend view reads it
 * for games that were played before records existed.
 */
export function migrateProgress(p) {
  const out = p && typeof p === "object" ? p : {};
  out.games = normalizeGameRecords(out.games);
  out.v = 5;
  return out;
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
    // v5
    v: 5,
    games: normalizeGameRecords(p.games),
    // v7: the training plan's focus, kept for the week it was chosen in.
    planWeek: p.planWeek && Number.isFinite(p.planWeek.weekStart) && Array.isArray(p.planWeek.focus) ? p.planWeek : null,
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
 * Solved later in the same visit, after a miss already counted: the problem
 * is solved (not clean); the review schedule the miss set stays.
 */
export function markSolvedLate(progress, id, now = Date.now()) {
  const prev = progress.problems[id];
  if (!prev) return markProblem(progress, id, { solved: true, clean: false }, now);
  progress.problems[id] = { ...prev, solved: true, last: now };
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

/** v8: the calendar day before `now` (24 hours back is not, on a 23-hour day). */
function yesterdayKey(now) {
  const d = new Date(now);
  return todayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

/**
 * v8: the streak as it stands now: a streak whose last day is neither
 * today nor yesterday is broken, and shows as 0 until the next practice.
 */
export function currentStreak(progress, now = Date.now()) {
  const s = progress?.streak;
  if (!s || !(s.count > 0)) return 0;
  return s.last === todayKey(new Date(now)) || s.last === yesterdayKey(now) ? s.count : 0;
}

export function touchStreak(progress, now = Date.now()) {
  const today = todayKey(new Date(now));
  if (progress.streak.last === today) return progress;
  const yesterday = yesterdayKey(now);
  progress.streak.count = progress.streak.last === yesterday ? (progress.streak.count || 0) + 1 : 1;
  progress.streak.last = today;
  saveProgress(progress);
  return progress;
}

export function clearAll() {
  for (const k of [...Object.values(KEYS), ...Object.values(V1_KEYS)]) removeKey(k);
}

/* ---------------------------------------------------------------- backup */

export const BACKUP_FORMAT = 1;

/**
 * Everything the player owns, as one JSON document: settings, progress
 * (rating, lessons, problems, mistakes, trends), the game in progress and the
 * library. Nothing else is stored anywhere, so this is a complete backup.
 */
export function exportBackup(appVersion = "", now = new Date()) {
  const data = {};
  for (const [name, key] of Object.entries(KEYS)) data[name] = readJSON(key, null);
  return { app: "goban-studio", format: BACKUP_FORMAT, version: appVersion, exportedAt: now.toISOString(), data };
}

/**
 * Validate a backup document. Returns { ok, error?, summary? } without
 * writing anything; `restoreBackup` writes it.
 */
export function checkBackup(doc) {
  if (!doc || typeof doc !== "object" || doc.app !== "goban-studio") return { ok: false, error: "notBackup" };
  if (!Number.isInteger(doc.format) || doc.format > BACKUP_FORMAT) return { ok: false, error: "newerFormat" };
  const d = doc.data;
  if (!d || typeof d !== "object") return { ok: false, error: "notBackup" };
  for (const name of Object.keys(KEYS)) if (d[name] != null && typeof d[name] !== "object") return { ok: false, error: "damaged" };
  const games = Array.isArray(d.library?.games) ? d.library.games.length : 0;
  const lessons = d.progress?.lessons ? Object.values(d.progress.lessons).filter((x) => x?.done).length : 0;
  const problems = d.progress?.problems ? Object.values(d.progress.problems).filter((x) => x?.solved).length : 0;
  return { ok: true, summary: { games, lessons, problems, exportedAt: doc.exportedAt || null, version: doc.version || "" } };
}

/** Replace all stored data with the backup (call checkBackup first). */
export function restoreBackup(doc) {
  const c = checkBackup(doc);
  if (!c.ok) return c;
  // Snapshot first: a full or locked storage must not leave half a restore.
  const before = {};
  for (const key of Object.values(KEYS)) {
    try {
      before[key] = storage().getItem(key);
    } catch (_) {
      return { ok: false, error: "storage" };
    }
  }
  let failed = false;
  for (const [name, key] of Object.entries(KEYS)) {
    if (doc.data[name] == null) removeKey(key);
    else if (!writeJSON(key, doc.data[name])) {
      failed = true;
      break;
    }
  }
  if (!failed) return c;
  for (const [key, raw] of Object.entries(before)) {
    try {
      if (raw == null) storage().removeItem(key);
      else storage().setItem(key, raw);
    } catch (_) {}
  }
  return { ok: false, error: "storage" };
}
