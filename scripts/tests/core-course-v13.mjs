/**
 * Core: the v13 advanced units (opening frameworks, joseki choice, handicap
 * strategy), checked against the opening book and the solver, and the v13
 * terminology and fact fixes in the problem bank and the classic games.
 */
import { test, CLASSICS, COURSE, PROBLEMS, S, assert, fs, path, root, Book, BOOK } from "./helpers.mjs";
import { handicapPoints } from "../../src/web/js/rules.js";

const unit = (id) => COURSE.find((u) => u.id === id);
const lesson = (id) => COURSE.flatMap((u) => u.lessons).find((l) => l.id === id);

/** A step board as a 19×19 sign map, with the diagram's offset. */
function signMapOf(board) {
  const rows = board.diagram.map((r) => r.replace(/\s+/g, "").split(""));
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let x0 = 0;
  let y0 = 0;
  const corner = board.corner || "tl";
  if (corner.includes("r")) x0 = 19 - w;
  if (corner.includes("b")) y0 = 19 - h;
  const m = Array.from({ length: 19 }, () => Array(19).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === "X" || ch === "x") m[y + y0][x + x0] = 1;
      if (ch === "O" || ch === "o") m[y + y0][x + x0] = -1;
    }
  return { m, x0, y0, partial: w < 19 || h < 19 };
}

/**
 * The book node of a place step: the whole-board tree for a whole board,
 * the corner tree (with its fixed whole-board setup added) for a window in
 * the upper right corner.
 */
function bookHit(board, toMove) {
  const { m, x0, y0, partial } = signMapOf(board);
  if (!partial) return { hit: Book.lookup(BOOK.trees.whole, m, toMove), x0, y0 };
  if (board.corner !== "tr") return { hit: null, x0, y0 };
  const setup = Book.setupSignMap(BOOK.trees.corner.tree, 19);
  for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) if (setup[y][x]) m[y][x] = setup[y][x];
  return { hit: Book.lookup(BOOK.trees.corner, m, toMove), x0, y0 };
}

await test("v13 advanced: opening and joseki come first, handicap strategy last, every earlier lesson kept", () => {
  const adv = COURSE.filter((u) => u.level === "advanced").map((u) => u.id);
  assert.deepEqual(adv.slice(0, 3), ["adv-opening", "adv-joseki", "adv-judgement"]);
  assert.equal(adv[adv.length - 1], "adv-handicap");
  assert.deepEqual(unit("adv-opening").lessons.map((l) => l.id), ["adv-open-chinese", "adv-open-sanrensei", "adv-open-direction", "adv-open-urgent"]);
  assert.deepEqual(unit("adv-joseki").lessons.map((l) => l.id), ["adv-joseki-low-pincer", "adv-joseki-two-space", "adv-joseki-high-approach", "adv-joseki-knight", "adv-joseki-choose"]);
  assert.deepEqual(unit("adv-handicap").lessons.map((l) => l.id), ["adv-handicap-stones", "adv-handicap-simple", "adv-handicap-white"]);
  // The v6 advanced units are all still there, in their order.
  const v6 = ["adv-judgement", "adv-invasion", "adv-life", "adv-tesuji", "adv-middle"];
  assert.deepEqual(adv.filter((id) => v6.includes(id)), v6);
});

