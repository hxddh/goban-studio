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
  space: "play", // play | learn (docs/v9.md, "Two spaces")
  playMode: "game", // game | review
  settings: null, // data/settings.js
  profile: null, // the one player model (model/player.js), stored as profile.json
  engine: { kind: "offline", name: "", available: false },
  sheet: null, // null | { kind, ...props }
  menu: null, // open popover id
  toasts: [],
  announce: "",
  game: null, // the game on the board (app/play-ctl.js)
  review: null,
  report: null, // the report page (app/report-ctl.js), opened from a game
  // Play: view "home" (the game in progress or the suggested game, the
  // history, the classics, the explorer) or "game" (the board); tab, kind
  // and query belong to the home's lists; explorer is the opening explorer.
  play: { view: "home", tab: "mine", kind: "all", query: "" },
  // Learn: view "home" (the path) or one of its pages (catalog,
  // lesson, problem, topic, mistake, capture, dailyDone); daily is today's session.
  learn: { view: "home", topic: null, lesson: null, problem: null, daily: null },
  models: initialModels(), // optional downloads (app/models-ctl.js)
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

export function useAppState() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state;
}

let toastId = 0;
/**
 * A short message. With `key`, a toast of that key already on screen is
 * not shown again (a burst of failed writes is one toast).
 */
export function toast(message, tone = "info", ms = 2600, { key = null } = {}) {
  if (key && state.toasts.some((x) => x.key === key)) return;
  const id = ++toastId;
  update((s) => {
    s.toasts = [...s.toasts, { id, message, tone, key }];
  });
  setTimeout(() => {
    update((s) => {
      s.toasts = s.toasts.filter((t) => t.id !== id);
    });
  }, ms);
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
