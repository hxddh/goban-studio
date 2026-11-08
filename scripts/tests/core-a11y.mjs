/**
 * Core: accessibility — what the board says about points, moves, rows and the turn.
 */
import { test, A11y, BLACK, LANG_IDS, MESSAGES, WHITE, a11yBoard, assert, empty, fs, path, root, setLang, t } from "./helpers.mjs";

await test("a11y: points read their coordinate (no I), stone, group and liberties", () => {
  setLang("en");
  const b = a11yBoard();
  assert.equal(A11y.coordName(8, 0, 9), "J9");
  assert.equal(A11y.coordName(3, 15, 19), "D4");
  assert.equal(A11y.pointText(b, 0, 0), "A9, empty");
  assert.equal(A11y.pointText(b, 3, 3), "D6, black");
  assert.equal(A11y.pointText(b, 3, 3, { detail: true }), "D6, black, group of 2, 5 liberties");
  assert.equal(A11y.pointText(b, 5, 3, { detail: true }), "F6, white, 1 liberty, in atari");
  assert.equal(A11y.pointText(b, 8, 8, { detail: true, last: { x: 8, y: 8, color: WHITE } }), "J1, white, last move, 2 liberties");
  assert.equal(A11y.pointText(b, 0, 0, { marked: true }), "A9, empty, marked");
  assert.deepEqual(A11y.groupAt(b, 4, 3).stones.length, 2);
  assert.equal(A11y.groupAt(b, 0, 0), null);
  setLang("zh");
  assert.equal(A11y.pointText(b, 5, 3, { detail: true }), "F6，白子，只剩 1 口气，被打吃");
  setLang("ja");
  assert.equal(A11y.pointText(b, 3, 3, { detail: true }), "D6、黒石、2子のかたまり、呼吸点 5つ");
  setLang("ko");
  assert.equal(A11y.pointText(b, 0, 0), "A9, 빈 점");
  setLang("en");
});

await test("a11y: moves, captures, passes and the computer's move are announced", () => {
  setLang("en");
  assert.equal(A11y.moveText({ color: BLACK, x: 3, y: 15, size: 19 }), "Black D4");
  assert.equal(A11y.moveText({ color: WHITE, x: 15, y: 3, size: 19, captured: 2 }), "White Q16, captures 2");
  assert.equal(A11y.moveText({ color: WHITE, pass: true }), "White passes");
  assert.equal(A11y.moveText({ color: WHITE, x: 15, y: 3, size: 19, computer: true }), "Computer: White Q16");
  setLang("zh");
  assert.equal(A11y.moveText({ color: BLACK, x: 3, y: 15, size: 19, captured: 1 }), "黑 D4，提 1 子");
  assert.equal(A11y.moveText({ color: BLACK, pass: true }), "黑停一手");
  setLang("ko");
  assert.equal(A11y.moveText({ color: WHITE, x: 15, y: 3, size: 19, computer: true }), "컴퓨터: 백 Q16");
  setLang("ja");
  assert.equal(A11y.moveText({ color: BLACK, x: 3, y: 15, size: 19, captured: 3 }), "黒 D4、3子取る");
  setLang("en");
});

await test("a11y: review steps say the move number and, with analysis, the point loss", () => {
  setLang("en");
  const move = { color: BLACK, x: 3, y: 15 };
  assert.equal(A11y.reviewMoveText({ number: 0 }), "Start of the game");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19 }), "Move 12, Black D4");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: 3.4 }), "Move 12, Black D4, loses about 3.5 points");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: -0.6 }), "Move 12, Black D4, no loss");
  assert.equal(A11y.reviewMoveText({ number: 7, move, size: 19, captured: 1, loss: 0.2 }), "Move 7, Black D4, captures 1, no loss");
  setLang("zh");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: 3 }), "第 12 手，黑 D4，约亏 3 目");
  setLang("ja");
  assert.equal(A11y.reviewMoveText({ number: 12, move, size: 19, loss: 3 }), "12手目、黒 D4、約3目の損");
  setLang("en");
});

