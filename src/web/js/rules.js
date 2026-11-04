/**
 * Go rules, game tree and scoring.
 *
 * One tree node per move. A node stores the board after the move, the
 * captures, whose turn is next and whether the game has entered scoring.
 * Variations are just siblings; the UI navigates by moving `current`.
 *
 * Legality is delegated to @sabaki/go-board (MIT): overwrite, suicide and
 * simple ko are its job. Positional superko is checked here against the
 * ancestors, because the library has no history.
 *
 * Coordinates are zero-based from the top-left: x = column, y = row.
 */
import GoBoard from "@sabaki/go-board";
import { APP_VERSION } from "./version.js";

export const BLACK = 1;
export const WHITE = -1;
export const EMPTY = 0;
export const LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

export function other(color) {
  return color === BLACK ? WHITE : BLACK;
}

export function colorName(color) {
  return color === BLACK ? "black" : "white";
}

/** A1-style label; columns skip I, rows count up from the bottom. */
export function coordLabel(x, y, size) {
  return LETTERS[x] + String(size - y);
}

export function starPoints(size) {
  if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
  if (size === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
  if (size === 19) {
    const out = [];
    for (const x of [3, 9, 15]) for (const y of [3, 9, 15]) out.push([x, y]);
    return out;
  }
  return [];
}

/** Standard handicap points, in the order they are normally placed. */
export function handicapPoints(size, count) {
  const all = {
    9: [[6, 2], [2, 6], [2, 2], [6, 6], [4, 4], [6, 4], [2, 4], [4, 2], [4, 6]],
    13: [[9, 3], [3, 9], [3, 3], [9, 9], [6, 6], [9, 6], [3, 6], [6, 3], [6, 9]],
    19: [[15, 3], [3, 15], [3, 3], [15, 15], [9, 9], [15, 9], [3, 9], [9, 3], [9, 15]],
  };
  return (all[size] || []).slice(0, Math.max(0, Math.min(9, count)));
}

export function boardKey(board) {
  return board.signMap.map((row) => row.join("")).join("/");
}

export function boardFromSignMap(signMap) {
  return new GoBoard(signMap.map((row) => row.slice()));
}

export function emptySignMap(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function cloneBoard(board) {
  return board.clone();
}

export function territoryMap(board) {
  const size = board.width;
  const out = emptySignMap(size);
  const seen = new Set();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board.get([x, y]) !== EMPTY || seen.has(y * size + x)) continue;
      const region = [];
      const border = new Set();
      const edges = new Set();
      const stack = [[x, y]];
      seen.add(y * size + x);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        region.push([cx, cy]);
        if (cx === 0) edges.add("left");
        if (cx === size - 1) edges.add("right");
        if (cy === 0) edges.add("top");
        if (cy === size - 1) edges.add("bottom");
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const v = board.get([nx, ny]);
          if (v === EMPTY) {
            const key = ny * size + nx;
            if (!seen.has(key)) {
              seen.add(key);
              stack.push([nx, ny]);
            }
          } else {
            border.add(v);
          }
        }
      }
      // Japanese territory is an empty region bounded by stones of one
      // colour. A region that still reaches all four sides of the board has
      // not been separated from the rest of the board: a lone centre stone
      // or a wall with gaps leaves exactly such a region, and it is dame, not
      // territory. A corner eye (two sides) and a side territory (three
      // sides) still count. This is the board-edge rule, not a stone-count
      // heuristic; life and death are resolved by marking dead stones.
      if (border.size === 1 && edges.size < 4) {
        const color = [...border][0];
        for (const [rx, ry] of region) out[ry][rx] = color;
      }
    }
  }
  return out;
}

/** Simple influence map for the review overlay: distance-weighted stones. */
export function influenceMap(board) {
  const size = board.width;
  const out = Array.from({ length: size }, () => Array(size).fill(0));
  const stones = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = board.get([x, y]);
      if (v !== EMPTY) stones.push([x, y, v]);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (const [sx, sy, color] of stones) {
        const d = Math.abs(sx - x) + Math.abs(sy - y);
        if (d === 0) continue;
        sum += color / Math.pow(d, 1.35);
      }
      out[y][x] = Math.max(-1, Math.min(1, sum / 2.2));
    }
  }
  return out;
}

