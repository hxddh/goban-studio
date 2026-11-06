/**
 * Learn: the course, problem topics, the path's problems (learnPath:
 * reviews, the week's focus, new problems at your level) and drills of
 * your own mistakes. Everything the learner does is recorded in the one
 * player model (model/player.js) through changeProfile.
 */
import { BLACK } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as S from "../solver.js";
import { THEME_TOPIC, learnPath as pathOf, nextLesson as pickNextLesson, recordLesson, recordMistake, recordProblem, taughtPool } from "../model/player.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { COURSE, GRADES, PROBLEMS, SHAPES, THEMES, withContent } from "../content.js";
import { state, update, toast, announce } from "./store.js";
import { changeProfile, isRestoring, playerEstimate, remember } from "./ctl-core.js";

export { COURSE, GRADES, PROBLEMS, SHAPES, THEMES };

export const gradeOf = (id) => GRADES[id]?.grade || 1;

/* -------------------------------------------------------------- course */

export function allLessons() {
  const out = [];
  for (const unit of COURSE) for (const lesson of unit.lessons) out.push({ unit, lesson });
  return out;
}

/**
 * The next lesson. Someone who already plays (onboarding "I play regularly",
 * or a level of about 15 kyu or stronger) starts at the intermediate course;
 * the basics stay open from the course map. A player whose estimated level
 * (the rating from their games, or the level they gave) is about 5 kyu or
 * stronger goes on to the advanced course once the intermediate course is
 * finished, or straight away if they never started it; one who is part way
 * through the intermediate course finishes it first.
 */
export function nextLesson() {
  const est = playerEstimate();
  return pickNextLesson(allLessons(), (id) => !!state.profile.lessons[id]?.done, {
    experience: state.settings.experience,
    playerRank: state.settings.playerRank,
    rating: est.games > 0 ? est.r : null,
  });
}

/**
 * Learn's one ordered list (model/player.js learnPath): the next lesson,
 * the beginner bridges while they apply, then the problems and drills of
 * the day. Items: { kind: "lesson" | "capture" | "game" | "mistake" |
 * "problem", id?, unit?, role, why?, game? }.
 */
export function learnPath(now = Date.now()) {
  const s = state.settings;
  return pathOf(state.profile, { course: COURSE, problems: PROBLEMS, grades: GRADES, settings: { experience: s.experience, playerRank: s.playerRank }, captureWins: s.captureWins || 0 }, now);
}

/** The unit that teaches a topic, for weakness-driven recommendations. */
export function unitForTopic(topic) {
  const map = { capture: "capture", escape: "escape", connect: "connect", life: "life", kill: "kill", race: "race" };
  return COURSE.find((u) => u.id === map[topic]) || null;
}

function buildStep(step) {
  if (step.kind === "problem") {
    const pz = S.createPuzzle(step.problem);
    return { kind: "problem", step, pz, ...problemState(pz) };
  }
  if (step.kind === "place") {
    const pz = boardPuzzle(step.board, step.accept);
    return { kind: "place", step, pz, board: pz.board, toMove: step.toMove ?? BLACK, result: null, wrongAt: null };
  }
  const pz = step.board ? boardPuzzle(step.board) : null;
  return { kind: "read", step, pz, board: pz?.board || null, result: "done" };
}

/**
 * A tight window around what matters: the bounding box of the stones (plus
 * one line), grown to at least 6 lines and kept square, snapped to the board
 * edge when within two lines of it.
 */
