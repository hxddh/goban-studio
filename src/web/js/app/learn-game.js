/**
 * What a finished game against the computer teaches (out of
 * play-ctl.js, so the background analysis, play/analysis.js, reaches it
 * without importing the play controller).
 */
import * as Games from "../data/games.js";
import { addMistake, recordGame } from "../model/record.js";
import { themeLosses } from "../model/focus.js";
import { changeProfile } from "./ctl-core.js";
import { describeMistakes } from "./explain.js";
import { recordAnalysis, summarizeGame, themeCounts } from "./summary.js";

/**
 * What a game against the computer teaches, from its whole-game analysis:
 * the game's record in the player model (per-phase losses, themes and what
 * each cost, model/player.js recordGame), and the two costliest mistakes
 * as drills (ids `${gameId}-${index}`). The analysis does it when it is
 * stored (play/analysis.js storeAnalysis), in the review or in the
 * background. Once per game: its file is marked `learned`. Returns false
 * when it was already done.
 */
export function learnFromGame({ game, points, humanColor, recordId = null, trendId = recordId, mistakes = null }) {
  const lib = recordId ? Games.getGame(recordId) : null;
  if (lib?.learned) return false;
  mistakes = mistakes || describeMistakes(game, points, humanColor);
  const now = Date.now();
  changeProfile((profile) => {
    let p = profile;
    // Complete the game's record with per-phase losses and the themes of
    // up to ten explained mistakes, and what each theme cost (the focus).
    if (trendId && p.games.some((r) => r.id === String(trendId))) {
      const summary = summarizeGame({ game, points, meta: { humanColor }, keyMoves: mistakes.top });
      const ten = describeMistakes(game, points, humanColor, 10).top;
      const themes = themeCounts(ten, humanColor);
      p = recordGame(p, { id: String(trendId), ...recordAnalysis(summary, humanColor, themes), themeLoss: themeLosses(ten, humanColor) });
    }
    // The two costliest mistakes become drills.
    const gameId = recordId || String(now);
    const sgf = game.toSGF();
    for (const m of mistakes.top.slice(0, 2)) {
      if (m.loss < 4 || !m.best || m.best.pass) continue;
      p = addMistake(
        p,
        {
          gameId,
          index: m.index,
          sgf,
          color: m.move.color,
          played: { x: m.move.x, y: m.move.y },
          best: { x: m.best.x, y: m.best.y },
          accept: m.accept,
          loss: m.loss,
          theme: m.theme,
          size: game.size,
        },
        now,
      );
    }
    return p;
  });
  if (lib) Games.patchGame(recordId, { learned: true });
  return true;
}
