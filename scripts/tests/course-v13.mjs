/**
 * Course (v13): the ko and judgement units, area scoring, and the endgame
 * unit rebuilt on sealed, solver-counted positions.
 */
import { test, COURSE, S, assert } from "./helpers.mjs";
import { FOCUS_LESSONS } from "../../src/web/js/model/player.js";

const unit = (id) => COURSE.find((u) => u.id === id);
const lesson = (id) => COURSE.flatMap((u) => u.lessons).find((l) => l.id === id);
const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A 9×9 diagram as a grid of 1 / -1 / 0, with `moves` ([x, y, colour]) added. */
function grid(rows, moves = []) {
  const g = rows.map((r) => r.replace(/\s+/g, "").split("").map((c) => ("Xx".includes(c) ? 1 : "Oo".includes(c) ? -1 : 0)));
  for (const [x, y, c] of moves) g[y][x] = c;
  return g;
}
const inside = (g, x, y) => y >= 0 && x >= 0 && y < g.length && x < g[0].length;

/** Liberties of the chain at (x, y). */
function liberties(g, x, y) {
  const c = g[y][x];
  const seen = new Set([`${x},${y}`]);
  const libs = new Set();
  const stack = [[x, y]];
  while (stack.length) {
    const [a, b] = stack.pop();
    for (const [dx, dy] of N) {
      const p = a + dx;
      const q = b + dy;
      if (!inside(g, p, q)) continue;
      if (g[q][p] === 0) libs.add(`${p},${q}`);
      else if (g[q][p] === c && !seen.has(`${p},${q}`)) {
        seen.add(`${p},${q}`);
        stack.push([p, q]);
      }
    }
  }
  return libs.size;
}

/** Territory (empty regions bordered by one colour) and stones of a finished board. */
function count(g) {
  const out = { territory: { 1: 0, "-1": 0 }, stones: { 1: 0, "-1": 0 }, neutral: 0 };
  const seen = new Set();
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      if (g[y][x]) {
        out.stones[g[y][x]]++;
        continue;
      }
      if (seen.has(`${x},${y}`)) continue;
      const stack = [[x, y]];
      seen.add(`${x},${y}`);
      const border = new Set();
      let n = 0;
      while (stack.length) {
        const [a, b] = stack.pop();
        n++;
        for (const [dx, dy] of N) {
          const p = a + dx;
          const q = b + dy;
          if (!inside(g, p, q)) continue;
          if (g[q][p]) border.add(g[q][p]);
          else if (!seen.has(`${p},${q}`)) {
            seen.add(`${p},${q}`);
            stack.push([p, q]);
          }
        }
      }
      if (border.size === 1) out.territory[[...border][0]] += n;
      else out.neutral += n;
    }
  return out;
}

await test("v13 course: the ko and judgement units are intermediate units after fighting, before the advanced course", () => {
  const ids = COURSE.map((u) => u.id);
  const fighting = ids.indexOf("fighting");
  assert.equal(ids[fighting + 1], "ko-fighting");
  assert.equal(ids[fighting + 2], "judgement");
  for (const id of ["ko-fighting", "judgement"]) assert.equal(unit(id).level, "intermediate");
  assert.ok(ids.indexOf("judgement") < ids.findIndex((id) => unit(id).level === "advanced"));
  assert.deepEqual(unit("ko-fighting").lessons.map((l) => l.id), ["ko-threat", "ko-threat-answer", "ko-count", "ko-resolve"]);
  assert.deepEqual(unit("judgement").lessons.map((l) => l.id), ["judge-count", "judge-ahead", "judge-behind"]);
});

await test("v13 course: every focus lesson exists", () => {
  const ids = new Set(COURSE.flatMap((u) => u.lessons.map((l) => l.id)));
  for (const [key, list] of Object.entries(FOCUS_LESSONS)) for (const id of list) assert.ok(ids.has(id), `${key}: ${id}`);
  assert.ok(FOCUS_LESSONS.ko.includes("ko-threat"));
  assert.ok(FOCUS_LESSONS.endgame.includes("endgame-big"));
});

await test("v13 endgame: every interactive step is a sealed endgame problem the solver proves", () => {
  const eg = unit("endgame");
  assert.ok(eg.lessons.length >= 8);
  let n = 0;
  for (const l of eg.lessons)
    for (const st of l.steps) {
      assert.notEqual(st.kind, "place", `${l.id}: no place steps on open boards`);
      if (st.kind !== "problem") continue;
      n++;
      assert.equal(st.problem.goal, "endgame", l.id);
      const v = S.validate(S.createPuzzle(st.problem));
      assert.ok(v.ok, `${l.id}: ${v.reasons.join("; ")}`);
    }
  assert.ok(n >= 18, `${n} endgame problems`);
});

