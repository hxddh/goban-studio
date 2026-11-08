/**
 * Check the course's "place" and "read" steps with KataGo (docs/lesson-audit.md).
 *
 *   node scripts/check-lessons-katago.mjs list
 *       one line per step that is checked (no engine needed)
 *   node scripts/check-lessons-katago.mjs run --katago PATH --model PATH --out FILE
 *       [--shard i/n] [--root-visits 1600] [--move-visits 600] [--threads 4] [--only ID,ID]
 *       run KataGo's analysis engine on this shard's steps and write their results
 *   node scripts/check-lessons-katago.mjs report FILE...
 *       merge shard results into docs/lesson-audit.json and rewrite the generated part of
 *       docs/lesson-audit.md (between the "generated" markers; the rest is kept)
 *
 * Problem steps are proved by the solver (scripts/check-course.mjs); this
 * script looks at what the solver cannot judge.
 *
 * Place steps. Each accepted point, KataGo's best move on the whole board and
 * its best move in the step's local area (the diagram's window, or the box
 * around the accepted points) are played and the position after each is
 * searched with the same visits, so every move is valued the same way: the
 * score lead for the side to move. A step has a view (VIEW below): "whole"
 * when the lesson is about choosing between areas of the board, "local" when
 * it is about one corner, shape or fight (on a toy board KataGo's whole-board
 * best is often an empty corner the lesson is not about), and "rule" when it
 * teaches a rule or how to place a stone; rule steps are reported but never
 * judged. A point loses when it is more than LOSE points behind the best move
 * of the step's view, and is doubtful past OK. A move of that view within
 * EQUAL points of the best accepted point that is not accepted is listed as
 * an equal alternative.
 *
 * Read steps. A factual claim about a position (CLAIMS below) is checked with
 * the score lead, ownership, a comparison of two moves or the expected answer
 * to a move. Every other read step with a board is listed for human review
 * with the reason it cannot be checked this way.
 *
 * Rules are Japanese with 6.5 komi, as in the course. KataGo and the network
 * are never part of the repository (.github/workflows/lesson-check.yml
 * downloads them and checks their SHA-256).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COURSE } from "../src/web/js/content/course.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OK = 1.5;
const LOSE = 2.5;
const EQUAL = 0.3;
const KOMI = 6.5;
const LETTERS = "ABCDEFGHJKLMNOPQRST";

/* ------------------------------------------------------------- the steps */

/** The view of each lesson's place steps (default: the unit's). */
const UNIT_VIEW = {
  stones: "rule",
  capture: "local",
  escape: "local",
  connect: "local",
  life: "local",
  kill: "local",
  race: "local",
  game: "local",
  opening: "local",
  joseki: "local",
  shape: "local",
  endgame: "local",
  fighting: "whole",
  "adv-judgement": "whole",
  "adv-invasion": "local",
  "adv-life": "local",
  "adv-tesuji": "local",
  "adv-middle": "whole",
  "adv-opening": "whole",
  "adv-joseki": "local",
  "adv-handicap": "whole",
};
const LESSON_VIEW = {
  "game-order": "whole",
  "game-opening": "whole",
  "opening-corner-points": "rule",
  "opening-big-urgent": "whole",
  "opening-review": "whole",
  "adv-invade-where": "whole",
  "endgame-order": "whole",
  "fight-attack-distance": "local",
  "adv-joseki-choose": "whole",
  "adv-handicap-simple": "local",
};
/** Single steps whose click only points at something (an eye), so a move's value says nothing. */
const STEP_VIEW = {
  "life-eye#1": "rule",
  "life-false-eye#1": "rule",
};

/**
 * Factual claims of read steps, by step id. Points are diagram-local [x, y].
 *   lead    the score lead (Black's view) with `toMove` to play is `value` ± `tol`
 *   owner   the points belong to `color` (mean ownership ≥ `min`)
 *   better  move `a` is not worse than move `b` (by more than `tol`) for `toMove`
 *   answer  after `toMove` plays `move`, the opponent's best reply is one of `expect`
 * A string is a note for human review instead.
 */
