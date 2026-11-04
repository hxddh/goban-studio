/**
 * Verify the practice problem set (src/web/js/content/problems.js).
 *
 * For every problem: unique id, known topic and goal, a theme from THEMES,
 * four-language title and hint, real-board rules (no `replay: false`: a
 * captured point can be played again), sealed life and death (a life, kill
 * or seki problem's key stones cannot reach a liberty outside the problem
 * area, which nobody may fill; see outsideReach() in solver.js), and the
 * solver's validate(): every chain
 * breathes, the start is not already decided, the first-move search is exact
 * with 1–3 correct first moves, a `ko: "ok"` problem really resolves to a ko
 * (and only ko problems have the "ko" theme), and the answer line is legal
 * and wins. A `goal: "seki"` problem must be proved a seki (no independent
 * life from the start, the answer ends in a position sekiInfo() calls seki)
 * and carry the "seki" theme; every "seki" theme problem has that goal. A
 * `shape` must name an entry of SHAPES (a classic textbook shape) with a
 * four-language name. The stored grade in problem-grades.json must match a fresh
 * measurement. Across problems: no two share a position under the 8 board
 * symmetries (and colour swap); no theme makes up more than 40% of any grade;
 * the whole check stays within its time budget and no single problem is slow.
 *
 * Exits non-zero on any failure; on success prints the per-topic and
 * per-theme counts, the grade histogram and the slowest problems.
 */
import fs from "node:fs";

import { PROBLEMS, SHAPES, THEMES } from "../src/web/js/content/problems.js";
import { GOALS as SOLVER_GOALS, createPuzzle, outsideReach, parseDiagram, validate } from "../src/web/js/solver.js";
import { GRADES_FILE, gradeProblem } from "./grade-problems.mjs";

const TOPICS = new Set(["capture", "escape", "connect", "life", "kill", "race", "technique"]);
const GOALS = new Set(SOLVER_GOALS);
const LANGS = ["zh", "en", "ko", "ja"];
const MAX_CORRECT = 3;
const TIME_BUDGET_MS = 90000;
const MAX_PROBLEM_MS = 1500;
const MAX_THEME_SHARE = 0.4;

const failures = [];
const fail = (id, msg) => failures.push(`${id}: ${msg}`);

/** Stones on the full board, coloured relative to the key stones. */
function boardStones(problem) {
  const pz = createPuzzle(problem);
  const keySet = new Set(pz.keys.map((k) => `${k.x},${k.y}`));
  return {
    size: pz.size,
    stones: pz.stones.map((s) => ({ x: s.x, y: s.y, c: s.c === pz.keyColor ? "k" : "a", key: keySet.has(`${s.x},${s.y}`) })),
  };
}

/**
 * A position key that is the same for every rotation/reflection of the
 * board, for colour-swapped copies, and for copies slid along an edge: the
 * stones relative to their bounding box plus each edge's distance (capped,
 * since a far edge plays no part).
 */
function canonicalKey({ size, stones }) {
  const n = size - 1;
  const syms = [
    (x, y) => [x, y],
    (x, y) => [n - x, y],
    (x, y) => [x, n - y],
    (x, y) => [n - x, n - y],
    (x, y) => [y, x],
    (x, y) => [n - y, x],
    (x, y) => [y, n - x],
    (x, y) => [n - y, n - x],
  ];
  let best = null;
  for (const f of syms) {
    const pts = stones.map((s) => {
      const [x, y] = f(s.x, s.y);
      return { x, y, t: s.c + (s.key ? "!" : "") };
    });
    const x0 = Math.min(...pts.map((p) => p.x));
    const y0 = Math.min(...pts.map((p) => p.y));
    const x1 = Math.max(...pts.map((p) => p.x));
    const y1 = Math.max(...pts.map((p) => p.y));
    const cap = (d) => Math.min(d, 4);
    const edges = [cap(x0), cap(y0), cap(n - x1), cap(n - y1)].join(",");
    const body = pts
      .map((p) => `${p.x - x0}.${p.y - y0}${p.t}`)
      .sort()
      .join(" ");
    const key = `${size}|${edges}|${body}`;
    if (best === null || key < best) best = key;
  }
  return best;
}

