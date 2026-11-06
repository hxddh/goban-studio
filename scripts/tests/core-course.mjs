/**
 * Core: the content — the classic games, the course (beginner, intermediate, advanced) and the endgame problems.
 */
import { test, CLASSICS, COURSE, LANG_IDS, PROBLEMS, S, assert, execFileSync, fs, loadSGF, parse, path, root, t } from "./helpers.mjs";

await test("all 20 classic games parse and carry four-language notes", () => {
  assert.equal(CLASSICS.length, 20);
  const seen = new Set();
  for (const classic of CLASSICS) {
    assert.ok(!seen.has(classic.id), `${classic.id} duplicate id`);
    seen.add(classic.id);
    for (const lang of LANG_IDS) {
      for (const field of ["title", "note"]) {
        assert.ok(classic[field]?.[lang]?.trim(), `${classic.id} ${field} ${lang}`);
      }
      assert.ok(classic.blackName?.[lang]?.trim(), `${classic.id} black ${lang}`);
      assert.ok(classic.whiteName?.[lang]?.trim(), `${classic.id} white ${lang}`);
    }
    const { game } = loadSGF(classic.sgf);
    assert.equal(game.size, 19, `${classic.id} board size`);
    assert.ok(game.mainLine().length > 100, `${classic.id} move count`);
    assert.equal(game.current.result, classic.result, `${classic.id} result preserved`);
  }
});

await test("every course lesson is complete, four-language and solver-verified", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/check-course.mjs")], { stdio: "inherit" });
  assert.ok(COURSE.length >= 13);
});

await test("advanced: the advanced units follow the intermediate ones and keep every earlier lesson id", () => {
  const levels = COURSE.map((u) => u.level || "beginner");
  const order = ["beginner", "intermediate", "advanced"];
  for (let i = 1; i < levels.length; i++) assert.ok(order.indexOf(levels[i]) >= order.indexOf(levels[i - 1]), `unit ${COURSE[i].id} out of order`);
  const adv = COURSE.filter((u) => u.level === "advanced");
  assert.ok(adv.length >= 4 && adv.length <= 6, `${adv.length} advanced units`);
  const lessons = adv.flatMap((u) => u.lessons);
  assert.ok(lessons.length >= 15 && lessons.length <= 20, `${lessons.length} advanced lessons`);
  for (const l of lessons) assert.match(l.id, /^adv-/);
  // The beginner and intermediate lessons are unchanged and come first.
  const before = COURSE.filter((u) => u.level !== "advanced").flatMap((u) => u.lessons.map((l) => l.id));
  for (const id of ["stones-board", "game-dead", "opening-corner-points", "fight-split"]) assert.ok(before.includes(id), id);
  const all = COURSE.flatMap((u) => u.lessons.map((l) => l.id));
  assert.deepEqual(all.slice(0, before.length), before);
  // Every advanced problem step proves under validate() (check-course does too).
  for (const l of lessons)
    for (const st of l.steps)
      if (st.kind === "problem") {
        const v = S.validate(S.createPuzzle(st.problem));
        assert.ok(v.ok, `${l.id}: ${v.reasons.join("; ")}`);
        if (st.problem.ko === "ok") assert.equal(v.result, "ko", l.id);
        if (st.problem.goal === "seki") assert.equal(v.result, "seki", l.id);
      }
});

await test("endgame: at least 30 endgame problems over grades 1–5, with their own topic and themes", async () => {
  const grades = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const eg = PROBLEMS.filter((p) => p.goal === "endgame");
  assert.ok(eg.length >= 30, `${eg.length} endgame problems`);
  for (const p of eg) assert.equal(p.topic, "endgame", p.id);
  const byGrade = [1, 2, 3, 4, 5].map((g) => eg.filter((p) => grades[p.id].grade === g).length);
  assert.ok(byGrade.every((n) => n > 0), `grades ${byGrade.join("/")}`);
  const themes = new Set(eg.map((p) => p.theme));
  for (const t of ["hane-connect", "monkey-jump", "double-sente", "sente-gote", "reverse-sente", "endgame-compare", "deiri"]) assert.ok(themes.has(t), t);
  for (const p of eg.filter((x) => x.ask === "value")) assert.ok(p.choices.includes(p.value), p.id);
  assert.ok(eg.some((p) => S.countAreas(S.createPuzzle(p)) >= 3), "some problems compare three areas");
  const jsx = fs.readFileSync(path.join(root, "src/web/js/app/practice.jsx"), "utf8");
  assert.match(jsx, /export const TOPICS = \[[^\]]*"endgame"\]/);
});

await test("endgame: the fighting unit teaches the leaning attack and sabaki, after the v5 lessons", () => {
  const unit = COURSE.find((u) => u.id === "fighting");
  const ids = unit.lessons.map((l) => l.id);
  assert.deepEqual(ids, ["fight-cutting-stones", "fight-attack-distance", "fight-split", "fight-leaning", "fight-sabaki"]);
  for (const id of ["fight-leaning", "fight-sabaki"]) {
    const lesson = unit.lessons.find((l) => l.id === id);
    const problems = lesson.steps.filter((s) => s.kind === "problem");
    assert.ok(problems.length >= 2, `${id} has solver-proved steps`);
    for (const s of problems) assert.ok(S.validate(S.createPuzzle(s.problem)).ok, id);
  }
  // The leaning stones are what make the capture work: without them it fails.
  const lean = unit.lessons.find((l) => l.id === "fight-leaning").steps[1].problem;
  const without = { ...lean, diagram: lean.diagram.map((r, y) => (y === 3 ? r.replace(/X O \.$/, ". O .") : r)) };
  assert.notEqual(without.diagram[3], lean.diagram[3]);
  assert.equal(S.status(S.createPuzzle(without), S.initialState(S.createPuzzle(without))), "lost");
});
