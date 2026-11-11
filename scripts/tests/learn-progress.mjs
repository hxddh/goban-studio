/**
 * Learn: what Practice and Today show about progress (learn/progress.js,
 * learn/tile.jsx, learn/milestones.js) and the rules around a problem's
 * name — the tile marks, the path's merged rows, the rating trend, mastery,
 * the difficulty bands, when a review comes back, this week's line, the
 * milestones kept and said once, the day's size, and a name that is not
 * shown before the problem is solved.
 */
import { test, assert, bundle, PROBLEMS, S, setLang, t } from "./helpers.mjs";
import * as G from "../../src/web/js/learn/progress.js";
import * as PM from "../../src/web/js/model/player.js";

const DAY = PM.DAY;
const NOW = new Date(2026, 10, 11, 12).getTime();

await test("learn progress: a tile's state — new, tried, solved (clean at first sight), due, mastered; due comes first", () => {
  assert.equal(G.problemStatus(undefined, NOW), "new");
  assert.equal(G.problemStatus({ tries: 0 }, NOW), "new");
  let p = PM.recordProblem(PM.newProfile(), "a", { solved: false }, NOW - DAY / 2);
  assert.equal(G.problemStatus(p.problems.a, NOW - DAY / 2 + 1000), "tried");
  p = PM.recordProblem(PM.newProfile(), "a", { solved: true, clean: true }, NOW - 1000);
  assert.equal(G.problemStatus(p.problems.a, NOW), "solved");
  assert.equal(G.cleanFirst(p.problems.a), true, "the model's first-sight result");
  // The review date comes: due, whatever else is true of it.
  assert.equal(G.problemStatus(p.problems.a, p.problems.a.due + 1), "due");
  // Solved after a miss: solved, not clean at first sight.
  let q = PM.recordProblem(PM.newProfile(), "b", { solved: false }, NOW - 5000);
  q = PM.recordProblem(q, "b", { late: true }, NOW - 1000);
  assert.equal(G.problemStatus(q.problems.b, NOW), "solved");
  assert.equal(G.cleanFirst(q.problems.b), false);
  // Mastered as the model says (isMastered), until it is due again.
  const e = { tries: 4, solved: true, s: 30, d: 5, due: NOW + 20 * DAY, rating: PM.RATING.GOOD };
  assert.equal(PM.isMastered(e), true);
  assert.equal(G.problemStatus(e, NOW), "mastered");
  assert.equal(G.problemStatus({ ...e, due: NOW - 1 }, NOW), "due");
  assert.equal(G.problemStatus({ tries: 9, solved: true, retired: true, due: 0 }, NOW), "mastered");
});

await test("learn progress: the path merges neighbours of one theme, role and reason; other items stay rows of their own", () => {
  const theme = { a: "ladder", b: "ladder", c: "ladder", d: "net", e: "ladder", f: "ladder" };
  const items = [
    { kind: "lesson", id: "l1", role: "next" },
    { kind: "mistake", id: "m1", role: "review" },
    { kind: "mistake", id: "m2", role: "review" },
    { kind: "problem", id: "a", role: "review" },
    { kind: "problem", id: "b", role: "review" },
    { kind: "problem", id: "c", role: "new" },
    { kind: "problem", id: "d", role: "new" },
    { kind: "problem", id: "e", role: "focus", why: "ladder" },
    { kind: "problem", id: "f", role: "focus", why: "ladder" },
    { kind: "game", role: "bridge" },
  ];
  const rows = G.groupPath(items, (it) => theme[it.id]);
  assert.deepEqual(rows.map((r) => r.items.map((it) => it.id || it.kind).join("+")), ["l1", "m1", "m2", "a+b", "c", "d", "e+f", "game"]);
  assert.deepEqual(rows[3], { kind: "problem", role: "review", why: null, theme: "ladder", items: [items[3], items[4]] });
  assert.equal(rows[6].why, "ladder");
  // The order is the path's: every item once, in place.
  assert.deepEqual(rows.flatMap((r) => r.items), items);
  // Without a theme nothing merges.
  assert.equal(G.groupPath(items.slice(3, 5)).length, 2);
  assert.deepEqual(G.groupPath([]), []);
});

