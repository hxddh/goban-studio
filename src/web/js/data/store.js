/**
 * v9 storage (docs/v9.md, "Storage"): every key in memory, written through.
 *
 *   await store.open()        read every key into memory (once)
 *   store.get(key)            the value, synchronously (undefined when absent)
 *   store.list(prefix)        the keys under a prefix, sorted
 *   store.put(key, value)     set now; written ~300 ms later (debounced per key)
 *   store.remove(key)         delete now; removed ~300 ms later
 *   await store.flush()       write everything pending now (quit, tests)
 *
 * Keys are relative paths of `[a-z0-9_-]+` segments separated by `/`,
 * ending in `.json`: settings.json, profile.json, current.json,
 * games/<id>.json. Values are JSON.
 *
 * Desktop: files under `<app data>/data`, through the host's
 * studio.store* commands (src/store.zig). A bridge message is at most
 * 1 MB, so a file larger than CHUNK_BYTES moves in chunks; the host renames
 * the finished file over the old one, so a file is never half written.
 * Browser preview (no host): localStorage under the prefix `goban9:`.
 *
 * A failed read or write is reported to `onError({ op, key, error })`
 * (the caller shows it); a failed write stays pending and is tried again
 * on the next put of that key or the next flush. Nothing fails silently.
 */
import { hasNative, nativeInvoke } from "../host.js";

/** Raw bytes per bridge call (as store.zig chunk_bytes). */
export const CHUNK_BYTES = 384 * 1024;
/** Largest value the store keeps (as store.zig max_file_bytes). */
export const MAX_BYTES = 8 * 1024 * 1024;
/** Debounce of writes, per key. */
export const WRITE_DELAY = 300;
/** localStorage prefix of the browser preview. */
export const LOCAL_PREFIX = "goban9:";

const SEGMENT = /^[a-z0-9_-]+$/;
const MAX_KEY = 200;
const MAX_DEPTH = 4;

/** A storable key (the same rule as store.zig validKey). */
export function validKey(key) {
  if (typeof key !== "string" || key.length <= 5 || key.length > MAX_KEY || !key.endsWith(".json")) return false;
  const segs = key.slice(0, -5).split("/");
  return segs.length <= MAX_DEPTH && segs.every((s) => SEGMENT.test(s));
}

/** A list prefix: "" or a directory ("games" or "games/"). */
export function validPrefix(prefix) {
  if (prefix === "") return true;
  if (typeof prefix !== "string" || prefix.length > MAX_KEY) return false;
  const segs = (prefix.endsWith("/") ? prefix.slice(0, -1) : prefix).split("/");
  return segs.length <= MAX_DEPTH && segs.every((s) => SEGMENT.test(s));
}

/* --------------------------------------------------------------- base64 */

function toBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const errorText = (e) => (e && typeof e === "object" && "message" in e ? String(e.message) : String(e));

/* ------------------------------------------------------------- backends */

/**
 * The host backend over an invoke(command, payload) function (host.js
 * nativeInvoke on the desktop; a fake in tests). Text in and out.
 */
export function hostBackend(invoke) {
  return {
    kind: "host",
    async list(prefix) {
      const keys = await invoke("studio.storeList", { prefix });
      if (!Array.isArray(keys)) throw new Error("BadReply");
      return keys.filter(validKey);
    },
    async read(key) {
      const parts = [];
      let offset = 0;
      let size = null;
      for (;;) {
        const r = await invoke("studio.storeRead", { key, offset });
        if (r == null) {
          if (offset === 0) return null;
          throw new Error("Changed");
        }
        if (typeof r !== "object" || typeof r.b64 !== "string" || !Number.isFinite(r.size)) throw new Error("BadReply");
        if (size != null && r.size !== size) throw new Error("Changed");
        size = r.size;
        const bytes = fromBase64(r.b64);
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
      return new TextDecoder().decode(all);
    },
    async write(key, text) {
      const bytes = new TextEncoder().encode(text);
      if (bytes.length > MAX_BYTES) throw new Error("TooLarge");
      if (bytes.length <= CHUNK_BYTES) {
        await invoke("studio.storeWrite", { key, b64: toBase64(bytes) });
        return;
      }
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const end = Math.min(bytes.length, offset + CHUNK_BYTES);
        await invoke("studio.storeWrite", { key, b64: toBase64(bytes.subarray(offset, end)), offset, done: end >= bytes.length });
      }
    },
    async remove(key) {
      await invoke("studio.storeRemove", { key });
    },
  };
}

/** A Storage-like object, or an in-memory one where localStorage is missing or locked. */
function localStorageOrMemory() {
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch (_) {
    /* file:// or a locked-down WebView */
  }
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

/** The browser preview's backend: one Storage, every key under `prefix`. */
export function localBackend(storage = localStorageOrMemory(), prefix = LOCAL_PREFIX) {
  return {
    kind: "local",
    async list(p) {
      const out = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix)) {
          const key = k.slice(prefix.length);
          if (validKey(key) && key.startsWith(p)) out.push(key);
        }
      }
      return out;
    },
    async read(key) {
      return storage.getItem(prefix + key);
    },
    async write(key, text) {
      storage.setItem(prefix + key, text);
    },
    async remove(key) {
      storage.removeItem(prefix + key);
    },
  };
}

