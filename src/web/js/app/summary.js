/**
 * v5 review: the whole game at a glance, and how your games are trending.
 *
 * summarizeGame(review) splits a reviewed game into opening, middle game and
 * endgame and says, per player and phase, how many points went where; then
 * picks three takeaways. gameRecord() turns a summary into the compact
 * record kept in the player model's games (model/player.js), and
 * trends(profile) reads the last games.
 *
 * Pure (no engine, no DOM, no app state). Text is returned as i18n keys with
 * params; a param may be a `{ key, params }` object to translate first, the
 * same convention as story.storyText(), which renders these entries.
 *
 * What the numbers can and cannot say:
 *   - A move's loss is the drop in the mover's score lead between the
 *     position before and after it (explain.lossesOf). With KataGo at the
 *     review's low visit counts this is noisy by about a point either way;
 *     negative "losses" (a move better than the engine's first guess) count
 *     as 0.
 *   - "Accuracy" is the share of a player's moves that stayed within one
 *     point of the best move. When the played move is one of KataGo's
 *     candidates in the position before, the gap is read off the candidate
 *     list (best candidate's lead minus the played candidate's lead, both
 *     from the same search); otherwise from the lead drop. It is only
 *     reported with KataGo; with the offline estimate it is null.
 *   - The offline estimate (engine.estimateNode) is a heuristic count of the
 *     board, not a search: losses from it are a rough indication, so the
 *     summary is marked confidence "low" and takeaways avoid fine claims.
 */
import { BLACK, WHITE, coordLabel, formatPoints } from "../rules.js";
import { lossesOf } from "./explain.js";
import { PHASES, THEME_TOPIC, normalizeGame, normalizeGames } from "../model/player.js";

export { PHASES };
/** A move losing more than this many points is a mistake… */
export const MISTAKE = 2;
/** …and more than this, a blunder (blunders are not counted as mistakes). */
export const BLUNDER = 6;
/** A move within this many points of the best counts as accurate. */
export const ACCURATE = 1;

/**
 * Move-number thresholds, scaled by board area (so 19×19: opening up to move
 * 43, endgame from move 162; 13×13: 20 / 76; 9×9: 10 / 36). On 19×19 the
 * opening (fuseki) is usually over after 40–50 moves and the large
 * boundaries are settled by move 150–180 of a 200–250 move game; the same
 * shares of the board's points give the smaller sizes.
 */
export function phaseThresholds(size) {
  const area = size * size;
  return { openingEnd: Math.max(4, Math.round(area * 0.12)), endgameStart: Math.max(8, Math.round(area * 0.45)) };
}

/**
 * Share of points KataGo considers decided (|ownership| ≥ FIRM). The
 * endgame starts when at least SETTLED of the board is decided and stays so
 * two positions later: what is left are boundaries, not whole areas.
 */
export const FIRM = 0.8;
export const SETTLED = 0.72;

export function settledShare(ownership) {
  if (!ownership?.length) return null;
  let firm = 0;
  for (const v of ownership) if (Math.abs(v) >= FIRM) firm++;
  return firm / ownership.length;
}

/**
 * A position's settled share: from its ownership, or from `firm`, which a
 * stored analysis keeps in place of the map (v13, data/pack.js).
 */
export function firmOf(point) {
  if (!point) return null;
  if (point.ownership?.length) return settledShare(point.ownership);
  return Number.isFinite(point.firm) ? point.firm : null;
}

/**
 * Phase boundaries for a main line of `n` positions (index 0 = start, so a
 * move's index is its move number). Returns
 *   { opening: [from, to], middle: [from, to], endgame: [from, to], method }
 * with inclusive move numbers; an empty phase has from > to. `method` is
 * "ownership" when KataGo's ownership placed the endgame, else "moves".
 */
