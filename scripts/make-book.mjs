/**
 * Build the opening and joseki book (src/web/js/content/book.json) with
 * KataGo's analysis engine.
 *
 * v7: the book is built on GitHub's runners (.github/workflows/book.yml) in
 * three phases, so the work splits over parallel jobs:
 *
 *   seed    one tree's top levels, searched in full; the positions just
 *           below them are the frontier.
 *   shard   a share of both trees' frontier positions, each grown into its
 *           own subtree with a share of the tree's budget.
 *   merge   all positions and their chosen continuations, joined into one
 *           book from the root (transpositions and symmetric positions
 *           found by different jobs become one record).
 *
 * `--phase all` (the default) runs the three in one process, for a local run.
 *
 * Usage:
 *   node scripts/make-book.mjs --katago <path/to/katago> --model <net.txt.gz>
 *        [--visits 2000] [--threads 4] [--search-threads 2]
 *        [--max-whole 1500] [--max-corner 2100] [--network-name <name>]
 *        [--phase all|seed|shard|merge] [--tree whole|corner] [--seed-dir dir]
 *        [--shard i --shards n] [--parts dir] [--deadline-min 300] [--out file]
 *
 * KataGo is not part of the repository: use the official Linux release
 * (Eigen/AVX2 build). The workflow uses the strong network pinned in
 * src/models.zig (g170e-b15c192).
 *
 * Two trees, both 19×19, Japanese rules, komi 6.5:
 *
 *   whole   from the empty board. The named lines below are always in the
 *           book; KataGo's own top choices are added best-first.
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
import { spawn, execFileSync } from "node:child_process";
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

const PHASE = arg("phase", "all");
const KATAGO = arg("katago", process.env.KATAGO || path.join(root, "engine", "linux", "katago"));
const MODEL = arg("model", path.join(root, "engine", "model", "model.txt.gz"));
const VISITS = Number(arg("visits", 2000));
const THREADS = Number(arg("threads", 4));
const SEARCH_THREADS = Number(arg("search-threads", 2));
const OUT = arg("out", path.join(root, "src", "web", "js", "content", "book.json"));
const MAX = { whole: Number(arg("max-whole", 1500)), corner: Number(arg("max-corner", 2100)) };
const SEED_DIR = arg("seed-dir", "book-parts");
const PARTS = arg("parts", "book-parts");
const SHARD = Number(arg("shard", 0));
const SHARDS = Number(arg("shards", 1));
const DEADLINE = Date.now() + Number(arg("deadline-min", 100000)) * 60000;
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
 * `name` labels the position after the last move. Every line here is a
 * standard move order; longer joseki come from KataGo's own choices.
 * Kobayashi and mini-Chinese are not named: their move orders vary too much
 * to state one line for them.
 */
const LINES = {
  whole: [
    { name: "star", moves: "Q16" },
    { name: "komoku", moves: "R16" },
    { name: "san-san", moves: "R17" },
    { name: "two-star", moves: "Q16 D4 Q4" },
    { name: "sanrensei", moves: "Q16 D4 Q4 D16 Q10" },
    { name: "diagonal-star", moves: "Q16 D16 D4" },
    { name: "chinese", moves: "Q16 D4 R4 D16 R10" },
    { name: "high-chinese", moves: "Q16 D4 R4 D16 Q10" },
    { name: "star-komoku", moves: "Q16 D4 R4" },
    { name: "two-komoku", moves: "R16 D4 Q3" },
    { name: "facing-komoku", moves: "R16 D16 R4" },
    { name: "komoku-star", moves: "R16 D4 Q4" },
    { name: "star-early-33", moves: "Q16 D4 Q4 D16 C17" },
  ],
  corner: [
    { name: "star", moves: "Q16" },
    { name: "star-low-approach", moves: "Q16 R14" },
    { name: "star-knight-response", moves: "Q16 R14 O17" },
    { name: null, moves: "Q16 R14 O17 R11" },
    { name: "star-attach", moves: "Q16 R14 Q14" },
    { name: "star-one-space-low-pincer", moves: "Q16 O17 M17" },
    { name: "star-one-space-high-pincer", moves: "Q16 O17 M16" },
    { name: "star-two-space-low-pincer", moves: "Q16 O17 L17" },
    { name: "star-pincer-33", moves: "Q16 O17 M17 R17" },
    { name: "star-high-approach", moves: "Q16 Q14" },
    { name: "star-33", moves: "Q16 R17" },
    { name: "star-33-block", moves: "Q16 R17 Q17" },
    { name: "star-33-hane", moves: "Q16 R17 Q17 R16 R15" },
    { name: "star-33-joseki", moves: "Q16 R17 Q17 R16 R15 S15 S14 S16 R14" },
    { name: "komoku", moves: "R16" },
    { name: "komoku-low-approach", moves: "R16 P17" },
    { name: "komoku-attach-draw-back", moves: "R16 P17 Q17 Q16 R17" },
    { name: "komoku-high-approach", moves: "R16 P16" },
    { name: "komoku-high-approach-attach", moves: "R16 P16 P17" },
  ],
};

