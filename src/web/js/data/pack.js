/**
 * v13: an analysis as it is kept in a game's file (docs/storage.md).
 *
 * KataGo gives every position an ownership map (one number per point:
 * 361 on 19×19). Stored for every position that was about 0.5 MB a game;
 * the views read only a few of them once the analysis is done:
 *
 * - the explanation of a key mistake (app/explain.js) reads the maps of
 *   the positions before and after it;
 * - the phases (app/summary.js phaseBoundaries) read only how much of the
 *   board is settled, one number per position.
 *
 * So a stored analysis keeps, per position, that one number (`firm`, the
 * settled share) and keeps the map itself only around the biggest swings
 * of the score (where the key mistakes of both players are), as plain
 * arrays rounded to 0.001 so they come back from JSON with the same shape
 * (a typed array would come back as an object with numbered keys). The
 * review on screen keeps the full maps while it is open; the ownership
 * overlay of a stored game falls back to the board's influence there.
 * Packing is idempotent.
 */
import { settledShare } from "../app/summary.js";

/** Positions whose maps are kept: the two around each of this many biggest score swings. */
export const KEEP_SWINGS = 12;
/** A smaller change of the score is not a key moment. */
export const MIN_SWING = 1;

const isMap = (own) => !!own && typeof own === "object" && typeof own.length === "number" && own.length > 0;
const round3 = (v) => Math.round(v * 1000) / 1000;

/** The indices whose ownership maps a stored analysis keeps. */
export function keptIndices(points, keep = KEEP_SWINGS) {
  const swings = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]?.scoreLead;
    const b = points[i]?.scoreLead;
    // A key mistake loses at least two points (app/explain.js describeMistakes); noise keeps nothing.
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) >= MIN_SWING) swings.push({ i, d: Math.abs(b - a) });
  }
  swings.sort((x, y) => y.d - x.d || x.i - y.i);
  const out = new Set();
  for (const s of swings.slice(0, keep)) {
    out.add(s.i - 1);
    out.add(s.i);
  }
  return out;
}

/** A whole-game analysis (one point per position) → what its file keeps. */
export function packAnalysis(points, { keep = KEEP_SWINGS } = {}) {
  if (!Array.isArray(points)) return points;
  const kept = keptIndices(points, keep);
  return points.map((p, i) => {
    if (!p || typeof p !== "object") return p;
    const own = p.ownership;
    if (!isMap(own)) {
      if (own == null || Array.isArray(own)) return p;
      const { ownership, ...rest } = p;
      return rest;
    }
    const { ownership, ...rest } = p;
    const out = { ...rest, firm: round3(settledShare(own)) };
    if (kept.has(i)) out.ownership = Array.isArray(own) && own.every((v) => v === round3(v)) ? own : Array.from(own, round3);
    return out;
  });
}
