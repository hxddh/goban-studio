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

export const MATERIALS = {
  wood: {
    surface: ["#e9cd9d", "#dfba84", "#d2a970"],
    grain: "rgba(120, 78, 35, 0.045)",
    line: "rgba(52, 33, 15, 0.82)",
    edge: "rgba(52, 33, 15, 0.95)",
    star: "#3a2410",
    text: "rgba(70, 45, 20, 0.62)",
    shadow: "rgba(45, 25, 5, 0.32)",
  },
  paper: {
    surface: ["#faf6ec", "#f4eddc", "#ece2cb"],
    grain: "rgba(120, 100, 60, 0.035)",
    line: "rgba(70, 58, 42, 0.72)",
    edge: "rgba(70, 58, 42, 0.9)",
    star: "#4a3c2c",
    text: "rgba(80, 66, 48, 0.6)",
    shadow: "rgba(60, 50, 30, 0.22)",
  },
  slate: {
    surface: ["#2c3832", "#26312b", "#1f2924"],
    grain: "rgba(255, 255, 255, 0.025)",
    line: "rgba(190, 214, 200, 0.42)",
    edge: "rgba(190, 214, 200, 0.6)",
    star: "rgba(205, 228, 214, 0.75)",
    text: "rgba(200, 222, 208, 0.55)",
    shadow: "rgba(0, 0, 0, 0.45)",
  },
};

