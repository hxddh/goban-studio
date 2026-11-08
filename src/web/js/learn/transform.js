/**
 * v13: problems shown again are turned, mirrored and sometimes recoloured,
 * so a review asks for the idea rather than the remembered picture
 * (docs/plan.md, "Review").
 *
 * A transform is { sym, swap }: one of the eight board symmetries (sym
 * 0–7, 0 the problem as written) and whether the colours are swapped
 * (White to play). It is applied to the problem's definition, before the
 * solver sees it: the diagram (and so the setup, the region, the key
 * stones and the window the board frames), its placement on the board,
 * the endgame answer points, and the colour words of the title and hint
 * in all four languages. The solver then proves and answers the
 * transformed problem like any other (scripts/tests/learn-transform.mjs
 * checks the whole bank). The id stays the same, so progress is kept per
 * problem whatever it looks like.
 *
 * Endgame problems are never recoloured: the counting mode has Black move
 * first. Their values do not change under a symmetry.
 */

export const SYMMETRIES = 8;
export const IDENTITY = Object.freeze({ sym: 0, swap: false });

/** Board point (x, y) under symmetry `sym` on a `size` board. */
export function mapPoint(x, y, size, sym) {
  const n = size - 1;
  switch (sym & 7) {
    case 1:
      return { x: n - x, y };
    case 2:
      return { x, y: n - y };
    case 3:
      return { x: n - x, y: n - y };
    case 4:
      return { x: y, y: x };
    case 5:
      return { x: n - y, y: x };
    case 6:
      return { x: y, y: n - x };
    case 7:
      return { x: n - y, y: n - x };
    default:
      return { x, y };
  }
}

const SWAP_CHAR = { X: "O", O: "X", x: "o", o: "x" };

/** Where a problem's diagram sits: { x0, y0, w, h, grid } (rows padded with ','). */
function placed(def) {
  const size = def.size || 19;
  const grid = def.diagram.map((r) => r.replace(/\s+/g, "").split(""));
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  for (const row of grid) while (row.length < w) row.push(",");
  let x0 = 0;
  let y0 = 0;
  if (def.at) [x0, y0] = def.at;
  else {
    const corner = def.corner || "tl";
    if (corner.includes("r")) x0 = size - w;
    if (corner.includes("b")) y0 = size - h;
  }
  return { size, x0, y0, w, h, grid };
}

/*
 * Colour words of problem titles and hints, per language. Each pair is
 * swapped in one pass, so "Black … White" becomes "White … Black". The
 * Korean words take the same particles (both end in ㄱ), so no particle
 * changes; the Chinese and Japanese words appear in the problem texts only
 * as colours (白棋, 白子, 白石, 白地, 白先 …), which the transform test
 * checks for every text in the bank.
 */
const COLOUR_WORDS = {
  zh: [["黑", "白"]],
  ja: [["黒", "白"]],
  ko: [["흑", "백"]],
  en: [
    ["Black", "White"],
    ["black", "white"],
    ["BLACK", "WHITE"],
  ],
};

/** Swap the colour words of one text in language `lang`. */
export function swapColourText(text, lang) {
  const pairs = COLOUR_WORDS[lang] || COLOUR_WORDS.en;
  if (typeof text !== "string") return text;
  const map = new Map();
  for (const [a, b] of pairs) {
    map.set(a, b);
    map.set(b, a);
  }
  const words = [...map.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = lang === "en" || !COLOUR_WORDS[lang] ? new RegExp(`\\b(${words.join("|")})\\b`, "g") : new RegExp(`(${words.join("|")})`, "g");
  return text.replace(re, (w) => map.get(w));
}

/** A four-language text ({ zh, en, ko, ja }) with its colour words swapped. */
export function swapColourTexts(texts) {
  if (!texts || typeof texts !== "object") return texts;
  const out = {};
  for (const [lang, text] of Object.entries(texts)) out[lang] = swapColourText(text, lang);
  return out;
}

/** Whether a problem may be shown with colours swapped (not endgame problems). */
export const canSwap = (def) => def?.goal !== "endgame";

/*
 * Problems the solver does not treat alike in every orientation, found by
 * `node scripts/check-transforms.mjs --all-syms` (every symmetry of every
 * problem): only the symmetries listed are used. capture-ladder-01
 * exceeds the first-move search's node budget in two orientations; colour
 * swap is safe. (life-vital-20 was listed until v13 fixed the solver's
 * transposition table, which had proved it differently by orientation.)
 */
const ONLY_SYMS = {
  "capture-ladder-01": [0, 1, 2, 3, 4, 6],
};

/** The symmetries a problem may be shown in. */
export function allowedSyms(def) {
  return ONLY_SYMS[def?.id] || [0, 1, 2, 3, 4, 5, 6, 7];
}

/**
 * The problem definition under `t` = { sym, swap }: a new object with the
 * same id. The identity returns `def` itself.
 */
export function transformProblem(def, t = IDENTITY) {
  const sym = (t?.sym ?? 0) & 7;
  const swap = !!t?.swap && canSwap(def);
  if (!sym && !swap) return def;
  const { size, x0, y0, w, h, grid } = placed(def);
  const corners = [mapPoint(x0, y0, size, sym), mapPoint(x0 + w - 1, y0 + h - 1, size, sym)];
  const nx0 = Math.min(corners[0].x, corners[1].x);
  const ny0 = Math.min(corners[0].y, corners[1].y);
  const tr = sym >= 4;
  const nw = tr ? h : w;
  const nh = tr ? w : h;
  const out = Array.from({ length: nh }, () => new Array(nw).fill(","));
  const local = (dx, dy) => {
    const p = mapPoint(x0 + dx, y0 + dy, size, sym);
    return { x: p.x - nx0, y: p.y - ny0 };
  };
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ch = grid[dy][dx];
      const p = local(dx, dy);
      out[p.y][p.x] = swap ? SWAP_CHAR[ch] || ch : ch;
    }
  }
  const next = { ...def, diagram: out.map((r) => r.join(" ")), at: [nx0, ny0], shown: { sym, swap } };
  delete next.corner;
  if (Array.isArray(def.answer)) next.answer = def.answer.map((a) => local(a.x, a.y));
  if (swap) {
    if (def.toMove === 1 || def.toMove === -1) next.toMove = -def.toMove;
    if (def.title) next.title = swapColourTexts(def.title);
    if (def.hint) next.hint = swapColourTexts(def.hint);
  }
  return next;
}

/** A board point of the problem as written → the same point of the transformed problem. */
export function mapProblemPoint(def, t, x, y) {
  return mapPoint(x, y, def.size || 19, (t?.sym ?? 0) & 7);
}

/** A small string hash (FNV-1a), for reproducible choices. */
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The transform for one showing of a problem: the problem as written the
 * first time (`tries` 0, so lessons and the catalogue match what was
 * taught), then a symmetry and, half the time, swapped colours, chosen
 * from the id and how often it was tried, so the same review looks the
 * same after a restart and different the next time it comes back.
 */
export function reviewTransform(def, tries = 0) {
  if (!def || !(tries > 0)) return IDENTITY;
  const h = hash(`${def.id}:${tries}`);
  const syms = allowedSyms(def);
  let sym = syms[h % syms.length];
  let swap = canSwap(def) && ((h >>> 3) & 1) === 1;
  // A review never looks just like the problem as written.
  if (!sym && !swap) {
    if (syms.length > 1) sym = syms[1 + ((h >>> 4) % (syms.length - 1))];
    else swap = canSwap(def);
  }
  return { sym, swap };
}
