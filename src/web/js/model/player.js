/**
 * v9: the one player model (docs/v9.md, "One player model").
 *
 * The only place that knows the player. It replaces the v3 weakness counts,
 * the v5 game records' trend data, the v6 rating, the v7 plan model and the
 * strength estimate's own store. Stored as `profile.json`:
 *
 *   profile = {
 *     v: 13,                                         // v9–v12 files say 9
 *     rating: { [size]: { mu, sigma, games, at } },  // Glicko, measured ladder
 *     history: [{ at, size, rank, pm }],             // after each rated game
 *     games: [{ id, at, size, result, won, ... }],    // own games, newest 30
 *     problems: { [id]: { tries, solved, clean, last, due, streak, solvedAt?,
 *                         s, d, reps, lapses, rating, retired? } },  // v13: FSRS-style
 *     mistakes: [{ id, gameId, index, theme, loss, due, ... }],  // own games only
 *     lessons: { [id]: { done, step, at } },
 *     classics: { [id]: { done, at } },             // classic games played through
 *     week: { start, focus: [key], areas? } | null,   // this week's focus, kept
 *   }
 *
 * Pure: no DOM, no storage, no engine. Mutations return a new profile and
 * never change the one they are given; views only read. Content (lessons,
 * problems, grades) comes in as arguments.
 *
 * Ported, not reinvented:
 *   - the rating: app/strength.js (v6 Glicko against the measured ladder,
 *     v7/v8 calibration; the tables are in model/ladder.js). Each board
 *     size keeps its own estimate, all on the 19×19 θ scale the ranks live on;
 *   - spaced review: persist.js markProblem, markSolvedLate, addMistake,
 *     markMistake; v13 replaced the 1-3-7-21 day ladder with an FSRS-style
 *     memory model (stability and difficulty per item, graded recall);
 *   - the focus: app/plan.js playerModel, weeklyModel with the v8 rule that
 *     the first focus shown in a week is kept for that week, planDaily;
 *   - the next lesson: app/course-path.js pickNextLesson, and the taught
 *     problem pool of app/practice-ctl.js dailyPool;
 *   - the beginner bridges: app/beginner.js;
 *   - game records: persist.normalizeGameRecord, with themes and themeLoss.
 */
import { LEVELS, SIZES, fromBoard, gorToTheta, isLevel, levelTheta, measuredRank, onBoard, rankToRating, ratingToRank, sizeOf, thetaToGoR } from "./ladder.js";
import { normalizeMoveRank } from "./move-rank.js";

export * from "./ladder.js";

/**
 * v13: the profile's own version. Files written by v9–v12 say 9 and are
 * migrated by normalizeProfile (problem and drill records to the memory
 * model, placements capped); anything older than v9 or newer than this
 * starts empty, as before (the data layer refuses to overwrite a newer file).
 */
export const PROFILE_V = 13;
/** The oldest profile version normalizeProfile reads. */
export const PROFILE_MIN_V = 9;
export const DAY = 86400000;

/* =========================================================== the rating */

/** Prior spread around the rank you gave (nats; ≈ 4–6 ranks). */
export const SIGMA0 = 2.5;
/** Uncertainty added before every game (nats), so the estimate keeps moving. */
export const SIGMA_GAME = 0.2;
/** Uncertainty added per day without games (nats per √day). */
export const SIGMA_DAY = 0.1;
/** Measurement error of a level's θ relative to its neighbours (nats). */
export const SIGMA_LEVEL = 0.5;
/** The estimate stays inside 30 kyu − 15 ranks … 9 dan. */
const MU_MIN = gorToTheta(-2400);
const MU_MAX = gorToTheta(2900);
/** A game needs this many moves to be rated (as v6). */
export const MIN_RATED_MOVES = 12;
export const MAX_HISTORY = 200;

const G = 1 / Math.sqrt(1 + (3 * SIGMA_LEVEL * SIGMA_LEVEL) / (Math.PI * Math.PI));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** A rating entry at the prior: the rank you gave (30 kyu when none). */
export function priorRating(rank = null, at = 0) {
  return { mu: round(gorToTheta(rankToRating(rank ?? 30))), sigma: SIGMA0, games: 0, at };
}

/** sigma grown by time away (capped at the prior's). */
export function sigmaAt(entry, at) {
  const days = Math.max(0, (at - (finite(entry.at) ? entry.at : at)) / DAY);
  return Math.min(SIGMA0, Math.sqrt(entry.sigma * entry.sigma + SIGMA_DAY * SIGMA_DAY * days));
}

/** Expected score of a player at `mu` (19×19 θ) against `opp` (board θ). */
export function expectedScore(mu, opp, size = 19) {
  return 1 / (1 + Math.exp(-G * (onBoard(mu, size) - opp)));
}

/**
 * One rated game: a Glicko-1 step in natural units against an opponent of
 * θ `opponent` on that board. The board's θ is a smooth function of 19×19
 * θ, linearised at mu (slope `s`); the level's own measurement error widens
 * the logistic (G).
 */
export function updateRating(entry, { opponent, size = 19, won, at }) {
  const prev = entry && finite(entry.mu) ? entry : priorRating(30, at);
  const sigma0 = Math.min(SIGMA0, Math.sqrt(sigmaAt(prev, at) ** 2 + SIGMA_GAME * SIGMA_GAME));
  const mu = prev.mu;
  const h = 0.01;
  const s = (onBoard(mu + h, size) - onBoard(mu - h, size)) / (2 * h);
  const e = 1 / (1 + Math.exp(-G * (onBoard(mu, size) - opponent)));
  const info = s * s * G * G * e * (1 - e);
  const v = 1 / (1 / (sigma0 * sigma0) + info);
  const next = Math.min(MU_MAX, Math.max(MU_MIN, mu + v * s * G * ((won ? 1 : 0) - e)));
  return { mu: round(next), sigma: round(Math.sqrt(v)), games: (prev.games || 0) + 1, at };
}

/** How a rating entry reads now: rank, ± ranks (at least 1), GoR and band. */
export function readRating(entry, now) {
  const sigma = sigmaAt(entry, now);
  const r = thetaToGoR(entry.mu);
  const lo = thetaToGoR(entry.mu - sigma);
  const hi = thetaToGoR(entry.mu + sigma);
  return { rank: ratingToRank(r), pm: Math.max(1, Math.round((hi - lo) / 200)), r: Math.round(r), lo: Math.round(lo), hi: Math.round(hi), mu: entry.mu, sigma, games: entry.games || 0 };
}

/**
 * The entry that speaks for `size`: that size's own once it has games,
 * else the one with the most games (all are on the 19×19 scale), else
 * that size's prior.
 */
function ratingFor(profile, size, prior = 30) {
  const own = profile?.rating?.[size];
  if (own && own.games > 0) return own;
  const best = bestRated(profile);
  if (best) return profile.rating[best];
  return own || priorRating(prior, 0);
}

/** The size with the most rated games (ties: 19, 13, 9); null without any. */
function bestRated(profile) {
  let best = null;
  for (const size of [19, 13, 9]) {
    const e = profile?.rating?.[size];
    if (e && e.games > 0 && (best == null || e.games > profile.rating[best].games)) best = size;
  }
  return best;
}

/* ====================================================== profile and shape */

export const MAX_GAMES = 30;
export const MAX_MISTAKES = 200;
/**
 * The v9–v12 spaced-review ladder (1, 3, 7, 21 days after consecutive clean
 * solves). v13 schedules with the memory model below; the ladder is kept
 * only to read records written before it (migrateProblemRecord).
 */
export const LADDER = [1, 3, 7, 21];
export const PHASES = ["opening", "middle", "endgame"];

const num = (v, d = null) => (v !== null && v !== "" && v !== undefined && typeof v !== "boolean" && Number.isFinite(Number(v)) ? Number(v) : d);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/**
 * A new, empty profile. `rank` is the rank the player gave at onboarding
 * (the prior of every board's estimate); null is 30 kyu.
 */
export function newProfile({ rank = null, at = 0 } = {}) {
  const rating = {};
  for (const size of SIZES) rating[size] = priorRating(rank, at);
  return { v: PROFILE_V, rating, history: [], games: [], problems: {}, mistakes: [], lessons: {}, classics: {}, week: null, placement: null };
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
 *     moveRank?: { rank, lo, hi, n }, moveRankUsed?,  // v13: model/move-rank.js
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
    rating: rt,
  };
}

