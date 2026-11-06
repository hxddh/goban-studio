/**
 * v6: your playing strength as an estimate with an uncertainty.
 *
 * The model (docs/strength.md, "Your strength: the estimate") is a
 * Bayesian rating in the same units the computer levels were calibrated
 * in: θ, Bradley–Terry strength in natural-log units on 19×19, with the
 * same mapping onto the EGF scale (GoR, 1 dan = 2100) as the level labels.
 * Your strength is a normal distribution N(mu, sigma²) over θ; each rated
 * game against the computer updates it with one Glicko step against the
 * level's *measured* strength (not its rounded label) on that board size.
 * Uncertainty grows a little before each game and with time away, so the
 * estimate can follow a player who improves.
 *
 * Game performance (accuracy, points lost per move) is deliberately not
 * part of the estimate; docs/strength.md explains why.
 *
 * Pure functions. progress.rating holds the estimate:
 *   { v: 6, mu, sigma, games, at, r, history: [{ at, r, lo, hi }] }
 * `r` (GoR of mu) keeps every v5 reader of progress.rating working; `lo`
 * and `hi` are GoR at mu ∓ sigma.
 */
import { STRENGTHS, MEASURED, gorToTheta, implTheta, ladder, thetaToGoR } from "../opponents.js";
import { ratingToRank, rankToRating } from "./rating.js";

/*
 * v9: the θ ↔ GoR scale and the measured strengths live in opponents.js
 * (MEASURED: the calibrated levels; implTheta: what each rank plays), so
 * the opponent ladder and the rating read the same numbers.
 */
export { ANCHOR_K, MEASURED, gorToTheta, thetaToGoR } from "../opponents.js";

/* ------------------------------------------------------------- parameters */

/** Prior spread around the rank you gave (nats; ≈ 4–6 ranks). */
export const SIGMA0 = 2.5;
/** Uncertainty added before every game (nats), so the estimate keeps moving. */
export const SIGMA_GAME = 0.2;
/** Uncertainty added per day without games (nats per √day). */
export const SIGMA_DAY = 0.1;
/** Measurement error of a level's θ relative to its neighbours (nats). */
export const SIGMA_LEVEL = 0.5;
/** The estimate stays inside 30 kyu − 15 ranks … 9 dan. */
const MU_MIN = gorToTheta(-2400);
const MU_MAX = gorToTheta(2900);

const DAY = 86400000;

/* ----------------------------------------------- board sizes and handicap */

/**
 * Strength on a 9×9 or 13×13 board as a function of 19×19 strength: the
 * standard levels' measured (θ19, θ on that board) pairs, joined piecewise
 * linearly, extended beyond the ends with the overall slope. (v8: 13×13 is
 * measured; until v7 it was taken halfway between 9×9 and 19×19.)
 */
const PAIRS = STRENGTHS.map((s) => MEASURED.standard[s.id]).sort((a, b) => a[19] - b[19]);
/** Overall slope of θ on a board against θ on 19×19 (least squares through 0). */
const slopeOf = (size) => PAIRS.reduce((s, p) => s + p[19] * p[size], 0) / PAIRS.reduce((s, p) => s + p[19] * p[19], 0);
const SLOPE = { 9: slopeOf(9), 13: slopeOf(13) };

/** Piecewise-linear map between two boards' θ through the levels' pairs. */
function interp(x, from, to) {
  const n = PAIRS.length;
  const size = from === 19 ? to : from;
  const k = from === 19 ? SLOPE[size] : 1 / SLOPE[size];
  if (x <= PAIRS[0][from]) return PAIRS[0][to] + (x - PAIRS[0][from]) * k;
  if (x >= PAIRS[n - 1][from]) return PAIRS[n - 1][to] + (x - PAIRS[n - 1][from]) * k;
  for (let i = 1; i < n; i++) {
    const a = PAIRS[i - 1];
    const b = PAIRS[i];
    if (x <= b[from]) return a[to] + ((x - a[from]) / (b[from] - a[from] || 1)) * (b[to] - a[to]);
  }
  return PAIRS[n - 1][to];
}

/** 19×19 θ → θ on a board of `size` (that board's own scale). */
export function onBoard(t19, size) {
  return size === 9 || size === 13 ? interp(t19, 19, size) : t19;
}

