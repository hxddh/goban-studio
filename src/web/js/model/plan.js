/**
 * The pieces of a day's practice: the problems chosen around the solving
 * level, the next lesson, the beginner's bridges (capture Go, the first
 * game), and the rank each grade stands for. Pure.
 */
import { ratingToRank } from "./ladder.js";
import { dayKey, finite } from "./util.js";
import { byRetrievability, isDue, reviewsToday } from "./review.js";
import { focusKey } from "./focus.js";
import { MEMORY } from "./memory.js";
import { RULES } from "./profile.js";

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
 * The problems and drills of Practice's path (`limit` items, a day's size):
 *   1. due reviews first, the most forgotten first: up to MAX_DRILLS
 *      drills from your games, then problems. Reviews come before anything
 *      new, but they leave one place for a new problem (at most limit − 1
 *      reviews) while one is open, unless more than BACKLOG_PER_PLACE times
 *      the day's size is due: then they take every place until the backlog
 *      is back under it (a new place every day lets the backlog of a
 *      three-item day grow without end). Never more than
 *      MEMORY.REVIEW_CAP reviews a day, counting those already done today
 *      (reviewsToday), so a second session on the same day stays within it;
 *   2. with a focus: problems from the focus themes around the solving
 *      level (the level and one above), the focuses taking turns; from
 *      `pool` (what the player has been taught), else the easiest of `bank`;
 *   3. one stretch problem, exactly one grade above the level (STRETCH) —
 *      with a focus, or once the level is known (a new player gets none;
 *      none when no problem of that grade is open);
 *   4. new problems at your level (within a grade of it) once the level is
 *      known, then anything left as dailySet (new problems only; reviews
 *      beyond the day's share wait for tomorrow).
 * The level is the measured solving level; before there is one, `prior`
 * (the placement, or a grade from the player's rank: levelPrior) — a grade
 * lower when the first results there are mostly misses (the model's
 * `problems.start`) — else the easiest unseen grade. Null with an empty pool. Items: { kind: "mistake" | "problem", id,
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

  // 1. Reviews: before anything new, within the day's cap.
  const soonest = byRetrievability(now);
  const allDrills = (profile.mistakes || []).filter((m) => !m.retired && (m.due || 0) <= now).sort(soonest);
  const dueProblems = pool.filter((d) => isDue(entry(d), now)).sort((a, b) => soonest(entry(a), entry(b)));
  const room = Math.max(0, MEMORY.REVIEW_CAP - reviewsToday(profile, now));
  // A problem that could take the kept place: not due, not solved.
  const fresh = pool.some((d) => !isDue(entry(d), now) && !entry(d)?.solved);
  const keep = fresh && limit > 1 && allDrills.length + dueProblems.length <= RULES.BACKLOG_PER_PLACE * limit;
  const maxReviews = Math.min(room, keep ? limit - 1 : limit);
  for (const m of allDrills.slice(0, RULES.MAX_DRILLS)) {
    if (items.length >= maxReviews) break;
    add({ kind: "mistake", id: m.id, role: "review", ...(focusKeys.includes(focusKey(m.theme)) ? { why: focusKey(m.theme) } : {}) });
  }
  for (const d of dueProblems) {
    if (items.length >= maxReviews) break;
    add({ kind: "problem", id: d.id, role: "review" });
  }

  // 2. Focus problems around the level.
  const unseen = pool.filter((d) => !entry(d));
  // A level measured on a grade outranks a prior; the "nothing qualified yet"
  // fallback (grade 1) does not outrank a placement or a rank.
  const measured = model?.problems?.levelOnGrade || prior == null ? (model?.problems?.level ?? null) : null;
  const known = measured != null || prior != null;
  // Not measured yet: the start, a grade lower where its problems proved too hard (startGrade).
  const start = prior != null ? Math.min(prior, model?.problems?.start ?? prior) : null;
  const level = measured ?? start ?? (unseen.length ? Math.min(...unseen.map(gradeOf)) : 1);
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

  // 3. One stretch problem: one grade up and no more, a focus theme if there is one.
  const target = level + RULES.STRETCH;
  const stretchOf = (list) => rank(list.filter((d) => open(d) && gradeOf(d) === target))[0];
  const stretch = target <= 5 && (focusKeys.length || known) ? stretchOf(pool.filter((d) => focusKeys.includes(keyOf(d)))) || stretchOf(pool) : null;
  if (stretch) {
    const why = focusKeys.includes(keyOf(stretch)) ? keyOf(stretch) : null;
    add({ kind: "problem", id: stretch.id, role: "stretch", ...(why ? { why } : {}) });
  }

  // 4. New problems at the level, then the rest as dailySet.
  if (known) for (const d of rank(pool.filter((x) => !entry(x) && !taken.has(x.id) && Math.abs(gradeOf(x) - level) <= 1))) add({ kind: "problem", id: d.id, role: "new" });
  const rest = dailySet(profile, pool.filter((d) => !taken.has(d.id) && !isDue(entry(d), now)), grades, limit - items.length, now);
  for (const d of rest) add({ kind: "problem", id: d.id, role: "new" });
  return items.slice(0, limit);
}

/** Estimated level at or above which the advanced course is suggested (5 kyu). */
export const ADVANCED_RANK = 5;

/** The course as [{ unit, lesson }] in order, from COURSE or such a list. */
export function lessonList(content) {
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
 * player's solving level is measured (conservative: problem grades
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
