/**
 * Unit and data checks. Run with `npm test`.
 *
 * The checks live in scripts/tests/, one file per area (docs/v9.md,
 * "Layout"): core-* (rules, SGF, solver, engine, content, book, a11y),
 * data-* (the store, games, settings, backups), model-* (the player model),
 * play-*, learn-* and shell-*. They need no browser and no native SDK.
 * A file either runs its checks when imported, through the harness in
 * scripts/tests/helpers.mjs, or exports a function that receives it.
 */
import fs from "node:fs";
import path from "node:path";
import { assert, results, root, test } from "./tests/helpers.mjs";

// `node scripts/test.mjs play-,learn-` runs only the files whose names contain one of these.
const only = (process.argv[2] || "").split(",");
for (const f of fs.readdirSync(path.join(root, "scripts/tests")).filter((n) => n.endsWith(".mjs") && n !== "helpers.mjs" && only.some((o) => n.includes(o))).sort()) {
  const mod = await import("./tests/" + f);
  if (typeof mod.default === "function") await mod.default({ test, assert, root });
  // A file's fake native host ends with it: the next file starts without one.
  delete globalThis.zero;
}

const { count, failures } = results();
if (failures) {
  console.error(`\n${count} passed; ${failures} failed.`);
  process.exit(1);
}
console.log(`\n${count} tests passed.`);
// Toast and store timers of the interface checks would keep Node alive for seconds.
process.exit(0);
