/**
 * The strength estimate on screen, as one number with its ±:
 * "≈ 12 kyu (±1)". The estimate comes from strength.js (estimateNow).
 */
import { t } from "../i18n.js";
import { estimateNow } from "./strength.js";

function rankText(rank) {
  return rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank]);
}

/** "≈ 12 kyu (±1)", or "" without an estimate. */
export function estimateLabel(est, now = Date.now()) {
  const e = estimateNow(est, now);
  return e ? t("strength.label", [rankText(e.rank), e.pm]) : "";
}
