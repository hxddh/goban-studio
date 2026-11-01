/**
 * Release gate for the content counts the v1.0 promise names explicitly:
 * 60 lessons, 40 openings, 20 classic games, 300 puzzles, four languages.
 * It also checks that the sidecar's model and licence are present before a
 * platform build starts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "../src/web/js/content/lessons.js";
import { OPENINGS } from "../src/web/js/content/openings.js";
import { CLASSICS } from "../src/web/js/content/classics.js";
import { TSUMEGO } from "../src/web/js/content/tsumego.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const langs = ["zh", "en", "ko", "ja"];
const assertLocalized = (item, fields, label) => {
  for (const lang of langs) for (const field of fields) assert.ok(item[field]?.[lang]?.trim(), `${label} ${field} ${lang}`);
};

assert.equal(LESSONS.length, 60, "60 lessons");
assert.equal(OPENINGS.length, 40, "40 openings");
assert.equal(CLASSICS.length, 20, "20 classic games");
assert.equal(TSUMEGO.length, 300, "300 puzzles");
for (const lesson of LESSONS) assertLocalized(lesson, ["title", "text", "hint"], lesson.id);
for (const opening of OPENINGS) assertLocalized(opening, ["title", "text", "hint"], opening.id);
for (const classic of CLASSICS) assertLocalized(classic, ["title", "note"], classic.id);

for (const file of ["engine/model/model.txt.gz", "engine/model/gtp.cfg", "engine/model/LICENSE-KataGo.txt", "engine/model/version.txt"]) {
  assert.ok(fs.existsSync(path.join(root, file)), file);
}
const cfg = fs.readFileSync(path.join(root, "engine/model/gtp.cfg"), "utf8");
assert.match(cfg, /rules = japanese/);

console.log("release-check: 60 lessons · 40 openings · 20 classics · 300 puzzles · 4 languages · Japanese rules");
