/**
 * The keyboard shortcuts, once: the key handler (app.jsx) matches a key
 * press against this table, the native menu bar takes its keys from it,
 * and the shortcuts sheet (sheets.jsx) lists it. A shortcut added here
 * works, shows in the menu and is documented; none can be in one place and
 * not the others.
 *
 * Each entry is ⌘/Ctrl + `key` (with ⇧ when `shift`), runs `command`
 * (app.jsx COMMANDS) and is named by the string `label`.
 *
 *   when   "always"   also with a sheet open or while typing
 *          "noSheet"  not with a sheet open
 *          "idle"     not with a sheet open, and not while typing in a field
 *   group  entries of one group are one row of the sheet (⌘1 – 4)
 */
export const SHORTCUTS = [
  { command: "file.new", key: "n", label: "common.newGame", when: "always" },
  { command: "file.import", key: "o", label: "library.import", when: "always" },
  { command: "game.save", key: "s", label: "play.save", when: "idle" },
  { command: "file.export", key: "e", shift: true, label: "common.exportSgf", when: "idle" },
  { command: "game.undo", key: "z", label: "common.undo", when: "idle" },
  { command: "game.redo", key: "z", shift: true, label: "common.redo", when: "idle" },
  { command: "game.pass", key: "p", shift: true, label: "common.pass", when: "idle" },
  { command: "game.hint", key: "h", shift: true, label: "common.hint", when: "idle" },
  { command: "game.review", key: "r", shift: true, label: "play.reviewSoFar", when: "idle" },
  { command: "view.focus", key: ".", label: "play.focus", when: "noSheet" },
  { command: "app.settings", key: ",", label: "nav.settings", when: "always" },
  { command: "go.today", key: "1", label: "nav.today", when: "noSheet", group: "spaces" },
  { command: "go.play", key: "2", label: "nav.play", when: "noSheet", group: "spaces" },
  { command: "go.learn", key: "3", label: "nav.learn", when: "noSheet", group: "spaces" },
  { command: "go.library", key: "4", label: "nav.library", when: "noSheet", group: "spaces" },
  { command: "go.back", key: "[", label: "shortcuts.history", when: "always", group: "history" },
  { command: "go.forward", key: "]", label: "shortcuts.history", when: "always", group: "history" },
  // ⌘? is ⌘⇧/ on most layouts: either opens the sheet.
  { command: "help.shortcuts", key: "/", alias: "?", anyShift: true, label: "shortcuts.title", when: "always" },
];

/**
 * Keys without ⌘/Ctrl, which depend on what is on screen (app.jsx onKeyDown
 * and the board's own keys, announcer.js); listed in the sheet after the
 * table above.
 */
export const PLAIN_KEYS = [
  { keys: "← →", label: "shortcuts.browse" },
  { keys: "Enter", label: "shortcuts.continue" },
  { keys: "Tab · ↑↓←→ · Space", label: "shortcuts.board" },
  { keys: "Esc", label: "shortcuts.close" },
];

/**
 * The shortcut a key press means, or null. `e` is a keydown with ⌘ or Ctrl
 * held (and no Alt); `sheet`: a sheet is open; `typing`: the focus is in a
 * text field.
 */
export function matchShortcut(e, { sheet = false, typing = false } = {}) {
  const k = String(e.key || "").toLowerCase();
  for (const sc of SHORTCUTS) {
    if (k !== sc.key && k !== sc.alias) continue;
    if (!sc.anyShift && !!e.shiftKey !== !!sc.shift) continue;
    if (sc.when !== "always" && sheet) return null;
    if (sc.when === "idle" && typing) return null;
    return sc;
  }
  return null;
}

/** The shortcut that runs `command`, or null. */
export function shortcutFor(command) {
  return SHORTCUTS.find((sc) => sc.command === command) || null;
}

/** `{ key, shift }` for a native menu item of `command` ({} when it has no shortcut). */
export function menuKey(command) {
  const sc = shortcutFor(command);
  if (!sc) return {};
  return sc.shift ? { key: sc.key, shift: true } : { key: sc.key };
}

/** How a shortcut is written: "⇧⌘P", "Ctrl+N". `mod` and `shift` are the platform's (parts.jsx MOD, SHIFT). */
export function keyText(sc, mod, shift) {
  return `${sc.shift ? shift : ""}${mod}${sc.key.toUpperCase()}`;
}

/**
 * The sheet's rows, [keys, text], in table order: one row per shortcut,
 * one per group ("⌘1 – 4" with every name, "⌘[  ⌘]"), then the plain keys.
 */
export function shortcutRows({ mod, shift, t }) {
  const rows = [];
  const done = new Set();
  for (const sc of SHORTCUTS) {
    if (!sc.group) {
      rows.push([keyText(sc, mod, shift), t(sc.label)]);
      continue;
    }
    if (done.has(sc.group)) continue;
    done.add(sc.group);
    const all = SHORTCUTS.filter((x) => x.group === sc.group);
    const digits = all.every((x) => /^\d$/.test(x.key));
    const keys = digits ? `${mod}${all[0].key} – ${all[all.length - 1].key}` : all.map((x) => keyText(x, mod, shift)).join("  ");
    const names = [...new Set(all.map((x) => t(x.label)))];
    rows.push([keys, names.join(" / ")]);
  }
  for (const p of PLAIN_KEYS) rows.push([p.keys, t(p.label)]);
  return rows;
}
