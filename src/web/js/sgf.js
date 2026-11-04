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
 */
import { BLACK, WHITE, Game, EMPTY, rulesFromSgf, rulesetById, starPoints } from "./rules.js";

let nodeSeq = 1;

function parseTree(text) {
  let i = 0;
  const n = text.length;

  function ws() {
    while (i < n && /\s/.test(text[i])) i++;
  }

  function parseValue() {
    if (text[i] !== "[") return null;
    i++;
    let out = "";
    while (i < n && text[i] !== "]") {
      if (text[i] === "\\") {
        i++;
        if (i >= n) break;
        if (text[i] === "\r") {
          i++;
          if (text[i] === "\n") i++;
          continue;
        }
        if (text[i] === "\n") {
          i++;
          continue;
        }
        out += text[i];
        i++;
      } else {
        out += text[i];
        i++;
      }
    }
    if (text[i] === "]") i++;
    return out;
  }

  function parseNode(parent) {
    const node = { id: nodeSeq++, data: {}, parent, children: [] };
    ws();
    while (i < n && text[i] !== ";" && text[i] !== ")" && text[i] !== "(") {
      if (!/[A-Za-z]/.test(text[i])) {
        i++;
        continue;
      }
      let key = "";
      while (i < n && /[A-Za-z]/.test(text[i])) key += text[i++];
      const values = [];
      ws();
      while (i < n && text[i] === "[") {
        const v = parseValue();
        if (v !== null) values.push(v);
        ws();
      }
      if (key) {
        if (!node.data[key]) node.data[key] = [];
        node.data[key].push(...values);
      }
    }
    return node;
  }

  function parseGame(parent) {
    ws();
    if (text[i] !== "(") return null;
    i++;
    ws();
    let anchor = null;
    let current = null;
    while (i < n) {
      ws();
      if (i >= n) break;
      if (text[i] === ")") {
        i++;
        break;
      }
      if (text[i] === ";") {
        i++;
        const node = parseNode(current);
        if (!anchor) anchor = node;
        if (current) current.children.push(node);
        current = node;
        continue;
      }
      if (text[i] === "(") {
        const branch = parseGame(current);
        if (branch && current) current.children.push(branch);
        continue;
      }
      // Stray property before a node: attach it to the anchor.
      if (!anchor) {
        anchor = { id: nodeSeq++, data: {}, parent, children: [] };
        current = anchor;
      }
      if (/[A-Za-z]/.test(text[i])) {
        const extra = parseNode(current);
        Object.assign(anchor.data, extra.data);
        continue;
      }
      i++;
    }
    if (anchor) anchor.parent = parent;
    return anchor;
  }

  ws();
  const roots = [];
  while (i < n) {
    ws();
    if (text[i] !== "(") break;
    const root = parseGame(null);
    if (root) roots.push(root);
    else break;
  }
  return roots;
}

function first(data, key) {
  const v = data?.[key];
  return Array.isArray(v) && v.length ? String(v[0]) : "";
}

function parseSize(raw) {
  const n = parseInt(String(raw || "19").split(":")[0], 10);
  return n === 9 || n === 13 || n === 19 ? n : 19;
}

/** SGF columns skip I, like board coordinates: a..h, j..z. */
function sgfColumn(code) {
  if (code < 97) return -1;
  return code - 97 - (code > 105 ? 1 : 0);
}

function sgfVertex(raw, size) {
  const s = String(raw || "");
  if (!s) return null;
  if (s.length < 2) return null;
  const x = sgfColumn(s.charCodeAt(0));
  const y = s.charCodeAt(1) - 97;
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x, y };
}

function expandPoints(values, size) {
  const out = [];
  for (const raw of values || []) {
    const s = String(raw);
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
      }
    } else {
      const p = sgfVertex(s, size);
      if (p) out.push(p);
    }
  }
  return out;
}

function marksOf(data, size) {
  const marks = [];
  const add = (key, type) => {
    for (const p of expandPoints(data[key], size)) marks.push({ ...p, type });
  };
  add("TR", "triangle");
  add("SQ", "square");
  add("CR", "circle");
  add("MA", "cross");
  for (const raw of data.LB || []) {
    const s = String(raw);
    const at = s.indexOf(":");
    if (at < 2) continue;
    const p = sgfVertex(s.slice(0, 2), size);
    if (p) marks.push({ ...p, type: "label", text: s.slice(at + 1) });
  }
  return marks;
}

