/**
 * Review: the key mistakes of a game, explained.
 *
 * For each costly move: where the points went (attributeLoss, from KataGo's
 * ownership), which pattern it looks like (classifyMistake, read off the
 * punishing line), and two short stories (story.js): the better line and the
 * line as played, each a list of steps the board can play through.
 *
 * Pure (no engine, no DOM, no app state): review-ctl feeds it the whole-game
 * analysis and, for the top mistakes, at most one deeper analysis of the
 * position after the mistake (`refined`).
 */
import { BLACK, formatPoints } from "../rules.js";
import { areaName, attributeLoss, classifyMistake, lossSource } from "./insight.js";
import { narrate, simulate } from "./story.js";

/** Score lost by each main-line move, from the mover's point of view. */
export function lossesOf(game, points) {
  const line = game.mainLine();
  const out = [];
  for (let i = 1; i < line.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const move = line[i].move;
    if (!a || !b || !move) continue;
    const delta = b.scoreLead - a.scoreLead;
    const loss = move.color === BLACK ? -delta : delta;
    out.push({ index: i, node: line[i], move, loss, best: a.best, pv: a.pv, before: line[i - 1] });
  }
  return out;
}

const half = (v) => formatPoints(Math.round(Math.max(0, v) * 2) / 2);

/** The one-line verdict for a mistake: { key, params } (see storyText). */
export function summaryOf(attribution, best, size) {
  const pts = half(attribution.points);
  const main = attribution.regions[0];
  const area = main ? { key: "area." + main.area } : null;
  switch (attribution.kind) {
    case "group-died":
      return { key: "story.sum.groupDied", params: [area, main.lost.length, pts] };
    case "semeai":
      return { key: "story.sum.semeai", params: [area, pts] };
    case "ko":
      return { key: "story.sum.ko", params: [area, pts] };
    case "group-lived":
      return { key: "story.sum.groupLived", params: [area, main.lived.length, pts] };
    case "territory":
      return { key: "story.sum.territory", params: [area, pts] };
    case "tempo":
      if (attribution.slow) return { key: "story.sum.slow", params: [pts] };
      if (best && !best.pass) return { key: "story.sum.bigPoint", params: [{ key: "area." + areaName(best.x, best.y, size) }, pts] };
      return { key: "story.sum.loss", params: [pts] };
    default:
      return { key: "story.sum.loss", params: [pts] };
  }
}

/**
 * Explain one loss entry (from lossesOf).
 *   a, b      whole-game analysis before and after the move
 *   refined   optional deeper analysis of the position after the move
 *   line      the game's main line (for the as-played fallback)
 */
export function explainMistake(m, a, b, { refined = null, line = null, size } = {}) {
  const signMap = m.before.board.signMap;
  const signMapAfter = m.node.board.signMap;
  const mover = m.move.color;
  const after = refined || b;
  // The line that punishes the mistake: the engine's best reply after it.
  const punish = after?.pv || [];
  const facts = simulate(signMapAfter, -mover, punish.slice(0, 10), { ownership: after?.ownership || null });
  const source = lossSource(signMap, a?.ownership, after?.ownership, mover);
  const attribution = attributeLoss({
    signMapBefore: signMap,
    ownBefore: a?.ownership,
    ownAfter: after?.ownership,
    mover,
    move: m.move,
    best: m.best,
    loss: m.loss,
    refutation: facts,
  });
  const theme = classifyMistake({
    signMapBefore: signMap,
    signMapAfter,
    move: m.move,
    pv: punish,
    source,
    mover,
    attribution: a?.ownership && after?.ownership ? attribution : null,
    facts: a?.ownership && after?.ownership ? facts : null,
  });

  // Better: the engine's line from the position the mover faced.
  let betterMoves = (m.pv || []).slice(0, 10);
  if (!betterMoves.length && m.best && !m.best.pass) betterMoves = [m.best];
  const better = narrate(simulate(signMap, mover, betterMoves, { ownership: a?.ownership || null }));
  // As played: the mistake, then the engine's refutation; without one, the
  // game's own continuation.
  let playedMoves;
  let playedFrom;
  if (punish.length) {
    playedMoves = [{ x: m.move.x, y: m.move.y }, ...punish.slice(0, 9)];
    playedFrom = "engine";
  } else {
    const cont = (line || []).slice(m.index, m.index + 6).map((n) => n.move).filter(Boolean);
    playedMoves = cont.length ? cont : [m.move];
    playedFrom = "game";
  }
  const played = narrate(simulate(signMap, mover, playedMoves, { ownership: a?.ownership || null }));
  const story = { better, played, playedFrom, summary: summaryOf(attribution, m.best, size || signMap.length) };
  return { source, attribution, theme, story, refined: !!refined };
}

/**
 * The costliest moves (of `color`, or of both), explained: where the loss
 * came from, which pattern it looks like, which moves would have been fine
 * (to grade a drill later), and the story of both lines.
 *
 * `refined` maps a main-line index to a deeper analysis of the position
 * after that move (review-ctl fills it for the top three mistakes).
 */
export function describeMistakes(game, points, color = null, n = 3, refined = null) {
  const all = lossesOf(game, points);
  const line = game.mainLine();
  const top = all
    .filter((m) => m.loss >= 2 && !m.move.pass && (color == null || m.move.color === color))
    .sort((a, b) => b.loss - a.loss)
    .slice(0, n)
    .sort((a, b) => a.index - b.index)
    .map((m) => {
      const a = points[m.index - 1];
      const b = points[m.index];
      const ex = explainMistake(m, a, b, { refined: refined?.[m.index] || null, line, size: game.size });
      const bestLead = a?.moves?.[0]?.scoreLead;
      const accept = (a?.moves || [])
        .filter((c) => !c.pass && (c.visits || 0) > 0 && Number.isFinite(c.scoreLead) && m.move.color * (bestLead - c.scoreLead) <= 1.5)
        .map((c) => ({ x: c.x, y: c.y }));
      return { ...m, ...ex, accept: accept.length ? accept : m.best && !m.best.pass ? [{ x: m.best.x, y: m.best.y }] : [] };
    });
  return { all, top };
}
