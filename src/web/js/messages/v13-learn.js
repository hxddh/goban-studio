/**
 * v13 strings of Learn's calibration: the placement quiz's length, review
 * shown turned or recoloured, confirming moves in problems, and the second
 * reading of your strength from your own moves (human-style model).
 * messages.js merges every area file into MESSAGES.
 */
import { m } from "./m.js";

export const V13_LEARN = {
  "placement.leadRange": m(
    "{0}–{1} 道题，约 5 分钟。根据结果安排课程从哪里开始、先做哪些题。",
    "{0}–{1} problems, about 5 minutes. The result sets where the course starts and which problems come first.",
    "{0}–{1}문제, 약 5분. 결과에 따라 강좌의 시작점과 먼저 풀 문제가 정해집니다.",
    "{0}〜{1}問、約5分。結果に合わせて、講座の始まりと最初に解く問題が決まります。",
  ),
  "practice.turned": m(
    "复习：棋盘转了方向或换了颜色，要点不变。",
    "Review: the board is turned or the colours swapped. The idea is the same.",
    "복습: 판의 방향이나 돌 색을 바꿨습니다. 요점은 같습니다.",
    "復習：盤の向きや石の色を変えています。狙いは同じです。",
  ),
  "settings.confirmProblemMove": m("做题时点两次落子", "Confirm moves in problems", "문제에서 두 번 눌러 착수", "問題では2回クリックで着手"),
  "settings.confirmProblemMoveHelp": m(
    "第一次点击只显示棋子，再点同一个点才算落子，避免误点被算作答错。",
    "The first click only shows the stone; clicking the same point again plays it, so a slip is not counted as a miss.",
    "처음 누르면 돌만 보이고, 같은 곳을 한 번 더 눌러야 둡니다. 잘못 눌러서 틀린 것으로 기록되지 않습니다.",
    "1回目のクリックでは石を表示するだけで、同じ点をもう一度クリックすると着手します。誤クリックが不正解として記録されません。",
  ),
  "review.moveRank": m("你的落子看起来像 ≈ {0}（{1} 到 {2}）", "Your moves look like ≈ {0} ({1} to {2})", "착수는 ≈ {0} 정도로 보입니다 ({1}~{2})", "あなたの着手は ≈ {0} 程度に見えます（{1}〜{2}）"),
  "review.moveRankHelp": m(
    "依据人类风格模型：在各个段级位下，你每一手棋出现的可能性。只是粗略参考，不是你的等级分。",
    "From the human-style model: how likely each of your moves is for players of each rank. A rough guide, not your rating.",
    "인간형 모델로 각 급·단에서 여러분의 수가 나올 가능성을 비교했습니다. 대략적인 참고일 뿐 기력 평가는 아닙니다.",
    "人間らしいモデルで、各段級位ごとにあなたの一手一手が打たれる確率を比べました。おおまかな目安で、棋力の評価ではありません。",
  ),
};
