/**
 * Practice: the course, problem collections, today's five (problems, your
 * own mistakes and your weak themes), and mistake drills.
 */
import { BLACK } from "../rules.js";
import { loadSGF } from "../sgf.js";
import * as S from "../solver.js";
import { dailySet, markLesson, markMistake, markProblem, saveProgress, todayKey, touchStreak } from "../persist.js";
import { t } from "../i18n.js";
import * as Audio from "../audio.js";
import { COURSE } from "../content/course.js";
import * as ProblemContent from "../content/problems.js";
import GRADES from "../content/problem-grades.json";
import { state, update, toast, announce } from "./store.js";
import { remember, isRestoring } from "./ctl-core.js";
import { topWeaknesses, THEME_TOPIC } from "./insight.js";

export const PROBLEMS = ProblemContent.PROBLEMS;
export const THEMES = ProblemContent.THEMES || [];
export const SHAPES = ProblemContent.SHAPES || [];
export { COURSE, GRADES };

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
 * the basics stay open from the course map.
 */
export function nextLesson() {
  const all = allLessons();
  const open = ({ lesson }) => !state.progress.lessons[lesson.id]?.done;
  const rank = state.settings.playerRank ?? 30;
  const experienced = state.settings.experience === "player" || rank <= 15;
  if (experienced) {
    const mid = all.find((x) => x.unit.level === "intermediate" && open(x));
    if (mid) return mid;
  }
  return all.find(open) || null;
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
  return { st: S.initialState(pz), history: [], status: "open", feedback: null, result: null, busy: false, used: false, hintAt: null, answer: null, last: null };
}

export function openLesson(lessonId, stepIndex = null) {
  const found = allLessons().find((l) => l.lesson.id === lessonId);
  if (!found) return;
  if (!isRestoring()) remember();
  const saved = state.progress.lessons[lessonId];
  const index = stepIndex ?? (saved && !saved.done ? Math.min(saved.step || 0, found.lesson.steps.length - 1) : 0);
  const step = found.lesson.steps[index];
  if (step?.kind === "place") step.board = { ...step.board, accept: step.accept };
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "lesson", lesson: { unit: found.unit, lesson: found.lesson, index, cur: buildStep(step) }, problem: null, mistake: null, daily: null };
  });
}

let autoTimer = 0;
function scheduleAutoContinue() {
  clearTimeout(autoTimer);
  const L = state.practice.lesson;
  if (!L) return;
  const index = L.index;
  autoTimer = setTimeout(() => {
    const now = state.practice.lesson;
    if (state.practice.view === "lesson" && now === L && now.index === index && !now.finished) lessonContinue();
  }, 1500);
}

export function lessonContinue() {
  clearTimeout(autoTimer);
  const L = state.practice.lesson;
  if (!L) return;
  const next = L.index + 1;
  if (next >= L.lesson.steps.length) {
    markLesson(state.progress, L.lesson.id, { done: true, step: next });
    touchStreak(state.progress);
    Audio.win();
    update((s) => {
      s.practice.lesson = { ...L, index: next, cur: null, finished: true };
    });
    return;
  }
  markLesson(state.progress, L.lesson.id, { step: next });
  L.index = next;
  const step = L.lesson.steps[next];
  if (step?.kind === "place") step.board = { ...step.board, accept: step.accept };
  L.cur = buildStep(step);
  update();
}

export function lessonBack() {
  clearTimeout(autoTimer);
  const L = state.practice.lesson;
  if (!L || L.index === 0) return;
  L.index -= 1;
  L.cur = buildStep(L.lesson.steps[L.index]);
  L.finished = false;
  update();
}

export function openNextLesson() {
  const n = nextLesson();
  if (n) openLesson(n.lesson.id);
  else practiceHome();
}

export function practiceHome() {
  clearTimeout(autoTimer);
  if (!isRestoring()) remember();
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "home", lesson: null, problem: null, daily: null, topic: null, mistake: null, theme: null };
  });
}

export function openTopic(topic, theme = null) {
  if (!isRestoring()) remember();
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "topic", topic, theme, shape: null, problem: null, daily: null, mistake: null };
  });
}