const CLAIMS = {
  "game-territory#0": [
    { type: "owner", toMove: 1, what: "the left side is Black's", color: 1, min: 0.8, pts: [[0, 0], [2, 2], [1, 4], [2, 8]] },
    { type: "owner", toMove: 1, what: "the right side is White's", color: -1, min: 0.8, pts: [[8, 0], [7, 4], [6, 6], [8, 8]] },
  ],
  "game-score#0": [{ type: "lead", toMove: 1, what: "White wins by 3.5", value: -3.5, tol: 1 }],
  "game-dead#0": [{ type: "owner", toMove: 1, what: "the marked white stone is dead", color: 1, min: 0.7, pts: [[1, 1]] }],
  "life-two-eyes#0": [{ type: "owner", toMove: -1, what: "the black group with two eyes is alive", color: 1, min: 0.8, pts: [[1, 1], [3, 1], [0, 1]] }],
  "kill-straight-three#0": [{ type: "owner", toMove: 1, what: "after Black's middle point White is dead", color: 1, min: 0.7, pts: [[0, 1], [3, 1]], after: [[1, 0, 1]] }],
  "endgame-sente-gote#0": [{ type: "answer", toMove: 1, what: "White must block Black's push on the first line", move: [4, 8], expect: [[5, 8]] }],
  "endgame-double-sente#0": [
    { type: "answer", toMove: 1, what: "after Black plays the marked point White must connect", move: [4, 5], expect: [[5, 4]] },
    { type: "answer", toMove: -1, what: "after White plays the marked point Black must connect", move: [4, 5], expect: [[3, 6]] },
  ],
  "endgame-reverse-sente#0": [{ type: "answer", toMove: 1, what: "White must answer Black's push on the first line", move: [4, 8], expect: [[5, 8]] }],
  "adv-judge-bigger#0": [{ type: "better", toMove: 1, what: "A is bigger than B", a: [9, 3], b: [3, 9], tol: 0.5 }],
  "adv-judge-toward-thickness#0": [
    { type: "owner", toMove: 1, what: "White has lived low inside Black's wall", color: -1, min: 0.6, pts: [[2, 2], [2, 3], [2, 4], [2, 5]] },
    { type: "better", toMove: 1, what: "the pincer A is better than the press B", a: [12, 3], b: [6, 2], tol: 0.5 }],
  "adv-judge-away#0": [{ type: "better", toMove: 1, what: "extending up the right side (A) is better than along the bottom (B)", a: [15, 9], b: [10, 16], tol: 0.5 }],
  "adv-reduce-shoulder#0": [{ type: "better", toMove: 1, what: "the two shoulder hits are about equal", a: [8, 3], b: [10, 3], tol: 1, both: true }],
  "adv-middle-attack-gain#0": [{ type: "better", toMove: 1, what: "A and B are about equal", a: [2, 7], b: [2, 11], tol: 1, both: true }],
  "adv-open-direction#0": [{ type: "better", toMove: 1, what: "the approach from the top (A) is not worse than from the left (B)", a: [5, 2], b: [2, 5], tol: 0.5 }],
  "adv-open-urgent#0": [{ type: "better", toMove: 1, what: "living in the corner (A) comes before the empty corner (B)", a: [0, 18], b: [15, 15], tol: 0.5 }],
  "opening-big-urgent#0": [{ type: "better", toMove: 1, what: "the urgent cutting point comes before the big empty corner", a: [8, 3], b: [15, 15], tol: 0.5 }],
};

/** Why an unlisted read step with a board is not checked by the engine. */
const REVIEW = {
  rule: "states a rule; the board only illustrates it",
  tactic: "a tactical idea that the lesson's problem steps prove with the solver",
  principle: "a general principle (opening, shape, joseki, strategy) that a single position cannot prove",
};
const REVIEW_OF = {
  stones: "rule",
  capture: "tactic",
  escape: "tactic",
  connect: "rule",
  life: "rule",
  kill: "tactic",
  race: "tactic",
  game: "rule",
  "adv-life": "tactic",
  "adv-tesuji": "tactic",
};

