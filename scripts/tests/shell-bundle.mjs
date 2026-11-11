/**
 * Shell: the app's script is minified (names kept for stack traces), holds
 * the strings of one language, and a normal launch evaluates neither the packaged self-test nor the
 * screenshot tour: they load only when the host's self-test configuration
 * asks for them.
 */
import { test, MESSAGES, assert, fs, path, root, execFileSync } from "./helpers.mjs";

await test("shell bundle: the built script is minified and well under its old size", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/bundle.mjs")], { cwd: root, stdio: "pipe" });
  const file = path.join(root, "src/web/js/bundle.js");
  const text = fs.readFileSync(file, "utf8");
  const kb = fs.statSync(file).size / 1024;
  // 887 KB with four languages of strings in it; about 690 KB with English only. Most of what is left is code and the content index.
  assert.ok(kb < 730, `bundle.js is ${kb.toFixed(0)} KB`);
  const lines = text.split("\n").length;
  assert.ok(lines < 2000, `minified: ${lines} lines`);
  assert.ok(!text.includes("sourceMappingURL"), "no source map in a normal build");
  // keepNames: a stack trace still names the controller's functions.
  assert.ok(text.includes('"maybeComputerMove"'), "function names are kept");
});

await test("shell bundle: the self-test and the tour load only when the host's configuration asks for them", async () => {
  const app = fs.readFileSync(path.join(root, "src/web/js/app/app.jsx"), "utf8");
  const at = app.indexOf("Host.selftestConfig().then((c) => {");
  assert.ok(at > 0, "one look at the configuration");
  const block = app.slice(at, app.indexOf("}, 900);", at));
  assert.match(block, /if \(c\?\.enabled \|\| c\?\.updateProbe\) import\("\.\.\/selftest\.js"\)/);
  assert.match(block, /if \(c\?\.tour\)[^\n]*import\("\.\.\/tour\.js"\)/);
  // Nothing else imports them.
  const uses = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(e.name) && e.name !== "bundle.js" && /["']\.\.?\/(?:\.\.\/)?(selftest|tour)\.js["']/.test(fs.readFileSync(p, "utf8"))) uses.push(path.relative(root, p).split(path.sep).join("/"));
    }
  };
  walk(path.join(root, "src/web/js"));
  assert.deepEqual(uses, ["src/web/js/app/app.jsx"]);
});

await test("shell bundle: the script holds English; each other language is a file with every string of the table", () => {
  // Built by the first check of this file.
  const text = fs.readFileSync(path.join(root, "src/web/js/bundle.js"), "utf8");
  const sync = fs.readFileSync(path.join(root, "scripts/sync-dist.mjs"), "utf8");
  // Strings of the interface (not of the content, whose names stay in the script in four languages).
  const probes = ["settings.pane.engines", "import.chooseFiles", "review.tab.summary", "backup.undoRestore.body", "play.engineFailed"];
  for (const key of probes) assert.ok(MESSAGES[key], key);
  // As the script writes a string: ASCII, everything else as \uXXXX.
  const written = (s) => JSON.stringify(s).slice(1, -1).replace(/[^\x20-\x7e]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
  for (const key of probes) assert.ok(text.includes(written(MESSAGES[key].en)), `English ${key} is in the script`);
  for (const id of ["zh", "ko", "ja"]) {
    const file = path.join(root, "src/web/js/content-lazy", `strings-${id}.json`);
    const table = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.deepEqual(table, Object.fromEntries(Object.entries(MESSAGES).map(([key, v]) => [key, v[id]])), `strings-${id}.json is the table's ${id} column`);
    for (const key of probes) assert.ok(!text.includes(MESSAGES[key][id]) && !text.includes(written(MESSAGES[key][id])), `${id} ${key} is not in the script`);
    assert.ok(sync.includes(`"strings-${id}.json"`), `sync-dist copies strings-${id}.json beside the content`);
  }
});
