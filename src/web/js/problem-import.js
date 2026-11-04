/**
 * v7: your own problem collections. SGF problem files in, solver-proved
 * problems out.
 *
 * Input: one problem per file, many game trees in one file, or many files
 * (a folder or a multi-select). Each game tree is read for its setup stones
 * (AB/AW, also on setup-only nodes before the first move), who plays (PL,
 * else the colour of the first move in the solution tree, else the comment,
 * else Black), the comment (C, GN) and the solution tree if there is one.
 *
 * The solution tree. A first move of the player to move is marked correct
 * or wrong by the usual conventions, checked in this order:
 *
 *   1. a line is right when one of its nodes says so: a comment with RIGHT,
 *      "Correct", 正解 / 正确 / 成功 / 정답, or TE[] (tesuji), or GB/GW for
 *      the player; it is wrong when a node says "Wrong", "Incorrect", 失败 /
 *      失敗 / 不正解 / 실패 / 오답, or BM[] (bad move), or GB/GW for the
 *      opponent;
 *   2. when the file marks right lines, a first move with no right line is
 *      wrong (the GoProblems convention); when it only marks wrong lines,
 *      the other first moves are right;
 *   3. with no marks at all, the main line (the first variation) is taken as
 *      the file's answer and the other variations are not judged.
 *
 * Turning a tree into a problem (`analyseEntry`). The goal is not trusted to
 * the file: words in the comment narrow it (live / kill / capture / connect /
 * seki / ko, in the four languages), and otherwise every reading is tried.
 * For the player to move:
 *
 *   kill   the opponent's group: the biggest chain of each enclosed
 *          opponent area (stones and the empty points they reach without
 *          crossing the player's stones) is the key;
 *   live   the same for the player's own groups;
 *   capture / save  the weakest chains (three liberties or fewer) of the
 *          opponent / the player, on an open board ("connect" problems are
 *          read as saving the cut-off stones). Only tried when the comment
 *          asks for it or no life-and-death reading is sealed in.
 *
 * The region is the bounding box of the stones (life and death; the walls'
 * outside liberties stay out of play, so the walls are taken as alive) or
 * the box grown by three lines (capturing), snapped to the board edge when
 * it comes within two lines of it; only points inside it are ever played. A
 * life or kill reading is only tried when the key stones are sealed in
 * (`outsideReach()` finds nothing): a group that can breathe through a point
 * nobody may play would live by fiat. Then the solver must prove it: an
 * exact first-move search within the node budget and the time budget, one
 * to three correct first moves, and everything else `validate()` checks.
 *
 * Verdicts, per problem:
 *
 *   accepted   proved, and the file's answer (if any) is among the proved
 *              correct first moves;
 *   corrected  proved, but the file's answer is refuted (the refutation is
 *              the file's own line answered by the solver), or a move the
 *              file calls wrong is proved to work; the solver's answer is
 *              the one used. A refutation is only claimed under a reading
 *              that is not in doubt (a sealed life-and-death reading); a
 *              file answer that fails only under a guessed capturing reading
 *              makes the goal "unclear";
 *   rejected   with a reason: "open" (the key stones are not sealed in:
 *              too open to prove), "ko" (the best
 *              result is a ko the file does not ask for), "unclear" (more
 *              than one reading works and the file does not say which),
 *              "many" (more than three correct first moves), "noAnswer" (no
 *              reading has a correct move), "settled" (already decided),
 *              "disagree" (the file's answer is outside the area the solver
 *              reads, so it can be neither confirmed nor refuted), "budget"
 *              (the search did not finish within the node or time budget), "invalid" (no stones,
 *              board too large, damaged tree).
 *
 * Nothing unproved is ever stored as a problem: a rejected entry is kept
 * only in the import report.
 *
 * SGF coordinates are the standard ones (columns a..s, no letter skipped).
 * Records written by Goban Studio's game export before v7 skip the letter i
 * in columns (`AP[Goban Studio:…]`); those are read the old way. Exported
 * collections (`collectionToSGF`) use standard coordinates and name
 * themselves `AP[Goban Studio Problems:…]`.
 */