export function tightView(size, points) {
  if (!points.length) return null;
  let x0 = Math.min(...points.map((p) => p.x)) - 1;
  let y0 = Math.min(...points.map((p) => p.y)) - 1;
  let x1 = Math.max(...points.map((p) => p.x)) + 1;
  let y1 = Math.max(...points.map((p) => p.y)) + 1;
  if (x0 <= 2) x0 = 0;
  if (y0 <= 2) y0 = 0;
  if (x1 >= size - 3) x1 = size - 1;
  if (y1 >= size - 3) y1 = size - 1;
  // Not square any more: each side at least 5 lines, and neither side more
  // than about 1.7× the other (the frame takes the window's proportion).
  const longest = Math.max(x1 - x0, y1 - y0, 5);
  const minSpan = Math.max(5, Math.ceil(longest / 1.7));
  const grow = (a0, a1, span) => {
    while (a1 - a0 < span) {
      if (a0 > 0 && (a1 >= size - 1 || a0 > size - 1 - a1)) a0--;
      else if (a1 < size - 1) a1++;
      else break;
    }
    return [a0, a1];
  };
  [x0, x1] = grow(Math.max(0, x0), Math.min(size - 1, x1), Math.max(minSpan, x1 - x0));
  [y0, y1] = grow(Math.max(0, y0), Math.min(size - 1, y1), Math.max(minSpan, y1 - y0));
  if (x0 === 0 && y0 === 0 && x1 === size - 1 && y1 === size - 1) return null;
  return { x0, y0, x1, y1 };
}

/**
 * A display-only board from a diagram (place/read steps). The view frames
 * the diagram's region, stones and marks, and every accept point, so a
 * place step never hides one of its answers outside the window.
 */
function boardPuzzle(b, accept = null) {
  const size = b.size || 19;
  const d = S.parseDiagram(b.diagram);
  let x0 = 0;
  let y0 = 0;
  if (b.at) [x0, y0] = b.at;
  else {
    const corner = b.corner || "tl";
    if (corner.includes("r")) x0 = size - d.w;
    if (corner.includes("b")) y0 = size - d.h;
  }
  const board = Array.from({ length: size }, () => Array(size).fill(0));
  for (const s of d.stones) board[s.y + y0][s.x + x0] = s.c;
  const pts = [...d.stones, ...d.region, ...(b.marks || [])].map((p) => ({ x: p.x + x0, y: p.y + y0 }));
  for (const a of accept || []) pts.push({ x: a.x + x0, y: a.y + y0 });
  const full = d.w >= size && d.h >= size;
  return { size, board, x0, y0, view: full ? null : tightView(size, pts.length ? pts : [{ x: x0, y: y0 }, { x: x0 + d.w - 1, y: y0 + d.h - 1 }]) };
}

/** Problem view: tight around stones and region. */
export function problemView(pz) {
  const pts = [...pz.stones, ...(pz.region || [])];
  return tightView(pz.size, pts) || pz.view;
}

function problemState(pz) {
  return { st: S.initialState(pz), history: [], status: "open", feedback: null, result: null, busy: false, used: false, hintAt: null, answer: null, last: null, wrongValues: null };
}

/**
 * v9: lesson steps and problem bodies arrive after start-up (content.js);
 * whatever opens them waits for them, and runs at once when they are here.
 */
export function openLesson(lessonId, stepIndex = null) {
  return withContent("course", () => showLesson(lessonId, stepIndex));
}

function showLesson(lessonId, stepIndex) {
  const found = allLessons().find((l) => l.lesson.id === lessonId);
  if (!found) return;
  if (!isRestoring()) remember();
  const saved = state.profile.lessons[lessonId];
  const index = stepIndex ?? (saved && !saved.done ? Math.min(saved.step || 0, found.lesson.steps.length - 1) : 0);
  // v8: back to a finished lesson (from the game it led to) shows its lesson-complete page.
  if (index >= found.lesson.steps.length) {
    update((s) => {
      s.space = "learn";
      s.learn = { ...s.learn, view: "lesson", lesson: { unit: found.unit, lesson: found.lesson, index, cur: null, finished: true }, problem: null, mistake: null, daily: null };
    });
    return;
  }
  const step = found.lesson.steps[index];
  if (step?.kind === "place") step.board = { ...step.board, accept: step.accept };
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "lesson", lesson: { unit: found.unit, lesson: found.lesson, index, cur: buildStep(step) }, problem: null, mistake: null, daily: null };
  });
}

