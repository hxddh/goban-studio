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
 * Comments (C) and markup (TR, SQ, CR, MA, LB) are read on every node,
 * and properties the app does not interpret are kept on node.extra (root
 * and moves) so that toSGF() writes them back.
 *
 * Real-world records.
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
 * Reading what people actually have on disk:
 *   - A file may hold several games (a collection). loadSGF reads one of
 *     them, the first unless `index` says otherwise, and reports how many
 *     there are; countGames(text) counts without building anything.
 *   - FF[3] long property names (`AddBlack`, `SiZe`, `Black`) are read by
 *     their capital letters; an all-lowercase name (`sz`, `b`) is read as
 *     its capitals.
 *   - Bytes that are not UTF-8 and name no charset are decoded by a guess
 *     among the legacy CJK charsets (see guessCharset).
 *   - KM is checked: a decimal comma is read, Fox-style hundredths are
 *     converted, and anything else implausible falls back to the ruleset's
 *     komi (see parseKomi).
 *   - DT is kept as written when it is a valid SGF date; a record without
 *     one has no date (never today's).
 *
 * API
 *   loadSGF(input, { index = 0 } = {})
 *     `input` is the file's text, or its raw bytes (Uint8Array /
 *     ArrayBuffer), which are decoded with decodeSgf. Returns
 *       game      the Game, cursor at the end of the main line
 *       warnings  user-facing strings in the current language (i18n.js)
 *       codes     one code per warning, same order: "collection",
 *                 "guessedCharset", "komi", "badMove", "illegalMove",
 *                 "badPoint", "trailingSetup"
 *       games     how many games the file holds (1 for an ordinary record)
 *       index     which of them `game` is (0-based)
 *       charset   the charset the bytes were read in, null for text input
 *     The "collection" warning is only given for the default load (no
 *     `index`): a caller that asks for game N already knows there are more.
 *     An `index` outside the file throws (code "no-such-game").
 *   countGames(input)      the number of games in the text or bytes
 *   decodeSgf(bytes)       { text, charset, guessed }
 *   decodeSgfBytes(bytes)  the text alone
 */
import { BLACK, WHITE, EMPTY, Game, defaultKomi, rulesFromSgf, emptySignMap } from "./rules.js";
import { t, currentLang } from "./i18n.js";

/** Board sizes the app (its board, its engines and its content) can play. */
const SGF_SIZES = Object.freeze([9, 13, 19]);

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

/* --------------------------------------------------- guessing a charset
 *
 * Old records often name no charset at all. When the bytes are not UTF-8
 * and there is no usable CA, the charset is guessed among the legacy
 * encodings read above. The guess has two steps:
 *
 *   1. The bytes must decode strictly (no invalid sequence) in the
 *      candidate. This alone rules out most wrong answers between the
 *      Shift_JIS family and the EUC family, whose byte grammars differ.
 *   2. Among the survivors, the text must look like everyday writing. The
 *      national standards behind these charsets put their characters in
 *      rows by how common they are (GB2312 level 1 before level 2, JIS
 *      level 1 before level 2, KS X 1001 Hangul before Hanja, Big5 常用
 *      before 次常用), so the lead byte of each two-byte character says how
 *      ordinary it is in that charset. Each character scores from +2
 *      (everyday rows: common Hanzi / Kanji, kana, Hangul) down to -2
 *      (private-use and vendor rows, half-width katakana, four-byte
 *      forms), which is what text read in the wrong charset is full of.
 *      The candidate with the best average wins.
 *
 * Text made only of the commonest rows scores the same in several charsets
 * (a Hangul name in EUC-KR is also a run of level-1 Hanzi in GB2312, and
 * of level-1 Kanji in EUC-JP). Two rules settle a tie:
 *   - Six or more characters that all sit in the Hangul rows are Korean:
 *     Chinese or Japanese text of that length practically always leaves
 *     those rows (they hold about half of the common Hanzi, and no kana).
 *   - Otherwise the usual charset of the language the app is used in
 *     comes first (Shift_JIS for Japanese, EUC-KR for Korean), then
 *     GB18030, the most common of them among Go records, then the rest.
 *     EUC-JP therefore only wins on its own evidence (kana).
 * A short name can still be read in the wrong one of these charsets; the
 * import says the encoding was guessed, so the player knows what to check.
 *
 * Western text is never a guess. In ISO-8859-1 an accented letter is one
 * high byte among ASCII letters, while CJK text has runs of high bytes; a
 * file without two high bytes in a row, or whose best average is under 1
 * (mostly rare rows), keeps the FF[4] default, ISO-8859-1, as before.
 */

const between = (v, lo, hi) => v >= lo && v <= hi;

/**
 * Per-charset scoring: (bytes, i) -> [length, score] for the character that
 * starts at the non-ASCII byte i. The byte grammar was already checked by a
 * strict decode, so these only classify.
 */
