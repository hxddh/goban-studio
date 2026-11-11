/**
 * The estimate shown to the player (rank with its margin, per board and
 * overall), its history, the days practised and the milestones reached, and
 * the opponent to suggest. Pure.
 */
import { LEVELS, levelTheta, measuredRank, rankToRating, ratingToRank, sizeOf, thetaToGoR } from "./ladder.js";
import { normalizeProfile } from "./profile.js";
import { bestRated, expectedScore, ratingFor, readRating } from "./rating.js";
import { dayKey, finite } from "./util.js";
import { evidence } from "./focus.js";
import { isMastered } from "./review.js";
import { gradeForRank } from "./plan.js";

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

/**
 * The rating over time, for a chart: one point after each rated game,
 * oldest first, at most MAX_HISTORY (200):
 *   [{ t, size, rating, sd, rank, pm }]
 * `t` is the time (ms), `rating` the estimate in GoR (100 per rank; 2100 is
 * 1 dan), `sd` its one-sigma half-width in GoR, `rank` and `pm` the same
 * as ranks ("≈ 12 kyu (±1)"). Points stored before the GoR was kept read
 * it from the rank (the middle of that rank) and `pm` × 100. One board with
 * `size`, else all boards in time order (each point says its `size`).
 * Games played with an undo or a hint are not rated and add no point.
 */
export function ratingHistory(profile, size = null) {
  return historyOf(profile, size)
    .map((h) => ({ t: h.at, size: h.size, rating: finite(h.r) ? h.r : rankToRating(h.rank), sd: finite(h.sd) ? h.sd : h.pm * 100, rank: h.rank, pm: h.pm }))
    .sort((a, b) => a.t - b.t);
}

/**
 * The last `days` local days, oldest first, the last one today: how many
 * things were done on each (0: none). A day counts when a game was
 * finished or a problem or drill was attempted (profile.days, kept by
 * recordGame, recordProblem and recordMistake). Days from before that was
 * kept are read from what the profile still has: the games in its list,
 * and each problem's first sight, last attempt and last solve — enough to
 * mark the day, not to count everything done on it.
 */
export function practiceDays(profile, now = 0, days = 28) {
  const p = normalizeProfile(profile);
  const old = {};
  const mark = (t) => {
    if (!finite(t) || t <= 0 || t > now) return;
    const k = dayKey(t);
    old[k] = (old[k] || 0) + 1;
  };
  for (const g of p.games) mark(g.at);
  for (const e of Object.values(p.problems)) for (const t of new Set([e.seen, e.last, e.solvedAt])) mark(t);
  for (const m of p.mistakes) if (m.tries > 0) mark(m.last);
  const out = [];
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const k = dayKey(d.getTime());
    out.unshift(p.days[k] || old[k] || 0);
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/** Problems mastered (isMastered) at which a milestone is reached. */
const MASTERED_STEPS = [10, 25, 50, 100, 200, 400];

/**
 * The one-time milestones reached so far, oldest first (those without a
 * known time last):
 *   { key: "firstGame", at }            the first game finished
 *   { key: "first19", at }              the first 19×19 game
 *   { key: "unit", id, at }             every lesson of a course unit done
 *   { key: "level", n, at }             solving level n (2–5) reached
 *   { key: "mastered", n, at }          n problems mastered (MASTERED_STEPS)
 * `at` is when it was first reached, or null when the profile does not
 * say (reached before milestones were kept and not recoverable). The first
 * games are stamped by recordGame; the others get their time when
 * keepMilestones is next called, so call it after results change. A level
 * or a count once reached stays reached (it is kept in profile.marks).
 *
 * `content` = { course?, problems?, grades?, settings? }: units need the
 * course, levels the problems and grades (and the settings, for the grade
 * the player started at: levelPrior). Without them those are only the
 * ones already kept.
 */
export function milestones(profile, content = {}, now = 0) {
  const p = normalizeProfile(profile);
  const out = [];
  const at = (k, fallback = null) => (finite(p.marks[k]) ? p.marks[k] : fallback);
  const oldest = (list) => (list.length ? Math.min(...list.map((g) => g.at)) : null);
  if (p.marks.firstGame != null || p.games.length) out.push({ key: "firstGame", at: at("firstGame", oldest(p.games)) });
  const big = p.games.filter((g) => g.size === 19);
  if (p.marks.first19 != null || big.length) out.push({ key: "first19", at: at("first19", oldest(big)) });
  const units = new Map();
  for (const unit of content.course || []) {
    const ls = unit.lessons || [];
    if (ls.length && ls.every((l) => p.lessons[l.id]?.done)) units.set(unit.id, Math.max(...ls.map((l) => p.lessons[l.id].at || 0)) || null);
  }
  for (const k of Object.keys(p.marks)) if (k.startsWith("unit:") && !units.has(k.slice(5))) units.set(k.slice(5), null);
  for (const [id, t] of units) out.push({ key: "unit", id, at: at("unit:" + id, t) });
  let level = 1;
  if (content.problems?.length) {
    const ev = evidence(p, { problems: content.problems, grades: content.grades || {}, now, cover: levelPrior(p, content.settings || {}, now) });
    if (ev.problems.levelOnGrade) level = ev.problems.level;
  }
  for (let n = 2; n <= 5; n++) if (n <= level || p.marks["level:" + n] != null) out.push({ key: "level", n, at: at("level:" + n) });
  const mastered = Object.values(p.problems).filter(isMastered).length;
  for (const n of MASTERED_STEPS) if (n <= mastered || p.marks["mastered:" + n] != null) out.push({ key: "mastered", n, at: at("mastered:" + n) });
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}

/** The key a milestone is kept under in profile.marks. */
export function milestoneKey(m) {
  return m.key === "unit" ? "unit:" + m.id : m.n != null ? m.key + ":" + m.n : m.key;
}

/**
 * Stamp the milestones reached and not kept yet with their time (`now`
 * when the profile does not say when). Returns the profile itself when
 * there is nothing new, so a caller can skip the save; `fresh` lists what
 * was new: { profile, fresh: [milestone…] }.
 */
export function keepMilestones(profile, content = {}, now = 0) {
  const p = normalizeProfile(profile);
  const fresh = milestones(p, content, now).filter((m) => p.marks[milestoneKey(m)] == null);
  if (!fresh.length) return { profile, fresh };
  const marks = { ...p.marks };
  for (const m of fresh) marks[milestoneKey(m)] = m.at ?? now;
  return { profile: { ...p, marks }, fresh: fresh.map((m) => ({ ...m, at: m.at ?? now })) };
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
 * the player is expected to score closest to 50% against, with `modeOf(level)` the mode each level would be
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

/**
 * The grade a player starts at before their solving level is measured: the
 * placement grade; without one, the grade of their rank (the estimate once
 * they have rated games, else the rank they gave; gradeForRank) — null for
 * a beginner, who starts at the easiest unseen grade. It is planProblems'
 * `prior` and evidence's `cover`: a view that shows the solving level
 * should pass it too, so it shows the level the path uses:
 *   evidence(profile, { problems, grades, now, cover: levelPrior(profile, settings, now) })
 */
export function levelPrior(profile, settings = {}, now = 0) {
  const placed = profile?.placement?.grade ?? null;
  if (placed != null) return placed;
  if (settings.experience === "new" || (settings.playerRank ?? 30) >= 25) return null;
  const est = estimate(profile, { now });
  return gradeForRank(est.games > 0 ? est.rank : settings.playerRank);
}
