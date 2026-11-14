/**
 * The board's colours (docs/design.md §5): the one source every drawing of
 * a board reads — the board itself (board.js), thumbnails (thumb.js), the
 * size cards and the empty board of a hero (through the CSS variables this
 * module sets on the root element).
 *
 * There is one board in two styles, each in a light and a dark version:
 *
 *   standard   the honey board; in the dark theme the same wood under a
 *              lamp in a dark room: lower luminance but its warmth and
 *              saturation kept, the light falling off towards the edges,
 *              white stones barely toned down, black stones parting from
 *              the wood by contrast alone (no rim)
 *   contrast   a plain, very legible board: near-white (light) or
 *              near-black (dark), strong lines, flat stones with clear
 *              rims. Chosen in Settings → Board, and used by itself when
 *              the system forces colours (Windows high contrast).
 *
 *   boardPalette({ dark, style })   pure: the palette for a combination
 *   currentPalette()                the palette for the page as it is now
 *   applyBoardTheme({ style })      Settings changed: mark the root element,
 *                                   set the CSS variables, tell listeners
 *   onBoardTheme(fn)                be told when the palette changes
 *                                   (returns the function that stops it)
 *
 * A palette: { key, dark, contrast, base, vignette, line, edge, star, text,
 * shadow, lineScale, sprites, whiteDim, blackRim, stone: { black, white }
 * (each { fill, rim, rimWidth } — rimWidth in cells), onBlack, onWhite
 * (marks and numbers on a stone), tones: { accent, good, bad } (hints,
 * the cursor and marks on the board surface), thumb: { line } }.
 */

const STANDARD_LIGHT = {
  key: "standard-light",
  dark: false,
  contrast: false,
  base: "#E4CB9A",
  vignette: "rgba(70, 44, 12, 0.07)",
  line: "rgba(40, 27, 12, 0.72)",
  edge: "rgba(40, 27, 12, 0.85)",
  star: "rgba(40, 27, 12, 0.85)",
  text: "rgba(74, 52, 26, 0.6)",
  shadow: "rgba(46, 28, 8, 0.3)",
  lineScale: 1,
  sprites: true,
  whiteDim: 0,
  blackRim: null,
  stone: {
    black: { fill: "#1D1D1B", rim: null, rimWidth: 0 },
    white: { fill: "#F7F4EC", rim: "rgba(40, 27, 12, 0.5)", rimWidth: 0.035 },
  },
  onBlack: "#F4EFE4",
  onWhite: "#2A241C",
  tones: { accent: "#34529A", good: "#2E7D4F", bad: "#B3402C" },
  thumb: { line: "rgba(60, 40, 20, 0.42)" },
};

const STANDARD_DARK = {
  ...STANDARD_LIGHT,
  key: "standard-dark",
  dark: true,
  base: "#9E7E4E",
  vignette: "rgba(12, 7, 0, 0.2)",
  line: "rgba(24, 15, 4, 0.76)",
  edge: "rgba(24, 15, 4, 0.88)",
  star: "rgba(24, 15, 4, 0.88)",
  text: "rgba(24, 15, 4, 0.7)",
  shadow: "rgba(10, 6, 0, 0.45)",
  whiteDim: 0.06,
  blackRim: null,
  stone: {
    // The thumbnails keep a faint rim on black: at two pixels a stone the contrast alone is not enough.
    black: { fill: "#131312", rim: "rgba(255, 244, 222, 0.22)", rimWidth: 0.03 },
    white: { fill: "#E0DBCF", rim: "rgba(14, 10, 4, 0.55)", rimWidth: 0.035 },
  },
  onBlack: "#E9E3D6",
  onWhite: "#241F18",
  // On the dim board the signals are light tints: dark ones sink into it.
  tones: { accent: "#D3DEFF", good: "#BDEBCF", bad: "#FFC2B2" },
  thumb: { line: "rgba(22, 15, 6, 0.5)" },
};

