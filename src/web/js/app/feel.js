/**
 * v8: how the computer opponent feels to play against, as pure functions
 * of its search (play-ctl.js applies them; scripts/tests/v8-feel.mjs pins
 * them):
 *
 *   thinkTime     how long it seems to think: quick when the move is
 *                 obvious, slower when it is not, never instant, never
 *                 sluggish
 *   resignStep    whether it resigns: only when clearly lost, never while
 *                 ahead or with much of the board still open, never at the
 *                 gentlest levels
 *   countReady    whether to offer "shall we count?": only on a settled
 *                 board where no move is worth anything
 *
 * Every analysis is Black's point of view (katago.js).
 */
import { BLACK } from "../rules.js";
import { strengthById } from "../engine.js";
import { complexity, settled } from "./insight.js";

/** The computer never answers faster than this (ms), nor slower than THINK_MAX. */
export const THINK_MIN = 350;
export const THINK_MAX = 3500;

/**
 * How long the computer seems to think (ms). Tuned for the 19×19 game that
 * is the default: the opening is brisk, fighting takes longer, the endgame
 * is quicker again (docs/design.md §8). Stronger levels take a little
 * longer; a jitter of ±15% keeps it from feeling mechanical.
 */
export function thinkTime(strengthId, a, moveNumber, size, rnd = Math.random) {
  const st = strengthById(strengthId);
  const base = st.rank >= 20 ? 520 : st.rank >= 10 ? 820 : st.rank >= 1 ? 1150 : 1500;
  const c = complexity(a);
  const opening = moveNumber < (size >= 19 ? 30 : size) ? 0.55 : 1;
  const endgame = size >= 13 && moveNumber > size * size * 0.6 ? 0.75 : 1;
  const jitter = 0.85 + rnd() * 0.3;
  return Math.max(THINK_MIN, Math.min(THINK_MAX, Math.round(base * (0.55 + c * 1.5) * opening * endgame * jitter)));
}

/** Levels at or below this strength (label rank, kyu) play every game out. */
export const RESIGN_FROM_RANK = 15;
/** Consecutive hopeless searches before the computer resigns. */
export const RESIGN_STREAK = 3;

/** Points whose owner is still open (|ownership| < 0.5); null without ownership. */
export function openPoints(ownership) {
  if (!ownership) return null;
  let n = 0;
  for (const v of ownership) if (Math.abs(v) < 0.5) n++;
  return n;
}

/**
 * One step of the resignation check, after the computer's search of the
 * position it is about to move in. `low` is the streak so far; returns the
 * new streak and whether to resign now.
 *
 * Hopeless means: KataGo gives the computer under 3% and it is behind by
 * more than what is still in play — at least 15 points, and at least half
 * the open points (a quarter for the two strongest levels, whose opponents
 * rarely give a lead back). So a weak level does not resign a game its
 * opponent could still throw away, and no level resigns while ahead.
 */
export function resignStep(low, { strengthId, analysis, aiColor, moveNumber, size, empty = size * size }) {
  const st = strengthById(strengthId);
  if (st.rank > RESIGN_FROM_RANK) return { low: 0, resign: false };
  if (!analysis || !Number.isFinite(analysis.winrate) || !Number.isFinite(analysis.scoreLead)) return { low: 0, resign: false };
  if (moveNumber <= (size * size) / 5) return { low: 0, resign: false };
  const aiWin = aiColor === BLACK ? analysis.winrate : 1 - analysis.winrate;
  const behind = -aiColor * analysis.scoreLead;
  // Without ownership, every empty point counts as open.
  const open = openPoints(analysis.ownership) ?? empty;
  const margin = Math.max(15, open * (st.rank <= 2 ? 0.25 : 0.5));
  const hopeless = aiWin < 0.03 && behind > margin;
  const next = hopeless ? low + 1 : 0;
  return { low: next, resign: next >= RESIGN_STREAK };
}

/**
 * Whether the board is settled enough to offer the count: past the first
 * third of the board's points in moves, ownership firm nearly everywhere,
 * and KataGo's best move is a pass or worth no more than its second
 * choice (all that is left is dame).
 */
export function countReady(a, moveNumber, size) {
  if (!a || moveNumber < (size * size) / 3 || !settled(a.ownership)) return false;
  const moves = (a.moves || []).filter((m) => (m.visits || 0) > 0 && Number.isFinite(m.scoreLead));
  const top = moves[0];
  if (!top) return false;
  if (top.pass) return true;
  const second = moves[1];
  return !second || Math.abs(second.scoreLead - top.scoreLead) < 0.6;
}
