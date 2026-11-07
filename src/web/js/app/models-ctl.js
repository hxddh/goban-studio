/**
 * Optional downloads for the interface (v5). See ../models.js for the
 * rules: nothing is fetched unless the player starts a download here; the
 * host fetches only pinned URLs, verifies them and keeps them in the app's
 * data directory.
 *
 * State for the views, `state.models`:
 *
 *   { available,                       false in the browser preview
 *     human:  { status, progress, bytes, total, error, stalled, needed, name },
 *     strong: { … } }
 *
 *   status    "unavailable" | "absent" | "partial" | "downloading"
 *             | "verifying" | "ready" | "failed"
 *   progress  0…1 (bytes / total)
 *   error     host error name when failed ("DiskFull", "Network",
 *             "ChecksumMismatch", …); `modelErrorText(one)` words it
 *   stalled   downloading with no progress for 30 s
 *   needed    bytes the disk needs (DiskFull)
 *
 * The engine is told what is installed (`Engine.setModels`); v9: that only
 * changes which implementations the opponent ladder can reach
 * (opponents.js), never a mode the player picks.
 */
import { t } from "../i18n.js";
import * as M from "../models.js";
import * as Engine from "../engine.js";
import { state, update, toast } from "./store.js";
import { confirmAction } from "./ctl-core.js";


let pollTimer = null;

function syncEngine() {
  const m = state.models || M.initialModels();
  Engine.setModels({
    strong: M.isInstalled(m, "strong"),
    human: M.isInstalled(m, "human"),
  });
}

function label(kind) {
  return t(kind === "human" ? "models.human.name" : "models.strong.name");
}

/** A sentence for a failed download (or "" when it did not fail). */
export function modelErrorText(one) {
  if (!one || one.status !== "failed") return "";
  const key = M.errorKey(one.error);
  if (one.error === "DiskFull") return t(key, [M.megabytes(one.needed)]);
  return key === "models.error.generic" ? t(key, [one.error]) : t(key);
}

function apply(models, { announce = true } = {}) {
  const before = state.models;
  update({ models });
  syncEngine();
  if (announce) {
    for (const { kind, event } of M.transitions(before, models)) {
      if (event === "ready") toast(t("models.readyToast", [label(kind)]), "info", 4000);
      else toast(modelErrorText(models[kind]) || t("models.error.generic", [""]), "warn", 6000);
    }
  }
  schedulePoll();
}

function schedulePoll() {
  if (pollTimer || !M.needsPolling(state.models)) return;
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    await refreshModels();
  }, M.POLL_MS);
}

/** Ask the host for both downloads' state (start-up, opening Settings, polling). */
export async function refreshModels() {
  const models = await M.fetchStatus();
  apply(models);
  return models;
}

/** Boot: learn what is installed; the browser preview says "unavailable". */
export async function initModels() {
  if (!state.models) update({ models: M.initialModels() });
  if (!M.canDownload()) return state.models;
  const models = await M.fetchStatus();
  apply(models, { announce: false });
  return models;
}

/** Start or resume a download. */
export async function downloadModel(kind) {
  if (!M.canDownload()) {
    toast(t("models.unavailable"), "warn");
    return null;
  }
  const r = await M.download(kind);
  apply(r.models);
  if (!r.ok) toast(t(M.errorKey(r.error), [r.error]), "warn", 5000);
  return r;
}

/** Stop a download; it resumes from where it stopped next time. */
export async function cancelModelDownload(kind) {
  const r = await M.cancel(kind);
  apply(r.models, { announce: false });
  return r;
}

/** Delete an installed (or partly downloaded) model, after asking. */
export function removeModel(kind, { confirm = true } = {}) {
  const run = async () => {
    const r = await M.remove(kind);
    apply(r.models, { announce: false });
    if (!r.ok) toast(t("models.error.generic", [r.error || ""]), "warn");
    return r;
  };
  if (!confirm) return run();
  confirmAction({
    title: t("models.removeConfirm", [label(kind)]),
    body: t("models.removeBody"),
    confirm: t("models.remove"),
    danger: true,
    onConfirm: run,
  });
  return null;
}
