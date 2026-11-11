/**
 * Unit and data checks. Run with `npm test`.
 *
 * The checks live in scripts/tests/, one file per area (docs/v9.md,
 * "Layout"): core-* (rules, SGF, solver, engine, content, book, a11y),
 * data-* (the store, games, settings, backups), model-* (the player model),
 * play-*, practice-* and shell-*. They need no browser and no native SDK.
 * A file either runs its checks when imported, through the harness in
 * scripts/tests/helpers.mjs, or exports a function that receives it.
 * Each file runs in a Node process of its own, so nothing one file leaves
 * running (a paced computer reply, a background analysis, a patched clock,
 * a fake native host) can reach another file's checks.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assert, results, root, teardown, test } from "./tests/helpers.mjs";

const MARK = "@@test-results ";
const one = process.argv[2] === "--one" ? process.argv[3] : null;

if (one) {
  // One file in this process: its timers, fake native host and patched
  // clocks cannot reach any other file's checks.
  const mod = await import("./tests/" + one);
  if (typeof mod.default === "function") await mod.default({ test, assert, root });
  await teardown();
  delete globalThis.zero;
  const { count, failures } = results();
  console.log(MARK + JSON.stringify({ count, failures }));
  // Toast and store timers of the interface checks would keep Node alive for seconds.
  process.exit(failures ? 1 : 0);
}

// `node scripts/test.mjs play-,practice-` runs only the files whose names contain one of these.
const only = (process.argv[2] || "").split(",");
const files = fs.readdirSync(path.join(root, "scripts/tests")).filter((n) => n.endsWith(".mjs") && n !== "helpers.mjs" && only.some((o) => n.includes(o))).sort();
const self = fileURLToPath(import.meta.url);
let count = 0;
let failures = 0;
for (const f of files) {
  // Each file in a process of its own, one after another (timing checks get the machine to themselves).
  const r = spawnSync(process.execPath, [self, "--one", f], { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "").split("\n");
  const mark = out.find((l) => l.startsWith(MARK));
  process.stdout.write(out.filter((l) => !l.startsWith(MARK)).join("\n"));
  if (r.stderr) process.stderr.write(r.stderr);
  if (mark) {
    const res = JSON.parse(mark.slice(MARK.length));
    count += res.count;
    failures += res.failures;
  } else {
    // The file crashed before it could report.
    failures += 1;
    console.error(`not ok - ${f} did not finish (exit ${r.status}${r.signal ? ", " + r.signal : ""})`);
  }
}

if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} tests passed.`);
