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
 *
 * Three rulesets, chosen per game (`Game.rules`). See RULESETS below
 * for what each one means here and how it differs from the official text.
 */
import GoBoard from "@sabaki/go-board";
import { APP_VERSION } from "./version.js";

/* -------------------------------------------------------------- rulesets
 *
 * Rules. A game is played under one of three rulesets:
 *
 *   japanese  Territory scoring (Nihon Ki-in 1989 rules): empty points
 *             surrounded by one colour's living stones, plus prisoners
 *             (stones captured during play and dead stones removed at the
 *             end), plus komi for White. Points inside a seki are not
 *             territory. Komi 6.5. The default for everyone.
 *   chinese   Area scoring (Chinese Weiqi Association rules, 数子): living
 *             stones on the board plus the empty points they surround.
 *             Prisoners do not count. The eye of a group in seki counts
 *             for its owner; shared liberties in seki count for neither.
 *             Komi 7.5 (3¾ stones).
 *   korean    Territory scoring as under Japanese rules, komi 6.5. The
 *             Korea Baduk Association rules count the same way (no
 *             territory in seki either); what they do differently is
 *             procedure (how life and death is settled in a dispute, some
 *             repetition and dame-filling details) that a game here never
 *             reaches. So here, and for KataGo (whose "korean" preset is
 *             its "japanese" one), Korean scoring IS Japanese scoring. The
 *             ruleset exists so a Korean record keeps RU[Korean] and a
 *             player can choose the name they know.
 *
 * Dame (neutral points) count for nobody under every ruleset. Under area
 * scoring that equals the Chinese rule that splits unfilled dame equally:
 * comparing Black's area with White's area (rather than Black's area with
 * half the board) is unchanged by points both sides share.
 *
 * Handicap. Every ruleset uses komi 0.5 in a handicap game. Chinese rules
 * also make Black give back half a stone per handicap stone at the count
 * (黑方贴还让子数的一半). In points, one stone of area is a two-point
 * swing, so White receives N points for N handicap stones: that is the
 * convention implemented here (`handicapCompensation`), and the one KataGo
 * applies for `kata-set-rules chinese` (whiteHandicapBonus = N, from the
 * black stones placed before White's first move). A single stone is not a
 * handicap game, so N < 2 gives nothing. The compensation is added at the
 * count and never folded into the komi: KataGo adds it itself, so the komi
 * it is sent stays the game's komi and the two agree.
 *
 * Ko. The app forbids any move that repeats an earlier whole-board position
 * (positional superko) under every ruleset. KataGo is told the ruleset's
 * own preset (simple ko with its own long-cycle handling). The app's rule
 * is the stricter one, and a KataGo choice that would repeat a position is
 * never played (engine.js falls back to a legal candidate). The Japanese
 * "no result" for triple ko is not modelled.
 */
export const DEFAULT_RULES = "japanese";

/**
 * The rulesets a game can use, in the order the New game sheet lists them.
 *   id            Game.rules and the `defaultRules` setting
 *   sgf           the RU value written on export
 *   katago        the argument of `kata-set-rules`
 *   method        "territory" | "area"
 *   komi          default komi for an even game
 *   handicapKomi  default komi when handicap stones are given
 *   compensation  "none" | "n": White receives N points for N stones
 *   labelKey      i18n key of the ruleset's name
 *   noteKey       i18n key of a one-line description (scoring and komi)
 */
export const RULESETS = Object.freeze([
  Object.freeze({ id: "japanese", sgf: "Japanese", katago: "japanese", method: "territory", komi: 6.5, handicapKomi: 0.5, compensation: "none", labelKey: "rules.japanese", noteKey: "rules.japaneseNote" }),
  Object.freeze({ id: "chinese", sgf: "Chinese", katago: "chinese", method: "area", komi: 7.5, handicapKomi: 0.5, compensation: "n", labelKey: "rules.chinese", noteKey: "rules.chineseNote" }),
  Object.freeze({ id: "korean", sgf: "Korean", katago: "korean", method: "territory", komi: 6.5, handicapKomi: 0.5, compensation: "none", labelKey: "rules.korean", noteKey: "rules.koreanNote" }),
]);

