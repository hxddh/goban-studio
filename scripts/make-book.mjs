/**
 * v6 explorer: build the opening and joseki book (src/web/js/content/book.json)
 * with KataGo's analysis engine.
 *
 * Usage:
 *   node scripts/make-book.mjs --katago <path/to/katago> [--model engine/model/model.txt.gz]
 *        [--visits 500] [--threads 2] [--search-threads 2] [--out src/web/js/content/book.json]
 *        [--max-whole 900] [--max-corner 1100] [--network-name <name>]
 *
 * KataGo is not part of the repository: use the official Linux release
 * (Eigen/CPU build) or the binary that `engine/<platform>/` holds for a
 * package. The network defaults to the shipped one in engine/model.
 *
 * Two trees, both 19×19, Japanese rules, komi 6.5:
 *
 *   whole   from the empty board. The named lines below are always in the
 *           book; KataGo's own top choices are added breadth-first.
 *   corner  joseki in the upper-right corner. The other corners are not
 *           empty: Black has the lower-left star point and tengen, White the
 *           upper-left and lower-right star points, and Black plays first in
 *           the corner. The setup is symmetric along the upper-right
 *           diagonal, so mirrored joseki are the same position. Only moves in
 *           the upper-right quarter are expanded; a better move elsewhere
 *           (tenuki) still shows up as a candidate and sets the point loss.
 *
 * Every position is searched once (transpositions and symmetric positions
 * share one record, see src/web/js/book.js for the format).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { BLACK, WHITE, LETTERS } from "../src/web/js/rules.js";
import { BOOK_FORMAT, GROUPS, SYMMETRIES, INVERSE, canonical, decodeMove, encodeMove, playOn, setupSignMap, stonesOf } from "../src/web/js/book.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const KATAGO = arg("katago", process.env.KATAGO || path.join(root, "engine", "linux", "katago"));
const MODEL = arg("model", path.join(root, "engine", "model", "model.txt.gz"));
const VISITS = Number(arg("visits", 500));
const THREADS = Number(arg("threads", 2));
const SEARCH_THREADS = Number(arg("search-threads", 2));
const OUT = arg("out", path.join(root, "src", "web", "js", "content", "book.json"));
const MAX = { whole: Number(arg("max-whole", 900)), corner: Number(arg("max-corner", 1100)) };
const ONLY = arg("only", null);
const N = 19;
const KOMI = 6.5;
const RULES = "japanese";

/* -------------------------------------------------------------- lines */

/** GTP point ("Q16") → "xy" book move. */
function gtpToXY(s) {
  const x = LETTERS.indexOf(s[0].toUpperCase());
  const y = N - Number(s.slice(1));
  return encodeMove(x, y);
}

function xyToGtp(mv) {
  const p = decodeMove(mv);
  return LETTERS[p.x] + String(N - p.y);
}

/**
 * Named lines (GTP coordinates, alternating from the tree's first player).
 * `name` labels the position after the last move.
 */
const LINES = {
  whole: [
    { name: "star", moves: "Q16" },
    { name: "komoku", moves: "R16" },
    { name: "two-star", moves: "Q16 D4 Q4" },
    { name: "sanrensei", moves: "Q16 D4 Q4 D16 Q10" },
    { name: "diagonal-star", moves: "Q16 D16 D4" },
    { name: "chinese", moves: "Q16 D4 R4 D16 R10" },
    { name: "star-komoku", moves: "Q16 D4 R4" },
    { name: "two-komoku", moves: "R16 D4 Q3" },
    { name: "facing-komoku", moves: "R16 D16 R4" },
  ],
  corner: [
    { name: "star", moves: "Q16" },
    { name: "star-low-approach", moves: "Q16 R14" },
    { name: null, moves: "Q16 R14 O17 R11" },
    { name: "star-high-approach", moves: "Q16 Q14" },
    { name: "star-33", moves: "Q16 R17" },
    { name: null, moves: "Q16 R17 Q17 R16 R15 S15 S14" },
    { name: "komoku", moves: "R16" },
    { name: "komoku-low-approach", moves: "R16 P17" },
    { name: "komoku-high-approach", moves: "R16 P16" },
  ],
};

