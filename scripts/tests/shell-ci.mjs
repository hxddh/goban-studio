/**
 * Shell: CI and release workflows — what the pipeline promises (docs/QA.md,
 * docs/signing.md, SECURITY.md), read from the workflow files as data.
 *
 * The workflows are parsed with a small YAML reader below (the repository
 * has no YAML dependency); it reads only the subset these files use and
 * throws on anything else.
 */
import crypto from "node:crypto";
import os from "node:os";
import { test, assert, fs, path, root } from "./helpers.mjs";
import * as Sdk from "../native-sdk.mjs";

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
    "release.yml": ["publish"],
    "build-macos.yml": [],
    "build-windows.yml": [],
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
    // No job asks for any permission but the repository's contents.
    for (const [n, j] of Object.entries(wf[f].jobs)) assert.deepEqual(Object.keys(j.permissions || { contents: "read" }), ["contents"], `${f} ${n}`);
  }
  // The platform builds run read-only, also when a release calls them.
  for (const f of ["build-macos.yml", "build-windows.yml"]) {
    assert.deepEqual(Object.keys(wf[f].jobs), ["build"], `${f}: one job, the build`);
    assert.deepEqual(wf[f].jobs.build.permissions, { contents: "read" }, f);
  }
  for (const n of ["macos", "macos-intel", "windows"]) assert.deepEqual(wf["release.yml"].jobs[n].permissions, { contents: "read" }, `release.yml ${n}`);
});

await test("ci: a published release's files cannot be replaced: one job uploads, once, into a draft", () => {
  // The side door is gone: no workflow takes a release tag to upload to.
  for (const f of ["build-macos.yml", "build-windows.yml"]) {
    assert.doesNotMatch(raw[f], /release_tag/, f);
    assert.doesNotMatch(raw[f], /\bgh release/, f);
  }
  const uploads = [];
  for (const f of files) {
    assert.doesNotMatch(raw[f], /--clobber/, `${f}: nothing overwrites a release file`);
    for (const [name, job] of Object.entries(wf[f].jobs)) {
      for (const s of steps(job)) if (/\bgh release (upload|create|edit|delete)/.test(s.run || "")) uploads.push(`${f} ${name} ${s.name}`);
    }
  }
  assert.deepEqual(uploads, ["release.yml publish publish"]);
  const publish = steps(wf["release.yml"].jobs.publish).find((s) => s.name === "publish").run;
  const order = ["gh release create", "--draft", 'gh release upload "$TAG" "${assets[@]}"', 'gh release edit "$TAG" --draft=false'].map((x) => publish.indexOf(x));
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), "created as a draft, filled, then published");
  // What is published is what was checksummed (and signed).
  const names = steps(wf["release.yml"].jobs.publish).map((s) => s.name).filter(Boolean);
  assert.ok(names.indexOf("the packages are the ones that were checksummed") < names.indexOf("publish"));
  assert.match(runs(wf["release.yml"].jobs.publish), /sha256sum -c \.\.\/SHA256SUMS/);
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
  assert.deepEqual(holders("build-windows.yml"), ["signing mode", "Authenticode-sign goban-studio.exe and the KataGo builds"]);
  assert.deepEqual(holders("release.yml"), ["sign SHA256SUMS"]);
});

