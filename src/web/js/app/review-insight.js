/**
 * A key mistake in review: its variation on the board and its story, step
 * by step.
 */
import { state, update } from "./store.js";
import { leaveModes, startLive } from "./review-position.js";

/* ------------------------------------------------------ key mistakes */

/** Moves of the recommended line shown on the board when a key moment opens. */
export const PV_SHOWN = 5;

/** Show a line on the board: what was played, or the engine's better line. */
export function showVariation(km, kind) {
  const r = state.review;
  if (!r) return;
  r.trial = null;
  leaveModes(r);
  r.game.goto(r.game.mainLine()[km.index - 1].id);
  const color = km.move.color;
  let moves = [];
  if (kind === "played") {
    const line = r.game.mainLine().slice(km.index, km.index + 6);
    moves = line.filter((n) => n.move && !n.move.pass).map((n, i) => ({ x: n.move.x, y: n.move.y, c: n.move.color, n: i + 1 }));
  } else {
    let c = color;
    // The recommended line, its first PV_SHOWN moves: enough to see why it is better, not so many it hides the board.
    moves = (km.pv || [])
      .slice(0, PV_SHOWN)
      .map((v, i) => {
        const m = v.pass ? null : { x: v.x, y: v.y, c, n: i + 1 };
        c = -c;
        return m;
      })
      .filter(Boolean);
  }
  r.variation = { kind, index: km.index, moves };
  r.focus = km.index;
  update();
  startLive();
}

/**
 * Play a key mistake's story up to `step` (0-based) on the board.
 * `line` is "better" or "played" (km.story[line]). Sets r.variation to
 * { kind: line, index, moves, story: true, step }; moves are the story's
 * moves 0..step in the {x, y, c, n} shape the board draws.
 */
export function showStory(km, line, step = 0) {
  const r = state.review;
  const steps = km?.story?.[line];
  if (!r || !steps?.length) return;
  r.trial = null;
  leaveModes(r);
  const upto = Math.max(0, Math.min(steps.length - 1, step));
  r.game.goto(r.game.mainLine()[km.index - 1].id);
  const moves = steps
    .slice(0, upto + 1)
    .map((s) => (s.move.pass ? null : { x: s.move.x, y: s.move.y, c: s.color, n: s.n }))
    .filter(Boolean);
  r.variation = { kind: line, index: km.index, moves, story: true, step: upto };
  r.focus = km.index;
  update();
  startLive();
}

/** Step through the story on the board: delta +1 / −1 from the shown step. */
export function storyStep(delta) {
  const r = state.review;
  const v = r?.variation;
  if (!v?.story) return;
  const km = r.keyMoves.find((k) => k.index === v.index);
  if (km) showStory(km, v.kind, v.step + delta);
}

/**
 * Open a key moment: the board shows the recommended line at once, as
 * numbered see-through stones (1 … PV_SHOWN), so the better way can be
 * seen rather than read as coordinates. Without one (no analysis line,
 * or the best move was a pass) it shows what was played next.
 */
export function focusMistake(km) {
  const r = state.review;
  if (!r) return;
  r.focus = km.index;
  if (km.best && !km.best.pass && km.pv?.some((v) => !v.pass)) showVariation(km, "better");
  else if (km.story?.played?.length) showStory(km, "played", 0);
  else showVariation(km, "played");
}

/** A key moment as the model stores it (move, better move, loss), by its index. */
export function momentAt(index, r = state.review) {
  return r?.model?.moments.find((m) => m.index === index) || null;
}
