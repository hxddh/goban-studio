/**
 * Course: the steps as written — a read step says one thing and is short,
 * a lesson's diagrams follow its own story, and the first steps ask for
 * what their text asks for. Loaded by scripts/test.mjs.
 */
import { test, COURSE, LANG_IDS, S, assert } from "./helpers.mjs";

const lesson = (id) => COURSE.flatMap((u) => u.lessons).find((l) => l.id === id);
const grid = (rows) => rows.map((r) => r.split(" "));

await test("course steps: a read step is at most 420 characters in English and 170 in Chinese; at most two a lesson, never in a row", () => {
  let reads = 0;
  for (const u of COURSE)
    for (const l of u.lessons) {
      const kinds = l.steps.map((s) => s.kind);
      assert.ok(kinds.filter((k) => k === "read").length <= 2, `${l.id}: ${kinds}`);
      kinds.forEach((k, i) => assert.ok(!(k === "read" && kinds[i - 1] === "read"), `${l.id}: two read steps in a row`));
      assert.ok(l.steps.length >= 3 && l.steps.length <= 6, `${l.id}: ${l.steps.length} steps`);
      l.steps.forEach((s, i) => {
        if (s.kind !== "read") return;
        reads++;
        assert.ok(s.text.en.length <= 420, `${l.id}#${i + 1}: ${s.text.en.length} English characters`);
        assert.ok(s.text.zh.length <= 170, `${l.id}#${i + 1}: ${s.text.zh.length} Chinese characters`);
        // The other languages say the same thing: none runs far past its usual ratio to the English.
        assert.ok(s.text.ko.length <= 260 && s.text.ja.length <= 230, `${l.id}#${i + 1}: ko ${s.text.ko.length}, ja ${s.text.ja.length}`);
      });
    }
  assert.ok(reads >= 95, `${reads} read steps`);
});

await test("course steps: the lessons whose first step was split keep both halves, each with its own diagram or marks", () => {
  // [lesson, index of the second read step, what its English says]
  const split = [
    ["game-area-scoring", 2, /neutral points count too/],
    ["endgame-counting", 2, /miai counting/],
    ["endgame-big", 2, /only if the opponent really has to answer/],
    ["endgame-japanese-counting", 2, /forces a defensive move first/],
    ["ko-count", 3, /approach ko/],
    ["adv-open-chinese", 3, /Kobayashi/],
    ["adv-joseki-choose", 3, /ladder/],
    ["adv-judge-bigger", 2, /leave B for later/],
  ];
  for (const [id, at, says] of split) {
    const l = lesson(id);
    assert.deepEqual(l.steps.map((s, i) => (s.kind === "read" ? i : null)).filter((i) => i != null), [0, at], id);
    assert.match(l.steps[at].text.en, says, id);
    assert.doesNotMatch(l.steps[0].text.en, says, `${id}: said once`);
    for (const lang of LANG_IDS) assert.ok(l.steps[at].text[lang]?.trim(), `${id} ${lang}`);
  }
  // The marks of each half are the ones its text names.
  const marks = (id, i) => (lesson(id).steps[i].board?.marks || []).map((m) => m.label || m.type).sort().join(",");
  assert.equal(marks("endgame-big", 0), "circle,circle", "the cut-off stones");
  assert.equal(marks("endgame-big", 2), "triangle", "the double sente that waited");
  assert.match(lesson("endgame-big").steps[0].text.en, /\(circles\)/);
  assert.match(lesson("endgame-big").steps[2].text.en, /\(triangle\)/);
  assert.equal(marks("adv-judge-bigger", 0), "A");
  assert.equal(marks("adv-judge-bigger", 2), "A,B");
  assert.doesNotMatch(lesson("adv-judge-bigger").steps[0].text.en, /\bB\b/);
  assert.equal(marks("game-area-scoring", 2), "circle,circle", "the two neutral points left");
  // The circles are the points the next step asks for.
  const area = lesson("game-area-scoring");
  assert.deepEqual(area.steps[2].board.marks.map((m) => [m.x, m.y]), area.steps[3].accept.map((p) => [p.x, p.y]));
  assert.deepEqual(area.steps[2].board.diagram, area.steps[3].board.diagram);
});

await test("course steps: counting ko threats — after Black takes and White plays elsewhere, the board has one more stone each", () => {
  const l = lesson("ko-count");
  const before = grid(l.steps[1].board.diagram);
  const after = grid(l.steps[2].problem.diagram);
  const take = l.steps[1].accept[0];
  const diff = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const a = before[y][x].toUpperCase();
    const b = after[y][x].toUpperCase();
    if (a !== b) diff.push(`${x},${y}:${a}>${b}`);
  }
  // Black's capture, the captured white stone gone, and exactly one white move elsewhere.
  assert.ok(diff.includes(`${take.x},${take.y}:.>X`), diff.join(" "));
  assert.equal(diff.filter((d) => d.endsWith(">X")).length, 1, `one black move: ${diff.join(" ")}`);
  assert.equal(diff.filter((d) => d.endsWith("O>.")).length, 1, "the white stone taken");
  assert.equal(diff.filter((d) => d.endsWith(".>O")).length, 1, `one white move: ${diff.join(" ")}`);
  assert.equal(diff.length, 3);
  // The threat the first step names (the circle) is still open, as the text says it was not needed.
  const circle = l.steps[0].board.marks.find((m) => m.type === "circle");
  assert.equal(after[circle.y][circle.x], ".");
  // And connecting is still the one answer.
  const pz = S.createPuzzle(l.steps[2].problem);
  assert.deepEqual(S.solveFirstMoves(pz).correct.map((m) => [m.x, m.y]), [[4, 4]]);
});

await test("course steps: the first lessons' exercises name their own goal instead of \"find the best point\"", () => {
  const withGoal = [["stones-board", [1, 2, 3]], ["stones-liberties", [1, 2]]];
  for (const [id, steps] of withGoal)
    for (const i of steps) {
      const s = lesson(id).steps[i];
      assert.equal(s.kind, "place", `${id}#${i}`);
      for (const lang of LANG_IDS) assert.ok(s.goal?.[lang]?.trim(), `${id}#${i} goal ${lang}`);
      assert.match(s.goal.en, /^Black to play: /);
      assert.match(s.goal.zh, /^黑先，/);
      assert.match(s.goal.ko, /^흑선: /);
      assert.match(s.goal.ja, /^黒先：/);
      assert.doesNotMatch(s.goal.en, /best point/);
    }
  assert.equal(lesson("stones-board").steps[1].goal.en, "Black to play: the centre point");
  // A goal is only ever on a step the player answers.
  for (const u of COURSE) for (const l of u.lessons) for (const s of l.steps) if (s.goal) assert.notEqual(s.kind, "read", l.id);
});
