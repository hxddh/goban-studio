/**
 * The count: both sides' points with what they are made of, the result,
 * and the two ways on. Shown when a game is counted (play.jsx) and when a
 * finished game is counted again in its review (review.jsx). The board
 * beside it shows the same count: a small square on every point of
 * territory, dead stones faded (parts.jsx Board: `territory`, `deadStones`).
 *
 * `sc` is { dead, score, source } (source "pending" while KataGo is still
 * marking the dead stones); `komi` the game's komi, for a score that does
 * not carry it.
 */
import { BLACK, WHITE, formatPoints } from "../rules.js";
import { t } from "../i18n.js";
import * as C from "./controller.js";
import { Button, CountUp, Stone } from "./parts.jsx";

/** "a · b · c" → one fact per line. */
function lines(text) {
  return text.split(" · ").map((x) => <i>{x}</i>);
}

/** @param {{ sc: any, komi: number, title?: any, confirm?: any, cancel?: any, onConfirm?: () => any, onCancel?: () => any, children?: any }} props */
export function ScoreCard({ sc, komi, title, confirm, cancel, onConfirm, onCancel, children }) {
  const s = sc.score;
  const pending = sc.source === "pending";
  return (
    <section class="card score-card enter-up" aria-live="polite">
      <h2>{title || t(s.method === "area" ? "score.titleArea" : "score.title")}</h2>
      <p class="muted">{pending ? t("score.judging") : sc.source === "katago" ? t("score.engineMarked") : t("score.manual")}</p>
      {children}
      <div class="score-pair">
        <div>
          <Stone color={BLACK} size={14} />
          <strong>
            <CountUp value={pending ? 0 : s.black} format={formatPoints} />
          </strong>
          <span class="score-detail">{lines(s.method === "area" ? t("score.detailArea", [s.blackStones, s.blackTerritory]) : t("score.detail", [s.blackTerritory, s.blackPrisoners]))}</span>
        </div>
        <div>
          <Stone color={WHITE} size={14} />
          <strong>
            <CountUp value={pending ? 0 : s.white} format={formatPoints} />
          </strong>
          <span class="score-detail">
            {lines(
              s.method === "area"
                ? s.handicapCompensation > 0
                  ? t("score.detailAreaHandicap", [s.whiteStones, s.whiteTerritory, formatPoints(s.komi), s.handicapCompensation])
                  : t("score.detailAreaKomi", [s.whiteStones, s.whiteTerritory, formatPoints(s.komi)])
                : t("score.detailKomi", [s.whiteTerritory, s.whitePrisoners, formatPoints(s.komi ?? komi)]),
            )}
          </span>
        </div>
      </div>
      {!pending && s.seki?.length > 0 && <p class="fine">{t(s.method === "area" ? "score.sekiArea" : "score.sekiTerritory")}</p>}
      {!pending && <p class="score-result enter-fade">{C.resultText(s.result)}</p>}
      <p class="fine score-legend">{t("score.legend")}</p>
      <div class="actions">
        <Button kind="primary" onClick={onConfirm} disabled={pending}>
          {confirm || t("score.confirm")}
        </Button>
        <Button kind="ghost" onClick={onCancel}>
          {cancel || t("score.resume")}
        </Button>
      </div>
    </section>
  );
}
