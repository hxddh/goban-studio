/**
 * Optional KataGo networks: the pure logic and the host calls.
 *
 * Goban Studio is complete offline with the small network it ships. In
 * Settings the player may download two more, and only then does the app
 * fetch anything:
 *
 *   human   KataGo's human SL model: the opponent plays like a person of
 *           its rank where it measured well (opponents.js levelFor)
 *   strong  a larger standard network: analysis, review, hints and the
 *           top level
 *
 * The native host owns everything that touches the network or the disk
 * (src/models.zig): the page names a kind, never an address; the host
 * fetches only its pinned URLs, verifies the pinned SHA-256 before the file
 * gets its final name, writes only under the app's data directory, and
 * resumes a stopped download. The browser preview has no host: every model
 * is "unavailable".
 *
 * Host API (all synchronous bridge calls; the download itself runs on a
 * host thread and is polled):
 *
 *   studio.modelStatus   {}      → { available, human: Raw, strong: Raw }
 *   studio.modelDownload {kind}  → { ok, error?, models }
 *   studio.modelCancel   {kind}  → { ok, models }
 *   studio.modelRemove   {kind}  → { ok, error?, models }
 *
 *   Raw = { status: absent|partial|downloading|verifying|ready|failed,
 *           bytes, total, idleMs, needed, name, error, detail }
 */
import { hasNative, nativeInvoke } from "./host.js";

export const KINDS = ["human", "strong"];

/** What the page may say about each download before the host answers. */
export const MODELS = Object.freeze({
  human: Object.freeze({ kind: "human", name: "b18c384nbt-humanv0", bytes: 99_066_230 }),
  strong: Object.freeze({ kind: "strong", name: "g170e-b15c192-s1672170752-d466197061", bytes: 48_038_914 }),
});

/** No progress for this long while downloading: show "stalled". */
export const STALL_MS = 30_000;
/** How often the controller polls while a download runs. */
export const POLL_MS = 500;

const STATUSES = new Set(["absent", "partial", "downloading", "verifying", "ready", "failed"]);
/** Host errors with their own sentence (messages.js `models.error.<name>`). */
export const ERROR_KEYS = ["DiskFull", "Network", "ChecksumMismatch", "Busy", "NoDataDir", "HttpStatus", "SizeMismatch", "Corrupt"];

/** The state of one kind when there is no host (browser preview). */
export function unavailable(kind) {
  return { status: "unavailable", progress: 0, bytes: 0, total: MODELS[kind]?.bytes ?? 0, error: "", stalled: false, needed: 0, name: MODELS[kind]?.name ?? "" };
}

/** `state.models` before the host has answered (or without one). */
export function initialModels() {
  return { available: false, human: unavailable("human"), strong: unavailable("strong") };
}

/** One kind's host record → { status, progress, bytes, total, error, stalled, needed, name }. */
export function normalizeOne(kind, raw) {
  if (!raw || typeof raw !== "object" || !STATUSES.has(raw.status)) return unavailable(kind);
  const total = Number(raw.total) > 0 ? Number(raw.total) : MODELS[kind].bytes;
  const bytes = Math.max(0, Math.min(total, Number(raw.bytes) || 0));
  const status = raw.status;
  return {
    status,
    progress: status === "ready" ? 1 : total > 0 ? bytes / total : 0,
    bytes,
    total,
    error: status === "failed" ? String(raw.error || "Unknown") : "",
    stalled: status === "downloading" && Number(raw.idleMs) >= STALL_MS,
    needed: Number(raw.needed) || 0,
    name: String(raw.name || MODELS[kind].name),
  };
}

/** The host's status reply → `state.models`. */
export function normalizeStatus(reply) {
  if (!reply || typeof reply !== "object") return initialModels();
  const out = { available: reply.available === true };
  for (const kind of KINDS) out[kind] = out.available ? normalizeOne(kind, reply[kind]) : unavailable(kind);
  return out;
}

export const isInstalled = (models, kind) => models?.[kind]?.status === "ready";
export const isBusy = (one) => one?.status === "downloading" || one?.status === "verifying";
/** Keep polling while any download runs. */
export const needsPolling = (models) => KINDS.some((k) => isBusy(models?.[k]));

/**
 * What changed between two `state.models` for the toasts: [{ kind, event }]
 * with event "ready" or "failed" (a download that just finished).
 */
export function transitions(before, after) {
  const out = [];
  for (const kind of KINDS) {
    const was = before?.[kind]?.status;
    const now = after?.[kind]?.status;
    if (!isBusy(before?.[kind]) || was === now) continue;
    if (now === "ready") out.push({ kind, event: "ready" });
    else if (now === "failed") out.push({ kind, event: "failed" });
  }
  return out;
}

/** messages.js key for a host error (generic for anything else). */
export function errorKey(error) {
  return ERROR_KEYS.includes(error) ? `models.error.${error}` : "models.error.generic";
}

/** Bytes → megabytes with one decimal under 10 MB, whole above ("48", "9.5"). */
export function megabytes(bytes) {
  const mb = (Number(bytes) || 0) / 1_000_000;
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
}

/** Whole percent for a progress fraction (never shows 100 before "ready"). */
export function percent(one) {
  if (!one) return 0;
  if (one.status === "ready") return 100;
  return Math.min(99, Math.floor((one.progress || 0) * 100));
}

/* ------------------------------------------------------------ host calls */

/** Can this build download models at all? (false in the browser preview) */
export function canDownload() {
  return hasNative();
}

async function call(command, payload, deps) {
  const invoke = deps.invoke || nativeInvoke;
  const host = deps.hasHost ?? hasNative();
  if (!host) return null;
  try {
    return await invoke(command, payload);
  } catch (_) {
    return null;
  }
}

/** Current state of both downloads. `deps` ({ invoke, hasHost }) is for tests. */
export async function fetchStatus(deps = {}) {
  const reply = await call("studio.modelStatus", {}, deps);
  return reply ? normalizeStatus(reply) : initialModels();
}

/** Result of an action: { ok, error, models } with models normalized. */
function actionResult(reply) {
  if (!reply || typeof reply !== "object") return { ok: false, error: "Unavailable", models: initialModels() };
  return { ok: reply.ok === true, error: reply.error ? String(reply.error) : "", models: normalizeStatus(reply.models) };
}

function checkKind(kind) {
  if (!KINDS.includes(kind)) throw new Error(`unknown model kind: ${kind}`);
}

/** Start or resume a download (returns at once; poll fetchStatus). */
export async function download(kind, deps = {}) {
  checkKind(kind);
  return actionResult(await call("studio.modelDownload", { kind }, deps));
}

/** Stop a download; the partial file stays for a later resume. */
export async function cancel(kind, deps = {}) {
  checkKind(kind);
  return actionResult(await call("studio.modelCancel", { kind }, deps));
}

/** Delete a model (and any partial download). */
/**
 * Remove a downloaded network. The host never waits on a running search:
 * it answers Busy and stops that KataGo process when the search ends, so
 * this retries for a while (about 15 s) before giving up.
 */
export async function remove(kind, deps = {}) {
  checkKind(kind);
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let result = actionResult(await call("studio.modelRemove", { kind }, deps));
  for (let i = 0; i < 60 && !result.ok && result.error === "Busy"; i++) {
    await sleep(250);
    result = actionResult(await call("studio.modelRemove", { kind }, deps));
  }
  return result;
}
