/**
 * v8 strings: the beginner path (capture Go, lesson-to-game bridges, the first count). Each v8 area keeps its strings in its own file so
 * parallel work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V8_BEGINNER = {
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