await test("learn progress: the rating trend needs three rated games, shows the newest forty, and says the change in whole ranks", () => {
  const pt = (i, rating) => ({ t: NOW - (30 - i) * DAY, size: 19, rating, sd: 80, rank: 20, pm: 1 });
  assert.equal(G.ratingTrend([]), null);
  assert.equal(G.ratingTrend([pt(0, 100), pt(1, 150)]), null, "two points draw no line");
  const up = G.ratingTrend([pt(0, 100), pt(10, 180), pt(30, 310)]);
  assert.equal(up.ranks, 2);
  assert.equal(up.days, 30);
  assert.equal(up.games, 3);
  assert.equal(G.ratingTrend([pt(0, 300), pt(1, 280), pt(2, 260)]).ranks, 0, "less than half a rank is about the same");
  assert.equal(G.ratingTrend([pt(0, 300), pt(1, 200), pt(2, 140)]).ranks, -2);
  const many = Array.from({ length: 70 }, (_, i) => pt(i / 3, 100 + i));
  assert.equal(G.ratingTrend(many).points.length, G.TREND_MAX);
  assert.equal(G.ratingTrend(many).points.at(-1), many.at(-1), "the newest points");
  // The line stays inside its box, left to right, and a level that barely moves is nearly flat.
  const sp = G.sparkline(up.points, 160, 36);
  const xy = sp.line.split(" ").map((s) => s.split(",").map(Number));
  assert.equal(xy.length, 3);
  for (const [x, y] of xy) assert.ok(x >= 0 && x <= 160 && y >= 0 && y <= 36, `${x},${y}`);
  assert.ok(xy[0][0] < xy[1][0] && xy[1][0] < xy[2][0]);
  assert.ok(xy[2][1] < xy[0][1], "stronger is up");
  assert.deepEqual(sp.end, { x: xy[2][0], y: xy[2][1] });
  const flat = G.sparkline([pt(0, 500), pt(1, 510), pt(2, 505)], 160, 36).line.split(" ").map((s) => Number(s.split(",")[1]));
  assert.ok(Math.max(...flat) - Math.min(...flat) < 3, "ten points of rating are not a mountain");
  // From the model's own history.
  let p = PM.newProfile({ rank: 20 });
  for (let i = 0; i < 5; i++) p = PM.recordGame(p, { id: "g" + i, at: NOW - (10 - i) * DAY, size: 19, won: true, result: "B+R", moves: 100, color: 1, handicap: 0, opponent: PM.gorToTheta(PM.rankToRating(20)) });
  const real = G.ratingTrend(PM.ratingHistory(p, 19));
  assert.equal(real.games, 5);
  assert.ok(real.ranks > 0, "five wins move the estimate up");
});

await test("learn progress: mastery totals and the themes met; the difficulty bands are the model's own (gradeForRank)", () => {
  const by = { ladder: { total: 10, mastered: 3, learning: 2, unseen: 5 }, net: { total: 4, mastered: 0, learning: 0, unseen: 4 }, cut: { total: 6, mastered: 3, learning: 3, unseen: 0 } };
  assert.deepEqual(G.masteryTotals(by), { total: 20, mastered: 6, learning: 5, unseen: 9 });
  assert.deepEqual(G.themesMet(by).map((r) => r.key), ["cut", "ladder"], "most mastered first (then most under way); a theme not met is not listed");
  assert.deepEqual(G.masteryTotals({}), { total: 0, mastered: 0, learning: 0, unseen: 0 });
  assert.deepEqual([1, 2, 3, 4, 5].map(G.gradeBand), [{ from: 30, to: 19 }, { from: 18, to: 14 }, { from: 13, to: 11 }, { from: 10, to: 7 }, { from: 6, to: null }]);
  assert.equal(G.gradeBand(6), null);
  // Every kyu rank falls in the band of the grade the model gives it.
  for (let rank = 30; rank >= 1; rank--) {
    const band = G.gradeBand(PM.gradeForRank(rank));
    assert.ok(rank <= band.from && (band.to == null || rank >= band.to), `rank ${rank}: ${JSON.stringify(band)}`);
  }
  // In words, in every language, never a name that could be read as a rank or a class of player.
  for (const lang of ["zh", "en", "ko", "ja"]) {
    setLang(lang);
    for (let g = 1; g <= 5; g++) {
      const name = t("grade." + g);
      assert.ok(name.includes(String(g)), `${lang} grade ${g}: ${name}`);
      assert.ok(!/级|kyu|dan|段|급|단|級|Advanced|Beginner|高级|入门|挑战/.test(name), `${lang} grade ${g} reads as a rank: ${name}`);
    }
  }
  setLang("en");
});