export function phaseBoundaries(size, points, n) {
  const last = n - 1;
  const { openingEnd, endgameStart } = phaseThresholds(size);
  const oEnd = Math.min(openingEnd, last);
  let eStart = endgameStart;
  let method = "moves";
  const tail = [];
  for (let i = oEnd + 1; i <= last; i++) tail.push(i);
  const withOwn = tail.filter((i) => firmOf(points[i]) != null);
  if (tail.length && withOwn.length >= tail.length * 0.8) {
    method = "ownership";
    eStart = last + 1;
    for (const i of withOwn) {
      const here = firmOf(points[i]);
      const later = firmOf(points[Math.min(last, i + 2)]) ?? here;
      if (here >= SETTLED && later >= SETTLED) {
        eStart = i;
        break;
      }
    }
  }
  eStart = Math.max(oEnd + 1, eStart);
  return {
    opening: [1, oEnd],
    middle: [oEnd + 1, Math.min(last, eStart - 1)],
    endgame: [eStart, last],
    method,
  };
}

function phaseOf(bounds, index) {
  for (const p of PHASES) if (index >= bounds[p][0] && index <= bounds[p][1]) return p;
  return null;
}

/** Gap to the best move, from the candidate list when the move is in it. */
function gapOf(m, before) {
  const moves = before?.moves;
  if (moves?.length && !m.move.pass) {
    const best = moves[0];
    const played = moves.find((c) => !c.pass && c.x === m.move.x && c.y === m.move.y && (c.visits || 0) > 0 && Number.isFinite(c.scoreLead));
    if (played && Number.isFinite(best.scoreLead)) return { gap: Math.max(0, m.move.color * (best.scoreLead - played.scoreLead)), basis: "candidates" };
  }
  return { gap: Math.max(0, m.loss), basis: "lead-change" };
}

function emptyStats() {
  return { moves: 0, measured: 0, loss: 0, avgLoss: null, mistakes: 0, blunders: 0, worst: null, accurate: 0, accuracy: null, basis: { candidates: 0, "lead-change": 0 } };
}

function finish(st, accuracyOk) {
  st.loss = Math.round(st.loss * 10) / 10;
  st.avgLoss = st.measured ? Math.round((st.loss / st.measured) * 100) / 100 : null;
  st.accuracy = accuracyOk && st.measured ? Math.round((st.accurate / st.measured) * 1000) / 1000 : null;
  return st;
}

const KEY = { [BLACK]: "black", [WHITE]: "white" };
const COLOR_PARAM = { [BLACK]: { key: "common.black" }, [WHITE]: { key: "common.white" } };
const pts = (v) => formatPoints(Math.round(Math.max(0, v) * 2) / 2);

/**
 * Whole-game summary of a review: { game, points, meta: { humanColor },
 * keyMoves } (the shape of state.review; keyMoves are used for themes).
 * See the module comment and the README of the return value below.
 */
