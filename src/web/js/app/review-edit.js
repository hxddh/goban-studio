/**
 * Editing the record in review — comments, marks, variations, a tried line
 * kept — with one undo and redo history.
 */
import { MARK_KINDS, treeLayout as layoutTree } from "../rules.js";
import { t } from "../i18n.js";
import { state, update, toast, announce } from "./store.js";
import { discardDraft, draftKeepable, gotoNode } from "./review-nav.js";
import { attach, detach, inDraft, onMainLine, startLive } from "./review-position.js";
import { edited, nodeOf, saveEdits } from "./review-analysis.js";

/** Keep the line being tried: it becomes a variation of the record (and is saved with it). */
export function keepDraft() {
  const r = state.review;
  const d = r?.draft;
  if (!d || !draftKeepable(r)) return false;
  r.draft = null;
  const index = d.from.children.indexOf(d.head);
  record(r, { kind: "keep", at: d.from, atRedo: d.head, undo: () => detach(r, d.from, d.head), redo: () => attach(d.from, d.head, index) });
  edited(r);
  announce(t("review.draftKept"));
  return true;
}

/* ------------------------------------------------- the edit history */

const HISTORY_MAX = 200;

export function record(r, entry) {
  const h = r.history;
  h.undo.push(entry);
  if (h.undo.length > HISTORY_MAX) h.undo.shift();
  h.redo = [];
  return entry;
}

export function canUndoEdit(r = state.review) {
  return !!r && (!!r.draft || r.history.undo.length > 0);
}
export function canRedoEdit(r = state.review) {
  return !!r && !r.draft && r.history.redo.length > 0;
}

/** Show where an edit was undone or redone, when that node is still in the tree. */
function showNode(r, node) {
  if (!node) return;
  for (let n = node; n; n = n.parent) {
    if (n === r.game.root) {
      r.game.goto(node);
      r.variation = null;
      return;
    }
    if (!n.parent || !n.parent.children.includes(n)) return;
  }
}

function applyHistory(r, entry, dir) {
  const before = r.game.mainLine();
  if (dir < 0) entry.undo();
  else entry.redo();
  showNode(r, dir < 0 ? entry.at : entry.atRedo || entry.at);
  if (entry.kind === "comment") entry.open = false;
  edited(r, { mainBefore: before });
  startLive();
}

/**
 * Undo the last edit of this review (⌘Z): a comment, a mark, marks
 * cleared, a variation kept, promoted or deleted, a stone of a free board.
 * While a line is being tried it takes back that line's last move.
 */
export function reviewUndo() {
  const r = state.review;
  if (!r || r.trial || r.recount) return false;
  if (r.draft) {
    const d = r.draft;
    const cur = r.game.current;
    if (cur === d.from || cur === d.head) return discardDraft();
    detach(r, cur.parent, cur);
    update();
    startLive();
    return true;
  }
  const entry = r.history.undo.pop();
  if (!entry) return false;
  r.history.redo.push(entry);
  applyHistory(r, entry, -1);
  announce(t("edit.undone"));
  return true;
}

/** Redo the edit last undone (⇧⌘Z). */
export function reviewRedo() {
  const r = state.review;
  if (!r || r.trial || r.recount || r.draft) return false;
  const entry = r.history.redo.pop();
  if (!entry) return false;
  r.history.undo.push(entry);
  applyHistory(r, entry, 1);
  announce(t("edit.redone"));
  return true;
}

/** Take one edit back from a toast's Undo, wherever it is in the history. */
function revert(r, entry) {
  if (state.review !== r) return;
  const h = r.history;
  const i = h.undo.indexOf(entry);
  if (i < 0) return;
  if (i === h.undo.length - 1 && !r.draft) return void reviewUndo();
  h.undo.splice(i, 1);
  applyHistory(r, entry, -1);
}

/** "Deleted · Undo": the toast of an edit that removed something. */
function undoToast(r, entry, message) {
  toast(message, "info", { key: "review-edit", replace: true, action: { label: t("common.undoAction"), run: () => revert(r, entry) } });
}

/** Remove the variation the board is in (back to its branch point). */
export function deleteVariation() {
  const r = state.review;
  if (!r || onMainLine()) return;
  if (r.draft) return void discardDraft();
  const main = new Set(r.game.mainLine().map((n) => n.id));
  let n = r.game.current;
  while (n.parent && !main.has(n.parent.id)) n = n.parent;
  if (deleteBranch(n)) undoToast(r, r.history.undo.at(-1), t("review.variationDeleted"));
}

