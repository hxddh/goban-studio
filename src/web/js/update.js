/**
 * Update checks — a network request only when asked (the only other one is
 * an optional model download the player starts, models.js).
 *
 * The page never talks to the network itself (CSP `connect-src 'self'`).
 * The native host does one HTTPS GET of GitHub's "latest release" document
 * for this repository (`studio.checkUpdate`) when
 *
 *   - the player picks "Check for updates…", or
 *   - the player turned on "Check automatically once a week" (off by
 *     default) and a week has passed since the last check.
 *
 * Nothing is sent but the request itself: no identifiers, no version. The
 * browser preview has no host and reports `unavailable`.
 *
 * The version arithmetic and the weekly schedule are pure functions; the
 * two entry points take their dependencies as arguments so the tests can
 * drive them without a host.
 */
import { APP_VERSION } from "./version.js";
import { store } from "./data/store.js";
import * as Host from "./host.js";

/** When the last check was, in the store (data/store.js). */
export const UPDATE_KEY = "update.json";
const readJSON = (key, fallback) => {
  const v = store.get(key);
  return v && typeof v === "object" ? v : fallback;
};
const writeJSON = (key, value) => store.put(key, value);
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** The setting that turns the weekly check on (default false). */
const AUTO_SETTING = "autoUpdateCheck";

/** "v4.1.0" / "4.1" / "4.1.0-beta.2" → { major, minor, patch, pre } or null. */
export function parseVersion(text) {
  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?\s*$/.exec(String(text ?? ""));
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), patch: Number(m[3] ?? 0), pre: m[4] ? m[4].split(".") : [] };
}

