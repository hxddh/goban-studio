/**
 * v5 updater: end-to-end tests of the parts the unit tests cannot reach,
 * on the real OS, with the real packaged app. Run by build-macos.yml and
 * build-windows.yml after packaging:
 *
 *   node scripts/test-updater.mjs <dist/GobanStudio.app | dist/GobanStudio> [--live <tag>]
 *
 * What is tested, and how (nothing here changes what the app trusts: the
 * download address is fixed to GitHub in src/install.zig and is not
 * configurable, so these tests drive the stages around it):
 *
 *   swap       The helper the app embeds (src/updater/apply-*.{sh,ps1}) is
 *              run exactly as the app runs it, against a temp install of
 *              the packaged app ("Goban Studio.app" / "Goban Studio\") and a
 *              staged copy carrying a marker file. It must wait for the
 *              "app" process to exit, swap, start the new app — the real
 *              one, which acknowledges through its page — and remove the
 *              backup. Windows: a file in the install folder is held open
 *              for a few seconds (the swap must retry), and the player's
 *              WebView2 profile must move to the new folder.
 *   rollback   The staged app's executable is replaced by one that exits at
 *              once: no acknowledgement, so the helper must restore the old
 *              app (and, on Windows, the profile) and start it again.
 *   no exit    The "app" never exits: the helper must give up and change
 *              nothing.
 *   read-only  The real app, launched from a folder this user cannot write
 *              (GOBAN_UPDATE_PROBE_OUT), must report canInstall:false,
 *              blocked:"ReadOnlyLocation"; launched from a writable copy,
 *              canInstall:true.
 *   --live     Optional: the real app downloads <tag> from GitHub, checks it
 *              against that release's SHA256SUMS, unpacks and checks it
 *              (codesign on macOS), reports "ready", and discards it. Needs
 *              the network and a published release with this platform's
 *              asset.
 *
 * Verification of the bytes (SHA256SUMS parsing, hash comparison, zip
 * entry checks, CPU architecture, ditto + codesign, no quarantine flag) is
 * covered by the Zig tests in src/install.zig (`native test`).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
if (!isMac && !isWin) {
  console.log("test-updater: macOS and Windows only; skipped");
  process.exit(0);
}

const args = process.argv.slice(2);
const pkg = args[0] && path.resolve(args[0]);
const liveTag = args.includes("--live") ? args[args.indexOf("--live") + 1] : "";
if (!pkg || !fs.existsSync(pkg)) {
  console.error("usage: node scripts/test-updater.mjs <dist/GobanStudio.app | dist/GobanStudio> [--live <tag>]");
  process.exit(2);
}

const helper = path.join(root, "src", "updater", isMac ? "apply-macos.sh" : "apply-windows.ps1");
const exeRel = isMac ? path.join("Contents", "MacOS", "goban-studio") : path.join("bin", "goban-studio.exe");
const markerRel = isMac ? path.join("Contents", "Resources", "goban-update-test-marker.txt") : path.join("resources", "goban-update-test-marker.txt");
const profileRel = path.join("bin", "goban-studio.exe.WebView2", "EBWebView", "goban-profile-marker.txt");
const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let count = 0;
let failures = 0;
async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    count++;
    console.log(`ok ${count} - ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failures++;
    console.error(`not ok - ${name}`);
    console.error(e);
  }
}

function tempDir(name) {
  // The path as the app sees its own: realpath turns macOS /var into
  // /private/var, and the native form expands Windows 8.3 short names
  // (C:\Users\RUNNER~1 → C:\Users\runneradmin), which process paths use.
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `goban-${name}-`)));
}

function copyTree(src, dst) {
  if (isMac) execFileSync("/usr/bin/ditto", [src, dst]);
  else fs.cpSync(src, dst, { recursive: true });
}

function resign(app) {
  if (isMac) execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
}

/** A temp install: <dir>/Goban Studio.app or <dir>\Goban Studio\ */
function install(dir) {
  const target = path.join(dir, isMac ? "Goban Studio.app" : "Goban Studio");
  copyTree(pkg, target);
  if (isWin) {
    fs.mkdirSync(path.dirname(path.join(target, profileRel)), { recursive: true });
    fs.writeFileSync(path.join(target, profileRel), "the player's games\n");
  }
  return target;
}