await test("ci: the update key lives in a protected environment and never reaches a rehearsal", () => {
  const rel = wf["release.yml"];
  // One job in the whole repository names an environment, and it is this one.
  const withEnv = files.flatMap((f) => Object.entries(wf[f].jobs).filter(([, j]) => j.environment !== undefined).map(([n, j]) => `${f} ${n} ${j.environment}`));
  assert.deepEqual(withEnv, ["release.yml sign release-signing"]);
  const sign = rel.jobs.sign;
  assert.match(sign.if, /inputs\.rehearse != true/, "never in a rehearsal");
  assert.match(sign.if, /needs\.assemble\.result == 'success'/);
  assert.deepEqual(sign.permissions, { contents: "read" });
  // The key is used by the signing job's one step, and by nothing else.
  for (const [name, job] of Object.entries(rel.jobs)) {
    const uses = JSON.stringify(job).includes("UPDATE_SIGNING_KEY");
    assert.equal(uses, name === "sign", `${name}: ${uses ? "reads" : "does not read"} the update key`);
  }
  // It runs none of the repository's code but the signing script.
  const checkout = steps(sign).find((s) => s.uses?.startsWith("actions/checkout@"));
  assert.match(checkout.with["sparse-checkout"], /^scripts\/sign-sums\.mjs\n\.nvmrc\n$/);
  assert.doesNotMatch(runs(sign), /\bnpm\b/);
  // It signs the bytes the assemble job made, for the tag of this run.
  const got = steps(sign).map((s) => s.name || s.uses.split("@")[0]);
  assert.ok(got.indexOf("actions/download-artifact") < got.indexOf("the sums are for this tag") && got.indexOf("the sums are for this tag") < got.indexOf("sign SHA256SUMS"));
  // Nothing is published without it, and never in a rehearsal.
  const publish = rel.jobs.publish;
  assert.deepEqual(publish.needs, ["preflight", "assemble", "sign"]);
  assert.match(publish.if, /inputs\.rehearse != true/);
  assert.match(publish.if, /needs\.sign\.result == 'success'/);
  // The jobs before it hold no secret at all.
  for (const n of ["preflight", "assemble"]) assert.ok(!JSON.stringify(rel.jobs[n]).includes("secrets."), n);
  const doc = fs.readFileSync(path.join(root, "docs/signing.md"), "utf8");
  assert.match(doc, /environment secret\*\* of the environment `release-signing`/);
  assert.match(doc, /Delete the repository-level secret `UPDATE_SIGNING_KEY`/);
});

await test("ci: pull requests compile and test the Zig shell on Linux", () => {
  const checks = wf["checks.yml"];
  assert.ok(checks.on.pull_request !== undefined && checks.on.push.branches.includes("main"));
  const job = checks.jobs.native;
  const zig = steps(job).find((s) => s.uses?.startsWith("mlugg/setup-zig@"));
  assert.equal(zig.with.version, "0.16.0");
  const sh = runs(job);
  assert.match(sh, /^npm ci --ignore-scripts$/m);
  assert.match(sh, /echo "SDK_PATH=\$\(node scripts\/native-sdk\.mjs path\)" >> "\$GITHUB_ENV"/);
  assert.match(sh, /node scripts\/patch-sdk\.mjs "\$SDK_PATH"/);
  assert.match(sh, /^zig build test -Dnative-sdk-path="\$SDK_PATH" -Dplatform=null --summary all$/m);
  assert.match(sh, /^zig build -Dnative-sdk-path="\$SDK_PATH" -Dplatform=null/m);
  assert.deepEqual(checks.jobs.web.strategy.matrix.node, ["24", "26"]);
});

