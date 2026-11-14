/**
 * The stored profile (profile.json): its shape and limits, an empty one, and
 * any stored value read into a valid current profile. Pure.
 *
 *   profile = {
 *     v: 13,                                         // v9–v12 files say 9
 *     rating: { [size]: { mu, sigma, games, at } },  // Glicko, measured ladder
 *     history: [{ at, size, rank, pm, r?, sd? }],    // after each rated game
 *     games: [{ id, at, size, result, won, ... }],    // own games, newest 30
 *     problems: { [id]: { tries, solved, clean, last, due, streak, solvedAt?,
 *                         s, d, reps, lapses, rating, retired?,     // FSRS-style memory
 *                         first?, seen? } },   // the first-sight result and when
 *     mistakes: [{ id, gameId, index, theme, loss, due, ... }],  // own games only
 *     lessons: { [id]: { done, step, at } },
 *     classics: { [id]: { done, at } },             // classic games played through
 *     week: { start, focus: [key], areas? } | null,   // this week's focus, kept
 *     days: { [yyyymmdd]: count },                  // games finished and problems tried per local day
 *     marks: { [milestone]: at },                   // one-time milestones, when first reached
 *   }
 *
 * `first`, `seen`, `days`, `marks`, a game's `assisted` and a history
 * point's `r`/`sd` are optional additions to the version-13 file: a file
 * without them reads as before (nothing to migrate), and a record whose
 * first-sight result is not known is left out of the solving level.
 */
import { SIZES, gorToTheta, isLevel, rankToRating } from "./ladder.js";
import { normalizeMoveRank } from "./move-rank.js";
import { MAX_HISTORY, MU_MAX, MU_MIN, PROFILE_MIN_V, PROFILE_V, SIGMA0, priorRating } from "./rating.js";
import { finite, num, obj, round, trimDays } from "./util.js";
import { migrateProblemRecord, migrateReview } from "./memory.js";

/* ====================================================== profile and shape */

export const MAX_GAMES = 30;
export const MAX_MISTAKES = 200;
export const PHASES = ["opening", "middle", "endgame"];

/**
 * A new, empty profile. `rank` is the rank the player gave at onboarding
 * (the prior of every board's estimate); null is 30 kyu.
 */
export function newProfile({ rank = null, at = 0 } = {}) {
  const rating = {};
  for (const size of SIZES) rating[size] = priorRating(rank, at);
  return { v: PROFILE_V, rating, history: [], games: [], problems: {}, mistakes: [], lessons: {}, classics: {}, week: null, placement: null, days: {}, marks: {} };
}

/**
 * The prior moves with the rank the player gives, for every board that has
 * no rated game yet; a board with games keeps its estimate.
 */
export function setPriorRank(profile, rank, at = 0) {
  const p = normalizeProfile(profile);
  const rating = { ...p.rating };
  for (const size of SIZES) if (!(rating[size]?.games > 0)) rating[size] = priorRating(rank, at);
  return { ...p, rating };
}

/**
 * A stored game record, checked and normalised; null when unusable.
 *   { id, at, size, result, won, rated, level, mode, handicap, color,
 *     moves, confidence: "high" | "low" | null,
 *     phases: { opening|middle|endgame: { loss, mistakes, blunders, moves, accuracy } } | null,
 *     themes: { theme: count }, themeLoss?: { theme: points },
 *     moveRank?: { rank, lo, hi, n }, moveRankUsed?,  // model/move-rank.js
 *     assisted?: true, undos?, hints?,   // played with an undo or a hint: never rated
 *     rating: { before, after, delta } | null }   // GoR around this game's rating step
 */
export function normalizeGame(r) {
  if (!obj(r)) return null;
  const at = num(r.at);
  const size = num(r.size);
  if (at == null || !SIZES.includes(size)) return null;
  let phases = null;
  if (obj(r.phases)) {
    phases = {};
    for (const p of PHASES) {
      const s = obj(r.phases[p]) || {};
      phases[p] = { loss: num(s.loss, 0), mistakes: num(s.mistakes, 0), blunders: num(s.blunders, 0), moves: num(s.moves, 0), accuracy: num(s.accuracy) };
    }
  }
  const themes = {};
  if (obj(r.themes)) for (const [k, v] of Object.entries(r.themes)) if (num(v, 0) > 0) themes[k] = num(v);
  let themeLoss = null;
  if (obj(r.themeLoss)) {
    themeLoss = {};
    for (const [k, v] of Object.entries(r.themeLoss)) if (num(v, -1) >= 0) themeLoss[k] = num(v);
  }
  const rt = obj(r.rating) && num(r.rating.after) != null ? { before: num(r.rating.before), after: num(r.rating.after), delta: num(r.rating.delta, 0) } : null;
  const moveRank = normalizeMoveRank(r.moveRank);
  const undos = Math.max(0, Math.floor(num(r.undos, 0)));
  const hints = Math.max(0, Math.floor(num(r.hints, 0)));
  const assisted = r.assisted === true || undos > 0 || hints > 0;
  return {
    id: String(r.id ?? at),
    at,
    size,
    result: r.result ? String(r.result) : null,
    won: r.won === true ? true : r.won === false ? false : null,
    rated: r.rated === true,
    level: isLevel(r.level) ? r.level : null,
    mode: r.mode === "human" || r.mode === "strong" ? r.mode : "standard",
    handicap: num(r.handicap, 0),
    color: r.color === -1 ? -1 : 1,
    moves: num(r.moves, 0),
    confidence: phases ? (r.confidence === "high" ? "high" : "low") : null,
    phases,
    themes,
    ...(themeLoss ? { themeLoss } : {}),
    ...(moveRank ? { moveRank } : {}),
    ...(r.moveRankUsed === true ? { moveRankUsed: true } : {}),
    ...(assisted ? { assisted: true } : {}),
    ...(undos ? { undos } : {}),
    ...(hints ? { hints } : {}),
    rating: rt,
  };
}

