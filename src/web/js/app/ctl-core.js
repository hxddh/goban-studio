/**
 * Shared controller pieces: settings, sheets, words for results, and
 * navigation history (back / forward across places, lessons, problems and
 * reviews).
 */
import { saveSettings } from "../persist.js";
import { setLang, t } from "../i18n.js";
import { setSound } from "../audio.js";
import * as Audio from "../audio.js";
import { STRENGTHS } from "../engine.js";
import { ratingToRank } from "./rating.js";
import { state, update } from "./store.js";

export const tx = (obj) => (obj ? obj[state.settings.lang] ?? obj.en ?? obj.zh ?? "" : "");

export function applyAppearance() {
  const s = state.settings;
  const root = document.documentElement;
  const dark = s.appearance === "dark" || (s.appearance === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.motion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
  root.dataset.board = s.board || "plain";
  root.dataset.text = s.largeText ? "large" : "normal"; // v6 a11y
}

export function setSetting(key, value) {
  update((s) => {
    s.settings = { ...s.settings, [key]: value };
  });
  saveSettings(state.settings);
  if (key === "lang") setLang(value);
  if (key === "sound") setSound(value);
  if (key === "appearance" || key === "largeText") applyAppearance();
  if (key === "board") {
    Audio.setMaterial?.(value);
    applyAppearance();
  }
  if (key === "lang" || key === "focus" || key === "coords" || key === "numbers" || key === "liveAnalysis" || key === "showEval" || key === "largeText") syncMenus();
}

let menuSync = () => {};
export function onMenusChanged(fn) {
  menuSync = fn;
}
export function syncMenus() {
  try {
    menuSync();
  } catch (_) {}
}

export function openSheet(kind, props = {}) {
  update({ sheet: { kind, ...props }, menu: null });
}

export function closeSheet() {
  if (state.sheet?.kind === "onboarding") return;
  update({ sheet: null });
}

export function confirmAction({ title, body = "", confirm, cancel, danger = false, onConfirm, onCancel }) {
  openSheet("confirm", { title, body, confirm, cancel, danger, onConfirm, onCancel });
}

export function resultText(result) {
  if (!result) return "";
  if (/^draw$/i.test(result) || result === "0") return t("common.draw");
  const color = result[0] === "B" ? t("common.black") : t("common.white");
  const rest = result.slice(2);
  if (rest === "R" || rest === "Resign") return t("result.resign", [color]);
  if (rest === "T" || rest === "Time") return t("result.time", [color]);
  return t("result.points", [color, rest]);
}

/** Teaching aids default to on for newer players (about 15 kyu and weaker). */
export function teachingOn() {
  const s = state.settings;
  if (s.teaching === true || s.teaching === false) return s.teaching;
  const r = state.progress?.rating?.r;
  const rank = r != null ? ratingToRank(r) : s.playerRank ?? 30;
  return rank >= 15;
}

/** The strength nearest a rating, for "suggested opponent". */
export function strengthForRating(r) {
  const rank = ratingToRank(r);
  return STRENGTHS.reduce((best, st) => (Math.abs(st.rank - rank) < Math.abs(best.rank - rank) ? st : best)).id;
}

/* ------------------------------------------------------------ history */

const hist = { back: [], fwd: [] };
let restoring = false;
let restorer = () => {};

export function setRestorer(fn) {
  restorer = fn;
}

export function locationNow() {
  const p = state.practice;
  const r = state.review;
  return {
    space: state.space,
    practice: {
      view: p.view,
      topic: p.topic,
      theme: p.theme || null,
      shape: p.shape || null,
      lessonId: p.lesson?.lesson?.id || null,
      lessonIndex: p.lesson?.index ?? null,
      problemId: p.problem?.def?.id || null,
      mistakeId: p.mistake?.m?.id || null,
      daily: !!p.daily,
    },
    library: { ...state.library },
    // v6
    report: state.report ? { recordId: state.report.recordId, space: state.report.space } : null,
    review: r
      ? {
          source: r.source,
          recordId: r.meta.recordId || null,
          classicId: r.meta.classicId || null,
          openingId: r.meta.openingId || null,
          space: r.meta.space || "play",
          index: r.game.mainLine().findIndex((n) => n.id === r.game.current.id),
        }
      : null,
  };
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Record where we are before moving somewhere else. */
export function remember() {
  if (restoring) return;
  const here = locationNow();
  if (hist.back.length && same(hist.back[hist.back.length - 1], here)) return;
  hist.back.push(here);
  if (hist.back.length > 60) hist.back.shift();
  hist.fwd = [];
}

export function canGoBack() {
  return hist.back.length > 0;
}
export function canGoForward() {
  return hist.fwd.length > 0;
}

export function back() {
  if (!hist.back.length) return false;
  hist.fwd.push(locationNow());
  const loc = hist.back.pop();
  restoring = true;
  try {
    restorer(loc);
  } finally {
    restoring = false;
  }
  syncMenus();
  return true;
}

export function forward() {
  if (!hist.fwd.length) return false;
  hist.back.push(locationNow());
  const loc = hist.fwd.pop();
  restoring = true;
  try {
    restorer(loc);
  } finally {
    restoring = false;
  }
  syncMenus();
  return true;
}

export function isRestoring() {
  return restoring;
}

export { t };
