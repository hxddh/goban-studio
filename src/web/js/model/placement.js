/**
 * The placement quiz (adaptive, randomised) and the level a new player
 * starts at. Pure.
 */
import { PLACEMENT, normalizeProfile } from "./profile.js";

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

/** The first FLOOR answers were all missed: the quiz stops there, at grade 1. */
export function placementFloored(results) {
  return results.length >= PLACEMENT.FLOOR && results.slice(0, PLACEMENT.FLOOR).every((r) => !r.solved && r.grade <= PLACEMENT.START);
}

/** Whether the quiz is over after `results`: MAX answers, MIN with a stable grade, or the floor. */
export function placementDone(results) {
  if (results.length >= PLACEMENT.MAX) return true;
  if (placementFloored(results)) return true;
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
 * (two) times there and missed no more often than solved; from grade
 * STRICT_FROM (3) up, solved more often than missed, so answering half of
 * everything right does not place high. Grade 1 when no grade is passed.
 * Never above MAX_GRADE. Every answer right ends at MAX_GRADE, every answer
 * wrong at 1, and someone who solves grade 3 twice but misses grade 4 is
 * placed at 3.
 */
export function placementGrade(results) {
  if (!results.length) return null;
  let grade = 1;
  for (let g = 1; g <= PLACEMENT.MAX_GRADE; g++) {
    const at = results.filter((r) => r.grade === g);
    const solved = at.filter((r) => r.solved).length;
    const missed = at.length - solved;
    if (solved >= PLACEMENT.PASS && (g >= PLACEMENT.STRICT_FROM ? solved > missed : solved >= missed)) grade = g;
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
