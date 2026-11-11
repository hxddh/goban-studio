/**
 * The post-game review's model (docs/v9.md, "Two spaces → Play"): one
 * analysis per game, one model of what it says.
 *
 * buildReview() turns a game and its whole-game analysis (one point per
 * main-line position) into the compact model the review panel draws, the
 * export image paints and the game's file keeps (`review`, next to its
 * `analysis`), so that reopening a game needs no analysis. It reads
 * summary.js (summarizeGame: the three phases and the takeaways) and
 * explain.js (describeMistakes: the key moments, with their stories).
 *
 * Pure (no engine, no DOM, no app state), tested in Node.
 *
 * Model (v: 2):
 *   { v, lineKey, at, size, rules, komi, handicap, moves, result,
 *     humanColor: 1 | -1 | null, won: true | false | null,
 *     confidence: "high" | "low" | "none", source,
 *     players: ["black"] | ["white"] | ["black", "white"],
 *     phases: [{ id, from, to, players: { black, white } }] | null,
 *     totals: { black, white } | null,     per player { loss, mistakes, blunders, accuracy, measured }
 *     takeaways: [{ kind, key, params, tone, index?, theme?, topic? }],
 *     moments: [{ index, color, played, best, loss, theme, why, thumb, accept }] }
 *
 * Honesty rules:
 *   - With the low-confidence offline estimate the per-phase numbers, the
 *     takeaways and the size of each loss are left out: the estimate can
 *     only point at the turning points (turningPoints), which keep their
 *     position and the move played, without a "better move".
 *   - Only a KataGo-analysed game can be tried again: judging a move needs
 *     KataGo's better move and a search of the position after it.
 */
import { BLACK, WHITE } from "../rules.js";
import { describeMistakes } from "../app/explain.js";
import { MISTAKE, summarizeGame } from "../app/summary.js";

export { MISTAKE };
export const REVIEW_VERSION = 2;
/** At most this many key moments, and this many of them to try again. */
export const MOMENTS = 3;
export const MAX_TRIES = 3;

const KEY = { [BLACK]: "black", [WHITE]: "white" };
const r1 = (v) => Math.round(Math.max(0, v) * 10) / 10;
const colorOf = (c) => (c === BLACK || c === WHITE ? c : null);

/** A short fingerprint of the main line (size + every move), to notice edits. */
export function lineKey(game) {
  const line = game.mainLine();
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(String(game.size) + ":");
  for (let i = 1; i < line.length; i++) {
    const m = line[i].move;
    feed(!m ? "-" : m.pass ? (m.color > 0 ? "B" : "W") + "p;" : (m.color > 0 ? "B" : "W") + m.x + "," + m.y + ";");
  }
  return line.length - 1 + "-" + h.toString(36);
}

/** A position as one character per point (b, w or .), like the history's thumbnails. */
export function thumbOf(signMap) {
  return signMap.map((row) => row.map((v) => (v > 0 ? "b" : v < 0 ? "w" : ".")).join("")).join("");
}

function wonBy(result, humanColor) {
  if (!result || humanColor == null || /^draw$/i.test(result) || result === "0") return null;
  if (result[0] !== "B" && result[0] !== "W") return null;
  return (result[0] === "B") === (humanColor === BLACK);
}

/** The game's result (null while unfinished). */
export function resultOf(game) {
  const line = game.mainLine();
  return line[line.length - 1]?.result || game.current.result || null;
}

/**
 * Turning points for the offline estimate. The estimate counts the board
 * after each move, so it credits whoever just moved with about a point of
 * tempo, and a single move's "loss" is almost never visible. Over a move
 * and its reply that bias cancels: a turning point is a move after which
 * the mover's estimated lead, one reply later, is at least MISTAKE lower
 * than before it. Returns the largest `n`, in game order:
 * [{ index, move, swing, before }].
 */
export function turningPoints(game, points, color = null, n = MOMENTS) {
  const line = game.mainLine();
  const lead = (i) => points[Math.min(i, line.length - 1)]?.scoreLead;
  const out = [];
  for (let i = 1; i < line.length; i++) {
    const mv = line[i].move;
    if (!mv || mv.pass || (color != null && mv.color !== color)) continue;
    const a = lead(i - 1);
    const b = lead(i + 1);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const swing = mv.color === BLACK ? a - b : b - a;
    if (swing >= MISTAKE) out.push({ index: i, move: mv, swing, before: line[i - 1] });
  }
  return out
    .sort((x, y) => y.swing - x.swing)
    .slice(0, n)
    .sort((x, y) => x.index - y.index);
}

/** The key mistakes of a game, explained (explain.js), with refined analyses where there are any. */
export function keyMovesOf(game, points, humanColor = null, refined = null) {
  return describeMistakes(game, points || [], colorOf(humanColor), MOMENTS, refined).top;
}

const pick = (st) => ({ loss: st.loss, mistakes: st.mistakes, blunders: st.blunders, accuracy: st.accuracy, measured: st.measured });

/**
 * The review of a game. `points` is the whole-game analysis aligned with
 * game.mainLine() (null entries allowed); `refined` the optional deeper
 * analyses after the key mistakes; `keyMoves` the key mistakes when the
 * caller already has them (keyMovesOf).
 */