/** Set the comment of a node (default: the one on the board). "" clears it. */
export function setComment(text, node = null) {
  const r = state.review;
  if (!r) return false;
  const n = nodeOf(r, node);
  const before = n?.comment || "";
  const after = String(text ?? "");
  if (!n || before === after) return false;
  r.game.setComment(n, text);
  // One spell of typing in a comment is one step of the history.
  const top = r.history.undo.at(-1);
  if (top?.kind === "comment" && top.node === n && top.open) top.after = after;
  else {
    const e = record(r, { kind: "comment", node: n, at: n, before, after, open: true });
    e.undo = () => r.game.setComment(n, e.before);
    e.redo = () => r.game.setComment(n, e.after);
  }
  edited(r);
  return true;
}

/** The comment box lost the focus: what was typed is one finished edit, and is written now. */
export function commitComment() {
  const r = state.review;
  if (!r) return;
  const top = r.history.undo.at(-1);
  if (top?.kind === "comment") top.open = false;
  saveEdits(r);
  update();
}

const copyMarks = (n) => (n.marks || []).map((m) => ({ ...m }));

function recordMarks(r, n, before) {
  const after = copyMarks(n);
  return record(r, { kind: "marks", at: n, undo: () => (n.marks = before.map((m) => ({ ...m }))), redo: () => (n.marks = after.map((m) => ({ ...m }))) });
}

/**
 * Board marks. toggleMark(kind, x, y[, text]) toggles a mark on the node on
 * the board; toggleMark(kind) with no point picks (or drops, when it is the
 * current one) the mark tool, so that board clicks place marks instead of
 * stones. kind: "triangle" | "square" | "circle" | "cross" | "label"; null
 * drops the tool.
 */
export function toggleMark(kind, x = null, y = null, text = null) {
  const r = state.review;
  if (!r) return null;
  if (x == null || y == null) {
    setMarkTool(r.markTool === kind ? null : kind);
    return null;
  }
  if (!MARK_KINDS.includes(kind)) return null;
  const n = r.game.current;
  const before = copyMarks(n);
  const mark = r.game.toggleMark(n, x, y, kind, text);
  recordMarks(r, n, before);
  edited(r);
  return mark;
}

export function setMarkTool(kind) {
  const r = state.review;
  if (!r) return;
  r.markTool = MARK_KINDS.includes(kind) ? kind : null;
  update();
}

/** Remove every mark on a node (default: the one on the board). */
export function clearMarks(node = null) {
  const r = state.review;
  const n = r && nodeOf(r, node);
  if (!n?.marks?.length) return false;
  const before = copyMarks(n);
  n.marks = [];
  const entry = recordMarks(r, n, before);
  edited(r);
  undoToast(r, entry, t("edit.marksCleared"));
  return true;
}

/**
 * Delete a node and everything after it (default: the node on the board).
 * Deleting a main-line move makes its next variation the main line there;
 * the UI should confirm that first. The root cannot be deleted.
 */
export function deleteBranch(node = null) {
  const r = state.review;
  if (!r) return false;
  const n = nodeOf(r, node);
  if (!n?.parent) return false;
  const before = r.game.mainLine();
  const cur = r.game.current;
  const from = n.parent;
  const index = from.children.indexOf(n);
  const parent = r.game.deleteNode(n);
  if (!parent) return false;
  record(r, { kind: "delete", at: cur, atRedo: from, undo: () => attach(from, n, index), redo: () => detach(r, from, n) });
  edited(r, { mainBefore: before });
  // The cursor was inside the deleted branch: show the branch point.
  if (r.game.current === parent) gotoNode(parent);
  return true;
}

/** Make the line through a node (default: the one on the board) the main line. */
export function promoteVariation(node = null) {
  const r = state.review;
  if (!r) return false;
  const n = nodeOf(r, node);
  // A line being tried that is made the main line is kept first.
  if (r.draft && n && inDraft(r, n) && n !== r.draft.from) keepDraft();
  const before = r.game.mainLine();
  // The order of the children along its path, to put back on undo.
  const orders = [];
  for (let c = n; c?.parent; c = c.parent) orders.push([c.parent, c.parent.children.slice()]);
  if (!n || !r.game.promoteVariation(n)) return false;
  record(r, { kind: "promote", at: n, undo: () => orders.forEach(([p, kids]) => (p.children = kids.slice())), redo: () => r.game.promoteVariation(n) });
  edited(r, { mainBefore: before });
  return true;
}

/** The game tree laid out for the variation mini-map (rules.treeLayout). */
export function treeLayout() {
  const r = state.review;
  return r ? layoutTree(r.game) : null;
}
