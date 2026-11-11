/**
 * Moving through the record in review: a move, a step, a node of the tree,
 * back to the main line; leaving a line that was being tried.
 */
import { t } from "../i18n.js";
import { state, update, announce } from "./store.js";
import { dropDraft, inDraft, startLive } from "./review-position.js";

export function reviewGoto(index) {
  const r = state.review;
  if (!r) return;
  const line = r.game.mainLine();
  const i = Math.max(0, Math.min(line.length - 1, index));
  gotoNode(line[i]);
}

export function gotoNode(node) {
  const r = state.review;
  if (!r || !node) return;
  r.autoJump = false;
  r.trial = null;
  // Moving anywhere outside the line being tried drops it; a recount is left.
  if (r.draft && !inDraft(r, node)) dropDraft(r);
  r.recount = null;
  r.game.goto(node);
  r.variation = null;
  update();
  startLive();
}

/**
 * ← / →: one move back or on. They follow the main line (or the kept
 * variation the board is in); while a line is being tried they stay inside
 * it, from the position it left to its last move.
 */
export function reviewStep(delta) {
  const r = state.review;
  if (!r) return;
  const d = r.draft;
  let node = r.game.current;
  const next = (n) => (d && n === d.from ? d.head : n.children[0]);
  if (delta < 0) for (let k = 0; k < -delta && node.parent && !(d && node === d.from); k++) node = node.parent;
  else for (let k = 0; k < delta && next(node); k++) node = next(node);
  gotoNode(node);
}

/** Back from a variation to the main-line move it branched from. */
export function backToMainLine() {
  const r = state.review;
  if (!r) return;
  const main = new Set(r.game.mainLine().map((n) => n.id));
  let n = r.game.current;
  while (n && !main.has(n.id)) n = n.parent;
  gotoNode(n || r.game.root);
}

/** Variations in the game: main-line nodes with more than one child. */
export function branchPoints() {
  const r = state.review;
  if (!r) return [];
  return r.game
    .mainLine()
    .map((n, i) => ({ node: n, index: i, count: n.children.length - 1 }))
    .filter((b) => b.count > 0);
}

/** Discard the line being tried (Esc, the bar's Discard): back to the position it left. */
export function discardDraft() {
  const r = state.review;
  const d = r?.draft;
  if (!d) return false;
  dropDraft(r);
  r.game.goto(d.from);
  r.variation = null;
  announce(t("review.draftDiscarded"));
  update();
  startLive();
  return true;
}

/**
 * Whether the line being tried can be kept. Not from the last move of a
 * game still in play: the game goes on from there, and a move tried at
 * that point never becomes part of it (settleLive).
 */
export function draftKeepable(r = state.review) {
  return !!r?.draft && !(r.live0 && r.draft.from === r.live0.end);
}
