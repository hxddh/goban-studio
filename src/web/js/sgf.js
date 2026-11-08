/**
 * SGF FF[4] import for Go.
 *
 * A deliberately small parser: a collection of game trees, nodes, properties
 * with multiple values, escapes, and compressed point lists. It is enough for
 * ordinary Go SGF (and for the variations this app exports) without pulling a
 * Node-only parser into the WebView bundle.
 *
 * Export lives on Game.toSGF(); this module only reads.
 *
 * v5: comments (C) and markup (TR, SQ, CR, MA, LB) are read on every node,
 * and properties the app does not interpret are kept on node.extra (root
 * and moves) so that toSGF() writes them back.
 *
 * v13: real-world records.
 *   - Bytes are decoded by the record's own CA charset (decodeSgfBytes).
 *   - Setup (AB / AW / AE) in move-less nodes right after the root belongs
 *     to the starting position; setup later in the game is applied before
 *     the next move (node.setup in rules.js) and written back on export.
 *   - A board size the app cannot play is an error, not a 19×19 board.
 *   - Only an empty value (or `tt` on boards up to 19×19) is a pass; any
 *     other point that is not on the board is a warning.
 *   - HA without AB places no stones: the record places them itself.
 *   - Parsing and building the game use explicit stacks, so a record of any
 *     length or depth loads in linear time without overflowing the stack.
 *
 * Warnings are user-facing strings in the current language (i18n.js).
 */
import { BLACK, WHITE, EMPTY, Game, defaultKomi, rulesFromSgf, emptySignMap } from "./rules.js";
import { t } from "./i18n.js";

/** Board sizes the app (its board, its engines and its content) can play. */
export const SGF_SIZES = Object.freeze([9, 13, 19]);

let nodeSeq = 1;

/* ------------------------------------------------------------ charsets */

// CA values seen in the wild, by the TextDecoder label that reads them.
// GB2312 and GBK are subsets of GB18030, so all three use the superset.
const CHARSETS = [
  [/^utf-?8$/, "utf-8"],
  [/^(gb2312|gbk|gb18030|cp936|ms936|windows-936|euc-cn|x-gbk|gb-2312|csgb2312|chinese)$/, "gb18030"],
  [/^(big5|big5-hkscs|cp950|x-x-big5|csbig5)$/, "big5"],
  [/^(shift[-_ ]?jis|sjis|s-jis|x-sjis|ms932|cp932|windows-31j|ms_kanji|csshiftjis)$/, "shift_jis"],
  [/^(euc-?jp|x-euc-jp)$/, "euc-jp"],
  [/^(euc-?kr|cp949|uhc|ks_c_5601-1987|ks_c_5601|ksc5601|windows-949|korean|cseuckr)$/, "euc-kr"],
  [/^(iso-?8859-1|iso_8859-1|latin-?1|l1|cp1252|windows-1252|us-ascii|ascii)$/, "windows-1252"],
];

/** The TextDecoder label for an SGF CA value, or null when unknown. */
export function sgfCharset(name) {
  const v = String(name || "").trim().toLowerCase();
  for (const [re, label] of CHARSETS) if (re.test(v)) return label;
  return null;
}

function decodeWith(label, bytes, fatal) {
  return new TextDecoder(label, { fatal }).decode(bytes);
}

/**
 * The text of an SGF file from its raw bytes (a Uint8Array or ArrayBuffer).
 *
 * A byte-order mark wins. Bytes that are valid UTF-8 are read as UTF-8,
 * whatever CA says: text in a legacy CJK charset is practically never valid
 * UTF-8, while editors that re-save a record as UTF-8 often keep its old CA.
 * Otherwise the CA property names the charset (GB2312 / GBK / GB18030,
 * Big5, Shift_JIS, EUC-JP, EUC-KR, ISO-8859-1 …); its value is plain ASCII
 * in all of them, so it is read from a Latin-1 view of the file's head.
 * Without a known CA the FF[4] default, ISO-8859-1, applies.
 */
