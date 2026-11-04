/**
 * Go board canvas.
 *
 * Intersections, not squares. The renderer is pure view: it reads a model
 * (sign map, last move, marks, overlays) and never touches the rules. Hit
 * testing rounds to the nearest intersection; the caller decides whether the
 * point is legal.
 *
 * v2 details: coordinates sit outside the grid; a `view` window zooms to a
 * corner or side (problems), with lines running off the open edges so the
 * window still reads as part of a full board; stones sit slightly off-grid
 * with a contact shadow; a new stone settles in ~120 ms and captured stones
 * fade out; the last move is a small dot; a keyboard cursor makes the board
 * playable without a pointer.
 */
import { BLACK, WHITE, LETTERS, starPoints } from "./rules.js";
import { loadMaterials, stoneVariant, surfaceFor } from "./materials.js";

/**
 * v4 materials (docs/design.md §5): a calm plain board by default, a wood
 * board whose grain is a whisper (the kaya texture at 25 %), and an ink
 * board for dark rooms. Line colours are ink at ~70 %, never pure black.
 */
export const MATERIALS = {
  plain: {
    base: "#E4CB9A",
    vignette: "rgba(70, 44, 12, 0.07)",
    line: "rgba(40, 27, 12, 0.72)",
    edge: "rgba(40, 27, 12, 0.85)",
    star: "rgba(40, 27, 12, 0.85)",
    text: "rgba(74, 52, 26, 0.6)",
    shadow: "rgba(46, 28, 8, 0.3)",
  },
  wood: {
    base: "#E2C795",
    texture: "kaya",
    textureAlpha: 0.25,
    vignette: "rgba(70, 44, 12, 0.07)",
    line: "rgba(40, 27, 12, 0.74)",
    edge: "rgba(40, 27, 12, 0.86)",
    star: "rgba(40, 27, 12, 0.86)",
    text: "rgba(74, 52, 26, 0.62)",
    shadow: "rgba(46, 28, 8, 0.3)",
  },
  ink: {
    base: "#2D2E2C",
    vignette: "rgba(0, 0, 0, 0.22)",
    line: "rgba(232, 228, 218, 0.34)",
    edge: "rgba(232, 228, 218, 0.52)",
    star: "rgba(232, 228, 218, 0.62)",
    text: "rgba(232, 228, 218, 0.46)",
    shadow: "rgba(0, 0, 0, 0.5)",
  },
};

/** v3 names still found in saved settings or callers. */
const MATERIAL_V3 = { kaya: "plain", katsura: "wood", paper: "plain", slate: "ink" };

