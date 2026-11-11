/**
 * Reading an ownership map (KataGo's estimate of who each point belongs
 * to, one number per point from -1 to 1): how much of the board is settled.
 * Pure; used by the game summary (app/summary.js) and by what a game's
 * file keeps of its analysis (data/pack.js).
 */

/** A point counts as decided when its ownership is at least this sure, either way. */
export const FIRM = 0.8;

/** The share of points that are decided, or null without a map. */
export function settledShare(ownership) {
  if (!ownership?.length) return null;
  let firm = 0;
  for (const v of ownership) if (Math.abs(v) >= FIRM) firm++;
  return firm / ownership.length;
}
