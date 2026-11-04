/**
 * Everything the app does, as plain functions over the store.
 *
 * This file is the hub the views import: it boots the app, owns places,
 * history restore, the library and onboarding, and re-exports the play,
 * review and practice controllers. None of it touches the DOM.
 */
import { BLACK, Game, formatPoints } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as Engine from "../engine.js";
import * as Lib from "../library.js";
import { DEFAULT_SETTINGS, clearAll, loadProgress, loadSettings, markClassic, migrate, saveProgress, saveSettings } from "../persist.js";
import { detectLang, setLang, t } from "../i18n.js";
import * as Audio from "../audio.js";
import { hasFileDialogs, hasNative, normalizePaths, openFileDialog, readTextFile } from "../host.js";
import { OPENINGS } from "../content/openings.js";
import { CLASSICS } from "../content/classics.js";
import { state, update, toast } from "./store.js";
import { applyAppearance, confirmAction, remember, isRestoring, setRestorer, setSetting, syncMenus, tx } from "./ctl-core.js";
import { startRating } from "./rating.js";
import { continueCurrent, maybeComputerMove, newGame, ponder, restoreCurrent, reviewCurrentGame } from "./play-ctl.js";
import { dropReview, openReview, reviewGoto } from "./review-ctl.js";
import { allLessons, openLesson, openMistakeDrill, openProblem, openShape, openTopic, practiceHome, startDaily } from "./practice-ctl.js";
import { autoCheckForUpdates, restoreUpdateState } from "./update-ctl.js";

export * from "./ctl-core.js";
export * from "./play-ctl.js";
export * from "./review-ctl.js";
export * from "./practice-ctl.js";
export * from "./update-ctl.js";
export { OPENINGS, CLASSICS, formatPoints };

/* ---------------------------------------------------------------- boot */

export function boot() {
  migrate();
  const settings = loadSettings();
  if (!settings.lang) settings.lang = detectLang();
  state.settings = settings;
  state.progress = loadProgress();
  if (!state.progress.rating && settings.onboarded) {
    state.progress.rating = startRating(settings.playerRank ?? 30);
    saveProgress(state.progress);
  }
  setLang(settings.lang);
  Audio.setSound(settings.sound);
  Audio.setMaterial?.(settings.board);
  applyAppearance();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyAppearance);
  restoreCurrent();
  state.space = "today";
  if (!settings.onboarded) state.sheet = { kind: "onboarding", step: 0 };
  setRestorer(restore);
  state.ready = true;
  update();
  Engine.info().then((info) => {
    update({ engine: info });
    maybeComputerMove();
    ponder();
  });
  // v4: the opt-in weekly update check (no request unless it is on and due).
  if (hasNative()) setTimeout(() => autoCheckForUpdates().catch(() => {}), 4000);
  // v5: how the last in-app update went (no request), and tell a waiting
  // update helper that this new version is up.
  if (hasNative()) setTimeout(() => restoreUpdateState().catch(() => {}), 600);
}

/* --------------------------------------------------------------- places */

export const SPACES = ["today", "play", "practice", "library"];

export function goSpace(space) {
  // Clicking the place you are in returns to its top level.
  if (space === state.space) {
    if (space === "practice" && state.practice.view !== "home") return practiceHome();
    if (state.review && (state.review.meta.space || "play") === space) {
      remember();
      dropReview();
      return update();
    }
    return;
  }
  remember();
  update((s) => {
    s.space = space;
    s.menu = null;
  });
  if (space === "play") {
    maybeComputerMove();
    ponder();
  }
  syncMenus();
}

export function toggleFocus() {
  setSetting("focus", !state.settings.focus);
}

/** Put the app back where a history entry says it was. */
function restore(loc) {
  if (state.review) dropReview();
  state.space = loc.space;
  state.library = { ...state.library, ...loc.library };
  const p = loc.practice;
  if (loc.space === "practice") {
    if (p.view === "lesson" && p.lessonId) openLesson(p.lessonId, p.lessonIndex);
    else if (p.view === "problem" && p.problemId) openProblem(p.problemId);
    else if (p.view === "mistake" && p.mistakeId) openMistakeDrill(p.mistakeId);
    else if (p.view === "topic" && p.shape) openShape(p.shape);
    else if (p.view === "topic" && p.topic) openTopic(p.topic, p.theme || null);
    else practiceHome();
  }
  const rv = loc.review;
  if (rv) {
    if (rv.source === "current") reviewCurrentGame();
    else if (rv.source === "record" && rv.recordId) openRecord(rv.recordId);
    else if (rv.source === "classic" && rv.classicId) openClassic(rv.classicId);
    else if (rv.source === "opening" && rv.openingId) openOpening(rv.openingId);
    if (state.review && rv.index >= 0) reviewGoto(rv.index);
  }
  update();
}

/* --------------------------------------------------------------- library */

