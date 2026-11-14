/**
 * Host port: the Native SDK bridge when it exists, the browser when it does
 * not. Nothing here knows about Go.
 */
const global = typeof window !== "undefined" ? window : globalThis;

export function hasNative() {
  return typeof global.zero === "object" && global.zero != null && typeof global.zero.invoke === "function";
}

/**
 * The page runs inside the packaged app rather than the browser
 * preview: the shell serves it from its own zero:// origin (macOS, Linux)
 * or from WebView2's virtual host native-sdk-app.localhost (Windows).
 * Packaged, a missing bridge is an error to show, never a reason to fall
 * back to the browser's storage.
 */
export function isPackaged() {
  try {
    const loc = global.location;
    return loc?.protocol === "zero:" || loc?.hostname === "native-sdk-app.localhost";
  } catch (_) {
    return false;
  }
}

function invoke(command, payload = {}) {
  if (!hasNative()) return Promise.reject(new Error("no native host"));
  return Promise.resolve(global.zero.invoke(command, payload));
}

export async function nativeInvoke(command, payload) {
  return invoke(command, payload);
}

async function windowChrome() {
  if (!hasNative()) return { top: 0, left: 0, right: 0 };
  try {
    const r = await invoke("studio.windowChrome");
    return r && typeof r === "object" ? r : { top: 0, left: 0, right: 0 };
  } catch (_) {
    return { top: 0, left: 0, right: 0 };
  }
}

function windowDrag() {
  if (hasNative()) invoke("studio.windowDrag").catch(() => {});
}

/**
 * The window frame follows the app's Appearance setting: "light", "dark",
 * or "auto" (the system's). macOS only; elsewhere, and on an older shell,
 * nothing happens.
 */
export function setWindowTheme(appearance) {
  if (!hasNative()) return;
  const scheme = appearance === "light" || appearance === "dark" ? appearance : "system";
  invoke("studio.windowTheme", { scheme }).catch(() => {});
}

/* ------------------------------------------------------- the user's files */
//
// The host reads and writes only files it handed out itself — what
// the open / save dialogs below returned, documents the OS opened with the
// app, files dropped on the window — and only .sgf, .json and .png
// (src/files.zig). Any other path is refused (`AccessDenied`), so these
// helpers resolve null / false for it.

/** Raw bytes per file call (as store.zig chunk_bytes; base64 fits one bridge message). */
export const FILE_CHUNK_BYTES = 384 * 1024;

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Write `bytes` to `path` through `studio.writeTextFile`, in chunks: one
 * call when it fits, else chunks from offset 0 in order, the last with
 * `done` (the host writes beside the file and renames it over at the end).
 * `call` is the bridge (a parameter so the tests can drive it).
 */
export async function writeFileChunks(call, path, bytes) {
  if (bytes.length <= FILE_CHUNK_BYTES) {
    await call("studio.writeTextFile", { path, b64: bytesToBase64(bytes) });
    return;
  }
  for (let offset = 0; offset < bytes.length; offset += FILE_CHUNK_BYTES) {
    const end = Math.min(bytes.length, offset + FILE_CHUNK_BYTES);
    await call("studio.writeTextFile", { path, b64: bytesToBase64(bytes.subarray(offset, end)), offset, done: end >= bytes.length });
  }
}

/** The whole file at `path` through `studio.readTextFile` ({size, b64} per chunk). */
export async function readFileChunks(call, path) {
  const parts = [];
  let offset = 0;
  let size = 0;
  for (;;) {
    const r = await call("studio.readTextFile", { path, offset });
    if (!r || typeof r !== "object" || typeof r.b64 !== "string") throw new Error("BadReply");
    size = Number(r.size) || 0;
    const bytes = base64ToBytes(r.b64);
    parts.push(bytes);
    offset += bytes.length;
    if (offset >= size || !bytes.length) break;
  }
  if (offset !== size) throw new Error("Changed");
  const all = new Uint8Array(offset);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

export async function writeTextFile(path, text) {
  return writeBinaryFile(path, new TextEncoder().encode(text));
}

/** Write bytes (a Uint8Array) through the same native file command. */
export async function writeBinaryFile(path, bytes) {
  if (!hasNative()) return false;
  try {
    await writeFileChunks(invoke, path, bytes);
    return true;
  } catch (_) {
    return false;
  }
}

export async function readTextFile(path) {
  const bytes = await readFileBytes(path);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

/** The file's raw bytes (a Uint8Array), or null; SGF import decodes them by CA. */
export async function readFileBytes(path) {
  if (!hasNative()) return null;
  try {
    return await readFileChunks(invoke, path);
  } catch (_) {
    return null;
  }
}

/** Normalize native dialog / drop results to a list of string paths. */
export function normalizePaths(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  return list
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item.path === "string") return item.path;
      if (item && typeof item === "object" && typeof item.toString === "function") {
        const text = item.toString();
        return text && text !== "[object Object]" ? text : "";
      }
      return "";
    })
    .filter(Boolean);
}