export function decodeSgfBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return decodeWith("utf-8", bytes.subarray(3), false);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decodeWith("utf-16le", bytes.subarray(2), false);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decodeWith("utf-16be", bytes.subarray(2), false);
  try {
    return decodeWith("utf-8", bytes, true);
  } catch (_) {
    // Not UTF-8: the record's own charset.
  }
  const head = decodeWith("windows-1252", bytes.subarray(0, 65536), false);
  const ca = /(?:^|[^A-Za-z])CA\s*\[([^\]]*)\]/.exec(head);
  const label = (ca && sgfCharset(ca[1])) || "windows-1252";
  // A record that says UTF-8 but is not keeps what can be read of it.
  return decodeWith(label, bytes, false);
}

/* -------------------------------------------------------------- parser */

/**
 * The collection's game trees: [{ id, data: { KEY: [values] }, parent,
 * children }]. One pass over the text with an explicit stack of open
 * parentheses, so nesting depth costs no call stack.
 */
function parseTree(text) {
  let i = 0;
  const n = text.length;
  const isSpace = (c) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\v";
  const isLetter = (c) => (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");

  function parseValue() {
    i++; // "["
    let out = "";
    let start = i;
    while (i < n && text[i] !== "]") {
      if (text[i] === "\\") {
        out += text.slice(start, i);
        i++;
        if (i >= n) break;
        if (text[i] === "\r") {
          i++;
          if (text[i] === "\n") i++;
        } else if (text[i] === "\n") {
          i++;
        } else {
          out += text[i];
          i++;
        }
        start = i;
      } else {
        i++;
      }
    }
    out += text.slice(start, Math.min(i, n));
    if (text[i] === "]") i++;
    return out;
  }

  /** Properties up to the next ";", "(" or ")", into `data`. */
  function parseProps(data, replace) {
    while (i < n && text[i] !== ";" && text[i] !== ")" && text[i] !== "(") {
      if (!isLetter(text[i])) {
        i++;
        continue;
      }
      const start = i;
      while (i < n && isLetter(text[i])) i++;
      const key = text.slice(start, i);
      const values = [];
      while (i < n && isSpace(text[i])) i++;
      while (i < n && text[i] === "[") {
        values.push(parseValue());
        while (i < n && isSpace(text[i])) i++;
      }
      if (replace) data[key] = values;
      else (data[key] ||= []).push(...values);
    }
  }

  const roots = [];
  const stack = []; // open game trees: { parent, anchor, current }
  const close = () => {
    const f = stack.pop();
    if (!f.anchor) return;
    f.anchor.parent = f.parent;
    const up = stack[stack.length - 1];
    if (!up) roots.push(f.anchor);
    else if (up.current) up.current.children.push(f.anchor);
    else if (!up.anchor) up.anchor = up.current = f.anchor;
  };
  // Anything before the first "(" (a mail header, a stray BOM) is skipped.
  while (i < n && text[i] !== "(") i++;
  while (i < n) {
    const c = text[i];
    if (!stack.length) {
      if (c === "(") {
        stack.push({ parent: null, anchor: null, current: null });
        i++;
      } else if (isSpace(c)) i++;
      else break;
      continue;
    }
    const f = stack[stack.length - 1];
    if (isSpace(c)) {
      i++;
    } else if (c === ")") {
      i++;
      close();
    } else if (c === "(") {
      i++;
      stack.push({ parent: f.current, anchor: null, current: null });
    } else if (c === ";") {
      i++;
      const node = { id: nodeSeq++, data: {}, parent: f.current, children: [] };
      parseProps(node.data, false);
      if (!f.anchor) f.anchor = node;
      if (f.current) f.current.children.push(node);
      f.current = node;
    } else if (isLetter(c)) {
      // Stray property before a node: attach it to the anchor.
      if (!f.anchor) f.anchor = f.current = { id: nodeSeq++, data: {}, parent: f.parent, children: [] };
      parseProps(f.anchor.data, true);
    } else {
      i++;
    }
  }
  // An unterminated record keeps what was read.
  while (stack.length) close();
  return roots;
}

/* -------------------------------------------------------------- values */

function first(data, key) {
  const v = data?.[key];
  return Array.isArray(v) && v.length ? String(v[0]) : "";
}

/** SZ as a supported size; anything else throws (code "unsupported-size"). */
function parseSize(raw) {
  const text = String(raw || "").trim();
  if (!text) return 19;
  const [a, b] = text.split(":").map((s) => s.trim());
  const w = /^\d+$/.test(a) ? Number(a) : NaN;
  const h = b === undefined ? w : /^\d+$/.test(b) ? Number(b) : NaN;
  if (w === h && SGF_SIZES.includes(w)) return w;
  const error = new Error(`Unsupported board size in SGF: ${text}`);
  error.code = "unsupported-size";
  error.size = text.slice(0, 12);
  throw error;
}

/**
 * SGF columns are a, b, c … in order, the letter i included (FF[4]); only
 * the board's labels skip I. A point is exactly two lowercase letters on the
 * board; anything else is null.
 */
function sgfVertex(raw, size) {
  const s = String(raw ?? "");
  if (s.length !== 2) return null;
  const x = s.charCodeAt(0) - 97;
  const y = s.charCodeAt(1) - 97;
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x, y };
}

