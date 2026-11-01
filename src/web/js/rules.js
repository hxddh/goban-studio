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

export const BLACK = 1;
export const WHITE = -1;
export const EMPTY = 0;
export const LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

export const RULESETS = ["chinese", "japanese"];

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
      const boundaryStones = new Set();
      const stack = [[x, y]];
      seen.add(y * size + x);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        region.push([cx, cy]);
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
            boundaryStones.add(ny * size + nx);
          }
        }
      }
      // A region "bordered by one colour" is not automatically territory: a
      // single stone on an otherwise empty board would claim the whole board.
      // Require either a small closed region or a real wall of stones. This is
      // still a scoring heuristic, but it behaves like a finished game instead
      // of a diagram.
      const enclosed = boundaryStones.size >= 3 || region.length <= 2;
      const notSparse = region.length <= size * size * 0.55 || boundaryStones.size >= 8;
      if (border.size === 1 && enclosed && notSparse) {
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
    rules = "chinese",
    komi = size === 19 ? 7.5 : 6.5,
    handicap = 0,
    date = new Date(),
    playerBlack = "Black",
    playerWhite = "White",
    event = "",
  } = {}) {
    this.size = size;
    this.rules = RULESETS.includes(rules) ? rules : "chinese";
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

  setResult(result) {
    this.current.result = result || null;
    if (result) this.current.phase = "ended";
  }

  /** Chinese area or Japanese territory score, after removing dead stones. */
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
    let blackStones = 0;
    let whiteStones = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const v = board.get([x, y]);
        if (v === BLACK) blackStones++;
        else if (v === WHITE) whiteStones++;
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
    let black;
    let white;
    if (this.rules === "japanese") {
      let blackPrisoners = this.current.board.getCaptures(BLACK) || 0;
      let whitePrisoners = this.current.board.getCaptures(WHITE) || 0;
      for (const d of dead) {
        if (d.color === BLACK) whitePrisoners++;
        else blackPrisoners++;
      }
      black = blackTerritory + blackPrisoners;
      white = whiteTerritory + whitePrisoners + this.komi;
    } else {
      black = blackStones + blackTerritory;
      white = whiteStones + whiteTerritory + this.komi;
    }
    const diff = black - white;
    const result = diff > 0 ? "B+" + formatPoints(diff) : diff < 0 ? "W+" + formatPoints(-diff) : "Draw";
    return {
      black,
      white,
      diff,
      result,
      blackStones,
      whiteStones,
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
    const rules = this.rules === "japanese" ? "Japanese" : "Chinese";
    const sgfCoord = (x, y) => String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
    let head =
      "(;GM[1]FF[4]CA[UTF-8]AP[Goban Studio:1.0.0]SZ[" +
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
    head += "\n";
    const nodeText = (n) => {
      if (!n.move) return "";
      const c = n.move.color === BLACK ? "B" : "W";
      const v = n.move.pass ? "" : sgfCoord(n.move.x, n.move.y);
      let s = ";" + c + "[" + v + "]";
      if (n.comment) s += "C[" + esc(n.comment) + "]";
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

export function formatPoints(v) {
  const n = Math.round(v * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
