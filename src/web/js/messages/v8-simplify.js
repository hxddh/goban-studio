/**
 * v8 strings: simplification of the interface. Each v8 area keeps its strings in its own file so
 * parallel work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V8_SIMPLIFY = {
  // Play, before the first move: one quiet line; the link opens the keyboard shortcuts.
  "play.firstMove": m("点击棋盘落子。", "Click the board to play.", "바둑판을 눌러 돌을 놓으세요.", "盤をクリックして打ちます。"),
  // Saving a game failed because the app's storage is full.
  "toast.saveFailed": m("没能保存：存储空间已满。可以删掉一些棋谱，或先导出备份。", "Couldn't save: storage is full. Delete some games, or export a backup first.", "저장하지 못했습니다: 저장 공간이 가득 찼습니다. 기보를 일부 지우거나 먼저 백업을 내보내세요.", "保存できませんでした：保存領域がいっぱいです。棋譜をいくつか削除するか、先にバックアップを書き出してください。"),
  "play.keys": m("快捷键", "Keyboard shortcuts", "단축키", "ショートカット"),
};
