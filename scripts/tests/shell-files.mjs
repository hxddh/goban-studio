/**
 * Shell: the user's own files (host.js writeFileChunks / readFileChunks over
 * studio.writeTextFile / studio.readTextFile) move in chunks, so a backup of
 * every game with its analysis is written and read back whole, however large.
 * The fake host keeps the same rules as store.zig writePath / readPath.
 */
import { test, assert } from "./helpers.mjs";
import { FILE_CHUNK_BYTES, readFileChunks, writeFileChunks } from "../../src/web/js/host.js";

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