const SCORERS = {
  gb18030(b, i) {
    const lead = b[i];
    const trail = b[i + 1] ?? 0;
    if (between(trail, 0x30, 0x39)) return [4, -2]; // four-byte form
    if (trail < 0xa1) return [2, -1]; // GBK extension rows (rare and traditional forms)
    if (between(lead, 0xb0, 0xd7)) return [2, 2]; // GB2312 level 1
    if (between(lead, 0xd8, 0xf7)) return [2, 1]; // GB2312 level 2
    if (between(lead, 0xa1, 0xa3)) return [2, 0.5]; // punctuation, full-width forms
    if (between(lead, 0xa4, 0xa9)) return [2, 0]; // kana, Greek, Cyrillic, box drawing
    return [2, -2]; // user-defined rows
  },
  big5(b, i) {
    const lead = b[i];
    if (between(lead, 0xa4, 0xc6)) return [2, 2]; // frequently used (常用字)
    if (between(lead, 0xc9, 0xf9)) return [2, 1]; // less frequently used (次常用字)
    if (between(lead, 0xa1, 0xa3)) return [2, 0.5]; // punctuation and symbols
    return [2, -2]; // HKSCS and vendor rows
  },
  shift_jis(b, i) {
    const lead = b[i];
    if (between(lead, 0xa1, 0xdf)) return [1, -1]; // half-width katakana
    if (lead === 0x81) return [2, 0.5]; // punctuation and symbols
    if (lead === 0x82 || lead === 0x83) return [2, 2]; // full-width letters, kana
    if (between(lead, 0x88, 0x97)) return [2, 2]; // JIS level 1 kanji
    if (between(lead, 0x98, 0x9f) || between(lead, 0xe0, 0xea)) return [2, 1]; // level 2 (0x98 holds the end of level 1)
    if (between(lead, 0xf0, 0xf9)) return [2, -2]; // user-defined
    return [between(lead, 0x81, 0xfc) ? 2 : 1, 0]; // Greek, Cyrillic, vendor rows
  },
  "euc-jp"(b, i) {
    const lead = b[i];
    if (lead === 0x8e) return [2, -1]; // half-width katakana
    if (lead === 0x8f) return [3, -1]; // JIS X 0212
    if (lead === 0xa4 || lead === 0xa5) return [2, 2]; // kana
    if (between(lead, 0xb0, 0xcf)) return [2, 2]; // JIS level 1 kanji
    if (between(lead, 0xd0, 0xf4)) return [2, 1]; // level 2
    if (lead === 0xa1 || lead === 0xa2) return [2, 0.5]; // punctuation and symbols
    return [2, 0];
  },
  "euc-kr"(b, i) {
    const lead = b[i];
    const trail = b[i + 1] ?? 0;
    if (trail < 0xa1) return [2, 0]; // extended Hangul (cp949): rare syllables
    if (between(lead, 0xb0, 0xc8)) return [2, 2]; // Hangul
    if (between(lead, 0xca, 0xfd)) return [2, 0]; // Hanja: rare in running text
    if (between(lead, 0xa1, 0xa3)) return [2, 0.5]; // punctuation, full-width forms
    return [2, 0];
  },
};

/** Candidates in the order that settles a tie, by the app's language. */
function charsetOrder(lang) {
  if (lang === "ja") return ["shift_jis", "gb18030", "big5", "euc-jp", "euc-kr"];
  if (lang === "ko") return ["euc-kr", "gb18030", "big5", "shift_jis", "euc-jp"];
  return ["gb18030", "big5", "shift_jis", "euc-jp", "euc-kr"];
}

/**
 * The most plausible legacy CJK charset for bytes that are not UTF-8, or
 * null when none reads as text (see the note above). `lang` settles ties.
 */
export function guessCharset(input, lang = currentLang()) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  let from = -1;
  let run = false;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] < 0x80) continue;
    if (from < 0) from = i;
    if (bytes[i + 1] >= 0x80) {
      run = true;
      break;
    }
  }
  if (!run) return null;
  const tied = [];
  let bestMean = 1;
  for (const label of charsetOrder(lang)) {
    try {
      decodeWith(label, bytes, true);
    } catch (_) {
      continue;
    }
    const score = SCORERS[label];
    let total = 0;
    let count = 0;
    // A few thousand characters are evidence enough in a large file.
    for (let i = from; i < bytes.length && count < 4096; ) {
      if (bytes[i] < 0x80) {
        i++;
        continue;
      }
      const [len, points] = score(bytes, i);
      total += points;
      count++;
      i += len;
    }
    const mean = count ? total / count : 0;
    if (mean < bestMean) continue;
    if (mean > bestMean) tied.length = 0;
    bestMean = mean;
    tied.push({ label, count });
  }
  const korean = tied.find((c) => c.label === "euc-kr");
  if (korean && bestMean === 2 && korean.count >= 6) return "euc-kr";
  return tied.length ? tied[0].label : null;
}