import { isLegacyGobanSgf, parseSgfTrees } from "./sgf.js";
import * as S from "./solver.js";
import { GRADE_CUTS } from "./content/problems.js";

export const BLACK = 1;
export const WHITE = -1;

/** Defaults: nodes per first-move search, and wall-clock time per problem. */
export const NODE_BUDGET = 120000;
export const TIME_BUDGET_MS = 8000;
const MAX_CORRECT = 3;
const LIFE_MARGIN = 0;
const CAPTURE_MARGIN = 3;
const SNAP = 2;

/* ------------------------------------------------------------- reading */

const RIGHT_RE = /\bRIGHT\b|\bcorrect(ly)?\b|\bsuccess\b|正解|正确|正確|成功|정답|성공/i;
const WRONG_RE = /\bwrong\b|\bincorrect\b|\bfail(s|ed|ure)?\b|失败|失敗|不正解|错误|錯誤|실패|오답/i;

/** Goal words in the comment. Order matters: "seki" before "live" (双活). */
const GOAL_WORDS = [
  ["seki", /\bseki\b|双活|雙活|セキ|빅/i],
  ["live", /\blive\b|\bliving\b|\blife\b|做活|活棋|净活|淨活|求活|[黑黒白]先活|生き|活き|삶|살아|사는|살리/i],
  ["kill", /\bkill\b|\bkills\b|杀|殺|[黑黒白]先[黑黒白]?死|[黑黒白]死|殺し|죽이|잡으/i],
  ["capture", /\bcapture\b|\bcatch\b|吃[子掉]|吃住|提[子掉]|取る|取り|取れ|따내|잡기/i],
  ["save", /\bconnect\b|\bescape\b|\bsave\b|\brescue\b|连接|連接|联络|聯絡|渡|逃|連絡|つなが|渡り|逃げ|연결|건너|도망|구출/i],
];
const KO_RE = /\bko\b|劫|コウ|(^|[^실])패/i;
const MOVE_WORDS = [
  [WHITE, /white to (play|move|live|kill)|白先|白番|백선|백 차례/i],
  [BLACK, /black to (play|move|live|kill)|黑先|黒先|黒番|흑선|흑 차례/i],
];

function first(data, key) {
  const v = data?.[key];
  return Array.isArray(v) && v.length ? String(v[0]) : "";
}

/** SGF point → {x, y}; `legacy` skips the letter i in columns (pre-v7 Goban Studio export). */
function vertex(raw, size, legacy) {
  const s = String(raw || "").trim();
  if (s.length < 2) return null;
  const cx = s.charCodeAt(0);
  let x = cx - 97;
  if (legacy) x = cx < 105 ? x : x - 1;
  const y = s.charCodeAt(1) - 97;
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x, y };
}

function points(values, size, legacy) {
  const out = [];
  for (const raw of values || []) {
    const s = String(raw);
    if (s.includes(":")) {
      const [a, b] = s.split(":");
      const p = vertex(a, size, legacy);
      const q = vertex(b, size, legacy);
      if (!p || !q) continue;
      for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++) for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++) out.push({ x, y });
    } else {
      const p = vertex(s, size, legacy);
      if (p) out.push(p);
    }
  }
  return out;
}

/** Does a node's comment or annotation call the line right (+1) or wrong (-1), for `player`? */
function markOf(data, player) {
  const c = first(data, "C");
  if (data.BM || (player === BLACK ? data.GW : data.GB)) return -1;
  if (WRONG_RE.test(c)) return -1;
  if (data.TE || (player === BLACK ? data.GB : data.GW)) return 1;
  if (RIGHT_RE.test(c)) return 1;
  return 0;
}

/**
 * Read every game tree of one SGF text. Returns entries
 * { file, index, name, size, stones: [{x, y, c}], toMove, comment, tree,
 *   error? } where `tree` is the solution tree as move nodes
 * { c, x, y, pass, mark, comment, children }.
 */
