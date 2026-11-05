/**
 * v8 strings: teaching reasons in warnings and hints. Each v8 area keeps its strings in its own file so
 * parallel work never edits the same lines; messages.js merges them into MESSAGES.
 *
 * The warning and the hint add one plain reason (app/teach-why.js). In Chinese and English the reason
 * is a clause after a dash; in Korean and Japanese it is its own sentence. {0} in a reason is the
 * opponent's colour (common.black / common.white) or a point; {1} a point.
 */
import { m } from "./m.js";

export const V8_TEACHING = {
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
