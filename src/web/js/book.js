/**
 * v6 explorer: the opening and joseki book.
 *
 * The book (content/book.json) is precomputed by scripts/make-book.mjs with
 * KataGo; it ships with the app, so the explorer works offline and in the
 * browser preview. It has two trees:
 *
 *   whole   whole-board openings from the empty 19×19 board.
 *   corner  corner joseki in the upper-right corner, evaluated in a fixed
 *           whole-board setup (see `setup` in the tree), never in a vacuum.
 *
 * File format (format 1). A tree is a flat list of records:
 *
 *   [parent, move, winrate, score, visits, candidates]   an evaluated position
 *   [parent, move, target]                               a transposition edge
 *
 * `parent` is the index of the parent record (-1 for the root), `move` the
 * move from the parent as two letters "xy" (a = 0, from the top-left). The
 * position of a record is its parent's position plus the move, replayed in
 * the parent's frame. `winrate` is Black's win rate × 1000, `score` Black's
 * score lead × 10, `visits` the search size. `candidates` are KataGo's
 * candidate moves at that position: [move, visits, winrate, score] with the
 * same units. A transposition edge says that `move` from `parent` reaches
 * the position of record `target` (by another move order or a symmetry).
 *
 * Positions are matched by stones and side to move, so move order does not
 * matter (transpositions), and up to the symmetries of the tree's setup:
 * all eight board symmetries for the empty board, and the mirror along the
 * upper-right diagonal for the corner tree, whose setup is symmetric under
 * it. A lookup returns the book node with every move mapped into the
 * player's own frame.
 */
import { BLACK, WHITE, EMPTY } from "./rules.js";

export const BOOK_FORMAT = 1;

/** Point loss (for the player who moves) up to which a move is joseki. */
export const JOSEKI_LOSS = 1.5;
/** Point loss up to which a move is playable; above it, a mistake. */
export const PLAYABLE_LOSS = 4;

const A = "a".charCodeAt(0);

export function encodeMove(x, y) {
  return String.fromCharCode(A + x, A + y);
}

export function decodeMove(s) {
  if (!s || s.length !== 2) return null;
  return { x: s.charCodeAt(0) - A, y: s.charCodeAt(1) - A };
}

/* ------------------------------------------------------------ symmetry */

/** The eight symmetries of a square board, as functions of (x, y, n). */
export const SYMMETRIES = [
  (x, y) => [x, y],
  (x, y, n) => [n - 1 - x, y],
  (x, y, n) => [x, n - 1 - y],
  (x, y, n) => [n - 1 - x, n - 1 - y],
  (x, y) => [y, x],
  (x, y, n) => [n - 1 - y, x],
  (x, y, n) => [y, n - 1 - x],
  (x, y, n) => [n - 1 - y, n - 1 - x],
];

/** The inverse of each symmetry above (by index). */
export const INVERSE = [0, 1, 2, 3, 4, 6, 5, 7];

/** Symmetry groups by tree: indices into SYMMETRIES. */
export const GROUPS = {
  all: [0, 1, 2, 3, 4, 5, 6, 7],
  // The anti-diagonal (upper-right to lower-left) mirror maps the upper
  // right corner onto itself: (x, y) → (n-1-y, n-1-x).
  corner: [0, 7],
  none: [0],
};

export function applySym(s, x, y, n = 19) {
  return SYMMETRIES[s](x, y, n);
}

/**
 * The position key under one symmetry: side to move, then the sorted black
 * and white points. Captured stones are simply absent.
 */
function keyUnder(stones, toMove, s, n) {
  const b = [];
  const w = [];
  for (const [x, y, c] of stones) {
    const [u, v] = SYMMETRIES[s](x, y, n);
    (c === BLACK ? b : w).push(encodeMove(u, v));
  }
  b.sort();
  w.sort();
  return (toMove === BLACK ? "B" : "W") + b.join("") + "|" + w.join("");
}

