/**
 * The review memory of a problem or a drill: stability and difficulty per
 * item, graded recall, the next due date (an FSRS-style model), and records
 * written with the older day ladder read into it. Pure.
 */
import { DAY, finite, num, obj, round } from "./util.js";

/**
 * The older spaced-review ladder (1, 3, 7, 21 days after consecutive clean
 * solves). Scheduling uses the memory model below; the ladder is kept
 * only to read records written with it (migrateProblemRecord).
 */
export const LADDER = [1, 3, 7, 21];

/* ======================================================= the memory model */

/*
 * Spaced review after FSRS (the free spaced-repetition scheduler's
 * memory model, the FSRS-4.5 formulas, its published default weights rounded).
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
export function scheduled(mem, now) {
  if (mem.s > MEMORY.RETIRE_DAYS) return { ...mem, due: 0, retired: true };
  return { ...mem, due: now + intervalFor(mem.s) * DAY, retired: false };
}

/**
 * The memory fields of a stored item, whichever format it is in: a
 * current record has them; a format 9 record (the 1-3-7-21 ladder: tries, streak,
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
 * A stored problem record, in any format since 9 → the current shape (null when
 * unusable). Pure; normalizeProfile applies it to every record, and the
 * data layer's migration framework can call it directly.
 *   { tries, solved, clean, last, due, streak, solvedAt?,
 *     s, d, reps, lapses, rating, retired?, before?, first?, seen? }
 * `before` is the memory state before today's miss (see recordProblem).
 *
 * `first` is the first-sight result, "clean" or "miss": what the first
 * ever attempt was, which is what the solving level counts (a problem
 * missed and then solved on review was still missed at first sight).
 * `seen` is when that was. A record written before they were kept gets
 * them only where they follow from it: tried once (that try was the
 * first), or every try a clean solve (`streak` ≥ `tries`). Otherwise both
 * stay absent, and the record is left out of the level, not counted clean.
 */
export function migrateProblemRecord(e) {
  if (!obj(e)) return null;
  /** @type {Record<string, any>} */
  const out = { ...migrateReview(e), solved: e.solved === true, clean: e.clean === true, last: num(e.last, 0) };
  if (Number.isFinite(e.solvedAt)) out.solvedAt = e.solvedAt;
  if (e.first === "clean" || e.first === "miss") out.first = e.first;
  else if (out.tries === 1) out.first = out.solved && out.clean && out.streak > 0 ? "clean" : "miss";
  else if (out.tries > 1 && out.streak >= out.tries) out.first = "clean";
  if (finite(e.seen)) out.seen = e.seen;
  else if (out.tries === 1 && out.last > 0) out.seen = out.last;
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
