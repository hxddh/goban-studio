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
/** v9: the content the app fetches after start-up (sync-dist copies it to content/). */
const LAZY_DIR = path.join(root, "src/web/js/content-lazy");

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

/**
 * v9: the course, problems and classics are split (src/web/js/content-split.js,
 * loaded by content.js): the bundle's content modules hold only the start-up index,
 * and each part's bodies go to LAZY_DIR/<part>.json, fetched on idle or on
 * first use. Tests import the modules whole.
 */
const Split = await import("../src/web/js/content-split.js");
const Problems = await import("../src/web/js/content/problems.js");
const split = Split.splitContent({
  course: (await import("../src/web/js/content/course.js")).COURSE,
  problems: Problems.PROBLEMS,
  themes: Problems.THEMES,
  shapes: Problems.SHAPES,
  grades: JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8")),
  classics: (await import("../src/web/js/content/classics.js")).CLASSICS,
});
fs.rmSync(LAZY_DIR, { recursive: true, force: true });
fs.mkdirSync(LAZY_DIR, { recursive: true });
const lazyBytes = {};
for (const part of Split.PARTS) {
  const file = path.join(LAZY_DIR, `${part}.json`);
  fs.writeFileSync(file, JSON.stringify(split.bodies[part]));
  lazyBytes[part] = fs.statSync(file).size;
}
const contentIndex = Split.indexPlugin(Split.indexModules(split.index));

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
  plugins: [lazyData, contentIndex],
  logLevel: "warning",
});

const bytes = fs.statSync(out).size;
console.log(`bundle.js: ${(bytes / 1024).toFixed(1)} KB · on idle: ${Split.PARTS.map((p) => `content/${p}.json ${(lazyBytes[p] / 1024).toFixed(1)} KB`).join(" · ")}`);
