/**
 * Shell: how the modules hang together — no import cycles, lower layers do not import higher ones,
 * every named import exists, the controller is a list of names by area and nothing else, and no
 * module grows past what one screen of responsibilities should hold.
 */
import { test, assert, fs, path, root } from "./helpers.mjs";

const base = path.join(root, "src/web/js");
const rel = (f) => path.relative(base, f).split(path.sep).join("/");

/** Every module of the app: { "app/store.js": source }. */
function modules() {
  const out = {};
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) {
        if (name !== "content-lazy") walk(file);
      } else if (/\.(js|jsx)$/.test(name) && name !== "bundle.js") out[rel(file)] = fs.readFileSync(file, "utf8");
    }
  };
  walk(base);
  return out;
}
const MODULES = modules();
const resolve = (from, spec) => rel(path.resolve(path.dirname(path.join(base, from)), spec));

/** Static imports and re-exports of a module: [{ to, names: ["a"] | null (a namespace, a default or `export *`), star }]. */
function importsOf(file) {
  const out = [];
  for (const m of MODULES[file].matchAll(/^\s*(import|export)\s+([^"';]*?)\s*from\s*["'](\.[^"']+)["']/gm)) {
    const list = /\{([^}]*)\}/.exec(m[2]);
    const names = list ? list[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean) : null;
    out.push({ to: resolve(file, m[3]), names, star: m[1] === "export" && /^\*\s*$/.test(m[2]) });
  }
  for (const m of MODULES[file].matchAll(/^\s*import\s*["'](\.[^"']+)["']/gm)) out.push({ to: resolve(file, m[1]), names: null, star: false });
  return out.filter((i) => i.to in MODULES);
}
const IMPORTS = Object.fromEntries(Object.keys(MODULES).map((f) => [f, importsOf(f)]));

/** Names a module exports (its own, and what it passes on). */
const exportCache = {};
function exportsOf(file) {
  if (exportCache[file]) return exportCache[file];
  const names = (exportCache[file] = new Set());
  const src = MODULES[file];
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(",")) if (part.trim()) names.add(part.trim().split(/\s+as\s+/).pop());
  for (const m of src.matchAll(/^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/gm)) names.add(m[1]);
  for (const i of IMPORTS[file]) if (i.star) for (const n of exportsOf(i.to)) names.add(n);
  return names;
}

await test("shell structure: the import graph has no cycle", () => {
  const state = {};
  const cycles = [];
  const visit = (f, trail) => {
    if (state[f] === "done") return;
    if (state[f] === "open") {
      cycles.push([...trail.slice(trail.indexOf(f)), f].join(" → "));
      return;
    }
    state[f] = "open";
    for (const i of IMPORTS[f]) visit(i.to, [...trail, f]);
    state[f] = "done";
  };
  for (const f of Object.keys(MODULES)) visit(f, []);
  assert.deepEqual(cycles, [], "import cycles (move the shared part down, or report upwards through practice/flow.js)");
});

await test("shell structure: the model, the data layer and the plain modules do not import the interface", () => {
  const layer = (f) => (f.includes("/") ? f.split("/")[0] : "plain");
  const UI = ["app", "play", "practice"];
  // The entry point starts the interface; the screenshot tour drives it (loaded on demand, never at a normal launch).
  const ENTRY = ["main.jsx", "tour.js"];
  const up = [];
  for (const [f, list] of Object.entries(IMPORTS)) {
    if (UI.includes(layer(f)) || ENTRY.includes(f)) continue;
    for (const i of list) if (UI.includes(layer(i.to))) up.push(`${f} → ${i.to}`);
    // The model is pure: its parts, the ladder's tables, nothing else.
    if (layer(f) === "model") for (const i of list) assert.ok(layer(i.to) === "model" || i.to === "opponents.js", `${f} imports ${i.to}`);
    // Content is data and its own strings.
    if (layer(f) === "content") for (const i of list) assert.ok(["content", "messages"].includes(layer(i.to)), `${f} imports ${i.to}`);
  }
  assert.deepEqual(up, [], "a lower layer imports the interface");
});

await test("shell structure: every named import is exported by the module it names", () => {
  const missing = [];
  for (const [f, list] of Object.entries(IMPORTS)) for (const i of list) for (const n of i.names || []) if (!exportsOf(i.to).has(n)) missing.push(`${f}: ${n} from ${i.to}`);
  assert.deepEqual(missing, []);
});