/** A classic-shape collection, shown as a topic page. */
export function openShape(shape) {
  if (!isRestoring()) remember();
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "topic", topic: "shapes", shape, theme: null, problem: null, daily: null, mistake: null };
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
  const p = PROBLEMS.find((x) => x.id === id);
  if (!p) return;
  if (!isRestoring() && !daily) remember();
  const pz = S.createPuzzle(p);
  pz.view = problemView(pz);
  update((s) => {
    s.space = "practice";
    s.practice = { ...s.practice, view: "problem", problem: { def: p, pz, ...problemState(pz) }, mistake: null, daily: daily || null, topic: daily ? s.practice.topic : p.topic };
  });
}

/* ------------------------------------------------------------- daily */

/**
 * Today's five: mistakes from your own games that are due, then problems on
 * your weakest theme, then due reviews and new problems at your level.
 */
const GOAL_TOPICS = { capture: ["capture"], save: ["escape", "connect"], live: ["life"], kill: ["kill"] };

/**
 * New problems for today's five. Someone still working through the
 * beginner units only gets topics their finished lessons have taught
 * (capturing from the start), so a beginner is never handed a vital-point
 * kill on day two. The intermediate units do not count here: finishing the
 * beginner units opens the whole problem bank.
 */
export function dailyPool() {
  const p = state.progress;
  const lessons = allLessons().filter(({ unit }) => !unit.level);
  const done = lessons.filter(({ lesson }) => p.lessons[lesson.id]?.done);
  const beginner = state.settings.experience === "new" || (state.settings.playerRank ?? 30) >= 25;
  if (!beginner || done.length >= lessons.length) return PROBLEMS;
  const topics = new Set(["capture"]);
  for (const { lesson } of done) for (const st of lesson.steps || []) for (const tp of GOAL_TOPICS[st.problem?.goal] || []) topics.add(tp);
  if (done.length >= lessons.length * 0.75) topics.add("race").add("technique");
  const pool = PROBLEMS.filter((x) => topics.has(x.topic));
  return pool.length >= 5 ? pool : PROBLEMS;
}

export function buildDaily(now = Date.now()) {
  const p = state.progress;
  const items = [];
  const due = p.mistakes.filter((m) => (m.due || 0) <= now).slice(0, 2);
  for (const m of due) items.push({ kind: "m", id: m.id });
  const weak = topWeaknesses(p.weakness, 1)[0];
  if (weak) {
    const pool = problemsOfTheme(weak.theme).filter((x) => !p.problems[x.id]?.solved);
    for (const x of pool.slice(0, 2)) if (items.length < 4) items.push({ kind: "p", id: x.id, why: weak.theme });
  }
  const rest = dailySet(p, dailyPool().filter((x) => !items.some((i) => i.id === x.id)), GRADES, 5 - items.length, now);
  for (const x of rest) items.push({ kind: "p", id: x.id });
  return items.slice(0, 5);
}

export function todaysDaily() {
  const d = state.progress.daily;
  if (!(d && d.date === todayKey() && Array.isArray(d.items))) return null;
  // A saved set may name a problem a later version removed: drop it, and
  // keep the position in the set on the item the learner was at.
  const known = (it) => it?.kind !== "p" || PROBLEMS.some((x) => x.id === it.id);
  if (!d.items.every(known)) {
    const before = d.items.slice(0, d.index || 0).filter(known).length;
    d.items = d.items.filter(known);
    d.index = Math.min(d.items.length, before);
    if (Array.isArray(d.done)) d.done = d.done.filter((id) => d.items.some((it) => it.id === id));
    if (!d.items.length) return null;
  }
  return d;
}

export function startDaily() {
  let daily = todaysDaily();
  if (!daily) {
    daily = { date: todayKey(), items: buildDaily(), index: 0, done: [] };
    state.progress.daily = daily;
    saveProgress(state.progress);
  }
  if (daily.index >= daily.items.length) return practiceHome();
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
  const v = state.practice.view;
  if (v === "problem") return state.practice.problem;
  if (v === "lesson" && state.practice.lesson?.cur?.kind === "problem") return state.practice.lesson.cur;
  return null;
}

