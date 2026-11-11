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
  "placement.skip": m("暂不", "Not now", "나중에", "あとで"),
  "placement.of": m("水平测试 · 第 {0} / {1} 题", "Placement · {0} of {1}", "실력 테스트 · {0}/{1}", "レベル測定 · {0}/{1}"),
  "placement.done": m("测试完成。从{0}开始（{1}）。", "Done. You start at {0} ({1}).", "완료했습니다. {0}부터 시작합니다 ({1}).", "完了です。{0}から始めます（{1}）。"),
  "learn.path.title": m("今天学什么", "Your path today", "오늘의 학습", "今日の学習"),
  "learn.path.next": m("下一课", "Next lesson", "다음 강", "次の課"),
  "learn.path.review": m("到期复习", "Due for review", "복습할 차례", "復習の時期"),
  "learn.path.stretch": m("挑战一下", "A step up", "한 단계 위", "一段上"),
  "learn.path.new": m("适合你水平的新题", "New at your level", "내 수준에 맞는 새 문제", "今のレベルに合う新しい問題"),
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
  "learn.backHome": m("回到练习", "Back to Practice", "연습으로", "練習に戻る"),
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
  // Difficulty: five levels, each with the ranks it is meant for (approximate, so marked ≈).
  "grade.range": m("难度 {0}–{1}", "Level {0}–{1}", "난이도 {0}–{1}", "難易度 {0}–{1}"),
  "grade.band": m("约 {0}–{1} 级", "≈ {0}–{1} kyu", "약 {0}–{1}급", "約{0}–{1}級"),
  "grade.bandTop": m("约 {0} 级及以上", "≈ {0} kyu and stronger", "약 {0}급 이상", "約{0}級以上"),
  // The path: rows of one theme, the review load, the day's size.
  "learn.path.group": m("{0} · {1}", "{0} · {1}", "{0} · {1}", "{0} · {1}"),
  "learn.path.problems": m("{0} 题", "{0} problems", "{0}문제", "{0}問"),
  "learn.path.problems.one": m("{0} 题", "{0} problem", "{0}문제", "{0}問"),
  "learn.path.focusShort": m("本周重点", "This week's focus", "이번 주 집중", "今週の重点"),
  "learn.load.due": m("今天复习 {0} 题", "{0} to review today", "오늘 복습 {0}문제", "今日の復習 {0}問"),
  "learn.load.mastered": m("已掌握 {0} 题", "{0} mastered", "{0}문제 익힘", "習得 {0}問"),
  "learn.daily.label": m("每天题量", "Problems a day", "하루 문제 수", "1日の問題数"),
  // A topic: the state of each problem on its tile.
  "practice.problemN": m("第 {0} 题", "Problem {0}", "{0}번 문제", "第{0}問"),
  "practice.status.new": m("还没做过", "Not tried yet", "아직 풀지 않음", "未挑戦"),
  "practice.status.tried": m("做过，还没解出", "Tried, not solved yet", "시도했지만 아직 못 풂", "挑戦済み、まだ未正解"),
  "practice.status.solved": m("已解出", "Solved", "해결", "正解済み"),
  "practice.status.clean": m("第一次就解出", "Solved at first sight", "처음에 바로 해결", "初見で正解"),
  "practice.status.due": m("该复习了", "Due for review", "복습할 차례", "復習の時期"),
  "practice.status.mastered": m("已掌握", "Mastered", "익힘", "習得済み"),
  // A problem's result: its name once it may be said, and when a miss comes back.
  "practice.thisProblem": m("这一题", "This problem", "이 문제", "この問題"),
  "practice.recordClean": m("第一次就解出", "Solved at first sight", "처음에 바로 해결", "初見で正解"),
  "practice.backTomorrow": m("明天会再出现。", "It comes back tomorrow.", "내일 다시 나옵니다.", "明日また出題されます。"),
  "practice.backInDays": m("大约 {0} 天后会再出现。", "It comes back in about {0} days.", "약 {0}일 뒤에 다시 나옵니다.", "約{0}日後にまた出題されます。"),
  // Today: progress, kept calm.
  "progress.title": m("你的进步", "Your progress", "나의 발전", "あなたの歩み"),
  "progress.up": m("升了约 {0} 级", "up about {0} ranks", "약 {0}급 상승", "約{0}級アップ"),
  "progress.up.one": m("升了约 {0} 级", "up about {0} rank", "약 {0}급 상승", "約{0}級アップ"),
  "progress.down": m("降了约 {0} 级", "down about {0} ranks", "약 {0}급 하락", "約{0}級ダウン"),
  "progress.down.one": m("降了约 {0} 级", "down about {0} rank", "약 {0}급 하락", "約{0}級ダウン"),
  "progress.same": m("大致持平", "about the same", "거의 그대로", "ほぼ横ばい"),
  "progress.overDays": m("{1} 天里{0}", "{0} over {1} days", "{1}일 동안 {0}", "{1}日間で{0}"),
  "progress.overGames": m("最近 {1} 盘里{0}", "{0} over your last {1} games", "최근 {1}판 동안 {0}", "最近の{1}局で{0}"),
  "progress.sparkLabel": m("{0}，{1}", "{0}, {1}", "{0}, {1}", "{0}、{1}"),
  "progress.mastered": m("已掌握 {0} 题", "Mastered {0} problems", "{0}문제를 익혔습니다", "{0}問を習得"),
  "progress.mastered.one": m("已掌握 {0} 题", "Mastered {0} problem", "{0}문제를 익혔습니다", "{0}問を習得"),
  "progress.masteredNone": m("还没有掌握的题", "Nothing mastered yet", "아직 익힌 문제가 없습니다", "習得した問題はまだありません"),
  "progress.learning": m("{0} 题学习中", "{0} learning", "{0}문제 학습 중", "{0}問を学習中"),
  "progress.unseen": m("{0} 题还没开始", "{0} not started", "{0}문제 시작 전", "{0}問は未着手"),
  "progress.masteryLabel": m("已掌握 {0} 题，学习中 {1} 题，还没开始 {2} 题", "{0} mastered, {1} learning, {2} not started", "익힘 {0}문제, 학습 중 {1}문제, 시작 전 {2}문제", "習得 {0}問、学習中 {1}問、未着手 {2}問"),
  "progress.weeks": m("最近四周", "The last four weeks", "최근 4주", "この4週間"),
  "progress.days": m("有 {0} 天练习过", "Practised on {0} days", "{0}일 연습했습니다", "{0}日練習しました"),
  "progress.days.one": m("有 {0} 天练习过", "Practised on {0} day", "{0}일 연습했습니다", "{0}日練習しました"),
  "progress.milestones": m("最近的里程碑", "Recent milestones", "최근 이정표", "最近の節目"),
  "today.weekOne": m("{0}。", "{0}.", "{0}.", "{0}。"),
  // Milestones: one quiet line when one is reached, and Today's short list.
  "milestone.firstGame": m("下完了第一盘棋", "First game played", "첫 대국을 마쳤습니다", "はじめての対局を終えました"),
  "milestone.first19": m("下完了第一盘 19 路棋", "First 19×19 game played", "첫 19줄 대국을 마쳤습니다", "はじめての19路盤の対局を終えました"),
  "milestone.unit": m("学完一个单元：{0}", "Unit finished: {0}", "단원 완료: {0}", "単元を修了：{0}"),
  "milestone.level": m("做题水平到了{0}", "Solving level reached: {0}", "문제 풀이 수준 도달: {0}", "解答レベルが{0}に到達"),
  "milestone.mastered": m("已掌握 {0} 题", "{0} problems mastered", "{0}문제를 익혔습니다", "{0}問を習得しました"),
};
