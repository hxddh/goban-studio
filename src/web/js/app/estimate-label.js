/**
 * The strength estimate on screen, as one number with its ±:
 * "≈ 12 kyu (±1)". The estimate is the player model's (model/player.js
 * estimate).
 */
import { t } from "../i18n.js";
import { estimate } from "../model/level.js";
import { rankParts } from "../model/ladder.js";

/** A rank (kyu 30…1, 1 dan = 0, 2 dan = -1 …) as shown: "≈ 12 kyu", "≈ 4 dan". */
export function rankText(rank) {
  const r = rankParts(rank);
  return t(r.unit === "kyu" ? "rank.kyu" : "rank.dan", [r.n]);
}

/** "≈ 12 kyu (±1)" for a profile now (or for an estimate already read). */
export function estimateLabel(profileOrEstimate, now = Date.now()) {
  const e = profileOrEstimate && Number.isFinite(profileOrEstimate.pm) ? profileOrEstimate : estimate(profileOrEstimate, { now });
  return e ? t("strength.label", [rankText(e.rank), e.pm]) : "";
}
