/**
 * Release gate for the content and packaging promises.
 *
 * 60 lessons, 40 openings, 20 classic games, 300 puzzles and four languages
 * are counted here. The gate also rejects duplicate lesson positions and
 * duplicate opening titles/lines: a count is not a product if half the cards
 * repeat.
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

const positionKey = (item) => JSON.stringify({ size: item.size, setup: item.setup, toMove: item.toMove });
assert.equal(new Set(LESSONS.map(positionKey)).size, 60, "60 distinct lesson positions");
assert.equal(new Set(OPENINGS.map((o) => o.title.en)).size, 40, "40 distinct opening titles");
assert.equal(new Set(OPENINGS.map((o) => JSON.stringify(o.line))).size, 40, "40 distinct opening lines");

for (const file of [
  "engine/model/model.txt.gz",
  "engine/model/gtp.cfg",
  "engine/model/LICENSE-KataGo.txt",
  "engine/model/version.txt",
  "src/macos_open.m",
  "src/web/licenses/README.txt",
  "packaging/README-macOS.txt",
  "packaging/README-Windows.txt",
]) {
  assert.ok(fs.existsSync(path.join(root, file)), file);
}
const cfg = fs.readFileSync(path.join(root, "engine/model/gtp.cfg"), "utf8");
assert.match(cfg, /rules = japanese/);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appZon = fs.readFileSync(path.join(root, "app.zon"), "utf8");
const zonVersion = (appZon.match(/\.version\s*=\s*"([^"]+)"/) || [])[1];
assert.equal(packageJson.version, zonVersion, "package.json and app.zon versions agree");

console.log("release-check: 60 unique lessons · 40 unique openings · 20 classics · 300 puzzles · 4 languages · Japanese rules · licences and native document handler present");
