/**
 * Learn: the path chosen for you (model/player.js learnPath) — its order
 * and content for a new, a middle and a strong player, with reviews due and
 * the week's focus; the beginner bridges in it; the strings of the new
 * Learn views. Loaded by scripts/test.mjs; receives the runner's helpers.
 */
import fs from "node:fs";
import path from "node:path";
import { MESSAGES } from "../../src/web/js/messages.js";
import { LEARN } from "../../src/web/js/messages/learn.js";

export default async function ({ test, assert, root }) {
  const P = await import("../../src/web/js/model/player.js");
  const { PROBLEMS } = await import("../../src/web/js/content/problems.js");
  const { COURSE } = await import("../../src/web/js/content/course.js");
  const GRADES = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const DAY = P.DAY;
  const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime(); // a Wednesday
  const gradeOf = (id) => GRADES[id]?.grade || 1;
  const def = (id) => PROBLEMS.find((x) => x.id === id);
  const lessons = COURSE.flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l })));
  const firstOf = (level) => lessons.find((x) => (x.unit.level || "beginner") === level).lesson.id;
  const content = (settings, extra = {}) => ({ course: COURSE, problems: PROBLEMS, grades: GRADES, settings, ...extra });
  const NEW = { experience: "new", playerRank: 30 };
  const MIDDLE = { experience: "player", playerRank: 12 };
  const STRONG = { experience: "player", playerRank: 2 };

  /** Problems tried at these grades, solved cleanly or not, a day ago, none due. */
  function record(p, grades, { clean = true, n = 5, theme = null } = {}) {
    let out = p;
    for (const g of grades) {
      const list = PROBLEMS.filter((x) => gradeOf(x.id) === g && (!theme || x.theme === theme) && !out.problems[x.id]).slice(0, n);
      for (const x of list) out = { ...out, problems: { ...out.problems, [x.id]: { tries: 1, solved: clean, clean, streak: clean ? 1 : 0, due: NOW + 5 * DAY, last: NOW - DAY } } };
    }
    return P.normalizeProfile(out);
  }
  const cutGames = () =>
    [0, 1, 2, 3].map((i) => ({ id: "g" + i, at: NOW - i * DAY - 1000, size: 19, color: 1, won: false, moves: 200, confidence: "high", phases: { opening: { loss: 2 }, middle: { loss: 7 }, endgame: { loss: 2 } }, themes: { cut: 1 }, themeLoss: { cut: 5 } }));
  const drill = (id, theme, ago = DAY) => ({ id, gameId: "g", index: 40, theme, color: 1, size: 19, loss: 4, sgf: "(;SZ[19])", due: NOW - ago, added: NOW - 2 * ago, tries: 1, streak: 0 });

  /** The common rules of every path. */
  function wellFormed(list, who) {
    assert.ok(list.length >= 5 && list.length <= 8, `${who}: ${list.length} items`);
    assert.equal(new Set(list.map((i) => i.kind + (i.id || ""))).size, list.length, `${who}: an item twice`);
    assert.ok(list.filter((i) => i.kind === "lesson").length <= 1, `${who}: one lesson`);
    assert.ok(list.filter((i) => i.role === "stretch").length <= 1, `${who}: one stretch`);
    // Reviews come before what is new, and the first game (if any) comes last.
    const firstNew = list.findIndex((i) => i.role === "focus" || i.role === "stretch" || i.role === "new");
    const lastReview = list.map((i) => i.role).lastIndexOf("review");
    assert.ok(firstNew < 0 || lastReview < firstNew, `${who}: reviews first`);
    const game = list.findIndex((i) => i.kind === "game");
    assert.ok(game < 0 || game === list.length - 1, `${who}: the first game last`);
    for (const it of list) if (it.role === "focus") assert.ok(it.why, `${who}: a focus item names its focus`);
  }

  await test("learn path: a new player — the first lesson, then capturing problems at the easiest grades; no stretch yet", () => {
    const list = P.learnPath(P.newProfile(), content(NEW), NOW);
    wellFormed(list, "new");
    assert.deepEqual(list[0], { kind: "lesson", id: firstOf("beginner"), unit: COURSE[0].id, role: "next" });
    const probs = list.slice(1);
    assert.equal(probs.length, 5);
    for (const it of probs) {
      assert.equal(it.kind, "problem");
      assert.equal(it.role, "new");
      assert.equal(def(it.id).topic, "capture", "only what the lessons taught");
      assert.ok(gradeOf(it.id) <= 2, `grade ${gradeOf(it.id)}`);
    }
    assert.deepEqual(P.learnPath(P.newProfile(), content(NEW), NOW + 3 * 3600000), list, "the same all day");
  });

  await test("learn path: a new player with a game mistake and a missed problem due — reviews right after the lesson", () => {
    let p = P.addMistake(P.newProfile(), { gameId: "g1", index: 12, theme: "atari", color: 1, size: 9 }, NOW - DAY);
    const first = P.learnPath(p, content(NEW), NOW).find((i) => i.kind === "problem").id;
    p = P.recordProblem(p, first, { solved: false }, NOW - 2 * DAY);
    const list = P.learnPath(p, content(NEW), NOW);
    wellFormed(list, "new with reviews");
    assert.deepEqual(list.slice(0, 3).map((i) => [i.kind, i.role]), [["lesson", "next"], ["mistake", "review"], ["problem", "review"]]);
    assert.equal(list[1].id, "g1-12");
    assert.equal(list[2].id, first);
    // A drill from "try again from the position" (Play, addMistake) is due at once.
    const tried = P.addMistake(p, { gameId: "g2", index: 30, theme: "cut", color: -1, size: 19 }, NOW - 1000);
    assert.ok(P.learnPath(tried, content(NEW), NOW).some((i) => i.kind === "mistake" && i.id === "g2-30"), "a moment tried again comes back");
    // Reviewed: it leaves the path until it is due again.
    const reviewed = P.recordMistake(p, "g1-12", { solved: true }, NOW);
    assert.ok(!P.learnPath(reviewed, content(NEW), NOW).some((i) => i.id === "g1-12"));
  });

  await test("learn path: a middle player with a focus — intermediate lesson, reviews, the focus around the level, one stretch", () => {
    let p = P.normalizeProfile({ ...P.newProfile({ rank: 12 }), games: P.normalizeGames(cutGames()) });
    p = record(p, [1, 2]);
    p = { ...p, mistakes: [drill("d1", "cut")] };
    const dueId = PROBLEMS.find((x) => x.theme === "net").id;
    p = P.normalizeProfile({ ...p, problems: { ...p.problems, [dueId]: { tries: 2, solved: false, clean: false, streak: 0, due: NOW - 1000, last: NOW - 2 * DAY } } });
    const model = P.focus(p, NOW, { problems: PROBLEMS, grades: GRADES });
    assert.deepEqual(model.focus.map((a) => a.key), ["cut"]);
    const level = model.problems.level;
    assert.ok(level >= 1 && level <= 3, `level ${level}`);
    const list = P.learnPath(p, content(MIDDLE), NOW);
    wellFormed(list, "middle");
    assert.deepEqual(list[0], { kind: "lesson", id: firstOf("intermediate"), unit: COURSE.find((u) => u.level === "intermediate").id, role: "next" });
    assert.deepEqual(list[1], { kind: "mistake", id: "d1", role: "review", why: "cut" }, "the drill names the focus it trains");
    assert.deepEqual(list[2], { kind: "problem", id: dueId, role: "review" });
    const focusItems = list.filter((i) => i.role === "focus");
    assert.ok(focusItems.length >= 2, "the focus brings its problems");
    for (const it of focusItems) {
      assert.equal(it.why, "cut");
      assert.equal(P.focusKey(def(it.id).theme), "cut");
      assert.ok(gradeOf(it.id) <= level + 1, `focus problem at grade ${gradeOf(it.id)}, level ${level}`);
    }
    const stretch = list.filter((i) => i.role === "stretch");
    assert.equal(stretch.length, 1);
    assert.ok(gradeOf(stretch[0].id) > level, "a step up");
  });

  await test("learn path: a strong player — the advanced course, problems near the top grades, the stretch at the top", () => {
    // Before any problem: their rank sets the level (gradeForRank).
    // v13: conservative — a rank gets the grade it should solve comfortably.
    assert.equal(P.gradeForRank(30), 1);
    assert.equal(P.gradeForRank(19), 1);
    assert.equal(P.gradeForRank(15), 2);
    assert.equal(P.gradeForRank(12), 3);
    assert.equal(P.gradeForRank(8), 4);
    assert.equal(P.gradeForRank(2), 5);
    assert.equal(P.gradeForRank(-1), 5);
    assert.equal(P.gradeForRank(null), null);
    for (const [g, rank] of Object.entries(P.PLACEMENT_RANK)) assert.ok(P.gradeForRank(rank) >= Number(g) || Number(g) === 1, `placement grade ${g} → ${rank} kyu → grade ${P.gradeForRank(rank)}`);
    const fresh = P.learnPath(P.newProfile({ rank: 2 }), content(STRONG), NOW);
    wellFormed(fresh, "strong, new to the app");
    assert.equal(fresh[0].id, firstOf("advanced"));
    for (const it of fresh.filter((i) => i.kind === "problem")) assert.ok(gradeOf(it.id) >= 3, `${it.id} grade ${gradeOf(it.id)} for a 2 kyu`);
    assert.equal(fresh.filter((i) => i.role === "stretch").length, 0, "at the top grade there is nothing a grade above");
    // Measured: clean solves up to grade 4 put the level at 4 — new problems within a grade, the stretch at 5.
    const p = record(P.newProfile({ rank: 2 }), [3, 4]);
    // The grades below the one their rank starts at need no results (levelPrior, evidence's cover).
    assert.equal(P.levelPrior(p, STRONG, NOW), 5);
    assert.equal(P.focus(p, NOW, { problems: PROBLEMS, grades: GRADES, cover: P.levelPrior(p, STRONG, NOW) }).problems.level, 4);
    assert.equal(P.focus(p, NOW, { problems: PROBLEMS, grades: GRADES }).problems.level, 1, "without it, grades 1 and 2 are unknown");
    const list = P.learnPath(p, content(STRONG), NOW);
    wellFormed(list, "strong");
    for (const it of list.filter((i) => i.role === "new")) assert.ok(gradeOf(it.id) >= 3, `${it.id} grade ${gradeOf(it.id)}`);
    const stretch = list.find((i) => i.role === "stretch");
    assert.equal(gradeOf(stretch.id), 5);
    // Everything done in the course: no lesson item, the problems remain.
    const done = P.normalizeProfile({ ...p, lessons: Object.fromEntries(lessons.map(({ lesson }) => [lesson.id, { done: true, step: 0, at: 0 }])) });
    const rest = P.learnPath(done, content(STRONG), NOW);
    assert.ok(!rest.some((i) => i.kind === "lesson"));
    assert.equal(rest.length, 5);
  });

  await test("learn path: the beginner bridges are items of the path — capture Go after the lesson, the first 9×9 game last", () => {
    let p = P.recordLesson(P.newProfile(), "stones-capture", { done: true }, NOW);
    let list = P.learnPath(p, content(NEW), NOW);
    wellFormed(list, "after capturing");
    assert.deepEqual(list.slice(0, 2).map((i) => i.kind), ["lesson", "capture"]);
    assert.ok(!P.learnPath(p, content(NEW, { captureWins: 2 }), NOW).some((i) => i.kind === "capture"), "two wins: no more");
    p = P.recordLesson(p, "life-two-eyes", { done: true }, NOW);
    list = P.learnPath(p, content(NEW), NOW);
    wellFormed(list, "both bridges");
    assert.equal(list.length, 8, "lesson, capture Go, five problems, the first game");
    assert.equal(list.at(-1).kind, "game");
    assert.deepEqual(list.at(-1).game, P.FIRST_GAME);
    const played = P.recordGame(p, { id: "1", at: NOW - 1000, size: 9, won: false, moves: 40, level: "30k" });
    assert.ok(!P.learnPath(played, content(NEW), NOW).some((i) => i.kind === "game"), "not once a game is played");
  });

  await test("learn strings: the Learn area in four languages; the removed Daily five, plan and trend strings are gone", () => {
    for (const [key, v] of Object.entries(LEARN)) {
      assert.deepEqual(MESSAGES[key], v, key);
      for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(v[lang]?.trim(), `${key} ${lang}`);
    }
    assert.equal(LEARN["learn.path.focus"].zh, "本周重点：{0}");
    assert.equal(LEARN["learn.path.review"].en, "Due for review");
    assert.equal(LEARN["learn.path.next"].en, "Next lesson");
    for (const key of Object.keys(MESSAGES)) assert.ok(!/^(plan\.|trend\.|practice\.daily|practice\.nextDaily|practice\.finishDaily)/.test(key), key);
    for (const f of ["app/plan-ctl.js", "messages/v7-plan.js"]) assert.ok(!fs.existsSync(path.join(root, "src/web/js", f)), f);
    // The streak stays removed: nothing in Learn counts days in a row.
    for (const f of ["learn/path.jsx", "learn/session.js", "learn/catalog.jsx", "app/practice.jsx"]) assert.doesNotMatch(fs.readFileSync(path.join(root, "src/web/js", f), "utf8"), /streak/i, f);
  });
}
