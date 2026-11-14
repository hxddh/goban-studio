/**
 * A second reading of the player's strength, from their own moves
 * (docs/strength.md, "your moves, a second channel").
 *
 * KataGo's human SL model gives, for a position and a rank profile, the
 * probability that a player of that rank plays each point. Over one game
 * the profile whose players would most likely have played the player's
 * moves says something about the player, independently of the result
 * (the approach KaTrain and AI Sensei use). Here: for every move of the
 * player after the opening, the probability of the move played under each
 * of PROFILES; a posterior over the profiles from the summed log
 * probabilities (uniform prior), tempered because neighbouring moves are
 * not independent evidence and the model imitates style, not strength.
 *
 * It is shown as "your moves look like ≈ N kyu" with its range, stored
 * per game, and used only as a weak prior for the rating (player.js
 * applyMoveRank): results against measured opponents remain the evidence.
 * Pure: the probabilities come in as arguments (katago.js
 * humanMoveProbabilities asks the host for them).
 */

/** The profiles compared, weakest first, with their rank (kyu positive, 1 dan 0, 3 dan −2). */
export const PROFILES = [
  { id: "rank_20k", rank: 20 },
  { id: "rank_15k", rank: 15 },
  { id: "rank_10k", rank: 10 },
  { id: "rank_5k", rank: 5 },
  { id: "rank_1k", rank: 1 },
  { id: "rank_1d", rank: 0 },
  { id: "rank_3d", rank: -2 },
];

/** Moves of the opening that are left out (mostly standard points; they tell ranks apart poorly). */
export const SKIP_MOVES = 10;
/** Fewest scored moves before a reading is given. */
export const MIN_MOVES = 30;
/** Each move counts as 1/TEMPER of an independent observation. */
const TEMPER = 4;
/** A probability is never taken below this (a move the model did not expect is not proof). */
export const FLOOR = 1e-3;
/** The range shown is never narrower than ± this many ranks. */
const MIN_HALF_WIDTH = 2;

/**
 * The reading from per-move probabilities: `rows` = [{ index, p: { [profile]: prob } }]
 * (one per scored move of the player). Returns null with fewer than
 * MIN_MOVES usable moves, else { rank, lo, hi, n, posterior: { [profile]: w } }:
 * `rank` the posterior mean rank, rounded; lo…hi the range of about two
 * chances in three (mean ± one standard deviation, at least
 * MIN_HALF_WIDTH), lo the stronger end (smaller number).
 */
export function rankFromLikelihoods(rows, { profiles = PROFILES } = {}) {
  const usable = (rows || []).filter((r) => r && (r.index ?? 0) >= SKIP_MOVES && profiles.every((pr) => Number.isFinite(r.p?.[pr.id])));
  if (usable.length < MIN_MOVES) return null;
  const log = profiles.map((pr) => usable.reduce((s, r) => s + Math.log(Math.max(FLOOR, r.p[pr.id])), 0) / TEMPER);
  const top = Math.max(...log);
  const w = log.map((l) => Math.exp(l - top));
  const total = w.reduce((a, b) => a + b, 0);
  const post = w.map((x) => x / total);
  const mean = post.reduce((s, x, i) => s + x * profiles[i].rank, 0);
  const sd = Math.sqrt(post.reduce((s, x, i) => s + x * (profiles[i].rank - mean) ** 2, 0));
  const half = Math.max(MIN_HALF_WIDTH, sd);
  const strongest = Math.min(...profiles.map((p) => p.rank));
  const weakest = Math.max(...profiles.map((p) => p.rank));
  const clamp = (v) => Math.max(strongest, Math.min(weakest, Math.round(v)));
  return {
    rank: clamp(mean),
    lo: clamp(mean - half),
    hi: clamp(mean + half),
    n: usable.length,
    posterior: Object.fromEntries(profiles.map((pr, i) => [pr.id, Math.round(post[i] * 1000) / 1000])),
  };
}

/** A stored reading, checked: { rank, lo, hi, n, at? } or null. */
export function normalizeMoveRank(v) {
  if (!v || typeof v !== "object") return null;
  const ok = (x) => typeof x === "number" && Number.isFinite(x) && x >= -9 && x <= 30;
  if (!ok(v.rank) || !ok(v.lo) || !ok(v.hi) || !(v.n > 0)) return null;
  return { rank: Math.round(v.rank), lo: Math.round(Math.min(v.lo, v.rank)), hi: Math.round(Math.max(v.hi, v.rank)), n: Math.floor(v.n), ...(Number.isFinite(v.at) ? { at: v.at } : {}) };
}
