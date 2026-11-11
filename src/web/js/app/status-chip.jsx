/**
 * What is going on in the background that the player may want to act on,
 * said outside Settings: an update that is ready (or being downloaded, or
 * there to download), an opponent network being downloaded. One quiet line
 * at the foot of the sidebar, above Settings; a click opens the Settings
 * pane where it is handled. Nothing is shown when there is nothing to say.
 */
import { t } from "../i18n.js";
import { KINDS, isBusy, percent } from "../models.js";
import { state } from "./store.js";
import { openSheet } from "./ctl-core.js";
import { Icon } from "./parts.jsx";

/**
 * The one thing to say, or null: { kind, pane, text, icon }. `kind` is
 * "updateReady" | "updateDownloading" | "modelDownloading" |
 * "updateAvailable"; `pane` the Settings pane to open. What needs the
 * player first comes first: an update ready to install, then downloads in
 * progress, then an update that could be downloaded.
 */
export function statusOf(s = state) {
  const u = s.updateCheck;
  if (u?.status === "ready" || u?.status === "installing") return { kind: "updateReady", pane: "about", icon: "sparkle", text: t("status.updateReady") };
  if (u?.status === "downloading") {
    const pct = Number.isFinite(u.progress) ? Math.min(99, Math.floor(u.progress * 100)) : null;
    return { kind: "updateDownloading", pane: "about", icon: "download", text: pct == null ? t("status.downloadingUpdate") : t("status.downloading", [pct]) };
  }
  for (const kind of KINDS) {
    const one = s.models?.[kind];
    if (isBusy(one)) return { kind: "modelDownloading", pane: "playing", icon: "download", text: t("status.downloading", [percent(one)]) };
  }
  if (u?.status === "available") return { kind: "updateAvailable", pane: "about", icon: "sparkle", text: t("status.updateAvailable") };
  return null;
}

export function StatusChip() {
  const st = statusOf();
  if (!st) return null;
  return (
    <button type="button" class="sb-item status-chip" data-status={st.kind} title={st.text} aria-label={st.text} onClick={() => openSheet("settings", { pane: st.pane })}>
      <Icon name={st.icon} size={18} />
      <span>{st.text}</span>
    </button>
  );
}
