/**
 * Whole-game review.
 *
 * The built-in evaluator is the same heuristic the opponent uses: stones,
 * liberties, captures and a territory estimate. That is enough to draw a
 * useful shape and point at the moves that changed it; it is not KataGo, and
 * the UI says so by calling it an estimate rather than a win rate.
 */
import { BLACK, WHITE, influenceMap } from "./rules.js";
import { evaluate } from "./ai.js";

export function winrate(evalScore) {
  return 1 / (1 + Math.exp(-evalScore / 16));
}

export function gradeForLoss(loss) {
  if (loss >= 18) return "blunder";
  if (loss >= 8) return "mistake";
  if (loss >= 3) return "inaccuracy";
  return "good";
}

/**
 * @param {import("./rules.js").Game} game
 */
export function analyze(game) {
  const line = game.mainLine();
  const points = [];
  let prev = null;
  for (let i = 0; i < line.length; i++) {
    const node = line[i];
    const evalBlack = evaluate(node.board, BLACK, game.size);
    let loss = 0;
    let grade = "good";
    if (node.move && prev !== null) {
      const delta = node.move.color === BLACK ? evalBlack - prev : prev - evalBlack;
      loss = Math.max(0, -delta);
      grade = gradeForLoss(loss);
    }
    points.push({
      id: node.id,
      moveNumber: i,
      color: node.move?.color || null,
      move: node.move,
      eval: evalBlack,
      winrate: winrate(evalBlack),
      loss,
      grade,
    });
    prev = evalBlack;
  }
  const keyMoves = points
    .filter((p) => p.move && p.loss >= 3)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 6);
  const counts = { good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const p of points) if (p.move) counts[p.grade] = (counts[p.grade] || 0) + 1;
  return {
    points,
    keyMoves,
    counts,
    result: game.current.result || null,
    moves: Math.max(0, line.length - 1),
  };
}

export function ownership(node) {
  return influenceMap(node.board);
}

export function evalLabel(grade, t) {
  return t("review." + grade);
}

export { BLACK, WHITE };
