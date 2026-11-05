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

/**
 * v8: data the app reads only when it is first needed stays out of the
 * script, so start-up does not parse it. Each import resolves to `null`
 * here; the module fetches the file (copied beside index.html by
 * sync-dist.mjs) on first use. Tests bundle the real data.
 */
const LAZY_DATA = ["content/book.json"];
const lazyData = {
  name: "lazy-data",
  setup(b) {
    // Either path separator (Windows builds).
    const filter = new RegExp(`(${LAZY_DATA.map((f) => f.replace(/\./g, "\\.").replace(/\//g, "[\\\\/]")).join("|")})$`);
    b.onLoad({ filter }, () => ({ contents: "export default null;", loader: "js" }));
  },
};

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
  plugins: [lazyData],
  logLevel: "warning",
});

const bytes = fs.statSync(out).size;
console.log(`bundle.js: ${(bytes / 1024).toFixed(1)} KB`);
