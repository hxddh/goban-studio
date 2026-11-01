/**
 * Copy the platform KataGo binary into a packaged app, after `native package`
 * has finished. The SDK asset bundler refuses a single file over 16 MiB; this
 * also keeps the web preview from carrying a 30 MB executable it cannot use.
 *
 * Usage: node scripts/install-engine.mjs <package-root> <macos|windows|linux>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetRoot = process.argv[2];
const platform = process.argv[3];
if (!targetRoot || !["macos", "windows", "linux"].includes(platform)) {
  console.error("usage: node scripts/install-engine.mjs <package-root> <macos|windows|linux>");
  process.exit(2);
}

const source = path.join(root, "engine", platform);
if (!fs.existsSync(source)) {
  console.error(`missing engine/${platform}; build or download KataGo first`);
  process.exit(1);
}

const isMac = platform === "macos" && targetRoot.endsWith(".app");
const engineRoot = isMac
  ? path.join(targetRoot, "Contents", "Resources", "frontend", "dist", "engine")
  : path.join(targetRoot, "resources", "frontend", "dist", "engine");
const destination = path.join(engineRoot, platform);
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });
if (!fs.existsSync(path.join(engineRoot, "model"))) {
  fs.cpSync(path.join(root, "engine", "model"), path.join(engineRoot, "model"), { recursive: true });
}
if (platform !== "windows") {
  const binary = path.join(destination, "katago");
  if (!fs.existsSync(binary)) {
    console.error(`missing ${binary}`);
    process.exit(1);
  }
  fs.chmodSync(binary, 0o755);
}
console.log(`${platform} engine → ${destination}`);
