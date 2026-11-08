/**
 * Shell: the macOS update helper's lock and "started" marker (v13), run for
 * real with /bin/sh against a fake installation. Everything after the
 * marker needs macOS (ditto, open) and is covered by scripts/test-updater.mjs
 * on the release runners; here the copy step simply fails, which must
 * change nothing. The Windows helper's equivalent (a delete-on-close lock
 * file, CreateNew marker) is exercised by test-updater.mjs on Windows.
 */
import os from "node:os";
import { spawn } from "node:child_process";
import { test, assert, fs, path, root, sleep } from "./helpers.mjs";

const helper = path.join(root, "src/updater/apply-macos.sh");
const posix = process.platform !== "win32" && fs.existsSync("/bin/sh");

function fakeInstall() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "goban-helper-")));
  const target = path.join(dir, "Goban Studio.app");
  const root = path.join(dir, "GobanStudio-update");
  const staged = path.join(root, "job", "unpacked", "GobanStudio.app");
  fs.mkdirSync(path.join(target, "Contents", "MacOS"), { recursive: true });
  fs.mkdirSync(path.join(staged, "Contents", "MacOS"), { recursive: true });
  return { dir, target, root, staged, lock: path.join(dir, ".Goban Studio.app.goban-lock"), log: path.join(dir, "update.log") };
}

function runHelper(inst, { pid, token }) {
  const ack = path.join(inst.root, `goban-update-ack-${token}.txt`);
  const started = path.join(inst.root, `goban-update-started-${token}.txt`);
  const child = spawn("/bin/sh", [helper, String(pid), inst.target, inst.staged, ack, inst.log, "5", inst.root, started], {
    env: { PATH: process.env.PATH, GOBAN_UPDATE_EXIT_TIMEOUT: "20" },
    stdio: "ignore",
  });
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, exited, started };
}

async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for " + what);
    await sleep(25);
  }
}

if (posix) {
  await test("update helper: it takes the lock and proves it started; a second helper for the same app changes nothing", async () => {
    const inst = fakeInstall();
    const app = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
    try {
      const a = runHelper(inst, { pid: app.pid, token: "aa01" });
      await until(() => fs.existsSync(a.started), 5000, "the started marker");
      assert.match(fs.readFileSync(a.started, "utf8"), /^started \d+/);
      assert.equal(fs.readFileSync(path.join(inst.lock, "pid"), "utf8").trim(), String(a.child.pid));

      const b = runHelper(inst, { pid: app.pid, token: "bb02" });
      assert.equal(await b.exited, 2, "the second helper gives up");
      assert.equal(fs.existsSync(b.started), false, "and never claims to have started");
      assert.match(fs.readFileSync(inst.log, "utf8"), /another update helper is working on/);
      assert.ok(fs.existsSync(inst.lock), "the first helper still holds the lock");

      // The app exits; the first helper goes on (the copy needs macOS and
      // fails here: nothing changed) and releases the lock on its way out.
      app.kill();
      assert.equal(await a.exited, 2);
      assert.ok(fs.existsSync(path.join(inst.target, "Contents", "MacOS")), "the installed app is untouched");
      assert.equal(fs.existsSync(inst.lock), false, "the lock is released");
      assert.deepEqual(fs.readdirSync(inst.dir).filter((n) => n.includes(".goban-")), []);
    } finally {
      app.kill();
      fs.rmSync(inst.dir, { recursive: true, force: true });
    }
  });

  await test("update helper: when the app already stopped waiting (it claimed the marker), the helper does nothing", async () => {
    const inst = fakeInstall();
    try {
      fs.mkdirSync(inst.root, { recursive: true });
      const started = path.join(inst.root, "goban-update-started-cc03.txt");
      fs.writeFileSync(started, "cancelled\n");
      // A pid that is certainly gone: the helper must not even wait for it.
      const h = runHelper(inst, { pid: 2147483646, token: "cc03" });
      assert.equal(await h.exited, 2);
      assert.equal(fs.readFileSync(started, "utf8"), "cancelled\n");
      assert.match(fs.readFileSync(inst.log, "utf8"), /stopped waiting for this helper/);
      assert.equal(fs.existsSync(inst.lock), false);
    } finally {
      fs.rmSync(inst.dir, { recursive: true, force: true });
    }
  });

  await test("update helper: a lock left by a helper that died is taken over", async () => {
    const inst = fakeInstall();
    try {
      fs.mkdirSync(inst.lock);
      fs.writeFileSync(path.join(inst.lock, "pid"), "2147483646\n");
      const h = runHelper(inst, { pid: 2147483646, token: "dd04" });
      assert.equal(await h.exited, 2, "the copy fails off macOS");
      assert.ok(fs.existsSync(h.started), "it started");
      assert.match(fs.readFileSync(inst.log, "utf8"), /taking over a stale lock/);
      assert.equal(fs.existsSync(inst.lock), false);
    } finally {
      fs.rmSync(inst.dir, { recursive: true, force: true });
    }
  });

  await test("update helper: a started path outside the naming scheme is refused before anything happens", async () => {
    const inst = fakeInstall();
    try {
      const child = spawn("/bin/sh", [helper, "1", inst.target, inst.staged, path.join(inst.root, "goban-update-ack-ee05.txt"), inst.log, "5", inst.root, "/tmp/evil.txt"], { stdio: "ignore", env: { PATH: process.env.PATH } });
      assert.equal(await new Promise((r) => child.on("exit", r)), 2);
      assert.equal(fs.existsSync(inst.lock), false);
      assert.match(fs.readFileSync(inst.log, "utf8"), /bad started path/);
    } finally {
      fs.rmSync(inst.dir, { recursive: true, force: true });
    }
  });
}
