/**
 * The intermediate course (v5): units 9–13, appended to the beginner course
 * in ./course.js. Same step schema (read / place / problem; see course.js).
 * v6 adds two lessons to the fighting unit: the leaning attack and sabaki.
 *
 * Opening and joseki steps are drawn on a 19×19 board: a whole-board
 * diagram shows the whole board, a smaller diagram in a corner shows a
 * window around it (the app frames the diagram's '.' points, its stones,
 * its marks and every accept point). Joseki diagrams number the moves of
 * the sequence with label marks. Endgame boards are 9×9 positions whose
 * values were counted by hand and checked with a small territory counter;
 * the claims in the text are only the ones those counts support.
 *
 * Every unit here carries `level: "intermediate"`, so the beginner logic
 * (today's five problems for a learner still in the course) looks only at
 * the beginner units.
 */

const L = (zh, en, ko, ja) => ({ zh, en, ko, ja });
const BLACK = 1;
const WHITE = -1;

/* ----------------------------------------------------------------- helpers */

/**
 * A w×h window in the top-left corner of a 19×19 board. `black` and
 * `white` are lists of [x, y]; `extra` adds marks or overrides placement.
 */
function win(w, h, black = [], white = [], extra = {}) {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  const put = (list, ch) => {
    for (const [x, y] of list) {
      if (x < 0 || y < 0 || x >= w || y >= h) throw new Error(`stone ${x},${y} outside a ${w}×${h} window`);
      if (g[y][x] !== ".") throw new Error(`two stones on ${x},${y}`);
      g[y][x] = ch;
    }
  };
  put(black, "X");
  put(white, "O");
  return { size: 19, corner: "tl", diagram: g.map((r) => r.join(" ")), ...extra };
}

/** The whole 19×19 board. */
const full = (black, white, extra) => win(19, 19, black, white, extra);

const E9 = ". . . . . . . . .";

/** A 9×9 board from a sparse list of rows: { rowIndex: "row string" }. */
function b9(rows = {}, extra = {}) {
  const out = [];
  for (let y = 0; y < 9; y++) out.push(rows[y] ?? E9);
  return { size: 9, diagram: out, corner: "tl", ...extra };
}

/**
 * A joseki position: the base stones plus the first `n` moves of `moves`
 * ([x, y, colour]), and label marks numbering those moves from 1.
 */
function joseki(w, h, base, moves, n, { numbers = false } = {}) {
  const black = base.black.slice();
  const white = base.white.slice();
  for (const [x, y, c] of moves.slice(0, n)) (c === BLACK ? black : white).push([x, y]);
  const marks = numbers ? moves.slice(0, n).map(([x, y], i) => ({ x, y, type: "label", label: String(i + 1) })) : undefined;
  return win(w, h, black, white, marks ? { marks } : {});
}

