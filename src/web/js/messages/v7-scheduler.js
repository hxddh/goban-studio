/**
 * v7 strings: scheduler. Each v7 area keeps its strings in its own file so parallel
 * work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V7_SCHEDULER = {
  // Settings → Opponents and analysis: background work, only while there is some.
  "sched.title": m("后台分析", "Working in the background", "백그라운드 작업", "バックグラウンドの作業"),
  "sched.progress": m("{0} — {1}%", "{0} — {1}%", "{0} — {1}%", "{0} — {1}%"),
  "sched.cancel": m("停止", "Stop", "중지", "停止"),
  "sched.cancelJob": m("停止：{0}", "Stop: {0}", "중지: {0}", "停止：{0}"),
  "sched.job.game": m("正在分析你与电脑（{0}）的对局", "Analysing your game against {0}", "컴퓨터({0})와 둔 대국을 분석하는 중", "コンピュータ（{0}）との対局を解析中"),
  "sched.job.report": m("正在为一盘棋写报告", "Writing a game report", "대국 보고서를 만드는 중", "対局レポートを作成中"),
  "sched.job.review": m("正在复盘这盘棋", "Reviewing the game", "대국을 복기하는 중", "対局を検討中"),
  "sched.job.batch": m("正在分析你的对局（第 {0} 盘，共 {1} 盘）", "Analysing your games — {0} of {1}", "내 대국 분석 중 ({1}판 중 {0}번째)", "あなたの対局を解析中（{1}局中{0}局目）"),
  "sched.batchDone": m("你的对局都已分析完毕。", "All your games are analysed.", "모든 대국의 분석이 끝났습니다.", "すべての対局の解析が終わりました。"),
  // Library: "Analyse all" and the rows it is working on.
  "sched.analyseAll": m("全部分析", "Analyse all", "모두 분석", "すべて解析"),
  "sched.analyseAllHelp": m(
    "在后台为 {0} 盘还没有报告的对局做分析",
    "Make reports for {0} games that have none, in the background",
    "보고서가 없는 대국 {0}판을 백그라운드에서 분석합니다",
    "レポートのない {0} 局をバックグラウンドで解析します",
  ),
  "sched.stopAnalysing": m("停止分析", "Stop analysing", "분석 중지", "解析を停止"),
  "sched.row.queued": m("等待分析", "Waiting to be analysed", "분석 대기 중", "解析待ち"),
  "sched.row.progress": m("正在分析… {0}%", "Analysing… {0}%", "분석 중… {0}%", "解析中… {0}%"),
  // Report: the rating change of the game, and a stopped analysis.
  "sched.report.rating": m("棋力 {0} → {1}（±{2}）", "Strength {0} → {1} (±{2})", "기력 {0} → {1} (±{2})", "棋力 {0} → {1}（±{2}）"),
  "sched.report.ratingSame": m("棋力 {0}（±{1}），没有变化", "Strength {0} (±{1}), unchanged", "기력 {0} (±{1}), 변동 없음", "棋力 {0}（±{1}）、変わらず"),
  "sched.report.stopped": m("分析已停止。", "The analysis was stopped.", "분석이 중지되었습니다.", "解析は停止されました。"),
  "sched.report.retry": m("继续分析", "Continue analysis", "분석 계속하기", "解析を続ける"),
};
