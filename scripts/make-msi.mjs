/**
 * Build the Windows installer (GobanStudio-Windows-x64.msi) from the
 * packaged folder, with the WiX Toolset v5 that build-windows.yml downloads
 * and checks against its pinned SHA-256 (WIX_SHA256, WIX_UTIL_SHA256).
 *
 *   WIX_DLL=<wix>/tools/net6.0/any/wix.dll \
 *   WIX_UTIL_EXT=<util>/wixext5/WixToolset.Util.wixext.dll \
 *   node scripts/make-msi.mjs dist/GobanStudio dist/GobanStudio-Windows-x64.msi [--version 17.0.1]
 *
 * The installer's version is package.json's (the version the app reports
 * and the updater compares); --version overrides it only for the upgrade
 * test in scripts/test-msi.mjs. The source is packaging/windows/GobanStudio.wxs.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const WXS = "packaging/windows/GobanStudio.wxs";
export const MSI_NAME = "GobanStudio-Windows-x64.msi";
/** Per-user install folder, under %LOCALAPPDATA%. */
export const INSTALL_SUBDIR = ["Programs", "Goban Studio"];
/** The ProgId the zip's install\register-file-types.ps1 registers too. */
export const PROG_ID = "dev.hxddh.gobanstudio.GogamerecordSGF";
/**
 * ICE checks that do not fit a per-user package harvested with <Files>:
 * every file is its own component with the file as its key path (ICE38,
 * ICE64, ICE91 expect a per-user registry key path and a RemoveFile row
 * per folder; the folder is removed whole by RemoveFolderEx instead), and
 * ICE61 warns about AllowSameVersionUpgrades (reinstalling a version
 * replaces it, wanted).
 */
export const SUPPRESSED_ICES = ["ICE38", "ICE61", "ICE64", "ICE91"];

/** Files the installer needs from the package (and the shortcut, icon and association point at). */
export const REQUIRED_FILES = ["bin/goban-studio.exe", "app-icon.ico", "resources/frontend/dist/index.html", "resources/frontend/dist/build-info.json"];

export function packageVersion(dir = root) {
  return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
}

/**
 * The MSI ProductVersion: major.minor.build, at most 255.255.65535
 * (Windows Installer compares only those three fields). Throws otherwise.
 */
export function msiVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!m) throw new Error(`not a plain x.y.z version: ${version}`);
  const [major, minor, build] = m.slice(1).map(Number);
  if (major > 255 || minor > 255 || build > 65535) throw new Error(`${version} is too large for an MSI version (255.255.65535)`);
  return `${major}.${minor}.${build}`;
}

/** The arguments to `wix build`. */
export function wixArgs({ pkgDir, out, version, utilExt, wxs = path.join(root, WXS) }) {
  return [
    "build",
    wxs,
    "-arch",
    "x64",
    "-d",
    `Version=${msiVersion(version)}`,
    "-bindpath",
    `App=${pkgDir}`,
    "-ext",
    utilExt,
    ...SUPPRESSED_ICES.flatMap((ice) => ["-sice", ice]),
    "-o",
    out,
  ];
}

export function checkPackage(pkgDir) {
  const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(pkgDir, f)));
  if (missing.length) throw new Error(`${pkgDir} is not a packaged app: missing ${missing.join(", ")}`);
  const built = JSON.parse(fs.readFileSync(path.join(pkgDir, "resources/frontend/dist/build-info.json"), "utf8")).app;
  return built;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--version");
  const version = at >= 0 ? args[at + 1] : packageVersion();
  const [pkgDir, out] = at >= 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args;
  const { WIX_DLL, WIX_UTIL_EXT } = process.env;
  if (!pkgDir || !out || !WIX_DLL || !WIX_UTIL_EXT) {
    console.error("usage: WIX_DLL=… WIX_UTIL_EXT=… node scripts/make-msi.mjs <dist/GobanStudio> <out.msi> [--version x.y.z]");
    process.exit(2);
  }
  for (const f of [WIX_DLL, WIX_UTIL_EXT]) if (!fs.existsSync(f)) throw new Error(`missing ${f}`);
  const built = checkPackage(pkgDir);
  // The package must be the version it is installed as (an upgrade-test build aside).
  if (at < 0 && built !== version) throw new Error(`the package says ${built}, package.json ${version}`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const argv = [WIX_DLL, ...wixArgs({ pkgDir: path.resolve(pkgDir), out: path.resolve(out), version, utilExt: path.resolve(WIX_UTIL_EXT) })];
  console.log(`dotnet ${argv.join(" ")}`);
  const r = spawnSync("dotnet", argv, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`wix build failed (${r.status ?? r.signal ?? r.error})`);
    process.exit(1);
  }
  const size = fs.statSync(out).size;
  if (size < 1024 * 1024) throw new Error(`${out} is only ${size} bytes`);
  console.log(`${out}: ${(size / 1048576).toFixed(1)} MB, version ${msiVersion(version)}`);
}