let autoTimer = 0;
function scheduleAutoContinue() {
  clearTimeout(autoTimer);
  const L = state.learn.lesson;
  if (!L) return;
  const index = L.index;
  autoTimer = setTimeout(() => {
    const now = state.learn.lesson;
    if (state.learn.view === "lesson" && now === L && now.index === index && !now.finished) lessonContinue();
  }, 1500);
}

export function lessonContinue() {
  clearTimeout(autoTimer);
  const L = state.learn.lesson;
  if (!L) return;
  const next = L.index + 1;
  if (next >= L.lesson.steps.length) {
    changeProfile((p) => recordLesson(p, L.lesson.id, { done: true, step: next }, Date.now()));
    Audio.win();
    update((s) => {
      s.learn.lesson = { ...L, index: next, cur: null, finished: true };
    });
    return;
  }
  changeProfile((p) => recordLesson(p, L.lesson.id, { step: next }, Date.now()));
  L.index = next;
  const step = L.lesson.steps[next];
  if (step?.kind === "place") step.board = { ...step.board, accept: step.accept };
  L.cur = buildStep(step);
  update();
}

export function lessonBack() {
  clearTimeout(autoTimer);
  const L = state.learn.lesson;
  if (!L || L.index === 0) return;
  L.index -= 1;
  L.cur = buildStep(L.lesson.steps[L.index]);
  L.finished = false;
  update();
}

export function openNextLesson() {
  const n = nextLesson();
  if (n) openLesson(n.lesson.id);
  else learnHome();
}

/** Learn's home: the path, then the catalog. */
export function learnHome() {
  clearTimeout(autoTimer);
  if (!isRestoring()) remember();
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "home", lesson: null, problem: null, daily: null, topic: null, mistake: null, theme: null };
  });
}

export function openTopic(topic, theme = null) {
  return withContent("problems", () => showTopic(topic, theme));
}

function showTopic(topic, theme) {
  if (!isRestoring()) remember();
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "topic", topic, theme, shape: null, problem: null, daily: null, mistake: null };
  });
}

/** A classic-shape collection, shown as a topic page. */
export function openShape(shape) {
  return withContent("problems", () => showShape(shape));
}

function showShape(shape) {
  if (!isRestoring()) remember();
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "topic", topic: "shapes", shape, theme: null, problem: null, daily: null, mistake: null };
  });
}

export function problemsOfTopic(topic) {
  return PROBLEMS.filter((p) => p.topic === topic).sort((a, b) => gradeOf(a.id) - gradeOf(b.id) || a.id.localeCompare(b.id));
}

export function problemsOfTheme(theme) {
  return PROBLEMS.filter((p) => p.theme === theme).sort((a, b) => gradeOf(a.id) - gradeOf(b.id));
}

/** Problems built on one classic textbook shape (see SHAPES in problems.js). */
export function problemsOfShape(shape) {
  return PROBLEMS.filter((p) => p.shape === shape).sort((a, b) => gradeOf(a.id) - gradeOf(b.id) || a.id.localeCompare(b.id));
}

export function shapeName(id) {
  const sh = SHAPES.find((x) => x.id === id);
  if (sh) return sh.name?.[state.settings.lang] || sh.name?.en || id;
  return t("shape." + id);
}

export function themeName(id) {
  const th = THEMES.find((x) => x.id === id);
  if (th) return th.name?.[state.settings.lang] || th.name?.en || id;
  return t("theme." + id);
}

export function openProblem(id, { daily = null } = {}) {
  return withContent("problems", () => showProblem(id, daily));
}

function showProblem(id, daily) {
  const p = PROBLEMS.find((x) => x.id === id);
  if (!p) return;
  if (!isRestoring() && !daily) remember();
  const pz = S.createPuzzle(p);
  pz.view = problemView(pz);
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "problem", problem: { def: p, pz, ...problemState(pz) }, mistake: null, daily: daily || null, topic: daily ? s.learn.topic : p.topic };
  });
}

