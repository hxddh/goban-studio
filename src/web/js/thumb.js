/**
 * Board thumbnails: one renderer for every small board in the app — the
 * Library and Today rows (40 px), the heroes (96 px), the review chart's
 * hover (76 px), the practice path's problem tiles (32 px). The components
 * are app/parts.jsx <Thumb> and <DiagramThumb>; their props did not change.
 *
 *   thumbPlan(cols, rows, pxDev)      pure: what to draw at this size
 *   drawThumb(ctx, spec, plan, pal)   draw one onto a 2D context
 *   thumbCanvas(spec, cssPx, dpr)     a cached canvas, drawn once per
 *                                     (position, size, dpr, palette)
 *
 * A spec is { cols, rows, at(x, y) → "b" | "w" | null }; fromString and
 * fromDiagram make one from the two notations the app stores.
 *
 * What is drawn follows the cell size in device pixels, not the board
 * size, so a 19×19 at 40 px stays readable:
 *
 * - Cells are whole device pixels (the board is centred in what is left),
 *   and lines sit on pixel centres: nothing is blurred by a fractional
 *   position.
 * - Grid lines are one device pixel; under GRID_MIN px a cell they would
 *   be most of the picture, so they are dropped. Star points appear from
 *   STAR_MIN px.
 * - Stones are flat discs that fill their cell (whole-pixel squares under
 *   GRID_MIN px a cell, where a disc would be a blur). A white stone gets
 *   a hairline rim (never thinner than RIM_MIN device px) drawn *around*
 *   it, so the stone keeps its size and still parts from the board at two
 *   pixels a cell; a black stone gets a light one on the dark boards.
 *
 * Colours come from theme.js, so thumbnails follow the theme and the
 * board style like the board itself.
 */
import { currentPalette } from "./theme.js";

/** Cell sizes (device px) from which the grid and the star points are drawn. */
export const GRID_MIN = 4;
export const STAR_MIN = 8;
/** The thinnest rim, in device px. */
export const RIM_MIN = 0.75;

const STARS = { 19: [3, 9, 15], 13: [3, 6, 9], 9: [2, 4, 6] };

/**
 * What to draw for a cols × rows position on a square of `pxDev` device
 * pixels: { cell, ox, oy, grid, stars, starR, square, stoneR, rim, lineOffset }.
 */
export function thumbPlan(cols, rows, pxDev) {
  const n = Math.max(1, cols, rows);
  const size = Math.max(1, Math.floor(pxDev));
  const cell = Math.max(1, Math.floor(size / n));
  const ox = Math.floor((size - cell * cols) / 2);
  const oy = Math.floor((size - cell * rows) / 2);
  const grid = cell >= GRID_MIN;
  return {
    cell,
    ox,
    oy,
    grid,
    // Only a whole board has star points to show.
    stars: cell >= STAR_MIN && cols === rows && !!STARS[cols],
    starR: Math.max(1.25, cell * 0.12),
    // Too small for a round stone: a crisp square of the whole cell.
    square: !grid,
    // A little air between stones once there is room for it.
    stoneR: cell / 2 - (cell >= 8 ? 0.5 : 0),
    rim: Math.max(RIM_MIN, Math.min(1.5, cell * 0.07)),
    // A one-pixel line is crisp on a pixel centre.
    lineOffset: Math.floor(cell / 2) + 0.5,
  };
}

/** A spec from the history's notation: one character per point, "b", "w" or ".". */
export function fromString(thumb, size) {
  return { cols: size, rows: size, at: (x, y) => (thumb[y * size + x] === "b" ? "b" : thumb[y * size + x] === "w" ? "w" : null) };
}

/** A spec from a problem diagram: one string per row, X / O stones (solver.js notation). */
export function fromDiagram(diagram) {
  const rows = diagram.map((r) => r.replace(/\s+/g, ""));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return {
    cols,
    rows: rows.length,
    at: (x, y) => {
      const ch = rows[y]?.[x];
      return ch === "X" || ch === "x" ? "b" : ch === "O" || ch === "o" ? "w" : null;
    },
  };
}