/** Every step the audit looks at, with its board position. */
export function lessonSteps() {
  const out = [];
  for (const unit of COURSE)
    for (const lesson of unit.lessons)
      lesson.steps.forEach((step, i) => {
        if (step.kind !== "place" && step.kind !== "read") return;
        if (!step.board) return;
        const id = `${lesson.id}#${i}`;
        out.push({
          id,
          unit: unit.id,
          lesson: lesson.id,
          index: i,
          kind: step.kind,
          view: step.kind === "place" ? STEP_VIEW[id] || LESSON_VIEW[lesson.id] || UNIT_VIEW[unit.id] || "local" : null,
          step,
          pos: positionOf(step.board),
        });
      });
  return out;
}

/** The board of a step: size, stones in board coordinates, the diagram's offset and the local area. */
export function positionOf(board) {
  const size = board.size || 19;
  const grid = board.diagram.map((r) => r.replace(/\s+/g, "").split(""));
  const h = grid.length;
  const w = Math.max(...grid.map((r) => r.length));
  let x0 = 0;
  let y0 = 0;
  if (board.at) [x0, y0] = board.at;
  else {
    const corner = board.corner || "tl";
    if (corner.includes("r")) x0 = size - w;
    if (corner.includes("b")) y0 = size - h;
  }
  const stones = [];
  const window = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x] ?? ",";
      if (ch === "X" || ch === "x") stones.push({ x: x + x0, y: y + y0, c: 1 });
      else if (ch === "O" || ch === "o") stones.push({ x: x + x0, y: y + y0, c: -1 });
      if (ch !== ",") window.push({ x: x + x0, y: y + y0 });
    }
  return { size, stones, x0, y0, w, h, partial: w < size || h < size, window };
}

/** The local area of a place step: the diagram's window, or a box around the accepted points. */
export function localArea(pos, accept) {
  const pts = accept.map((p) => ({ x: p.x + pos.x0, y: p.y + pos.y0 }));
  const occupied = new Set(pos.stones.map((s) => s.y * pos.size + s.x));
  let area;
  if (pos.partial) area = pos.window;
  else {
    const m = pos.size >= 19 ? 3 : 2;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [ax, bx] = [Math.max(0, Math.min(...xs) - m), Math.min(pos.size - 1, Math.max(...xs) + m)];
    const [ay, by] = [Math.max(0, Math.min(...ys) - m), Math.min(pos.size - 1, Math.max(...ys) + m)];
    area = [];
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) area.push({ x, y });
  }
  // A new corner is never the local answer: leave out empty corners the step does not play in.
  const span = pos.size >= 19 ? 5 : pos.size >= 13 ? 4 : 0;
  const boxes = [];
  if (span)
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const bx = cx ? pos.size - span : 0;
      const by = cy ? pos.size - span : 0;
      const inBox = (p) => p.x >= bx && p.x < bx + span && p.y >= by && p.y < by + span;
      if (!pos.stones.some(inBox) && !pts.some(inBox)) boxes.push(inBox);
    }
  return area.filter((p) => !occupied.has(p.y * pos.size + p.x) && !boxes.some((b) => b(p)));
}

export function vertex(x, y, size) {
  return x < 0 ? "pass" : LETTERS[x] + (size - y);
}
function fromVertex(v, size) {
  if (!v || /^pass$/i.test(v)) return null;
  return { x: LETTERS.indexOf(v[0].toUpperCase()), y: size - Number(v.slice(1)) };
}
const key = (p) => `${p.x},${p.y}`;

/* ---------------------------------------------------------------- KataGo */

