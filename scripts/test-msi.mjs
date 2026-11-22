/**
 * The Windows installer, end to end on a real Windows (build-windows.yml):
 *
 *   node scripts/test-msi.mjs dist/GobanStudio-Windows-x64.msi dist/GobanStudio [upgrade.msi]
 *
 *   install    msiexec /i … /qn as the current user, no administrator:
 *              the package's files are in %LOCALAPPDATA%\Programs\Goban
 *              Studio, the Start menu shortcut exists, .sgf is registered
 *              (HKCU\Software\Classes), and Apps & Features lists Goban
 *              Studio with package.json's version and an icon.
 *   self-test  The installed exe passes scripts/selftest-app.mjs (the
 *              optional network downloads left out: the packaged folder's
 *              self-test ran them already).
 *   .sgf       An .sgf file opened through the shell (`start`) starts the
 *              installed app with that file.
 *   update     scripts/test-updater.mjs --installed: the in-app updater's
 *              probe says this folder can be updated, and its helper swaps
 *              the folder in place (the new version carries a marker file).
 *   upgrade    With a second installer of a higher version (upgrade.msi,
 *              same UpgradeCode), installing it replaces the first: one
 *              Apps & Features entry, the new version.
 *   uninstall  msiexec /x … /qn: the install folder is gone whole (with
 *              the updater's marker and the WebView2 profile the app made
 *              there), and so are the shortcut, the .sgf registration and
 *              the Apps & Features entry. The player's data folder is not
 *              touched (it is not created by this test: GOBAN_DATA_DIR).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { INSTALL_SUBDIR, PROG_ID, packageVersion } from "./make-msi.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32") {
  console.log("test-msi: Windows only; skipped");
  process.exit(0);
}
const [msiArg, pkgArg, upgradeArg] = process.argv.slice(2);
if (!msiArg || !pkgArg || !fs.existsSync(msiArg) || !fs.existsSync(pkgArg) || (upgradeArg && !fs.existsSync(upgradeArg))) {
  console.error("usage: node scripts/test-msi.mjs <GobanStudio-Windows-x64.msi> <dist/GobanStudio> [upgrade.msi]");
  process.exit(2);
}
const msi = path.resolve(msiArg);
const pkg = path.resolve(pkgArg);
const upgrade = upgradeArg ? path.resolve(upgradeArg) : "";
const version = packageVersion(root);
const installDir = path.join(process.env.LOCALAPPDATA, ...INSTALL_SUBDIR);
const shortcut = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Goban Studio.lnk");
const exe = path.join(installDir, "bin", "goban-studio.exe");
const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const work = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "goban-msi-")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let count = 0;
async function step(name, fn) {
  const started = Date.now();
  await fn();
  count++;
  console.log(`ok ${count} - ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

function ps(script) {
  const r = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`powershell failed (${r.status}): ${r.stderr}`);
  return r.stdout.trim();
}

/** A registry value as text, or null when the key or value is missing. */
function regValue(key, name = "") {
  const args = ["query", key, ...(name ? ["/v", name] : ["/ve"])];
  const r = spawnSync("reg", args, { encoding: "utf8" });
  if (r.status !== 0) return null;
  // "    <name>    REG_SZ    <data>"; the default value's name is "(Default)" (localized).
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^\s+(.*?)\s{4}(REG_\w+)(?:\s{4}(.*))?$/.exec(line);
    if (m) return (m[3] || "").trim();
  }
  return null;
}
const regKeyExists = (key) => spawnSync("reg", ["query", key], { encoding: "utf8" }).status === 0;

/**
 * The products named Goban Studio that Windows Installer knows, in every
 * context (Apps & Features lists these): {code, context, version, icon,
 * location}. Context 2 is per-user (MSIINSTALLCONTEXT_USERUNMANAGED).
 */