export function openRecord(id) {
  const rec = Lib.getGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    openReview(game, { source: "record", recordId: rec.id, name: rec.name, humanColor: rec.opponent === "ai" ? rec.humanColor : null, space: "library", back: "library", startAt: 0 });
  } catch (e) {
    console.error("SGF open failed", e);
    toast(t("library.importError"), "error");
  }
}

export function openClassic(id) {
  const c = CLASSICS.find((g) => g.id === id);
  if (!c) return;
  try {
    const { game } = loadSGF(c.sgf);
    markClassic(state.progress, c.id);
    openReview(game, { source: "classic", classic: c, classicId: c.id, startAt: 0, space: "library", back: "library" });
  } catch (e) {
    toast(t("library.importError"), "error");
  }
}

export function openOpening(id) {
  const o = OPENINGS.find((g) => g.id === id);
  if (!o) return;
  const game = new Game({ size: o.size || 19, komi: o.komi ?? 6.5 });
  if (o.setup?.length) game.setup(o.setup, o.toMove);
  for (const m of o.line) game.play(m.x, m.y, { color: m.c, force: true });
  openReview(game, { source: "opening", opening: o, openingId: o.id, startAt: 0, guess: true, guessColor: o.toMove, space: "library", back: "library" });
}

export function deleteRecord(id) {
  confirmAction({
    title: t("library.deleteConfirm"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => {
      Lib.deleteGame(id);
      update();
    },
  });
}

export function renameRecord(id, name) {
  Lib.renameGame(id, name);
  update();
}

export async function exportRecord(id) {
  const rec = Lib.getGame(id);
  if (!rec) return;
  try {
    const { game } = loadSGF(rec.sgf);
    const { exportSGF } = await import("./play-ctl.js");
    exportSGF(game, rec.name || "goban-studio");
  } catch (_) {
    toast(t("library.importError"), "error");
  }
}

export async function importSGFText(text, name = "goban-studio.sgf") {
  const { game, warnings } = loadSGF(text);
  const rec = Lib.saveGame(game, { name: String(name).replace(/\.sgf$/i, ""), source: "import" });
  if (!state.settings.onboarded) {
    setSetting("onboarded", true);
    update({ sheet: null });
  }
  openReview(game, { source: "record", recordId: rec.id, name: rec.name, space: "library", back: "library", startAt: 0 });
  if (warnings.length) toast(warnings[0], "warn");
}

export async function importFromFile(file) {
  if (!file) return;
  try {
    await importSGFText(await file.text(), file.name);
  } catch (e) {
    toast(t(e?.code === "unsupported-rules" ? "library.rulesUnsupported" : "library.importError"), "error");
  }
}

export async function importFromPath(path) {
  try {
    const text = await readTextFile(path);
    if (text == null) throw new Error("read failed");
    await importSGFText(text, String(path).split(/[/\\]/).pop() || "goban-studio.sgf");
  } catch (e) {
    console.error("SGF import failed", e);
    toast(t(e?.code === "unsupported-rules" ? "library.rulesUnsupported" : "library.importError"), "error");
  }
}

export async function pickImport() {
  update({ menu: null });
  if (hasNative() && hasFileDialogs()) {
    const files = await openFileDialog({ title: t("library.import"), allowMultiple: false });
    const paths = normalizePaths(files);
    if (paths.length) importFromPath(paths[0]);
    return;
  }
  document.getElementById("file-input")?.click();
}

export function clearData() {
  confirmAction({
    title: t("settings.clearConfirm"),
    body: t("settings.clearBody"),
    confirm: t("common.delete"),
    danger: true,
    onConfirm: () => {
      clearAll();
      location.reload();
    },
  });
}

/* ----------------------------------------------------------- onboarding */

export function finishOnboarding(choice, rank = null) {
  const s = state.settings;
  const next = { ...s, onboarded: true, experience: choice };
  if (choice === "new") next.playerRank = 30;
  else if (choice === "rules") next.playerRank = 25;
  else next.playerRank = rank ?? 15;
  const strength = choice === "new" ? "30k" : choice === "rules" ? "25k" : Engine.STRENGTHS.reduce((best, st) => (Math.abs(st.rank - next.playerRank) < Math.abs(best.rank - next.playerRank) ? st : best)).id;
  next.strength = strength;
  state.progress.rating = startRating(next.playerRank);
  saveProgress(state.progress);
  update((st) => {
    st.settings = next;
    st.sheet = null;
  });
  saveSettings(next);
  if (choice === "new") {
    const first = allLessons()[0];
    if (first) openLesson(first.lesson.id, 0);
  } else if (choice === "rules") {
    newGame({ size: 19, opponent: "ai", color: BLACK, strength, handicap: Engine.suggestHandicap(next.playerRank, strength, 19) });
  } else {
    newGame({ size: 19, opponent: "ai", color: BLACK, strength, handicap: 0 });
  }
}

/** Your level changed by hand in Settings: restart the rating from it. */
export function setPlayerRank(rank) {
  setSetting("playerRank", rank);
  state.progress.rating = startRating(rank ?? 30);
  saveProgress(state.progress);
  update();
}

export { DEFAULT_SETTINGS };