/**
 * The reading from the player's own moves (model/move-rank.js) as a
 * weak prior. Only while a board's estimate rests on fewer than
 * MOVE_RANK.MAX_GAMES rated games, and as a measurement of at least
 * MOVE_RANK.SIGMA nats (about six ranks around 15 kyu): it moves a fresh
 * estimate part of the way and narrows it a little; results against the
 * measured levels soon outweigh it (docs/strength.md, "v13: your moves").
 */
export const MOVE_RANK = { SIGMA: 4, MAX_GAMES: 5 };

export function applyMoveRank(entry, moveRank) {
  const mr = normalizeMoveRank(moveRank);
  if (!entry || !mr || !finite(entry.mu) || (entry.games || 0) >= MOVE_RANK.MAX_GAMES) return entry;
  const at = (rank) => gorToTheta(rankToRating(rank));
  const m = at(mr.rank);
  const sm = Math.max(MOVE_RANK.SIGMA, Math.abs(at(mr.hi) - at(mr.lo)) / 2);
  const s2 = entry.sigma * entry.sigma;
  const v = 1 / (1 / s2 + 1 / (sm * sm));
  const mu = v * (entry.mu / s2 + m / (sm * sm));
  return { ...entry, mu: round(Math.min(MU_MAX, Math.max(MU_MIN, mu))), sigma: round(Math.sqrt(v)) };
}

/** Records as stored → a clean list, newest first, at most MAX_GAMES. */
export function normalizeGames(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const r = normalizeGame(raw);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_GAMES);
}

function normalizeRatingEntry(e) {
  if (!obj(e) || !finite(e.mu) || !finite(e.sigma) || e.sigma <= 0) return null;
  return { mu: Math.min(MU_MAX, Math.max(MU_MIN, e.mu)), sigma: Math.min(SIGMA0, e.sigma), games: Math.max(0, Math.floor(num(e.games, 0))), at: num(e.at, 0) };
}

function normalizeProblem(e) {
  return migrateProblemRecord(e);
}

function normalizeMistake(m) {
  if (!obj(m) || typeof m.id !== "string" || !m.id || m.own === false) return null;
  return { ...m, ...migrateReview(m), added: num(m.added, 0), last: num(m.last), solved: m.solved === true };
}

/**
 * Any stored value → a valid current profile. A v9–v12 profile (v: 9) is
 * migrated field by field (migrateProblemRecord, migrateReview, the
 * placement cap); anything else starts empty (v9 reads no earlier data);
 * bad parts are dropped. Idempotent.
 */
export function normalizeProfile(raw) {
  if (!obj(raw) || !Number.isInteger(raw.v) || raw.v < PROFILE_MIN_V || raw.v > PROFILE_V) return newProfile();
  const base = newProfile();
  const rating = {};
  for (const size of SIZES) rating[size] = normalizeRatingEntry(raw.rating?.[size]) || base.rating[size];
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((h) => obj(h) && finite(h.at) && SIZES.includes(h.size) && finite(h.rank) && finite(h.pm))
    .map((h) => ({ at: h.at, size: h.size, rank: h.rank, pm: h.pm, ...(finite(h.r) ? { r: h.r } : {}), ...(finite(h.sd) ? { sd: h.sd } : {}) }))
    .slice(-MAX_HISTORY);
  const problems = {};
  for (const [id, e] of Object.entries(obj(raw.problems) || {})) {
    const n = normalizeProblem(e);
    if (n) problems[id] = n;
  }
  const seen = new Set();
  const mistakes = [];
  for (const m of Array.isArray(raw.mistakes) ? raw.mistakes : []) {
    const n = normalizeMistake(m);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    mistakes.push(n);
  }
  const lessons = {};
  for (const [id, e] of Object.entries(obj(raw.lessons) || {})) {
    if (obj(e)) lessons[id] = { done: e.done === true, step: Math.max(0, Math.floor(num(e.step, 0))), at: num(e.at, 0) };
  }
  const classics = {};
  for (const [id, e] of Object.entries(obj(raw.classics) || {})) if (obj(e) && e.done === true) classics[id] = { done: true, at: num(e.at, 0) };
  const w = obj(raw.week);
  let week = null;
  if (w && finite(w.start) && Array.isArray(w.focus) && w.focus.every((k) => typeof k === "string")) {
    week = { start: w.start, focus: w.focus.slice(0, RULES.MAX_FOCUS) };
    // The evidence each focus was chosen on, as it was then (optional).
    const areas = Array.isArray(w.areas) ? w.areas.filter((a) => obj(a) && week.focus.includes(a.key)) : [];
    if (areas.length) week.areas = JSON.parse(JSON.stringify(areas));
  }
  const pl = obj(raw.placement);
  let placement = null;
  if (pl && pl.skipped === true) placement = { skipped: true, at: num(pl.at, 0) };
  // A placement is never above PLACEMENT.MAX_GRADE (v10–v12 stored up to 5).
  else if (pl && finite(pl.grade) && pl.grade >= 1 && pl.grade <= 5) placement = { grade: Math.min(PLACEMENT.MAX_GRADE, Math.round(pl.grade)), at: num(pl.at, 0) };
  const days = {};
  for (const [k, v] of Object.entries(obj(raw.days) || {})) if (/^\d{8}$/.test(k) && num(v, 0) > 0) days[k] = Math.floor(num(v));
  const marks = {};
  for (const [k, v] of Object.entries(obj(raw.marks) || {})) if (finite(v)) marks[k] = v;
  return { v: PROFILE_V, rating, history, games: normalizeGames(raw.games), problems, mistakes: mistakes.slice(0, MAX_MISTAKES), lessons, classics, week, placement, days: trimDays(days), marks };
}

