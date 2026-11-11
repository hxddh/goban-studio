/**
 * What Practice and Today show about progress, as pure functions of what
 * the player model (model/player.js) already knows — no state, no DOM, so
 * the views stay thin and the words are tested in Node.
 *
 *   problemStatus    the quiet mark on a problem's tile
 *   groupPath        today's path with neighbours of one theme as one row
 *   ratingTrend      the rating history as a small line and one sentence
 *   masteryTotals    mastered / learning / not yet, over every theme
 *   gradeBand        the rank band a difficulty stands for (≈)
 *   comesBackIn      "back in about 3 days"
 *   weekParts        this week's line without its zero parts
 */
import { DAY, GRADE_RANK, isMastered } from "../model/player.js";

/**
 * A problem's state for its tile, from its record:
 *   "new"       never tried
 *   "due"       tried, and its review date has come
 *   "mastered"  out of review, or known for three weeks (isMastered)
 *   "solved"    solved (see `cleanFirst` for a first-sight solve)
 *   "tried"     tried, not solved yet
 * Due comes first: it is the one state that asks for something today.
 */
export function problemStatus(e, now = 0) {
  if (!e || !(e.tries > 0)) return "new";
  if (!e.retired && e.due > 0 && e.due <= now) return "due";
  if (isMastered(e)) return "mastered";
  return e.solved ? "solved" : "tried";
}

/** Solved the first time it was shown, without a hint (the model's `first`). */
export const cleanFirst = (e) => !!e && e.solved === true && e.first === "clean";

/**
 * Today's path as rows: problems that follow one another with the same
 * theme, role and reason become one row ("Ladders · 4 problems"); every
 * other item is a row of its own. The order is the path's — the session
 * plays the items, not the rows.
 *   → [{ kind, role, why, theme, items: [item…] }]
 * `themeOf(item)` names a problem's theme (null: never merged).
 */
export function groupPath(items = [], themeOf = () => null) {
  const rows = [];
  for (const it of items) {
    const theme = it.kind === "problem" ? themeOf(it) || null : null;
    const last = rows[rows.length - 1];
    if (theme && last && last.kind === "problem" && last.theme === theme && last.role === it.role && last.why === (it.why || null)) last.items.push(it);
    else rows.push({ kind: it.kind, role: it.role, why: it.why || null, theme, items: [it] });
  }
  return rows;
}

/** A sparkline needs at least this many rated games; fewer say nothing. */
export const TREND_MIN = 3;
/** …and shows at most this many, the newest. */
export const TREND_MAX = 40;

/**
 * The rating history (model ratingHistory) as a trend: null with fewer
 * than TREND_MIN points, else
 *   { points, ranks, days, games }
 * `ranks` is the change from the first shown point to the last in whole
 * ranks (positive: stronger; 0: about the same), `days` the time between
 * them in whole days, `games` how many points are shown.
 */
export function ratingTrend(history = []) {
  const points = history.filter((h) => Number.isFinite(h?.rating)).slice(-TREND_MAX);
  if (points.length < TREND_MIN) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return { points, ranks: Math.round((last.rating - first.rating) / 100) || 0, days: Math.max(0, Math.round((last.t - first.t) / DAY)), games: points.length };
}

/**
 * The trend's line in a `w` × `h` box: games evenly spaced, the rating
 * upwards. The scale never shows less than two ranks, so the noise of a
 * level that is not moving stays a nearly flat line.
 *   → { line: "x,y x,y …", end: { x, y } }
 */
export function sparkline(points, w = 160, h = 36, pad = 4) {
  const vals = points.map((p) => p.rating);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 200) {
    const mid = (hi + lo) / 2;
    lo = mid - 100;
    hi = mid + 100;
  }
  const n = points.length;
  const xy = vals.map((v, i) => ({
    x: Math.round((pad + ((w - 2 * pad) * i) / Math.max(1, n - 1)) * 10) / 10,
    y: Math.round((pad + (h - 2 * pad) * (1 - (v - lo) / (hi - lo))) * 10) / 10,
  }));
  return { line: xy.map((p) => `${p.x},${p.y}`).join(" "), end: xy[xy.length - 1] };
}

/** Mastery over every theme (model masteryByTheme): { total, mastered, learning, unseen }. */
export function masteryTotals(byTheme = {}) {
  const out = { total: 0, mastered: 0, learning: 0, unseen: 0 };
  for (const row of Object.values(byTheme)) for (const k of Object.keys(out)) out[k] += row[k] || 0;
  return out;
}

/** The themes the player has met, most mastered first: [{ key, total, mastered, learning, unseen }]. */
export function themesMet(byTheme = {}) {
  return Object.entries(byTheme)
    .filter(([, r]) => r.mastered + r.learning > 0)
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => b.mastered - a.mastered || b.learning - a.learning || a.key.localeCompare(b.key));
}

/**
 * The ranks a difficulty is meant for (model GRADE_RANK, gradeForRank):
 * { from, to } in kyu, weakest first — 1: 30–19, 2: 18–14, 3: 13–11,
 * 4: 10–7 — and { from: 6, to: null } for 5 (6 kyu and stronger). The
 * grades are estimated, so the views mark the band with ≈.
 */
export function gradeBand(grade) {
  const from = GRADE_RANK[grade];
  if (from == null) return null;
  const next = GRADE_RANK[grade + 1];
  return { from, to: next == null ? null : next + 1 };
}

/** Whole days until a review comes back (at least 1: "tomorrow"); null when it does not. */
export function comesBackIn(e, now = 0) {
  if (!e || e.retired || !(e.due > now)) return null;
  return Math.max(1, Math.round((e.due - now) / DAY));
}

/** This week's counts as the parts worth saying: zero parts are left out. */
export function weekParts({ played = 0, solved = 0 } = {}) {
  const out = [];
  if (played > 0) out.push({ key: "games", n: played });
  if (solved > 0) out.push({ key: "problems", n: solved });
  return out;
}

/** How many of the days (model practiceDays) had any practice. */
export const activeDays = (days = []) => days.filter((n) => n > 0).length;

/**
 * The newest `max` milestones that have a time, newest first. Of the ones
 * that count up (a solving level, problems mastered) only the highest is
 * listed: "25 mastered" says "10 mastered" too.
 */
export function recentMilestones(list = [], max = 3) {
  const top = {};
  for (const m of list) if (m.n != null) top[m.key] = Math.max(top[m.key] ?? 0, m.n);
  return list
    .filter((m) => Number.isFinite(m.at) && m.at > 0 && (m.n == null || m.n === top[m.key]))
    .sort((a, b) => b.at - a.at)
    .slice(0, max);
}
