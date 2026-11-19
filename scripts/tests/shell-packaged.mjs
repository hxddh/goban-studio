/**
 * Shell: the checks the packaged apps run on their user path.
 *
 * - The self-test (src/web/js/selftest.js) requires `userPath` beside
 *   `languages` and `localFiles`, and the runner (scripts/selftest-app.mjs)
 *   requires every check the page requires.
 * - selftest-path.js: the steps in their order; a step that throws fails
 *   alone (the next ones still run) and says why; a wait that never holds
 *   fails with what it waited for and what it last read.
 * - scripts/packaged-ui-steps.mjs: the steps in their order; the run stops
 *   at the first failure and names it; the languages are told apart by
 *   the sidebar's words, the last one English (what the later steps read).
 *
 * The steps themselves are run against the browser build by
 * scripts/ui-tests/shell-packaged.mjs.
 */
import { test, assert, bundle, fs, path, root, setLang, t } from "./helpers.mjs";
import * as Path from "../../src/web/js/selftest-path.js";
import * as Steps from "../packaged-ui-steps.mjs";

const { REQUIRED } = await bundle(['export { REQUIRED } from "./src/web/js/selftest.js";']);

await test("shell packaged: the self-test requires the user path, and the runner requires every check the page does", () => {
  for (const k of ["languages", "localFiles", "userPath"]) assert.ok(REQUIRED.includes(k), k);
  const runner = fs.readFileSync(path.join(root, "scripts/selftest-app.mjs"), "utf8");
  const listed = JSON.parse(runner.match(/const required = (\[[^\]]*\]);/)[1]);
  assert.deepEqual([...listed].sort(), [...REQUIRED].sort());
  // Its own profile: the user path plays a game and opens lessons.
  assert.match(runner, /GOBAN_DATA_DIR: dataDir/);
});

await test("shell packaged: the self-test's user path is a language change, a lesson, a problem, a classic, the explorer, a game and its review", () => {
  assert.deepEqual(Path.USER_PATH, ["language", "lesson", "problem", "classic", "explorer", "game", "review"]);
});

await test("shell packaged: a failing step of the self-test's user path fails alone and says why", async () => {
  const ran = [];
  const result = await Path.runSteps([
    ["a", async () => (ran.push("a"), "shown a")],
    ["b", async () => (ran.push("b"), Promise.reject(new Error("no lesson")))],
    ["c", async () => (ran.push("c"), { rows: 3 })],
  ]);
  assert.deepEqual(ran, ["a", "b", "c"]);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.steps), ["a", "b", "c"]);
  assert.deepEqual([result.steps.a.ok, result.steps.a.shown], [true, "shown a"]);
  assert.deepEqual([result.steps.b.ok, result.steps.b.error], [false, "no lesson"]);
  assert.deepEqual(result.steps.c.shown, { rows: 3 });
  for (const s of Object.values(result.steps)) assert.ok(Number.isInteger(s.ms) && s.ms >= 0);
  assert.equal((await Path.runSteps([["a", async () => 1]])).ok, true);
  // The report is JSON (it is written to a file by the page).
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

await test("shell packaged: a wait of the user path returns what it read, or fails with what it waited for", async () => {
  let n = 0;
  assert.equal(await Path.waitUntil(() => (++n >= 3 ? "seen" : ""), "x", 2000), "seen");
  await assert.rejects(Path.waitUntil(() => "", "the lesson's steps", 120), /^Error: the lesson's steps \(after 120 ms; last: ""\)$/);
  // A read that throws is a value not seen yet, and is said.
  await assert.rejects(
    Path.waitUntil(() => {
      throw new Error("no panel");
    }, "the panel", 120),
    /last: "error: no panel"/,
  );
});

await test("shell packaged: the steps clicked in the packaged Windows app, in order", () => {
  assert.deepEqual(
    Steps.STEPS.map((s) => s.name),
    ["first run", "language", "lesson", "problem", "classic", "explorer", "game", "review"],
  );
  // The same path as the self-test's, after the first run.
  assert.deepEqual(Steps.STEPS.slice(1).map((s) => s.name), Path.USER_PATH);
});

await test("shell packaged: the languages are told apart by the sidebar's words, English last", () => {
  assert.equal(Steps.LANGUAGE_ORDER.at(-1), "en");
  assert.deepEqual([...Steps.LANGUAGE_ORDER].sort(), ["en", "ja", "ko", "zh"]);
  for (const id of Steps.LANGUAGE_ORDER) {
    setLang(id);
    assert.equal(t("nav.today"), Steps.TODAY[id], id);
  }
  setLang("en");
  assert.equal(new Set(Object.values(Steps.TODAY)).size, 4);
});

await test("shell packaged: the clicked path stops at the first failure and names it", async () => {
  const ran = [];
  const lines = [];
  const step = (name, fail = false) => ({ name, run: async () => (ran.push(name), fail ? Promise.reject(new Error("waited for .panel .steps")) : `saw ${name}`) });
  const bad = await Steps.runSteps(/** @type {any} */ ({}), { steps: [step("a"), step("b", true), step("c")], log: (l) => lines.push(l) });
  assert.deepEqual(ran, ["a", "b"]);
  assert.equal(bad.ok, false);
  assert.equal(bad.failed, "b");
  assert.deepEqual(bad.steps.map((s) => [s.name, s.ok]), [["a", true], ["b", false]]);
  assert.equal(bad.steps[1].error, "waited for .panel .steps");
  assert.match(lines[0], /^ok - a \(\d+ ms\): saw a$/);
  assert.equal(lines[1], "not ok - b: waited for .panel .steps");
  const good = await Steps.runSteps(/** @type {any} */ ({}), { steps: [step("a")] });
  assert.deepEqual([good.ok, good.failed, good.steps.length], [true, undefined, 1]);
});