export class Analysis {
  constructor({ katago, model, threads }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-check-"));
    const cfg = path.join(dir, "analysis.cfg");
    fs.writeFileSync(
      cfg,
      [
        `logDir = ${dir}`,
        "logToStderr = false",
        "logAllRequests = false",
        "logAllResponses = false",
        "logSearchInfo = false",
        `numAnalysisThreads = ${threads}`,
        "numSearchThreadsPerAnalysisThread = 1",
        "reportAnalysisWinratesAs = BLACK",
        "analysisPVLen = 10",
        "nnCacheSizePowerOfTwo = 21",
        "nnMutexPoolSizePowerOfTwo = 16",
        "",
      ].join("\n"),
    );
    this.proc = spawn(katago, ["analysis", "-model", model, "-config", cfg], { stdio: ["pipe", "pipe", "inherit"] });
    this.waiting = new Map();
    this.next = 0;
    let buf = "";
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (d) => {
      buf += d;
      let at;
      while ((at = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, at).trim();
        buf = buf.slice(at + 1);
        if (!line.startsWith("{")) continue;
        const r = JSON.parse(line);
        const w = this.waiting.get(r.id);
        if (!w || r.isDuringSearch) continue;
        this.waiting.delete(r.id);
        w(r);
      }
    });
    this.proc.on("exit", (code) => {
      for (const w of this.waiting.values()) w({ error: `KataGo exited ${code}` });
      this.waiting.clear();
    });
  }
  /** Search a position; `moves` are [color, x, y] played after the stones. */
  query({ pos, toMove, moves = [], visits, allow = null, ownership = false, komi = KOMI }) {
    const id = `q${++this.next}`;
    const size = pos.size;
    const col = (c) => (c === 1 ? "B" : "W");
    const q = {
      id,
      initialStones: pos.stones.map((s) => [col(s.c), vertex(s.x, s.y, size)]),
      initialPlayer: col(toMove),
      moves: moves.map(([c, x, y]) => [col(c), vertex(x, y, size)]),
      rules: "japanese",
      komi,
      boardXSize: size,
      boardYSize: size,
      maxVisits: visits,
      includeOwnership: ownership,
    };
    const player = moves.length ? -moves[moves.length - 1][0] : toMove;
    if (allow) q.allowMoves = [{ player: col(player), moves: allow.map((p) => vertex(p.x, p.y, size)), untilDepth: 1 }];
    return new Promise((resolve) => {
      this.waiting.set(id, (r) => {
        if (r.error) return resolve({ error: r.error });
        resolve({
          lead: r.rootInfo.scoreLead,
          winrate: r.rootInfo.winrate,
          visits: r.rootInfo.visits,
          moves: (r.moveInfos || [])
            .sort((a, b) => a.order - b.order)
            .map((m) => ({ ...fromVertex(m.move, size), pass: /^pass$/i.test(m.move), visits: m.visits, lead: m.scoreLead, prior: m.prior })),
          ownership: r.ownership || null,
        });
      });
      this.proc.stdin.write(JSON.stringify(q) + "\n");
    });
  }
  close() {
    this.proc.stdin.end();
  }
}

/** Top moves of a search (no passes), most visited first. */
function topMoves(res, n) {
  return (res.moves || [])
    .filter((m) => !m.pass && Number.isFinite(m.x))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, n);
}

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/** One place step: every accepted point and the engine's best moves, valued after they are played. */
async function checkPlace(kg, s, { rootVisits, moveVisits }) {
  const { pos, step } = s;
  const mover = step.toMove;
  const area = localArea(pos, step.accept);
  const [whole, local] = await Promise.all([
    kg.query({ pos, toMove: mover, visits: rootVisits }),
    kg.query({ pos, toMove: mover, visits: rootVisits, allow: area }),
  ]);
  if (whole.error || local.error) return { id: s.id, error: whole.error || local.error };
  const inArea = new Set(area.map(key));
  const accepted = new Set(step.accept.map((p) => key({ x: p.x + pos.x0, y: p.y + pos.y0 })));
  const cand = new Map();
  for (const p of step.accept) cand.set(key({ x: p.x + pos.x0, y: p.y + pos.y0 }), { x: p.x + pos.x0, y: p.y + pos.y0 });
  for (const m of [...topMoves(whole, 5), ...topMoves(local, 6)]) cand.set(key(m), { x: m.x, y: m.y });
  const values = await Promise.all(
    [...cand.values()].map(async (p) => {
      const r = await kg.query({ pos, toMove: mover, moves: [[mover, p.x, p.y]], visits: moveVisits });
      return { ...p, value: r.error ? null : r.lead * mover, error: r.error || null };
    }),
  );
  const valued = values.filter((v) => Number.isFinite(v.value));
  const best = (list) => list.reduce((b, v) => (!b || v.value > b.value ? v : b), null);
  const bestWhole = best(valued);
  const bestLocal = best(valued.filter((v) => inArea.has(key(v))));
  const ref = s.view === "whole" ? bestWhole : bestLocal;
  const acc = valued.filter((v) => accepted.has(key(v)));
  const bestAcc = best(acc);
  const local2 = (p) => ({ x: p.x - pos.x0, y: p.y - pos.y0 });
  const points = step.accept.map((p) => {
    const v = values.find((c) => c.x === p.x + pos.x0 && c.y === p.y + pos.y0);
    const loss = v && Number.isFinite(v.value) && ref ? ref.value - v.value : null;
    return {
      ...p,
      vertex: vertex(p.x + pos.x0, p.y + pos.y0, pos.size),
      value: r1(v?.value),
      loss: r1(loss),
      lossWhole: r1(v && bestWhole ? bestWhole.value - v.value : null),
      verdict: loss == null ? "error" : loss <= OK ? "ok" : loss <= LOSE ? "doubtful" : "loses",
    };
  });
  const pool = s.view === "whole" ? valued : valued.filter((v) => inArea.has(key(v)));
  const equal = bestAcc
    ? pool.filter((v) => !accepted.has(key(v)) && v.value >= bestAcc.value - EQUAL).map((v) => ({ ...local2(v), vertex: vertex(v.x, v.y, pos.size), value: r1(v.value), gain: r1(v.value - bestAcc.value) }))
    : [];
  const show = (v) => (v ? { ...local2(v), vertex: vertex(v.x, v.y, pos.size), value: r1(v.value), accepted: accepted.has(key(v)) } : null);
  return {
    id: s.id,
    kind: "place",
    view: s.view,
    size: pos.size,
    toMove: mover,
    text: step.text.en,
    rootLead: r1(whole.lead),
    bestWhole: show(bestWhole),
    bestLocal: show(bestLocal),
    topMissing: !!ref && !accepted.has(key(ref)) && (!bestAcc || ref.value - bestAcc.value > EQUAL),
    points,
    equal,
  };
}