await test("ci: pull requests that touch the shell compile and test it on macOS and Windows too", () => {
  const checks = wf["checks.yml"];
  const hosts = checks.jobs["native-hosts"];
  assert.deepEqual(hosts.strategy.matrix.include, [{ os: "macos-15", platform: "macos" }, { os: "windows-latest", platform: "windows" }]);
  assert.equal(hosts["runs-on"], "${{ matrix.os }}");
  assert.equal(hosts.needs, "changes");
  assert.equal(hosts.if, "${{ needs.changes.outputs.native == 'true' }}");
  assert.deepEqual(hosts.permissions, { contents: "read" });
  const sh = runs(hosts);
  assert.match(sh, /^native test --yes -Dnative-sdk-path="\$SDK_PATH" -Dplatform="\$PLATFORM"$/m);
  assert.match(sh, /^native build --yes -Dnative-sdk-path="\$SDK_PATH" -Dplatform="\$PLATFORM" -Doptimize=ReleaseSafe$/m);
  assert.match(sh, /node scripts\/native-sdk\.mjs toolchain/);
  // No engine, no packaging, no signing, no secret.
  assert.doesNotMatch(sh, /katago|native package|codesign|signtool/i);
  assert.ok(!JSON.stringify(hosts).includes("secrets."));
  // Which pull requests: the filter is read from the job and tried on paths.
  const changes = checks.jobs.changes;
  assert.equal(changes.if, "${{ github.event_name == 'pull_request' }}");
  const filter = new RegExp(/grep -E '([^']+)'/.exec(runs(changes))[1]);
  for (const hit of ["src/main.zig", "src/net.zig", "src/macos_open.m", "src/updater/apply-windows.ps1", "build.zig", "build.zig.zon", "app.zon", ".github/workflows/checks.yml", "scripts/native-sdk.mjs", "scripts/patch-sdk.mjs", "package.json", "package-lock.json"]) {
    assert.ok(filter.test(hit), `${hit} triggers the macOS and Windows compile`);
  }
  for (const miss of ["src/web/js/host.js", "src/web/styles.css", "docs/storage.md", "scripts/tests/shell-ci.mjs", "README.md", "packaging/README-macOS.txt", "src/web/package.json"]) {
    assert.ok(!filter.test(miss), `${miss} does not`);
  }
});

await test("ci: the Native SDK comes from the lockfile: one exact version, hashed, never installed globally", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.devDependencies["@native-sdk/cli"], "0.11.1", "one exact version, not a range");
  const { version, packages } = Sdk.checkLock();
  assert.equal(version, "0.11.1");
  // The package and the `native` binary of every platform a release is built on.
  for (const name of ["@native-sdk/cli", "@native-sdk/cli-darwin-arm64", "@native-sdk/cli-darwin-x64", "@native-sdk/cli-win32-x64"]) {
    const p = packages.find((x) => x.name === name);
    assert.ok(p, name);
    assert.match(p.integrity, /^sha512-/);
  }
  // A lockfile that lost a hash, or a range in package.json, is refused.
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "goban-sdk-"));
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ devDependencies: { "@native-sdk/cli": "^0.11.1" } }));
    fs.writeFileSync(path.join(tmp, "package-lock.json"), JSON.stringify(lock));
    assert.throws(() => Sdk.checkLock(tmp), /one exact version/);
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ devDependencies: { "@native-sdk/cli": "0.11.1" } }));
    assert.equal(Sdk.checkLock(tmp).version, "0.11.1");
    delete lock.packages["node_modules/@native-sdk/cli-win32-x64"].integrity;
    fs.writeFileSync(path.join(tmp, "package-lock.json"), JSON.stringify(lock));
    assert.throws(() => Sdk.checkLock(tmp), /no integrity hash for @native-sdk\/cli-win32-x64/);
    lock.packages["node_modules/@native-sdk/cli-win32-x64"].integrity = "sha512-AAAA";
    lock.packages["node_modules/@native-sdk/cli"].version = "0.12.0";
    fs.writeFileSync(path.join(tmp, "package-lock.json"), JSON.stringify(lock));
    assert.throws(() => Sdk.checkLock(tmp), /0\.12\.0, package\.json pins 0\.11\.1/);
    assert.throws(() => Sdk.checkInstalled(tmp), /pins 0\.11\.1/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // The installed copy (when there is one) carries the toolchain manifest
  // whose hash is pinned; its downloads are checked against that manifest.
  const manifest = path.join(Sdk.sdkDir(), Sdk.TOOLCHAIN_MANIFEST);
  if (fs.existsSync(manifest)) {
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(manifest)).digest("hex"), Sdk.TOOLCHAIN_MANIFEST_SHA256);
    assert.equal(Sdk.checkInstalled(), Sdk.sdkDir());
    const listed = JSON.parse(fs.readFileSync(manifest, "utf8"));
    for (const asset of [...Object.values(listed.releases), ...Object.values(listed.packages)]) {
      assert.ok(/^[0-9a-f]{64}$/.test(asset.sha256 || "") || /^sha512-/.test(asset.integrity || ""), `${asset.url} has a hash`);
      assert.match(asset.url, /^https:\/\/(github\.com\/vercel-labs\/scriptc\/releases\/download\/|registry\.npmjs\.org\/)/);
    }
  }
  // No workflow installs it any other way, or takes its version as an input.
  for (const f of files) {
    assert.doesNotMatch(raw[f], /npm install\b/, `${f}: only npm ci`);
    assert.doesNotMatch(raw[f], /sdk_version|SDK_VERSION|npm root -g/, f);
  }
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