/** The host's own dialogs exist wherever the host does. */
export function hasFileDialogs() {
  return hasNative();
}

/** Only what the native dialogs understand, as plain strings / booleans. */
function dialogPayload(options = {}) {
  const out = {};
  if (options.title != null) out.title = String(options.title);
  if (options.defaultName != null) out.defaultName = String(options.defaultName);
  if (options.defaultPath != null) out.defaultPath = String(options.defaultPath);
  if (options.allowMultiple) out.allowMultiple = true;
  return out;
}

/**
 * Let the user pick a file to read (`studio.openFileDialog`). Resolves the
 * chosen paths (an array; a file the app does not read is listed but stays
 * unreadable, so the import reports a failure)
 * or null when cancelled or unavailable.
 */
export async function openFileDialog(options = {}, call = invoke) {
  if (call === invoke && !hasNative()) return null;
  try {
    const paths = await call("studio.openFileDialog", dialogPayload(options));
    return Array.isArray(paths) && paths.length ? paths : null;
  } catch (_) {
    return null;
  }
}

/**
 * Let the user choose where to save (`studio.saveFileDialog`).
 * `defaultName` must end in .sgf, .json or .png; the host adds that
 * extension when the user types a name without one — and when a file of
 * that completed name already exists (the dialog never asked about it),
 * the host returns the next free name ("game (2).sgf") instead of
 * replacing it. So write to, and show, the path this resolves, not the
 * name that was suggested. Resolves the path, or null when cancelled or
 * unavailable.
 */
export async function saveFileDialog(options = {}, call = invoke) {
  if (call === invoke && !hasNative()) return null;
  try {
    const path = await call("studio.saveFileDialog", dialogPayload(options));
    return typeof path === "string" && path ? path : null;
  } catch (_) {
    return null;
  }
}

export function revealPath(path) {
  if (!hasNative() || !global.zero.os || typeof global.zero.os.revealPath !== "function") return;
  try {
    global.zero.os.revealPath(path);
  } catch (_) {}
}

/**
 * Show the folder that holds the player's settings, progress and games in
 * Finder / Explorer (`studio.revealDataDir`). The host knows the folder;
 * the page names no path. Resolves `{ ok: true, path }` when the folder
 * was handed to the system, else `{ ok: false, path, error }` (`path` is
 * "" when unknown; error "unavailable" without a host or on an older one,
 * "NoDataDir" when the app has no data folder).
 */
export async function revealDataDir(call = invoke) {
  if (call === invoke && !hasNative()) return { ok: false, path: "", error: "unavailable" };
  try {
    const reply = await call("studio.revealDataDir", {});
    const path = reply && typeof reply.path === "string" ? reply.path : "";
    if (reply && reply.ok === true) return { ok: true, path };
    return { ok: false, path, error: String((reply && reply.error) || "Failed") };
  } catch (e) {
    return { ok: false, path: "", error: /unknown|not found|unsupported|no handler/i.test(String(e?.message || e)) ? "unavailable" : "Failed" };
  }
}

export function onDropFiles(handler) {
  if (!hasNative() || typeof global.zero.on !== "function") return () => {};
  try {
    return global.zero.on("drop:files", handler);
  } catch (_) {
    return () => {};
  }
}

export function onOpenFiles(handler) {
  if (!hasNative() || typeof global.zero.on !== "function") return () => {};
  try {
    return global.zero.on("open:files", handler);
  } catch (_) {
    return () => {};
  }
}

/**
 * Paths delivered by the operating system before the page was ready, or
 * while the app was already running. The native queue is consumed by this
 * call, so a document cannot be opened twice by two timers.
 */
export async function takeOpenFiles() {
  if (!hasNative()) return [];
  try {
    const value = await invoke("studio.takeOpenFiles");
    return normalizePaths(value && typeof value === "object" ? value.paths : value);
  } catch (_) {
    return [];
  }
}

/**
 * Install the app's menus in the native menu bar (macOS; Windows keeps no
 * menu bar and resolves false). `spec` is
 *
 *   [{ title, items: [{ label, command, key?, shift?, alt?, enabled?,
 *                       checked?, separator? }] }]
 *
 * with localized labels; `key` is "n", ",", "arrowleft", … and ⌘ is
 * implied. The system App/File/Edit and View/Window menus stay around them.
 * Call again to update labels, checks or enabled states.
 */