/** One read step: its claims, or the reason a person must review it. */
async function checkRead(kg, s, { rootVisits, moveVisits }) {
  const { pos } = s;
  const claims = CLAIMS[s.id];
  if (!claims) {
    const why = REVIEW_OF[s.unit] || "principle";
    return { id: s.id, kind: "read", text: s.step.text.en, review: REVIEW[why] };
  }
  const at = ([x, y]) => ({ x: x + pos.x0, y: y + pos.y0 });
  const out = [];
  for (const c of claims) {
    const r = { what: c.what, type: c.type };
    if (c.type === "lead" || c.type === "owner") {
      const moves = (c.after || []).map(([x, y, col]) => [col, at([x, y]).x, at([x, y]).y]);
      const res = await kg.query({ pos, toMove: c.toMove, moves, visits: rootVisits, ownership: c.type === "owner" });
      if (res.error) r.error = res.error;
      else if (c.type === "lead") {
        // A finished position: whoever is to move, the count is the same.
        const other = await kg.query({ pos, toMove: -c.toMove, moves, visits: rootVisits });
        r.lead = r1(res.lead);
        r.leadOther = r1(other.lead);
        r.pass = Math.min(Math.abs(res.lead - c.value), Math.abs(other.lead - c.value)) <= c.tol;
      } else {
        const own = c.pts.map((p) => res.ownership[at(p).y * pos.size + at(p).x] * c.color);
        r.ownership = r1(own.reduce((a, b) => a + b, 0) / own.length);
        r.pass = r.ownership >= c.min;
      }
    } else if (c.type === "better") {
      const [va, vb] = await Promise.all(
        [c.a, c.b].map((p) => kg.query({ pos, toMove: c.toMove, moves: [[c.toMove, at(p).x, at(p).y]], visits: moveVisits * 2 })),
      );
      if (va.error || vb.error) r.error = va.error || vb.error;
      else {
        r.a = r1(va.lead * c.toMove);
        r.b = r1(vb.lead * c.toMove);
        r.pass = c.both ? Math.abs(r.a - r.b) <= c.tol : r.a >= r.b - c.tol;
      }
    } else if (c.type === "answer") {
      const m = at(c.move);
      const res = await kg.query({ pos, toMove: c.toMove, moves: [[c.toMove, m.x, m.y]], visits: rootVisits });
      if (res.error) r.error = res.error;
      else {
        const top = topMoves(res, 1)[0];
        r.reply = top ? vertex(top.x, top.y, pos.size) : "pass";
        r.pass = !!top && c.expect.some((p) => at(p).x === top.x && at(p).y === top.y);
      }
    }
    out.push(r);
  }
  return { id: s.id, kind: "read", text: s.step.text.en, claims: out };
}

