/**
 * Which lesson comes next (see nextLesson() in practice-ctl.js). Pure, so
 * the test suite can check it without the app.
 */
import { ratingToRank } from "./rating.js";

/** Estimated level at or above which the advanced course is suggested (5 kyu). */
export const ADVANCED_RANK = 5;

/** nextLesson() as a pure function of the lessons, what is done and the player. */
export function pickNextLesson(all, isDone, { experience, playerRank, rating } = {}) {
  const open = ({ lesson }) => !isDone(lesson.id);
  const rank = playerRank ?? 30;
  const estimate = rating != null ? ratingToRank(rating) : rank;
  const experienced = experience === "player" || rank <= 15;
  const mids = all.filter((x) => x.unit.level === "intermediate");
  const midOpen = mids.find(open);
  const midStarted = mids.some((x) => !open(x));
  if (estimate <= ADVANCED_RANK && (!midOpen || !midStarted)) {
    const adv = all.find((x) => x.unit.level === "advanced" && open(x));
    if (adv) return adv;
  }
  if (experienced && midOpen) return midOpen;
  return all.find(open) || null;
}