/** [[x, y, colour], ...] from a sign map. */
export function stonesOf(signMap) {
  const out = [];
  for (let y = 0; y < signMap.length; y++) {
    const row = signMap[y];
    for (let x = 0; x < row.length; x++) if (row[x] !== EMPTY) out.push([x, y, row[x]]);
  }
  return out;
}

/**
 * The canonical key of a position under a symmetry group, and the symmetry
 * that produces it: { key, sym }. The canonical key is the least key over
 * the group.
 */
export function canonical(stones, toMove, group = GROUPS.all, n = 19) {
  let best = null;
  let sym = 0;
  for (const s of group) {
    const k = keyUnder(stones, toMove, s, n);
    if (best === null || k < best) {
      best = k;
      sym = s;
    }
  }
  return { key: best, sym };
}

/* ------------------------------------------------------------- loading */

/**
 * A small board model for replaying book lines: a sign map and captures,
 * enough for openings (single captures and ko are rare and harmless here).
 */
function playOn(signMap, x, y, color) {
  const n = signMap.length;
  const m = signMap.map((r) => r.slice());
  m[y][x] = color;
  const opp = color === BLACK ? WHITE : BLACK;
  const near = (px, py) => [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n);
  const group = (gx, gy) => {
    const c = m[gy][gx];
    const seen = new Set([gy * n + gx]);
    const stack = [[gx, gy]];
    let libs = 0;
    while (stack.length) {
      const [px, py] = stack.pop();
      for (const [a, b] of near(px, py)) {
        const k = b * n + a;
        if (seen.has(k)) continue;
        if (m[b][a] === EMPTY) {
          seen.add(k);
          libs++;
        } else if (m[b][a] === c) {
          seen.add(k);
          stack.push([a, b]);
        }
      }
    }
    return { libs, points: [...seen].filter((k) => m[Math.floor(k / n)][k % n] === c) };
  };
  for (const [a, b] of near(x, y)) {
    if (m[b][a] !== opp) continue;
    const g = group(a, b);
    if (g.libs === 0) for (const k of g.points) m[Math.floor(k / n)][k % n] = EMPTY;
  }
  return m;
}

export function setupSignMap(tree, n = 19) {
  const m = Array.from({ length: n }, () => Array(n).fill(EMPTY));
  for (const s of tree.setup?.b || []) {
    const p = decodeMove(s);
    m[p.y][p.x] = BLACK;
  }
  for (const s of tree.setup?.w || []) {
    const p = decodeMove(s);
    m[p.y][p.x] = WHITE;
  }
  return m;
}

/**
 * Index one tree of the book: replays every record and builds the key map.
 * Returns { id, tree, group, nodes, byKey }. Each node: { index, key, sym,
 * signMap, toMove, depth, winrate, score, visits, candidates, edges,
 * parent, move, name }, all moves in the node's own (replay) frame.
 */