/** A known ruleset id, or the default for anything else (null, old data). */
export function normalizeRules(id) {
  const v = String(id || "").toLowerCase();
  return RULESETS.some((r) => r.id === v) ? v : DEFAULT_RULES;
}

export function rulesetById(id) {
  const v = normalizeRules(id);
  return RULESETS.find((r) => r.id === v);
}

/**
 * The komi a new game gets under `rules` with `handicap` stones. A handicap
 * of one is no stone at all: Black simply plays first without komi, so it
 * takes the handicap komi too (the New game sheet has always sent 0.5).
 */
export function defaultKomi(rules, handicap = 0) {
  const r = rulesetById(rules);
  return Number(handicap) >= 1 ? r.handicapKomi : r.komi;
}

/** Points White receives at the count for `handicap` stones under `rules`. */
export function handicapCompensation(rules, handicap = 0) {
  const n = Math.max(0, Math.min(9, Math.floor(Number(handicap) || 0)));
  return rulesetById(rules).compensation === "n" && n >= 2 ? n : 0;
}

/**
 * The ruleset an SGF RU value names: "japanese" | "chinese" | "korean", or
 * null when the app cannot score the record faithfully. No RU at all means
 * Japanese (older records have none or RU[Japanese]).
 *
 *   Japanese  Japanese, JP, JA, JPN, Nihon, uchikomi, 日本, 日本ルール, 日本规则
 *   Chinese   Chinese, CN, ZH, CHN, China, 中国, 中国规则, 中國規則
 *   Korean    Korean, KR, KO, KOR, Korea, 한국, 한국 규칙, 韓国, 韩国规则
 * (case-insensitive; "uchikomi" has always been read as Japanese).
 *
 * Rejected on purpose, because no preset scores them the same way and
 * mapping them would change the record's result:
 *   AGA / BGA / French  area scoring, but White receives N-1 (not N) for N
 *                       handicap stones and a pass hands over a stone.
 *                       As Chinese, a handicap game would be off by a point.
 *   NZ, Tromp-Taylor    area scoring with multi-stone suicide allowed.
 *   Ing / GOE           Ing counting with its own ko rules and komi.
 * Mixed forms ("Chinese/Japanese", "AGA (Japanese)") are rejected too: the
 * record does not say which one decided the result.
 */
export function rulesFromSgf(text) {
  const v = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return DEFAULT_RULES;
  if (/^(japanese|jp|ja|jpn|nihon|uchikomi|japanese rules|日本|日本ルール|日本规则|日本規則)$/.test(v)) return "japanese";
  if (/^(chinese|cn|zh|chn|china|chinese rules|中国|中国规则|中國|中國規則)$/.test(v)) return "chinese";
  if (/^(korean|kr|ko|kor|korea|korean rules|한국|한국 규칙|한국규칙|韓国|韓国ルール|韩国|韩国规则)$/.test(v)) return "korean";
  return null;
}

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

/*
 * Zobrist hashing for the superko check. Each node caches the hash of its
 * board (computed on first use), so checking a move against its ancestors
 * compares short strings instead of building a string of the whole board
 * per ancestor. Two 32-bit halves make an accidental match unlikely; a match
 * is still confirmed against the boards themselves.
 */
const ZOBRIST = new Map();

function zobristTable(size) {
  let table = ZOBRIST.get(size);
  if (!table) {
    // A fixed xorshift seed: the same table on every run.
    let seed = (0x9e3779b9 ^ size) | 0;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    table = new Uint32Array(size * size * 4);
    for (let i = 0; i < table.length; i++) table[i] = next();
    ZOBRIST.set(size, table);
  }
  return table;
}

