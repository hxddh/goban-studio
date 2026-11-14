/**
 * How a move compares with the best one, in points (the score lead the
 * engine expected before the move, against the one it sees after it), and
 * the word for it: good, slack or a mistake. The same comparison pauses a
 * teaching game on a costly move; here it is said quietly after every move
 * of the player when the balance is shown.
 */

/** Below this many points a move is as good as the best one. */
export const SLACK_FROM = 1.5;

/**
 * From this many points a move is a mistake: the teaching warning's
 * threshold — wider from 10 kyu up (`playerRank` ≤ 10; dan ranks are 0 and
 * below), where a few points are a matter of judgement rather than a blunder.
 */
export function mistakeFrom(playerRank) {
  return playerRank != null && playerRank <= 10 ? 6 : 4;
}

/**
 * Points lost by the move that led from `before` to `after` (engine
 * analyses: `before.moves[0]` is the best move, `scoreLead` is from Black's
 * side), for the player of `color` (1 Black, -1 White). Null when either
 * search is missing its numbers.
 */
export function moveLoss(before, after, color) {
  const best = before?.moves?.[0];
  if (!best || !Number.isFinite(best.scoreLead) || !Number.isFinite(after?.scoreLead)) return null;
  return color * (best.scoreLead - after.scoreLead);
}

/**
 * How many of the moves on `line` (the game's main line, its nodes) were
 * good, slack or mistakes, from `verdicts` (node id → points lost). A move
 * taken back keeps its entry in `verdicts` but is not on the line, so it is
 * not counted.
 */
export function tallyVerdicts(line, verdicts, playerRank) {
  const counts = { good: 0, slack: 0, mistake: 0 };
  for (const node of line) {
    const v = verdictOf(verdicts?.[node.id], playerRank);
    if (v) counts[v]++;
  }
  return counts;
}

/** "good" | "slack" | "mistake" for a loss in points (null: nothing to say). */
export function verdictOf(loss, playerRank) {
  if (loss == null || !Number.isFinite(loss)) return null;
  if (loss >= mistakeFrom(playerRank)) return "mistake";
  if (loss >= SLACK_FROM) return "slack";
  return "good";
}