const TREES = {
  whole: {
    setup: { b: [], w: [] },
    toMove: "B",
    symmetry: "all",
    maxDepth: 10,
    branching: (d) => (d <= 2 ? 3 : d <= 5 ? 2 : 1),
    local: () => true,
    rootAuto: true,
  },
  corner: {
    setup: { b: ["D4", "K10"].map(gtpToXY), w: ["D16", "Q4"].map(gtpToXY) },
    toMove: "B",
    symmetry: "corner",
    maxDepth: 16,
    branching: (d) => (d <= 3 ? 3 : d <= 7 ? 2 : 1),
    // The upper-right quarter (and its centre line).
    local: (x, y) => x >= 9 && y <= 9,
    // Black's first corner stone comes from the named lines only.
    rootAuto: false,
  },
};

/** Expand a candidate only when it has this share of the visits... */
const SHARE = 0.08;
/** ...and loses at most this many points against KataGo's first choice. */
const AUTO_LOSS = 3;

/* ------------------------------------------------------------- KataGo */

function startKataGo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "goban-book-"));
  const cfg = path.join(dir, "analysis.cfg");
  fs.writeFileSync(
    cfg,
    [
      `logDir = ${path.join(dir, "logs")}`,
      "logToStderr = false",
      "reportAnalysisWinratesAs = BLACK",
      `numAnalysisThreads = ${THREADS}`,
      `numSearchThreadsPerAnalysisThread = ${SEARCH_THREADS}`,
      `nnMaxBatchSize = ${Math.max(8, THREADS * SEARCH_THREADS * 2)}`,
      "nnCacheSizePowerOfTwo = 20",
      "analysisPVLen = 4",
      "",
    ].join("\n"),
  );
  const child = spawn(KATAGO, ["analysis", "-config", cfg, "-model", MODEL], { stdio: ["pipe", "pipe", "pipe"] });
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (_) {
      return;
    }
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.reject(new Error(msg.error));
    else w.resolve(msg);
  });
  let err = "";
  child.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
  child.on("exit", (code) => {
    for (const w of waiting.values()) w.reject(new Error(`KataGo exited (${code}): ${err}`));
  });
  let seq = 0;
  return {
    query(q) {
      const id = `q${seq++}`;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, ...q }) + "\n");
      });
    },
    close() {
      child.stdin.end();
    },
  };
}

/* -------------------------------------------------------------- build */

function sideOf(c) {
  return c === BLACK ? "B" : "W";
}

/** Canonical-frame next moves of the named lines, by position key. */
function namedIndex(id, spec) {
  const group = GROUPS[spec.symmetry];
  const next = new Map();
  const names = new Map();
  for (const line of LINES[id]) {
    let m = setupSignMap(spec, N);
    let turn = spec.toMove === "W" ? WHITE : BLACK;
    const moves = line.moves.split(/\s+/).map(gtpToXY);
    moves.forEach((mv, i) => {
      const here = canonical(stonesOf(m), turn, group, N);
      const p = decodeMove(mv);
      const [cx, cy] = SYMMETRIES[here.sym](p.x, p.y, N);
      if (!next.has(here.key)) next.set(here.key, new Set());
      next.get(here.key).add(encodeMove(cx, cy));
      m = playOn(m, p.x, p.y, turn);
      turn = turn === BLACK ? WHITE : BLACK;
      if (i === moves.length - 1 && line.name) names.set(canonical(stonesOf(m), turn, group, N).key, line.name);
    });
  }
  return { next, names };
}

