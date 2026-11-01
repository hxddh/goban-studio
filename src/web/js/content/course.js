/**
 * The beginner course (v2): eight short units of multi-step lessons.
 *
 * A lesson is a list of steps:
 *   read     a short explanation, optionally with an illustrated board
 *   problem  a position the solver in ../solver.js can judge: the learner may
 *            play any move and the computer answers it (a wrong move gets the
 *            real refutation, a right move the most stubborn defence)
 *   place    a single click for ideas the solver cannot judge (the ko rule,
 *            territory, where to play in the opening); `accept` lists every
 *            acceptable point in diagram-local coordinates
 *
 * Diagram notation is the solver's: X/O black/white, x/o key stones, '.'
 * empty (inside the problem region), ',' empty outside the region.
 * Rules are Japanese with 6.5 komi. `scripts/check-course.mjs` proves every
 * problem with the solver and checks every place step.
 */

const L = (zh, en, ko, ja) => ({ zh, en, ko, ja });

const E9 = ". . . . . . . . .";

/** A 9×9 board from a sparse list of rows: { rowIndex: "row string" }. */
function b9(rows = {}) {
  const out = [];
  for (let y = 0; y < 9; y++) out.push(rows[y] ?? E9);
  return { size: 9, diagram: out, corner: "tl" };
}

/** Every empty point of a 9×9 board inside a rectangle (inclusive). */
function area(board, x0, y0, x1, y1) {
  const pts = [];
  for (let y = y0; y <= y1; y++) {
    const row = board.diagram[y].replace(/\s+/g, "");
    for (let x = x0; x <= x1; x++) if (row[x] === ".") pts.push({ x, y });
  }
  return pts;
}

/* ------------------------------------------------------------------ boards */

// Unit 1 boards.
const KO_BASE = {
  2: ". . . . . . . X .",
  3: ". . . . . . X O .",
  5: ". . . X O . . . .",
  6: ". . X O . O . . .",
  7: ". . . X O . . . .",
};
// The ko: White's stone between the black stones has one liberty; Black's
// capture there leaves a lone black stone that White could retake at once.
const KO_FRESH = b9({ ...KO_BASE });
const KO_THREAT_ANSWERED = b9({
  ...KO_BASE,
  3: ". . . . . . X O O",
  4: ". . . . . . . X .",
});
const KO_TAKEN = b9({
  ...KO_BASE,
  3: ". . . . . . X O O",
  4: ". . . . . . . X .",
  6: ". . X . X O . . .",
});

// Unit 8 boards: a finished-looking 9×9 game. Black owns the left, White
// the right. Black 33 points, White 29 points.
const END_ROWS = {
  0: ". . . . X O . . .",
  1: ". . . . X O . . .",
  2: ". . . . X O . . .",
  3: ". . . X O O . . .",
  4: ". . . X O . . . .",
  5: ". . . X O . . . .",
  6: ". . . . X O . . .",
  7: ". . . . X O . . .",
  8: ". . . . X O . . .",
};
const END = b9(END_ROWS);
const END_GAP = b9({ ...END_ROWS, 7: ". . . . . O . . ." });
const END_GAP_WHITE = b9({ ...END_ROWS, 1: ". . . . X . . . ." });
const END_DEAD = b9({ ...END_ROWS, 1: ". O . . X O . . .", 7: ". . . . . O . . ." });
const END_DEAD_BLACK = b9({ ...END_ROWS, 1: ". . . . . O . . .", 5: ". . . X O . . X ." });
const END_PRISONERS = b9({
  ...END_ROWS,
  3: ". . X X O O . . .",
  4: ". X O X O . . . .",
  5: ". X O X O . . . .",
});

const OPEN_EMPTY = b9();
const OPEN_CORNERS = b9({
  2: ". . X . . . O . .",
  6: ". . O . . . X . .",
});
const OPEN_THREE = b9({
  2: ". . X . . . O . .",
  6: ". . . . . . X . .",
});
const OPEN_SIDE = b9({
  2: ". . X . . . X . .",
  6: ". . O . . . O . .",
});