export function readProblemSGF(text, file = "") {
  let roots;
  try {
    roots = parseSgfTrees(text);
  } catch (_) {
    roots = [];
  }
  if (!roots.length) return [{ file, index: 0, name: "", error: "invalid" }];
  return roots.map((root, index) => readTree(root, file, index));
}

function readTree(root, file, index) {
  const data = root.data || {};
  const size = parseInt(first(data, "SZ").split(":")[0] || "19", 10) || 19;
  const base = { file, index, name: first(data, "GN").trim(), size };
  if (size < 5 || size > 19) return { ...base, error: "invalid" };
  const ap = first(data, "AP");
  // Only records written before v7 skip the i (see sgf.isLegacyGobanSgf).
  const legacy = isLegacyGobanSgf(ap);
  const board = new Map();
  let comment = first(data, "C").trim();
  let pl = first(data, "PL").toUpperCase();
  // Setup may continue on move-less nodes before the first move.
  let node = root;
  const setup = (d) => {
    for (const p of points(d.AE, size, legacy)) board.delete(p.y * size + p.x);
    for (const p of points(d.AB, size, legacy)) board.set(p.y * size + p.x, BLACK);
    for (const p of points(d.AW, size, legacy)) board.set(p.y * size + p.x, WHITE);
  };
  setup(data);
  while (node.children.length === 1 && !hasMove(node.children[0].data)) {
    node = node.children[0];
    setup(node.data || {});
    const c = first(node.data, "C").trim();
    if (c) comment = comment ? comment + "\n" + c : c;
    if (!pl) pl = first(node.data, "PL").toUpperCase();
  }
  const stones = [...board.entries()].map(([i, c]) => ({ x: i % size, y: (i / size) | 0, c }));
  const tree = [];
  for (const child of node.children) {
    const m = readMoves(child, size, legacy);
    if (m) tree.push(...m);
  }
  let toMove = pl === "W" ? WHITE : pl === "B" ? BLACK : 0;
  if (!toMove && tree.length) toMove = tree[0].c;
  if (!toMove) toMove = (MOVE_WORDS.find(([, re]) => re.test(comment + " " + base.name)) || [BLACK])[0];
  return { ...base, stones, toMove, comment, tree };
}

function hasMove(d) {
  return !!(d && (d.B || d.W));
}

/** Move nodes below an SGF node; move-less nodes fold into the move before them. */
function readMoves(node, size, legacy) {
  const d = node.data || {};
  if (!hasMove(d)) {
    // A comment-only node at the head of a variation: read on below it.
    const out = [];
    for (const ch of node.children) out.push(...(readMoves(ch, size, legacy) || []));
    return out;
  }
  const c = d.B ? BLACK : WHITE;
  const raw = first(d, c === BLACK ? "B" : "W");
  const v = vertex(raw, size, legacy);
  const move = { c, x: v?.x ?? -1, y: v?.y ?? -1, pass: !v, data: d, comment: first(d, "C").trim(), children: [] };
  let cur = node;
  // Fold following move-less nodes (comments, marks) into this move.
  while (cur.children.length === 1 && !hasMove(cur.children[0].data)) {
    cur = cur.children[0];
    const cc = first(cur.data, "C").trim();
    if (cc) move.comment = move.comment ? move.comment + "\n" + cc : cc;
    for (const k of ["TE", "BM", "GB", "GW"]) if (cur.data?.[k]) move.data = { ...move.data, [k]: cur.data[k] };
  }
  for (const ch of cur.children) move.children.push(...(readMoves(ch, size, legacy) || []));
  return [move];
}

/**
 * The file's verdict on each first move of `player`: { right: [{x, y}],
 * wrong: [{x, y}], convention: "marked" | "wrong-marked" | "main-line" |
 * "none", line: the file's main right line as [{x, y, c}] }.
 */
