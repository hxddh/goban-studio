/**
 * A short, always-available rules primer. These are reference cards, not
 * playable lessons; the course and drills stay in lessons.js / tsumego.js.
 */
const L = (zh, en, ko, ja) => ({ zh, en, ko, ja });

export const BASICS = [
  {
    id: "liberties",
    title: L("气与提子", "Liberties and capture", "활로와 따내기", "呼吸点と取り"),
    text: L(
      "棋子上下左右相邻的空点叫气。一块棋没有气时，就被从棋盘上提掉。",
      "Empty points next to a stone are its liberties. A group with no liberties is captured and removed.",
      "돌의 상하좌우 빈 점이 활로입니다. 활로가 없는 돌은 따내어 집니다.",
      "石の上下左右の空点が呼吸点です。呼吸点のない石は取られて盤から除かれます。",
    ),
  },
  {
    id: "atari",
    title: L("打吃与长气", "Atari and extend", "단수와 늘리기", "アタリと延び"),
    text: L(
      "把对方一块棋打到只剩一口气，叫打吃。被叫吃时，长气、连接或反吃都可能脱险。",
      "Reducing a group to one liberty is atari. Extend, connect or capture back to escape.",
      "상대 돌을 활로 하나로 줄이는 것이 단수입니다. 늘리거나 연결하거나 되따내어 벗어납니다.",
      "相手の石を呼吸点一つに減らすのがアタリです。延びる、つなぐ、取り返すことで逃れます。",
    ),
  },
  {
    id: "connect-cut",
    title: L("连接与切断", "Connect and cut", "연결과 끊기", "つなぎと切り"),
    text: L(
      "让自己的棋子连成一块，气更多、更难被吃；占住对方的连接点，就是切断。",
      "Keep your stones connected for more liberties. Take the opponent's connection point to cut.",
      "내 돌을 연결하면 활로가 늘고 잡기 어려워집니다. 상대의 연결점을 차지하면 끊는 것입니다.",
      "自分の石をつなぐと呼吸点が増え、取られにくくなります。相手の接続点を占めるのが切りです。",
    ),
  },
  {
    id: "eyes",
    title: L("眼与活棋", "Eyes and life", "눈과 삶", "眼と生き"),
    text: L(
      "一块棋围出两个互不相连的真眼，就永远不会被提掉。只有一个眼，仍可能被吃。",
      "A group with two independent real eyes cannot be captured. One eye is not enough.",
      "서로 다른 진짜 눈 두 개를 가진 돌은 잡히지 않습니다. 눈 하나로는 부족합니다.",
      "独立した本眼が二つあれば、その石は取られません。眼一つでは足りません。",
    ),
  },
  {
    id: "territory",
    title: L("地、贴目与胜负", "Territory, komi and result", "집, 덤, 승부", "地・コミ・勝敗"),
    text: L(
      "终局时，围住的空点与活棋共同决定胜负。白棋后走，通常由黑棋贴给白棋若干目，叫贴目。",
      "At the end, surrounded empty points and living stones decide the game. White receives komi because Black moves first.",
      "종국에는 둘러싼 빈 점과 살아 있는 돌로 승부를 냅니다. 흑이 먼저 두므로 백에게 덤을 줍니다.",
      "終局では囲った空点と生き石で勝敗を決めます。黒が先に打つため、白にコミを与えます。",
    ),
  },
  {
    id: "ko",
    title: L("劫", "Ko", "패", "コウ"),
    text: L(
      "提掉一子后，对方不能立刻在同一处提回；必须先到别处下一手。这个循环叫劫。",
      "After a capture, the opponent may not recapture immediately; they must play elsewhere first. This is ko.",
      "한 점을 따낸 뒤 상대는 같은 자리에서 곧바로 되따낼 수 없고, 먼저 다른 곳에 두어야 합니다. 이것이 패입니다.",
      "石を取った直後、相手は同じ場所で取り返せません。先に別の場所へ打ちます。これがコウです。",
    ),
  },
  {
    id: "handicap",
    title: L("先后与让子", "Turn order and handicap", "선후와 접바둑", "手番と置き石"),
    text: L(
      "黑棋先走。让子棋中，黑棋先在星位摆上若干子，再由白棋先走，用来拉近强弱差距。",
      "Black moves first. In a handicap game Black places stones on star points, then White moves first.",
      "흑이 먼저 둡니다. 접바둑에서는 흑이 화점에 돌을 놓은 뒤 백이 먼저 두어 실력 차를 줄입니다.",
      "黒が先に打ちます。置き碁では黒が星に石を置き、白から打ち始めて実力差を縮めます。",
    ),
  },
  {
    id: "review",
    title: L("复盘与礼仪", "Review and etiquette", "복기와 예절", "検討と作法"),
    text: L(
      "下完一局，回到关键手重新看一遍，比只下棋进步更快。落子后不要移动对方的棋子。",
      "Reviewing the key moves after a game improves faster than playing alone. Do not move the opponent's stones.",
      "대국 뒤 주요 수를 다시 보는 것이 실력 향상에 좋습니다. 상대의 돌을 함부로 움직이지 마세요.",
      "対局後に重要な手を振り返ると上達が早くなります。相手の石を勝手に動かさないようにします。",
    ),
  },
];
