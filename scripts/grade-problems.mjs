/**
 * Grade every practice problem and write src/web/js/content/problem-grades.json,
 * so the app never grades at runtime.
 *
 *   node scripts/grade-problems.mjs          write the grades file
 *   node scripts/grade-problems.mjs --print  print the grade histogram only
 *
 * v13: the grade estimates how hard a problem is for a person, not how
 * much work it is for the solver (docs/problems-audit.md, "v13 grading").
 * Until v12 the grade was the quintile of the solver's search effort, so a
 * plain seven-move ladder (huge search, one obvious move after another)
 * came out at grade 5 and a one-move capture at grade 3. The score is now
 *
 *   base(theme)                          the idea itself (capture < escape <
 *                                        snapback/net < eye shapes < races,
 *                                        ko and seki)
 *   + reading                            Σ over the defender's replies in the
 *                                        answer line of w(b): b is how many
 *                                        defences need an answer there, so a
 *                                        forced reply (a ladder's extension)
 *                                        adds little and a real branch a lot;
 *                                        halved on the open board (capture /
 *                                        save), where each push meets the
 *                                        obvious block
 *   + 0.45·log2(1 + plausible wrong first moves)
 *   − 0.35·(correct first moves − 1)
 *   + 0.05·log2(1 + solver nodes)        a trace of the search effort
 *
 * with w(0) = 0.1 and w(b) = min(1, 0.15 + 0.2·(b − 1)). Endgame problems
 * (counted, not read) use base(theme) + 0.35·max(0, counting score − 4).
 * The score is bucketed by GRADE_CUTS from problems.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as content from "../src/web/js/content/problems.js";
import { createPuzzle, difficulty, initialState, play, status } from "../src/web/js/solver.js";

const { PROBLEMS, GRADE_CUTS } = content;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GRADES_FILE = path.join(root, "src/web/js/content/problem-grades.json");

/** How hard the idea itself is, before any reading (see the header). */
export const THEME_BASE = {
  atari: 0,
  "capture-to-save": 0.2,
  ladder: 0.2,
  escape: 0.4,
  connect: 0.4,
  "double-atari": 0.5,
  cut: 0.6,
  net: 0.6,
  snapback: 0.9,
  "throw-in": 1.1,
  "connect-and-die": 1.1,
  shortage: 1.2,
  "capture-eye": 1.4,
  "eye-space": 1.5,
  "vital-point": 1.6,
  "false-eye": 1.8,
  placement: 1.8,
  "race-outside": 1.8,
  race: 2.0,
  "race-eye": 2.2,
  "race-big-eye": 2.6,
  ko: 2.7,
  seki: 2.8,
  "hane-connect": 1.0,
  "sente-gote": 1.6,
  "double-sente": 1.9,
  "monkey-jump": 2.0,
  deiri: 2.0,
  "reverse-sente": 2.1,
  "endgame-compare": 2.4,
};

/** Weight of one defender reply with `b` defences that need an answer. */
export const branchWeight = (b) => (b <= 0 ? 0.1 : Math.min(1, 0.15 + 0.2 * (b - 1)));

/** Bucket a score into a 1–5 grade. */
export function gradeFor(score) {
  let grade = 1;
  for (const cut of GRADE_CUTS) if (score >= cut) grade++;
  return grade;
}

const round2 = (v) => Math.round(v * 100) / 100;

function neighbours(size, p) {
  const x = p % size;
  const y = (p / size) | 0;
  const out = [];
  if (x > 0) out.push(p - 1);
  if (x < size - 1) out.push(p + 1);
  if (y > 0) out.push(p - size);
  if (y < size - 1) out.push(p + size);
  return out;
}

/** The chain at `i`: { stones, libs } (sets of indices). */
function chainAt(size, board, i) {
  const c = board[i];
  const stones = new Set([i]);
  const libs = new Set();
  const stack = [i];
  while (stack.length) {
    const p = stack.pop();
    for (const q of neighbours(size, p)) {
      if (board[q] === 0) libs.add(q);
      else if (board[q] === c && !stones.has(q)) {
        stones.add(q);
        stack.push(q);
      }
    }
  }
  return { stones, libs };
}

const keyIndices = (pz) => pz.keys.map((k) => k.y * pz.size + k.x);

/** Every point either side may play: the region (with its stones' points), else the diagram. */
function playArea(pz) {
  if (pz.region) return [...new Set([...pz.region, ...pz.stones].map((p) => p.y * pz.size + p.x))];
  const out = [];
  const b = pz.box;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) out.push(y * pz.size + x);
  return out;
}