/* ---------------------------------------------------------------- store */

/**
 * A store over a backend (default: the host when there is one, else
 * localStorage). `onError({ op: "list" | "read" | "write" | "remove", key,
 * error })` hears every failure; set it later with setErrorHandler.
 * `delay` is the write debounce, `timers` ({ set, clear }) lets tests drive time.
 */
export function createStore({ backend = null, onError = null, delay = WRITE_DELAY, timers = null } = {}) {
  // Chosen on first use, so the module can be imported before the host is ready.
  let chosen = backend;
  const backendNow = () => (chosen ||= hasNative() ? hostBackend(nativeInvoke) : localBackend());
  const setT = timers?.set || ((fn, ms) => setTimeout(fn, ms));
  const clearT = timers?.clear || ((id) => clearTimeout(id));
  const mem = new Map();
  /** key → "put" | "remove": what is still to be done on disk. */
  const pending = new Map();
  const timer = new Map();
  /** key → the promise of the last operation on that key (so they run in order). */
  const chain = new Map();
  let handler = onError;
  let opened = null;

  const report = (op, key, error) => {
    const e = { op, key, error: errorText(error) };
    if (handler) {
      try {
        handler(e);
      } catch (_) {
        /* a broken handler must not stop the store */
      }
    } else if (typeof console !== "undefined") console.error("store:", e);
    return e;
  };

  function checkKey(key) {
    if (!validKey(key)) throw new Error(`invalid store key: ${JSON.stringify(key)}`);
  }

  /** Start the pending operation of `key` now (after the one before it). */
  function run(key) {
    clearT(timer.get(key));
    timer.delete(key);
    const op = pending.get(key);
    if (!op) return chain.get(key) || Promise.resolve(true);
    pending.delete(key);
    const prev = chain.get(key) || Promise.resolve(true);
    const next = prev.then(async () => {
      // A newer operation of the same key was queued meanwhile: it carries the latest value.
      if (pending.has(key)) return true;
      try {
        if (op === "remove") await backendNow().remove(key);
        else {
          const text = JSON.stringify(mem.get(key));
          if (text === undefined) throw new Error("NotJson");
          await backendNow().write(key, text);
        }
        return true;
      } catch (err) {
        // Kept pending: the next put of this key, or the next flush, tries again.
        if (!pending.has(key)) pending.set(key, op);
        report(op === "remove" ? "remove" : "write", key, err);
        return false;
      }
    });
    chain.set(key, next);
    next.then(() => {
      if (chain.get(key) === next) chain.delete(key);
    });
    return next;
  }

  function schedule(key, op) {
    pending.set(key, op);
    clearT(timer.get(key));
    timer.set(key, setT(() => run(key), delay));
  }

  const api = {
    /** "host" or "local". */
    get backend() {
      return backendNow().kind;
    },

    setErrorHandler(fn) {
      handler = typeof fn === "function" ? fn : null;
    },

    /** Read every key into memory. Unreadable files are reported and left out. */
    open() {
      if (opened) return opened;
      opened = (async () => {
        let keys = [];
        try {
          keys = await backendNow().list("");
        } catch (err) {
          report("list", "", err);
          return api;
        }
        for (const key of [...new Set(keys)].sort()) {
          try {
            const text = await backendNow().read(key);
            if (text == null) continue;
            // A put made before open finished is newer than the disk.
            if (!mem.has(key) && !pending.has(key)) mem.set(key, JSON.parse(text));
          } catch (err) {
            report("read", key, err);
          }
        }
        return api;
      })();
      return opened;
    },

    get(key) {
      return mem.get(key);
    },

    has(key) {
      return mem.has(key);
    },

    /** Keys under `prefix` ("" for all, "games/" for the games), sorted. */
    list(prefix = "") {
      return [...mem.keys()].filter((k) => k.startsWith(prefix)).sort();
    },

    /** Set `key` to `value` (JSON) now; written after the debounce. */
    put(key, value) {
      checkKey(key);
      if (value === undefined) throw new Error("store.put needs a value; use remove()");
      mem.set(key, value);
      schedule(key, "put");
    },

    remove(key) {
      checkKey(key);
      mem.delete(key);
      schedule(key, "remove");
    },

    /** Replace every key with `data` ({ key: value }); used by backup import. */
    replaceAll(data) {
      for (const key of Object.keys(data)) checkKey(key);
      for (const key of [...mem.keys()]) if (!(key in data)) api.remove(key);
      for (const [key, value] of Object.entries(data)) api.put(key, value);
    },

    /** Every key and value now in memory: { key: value }. */
    snapshot() {
      return Object.fromEntries([...mem.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    },

    /** Keys with a write or removal not yet on disk. */
    pending() {
      return [...pending.keys()].sort();
    },

    /** Write everything pending now; true when all of it reached the disk. */
    async flush() {
      const keys = new Set([...pending.keys(), ...chain.keys()]);
      const results = await Promise.all([...keys].map((k) => run(k)));
      return results.every(Boolean) && pending.size === 0;
    },
  };
  return api;
}

/** The app's store (opened by the shell at boot). */
export const store = createStore();
