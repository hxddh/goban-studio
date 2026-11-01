/**
 * Verify the practice problem set (src/web/js/content/problems.js).
 *
 * For every problem: unique id, four-language title and hint, the solver can
 * build and fully solve it, it has 1–3 correct first moves, the solver's
 * answer line actually wins when replayed, and the stored grade in
 * problem-grades.json matches a fresh measurement. Across problems: no two
 * share a position under the 8 board symmetries (and colour swap), and the
 * whole check stays within its time budget.
 *
 * Exits non-zero on any failure; prints a one-line summary on success.
 */
import fs from "node:fs";

import { PROBLEMS } from "../src/web/js/content/problems.js";
import { createPuzzle, initialState, play, indexOf, status, parseDiagram } from "../src/web/js/solver.js";
import { GRADES_FILE, gradeProblem } from "./grade-problems.mjs";

const TOPICS = new Set(["capture", "escape", "connect", "life", "kill", "race", "technique"]);
const GOALS = new Set(["capture", "save", "kill", "live"]);
const LANGS = ["zh", "en", "ko", "ja"];
const MAX_CORRECT = 3;
const TIME_BUDGET_MS = 60000;

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

/** True when every chain on the board has at least one liberty. */
function everyChainBreathes(pz, board) {
  const n = pz.size;
  const seen = new Uint8Array(board.length);
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || seen[i]) continue;
    let libs = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % n;
      const y = (p / n) | 0;
      const nbrs = [x > 0 ? p - 1 : -1, x < n - 1 ? p + 1 : -1, y > 0 ? p - n : -1, y < n - 1 ? p + n : -1];
      for (const q of nbrs) {
        if (q < 0) continue;
        if (board[q] === 0) libs++;
        else if (board[q] === board[i] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (!libs) return false;
  }
  return true;
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
  // difficulty() runs solveFirstMoves() and solutionLine() on this puzzle.
  if (!d.exact) fail(id, "solveFirstMoves is not exact (ko, depth or budget)");
  if (d.correct.length < 1) fail(id, "no correct first move");
  if (d.correct.length > MAX_CORRECT) fail(id, `${d.correct.length} correct first moves (max ${MAX_CORRECT})`);

  let st = initialState(pz);
  // The start must be undecided: e.g. a capture target that already has
  // `escape` liberties counts as escaped before the learner moves.
  if (!everyChainBreathes(pz, st.board)) fail(id, "a chain in the diagram has no liberties");
  const start = status(pz, st);
  if (start !== "open") fail(id, `starting position is already ${start}`);
  let legal = true;
  for (const m of d.line) {
    const next = play(pz, st, indexOf(pz, m.x, m.y));
    if (!next || st.toMove !== m.c) {
      legal = false;
      break;
    }
    st = next;
  }
  if (!legal) fail(id, "solution line contains an illegal move");
  else if (status(pz, st) !== "won") fail(id, "solution line does not end in a win");
  timings.push({ id, ms: performance.now() - started });

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

const byTopic = {};
for (const p of PROBLEMS) byTopic[p.topic] = (byTopic[p.topic] || 0) + 1;
const hist = [0, 0, 0, 0, 0];
for (const p of PROBLEMS) hist[stored[p.id].grade - 1]++;
console.log(
  `problems ok: ${PROBLEMS.length} (${Object.entries(byTopic)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")}; grades ${hist.join("/")}) in ${(total / 1000).toFixed(1)}s; slowest: ${slowest}`,
);