/** Every point of a rectangle (inclusive), as accept points. */
function box(x0, y0, x1, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

const pts = (...list) => list.map(([x, y]) => ({ x, y }));
const labels = (...list) => list.map(([x, y, label]) => ({ x, y, type: "label", label }));

/* --------------------------------------------------------- opening boards */

// The 3-3, 3-4 and 4-4 points of every corner.
const CORNER_POINTS = [...box(2, 2, 3, 3), ...box(15, 2, 16, 3), ...box(2, 15, 3, 16), ...box(15, 15, 16, 16)];

// Upper right star point, upper left 3-4 point, lower left 3-3 point.
const THREE_POINTS = [[15, 3], [2, 3], [2, 16]];

// The pincer points against a small knight's approach at (5, 2) to a star point at (3, 3).
const PINCERS = pts([7, 2], [7, 3], [8, 2], [8, 3], [9, 2], [9, 3]);

// Big points versus urgent points: Black's top-side stones are threatened by a cut at (8, 3).
const URGENT = full([[15, 3], [3, 15], [8, 2], [9, 3]], [[3, 3], [9, 2], [10, 3]]);

/* ---------------------------------------------------------- joseki boards */

const STAR = { black: [[3, 3]], white: [] };
// The 3-3 invasion: White invades, Black blocks on the top side.
const J33 = [
  [2, 2, WHITE],
  [3, 2, BLACK],
  [2, 3, WHITE],
  [2, 4, BLACK],
  [1, 4, WHITE],
  [1, 5, BLACK],
  [1, 3, WHITE],
  [2, 5, BLACK],
];
// Small knight's approach, small knight's response, two-space extension.
const JAPPROACH = [
  [5, 2, WHITE],
  [2, 5, BLACK],
  [8, 2, WHITE],
];
// 3-4 point: small knight's approach, attach and draw back (托退 / ツケヒキ).
const KOMOKU = { black: [[3, 2]], white: [] };
const JATTACH = [
  [2, 4, WHITE],
  [2, 3, BLACK],
  [3, 3, WHITE],
  [2, 2, BLACK],
];
// The same joseki in the lower right corner (turned half a circle), for playing White's side.
const STAR_BR = { black: [[5, 5]], white: [] };
const J33_BR = J33.map(([x, y, c]) => [8 - x, 8 - y, c]);
const j33br = (n) => ({ ...joseki(9, 9, STAR_BR, J33_BR, n), corner: "br" });
// The 3-3 joseki seen along the other diagonal (Black blocks on the left side), after White's connection.
const J33_MIRROR = win(9, 9, [[3, 3], [2, 3], [4, 2], [5, 1]], [[2, 2], [3, 2], [3, 1], [4, 1]]);

/* --------------------------------------------------------- endgame boards */

// Black's wall on column 3, White's on column 4; the gaps are the endgame.
const WALL = ". . . X O . . . .";
const wall = (rows) => {
  const out = {};
  for (let y = 0; y < 9; y++) out[y] = rows[y] ?? WALL;
  return out;
};
// Bottom: Black's wall reaches the first line, White's stops on the second.
// Black's push on the first line is sente (1 point).
const EG_PUSH = b9(wall({ 8: ". . . X . . . . ." }));
// Both walls stop on the second line: a first-line hane and connection (gote, 2 points).
const EG_HANE = b9(wall({ 8: E9 }));
// The same, after White's first-line hane.
const EG_WHITE_HANE = b9(wall({ 8: ". . . O . . . . ." }));
// White's push on the first line (the mirror of EG_PUSH), already played.
const EG_WHITE_PUSH = b9(wall({ 8: ". . . O O . . . ." }));
// A gote hane at the top and a sente push at the bottom.
const EG_TWO = b9(wall({ 0: E9, 8: ". . . X . . . . ." }));
// White's sente push at the top, Black's at the bottom.
const EG_REVERSE = b9(wall({ 0: ". . . . O . . . .", 8: ". . . X . . . . ." }));
// Double sente at (4, 5): White's (4, 4) and Black's (4, 6) each have two liberties and share (4, 5).
const DS_ROWS = {
  2: ". . . X O O . . .",
  3: ". . . X X O . . .",
  4: ". . . X O . O . .",
  5: ". . . X . O . . .",
  6: ". . . . X O . . .",
  7: ". . . X O O . . .",
};
const EG_DOUBLE = b9(wall(DS_ROWS));
// Practice: a gote hane at the top, the double sente point, a sente push at the bottom.
const EG_PRACTICE_ROWS = wall({ ...DS_ROWS, 0: E9, 1: WALL, 8: ". . . X . . . . ." });
// Japanese counting: two neutral points. (4, 1) is harmless; if White fills
// (4, 4), Black's stone at (4, 5) is in atari and Black must connect at (3, 5).
const JP_ROWS = {
  0: ". . . X O O . . .",
  1: ". . . X . O . . .",
  2: ". . . X O O . . .",
  3: ". . . X O . . . .",
  4: ". . . X . O . . .",
  5: ". . . . X O . . .",
};
const EG_COUNT = b9(wall(JP_ROWS));

/* ------------------------------------------------------------------ units */

export const INTERMEDIATE = [
  /* ================================================================ UNIT 9 */
  {
    id: "opening",
    level: "intermediate",
    title: L("布局的原则", "Opening principles", "포석의 원칙", "布石の原則"),
    summary: L(
      "19路的开局：先角后边再中腹，三三、小目、星位，守角与挂角，拆边，夹击，大场与急所。",
      "The 19×19 opening: corners, then sides, then the centre; the 3-3, 3-4 and 4-4 points; enclosures and approaches; extensions, pincers, big points and urgent points.",
      "19줄 포석: 귀, 변, 중앙의 순서. 삼삼, 소목, 화점. 굳힘과 걸침, 벌림, 협공, 큰 곳과 급한 곳.",
      "十九路の布石：隅、辺、中央の順。三々、小目、星。シマリとカカリ、ヒラキ、ハサミ、大場と急場。",
    ),
    lessons: [
      {
        id: "opening-corner-points",
        title: L("占角的三个点", "Three ways to take a corner", "귀를 차지하는 세 자리", "隅の三つの打ち方"),
        steps: [
          {
            kind: "read",
            text: L(
              "19路棋盘上，第一批棋子都下在角上。A是星位（四四），B是小目（三四），C是三三。三三一手就守住角地，但位置低；星位出手快，面向两边和中腹，但三三还空着，对方可以点进来；小目介于两者之间，通常还要再补一手守角。",
              "On a 19×19 board the first stones go in the corners. A is the star point (4-4), B a 3-4 point, C the 3-3 point. The 3-3 point secures the corner at once but sits low. The star point is quick and faces both sides and the centre, but leaves the 3-3 point open for an invasion. The 3-4 point is in between and usually wants a second move to complete the corner.",
              "19줄 바둑판에서는 첫 돌들을 귀에 둡니다. A는 화점(4·4), B는 소목(3·4), C는 삼삼입니다. 삼삼은 한 수로 귀의 집을 확보하지만 자리가 낮습니다. 화점은 빠르고 양쪽 변과 중앙을 바라보지만, 삼삼이 비어 있어 상대가 들어올 수 있습니다. 소목은 그 중간으로, 보통 한 수를 더 두어 귀를 굳힙니다.",
              "十九路盤では、最初の石は隅に打ちます。Aが星（四四）、Bが小目（三四）、Cが三々です。三々は一手で隅の地を確保しますが低い位置です。星は足が速く両辺と中央に向いていますが、三々が空いているので入られる余地があります。小目はその中間で、ふつうもう一手かけて隅を固めます。",
            ),
            board: full(THREE_POINTS, [], { marks: labels([15, 3, "A"], [2, 3, "B"], [2, 16, "C"]) }),
          },
          {
            kind: "place",
            text: L(
              "右下角还空着。下在右下角的星位：离两条边都是第四条线。",
              "The lower right corner is still empty. Play its star point: the fourth line from both edges.",
              "오른쪽 아래 귀가 비어 있습니다. 그 귀의 화점, 곧 양쪽 변에서 넷째 줄에 두세요.",
              "右下の隅が空いています。その隅の星、つまり両辺から四線目に打ちましょう。",
            ),
            board: full(THREE_POINTS, []),
            toMove: BLACK,
            accept: pts([15, 15]),
            success: L("星位：一手占角，出手很快。", "The star point: one move, and the corner is yours to build on.", "화점입니다. 한 수로 귀를 차지하는 빠른 수입니다.", "星です。一手で隅を占める、足の速い手です。"),
            wrong: L(
              "从右边和下边各数到第四条线，两条线的交点就是星位。",
              "Count four lines in from the right edge and four up from the bottom edge; the star point is where they cross.",
              "오른쪽 변과 아래 변에서 각각 넷째 줄을 세어, 두 줄이 만나는 점이 화점입니다.",
              "右辺と下辺からそれぞれ四線目を数えて、交わる点が星です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "左上角空着。下一个小目：离一条边三路、离另一条边四路。两个小目都可以。",
              "The upper left corner is empty. Play a 3-4 point there: the third line from one edge and the fourth from the other. Either of the two is fine.",
              "왼쪽 위 귀가 비어 있습니다. 한쪽 변에서 셋째 줄, 다른 쪽 변에서 넷째 줄인 소목에 두세요. 두 소목 중 어느 쪽이든 좋습니다.",
              "左上の隅が空いています。一方の辺から三線、もう一方から四線の小目に打ちましょう。二つある小目のどちらでも構いません。",
            ),
            board: full([[15, 3], [2, 16]], [[15, 15]]),
            toMove: BLACK,
            accept: pts([2, 3], [3, 2]),
            success: L("小目：比星位稳，比三三高。", "A 3-4 point: steadier than the star point, higher than the 3-3 point.", "소목입니다. 화점보다 단단하고 삼삼보다 높습니다.", "小目です。星より堅く、三々より高い位置です。"),
            wrong: L(
              "从左边和上边数线：一边数到三，另一边数到四。",
              "Count from the left and top edges: three lines from one, four from the other.",
              "왼쪽 변과 위쪽 변에서 세어 보세요. 한쪽은 셋째 줄, 다른 쪽은 넷째 줄입니다.",
              "左辺と上辺から数えます。一方が三線、もう一方が四線です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次占右下角的三三：离两条边都是第三条线。",
              "This time take the 3-3 point of the lower right corner: the third line from both edges.",
              "이번에는 오른쪽 아래 귀의 삼삼, 곧 양쪽 변에서 셋째 줄에 두세요.",
              "今度は右下の隅の三々、両辺から三線目に打ちましょう。",
            ),
            board: full([[15, 3], [2, 15]], [[3, 3]]),
            toMove: BLACK,
            accept: pts([16, 16]),
            success: L("三三：角地马上到手，只是位置偏低。", "The 3-3 point: the corner territory is yours at once, though the stone is low.", "삼삼입니다. 귀의 집은 바로 확보했지만 자리는 낮습니다.", "三々です。隅の地はすぐ確保できますが、位置は低めです。"),
            wrong: L(
              "比星位再往角里靠一路：离右边和下边都是第三条线。",
              "One line deeper into the corner than the star point: the third line from the right and from the bottom.",
              "화점보다 한 줄 더 귀 쪽입니다. 오른쪽 변과 아래 변에서 모두 셋째 줄입니다.",
              "星より一路隅寄り、右辺からも下辺からも三線目です。",
            ),
          },
        ],
      },
      {
        id: "opening-enclose-approach",
        title: L("守角与挂角", "Enclosures and approaches", "굳힘과 걸침", "シマリとカカリ"),
        steps: [
          {
            kind: "read",
            text: L(
              "一颗小目常常还要再下一手把角守住：A是小飞守角，B是单关守角，C是大飞守角。两颗子配合，角就很难被攻破。对方想阻止你守角，就会抢先挂角，常用的挂角点也正是这几个点。",
              "A 3-4 stone usually wants one more move to secure the corner: the small knight's enclosure (A), the one-space enclosure (B) or the large knight's enclosure (C). Two stones working together make the corner hard to break into. The opponent, to stop you, approaches first, and the usual approaches are these same points.",
              "소목 한 점은 보통 한 수를 더 두어 귀를 굳힙니다. A는 날일자 굳힘, B는 한 칸 굳힘, C는 눈목자 굳힘입니다. 두 돌이 함께하면 귀는 깨기 어렵습니다. 상대는 이를 막으려고 먼저 걸치는데, 흔한 걸침 자리도 바로 이 점들입니다.",
              "小目の石は、ふつうもう一手かけて隅を固めます。Aが小ゲイマジマリ、Bが一間ジマリ、Cが大ゲイマジマリ。二つの石が協力すると、隅はなかなか破られません。相手はそれを防ぐために先にカカリますが、よく打たれるカカリの点もこの同じ点です。",
            ),
            board: win(10, 10, [[2, 3]], [], { marks: labels([4, 2, "A"], [4, 3, "B"], [5, 2, "C"]) }),
          },
          {
            kind: "place",
            text: L(
              "用刚才三种守角中的任意一种，把这个小目的角守住。",
              "Secure the corner of this 3-4 stone with any of the three enclosures you just saw.",
              "방금 본 세 가지 굳힘 중 하나로 이 소목의 귀를 굳히세요.",
              "いま見た三つのシマリのどれかで、この小目の隅を固めましょう。",
            ),
            board: win(10, 10, [[2, 3]]),
            toMove: BLACK,
            accept: pts([4, 2], [4, 3], [5, 2]),
            success: L("角守住了，以后可以从这里向边上发展。", "The corner is secure, and you can build along the side from here.", "귀를 굳혔으니 이제 여기서 변으로 넓혀 갈 수 있습니다.", "隅が固まり、ここから辺へ広げていけます。"),
            wrong: L(
              "守角的子下在上边，离小目两三路远：第三或第四条线。",
              "The enclosure goes along the top side, two or three lines from your stone, on the third or fourth line.",
              "굳힘은 위쪽 변을 따라, 소목에서 두세 줄 떨어진 셋째나 넷째 줄에 둡니다.",
              "シマリは上辺に沿って、小目から二、三路離れた三線か四線に打ちます。",
            ),
          },
          {
            kind: "place",
            text: L(
              "现在轮到白棋。抢在黑棋守角之前挂角：在第三条线上，下在离黑子一个小飞的地方。",
              "Now you are White. Approach before Black can enclose: play a small knight's move from the black stone, on the third line.",
              "이번에는 백입니다. 흑이 굳히기 전에 걸치세요. 흑돌에서 날일자 자리, 셋째 줄에 둡니다.",
              "今度は白番です。黒がシマる前にカカリましょう。黒石から小ゲイマの位置、三線に打ちます。",
            ),
            board: win(10, 10, [[2, 3]]),
            toMove: WHITE,
            accept: pts([4, 2]),
            success: L("小飞挂：黑棋不能再轻松守角了。", "A small knight's approach: Black can no longer enclose the corner in peace.", "날일자 걸침입니다. 흑은 이제 편하게 굳힐 수 없습니다.", "小ゲイマガカリです。黒はもう楽にシマれません。"),
            wrong: L(
              "下在刚才小飞守角的那个点上：上边第三条线，离黑子横着两路。",
              "Play where Black's small knight's enclosure would go: the third line from the top, two lines across from the black stone.",
              "흑의 날일자 굳힘 자리에 두세요. 위에서 셋째 줄, 흑돌에서 가로로 두 줄 떨어진 곳입니다.",
              "黒の小ゲイマジマリの点に打ちましょう。上から三線目、黒石から横に二路の所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋下在星位。用小飞挂角：第三条线上，离黑子一个小飞。两边都可以。",
              "Black has the star point. Approach it with a small knight's move on the third line. Either side is fine.",
              "흑이 화점에 있습니다. 셋째 줄에서 날일자로 걸치세요. 어느 쪽이든 좋습니다.",
              "黒は星に打っています。三線から小ゲイマでカカリましょう。どちら側でも構いません。",
            ),
            board: win(10, 10, [[3, 3]]),
            toMove: WHITE,
            accept: pts([5, 2], [2, 5]),
            success: L("这是星位最常见的挂角。", "The most common approach to a star point.", "화점에 대한 가장 흔한 걸침입니다.", "星への最も一般的なカカリです。"),
            wrong: L(
              "从星位走一个小飞：横两路、竖一路，落在第三条线上。",
              "A small knight's move from the star point: two lines one way and one line the other, landing on the third line.",
              "화점에서 날일자로, 한쪽으로 두 줄과 다른 쪽으로 한 줄 가서 셋째 줄에 둡니다.",
              "星から小ゲイマ、一方に二路、もう一方に一路進んで三線に打ちます。",
            ),
          },
        ],
      },
      {
        id: "opening-extension",
        title: L("拆边", "Extensions", "벌림", "ヒラキ"),
        steps: [
          {
            kind: "read",
            text: L(
              "边上的子需要根据地，沿着第三条线拆开就能做出根据地。一颗子拆二，两颗子拆三，三颗子拆四：墙越高，拆得越宽。图中黑棋两颗子立起来，拆三到标记的位置。",
              "Stones on the side need a base, and an extension along the third line makes one. From one stone, extend two spaces; from two stones standing out from the edge, three; from three, four. The taller the wall, the wider the extension. Here Black's two standing stones extend three spaces to the marked stone.",
              "변의 돌에게는 근거가 필요하고, 셋째 줄을 따라 벌리면 근거가 생깁니다. 한 점이면 두 칸, 서 있는 두 점이면 세 칸, 세 점이면 네 칸을 벌립니다(입이전삼, 입삼전사). 벽이 높을수록 넓게 벌립니다. 그림에서 흑은 서 있는 두 점에서 표시한 곳까지 세 칸을 벌렸습니다.",
              "辺の石には根拠が必要で、三線に沿ってヒラけば根拠ができます。一子なら二間、立った二子なら三間、三子なら四間（二立三析、三立四析）。壁が高いほど広くヒラきます。図では黒の立った二子から、印の石まで三間にヒラいています。",
            ),
            board: full([[2, 9], [3, 9], [2, 13]], [[3, 3], [2, 5]], { marks: [{ x: 2, y: 13, type: "triangle" }] }),
          },
          {
            kind: "place",
            text: L(
              "左边这颗黑子孤零零的。远离白棋的角，沿第三条线拆二，给它一个根据地。",
              "Your stone on the left side is on its own. Give it a base: a two-space extension along the third line, away from White's corner.",
              "왼쪽 변의 흑 한 점이 외롭습니다. 백의 귀에서 먼 쪽으로, 셋째 줄을 따라 두 칸 벌려 근거를 만드세요.",
              "左辺の黒一子が孤立しています。白の隅から離れる方へ、三線に沿って二間にヒラき、根拠を作りましょう。",
            ),
            board: full([[2, 10]], [[3, 3], [2, 5]]),
            toMove: BLACK,
            accept: pts([2, 13]),
            success: L("拆二：白棋打进来也很难切断。", "A two-space extension: hard for White to split apart.", "두 칸 벌림입니다. 백이 들어와도 끊기 어렵습니다.", "二間ビラキです。白が打ち込んでも切り離しにくい形です。"),
            wrong: L(
              "往下拆，中间空两路，还在第三条线上。",
              "Extend downward, leaving two empty points between the stones, still on the third line.",
              "아래쪽으로, 두 돌 사이에 두 점을 비우고 셋째 줄에 두세요.",
              "下の方へ、間に二路あけて三線に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "两颗黑子从边上立起来了。立二拆三：沿第三条线往下拆三路。",
              "Two black stones stand out from the edge. Stand two, extend three: extend three spaces down the third line.",
              "흑 두 점이 변에서 서 있습니다. 입이전삼, 셋째 줄을 따라 아래로 세 칸 벌리세요.",
              "黒二子が辺から立っています。二立三析、三線に沿って下へ三間ヒラきましょう。",
            ),
            board: full([[2, 9], [3, 9]], [[3, 3], [2, 5]]),
            toMove: BLACK,
            accept: pts([2, 13]),
            success: L("立二拆三，墙和拆边正好配合。", "Stand two, extend three: the wall and the extension work together.", "입이전삼, 벽과 벌림이 잘 어울립니다.", "二立三析、壁とヒラキがよく働き合います。"),
            wrong: L(
              "从第三条线上的那颗子往下数，中间空三路。",
              "Count down from the stone on the third line and leave three empty points in between.",
              "셋째 줄의 돌에서 아래로 세어, 사이에 세 점을 비우세요.",
              "三線の石から下へ数えて、間を三路あけましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "现在是三颗子立起来。立三拆四：沿第三条线往下拆四路。",
              "Now three stones stand out from the edge. Stand three, extend four: four spaces down the third line.",
              "이번에는 세 점이 서 있습니다. 입삼전사, 셋째 줄을 따라 아래로 네 칸 벌리세요.",
              "今度は三子が立っています。三立四析、三線に沿って下へ四間ヒラきましょう。",
            ),
            board: full([[2, 8], [3, 8], [4, 8]], [[3, 3], [2, 5]]),
            toMove: BLACK,
            accept: pts([2, 13]),
            success: L("墙越高，拆得越宽。", "The taller the wall, the wider the extension.", "벽이 높을수록 더 넓게 벌립니다.", "壁が高いほど、広くヒラけます。"),
            wrong: L(
              "从第三条线上的那颗子往下数，中间空四路。",
              "Count down from the stone on the third line and leave four empty points in between.",
              "셋째 줄의 돌에서 아래로 세어, 사이에 네 점을 비우세요.",
              "三線の石から下へ数えて、間を四路あけましょう。",
            ),
          },
        ],
      },
      {
        id: "opening-pincer",
        title: L("夹击", "Pincers", "협공", "ハサミ"),
        steps: [
          {
            kind: "read",
            text: L(
              "对方挂角时，可以不去应，而是夹击：在挂角子的另一边，第三或第四条线上，隔一到三路落子。夹击夺走它拆边的空间。图中画圈的就是常见的夹击点。",
              "When the opponent approaches, you need not answer it directly: you can pincer. Play on the far side of the approaching stone, on the third or fourth line, one to three spaces away. A pincer takes away the room it needs to extend. The circled points are the usual pincers.",
              "상대가 걸쳐 오면 받는 대신 협공할 수 있습니다. 걸친 돌의 반대편, 셋째나 넷째 줄에 한 칸에서 세 칸 떨어져 둡니다. 협공은 걸친 돌이 벌릴 자리를 빼앗습니다. 동그라미가 흔한 협공 자리입니다.",
              "相手がカカってきたら、受けずにハサむこともできます。カカった石の向こう側、三線か四線に、一間から三間離して打ちます。ハサミはヒラく余地を奪います。丸印がよくあるハサミの点です。",
            ),
            board: win(12, 9, [[3, 3]], [[5, 2]], { marks: PINCERS.map((p) => ({ ...p, type: "circle" })) }),
          },
          {
            kind: "place",
            text: L(
              "白棋挂了你的星位。不应，夹击它。",
              "White has approached your star point. Instead of answering, pincer it.",
              "백이 화점에 걸쳐 왔습니다. 받지 말고 협공하세요.",
              "白が星にカカってきました。受けずにハサみましょう。",
            ),
            board: win(12, 9, [[3, 3]], [[5, 2]]),
            toMove: BLACK,
            accept: PINCERS,
            success: L("白子失去了拆边的地方，只好想别的办法。", "White's stone has lost its room to extend and must find another plan.", "백돌은 벌릴 자리를 잃어 다른 방법을 찾아야 합니다.", "白石はヒラく場所を失い、別の策を考えなければなりません。"),
            wrong: L(
              "下在白子的另一边（右边），第三或第四条线上，隔一到三路。",
              "Play on the other side of the white stone (to its right), on the third or fourth line, one to three spaces away.",
              "백돌의 반대편(오른쪽), 셋째나 넷째 줄에 한 칸에서 세 칸 떨어져 두세요.",
              "白石の向こう側（右）、三線か四線に、一間から三間離して打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你是白棋，挂角子被夹击了。应付夹击的一种方法是向中腹跳：从挂角子往中间跳一路。",
              "You are White and your approaching stone has been pincered. One answer is to jump toward the centre: a one-space jump from that stone.",
              "백입니다. 걸친 돌이 협공당했습니다. 한 가지 방법은 중앙으로 뛰는 것입니다. 그 돌에서 중앙 쪽으로 한 칸 뛰세요.",
              "白番です。カカリの石がハサまれました。一つの対策は中央へトブことです。その石から中央へ一間トビましょう。",
            ),
            board: win(12, 9, [[3, 3], [8, 2]], [[5, 2]]),
            toMove: WHITE,
            accept: pts([5, 4]),
            success: L("跳出来以后，两边的黑子都不好再攻它。", "Out into the open, the stone is no longer easy to attack from either side.", "중앙으로 나오니 양쪽 흑이 공격하기 어려워졌습니다.", "中央へ出たので、両側の黒からは攻めにくくなりました。"),
            wrong: L(
              "从白子往下（往中腹）走，中间空一路。",
              "From the white stone go down, toward the centre, leaving one empty point.",
              "백돌에서 아래쪽(중앙 쪽)으로, 한 점을 비우고 두세요.",
              "白石から下（中央の方）へ、一路あけて打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "opening-big-urgent",
        title: L("大场与急所", "Big points and urgent points", "큰 곳과 급한 곳", "大場と急場"),
        steps: [
          {
            kind: "read",
            text: L(
              "大场是大块的空地：空角，然后是守角、挂角，再是边上的拆。急所是决定一块棋强弱的地方。棋谚说“大场不如急所”：自己的棋有危险时，先补强它，空角可以等一等。图中右下角是大场，三角标记处是黑棋的断点。",
              "Big points are large open areas: empty corners first, then enclosures and approaches, then extensions along the sides. An urgent point decides whether a group is strong or weak. Urgent points come before big points: if your stones are in danger, take care of them first, and the empty corner can wait. Here the lower right corner is a big point; the triangle marks a cutting point in Black's stones.",
              "큰 곳은 넓게 빈 곳입니다. 먼저 빈 귀, 다음이 굳힘과 걸침, 그다음이 변의 벌림입니다. 급한 곳은 돌의 강약을 가르는 곳입니다. 큰 곳보다 급한 곳이 먼저입니다. 내 돌이 위험하면 먼저 돌보고, 빈 귀는 나중에 둡니다. 그림에서 오른쪽 아래 귀는 큰 곳이고, 세모는 흑의 끊는 점입니다.",
              "大場は広く空いた所です。まず空き隅、次にシマリとカカリ、その次が辺のヒラキです。急場は石の強弱を左右する所です。「大場より急場」。自分の石が危ないなら先に手当てし、空き隅は後回しです。図では右下隅が大場、三角印が黒の切りの点です。",
            ),
            board: { ...URGENT, marks: [{ x: 8, y: 3, type: "triangle" }] },
          },
          {
            kind: "place",
            text: L(
              "没有哪块棋有危险。下最大的地方：占右下的空角。",
              "No group is in danger. Take the biggest point: the empty lower right corner.",
              "위험한 돌이 없습니다. 가장 큰 곳, 오른쪽 아래 빈 귀를 차지하세요.",
              "危ない石はありません。一番大きな所、右下の空き隅を占めましょう。",
            ),
            board: full([[15, 3], [3, 15]], [[3, 3]]),
            toMove: BLACK,
            accept: box(14, 14, 16, 16),
            success: L("空角是布局中最大的地方。", "An empty corner is the biggest point in the opening.", "빈 귀는 포석에서 가장 큰 곳입니다.", "空き隅は布石で一番大きな所です。"),
            wrong: L(
              "在右下角离两条边三到五路的地方落子。",
              "Play in the lower right corner, three to five lines in from both edges.",
              "오른쪽 아래 귀에, 양쪽 변에서 셋째에서 다섯째 줄 사이에 두세요.",
              "右下の隅に、両辺から三線から五線の間に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "右下角还空着，但上边白棋威胁要切断你的两颗子，切断后其中一颗马上被打吃。先连上，角以后再占。",
              "The lower right corner is still empty, but on the top side White threatens to cut your two stones apart, and the cut would put one of them in atari. Connect first; the corner can wait.",
              "오른쪽 아래 귀가 아직 비어 있지만, 위쪽 변에서 백이 흑 두 점을 끊으려 합니다. 끊기면 한 점은 바로 단수입니다. 먼저 이으세요. 귀는 나중입니다.",
              "右下の隅はまだ空いていますが、上辺で白が黒二子を切ろうとしています。切られると一子はすぐアタリです。まずつなぎましょう。隅は後でかまいません。",
            ),
            board: URGENT,
            toMove: BLACK,
            accept: pts([8, 3]),
            success: L("急所先下，棋子安全了，再去抢大场。", "Urgent point first. Your stones are safe; now you can think about the big points.", "급한 곳을 먼저 두어 돌이 안전해졌습니다. 이제 큰 곳을 생각할 수 있습니다.", "急場を先に打って石が安全になりました。それから大場です。"),
            wrong: L(
              "看上边两颗斜着的黑子，白棋已经占了一个连接点，补另一个。",
              "Look at your two diagonal stones on the top side: White holds one linking point, so take the other.",
              "위쪽 변에 대각선으로 놓인 흑 두 점을 보세요. 백이 잇는 점 하나를 차지했으니 다른 하나를 두세요.",
              "上辺の斜めに並んだ黒二子を見ましょう。白がつなぎの点を一つ占めたので、もう一つに打ちます。",
            ),
          },
          {
            kind: "place",
            text: L(
              "左上是黑棋的守角，左下是白棋的守角，中间的左边空着。这里对双方都是要点：在左边的中间分投。",
              "Black has an enclosure in the upper left, White one in the lower left, and the left side between them is open. Its middle is the key point for both sides: split the side there.",
              "왼쪽 위는 흑의 굳힘, 왼쪽 아래는 백의 굳힘이고, 그 사이 왼쪽 변이 비어 있습니다. 그 가운데는 양쪽 모두의 요점입니다. 왼쪽 변 가운데에 갈라치세요.",
              "左上は黒のシマリ、左下は白のシマリで、その間の左辺が空いています。その真ん中は双方の要点です。左辺の中央に割り打ちしましょう。",
            ),
            board: full([[3, 3], [2, 5], [15, 3], [9, 2], [16, 9]], [[3, 15], [2, 13], [15, 15], [9, 16]]),
            toMove: BLACK,
            accept: box(2, 8, 3, 10),
            success: L("这一手上下都留有拆二的余地，白棋的守角也不能再向上发展。", "From here there is room for a two-space extension either way, and White's enclosure can no longer grow up the side.", "여기서는 위아래로 두 칸 벌릴 여유가 있고, 백의 굳힘은 더 이상 변으로 넓힐 수 없습니다.", "ここなら上下どちらにも二間ビラく余地があり、白のシマリも辺へ広がれません。"),
            wrong: L(
              "下在左边两个守角正中间，第三或第四条线上。",
              "Play halfway between the two enclosures on the left side, on the third or fourth line.",
              "왼쪽 변의 두 굳힘 사이 한가운데, 셋째나 넷째 줄에 두세요.",
              "左辺の二つのシマリのちょうど中間、三線か四線に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "opening-review",
        title: L("布局练习", "Opening practice", "포석 연습", "布石の練習"),
        steps: [
          {
            kind: "place",
            text: L(
              "空棋盘，你执黑。第一手占一个角：三三、小目、星位都可以。",
              "An empty board and you are Black. Start in a corner: the 3-3 point, a 3-4 point or the star point.",
              "빈 바둑판, 흑입니다. 귀에서 시작하세요. 삼삼, 소목, 화점 모두 좋습니다.",
              "空の碁盤で、黒番です。隅から始めましょう。三々、小目、星のどれでも構いません。",
            ),
            board: full([], []),
            toMove: BLACK,
            accept: CORNER_POINTS,
            success: L("先占角。", "Corners first.", "귀가 먼저입니다.", "まず隅です。"),
            wrong: L(
              "选一个角，离两条边都是第三或第四条线。",
              "Choose a corner and play on the third or fourth line from both edges.",
              "귀 하나를 골라 양쪽 변에서 셋째나 넷째 줄에 두세요.",
              "隅を一つ選び、両辺から三線か四線に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "四个角都有子了。右上的黑子是星位，给它守角：小飞、单关或大飞，向哪一边都可以。",
              "All four corners are taken. Enclose your star point in the upper right: a small knight's move, a one-space jump or a large knight's move, toward either side.",
              "네 귀에 모두 돌이 있습니다. 오른쪽 위 화점을 굳히세요. 날일자, 한 칸, 눈목자, 어느 방향이든 좋습니다.",
              "四隅すべてに石があります。右上の星をシマりましょう。小ゲイマ、一間、大ゲイマ、どちら向きでも構いません。",
            ),
            board: full([[15, 3], [3, 15]], [[3, 3], [15, 15]]),
            toMove: BLACK,
            accept: pts([13, 2], [16, 5], [13, 3], [15, 5], [12, 2], [16, 6]),
            success: L("角守住了。", "The corner is secure.", "귀를 굳혔습니다.", "隅が固まりました。"),
            wrong: L(
              "从右上的星位出发，沿上边或右边走一个小飞、单关或大飞。",
              "Start from the star point in the upper right and play a small knight's move, a one-space jump or a large knight's move along the top or the right side.",
              "오른쪽 위 화점에서 위쪽 변이나 오른쪽 변을 따라 날일자, 한 칸, 눈목자로 두세요.",
              "右上の星から、上辺か右辺に沿って小ゲイマ、一間、大ゲイマのどれかに打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次去挂白棋的角：左上或右下的白星位都可以，用小飞、大飞或者高一路的单关挂。",
              "This time approach one of White's corners, the star point in the upper left or the lower right, with a small knight's move, a large knight's move or a one-space high approach.",
              "이번에는 백의 귀에 걸치세요. 왼쪽 위나 오른쪽 아래 백 화점에, 날일자, 눈목자, 또는 한 칸 높은 걸침으로 둡니다.",
              "今度は白の隅にカカりましょう。左上か右下の白の星に、小ゲイマ、大ゲイマ、または一間高ガカリで打ちます。",
            ),
            board: full([[15, 3], [13, 2], [3, 15]], [[3, 3], [15, 15]]),
            toMove: BLACK,
            accept: pts([5, 2], [2, 5], [6, 2], [2, 6], [5, 3], [3, 5], [13, 16], [16, 13], [12, 16], [16, 12], [13, 15], [15, 13]),
            success: L("挂角让白棋来不及守角。", "Your approach keeps White from enclosing the corner.", "걸침으로 백이 귀를 굳히지 못하게 했습니다.", "カカリで、白にシマらせませんでした。"),
            wrong: L(
              "挂角下在白星位旁边两三路，第三或第四条线上，不要贴着它。",
              "An approach goes two or three lines from the white star point, on the third or fourth line, without touching it.",
              "걸침은 백 화점에서 두세 줄 떨어진 셋째나 넷째 줄에 둡니다. 붙이지는 않습니다.",
              "カカリは白の星から二、三路離れた三線か四線に打ちます。くっつけはしません。",
            ),
          },
        ],
      },
    ],
  },
  /* =============================================================== UNIT 10 */
  {
    id: "joseki",
    level: "intermediate",
    title: L("基本定式", "Basic joseki", "기본 정석", "基本定石"),
    summary: L(
      "几个最常见的角上定式：点三三、小飞挂与小飞应、小目的托退。重要的是每一手的道理，而不是死记顺序。",
      "A few of the most common corner sequences: the 3-3 invasion, the knight's approach and response, and attach-and-draw-back at the 3-4 point. Learn the reason for each move, not the order by heart.",
      "가장 흔한 귀의 정석 몇 가지: 삼삼 침입, 날일자 걸침과 받음, 소목의 붙여 물러서기. 순서를 외우기보다 한 수 한 수의 이유를 익힙니다.",
      "最もよく打たれる隅の定石をいくつか：三々入り、小ゲイマガカリと受け、小目のツケヒキ。手順の丸暗記ではなく、一手一手の理由を学びます。",
    ),
    lessons: [
      {
        id: "joseki-33-invasion",
        title: L("点三三", "The 3-3 invasion", "삼삼 침입", "三々入り"),
        steps: [
          {
            kind: "read",
            text: L(
              "定式是角上双方都能接受的标准下法。学定式要懂每一手为什么这样下，而不是背顺序。这是最基本的一个：白1点三三，黑2挡，接下来白棋在角上活棋，并且拿到先手；黑棋得到一道朝外的厚势。",
              "A joseki is a standard sequence in a corner that gives both sides a fair result. Learn why each move is played rather than the order. This is the most basic one: White 1 invades at the 3-3 point and Black 2 blocks. In the end White lives in the corner and keeps sente, and Black gets a strong wall facing outward.",
              "정석은 귀에서 양쪽 모두 받아들일 수 있는 표준 수순입니다. 순서를 외우기보다 각 수의 이유를 이해하세요. 가장 기본적인 정석입니다. 백 1로 삼삼에 들어가고 흑 2로 막습니다. 결국 백은 귀에서 살고 선수를 잡으며, 흑은 바깥을 향한 두터운 벽을 얻습니다.",
              "定石は、隅で双方が納得できる標準的な手順です。手順の暗記より、一手一手の理由を理解しましょう。最も基本的な定石です。白1の三々入りに黒2とオサエます。最後は白が隅で生きて先手を取り、黒は外に向いた厚い壁を得ます。",
            ),
            board: joseki(9, 9, STAR, J33, 8, { numbers: true }),
          },
          {
            kind: "place",
            text: L(
              "白棋点进了你星位下面的三三。从上边挡住：下在白子的右边，紧挨着它。",
              "White has invaded the 3-3 point under your star point. Block it on the top side: play right next to the white stone, on its right.",
              "백이 화점 아래 삼삼에 들어왔습니다. 위쪽 변 쪽에서 막으세요. 백돌 바로 오른쪽에 둡니다.",
              "白が星の下の三々に入ってきました。上辺の側からオサエましょう。白石のすぐ右に打ちます。",
            ),
            board: joseki(9, 9, STAR, J33, 1),
            toMove: BLACK,
            accept: pts([3, 2]),
            success: L("挡住了，白棋只能沿左边往下爬。", "Blocked: White can only crawl down the left side.", "막았습니다. 백은 왼쪽 변을 따라 기어 나갈 수밖에 없습니다.", "オサエました。白は左辺に沿ってハうしかありません。"),
            wrong: L(
              "紧挨白子，下在它和上边空地之间。",
              "Touch the white stone, on the side between it and the open top side.",
              "백돌에 붙여, 백돌과 위쪽 빈 곳 사이에 두세요.",
              "白石にくっつけて、白石と上辺の空いた所の間に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋沿左边爬。在白子前面扳，挡住它的去路。",
              "White crawls down the left side. Hane in front of White's stones to stop it.",
              "백이 왼쪽 변을 따라 깁니다. 백돌 앞을 젖혀 길을 막으세요.",
              "白が左辺をハってきました。白石の前をハネて止めましょう。",
            ),
            board: joseki(9, 9, STAR, J33, 3),
            toMove: BLACK,
            accept: pts([2, 4]),
            success: L("扳住了，白棋的出路只剩二路。", "The hane stops White; its only way on is along the second line.", "젖혀서 막았습니다. 백은 2선으로만 나갈 수 있습니다.", "ハネて止めました。白は二線にしか進めません。"),
            wrong: L(
              "扳下在白子正下方：斜挨着你的星位子。",
              "The hane goes directly below White's stones, diagonally next to your star-point stone.",
              "젖힘은 백돌 바로 아래, 흑 화점과 대각선으로 붙은 곳입니다.",
              "ハネは白石のすぐ下、黒の星の石と斜めに接する所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋在二路扳。挡住它。",
              "White hanes on the second line. Block it.",
              "백이 2선에서 젖혔습니다. 막으세요.",
              "白が二線でハネました。オサエましょう。",
            ),
            board: joseki(9, 9, STAR, J33, 5),
            toMove: BLACK,
            accept: pts([1, 5]),
            success: L("挡住了。现在白棋要先补自己的断点。", "Blocked. Now White must first protect its own cutting point.", "막았습니다. 이제 백이 먼저 자기 끊는 점을 이어야 합니다.", "オサエました。今度は白が自分の切りの点を継ぐ番です。"),
            wrong: L(
              "下在白棋二路扳子的正下方。",
              "Play directly below White's second-line hane stone.",
              "백의 2선 젖힌 돌 바로 아래에 두세요.",
              "白の二線のハネの石のすぐ下に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋粘上了。轮到你补自己的断点：实连或虎口都可以。这样黑棋的厚势就没有毛病了。",
              "White has connected. Now protect your own cutting point, with a solid or a hanging connection. Then Black's wall has no weakness.",
              "백이 이었습니다. 이제 흑의 끊는 점을 지키세요. 꽉 잇기나 호구 모두 좋습니다. 그러면 흑의 벽에 약점이 없습니다.",
              "白が継ぎました。今度は黒の切りの点を守りましょう。カタツギでもカケツギでも構いません。これで黒の壁に弱点がなくなります。",
            ),
            board: joseki(9, 9, STAR, J33, 7),
            toMove: BLACK,
            accept: pts([2, 5], [3, 5]),
            success: L("定式完成：白棋在角上活，黑棋外面很厚，下一手轮到白棋。", "The joseki is complete: White lives in the corner, Black is thick outside, and it is White's turn.", "정석이 끝났습니다. 백은 귀에서 살았고 흑은 바깥이 두터우며, 다음은 백 차례입니다.", "定石の完成です。白は隅で生き、黒は外が厚く、次は白番です。"),
            wrong: L(
              "看你最后两颗挡的子之间：白棋可以从那里切断。补住那个点，或者在它旁边做虎口。",
              "Look between your last two blocking stones: White could cut there. Fill that point, or make a tiger's mouth next to it.",
              "마지막에 막은 흑 두 점 사이를 보세요. 백이 그곳을 끊을 수 있습니다. 그 점을 잇거나 옆에 호구를 만드세요.",
              "最後にオサエた黒二子の間を見ましょう。白はそこを切れます。その点を継ぐか、隣にカケツギを打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "joseki-33-white",
        title: L("点三三：白棋的下法", "The 3-3 invasion as White", "삼삼 침입: 백의 수", "三々入り：白の手"),
        steps: [
          {
            kind: "place",
            text: L(
              "换个角，这次你执白。点进黑棋星位下面的三三。",
              "Another corner, and this time you are White. Invade at the 3-3 point under Black's star point.",
              "다른 귀에서, 이번에는 백입니다. 흑 화점 아래의 삼삼에 들어가세요.",
              "別の隅で、今度は白番です。黒の星の下の三々に入りましょう。",
            ),
            board: j33br(0),
            toMove: WHITE,
            accept: pts([6, 6]),
            success: L("点三三：角里还有活棋的空间。", "The 3-3 invasion: there is still room to live in the corner.", "삼삼 침입입니다. 귀에는 아직 살 공간이 있습니다.", "三々入りです。隅にはまだ生きる余地があります。"),
            wrong: L(
              "比星位更靠角一路：离右边和下边都是第三条线。",
              "One line deeper into the corner than the star point: the third line from the right and from the bottom.",
              "화점보다 한 줄 더 귀 쪽, 오른쪽 변과 아래 변에서 셋째 줄입니다.",
              "星より一路隅寄り、右辺からも下辺からも三線目です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋从下边挡住了。沿右边往上爬：紧挨着你的子和黑棋的星位子。",
              "Black has blocked on the bottom side. Crawl up the right side, next to your stone and to Black's star-point stone.",
              "흑이 아래쪽 변에서 막았습니다. 오른쪽 변을 따라 위로 기어가세요. 백돌과 흑 화점 돌에 함께 붙는 자리입니다.",
              "黒が下辺の側からオサエました。右辺に沿って上へハいましょう。白石と黒の星の石の両方に接する所です。",
            ),
            board: j33br(2),
            toMove: WHITE,
            accept: pts([6, 5]),
            success: L("爬了一步，接下来黑棋会扳住。", "One step along the side; Black will now hane in front.", "한 칸 기었습니다. 이제 흑이 앞을 젖힐 것입니다.", "一つハいました。次は黒が前をハネます。"),
            wrong: L(
              "在你的子正上方，同时挨着黑棋的星位子。",
              "Directly above your stone, also touching Black's star-point stone.",
              "백돌 바로 위, 흑 화점 돌과도 닿는 곳입니다.",
              "白石のすぐ上、黒の星の石にも接する所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋扳住了你的头。在二路扳。",
              "Black has played the hane in front of you. Hane on the second line.",
              "흑이 앞을 젖혔습니다. 2선에서 젖히세요.",
              "黒が前をハネました。二線でハネましょう。",
            ),
            board: j33br(4),
            toMove: WHITE,
            accept: pts([7, 4]),
            success: L("二路扳，扩大角上的眼位。", "The second-line hane widens your space in the corner.", "2선 젖힘으로 귀의 공간을 넓혔습니다.", "二線のハネで、隅の広さを確保します。"),
            wrong: L(
              "在二路，斜挨着你的子、紧贴黑棋扳的子。",
              "On the second line, diagonally next to your stone and touching Black's hane stone.",
              "2선에서, 백돌과 대각선이면서 흑의 젖힌 돌에 붙은 곳입니다.",
              "二線で、白石と斜めに接し、黒のハネた石にくっつく所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋挡住了，你二路扳的子可能被切断。粘上。",
              "Black has blocked, and your second-line stone could be cut off. Connect it.",
              "흑이 막아 2선의 백돌이 끊길 수 있습니다. 이으세요.",
              "黒がオサエて、二線の白石が切られそうです。継ぎましょう。",
            ),
            board: j33br(6),
            toMove: WHITE,
            accept: pts([7, 5]),
            success: L("粘上，白棋在角上活了。黑棋补一手断点，你就拿到先手。", "Connected, and White lives in the corner. Once Black protects its cutting point, you have sente.", "이어서 백은 귀에서 살았습니다. 흑이 끊는 점을 지키면 백이 선수를 잡습니다.", "継いで白は隅で生きました。黒が切りの点を守れば、白の先手です。"),
            wrong: L(
              "两颗白子斜着，中间的那个空点就是断点，粘在那里。",
              "Your two stones touch diagonally; the empty point between them is the cutting point. Connect there.",
              "백 두 점이 대각선으로 닿아 있고, 그 사이 빈 점이 끊는 점입니다. 거기를 이으세요.",
              "白二子が斜めに接しています。その間の空点が切りの点です。そこを継ぎましょう。",
            ),
          },
        ],
      },
      {
        id: "joseki-approach",
        title: L("小飞挂与小飞应", "Knight's approach and response", "날일자 걸침과 받음", "小ゲイマガカリと受け"),
        steps: [
          {
            kind: "read",
            text: L(
              "白1小飞挂星位，黑2在另一边小飞应，守住角；白3沿上边拆二，给挂角子安一个根据地。黑棋得到角和先手，白棋在上边站稳了。这是常见的下法之一，不是唯一的应法。",
              "White 1 approaches the star point with a small knight's move. Black 2 answers with a small knight's move on the other side, securing the corner. White 3 makes a two-space extension along the top side, giving the approaching stone a base. Black gets the corner and sente; White is settled on the top side. This is one common way, not the only answer.",
              "백 1로 화점에 날일자로 걸치고, 흑 2로 반대쪽에 날일자로 받아 귀를 지킵니다. 백 3으로 위쪽 변에 두 칸 벌려 걸친 돌의 근거를 만듭니다. 흑은 귀와 선수를 얻고, 백은 위쪽 변에 자리를 잡았습니다. 흔한 진행 가운데 하나이며, 유일한 응수는 아닙니다.",
              "白1の小ゲイマガカリに、黒2は反対側に小ゲイマに受けて隅を守ります。白3は上辺に二間ビラキして、カカリの石に根拠を作ります。黒は隅と先手を、白は上辺の安定を得ました。よくある進行の一つで、唯一の受け方ではありません。",
            ),
            board: joseki(11, 9, STAR, JAPPROACH, 3, { numbers: true }),
          },
          {
            kind: "place",
            text: L(
              "你执白。用小飞挂黑棋的星位。",
              "You are White. Approach Black's star point with a small knight's move.",
              "백입니다. 흑의 화점에 날일자로 걸치세요.",
              "白番です。黒の星に小ゲイマでカカりましょう。",
            ),
            board: joseki(11, 9, STAR, JAPPROACH, 0),
            toMove: WHITE,
            accept: pts([5, 2], [2, 5]),
            success: L("挂角，不让黑棋独占这个角。", "The approach: Black will not have this corner to itself.", "걸침으로, 흑이 이 귀를 혼자 차지하지 못하게 했습니다.", "カカリで、黒に隅を独占させません。"),
            wrong: L(
              "在第三条线上，离星位一个小飞：横两路、竖一路。",
              "On the third line, a small knight's move from the star point: two lines across and one down, or the reverse.",
              "셋째 줄, 화점에서 날일자 자리입니다. 가로 두 줄, 세로 한 줄입니다.",
              "三線で、星から小ゲイマの所、横に二路と縦に一路です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋从上边挂角。在左边小飞应：从星位往下走一个小飞，落在第三条线上。",
              "White has approached on the top side. Answer with a small knight's move on the left side: from your star point, a knight's move down to the third line.",
              "백이 위쪽 변에서 걸쳤습니다. 왼쪽 변에 날일자로 받으세요. 화점에서 아래로 날일자, 셋째 줄입니다.",
              "白が上辺からカカりました。左辺に小ゲイマで受けましょう。星から下へ小ゲイマ、三線です。",
            ),
            board: joseki(11, 9, STAR, JAPPROACH, 1),
            toMove: BLACK,
            accept: pts([2, 5]),
            success: L("角守住了，白棋也不好再轻易点三三。", "The corner is secure, and the 3-3 point is no longer an easy invasion.", "귀를 지켰고, 백이 삼삼에 들어오기도 어려워졌습니다.", "隅を守り、白の三々入りも難しくなりました。"),
            wrong: L(
              "在白子的另一边应：左边第三条线，比星位低两路。",
              "Answer on the side away from the white stone: the third line of the left side, two lines below your star point.",
              "백돌의 반대쪽, 왼쪽 변 셋째 줄로 화점보다 두 줄 아래에 두세요.",
              "白石と反対側、左辺の三線で、星から二路下に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。挂角子还没有根据地：沿第三条线向右拆二。",
              "You are White. Your approaching stone still has no base: extend two spaces to the right along the third line.",
              "백입니다. 걸친 돌에 아직 근거가 없습니다. 셋째 줄을 따라 오른쪽으로 두 칸 벌리세요.",
              "白番です。カカリの石にはまだ根拠がありません。三線を右へ二間ビラキしましょう。",
            ),
            board: joseki(11, 9, STAR, JAPPROACH, 2),
            toMove: WHITE,
            accept: pts([8, 2]),
            success: L("有了根据地，白棋可以脱先了。下一手轮到黑棋。", "With a base, White's stones are settled; it is Black's turn.", "근거가 생겨 백돌은 안정되었습니다. 다음은 흑 차례입니다.", "根拠ができて白は安定しました。次は黒番です。"),
            wrong: L(
              "从白子往右，中间空两路，还在第三条线上。",
              "From the white stone go right, leaving two empty points, still on the third line.",
              "백돌에서 오른쪽으로, 두 점을 비우고 셋째 줄에 두세요.",
              "白石から右へ、間を二路あけて三線に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "joseki-attach",
        title: L("小目的托退", "Attach and draw back", "소목의 붙여 물러서기", "小目のツケヒキ"),
        steps: [
          {
            kind: "read",
            text: L(
              "黑棋小目，白1小飞挂。黑2托在白子上方（靠角的一边），白3扳，黑4退，把角上的子连在一起。接着白棋要补自己的断点。结果黑棋拿到角地，白棋得到朝外的势力。",
              "Black has a 3-4 point and White 1 approaches with a small knight's move. Black 2 attaches above the white stone, on the corner side; White 3 hanes and Black 4 draws back, joining the corner stones. Next White must protect its own cutting point. Black gets the corner territory, White gets strength facing outward.",
              "흑 소목에 백 1로 날일자 걸침. 흑 2로 백돌 위(귀 쪽)에 붙이고, 백 3으로 젖히면 흑 4로 물러서 귀의 돌을 잇습니다. 이어서 백은 자기 끊는 점을 지켜야 합니다. 흑은 귀의 집을, 백은 바깥을 향한 세력을 얻습니다.",
              "黒の小目に白1の小ゲイマガカリ。黒2は白石の上（隅側）にツケ、白3のハネに黒4とヒいて隅の石をつなぎます。続いて白は自分の切りの点を守ります。黒は隅の地を、白は外向きの勢力を得ます。",
            ),
            board: joseki(9, 9, KOMOKU, JATTACH, 4, { numbers: true }),
          },
          {
            kind: "place",
            text: L(
              "白棋挂了你的小目。托在白子正上方，也就是靠角的一边。",
              "White has approached your 3-4 stone. Attach directly above the white stone, on the corner side.",
              "백이 소목에 걸쳤습니다. 백돌 바로 위, 귀 쪽에 붙이세요.",
              "白が小目にカカりました。白石のすぐ上、隅の側にツケましょう。",
            ),
            board: joseki(9, 9, KOMOKU, JATTACH, 1),
            toMove: BLACK,
            accept: pts([2, 3]),
            success: L("托：先守住角里的空间。", "The attachment claims the corner space first.", "붙임으로 먼저 귀의 공간을 지킵니다.", "ツケで、まず隅の地を確保します。"),
            wrong: L(
              "紧挨着白子，下在它和角之间。",
              "Touch the white stone, on the side between it and the corner.",
              "백돌에 붙여, 백돌과 귀 사이에 두세요.",
              "白石にくっつけて、白石と隅の間に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋扳。往角里退，把托的子和小目连在一起。",
              "White hanes. Draw back toward the corner, joining your attaching stone to your 3-4 stone.",
              "백이 젖혔습니다. 귀 쪽으로 물러서 붙인 돌과 소목을 이으세요.",
              "白がハネました。隅の方へヒいて、ツケた石と小目をつなぎましょう。",
            ),
            board: joseki(9, 9, KOMOKU, JATTACH, 3),
            toMove: BLACK,
            accept: pts([2, 2]),
            success: L("三颗黑子连在一起，角地稳了。", "Your three stones are connected and the corner is safe.", "흑 세 점이 이어져 귀가 안전해졌습니다.", "黒三子がつながり、隅は安全です。"),
            wrong: L(
              "下在托的子上方，那个点同时挨着你的小目。",
              "Play just above your attaching stone; that point also touches your 3-4 stone.",
              "붙인 돌 바로 위에 두세요. 그 점은 소목과도 닿아 있습니다.",
              "ツケた石のすぐ上に打ちましょう。その点は小目にも接しています。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。两颗白子斜着，中间有断点。补住它：实连或虎口都可以。",
              "You are White. Your two stones touch only diagonally, and there is a cutting point between them. Protect it, with a solid or a hanging connection.",
              "백입니다. 백 두 점이 대각선으로만 닿아 있어 끊는 점이 있습니다. 꽉 잇기나 호구로 지키세요.",
              "白番です。白二子は斜めに接しているだけで、切りの点があります。カタツギかカケツギで守りましょう。",
            ),
            board: joseki(9, 9, KOMOKU, JATTACH, 4),
            toMove: WHITE,
            accept: pts([3, 4], [4, 4], [3, 5]),
            success: L("断点补好了，白棋的外势很完整。", "The cut is covered and White's outside position is whole.", "끊는 점을 지켜 백의 바깥 세력이 온전합니다.", "切りの点を守り、白の外勢は完全です。"),
            wrong: L(
              "断点在两颗白子斜对的那个空点上。补那里，或者在它旁边做虎口。",
              "The cutting point is the empty point diagonally between your two stones. Fill it, or make a tiger's mouth next to it.",
              "끊는 점은 백 두 점이 대각선으로 마주한 빈 점입니다. 거기를 잇거나 옆에 호구를 만드세요.",
              "切りの点は白二子が斜めに向き合う空点です。そこを継ぐか、隣にカケツギを打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "joseki-why",
        title: L("定式里每一手的理由", "Why each joseki move matters", "정석 한 수 한 수의 이유", "定石の一手一手の理由"),
        steps: [
          {
            kind: "problem",
            text: L(
              "点三三定式中，黑棋漏掉了最后一手。你执白：切断并吃掉黑子。",
              "In the 3-3 invasion, Black has left out the last move. You are White: cut and capture.",
              "삼삼 침입 정석에서 흑이 마지막 수를 빠뜨렸습니다. 백으로 끊어서 흑돌을 잡으세요.",
              "三々入りの定石で、黒が最後の一手を省きました。白番で、切って黒石を取りましょう。",
            ),
            problem: {
              goal: "capture",
              escape: 3,
              corner: "tl",
              diagram: [". . . . . . ,", ". . . . . . ,", ". . O X . . ,", ". O O X . . ,", ". O x . . . ,", ". x . . . . ,", ". . . . . . ,", ". . . . . . ,"],
            },
            success: L(
              "黑棋顾得了一边顾不了另一边。所以定式最后那手粘不能省。",
              "Black can save one side but not both. That is why the last connection of the joseki cannot be left out.",
              "흑은 한쪽만 지킬 수 있습니다. 그래서 정석의 마지막 이음을 생략할 수 없습니다.",
              "黒は片方しか助けられません。だから定石の最後のツギは省けないのです。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑棋用虎口补了断点，白棋还是切了进来。吃掉它。",
              "Black protected with a hanging connection, and White cut into it anyway. Capture the cutting stone.",
              "흑이 호구로 지켰는데 백이 그래도 끊어 왔습니다. 끊은 돌을 잡으세요.",
              "黒はカケツギで守りましたが、白はそれでも切ってきました。切った石を取りましょう。",
            ),
            problem: {
              goal: "capture",
              escape: 2,
              corner: "tl",
              diagram: [". . . . . . ,", ". . . . . . ,", ". . O X . . ,", ". O O X . . ,", ". O X . . . ,", ". X o X . . ,", ". . . . . . ,", ". . . . . . ,"],
            },
            success: L("虎口里的子只有一口气，所以虎口也是可靠的连接。", "A stone inside a tiger's mouth has one liberty: that is why the hanging connection holds.", "호구 안의 돌은 활로가 하나뿐이라, 호구도 믿을 만한 연결입니다.", "虎の口の中の石は呼吸点が一つ。だからカケツギも確かな継ぎです。"),
          },
          {
            kind: "place",
            text: L(
              "同一个定式，这次黑棋是从左边挡的，方向转了过来。白棋刚粘上。补好黑棋的断点。",
              "The same joseki, but Black blocked on the left side this time, so everything is turned around. White has just connected. Protect Black's cutting point.",
              "같은 정석인데 이번에는 흑이 왼쪽 변 쪽에서 막아 방향이 바뀌었습니다. 백이 방금 이었습니다. 흑의 끊는 점을 지키세요.",
              "同じ定石ですが、今度は黒が左辺の側からオサエたので向きが変わっています。白が継いだところです。黒の切りの点を守りましょう。",
            ),
            board: J33_MIRROR,
            toMove: BLACK,
            // v8: E16 (the other cutting point, between the hane and the block) is as good (KataGo).
            accept: pts([5, 2], [5, 3], [4, 3]),
            success: L("方向不同，道理一样。", "A different direction, the same reasoning.", "방향은 달라도 이치는 같습니다.", "向きが違っても、理屈は同じです。"),
            wrong: L(
              "找黑棋挡住的几颗子之间的断点，补住它或者做虎口。",
              "Find a cutting point between your blocking stones; fill it or make a tiger's mouth.",
              "막은 흑돌들 사이의 끊는 점을 찾아 잇거나 호구를 만드세요.",
              "オサエた黒石の間の切りの点を見つけ、継ぐかカケツギにしましょう。",
            ),
          },
        ],
      },
    ],
  },
  /* =============================================================== UNIT 11 */
  {
    id: "shape",
    level: "intermediate",
    title: L("好形与愚形", "Good and bad shape", "좋은 모양과 나쁜 모양", "好形と愚形"),
    summary: L(
      "空三角、双、对付觑、二子头、开花和单关：用最少的子做出最有效率的形状。",
      "The empty triangle, the bamboo joint, answering a peep, the head of two stones, the ponnuki and the one-space jump: the most work from the fewest stones.",
      "빈삼각, 쌍립, 들여다보기에 대한 응수, 두 점 머리, 빵따냄, 한 칸 뜀. 적은 돌로 가장 효율적인 모양을 만듭니다.",
      "空き三角、竹ふし、ノゾキへの対応、二目の頭、ポン抜き、一間トビ。少ない石で最も効率のよい形を作ります。",
    ),
    lessons: [
      {
        id: "shape-empty-triangle",
        title: L("空三角", "The empty triangle", "빈삼각", "空き三角"),
        steps: [
          {
            kind: "read",
            text: L(
              "左上三颗黑子弯成一个角，中间那个点（三角标记）是空的，这叫空三角，是典型的愚形：三颗子只起两颗子的作用，气也少。右边同样弯成一个角，但第四个点上是白子，这就不是空三角，没有浪费。",
              "The three black stones in the upper left bend around an empty point (the triangle): an empty triangle, the classic bad shape. Three stones do the work of two and have fewer liberties. On the right the same bend is fine: the fourth point holds a white stone, so nothing is wasted.",
              "왼쪽 위 흑 세 점이 빈 점(세모)을 감싸며 꺾여 있습니다. 이것이 빈삼각으로, 대표적인 우형입니다. 세 점이 두 점의 일밖에 못 하고 활로도 적습니다. 오른쪽도 같은 모양으로 꺾였지만 넷째 점에 백돌이 있어 빈삼각이 아니고, 낭비가 없습니다.",
              "左上の黒三子は空点（三角印）を囲んで曲がっています。これが空き三角で、代表的な愚形です。三つの石が二つ分の働きしかせず、呼吸点も少ないのです。右側も同じ曲がり方ですが、四つ目の点に白石があるので空き三角ではなく、無駄がありません。",
            ),
            board: b9(
              { 2: ". . X X . . . . .", 3: ". . X . . . . . .", 4: ". . . . . O X . .", 5: ". . . . . X X . ." },
              { marks: [{ x: 3, y: 3, type: "triangle" }, { x: 5, y: 4, type: "square" }] },
            ),
          },
          {
            kind: "place",
            text: L(
              "两颗黑子斜着，白棋已经占了其中一个连接点，威胁要切断。连上：这样弯成的形状不是空三角，因为角上是白子。",
              "Your two stones touch diagonally and White has taken one of the linking points, threatening to cut. Connect: the bend you make is not an empty triangle, because the corner of it is White's stone.",
              "흑 두 점이 대각선으로 놓였고, 백이 잇는 점 하나를 차지해 끊으려 합니다. 이으세요. 꺾인 모양이 되지만 모서리에 백돌이 있으니 빈삼각이 아닙니다.",
              "黒二子が斜めに並び、白がつなぎの点の一つを占めて切ろうとしています。継ぎましょう。曲がった形になりますが、角に白石があるので空き三角ではありません。",
            ),
            board: b9({ 3: ". . . X O . . . .", 4: ". . . . X . . . .", 6: ". . . . . . O . ." }),
            toMove: BLACK,
            accept: pts([3, 4]),
            success: L("连好了，而且没有浪费。", "Connected, and nothing wasted.", "이었고, 낭비도 없습니다.", "つながり、無駄もありません。"),
            wrong: L(
              "下在另一个连接点，同时挨着两颗黑子。",
              "Play the other linking point, the one that touches both black stones.",
              "흑 두 점에 모두 닿는 다른 잇는 점에 두세요.",
              "黒二子の両方に接する、もう一つのつなぎの点に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白，情况一样：两颗白子斜着，黑棋占了一个连接点。连上。",
              "You are White, and it is the same situation: your two stones touch diagonally and Black has taken one linking point. Connect.",
              "백입니다. 같은 상황입니다. 백 두 점이 대각선으로 놓였고 흑이 잇는 점 하나를 차지했습니다. 이으세요.",
              "白番で、同じ状況です。白二子が斜めに並び、黒がつなぎの点の一つを占めました。継ぎましょう。",
            ),
            board: b9({ 4: ". . . . . O . . .", 5: ". . . . O X . . .", 2: ". . X . . . . . ." }),
            toMove: WHITE,
            accept: pts([4, 4]),
            success: L("对方的子填在角上，这个弯就是好形。", "With the opponent's stone in the corner of the bend, the shape is good.", "모서리에 상대 돌이 있으니 이 꺾임은 좋은 모양입니다.", "曲がりの角に相手の石があるので、これは好形です。"),
            wrong: L(
              "找同时挨着两颗白子的那个空点。",
              "Find the empty point that touches both white stones.",
              "백 두 점에 모두 닿는 빈 점을 찾으세요.",
              "白二子の両方に接する空点を探しましょう。",
            ),
          },
        ],
      },
      {
        id: "shape-bamboo",
        title: L("双", "The bamboo joint", "쌍립", "竹ふし"),
        steps: [
          {
            kind: "read",
            text: L(
              "两组并排的两颗子，中间隔着两个空点（圆圈），叫“双”。它切不断：对方下进一个空点，你就下另一个。双和实连一样牢固，棋子却更舒展。",
              "Two pairs of stones side by side with two empty points between them (the circles) form a bamboo joint. It cannot be cut: if the opponent plays one of the points, you play the other. It is as safe as a solid connection, with the stones spread a little wider.",
              "나란히 선 두 점씩의 돌 사이에 빈 점 두 개(동그라미)가 있는 모양이 쌍립입니다. 끊을 수 없습니다. 상대가 한 점에 들어오면 다른 한 점에 두면 됩니다. 꽉 이은 것만큼 튼튼하면서 돌이 더 넓게 펼쳐져 있습니다.",
              "二子ずつ並んだ石の間に二つの空点（丸印）がある形が竹ふしです。切れません。相手が一方に打てば、もう一方に打てばよいのです。カタツギと同じくらい堅く、しかも石が広く働いています。",
            ),
            board: b9({ 2: ". . X . X . . . .", 3: ". . X . X . . . ." }, { marks: [{ x: 3, y: 2, type: "circle" }, { x: 3, y: 3, type: "circle" }] }),
          },
          {
            kind: "place",
            text: L(
              "再加一颗子，做成双。",
              "Add one stone to make a bamboo joint.",
              "한 점을 더해 쌍립을 만드세요.",
              "一子加えて竹ふしを作りましょう。",
            ),
            board: b9({ 2: ". . X . X . . . .", 3: ". . X . . . . . .", 5: ". . . O . O . . ." }),
            toMove: BLACK,
            accept: pts([4, 3]),
            success: L("双做成了，白棋切不断。", "A bamboo joint: White cannot cut it.", "쌍립이 되어 백이 끊을 수 없습니다.", "竹ふしができて、白は切れません。"),
            wrong: L(
              "让两组都变成并排的两颗子，中间隔两个空点。",
              "Make two side-by-side pairs, with two empty points between them.",
              "나란한 두 점씩 두 쌍을 만들고, 사이에 빈 점 두 개를 남기세요.",
              "並んだ二子を二組作り、間に空点を二つ残しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋下进了双的一个空点。下另一个，连上。",
              "White has played into one point of your bamboo joint. Play the other and stay connected.",
              "백이 쌍립의 한 점에 들어왔습니다. 다른 한 점에 두어 이으세요.",
              "白が竹ふしの一方に打ってきました。もう一方に打ってつなぎましょう。",
            ),
            board: b9({ 2: ". . X O X . . . .", 3: ". . X . X . . . .", 6: ". . . . . . O . ." }),
            toMove: BLACK,
            accept: pts([3, 3]),
            success: L("还是连着的。双不怕切。", "Still connected: a bamboo joint shrugs off the cut.", "여전히 이어져 있습니다. 쌍립은 끊기지 않습니다.", "つながったままです。竹ふしは切られません。"),
            wrong: L(
              "下在双中间剩下的那个空点。",
              "Play the empty point left between the two pairs.",
              "두 쌍 사이에 남은 빈 점에 두세요.",
              "二組の間に残った空点に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "shape-peep",
        title: L("觑要粘", "Answering a peep", "들여다보기에는 잇는다", "ノゾキにはツグ"),
        steps: [
          {
            kind: "read",
            text: L(
              "单关跳的两颗子中间有一个空点。白子贴着这个点下（三角标记），威胁下一手切断，这叫“觑”。一般要实连。这里虎口不行：觑的白子挨着断点，白棋下进去不会只剩一口气。",
              "A one-space jump leaves an empty point between two stones. White's stone next to that point (the triangle) threatens to cut next move: a peep. Usually you answer with a solid connection. A hanging connection fails here, because the peeping stone touches the cutting point, so a white stone played there would not be left with one liberty.",
              "한 칸 뛴 두 돌 사이에는 빈 점이 있습니다. 백돌이 그 점 바로 옆(세모)에 두어 다음에 끊겠다고 하는 수가 들여다보기입니다. 보통은 꽉 잇습니다. 여기서는 호구가 통하지 않습니다. 들여다본 백돌이 끊는 점에 닿아 있어, 백이 그곳에 두어도 활로가 하나만 남지 않기 때문입니다.",
              "一間トビの二子の間には空点があります。白石がその点の隣（三角印）に打ち、次に切るぞと狙うのがノゾキです。ふつうはカタツギで受けます。ここではカケツギは利きません。ノゾキの白石が切りの点に接しているので、白がそこに打っても呼吸点が一つにはならないからです。",
            ),
            board: b9({ 3: ". . . X . . . . .", 4: ". . O . . . . . .", 5: ". . . X . . . . ." }, { marks: [{ x: 2, y: 4, type: "triangle" }, { x: 3, y: 4, type: "circle" }] }),
          },
          {
            kind: "place",
            text: L(
              "白棋觑了你的单关。粘上。",
              "White peeps at your one-space jump. Connect.",
              "백이 한 칸 뜀을 들여다봤습니다. 이으세요.",
              "白が一間トビをノゾいてきました。継ぎましょう。",
            ),
            board: b9({ 3: ". . . X . . . . .", 4: ". . O . . . . . .", 5: ". . . X . . . . .", 6: ". . . . . . O . ." }),
            toMove: BLACK,
            accept: pts([3, 4]),
            success: L("粘上就不怕切了。", "Connected; the cut is gone.", "이었으니 끊길 걱정이 없습니다.", "継いだので、もう切られません。"),
            wrong: L(
              "下在两颗黑子中间的那个空点。",
              "Play the empty point between your two stones.",
              "흑 두 점 사이의 빈 점에 두세요.",
              "黒二子の間の空点に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次白棋从下面觑。同样粘上。",
              "This time White peeps from below. Connect again.",
              "이번에는 백이 아래에서 들여다봤습니다. 똑같이 이으세요.",
              "今度は白が下からノゾいてきました。同じように継ぎましょう。",
            ),
            board: b9({ 2: ". . . . . . O . .", 4: ". . X . X . . . .", 5: ". . . O . . . . ." }),
            toMove: BLACK,
            accept: pts([3, 4]),
            success: L("觑要粘，这是基本功。", "Answer a peep by connecting: a basic habit.", "들여다보면 잇는다. 기본입니다.", "ノゾキにはツグ。基本です。"),
            wrong: L(
              "白棋想切的就是两颗黑子之间的点，抢先粘在那里。",
              "White wants to cut at the point between your stones. Fill it first.",
              "백이 끊으려는 곳은 흑 두 점 사이입니다. 먼저 거기를 이으세요.",
              "白が切りたいのは黒二子の間です。先にそこを継ぎましょう。",
            ),
          },
        ],
      },
      {
        id: "shape-head-two",
        title: L("二子头必扳", "Hane at the head of two stones", "두 점 머리 젖히기", "二目の頭はハネよ"),
        steps: [
          {
            kind: "read",
            text: L(
              "两颗子对两颗子并排时，对方两子前进方向上的那个点叫“头”。在那里扳（圆圈），能压住对方、加强自己。棋谚说“二子头必扳”。",
              "When two stones face two stones side by side, the point in front of the opponent's pair is its head. A hane there (the circle) holds the opponent down and strengthens you. The proverb says: hane at the head of two stones.",
              "두 점과 두 점이 나란히 맞설 때, 상대 두 점이 나아가는 앞의 점을 머리라고 합니다. 그곳을 젖히면(동그라미) 상대를 누르고 내 돌을 강하게 합니다. 격언에 '두 점 머리는 두드려라'라고 합니다.",
              "二子と二子が並んで向き合うとき、相手の二子の進む先の点を頭と言います。そこをハネると（丸印）、相手を抑え、自分を強くできます。格言「二目の頭は見ずハネよ」。",
            ),
            board: b9({ 3: ". X X . . . . . .", 4: ". O O . . . . . ." }, { marks: [{ x: 3, y: 4, type: "circle" }] }),
          },
          {
            kind: "place",
            text: L(
              "在白棋两颗子的头上扳。",
              "Hane at the head of White's two stones.",
              "백 두 점의 머리를 젖히세요.",
              "白二子の頭をハネましょう。",
            ),
            board: b9({ 3: ". X X . . . . . .", 4: ". O O . . . . . .", 7: ". . . . . . O . ." }),
            toMove: BLACK,
            accept: pts([3, 4]),
            success: L("白棋被压在边上，黑棋面向中腹。", "White is held against the edge and Black faces the centre.", "백은 변에 눌렸고 흑은 중앙을 바라봅니다.", "白は辺に押さえ込まれ、黒は中央に向いています。"),
            wrong: L(
              "头在白棋两子往中间去的那一端，斜挨着你的子。",
              "The head is at the end of White's pair that points toward the centre, diagonally next to your stone.",
              "머리는 백 두 점이 중앙으로 향하는 쪽 끝, 흑돌과 대각선인 곳입니다.",
              "頭は白二子が中央へ向かう側の先、黒石と斜めの所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。在黑棋两颗子的头上扳。",
              "You are White. Hane at the head of Black's two stones.",
              "백입니다. 흑 두 점의 머리를 젖히세요.",
              "白番です。黒二子の頭をハネましょう。",
            ),
            board: b9({ 6: ". . . . X O . . .", 7: ". . . . X O . . .", 1: ". . X . . . . . ." }),
            toMove: WHITE,
            accept: pts([4, 5]),
            success: L("先扳到头的一方占了便宜。", "Whoever hanes at the head first comes out ahead.", "먼저 머리를 젖힌 쪽이 이득입니다.", "先に頭をハネた方が得をします。"),
            wrong: L(
              "黑棋两子朝中腹的那一端，斜挨着你的子。",
              "At the end of Black's pair that points toward the centre, diagonally next to your stone.",
              "흑 두 점이 중앙으로 향하는 끝, 백돌과 대각선인 곳입니다.",
              "黒二子が中央へ向かう先、白石と斜めの所です。",
            ),
          },
        ],
      },
      {
        id: "shape-ponnuki",
        title: L("开花", "The ponnuki", "빵따냄", "ポン抜き"),
        steps: [
          {
            kind: "read",
            text: L(
              "用四颗子在中间提掉一颗子，留下一个菱形（圆圈处是提掉的子），叫“开花”。它没有任何断点，力量向四面八方发散。棋谚说“开花三十目”。",
              "Capturing a single stone with four stones in the open leaves a diamond around the empty point (the circle): a ponnuki. It has no weaknesses and radiates strength in every direction. The proverb says a ponnuki is worth thirty points.",
              "네 점으로 가운데 한 점을 따내 마름모가 남은 모양(동그라미가 따낸 자리)을 빵따냄이라고 합니다. 약점이 전혀 없고 사방으로 힘이 뻗칩니다. 격언에 '빵따냄 30집'이라고 합니다.",
              "四つの石で中の一子を取り、ひし形が残った形（丸印が取った所）をポン抜きと言います。弱点がまったくなく、四方に力が広がります。格言「ポン抜き三十目」。",
            ),
            board: b9({ 2: ". . . X . . . . .", 3: ". . X . X . . . .", 4: ". . . X . . . . ." }, { marks: [{ x: 3, y: 3, type: "circle" }] }),
          },
          {
            kind: "place",
            text: L(
              "白子只剩一口气。提掉它，做成开花。",
              "The white stone has one liberty left. Capture it and make a ponnuki.",
              "백돌의 활로가 하나 남았습니다. 따내서 빵따냄을 만드세요.",
              "白石の呼吸点は残り一つです。取ってポン抜きにしましょう。",
            ),
            board: b9({ 2: ". . . X . . . . .", 3: ". . X O X . . . .", 6: ". . . . . . O . ." }),
            toMove: BLACK,
            accept: pts([3, 4]),
            success: L("开花！这块黑棋非常厚。", "A ponnuki: Black is very thick here.", "빵따냄! 이 흑은 아주 두텁습니다.", "ポン抜き！この黒は非常に厚い形です。"),
            wrong: L(
              "下在白子最后的那口气上。",
              "Play on the white stone's last liberty.",
              "백돌의 마지막 활로에 두세요.",
              "白石の最後の呼吸点に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白，同一个局面。别让黑棋开花：把你的子长出来。",
              "You are White in the same position. Do not let Black make a ponnuki: extend your stone.",
              "백으로 같은 장면입니다. 흑에게 빵따냄을 허용하지 말고 백돌을 뻗으세요.",
              "白番で同じ局面です。黒にポン抜かせないよう、白石を伸びましょう。",
            ),
            board: b9({ 2: ". . . X . . . . .", 3: ". . X O X . . . .", 6: ". . . . . . O . ." }),
            toMove: WHITE,
            accept: pts([3, 4]),
            success: L("长出来有了三口气，避免了被开花。", "Extended to three liberties, and the ponnuki is avoided.", "뻗어서 활로가 셋이 되었고 빵따냄을 피했습니다.", "伸びて呼吸点が三つになり、ポン抜きを避けました。"),
            wrong: L(
              "白子唯一的出口就是它下面那个点。",
              "The white stone's only way out is the point below it.",
              "백돌이 나갈 곳은 바로 아래 점뿐입니다.",
              "白石の出口は、すぐ下の点だけです。",
            ),
          },
        ],
      },
      {
        id: "shape-jump",
        title: L("单关跳", "The one-space jump", "한 칸 뜀", "一間トビ"),
        steps: [
          {
            kind: "read",
            text: L(
              "要往中腹出头时，单关跳又快又不容易被切断。棋谚说“单关无恶手”。被夹击的子常常这样跳出来。",
              "To move out into the centre, the one-space jump is fast and hard to cut. The proverb says the one-space jump is never a bad move. A pincered stone often escapes this way.",
              "중앙으로 나갈 때 한 칸 뜀은 빠르고 끊기 어렵습니다. 격언에 '한 칸 뜀에 악수 없다'고 합니다. 협공당한 돌이 자주 이렇게 뛰어나옵니다.",
              "中央へ出るとき、一間トビは速く、しかも切られにくい手です。格言「一間トビに悪手なし」。ハサまれた石はよくこうして出ていきます。",
            ),
            board: full([[2, 9], [4, 9]], [[2, 6], [2, 12], [3, 3], [3, 15]], { marks: [{ x: 4, y: 9, type: "triangle" }] }),
          },
          {
            kind: "place",
            text: L(
              "你的子在左边被上下夹住了。向中腹单关跳。",
              "Your stone on the left side is pincered from above and below. Jump one space toward the centre.",
              "왼쪽 변의 흑돌이 위아래로 협공당했습니다. 중앙으로 한 칸 뛰세요.",
              "左辺の黒石が上下からハサまれています。中央へ一間トビましょう。",
            ),
            board: full([[2, 9]], [[2, 6], [2, 12], [3, 3], [3, 15]]),
            toMove: BLACK,
            accept: pts([4, 9]),
            success: L("跳出来了，白棋很难封住你。", "Out you go; White will find it hard to seal you in.", "뛰어나왔으니 백이 가두기 어렵습니다.", "トンで出たので、白は封鎖しにくくなりました。"),
            wrong: L(
              "从黑子往右（中腹方向）走，中间空一路。",
              "From your stone go right, toward the centre, leaving one empty point.",
              "흑돌에서 오른쪽(중앙 쪽)으로, 한 점을 비우고 두세요.",
              "黒石から右（中央の方）へ、一路あけて打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋又从上面压过来。继续往中腹单关跳。",
              "White presses from above again. Keep going: another one-space jump toward the centre.",
              "백이 다시 위에서 누르려 합니다. 계속 중앙으로 한 칸 뛰세요.",
              "白がまた上から迫ってきました。続けて中央へ一間トビましょう。",
            ),
            board: full([[2, 9], [4, 9]], [[2, 6], [2, 12], [3, 3], [3, 15], [5, 7]]),
            toMove: BLACK,
            accept: pts([6, 9]),
            success: L("两次单关，黑棋已经跑到宽阔的中腹。", "Two jumps, and Black is out in the open centre.", "두 번 뛰어 흑은 넓은 중앙으로 나왔습니다.", "二度のトビで、黒は広い中央に出ました。"),
            wrong: L(
              "从最右边那颗黑子再往右，中间空一路。",
              "From your rightmost stone go right again, leaving one empty point.",
              "가장 오른쪽 흑돌에서 다시 오른쪽으로, 한 점을 비우고 두세요.",
              "一番右の黒石からさらに右へ、一路あけて打ちましょう。",
            ),
          },
        ],
      },
    ],
  },
  /* =============================================================== UNIT 12 */
  {
    id: "endgame",
    level: "intermediate",
    title: L("官子", "The endgame", "끝내기", "ヨセ"),
    summary: L(
      "先手和后手，一路扳粘，双先，逆收，以及日本规则终局时的单官和补棋。",
      "Sente and gote, the first-line hane and connection, double sente, reverse sente, and filling neutral points at the end under Japanese rules.",
      "선수와 후수, 1선 젖혀 잇기, 양선수, 역끝내기, 그리고 일본 규칙의 공배 메우기와 손질.",
      "先手と後手、一線のハネツギ、両先手、逆ヨセ、そして日本ルールの終局でのダメ詰めと手入れ。",
    ),
    lessons: [
      {
        id: "endgame-sente-gote",
        title: L("先手与后手", "Sente and gote", "선수와 후수", "先手と後手"),
        steps: [
          {
            kind: "read",
            text: L(
              "对方必须应的一手叫先手：他应了之后，又轮到你下。下完后对方可以去别处下的叫后手。官子的基本顺序：先下先手，再下后手。图中上边的扳最后要自己粘，是后手；下边沿一路往里冲，白棋要挡，是黑棋的先手。",
              "A move the opponent has to answer is sente: after the answer it is your turn again. A move after which the opponent can play elsewhere is gote. The basic order in the endgame: sente moves first, gote moves after. Here the hane at the top ends with your own connection, so it is gote; the push along the first line at the bottom must be blocked by White, so it is Black's sente.",
              "상대가 받아야 하는 수가 선수입니다. 상대가 받으면 다시 내 차례가 됩니다. 두고 나서 상대가 다른 곳에 둘 수 있으면 후수입니다. 끝내기의 기본 순서는 선수 먼저, 후수는 나중입니다. 그림에서 위쪽 젖힘은 마지막에 내가 이어야 하니 후수, 아래쪽에서 1선으로 밀고 들어가는 수는 백이 막아야 하니 흑의 선수입니다.",
              "相手が受けなければならない手が先手で、受けた後また自分の番になります。打った後で相手が他に打てる手は後手です。ヨセの基本は、先手を先に、後手は後で。図の上のハネは最後に自分で継ぐので後手、下の一線を押し込む手は白が止めなければならないので黒の先手です。",
            ),
            board: { ...EG_TWO, marks: [{ x: 4, y: 0, type: "circle" }, { x: 4, y: 8, type: "triangle" }] },
          },
          {
            kind: "place",
            text: L(
              "白棋沿一路往你的地里冲，下一手还要再冲。挡住它。",
              "White has pushed along the first line into your area and threatens to push again. Block it.",
              "백이 1선에서 흑집으로 밀고 들어왔고, 다음에 더 밀려고 합니다. 막으세요.",
              "白が一線から黒地に押し込んできて、さらに押そうとしています。止めましょう。",
            ),
            board: EG_WHITE_PUSH,
            toMove: BLACK,
            accept: pts([2, 8]),
            success: L("挡住了。白棋得了先手，这就是先手官子。", "Blocked. White keeps sente: that was a sente endgame move.", "막았습니다. 백은 선수를 잡았습니다. 이것이 선수 끝내기입니다.", "止めました。白は先手を取りました。これが先手のヨセです。"),
            wrong: L(
              "下在白子前面的一路上，紧挨着它。",
              "Play on the first line right in front of the white stone.",
              "1선에서 백돌 바로 앞에 두세요.",
              "一線で、白石のすぐ前に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你的墙伸到了一路，白棋的墙只到二路。沿一路往里冲：白棋必须挡，你的子已经连着，不用再补。",
              "Your wall reaches the first line, White's stops on the second. Push along the first line: White has to block, and your stone is already connected, so you need nothing more.",
              "흑 벽은 1선까지, 백 벽은 2선까지입니다. 1선을 따라 밀고 들어가세요. 백은 막아야 하고, 흑돌은 이미 이어져 있어 더 둘 필요가 없습니다.",
              "黒の壁は一線まで、白の壁は二線までです。一線を押し込みましょう。白は止めなければならず、黒石はもうつながっているので手入れは要りません。",
            ),
            board: EG_PUSH,
            toMove: BLACK,
            accept: pts([4, 8]),
            success: L("白棋挡住后，又轮到你。先手便宜了一目。", "After White blocks it is your turn again: a point gained in sente.", "백이 막으면 다시 흑 차례입니다. 선수로 한 집을 벌었습니다.", "白が止めると、また黒番です。先手で一目得しました。"),
            wrong: L(
              "从你一路上的那颗子往右，紧挨着推进一步。",
              "From your stone on the first line, take one step to the right.",
              "1선의 흑돌에서 오른쪽으로 한 칸 밀고 나가세요.",
              "一線の黒石から右へ一歩押しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "两个官子：上边的扳是后手，下边的冲是先手。先下先手。",
              "Two endgame moves: the hane at the top is gote, the push at the bottom is sente. Play the sente move first.",
              "끝내기가 두 곳입니다. 위쪽 젖힘은 후수, 아래쪽 밀기는 선수입니다. 선수부터 두세요.",
              "ヨセが二か所あります。上のハネは後手、下の押しは先手です。先手から打ちましょう。",
            ),
            board: EG_TWO,
            toMove: BLACK,
            accept: pts([4, 8]),
            success: L("白棋要挡，你再回头扳上边：两处都归你。", "White must block, and then you take the hane at the top as well: both are yours.", "백이 막으면 위쪽 젖힘까지 흑이 둡니다. 두 곳 모두 흑의 몫입니다.", "白が止めたら上のハネも黒が打てます。両方とも黒のものです。"),
            wrong: L(
              "先下扳，白棋就会先去下边挡住你的冲。先下下边那手先手。",
              "If you hane first, White will take away your push at the bottom. Start with the sente push at the bottom.",
              "젖힘을 먼저 두면 백이 아래쪽 밀기를 먼저 막아 버립니다. 아래쪽 선수부터 두세요.",
              "ハネを先に打つと、白に下の押しを先に止められてしまいます。下の先手から打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "endgame-first-line",
        title: L("一路扳粘", "First-line hane and connect", "1선 젖혀 잇기", "一線のハネツギ"),
        steps: [
          {
            kind: "read",
            text: L(
              "双方的墙都停在二路时，一路上常有扳粘：黑1扳，白2挡，黑1只剩一口气，黑3粘。最后轮到白棋，所以是后手。和白棋从另一边扳粘相比，双方的差别是2目。",
              "When both walls stop on the second line, there is a hane and connection on the first line: Black 1 hanes, White 2 blocks, Black 1 is in atari, and Black 3 connects. Then it is White's turn, so it is gote. Compared with White doing the same from the other side, the difference is 2 points.",
              "두 벽이 모두 2선에서 멈추면 1선에서 젖혀 잇기가 생깁니다. 흑 1로 젖히고 백 2로 막으면 흑 1이 단수가 되어 흑 3으로 잇습니다. 마지막에 백 차례이니 후수입니다. 백이 반대쪽에서 젖혀 잇는 것과 비교하면 차이는 2집입니다.",
              "両方の壁が二線で止まっているときは、一線のハネツギがあります。黒1とハネ、白2とオサエると黒1がアタリなので黒3と継ぎます。最後は白番なので後手です。白が反対側からハネツいだ場合との差は2目です。",
            ),
            board: b9(wall({ 8: ". . . X X O . . ." }), { marks: labels([4, 8, "1"], [5, 8, "2"], [3, 8, "3"]) }),
          },
          {
            kind: "place",
            text: L(
              "两边的墙都停在二路。在一路上扳。",
              "Both walls stop on the second line. Hane on the first line.",
              "두 벽 모두 2선에서 멈췄습니다. 1선에서 젖히세요.",
              "両方の壁が二線で止まっています。一線でハネましょう。",
            ),
            board: EG_HANE,
            toMove: BLACK,
            accept: pts([4, 8]),
            success: L("扳了。看白棋怎么应。", "The hane. Now see how White answers.", "젖혔습니다. 백의 응수를 봅시다.", "ハネました。白の応手を見ましょう。"),
            wrong: L(
              "一路上、斜挨着你二路的子、紧贴白子的那个点。",
              "The first-line point diagonally below your second-line stone and touching White's stone.",
              "흑의 2선 돌과 대각선이면서 백돌에 붙은 1선의 점입니다.",
              "黒の二線の石と斜めで、白石に接する一線の点です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋挡住了，你扳的子只剩一口气。粘上。",
              "White has blocked and your hane stone is in atari. Connect it.",
              "백이 막아서 젖힌 흑돌이 단수입니다. 이으세요.",
              "白がオサエて、ハネた黒石がアタリです。継ぎましょう。",
            ),
            board: b9(wall({ 8: ". . . . X O . . ." })),
            toMove: BLACK,
            accept: pts([3, 8]),
            success: L("扳粘完成，后手。", "Hane and connection done, in gote.", "젖혀 잇기를 마쳤습니다. 후수입니다.", "ハネツギの完成、後手です。"),
            wrong: L(
              "下在扳的子剩下的那口气上。",
              "Play on your hane stone's last liberty.",
              "젖힌 돌의 마지막 활로에 두세요.",
              "ハネた石の最後の呼吸点に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次白棋在一路扳了。挡住它。",
              "This time White has played the first-line hane. Block it.",
              "이번에는 백이 1선에서 젖혔습니다. 막으세요.",
              "今度は白が一線でハネました。オサエましょう。",
            ),
            board: EG_WHITE_HANE,
            toMove: BLACK,
            accept: pts([2, 8]),
            success: L("挡住后白子被打吃，白棋要自己粘：白棋后手。", "Now White's hane stone is in atari and White must connect: gote for White.", "막으니 백의 젖힌 돌이 단수가 되어 백이 이어야 합니다. 백의 후수입니다.", "オサエると白のハネた石がアタリになり、白は継がなければなりません。白の後手です。"),
            wrong: L(
              "下在白子前面的一路上，紧挨着它。",
              "Play on the first line right in front of the white stone.",
              "1선에서 백돌 바로 앞에 두세요.",
              "一線で、白石のすぐ前に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "endgame-double-sente",
        title: L("双先", "Double sente", "양선수", "両先手"),
        steps: [
          {
            kind: "read",
            text: L(
              "三角标记的点很特别：黑棋下在这里，就打吃白子，白棋必须粘；白棋下在这里，就打吃黑子，黑棋必须粘。对双方都是先手，叫双先。双先要最先下。",
              "The marked point is special. If Black plays there, a white stone is in atari and White must connect; if White plays there, a black stone is in atari and Black must connect. It is sente for both sides: double sente. Double sente comes before everything else.",
              "세모 표시한 점은 특별합니다. 흑이 두면 백 한 점이 단수가 되어 백이 이어야 하고, 백이 두면 흑 한 점이 단수가 되어 흑이 이어야 합니다. 양쪽 모두에게 선수, 곧 양선수입니다. 양선수는 가장 먼저 둡니다.",
              "三角印の点は特別です。黒が打てば白一子がアタリで白は継がなければならず、白が打てば黒一子がアタリで黒が継がなければなりません。双方にとって先手、つまり両先手です。両先手は何よりも先に打ちます。",
            ),
            board: { ...EG_DOUBLE, marks: [{ x: 4, y: 5, type: "triangle" }] },
          },
          {
            kind: "place",
            text: L(
              "抢占双先：下在黑白两颗突出的子共同的那口气上。",
              "Take the double sente point: the liberty shared by the two stones sticking out, one black and one white.",
              "양선수 자리를 차지하세요. 튀어나온 흑돌과 백돌이 함께 쓰는 활로입니다.",
              "両先手を打ちましょう。突き出た黒石と白石の共通の呼吸点です。",
            ),
            board: EG_DOUBLE,
            toMove: BLACK,
            accept: pts([4, 5]),
            success: L("白子被打吃，白棋必须应，你还保有先手。", "White's stone is in atari, White must answer, and you keep sente.", "백돌이 단수라 백은 받아야 하고, 흑은 선수를 유지합니다.", "白石がアタリなので白は受けるしかなく、黒は先手を保ちます。"),
            wrong: L(
              "找同时挨着突出的黑子和白子的空点。",
              "Find the empty point that touches both the jutting black stone and the jutting white stone.",
              "튀어나온 흑돌과 백돌에 함께 닿는 빈 점을 찾으세요.",
              "突き出た黒石と白石の両方に接する空点を探しましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白，黑棋刚抢了双先，你的子被打吃。粘上救它。",
              "You are White. Black has just taken the double sente point and your stone is in atari. Connect to save it.",
              "백입니다. 흑이 방금 양선수를 두어 백돌이 단수입니다. 이어서 살리세요.",
              "白番です。黒が両先手を打ち、白石がアタリです。継いで助けましょう。",
            ),
            board: b9(wall({ ...DS_ROWS, 5: ". . . X X O . . ." })),
            toMove: WHITE,
            accept: pts([5, 4]),
            success: L("救回来了，但这一手是在自己地里补的，少了一目。", "Saved, but the connection is inside your own territory and costs a point.", "살렸지만 자기 집 안에 둔 수라 한 집이 줄었습니다.", "助かりましたが、自分の地の中に打ったので一目減りました。"),
            wrong: L(
              "下在被打吃的白子剩下的那口气上。",
              "Play on the last liberty of your stone in atari.",
              "단수당한 백돌의 마지막 활로에 두세요.",
              "アタリの白石の最後の呼吸点に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次是白棋先抢了双先，你的子被打吃。粘上。",
              "This time White took the double sente point first and your stone is in atari. Connect.",
              "이번에는 백이 먼저 양선수를 두어 흑돌이 단수입니다. 이으세요.",
              "今度は白が先に両先手を打ち、黒石がアタリです。継ぎましょう。",
            ),
            board: b9(wall({ ...DS_ROWS, 5: ". . . X O O . . ." })),
            toMove: BLACK,
            accept: pts([3, 6]),
            success: L("双先谁先下谁便宜，这里相差2目。", "Whoever plays double sente first gains: here the difference is 2 points.", "양선수는 먼저 두는 쪽이 이득입니다. 여기서는 2집 차이입니다.", "両先手は先に打った方の得で、ここでは2目の差です。"),
            wrong: L(
              "下在被打吃的黑子剩下的那口气上。",
              "Play on the last liberty of your stone in atari.",
              "단수당한 흑돌의 마지막 활로에 두세요.",
              "アタリの黒石の最後の呼吸点に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "endgame-reverse-sente",
        title: L("逆收", "Reverse sente", "역끝내기", "逆ヨセ"),
        steps: [
          {
            kind: "read",
            text: L(
              "下边黑棋沿一路冲是黑棋的先手。白棋如果先下在那里，自己是后手，但从此不用再应黑棋的先手，这叫逆收。逆收常常比看起来大。",
              "At the bottom, Black's push along the first line is Black's sente. If White plays there first, it is gote for White, but White will never have to answer that push. Taking away the opponent's sente move like this is called reverse sente, and it is often bigger than it looks.",
              "아래쪽에서 1선을 밀고 들어가는 것은 흑의 선수입니다. 백이 먼저 그곳에 두면 백은 후수지만, 앞으로 흑의 선수에 응할 필요가 없습니다. 이렇게 상대의 선수를 없애는 수를 역끝내기라고 하며, 보기보다 큰 경우가 많습니다.",
              "下の一線を押し込む手は黒の先手です。白が先にそこに打てば白の後手ですが、もう黒の先手に受ける必要がなくなります。このように相手の先手を消す手を逆ヨセと言い、見た目より大きいことがよくあります。",
            ),
            board: { ...EG_PUSH, marks: [{ x: 4, y: 8, type: "triangle" }] },
          },
          {
            kind: "place",
            text: L(
              "你执白。抢先下在黑棋要冲的地方，消掉黑棋的先手。",
              "You are White. Play first where Black wants to push and take away Black's sente move.",
              "백입니다. 흑이 밀고 들어오려는 곳에 먼저 두어 흑의 선수를 없애세요.",
              "白番です。黒が押し込みたい所に先に打って、黒の先手を消しましょう。",
            ),
            board: EG_PUSH,
            toMove: WHITE,
            accept: pts([4, 8]),
            success: L("逆收：后手，但白地保住了一目。", "Reverse sente: gote, but White's point is safe.", "역끝내기입니다. 후수지만 백집 한 집을 지켰습니다.", "逆ヨセです。後手ですが白地の一目を守りました。"),
            wrong: L(
              "下在一路上、你墙的正下方，挨着黑子。",
              "Play on the first line directly below your wall, next to the black stone.",
              "1선에서 백 벽 바로 아래, 흑돌 옆에 두세요.",
              "一線で、白の壁のすぐ下、黒石の隣に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "上边白棋有一个一路冲的先手，下边你有一个同样大的先手。先下自己的先手，白棋挡了以后，再回头逆收上边。",
              "At the top White has a sente push along the first line; at the bottom you have a sente push of the same size. Play your sente first; after White blocks, come back and take the reverse sente at the top.",
              "위쪽에는 백의 1선 밀기 선수가, 아래쪽에는 같은 크기의 흑 선수가 있습니다. 흑의 선수를 먼저 두고, 백이 막으면 위쪽을 역끝내기로 막으세요.",
              "上には白の一線の押しの先手、下には同じ大きさの黒の先手があります。黒の先手を先に打ち、白が止めたら上を逆ヨセで止めましょう。",
            ),
            board: EG_REVERSE,
            toMove: BLACK,
            accept: pts([4, 8]),
            success: L("先手、再逆收，两处的便宜都归你。", "Sente first, reverse sente after: you gain in both places.", "선수 먼저, 그다음 역끝내기. 두 곳 모두 흑의 이득입니다.", "先手を打ってから逆ヨセ。両方とも黒の得です。"),
            wrong: L(
              "先在下边沿一路冲：那是你的先手。",
              "Start with your sente push along the first line at the bottom.",
              "먼저 아래쪽에서 1선을 밀고 들어가세요. 그것이 흑의 선수입니다.",
              "まず下で一線を押し込みましょう。それが黒の先手です。",
            ),
          },
        ],
      },
      {
        id: "endgame-japanese-counting",
        title: L("单官与补棋", "Neutral points and the last defence", "공배와 손질", "ダメ詰めと手入れ"),
        steps: [
          {
            kind: "read",
            text: L(
              "日本规则：双方停一手以后，拿掉死子，把提子填进对方的地，再数目。单官不算目，但要填完。小心：填单官可能让你的子被打吃，这时必须在自己地里补一手（补棋），自己的地就少一目。",
              "Under Japanese rules, after both players pass, dead stones are removed, prisoners are placed in the opponent's territory, and the territory is counted. Neutral points are worth nothing, but they are all filled. Be careful: filling one can put your stones in atari, and then you must add a defensive stone inside your own territory, which costs you a point.",
              "일본 규칙에서는 두 사람이 패스한 뒤 사석을 들어내고, 따낸 돌을 상대 집에 메운 다음 계가합니다. 공배는 집이 아니지만 모두 메웁니다. 주의할 점: 공배를 메우다가 내 돌이 단수가 될 수 있고, 그러면 내 집 안에 손질을 해야 해서 한 집이 줄어듭니다.",
              "日本ルールでは、双方パスの後、死に石を取り上げ、アゲハマを相手の地に埋めて整地します。ダメは目になりませんが、すべて詰めます。注意：ダメを詰めると自分の石がアタリになることがあり、そのときは自分の地の中に手入れが必要で、一目減ります。",
            ),
            board: { ...EG_COUNT, marks: [{ x: 4, y: 4, type: "triangle" }, { x: 4, y: 1, type: "circle" }] },
          },
          {
            kind: "place",
            text: L(
              "还剩两个单官。其中一个要紧：如果白棋填它，你的一颗子会被打吃。自己先把这个单官填掉。",
              "Two neutral points are left. One of them matters: if White fills it, one of your stones will be in atari. Fill that one yourself.",
              "공배가 둘 남았습니다. 그중 하나가 중요합니다. 백이 메우면 흑 한 점이 단수가 됩니다. 그 공배를 먼저 메우세요.",
              "ダメが二つ残っています。そのうち一つが大事です。白に詰められると黒一子がアタリになります。そのダメを自分で先に詰めましょう。",
            ),
            board: EG_COUNT,
            toMove: BLACK,
            accept: pts([4, 4]),
            success: L("填了这里，就不用在自己地里补棋。", "Filled: now you will not need a defensive move inside your territory.", "여기를 메웠으니 집 안에 손질할 필요가 없습니다.", "ここを詰めたので、地の中の手入れは要りません。"),
            wrong: L(
              "看你那颗突出的子：它只有两口气，其中一口是单官。",
              "Look at your stone that sticks out: it has two liberties, and one of them is a neutral point.",
              "튀어나온 흑돌을 보세요. 활로가 둘인데 그중 하나가 공배입니다.",
              "突き出た黒石を見ましょう。呼吸点は二つで、そのうち一つがダメです。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋填了那个单官，你的子被打吃了。在自己地里粘上：少一目，总比丢子好。",
              "White filled that neutral point and your stone is in atari. Connect inside your own territory: a point lost is better than a stone lost.",
              "백이 그 공배를 메워 흑돌이 단수입니다. 자기 집 안에서 이으세요. 한 집 줄어도 돌을 잃는 것보다 낫습니다.",
              "白がそのダメを詰め、黒石がアタリです。自分の地の中で継ぎましょう。一目減っても、石を取られるよりましです。",
            ),
            board: b9(wall({ ...JP_ROWS, 1: ". . . X X O . . .", 4: ". . . X O O . . ." })),
            toMove: BLACK,
            accept: pts([3, 5]),
            success: L("补好了。现在可以停一手了。", "Defended. Now you can pass.", "손질을 마쳤습니다. 이제 패스해도 됩니다.", "手入れが済みました。これでパスできます。"),
            wrong: L(
              "下在被打吃的黑子剩下的那口气上。",
              "Play on the last liberty of your stone in atari.",
              "단수당한 흑돌의 마지막 활로에 두세요.",
              "アタリの黒石の最後の呼吸点に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "endgame-order",
        title: L("官子的顺序", "Endgame order", "끝내기 순서", "ヨセの順番"),
        steps: [
          {
            kind: "place",
            text: L(
              "棋盘上有三个官子：中间的双先，下边你的先手冲，上边后手的扳。按顺序下，先下双先。",
              "Three endgame moves are left: the double sente point in the middle, your sente push at the bottom and the gote hane at the top. Play them in order, double sente first.",
              "끝내기가 세 곳 남았습니다. 가운데 양선수, 아래쪽 흑의 선수 밀기, 위쪽 후수 젖힘입니다. 순서대로, 양선수부터 두세요.",
              "ヨセが三か所残っています。真ん中の両先手、下の黒の先手の押し、上の後手のハネです。順番に、両先手から打ちましょう。",
            ),
            board: b9(EG_PRACTICE_ROWS),
            toMove: BLACK,
            accept: pts([4, 5]),
            success: L("白棋粘上，又轮到你。", "White connects, and it is your turn again.", "백이 잇고, 다시 흑 차례입니다.", "白が継ぎ、また黒番です。"),
            wrong: L(
              "双先是黑白两颗突出的子共同的那口气。",
              "The double sente point is the liberty shared by the jutting black and white stones.",
              "양선수는 튀어나온 흑돌과 백돌이 함께 쓰는 활로입니다.",
              "両先手は、突き出た黒石と白石の共通の呼吸点です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "接下来是下边的先手冲。",
              "Next, the sente push at the bottom.",
              "다음은 아래쪽 선수 밀기입니다.",
              "次は下の先手の押しです。",
            ),
            board: b9(wall({ ...EG_PRACTICE_ROWS, 4: ". . . X O O O . .", 5: ". . . X X O . . ." })),
            toMove: BLACK,
            accept: pts([4, 8]),
            success: L("白棋挡，还是你的先手。", "White blocks, and you still have sente.", "백이 막고, 여전히 흑의 선수입니다.", "白が止めて、まだ黒の先手です。"),
            wrong: L(
              "后手的扳留到最后。先在下边沿一路冲。",
              "Leave the gote hane for last. Push along the first line at the bottom.",
              "후수 젖힘은 마지막에 둡니다. 아래쪽 1선을 밀고 들어가세요.",
              "後手のハネは最後です。下の一線を押し込みましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "最后是上边的后手：一路扳。",
              "Last, the gote move at the top: the first-line hane.",
              "마지막은 위쪽 후수, 1선 젖힘입니다.",
              "最後は上の後手、一線のハネです。",
            ),
            board: b9(wall({ ...EG_PRACTICE_ROWS, 4: ". . . X O O O . .", 5: ". . . X X O . . .", 8: ". . . X X O . . ." })),
            toMove: BLACK,
            accept: pts([4, 0]),
            success: L("双先、先手、后手：这个顺序让你每一处都不吃亏。", "Double sente, then sente, then gote: in this order you lose nothing anywhere.", "양선수, 선수, 후수. 이 순서면 어디서도 손해가 없습니다.", "両先手、先手、後手。この順番なら、どこでも損をしません。"),
            wrong: L(
              "在一路上扳：斜挨着你二路的子，紧贴白子。",
              "Hane on the first line, diagonally next to your second-line stone and touching White's stone.",
              "1선에서 젖히세요. 흑의 2선 돌과 대각선이면서 백돌에 붙은 곳입니다.",
              "一線でハネましょう。黒の二線の石と斜めで、白石に接する所です。",
            ),
          },
        ],
      },
    ],
  },
  /* =============================================================== UNIT 13 */
  {
    id: "fighting",
    level: "intermediate",
    title: L("中盘战斗", "Middle-game fighting", "중반 전투", "中盤の戦い"),
    summary: L(
      "吃掉切断的子，从远处攻击，把对方分开来攻，借力攻击，以及在对方势力里腾挪。",
      "Capture the cutting stones, attack from a distance, split the opponent's stones apart, lean on stones to attack, and make sabaki in the opponent's sphere.",
      "끊은 돌 잡기, 멀리서 공격하기, 상대를 갈라서 공격하기, 기대어 공격하기, 상대 세력 안에서의 타개.",
      "切った石を取る、離れて攻める、相手を分断して攻める、もたれ攻め、そして相手の勢力の中でのサバキ。",
    ),
    lessons: [
      {
        id: "fight-cutting-stones",
        title: L("吃掉断子", "Capture the cutting stones", "끊은 돌을 잡아라", "切り石を取れ"),
        steps: [
          {
            kind: "read",
            text: L(
              "把你的棋分成两块的那几颗子叫断子（三角标记）。吃掉断子，两块棋就连成一块，战斗往往就此结束。不起切断作用的子没那么要紧。",
              "Stones that split your groups apart are the cutting stones (the triangle). Capture them and your groups become one; the fight is often over. Stones that cut nothing matter much less.",
              "흑을 두 덩어리로 가르는 돌이 끊은 돌입니다(세모). 끊은 돌을 잡으면 두 덩어리가 하나로 이어지고, 싸움은 대개 거기서 끝납니다. 아무것도 끊지 않는 돌은 그만큼 중요하지 않습니다.",
              "黒を二つに分けている石が切り石です（三角印）。切り石を取れば二つの石が一つにつながり、戦いはたいていそこで決まります。何も切っていない石はそれほど大事ではありません。",
            ),
            board: win(9, 8, [[4, 2], [2, 3], [3, 4]], [[3, 3], [6, 4], [5, 5]], { marks: [{ x: 3, y: 3, type: "triangle" }] }),
          },
          {
            kind: "problem",
            text: L(
              "白子切断了你的子，右下还有白棋接应。往角上的方向征吃它。",
              "The white stone cuts your stones apart, and more white stones wait to the lower right. Capture it with a ladder that runs toward the corner.",
              "백돌이 흑을 끊었고, 오른쪽 아래에는 백의 원군이 있습니다. 귀 쪽으로 축으로 잡으세요.",
              "白石が黒を切っていて、右下には白の応援がいます。隅の方へシチョウで取りましょう。",
            ),
            problem: {
              goal: "capture",
              corner: "tl",
              diagram: [". . . . . . . . .", ". . . . . . . . .", ". . . . X . . . .", ". . X o . . . . .", ". . . X . . O . .", ". . . . . O . . .", ". . . . . . . . .", ". . . . . . . . ."],
            },
            success: L("断子被吃，黑棋连成一片。", "The cutting stone is gone and your stones are one group.", "끊은 돌을 잡아 흑이 하나로 이어졌습니다.", "切り石を取り、黒は一つにつながりました。"),
          },
          {
            kind: "problem",
            text: L(
              "这颗白子切断了黑棋。中央的白子会救征子，用枷吃。",
              "This white stone has cut through. The white stone in the centre would rescue a ladder, so catch it with a net.",
              "이 백돌이 흑을 끊었습니다. 중앙의 백돌 때문에 축은 안 되니 장문으로 잡으세요.",
              "この白石が黒を切っています。中央の白石がシチョウを助けるので、ゲタで取りましょう。",
            ),
            problem: {
              goal: "capture",
              at: [3, 3],
              diagram: [". . . . . . . . . .", ". . . . . . . . . .", ". . . X X . . . . .", ". . X o . . . . . .", ". . X . . . . . . .", ". . . . . . . . . .", ". . . . . . O . . .", ". . . . . . . . . .", ". . . . . . . . . ."],
            },
            success: L("枷住了，断子跑不掉。", "Netted: the cutting stone cannot get away.", "장문에 걸려 끊은 돌이 도망가지 못합니다.", "ゲタにかかり、切り石は逃げられません。"),
          },
          {
            kind: "problem",
            text: L(
              "白子在二路切断了两颗黑子。从中腹一侧挡住它，把它赶到边上吃掉。",
              "A white stone on the second line cuts between your stones. Block it from the centre side and capture it against the edge.",
              "2선의 백돌이 흑 두 점 사이를 끊었습니다. 중앙 쪽에서 막아 변으로 몰아 잡으세요.",
              "二線の白石が黒二子の間を切っています。中央側から止めて、辺へ追い込んで取りましょう。",
            ),
            problem: {
              goal: "capture",
              corner: "tl",
              diagram: [". . . . . . . . . .", ". . . X o X . . . .", ". . . O . X . . . .", ". . . O . . . . . .", ". . . . . . . . . .", ". . . . . . . . . ."],
            },
            success: L("断子被赶到一路吃掉了。", "Driven to the first line and captured.", "끊은 돌을 1선으로 몰아 잡았습니다.", "切り石を一線へ追い込んで取りました。"),
          },
        ],
      },
      {
        id: "fight-attack-distance",
        title: L("从远处攻击", "Attack from a distance", "멀리서 공격하기", "離れて攻める"),
        steps: [
          {
            kind: "read",
            text: L(
              "要攻击对方的弱子，一般不要贴上去：碰了它，它反而能借着扳、长整出形状。更好的办法是隔开一段距离，抢走它做根据地的地方，或者挡住它往中腹的出路。",
              "To attack a weak stone, do not usually touch it: a contact play lets it hane and extend into good shape. It is better to stay a little apart, taking away the room it needs for a base or blocking its way to the centre.",
              "약한 돌을 공격할 때는 보통 붙이지 않습니다. 붙이면 상대가 젖히고 뻗으며 모양을 갖추게 됩니다. 조금 떨어져서 근거를 만들 자리를 빼앗거나 중앙으로 나가는 길을 막는 편이 좋습니다.",
              "弱い石を攻めるとき、ふつうはくっつけません。ツケると相手はハネたり伸びたりして形を整えてしまいます。少し離れて、根拠を作る場所を奪うか、中央への出口をふさぐ方がよいのです。",
            ),
            board: full([[3, 3], [2, 5], [3, 15], [2, 13]], [[2, 9]], { marks: [{ x: 2, y: 13, type: "triangle" }] }),
          },
          {
            kind: "place",
            text: L(
              "白棋打入了你的左边。上方是你的守角，它往上已经没有地方。不要贴着它：在它下方、中间空一到三路的第三或第四条线上，抢走它拆边的地方。",
              "White has invaded your left side. Your enclosure above leaves it no room upward. Do not touch it: play below it, with one to three empty points between, on the third or fourth line, where it would extend for a base.",
              "백이 왼쪽 변에 침입했습니다. 위쪽은 흑의 굳힘이 있어 백에게 여유가 없습니다. 붙이지 말고, 그 아래로 한 칸에서 세 칸을 비운 셋째나 넷째 줄, 백이 벌리려는 자리를 차지하세요.",
              "白が左辺に打ち込んできました。上は黒のシマリがあって余地がありません。くっつけずに、その下に一路から三路あけた三線か四線、白がヒラきたい所を占めましょう。",
            ),
            board: full([[3, 3], [2, 5], [3, 15]], [[2, 9]]),
            toMove: BLACK,
            accept: box(2, 11, 3, 13),
            success: L("白子没有根据地，只好往中腹逃，你可以一边追一边得利。", "Without a base, White must run for the centre, and you profit as you chase.", "근거가 없는 백은 중앙으로 도망쳐야 하고, 흑은 쫓으면서 이득을 봅니다.", "根拠のない白は中央へ逃げるしかなく、黒は追いながら得をします。"),
            wrong: L(
              "不要碰白子。往下中间空一到三路，在第三或第四条线上下。",
              "Do not touch the white stone. Go below it, leaving one to three empty points, on the third or fourth line.",
              "백돌에 붙이지 마세요. 아래로 한 칸에서 세 칸을 비우고 셋째나 넷째 줄에 두세요.",
              "白石にくっつけてはいけません。下へ一路から三路あけて、三線か四線に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白子落在你两颗子中间，想往中腹出头。镇住它：在它朝中腹的方向隔一路下。",
              "The white stone sits between two of yours and wants to head for the centre. Cap it: play one space away from it on its centre side.",
              "백돌이 흑 두 점 사이에 들어와 중앙으로 나가려 합니다. 모자를 씌우세요. 백돌의 중앙 쪽으로 한 칸 떨어져 둡니다.",
              "白石が黒二子の間に入り、中央へ出ようとしています。ボウシしましょう。白石の中央側に一路あけて打ちます。",
            ),
            board: full([[3, 3], [15, 3], [3, 15]], [[9, 3], [15, 15]]),
            toMove: BLACK,
            accept: pts([9, 5]),
            success: L("镇头挡住了出路，白子很难受。", "The cap blocks the way out, and the white stone is in trouble.", "모자로 나갈 길을 막아 백돌이 괴로워졌습니다.", "ボウシで出口をふさぎ、白石は苦しくなりました。"),
            wrong: L(
              "从白子往下（中腹方向）数，中间空一路，不要贴着它。",
              "Count down from the white stone toward the centre, leave one empty point, and do not touch it.",
              "백돌에서 아래(중앙 쪽)로 한 점을 비우고 두세요. 붙이지는 않습니다.",
              "白石から下（中央の方）へ、一路あけて打ちましょう。くっつけません。",
            ),
          },
        ],
      },
      {
        id: "fight-split",
        title: L("分开攻击", "Splitting attack", "갈라서 공격하기", "分断して攻める"),
        steps: [
          {
            kind: "read",
            text: L(
              "对方有两块弱棋时，不要让它们连在一起。下在两者之间：攻一块的同时也在攻另一块，对方很难两边都照顾到。而且你在追击中得到的强化，也会给后面的战斗带来好处。",
              "When the opponent has two weak groups, do not let them join. Play between them: an attack on one is also an attack on the other, and it is hard to look after both. The strength you gain while chasing them will also help in the fights that follow.",
              "상대에게 약한 돌이 둘 있으면 서로 이어지지 못하게 합니다. 그 사이에 두면 한쪽을 공격하면서 다른 쪽도 공격하게 되어, 상대는 양쪽을 다 돌보기 어렵습니다. 쫓으면서 얻은 두터움은 이후의 싸움에도 도움이 됩니다.",
              "相手に弱い石が二つあれば、つながらせないことです。その間に打てば、一方を攻めながら他方も攻めることになり、相手は両方を守りきれません。追いながら得た厚みは、その後の戦いにも役立ちます。",
            ),
            board: full([[3, 3], [15, 3], [3, 15], [15, 15], [9, 9]], [[9, 3], [9, 15]], { marks: [{ x: 9, y: 9, type: "triangle" }] }),
          },
          {
            kind: "place",
            text: L(
              "上边和下边各有一颗白子，都在黑棋的势力中。在它们中间、天元一带落子，不让它们连上。",
              "There is a lone white stone on the top side and another on the bottom side, both inside Black's sphere. Play between them, around the centre point, so they cannot join.",
              "위쪽 변과 아래쪽 변에 백돌이 하나씩, 모두 흑의 세력 안에 있습니다. 그 사이, 천원 부근에 두어 이어지지 못하게 하세요.",
              "上辺と下辺に白石が一つずつ、どちらも黒の勢力の中にあります。その間、天元のあたりに打って、つながらせないようにしましょう。",
            ),
            board: full([[3, 3], [15, 3], [3, 15], [15, 15]], [[9, 3], [9, 15]]),
            toMove: BLACK,
            accept: box(8, 8, 10, 10),
            success: L("两颗白子被分开，你可以轮流攻击它们。", "The two white stones are split, and you can attack them in turn.", "백돌 둘이 갈라져, 번갈아 공격할 수 있습니다.", "白石二つが分断され、交互に攻められます。"),
            wrong: L(
              "下在两颗白子之间的中央，天元附近。",
              "Play in the middle between the two white stones, near the centre point.",
              "두 백돌 사이 한가운데, 천원 근처에 두세요.",
              "二つの白石の間の真ん中、天元の近くに打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "两颗白子只靠一个点连着。切断它们，让它们成为两块弱棋。",
              "Two white stones are linked through a single point. Cut there, so that they become two weak groups.",
              "백 두 점이 한 점으로만 이어져 있습니다. 끊어서 약한 두 덩어리로 만드세요.",
              "白二子が一点だけでつながっています。切って、弱い石二つにしましょう。",
            ),
            board: full([[3, 3], [15, 3], [3, 15], [15, 15], [10, 8]], [[9, 8], [10, 9]]),
            toMove: BLACK,
            accept: pts([9, 9]),
            success: L("切断了，白棋要同时照顾两块。", "Cut: White now has two groups to look after.", "끊었습니다. 백은 두 덩어리를 함께 돌봐야 합니다.", "切りました。白は二つの石を同時に守らなければなりません。"),
            wrong: L(
              "找同时挨着两颗白子的空点。",
              "Find the empty point that touches both white stones.",
              "백 두 점에 모두 닿는 빈 점을 찾으세요.",
              "白二子の両方に接する空点を探しましょう。",
            ),
          },
        ],
      },
      // v6: leaning attack and sabaki. The tactical steps are proved by the
      // solver; the claims about the stones gained by leaning were checked
      // too (without them, the capture fails).
      {
        id: "fight-leaning",
        title: L("借力攻击", "Leaning attack", "기대어 공격하기", "もたれ攻め"),
        steps: [
          {
            kind: "read",
            text: L(
              "想攻击的子不好直接攻时，可以先靠在旁边的对方棋子上。对方必须应的先手（先手便宜），会让你的子落在有用的位置；这些子随后就能帮你攻击真正的目标。三角标记的黑子就是这样得来的：它靠在右上的白子下面，白棋扳住应了。",
              "When the stone you want to attack is hard to reach directly, lean on a nearby enemy stone first. Forcing moves that the opponent has to answer (kikashi) put your stones in useful places, and those stones then help the attack on the real target. The marked black stone came that way: it attached under the white stone at the upper right, and White answered with a hane.",
              "공격하려는 돌을 직접 공격하기 어려울 때는 먼저 근처의 상대 돌에 기댑니다. 상대가 받아야 하는 수(선수 활용)로 흑돌을 쓸모 있는 자리에 놓고, 그 돌이 진짜 목표를 공격하는 데 힘이 됩니다. 세모로 표시한 흑돌이 그렇게 생긴 돌입니다. 오른쪽 위 백돌 아래에 붙였고, 백은 젖혀서 받았습니다.",
              "攻めたい石を直接攻めにくいときは、まず近くの相手の石にもたれます。相手が受けるしかない利かしで黒石を役に立つ場所に置き、その石が本当の目標を攻める力になります。三角印の黒石はそうしてできた石です。右上の白石の下にツケて、白はハネて受けました。",
            ),
            board: win(9, 9, [[4, 3], [3, 4], [5, 5], [6, 3]], [[4, 4], [6, 2], [2, 7], [7, 3]], { marks: [{ x: 6, y: 3, type: "triangle" }] }),
          },
          {
            kind: "problem",
            text: L(
              "右上那颗靠出来的黑子要是不在，切断的白子就能逃掉；现在它正好挡在白子的去路上。吃掉切断的白子（三角标记）。",
              "Without your leaning stone at the upper right, the cutting stone would escape; now it stands in its way. Capture the cutting stone (the triangle).",
              "오른쪽 위에 기대어 둔 흑돌이 없으면 끊은 백돌은 도망갑니다. 지금은 그 흑돌이 길을 막고 있습니다. 끊은 백돌(세모)을 잡으세요.",
              "右上でもたれた黒石がなければ、切った白石は逃げられます。今はその黒石が行く手をふさいでいます。切った白石（三角印）を取りましょう。",
            ),
            problem: {
              goal: "capture",
              corner: "tl",
              diagram: [
                ". . . . . . . . .",
                ". . . . . . . . .",
                ". . . . . . O . .",
                ". . . . X . X O .",
                ". . . X o . . . .",
                ". . . . . X . . .",
                ". . . . . . . . .",
                ". . O . . . . . .",
                ". . . . . . . . .",
              ],
            },
            success: L("吃住了。靠出来的那颗子发挥了作用。", "Captured. The stone you gained by leaning did the work.", "잡았습니다. 기대어 얻은 돌이 제 몫을 했습니다.", "取りました。もたれて得た石が働きました。"),
          },
          {
            kind: "problem",
            text: L(
              "这里黑棋从下面和右边靠住了右上的白子，白棋向左长。切断的白子看起来很自由，但右边的黑子挡住了它的出路。吃掉它。",
              "Here Black leaned on the white stone at the upper right from below and from the right, and White extended to the left. The cutting stone looks free, but your stones on the right block its way out. Capture it.",
              "여기서는 흑이 오른쪽 위 백돌에 아래와 오른쪽에서 기댔고, 백은 왼쪽으로 뻗었습니다. 끊은 백돌은 자유로워 보이지만 오른쪽 흑돌이 나갈 길을 막고 있습니다. 잡으세요.",
              "ここでは黒が右上の白石に下と右からもたれ、白は左へ伸びました。切った白石は自由に見えますが、右の黒石が出口をふさいでいます。取りましょう。",
            ),
            problem: {
              goal: "capture",
              corner: "tl",
              diagram: [
                ". . . . . . . . .",
                ". . . . . . . . .",
                ". . . . . O O X .",
                ". . . . X . X . .",
                ". . . X o . . . .",
                ". . . . . X . . .",
                ". . . . . . . . .",
                ". . O . . . . . .",
                ". . . . . . . . .",
              ],
            },
            success: L("吃住了：靠压得来的力量派上了用场。", "Captured: the strength you gained by leaning paid off.", "잡았습니다. 기대어 얻은 힘이 효과를 냈습니다.", "取りました。もたれて得た力が生きました。"),
          },
        ],
      },
      {
        id: "fight-sabaki",
        title: L("腾挪", "Sabaki", "타개", "サバキ"),
        steps: [
          {
            kind: "read",
            text: L(
              "在对方的势力里，要下得轻灵、有弹性，这叫腾挪。不必每颗子都救：已经完成任务的子可以放弃；碰、扳这类接触的手能帮你很快安定下来。目标是一块能活或能出头的棋，而不是一块必须拼命去救的重棋。",
              "In the opponent's sphere, play light, flexible shape: that is sabaki. You do not have to save every stone. A stone that has done its job can be given up, and contact plays (attach, hane) help you settle quickly. The aim is a group that can live or get out, not a heavy group that must be rescued.",
              "상대의 세력 안에서는 가볍고 탄력 있게 두어야 합니다. 이것을 타개라고 합니다. 모든 돌을 살릴 필요는 없습니다. 제 역할을 다한 돌은 버려도 되고, 붙이기와 젖히기 같은 접촉하는 수는 빨리 안정하는 데 도움이 됩니다. 목표는 살거나 빠져나갈 수 있는 돌이지, 억지로 구해야 하는 무거운 돌이 아닙니다.",
              "相手の勢力の中では、軽く弾力のある形に打ちます。これがサバキです。すべての石を助ける必要はありません。役目を終えた石は捨ててよく、ツケやハネのように接触する手は早く安定するのに役立ちます。目標は生きるか出られる石で、無理に助けなければならない重い石ではありません。",
            ),
            board: win(8, 7, [[1, 1], [3, 2], [3, 3]], [[0, 1], [2, 1], [3, 1], [1, 2], [1, 3], [4, 3], [1, 4], [3, 4]], { marks: [{ x: 1, y: 1, type: "triangle" }] }),
          },
          {
            kind: "problem",
            text: L(
              "左上那颗孤立的黑子被打吃了。去救它也救不了你的两颗主力子。放弃它，把标记的两颗子轻快地走出来。",
              "Your lone black stone at the upper left is in atari. Running with it will not save your two main stones. Give it up and move the two marked stones out.",
              "왼쪽 위의 외톨이 흑돌이 단수입니다. 그 돌을 살리러 가도 주력인 두 점은 살릴 수 없습니다. 그 돌은 버리고 표시된 두 점을 가볍게 빠져나오게 하세요.",
              "左上の孤立した黒石はアタリです。それを助けに行っても、主力の二子は助かりません。捨てて、印の二子を軽く脱出させましょう。",
            ),
            problem: {
              goal: "save",
              corner: "tl",
              diagram: [
                ". . . . . . . .",
                "O X O O . . . .",
                ". O . x . . . .",
                ". O . x O . . .",
                ". O . O . . . .",
                ". . . . . . . .",
                ". . . . . . . .",
              ],
            },
            success: L("轻快地出头了：那颗子不值得救。", "Out and light: the lone stone was not worth saving.", "가볍게 빠져나왔습니다. 그 한 점은 살릴 가치가 없었습니다.", "軽く出られました。あの一子は助ける価値がありませんでした。"),
          },
          {
            kind: "problem",
            text: L(
              "在对方的地盘里，轻灵的下法常常就是快快做出一块小活棋。你的子在边上有一排三个眼位：下在中间，就有两只眼。",
              "Inside the opponent's area, light play often means a small, quick life. Your stones on the edge have three points of eye space in a row: take the middle one and you have two eyes.",
              "상대의 영역 안에서 가볍게 둔다는 것은 흔히 작게 빨리 사는 것입니다. 변의 흑돌에는 일렬로 세 칸의 궁도가 있습니다. 가운데에 두면 두 눈이 됩니다.",
              "相手の地の中で軽く打つとは、多くの場合、小さく早く生きることです。辺の黒石には一列に三つの眼形があります。真ん中に打てば二眼になります。",
            ),
            problem: {
              goal: "live",
              corner: "bl",
              diagram: [", , , , , , , ,", "O O O O O O O ,", "O X X x X X O ,", "O X . . . X O ,"],
            },
            success: L("两只眼，活了：在白棋的势力里安定下来。", "Two eyes and alive: a settled group in White's sphere.", "두 눈으로 살았습니다. 백의 세력 안에서 안정했습니다.", "二眼で生きました。白の勢力の中で安定しました。"),
          },
        ],
      },
    ],
  },
];