const TREES = {
  whole: {
    setup: { b: [], w: [] },
    toMove: "B",
    symmetry: "all",
    maxDepth: 14,
    branching: (d) => (d <= 1 ? 4 : d <= 4 ? 3 : d <= 8 ? 2 : 1),
    local: () => true,
    rootAuto: true,
    // The seed searches the positions up to this depth.
    seedDepth: 2,
  },
  corner: {
    setup: { b: ["D4", "K10"].map(gtpToXY), w: ["D16", "Q4"].map(gtpToXY) },
    toMove: "B",
    symmetry: "corner",
    maxDepth: 20,
    branching: (d) => (d <= 2 ? 4 : d <= 6 ? 3 : d <= 11 ? 2 : 1),
    // The upper-right quarter (and its centre line).
    local: (x, y) => x >= 9 && y <= 9,
    // Black's first corner stone comes from the named lines only.
    rootAuto: false,
    seedDepth: 3,
  },
};

/** Expand a candidate only when it has this share of the visits... */
const SHARE = 0.07;
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
      "nnCacheSizePowerOfTwo = 21",
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

function katagoVersion() {
  try {
    const out = execFileSync(KATAGO, ["version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.match(/KataGo v?([\d.]+)/)?.[1] || null;
  } catch (_) {
    return null;
  }
}

/* -------------------------------------------------------------- frames */

const sideOf = (c) => (c === BLACK ? "B" : "W");
const other = (c) => (c === BLACK ? WHITE : BLACK);

/** A move from a node's own frame into the canonical frame, and back. */
function toCanon(mv, sym) {
  const p = decodeMove(mv);
  const [x, y] = SYMMETRIES[sym](p.x, p.y, N);
  return encodeMove(x, y);
}
function fromCanon(mv, sym) {
  const p = decodeMove(mv);
  const [x, y] = SYMMETRIES[INVERSE[sym]](p.x, p.y, N);
  return encodeMove(x, y);
}

/** A position from the tree's setup and a path of [side, GTP] moves. */
function replay(spec, pathMoves) {
  let m = setupSignMap(spec, N);
  let turn = spec.toMove === "W" ? WHITE : BLACK;
  for (const [, gtp] of pathMoves) {
    const p = decodeMove(gtpToXY(gtp));
    m = playOn(m, p.x, p.y, turn);
    turn = other(turn);
  }
  return { signMap: m, turn };
}

function position(spec, group, signMap, turn, pathMoves, depth, prob) {
  const { key, sym } = canonical(stonesOf(signMap), turn, group, N);
  return { key, sym, signMap, turn, path: pathMoves, depth, prob };
}

/** Canonical-frame next moves and names of the named lines, by position key. */
function namedIndex(id) {
  const spec = TREES[id];
  const group = GROUPS[spec.symmetry];
  const next = new Map();
  const names = new Map();
  for (const line of LINES[id]) {
    let m = setupSignMap(spec, N);
    let turn = spec.toMove === "W" ? WHITE : BLACK;
    const moves = line.moves.split(/\s+/).map(gtpToXY);
    moves.forEach((mv, i) => {
      const here = canonical(stonesOf(m), turn, group, N);
      if (!next.has(here.key)) next.set(here.key, new Set());
      next.get(here.key).add(toCanon(mv, here.sym));
      const p = decodeMove(mv);
      m = playOn(m, p.x, p.y, turn);
      turn = other(turn);
      if (i === moves.length - 1 && line.name) names.set(canonical(stonesOf(m), turn, group, N).key, line.name);
    });
  }
  return { next, names };
}

/* --------------------------------------------------------------- grow */

/**
 * Search positions best-first by depth with up to THREADS searches in
 * flight, and expand each into its children.
 *
 * `starts` are positions to search, each with a budget group { budget,
 * count }. `store` (key → entry) holds every searched position: Black's
 * win rate, score, visits, candidates and chosen children, all moves in
 * the canonical frame. Positions already in the store are not searched
 * again. With `stopBelow`, positions deeper than it are not searched but
 * returned as the frontier.
 */
async function grow(engine, id, starts, store, { stopBelow = Infinity, label = id } = {}) {
  const spec = TREES[id];
  const group = GROUPS[spec.symmetry];
  const { next: named } = namedIndex(id);
  const queued = new Set(starts.map((s) => s.key));
  const queue = starts.slice();
  const frontier = [];
  let inFlight = 0;
  let searched = 0;
  let stopped = false;
  const t0 = Date.now();

  const expand = (node, r) => {
    const rootVisits = r.rootInfo.visits;
    const infos = r.moveInfos.filter((m) => m.move !== "pass").sort((a, b) => a.order - b.order);
    const cands = infos
      .filter((m, j) => j < 3 || m.visits >= Math.max(2, rootVisits * 0.015))
      .slice(0, 8)
      .map((m) => [toCanon(gtpToXY(m.move), node.sym), m.visits, Math.round(m.winrate * 1000), Math.round(m.scoreLead * 10)]);
    const entry = {
      d: node.depth,
      w: Math.round(r.rootInfo.winrate * 1000),
      s: Math.round(r.rootInfo.scoreLead * 10),
      v: rootVisits,
      c: cands,
      k: [],
    };
    store.set(node.key, entry);
    // Children: the named moves first, then KataGo's own top choices.
    const kids = [];
    const namedNext = named.get(node.key);
    if (namedNext) for (const cm of namedNext) kids.push({ mv: fromCanon(cm, node.sym), named: true });
    const g = node.budget;
    const autoOk = node.depth < spec.maxDepth && (node.depth > 0 || spec.rootAuto) && g.count < g.budget;
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
        if (!kids.some((k) => k.mv === mv)) kids.push({ mv, named: false });
      }
    }
    const share = new Map(infos.map((m) => [gtpToXY(m.move), m.visits / Math.max(1, rootVisits)]));
    for (const { mv, named: isNamed } of kids) {
      const p = decodeMove(mv);
      if (node.signMap[p.y][p.x] !== 0) continue;
      const signMap = playOn(node.signMap, p.x, p.y, node.turn);
      const child = position(spec, group, signMap, other(node.turn), [...node.path, [sideOf(node.turn), xyToGtp(mv)]], node.depth + 1, node.prob * Math.max(0.02, share.get(mv) || 0));
      const known = store.has(child.key) || queued.has(child.key);
      if (!known) {
        if (!isNamed && g.count >= g.budget) continue;
        g.count++;
        child.budget = g;
        queued.add(child.key);
        queue.push(child);
      }
      entry.k.push(toCanon(mv, node.sym));
    }
  };

  await new Promise((done, fail) => {
    const pump = () => {
      if (stopped) return;
      if (Date.now() > DEADLINE && queue.length) {
        console.log(`${label}: deadline reached, ${queue.length} positions left unsearched`);
        queue.length = 0;
      }
      while (inFlight < THREADS && queue.length) {
        // Shallowest first, so the budget goes to breadth before depth.
        let bi = 0;
        for (let i = 1; i < queue.length; i++) if (queue[i].depth < queue[bi].depth) bi = i;
        const node = queue.splice(bi, 1)[0];
        if (store.has(node.key)) continue;
        if (node.depth > stopBelow) {
          frontier.push(node);
          continue;
        }
        inFlight++;
        engine
          .query({
            initialStones: [...spec.setup.w.map((s) => ["W", xyToGtp(s)]), ...spec.setup.b.map((s) => ["B", xyToGtp(s)])],
            initialPlayer: spec.toMove,
            moves: node.path,
            rules: RULES,
            komi: KOMI,
            boardXSize: N,
            boardYSize: N,
            maxVisits: VISITS,
          })
          .then((r) => {
            inFlight--;
            searched++;
            expand(node, r);
            if (searched % 20 === 0) console.log(`${label}: ${searched} searched, ${queue.length} queued, depth ${node.depth}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
            pump();
          })
          .catch((e) => {
            stopped = true;
            fail(e);
          });
      }
      if (!inFlight && !queue.length) done();
    };
    pump();
  });
  console.log(`${label}: ${searched} searched in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return frontier;
}

/* -------------------------------------------------------------- phases */

const storeToJSON = (store) => Object.fromEntries(store);
const storeFromJSON = (obj) => new Map(Object.entries(obj || {}));

function rootPosition(id) {
  const spec = TREES[id];
  const { signMap, turn } = replay(spec, []);
  return position(spec, GROUPS[spec.symmetry], signMap, turn, [], 0, 1);
}

/** Seed: search one tree's top levels; the frontier goes to the shards. */
async function seed(engine, id) {
  const store = new Map();
  const start = rootPosition(id);
  const g = { budget: MAX[id], count: 1 };
  start.budget = g;
  const frontier = await grow(engine, id, [start], store, { stopBelow: TREES[id].seedDepth, label: `${id} seed` });
  return {
    id,
    created: g.count,
    store: storeToJSON(store),
    frontier: frontier.map((f) => ({ key: f.key, path: f.path, depth: f.depth, prob: f.prob })),
  };
}

/**
 * The frontier of both trees, each position with its budget (the tree's
 * remaining budget by the square root of the line's share of KataGo's
 * visits), dealt to the shards largest first.
 */
function plan(seeds, shards) {
  const items = [];
  for (const sd of seeds) {
    const left = Math.max(0, MAX[sd.id] - sd.created);
    const weights = sd.frontier.map((f) => Math.sqrt(f.prob));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    sd.frontier.forEach((f, i) => items.push({ id: sd.id, ...f, budget: Math.max(4, Math.round((left * weights[i]) / total)) }));
  }
  items.sort((a, b) => b.budget - a.budget || (a.key < b.key ? -1 : 1));
  const load = Array(shards).fill(0);
  const out = Array.from({ length: shards }, () => []);
  for (const it of items) {
    let s = 0;
    for (let i = 1; i < shards; i++) if (load[i] < load[s]) s = i;
    load[s] += it.budget;
    out[s].push(it);
  }
  return out;
}

/** Shard: grow this shard's frontier positions into subtrees. */
async function shard(engine, seeds, index, shards) {
  const mine = plan(seeds, shards)[index];
  console.log(`shard ${index}/${shards}: ${mine.length} subtrees, budget ${mine.reduce((a, b) => a + b.budget, 0)}`);
  const out = { shard: index, trees: {} };
  // Both trees at once, so the engine never waits for one tree's last line.
  await Promise.all(
    Object.keys(TREES).map(async (id) => {
      const sd = seeds.find((s) => s.id === id);
      const store = storeFromJSON(sd?.store);
      const seeded = new Set(store.keys());
      const spec = TREES[id];
      const group = GROUPS[spec.symmetry];
      const starts = mine
        .filter((it) => it.id === id)
        .map((it) => {
          const { signMap, turn } = replay(spec, it.path);
          const p = position(spec, group, signMap, turn, it.path, it.depth, it.prob);
          p.budget = { budget: it.budget, count: 1 };
          return p;
        });
      if (starts.length) await grow(engine, id, starts, store, { label: `${id} shard ${index}` });
      out.trees[id] = Object.fromEntries([...store].filter(([k]) => !seeded.has(k)));
    }),
  );
  return out;
}

/** Merge: join every searched position into one book from the root. */
function merge(seeds, parts, meta) {
  const book = { format: BOOK_FORMAT, ...meta, trees: {} };
  for (const id of Object.keys(TREES)) {
    const spec = TREES[id];
    const group = GROUPS[spec.symmetry];
    const store = new Map();
    const take = (obj) => {
      for (const [k, e] of Object.entries(obj || {})) {
        const had = store.get(k);
        if (!had) store.set(k, { ...e, k: e.k.slice() });
        else for (const c of e.k) if (!had.k.includes(c)) had.k.push(c);
      }
    };
    take(seeds.find((s) => s.id === id)?.store);
    for (const p of parts) take(p.trees?.[id]);
    const { names: namedNames } = namedIndex(id);
    const records = [];
    const byKey = new Map();
    const names = {};
    const add = (parent, mv, signMap, turn) => {
      const { key, sym } = canonical(stonesOf(signMap), turn, group, N);
      const existing = byKey.get(key);
      if (existing) {
        if (parent && !parent.edgeTo.has(existing.index)) {
          parent.edgeTo.add(existing.index);
          records.push([parent.index, mv, existing.index]);
        }
        return null;
      }
      if (!store.has(key)) return null;
      const node = { index: records.length, key, sym, signMap, turn, parent, move: mv, edgeTo: new Set() };
      records.push(null);
      byKey.set(key, node);
      if (parent) parent.edgeTo.add(node.index);
      if (namedNames.has(key)) names[node.index] = namedNames.get(key);
      return node;
    };
    const start = rootPosition(id);
    let queue = [add(null, "", start.signMap, start.turn)];
    while (queue.length) {
      const next = [];
      for (const node of queue) {
        const e = store.get(node.key);
        records[node.index] = [node.parent ? node.parent.index : -1, node.move, e.w, e.s, e.v, e.c.map(([m, ...rest]) => [fromCanon(m, node.sym), ...rest])];
        for (const cm of e.k) {
          const mv = fromCanon(cm, node.sym);
          const p = decodeMove(mv);
          if (node.signMap[p.y][p.x] !== 0) continue;
          const child = add(node, mv, playOn(node.signMap, p.x, p.y, node.turn), other(node.turn));
          if (child) next.push(child);
        }
      }
      queue = next;
    }
    book.trees[id] = { size: N, setup: spec.setup, toMove: spec.toMove, symmetry: spec.symmetry, komi: KOMI, rules: RULES, names, nodes: records };
    const evaluated = records.filter((r) => r.length === 6).length;
    console.log(`${id}: ${evaluated} positions (${store.size} searched), ${records.length - evaluated} transposition edges`);
  }
  return book;
}

function meta(version) {
  const shipped = MODEL === path.join(root, "engine", "model", "model.txt.gz");
  return {
    engine: "KataGo",
    katago: version,
    network: arg("network-name", shipped ? "b6c96 (engine/model)" : path.basename(MODEL).replace(/\.(txt|bin)\.gz$/, "")),
    visits: VISITS,
    rules: RULES,
    komi: KOMI,
    made: new Date().toISOString().slice(0, 10),
  };
}

function writeBook(book) {
  fs.writeFileSync(OUT, JSON.stringify(book) + "\n");
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`${path.relative(root, OUT)}: ${kb} KB, ${Object.entries(book.trees).map(([k, t]) => `${k} ${t.nodes.length}`).join(", ")}`);
}

const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

if (PHASE === "seed") {
  const id = arg("tree", "whole");
  const engine = startKataGo();
  const sd = await seed(engine, id);
  engine.close();
  fs.mkdirSync(PARTS, { recursive: true });
  fs.writeFileSync(path.join(PARTS, `seed-${id}.json`), JSON.stringify(sd));
  console.log(`seed ${id}: ${Object.keys(sd.store).length} searched, ${sd.frontier.length} frontier`);
} else if (PHASE === "shard") {
  const seeds = Object.keys(TREES).map((id) => readJSON(path.join(SEED_DIR, `seed-${id}.json`)));
  const engine = startKataGo();
  const part = await shard(engine, seeds, SHARD, SHARDS);
  engine.close();
  fs.mkdirSync(PARTS, { recursive: true });
  fs.writeFileSync(path.join(PARTS, `shard-${SHARD}.json`), JSON.stringify(part));
} else if (PHASE === "merge") {
  const seeds = Object.keys(TREES).map((id) => readJSON(path.join(SEED_DIR, `seed-${id}.json`)));
  const parts = fs
    .readdirSync(PARTS)
    .filter((f) => /^shard-\d+\.json$/.test(f))
    .map((f) => readJSON(path.join(PARTS, f)));
  console.log(`merge: ${parts.length} shards`);
  writeBook(merge(seeds, parts, meta(arg("katago-version", null) || katagoVersion())));
} else {
  const engine = startKataGo();
  const seeds = [];
  for (const id of Object.keys(TREES)) seeds.push(await seed(engine, id));
  const part = await shard(engine, seeds, 0, 1);
  engine.close();
  writeBook(merge(seeds, [part], meta(katagoVersion())));
}