export function buildReview({ game, points, humanColor = null, refined = null, keyMoves = null, at = Date.now() }) {
  const color = colorOf(humanColor);
  const pts = points || [];
  const kms = keyMoves || keyMovesOf(game, pts, color, refined);
  const summary = summarizeGame({ game, points: pts, meta: { humanColor: color }, keyMoves: kms });
  const result = resultOf(game);
  const confidence = summary?.confidence || "none";
  const high = confidence === "high";
  // With the estimate, the turning points instead of the key mistakes.
  const picked = high ? kms : confidence === "low" ? turningPoints(game, pts, color) : [];
  const moments = picked.map((km) => ({
    index: km.index,
    color: km.move.color,
    played: { x: km.move.x, y: km.move.y },
    best: high && km.best && !km.best.pass ? { x: km.best.x, y: km.best.y } : null,
    loss: high ? r1(km.loss) : null,
    theme: high ? km.theme || null : null,
    // The one-line reason, unless it would only repeat the loss.
    why: high && km.story?.summary && km.story.summary.key !== "story.sum.loss" ? km.story.summary : null,
    thumb: thumbOf(km.before.board.signMap),
    accept: high ? (km.accept || []).map((p) => ({ x: p.x, y: p.y })) : [],
  }));
  return {
    v: REVIEW_VERSION,
    lineKey: lineKey(game),
    at,
    size: game.size,
    rules: game.rules || null,
    komi: game.komi,
    handicap: game.handicap || 0,
    moves: game.mainLine().length - 1,
    result,
    humanColor: color,
    won: wonBy(result, color),
    confidence,
    source: summary?.source || null,
    players: color ? [KEY[color]] : ["black", "white"],
    phases: high
      ? summary.phases.filter((p) => p.from <= p.to).map((p) => ({ id: p.id, from: p.from, to: p.to, players: { black: pick(p.players.black), white: pick(p.players.white) } }))
      : null,
    totals: high ? { black: pick(summary.players.black), white: pick(summary.players.white) } : null,
    takeaways: high ? summary.takeaways.filter((tk) => tk.kind !== "estimate").map(({ kind, key, params, tone, index, theme, topic }) => ({ kind, key, params, tone, ...(index != null ? { index } : {}), ...(theme ? { theme } : {}), ...(topic ? { topic } : {}) })) : [],
    moments,
  };
}

/**
 * A stored review that still describes this game: same version, same
 * moves and the same result (a game resigned after its review was made has
 * a new result but the same moves).
 */
export function reviewFits(model, game) {
  return !!model && model.v === REVIEW_VERSION && model.lineKey === lineKey(game) && (model.result || null) === resultOf(game);
}

/** A stored analysis that is of these very moves: one point per position, all there. */
export function analysisFits(points, game) {
  return Array.isArray(points) && points.length === game.mainLine().length && points.every((p) => p && Number.isFinite(p.scoreLead));
}

/**
 * The moments that can be tried again: KataGo's model only, with a better
 * move, costing more than MISTAKE; at most MAX_TRIES, in game order.
 */
export function tryMoments(model, max = MAX_TRIES) {
  if (!model || model.confidence !== "high") return [];
  const worst = model.moments.filter((m) => m.best && m.loss > MISTAKE).sort((a, b) => b.loss - a.loss || a.index - b.index);
  return worst.slice(0, max).sort((a, b) => a.index - b.index);
}

/**
 * The mistake drill (model/player.js addMistake) for a moment of the game
 * `gameId`: id `${gameId}-${index}`, the position before the move (`sgf`,
 * `index`), what was played and what KataGo preferred.
 */
export function drillOf(mo, { sgf, gameId, size }) {
  return {
    id: `${gameId}-${mo.index}`,
    gameId,
    index: mo.index,
    sgf,
    color: mo.color,
    played: { ...mo.played },
    best: { ...mo.best },
    accept: mo.accept?.length ? mo.accept.map((p) => ({ ...p })) : [{ ...mo.best }],
    loss: mo.loss,
    theme: mo.theme || null,
    size,
  };
}

/**
 * Judge a move tried again from the position before a moment. `before` is
 * KataGo's analysis of that position (its candidates, Black's score lead),
 * `after` its analysis of the position after the tried move (null when the
 * move is one of the searched candidates or accepted already). The loss is
 * from the mover's side, against the best candidate; within MISTAKE is
 * good. Returns { good, loss } or null when nothing can be said.
 */
export function judgeTry({ tried, color, before, after = null, accept = [] }) {
  const cands = (before?.moves || []).filter((c) => !c.pass && Number.isFinite(c.scoreLead));
  const best = cands[0];
  const bestLead = Number.isFinite(best?.scoreLead) ? best.scoreLead : before?.scoreLead;
  if (accept.some((p) => p.x === tried.x && p.y === tried.y)) return { good: true, loss: 0 };
  let lead = null;
  const same = cands.find((c) => c.x === tried.x && c.y === tried.y && (c.visits || 0) > 0);
  if (same) lead = same.scoreLead;
  else if (after && Number.isFinite(after.scoreLead)) lead = after.scoreLead;
  if (!Number.isFinite(lead) || !Number.isFinite(bestLead)) return null;
  const loss = Math.max(0, color * (bestLead - lead));
  return { good: loss <= MISTAKE, loss: Math.round(loss * 2) / 2 };
}