/** The board's Zobrist hash, as a string of two 32-bit halves. */
export function boardHash(board) {
  const size = board.width;
  const table = zobristTable(size);
  const map = board.signMap;
  let lo = 0;
  let hi = 0;
  for (let y = 0; y < size; y++) {
    const row = map[y];
    for (let x = 0; x < size; x++) {
      const v = row[x];
      if (!v) continue;
      const i = ((y * size + x) * 2 + (v === BLACK ? 0 : 1)) * 2;
      lo ^= table[i];
      hi ^= table[i + 1];
    }
  }
  return (lo >>> 0).toString(36) + ":" + (hi >>> 0).toString(36);
}

function sameBoard(a, b) {
  const size = a.width;
  for (let y = 0; y < size; y++) {
    const ra = a.signMap[y];
    const rb = b.signMap[y];
    for (let x = 0; x < size; x++) if (ra[x] !== rb[x]) return false;
  }
  return true;
}

function nodeHash(node) {
  // Cached with the board it was computed from: a board replaced on the
  // node (Game.setup, an SGF root setup) gets a fresh hash.
  if (node._hashBoard !== node.board) {
    Object.defineProperty(node, "_hash", { value: boardHash(node.board), writable: true, configurable: true, enumerable: false });
    Object.defineProperty(node, "_hashBoard", { value: node.board, writable: true, configurable: true, enumerable: false });
  }
  return node._hash;
}

/**
 * Stones a record sets up in the middle of a game (SGF AB / AW / AE),
 * applied to a copy of `board`: { black: [{x, y}], white: [...], empty: [...] }.
 * AE first, then AB, then AW.
 */
export function applySetup(board, setup) {
  const out = board.clone();
  if (!setup) return out;
  for (const p of setup.empty || []) out.set([p.x, p.y], EMPTY);
  for (const p of setup.black || []) out.set([p.x, p.y], BLACK);
  for (const p of setup.white || []) out.set([p.x, p.y], WHITE);
  return out;
}

/**
 * The position an engine is given for `node`: the board where stones were
 * last set up on its line (the root, or the board a mid-game AB / AW / AE
 * produced, before that node's own move) and the moves played since.
 * { board, moves: [move], fromRoot }. An engine has no "set up" step in the
 * middle of a game, so the setup becomes its starting position (prisoners
 * taken before it are not part of what the engine sees).
 */
export function positionBase(node) {
  const moves = [];
  for (let n = node; n; n = n.parent) {
    if (!n.parent) return { board: n.board, moves: moves.reverse(), fromRoot: true };
    if (n.move) moves.push(n.move);
    if (n.setup) return { board: applySetup(n.parent.board, n.setup), moves: moves.reverse(), fromRoot: false };
  }
  return { board: null, moves: [], fromRoot: true };
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

/**
 * Empty points surrounded by one colour: a sign map with BLACK / WHITE on
 * each such point and EMPTY elsewhere (dame, stones).
 *
 * `exclude` (optional) is a Set of stone keys (y * size + x): a region that
 * touches any of them is left out. Territory scoring passes the stones in
 * seki, so a seki eye is not territory; area scoring passes nothing.
 *
 * `conceded` (optional) is a Set of colours that have played but have no
 * living stone left (see "open regions" below); score() works it out.
 *
 * Call it on a finished board: score() removes the dead stones first, so
 * every stone left is alive (see "open regions" below).
 */
export function territoryMap(board, { exclude = null, conceded = null } = {}) {
  const size = board.width;
  const out = emptySignMap(size);
  const seen = new Set();
  // The colours with stones on the board (see "open regions").
  const present = new Set();
  for (let y = 0; y < size && present.size < 2; y++) {
    for (let x = 0; x < size; x++) {
      const v = board.get([x, y]);
      if (v !== EMPTY) present.add(v);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board.get([x, y]) !== EMPTY || seen.has(y * size + x)) continue;
      const region = [];
      const border = new Set();
      const edges = new Set();
      let touchesExcluded = false;
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
          const key = ny * size + nx;
          if (v === EMPTY) {
            if (!seen.has(key)) {
              seen.add(key);
              stack.push([nx, ny]);
            }
          } else {
            border.add(v);
            if (exclude && exclude.has(key)) touchesExcluded = true;
          }
        }
      }
      // Territory (or the empty part of area) is an empty region bounded by
      // stones of one colour.
      //
      // Open regions. A region that reaches all four sides of the board is
      // either the whole open board around one side's stones (a lone centre
      // stone, a wall with gaps, both players passing after a few moves) or
      // the outside of a wall that has sealed the other side's living
      // stones in (White lives in a corner and Black owns everything else).
      // The two differ in whether the other colour has stones on the board
      // at all: if it has, they lie in a region of their own, so the wall
      // really divides the board and the region is territory; if it has
      // none, nothing has been divided and the region is dame (a lone stone
      // on an otherwise untouched board establishes nothing).
      //
      // One more case: the other colour did play, and none of its stones
      // lives. They were all captured, or all removed as dead at the count
      // (the engine marks dead stones by itself, so this happens without
      // the player doing anything). The board was contested and one side
      // lost every stone, so the open region belongs to the colour whose
      // living stones border it. score() names such colours in `conceded`;
      // a colour that never had a stone on the board is not in it, and a
      // colour with even one stone left unmarked is still `present`, in
      // which case the rule of the first paragraph decides.
      const color = border.size === 1 ? [...border][0] : 0;
      const rival = other(color);
      const open = edges.size === 4 && !present.has(rival) && !(conceded && conceded.has(rival));
      if (color && !open && !touchesExcluded) {
        for (const [rx, ry] of region) out[ry][rx] = color;
      }
    }
  }
  return out;
}