await test("learn progress: when a review comes back, this week's parts, the days practised, the newest milestones", () => {
  assert.equal(G.comesBackIn(null, NOW), null);
  assert.equal(G.comesBackIn({ due: NOW - 1 }, NOW), null, "already due");
  assert.equal(G.comesBackIn({ due: 0, retired: true }, NOW), null);
  assert.equal(G.comesBackIn({ due: NOW + DAY / 3 }, NOW), 1, "never less than tomorrow");
  assert.equal(G.comesBackIn({ due: NOW + 2.6 * DAY }, NOW), 3);
  // A missed problem's own schedule, from the model.
  const p = PM.recordProblem(PM.newProfile(), "a", { solved: false }, NOW);
  assert.equal(G.comesBackIn(p.problems.a, NOW), 1);
  assert.deepEqual(G.weekParts({ played: 0, solved: 0 }), []);
  assert.deepEqual(G.weekParts({ played: 2, solved: 0 }), [{ key: "games", n: 2 }]);
  assert.deepEqual(G.weekParts({ played: 0, solved: 3 }), [{ key: "problems", n: 3 }]);
  assert.equal(G.weekParts({ played: 1, solved: 3 }).length, 2);
  assert.equal(G.activeDays([0, 2, 0, 1, 5]), 3);
  const list = [
    { key: "firstGame", at: 10 },
    { key: "mastered", n: 10, at: 50 },
    { key: "mastered", n: 25, at: 60 },
    { key: "level", n: 2, at: 40 },
    { key: "level", n: 3, at: null },
    { key: "unit", id: "u", at: 30 },
    { key: "first19", at: 20 },
  ];
  assert.deepEqual(G.recentMilestones(list).map((m) => m.key + (m.n ?? m.id ?? "")), ["mastered25", "unitu", "first19"], "newest first; of a count only the highest; one without a time is not listed");
  assert.deepEqual(G.recentMilestones([]), []);
});

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state, dismissToastKey } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export { COURSE } from "./src/web/js/content/course.js";',
  'export { PROBLEMS } from "./src/web/js/content/problems.js";',
  'export { setLang } from "./src/web/js/i18n.js";',
  'export * as M from "./src/web/js/learn/milestones.js";',
  'export * as Tile from "./src/web/js/learn/tile.jsx";',
  'export * as Path from "./src/web/js/learn/path.jsx";',
  'export * as Today from "./src/web/js/app/today.jsx";',
]);
const { C, state, M, Tile, Path, Today } = A;

function player(extra = {}) {
  A.setLang("en");
  state.settings = { ...A.DEFAULT_SETTINGS, lang: "en", onboarded: true, experience: "rules", playerRank: 20, confirmProblemMove: false, ...extra };
  state.profile = { ...A.PM.newProfile({ rank: 20 }), placement: { skipped: true, at: NOW } };
  state.space = "learn";
  state.learn = { view: "home", topic: null, lesson: null, problem: null, daily: null };
  state.toasts = [];
  C.resetSession();
  M.resetMilestoneWatch();
}