function comparePre(a, b) {
  // A release outranks any of its pre-releases (semver §11).
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]);
    const nb = /^\d+$/.test(b[i]);
    if (na && nb) {
      const d = Number(a[i]) - Number(b[i]);
      if (d) return Math.sign(d);
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

/** -1, 0 or 1; null when either side is not a version. */
export function compareVersions(a, b) {
  const va = typeof a === "string" ? parseVersion(a) : a;
  const vb = typeof b === "string" ? parseVersion(b) : b;
  if (!va || !vb) return null;
  for (const k of ["major", "minor", "patch"]) {
    if (va[k] !== vb[k]) return va[k] > vb[k] ? 1 : -1;
  }
  return comparePre(va.pre, vb.pre);
}

/** Is `latest` a newer version than `current`? (false when unparseable) */
export function isNewer(latest, current = APP_VERSION) {
  return compareVersions(latest, current) === 1;
}

/** Is an automatic check due? Only when enabled, and a week after the last one. */
export function isCheckDue({ enabled, lastCheck, now = Date.now(), interval = WEEK_MS }) {
  if (!enabled) return false;
  const last = Number(lastCheck);
  if (!Number.isFinite(last) || last <= 0) return true;
  // A clock moved backwards counts as "checked just now", not "never".
  if (last > now) return false;
  return now - last >= interval;
}

/** When the next automatic check falls due (ms), or null when it is off. */
export function nextCheckAt({ enabled, lastCheck, now = Date.now(), interval = WEEK_MS }) {
  if (!enabled) return null;
  const last = Number(lastCheck);
  if (!Number.isFinite(last) || last <= 0) return now;
  return Math.max(now, last + interval);
}

/**
 * Turn the host's reply into what the interface shows:
 *
 *   { status: "available", latest, current, url, notes, publishedAt }
 *   { status: "current",   latest, current, url }
 *   { status: "unavailable" }                    browser preview / old host
 *   { status: "error", error }                   Network, Timeout, RateLimited…
 */
export function interpretReply(reply, current = APP_VERSION) {
  if (!reply || typeof reply !== "object") return { status: "error", error: "BadResponse" };
  if (reply.ok !== true) {
    const error = String(reply.error || "Unknown");
    return error === "unavailable" ? { status: "unavailable" } : { status: "error", error };
  }
  const latest = String(reply.latest || "");
  if (!parseVersion(latest)) return { status: "error", error: "BadResponse" };
  const base = { latest, current, url: String(reply.url || ""), publishedAt: String(reply.publishedAt || "") };
  if (isNewer(latest, current)) return { status: "available", ...base, notes: String(reply.notes || "") };
  return { status: "current", ...base };
}

export function loadUpdateState(read = readJSON) {
  const v = read(UPDATE_KEY, {});
  return { lastCheck: Number(v.lastCheck) || 0, lastResult: v.lastResult && typeof v.lastResult === "object" ? v.lastResult : null };
}

function remember(result, now, write) {
  // Errors do not reset the week: a failed weekly check retries next launch.
  if (result.status === "unavailable" || result.status === "error") return;
  const { status, latest, url, publishedAt } = result;
  write(UPDATE_KEY, { lastCheck: now, lastResult: { status, latest, url, publishedAt } });
}

/**
 * Check now (the menu item). Resolves to an `interpretReply` result.
 * `deps` is for the tests: { check, now, current, write }.
 */
export async function checkNow(deps = {}) {
  const check = deps.check || Host.checkUpdate;
  const now = deps.now ?? Date.now();
  const current = deps.current || APP_VERSION;
  let reply;
  try {
    reply = await check();
  } catch (_) {
    reply = { ok: false, error: "Network" };
  }
  const result = interpretReply(reply, current);
  remember(result, now, deps.write || writeJSON);
  return result;
}

/**
 * The weekly check, run once after start-up. Does nothing — no request —
 * unless `settings.autoUpdateCheck` is true and a week has passed. Resolves
 * to the result, or null when no check was made.
 * `deps`: { check, now, current, read, write, hasHost }.
 */
export async function autoCheckIfDue(settings, deps = {}) {
  const hasHost = deps.hasHost ?? Host.hasNative();
  if (!hasHost) return null;
  const now = deps.now ?? Date.now();
  const { lastCheck } = loadUpdateState(deps.read || readJSON);
  if (!isCheckDue({ enabled: settings?.[AUTO_SETTING] === true, lastCheck, now })) return null;
  return checkNow({ ...deps, now });
}

/** Can this build check at all? (false in the browser preview) */
export function canCheckUpdates() {
  return Host.canCheckUpdates();
}

/** Open the app's releases page in the system browser (fixed address). */
export function openReleasePage() {
  return Host.openReleasePage();
}

/* ------------------------------------------------------ Update install */
//
// After a check found a newer release, "Download and install" asks the host
// to fetch this platform's package of that release and the release's
// SHA256SUMS from GitHub (github.com/hxddh/goban-studio/releases/download/…
// only), verify, unpack, and — on "Restart to update" — swap the app and
// restart it, rolling back if the new version does not start. The host
// decides whether this installation can be replaced at all (a read-only
// location, App Translocation or a development build cannot); then the
// interface offers "Open download page" instead.

/** Why an installation cannot update itself (`status.blocked`). */
export const INSTALL_BLOCKED = ["Unsupported", "NotPackaged", "Translocated", "ReadOnlyLocation", "NoTempDir"];

/** Error names `studio.updateDownload` / `studio.updateApply` can answer. */
export const INSTALL_ERRORS = [
  "Busy",
  "BadTag",
  // The host installs only the tag its own last check found, and only
  // a newer one than this version.
  "NotChecked",
  "NotNewer",
  "Network",
  "BadRedirect",
  "HttpStatus",
  "NoAsset",
  "TooLarge",
  "NoChecksum",
  // Builds with an update key (docs/signing.md): SHA256SUMS.sig is
  // missing or does not verify.
  "NoSignature",
  "BadSignature",
  // The signed checksums name no version (a signed build refuses that),
  // or name another one than the release asked for; or the package itself
  // says it is another version.
  "NoVersion",
  "VersionMismatch",
  "ChecksumMismatch",
  "Unpack",
  "BadPackage",
  "Disk",
  "Stalled",
  "Cancelled",
  "NotReady",
  "Helper",
  // Another helper is updating this installation; the helper never
  // proved it started (the app stays open).
  "HelperBusy",
  "HelperNotStarted",
  "QuitFailed",
  "OutOfMemory",
  "Unavailable",
  ...INSTALL_BLOCKED,
];

/** How often the page asks for download progress (ms). */
const INSTALL_POLL_MS = 500;

const PHASES = ["idle", "downloading", "verifying", "unpacking", "ready", "installing", "failed", "cancelled"];

/**
 * Normalize a `studio.updateStatus` reply:
 *
 *   { phase, tag, received, total, progress (0…1 or null), retries, error,
 *     canInstall, blocked, justUpdated, installFailed }
 *
 * `retries`: how often the host continued the download on a new connection
 * after the old one went silent (0 on a host that does not report it). The
 * download is still running; the interface may say it is reconnecting.
 *
 * phase "unavailable" without a host (canInstall false, blocked "Unsupported").
 */
export function interpretInstallStatus(reply) {
  if (!reply || typeof reply !== "object" || reply.ok !== true) {
    return { phase: "unavailable", tag: "", received: 0, total: 0, progress: null, retries: 0, error: "", canInstall: false, blocked: "Unsupported", justUpdated: false, installFailed: false };
  }
  const received = Math.max(0, Number(reply.received) || 0);
  const total = Math.max(0, Number(reply.total) || 0);
  const blocked = INSTALL_BLOCKED.includes(reply.blocked) ? reply.blocked : "";
  return {
    phase: PHASES.includes(reply.phase) ? reply.phase : "idle",
    tag: String(reply.tag || ""),
    received,
    total,
    progress: total > 0 ? Math.min(1, received / total) : null,
    retries: Math.max(0, Math.floor(Number(reply.retries) || 0)),
    error: String(reply.error || ""),
    canInstall: reply.canInstall === true && !blocked,
    blocked,
    justUpdated: reply.justUpdated === true,
    installFailed: reply.installFailed === true,
  };
}

/** `studio.updateDownload`'s reply → { ok: true, tag } | { ok: false, error }. */
export function interpretDownloadReply(reply) {
  if (reply && typeof reply === "object" && reply.ok === true && reply.phase === "ready") return { ok: true, tag: String(reply.tag || "") };
  const error = reply && typeof reply === "object" ? String(reply.error || "Unavailable") : "BadResponse";
  return { ok: false, error: error === "unavailable" ? "Unsupported" : error };
}

/** The `updateCheck.status` a host phase is shown as (null: not installing). */
export function installStatusOf(phase) {
  if (phase === "downloading" || phase === "verifying" || phase === "unpacking") return "downloading";
  if (phase === "ready" || phase === "installing") return phase;
  return null;
}

/** "download" | "verify" | "unpack" — the step of a "downloading" status. */
export function installStepOf(phase) {
  return phase === "verifying" ? "verify" : phase === "unpacking" ? "unpack" : "download";
}

/**
 * When install is impossible, or failed in a way a retry will not fix, the
 * interface falls back to "Open download page".
 */
export function installFallsBack(code) {
  return INSTALL_BLOCKED.includes(code) || ["NoAsset", "NoChecksum", "NoSignature", "BadSignature", "NoVersion", "VersionMismatch", "ChecksumMismatch", "BadPackage", "BadTag", "BadRedirect", "Helper", "NotNewer"].includes(code);
}

/** The message key that explains an install error or block to the player. */
export function installMessageKey(code) {
  switch (code) {
    case "ReadOnlyLocation":
      return "update.readOnly";
    case "Translocated":
      return "update.translocated";
    case "NotPackaged":
    case "Unsupported":
    case "NoTempDir":
      return "update.cannotInstall";
    case "ChecksumMismatch":
    case "NoChecksum":
    case "NoSignature":
    case "BadSignature":
    case "NoVersion":
    case "VersionMismatch":
    case "BadPackage":
    case "Unpack":
      return "update.verifyError";
    case "Cancelled":
      return "update.cancelled";
    case "Disk":
      return "update.diskError";
    case "NotReady":
    case "Helper":
    case "HelperBusy":
    case "HelperNotStarted":
    case "QuitFailed":
      return "update.applyError";
    default:
      return "update.downloadError";
  }
}

/** "12.3 MB" — for "Downloading… 12.3 MB of 98.0 MB". */
export function formatBytes(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Can this installation update itself? → { can, blocked, status } (one
 * status call; with `probe` the host checks that the app's folder is
 * writable — once a session).
 */
export async function installInfo(deps = {}, { probe = true } = {}) {
  let reply;
  try {
    reply = await (deps.status || Host.updateStatus)({ probe });
  } catch (_) {
    reply = null;
  }
  const status = interpretInstallStatus(reply);
  return { can: status.canInstall, blocked: status.canInstall ? "" : status.blocked || "Unsupported", status };
}

/**
 * Download `tag`, reporting progress. Resolves to interpretDownloadReply().
 * `deps`: { download, status, onProgress(status), pollMs, sleep } (tests).
 */
export async function downloadNow(tag, deps = {}) {
  const download = deps.download || Host.updateDownload;
  const status = deps.status || Host.updateStatus;
  const sleep = deps.sleep || wait;
  const pollMs = deps.pollMs ?? INSTALL_POLL_MS;
  let done = false;
  const finished = Promise.resolve()
    .then(() => download(tag))
    .catch(() => ({ ok: false, error: "Network" }))
    .finally(() => {
      done = true;
    });
  const poll = (async () => {
    while (!done) {
      await sleep(pollMs);
      if (done) break;
      try {
        const s = interpretInstallStatus(await status());
        if (!done && deps.onProgress) deps.onProgress(s);
      } catch (_) {
        // Progress is best effort; the download's own answer decides.
      }
    }
  })();
  const reply = await finished;
  await poll;
  return interpretDownloadReply(reply);
}

/** Install the downloaded update; the host quits on success. → { ok, error? } */
export async function applyNow(deps = {}) {
  let reply;
  try {
    reply = await (deps.apply || Host.updateApply)();
  } catch (_) {
    reply = { ok: false, error: "Unavailable" };
  }
  if (reply && reply.ok === true) return { ok: true };
  const error = reply && typeof reply === "object" ? String(reply.error || "Unavailable") : "BadResponse";
  return { ok: false, error: error === "unavailable" ? "Unsupported" : error };
}

/** Stop a download or discard a downloaded update. */
export async function cancelNow(deps = {}) {
  try {
    return await (deps.cancel || Host.updateCancel)();
  } catch (_) {
    return { ok: false, error: "Unavailable" };
  }
}
