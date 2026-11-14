/**
 * The player model's rating: Glicko on the 19×19 θ scale of the measured
 * ladder (model/ladder.js), one estimate per board size. Pure.
 */
import { gorToTheta, onBoard, rankToRating, ratingToRank, thetaToGoR } from "./ladder.js";
import { DAY, finite, round } from "./util.js";

/**
 * The profile's own format version. Format 9 files (`v: 9`) are
 * migrated by normalizeProfile (problem and drill records to the memory
 * model, placements capped); anything older than 9 or newer than this
 * starts empty, as before (the data layer refuses to overwrite a newer file).
 */
export const PROFILE_V = 13;
/** The oldest profile version normalizeProfile reads. */
export const PROFILE_MIN_V = 9;

/* =========================================================== the rating */

/** Prior spread around the rank you gave (nats; ≈ 4–6 ranks). */
export const SIGMA0 = 2.5;
/** Uncertainty added before every game (nats), so the estimate keeps moving. */
const SIGMA_GAME = 0.2;
/** Uncertainty added per day without games (nats per √day). */
const SIGMA_DAY = 0.1;
/** Measurement error of a level's θ relative to its neighbours (nats). */
export const SIGMA_LEVEL = 0.5;
/** The estimate stays inside 30 kyu − 15 ranks … 9 dan. */
export const MU_MIN = gorToTheta(-2400);
export const MU_MAX = gorToTheta(2900);
/** A game needs this many moves to be rated. */
export const MIN_RATED_MOVES = 12;
export const MAX_HISTORY = 200;

const G = 1 / Math.sqrt(1 + (3 * SIGMA_LEVEL * SIGMA_LEVEL) / (Math.PI * Math.PI));

/** A rating entry at the prior: the rank you gave (30 kyu when none). */
export function priorRating(rank = null, at = 0) {
  return { mu: round(gorToTheta(rankToRating(rank ?? 30))), sigma: SIGMA0, games: 0, at };
}

/** sigma grown by time away (capped at the prior's). */
export function sigmaAt(entry, at) {
  const days = Math.max(0, (at - (finite(entry.at) ? entry.at : at)) / DAY);
  return Math.min(SIGMA0, Math.sqrt(entry.sigma * entry.sigma + SIGMA_DAY * SIGMA_DAY * days));
}

/** Expected score of a player at `mu` (19×19 θ) against `opp` (board θ). */
export function expectedScore(mu, opp, size = 19) {
  return 1 / (1 + Math.exp(-G * (onBoard(mu, size) - opp)));
}

/**
 * One rated game: a Glicko-1 step in natural units against an opponent of
 * θ `opponent` on that board. The board's θ is a smooth function of 19×19
 * θ, linearised at mu (slope `s`); the level's own measurement error widens
 * the logistic (G).
 */
export function updateRating(entry, { opponent, size = 19, won, at }) {
  const prev = entry && finite(entry.mu) ? entry : priorRating(30, at);
  const sigma0 = Math.min(SIGMA0, Math.sqrt(sigmaAt(prev, at) ** 2 + SIGMA_GAME * SIGMA_GAME));
  const mu = prev.mu;
  const h = 0.01;
  const s = (onBoard(mu + h, size) - onBoard(mu - h, size)) / (2 * h);
  const e = 1 / (1 + Math.exp(-G * (onBoard(mu, size) - opponent)));
  const info = s * s * G * G * e * (1 - e);
  const v = 1 / (1 / (sigma0 * sigma0) + info);
  const next = Math.min(MU_MAX, Math.max(MU_MIN, mu + v * s * G * ((won ? 1 : 0) - e)));
  return { mu: round(next), sigma: round(Math.sqrt(v)), games: (prev.games || 0) + 1, at };
}

/** How a rating entry reads now: rank, ± ranks (at least 1), GoR and band. */
export function readRating(entry, now) {
  const sigma = sigmaAt(entry, now);
  const r = thetaToGoR(entry.mu);
  const lo = thetaToGoR(entry.mu - sigma);
  const hi = thetaToGoR(entry.mu + sigma);
  return { rank: ratingToRank(r), pm: Math.max(1, Math.round((hi - lo) / 200)), r: Math.round(r), lo: Math.round(lo), hi: Math.round(hi), mu: entry.mu, sigma, games: entry.games || 0 };
}

/**
 * The entry that speaks for `size`: that size's own once it has games,
 * else the one with the most games (all are on the 19×19 scale), else
 * that size's prior.
 */
export function ratingFor(profile, size, prior = 30) {
  const own = profile?.rating?.[size];
  if (own && own.games > 0) return own;
  const best = bestRated(profile);
  if (best) return profile.rating[best];
  return own || priorRating(prior, 0);
}

/** The size with the most rated games (ties: 19, 13, 9); null without any. */
export function bestRated(profile) {
  let best = null;
  for (const size of [19, 13, 9]) {
    const e = profile?.rating?.[size];
    if (e && e.games > 0 && (best == null || e.games > profile.rating[best].games)) best = size;
  }
  return best;
}
