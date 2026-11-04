/**
 * v7 report additions: the rating change of the game ("Strength ≈ 12 kyu →
 * ≈ 11 kyu (±1)", from the estimate before and after it, strength.js) and
 * the note when its background analysis was stopped.
 */
import { t } from "../i18n.js";
import * as C from "./controller.js";
import { Button } from "./parts.jsx";

const rankText = (rank) => (rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank]));

/** The words for a record's rating change, or "". Exported for the tests. */
export function ratingChangeText(rt) {
  if (!rt?.before || !rt?.after) return "";
  if (rt.before.rank === rt.after.rank) return t("sched.report.ratingSame", [rankText(rt.after.rank), rt.after.pm]);
  return t("sched.report.rating", [rankText(rt.before.rank), rankText(rt.after.rank), rt.after.pm]);
}

export function RatingChange() {
  const text = ratingChangeText(C.reportRating());
  return text ? <span class="muted report-rating">{text}</span> : null;
}

export function ReportStopped() {
  return (
    <section class="report-pending report-stopped">
      <span class="fine">{t("sched.report.stopped")}</span>
      <Button size="sm" onClick={C.retryReport}>
        {t("sched.report.retry")}
      </Button>
    </section>
  );
}