/** A move value: { pass: true }, { x, y }, or null when it is not valid. */
function moveVertex(raw, size) {
  const s = String(raw ?? "").trim();
  if (s === "" || (s === "tt" && size <= 19)) return { pass: true };
  return sgfVertex(s, size);
}

function expandPoints(values, size, bad) {
  const out = [];
  for (const raw of values || []) {
    const s = String(raw).trim();
    if (s.includes(":")) {
      const [a, b] = s.split(":");
      const p = sgfVertex(a, size);
      const q = sgfVertex(b, size);
      if (p && q) {
        const x0 = Math.min(p.x, q.x);
        const x1 = Math.max(p.x, q.x);
        const y0 = Math.min(p.y, q.y);
        const y1 = Math.max(p.y, q.y);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
      } else bad?.(s);
    } else {
      const p = sgfVertex(s, size);
      if (p) out.push(p);
      else if (s !== "") bad?.(s);
    }
  }
  return out;
}

function marksOf(data, size, bad) {
  const marks = [];
  const add = (key, type) => {
    for (const p of expandPoints(data[key], size, bad)) marks.push({ ...p, type });
  };
  add("TR", "triangle");
  add("SQ", "square");
  add("CR", "circle");
  add("MA", "cross");
  for (const raw of data.LB || []) {
    const s = String(raw);
    const at = s.indexOf(":");
    if (at < 2) continue;
    const p = sgfVertex(s.slice(0, at), size);
    if (p) marks.push({ ...p, type: "label", text: s.slice(at + 1) });
    else bad?.(s.slice(0, at));
  }
  return marks;
}

/** A node's AB / AW / AE as a setup ({ black, white, empty }), or null. */
function setupOf(data, size, bad) {
  if (!data.AB && !data.AW && !data.AE) return null;
  const setup = {
    black: expandPoints(data.AB, size, bad),
    white: expandPoints(data.AW, size, bad),
    empty: expandPoints(data.AE, size, bad),
  };
  return setup.black.length || setup.white.length || setup.empty.length ? setup : null;
}

/** Two setups in a row as one: the later one wins on a shared point. */
function mergeSetup(a, b) {
  if (!a) return b;
  if (!b) return a;
  const signs = new Map();
  for (const s of [a, b]) {
    for (const p of s.empty) signs.set(p.y * 64 + p.x, [p, EMPTY]);
    for (const p of s.black) signs.set(p.y * 64 + p.x, [p, BLACK]);
    for (const p of s.white) signs.set(p.y * 64 + p.x, [p, WHITE]);
  }
  const out = { black: [], white: [], empty: [] };
  for (const [p, v] of signs.values()) (v === BLACK ? out.black : v === WHITE ? out.white : out.empty).push({ x: p.x, y: p.y });
  return out;
}

/** Root properties toSGF() regenerates from the Game itself. */
const ROOT_KNOWN = new Set(["GM", "FF", "CA", "AP", "SZ", "KM", "RU", "HA", "PB", "PW", "DT", "RE", "EV", "C", "AB", "AW", "AE", "PL", "TR", "SQ", "CR", "MA", "LB"]);
/**
 * Node properties toSGF() regenerates from the node. PL in the middle of a
 * game is implied by the next move's colour.
 */
const NODE_KNOWN = new Set(["B", "W", "C", "TR", "SQ", "CR", "MA", "LB", "AB", "AW", "AE", "PL"]);