export function summarizeGame(review) {
  const game = review?.game;
  if (!game) return null;
  const points = review.points || [];
  const line = game.mainLine();
  const n = line.length;
  const size = game.size;
  const analysed = points.slice(0, n).filter(Boolean);
  const sources = new Set(analysed.map((p) => p.source));
  const source = sources.size === 0 ? null : sources.size > 1 ? "mixed" : [...sources][0];
  const coverage = n > 1 ? analysed.length / n : 0;
  const confidence = !analysed.length || n < 3 ? "none" : source === "katago" && coverage >= 0.9 ? "high" : "low";
  const accuracyOk = source === "katago";
  const bounds = phaseBoundaries(size, points, n);

  const phases = PHASES.map((id) => ({ id, from: bounds[id][0], to: bounds[id][1], players: { black: emptyStats(), white: emptyStats() } }));
  const byId = Object.fromEntries(phases.map((p) => [p.id, p]));
  const totals = { black: emptyStats(), white: emptyStats() };

  // Every move (not passes) counts towards "moves"; only moves with an
  // analysis on both sides are "measured".
  for (let i = 1; i < n; i++) {
    const mv = line[i].move;
    if (!mv || mv.pass) continue;
    const ph = phaseOf(bounds, i);
    const who = KEY[mv.color];
    if (!ph || !who) continue;
    byId[ph].players[who].moves++;
    totals[who].moves++;
  }
  for (const m of lossesOf(game, points)) {
    if (m.move.pass) continue;
    const ph = phaseOf(bounds, m.index);
    const who = KEY[m.move.color];
    if (!ph || !who) continue;
    const loss = Math.max(0, m.loss);
    const { gap, basis } = gapOf(m, points[m.index - 1]);
    for (const st of [byId[ph].players[who], totals[who]]) {
      st.measured++;
      st.loss += loss;
      if (loss > BLUNDER) st.blunders++;
      else if (loss > MISTAKE) st.mistakes++;
      if (gap <= ACCURATE) st.accurate++;
      st.basis[basis]++;
      if (loss > 0 && (!st.worst || loss > st.worst.loss)) {
        st.worst = { index: m.index, nodeId: m.node.id, move: { x: m.move.x, y: m.move.y, color: m.move.color }, coord: coordLabel(m.move.x, m.move.y, size), loss: Math.round(loss * 10) / 10 };
      }
    }
  }
  for (const p of phases) for (const who of ["black", "white"]) finish(p.players[who], accuracyOk);
  for (const who of ["black", "white"]) finish(totals[who], accuracyOk);

  // Themes of the explained key mistakes (explain.describeMistakes).
  const themes = {};
  for (const km of review.keyMoves || []) if (km.theme) themes[km.theme] = (themes[km.theme] || 0) + 1;

  const out = {
    v: 1,
    size,
    moves: n - 1,
    source,
    coverage: Math.round(coverage * 1000) / 1000,
    confidence,
    method: bounds.method,
    thresholds: phaseThresholds(size),
    phases,
    players: totals,
    themes,
    humanColor: review.meta?.humanColor ?? null,
    takeaways: [],
  };
  out.takeaways = takeaways(out, review.keyMoves || []);
  return out;
}

/**
 * Three takeaways, most useful first. Candidates are scored roughly in
 * points at stake; at most one per kind; with a low-confidence (offline)
 * summary only the coarse ones (where the points went, the costliest move)
 * are offered, and a "rough estimate" note is added. Each entry:
 *   { kind, key, params, tone: "good" | "bad" | "info", color, phase?, index? }
 */
export function takeaways(summary, keyMoves = [], max = 3) {
  if (!summary || summary.confidence === "none") return [];
  const low = summary.confidence === "low";
  const colors = summary.humanColor === BLACK || summary.humanColor === WHITE ? [summary.humanColor] : [BLACK, WHITE];
  const both = colors.length === 2;
  const cand = [];
  for (const color of colors) {
    const who = KEY[color];
    const tot = summary.players[who];
    const subject = COLOR_PARAM[color];
    const sfx = both ? "Of" : "";
    if (!tot.measured) continue;
    // Where the points went: the phase with the biggest loss, if it clearly dominates.
    const per = summary.phases.map((p) => ({ id: p.id, st: p.players[who] })).filter((p) => p.st.measured);
    const worstPhase = per.slice().sort((a, b) => b.st.loss - a.st.loss)[0];
    if (worstPhase && tot.loss >= 4 && worstPhase.st.loss >= tot.loss * 0.45) {
      cand.push({ kind: "phase", score: worstPhase.st.loss * 0.9, key: "gameSummary.take.worstPhase" + sfx, params: [{ key: "phaseIn." + worstPhase.id }, pts(worstPhase.st.loss), Math.round((worstPhase.st.loss / tot.loss) * 100), subject], tone: "bad", color, phase: worstPhase.id });
    }
    // The costliest single move.
    const worst = per.map((p) => p.st.worst).filter(Boolean).sort((a, b) => b.loss - a.loss)[0];
    if (worst && worst.loss > MISTAKE) {
      cand.push({ kind: "worst", score: worst.loss * (low ? 0.8 : 0.7), key: "gameSummary.take.worstMove" + sfx, params: [worst.index, worst.coord, pts(worst.loss), subject], tone: "bad", color, index: worst.index, phase: phaseOfIndex(summary, worst.index) });
    }
    if (!low) {
      if (tot.blunders >= 2) cand.push({ kind: "blunders", score: tot.blunders * 4, key: "gameSummary.take.blunders" + sfx, params: [tot.blunders, BLUNDER, subject], tone: "bad", color });
      // A theme that came up in the key mistakes.
      const th = {};
      for (const km of keyMoves) if (km.theme && km.move?.color === color) th[km.theme] = (th[km.theme] || 0) + 1;
      const theme = Object.entries(th).sort((a, b) => b[1] - a[1])[0];
      if (theme) {
        const topic = THEME_TOPIC[theme[0]] || null;
        cand.push({ kind: "theme", score: 3 + 2 * theme[1], key: "gameSummary.take.theme" + sfx, params: [{ key: "theme." + theme[0] }, theme[1], subject], tone: "info", color, theme: theme[0], topic });
      }
      // Something that went well: the steadiest phase with enough moves.
      const good = per.filter((p) => p.st.measured >= 5 && p.st.accuracy != null && p.st.accuracy >= 0.7 && p.st.blunders === 0).sort((a, b) => b.st.accuracy - a.st.accuracy)[0];
      if (good) cand.push({ kind: "steady", score: 3.5, key: "gameSummary.take.steady" + sfx, params: [{ key: "phaseIn." + good.id }, Math.round(good.st.accuracy * 100), subject], tone: "good", color, phase: good.id });
    }
    if (tot.mistakes + tot.blunders === 0 && tot.measured >= 5) {
      cand.push({ kind: "clean", score: 5, key: "gameSummary.take.clean" + sfx, params: [MISTAKE, subject], tone: "good", color });
    }
  }
  const seen = new Set();
  const out = [];
  for (const c of cand.sort((a, b) => b.score - a.score)) {
    if (seen.has(c.kind)) continue;
    seen.add(c.kind);
    const entry = { ...c };
    delete entry.score;
    out.push(entry);
    if (out.length >= max - (low ? 1 : 0)) break;
  }
  if (low) out.push({ kind: "estimate", key: "gameSummary.estimate", params: [], tone: "info", color: null });
  return out;
}

