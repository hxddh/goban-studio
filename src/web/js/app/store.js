/**
 * App state: one plain object, one way to change it.
 *
 * Game trees and solver states are mutable objects held inside the state;
 * `update()` is how any change (mutating or not) announces itself, and the
 * view re-renders from the whole state. Preact's diff keeps that cheap and
 * keeps focus, scroll and transitions intact.
 */
import { useEffect, useState } from "preact/hooks";
import { initialModels } from "../models.js";
import { t } from "../i18n.js";

const listeners = new Set();
let scheduled = false;

export const state = {
  ready: false,
  space: "today", // today | play | learn | library (v12)
  settings: null, // data/settings.js
  profile: null, // the one player model (model/player.js), stored as profile.json
  engine: { kind: "offline", name: "", available: false },
  sheet: null, // null | { kind, ...props }
  menu: null, // open popover id
  toasts: [], // { id, message, tone, key, action }: toast(), below
  tasks: [], // { key, status, label, message, retry }: runTask(), below
  announce: "",
  game: null, // the game on the board (app/play-ctl.js)
  review: null, // the review over a game, and the post-game review (app/review-ctl.js)
  // Play: view "home" (the game in progress or the suggested game, the
  // history, the classics, the explorer) or "game" (the board, which a
  // finished game turns into its review); kind and query filter the
  // history; explorer is the opening explorer.
  play: { view: "home", kind: "all", query: "" },
  // Learn: view "home" (the path) or one of its pages (catalog,
  // lesson, problem, topic, mistake, capture, dailyDone); daily is today's session.
  learn: { view: "home", topic: null, lesson: null, problem: null, daily: null },
  models: initialModels(), // optional downloads (app/models-ctl.js)
  bootError: null, // v13: { kind: "bridge" } when the packaged app has no bridge (app/safety.jsx)
  storeProblem: null, // v13: the safe state, controller.js storeProblemOf (+ continued)
};

export function update(fn) {
  if (typeof fn === "function") fn(state);
  else if (fn && typeof fn === "object") Object.assign(state, fn);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const l of listeners) l();
  });
}

/** Call `l` after each batch of updates; returns the function that stops it. */
export function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return state;
}

/*
 * v13: the game clock ticks four times a second. A tick re-renders only
 * the clocks on screen (play.jsx ClockFace, through useClockTicks), not the
 * whole app and its board; anything else the clock changes (the game ends
 * on time) goes through update() as usual.
 */
const tickListeners = new Set();
export function clockChanged() {
  for (const l of tickListeners) l();
}
export function onClockTick(l) {
  tickListeners.add(l);
  return () => tickListeners.delete(l);
}
export function useClockTicks() {
  const [, force] = useState(0);
  useEffect(() => onClockTick(() => force((n) => n + 1)), []);
}

/* ------------------------------------------------------------- toasts */

/**
 * Toasts: short messages at the bottom of the window (app/feedback.jsx
 * draws them).
 *
 *   toast(message, tone = "info", ms?, { key, replace, action, onClose })
 *
 * - tone: "info" | "success" | "warning" | "error" ("warn" is read as
 *   "warning"). An error stays until it is dismissed; everything else goes
 *   after a time that grows with the length of the text (toastDuration);
 *   `ms` can only make that longer.
 * - key: a toast of that key already on screen is not shown again (a
 *   burst of failed writes is one toast); with `replace` the new one takes
 *   its place instead.
 * - action: { label, run } — one button ("Undo"). Running it closes the
 *   toast. A toast with an action stays about eight seconds.
 * - onClose(reason): called once when the toast goes; reason is "action",
 *   "timeout", "dismiss" (the close button, Esc) or "replaced" (pushed out
 *   by newer toasts, or replaced under its key).
 *
 * The options may also be the third argument: toast(message, tone, { … }).
 * Returns the toast's id (null when it was not shown), for dismissToast.
 * At most TOAST_MAX are on screen; the oldest makes room. The timers pause
 * while the pointer or the focus is on a toast (pauseToasts/resumeToasts).
 * What a toast says is also spoken, once: an error by its own
 * role="alert", everything else through announce().
 */
export const TOAST_TONES = ["info", "success", "warning", "error"];
export const TOAST_MAX = 3;

/** How long a toast stays, in ms (Infinity: until it is dismissed). */
export function toastDuration(message, { tone = "info", action = null, ms = 0 } = {}) {
  if (tone === "error") return Infinity;
  // About 14 Latin characters a second; a CJK character carries more, so it counts double.
  const units = [...String(message || "")].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2e7f ? 2 : 1), 0);
  return Math.min(15000, Math.max(3000, 1500 + units * 70, action ? 8000 : 0, Number(ms) || 0));
}

let toastId = 0;
/** id → { timer, left, since, onClose } */
const toastLife = new Map();
let toastsPaused = false;

function armToast(id) {
  const life = toastLife.get(id);
  if (!life || toastsPaused || !Number.isFinite(life.left)) return;
  clearTimeout(life.timer);
  life.since = Date.now();
  life.timer = setTimeout(() => closeToast(id, "timeout"), life.left);
}

function closeToast(id, reason) {
  const life = toastLife.get(id);
  if (life) clearTimeout(life.timer);
  toastLife.delete(id);
  if (!state.toasts.some((x) => x.id === id)) return false;
  update((s) => {
    s.toasts = s.toasts.filter((x) => x.id !== id);
  });
  try {
    life?.onClose?.(reason);
  } catch (e) {
    console.error("toast:", e);
  }
  return true;
}

