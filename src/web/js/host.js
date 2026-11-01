/**
 * Host port: the Native SDK bridge when it exists, the browser when it does
 * not. Nothing here knows about Go.
 */
const global = typeof window !== "undefined" ? window : globalThis;

export function hasNative() {
  return typeof global.zero === "object" && global.zero != null && typeof global.zero.invoke === "function";
}

function invoke(command, payload = {}) {
  if (!hasNative()) return Promise.reject(new Error("no native host"));
  return Promise.resolve(global.zero.invoke(command, payload));
}

export async function nativeInvoke(command, payload) {
  return invoke(command, payload);
}

export async function windowChrome() {
  if (!hasNative()) return { top: 0, left: 0, right: 0 };
  try {
    const r = await invoke("studio.windowChrome");
    return r && typeof r === "object" ? r : { top: 0, left: 0, right: 0 };
  } catch (_) {
    return { top: 0, left: 0, right: 0 };
  }
}

export function windowDrag() {
  if (hasNative()) invoke("studio.windowDrag").catch(() => {});
}

export async function writeTextFile(path, text) {
  if (!hasNative()) return false;
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  try {
    await invoke("studio.writeTextFile", { path, b64: btoa(bin) });
    return true;
  } catch (_) {
    return false;
  }
}

export async function readTextFile(path) {
  if (!hasNative()) return null;
  try {
    const b64 = await invoke("studio.readTextFile", { path });
    if (typeof b64 !== "string") return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
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

export function hasFileDialogs() {
  return hasNative() && !!global.zero.dialogs && typeof global.zero.dialogs.openFile === "function" && typeof global.zero.dialogs.saveFile === "function";
}

export async function openFileDialog(options = {}) {
  if (!hasNative() || !global.zero.dialogs || typeof global.zero.dialogs.openFile !== "function") return null;
  try {
    return await global.zero.dialogs.openFile(options);
  } catch (_) {
    return null;
  }
}

export async function saveFileDialog(options = {}) {
  if (!hasNative() || !global.zero.dialogs || typeof global.zero.dialogs.saveFile !== "function") return null;
  try {
    return await global.zero.dialogs.saveFile(options);
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

export async function setupChrome() {
  const chrome = await windowChrome();
  const top = Math.max(0, Number(chrome.top) || 0);
  document.documentElement.style.setProperty("--titlebar-inset", top + "px");
  if (top > 0) document.documentElement.dataset.nativeChrome = "inset";
  // Any element marked data-drag moves the window (hidden title bar); its
  // buttons keep their clicks.
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!e.target.closest?.("[data-drag]")) return;
    if (e.target.closest("button, a, input, select, textarea, canvas")) return;
    windowDrag();
  });
}