function replayPath(root, node) {
  const path = [];
  for (let n = node; n; n = n.parent) path.push(n);
  path.reverse();
  return path;
}

let nextNodeId = 1;

export class Game {
  constructor({
    size = 19,
    komi = 6.5,
    handicap = 0,
    date = new Date(),
    playerBlack = "Black",
    playerWhite = "White",
    event = "",
  } = {}) {
    this.size = size;
    // Japanese territory scoring is the app's only ruleset.
    this.rules = "japanese";
    this.komi = Number(komi);
    this.handicap = Math.max(0, Math.min(9, Number(handicap) || 0));
    this.date = date instanceof Date ? date : new Date(date);
    this.playerBlack = playerBlack;
    this.playerWhite = playerWhite;
    this.event = event;
    this.warnings = [];

    const board = GoBoard.fromDimensions(size);
    for (const [x, y] of handicapPoints(size, this.handicap)) board.set([x, y], BLACK);
    this.root = this._node({
      parent: null,
      move: null,
      board,
      captures: [0, 0],
      turn: this.handicap > 0 ? WHITE : BLACK,
      passes: 0,
      phase: "playing",
      result: null,
      comment: "",
      marks: [],
    });
    this.root.id = 0;
    this.current = this.root;
  }

  _node(fields) {
    return {
      id: nextNodeId++,
      parent: fields.parent,
      children: [],
      move: fields.move,
      board: fields.board,
      captures: fields.captures || [fields.board.getCaptures(BLACK) || 0, fields.board.getCaptures(WHITE) || 0],
      turn: fields.turn,
      passes: fields.passes || 0,
      phase: fields.phase || "playing",
      result: fields.result || null,
      comment: fields.comment || "",
      marks: fields.marks || [],
      // v5: SGF properties this app does not interpret, kept for the round
      // trip ({ KEY: [raw values] }), or null.
      extra: fields.extra || null,
    };
  }

  _append(parent, fields) {
    const node = this._node({ ...fields, parent });
    parent.children.push(node);
    return node;
  }

  _positionSeen(board, upto) {
    const key = boardKey(board);
    for (let n = upto; n; n = n.parent) {
      if (boardKey(n.board) === key) return true;
    }
    return false;
  }

  get board() {
    return this.current.board;
  }

  get turn() {
    return this.current.turn;
  }

  get phase() {
    return this.current.phase;
  }

  get result() {
    return this.current.result;
  }

  get lastMove() {
    return this.current.move;
  }

  get moveNumber() {
    let n = 0;
    for (let p = this.current; p && p.parent; p = p.parent) n++;
    return n;
  }

  get path() {
    return replayPath(this.root, this.current);
  }

  nodeById(id) {
    const stack = [this.root];
    while (stack.length) {
      const n = stack.pop();
      if (n.id === id) return n;
      stack.push(...n.children);
    }
    return null;
  }

  goto(id) {
    const node = typeof id === "object" ? id : this.nodeById(id);
    if (!node) return false;
    this.current = node;
    return true;
  }

  undo() {
    if (!this.current.parent) return false;
    const parent = this.current.parent;
    // Undo is a discard, not a branch: if the move being undone has no
    // continuation, remove it. A move with children is a branch point, so
    // moving the cursor back preserves the variation.
    if (this.current.children.length === 0) {
      parent.children = parent.children.filter((child) => child !== this.current);
    }
    this.current = parent;
    return true;
  }

