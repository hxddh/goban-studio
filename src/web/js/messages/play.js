/**
 * Strings of Play (docs/v9.md, "Two spaces"): its home, the suggested
 * game and your level, and trying a key moment of the post-game review
 * again. messages.js merges every area file into MESSAGES.
 */
import { m } from "./m.js";

export const PLAY = {
  // Before the first move: one quiet line; the link opens the keyboard shortcuts.
  "play.firstMove": m("点击棋盘落子。", "Click the board to play.", "바둑판을 눌러 돌을 놓으세요.", "盤をクリックして打ちます。"),
  "play.keys": m("快捷键", "Keyboard shortcuts", "단축키", "ショートカット"),
  "play.suggest.title": m("推荐一盘", "Suggested game", "추천 대국", "おすすめの対局"),
  "play.suggest.game": m("{0} 路 · 对 {1}", "{0}×{0} vs {1}", "{0}줄 · 상대 {1}", "{0}路 · 相手 {1}"),
  "play.suggest.handicap": m("让 {0} 子", "{0} handicap stones", "{0}점 접바둑", "{0}子局"),
  "play.suggest.even": m("分先", "Even game", "호선", "互先"),
  "play.suggest.because": m("练练本周重点：{0}", "works on this week's focus: {0}", "이번 주 집중 연습: {0}", "今週の重点の練習：{0}"),
  "play.suggest.level": m("按你现在的棋力", "matched to your current level", "현재 기력에 맞춤", "今の棋力に合わせて"),
  "play.suggest.play": m("开始对局", "Play", "대국 시작", "対局を始める"),
  "play.suggest.quick9": m("来盘 9 路快棋", "Or a quick 9×9", "9줄 속기 한 판", "9路で早碁を一局"),
  "play.home.level": m("你的棋力", "Your level", "나의 기력", "あなたの棋力"),
  "play.home.levelGames": m("根据 {0} 盘对局估计", "estimated from {0} games", "대국 {0}판으로 추정", "{0}局の対局から推定"),
  "play.home.showAll": m("显示全部 {0} 盘", "Show all {0}", "전체 {0}판 보기", "全{0}局を表示"),
  "play.home.explorer": m("布局与定式", "Openings and joseki", "포석과 정석", "布石と定石"),

  // Trying a key moment again, on the board, judged by KataGo.
  "try.again": m("再下一次", "Try again", "다시 두기", "打ち直す"),
  "try.title": m("第 {0} 手 · 再下一次", "Move {0}: try again", "{0}수째 · 다시 두기", "{0}手目 · 打ち直し"),
  "try.prompt": m("轮到{0}：在棋盘上找一手更好的棋。", "{0} to play: find a better move on the board.", "{0} 차례: 바둑판에서 더 좋은 수를 찾아보세요.", "{0}番：盤上でより良い手を探してください。"),
  "try.judging": m("KataGo 正在判断这一手…", "KataGo is judging the move…", "KataGo가 이 수를 판단하는 중…", "KataGoがこの手を判定しています…"),
  "try.good": m("好棋！和 KataGo 的最佳一手相差不到 2 目。", "Good move: within 2 points of KataGo's best.", "좋은 수입니다. KataGo의 최선과 2집 이내입니다.", "好手です。KataGoの最善手との差は2目以内です。"),
  "try.bad": m("这手约损 {0} 目，KataGo 认为 {1} 更好。", "This loses about {0} points; KataGo prefers {1}.", "이 수는 약 {0}집 손해입니다. KataGo의 추천은 {1}입니다.", "この手は約{0}目の損です。KataGoは{1}を推します。"),
  "try.next": m("下一个关键时刻", "Next moment", "다음 결정적 순간", "次の勝負どころ"),
  "try.done": m("回到复盘", "Back to the review", "복기로 돌아가기", "検討に戻る"),
  "try.stop": m("不下了", "Stop", "그만두기", "やめる"),
  "review.noTurningPoints": m("粗略估计里看不出明显的转折点。", "The rough estimate shows no clear turning point.", "대략적인 추정으로는 뚜렷한 전환점이 보이지 않습니다.", "大まかな推定では、はっきりした分かれ目は見えません。"),
  "try.noJudge": m("KataGo 没有回应，这一手没有计入。", "KataGo did not answer; this try was not counted.", "KataGo가 응답하지 않아 이번 수는 반영되지 않았습니다.", "KataGoが応答しなかったため、この手は記録されませんでした。"),
};