await test("learn progress: a tile shows the board's own edges where the position touches them, and marks the stones the goal is about", () => {
  // A corner problem: anchored top left, the board goes on to the right and below.
  const corner = { diagram: ["x O .", "O O .", ". . ."], corner: "tl" };
  const w = Tile.tileWindow(corner);
  assert.equal(w.n, 6, "never a cramped window");
  assert.deepEqual(w.edge, { l: true, t: true, r: false, b: false });
  assert.deepEqual(w.stones.find((s) => s.key), { x: 0, y: 0, black: true, key: true });
  assert.equal(w.stones.length, 4);
  // Bottom right: the window keeps both edges.
  const br = Tile.tileWindow({ diagram: [". . .", ". o X", ". X ."], corner: "br" });
  assert.deepEqual(br.edge, { l: false, t: false, r: true, b: true });
  assert.deepEqual(br.stones.find((s) => s.key), { x: 4, y: 4, black: false, key: true });
  // In the middle of the board: no edge, the diagram centred.
  const mid = Tile.tileWindow({ diagram: ["X o X"], at: [8, 9] });
  assert.deepEqual(mid.edge, { l: false, t: false, r: false, b: false });
  assert.deepEqual(mid.stones.map((s) => s.y), [2, 2, 2]);
  assert.equal(Tile.tileWindow({ id: "x" }), null, "nothing before the problem's body is here");
  // Every problem of the bank fits its window.
  for (const d of PROBLEMS) {
    const win = Tile.tileWindow(d);
    assert.ok(win.stones.length > 0 && win.stones.every((s) => s.x >= 0 && s.y >= 0 && s.x < win.n && s.y < win.n), d.id);
    assert.ok(win.stones.some((s) => s.key) || d.goal === "endgame", `${d.id}: its key stones`);
  }
});

await test("learn progress: a problem's goal from its definition is the goal of its puzzle, for every problem", () => {
  A.setLang("en");
  for (const d of PROBLEMS) {
    const pz = S.createPuzzle(d);
    assert.equal(C.defGoalText(d), C.goalText(pz), d.id);
    assert.equal(C.defToMove(d), pz.userColor, d.id);
  }
  assert.equal(C.defGoalText({ id: "x", topic: "kill" }), "", "before the body arrives");
  assert.equal(C.defToMove({ id: "x" }), null);
});

