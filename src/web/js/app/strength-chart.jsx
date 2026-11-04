/**
 * v6: the strength estimate on screen — its label ("≈ 12 kyu (±2)") and a
 * quiet chart of the estimate over time with its ± band. The data come
 * from strength.js (estimateNow, strengthSeries); the chart only draws.
 * Colours are the design tokens (docs/design.md §4): the line in
 * --text-2, the band a faint --text-3, the latest point in --text.
 */
import { t } from "../i18n.js";
import { estimateNow, strengthSeries } from "./strength.js";

function rankText(rank) {
  return rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank]);
}

/** "≈ 12 kyu (±2)", or "" without an estimate. */
export function estimateLabel(est, now = Date.now()) {
  const e = estimateNow(est, now);
  return e ? t("strength.label", [rankText(e.rank), e.pm]) : "";
}

/** Just the rank of the estimate ("≈ 12 kyu"), for tight places. */
export function estimateRank(est, now = Date.now()) {
  const e = estimateNow(est, now);
  return e ? rankText(e.rank) : "";
}

/**
 * The chart. `est` is progress.rating; `n` the number of points shown.
 * Draws nothing with fewer than two points.
 */
export function StrengthChart({ est, n = 30, width = 160, height = 32 }) {
  const pts = strengthSeries(est, n);
  if (pts.length < 2) return null;
  const pad = 3;
  const min = Math.min(...pts.map((p) => p.lo)) - 20;
  const max = Math.max(...pts.map((p) => p.hi)) + 20;
  const x = (i) => (i / (pts.length - 1)) * width;
  const y = (r) => pad + (height - 2 * pad) * (1 - (r - min) / (max - min || 1));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join("");
  const upper = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.hi).toFixed(1)}`).join("");
  const lower = pts
    .map((p, i) => [i, p])
    .reverse()
    .map(([i, p]) => `L${x(i).toFixed(1)},${y(p.lo).toFixed(1)}`)
    .join("");
  const last = pts[pts.length - 1];
  return (
    <svg class="spark strength-chart" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${t("today.progressLabel")}: ${estimateLabel(est)}`}>
      <path d={`${upper}${lower}Z`} style={{ fill: "var(--text-3)", opacity: 0.28, stroke: "none" }} />
      <path d={line} style={{ fill: "none", stroke: "var(--text-2)", strokeWidth: 1.5, strokeLinejoin: "round" }} />
      <circle cx={x(pts.length - 1)} cy={y(last.r)} r="2.5" style={{ fill: "var(--text)" }} />
    </svg>
  );
}
