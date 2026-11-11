/**
 * Shell: the app's script is minified (names kept for stack traces),
 * and a normal launch evaluates neither the packaged self-test nor the
 * screenshot tour: they load only when the host's self-test configuration
 * asks for them.
 */
import { test, assert, fs, path, root, execFileSync } from "./helpers.mjs";

await test("shell bundle: the built script is minified and well under its old size", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/bundle.mjs")], { cwd: root, stdio: "pipe" });
  const file = path.join(root, "src/web/js/bundle.js");
  const text = fs.readFileSync(file, "utf8");
  const kb = fs.statSync(file).size / 1024;
  // Shipped 1.06–1.15 MB unminified; most of what is left is the string table and content index.
  assert.ok(kb < 900, `bundle.js is ${kb.toFixed(0)} KB`);
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