/** Root properties toSGF() regenerates from the Game itself. */
const ROOT_KNOWN = new Set(["GM", "FF", "CA", "AP", "SZ", "KM", "RU", "HA", "PB", "PW", "DT", "RE", "EV", "C", "AB", "AW", "PL", "TR", "SQ", "CR", "MA", "LB"]);
/** Node properties toSGF() regenerates from the node. */
const NODE_KNOWN = new Set(["B", "W", "C", "TR", "SQ", "CR", "MA", "LB"]);

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

/**
 * @param {string} text
 * @returns {{game: Game, warnings: string[]}}
 */
export function loadSGF(text) {
  nodeSeq = 1;
  const roots = parseTree(String(text || ""));
  if (!roots.length) throw new Error("SGF has no root node");
  const root = roots[0];
  const data = root.data || {};
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
  const komiRaw = first(data, "KM");
  // A missing KM takes the ruleset's even-game komi (6.5 before v5).
  const fallbackKomi = rulesetById(rules).komi;
  const komi = komiRaw === "" ? fallbackKomi : Number(komiRaw);
  const ab = expandPoints(data.AB, size);
  const aw = expandPoints(data.AW, size);
  const ha = Math.max(0, Math.min(9, parseInt(first(data, "HA") || "0", 10) || 0));
  // Black setup stones alone are handicap stones. A setup with White stones
  // too is a position, not a handicap game, unless HA says otherwise; this
  // matters for the Chinese handicap compensation (and matches how KataGo
  // reads the same root: see setupStones in katago.js).
  const handicap = aw.length ? ha : ab.length ? Math.min(9, ab.length) : ha;
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
    const pl = first(data, "PL").toUpperCase();
    const turn = pl === "W" ? WHITE : pl === "B" ? BLACK : handicap > 0 || ab.length > 0 ? WHITE : BLACK;
    game.setup(stones, turn);
  }
  game.setRootComment(first(data, "C"));
  game.root.marks = marksOf(data, size);
  game.root.extra = extraOf(data, ROOT_KNOWN);

  const warnings = [];
  const map = new Map();
  map.set(root.id, game.root.id);

  function walk(node) {
    const parentId = map.get(node.id);
    if (parentId === undefined) return;
    for (const child of node.children || []) {
      game.goto(parentId);
      const d = child.data || {};
      let played = false;
      for (const [key, color] of [["B", BLACK], ["W", WHITE]]) {
        if (!(key in d)) continue;
        const raw = first(d, key);
        const v = sgfVertex(raw, size);
        const pass = !v;
        const res = pass ? game.pass({ color, force: true }) : game.play(v.x, v.y, { color, force: true });
        if (!res.ok) {
          warnings.push(`Illegal ${key} move in SGF (${raw || "pass"})`);
          game.pass({ color, force: true });
        }
        played = true;
        break;
      }
      if (!played) {
        // A node without a move (setup or comment only) folds into the
        // node it follows. Mid-game setup stones are not applied; they are
        // kept, like any unknown property, for the round trip.
        const into = game.current;
        if (first(d, "C")) into.comment = into.comment ? into.comment + "\n\n" + first(d, "C") : first(d, "C");
        into.marks = mergeMarks(into.marks, marksOf(d, size));
        into.extra = mergeExtra(into.extra, extraOf(d, into === game.root ? ROOT_KNOWN : NODE_KNOWN));
        map.set(child.id, game.current.id);
        walk(child);
        continue;
      }
      const made = game.current;
      if (first(d, "C")) made.comment = first(d, "C");
      const marks = marksOf(d, size);
      if (marks.length) made.marks = marks;
      const extra = extraOf(d, NODE_KNOWN);
      if (extra) made.extra = extra;
      map.set(child.id, made.id);
      walk(child);
    }
  }

  walk(root);
  // Open at the end of the main line: a library game should show its final
  // position, and Review must see the moves that were just walked.
  const main = game.mainLine();
  game.goto(main[main.length - 1].id);

  const re = first(data, "RE");
  if (re) {
    let n = game.root;
    while (n.children.length) n = n.children[0];
    n.result = re;
    n.phase = "ended";
  }
  return { game, warnings };
}

/** A fresh game with handicap stones on the standard points. */
export function handicapSetup(size, count) {
  const game = new Game({ size, handicap: count });
  game.setup(
    starPoints(size).slice(0, count).map(([x, y]) => ({ x, y, color: BLACK })),
    WHITE,
  );
  return game;
}