await test("learn progress: a problem is not named before it is solved or its answer shown — first sight, the placement quiz, a review", async () => {
  player();
  const d = PROBLEMS.find((x) => x.id === "capture-basic-01");
  C.openProblem(d.id);
  let P = state.learn.problem;
  assert.equal(C.problemNamed(P), false, "first sight");
  assert.equal(C.nameKnown(d.id), false, "not in lists either");
  assert.equal(P.review, false);
  // A hint is a choice; it does not name the problem.
  C.problemHint();
  assert.equal(C.problemNamed(P), false);
  // The answer shown: named, and still after Try again.
  C.showAnswer();
  assert.equal(C.problemNamed(P), true);
  C.retryProblem();
  assert.equal(C.problemNamed(state.learn.problem), true);
  assert.equal(P.missed, true, "the first answer was a miss");
  assert.equal(C.nameKnown(d.id), false, "shown the answer is not solved: lists keep the goal");
  // The same problem again is a review: unnamed until solved in this visit.
  C.openProblem(d.id);
  P = state.learn.problem;
  assert.equal(P.review, true);
  assert.equal(C.problemNamed(P), false, "a review asks for the idea, not the name");
  const ok = S.solveFirstMoves(P.pz).correct[0];
  C.practicePlay(ok.x, ok.y);
  for (let i = 0; i < 60 && state.learn.problem.status !== "won"; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(state.learn.problem.status, "won");
  assert.equal(C.problemNamed(state.learn.problem), true, "solved: its name is the result");
  assert.equal(C.nameKnown(d.id), true, "and lists may say it");
  // The placement quiz: the problem as written, unnamed.
  player();
  C.startPlacement({ seed: 3 });
  assert.equal(state.learn.view, "problem");
  assert.ok(state.learn.placement);
  assert.equal(C.problemNamed(state.learn.problem), false);
  C.learnHome();
});

await test("learn progress: a lesson step that is solved waits for the learner — nothing goes on by itself", async () => {
  player({ experience: "new", playerRank: 30 });
  const lesson = A.COURSE.flatMap((u) => u.lessons).find((l) => l.steps.some((s, i) => s.kind === "place" && i < l.steps.length - 1));
  const at = lesson.steps.findIndex((s) => s.kind === "place");
  C.openLesson(lesson.id, at);
  const cur = state.learn.lesson.cur;
  assert.equal(cur.kind, "place");
  const a = cur.step.accept[0];
  C.practicePlay(a.x + cur.pz.x0, a.y + cur.pz.y0);
  assert.equal(cur.result, "right");
  await new Promise((r) => setTimeout(r, 1800));
  assert.equal(state.learn.lesson.index, at, "still on the step, its feedback on screen");
  C.lessonContinue();
  assert.equal(state.learn.lesson.index, at + 1, "Continue goes on");
  // A step with its own goal says it; one without says the line of its kind.
  const own = A.COURSE.flatMap((u) => u.lessons).flatMap((l) => l.steps).find((s) => s.goal);
  if (own) assert.equal(C.stepGoalText({ kind: own.kind, step: own, toMove: 1 }), own.goal.en);
  C.learnHome();
});

await test("learn progress: the path's rows — problems of one theme as one row with its count, each row with its reason; a problem's own name never in it", () => {
  player();
  const now = C.pathNow();
  const rows = Path.pathRows(now.items);
  assert.ok(rows.length >= 2 && rows.length <= now.items.length);
  assert.deepEqual(rows.flatMap((r) => r.items.map((it) => it.key)), now.items.map((it) => it.key), "every item, in order");
  const probs = rows.filter((r) => r.kind === "problem");
  assert.ok(probs.length > 0);
  for (const r of probs) {
    const defs = r.items.map((it) => PROBLEMS.find((d) => d.id === it.id));
    assert.equal(new Set(defs.map((d) => d.theme)).size, 1, "one theme a row");
    assert.ok(r.title.includes(C.themeName(defs[0].theme)), r.title);
    assert.ok(r.title.includes(defs.length === 1 ? "1 problem" : `${defs.length} problems`), r.title);
    assert.equal(r.why, { new: "New at your level", stretch: "A step up" }[r.role], r.role);
    assert.match(r.more, /^Level \d(–\d)?$/);
    assert.equal(r.diagrams.length, defs.length);
    for (const d of defs) if (d.title.en !== C.themeName(d.theme)) assert.ok(!r.title.includes(d.title.en), `${r.title} names ${d.title.en}`);
  }
  // No two neighbouring problem rows could have been one.
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.kind === "problem" && b.kind === "problem") assert.ok(a.role !== b.role || a.focus !== b.focus || PROBLEMS.find((d) => d.id === a.items[0].id).theme !== PROBLEMS.find((d) => d.id === b.items[0].id).theme);
  }
  // A review that is due says so; the load line counts it and leaves zero parts out.
  let p = state.profile;
  const d = PROBLEMS.find((x) => x.id === "capture-basic-01");
  p = A.PM.recordProblem(p, d.id, { solved: true, clean: true }, Date.now() - 30 * DAY);
  state.profile = p;
  C.resetSession();
  const again = Path.pathRows(C.pathNow().items);
  const review = again.find((r) => r.role === "review");
  assert.ok(review && review.why === "Due for review", JSON.stringify(again.map((r) => [r.role, r.why])));
  assert.equal(Path.loadText(A.PM.reviewLoad(p, Date.now())), "1 to review today");
  assert.equal(Path.loadText({ due: 0, mastered: 0 }), "");
  assert.equal(Path.loadText({ due: 4, mastered: 37 }), "4 to review today · 37 mastered");
  assert.equal(Path.loadText({ due: 0, mastered: 1 }), "1 mastered");
});

await test("learn progress: the day's size — kept in the settings; a session not started is made again, one under way keeps what is done", () => {
  player();
  const count = () => C.pathNow().items.filter((it) => it.kind === "problem" || it.kind === "mistake").length;
  assert.equal(state.settings.dailySize, 5);
  assert.equal(count(), 5);
  C.setDailySize(3);
  assert.equal(state.settings.dailySize, 3);
  assert.equal(count(), 3);
  C.setDailySize(10);
  assert.equal(count(), 10);
  C.setDailySize(7);
  assert.equal(state.settings.dailySize, 5, "anything else is the default");
  // Under way: the first problem done, then a smaller day and a larger one.
  C.startPath();
  const s = state.learn.daily;
  const first = s.items.find((it) => it.kind === "problem");
  C.openPathItem(first.key);
  C.showAnswer();
  C.nextProblem();
  assert.ok(s.done.includes(first.key));
  const open = state.learn.daily.current;
  C.setDailySize(3);
  const after = C.todaysSession();
  assert.equal(after.items.filter((it) => it.kind === "problem").length, 3);
  assert.ok(after.items.some((it) => it.key === first.key), "what is done stays");
  assert.ok(after.items.some((it) => it.key === open), "what is open stays");
  C.setDailySize(10);
  const more = C.todaysSession();
  assert.equal(more.items.filter((it) => it.kind === "problem").length, 10);
  assert.ok(more.done.includes(first.key));
  assert.equal(new Set(more.items.map((it) => it.key)).size, more.items.length, "no item twice");
  C.learnHome();
});

