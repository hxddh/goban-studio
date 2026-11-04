/**
 * v7 strings: problems. Each v7 area keeps its strings in its own file so parallel
 * work never edits the same lines; messages.js merges them into MESSAGES.
 *
 * Your own problem collections: SGF import, the import report, the
 * collection page (app/collections.jsx, app/collections-ctl.js).
 */
import { m } from "./m.js";

export const V7_PROBLEMS = {
  "v7problems.section": m("我的题集", "Your collections", "내 문제집", "マイ問題集"),
  "v7problems.import": m("导入 SGF 题目", "Import SGF problems", "SGF 문제 가져오기", "SGFの問題を読み込む"),
  "v7problems.importFolder": m("导入文件夹", "Import a folder", "폴더 가져오기", "フォルダを読み込む"),
  "v7problems.empty": m(
    "导入 SGF 死活题文件（单题、合集或多个文件），每道题都先由解题器验证。",
    "Import SGF problem files (one problem, a collection or many files); the solver proves every problem first.",
    "SGF 사활 문제 파일(한 문제, 문제집, 여러 파일)을 가져오세요. 모든 문제를 먼저 해결기가 증명합니다.",
    "SGFの詰碁ファイル（1問、問題集、複数ファイル）を読み込めます。どの問題もまずソルバーが証明します。",
  ),
  "v7problems.count": m("{0} 题", "{0} problems", "{0}문제", "{0}問"),
  "v7problems.problemN": m("第 {0} 题", "Problem {0}", "{0}번 문제", "第{0}問"),
  "v7problems.practise": m("开始练习", "Practise", "연습하기", "練習する"),
  "v7problems.due": m("{0} 题待复习", "{0} due for review", "복습할 문제 {0}개", "復習 {0}問"),
  "v7problems.dueMark": m("待复习", "Due", "복습", "復習"),
  "v7problems.rename": m("重命名题集", "Rename collection", "문제집 이름 바꾸기", "問題集の名前を変更"),
  "v7problems.deleteConfirm": m("删除这个题集？", "Delete this collection?", "이 문제집을 삭제할까요?", "この問題集を削除しますか？"),
  "v7problems.deleteBody": m(
    "题目和你在这些题上的进度都会删除。",
    "Its problems and your progress on them are removed.",
    "문제와 그 문제의 진행 기록이 삭제됩니다.",
    "問題とその進み具合が削除されます。",
  ),
  "v7problems.importing": m("正在验证第 {0} / {1} 题…", "Proving problem {0} of {1}…", "{1}문제 중 {0}번째 증명 중…", "{1}問中{0}問目を証明中…"),
  "v7problems.nothing": m("文件里没有找到 SGF 题目。", "No SGF problems were found in these files.", "파일에서 SGF 문제를 찾지 못했습니다.", "ファイルにSGFの問題が見つかりません。"),
  "v7problems.imported": m("已导入：{0} 题通过验证", "Imported: {0} problems proved", "가져옴: {0}문제 증명됨", "読み込みました：{0}問を証明"),
  "v7problems.report": m("导入报告", "Import report", "가져오기 보고서", "読み込みレポート"),
  "v7problems.summary": m(
    "{0} 题通过 · {1} 题修正了答案 · {2} 题未收录",
    "{0} accepted · {1} with a corrected answer · {2} not accepted",
    "{0}문제 통과 · {1}문제 정답 수정 · {2}문제 제외",
    "{0}問採用 · {1}問は正解を修正 · {2}問は不採用",
  ),
  "v7problems.verdict.accepted": m("已证明", "Proved", "증명됨", "証明済み"),
  "v7problems.verdict.corrected": m("答案已修正", "Answer corrected", "정답 수정", "正解を修正"),
  "v7problems.verdict.rejected": m("未收录", "Not accepted", "제외", "不採用"),
  "v7problems.reason.open": m(
    "太开放，无法证明：棋子没有被围住",
    "Too open to prove: the stones are not sealed in",
    "너무 열려 있어 증명할 수 없음: 돌이 갇혀 있지 않음",
    "広すぎて証明できません：石が囲まれていません",
  ),
  "v7problems.reason.ko": m(
    "最好的结果是劫，需要劫材，但题目没有说是劫",
    "The best result is a ko (it needs ko threats) and the file does not ask for one",
    "최선의 결과가 패(팻감 필요)인데 파일은 패를 묻지 않음",
    "最善の結果がコウ（コウ材が必要）ですが、ファイルはコウを求めていません",
  ),
  "v7problems.reason.unclear": m(
    "目标不明确：几种读法都成立，文件没有说是哪一种",
    "Unclear goal: more than one reading works and the file does not say which",
    "목표가 불분명함: 여러 해석이 성립하고 파일이 어느 것인지 말하지 않음",
    "目的が不明確：複数の読み方が成り立ち、ファイルがどれか示していません",
  ),
  "v7problems.reason.many": m("正解超过三个", "More than three correct first moves", "정답 첫수가 세 개보다 많음", "正解の初手が3つより多い"),
  "v7problems.reason.noAnswer": m("找不到正解", "No correct first move was found", "정답 첫수를 찾지 못함", "正解の初手が見つかりません"),
  "v7problems.reason.settled": m("局面已经有了结论", "The position is already decided", "이미 결론이 난 형태", "すでに決着している形です"),
  "v7problems.reason.disagree": m(
    "文件的答案在解题范围之外，无法确认也无法驳倒",
    "The file's answer is outside the area the solver reads, so it can be neither confirmed nor refuted",
    "파일의 정답이 해결기가 읽는 범위 밖이라 확인도 반박도 할 수 없음",
    "ファイルの正解がソルバーの読む範囲外のため、確認も反証もできません",
  ),
  "v7problems.reason.budget": m("在时间和搜索限制内没有读完", "Not proved within the time and search limits", "시간·탐색 한도 안에 증명하지 못함", "時間と探索の上限内に読み切れませんでした"),
  "v7problems.reason.invalid": m("不是可用的题目（没有黑白双方的棋子，或棋盘过大）", "Not a usable problem (no stones of both colours, or the board is too large)", "쓸 수 있는 문제가 아님(양쪽 돌이 없거나 판이 너무 큼)", "使える問題ではありません（両方の石がないか、盤が大きすぎます）"),
  "v7problems.refuted": m("文件的答案 {0} 被驳倒：{1}", "The file's answer {0} is refuted: {1}", "파일의 정답 {0}은(는) 반박됨: {1}", "ファイルの正解 {0} は反証されました：{1}"),
  "v7problems.alsoRight": m("文件说 {0} 是错的，但它也成立。", "The file marks {0} wrong, but it works too.", "파일은 {0}을(를) 틀렸다고 하지만 이것도 성립합니다.", "ファイルは {0} を失敗としていますが、これも成立します。"),
  "v7problems.answer": m("正解：{0}", "Answer: {0}", "정답: {0}", "正解：{0}"),
  "v7problems.koGoal": m("（劫）", " (ko)", " (패)", "（コウ）"),
  "v7problems.source": m("{0} · 第 {1} 题", "{0} · tree {1}", "{0} · {1}번째", "{0} · {1}番目"),
};
