/**
 * v7 tests: plan. Loaded by scripts/test.mjs (every file in scripts/tests/,
 * in name order); receives the runner's helpers.
 */
import fs from "node:fs";
import path from "node:path";

export default async function ({ test, assert, root }) {
  const P = await import("../../src/web/js/app/plan.js");
  const persist = await import("../../src/web/js/persist.js");
  const { PROBLEMS } = await import("../../src/web/js/content/problems.js");
  const { COURSE } = await import("../../src/web/js/content/course.js");
  const { MESSAGES } = await import("../../src/web/js/messages.js");
  const GRADES = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));
  const DAY = persist.DAY;
  const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime(); // a Wednesday
  const opts = { problems: PROBLEMS, grades: GRADES, now: NOW };

  const phases = (end = 2, mid = 6, high = true) => ({ opening: { loss: 2, mistakes: 0, blunders: 0, moves: 20 }, middle: { loss: mid, mistakes: 1, blunders: 0, moves: 60 }, endgame: { loss: end, mistakes: 0, blunders: 0, moves: 40 }, high });
  const game = (i, { themes = {}, themeLoss, end, mid, confidence = "high", ago = i } = {}) => {
    const ph = phases(end, mid);
    delete ph.high;
    return { id: "g" + i, at: NOW - ago * DAY - 1000, size: 19, color: 1, won: false, moves: 200, confidence, phases: ph, themes, ...(themeLoss ? { themeLoss } : {}) };
  };
  const progress = (extra = {}) => ({ lessons: {}, problems: {}, mistakes: [], games: [], weakness: {}, daily: null, ...extra });

  await test("v7 plan: no data, no claims, no plan for today's five", () => {
    const m = P.playerModel(progress(), opts);
    assert.equal(m.status, "none");
    assert.deepEqual(m.focus, []);
    assert.equal(m.games.needed, P.RULES.MIN_GAMES);
    assert.equal(P.planDaily({ progress: progress(), model: m, pool: PROBLEMS, grades: GRADES, now: NOW }), null);
  });

  await test("v7 plan: two games are not enough, however costly", () => {
    const games = [0, 1].map((i) => game(i, { themes: { cut: 3 }, themeLoss: { cut: 20 } }));
    const m = P.playerModel(progress({ games }), opts);
    assert.equal(m.status, "notEnough");
    assert.equal(m.games.needed, 1);
    assert.deepEqual(m.focus, []);
  });

  await test("v7 plan: points lost to one theme over six games become the focus, with the evidence", () => {
    const games = [0, 1, 2, 3, 4, 5].map((i) => game(i, { themes: { cut: 1, ...(i === 2 ? { ladder: 1 } : {}) }, themeLoss: { cut: 3, ...(i === 2 ? { ladder: 9 } : {}) } }));
    const m = P.playerModel(progress({ games }), opts);
    assert.equal(m.status, "focus");
    assert.deepEqual(m.focus.map((a) => a.key), ["cut"], "a theme from a single game is not claimed");
    const cut = m.focus[0];
    assert.equal(cut.games.points, 18);
    assert.equal(cut.games.games, 6);
    assert.deepEqual(P.evidenceOf(cut), [{ key: "plan.why.points", params: ["18", 6] }]);
    const ladder = m.areas.find((a) => a.key === "ladder");
    assert.equal(ladder.claim, false);
  });

  await test("v7 plan: records without points say how often, and race-shared counts as race", () => {
    const games = [0, 1, 2].map((i) => game(i, { themes: { "race-shared": 1, ...(i < 2 ? { "race-outside": 0 } : {}) } }));
    games[0].themes["race-shared"] = 2;
    const m = P.playerModel(progress({ games }), opts);
    const race = m.focus.find((a) => a.key === "race");
    assert.ok(race, "race claimed");
    assert.equal(race.games.points, null);
    assert.deepEqual(P.evidenceOf(race), [{ key: "plan.why.times", params: [4, 3] }]);
  });

  await test("v7 plan: recent games weigh more, old games drop out", () => {
    const recentCut = [0, 1, 2].map((i) => game(i, { themes: { cut: 1 }, themeLoss: { cut: 7 } }));
    const olderKo = [3, 4, 5, 6, 7, 8, 9].map((i) => game(i, { themes: { ko: 1 }, themeLoss: { ko: 6 } }));
    const m = P.playerModel(progress({ games: [...recentCut, ...olderKo] }), opts);
    // Per point lost, the three newest games count for more than the seven before them.
    const cut = m.areas.find((a) => a.key === "cut");
    const ko = m.areas.find((a) => a.key === "ko");
    assert.ok(cut.games.weight / 21 > ko.games.weight / 42, "a recent point weighs more than an older one");
    // Games older than the window are ignored entirely.
    const stale = [0, 1, 2, 3].map((i) => game(i, { themes: { cut: 2 }, themeLoss: { cut: 10 }, ago: P.RULES.WINDOW_DAYS + 1 + i }));
    const s = P.playerModel(progress({ games: stale }), opts);
    assert.equal(s.games.analysed, 0);
    assert.deepEqual(s.focus, []);
  });

  await test("v7 plan: the endgame focus needs KataGo games where the endgame dominates", () => {
    const games = [0, 1, 2].map((i) => game(i, { end: 9, mid: 3 }));
    const m = P.playerModel(progress({ games }), opts);
    const eg = m.focus.find((a) => a.key === "endgame");
    assert.ok(eg, "endgame claimed");
    assert.equal(eg.endgame.perGame, 9);
    assert.deepEqual(P.evidenceOf(eg)[0], { key: "plan.why.lateGame", params: ["9", 3] });
    const low = P.playerModel(progress({ games: games.map((g) => ({ ...g, confidence: "low" })) }), opts);
    assert.ok(!low.focus.some((a) => a.key === "endgame"), "the offline estimate never claims the endgame");
  });

  const cutProblems = PROBLEMS.filter((p) => p.theme === "cut");
  const entry = (solved, streak, ago = 1) => ({ solved, attempts: 1, streak, due: NOW + DAY, last: NOW - ago * DAY });

  await test("v7 plan: missed problems of one theme are a focus; a generally hard time is not", () => {
    const problems = {};
    cutProblems.slice(0, 5).forEach((p, i) => (problems[p.id] = entry(i === 0, i === 0 ? 1 : 0)));
    const m = P.playerModel(progress({ problems }), opts);
    const cut = m.focus.find((a) => a.key === "cut");
    assert.ok(cut, "cut claimed from problems");
    assert.deepEqual(P.evidenceOf(cut), [{ key: "plan.why.problems", params: [4, 5] }]);
    // Three problems are too few.
    const few = {};
    cutProblems.slice(0, 3).forEach((p) => (few[p.id] = entry(false, 0)));
    assert.deepEqual(P.playerModel(progress({ problems: few }), opts).focus, []);
    // Missing everything everywhere: no theme stands out.
    const all = {};
    for (const p of PROBLEMS.filter((x) => ["cut", "ladder", "ko"].includes(x.theme)).slice(0, 30)) all[p.id] = entry(false, 0);
    const flat = P.playerModel(progress({ problems: all }), opts);
    assert.ok(flat.problems.tried >= 10);
    assert.deepEqual(flat.focus, [], "the miss rate must be clearly above the player's usual");
    // Results older than the window do not count.
    const old = {};
    cutProblems.slice(0, 5).forEach((p) => (old[p.id] = entry(false, 0, P.RULES.PROBLEM_WINDOW_DAYS + 2)));
    assert.equal(P.playerModel(progress({ problems: old }), opts).status, "none");
  });

  await test("v7 plan: mistake drills from your games count as evidence", () => {
    const mistakes = [0, 1, 2, 3].map((i) => ({ id: "d" + i, theme: "ladder", attempts: 1, streak: 0, due: NOW - i * DAY + DAY, added: NOW - 10 * DAY }));
    const m = P.playerModel(progress({ mistakes }), opts);
    assert.deepEqual(m.focus.map((a) => a.key), ["ladder"]);
    assert.equal(P.drillLast({ streak: 2, due: NOW + 3 * DAY }), NOW);
  });

  await test("v7 plan: solving level from clean solves per grade", () => {
    const r = (grade, miss) => ({ grade, miss });
    assert.equal(P.solvingLevel([]), null);
    assert.equal(P.solvingLevel([r(1, false), r(1, true)]), null);
    assert.equal(P.solvingLevel([r(1, true), r(1, true), r(1, true)]), 1);
    assert.equal(P.solvingLevel([r(1, false), r(1, false), r(1, true), r(2, false), r(2, false), r(2, false), r(3, true), r(3, true), r(3, false)]), 2);
  });

  const cutGames = () => [0, 1, 2, 3].map((i) => game(i, { themes: { cut: 1, ko: i < 2 ? 1 : 0 }, themeLoss: { cut: 4, ko: i < 2 ? 5 : 0 } }));

  await test("v7 plan: today's five — reviews first, focus problems at the level, one stretch, stable", () => {
    // Level 2: clean at grades 1–2 (on themes outside the focus).
    const problems = {};
    for (const g of [1, 2]) for (const p of PROBLEMS.filter((x) => x.theme === "atari" && GRADES[x.id]?.grade === g).slice(0, 3)) problems[p.id] = { solved: true, attempts: 1, streak: 1, due: NOW + 3 * DAY, last: NOW - DAY };
    const due = PROBLEMS.find((x) => x.theme === "net");
    problems[due.id] = { solved: true, attempts: 2, streak: 0, due: NOW - 1000, last: NOW - DAY };
    const mistakes = [{ id: "m1", theme: "cut", attempts: 0, streak: 0, due: NOW - 1000, added: NOW - 2 * DAY }];
    const pr = progress({ games: cutGames(), problems, mistakes });
    const model = P.playerModel(pr, opts);
    assert.deepEqual(model.focus.map((a) => a.key), ["cut", "ko"]);
    assert.equal(model.problems.level, 2);
    const items = P.planDaily({ progress: pr, model, pool: PROBLEMS, grades: GRADES, now: NOW });
    assert.equal(items.length, 5);
    assert.equal(new Set(items.map((i) => i.id)).size, 5, "no duplicates");
    assert.deepEqual(items[0], { kind: "m", id: "m1", role: "review", why: "cut" }, "a due drill from your own game first");
    assert.deepEqual(items[1], { kind: "p", id: due.id, role: "review" });
    const focus = items.filter((i) => i.role === "focus");
    assert.equal(focus.length, 2);
    assert.deepEqual(focus.map((i) => i.why), ["cut", "ko"], "the two focuses take turns");
    for (const it of focus) {
      const g = GRADES[it.id].grade;
      assert.ok(g >= 2 && g <= 3, `${it.id} grade ${g} is around the level`);
    }
    const stretch = items.filter((i) => i.role === "stretch");
    assert.equal(stretch.length, 1);
    assert.equal(GRADES[stretch[0].id].grade, 4, "stretch is two grades up");
    assert.ok(["cut", "ko"].includes(stretch[0].why));
    const again = P.planDaily({ progress: pr, model, pool: PROBLEMS, grades: GRADES, now: NOW + 3600000 });
    assert.deepEqual(again, items, "stable for the day");
  });

  await test("v7 plan: this week's focus keeps to the evidence from before Monday", () => {
    const week = new Date(2026, 10, 2).getTime(); // Monday
    const before = [3, 4, 5, 6].map((i) => game(i, { themes: { cut: 1 }, themeLoss: { cut: 5 } }));
    const thisWeek = [0, 0.5, 1].map((d, i) => ({ ...game(10 + i, { themes: { ko: 3 }, themeLoss: { ko: 20 } }), at: NOW - d * DAY - 1000 }));
    const w = P.weeklyModel(progress({ games: [...thisWeek, ...before] }), { ...opts, weekStart: week });
    assert.deepEqual(w.focus.map((a) => a.key), ["cut"]);
    assert.equal(w.since, week);
    // Without a focus at the start of the week, this week's evidence counts.
    const fresh = P.weeklyModel(progress({ games: thisWeek }), { ...opts, weekStart: week });
    assert.deepEqual(fresh.focus.map((a) => a.key), ["ko"]);
    assert.equal(fresh.since, null);
  });

  await test("v7 plan: a focus from problems survives reviewing those problems during the week", () => {
    const week = new Date(2026, 10, 2).getTime(); // Monday
    const cuts = PROBLEMS.filter((p) => p.theme === "cut").slice(0, 6);
    assert.ok(cuts.length >= 5, "enough cutting problems");
    // Last week: every cutting problem missed.
    const missed = Object.fromEntries(cuts.map((p) => [p.id, { solved: false, attempts: 1, streak: 0, last: week - 2 * DAY, due: week }]));
    const pr = progress({ problems: missed });
    const first = P.weeklyModel(pr, { ...opts, weekStart: week });
    assert.deepEqual(first.focus.map((a) => a.key), ["cut"]);
    const keep = P.weekToKeep(pr, first, week);
    assert.equal(keep.weekStart, week);
    pr.planWeek = keep;
    assert.equal(P.weekToKeep(pr, first, week), null, "stored once per week");
    // This week: most of them reviewed and solved, which overwrites `last`.
    for (const p of cuts.slice(0, 4)) pr.problems[p.id] = { solved: true, clean: true, attempts: 2, streak: 1, last: NOW - 1000, due: NOW + 3 * DAY };
    const later = P.weeklyModel(pr, { ...opts, weekStart: week });
    assert.deepEqual(later.focus.map((a) => a.key), ["cut"], "the week's focus stays");
    assert.equal(later.since, week);
    // Next week the stored focus no longer applies.
    const next = P.weeklyModel(pr, { ...opts, now: NOW + 7 * DAY, weekStart: week + 7 * DAY });
    assert.notEqual(next.since, week);
  });

  await test("v7 plan: records keep what each theme cost", () => {
    assert.deepEqual(P.themeLosses([{ theme: "cut", loss: 3.24, move: { color: 1 } }, { theme: "cut", loss: 2, move: { color: 1 } }, { theme: "ko", loss: 9, move: { color: -1 } }, { theme: null, loss: 5, move: { color: 1 } }], 1), { cut: 5.2 });
    const rec = persist.normalizeGameRecord({ at: NOW, size: 19, themes: { cut: 2 }, themeLoss: { cut: 5.2, bad: "x" } });
    assert.deepEqual(rec.themeLoss, { cut: 5.2 });
    assert.equal("themeLoss" in persist.normalizeGameRecord({ at: NOW, size: 19 }), false, "older records are unchanged");
  });

  await test("v7 plan: every focus links to a lesson that exists and a topic with problems", () => {
    const lessons = new Set(COURSE.flatMap((u) => u.lessons.map((l) => l.id)));
    for (const [key, ids] of Object.entries(P.FOCUS_LESSONS)) for (const id of ids) assert.ok(lessons.has(id), `${key}: ${id}`);
    const keys = new Set([...PROBLEMS.map((p) => P.focusKey(p.theme)), "race", "endgame", "ladder", "cut", "ko", "vital-point", "eye-space", "snapback", "double-atari", "race-outside"]);
    for (const key of keys) {
      if (!key) continue;
      const { topic, theme } = P.focusTopic(key, PROBLEMS);
      const list = PROBLEMS.filter((p) => p.topic === topic && (!theme || p.theme === theme));
      assert.ok(list.length > 0, `${key} → ${topic}/${theme}`);
    }
    assert.equal(P.focusLesson("ko", (id) => id === "stones-ko"), "adv-life-ko");
    assert.equal(P.focusLesson("nothing"), null);
  });

  await test("v7 plan: strings in four languages", () => {
    const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("plan."));
    assert.ok(keys.length >= 8);
    for (const k of keys) for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(MESSAGES[k][lang], `${k} ${lang}`);
    for (const k of ["plan.why.points", "plan.why.times", "plan.why.lateGame", "plan.why.problems"]) for (const lang of ["zh", "en", "ko", "ja"]) assert.ok(MESSAGES[k][lang].includes("{0}") && MESSAGES[k][lang].includes("{1}"), `${k} ${lang}`);
  });

  await test("v7 plan: practice-ctl's daily hook — the plan chooses with evidence, the old choice without", async () => {
    const esbuild = await import("esbuild");
    const out = await esbuild.build({
      stdin: {
        contents: ['export * as C from "./src/web/js/app/practice-ctl.js";', 'export * as Plan from "./src/web/js/app/plan-ctl.js";', 'export { state } from "./src/web/js/app/store.js";', 'export * as P from "./src/web/js/persist.js";'].join("\n"),
        resolveDir: root,
        loader: "js",
      },
      bundle: true,
      format: "esm",
      platform: "neutral",
      mainFields: ["module", "main"],
      loader: { ".json": "json" },
      write: false,
      logLevel: "error",
    });
    const { C, Plan, state, P: S } = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
    state.settings = { ...S.DEFAULT_SETTINGS, experience: "player" };
    state.progress = { ...S.loadProgress(), games: [] };
    const now = Date.now();
    const plain = C.buildDaily(now);
    assert.equal(plain.length, 5);
    assert.ok(plain.every((i) => !i.role), "no evidence: the existing choice");
    assert.equal(Plan.trainingFocus(now).status, "none");
    state.progress.games = [0, 1, 2, 3].map((i) => ({ ...game(i, { themes: { cut: 1 }, themeLoss: { cut: 5 } }), at: now - (i + 8) * DAY }));
    const f = Plan.trainingFocus(now);
    assert.equal(f.status, "focus");
    assert.equal(f.items[0].key, "cut");
    assert.equal(f.items[0].topic, "connect");
    assert.equal(f.items[0].lesson, "connect-cut");
    assert.match(f.items[0].why, /20/);
    const planned = C.buildDaily(now);
    assert.equal(planned.length, 5);
    const focus = planned.filter((i) => i.role === "focus");
    assert.ok(focus.length >= 2 && focus.every((i) => i.why === "cut"));
    // A beginner's pool has no cutting problems yet: the easiest from the bank.
    for (const i of focus) assert.equal(GRADES[i.id].grade, 1, i.id);
    assert.equal(planned.filter((i) => i.role === "stretch").length, 1);
    Plan.openFocusProblems(f.items[0]);
    assert.equal(state.practice.view, "topic");
    assert.equal(state.practice.topic, "connect");
    assert.equal(state.practice.theme, "cut");
  });
}
