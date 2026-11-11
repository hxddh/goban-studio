/**
 * Core: the content — the classic games, the course (beginner, intermediate, advanced) and the endgame problems.
 */
import { test, CLASSICS, COURSE, LANG_IDS, PROBLEMS, S, assert, execFileSync, fs, loadSGF, path, root } from "./helpers.mjs";

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

await test("classics: every commented moment is a move of its record, in four languages, and the famous ones are where the record has them", () => {
  const at = (id, index) => {
    const { game } = loadSGF(CLASSICS.find((c) => c.id === id).sgf);
    const m = game.mainLine()[index].move;
    return `${m.color === 1 ? "B" : "W"} ${"ABCDEFGHJKLMNOPQRST"[m.x]}${19 - m.y}`;
  };
  let commented = 0;
  for (const classic of CLASSICS) {
    if (!classic.moments) continue;
    const line = loadSGF(classic.sgf).game.mainLine();
    const seen = new Set();
    for (const mo of classic.moments) {
      commented++;
      assert.ok(Number.isInteger(mo.index) && mo.index >= 1 && mo.index < line.length, `${classic.id}: move ${mo.index} of ${line.length - 1}`);
      assert.ok(line[mo.index].move && !line[mo.index].move.pass, `${classic.id} ${mo.index}: a move on the board`);
      assert.ok(!seen.has(mo.index), `${classic.id}: move ${mo.index} twice`);
      seen.add(mo.index);
      for (const lang of LANG_IDS) for (const field of ["title", "note"]) assert.ok(mo[field]?.[lang]?.trim(), `${classic.id} ${mo.index} ${field} ${lang}`);
    }
    assert.deepEqual(classic.moments.map((m) => m.index), [...seen].sort((a, b) => a - b), `${classic.id}: in move order`);
  }
  assert.ok(commented >= 9, `${commented} commented moments`);
  // Jowa's three moves (68, 70, 80) are White's, where the notes say: the second line on the left,
  // then from the centre side, then one point up on the right.
  assert.deepEqual([68, 70, 80].map((i) => at("blood-vomiting", i)), ["W B11", "W E12", "W Q10"]);
  assert.equal(at("blood-vomiting", 67), "B A14", "Black's move on the edge before it");
  // Lee Sedol's wedge and AlphaGo's answer diagonally below it.
  assert.deepEqual([78, 79].map((i) => at("alphago-lee-4", i)), ["W L11", "B K10"]);
  assert.equal(at("ear-reddening", 127).slice(0, 1), "B");
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
  // v13: opening frameworks, joseki choice and handicap strategy joined the v6 units.
  assert.ok(adv.length >= 8 && adv.length <= 10, `${adv.length} advanced units`);
  const lessons = adv.flatMap((u) => u.lessons);
  assert.ok(lessons.length >= 27 && lessons.length <= 40, `${lessons.length} advanced lessons`);
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
  const jsx = fs.readFileSync(path.join(root, "src/web/js/practice/catalog.jsx"), "utf8");
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