const themeIds = new Set();
if (!Array.isArray(THEMES) || !THEMES.length) fail("THEMES", "problems.js must export a non-empty THEMES list");
for (const t of THEMES || []) {
  if (!/^[a-z]+(-[a-z]+)*$/.test(t.id || "")) fail("THEMES", `bad theme id ${t.id}`);
  if (themeIds.has(t.id)) fail("THEMES", `duplicate theme ${t.id}`);
  themeIds.add(t.id);
  for (const lang of LANGS) if (typeof t.name?.[lang] !== "string" || !t.name[lang].trim()) fail("THEMES", `${t.id} name.${lang} is empty`);
}

const shapeIds = new Set();
for (const sh of SHAPES || []) {
  if (!/^[a-z]+(-[a-z]+)*$/.test(sh.id || "")) fail("SHAPES", `bad shape id ${sh.id}`);
  if (shapeIds.has(sh.id)) fail("SHAPES", `duplicate shape ${sh.id}`);
  shapeIds.add(sh.id);
  for (const lang of LANGS) if (typeof sh.name?.[lang] !== "string" || !sh.name[lang].trim()) fail("SHAPES", `${sh.id} name.${lang} is empty`);
}

let stored = {};
try {
  stored = JSON.parse(fs.readFileSync(GRADES_FILE, "utf8"));
} catch (error) {
  fail("problem-grades.json", `cannot read (${error.message}); run node scripts/grade-problems.mjs`);
}

const t0 = performance.now();
const ids = new Set();
const positions = new Map();
const timings = [];

for (const p of PROBLEMS) {
  const id = p.id || "(missing id)";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(id, "id must be kebab-case");
  if (ids.has(id)) fail(id, "duplicate id");
  ids.add(id);
  if (!TOPICS.has(p.topic)) fail(id, `unknown topic ${p.topic}`);
  if (!GOALS.has(p.goal)) fail(id, `unknown goal ${p.goal}`);
  if (!themeIds.has(p.theme)) fail(id, `theme ${p.theme} is not in THEMES`);
  if ((p.ko === "ok") !== (p.theme === "ko")) fail(id, 'theme "ko" and ko: "ok" go together (a ko problem is one whose best result is a ko)');
  if ((p.goal === "seki") !== (p.theme === "seki")) fail(id, 'theme "seki" and goal: "seki" go together (a seki problem is one whose best result is seki)');
  if (p.shape !== undefined && !shapeIds.has(p.shape)) fail(id, `shape ${p.shape} is not in SHAPES`);
  for (const field of ["title", "hint"]) {
    for (const lang of LANGS) {
      const text = p[field]?.[lang];
      if (typeof text !== "string" || !text.trim()) fail(id, `${field}.${lang} is empty`);
    }
  }
  try {
    parseDiagram(p.diagram);
  } catch (error) {
    fail(id, `bad diagram: ${error.message}`);
    continue;
  }

  const started = performance.now();
  let graded;
  try {
    graded = gradeProblem(p);
  } catch (error) {
    fail(id, `createPuzzle/difficulty threw: ${error.message}`);
    continue;
  }
  const { pz, d, entry } = graded;
  // Real-board rules: captured points are always back in play, and a life
  // or kill problem's key stones may not breathe through a point nobody may
  // play (a race's walls are taken as alive; see outsideReach()).
  if (p.replay === false) fail(id, "replay: false is not allowed (captured points are always back in play)");
  if (pz.lifeGoal) {
    const reach = outsideReach(pz, { throughCaptures: p.topic !== "race" });
    if (reach.length) fail(id, `the key stones can reach a liberty outside the problem area at ${reach.map((q) => `(${q.x},${q.y})`).join(" ")}`);
  }
  // difficulty() has already run solveFirstMoves() and solutionLine();
  // validate() reuses them for the remaining checks.
  const v = validate(pz, { maxCorrect: MAX_CORRECT, first: { correct: d.correct, exact: d.exact }, line: d.line });
  for (const reason of v.reasons) fail(id, reason);
  if (p.ko === "ok" && v.result !== "ko") fail(id, "does not resolve to a ko");
  if (p.goal === "seki" && v.result !== "seki") fail(id, "does not resolve to seki");
  let ms = performance.now() - started;
  // The limit is about a problem's own cost: a single run can be slowed by
  // a garbage-collection pause or a busy runner, so a problem over the
  // limit is proved once more and fails only if that run is slow too.
  if (ms > MAX_PROBLEM_MS) {
    const again = performance.now();
    const g2 = gradeProblem(p);
    validate(g2.pz, { maxCorrect: MAX_CORRECT, first: { correct: g2.d.correct, exact: g2.d.exact }, line: g2.d.line });
    ms = Math.min(ms, performance.now() - again);
  }
  timings.push({ id, ms });
  if (ms > MAX_PROBLEM_MS) fail(id, `took ${(ms / 1000).toFixed(2)}s twice (limit ${MAX_PROBLEM_MS / 1000}s)`);

  const want = JSON.stringify(entry);
  const have = JSON.stringify(stored[id]);
  if (want !== have) fail(id, `stored grade ${have} differs from measured ${want}; run node scripts/grade-problems.mjs`);

  try {
    const key = canonicalKey(boardStones(p));
    if (positions.has(key)) fail(id, `same position as ${positions.get(key)} (under symmetry/colour swap)`);
    else positions.set(key, id);
  } catch (error) {
    fail(id, `position key: ${error.message}`);
  }
}

