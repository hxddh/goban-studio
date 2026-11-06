/**
 * Learn: today's session (learn/session.js) — starting the path plays its
 * items in order; finishing one moves to the next, through a lesson and the
 * capture Go it leads to, a drill of your own mistake, problems and the
 * first 9×9 game, to a quiet "done for today". Run in Node on the
 * controllers, with the content in memory.
 */
import { test, assert, bundle, sleep } from "./helpers.mjs";

const A = await bundle([
  'export * as C from "./src/web/js/app/controller.js";',
  'export { state } from "./src/web/js/app/store.js";',
  'export { DEFAULT_SETTINGS } from "./src/web/js/data/settings.js";',
  'export * as PM from "./src/web/js/model/player.js";',
  'export { COURSE } from "./src/web/js/content/course.js";',
  'export { setLang } from "./src/web/js/i18n.js";',
]);
const { C, state, PM, COURSE } = A;
const IDS = COURSE.flatMap((u) => u.lessons.map((l) => l.id));

/** A beginner who has done every lesson before `id`, with one drill of their own due. */
function beginner(id, extra = {}) {
  state.settings = { ...A.DEFAULT_SETTINGS, lang: "en", onboarded: true, experience: "new", playerRank: 30, captureWins: 0, ...extra };
  let p = PM.newProfile({ rank: 30 });
  for (const l of IDS.slice(0, IDS.indexOf(id))) p = PM.recordLesson(p, l, { done: true }, Date.now() - 86400000);
  // A moment of a 9×9 game: Black played 3 at A1; C3 (2,2)... the better move is E5.
  p = PM.addMistake(p, { gameId: "g", index: 3, theme: "atari", color: 1, size: 9, loss: 4, sgf: "(;GM[1]FF[4]SZ[9];B[cc];W[gg];B[aa])", played: { x: 0, y: 0 }, best: { x: 4, y: 4 } }, Date.now() - 1000);
  state.profile = p;
  state.space = "learn";
  state.learn = { view: "home", topic: null, lesson: null, problem: null, daily: null };
  C.resetSession();
}

/** Finish the open lesson: every step continued. */
function finishLesson() {
  const L = state.learn.lesson;
  for (let i = L.index; i < L.lesson.steps.length; i++) C.lessonContinue();
  assert.equal(state.learn.lesson.finished, true);
}

/** Show the answer of the open problem. */
function giveUp() {
  assert.equal(state.learn.view, "problem");
  C.showAnswer();
}

const keyNow = () => state.learn.daily?.current;

