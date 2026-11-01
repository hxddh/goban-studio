/**
 * Playing strength that follows your results.
 *
 * Ratings use the EGF scale (1 dan = 2100, each kyu 100 below; 1 kyu = 2000)
 * and a logistic expectation. Each finished game against the computer moves
 * the estimate; early games move it more. Handicap stones count as one rank
 * each (the half stone of komi is ignored). Pure functions: the controller
 * stores the result in progress.rating.
 */

export function rankToRating(rank) {
  // rank: kyu as positive (30…1), dan as 0, -1, -2 … for 1d, 2d, 3d (as in settings)
  if (rank == null) return null;
  return rank > 0 ? 2100 - 100 * rank : 2100 + 100 * -rank;
}

export function ratingToRank(r) {
  // Returns the same rank encoding: 1d = 0, 2d = -1 … ; 1k = 1, 30k = 30.
  if (r >= 2100) return 0 - Math.floor((r - 2100) / 100) || 0;
  return Math.min(30, Math.max(1, Math.ceil((2100 - r) / 100)));
}

/** Display parts for a rating: { n, unit: "kyu"|"dan" }. */
export function ratingParts(r) {
  const rank = ratingToRank(r);
  return rank > 0 ? { n: rank, unit: "kyu" } : { n: 1 - rank, unit: "dan" };
}

export function expected(r, opponent) {
  return 1 / (1 + Math.pow(10, (opponent - r) / 400));
}

function kFactor(games) {
  if (games < 5) return 140;
  if (games < 20) return 70;
  return 36;
}

/**
 * Update after one game. `opponentRating` is the computer's nominal rating;
 * `handicap` stones were given to the player (positive) — they make the
 * opponent effectively weaker by one rank each.
 */
export function updateRating(rating, { opponentRating, handicap = 0, won, at = Date.now() }) {
  const r = rating?.r ?? opponentRating;
  const games = rating?.games ?? 0;
  const effective = opponentRating - (handicap >= 2 ? handicap * 100 : 0);
  const e = expected(r, effective);
  const next = Math.round(r + kFactor(games) * ((won ? 1 : 0) - e));
  const history = [...(rating?.history || []), { at, r: next }].slice(-200);
  return { r: next, games: games + 1, history };
}

export function startRating(playerRank) {
  const r = rankToRating(playerRank ?? 30);
  return { r, games: 0, history: [{ at: Date.now(), r }] };
}