export async function setNativeMenus(spec) {
  if (!hasNative() || !Array.isArray(spec)) return false;
  const menus = spec.map((menu) => ({
    title: String(menu?.title || ""),
    items: (menu?.items || []).map((item) =>
      item?.separator
        ? { separator: true }
        : {
            label: String(item?.label || ""),
            command: String(item?.command || ""),
            key: item?.key ? String(item.key).toLowerCase() : "",
            shift: !!item?.shift,
            alt: !!item?.alt,
            enabled: item?.enabled !== false,
            checked: !!item?.checked,
          },
    ),
  }));
  try {
    const reply = await invoke("studio.setMenus", { menus });
    return !!(reply && reply.applied);
  } catch (_) {
    return false;
  }
}

/** Call `handler(commandId)` for each native menu pick. Returns an unsubscribe. */
export function onMenuCommand(handler) {
  if (!hasNative() || typeof global.zero.on !== "function") return () => {};
  try {
    return global.zero.on("menu:command", (detail) => {
      const command = detail && typeof detail === "object" ? detail.command : detail;
      if (typeof command === "string" && command) handler(command);
    });
  } catch (_) {
    return () => {};
  }
}

/* ---------------------------------------------------- Quit flush */

/**
 * Before the app quits or its window closes (⌘Q, the window's close button
 * on Windows, an update restart), the host sends `app:flush` {id} and waits
 * up to 1.5 s for `studio.flushDone` {id}. `flush()` writes whatever is
 * pending (data/store.js). Installs the listener, tells the host the page
 * has one (`studio.flushHook`), and returns an unsubscribe. `host` and
 * `call` are parameters so the tests can drive it.
 */
export function installFlushHook(flush, { host = global.zero, call = invoke } = {}) {
  if (!host || typeof host.on !== "function" || typeof flush !== "function") return () => {};
  let off = () => {};
  try {
    off =
      host.on("app:flush", (detail) => {
        const id = detail && typeof detail === "object" ? Number(detail.id) : NaN;
        Promise.resolve()
          .then(() => flush())
          .catch(() => {})
          .finally(() => {
            if (Number.isFinite(id)) Promise.resolve(call("studio.flushDone", { id })).catch(() => {});
          });
      }) || (() => {});
    Promise.resolve(call("studio.flushHook", {})).catch(() => {});
  } catch (_) {}
  return off;
}

/** Release-build self-test configuration (empty in normal launches). */
export async function selftestConfig() {
  if (!hasNative()) return { enabled: false };
  try {
    const value = await invoke("studio.selftest");
    return value && typeof value === "object" ? value : { enabled: false };
  } catch (_) {
    return { enabled: false };
  }
}

/* ---------------------------------------------------------- Updates */

/** How long the page waits for `studio.checkUpdate` (the host gives up at 15 s). */
const UPDATE_TIMEOUT_MS = 20000;

/** Can this build check for updates? (false in the browser preview) */
export function canCheckUpdates() {
  return hasNative();
}

/**
 * Ask the host for the latest GitHub release — the app's only network
 * request, made only when this is called. Resolves to
 *
 *   { ok: true, latest: "v4.1.0", url, notes, publishedAt, prerelease }
 *   { ok: false, error }   error: "unavailable" (no host / old host),
 *                          "Timeout", "Network", "RateLimited", "NoRelease",
 *                          "Busy", "HttpStatus", "BadResponse", …
 *
 * Never rejects.
 */