for (const id of Object.keys(stored)) if (!ids.has(id)) fail(id, "graded in problem-grades.json but not in PROBLEMS");
if (JSON.stringify(Object.keys(stored)) !== JSON.stringify(PROBLEMS.map((p) => p.id))) {
  fail("problem-grades.json", "keys or key order differ from PROBLEMS; run node scripts/grade-problems.mjs");
}

// No grade may be dominated by one theme.
const byGrade = [{}, {}, {}, {}, {}];
const hist = [0, 0, 0, 0, 0];
for (const p of PROBLEMS) {
  const g = stored[p.id]?.grade;
  if (!(g >= 1 && g <= 5)) continue;
  hist[g - 1]++;
  byGrade[g - 1][p.theme] = (byGrade[g - 1][p.theme] || 0) + 1;
}
byGrade.forEach((themes, k) => {
  for (const [theme, n] of Object.entries(themes)) {
    if (n > MAX_THEME_SHARE * hist[k]) fail(`grade ${k + 1}`, `${theme} is ${n} of ${hist[k]} problems (max ${MAX_THEME_SHARE * 100}%)`);
  }
});

const total = performance.now() - t0;
if (total > TIME_BUDGET_MS) fail("runtime", `${(total / 1000).toFixed(1)}s exceeds ${TIME_BUDGET_MS / 1000}s`);

timings.sort((a, b) => b.ms - a.ms);
const slowest = timings
  .slice(0, 5)
  .map((t) => `${t.id} ${(t.ms / 1000).toFixed(2)}s`)
  .join(", ");

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${failures.length} problem check failure(s); slowest: ${slowest}`);
  process.exit(1);
}

const count = (key, keep = () => true) => {
  const out = {};
  for (const p of PROBLEMS.filter(keep)) out[p[key]] = (out[p[key]] || 0) + 1;
  return Object.entries(out)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
};
console.log(
  `problems ok: ${PROBLEMS.length} in ${(total / 1000).toFixed(1)}s\n` +
    `  topics: ${count("topic")}\n` +
    `  themes: ${count("theme")}\n` +
    `  classic shapes: ${PROBLEMS.filter((p) => p.shape).length} (${count("shape", (p) => p.shape)})\n` +
    `  grades 1-5: ${hist.join(" / ")}\n` +
    `  slowest: ${slowest}`,
);
