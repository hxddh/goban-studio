/**
 * v6 report: one page for a finished game.
 *
 * buildReport() turns a game and its whole-game analysis into the compact
 * report model the report page draws and the library record keeps
 * (rec.report), so that reopening a report needs no analysis. It reuses
 * summary.js (summarizeGame, takeaways) for the phases and explain.js
 * (describeMistakes) for the key moments.
 *
 * Pure (no engine, no DOM, no app state), tested in Node.
 *
 * Model (v: 1):
 *   { v, lineKey, at, size, rules, komi, handicap, moves, result,
 *     humanColor: 1 | -1 | null, won: true | false | null,
 *     confidence: "high" | "low" | "none", source,
 *     players: ["black"] | ["white"] | ["black", "white"],
 *     phases: [{ id, from, to, players: { black, white } }] | null,
 *     totals: { black, white } | null,       per player { loss, mistakes, blunders, accuracy, measured }
 *     takeaways: [{ kind, key, params, tone, index? }],
 *     moments: [{ index, color, played, best, loss, theme, why, thumb, accept }] }
 *
 * Honesty rules:
 *   - With the low-confidence offline estimate (confidence "low") the
 *     per-phase numbers, the takeaways and the size of each loss are left
 *     out: the estimate can only point at the turning points (see
 *     turningPoints), which keep their position and the move played,
 *     without a "better move".
 *   - Only "high" reports can be practised: a drill needs KataGo's better
 *     move and the moves it would accept.
 */
import { BLACK, WHITE } from "../rules.js";
import { describeMistakes } from "./explain.js";
import { MISTAKE, summarizeGame } from "./summary.js";

export const REPORT_VERSION = 1;
/** At most this many key moments, and this many drills from one game. */
export const MOMENTS = 3;
export const MAX_DRILLS = 3;

const KEY = { [BLACK]: "black", [WHITE]: "white" };
const r1 = (v) => Math.round(Math.max(0, v) * 10) / 10;

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

/** A position as one character per point (b, w or .), like library thumbnails. */
export function thumbOf(signMap) {
  return signMap.map((row) => row.map((v) => (v > 0 ? "b" : v < 0 ? "w" : ".")).join("")).join("");
}

function wonBy(result, humanColor) {
  if (!result || humanColor == null || /^draw$/i.test(result) || result === "0") return null;
  if (result[0] !== "B" && result[0] !== "W") return null;
  return (result[0] === "B") === (humanColor === BLACK);
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

const pick = (st) => ({ loss: st.loss, mistakes: st.mistakes, blunders: st.blunders, accuracy: st.accuracy, measured: st.measured });

/**
 * The report of a game. `points` is the whole-game analysis aligned with
 * game.mainLine() (null entries allowed); `refined` the optional deeper
 * analyses after the key mistakes (review.refined).
 */
export function buildReport({ game, points, humanColor = null, refined = null, at = Date.now() }) {
  const color = humanColor === BLACK || humanColor === WHITE ? humanColor : null;
  const pts = points || [];
  const keyMoves = describeMistakes(game, pts, color, MOMENTS, refined).top;
  const summary = summarizeGame({ game, points: pts, meta: { humanColor: color }, keyMoves });
  const line = game.mainLine();
  const result = line[line.length - 1]?.result || game.current.result || null;
  const confidence = summary?.confidence || "none";
  const high = confidence === "high";
  const players = color ? [KEY[color]] : ["black", "white"];
  // With the estimate, the turning points instead of the key mistakes.
  const picked = high ? keyMoves : confidence === "low" ? turningPoints(game, pts, color) : [];
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
    v: REPORT_VERSION,
    lineKey: lineKey(game),
    at,
    size: game.size,
    rules: game.rules || null,
    komi: game.komi,
    handicap: game.handicap || 0,
    moves: line.length - 1,
    result,
    humanColor: color,
    won: wonBy(result, color),
    confidence,
    source: summary?.source || null,
    players,
    phases: high
      ? summary.phases.filter((p) => p.from <= p.to).map((p) => ({ id: p.id, from: p.from, to: p.to, players: { black: pick(p.players.black), white: pick(p.players.white) } }))
      : null,
    totals: high ? { black: pick(summary.players.black), white: pick(summary.players.white) } : null,
    takeaways: high ? summary.takeaways.filter((tk) => tk.kind !== "estimate").map(({ kind, key, params, tone, index }) => ({ kind, key, params, tone, ...(index != null ? { index } : {}) })) : [],
    moments,
  };
}

/** A stored report that still describes this game (same version and moves). */
export function reportFits(report, game) {
  return !!report && report.v === REPORT_VERSION && report.lineKey === lineKey(game);
}

/** The moments worth practising: the costliest 1–3 with a better move, worst first. */
export function drillMoments(report, max = MAX_DRILLS) {
  if (!report || report.confidence !== "high") return [];
  return report.moments
    .filter((m) => m.best && m.loss > MISTAKE)
    .slice()
    .sort((a, b) => b.loss - a.loss || a.index - b.index)
    .slice(0, max);
}

/**
 * The mistake drills (persist.addMistake entries) for a report, split into
 * the ones to add and the ids of the ones already there. A drill is the
 * same when it has the same id (`gameKey-index`, as play-ctl and review-ctl
 * build it) or the same position (same SGF and move index) under another
 * key, so a game drilled from the review is not added twice.
 */
export function reportDrills(report, { sgf, gameKey, existing = [] }) {
  const add = [];
  const have = [];
  for (const mo of drillMoments(report)) {
    const id = `${gameKey}-${mo.index}`;
    const same = existing.find((m) => m.id === id || (m.index === mo.index && m.sgf === sgf));
    if (same) {
      have.push(same.id);
      continue;
    }
    add.push({
      id,
      gameKey,
      index: mo.index,
      sgf,
      color: mo.color,
      played: { ...mo.played },
      best: { ...mo.best },
      accept: mo.accept.length ? mo.accept.map((p) => ({ ...p })) : [{ ...mo.best }],
      loss: mo.loss,
      theme: mo.theme,
      size: report.size,
    });
  }
  return { add, have };
}