/* --------------------------------------------------------------- report */

function summary(results) {
  const place = results.filter((r) => r.kind === "place" && !r.error);
  const judged = place.filter((r) => r.view !== "rule");
  const losing = judged.filter((r) => r.points.some((p) => p.verdict === "loses"));
  const doubtful = judged.filter((r) => r.points.some((p) => p.verdict === "doubtful") && !losing.includes(r));
  const missing = judged.filter((r) => r.topMissing);
  const equal = judged.filter((r) => r.equal.length);
  const reads = results.filter((r) => r.kind === "read");
  const claims = reads.flatMap((r) => r.claims || []);
  return {
    placeSteps: place.length,
    judged: judged.length,
    ruleSteps: place.length - judged.length,
    losing: losing.map((r) => r.id),
    doubtful: doubtful.map((r) => r.id),
    topMissing: missing.map((r) => r.id),
    equalAlternatives: equal.map((r) => r.id),
    readSteps: reads.length,
    claimsChecked: claims.length,
    claimsFailed: reads.filter((r) => (r.claims || []).some((c) => !c.pass)).map((r) => r.id),
    review: reads.filter((r) => r.review).length,
    errors: results.filter((r) => r.error).map((r) => r.id),
  };
}

const fmt = (v) => (v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(1));

function markdown(report) {
  const s = report.summary;
  const L = [];
  L.push(`Run: ${report.network}, ${report.rootVisits} visits per root search, ${report.moveVisits} per move${report.runId ? `, GitHub run ${report.runId}` : ""}.`);
  L.push("");
  L.push(`- Place steps checked: ${s.placeSteps} (${s.judged} judged, ${s.ruleSteps} rule steps reported only)`);
  L.push(`- Steps with an accepted point that loses more than ${LOSE} points: ${s.losing.length}`);
  L.push(`- Steps with a doubtful accepted point (${OK}–${LOSE} points): ${s.doubtful.length}`);
  L.push(`- Steps whose best move (in the step's view) is not accepted: ${s.topMissing.length}`);
  L.push(`- Steps with an equally good point that is not accepted: ${s.equalAlternatives.length}`);
  L.push(`- Read steps with a board: ${s.readSteps}; claims checked: ${s.claimsChecked}; steps with a failed claim: ${s.claimsFailed.length}; left for human review: ${s.review}`);
  if (s.errors.length) L.push(`- Errors: ${s.errors.join(", ")}`);
  L.push("");
  L.push("### Place steps that need a look");
  L.push("");
  L.push("Values are the score lead for the side to move after the move; loss is against the best move of the step's view.");
  L.push("");
  L.push("| step | view | accepted points (loss) | best (whole board) | best (local) | equal, not accepted |");
  L.push("| --- | --- | --- | --- | --- | --- |");
  const flagged = report.results.filter((r) => r.kind === "place" && !r.error && (r.topMissing || r.equal.length || r.points.some((p) => p.verdict !== "ok")));
  for (const r of flagged) {
    const pts = r.points.map((p) => `${p.vertex} ${fmt(-p.loss)}${p.verdict === "ok" ? "" : " **" + p.verdict + "**"}`).join(", ");
    const b = (v) => (v ? `${v.vertex} ${fmt(v.value)}${v.accepted ? "" : " (not accepted)"}` : "–");
    L.push(`| ${r.id} | ${r.view} | ${pts} | ${b(r.bestWhole)} | ${b(r.bestLocal)} | ${r.equal.map((e) => `${e.vertex} ${fmt(e.gain)}`).join(", ") || "–"} |`);
  }
  if (!flagged.length) L.push("| – | | | | | |");
  L.push("");
  L.push("### Read-step claims");
  L.push("");
  L.push("| step | claim | KataGo | result |");
  L.push("| --- | --- | --- | --- |");
  for (const r of report.results.filter((x) => x.claims))
    for (const c of r.claims) {
      const got = c.error ? c.error : c.type === "lead" ? `lead ${fmt(c.lead)} (Black to play), ${fmt(c.leadOther)} (White to play)` : c.type === "owner" ? `ownership ${c.ownership}` : c.type === "better" ? `A ${fmt(c.a)}, B ${fmt(c.b)}` : `reply ${c.reply}`;
      L.push(`| ${r.id} | ${c.what} | ${got} | ${c.pass ? "agrees" : "**disagrees**"} |`);
    }
  L.push("");
  L.push("### Read steps left for human review");
  L.push("");
  const groups = {};
  for (const r of report.results.filter((x) => x.review)) (groups[r.review] ||= []).push(r.id);
  for (const [why, ids] of Object.entries(groups)) L.push(`- ${why}: ${ids.join(", ")}`);
  return L.join("\n");
}

