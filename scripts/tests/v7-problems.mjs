/**
 * v7 tests: problems. Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 *
 * Your own problem collections: SGF problem import (src/web/js/problem-import.js),
 * the stored collections (app/collections-store.js) and their place in backups.
 * The sample collection lives in tests/fixtures/problems/ (never shipped).
 */
import fs from "node:fs";
import path from "node:path";

export default async function ({ test, assert, root }) {
  const I = await import("../../src/web/js/problem-import.js");
  const S = await import("../../src/web/js/solver.js");
  const P = await import("../../src/web/js/persist.js");
  const { PROBLEMS } = await import("../../src/web/js/content/problems.js");
  const { MESSAGES } = await import("../../src/web/js/messages.js");
  const dir = path.join(root, "tests/fixtures/problems");
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".sgf"))
    .sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));
  const pt = (x, y) => String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
  const key = (list) => (list || []).map((p) => `${p.x},${p.y}`).sort().join(" ");

  /** A built-in problem written out as an SGF problem file (standard coordinates). */
  function sgfOf(id, { comment = "", tree = true } = {}) {
    const pz = S.createPuzzle(PROBLEMS.find((p) => p.id === id));
    const ab = pz.stones.filter((s) => s.c === 1).map((s) => pt(s.x, s.y));
    const aw = pz.stones.filter((s) => s.c === -1).map((s) => pt(s.x, s.y));
    let s = `(;GM[1]FF[4]SZ[${pz.size}]` + (comment ? `C[${comment}]` : "") + (ab.length ? `AB[${ab.join("][")}]` : "") + (aw.length ? `AW[${aw.join("][")}]` : "") + `PL[${pz.toMove === 1 ? "B" : "W"}]`;
    if (tree) s += S.solutionLine(pz).map((m, i, a) => `;${m.c === 1 ? "B" : "W"}[${pt(m.x, m.y)}]` + (i === a.length - 1 ? "C[RIGHT]" : "")).join("");
    return s + ")";
  }

  const entries = I.readProblemFiles(files);
  const rows = entries.map((e) => I.analyseEntry(e));
  const row = (file, index) => rows.find((r) => r.file === file && r.index === index);

  await test("v7 problems: SGF problem files are read (setup, who plays, comment, solution tree)", () => {
    assert.equal(entries.length, 10, "eight trees in the collection file plus two single files");
    const e = entries[0];
    assert.equal(e.name, "Straight three");
    assert.equal(e.toMove, 1);
    assert.equal(e.comment, "Black to kill.");
    assert.equal(e.stones.length, 18);
    assert.equal(e.tree.length, 2, "two first-move variations");
    // Standard coordinates: column s is x = 18; nothing is skipped.
    const [s] = I.readProblemSGF("(;SZ[19]AB[sa][ia]AW[ja];B[sb])");
    assert.deepEqual(s.stones.map((p) => [p.x, p.y, p.c]), [[18, 0, 1], [8, 0, 1], [9, 0, -1]]);
    assert.equal(s.toMove, 1, "no PL: the first move tells who plays");
    // Setup on a move-less node after the root, PL there, and a white first move.
    const [t] = I.readProblemSGF("(;SZ[9]C[White to live];AB[aa]AW[bb]PL[W](;W[cc]C[Correct])(;W[dd]))");
    assert.equal(t.stones.length, 2);
    assert.equal(t.toMove, -1);
    assert.equal(t.tree.length, 2);
    // Pre-v7 Goban Studio export skips the letter i in columns.
    const [l] = I.readProblemSGF("(;AP[Goban Studio:6.0.0]SZ[19]AB[ja][ta])");
    assert.deepEqual(l.stones.map((p) => p.x), [8, 18]);
    // A v7 export is standard FF[4]: the i is a column.
    const [v7] = I.readProblemSGF("(;AP[Goban Studio:7.0.0]SZ[19]AB[ia][ja][sa])");
    assert.deepEqual(v7.stones.map((p) => p.x), [8, 9, 18]);
    assert.equal(I.readProblemSGF("not sgf")[0].error, "invalid");
  });

  await test("v7 problems: the file's answer follows the usual conventions", () => {
    const fa = (text) => I.fileAnswer(I.readProblemSGF(text)[0]);
    // RIGHT marks: a first move with no RIGHT line is wrong.
    let a = fa("(;SZ[9]AB[aa]AW[ba]PL[B](;B[cc];W[dd]C[RIGHT])(;B[ee]))");
    assert.equal(a.convention, "marked");
    assert.equal(key(a.right), "2,2");
    assert.equal(key(a.wrong), "4,4");
    // "Correct" in a comment, "Wrong" elsewhere; Incorrect is not Correct.
    a = fa("(;SZ[9]AB[aa]AW[ba]PL[B](;B[cc]C[Incorrect])(;B[ee]C[Correct!]))");
    assert.equal(key(a.right), "4,4");
    assert.equal(key(a.wrong), "2,2");
    // Wrong marks only: the other first moves are right.
    a = fa("(;SZ[9]AB[aa]AW[ba]PL[B](;B[cc]C[Wrong])(;B[ee]))");
    assert.equal(a.convention, "wrong-marked");
    assert.equal(key(a.right), "4,4");
    // TE / BM annotations, and Chinese / Japanese / Korean words.
    assert.equal(key(fa("(;SZ[9]AB[aa]AW[ba]PL[B](;B[cc]BM[1])(;B[ee]TE[1]))").right), "4,4");
    assert.equal(key(fa("(;SZ[9]AB[aa]AW[ba]PL[B](;B[cc]C[失败])(;B[ee]C[正解]))").right), "4,4");
    assert.equal(key(fa("(;SZ[9]AB[aa]AW[ba]PL[B](;B[cc]C[오답])(;B[ee]C[정답]))").right), "4,4");
    // No marks: the main line is the answer, other variations are not judged.
    a = fa("(;SZ[9]AB[aa]AW[ba]PL[B](;B[cc])(;B[ee]))");
    assert.equal(a.convention, "main-line");
    assert.equal(key(a.right), "2,2");
    assert.equal(a.wrong.length, 0);
    assert.equal(fa("(;SZ[9]AB[aa]AW[ba]PL[B])").convention, "none");
  });

  await test("v7 problems: goal words in four languages", () => {
    assert.deepEqual(I.goalWords("Black to kill.").goals, ["kill"]);
    assert.deepEqual(I.goalWords("黑先活").goals, ["live"]);
    assert.deepEqual(I.goalWords("黑先 双活").goals, ["seki"]);
    assert.deepEqual(I.goalWords("黒先 白死").goals, ["kill"]);
    assert.ok(I.goalWords("劫").ko && I.goalWords("Black to play: ko").ko && I.goalWords("コウ").ko);
    assert.ok(!I.goalWords("실패").ko, "실패 (failure) is not 패 (ko)");
    assert.deepEqual(I.goalWords("Connect your stones").goals, ["save"]);
  });

  await test("v7 problems: the sample collection gets one verdict per problem, each proved", () => {
    const want = [
      ["collection.sgf", 0, "accepted", "kill"],
      ["collection.sgf", 1, "accepted", "live"],
      ["collection.sgf", 2, "corrected", "live"],
      ["collection.sgf", 3, "accepted", "kill"],
      ["collection.sgf", 4, "rejected", "ko"],
      ["collection.sgf", 5, "accepted", "kill"],
      ["collection.sgf", 6, "rejected", "open"],
      ["collection.sgf", 7, "rejected", "invalid"],
      ["legacy-export.sgf", 0, "accepted", "live"],
      ["white-capture.sgf", 0, "accepted", "capture"],
    ];
    for (const [file, index, verdict, what] of want) {
      const r = row(file, index);
      assert.equal(r.verdict, verdict, `${file}#${index}: ${JSON.stringify({ ...r, problem: undefined })}`);
      if (verdict === "rejected") assert.equal(r.reason, what, `${file}#${index} reason`);
      else assert.equal(r.goal, what, `${file}#${index} goal`);
      assert.ok(r.ms < I.TIME_BUDGET_MS + 4000, `${file}#${index} took ${r.ms} ms`);
    }
    assert.equal(row("collection.sgf", 5).ko, true, "a ko the file asks for is a ko problem");
    assert.equal(row("white-capture.sgf", 0).problem.toMove, -1, "White plays first, as the file says");
    // Never present an unproved problem as proved: every stored problem
    // validates again from its stored form, with its stored answer.
    for (const r of rows.filter((x) => x.problem)) {
      const pz = S.createPuzzle(r.problem);
      const v = S.validate(pz, { maxCorrect: 3 });
      assert.ok(v.ok, `${r.file}#${r.index}: ${v.reasons.join("; ")}`);
      assert.equal(key(v.first.correct), key(r.problem.answer));
      if (pz.lifeGoal) assert.equal(S.outsideReach(pz).length, 0, "sealed in");
      assert.ok(r.problem.grade >= 1 && r.problem.grade <= 5);
    }
    for (const r of rows.filter((x) => x.verdict === "rejected")) assert.equal(r.problem, undefined);
  });

  await test("v7 problems: a refuted file answer is corrected and the refutation shown", () => {
    const r = row("collection.sgf", 2);
    assert.equal(key(r.refuted), "17,16");
    assert.ok(!r.answer.some((a) => a.x === 17 && a.y === 16));
    assert.ok(r.refutation.length >= 2, "the file's move and the solver's answer to it");
    assert.deepEqual(r.refutation[0], { x: 17, y: 16, c: 1 });
    // The answer really loses after the refutation.
    const pz = S.createPuzzle(r.problem);
    let st = S.initialState(pz);
    for (const m of r.refutation) st = S.play(pz, st, S.indexOf(pz, m.x, m.y));
    assert.equal(S.outcome(pz, st), "loss");
    // A file answer that only fails under a guessed capturing reading is not
    // "corrected": the goal is unclear instead.
    const [e] = I.readProblemSGF(sgfOf("capture-double-atari-02"));
    const u = I.analyseEntry(e);
    assert.equal(u.verdict, "rejected");
    assert.equal(u.reason, "unclear");
  });

  await test("v7 problems: built-in problems written as SGF come back with the same answer", () => {
    for (const id of ["kill-straight-three-02", "life-pyramid-four-02", "kill-pyramid-four-02", "capture-net-01", "life-bulky-five-02"]) {
      const want = S.solveFirstMoves(S.createPuzzle(PROBLEMS.find((p) => p.id === id))).correct;
      for (const tree of [true, false]) {
        const r = I.analyseEntry(I.readProblemSGF(sgfOf(id, { tree }))[0]);
        assert.ok(r.verdict === "accepted", `${id} ${tree}: ${r.verdict} ${r.reason || ""}`);
        assert.equal(key(r.answer), key(want), id);
      }
    }
  });

  await test("v7 problems: out of nodes or time is 'not proved', never proved", () => {
    const [e] = I.readProblemSGF(sgfOf("life-bulky-five-02", { tree: false }));
    const r = I.analyseEntry(e, { budget: 20 });
    assert.equal(r.verdict, "rejected");
    assert.equal(r.reason, "budget");
    const z = I.analyseEntry(e, { timeMs: -1 });
    assert.equal(z.verdict, "rejected");
    assert.equal(z.reason, "budget");
  });

  await test("v7 problems: collections are built, exported to SGF and read back", () => {
    const col = I.buildCollection(rows, { name: "Sample", id: "ctest" });
    assert.equal(col.problems.length, 7);
    assert.equal(col.report.length, 10);
    assert.ok(col.problems.every((p, i) => p.id === `u-ctest-${i + 1}` && p.collection === "ctest" && p.n === i + 1));
    assert.ok(col.report.every((r) => !("problem" in r)));
    const sgf = I.collectionToSGF(col, { appVersion: "7.0.0" });
    assert.match(sgf, /AP\[Goban Studio Problems:7\.0\.0\]/);
    const back = I.readProblemFiles([{ name: "out.sgf", text: sgf }]).map((e) => I.analyseEntry(e));
    assert.equal(back.length, 7);
    back.forEach((r, i) => {
      assert.equal(r.verdict, "accepted", `exported #${i}: ${r.reason || ""}`);
      assert.equal(r.goal, col.problems[i].goal);
      assert.equal(key(r.answer), key(col.problems[i].answer));
      assert.equal(!!r.ko, !!col.problems[i].ko);
    });
    const norm = I.normalizeCollections({ collections: [col, null, { id: 3 }, { id: "x", problems: [{ id: "u-x-1", goal: "nope", diagram: [] }] }] });
    assert.equal(norm.collections.length, 2);
    assert.equal(norm.collections[1].problems.length, 0);
  });

  await test("v7 problems: collections are stored, renamed, removed and carried by backups", async () => {
    const store = await import("../../src/web/js/app/collections-store.js");
    for (const k of Object.values(P.KEYS)) P.removeKey(k);
    store.reloadCollections();
    assert.ok(P.KEYS.collections, "a key of its own");
    const col = I.buildCollection(rows, { name: "Sample", id: "cstore" });
    store.addCollection(col);
    assert.equal(store.reloadCollections().length, 1);
    const p = store.findUserProblem("u-cstore-2");
    assert.equal(p.goal, "live");
    assert.equal(store.findUserProblem("capture-basic-01"), null);
    const def = store.userProblemDef("u-cstore-4");
    assert.equal(def.title.en, MESSAGES["v7problems.problemN"].en.replace("{0}", "4"), "an untitled problem is numbered");
    assert.equal(store.userProblemDef("u-cstore-1").title.en, "Straight three");
    store.renameCollection("cstore", "Renamed");
    assert.equal(store.reloadCollections()[0].name, "Renamed");
    const backup = P.exportBackup("7.0.0");
    assert.equal(backup.data.collections.collections[0].problems.length, 7);
    assert.ok(P.checkBackup(backup).ok);
    store.removeCollection("cstore");
    assert.equal(store.reloadCollections().length, 0);
    assert.ok(P.restoreBackup(JSON.parse(JSON.stringify(backup))).ok);
    assert.equal(store.reloadCollections()[0].name, "Renamed", "restored from the backup");
    for (const k of Object.values(P.KEYS)) P.removeKey(k);
    store.reloadCollections();
  });

  await test("v7 problems: the sample collection is a test fixture, not app content", () => {
    const bundleSrc = ["src/web/js/problem-import.js", "src/web/js/app/collections-ctl.js", "src/web/js/app/collections.jsx", "src/web/js/app/collections-store.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
    assert.doesNotMatch(bundleSrc, /fixtures/);
    assert.ok(!fs.existsSync(path.join(root, "src/web/fixtures")));
  });
}
