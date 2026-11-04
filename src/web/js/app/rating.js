/**
 * Ranks and ratings on the EGF scale (1 dan = 2100, each kyu 100 below;
 * 1 kyu = 2000). Pure conversions; since v6 the estimate itself — a
 * rating with an uncertainty, updated by results — lives in strength.js
 * and is stored in progress.rating (its `r` is a rating on this scale).
 */

export function rankToRating(rank) {
  // rank: kyu as positive (30…1), dan as 0, -1, -2 … for 1d, 2d, 3d (as in settings)
  if (rank == null) return null;
  return rank > 0 ? 2100 - 100 * rank : 2100 + 100 * -rank;
}

export function ratingToRank(r) {
  // Returns the same rank encoding: 1d = 0, 2d = -1 … ; 1k = 1, 30k = 30.
  // v6: the nearest rank (as the level labels are rounded), so a rank's
  // own rating maps back to it from either side.
  const k = Math.round((2100 - r) / 100);
  return k >= 1 ? Math.min(30, k) : k || 0;
}

/** Display parts for a rating: { n, unit: "kyu"|"dan" }. */
export function ratingParts(r) {
  const rank = ratingToRank(r);
  return rank > 0 ? { n: rank, unit: "kyu" } : { n: 1 - rank, unit: "dan" };
}
