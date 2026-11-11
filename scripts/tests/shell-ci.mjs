/**
 * Shell: CI and release workflows — what the pipeline promises (docs/QA.md,
 * docs/signing.md, SECURITY.md), read from the workflow files as data.
 *
 * The workflows are parsed with a small YAML reader below (the repository
 * has no YAML dependency); it reads only the subset these files use and
 * throws on anything else.
 */
import { test, assert, fs, path, root } from "./helpers.mjs";

/* ------------------------------------------------------- YAML subset */
const isBlank = (l) => /^\s*(#.*)?$/.test(l);
const indentOf = (l) => l.match(/^ */)[0].length;

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

function scalar(raw) {
  const s = stripComment(raw).trim();
  if (s.startsWith('"')) return JSON.parse(s);
  if (s.startsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new Error(`yaml-lite: unsupported flow value ${s}`);
    const body = s.slice(1, -1).trim();
    return body ? body.split(",").map((x) => scalar(x)) : [];
  }
  if (s.startsWith("{") || s.startsWith("&") || s.startsWith("*") || s.startsWith("!")) throw new Error(`yaml-lite: unsupported value ${s}`);
  return s;
}

function parseYaml(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  const skip = () => {
    while (i < lines.length && isBlank(lines[i])) i++;
  };

  function blockScalar(parentIndent, style) {
    const out = [];
    let base = -1;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*$/.test(l)) {
        out.push("");
        i++;
        continue;
      }
      const ind = indentOf(l);
      if (ind <= parentIndent) break;
      if (base < 0) base = ind;
      out.push(l.slice(Math.min(base, ind)));
      i++;
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return style.startsWith(">") ? out.join(" ").replace(/\s+/g, " ").trim() : out.join("\n") + "\n";
  }

  function value(rest, keyIndent) {
    const r = stripComment(rest).trim();
    if (r === "") {
      skip();
      if (i >= lines.length) return null;
      const ind = indentOf(lines[i]);
      const isSeq = /^\s*- /.test(lines[i]) || /^\s*-$/.test(lines[i]);
      if (ind > keyIndent || (isSeq && ind === keyIndent)) return block(ind);
      return null;
    }
    if (r === "|" || r === ">" || /^[|>][-+]?$/.test(r)) return blockScalar(keyIndent, r);
    return scalar(rest);
  }

  function mapping(indent) {
    const obj = {};
    for (;;) {
      skip();
      if (i >= lines.length) break;
      const l = lines[i];
      const ind = indentOf(l);
      if (ind !== indent || /^\s*- /.test(l)) break;
      const m = /^\s*([^\s#"'][^:]*?|"[^"]*"):(?:\s+(.*))?$/.exec(l);
      if (!m) throw new Error(`yaml-lite: cannot read line ${i + 1}: ${l}`);
      const key = m[1].startsWith('"') ? JSON.parse(m[1]) : m[1];
      i++;
      if (Object.hasOwn(obj, key)) throw new Error(`yaml-lite: duplicate key ${key} at line ${i}`);
      obj[key] = value(m[2] || "", indent);
    }
    return obj;
  }

  function sequence(indent) {
    const arr = [];
    for (;;) {
      skip();
      if (i >= lines.length) break;
      const l = lines[i];
      if (indentOf(l) !== indent || !/^\s*-( |$)/.test(l)) break;
      const rest = l.slice(indent + 1).replace(/^ /, "");
      if (stripComment(rest).trim() === "") {
        i++;
        arr.push(value("", indent));
      } else if (/^[^\s#"'[{][^:]*?:(\s|$)/.test(rest) || /^"[^"]*":(\s|$)/.test(rest)) {
        // "- key: value": a mapping whose first key sits after the dash.
        lines[i] = " ".repeat(indent + 2) + rest;
        arr.push(mapping(indent + 2));
      } else {
        i++;
        arr.push(scalar(rest));
      }
    }
    return arr;
  }

  function block(indent) {
    skip();
    return /^\s*-( |$)/.test(lines[i]) ? sequence(indent) : mapping(indent);
  }

  skip();
  const doc = block(0);
  skip();
  if (i < lines.length) throw new Error(`yaml-lite: unread content at line ${i + 1}: ${lines[i]}`);
  return doc;
}

/* ---------------------------------------------------------- helpers */

const WF = path.join(root, ".github/workflows");
const files = fs.readdirSync(WF).filter((n) => n.endsWith(".yml")).sort();
const raw = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(WF, f), "utf8").replace(/\r\n/g, "\n")]));
const wf = Object.fromEntries(files.map((f) => [f, parseYaml(raw[f])]));
const steps = (job) => job.steps || [];
const runs = (job) => steps(job).map((s) => s.run || "").join("\n");
const allSteps = (w) => Object.values(w.jobs).flatMap(steps);

