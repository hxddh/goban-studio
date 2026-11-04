/**
 * Release gate for the content and packaging promises.
 *
 * Counts what is real: a course of at least 13 units / 60 lessons / 240
 * steps (beginner and intermediate), at least 250 solver-verified problems with themes with measured grades, 40 pro
 * openings with unique titles and lines, 20 classics, four languages
 * everywhere, Japanese rules, licences and one version string.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE } from "../src/web/js/content/course.js";
import { PROBLEMS, THEMES } from "../src/web/js/content/problems.js";
import { OPENINGS } from "../src/web/js/content/openings.js";
import { CLASSICS } from "../src/web/js/content/classics.js";
import { APP_VERSION } from "../src/web/js/version.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const langs = ["zh", "en", "ko", "ja"];
const assertLocalized = (item, fields, label) => {
  for (const lang of langs) for (const field of fields) assert.ok(item[field]?.[lang]?.trim(), `${label} ${field} ${lang}`);
};

const lessons = COURSE.flatMap((u) => u.lessons);
const steps = lessons.flatMap((l) => l.steps);
assert.ok(COURSE.length >= 13, "at least 13 course units");
assert.ok(COURSE.filter((u) => u.level === "intermediate").length >= 5, "at least 5 intermediate units");
assert.ok(lessons.length >= 60, "at least 60 lessons");
assert.ok(steps.length >= 240, "at least 240 lesson steps");
for (const unit of COURSE) assertLocalized(unit, ["title", "summary"], unit.id);
for (const lesson of lessons) assertLocalized(lesson, ["title"], lesson.id);

assert.ok(PROBLEMS.length >= 250, "at least 250 problems");
for (const p of PROBLEMS) assertLocalized(p, ["title", "hint"], p.id);
const grades = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
for (const p of PROBLEMS) assert.ok(grades[p.id]?.grade >= 1 && grades[p.id].grade <= 5, `${p.id} has a measured grade`);
for (const p of PROBLEMS) assert.ok(THEMES.some((th) => th.id === p.theme), `${p.id} has a theme`);
for (const th of THEMES) assertLocalized(th, ["name"], "theme " + th.id);
for (const f of ["assets/surfaces/kaya.webp", "assets/brand.svg", "assets/sounds/place-wood-0.wav", "js/selftest.js"]) {
  assert.ok(fs.existsSync(path.join(root, "src/web", f)), f);
}
assert.ok(fs.existsSync(path.join(root, "scripts/patch-sdk.mjs")), "SDK menu patch present");
assert.ok(fs.existsSync(path.join(root, "docs/glossary.md")), "glossary present");
assert.ok(fs.existsSync(path.join(root, "docs/usability.md")), "usability protocol present");
const histogram = [1, 2, 3, 4, 5].map((g) => PROBLEMS.filter((p) => grades[p.id].grade === g).length);

assert.equal(OPENINGS.length, 40, "40 openings");
assert.equal(CLASSICS.length, 20, "20 classic games");
for (const opening of OPENINGS) assertLocalized(opening, ["title", "text"], opening.id);
for (const classic of CLASSICS) assertLocalized(classic, ["title", "note"], classic.id);
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
  "node_modules/preact/LICENSE",
]) {
  assert.ok(fs.existsSync(path.join(root, file)), file);
}
const cfg = fs.readFileSync(path.join(root, "engine/model/gtp.cfg"), "utf8");
assert.match(cfg, /rules = japanese/);
assert.match(cfg, /reportAnalysisWinratesAs = BLACK/, "the page reads analysis from Black's point of view");

const engineZig = fs.readFileSync(path.join(root, "src/engine.zig"), "utf8");
const mainZig = fs.readFileSync(path.join(root, "src/main.zig"), "utf8");
assert.match(engineZig, /kata-search_analyze/);
assert.match(mainZig, /studio\.katagoAnalyze/);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appZon = fs.readFileSync(path.join(root, "app.zon"), "utf8");
const buildZon = fs.readFileSync(path.join(root, "build.zig.zon"), "utf8");
const zonVersion = (appZon.match(/\.version\s*=\s*"([^"]+)"/) || [])[1];
const buildVersion = (buildZon.match(/\.version\s*=\s*"([^"]+)"/) || [])[1];
assert.equal(packageJson.version, zonVersion, "package.json and app.zon versions agree");
assert.equal(packageJson.version, buildVersion, "package.json and build.zig.zon versions agree");
assert.equal(APP_VERSION, packageJson.version, "web APP_VERSION agrees with package.json");
const indexHtml = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8");
assert.match(indexHtml, new RegExp(`data-version="${APP_VERSION}"`), "index.html version agrees");
assert.ok(fs.existsSync(path.join(root, `.github/release-notes/v${APP_VERSION}.md`)), "release notes exist");

console.log(
  `release-check: ${COURSE.length} units · ${lessons.length} lessons · ${steps.length} steps · ${PROBLEMS.length} verified problems in ${THEMES.length} themes (grades ${histogram.join("/")}) · 40 openings · 20 classics · 4 languages · Japanese rules · KataGo analysis bridge · licences · v${APP_VERSION}`,
);
