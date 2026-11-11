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
/** The content the app fetches after start-up (sync-dist copies it to content/). */
const LAZY_DIR = path.join(root, "src/web/js/content-lazy");

/**
 * Data the app reads only when it is first needed stays out of the
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
 * The course, problems and classics are split (src/web/js/content-split.js,
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

/**
 * The interface's strings: the script holds English (the fallback, and
 * what shows if a table cannot be read); every other language goes to
 * LAZY_DIR/strings-<id>.json, read before that language is first shown
 * (src/web/js/i18n.js loadLang). Start-up parses one language instead of
 * four. Tests and tools import the tables whole.
 */
const { MESSAGES } = await import("../src/web/js/messages.js");
const { LANG_IDS, FALLBACK_LANG } = await import("../src/web/js/i18n.js");
const LAZY_LANGS = LANG_IDS.filter((id) => id !== FALLBACK_LANG);
const stringBytes = {};
for (const id of LAZY_LANGS) {
  const file = path.join(LAZY_DIR, `strings-${id}.json`);
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(MESSAGES).map(([key, v]) => [key, v[id]]))));
  stringBytes[id] = fs.statSync(file).size;
}
const lazyStrings = {
  name: "lazy-strings",
  setup(b) {
    // The merge module only: content modules still read their own four-language names (messages/content.js).
    b.onLoad({ filter: /[\\/]src[\\/]web[\\/]js[\\/]messages\.js$/ }, () => ({
      contents: `export const LAZY_LANGS = ${JSON.stringify(LAZY_LANGS)};\nexport const MESSAGES = ${JSON.stringify(Object.fromEntries(Object.entries(MESSAGES).map(([key, v]) => [key, { [FALLBACK_LANG]: v[FALLBACK_LANG] }])))};\n`,
      loader: "js",
    }));
  },
};

await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["safari15", "chrome110"],
  // Minified (about half the bytes to read and parse at start-up).
  // Names are kept, so a stack trace in a bug report still names the
  // function; GOBAN_SOURCEMAP=1 inlines a source map for local debugging
  // (never in a release: it would double the file).
  minify: true,
  keepNames: true,
  sourcemap: process.env.GOBAN_SOURCEMAP === "1" ? "inline" : false,
  legalComments: "none",
  jsx: "automatic",
  jsxImportSource: "preact",
  loader: { ".json": "json" },
  plugins: [lazyData, contentIndex, lazyStrings],
  logLevel: "warning",
});

const bytes = fs.statSync(out).size;
console.log(`bundle.js: ${(bytes / 1024).toFixed(1)} KB · on idle: ${Split.PARTS.map((p) => `content/${p}.json ${(lazyBytes[p] / 1024).toFixed(1)} KB`).join(" · ")} · by language: ${LAZY_LANGS.map((id) => `content/strings-${id}.json ${(stringBytes[id] / 1024).toFixed(1)} KB`).join(" · ")}`);
