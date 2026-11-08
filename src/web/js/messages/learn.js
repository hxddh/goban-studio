/**
 * Strings of Learn (docs/v9.md, "Two spaces"): the path chosen for you,
 * today's session, the week's focus and the catalog. messages.js merges
 * every area file into MESSAGES.
 */
import { m } from "./m.js";

export const LEARN = {
  // The path: what each row is, and why it is there.
  "placement.eyebrow": m("开始之前", "Before you start", "시작하기 전에", "はじめる前に"),
  "placement.title": m("先测一测你的水平", "Find your level first", "먼저 실력을 알아보세요", "まずレベルを測りましょう"),
  "placement.start": m("开始测试", "Start", "시작", "はじめる"),
  "placement.skip": m("跳过", "Not now", "건너뛰기", "スキップ"),
  "placement.of": m("水平测试 · 第 {0} / {1} 题", "Placement · {0} of {1}", "실력 테스트 · {0}/{1}", "レベル測定 · {0}/{1}"),
  "placement.done": m("测试完成：你的做题水平是「{0}」", "Done: your solving level is {0}", "완료: 문제 풀이 수준은 {0}입니다", "完了：あなたの解答レベルは「{0}」です"),
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
  // Capture Go (吃子棋): the first capture wins.
  "capture.title": m("吃子棋", "Capture Go", "따먹기 바둑", "石取りゲーム"),
  "capture.goal": m("谁先提掉对方一个子，谁就赢。", "Whoever captures a stone first wins.", "먼저 상대 돌을 하나라도 따내면 이깁니다.", "先に相手の石を1つ取ったほうが勝ちです。"),
  "capture.computer": m("电脑", "Computer", "컴퓨터", "コンピュータ"),
  "capture.won": m("你先提子——你赢了", "You captured first — you win", "먼저 따냈습니다 — 승리", "先に取りました — あなたの勝ち"),
  "capture.lost": m("电脑先提子", "The computer captured first", "컴퓨터가 먼저 따냈습니다", "コンピュータが先に取りました"),
  "capture.noMoveWon": m("电脑无处可下——你赢了", "The computer has no move left — you win", "컴퓨터가 둘 곳이 없습니다 — 승리", "コンピュータに打つ場所がありません — あなたの勝ち"),
  "capture.noMoveLost": m("你无处可下——电脑赢了", "You have no move left — the computer wins", "둘 곳이 없습니다 — 컴퓨터 승리", "打つ場所がありません — コンピュータの勝ち"),
  "capture.play": m("下一盘吃子棋", "Play a game of capture Go", "따먹기 바둑 한 판 두기", "石取りゲームを一局打つ"),
  "capture.invite": m("先提掉一个子就赢，用刚学的打吃试试。", "First to capture a stone wins. Try the ataris you just learned.", "먼저 돌 하나를 따내면 이깁니다. 방금 배운 단수를 써 보세요.", "先に石を1つ取れば勝ち。いま学んだアタリを使ってみましょう。"),
  // The first 9×9 game, after the life basics.
  "firstGame.play": m("下第一盘 9 路棋", "Play your first 9×9 game", "첫 9줄 대국 두기", "はじめての9路盤で打つ"),
  "firstGame.invite": m("对手是最温和的电脑，指导棋模式开着。", "Against the gentlest computer, in teaching mode.", "가장 순한 컴퓨터와 지도 모드로 둡니다.", "いちばんやさしいコンピュータと、指導碁モードで打ちます。"),
  // The first count, once.
  "firstCount.note": m(
    "双方连续停一手，对局就结束了。逃不掉的棋子是死子，要从棋盘上拿掉；点一块棋可以改它的死活。分数比的是双方围住的地，白棋后下，所以另加贴目。",
    "The game ends when both players pass in a row. Stones that cannot escape are dead and come off the board; tap a group to mark it dead or alive. The score compares the points each side surrounds, and White adds komi for playing second.",
    "두 사람이 연달아 패스하면 대국이 끝납니다. 살아날 수 없는 돌은 사석이 되어 판에서 들어내며, 돌 무리를 누르면 사석 여부를 바꿀 수 있습니다. 점수는 양쪽이 둘러싼 집을 비교하고, 백은 나중에 두므로 덤을 더합니다.",
    "二人が続けてパスすると終局です。逃げられない石は死に石で盤から取り除き、石のかたまりをタップすると死活を切り替えられます。点数は双方が囲んだ地を比べ、白は後から打つのでコミを足します。",
  ),
  // Onboarding: "I know the rules" now starts on 9×9.
  "onboarding.rulesHelp": m("在 9 路小棋盘上和一个温和的对手下一盘，开着指导棋模式。", "Play a gentle opponent on the small 9×9 board, in teaching mode.", "작은 9줄 판에서 순한 상대와 지도 모드로 한 판 둡니다.", "小さな9路盤で、やさしい相手と指導碁モードで一局打ちます。"),
};
