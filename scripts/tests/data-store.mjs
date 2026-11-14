/**
 * Data: the store (src/web/js/data/store.js), backups (data/backup.js)
 * and the host's file commands (src/store.zig, src/bridge_files.zig). The host is a
 * fake with the same rules as store.zig: strict keys, chunks of at most
 * CHUNK_BYTES that must arrive in order, a rename on the last one, and the
 * SDK's 1 MB bridge message.
 */
import fs from "node:fs";
import path from "node:path";
import { shellSource } from "../shell-source.mjs";

const BRIDGE_MAX = 1024 * 1024;

/** A fake native host: files in a Map, the store.zig protocol, a call log. */
function fakeHost(S) {
  const files = new Map();
  const temps = new Map();
  const calls = [];
  let failWrites = 0;
  const enc = (bytes) => Buffer.from(bytes).toString("base64");
  const invoke = async (command, payload) => {
    const message = JSON.stringify({ id: "1", command, payload });
    if (message.length > BRIDGE_MAX) throw new Error("payload_too_large");
    calls.push({ command, payload, bytes: message.length });
    if (command === "studio.storeList") {
      const p = payload.prefix;
      if (!S.validPrefix(p)) throw new Error("InvalidKey");
      const dir = p === "" ? "" : p.endsWith("/") ? p : p + "/";
      return [...files.keys()].filter((k) => k.startsWith(dir));
    }
    if (!S.validKey(payload.key)) throw new Error("InvalidKey");
    const key = payload.key;
    if (command === "studio.storeRead") {
      const f = files.get(key);
      if (!f) return null;
      const offset = payload.offset || 0;
      if (offset > f.length) throw new Error("OutOfOrder");
      const reply = { size: f.length, b64: enc(f.subarray(offset, offset + S.CHUNK_BYTES)) };
      if (JSON.stringify(reply).length > BRIDGE_MAX) throw new Error("reply too large");
      return reply;
    }
    if (command === "studio.storeWrite") {
      if (failWrites > 0) {
        failWrites--;
        throw new Error("Disk");
      }
      const bytes = Buffer.from(payload.b64, "base64");
      if (bytes.length > S.CHUNK_BYTES) throw new Error("TooLarge");
      const offset = payload.offset || 0;
      const done = payload.done !== false;
      let t;
      if (offset === 0) t = Buffer.alloc(0);
      else {
        t = temps.get(key);
        if (!t || t.length !== offset) throw new Error("OutOfOrder");
      }
      t = Buffer.concat([t, bytes]);
      if (t.length > S.MAX_BYTES) throw new Error("TooLarge");
      if (done) {
        files.set(key, t);
        temps.delete(key);
      } else temps.set(key, t);
      return true;
    }
    if (command === "studio.storeRemove") {
      files.delete(key);
      temps.delete(key);
      return true;
    }
    throw new Error("unknown_command");
  };
  return {
    files,
    temps,
    calls,
    invoke,
    failNext(n = 1) {
      failWrites = n;
    },
    text: (key) => (files.has(key) ? files.get(key).toString("utf8") : null),
    put: (key, text) => files.set(key, Buffer.from(text, "utf8")),
  };
}