export function indexTree(id, tree) {
  const n = tree.size || 19;
  const group = GROUPS[tree.symmetry] || GROUPS.none;
  const nodes = [];
  const byKey = new Map();
  const pending = [];
  const rootTurn = tree.toMove === "W" ? WHITE : BLACK;
  for (let i = 0; i < tree.nodes.length; i++) {
    const rec = tree.nodes[i];
    const [parent, move] = rec;
    let signMap;
    let toMove;
    let depth = 0;
    if (parent < 0) {
      signMap = setupSignMap(tree, n);
      toMove = rootTurn;
    } else {
      const p = nodes[parent];
      if (!p) throw new Error(`book ${id}: record ${i} names a later parent`);
      const mv = decodeMove(move);
      if (rec.length === 3) {
        pending.push({ from: p, move, target: rec[2] });
        nodes.push(null);
        continue;
      }
      signMap = playOn(p.signMap, mv.x, mv.y, p.toMove);
      toMove = p.toMove === BLACK ? WHITE : BLACK;
      depth = p.depth + 1;
    }
    const { key, sym } = canonical(stonesOf(signMap), toMove, group, n);
    const node = {
      index: i,
      key,
      sym,
      signMap,
      toMove,
      depth,
      parent: parent < 0 ? null : nodes[parent],
      move: parent < 0 ? null : move,
      winrate: rec[2] / 1000,
      score: rec[3] / 10,
      visits: rec[4],
      candidates: (rec[5] || []).map(([m, v, w, s]) => ({ move: m, visits: v, winrate: w / 1000, score: s / 10 })),
      edges: [],
      name: tree.names?.[i] || null,
    };
    nodes.push(node);
    if (!byKey.has(key)) byKey.set(key, node);
    if (node.parent) node.parent.edges.push({ move, node });
  }
  for (const { from, move, target } of pending) {
    const t = nodes[target];
    if (t) from.edges.push({ move, node: t });
  }
  // Names travel down a line until the next named position.
  for (const node of nodes) {
    if (node && !node.name && node.parent) node.lineName = node.parent.name || node.parent.lineName || null;
  }
  return { id, tree, group, size: n, nodes: nodes.filter(Boolean), byKey };
}

export function loadBook(json) {
  if (!json || json.format !== BOOK_FORMAT) throw new Error("unknown book format");
  const trees = {};
  for (const [id, tree] of Object.entries(json.trees || {})) trees[id] = indexTree(id, tree);
  return { meta: { network: json.network, engine: json.engine, visits: json.visits, rules: json.rules, komi: json.komi, made: json.made }, trees };
}

/* -------------------------------------------------------------- lookup */

/**
 * Map a move "xy" from a book node's frame into the player's frame. The
 * player's position is S_u⁻¹(S_r(node)), where S_r is the node's canonical
 * symmetry and S_u the player's (both reach the same canonical key).
 */
function mapper(nodeSym, userSym, n) {
  const inv = INVERSE[userSym];
  return (mv) => {
    const p = decodeMove(mv);
    if (!p) return null;
    const [a, b] = SYMMETRIES[nodeSym](p.x, p.y, n);
    const [x, y] = SYMMETRIES[inv](a, b, n);
    return { x, y };
  };
}

/** Mover's point of view: +1 for Black, −1 for White. */
const pov = (color) => (color === BLACK ? 1 : -1);

/**
 * Classify a point loss: "joseki" (≤ JOSEKI_LOSS, a book move; "good" for
 * a KataGo candidate the book does not follow), "playable" (≤
 * PLAYABLE_LOSS) or "mistake".
 */
export function tagOf(loss, inBook = true) {
  if (loss <= JOSEKI_LOSS) return inBook ? "joseki" : "good";
  if (loss <= PLAYABLE_LOSS) return "playable";
  return "mistake";
}

/**
 * The continuations of a book node: every book move (each one with its own
 * evaluated position), then KataGo's other candidates, each group best first. Each:
 * { move: "xy", x, y, inBook, visits, winrate, score, loss, tag, node }.
 * `loss` is in points for the player to move, against the best of the
 * evaluated replies and KataGo's first choice.
 */
export function continuations(node, map = (mv) => decodeMove(mv)) {
  const s = pov(node.toMove);
  const own = new Map();
  for (const e of node.edges) {
    if (!own.has(e.move)) own.set(e.move, e.node);
  }
  const cands = new Map(node.candidates.map((c) => [c.move, c]));
  let best = -Infinity;
  const top = node.candidates[0];
  if (top) best = s * top.score;
  for (const child of own.values()) best = Math.max(best, s * child.score);
  const out = [];
  const seen = new Set();
  for (const [mv, child] of own) {
    seen.add(mv);
    const c = cands.get(mv);
    const loss = Math.max(0, best - s * child.score);
    out.push({ move: mv, ...map(mv), inBook: true, visits: c?.visits || 0, winrate: child.winrate, score: child.score, loss, tag: tagOf(loss), node: child });
  }
  for (const c of node.candidates) {
    if (seen.has(c.move)) continue;
    const loss = Math.max(0, best - s * c.score);
    out.push({ move: c.move, ...map(c.move), inBook: false, visits: c.visits, winrate: c.winrate, score: c.score, loss, tag: tagOf(loss, false), node: null });
  }
  // Book moves first (they have their own evaluated positions), then
  // KataGo's other candidates; each group best first.
  out.sort((a, b) => b.inBook - a.inBook || a.loss - b.loss || b.visits - a.visits);
  return out;
}