/** The verified, unpacked new version as the app stages it. */
function stage(dir, { broken = false } = {}) {
  const staged = path.join(dir, "GobanStudio-update", "job", "unpacked", isMac ? "GobanStudio.app" : "GobanStudio");
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  copyTree(pkg, staged);
  fs.writeFileSync(path.join(staged, markerRel), "new version\n");
  if (broken) {
    const exe = path.join(staged, exeRel);
    fs.rmSync(exe);
    // Starts and exits at once, never acknowledging.
    if (isMac) fs.writeFileSync(exe, "#!/bin/sh\nexit 3\n", { mode: 0o755 });
    else fs.copyFileSync(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "whoami.exe"), exe);
  }
  if (!broken) resign(staged);
  else {
    try {
      resign(staged);
    } catch {
      // A script cannot always be signed; the helper never checks.
    }
  }
  return staged;
}

/** A stand-in for the running app: a process that exits after `ms`. */
function fakeApp(ms) {
  const child = spawn(process.execPath, ["-e", `setTimeout(() => {}, ${ms})`], { stdio: "ignore" });
  return child;
}

function runHelper({ pid, target, staged, ack, log, ackTimeout = 60, exitTimeout = 120, cleanup = "" }) {
  const env = { ...process.env };
  // The real app keeps its WebView2 profile in the install folder by default.
  delete env.WEBVIEW2_USER_DATA_FOLDER;
  const argv = isMac
    ? ["/bin/sh", [helper, String(pid), target, staged, ack, log, String(ackTimeout), cleanup]]
    : [
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          helper,
          "-AppPid",
          String(pid),
          "-InstallDir",
          target,
          "-StagedDir",
          staged,
          "-AckFile",
          ack,
          "-LogFile",
          log,
          "-AckTimeout",
          String(ackTimeout),
          "-ExitTimeout",
          String(exitTimeout),
          "-LockRetries",
          "30",
          ...(cleanup ? ["-CleanupDir", cleanup] : []),
        ],
      ];
  if (isMac) env.GOBAN_UPDATE_EXIT_TIMEOUT = String(exitTimeout);
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv[1], { env, cwd: os.tmpdir(), stdio: "ignore" });
    child.on("exit", (code) => resolve(code));
  });
}

/** Processes running from inside `dir` (the launched app and KataGo). */
function processesIn(dir) {
  if (isMac) {
    const out = spawnSync("/bin/ps", ["-axo", "pid=,comm="], { encoding: "utf8" }).stdout || "";
    return out
      .split("\n")
      .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
      .filter((m) => m && m[2].startsWith(dir + "/"))
      .map((m) => Number(m[1]));
  }
  const script = `Get-Process | Where-Object { try { $_.Path -and $_.Path.StartsWith('${dir.replace(/'/g, "''")}\\', [StringComparison]::OrdinalIgnoreCase) } catch { $false } } | ForEach-Object { $_.Id }`;
  const out = spawnSync(powershell, ["-NoProfile", "-Command", script], { encoding: "utf8" }).stdout || "";
  return out.split(/\s+/).filter(Boolean).map(Number);
}

async function stopProcessesIn(dir) {
  for (let i = 0; i < 20; i++) {
    const pids = processesIn(dir);
    if (!pids.length) return;
    for (const pid of pids) {
      try {
        process.kill(pid, i < 5 ? "SIGTERM" : "SIGKILL");
      } catch {}
    }
    await sleep(500);
  }
}

async function waitFor(fn, ms, what) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (fn()) return;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function leftovers(dir) {
  return fs.readdirSync(dir).filter((n) => n.includes(".goban-"));
}