/* ============================================================ the focus */

/** Thresholds of the model (docs/plan.md). */
export const RULES = {
  WINDOW_GAMES: 10, // the newest analysed games considered…
  WINDOW_DAYS: 90, // …played in the last 90 days
  GAME_HALF_LIFE: 5, // a game five games back weighs half as much
  MIN_GAMES: 3, // analysed games before any game-based claim
  MIN_GAMES_WITH: 2, // a theme must come up in at least two games…
  MIN_POINTS: 6, // …and cost at least this many points (when the points are known)
  MIN_MISTAKES: 3, // …or, without points, come up at least three times
  COUNT_POINTS: 4, // a mistake of unknown cost counts as this many points for ranking
  ENDGAME_MIN_GAMES: 3, // KataGo-analysed games before an endgame claim
  ENDGAME_PER_GAME: 5, // average endgame loss per game, in points…
  ENDGAME_SHARE: 0.4, // …and at least this share of all the points lost
  ENDGAME_WEIGHT: 0.5, // endgame points rank at half weight
  PROBLEM_WINDOW_DAYS: 60, // problem results older than this are ignored
  PROBLEM_HALF_LIFE_DAYS: 21,
  MIN_PROBLEMS: 4, // problems tried in a theme before a claim
  MISS_RATE: 0.5, // missed at least half of them (recency-weighted)…
  MISS_MARGIN: 0.15, // …and clearly more than usual (once 10+ problems are tried)
  MISS_POINTS: 3, // a missed problem ranks like a three-point mistake
  LEVEL_MIN: 5, // problems tried at a grade before it can set the level
  LEVEL_CLEAN: 0.6, // smoothed clean-solve rate that counts as "solves this grade"…
  LEVEL_FLOOR: 0.5, // …with every lower grade that has results at least this
  LEVEL_PRIOR_WEIGHT: 2, // pseudo-results pulling a grade's rate towards the prior level
  PRIOR_AT: 0.75, // expected clean rate at or below the prior level…
  PRIOR_ABOVE: 0.35, // …and above it
  STRETCH: 1, // the stretch problem is this many grades above the level, never more
  MAX_FOCUS: 2,
  BACKLOG_PER_PLACE: 2, // a new problem keeps its place in the day until more than this many reviews per place are due
  MAX_DRILLS: 2, // drills from your games in one day's path
  DAILY_SIZES: [3, 5, 10], // problem items in a day's path (the player's choice)
  DAILY_SIZE: 5, // …by default
};

/* ============================================================ placement */

/**
 * The placement quiz, adaptive and randomised. Someone who
 * already knows the rules answers 10–12 problems before Practice's first path,
 * and the result sets where the course starts and which problems come
 * first, until their own results measure a solving level.
 *
 * A staircase: the first problem is grade START, each solved one moves a
 * grade up, each missed one a grade down (never above MAX_GRADE). Which
 * problem of that grade is drawn per player (a seed), mixing themes, with
 * at least LIFE life-and-death problems (kill or live). The quiz ends after
 * MIN problems when the grade it gives has not changed over the last
 * STABLE answers, else after MAX — and at once, at grade 1, when the first
 * FLOOR answers are all missed (grade 2, then grade 1 three times: more
 * problems would only be more misses).
 */
export const PLACEMENT = { MIN: 10, MAX: 12, START: 2, MAX_GRADE: 4, LIFE: 3, STABLE: 3, PASS: 2, FLOOR: 4, STRICT_FROM: 3, GOALS: ["capture", "save", "kill", "live"], LIFE_GOALS: ["kill", "live"] };
