/**
 * A problem's position as a square tile, for the topic grid: the corner or
 * side of the board the problem is on, drawn in SVG so it is sharp at any
 * size. Board edges are drawn where the position touches them and the
 * lines run off the tile where the board goes on; the stones the goal is
 * about carry a small triangle (the usual mark for "these stones" in a
 * diagram). The tiles of one grid share one framing, so a stone is the
 * same size on each.
 *
 * A grid can hold a hundred tiles, so a tile draws its position only once
 * it is near the screen (one shared IntersectionObserver); until then it
 * is the bare board colour, the same size.
 */
import { useEffect, useRef, useState } from "preact/hooks";

/** A problem as its tile shows it: Black or White to play, as its first showing will be. */
export { firstShown } from "./transform.js";

/**
 * The square window of the board a diagram is shown in:
 *   { n, stones: [{ x, y, black, key }], edge: { l, t, r, b } }
 * `n` lines each way (at least `min`), anchored on the board edges the
 * diagram touches and centred on it elsewhere; `stones` in window
 * coordinates; `edge` says which sides of the window are the board's own.
 * Null without a diagram (the problem's part has not arrived).
 */
export function tileWindow(def, min = 6) {
  const rowsIn = def?.diagram;
  if (!Array.isArray(rowsIn) || !rowsIn.length) return null;
  const rows = rowsIn.map((r) => r.replace(/\s+/g, "").split(""));
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const size = def.size || 19;
  let x0 = 0;
  let y0 = 0;
  if (def.at) [x0, y0] = def.at;
  else {
    const corner = def.corner || "tl";
    if (corner.includes("r")) x0 = size - w;
    if (corner.includes("b")) y0 = size - h;
  }
  const n = Math.min(size, Math.max(w, h, min));
  // Keep an edge the diagram touches; otherwise centre it in the window.
  const start = (at, len) => (at === 0 ? 0 : at + len === size ? size - n : Math.max(0, Math.min(size - n, at - Math.floor((n - len) / 2))));
  const wx = start(x0, w);
  const wy = start(y0, h);
  const stones = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch !== "X" && ch !== "x" && ch !== "O" && ch !== "o") continue;
      stones.push({ x: x0 + x - wx, y: y0 + y - wy, black: ch === "X" || ch === "x", key: ch === "x" || ch === "o" });
    }
  }
  return { n, stones, edge: { l: wx === 0, t: wy === 0, r: wx + n === size, b: wy + n === size } };
}

let observer = null;
const waiting = new WeakMap();

/** Call `show` once `el` is near the screen (at once where that cannot be observed). */
function whenNear(el, show) {
  if (typeof IntersectionObserver === "undefined") {
    show();
    return () => {};
  }
  observer ||= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer.unobserve(e.target);
        waiting.get(e.target)?.();
        waiting.delete(e.target);
      }
    },
    { rootMargin: "240px" },
  );
  waiting.set(el, show);
  observer.observe(el);
  return () => {
    observer.unobserve(el);
    waiting.delete(el);
  };
}

/** How many lines a diagram spans (its larger side): the framing a grid of tiles shares (gridFrame). */
export function extentOf(def) {
  const rows = def?.diagram;
  if (!Array.isArray(rows) || !rows.length) return 0;
  return Math.max(rows.length, ...rows.map((r) => r.replace(/\s+/g, "").length));
}

/** One framing for a grid: the largest diagram's extent, from 6 lines to at most 13. */
export function gridFrame(defs) {
  return Math.min(13, Math.max(6, ...defs.map(extentOf)));
}

export function PositionTile({ def, frame = 6 }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => (near ? undefined : whenNear(ref.current, () => setNear(true))), [near]);
  const win = near ? tileWindow(def, frame) : null;
  if (!win) return <span ref={ref} class="tile" aria-hidden="true" />;
  const { n, stones, edge } = win;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const c = i + 0.5;
    const outer = (i === 0 && edge.t) || (i === n - 1 && edge.b);
    lines.push(<line class={outer ? "edge" : ""} x1={edge.l ? 0.5 : 0} y1={c} x2={edge.r ? n - 0.5 : n} y2={c} />);
    const outerV = (i === 0 && edge.l) || (i === n - 1 && edge.r);
    lines.push(<line class={outerV ? "edge" : ""} x1={c} y1={edge.t ? 0.5 : 0} x2={c} y2={edge.b ? n - 0.5 : n} />);
  }
  return (
    <span ref={ref} class="tile" aria-hidden="true">
      <svg viewBox={`0 0 ${n} ${n}`} focusable="false">
        {lines}
        {stones.map((s) => (
          <>
            <circle class={s.black ? "b" : "w"} cx={s.x + 0.5} cy={s.y + 0.5} r="0.46" />
            {s.key && <polygon class={s.black ? "key-b" : "key-w"} points={`${s.x + 0.5},${s.y + 0.27} ${s.x + 0.7},${s.y + 0.62} ${s.x + 0.3},${s.y + 0.62}`} />}
          </>
        ))}
      </svg>
    </span>
  );
}