const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Seki on a finished board (dead stones already removed).
 *
 * A shared liberty of a seki is an empty point next to both colours where
 * neither side can play: for each colour, the stone would capture nothing
 * and leave its own chain with at most one liberty (self-atari, or
 * suicide). A group with two real eyes always keeps two liberties, so an
 * unfilled dame beside living groups is never mistaken for seki, and a
 * point where one side captures is a group in atari, not seki. Every chain
 * of either colour touching such a point is in seki.
 *
 * This is the usual practical test, not a proof: exotic seki (hanezeki,
 * seki without a shared liberty next to both colours) are not found, and
 * the player decides life and death by marking dead stones first.
 *
 * Returns { points: [{x, y}], stones: [{x, y, color}], keys: Set<y*size+x> }.
 */
export function findSeki(board) {
  const size = board.width;
  const points = [];
  const keys = new Set();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board.get([x, y]) !== EMPTY) continue;
      const near = new Set();
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const v = board.get([nx, ny]);
        if (v !== EMPTY) near.add(v);
      }
      if (near.size !== 2) continue;
      let blocked = true;
      for (const color of [BLACK, WHITE]) {
        const a = board.analyzeMove(color, [x, y]);
        if (a.capturing) {
          blocked = false;
          break;
        }
        if (a.suicide) continue;
        const next = board.makeMove(color, [x, y], { preventSuicide: false, preventOverwrite: true, preventKo: false });
        if (next.getLiberties([x, y]).length > 1) {
          blocked = false;
          break;
        }
      }
      if (!blocked) continue;
      points.push({ x, y });
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || board.get([nx, ny]) === EMPTY) continue;
        for (const [cx, cy] of board.getChain([nx, ny])) keys.add(cy * size + cx);
      }
    }
  }
  const stones = [...keys]
    .sort((a, b) => a - b)
    .map((k) => ({ x: k % size, y: Math.floor(k / size), color: board.get([k % size, Math.floor(k / size)]) }));
  return { points, stones, keys };
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
    rules = DEFAULT_RULES,
    komi = undefined,
    handicap = 0,
    date = new Date(),
    dateText = "",
    playerBlack = "Black",
    playerWhite = "White",
    event = "",
    placeHandicap = true,
  } = {}) {
    this.size = size;
    // "japanese" | "chinese" | "korean" (see RULESETS). Unknown values
    // fall back to Japanese, the default.
    this.rules = normalizeRules(rules);
    this.handicap = Math.max(0, Math.min(9, Math.floor(Number(handicap) || 0)));
    // Handicap stones: two or more, on the standard points. A handicap of one
    // places nothing (Black plays first, without komi). A board size with
    // fewer standard points than asked gets what it has, and one without
    // any is an even game. An SGF import passes placeHandicap: false, since
    // the record places its own stones (AB, or its first moves).
    const stones = placeHandicap && this.handicap >= 2 ? handicapPoints(size, this.handicap) : [];
    if (placeHandicap && this.handicap >= 2 && stones.length < this.handicap) this.handicap = stones.length >= 2 ? stones.length : 0;
    // Without an explicit komi, the ruleset's default for this handicap.
    this.komi = komi === undefined || komi === null || komi === "" ? defaultKomi(this.rules, this.handicap) : Number(komi);
    // A game played here is dated today. An imported record passes its own
    // date, or null when it states none (never today's): `dateText` is the
    // record's DT exactly as written ("1846", "1933-10-16,17"), and toSGF()
    // writes it back unchanged.
    this.date = date === null ? null : date instanceof Date ? date : new Date(date);
    this.dateText = String(dateText || "");
    this.playerBlack = playerBlack;
    this.playerWhite = playerWhite;
    this.event = event;
    this.warnings = [];

    const board = GoBoard.fromDimensions(size);
    for (const [x, y] of stones) board.set([x, y], BLACK);
    this.root = this._node({
      parent: null,
      move: null,
      board,
      captures: [0, 0],
      turn: stones.length ? WHITE : BLACK,
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
      // SGF properties this app does not interpret, kept for the round
      // trip ({ KEY: [raw values] }), or null.
      extra: fields.extra || null,
      // Stones the record set up just before this node's move (SGF
      // AB / AW / AE in the middle of a game; see applySetup), or null. The
      // board above already includes them.
      setup: fields.setup || null,
    };
  }

  _append(parent, fields) {
    const node = this._node({ ...fields, parent });
    parent.children.push(node);
    return node;
  }

  /**
   * Positional superko: has `board` occurred on the line up to `upto`? The
   * line ends where the record set stones up (a node with `setup`): the
   * positions before an edited board are not part of this game's history.
   */
  _positionSeen(board, upto) {
    const key = boardHash(board);
    for (let n = upto; n; n = n.parent) {
      if (nodeHash(n) === key && sameBoard(n.board, board)) return true;
      if (n.setup) break;
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

  /**
   * Play a stone. `setup` (SGF import only) is a mid-game AB / AW / AE
   * applied to the board just before the move; it is stored on the new node.
   */
  play(x, y, { color = null, force = false, setup = null } = {}) {
    if (!force && this.current.phase !== "playing") return { ok: false, reason: "phase" };
    const sign = color || this.current.turn;
    if (!force && sign !== this.current.turn) return { ok: false, reason: "turn" };
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return { ok: false, reason: "outside" };
    const board = setup ? applySetup(this.current.board, setup) : this.current.board;
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
      setup,
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

  pass({ color = null, force = false, setup = null } = {}) {
    if (!force && this.current.phase !== "playing") return { ok: false, reason: "phase" };
    const sign = color || this.current.turn;
    // A setup between two passes means the position changed: not game over.
    const passes = setup ? 1 : (this.current.passes || 0) + 1;
    const node = this._append(this.current, {
      move: { color: sign, x: null, y: null, pass: true },
      setup,
      board: setup ? applySetup(this.current.board, setup) : cloneBoard(this.current.board),
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

  /* ------------------------------------------------ Node editing */

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

  /** The game's ruleset entry (see RULESETS). */
  get ruleset() {
    return rulesetById(this.rules);
  }

  /** Points White receives at the count for the handicap (Chinese rules only). */
  get handicapCompensation() {
    return handicapCompensation(this.rules, this.handicap);
  }

  /**
   * The score under the game's rules, after removing `deadStones`.
   *
   *   territory (Japanese, Korean)
   *     Black = blackTerritory + blackPrisoners
   *     White = whiteTerritory + whitePrisoners + komi
   *     Prisoners are the stones captured during play plus the dead stones
   *     removed now. Seki eyes are not territory.
   *   area (Chinese)
   *     Black = blackStones + blackTerritory
   *     White = whiteStones + whiteTerritory + komi + handicapCompensation
   *     Stones are the living stones left on the board; seki stones and
   *     seki eyes count, shared seki liberties and dame count for nobody.
   *
   * Every field the score card needs is here; fields that are not part of
   * the method are null (stones under territory, prisoners under area).
   * `captures` (stones taken during play) is always reported.
   */
  score(deadStones = []) {
    const ruleset = this.ruleset;
    const method = ruleset.method;
    const board = this.current.board.clone();
    const dead = [];
    for (const d of deadStones) {
      const v = board.get([d.x, d.y]);
      if (v !== EMPTY) {
        dead.push({ x: d.x, y: d.y, color: v });
        board.set([d.x, d.y], EMPTY);
      }
    }
    const seki = findSeki(board);
    // Territory scoring gives no points inside a seki; area scoring counts
    // a seki group's own eye as part of its area.
    const captures = {
      black: this.current.board.getCaptures(BLACK) || 0,
      white: this.current.board.getCaptures(WHITE) || 0,
    };
    // A colour that lost stones (captured during play or removed as dead
    // now) and has none left on the finished board has conceded the open
    // board to the other side: see "open regions" in territoryMap().
    const conceded = new Set();
    for (const [color, lostInPlay] of [[BLACK, captures.white], [WHITE, captures.black]]) {
      if (!lostInPlay && !dead.some((d) => d.color === color)) continue;
      let alive = false;
      for (let y = 0; y < this.size && !alive; y++) {
        for (let x = 0; x < this.size; x++) {
          if (board.get([x, y]) === color) {
            alive = true;
            break;
          }
        }
      }
      if (!alive) conceded.add(color);
    }
    const territory = territoryMap(board, { exclude: method === "territory" ? seki.keys : null, conceded });
    let blackTerritory = 0;
    let whiteTerritory = 0;
    let blackStones = 0;
    let whiteStones = 0;
    let neutral = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const v = board.get([x, y]);
        if (v === BLACK) blackStones++;
        else if (v === WHITE) whiteStones++;
        else if (territory[y][x] === BLACK) blackTerritory++;
        else if (territory[y][x] === WHITE) whiteTerritory++;
        else neutral++;
      }
    }
    let blackPrisoners = captures.black;
    let whitePrisoners = captures.white;
    for (const d of dead) {
      if (d.color === BLACK) whitePrisoners++;
      else blackPrisoners++;
    }
    const komi = this.komi;
    const compensation = method === "area" ? this.handicapCompensation : 0;
    let black;
    let white;
    if (method === "area") {
      black = blackStones + blackTerritory;
      white = whiteStones + whiteTerritory + komi + compensation;
    } else {
      black = blackTerritory + blackPrisoners;
      white = whiteTerritory + whitePrisoners + komi;
    }
    const diff = black - white;
    const result = diff > 0 ? "B+" + formatPoints(diff) : diff < 0 ? "W+" + formatPoints(-diff) : "Draw";
    return {
      rules: this.rules,
      method,
      black,
      white,
      diff,
      result,
      komi,
      handicap: this.handicap,
      handicapCompensation: compensation,
      blackTerritory,
      whiteTerritory,
      blackStones: method === "area" ? blackStones : null,
      whiteStones: method === "area" ? whiteStones : null,
      blackPrisoners: method === "territory" ? blackPrisoners : null,
      whitePrisoners: method === "territory" ? whitePrisoners : null,
      captures,
      neutral, // empty points counted for nobody (dame, seki liberties; seki eyes under territory)
      seki: seki.stones,
      sekiPoints: seki.points,
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
    const pad = (n) => String(n).padStart(2, "0");
    // DT: the record's own text when it has one, else the day the game was
    // played here; a record without a date stays without one.
    let date = this.dateText;
    if (!date && this.date !== null && this.date !== undefined) {
      const dt = this.date instanceof Date ? this.date : new Date(this.date);
      if (!Number.isNaN(dt.getTime())) date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    }
    const rules = this.ruleset.sgf;
    // SGF columns run a, b, c … with the i included (FF[4]); only board
    // labels skip I. (Records written with the i skipped too are still read; see sgf.js.)
    const sgfColumn = (x) => String.fromCharCode(97 + x);
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
      "]";
    if (date) head += "DT[" + esc(date) + "]";
    // RE is the result of the game, which is the end of the main line
    // wherever the cursor is (a side variation must not lose it). A result
    // reached only on the cursor's own line (a resignation in a variation
    // being explored) is the fallback.
    let terminal = root;
    while (terminal.children.length) terminal = terminal.children[0];
    let ahead = this.current;
    while (ahead.children.length) ahead = ahead.children[0];
    const result = terminal.result || this.current.result || ahead.result;
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
    const points = (list) => (list || []).map((p) => sgfCoord(p.x, p.y));
    const nodeText = (n) => {
      if (!n.move) return "";
      let s = "";
      // A mid-game setup is a move-less node of its own before the move.
      if (n.setup) {
        let props = "";
        for (const [key, list] of [["AE", n.setup.empty], ["AB", n.setup.black], ["AW", n.setup.white]]) {
          const vals = points(list);
          if (vals.length) props += key + "[" + vals.join("][") + "]";
        }
        if (props) s += ";" + props;
      }
      const c = n.move.color === BLACK ? "B" : "W";
      const v = n.move.pass ? "" : sgfCoord(n.move.x, n.move.y);
      s += ";" + c + "[" + v + "]";
      if (n.comment) s += "C[" + esc(n.comment) + "]";
      s += marksText(n.marks, sgfCoord, esc) + extraText(n.extra, esc);
      return s;
    };
    // Iterative, so a record of any length or depth cannot overflow the
    // stack. A string on the stack is a parenthesis to write.
    const parts = [];
    const stack = [root];
    while (stack.length) {
      const item = stack.pop();
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      parts.push(nodeText(item));
      const kids = item.children;
      if (kids.length === 1) stack.push(kids[0]);
      else for (let i = kids.length - 1; i >= 0; i--) stack.push(")", kids[i], "(");
    }
    let body = parts.join("");
    // A root with no moves is still a valid SGF.
    if (!body) body = ";";
    return head + body + ")\n";
  }
}

/* ------------------------------------------------------ Markup */

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
 * Layout of the whole game tree for a variation mini-map.
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

  // Places the first-child chain from `start` and returns a frame for its
  // variations (an explicit stack of frames, so a record nested
  // thousands of variations deep cannot overflow the call stack).
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
    // i: the chain index whose variations come next (last first), j: the next one of them.
    return { chain, x0, row, i: chain.length - 1, j: 1 };
  };

  const frames = [placeChain(root, 0, 0, true)];
  while (frames.length) {
    const f = frames[frames.length - 1];
    if (f.i < 0) {
      frames.pop();
      continue;
    }
    const parent = f.chain[f.i];
    if (f.j >= parent.children.length) {
      f.i--;
      f.j = 1;
      continue;
    }
    const child = parent.children[f.j++];
    const { row } = f;
    const px = f.x0 + f.i;
    const len = chainLength(child);
    let r = row + 1;
    for (;;) {
      let ok = true;
      for (let k = 0; k <= len + 1 && ok; k++) if (!isFree(r, px + k)) ok = false;
      for (let q = row + 1; q < r && ok; q++) if (!isFree(q, px) && ownerAt(q, px) !== parent) ok = false;
      if (ok) break;
      r++;
    }
    for (let q = row + 1; q < r; q++) take(q, px, parent); // the edge's vertical run
    const points = [[px, row]];
    if (r > row + 1) points.push([px, r - 1]);
    points.push([px + 1, r]);
    edges.push({ from: { x: px, y: row }, to: { x: px + 1, y: r }, points, isMain: false });
    frames.push(placeChain(child, px + 1, r, false));
  }
  const cur = pos.get(game.current);
  return { nodes, edges, width, height, current: cur ? { x: cur.x, y: cur.y } : null };
}

export function formatPoints(v) {
  const n = Math.round(v * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