/** The learner clicks a point in practice. */
export function practicePlay(x, y) {
  const v = state.practice.view;
  if (v === "mistake") return mistakePlay(x, y);
  if (v === "lesson" && state.practice.lesson?.cur?.kind === "place") return placePlay(x, y);
  const P = currentProblem();
  if (!P || P.busy || P.status !== "open" || P.answer) return;
  const pz = P.pz;
  const next = S.play(pz, P.st, S.indexOf(pz, x, y));
  if (!next) {
    toast(t("error.illegal"), "warn");
    return;
  }
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
        const after = S.play(pz, P.st, S.indexOf(pz, r.x, r.y));
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
      const after = S.play(pz, P.st, S.indexOf(pz, r.x, r.y));
      if (after) {
        P.history.push(P.st);
        P.st = after;
        P.last = { x: r.x, y: r.y };
        Audio.stone(false);
      }
    } else {
      const after = S.play(pz, P.st, S.PASS);
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
  if (P.feedback === "solved") return P.result === "seki" ? "practice.solvedSeki" : "practice.solved";
  if (P.feedback === "ko") return "practice.onlyKo";
  // The position resets by itself after a wrong move, so the message says so
  // instead of pointing at buttons.
  if (P.feedback === "wrong") return P.result === "seki" && P.pz.userColor === P.pz.attacker ? "practice.onlySeki" : "practice.resetting";
  return null;
}

function finishProblem(P) {
  P.result = endResult(P);
  P.status = "won";
  P.feedback = "solved";
  P.busy = false;
  Audio.correct ? Audio.correct() : Audio.win();
  recordAttempt(P, true);
  announce(t(feedbackKey(P)));
  update();
  if (state.practice.view === "lesson" && state.practice.lesson?.cur === P) scheduleAutoContinue();
}

function recordAttempt(P, solved) {
  if (P.recorded) return;
  P.recorded = true;
  if (state.practice.view === "problem" && P.def) {
    markProblem(state.progress, P.def.id, { solved, clean: solved && !P.used });
    const d = state.practice.daily;
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

export function showAnswer() {
  const P = currentProblem();
  if (!P) return;
  P.used = true;
  const line = S.solutionLine(P.pz);
  Object.assign(P, problemState(P.pz), { used: true, recorded: P.recorded });
  P.answer = line.map((m, i) => ({ ...m, n: i + 1 }));
  P.status = "answer";
  if (!P.recorded) recordAttempt(P, false);
  update();
}

function advanceDaily() {
  const d = state.practice.daily;
  d.index = Math.min(d.items.length, d.index + 1);
  state.progress.daily = d;
  saveProgress(state.progress);
  if (d.index >= d.items.length) {
    touchStreak(state.progress);
    update((s) => {
      s.practice = { ...s.practice, view: "dailyDone", problem: null, mistake: null };
    });
    return;
  }
  openDailyItem(d);
}

export function nextProblem() {
  if (state.practice.daily) return advanceDaily();
  const P = state.practice.problem;
  const list = state.practice.theme ? problemsOfTheme(state.practice.theme) : problemsOfTopic(P.def.topic);
  const i = list.findIndex((p) => p.id === P.def.id);
  if (i >= 0 && i + 1 < list.length) openProblem(list[i + 1].id);
  else openTopic(P.def.topic, state.practice.theme);
}

export function prevProblem() {
  const P = state.practice.problem;
  if (!P || state.practice.daily) return;
  const list = state.practice.theme ? problemsOfTheme(state.practice.theme) : problemsOfTopic(P.def.topic);
  const i = list.findIndex((p) => p.id === P.def.id);
  if (i > 0) openProblem(list[i - 1].id);
}

function placePlay(x, y) {
  const C = state.practice.lesson.cur;
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
  return t("goal." + pz.goal, [color]);
}

/* ------------------------------------------------------ mistake drills */

/** Open one of your own mistakes as a "find the better move" drill. */
export function openMistakeDrill(id, { daily = null } = {}) {
  const m = state.progress.mistakes.find((x) => x.id === id);
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
    s.space = "practice";
    s.practice = { ...s.practice, view: "mistake", mistake: { m, game, status: "open", tries: 0, last: null, revealed: false }, problem: null, daily: daily || null };
  });
}

function mistakePlay(x, y) {
  const D = state.practice.mistake;
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
    markMistake(state.progress, D.m.id, { solved: D.tries === 1 && !D.revealed });
    const d = state.practice.daily;
    if (d && !d.done.includes(D.m.id)) d.done.push(D.m.id);
  } else {
    D.status = x === D.m.played.x && y === D.m.played.y ? "same" : "wrong";
    Audio.wrong?.();
  }
  update();
}

export function revealMistake() {
  const D = state.practice.mistake;
  if (!D) return;
  D.revealed = true;
  D.status = "revealed";
  markMistake(state.progress, D.m.id, { solved: false });
  update();
}

export function nextAfterMistake() {
  if (state.practice.daily) return advanceDaily();
  practiceHome();
}

export function mistakeTopic(m) {
  return m.theme ? THEME_TOPIC[m.theme] || null : null;
}
