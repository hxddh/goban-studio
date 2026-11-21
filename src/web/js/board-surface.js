/**
 * The board's surface and grid, by the cell size (docs/review-v14-zh.md
 * §3.3): the grid's strokes, the star points, the last-move ring, the hover
 * preview's edge, the wood, a stone's landing and its finish at small sizes. Pure functions
 * of their arguments, so board.js stays the renderer and these numbers can
 * be tested and tuned in one place.
 */

/**
 * The last-move ring for a cell size (css px): 0.44 × cell across, its line
 * 3.5 % of a cell and never under 1.25 px, so it stays a ring on a small
 * board and a light hairline on a large one (it marks the stone without
 * outweighing it).
 */
export function lastMarkOf(cell) {
  const width = Math.max(1.25, cell * 0.035);
  return { radius: Math.max(width * 1.6, cell * 0.22), width };
}

/**
 * A hover preview: the stone to be played, as a clean flat disc in its own
 * colour (no wood showing through a shaded sprite, which turned it brown),
 * with a clear rim; white also gets a fine outer line so the light disc
 * parts from the wood. A preview, not a stain.
 */
export function drawPreview(ctx, cx, cy, cell, black, base = null) {
  const r = cell * 0.475;
  ctx.save();
  // The wood first, so the grid does not cut through the preview.
  if (base) {
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = black ? "rgba(26, 25, 23, 0.62)" : "rgba(255, 254, 250, 0.8)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = black ? "rgba(20, 18, 14, 0.75)" : "rgba(255, 253, 247, 0.95)";
  ctx.lineWidth = Math.max(1, cell * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  if (!black) {
    ctx.strokeStyle = "rgba(40, 27, 12, 0.35)";
    ctx.lineWidth = Math.max(0.75, cell * 0.012);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The part of the board a problem window shows. A tight window is widened
 * towards the open side to at least MIN_SPAN lines apart, so a corner problem
 * keeps its surroundings and stones stay a natural size instead of filling
 * the frame.
 */
const MIN_SPAN = 8;
export function windowOf(view, size) {
  if (!view) return { x0: 0, y0: 0, x1: size - 1, y1: size - 1 };
  const want = Math.min(size - 1, MIN_SPAN);
  const grow = (a, b) => {
    a = Math.max(0, a);
    b = Math.min(size - 1, b);
    let need = want - (b - a);
    while (need > 0) {
      // Grow evenly, but never past an edge: what one side cannot take goes
      // to the other.
      if (a > 0 && (b >= size - 1 || (need & 1) === 0)) a--;
      else if (b < size - 1) b++;
      else break;
      need--;
    }
    return [a, b];
  };
  const [x0, x1] = grow(view.x0, view.x1);
  const [y0, y1] = grow(view.y0, view.y1);
  return { x0, y0, x1, y1 };
}

/**
 * A traditional board (Settings → Board): its lines are about 22 mm apart
 * across and 23.7 mm down, so that seen from the player's seat its squares
 * look square. Only a whole board; a problem window stays square.
 */
export const TALL_RATIO = 1.07;
export function gridRatioOf(model) {
  return model?.tall && !model.view ? TALL_RATIO : 1;
}

/**
 * Width / height of the board frame for a model: 1 for a whole board (a
 * little less for a traditional one), the window's own proportion
 * (clamped) for a problem window.
 */
export function frameAspect(model) {
  const v0 = model?.view;
  if (!v0) {
    const n = (model?.size || 19) - 1;
    const m = model?.showCoords ? 2.5 : 1.6;
    return (n + m) / (n * gridRatioOf(model) + m);
  }
  const v = windowOf(v0, model.size || 19);
  const m = model.showCoords ? 2.5 : 1.6;
  const r = (v.x1 - v.x0 + m) / (v.y1 - v.y0 + m);
  return Math.max(0.6, Math.min(1.7, r));
}
/**
 * Grid strokes for a cell size (css px) and device pixel ratio, in whole
 * device pixels: the inner line is 2.2 % of a cell, at least 1 css px and
 * at most 1.5 (a 19×19 board keeps a line that holds its stones; a 9×9 one
 * does not turn heavy); the edge is twice the inner line. `scale` is the
 * palette's lineScale (the high-contrast board).
 */
export function gridStrokesOf(cell, dpr = 1, scale = 1) {
  const css = Math.min(1.5, Math.max(1, cell * 0.022)) * scale;
  const line = Math.max(1, Math.round(css * dpr));
  return { line, edge: Math.max(line + 1, line * 2) };
}

/** A star point's radius (css px): 8.5 % of a cell, from 2.5 to 5 px. */
export function starRadiusOf(cell) {
  return Math.min(5, Math.max(2.5, cell * 0.085));
}

/** A small deterministic generator (mulberry32) for the wood. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The wood, drawn once per size into the cached surface: broad, soft bands
 * of slightly darker and lighter wood across the board, a few per cent of
 * the base colour. No fine grain lines: running alongside the grid they
 * read as extra lines, and the grid and the stones are what a player reads.
 * Seeded: the same board every time.
 */
export function drawWood(g, w, h, theme) {
  const rnd = seeded(0x60ba);
  const ink = theme.dark ? "40, 24, 6" : "112, 70, 24";
  const light = "255, 246, 226";
  // Broad bands, a few board-widths of variation, their edges blurred.
  for (let x = 0; x < w; ) {
    const bw = 30 + rnd() * 90;
    const dark = rnd() < 0.5;
    const a = (0.012 + rnd() * 0.026) * (dark ? 1 : 0.7);
    const grad = g.createLinearGradient(x, 0, x + bw, 0);
    const c = `rgba(${dark ? ink : light}, `;
    grad.addColorStop(0, c + "0)");
    grad.addColorStop(0.5, c + a.toFixed(3) + ")");
    grad.addColorStop(1, c + "0)");
    g.fillStyle = grad;
    g.fillRect(x, 0, bw, h);
    x += bw * 0.6;
  }
}

/**
 * How high a stone being placed still is, from the share `t` of the landing
 * time that has passed: 1 in the air, 0 on the board, easing out (it comes
 * down fast and settles), never below the board.
 */
export function liftOf(t) {
  const u = Math.min(1, Math.max(0, t));
  return Math.pow(1 - u, 3);
}

/**
 * A stone's finish for its size on screen (`device` = its diameter in
 * device pixels). The sprites are drawn at 256 px; shrunk to a 19×19 cell
 * the white stone's shell lines turn into noise and the black stone's broad
 * highlight disappears. Below about 80 device pixels a soft glaze calms the
 * white face (its rim shading stays), and black gets back a faint highlight
 * towards the light (top left). Nothing is added at large sizes.
 */
export function finishStone(ctx, cx, cy, r, black, device) {
  const k = Math.min(1, Math.max(0, (80 - device) / 40));
  if (k <= 0) return;
  const g = black
    ? ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.42, 0, cx - r * 0.35, cy - r * 0.42, r * 0.7)
    : ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.12, 0, cx, cy, r * 0.86);
  if (black) {
    g.addColorStop(0, `rgba(150, 150, 146, ${(0.2 * k).toFixed(3)})`);
    g.addColorStop(1, "rgba(150, 150, 146, 0)");
  } else {
    g.addColorStop(0, `rgba(250, 249, 245, ${(0.55 * k).toFixed(3)})`);
    g.addColorStop(0.7, `rgba(246, 244, 238, ${(0.35 * k).toFixed(3)})`);
    g.addColorStop(1, "rgba(246, 244, 238, 0)");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The board's edge, so it reads as a block of wood rather than a card: a
 * light line where the top and left faces catch the light, a slightly
 * darker band along the bottom and right. Only on a whole board (a problem
 * window shows part of one and has no edge of its own).
 */
export function drawBoardEdge(g, w, h, theme) {
  // Quiet: a hairline of light and of shade, so the board reads as wood
  // and not as a lit plastic panel.
  const light = "rgba(255, 250, 236, 0.3)";
  const shade = theme.dark ? "rgba(30, 16, 2, 0.18)" : "rgba(90, 56, 18, 0.1)";
  g.fillStyle = light;
  g.fillRect(0, 0, w, 1);
  g.fillRect(0, 0, 1, h);
  g.fillStyle = shade;
  g.fillRect(0, h - 2, w, 2);
  g.fillRect(w - 2, 0, 2, h);
}