/** The list a problem is browsed in: its theme or topic. */
function browseList(def) {
  return state.learn.theme ? problemsOfTheme(state.learn.theme) : problemsOfTopic(def.topic);
}

/* ------------------------------------------------------ the day's problems */

/**
 * New problems a player may be given: someone still working through the
 * beginner units only gets topics their finished lessons have taught
 * (model/player.js taughtPool).
 */
export function dailyPool() {
  const s = state.settings;
  return taughtPool(state.profile, { course: COURSE, problems: PROBLEMS, settings: { experience: s.experience, playerRank: s.playerRank } });
}

/**
 * The problems and drills of the path, solved one after another: { date,
 * items: [{ kind: "p" | "m", id, why? }], index, done: [id] }. It is the
 * path's own list (learnPath, stable for a day), kept in memory for the day.
 */
let session = null;

const dayOf = (now) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function buildDaily(now = Date.now()) {
  const items = [];
  for (const it of learnPath(now)) {
    if (it.kind === "mistake") items.push({ kind: "m", id: it.id, ...(it.why ? { why: it.why } : {}) });
    else if (it.kind === "problem") items.push({ kind: "p", id: it.id, ...(it.why ? { why: it.why } : {}) });
  }
  return items;
}

/** Today's session as it stands, or null before it starts (or when nothing is left of it). */
export function todaysDaily(now = Date.now()) {
  const d = session;
  if (!d || d.date !== dayOf(now)) return null;
  const known = (it) => (it.kind === "m" ? state.profile.mistakes.some((m) => m.id === it.id) : PROBLEMS.some((x) => x.id === it.id));
  if (!d.items.every(known)) {
    const before = d.items.slice(0, d.index).filter(known).length;
    d.items = d.items.filter(known);
    d.index = Math.min(d.items.length, before);
    d.done = d.done.filter((id) => d.items.some((it) => it.id === id));
    if (!d.items.length) return null;
  }
  return d;
}

export function startDaily() {
  // The beginner pool reads the finished lessons' steps (taughtPool).
  return withContent("course", () => withContent("problems", showDaily));
}

/** One problem or drill of the path, opened as part of the day's session. */
export function openPathItem(id) {
  return withContent("course", () => withContent("problems", () => showDaily(id)));
}

function showDaily(id = null) {
  let daily = todaysDaily();
  if (!daily || (id && !daily.items.some((it) => it.id === id))) {
    const items = buildDaily();
    if (!items.length) return learnHome();
    daily = session = { date: dayOf(Date.now()), items, index: 0, done: daily?.done || [] };
  }
  if (id) daily.index = Math.max(0, daily.items.findIndex((it) => it.id === id));
  if (daily.index >= daily.items.length) return learnHome();
  if (!isRestoring()) remember();
  openDailyItem(daily);
}

function openDailyItem(daily) {
  const item = daily.items[daily.index];
  if (item.kind === "m") openMistakeDrill(item.id, { daily });
  else openProblem(item.id, { daily });
}

/* ---------------------------------------------------------- problems */

function currentProblem() {
  const v = state.learn.view;
  if (v === "problem") return state.learn.problem;
  if (v === "lesson" && state.learn.lesson?.cur?.kind === "problem") return state.learn.lesson.cur;
  return null;
}

/** The learner clicks a point in practice. */
export function practicePlay(x, y) {
  const v = state.learn.view;
  if (v === "mistake") return mistakePlay(x, y);
  if (v === "lesson" && state.learn.lesson?.cur?.kind === "place") return placePlay(x, y);
  const P = currentProblem();
  if (!P || P.busy || P.status !== "open" || P.answer) return;
  const pz = P.pz;
  // A "how many points" question is answered with the choices, not a move.
  if (pz.counting && pz.ask === "value") return;
  const moved = S.playMove(pz, P.st, S.indexOf(pz, x, y));
  if (!moved) {
    toast(t("error.illegal"), "warn");
    return;
  }
  if (moved.outside) {
    toast(t("practice.endgame.settled"), "warn");
    return;
  }
  const next = moved.next;
  P.history.push(P.st);
  P.st = next;
  P.last = { x, y };
  P.hintAt = null;
  P.busy = true;
  P.feedback = null;
  Audio.stone(false);
  update();
  setTimeout(() => respond(P), 60);
}

