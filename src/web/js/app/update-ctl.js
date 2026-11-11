/**
 * Update checks and installs for the interface. See ../update.js
 * for the rules: one request to GitHub, only when the player asks or opted
 * in to the weekly check (setting `autoUpdateCheck`, default false); the
 * player may then download and install the new version.
 *
 * State for the views: `state.updateCheck` is null until a check has run,
 * then one of
 *
 *   { status: "checking" }
 *   { status: "available", latest, current, url, notes, publishedAt,
 *     install: { can, blocked }, installError? }
 *   { status: "downloading", …release, install, step, received, total, progress }
 *   { status: "ready", …release, install }
 *   { status: "installing", …release, install }
 *   { status: "current", latest, current, url, publishedAt }
 *   { status: "unavailable" }            browser preview
 *   { status: "error", error }
 *
 * where …release is latest, current, url, notes, publishedAt (kept from the
 * check, so the notes stay on screen), and
 *
 *   install.can       true: offer "Download and install" (C.downloadUpdate)
 *                     false: offer "Open download page" (C.openReleasePage)
 *   install.blocked   why not: "ReadOnlyLocation" | "Translocated" |
 *                     "NotPackaged" | "Unsupported" | "NoTempDir" | ""
 *   installError      the last download / install error code, if any;
 *                     t(U.installMessageKey(code)) explains it, and
 *                     U.installFallsBack(code) says a retry will not help
 *   step              "download" | "verify" | "unpack"
 *   received, total   bytes (total 0 when unknown); progress 0…1 or null
 *
 * Actions: C.downloadUpdate() (from "available"), C.cancelUpdate() (from
 * "downloading" or "ready"), C.applyUpdate() (from "ready": "Restart to
 * update"; the app quits and restarts as the new version).
 */
import { t } from "../i18n.js";
import * as U from "../update.js";
import { APP_VERSION } from "../version.js";
import { state, update, toast } from "./store.js";

export const canCheckUpdates = U.canCheckUpdates;

const RELEASE_KEYS = ["latest", "current", "url", "notes", "publishedAt"];

function release(from) {
  const out = {};
  for (const k of RELEASE_KEYS) if (from && from[k] !== undefined) out[k] = from[k];
  return out;
}

/** Attach whether this installation can update itself to an "available" result. */
async function withInstallInfo(result) {
  if (result?.status !== "available") return result;
  const { can, blocked } = await U.installInfo();
  return { ...result, install: { can, blocked } };
}

/** "Check for updates…": check now and say what was found. */
export async function checkForUpdates({ quiet = false } = {}) {
  const busy = state.updateCheck?.status;
  if (busy === "checking" || busy === "downloading" || busy === "ready" || busy === "installing") return state.updateCheck;
  update({ updateCheck: { status: "checking" } });
  const result = await withInstallInfo(await U.checkNow());
  update({ updateCheck: result });
  if (!quiet) {
    if (result.status === "available") toast(t("update.available", [result.latest]), "info", 6000);
    else if (result.status === "current") toast(t("update.current", [result.current]), "info");
    else if (result.status === "unavailable") toast(t("update.unavailable"), "warn");
    else toast(t("update.error"), "error");
  }
  return result;
}

/** Start-up: the weekly check, when the player turned it on. */
export async function autoCheckForUpdates() {
  const busy = state.updateCheck?.status;
  if (busy === "downloading" || busy === "ready" || busy === "installing") return null;
  const result = await U.autoCheckIfDue(state.settings);
  if (!result) return null;
  const shown = await withInstallInfo(result);
  update({ updateCheck: shown });
  if (shown.status === "available") toast(t("update.available", [shown.latest]), "info", 6000);
  return shown;
}

/** Open the releases page (fixed address) in the system browser. */
export function openReleasePage() {
  return U.openReleasePage();
}

/**
 * Which download the interface is waiting for. A download cancelled and
 * started again answers twice; only the newest answer counts.
 */