export function fileAnswer(entry) {
  const player = entry.toMove;
  const firsts = (entry.tree || []).filter((m) => m.c === player && !m.pass);
  if (!firsts.length) return { right: [], wrong: [], convention: "none", line: [] };
  const lines = (m, path = []) => {
    const here = [...path, m];
    if (!m.children.length) return [here];
    return m.children.flatMap((ch) => lines(ch, here));
  };
  const judge = (line) => {
    let mark = 0;
    for (const m of line) {
      const k = markOf({ ...m.data, C: [m.comment] }, player);
      if (k < 0) return -1;
      if (k > 0) mark = 1;
    }
    return mark;
  };
  const all = firsts.map((m) => ({ m, lines: lines(m).map((l) => ({ l, k: judge(l) })) }));
  const anyRight = all.some((f) => f.lines.some((x) => x.k > 0));
  const anyWrong = all.some((f) => f.lines.some((x) => x.k < 0));
  const pt = (m) => ({ x: m.x, y: m.y });
  const right = [];
  const wrong = [];
  let line = [];
  let convention;
  if (anyRight) {
    convention = "marked";
    for (const f of all) {
      const ok = f.lines.find((x) => x.k > 0);
      if (ok) {
        right.push(pt(f.m));
        if (!line.length) line = ok.l;
      } else wrong.push(pt(f.m));
    }
  } else if (anyWrong) {
    convention = "wrong-marked";
    for (const f of all) {
      const ok = f.lines.find((x) => x.k >= 0);
      if (ok) {
        right.push(pt(f.m));
        if (!line.length) line = ok.l;
      } else wrong.push(pt(f.m));
    }
  } else {
    convention = "main-line";
    right.push(pt(all[0].m));
    line = all[0].lines[0].l;
  }
  return { right: dedupe(right), wrong: dedupe(wrong).filter((w) => !right.some((r) => r.x === w.x && r.y === w.y)), convention, line: line.map((m) => ({ x: m.x, y: m.y, c: m.c, pass: m.pass })) };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((p) => {
    const k = p.x + "," + p.y;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Goals the comment asks for, and whether it mentions ko. */
export function goalWords(text) {
  const s = String(text || "");
  const goals = [];
  for (const [g, re] of GOAL_WORDS) if (re.test(s) && !(g === "live" && goals.includes("seki"))) goals.push(g);
  return { goals, ko: KO_RE.test(s) };
}

/* ------------------------------------------------------------ geometry */

function boardOf(entry) {
  const b = new Int8Array(entry.size * entry.size);
  for (const s of entry.stones) b[s.y * entry.size + s.x] = s.c;
  return b;
}

function nbrs(size, i) {
  const x = i % size;
  const y = (i / size) | 0;
  const out = [];
  if (x > 0) out.push(i - 1);
  if (x < size - 1) out.push(i + 1);
  if (y > 0) out.push(i - size);
  if (y < size - 1) out.push(i + size);
  return out;
}

function chainAt(size, board, i) {
  const color = board[i];
  const stones = [i];
  const libs = new Set();
  const seen = new Set([i]);
  for (let k = 0; k < stones.length; k++) {
    for (const q of nbrs(size, stones[k])) {
      if (seen.has(q)) continue;
      if (board[q] === color) {
        seen.add(q);
        stones.push(q);
      } else if (board[q] === 0) libs.add(q);
    }
  }
  return { color, stones, libs: libs.size };
}

function chains(size, board) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || seen.has(i)) continue;
    const ch = chainAt(size, board, i);
    for (const p of ch.stones) seen.add(p);
    out.push(ch);
  }
  return out;
}

/** The problem box: stones' bounding box grown by `margin`, snapped to near edges. */
function boxFor(entry, margin) {
  const n = entry.size - 1;
  const xs = entry.stones.map((s) => s.x);
  const ys = entry.stones.map((s) => s.y);
  let x0 = Math.min(...xs) - margin;
  let y0 = Math.min(...ys) - margin;
  let x1 = Math.max(...xs) + margin;
  let y1 = Math.max(...ys) + margin;
  if (x0 <= SNAP) x0 = 0;
  if (y0 <= SNAP) y0 = 0;
  if (x1 >= n - SNAP) x1 = n;
  if (y1 >= n - SNAP) y1 = n;
  return { x0, y0, x1, y1 };
}

const inside = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/**
 * Areas of `color`: its stones joined through empty points of the box,
 * blocked by the other colour. Each area's biggest chain is a key.
 */
