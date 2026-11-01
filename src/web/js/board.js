/**
 * Go board canvas.
 *
 * Intersections, not squares. The renderer is pure view: it reads a model
 * (sign map, last move, marks, ownership) and never touches the rules. Hit
 * testing rounds to the nearest intersection; the play view decides whether
 * the point is legal.
 */
import { BLACK, WHITE, LETTERS, starPoints } from "./rules.js";

export const THEMES = {
  wood: {
    boardTop: "#e8ca9b",
    boardMid: "#dcb681",
    boardBot: "#cfa66d",
    frame: "#a97b4c",
    line: "#4a3018",
    star: "#3d2712",
    text: "#6b4a2a",
    black: ["#6f6f69", "#262624", "#070707"],
    white: ["#ffffff", "#f0eadc", "#c9c2b2"],
    lastBlack: "rgba(255,246,226,0.92)",
    lastWhite: "rgba(48,31,16,0.78)",
    hoverBlack: "rgba(20,20,18,0.30)",
    hoverWhite: "rgba(255,255,255,0.48)",
    mark: "#b23a2a",
    territoryB: "rgba(24,24,22,0.22)",
    territoryW: "rgba(255,255,255,0.42)",
    gridShadow: "rgba(80,50,20,0.12)",
  },
  night: {
    boardTop: "#233a31",
    boardMid: "#1b2d26",
    boardBot: "#14231d",
    frame: "#0c1712",
    line: "#668879",
    star: "#8fc0a7",
    text: "#a9c8b7",
    black: ["#5a625d", "#202622", "#050807"],
    white: ["#fbfaf3", "#e4e0d3", "#b9b5a7"],
    lastBlack: "rgba(220,255,238,0.92)",
    lastWhite: "rgba(12,24,19,0.82)",
    hoverBlack: "rgba(0,0,0,0.35)",
    hoverWhite: "rgba(240,255,248,0.40)",
    mark: "#e07a5f",
    territoryB: "rgba(0,0,0,0.26)",
    territoryW: "rgba(224,255,240,0.30)",
    gridShadow: "rgba(0,0,0,0.18)",
  },
  paper: {
    boardTop: "#fbf6e8",
    boardMid: "#f4ecda",
    boardBot: "#eadfc7",
    frame: "#c9b696",
    line: "#6a5741",
    star: "#5a4732",
    text: "#7a644a",
    black: ["#666663", "#242422", "#080807"],
    white: ["#ffffff", "#f6f1e5", "#d5cdbd"],
    lastBlack: "rgba(255,250,238,0.95)",
    lastWhite: "rgba(56,42,28,0.82)",
    hoverBlack: "rgba(30,30,28,0.26)",
    hoverWhite: "rgba(255,255,255,0.55)",
    mark: "#b23a2a",
    territoryB: "rgba(30,28,24,0.16)",
    territoryW: "rgba(255,255,255,0.55)",
    gridShadow: "rgba(90,70,40,0.10)",
  },
};