function phaseOfIndex(summary, index) {
  return summary.phases.find((p) => index >= p.from && index <= p.to)?.id || null;
}

/* --------------------------------------------------------- trends */

const recordPhases = (summary, who) => {
  if (!summary || summary.confidence === "none" || !who) return null;
  const out = {};
  for (const p of summary.phases) {
    const st = p.players[who];
    out[p.id] = { loss: st.loss, mistakes: st.mistakes, blunders: st.blunders, moves: st.measured, accuracy: st.accuracy };
  }
  return out;
};

/**
 * The compact record of one rated game against the computer, as stored in
 * the player model's games (model/player.js normalizeGame documents the shape).
 * `summary` (summarizeGame) and `themes` (theme → count, see themeCounts)
 * may be missing: play-ctl writes the record when the game ends and merges
 * recordAnalysis() into it when the post-game analysis is done.
 */
export function gameRecord({ id, game, color, opponent = null, won = null, rating = null, summary = null, themes = null, at = Date.now() }) {
  const line = game.mainLine();
  const phases = recordPhases(summary, KEY[color]);
  return normalizeGame({
    id: String(id || at),
    at,
    size: game.size,
    rules: game.rules || null,
    komi: game.komi,
    handicap: game.handicap || 0,
    color,
    opponent,
    result: line[line.length - 1]?.result || game.current.result || null,
    won,
    moves: line.length - 1,
    confidence: phases ? summary.confidence : null,
    phases,
    themes: themes || {},
    rating,
  });
}

/** The analysis part of a record, to merge into it with player.recordGame. */
export function recordAnalysis(summary, color, themes = null) {
  const phases = recordPhases(summary, KEY[color]);
  const out = {};
  if (phases) {
    out.phases = phases;
    out.confidence = summary.confidence;
  }
  if (themes) out.themes = { ...themes };
  return out;
}

const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 100) / 100 : null);

/**
 * Direction of a "lower is better" per-game rate between the earlier and the
 * recent half of the window. Needs at least two games on each side; a
 * change smaller than `tol` (absolute) or 15% (relative) is "same".
 */
