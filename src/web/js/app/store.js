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

const listeners = new Set();
let scheduled = false;

export const state = {
  ready: false,
  space: "play", // play | practice | library
  playMode: "game", // game | review
  settings: null,
  progress: null,
  engine: { kind: "offline", name: "", available: false },
  sheet: null, // null | { kind, ...props }
  menu: null, // open popover id
  toasts: [],
  announce: "",
  game: null,
  review: null,
  report: null, // v6 report page (app/report-ctl.js)
  practice: { view: "home", topic: null, lesson: null, problem: null, daily: null },
  library: { tab: "mine", kind: "all", query: "" },
  models: initialModels(), // v5 optional downloads (app/models-ctl.js)
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
export function toast(message, tone = "info", ms = 2600) {
  const id = ++toastId;
  update((s) => {
    s.toasts = [...s.toasts, { id, message, tone }];
  });
  setTimeout(() => {
    update((s) => {
      s.toasts = s.toasts.filter((t) => t.id !== id);
    });
  }, ms);
}

/** Screen-reader announcement (aria-live). */
export function announce(text) {
  update((s) => {
    s.announce = "";
  });
  setTimeout(() => update({ announce: text }), 30);
}