async function buildTree(engine, id) {
  const spec = TREES[id];
  const group = GROUPS[spec.symmetry];
  const { next: named, names: namedNames } = namedIndex(id, spec);
  const records = [];
  const nodes = [];
  const byKey = new Map();
  const names = {};

  const add = (parent, move) => {
    let signMap;
    let turn;
    let path = [];
    let depth = 0;
    if (!parent) {
      signMap = setupSignMap(spec, N);
      turn = spec.toMove === "W" ? WHITE : BLACK;
    } else {
      const p = decodeMove(move);
      signMap = playOn(parent.signMap, p.x, p.y, parent.turn);
      turn = parent.turn === BLACK ? WHITE : BLACK;
      path = [...parent.path, [sideOf(parent.turn), xyToGtp(move)]];
      depth = parent.depth + 1;
    }
    const { key, sym } = canonical(stonesOf(signMap), turn, group, N);
    const existing = byKey.get(key);
    if (existing) {
      if (parent && !parent.edgeTo.has(existing.index)) {
        parent.edgeTo.add(existing.index);
        records.push([parent.index, move, existing.index]);
      }
      return null;
    }
    const node = { index: records.length, key, sym, signMap, turn, path, depth, parent, move, edgeTo: new Set(), named: named.has(key) };
    records.push(null);
    nodes.push(node);
    byKey.set(key, node);
    if (parent) parent.edgeTo.add(node.index);
    if (namedNames.has(key)) names[node.index] = namedNames.get(key);
    return node;
  };

  let frontier = [add(null, null)];
  let count = 1;
  const t0 = Date.now();
  while (frontier.length) {
    const results = await Promise.all(
      frontier.map((node) =>
        engine.query({
          initialStones: [
            ...spec.setup.w.map((s) => ["W", xyToGtp(s)]),
            ...spec.setup.b.map((s) => ["B", xyToGtp(s)]),
          ],
          initialPlayer: spec.toMove,
          moves: node.path,
          rules: RULES,
          komi: KOMI,
          boardXSize: N,
          boardYSize: N,
          maxVisits: VISITS,
        }),
      ),
    );
    const nextFrontier = [];
    frontier.forEach((node, i) => {
      const r = results[i];
      const rootVisits = r.rootInfo.visits;
      const infos = r.moveInfos.filter((m) => m.move !== "pass").sort((a, b) => a.order - b.order);
      const cands = infos
        .filter((m, j) => j < 3 || m.visits >= Math.max(2, rootVisits * 0.015))
        .slice(0, 8)
        .map((m) => [gtpToXY(m.move), m.visits, Math.round(m.winrate * 1000), Math.round(m.scoreLead * 10)]);
      records[node.index] = [
        node.parent ? node.parent.index : -1,
        node.move || "",
        Math.round(r.rootInfo.winrate * 1000),
        Math.round(r.rootInfo.scoreLead * 10),
        rootVisits,
        cands,
      ];
      // Children: the named moves first, then KataGo's own top choices.
      const kids = [];
      const namedNext = named.get(node.key);
      if (namedNext) {
        const inv = INVERSE[node.sym];
        for (const cm of namedNext) {
          const p = decodeMove(cm);
          const [x, y] = SYMMETRIES[inv](p.x, p.y, N);
          kids.push(encodeMove(x, y));
        }
      }
      const autoOk = node.depth < spec.maxDepth && (node.parent || spec.rootAuto) && count < MAX[id];
      if (autoOk) {
        const s = node.turn === BLACK ? 1 : -1;
        const best = infos.length ? s * infos[0].scoreLead : 0;
        let taken = 0;
        for (const m of infos) {
          if (taken >= spec.branching(node.depth)) break;
          if (m.visits < rootVisits * SHARE) continue;
          if (best - s * m.scoreLead > AUTO_LOSS) continue;
          const mv = gtpToXY(m.move);
          const p = decodeMove(mv);
          if (!spec.local(p.x, p.y)) continue;
          taken++;
          if (!kids.includes(mv)) kids.push(mv);
        }
      }
      for (const mv of kids) {
        const p = decodeMove(mv);
        if (node.signMap[p.y][p.x] !== 0) continue;
        const isNamed = namedNext && kids.indexOf(mv) < namedNext.size;
        if (!isNamed && count >= MAX[id]) continue;
        const child = add(node, mv);
        if (child) {
          count++;
          nextFrontier.push(child);
        }
      }
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`${id}: depth ${frontier[0].depth} — ${frontier.length} searched, ${count} positions, ${secs}s`);
    frontier = nextFrontier;
  }
  return {
    size: N,
    setup: spec.setup,
    toMove: spec.toMove,
    symmetry: spec.symmetry,
    komi: KOMI,
    rules: RULES,
    names,
    nodes: records,
  };
}

const engine = startKataGo();
const book = {
  format: BOOK_FORMAT,
  engine: "KataGo",
  // The shipped network is engine/model/model.txt.gz, the public b6c96 net.
  network: arg("network-name", MODEL === path.join(root, "engine", "model", "model.txt.gz") ? "b6c96 (engine/model)" : path.basename(MODEL).replace(/\.(txt|bin)\.gz$/, "")),
  visits: VISITS,
  rules: RULES,
  komi: KOMI,
  made: new Date().toISOString().slice(0, 10),
  trees: {},
};
let previous = null;
if (ONLY && fs.existsSync(OUT)) previous = JSON.parse(fs.readFileSync(OUT, "utf8"));
for (const id of Object.keys(TREES)) {
  if (ONLY && ONLY !== id) {
    if (previous?.trees?.[id]) book.trees[id] = previous.trees[id];
    continue;
  }
  book.trees[id] = await buildTree(engine, id);
}
engine.close();
fs.writeFileSync(OUT, JSON.stringify(book) + "\n");
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`${path.relative(root, OUT)}: ${kb} KB, ${Object.entries(book.trees).map(([k, t]) => `${k} ${t.nodes.length}`).join(", ")}`);
