/**
 * The native shell's own source, split by concern into modules, for the
 * checks that read it: the bridge command table, the handlers, start-up
 * (`shellSource()`, main.zig first), the update install (`installSource()`)
 * and the KataGo sidecar (`engineSource()`). Each is its files concatenated
 * with Unix line endings, so a check can look for code wherever it lives.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SHELL_FILES = [
  "src/main.zig",
  "src/shell.zig",
  "src/commands.zig",
  "src/events.zig",
  "src/lifecycle.zig",
  "src/bridge_files.zig",
  "src/bridge_window.zig",
  "src/bridge_katago.zig",
  "src/bridge_update.zig",
  "src/bridge_models.zig",
];

/** The in-app update install: install.zig and the modules split from it. */
export const INSTALL_FILES = ["src/install.zig", "src/install_verify.zig", "src/install_package.zig", "src/install_apply.zig"];

/** The KataGo sidecar: engine.zig and the modules split from it. */
export const ENGINE_FILES = ["src/engine.zig", "src/engine_request.zig", "src/engine_worker.zig"];

/** `files` concatenated, the first one first, with Unix line endings. */
export function zigSource(files, dir = root) {
  return files.map((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n")).join("\n");
}

export function shellSource(dir = root) {
  return zigSource(SHELL_FILES, dir);
}

export function installSource(dir = root) {
  return zigSource(INSTALL_FILES, dir);
}

export function engineSource(dir = root) {
  return zigSource(ENGINE_FILES, dir);
}