/**
 * v13: the reading from the player's own moves (model/move-rank.js) as a
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
    .map((h) => ({ at: h.at, size: h.size, rank: h.rank, pm: h.pm }))
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
  // v13: a placement is never above PLACEMENT.MAX_GRADE (v10–v12 stored up to 5).
  else if (pl && finite(pl.grade) && pl.grade >= 1 && pl.grade <= 5) placement = { grade: Math.min(PLACEMENT.MAX_GRADE, Math.round(pl.grade)), at: num(pl.at, 0) };
  return { v: PROFILE_V, rating, history, games: normalizeGames(raw.games), problems, mistakes: mistakes.slice(0, MAX_MISTAKES), lessons, classics, week, placement };
}

/* ======================================================= the memory model */

/*
 * v13: spaced review after FSRS (the free spaced-repetition scheduler's
 * memory model, v4.5 formulas, its published default weights rounded).
 * Every reviewed item (a problem, a drill from your games) keeps
 *
 *   s  stability: days until the chance of still solving it falls to 90 %
 *   d  difficulty: 1 (easy for you) … 10 (hard for you)
 *
 * and each attempt is graded: 1 again (a miss, a hint or the answer),
 * 2 hard (solved in the same visit after a miss), 3 good (a clean solve),
 * 4 easy (a clean solve, quickly). The next review comes when the chance of
 * solving it (retrievability) has fallen to 90 %, which is about `s` days
 * after the attempt, so intervals grow past 21 days. A miss shrinks the
 * stability instead of resetting it to a day: an item known for months
 * comes back in a few days, not tomorrow. An item whose stability passes
 * RETIRE_DAYS is retired: it is known and leaves review. Overdue items are
 * taken lowest retrievability first, at most REVIEW_CAP a day
 * (docs/plan.md, "Review").
 */
export const MEMORY = {
  RETENTION: 0.9, // review when the chance of solving falls to this
  S0: [0.5, 1.4, 3.7, 13.8], // w0–w3: first stability by grade (days)
  D0: 5, // difficulty of a first "good"
  DSTEP: 0.9, // w6: difficulty change per grade step
  DREVERT: 0.03, // w7: pull towards D0 on each review
  SUCCESS: 5.2, // e^w8: growth of stability on a success
  SDECAY: 0.14, // w9: big stabilities grow more slowly
  RGAIN: 1.05, // w10: a review at lower retrievability grows it more
  HARD: 0.23, // w15: growth factor on "hard"
  EASY: 2.88, // w16: growth factor on "easy"
  LAPSE: 2.1, // w11: stability after a miss…
  LAPSE_D: 0.08, // w12
  LAPSE_S: 0.32, // w13
  LAPSE_R: 1.59, // w14
  MAX_DAYS: 365, // the longest interval
  RETIRE_DAYS: 180, // stability past this: known, out of review
  REVIEW_CAP: 12, // overdue items taken in one day, at most
  QUICK_MS: 10000, // a clean solve faster than this counts as easy
};
export const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

const FACTOR = 19 / 81;
const DECAY = -0.5;
const clampD = (d) => Math.max(1, Math.min(10, d));

/** The chance of still solving an item of stability `s`, `days` after its last attempt. */
export function retrievabilityAfter(days, s) {
  if (!(s > 0)) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, days)) / s, DECAY);
}

/** Retrievability of a stored item at `now` (0 for one never scheduled, 1 for a retired one). */
export function retrievability(e, now) {
  if (!e) return 0;
  if (e.retired) return 1;
  if (!(e.s > 0)) return 0;
  return retrievabilityAfter((now - (e.last || 0)) / DAY, e.s);
}

/** Days until retrievability falls to MEMORY.RETENTION for stability `s` (at least 1). */
export function intervalFor(s) {
  const days = (s / FACTOR) * (Math.pow(MEMORY.RETENTION, 1 / DECAY) - 1);
  return Math.max(1, Math.min(MEMORY.MAX_DAYS, Math.round(days)));
}

/**
 * One graded attempt on an item's memory state { s, d, reps, lapses }
 * (s 0: never scheduled), `last` the time of the attempt before.
 * Returns the next { s, d, reps, lapses }.
 */
export function nextMemory(mem, rating, now, last = null) {
  const M = MEMORY;
  const g = Math.max(1, Math.min(4, Math.round(rating)));
  const reps = (mem?.reps || 0) + 1;
  const lapses = (mem?.lapses || 0) + (g === 1 && mem?.s > 0 ? 1 : 0);
  if (!(mem?.s > 0)) {
    return { s: M.S0[g - 1], d: round(clampD(M.D0 - M.DSTEP * (g - 3)), 2), reps, lapses };
  }
  const days = last != null ? Math.max(0, (now - last) / DAY) : 0;
  const r = retrievabilityAfter(days, mem.s);
  const d0 = mem.d > 0 ? mem.d : M.D0;
  const d = clampD((1 - M.DREVERT) * (d0 - M.DSTEP * (g - 3)) + M.DREVERT * M.D0);
  let s;
  if (g === 1) {
    s = M.LAPSE * Math.pow(d0, -M.LAPSE_D) * (Math.pow(mem.s + 1, M.LAPSE_S) - 1) * Math.exp(M.LAPSE_R * (1 - r));
    s = Math.max(0.2, Math.min(mem.s, s));
  } else {
    const bonus = g === 2 ? M.HARD : g === 4 ? M.EASY : 1;
    s = mem.s * (1 + M.SUCCESS * (11 - d0) * Math.pow(mem.s, -M.SDECAY) * (Math.exp(M.RGAIN * (1 - r)) - 1) * bonus);
    // A review on the day of the last one (r ≈ 1) still counts a little.
    s = Math.max(s, mem.s * (g === 2 ? 1 : 1.2));
  }
  return { s: round(s, 2), d: round(d, 2), reps, lapses };
}

/** The schedule fields after an attempt: memory, due date, retirement. */
function scheduled(mem, now) {
  if (mem.s > MEMORY.RETIRE_DAYS) return { ...mem, due: 0, retired: true };
  return { ...mem, due: now + intervalFor(mem.s) * DAY, retired: false };
}

/**
 * The memory fields of a stored item, whichever version wrote it: v13
 * records have them; a v9–v12 record (the 1-3-7-21 ladder: tries, streak,
 * due, last) gets a stability from where it stood on the ladder and keeps
 * its due date, so no review moves on upgrade.
 */
export function migrateReview(e) {
  const tries = Math.max(0, Math.floor(num(e?.tries, 0)));
  const streak = Math.max(0, Math.floor(num(e?.streak, 0)));
  const due = num(e?.due, 0);
  const base = { tries, streak, due };
  if (finite(e?.s) && e.s >= 0) {
    const retired = e.retired === true;
    return {
      ...base,
      due: retired ? 0 : due,
      s: e.s,
      d: finite(e.d) ? clampD(e.d) : MEMORY.D0,
      reps: Math.max(0, Math.floor(num(e.reps, tries))),
      lapses: Math.max(0, Math.floor(num(e.lapses, 0))),
      rating: finite(e.rating) ? Math.max(1, Math.min(4, Math.round(e.rating))) : null,
      ...(retired ? { retired: true } : {}),
    };
  }
  if (!tries) return { ...base, s: 0, d: MEMORY.D0, reps: 0, lapses: 0, rating: null };
  // On the ladder, the interval last given is about the stability reached.
  const s = streak > 0 ? LADDER[Math.min(LADDER.length - 1, streak - 1)] : MEMORY.S0[0];
  const d = clampD(MEMORY.D0 + (streak > 0 ? -0.5 * Math.min(streak, 3) : 1.5));
  return { ...base, s, d, reps: tries, lapses: streak > 0 ? 0 : 1, rating: streak > 0 ? RATING.GOOD : RATING.AGAIN };
}