await test("ci: the platform builds use that SDK, ReleaseSafe, with the update key passed in", () => {
  for (const f of ["build-macos.yml", "build-windows.yml"]) {
    const sh = runs(wf[f].jobs.build);
    assert.doesNotMatch(raw[f], /npx --yes|ReleaseFast/, f);
    const sdk = steps(wf[f].jobs.build).find((s) => s.name === "Native SDK from the lockfile").run;
    assert.match(sdk, /^node scripts\/native-sdk\.mjs toolchain$/m, f);
    assert.match(sdk, /echo "SDK_PATH=\$\(node scripts\/native-sdk\.mjs path\)" >> "\$GITHUB_ENV"/, f);
    assert.match(sdk, /echo "\$\(npm root\)\/\.bin" >> "\$GITHUB_PATH"/, `${f}: the lockfile's native binary is the one on PATH`);
    assert.ok(sh.indexOf("npm ci --ignore-scripts") < sh.indexOf("node scripts/native-sdk.mjs toolchain"), f);
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

await test("ci: SHA256SUMS names its release, is signed when the key exists, and enforced builds cannot ship without it", () => {
  const rel = wf["release.yml"];
  // assemble (no secret) → sign (the key) → publish (the write token).
  assert.deepEqual(rel.jobs.sign.needs, ["preflight", "assemble"]);
  const sums = steps(rel.jobs.assemble).find((s) => s.name === "checksums");
  assert.equal(sums.env.TAG, "${{ inputs.tag }}");
  // The sixth line binds the signed bytes to the tag (src/install.zig sumsBinding).
  assert.match(sums.run, /^printf '%s\\n' "\$TAG" > VERSION$/m);
  assert.match(sums.run, /^sha256sum VERSION >> SHA256SUMS$/m);
  assert.match(sums.run, /test "\$\(wc -l < SHA256SUMS\)" -eq 6/);
  assert.ok(sums.run.indexOf("sha256sum VERSION >> SHA256SUMS") > sums.run.indexOf("GobanStudio-Windows-x64.zip"), "after the packages");
  const sign = steps(rel.jobs.sign).find((s) => s.name === "sign SHA256SUMS");
  assert.equal(sign.env.UPDATE_SIGNING_KEY, "${{ secrets.UPDATE_SIGNING_KEY }}");
  assert.match(sign.run, /^\s*node scripts\/sign-sums\.mjs$/m);
  assert.match(sign.run, /if \[ -n "\$UPDATE_PUBKEY" \]; then[\s\S]*?exit 1/);
  const check = steps(rel.jobs.sign).find((s) => s.name === "the sums are for this tag").run;
  assert.match(check, /test "\$\(cat VERSION\)" = "\$TAG"/);
  assert.match(check, /grep -x "\$\(sha256sum VERSION\)" SHA256SUMS/);
  const publish = steps(rel.jobs.publish).find((s) => s.name === "publish").run;
  assert.match(publish, /if \[ -f SHA256SUMS\.sig \]; then assets\+=\(SHA256SUMS\.sig\); fi/);
  assert.match(publish, /^\s+SHA256SUMS\n\s+VERSION\n\s*\)$/m, "VERSION is published beside the sums, for sha256sum -c");
  // The line release.yml writes is the line the app computes: the SHA-256
  // of the tag and a newline (the Zig test "signed sums name their
  // version" builds its sums the same way).
  const line = (tag) => `${crypto.createHash("sha256").update(tag + "\n").digest("hex")}  VERSION`;
  assert.equal(line("v14.0.0"), "03f8f8d787997ec97ed6273980f539025f918130669d7660b538ed4dbe40a0a2  VERSION");
  assert.notEqual(line("v14.0.0"), line("v14.0.1"));
  const zig = fs.readFileSync(path.join(root, "src/install.zig"), "utf8");
  assert.ok(zig.includes('"03f8f8d787997ec97ed6273980f539025f918130669d7660b538ed4dbe40a0a2  VERSION\\n"'), "the Zig test checks the same line");
  assert.match(zig, /sha\.update\(tag\);\n\s+sha\.update\("\\n"\);/);
  assert.match(zig, /try checkBinding\(sums_text, job\.tag\(\), job\.public_key != null\);/);
  assert.match(zig, /if \(!stagedVersionMatches\(io, job\.platform, staged_root, job\.tag\(\)\)\) return error\.VersionMismatch;/);
});

await test("ci: every package states the version the updater will ask it for", () => {
  const mac = steps(wf["build-macos.yml"].jobs.build).find((s) => s.name === "package app, install engine, sign").run;
  assert.match(mac, /build-info\.json"\)" = "\$version"/);
  assert.match(mac, /PlistBuddy -c 'Print :CFBundleShortVersionString' dist\/GobanStudio\.app\/Contents\/Info\.plist\)" = "\$version"/);
  assert.match(raw["build-windows.yml"], /built = json\.loads\(z\.read\("GobanStudio\/resources\/frontend\/dist\/build-info\.json"\)\)\["app"\]/);
  // sync-dist writes it from app.zon, which release-check keeps equal to package.json.
  const sync = fs.readFileSync(path.join(root, "scripts/sync-dist.mjs"), "utf8");
  assert.match(sync, /JSON\.stringify\(\{ app: version, builtAt/);
});

await test("ci: the disk image offers the Applications folder, and the zip keeps the name the updater expects", () => {
  const dmg = steps(wf["build-macos.yml"].jobs.build).find((s) => s.name === "zip and dmg").run;
  assert.match(dmg, /^ln -s \/Applications dist\/dmg\/Applications$/m);
  assert.ok(dmg.indexOf("ln -s /Applications") < dmg.indexOf("hdiutil create"), "before the image is made");
  assert.match(dmg, /ditto dist\/GobanStudio\.app "dist\/dmg\/Goban Studio\.app"/);
  assert.match(dmg, /grep -x 'GobanStudio\.app\/Contents\/MacOS\/goban-studio'/, "the zip's root is GobanStudio.app");
  const zig = fs.readFileSync(path.join(root, "src/install.zig"), "utf8");
  assert.match(zig, /\.macos_arm64, \.macos_x64 => &\.\{ "GobanStudio\.app", "Goban Studio\.app" \}/);
  assert.match(fs.readFileSync(path.join(root, "scripts/package.sh"), "utf8"), /ln -s \/Applications dmg\/Applications/);
});

await test("ci: downloaded and built third-party code is pinned", () => {
  const win = wf["build-windows.yml"];
  assert.equal(win.env.KATAGO_URL, "https://github.com/lightvector/KataGo/releases/download/v1.18.1/katago-v1.18.1-eigen-windows-x64.zip");
  assert.equal(win.env.KATAGO_SHA256, "074485cf150c38aa3bb14ac9f54f2952ffefbceb44673709bbb8a83650bf95d6");
  assert.equal(win.env.KATAGO_AVX2_URL, "https://github.com/lightvector/KataGo/releases/download/v1.18.1/katago-v1.18.1-eigenavx2-windows-x64.zip");
  assert.equal(win.env.KATAGO_AVX2_SHA256, "0d62ffa41ee04dd89dd1b80fe45e306c837231cb1e2dccb4f5780d0ca7c313db");
  const dl = steps(win.jobs.build).find((s) => s.name === "download KataGo Eigen sidecars (plain and AVX2)").run;
  // Both zips are checked before either is unpacked.
  assert.ok(dl.indexOf('"$KATAGO_SHA256  katago.zip" | sha256sum -c') > 0, "plain build checked");
  assert.ok(dl.indexOf('"$KATAGO_AVX2_SHA256  katago-avx2.zip" | sha256sum -c') > 0, "AVX2 build checked");
  assert.ok(dl.lastIndexOf("sha256sum -c") < dl.indexOf("Expand-Archive"), "checked before it is unpacked");
  // The AVX2 build sits beside the plain one, with the same DLLs (src/engine_build.zig).
  assert.match(dl, /cmp "\$dll" "engine\/windows\/\$\(basename "\$dll"\)"/);
  assert.match(dl, /cp "\$RUNNER_TEMP\/katago-avx2\/katago\.exe" engine\/windows\/katago-avx2\.exe/);
  const mac = wf["build-macos.yml"];
  assert.equal(mac.env.KATAGO_COMMIT, "92ee95c0a4b25fec214da00951ab69e97e207729");
  const kg = steps(mac.jobs.build).find((s) => s.name === "build KataGo Eigen sidecar").run;
  assert.match(kg, /fetch -q --depth 1 https:\/\/github\.com\/lightvector\/KataGo\.git "\$KATAGO_COMMIT"/);
  assert.match(kg, /test "\$\(git -C "\$RUNNER_TEMP\/KataGo" rev-parse HEAD\)" = "\$KATAGO_COMMIT"/);
  assert.doesNotMatch(kg, /--branch/);
  // v15: both macOS builds target macOS 13, and the Metal build's libraries
  // are built from pinned commits, statically, and nothing else is linked.
  assert.equal(mac.env.MACOS_MIN, "13.0");
  assert.match(kg, /-DCMAKE_OSX_DEPLOYMENT_TARGET="\$MACOS_MIN"/);
  assert.match(mac.env.ABSEIL_COMMIT, /^[0-9a-f]{40}$/);
  assert.match(mac.env.PROTOBUF_COMMIT, /^[0-9a-f]{40}$/);
  const deps = steps(mac.jobs.build).find((s) => s.name === "build Protocol Buffers and Abseil for the Metal sidecar (static, macOS 13)").run;
  assert.match(deps, /test "\$\(git -C "\$dir" rev-parse HEAD\)" = "\$commit"/);
  assert.match(deps, /-DBUILD_SHARED_LIBS=OFF/);
  const metal = steps(mac.jobs.build).find((s) => s.name === "build KataGo Metal sidecar");
  assert.equal(metal.if, "${{ env.ARCH == 'arm64' }}");
  assert.match(metal.run, /-DUSE_BACKEND=METAL/);
  assert.match(metal.run, /export PKG_CONFIG_LIBDIR="\$METAL_DEPS\/lib\/pkgconfig"/);
  assert.match(metal.run, /grep -vE '\^\(\/usr\/lib\/\|\/System\/Library\/\|@rpath\/libswift\)'/);
  assert.match(raw["build-macos.yml"], /plutil -replace LSMinimumSystemVersion -string "\$MACOS_MIN"/);
  // Every other KataGo download is checked against its hash.
  for (const f of ["book.yml", "calibrate.yml", "classics-check.yml", "lesson-check.yml"]) {
    assert.match(wf[f].env.KATAGO_SHA256, /^[0-9a-f]{64}$/, f);
    assert.match(raw[f], /echo "\$KATAGO_SHA256  katago\.zip" \| sha256sum -c -/, f);
  }
});

await test("ci: bot commits carry no stale session trailer", () => {
  for (const f of files) assert.doesNotMatch(raw[f], /Claude-Session:/, f);
});