/**
 * The points a person would consider: the whole region of a life-and-death
 * problem; on the open board the key stones' liberties and the liberties of
 * the attacking chains next to them that are short of liberties.
 */
function plausiblePoints(pz, st, area) {
  if (pz.region) return area;
  const set = new Set();
  for (const k of keyIndices(pz)) {
    if (st.board[k] !== pz.keyColor) continue;
    const own = chainAt(pz.size, st.board, k);
    for (const l of own.libs) set.add(l);
    for (const s of own.stones) {
      for (const q of neighbours(pz.size, s)) {
        if (st.board[q] !== -pz.keyColor) continue;
        const enemy = chainAt(pz.size, st.board, q);
        if (enemy.libs.size <= 2) for (const l of enemy.libs) set.add(l);
      }
    }
  }
  return [...set];
}

/** The attacking learner can take a key stone at once. */
function captureNow(pz, st) {
  for (const k of keyIndices(pz)) {
    if (st.board[k] !== pz.keyColor) return true;
    const { libs } = chainAt(pz.size, st.board, k);
    if (libs.size === 1 && play(pz, st, [...libs][0])) return true;
  }
  return false;
}

/**
 * The human features of a (non-endgame) problem from its answer line:
 * { branches: [b per defender reply], plausibleWrong }.
 */
export function features(pz, d) {
  const area = playArea(pz);
  const attack = pz.userColor === pz.attacker;
  const correct = new Set(d.correct.map((c) => c.y * pz.size + c.x));
  const st0 = initialState(pz);
  let plausibleWrong = 0;
  for (const q of plausiblePoints(pz, st0, area)) if (!correct.has(q) && play(pz, st0, q)) plausibleWrong++;
  const branches = [];
  let st = st0;
  for (const m of d.line) {
    if (m.c !== pz.userColor) {
      // Defences that need an answer: legal, not met by an immediate
      // capture, and not already settled for the learner.
      let b = 0;
      for (const q of plausiblePoints(pz, st, area)) {
        const next = play(pz, st, q);
        if (!next || (attack && captureNow(pz, next))) continue;
        if (status(pz, next) !== "won") b++;
      }
      branches.push(b);
    }
    st = play(pz, st, m.y * pz.size + m.x);
    if (!st) break;
  }
  return { branches, plausibleWrong };
}

/** The human score of a problem (see the header). */
export function humanScore(problem, pz, d) {
  const base = THEME_BASE[problem.theme] ?? 1.5;
  if (pz.counting) return { score: round2(base + 0.35 * Math.max(0, d.score - 4)), reading: 0, wrong: Math.max(0, d.userMoves - 1) };
  const f = features(pz, d);
  const open = pz.goal === "capture" || pz.goal === "save";
  const reading = f.branches.reduce((s, b) => s + (open ? 0.5 : 1) * branchWeight(b), 0);
  const score = base + reading + 0.45 * Math.log2(1 + f.plausibleWrong) - 0.35 * (d.correct.length - 1) + 0.05 * Math.log2(1 + d.nodes);
  return { score: round2(score), reading: round2(reading), wrong: f.plausibleWrong };
}

/** Grade one problem from scratch. Also returns the raw solver result. */
export function gradeProblem(problem) {
  const pz = createPuzzle(problem);
  const d = difficulty(pz);
  const h = humanScore(problem, pz, d);
  return {
    pz,
    d,
    entry: {
      grade: gradeFor(h.score),
      score: h.score,
      reading: h.reading,
      wrong: h.wrong,
      moves: d.userMoves,
      correct: d.correct.map(({ x, y }) => ({ x, y })),
    },
  };
}

export function gradeAll(onEach) {
  const out = {};
  for (const p of PROBLEMS) {
    const t0 = performance.now();
    const { entry, d } = gradeProblem(p);
    out[p.id] = entry;
    if (onEach) onEach(p, entry, d, performance.now() - t0);
  }
  return out;
}

export function serialize(grades) {
  return `${JSON.stringify(grades, null, 2)}\n`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const printOnly = process.argv.includes("--print");
  const t0 = performance.now();
  const grades = gradeAll();
  const hist = [0, 0, 0, 0, 0];
  for (const g of Object.values(grades)) hist[g.grade - 1]++;
  if (!printOnly) fs.writeFileSync(GRADES_FILE, serialize(grades));
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`${printOnly ? "graded" : "wrote"} ${Object.keys(grades).length} problems in ${secs}s; grades 1-5: ${hist.join(" / ")}`);
}
