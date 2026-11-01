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

export async function setupChrome() {
  const chrome = await windowChrome();
  const top = Math.max(0, Number(chrome.top) || 0);
  document.documentElement.style.setProperty("--titlebar-inset", top + "px");
  if (top > 0) document.documentElement.dataset.nativeChrome = "inset";
  const bar = document.querySelector(".topbar");
  if (bar) {
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // Only the empty part of the bar drags; buttons keep their click.
      if (e.target.closest("button, a, input, select, textarea")) return;
      windowDrag();
    });
  }
}