await test("learn progress: milestones — kept once, said once; what a profile had already reached is not news", () => {
  player();
  // A first game, recorded as Play does.
  state.profile = A.PM.recordGame(state.profile, { id: "g1", at: Date.now(), size: 9, won: true, result: "B+R", moves: 40, color: 1, handicap: 0, opponent: A.PM.gorToTheta(A.PM.rankToRating(25)) });
  const fresh = M.checkMilestones({ quiet: true });
  // recordGame stamps the first game itself, so it is reached and already kept.
  assert.deepEqual(fresh, []);
  assert.ok(M.reachedMilestones().some((m) => m.key === "firstGame"));
  // A unit finished: new, said in one toast, kept in the profile.
  const unit = A.COURSE[0];
  let p = state.profile;
  for (const l of unit.lessons) p = A.PM.recordLesson(p, l.id, { done: true, step: 99 }, Date.now());
  state.profile = p;
  state.toasts = [];
  const got = M.checkMilestones();
  assert.deepEqual(got.map((m) => m.key + ":" + m.id), ["unit:" + unit.id]);
  assert.ok(state.profile.marks["unit:" + unit.id] > 0, "kept in the profile");
  assert.equal(state.toasts.length, 1);
  assert.equal(state.toasts[0].message, `Unit finished: ${unit.title.en}`);
  assert.equal(state.toasts[0].tone, "success");
  // Again: nothing new, no second toast.
  assert.deepEqual(M.checkMilestones(), []);
  assert.equal(state.toasts.length, 1);
  A.dismissToastKey("milestone");
  // In words, every kind.
  assert.equal(M.milestoneText({ key: "firstGame" }), "First game played");
  assert.equal(M.milestoneText({ key: "first19" }), "First 19×19 game played");
  assert.equal(M.milestoneText({ key: "level", n: 3 }), "Solving level reached: Level 3");
  assert.equal(M.milestoneText({ key: "mastered", n: 25 }), "25 problems mastered");
  assert.equal(M.milestoneText({ key: "unit", id: "no-such-unit" }), "");
});

await test("learn progress: Today's words — this week without zero parts, the trend honest about being about", () => {
  A.setLang("en");
  assert.equal(Today.weekText({ played: 1, solved: 0 }), "1 game played.");
  assert.equal(Today.weekText({ played: 0, solved: 4 }), "4 problems solved.");
  assert.equal(Today.weekText({ played: 2, solved: 1 }), "2 games played, 1 problem solved.");
  assert.equal(Today.weekText({ played: 0, solved: 0 }), "No games or problems yet this week.");
  for (const lang of ["zh", "en", "ko", "ja"]) {
    A.setLang(lang);
    for (const c of [{ played: 1, solved: 0 }, { played: 0, solved: 2 }]) assert.ok(!/(^|\D)0(\D|$)/.test(Today.weekText(c)), `${lang}: ${Today.weekText(c)}`);
  }
  A.setLang("en");
  assert.equal(Today.trendText({ ranks: 2, days: 30, games: 12 }), "up about 2 ranks over 30 days");
  assert.equal(Today.trendText({ ranks: 1, days: 9, games: 4 }), "up about 1 rank over 9 days");
  assert.equal(Today.trendText({ ranks: -1, days: 12, games: 5 }), "down about 1 rank over 12 days");
  assert.equal(Today.trendText({ ranks: 0, days: 20, games: 6 }), "about the same over 20 days");
  assert.equal(Today.trendText({ ranks: 3, days: 0, games: 5 }), "up about 3 ranks over your last 5 games");
  A.setLang("zh");
  assert.equal(Today.trendText({ ranks: 2, days: 30, games: 12 }), "30 天里升了约 2 级");
  A.setLang("en");
});