await test("v13 endgame: a big gote move beats a small double sente, and the lesson no longer says double sente always comes first", () => {
  const step = lesson("endgame-big").steps.find((s) => s.kind === "problem");
  const pz = S.createPuzzle(step.problem);
  const st = S.initialState(pz);
  const { moves } = S.countMoves(pz, st);
  const at = (x, y) => moves.find((m) => !m.pass && m.x - pz.box.x0 === x && m.y - pz.box.y0 === y).value;
  // Rescuing the cut-off stones (12, 3) against taking the double sente (5, 3).
  assert.ok(at(12, 3) - at(5, 3) >= 10, `${at(12, 3)} vs ${at(5, 3)}`);
  // The double sente really is sente for both sides on its own.
  const ds = lesson("endgame-double-sente").steps.find((s) => s.kind === "problem").problem;
  const dpz = S.createPuzzle(ds);
  assert.equal(S.countLine(dpz, 1).at(-1).c, -1);
  assert.equal(S.countLine(dpz, -1).at(-1).c, 1);
  const read = lesson("endgame-double-sente").steps[0].text.en;
  assert.doesNotMatch(read, /before everything/);
  assert.match(read, /bigger gote/);
});

await test("v13 endgame: the value questions match the deiri count", () => {
  const values = lesson("endgame-counting").steps.filter((s) => s.kind === "problem").map((s) => S.deiri(S.createPuzzle(s.problem)).value);
  assert.deepEqual(values, [2, 1, 6]);
});

await test("v13 area scoring: the lesson's count of unit 8's game and the rules it names", () => {
  const ids = unit("game").lessons.map((l) => l.id);
  assert.equal(ids[ids.indexOf("game-score") + 1], "game-area-scoring");
  const read = lesson("game-area-scoring").steps[0];
  const c = count(grid(read.board.diagram));
  assert.equal(c.neutral, 0);
  assert.equal(c.territory[1] + c.stones[1], 42);
  assert.equal(c.territory[-1] + c.stones[-1], 39);
  assert.match(read.text.en, /42/);
  assert.match(read.text.en, /7\.5/);
  assert.match(read.text.zh, /数子/);
  // The territory lesson says which rules a new game uses and where to change them.
  assert.match(lesson("game-score").steps[0].text.en, /Settings › Playing › Rules for new games/);
  // Each neutral point of the place steps touches both colours.
  for (const st of lesson("game-area-scoring").steps.filter((s) => s.kind === "place")) {
    const g = grid(st.board.diagram);
    for (const p of st.accept) {
      const near = new Set(N.map(([dx, dy]) => g[p.y + dy]?.[p.x + dx]).filter(Boolean));
      assert.deepEqual([...near].sort(), [-1, 1]);
    }
  }
});

await test("v13 judgement: the count in the text is the count on the board", () => {
  const l = lesson("judge-count");
  const rows = l.steps[0].board.diagram;
  // Black's hane: (4, 8) hane, White blocks (5, 8), Black connects (3, 8).
  const b = count(grid(rows, [[4, 8, 1], [5, 8, -1], [3, 8, 1]]));
  const w = count(grid(rows, [[3, 8, -1], [2, 8, 1], [4, 8, -1]]));
  assert.deepEqual([b.territory[1], b.territory[-1], b.neutral], [31, 24, 0]);
  assert.deepEqual([w.territory[1], w.territory[-1], w.neutral], [30, 25, 0]);
  assert.ok(b.territory[1] - b.territory[-1] - 6.5 === 0.5);
  assert.ok(w.territory[-1] + 6.5 - w.territory[1] === 1.5);
  assert.deepEqual(l.steps[1].accept, [{ x: 4, y: 8 }]);
  assert.deepEqual(l.steps[2].accept, [{ x: 3, y: 8 }]);
  // The problems of the plan lessons are proved on the whole 9×9.
  for (const id of ["judge-ahead", "judge-behind"])
    for (const st of lesson(id).steps.filter((s) => s.kind === "problem")) {
      assert.equal(st.problem.size, 9);
      assert.ok(S.validate(S.createPuzzle(st.problem)).ok, id);
    }
});

await test("v13 ko: the boards really hold a ko and the threat really threatens", () => {
  const l = lesson("ko-threat");
  const rows = l.steps[1].board.diagram;
  const g = grid(rows);
  // White's stone at (4, 4) is in atari, and Black's capture at (5, 4) leaves one liberty: a ko.
  assert.equal(liberties(g, 4, 4), 1);
  const taken = grid(rows, [[5, 4, 1], [4, 4, 0]]);
  assert.equal(liberties(taken, 5, 4), 1);
  // After the cut at (5, 2), White's (5, 0)–(5, 1) have two liberties and Black's (6, 1) captures them by force.
  const cut = grid(rows, [[5, 2, 1]]);
  assert.equal(liberties(cut, 5, 0), 2);
  const p = S.createPuzzle({ goal: "capture", size: 9, diagram: rows.map((r, y) => (y < 2 ? r.replace(/O/, "o") : r)).map((r, y) => (y === 2 ? ". . . X X X O . ." : r)) });
  assert.deepEqual(S.solveFirstMoves(p).correct.map((m) => [m.x, m.y]), [[6, 1]]);
  // Every ko problem is proved.
  for (const id of ["ko-count", "ko-resolve"])
    for (const st of lesson(id).steps.filter((s) => s.kind === "problem")) assert.ok(S.validate(S.createPuzzle(st.problem)).ok, id);
});