await test("shell structure: the controller only lists names, by area, and lists every name a view reaches through it", () => {
  const ctl = MODULES["app/controller.js"];
  assert.doesNotMatch(ctl, /export\s+\*/, "no export *: the surface is written out");
  const code = ctl.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => l.trim() && !l.startsWith("//"));
  for (const line of code) assert.match(line, /^export \{ [^}]+ \} from "[^"]+";$/, "the controller defines nothing");
  const names = [...exportsOf("app/controller.js")];
  assert.equal(new Set(names).size, code.reduce((n, l) => n + l.slice(l.indexOf("{") + 1, l.indexOf("}")).split(",").length, 0), "no name is listed twice");
  // Every C.name in the interface exists (a missing one would be undefined at run time, not an error at build time).
  const have = new Set(names);
  const missing = new Set();
  for (const [f, src] of Object.entries(MODULES)) {
    if (!/import \* as C from "[^"]*controller\.js"/.test(src)) continue;
    for (const m of src.matchAll(/(?<![\w$.])C\.([A-Za-z_$][\w$]*)/g)) if (!have.has(m[1])) missing.add(`${f}: C.${m[1]}`);
  }
  assert.deepEqual([...missing], []);
  // And nothing is listed that neither a view nor a test reaches.
  const sources = [Object.values(MODULES).join("\n")];
  for (const dir of ["scripts/tests", "scripts/ui-tests"]) for (const n of fs.readdirSync(path.join(root, dir))) sources.push(fs.readFileSync(path.join(root, dir, n), "utf8"));
  sources.push(fs.readFileSync(path.join(root, "scripts/ui-test.mjs"), "utf8"));
  const text = sources.join("\n");
  const unused = names.filter((n) => !new RegExp(`\\.${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(text));
  assert.deepEqual(unused, [], "names the controller lists that nothing reaches as X.name");
});

await test("shell structure: a test file that builds today's practice path pins the date", () => {
  // Without a date of its own, a path is drawn from today: such a file must pin it (helpers.mjs pinDate).
  const today = /\b(?:pathNow|practicePath|todaysSession)\(\)|\b(?:startPath|continuePath)\(/;
  const unpinned = [];
  for (const n of fs.readdirSync(path.join(root, "scripts/tests"))) {
    if (!n.endsWith(".mjs") || n === "helpers.mjs") continue;
    const src = fs.readFileSync(path.join(root, "scripts/tests", n), "utf8");
    if (today.test(src) && !/^pinDate\(\);$/m.test(src)) unpinned.push(n);
  }
  assert.deepEqual(unpinned, []);
});

await test("shell structure: no module is longer than 600 lines, but for content, the rules and solver, and five that may not grow", () => {
  // What is over the line today, with the reason; each may shrink, none may grow.
  const CEILING = {
    "rules.js": Infinity, // the rules of Go, the game tree and its markup: one model
    "solver.js": Infinity, // the problem solver: one search
    "app/review.jsx": 950, // the review's panel in its three tabs
    "sgf.js": 850, // the SGF reader and writer
    "board.js": 810, // the board's canvas renderer
    "app/practice-ctl.js": 790, // lessons, problems and drills on one board state
    "data/store.js": 700, // the store and its safe state
  };
  const over = [];
  for (const [f, src] of Object.entries(MODULES)) {
    if (/^(content|messages)\//.test(f)) continue;
    const lines = src.trimEnd().split("\n").length;
    if (lines > (CEILING[f] ?? 600)) over.push(`${f}: ${lines} lines`);
  }
  assert.deepEqual(over, []);
  for (const f of Object.keys(CEILING)) assert.ok(f in MODULES && MODULES[f].trimEnd().split("\n").length > 600, `${f} is no longer over 600 lines: take it off the list`);
});

await test("shell structure: comments say what the code does, not which version brought it", () => {
  // A comment may name a release tag as an example of its format (update.js,
  // host.js) or a document by its file name (docs/v9.md); stored formats are
  // named by their number ("format 9"), not as versions.
  const ALLOWED = [/docs\/v\d+\.md/g, /docs\/review-v\d+-\w+\.md/g, /"v\d+\.\d+\.\d+"/g];
  const found = [];
  for (const [f, src] of Object.entries(MODULES)) {
    for (const c of src.match(/\/\*[\s\S]*?\*\/|(?<![:"'`\\])\/\/.*$/gm) || []) {
      const m = ALLOWED.reduce((s, re) => s.replace(re, ""), c).match(/\bv\d+(\.\d+)*\b/);
      if (m) found.push(`${f}: ${m[0]} in ${c.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(found, []);
});
