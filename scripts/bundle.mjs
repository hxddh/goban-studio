/**
 * Bundle the ES modules under src/web/js into one classic script.
 *
 * The app runs under zero:// in a WebView. That scheme loads one classic
 * script reliably; it cannot resolve bare npm imports. esbuild resolves
 * @sabaki/go-board and Preact at build time, and the output is a single
 * IIFE that index.html loads with a plain <script>.
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "src/web/js/main.jsx");
const out = path.join(root, "src/web/js/bundle.js");

await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["safari15", "chrome110"],
  minify: false,
  sourcemap: false,
  legalComments: "none",
  jsx: "automatic",
  jsxImportSource: "preact",
  loader: { ".json": "json" },
  logLevel: "warning",
});

const bytes = fs.statSync(out).size;
console.log(`bundle.js: ${(bytes / 1024).toFixed(1)} KB`);
