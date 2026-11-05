/**
 * v8 strings: simplification of the interface. Each v8 area keeps its strings in its own file so
 * parallel work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V8_SIMPLIFY = {
  // Play, before the first move: one quiet line; the link opens the keyboard shortcuts.
  "play.firstMove": m("点击棋盘落子。", "Click the board to play.", "바둑판을 눌러 돌을 놓으세요.", "盤をクリックして打ちます。"),
  "play.keys": m("快捷键", "Keyboard shortcuts", "단축키", "ショートカット"),
};
