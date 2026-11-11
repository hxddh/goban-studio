/**
 * Practice's path: the one ordered list for today — the next lesson, the
 * beginner bridges, reviews, the focus, a stretch, new problems, the first
 * game. Pure.
 */
import { normalizeProfile } from "./profile.js";
import { dailySize, focus } from "./focus.js";
import { CAPTURE_AFTER, CAPTURE_WINS_ENOUGH, FIRST_GAME, FIRST_GAME_AFTER, lessonList, nextLesson, planProblems, taughtPool } from "./plan.js";
import { estimate, levelPrior } from "./level.js";
import { PLACEMENT_RANK } from "./placement.js";
import { due } from "./review.js";

/**
 * Practice's one ordered list, played as today's session (practice/session.js):
 *   1. the next lesson                         { kind: "lesson", id, unit, role: "next" }
 *   2. capture Go, while it applies (beginners) { kind: "capture", role: "bridge" }
 *   3. due drills from your games (and from trying a moment again), due
 *      problem reviews, focus problems around the solving level, one
 *      stretch problem and new problems at your level (planProblems)
 *                                              { kind: "mistake" | "problem", id, role, why? }
 *   4. the first 9×9 game, while it applies    { kind: "game", role: "bridge", game }
 * The first game comes last: it leaves Practice for Play.
 *
 * `content` = { course | lessons, problems, grades, settings: { experience,
 * playerRank }, captureWins, limit } (limit: the day's size, the problem
 * items: 3, 5 or 10 — RULES.DAILY_SIZES; 5 by default and for any other value).
 */
export function practicePath(profile, content = {}, now = 0) {
  const p = normalizeProfile(profile);
  const problems = content.problems || [];
  const grades = content.grades || {};
  const settings = content.settings || {};
  const limit = dailySize(content.limit);
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

  // Someone who already plays starts near their rank until their solving level is measured.
  const prior = levelPrior(p, settings, now);
  const model = focus(p, now, { problems, grades, cover: prior });
  const pool = taughtPool(p, { ...content, problems, settings: { ...settings, playerRank: rankNow } });
  const picks = planProblems({ profile: p, model, pool, bank: problems, grades, now, limit, prior }) || due(p, now).mistakes.slice(0, 2).map((m) => ({ kind: "mistake", id: m.id, role: "review" }));
  items.push(...picks.slice(0, limit));

  if (beginner && FIRST_GAME_AFTER.some(done) && !p.games.length) items.push({ kind: "game", role: "bridge", game: { ...FIRST_GAME } });
  return items;
}
