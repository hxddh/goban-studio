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
 * The edge of a hover preview (a stone at its point, drawn light): a clear
 * rim in the stone's own colour, and for white a fine outer line so the
 * light disc still parts from the wood. A preview, not a stain.
 */
export function drawPreviewEdge(ctx, cx, cy, cell, black) {
  const r = cell * 0.475;
  ctx.strokeStyle = black ? "rgba(20, 18, 14, 0.7)" : "rgba(255, 253, 247, 0.95)";
  ctx.lineWidth = Math.max(1, cell * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  if (black) return;
  ctx.strokeStyle = "rgba(40, 27, 12, 0.35)";
  ctx.lineWidth = Math.max(0.75, cell * 0.012);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
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
 * Straight-grained wood (masame), drawn once per size into the cached
 * surface: broad bands of slightly darker and lighter wood, then fine
 * grain lines that run top to bottom and drift a little sideways. All of
 * it within a few per cent of the base colour, so the grid and the
 * stones stay what the eye reads first. Seeded: the same board every time.
 */
export function drawWood(g, w, h, theme) {
  const rnd = seeded(0x60ba);
  const ink = theme.dark ? "28, 16, 4" : "112, 70, 24";
  const light = theme.dark ? "255, 236, 200" : "255, 246, 226";
  // A quiet grain: felt more than seen. The lamp-lit dark board carries a
  // little more of it, so the wood still reads at its lower luminance.
  const k = theme.dark ? 0.5 : 0.55;
  // Broad bands, a few board-widths of variation.
  for (let x = 0; x < w; ) {
    const bw = 18 + rnd() * 70;
    const dark = rnd() < 0.5;
    g.fillStyle = `rgba(${dark ? ink : light}, ${((0.015 + rnd() * 0.035) * k * (dark ? 1 : 0.7)).toFixed(3)})`;
    g.fillRect(x, 0, bw, h);
    x += bw;
  }
  // Fine grain: thin wavering lines, denser in places, as in quarter-sawn wood.
  const step = 4;
  for (let x = rnd() * 3; x < w; x += 1.2 + rnd() * rnd() * 9) {
    const a = (0.025 + rnd() * rnd() * 0.11) * k;
    const lw = 0.4 + rnd() * rnd() * 1.4;
    const amp = 0.6 + rnd() * 2.2;
    const freq = (0.6 + rnd() * 1.8) / h;
    const phase = rnd() * Math.PI * 2;
    const drift = (rnd() - 0.5) * 6;
    g.strokeStyle = `rgba(${ink}, ${a.toFixed(3)})`;
    g.lineWidth = lw;
    g.beginPath();
    for (let y = -step; y <= h + step; y += step) {
      const xx = x + drift * (y / h) + amp * Math.sin(phase + y * freq * Math.PI * 2);
      if (y === -step) g.moveTo(xx, y);
      else g.lineTo(xx, y);
    }
    g.stroke();
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
  const light = theme.dark ? "rgba(255, 236, 200, 0.12)" : "rgba(255, 252, 240, 0.55)";
  const shade = theme.dark ? "rgba(0, 0, 0, 0.28)" : "rgba(90, 56, 18, 0.16)";
  g.fillStyle = light;
  g.fillRect(0, 0, w, 1);
  g.fillRect(0, 0, 1, h);
  g.fillStyle = shade;
  g.fillRect(0, h - 2, w, 2);
  g.fillRect(w - 2, 0, 2, h);
}