export const COURSE = [
  /* ================================================================ UNIT 1 */
  {
    id: "stones",
    title: L("棋子与气", "Stones and liberties", "돌과 활로", "石と呼吸点"),
    summary: L(
      "从零开始：落子、气、提子，以及禁着点和打劫两条规则。",
      "From zero: placing stones, liberties, capturing, and the two special rules.",
      "처음부터: 돌 놓기, 활로, 따내기, 그리고 착수 금지와 패.",
      "ゼロから：石の置き方、呼吸点、石の取り方、着手禁止とコウ。",
    ),
    lessons: [
      {
        id: "stones-board",
        title: L("棋盘和棋子", "The board and the stones", "바둑판과 돌", "碁盤と石"),
        steps: [
          {
            kind: "read",
            text: L(
              "围棋下在线的交叉点上，不下在格子里。黑棋先下，双方轮流每次放一颗子。棋子放下后就不再移动。",
              "Go is played on the points where the lines cross, not inside the squares. Black plays first, then the players take turns placing one stone. Stones never move once they are placed.",
              "바둑은 칸 안이 아니라 선이 만나는 점 위에 둡니다. 흑이 먼저 두고, 서로 한 수씩 번갈아 돌을 놓습니다. 한 번 놓은 돌은 움직이지 않습니다.",
              "碁は線の交わる点に打ちます。マスの中ではありません。黒が先に打ち、交互に一つずつ石を置きます。置いた石は動きません。",
            ),
            board: b9({ 2: ". . X . . . O . .", 6: ". . O . . . X . ." }),
          },
          {
            kind: "place",
            text: L(
              "试试看：把你的第一颗黑子放在棋盘正中央的点上。",
              "Try it: put your first black stone on the point in the very middle of the board.",
              "직접 해 봅시다. 첫 흑돌을 바둑판 한가운데 점에 놓으세요.",
              "やってみましょう。最初の黒石を碁盤の真ん中の点に置きます。",
            ),
            board: OPEN_EMPTY,
            toMove: 1,
            accept: [{ x: 4, y: 4 }],
            success: L("这就是天元，棋盘的中心。", "That is tengen, the centre point.", "그곳이 천원, 바둑판의 중심입니다.", "そこが天元、碁盤の中心です。"),
            wrong: L(
              "找到上下左右离边都一样远的那个点。",
              "Look for the point that is equally far from all four edges.",
              "네 변에서 똑같이 떨어진 점을 찾아보세요.",
              "四辺から同じだけ離れた点を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "沿着线紧挨在一起的同色棋子连成一块。在你的黑子旁边紧挨着下一颗。",
              "Stones of one colour that touch along a line are joined into one group. Place a stone right next to your black stone.",
              "선을 따라 바로 붙어 있는 같은 색 돌은 한 덩어리가 됩니다. 흑돌 바로 옆에 하나 더 놓으세요.",
              "線に沿って隣り合う同じ色の石はつながって一団になります。黒石のすぐ隣に打ちましょう。",
            ),
            board: b9({ 4: ". . . . X . O . ." }),
            toMove: 1,
            accept: [
              { x: 3, y: 4 },
              { x: 5, y: 4 },
              { x: 4, y: 3 },
              { x: 4, y: 5 },
            ],
            success: L("两颗子连在一起了。", "Now the two stones are one group.", "이제 두 돌은 한 덩어리입니다.", "二つの石がつながりました。"),
            wrong: L(
              "紧挨着是指沿着线走一步，斜对角不算。",
              "Next to means one step along a line; a diagonal step does not count.",
              "바로 옆은 선을 따라 한 칸입니다. 대각선은 붙은 것이 아닙니다.",
              "隣とは線に沿って一歩の点です。斜めは隣ではありません。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这两颗黑子只是斜着相对，还没有连上。下一颗子把它们连起来。",
              "These two black stones only touch diagonally, so they are not joined yet. Join them with one stone.",
              "이 두 흑돌은 대각선으로만 닿아 있어 아직 이어지지 않았습니다. 한 수로 이어 주세요.",
              "この黒二子は斜めに接しているだけで、まだつながっていません。一手でつなぎましょう。",
            ),
            board: b9({ 3: ". . . X . . . . .", 4: ". . . . X . . . .", 6: ". . . . . . O . ." }),
            toMove: 1,
            accept: [
              { x: 4, y: 3 },
              { x: 3, y: 4 },
            ],
            success: L("三颗子连成了一块。", "Three stones, one group.", "세 돌이 한 덩어리가 되었습니다.", "三つの石が一団になりました。"),
            wrong: L(
              "选一个同时紧挨两颗黑子的点。",
              "Choose a point that touches both black stones along a line.",
              "두 흑돌에 모두 선으로 닿는 점을 고르세요.",
              "両方の黒石に線で接する点を選びましょう。",
            ),
          },
        ],
      },
      {
        id: "stones-liberties",
        title: L("气", "Liberties", "활로", "呼吸点"),
        steps: [
          {
            kind: "read",
            text: L(
              "紧挨着棋子的空点叫做“气”。中间的子有四口气，边上的子有三口，角上的子只有两口。",
              "The empty points right next to a stone are its liberties. A stone in the middle has four, a stone on the edge three, and a stone in the corner only two.",
              "돌 바로 옆의 빈 점을 활로라고 합니다. 가운데 돌은 활로가 넷, 변의 돌은 셋, 귀의 돌은 둘뿐입니다.",
              "石のすぐ隣の空いた点を呼吸点（ダメ）と言います。中央の石は四つ、辺の石は三つ、隅の石は二つだけです。",
            ),
            board: {
              ...b9({ 4: ". . . . X . . . .", 8: ". . . . . . . . X" }),
              marks: [
                { x: 3, y: 4, type: "circle" },
                { x: 5, y: 4, type: "circle" },
                { x: 4, y: 3, type: "circle" },
                { x: 4, y: 5, type: "circle" },
                { x: 7, y: 8, type: "circle" },
                { x: 8, y: 7, type: "circle" },
              ],
            },
          },
          {
            kind: "place",
            text: L(
              "下在对方棋子的气上，就能减少它的气。紧贴白子下一颗，拿走它一口气。",
              "Playing on a liberty of an enemy stone takes it away. Play right next to the white stone to take one of its liberties.",
              "상대 돌의 활로에 두면 그 활로가 없어집니다. 백돌 바로 옆에 두어 활로 하나를 빼앗으세요.",
              "相手の石の呼吸点に打つと、その呼吸点がなくなります。白石のすぐ隣に打って呼吸点を一つ減らしましょう。",
            ),
            board: b9({ 4: ". . . . O . . . ." }),
            toMove: 1,
            accept: [
              { x: 3, y: 4 },
              { x: 5, y: 4 },
              { x: 4, y: 3 },
              { x: 4, y: 5 },
            ],
            success: L("白子还剩三口气。", "The white stone has three liberties left.", "백돌의 활로는 이제 셋입니다.", "白石の呼吸点は残り三つです。"),
            wrong: L(
              "气是沿着线紧挨着的点，斜对角的点不是气。",
              "Liberties are the points next to the stone along the lines; diagonal points are not liberties.",
              "활로는 선을 따라 바로 옆의 점입니다. 대각선 점은 활로가 아닙니다.",
              "呼吸点は線に沿った隣の点です。斜めの点は呼吸点ではありません。",
            ),
          },
          {
            kind: "place",
            text: L(
              "边上的白子本来有三口气，黑棋已经占了一口。再拿走一口。",
              "This white stone on the edge started with three liberties and Black has taken one. Take another.",
              "변의 백돌은 원래 활로가 셋인데 흑이 하나를 막았습니다. 하나 더 막으세요.",
              "辺の白石は呼吸点が三つで、黒が一つふさいでいます。もう一つふさぎましょう。",
            ),
            board: b9({ 0: ". . . X O . . . ." }),
            toMove: 1,
            accept: [
              { x: 5, y: 0 },
              { x: 4, y: 1 },
            ],
            success: L(
              "只剩一口气了。只剩一口气的状态叫“打吃”。",
              "One liberty left. A stone with one liberty left is in atari.",
              "활로가 하나 남았습니다. 이 상태를 단수라고 합니다.",
              "呼吸点は残り一つ。この状態をアタリと言います。",
            ),
            wrong: L(
              "数一数白子的空点：边外没有点，所以它只有三口气。",
              "Count the white stone's empty neighbours: there is nothing beyond the edge, so it has only three.",
              "백돌 옆의 빈 점을 세어 보세요. 변 바깥에는 점이 없어서 활로는 셋뿐입니다.",
              "白石の隣の空点を数えましょう。盤の外には点がないので、呼吸点は三つだけです。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "这颗白子只剩最后一口气。下在那里。",
              "This white stone has only one liberty left. Play there.",
              "이 백돌은 활로가 하나뿐입니다. 그곳에 두세요.",
              "この白石は呼吸点が一つだけです。そこに打ちましょう。",
            ),
            problem: { goal: "capture", escape: 2, at: [5, 0], diagram: ["X o X", ". . ."] },
            success: L(
              "没有气的棋子被提走。这就是提子。",
              "A stone with no liberties is removed from the board. That is a capture.",
              "활로가 없는 돌은 판에서 들어냅니다. 이것이 따내기입니다.",
              "呼吸点がなくなった石は盤から取り除かれます。これが石を取ることです。",
            ),
          },
        ],
      },
      {
        id: "stones-capture",
        title: L("提子", "Capturing", "따내기", "石を取る"),
        steps: [
          {
            kind: "read",
            text: L(
              "棋子没有气时就被提掉，从棋盘上拿走，提掉的子要留着，最后计算胜负时有用。图中白子只剩标记的一口气：这叫“打吃”。",
              "When stones lose their last liberty they are captured: lifted off and kept as prisoners. The white stone here has one liberty left, the marked point. It is in atari.",
              "활로를 모두 잃은 돌은 따내어 판에서 들어내고, 따낸 돌은 계가할 때 쓰도록 모아 둡니다. 그림의 백돌은 표시한 활로 하나만 남았습니다. 이것이 단수입니다.",
              "呼吸点を全部失った石は取られ、アゲハマとして取っておきます。図の白石は印の一点しか呼吸点がありません。アタリです。",
            ),
            board: {
              ...b9({ 3: ". . . . X . . . .", 4: ". . . X O X . . ." }),
              marks: [{ x: 4, y: 5, type: "circle" }],
            },
          },
          {
            kind: "problem",
            text: L(
              "白子被三颗黑子围住。提掉它。",
              "Three black stones surround the white stone. Capture it.",
              "흑 세 점이 백돌을 둘러쌌습니다. 따내세요.",
              "黒三子が白石を囲んでいます。取りましょう。",
            ),
            problem: { goal: "capture", escape: 2, at: [3, 3], diagram: [". X .", "X o X", ". . ."] },
            success: L("提掉了。如果不提，白棋长出去就有了更多的气。", "Captured. Had you waited, White would have run out and gained liberties.", "따냈습니다. 미뤘다면 백이 뻗어 나와 활로를 늘렸을 것입니다.", "取りました。放っておくと白は伸びて呼吸点を増やしていました。"),
          },
          {
            kind: "problem",
            text: L(
              "角上的子只有两口气，很容易被提。提掉这颗白子。",
              "A stone in the corner has only two liberties, so it is easy to capture. Capture this one.",
              "귀의 돌은 활로가 둘뿐이라 잡기 쉽습니다. 이 백돌을 따내세요.",
              "隅の石は呼吸点が二つしかなく、取りやすい石です。この白石を取りましょう。",
            ),
            problem: { goal: "capture", escape: 2, corner: "tl", diagram: ["o X .", ". . .", "O . ."] },
            success: L("角上的子最容易被吃。", "Stones in the corner are the easiest to capture.", "귀의 돌이 가장 잡히기 쉽습니다.", "隅の石が一番取られやすいのです。"),
          },
          {
            kind: "problem",
            text: L(
              "这颗白子在下边，只剩一口气。提掉它。",
              "This white stone on the bottom edge has one liberty left. Capture it.",
              "아래 변의 백돌은 활로가 하나 남았습니다. 따내세요.",
              "下辺の白石は呼吸点が一つです。取りましょう。",
            ),
            problem: { goal: "capture", escape: 2, at: [8, 17], diagram: [". . .", "X o X"] },
            success: L("边上的子比中间的子少一口气。", "A stone on the edge has one liberty fewer than in the middle.", "변의 돌은 가운데 돌보다 활로가 하나 적습니다.", "辺の石は中央の石より呼吸点が一つ少ないのです。"),
          },
        ],
      },
      {
        id: "stones-groups",
        title: L("吃掉一串子", "Capturing groups", "여러 돌 따내기", "石の一団を取る"),
        steps: [
          {
            kind: "problem",
            text: L(
              "连在一起的棋子共用它们的气，要提就一起提。这两颗白子只剩一口气，把它们都提掉。",
              "Joined stones share their liberties and are captured together. These two white stones have one liberty left. Capture both.",
              "이어진 돌은 활로를 함께 쓰고, 잡힐 때도 함께 잡힙니다. 이 백 두 점은 활로가 하나 남았습니다. 모두 따내세요.",
              "つながった石は呼吸点を共有し、取られるときも一緒です。白二子は呼吸点が一つだけ。まとめて取りましょう。",
            ),
            problem: { goal: "capture", escape: 2, at: [4, 0], diagram: ["X o o X", ". X . .", ". . O ."] },
            success: L("一手提掉两颗子。", "Two stones captured with one move.", "한 수로 두 점을 따냈습니다.", "一手で二子を取りました。"),
          },
          {
            kind: "problem",
            text: L(
              "角上三颗白子连成一串。找到它们最后的一口气。",
              "Three white stones in the corner form one group. Find their last liberty.",
              "귀의 백 세 점은 한 덩어리입니다. 마지막 활로를 찾으세요.",
              "隅の白三子は一団です。最後の呼吸点を探しましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tl", diagram: ["o o o X", "X X . X", ". . X ."] },
            success: L("整串一起被提掉。", "The whole group comes off together.", "덩어리 전체가 함께 들어냅니다.", "一団がまとめて盤から消えます。"),
          },
          {
            kind: "problem",
            text: L(
              "这块白棋有三颗子。数一数它的气，然后提掉它。",
              "This white group has three stones. Count its liberties, then capture it.",
              "이 백 덩어리는 세 점입니다. 활로를 세어 보고 따내세요.",
              "この白は三子の一団です。呼吸点を数えて、取りましょう。",
            ),
            problem: { goal: "capture", escape: 2, at: [6, 6], diagram: [". X X . .", "X o o X .", ". X o X .", ". . . . ."] },
            success: L("不管多大，没有气就被提。", "However big a group is, with no liberties it is captured.", "덩어리가 아무리 커도 활로가 없으면 잡힙니다.", "どんなに大きくても、呼吸点がなければ取られます。"),
          },
          {
            kind: "problem",
            text: L(
              "两块白棋都被打吃了。你提一块，白棋就会救另一块。提掉大的那块。",
              "Two white groups are in atari. Take one and White will save the other. Capture the bigger one.",
              "백 두 덩어리가 모두 단수입니다. 하나를 잡으면 백은 다른 하나를 살립니다. 큰 쪽을 따내세요.",
              "白の二団がどちらもアタリです。一方を取れば白はもう一方を助けます。大きい方を取りましょう。",
            ),
            problem: {
              goal: "capture",
              escape: 2,
              at: [2, 0],
              diagram: [". X O X o o X .", ". . . X X . . .", ". . . . . O . ."],
            },
            success: L("两颗子比一颗子值钱。提子前先比一比。", "Two stones are worth more than one. Compare before you capture.", "두 점이 한 점보다 큽니다. 따내기 전에 비교해 보세요.", "二子は一子より大きい。取る前に比べましょう。"),
          },
        ],
      },
      {
        id: "stones-suicide",
        title: L("禁着点", "No suicide", "착수 금지", "着手禁止点"),
        steps: [
          {
            kind: "read",
            text: L(
              "不能下在自己毫无气的地方，除非这一手能提掉对方的子。标记的点被白子围住，黑棋下去没有气又提不到子，所以不能下。",
              "You may not play where your stone would have no liberties, unless the move captures. The marked point is surrounded by white stones; a black stone there would have no liberties and capture nothing, so Black cannot play it.",
              "자기 돌의 활로가 하나도 없는 곳에는 둘 수 없습니다. 단, 그 수로 상대 돌을 따낸다면 둘 수 있습니다. 표시한 점은 백에 둘러싸여 흑이 두면 활로도 없고 따내는 돌도 없으니 둘 수 없습니다.",
              "自分の石の呼吸点がなくなる所には打てません。ただし、その手で相手の石を取れるなら打てます。印の点は白に囲まれ、黒が打っても呼吸点がなく何も取れないので打てません。",
            ),
            board: {
              ...b9({ 3: ". . . . O . . . .", 4: ". . . O . O . . .", 5: ". . . . O . . . ." }),
              marks: [{ x: 4, y: 4, type: "triangle" }],
            },
          },
          {
            kind: "place",
            text: L(
              "黑棋想吃掉角上三颗白子。现在下在角里是禁着，因为白棋外面还有一口气。先把外面那口气堵上。",
              "Black wants the three white stones in the corner. Playing in the corner point is still forbidden, because White has one more liberty outside. Fill that outside liberty first.",
              "흑은 귀의 백 세 점을 잡고 싶습니다. 백에게 바깥 활로가 하나 더 있어서 지금 귀에 두는 것은 착수 금지입니다. 바깥 활로부터 막으세요.",
              "黒は隅の白三子を取りたいところ。白には外側にもう一つ呼吸点があるので、今は隅の点に打てません。先に外の呼吸点をふさぎましょう。",
            ),
            board: b9({ 0: ". O X . . . . . .", 1: "O O . . . . . . .", 2: "X X . . . . . . ." }),
            toMove: 1,
            accept: [{ x: 2, y: 1 }],
            success: L("现在白子只剩角里那一口气了。", "Now the corner point is White's only liberty.", "이제 백의 활로는 귀의 점 하나뿐입니다.", "これで白の呼吸点は隅の一点だけです。"),
            wrong: L(
              "白棋还有外面的气时，下在角里提不到子，是禁着。先堵外面。",
              "While White still has an outside liberty, a stone in the corner captures nothing and is forbidden. Close the outside first.",
              "백에게 바깥 활로가 있는 동안 귀에 두면 따내는 것이 없어 착수 금지입니다. 바깥부터 막으세요.",
              "白に外の呼吸点があるうちは、隅に打っても何も取れず着手禁止です。外からふさぎましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "角里是白棋最后的一口气。下在那里能提子，所以可以下。",
              "The corner point is now White's last liberty. A move there captures, so it is allowed.",
              "귀의 점이 백의 마지막 활로입니다. 그곳에 두면 따내므로 둘 수 있습니다.",
              "隅の点が白の最後の呼吸点です。そこに打てば取れるので、打てます。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tl", diagram: [". o X .", "o o X .", "X X . ."] },
            success: L("能提子的一手永远不是禁着。", "A move that captures is never suicide.", "따내는 수는 착수 금지가 아닙니다.", "石を取る手は着手禁止になりません。"),
          },
          {
            kind: "problem",
            text: L(
              "三颗白子围着一个空点，而它们都只剩这一口气。提掉它们。",
              "Three white stones surround an empty point, and it is the last liberty of all three. Capture them.",
              "백 세 점이 빈 점 하나를 둘러싸고 있고, 그 점이 세 점 모두의 마지막 활로입니다. 따내세요.",
              "白三子が空点を囲み、その点が三子すべての最後の呼吸点です。取りましょう。",
            ),
            problem: { goal: "capture", escape: 3, at: [6, 0], diagram: [". X o . o X .", ". X X o X X .", ". . . X . . ."] },
            success: L("看起来像禁着，其实一手提掉三颗子。", "It looked forbidden, but it captured three stones.", "착수 금지처럼 보였지만 세 점을 따냈습니다.", "着手禁止に見えて、実は三子を取る手でした。"),
          },
        ],
      },
      {
        id: "stones-ko",
        title: L("打劫", "Ko", "패", "コウ"),
        steps: [
          {
            kind: "read",
            text: L(
              "这个形状叫“劫”：黑棋提一子后，白棋马上又能提回来，可以无限反复。所以规则规定：被提掉一子后，不能立刻在标记点提回，必须先在别处下一手。",
              "This shape is a ko: after Black captures one stone, White could capture straight back, forever. So the rule says that after a single-stone capture in a ko, the other side may not retake at once and must play elsewhere first.",
              "이 모양을 패라고 합니다. 흑이 한 점을 따내면 백이 곧바로 되따낼 수 있어 끝없이 반복됩니다. 그래서 패에서 한 점을 따낸 직후에는 상대가 바로 되따낼 수 없고, 먼저 다른 곳에 한 수 두어야 합니다.",
              "この形をコウと言います。黒が一子を取ると白がすぐ取り返せて、終わりなく続いてしまいます。そこで、コウで一子を取られた直後はすぐに取り返せず、まず別の所に一手打つ決まりです。",
            ),
            board: { ...KO_FRESH, marks: [{ x: 4, y: 6, type: "triangle" }] },
          },
          {
            kind: "place",
            text: L(
              "中间的白子只剩一口气。提掉它。",
              "The white stone in the middle has one liberty left. Capture it.",
              "가운데 백돌은 활로가 하나 남았습니다. 따내세요.",
              "真ん中の白石は呼吸点が一つです。取りましょう。",
            ),
            board: KO_FRESH,
            toMove: 1,
            accept: [{ x: 4, y: 6 }],
            success: L(
              "提掉了。现在白棋不能马上提回你这颗子。",
              "Captured. Now White may not take your stone back right away.",
              "따냈습니다. 이제 백은 이 돌을 바로 되따낼 수 없습니다.",
              "取りました。白はこの石をすぐには取り返せません。",
            ),
            wrong: L(
              "找出白子唯一剩下的那口气。",
              "Find the white stone's only remaining liberty.",
              "백돌에게 남은 단 하나의 활로를 찾으세요.",
              "白石に残った一つの呼吸点を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "假设白棋在别处下了一手劫材，你应了，白棋又把劫提了回去。现在你也不能马上提回。先找一个对方必须应的地方：打吃右上那颗白子，这叫“劫材”。",
              "Suppose White made a threat elsewhere, you answered, and White took the ko back. Now you may not retake at once either. First play a move White must answer: atari the white stone at the upper right. This is a ko threat.",
              "백이 다른 곳에 팻감을 쓰고 흑이 받은 뒤, 백이 패를 되따냈다고 합시다. 이번엔 흑도 바로 되따낼 수 없습니다. 먼저 백이 받아야 하는 곳, 오른쪽 위 백돌을 단수치세요. 이것이 팻감입니다.",
              "白が別の所でコウダテを打ち、黒が受けた後、白がコウを取り返したとします。今度は黒もすぐには取り返せません。先に白が受けなければならない手、右上の白石へのアタリを打ちましょう。これがコウダテです。",
            ),
            board: KO_FRESH,
            toMove: 1,
            accept: [
              { x: 8, y: 3 },
              { x: 7, y: 4 },
            ],
            success: L("白棋必须应这一手，否则会被提。", "White has to answer, or lose that stone.", "백은 받아야 합니다. 안 받으면 그 돌이 잡힙니다.", "白は受けなければ、その石を取られます。"),
            wrong: L(
              "刚被提劫后不能马上提回。先在右上打吃白子。",
              "Right after your stone is taken in a ko you may not retake. Give atari to the white stone at the upper right first.",
              "패를 따인 직후에는 바로 되따낼 수 없습니다. 먼저 오른쪽 위 백돌을 단수치세요.",
              "コウを取られた直後は取り返せません。まず右上の白石にアタリをかけましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋应了你的劫材。现在中间已经隔了一手，可以提回劫了。",
              "White answered your threat. A move has passed, so now you may take the ko back.",
              "백이 팻감을 받았습니다. 한 수가 지났으니 이제 패를 되따낼 수 있습니다.",
              "白がコウダテを受けました。一手はさんだので、コウを取り返せます。",
            ),
            board: KO_THREAT_ANSWERED,
            toMove: 1,
            accept: [{ x: 4, y: 6 }],
            success: L("又提回来了。劫就是这样轮流找劫材。", "Retaken. In a ko the players take turns finding threats.", "다시 따냈습니다. 패는 이렇게 팻감을 번갈아 씁니다.", "取り返しました。コウはこうしてコウダテを交互に打ち合います。"),
            wrong: L(
              "劫在中间：提掉那颗只剩一口气的白子。",
              "The ko is in the middle: capture the white stone that has one liberty.",
              "패는 가운데에 있습니다. 활로가 하나 남은 백돌을 따내세요.",
              "コウは真ん中です。呼吸点が一つの白石を取りましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次白棋找不到劫材，下在了别处。把劫粘上，结束这个劫。",
              "This time White found no threat and played elsewhere. Connect at the ko to end it.",
              "이번에는 백이 팻감을 찾지 못하고 다른 곳에 두었습니다. 패를 이어서 끝내세요.",
              "今度は白にコウダテがなく、別の所に打ちました。コウを継いで終わらせましょう。",
            ),
            board: KO_TAKEN,
            toMove: 1,
            accept: [{ x: 3, y: 6 }],
            success: L("粘上之后，劫就结束了。", "Once you connect, the ko is over.", "이으면 패는 끝납니다.", "継げばコウは終わりです。"),
            wrong: L(
              "下在白棋可以提劫的那个空点上，把它填掉。",
              "Fill the empty point where White would retake the ko.",
              "백이 패를 되따낼 빈 점을 메우세요.",
              "白がコウを取り返す空点を埋めましょう。",
            ),
          },
        ],
      },
    ],
  },
  /* ================================================================ UNIT 2 */
  {
    id: "capture",
    title: L("吃子技巧", "Capturing techniques", "잡는 기술", "石を取る技"),
    summary: L(
      "打吃的方向、征子、枷吃、扑与倒扑、双打吃。",
      "Which way to atari, ladders, nets, throw-ins with snapback, and double atari.",
      "단수 방향, 축, 장문, 먹여치기와 환격, 양단수.",
      "アタリの方向、シチョウ、ゲタ、ホウリコミとウッテガエシ、両アタリ。",
    ),
    lessons: [
      {
        id: "capture-direction",
        title: L("打吃的方向", "Which way to atari", "단수의 방향", "アタリの方向"),
        steps: [
          {
            kind: "read",
            text: L(
              "打吃时要选方向：把对方往棋盘边上或你自己的子那边赶，它就长不出气。往开阔处赶，它就跑掉了。",
              "When you give atari, choose the side. Drive the stone toward the edge or toward your own stones, where it cannot gain liberties. Drive it toward open space and it escapes.",
              "단수칠 때는 방향을 고르세요. 변 쪽이나 내 돌 쪽으로 몰면 활로가 늘지 않습니다. 넓은 쪽으로 몰면 달아납니다.",
              "アタリは方向を選びます。盤の端や自分の石の方へ追えば呼吸点は増えません。広い方へ追うと逃げられます。",
            ),
            board: { size: 19, corner: "tl", diagram: [". . . . . . .", ". . . . . . .", ". X O X . . .", ". . . . . . .", ". . . . . . ."] },
          },
          {
            kind: "problem",
            text: L(
              "白子有两口气。从中间那一侧打吃，把它赶向边上。",
              "The white stone has two liberties. Give atari from the centre side so it must run toward the edge.",
              "백돌은 활로가 둘입니다. 중앙 쪽에서 단수쳐서 변으로 몰아내세요.",
              "白石の呼吸点は二つ。中央側からアタリにして、辺の方へ逃げさせましょう。",
            ),
            problem: { goal: "capture", escape: 3, at: [3, 0], diagram: [". . . . .", ". X o X .", ". . . . .", ". . . . ."] },
            success: L("往边上逃没有用，边线就是墙。", "Running to the edge does not help: the edge is a wall.", "변으로 도망쳐도 소용없습니다. 변은 벽입니다.", "辺へ逃げても無駄です。盤端は壁です。"),
          },
          {
            kind: "problem",
            text: L(
              "这次右边有一排黑子。打吃时把白子赶到它们那边去。",
              "This time there is a wall of black stones on the right. Give atari so White runs into them.",
              "이번에는 오른쪽에 흑돌 벽이 있습니다. 백이 그 벽 쪽으로 달아나도록 단수치세요.",
              "今度は右に黒石の壁があります。白がその壁にぶつかるようにアタリをかけましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tl", diagram: [". . . . . .", ". . X . X .", ". X o . X .", ". . . . X .", ". . . . . ."] },
            success: L("自己的子也像墙一样挡住了对方。", "Your own stones block the escape just like the edge.", "내 돌도 변처럼 길을 막아 줍니다.", "自分の石も盤端と同じように逃げ道をふさぎます。"),
          },
          {
            kind: "problem",
            text: L(
              "角上的白子离边只有一路。选对打吃的方向，把它吃掉。",
              "The white stone near the corner is one line from the edge. Pick the right side for atari and capture it.",
              "귀 근처 백돌은 변에서 한 줄 떨어져 있습니다. 단수 방향을 잘 골라 잡으세요.",
              "隅の近くの白石は辺から一路です。正しい方向からアタリにして取りましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tr", diagram: [". . . . . .", ". . . o X .", ". . . X . .", ". . . . . .", ". . . . . ."] },
            success: L("挡住通往中间的路，白子只能往边上爬。", "Block the way to the centre and White can only crawl along the edge.", "중앙으로 가는 길을 막으면 백은 변으로 기어갈 수밖에 없습니다.", "中央への道をふさげば、白は辺をはうしかありません。"),
          },
        ],
      },
      {
        id: "capture-ladder",
        title: L("征子", "The ladder", "축", "シチョウ"),
        steps: [
          {
            kind: "read",
            text: L(
              "征子是连续打吃，把对方赶成锯齿形。逃的一方每次长出后仍只有两口气，最后撞到边上被吃。",
              "A ladder is a chase of ataris that drives the stones in a zig-zag. After each escape they still have only two liberties, until they hit the edge and are captured.",
              "축은 연속 단수로 상대를 지그재그로 모는 수법입니다. 달아날 때마다 활로가 둘뿐이라 결국 변에 부딪혀 잡힙니다.",
              "シチョウは続けてアタリをかけ、ジグザグに追う手筋です。逃げても呼吸点は二つのままで、最後は盤端にぶつかって取られます。",
            ),
            board: {
              size: 19,
              corner: "tl",
              diagram: [". . . . . . .", ". . . . . . .", ". . . . X . .", ". . X O . . .", ". . . X . . .", ". . . . . . .", ". . . . . . ."],
            },
          },
          {
            kind: "problem",
            text: L(
              "用征子吃掉白子。第一手打吃要让白子往角上逃。",
              "Capture the white stone with a ladder. Your first atari should send it running toward the corner.",
              "축으로 백돌을 잡으세요. 첫 단수로 백이 귀 쪽으로 달아나게 하세요.",
              "シチョウで白石を取りましょう。最初のアタリで白を隅の方へ逃がします。",
            ),
            problem: {
              goal: "capture", escape: 3,
              corner: "tl",
              diagram: [". . . . . . .", ". . . . . . .", ". . . . X . .", ". . X o . . .", ". . . X . . .", ". . . . . O .", ". . . . . . ."],
            },
            success: L("征子一路打吃到边。", "The ladder runs all the way to the edge.", "축은 변까지 계속 단수입니다.", "シチョウは盤端までアタリの連続です。"),
          },
          {
            kind: "problem",
            text: L(
              "换一个角再征一次。另一边打吃的话，白子会跑向它的伙伴。",
              "Another corner, another ladder. Atari from the wrong side and White runs toward its friend.",
              "다른 귀에서 다시 축입니다. 반대쪽에서 단수치면 백은 자기 편 돌 쪽으로 달아납니다.",
              "別の隅でもう一度シチョウ。反対側からアタリにすると、白は味方の方へ逃げます。",
            ),
            problem: {
              goal: "capture", escape: 3,
              corner: "br",
              diagram: [". . . . . . .", ". O . . . . .", ". . . X . . .", ". . . o X . .", ". . X . . . .", ". . . . . . .", ". . . . . . ."],
            },
            success: L("征子的方向上没有白子，所以征子成立。", "No white stone stands in the ladder's path, so it works.", "축 방향에 백돌이 없으니 축이 성립합니다.", "シチョウの行く先に白石がないので、シチョウは成立します。"),
          },
          {
            kind: "problem",
            text: L(
              "两颗子也能被征。打吃，让它们往上边逃，再一路追下去。",
              "Two stones can be laddered too. Give atari so they run toward the top, then keep chasing.",
              "두 점도 축으로 잡을 수 있습니다. 위쪽으로 달아나게 단수친 뒤 계속 쫓으세요.",
              "二子でもシチョウにかかります。上へ逃げるようにアタリをかけ、追い続けましょう。",
            ),
            problem: {
              goal: "capture", escape: 3,
              corner: "tl",
              diagram: [". . . . . . .", ". . . . . . .", ". . . . . . .", ". . X o . . .", ". . X o X . .", ". . . X . . .", ". . . . . . ."],
            },
            success: L("子再多，只剩两口气也逃不出征子。", "More stones, same story: two liberties are not enough to escape.", "돌이 많아도 활로가 둘뿐이면 축을 벗어나지 못합니다.", "石が増えても、呼吸点二つではシチョウから逃げられません。"),
          },
        ],
      },
      {
        id: "capture-net",
        title: L("枷吃", "The net", "장문", "ゲタ"),
        steps: [
          {
            kind: "read",
            text: L(
              "如果征子的路上有对方的子，征子就不成立。这时可以用“枷”：不直接打吃，而是隔一步把出路罩住。",
              "If an enemy stone waits in the ladder's path, the ladder fails. Then use a net: instead of giving atari, cover the escape route from one step away.",
              "축 길목에 상대 돌이 있으면 축이 성립하지 않습니다. 그럴 때는 장문을 씁니다. 바로 단수치지 않고 한 칸 떨어져 길목을 막습니다.",
              "シチョウの先に相手の石があるとシチョウは成立しません。そんな時はゲタ。直接アタリにせず、一歩離れて逃げ道をふさぎます。",
            ),
            board: {
              size: 19,
              corner: "tl",
              diagram: [". . . . . . . .", ". . . . . . . .", ". . . X X . . .", ". . X O . . . .", ". . X . . . . .", ". . . . . . . .", ". . . . . . O .", ". . . . . . . ."],
              marks: [{ x: 6, y: 6, type: "square" }],
            },
          },
          {
            kind: "problem",
            text: L(
              "右下的白子会救征子。用枷吃掉中间的白子。",
              "The white stone at the lower right would rescue a ladder. Capture the cutting stone with a net.",
              "오른쪽 아래 백돌이 축을 구해 줍니다. 장문으로 가운데 백돌을 잡으세요.",
              "右下の白石がシチョウを助けます。ゲタで中の白石を取りましょう。",
            ),
            problem: {
              goal: "capture", escape: 3,
              corner: "tl",
              diagram: [". . . . . . . .", ". . . . . . . .", ". . . X X . . .", ". . X o . . . .", ". . X . . . . .", ". . . . . . . .", ". . . . . . O .", ". . . . . . . ."],
            },
            success: L("白子往哪边冲都会被挡住。", "Whichever way White pushes, it is blocked.", "백이 어느 쪽으로 밀고 나와도 막힙니다.", "白がどちらへ出ても止められます。"),
          },
          {
            kind: "problem",
            text: L(
              "同样的形状换到另一个角。征子还是不行，再用枷。",
              "The same shape in another corner. The ladder still fails, so use the net again.",
              "같은 모양이 다른 귀에 있습니다. 여전히 축이 안 되니 장문을 쓰세요.",
              "同じ形が別の隅に。やはりシチョウは不成立なので、ゲタを使います。",
            ),
            problem: {
              goal: "capture", escape: 3,
              corner: "br",
              diagram: [". . . . . . . .", ". O . . . . . .", ". . . . . . . .", ". . . . . X . .", ". . . . o X . .", ". . . X X . . .", ". . . . . . . .", ". . . . . . . ."],
            },
            success: L("枷让对方无路可逃。", "A net leaves no way out.", "장문은 빠져나갈 길을 남기지 않습니다.", "ゲタは逃げ道を残しません。"),
          },
          {
            kind: "problem",
            text: L(
              "这次在右上角。先看清白子的出路，再把它罩住。",
              "Now in the upper right corner. Look at where the white stone wants to go, then cover it.",
              "이번에는 오른쪽 위 귀입니다. 백돌이 나가려는 길을 보고 덮으세요.",
              "今度は右上の隅。白石の逃げ道を見てから、かぶせましょう。",
            ),
            problem: {
              goal: "capture", escape: 3,
              corner: "tr",
              diagram: [". . . . . . . .", ". . . . . . . .", ". . . X X . . .", ". . . . o X . .", ". . . . . X . .", ". . . . . . . .", ". O . . . . . .", ". . . . . . . ."],
            },
            success: L("枷是征子不成立时的好帮手。", "The net is your friend when the ladder fails.", "축이 안 될 때는 장문이 좋은 도우미입니다.", "シチョウが駄目な時はゲタが頼りになります。"),
          },
        ],
      },
      {
        id: "capture-snapback",
        title: L("扑与倒扑", "Throw-in and snapback", "먹여치기와 환격", "ホウリコミとウッテガエシ"),
        steps: [
          {
            kind: "read",
            text: L(
              "有时故意把一颗子送进对方嘴里，这叫“扑”。对方提掉这颗子后自己只剩一口气，你再提回更多的子，这叫“倒扑”。",
              "Sometimes you deliberately put a stone where it will be captured: a throw-in. If capturing it leaves the opponent with one liberty, you take back more stones at once: a snapback.",
              "일부러 잡힐 자리에 돌을 넣는 것을 먹여치기라고 합니다. 상대가 그 돌을 따낸 뒤 활로가 하나뿐이면, 곧바로 더 많은 돌을 되따냅니다. 이것이 환격입니다.",
              "わざと取られる所に石を打つのがホウリコミです。それを取った相手の呼吸点が一つになれば、すぐにもっと多くの石を取り返せます。これがウッテガエシです。",
            ),
            board: {
              size: 19,
              corner: "tl",
              diagram: [". . O . . .", "O O X O . .", "X X X O . .", ". . X . . ."],
              marks: [{ x: 1, y: 0, type: "triangle" }],
            },
          },
          {
            kind: "problem",
            text: L(
              "左上两颗白子只有两口气，但直接打吃会让它们连到右边。扑进去，再提回来。",
              "The two white stones at the upper left have two liberties, but a plain atari lets them connect to the right. Throw a stone in, then take back.",
              "왼쪽 위 백 두 점은 활로가 둘이지만, 그냥 단수치면 오른쪽과 이어집니다. 먹여친 뒤 되따내세요.",
              "左上の白二子は呼吸点が二つですが、普通にアタリにすると右とつながります。ホウリコミを打ってから取り返しましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tl", diagram: [". . O . . .", "o o X O . .", "X X X O . .", ". . X . . ."] },
            success: L(
              "白提一子后只剩一口气，你马上提回两颗。",
              "After White takes one stone it has a single liberty, and you take two right back.",
              "백이 한 점을 따내면 활로가 하나뿐이라 곧바로 두 점을 되따냅니다.",
              "白が一子を取ると呼吸点が一つになり、すぐ二子を取り返せます。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "右上角也是同样的道理。找到那个“送吃”的点。",
              "The same idea in the upper right corner. Find the point where your stone is offered.",
              "오른쪽 위 귀도 같은 원리입니다. 돌을 내줄 점을 찾으세요.",
              "右上の隅も同じ考え方です。石を差し出す点を探しましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tr", diagram: [". X o .", ". X o .", "X X X O", ". O O .", ". . . .", ". . . ."] },
            success: L("舍一颗，得两颗。", "Give one, take two.", "한 점을 주고 두 점을 얻습니다.", "一子を捨てて二子を得ます。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角：先扑，再倒扑。",
              "Lower left: throw in first, then snap back.",
              "왼쪽 아래: 먼저 먹여치고, 그다음 환격입니다.",
              "左下：まずホウリコミ、それからウッテガエシです。",
            ),
            problem: { goal: "capture", escape: 3, corner: "bl", diagram: [". . X . . .", "X X X O . .", "o o X O . .", ". . O . . ."] },
            success: L("看到对方只有两口气、又连不出去时，想一想倒扑。", "When stones have two liberties and nowhere to connect, think of the snapback.", "활로가 둘이고 이을 데가 없는 돌을 보면 환격을 떠올리세요.", "呼吸点が二つでつながる先のない石には、ウッテガエシを考えましょう。"),
          },
        ],
      },
      {
        id: "capture-double",
        title: L("双打吃", "Double atari", "양단수", "両アタリ"),
        steps: [
          {
            kind: "read",
            text: L(
              "一手同时打吃两块棋叫“双打吃”。对方只能救一块，另一块就被你提掉。",
              "One move that puts two groups in atari at once is a double atari. Your opponent can save only one, and you capture the other.",
              "한 수로 두 덩어리를 동시에 단수치는 것을 양단수라고 합니다. 상대는 하나만 살릴 수 있고, 나머지는 따냅니다.",
              "一手で二つの石を同時にアタリにするのが両アタリ。相手は片方しか助けられず、もう片方を取れます。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "两颗白子各有两口气，而且有一口是公共的。找到同时打吃它们的点。",
              "Each white stone has two liberties, and they share one. Find the point that gives atari to both.",
              "백 두 점은 각각 활로가 둘이고, 하나를 함께 씁니다. 두 점을 동시에 단수치는 점을 찾으세요.",
              "白二子はそれぞれ呼吸点が二つで、一つを共有しています。両方をアタリにする点を探しましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tl", diagram: [". . X . . ,", ". X o . . ,", ". o . . . ,", ". X . . . ,", ", , , , , ,"] },
            success: L("白棋救一块，你吃另一块。", "White saves one; you capture the other.", "백이 하나를 살리면 다른 하나를 잡습니다.", "白が片方を助ければ、もう片方を取れます。"),
          },
          {
            kind: "problem",
            text: L(
              "在中间也一样。下在两颗白子之间。",
              "The same in open space. Play between the two white stones.",
              "넓은 곳에서도 같습니다. 두 백돌 사이에 두세요.",
              "広い所でも同じです。白二子の間に打ちましょう。",
            ),
            problem: {
              goal: "capture", escape: 3,
              at: [2, 2],
              diagram: [", , , , , , ,", ", . X . . . ,", ", X o . o X ,", ", . . . X . ,", ", . . . . . ,", ", , , , , , ,"],
            },
            success: L("一手两用，就是双打吃的威力。", "One move, two threats: that is the power of double atari.", "한 수로 두 곳을 노리는 것이 양단수의 힘입니다.", "一手で二つを狙う、それが両アタリの力です。"),
          },
          {
            kind: "problem",
            text: L(
              "右下角有同样的机会。找出双打吃。",
              "The lower right corner has the same chance. Find the double atari.",
              "오른쪽 아래 귀에도 같은 기회가 있습니다. 양단수를 찾으세요.",
              "右下の隅にも同じチャンスがあります。両アタリを見つけましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "br", diagram: [", , , , , ,", ", . . . X .", ", . . . o .", ", . . o X .", ", . . X . ."] },
            success: L("先找有两口气、又挨在一起的子。", "Look for stones with two liberties that sit close together.", "활로가 둘이고 가까이 붙은 돌을 먼저 찾으세요.", "呼吸点が二つで近くにある石を探すのがコツです。"),
          },
        ],
      },
    ],
  },
  /* ================================================================ UNIT 3 */
  {
    id: "escape",
    title: L("逃子与反击", "Escaping and counter-attack", "도망과 반격", "逃げ方と反撃"),
    summary: L(
      "被打吃时怎么办：长出、连回、反吃，以及看清征子能不能成立。",
      "What to do in atari: extend, connect home, capture back, and read whether a ladder works.",
      "단수당했을 때: 뻗기, 연결, 되잡기, 그리고 축이 되는지 읽기.",
      "アタリにされたら：伸びる、つながる、取り返す、そしてシチョウが成立するかを読む。",
    ),
    lessons: [
      {
        id: "escape-extend",
        title: L("长出去", "Extend to escape", "뻗어서 달아나기", "伸びて逃げる"),
        steps: [
          {
            kind: "read",
            text: L(
              "被打吃的子可以“长”：在最后一口气上再下一颗，连成一串，气就变多了。往开阔的地方长，不要往边上长。",
              "A stone in atari can extend: play on its last liberty so the group grows and gains liberties. Extend toward open space, not toward the edge.",
              "단수당한 돌은 뻗을 수 있습니다. 마지막 활로에 이어 두면 덩어리가 커지고 활로가 늘어납니다. 변이 아니라 넓은 쪽으로 뻗으세요.",
              "アタリの石は伸びられます。最後の呼吸点に打てば一団が大きくなり、呼吸点が増えます。辺ではなく広い方へ伸びましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑子被打吃了。往中间长出去，救活它。",
              "Your stone is in atari. Extend toward the centre and save it.",
              "흑돌이 단수입니다. 중앙 쪽으로 뻗어 살리세요.",
              "黒石がアタリです。中央へ伸びて助けましょう。",
            ),
            problem: { goal: "save", escape: 3, at: [3, 0], diagram: [". . O . .", ". O x O .", ". . . . .", ". . . . ."] },
            success: L("长出后有三口气，安全了。", "After extending you have three liberties: safe for now.", "뻗고 나니 활로가 셋, 일단 안전합니다.", "伸びて呼吸点が三つ。ひとまず安全です。"),
          },
          {
            kind: "problem",
            text: L(
              "角附近的黑子被三面包围。找到它唯一的出路。",
              "Near the corner, your stone is surrounded on three sides. Find its only way out.",
              "귀 근처 흑돌이 세 방향에서 둘러싸였습니다. 유일한 출구를 찾으세요.",
              "隅の近くの黒石が三方から囲まれています。ただ一つの出口を探しましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tl", diagram: [". . . . . .", ". . O . . .", ". O x . . .", ". . O . . .", ". . . . . ."] },
            success: L("出口通向中间，那里气最多。", "The exit leads to the centre, where liberties are plentiful.", "출구가 중앙으로 열려 있어 활로가 많습니다.", "出口は中央へ。そこは呼吸点が豊富です。"),
          },
          {
            kind: "problem",
            text: L(
              "两颗黑子一起被打吃。长出去，让这串子有足够的气。",
              "Two black stones are in atari together. Extend so the group has enough liberties.",
              "흑 두 점이 함께 단수입니다. 뻗어서 활로를 충분히 만드세요.",
              "黒二子がまとめてアタリです。伸びて呼吸点を十分にしましょう。",
            ),
            problem: { goal: "save", escape: 3, at: [2, 2], diagram: [". . . . . . .", ". . O O . . .", ". O x x . . .", ". . O O . . .", ". . . . . . ."] },
            success: L("一串子共用的气，长一手就多了。", "One extension adds liberties to the whole group.", "한 번 뻗으면 덩어리 전체의 활로가 늘어납니다.", "一つ伸びれば、一団全体の呼吸点が増えます。"),
          },
        ],
      },
      {
        id: "escape-connect",
        title: L("连回自己的子", "Connect to friends", "자기 편과 연결", "味方とつながる"),
        steps: [
          {
            kind: "problem",
            text: L(
              "被打吃的子如果能和旁边的自己人连上，就分享它们的气。连上去。",
              "A stone in atari that can join nearby friends shares their liberties. Connect it.",
              "단수당한 돌이 옆의 자기 돌과 이어지면 그 활로를 함께 씁니다. 연결하세요.",
              "アタリの石は近くの味方とつながれば、その呼吸点を共有できます。つなぎましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tl", diagram: [". . . . . . .", ". . O O . . .", ". O x . X . .", ". . O X . . .", ". . . . . . ."] },
            success: L("连在一起，气就多了。", "Joined up, the group has plenty of liberties.", "이어지니 활로가 넉넉합니다.", "つながって呼吸点がたっぷりになりました。"),
          },
          {
            kind: "problem",
            text: L(
              "这颗黑子三面被白子围住。往上连回自己的阵地。",
              "This black stone has white stones on three sides. Connect upward to your own position.",
              "이 흑돌은 세 방향이 백돌입니다. 위쪽 흑 진영과 이으세요.",
              "この黒石は三方を白に囲まれています。上の味方とつながりましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tl", diagram: [". . . . . .", ". X X . . .", ". . O x O .", ". . . O . .", ". . . . . ."] },
            success: L("有自己人在旁边，比单独逃跑更安全。", "With friends nearby, connecting beats running alone.", "가까이 자기 돌이 있으면 혼자 달아나는 것보다 잇는 편이 안전합니다.", "味方が近くにいれば、一人で逃げるよりつながる方が安全です。"),
          },
          {
            kind: "problem",
            text: L(
              "右下角也有一颗被打吃的黑子。连回去。",
              "In the lower right corner another black stone is in atari. Bring it home.",
              "오른쪽 아래 귀에도 단수당한 흑돌이 있습니다. 연결하세요.",
              "右下の隅にもアタリの黒石があります。つなげて助けましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "br", diagram: [". . . . . . .", ". . . X O . .", ". . X . x O .", ". . . O O . .", ". . . . . . ."] },
            success: L("先看看能不能连回家，再考虑逃跑。", "Before running, check whether you can connect home.", "달아나기 전에 이을 수 있는지 먼저 보세요.", "逃げる前に、つながれるかをまず見ましょう。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角的黑子被打吃了，旁边就是自己的子。连上。",
              "Your stone in the upper right is in atari, with friends right beside it. Connect.",
              "오른쪽 위 흑돌이 단수인데 바로 옆에 자기 돌이 있습니다. 이으세요.",
              "右上の黒石がアタリで、すぐそばに味方がいます。つなぎましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tr", diagram: [". . . . . .", ". . . X X .", ". O x O . .", ". . O . . .", ". . . . . ."] },
            success: L("连回去，一颗弱子就变成了强棋的一部分。", "Connected, a weak stone becomes part of a strong group.", "이으니 약한 돌이 강한 덩어리의 일부가 되었습니다.", "つながって、弱い石が強い一団の一部になりました。"),
          },
        ],
      },
      {
        id: "escape-counter",
        title: L("反吃", "Capture to escape", "되잡아서 살기", "取って逃げる"),
        steps: [
          {
            kind: "read",
            text: L(
              "被打吃时先看一看：围住你的白子自己是不是也只剩一口气？如果是，提掉它，你的子就有了气。",
              "In atari, first look around: is one of the white stones surrounding you also down to one liberty? If so, capture it and your stones breathe again.",
              "단수당하면 먼저 살펴보세요. 나를 둘러싼 백돌 중에 활로가 하나뿐인 돌이 있나요? 있다면 그 돌을 따내면 활로가 생깁니다.",
              "アタリにされたら、まず周りを見ます。囲んでいる白石にも呼吸点が一つの石はないか。あれば取れば、こちらの呼吸点が増えます。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑子被打吃，往左长也只会再被打吃。右边的白子只有一口气，吃掉它。",
              "Your stone is in atari, and running left only leads to another atari. The white stone on its right has one liberty. Capture it.",
              "흑돌이 단수이고, 왼쪽으로 뻗어도 다시 단수가 됩니다. 오른쪽 백돌은 활로가 하나뿐입니다. 따내세요.",
              "黒石がアタリで、左へ伸びてもまたアタリです。右の白石は呼吸点が一つ。取りましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tl", diagram: [". . . . . .", ". O O . X .", ". . x O X .", ". O O X . .", ". . . . . ."] },
            success: L("提掉切断的子，你的子就连回去了。", "Capturing the cutting stone links your stones up again.", "끊은 돌을 따내니 흑돌이 다시 이어졌습니다.", "切った石を取れば、黒石はまたつながります。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角同样的情况。先找只剩一口气的白子。",
              "The same situation in the lower left. First find the white stone with one liberty.",
              "왼쪽 아래 귀도 같은 상황입니다. 활로가 하나뿐인 백돌을 먼저 찾으세요.",
              "左下の隅も同じ状況です。呼吸点一つの白石をまず探しましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "bl", diagram: [". . . . . .", ". O O X . .", ". . x O X .", ". O O . X .", ". . . . . ."] },
            success: L("反吃是最好的防守。", "Capturing back is the best defence.", "되잡는 것이 최선의 수비입니다.", "取り返すのが最善の守りです。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角的黑子也被打吃了。找到自救的反吃。",
              "Your stone in the upper right is in atari too. Find the capture that saves it.",
              "오른쪽 위 흑돌도 단수입니다. 스스로 사는 되잡기를 찾으세요.",
              "右上の黒石もアタリです。助かるための取りを見つけましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tr", diagram: [". . . . . .", ". X . O O .", ". X O x . .", ". . X O O .", ". . . . . ."] },
            success: L("对方也有弱点，被打吃时别慌。", "Your opponent has weaknesses too; do not panic in atari.", "상대에게도 약점이 있습니다. 단수에도 당황하지 마세요.", "相手にも弱点があります。アタリでも慌てずに。"),
          },
        ],
      },
      {
        id: "escape-ladder",
        title: L("征子能不能成立", "Does the ladder work?", "축이 되는가", "シチョウは成立するか"),
        steps: [
          {
            kind: "read",
            text: L(
              "被征子追的时候，先看征子的路线上有没有你的子。如果有，逃到那里就能连上，征子就失败了。这颗子叫“引征”。",
              "When you are chased in a ladder, look along its path. If one of your stones waits there, you reach it and the ladder fails. That stone is a ladder breaker.",
              "축으로 쫓길 때는 축의 길목을 살펴보세요. 그곳에 내 돌이 있으면 그 돌과 이어져 축이 깨집니다. 그런 돌을 축머리라고 합니다.",
              "シチョウで追われたら、その道筋を見ます。そこに自分の石があれば、つながってシチョウは失敗します。その石をシチョウアタリと言います。",
            ),
            board: {
              size: 19,
              corner: "tl",
              diagram: [". . . . . . .", ". X . . . . .", ". . . . O . .", ". . O X O . .", ". . . O . . .", ". . . . . . ."],
              marks: [{ x: 1, y: 1, type: "square" }],
            },
          },
          {
            kind: "problem",
            text: L(
              "黑子被打吃了。左上方有一颗黑子在等着。长出去，跑向它。",
              "Your stone is in atari. A black stone waits at the upper left. Extend and run toward it.",
              "흑돌이 단수입니다. 왼쪽 위에 흑돌이 기다리고 있습니다. 뻗어서 그쪽으로 달아나세요.",
              "黒石がアタリです。左上に黒石が待っています。伸びてそちらへ逃げましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tl", diagram: [". . . . . . .", ". X . . . . .", ". . . . O . .", ". . O x O . .", ". . . O . . .", ". . . . . . ."] },
            success: L("征子的路上有你的子，白棋追不上。", "Your stone stands in the ladder's path, so White cannot catch you.", "축 길목에 흑돌이 있어 백이 잡을 수 없습니다.", "シチョウの道に黒石があるので、白は取れません。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角也一样，引征的黑子在右上方。逃出去。",
              "The same in the upper right, with your breaker toward the corner. Escape.",
              "오른쪽 위 귀도 같습니다. 축머리 흑돌이 귀 쪽에 있습니다. 달아나세요.",
              "右上の隅も同じ。シチョウアタリの黒石が隅の方にあります。逃げましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tr", diagram: [". . . . . . .", ". . . . . X .", ". . O . . . .", ". . O x O . .", ". . . O . . .", ". . . . . . ."] },
            success: L("逃之前先确认征子的路线。", "Read the ladder's path before you run.", "달아나기 전에 축의 길을 확인하세요.", "逃げる前にシチョウの道筋を確かめましょう。"),
          },
          {
            kind: "problem",
            text: L(
              "右下角：引征的子在下方。往正确的方向长。",
              "Lower right: your breaker is further down. Extend in the right direction.",
              "오른쪽 아래: 축머리가 아래쪽에 있습니다. 올바른 방향으로 뻗으세요.",
              "右下：シチョウアタリの石は下の方です。正しい方向へ伸びましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "br", diagram: [". . . . . . .", ". . . O . . .", ". . O x O . .", ". . O . . . .", ". . . . . X .", ". . . . . . ."] },
            success: L("方向对了，征子就不成立。", "Run the right way and the ladder breaks.", "방향이 맞으면 축은 성립하지 않습니다.", "方向が正しければ、シチョウは成立しません。"),
          },
        ],
      },
    ],
  },
  /* ================================================================ UNIT 4 */
  {
    id: "connect",
    title: L("连接与切断", "Connecting and cutting", "연결과 끊기", "つなぎと切り"),
    summary: L(
      "实连、虎口、找切断点，以及切断后吃子。",
      "Solid and hanging connections, finding cutting points, and cutting to capture.",
      "꽉 잇기, 호구 잇기, 끊는 점 찾기, 끊어서 잡기.",
      "カタツギ、カケツギ（虎の口）、切りの急所、切って取る。",
    ),
    lessons: [
      {
        id: "connect-solid",
        title: L("实连", "Solid connection", "꽉 잇기", "カタツギ"),
        steps: [
          {
            kind: "read",
            text: L(
              "两块棋之间如果有一个空点，对方下在那里就能把它们分开，这个点叫“断点”。在断点上下一手，就把它们实实在在地连上了。",
              "If one empty point separates two of your groups, the opponent can play there and split them: a cutting point. Playing on it yourself makes a solid connection.",
              "두 덩어리 사이의 빈 점에 상대가 두면 갈라집니다. 이 점이 끊는 점입니다. 내가 그곳에 두면 꽉 이어집니다.",
              "二つの石の間の空点に相手が打つと分断されます。そこが切りの点です。自分で打てばしっかりつながります（カタツギ）。",
            ),
            board: {
              ...b9({ 3: ". . . O . . . . .", 4: ". . X . X . . . .", 5: ". . . O . . . . ." }),
              marks: [{ x: 3, y: 4, type: "triangle" }],
            },
          },
          {
            kind: "place",
            text: L(
              "白棋在上下两边都有子，正等着从中间切断。把两颗黑子连起来。",
              "White has stones above and below, waiting to cut between your stones. Connect your two stones.",
              "백이 위아래에 돌을 두고 가운데를 끊으려 합니다. 흑 두 점을 이으세요.",
              "白が上下に石を置き、間を切ろうとしています。黒二子をつなぎましょう。",
            ),
            board: b9({ 2: ". . . . . . . . .", 3: ". . . O . . . . .", 4: ". . X . X . . . .", 5: ". . . O . . . . .", 6: ". . . . . . X . ." }),
            toMove: 1,
            accept: [{ x: 3, y: 4 }],
            success: L("实连之后，再也切不断了。", "A solid connection can never be cut.", "꽉 이으면 절대 끊기지 않습니다.", "カタツギは決して切られません。"),
            wrong: L(
              "两颗黑子中间的那个空点就是断点，填上它。",
              "The empty point between the two black stones is the cutting point. Fill it.",
              "흑 두 점 사이의 빈 점이 끊는 점입니다. 그곳을 메우세요.",
              "黒二子の間の空点が切りの点です。そこを埋めましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "右边的黑子和左边的大部队只靠一个点相连。如果白棋切断，它就危险了。补上断点。",
              "Your stone on the right is linked to your group on the left through one point. If White cuts there, it is in trouble. Protect the cut.",
              "오른쪽 흑돌은 왼쪽 흑 덩어리와 한 점으로만 이어져 있습니다. 백이 끊으면 위험합니다. 끊는 점을 지키세요.",
              "右の黒石は左の黒と一点だけでつながっています。白に切られると危険です。切りを守りましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tl", diagram: [". . . . O .", ". . . x O .", ". X X O O .", ". . . O . .", ". . . . . ."] },
            success: L("断点补好了。下一课会看到，虎口也行。", "The cut is protected. As the next lesson shows, a hanging connection works too.", "끊는 점을 지켰습니다. 다음 강에서 보듯 호구로 이어도 됩니다.", "切りを守りました。次の課で見るように、カケツギでも大丈夫です。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角也有一样的断点。把黑子连好。",
              "The same cutting point in the upper right. Keep your stones connected.",
              "오른쪽 위 귀에도 같은 끊는 점이 있습니다. 흑돌을 이어 두세요.",
              "右上の隅にも同じ切りの点があります。黒石をつないでおきましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "tr", diagram: [". O . . . .", ". O x . . .", ". O O X X .", ". . O . . .", ". . . . . ."] },
            success: L("连在一起的棋子才有力量。", "Connected stones are strong stones.", "이어진 돌이 강한 돌입니다.", "つながった石こそ強い石です。"),
          },
        ],
      },
      {
        id: "connect-hanging",
        title: L("虎口", "Hanging connection", "호구", "虎の口"),
        steps: [
          {
            kind: "read",
            text: L(
              "三颗子围住一个点、留一个口子的形状叫“虎口”。对方下进虎口就只剩一口气，马上被提，所以虎口也是一种连接，而且更有效率。",
              "Three stones around one point, open on one side, make a tiger's mouth. An enemy stone played inside has a single liberty and is captured at once, so a tiger's mouth is a connection too, and often a more efficient one.",
              "세 돌이 한 점을 둘러싸고 한쪽만 열린 모양을 호구라고 합니다. 상대가 호구에 들어오면 활로가 하나뿐이라 바로 잡히므로, 호구도 연결이며 더 효율적일 때가 많습니다.",
              "三つの石が一点を囲み、一方だけ開いた形を虎の口と言います。相手が中に打つと呼吸点が一つですぐ取られるので、これも継ぎになります（カケツギ）。効率もよい形です。",
            ),
            board: {
              ...b9({ 4: ". . X . X . . . .", 5: ". . . X . . . . ." }),
              marks: [{ x: 3, y: 4, type: "triangle" }],
            },
          },
          {
            kind: "place",
            text: L(
              "两颗黑子之间有断点。这次不要直接实连，在断点旁边下一手，做成虎口。",
              "There is a cutting point between your stones. This time do not fill it: play one step away so it becomes a tiger's mouth.",
              "흑 두 점 사이에 끊는 점이 있습니다. 이번에는 꽉 잇지 말고, 한 칸 옆에 두어 호구로 만드세요.",
              "黒二子の間に切りの点があります。今回はカタツギではなく、一つ横に打って虎の口にしましょう。",
            ),
            board: b9({ 2: ". . . . . . . . .", 4: ". . X . X . . . .", 6: ". . . . . . O . ." }),
            toMove: 1,
            accept: [
              { x: 3, y: 3 },
              { x: 3, y: 5 },
            ],
            success: L("现在断点成了虎口，白棋下进去就会被提。", "The cutting point is now a tiger's mouth: a white stone there would be captured.", "끊는 점이 호구가 되었습니다. 백이 들어오면 잡힙니다.", "切りの点が虎の口になりました。白が入れば取られます。"),
            wrong: L(
              "虎口要在断点的旁边下，让三颗黑子围住断点。直接下在断点是实连。",
              "For a hanging connection, play next to the cutting point so three black stones surround it. Filling the point itself is a solid connection.",
              "호구는 끊는 점 바로 옆에 두어 흑 세 점이 그 점을 둘러싸게 합니다. 끊는 점 자체에 두면 꽉 잇기입니다.",
              "カケツギは切りの点の隣に打ち、黒三子でその点を囲みます。切りの点そのものに打つのはカタツギです。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "白子钻进了虎口。把它提掉。",
              "A white stone has walked into the tiger's mouth. Capture it.",
              "백돌이 호구에 들어왔습니다. 따내세요.",
              "白石が虎の口に入ってきました。取りましょう。",
            ),
            problem: { goal: "capture", escape: 2, at: [5, 3], diagram: [". . . . .", ". . X . .", ". X o X .", ". . . . ."] },
            success: L("下进虎口，就是送进枪口。", "Playing into a tiger's mouth is walking into the line of fire.", "호구에 들어오는 것은 스스로 잡히러 오는 것입니다.", "虎の口に入るのは、自分から取られに行くことです。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角的黑子有断点。实连或者虎口都可以，选一个补好。",
              "Your stone in the lower left has a cutting point. A solid or a hanging connection both work: pick one.",
              "왼쪽 아래 흑돌에 끊는 점이 있습니다. 꽉 잇기도 호구도 좋습니다. 하나를 골라 지키세요.",
              "左下の黒石に切りの点があります。カタツギでもカケツギでもよいので、守りましょう。",
            ),
            problem: { goal: "save", escape: 3, corner: "bl", diagram: [". . . . . .", ". . . O . .", ". X X O O .", ". . . x O .", ". . . . O ."] },
            success: L("实连坚固，虎口灵活，都能连上。", "Solid is sturdy, hanging is nimble; both connect.", "꽉 잇기는 튼튼하고 호구는 가볍습니다. 둘 다 연결입니다.", "カタツギは堅く、カケツギは軽い。どちらも継ぎです。"),
          },
        ],
      },
      {
        id: "connect-cut",
        title: L("找断点", "Finding cutting points", "끊는 점 찾기", "切りの点を探す"),
        steps: [
          {
            kind: "place",
            text: L(
              "两颗白子斜着相连，其中一个连接点已经被黑子占了。剩下的那个就是断点，切断它们。",
              "Two white stones are linked diagonally, and Black already holds one of the two linking points. The other one is the cutting point. Cut.",
              "백 두 점이 대각선으로 이어져 있고, 잇는 점 하나는 이미 흑이 차지했습니다. 남은 하나가 끊는 점입니다. 끊으세요.",
              "白二子は斜めにつながり、つなぎの点の一つはすでに黒が占めています。残る一つが切りの点です。切りましょう。",
            ),
            board: b9({ 3: ". . . O . . . . .", 4: ". . . X O . . . .", 6: ". . . . . . X . ." }),
            toMove: 1,
            accept: [{ x: 4, y: 3 }],
            success: L("切断了。现在两颗白子各自为战。", "Cut. Now each white stone must fend for itself.", "끊었습니다. 이제 백 두 점은 따로 싸워야 합니다.", "切りました。白二子はそれぞれ単独で戦うことになります。"),
            wrong: L(
              "找一个同时紧挨两颗白子的空点。",
              "Find the empty point that touches both white stones.",
              "두 백돌에 모두 붙어 있는 빈 점을 찾으세요.",
              "白二子の両方に接する空点を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋这三颗子看起来连着，其实有一个断点。找到它。",
              "These three white stones look connected, but there is one cutting point. Find it.",
              "백 세 점은 이어진 것처럼 보이지만 끊는 점이 하나 있습니다. 찾아보세요.",
              "白三子はつながって見えますが、切りの点が一つあります。見つけましょう。",
            ),
            board: b9({ 2: ". . . . . . . . .", 3: ". . O O X . . . .", 4: ". . X . O . . . .", 5: ". . . . X . . . ." }),
            toMove: 1,
            accept: [{ x: 3, y: 4 }],
            success: L("这一手把右边的白子切开了。", "That move cuts off the white stone on the right.", "이 수로 오른쪽 백돌이 끊어졌습니다.", "これで右の白石が切り離されました。"),
            wrong: L(
              "看看哪两颗白子只是斜着相对，中间还空着。",
              "Look for two white stones that only touch diagonally, with the linking points still open.",
              "대각선으로만 닿아 있고 잇는 점이 비어 있는 백돌 두 점을 찾으세요.",
              "斜めにしか接しておらず、つなぎの点が空いている白二子を探しましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "左边的白子只靠一个点和右边的白子相连。切断，然后吃掉它。",
              "The white stone on the left is linked to its friend on the right through a single point. Cut there, then capture it.",
              "왼쪽 백돌은 오른쪽 백돌과 한 점으로만 이어져 있습니다. 끊고 잡으세요.",
              "左の白石は右の白石と一点だけでつながっています。切って取りましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tl", diagram: [". . . . . . .", ". . X X . . .", ". X o . O . .", ". X . X . . .", ". . . . . . ."] },
            success: L("被切断的子往往活不了。", "A stone that is cut off often cannot survive.", "끊긴 돌은 살기 어려운 경우가 많습니다.", "切り離された石は生き延びにくいものです。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角也有一个只靠一点相连的白子。切断，吃掉。",
              "In the upper right, another white stone hangs on by a single point. Cut and capture.",
              "오른쪽 위에도 한 점으로만 이어진 백돌이 있습니다. 끊고 잡으세요.",
              "右上にも一点だけでつながる白石があります。切って取りましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tr", diagram: [". . . . . . .", ". . . X X . .", ". . O . o X .", ". . . X . X .", ". . . . . . ."] },
            success: L("断点就是对方的弱点。", "A cutting point is your opponent's weakness.", "끊는 점은 상대의 약점입니다.", "切りの点は相手の弱点です。"),
          },
        ],
      },
      {
        id: "connect-cut-capture",
        title: L("切断吃子", "Cut and capture", "끊어서 잡기", "切って取る"),
        steps: [
          {
            kind: "problem",
            text: L(
              "上边的白子在二路上，和右边的白子靠一个点相连。切断并打吃，把它赶向边线。",
              "The white stone on the second line connects to its friends through one point. Cut with atari and chase it along the edge.",
              "2선의 백돌은 오른쪽 백돌과 한 점으로 이어져 있습니다. 끊으면서 단수쳐 변으로 모세요.",
              "二線の白石は右の白石と一点でつながっています。切ってアタリにし、辺へ追いましょう。",
            ),
            problem: { goal: "capture", escape: 3, at: [2, 0], diagram: [". . . . . . .", ". . X o . . .", ". . . X O O .", ". . . . . . .", ". . . . . . ."] },
            success: L("切断加打吃，白子被赶到边上吃掉了。", "Cut, atari, and the stone dies on the edge.", "끊고 단수치니 백돌이 변에서 잡혔습니다.", "切ってアタリ、白石は辺で取られました。"),
          },
          {
            kind: "problem",
            text: L(
              "左边也有同样的机会。切断后一路打吃。",
              "The same chance on the left side. Cut, then keep giving atari.",
              "왼쪽 변에도 같은 기회가 있습니다. 끊고 계속 단수치세요.",
              "左辺にも同じチャンスがあります。切ってアタリを続けましょう。",
            ),
            problem: { goal: "capture", escape: 3, at: [0, 2], diagram: [". . . . .", ". . . . .", ". X . . .", ". o X . .", ". . O . .", ". . O . .", ". . . . ."] },
            success: L("边上的子被切断后最容易被吃。", "Stones near the edge are the easiest to capture once cut.", "변 근처 돌은 끊기면 가장 잡히기 쉽습니다.", "辺の近くの石は、切られると最も取られやすいのです。"),
          },
          {
            kind: "problem",
            text: L(
              "下边：找到断点，切断后吃掉白子。",
              "On the bottom edge: find the cut, then capture the white stone.",
              "아래 변: 끊는 점을 찾아 끊고 백돌을 잡으세요.",
              "下辺：切りの点を見つけ、切って白石を取りましょう。",
            ),
            problem: { goal: "capture", escape: 3, at: [6, 14], diagram: [". . . . . . .", ". . . . . . .", ". . . X O O .", ". . X o . . .", ". . . . . . ."] },
            success: L("看到断点，就要想一想能不能切。", "Whenever you see a cutting point, ask whether you can cut.", "끊는 점이 보이면 끊을 수 있는지 생각하세요.", "切りの点が見えたら、切れるかを考えましょう。"),
          },
        ],
      },
    ],
  },
  /* ================================================================ UNIT 5 */
  {
    id: "life",
    title: L("眼与活棋", "Eyes and life", "눈과 삶", "眼と生き"),
    summary: L(
      "什么是眼，为什么两只眼就活，假眼，以及在角上和边上做眼。",
      "What an eye is, why two eyes live, false eyes, and making eyes in the corner and on the side.",
      "눈이란 무엇인지, 왜 두 눈이면 사는지, 옥집, 귀와 변에서 눈 만들기.",
      "眼とは何か、なぜ二眼で生きるのか、欠け眼、隅と辺での眼の作り方。",
    ),
    lessons: [
      {
        id: "life-eye",
        title: L("什么是眼", "What an eye is", "눈이란", "眼とは"),
        steps: [
          {
            kind: "read",
            text: L(
              "被自己的棋子完全围住的空点叫“眼”。对方不能下进去，因为那里没有气，也提不到子。",
              "An empty point completely surrounded by your own stones is an eye. Your opponent cannot play there: a stone inside would have no liberties and capture nothing.",
              "내 돌로 완전히 둘러싸인 빈 점을 눈이라고 합니다. 상대는 그곳에 둘 수 없습니다. 들어가면 활로도 없고 따내는 돌도 없기 때문입니다.",
              "自分の石で完全に囲まれた空点を眼と言います。相手はそこに打てません。呼吸点がなく、何も取れないからです。",
            ),
            board: {
              ...b9({ 0: ". X . . O . . . .", 1: "X X . . O . . . .", 2: ". . . . O . . . ." }),
              marks: [{ x: 0, y: 0, type: "circle" }],
            },
          },
          {
            kind: "place",
            text: L(
              "这块黑棋周围有好几个空点，但只有一个是眼。点出它。",
              "This black group touches several empty points, but only one of them is an eye. Tap it.",
              "이 흑 덩어리 주변에 빈 점이 여럿 있지만 눈은 하나뿐입니다. 그 점을 누르세요.",
              "この黒の一団の周りには空点がいくつもありますが、眼は一つだけです。その点を選びましょう。",
            ),
            board: b9({ 0: ". . . . . . X . .", 1: ". . . . . X X X .", 2: ". . . . O X . X X", 3: ". . . . . O X X X", 4: ". . . . . O O X ." }),
            toMove: 1,
            accept: [{ x: 6, y: 2 }],
            success: L("四面都是黑子，这才是眼。", "Black stones on every side: that is an eye.", "사방이 흑돌이니 그것이 눈입니다.", "四方が黒石、それが眼です。"),
            wrong: L(
              "眼的每一个相邻点都必须是你自己的子。",
              "Every neighbour of an eye must be one of your stones.",
              "눈은 바로 옆 점이 모두 내 돌이어야 합니다.",
              "眼の隣の点は、すべて自分の石でなければなりません。",
            ),
          },
          {
            kind: "place",
            text: L(
              "上边这个空点差一颗子就成为眼。把它补成眼。",
              "The empty point on the top edge is one stone short of an eye. Complete the eye.",
              "위 변의 빈 점은 돌 하나만 더 있으면 눈이 됩니다. 눈을 완성하세요.",
              "上辺の空点は、あと一子で眼になります。眼を完成させましょう。",
            ),
            board: b9({ 0: ". X . X O . . . .", 1: "X X . X O . . . .", 2: "O O O O . . . . ." }),
            toMove: 1,
            accept: [{ x: 2, y: 1 }],
            success: L("现在角上和边上各有一只眼，一共两只眼。", "Now there is an eye in the corner and one on the edge: two eyes.", "이제 귀와 변에 눈이 하나씩, 두 눈입니다.", "これで隅と辺に一つずつ、二眼になりました。"),
            wrong: L(
              "看边上那个空点：它下方还开着口。把口堵上。",
              "Look at the empty point on the edge: it is still open below. Close it.",
              "변의 빈 점을 보세요. 아래쪽이 아직 열려 있습니다. 막으세요.",
              "辺の空点を見ましょう。下がまだ開いています。ふさぎましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑棋角上已经有一只眼。在右边再做一只眼，让这块棋活下来。",
              "Black already has an eye in the corner. Make a second eye on the right so the group lives.",
              "흑은 귀에 이미 눈이 하나 있습니다. 오른쪽에 두 번째 눈을 만들어 사세요.",
              "黒は隅にすでに一眼あります。右側にもう一眼作って生きましょう。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". X X . . O ,", "X X X X x O ,", "O O O O O O ,"] },
            success: L("两只分开的眼，这块棋活了。", "Two separate eyes: the group is alive.", "떨어진 두 눈, 이 덩어리는 살았습니다.", "離れた二つの眼で、この一団は生きました。"),
          },
        ],
      },
      {
        id: "life-two-eyes",
        title: L("两眼活棋", "Two eyes live", "두 눈이면 산다", "二眼で生き"),
        steps: [
          {
            kind: "read",
            text: L(
              "有两只分开的眼的棋永远提不掉：对方要提它，得同时填满两只眼，可每一只眼单独下进去都是禁着。",
              "A group with two separate eyes can never be captured. To capture it White would have to fill both eyes at once, and each one alone is a forbidden move.",
              "떨어진 두 눈을 가진 돌은 절대 잡히지 않습니다. 잡으려면 두 눈을 한꺼번에 메워야 하는데, 어느 쪽이든 하나만 두면 착수 금지이기 때문입니다.",
              "離れた二つの眼を持つ石は決して取られません。取るには両方の眼を同時に埋める必要がありますが、片方だけ打つのは着手禁止だからです。",
            ),
            board: {
              ...b9({ 0: ". X . X O . . . .", 1: "X X X X O . . . .", 2: "O O O O O . . . ." }),
              marks: [
                { x: 0, y: 0, type: "circle" },
                { x: 2, y: 0, type: "circle" },
              ],
            },
          },
          {
            kind: "problem",
            text: L(
              "角上有一排三个空点，叫“直三”。下在正中间，分成两只眼。",
              "Three empty points in a row form a straight three. Play the middle point to split it into two eyes.",
              "빈 점 세 개가 일자로 있는 모양을 직삼이라고 합니다. 가운데에 두어 두 눈으로 나누세요.",
              "空点が三つ一列に並んだ形を直三と言います。真ん中に打って二眼に分けましょう。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". . . X O ,", "X X x X O ,", "O O O O O ,"] },
            success: L("直三的中间是要点，自己下就活。", "The middle of a straight three is the vital point: take it and you live.", "직삼의 가운데가 급소입니다. 먼저 두면 삽니다.", "直三の真ん中が急所。自分で打てば生きです。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角也是直三。找到要点。",
              "Another straight three, in the upper right. Find the vital point.",
              "오른쪽 위에도 직삼이 있습니다. 급소를 찾으세요.",
              "右上にも直三があります。急所を探しましょう。",
            ),
            problem: { goal: "live", corner: "tr", diagram: [", O X . . .", ", O X x X X", ", O O O O O"] },
            success: L("要点被对方占了就只剩一只眼，所以要抢先。", "If White took that point you would have only one eye, so take it first.", "백이 그 점을 차지하면 눈이 하나뿐이니 먼저 두어야 합니다.", "白にそこを打たれると一眼だけ。だから先に打ちます。"),
          },
          {
            kind: "problem",
            text: L(
              "这次三个空点拐了个弯，叫“曲三”。要点在哪里？",
              "This time the three empty points bend: a bent three. Where is the vital point?",
              "이번에는 빈 점 세 개가 꺾여 있습니다. 곡삼이라고 합니다. 급소는 어디일까요?",
              "今度は三つの空点が曲がっています。曲がり三です。急所はどこでしょう。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". . X O ,", ". x X O ,", "X X O O ,", "O O O , ,"] },
            success: L("曲三的要点在拐角，下在那里分出两只眼。", "The vital point of a bent three is the corner of the bend.", "곡삼의 급소는 꺾인 곳입니다. 그곳에 두어 두 눈을 만듭니다.", "曲がり三の急所は曲がり角。そこで二眼に分かれます。"),
          },
        ],
      },
      {
        id: "life-false-eye",
        title: L("假眼", "False eyes", "옥집", "欠け眼"),
        steps: [
          {
            kind: "read",
            text: L(
              "看起来像眼，但对方能打吃旁边的子、逼你填掉它，这样的眼叫“假眼”。边上的眼两个斜角都要是自己的子，标记的三角点就是假眼。",
              "A point can look like an eye, yet if White can put a neighbouring stone in atari and force you to fill it, it is a false eye. On the edge both diagonal points must be yours; the triangle marks a false eye.",
              "눈처럼 보여도 상대가 옆 돌을 단수쳐서 메우게 만들 수 있으면 옥집입니다. 변의 눈은 양쪽 대각선 점이 모두 내 돌이어야 합니다. 세모 표시가 옥집입니다.",
              "眼に見えても、相手が隣の石をアタリにして埋めさせられるなら欠け眼です。辺の眼は斜めの二点がどちらも自分の石である必要があります。三角の点が欠け眼です。",
            ),
            board: {
              ...b9({ 0: ". X . X . O . . .", 1: "X X X O O . . . .", 2: "O O O . . . . . ." }),
              marks: [
                { x: 0, y: 0, type: "circle" },
                { x: 2, y: 0, type: "triangle" },
              ],
            },
          },
          {
            kind: "place",
            text: L(
              "右下这块黑棋有两只“眼”，其中一只是假的。点出真眼。",
              "This black group at the lower right has two eye-shaped points, but one is false. Tap the real eye.",
              "오른쪽 아래 흑 덩어리에 눈 모양이 둘 있지만 하나는 옥집입니다. 진짜 눈을 누르세요.",
              "右下の黒には眼の形が二つありますが、一つは欠け眼です。本物の眼を選びましょう。",
            ),
            board: b9({ 6: ". . . . O O O O O", 7: ". . . . O O X X X", 8: ". . . . O X . X ." }),
            toMove: 1,
            accept: [{ x: 8, y: 8 }],
            success: L("角上的眼完好无缺，另一只是假眼。", "The corner eye is sound; the other one is false.", "귀의 눈은 온전하고, 다른 하나는 옥집입니다.", "隅の眼は完全で、もう一つは欠け眼です。"),
            wrong: L(
              "那只眼旁边的黑子只剩一口气，白棋下进去就能把它提掉。",
              "The black stone beside that eye has one liberty, so White can play inside and capture it.",
              "그 눈 옆의 흑돌은 활로가 하나뿐이라 백이 안에 두면 따낼 수 있습니다.",
              "その眼の隣の黒石は呼吸点が一つで、白は中に打って取れます。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "右边那只眼有缺陷：右边的黑子和大部队没连上。补一手，让两只眼都是真眼。",
              "The eye on the right has a flaw: the black stones on the right are not connected to the rest. Mend it so both eyes are real.",
              "오른쪽 눈에 약점이 있습니다. 오른쪽 흑돌들이 본대와 이어지지 않았습니다. 보강해서 두 눈 모두 진짜 눈으로 만드세요.",
              "右の眼には欠陥があります。右側の黒石が本体とつながっていません。手入れして両方を本物の眼にしましょう。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". X . X . O ,", "X X X . x O ,", "O O O O O O ,"] },
            success: L("连上之后，假眼变成了真眼。", "Once connected, the false eye becomes a real one.", "이으니 옥집이 진짜 눈이 되었습니다.", "つながって、欠け眼が本物の眼になりました。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角是同样的形状。找到那个关键的连接点。",
              "The same shape in the lower left. Find the key connecting point.",
              "왼쪽 아래 귀도 같은 모양입니다. 핵심 연결점을 찾으세요.",
              "左下の隅も同じ形です。かなめのつなぎの点を探しましょう。",
            ),
            problem: { goal: "live", corner: "bl", diagram: ["O O O O O O ,", "X X X . x O ,", ". X . X . O ,"] },
            success: L("做眼时也要注意自己的断点。", "When making eyes, watch your own cutting points.", "눈을 만들 때도 자기 끊는 점을 조심하세요.", "眼を作る時も、自分の切りの点に気をつけましょう。"),
          },
        ],
      },
      {
        id: "life-corner",
        title: L("角上做活", "Living in the corner", "귀에서 살기", "隅での生き"),
        steps: [
          {
            kind: "problem",
            text: L(
              "角上的黑棋眼位不小，但还没有两只眼。找到能分出两只眼的一手。",
              "Black's corner group has a fair amount of space but not yet two eyes. Find the move that divides it into two.",
              "귀의 흑은 궁도가 꽤 넓지만 아직 두 눈이 없습니다. 두 눈으로 나누는 한 수를 찾으세요.",
              "隅の黒は広さはありますが、まだ二眼ではありません。二つに分ける一手を探しましょう。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". . . X O ,", ". . . X O ,", "X X X x O ,", "O O O O O ,"] },
            success: L("占住中心点，两边各成一只眼。", "Take the central point and an eye forms on each side.", "가운데 점을 차지하니 양쪽에 눈이 하나씩 생깁니다.", "中心を占めれば、両側に一眼ずつできます。"),
          },
          {
            kind: "problem",
            text: L(
              "这个眼位是“丁”字形的四个点。中间那一点最关键。",
              "This eye space is four points in a T shape: a pyramid four. The middle point is the key.",
              "이 궁도는 T자 모양의 네 점, 삿갓 사궁입니다. 가운데 점이 급소입니다.",
              "この眼形はT字形の四目です。真ん中の点が急所です。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". . . X O ,", "X . X X O ,", "X x X O O ,", "O O O O , ,"] },
            success: L("丁四的中心是要点：自己下就活，被点就死。", "The centre of a pyramid four is vital: take it and live; lose it and die.", "삿갓 사궁의 가운데가 급소입니다. 차지하면 살고, 빼앗기면 죽습니다.", "丁四の中心が急所。打てば生き、打たれれば死にです。"),
          },
          {
            kind: "problem",
            text: L(
              "五个空点挤成一团，叫“刀把五”。找到分出两只眼的要点。",
              "Five empty points in a clump make a bulky five. Find the vital point that makes two eyes.",
              "빈 점 다섯이 뭉친 모양을 뭉친 오궁이라고 합니다. 두 눈을 만드는 급소를 찾으세요.",
              "五つの空点がかたまった形を刀五と言います。二眼を作る急所を探しましょう。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". . . X O ,", ". . X X O ,", "X X x O O ,", "O O O O , ,"] },
            success: L("刀把五的要点在最多空点相邻的位置。", "The vital point of the bulky five touches the most empty points.", "뭉친 오궁의 급소는 빈 점과 가장 많이 맞닿은 곳입니다.", "刀五の急所は、最も多くの空点に接する点です。"),
          },
          {
            kind: "problem",
            text: L(
              "右下角的曲三。抢占要点做活。",
              "A bent three in the lower right. Take the vital point and live.",
              "오른쪽 아래 귀의 곡삼입니다. 급소를 차지해 사세요.",
              "右下の隅の曲がり三。急所を打って生きましょう。",
            ),
            problem: { goal: "live", corner: "br", diagram: [", , O O O", ", O O X X", ", O X x .", ", O X . ."] },
            success: L("不同的角，相同的要点。", "Different corner, same vital point.", "다른 귀, 같은 급소입니다.", "違う隅でも、急所は同じです。"),
          },
        ],
      },
      {
        id: "life-side",
        title: L("边上做活", "Living on the side", "변에서 살기", "辺での生き"),
        steps: [
          {
            kind: "problem",
            text: L(
              "边上的黑棋有一个直三。把它分成两只眼。",
              "Black's group on the side has a straight three. Divide it into two eyes.",
              "변의 흑에 직삼이 있습니다. 두 눈으로 나누세요.",
              "辺の黒に直三があります。二眼に分けましょう。",
            ),
            problem: { goal: "live", at: [5, 0], diagram: [", O X . . . X O ,", ", O X X x X X O ,", ", O O O O O O O ,"] },
            success: L("边上和角上一样，直三下中间。", "On the side as in the corner: a straight three is split in the middle.", "변에서도 귀와 같이 직삼은 가운데입니다.", "辺でも隅と同じく、直三は真ん中です。"),
          },
          {
            kind: "problem",
            text: L(
              "这块边上的棋是曲三。找到要点。",
              "This group on the side has a bent three. Find the vital point.",
              "이 변의 흑은 곡삼입니다. 급소를 찾으세요.",
              "この辺の黒は曲がり三です。急所を探しましょう。",
            ),
            problem: { goal: "live", at: [5, 0], diagram: [", O X . . X O ,", ", O X X . X O ,", ", O O X x X O ,", ", , O O O O O ,"] },
            success: L("拐角处就是曲三的要点。", "The corner of the bend is the vital point.", "꺾인 곳이 곡삼의 급소입니다.", "曲がり角が曲がり三の急所です。"),
          },
          {
            kind: "problem",
            text: L(
              "黑棋左边的一路还开着口，白棋想从那里钻进来。先挡住，眼位就够了。",
              "On the left the first line is still open, and White wants to crawl in. Block it first and you keep enough room for two eyes.",
              "왼쪽 1선이 아직 열려 있어 백이 기어들어 오려 합니다. 먼저 막으면 두 눈을 만들 공간이 남습니다.",
              "左の一線がまだ開いていて、白がはい込もうとしています。先に止めれば二眼の広さが残ります。",
            ),
            problem: { goal: "live", at: [4, 0], diagram: [", . . . . . O ,", ", O X x X X O ,", ", O O O O O O ,"] },
            success: L("挡住入口，眼位就保住了。", "Block the entrance and your eye space stays yours.", "입구를 막으니 궁도가 지켜졌습니다.", "入口を止めて、眼形を守りました。"),
          },
        ],
      },
      {
        id: "life-space",
        title: L("眼位的大小", "Eye space", "궁도의 넓이", "眼形の広さ"),
        steps: [
          {
            kind: "read",
            text: L(
              "眼位越大越容易活，太小就做不出两只眼。对方会从外面压缩你的眼位，所以有时要先把眼位扩大或守住。",
              "The more room a group has, the easier it lives; too little and two eyes will not fit. The opponent squeezes your space from outside, so sometimes you must widen or protect it first.",
              "궁도가 넓을수록 살기 쉽고, 너무 좁으면 두 눈이 들어가지 않습니다. 상대가 바깥에서 궁도를 줄여 오므로 먼저 넓히거나 지켜야 할 때가 있습니다.",
              "眼形は広いほど生きやすく、狭すぎると二眼が入りません。相手は外から眼形を狭めてくるので、先に広げたり守ったりする必要があります。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "白棋想从右边缩小黑棋的眼位。先在角上下一手，确保做出两只眼。",
              "White wants to shrink Black's space from the right. Play the key point in the corner so two eyes are guaranteed.",
              "백이 오른쪽에서 흑의 궁도를 줄이려 합니다. 귀의 급소에 먼저 두어 두 눈을 확보하세요.",
              "白は右から黒の眼形を狭めようとしています。隅の要所に先に打って、二眼を確保しましょう。",
            ),
            problem: { goal: "live", corner: "tl", diagram: [". . . . O ,", ". X X x O ,", "X X O O O ,", "O O O , , ,"] },
            success: L("先占好角上的要点，白棋再缩小也来不及了。", "With the corner point taken, White's squeeze comes too late.", "귀의 급소를 먼저 차지하니 백이 줄여도 늦습니다.", "隅の要所を先に打てば、白が狭めても間に合いません。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角同样的形状，方向反过来了。",
              "The same shape in the upper right, facing the other way.",
              "오른쪽 위 귀의 같은 모양입니다. 방향만 반대입니다.",
              "右上の隅の同じ形。向きが逆になっています。",
            ),
            problem: { goal: "live", corner: "tr", diagram: [", O . . . .", ", O x X X .", ", O O O X X", ", , , O O O"] },
            success: L("形状相同，要点也相同。", "Same shape, same key point.", "같은 모양이면 급소도 같습니다.", "形が同じなら急所も同じです。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角再来一次。白棋正要从右边缩小眼位。",
              "Once more, in the lower left. White is about to squeeze from the right.",
              "왼쪽 아래에서 한 번 더. 백이 오른쪽에서 궁도를 줄이려 합니다.",
              "左下でもう一度。白が右から狭めようとしています。",
            ),
            problem: { goal: "live", corner: "bl", diagram: ["O O O , , ,", "X X O O O ,", ". X X x O ,", ". . . . O ,"] },
            success: L("眼位的要点往往在角上。", "The key point of eye space is often in the corner itself.", "궁도의 급소는 귀 자체에 있는 경우가 많습니다.", "眼形の急所は、隅そのものにあることが多いのです。"),
          },
        ],
      },
    ],
  },
  /* ================================================================ UNIT 6 */
  {
    id: "kill",
    title: L("杀棋", "Killing", "잡기", "殺し"),
    summary: L(
      "点眼：抢占直三、曲三、丁四、刀把五的要点，以及从外面缩小眼位。",
      "Take the vital point of straight three, bent three, the pyramid four and bulky five, and shrink eye space from outside.",
      "직삼, 곡삼, 삿갓 사궁, 뭉친 오궁의 급소에 치중하기, 바깥에서 궁도를 줄이기.",
      "直三、曲がり三、丁四、刀五の急所に置き、外から眼形を狭める。",
    ),
    lessons: [
      {
        id: "kill-straight-three",
        title: L("点直三", "Killing a straight three", "직삼 잡기", "直三を殺す"),
        steps: [
          {
            kind: "read",
            text: L(
              "活棋的要点也是杀棋的要点。白棋只有一个直三时，黑棋抢先下在中间“点眼”，白棋就只剩一只眼。",
              "The point that makes life is the point that kills. When White has only a straight three, Black plays its middle first and White is left with one eye.",
              "사는 급소가 곧 잡는 급소입니다. 백이 직삼뿐일 때 흑이 먼저 가운데에 치중하면 백은 눈이 하나뿐입니다.",
              "生きる急所は殺す急所でもあります。白が直三だけなら、黒が先に真ん中に置けば白は一眼しかできません。",
            ),
            board: {
              size: 19,
              corner: "tl",
              diagram: [". . . O X ,", "O O O O X ,", "X X X X X ,"],
              marks: [{ x: 1, y: 0, type: "triangle" }],
            },
          },
          {
            kind: "problem",
            text: L(
              "右上角白棋有一个直三。点眼杀死它。",
              "White has a straight three in the upper right. Take the vital point and kill it.",
              "오른쪽 위 백은 직삼입니다. 급소에 치중해 잡으세요.",
              "右上の白は直三です。急所に置いて殺しましょう。",
            ),
            problem: { goal: "kill", corner: "tr", diagram: [", X O . . .", ", X O o O O", ", X X X X X"] },
            success: L("白棋做不出第二只眼了。", "White cannot make a second eye.", "백은 두 번째 눈을 만들 수 없습니다.", "白は二つ目の眼を作れません。"),
          },
          {
            kind: "problem",
            text: L(
              "边上也有一个直三。下在要点上。",
              "A straight three on the side. Play the vital point.",
              "변에도 직삼이 있습니다. 급소에 두세요.",
              "辺にも直三があります。急所に打ちましょう。",
            ),
            problem: { goal: "kill", at: [5, 0], diagram: [", X O . . . O X ,", ", X O O o O O X ,", ", X X X X X X X ,"] },
            success: L("点在中间，白棋两边都成不了眼。", "With your stone in the middle, neither side can become an eye.", "가운데에 치중하니 양쪽 어디도 눈이 되지 않습니다.", "真ん中に置かれて、白はどちら側も眼になりません。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角的直三。点眼。",
              "A straight three in the lower left. Kill it.",
              "왼쪽 아래 귀의 직삼입니다. 잡으세요.",
              "左下の隅の直三です。殺しましょう。",
            ),
            problem: { goal: "kill", corner: "bl", diagram: ["X X X X X ,", "O O o O X ,", ". . . O X ,"] },
            success: L("直三：先下中间者胜。", "Straight three: whoever plays the middle first wins.", "직삼은 가운데를 먼저 두는 쪽이 이깁니다.", "直三は、真ん中を先に打った方の勝ちです。"),
          },
        ],
      },
      {
        id: "kill-bent-three",
        title: L("点曲三", "Killing a bent three", "곡삼 잡기", "曲がり三を殺す"),
        steps: [
          {
            kind: "problem",
            text: L(
              "白棋角上是曲三。下在拐角处的要点。",
              "White has a bent three in the corner. Play the vital point at the bend.",
              "백은 귀에 곡삼입니다. 꺾인 곳의 급소에 두세요.",
              "白は隅に曲がり三です。曲がり角の急所に打ちましょう。",
            ),
            problem: { goal: "kill", corner: "tl", diagram: [". . O X ,", ". o O X ,", "O O X X ,", "X X X , ,"] },
            success: L("曲三被点，白棋只剩一只眼。", "With the bend taken, White has only one eye.", "곡삼에 치중당해 백은 눈이 하나뿐입니다.", "曲がり三に置かれ、白は一眼だけです。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角的曲三。找到要点。",
              "A bent three in the upper right. Find the vital point.",
              "오른쪽 위 귀의 곡삼입니다. 급소를 찾으세요.",
              "右上の隅の曲がり三。急所を探しましょう。",
            ),
            problem: { goal: "kill", corner: "tr", diagram: [", X O . .", ", X O o .", ", X X O O", ", , X X X"] },
            success: L("同样的形，同样的要点。", "Same shape, same vital point.", "같은 모양, 같은 급소입니다.", "同じ形、同じ急所です。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角的曲三。点眼。",
              "A bent three in the lower left. Kill it.",
              "왼쪽 아래 귀의 곡삼입니다. 잡으세요.",
              "左下の隅の曲がり三です。殺しましょう。",
            ),
            problem: { goal: "kill", corner: "bl", diagram: ["X X X , ,", "O O X X ,", ". o O X ,", ". . O X ,"] },
            success: L("在角上，曲三的要点常常就是角上那一点。", "In the corner, the vital point of a bent three is often the corner point itself.", "귀에서는 곡삼의 급소가 귀 그 자체인 경우가 많습니다.", "隅では、曲がり三の急所は隅の一点そのものであることが多いのです。"),
          },
          {
            kind: "problem",
            text: L(
              "边上的曲三。点眼杀棋。",
              "A bent three on the side. Kill it.",
              "변의 곡삼입니다. 치중해서 잡으세요.",
              "辺の曲がり三です。置いて殺しましょう。",
            ),
            problem: { goal: "kill", at: [5, 0], diagram: [", X O . . O X ,", ", X O O . O X ,", ", X X O o O X ,", ", , X X X X X ,"] },
            success: L("直三、曲三，都是“先下要点者胜”。", "Straight or bent, the side that takes the vital point first wins.", "직삼이든 곡삼이든 급소를 먼저 두는 쪽이 이깁니다.", "直三も曲がり三も、急所を先に打った方の勝ちです。"),
          },
        ],
      },
      {
        id: "kill-four-five",
        title: L("丁四与刀把五", "The pyramid four and bulky five", "삿갓 사궁과 뭉친 오궁", "丁四と刀五"),
        steps: [
          {
            kind: "read",
            text: L(
              "有些四个点、五个点的眼位也能被点死：要点总是和最多空点相邻的那个点。被点之后，白棋怎么下都只能做出一只眼。",
              "Some four- and five-point eye spaces can be killed too. The vital point is always the one that touches the most empty points; once it is taken, White can only make one eye.",
              "네 점, 다섯 점짜리 궁도도 치중으로 잡을 수 있습니다. 급소는 언제나 빈 점과 가장 많이 맞닿은 점입니다. 그곳을 빼앗기면 백은 눈을 하나밖에 만들지 못합니다.",
              "四目や五目の眼形でも、置いて殺せるものがあります。急所はいつも最も多くの空点に接する点で、そこを打たれると白は一眼しか作れません。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "白棋的眼位是丁四。点在中心。",
              "White's eye space is a pyramid four. Play its centre.",
              "백의 궁도는 삿갓 사궁입니다. 가운데에 치중하세요.",
              "白の眼形は丁四です。中心に置きましょう。",
            ),
            problem: { goal: "kill", corner: "tl", diagram: [". . . O X ,", "O . O O X ,", "O o O X X ,", "X X X X , ,"] },
            success: L("丁四被点中心，就是死形。", "A pyramid four with its centre taken is dead.", "가운데에 치중당한 삿갓 사궁은 죽은 모양입니다.", "中心に置かれた丁四は死に形です。"),
          },
          {
            kind: "problem",
            text: L(
              "白棋的眼位是刀把五。找到要点。",
              "White's eye space is a bulky five. Find the vital point.",
              "백의 궁도는 뭉친 오궁입니다. 급소를 찾으세요.",
              "白の眼形は刀五です。急所を探しましょう。",
            ),
            problem: { goal: "kill", corner: "tl", diagram: [". . . O X ,", ". . O O X ,", "O O o X X ,", "X X X X , ,"] },
            success: L("点中刀把五的要点，白棋就活不了。", "Take the bulky five's vital point and White cannot live.", "뭉친 오궁의 급소를 차지하면 백은 살 수 없습니다.", "刀五の急所を打てば、白は生きられません。"),
          },
          {
            kind: "problem",
            text: L(
              "右下角的丁四。点眼。",
              "A pyramid four in the lower right. Kill it.",
              "오른쪽 아래 귀의 삿갓 사궁입니다. 잡으세요.",
              "右下の隅の丁四です。殺しましょう。",
            ),
            problem: { goal: "kill", corner: "br", diagram: [", , X X X X", ", X X O o O", ", X O O . O", ", X O . . ."] },
            success: L("找要点的方法：看哪一点挨着最多空点。", "To find the vital point, look for the point next to the most empty points.", "급소 찾기: 빈 점과 가장 많이 닿은 점을 보세요.", "急所の見つけ方：最も多くの空点に接する点を見ます。"),
          },
        ],
      },
      {
        id: "kill-reduce",
        title: L("缩小眼位与点", "Reduce and place", "궁도 줄이기와 치중", "眼形を狭める・置く"),
        steps: [
          {
            kind: "read",
            text: L(
              "眼位还没定型时，可以从一路下手：有时在一路扳缩小眼位，有时直接点进里面的要点，让白棋来不及做两只眼。",
              "When the eye space is not settled yet, work on the first line: sometimes shrink it with a hane from the end, sometimes place a stone right on the vital point inside so White cannot fit two eyes.",
              "궁도가 아직 정해지지 않았으면 1선에서 공략합니다. 끝에서 젖혀 궁도를 줄이기도 하고, 안쪽 급소에 바로 치중해 두 눈을 못 만들게 하기도 합니다.",
              "眼形がまだ決まっていない時は一線で攻めます。端からハネて狭めたり、中の急所に直接置いたりして、二眼を作らせません。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "二路上的白棋还有空间。从一路下手，不让它做出两只眼。",
              "The white stones on the second line still have room. Work from the first line and deny them two eyes.",
              "2선의 백은 아직 궁도가 넓습니다. 1선에서 공략해 두 눈을 못 만들게 하세요.",
              "二線の白にはまだ広さがあります。一線から攻めて二眼を作らせないようにしましょう。",
            ),
            problem: { goal: "kill", corner: "tl", diagram: [". . . . . X ,", "O O O O o X ,", "X X X X X X ,"] },
            success: L("眼位一小，白棋就只剩一只眼。", "Once the space is small enough, White has only one eye.", "궁도가 좁아지니 백은 눈이 하나뿐입니다.", "眼形が狭くなり、白は一眼だけです。"),
          },
          {
            kind: "problem",
            text: L(
              "这块白棋更长一些。一路的要点在哪里？",
              "This white group is a little longer. Where is the key point on the first line?",
              "이 백은 조금 더 깁니다. 1선의 급소는 어디일까요?",
              "この白はもう少し長い形です。一線の急所はどこでしょう。",
            ),
            problem: { goal: "kill", corner: "tl", diagram: [". . . . . . X X ,", "O O O O o X . X ,", "X X X X X X X X ,"] },
            success: L("点在二一路，白棋两边顾不过来。", "A stone placed on the first line next to the corner leaves White unable to cover both sides.", "귀 옆 1선에 치중하니 백은 양쪽을 다 지키지 못합니다.", "隅の隣の一線に置かれ、白は両側を守りきれません。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角同样的形。杀死白棋。",
              "The same shape in the upper right. Kill the white group.",
              "오른쪽 위 귀의 같은 모양입니다. 백을 잡으세요.",
              "右上の隅の同じ形です。白を殺しましょう。",
            ),
            problem: { goal: "kill", corner: "tr", diagram: [", X X . . . . . .", ", X . X o O O O O", ", X X X X X X X X"] },
            success: L("杀棋的第一步：想一想白棋的眼会做在哪里。", "Killing starts with asking where White wants to make its eyes.", "잡기의 첫걸음은 백이 어디에 눈을 만들지 생각하는 것입니다.", "殺しの第一歩は、白がどこに眼を作りたいかを考えることです。"),
          },
          {
            kind: "problem",
            text: L(
              "白棋角上有六个空点，但外面没有气了。点进去。",
              "White has six empty points in the corner but no outside liberties. Place a stone inside.",
              "백은 귀에 빈 점이 여섯 있지만 바깥 활로가 없습니다. 안에 치중하세요.",
              "白は隅に空点が六つありますが、外の呼吸点がありません。中に置きましょう。",
            ),
            problem: { goal: "kill", corner: "tl", diagram: [". . . O X ,", ". . . O X ,", "O O o O X ,", "X X X X X ,"] },
            success: L("外面没有气的棋，眼位再大也可能被点死。", "With no outside liberties, even a roomy group can be killed by a placement.", "바깥 활로가 없으면 넓은 궁도도 치중으로 잡힐 수 있습니다.", "外の呼吸点がなければ、広い眼形でも置きで殺せることがあります。"),
          },
        ],
      },
    ],
  },
  /* ================================================================ UNIT 7 */
  {
    id: "race",
    title: L("对杀", "Capturing races", "수상전", "攻め合い"),
    summary: L(
      "两块都没有活的棋互相包围时，数清气，先紧外气，小心公气。",
      "When two groups without life surround each other: count liberties, fill outside liberties first, and beware of shared ones.",
      "살지 못한 두 덩어리가 서로 에워쌀 때: 활로를 세고, 바깥 공배부터 메우고, 공동 공배를 조심하기.",
      "生きていない石同士が囲み合う時：呼吸点を数え、外ダメから詰め、内ダメに注意する。",
    ),
    lessons: [
      {
        id: "race-count",
        title: L("数气", "Count the liberties", "활로 세기", "呼吸点を数える"),
        steps: [
          {
            kind: "read",
            text: L(
              "对杀就是比谁的气多。先数清双方的气，然后一口一口紧对方的气。气一样多时，先下的一方赢。",
              "A capturing race is a contest of liberties. Count both sides, then take the opponent's liberties one by one. With equal liberties, whoever moves first wins.",
              "수상전은 활로 싸움입니다. 양쪽 활로를 센 다음 상대 활로를 하나씩 메웁니다. 활로가 같으면 먼저 두는 쪽이 이깁니다.",
              "攻め合いは呼吸点の数の勝負です。双方を数えて、相手の呼吸点を一つずつ詰めます。同数なら先に打つ方が勝ちます。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑白各有两口气，轮到黑棋。紧白棋的气，赢下对杀。",
              "Black and White have two liberties each, and it is Black's turn. Fill White's liberties and win the race.",
              "흑백 모두 활로가 둘이고 흑 차례입니다. 백의 활로를 메워 수상전에서 이기세요.",
              "黒白とも呼吸点は二つ、黒番です。白の呼吸点を詰めて攻め合いに勝ちましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "tl", diagram: [". o X . O ,", ". o X . O ,", "X o X O O ,", "X X O O , ,", ", , , , , ,"] },
            success: L("同样的气，先下的赢。", "Equal liberties: the first to move wins.", "활로가 같으면 먼저 두는 쪽이 이깁니다.", "同数なら先手の勝ちです。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角的对杀。数一数，然后紧气。",
              "A race in the lower left. Count, then fill.",
              "왼쪽 아래 귀의 수상전입니다. 세어 보고 메우세요.",
              "左下の隅の攻め合いです。数えてから詰めましょう。",
            ),
            problem: { goal: "capture", escape: 3, corner: "bl", diagram: [", , , , , ,", "X X O O , ,", "X o X O O ,", ". o X . O ,", ". o X . O ,"] },
            success: L("紧对方的气，不要去补自己的气。", "Fill the opponent's liberties; adding to your own here is too slow.", "상대 활로를 메우세요. 여기서 내 활로를 늘리는 것은 늦습니다.", "相手の呼吸点を詰めましょう。ここで自分の呼吸点を増やすのは遅すぎます。"),
          },
          {
            kind: "problem",
            text: L(
              "白棋有三口气，黑棋也有三口气。轮到黑棋，一口一口地紧。",
              "White has three liberties and so does Black. Black to play: fill them one at a time.",
              "백도 흑도 활로가 셋입니다. 흑 차례이니 하나씩 메우세요.",
              "白も黒も呼吸点は三つ。黒番なので、一つずつ詰めましょう。",
            ),
            problem: { goal: "capture", corner: "tl", escape: 4, diagram: [". o X . O ,", ". o X . O ,", ". o X . O ,", "X o X O O ,", "X X O O , ,"] },
            success: L("每一手都紧一口气，先下的一方就快一步。", "Each move takes one liberty, so the side that starts stays one step ahead.", "한 수에 활로 하나씩, 먼저 둔 쪽이 한 발 앞섭니다.", "一手で一つずつ。先に打った方が一歩先を行きます。"),
          },
        ],
      },
      {
        id: "race-outside",
        title: L("先紧外气", "Outside liberties first", "바깥 공배부터", "外ダメから詰める"),
        steps: [
          {
            kind: "read",
            text: L(
              "两块棋之间共有的气叫“公气”，只属于一方的气叫“外气”。紧公气会同时减少自己的气，所以要先紧外气。",
              "A liberty both groups share is a shared liberty; one that belongs only to the opponent is an outside liberty. Filling a shared liberty costs you one too, so fill the outside ones first.",
              "두 덩어리가 함께 쓰는 활로를 공동 공배, 한쪽에만 있는 활로를 바깥 공배라고 합니다. 공동 공배를 메우면 내 활로도 줄어들므로 바깥 공배부터 메우세요.",
              "両方が共有するダメを内ダメ、片方だけのダメを外ダメと言います。内ダメを詰めると自分の呼吸点も減るので、外ダメから詰めましょう。",
            ),
            board: {
              size: 19,
              corner: "tl",
              diagram: [". O . X . O ,", ". O X X . O ,", "X O X O O O ,", "X X O O , , ,"],
              marks: [
                { x: 2, y: 0, type: "triangle" },
                { x: 0, y: 0, type: "circle" },
                { x: 0, y: 1, type: "circle" },
              ],
            },
          },
          {
            kind: "problem",
            text: L(
              "中间那口气是公气。先紧白棋的外气，赢下对杀。",
              "The liberty between the groups is shared. Fill White's outside liberties first and win the race.",
              "두 덩어리 사이의 공배는 공동 공배입니다. 백의 바깥 공배부터 메워 이기세요.",
              "間のダメは内ダメです。白の外ダメから詰めて、攻め合いに勝ちましょう。",
            ),
            problem: { goal: "capture", corner: "tl", escape: 4, diagram: [". o . X . O ,", ". o X X . O ,", "X o X O O O ,", "X X O O , , ,"] },
            success: L("外气紧完，最后再紧公气提子。", "Outside liberties first; the shared one last, when it captures.", "바깥 공배를 다 메운 뒤 마지막에 공동 공배로 따냅니다.", "外ダメを詰め終えてから、最後に内ダメで取ります。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角是同样的对杀。不要先紧公气。",
              "The same race in the upper right. Do not start with the shared liberty.",
              "오른쪽 위 귀의 같은 수상전입니다. 공동 공배부터 메우지 마세요.",
              "右上の隅の同じ攻め合いです。内ダメから詰めてはいけません。",
            ),
            problem: { goal: "capture", corner: "tr", escape: 4, diagram: [", O . X . o .", ", O . X X o .", ", O O O X o X", ", , , O O X X"] },
            success: L("先紧公气的话，自己也少一口气，就输了。", "Fill the shared liberty first and you lose a liberty too, and the race.", "공동 공배를 먼저 메우면 내 활로도 줄어서 지고 맙니다.", "内ダメから詰めると自分の呼吸点も減り、負けてしまいます。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角再练一次：外气在哪里？",
              "Once more in the lower left: where are the outside liberties?",
              "왼쪽 아래 귀에서 한 번 더: 바깥 공배는 어디일까요?",
              "左下の隅でもう一度。外ダメはどこでしょう。",
            ),
            problem: { goal: "capture", corner: "bl", escape: 4, diagram: ["X X O O , , ,", "X o X O O O ,", ". o X X . O ,", ". o . X . O ,"] },
            success: L("先外后内，是对杀的基本功。", "Outside first, shared last: the basic rule of races.", "바깥 공배가 먼저, 공동 공배는 마지막. 수상전의 기본입니다.", "外ダメが先、内ダメは最後。攻め合いの基本です。"),
          },
        ],
      },
      {
        id: "race-read",
        title: L("对杀的计算", "Reading a race", "수상전 읽기", "攻め合いを読む"),
        steps: [
          {
            kind: "read",
            text: L(
              "对杀前先问三个问题：双方各有几口气？哪些是公气？谁先下？算清楚再动手。",
              "Before a race, ask three questions: how many liberties does each side have, which are shared, and whose move is it? Count first, then play.",
              "수상전 전에 세 가지를 물어보세요. 각자 활로가 몇 개인가, 공동 공배는 어느 것인가, 누구 차례인가. 세어 본 뒤에 두세요.",
              "攻め合いの前に三つ確かめます。お互いの呼吸点はいくつか、内ダメはどれか、どちらの番か。数えてから打ちましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "角上的黑棋被白棋围住，白棋也被黑棋围住。算一算，找出赢下对杀的一手。",
              "Black's corner stones are surrounded, and so are White's. Count, then find a move that wins the race.",
              "귀의 흑도 백도 서로 둘러싸여 있습니다. 세어 보고 수상전에서 이기는 수를 찾으세요.",
              "隅の黒も白も互いに囲まれています。数えて、攻め合いに勝つ手を見つけましょう。",
            ),
            problem: { goal: "capture", corner: "tl", escape: 4, diagram: [". . . o X ,", "X X . o X ,", "O O o o X ,", "X X X X X ,"] },
            success: L("算清楚了，对杀就不慌。", "Counted properly, a race holds no surprises.", "제대로 세면 수상전도 당황할 일이 없습니다.", "きちんと数えれば、攻め合いは怖くありません。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角的对杀。黑棋有几口气？白棋呢？",
              "A race in the upper right. How many liberties does Black have? And White?",
              "오른쪽 위 귀의 수상전입니다. 흑의 활로는 몇 개? 백은?",
              "右上の隅の攻め合い。黒の呼吸点はいくつ？白は？",
            ),
            problem: { goal: "capture", corner: "tr", escape: 4, diagram: [", X o . . .", ", X o . X X", ", X o o O O", ", X X X X X"] },
            success: L("先紧对方的气，比补自己更快。", "Taking the opponent's liberties is faster than adding your own.", "상대 활로를 메우는 편이 내 활로를 늘리는 것보다 빠릅니다.", "相手の呼吸点を詰める方が、自分のを増やすより速いのです。"),
          },
          {
            kind: "problem",
            text: L(
              "左下角的对杀。先数气，再动手。",
              "A race in the lower left. Count first, then play.",
              "왼쪽 아래 귀의 수상전입니다. 먼저 세고 두세요.",
              "左下の隅の攻め合いです。まず数えてから打ちましょう。",
            ),
            problem: { goal: "capture", corner: "bl", escape: 4, diagram: ["X X X X X ,", "O O o o X ,", "X X . o X ,", ". . . o X ,"] },
            success: L("会数气，对杀就有把握。", "If you can count, you can win races.", "셀 줄 알면 수상전은 자신 있습니다.", "数えられれば、攻め合いは怖くありません。"),
          },
        ],
      },
      {
        id: "race-practice",
        title: L("对杀练习", "Race practice", "수상전 연습", "攻め合いの練習"),
        steps: [
          {
            kind: "problem",
            text: L(
              "右下角：两块棋各有两口气。轮到黑棋。",
              "Lower right: two liberties each, Black to play.",
              "오른쪽 아래: 서로 활로가 둘, 흑 차례입니다.",
              "右下：お互い呼吸点二つ、黒番です。",
            ),
            problem: { goal: "capture", escape: 3, corner: "br", diagram: [", , , , , ,", ", , O O X X", ", O O X o X", ", O . X o .", ", O . X o ."] },
            success: L("气数相同时，先手就是胜负手。", "With equal liberties, having the move decides it.", "활로가 같으면 차례가 승부를 가릅니다.", "同数なら、手番が勝負を分けます。"),
          },
          {
            kind: "problem",
            text: L(
              "右下角：有一口公气。从哪里开始紧？",
              "Lower right: there is one shared liberty. Where do you start?",
              "오른쪽 아래: 공동 공배가 하나 있습니다. 어디부터 메울까요?",
              "右下：内ダメが一つあります。どこから詰めますか。",
            ),
            problem: { goal: "capture", corner: "br", escape: 4, diagram: [", , , O O X X", ", O O O X o X", ", O . X X o .", ", O . X . o ."] },
            success: L("外气先紧，公气留到最后。", "Outside liberties first, the shared one last.", "바깥 공배 먼저, 공동 공배는 마지막.", "外ダメが先、内ダメは最後です。"),
          },
          {
            kind: "problem",
            text: L(
              "右上角：三口气对三口气。一口一口紧。",
              "Upper right: three liberties against three. Fill them one at a time.",
              "오른쪽 위: 활로 셋 대 셋입니다. 하나씩 메우세요.",
              "右上：呼吸点三つ対三つ。一つずつ詰めましょう。",
            ),
            problem: { goal: "capture", corner: "tr", escape: 4, diagram: [", O . X o .", ", O . X o .", ", O . X o .", ", O O X o X", ", , O O X X"] },
            success: L("对杀的关键：数清楚，紧对方，先外后内。", "Races in a nutshell: count, fill the opponent's liberties, outside before shared.", "수상전 핵심: 세고, 상대를 메우고, 바깥부터.", "攻め合いの要点：数える、相手を詰める、外から。"),
          },
        ],
      },
    ],
  },
  /* ================================================================ UNIT 8 */
  {
    id: "game",
    title: L("围地、计算与对局", "Territory, scoring and playing a game", "집, 계가, 그리고 대국", "地、計算、対局"),
    summary: L(
      "日本规则下怎样算胜负：地、提子、贴目；布局的顺序；怎样结束一盘棋。",
      "How a game is won under Japanese rules: territory, prisoners and komi; the order of the opening; and how a game ends.",
      "일본 규칙의 승패: 집, 따낸 돌, 덤. 포석의 순서와 대국을 끝내는 법.",
      "日本ルールでの勝ち負け：地、アゲハマ、コミ。布石の順序と、対局の終え方。",
    ),
    lessons: [
      {
        id: "game-territory",
        title: L("什么是地", "What territory is", "집이란", "地とは"),
        steps: [
          {
            kind: "read",
            text: L(
              "终局时，你用棋子围住的空点就是你的“地”，每个空点算一目。这盘棋黑棋围住了左边，白棋围住了右边。",
              "At the end of the game, the empty points your stones surround are your territory, one point each. In this game Black has walled off the left and White the right.",
              "대국이 끝났을 때 내 돌로 둘러싼 빈 점이 내 집이고, 한 점이 한 집입니다. 이 판에서 흑은 왼쪽, 백은 오른쪽을 둘러쌌습니다.",
              "終局の時、自分の石で囲んだ空点が地で、一点が一目です。この碁では黒が左側を、白が右側を囲いました。",
            ),
            board: END,
          },
          {
            kind: "place",
            text: L(
              "黑棋的墙下边有一个缺口，白棋可以从那里钻进来。把它堵上。",
              "Black's wall has a hole near the bottom, and White could walk in through it. Close it.",
              "흑 벽 아래쪽에 구멍이 있어 백이 들어올 수 있습니다. 막으세요.",
              "黒の壁の下の方に穴があり、白が入ってこられます。ふさぎましょう。",
            ),
            board: END_GAP,
            toMove: 1,
            accept: [{ x: 4, y: 7 }],
            success: L("墙完整了，左边都是黑地。", "The wall is whole again and the left side is all Black's.", "벽이 다시 온전해져 왼쪽은 모두 흑집입니다.", "壁がつながり、左側はすべて黒地です。"),
            wrong: L(
              "沿着黑墙找一找断开的地方，就下在那里。",
              "Follow the black wall and play exactly where it is broken.",
              "흑 벽을 따라가다 끊긴 곳에 정확히 두세요.",
              "黒の壁をたどり、切れている所にぴったり打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次是白棋的墙上边有缺口。冲进去，缩小白地。",
              "This time White's wall has a gap near the top. Push in and make White's territory smaller.",
              "이번에는 백 벽 위쪽에 틈이 있습니다. 밀고 들어가 백집을 줄이세요.",
              "今度は白の壁の上の方にすき間があります。押し込んで白地を減らしましょう。",
            ),
            board: END_GAP_WHITE,
            toMove: 1,
            accept: [{ x: 5, y: 1 }],
            success: L("白地少了，黑棋的子也连在自己的墙上，很安全。", "White's area shrinks, and your stone stays connected to your wall.", "백집이 줄었고, 흑돌은 자기 벽과 이어져 안전합니다.", "白地が減り、黒石は自分の壁とつながって安全です。"),
            wrong: L(
              "找白墙上缺的那颗子，从黑墙一侧推进去。",
              "Find the missing white stone and push into the gap from your own wall.",
              "백 벽에서 빠진 자리를 찾아 흑 벽 쪽에서 밀고 들어가세요.",
              "白の壁の欠けた所を探し、黒の壁の側から押し込みましょう。",
            ),
          },
        ],
      },
      {
        id: "game-score",
        title: L("提子与贴目", "Prisoners and komi", "따낸 돌과 덤", "アゲハマとコミ"),
        steps: [
          {
            kind: "read",
            text: L(
              "日本规则：地加上提掉的子就是你的得分。黑棋先下占便宜，所以白棋另得6目半贴目。这盘棋黑33目，白29目加6目半是35目半，白胜2目半。",
              "Under Japanese rules your score is your territory plus the stones you captured. Black has the advantage of moving first, so White receives 6.5 points of komi. Here Black has 33 points and White 29 + 6.5 = 35.5: White wins by 2.5.",
              "일본 규칙에서는 집에 따낸 돌을 더한 것이 점수입니다. 흑이 먼저 두는 이점이 있어 백은 덤 6집 반을 받습니다. 이 판은 흑 33집, 백 29집에 덤을 더해 35집 반, 백이 2집 반 이깁니다.",
              "日本ルールでは、地とアゲハマの合計が得点です。黒は先に打てる分有利なので、白はコミ6目半をもらいます。この碁は黒33目、白29目＋6目半で35目半、白の2目半勝ちです。",
            ),
            board: END,
          },
          {
            kind: "place",
            text: L(
              "两颗白子闯进了黑地，只剩一口气。提掉它们：每颗提子算一目，空出来的点也重新成为黑地。",
              "Two white stones have slipped into Black's area and have one liberty left. Capture them: each prisoner is worth a point, and the points become Black territory again.",
              "백 두 점이 흑집에 들어왔고 활로가 하나 남았습니다. 따내세요. 따낸 돌은 한 점에 한 집이고, 빈 자리도 다시 흑집이 됩니다.",
              "白二子が黒地に入り込み、呼吸点が一つです。取りましょう。アゲハマは一つ一目、空いた点もまた黒地になります。",
            ),
            board: END_PRISONERS,
            toMove: 1,
            accept: [{ x: 2, y: 6 }],
            success: L("两颗提子再加上收回的地，这几目可能就决定胜负。", "Two prisoners plus the recovered points: that may decide the game.", "따낸 두 점과 되찾은 집, 이것이 승부를 가를 수 있습니다.", "アゲハマ二つと取り戻した地。これが勝負を決めるかもしれません。"),
            wrong: L(
              "找到两颗白子共同的最后一口气。",
              "Find the last liberty the two white stones share.",
              "백 두 점이 함께 쓰는 마지막 활로를 찾으세요.",
              "白二子に共通の最後の呼吸点を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "有贴目，胜负常常只差几目。黑墙上边还缺一颗子，补上它，别让白棋冲进来。",
              "With komi, games are often decided by a few points. Black's wall near the top is missing a stone. Fill it before White pushes in.",
              "덤이 있어 승부는 몇 집 차이로 갈리곤 합니다. 흑 벽 위쪽에 돌 하나가 비어 있습니다. 백이 밀고 들어오기 전에 메우세요.",
              "コミがあるので、勝負は数目の差で決まることがよくあります。黒の壁の上の方が一子欠けています。白に押し込まれる前に埋めましょう。",
            ),
            board: b9({ ...END_ROWS, 1: ". . . . . O . . ." }),
            toMove: 1,
            accept: [{ x: 4, y: 1 }],
            success: L("边界封好，一目也不让。", "Border sealed; not a point given away.", "경계를 막아 한 집도 내주지 않았습니다.", "境界をふさぎ、一目も与えません。"),
            wrong: L(
              "沿着黑墙往上看，找到缺口。",
              "Follow the black wall upward and find the hole.",
              "흑 벽을 따라 위로 올라가 구멍을 찾으세요.",
              "黒の壁を上へたどって、穴を見つけましょう。",
            ),
          },
        ],
      },
      {
        id: "game-order",
        title: L("金角银边草肚皮", "Corners, then sides, then centre", "귀, 변, 중앙 순서", "隅、辺、中央の順"),
        steps: [
          {
            kind: "read",
            text: L(
              "围地在角上最容易，两条边线帮你围；边上次之；中间最难。所以开局先占角，再沿边展开，最后才是中间。",
              "Territory is easiest to make in a corner, where two edges help you; then on the sides; the centre is hardest. So open in the corners, extend along the sides, and turn to the centre last.",
              "집은 두 변이 도와주는 귀에서 가장 짓기 쉽고, 다음이 변, 중앙이 가장 어렵습니다. 그래서 포석은 귀부터, 다음 변으로 벌리고, 중앙은 마지막입니다.",
              "地は二辺が助けてくれる隅が一番作りやすく、次が辺、中央が一番難しい。だから布石は隅から、次に辺へ開き、中央は最後です。",
            ),
            board: OPEN_CORNERS,
          },
          {
            kind: "place",
            text: L(
              "空棋盘。第一手下在某个角上，离两条边都是三路或四路。",
              "An empty board. Play your first move in a corner, on the third or fourth line from both edges.",
              "빈 바둑판입니다. 첫 수를 귀에, 양쪽 변에서 3선이나 4선에 두세요.",
              "空の碁盤です。最初の一手を隅に、両方の辺から三線か四線に打ちましょう。",
            ),
            board: OPEN_EMPTY,
            toMove: 1,
            accept: [...area(OPEN_EMPTY, 2, 2, 3, 3), ...area(OPEN_EMPTY, 5, 2, 6, 3), ...area(OPEN_EMPTY, 2, 5, 3, 6), ...area(OPEN_EMPTY, 5, 5, 6, 6)],
            success: L("先占角，这是布局的第一步。", "A corner first: the first step of every opening.", "귀가 먼저, 포석의 첫걸음입니다.", "まず隅。布石の第一歩です。"),
            wrong: L(
              "一路、二路太低，正中间又围不住地。选一个角，离两边三到四路。",
              "The first and second lines are too low, and the centre does not enclose anything yet. Choose a corner, three or four lines in from both edges.",
              "1선과 2선은 너무 낮고, 한가운데는 아직 집을 둘러싸지 못합니다. 귀를 골라 양쪽 변에서 3~4선에 두세요.",
              "一線や二線は低すぎ、真ん中ではまだ地を囲めません。隅を選び、両辺から三、四線に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "上边两个角都是黑棋的。在它们之间的边上展开，把整条上边围起来。",
              "Both upper corners are Black's. Extend along the side between them to claim the whole top.",
              "위쪽 두 귀가 모두 흑입니다. 그 사이 변으로 벌려 위쪽 전체를 차지하세요.",
              "上の二つの隅はどちらも黒です。その間の辺に開いて、上辺全体を囲いましょう。",
            ),
            board: OPEN_SIDE,
            toMove: 1,
            accept: [
              { x: 3, y: 2 },
              { x: 4, y: 2 },
              { x: 5, y: 2 },
              { x: 4, y: 3 },
            ],
            success: L("角和边连成一片，黑棋的地成形了。", "Corners and side join up into a territory.", "귀와 변이 이어져 흑집의 틀이 잡혔습니다.", "隅と辺がつながり、黒の地ができてきました。"),
            wrong: L(
              "在上边两颗黑子的中间下。",
              "Play between your two stones along the top side.",
              "위쪽 흑 두 점 사이에 두세요.",
              "上辺の黒二子の間に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "角和边都分完了，现在最重要的是中央。占住中间。",
              "Corners and sides are all taken. Now the centre matters most. Take it.",
              "귀와 변이 모두 나뉘었습니다. 이제 가장 중요한 곳은 중앙입니다. 차지하세요.",
              "隅も辺も打ち終わりました。今一番大事なのは中央です。占めましょう。",
            ),
            board: b9({ 2: ". . X . X . X . .", 6: ". . O . O . O . ." }),
            toMove: 1,
            accept: [
              { x: 4, y: 4 },
              { x: 4, y: 3 },
              { x: 3, y: 4 },
              { x: 5, y: 4 },
            ],
            success: L("中央的一手同时照顾上下两边。", "A central move looks after both your side and the fight in the middle.", "중앙의 한 수는 위아래를 동시에 돌봅니다.", "中央の一手は上下の両方に働きます。"),
            wrong: L(
              "现在要下在两条阵线之间的中央。",
              "Play in the middle, between the two lines of stones.",
              "두 줄의 돌 사이 한가운데에 두세요.",
              "二列の石の間、真ん中に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "game-opening",
        title: L("九路开局", "A 9×9 opening", "9줄 바둑의 포석", "九路盤の布石"),
        steps: [
          {
            kind: "place",
            text: L(
              "九路棋盘很小，中间附近的一手能照顾所有方向。第一手下在中央或它旁边。",
              "A 9×9 board is small, so a stone near the middle reaches every side. Play your first move on the centre point or right around it.",
              "9줄 바둑판은 작아서 가운데 근처의 한 수가 모든 방향에 영향을 줍니다. 첫 수를 한가운데나 그 둘레에 두세요.",
              "九路盤は小さいので、中央付近の一手がすべての方向に働きます。最初の一手を中央か、そのすぐ周りに打ちましょう。",
            ),
            board: OPEN_EMPTY,
            toMove: 1,
            accept: area(OPEN_EMPTY, 3, 3, 5, 5),
            success: L("好的开始：四个角都在你的势力范围里。", "A good start: every corner is within your reach.", "좋은 출발입니다. 네 귀 모두 영향권에 들어왔습니다.", "よい出だしです。四隅すべてに睨みが利きます。"),
            wrong: L(
              "在小棋盘上，离中间远的一手只能顾一个角。往中间靠。",
              "On a small board a move far from the middle only covers one corner. Come closer to the centre.",
              "작은 판에서 가운데에서 먼 수는 귀 하나만 돌봅니다. 가운데 쪽으로 두세요.",
              "小さな盤では、中央から遠い手は一つの隅にしか働きません。中央に寄せましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "三个角已经有子，只剩左下角是空的。占住它。",
              "Three corners are taken; only the lower left is empty. Take it.",
              "세 귀에 돌이 있고 왼쪽 아래 귀만 비었습니다. 차지하세요.",
              "三つの隅には石があり、左下だけが空いています。占めましょう。",
            ),
            board: OPEN_THREE,
            toMove: 1,
            accept: area(OPEN_THREE, 2, 5, 3, 6),
            success: L("空角是布局阶段最大的地方。", "An empty corner is the biggest point in the opening.", "빈 귀는 포석에서 가장 큰 곳입니다.", "空き隅は布石で一番大きな所です。"),
            wrong: L(
              "找没有棋子的那个角，下在离两边三四路的地方。",
              "Find the corner with no stones and play three or four lines from both edges.",
              "돌이 없는 귀를 찾아 양쪽 변에서 3~4선에 두세요.",
              "石のない隅を探し、両辺から三、四線に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "两颗白子只靠一个点连在一起。切断它们，两块弱棋比一块强棋好攻。",
              "Two white stones are linked through a single point. Cut them apart: two weak groups are easier to attack than one strong one.",
              "백 두 점이 한 점으로만 이어져 있습니다. 끊으세요. 약한 두 덩어리가 강한 한 덩어리보다 공격하기 쉽습니다.",
              "白二子が一点でつながっています。切り離しましょう。弱い石二つは、強い石一つより攻めやすいのです。",
            ),
            board: b9({ 3: ". . . . . O . . .", 4: ". . . . X X O . .", 6: ". . O . . . . . ." }),
            toMove: 1,
            accept: [{ x: 6, y: 3 }],
            success: L("切断后，白棋要同时照顾两块。", "Now White has two groups to look after.", "끊고 나니 백은 두 덩어리를 돌봐야 합니다.", "切られた白は二つの石を守らなければなりません。"),
            wrong: L(
              "找一个同时挨着两颗白子的空点。",
              "Find the empty point that touches both white stones.",
              "두 백돌에 모두 닿는 빈 점을 찾으세요.",
              "白二子の両方に接する空点を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋紧贴着黑棋，盯着黑棋的断点。补好断点，实连或虎口都可以。",
              "White is pressing against your stones and eyeing your cutting point. Protect it, with a solid or a hanging connection.",
              "백이 흑돌에 붙어 끊는 점을 노립니다. 꽉 잇기나 호구로 지키세요.",
              "白が黒石に接して切りの点を狙っています。カタツギかカケツギで守りましょう。",
            ),
            board: b9({ 3: ". . . X O . . . .", 4: ". . . . X . . . .", 6: ". . . . . . O . ." }),
            toMove: 1,
            accept: [
              { x: 3, y: 4 },
              { x: 2, y: 4 },
              { x: 3, y: 5 },
            ],
            success: L("连好了，再也不怕被切。", "Connected; no more fear of the cut.", "이어졌으니 더 이상 끊길 걱정이 없습니다.", "つながったので、もう切られる心配はありません。"),
            wrong: L(
              "两颗黑子斜着相对，白棋已经占了一个连接点。守住另一个。",
              "Your two stones touch diagonally and White already holds one linking point. Guard the other.",
              "흑 두 점은 대각선으로 닿아 있고 백이 잇는 점 하나를 차지했습니다. 다른 하나를 지키세요.",
              "黒二子は斜めに接し、白がつなぎの点の一つを占めました。もう一つを守りましょう。",
            ),
          },
        ],
      },
      {
        id: "game-end",
        title: L("终局", "Ending the game", "대국의 끝", "終局"),
        steps: [
          {
            kind: "read",
            text: L(
              "边界全部封好、再下哪里都得不到好处时，就停一手（虚着）。双方连续停一手，对局结束，接着数地。",
              "When every border is closed and no move gains anything, you pass. When both players pass in a row, the game is over and the territory is counted.",
              "모든 경계가 닫히고 어디에 두어도 이득이 없으면 패스합니다. 두 사람이 연달아 패스하면 대국이 끝나고 계가합니다.",
              "境界がすべて閉じ、どこに打っても得にならなければパスします。二人が続けてパスすると終局で、地を数えます。",
            ),
          },
          {
            kind: "place",
            text: L(
              "停一手之前先检查边界。黑墙中间有个缺口，堵上它。",
              "Before you pass, check the borders. There is a hole in the middle of Black's wall. Close it.",
              "패스하기 전에 경계를 확인하세요. 흑 벽 가운데에 구멍이 있습니다. 막으세요.",
              "パスする前に境界を確かめます。黒の壁の真ん中に穴があります。ふさぎましょう。",
            ),
            board: b9({ ...END_ROWS, 4: ". . . . O . . . ." }),
            toMove: 1,
            accept: [{ x: 3, y: 4 }],
            success: L("没有缺口了，现在可以放心停一手。", "No holes left; now you can pass with confidence.", "구멍이 없으니 이제 안심하고 패스할 수 있습니다.", "穴はもうありません。安心してパスできます。"),
            wrong: L(
              "看看黑墙哪里少了一颗子。",
              "Look for the place where the black wall is missing a stone.",
              "흑 벽에서 돌이 빠진 곳을 찾으세요.",
              "黒の壁で石が欠けている所を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这个空点夹在黑白两道墙之间，不属于任何一方，叫“单官”。它不算目，但终局前把它填掉，边界才算完整。",
              "This empty point sits between the black and white walls and belongs to no one: a neutral point. It is worth nothing, but fill it before the end so every border is complete.",
              "이 빈 점은 흑백 벽 사이에 끼어 누구의 집도 아닌 공배입니다. 집은 아니지만 끝내기 전에 메워 경계를 완성하세요.",
              "この空点は黒白の壁の間にあり、どちらのものでもないダメです。目にはなりませんが、終局前に埋めて境界を完成させましょう。",
            ),
            board: b9({ ...END_ROWS, 3: ". . . X . O . . ." }),
            toMove: 1,
            accept: [{ x: 4, y: 3 }],
            success: L("单官填好，双方都可以停一手了。", "The neutral point is filled; both players can pass now.", "공배를 메웠으니 이제 둘 다 패스할 수 있습니다.", "ダメを詰めたので、二人ともパスできます。"),
            wrong: L(
              "找那个同时挨着黑子和白子的空点。",
              "Find the empty point that touches both black and white stones.",
              "흑돌과 백돌에 함께 닿은 빈 점을 찾으세요.",
              "黒石と白石の両方に接する空点を探しましょう。",
            ),
          },
        ],
      },
      {
        id: "game-dead",
        title: L("死子", "Dead stones", "사석", "死に石"),
        steps: [
          {
            kind: "read",
            text: L(
              "终局时，在对方地里活不了的子叫“死子”。双方同意后直接拿掉，当作提子计算，不必真的去吃。标记的白子就是死子。",
              "At the end, stones that cannot live inside the opponent's area are dead. Once both players agree, they are simply removed and counted as prisoners; there is no need to capture them. The marked white stone is dead.",
              "대국이 끝났을 때 상대 집 안에서 살 수 없는 돌은 사석입니다. 두 사람이 합의하면 따낸 돌처럼 들어내 계산하며, 실제로 잡으러 갈 필요는 없습니다. 표시한 백돌이 사석입니다.",
              "終局の時、相手の地の中で生きられない石は死に石です。双方が合意すれば取り上げてアゲハマとして数え、実際に取りに行く必要はありません。印の白石が死に石です。",
            ),
            board: { ...b9({ ...END_ROWS, 1: ". O . . X O . . ." }), marks: [{ x: 1, y: 1, type: "triangle" }] },
          },
          {
            kind: "place",
            text: L(
              "这颗白子已经死了，不用花一手去吃它。去补黑墙下边的缺口。",
              "That white stone is already dead, so do not spend a move capturing it. Close the gap at the bottom of your wall instead.",
              "그 백돌은 이미 사석이니 잡느라 한 수를 쓰지 마세요. 대신 흑 벽 아래쪽 구멍을 막으세요.",
              "その白石はもう死んでいるので、取るのに一手使う必要はありません。代わりに黒の壁の下の穴をふさぎましょう。",
            ),
            board: END_DEAD,
            toMove: 1,
            accept: [{ x: 4, y: 7 }],
            success: L("死子留给终局时再拿掉，先下有用的地方。", "Leave dead stones for the end and play where it matters.", "사석은 끝날 때 들어내고, 지금은 필요한 곳에 두세요.", "死に石は終局で取り上げればよいので、大事な所に打ちましょう。"),
            wrong: L(
              "吃死子是浪费一手。找黑墙上的缺口。",
              "Capturing a dead stone wastes a move. Look for the hole in your wall.",
              "사석을 잡는 것은 한 수 낭비입니다. 흑 벽의 구멍을 찾으세요.",
              "死に石を取るのは一手の無駄です。黒の壁の穴を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "右边白地里有一颗黑子，它活不了，是死子。别再往里加子，去补黑墙上边的缺口。",
              "Your stone inside White's area on the right cannot live; it is dead. Do not add more stones there. Close the gap at the top of your wall.",
              "오른쪽 백집 안의 흑돌은 살 수 없는 사석입니다. 더 넣지 말고, 흑 벽 위쪽 구멍을 막으세요.",
              "右の白地の中の黒石は生きられない死に石です。それ以上石を足さず、黒の壁の上の穴をふさぎましょう。",
            ),
            board: END_DEAD_BLACK,
            toMove: 1,
            accept: [{ x: 4, y: 1 }],
            success: L("死子会算作对方的提子，别为它再赔上更多。", "A dead stone counts as the opponent's prisoner; do not throw more after it.", "사석은 상대의 따낸 돌이 됩니다. 더 잃지 마세요.", "死に石は相手のアゲハマになります。それ以上損を重ねないことです。"),
            wrong: L(
              "在对方地里加子只会多送死子。沿黑墙往上找缺口。",
              "More stones in White's area only means more dead stones. Follow your wall upward to the gap.",
              "백집 안에 돌을 더 두면 사석만 늘어납니다. 흑 벽을 따라 위쪽 구멍을 찾으세요.",
              "白地に石を足しても死に石が増えるだけです。黒の壁を上へたどり、穴を見つけましょう。",
            ),
          },
        ],
      },
    ],
  },
];
