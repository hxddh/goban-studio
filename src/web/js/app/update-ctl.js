/**
 * Update checks for the interface (v4). See ../update.js for the rules:
 * one request to GitHub, only when the player asks or opted in to the
 * weekly check (setting `autoUpdateCheck`, default false).
 *
 * State for the views: `state.updateCheck` is null until a check has run,
 * then one of
 *
 *   { status: "checking" }
 *   { status: "available", latest, current, url, notes, publishedAt }
 *   { status: "current", latest, current, url, publishedAt }
 *   { status: "unavailable" }            browser preview
 *   { status: "error", error }
 */
import { t } from "../i18n.js";
import * as U from "../update.js";
import { state, update, toast } from "./store.js";

export const canCheckUpdates = U.canCheckUpdates;

/** "Check for updates…": check now and say what was found. */
export async function checkForUpdates({ quiet = false } = {}) {
  if (state.updateCheck?.status === "checking") return state.updateCheck;
  update({ updateCheck: { status: "checking" } });
  const result = await U.checkNow();
  update({ updateCheck: result });
  if (!quiet) {
    if (result.status === "available") toast(t("update.available", [result.latest]), "info", 6000);
    else if (result.status === "current") toast(t("update.current", [result.current]), "info");
    else if (result.status === "unavailable") toast(t("update.unavailable"), "warn");
    else toast(t("update.error"), "warn");
  }
  return result;
}

/** Start-up: the weekly check, when the player turned it on. */
export async function autoCheckForUpdates() {
  const result = await U.autoCheckIfDue(state.settings);
  if (!result) return null;
  update({ updateCheck: result });
  if (result.status === "available") toast(t("update.available", [result.latest]), "info", 6000);
  return result;
}

/** Open the releases page (fixed address) in the system browser. */
export function openReleasePage() {
  return U.openReleasePage();
}