function writeReport(files) {
  const results = new Map();
  let meta = {};
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    meta = { network: j.network, rootVisits: j.rootVisits, moveVisits: j.moveVisits, runId: j.runId };
    for (const r of j.results) results.set(r.id, r);
  }
  const order = lessonSteps().map((s) => s.id);
  const list = order.filter((id) => results.has(id)).map((id) => results.get(id));
  const report = { ...meta, generated: new Date().toISOString().slice(0, 10), summary: summary(list), results: list };
  fs.writeFileSync(path.join(ROOT, "docs/lesson-audit.json"), JSON.stringify(report, null, 1) + "\n");
  const mdPath = path.join(ROOT, "docs/lesson-audit.md");
  const START = "<!-- generated:start -->";
  const END = "<!-- generated:end -->";
  let md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : `# Lesson audit (KataGo)\n\n## Latest run\n\n${START}\n${END}\n`;
  if (!md.includes(START)) md += `\n## Latest run\n\n${START}\n${END}\n`;
  md = md.slice(0, md.indexOf(START) + START.length) + "\n" + markdown(report) + "\n" + md.slice(md.indexOf(END));
  fs.writeFileSync(mdPath, md);
  console.log(JSON.stringify(report.summary, null, 1));
}

/* ------------------------------------------------------------------ main */

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      a[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else (a._ ||= []).push(argv[i]);
  }
  return a;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (cmd === "list") {
    for (const s of lessonSteps()) console.log(`${s.kind} ${s.view || (CLAIMS[s.id] ? "claims" : "review")} ${s.id}`);
    return;
  }
  if (cmd === "report") {
    writeReport(a._ || []);
    return;
  }
  if (cmd !== "run") {
    console.error("usage: check-lessons-katago.mjs list | run --katago PATH --model PATH --out FILE [--shard i/n] | report FILE...");
    process.exit(2);
  }
  const opt = {
    rootVisits: Number(a["root-visits"] || 1600),
    moveVisits: Number(a["move-visits"] || 600),
    threads: Number(a.threads || os.availableParallelism?.() || 4),
  };
  const [si, sn] = String(a.shard || "0/1").split("/").map(Number);
  const only = a.only ? new Set(String(a.only).split(",")) : null;
  const steps = lessonSteps().filter((s, i) => (only ? only.has(s.id) : i % sn === si));
  const kg = new Analysis({ katago: a.katago || process.env.KATAGO, model: a.model || process.env.KATAGO_STRONG_MODEL, threads: opt.threads });
  const results = [];
  const started = Date.now();
  // Two steps at a time keep every analysis thread busy.
  let next = 0;
  async function worker() {
    while (next < steps.length) {
      const s = steps[next++];
      const t0 = Date.now();
      const r = s.kind === "place" ? await checkPlace(kg, s, opt) : await checkRead(kg, s, opt);
      results.push(r);
      console.log(`${s.id} ${s.kind} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }
  await Promise.all([worker(), worker()]);
  kg.close();
  const network = path.basename(a.model || process.env.KATAGO_STRONG_MODEL || "").replace(/\.(bin|txt)\.gz$/, "");
  const outFile = a.out || "lesson-check.json";
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ network, ...opt, runId: process.env.GITHUB_RUN_ID || null, seconds: Math.round((Date.now() - started) / 1000), results }, null, 1));
  console.log(`${results.length} steps in ${Math.round((Date.now() - started) / 1000)} s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