/**
 * A stored problem record, v9–v13 shape → the v13 shape (null when
 * unusable). Pure; normalizeProfile applies it to every record, and the
 * data layer's migration framework can call it directly.
 *   { tries, solved, clean, last, due, streak, solvedAt?,
 *     s, d, reps, lapses, rating, retired?, before? }
 * `before` is the memory state before today's miss (see recordProblem).
 */
export function migrateProblemRecord(e) {
  if (!obj(e)) return null;
  const out = { ...migrateReview(e), solved: e.solved === true, clean: e.clean === true, last: num(e.last, 0) };
  if (Number.isFinite(e.solvedAt)) out.solvedAt = e.solvedAt;
  const b = obj(e.before);
  if (b) out.before = { s: num(b.s, 0), d: num(b.d, MEMORY.D0), reps: num(b.reps, 0), lapses: num(b.lapses, 0), streak: num(b.streak, 0), last: num(b.last), day: num(b.day, 0) };
  return out;
}

/** The grade of one attempt (see MEMORY): `solved`, `clean`, `late` (after a miss), `used` (hint/answer), `quick`. */
export function ratingOf({ solved = false, clean = solved, late = false, used = false, quick = false } = {}) {
  if (!solved || used) return RATING.AGAIN;
  if (late || !clean) return RATING.HARD;
  return quick ? RATING.EASY : RATING.GOOD;
}

/* ============================================================= mutations */

const defined = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined));

/**
 * A game against the computer, finished or analysed. `game`:
 *   { id, at, size, result, won, moves, color, level, mode, handicap,
 *     opponent?, rated?, confidence?, phases?, themes?, themeLoss? }
 * `handicap` counts stones given to the player (negative: the player gave
 * them); `opponent` (board θ) may stand in for `level` + `mode`.
 *
 * The first time a game with `won` true/false, at least MIN_RATED_MOVES
 * moves and a known opponent is recorded (and `rated` is not false), it is
 * rated: one Glicko step on that board's estimate, and a history point.
 * Recording the same id again (the analysis arriving later) merges the new
 * fields into the record and never rates it twice.
 */
export function recordGame(profile, game) {
  const p = normalizeProfile(profile);
  const id = game?.id != null ? String(game.id) : null;
  const existing = id != null ? p.games.find((g) => g.id === id) : null;
  const incoming = defined(game);
  const merged = normalizeGame({ ...(existing || {}), ...incoming, rated: existing?.rated || false, rating: existing?.rating ?? null });
  if (!merged) return p;
  let { rating, history } = p;
  const opponent = finite(game?.opponent) ? game.opponent : merged.level ? levelTheta(merged.level, { mode: merged.mode, size: merged.size, handicap: merged.handicap }) : null;
  if (!merged.rated && game?.rated !== false && merged.won !== null && merged.moves >= MIN_RATED_MOVES && finite(opponent)) {
    const at = merged.at;
    const before = rating[merged.size]?.games > 0 ? rating[merged.size] : { ...ratingFor(p, merged.size), games: 0 };
    const after = updateRating(before, { opponent, size: merged.size, won: merged.won, at });
    rating = { ...rating, [merged.size]: after };
    const read = readRating(after, at);
    history = [...history, { at, size: merged.size, rank: read.rank, pm: read.pm }].slice(-MAX_HISTORY);
    const b = Math.round(thetaToGoR(before.mu));
    merged.rated = true;
    merged.rating = { before: b, after: read.r, delta: read.r - b };
  }
  // v13: a reading from the player's moves, once per game, as a weak prior.
  if (merged.moveRank && !merged.moveRankUsed && !existing?.moveRankUsed) {
    const before = rating[merged.size];
    const after = applyMoveRank(before, merged.moveRank);
    if (after !== before) rating = { ...rating, [merged.size]: after };
    merged.moveRankUsed = true;
  }
  const games = normalizeGames([merged, ...p.games.filter((g) => g.id !== merged.id)]);
  return { ...p, rating, history, games };
}

/**
 * One attempt at a problem, the first answer of a visit, graded (ratingOf)
 * and scheduled by the memory model. `clean` is a first-try solve without
 * hint or answer; `used`: a hint or the answer was shown (again); `quick`:
 * a clean solve fast enough to count as easy. `late`: solved later in the
 * same visit after a miss already counted — the problem is solved (not
 * clean) and, without hint or answer, the miss is re-graded "hard" from
 * the state before it, so a slip put right at once is not a full lapse.
 */
export function recordProblem(profile, id, { solved = false, clean = solved, late = false, used = false, quick = false } = {}, now = 0) {
  const p = normalizeProfile(profile);
  const prev = p.problems[id];
  if (late && prev) {
    const next = { ...prev, solved: true, clean: false, last: now, solvedAt: now };
    const b = prev.before;
    if (!used && b && b.day === dayKey(now)) Object.assign(next, scheduled(nextMemory(b, RATING.HARD, now, b.last), now), { rating: RATING.HARD });
    delete next.before;
    return { ...p, problems: { ...p.problems, [id]: next } };
  }
  if (late) return recordProblem(p, id, { solved: true, clean: false }, now);
  const base = prev || migrateProblemRecord({});
  const rating = ratingOf({ solved, clean, used, quick });
  const mem = nextMemory(base, rating, now, prev?.tries > 0 ? base.last : null);
  const next = { ...base, ...scheduled(mem, now), tries: base.tries + 1, last: now, clean: !!(solved && clean), rating };
  delete next.before;
  // A miss keeps the state before it for the day, so a late solve can re-grade it.
  if (rating === RATING.AGAIN) next.before = { s: base.s, d: base.d, reps: base.reps, lapses: base.lapses, streak: base.streak, last: prev?.tries > 0 ? base.last : null, day: dayKey(now) };
  if (solved) {
    next.solved = true;
    next.solvedAt = now; // v12: when it was last solved (Today's week counts solves, not attempts)
  }
  next.streak = solved && clean ? (base.streak || 0) + 1 : 0;
  return { ...p, problems: { ...p.problems, [id]: next } };
}

/** A lesson's furthest step reached, or the lesson finished. */
export function recordLesson(profile, id, { step = null, done = false } = {}, now = 0) {
  const p = normalizeProfile(profile);
  const prev = p.lessons[id] || { done: false, step: 0, at: 0 };
  const next = { ...prev, at: now };
  if (step != null && Number.isFinite(Number(step))) next.step = Math.max(prev.step || 0, Number(step));
  if (done) next.done = true;
  return { ...p, lessons: { ...p.lessons, [id]: next } };
}

/** A classic game opened and played through. */
export function recordClassic(profile, id, now = 0) {
  const p = normalizeProfile(profile);
  return { ...p, classics: { ...p.classics, [id]: { done: true, at: now } } };
}

/**
 * A mistake from one of your own games, kept as a drill: the position
 * before the move (`sgf`, `index`), what you played and what KataGo
 * preferred. Its id is `<gameId>-<index>` unless given. Drills come only
 * from your own games: `own: false` is refused. The same position twice is
 * kept once. Newest first, at most MAX_MISTAKES.
 */
export function addMistake(profile, m, now = 0) {
  const p = normalizeProfile(profile);
  if (!obj(m) || m.own === false) return p;
  const id = m.id ? String(m.id) : m.gameId != null && m.index != null ? `${m.gameId}-${m.index}` : null;
  if (!id) return p;
  if (p.mistakes.some((x) => x.id === id || (m.gameId != null && x.gameId === m.gameId && x.index === m.index))) return p;
  const drill = { ...m, id, added: now, due: now, tries: 0, streak: 0, s: 0, d: MEMORY.D0, reps: 0, lapses: 0, rating: null, last: null, solved: false };
  return { ...p, mistakes: [drill, ...p.mistakes].slice(0, MAX_MISTAKES) };
}

/** One attempt at a drill, scheduled by the same memory model as problems (found: good, else again). */
export function recordMistake(profile, id, { solved = false } = {}, now = 0) {
  const p = normalizeProfile(profile);
  const i = p.mistakes.findIndex((x) => x.id === id);
  if (i < 0) return p;
  const m = p.mistakes[i];
  const rating = solved ? RATING.GOOD : RATING.AGAIN;
  const mem = nextMemory(m, rating, now, finite(m.last) ? m.last : null);
  const streak = solved ? (m.streak || 0) + 1 : 0;
  const next = { ...m, ...scheduled(mem, now), rating, tries: (m.tries || 0) + 1, streak, last: now, solved: m.solved || !!solved };
  const mistakes = p.mistakes.slice();
  mistakes[i] = next;
  return { ...p, mistakes };
}

