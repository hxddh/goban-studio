/**
 * v7 strings: scheduler. Each v7 area keeps its strings in its own file so parallel
 * work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V7_SCHEDULER = {
  // Background analyses (play/analysis.js), as a job names them.
  "sched.progress": m("{0} — {1}%", "{0} — {1}%", "{0} — {1}%", "{0} — {1}%"),
  "sched.job.game": m("正在分析你与电脑（{0}）的对局", "Analysing your game against {0}", "컴퓨터({0})와 둔 대국을 분석하는 중", "コンピュータ（{0}）との対局を解析中"),
  "sched.job.report": m("正在分析一盘棋", "Analysing a game", "대국을 분석하는 중", "対局を解析中"),
  "sched.job.review": m("正在复盘这盘棋", "Reviewing the game", "대국을 복기하는 중", "対局を検討中"),
  "sched.job.batch": m("正在分析你的对局（第 {0} 盘，共 {1} 盘）", "Analysing your games — {0} of {1}", "내 대국 분석 중 ({1}판 중 {0}번째)", "あなたの対局を解析中（{1}局中{0}局目）"),
  // Play's history: the row being analysed.
  "sched.row.progress": m("正在分析… {0}%", "Analysing… {0}%", "분석 중… {0}%", "解析中… {0}%"),
  // The post-game review: the change of the strength estimate.
  "sched.report.rating": m("棋力 {0} → {1}（±{2}）", "Strength {0} → {1} (±{2})", "기력 {0} → {1} (±{2})", "棋力 {0} → {1}（±{2}）"),
  "sched.report.ratingSame": m("棋力 {0}（±{1}），没有变化", "Strength {0} (±{1}), unchanged", "기력 {0} (±{1}), 변동 없음", "棋力 {0}（±{1}）、変わらず"),
};