/* ------------------------------------------------------------ checks */

await test("ci: the YAML reader reads what it should and refuses what it cannot", () => {
  const doc = parseYaml('a: 1\nb:\n  - x\n  - k: v # note\n    run: |\n      echo "#1"\n      ls\nc: [p, "q r"]\nd: >\n  one\n  two\n');
  assert.deepEqual(doc, { a: "1", b: ["x", { k: "v", run: 'echo "#1"\nls\n' }], c: ["p", "q r"], d: "one two" });
  assert.throws(() => parseYaml("a: {x: 1}\n"), /unsupported/);
  assert.throws(() => parseYaml("a: 1\na: 2\n"), /duplicate/);
});

await test("ci: every action is pinned by commit SHA with its version beside it", () => {
  let n = 0;
  for (const f of files) {
    for (const [name, job] of Object.entries(wf[f].jobs)) {
      if (job.uses) {
        assert.match(job.uses, /^\.\/\.github\/workflows\/[\w-]+\.yml$/, `${f} ${name}: only local reusable workflows`);
        continue;
      }
      for (const s of steps(job)) {
        if (!s.uses) continue;
        n++;
        assert.match(s.uses, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${f} ${name}: ${s.uses} is pinned by SHA`);
      }
    }
    // The version comment rides on the same line, for people and Dependabot.
    for (const line of raw[f].split("\n").filter((l) => /^\s*(- )?uses: [^.]/.test(l))) assert.match(line, /@[0-9a-f]{40} # v\d+(\.\d+)*$/, `${f}: ${line.trim()}`);
  }
  assert.ok(n > 30, `${n} pinned actions`);
  const dep = parseYaml(fs.readFileSync(path.join(root, ".github/dependabot.yml"), "utf8"));
  assert.deepEqual(dep.updates.map((u) => [u["package-ecosystem"], u.schedule.interval]).sort(), [["github-actions", "weekly"], ["npm", "weekly"]]);
});

await test("ci: tokens are read-only unless a job writes a release or commits results", () => {
  const writers = {
    "release.yml": ["macos", "macos-intel", "windows", "publish"],
    "build-macos.yml": ["upload"],
    "build-windows.yml": ["upload"],
    "book.yml": ["merge"],
    "calibrate.yml": ["collect"],
    "classics-check.yml": ["report"],
    "lesson-check.yml": ["report"],
    "checks.yml": [],
  };
  assert.deepEqual(Object.keys(writers).sort(), files, "every workflow is listed");
  for (const f of files) {
    assert.deepEqual(wf[f].permissions, { contents: "read" }, `${f}: read-only by default`);
    const write = Object.entries(wf[f].jobs).filter(([, j]) => Object.values(j.permissions || {}).includes("write")).map(([n]) => n);
    assert.deepEqual(write.sort(), [...writers[f]].sort(), `${f}: jobs with write access`);
    for (const n of write) assert.deepEqual(wf[f].jobs[n].permissions, { contents: "write" }, `${f} ${n}: contents only`);
  }
  // The platform builds themselves run read-only even when a release calls them.
  for (const f of ["build-macos.yml", "build-windows.yml"]) {
    assert.deepEqual(wf[f].jobs.build.permissions, { contents: "read" }, f);
    const up = wf[f].jobs.upload;
    assert.equal(up.if, "${{ inputs.release_tag != '' }}", `${f}: uploads only when asked`);
    assert.ok(!JSON.stringify(up).includes("secrets."), `${f}: the upload job holds no secret`);
  }
});

await test("ci: signing secrets reach only the steps that sign", () => {
  for (const f of files) {
    for (const [name, job] of Object.entries(wf[f].jobs)) {
      assert.ok(!JSON.stringify(job.env || {}).includes("secrets."), `${f} ${name}: no secret in job env`);
      for (const s of steps(job)) assert.ok(!(s.run || "").includes("secrets."), `${f} ${name}: secrets go through env, not into scripts`);
    }
    assert.ok(!JSON.stringify(wf[f].env || {}).includes("secrets."), `${f}: no secret in workflow env`);
  }
  const holders = (f) => allSteps(wf[f]).filter((s) => JSON.stringify(s.env || {}).includes("secrets.")).map((s) => s.name);
  assert.deepEqual(holders("build-macos.yml"), ["signing mode", "import Developer ID certificate", "notarize and staple the app", "notarize and staple the dmg"]);
  assert.deepEqual(holders("build-windows.yml"), ["signing mode", "Authenticode-sign goban-studio.exe and katago.exe"]);
  assert.deepEqual(holders("release.yml"), ["branch, version, notes, and the tag is not already published", "sign SHA256SUMS"]);
  // The preflight sees only whether the update key exists.
  const pre = wf["release.yml"].jobs.preflight.steps.find((s) => s.env?.HAS_UPDATE_SIGNING_KEY);
  assert.equal(pre.env.HAS_UPDATE_SIGNING_KEY, "${{ secrets.UPDATE_SIGNING_KEY != '' }}");
});

await test("ci: pull requests compile and test the Zig shell on Linux", () => {
  const checks = wf["checks.yml"];
  assert.ok(checks.on.pull_request !== undefined && checks.on.push.branches.includes("main"));
  const job = checks.jobs.native;
  const zig = steps(job).find((s) => s.uses?.startsWith("mlugg/setup-zig@"));
  assert.equal(zig.with.version, "0.16.0");
  assert.equal(job.env.SDK_VERSION, "0.11.0");
  const sh = runs(job);
  assert.match(sh, /npm install -g --ignore-scripts "@native-sdk\/cli@\$\{SDK_VERSION\}"/);
  assert.match(sh, /node scripts\/patch-sdk\.mjs "\$SDK_PATH"/);
  assert.match(sh, /^zig build test -Dnative-sdk-path="\$SDK_PATH" -Dplatform=null --summary all$/m);
  assert.match(sh, /^zig build -Dnative-sdk-path="\$SDK_PATH" -Dplatform=null/m);
  assert.deepEqual(checks.jobs.web.strategy.matrix.node, ["24", "26"]);
});

await test("ci: pull requests run the static checks before the tests, with exact-pinned tools and no warnings allowed", () => {
  const sh = runs(wf["checks.yml"].jobs.web).split("\n");
  const at = (line) => sh.indexOf(line);
  assert.ok(at("npm run lint") > at("npm ci --ignore-scripts") && at("npm run lint") < at("npm test"), `lint runs after the install and before the tests: ${sh.join(" | ")}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.lint, "eslint . --max-warnings 0");
  assert.match(pkg.scripts.verify, /^npm run lint && npm test/, "npm run verify lints first");
  for (const dep of ["eslint", "eslint-plugin-react-hooks", "globals"]) assert.match(pkg.devDependencies[dep], /^\d+\.\d+\.\d+$/, `${dep} is pinned to one version`);
  // The config checks what it says (a rule dropped by mistake would pass everything).
  const config = fs.readFileSync(path.join(root, "eslint.config.js"), "utf8");
  for (const rule of ["no-undef", "no-unused-vars", "no-redeclare", "no-dupe-keys", "no-unreachable", "no-const-assign", "no-import-assign", "no-self-assign", "eqeqeq", "react-hooks/rules-of-hooks"]) assert.ok(config.includes(`"${rule}"`) || config.includes(`${rule}:`), rule);
  assert.match(config, /reportUnusedDisableDirectives: "error"/);
});

await test("ci: one pinned Native SDK install, ReleaseSafe builds, the update key passed in", () => {
  for (const f of ["build-macos.yml", "build-windows.yml"]) {
    const sh = runs(wf[f].jobs.build);
    assert.doesNotMatch(raw[f], /npx --yes|ReleaseFast/, f);
    assert.match(sh, /npm install -g "@native-sdk\/cli@\$\{SDK_VERSION\}"/, f);
    assert.equal((sh.match(/npm install -g/g) || []).length, 1, `${f}: installed once`);
    const build = steps(wf[f].jobs.build).find((s) => s.name === "native release build");
    assert.match(build.run, /native build --yes/);
    assert.match(build.run, /-Doptimize=ReleaseSafe -Dupdate-pubkey="\$UPDATE_PUBKEY"/, f);
    assert.equal(build.env.UPDATE_PUBKEY, "${{ vars.UPDATE_PUBKEY }}", f);
    const t = steps(wf[f].jobs.build).find((s) => s.name === "native validate and tests");
    assert.match(t.run, /^native validate$/m);
    assert.match(t.run, /-Dupdate-pubkey="\$UPDATE_PUBKEY"/, f);
  }
});

await test("ci: npm installs use the lockfile without install scripts, and engines are enforced", () => {
  for (const f of files) {
    for (const m of allSteps(wf[f]).map((s) => s.run || "").join("\n").matchAll(/\bnpm (ci|install)\b[^\n]*/g)) {
      const line = m[0];
      if (line.startsWith("npm install -g")) continue; // the pinned Native SDK CLI
      assert.match(line, /^npm ci( --omit=dev)? --ignore-scripts$/, `${f}: ${line}`);
    }
    if (/\bnpm ci\b/.test(raw[f])) assert.equal(wf[f].env?.NPM_CONFIG_ENGINE_STRICT, "true", `${f}: engine-strict`);
    for (const s of allSteps(wf[f]).filter((x) => x.uses?.startsWith("actions/setup-node@"))) {
      assert.ok(s.with["node-version-file"] === ".nvmrc" || s.with["node-version"] === "${{ matrix.node }}", `${f}: Node from .nvmrc or the 24/26 matrix`);
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.engines.node, ">=" + fs.readFileSync(path.join(root, ".nvmrc"), "utf8").trim());
});

await test("ci: the release is cut from main, at the built commit, for package.json's version", () => {
  const rel = wf["release.yml"];
  const pre = runs(rel.jobs.preflight);
  assert.match(pre, /"\$REHEARSE" != "true" \] && \[ "\$GITHUB_REF" != "refs\/heads\/main" \]/);
  assert.match(pre, /version="\$\(node -p 'require\("\.\/package\.json"\)\.version'\)"/);
  assert.match(pre, /if \[ "\$TAG" != "v\$\{version\}" \]/);
  const publish = steps(rel.jobs.publish).find((s) => s.name === "publish");
  assert.equal(publish.if, "${{ inputs.rehearse != true }}", "rehearse publishes nothing");
  assert.match(publish.run, /gh release create "\$TAG" \\\n\s+--target "\$GITHUB_SHA"/);
  assert.match(publish.run, /exists at \$\{commit\}, not at the built commit/);
  // Every build job is gated on the preflight.
  for (const n of ["macos", "macos-intel", "windows"]) assert.equal(rel.jobs[n].needs, "preflight");
});

await test("ci: SHA256SUMS is signed when the key exists, and enforced builds cannot ship without it", () => {
  const rel = wf["release.yml"];
  const names = steps(rel.jobs.publish).map((s) => s.name).filter(Boolean);
  assert.ok(names.indexOf("checksums") < names.indexOf("sign SHA256SUMS") && names.indexOf("sign SHA256SUMS") < names.indexOf("publish"));
  const sign = steps(rel.jobs.publish).find((s) => s.name === "sign SHA256SUMS");
  assert.equal(sign.env.UPDATE_SIGNING_KEY, "${{ secrets.UPDATE_SIGNING_KEY }}");
  assert.match(sign.run, /^\s*node scripts\/sign-sums\.mjs$/m);
  assert.match(sign.run, /if \[ -n "\$UPDATE_PUBKEY" \]; then[\s\S]*?exit 1/);
  assert.match(steps(rel.jobs.publish).find((s) => s.name === "publish").run, /if \[ -f SHA256SUMS\.sig \]; then assets\+=\(SHA256SUMS\.sig\); fi/);
  assert.match(runs(rel.jobs.preflight), /if \[ -n "\$UPDATE_PUBKEY" \] && \[ "\$HAS_UPDATE_SIGNING_KEY" != "true" \]/);
});

await test("ci: downloaded and built third-party code is pinned", () => {
  const win = wf["build-windows.yml"];
  assert.equal(win.env.KATAGO_URL, "https://github.com/lightvector/KataGo/releases/download/v1.18.1/katago-v1.18.1-eigen-windows-x64.zip");
  assert.equal(win.env.KATAGO_SHA256, "074485cf150c38aa3bb14ac9f54f2952ffefbceb44673709bbb8a83650bf95d6");
  const dl = steps(win.jobs.build).find((s) => s.name === "download KataGo Eigen sidecar").run;
  assert.ok(dl.indexOf("sha256sum -c") > 0 && dl.indexOf("sha256sum -c") < dl.indexOf("Expand-Archive"), "checked before it is unpacked");
  const mac = wf["build-macos.yml"];
  assert.equal(mac.env.KATAGO_COMMIT, "92ee95c0a4b25fec214da00951ab69e97e207729");
  const kg = steps(mac.jobs.build).find((s) => s.name === "build KataGo Eigen sidecar").run;
  assert.match(kg, /fetch -q --depth 1 https:\/\/github\.com\/lightvector\/KataGo\.git "\$KATAGO_COMMIT"/);
  assert.match(kg, /test "\$\(git -C "\$RUNNER_TEMP\/KataGo" rev-parse HEAD\)" = "\$KATAGO_COMMIT"/);
  assert.doesNotMatch(kg, /--branch/);
  // Every other KataGo download is checked against its hash.
  for (const f of ["book.yml", "calibrate.yml", "classics-check.yml", "lesson-check.yml"]) {
    assert.match(wf[f].env.KATAGO_SHA256, /^[0-9a-f]{64}$/, f);
    assert.match(raw[f], /echo "\$KATAGO_SHA256  katago\.zip" \| sha256sum -c -/, f);
  }
});

await test("ci: bot commits carry no stale session trailer", () => {
  for (const f of files) assert.doesNotMatch(raw[f], /Claude-Session:/, f);
});
