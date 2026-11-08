/**
 * v13 strings of the interface layer: the computer's move when the engine
 * fails, plural forms of counts (i18n.js tn), and the label-and-value
 * templates that give CJK its own punctuation. messages.js merges every
 * area file into MESSAGES.
 */
import { m } from "./m.js";

export const UI13 = {
  // The computer could not move (app/play-ctl.js computerFailed, play.jsx).
  "v13ui.engineFailed": m(
    "电脑这一手没能走出来。",
    "The computer couldn't make its move.",
    "컴퓨터가 수를 두지 못했습니다.",
    "コンピューターが着手できませんでした。",
  ),
  "v13ui.retryMove": m("重试", "Retry", "다시 시도", "再試行"),

  // Plural forms (i18n.js tn): the base key is the "other" form; only
  // English has a separate "one". The other languages repeat the base
  // string (they never pick "one"), so the review sheet shows a full row.
  "play.moveN.one": m("{0} 手", "{0} move", "{0}수", "{0}手"),
  "play.home.levelGames.one": m("根据 {0} 盘对局估计", "estimated from {0} game", "대국 {0}판으로 추정", "{0}局の対局から推定"),
  "backup.confirmFiles.one": m(
    "备份里有 {0} 盘对局，共 {1} 个文件。现在的数据会被全部替换。",
    "The backup holds {0} game in {1} files. Everything you have now will be replaced.",
    "백업에는 대국 {0}판, 파일 {1}개가 있습니다. 지금의 데이터는 모두 바뀝니다.",
    "バックアップには対局 {0} 局、{1} 個のファイルがあります。今のデータはすべて置き換わります。",
  ),
  "practice.recordSolved.one": m("已解出 · 尝试 {0} 次", "Solved · {0} try", "해결 · {0}번 시도", "正解済み · {0} 回"),
  "practice.recordTried.one": m("尝试 {0} 次，还没解出", "{0} try, not solved yet", "{0}번 시도, 아직 못 풂", "{0} 回挑戦、まだ未正解"),
  "report.lost.one": m("约损 {0} 目", "≈ {0} point lost", "약 {0}집 손해", "約{0}目の損"),
  "review.lossN.one": m("约损 {0} 目", "−{0} pt", "약 {0}집 손해", "約{0}目損"),
  "explorer.inBookAll.one": m("第一手在布局库中", "The first move is in the opening book", "첫 수는 포석 책에 있음", "最初の一手は布石集にあります"),
  "learn.why.times.one": m("最近 {1} 局出现 1 次", "Came up once in your last {1} games", "최근 {1}판에서 한 번 나옴", "最近の{1}局で1回"),

  // Today's week line, one count at a time (each with its plural form).
  "v13ui.week.games": m("下了 {0} 盘棋", "{0} games played", "대국 {0}판", "対局 {0} 局"),
  "v13ui.week.games.one": m("下了 {0} 盘棋", "{0} game played", "대국 {0}판", "対局 {0} 局"),
  "v13ui.week.problems": m("做对 {0} 道题", "{0} problems solved", "문제 {0}개 해결", "正解 {0} 問"),
  "v13ui.week.problems.one": m("做对 {0} 道题", "{0} problem solved", "문제 {0}개 해결", "正解 {0} 問"),
  "v13ui.week.line": m("{0}，{1}。", "{0}, {1}.", "{0}, {1}.", "{0}、{1}。"),

  // A label and its value, with each language's own colon (CJK full-width, no space).
  "v13ui.labelValue": m("{0}：{1}", "{0}: {1}", "{0}: {1}", "{0}：{1}"),
  "v13ui.label": m("{0}：", "{0}: ", "{0}: ", "{0}："),
};
