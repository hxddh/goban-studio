/**
 * Verify the beginner course (src/web/js/content/course.js).
 *
 *   node scripts/check-course.mjs            check everything, one-line summary
 *   node scripts/check-course.mjs --lines    also print every problem's solution line
 *
 * Every problem step is proved with the solver: it must parse, have between
 * one and three correct first moves found by an exact search, and its
 * solution line must reach a won position, all in under two seconds. Every
 * place step must have in-range, empty accept points. Text must exist in all
 * four languages. Exits non-zero on any failure.
 */
import { COURSE } from "../src/web/js/content/course.js";
import { createPuzzle, solveFirstMoves, solutionLine, initialState, play, indexOf, status, parseDiagram } from "../src/web/js/solver.js";

const LANGS = ["zh", "en", "ko", "ja"];
const MIN_UNITS = 8;
const MIN_LESSONS = 36;
const MIN_STEPS = 150;
const MAX_PROBLEM_MS = 2000;
const showLines = process.argv.includes("--lines");

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

function checkText(where, field, value) {
  if (!value || typeof value !== "object") {
    fail(where, `missing ${field}`);
    return;
  }
  for (const lang of LANGS) {
    if (typeof value[lang] !== "string" || !value[lang].trim()) fail(where, `${field}.${lang} is empty`);
  }
}

/** Parse a diagram and return its grid; checks it fits the board at its placement. */
function placeDiagram(where, spec) {
  const size = spec.size || 19;
  let d;
  try {
    d = parseDiagram(spec.diagram);
  } catch (e) {
    fail(where, `diagram does not parse: ${e.message}`);
    return null;
  }
  let x0 = 0;
  let y0 = 0;
  if (spec.at) [x0, y0] = spec.at;
  else {
    const corner = spec.corner || "tl";
    if (corner.includes("r")) x0 = size - d.w;
    if (corner.includes("b")) y0 = size - d.h;
  }
  if (x0 < 0 || y0 < 0 || x0 + d.w > size || y0 + d.h > size) {
    fail(where, `diagram ${d.w}×${d.h} at ${x0},${y0} does not fit a ${size}×${size} board`);
    return null;
  }
  const grid = spec.diagram.map((r) => r.replace(/\s+/g, "").split(""));
  return { d, grid, size };
}

function pointLabel(p) {
  return `(${p.x},${p.y})`;
}

let units = 0;
let lessons = 0;
let steps = 0;
const kinds = { read: 0, problem: 0, place: 0 };
let slowest = { ms: 0, where: "" };
const lineReport = [];

const unitIds = new Set();
const lessonIds = new Set();

if (!Array.isArray(COURSE)) {
  console.error("COURSE is not an array");
  process.exit(1);
}

