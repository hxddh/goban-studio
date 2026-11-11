/**
 * The first days: what a new player is offered, and which board comes next.
 * Pure — the callers (play-ctl.js recommendedGame, the Today hero) pass in
 * what they know.
 *
 *   firstOffer({ experience, games, lessonsDone })
 *     What onboarding promised, until it has been taken up:
 *       "lesson"  never played → lesson one
 *       "small"   knows the rules → the gentle 9×9 game
 *       "full"    plays → the 19×19 game
 *     null once a game was started or finished (or a lesson done), and for
 *     a profile that never went through onboarding.
 *
 *   suggestedSize({ beginner, finished })
 *     The board of the suggested game. A beginner starts on 9×9 and moves
 *     to 13×13 after SMALL_GAMES finished games there; someone past the
 *     beginner ranks who came up through the small boards plays
 *     MIDDLE_GAMES games on 13×13 before the full board. Everyone else
 *     plays 19×19.
 *
 *   otherSize(size)
 *     The quieter second offer beside it: the next board up (9 → 13 →
 *     19), and a quick 9×9 beside the full board.
 *
 *   finishedBySize(games)
 *     { 9, 13, 19 } from the games index: finished games of the player's
 *     own against the computer (imports and two-player games do not count).
 */

/** Finished 9×9 games before 13×13 is suggested. */
export const SMALL_GAMES = 3;
/** Finished 13×13 games before 19×19 is suggested to someone who started on the small boards. */
export const MIDDLE_GAMES = 2;

export function finishedBySize(games = []) {
  const out = { 9: 0, 13: 0, 19: 0 };
  for (const g of games) {
    if (!g || g.source === "import" || !g.result || g.opponent !== "ai") continue;
    if (out[g.size] !== undefined) out[g.size] += 1;
  }
  return out;
}

export function suggestedSize({ beginner = false, finished = {} } = {}) {
  const n9 = finished[9] || 0;
  const n13 = finished[13] || 0;
  const n19 = finished[19] || 0;
  if (beginner) return n9 < SMALL_GAMES ? 9 : 13;
  // Past the beginner ranks: one more step for those who have only played small boards.
  if (n19 === 0 && n9 >= SMALL_GAMES && n13 < MIDDLE_GAMES) return 13;
  return 19;
}

export function otherSize(size) {
  return size === 9 ? 13 : size === 13 ? 19 : 9;
}

export function firstOffer({ experience = null, games = 0, lessonsDone = 0, gameStarted = false } = {}) {
  if (games > 0 || gameStarted) return null;
  if (experience === "new") return lessonsDone > 0 ? null : "lesson";
  if (experience === "rules") return "small";
  if (experience === "player") return "full";
  return null;
}