const DPR_LIMIT = 2;
const PLACE_MS = 140;
const FADE_MS = 200;

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
      material: "wood",
      view: null,
      hover: null,
      hoverColor: BLACK,
      hoverValid: true,
      interactive: true,
      cursor: null,
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
    this.resize();
  }

  destroy() {
    this._resizeObserver.disconnect();
    cancelAnimationFrame(this.raf);
  }

  setModel(patch) {
    const prevBoard = this.model.board;
    const prevSize = this.model.size;
    Object.assign(this.model, patch);
    if (patch.interactive === false) this.model.hover = null;
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
      // Animate a single new stone (a move), not a whole new position.
      if (added === 1 && last && !last.pass && board[last.y]?.[last.x]) this.placing = { x: last.x, y: last.y, start: now };
      else this.placing = null;
      if (added > 1) this.fading = [];
      if (this.placing || this.fading.length) this.animate();
    }
    this.draw();
  }

  animate() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const now = performance.now();
      if (this.placing && now - this.placing.start > PLACE_MS) this.placing = null;
      this.fading = this.fading.filter((f) => now - f.start < FADE_MS);
      this.draw();
      if (this.placing || this.fading.length) this.raf = requestAnimationFrame(tick);
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
    const size = this.model.size;
    const v = this.model.view;
    if (!v) return { x0: 0, y0: 0, x1: size - 1, y1: size - 1 };
    return {
      x0: Math.max(0, v.x0),
      y0: Math.max(0, v.y0),
      x1: Math.min(size - 1, v.x1),
      y1: Math.min(size - 1, v.y1),
    };
  }

  geometry() {
    const w = this.cssW || 1;
    const h = this.cssH || 1;
    const win = this.window();
    const cols = win.x1 - win.x0;
    const rows = win.y1 - win.y0;
    const span = Math.max(1, cols, rows);
    const shortest = Math.max(1, Math.min(w, h));
    // Margin in cells: room for coordinates outside the grid, or a quiet
    // border when they are hidden. Clamped so a hidden board stays positive.
    const marginCells = this.model.showCoords ? 1.25 : 0.8;
    const cell = Math.max(0.001, shortest / (span + marginCells * 2));
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
    const c = this.model.cursor || { x: Math.round((win.x0 + win.x1) / 2), y: Math.round((win.y0 + win.y1) / 2) };
    this.model.cursor = {
      x: Math.max(win.x0, Math.min(win.x1, c.x + dx)),
      y: Math.max(win.y0, Math.min(win.y1, c.y + dy)),
    };
    this.onHover(this.model.cursor);
    this.draw();
    return this.model.cursor;
  }

  grain(theme, w, h) {
    const key = `${this.model.material}:${w}x${h}:${this.dpr}`;
    if (this.grainCache?.key === key) return this.grainCache.canvas;
    const c = document.createElement("canvas");
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    const g = c.getContext("2d");
    g.scale(this.dpr, this.dpr);
    const bg = g.createLinearGradient(0, 0, w * 0.35, h);
    bg.addColorStop(0, theme.surface[0]);
    bg.addColorStop(0.55, theme.surface[1]);
    bg.addColorStop(1, theme.surface[2]);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // A quiet, deterministic grain: long soft strokes, never a texture
    // that competes with the stones.
    g.strokeStyle = theme.grain;
    for (let i = 0; i < 70; i++) {
      const y = hash(i, 7) * h;
      const amp = 2 + hash(i, 11) * 6;
      g.lineWidth = 0.6 + hash(i, 3) * 1.8;
      g.beginPath();
      for (let x = 0; x <= w; x += 24) {
        const yy = y + Math.sin(x / (80 + hash(i, 5) * 120) + i) * amp;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    this.grainCache = { key, canvas: c };
    return c;
  }

  draw() {
    const ctx = this.ctx;
    const g = this.geometry();
    this.geom = g;
    const m = this.model;
    const theme = MATERIALS[m.material] || MATERIALS.wood;
    const { size } = m;
    const { cell, ox, oy, w, h, win } = g;
    const px = (x) => ox + x * cell;
    const py = (y) => oy + y * cell;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.grain(theme, w, h), 0, 0, w, h);

    // Grid. Lines on an open side of a zoomed window run off by half a cell.
    const ext = (open) => (open ? cell * 0.6 : 0);
    const left = px(win.x0) - ext(win.x0 > 0);
    const right = px(win.x1) + ext(win.x1 < size - 1);
    const top = py(win.y0) - ext(win.y0 > 0);
    const bottom = py(win.y1) + ext(win.y1 < size - 1);
    ctx.lineCap = "butt";
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = Math.max(0.75, cell * 0.028);
    ctx.beginPath();
    for (let x = win.x0; x <= win.x1; x++) {
      ctx.moveTo(px(x), top);
      ctx.lineTo(px(x), bottom);
    }
    for (let y = win.y0; y <= win.y1; y++) {
      ctx.moveTo(left, py(y));
      ctx.lineTo(right, py(y));
    }
    ctx.stroke();
    // The board's own edges are slightly heavier.
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = Math.max(1.1, cell * 0.045);
    ctx.beginPath();
    if (win.x0 === 0) {
      ctx.moveTo(px(0), top);
      ctx.lineTo(px(0), bottom);
    }
    if (win.x1 === size - 1) {
      ctx.moveTo(px(size - 1), top);
      ctx.lineTo(px(size - 1), bottom);
    }
    if (win.y0 === 0) {
      ctx.moveTo(left, py(0));
      ctx.lineTo(right, py(0));
    }
    if (win.y1 === size - 1) {
      ctx.moveTo(left, py(size - 1));
      ctx.lineTo(right, py(size - 1));
    }
    ctx.stroke();

    ctx.fillStyle = theme.star;
    for (const [x, y] of starPoints(size)) {
      if (x < win.x0 || x > win.x1 || y < win.y0 || y > win.y1) continue;
      ctx.beginPath();
      ctx.arc(px(x), py(y), Math.max(1.6, cell * 0.085), 0, Math.PI * 2);
      ctx.fill();
    }

    if (m.showCoords) {
      ctx.fillStyle = theme.text;
      const fs = Math.max(9, Math.min(13, cell * 0.36));
      ctx.font = `500 ${fs}px "Inter Var", -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const gap = cell * 0.78;
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
      const t = Math.min(1, (now - f.start) / FADE_MS);
      this.stone(ctx, f.x, f.y, f.c, theme, { alpha: 1 - t, scale: 1 - t * 0.12 });
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
      ctx.arc(px(last.x) + j.dx, py(last.y) + j.dy, cell * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const mark of m.marks || []) {
      if (!inWin(mark.x, mark.y)) continue;
      this.mark(ctx, mark, theme);
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
      ctx.strokeStyle = "rgba(196, 112, 50, 0.95)";
      ctx.lineWidth = Math.max(1.5, cell * 0.07);
      ctx.beginPath();
      ctx.roundRect(px(m.cursor.x) - r, py(m.cursor.y) - r, r * 2, r * 2, r * 0.3);
      ctx.stroke();
    }

    ctx.restore();
  }

  jitter(x, y) {
    const cell = this.geom?.cell || 1;
    return { dx: (hash(x, y) - 0.5) * cell * 0.05, dy: (hash(y + 31, x + 17) - 0.5) * cell * 0.05 };
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
      const sh = ctx.createRadialGradient(cx + r * 0.12, cy + r * 0.2, r * 0.6, cx + r * 0.12, cy + r * 0.2, r * 1.12);
      sh.addColorStop(0, theme.shadow);
      sh.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(cx + r * 0.12, cy + r * 0.2, r * 1.12, 0, Math.PI * 2);
      ctx.fill();
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
    if (color === WHITE) {
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
    ctx.restore();
  }

  label(ctx, x, y, text, color, fs) {
    const g = this.geom;
    const j = this.jitter(x, y);
    ctx.fillStyle = color;
    ctx.font = `600 ${Math.max(8, fs)}px "Inter Var", -apple-system, system-ui, sans-serif`;
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
      mark.tone === "good" ? "#3f8a5a" : mark.tone === "bad" ? "#c0452f" : mark.tone === "accent" ? "#c27234" : stoneColor === BLACK ? "#f4efe4" : stoneColor === WHITE ? "#2a241c" : theme.star;
    ctx.strokeStyle = tone;
    ctx.fillStyle = tone;
    ctx.lineWidth = Math.max(1.4, g.cell * 0.07);
    ctx.beginPath();
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
        ctx.fillStyle = (MATERIALS[this.model.material] || MATERIALS.wood).surface[1];
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = tone;
      }
      ctx.font = `600 ${g.cell * 0.46}px "Inter Var", -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark.label || "", cx, cy + 0.5);
    }
  }
}