/** Draw `spec` on `ctx` (device pixels, origin top-left) following `plan`, in `pal`'s colours. */
export function drawThumb(ctx, spec, plan, pal, pxDev) {
  const { cols, rows } = spec;
  const { cell, ox, oy } = plan;
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, pxDev, pxDev);
  if (plan.grid) {
    ctx.strokeStyle = pal.thumb.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = ox + plan.lineOffset;
    const x1 = ox + (cols - 1) * cell + plan.lineOffset;
    const y0 = oy + plan.lineOffset;
    const y1 = oy + (rows - 1) * cell + plan.lineOffset;
    for (let y = 0; y < rows; y++) {
      ctx.moveTo(x0 - 0.5, y0 + y * cell);
      ctx.lineTo(x1 + 0.5, y0 + y * cell);
    }
    for (let x = 0; x < cols; x++) {
      ctx.moveTo(x0 + x * cell, y0 - 0.5);
      ctx.lineTo(x0 + x * cell, y1 + 0.5);
    }
    ctx.stroke();
  }
  if (plan.stars) {
    ctx.fillStyle = pal.thumb.line;
    for (const a of STARS[cols]) {
      for (const b of STARS[cols]) {
        ctx.beginPath();
        ctx.arc(ox + a * cell + plan.lineOffset, oy + b * cell + plan.lineOffset, plan.starR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const stones = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = spec.at(x, y);
      if (c) stones.push({ c, cx: ox + x * cell + cell / 2, cy: oy + y * cell + cell / 2 });
    }
  }
  // Rims first, as discs a hairline larger than the stones: every stone
  // then covers its neighbours' rims, and none loses size to its own.
  const shape = (s, r) => {
    if (plan.square) return ctx.fillRect(s.cx - r, s.cy - r, r * 2, r * 2);
    ctx.beginPath();
    ctx.arc(s.cx, s.cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const s of stones) {
    const st = s.c === "b" ? pal.stone.black : pal.stone.white;
    if (!st.rim) continue;
    ctx.fillStyle = st.rim;
    shape(s, plan.stoneR + plan.rim);
  }
  for (const s of stones) {
    ctx.fillStyle = (s.c === "b" ? pal.stone.black : pal.stone.white).fill;
    shape(s, plan.stoneR);
  }
}

/* ------------------------------------------------------------- the cache */

const CACHE_MAX = 240;
const cache = new Map();

function specKey(spec) {
  let s = `${spec.cols}x${spec.rows}:`;
  for (let y = 0; y < spec.rows; y++) for (let x = 0; x < spec.cols; x++) s += spec.at(x, y) || ".";
  return s;
}

/**
 * A canvas of cssPx × cssPx css pixels at `dpr` holding the thumbnail, from
 * the cache when the same position was drawn at this size in this palette.
 * The caller draws it onto its own canvas (or uses it as is).
 */
function thumbCanvas(spec, cssPx, dpr = 1, pal = currentPalette()) {
  const pxDev = Math.max(1, Math.round(cssPx * dpr));
  const key = `${pal.key}|${pxDev}|${specKey(spec)}`;
  const hit = cache.get(key);
  if (hit) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const c = document.createElement("canvas");
  c.width = pxDev;
  c.height = pxDev;
  drawThumb(c.getContext("2d"), spec, thumbPlan(spec.cols, spec.rows, pxDev), pal, pxDev);
  cache.set(key, c);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return c;
}

/** Paint a thumbnail into `canvas` at its laid-out size (or `fallbackPx` before layout). */
export function paintThumb(canvas, spec, fallbackPx = 40) {
  if (!canvas || !spec) return;
  const cssPx = Math.round(canvas.clientWidth) || fallbackPx;
  const dpr = Math.min(3, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
  const src = thumbCanvas(spec, cssPx, dpr);
  if (canvas.width !== src.width) canvas.width = src.width;
  if (canvas.height !== src.height) canvas.height = src.height;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, src.width, src.height);
  g.drawImage(src, 0, 0);
}