  canPlay(x, y) {
    if (this.current.phase !== "playing") return { ok: false, reason: "phase" };
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return { ok: false, reason: "outside" };
    const board = this.current.board;
    if (board.get([x, y]) !== EMPTY) return { ok: false, reason: "occupied" };
    const analysis = board.analyzeMove(this.current.turn, [x, y]);
    if (analysis.ko) return { ok: false, reason: "ko" };
    if (analysis.suicide) return { ok: false, reason: "suicide" };
    const next = board.makeMove(this.current.turn, [x, y]);
    if (this._positionSeen(next, this.current)) return { ok: false, reason: "superko" };
    return { ok: true };
  }

  play(x, y, { color = null, force = false } = {}) {
    if (!force && this.current.phase !== "playing") return { ok: false, reason: "phase" };
    const sign = color || this.current.turn;
    if (!force && sign !== this.current.turn) return { ok: false, reason: "turn" };
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return { ok: false, reason: "outside" };
    const board = this.current.board;
    if (board.get([x, y]) !== EMPTY) return { ok: false, reason: "occupied" };
    const analysis = board.analyzeMove(sign, [x, y]);
    if (analysis.ko && !force) return { ok: false, reason: "ko" };
    if (analysis.suicide && !force) return { ok: false, reason: "suicide" };
    let next;
    try {
      next = board.makeMove(sign, [x, y], { preventSuicide: !force, preventOverwrite: true, preventKo: !force });
    } catch (e) {
      return { ok: false, reason: "illegal" };
    }
    if (!force && this._positionSeen(next, this.current)) return { ok: false, reason: "superko" };
    const node = this._append(this.current, {
      move: { color: sign, x, y, pass: false },
      board: next,
      captures: [next.getCaptures(BLACK) || 0, next.getCaptures(WHITE) || 0],
      turn: other(sign),
      passes: 0,
      phase: "playing",
    });
    this.current = node;
    return { ok: true, node, captures: this.capturesOf(node) };
  }

  capturesOf(node) {
    return {
      black: node.board.getCaptures(BLACK) || 0,
      white: node.board.getCaptures(WHITE) || 0,
    };
  }

  pass({ color = null, force = false } = {}) {
    if (!force && this.current.phase !== "playing") return { ok: false, reason: "phase" };
    const sign = color || this.current.turn;
    const passes = (this.current.passes || 0) + 1;
    const node = this._append(this.current, {
      move: { color: sign, x: null, y: null, pass: true },
      board: cloneBoard(this.current.board),
      captures: [this.current.board.getCaptures(BLACK) || 0, this.current.board.getCaptures(WHITE) || 0],
      turn: other(sign),
      passes,
      phase: passes >= 2 ? "scoring" : "playing",
    });
    this.current = node;
    return { ok: true, node };
  }

  resign(color = this.current.turn) {
    const winner = color === BLACK ? "W" : "B";
    this.current.phase = "ended";
    this.current.result = winner + "+R";
    return { ok: true, result: this.current.result };
  }

  resumePlay() {
    if (this.current.phase === "scoring") {
      this.current.phase = "playing";
      this.current.passes = 0;
      return true;
    }
    return false;
  }

  setup(stones, turn = BLACK) {
    const board = GoBoard.fromDimensions(this.size);
    // SGF uses `color`; lesson and tsumego data use the shorter `c`.
    for (const s of stones || []) board.set([s.x, s.y], s.color ?? s.c);
    this.root = this._node({
      parent: null,
      move: null,
      board,
      captures: [0, 0],
      turn,
      passes: 0,
      phase: "playing",
      result: null,
      comment: "",
      marks: [],
    });
    this.root.id = 0;
    this.current = this.root;
  }

  setRootComment(text) {
    this.root.comment = String(text || "");
  }

  /* ------------------------------------------------ v5: node editing */

  /** Set (or clear, with "") the comment of a node (object or id). */
  setComment(node, text) {
    const n = typeof node === "object" ? node : this.nodeById(node);
    if (!n) return false;
    n.comment = String(text ?? "").replace(/\r\n?/g, "\n");
    return true;
  }

