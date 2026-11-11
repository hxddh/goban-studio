/**
 * What is due for review today — problems and drills — and the review load
 * shown beside the path. Pure.
 */
import { MEMORY, RATING, retrievability } from "./memory.js";
import { normalizeProfile } from "./profile.js";
import { dayKey, finite } from "./util.js";

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

/** The problem record is due for review at `now`. */
export const isDue = (e, now) => !!e && !e.retired && e.due > 0 && e.due <= now;

/**
 * Reviews already done on the local day of `now`: problems tried again
 * today (not the ones met today for the first time) and drills tried today.
 * The day's cap (MEMORY.REVIEW_CAP) counts them across the day's sessions.
 */
export function reviewsToday(profile, now = 0) {
  const day = dayKey(now);
  const today = (t) => finite(t) && t > 0 && dayKey(t) === day;
  let n = 0;
  for (const e of Object.values(profile?.problems || {})) if (e.tries > 1 && today(e.last) && !today(e.seen)) n++;
  for (const m of profile?.mistakes || []) if (m.tries > 0 && today(m.last)) n++;
  return n;
}

/** A problem counts as mastered once it is retired or its stability has reached this many days. */
const MASTERED_DAYS = 21;

/** Mastered: out of review, or known for three weeks and not missed the last time. */
export function isMastered(e) {
  return !!e && e.tries > 0 && (e.retired === true || (e.s >= MASTERED_DAYS && e.rating !== RATING.AGAIN));
}

/**
 * The review load, for a line such as "4 to review today · 31 learning ·
 * 12 mastered". Pure; counts problems and the drills from your games.
 *   due       reviews Practice offers today: the backlog, as far as the day's
 *             cap (MEMORY.REVIEW_CAP less the reviews already done today) allows
 *   overdue   the whole backlog: everything whose review date has come
 *   drills    how many of `overdue` are drills from your games
 *   reviewed  reviews already done today
 *   mastered  problems retired or known for MASTERED_DAYS (isMastered)
 *   learning  problems met and not mastered yet
 *   newSeen   problems met for the first time today
 */
export function reviewLoad(profile, now = 0) {
  const p = normalizeProfile(profile);
  const entries = Object.values(p.problems).filter((e) => e.tries > 0);
  const drills = p.mistakes.filter((m) => !m.retired && (m.due || 0) <= now).length;
  const overdue = entries.filter((e) => isDue(e, now)).length + drills;
  const reviewed = reviewsToday(p, now);
  const mastered = entries.filter(isMastered).length;
  const day = dayKey(now);
  return {
    due: Math.min(overdue, Math.max(0, MEMORY.REVIEW_CAP - reviewed)),
    overdue,
    drills,
    reviewed,
    mastered,
    learning: entries.length - mastered,
    newSeen: entries.filter((e) => finite(e.seen) && e.seen > 0 && dayKey(e.seen) === day).length,
  };
}

/**
 * Mastery per theme, for a map of what is known: { [theme]: { total,
 * mastered, learning, unseen, grades: [lowest, highest] } } over `problems`
 * (their definitions; a problem without a theme counts under its topic).
 * mastered + learning + unseen = total; `mastered` as isMastered.
 */
export function masteryByTheme(profile, problems = [], grades = {}) {
  const p = normalizeProfile(profile);
  const out = {};
  for (const d of problems) {
    const key = d.theme || d.topic || "other";
    const g = grades[d.id]?.grade || 1;
    const row = (out[key] ||= { total: 0, mastered: 0, learning: 0, unseen: 0, grades: [g, g] });
    row.total++;
    row.grades = [Math.min(row.grades[0], g), Math.max(row.grades[1], g)];
    const e = p.problems[d.id];
    if (!e || !(e.tries > 0)) row.unseen++;
    else if (isMastered(e)) row.mastered++;
    else row.learning++;
  }
  return out;
}
