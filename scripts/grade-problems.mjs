/**
 * Measure the difficulty of every practice problem with the solver and write
 * src/web/js/content/problem-grades.json, so the app never grades at runtime.
 *
 *   node scripts/grade-problems.mjs          write the grades file
 *   node scripts/grade-problems.mjs --print  print the grade histogram only
 *
 * The grade is the solver's `difficulty(pz).score` bucketed by GRADE_CUTS
 * from problems.js (when present) or by the solver's own thresholds.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PROBLEMS, GRADE_CUTS } from "../src/web/js/content/problems.js";
import { createPuzzle, difficulty } from "../src/web/js/solver.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GRADES_FILE = path.join(root, "src/web/js/content/problem-grades.json");

/** Bucket a solver score into a 1–5 grade. */
export function gradeFor(score, solverGrade) {
  if (!Array.isArray(GRADE_CUTS)) return solverGrade;
  let grade = 1;
  for (const cut of GRADE_CUTS) if (score >= cut) grade++;
  return grade;
}

/** Grade one problem from scratch. Also returns the raw solver result. */
export function gradeProblem(problem) {
  const pz = createPuzzle(problem);
  const d = difficulty(pz);
  return {
    pz,
    d,
    entry: {
      grade: gradeFor(d.score, d.grade),
      score: d.score,
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
  console.log(
    `${printOnly ? "graded" : "wrote"} ${Object.keys(grades).length} problems in ${secs}s; grades 1-5: ${hist.join(" / ")}`,
  );
}
