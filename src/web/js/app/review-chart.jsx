/**
 * The review's balance chart: who was ahead after each move, filling in
 * as the analysis goes, with its key moments marked once it is done. It
 * follows the "analysis" slice (store.js), so a tick of the analysis
 * re-renders the chart and not the review around it. Out of review.jsx.
 */
import { useState } from "preact/hooks";
import { BLACK, WHITE, coordLabel, formatPoints } from "../rules.js";
import { t } from "../i18n.js";
import { state, useSlice } from "./store.js";
import * as C from "./controller.js";
import { Stone, Thumb } from "./parts.jsx";
import { colorName } from "./game-view.js";

/**
 * The moments the chart marks: KataGo's key mistakes (with their stories),
 * or the offline estimate's turning points (nothing more), never while
 * the analysis is still running.
 */
function chartMoments(r) {
  const m = r.model;
  if (r.analyzing || !m || m.confidence === "none") return [];
  if (m.confidence === "high") return r.keyMoves.map((km) => ({ index: km.index, color: km.move.color, played: km.move, km }));
  return m.moments.map((mo) => ({ index: mo.index, color: mo.color, played: mo.played, km: null }));
}

export function Chart() {
  useSlice("analysis");
  const r = state.review;
  const pts = r.points;
  const n = pts.length;
  const W = 300;
  const H = 120;
  const [hover, setHover] = useState(null);
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (p) => (1 - p) * H;
  let d = "";
  let started = false;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!p) continue;
    d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(p.winrate).toFixed(1)}`;
    started = true;
  }
  const lastIdx = pts.reduce((a, p, i) => (p ? i : a), -1);
  const area = started ? `${d}L${x(lastIdx).toFixed(1)},${H / 2}L0,${H / 2}Z` : "";
  const cur = C.reviewIndex();
  const idxAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(k * (n - 1));
  };
  const line = r.game.mainLine();
  const hv = hover != null ? line[hover] : null;
  return (
    <figure class="chart big">
      <div class="chart-box" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("review.chartLabel")} onClick={(e) => C.reviewGoto(idxAt(e))} onPointerMove={(e) => setHover(idxAt(e))}>
          <defs>
            <clipPath id="above">
              <rect x="0" y="0" width={W} height={H / 2} />
            </clipPath>
            <clipPath id="below">
              <rect x="0" y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          <rect class="chart-bg" x="0" y="0" width={W} height={H} rx="6" />
          {area && <path d={area} class="chart-black" clip-path="url(#above)" />}
          {area && <path d={area} class="chart-white" clip-path="url(#below)" />}
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="chart-mid" />
          {started && <path d={d} class="chart-line" />}
          {cur >= 0 && <line x1={x(cur)} x2={x(cur)} y1="0" y2={H} class="chart-cursor" />}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} class="chart-hover" />}
          {chartMoments(r).map(
            (k) =>
              pts[k.index] && (
                <circle
                  cx={x(k.index)}
                  cy={y(pts[k.index].winrate)}
                  r="4.5"
                  class="chart-key"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (k.km) C.focusMistake(k.km);
                    else C.reviewGoto(k.index);
                  }}
                >
                  <title>{t("review.moveLabel", [k.index, colorName(k.color), coordLabel(k.played.x, k.played.y, r.game.size)])}</title>
                </circle>
              ),
          )}
        </svg>
        {hv && (
          <div class="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <Thumb thumb={hv.board.signMap.map((row) => row.map((v) => (v > 0 ? "b" : v < 0 ? "w" : ".")).join("")).join("")} size={r.game.size} />
            <span>
              {t("review.moveShort", [hover])}
              {pts[hover] ? ` · ${pts[hover].scoreLead >= 0 ? t("common.black") : t("common.white")}+${formatPoints(Math.round(Math.abs(pts[hover].scoreLead) * 2) / 2)}` : ""}
            </span>
          </div>
        )}
      </div>
      <figcaption>
        <span>
          <Stone color={BLACK} size={10} /> {t("review.blackAhead")}
        </span>
        <span>
          {t("review.whiteAhead")} <Stone color={WHITE} size={10} />
        </span>
      </figcaption>
    </figure>
  );
}