function respond(P) {
  const pz = P.pz;
  const r = S.reply(pz, P.st);
  if (r && r.refutes) {
    setTimeout(() => {
      if (!r.pass) {
        const after = S.playMove(pz, P.st, S.indexOf(pz, r.x, r.y))?.next;
        if (after) {
          P.history.push(P.st);
          P.st = after;
          P.last = { x: r.x, y: r.y };
          Audio.stone(false);
        }
      }
      lost(P, { ko: !!r.ko });
    }, 320);
    return;
  }
  const settled = S.status(pz, P.st);
  if (settled === "won" || !r) {
    finishProblem(P);
    return;
  }
  setTimeout(() => {
    if (!r.pass) {
      const after = S.playMove(pz, P.st, S.indexOf(pz, r.x, r.y))?.next;
      if (after) {
        P.history.push(P.st);
        P.st = after;
        P.last = { x: r.x, y: r.y };
        Audio.stone(false);
      }
    } else {
      const after = S.playMove(pz, P.st, S.PASS).next;
      P.history.push(P.st);
      P.st = after;
    }
    const st = S.status(pz, P.st);
    P.busy = false;
    if (st === "won") return finishProblem(P);
    if (st === "lost") return lost(P);
    P.feedback = "keep";
    update();
  }, 320);
}

/**
 * A wrong move: the refutation stays on the board for a moment, then the
 * position goes back to the learner's last decision so they can try again
 * without reaching for a button.
 */
function lost(P, { ko = false } = {}) {
  P.result = endResult(P);
  P.status = "lost";
  P.feedback = ko ? "ko" : "wrong";
  P.busy = false;
  Audio.wrong?.();
  recordAttempt(P, false);
  announce(t("practice.wrong"));
  update();
  const st = P.st;
  setTimeout(() => {
    if (P.st !== st || P.status !== "lost" || P.answer) return;
    let back = P.history.pop();
    while (P.history.length && back.toMove !== P.pz.userColor) back = P.history.pop();
    if (back) P.st = back;
    P.status = "open";
    P.feedback = "retry";
    P.last = null;
    update();
  }, 1900);
}

/**
 * How the key stones ended up, for life-and-death problems: "seki" when the
 * position on the board is a proved seki (see sekiInfo in solver.js), else
 * null. Only checked where it changes the message: a defence that ends in
 * seki, or a kill attempt that only reached seki.
 */
function endResult(P) {
  const pz = P.pz;
  if (!pz.lifeGoal) return null;
  try {
    return S.sekiInfo(pz, P.st, 100000).result === "seki" ? "seki" : null;
  } catch (_) {
    return null;
  }
}

/**
 * The message key for the problem's feedback line, so the view can say
 * "seki" where it matters:
 *   solved, ended in seki         practice.solvedSeki
 *   solved                        practice.solved
 *   kill refuted by seki          practice.onlySeki
 *   only a ko                     practice.onlyKo
 *   other wrong move              practice.wrongExplained
 * Returns null for the other feedback states (keep, retry, busy).
 */
export function feedbackKey(P) {
  if (!P) return null;
  if (P.pz?.counting && P.feedback === "solved") return (P.pz.ask === "value" ? "practice.endgame.valueRight" : "practice.endgame.solved") + (endgameArgs(P)[0] === "1" ? "One" : "");
  if (P.pz?.counting && P.feedback === "wrong") return P.pz.ask === "value" ? "practice.endgame.valueWrong" : "practice.endgame.wrong";
  if (P.feedback === "solved") return P.result === "seki" ? "practice.solvedSeki" : "practice.solved";
  if (P.feedback === "ko") return "practice.onlyKo";
  // The position resets by itself after a wrong move, so the message says so
  // instead of pointing at buttons.
  if (P.feedback === "wrong") return P.result === "seki" && P.pz.userColor === P.pz.attacker ? "practice.onlySeki" : "practice.resetting";
  return null;
}