function areas(entry, board, box, color) {
  const size = entry.size;
  const seen = new Set();
  const out = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== color || seen.has(i)) continue;
    const stack = [i];
    seen.add(i);
    const pts = [];
    while (stack.length) {
      const p = stack.pop();
      pts.push(p);
      for (const q of nbrs(size, p)) {
        if (seen.has(q) || board[q] === -color) continue;
        if (!inside(box, q % size, (q / size) | 0)) continue;
        seen.add(q);
        stack.push(q);
      }
    }
    const own = chains(size, board).filter((ch) => ch.color === color && ch.stones.some((s) => pts.includes(s)));
    own.sort((a, b) => b.stones.length - a.stones.length || a.libs - b.libs);
    out.push(own[0]);
  }
  return out.sort((a, b) => b.stones.length - a.stones.length);
}

/** A solver problem for one reading. Coordinates of `keys` are board indices. */
function problemFor(entry, board, box, goal, keys, ko) {
  const size = entry.size;
  const keySet = new Set(keys);
  const rows = [];
  for (let y = box.y0; y <= box.y1; y++) {
    let r = "";
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * size + x;
      const v = board[i];
      r += (v === BLACK ? (keySet.has(i) ? "x" : "X") : v === WHITE ? (keySet.has(i) ? "o" : "O") : ".") + (x < box.x1 ? " " : "");
    }
    rows.push(r);
  }
  const p = { goal, diagram: rows, at: [box.x0, box.y0], size, toMove: entry.toMove };
  if (ko) p.ko = "ok";
  return p;
}

/* ----------------------------------------------------------- analysis */

const keyOf = (p) => p.x + "," + p.y;

function inRegion(pz, x, y) {
  if (pz.region) return pz.region.some((r) => r.x === x && r.y === y) || pz.stones.some((s) => s.x === x && s.y === y);
  const b = pz.box;
  return inside(b, x, y);
}

/** The readings to try, most likely first. */
function readings(entry, words) {
  const board = boardOf(entry);
  const me = entry.toMove;
  const out = [];
  const lifeBox = boxFor(entry, LIFE_MARGIN);
  const capBox = boxFor(entry, CAPTURE_MARGIN);
  const want = (g) => !words.goals.length || words.goals.includes(g);
  for (const [goal, color] of [["kill", -me], ["live", me], ["seki", me]]) {
    if (!want(goal)) continue;
    if (goal === "seki" && !words.goals.includes("seki")) continue;
    for (const ch of areas(entry, board, lifeBox, color).slice(0, 3)) out.push({ goal, box: lifeBox, keys: ch.stones, tier: 1 });
  }
  for (const [goal, color] of [["capture", -me], ["save", me]]) {
    if (!want(goal)) continue;
    const weak = chains(entry.size, board)
      .filter((ch) => ch.color === color && ch.libs <= 3)
      .sort((a, b) => a.libs - b.libs || b.stones.length - a.stones.length)
      .slice(0, 3);
    for (const ch of weak) out.push({ goal, box: capBox, keys: ch.stones, tier: 2 });
  }
  return { board, list: out };
}

// A sealed reading that ran out of nodes says more than an unsealed one.
const REASON_ORDER = ["ko", "budget", "open", "many", "settled", "noAnswer"];

