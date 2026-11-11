/**
 * Accessibility: the words a screen reader says about the board.
 *
 * Pure text builders over a sign map (board[y][x]: 1 black, -1 white, 0
 * empty) in the interface language. No DOM, no app state, so the Node tests
 * can check every sentence (scripts/tests/core-a11y.mjs). Coordinates
 * follow the app's convention: letters without I, rows counted from the
 * bottom (A19 is the top-left corner of a 19×19 board).
 *
 * The keys on a focused board (app/announcer.js) call these:
 *   arrows   pointText            "D4, empty" / "D4, black, last move"
 *   I        pointText (detail)   "D4, white, group of 3, 2 liberties"
 *   M        lastMoveText
 *   T        turnText (+ the goal or the lesson step)
 *   C        capturesText
 *   R        rowText              "Row 4: black D, F; white E"
 *   B        boardText            stone counts, then every row with stones
 * and the moves themselves are announced with moveText / reviewMoveText.
 */
import { t } from "./i18n.js";
import { LETTERS } from "./rules.js";
import { windowOf } from "./board.js";

const BLACK = 1;
const WHITE = -1;

export function coordName(x, y, size) {
  return `${LETTERS[x] || "?"}${size - y}`;
}

const colorWord = (c) => t(c === BLACK ? "common.black" : "common.white");
const stoneWord = (c) => t(c === BLACK ? "a11y.blackStone" : "a11y.whiteStone");
const join = (parts) => parts.filter(Boolean).join(t("a11y.sep"));

/** The connected group at (x, y) and its liberties, on a sign map. */
export function groupAt(board, x, y) {
  const size = board.length;
  const c = board[y]?.[x];
  if (!c) return null;
  const seen = new Set([y * size + x]);
  const libs = new Set();
  const stack = [[x, y]];
  const stones = [];
  while (stack.length) {
    const [px, py] = stack.pop();
    stones.push({ x: px, y: py });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const v = board[ny][nx];
      const k = ny * size + nx;
      if (v === 0) libs.add(k);
      else if (v === c && !seen.has(k)) {
        seen.add(k);
        stack.push([nx, ny]);
      }
    }
  }
  return { color: c, stones, liberties: libs.size };
}

/**
 * One point: "D4, empty", "D4, black", and with `detail` the group size and
 * liberties of a stone. `last` names the last move; `marked` a board mark.
 */
export function pointText(board, x, y, { size = board.length, detail = false, last = null, marked = false } = {}) {
  const v = board[y]?.[x] || 0;
  const parts = [v ? stoneWord(v) : t("a11y.empty")];
  if (last && !last.pass && last.x === x && last.y === y) parts.push(t("a11y.lastMoveHere"));
  if (marked) parts.push(t("a11y.markedHere"));
  if (detail && v) {
    const g = groupAt(board, x, y);
    if (g.stones.length > 1) parts.push(t("a11y.groupOf", [g.stones.length]));
    parts.push(g.liberties === 1 ? t("a11y.liberty1") : t("a11y.liberties", [g.liberties]));
  }
  return t("a11y.point", [coordName(x, y, size), join(parts)]);
}

/**
 * A move as it is played: "Black D4", "Black D4, captures 2", "White
 * passes"; `computer` prefixes it as the computer's move.
 */
export function moveText({ color, x = null, y = null, pass = false, captured = 0, size = 19, computer = false }) {
  let s = pass || x == null ? t("a11y.passes", [colorWord(color)]) : t("a11y.move", [colorWord(color), coordName(x, y, size)]);
  if (captured > 0) s = join([s, t("a11y.takes", [captured])]);
  return computer ? t("a11y.computer", [s]) : s;
}

/**
 * Stepping through a game in review: "Move 12, Black D4, loses about 3.5
 * points". `loss` (points, from the analysis) is left out when unknown.
 */
export function reviewMoveText({ number, move, size, captured = 0, loss = null }) {
  if (!number || !move) return t("a11y.start");
  const parts = [t("a11y.moveN", [number]), moveText({ ...move, size, captured })];
  if (loss != null && Number.isFinite(loss)) {
    const half = Math.round(Math.max(0, loss) * 2) / 2;
    parts.push(half >= 0.5 ? t("a11y.loss", [String(half)]) : t("a11y.noLoss"));
  }
  return join(parts);
}