for (const unit of COURSE) {
  units++;
  const uw = `unit ${unit.id}`;
  if (!unit.id) fail(uw, "missing id");
  if (unitIds.has(unit.id)) fail(uw, "duplicate unit id");
  unitIds.add(unit.id);
  checkText(uw, "title", unit.title);
  checkText(uw, "summary", unit.summary);
  if (!Array.isArray(unit.lessons) || !unit.lessons.length) {
    fail(uw, "no lessons");
    continue;
  }
  for (const lesson of unit.lessons) {
    lessons++;
    const lw = `${unit.id}/${lesson.id}`;
    if (!lesson.id) fail(lw, "missing id");
    if (lessonIds.has(lesson.id) || unitIds.has(lesson.id)) fail(lw, "duplicate lesson id");
    lessonIds.add(lesson.id);
    checkText(lw, "title", lesson.title);
    const list = lesson.steps || [];
    if (list.length < 3 || list.length > 6) fail(lw, `has ${list.length} steps (want 3–6)`);
    let reads = 0;
    list.forEach((step, i) => {
      steps++;
      const sw = `${lw}#${i + 1}`;
      if (!(step.kind in kinds)) {
        fail(sw, `unknown kind ${step.kind}`);
        return;
      }
      kinds[step.kind]++;
      checkText(sw, "text", step.text);
      if (step.kind === "read") {
        reads++;
        if (i > 0 && list[i - 1].kind === "read") fail(sw, "two read steps in a row");
        if (step.board) {
          const placed = placeDiagram(sw, step.board);
          if (placed) {
            for (const m of step.board.marks || []) {
              if (!["circle", "triangle", "square", "label"].includes(m.type)) fail(sw, `bad mark type ${m.type}`);
              if (m.type === "label" && !m.label) fail(sw, "label mark without text");
              if (m.x < 0 || m.y < 0 || m.x >= placed.d.w || m.y >= placed.d.h) fail(sw, `mark ${pointLabel(m)} outside the diagram`);
            }
          }
        }
      } else if (step.kind === "place") {
        checkText(sw, "success", step.success);
        checkText(sw, "wrong", step.wrong);
        if (step.toMove !== 1 && step.toMove !== -1) fail(sw, "toMove must be 1 or -1");
        if (!step.board) {
          fail(sw, "place step without board");
          return;
        }
        const placed = placeDiagram(sw, step.board);
        if (!placed) return;
        if (!Array.isArray(step.accept) || !step.accept.length) {
          fail(sw, "accept is empty");
          return;
        }
        const seen = new Set();
        for (const p of step.accept) {
          const key = `${p.x},${p.y}`;
          if (seen.has(key)) fail(sw, `accept point ${pointLabel(p)} listed twice`);
          seen.add(key);
          if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= placed.d.w || p.y >= placed.d.h) {
            fail(sw, `accept point ${pointLabel(p)} out of range`);
            continue;
          }
          const ch = placed.grid[p.y][p.x] ?? ",";
          if (ch !== "." && ch !== ",") fail(sw, `accept point ${pointLabel(p)} is not empty ('${ch}')`);
        }
      } else if (step.kind === "problem") {
        checkText(sw, "success", step.success);
        const prob = step.problem;
        if (!prob) {
          fail(sw, "problem step without problem");
          return;
        }
        if (!placeDiagram(sw, prob)) return;
        const t0 = performance.now();
        let pz;
        try {
          pz = createPuzzle(prob);
        } catch (e) {
          fail(sw, `createPuzzle failed: ${e.message}`);
          return;
        }
        const first = solveFirstMoves(pz);
        if (!first.exact) fail(sw, "solveFirstMoves is not exact");
        if (first.correct.length < 1 || first.correct.length > 3) {
          fail(sw, `${first.correct.length} correct first moves (want 1–3): ${first.correct.map(pointLabel).join(" ")}`);
        }
        const line = solutionLine(pz);
        let st = initialState(pz);
        let legal = true;
        for (const m of line) {
          const next = play(pz, st, indexOf(pz, m.x, m.y));
          if (!next) {
            legal = false;
            break;
          }
          st = next;
        }
        if (!legal) fail(sw, "solution line contains an illegal move");
        const end = legal ? status(pz, st) : "illegal";
        if (end !== "won") fail(sw, `solution line ends ${end}, not won`);
        const ms = performance.now() - t0;
        if (ms > MAX_PROBLEM_MS) fail(sw, `took ${Math.round(ms)} ms (limit ${MAX_PROBLEM_MS})`);
        if (ms > slowest.ms) slowest = { ms, where: sw };
        if (showLines) {
          const local = (p) => {
            const d = parseDiagram(prob.diagram);
            const size = prob.size || 19;
            let x0 = 0;
            let y0 = 0;
            if (prob.at) [x0, y0] = prob.at;
            else {
              const corner = prob.corner || "tl";
              if (corner.includes("r")) x0 = size - d.w;
              if (corner.includes("b")) y0 = size - d.h;
            }
            return `${p.x - x0},${p.y - y0}`;
          };
          lineReport.push(
            `${sw} [${prob.goal}] correct: ${first.correct.map(local).join(" ")} | line: ${line
              .map((m) => `${m.c === 1 ? "B" : "W"}${local(m)}`)
              .join(" ")} (${Math.round(ms)} ms)\n    ${step.text.en}`,
          );
        }
      }
    });
    if (reads > 1) fail(lw, `${reads} read steps (at most one per lesson)`);
  }
}

if (units < MIN_UNITS) fail("course", `${units} units (want ≥ ${MIN_UNITS})`);
if (lessons < MIN_LESSONS) fail("course", `${lessons} lessons (want ≥ ${MIN_LESSONS})`);
if (steps < MIN_STEPS) fail("course", `${steps} steps (want ≥ ${MIN_STEPS})`);

if (showLines) console.log(lineReport.join("\n"));

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${failures.length} course check failure(s)`);
  process.exit(1);
}

console.log(
  `course ok: ${units} units, ${lessons} lessons, ${steps} steps (${kinds.problem} problem, ${kinds.place} place, ${kinds.read} read); slowest problem ${Math.round(slowest.ms)} ms`,
);