export async function checkUpdate() {
  if (!hasNative()) return { ok: false, error: "unavailable" };
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, error: "Timeout" }), UPDATE_TIMEOUT_MS);
  });
  try {
    const reply = await Promise.race([invoke("studio.checkUpdate", {}), timeout]);
    return reply && typeof reply === "object" ? reply : { ok: false, error: "BadResponse" };
  } catch (e) {
    // An older host without the command answers with a bridge error.
    return { ok: false, error: /unknown|not found|unsupported|no handler/i.test(String(e?.message || e)) ? "unavailable" : "Network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Open the app's releases page in the system browser. The host opens one
 * fixed address (github.com/hxddh/goban-studio/releases/latest); nothing
 * the page passes can change it. Resolves true when it was handed to the OS.
 */
export async function openReleasePage() {
  if (!hasNative()) return false;
  try {
    const reply = await invoke("studio.openReleasePage", {});
    return !!(reply && reply.ok);
  } catch (_) {
    return false;
  }
}

/* ---------------------------------------------------- Update install */

/** How the bridge reports a command an older host does not have. */
function missingCommand(e) {
  return /unknown|not found|unsupported|no handler/i.test(String(e?.message || e));
}

/**
 * Where an update download / install stands (`studio.updateStatus`):
 *
 *   { ok: true, phase, tag, asset, platform, received, total, retries,
 *     error, canInstall, blocked, justUpdated, installFailed }
 *
 * phase: "idle" | "downloading" | "verifying" | "unpacking" | "ready" |
 *        "installing" | "failed" | "cancelled"
 * blocked (canInstall false): "Unsupported" | "NotPackaged" |
 *        "Translocated" | "ReadOnlyLocation" | "NoTempDir", or "NotChecked"
 *        until a call with { probe: true } — which tests, once a session,
 *        whether the app's folder is writable — has looked.
 * justUpdated: this launch is the new version, started by the updater.
 * installFailed: this launch is the old version, restored after a failed install.
 *
 * `{ ok: false, error: "unavailable" }` without a host or on an older host.
 */
export async function updateStatus({ probe = false } = {}) {
  if (!hasNative()) return { ok: false, error: "unavailable" };
  try {
    const reply = await invoke("studio.updateStatus", { probe: !!probe });
    return reply && typeof reply === "object" ? reply : { ok: false, error: "BadResponse" };
  } catch (e) {
    return { ok: false, error: missingCommand(e) ? "unavailable" : "Unavailable" };
  }
}

/**
 * Download, verify and unpack release `tag` for this platform
 * (`studio.updateDownload`). The host builds the address itself
 * (github.com/hxddh/goban-studio/releases/download/<tag>/…); the page only
 * names the tag. Resolves when done — this can take minutes; poll
 * `updateStatus()` for progress meanwhile:
 *
 *   { ok: true, phase: "ready", tag, asset }
 *   { ok: false, error }   see update.js INSTALL_ERRORS
 *
 * The host goes through the system's (or the environment's) HTTP proxy
 * when one is set, and continues a download whose connection broke off or
 * went silent from the bytes it already has (`retries` in the status).
 */
export async function updateDownload(tag) {
  if (!hasNative()) return { ok: false, error: "unavailable" };
  try {
    const reply = await invoke("studio.updateDownload", { tag: String(tag || "") });
    return reply && typeof reply === "object" ? reply : { ok: false, error: "BadResponse" };
  } catch (e) {
    return { ok: false, error: missingCommand(e) ? "unavailable" : "Network" };
  }
}

/** Stop a download, or discard a downloaded update. Resolves `{ ok, phase }`. */
export async function updateCancel() {
  if (!hasNative()) return { ok: false, error: "unavailable" };
  try {
    const reply = await invoke("studio.updateCancel", {});
    return reply && typeof reply === "object" ? reply : { ok: false, error: "BadResponse" };
  } catch (e) {
    return { ok: false, error: missingCommand(e) ? "unavailable" : "Unavailable" };
  }
}

/**
 * Install the downloaded update (`studio.updateApply`): the host starts its
 * helper, answers `{ ok: true, phase: "installing" }` and quits; the helper
 * restarts the app. The answer can take up to about 25 seconds (a cold
 * PowerShell under a virus scanner): `updateStatus()` says "installing"
 * from the first moment, so show that rather than a frozen button. `{ ok: false, error }` otherwise (NotReady,
 * ReadOnlyLocation, Translocated, NotPackaged, Helper, QuitFailed, …).
 */
export async function updateApply() {
  if (!hasNative()) return { ok: false, error: "unavailable" };
  try {
    const reply = await invoke("studio.updateApply", {});
    return reply && typeof reply === "object" ? reply : { ok: false, error: "BadResponse" };
  } catch (e) {
    return { ok: false, error: missingCommand(e) ? "unavailable" : "Unavailable" };
  }
}

export async function setupChrome() {
  const chrome = await windowChrome();
  const top = Math.max(0, Number(chrome.top) || 0);
  document.documentElement.style.setProperty("--titlebar-inset", top + "px");
  if (top > 0) {
    document.documentElement.dataset.nativeChrome = "inset";
    // The toolbar row is centred on the traffic lights (docs/design.md §7).
    const y = Number(chrome.buttonsY) || 0;
    const h = Number(chrome.buttonsH) || 0;
    if (h > 0) document.documentElement.style.setProperty("--tb", Math.max(44, Math.round(2 * y + h)) + "px");
  }
  // Any element marked data-drag moves the window (hidden title bar); its
  // buttons keep their clicks.
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = /** @type {Element} */ (e.target);
    if (!target.closest?.("[data-drag]")) return;
    if (target.closest("button, a, input, select, textarea, canvas")) return;
    windowDrag();
  });
}
