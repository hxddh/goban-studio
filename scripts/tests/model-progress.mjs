/**
 * Model: what the player model says about progress (src/web/js/model/player.js)
 * — the solving level from first-sight results, reviews before new problems
 * and the review load, the day's size, mastery per theme, games played with
 * an undo or a hint, the rating history, practice days and milestones.
 */
import fs from "node:fs";
import path from "node:path";

export default async function ({ test, assert, root }) {
  const P = await import("../../src/web/js/model/player.js");
  const { PROBLEMS } = await import("../../src/web/js/content/problems.js");
  const { COURSE } = await import("../../src/web/js/content/course.js");
  const { normalizeSettings, DEFAULT_SETTINGS } = await import("../../src/web/js/data/settings.js");
  const GRADES = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const DAY = P.DAY;
  const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime();
  const gradeOf = (id) => GRADES[id]?.grade || 1;
  const ofGrade = (g, n, skip = 0) => PROBLEMS.filter((x) => gradeOf(x.id) === g).slice(skip, skip + n).map((x) => x.id);
  const content = { problems: PROBLEMS, grades: GRADES };
  const levelOf = (p, now = NOW, cover = null) => P.evidence(p, { ...content, now, cover }).problems;
  const PLAYER = { experience: "player", playerRank: 12 };
  const pathOf = (p, now = NOW, extra = {}) => P.practicePath(p, { ...content, course: COURSE, settings: PLAYER, ...extra }, now);
  /** A deterministic generator. */
  const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  /* ------------------------------------------------- the solving level */

  await test("model level: a problem missed and solved on review is still a first-sight miss — reviews do not raise the level", () => {
    let p = P.setPlacement(P.newProfile(), { grade: 2 }, NOW);
    // Six grade-2 problems: four clean, two missed.
    ofGrade(2, 6).forEach((id, i) => (p = P.recordProblem(p, id, { solved: i < 4, clean: i < 4 }, NOW)));
    // Six grade-5 problems: each missed, then solved on the review the next day.
    for (const id of ofGrade(5, 6)) {
      p = P.recordProblem(p, id, { solved: false }, NOW);
      assert.equal(p.problems[id].first, "miss");
      p = P.recordProblem(p, id, { solved: true, clean: true }, NOW + DAY);
      assert.equal(p.problems[id].first, "miss", "the review does not rewrite the first result");
      assert.equal(p.problems[id].seen, NOW);
    }
    const ev = levelOf(p, NOW + 2 * DAY);
    assert.equal(ev.level, 2, "the level stays at the placement");
    // The path that follows is around grade 2, not grade 5.
    const items = P.planProblems({ profile: p, model: P.evidence(p, { ...content, now: NOW + 2 * DAY }), pool: PROBLEMS, bank: PROBLEMS, grades: GRADES, now: NOW + 2 * DAY, prior: 2 });
    for (const it of items.filter((i) => i.role !== "review")) assert.ok(gradeOf(it.id) <= 3, `${it.id} grade ${gradeOf(it.id)}`);
    // A late solve in the same visit is no clean first sight either; a hint is a miss.
    let q = P.recordProblem(P.newProfile(), "a", { solved: false }, NOW);
    q = P.recordProblem(q, "a", { late: true }, NOW + 1000);
    assert.equal(q.problems.a.first, "miss");
    assert.equal(P.recordProblem(P.newProfile(), "a", { solved: true, used: true }, NOW).problems.a.first, "miss");
    assert.equal(P.recordProblem(P.newProfile(), "a", { solved: true, clean: true, quick: true }, NOW).problems.a.first, "clean");
  });

  await test("model level: records from before the first result was kept — known where it follows, else left out, never counted clean", () => {
    const M = P.migrateProblemRecord;
    assert.equal(M({ tries: 1, solved: true, clean: true, streak: 1, last: 5 }).first, "clean");
    assert.equal(M({ tries: 1, solved: true, clean: true, streak: 1, last: 5 }).seen, 5);
    assert.equal(M({ tries: 1, solved: false, clean: false, streak: 0, last: 5 }).first, "miss");
    assert.equal(M({ tries: 1, solved: true, clean: false, streak: 0, last: 5 }).first, "miss", "solved late");
    assert.equal(M({ tries: 3, solved: true, clean: true, streak: 3, last: 5 }).first, "clean", "every try clean");
    const unknown = M({ tries: 2, solved: true, clean: true, streak: 1, s: 4, d: 5, reps: 2, lapses: 0, rating: 3, last: 5 });
    assert.equal(unknown.first, undefined, "missed once, then solved: the first result is not known");
    assert.equal(unknown.seen, undefined);
    assert.equal(M({ tries: 4, solved: true, clean: true, streak: 2, lapses: 1, last: 5 }).first, undefined);
    assert.equal(M({ tries: 2, streak: 1, first: "miss", seen: 3, last: 5 }).first, "miss", "a kept result passes through");
    assert.equal(M({ tries: 2, streak: 2, first: "nonsense", last: 5 }).first, "clean");
    // Six grade-3 records re-solved after an unknown first result do not make a level 3.
    const problems = Object.fromEntries(ofGrade(3, 6).map((id) => [id, { tries: 2, solved: true, clean: true, streak: 1, s: 4, d: 5, reps: 2, lapses: 0, rating: 3, last: NOW - DAY, due: NOW + DAY }]));
    const p = P.normalizeProfile({ ...P.newProfile(), problems, placement: { grade: 3, at: 0 } });
    const ev = levelOf(p);
    assert.equal(ev.level, null, "nothing to measure a level on");
    assert.equal(ev.levelOnGrade, false);
    assert.equal(ev.tried, 6, "they still count as tried, for the focus");
    assert.deepEqual(P.normalizeProfile(JSON.parse(JSON.stringify(p))), p, "idempotent through the store");
    assert.equal(P.PROFILE_V, 13, "no new file version: the additions are optional");
  });

  await test("model level: a simulated 18 kyu stays at level 2 for 60 days, and the stretch is one grade up", () => {
    const rnd = lcg(4242);
    const firstSight = [0.92, 0.65, 0.25, 0.08, 0.02];
    let p = P.setPlacement(P.newProfile(), { grade: 2 }, NOW);
    const settings = { experience: "player", playerRank: 18 };
    let worst = 0;
    for (let d = 0; d < 60; d++) {
      const now = NOW + d * DAY;
      const list = P.practicePath(p, { ...content, course: COURSE, settings }, now);
      const ev = levelOf(p, now);
      const level = ev.levelOnGrade ? ev.level : 2; // until a grade measures it, the placement stands
      for (const it of list) {
        if (it.role === "stretch") assert.equal(gradeOf(it.id), level + 1, `day ${d}: stretch at grade ${gradeOf(it.id)}, level ${level}`);
        if (it.kind !== "problem") continue;
        const seen = p.problems[it.id]?.tries > 0;
        const ok = rnd() < (seen ? 0.85 : firstSight[gradeOf(it.id) - 1]);
        p = P.recordProblem(p, it.id, { solved: ok, clean: ok }, now);
      }
      worst = Math.max(worst, levelOf(p, now).level ?? 0);
      assert.ok(Math.max(...list.filter((i) => i.kind === "problem").map((i) => gradeOf(i.id))) <= 3, `day ${d}: a problem above grade 3`);
    }
    assert.ok(worst <= 2, `drifted to level ${worst}`);
    assert.ok(!Object.keys(p.problems).some((id) => gradeOf(id) >= 4), "never sent to grades 4 and 5");
  });

  await test("model level: a start that proves too high comes down a grade at a time", () => {
    const r = (grade, clean, missed) => [...Array(clean).fill({ grade, miss: false }), ...Array(missed).fill({ grade, miss: true })];
    assert.equal(P.startGrade([], 3), 3);
    assert.equal(P.startGrade([], null), null);
    assert.equal(P.startGrade(r(3, 1, 3), 3, 3), 3, "four results are too few to say");
    assert.equal(P.startGrade(r(3, 1, 5), 3, 3), 2, "one of six at grade 3: work at grade 2");
    assert.equal(P.startGrade(r(3, 3, 3), 3, 3), 3, "half right holds the start");
    assert.equal(P.startGrade([...r(3, 0, 6), ...r(2, 1, 6)], 3, 3), 1, "and down again");
    assert.equal(P.startGrade(r(1, 0, 9), 1, 1), 1);
    // In the path: placed at 3, six grade-3 problems missed at first sight → new problems around grade 2.
    let p = P.setPlacement(P.newProfile(), { grade: 3 }, NOW);
    for (const id of ofGrade(3, 6)) p = P.recordProblem(p, id, { solved: false }, NOW - 2000);
    const ev = levelOf(p);
    assert.deepEqual([ev.levelOnGrade, ev.start], [false, 2]);
    const fresh = pathOf(p, NOW).filter((i) => i.role === "new" || i.role === "stretch");
    assert.ok(fresh.length >= 1);
    for (const it of fresh) assert.ok(gradeOf(it.id) <= 3, `${it.id} grade ${gradeOf(it.id)}`);
    assert.ok(fresh.some((it) => gradeOf(it.id) === 2), "grade 2 problems come");
    // Five clean at grade 2 then measure level 2 (grade 1 is covered by the placement).
    for (const id of ofGrade(2, 5)) p = P.recordProblem(p, id, { solved: true, clean: true }, NOW - 1000);
    assert.deepEqual([levelOf(p).levelOnGrade, levelOf(p).level], [true, 2]);
  });

  /* ---------------------------------------------- reviews and the day */

  /** A profile with `n` problems due for review, the first the most forgotten. */
  const withDue = (n, extra = {}) => {
    const problems = {};
    PROBLEMS.slice(0, n).forEach((x, i) => (problems[x.id] = { tries: 2, solved: true, clean: true, streak: 1, s: 2 + i, d: 5, reps: 2, lapses: 0, rating: 3, last: NOW - 60 * DAY, due: NOW - 30 * DAY }));
    return P.normalizeProfile({ ...P.newProfile({ rank: 12 }), problems, ...extra });
  };
  const roles = (list) => list.filter((i) => i.kind === "problem" || i.kind === "mistake").map((i) => i.role);
  const count = (list, role) => roles(list).filter((r) => r === role).length;

  await test("model path: reviews come before new problems, and leave a place for a new one until twice the day is due", () => {
    assert.equal(P.RULES.SMALL_BACKLOG, undefined);
    assert.equal(P.RULES.BACKLOG_PER_PLACE, 2);
    // Nothing due: all new.
    assert.equal(count(pathOf(withDue(0)), "review"), 0);
    // Up to three due: all of them, the rest new.
    for (const n of [1, 2, 3]) {
      const list = pathOf(withDue(n));
      assert.equal(count(list, "review"), n, `${n} due`);
      assert.equal(roles(list).length, 5);
      assert.ok(roles(list).length - n >= 1, "at least one new problem");
    }
    // Four due: four reviews and one new problem; up to ten (twice the day): still one new problem.
    assert.equal(count(pathOf(withDue(4)), "review"), 4);
    for (const n of [5, 8, 10]) {
      const list = pathOf(withDue(n));
      assert.deepEqual([count(list, "review"), roles(list).length], [4, 5], `${n} due: one place of the day is a new problem`);
    }
    // More than that: the whole day, until the backlog is back under it.
    assert.equal(count(pathOf(withDue(11)), "review"), 5);
    const many = pathOf(withDue(30));
    assert.deepEqual(roles(many), Array(5).fill("review"));
    // The most forgotten first.
    assert.deepEqual(many.filter((i) => i.role === "review").map((i) => i.id), PROBLEMS.slice(0, 5).map((x) => x.id));
    // Drills from your games are reviews too: at most two of them, first.
    const drills = [1, 2, 3].map((i) => ({ id: "d" + i, gameId: "g", index: i, theme: "cut", due: NOW - DAY, added: NOW - 2 * DAY, tries: 0, streak: 0 }));
    const mixed = pathOf(withDue(30, { mistakes: drills }));
    assert.deepEqual(mixed.filter((i) => i.kind !== "lesson").map((i) => i.kind), ["mistake", "mistake", "problem", "problem", "problem"]);
    assert.deepEqual(roles(mixed), Array(5).fill("review"));
    // A small backlog, but nothing new to give (every problem solved): reviews may take the day.
    const solvedAll = {};
    for (const [i, x] of PROBLEMS.entries()) solvedAll[x.id] = { tries: 2, solved: true, clean: true, streak: 1, s: 2 + i, d: 5, reps: 2, lapses: 0, rating: 3, last: NOW - 60 * DAY, due: i < 6 ? NOW - 30 * DAY : NOW + 30 * DAY };
    const none = pathOf(P.normalizeProfile({ ...P.newProfile({ rank: 12 }), problems: solvedAll }));
    assert.equal(count(none, "review"), 5, "no new problem is open: every place is a review");
  });

  await test("model path: the day's size is 3, 5 or 10 problem items; at most REVIEW_CAP reviews a day across its sessions", () => {
    assert.deepEqual(P.RULES.DAILY_SIZES, [3, 5, 10]);
    for (const limit of [3, 5, 10]) {
      assert.equal(roles(pathOf(P.newProfile({ rank: 12 }), NOW, { limit })).length, limit, `limit ${limit}, all new`);
      assert.equal(count(pathOf(withDue(30), NOW, { limit }), "review"), limit, `limit ${limit}, a large backlog`);
      // A day of three with four to six due still has a new problem (it had none with more than three due).
      const some = pathOf(withDue(2 * limit), NOW, { limit });
      assert.deepEqual([count(some, "review"), roles(some).length], [limit - 1, limit], `limit ${limit}, twice the day due: one new problem`);
      const small = pathOf(withDue(2), NOW, { limit });
      assert.deepEqual([count(small, "review"), roles(small).length], [2, limit]);
    }
    assert.equal(count(pathOf(withDue(3), NOW, { limit: 3 }), "review"), 2, "a small backlog leaves one place of three");
    for (const bad of [undefined, null, 0, 4, 7, "10", 99]) assert.equal(roles(pathOf(P.newProfile({ rank: 12 }), NOW, { limit: bad })).length, 5, `limit ${bad} reads as 5`);
    assert.equal(P.dailySize(10), 10);
    assert.equal(P.dailySize(4), 5);
    // The setting: 5 by default, anything else than 3, 5, 10 reads as 5.
    assert.equal(DEFAULT_SETTINGS.dailySize, 5);
    assert.equal(normalizeSettings({}).dailySize, 5);
    assert.equal(normalizeSettings({ dailySize: 10 }).dailySize, 10);
    assert.equal(normalizeSettings({ dailySize: 3 }).dailySize, 3);
    for (const bad of [4, "5", null, 100]) assert.equal(normalizeSettings({ dailySize: bad }).dailySize, 5);
    // Across the day's sessions: ten reviews done, a second session takes two more, a third none.
    let p = withDue(30);
    const play = (list, now) => {
      for (const it of list) if (it.kind === "problem") p = P.recordProblem(p, it.id, { solved: true, clean: true }, now);
    };
    play(pathOf(p, NOW, { limit: 10 }), NOW);
    assert.equal(P.reviewsToday(p, NOW + 1000), 10);
    const second = pathOf(p, NOW + 1000, { limit: 10 });
    assert.equal(count(second, "review"), P.MEMORY.REVIEW_CAP - 10);
    assert.equal(roles(second).length, 10, "the rest of the session is new problems");
    play(second, NOW + 1000);
    assert.equal(P.reviewsToday(p, NOW + 2000), P.MEMORY.REVIEW_CAP, "new problems met today are not reviews");
    assert.equal(count(pathOf(p, NOW + 2000, { limit: 10 }), "review"), 0);
    // Tomorrow the backlog goes on (eighteen due, under twice the day: one place stays new).
    assert.equal(count(pathOf(p, NOW + DAY, { limit: 10 }), "review"), 9);
  });

  await test("model path: over 240 simulated days the review backlog stays bounded, at every size", () => {
    for (const limit of [3, 5, 10]) {
      const rnd = lcg(4242);
      let p = P.setPlacement(P.newProfile(), { grade: 3 }, NOW);
      let max = 0;
      let longest = 0;
      let fresh = 0;
      for (let d = 0; d < 240; d++) {
        const now = NOW + d * DAY;
        const dueNow = Object.values(p.problems).filter((e) => !e.retired && e.due && e.due <= now);
        max = Math.max(max, dueNow.length);
        for (const e of dueNow) longest = Math.max(longest, (now - e.due) / DAY);
        for (const it of pathOf(p, now, { limit })) {
          if (it.kind !== "problem") continue;
          const seen = p.problems[it.id]?.tries > 0;
          if (!seen) fresh++;
          const ok = rnd() < (seen ? 0.85 : 0.7);
          p = P.recordProblem(p, it.id, { solved: ok, clean: ok, quick: ok && rnd() < 0.3 }, now);
        }
      }
      // A new place every day whatever the backlog reached 130 due and waits of 160 days at size 3.
      assert.ok(max <= 2 * limit + 6, `limit ${limit}: backlog reached ${max}`);
      assert.ok(longest <= 10, `limit ${limit}: a review waited ${longest.toFixed(1)} days`);
      assert.ok(fresh >= 30 * limit, `limit ${limit}: only ${fresh} new problems in 240 days`);
    }
  });

  await test("model review load: due today, the backlog, what is learning and mastered — and mastery per theme", () => {
    assert.deepEqual(P.reviewLoad(P.newProfile(), NOW), { due: 0, overdue: 0, drills: 0, reviewed: 0, mastered: 0, learning: 0, newSeen: 0 });
    const ids = PROBLEMS.slice(0, 40).map((x) => x.id);
    const problems = {};
    // 20 overdue, 5 scheduled later (learning), 4 known for a month, 1 retired, 2 met today.
    ids.slice(0, 20).forEach((id) => (problems[id] = { tries: 2, solved: true, clean: true, streak: 1, s: 3, d: 5, reps: 2, lapses: 0, rating: 3, last: NOW - 9 * DAY, due: NOW - 5 * DAY }));
    ids.slice(20, 25).forEach((id) => (problems[id] = { tries: 2, solved: true, clean: true, streak: 2, s: 9, d: 5, reps: 2, lapses: 0, rating: 3, last: NOW - 2 * DAY, due: NOW + 7 * DAY }));
    ids.slice(25, 29).forEach((id) => (problems[id] = { tries: 4, solved: true, clean: true, streak: 4, s: 30, d: 4, reps: 4, lapses: 0, rating: 3, last: NOW - 3 * DAY, due: NOW + 27 * DAY }));
    problems[ids[29]] = { tries: 6, solved: true, clean: true, streak: 6, s: 200, d: 3, reps: 6, lapses: 0, rating: 3, last: NOW - 30 * DAY, due: 0, retired: true };
    let p = P.normalizeProfile({ ...P.newProfile(), problems, mistakes: [{ id: "d1", theme: "cut", due: NOW - DAY, added: NOW - 2 * DAY, tries: 1, streak: 0 }] });
    p = P.recordProblem(p, ids[30], { solved: true, clean: true }, NOW - 1000);
    p = P.recordProblem(p, ids[31], { solved: false }, NOW - 500);
    const before = JSON.stringify(p);
    const load = P.reviewLoad(p, NOW);
    assert.equal(JSON.stringify(p), before, "pure");
    assert.deepEqual(load, { due: P.MEMORY.REVIEW_CAP, overdue: 21, drills: 1, reviewed: 0, mastered: 5, learning: 27, newSeen: 2 });
    // Reviews done today come off what is still offered today.
    let later = p;
    for (const id of ids.slice(0, 10)) later = P.recordProblem(later, id, { solved: true, clean: true }, NOW);
    assert.deepEqual([P.reviewLoad(later, NOW).due, P.reviewLoad(later, NOW).overdue, P.reviewLoad(later, NOW).reviewed], [2, 11, 10]);
    // A mastered problem missed is learning again.
    assert.equal(P.isMastered({ tries: 5, s: 40, rating: P.RATING.GOOD }), true);
    assert.equal(P.isMastered({ tries: 5, s: 40, rating: P.RATING.AGAIN }), false);
    assert.equal(P.isMastered({ tries: 1, s: 3.7, rating: P.RATING.GOOD }), false);
    assert.equal(P.isMastered(undefined), false);
    // Per theme: every problem is counted once, in one of the three.
    const by = P.masteryByTheme(p, PROBLEMS, GRADES);
    let total = 0;
    for (const [theme, row] of Object.entries(by)) {
      assert.equal(row.mastered + row.learning + row.unseen, row.total, theme);
      assert.ok(row.grades[0] >= 1 && row.grades[1] <= 5 && row.grades[0] <= row.grades[1], theme);
      total += row.total;
    }
    assert.equal(total, PROBLEMS.length);
    assert.equal(Object.values(by).reduce((s, r) => s + r.mastered, 0), 5);
    assert.equal(Object.values(by).reduce((s, r) => s + r.learning, 0), 27);
    for (const theme of new Set(PROBLEMS.map((d) => d.theme).filter(Boolean))) assert.ok(by[theme], theme);
    const none = P.masteryByTheme(P.newProfile(), PROBLEMS, GRADES);
    assert.ok(Object.values(none).every((r) => r.unseen === r.total && !r.mastered && !r.learning));
    assert.deepEqual(P.masteryByTheme(p, [], GRADES), {});
  });

  /* ------------------------------------------------ the rating, honestly */

  const game = (id, extra = {}) => ({ id, at: NOW + Number(id) * 1000, size: 19, level: "10k", won: true, moves: 120, ...extra });

  await test("model rating: a game with an undo or a hint is kept but never moves the rating", () => {
    const p0 = P.newProfile({ rank: 12 });
    const clean = P.recordGame(p0, game("1"));
    assert.equal(clean.games[0].rated, true);
    assert.equal(clean.games[0].assisted, undefined);
    assert.equal(clean.history.length, 1);
    for (const help of [{ undos: 1 }, { hints: 2 }, { undos: 3, hints: 1 }]) {
      const p = P.recordGame(p0, game("1", help));
      const rec = p.games[0];
      assert.equal(rec.assisted, true, JSON.stringify(help));
      assert.equal(rec.rated, false);
      assert.equal(rec.rating, null);
      assert.deepEqual(p.rating, p0.rating, "the estimate is where it was");
      assert.deepEqual(p.history, []);
      assert.equal(rec.undos || 0, help.undos || 0);
      assert.equal(rec.hints || 0, help.hints || 0);
      assert.equal(P.estimate(p).games, 0);
    }
    assert.equal(P.recordGame(p0, game("1", { undos: 0, hints: 0 })).games[0].rated, true, "zero of both is a plain game");
    // It stays in the list and its analysis is evidence for the focus all the same.
    const phases = { opening: { loss: 2 }, middle: { loss: 9 }, endgame: { loss: 2 } };
    let p = p0;
    for (const id of ["1", "2", "3"]) {
      p = P.recordGame(p, game(id, { undos: 1 }));
      p = P.recordGame(p, { id, confidence: "high", phases, themes: { cut: 2 }, themeLoss: { cut: 8 }, moveRank: { rank: 3, lo: 1, hi: 5, n: 60 } });
    }
    assert.equal(p.games.length, 3);
    assert.ok(p.games.every((g) => g.assisted && !g.rated && g.phases), "the analysis merges into the assisted record");
    assert.deepEqual(p.rating, p0.rating, "nor do its moves count as a reading of the player");
    assert.deepEqual(P.evidence(p, { ...content, now: NOW + DAY }).focus.map((a) => a.key), ["cut"]);
    // Through the store and back: still assisted, still unrated on a later record of the same game.
    const back = P.normalizeProfile(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(back, p);
    assert.equal(P.recordGame(back, game("3")).games.find((g) => g.id === "3").rated, false, "once assisted, always");
  });

  await test("model rating history: one point per rated game with the rating and its spread; older points read from their rank", () => {
    assert.deepEqual(P.ratingHistory(P.newProfile()), []);
    let p = P.newProfile({ rank: 12 });
    for (let i = 1; i <= 4; i++) p = P.recordGame(p, game(String(i), { won: i % 2 === 1, size: i === 4 ? 9 : 19 }));
    p = P.recordGame(p, game("5", { undos: 1 }));
    const h = P.ratingHistory(p);
    assert.equal(h.length, 4, "the assisted game adds no point");
    assert.deepEqual(Object.keys(h[0]).sort(), ["pm", "rank", "rating", "sd", "size", "t"]);
    for (let i = 1; i < h.length; i++) assert.ok(h[i].t > h[i - 1].t, "oldest first");
    const last19 = P.ratingHistory(p, 19).at(-1);
    assert.equal(P.ratingHistory(p, 19).length, 3);
    assert.equal(last19.rating, p.games.find((g) => g.id === "3").rating.after, "the GoR after that game");
    assert.ok(last19.sd > 50 && last19.sd < 400, `sd ${last19.sd}`);
    assert.ok(h[0].sd > h[2].sd, "the spread narrows with games");
    // A point from before the GoR was kept: the middle of its rank, ± its ranks.
    const old = P.normalizeProfile({ ...P.newProfile(), history: [{ at: 5, size: 19, rank: 12, pm: 2 }] });
    assert.deepEqual(P.ratingHistory(old), [{ t: 5, size: 19, rating: P.rankToRating(12), sd: 200, rank: 12, pm: 2 }]);
    // At most 200 points.
    let long = P.newProfile({ rank: 12 });
    for (let i = 1; i <= 205; i++) long = P.recordGame(long, game(String(i)));
    assert.equal(P.ratingHistory(long).length, P.MAX_HISTORY);
  });

  /* ------------------------------------------- practice days, milestones */

  await test("model practice days: the last 28 local days, counting games finished and problems tried", () => {
    assert.deepEqual(P.practiceDays(P.newProfile(), NOW), Array(28).fill(0));
    let p = P.newProfile({ rank: 12 });
    p = P.recordProblem(p, "a", { solved: true }, NOW - 1000);
    p = P.recordProblem(p, "b", { solved: false }, NOW - 500);
    p = P.recordProblem(p, "b", { late: true }, NOW - 400); // the same attempt put right: not another
    p = P.recordGame(p, { ...game("1"), at: NOW - 3 * DAY });
    p = P.recordGame(p, { id: "1", confidence: "low", phases: {} }); // the analysis arriving: not another game
    p = P.addMistake(p, { gameId: "1", index: 20, theme: "cut" }, NOW - 3 * DAY);
    p = P.recordMistake(p, "1-20", { solved: true }, NOW - 2 * DAY);
    p = P.recordLesson(p, "stones-capture", { done: true }, NOW - 10 * DAY); // a lesson alone is not counted
    const days = P.practiceDays(p, NOW);
    assert.equal(days.length, 28);
    assert.deepEqual(days.slice(-4), [1, 1, 0, 2], "oldest first, today last");
    assert.ok(days.slice(0, 24).every((n) => n === 0));
    assert.deepEqual(P.practiceDays(p, NOW, 7).length, 7);
    assert.deepEqual(P.practiceDays(p, NOW + DAY).slice(-5), [1, 1, 0, 2, 0], "tomorrow, today moves one back");
    // Local days: just before and just after midnight are two days.
    const midnight = new Date(2026, 10, 12, 0, 0, 0).getTime();
    let q = P.recordProblem(P.newProfile(), "a", { solved: true }, midnight - 60000);
    q = P.recordProblem(q, "c", { solved: true }, midnight + 60000);
    assert.deepEqual(P.practiceDays(q, midnight + 120000, 2), [1, 1]);
    // Through the store; bad entries are dropped; only about a year is kept.
    assert.deepEqual(P.normalizeProfile(JSON.parse(JSON.stringify(p))).days, p.days);
    assert.deepEqual(P.normalizeProfile({ ...p, days: { 20261111: 2, nope: 3, 20261110: -1, 20261109: "x" } }).days, { 20261111: 2 });
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [String(20000101 + i), 1]));
    assert.equal(Object.keys(P.normalizeProfile({ ...p, days: many }).days).length, P.MAX_DAYS_KEPT);
    // A profile from before the days were kept: read from what it still has.
    const old = P.normalizeProfile({ ...p, days: {} });
    assert.deepEqual(P.practiceDays(old, NOW).slice(-4).map((n) => n > 0), [true, true, false, true]);
  });

  await test("model milestones: first games, units, levels and mastered counts, each once, with the time it was reached", () => {
    assert.deepEqual(P.milestones(P.newProfile()), []);
    const all = { ...content, course: COURSE, settings: PLAYER };
    let p = P.newProfile({ rank: 12 });
    p = P.recordGame(p, { ...game("1"), size: 9, at: NOW - 5 * DAY });
    assert.deepEqual(P.milestones(p, all, NOW), [{ key: "firstGame", at: NOW - 5 * DAY }]);
    p = P.recordGame(p, { ...game("2"), at: NOW - 4 * DAY });
    p = P.recordGame(p, { ...game("3"), at: NOW - 3 * DAY });
    assert.deepEqual(P.milestones(p, all, NOW), [{ key: "firstGame", at: NOW - 5 * DAY }, { key: "first19", at: NOW - 4 * DAY }]);
    // They outlive the list of the newest 30 games.
    let long = p;
    for (let i = 10; i < 50; i++) long = P.recordGame(long, { ...game(String(i)), at: NOW + i });
    assert.equal(long.games.length, P.MAX_GAMES);
    assert.equal(P.milestones(long, all, NOW + DAY)[0].at, NOW - 5 * DAY);
    // A unit: every lesson of it done; the time of the last one.
    const unit = COURSE[0];
    unit.lessons.forEach((l, i) => (p = P.recordLesson(p, l.id, { done: i < unit.lessons.length - 1 }, NOW - 2 * DAY + i)));
    assert.ok(!P.milestones(p, all, NOW).some((m) => m.key === "unit"), "one lesson short");
    p = P.recordLesson(p, unit.lessons.at(-1).id, { done: true }, NOW - DAY);
    assert.deepEqual(P.milestones(p, all, NOW).find((m) => m.key === "unit"), { key: "unit", id: unit.id, at: NOW - DAY });
    // A solving level measured on a grade (the rank's own grade and below need no results).
    for (const g of [3, 4]) for (const id of ofGrade(g, 5)) p = P.recordProblem(p, id, { solved: true, clean: true }, NOW - DAY);
    const levels = P.milestones(p, all, NOW).filter((m) => m.key === "level");
    assert.deepEqual(levels.map((m) => [m.n, m.at]), [[2, null], [3, null], [4, null]], "reached, the time not kept yet");
    // Mastered counts.
    const known = Object.fromEntries(PROBLEMS.slice(100, 112).map((x) => [x.id, { tries: 4, solved: true, clean: true, streak: 4, s: 40, d: 4, reps: 4, lapses: 0, rating: 3, last: NOW - DAY, due: NOW + 30 * DAY }]));
    p = P.normalizeProfile({ ...p, problems: { ...p.problems, ...known } });
    assert.deepEqual(P.milestones(p, all, NOW).filter((m) => m.key === "mastered").map((m) => m.n), [10]);
    // keepMilestones stamps what is new, once.
    const kept = P.keepMilestones(p, all, NOW);
    assert.deepEqual(kept.fresh.map(P.milestoneKey).sort(), ["level:2", "level:3", "level:4", "mastered:10", "unit:" + unit.id].sort());
    assert.ok(kept.fresh.every((m) => m.at != null));
    assert.equal(kept.profile.marks["level:4"], NOW);
    assert.equal(kept.profile.marks["unit:" + unit.id], NOW - DAY, "a known time is kept, not replaced by now");
    const again = P.keepMilestones(kept.profile, all, NOW + DAY);
    assert.deepEqual(again.fresh, []);
    assert.equal(again.profile, kept.profile, "nothing new: the same profile, no save needed");
    const list = P.milestones(kept.profile, all, NOW + DAY);
    assert.ok(list.every((m) => m.at != null));
    for (let i = 1; i < list.length; i++) assert.ok(list[i].at >= list[i - 1].at, "oldest first");
    assert.equal(new Set(list.map(P.milestoneKey)).size, list.length, "each once");
    // Once reached, a level stays reached, even without the content at hand.
    assert.deepEqual(P.milestones(kept.profile).filter((m) => m.key === "level").map((m) => m.n), [2, 3, 4]);
    assert.deepEqual(P.normalizeProfile(JSON.parse(JSON.stringify(kept.profile))).marks, kept.profile.marks, "through the store");
    assert.deepEqual(P.normalizeProfile({ ...p, marks: { firstGame: 5, bad: "x" } }).marks, { firstGame: 5 });
  });
}
