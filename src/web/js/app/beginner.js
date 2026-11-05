/**
 * v8 beginner path: which game the lesson-complete page offers.
 *
 *   • Capture Go after the capturing lesson and the two after it, until the
 *     player has won two capture games.
 *   • "Play your first 9×9 game" after the life basics (two eyes, and the end
 *     of the life unit), until the player has finished a game against the
 *     computer.
 *
 * Pure: it reads only what it is given, so Node tests can call it.
 */

/** Lessons whose completion offers capture Go (course.js, unit "stones"). */
export const CAPTURE_AFTER = ["stones-capture", "stones-groups", "stones-suicide"];
/** Lessons whose completion offers the first 9×9 game (course.js, unit "life"). */
export const FIRST_GAME_AFTER = ["life-two-eyes", "life-space"];
/** Capture games won before the bridge stops offering capture Go. */
export const CAPTURE_WINS_ENOUGH = 2;
/** The first 9×9 game: the gentlest computer level. */
export const FIRST_GAME = { size: 9, strength: "30k", handicap: 0 };

/** "capture" | "firstGame" | null for the lesson just finished. */
export function bridgeAfter(lessonId, { settings = {}, progress = {} } = {}) {
  if (CAPTURE_AFTER.includes(lessonId) && (settings.captureWins || 0) < CAPTURE_WINS_ENOUGH) return "capture";
  if (FIRST_GAME_AFTER.includes(lessonId) && !(progress.games || []).length) return "firstGame";
  return null;
}