/**
 * An SGF file's raw bytes (a Uint8Array or ArrayBuffer) as
 * { text, charset, guessed }: `charset` is the TextDecoder label used and
 * `guessed` is true when the file did not say and guessCharset chose.
 *
 * A byte-order mark wins. Bytes that are valid UTF-8 are read as UTF-8,
 * whatever CA says: text in a legacy CJK charset is practically never valid
 * UTF-8, while editors that re-save a record as UTF-8 often keep its old CA.
 * Otherwise the CA property names the charset (GB2312 / GBK / GB18030,
 * Big5, Shift_JIS, EUC-JP, EUC-KR, ISO-8859-1 …); its value is plain ASCII
 * in all of them, so it is read from a Latin-1 view of the file's head.
 * Without a known CA the charset is guessed; when nothing fits, the FF[4]
 * default, ISO-8859-1, applies.
 */
export function decodeSgf(input, { lang = currentLang() } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  const as = (charset, body, guessed = false) => ({ text: decodeWith(charset, body, false), charset, guessed });
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return as("utf-8", bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return as("utf-16le", bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return as("utf-16be", bytes.subarray(2));
  try {
    return { text: decodeWith("utf-8", bytes, true), charset: "utf-8", guessed: false };
  } catch (_) {
    // Not UTF-8: the record's own charset.
  }
  const head = decodeWith("windows-1252", bytes.subarray(0, 65536), false);
  // CA outside property values: each value is skipped whole, so a comment that mentions CA[…] is text
  // (escapes are not followed: a Shift_JIS trail byte is a backslash).
  const ca = [...head.matchAll(/\[[^\]]*\]|(?<![A-Za-z])CA\s*\[([^\]]*)\]/g)].find((m) => m[1] !== undefined);
  const named = ca && sgfCharset(ca[1]);
  // A record that says UTF-8 but is not keeps what can be read of it.
  if (named) return as(named, bytes);
  const guess = guessCharset(bytes, lang);
  return guess ? as(guess, bytes, true) : as("windows-1252", bytes);
}

/** The text of an SGF file from its raw bytes (see decodeSgf). */
export function decodeSgfBytes(input) {
  return decodeSgf(input).text;
}

/** How a guessed charset is named to the player. */
const CHARSET_NAMES = { gb18030: "GBK", big5: "Big5", shift_jis: "Shift_JIS", "euc-jp": "EUC-JP", "euc-kr": "EUC-KR" };

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
      // FF[3] allowed long names whose capitals are the identifier
      // (AddBlack = AB, SiZe = SZ); a name with no capital at all (sz, b)
      // is taken as written in the wrong case.
      const name = text.slice(start, i);
      const key = name.replace(/[a-z]/g, "") || name.toUpperCase();
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
 * KM as a komi in points, or null when it cannot be one.
 *
 *   - "7,5" is 7.5 (a decimal comma).
 *   - A value within ±50 is taken as written.
 *   - A larger value is hundredths, as Fox and some other servers write
 *     it, if that gives a komi anyone plays (at most 15 points): hundredths
 *     of a point when that is a multiple of half a point (650 = 6.5,
 *     750 = 7.5), else hundredths of a stone, two points each, when that
 *     is (375 = 3.75 stones = 7.5 points, 275 = 5.5).
 *   - Anything else (KM[abc], KM[9999]) is not a komi: the caller uses the
 *     ruleset's komi and says so.
 */
export function parseKomi(raw) {
  let s = String(raw ?? "").trim();
  if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) <= 50) return v;
  const points = v / 100;
  const half = (x) => Number.isInteger(x * 2);
  if (half(points) && Math.abs(points) <= 15) return points;
  if (half(points * 2) && Math.abs(points * 2) <= 15) return points * 2;
  return null;
}

/**
 * DT as { text, date }: the value as written when it is a valid SGF date
 * ("1846", "1846-09", "1846-09-11", and lists with the FF[4] shortcuts such
 * as "1933-10-16,17" or "1996-12-27,28,1997-01-03"), with the Date of its
 * first day. Dots and slashes between the parts are read as hyphens.
 * Anything else is no date: { text: "", date: null }.
 */
