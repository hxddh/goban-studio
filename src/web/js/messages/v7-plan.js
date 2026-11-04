/**
 * v7 strings: plan. Each v7 area keeps its strings in its own file so parallel
 * work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V7_PLAN = {
  "plan.title": m("本周重点", "This week's focus", "이번 주 집중 연습", "今週の重点"),
  "plan.why.points": m("最近 {1} 局在这里损失约 {0} 目", "Lost ≈{0} points here in your last {1} games", "최근 {1}판에서 약 {0}집 손해", "最近の{1}局で約{0}目の損"),
  "plan.why.times": m("最近 {1} 局出现 {0} 次", "Came up {0} times in your last {1} games", "최근 {1}판에서 {0}번 나옴", "最近の{1}局で{0}回"),
  "plan.why.lateGame": m("官子阶段每局约损失 {0} 目（最近 {1} 局）", "Lost ≈{0} points a game in the endgame (last {1} games)", "끝내기에서 판마다 약 {0}집 손해 (최근 {1}판)", "ヨセで1局あたり約{0}目の損（最近{1}局）"),
  "plan.why.problems": m("最近 {1} 道题错了 {0} 道", "Missed {0} of {1} recent problems", "최근 {1}문제 중 {0}문제를 놓침", "最近の{1}問中{0}問を間違えた"),
  "plan.notEnough": m("对局还不够多，暂时定不出重点。", "Not enough games yet to choose a focus.", "아직 대국이 적어 집중할 점을 정하지 못했어요.", "まだ対局が少なく、重点は決められません。"),
  "plan.lesson": m("看课程", "Lesson", "강의 보기", "レッスン"),
  "plan.mark": m("重点", "Focus", "집중", "重点"),
  "plan.daily": m("含本周重点：{0}", "Includes this week's focus: {0}", "이번 주 집중 포함: {0}", "今週の重点を含む：{0}"),
  "plan.focusOf": m("本周重点：{0}", "This week's focus: {0}", "이번 주 집중: {0}", "今週の重点：{0}"),
};
