/**
 * Strings of Play (docs/v9.md, "Two spaces"): its home, the suggested
 * game and your level. messages.js merges every area file into MESSAGES.
 */
import { m } from "./m.js";

export const PLAY = {
  // Before the first move: one quiet line; the link opens the keyboard shortcuts.
  "play.firstMove": m("点击棋盘落子。", "Click the board to play.", "바둑판을 눌러 돌을 놓으세요.", "盤をクリックして打ちます。"),
  "play.keys": m("快捷键", "Keyboard shortcuts", "단축키", "ショートカット"),
  "play.suggest.title": m("推荐一盘", "Suggested game", "추천 대국", "おすすめの対局"),
  "play.suggest.game": m("{0} 路 · 对 {1}", "{0}×{0} vs {1}", "{0}줄 · 상대 {1}", "{0}路 · 相手 {1}"),
  "play.suggest.handicap": m("让 {0} 子", "{0} handicap stones", "{0}점 접바둑", "{0}子局"),
  "play.suggest.even": m("分先", "Even game", "호선", "互先"),
  "play.suggest.because": m("练练本周重点：{0}", "works on this week's focus: {0}", "이번 주 집중 연습: {0}", "今週の重点の練習：{0}"),
  "play.suggest.level": m("按你现在的棋力", "matched to your current level", "현재 기력에 맞춤", "今の棋力に合わせて"),
  "play.suggest.play": m("开始对局", "Play", "대국 시작", "対局を始める"),
  "play.suggest.quick9": m("来盘 9 路快棋", "Or a quick 9×9", "9줄 속기 한 판", "9路で早碁を一局"),
  "play.home.level": m("你的棋力", "Your level", "나의 기력", "あなたの棋力"),
  "play.home.levelGames": m("根据 {0} 盘对局估计", "estimated from {0} games", "대국 {0}판으로 추정", "{0}局の対局から推定"),
};
