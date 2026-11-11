/**
 * v9 storage (docs/v9.md, "Storage"): every key in memory, written through.
 *
 *   await store.open()        read every key into memory (once)
 *   store.get(key)            the value, synchronously (undefined when absent)
 *   store.list(prefix)        the keys under a prefix, sorted
 *   store.put(key, value)     set now; written ~300 ms later (debounced per key)
 *   store.remove(key)         delete now; removed ~300 ms later
 *   await store.flush()       write everything pending now (quit, tests)
 *   store.onFlush(fn)         fn() first, at every flush
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
 *
 * v13 (docs/storage.md):
 *
 *   await store.open({ lazy })  keys under a `lazy` prefix are listed, not
 *                               read (games/: read when a view needs one);
 *                               the rest are read in parallel
 *   await store.load(key)       read one listed key into memory
 *   store.isLoaded(key)         in memory (false: on disk, not read yet)
 *   store.openReport            { listFailed, failed: [{ key, kind, error, preserved }] }
 *
 * A key that could not be read (or was saved by a newer version) is
 * write-blocked: what the app puts there stays in memory and is never
 * written over the file it could not read. A file that is not JSON is
 * first copied, byte for byte, to `bad/<key>-<time>.json` (then moved
 * aside, or kept and blocked for the core files: open's `keepDamaged`). `readOnly`
 * holds every write (the app's safe state, docs/storage.md). A `migrate`
 * hook (data/migrate.js) brings each file read to the current format.
 */
import { hasNative, installFlushHook, isPackaged, nativeInvoke } from "../host.js";

/** Raw bytes per bridge call (as store.zig chunk_bytes). */
export const CHUNK_BYTES = 384 * 1024;
/** Largest value the store keeps (as store.zig max_file_bytes). */
export const MAX_BYTES = 8 * 1024 * 1024;
/** Debounce of writes, per key. */
export const WRITE_DELAY = 300;
/** localStorage prefix of the browser preview. */
export const LOCAL_PREFIX = "goban9:";

/** Copies of files that could not be parsed (never read back by open). */
export const BAD_PREFIX = "bad/";
/** Reads at once while opening or loading many keys. */
const PARALLEL = 8;

const SEGMENT = /^[a-z0-9_-]+$/;
const MAX_KEY = 200;
const MAX_DEPTH = 4;

/** A storable key (the same rule as store.zig validKey). */
/**
 * Windows reserves these names in every folder, with or without an
 * extension: CON, PRN, AUX, NUL, COM1-9, LPT1-9, in any case (store.zig
 * isDeviceName refuses the same keys, so a backup made on macOS restores
 * on Windows).
 */
export function isDeviceName(name) {
  const stem = String(name).split(".")[0].replace(/ +$/, "");
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem);
}

export function validKey(key) {
  if (typeof key !== "string" || key.length <= 5 || key.length > MAX_KEY || !key.endsWith(".json")) return false;
  const segs = key.slice(0, -5).split("/");
  return segs.length <= MAX_DEPTH && segs.every((s) => SEGMENT.test(s) && !isDeviceName(s));
}

