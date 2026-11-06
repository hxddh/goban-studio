/**
 * Strings of Learn (docs/v9.md, "Two spaces"): the path chosen for you,
 * today's session, the week's focus and the catalog. messages.js merges
 * every area file into MESSAGES.
 */
import { m } from "./m.js";

export const LEARN = {
  // The path: what each row is, and why it is there.
  "learn.path.title": m("今天学什么", "Your path today", "오늘의 학습", "今日の学習"),
  "learn.path.next": m("下一课", "Next lesson", "다음 강", "次の課"),
  "learn.path.review": m("到期复习", "Due for review", "복습할 차례", "復習の時期"),
  "learn.path.stretch": m("挑战一下", "A step up", "한 단계 위", "一段上"),
  "learn.path.new": m("适合你的水平", "At your level", "내 수준에 맞게", "今のレベルに合わせて"),
  "learn.path.mistake": m("你对局里的一手", "A move from your game", "내 대국의 한 수", "自分の対局の一手"),
  "learn.path.focus": m("本周重点：{0}", "This week's focus: {0}", "이번 주 집중: {0}", "今週の重点：{0}"),
  "learn.path.bridge": m("把刚学的用到对局里", "Put the lesson into a game", "배운 것을 대국에서", "習ったことを対局で"),
  "learn.path.firstGame": m("你的第一盘棋", "Your first game", "첫 대국", "はじめての対局"),
  "learn.path.start": m("开始", "Start", "시작", "始める"),
  "learn.path.resume": m("继续", "Continue", "계속", "続ける"),
  "learn.path.done": m("已完成", "Done", "완료", "完了"),
  "learn.path.doneToday": m("今天的都做完了", "Done for today", "오늘은 여기까지", "今日はここまで"),
  "learn.path.doneLine": m("明天会有新的复习和题目。", "Tomorrow brings new reviews and problems.", "내일 새 복습과 문제가 기다립니다.", "明日はまた新しい復習と問題があります。"),
  // Today's session, one item after another.
  "learn.session.of": m("今天 {0} / {1}", "Today {0} of {1}", "오늘 {0} / {1}", "今日 {0} / {1}"),
  "learn.backHome": m("回到学棋", "Back to Learn", "배우기로", "学ぶに戻る"),
  // The week's focus, in the path's one line, and its lesson.
  "learn.focus.lesson": m("相关课程：{0}", "Lesson: {0}", "관련 강의: {0}", "関連する課：{0}"),
  "learn.why.points": m("最近 {1} 局在这里损失约 {0} 目", "Lost ≈{0} points here in your last {1} games", "최근 {1}판에서 약 {0}집 손해", "最近の{1}局で約{0}目の損"),
  "learn.why.times": m("最近 {1} 局出现 {0} 次", "Came up {0} times in your last {1} games", "최근 {1}판에서 {0}번 나옴", "最近の{1}局で{0}回"),
  "learn.why.lateGame": m("官子阶段每局约损失 {0} 目（最近 {1} 局）", "Lost ≈{0} points a game in the endgame (last {1} games)", "끝내기에서 판마다 약 {0}집 손해 (최근 {1}판)", "ヨセで1局あたり約{0}目の損（最近の{1}局）"),
  "learn.why.problems": m("最近 {1} 道题错了 {0} 道", "Missed {0} of {1} recent problems", "최근 {1}문제 중 {0}문제를 놓침", "最近の{1}問中{0}問を間違えた"),
  // The catalog, for browsing.
  "learn.catalog": m("全部课程和题目", "All lessons and problems", "모든 강의와 문제", "すべての講座と問題"),
};