try {
  await test("learn session: Back to an item of today's session reopens it inside the session", async () => {
    beginner("stones-capture");
    C.setRestorer(C.restore); // what boot installs
    C.startPath();
    const key = keyNow();
    assert.equal(state.learn.view, "lesson");
    C.goSpace("play");
    assert.equal(state.space, "play");
    assert.equal(C.back(), true);
    await sleep(0);
    assert.equal(state.space, "learn");
    assert.equal(state.learn.view, "lesson");
    assert.ok(state.learn.daily, "inside the session");
    assert.equal(keyNow(), key);
  });

  await test("learn session: a restart keeps what is done today; another day starts afresh", async () => {
    beginner("stones-capture");
    C.startPath();
    const first = keyNow();
    assert.ok(first, "an item is open");
    C.continuePath();
    const done = [...state.learn.daily.done];
    assert.ok(done.includes(first), "the first item is done");
    // A restart: memory is gone, the store keeps the session.
    C.resetSession({ keepStored: true });
    const again = C.todaysSession();
    assert.ok(again, "today's session is back");
    assert.deepEqual(again.done, done, "with what was done");
    // Tomorrow: the stored session is another day's.
    C.resetSession({ keepStored: true });
    assert.equal(C.todaysSession(Date.now() + 86400000), null);
  });

  await test("learn session: the path plays as one session — lesson, capture Go, your drill, problems — then done for today", async () => {
    beginner("stones-capture");
    const path0 = C.learnPath();
    assert.deepEqual(path0.slice(0, 2).map((i) => i.kind), ["lesson", "mistake"], "the lesson, then the drill due");
    assert.equal(path0[0].id, "stones-capture");
    let home = C.pathNow();
    assert.equal(home.started, false);
    assert.deepEqual(home.items, path0);

    // Start: the first item, the lesson, in the session.
    C.startPath();
    assert.equal(state.learn.view, "lesson");
    assert.equal(keyNow(), "lesson:stones-capture");
    assert.deepEqual(C.sessionPlace(), { n: 1, total: path0.length });
    finishLesson();
    // The lesson is done and the capture Go it leads to joins the session, next.
    const s = C.todaysSession();
    assert.ok(s.done.includes("lesson:stones-capture"));
    assert.equal(s.items[1].kind, "capture");
    assert.equal(C.upNext().kind, "capture");

    // Continue: capture Go. A win ends it and marks it done.
    C.continuePath();
    assert.equal(state.learn.view, "capture");
    assert.ok(state.learn.daily, "capture Go is part of the session");
    const K = state.learn.capture;
    K.game.setup([{ x: 4, y: 4, c: -1 }, { x: 3, y: 4, c: 1 }, { x: 5, y: 4, c: 1 }, { x: 4, y: 3, c: 1 }], 1);
    C.capturePlay(4, 5);
    assert.equal(K.over?.winner, 1);
    assert.ok(C.todaysSession().done.includes("capture"));
    assert.equal(state.settings.captureWins, 1);

    // Continue: the drill from your own game.
    C.continuePath();
    assert.equal(state.learn.view, "mistake");
    assert.equal(keyNow(), "mistake:g-3");
    C.practicePlay(4, 4);
    assert.equal(state.learn.mistake.status, "right");
    assert.ok(C.todaysSession().done.includes("mistake:g-3"));
    assert.ok(state.profile.mistakes.find((m) => m.id === "g-3").due > Date.now(), "rescheduled");

    // Continue: the problems, one after another (the answer shown counts as done when you go on).
    C.continuePath();
    let guard = 0;
    while (state.learn.view === "problem" && guard++ < 10) {
      const at = C.sessionPlace();
      assert.ok(at.n > 3 && at.n <= at.total, JSON.stringify(at));
      giveUp();
      C.nextProblem();
    }
    assert.equal(state.learn.view, "dailyDone", "a quiet end");
    assert.equal(state.learn.daily, null);
    home = C.pathNow();
    assert.equal(home.finished, true);
    assert.equal(home.done.size, home.items.length);
    // Starting again does not start over: it is done for today.
    C.startPath();
    assert.equal(state.learn.view, "dailyDone");
    // Another day: a new session from the path as it is then.
    assert.equal(C.todaysSession(Date.now() + 86400000), null);
    await sleep(0);
  });

  await test("learn session: a row starts the session at that item; a drill that falls due meanwhile joins it; the home goes on with it", () => {
    beginner("stones-groups", { captureWins: 2 });
    const items = C.pathNow().items;
    const third = items[3];
    assert.equal(third.kind, "problem");
    C.openPathItem(third.key);
    assert.equal(state.learn.view, "problem");
    assert.equal(state.learn.problem.def.id, third.id);
    assert.equal(keyNow(), third.key);
    // A moment tried again in Play (addMistake) while the session is open.
    state.profile = PM.addMistake(state.profile, { gameId: "h", index: 20, theme: "cut", color: -1, size: 19, sgf: "(;GM[1]FF[4]SZ[19];B[pd];W[dp])", played: { x: 0, y: 0 }, best: { x: 3, y: 3 } }, Date.now() - 1000);
    const s = C.todaysSession();
    const at = s.items.findIndex((it) => it.key === "mistake:h-20");
    assert.equal(at, 4, "right after the item open now");
    // Solved: done at once, even before Continue.
    C.showAnswer();
    C.continuePath();
    assert.ok(C.todaysSession().done.includes(third.key));
    assert.equal(keyNow(), "mistake:h-20", "the new drill is next");
    // Learn's home shows the session, with its progress, and the primary goes on with it.
    C.learnHome();
    const home = C.pathNow();
    assert.equal(home.started, true);
    assert.equal(home.finished, false);
    assert.ok(home.items.some((it) => it.key === "mistake:h-20"));
    C.startPath();
    assert.equal(state.learn.view, "lesson", "the first item not done: the lesson");
  });

  await test("learn session: the first 9×9 game comes last and leaves for Play; the week's focus names its reason and its lesson", async () => {
    beginner("life-space", { captureWins: 2 });
    C.startPath();
    assert.equal(keyNow(), "lesson:life-space");
    finishLesson();
    const s = C.todaysSession();
    assert.equal(s.items.at(-1).kind, "game", "the bridge joins at the end");
    for (let i = 0; i < 10 && state.learn.view !== "dailyDone" && state.space === "learn"; i++) {
      if (state.learn.view === "mistake") C.revealMistake();
      if (state.learn.view === "problem") C.showAnswer();
      C.continuePath();
    }
    await sleep(0);
    assert.equal(state.space, "play", "the first game is played in Play");
    assert.equal(state.game.game.size, 9);
    assert.ok(C.todaysSession().done.includes("game"));
    assert.equal(C.pathNow().finished, true);

    // The week's focus: four games where cuts cost five points each.
    const now = Date.now();
    const ph = (loss) => ({ loss, mistakes: 1, blunders: 0, moves: 30, accuracy: 0.6 });
    state.settings = { ...state.settings, experience: "player", playerRank: 12 };
    state.profile = PM.normalizeProfile({ ...PM.newProfile({ rank: 12 }), games: PM.normalizeGames([0, 1, 2, 3].map((i) => ({ id: "f" + i, at: now - (i + 1) * 3600000, size: 19, color: 1, won: false, moves: 180, confidence: "high", phases: { opening: ph(2), middle: ph(7), endgame: ph(2) }, themes: { cut: 1 }, themeLoss: { cut: 5 } }))) });
    C.resetSession();
    A.setLang("en");
    const wf = C.weekFocus();
    assert.deepEqual(wf.keys, ["cut"]);
    assert.deepEqual(wf.names, ["Cutting"]);
    assert.match(wf.why[0], /Lost ≈20 points here in your last 4 games/);
    assert.equal(wf.lesson, "connect-cut", "the first lesson on cutting not done yet");
    assert.equal(state.profile.week.focus[0], "cut", "kept for the week");
    const focusItems = C.learnPath().filter((i) => i.role === "focus");
    assert.ok(focusItems.length > 0 && focusItems.every((i) => i.why === "cut"), "the path brings the focus");
  });
} finally {
  A.C.sched?.cancelAll?.("quit");
}
