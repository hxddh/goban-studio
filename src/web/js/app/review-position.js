/**
 * Where the open review (state.review) stands: its record, its place on the
 * main line, the line being tried as a branch of the tree, and the live
 * analysis of the position on the board.
 */
import { influenceMap } from "../rules.js";
import * as Engine from "../engine.js";
import * as Games from "../data/games.js";
import { store } from "../data/store.js";
import { saveSettings } from "../data/settings.js";
import { state, update } from "./store.js";

/** The saved game a review is of: its record, or the record of the game in play. */
export function recordIdOf(r = state.review) {
  if (!r) return null;
  if (r.meta.recordId) return r.meta.recordId;
  if (r.source === "current" && state.game?.game === r.game) return state.game.recordId || null;
  return null;
}

/** A game of your own: the game in play, or a saved game played here (not imported, not a classic). */
export function ownGame(r = state.review) {
  if (!r || r.meta.classicId || r.source === "classic") return false;
  if (r.source === "current") return true;
  const id = recordIdOf(r);
  const rec = id && Games.getGame(id);
  return !!rec && rec.source !== "import";
}

/* ------------------------------------------------------- navigation */

export function reviewIndex() {
  const r = state.review;
  if (!r) return 0;
  const line = r.game.mainLine();
  const i = line.findIndex((n) => n.id === r.game.current.id);
  return i;
}

/** Depth of the current node from the root (works inside variations). */
export function reviewDepth() {
  const r = state.review;
  let d = 0;
  for (let n = r?.game.current; n && n.parent; n = n.parent) d++;
  return d;
}

export function onMainLine() {
  return reviewIndex() >= 0;
}

/* ---------------------------------------------- trying a variation */

/** `node` is in the line being tried (or the position it left). */
export function inDraft(r, node) {
  const d = r.draft;
  if (!d) return false;
  if (node === d.from) return true;
  for (let n = node; n; n = n.parent) if (n === d.head) return true;
  return false;
}

/** Take `node` (a child of `parent`) out of the tree; the board steps out of it. */
export function detach(r, parent, node) {
  let inside = false;
  for (let n = r.game.current; n; n = n.parent) if (n === node) inside = true;
  parent.children = parent.children.filter((c) => c !== node);
  if (inside) r.game.goto(parent);
}

export function attach(parent, node, index) {
  if (parent.children.includes(node)) return;
  parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, node);
}

/** Drop the line being tried, without a word (moving elsewhere, leaving the review). */
export function dropDraft(r) {
  const d = r?.draft;
  if (!d) return;
  r.draft = null;
  detach(r, d.from, d.head);
}

/** Leaving the review, or starting something else in it: nothing half done stays (the line tried, a recount). */
export function leaveModes(r) {
  dropDraft(r);
  r.recount = null;
}

/* ------------------------------------------------------ live analysis */

let liveCtl = null;
let liveTimer = 0;

export function stopLive() {
  clearTimeout(liveTimer);
  if (liveCtl) liveCtl.abort();
  liveCtl = null;
}

/** Analyse the position on screen (debounced), streaming partial results. */
export function startLive() {
  stopLive();
  const r = state.review;
  if (!r || r.trial || r.recount || !state.settings.liveAnalysis || !state.engine.available) {
    if (r) r.live = null;
    return;
  }
  const node = r.game.current;
  liveTimer = setTimeout(async () => {
    const ctl = new AbortController();
    liveCtl = ctl;
    const apply = (a) => {
      if (!a || state.review !== r || r.game.current !== node) return;
      r.live = { nodeId: node.id, moves: a.moves, winrate: a.winrate, scoreLead: a.scoreLead, ownership: a.ownership, visits: a.visits, done: false };
      update();
    };
    let a = null;
    try {
      a = await Engine.live(r.game, node, { visits: 260, signal: ctl.signal, onInfo: apply });
    } catch (_) {}
    if (ctl.signal.aborted) return;
    apply(a);
    if (r.live && r.live.nodeId === node.id) r.live.done = true;
    update();
  }, 140);
}

export function toggleLive() {
  const on = !state.settings.liveAnalysis;
  state.settings = { ...state.settings, liveAnalysis: on };
  saveSettings(store, state.settings);
  if (on) startLive();
  else {
    stopLive();
    if (state.review) state.review.live = null;
  }
  update();
}

/** Current position's numbers: live analysis first, else the whole-game pass. */
export function currentEval() {
  const r = state.review;
  if (!r) return null;
  if (r.live && r.live.nodeId === r.game.current.id) return r.live;
  const i = reviewIndex();
  return i >= 0 ? r.points[i] : null;
}

export function toggleOwnership() {
  if (!state.review) return;
  state.review.ownership = !state.review.ownership;
  update();
}

export function reviewOwnershipMap() {
  const r = state.review;
  if (!r?.ownership) return null;
  const e = currentEval();
  if (e?.ownership) return e.ownership;
  return influenceMap(r.game.current.board);
}