const CONTRAST_LIGHT = {
  key: "contrast-light",
  dark: false,
  contrast: true,
  base: "#FBFAF6",
  vignette: "rgba(0, 0, 0, 0)",
  line: "#1B1A17",
  edge: "#1B1A17",
  star: "#1B1A17",
  text: "#3A3835",
  shadow: "rgba(0, 0, 0, 0)",
  lineScale: 1.5,
  sprites: false,
  whiteDim: 0,
  blackRim: null,
  stone: {
    black: { fill: "#111110", rim: "#000000", rimWidth: 0.04 },
    white: { fill: "#FFFFFF", rim: "#111110", rimWidth: 0.07 },
  },
  onBlack: "#FFFFFF",
  onWhite: "#111110",
  tones: { accent: "#27408A", good: "#1F6B40", bad: "#A63420" },
  thumb: { line: "rgba(27, 26, 23, 0.7)" },
};

const CONTRAST_DARK = {
  ...CONTRAST_LIGHT,
  key: "contrast-dark",
  dark: true,
  base: "#0F0F0E",
  line: "#A19E96",
  edge: "#D9D6CE",
  star: "#D9D6CE",
  text: "#C9C6BF",
  stone: {
    black: { fill: "#000000", rim: "#F2F0EA", rimWidth: 0.07 },
    white: { fill: "#F4F2EC", rim: "#F4F2EC", rimWidth: 0.04 },
  },
  onBlack: "#F4F2EC",
  onWhite: "#111110",
  tones: { accent: "#8EA6E0", good: "#6CC08F", bad: "#E58A74" },
  thumb: { line: "rgba(217, 214, 206, 0.6)" },
};

export const BOARD_PALETTES = {
  standard: { light: STANDARD_LIGHT, dark: STANDARD_DARK },
  contrast: { light: CONTRAST_LIGHT, dark: CONTRAST_DARK },
};
export const BOARD_STYLES = Object.keys(BOARD_PALETTES);

/** The palette of a board style ("standard" | "contrast") in the light or dark theme. */
export function boardPalette({ dark = false, style = "standard" } = {}) {
  const set = BOARD_PALETTES[style] || BOARD_PALETTES.standard;
  return dark ? set.dark : set.light;
}

/* ------------------------------------------------------ colour arithmetic */

/** "#RRGGBB" → relative luminance (WCAG), 0…1. */
export function luminance(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** The WCAG contrast ratio of two luminances (or two "#RRGGBB" colours). */
export function contrast(a, b) {
  const la = typeof a === "number" ? a : luminance(a);
  const lb = typeof b === "number" ? b : luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ------------------------------------------------------------- the page */

const listeners = new Set();
let watching = false;

function forcedColors() {
  try {
    return typeof matchMedia === "function" && matchMedia("(forced-colors: active)").matches;
  } catch (_) {
    return false;
  }
}

/** The palette for the page as it is: its theme, the chosen style, forced colours. */
export function currentPalette() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const dark = root?.dataset?.theme === "dark";
  const style = root?.dataset?.board === "contrast" || forcedColors() ? "contrast" : "standard";
  return boardPalette({ dark, style });
}

function notify() {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (_) {
      /* a listener that fails does not stop the others */
    }
  }
}

/**
 * The board style or the theme changed (app/ctl-core.js applyAppearance,
 * after it set data-theme): mark the root element, give CSS the surface
 * colours, and redraw what listens.
 */
export function applyBoardTheme({ style = "standard" } = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return;
  if (root.dataset) root.dataset.board = style === "contrast" ? "contrast" : "standard";
  const p = currentPalette();
  const set = (name, value) => root.style?.setProperty?.(name, value);
  set("--board", p.base);
  set("--thumb-board", p.base);
  set("--thumb-line", p.thumb.line);
  set("--stone-black", p.stone.black.fill);
  set("--stone-white", p.stone.white.fill);
  set("--stone-rim", (p.dark ? p.stone.black.rim : p.stone.white.rim) || "transparent");
  notify();
}

/** Call `fn` whenever the palette may have changed. Returns the unsubscribe. */
export function onBoardTheme(fn) {
  listeners.add(fn);
  if (!watching && typeof matchMedia === "function") {
    watching = true;
    try {
      // The system turned forced colours on or off while the app is open.
      matchMedia("(forced-colors: active)").addEventListener?.("change", () => {
        const root = document.documentElement;
        applyBoardTheme({ style: root.dataset.board });
      });
    } catch (_) {
      /* no media queries: the palette follows Settings only */
    }
  }
  return () => listeners.delete(fn);
}
