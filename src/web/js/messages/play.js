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
  // Play's suggested game, the other board as a quiet link: {0} is 9 or 19.
  "play.suggest.other": m("或者下一盘 {0} 路", "Or a {0}×{0} game", "또는 {0}줄 한 판", "または{0}路で一局"),
  "play.home.level": m("你的棋力", "Your level", "나의 기력", "あなたの棋力"),
  "play.home.levelGames": m("根据 {0} 盘对局估计", "estimated from {0} games", "대국 {0}판으로 추정", "{0}局の対局から推定"),
  "gameSummary.practise": m("练这类题 →", "Practise these →", "이 유형 연습하기 →", "この形を練習 →"),
  "play.home.allClassics": m("全部 {0} 局名局", "All {0} classics", "명국 {0}판 모두 보기", "名局 {0} 局をすべて表示"),
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
  // About this book: {0} positions, {1} the network, {2} visits per position, {3} KataGo's version, {4} the date it was made.
  "explorer.aboutBuild": m(
    "共 {0} 个局面。网络：{1}；每个局面 {2} 次访问；KataGo {3}；生成于 {4}。",
    "{0} positions. Network: {1}; {2} visits per position; KataGo {3}; made {4}.",
    "모두 {0}개 국면. 네트워크: {1}; 국면마다 {2}회 탐색; KataGo {3}; {4} 생성.",
    "全{0}局面。ネットワーク：{1}、局面ごとに{2}回の探索、KataGo {3}、{4}作成。",
  ),
  // Corner joseki: the board zooms to the upper-right corner; the toggle shows the whole board.
  "explorer.zoomCorner": m("放大右上角", "Zoom to the corner", "우상귀 확대", "右上隅を拡大"),
  "explorer.zoomWhole": m("显示整个棋盘", "Show the whole board", "판 전체 보기", "盤全体を表示"),

  // Named lines (v7), whole board.
  "explorer.name.whole.san-san": m("三三", "3-3 point", "삼삼", "三々"),
  "explorer.name.whole.high-chinese": m("高中国流", "High Chinese opening", "높은 중국류", "高い中国流"),
  "explorer.name.whole.komoku-star": m("小目·星位", "3-4 point and star point", "소목·화점", "小目・星"),
  "explorer.name.whole.star-early-33": m("早点三三", "Early 3-3 invasion", "이른 삼삼 침입", "早い三々入り"),
  // Named lines (v7), corner joseki.
  "explorer.name.corner.star-knight-response": m("星位·小飞挂·小飞应", "Star point, knight's move response", "화점 날일자 걸침·날일자 받기", "星・小ゲイマガカリ・小ゲイマ受け"),
  "explorer.name.corner.star-attach": m("星位·小飞挂·托", "Star point, attachment against the approach", "화점 날일자 걸침·붙임", "星・小ゲイマガカリ・ツケ"),
  "explorer.name.corner.star-one-space-low-pincer": m("星位·一间低夹", "Star point, one-space low pincer", "화점 한 칸 낮은 협공", "星・一間挟み"),
  "explorer.name.corner.star-one-space-high-pincer": m("星位·一间高夹", "Star point, one-space high pincer", "화점 한 칸 높은 협공", "星・一間高挟み"),
  "explorer.name.corner.star-two-space-low-pincer": m("星位·二间低夹", "Star point, two-space low pincer", "화점 두 칸 낮은 협공", "星・二間挟み"),
  "explorer.name.corner.star-pincer-33": m("星位·夹击后点三三", "Star point, 3-3 invasion after the pincer", "화점 협공 후 삼삼 침입", "星・挟みに三々入り"),
  "explorer.name.corner.star-33-block": m("星位·点三三·挡", "Star point, 3-3 invasion, block", "화점 삼삼 침입·막기", "星・三々入り・オサエ"),
  "explorer.name.corner.star-33-hane": m("星位·点三三·扳", "Star point, 3-3 invasion, hane", "화점 삼삼 침입·젖힘", "星・三々入り・ハネ"),
  "explorer.name.corner.star-33-joseki": m("点三三定式", "3-3 invasion joseki", "삼삼 침입 정석", "三々入りの定石"),
  "explorer.name.corner.komoku-attach-draw-back": m("小目·小飞挂·托退", "3-4 point, attach and draw back", "소목 붙여 물러서기", "小目・ツケヒキ"),
  "explorer.name.corner.komoku-high-approach-attach": m("小目·一间高挂·托", "3-4 point, high approach, attachment underneath", "소목 한 칸 높은 걸침·밑붙임", "小目・一間高ガカリ・下ツケ"),
  // The report's phase table, named for screen readers: {0} is Black or White.
  "report.phasesOf": m("{0}的三个阶段", "The three phases for {0}", "{0}의 세 단계", "{0}の三つの局面"),
  // A game between two people: whose mistakes become drills.
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
  "teach.bodyWhy": m("这一手可能损失约 {0} 目——{1}。", "This move may cost about {0} points — {1}.", "이 수는 약 {0}집 손해일 수 있습니다. {1}", "この手は約{0}目損かもしれません。{1}"),
  "play.hintWhy": m("可以考虑 {0}——{1}。", "Consider {0} — {1}.", "{0} 자리를 생각해 보세요. {1}", "{0}を考えてみましょう。{1}"),

  // Why the move may cost points (the punishing line, or where the points went).
  "why.warn.selfAtari": m("{0}棋马上可以把它提掉", "{0} can capture it at once", "{0}이 바로 따낼 수 있습니다.", "{0}にすぐ取られます。"),
  "why.warn.ladder": m("{0}棋可以征子吃掉你的棋子", "{0} can catch your stones in a ladder", "{0}이 축으로 내 돌을 잡을 수 있습니다.", "{0}にシチョウで取られます。"),
  "why.warn.snapback": m("{0}棋有倒扑", "{0} has a snapback", "{0}에게 환격이 있습니다.", "{0}にウッテガエシがあります。"),
  "why.warn.doubleAtari": m("{0}棋可以双打吃", "{0} can answer with a double atari", "{0}이 양단수를 칠 수 있습니다.", "{0}に両アタリを打たれます。"),
  "why.warn.ko": m("这里的战斗会变成劫争", "the fight here turns into a ko", "이곳 싸움이 패가 됩니다.", "ここの戦いがコウになります。"),
  "why.warn.race": m("{0} 的对杀你会输", "you lose the capturing race at {0}", "{0}의 수상전에서 집니다.", "{0}の攻め合いに負けます。"),
  "why.warn.captured": m("{0}棋可以吃掉你在 {1} 的棋子", "{0} can capture your stones at {1}", "{0}이 {1}의 내 돌을 잡을 수 있습니다.", "{1}のあなたの石が{0}に取られます。"),
  "why.warn.noEyes": m("你在 {0} 的棋做不出两只眼了", "your group at {0} can no longer make two eyes", "{0}의 내 돌은 이제 두 눈을 만들 수 없습니다.", "{0}のあなたの石はもう二眼を作れません。"),
  "why.warn.escapes": m("{1} 的{0}棋得以脱险", "{0}'s stones at {1} get away", "{1}의 {0} 돌이 살아납니다.", "{1}の{0}石が助かります。"),
  "why.warn.cut": m("{0}棋可以在 {1} 切断", "{0} can cut at {1}", "{0}이 {1}에서 끊을 수 있습니다.", "{0}に{1}で切られます。"),
  "why.warn.slow": m("这里已经定型，别处还有更大的地方", "this area is already settled, and there is more to gain elsewhere", "이곳은 이미 정리되었고, 다른 곳이 더 큽니다.", "ここはもう決まっています。他にもっと大きい所があります。"),

  // Why the hinted move is good (what the move itself does).
  "why.hint.capture1": m("可以提掉一子", "it captures a stone", "한 점을 따냅니다.", "一子を取れます。"),
  "why.hint.capture": m("可以提掉 {0} 子", "it captures {0} stones", "{0}점을 따냅니다.", "{0}子を取れます。"),
  "why.hint.doubleAtari": m("这是双打吃", "it is a double atari", "양단수입니다.", "両アタリです。"),
  "why.hint.ladder": m("可以征子吃住", "it catches the stones in a ladder", "축으로 잡을 수 있습니다.", "シチョウで取れます。"),
  "why.hint.escape": m("让被打吃的棋子长出来", "it saves your stones in atari", "단수당한 돌을 살려 나옵니다.", "アタリの石が逃げ出せます。"),
  "why.hint.secondEye": m("做出第二只眼，活了", "it makes the second eye and lives", "두 번째 눈을 만들어 삽니다.", "二つ目の眼を作って生きます。"),
  "why.hint.removeEye": m("破掉{0}棋的眼", "it takes away {0}'s eye", "{0}의 눈을 없앱니다.", "{0}の眼を奪います。"),
  "why.hint.connect": m("把你的棋子连起来", "it connects your stones", "내 돌을 이어 줍니다.", "あなたの石をつなぎます。"),
  "why.hint.cut": m("把{0}棋分断", "it cuts {0} apart", "{0} 돌을 끊어 놓습니다.", "{0}を切り離します。"),
  "why.hint.atari": m("可以打吃", "it puts stones in atari", "상대 돌을 단수로 몹니다.", "相手の石をアタリにします。"),
  "why.hint.corner": m("占据空角", "it takes an empty corner", "빈 귀를 차지합니다.", "空き隅を占めます。"),
};
