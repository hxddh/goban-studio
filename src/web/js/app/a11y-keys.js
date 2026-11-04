/**
 * v6 accessibility: keyboard conventions the views share.
 *
 *  - Radio groups (segmented controls, the language grid, board swatches,
 *    filter chips, new-game choices): ← → ↑ ↓ move to the next option and
 *    choose it, as the platform's own radio buttons do. Runs in the capture
 *    phase so the arrows do not also step through a game in review.
 *  - Larger text: ⌘= / Ctrl+= turns it on, ⌘− / Ctrl+− back to normal.
 */
import { state } from "./store.js";
import { setSetting } from "./ctl-core.js";

const NEXT = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function radioKeys(e) {
  const d = NEXT[e.key];
  if (!d || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  const el = e.target;
  if (!el?.matches?.("[role=radio]")) return;
  const group = el.closest("[role=radiogroup]");
  if (!group) return;
  const items = [...group.querySelectorAll("[role=radio]")].filter((b) => !b.disabled && b.closest("[role=radiogroup]") === group);
  const i = items.indexOf(el);
  if (i < 0 || items.length < 2) return;
  e.preventDefault();
  e.stopPropagation();
  const next = items[(i + d + items.length) % items.length];
  next.focus();
  next.click();
}

/** ⌘= / ⌘− (Ctrl on Windows). Returns true when it handled the key. */
export function textSizeKeys(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  if (e.key === "=" || e.key === "+") {
    e.preventDefault();
    if (!state.settings.largeText) setSetting("largeText", true);
    return true;
  }
  if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    if (state.settings.largeText) setSetting("largeText", false);
    return true;
  }
  return false;
}

export function installKeys() {
  document.addEventListener("keydown", radioKeys, true);
}