/** Properties not in `known`, as { KEY: [raw values] }, or null. */
function extraOf(data, known) {
  let out = null;
  for (const [key, values] of Object.entries(data || {})) {
    if (known.has(key) || !/^[A-Z]+$/.test(key)) continue;
    (out ||= {})[key] = values.slice();
  }
  return out;
}

function mergeExtra(a, b) {
  if (!b) return a;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = [...(out[k] || []), ...v];
  return out;
}

/** Merge marks: a later mark on the same point replaces an earlier one. */
function mergeMarks(a, b) {
  if (!b.length) return a || [];
  const rest = (a || []).filter((m) => !b.some((n) => n.x === m.x && n.y === m.y));
  return [...rest, ...b];
}

const hasMove = (data) => "B" in data || "W" in data;

/**
 * @param {string} text
 * @returns {{game: Game, warnings: string[]}}
 */
export function loadSGF(text) {
  nodeSeq = 1;
  const roots = parseTree(String(text || ""));
  if (!roots.length) throw new Error("SGF has no root node");
  const root = roots[0];
  const data = (root.data ||= {});
  // v8: a move written in the root node (some programs do) is the first
  // move, not an unknown root property.
  if (hasMove(data)) {
    const move = {};
    for (const k of ["B", "W"]) {
      if (k in data) move[k] = data[k];
      delete data[k];
    }
    const child = { id: nodeSeq++, data: move, parent: root, children: root.children };
    for (const c of child.children) c.parent = child;
    root.children = [child];
  }
  // v5: Japanese, Chinese and Korean records are read under their own
  // rules (spellings and the rulesets that stay rejected are listed at
  // rulesFromSgf). No RU means Japanese, as every record before v5.
  const rulesRaw = first(data, "RU").trim();
  const rules = rulesFromSgf(rulesRaw);
  if (!rules) {
    const error = new Error(`Unsupported rules in SGF: ${rulesRaw}`);
    error.code = "unsupported-rules";
    error.rules = rulesRaw;
    throw error;
  }
  const size = parseSize(first(data, "SZ"));

  const warnings = [];
  const warned = new Set();
  const warn = (key, args) => {
    const s = t(key, args);
    if (warned.has(s)) return;
    warned.add(s);
    warnings.push(s);
  };
  const bad = (raw) => warn("sgf.warn.badPoint", [String(raw).slice(0, 12)]);

  // v13: the starting position is the root's setup plus that of the
  // move-less nodes that follow it on their own (several editors write a
  // problem's stones, or a handicap, in the second node).
  const signs = emptySignMap(size);
  const placeOn = (d) => {
    const s = setupOf(d, size, bad);
    if (!s) return;
    for (const p of s.empty) signs[p.y][p.x] = EMPTY;
    for (const p of s.black) signs[p.y][p.x] = BLACK;
    for (const p of s.white) signs[p.y][p.x] = WHITE;
  };
  placeOn(data);
  let pl = first(data, "PL").toUpperCase();
  const rootChain = new Set();
  for (let n = root; n.children.length === 1 && !hasMove(n.children[0].data); ) {
    n = n.children[0];
    rootChain.add(n);
    placeOn(n.data);
    if (first(n.data, "PL")) pl = first(n.data, "PL").toUpperCase();
  }
  const ab = [];
  const aw = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (signs[y][x] === BLACK) ab.push({ x, y });
      else if (signs[y][x] === WHITE) aw.push({ x, y });
    }
  }

  // HA[0] (or none) is an even game. HA without AB places nothing: the
  // record's own moves (or AB) put the stones down, and placing them here
  // as well would put them on the board twice.
  const ha = Math.max(0, Math.min(9, parseInt(first(data, "HA") || "0", 10) || 0));
  // Black setup stones alone are handicap stones (two or more). A setup
  // with White stones too is a position, not a handicap game, unless HA
  // says otherwise; this matters for the Chinese handicap compensation (and
  // matches how KataGo reads the same root: see setupStones in katago.js).
  const handicap = aw.length ? ha : ab.length >= 2 ? Math.min(9, ab.length) : ha;
  const komiRaw = first(data, "KM");
  // A missing KM takes the ruleset's komi (6.5 before v5); v8: the komi of
  // a handicap game (0.5) when there are handicap stones.
  const fallbackKomi = defaultKomi(rules, handicap);
  const komi = komiRaw === "" ? fallbackKomi : Number(komiRaw);
  const dt = first(data, "DT");
  const dateMatch = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(dt);
  const date = dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
    : new Date();
  const game = new Game({
    size,
    rules,
    komi: Number.isFinite(komi) ? komi : fallbackKomi,
    handicap,
    placeHandicap: false,
    date,
    playerBlack: first(data, "PB") || "Black",
    playerWhite: first(data, "PW") || "White",
    event: first(data, "EV"),
  });

  if (ab.length || aw.length) {
    const stones = [
      ...ab.map((p) => ({ ...p, color: BLACK })),
      ...aw.map((p) => ({ ...p, color: WHITE })),
    ];
    // Who moves first: PL, else the colour of the record's first move, else
    // White after handicap or black setup stones.
    let firstMove = root;
    while (firstMove && !hasMove(firstMove.data || {})) firstMove = firstMove.children[0];
    const fm = firstMove ? ("B" in firstMove.data ? "B" : "W") : "";
    const say = pl === "W" || pl === "B" ? pl : fm;
    const turn = say === "W" ? WHITE : say === "B" ? BLACK : handicap > 0 || ab.length > 0 ? WHITE : BLACK;
    game.setup(stones, turn);
  } else if (pl === "W") {
    game.root.turn = WHITE;
  }
  game.setRootComment(first(data, "C"));
  game.root.marks = marksOf(data, size, bad);
  game.root.extra = extraOf(data, ROOT_KNOWN);

  // Build the tree depth first with an explicit stack; children are pushed
  // in reverse so each node's variations keep their order. `into` is the
  // game node an SGF node's move is played from (a move-less node folds into
  // it), `pending` the setup of move-less nodes waiting for the next move,
  // `depth` the move number of `into`.
  const stack = [];
  const pushChildren = (node, into, pending, depth) => {
    for (let k = node.children.length - 1; k >= 0; k--) stack.push({ node: node.children[k], into, pending, depth });
  };
  pushChildren(root, game.root, null, 0);
  while (stack.length) {
    const { node: child, into, pending, depth } = stack.pop();
    const d = child.data || {};
    const own = rootChain.has(child) ? null : setupOf(d, size, bad);
    const key = "B" in d ? "B" : "W" in d ? "W" : null;
    if (!key) {
      // A node without a move (setup or comment only): its comment and
      // marks fold into the node it follows; its setup waits for the next
      // move on this line (or is already part of the root position).
      if (first(d, "C")) into.comment = into.comment ? into.comment + "\n\n" + first(d, "C") : first(d, "C");
      into.marks = mergeMarks(into.marks, marksOf(d, size, bad));
      into.extra = mergeExtra(into.extra, extraOf(d, into === game.root ? ROOT_KNOWN : NODE_KNOWN));
      const next = mergeSetup(pending, own);
      if (next && !child.children.length) warn("sgf.warn.trailingSetup");
      pushChildren(child, into, next, depth);
      continue;
    }
    const color = key === "B" ? BLACK : WHITE;
    const setup = mergeSetup(pending, own);
    const raw = first(d, key);
    const v = moveVertex(raw, size);
    game.current = into;
    let res;
    if (!v) {
      warn("sgf.warn.badMove", [depth + 1, String(raw).slice(0, 12)]);
      res = game.pass({ color, force: true, setup });
    } else if (v.pass) {
      res = game.pass({ color, force: true, setup });
    } else {
      res = game.play(v.x, v.y, { color, force: true, setup });
      if (!res.ok) {
        warn("sgf.warn.illegalMove", [depth + 1, raw]);
        res = game.pass({ color, force: true, setup });
      }
    }
    const made = res.node;
    if (first(d, "C")) made.comment = first(d, "C");
    const marks = marksOf(d, size, bad);
    if (marks.length) made.marks = marks;
    const extra = extraOf(d, NODE_KNOWN);
    if (extra) made.extra = extra;
    pushChildren(child, made, null, depth + 1);
  }
  // Open at the end of the main line: a library game should show its final
  // position, and Review must see the moves that were just walked.
  let end = game.root;
  while (end.children.length) end = end.children[0];
  game.current = end;

  const re = first(data, "RE");
  if (re) {
    end.result = re;
    end.phase = "ended";
  }
  return { game, warnings };
}
