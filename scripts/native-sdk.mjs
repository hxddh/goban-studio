/**
 * The Native SDK the app is built with, from the lockfile.
 *
 * `@native-sdk/cli` is a devDependency at one exact version; `npm ci`
 * installs it, and the `native` binary of its per-platform package, with
 * the integrity hashes in package-lock.json. This script is what the
 * workflows (and people) use instead of `npm install -g @native-sdk/cli`:
 *
 *   node scripts/native-sdk.mjs path        print the SDK's folder, after
 *                                           checking that the installed copy
 *                                           is the pinned one
 *   node scripts/native-sdk.mjs toolchain   also run the SDK's own install
 *                                           script (`npm ci --ignore-scripts`
 *                                           skipped it), retrying downloads
 *   node scripts/native-sdk.mjs check       the checks alone
 *
 * What the SDK's install script downloads (its `scriptc` toolchain, from
 * GitHub releases and the npm registry) is listed, with a SHA-256 or
 * SHA-512 for every file, in a manifest inside the SDK package:
 * packages/core/scripts/scriptc-toolchain.json. The script refuses a
 * download that does not match. The manifest itself is covered by the
 * lockfile's hash of the package, and its SHA-256 is pinned again below so
 * that a changed toolchain shows up in a diff of this file.
 *
 * Not pinned by any of this: Zig (mlugg/setup-zig verifies it against Zig's
 * own signing key), the runner image, and what Homebrew installs on the
 * macOS runner (cmake, ninja, eigen).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SDK_NAME = "@native-sdk/cli";
/** SHA-256 of the toolchain manifest shipped in the pinned SDK version. */
export const TOOLCHAIN_MANIFEST = "packages/core/scripts/scriptc-toolchain.json";
export const TOOLCHAIN_MANIFEST_SHA256 = "82630c695b5538607d18476613bbe77e7fbfe6db0a3d75a79776907cd8f23057";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/** The exact version package.json asks for ("0.11.1", never a range). */
export function pinnedVersion(dir = root) {
  const version = readJson(path.join(dir, "package.json")).devDependencies?.[SDK_NAME];
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error(`package.json must pin ${SDK_NAME} to one exact version (found ${JSON.stringify(version)})`);
  return version;
}

/** What the lockfile says about the SDK and its per-platform packages. */
export function lockedPackages(dir = root) {
  const lock = readJson(path.join(dir, "package-lock.json"));
  return Object.entries(lock.packages || {})
    .filter(([name]) => name === `node_modules/${SDK_NAME}` || name.startsWith(`node_modules/${SDK_NAME}-`))
    .map(([name, entry]) => ({ name: name.slice("node_modules/".length), version: entry.version, integrity: entry.integrity || "", resolved: entry.resolved || "" }));
}

/** Throws unless the lockfile pins the SDK, and each platform binary, by hash. */
export function checkLock(dir = root) {
  const version = pinnedVersion(dir);
  const packages = lockedPackages(dir);
  const sdk = packages.find((p) => p.name === SDK_NAME);
  if (!sdk) throw new Error(`package-lock.json has no entry for ${SDK_NAME}`);
  for (const p of packages) {
    if (p.version !== version) throw new Error(`package-lock.json has ${p.name} ${p.version}, package.json pins ${version}`);
    if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(p.integrity)) throw new Error(`package-lock.json has no integrity hash for ${p.name}`);
    if (!p.resolved.startsWith("https://registry.npmjs.org/")) throw new Error(`${p.name} does not come from the npm registry`);
  }
  for (const target of ["darwin-arm64", "darwin-x64", "win32-x64"]) {
    if (!packages.some((p) => p.name === `${SDK_NAME}-${target}`)) throw new Error(`package-lock.json has no ${SDK_NAME}-${target} (the native binary for a release platform)`);
  }
  return { version, packages };
}

export function sdkDir(dir = root) {
  return path.join(dir, "node_modules", ...SDK_NAME.split("/"));
}

/** Throws unless the installed SDK is the pinned version with the pinned toolchain manifest. */
export function checkInstalled(dir = root) {
  const { version } = checkLock(dir);
  const sdk = sdkDir(dir);
  if (!fs.existsSync(path.join(sdk, "package.json"))) throw new Error(`${SDK_NAME} is not installed: run npm ci`);
  const installed = readJson(path.join(sdk, "package.json")).version;
  if (installed !== version) throw new Error(`node_modules has ${SDK_NAME} ${installed}, package.json pins ${version}: run npm ci`);
  const manifest = path.join(sdk, TOOLCHAIN_MANIFEST);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(manifest)).digest("hex");
  if (digest !== TOOLCHAIN_MANIFEST_SHA256) {
    throw new Error(`${TOOLCHAIN_MANIFEST} has SHA-256 ${digest}, expected ${TOOLCHAIN_MANIFEST_SHA256}: the SDK's toolchain changed; review it and update scripts/native-sdk.mjs`);
  }
  return sdk;
}

/** Run the SDK package's own install script (its `postinstall`), retrying. */
function installToolchain(sdk) {
  const script = readJson(path.join(sdk, "package.json")).scripts?.postinstall || "";
  const match = /^node (\S+\.mjs)$/.exec(script);
  if (!match) throw new Error(`unexpected postinstall in ${SDK_NAME}: ${JSON.stringify(script)}`);
  // Its downloads from GitHub releases time out now and then: four tries.
  for (let attempt = 1; ; attempt++) {
    const run = spawnSync(process.execPath, [path.join(sdk, match[1])], { cwd: sdk, stdio: ["ignore", 2, 2] });
    if (run.status === 0) return;
    if (attempt === 4) throw new Error(`the Native SDK toolchain install failed ${attempt} times`);
    console.error(`::warning::Native SDK toolchain install failed (attempt ${attempt}); retrying`);
    spawnSync(process.execPath, ["-e", `setTimeout(() => {}, ${attempt * 20000})`]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  try {
    if (cmd === "path") {
      process.stdout.write(checkInstalled() + "\n");
    } else if (cmd === "toolchain") {
      const sdk = checkInstalled();
      installToolchain(sdk);
      console.error(`Native SDK ${pinnedVersion()} toolchain ready`);
    } else if (cmd === "check") {
      checkInstalled();
      console.error(`Native SDK ${pinnedVersion()}: lockfile, installed copy and toolchain manifest agree`);
    } else {
      console.error("usage: node scripts/native-sdk.mjs path|toolchain|check");
      process.exit(2);
    }
  } catch (e) {
    console.error(`native-sdk: ${e.message}`);
    process.exit(1);
  }
}