function direction(earlier, recent, tol) {
  if (earlier.length < 2 || recent.length < 2) return null;
  const a = avg(earlier);
  const b = avg(recent);
  const diff = b - a;
  if (Math.abs(diff) < tol || Math.abs(diff) < Math.abs(a) * 0.15) return "same";
  return diff < 0 ? "better" : "worse";
}

/**
 * Aggregates over the last `n` records (profile.games, newest first):
 *   { games, analysed, highConfidence, window, record: { won, lost, other },
 *     avgLoss: { opening, middle, endgame, total } (points per game),
 *     avgMistakes, avgBlunders (per game),
 *     phaseTrend: { opening: { earlier, recent, direction } … },
 *     themes: [{ theme, count, perGame, earlier, recent, direction, topic }],
 *     rating: { from, to, delta, games } | null }
 * Only analysed games (records with phases) count towards the loss and
 * mistake numbers. "earlier" / "recent" are the older and newer halves of
 * the analysed games in the window; direction is "better" | "worse" |
 * "same" | null (too few games).
 */
export function trends(profile, { n = 10, highOnly = false } = {}) {
  const all = normalizeGames(profile?.games);
  const win = all.slice(0, n);
  const analysed = win.filter((g) => g.phases && (!highOnly || g.confidence === "high"));
  const half = Math.ceil(analysed.length / 2);
  // Newest first: the recent half is the front.
  const recentSet = analysed.slice(0, half);
  const earlierSet = analysed.slice(half);
  const total = (g) => PHASES.reduce((s, p) => s + g.phases[p].loss, 0);
  const avgLoss = { total: avg(analysed.map(total)) };
  const phaseTrend = {};
  for (const p of PHASES) {
    avgLoss[p] = avg(analysed.map((g) => g.phases[p].loss));
    const e = earlierSet.map((g) => g.phases[p].loss);
    const r = recentSet.map((g) => g.phases[p].loss);
    phaseTrend[p] = { earlier: avg(e), recent: avg(r), direction: direction(e, r, 1) };
  }
  const te = earlierSet.map(total);
  const tr = recentSet.map(total);
  phaseTrend.total = { earlier: avg(te), recent: avg(tr), direction: direction(te, tr, 2) };
  const count = (g, k) => PHASES.reduce((s, p) => s + g.phases[p][k], 0);

  const themeCounts = {};
  for (const g of analysed) for (const [k, v] of Object.entries(g.themes)) themeCounts[k] = (themeCounts[k] || 0) + v;
  const themes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([theme, c]) => {
      const e = earlierSet.map((g) => g.themes[theme] || 0);
      const r = recentSet.map((g) => g.themes[theme] || 0);
      return { theme, count: c, perGame: Math.round((c / analysed.length) * 100) / 100, earlier: avg(e), recent: avg(r), direction: direction(e, r, 0.25), topic: THEME_TOPIC[theme] || null };
    });

  // Rating: from the oldest record's "before" to the newest "after".
  const rated = win.filter((g) => g.rating);
  let rating = null;
  if (rated.length) {
    const oldest = rated[rated.length - 1];
    const newest = rated[0];
    const from = oldest.rating.before ?? oldest.rating.after - oldest.rating.delta;
    rating = { from, to: newest.rating.after, delta: newest.rating.after - from, games: rated.length };
  }

  return {
    games: win.length,
    analysed: analysed.length,
    highConfidence: analysed.filter((g) => g.confidence === "high").length,
    window: n,
    record: { won: win.filter((g) => g.won === true).length, lost: win.filter((g) => g.won === false).length, other: win.filter((g) => g.won == null).length },
    avgLoss,
    avgMistakes: avg(analysed.map((g) => count(g, "mistakes"))),
    avgBlunders: avg(analysed.map((g) => count(g, "blunders"))),
    phaseTrend,
    themes,
    rating,
  };
}

/** Theme counts of explained mistakes (describeMistakes().top) of one colour. */
export function themeCounts(mistakes, color) {
  const out = {};
  for (const m of mistakes || []) if (m.theme && (color == null || m.move?.color === color)) out[m.theme] = (out[m.theme] || 0) + 1;
  return out;
}