export function toast(message, tone = "info", ms = 0, opts = {}) {
  if (ms && typeof ms === "object") {
    opts = ms;
    ms = 0;
  }
  const { key = null, replace = false, action = null, onClose = null } = opts || {};
  const kind = tone === "warn" ? "warning" : TOAST_TONES.includes(tone) ? tone : "info";
  if (key) {
    const old = state.toasts.find((x) => x.key === key);
    if (old && !replace) return null;
    if (old) closeToast(old.id, "replaced");
  }
  const id = ++toastId;
  const act = action && typeof action.run === "function" && action.label ? { label: String(action.label), run: action.run } : null;
  toastLife.set(id, { timer: 0, left: toastDuration(message, { tone: kind, action: act, ms }), since: 0, onClose });
  update((s) => {
    s.toasts = [...s.toasts, { id, message, tone: kind, key, action: act }];
  });
  while (state.toasts.length > TOAST_MAX) closeToast(state.toasts[0].id, "replaced");
  armToast(id);
  if (kind !== "error") announce(act ? `${message}${t("a11y.sentence")}${act.label}` : message);
  return id;
}

/** Close a toast (the close button, Esc). */
export function dismissToast(id, reason = "dismiss") {
  return closeToast(id, reason);
}

/** Close the toast shown under `key`, if there is one. */
export function dismissToastKey(key, reason = "dismiss") {
  const x = state.toasts.find((v) => v.key === key);
  return x ? closeToast(x.id, reason) : false;
}

/** The toast's button: the toast goes, then its action runs. */
export function runToastAction(id) {
  const x = state.toasts.find((v) => v.id === id);
  if (!x?.action) return;
  closeToast(id, "action");
  x.action.run();
}

/** The pointer or the focus is on a toast: nothing times out meanwhile. */
export function pauseToasts() {
  if (toastsPaused) return;
  toastsPaused = true;
  const now = Date.now();
  for (const life of toastLife.values()) {
    if (!life.timer) continue;
    clearTimeout(life.timer);
    life.timer = 0;
    if (Number.isFinite(life.left)) life.left = Math.max(1500, life.left - (now - life.since));
  }
}
export function resumeToasts() {
  if (!toastsPaused) return;
  toastsPaused = false;
  for (const id of toastLife.keys()) armToast(id);
}

/* -------------------------------------------------------------- tasks */

/**
 * Something a click started that takes a moment (a file read, a content
 * part fetched), so the click is never a silent no-op.
 *
 *   runTask(key, fn, { label, error, failed })
 *
 * runs `fn()` (a promise). Nothing shows for TASK_DELAY ms; after that
 * state.tasks holds { key, status: "loading", label } and the shell shows
 * it (app/feedback.jsx TaskNotice). When fn rejects — or resolves with a
 * value that `failed(value)` calls a failure — the entry becomes { key,
 * status: "error", message: error, retry }, and Retry runs the task again;
 * a success removes the entry. Resolves with fn's value, or undefined
 * after a failure (it never rejects). A view can draw a task's state in
 * place instead: taskOf(key).
 */
export const TASK_DELAY = 300;

export function taskOf(key) {
  return state.tasks.find((x) => x.key === key) || null;
}

function setTask(key, entry) {
  update((s) => {
    const rest = s.tasks.filter((x) => x.key !== key);
    s.tasks = entry ? [...rest, { key, ...entry }] : rest;
  });
}

export function dismissTask(key) {
  if (taskOf(key)) setTask(key, null);
}

/** Tasks that failed are forgotten when the player moves on. */
export function clearTaskErrors() {
  if (state.tasks.some((x) => x.status === "error")) update((s) => (s.tasks = s.tasks.filter((x) => x.status !== "error")));
}

const taskRuns = new Map();
export function runTask(key, fn, opts = {}) {
  const { label = "", error = "", failed = () => false, delay = TASK_DELAY } = opts;
  const run = {};
  taskRuns.set(key, run);
  const mine = () => taskRuns.get(key) === run;
  // A retry starts clean: its earlier error goes at once.
  dismissTask(key);
  const timer = setTimeout(() => mine() && setTask(key, { status: "loading", label }), delay);
  const fail = (e) => {
    clearTimeout(timer);
    if (e) console.warn(`task ${key}:`, e);
    if (mine()) setTask(key, { status: "error", label, message: error, retry: () => runTask(key, fn, opts) });
    return undefined;
  };
  let p;
  try {
    p = Promise.resolve(fn());
  } catch (e) {
    p = Promise.reject(e);
  }
  return p.then((value) => {
    if (failed(value)) return fail(null);
    clearTimeout(timer);
    if (mine()) {
      taskRuns.delete(key);
      setTask(key, null);
    }
    return value;
  }, fail);
}

/**
 * Screen-reader announcement (aria-live). The region is cleared first so the
 * same words are spoken again; announcements made within the same moment
 * are spoken together, in order (`first` puts one ahead: a move before the
 * verdict on it). v6 a11y.
 */
let pending = [];
let flushing = 0;
export function announce(text, { first = false } = {}) {
  if (!text) return;
  // Said once: a toast speaks through here too, and its caller may announce the same words itself.
  if (pending.includes(text)) return;
  if (first) pending.unshift(text);
  else pending.push(text);
  if (flushing) return;
  update((s) => {
    s.announce = "";
  });
  flushing = setTimeout(() => {
    flushing = 0;
    const words = pending.join(t("a11y.sentence"));
    pending = [];
    update({ announce: words });
  }, 30);
}
