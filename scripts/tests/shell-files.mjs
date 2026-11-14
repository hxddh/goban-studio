/**
 * Shell: the user's own files (host.js writeFileChunks / readFileChunks over
 * studio.writeTextFile / studio.readTextFile) move in chunks, so a backup of
 * every game with its analysis is written and read back whole, however large.
 * The fake host keeps the same rules as store.zig writePath / readPath.
 */
import { test, assert, fs, path, root } from "./helpers.mjs";
import { FILE_CHUNK_BYTES, installFlushHook, openFileDialog, readFileChunks, revealDataDir, saveFileDialog, writeFileChunks } from "../../src/web/js/host.js";
import { INSTALL_ERRORS, installFallsBack, installMessageKey, interpretInstallStatus } from "../../src/web/js/update.js";
import * as Sign from "../signing-notes.mjs";
import { ENGINE_FILES, INSTALL_FILES, NET_FILES, SHELL_FILES, shellSource } from "../shell-source.mjs";

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

await test("shell files: the dialogs are the host's own and pass only what they understand", async () => {
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

await test("shell quit: the page flushes when the host asks, then answers with the same id", async () => {
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

await test("shell update: install refusals are explained, and the unfixable ones fall back to the download page", () => {
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

await test("shell update: sums or a package of another version are a verification error, not a retry", () => {
  for (const code of ["NoVersion", "VersionMismatch"]) {
    assert.ok(INSTALL_ERRORS.includes(code), code);
    assert.equal(installMessageKey(code), "update.verifyError", code);
    assert.equal(installFallsBack(code), true, code);
  }
  // A download the host is continuing on a new connection is still a download.
  const s = interpretInstallStatus({ ok: true, phase: "downloading", tag: "v99.0.0", received: 50, total: 100, retries: 2, canInstall: true, blocked: "" });
  assert.equal(s.phase, "downloading");
  assert.equal(s.retries, 2);
  assert.equal(s.progress, 0.5);
  // A host that does not report it, or reports nonsense: zero.
  assert.equal(interpretInstallStatus({ ok: true, phase: "idle" }).retries, 0);
  assert.equal(interpretInstallStatus({ ok: true, phase: "idle", retries: "x" }).retries, 0);
  assert.equal(interpretInstallStatus(null).retries, 0);
});

await test("shell files: the data folder is shown by the host; the page names no path", async () => {
  const calls = [];
  const ok = await revealDataDir(async (command, payload) => {
    calls.push({ command, payload });
    return { ok: true, path: "C:\\Users\\a\\AppData\\Local\\dev.hxddh.gobanstudio\\Data\\data" };
  });
  assert.deepEqual(calls, [{ command: "studio.revealDataDir", payload: {} }]);
  assert.deepEqual(ok, { ok: true, path: "C:\\Users\\a\\AppData\\Local\\dev.hxddh.gobanstudio\\Data\\data" });
  // The folder could not be opened: the path is still there to show.
  assert.deepEqual(await revealDataDir(async () => ({ ok: false, path: "/x/data" })), { ok: false, path: "/x/data", error: "Failed" });
  assert.deepEqual(await revealDataDir(async () => ({ ok: false, error: "NoDataDir" })), { ok: false, path: "", error: "NoDataDir" });
  // An older host without the command, and a bridge failure.
  const older = await revealDataDir(async () => {
    throw new Error("unknown command studio.revealDataDir");
  });
  assert.deepEqual(older, { ok: false, path: "", error: "unavailable" });
  const broken = await revealDataDir(async () => {
    throw new Error("boom");
  });
  assert.equal(broken.error, "Failed");
  // The browser preview has no folder.
  assert.deepEqual(await revealDataDir(), { ok: false, path: "", error: "unavailable" });
  const main = shellSource();
  assert.ok(main.includes('.{ .name = "studio.revealDataDir", .invoke = bridge_files.revealDataDir },'));
  // The handler never reads a path from the page.
  const handler = main.slice(main.indexOf("fn revealDataDir("), main.indexOf("fn spawnFolder("));
  assert.match(handler, /_ = invocation;/);
  assert.match(handler, /const dir = self\.store\.root\(\);/);
  assert.doesNotMatch(handler, /payload/);
});

const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

await test("shell files: every text that says where the data is names the folder the app really uses", () => {
  // src/paths.zig asks the SDK for the `.data` directory of this id; its
  // Zig test pins what that is on macOS and Windows.
  const paths = read("src/paths.zig");
  assert.match(paths, /pub const bundle_id = "dev\.hxddh\.gobanstudio";/);
  assert.ok(paths.includes('"/Users/a/Library/Application Support/dev.hxddh.gobanstudio"'));
  assert.ok(paths.includes('"C:\\\\Users\\\\a\\\\AppData\\\\Local\\\\dev.hxddh.gobanstudio\\\\Data"'));
  // The id is spelled once in the shell (tests aside).
  for (const f of [...SHELL_FILES, ...INSTALL_FILES, ...ENGINE_FILES, "src/models.zig", "src/update.zig", "src/store.zig", "src/instance.zig", ...NET_FILES]) {
    const code = read(f).split("// ------------------------------------------------------------ tests")[0].split("// ------------------------------------------------------------------ tests")[0];
    assert.doesNotMatch(code, /"dev\.hxddh\.gobanstudio"/, `${f} takes the id from paths.zig`);
  }
  assert.equal((read("app.zon").match(/\.id = "([^"]+)"/) || [])[1], "dev.hxddh.gobanstudio");

  const mac = read("packaging/README-macOS.txt");
  const win = read("packaging/README-Windows.txt");
  const storage = read("docs/storage.md");
  assert.ok(mac.includes("~/Library/Application Support/dev.hxddh.gobanstudio/data"));
  assert.ok(mac.includes("~/Library/Application Support/dev.hxddh.gobanstudio/models"));
  assert.ok(win.includes("%LOCALAPPDATA%\\dev.hxddh.gobanstudio\\Data\\data"));
  assert.ok(win.includes("dev.hxddh.gobanstudio\\Data\\models"));
  assert.ok(storage.includes("`~/Library/Application Support/dev.hxddh.gobanstudio`"));
  assert.ok(storage.includes("`%LOCALAPPDATA%\\dev.hxddh.gobanstudio\\Data`"));
  // Nobody is told any more that their games are in the WebView2 folder,
  // or to copy it when updating by hand.
  for (const [name, text] of [["README-Windows.txt", win], ["apply-windows.ps1", read("src/updater/apply-windows.ps1")], ["storage.md", storage]]) {
    assert.doesNotMatch(text, /(games|settings|progress)[^.]*\b(are stored|live)\b[^.]*WebView2/i, name);
    assert.doesNotMatch(text, /copy that folder/i, name);
  }
  assert.match(win, /WebView2 that appears inside the app\nfolder belongs to the WebView2 browser component/);
  // Uninstalling: what stays, and how to remove it.
  for (const text of [mac, win]) {
    assert.match(text, /^Uninstalling\n-+\n/m);
    assert.match(text, /Your data and any downloaded networks stay/);
  }
  assert.match(mac, /to remove them as well, delete\n\n  ~\/Library\/Application Support\/dev\.hxddh\.gobanstudio\n/);
  assert.match(win, /to remove them as well, delete\n\n  %LOCALAPPDATA%\\dev\.hxddh\.gobanstudio\n/);
});

await test("shell files: first launch of an unsigned Mac build is described for macOS 15, for both app names", () => {
  const adhoc = Sign.normalizeStatus("macos", { mode: "adhoc" });
  const devId = Sign.normalizeStatus("macos", { mode: "developer-id" });
  const notarized = Sign.normalizeStatus("macos", { mode: "developer-id", notarized: true });
  const mac = read("packaging/README-macOS.txt");
  assert.deepEqual(Sign.APP_NAMES, ["Goban Studio.app", "GobanStudio.app"]);
  for (const status of [adhoc, devId]) {
    const readme = Sign.applyToReadme(mac, status);
    // macOS 15 removed right-click → Open: the button in System Settings is the way.
    assert.match(readme, /macOS 15 or later: open System Settings > Privacy & Security, scroll\n\s+down to Security, and click "Open Anyway" next to Goban Studio\./);
    assert.match(readme, /macOS 14 or earlier: right-click \(or Control-click\) the app/);
    assert.ok(readme.indexOf("macOS 15 or later") < readme.indexOf("macOS 14 or earlier"));
    // The .dmg's app and the .zip's app have different names: a line for each, quoted.
    assert.ok(readme.includes('     xattr -dr com.apple.quarantine "/Applications/Goban Studio.app"\n'));
    assert.ok(readme.includes('     xattr -dr com.apple.quarantine "/Applications/GobanStudio.app"\n'));
    const notes = Sign.firstLaunchText(status);
    assert.match(notes, /macOS 15 or later go to System Settings → Privacy & Security → \*\*Open Anyway\*\*/);
    assert.match(notes, /macOS 14 or earlier right-click the app → Open/);
    assert.ok(notes.includes('`xattr -dr com.apple.quarantine "/Applications/Goban Studio.app"`'));
    assert.ok(notes.includes("`GobanStudio.app`"), "the notes say the zip's app has another name");
    assert.doesNotMatch(notes, /\n/, "one table cell");
  }
  const signed = Sign.applyToReadme(mac, notarized);
  assert.doesNotMatch(signed, /Open Anyway|xattr/);
  assert.doesNotMatch(Sign.firstLaunchText(notarized), /Open Anyway|xattr|right-click/);
  // The disk image is for installing, not for running.
  assert.match(mac, /drag "Goban Studio" onto the Applications folder beside\n\s+it/);
  assert.match(mac, /GobanStudio\.app to Applications\. It is the same app under\n\s+either name\./);
});

await test("shell files: one instance per data folder is documented where the lock and inbox are", () => {
  const zig = read("src/instance.zig");
  assert.match(zig, /pub const lock_name = "instance\.lock";/);
  assert.match(zig, /pub const inbox_name = "inbox";/);
  const storage = read("docs/storage.md");
  assert.ok(storage.includes("`<app data>/data/instance.lock`"));
  assert.ok(storage.includes("`<app data>/data/inbox/`"));
  // Neither is a store key, so the page never sees them listed.
  const main = read("src/main.zig");
  assert.match(main, /if \(!lifecycle\.claimInstance\(&app_state, init, data_dir\)\) return;/);
  assert.ok(main.indexOf("if (!lifecycle.claimInstance(&app_state, init, data_dir)) return;") < main.indexOf("app_state.store.init(init.io, data_dir);"), "before the store is opened");
  assert.match(read("src/lifecycle.zig"), /if \(!by_helper and install_apply\.ownUpdateInProgress\(io\)\)/, "a launch during an update stays out of the helper's way");
  for (const text of [read("packaging/README-macOS.txt"), read("packaging/README-Windows.txt")]) assert.doesNotMatch(text, /instance\.lock/, "an implementation detail, not in the user's README");
  assert.match(read("packaging/README-Windows.txt"), /Only one copy runs at a time/);
});

await test("shell files: every file the shell commits by rename goes through durable.zig, so it survives a power cut", () => {
  const zigFiles = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".zig"));
  for (const f of zigFiles) {
    if (f === "durable.zig") continue;
    const code = read(`src/${f}`).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    const renames = code.match(/\brenameAbsolute\(|\.rename\(/g) || [];
    // The second launch's inbox request is read and deleted by the running
    // app within moments; it holds nothing worth flushing to the disk.
    const allowed = f === "instance.zig" ? 1 : 0;
    const durable = (code.match(/durable\.renameAbsolute\(/g) || []).length;
    assert.equal(renames.length - durable, allowed, `${f}: a rename outside durable.zig`);
    assert.doesNotMatch(code, /\bfile\.sync\(/, `${f}: a commit flushes with durable.syncFile`);
  }
  const durable = read("src/durable.zig");
  assert.match(durable, /std\.c\.F\.FULLFSYNC/, "macOS flushes the drive's cache");
  assert.match(durable, /MOVEFILE_WRITE_THROUGH/, "Windows moves write-through");
  assert.match(durable, /\.iterate = true/, "a directory is opened with a descriptor fsync accepts");
  const store = read("src/store.zig");
  assert.equal((store.match(/durable\.syncFile\(/g) || []).length, 2, "both store writes flush the file");
  assert.equal((store.match(/durable\.renameIn\(/g) || []).length, 1, "and rename through the one retrying helper");
});