/**
 * The numbers an endgame problem's feedback names: the value of a "how many
 * points" question, or how many points the best move gains over the best
 * other choice.
 */
export function endgameArgs(P) {
  const pz = P?.pz;
  if (!pz?.counting) return [];
  return [String(pz.ask === "value" ? pz.value : pz.margin)];
}

/**
 * Answer a "how many points" question. A wrong value stays marked and the
 * learner can choose again; the attempt counts as missed.
 */
export function answerValue(v) {
  const P = currentProblem();
  if (!P || !P.pz.counting || P.pz.ask !== "value" || P.status === "won" || P.answer) return;
  P.chosen = v;
  if (v === P.pz.value) {
    P.answer = S.countLine(P.pz, BLACK).map((m, i) => ({ ...m, n: i + 1 }));
    finishProblem(P);
    return;
  }
  P.feedback = "wrong";
  P.wrongValues = [...(P.wrongValues || []), v];
  Audio.wrong?.();
  recordAttempt(P, false);
  announce(t(feedbackKey(P)));
  update();
}

function finishProblem(P) {
  P.result = endResult(P);
  P.status = "won";
  P.feedback = "solved";
  P.busy = false;
  Audio.correct ? Audio.correct() : Audio.win();
  recordAttempt(P, true);
  announce(t(feedbackKey(P), endgameArgs(P)));
  update();
  if (state.learn.view === "lesson" && state.learn.lesson?.cur === P) scheduleAutoContinue();
}

/**
 * The first answer of a visit decides the review schedule (a miss resets
 * it); a later success in the same visit still marks the problem solved,
 * not clean, and counts for today's five. P.recorded: "miss" | "solved".
 */
function recordAttempt(P, solved) {
  if (P.recorded === "solved" || (P.recorded && !solved)) return;
  const first = !P.recorded;
  P.recorded = solved ? "solved" : "miss";
  if (state.learn.view === "problem" && P.def) {
    const now = Date.now();
    if (first) changeProfile((p) => recordProblem(p, P.def.id, { solved, clean: solved && !P.used }, now));
    else changeProfile((p) => recordProblem(p, P.def.id, { late: true }, now));
    const d = state.learn.daily;
    if (d && solved && !d.done.includes(P.def.id)) d.done.push(P.def.id);
  }
}

export function retryProblem() {
  const P = currentProblem();
  if (!P) return;
  Object.assign(P, problemState(P.pz), { recorded: P.recorded, used: P.used });
  update();
}

export function undoProblemMove() {
  const P = currentProblem();
  if (!P || P.busy || !P.history.length) return;
  let back = P.history.pop();
  while (P.history.length && back.toMove !== P.pz.userColor) back = P.history.pop();
  P.st = back;
  P.status = "open";
  P.feedback = null;
  P.last = null;
  update();
}

export function problemHint() {
  const P = currentProblem();
  if (!P || P.status !== "open" || P.busy) return;
  P.used = true;
  const moves = S.winningMoves(P.pz, P.st);
  P.hintAt = moves[0] || null;
  update();
}

/** The two lines a "how many points" answer compares (Black first, White first). */
export function valueLines(pz) {
  return { black: S.countLine(pz, BLACK), white: S.countLine(pz, -BLACK) };
}

export function showAnswer() {
  const P = currentProblem();
  if (!P) return;
  P.used = true;
  const line = P.pz.counting && P.pz.ask === "value" ? S.countLine(P.pz, BLACK) : S.solutionLine(P.pz);
  Object.assign(P, problemState(P.pz), { used: true, recorded: P.recorded });
  P.answer = line.map((m, i) => ({ ...m, n: i + 1 }));
  P.status = "answer";
  if (!P.recorded) recordAttempt(P, false);
  update();
}