/** θ on a board of `size` → the 19×19 θ of the same strength. */
export function fromBoard(t, size) {
  return size === 9 || size === 13 ? interp(t, size, 19) : t;
}

/** Ranks one handicap stone is worth (as engine.js suggestHandicap). */
const RANKS_PER_STONE = { 9: 5, 13: 2.5, 19: 1 };

/**
 * An opponent's strength on the board it was played on, in that board's
 * θ. `impl` is the implementation that played (opponents.js IMPLS; v9:
 * games store it with their rank). `handicap` stones were given to the
 * player (negative: the player gave them); as in v5, a handicap counts
 * from two stones, each worth RANKS_PER_STONE ranks of 100 GoR.
 */
export function levelTheta(impl, { size = 19, handicap = 0 } = {}) {
  const sz = [9, 13, 19].includes(size) ? size : 19;
  let t19 = implTheta(impl, 19);
  if (t19 == null) return null;
  // v8: 13×13 is measured too; each small board uses its own measurement.
  const tSmall = sz === 19 ? null : implTheta(impl, sz);
  if (sz !== 19 && Math.abs(handicap) < 2) return tSmall;
  // On a small board the stones are counted on the 19×19 scale the ranks live on.
  if (sz !== 19) t19 = fromBoard(tSmall, sz);
  if (Math.abs(handicap) >= 2) {
    const g = thetaToGoR(t19) - Math.sign(handicap) * Math.abs(handicap) * RANKS_PER_STONE[sz] * 100;
    t19 = gorToTheta(g);
  }
  return onBoard(t19, sz);
}

/* --------------------------------------------------------------- estimate */

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function point(mu, sigma, at) {
  return { at, r: Math.round(thetaToGoR(mu)), lo: Math.round(thetaToGoR(mu - sigma)), hi: Math.round(thetaToGoR(mu + sigma)) };
}

function pack(mu, sigma, games, at, history) {
  mu = Math.min(MU_MAX, Math.max(MU_MIN, mu));
  return { v: 6, mu: round(mu), sigma: round(sigma), games, at, r: Math.round(thetaToGoR(mu)), history: history.slice(-200) };
}

/** The prior: the rank you gave (30 kyu when you gave none), ± SIGMA0. */
export function startEstimate(playerRank, at = Date.now()) {
  const mu = gorToTheta(rankToRating(playerRank ?? 30));
  return pack(mu, SIGMA0, 0, at, [point(mu, SIGMA0, at)]);
}

/** sigma grown by time away (capped at the prior's). */
export function sigmaAt(est, at = Date.now()) {
  const days = Math.max(0, (at - (Number.isFinite(est.at) ? est.at : at)) / DAY);
  return Math.min(SIGMA0, Math.sqrt(est.sigma * est.sigma + SIGMA_DAY * SIGMA_DAY * days));
}

/** Expected score against an opponent of `opp` (board θ), on that board. */
export function expectedScore(mu, opp, size = 19) {
  const g = 1 / Math.sqrt(1 + (3 * SIGMA_LEVEL * SIGMA_LEVEL) / (Math.PI * Math.PI));
  return 1 / (1 + Math.exp(-g * (onBoard(mu, size) - opp)));
}

/**
 * One rated game. `opponent` is the opponent's θ on that board (levelTheta
 * gives it for a level, handicap included); `won` true or false.
 * Glicko-1 in natural units: the board's θ is a smooth function of 19×19
 * θ, linearised at mu (slope `s`), and the level's own measurement error
 * widens the logistic (g).
 */
export function updateEstimate(est, { opponent, size = 19, won, at = Date.now() }) {
  const prev = est && Number.isFinite(est.mu) ? est : startEstimate(30, at);
  const sigma0 = Math.min(SIGMA0, Math.sqrt(sigmaAt(prev, at) ** 2 + SIGMA_GAME * SIGMA_GAME));
  const mu = prev.mu;
  const h = 0.01;
  const s = (onBoard(mu + h, size) - onBoard(mu - h, size)) / (2 * h);
  const g = 1 / Math.sqrt(1 + (3 * SIGMA_LEVEL * SIGMA_LEVEL) / (Math.PI * Math.PI));
  const e = 1 / (1 + Math.exp(-g * (onBoard(mu, size) - opponent)));
  const info = s * s * g * g * e * (1 - e);
  const v = 1 / (1 / (sigma0 * sigma0) + info);
  const next = mu + v * s * g * ((won ? 1 : 0) - e);
  const sigma = Math.sqrt(v);
  return pack(next, sigma, (prev.games || 0) + 1, at, [...(prev.history || []), point(next, sigma, at)]);
}

