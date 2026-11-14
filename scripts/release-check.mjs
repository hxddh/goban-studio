/**
 * Release gate for the content and packaging promises.
 *
 * Counts what is real: a course of at least 20 units / 90 lessons / 310
 * steps, including at least 7 intermediate units and 8 advanced units with
 * 27 lessons; at least 500 solver-proved problems, each with a theme and a
 * grade; 20 classics; four languages everywhere; the pinned network and
 * engine configuration; the licences; one version string with its release
 * notes; and that the counts written in the README, docs/QA.md and this
 * version's release notes are the real ones.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE } from "../src/web/js/content/course.js";
import { PROBLEMS, THEMES } from "../src/web/js/content/problems.js";
import { CLASSICS } from "../src/web/js/content/classics.js";
import { APP_VERSION } from "../src/web/js/version.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const langs = ["zh", "en", "ko", "ja"];
const assertLocalized = (item, fields, label) => {
  for (const lang of langs) for (const field of fields) assert.ok(item[field]?.[lang]?.trim(), `${label} ${field} ${lang}`);
};

const lessons = COURSE.flatMap((u) => u.lessons);
const steps = lessons.flatMap((l) => l.steps);
assert.ok(COURSE.length >= 20, "at least 20 course units");
assert.ok(COURSE.filter((u) => u.level === "intermediate").length >= 7, "at least 7 intermediate units");
const advanced = COURSE.filter((u) => u.level === "advanced");
assert.ok(advanced.length >= 8, "at least 8 advanced units");
assert.ok(advanced.flatMap((u) => u.lessons).length >= 27, "at least 27 advanced lessons");
for (const id of ["adv-opening", "adv-joseki", "adv-handicap"]) assert.ok(advanced.some((u) => u.id === id), `advanced unit ${id}`);
assert.ok(lessons.length >= 90, "at least 90 lessons");
assert.ok(steps.length >= 310, "at least 310 lesson steps");
for (const unit of COURSE) assertLocalized(unit, ["title", "summary"], unit.id);
for (const lesson of lessons) assertLocalized(lesson, ["title"], lesson.id);

assert.ok(PROBLEMS.length >= 500, "at least 500 problems");
for (const p of PROBLEMS) assertLocalized(p, ["title", "hint"], p.id);
const grades = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
for (const p of PROBLEMS) assert.ok(grades[p.id]?.grade >= 1 && grades[p.id].grade <= 5, `${p.id} has a measured grade`);
for (const p of PROBLEMS) assert.ok(THEMES.some((th) => th.id === p.theme), `${p.id} has a theme`);
for (const th of THEMES) assertLocalized(th, ["name"], "theme " + th.id);
for (const f of ["assets/brand.svg", "assets/sounds/place-wood-0.wav", "js/selftest.js"]) {
  assert.ok(fs.existsSync(path.join(root, "src/web", f)), f);
}
assert.ok(fs.existsSync(path.join(root, "scripts/patch-sdk.mjs")), "SDK menu patch present");
assert.ok(fs.existsSync(path.join(root, "docs/glossary.md")), "glossary present");
assert.ok(fs.existsSync(path.join(root, "docs/usability.md")), "usability protocol present");
const histogram = [1, 2, 3, 4, 5].map((g) => PROBLEMS.filter((p) => grades[p.id].grade === g).length);

assert.equal(CLASSICS.length, 20, "20 classic games");
for (const classic of CLASSICS) {
  assertLocalized(classic, ["title", "note"], classic.id);
  for (const mo of classic.moments || []) if (mo.title) assertLocalized(mo, ["title", "note"], `${classic.id} move ${mo.index}`);
}

for (const file of [
  "engine/model/model.txt.gz",
  "engine/model/gtp.cfg",
  "engine/model/LICENSE-KataGo.txt",
  "engine/model/LICENSE-KataGo-networks.txt",
  "engine/model/version.txt",
  "src/macos_open.m",
  "src/web/licenses/README.txt",
  "packaging/README-macOS.txt",
  "packaging/README-Windows.txt",
  "node_modules/preact/LICENSE",
]) {
  assert.ok(fs.existsSync(path.join(root, file)), file);
}
// The committed network is pinned: KataGo's g170-b6c96-s175395328-d26788732,
// byte for byte the copy in KataGo's repository (engine/model/README.md says
// where). A changed model must change this hash on purpose, together with
// docs/strength.md, whose measurements were taken with it.
const MODEL_SHA256 = "48d6754de3c4754f95bf6a5ca40957a49e5e915aaaeede133a17b9ccf8fa5fcb";
const modelSha = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "engine/model/model.txt.gz"))).digest("hex");
assert.equal(modelSha, MODEL_SHA256, "engine/model/model.txt.gz is the pinned network");
const cfg = fs.readFileSync(path.join(root, "engine/model/gtp.cfg"), "utf8");
// KataGo starts under Japanese rules (the default); every request then sets
// the game's own ruleset with `kata-set-rules`.
assert.match(cfg, /rules = japanese/);
assert.match(cfg, /reportAnalysisWinratesAs = BLACK/, "the page reads analysis from Black's point of view");

const engineZig = fs.readFileSync(path.join(root, "src/engine.zig"), "utf8");
const mainZig = fs.readFileSync(path.join(root, "src/main.zig"), "utf8");
assert.match(engineZig, /kata-search_analyze/);
for (const rules of ["japanese", "chinese", "korean"]) {
  assert.match(engineZig, new RegExp(`"kata-set-rules ${rules}"`), `the host sends kata-set-rules ${rules}`);
}
assert.match(mainZig, /"studio\.katagoAnalyzeAsync"/);
assert.doesNotMatch(mainZig, /\.name = "studio\.katago(Analyze|Move)"/, "the v2 synchronous KataGo commands are gone");

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const appZon = fs.readFileSync(path.join(root, "app.zon"), "utf8");
const buildZon = fs.readFileSync(path.join(root, "build.zig.zon"), "utf8");
const zonVersion = (appZon.match(/\.version\s*=\s*"([^"]+)"/) || [])[1];
const buildVersion = (buildZon.match(/\.version\s*=\s*"([^"]+)"/) || [])[1];
assert.equal(packageJson.version, zonVersion, "package.json and app.zon versions agree");
assert.equal(packageJson.version, buildVersion, "package.json and build.zig.zon versions agree");
assert.equal(APP_VERSION, packageJson.version, "web APP_VERSION agrees with package.json");
// The workflows build with .nvmrc's Node, the lowest one "engines" allows.
const nvmrc = fs.readFileSync(path.join(root, ".nvmrc"), "utf8").trim();
assert.equal(packageJson.engines?.node, `>=${nvmrc}`, ".nvmrc is the lowest Node package.json's engines allows");
const indexHtml = fs.readFileSync(path.join(root, "src/web/index.html"), "utf8");
assert.match(indexHtml, new RegExp(`data-version="${APP_VERSION}"`), "index.html version agrees");
const notesFile = `.github/release-notes/v${APP_VERSION}.md`;
assert.ok(fs.existsSync(path.join(root, notesFile)), "release notes exist");

// The counts people read are the counts there are. A number in front of one
// of these words, in the README, docs/QA.md's table or this version's notes, must be
// the real one (problems: numbers of three digits, so "4 problems" in an
// example is left alone), and the README must state each of the first five.
const stated = {
  units: [/\b(\d+) units\b/g, COURSE.length],
  lessons: [/\b(\d+) lessons\b/g, lessons.length],
  steps: [/\b(\d+) (?:lesson )?steps\b/g, steps.length],
  problems: [/\b(\d{3,}) (?:solver-proved |verified )?problems\b/g, PROBLEMS.length],
  classics: [/\b(\d+) classics\b/g, CLASSICS.length],
  themes: [/\b(\d+) themes\b/g, THEMES.length],
};
/** Every count `text` states that is not the real one, as "file: 22 units (really 23 units)". */
function wrongCounts(text, file) {
  const wrong = [];
  for (const [word, [pattern, real]] of Object.entries(stated)) {
    for (const hit of text.matchAll(pattern)) if (Number(hit[1]) !== real) wrong.push(`${file}: ${hit[0]} (really ${real} ${word})`);
  }
  return wrong;
}
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const word of ["units", "lessons", "steps", "problems", "classics"]) {
  const [pattern, real] = stated[word];
  assert.ok([...readme.matchAll(pattern)].some((hit) => Number(hit[1]) === real), `README.md states the ${real} ${word}`);
}
// docs/QA.md keeps its numbers in one table (the rest of that page states the gate's minimums).
const qaCounts = fs.readFileSync(path.join(root, "docs/QA.md"), "utf8").match(/<!-- counts -->[\s\S]*?<!-- \/counts -->/);
assert.ok(qaCounts, "docs/QA.md has its counts table");
const wrong = [
  ...wrongCounts(readme, "README.md"),
  ...wrongCounts(qaCounts[0], "docs/QA.md"),
  ...wrongCounts(fs.readFileSync(path.join(root, notesFile), "utf8"), notesFile),
];
assert.deepEqual(wrong, [], "the documents state the real counts");
// The README describes the app as it is: a version it names is this one,
// and no heading tells a version's story (the release notes do that).
for (const hit of readme.matchAll(/\bv(\d+\.\d+\.\d+)\b/g)) assert.equal(hit[1], APP_VERSION, `README.md names ${hit[0]}`);
assert.doesNotMatch(readme, /^#+ .*\bv\d+\b/m, "no README heading is about a version");

console.log(
  `release-check: ${COURSE.length} units · ${lessons.length} lessons · ${steps.length} steps · ${PROBLEMS.length} verified problems in ${THEMES.length} themes (grades ${histogram.join("/")}) · 20 classics · 4 languages · Japanese, Chinese and Korean rules · KataGo analysis bridge · licences · v${APP_VERSION}`,
);