/** Every running Goban Studio process with its path (diagnostics). */
function allAppProcesses() {
  if (isMac) return spawnSync("/bin/ps", ["-axo", "pid=,comm="], { encoding: "utf8" }).stdout.split("\n").filter((l) => /Goban|goban/.test(l)).join("\n");
  const script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'goban*' -or $_.Name -like 'msedgewebview2*' } | ForEach-Object { \"$($_.ProcessId) $($_.Name) $($_.ExecutablePath) :: $($_.CommandLine)\" }";
  return spawnSync(powershell, ["-NoProfile", "-Command", script], { encoding: "utf8" }).stdout || "";
}

function showLog(log) {
  if (fs.existsSync(log)) console.error("--- helper log\n" + fs.readFileSync(log, "utf8"));
}

/** Hold a file open without sharing, so the folder cannot be renamed (Windows). */
function lockFile(file, ms) {
  const script = `$f = [System.IO.File]::Open('${file.replace(/'/g, "''")}', 'Open', 'Read', 'None'); Start-Sleep -Milliseconds ${ms}; $f.Close()`;
  return spawn(powershell, ["-NoProfile", "-Command", script], { stdio: "ignore" });
}

/** Launch the real app with GOBAN_UPDATE_PROBE_OUT and read its report. */
async function probe(target, { tag = "", timeoutMs = 120000 } = {}) {
  const dir = tempDir("probe");
  const out = path.join(dir, "probe.json");
  const env = { ...process.env, GOBAN_UPDATE_PROBE_OUT: out, WEBVIEW2_USER_DATA_FOLDER: path.join(dir, "webview2") };
  delete env.GOBAN_SELFTEST_OUT;
  delete env.GOBAN_TOUR_OUT;
  if (tag) env.GOBAN_UPDATE_PROBE_TAG = tag;
  const exe = path.join(target, exeRel);
  const child = spawn(exe, [], { cwd: path.dirname(exe), env, stdio: "inherit" });
  let report = null;
  try {
    await waitFor(
      () => {
        try {
          report = JSON.parse(fs.readFileSync(out, "utf8"));
          return true;
        } catch {
          return false;
        }
      },
      timeoutMs,
      "the probe report",
    );
  } finally {
    child.kill();
    await sleep(500);
    await stopProcessesIn(target);
  }
  return report;
}

// ------------------------------------------------------------------- tests