export function parseDate(raw) {
  const none = { text: "", date: null };
  const text = String(raw ?? "").trim().replace(/\s*,\s*/g, ",").replace(/[./]/g, "-");
  if (!text) return none;
  const parts = text.split(",");
  const okMonth = (m) => m >= 1 && m <= 12;
  const okDay = (d) => d >= 1 && d <= 31;
  let date = null;
  let had = ""; // what the previous item gave: "y", "ym" or "ymd"
  for (const part of parts) {
    const full = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(part);
    if (full) {
      const [, y, m, d] = full;
      if ((m && !okMonth(Number(m))) || (d && !okDay(Number(d)))) return none;
      had = d ? "ymd" : m ? "ym" : "y";
      date ||= new Date(Number(y), m ? Number(m) - 1 : 0, d ? Number(d) : 1);
      continue;
    }
    // Shortcuts lean on the item before: "MM-DD" after a month or a day,
    // "DD" after a day, "MM" after a month.
    const short = /^(\d{2})(?:-(\d{2}))?$/.exec(part);
    if (!short || !had || had === "y") return none;
    const [, a, b] = short;
    if (b) {
      if (!okMonth(Number(a)) || !okDay(Number(b))) return none;
      had = "ymd";
    } else if (had === "ymd") {
      if (!okDay(Number(a))) return none;
    } else if (!okMonth(Number(a))) return none;
  }
  return { text, date };
}

const textOf = (input) => (typeof input === "string" ? input : input == null ? "" : decodeSgf(input).text);

/** How many games the file (text or bytes) holds. */
export function countGames(input) {
  return parseTree(textOf(input)).length;
}

/**
 * Read one game of an SGF file: see "API" at the top of this file.
 *
 * @param {string | Uint8Array | ArrayBuffer} input
 * @param {{ index?: number }} [options]
 * @returns {{game: Game, warnings: string[], codes: string[], games: number, index: number, charset: string | null}}
 */
export function loadSGF(input, { index = null } = {}) {
  nodeSeq = 1;
  const decoded = typeof input === "string" || input == null ? null : decodeSgf(input);
  const roots = parseTree(decoded ? decoded.text : String(input || ""));
  if (!roots.length) throw new Error("SGF has no root node");
  const which = index === null || index === undefined ? 0 : Number(index);
  if (!Number.isInteger(which) || which < 0 || which >= roots.length) {
    const error = new Error(`SGF has no game ${which}`);
    error.code = "no-such-game";
    error.games = roots.length;
    throw error;
  }
  const root = roots[which];
  const data = (root.data ||= {});
  // A move written in the root node (some programs do) is the first
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
  // Japanese, Chinese and Korean records are read under their own
  // rules (spellings and the rulesets that stay rejected are listed at
  // rulesFromSgf). No RU means Japanese.
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
  const codes = [];
  const warned = new Set();
  const warn = (key, args) => {
    const s = t(key, args);
    if (warned.has(s)) return;
    warned.add(s);
    warnings.push(s);
    codes.push(key.replace(/^sgf\.warn\./, ""));
  };
  // What the file as a whole needs said comes first: the caller may show
  // only one warning.
  if (roots.length > 1 && (index === null || index === undefined)) warn("sgf.warn.collection", [roots.length]);
  if (decoded?.guessed) warn("sgf.warn.guessedCharset", [CHARSET_NAMES[decoded.charset] || decoded.charset]);
  const bad = (raw) => warn("sgf.warn.badPoint", [String(raw).slice(0, 12)]);

  // The starting position is the root's setup plus that of the
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
  // A missing KM takes the ruleset's komi; The komi of
  // a handicap game (0.5) when there are handicap stones.
  const fallbackKomi = defaultKomi(rules, handicap);
  let komi = fallbackKomi;
  if (komiRaw.trim() !== "") {
    const stated = parseKomi(komiRaw);
    if (stated === null) warn("sgf.warn.komi", [komiRaw.trim().slice(0, 12), String(fallbackKomi)]);
    else komi = stated;
  }
  // The record's own date, as written; a record without one has none.
  const when = parseDate(first(data, "DT"));
  const game = new Game({
    size,
    rules,
    komi,
    handicap,
    placeHandicap: false,
    date: when.date,
    dateText: when.text,
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
  // A move that could not be read stands in the tree as a pass so the move
  // numbers stay right, but nobody passed: it must not count towards the
  // two passes that end a game (two of them in a row would otherwise put
  // the middle of a record into scoring).
  const unread = (res) => {
    res.node.passes = 0;
    res.node.phase = "playing";
    return res;
  };
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
    // Two passes followed by more moves did not end the game: that node is not a count.
    if (into.phase === "scoring") into.phase = "playing";
    let res;
    if (!v) {
      warn("sgf.warn.badMove", [depth + 1, String(raw).slice(0, 12)]);
      res = unread(game.pass({ color, force: true, setup }));
    } else if (v.pass) {
      res = game.pass({ color, force: true, setup });
    } else {
      res = game.play(v.x, v.y, { color, force: true, setup });
      if (!res.ok) {
        warn("sgf.warn.illegalMove", [depth + 1, raw]);
        res = unread(game.pass({ color, force: true, setup }));
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
  return { game, warnings, codes, games: roots.length, index: which, charset: decoded ? decoded.charset : null };
}
