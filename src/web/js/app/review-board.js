/**
 * The free board (a review of an empty game) and the review as a picture.
 */
import { Game } from "../rules.js";
import * as Games from "../data/games.js";
import { t } from "../i18n.js";
import { hasFileDialogs, hasNative, normalizePaths, revealPath, saveFileDialog, writeBinaryFile } from "../host.js";
import { state, update, toast } from "./store.js";
import { openReview } from "./review-session.js";
import { recordIdOf, startLive, stopLive } from "./review-position.js";
import { reviewModel, reviewRating } from "./review-analysis.js";

/* ----------------------------------------------------- a free board */

/**
 * An empty board to place stones on (the Library's "Open board"): a review
 * with no game behind it. Black and White alternate; stepping back and
 * playing elsewhere makes a variation; Save to Library keeps it as a record.
 */
export function openFreeBoard(size = 19) {
  const n = [9, 13, 19].includes(Number(size)) ? Number(size) : 19;
  openReview(new Game({ size: n }), { source: "free", free: true, space: "library", back: "library" });
}

/** The free board on screen has no stone yet (its size can still be chosen). */
export function freeBoardEmpty(r = state.review) {
  return !!r?.meta.free && !r.meta.recordId && r.game.root.children.length === 0;
}

/** Another size for the free board, while it is empty. */
export function setFreeBoardSize(size) {
  const r = state.review;
  if (!freeBoardEmpty(r) || r.game.size === Number(size)) return;
  const n = [9, 13, 19].includes(Number(size)) ? Number(size) : 19;
  stopLive();
  r.game = new Game({ size: n });
  r.points = [null];
  r.live = null;
  r.history = { undo: [], redo: [] };
  update();
  startLive();
}

/** Keep the free board in the Library; from then on its edits are saved like any record's. */
export function saveFreeBoard() {
  const r = state.review;
  if (!r?.meta.free || r.meta.recordId) return null;
  const rec = Games.saveGame(r.game, { source: "board" });
  r.source = "record";
  r.meta = { ...r.meta, recordId: rec.id };
  r.edits = { dirty: false, savedAt: Date.now(), target: "record" };
  toast(t("toast.saved"), "success");
  update();
  return rec;
}

/* ---------------------------------------------------------- export */

/** Save the review as a PNG: the native save dialog, or a download. */
export async function exportReviewImage() {
  const r = state.review;
  const model = r && !r.analyzing ? reviewModel() : null;
  if (!model) return;
  update({ menu: null });
  const { renderReviewPNG } = await import("../play/review-image.js");
  const rec = recordIdOf(r) ? Games.getGame(recordIdOf(r)) : null;
  const date = rec?.finishedAt || rec?.updatedAt || model.at;
  const day = new Date(date || Date.now()).toISOString().slice(0, 10);
  const filename = `goban-studio-review-${day}.png`;
  const blob = await renderReviewPNG(model, { date, rating: reviewRating(r) });
  if (!blob) return toast(t("report.exportFailed"), "error");
  // In the app a failed write is an error, never a download link (a WebView ignores those).
  if (hasNative()) {
    if (!hasFileDialogs()) return toast(t("report.exportFailed"), "error", 6000);
    const path = await saveFileDialog({ title: t("report.exportImage"), defaultName: filename });
    if (path == null || (Array.isArray(path) && path.length === 0)) return;
    const chosen = normalizePaths(path)[0];
    if (chosen && (await writeBinaryFile(chosen, new Uint8Array(await blob.arrayBuffer())))) {
      revealPath(chosen);
      toast(t("report.exported"), "success");
    } else toast(t("report.exportFailed"), "error", 6000);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("report.exported"), "success");
}