export function materialName(name) {
  return MATERIALS[name] ? name : MATERIAL_V3[name] || "plain";
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

const DPR_LIMIT = 2;
const wantCellsFor = (m) => (m.showCoords ? 1.25 : 0.8);
const bandFor = (m) => (m.showCoords ? 34 : 14);

/**
 * Width / height of the board frame for a model: 1 for a whole board, the
 * window's own proportion (clamped) for a problem window.
 */
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

export function frameAspect(model) {
  const v0 = model?.view;
  if (!v0) return 1;
  const v = windowOf(v0, model.size || 19);
  const m = model.showCoords ? 2.5 : 1.6;
  const r = (v.x1 - v.x0 + m) / (v.y1 - v.y0 + m);
  return Math.max(0.6, Math.min(1.7, r));
}
/** docs/design.md §4: the accent marks attention; good/bad are signals. */
const ACCENT = "#34529A";
const GOOD = "#2E7D4F";
const BAD = "#B3402C";
const PLACE_MS = 140;
const FADE_MS = 260;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function easeOutBack(t) {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class BoardView {
  constructor(canvas, { onPlay, onHover } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onPlay = onPlay || (() => {});
    this.onHover = onHover || (() => {});
    this.model = {
      size: 19,
      board: null,
      lastMove: null,
      marks: [],
      ownership: null,
      territory: null,
      deadStones: [],
      variation: null,
      moveNumbers: null,
      showCoords: true,
      material: "plain",
      view: null,
      hover: null,
      hoverColor: BLACK,
      hoverValid: true,
      interactive: true,
      cursor: null,
      ghost: null,
    };
    this.geom = null;
    this.dpr = 1;
    this.placing = null;
    this.fading = [];
    this.raf = 0;
    this.grainCache = null;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas);
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerleave", () => {
      if (this.model.hover) {
        this.model.hover = null;
        this.draw();
      }
    });
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.mats = null;
    loadMaterials().then((m) => {
      this.mats = m;
      this.grainCache = null;
      this.draw();
    });
    this.resize();
  }

  /** Colours for the current material. */
  theme() {
    return MATERIALS[materialName(this.model.material)];
  }

  destroy() {
    this._resizeObserver.disconnect();
    cancelAnimationFrame(this.raf);
  }

  /** Board text follows the interface font (per language, docs/design.md §2). */
  readFont() {
    this.font = (typeof getComputedStyle === "function" && getComputedStyle(this.canvas).getPropertyValue("--font").trim()) || FONT;
  }

  setModel(patch) {
    this.readFont();
    const hadTerritory = !!this.model.territory;
    const prevBoard = this.model.board;
    const prevSize = this.model.size;
    const wasInteractive = this.model.interactive;
    Object.assign(this.model, patch);
    // A new board size (or problem window) invalidates the keyboard cursor
    // and the hover point: they could now lie off the board.
    if (this.model.size !== prevSize) {
      this.model.cursor = null;
      this.model.hover = null;
    }
    // Only when the board stops taking moves: a board that never did keeps
    // the keyboard cursor, so it can still be read point by point (v6 a11y).
    if (patch.interactive === false && wasInteractive) {
      this.model.hover = null;
      this.model.cursor = null;
    }
    const board = this.model.board;
    if (prevBoard && board && prevSize === this.model.size && prevBoard !== board) {
      const now = performance.now();
      const last = this.model.lastMove;
      let added = 0;
      for (let y = 0; y < board.length; y++) {
        for (let x = 0; x < board.length; x++) {
          const was = prevBoard[y]?.[x] || 0;
          const is = board[y][x];
          if (was && !is) this.fading.push({ x, y, c: was, start: now });
          if (!was && is) added++;
        }
      }
      // Animate a single new stone (a move), not a whole new position, and
      // never when the system asks for reduced motion.
      const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        this.fading = [];
        this.placing = null;
      } else if (added === 1 && last && !last.pass && board[last.y]?.[last.x]) this.placing = { x: last.x, y: last.y, start: now };
      else this.placing = null;
      if (added > 1) this.fading = [];
      if (this.placing || this.fading.length) this.animate();
    }
    // Counting: territory fades in instead of popping.
    if (!hadTerritory && this.model.territory && !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      this.territoryStart = performance.now();
      this.animate();
    }
    this.draw();
  }

  animate() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const now = performance.now();
      if (this.placing && now - this.placing.start > PLACE_MS) this.placing = null;
      this.fading = this.fading.filter((f) => now - f.start < FADE_MS);
      const territoryRunning = this.territoryStart && now - this.territoryStart < 450;
      this.draw();
      if (this.placing || this.fading.length || territoryRunning) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(DPR_LIMIT, (typeof devicePixelRatio === "number" ? devicePixelRatio : 1) || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cssW = w;
    this.cssH = h;
    this.grainCache = null;
    this.draw();
  }

  window() {
    return windowOf(this.model.view, this.model.size);
  }

  geometry() {
    const w = this.cssW || 1;
    const h = this.cssH || 1;
    const win = this.window();
    const cols = win.x1 - win.x0;
    const rows = win.y1 - win.y0;
    // Each axis fits on its own: a problem window may be wider than tall.
    const fit = (len, span) => {
      const a = len / (span + wantCellsFor(this.model) * 2);
      const b = (len - bandFor(this.model) * 2) / (span + 1);
      return Math.max(a, b);
    };
    // Margin in cells: room for coordinates outside the grid, or a quiet
    // border when they are hidden. Clamped so a hidden board stays positive.
    // On a small board the cells are large; the coordinate margin is capped
    // in pixels so the letters stay close to the grid.
    // Margin = min(wantCells × cell, half a stone + a fixed band): on large
    // cells the band (coordinates or a quiet edge) no longer grows with them.
    const wantCells = wantCellsFor(this.model);
    const band = bandFor(this.model);
    if (this.model.view && this.model.showCoords) {
      // v7: a zoomed window with coordinates. The labels on an open side
      // sit past the lines that run off the window, so each side gets its
      // own margin (in cells) and nothing is clipped.
      const size = this.model.size;
      const open = { l: win.x0 > 0, r: win.x1 < size - 1, t: win.y0 > 0, b: win.y1 < size - 1 };
      // Numbers are drawn on the left and letters below the grid.
      const mL = open.l ? 1.75 : wantCells;
      const mR = open.r ? 0.75 : wantCells;
      const mT = open.t ? 0.75 : wantCells;
      const mB = open.b ? 1.75 : wantCells;
      const cell = Math.max(0.001, Math.min(w / (Math.max(1, cols) + mL + mR), h / (Math.max(1, rows) + mT + mB)));
      const ox = (w - (cols + mL + mR) * cell) / 2 + mL * cell - win.x0 * cell;
      const oy = (h - (rows + mT + mB) * cell) / 2 + mT * cell - win.y0 * cell;
      return { w, h, cell, ox, oy, win, marginCells: Math.min(mL, mR, mT, mB) };
    }
    const cell = Math.max(0.001, Math.min(fit(w, Math.max(1, cols)), fit(h, Math.max(1, rows))));
    const marginCells = Math.min(wantCells, 0.5 + band / cell);
    const gridW = cell * cols;
    const gridH = cell * rows;
    const ox = (w - gridW) / 2 - win.x0 * cell;
    const oy = (h - gridH) / 2 - win.y0 * cell;
    return { w, h, cell, ox, oy, win, marginCells };
  }

  pointToVertex(px, py) {
    const g = this.geom || this.geometry();
    const x = Math.round((px - g.ox) / g.cell);
    const y = Math.round((py - g.oy) / g.cell);
    if (x < g.win.x0 || y < g.win.y0 || x > g.win.x1 || y > g.win.y1) return null;
    const dx = px - (g.ox + x * g.cell);
    const dy = py - (g.oy + y * g.cell);
    if (Math.hypot(dx, dy) > g.cell * 0.55) return null;
    return { x, y };
  }

  eventPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onPointerMove(e) {
    if (!this.model.interactive) return;
    const p = this.eventPoint(e);
    const v = this.pointToVertex(p.x, p.y);
    const changed = (this.model.hover?.x ?? null) !== (v?.x ?? null) || (this.model.hover?.y ?? null) !== (v?.y ?? null);
    this.model.hover = v;
    if (changed) {
      this.onHover(v);
      this.draw();
    }
  }

  onPointerDown(e) {
    if (!this.model.interactive) return;
    if (e.button !== undefined && e.button !== 0) return;
    const p = this.eventPoint(e);
    const v = this.pointToVertex(p.x, p.y);
    if (v) this.onPlay(v.x, v.y);
  }

  /** Keyboard: move the cursor inside the visible window. */
  moveCursor(dx, dy) {
    const win = this.window();
    const inside = (p) => p && p.x >= win.x0 && p.x <= win.x1 && p.y >= win.y0 && p.y <= win.y1;
    const c = (inside(this.model.cursor) && this.model.cursor) || { x: Math.round((win.x0 + win.x1) / 2), y: Math.round((win.y0 + win.y1) / 2) };
    this.model.cursor = {
      x: Math.max(win.x0, Math.min(win.x1, c.x + dx)),
      y: Math.max(win.y0, Math.min(win.y1, c.y + dy)),
    };
    this.onHover(this.model.cursor);
    this.draw();
    return this.model.cursor;
  }

  /** The board surface, cached per size and material. */
  grain(theme, w, h) {
    const tex = theme.texture && this.mats ? surfaceFor(this.mats, theme.texture) : null;
    const key = `${materialName(this.model.material)}:${w}x${h}:${this.dpr}:${tex ? "tex" : "flat"}`;
    if (this.grainCache?.key === key) return this.grainCache.canvas;
    const c = document.createElement("canvas");
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    const g = c.getContext("2d");
    g.scale(this.dpr, this.dpr);
    g.fillStyle = theme.base;
    g.fillRect(0, 0, w, h);
    if (tex) {
      // The grain is a whisper: the texture at a quarter strength.
      g.save();
      g.globalAlpha = theme.textureAlpha;
      g.imageSmoothingQuality = "high";
      const side = Math.min(tex.naturalWidth || tex.width, tex.naturalHeight || tex.height);
      g.drawImage(tex, 0, 0, side, side, 0, 0, w, h);
      g.restore();
    }
    // A barely-there falloff from the centre, so the surface is not dead flat.
    const r = Math.hypot(w, h) / 2;
    const v = g.createRadialGradient(w / 2, h / 2, r * 0.35, w / 2, h / 2, r);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, theme.vignette);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    this.grainCache = { key, canvas: c };
    return c;
  }

  draw() {
    if (!this.font) this.readFont();
    const ctx = this.ctx;
    const g = this.geometry();
    this.geom = g;
    const m = this.model;
    const theme = this.theme();
    const { size } = m;
    const { cell, ox, oy, w, h, win } = g;
    const px = (x) => ox + x * cell;
    const py = (y) => oy + y * cell;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.grain(theme, w, h), 0, 0, w, h);

    // Grid. Whole device pixels, snapped so lines never blur; the frame is
    // 1.6× the inner lines. Lines on an open side of a zoomed window run off
    // by half a cell.
    const dpr = this.dpr;
    const lineDev = Math.max(1, Math.round(cell * dpr * 0.02));
    const edgeDev = Math.max(lineDev + 1, Math.round(lineDev * 1.6));
    const snap = (v, wDev) => {
      const off = (wDev % 2) / 2;
      return (Math.round(v * dpr - off) + off) / dpr;
    };
    const ext = (open) => (open ? cell * 0.6 : 0);
    const left = px(win.x0) - ext(win.x0 > 0);
    const right = px(win.x1) + ext(win.x1 < size - 1);
    const top = py(win.y0) - ext(win.y0 > 0);
    const bottom = py(win.y1) + ext(win.y1 < size - 1);
    const isEdgeX = (x) => (x === 0 && win.x0 === 0) || (x === size - 1 && win.x1 === size - 1);
    const isEdgeY = (y) => (y === 0 && win.y0 === 0) || (y === size - 1 && win.y1 === size - 1);
    const stroke = (edge) => {
      const wDev = edge ? edgeDev : lineDev;
      ctx.strokeStyle = edge ? theme.edge : theme.line;
      ctx.lineWidth = wDev / dpr;
      ctx.beginPath();
      for (let x = win.x0; x <= win.x1; x++) {
        if (isEdgeX(x) !== edge) continue;
        const sx = snap(px(x), wDev);
        ctx.moveTo(sx, top);
        ctx.lineTo(sx, bottom);
      }
      for (let y = win.y0; y <= win.y1; y++) {
        if (isEdgeY(y) !== edge) continue;
        const sy = snap(py(y), wDev);
        ctx.moveTo(left, sy);
        ctx.lineTo(right, sy);
      }
      ctx.stroke();
    };
    ctx.lineCap = "square";
    stroke(false);
    stroke(true);
    ctx.lineCap = "butt";

    ctx.fillStyle = theme.star;
    for (const [x, y] of starPoints(size)) {
      if (x < win.x0 || x > win.x1 || y < win.y0 || y > win.y1) continue;
      ctx.beginPath();
      ctx.arc(snap(px(x), lineDev), snap(py(y), lineDev), Math.max(1.5, cell * 0.065), 0, Math.PI * 2);
      ctx.fill();
    }

    if (m.showCoords) {
      ctx.fillStyle = theme.text;
      const fs = Math.max(10, Math.min(13, cell * 0.3));
      ctx.font = `500 ${fs}px ${this.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const gap = Math.min(cell * 0.8, cell * 0.5 + 18);
      for (let x = win.x0; x <= win.x1; x++) {
        ctx.fillText(LETTERS[x], px(x), py(win.y1) + gap + ext(win.y1 < size - 1) * 0.6);
      }
      for (let y = win.y0; y <= win.y1; y++) {
        ctx.fillText(String(size - y), px(win.x0) - gap - ext(win.x0 > 0) * 0.6, py(y));
      }
    }

    const inWin = (x, y) => x >= win.x0 && x <= win.x1 && y >= win.y0 && y <= win.y1;

    // Ownership (engine) as soft squares under the stones.
    if (m.ownership) {
      for (let y = win.y0; y <= win.y1; y++) {
        for (let x = win.x0; x <= win.x1; x++) {
          const v = Array.isArray(m.ownership) ? m.ownership[y]?.[x] || 0 : m.ownership[y * size + x] || 0;
          if (Math.abs(v) < 0.15) continue;
          const r = cell * (0.12 + 0.26 * Math.min(1, Math.abs(v)));
          ctx.fillStyle = v > 0 ? `rgba(18,18,16,${0.18 + 0.4 * Math.abs(v)})` : `rgba(255,255,252,${0.28 + 0.5 * Math.abs(v)})`;
          ctx.fillRect(px(x) - r, py(y) - r, r * 2, r * 2);
        }
      }
    }

    const deadSet = new Set((m.deadStones || []).map((d) => d.y * size + d.x));
    const now = performance.now();

    // Fading captured stones.
    for (const f of this.fading) {
      if (!inWin(f.x, f.y)) continue;
      // Captured stones lift off and drift a little towards the capturer's lid.
      const t = Math.min(1, (now - f.start) / FADE_MS);
      const e = t * t;
      ctx.save();
      ctx.translate(cell * 0.12 * e, (f.c === BLACK ? 1 : -1) * cell * 0.18 * e);
      this.stone(ctx, f.x, f.y, f.c, theme, { alpha: 1 - t, scale: 1 - t * 0.18, shadow: t < 0.4 });
      ctx.restore();
    }

    // Stones.
    if (m.board) {
      for (let y = win.y0; y <= win.y1; y++) {
        for (let x = win.x0; x <= win.x1; x++) {
          const v = m.board[y]?.[x];
          if (!v) continue;
          let scale = 1;
          let alpha = 1;
          if (this.placing && this.placing.x === x && this.placing.y === y) {
            const t = Math.min(1, (now - this.placing.start) / PLACE_MS);
            scale = 0.82 + 0.18 * easeOutBack(t);
            alpha = Math.min(1, 0.4 + t * 1.2);
          }
          if (deadSet.has(y * size + x)) alpha = 0.38;
          this.stone(ctx, x, y, v, theme, { scale, alpha });
          const n = m.moveNumbers?.[x + "," + y];
          if (n && alpha === 1) this.label(ctx, x, y, String(n), v === BLACK ? "#f4efe4" : "#2a241c", cell * (n > 99 ? 0.34 : 0.42));
        }
      }
    }

    // Territory during scoring.
    if (m.territory) {
      ctx.save();
      ctx.globalAlpha = this.territoryStart ? Math.min(1, (now - this.territoryStart) / 450) : 1;
      for (let y = win.y0; y <= win.y1; y++) {
        for (let x = win.x0; x <= win.x1; x++) {
          const v = m.territory[y]?.[x] || 0;
          if (!v) continue;
          if (m.board?.[y]?.[x] && !deadSet.has(y * size + x)) continue;
          const r = cell * 0.17;
          ctx.fillStyle = v === BLACK ? "rgba(20,20,18,0.78)" : "rgba(252,250,244,0.92)";
          ctx.strokeStyle = v === BLACK ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.25)";
          ctx.lineWidth = 1;
          ctx.fillRect(px(x) - r, py(y) - r, r * 2, r * 2);
          ctx.strokeRect(px(x) - r, py(y) - r, r * 2, r * 2);
        }
      }
      ctx.restore();
    }

    // Variation (review lines, answers): numbered translucent stones.
    if (m.variation) {
      for (const s of m.variation) {
        if (!inWin(s.x, s.y)) continue;
        this.stone(ctx, s.x, s.y, s.c, theme, { alpha: 0.82, shadow: false });
        if (s.n) this.label(ctx, s.x, s.y, String(s.n), s.c === BLACK ? "#f4efe4" : "#2a241c", cell * 0.42);
      }
    }

    // Last move: a small dot, quieter than a ring.
    const last = m.lastMove;
    if (last && !last.pass && inWin(last.x, last.y) && m.board?.[last.y]?.[last.x] && !m.variation) {
      const c = m.board[last.y][last.x];
      const j = this.jitter(last.x, last.y);
      ctx.fillStyle = c === BLACK ? "rgba(255,250,240,0.9)" : "rgba(30,26,22,0.85)";
      ctx.beginPath();
      ctx.arc(px(last.x) + j.dx, py(last.y) + j.dy, cell * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const mark of m.marks || []) {
      if (!inWin(mark.x, mark.y)) continue;
      this.mark(ctx, mark, theme);
    }

    // Two-click placement: the pending stone, with a ring.
    if (m.ghost && inWin(m.ghost.x, m.ghost.y)) {
      this.stone(ctx, m.ghost.x, m.ghost.y, m.ghost.color, theme, { alpha: 0.6, shadow: false, jitter: false });
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.beginPath();
      ctx.arc(px(m.ghost.x), py(m.ghost.y), cell * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hover preview.
    const hv = m.hover;
    if (m.interactive && hv && inWin(hv.x, hv.y) && !m.board?.[hv.y]?.[hv.x] && m.hoverColor) {
      if (m.hoverValid) this.stone(ctx, hv.x, hv.y, m.hoverColor, theme, { alpha: 0.42, shadow: false, jitter: false });
      else {
        ctx.strokeStyle = "rgba(190, 60, 45, 0.7)";
        ctx.lineWidth = Math.max(1.2, cell * 0.06);
        ctx.beginPath();
        ctx.arc(px(hv.x), py(hv.y), cell * 0.22, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Keyboard cursor.
    if (m.cursor && inWin(m.cursor.x, m.cursor.y)) {
      const r = cell * 0.5;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = Math.max(1.5, cell * 0.07);
      ctx.beginPath();
      ctx.roundRect(px(m.cursor.x) - r, py(m.cursor.y) - r, r * 2, r * 2, r * 0.3);
      ctx.stroke();
    }

    ctx.restore();
  }

  jitter(x, y) {
    const cell = this.geom?.cell || 1;
    return { dx: (hash(x, y) - 0.5) * cell * 0.03, dy: (hash(y + 31, x + 17) - 0.5) * cell * 0.03 };
  }

  stone(ctx, x, y, color, theme, { alpha = 1, scale = 1, shadow = true, jitter = true } = {}) {
    const g = this.geom;
    const j = jitter ? this.jitter(x, y) : { dx: 0, dy: 0 };
    const cx = g.ox + x * g.cell + j.dx;
    const cy = g.oy + y * g.cell + j.dy;
    const r = g.cell * 0.475 * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadow) {
      // A short, soft contact shadow: the stone sits on the board.
      const sx = cx + r * 0.04;
      const sy = cy + r * 0.09;
      const sh = ctx.createRadialGradient(sx, sy, r * 0.82, sx, sy, r * 1.08);
      sh.addColorStop(0, theme.shadow);
      sh.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.08, 0, Math.PI * 2);
      ctx.fill();
    }
    const sprite = this.sprite(x, y, color);
    if (sprite) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sprite, cx - r, cy - r, r * 2, r * 2);
      this.rim(ctx, cx, cy, r, color);
      ctx.restore();
      return;
    }
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r);
    if (color === BLACK) {
      grad.addColorStop(0, "#5d5d59");
      grad.addColorStop(0.45, "#232321");
      grad.addColorStop(1, "#0b0b0a");
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.6, "#f2eee4");
      grad.addColorStop(1, "#cfc8b8");
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    this.rim(ctx, cx, cy, r, color);
    if (color === WHITE) {
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** On the ink board a black stone needs a hairline rim to read. */
  rim(ctx, cx, cy, r, color) {
    if (color !== BLACK || materialName(this.model.material) !== "ink") return;
    ctx.strokeStyle = "rgba(235, 230, 220, 0.32)";
    ctx.lineWidth = Math.max(0.75, r * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Pre-rendered stone: shell/slate variants, or flat high-contrast discs. */
  sprite(x, y, color) {
    const m = this.mats;
    if (!m) return null;
    if (this.model.flatStones) return color === BLACK ? m.flatBlack : m.flatWhite;
    const list = color === BLACK ? m.black : m.white;
    if (!list || !list.length) return null;
    return list[stoneVariant(x, y, color, list.length)] || list[0];
  }

  label(ctx, x, y, text, color, fs) {
    const g = this.geom;
    const j = this.jitter(x, y);
    ctx.fillStyle = color;
    ctx.font = `600 ${Math.max(8, fs)}px ${this.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, g.ox + x * g.cell + j.dx, g.oy + y * g.cell + j.dy + 0.5);
  }

  mark(ctx, mark, theme) {
    const g = this.geom;
    const stoneColor = this.model.board?.[mark.y]?.[mark.x] || 0;
    const j = stoneColor ? this.jitter(mark.x, mark.y) : { dx: 0, dy: 0 };
    const cx = g.ox + mark.x * g.cell + j.dx;
    const cy = g.oy + mark.y * g.cell + j.dy;
    const r = g.cell * 0.27;
    const tone =
      mark.tone === "good" ? GOOD : mark.tone === "bad" ? BAD : mark.tone === "accent" ? ACCENT : stoneColor === BLACK ? "#f4efe4" : stoneColor === WHITE ? "#2a241c" : theme.star;
    ctx.strokeStyle = tone;
    ctx.fillStyle = tone;
    ctx.lineWidth = Math.max(1.4, g.cell * 0.07);
    ctx.beginPath();
    if (mark.type === "candidate") {
      // Engine candidates: a soft disc, darker for the best, with a number.
      const colors = ["rgba(38,120,92,0.88)", "rgba(52,108,150,0.82)", "rgba(80,96,140,0.75)", "rgba(110,100,120,0.68)", "rgba(120,110,100,0.6)"];
      ctx.fillStyle = colors[Math.min(colors.length - 1, mark.rank || 0)];
      ctx.beginPath();
      ctx.arc(cx, cy, g.cell * 0.44, 0, Math.PI * 2);
      ctx.fill();
      if (mark.label) {
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${Math.max(8, g.cell * (String(mark.label).length > 3 ? 0.3 : 0.36))}px ${this.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(mark.label, cx, cy + 0.5);
      }
      return;
    }
    if (mark.type === "book") {
      // v6 explorer: book continuations in the accent (a filled disc for
      // book moves, a ring for KataGo's other candidates); mistakes in
      // --bad. The letter matches the row in the panel.
      const bad = mark.tag === "mistake";
      const col = bad ? BAD : ACCENT;
      const rr = g.cell * 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      if (mark.inBook && !bad) {
        ctx.globalAlpha = mark.tag === "joseki" ? 0.9 : 0.62;
        ctx.fillStyle = col;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
      } else {
        ctx.fillStyle = theme.base;
        ctx.fill();
        ctx.lineWidth = Math.max(1.2, g.cell * 0.06);
        ctx.strokeStyle = col;
        ctx.stroke();
        ctx.fillStyle = col;
      }
      if (mark.label) {
        ctx.font = `600 ${Math.max(9, g.cell * 0.4)}px ${this.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(mark.label, cx, cy + 0.5);
      }
      return;
    }
    if (mark.type === "area") {
      ctx.fillStyle = mark.tone === "good" ? "rgba(63,138,90,0.28)" : "rgba(192,69,47,0.26)";
      const h = g.cell * 0.5;
      ctx.fillRect(cx - h, cy - h, h * 2, h * 2);
      return;
    }
    if (mark.type === "circle") {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mark.type === "triangle") {
      ctx.moveTo(cx, cy - r * 1.05);
      ctx.lineTo(cx + r * 0.95, cy + r * 0.62);
      ctx.lineTo(cx - r * 0.95, cy + r * 0.62);
      ctx.closePath();
      ctx.stroke();
    } else if (mark.type === "square") {
      ctx.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
      ctx.stroke();
    } else if (mark.type === "cross") {
      ctx.moveTo(cx - r * 0.75, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.75, cy + r * 0.75);
      ctx.moveTo(cx + r * 0.75, cy - r * 0.75);
      ctx.lineTo(cx - r * 0.75, cy + r * 0.75);
      ctx.stroke();
    } else if (mark.type === "dot") {
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (mark.type === "label") {
      if (!stoneColor) {
        // Clear the grid under a letter so it reads.
        ctx.fillStyle = theme.base;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = tone;
      }
      ctx.font = `600 ${g.cell * 0.46}px ${this.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark.label || "", cx, cy + 0.5);
    }
  }
}