/** Drop a drill (the player removed it). */
export function removeMistake(profile, id) {
  const p = normalizeProfile(profile);
  return { ...p, mistakes: p.mistakes.filter((x) => x.id !== id) };
}

/**
 * Keep this week's focus once it is shown: `view` is what focus() returned.
 * Unchanged when there is nothing to keep.
 */
export function keepFocus(profile, view) {
  const p = normalizeProfile(profile);
  if (!view?.keep) return p;
  return { ...p, week: { start: view.keep.start, focus: view.keep.focus.slice(), ...(view.keep.areas ? { areas: JSON.parse(JSON.stringify(view.keep.areas)) } : {}) } };
}

/* ========================================================== the estimate */

/**
 * The player's strength now: { size, rank, pm, r, lo, hi, mu, sigma, games }.
 * `rank` uses the rank encoding (kyu positive, 1 dan 0, 2 dan −1 …), `pm`
 * the ± in ranks of "≈ 12 kyu (±1)". Without `size`, the board with the
 * most rated games speaks (19×19 when none has any). The uncertainty grows
 * with time away.
 */
export function estimate(profile, { size = null, now = 0 } = {}) {
  const p = normalizeProfile(profile);
  const sz = size == null ? bestRated(p) ?? 19 : sizeOf(size);
  const entry = ratingFor(p, sz);
  return { size: sz, ...readRating(entry, Math.max(now, entry.at || 0)) };
}

/** History points of one board (all boards without `size`), oldest first. */
export function historyOf(profile, size = null) {
  return normalizeProfile(profile).history.filter((h) => size == null || h.size === size);
}

/** Suggested handicap for a player of `playerRank` against an opponent of `oppRank` (ranks). */
export function handicapFor(playerRank, oppRank, size) {
  if (playerRank == null || oppRank == null) return 0;
  const diff = playerRank - oppRank;
  if (diff <= 0) return 0;
  const stones = Math.floor(diff / ({ 9: 5, 13: 2.5, 19: 1 }[size] || 1));
  if (stones < 2) return 0;
  return Math.min(size === 9 ? 5 : 9, stones);
}

/**
 * The opponent to suggest on one board: the implementation (level, mode)
 * the player is expected to score closest to 50% against, as v6
 * recommendStrength did, with `modeOf(level)` the mode each level would be
 * played in; a handicap closes what remains at the ends of the ladder.
 */
function opponentFor(profile, size, modeOf) {
  const entry = ratingFor(profile, size);
  const rank = ratingToRank(thetaToGoR(entry.mu));
  let best = null;
  let gap = Infinity;
  for (const level of LEVELS) {
    const mode = modeOf(level) || "standard";
    const d = Math.abs(expectedScore(entry.mu, levelTheta(level, { mode, size }), size) - 0.5);
    if (d < gap) {
      gap = d;
      best = { level, mode };
    }
  }
  const oppRank = measuredRank(best.level, { mode: best.mode, size });
  return { size, level: best.level, mode: best.mode, rank: oppRank, handicap: handicapFor(rank, oppRank, size) };
}

/**
 * What to play next: { size, level, mode, rank, handicap, quick }.
 * `rank` is the opponent's measured rank (its label); `quick` is the same
 * on 9×9, offered beside the standard board. `modeOf(level)` says which
 * mode each level is played in on this machine (standard by default).
 */
export function suggestedGame(profile, { size = 19, modeOf = () => "standard" } = {}) {
  const p = normalizeProfile(profile);
  const sz = sizeOf(size);
  const main = opponentFor(p, sz, modeOf);
  return { ...main, quick: sz === 9 ? null : opponentFor(p, 9, modeOf) };
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
  MAX_FOCUS: 2,
  MAX_REVIEWS: 3, // with a focus, reviews take at most three of the five
};

/** Endgame problem themes all belong to the one "endgame" focus. */
export const ENDGAME_THEMES = ["hane-connect", "sente-gote", "reverse-sente", "double-sente", "monkey-jump", "endgame-compare", "deiri"];

/** Mistake themes → the problem topic that teaches them (app/insight.js). */
export const THEME_TOPIC = {
  ladder: "capture",
  net: "capture",
  snapback: "capture",
  "throw-in": "capture",
  "double-atari": "capture",
  shortage: "capture",
  "connect-and-die": "capture",
  cut: "connect",
  "vital-point": "kill",
  "eye-space": "life",
  "false-eye": "kill",
  ko: "life",
  "race-outside": "race",
  "race-shared": "race",
};

/** A mistake theme or problem theme → focus key. */
export function focusKey(theme) {
  if (!theme) return null;
  if (theme === "race-shared") return "race";
  if (ENDGAME_THEMES.includes(theme)) return "endgame";
  return theme;
}

/** Lessons that teach a focus, in course order. */
export const FOCUS_LESSONS = {
  atari: ["capture-direction"],
  ladder: ["capture-ladder", "escape-ladder"],
  net: ["capture-net"],
  snapback: ["capture-snapback", "adv-tesuji-throw-in-snapback"],
  "throw-in": ["capture-snapback", "adv-tesuji-throw-in-snapback"],
  "double-atari": ["capture-double"],
  "connect-and-die": ["adv-tesuji-throw-in-connect"],
  shortage: ["adv-tesuji-throw-in-connect"],
  "capture-to-save": ["escape-counter"],
  escape: ["escape-extend", "escape-connect"],
  connect: ["connect-solid", "connect-hanging"],
  cut: ["connect-cut", "connect-cut-capture", "fight-cutting-stones"],
  "vital-point": ["kill-straight-three", "kill-bent-three", "kill-reduce"],
  placement: ["kill-reduce"],
  "eye-space": ["life-space", "life-corner"],
  "capture-eye": ["life-eye"],
  "false-eye": ["life-false-eye"],
  ko: ["stones-ko", "adv-life-ko"],
  seki: ["adv-life-seki"],
  race: ["race-count", "race-read", "race-practice"],
  "race-outside": ["race-outside"],
  "race-eye": ["race-read"],
  "race-big-eye": ["race-read"],
  endgame: ["endgame-sente-gote", "endgame-first-line", "endgame-double-sente", "endgame-reverse-sente", "endgame-order"],
};

/** The lesson to offer for a focus: the first not done, else the first. */
export function focusLesson(key, isDone = () => false) {
  const ids = FOCUS_LESSONS[key] || [];
  return ids.find((id) => !isDone(id)) || ids[0] || null;
}

/** The problem topic (and theme filter) for a focus. */
export function focusTopic(key, problems = []) {
  if (key === "endgame") return { topic: "endgame", theme: null };
  if (THEME_TOPIC[key] && problems.some((p) => p.topic === THEME_TOPIC[key] && p.theme === key)) return { topic: THEME_TOPIC[key], theme: key };
  const count = {};
  for (const p of problems) if (p.theme === key) count[p.topic] = (count[p.topic] || 0) + 1;
  const topic = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
  return { topic, theme: topic ? key : null };
}

