/**
 * What happened, written into the profile: a rated game, a problem tried, a
 * lesson step, a mistake of an own game and its drill. Each returns a new
 * profile. Pure.
 */
import { levelTheta, thetaToGoR } from "./ladder.js";
import { MAX_MISTAKES, applyMoveRank, normalizeGame, normalizeGames, normalizeProfile } from "./profile.js";
import { countDay, dayKey, finite, obj } from "./util.js";
import { MAX_HISTORY, MIN_RATED_MOVES, ratingFor, readRating, updateRating } from "./rating.js";
import { MEMORY, RATING, migrateProblemRecord, nextMemory, ratingOf, scheduled } from "./memory.js";

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
 *
 * `undos` and `hints` are how often the player took a move back or asked
 * for a hint (Play counts them; teaching mode's own warnings are not
 * hints). A game with any of either is `assisted`: it is kept in the list
 * and its analysis still counts as evidence for the focus, but it never
 * moves the rating — no Glicko step, no history point, and its moves are
 * not read as a prior either. Once assisted, a record stays assisted.
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
  if (!merged.rated && !merged.assisted && game?.rated !== false && merged.won !== null && merged.moves >= MIN_RATED_MOVES && finite(opponent)) {
    const at = merged.at;
    const before = rating[merged.size]?.games > 0 ? rating[merged.size] : { ...ratingFor(p, merged.size), games: 0 };
    const after = updateRating(before, { opponent, size: merged.size, won: merged.won, at });
    rating = { ...rating, [merged.size]: after };
    const read = readRating(after, at);
    history = [...history, { at, size: merged.size, rank: read.rank, pm: read.pm, r: read.r, sd: Math.round((read.hi - read.lo) / 2) }].slice(-MAX_HISTORY);
    const b = Math.round(thetaToGoR(before.mu));
    merged.rated = true;
    merged.rating = { before: b, after: read.r, delta: read.r - b };
  }
  // A reading from the player's moves, once per game, as a weak prior.
  if (merged.moveRank && !merged.assisted && !merged.moveRankUsed && !existing?.moveRankUsed) {
    const before = rating[merged.size];
    const after = applyMoveRank(before, merged.moveRank);
    if (after !== before) rating = { ...rating, [merged.size]: after };
    merged.moveRankUsed = true;
  }
  const games = normalizeGames([merged, ...p.games.filter((g) => g.id !== merged.id)]);
  // The first record of a game is the game finished: a practice day, and the first-game milestones.
  let { days, marks } = p;
  if (!existing) {
    days = countDay(days, merged.at);
    marks = { ...marks };
    if (marks.firstGame == null) marks.firstGame = merged.at;
    if (merged.size === 19 && marks.first19 == null) marks.first19 = merged.at;
  }
  return { ...p, rating, history, games, days, marks };
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
  // The first ever attempt is the first-sight result the solving level counts.
  if (!(base.tries > 0)) {
    next.first = rating >= RATING.GOOD ? "clean" : "miss";
    next.seen = now;
  }
  // A miss keeps the state before it for the day, so a late solve can re-grade it.
  if (rating === RATING.AGAIN) next.before = { s: base.s, d: base.d, reps: base.reps, lapses: base.lapses, streak: base.streak, last: prev?.tries > 0 ? base.last : null, day: dayKey(now) };
  if (solved) {
    next.solved = true;
    next.solvedAt = now; // When it was last solved (Today's week counts solves, not attempts)
  }
  next.streak = solved && clean ? (base.streak || 0) + 1 : 0;
  return { ...p, problems: { ...p.problems, [id]: next }, days: countDay(p.days, now) };
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
  return { ...p, mistakes, days: countDay(p.days, now) };
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
