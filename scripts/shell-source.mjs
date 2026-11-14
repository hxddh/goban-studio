/**
 * The native shell's own source (v15: src/main.zig split by concern), for
 * the checks that read it: the bridge command table, the handlers, start-up.
 * `shellSource()` is the files concatenated, main.zig first, with Unix line
 * endings, so a check can look for a handler wherever it lives.
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

export function shellSource(dir = root) {
  return SHELL_FILES.map((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n")).join("\n");
}
