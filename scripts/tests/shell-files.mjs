/**
 * Shell: the user's own files (host.js writeFileChunks / readFileChunks over
 * studio.writeTextFile / studio.readTextFile) move in chunks, so a backup of
 * every game with its analysis is written and read back whole, however large.
 * The fake host keeps the same rules as store.zig writePath / readPath.
 */
import { test, assert } from "./helpers.mjs";
import { FILE_CHUNK_BYTES, installFlushHook, openFileDialog, readFileChunks, saveFileDialog, writeFileChunks } from "../../src/web/js/host.js";
import { INSTALL_ERRORS, installFallsBack, installMessageKey } from "../../src/web/js/update.js";

function fakeHost() {
  const files = new Map();
  const parts = new Map();
  const calls = [];
  const call = async (command, p) => {
    calls.push({ command, offset: p.offset ?? 0, done: p.done ?? true, bytes: p.b64 ? Buffer.from(p.b64, "base64").length : 0 });
    if (command === "studio.writeTextFile") {
      const bytes = Buffer.from(p.b64, "base64");
      assert.ok(bytes.length <= FILE_CHUNK_BYTES, "one call carries at most one chunk");
      const offset = p.offset ?? 0;
      const done = p.done ?? true;
      if (offset === 0) parts.set(p.path, Buffer.alloc(0));
      const had = parts.get(p.path);
      if (!had || had.length !== offset) throw new Error("OutOfOrder");
      const now = Buffer.concat([had, bytes]);
      parts.set(p.path, now);
      if (done) {
        files.set(p.path, now);
        parts.delete(p.path);
      }
      return true;
    }
    if (command === "studio.readTextFile") {
      const f = files.get(p.path);
      if (!f) throw new Error("Disk");
      const offset = p.offset ?? 0;
      return { size: f.length, b64: f.subarray(offset, offset + FILE_CHUNK_BYTES).toString("base64") };
    }
    throw new Error("unknown " + command);
  };
  return { call, files, calls };
}

await test("shell files: a small file is one call each way", async () => {
  const h = fakeHost();
  const text = '{"format":"goban-studio-backup"}';
  await writeFileChunks(h.call, "/x/b.json", new TextEncoder().encode(text));
  assert.equal(h.calls.length, 1);
  assert.equal(new TextDecoder().decode(await readFileChunks(h.call, "/x/b.json")), text);
});

await test("shell files: a backup larger than one chunk is written in order and read back whole", async () => {
  const h = fakeHost();
  // About 2.5 chunks of text, with multi-byte characters across the chunk edges.
  const text = "黑白".repeat(10) + "x".repeat(FILE_CHUNK_BYTES * 2 + 1234) + "终局";
  const bytes = new TextEncoder().encode(text);
  await writeFileChunks(h.call, "/x/backup.json", bytes);
  const writes = h.calls.filter((c) => c.command === "studio.writeTextFile");
  assert.equal(writes.length, 3);
  assert.deepEqual(writes.map((c) => c.offset), [0, FILE_CHUNK_BYTES, FILE_CHUNK_BYTES * 2]);
  assert.deepEqual(writes.map((c) => c.done), [false, false, true], "the file is renamed into place only at the end");
  const back = new TextDecoder().decode(await readFileChunks(h.call, "/x/backup.json"));
  assert.equal(back.length, text.length);
  assert.equal(back, text);
  assert.equal(h.calls.filter((c) => c.command === "studio.readTextFile").length, 3);
});

await test("shell files: a file that is exactly a chunk long, and an empty one, read back", async () => {
  const h = fakeHost();
  await writeFileChunks(h.call, "/x/a", new Uint8Array(FILE_CHUNK_BYTES).fill(65));
  assert.equal((await readFileChunks(h.call, "/x/a")).length, FILE_CHUNK_BYTES);
  await writeFileChunks(h.call, "/x/e", new Uint8Array(0));
  assert.equal((await readFileChunks(h.call, "/x/e")).length, 0);
});