/** Map validate() reasons onto the report's reason codes. */
function reasonOf(reasons) {
  const s = reasons.join(" ");
  if (/not exact/.test(s)) return "budget";
  if (/correct first moves \(max/.test(s)) return "many";
  if (/already/.test(s)) return "settled";
  if (/no correct first move/.test(s)) return "noAnswer";
  return "noAnswer";
}

/**
 * Prove one reading. Returns { ok, reason, pz, def, correct, result }.
 */
function tryReading(entry, board, r, ko, budget, deadline) {
  const def = problemFor(entry, board, r.box, r.goal, r.keys, ko);
  let pz;
  try {
    pz = S.createPuzzle(def);
  } catch (e) {
    return { ok: false, reason: "noAnswer" };
  }
  if (pz.lifeGoal && S.outsideReach(pz, { throughCaptures: true }).length) return { ok: false, reason: "open" };
  const first = S.solveFirstMoves(pz, budget, { deadline });
  // Out of time, or out of nodes (depth or budget): not proved here.
  if (!first.exact) return { ok: false, reason: "budget" };
  if (!first.correct.length) return { ok: false, reason: "noAnswer", pz, def };
  const v = S.validate(pz, { maxCorrect: MAX_CORRECT, first });
  if (!v.ok) return { ok: false, reason: reasonOf(v.reasons), pz, def };
  return { ok: true, pz, def, correct: first.correct, result: v.result, line: v.line, first };
}

/**
 * The file's line from its first move, answered by the solver: the file's
 * own moves for the player while the solver's replies keep to the file's
 * line, the solver's refuting replies for the opponent.
 */
function refutation(pz, line) {
  let st = S.initialState(pz);
  const out = [];
  for (let n = 0; n < 24; n++) {
    let mv;
    if (st.toMove === pz.userColor) {
      mv = fileNext(line, out, pz.userColor);
      if (!mv || mv.pass) break;
    } else {
      const r = S.reply(pz, st);
      if (!r || r.pass) break;
      mv = r;
    }
    const next = S.play(pz, st, S.indexOf(pz, mv.x, mv.y));
    if (!next) break;
    out.push({ x: mv.x, y: mv.y, c: st.toMove });
    st = next;
  }
  return out;
}

/** The file's next move for the player once the line so far matches the file's line. */
function fileNext(line, played, player) {
  for (let i = 0; i < played.length; i++) {
    const a = line[i];
    const b = played[i];
    if (!a || a.x !== b.x || a.y !== b.y) return null;
  }
  const m = line[played.length];
  return m && m.c === player ? m : null;
}

/** The solver's difficulty score (solver.js difficulty()) from the proof already made. */
function scoreOf({ pz, first, line }) {
  const userMoves = line.filter((m) => m.c === pz.userColor).length;
  const wrong = Math.max(0, first.tried - first.correct.length);
  const score = userMoves * 1.1 + Math.log2(1 + first.nodes) * 0.6 + Math.log2(1 + wrong) * 0.5 - (first.correct.length - 1) * 0.8;
  return Math.round(score * 10) / 10;
}

/** A 1–5 grade on the built-in problems' scale (GRADE_CUTS). */
function gradeFor(score) {
  let grade = 1;
  for (const cut of GRADE_CUTS) if (score >= cut) grade++;
  return grade;
}

/**
 * Analyse one entry. Returns a report row
 *   { file, index, name, verdict: "accepted" | "corrected" | "rejected",
 *     reason?, goal?, ko?, answer?: [{x, y}], fileRight, fileWrong,
 *     refuted?: [{x, y}], refutation?: [{x, y, c}], alsoRight?: [{x, y}],
 *     ms, problem?: the stored problem (diagram form) }
 */
export function analyseEntry(entry, { budget = NODE_BUDGET, timeMs = TIME_BUDGET_MS } = {}) {
  const now = () => Date.now();
  const t0 = now();
  const row = { file: entry.file, index: entry.index, name: entry.name || "", size: entry.size };
  if (entry.error) return { ...row, verdict: "rejected", reason: entry.error, ms: 0 };
  if (!entry.stones?.length || !entry.stones.some((s) => s.c === BLACK) || !entry.stones.some((s) => s.c === WHITE)) return { ...row, verdict: "rejected", reason: "invalid", ms: 0 };
  const fa = fileAnswer(entry);
  row.fileRight = fa.right;
  row.fileWrong = fa.wrong;
  row.convention = fa.convention;
  row.toMove = entry.toMove;
  const words = goalWords(entry.comment + " " + entry.name);
  const { board, list } = readings(entry, words);
  const proved = [];
  const fails = [];
  let timedOut = false;
  for (const r of list) {
    // Capturing readings are for open positions: once a life-and-death
    // reading is sealed in, a race to four liberties is not the question.
    if (r.tier === 2 && !words.goals.length && fails.some((f) => f !== "open")) break;
    if (r.tier === 2 && !words.goals.length && proved.length) break;
    if (now() - t0 > timeMs) {
      timedOut = true;
      break;
    }
    let res = tryReading(entry, board, r, words.ko, budget, t0 + timeMs);
    if (!res.ok && !words.ko && res.reason === "noAnswer" && res.pz && r.tier === 1) {
      // No unconditional answer: is there a ko? The file does not ask for one.
      const k = tryReading(entry, board, r, true, budget, t0 + timeMs);
      if (k.ok && k.result === "ko") res = { ok: false, reason: "ko" };
    }
    if (res.ok) proved.push({ ...res, r });
    else fails.push(res.reason);
    // The first reading that agrees with the file's answer settles it.
    if (res.ok && fa.right.length && fa.right.every((p) => res.correct.some((c) => keyOf(c) === keyOf(p)))) break;
  }
  const ms = now() - t0;
  const done = (pick, verdict, extra = {}) => {
    const score = scoreOf(pick);
    const problem = { ...pick.def, answer: pick.correct.map((p) => ({ x: p.x, y: p.y })), grade: gradeFor(score), score, result: pick.result, comment: entry.comment || "", name: entry.name || "" };
    return { ...row, verdict, goal: pick.def.goal, ko: !!pick.def.ko, answer: problem.answer, ms, problem, ...extra };
  };
  if (!proved.length) {
    const reason = timedOut && !fails.length ? "budget" : REASON_ORDER.find((x) => fails.includes(x)) || (timedOut ? "budget" : "noAnswer");
    return { ...row, verdict: "rejected", reason, ms };
  }
  const agrees = (p) => fa.right.every((q) => p.correct.some((c) => keyOf(c) === keyOf(q)));
  const alsoRight = (p) => fa.wrong.filter((q) => p.correct.some((c) => keyOf(c) === keyOf(q)));
  if (fa.right.length) {
    const ok = proved.find(agrees);
    if (ok) {
      const extra = alsoRight(ok);
      return extra.length ? done(ok, "corrected", { alsoRight: extra }) : done(ok, "accepted");
    }
    // The file's answer is refuted. Only say so when the reading is not in
    // doubt: a sealed life-and-death reading (a capturing reading depends on
    // which stones are the key and how far the board is open, both guessed).
    const sure = proved.filter((p) => p.r.tier === 1);
    if (!sure.length) return { ...row, verdict: "rejected", reason: "unclear", ms };
    const pick = sure[0];
    const refuted = fa.right.filter((q) => !pick.correct.some((c) => keyOf(c) === keyOf(q)));
    if (!refuted.every((q) => inRegion(pick.pz, q.x, q.y))) return { ...row, verdict: "rejected", reason: "disagree", ms };
    const line = fa.line.length && fa.line[0].x === refuted[0].x && fa.line[0].y === refuted[0].y ? fa.line : [{ ...refuted[0], c: entry.toMove }];
    return done(pick, "corrected", { refuted, refutation: refutation(pick.pz, line) });
  }
  // No answer in the file: the readings that work must agree, tier first.
  const tier = Math.min(...proved.map((p) => p.r.tier));
  const best = proved.filter((p) => p.r.tier === tier);
  const sig = (p) => p.correct.map(keyOf).sort().join(" ");
  if (!words.goals.length && new Set(best.map(sig)).size > 1) return { ...row, verdict: "rejected", reason: "unclear", ms };
  return done(best[0], "accepted");
}

/* ----------------------------------------------------------- collections */

/** Many files ({name, text}) → entries, in file order. */
export function readProblemFiles(files) {
  const out = [];
  for (const f of files) out.push(...readProblemSGF(f.text, f.name || ""));
  return out;
}

/** A collection id: short, unique enough for one person's data. */
export function newCollectionId(now = Date.now()) {
  return "c" + now.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
}

/**
 * Build a stored collection from analysed rows:
 *   { v: 1, id, name, created, problems: [problem + {id, collection, n}],
 *     report: [row without the problem] }
 */
export function buildCollection(rows, { name, id = newCollectionId(), created = Date.now() } = {}) {
  const problems = [];
  const report = [];
  for (const r of rows) {
    const { problem, ...rest } = r;
    if (problem) {
      const n = problems.length + 1;
      const pid = `u-${id}-${n}`;
      problems.push({ ...problem, id: pid, collection: id, n });
      rest.id = pid;
    }
    report.push(rest);
  }
  return { v: 1, id, name: String(name || "").slice(0, 120), created, problems, report };
}

/** Normalise stored collections; drop anything unusable. */
export function normalizeCollections(doc) {
  const list = Array.isArray(doc?.collections) ? doc.collections : [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c.id !== "string" || !Array.isArray(c.problems)) continue;
    const problems = c.problems.filter((p) => p && typeof p.id === "string" && Array.isArray(p.diagram) && S.GOALS.includes(p.goal));
    out.push({ v: 1, id: c.id, name: String(c.name || ""), created: Number(c.created) || 0, problems, report: Array.isArray(c.report) ? c.report : [] });
  }
  return { v: 1, collections: out };
}