await test("a11y: rows, columns and the whole board are read stone by stone", () => {
  setLang("en");
  const b = a11yBoard();
  assert.equal(A11y.rowText(b, 3), "Row 6: black D, E, G; white F");
  assert.equal(A11y.rowText(b, 0), "Row 9: empty");
  assert.equal(A11y.columnText(b, 5), "Column F: black 7; white 6");
  assert.equal(A11y.boardText(b), "Stones: black 4, white 2. Row 7: black F. Row 6: black D, E, G; white F. Row 1: white J");
  // A problem window reads only what is on screen.
  assert.equal(A11y.boardText(b, { view: { x0: 6, y0: 6, x1: 8, y1: 8 } }), "Stones: black 0, white 1. Row 1: white J");
  assert.equal(A11y.boardText(Array.from({ length: 9 }, () => new Array(9).fill(0))), "The board is empty");
  setLang("zh");
  assert.equal(A11y.rowText(b, 3), "第 6 行：黑子 D、E、G；白子 F");
  setLang("ko");
  assert.equal(A11y.rowText(b, 3), "6줄: 흑돌 D, E, G; 백돌 F");
  setLang("en");
});

await test("a11y: turn, captured stones, last move and the board's name", () => {
  setLang("en");
  assert.equal(A11y.turnText(WHITE), "White to play");
  assert.equal(A11y.capturesText(3, 1), "Black has captured 3, White 1");
  assert.equal(A11y.lastMoveText(null, 19), "No moves yet");
  assert.equal(A11y.lastMoveText({ color: BLACK, x: 15, y: 3 }, 19), "Last move: Black Q16");
  assert.equal(A11y.lastMoveText({ color: WHITE, pass: true }, 19), "Last move: White passes");
  assert.equal(A11y.boardName(13), "Go board, 13 by 13");
  setLang("zh");
  assert.equal(A11y.turnText(BLACK), "轮到黑下");
  assert.equal(A11y.boardName(19), "19 路棋盘");
  setLang("en");
});

await test("a11y: every a11y string exists in four languages with the same placeholders", () => {
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith("a11y."));
  assert.ok(keys.length > 40, `only ${keys.length} a11y strings`);
  // v13: a Korean placeholder may carry its particle, {0:은/는} (i18n.js josa).
  const holes = (v) => [...new Set([...v.matchAll(/\{(\d)(?::[^{}]*)?\}/g)].map((m) => m[1]))].sort().join();
  for (const k of keys) for (const lang of LANG_IDS) {
    assert.ok(MESSAGES[k][lang].length, `${k} ${lang}`);
    assert.equal(holes(MESSAGES[k][lang]), holes(MESSAGES[k].en), `${k} ${lang}`);
  }
  // The shortcuts sheet documents the board keys, in every language.
  for (const lang of LANG_IDS) {
    setLang(lang);
    for (const [k, v] of [...A11y.boardKeyRows(), ...A11y.a11yKeyRows()]) assert.ok(k && v && !v.startsWith("a11y."), `${lang}: ${k}`);
  }
  setLang("en");
  const app = fs.readFileSync(path.join(root, "src/web/js/app/announcer.js"), "utf8");
  for (const key of ["i", "m", "t", "c", "r", "k", "b"]) assert.ok(app.includes(`case "${key}":`), `board key ${key}`);
});

await test("a11y: reading a problem board uses the window that is drawn", () => {
  setLang("en");
  const size = 19;
  const board = Array.from({ length: size }, () => new Array(size).fill(0));
  // Stones at K5 and P5 (x 9 and 14); the problem's own view starts at x 13.
  board[14][9] = 1;
  board[14][14] = -1;
  const model = { size, view: { x0: 13, y0: 13, x1: 18, y1: 18 } };
  const w = A11y.shownWindow(model);
  assert.deepEqual(w, { x0: 10, y0: 10, x1: 18, y1: 18 });
  assert.match(A11y.rowText(board, 14, { size, view: w }), /P/);
  assert.equal(A11y.shownWindow({ size, view: null }), null);
  // The whole drawn window is counted, not just the original six columns.
  board[11][10] = 1; // L8: inside the window, outside the view
  const all = A11y.boardText(board, { size, view: w });
  assert.match(all, /black 1, white 1/);
  assert.match(all, /Row 8: black L/);
});