// --live runs only the network test (a separate, non-blocking CI step).
if (!liveTag) {
  await test("swap: waits for the app, replaces it, starts the new version, removes the backup", async () => {
    const dir = tempDir("swap");
    const apps = path.join(dir, "Applications");
    fs.mkdirSync(apps);
    const target = install(apps);
    const staged = stage(dir);
    const cleanup = path.join(dir, "GobanStudio-update");
    const ack = path.join(cleanup, "goban-update-ack-0123abcd.txt");
    const log = path.join(dir, "update.log");
    const app = fakeApp(3000);
    // Windows: something holds a file in the install folder for a while after
    // the app exits (WebView2, antivirus); the swap has to wait it out.
    const locker = isWin ? lockFile(path.join(target, "README-Windows.txt"), 7000) : null;
    try {
      const code = await runHelper({ pid: app.pid, target, staged, ack, log, cleanup });
      if (code !== 0) showLog(log);
      assert.equal(code, 0, "helper exit code");
      assert.ok(fs.existsSync(path.join(target, markerRel)), "the new version is in place under the installed name");
      assert.deepEqual(leftovers(apps), [], "no backup or temporary copy is left");
      assert.equal(fs.existsSync(cleanup), false, "the staging directory is removed");
      const text = fs.readFileSync(log, "utf8");
      assert.match(text, /the new app started/);
      assert.match(text, /update complete/);
      if (isWin) {
        assert.ok(fs.existsSync(path.join(target, profileRel)), "the player's WebView2 profile moved to the new version");
        assert.match(text, /succeeded on attempt/, "the locked folder was retried");
      }
    } finally {
      locker?.kill();
      app.kill();
      await stopProcessesIn(target);
    }
  });

  await test("rollback: a new version that does not start is replaced by the old one, which is started again", async () => {
    const dir = tempDir("rollback");
    const apps = path.join(dir, "Applications");
    fs.mkdirSync(apps);
    const target = install(apps);
    const staged = stage(dir, { broken: true });
    const ack = path.join(dir, "goban-update-ack-feedbeef.txt");
    const log = path.join(dir, "update.log");
    const app = fakeApp(1000);
    try {
      const code = await runHelper({ pid: app.pid, target, staged, ack, log, ackTimeout: 15 });
      if (code !== 1) showLog(log);
      assert.equal(code, 1, "helper exit code (rolled back)");
      assert.equal(fs.existsSync(path.join(target, markerRel)), false, "the old version is back");
      assert.ok(fs.existsSync(path.join(target, exeRel)));
      assert.deepEqual(leftovers(apps), [], "no backup or failed copy is left");
      if (isWin) assert.ok(fs.existsSync(path.join(target, profileRel)), "the profile went back with the old version");
      assert.match(fs.readFileSync(log, "utf8"), /previous version restored/);
      // The old app is started again (with --goban-update-failed).
      try {
        await waitFor(() => processesIn(target).length > 0, 30000, "the old app to start again");
      } catch (e) {
        showLog(log);
        console.error("--- app processes anywhere\n" + allAppProcesses());
        throw e;
      }
    } finally {
      app.kill();
      await stopProcessesIn(target);
    }
  });

  await test("no exit: when the app does not quit, nothing is changed", async () => {
    const dir = tempDir("noexit");
    const apps = path.join(dir, "Applications");
    fs.mkdirSync(apps);
    const target = install(apps);
    const staged = stage(dir);
    const ack = path.join(dir, "goban-update-ack-00aa.txt");
    const log = path.join(dir, "update.log");
    const app = fakeApp(120000);
    try {
      const code = await runHelper({ pid: app.pid, target, staged, ack, log, exitTimeout: 3 });
      assert.equal(code, 2, "helper exit code (nothing changed)");
      assert.equal(fs.existsSync(path.join(target, markerRel)), false);
      assert.deepEqual(leftovers(apps), []);
      assert.match(fs.readFileSync(log, "utf8"), /did not exit/);
    } finally {
      app.kill();
    }
  });

  await test("read-only: an installation this user cannot write falls back; a writable one can install", async () => {
    const writable = install(tempDir("rw"));
    const ok = await probe(writable);
    assert.equal(ok.status?.ok, true, JSON.stringify(ok));
    assert.equal(ok.status.canInstall, true, JSON.stringify(ok.status));
    assert.equal(ok.status.platform, isMac ? (process.arch === "arm64" ? "macos-arm64" : "macos-x64") : "windows-x64");

    const roParent = tempDir("ro");
    const ro = install(roParent);
    if (isMac) {
      fs.chmodSync(roParent, 0o555);
      fs.chmodSync(path.join(ro, "Contents"), 0o555);
    } else {
      execFileSync("icacls", [roParent, "/deny", `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)(WD,AD)`], { stdio: "ignore" });
    }
    try {
      const report = await probe(ro);
      assert.equal(report.status?.canInstall, false, JSON.stringify(report.status));
      assert.equal(report.status.blocked, "ReadOnlyLocation");
    } finally {
      if (isMac) {
        fs.chmodSync(roParent, 0o755);
        fs.chmodSync(path.join(ro, "Contents"), 0o755);
      } else {
        execFileSync("icacls", [roParent, "/remove:d", `${process.env.USERDOMAIN}\\${process.env.USERNAME}`], { stdio: "ignore" });
      }
    }
  });
}

if (liveTag) {
  await test(`live: ${liveTag} is downloaded from GitHub, verified against SHA256SUMS, unpacked and discarded`, async () => {
    const target = install(tempDir("live"));
    const report = await probe(target, { tag: liveTag, timeoutMs: 10 * 60 * 1000 });
    console.log(JSON.stringify(report, null, 2));
    assert.equal(report.download?.ok, true, `download: ${JSON.stringify(report.download)}`);
    assert.equal(report.after?.phase, "ready");
    assert.equal(report.cancel?.ok, true);
  });
}

if (failures) {
  console.error(`\ntest-updater: ${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\ntest-updater: ${count} passed.`);
process.exit(0);