/** Points each theme cost in one game's explained mistakes (of `color`), for a record's themeLoss. */
export function themeLosses(mistakes, color = null) {
  const out = {};
  for (const m of mistakes || []) {
    if (!m.theme || (color != null && m.move?.color !== color)) continue;
    out[m.theme] = (out[m.theme] || 0) + Math.max(0, Number(m.loss) || 0);
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

const round1 = (v) => Math.round(v * 10) / 10;
const half = (v) => Math.round(v * 2) / 2;

/** When a drill was last tried (older drills: one ladder step before its due date). */
export function drillLast(m) {
  if (finite(m.last)) return m.last;
  const step = m.streak > 0 ? LADDER[Math.min(LADDER.length - 1, m.streak - 1)] : 1;
  return m.due ? m.due - step * DAY : m.added || 0;
}

function area(map, key) {
  if (!map[key]) map[key] = { key, score: 0, games: null, problems: null, endgame: null };
  return map[key];
}

/**
 * The clean-solve rate expected at `grade` from a prior level (the
 * placement, the level before): likely at and below it, unlikely above.
 */
export function priorRate(grade, prior) {
  if (!finite(prior)) return 0.5;
  return grade <= prior ? RULES.PRIOR_AT : RULES.PRIOR_ABOVE;
}

/** The clean rate at one grade, smoothed towards the prior: (clean + k·prior) / (tried + k). */
export function smoothedRate(clean, tried, grade, prior = null) {
  const k = RULES.LEVEL_PRIOR_WEIGHT;
  return (clean + k * priorRate(grade, prior)) / (tried + k);
}

/**
 * The player's solving level (v13: it must be consistent). The highest
 * grade (1–5) where at least LEVEL_MIN problems were tried and the clean
 * rate, smoothed towards the prior level (`prior`: the placement or the
 * level before; LEVEL_PRIOR_WEIGHT pseudo-results), is at least
 * LEVEL_CLEAN — and every lower grade with results is at least
 * LEVEL_FLOOR, so a lucky run at grade 4 over misses at grade 2 is not a
 * level 4. Grade 1 when none qualifies yet but enough were tried; null
 * with too few results to say.
 */
export function solvingLevel(results, { fallback = true, prior = null } = {}) {
  let level = null;
  let tried = 0;
  let floorOk = true;
  for (let g = 1; g <= 5; g++) {
    const at = results.filter((r) => r.grade === g);
    tried += at.length;
    const clean = at.filter((r) => !r.miss).length;
    const rate = smoothedRate(clean, at.length, g, prior);
    if (floorOk && at.length >= RULES.LEVEL_MIN && rate >= RULES.LEVEL_CLEAN) level = g;
    if (at.length && rate < RULES.LEVEL_FLOOR) floorOk = false;
  }
  if (fallback && level == null && tried >= RULES.LEVEL_MIN) level = 1;
  return level;
}

/**
 * The evidence (app/plan.js playerModel): where the points go in the
 * player's analysed games, and which problem themes and drills are missed.
 *   { status: "focus" | "notEnough" | "none",
 *     games: { analysed, high, needed },
 *     problems: { tried, missed, missRate, level },
 *     areas: [{ key, score, claim, games?, problems?, endgame? }],  // strongest first
 *     focus: [area…] }                                             // claimed, at most MAX_FOCUS
 */
export function evidence(profile, { problems = [], grades = {}, now = 0 } = {}) {
  const R = RULES;
  const map = {};
  const p = normalizeProfile(profile);

  /* Games: the newest analysed records, recent ones weighing more. */
  const records = (p.games || []).filter((g) => g.phases && now - g.at <= R.WINDOW_DAYS * DAY && g.at <= now);
  const recent = records.slice(0, R.WINDOW_GAMES);
  const weightOf = (i) => Math.pow(0.5, i / R.GAME_HALF_LIFE);
  const enoughGames = recent.length >= R.MIN_GAMES;
  recent.forEach((g, i) => {
    const w = weightOf(i);
    const keyed = {};
    for (const [theme, count] of Object.entries(g.themes || {})) {
      const key = focusKey(theme);
      const lost = g.themeLoss && Number.isFinite(g.themeLoss[theme]) ? g.themeLoss[theme] : null;
      const k = (keyed[key] ||= { count: 0, points: 0, known: true });
      k.count += count;
      if (lost == null) k.known = false;
      else k.points += lost;
    }
    for (const [key, k] of Object.entries(keyed)) {
      const a = area(map, key);
      const st = (a.games ||= { games: 0, mistakes: 0, points: 0, known: true, weight: 0 });
      st.games++;
      st.mistakes += k.count;
      st.points += k.points;
      if (!k.known) st.known = false;
      st.weight += w * (k.known ? k.points : k.count * R.COUNT_POINTS);
    }
  });
  for (const a of Object.values(map)) {
    const st = a.games;
    if (!st) continue;
    st.points = st.known ? half(st.points) : null;
    st.claim = enoughGames && st.games >= R.MIN_GAMES_WITH && (st.points != null ? st.points >= R.MIN_POINTS : st.mistakes >= R.MIN_MISTAKES);
    st.weight = round1(st.weight);
    delete st.known;
  }

  /* Endgame: only from KataGo-analysed games (the offline estimate is too rough per phase). */
  const high = recent.map((g, i) => ({ g, w: weightOf(i) })).filter(({ g }) => g.confidence === "high");
  if (high.length) {
    const end = high.reduce((s, { g }) => s + g.phases.endgame.loss, 0);
    const total = high.reduce((s, { g }) => s + g.phases.opening.loss + g.phases.middle.loss + g.phases.endgame.loss, 0);
    const perGame = end / high.length;
    const share = total > 0 ? end / total : 0;
    if (end > 0) {
      const a = area(map, "endgame");
      a.endgame = {
        games: high.length,
        points: half(end),
        perGame: half(perGame),
        share: Math.round(share * 100) / 100,
        weight: round1(R.ENDGAME_WEIGHT * high.reduce((s, { g, w }) => s + w * g.phases.endgame.loss, 0)),
        claim: high.length >= R.ENDGAME_MIN_GAMES && perGame >= R.ENDGAME_PER_GAME && share >= R.ENDGAME_SHARE,
      };
    }
  }

  /* Problems and drills: recent results per theme. */
  const defs = new Map(problems.map((d) => [d.id, d]));
  const results = [];
  for (const [id, e] of Object.entries(p.problems || {})) {
    const d = defs.get(id);
    if (!d || !e || !(e.tries > 0)) continue;
    results.push({ key: focusKey(d.theme || (d.topic === "endgame" ? "endgame" : null)), last: e.last || 0, miss: !e.solved || !(e.streak > 0), grade: grades[id]?.grade || 1 });
  }
  for (const m of p.mistakes || []) {
    if (!m || !(m.tries > 0) || !m.theme || m.own === false) continue;
    results.push({ key: focusKey(m.theme), last: drillLast(m), miss: !(m.streak > 0), grade: null, drill: true });
  }
  const live = results.filter((r) => r.key && now - r.last <= R.PROBLEM_WINDOW_DAYS * DAY);
  const wOf = (r) => Math.pow(0.5, Math.max(0, now - r.last) / DAY / R.PROBLEM_HALF_LIFE_DAYS);
  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const allW = sum(live, wOf);
  const overall = allW > 0 ? sum(live, (r) => wOf(r) * (r.miss ? 1 : 0)) / allW : null;
  const byKey = {};
  for (const r of live) (byKey[r.key] ||= []).push(r);
  for (const [key, rs] of Object.entries(byKey)) {
    const w = sum(rs, wOf);
    const rate = w > 0 ? sum(rs, (r) => wOf(r) * (r.miss ? 1 : 0)) / w : 0;
    const missed = rs.filter((r) => r.miss).length;
    if (!missed) continue;
    const a = area(map, key);
    a.problems = {
      tried: rs.length,
      missed,
      rate: Math.round(rate * 100) / 100,
      weight: round1(sum(rs, (r) => wOf(r) * (r.miss ? 1 : 0)) * R.MISS_POINTS),
      claim: rs.length >= R.MIN_PROBLEMS && rate >= R.MISS_RATE && (live.length < 10 || rate >= overall + R.MISS_MARGIN),
    };
  }

  // The level is smoothed towards the placement, the only prior a level has.
  const recentProblems = results.filter((r) => !r.drill && now - r.last <= R.PROBLEM_WINDOW_DAYS * DAY);
  const prior = p.placement?.grade ?? null;

  /* Ranking: only claimed evidence counts towards the score. */
  for (const a of Object.values(map)) {
    a.claim = !!(a.games?.claim || a.problems?.claim || a.endgame?.claim);
    a.score = round1((a.games?.claim ? a.games.weight : 0) + (a.problems?.claim ? a.problems.weight : 0) + (a.endgame?.claim ? a.endgame.weight : 0));
  }
  const areas = Object.values(map).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const focusAreas = areas.filter((a) => a.claim).slice(0, R.MAX_FOCUS);
  const anything = records.length > 0 || live.length > 0;
  return {
    status: focusAreas.length ? "focus" : anything ? "notEnough" : "none",
    games: { analysed: recent.length, high: high.length, needed: Math.max(0, R.MIN_GAMES - recent.length) },
    problems: { tried: live.filter((r) => !r.drill).length, missed: live.filter((r) => !r.drill && r.miss).length, missRate: overall == null ? null : Math.round(overall * 100) / 100, level: solvingLevel(recentProblems, { prior }), levelOnGrade: solvingLevel(recentProblems, { fallback: false, prior }) != null },
    areas,
    focus: focusAreas,
  };
}

/**
 * The evidence for one focus as sentences: [{ key, params }] (i18n), the
 * strongest kind first.
 */
export function evidenceOf(a) {
  const out = [];
  if (a.games?.claim) {
    if (a.games.points != null) out.push({ key: "learn.why.points", params: [String(a.games.points), a.games.games] });
    else out.push({ key: "learn.why.times", params: [a.games.mistakes, a.games.games] });
  }
  if (a.endgame?.claim) out.push({ key: "learn.why.lateGame", params: [String(a.endgame.perGame), a.endgame.games] });
  if (a.problems?.claim) out.push({ key: "learn.why.problems", params: [a.problems.missed, a.problems.tried] });
  return out;
}

/** Monday 00:00 local time of the week `now` falls in. */
export function weekStart(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** The profile as it stood when `start` came: games, problems and drills before it. */
function before(p, start) {
  return {
    ...p,
    games: p.games.filter((g) => g.at < start),
    problems: Object.fromEntries(Object.entries(p.problems).filter(([, e]) => (e.last || 0) < start)),
    mistakes: p.mistakes.filter((m) => (m.added || 0) < start && drillLast(m) < start),
  };
}

/**
 * This week's focus: the evidence as it stood when the week began
 * (Monday 00:00), so the focus stays put for the week; the current
 * evidence when the week began without one. Once a focus has been shown
 * in a week it is kept for that week (profile.week, v8): problem records
 * keep only their latest attempt, so reviewing last week's misses would
 * otherwise erase the evidence the focus came from.
 *
 * `content` = { problems, grades } (problem definitions and grades; without
 * them only games and drills count). Returns the evidence (see evidence())
 * plus `since` (the week start the focus is from, or null) and `keep`
 * ({ start, focus: [key] } to store with keepFocus, or null).
 */
export function focus(profile, now = 0, content = {}) {
  const p = normalizeProfile(profile);
  const opts = { problems: content.problems || [], grades: content.grades || {} };
  const start = weekStart(now);
  const current = evidence(p, { ...opts, now });
  const atStart = start < now ? evidence(before(p, start), { ...opts, now: start }) : null;
  if (p.week?.start === start && p.week.focus.length) {
    const claimed = (list, key) => list?.find((a) => a.key === key && a.claim);
    const find = (key) => claimed(p.week.areas, key) || claimed(atStart?.areas, key) || claimed(current.areas, key) || { key, score: 0, claim: true, games: null, problems: null, endgame: null };
    return { ...current, status: "focus", focus: p.week.focus.map(find), since: start, keep: null };
  }
  const chosen = atStart?.focus.length ? { ...atStart, since: start } : { ...current, since: null };
  const keep = chosen.focus.length ? { start, focus: chosen.focus.map((a) => a.key), areas: chosen.focus } : null;
  return { ...chosen, keep };
}

/* ============================================================ due reviews */

/**
 * Overdue first: the item least likely to be solved now (lowest
 * retrievability) comes first; a new drill (never tried) before any.
 */
export function byRetrievability(now) {
  return (a, b) => retrievability(a, now) - retrievability(b, now) || (a.due || 0) - (b.due || 0);
}

/**
 * What is due for review at `now`: { mistakes: [drill…], problems: [id…] },
 * each lowest retrievability first, at most MEMORY.REVIEW_CAP problems (an
 * overdue backlog after time away comes back over several days, the
 * most-forgotten first). Retired items are never due.
 */
export function due(profile, now = 0) {
  const p = normalizeProfile(profile);
  const order = byRetrievability(now);
  const mistakes = p.mistakes.filter((m) => !m.retired && (m.due || 0) <= now).sort(order);
  const problems = Object.entries(p.problems)
    .filter(([, e]) => !e.retired && e.due && e.due <= now)
    .sort((a, b) => order(a[1], b[1]))
    .slice(0, MEMORY.REVIEW_CAP)
    .map(([id]) => id);
  return { mistakes, problems };
}

/* ============================================================ Learn's path */

function dayKey(now) {
  const d = new Date(now);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function seeded(now, mul = 1, add = 0) {
  let seed = dayKey(now) * mul + add || 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

/**
 * Problems due first, then new problems at the learner's level (the
 * lowest grade with unsolved problems, and one above), stable for a day
 * (persist.js dailySet).
 */
export function dailySet(profile, problems, grades, limit = 5, now = 0) {
  const entry = (d) => profile.problems[d.id];
  const order = byRetrievability(now);
  const dueNow = problems.filter((d) => entry(d)?.due && entry(d).due <= now && !entry(d).retired).sort((a, b) => order(entry(a), entry(b)));
  const out = dueNow.slice(0, limit);
  const unseen = problems.filter((d) => !entry(d));
  const gradeOf = (d) => grades[d.id]?.grade || 1;
  const level = unseen.length ? Math.min(...unseen.map(gradeOf)) : 1;
  const rand = seeded(now);
  const pool = unseen.filter((d) => gradeOf(d) <= level + 1).sort((a, b) => gradeOf(a) - gradeOf(b) || rand() - 0.5);
  for (const d of pool) {
    if (out.length >= limit) break;
    if (!out.includes(d)) out.push(d);
  }
  for (const d of problems) {
    if (out.length >= limit) break;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * The problems and drills of Learn's path:
 *   1. due reviews (drills from your games, soonest first, then problems),
 *      at most MAX_REVIEWS;
 *   2. with a focus: problems from the focus themes around the solving
 *      level (the level and one above), the focuses taking turns; from
 *      `pool` (what the player has been taught), else the easiest of `bank`;
 *   3. one stretch problem two grades above the level — with a focus, or
 *      once the level is known (a new player gets none);
 *   4. new problems at your level (within a grade of it) once the level is
 *      known, then anything left as dailySet.
 * The level is the measured solving level; before there is one, `prior`
 * (a grade from the player's rank, gradeForRank), else the easiest unseen
 * grade. Null with an empty pool. Items: { kind: "mistake" | "problem", id,
 * role: "review" | "focus" | "stretch" | "new", why? }.
 */
export function planProblems({ profile, model, pool, bank = null, grades = {}, now = 0, limit = 5, prior = null }) {
  if (!pool?.length) return null;
  const gradeOf = (d) => grades[d.id]?.grade || 1;
  const entry = (d) => profile.problems?.[d.id];
  const items = [];
  const taken = new Set();
  const add = (it) => {
    if (items.length >= limit || taken.has(it.id)) return false;
    taken.add(it.id);
    items.push(it);
    return true;
  };
  const focusKeys = (model?.focus || []).map((a) => a.key);
  const keyOf = (d) => focusKey(d.theme || (d.topic === "endgame" ? "endgame" : null));

  // 1. Reviews.
  const soonest = byRetrievability(now);
  const dueDrills = (profile.mistakes || []).filter((m) => !m.retired && (m.due || 0) <= now).sort(soonest).slice(0, 2);
  for (const m of dueDrills) add({ kind: "mistake", id: m.id, role: "review", ...(focusKeys.includes(focusKey(m.theme)) ? { why: focusKey(m.theme) } : {}) });
  const dueProblems = pool.filter((d) => entry(d)?.due && entry(d).due <= now && !entry(d).retired).sort((a, b) => soonest(entry(a), entry(b)));
  for (const d of dueProblems) {
    if (items.length >= Math.min(RULES.MAX_REVIEWS, limit - 2)) break;
    add({ kind: "problem", id: d.id, role: "review" });
  }

  // 2. Focus problems around the level.
  const unseen = pool.filter((d) => !entry(d));
  // A level measured on a grade outranks a prior; the "nothing qualified yet"
  // fallback (grade 1) does not outrank a placement or a rank (v10).
  const measured = model?.problems?.levelOnGrade || prior == null ? (model?.problems?.level ?? null) : null;
  const known = measured != null || prior != null;
  const level = measured ?? prior ?? (unseen.length ? Math.min(...unseen.map(gradeOf)) : 1);
  const rand = seeded(now, 7, 3);
  const all = bank?.length ? bank : pool;
  const order = new Map(all.map((d) => [d.id, rand()]));
  const open = (d) => !entry(d)?.solved && !taken.has(d.id);
  const rank = (list) => list.slice().sort((a, b) => Math.abs(gradeOf(a) - level) - Math.abs(gradeOf(b) - level) || (entry(a) ? 1 : 0) - (entry(b) ? 1 : 0) || order.get(a.id) - order.get(b.id));
  const lists = focusKeys.map((key) => {
    const mine = pool.filter((d) => keyOf(d) === key && open(d));
    const near = mine.filter((d) => gradeOf(d) >= level && gradeOf(d) <= level + 1);
    const lower = mine.filter((d) => gradeOf(d) < level);
    if (near.length || lower.length) return [...rank(near), ...rank(lower)];
    // The pool (a beginner's taught topics) has none: the easiest of the
    // whole bank, never above the level, since the games asked for it.
    return rank(all.filter((d) => keyOf(d) === key && open(d) && gradeOf(d) <= level));
  });
  const focusSlots = limit - items.length - 1;
  for (let placed = 0; placed < focusSlots && lists.some((l) => l.length); ) {
    for (let k = 0; k < lists.length && placed < focusSlots; k++) {
      while (lists[k].length) {
        const d = lists[k].shift();
        if (add({ kind: "problem", id: d.id, role: "focus", why: focusKeys[k] })) {
          placed++;
          break;
        }
      }
    }
  }

  // 3. One stretch problem: two grades up, a focus theme if there is one.
  const target = Math.min(5, level + 2);
  const stretchOf = (list) => rank(list.filter((d) => open(d) && gradeOf(d) === target))[0] || rank(list.filter((d) => open(d) && gradeOf(d) > level).sort((a, b) => gradeOf(b) - gradeOf(a)))[0];
  const stretch = focusKeys.length || known ? stretchOf(pool.filter((d) => focusKeys.includes(keyOf(d)))) || stretchOf(pool) : null;
  if (stretch) {
    const why = focusKeys.includes(keyOf(stretch)) ? keyOf(stretch) : null;
    add({ kind: "problem", id: stretch.id, role: "stretch", ...(why ? { why } : {}) });
  }

  // 4. New problems at the level, then the rest as dailySet.
  if (known) for (const d of rank(pool.filter((x) => !entry(x) && !taken.has(x.id) && Math.abs(gradeOf(x) - level) <= 1))) add({ kind: "problem", id: d.id, role: "new" });
  const rest = dailySet(profile, pool.filter((d) => !taken.has(d.id)), grades, limit - items.length, now);
  for (const d of rest) add({ kind: "problem", id: d.id, role: entry(d)?.due && entry(d).due <= now && !entry(d).retired ? "review" : "new" });
  return items.slice(0, limit);
}

/** Estimated level at or above which the advanced course is suggested (5 kyu). */
export const ADVANCED_RANK = 5;

/** The course as [{ unit, lesson }] in order, from COURSE or such a list. */
function lessonList(content) {
  if (Array.isArray(content.lessons)) return content.lessons;
  const out = [];
  for (const unit of content.course || []) for (const lesson of unit.lessons || []) out.push({ unit, lesson });
  return out;
}

/**
 * The next lesson (app/course-path.js pickNextLesson). Someone who already
 * plays (experience "player", or about 15 kyu or stronger) starts at the
 * intermediate course; a player whose estimated level is about 5 kyu or
 * stronger goes on to the advanced course once the intermediate course is
 * finished, or straight away if they never started it.
 * `rating`: GoR from rated games, or null.
 */
export function nextLesson(all, isDone, { experience, playerRank, rating } = {}) {
  const open = ({ lesson }) => !isDone(lesson.id);
  const rank = playerRank ?? 30;
  const est = rating != null ? ratingToRank(rating) : rank;
  const experienced = experience === "player" || rank <= 15;
  const mids = all.filter((x) => x.unit.level === "intermediate");
  const midOpen = mids.find(open);
  const midStarted = mids.some((x) => !open(x));
  if (est <= ADVANCED_RANK && (!midOpen || !midStarted)) {
    const adv = all.find((x) => x.unit.level === "advanced" && open(x));
    if (adv) return adv;
  }
  if (experienced && midOpen) return midOpen;
  return all.find(open) || null;
}

/** Problem goals → the topics a finished lesson has taught. */
const GOAL_TOPICS = { capture: ["capture"], save: ["escape", "connect"], live: ["life"], kill: ["kill"] };

/**
 * New problems a player may be given (app/practice-ctl.js dailyPool).
 * Someone still working through the beginner units only gets topics their
 * finished lessons have taught (capturing from the start); finishing the
 * beginner units opens the whole bank.
 */
export function taughtPool(profile, content) {
  const problems = content.problems || [];
  const settings = content.settings || {};
  const lessons = lessonList(content).filter(({ unit }) => !unit.level);
  const done = lessons.filter(({ lesson }) => profile.lessons[lesson.id]?.done);
  const beginner = settings.experience === "new" || (settings.playerRank ?? 30) >= 25;
  if (!beginner || done.length >= lessons.length) return problems;
  const topics = new Set(["capture"]);
  for (const { lesson } of done) for (const st of lesson.steps || []) for (const tp of GOAL_TOPICS[st.problem?.goal] || []) topics.add(tp);
  if (done.length >= lessons.length * 0.75) topics.add("race").add("technique");
  const pool = problems.filter((d) => topics.has(d.topic));
  return pool.length >= 5 ? pool : problems;
}

/** Lessons whose completion offers capture Go (course.js, unit "stones"). */
export const CAPTURE_AFTER = ["stones-capture", "stones-groups", "stones-suicide"];
/** Lessons whose completion offers the first 9×9 game (course.js, unit "life"). */
export const FIRST_GAME_AFTER = ["life-two-eyes", "life-space"];
/** Capture games won before the bridge stops offering capture Go. */
export const CAPTURE_WINS_ENOUGH = 2;
/** The first 9×9 game: the gentlest computer level. */
export const FIRST_GAME = { size: 9, level: "30k", handicap: 0 };

/**
 * The bridge the lesson-complete page offers (app/beginner.js):
 * "capture" | "firstGame" | null for the lesson just finished.
 * `captureWins`: capture games the player has won.
 */
export function bridgeAfter(lessonId, profile, { captureWins = 0 } = {}) {
  if (CAPTURE_AFTER.includes(lessonId) && (captureWins || 0) < CAPTURE_WINS_ENOUGH) return "capture";
  if (FIRST_GAME_AFTER.includes(lessonId) && !(profile?.games || []).length) return "firstGame";
  return null;
}

/**
 * The weakest rank (kyu positive, 1 dan 0) a grade is offered to before the
 * player's solving level is measured (v13, conservative: problem grades
 * are estimated, not measured on people, so a rank gets the grade a player
 * of that rank should solve comfortably, not the hardest one they might).
 */
export const GRADE_RANK = { 1: 30, 2: 18, 3: 13, 4: 10, 5: 6 };

/**
 * A first guess at the problem grade that suits a player of `rank`, before
 * their solving level is measured: the highest grade whose GRADE_RANK the
 * rank reaches — 19 kyu and weaker grade 1, 14–18 kyu 2, 11–13 kyu 3,
 * 7–10 kyu 4, 6 kyu and stronger 5.
 */
export function gradeForRank(rank) {
  if (!finite(rank)) return null;
  let grade = 1;
  for (let g = 2; g <= 5; g++) if (rank <= GRADE_RANK[g]) grade = g;
  return grade;
}

/* ============================================================ placement */

/**
 * The placement quiz (v10; v13 adaptive and randomised). Someone who
 * already knows the rules answers 10–12 problems before Learn's first path,
 * and the result sets where the course starts and which problems come
 * first, until their own results measure a solving level.
 *
 * A staircase: the first problem is grade START, each solved one moves a
 * grade up, each missed one a grade down (never above MAX_GRADE). Which
 * problem of that grade is drawn per player (a seed), mixing themes, with
 * at least LIFE life-and-death problems (kill or live). The quiz ends after
 * MIN problems when the grade it gives has not changed over the last
 * STABLE answers, else after MAX.
 */
export const PLACEMENT = { MIN: 10, MAX: 12, START: 2, MAX_GRADE: 4, LIFE: 3, STABLE: 3, PASS: 2, GOALS: ["capture", "save", "kill", "live"], LIFE_GOALS: ["kill", "live"] };

/**
 * The rank a placement grade stands for (the course start, the first
 * problems). Never stronger than about 10 kyu: until the player's own
 * results confirm it, a quiz of a dozen problems cannot place higher
 * (PLACEMENT.MAX_GRADE is the grade of 10 kyu, gradeForRank).
 */
export const PLACEMENT_RANK = { 1: 30, 2: 18, 3: 13, 4: 10 };

const clampGrade = (g) => Math.max(1, Math.min(5, g));

/** The grade the next placement problem should have, after `results` [{ grade, solved }]. */
export function placementTarget(results) {
  if (!results.length) return PLACEMENT.START;
  const last = results[results.length - 1];
  return Math.max(1, Math.min(PLACEMENT.MAX_GRADE, last.grade + (last.solved ? 1 : -1)));
}

/** Whether the quiz is over after `results`: MAX answers, or MIN with a stable grade. */
export function placementDone(results) {
  if (results.length >= PLACEMENT.MAX) return true;
  if (results.length < PLACEMENT.MIN) return false;
  const grades = [];
  for (let k = results.length - PLACEMENT.STABLE + 1; k <= results.length; k++) grades.push(placementGrade(results.slice(0, k)));
  return grades.every((g) => g === grades[0]);
}

/**
 * The next placement problem's id, or null when the quiz is over. Only
 * capturing, escaping, killing and living (no endgame or opening points),
 * each problem once, at the target grade (else the nearest). Among those it
 * prefers a theme and then a topic not asked yet, then draws by the seed
 * (`seed`: per player, so two players get different quizzes and a test
 * gets the same one). Life and death is required once the problems left
 * before MIN would otherwise not reach LIFE of them.
 */
export function placementNext(results, problems = [], grades = {}, { seed = 1 } = {}) {
  if (placementDone(results)) return null;
  const used = new Set(results.map((r) => r.id));
  const byId = new Map(problems.map((d) => [d.id, d]));
  const target = placementTarget(results);
  const gradeOf = (d) => grades[d.id]?.grade ?? null;
  let pool = problems.filter((d) => PLACEMENT.GOALS.includes(d.goal) && gradeOf(d) != null && !used.has(d.id));
  if (!pool.length) return null;
  const asked = results.map((r) => byId.get(r.id)).filter(Boolean);
  const life = asked.filter((d) => PLACEMENT.LIFE_GOALS.includes(d.goal)).length;
  const left = Math.max(0, PLACEMENT.MIN - results.length);
  if (life < PLACEMENT.LIFE && left <= PLACEMENT.LIFE - life) {
    const lifePool = pool.filter((d) => PLACEMENT.LIFE_GOALS.includes(d.goal));
    if (lifePool.length) pool = lifePool;
  }
  const near = Math.min(...pool.map((d) => Math.abs(gradeOf(d) - target)));
  const atGrade = pool.filter((d) => Math.abs(gradeOf(d) - target) === near);
  const themes = new Set(asked.map((d) => d.theme));
  const topics = asked.reduce((m, d) => m.set(d.topic, (m.get(d.topic) || 0) + 1), new Map());
  const draw = (d) => mix(`${seed}:${results.length}:${d.id}`);
  const ranked = atGrade.slice().sort((a, b) => (themes.has(a.theme) ? 1 : 0) - (themes.has(b.theme) ? 1 : 0) || (topics.get(a.topic) || 0) - (topics.get(b.topic) || 0) || draw(a) - draw(b));
  return ranked[0].id;
}

/** A reproducible pseudo-random number in [0, 1) from a string. */
function mix(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 0x100000000;
}

/**
 * The placement's grade: the highest grade passed — solved at least PASS
 * (two) times there and missed no more often than solved; grade 1 when no
 * grade is passed. Never above MAX_GRADE. Every answer right ends at
 * MAX_GRADE, every answer wrong at 1, and someone who solves grade 3 twice
 * but misses grade 4 is placed at 3.
 */
export function placementGrade(results) {
  if (!results.length) return null;
  let grade = 1;
  for (let g = 1; g <= PLACEMENT.MAX_GRADE; g++) {
    const at = results.filter((r) => r.grade === g);
    const solved = at.filter((r) => r.solved).length;
    if (solved >= PLACEMENT.PASS && solved >= at.length - solved) grade = g;
  }
  return grade;
}

/** Store the placement's outcome: { grade } or { skipped: true }. */
export function setPlacement(profile, outcome, now = 0) {
  const p = normalizeProfile(profile);
  const placement = outcome?.skipped ? { skipped: true, at: now } : { grade: Math.min(PLACEMENT.MAX_GRADE, clampGrade(Math.round(outcome.grade))), at: now };
  return { ...p, placement };
}

/** The quiz is offered to someone who knows the rules and has not taken or skipped it. */
export function placementOffered(profile, settings = {}) {
  const p = normalizeProfile(profile);
  return (settings.experience === "rules" || settings.experience === "player") && !p.placement;
}

/**
 * Learn's one ordered list, played as today's session (learn/session.js):
 *   1. the next lesson                         { kind: "lesson", id, unit, role: "next" }
 *   2. capture Go, while it applies (beginners) { kind: "capture", role: "bridge" }
 *   3. due drills from your games (and from trying a moment again), due
 *      problem reviews, focus problems around the solving level, one
 *      stretch problem and new problems at your level (planProblems)
 *                                              { kind: "mistake" | "problem", id, role, why? }
 *   4. the first 9×9 game, while it applies    { kind: "game", role: "bridge", game }
 * The first game comes last: it leaves Learn for Play.
 *
 * `content` = { course | lessons, problems, grades, settings: { experience,
 * playerRank }, captureWins, limit } (limit: problem items, 5 by default).
 */
export function learnPath(profile, content = {}, now = 0) {
  const p = normalizeProfile(profile);
  const problems = content.problems || [];
  const grades = content.grades || {};
  const settings = content.settings || {};
  const limit = content.limit ?? 5;
  const items = [];

  const all = lessonList(content);
  const est = estimate(p, { now });
  // A placement grade stands in for the rank given at onboarding when it says more.
  const placed = p.placement?.grade ?? null;
  const rankNow = placed != null ? Math.min(settings.playerRank ?? 30, PLACEMENT_RANK[placed]) : settings.playerRank;
  const next = nextLesson(all, (id) => !!p.lessons[id]?.done, { experience: settings.experience, playerRank: rankNow, rating: est.games > 0 ? est.r : null });
  if (next) items.push({ kind: "lesson", id: next.lesson.id, unit: next.unit.id, role: "next" });

  // The bridges are for beginners: someone who already plays is not sent to capture Go.
  const beginner = settings.experience === "new" || (placed == null ? (settings.playerRank ?? 30) >= 25 : placed < 2);
  const done = (id) => !!p.lessons[id]?.done;
  if (beginner && CAPTURE_AFTER.some(done) && (content.captureWins || 0) < CAPTURE_WINS_ENOUGH) items.push({ kind: "capture", role: "bridge" });

  const model = focus(p, now, { problems, grades });
  const pool = taughtPool(p, { ...content, problems, settings: { ...settings, playerRank: rankNow } });
  // Someone who already plays starts near their rank until their solving level is measured.
  const prior = placed ?? (beginner ? null : gradeForRank(est.games > 0 ? est.rank : settings.playerRank));
  const picks = planProblems({ profile: p, model, pool, bank: problems, grades, now, limit, prior }) || due(p, now).mistakes.slice(0, 2).map((m) => ({ kind: "mistake", id: m.id, role: "review" }));
  items.push(...picks.slice(0, limit));

  if (beginner && FIRST_GAME_AFTER.some(done) && !p.games.length) items.push({ kind: "game", role: "bridge", game: { ...FIRST_GAME } });
  return items;
}