  /**
   * Toggle a mark at (x, y) on a node. `kind` is one of MARK_KINDS. One mark
   * per point: the same kind again removes it, another kind replaces it.
   * A label without `text` gets the next free letter (A, B, C … then 1, 2 …).
   * Returns the mark now at the point, or null when it was removed.
   */
  toggleMark(node, x, y, kind, text = null) {
    const n = typeof node === "object" ? node : this.nodeById(node);
    if (!n || !MARK_KINDS.includes(kind)) return null;
    if (!(x >= 0 && y >= 0 && x < this.size && y < this.size)) return null;
    const marks = n.marks || [];
    const at = marks.find((m) => m.x === x && m.y === y);
    const rest = marks.filter((m) => m !== at);
    if (at && at.type === kind && (kind !== "label" || text == null || at.text === String(text))) {
      n.marks = rest;
      return null;
    }
    const mark = { x, y, type: kind };
    if (kind === "label") mark.text = text != null && String(text) !== "" ? String(text) : nextLabel(rest);
    n.marks = [...rest, mark];
    return mark;
  }

  /**
   * Remove a node and everything below it. The root cannot be deleted. When
   * the cursor was inside the removed subtree it moves to the parent.
   * Deleting a first child makes the next variation the main line there.
   * Returns the parent, or null.
   */
  deleteNode(node) {
    const n = typeof node === "object" ? node : this.nodeById(node);
    if (!n || !n.parent) return null;
    const parent = n.parent;
    let inside = false;
    for (let c = this.current; c; c = c.parent) if (c === n) inside = true;
    parent.children = parent.children.filter((c) => c !== n);
    if (inside) this.current = parent;
    return parent;
  }

  /**
   * Make the line through `node` the main line: at every branch point on its
   * path from the root, its branch becomes the first child. The other
   * variations keep their relative order. Returns true when anything moved.
   */
  promoteVariation(node) {
    const n = typeof node === "object" ? node : this.nodeById(node);
    if (!n) return false;
    let changed = false;
    for (let c = n; c.parent; c = c.parent) {
      const kids = c.parent.children;
      const i = kids.indexOf(c);
      if (i > 0) {
        kids.splice(i, 1);
        kids.unshift(c);
        changed = true;
      }
    }
    return changed;
  }

  /** Is `node` on the main line? */
  isMainLine(node) {
    if (!node) return false;
    for (let c = node; c.parent; c = c.parent) if (c.parent.children[0] !== c) return false;
    return true;
  }

  setResult(result) {
    this.current.result = result || null;
    if (result) this.current.phase = "ended";
  }