/** Timers the test advances by hand. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const list = new Map();
  return {
    set(fn, ms) {
      const id = ++seq;
      list.set(id, { at: now + ms, fn });
      return id;
    },
    clear(id) {
      list.delete(id);
    },
    async advance(ms) {
      now += ms;
      for (const [id, t] of [...list.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now) {
          list.delete(id);
          t.fn();
        }
      }
      // Let the writes started by the timers finish.
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    },
    get count() {
      return list.size;
    },
  };
}

export default async function ({ test, assert, root }) {
  const S = await import("../../src/web/js/data/store.js");
  const B = await import("../../src/web/js/data/backup.js");

  const make = (host, extra = {}) => {
    const errors = [];
    const timers = fakeTimers();
    const store = S.createStore({ backend: S.hostBackend(host.invoke), onError: (e) => errors.push(e), timers, ...extra });
    return { store, errors, timers };
  };

  await test("data store: keys follow the host's rule exactly", () => {
    for (const k of ["settings.json", "profile.json", "current.json", "games/g-1730000000000.json", "games/a_b-9.json", "a/b/c.json"]) assert.ok(S.validKey(k), k);
    for (const k of ["", ".json", "profile", "Profile.json", "/profile.json", "../profile.json", "games/../x.json", "games/./x.json", "games//x.json", "games/.json", "a\\b.json", "c:/x.json", "games/x.json.tmp", "x.y.json", "sp ace.json", "a/b/c/d/e.json", "games/é.json", null, 7]) assert.ok(!S.validKey(k), String(k));
    assert.ok(S.validKey("a".repeat(195) + ".json"));
    assert.ok(!S.validKey("a".repeat(196) + ".json"));
    for (const p of ["", "games", "games/"]) assert.ok(S.validPrefix(p), p);
    for (const p of ["/", "../", "games//", "/games/", "con/", "nul"]) assert.ok(!S.validPrefix(p), p);
    // Windows device names, as a file or a folder, like store.zig.
    for (const k of ["con.json", "nul.json", "aux.json", "prn.json", "com1.json", "lpt9.json", "games/con.json", "con/x.json", "games/lpt1.json"]) assert.ok(!S.validKey(k), k);
    for (const k of ["console.json", "com.json", "com0.json", "com10.json", "lpt.json", "nul-1.json", "auxiliary.json"]) assert.ok(S.validKey(k), k);
    for (const n of ["con", "CON", "Con", "NUL.txt", "COM9", "LPT9.json", "con.tar.gz", "con ", "aux .json"]) assert.ok(S.isDeviceName(n), n);
    for (const n of ["", "co", "conn", "com", "com0", "com10", "lpt0", "x.con", "console.json", ".con"]) assert.ok(!S.isDeviceName(n), n);
    // The JS limits are the host's.
    const zig = fs.readFileSync(path.join(root, "src/store.zig"), "utf8");
    assert.match(zig, /pub const max_file_bytes: u64 = 8 \* 1024 \* 1024;/);
    assert.match(zig, /pub const chunk_bytes: usize = 384 \* 1024;/);
    assert.match(zig, /pub const max_key_bytes: usize = 200;/);
    assert.match(zig, /pub const max_depth: usize = 4;/);
    assert.equal(S.CHUNK_BYTES, 384 * 1024);
    assert.equal(S.MAX_BYTES, 8 * 1024 * 1024);
  });

  await test("data store: the host registers the four file commands, with Zig tests", () => {
    const main = shellSource();
    // One command table; the registry and the policies are built from
    // it (and a Zig test checks every name is unique).
    for (const [name, fn] of [["studio.storeRead", "storeRead"], ["studio.storeWrite", "storeWrite"], ["studio.storeList", "storeList"], ["studio.storeRemove", "storeRemove"]]) {
      assert.ok(main.includes(`.{ .name = "${name}", .invoke = bridge_files.${fn} },`), name);
    }
    assert.match(main, /test "every bridge command is registered once, with the same origins"/);
    // The data root: beside models/, with a test override (src/paths.zig).
    const paths = fs.readFileSync(path.join(root, "src/paths.zig"), "utf8").replace(/\r\n/g, "\n");
    assert.match(paths, /pub fn dataDir\(/);
    assert.match(paths, /override\(env_map, "GOBAN_DATA_DIR", out\) orelse child\(env_map, "data", out\)/);
    assert.match(main, /paths_mod\.dataDir\(init\.environ_map, &data_dir_buf\)/);
    assert.match(main, /refAllDecls\(store_mod\)/);
    const zig = fs.readFileSync(path.join(root, "src/store.zig"), "utf8");
    assert.match(zig, /test "store keys are validated strictly"/);
    assert.match(zig, /test "store writes atomically, reads in chunks, lists and removes in a temp dir"/);
    // Atomic: a temporary file in the same directory, renamed over the
    // target (retried briefly on Windows, where a scanner may hold it).
    assert.match(zig, /try renameRetrying\(self\.io, dir, tmp, sub\)/);
    // No huge stack buffers in the handlers: the chunk is allocated.
    assert.match(main, /self\.allocator\.alloc\(u8, store_mod\.chunk_bytes\)/);
  });

  await test("data store: open reads every key; reads are synchronous", async () => {
    const host = fakeHost(S);
    host.put("settings.json", '{"lang":"ko"}');
    host.put("profile.json", '{"v":9}');
    host.put("current.json", '{"sgf":"(;)"}');
    host.put("games/g-1.json", '{"id":"g-1"}');
    host.put("games/g-2.json", '{"id":"g-2"}');
    const { store, errors } = make(host);
    assert.equal(store.get("settings.json"), undefined, "nothing before open");
    const same = store.open();
    assert.equal(store.open(), same, "open once");
    assert.equal(await same, store);
    assert.deepEqual(store.get("settings.json"), { lang: "ko" });
    assert.deepEqual(store.get("games/g-2.json"), { id: "g-2" });
    assert.deepEqual(store.list("games/"), ["games/g-1.json", "games/g-2.json"]);
    assert.deepEqual(store.list(), ["current.json", "games/g-1.json", "games/g-2.json", "profile.json", "settings.json"]);
    assert.equal(store.has("profile.json"), true);
    assert.equal(store.backend, "host");
    assert.deepEqual(errors, []);
    assert.ok(!host.calls.some((c) => c.command === "studio.storeWrite"), "opening writes nothing");
  });

  await test("data store: writes are debounced per key and go through the host", async () => {
    const host = fakeHost(S);
    const { store, timers, errors } = make(host);
    await store.open();
    store.put("profile.json", { v: 9, n: 1 });
    store.put("profile.json", { v: 9, n: 2 });
    await timers.advance(200);
    store.put("profile.json", { v: 9, n: 3 });
    store.put("settings.json", { lang: "en" });
    assert.deepEqual(store.get("profile.json"), { v: 9, n: 3 }, "memory is current at once");
    assert.equal(host.text("profile.json"), null, "nothing on disk yet");
    assert.deepEqual(store.pending(), ["profile.json", "settings.json"]);
    await timers.advance(200);
    assert.equal(host.text("profile.json"), null, "the debounce restarted with the last put");
    await timers.advance(100);
    assert.equal(host.text("profile.json"), '{"v":9,"n":3}');
    assert.equal(host.text("settings.json"), '{"lang":"en"}');
    assert.equal(host.calls.filter((c) => c.command === "studio.storeWrite" && c.payload.key === "profile.json").length, 1, "one write for three puts");
    assert.deepEqual(store.pending(), []);
    // Remove: from memory at once, from disk after the debounce.
    store.remove("settings.json");
    assert.equal(store.get("settings.json"), undefined);
    assert.equal(host.text("settings.json"), '{"lang":"en"}');
    await timers.advance(300);
    assert.equal(host.text("settings.json"), null);
    // A put then a remove within the debounce: only the removal happens.
    store.put("games/x.json", { id: "x" });
    store.remove("games/x.json");
    await timers.advance(300);
    assert.equal(host.files.has("games/x.json"), false);
    assert.ok(!host.calls.some((c) => c.command === "studio.storeWrite" && c.payload.key === "games/x.json"));
    // Bad keys and values are refused at once, never sent.
    assert.throws(() => store.put("../x.json", {}), /invalid store key/);
    assert.throws(() => store.put("Profile.json", {}), /invalid store key/);
    assert.throws(() => store.remove("/etc/passwd"), /invalid store key/);
    assert.throws(() => store.put("profile.json", undefined), /needs a value/);
    assert.deepEqual(errors, []);
  });

  await test("data store: flush writes everything pending now, in order per key", async () => {
    const host = fakeHost(S);
    const { store, timers } = make(host);
    await store.open();
    store.put("current.json", { move: 1 });
    store.put("games/g-1.json", { id: "g-1" });
    assert.equal(await store.flush(), true);
    assert.equal(host.text("current.json"), '{"move":1}');
    assert.equal(host.text("games/g-1.json"), '{"id":"g-1"}');
    assert.equal(timers.count, 0, "no timer left behind");
    assert.equal(await store.flush(), true, "nothing pending: still true");
    // The last value wins even when writes overlap.
    for (let i = 0; i < 5; i++) store.put("current.json", { move: i });
    const a = store.flush();
    store.put("current.json", { move: 99 });
    await a;
    await store.flush();
    assert.equal(host.text("current.json"), '{"move":99}');
  });

  await test("data store: a game with its analysis moves in chunks, and comes back whole", async () => {
    const host = fakeHost(S);
    const { store, errors } = make(host);
    await store.open();
    // ≈ 2.5 MB of JSON with non-ASCII text (multi-byte UTF-8 across chunk edges).
    const analysis = Array.from({ length: 4000 }, (_, i) => ({ move: i, winrate: Math.sin(i) / 2 + 0.5, note: "黑棋好 · 백 좋음 · " + "x".repeat(i % 1000) }));
    const game = { id: "g-big", sgf: "(;GM[1]FF[4]SZ[19])", analysis };
    store.put("games/g-big.json", game);
    assert.equal(await store.flush(), true);
    const text = JSON.stringify(game);
    const bytes = Buffer.byteLength(text, "utf8");
    assert.ok(bytes > 2 * 1024 * 1024 && bytes < S.MAX_BYTES, `${bytes}`);
    const writes = host.calls.filter((c) => c.command === "studio.storeWrite" && c.payload.key === "games/g-big.json");
    assert.equal(writes.length, Math.ceil(bytes / S.CHUNK_BYTES));
    assert.deepEqual(writes.map((w) => w.payload.offset), writes.map((_, i) => i * S.CHUNK_BYTES));
    assert.deepEqual(writes.map((w) => w.payload.done), writes.map((_, i) => i === writes.length - 1));
    assert.ok(writes.every((w) => w.bytes < BRIDGE_MAX), "every message fits the bridge");
    assert.equal(host.text("games/g-big.json"), text);
    // A fresh store reads it back in chunks.
    const again = make(host);
    await again.store.open();
    assert.deepEqual(again.store.get("games/g-big.json"), game);
    const reads = host.calls.filter((c) => c.command === "studio.storeRead" && c.payload.key === "games/g-big.json");
    assert.equal(reads.length, Math.ceil(bytes / S.CHUNK_BYTES));
    assert.deepEqual(errors, []);
    assert.deepEqual(again.errors, []);
    // A small value is one call with neither offset nor done.
    store.put("settings.json", { a: 1 });
    await store.flush();
    const small = host.calls.filter((c) => c.command === "studio.storeWrite" && c.payload.key === "settings.json");
    assert.equal(small.length, 1);
    assert.deepEqual(Object.keys(small[0].payload).sort(), ["b64", "key"]);
  });

  await test("data store: failures reach onError, stay pending and are retried", async () => {
    const host = fakeHost(S);
    const { store, errors, timers } = make(host);
    await store.open();
    host.failNext(1);
    store.put("profile.json", { v: 9 });
    await timers.advance(300);
    assert.equal(host.text("profile.json"), null);
    assert.deepEqual(errors, [{ op: "write", key: "profile.json", error: "Disk" }]);
    assert.deepEqual(store.pending(), ["profile.json"], "still pending");
    assert.deepEqual(store.get("profile.json"), { v: 9 }, "memory keeps the value");
    assert.equal(await store.flush(), true, "the retry succeeds");
    assert.equal(host.text("profile.json"), '{"v":9}');
    // Too large for one file: refused, reported, not sent.
    host.failNext(0);
    store.put("games/huge.json", { s: "x".repeat(S.MAX_BYTES) });
    assert.equal(await store.flush(), false);
    assert.equal(errors.at(-1).op, "write");
    assert.equal(errors.at(-1).key, "games/huge.json");
    assert.equal(errors.at(-1).error, "TooLarge");
    assert.equal(host.files.has("games/huge.json"), false);
    store.remove("games/huge.json");
    assert.equal(await store.flush(), true, "removing it clears the failure");
    // A value that is not JSON is reported, not written as garbage.
    const cyclic = {};
    cyclic.self = cyclic;
    store.put("current.json", cyclic);
    assert.equal(await store.flush(), false);
    assert.equal(errors.at(-1).key, "current.json");
    // A damaged file is reported at open; the others load.
    const h2 = fakeHost(S);
    h2.put("profile.json", "{not json");
    h2.put("settings.json", '{"lang":"ja"}');
    const s2 = make(h2);
    await s2.store.open();
    assert.equal(s2.store.get("profile.json"), undefined);
    assert.deepEqual(s2.store.get("settings.json"), { lang: "ja" });
    assert.equal(s2.errors.length, 1);
    assert.equal(s2.errors[0].op, "read");
    assert.equal(s2.errors[0].key, "profile.json");
    // A host that cannot list: reported, the store opens empty.
    const s3 = S.createStore({ backend: S.hostBackend(async () => Promise.reject(new Error("NoDataDir"))), onError: (e) => s3errors.push(e) });
    const s3errors = [];
    await s3.open();
    assert.deepEqual(s3.list(), []);
    assert.deepEqual(s3errors, [{ op: "list", key: "", error: "NoDataDir" }]);
    // Without a handler the error is still logged, never swallowed.
    const logged = [];
    const orig = console.error;
    console.error = (...a) => logged.push(a);
    try {
      const s4 = S.createStore({ backend: S.hostBackend(async () => Promise.reject(new Error("Disk"))) });
      await s4.open();
    } finally {
      console.error = orig;
    }
    assert.equal(logged.length, 1);
  });

  await test("data store: an operation that fails after a newer one was queued does not come back over it", async () => {
    // A backend whose removal hangs until told, then fails.
    const files = new Map([["games/a.json", '{"v":1}']]);
    let failRemove;
    const backend = {
      kind: "test",
      list: async () => [...files.keys()],
      read: async (k) => files.get(k) ?? null,
      write: async (k, text) => void files.set(k, text),
      remove: () => new Promise((_, reject) => (failRemove = () => reject(new Error("Disk")))),
    };
    const errors = [];
    const store = S.createStore({ backend, onError: (e) => errors.push(e) });
    await store.open();
    store.remove("games/a.json");
    const first = store.flush(); // the removal is in flight
    await new Promise((r) => setTimeout(r, 0));
    store.put("games/a.json", { v: 2 });
    const second = store.flush(); // the new value waits behind it
    failRemove();
    assert.equal(await first, false);
    assert.equal(await second, true);
    assert.equal(errors.length, 1);
    assert.equal(files.get("games/a.json"), '{"v":2}', "the newer write was made");
    assert.deepEqual(store.pending(), [], "the failed removal is not retried over it");
    assert.equal(await store.flush(), true);
    assert.equal(files.get("games/a.json"), '{"v":2}', "and the file stays");
  });

  await test("data store: the browser preview keeps keys in localStorage under goban9:", async () => {
    const m = new Map([["goban-studio.settings.v2", "{}"], ["goban9:bad key.json", "{}"]]);
    const storage = { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
    const timers = fakeTimers();
    const s = S.createStore({ backend: S.localBackend(storage), timers });
    await s.open();
    assert.deepEqual(s.list(), [], "older keys and foreign entries are not read");
    s.put("settings.json", { lang: "zh" });
    s.put("games/g-1.json", { id: "g-1" });
    await s.flush();
    assert.equal(m.get("goban9:settings.json"), '{"lang":"zh"}');
    assert.equal(m.get("goban9:games/g-1.json"), '{"id":"g-1"}');
    assert.equal(m.get("goban-studio.settings.v2"), "{}", "v8 data is left alone");
    const t = S.createStore({ backend: S.localBackend(storage), timers });
    await t.open();
    assert.deepEqual(t.list(), ["games/g-1.json", "settings.json"]);
    assert.equal(t.backend, "local");
    t.remove("games/g-1.json");
    await t.flush();
    assert.equal(m.has("goban9:games/g-1.json"), false);
    // Without a native host the default store is the local one.
    assert.equal(S.store.backend, "local");
    assert.equal(S.LOCAL_PREFIX, "goban9:");
  });

  await test("data backup: export every key, check it, import it over everything", async () => {
    const host = fakeHost(S);
    const { store } = make(host);
    await store.open();
    store.put("settings.json", { lang: "ko" });
    store.put("profile.json", { v: 9 });
    store.put("games/g-1.json", { id: "g-1" });
    store.put("games/g-2.json", { id: "g-2" });
    await store.flush();
    const doc = JSON.parse(JSON.stringify(await B.exportBackup(store, 1730000000000)));
    assert.deepEqual(Object.keys(doc).sort(), ["app", "at", "data", "v"]);
    assert.equal(doc.app, "goban-studio");
    assert.equal(doc.v, 13);
    assert.equal(doc.at, 1730000000000);
    assert.deepEqual(Object.keys(doc.data), ["games/g-1.json", "games/g-2.json", "profile.json", "settings.json"]);
    const checked = B.checkBackup(doc);
    assert.deepEqual(checked.summary, { keys: 4, games: 2, at: 1730000000000 });
    assert.deepEqual(checked.data["games/g-1.json"], { id: "g-1", v: 13 }, "every file in the current format");
    // The export is a copy: later changes do not leak into it.
    store.get("settings.json").lang = "changed";
    assert.equal(doc.data["settings.json"].lang, "ko");
    // Refused documents.
    assert.equal(B.checkBackup(null).error, "notBackup");
    assert.equal(B.checkBackup([]).error, "notBackup");
    assert.equal(B.checkBackup({ app: "other", v: 9, data: {} }).error, "notBackup");
    assert.equal(B.checkBackup({ app: "goban-studio", format: 1, data: { settings: {} } }).error, "notBackup", "a v8 backup");
    assert.equal(B.checkBackup({ ...doc, v: 8 }).error, "olderVersion");
    assert.equal(B.checkBackup({ ...doc, v: 14 }).error, "newerVersion");
    assert.equal(B.checkBackup({ ...doc, data: [] }).error, "damaged");
    assert.deepEqual(B.checkBackup({ ...doc, data: { "../x.json": {} } }), { ok: false, error: "damaged", key: "../x.json" });
    assert.equal(B.checkBackup({ ...doc, data: { "profile.json": "x" } }).error, "damaged");
    assert.equal(B.parseBackup("\ufeff" + JSON.stringify(doc)).v, 13);
    assert.equal(B.parseBackup("{nope"), null);
    // Import replaces everything: keys not in the backup go (a snapshot of them is kept).
    store.put("current.json", { sgf: "(;)" });
    store.put("games/g-3.json", { id: "g-3" });
    await store.flush();
    const bad = await B.importBackup(store, { ...doc, v: 8 });
    assert.equal(bad.ok, false);
    assert.ok(host.files.has("current.json"), "a refused import changes nothing");
    const r = await B.importBackup(store, doc, { now: 1730000000500 });
    assert.equal(r.ok, true);
    assert.equal(r.written, true);
    assert.equal(r.snapshot, "backups/pre-restore-1730000000500/");
    const live = (keys) => keys.filter((k) => !k.startsWith("backups/"));
    assert.deepEqual(live(store.list()), ["games/g-1.json", "games/g-2.json", "profile.json", "settings.json"]);
    assert.deepEqual(live([...host.files.keys()].sort()), ["games/g-1.json", "games/g-2.json", "profile.json", "settings.json"]);
    assert.deepEqual(store.get("settings.json"), { lang: "ko", v: 13 });
    // Importing does not alias the document.
    doc.data["settings.json"].lang = "x";
    assert.equal(store.get("settings.json").lang, "ko");
  });
}