export function turnText(color) {
  return t("a11y.toPlay", [colorWord(color)]);
}

/** Stones each side has captured (prisoners). */
export function capturesText(black = 0, white = 0) {
  return t("a11y.prisoners", [black, white]);
}

export function lastMoveText(last, size) {
  if (!last) return t("a11y.noLastMove");
  return t("a11y.lastMove", [moveText({ ...last, size })]);
}

/** "black D, F; white E" — the stones on a list of points, by colour. */
function stonesOn(board, points, label) {
  const by = { [BLACK]: [], [WHITE]: [] };
  for (const p of points) {
    const v = board[p.y][p.x];
    if (v) by[v].push(label(p));
  }
  const groups = [BLACK, WHITE].filter((c) => by[c].length).map((c) => t("a11y.colorList", [stoneWord(c), by[c].join(t("a11y.listSep"))]));
  return groups.length ? groups.join(t("a11y.groupSep")) : "";
}

const fullWindow = (size) => ({ x0: 0, y0: 0, x1: size - 1, y1: size - 1 });

/**
 * The part of the board a model draws: a problem window is widened before
 * it is drawn (windowOf), so reading uses the same window, not the
 * problem's own view. Null for the whole board.
 */
export function shownWindow(model, size = model?.size) {
  return model?.view ? windowOf(model.view, size) : null;
}

/** One row of the board (inside the visible window): "Row 4: black D, F; white E". */
export function rowText(board, y, { size = board.length, view = null } = {}) {
  const w = view || fullWindow(size);
  const pts = [];
  for (let x = w.x0; x <= w.x1; x++) pts.push({ x, y });
  const s = stonesOn(board, pts, (p) => LETTERS[p.x]);
  return t("a11y.row", [size - y, s || t("a11y.empty")]);
}

/** One column: "Column D: black 4, 16; white 10". */
export function columnText(board, x, { size = board.length, view = null } = {}) {
  const w = view || fullWindow(size);
  const pts = [];
  for (let y = w.y0; y <= w.y1; y++) pts.push({ x, y });
  const s = stonesOn(board, pts, (p) => String(size - p.y));
  return t("a11y.column", [LETTERS[x], s || t("a11y.empty")]);
}

/**
 * The whole board (or the problem window): how many stones each side has,
 * then every row that has stones, top to bottom.
 */
export function boardText(board, { size = board.length, view = null } = {}) {
  const w = view || fullWindow(size);
  let b = 0;
  let wh = 0;
  const rows = [];
  for (let y = w.y0; y <= w.y1; y++) {
    let any = false;
    for (let x = w.x0; x <= w.x1; x++) {
      const v = board[y][x];
      if (v === BLACK) b++;
      else if (v === WHITE) wh++;
      if (v) any = true;
    }
    if (any) rows.push(rowText(board, y, { size, view: w }));
  }
  if (!b && !wh) return t("a11y.boardEmpty");
  return [t("a11y.count", [b, wh]), ...rows].join(t("a11y.sentence"));
}

/** The board's accessible name: "Go board, 19 by 19". */
export function boardName(size) {
  return t("a11y.boardName", [size]);
}

/**
 * The keys on a focused board, for the keyboard shortcuts sheet. Each row is
 * [keys, what they do].
 */
export function boardKeyRows() {
  return [
    ["↑ ↓ ← →", t("a11y.key.move")],
    ["Enter · Space", t("a11y.key.play")],
    ["I", t("a11y.key.info")],
    ["M", t("a11y.key.last")],
    ["T", t("a11y.key.turn")],
    ["C", t("a11y.key.captures")],
    ["R · K", t("a11y.key.row")],
    ["B", t("a11y.key.board")],
    [", .", t("a11y.key.step")],
  ];
}

/** App-wide keys (menus and radio groups, text size). */
export function a11yKeyRows(mod = "Ctrl+") {
  return [
    ["↑ ↓ ← →", t("a11y.key.menus")],
    [`${mod}=  ${mod}−`, t("a11y.key.text")],
  ];
}