function arpEntries() {
  const out = ps(
    [
      "$i = New-Object -ComObject WindowsInstaller.Installer",
      "$get = { param($o, $name, $argv) $o.GetType().InvokeMember($name, 'GetProperty', $null, $o, $argv) }",
      "$all = & $get $i 'ProductsEx' @('', '', 7)",
      "$found = @(foreach ($p in $all) {",
      "  if ((& $get $p 'InstallProperty' @('ProductName')) -eq 'Goban Studio') {",
      "    [pscustomobject]@{ code = (& $get $p 'ProductCode' @()); context = [int](& $get $p 'Context' @()); version = (& $get $p 'InstallProperty' @('VersionString')); icon = (& $get $p 'InstallProperty' @('ProductIcon')); location = (& $get $p 'InstallProperty' @('InstallLocation')) }",
      "  }",
      "})",
      "ConvertTo-Json -Compress -InputObject $found",
    ].join("\n"),
  );
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function msiexec(args, log) {
  const r = spawnSync("msiexec", [...args, "/qn", "/norestart", "/l*v", log], { encoding: "utf8" });
  if (r.status !== 0 && r.status !== 3010) {
    if (fs.existsSync(log)) {
      // Windows Installer writes its log in UTF-16.
      const text = fs.readFileSync(log).toString(fs.readFileSync(log)[0] === 0xff ? "utf16le" : "utf8");
      console.error(text.split(/\r?\n/).slice(-80).join("\n"));
    }
    throw new Error(`msiexec ${args.join(" ")} exited ${r.status}`);
  }
}

/** Stop everything running from the install folder, WebView2's helpers included. */
async function stopInstalled() {
  const q = installDir.replace(/'/g, "''");
  for (let i = 0; i < 20; i++) {
    const left = ps(
      `@(Get-CimInstance Win32_Process | Where-Object { ($_.ExecutablePath -and $_.ExecutablePath.StartsWith('${q}\\', [StringComparison]::OrdinalIgnoreCase)) -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf('${q}', [StringComparison]::OrdinalIgnoreCase) -ge 0) } | ForEach-Object { $_.ProcessId }) -join ' '`,
    );
    if (!left) return;
    for (const pid of left.split(/\s+/).map(Number)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    await sleep(500);
  }
  throw new Error("processes from the install folder would not stop");
}

function runNode(script, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", script), ...args], { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => resolve(code));
  });
}

function checkInstalled(expectVersion) {
  for (const rel of ["bin/goban-studio.exe", "app-icon.ico", "README-Windows.txt", "resources/frontend/dist/index.html", "resources/frontend/dist/engine/windows/katago.exe", "resources/frontend/dist/engine/windows/katago-avx2.exe", "resources/frontend/dist/engine/model/model.txt.gz"]) {
    assert.ok(fs.existsSync(path.join(installDir, rel)), `installed: ${rel}`);
  }
  // Every file of the package is installed.
  const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
  assert.ok(count(installDir) >= count(pkg), `installed ${count(installDir)} files, the package has ${count(pkg)}`);
  assert.ok(fs.existsSync(shortcut), `Start menu shortcut ${shortcut}`);
  const target = ps(`(New-Object -ComObject WScript.Shell).CreateShortcut('${shortcut.replace(/'/g, "''")}').TargetPath`);
  assert.equal(target.toLowerCase(), exe.toLowerCase(), "the shortcut starts the installed app");
  assert.equal(regValue("HKCU\\Software\\Classes\\.sgf"), PROG_ID, ".sgf → the ProgId");
  assert.equal(regValue(`HKCU\\Software\\Classes\\${PROG_ID}\\shell\\open\\command`).toLowerCase(), `"${exe}" "%1"`.toLowerCase(), "open command");
  assert.equal(regValue(`HKCU\\Software\\Classes\\${PROG_ID}\\DefaultIcon`).toLowerCase(), path.join(installDir, "app-icon.ico").toLowerCase());
  const arp = arpEntries();
  assert.equal(arp.length, 1, `one Apps & Features entry: ${JSON.stringify(arp)}`);
  assert.equal(arp[0].version, expectVersion, "Apps & Features shows the version");
  assert.ok(arp[0].icon, "Apps & Features has an icon");
  assert.equal(arp[0].context, 2, "a per-user install (no administrator)");
}

try {
  await step(`install ${path.basename(msi)} for this user, silently`, async () => {
    assert.equal(fs.existsSync(installDir), false, `${installDir} exists before the install`);
    msiexec(["/i", msi], path.join(work, "install.log"));
    checkInstalled(version);
  });

  await step("the installed app passes the self-test", async () => {
    const code = await runNode("selftest-app.mjs", [exe], { GOBAN_SELFTEST_MODELS: "0", WEBVIEW2_USER_DATA_FOLDER: path.join(work, "webview2-selftest") });
    assert.equal(code, 0, "selftest-app.mjs");
    await stopInstalled();
  });

  await step("an .sgf file opened from the shell starts the installed app with it", async () => {
    const sgf = path.join(work, "opened from explorer.sgf");
    fs.writeFileSync(sgf, "(;GM[1]FF[4]SZ[9];B[ee];W[gc])\n");
    const env = { ...process.env, GOBAN_DATA_DIR: path.join(work, "data-open"), WEBVIEW2_USER_DATA_FOLDER: path.join(work, "webview2-open") };
    // As a double-click does it: the shell looks up .sgf and runs its open command.
    spawnSync("cmd.exe", ["/d", "/c", "start", '""', `"${sgf}"`], { env, stdio: "ignore", windowsVerbatimArguments: true });
    const q = exe.replace(/'/g, "''");
    let line = "";
    for (let i = 0; i < 120 && !line; i++) {
      await sleep(500);
      line = ps(`@(Get-CimInstance Win32_Process -Filter "Name='goban-studio.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq '${q}' } | ForEach-Object { $_.CommandLine }) -join "\`n"`);
    }
    await stopInstalled();
    assert.ok(line, "the installed app started");
    assert.ok(line.toLowerCase().includes(sgf.toLowerCase()), `with the file: ${line}`);
  });

  await step("the in-app updater updates the installed folder in place", async () => {
    const code = await runNode("test-updater.mjs", [pkg, "--installed", installDir]);
    assert.equal(code, 0, "test-updater.mjs --installed");
    await stopInstalled();
    assert.ok(fs.existsSync(path.join(installDir, "resources", "goban-update-test-marker.txt")), "the updated version is in place");
    assert.ok(fs.existsSync(exe));
  });

  let current = msi;
  if (upgrade) {
    await step(`a newer installer (${path.basename(upgrade)}) replaces the installed version`, async () => {
      msiexec(["/i", upgrade], path.join(work, "upgrade.log"));
      const arp = arpEntries();
      assert.equal(arp.length, 1, `one Apps & Features entry after the upgrade: ${JSON.stringify(arp)}`);
      assert.notEqual(arp[0].version, version, "the newer version is listed");
      checkInstalled(arp[0].version);
      current = upgrade;
    });
  }

  await step("uninstall silently: the folder, the shortcut, the .sgf registration and the entry are gone", async () => {
    await stopInstalled();
    msiexec(["/x", current], path.join(work, "uninstall.log"));
    assert.equal(fs.existsSync(installDir), false, `${installDir} is removed whole`);
    assert.equal(fs.existsSync(shortcut), false, "the shortcut is removed");
    assert.notEqual(regValue("HKCU\\Software\\Classes\\.sgf"), PROG_ID, ".sgf no longer points at Goban Studio");
    assert.equal(regValue("HKCU\\Software\\Classes\\.sgf\\OpenWithProgids", PROG_ID), null);
    assert.equal(regKeyExists(`HKCU\\Software\\Classes\\${PROG_ID}`), false, "the ProgId is removed");
    assert.equal(regKeyExists("HKCU\\Software\\Goban Studio"), false, "the installer's own key is removed");
    assert.deepEqual(arpEntries(), [], "no Apps & Features entry");
  });
} catch (e) {
  console.error(`not ok - ${e.message}`);
  console.error(e);
  // Leave the machine as it was found, as far as possible.
  try {
    await stopInstalled();
    if (fs.existsSync(installDir)) {
      for (const m of [upgrade, msi].filter(Boolean)) spawnSync("msiexec", ["/x", m, "/qn", "/norestart"]);
    }
  } catch {}
  process.exit(1);
}
console.log(`\ntest-msi: ${count} passed.`);