/* ---------------------------------------------------------------- export */

const sgfPt = (x, y) => String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\]/g, "\\]");

/** Stones of a stored problem on the full board. */
export function problemStones(p) {
  const pz = S.createPuzzle(p);
  return { pz, stones: pz.stones };
}

/**
 * A collection as one SGF file: a game tree per problem with its setup,
 * who plays, the comment, and the proved solution: every correct first
 * move with the solver's line, marked RIGHT (the convention readers know).
 */
export function collectionToSGF(col, { appVersion = "" } = {}) {
  const trees = [];
  for (const p of col.problems) {
    const { pz, stones } = problemStones(p);
    const ab = stones.filter((s) => s.c === BLACK).map((s) => sgfPt(s.x, s.y));
    const aw = stones.filter((s) => s.c === WHITE).map((s) => sgfPt(s.x, s.y));
    let head = `(;GM[1]FF[4]CA[UTF-8]AP[Goban Studio Problems:${esc(appVersion)}]SZ[${pz.size}]`;
    if (p.name) head += `GN[${esc(p.name)}]`;
    const note = [p.comment || "", `goal: ${p.goal}${p.ko ? " (ko)" : ""}`].filter(Boolean).join("\n");
    head += `C[${esc(note)}]`;
    if (ab.length) head += "AB[" + ab.join("][") + "]";
    if (aw.length) head += "AW[" + aw.join("][") + "]";
    head += `PL[${pz.toMove === BLACK ? "B" : "W"}]`;
    const lines = [];
    for (const a of p.answer || []) {
      const line = lineFrom(pz, a);
      if (!line.length) continue;
      lines.push(line.map((m, i) => `;${m.c === BLACK ? "B" : "W"}[${sgfPt(m.x, m.y)}]` + (i === line.length - 1 ? "C[RIGHT]" : "")).join(""));
    }
    const body = lines.length === 1 ? lines[0] : lines.map((l) => "(" + l + ")").join("");
    trees.push(head + "\n" + body + ")");
  }
  return trees.join("\n") + "\n";
}

/** The solver's line after a given correct first move. */
function lineFrom(pz, a) {
  let st = S.initialState(pz);
  const nxt = S.play(pz, st, S.indexOf(pz, a.x, a.y));
  if (!nxt) return [];
  const out = [{ x: a.x, y: a.y, c: st.toMove }];
  st = nxt;
  for (let n = 0; n < 24; n++) {
    if (S.status(pz, st) === "won") break;
    if (st.toMove !== pz.userColor) {
      const r = S.reply(pz, st);
      if (!r || r.pass) break;
      const next = S.play(pz, st, S.indexOf(pz, r.x, r.y));
      if (!next) break;
      out.push({ x: r.x, y: r.y, c: st.toMove });
      st = next;
    } else {
      const w = S.winningMoves(pz, st)[0];
      if (!w) break;
      const next = S.play(pz, st, S.indexOf(pz, w.x, w.y));
      if (!next) break;
      out.push({ x: w.x, y: w.y, c: st.toMove });
      st = next;
    }
  }
  return out;
}