function advanceDaily() {
  const d = state.learn.daily;
  d.index = Math.min(d.items.length, d.index + 1);
  if (d.index >= d.items.length) {
    update((s) => {
      s.learn = { ...s.learn, view: "dailyDone", problem: null, mistake: null };
    });
    return;
  }
  openDailyItem(d);
}

export function nextProblem() {
  if (state.learn.daily) return advanceDaily();
  const P = state.learn.problem;
  const list = browseList(P.def);
  const i = list.findIndex((p) => p.id === P.def.id);
  if (i >= 0 && i + 1 < list.length) openProblem(list[i + 1].id);
  else openTopic(P.def.topic, state.learn.theme);
}

export function prevProblem() {
  const P = state.learn.problem;
  if (!P || state.learn.daily) return;
  const list = browseList(P.def);
  const i = list.findIndex((p) => p.id === P.def.id);
  if (i > 0) openProblem(list[i - 1].id);
}

function placePlay(x, y) {
  const C = state.learn.lesson.cur;
  if (C.result === "right") return;
  const ox = C.pz.x0;
  const oy = C.pz.y0;
  const ok = (C.step.accept || []).some((a) => a.x + ox === x && a.y + oy === y);
  if (C.pz.board[y][x]) {
    toast(t("error.occupied"), "warn");
    return;
  }
  if (ok) {
    C.result = "right";
    C.placed = { x, y };
    Audio.stone(false);
    Audio.correct?.();
    announce(t("practice.right"));
    update();
    scheduleAutoContinue();
    return;
  }
  C.result = "wrong";
  C.wrongAt = { x, y };
  Audio.wrong?.();
  announce(t("practice.notQuite"));
  update();
}

export function goalText(pz) {
  const color = t(pz.userColor === BLACK ? "common.black" : "common.white");
  if (pz.counting) return t(pz.ask === "value" ? "goal.endgameValue" : "goal.endgame", [color]);
  return t("goal." + pz.goal, [color]);
}

/* ------------------------------------------------------ mistake drills */

/** Open one of your own mistakes as a "find the better move" drill. */
export function openMistakeDrill(id, { daily = null } = {}) {
  const m = state.profile.mistakes.find((x) => x.id === id);
  if (!m) return;
  let game;
  try {
    game = loadSGF(m.sgf).game;
  } catch (_) {
    toast(t("library.importError"), "error");
    return;
  }
  const line = game.mainLine();
  game.goto(line[Math.max(0, m.index - 1)].id);
  if (!isRestoring() && !daily) remember();
  update((s) => {
    s.space = "learn";
    s.learn = { ...s.learn, view: "mistake", mistake: { m, game, status: "open", tries: 0, last: null, revealed: false }, problem: null, daily: daily || null };
  });
}

function mistakePlay(x, y) {
  const D = state.learn.mistake;
  if (!D || D.status === "right") return;
  if (!D.game.canPlay(x, y).ok) {
    toast(t("error.illegal"), "warn");
    return;
  }
  D.tries++;
  D.last = { x, y };
  const ok = (D.m.accept || [D.m.best]).some((a) => a.x === x && a.y === y);
  if (ok) {
    D.status = "right";
    Audio.stone(false);
    Audio.correct?.();
    changeProfile((p) => recordMistake(p, D.m.id, { solved: D.tries === 1 && !D.revealed }, Date.now()));
    const d = state.learn.daily;
    if (d && !d.done.includes(D.m.id)) d.done.push(D.m.id);
  } else {
    D.status = x === D.m.played.x && y === D.m.played.y ? "same" : "wrong";
    Audio.wrong?.();
  }
  update();
}

export function revealMistake() {
  const D = state.learn.mistake;
  if (!D) return;
  D.revealed = true;
  D.status = "revealed";
  changeProfile((p) => recordMistake(p, D.m.id, { solved: false }, Date.now()));
  update();
}

export function nextAfterMistake() {
  if (state.learn.daily) return advanceDaily();
  learnHome();
}

export function mistakeTopic(m) {
  return m.theme ? THEME_TOPIC[m.theme] || null : null;
}