  /** Japanese territory score (territory + prisoners + komi), after removing dead stones. */
  score(deadStones = []) {
    const board = this.current.board.clone();
    const dead = [];
    for (const d of deadStones) {
      const v = board.get([d.x, d.y]);
      if (v !== EMPTY) {
        dead.push({ x: d.x, y: d.y, color: v });
        board.set([d.x, d.y], EMPTY);
      }
    }
    const territory = territoryMap(board);
    let blackTerritory = 0;
    let whiteTerritory = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (board.get([x, y]) !== EMPTY) continue;
        if (territory[y][x] === BLACK) blackTerritory++;
        else if (territory[y][x] === WHITE) whiteTerritory++;
      }
    }
    let blackPrisoners = this.current.board.getCaptures(BLACK) || 0;
    let whitePrisoners = this.current.board.getCaptures(WHITE) || 0;
    for (const d of dead) {
      if (d.color === BLACK) whitePrisoners++;
      else blackPrisoners++;
    }
    const black = blackTerritory + blackPrisoners;
    const white = whiteTerritory + whitePrisoners + this.komi;
    const diff = black - white;
    const result = diff > 0 ? "B+" + formatPoints(diff) : diff < 0 ? "W+" + formatPoints(-diff) : "Draw";
    return {
      black,
      white,
      diff,
      result,
      blackTerritory,
      whiteTerritory,
      captures: {
        black: this.current.board.getCaptures(BLACK) || 0,
        white: this.current.board.getCaptures(WHITE) || 0,
      },
      dead,
      territory,
      board,
    };
  }

  /** Main line of the tree, for review and export. */
  mainLine() {
    const out = [];
    let n = this.root;
    while (n) {
      out.push(n);
      n = n.children[0] || null;
    }
    return out;
  }

  toSGF() {
    const root = this.root;
    const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
    const dt = this.date instanceof Date ? this.date : new Date(this.date);
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const rules = "Japanese";
    // SGF skips I in columns, exactly as the board labels do.
    const sgfColumn = (x) => String.fromCharCode(97 + x + (x >= 8 ? 1 : 0));
    const sgfCoord = (x, y) => sgfColumn(x) + String.fromCharCode(97 + y);
    let head =
      "(;GM[1]FF[4]CA[UTF-8]AP[Goban Studio:" + APP_VERSION + "]SZ[" +
      this.size +
      "]KM[" +
      this.komi +
      "]RU[" +
      rules +
      "]HA[" +
      this.handicap +
      "]PB[" +
      esc(this.playerBlack) +
      "]PW[" +
      esc(this.playerWhite) +
      "]DT[" +
      date +
      "]";
    let terminal = this.current;
    while (terminal.children.length) terminal = terminal.children[0];
    const result = this.current.result || terminal.result;
    if (result) head += "RE[" + esc(result) + "]";
    if (this.event) head += "EV[" + esc(this.event) + "]";
    if (root.comment) head += "C[" + esc(root.comment) + "]";
    const ab = [];
    const aw = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const v = root.board.get([x, y]);
        if (v === BLACK) ab.push(sgfCoord(x, y));
        else if (v === WHITE) aw.push(sgfCoord(x, y));
      }
    }
    if (ab.length) head += "AB[" + ab.join("][") + "]";
    if (aw.length) head += "AW[" + aw.join("][") + "]";
    // Who moves first from a set-up position (handicap or problem).
    if (ab.length || aw.length) head += "PL[" + (root.turn === WHITE ? "W" : "B") + "]";
    head += marksText(root.marks, sgfCoord, esc) + extraText(root.extra, esc);
    head += "\n";
    const nodeText = (n) => {
      if (!n.move) return "";
      const c = n.move.color === BLACK ? "B" : "W";
      const v = n.move.pass ? "" : sgfCoord(n.move.x, n.move.y);
      let s = ";" + c + "[" + v + "]";
      if (n.comment) s += "C[" + esc(n.comment) + "]";
      s += marksText(n.marks, sgfCoord, esc) + extraText(n.extra, esc);
      return s;
    };
    const walk = (n) => {
      let s = nodeText(n);
      if (n.children.length === 0) return s;
      if (n.children.length === 1) return s + walk(n.children[0]);
      for (const child of n.children) s += "(" + walk(child) + ")";
      return s;
    };
    let body = walk(root);
    // A root with no moves is still a valid SGF.
    if (!body) body = ";";
    return head + body + ")\n";
  }
}

/* ------------------------------------------------------ v5: markup */

/** Board marks a node can carry, as stored in node.marks[].type. */
export const MARK_KINDS = ["triangle", "square", "circle", "cross", "label"];
/** SGF property for each mark kind. */
export const MARK_PROPS = { triangle: "TR", square: "SQ", circle: "CR", cross: "MA", label: "LB" };

function nextLabel(marks) {
  const used = new Set(marks.filter((m) => m.type === "label").map((m) => m.text));
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!used.has(ch)) return ch;
  for (let i = 1; ; i++) if (!used.has(String(i))) return String(i);
}

function marksText(marks, sgfCoord, esc) {
  if (!marks?.length) return "";
  let s = "";
  for (const kind of MARK_KINDS) {
    const list = marks.filter((m) => m.type === kind);
    if (!list.length) continue;
    const vals = list.map((m) => sgfCoord(m.x, m.y) + (kind === "label" ? ":" + esc(m.text ?? "") : ""));
    s += MARK_PROPS[kind] + "[" + vals.join("][") + "]";
  }
  return s;
}