/**
 * Look up a position in one indexed tree. Returns null when it is not in
 * the book, else { node, sym, continuations } with every continuation's
 * point in the player's frame.
 */
export function lookup(book, signMap, toMove) {
  const n = book.size;
  if (signMap.length !== n) return null;
  const { key, sym } = canonical(stonesOf(signMap), toMove, book.group, n);
  const node = book.byKey.get(key);
  if (!node) return null;
  const map = mapper(node.sym, sym, n);
  return { node, sym, map, continuations: withSymmetricMoves(continuations(node, map), stabilizer(signMap, toMove, book.group, n), n) };
}

/** The symmetries of the group that leave this position unchanged. */
export function stabilizer(signMap, toMove, group = GROUPS.all, n = 19) {
  const stones = stonesOf(signMap);
  const id = keyUnder(stones, toMove, 0, n);
  return group.filter((s) => s !== 0 && keyUnder(stones, toMove, s, n) === id);
}

/**
 * On a symmetric position (the empty board, two star points on one side)
 * equivalent moves are the same move: each continuation is repeated at its
 * images, unless the book already lists that point.
 */
function withSymmetricMoves(list, syms, n) {
  if (!syms.length) return list;
  const listed = new Set(list.map((c) => c.y * n + c.x));
  const covered = new Map();
  const out = [];
  for (const c of list) {
    const k0 = c.y * n + c.x;
    if (covered.has(k0)) {
      // The same move as an earlier continuation, seen from another side.
      const of = covered.get(k0);
      const p = out[of];
      out.push({ ...c, image: true, of, inBook: p.inBook, node: p.node, loss: p.loss, tag: p.tag, winrate: p.winrate, score: p.score });
      continue;
    }
    const idx = out.length;
    covered.set(k0, idx);
    out.push(c);
    for (const s of syms) {
      const [x, y] = SYMMETRIES[s](c.x, c.y, n);
      const k = y * n + x;
      if (covered.has(k)) continue;
      covered.set(k, idx);
      if (!listed.has(k)) out.push({ ...c, x, y, image: true, of: idx });
    }
  }
  return out;
}

/**
 * How a move from a book position fares: the matching continuation, or
 * null when the move is neither a book move nor a KataGo candidate.
 */
export function judgeMove(book, signMap, toMove, x, y) {
  const hit = lookup(book, signMap, toMove);
  if (!hit) return null;
  return hit.continuations.find((c) => c.x === x && c.y === y) || null;
}

/**
 * For a game record (a list of {x, y, color} moves from the empty 19×19
 * board, passes as {pass: true}): the number of moves that stay in the
 * whole-board book. 0 when even the first move is not in it.
 */
export function bookDepth(book, moves, n = 19) {
  let m = Array.from({ length: n }, () => Array(n).fill(EMPTY));
  let toMove = BLACK;
  if (!lookup(book, m, toMove)) return 0;
  let depth = 0;
  for (const mv of moves) {
    if (!mv || mv.pass || mv.x == null) break;
    if (mv.color && mv.color !== toMove) break;
    const hit = lookup(book, m, toMove);
    const c = hit?.continuations.find((k) => k.inBook && k.x === mv.x && k.y === mv.y);
    if (!c) break;
    m = playOn(m, mv.x, mv.y, toMove);
    toMove = toMove === BLACK ? WHITE : BLACK;
    depth++;
  }
  return depth;
}

export { playOn };