await test("advanced opening: the Chinese opening is Q16, Q3 and R9 — the side stone one line below the middle, nearer the 3-4 point", () => {
  const l = lesson("adv-open-chinese");
  const stones = (board, ch) => board.diagram.flatMap((row, y) => row.split(" ").map((c, x) => (c === ch ? `${x},${y}` : null)).filter(Boolean)).sort();
  // [x, y] from the top left: Q16 = 15,3; Q3 = 15,16; R9 = 16,10; Q9 = 15,10; D4 = 3,15; D16 = 3,3.
  const read = l.steps[0];
  assert.deepEqual(stones(read.board, "X"), ["15,16", "15,3", "16,10"], "the diagram: Q16, Q3, R9");
  assert.deepEqual(stones(read.board, "O"), ["3,15", "3,3"]);
  const label = (s) => read.board.marks.find((m) => m.label === s);
  assert.deepEqual([label("1").x, label("1").y, label("3").x, label("3").y, label("5").x, label("5").y], [15, 3, 15, 16, 16, 10]);
  assert.deepEqual([label("A").x, label("A").y], [15, 10], "A is the high Chinese opening's Q9");
  // The first exercise: R9 or Q9, and nothing else.
  assert.deepEqual(stones(l.steps[1].board, "X"), ["15,16", "15,3"]);
  assert.deepEqual(l.steps[1].accept, [{ x: 16, y: 10 }, { x: 15, y: 10 }]);
  // The second, along the bottom: the same three points mirrored on the diagonal (D4, R4, and L3 or L4).
  const flip = (list) => list.map((p) => p.split(",").reverse().join(",")).sort();
  assert.deepEqual(stones(l.steps[2].board, "X"), flip(stones(l.steps[1].board, "X")));
  assert.deepEqual(stones(l.steps[2].board, "O"), flip(stones(l.steps[1].board, "O")));
  assert.deepEqual(l.steps[2].accept, [{ x: 10, y: 16 }, { x: 10, y: 15 }]);
  // No language says "the very middle" any more, and the terms are the usual ones.
  for (const s of l.steps) for (const f of ["text", "success", "wrong"]) if (s[f]) {
    assert.doesNotMatch(s[f].zh, /正中央/, "zh");
    assert.doesNotMatch(s[f].en, /[Hh]alfway/, "en");
    assert.doesNotMatch(s[f].ko, /높은 중국류/, "ko");
    assert.doesNotMatch(s[f].ja, /高い中国流/, "ja");
  }
  assert.match(read.text.en, /one line below the middle/);
  assert.match(read.text.zh, /比正中低一路/);
  // The other lessons that show the opening use the same stones.
  for (const [id, i] of [["adv-open-direction", 2], ["adv-joseki-choose", 2]]) {
    const b = stones(lesson(id).steps[i].board, "X");
    for (const p of ["15,3", "15,16", "16,10"]) assert.ok(b.includes(p), `${id}#${i}: ${p}`);
  }
  // Against it White approaches from the bottom, one point away from the 3-4 stone — not between Black's stones.
  assert.deepEqual(lesson("adv-open-direction").steps[2].accept, [{ x: 13, y: 16 }, { x: 13, y: 15 }]);
});

await test("v13 advanced: every opening and joseki step the book knows accepts only book-quality moves", () => {
  // The Chinese opening's side stone: the book has the position before it, but KataGo's search there
  // did not look at R9 or Q9 (it prefers an enclosure), so these two steps have no evaluation to hold
  // them to. When a rebuilt book lists the move, this exception fails and must go.
  const unsearched = new Set(["adv-open-chinese#1", "adv-open-chinese#2"]);
  let known = 0;
  for (const id of ["adv-opening", "adv-joseki", "adv-handicap"])
    for (const l of unit(id).lessons)
      l.steps.forEach((s, i) => {
        if (s.kind !== "place") return;
        const { hit, x0, y0 } = bookHit(s.board, s.toMove);
        if (!hit) return;
        const judged = s.accept.map((a) => hit.continuations.find((c) => c.x === a.x + x0 && c.y === a.y + y0)).filter(Boolean);
        if (unsearched.has(`${l.id}#${i}`)) {
          assert.equal(judged.length, 0, `${l.id}#${i}: the book now evaluates this step; take it out of the exception`);
          return;
        }
        assert.ok(judged.length, `${l.id}#${i}: no accepted point is a book move or a KataGo candidate`);
        for (const c of judged) assert.ok(c.loss <= Book.JOSEKI_LOSS, `${l.id}#${i}: an accepted point loses ${c.loss.toFixed(1)} points in the book`);
        known++;
      });
  // The named lines (sanrensei, the pincers, the 3-4 approaches) are all covered. The steps on the
  // Chinese opening are not: the book was built before its line was corrected and has no evaluation
  // for them (docs/lesson-audit.md, "v13 units waiting for a run").
  assert.ok(known >= 19, `${known} steps checked against the book`);
});

await test("v13 advanced: the joseki read diagrams number book lines move by move", () => {
  for (const id of ["adv-joseki-low-pincer", "adv-joseki-two-space", "adv-joseki-high-approach", "adv-joseki-knight"]) {
    const read = lesson(id).steps[0];
    assert.equal(read.kind, "read", id);
    const labels = read.board.marks.map((m) => Number(m.label));
    assert.deepEqual(labels, labels.map((_, i) => i + 1), `${id} numbers its moves from 1`);
    // Replaying the numbered moves from the first place step's position stays in the corner book.
    const place = lesson(id).steps.find((s) => s.kind === "place" && bookHit(s.board, s.toMove).hit);
    assert.ok(place, `${id} has a step in the book`);
  }
});