/** A list prefix: "" or a directory ("games" or "games/"). */
export function validPrefix(prefix) {
  if (prefix === "") return true;
  if (typeof prefix !== "string" || prefix.length > MAX_KEY) return false;
  const segs = (prefix.endsWith("/") ? prefix.slice(0, -1) : prefix).split("/");
  return segs.length <= MAX_DEPTH && segs.every((s) => SEGMENT.test(s) && !isDeviceName(s));
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

/** Run `fn` over `items`, at most `n` at a time. */
async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/** The key a damaged file's copy goes to: `bad/<key without .json>-<time>.json`. */
export function badKey(key, now = Date.now()) {
  const base = key.slice(0, -5);
  const out = `${BAD_PREFIX}${base}-${now}.json`;
  if (validKey(out)) return out;
  // Too long or too deep: one flat segment.
  const flat = `${BAD_PREFIX}${base.replace(/\//g, "_").slice(0, 150)}-${now}.json`;
  return validKey(flat) ? flat : null;
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

/** Thrown by a `migrate` hook for a file saved by a newer version. */
export class NewerVersionError extends Error {
  constructor(v) {
    super("NewerVersion");
    this.code = "newer";
    this.v = v;
  }
}

/**
 * A store over a backend (default: the host when there is one, else
 * localStorage; a packaged app without its bridge gets neither, see
 * host.js isPackaged). `onError({ op: "list" | "read" | "write" | "remove",
 * key, error })` hears every failure; set it later with setErrorHandler.
 * `delay` is the write debounce, `timers` ({ set, clear }) lets tests drive
 * time. `migrate(key, value)` → `{ value, changed }` brings a file read to
 * the current format (it throws NewerVersionError for a newer one); a
 * changed file is written back. `now` names the copies of damaged files.
 */
export function createStore({ backend = null, onError = null, delay = WRITE_DELAY, timers = null, migrate = null, now = () => Date.now() } = {}) {
  // Chosen on first use, so the module can be imported before the host is ready.
  let chosen = backend;
  const backendNow = () => {
    if (chosen) return chosen;
    if (hasNative()) return (chosen = hostBackend(nativeInvoke));
    // The packaged app keeps its data in files; without the bridge it must
    // not quietly start over in the WebView's localStorage.
    if (isPackaged()) throw new Error("NoBridge");
    return (chosen = localBackend());
  };
  const setT = timers?.set || ((fn, ms) => setTimeout(fn, ms));
  const clearT = timers?.clear || ((id) => clearTimeout(id));
  const mem = new Map();
  /** Keys on disk that are not read yet (lazy prefixes). */
  const disk = new Set();
  /** key → the promise of its read in progress (load). */
  const loading = new Map();
  /** Keys whose file could not be read: never written until reopened. */
  const blocked = new Set();
  /** key → "put" | "remove" held back (blocked key, or read-only). */
  const held = new Map();
  let readOnly = false;
  let migrator = migrate;
  /** Damaged files left in place (and blocked) rather than moved aside: open's `keepDamaged`. */
  let keepDamaged = new Set();
  /** key → "put" | "remove": what is still to be done on disk. */
  const pending = new Map();
  const timer = new Map();
  /** key → the promise of the last operation on that key (so they run in order). */
  const chain = new Map();
  /** key → the number of the latest operation queued on it (newest wins). */
  const gen = new Map();
  let seq = 0;
  /** Functions run at the start of every flush (onFlush). */
  const flushHooks = new Set();
  let handler = onError;
  let opened = null;
  let openReport = { listFailed: false, failed: [] };

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

  const isHeld = (key) => readOnly || blocked.has(key);

  /** Start the pending operation of `key` now (after the one before it). */
  function run(key) {
    clearT(timer.get(key));
    timer.delete(key);
    const op = pending.get(key);
    if (!op) return chain.get(key) || Promise.resolve(true);
    pending.delete(key);
    const mine = gen.get(key);
    const prev = chain.get(key) || Promise.resolve(true);
    const next = prev.then(async () => {
      // A newer operation of the same key was queued meanwhile: it carries the latest value.
      if (pending.has(key)) return true;
      // Blocked since it was queued (read-only turned on): held, not written.
      if (isHeld(key)) {
        held.set(key, op);
        return true;
      }
      try {
        if (op === "remove") await backendNow().remove(key);
        else {
          const text = JSON.stringify(mem.get(key));
          if (text === undefined) throw new Error("NotJson");
          await backendNow().write(key, text);
        }
        return true;
      } catch (err) {
        // Kept pending (the next put of this key, or the next flush, tries
        // again), unless a newer operation was queued since: that one wins.
        if (!pending.has(key) && gen.get(key) === mine) pending.set(key, op);
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
    gen.set(key, ++seq);
    if (isHeld(key)) {
      held.set(key, op);
      pending.delete(key);
      clearT(timer.get(key));
      timer.delete(key);
      return;
    }
    held.delete(key);
    pending.set(key, op);
    clearT(timer.get(key));
    timer.set(key, setT(() => run(key), delay));
  }

  /** Keep a byte-for-byte copy of a file that is not JSON; its key, or null. */
  async function preserve(key, text) {
    let copy = badKey(key, now());
    // Never over an earlier copy made in the same millisecond.
    for (let n = 2; copy && disk.has(copy) && n < 100; n++) copy = badKey(key, `${now()}-${n}`);
    if (!copy) return null;
    try {
      await backendNow().write(copy, text);
      disk.add(copy);
      return copy;
    } catch (err) {
      report("write", copy, err);
      return null;
    }
  }

  /**
   * A file's text → its value, through the migrate hook. Throws
   * { kind: "parse" | "newer", error, preserved } when it cannot be used.
   */
  async function decode(key, text) {
    let value;
    try {
      value = JSON.parse(text);
    } catch (err) {
      throw { kind: "parse", error: errorText(err), preserved: await preserve(key, text) };
    }
    if (!migrator) return { value, changed: false };
    try {
      const r = migrator(key, value);
      return r && typeof r === "object" && "value" in r ? r : { value, changed: false };
    } catch (err) {
      if (err?.code === "newer") throw { kind: "newer", error: "NewerVersion", preserved: null, v: err.v };
      throw { kind: "parse", error: errorText(err), preserved: await preserve(key, text) };
    }
  }

  /** Read one key from disk into memory (unless something newer is there); true when read. */
  async function readInto(key) {
    let text;
    try {
      text = await backendNow().read(key);
    } catch (err) {
      blocked.add(key);
      throw { kind: "read", error: errorText(err), preserved: null };
    }
    if (text == null) {
      disk.delete(key);
      return false;
    }
    let r;
    try {
      r = await decode(key, text);
    } catch (f) {
      if (f.kind === "parse" && f.preserved && !keepDamaged.has(key)) {
        // Moved aside: its copy is safe, so the damaged file goes and the
        // key starts over (a game, the practice session …).
        try {
          await backendNow().remove(key);
        } catch (_) {
          blocked.add(key);
        }
        disk.delete(key);
      } else {
        // Nothing usable was read, so nothing may be written over it.
        blocked.add(key);
      }
      throw f;
    }
    // Read after all (an earlier read of it had failed): it can be written again.
    blocked.delete(key);
    // A put or remove made meanwhile (it took the key off `disk`) is newer than the disk.
    if (disk.has(key)) {
      mem.set(key, r.value);
      disk.delete(key);
      // A file in an older format is written back in the current one.
      if (r.changed) schedule(key, "put");
    }
    return true;
  }

  const lazyOf = (prefixes) => (key) => key.startsWith(BAD_PREFIX) || prefixes.some((p) => p && key.startsWith(p));

  const api = {
    /** "host" or "local". */
    get backend() {
      return backendNow().kind;
    },

    setErrorHandler(fn) {
      handler = typeof fn === "function" ? fn : null;
    },

    /** The migrate hook (data/migrate.js), before open. */
    setMigrator(fn) {
      migrator = typeof fn === "function" ? fn : null;
    },

    /**
     * Read every key into memory, except those under a `lazy` prefix (they
     * are listed, and read by load). Unreadable files are reported, left
     * out and write-blocked; a failed list makes the whole store read-only
     * (nothing is known, so anything written could replace something). A
     * file that is not JSON is copied to bad/ and then moved aside, unless
     * it is one of `keepDamaged` (the app's core files): those stay where
     * they are, blocked, for the player to decide (app/safety.jsx).
     */
    open({ lazy = [], keepDamaged: keep = [] } = {}) {
      if (opened) return opened;
      keepDamaged = new Set(keep);
      opened = (async () => {
        const failed = [];
        openReport = { listFailed: false, failed };
        let keys = [];
        try {
          keys = await backendNow().list("");
        } catch (err) {
          openReport.listFailed = true;
          readOnly = true;
          report("list", "", err);
          return api;
        }
        const isLazy = lazyOf(lazy);
        const toRead = [];
        for (const key of [...new Set(keys)].sort()) {
          // A put made before open finished is newer than the disk.
          if (mem.has(key) || pending.has(key) || held.has(key)) continue;
          disk.add(key);
          if (!isLazy(key)) toRead.push(key);
        }
        // Independent files: read side by side, not one after another.
        await pool(toRead, PARALLEL, async (key) => {
          try {
            await readInto(key);
          } catch (f) {
            failed.push({ key, kind: f.kind, error: f.error, preserved: f.preserved || null });
            report("read", key, f.error);
          }
        });
        failed.sort((a, b) => (a.key < b.key ? -1 : 1));
        return api;
      })();
      return opened;
    },

    /** What open found: { listFailed, failed: [{ key, kind: "read" | "parse" | "newer", error, preserved }] }. */
    get openReport() {
      return openReport;
    },

    /**
     * Read one listed key into memory; its value (undefined when it is not
     * there). A failure is reported and rejects ({ kind, error, preserved }).
     */
    load(key) {
      if (mem.has(key)) return Promise.resolve(mem.get(key));
      if (!disk.has(key)) return Promise.resolve(undefined);
      if (loading.has(key)) return loading.get(key);
      const p = (async () => {
        try {
          await readInto(key);
        } catch (f) {
          report("read", key, f.error);
          throw f;
        } finally {
          loading.delete(key);
        }
        return mem.get(key);
      })();
      loading.set(key, p);
      return p;
    },

    /** Read every listed key under `prefix` (except `except` prefixes); failures are reported. */
    async loadAll(prefix = "", { except = [] } = {}) {
      const keys = [...disk].filter((k) => k.startsWith(prefix) && !k.startsWith(BAD_PREFIX) && !except.some((e) => k.startsWith(e)));
      await pool(keys, PARALLEL, (k) => api.load(k).catch(() => {}));
    },

    /** In memory now (a key not on disk at all counts as loaded: there is nothing to read). */
    isLoaded(key) {
      return mem.has(key) || !disk.has(key);
    },

    /** Forget the values under `prefix` (still on disk, read again by load); writes in flight stay. */
    evict(prefix) {
      for (const key of [...mem.keys()]) {
        if (!key.startsWith(prefix) || pending.has(key) || chain.has(key) || held.has(key)) continue;
        mem.delete(key);
        disk.add(key);
      }
    },

    get(key) {
      return mem.get(key);
    },

    /** On disk or in memory (read or not). */
    has(key) {
      return mem.has(key) || disk.has(key);
    },

    /** Keys under `prefix` ("" for all, "games/" for the games), read or not, sorted. */
    list(prefix = "") {
      return [...new Set([...mem.keys(), ...disk])].filter((k) => k.startsWith(prefix)).sort();
    },

    /** Set `key` to `value` (JSON) now; written after the debounce. */
    put(key, value) {
      checkKey(key);
      if (value === undefined) throw new Error("store.put needs a value; use remove()");
      mem.set(key, value);
      disk.delete(key);
      schedule(key, "put");
    },

    remove(key) {
      checkKey(key);
      mem.delete(key);
      disk.delete(key);
      schedule(key, "remove");
    },

    /**
     * Replace every key with `data` ({ key: value }); used by backup import.
     * Keys under a `keep` prefix (snapshots) and the copies of damaged
     * files stay as they are.
     */
    replaceAll(data, { keep = [] } = {}) {
      for (const key of Object.keys(data)) checkKey(key);
      const kept = (k) => k.startsWith(BAD_PREFIX) || keep.some((p) => k.startsWith(p));
      for (const key of api.list("")) if (!(key in data) && !kept(key)) api.remove(key);
      for (const [key, value] of Object.entries(data)) api.put(key, value);
    },

    /** Every key and value now in memory: { key: value } (`except`: prefixes left out). */
    snapshot({ except = [] } = {}) {
      return Object.fromEntries([...mem.entries()].filter(([k]) => !except.some((e) => k.startsWith(e))).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    },

    /** Keys with a write or removal not yet on disk. */
    pending() {
      return [...pending.keys()].sort();
    },

    /* --------------------------------------------- the safe state (v13) */

    /** Hold every write in memory (true), or let them go again (false: what was held is written now). */
    setReadOnly(on) {
      readOnly = !!on;
      if (readOnly) return;
      for (const [key, op] of [...held]) {
        if (blocked.has(key)) continue;
        held.delete(key);
        schedule(key, op);
      }
    },

    get readOnly() {
      return readOnly;
    },

    /** Keys that are never written (their file could not be read). */
    blocked() {
      return [...blocked].sort();
    },

    /** Keys with writes held back, sorted. */
    held() {
      return [...held.keys()].sort();
    },

    /** Write-block a key (true) or allow it again (false; a held write goes ahead unless read-only). */
    block(key, on = true) {
      if (on) {
        blocked.add(key);
        return;
      }
      blocked.delete(key);
      if (!readOnly && held.has(key)) {
        const op = held.get(key);
        held.delete(key);
        schedule(key, op);
      }
    },

    /** Drop every held write (the safe state's reset, a backup restore). */
    discardHeld() {
      held.clear();
    },

    /**
     * Run `fn()` at the start of every flush: what a module holds back in
     * memory on purpose (data/games.js: a delete that can still be undone)
     * is made final before everything is written out. Returns the function
     * that stops it.
     */
    onFlush(fn) {
      flushHooks.add(fn);
      return () => flushHooks.delete(fn);
    },

    /** Write everything pending now; true when all of it reached the disk (held writes are not pending). */
    async flush() {
      for (const fn of [...flushHooks]) {
        try {
          fn();
        } catch (e) {
          report("write", "", e);
        }
      }
      const keys = new Set([...pending.keys(), ...chain.keys()]);
      const results = await Promise.all([...keys].map((k) => run(k)));
      return results.every(Boolean) && pending.size === 0;
    },
  };
  return api;
}

/** The app's store (opened by the shell at boot). */
export const store = createStore();

// v13: the host asks for a flush before the app quits or its window closes
// and waits (at most 1.5 s) for the answer, so the last debounced writes —
// a game's result, a solved problem — reach the disk (host.js).
if (hasNative()) installFlushHook(() => store.flush());