await test("shell files: the dialogs are the host's own and pass only what they understand (v13)", async () => {
  const calls = [];
  const call = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "studio.openFileDialog") return ["/Users/a/game.sgf"];
    if (command === "studio.saveFileDialog") return "/Users/a/game.sgf";
    throw new Error("unknown " + command);
  };
  assert.deepEqual(await openFileDialog({ title: "Import", allowMultiple: false, filters: [{}] }, call), ["/Users/a/game.sgf"]);
  assert.equal(await saveFileDialog({ title: "Export", defaultName: "game.sgf" }, call), "/Users/a/game.sgf");
  assert.deepEqual(calls, [
    { command: "studio.openFileDialog", payload: { title: "Import" } },
    { command: "studio.saveFileDialog", payload: { title: "Export", defaultName: "game.sgf" } },
  ]);
  // Cancelled, empty or failed: null, never a throw.
  assert.equal(await openFileDialog({}, async () => null), null);
  assert.equal(await openFileDialog({}, async () => []), null);
  assert.equal(await saveFileDialog({ defaultName: "x.sgf" }, async () => null), null);
  assert.equal(await saveFileDialog({ defaultName: "x.txt" }, async () => { throw new Error("InvalidRequest"); }), null);
  // No host at all.
  assert.equal(await openFileDialog({}), null);
  assert.equal(await saveFileDialog({ defaultName: "x.sgf" }), null);
});

await test("shell files: a host refusal (a path it never handed out) reads as a failed read or write", async () => {
  const refuse = async () => {
    throw new Error("AccessDenied");
  };
  await assert.rejects(readFileChunks(refuse, "/Users/a/.ssh/id_ed25519"), /AccessDenied/);
  await assert.rejects(writeFileChunks(refuse, "/Users/a/Library/LaunchAgents/x.plist", new Uint8Array(3)), /AccessDenied/);
});

function fakeFlushHost() {
  const listeners = new Map();
  const calls = [];
  return {
    calls,
    host: {
      on(name, fn) {
        listeners.set(name, fn);
        return () => listeners.delete(name);
      },
    },
    call: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true };
    },
    emit(name, detail) {
      listeners.get(name)?.(detail);
    },
    has: (name) => listeners.has(name),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

await test("shell quit: the page flushes when the host asks, then answers with the same id (v13)", async () => {
  const h = fakeFlushHost();
  let flushed = 0;
  let release;
  const off = installFlushHook(
    () =>
      new Promise((resolve) => {
        flushed++;
        release = resolve;
      }),
    { host: h.host, call: h.call },
  );
  assert.deepEqual(h.calls, [{ command: "studio.flushHook", payload: {} }], "the host learns there is a hook");
  h.emit("app:flush", { id: 7 });
  await settle();
  assert.equal(flushed, 1);
  assert.equal(h.calls.length, 1, "no answer before the writes are done");
  release(true);
  await settle();
  await settle();
  assert.deepEqual(h.calls.at(-1), { command: "studio.flushDone", payload: { id: 7 } });
  off();
  assert.equal(h.has("app:flush"), false);
});

await test("shell quit: a failed flush still answers, so the quit is never held up", async () => {
  const h = fakeFlushHost();
  installFlushHook(async () => {
    throw new Error("Disk");
  }, { host: h.host, call: h.call });
  h.emit("app:flush", { id: 3 });
  for (let i = 0; i < 4; i++) await settle();
  assert.deepEqual(h.calls.at(-1), { command: "studio.flushDone", payload: { id: 3 } });
  // Without a host (the browser preview) nothing is installed.
  assert.equal(typeof installFlushHook(() => {}, { host: null }), "function");
});

await test("shell update: the v13 install refusals are explained, and the unfixable ones fall back to the download page", () => {
  for (const code of ["NotChecked", "NotNewer", "NoSignature", "BadSignature", "HelperBusy", "HelperNotStarted"]) assert.ok(INSTALL_ERRORS.includes(code), code);
  assert.equal(installMessageKey("NoSignature"), "update.verifyError");
  assert.equal(installMessageKey("BadSignature"), "update.verifyError");
  assert.equal(installMessageKey("HelperNotStarted"), "update.applyError");
  assert.equal(installMessageKey("HelperBusy"), "update.applyError");
  assert.equal(installMessageKey("NotChecked"), "update.downloadError");
  for (const code of ["NoSignature", "BadSignature", "NotNewer"]) assert.equal(installFallsBack(code), true, code);
  // Worth a retry: check again, or wait for the other helper.
  for (const code of ["NotChecked", "HelperBusy", "HelperNotStarted"]) assert.equal(installFallsBack(code), false, code);
});
