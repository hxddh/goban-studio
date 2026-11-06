/**
 * Core: the content in two steps (src/web/js/content.js, content-split.js).
 * Loaded by scripts/test.mjs (every file in scripts/tests/, in name order);
 * receives the runner's helpers.
 *
 * The start-up index and the parts merge back into exactly the content
 * modules; the index holds only what lists and plans read; the app's loader
 * fetches a part once, merges it into the same objects and lets whatever
 * waited run; Practice's openers wait for what they open.
 */
import fs from "node:fs";
import path from "node:path";

/** Bundle app modules with the start-up index in place of the content modules (as scripts/bundle.mjs does). */
async function bundleLazy(root, lines, modules) {
  const esbuild = await import("esbuild");
  const { indexPlugin } = await import("../../src/web/js/content-split.js");
  const out = await esbuild.build({
    stdin: { contents: lines.join("\n"), resolveDir: root, loader: "js" },
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: { ".json": "json" },
    plugins: [indexPlugin(modules)],
    write: false,
    logLevel: "error",
  });
  return { text: out.outputFiles[0].text, mod: await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")) };
}

const plain = (v) => JSON.parse(JSON.stringify(v));

export default async function ({ test, assert, root }) {
  const Split = await import("../../src/web/js/content-split.js");
  const { COURSE } = await import("../../src/web/js/content/course.js");
  const Problems = await import("../../src/web/js/content/problems.js");
  const { CLASSICS } = await import("../../src/web/js/content/classics.js");
  const GRADES = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const all = { course: COURSE, problems: Problems.PROBLEMS, themes: Problems.THEMES, shapes: Problems.SHAPES, grades: GRADES, classics: CLASSICS };
  const split = () => Split.splitContent(plain(all));

  await test("core content: the start-up index and the three parts merge back into the content modules", () => {
    const { index, bodies } = split();
    assert.deepEqual(Object.keys(bodies).sort(), [...Split.PARTS].sort());
    for (const part of Split.PARTS) Split.mergePart(part, JSON.parse(JSON.stringify(bodies[part])), index);
    assert.deepEqual(index.course, plain(COURSE));
    assert.deepEqual(index.problems, plain(Problems.PROBLEMS));
    assert.deepEqual(index.classics, plain(CLASSICS));
    assert.deepEqual(index.themes, plain(Problems.THEMES));
    assert.deepEqual(index.shapes, plain(Problems.SHAPES));
    for (const [id, g] of Object.entries(GRADES)) assert.equal(index.grades[id].grade, g.grade, id);
  });

  await test("core content: the index holds only what lists and plans read, and is a small part of the whole", () => {
    const { index, bodies } = split();
    for (const u of index.course) for (const l of u.lessons) assert.equal(l.steps, undefined, `${l.id} has steps in the index`);
    assert.equal(index.course.flatMap((u) => u.lessons).length, COURSE.flatMap((u) => u.lessons).length, "every lesson is listed");
    for (const p of index.problems) for (const k of Object.keys(p)) assert.ok(Split.PROBLEM_INDEX.includes(k), `${p.id}.${k} in the index`);
    for (const p of index.problems) assert.ok(p.id && p.topic && p.theme, `${p.id} keeps id, topic and theme`);
    for (const c of index.classics) for (const k of Object.keys(c)) assert.ok(Split.CLASSIC_INDEX.includes(k), `${c.id}.${k} in the index`);
    for (const g of Object.values(index.grades)) assert.deepEqual(Object.keys(g), ["grade"]);
    // Bodies carry what was left out: a lesson's steps, a problem's diagram, a classic's record.
    assert.ok(Object.values(bodies.course).every((steps) => Array.isArray(steps) && steps.length > 0));
    assert.ok(Object.values(bodies.problems).every((b) => Array.isArray(b.diagram) && b.title && b.hint));
    assert.ok(Object.values(bodies.classics).every((b) => typeof b.sgf === "string" && b.note));
    const size = (v) => Buffer.byteLength(JSON.stringify(v));
    const whole = size(all);
    const start = size(index);
    assert.ok(start < whole / 6, `the index is ${start} of ${whole} bytes`);
  });

  await test("core content: the app's loader fetches a part once, merges it in place and runs what waited", async () => {
    const { index, bodies } = split();
    const { text, mod: C } = await bundleLazy(root, ['export * from "./src/web/js/content.js";'], Split.indexModules(index));
    assert.ok(!text.includes("Count White's liberties"), "a problem hint is in the bundled index");
    assert.ok(!text.includes("(;GM[1]"), "a classic's record is in the bundled index");
    const asked = [];
    let fail = true;
    globalThis.fetch = async (url) => {
      asked.push(url);
      const part = /^content\/(\w+)\.json$/.exec(url)?.[1];
      if (part === "classics" && fail) return { ok: false, status: 404 };
      return { ok: !!bodies[part], status: bodies[part] ? 200 : 404, json: async () => JSON.parse(JSON.stringify(bodies[part])) };
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const part of C.PARTS) assert.equal(C.loaded(part), false, part);
      const lesson = C.COURSE[0].lessons[0];
      const problems = C.PROBLEMS;
      const first = problems[0];
      assert.equal(lesson.steps, undefined);
      assert.equal(first.diagram, undefined);
      // Not here yet: what needs it waits, and two waits make one request.
      let ran = 0;
      const waited = C.withContent("course", () => ++ran);
      C.withContent("course", () => ++ran);
      assert.equal(ran, 0);
      await waited;
      assert.equal(ran, 2);
      assert.deepEqual(asked, ["content/course.json"]);
      assert.equal(C.loaded("course"), true);
      assert.ok(lesson.steps.length > 0, "the steps are merged into the same lesson object");
      // Here: at once, synchronously, no new request.
      assert.equal(C.withContent("course", () => "now"), "now");
      await C.ready("problems");
      assert.equal(C.PROBLEMS, problems, "the same array");
      assert.equal(problems[0], first, "the same objects");
      assert.ok(Array.isArray(first.diagram) && first.title.en, "with their bodies");
      // A failed request does not run what waited, and the next use asks again.
      let opened = false;
      await C.withContent("classics", () => (opened = true));
      assert.equal(opened, false);
      assert.equal(C.loaded("classics"), false);
      fail = false;
      await C.withContent("classics", () => (opened = true));
      assert.equal(opened, true);
      assert.ok(C.CLASSICS[0].sgf.startsWith("("), "the record arrived");
      assert.deepEqual(asked, ["content/course.json", "content/problems.json", "content/classics.json", "content/classics.json"]);
      await C.ready();
      assert.equal(asked.length, 4, "nothing is fetched twice");
    } finally {
      delete globalThis.fetch;
      console.warn = warn;
    }
  });

  await test("core content: unbundled, every part is there from the start (tests and scripts read the modules whole)", async () => {
    const { mod: C } = await bundleLazy(root, ['export * from "./src/web/js/content.js";'], {});
    for (const part of C.PARTS) assert.equal(C.loaded(part), true, part);
    assert.ok(C.COURSE[0].lessons[0].steps.length > 0);
    assert.equal(C.withContent("problems", () => 7), 7);
  });

  await test("core content: the build writes each part, sync-dist ships it, and both packages are checked for it", () => {
    const bundleSrc = fs.readFileSync(path.join(root, "scripts/bundle.mjs"), "utf8");
    assert.match(bundleSrc, /indexPlugin\(Split\.indexModules\(split\.index\)\)/, "the app bundle uses the index");
    const sync = fs.readFileSync(path.join(root, "scripts/sync-dist.mjs"), "utf8");
    for (const part of Split.PARTS) assert.ok(sync.includes(`"${part}.json"`), `sync-dist copies ${part}.json`);
    const mac = fs.readFileSync(path.join(root, ".github/workflows/build-macos.yml"), "utf8");
    const win = fs.readFileSync(path.join(root, ".github/workflows/build-windows.yml"), "utf8");
    assert.match(mac, /for f in course problems classics; do test -s "dist\/GobanStudio\.app\/Contents\/Resources\/frontend\/dist\/content\/\$f\.json"/);
    assert.match(win, /for f in course problems classics; do test -s "dist\/GobanStudio\/resources\/frontend\/dist\/content\/\$f\.json"/);
    assert.match(win, /for part in \("course", "problems", "classics"\):/, "the Windows ZIP is checked too");
  });

  await test("core content: Practice's openers wait for the lesson or problem they open", async () => {
    const { index, bodies } = split();
    const { mod: A } = await bundleLazy(
      root,
      [
        'export * as Practice from "./src/web/js/app/practice-ctl.js";',
        'export * as Content from "./src/web/js/content.js";',
        'export { state } from "./src/web/js/app/store.js";',
        'export { setLang } from "./src/web/js/i18n.js";',
      ],
      Split.indexModules(index),
    );
    const { Practice, Content, state } = A;
    const gate = {};
    globalThis.fetch = (url) => {
      const part = /^content\/(\w+)\.json$/.exec(url)[1];
      return new Promise((resolve) => (gate[part] = () => resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(bodies[part])) })));
    };
    try {
      A.setLang("en");
      state.settings = { ...state.settings, lang: "en", experience: "player", playerRank: 15 };
      state.progress = { lessons: {}, problems: {}, classics: {}, mistakes: [], games: [], weakness: {}, daily: null, streak: { count: 0, last: null }, rating: null };
      // Lists read the index alone.
      assert.ok(Practice.problemsOfTopic("capture").length > 0);
      assert.ok(Practice.nextLesson()?.lesson.id);
      const id = Practice.COURSE[0].lessons[0].id;
      const opening = Practice.openLesson(id);
      assert.notEqual(state.practice?.view, "lesson", "not before its steps are here");
      gate.course();
      await opening;
      assert.equal(state.practice.view, "lesson");
      assert.equal(state.practice.lesson.lesson.id, id);
      const pid = Practice.PROBLEMS[0].id;
      const pending = Practice.openProblem(pid);
      assert.equal(state.practice.view, "lesson");
      gate.problems();
      await pending;
      assert.equal(state.practice.view, "problem");
      assert.equal(state.practice.problem.def.id, pid);
      assert.ok(state.practice.problem.pz, "the solver has the diagram");
      assert.ok(Content.loaded("course") && Content.loaded("problems") && !Content.loaded("classics"));
    } finally {
      delete globalThis.fetch;
    }
  });
}
