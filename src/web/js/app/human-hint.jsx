/**
 * The human-style model, offered where it matters and nowhere else: one
 * quiet line, with its own Download and a close button, under the result
 * of a game against the computer and in New game when the opponent is a
 * kyu level. Not a sheet and not a setting: closed once, it stays closed
 * (settings.humanHintDismissed), and it is gone once the model is there.
 * Only the desktop app can download models (models.js canDownload).
 */
import { t } from "../i18n.js";
import * as M from "../models.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { Icon } from "./parts.jsx";

export function HumanHint() {
  if (!M.offerHuman(state.models, state.settings.humanHintDismissed)) return null;
  const one = state.models.human;
  const busy = M.isBusy(one);
  return (
    <p class="human-hint fine" data-hint="human">
      <span>{busy ? t("models.hint.downloading", [M.percent(one)]) : t("models.hint.line")}</span>
      {!busy && (
        <button type="button" class="link" onClick={() => C.downloadModel("human")}>
          {t(one.status === "partial" ? "models.resume" : "models.download", [M.megabytes(M.MODELS.human.bytes)])}
        </button>
      )}
      <button type="button" class="icon-btn hint-close" aria-label={t("models.hint.close")} title={t("models.hint.close")} onClick={() => C.setSetting("humanHintDismissed", true)}>
        <Icon name="close" size={12} />
      </button>
    </p>
  );
}
