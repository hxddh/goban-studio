/**
 * Every problem is still a proved problem after the review transform
 * (src/web/js/practice/transform.js): turned or mirrored and, except endgame
 * problems, with the colours swapped. For each problem the transformed
 * definition must pass the solver's validate() (exact first-move search,
 * 1–3 correct moves, a winning answer line, ko and seki results kept),
 * its correct first moves must be exactly the stored ones mapped through
 * the symmetry, and a swapped problem must be played by the other colour.
 *
 *   node scripts/check-transforms.mjs        the whole bank (a random transform each, seeded)
 *   node scripts/check-transforms.mjs 60     a deterministic sample of 60
 *   node scripts/check-transforms.mjs --all-syms   every allowed symmetry of every
 *                                            problem (about 3 minutes), to keep
 *                                            the exceptions in transform.js exact
 *
 * The unit tests (scripts/tests/practice-transform.mjs) run the sample.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PROBLEMS } from "../src/web/js/content/problems.js";
import { createPuzzle, difficulty, validate } from "../src/web/js/solver.js";
import { allowedSyms, canSwap, hash, mapPoint, transformProblem } from "../src/web/js/practice/transform.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRADES = JSON.parse(fs.readFileSync(path.join(root, "src/web/js/content/problem-grades.json"), "utf8"));

/** The transform tried for one problem: one of its symmetries (not the identity where it has others), swapped where allowed. */
export function transformFor(def) {
  const h = hash(`check:${def.id}`);
  const syms = allowedSyms(def).filter((k) => k !== 0);
  return { sym: syms.length ? syms[h % syms.length] : 0, swap: canSwap(def) };
}

/** Problems of a deterministic sample of `n` (spread over the bank), or all. */
export function sample(n = null) {
  if (!n || n >= PROBLEMS.length) return PROBLEMS;
  const step = PROBLEMS.length / n;
  return Array.from({ length: n }, (_, i) => PROBLEMS[Math.floor(i * step)]);
}

/** Reasons the transformed problem fails, empty when it is fine. */
export function checkTransformed(def, t = transformFor(def)) {
  const reasons = [];
  const next = transformProblem(def, t);
  if (next.id !== def.id) reasons.push("the id changed");
  let pz;
  let orig;
  try {
    pz = createPuzzle(next);
    orig = createPuzzle(def);
  } catch (error) {
    return [`createPuzzle threw: ${error.message}`];
  }
  const d = difficulty(pz);
  const v = validate(pz, { maxCorrect: 3, first: { correct: d.correct, exact: d.exact }, line: d.line });
  reasons.push(...v.reasons);
  if (def.ko === "ok" && v.result !== "ko") reasons.push("no longer resolves to a ko");
  if (def.goal === "seki" && v.result !== "seki") reasons.push("no longer resolves to seki");
  const size = def.size || 19;
  const want = (GRADES[def.id]?.correct || [])
    .map((c) => mapPoint(c.x, c.y, size, t.sym))
    .map((p) => `${p.x},${p.y}`)
    .sort()
    .join(" ");
  const have = d.correct
    .map((p) => `${p.x},${p.y}`)
    .sort()
    .join(" ");
  if (want !== have) reasons.push(`correct moves ${have} are not the stored ones mapped (${want})`);
  if (t.swap && canSwap(def) && pz.userColor !== -orig.userColor) reasons.push("swapped colours but the same side plays");
  return reasons;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const all = process.argv.includes("--all-syms");
  const n = Number(process.argv[2]) || null;
  const t0 = performance.now();
  const list = sample(n);
  let bad = 0;
  for (const def of list) {
    const ts = all ? allowedSyms(def).map((sym) => ({ sym, swap: canSwap(def) && sym % 2 === 1 })) : [transformFor(def)];
    for (const t of ts) {
      const reasons = checkTransformed(def, t);
      if (reasons.length) {
        bad++;
        console.error(`FAIL ${def.id} ${JSON.stringify(t)}: ${reasons.join("; ")}`);
      }
    }
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  if (bad) {
    console.error(`${bad} of ${list.length} transformed problems failed (${secs}s)`);
    process.exit(1);
  }
  console.log(`transforms ok: ${list.length} problems turned/mirrored and recoloured in ${secs}s`);
}