const DPR_LIMIT = 2;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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
      deadStones: [],
      showNumbers: false,
      showCoords: true,
      themeId: "wood",
      phase: "playing",
      hover: null,
      hoverValid: true,
      interactive: true,
    };
    this.geom = null;
    this.dpr = 1;
    this.anim = null;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas);
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerleave", () => {
      this.model.hover = null;
      this.draw();
    });
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.resize();
  }

  setModel(patch) {
    const prevLast = this.model.lastMove;
    Object.assign(this.model, patch);
    if (patch.interactive === false) this.model.hover = null;
    const last = this.model.lastMove;
    if (last && !last.pass && (!prevLast || prevLast.x !== last.x || prevLast.y !== last.y)) {
      this.anim = { start: performance.now(), x: last.x, y: last.y };
      this._animate();
    }
    this.draw();
  }

  setTheme(id) {
    if (THEMES[id]) this.model.themeId = id;
    this.draw();
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
    this.draw();
  }

  geometry() {
    const size = this.model.size;
    const w = this.cssW || 1;
    const h = this.cssH || 1;
    const shortest = Math.max(1, Math.min(w, h));
    // A hidden board can be measured at 1px. Clamp the margin so the cell
    // size stays positive; otherwise the next draw gets negative stone radii
    // and Canvas throws before the rest of the view can render.
    const margin = Math.min(Math.max(24, shortest * 0.075), shortest * 0.3);
    const cell = Math.max(0.001, (shortest - margin * 2) / (size - 1));
    const gridW = cell * (size - 1);
    const ox = (w - gridW) / 2;
    const oy = (h - gridW) / 2;
    return { size, w, h, cell, ox, oy, gridW, margin };
  }

  pointToVertex(px, py) {
    const g = this.geom || this.geometry();
    const x = Math.round((px - g.ox) / g.cell);
    const y = Math.round((py - g.oy) / g.cell);
    if (x < 0 || y < 0 || x >= g.size || y >= g.size) return null;
    const dx = px - (g.ox + x * g.cell);
    const dy = py - (g.oy + y * g.cell);
    if (Math.hypot(dx, dy) > g.cell * 0.52) return null;
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

  _animate() {
    const tick = (now) => {
      if (!this.anim) return;
      const t = (now - this.anim.start) / 150;
      this.draw(t < 1 ? t : 1);
      if (t < 1) requestAnimationFrame(tick);
      else this.anim = null;
    };
    requestAnimationFrame(tick);
  }

  draw(animT = 1) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const g = this.geometry();
    this.geom = g;
    const theme = THEMES[this.model.themeId] || THEMES.wood;
    const { size, cell, ox, oy, w, h } = g;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Board surface: a soft vertical gradient, no texture. The board is the
    // quietest thing in the room; the stones are the content.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, theme.boardTop);
    bg.addColorStop(0.55, theme.boardMid);
    bg.addColorStop(1, theme.boardBot);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Inner frame line, then the grid.
    const pad = Math.max(10, cell * 0.55);
    ctx.strokeStyle = theme.frame;
    ctx.lineWidth = Math.max(1, cell * 0.035);
    ctx.strokeRect(ox - pad, oy - pad, g.gridW + pad * 2, g.gridW + pad * 2);

    ctx.strokeStyle = theme.line;
    ctx.lineWidth = Math.max(1, cell * 0.022);
    ctx.beginPath();
    for (let i = 0; i < size; i++) {
      const x = ox + i * cell;
      const y = oy + i * cell;
      ctx.moveTo(x, oy);
      ctx.lineTo(x, oy + g.gridW);
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + g.gridW, y);
    }
    ctx.stroke();

    // Star points.
    ctx.fillStyle = theme.star;
    for (const [x, y] of starPoints(size)) {
      ctx.beginPath();
      ctx.arc(ox + x * cell, oy + y * cell, Math.max(1.6, cell * 0.075), 0, Math.PI * 2);
      ctx.fill();
    }

    // Coordinates.
    if (this.model.showCoords) {
      ctx.fillStyle = theme.text;
      ctx.font = `500 ${Math.max(9, Math.min(12, cell * 0.42))}px Inter, "PingFang SC", "Hiragino Sans", "Malgun Gothic", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < size; i++) {
        const x = ox + i * cell;
        const y = oy + i * cell;
        ctx.fillText(LETTERS[i], x, oy + g.gridW + cell * 0.62);
        ctx.fillText(String(size - i), ox - cell * 0.62, y);
      }
    }

    // Ownership / influence overlay.
    if (this.model.ownership) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = this.model.ownership[y]?.[x] || 0;
          if (Math.abs(v) < 0.08) continue;
          const px = ox + x * cell;
          const py = oy + y * cell;
          const alpha = Math.min(0.42, Math.abs(v) * 0.42);
          ctx.fillStyle = v > 0 ? `rgba(20,20,18,${alpha})` : `rgba(255,255,255,${alpha + 0.05})`;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(2, cell * 0.34), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Territory marks during scoring.
    if (this.model.territory) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = this.model.territory[y]?.[x] || 0;
          if (!v) continue;
          if (this.model.board?.[y]?.[x] !== 0) continue;
          const px = ox + x * cell;
          const py = oy + y * cell;
          ctx.fillStyle = v === BLACK ? theme.territoryB : theme.territoryW;
          const r = Math.max(3, cell * 0.18);
          ctx.fillRect(px - r, py - r, r * 2, r * 2);
        }
      }
    }

    // Stones.
    if (this.model.board) {
      const dead = new Set((this.model.deadStones || []).map((d) => d.y * size + d.x));
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = this.model.board[y]?.[x];
          if (!v) continue;
          let scale = 1;
          if (this.anim && this.anim.x === x && this.anim.y === y) {
            const t = clamp(animT, 0, 1);
            scale = 0.72 + 0.28 * (1 - Math.pow(1 - t, 3));
          }
          this.paintStone(ctx, ox + x * cell, oy + y * cell, cell, v, theme, scale, dead.has(y * size + x));
        }
      }
    }

    // Last move marker.
    const last = this.model.lastMove;
    if (last && !last.pass && this.model.showNumbers !== "only") {
      const px = ox + last.x * cell;
      const py = oy + last.y * cell;
      const stone = this.model.board?.[last.y]?.[last.x];
      ctx.strokeStyle = stone === BLACK ? theme.lastBlack : theme.lastWhite;
      ctx.lineWidth = Math.max(1.5, cell * 0.045);
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.19, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Move numbers on stones (review / study).
    if (this.model.showNumbers) {
      const numbers = this.model.moveNumbers;
      if (numbers) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${Math.max(8, cell * 0.36)}px Inter, sans-serif`;
        for (const [key, n] of Object.entries(numbers)) {
          const [x, y] = key.split(",").map(Number);
          const v = this.model.board?.[y]?.[x];
          if (!v) continue;
          ctx.fillStyle = v === BLACK ? "rgba(255,248,230,0.86)" : "rgba(40,30,20,0.82)";
          ctx.fillText(String(n), ox + x * cell, oy + y * cell + cell * 0.02);
        }
      }
    }

    // Marks.
    if (this.model.marks?.length) {
      for (const mark of this.model.marks) {
        const px = ox + mark.x * cell;
        const py = oy + mark.y * cell;
        this.paintMark(ctx, px, py, cell, mark, theme);
      }
    }

    // Hover ghost.
    const hover = this.model.hover;
    if (hover && this.model.interactive && this.model.phase === "playing" && !this.model.board?.[hover.y]?.[hover.x]) {
      const v = this.model.hoverColor || WHITE;
      ctx.globalAlpha = 0.55;
      this.paintStone(ctx, ox + hover.x * cell, oy + hover.y * cell, cell, v, theme, 1, false, true);
      ctx.globalAlpha = 1;
      if (this.model.hoverValid === false) {
        ctx.strokeStyle = "rgba(190,60,45,0.9)";
        ctx.lineWidth = Math.max(2, cell * 0.06);
        ctx.beginPath();
        ctx.arc(ox + hover.x * cell, oy + hover.y * cell, cell * 0.46, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  paintStone(ctx, px, py, cell, color, theme, scale = 1, dead = false, ghost = false) {
    const r = Math.max(0.1, cell * 0.455 * scale);
    const cols = color === BLACK ? theme.black : theme.white;
    ctx.save();
    if (!ghost) {
      ctx.shadowColor = "rgba(30,18,6,0.28)";
      ctx.shadowBlur = cell * 0.18;
      ctx.shadowOffsetX = cell * 0.035;
      ctx.shadowOffsetY = cell * 0.06;
    }
    const grad = ctx.createRadialGradient(px - r * 0.34, py - r * 0.38, r * 0.12, px, py, r * 1.1);
    grad.addColorStop(0, cols[0]);
    grad.addColorStop(0.58, cols[1]);
    grad.addColorStop(1, cols[2]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = color === BLACK ? "rgba(0,0,0,0.32)" : "rgba(110,96,72,0.32)";
    ctx.lineWidth = Math.max(0.7, cell * 0.016);
    ctx.stroke();
    // A small specular highlight gives the stone its weight.
    ctx.fillStyle = color === BLACK ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.ellipse(px - r * 0.36, py - r * 0.42, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (dead) {
      ctx.strokeStyle = "rgba(190,60,45,0.86)";
      ctx.lineWidth = Math.max(1.2, cell * 0.045);
      ctx.beginPath();
      ctx.moveTo(px - r * 0.52, py - r * 0.52);
      ctx.lineTo(px + r * 0.52, py + r * 0.52);
      ctx.moveTo(px + r * 0.52, py - r * 0.52);
      ctx.lineTo(px - r * 0.52, py + r * 0.52);
      ctx.stroke();
    }
    ctx.restore();
  }

  paintMark(ctx, px, py, cell, mark, theme) {
    const r = cell * 0.27;
    ctx.save();
    ctx.strokeStyle = theme.mark;
    ctx.fillStyle = theme.mark;
    ctx.lineWidth = Math.max(1.4, cell * 0.045);
    if (mark.type === "triangle") {
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r * 0.92, py + r * 0.72);
      ctx.lineTo(px - r * 0.92, py + r * 0.72);
      ctx.closePath();
      ctx.stroke();
    } else if (mark.type === "square") {
      ctx.strokeRect(px - r * 0.8, py - r * 0.8, r * 1.6, r * 1.6);
    } else if (mark.type === "circle") {
      ctx.beginPath();
      ctx.arc(px, py, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mark.type === "cross") {
      ctx.beginPath();
      ctx.moveTo(px - r * 0.8, py - r * 0.8);
      ctx.lineTo(px + r * 0.8, py + r * 0.8);
      ctx.moveTo(px + r * 0.8, py - r * 0.8);
      ctx.lineTo(px - r * 0.8, py + r * 0.8);
      ctx.stroke();
    } else if (mark.type === "label") {
      ctx.font = `600 ${Math.max(9, cell * 0.38)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(mark.text ?? ""), px, py);
    }
    ctx.restore();
  }
}
