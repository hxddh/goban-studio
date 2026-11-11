/**
 * The measured ladder: how strong each computer level is, on each board
 * size and in each mode, and the scales the player's rating lives on.
 * Pure; knows nothing about the player (model/player.js does).
 *
 * Units: θ, Bradley–Terry strength in
 * natural-log units, one fit per board size with the weakest standard level
 * at 0; GoR on the EGF scale (1 dan = 2100, each kyu 100 below). The
 * calibration itself is documented in docs/strength.md.
 */

/* ---------------------------------------------------------------- ranks */

/** rank: kyu as positive (30…1), dan as 0, -1, -2 … for 1d, 2d, 3d. */
export function rankToRating(rank) {
  if (rank == null) return null;
  return rank > 0 ? 2100 - 100 * rank : 2100 + 100 * -rank;
}

/** The nearest rank (same encoding), so a rank's own rating maps back to it. */
export function ratingToRank(r) {
  const k = Math.round((2100 - r) / 100);
  return k >= 1 ? Math.min(30, k) : k || 0;
}

/** Display parts for a rank: { n, unit: "kyu" | "dan" }. */
export function rankParts(rank) {
  return rank > 0 ? { n: rank, unit: "kyu" } : { n: 1 - rank, unit: "dan" };
}

/* ------------------------------------------------------ the θ ↔ GoR scale */

/**
 * GoR(θ) = 4100 − K·e^(−θ/20): the EGF curve, anchored as the ladder is
 * (KataGo's human SL rank_10k profile at θ = 11.65 is 10 kyu, GoR 1100).
 */
// One source for the calibration (opponents.js): the measured levels,
// the θ ↔ GoR scale and its anchor.
import { ANCHOR_K, MEASURED, gorToTheta, implTheta, thetaToGoR } from "../opponents.js";
export { ANCHOR_K, MEASURED, gorToTheta, thetaToGoR };


/** The level ids, weakest first (the keys of the standard ladder). */
export const LEVELS = Object.keys(MEASURED.standard);
export const SIZES = [9, 13, 19];

export const isLevel = (id) => Object.prototype.hasOwnProperty.call(MEASURED.standard, id);
export const sizeOf = (size) => (SIZES.includes(Number(size)) ? Number(size) : 19);

/* ----------------------------------------------- board sizes and handicap */

/**
 * Strength on a 9×9 or 13×13 board as a function of 19×19 strength: the
 * standard levels' measured (θ19, θ on that board) pairs, joined piecewise
 * linearly, extended beyond the ends with the overall slope.
 */
const PAIRS = LEVELS.map((id) => MEASURED.standard[id]).sort((a, b) => a[19] - b[19]);
const slopeOf = (size) => PAIRS.reduce((s, p) => s + p[19] * p[size], 0) / PAIRS.reduce((s, p) => s + p[19] * p[19], 0);
const SLOPE = { 9: slopeOf(9), 13: slopeOf(13) };

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

/** Ranks one handicap stone is worth on each board. */
export const RANKS_PER_STONE = { 9: 5, 13: 2.5, 19: 1 };

/**
 * A level's strength on the board it was played on, in that board's θ.
 * `handicap` stones were given to the player (negative: the player gave
 * them); a handicap counts from two stones, each worth RANKS_PER_STONE
 * ranks of 100 GoR. Null for an unknown level.
 */
export function levelTheta(id, { mode = "standard", size = 19, handicap = 0 } = {}) {
  if (!isLevel(id)) return null;
  const sz = sizeOf(size);
  const m = MEASURED[mode]?.[id] || {};
  const base = MEASURED.standard[id];
  let t19 = m[19] ?? base[19];
  const tSmall = sz === 19 ? null : m[sz] ?? base[sz];
  if (sz !== 19 && Math.abs(handicap) < 2) return tSmall;
  if (sz !== 19) t19 = fromBoard(tSmall, sz);
  if (Math.abs(handicap) >= 2) {
    const g = thetaToGoR(t19) - Math.sign(handicap) * Math.abs(handicap) * RANKS_PER_STONE[sz] * 100;
    t19 = gorToTheta(g);
  }
  return onBoard(t19, sz);
}

/**
 * The measured rank a level plays at (rank encoding as above), on the
 * 19×19 scale the ranks live on: the label shown for that opponent.
 */
export function measuredRank(id, { mode = "standard", size = 19 } = {}) {
  const t = levelTheta(id, { mode, size });
  if (t == null) return null;
  return ratingToRank(thetaToGoR(fromBoard(t, sizeOf(size))));
}

/**
 * Every implementation on a board, weakest first: { level, mode, theta,
 * rank }. `modes` are the modes that can be played (a mode only lists the
 * levels it was measured for, except "standard", which has them all).
 */
export function ladder({ size = 19, modes = ["standard"] } = {}) {
  const sz = sizeOf(size);
  const out = [];
  for (const mode of modes) {
    for (const level of LEVELS) {
      if (mode !== "standard" && !MEASURED[mode]?.[level]) continue;
      out.push({ level, mode, theta: levelTheta(level, { mode, size: sz }), rank: measuredRank(level, { mode, size: sz }) });
    }
  }
  return out.sort((a, b) => a.theta - b.theta);
}

/**
 * The strength of an implementation of the opponent ladder (opponents.js
 * IMPLS, what a game stores as `impl`) on the board it was played on, in
 * that board's θ, with `handicap` stones given to the player (negative: the
 * player gave them), counted as levelTheta counts them. Null for an
 * unknown implementation. This is the `opponent` a rated game is recorded
 * against (player.js recordGame).
 */
export function implOpponent(impl, { size = 19, handicap = 0 } = {}) {
  const sz = sizeOf(size);
  let t19 = implTheta(impl, 19);
  if (t19 == null) return null;
  const tSmall = sz === 19 ? null : implTheta(impl, sz);
  if (sz !== 19 && Math.abs(handicap) < 2) return tSmall;
  if (sz !== 19) t19 = fromBoard(tSmall, sz);
  if (Math.abs(handicap) >= 2) {
    const g = thetaToGoR(t19) - Math.sign(handicap) * Math.abs(handicap) * RANKS_PER_STONE[sz] * 100;
    t19 = gorToTheta(g);
  }
  return onBoard(t19, sz);
}