function extraText(extra, esc) {
  if (!extra) return "";
  let s = "";
  for (const [key, values] of Object.entries(extra)) {
    if (!/^[A-Z]+$/.test(key) || !Array.isArray(values)) continue;
    s += key + (values.length ? values.map((v) => "[" + esc(v) + "]").join("") : "[]");
  }
  return s;
}

/**
 * v5: layout of the whole game tree for a variation mini-map.
 *
 *   x  depth (0 = root, so a move's x is its move number in its line)
 *   y  row (0 = main line); each variation takes the first row below its
 *      parent's row that is free along its whole length, with one empty
 *      cell before and after it (so two lines in a row never look joined).
 *
 * Branches hanging off later moves are placed first, so a branch from an
 * earlier move goes below them and no edge runs through a node. Edges from
 * one parent may share its column (a trunk). Returns
 *   { nodes: [{ x, y, id, node, isMain, onPath, isCurrent, hasComment,
 *               hasMarks, color, pass }],
 *     edges: [{ from: {x, y}, to: {x, y}, points: [[x, y], …], isMain }],
 *     width, height, current: {x, y} | null }
 * `points` is the polyline to draw: one step along a row, or down the
 * parent's column to the row above the child and then one diagonal step.
 */
export function treeLayout(game) {
  const root = game.root;
  const onPath = new Set();
  for (let c = game.current; c; c = c.parent) onPath.add(c);
  // occupied[row] = Map x → owner: "node", or the parent whose edge runs there.
  const occupied = [];
  const ownerAt = (row, x) => occupied[row]?.get(x);
  const isFree = (row, x) => ownerAt(row, x) === undefined;
  const take = (row, x, owner = "node") => (occupied[row] ||= new Map()).set(x, owner);
  const nodes = [];
  const edges = [];
  const pos = new Map();
  let width = 0;
  let height = 0;

  const chainLength = (n) => {
    let k = 0;
    for (let c = n; c; c = c.children[0]) k++;
    return k;
  };

  // Iterative over the first-child chain, recursive only per variation.
  const placeChain = (start, x0, row, main) => {
    const chain = [];
    let x = x0;
    for (let n = start; n; n = n.children[0], x++) {
      take(row, x);
      const item = {
        x,
        y: row,
        id: n.id,
        node: n,
        isMain: main,
        onPath: onPath.has(n),
        isCurrent: n === game.current,
        hasComment: !!n.comment,
        hasMarks: !!n.marks?.length,
        color: n.move ? n.move.color : 0,
        pass: !!n.move?.pass,
      };
      nodes.push(item);
      pos.set(n, item);
      if (n !== start) edges.push({ from: { x: x - 1, y: row }, to: { x, y: row }, points: [[x - 1, row], [x, row]], isMain: main });
      chain.push(n);
      width = Math.max(width, x + 1);
      height = Math.max(height, row + 1);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const px = x0 + i;
      for (const child of chain[i].children.slice(1)) {
        const len = chainLength(child);
        let r = row + 1;
        for (;;) {
          let ok = true;
          for (let k = 0; k <= len + 1 && ok; k++) if (!isFree(r, px + k)) ok = false;
          for (let q = row + 1; q < r && ok; q++) if (!isFree(q, px) && ownerAt(q, px) !== chain[i]) ok = false;
          if (ok) break;
          r++;
        }
        for (let q = row + 1; q < r; q++) take(q, px, chain[i]); // the edge's vertical run
        const points = [[px, row]];
        if (r > row + 1) points.push([px, r - 1]);
        points.push([px + 1, r]);
        edges.push({ from: { x: px, y: row }, to: { x: px + 1, y: r }, points, isMain: false });
        placeChain(child, px + 1, r, false);
      }
    }
  };

  placeChain(root, 0, 0, true);
  const cur = pos.get(game.current);
  return { nodes, edges, width, height, current: cur ? { x: cur.x, y: cur.y } : null };
}

export function formatPoints(v) {
  const n = Math.round(v * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