/** A rated game against implementation `impl` (board size and handicap as played). */
export function rateGame(est, { impl, size = 19, handicap = 0, won, at = Date.now() }) {
  const sz = [9, 13, 19].includes(size) ? size : 19;
  return updateEstimate(est, { opponent: levelTheta(impl, { size: sz, handicap }), size: sz, won, at });
}

/* -------------------------------------------------------------- migration */

/** Typical information of one game (19×19, a fair opponent). */
const INFO_TYPICAL = 0.2;

/**
 * v2–v5 progress.rating ({ r, games, history: [{ at, r }] }, an Elo-style
 * number without an uncertainty) → the v6 estimate. The mean is the old
 * rating; the uncertainty is what `games` fair games would leave from the
 * prior, then widened by time since the last game. Old history points keep
 * their time and value and get the band of their game count. A v6
 * estimate passes through; anything unreadable becomes null.
 */
export function migrateEstimate(rating, now = Date.now()) {
  if (!rating || typeof rating !== "object") return null;
  if (rating.v === 6 && Number.isFinite(rating.mu) && Number.isFinite(rating.sigma)) return rating;
  if (!Number.isFinite(rating.r)) return null;
  const games = Math.max(0, Math.floor(rating.games || 0));
  const sigmaAfter = (n) => {
    // Posterior after n fair games, with the per-game spread: the fixed point
    // of 1/σ² = 1/(σ² + q²) + I bounds it from below.
    let v = SIGMA0 * SIGMA0;
    for (let i = 0; i < n && i < 400; i++) v = 1 / (1 / (v + SIGMA_GAME * SIGMA_GAME) + INFO_TYPICAL);
    return Math.sqrt(v);
  };
  const old = (Array.isArray(rating.history) ? rating.history : []).filter((h) => h && Number.isFinite(h.r));
  const history = old.map((h, i) => {
    const n = Math.max(0, games - (old.length - 1 - i));
    return { ...point(gorToTheta(h.r), sigmaAfter(n), Number(h.at) || 0), r: Math.round(h.r) };
  });
  const last = old.length ? Number(old[old.length - 1].at) || now : now;
  const mu = gorToTheta(rating.r);
  const est = pack(mu, sigmaAfter(games), games, last, history.length ? history : [point(mu, sigmaAfter(games), last)]);
  return est;
}

/* ---------------------------------------------------------------- reading */

/**
 * What the app shows now: the rank of the mean (rating.js encoding), the
 * half-width of the mean ± one sigma band in ranks (at least 1), and GoR
 * for both ends. `sigma` includes the time since the last game.
 */
export function estimateNow(est, now = Date.now()) {
  if (!est || !Number.isFinite(est.mu)) return null;
  const sigma = sigmaAt(est, now);
  const r = thetaToGoR(est.mu);
  const lo = thetaToGoR(est.mu - sigma);
  const hi = thetaToGoR(est.mu + sigma);
  const rank = ratingToRank(r);
  return { r: Math.round(r), lo: Math.round(lo), hi: Math.round(hi), rank, pm: Math.max(1, Math.round((hi - lo) / 200)), sigma, games: est.games || 0 };
}

/** The last `n` history points ({ at, r, lo, hi }), for the chart. */
export function strengthSeries(est, n = 30) {
  return (est?.history || []).filter((h) => Number.isFinite(h.r)).slice(-n).map((h) => ({ at: h.at, r: h.r, lo: h.lo ?? h.r, hi: h.hi ?? h.r }));
}

/**
 * The rank to suggest: the ladder entry (opponents.js, with what is
 * `installed`) you are expected to score closest to 50% against on
 * `size`, by what actually plays it.
 */
export function recommendStrength(est, { size = 19, installed = {} } = {}) {
  const mu = est && Number.isFinite(est.mu) ? est.mu : startEstimate(30).mu;
  let best = null;
  let gap = Infinity;
  for (const e of ladder(installed)) {
    const d = Math.abs(expectedScore(mu, levelTheta(e.impl, { size }), size) - 0.5);
    if (d < gap) {
      gap = d;
      best = e;
    }
  }
  return best.rank;
}