let downloadGen = 0;

/** "Download and install": fetch, verify and unpack the new version. */
export async function downloadUpdate() {
  const u = state.updateCheck;
  if (!u || u.status !== "available" || !u.latest) return u;
  if (u.install && !u.install.can) {
    // Nothing to download into: the release page is the way.
    toast(t(U.installMessageKey(u.install.blocked)), "warn", 6000);
    return u;
  }
  const base = { ...release(u), install: u.install || { can: true, blocked: "" } };
  const gen = ++downloadGen;
  update({ updateCheck: { ...base, status: "downloading", step: "download", received: 0, total: 0, progress: null } });
  const result = await U.downloadNow(u.latest, {
    onProgress(s) {
      if (gen !== downloadGen || state.updateCheck?.status !== "downloading") return;
      if (U.installStatusOf(s.phase) !== "downloading") return;
      update({ updateCheck: { ...base, status: "downloading", step: U.installStepOf(s.phase), received: s.received, total: s.total, progress: s.progress } });
    },
  });
  // Cancelled meanwhile: cancelUpdate already settled the state (and a
  // download started since then answers for itself).
  if (gen !== downloadGen || state.updateCheck?.status !== "downloading") return state.updateCheck;
  if (result.ok) {
    update({ updateCheck: { ...base, status: "ready" } });
    toast(t("update.ready", [u.latest]), "success", 6000);
  } else {
    const install = U.INSTALL_BLOCKED.includes(result.error) ? { can: false, blocked: result.error } : base.install;
    update({ updateCheck: { ...base, install, status: "available", installError: result.error } });
    if (result.error !== "Cancelled") toast(t(U.installMessageKey(result.error)), "error", 6000);
  }
  return state.updateCheck;
}

/** Stop the download, or discard the downloaded update. */
export async function cancelUpdate() {
  const u = state.updateCheck;
  if (!u || (u.status !== "downloading" && u.status !== "ready")) return u;
  downloadGen++;
  update({ updateCheck: { ...release(u), install: u.install, status: "available" } });
  await U.cancelNow();
  if (u.status === "downloading") toast(t("update.cancelled"), "info");
  return state.updateCheck;
}

/** "Restart to update": the host swaps the app and restarts it. */
export async function applyUpdate() {
  const u = state.updateCheck;
  if (!u || u.status !== "ready") return u;
  update({ updateCheck: { ...u, status: "installing" } });
  const result = await U.applyNow();
  if (result.ok) return state.updateCheck; // the app is quitting
  const install = U.INSTALL_BLOCKED.includes(result.error) ? { can: false, blocked: result.error } : u.install;
  update({ updateCheck: { ...u, install, status: result.error === "NotReady" ? "available" : "ready", installError: result.error } });
  toast(t(U.installMessageKey(result.error)), "error", 6000);
  return state.updateCheck;
}

/**
 * Start-up: say how the last install went, and pick up a download
 * that finished before the page was reloaded. No network request.
 */
export async function restoreUpdateState() {
  const { status: s } = await U.installInfo({}, { probe: false });
  if (s.phase === "unavailable") return null;
  if (s.justUpdated) toast(t("update.installed", [APP_VERSION]), "success", 6000);
  else if (s.installFailed) toast(t("update.rolledBack"), "warn", 8000);
  if (!state.updateCheck && s.tag && (s.phase === "ready" || U.installStatusOf(s.phase) === "downloading")) {
    const base = { latest: s.tag, current: APP_VERSION, url: "", notes: "", publishedAt: "", install: { can: s.canInstall, blocked: s.blocked } };
    if (s.phase === "ready") update({ updateCheck: { ...base, status: "ready" } });
    // A download still running belongs to a page that is gone; it is
    // stopped so the player can start again from "available".
    else {
      await U.cancelNow();
      update({ updateCheck: { ...base, status: "available" } });
    }
  }
  return s;
}