await test("v13 advanced: the urgent point is the solver's vital point, and leaving it lets White kill", () => {
  const steps = lesson("adv-open-urgent").steps;
  const place = steps.find((s) => s.kind === "place");
  const kill = steps.find((s) => s.kind === "problem");
  assert.equal(kill.problem.goal, "kill");
  const pzKill = S.createPuzzle(kill.problem);
  assert.equal(pzKill.toMove, -1, "White kills");
  assert.ok(S.validate(pzKill).ok);
  // The same corner with Black to move lives, and only at the accepted point.
  const pzLive = S.createPuzzle({ ...kill.problem, goal: "live" });
  const first = S.solveFirstMoves(pzLive);
  assert.ok(first.exact);
  assert.deepEqual(first.correct.map((p) => [p.x, p.y]), place.accept.map((a) => [a.x, a.y]));
  // The whole board around it is the same corner (lower left).
  const { m } = signMapOf(place.board);
  for (const st of pzLive.stones) assert.equal(m[st.y][st.x], st.c, `stone at ${st.x},${st.y}`);
});

await test("v13 advanced: handicap boards use the app's handicap points", () => {
  const four = handicapPoints(19, 4);
  const nine = handicapPoints(19, 9);
  for (const l of unit("adv-handicap").lessons)
    for (const s of l.steps) {
      if (!s.board) continue;
      const { m } = signMapOf(s.board);
      const stars = nine.filter(([x, y]) => m[y][x] === 1).length;
      assert.ok(stars === 4 || stars === 9, `${l.id}: ${stars} black star points`);
      const points = stars === 4 ? four : nine;
      for (const [x, y] of points) assert.equal(m[y][x], 1, `${l.id}: handicap stone at ${x},${y}`);
    }
});

await test("v13 terms: the problem bank says rabbity six and capture to save, and ja liberties are 呼吸点 outside races", () => {
  const six = PROBLEMS.filter((p) => /flower-six/.test(p.id));
  assert.ok(six.length >= 2);
  for (const p of six) assert.equal(p.title.en, "Rabbity six", p.id);
  assert.ok(PROBLEMS.every((p) => !/flower six/i.test(p.title.en + " " + p.hint.en)));
  assert.ok(PROBLEMS.some((p) => p.title.en === "Capture to save"));
  assert.ok(PROBLEMS.every((p) => p.title.en !== "Capture to rescue"));
  // ダメ stays the word for liberties in capturing races and seki (外ダメ, 内ダメ); elsewhere a liberty is 呼吸点.
  // Endgame hints live in messages.js (another area), so only the bank's own hints are checked here.
  for (const p of PROBLEMS) {
    if (p.topic === "race" || p.topic === "endgame" || p.theme === "seki" || p.goal === "seki") continue;
    const ja = p.hint.ja.replace(/ダメヅマリ|外ダメ|内ダメ/g, "");
    assert.ok(!ja.includes("ダメ"), `${p.id}: ${p.hint.ja}`);
  }
});

await test("v13 facts: the 1996 Fujitsu Cup note names Lee Changho's first world title (1992 Tong-Yang Cup)", () => {
  const c = CLASSICS.find((x) => x.id === "lee-ma-1996");
  for (const lang of ["zh", "en", "ko", "ja"]) {
    assert.match(c.note[lang], /1992/, lang);
    assert.doesNotMatch(c.note[lang], /opening his run|开启了他的|시작했습니다|切り開きました/, lang);
  }
  // The same person is romanized one way: Fujisawa Shuko (藤沢秀行).
  for (const x of CLASSICS) for (const side of ["blackName", "whiteName"]) assert.notEqual(x[side].en, "Fujisawa Hideyuki", x.id);
  // The 8th Judan is the 8th in every language.
  assert.match(CLASSICS.find((x) => x.id === "sakata-otake-1969").note.zh, /第八期/);
});

await test("v13 docs: the glossary lists the v13 terms", () => {
  const md = fs.readFileSync(path.join(root, "docs/glossary.md"), "utf8");
  for (const term of ["中国流", "三连星", "模样", "重复", "置き碁", "下ツケ", "カケツギ", "rabbity six"]) assert.ok(md.includes(term), term);
});
