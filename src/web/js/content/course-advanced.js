/**
 * The advanced course (v6): units for players around 5 kyu to 1 dan,
 * appended after the intermediate units of ./course-intermediate.js. Same
 * step schema (read / place / problem; see course.js).
 *
 * Standard of proof. Every tactical claim is a problem step proved by the
 * solver (scripts/check-course.mjs also runs the solver's validate() on
 * these units: a `ko: "ok"` step must really be a ko and a `goal: "seki"`
 * step a real seki). Strategic steps (place steps on a 19×19 board) state
 * principles, not engine judgements: they say "usually", give the reason,
 * and accept every point that the principle points to. A position where the
 * right move would need a strong engine to back it was left out, see the
 * "Advanced course" section of docs/problems-audit.md.
 *
 * v13 adds three units: opening frameworks and direction and joseki choice
 * (placed first, since they come earliest in a game) and handicap strategy
 * (last). Their opening and joseki steps follow lines of the opening book
 * (content/book.json): a joseki step is the book's corner tree move by move,
 * and scripts/tests/core-course-advanced.mjs checks every accepted point the
 * book knows against the book's KataGo evaluation (JOSEKI_LOSS). Lessons
 * cannot link into the explorer yet, so the text only points to it. Steps
 * the book does not cover wait for the KataGo lesson audit
 * (docs/lesson-audit.md, "v13 units waiting for a run").
 *
 * Every unit here carries `level: "advanced"`.
 */

const L = (zh, en, ko, ja) => ({ zh, en, ko, ja });
const BLACK = 1;
const WHITE = -1;

/* ----------------------------------------------------------------- helpers */

/** The whole 19×19 board with `black` and `white` stones ([x, y] lists). */
function full(black = [], white = [], extra = {}) {
  const g = Array.from({ length: 19 }, () => Array(19).fill("."));
  const put = (list, ch) => {
    for (const [x, y] of list) {
      if (g[y][x] !== ".") throw new Error(`two stones on ${x},${y}`);
      g[y][x] = ch;
    }
  };
  put(black, "X");
  put(white, "O");
  return { size: 19, corner: "tl", diagram: g.map((r) => r.join(" ")), ...extra };
}

/** Every point of a rectangle (inclusive), as accept points. */
function box(x0, y0, x1, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

const pts = (...list) => list.map(([x, y]) => ({ x, y }));
const labels = (...list) => list.map(([x, y, label]) => ({ x, y, type: "label", label }));

/** Mirror a diagram left to right, or top to bottom. */
const flipX = (rows) => rows.map((r) => r.split(" ").reverse().join(" "));
const flipY = (rows) => rows.slice().reverse();
/** Swap the colours of a diagram. */
const swap = (rows) => rows.map((r) => r.replace(/[XxOo]/g, (c) => ({ X: "O", x: "o", O: "X", o: "x" })[c]));

/* ---------------------------------------------------- whole-board boards */

// Four enclosed corners: Black on the left, White on the right. The top and
// bottom sides lie between a black and a white corner; the left side is
// between Black's two corners, the right side between White's.
const FOUR_BLACK = [[3, 3], [2, 5], [3, 15], [5, 16]];
const FOUR_WHITE = [[15, 3], [13, 2], [15, 15], [16, 13]];
const BOUNDARY = full(FOUR_BLACK, FOUR_WHITE);
const BOUNDARY_A = full(FOUR_BLACK, FOUR_WHITE, { marks: labels([9, 3, "A"]) });
const BOUNDARY_B = full(FOUR_BLACK, FOUR_WHITE, { marks: labels([9, 3, "A"], [3, 9, "B"]) });
// Black has taken the top; White to play.
const BOUNDARY_WHITE = full([...FOUR_BLACK, [9, 3]], FOUR_WHITE);
const TOP_MIDDLE = box(7, 2, 11, 3);
const BOTTOM_MIDDLE = box(7, 15, 11, 16);

// A black wall on the fourth line of the left side, White living low under
// it, a lone white stone on the top side and Black's upper right star point.
// v8: White's low group has C18 and B13 too; without them KataGo kills it
// (docs/lesson-audit.md), and "White has lived" would not be true.
const WALL_BLACK = [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [2, 6], [15, 3], [15, 15]];
const WALL_WHITE = [[2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [1, 6], [9, 2], [3, 15]];
const TOWARD_WALL = full(WALL_BLACK, WALL_WHITE);
const TOWARD_WALL_MARKED = full(WALL_BLACK, WALL_WHITE, { marks: labels([12, 3, "A"], [6, 2, "B"]) });

// White's wall on the bottom side facing the centre, Black living low under it.
const AWAY_BLACK = [[2, 16], [3, 16], [4, 16], [5, 16], [6, 16], [7, 17], [15, 3], [15, 15]];
const AWAY_WHITE = [[2, 15], [3, 15], [4, 15], [5, 15], [6, 15], [7, 16], [8, 16], [3, 3]];
const AWAY = full(AWAY_BLACK, AWAY_WHITE);
const AWAY_MARKED = full(AWAY_BLACK, AWAY_WHITE, { marks: labels([15, 9, "A"], [10, 16, "B"]) });

// The capture next to a wall (problem diagram, top-left corner).
const WALL_CAPTURE = [". . . . . . . . .", ". . . . . . . . .", ". . . X X . . . .", ". . . X o . . . .", ". . . X . . . . .", ". . . X . . . . .", ". . . . . . . . .", ". . . . . . . . ."];

/* ------------------------------------------------------ invasion boards */

// White's upper right: a 3-4 point enclosure and a wide extension down the right side.
const INVADE_SIDE = full([[3, 3], [3, 15], [15, 15]], [[16, 3], [14, 2], [16, 10]]);
const INVADE_SIDE_MARKED = full([[3, 3], [3, 15], [15, 15]], [[16, 3], [14, 2], [16, 10]], { marks: labels([16, 7, "A"]) });
// The same idea on the bottom: White's 3-4 point and a wide extension.
const INVADE_BOTTOM = full([[3, 3], [15, 3], [15, 15], [16, 13]], [[3, 15], [5, 16], [11, 16]]);
// A lone white star point in the upper right.
const LONE_STAR = full([[3, 3], [3, 15], [15, 15], [9, 3]], [[15, 3], [16, 9], [3, 9]]);
// A white third-line stone on the top side, and a fourth-line one.
const SHOULDER_THIRD = full([[3, 3], [15, 3], [3, 15], [15, 15]], [[9, 2], [13, 16]]);
const SHOULDER_FOURTH = full([[3, 3], [3, 15], [16, 9]], [[15, 3], [15, 15], [9, 3], [13, 2]]);
const SHOULDER_MARKED = full([[3, 3], [15, 3], [3, 15], [15, 15]], [[9, 2], [13, 16]], { marks: labels([8, 3, "A"], [10, 3, "B"]) });

/* ------------------------------------------------------ middle game boards */

// A white stone has split the left side between Black's two enclosures.
const SPLIT_LEFT = full([[3, 3], [5, 2], [3, 15], [5, 16], [15, 15]], [[2, 9], [15, 3], [16, 13]]);
const SPLIT_LEFT_MARKED = full([[3, 3], [5, 2], [3, 15], [5, 16], [15, 15]], [[2, 9], [15, 3], [16, 13]], { marks: labels([2, 11, "A"], [2, 7, "B"]) });
// The same on the top side.
const SPLIT_TOP = full([[3, 3], [2, 5], [15, 3], [16, 5], [3, 15]], [[9, 2], [15, 15], [13, 16]]);

/* ------------------------------------------------------- life and death */

// The corner group of five stones with five points of eye space (four along
// the top, one down the side), and the same group with one more point down
// the side. Dead / ko / alive, proved by the solver.
const CORNER_FIVE = [". . . . X , ,", ". o o o X , ,", "o o X X X , ,", "X X X , , , ,", ", , , , , , ,"];
const CORNER_SIX = [". . . . X , ,", ". o o o X , ,", ". o X X X , ,", "o o X , , , ,", "X X X , , , ,", ", , , , , , ,"];
// The other way round: three points along the top, two (then three) down the side.
const CORNER_OTHER = [". . . o X , ,", ". o o o X , ,", ". o X X X , ,", "X X X , , , ,", ", , , , , , ,"];
const CORNER_OTHER_LONG = [". . . o X , ,", ". o o o X , ,", ". o X X X , ,", ". o X , , , ,", "X X X , , , ,", ", , , , , , ,"];

/* ------------------------------------------------- v13: opening boards */

// Board coordinates below are [x, y] from the top left: Q16 = [15, 3],
// D4 = [3, 15]. The whole-board openings follow the named lines of the
// opening book (content/book.json, tree "whole"); its KataGo evaluations put
// every accepted point within a point of the book's best move. The Chinese
// opening is the exception: it is taught as the named opening it is, and its
// side stone is not among the book's searched moves (the book has the position
// before it; scripts/tests/core-course-advanced.mjs names the steps).

// The Chinese opening: the star point Q16, the 3-4 point Q3 (third line from the bottom) and the side
// stone one line below the middle of the right side (low at R9, high at Q9).
const CH_B = [[15, 3], [15, 16]];
const CH_W = [[3, 15], [3, 3]];
const CH_BASE = full(CH_B, CH_W);
const CH = full([...CH_B, [16, 10]], CH_W);
const CH_READ = full([...CH_B, [16, 10]], CH_W, { marks: labels([15, 3, "1"], [3, 15, "2"], [15, 16, "3"], [3, 3, "4"], [16, 10, "5"], [15, 10, "A"]) });
// The same opening along the bottom side (the one above, mirrored on the diagonal): D4, R4, and L3 or L4.
const CH_BOTTOM = full([[3, 15], [16, 15]], [[15, 3], [3, 3]]);

// Sanrensei: three star points along the right side.
const SAN_B = [[15, 3], [15, 15]];
const SAN_W = [[3, 15], [3, 3]];
const SAN_BASE = full(SAN_B, SAN_W);
const SAN = full([...SAN_B, [15, 9]], SAN_W);
const SAN_READ = full([...SAN_B, [15, 9]], SAN_W, { marks: labels([15, 3, "1"], [3, 15, "2"], [15, 15, "3"], [3, 3, "4"], [15, 9, "5"]) });
const SAN_33 = full([...SAN_B, [15, 9]], [...SAN_W, [16, 16]]);

// Direction of play: two black star points on the right, two white ones on the left.
const DIR_READ = full(SAN_B, SAN_W, { marks: labels([5, 2, "A"], [2, 5, "B"]) });

// Urgent before big: a small black group in the lower left corner (the
// corner five-point shape of the life-and-death unit, seen from Black's
// side) lives or dies by one move at the 1-1 point; the lower right corner
// is still empty.
const URG_GROUP_B = [[0, 16], [1, 16], [1, 17], [2, 17], [3, 17]];
const URG_GROUP_W = [[0, 15], [1, 15], [2, 15], [2, 16], [3, 16], [4, 16], [4, 17], [4, 18]];
const URG_B = [[15, 3], [13, 2], [16, 9], ...URG_GROUP_B];
const URG_W = [[3, 3], [5, 2], [3, 9], ...URG_GROUP_W];
const URGENT = full(URG_B, URG_W);
const URGENT_READ = full(URG_B, URG_W, { marks: labels([0, 18, "A"], [15, 15, "B"]) });
const URGENT_DONE = full([...URG_B, [0, 18]], [...URG_W, [9, 2]]);
// The corner group alone, for the solver (lower left, 7×5).
const URG_CORNER = flipY(swap(CORNER_FIVE));

/* -------------------------------------------------- v13: joseki boards */

/**
 * An 11×10 window in the upper right corner (the corner the opening book's
 * joseki tree uses), with stones given in board coordinates. `moves` are
 * [x, y, colour]; the first `n` are played, numbered from 1 if `numbers`.
 */
const UR_W = 11;
const UR_H = 10;
const UR_X0 = 19 - UR_W;
function ur(black, white, moves = [], n = 0, { numbers = false } = {}) {
  const g = Array.from({ length: UR_H }, () => Array(UR_W).fill("."));
  const put = (x, y, ch) => {
    const lx = x - UR_X0;
    if (lx < 0 || y < 0 || lx >= UR_W || y >= UR_H) throw new Error(`stone ${x},${y} outside the upper right window`);
    if (g[y][lx] !== ".") throw new Error(`two stones on ${x},${y}`);
    g[y][lx] = ch;
  };
  for (const [x, y] of black) put(x, y, "X");
  for (const [x, y] of white) put(x, y, "O");
  const played = moves.slice(0, n);
  for (const [x, y, c] of played) put(x, y, c === BLACK ? "X" : "O");
  const out = { size: 19, corner: "tr", diagram: g.map((r) => r.join(" ")) };
  if (numbers) out.marks = played.map(([x, y], i) => ({ x: x - UR_X0, y, type: "label", label: String(i + 1) }));
  return out;
}
/** Accept points in the upper right window, from board coordinates. */
const urPts = (...list) => list.map(([x, y]) => ({ x: x - UR_X0, y }));

// Star point, small knight's approach, one-space low pincer, 3-3 invasion,
// block on the approach stone's side, White's push along the top (book:
// star-one-space-low-pincer, then KataGo's first choice at every move).
const J_STAR = [[15, 3]];
const J_LOW_PINCER = [
  [16, 5, WHITE],
  [16, 7, BLACK],
  [16, 2, WHITE],
  [16, 3, BLACK],
  [15, 2, WHITE],
];
// The two-space low pincer and the same 3-3 invasion, one step further:
// Black's solid extension, White's second-line hane, Black's block (book:
// star-two-space-low-pincer and its main line).
const J_TWO_PINCER = [
  [16, 5, WHITE],
  [16, 8, BLACK],
  [16, 2, WHITE],
  [16, 3, BLACK],
  [15, 2, WHITE],
  [14, 3, BLACK],
  [17, 3, WHITE],
  [17, 4, BLACK],
];
// 3-4 point, one-space high approach, attachment underneath (book:
// komoku-high-approach-attach): hane, draw back, connect, Black settles
// down the side, White extends three from its two stones.
const J_KOMOKU = [[16, 3]];
const J_HIGH = [
  [14, 3, WHITE],
  [14, 2, BLACK],
  [13, 2, WHITE],
  [15, 2, BLACK],
  [13, 3, WHITE],
  [16, 5, BLACK],
  [9, 2, WHITE],
];
// 3-4 point, small knight's approach, Black's small knight's move down the
// right side, White's two-space extension (book: komoku-low-approach).
const J_LOW = [
  [14, 2, WHITE],
  [15, 5, BLACK],
  [11, 2, WHITE],
];

// Choosing by the surroundings. (1) The Chinese opening, and White has
// invaded at the 3-3 point of Black's star point. (2) White has approached
// Black's upper right star point from the side facing Black's lower right
// corner.
const CHOOSE_33 = full([...CH_B, [16, 10]], [...CH_W, [16, 2]]);
const CHOOSE_PINCER = full(SAN_B, [...SAN_W, [16, 5]]);
const CHOOSE_READ = full(SAN_B, [...SAN_W, [16, 5]], { marks: labels([16, 8, "A"], [13, 2, "B"]) });

/* ------------------------------------------------ v13: handicap boards */

// Four and nine handicap stones (the app's handicap placement: star points).
const H4 = [[3, 3], [15, 3], [3, 15], [15, 15]];
const H9 = [...H4, [9, 3], [3, 9], [15, 9], [9, 15], [9, 9]];
const H4_APPROACH = full(H4, [[16, 5]]);
const H4_APPROACH_READ = full(H4, [[16, 5]], { marks: labels([16, 8, "A"], [13, 2, "B"]) });
const H9_33 = full(H9, [[16, 2]]);
// The 3-3 joseki under way: Black blocked on the top, White crawled.
const H9_33_CRAWL = full([...H9, [15, 2]], [[16, 2], [16, 3]]);
// Black hane, White hane, Black block, White connect: Black's last move is left.
const H9_33_END = full([...H9, [15, 2], [16, 4], [17, 5]], [[16, 2], [16, 3], [17, 4], [17, 3]]);
// Four stones: White approached, Black pincered, White invaded at the 3-3 point.
const H4_PINCER = full([...H4, [16, 8]], [[16, 5]]);
const H4_PINCER_33 = full([...H4, [16, 8]], [[16, 5], [16, 2]]);
const H9_EMPTY = full(H9, []);
const H9_EMPTY_READ = full(H9, [], { marks: labels([16, 2, "A"], [16, 5, "B"]) });

/* ---------------------------------------------------------------- units */

export const ADVANCED = [
  /* ================================================ v13 UNIT: opening */
  {
    id: "adv-opening",
    level: "advanced",
    title: L("布局的构思与方向", "Opening frameworks and direction", "포석의 구상과 방향", "布石の構想と方向"),
    summary: L(
      "中国流和三连星、模样与实地、挂角的方向，以及急所先于大场。",
      "The Chinese opening and sanrensei, framework against territory, which side to approach from, and urgent points before big points.",
      "중국류와 삼연성, 모양과 실리, 걸침의 방향, 그리고 큰 곳보다 급한 곳.",
      "中国流と三連星、模様と実利、カカリの方向、そして大場より急場。",
    ),
    lessons: [
      {
        id: "adv-open-chinese",
        title: L("中国流", "The Chinese opening", "중국류", "中国流"),
        steps: [
          {
            kind: "read",
            text: L(
              "黑1右上星位，黑3右下小目（离下边三路），黑5下在右边第三线、比正中低一路：这就是中国流。三颗子沿着右边展开，速度快，又以右边为中心形成模样。黑5下在A（第四线）叫高中国流，更重视中腹；下在三线则更坚实。",
              "Black 1 on the upper right star point, Black 3 on the lower right 3-4 point (third line from the bottom), and Black 5 on the third line of the right side, one line below the middle: this is the Chinese opening. The three stones develop quickly along the right side and form a framework (moyo) around it. Black 5 at A, on the fourth line, is the high Chinese opening: more toward the centre, less solid.",
              "흑 1은 오른쪽 위 화점, 흑 3은 오른쪽 아래 소목(아래 변에서 3선), 흑 5는 오른쪽 변 3선에서 한가운데보다 한 줄 아래: 이것이 중국류입니다. 세 돌이 오른쪽 변을 따라 빠르게 전개되고, 오른쪽을 중심으로 모양을 이룹니다. 흑 5를 4선의 A에 두면 고중국류로 중앙을 더 중시하고, 3선은 더 튼튼합니다.",
              "黒1は右上の星、黒3は右下の小目（下辺から三線）、黒5は右辺の三線で中央より一路下。これが中国流です。三つの石が右辺に沿って速く展開し、右辺を中心に模様を作ります。黒5を四線のAに打つと高中国流で、中央をより重視します。三線の方が堅実です。",
            ),
            board: CH_READ,
          },
          {
            kind: "place",
            text: L(
              "黑先。完成中国流：在右边下出那颗关键的子（三线或四线都可以）。",
              "Black to play. Complete the Chinese opening: play the key stone on the right side (third or fourth line).",
              "흑 차례. 중국류를 완성하세요. 오른쪽 변에 핵심이 되는 한 수를 둡니다(3선이든 4선이든 좋습니다).",
              "黒番です。中国流を完成させましょう。右辺に要の一手を打ちます（三線でも四線でも構いません）。",
            ),
            board: CH_BASE,
            toMove: BLACK,
            accept: pts([16, 10], [15, 10]),
            success: L(
              "右边正中偏下一路，靠近小目的一侧：中国流成形了。",
              "One line below the middle of the right side, on the 3-4 point's side: the Chinese opening is complete.",
              "오른쪽 변 한가운데에서 한 줄 아래, 소목에 가까운 쪽입니다. 중국류가 완성되었습니다.",
              "右辺の中央より一路下、小目寄りの点です。中国流の完成です。",
            ),
            wrong: L(
              "边上那颗子下在右边正中偏下一路，第三线或第四线，离小目近一些。",
              "The side stone goes one line below the middle of the right side, on the third or fourth line: a little nearer the 3-4 point.",
              "변의 한 수는 오른쪽 변 한가운데에서 한 줄 아래, 3선이나 4선에 둡니다. 소목 쪽에 조금 더 가깝습니다.",
              "辺の一手は右辺の中央より一路下、三線か四線です。小目に少し近い側です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "同样的布局，这次沿着下边展开。黑先，下出中国流的那颗子。",
              "The same opening, this time along the bottom side. Black to play: add the Chinese opening's side stone.",
              "같은 포석을 이번에는 아래쪽 변에서. 흑 차례, 중국류의 변 한 수를 두세요.",
              "同じ布石を今度は下辺で。黒番です。中国流の辺の一手を打ちましょう。",
            ),
            board: CH_BOTTOM,
            toMove: BLACK,
            accept: pts([10, 16], [10, 15]),
            success: L(
              "方向不同，构思一样：星位、小目，和两者之间偏向小目一路的一子。",
              "A different side, the same idea: the star point, the 3-4 point and the stone between them, one line nearer the 3-4 point.",
              "방향은 달라도 구상은 같습니다. 화점, 소목, 그리고 그 사이에서 소목 쪽으로 한 줄 치우친 한 수입니다.",
              "向きは違っても構想は同じです。星、小目、そしてその間で一路小目寄りの一手です。",
            ),
            wrong: L(
              "在下边找比正中靠近小目一路的点，第三线或第四线。",
              "Find the point on the bottom side one line nearer the 3-4 point than the middle, on the third or fourth line.",
              "아래쪽 변에서 한가운데보다 소목 쪽으로 한 줄 가까운 점을 3선이나 4선에서 찾으세요.",
              "下辺で、中央より一路小目寄りの点を三線か四線で探しましょう。",
            ),
          },
          {
            kind: "read",
            text: L(
              "小林流和迷你中国流也是“小目加边上低位一子”的构思，只是手顺变化多。",
              "The Kobayashi opening and the mini-Chinese are built on the same idea, a 3-4 point with a low stone on the side, but their move orders vary.",
              "고바야시류와 미니 중국류도 ‘소목과 변의 낮은 한 수’라는 같은 구상이지만 수순은 여러 가지입니다.",
              "小林流やミニ中国流も「小目と辺の低い一手」という同じ構想ですが、手順はいろいろです。",
            ),
            board: CH,
          },
        ],
      },
      {
        id: "adv-open-sanrensei",
        title: L("三连星：模样与实地", "Sanrensei: framework against territory", "삼연성: 모양과 실리", "三連星：模様と実利"),
        steps: [
          {
            kind: "read",
            text: L(
              "黑1、3、5三颗子都在第四线的星位上：三连星。它不急于守角，而是在右边和中腹形成大模样。模样不是实地：它只是“将来可能成为实地”的地方。对付模样，白棋通常先在角上拿实地（点三三），以后再侵消或打入；黑棋则要把外面的厚势变成实地，或者用它攻击。",
              "Black 1, 3 and 5 all stand on star points of the fourth line: sanrensei. It does not hurry to secure corners but builds a large framework (moyo) on the right side and toward the centre. A framework is not territory yet, only an area that may become it. White usually answers with a 3-3 invasion for corner territory, reducing or invading later. Black then turns the outside strength into territory, or attacks with it.",
              "흑 1, 3, 5가 모두 4선의 화점에 놓였습니다. 삼연성입니다. 귀를 서둘러 지키지 않고 오른쪽 변과 중앙에 큰 모양을 만듭니다. 모양은 집이 아니라 ‘나중에 집이 될 수도 있는 곳’일 뿐입니다. 모양에 맞서 백은 보통 먼저 삼삼에 들어가 귀의 실리를 차지하고, 삭감이나 침입은 나중에 합니다. 흑은 바깥의 세력을 집으로 바꾸거나 그것으로 공격해야 합니다.",
              "黒1、3、5がすべて四線の星に打たれています。三連星です。隅を急いで守らず、右辺から中央へ大きな模様を作ります。模様は地ではなく、「後で地になるかもしれない所」にすぎません。模様に対して白はふつう先に三々に入って隅の実利を取り、消しや打ち込みは後にします。黒は外の勢力を地に変えるか、それで攻めなければなりません。",
            ),
            board: SAN_READ,
          },
          {
            kind: "place",
            text: L(
              "黑先。下出三连星。",
              "Black to play. Make sanrensei.",
              "흑 차례. 삼연성을 만드세요.",
              "黒番です。三連星にしましょう。",
            ),
            board: SAN_BASE,
            toMove: BLACK,
            accept: pts([15, 9]),
            success: L(
              "右边的星位：三颗子连成一线。",
              "The star point of the right side: three stones in a line.",
              "오른쪽 변의 화점입니다. 세 돌이 한 줄로 늘어섰습니다.",
              "右辺の星です。三つの石が一列に並びました。",
            ),
            wrong: L(
              "三连星的第三颗子下在右边正中间的星位上。",
              "Sanrensei's third stone goes on the star point in the middle of the right side.",
              "삼연성의 세 번째 돌은 오른쪽 변 한가운데의 화점에 둡니다.",
              "三連星の三つ目の石は右辺の真ん中の星に打ちます。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。黑棋的模样还没有变成实地。先在模样的一个角里拿实地：点三三。",
              "You are White. Black's framework is not territory yet. Take territory in one of its corners first: invade at a 3-3 point.",
              "백입니다. 흑의 모양은 아직 집이 아닙니다. 먼저 모양의 귀 하나에서 실리를 차지하세요. 삼삼 침입입니다.",
              "白番です。黒の模様はまだ地ではありません。まず模様の隅の一つで実利を取りましょう。三々入りです。",
            ),
            board: SAN,
            toMove: WHITE,
            accept: pts([16, 16], [16, 2]),
            success: L(
              "点三三：白棋在角上活一块，拿到实地，而黑棋的厚势会对着已经有黑子的右边。",
              "The 3-3 invasion: White lives in the corner with territory, and Black's new thickness will face the right side, where Black already has a stone.",
              "삼삼 침입입니다. 백은 귀에서 살며 실리를 얻고, 흑의 두터움은 이미 흑돌이 있는 오른쪽 변을 향하게 됩니다.",
              "三々入りです。白は隅で生きて実利を得、黒の厚みはすでに黒石のある右辺に向くことになります。",
            ),
            wrong: L(
              "点在右上或右下黑棋星位斜里面的三三。",
              "Play the 3-3 point diagonally inside Black's upper right or lower right star point.",
              "흑의 오른쪽 위나 오른쪽 아래 화점에서 대각선 안쪽의 삼삼에 두세요.",
              "黒の右上か右下の星の斜め内側、三々に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋点了右下的三三。黑先：从哪一边挡？挡在靠模样的一侧，让白棋往下边、往它自己的子那边做活。",
              "White has invaded the lower right 3-3 point. Black to play: which side do you block? Block on the framework's side, so that White lives along the bottom, toward its own stones.",
              "백이 오른쪽 아래 삼삼에 들어왔습니다. 흑 차례: 어느 쪽에서 막을까요? 모양 쪽에서 막아, 백이 아래쪽 변, 백 자신의 돌 쪽에서 살게 하세요.",
              "白が右下の三々に入りました。黒番です。どちらからオサエますか。模様の側からオサエて、白を下辺、白自身の石の方で生きさせましょう。",
            ),
            board: SAN_33,
            toMove: BLACK,
            accept: pts([16, 15]),
            success: L(
              "从右边挡住，右边的模样保住了；黑棋的厚势朝向中腹。",
              "Blocked on the right: the framework on the right side stays whole, and Black's thickness faces the centre.",
              "오른쪽에서 막아 오른쪽 변의 모양을 지켰고, 흑의 두터움은 중앙을 향합니다.",
              "右からオサエて右辺の模様を守り、黒の厚みは中央を向きます。",
            ),
            wrong: L(
              "挡在白子上方，也就是靠右边模样的那一侧，紧挨白子。",
              "Block right above the white stone, on the side of the right-side framework, touching it.",
              "백돌 바로 위, 곧 오른쪽 변 모양 쪽에 붙여 막으세요.",
              "白石のすぐ上、つまり右辺の模様の側にくっつけてオサエましょう。",
            ),
          },
        ],
      },
      {
        id: "adv-open-direction",
        title: L("挂角的方向", "Which side to approach from", "걸침의 방향", "カカリの方向"),
        steps: [
          {
            kind: "read",
            text: L(
              "黑棋要挂左上白棋的星位。从上边A挂，挂角子靠近右上的黑子：白棋若从上边夹击，夹击的子就离黑棋很近，不会有力；黑棋要拆，也能和右上配合。从左边B挂，白棋的夹击会和左下的白子配合，黑棋处境就难了。一般来说，挂角要从对自己有利的一侧，也就是靠自己棋子的一侧。",
              "Black wants to approach White's upper left star point. From the top (A) the approach stands near Black's upper right stone: a white pincer there would be close to Black's stones and weak, and a black extension works with the upper right corner. From the left (B) it invites a pincer that works with White's lower left stone, and Black has a harder time. As a rule, approach from the side that works with your own stones.",
              "흑이 왼쪽 위 백 화점에 걸치려 합니다. 위쪽(A)에서 걸치면 걸친 돌이 오른쪽 위 흑돌과 가깝습니다. 백이 위쪽에서 협공해도 협공한 돌이 흑돌 가까이 있어 힘이 없고, 흑이 벌리면 오른쪽 위 귀와도 호응합니다. 왼쪽(B)에서 걸치면 백의 협공이 왼쪽 아래 백돌과 호응해 흑이 고생합니다. 대체로 걸침은 내 돌과 호응하는 쪽에서 합니다.",
              "黒が左上の白の星にカカろうとしています。上辺（A）からカカれば、カカリの石は右上の黒石に近く、白が上辺からハサんでもその石は黒の近くで弱く、黒が開けば右上の隅とも連携します。左辺（B）からカカると、白のハサミが左下の白石と連携し、黒は苦労します。一般に、カカリは自分の石と連携する側から打ちます。",
            ),
            board: DIR_READ,
          },
          {
            kind: "place",
            text: L(
              "黑先。从能和右上黑子配合的那一侧挂左上的白角。",
              "Black to play. Approach White's upper left corner from the side that works with your upper right stone.",
              "흑 차례. 오른쪽 위 흑돌과 호응하는 쪽에서 왼쪽 위 백 귀에 걸치세요.",
              "黒番です。右上の黒石と連携する側から、左上の白の隅にカカりましょう。",
            ),
            board: SAN_BASE,
            toMove: BLACK,
            accept: pts([5, 2], [5, 3]),
            success: L(
              "从上边挂：白棋在上边夹击会碰到右上的黑子，上边是黑棋的方向。",
              "The approach from the top: a white pincer on the top side would run into your upper right stone, so the top is Black's direction.",
              "위쪽에서 걸쳤습니다. 백이 위쪽에서 협공하면 오른쪽 위 흑돌에 부딪히므로, 위쪽이 흑의 방향입니다.",
              "上辺からのカカリです。白が上辺からハサむと右上の黒石にぶつかるので、上辺が黒の方向です。",
            ),
            wrong: L(
              "在上边挂：小飞挂（第三线）或一间高挂（第四线），离白子横向两路。",
              "Approach on the top side: a small knight's approach (third line) or a one-space high approach (fourth line), two lines to the right of the white stone.",
              "위쪽 변에서 걸치세요. 백돌에서 오른쪽으로 두 줄, 날일자 걸침(3선)이나 한 칸 높은 걸침(4선)입니다.",
              "上辺でカカりましょう。白石から右へ二路、小ゲイマガカリ（三線）か一間高ガカリ（四線）です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋下成了中国流。你执白，挂右下的小目：别从右边挂进黑棋两子之间，从下边挂。",
              "Black has the Chinese opening. You are White: approach the lower right 3-4 point. Do not approach from the right side, between Black's stones; approach from the bottom.",
              "흑이 중국류를 두었습니다. 백입니다. 오른쪽 아래 소목에 걸치세요. 오른쪽 변에서 흑 두 돌 사이로 걸치지 말고 아래쪽에서 걸칩니다.",
              "黒が中国流を打ちました。白番です。右下の小目にカカりましょう。右辺から黒二子の間にカカらず、下辺からカカります。",
            ),
            board: CH,
            toMove: WHITE,
            accept: pts([13, 16], [13, 15]),
            success: L(
              "从下边挂，挂角子背后宽阔，不会被夹在黑棋的子之间。",
              "From the bottom: the approaching stone has open space behind it and is not caught between Black's stones.",
              "아래쪽에서 걸쳐, 걸친 돌 뒤가 넓고 흑돌 사이에 끼이지 않습니다.",
              "下辺からのカカリで、カカリの石の背後は広く、黒石の間に挟まれません。",
            ),
            wrong: L(
              "在小目左边的下边挂：和小目隔一路，第三线或第四线。",
              "Approach on the bottom side, to the left of the 3-4 stone: leave one empty point between them, on the third or fourth line.",
              "소목 왼쪽, 아래쪽 변에서 걸치세요. 소목과 한 칸 띄워 3선이나 4선입니다.",
              "小目の左、下辺でカカりましょう。小目から一路あけて、三線か四線です。",
            ),
          },
        ],
      },
      {
        id: "adv-open-urgent",
        title: L("急所先于大场", "Urgent points before big points", "큰 곳보다 급한 곳", "大場より急場"),
        steps: [
          {
            kind: "read",
            text: L(
              "右下的空角（B）是大场。但左下角里的黑棋还没有活：A这一手决定它的死活。大场值的是目数，急所关系到棋子的死活或者能不能被切断。下棋之前先问一句：有没有哪块棋还不安全？如果有，先补那里。",
              "The empty lower right corner (B) is a big point. But Black's small group in the lower left corner is not alive yet: A decides whether it lives or dies. Big points are worth points; urgent points decide whether stones live, die or get cut off. Before you take a big point, ask: is anything still unsafe? If so, play there first.",
              "오른쪽 아래의 빈 귀(B)는 큰 곳입니다. 하지만 왼쪽 아래 귀의 흑 돌은 아직 살지 못했습니다. A가 그 사활을 결정합니다. 큰 곳은 집의 크기이고, 급한 곳은 돌의 삶과 죽음, 또는 끊기느냐 아니냐가 걸린 곳입니다. 큰 곳을 두기 전에 아직 불안한 돌이 없는지 물어보세요. 있다면 그곳부터 둡니다.",
              "右下の空き隅（B）は大場です。しかし左下の隅の黒はまだ生きていません。Aがその死活を決めます。大場は地の大きさ、急場は石の生き死にや切断がかかった所です。大場を打つ前に、まだ不安な石がないか考えましょう。あればそこが先です。",
            ),
            board: URGENT_READ,
          },
          {
            kind: "place",
            text: L(
              "黑先。先补急所，让左下角的黑棋活。",
              "Black to play. Play the urgent point first and make the lower left group live.",
              "흑 차례. 급한 곳부터 두어 왼쪽 아래 흑 돌을 살리세요.",
              "黒番です。まず急場に打って、左下の黒を生きましょう。",
            ),
            board: URGENT,
            toMove: BLACK,
            accept: pts([0, 18]),
            success: L(
              "角上这一手看起来很小，却做出了两只眼：这一手比任何大场都大。",
              "The corner point looks tiny, but it makes two eyes: it is bigger than any big point.",
              "귀의 이 한 수는 작아 보이지만 두 눈을 만듭니다. 어떤 큰 곳보다도 큽니다.",
              "隅のこの一手は小さく見えますが、二眼ができます。どんな大場よりも大きな手です。",
            ),
            wrong: L(
              "左下角的黑棋只有一只眼的空间吗？下在角上的一一路，把眼位分成两只眼。",
              "Look at the lower left group's eye space: play on the 1-1 point in the corner and divide it into two eyes.",
              "왼쪽 아래 흑의 궁도를 보세요. 귀의 1·1에 두어 두 눈으로 나눕니다.",
              "左下の黒の眼形を見ましょう。隅の一の一に打って二眼に分けます。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "如果黑棋去占大场，会怎样？你执白：杀掉左下角的黑棋。",
              "What if Black takes the big point instead? You are White: kill the lower left group.",
              "흑이 큰 곳을 두면 어떻게 될까요? 백으로 왼쪽 아래 흑 돌을 잡으세요.",
              "黒が大場に回ったらどうなるでしょう。白番で、左下の黒を殺しましょう。",
            ),
            problem: { goal: "kill", corner: "bl", diagram: URG_CORNER },
            success: L(
              "黑棋只剩一只眼。一块棋死掉，比一个空角的损失大得多。",
              "Black is left with one eye. A dead group costs far more than an empty corner is worth.",
              "흑은 한 눈뿐입니다. 한 덩어리가 죽는 손해는 빈 귀 하나보다 훨씬 큽니다.",
              "黒は一眼しかありません。石が死ぬ損は、空き隅一つよりはるかに大きいのです。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋已经活了，白棋在上边拆了一手。现在没有不安全的棋：黑先，占大场。",
              "Black has lived, and White has extended on the top side. Now nothing is unsafe. Black to play: take the big point.",
              "흑은 이미 살았고, 백은 위쪽 변에 벌렸습니다. 이제 불안한 돌이 없습니다. 흑 차례, 큰 곳을 차지하세요.",
              "黒はもう生き、白は上辺に開きました。今は不安な石がありません。黒番です。大場を占めましょう。",
            ),
            board: URGENT_DONE,
            toMove: BLACK,
            accept: pts([15, 15], [16, 15], [15, 16], [16, 16]),
            success: L(
              "急所补好之后，最大的就是空角。",
              "Once the urgent point is settled, the empty corner is the biggest move.",
              "급한 곳을 해결한 뒤에는 빈 귀가 가장 큽니다.",
              "急場を打った後は、空き隅がいちばん大きいのです。",
            ),
            wrong: L(
              "还剩一个空着的角：右下。下在星位、小目或三三。",
              "One corner is still empty: the lower right. Play on its star point, a 3-4 point or the 3-3 point.",
              "아직 빈 귀가 하나 있습니다. 오른쪽 아래입니다. 화점, 소목이나 삼삼에 두세요.",
              "まだ空いている隅が一つあります。右下です。星、小目か三々に打ちましょう。",
            ),
          },
        ],
      },
    ],
  },

  /* ================================================= v13 UNIT: joseki */
  {
    id: "adv-joseki",
    level: "advanced",
    title: L("定式的选择", "Choosing joseki", "정석의 선택", "定石の選択"),
    summary: L(
      "星位的一间低夹和二间低夹、小目的一间高挂和小飞挂，以及根据周围的棋子选择定式。",
      "The one-space and two-space low pincers at the star point, the high and the knight's approach at the 3-4 point, and choosing a joseki by the stones around it.",
      "화점의 한 칸·두 칸 낮은 협공, 소목의 한 칸 높은 걸침과 날일자 걸침, 그리고 주위의 돌을 보고 정석 고르기.",
      "星の一間挟みと二間挟み、小目の一間高ガカリと小ゲイマガカリ、そして周りの石を見て定石を選ぶ。",
    ),
    lessons: [
      {
        id: "adv-joseki-low-pincer",
        title: L("一间低夹与点三三", "The one-space low pincer and the 3-3 invasion", "한 칸 낮은 협공과 삼삼 침입", "一間挟みと三々入り"),
        steps: [
          {
            kind: "read",
            text: L(
              "白1小飞挂，黑2一间低夹。现代最常见的应法是白3点三三：角上的实地比被夹的挂角子更重要。黑4从挂角子一侧挡，把三三和白1分开，白1就被夹在黑棋两子之间。接着白棋沿上边做活，黑棋得到外势，白1以后成为黑棋的攻击目标。这一型可以在定式图谱的角部里继续研究。",
              "White 1 is a small knight's approach and Black 2 the one-space low pincer. Today White 3, the 3-3 invasion, is the most common answer: the corner matters more than the pincered stone. Black 4 blocks on the approach stone's side and cuts the 3-3 stone off from White 1. White lives along the top, Black gets outside strength, and White 1 becomes a target. The opening explorer's corner tree shows more of this line.",
              "백 1 날일자 걸침에 흑 2 한 칸 낮은 협공. 요즘 가장 흔한 응수는 백 3 삼삼 침입입니다. 협공당한 돌보다 귀의 실리가 더 중요하기 때문입니다. 흑 4는 걸친 돌 쪽에서 막아 삼삼과 백 1을 갈라놓고, 백 1은 흑돌 사이에 남습니다. 이어서 백은 위쪽 변에서 살고 흑은 바깥의 세력을 얻으며, 백 1은 공격 목표가 됩니다. 이 진행은 포석·정석 탐색의 귀 정석에서 더 살펴볼 수 있습니다.",
              "白1の小ゲイマガカリに黒2の一間挟み。現代で最も多いのは白3の三々入りです。挟まれた石より隅の実利が大事だからです。黒4はカカリの石の側からオサエて三々と白1を分断し、白1は黒石の間に取り残されます。続いて白は上辺で生き、黒は外の勢力を得て、白1は攻めの目標になります。この進行は布石・定石エクスプローラーの隅の定石でさらに調べられます。",
            ),
            board: ur(J_STAR, [], J_LOW_PINCER, 4, { numbers: true }),
          },
          {
            kind: "place",
            text: L(
              "白棋小飞挂了你的星位。一间低夹：在右边第三线，和白子之间空一路。",
              "White has approached your star point with a small knight's move. Play the one-space low pincer: on the third line of the right side, one empty point beyond the white stone.",
              "백이 화점에 날일자로 걸쳤습니다. 한 칸 낮은 협공을 두세요. 오른쪽 변 3선에서 백돌과 한 칸을 띄웁니다.",
              "白が星に小ゲイマでカカりました。一間挟みを打ちましょう。右辺の三線で、白石から一路あけます。",
            ),
            board: ur(J_STAR, [], J_LOW_PINCER, 1),
            toMove: BLACK,
            accept: urPts([16, 7]),
            success: L(
              "一间低夹：白子失去了往右边拆的余地。",
              "The one-space low pincer: the white stone has lost its room to extend down the right side.",
              "한 칸 낮은 협공입니다. 백돌은 오른쪽 변으로 벌릴 여지를 잃었습니다.",
              "一間挟みです。白石は右辺に開く余地を失いました。",
            ),
            wrong: L(
              "沿着第三线从白子往下，隔一个空点下子。",
              "Go down the third line from the white stone and play one empty point beyond it.",
              "백돌에서 3선을 따라 아래로, 빈 점 하나를 건너 두세요.",
              "白石から三線を下へ、空点を一つ隔てて打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。挂角子被夹住了，不去管它：点三三，拿角上的实地。",
              "You are White. Your approach stone has been pincered. Leave it for now and invade at the 3-3 point for the corner territory.",
              "백입니다. 걸친 돌이 협공당했습니다. 그 돌은 두고 삼삼에 들어가 귀의 실리를 차지하세요.",
              "白番です。カカリの石がハサまれました。それはひとまず置いて、三々に入って隅の実利を取りましょう。",
            ),
            board: ur(J_STAR, [], J_LOW_PINCER, 2),
            toMove: WHITE,
            accept: urPts([16, 2]),
            success: L(
              "点三三：被夹的子以后可以作为弃子或者借用。",
              "The 3-3 invasion. The pincered stone can be given up later, or used for forcing moves.",
              "삼삼 침입입니다. 협공당한 돌은 나중에 버리거나 활용할 수 있습니다.",
              "三々入りです。ハサまれた石は後で捨てたり、利かしに使ったりできます。",
            ),
            wrong: L(
              "三三在黑棋星位斜里面，靠角的那一点。",
              "The 3-3 point is diagonally inside Black's star point, toward the corner.",
              "삼삼은 흑 화점에서 대각선 안쪽, 귀 쪽의 점입니다.",
              "三々は黒の星の斜め内側、隅寄りの点です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑先。从挂角子一侧挡住三三，把白棋分成两处。",
              "Black to play. Block the 3-3 stone on the approach stone's side and split White in two.",
              "흑 차례. 걸친 돌 쪽에서 삼삼을 막아 백을 둘로 가르세요.",
              "黒番です。カカリの石の側から三々をオサエて、白を二つに分けましょう。",
            ),
            board: ur(J_STAR, [], J_LOW_PINCER, 3),
            toMove: BLACK,
            accept: urPts([16, 3]),
            success: L(
              "挡在这里，三三和挂角子就连不上了，挂角子夹在黑棋两子之间。",
              "Blocked here, the 3-3 stone can no longer join the approach stone, which is caught between your stones.",
              "여기서 막으면 삼삼과 걸친 돌이 이어지지 못하고, 걸친 돌은 흑돌 사이에 갇힙니다.",
              "ここでオサエれば三々とカカリの石はつながれず、カカリの石は黒石の間に挟まれます。",
            ),
            wrong: L(
              "挡在三三和挂角子之间：紧挨三三，在它的正下方。",
              "Block between the 3-3 stone and the approach stone: right below the 3-3 stone, touching it.",
              "삼삼과 걸친 돌 사이를 막으세요. 삼삼 바로 아래에 붙여 둡니다.",
              "三々とカカリの石の間をオサエましょう。三々のすぐ下にくっつけます。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。三三的子要在上边找活路：沿第三线向左长一步。",
              "You are White. The 3-3 stone must live along the top: extend one step to the left along the third line.",
              "백입니다. 삼삼의 돌은 위쪽 변에서 살 길을 찾아야 합니다. 3선을 따라 왼쪽으로 한 칸 뻗으세요.",
              "白番です。三々の石は上辺で生きる道を探します。三線に沿って左へ一つ伸びましょう。",
            ),
            board: ur(J_STAR, [], J_LOW_PINCER, 4),
            toMove: WHITE,
            accept: urPts([15, 2]),
            success: L(
              "长出一步，扩大了角上的空间。接下来黑棋通常坚实地长一手，不在白棋头上扳，以免留下断点。",
              "One step along the top widens the corner. Black usually answers with a solid extension rather than a hane at the head, which would leave a cutting point.",
              "한 칸 뻗어 귀의 공간을 넓혔습니다. 흑은 보통 끊는 점이 남는 머리 젖힘 대신 튼튼하게 뻗습니다.",
              "一つ伸びて隅の広さを確保しました。黒はふつう、切りの点が残る頭のハネではなく、堅く伸びます。",
            ),
            wrong: L(
              "在三三的左边，紧挨着它，也挨着黑棋的星位子。",
              "To the left of the 3-3 stone, touching it and also touching Black's star point stone.",
              "삼삼의 왼쪽에 붙여 두세요. 흑 화점 돌과도 닿는 자리입니다.",
              "三々の左にくっつけて打ちましょう。黒の星の石にも接する所です。",
            ),
          },
        ],
      },
      {
        id: "adv-joseki-two-space",
        title: L("二间低夹", "The two-space low pincer", "두 칸 낮은 협공", "二間挟み"),
        steps: [
          {
            kind: "read",
            text: L(
              "二间低夹（黑2）离挂角子远一路，夹得没那么紧，但也不怕白棋反过来攻击夹击的子。白棋同样点三三（白3），黑4从挂角子一侧挡。白5长之后，黑6坚实地长，不给白棋断点；白棋再在二路扳，黑棋挡住，白棋在角上活，黑棋得到厚势。",
              "The two-space low pincer (Black 2) stands one point farther away: it presses less, but the pincer stone is in less danger of being attacked in turn. White again invades at the 3-3 point (White 3) and Black 4 blocks on the approach stone's side. After White 5, Black 6 extends solidly and leaves no cutting point; White hanes on the second line, Black blocks, White lives in the corner and Black gets thickness.",
              "두 칸 낮은 협공(흑 2)은 걸친 돌에서 한 칸 더 멀어 압박은 덜하지만, 협공한 돌이 거꾸로 공격받을 걱정도 적습니다. 백은 역시 삼삼에 들어가고(백 3), 흑 4는 걸친 돌 쪽에서 막습니다. 백 5가 뻗으면 흑 6은 튼튼하게 뻗어 끊는 점을 남기지 않습니다. 백이 2선에서 젖히면 흑이 막고, 백은 귀에서 살며 흑은 두터움을 얻습니다.",
              "二間挟み（黒2）はカカリの石から一路遠く、挟む力は弱いものの、挟んだ石が逆に攻められる心配も少なくなります。白はやはり三々に入り（白3）、黒4はカカリの石の側からオサエます。白5の伸びに黒6は堅く伸びて切りの点を残しません。白が二線でハネれば黒がオサエ、白は隅で生き、黒は厚みを得ます。",
            ),
            board: ur(J_STAR, [], J_TWO_PINCER, 6, { numbers: true }),
          },
          {
            kind: "place",
            text: L(
              "黑先。二间低夹：在右边第三线，和白子之间空两路。",
              "Black to play. The two-space low pincer: on the third line of the right side, two empty points beyond the white stone.",
              "흑 차례. 두 칸 낮은 협공입니다. 오른쪽 변 3선에서 백돌과 두 칸을 띄웁니다.",
              "黒番です。二間挟みです。右辺の三線で、白石から二路あけます。",
            ),
            board: ur(J_STAR, [], J_TWO_PINCER, 1),
            toMove: BLACK,
            accept: urPts([16, 8]),
            success: L(
              "二间低夹：比一间夹宽松，但夹击的子自己也更安全。",
              "The two-space low pincer: looser than the one-space pincer, and the pincer stone itself is safer.",
              "두 칸 낮은 협공입니다. 한 칸 협공보다 느슨하지만 협공한 돌 자체는 더 안전합니다.",
              "二間挟みです。一間挟みより緩やかですが、挟んだ石自体はより安全です。",
            ),
            wrong: L(
              "沿第三线从白子往下，中间空两个点。",
              "Go down the third line from the white stone, leaving two empty points between.",
              "백돌에서 3선을 따라 아래로, 사이에 빈 점 두 개를 두세요.",
              "白石から三線を下へ、間に空点を二つあけましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋点三三，黑棋挡，白棋向左长。黑先：不扳，坚实地长一手。",
              "White invaded, Black blocked and White extended to the left. Black to play: do not hane; extend solidly.",
              "백이 삼삼에 들어가고 흑이 막자 백이 왼쪽으로 뻗었습니다. 흑 차례: 젖히지 말고 튼튼하게 뻗으세요.",
              "白が三々に入り、黒がオサエ、白が左へ伸びました。黒番です。ハネずに堅く伸びましょう。",
            ),
            board: ur(J_STAR, [], J_TWO_PINCER, 5),
            toMove: BLACK,
            accept: urPts([14, 3]),
            success: L(
              "坚实的长：没有断点，厚势朝着上边和中腹。",
              "A solid extension: no cutting point, and the thickness faces the top and the centre.",
              "튼튼한 뻗음입니다. 끊는 점이 없고 두터움이 위쪽과 중앙을 향합니다.",
              "堅い伸びです。切りの点がなく、厚みは上辺と中央を向きます。",
            ),
            wrong: L(
              "从星位子向左长一路，在第四线上，和星位子连在一起。",
              "Extend one point left from your star point stone, on the fourth line, joined to it.",
              "화점 돌에서 왼쪽으로 한 줄 뻗으세요. 4선에서 화점 돌과 이어지는 자리입니다.",
              "星の石から左へ一路伸びましょう。四線で星の石とつながる所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。在二路扳，扩大角上的眼位。",
              "You are White. Hane on the second line to widen your space in the corner.",
              "백입니다. 2선에서 젖혀 귀의 궁도를 넓히세요.",
              "白番です。二線でハネて、隅の眼形を広げましょう。",
            ),
            board: ur(J_STAR, [], J_TWO_PINCER, 6),
            toMove: WHITE,
            accept: urPts([17, 3]),
            success: L(
              "二路扳：黑棋要挡住，否则白棋会沿着右边往下爬。",
              "The second-line hane: Black has to block, or White crawls down the right side.",
              "2선 젖힘입니다. 흑이 막지 않으면 백이 오른쪽 변을 따라 기어 내려갑니다.",
              "二線のハネです。黒がオサエないと、白は右辺を這い下ります。",
            ),
            wrong: L(
              "在二路，紧挨着挡住你的黑子，斜挨着你的三三。",
              "On the second line, touching the black blocking stone and diagonally next to your 3-3 stone.",
              "2선에서, 막은 흑돌에 붙고 삼삼과는 대각선인 자리입니다.",
              "二線で、オサエた黒石にくっつき、三々と斜めに接する所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑先。挡住二路扳，别让白棋沿右边爬下来。",
              "Black to play. Block the second-line hane; do not let White crawl down the right side.",
              "흑 차례. 2선 젖힘을 막아 백이 오른쪽 변으로 내려오지 못하게 하세요.",
              "黒番です。二線のハネをオサエて、白に右辺を這わせないようにしましょう。",
            ),
            board: ur(J_STAR, [], J_TWO_PINCER, 7),
            toMove: BLACK,
            accept: urPts([17, 4]),
            success: L(
              "挡住了：白棋只能在角上做活，挂角子更孤单了。",
              "Blocked: White has to live in the corner, and the approach stone is even more alone.",
              "막았습니다. 백은 귀에서 살아야 하고, 걸친 돌은 더 외로워졌습니다.",
              "オサエました。白は隅で生きるしかなく、カカリの石はますます孤立しました。",
            ),
            wrong: L(
              "下在白棋二路扳子的正下方。",
              "Play directly below White's second-line hane stone.",
              "백의 2선 젖힌 돌 바로 아래에 두세요.",
              "白の二線のハネの石のすぐ下に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "adv-joseki-high-approach",
        title: L("小目一间高挂", "The high approach to the 3-4 point", "소목의 한 칸 높은 걸침", "小目の一間高ガカリ"),
        steps: [
          {
            kind: "read",
            text: L(
              "白1一间高挂黑棋的小目。黑2托在下面，白3扳，黑4退，白5粘住断点，黑6沿右边拆，角上安定了。白棋在上边站了两颗子，接下来按“立二拆三”向左拆。黑棋拿角地，白棋得到上边：这是最基本的一型。",
              "White 1 makes a one-space high approach to Black's 3-4 point. Black 2 attaches underneath, White 3 hanes and Black 4 draws back; White 5 connects the cutting point and Black 6 extends down the right side, settling the corner. White now has two stones standing on the top side and extends three spaces to the left, as in \"stand two, extend three\". Black gets the corner, White the top side: the most basic line.",
              "백 1이 흑의 소목에 한 칸 높게 걸칩니다. 흑 2 밑붙임에 백 3 젖힘, 흑 4 물러서기, 백 5가 끊는 점을 잇고 흑 6이 오른쪽 변으로 벌려 귀를 안정시킵니다. 백은 위쪽 변에 두 점이 섰으니 ‘입이전삼’대로 왼쪽으로 세 칸 벌립니다. 흑은 귀를, 백은 위쪽 변을 얻는 가장 기본적인 정석입니다.",
              "白1は黒の小目に一間高ガカリ。黒2の下ツケに白3ハネ、黒4ヒキ、白5が切りの点を継ぎ、黒6が右辺に開いて隅が安定します。白は上辺に二子が立ったので、「二立三析」の通り左へ三間に開きます。黒は隅を、白は上辺を得る、最も基本的な定石です。",
            ),
            board: ur(J_KOMOKU, [], J_HIGH, 6, { numbers: true }),
          },
          {
            kind: "place",
            text: L(
              "白棋一间高挂了你的小目。托在白子下面（靠边的一侧），紧挨着它。",
              "White has made a one-space high approach to your 3-4 point. Attach underneath the white stone, on the edge side, touching it.",
              "백이 소목에 한 칸 높게 걸쳤습니다. 백돌 밑(변 쪽)에 붙이세요.",
              "白が小目に一間高ガカリしました。白石の下（辺の側）にツケましょう。",
            ),
            board: ur(J_KOMOKU, [], J_HIGH, 1),
            toMove: BLACK,
            accept: urPts([14, 2]),
            success: L(
              "托：先守住角里的实地，让白棋往外走。",
              "The attachment underneath secures the corner first and sends White outward.",
              "밑붙임으로 먼저 귀의 실리를 지키고 백을 바깥으로 보냅니다.",
              "下ツケで、まず隅の実利を守り、白を外へ向かわせます。",
            ),
            wrong: L(
              "托在白子和上边之间，第三线上。",
              "Attach between the white stone and the top edge, on the third line.",
              "백돌과 위쪽 변 사이, 3선에 붙이세요.",
              "白石と上辺の間、三線にツケましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋扳。往角里退一步：托的子和小目斜着相连，白棋切不断。",
              "White hanes. Draw back one step toward the corner: your attaching stone then stands diagonally next to the 3-4 stone, and White cannot cut them apart.",
              "백이 젖혔습니다. 귀 쪽으로 한 칸 물러서세요. 붙인 돌이 소목과 대각선으로 이어져 백이 끊을 수 없습니다.",
              "白がハネました。隅の方へ一つヒきましょう。ツケた石が小目と斜めにつながり、白は切れません。",
            ),
            board: ur(J_KOMOKU, [], J_HIGH, 3),
            toMove: BLACK,
            accept: urPts([15, 2]),
            success: L(
              "退：黑棋的子连成一片，角地稳固。",
              "Drawing back: Black's stones are joined and the corner is secure.",
              "물러서서 흑돌이 하나로 이어졌고 귀가 튼튼해졌습니다.",
              "ヒいて黒石がつながり、隅は堅くなりました。",
            ),
            wrong: L(
              "下在托的子右边，同时斜挨着小目。",
              "Play to the right of your attaching stone, diagonally next to the 3-4 stone.",
              "붙인 돌 오른쪽, 소목과 대각선으로 닿는 곳에 두세요.",
              "ツケた石の右、小目と斜めに接する所に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。两颗白子斜着，中间有断点。补住它：实连或虎口都可以。",
              "You are White. Your two stones touch only diagonally, with a cutting point between them. Protect it, with a solid or a hanging connection.",
              "백입니다. 백 두 점이 대각선으로만 닿아 끊는 점이 있습니다. 꽉 잇기나 호구로 지키세요.",
              "白番です。白二子は斜めに接しているだけで、切りの点があります。カタツギかカケツギで守りましょう。",
            ),
            board: ur(J_KOMOKU, [], J_HIGH, 4),
            toMove: WHITE,
            accept: urPts([13, 3], [12, 3]),
            success: L(
              "断点补好，白棋两子立在上边，可以安心拆了。",
              "The cut is covered. White has two stones standing on the top side and can now extend.",
              "끊는 점을 지켰습니다. 백은 위쪽 변에 두 점이 서서 안심하고 벌릴 수 있습니다.",
              "切りの点を守りました。白は上辺に二子が立ち、安心して開けます。",
            ),
            wrong: L(
              "断点是两颗白子斜对的那个空点。补那里，或者在它左边做虎口。",
              "The cutting point is the empty point diagonally between your stones. Fill it, or make a tiger's mouth to its left.",
              "끊는 점은 백 두 점이 대각선으로 마주한 빈 점입니다. 거기를 잇거나 그 왼쪽에 호구를 만드세요.",
              "切りの点は白二子が斜めに向き合う空点です。そこを継ぐか、その左にカケツギを打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑先。角上的黑棋还要一个根据地：沿右边向下拆。",
              "Black to play. The corner stones still need a base: extend down the right side.",
              "흑 차례. 귀의 흑돌은 아직 근거가 필요합니다. 오른쪽 변을 따라 아래로 벌리세요.",
              "黒番です。隅の黒石にはまだ根拠が必要です。右辺に沿って下へ開きましょう。",
            ),
            board: ur(J_KOMOKU, [], J_HIGH, 5),
            toMove: BLACK,
            accept: urPts([16, 5], [15, 5]),
            success: L(
              "角上的黑棋安定了。现在轮到白棋在上边拆。",
              "The corner group is settled. Now it is White's turn to extend along the top.",
              "귀의 흑은 안정되었습니다. 이제 백이 위쪽 변에 벌릴 차례입니다.",
              "隅の黒は安定しました。今度は白が上辺に開く番です。",
            ),
            wrong: L(
              "从小目往下，沿第三线跳一路，或者往下小飞。",
              "From the 3-4 stone, jump one point down the third line, or play a small knight's move downward.",
              "소목에서 3선을 따라 아래로 한 칸 뛰거나, 아래로 날일자로 두세요.",
              "小目から三線を下へ一間トビするか、下へ小ゲイマに打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。立二拆三：从站着的两颗子沿上边向左拆三路。",
              "You are White. Stand two, extend three: from your two standing stones, extend three spaces to the left along the top.",
              "백입니다. 입이전삼: 서 있는 두 점에서 위쪽 변을 따라 왼쪽으로 세 칸 벌리세요.",
              "白番です。二立三析：立っている二子から上辺を左へ三間に開きましょう。",
            ),
            board: ur(J_KOMOKU, [], J_HIGH, 6),
            toMove: WHITE,
            accept: urPts([9, 2], [9, 3]),
            success: L(
              "拆三：白棋在上边有了根据地，定式告一段落。",
              "The three-space extension gives White a base on the top side, and the joseki is complete.",
              "세 칸 벌림으로 백은 위쪽 변에 근거를 얻었고, 정석이 일단락되었습니다.",
              "三間ビラキで白は上辺に根拠を得て、定石が一段落しました。",
            ),
            wrong: L(
              "从白棋两子往左，中间空三路，第三线或第四线。",
              "Go left from your two stones, leaving three empty points, on the third or fourth line.",
              "백 두 점에서 왼쪽으로 세 점을 비우고, 3선이나 4선에 두세요.",
              "白二子から左へ、間を三路あけて、三線か四線に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "adv-joseki-knight",
        title: L("小目的小飞挂", "The knight's approach to the 3-4 point", "소목의 날일자 걸침", "小目の小ゲイマガカリ"),
        steps: [
          {
            kind: "read",
            text: L(
              "黑棋若先下小飞守角，角就基本稳了。如果白棋抢先在那里挂（白1），黑2小飞应，同样守住角，同时向右边发展；白3在上边拆二，给挂角子安根据地。黑棋拿角和右边，白棋在上边站稳。",
              "If Black plays the small knight's enclosure first, the corner is about secure. If White approaches there first (White 1), Black 2 answers with a small knight's move that secures the corner just as well and develops down the right side; White 3 makes a two-space extension along the top, giving the approach stone a base. Black gets the corner and the right side, White settles on the top.",
              "흑이 먼저 날일자로 굳히면 귀는 거의 안전합니다. 백이 먼저 그곳에 걸치면(백 1), 흑 2는 날일자로 받아 역시 귀를 지키면서 오른쪽 변으로 발전합니다. 백 3은 위쪽 변에 두 칸 벌려 걸친 돌의 근거를 만듭니다. 흑은 귀와 오른쪽 변을, 백은 위쪽 변의 안정을 얻습니다.",
              "黒が先に小ゲイマジマリを打てば、隅はほぼ安全です。白が先にそこへカカれば（白1）、黒2は小ゲイマに受けて同じく隅を守りながら右辺へ発展します。白3は上辺に二間ビラキして、カカリの石の根拠を作ります。黒は隅と右辺を、白は上辺の安定を得ます。",
            ),
            board: ur(J_KOMOKU, [], J_LOW, 3, { numbers: true }),
          },
          {
            kind: "place",
            text: L(
              "黑先。小飞守角：从小目沿上边小飞，下在第三线。",
              "Black to play. Make the small knight's enclosure: a knight's move from the 3-4 stone toward the top side, on the third line.",
              "흑 차례. 날일자로 굳히세요. 소목에서 위쪽 변 쪽으로 날일자, 3선입니다.",
              "黒番です。小ゲイマジマリを打ちましょう。小目から上辺の方へ小ゲイマ、三線です。",
            ),
            board: ur(J_KOMOKU, []),
            toMove: BLACK,
            accept: urPts([14, 2]),
            success: L(
              "小飞守角：角上的实地基本确定了。",
              "The small knight's enclosure: the corner territory is about settled.",
              "날일자 굳힘입니다. 귀의 실리가 거의 확정되었습니다.",
              "小ゲイマジマリです。隅の実利はほぼ確定しました。",
            ),
            wrong: L(
              "从小目向左两路、向上一路，落在第三线。",
              "Two points left of the 3-4 stone and one point up, on the third line.",
              "소목에서 왼쪽으로 두 줄, 위로 한 줄, 3선입니다.",
              "小目から左へ二路、上へ一路、三線です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋抢先挂在那里。黑先：小飞应，守住角并向右边发展。",
              "White has approached there first. Black to play: answer with a small knight's move that guards the corner and develops down the right side.",
              "백이 먼저 그곳에 걸쳤습니다. 흑 차례: 날일자로 받아 귀를 지키며 오른쪽 변으로 발전하세요.",
              "白が先にそこへカカりました。黒番です。小ゲイマに受けて隅を守り、右辺へ発展しましょう。",
            ),
            board: ur(J_KOMOKU, [], J_LOW, 1),
            toMove: BLACK,
            accept: urPts([15, 5], [15, 4]),
            success: L(
              "角守住了，下一步白棋要给挂角子找根据地。尖（斜下一路）也是同样坚实的应法。",
              "The corner is secure, and White must now give the approach stone a base. The diagonal move one point down is an equally solid answer.",
              "귀를 지켰고, 이제 백은 걸친 돌의 근거를 만들어야 합니다. 대각선 아래로 한 칸(마늘모)도 똑같이 튼튼한 응수입니다.",
              "隅を守り、今度は白がカカリの石の根拠を作る番です。斜め下へ一路のコスミも同じく堅い受けです。",
            ),
            wrong: L(
              "从小目往下走一个小飞（向左一路、向下两路），或者斜下一路。",
              "From the 3-4 stone, a small knight's move downward (one left, two down), or one point diagonally down.",
              "소목에서 아래로 날일자(왼쪽 한 줄, 아래 두 줄), 또는 대각선 아래 한 칸입니다.",
              "小目から下へ小ゲイマ（左へ一路、下へ二路）か、斜め下へ一路です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。挂角子沿上边第三线向左拆二。",
              "You are White. Extend two spaces from your approach stone, to the left along the third line.",
              "백입니다. 걸친 돌에서 위쪽 변 3선을 따라 왼쪽으로 두 칸 벌리세요.",
              "白番です。カカリの石から上辺の三線を左へ二間ビラキしましょう。",
            ),
            board: ur(J_KOMOKU, [], J_LOW, 2),
            toMove: WHITE,
            accept: urPts([11, 2]),
            success: L(
              "拆二：一颗子拆二，白棋安定了。",
              "The two-space extension: a single stone extends two, and White is settled.",
              "두 칸 벌림입니다. 한 점에서는 두 칸을 벌려 백이 안정되었습니다.",
              "二間ビラキです。一子からは二間に開いて、白は安定しました。",
            ),
            wrong: L(
              "从挂角子往左，中间空两路，还在第三线上。",
              "Go left from the approach stone, leaving two empty points, still on the third line.",
              "걸친 돌에서 왼쪽으로 두 점을 비우고 3선에 두세요.",
              "カカリの石から左へ、間を二路あけて三線に打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "adv-joseki-choose",
        title: L("根据周围选择定式", "Choosing a joseki by the position", "주위를 보고 정석 고르기", "周りを見て定石を選ぶ"),
        steps: [
          {
            kind: "read",
            text: L(
              "同一个定式，在不同的局面下好坏不同。白棋从右边挂进黑棋两个星位之间：黑棋在A夹击，同时又是从右下拆过来，白子两边受压；在B守角就太缓了。选定式要看周围：厚势要朝着自己的阵势，夹击要从有自己棋子的一侧。",
              "A joseki can be good in one position and poor in another. White has approached from the right side, between Black's two star points. A pincer at A is also an extension from the lower right corner, pressing the white stone from both sides; guarding the corner at B would be too slow. Choose a joseki by the stones around it: point your thickness toward your own area, and pincer from the side where your stones are.",
              "같은 정석도 국면에 따라 좋고 나쁨이 다릅니다. 백이 오른쪽 변에서 흑의 두 화점 사이로 걸쳤습니다. A의 협공은 오른쪽 아래 귀에서 벌린 수도 되어, 백돌이 양쪽에서 압박받습니다. B로 귀를 지키는 것은 너무 느립니다. 정석은 주위의 돌을 보고 고릅니다. 두터움은 내 진영 쪽을 향하게 하고, 협공은 내 돌이 있는 쪽에서 합니다.",
              "同じ定石でも、局面によって良し悪しが変わります。白が右辺から黒の二つの星の間にカカりました。Aのハサミは右下の隅からの開きにもなり、白石は両側から迫られます。Bで隅を守るのでは遅すぎます。定石は周りの石を見て選びます。厚みは自分の陣地に向け、ハサミは自分の石がある側から打ちます。",
            ),
            board: CHOOSE_READ,
          },
          {
            kind: "place",
            text: L(
              "黑先。夹击右边的白子：从靠右下黑子的那一侧夹，夹击同时也是拆。",
              "Black to play. Pincer the white stone on the right side, from the side of your lower right stone, so that the pincer is also an extension.",
              "흑 차례. 오른쪽 변의 백돌을 협공하세요. 오른쪽 아래 흑돌 쪽에서 협공해, 협공이 벌림도 되게 합니다.",
              "黒番です。右辺の白石をハサみましょう。右下の黒石の側からハサんで、ハサミが開きにもなるようにします。",
            ),
            board: CHOOSE_PINCER,
            toMove: BLACK,
            accept: pts([16, 7], [16, 8], [16, 9], [15, 7], [15, 8], [15, 9]),
            success: L(
              "夹击兼拆：白子上下都没有拆的余地了。",
              "A pincer that is also an extension: the white stone has no room to extend either way.",
              "협공이자 벌림입니다. 백돌은 위로도 아래로도 벌릴 여지가 없습니다.",
              "ハサミであり開きでもあります。白石は上にも下にも開く余地がありません。",
            ),
            wrong: L(
              "在白子下方的右边夹击，离白子空一到三路，第三线或第四线。",
              "Pincer below the white stone on the right side, leaving one to three empty points, on the third or fourth line.",
              "백돌 아래쪽 오른쪽 변에서, 백돌과 한 칸에서 세 칸 띄워 3선이나 4선에 협공하세요.",
              "白石の下の右辺で、白石から一路から三路あけて、三線か四線でハサみましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋是中国流，白棋点了右上的三三。黑先：从哪一边挡？让厚势和右边的黑子配合。",
              "Black has the Chinese opening, and White has invaded the upper right 3-3 point. Black to play: which side do you block? Make your thickness work with your stones on the right side.",
              "흑은 중국류이고, 백이 오른쪽 위 삼삼에 들어왔습니다. 흑 차례: 어느 쪽에서 막을까요? 두터움이 오른쪽 변의 흑돌과 호응하게 하세요.",
              "黒は中国流で、白が右上の三々に入りました。黒番です。どちらからオサエますか。厚みが右辺の黒石と連携するようにしましょう。",
            ),
            board: CHOOSE_33,
            toMove: BLACK,
            accept: pts([16, 3]),
            success: L(
              "从右边挡：白棋只能在上边做活，右边的中国流保持完整。",
              "Blocked on the right: White has to live along the top, and the Chinese opening on the right side stays whole.",
              "오른쪽에서 막았습니다. 백은 위쪽 변에서 살아야 하고, 오른쪽의 중국류는 온전합니다.",
              "右からオサエました。白は上辺で生きるしかなく、右辺の中国流はそのままです。",
            ),
            wrong: L(
              "挡在白子正下方，也就是右边那一侧，紧挨着它。",
              "Block right below the white stone, on the right side, touching it.",
              "백돌 바로 아래, 곧 오른쪽 변 쪽에 붙여 막으세요.",
              "白石のすぐ下、つまり右辺の側にくっつけてオサエましょう。",
            ),
          },
          {
            kind: "read",
            text: L(
              "征子也要先看清：有些定式里的切断只有在征子有利时才成立，征子不利就要选别的下法。",
              "Read the ladders before you choose, too: in some joseki a cut works only when the ladder works, and when it does not, choose another line.",
              "축도 먼저 확인하세요. 어떤 정석의 끊음은 축이 유리할 때만 성립하므로, 축이 불리하면 다른 수를 골라야 합니다.",
              "シチョウも先に確かめましょう。定石の中には、シチョウが有利なときだけ成立する切りがあり、不利なら別の手を選ぶ必要があります。",
            ),
          },
        ],
      },
    ],
  },

  /* ============================================================ UNIT A1 */
  {
    id: "adv-judgement",
    level: "advanced",
    title: L("全局判断", "Whole-board judgement", "전체 판단", "大局観"),
    summary: L(
      "哪一边更大，把对方往自己的厚势上赶，远离对方的厚势。",
      "Which side is bigger, driving the opponent toward your thickness, and keeping away from theirs.",
      "어느 쪽이 더 큰가, 상대를 내 두터움 쪽으로 몰기, 상대의 두터움에서 떨어지기.",
      "どちらの辺が大きいか、相手を自分の厚みへ追い込む、相手の厚みから離れる。",
    ),
    lessons: [
      {
        id: "adv-judge-bigger",
        title: L("哪一边更大", "Which side is bigger", "어느 쪽이 더 큰가", "どちらの辺が大きいか"),
        steps: [
          {
            kind: "read",
            text: L(
              "四个角都守住了。左边夹在黑棋两个角之间，右边夹在白棋两个角之间，上边和下边则在黑角和白角之间。A这样的点，既从自己的角拆开，又阻止对方从角上拆过来，一手棋起两个作用。一般来说，双方都想拆的那条边最大。",
              "All four corners are enclosed. The left side lies between Black's two corners, the right side between White's, and the top and bottom between a black and a white corner. A point like A extends from your corner and also stops the opponent extending from theirs: one move does two jobs. As a rule, the side that both players want to extend along is the biggest.",
              "네 귀가 모두 굳혀졌습니다. 왼쪽 변은 흑의 두 귀 사이, 오른쪽 변은 백의 두 귀 사이, 위와 아래 변은 흑 귀와 백 귀 사이에 있습니다. A 같은 자리는 내 귀에서 벌리면서 상대가 자기 귀에서 벌리는 것도 막습니다. 한 수가 두 가지 일을 하는 셈입니다. 대체로 양쪽이 모두 벌리고 싶은 변이 가장 큽니다.",
              "四隅ともシマリが打たれています。左辺は黒の二つの隅の間、右辺は白の二つの隅の間、上辺と下辺は黒の隅と白の隅の間です。Aのような点は、自分の隅から開くと同時に、相手が隅から開くのも止めます。一手で二つの仕事をします。一般に、両方が開きたい辺がいちばん大きいのです。",
            ),
            board: BOUNDARY_A,
          },
          {
            kind: "place",
            text: L(
              "黑先。下在双方都想拆的边上。",
              "Black to play. Play on a side that both players want to extend along.",
              "흑 차례. 양쪽이 모두 벌리고 싶은 변에 두세요.",
              "黒番です。両方が開きたい辺に打ちましょう。",
            ),
            board: BOUNDARY,
            toMove: BLACK,
            accept: [...TOP_MIDDLE, ...BOTTOM_MIDDLE],
            success: L(
              "这一手既拆开了黑角，又让对面的白角拆不过来。",
              "This extends Black's corner and stops the white corner opposite from extending.",
              "흑 귀에서 벌리면서 맞은편 백 귀의 벌림도 막았습니다.",
              "黒の隅から開きつつ、向かいの白の隅の開きも止めました。",
            ),
            wrong: L(
              "找黑角和白角之间那条边的中间一带：上边或下边。",
              "Look for the middle of a side between a black and a white corner: the top or the bottom.",
              "흑 귀와 백 귀 사이에 있는 변의 가운데쯤을 찾으세요. 위쪽 변이나 아래쪽 변입니다.",
              "黒の隅と白の隅の間にある辺の中ほど、上辺か下辺を探しましょう。",
            ),
          },
          {
            kind: "read",
            text: L(
              "B这样的点只是扩大黑棋已经占优的一边：白棋到那里，会夹在黑棋两个坚固的角之间，很难安顿。所以B通常可以先放一放。",
              "A point like B only adds to a side where Black is already stronger: a white stone there would sit between two solid black corners and have a hard time. So Black can usually leave B for later.",
              "B 같은 자리는 흑이 이미 강한 변을 넓힐 뿐입니다. 백이 그곳에 들어와도 튼튼한 흑의 두 귀 사이에서 고생합니다. 그래서 흑은 보통 B를 나중으로 미룰 수 있습니다.",
              "Bのような点は黒がすでに優勢な辺を広げるだけです。白がそこに来ても堅い黒の二つの隅に挟まれて苦労します。だから黒はふつうBを後回しにできます。",
            ),
            board: BOUNDARY_B,
          },
          {
            kind: "place",
            text: L(
              "黑棋占了上边。现在轮到白棋：白棋该下在哪里？",
              "Black has taken the top. Now it is White's turn: where should White play?",
              "흑이 위쪽 변을 차지했습니다. 이제 백 차례입니다. 백은 어디에 두어야 할까요?",
              "黒が上辺を占めました。今度は白番です。白はどこに打つべきでしょう。",
            ),
            board: BOUNDARY_WHITE,
            toMove: WHITE,
            accept: BOTTOM_MIDDLE,
            success: L(
              "道理对双方都一样：剩下的那条分界的边最大。",
              "The reasoning is the same for both players: the remaining side between the two positions is the biggest.",
              "이치는 양쪽 모두 같습니다. 남은 경계의 변이 가장 큽니다.",
              "理屈は双方同じです。残った境目の辺がいちばん大きいのです。",
            ),
            wrong: L(
              "上边已经有子了。还有哪条边夹在黑角和白角之间？",
              "The top is taken. Which other side lies between a black and a white corner?",
              "위쪽 변은 이미 돌이 있습니다. 흑 귀와 백 귀 사이에 있는 다른 변은 어디일까요?",
              "上辺はもう打たれています。黒の隅と白の隅の間にある辺は、ほかにどこでしょう。",
            ),
          },
        ],
      },
      {
        id: "adv-judge-toward-thickness",
        title: L("往厚势上赶", "Drive it toward your thickness", "두터움 쪽으로 몰기", "厚みに追い込む"),
        steps: [
          {
            kind: "read",
            text: L(
              "左边黑棋有一道厚实的墙，白棋在里面低位活了。上边有一颗白子。黑棋若从墙的一侧（B）逼它，白棋就往右边宽阔的地方开拆；从另一侧（A）夹，白棋就被夹在黑墙和夹击的子之间，没有地方做根据地。厚势最好用来攻击，而攻击通常要把对方往厚势上赶。",
              "Black has a thick wall on the left side, and White has lived low inside it. There is a white stone on the top side. If Black presses it from the wall's side (B), White extends into the open space on the right. If Black pincers from the other side (A), the stone is caught between the wall and the pincer, with no room for a base. Thickness is best used for attacking, and an attack usually drives the opponent toward it.",
              "왼쪽 변에 흑의 두터운 벽이 있고, 백은 그 안쪽 낮은 곳에서 살았습니다. 위쪽 변에는 백돌 하나가 있습니다. 흑이 벽 쪽(B)에서 다가가면 백은 오른쪽 넓은 곳으로 벌립니다. 반대쪽(A)에서 협공하면 백돌은 흑 벽과 협공한 돌 사이에 끼어 근거를 만들 자리가 없습니다. 두터움은 공격에 쓰는 것이 가장 좋고, 공격은 보통 상대를 두터움 쪽으로 몰아갑니다.",
              "左辺に黒の厚い壁があり、白はその内側で低く生きています。上辺には白石が一つあります。黒が壁の側（B）から迫ると、白は右の広い方へ開きます。反対側（A）からはさむと、白石は黒の壁とはさんだ石の間に挟まれ、根拠を作る場所がありません。厚みは攻めに使うのがいちばんで、攻めはふつう相手を厚みの方へ追い込みます。",
            ),
            board: TOWARD_WALL_MARKED,
          },
          {
            kind: "place",
            text: L(
              "黑先。攻击上边的白子，把它往黑墙上赶。",
              "Black to play. Attack the white stone on the top side and drive it toward your wall.",
              "흑 차례. 위쪽 변의 백돌을 공격해 흑 벽 쪽으로 모세요.",
              "黒番です。上辺の白石を攻めて、黒の壁の方へ追い込みましょう。",
            ),
            board: TOWARD_WALL,
            toMove: BLACK,
            accept: box(11, 2, 13, 3),
            success: L(
              "从宽的一侧夹击，同时也从右上的黑角拆了过来。白子只能往黑墙那边跑。",
              "A pincer from the open side, which is also an extension from your upper right corner. The white stone can only run toward your wall.",
              "넓은 쪽에서 협공했고, 오른쪽 위 흑 귀에서 벌린 수도 됩니다. 백돌은 흑 벽 쪽으로만 달아날 수 있습니다.",
              "広い側からのハサミで、右上の黒の隅からの開きにもなっています。白石は黒の壁の方へしか逃げられません。",
            ),
            wrong: L(
              "从白子右边、靠近黑棋右上角的一侧夹它，别从墙这一侧逼。",
              "Pincer from the right of the white stone, near your upper right corner, not from the wall's side.",
              "벽 쪽이 아니라, 백돌 오른쪽의 흑 오른쪽 위 귀에 가까운 쪽에서 협공하세요.",
              "壁の側ではなく、白石の右、黒の右上隅に近い側からはさみましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "白子靠近了你的墙。吃掉它：有墙在，追起来很短。",
              "A white stone has come close to your wall. Capture it: with the wall there, the chase is short.",
              "백돌이 흑의 벽 가까이 왔습니다. 잡으세요. 벽이 있어서 쫓는 길이 짧습니다.",
              "白石が黒の壁に近づきました。取りましょう。壁があるので、追いかけは短く済みます。",
            ),
            problem: { goal: "capture", corner: "tl", diagram: WALL_CAPTURE },
            success: L(
              "从开阔的一侧挡住，白子只能沿着墙爬，气越来越少。",
              "Block on the open side. The stone can only crawl along your wall, and it runs out of liberties.",
              "열린 쪽을 막으면 백돌은 벽을 따라 기어갈 수밖에 없고 활로가 줄어듭니다.",
              "開いた側を止めると、白石は壁に沿って這うしかなく、呼吸点がなくなります。",
            ),
          },
        ],
      },
      {
        id: "adv-judge-away",
        title: L("远离对方的厚势", "Keep away from the opponent's thickness", "상대의 두터움에서 떨어지기", "相手の厚みに近づかない"),
        steps: [
          {
            kind: "read",
            text: L(
              "这次是白棋在下边有厚势。黑棋从右下角拆，往下边（B）拆就靠近了白墙，白棋会一边攻击一边围空；往右边（A）拆则远离白墙，还和右上的黑角配合。一般来说，不要在对方的厚势附近下棋，除非你的棋在那里能够安全地活或者连回去。",
              "This time White has thickness on the bottom side. If Black extends from the lower right corner along the bottom (B), the new stone is close to White's wall, and White can attack it while making territory. Extending up the right side (A) keeps away from the wall and works with Black's upper right corner. As a rule, do not play close to the opponent's thickness unless your stones can live or connect safely there.",
              "이번에는 백이 아래쪽 변에 두터움이 있습니다. 흑이 오른쪽 아래 귀에서 아래쪽 변(B)으로 벌리면 백의 벽에 가까워져, 백이 공격하면서 집을 짓게 됩니다. 오른쪽 변(A)으로 벌리면 벽에서 멀어지고 오른쪽 위 흑 귀와도 호응합니다. 대체로 상대의 두터움 근처에는 두지 않습니다. 그곳에서 안전하게 살거나 연결할 수 있을 때는 예외입니다.",
              "今度は白が下辺に厚みを持っています。黒が右下の隅から下辺（B）に開くと白の壁に近く、白は攻めながら地を作れます。右辺（A）に開けば壁から離れ、右上の黒の隅とも連携します。一般に、相手の厚みの近くには打ちません。そこで安全に生きるかつながれる場合は別です。",
            ),
            board: AWAY_MARKED,
          },
          {
            kind: "place",
            text: L(
              "黑先。从右下角拆，远离白棋的厚势。",
              "Black to play. Extend from the lower right corner, away from White's thickness.",
              "흑 차례. 오른쪽 아래 귀에서 백의 두터움을 피해 벌리세요.",
              "黒番です。右下の隅から、白の厚みを避けて開きましょう。",
            ),
            board: AWAY,
            toMove: BLACK,
            accept: box(15, 7, 16, 11),
            success: L(
              "拆在右边，远离白墙，又和右上角呼应。",
              "On the right side: away from White's wall and working with your upper right corner.",
              "오른쪽 변입니다. 백 벽에서 멀고 오른쪽 위 귀와 호응합니다.",
              "右辺です。白の壁から遠く、右上の隅とも呼応します。",
            ),
            wrong: L(
              "这一手离白墙太近，或者没有拆开。沿着右边往上拆。",
              "That is too close to White's wall, or not an extension. Extend up the right side.",
              "백 벽에 너무 가깝거나 벌림이 아닙니다. 오른쪽 변을 따라 위로 벌리세요.",
              "白の壁に近すぎるか、開きになっていません。右辺に沿って上へ開きましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "反过来看：黑子靠近了白墙。你执白，吃掉它。",
              "Now the other way round: a black stone has come close to White's wall. You are White: capture it.",
              "이번에는 반대입니다. 흑돌이 백의 벽 가까이 왔습니다. 백으로 잡으세요.",
              "今度は逆です。黒石が白の壁に近づきました。白番で、取りましょう。",
            ),
            problem: { goal: "capture", corner: "bl", diagram: flipY(swap(WALL_CAPTURE)) },
            success: L(
              "靠近厚势的子很难活。这就是要远离厚势的原因。",
              "A stone next to thickness has a hard life. That is why you keep away from it.",
              "두터움 옆의 돌은 살기 어렵습니다. 그래서 두터움에서 떨어져 둡니다.",
              "厚みのそばの石は生きるのが大変です。だから厚みから離れて打つのです。",
            ),
          },
        ],
      },
    ],
  },

  /* ============================================================ UNIT A2 */
  {
    id: "adv-invasion",
    level: "advanced",
    title: L("打入与侵消", "Invasion and reduction", "침입과 삭감", "打ち込みと消し"),
    summary: L(
      "什么时候打入、打在哪里，点三三，以及从上面肩冲侵消。",
      "When and where to invade, the 3-3 invasion, and reducing from above with a shoulder hit.",
      "언제 어디에 침입할까, 삼삼 침입, 위에서 어깨짚기로 삭감하기.",
      "いつどこに打ち込むか、三々入り、上からカタツキで消す。",
    ),
    lessons: [
      {
        id: "adv-invade-where",
        title: L("打在哪里", "Where to invade", "어디에 침입할까", "どこに打ち込むか"),
        steps: [
          {
            kind: "read",
            text: L(
              "白棋右上守角，又沿右边拆得很宽。拆得太宽的地方可以打入：打在三路、两边都有拆二余地的地方（A），打入的子通常既能拆开做根据地，又能逼对方的子。拆二以内的空隙一般太窄，打入的子容易被吃，这时通常改为从外面侵消。",
              "White has an enclosure in the upper right and a wide extension down the right side. A wide extension can be invaded: on the third line, where there is room for a two-space extension on either side (A), the invader can usually make a base while pressing the stones around it. A gap of two spaces or less is usually too narrow; an invader there is easily captured, and reducing from outside is usually better.",
              "백이 오른쪽 위를 굳히고 오른쪽 변으로 넓게 벌렸습니다. 넓게 벌린 곳에는 침입할 수 있습니다. 3선에서 양쪽으로 두 칸 벌릴 여유가 있는 곳(A)이라면, 침입한 돌은 보통 근거를 만들면서 주위의 돌을 압박할 수 있습니다. 두 칸 이하의 틈은 대개 너무 좁아 침입한 돌이 잡히기 쉬우므로, 그럴 때는 보통 바깥에서 삭감하는 편이 낫습니다.",
              "白は右上をシマり、右辺に広く開いています。広すぎる開きには打ち込めます。三線で、両側に二間開く余地がある点（A）なら、打ち込んだ石はふつう根拠を作りながら周りの石に迫れます。二間以下の隙間はたいてい狭すぎて打ち込んだ石が取られやすいので、外から消す方がふつうはよいでしょう。",
            ),
            board: INVADE_SIDE_MARKED,
          },
          {
            kind: "place",
            text: L(
              "黑先。打入右边白棋拆得太宽的地方。",
              "Black to play. Invade the wide extension on the right side.",
              "흑 차례. 오른쪽 변의 넓은 벌림에 침입하세요.",
              "黒番です。右辺の広い開きに打ち込みましょう。",
            ),
            board: INVADE_SIDE,
            toMove: BLACK,
            accept: pts([16, 6], [16, 7], [16, 8]),
            success: L(
              "三路，两边都有余地：上下都能拆。",
              "On the third line, with room both ways: you can extend up or down.",
              "3선이고 양쪽에 여유가 있어 위아래로 벌릴 수 있습니다.",
              "三線で、両側に余地があり、上下どちらにも開けます。",
            ),
            wrong: L(
              "打在两颗白子之间的三路，中间一带。",
              "Play on the third line, around the middle between the two white positions.",
              "두 백의 사이, 가운데쯤의 3선에 두세요.",
              "二つの白の間、中ほどの三線に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "同样的道理，这次在下边。黑先，打入。",
              "The same idea on the bottom side. Black to play: invade.",
              "같은 이치를 아래쪽 변에서. 흑 차례, 침입하세요.",
              "同じ考え方を下辺で。黒番です。打ち込みましょう。",
            ),
            board: INVADE_BOTTOM,
            toMove: BLACK,
            accept: pts([7, 16], [8, 16], [9, 16]),
            success: L(
              "打在中间，两边都留有拆的余地。",
              "In the middle, with room to extend on both sides.",
              "가운데에 두어 양쪽에 벌릴 여유가 있습니다.",
              "中ほどに打ち、両側に開く余地を残しました。",
            ),
            wrong: L(
              "在白棋左下的守角和右边那颗子之间的三路，找中间。",
              "On the third line between White's lower left enclosure and the stone to its right: find the middle.",
              "백의 왼쪽 아래 굳힘과 그 오른쪽 돌 사이의 3선에서 가운데를 찾으세요.",
              "白の左下のシマリとその右の石の間の三線で、中ほどを探しましょう。",
            ),
          },
        ],
      },
      {
        id: "adv-invade-33",
        title: L("点三三", "The 3-3 invasion", "삼삼 침입", "三々入り"),
        steps: [
          {
            kind: "read",
            text: L(
              "星位只有一颗子时，三三是空的。点进三三，角上通常能活（进阶课程学过的定式），代价是让对方在外面筑起厚势。所以点三三之前要想一想：对方的厚势会不会正好对着它自己的阵势，变得更大。",
              "A lone star point stone leaves the 3-3 point open. An invasion there can usually live in the corner (the joseki from the intermediate course), at the price of giving the opponent thickness outside. So before invading, ask whether that thickness would face the opponent's own position and make it even bigger.",
              "화점에 돌이 하나뿐이면 삼삼이 비어 있습니다. 삼삼에 들어가면 보통 귀에서 살 수 있지만(중급 과정의 정석), 그 대가로 상대에게 바깥의 두터움을 줍니다. 그래서 침입하기 전에, 그 두터움이 상대 자신의 진영을 향해 더 커지지 않을지 생각해 봅니다.",
              "星に石が一つだけなら、三々が空いています。三々に入ればふつう隅で生きられますが（中級講座の定石）、代わりに相手に外の厚みを与えます。だから入る前に、その厚みが相手自身の模様に向いてさらに大きくならないか考えましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑先。右上白棋的星位还是单独一颗子，下边的白子离得很远。点三三。",
              "Black to play. White's upper right star point stone is still alone, and its other stones are far away. Invade at the 3-3 point.",
              "흑 차례. 오른쪽 위 백의 화점 돌이 아직 혼자이고 다른 백돌은 멀리 있습니다. 삼삼에 침입하세요.",
              "黒番です。右上の白の星の石はまだ単独で、ほかの白石は遠くにあります。三々に入りましょう。",
            ),
            board: LONE_STAR,
            toMove: BLACK,
            accept: pts([16, 2]),
            success: L(
              "点在星位斜下、靠角的那个点：三三。",
              "The point diagonally inside the star point, toward the corner: the 3-3 point.",
              "화점에서 귀 쪽으로 대각선 안쪽, 삼삼입니다.",
              "星の斜め内側、隅寄りの点、三々です。",
            ),
            wrong: L(
              "三三在星位和角之间的斜线上，离两条边都是三路。",
              "The 3-3 point is on the diagonal between the star point and the corner, on the third line from both edges.",
              "삼삼은 화점과 귀 사이의 대각선 위, 두 변에서 모두 3선인 자리입니다.",
              "三々は星と隅を結ぶ斜めの線上、両方の辺から三線の点です。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "打入之后，常常要在角上的小地方做活。黑先活。",
              "After an invasion you often have to live in a small corner. Black to play and live.",
              "침입한 뒤에는 귀의 좁은 곳에서 살아야 할 때가 많습니다. 흑선 삶.",
              "打ち込んだ後は、隅の狭いところで生きなければならないことがよくあります。黒先生き。",
            ),
            problem: { goal: "live", corner: "bl", diagram: flipY(swap(CORNER_FIVE)) },
            success: L(
              "角上那一点做出了两只眼。",
              "The point in the corner gives you two eyes.",
              "귀의 그 한 점으로 두 눈이 생깁니다.",
              "隅のその一点で二眼ができます。",
            ),
          },
        ],
      },
      {
        id: "adv-reduce-shoulder",
        title: L("肩冲侵消", "Reducing with a shoulder hit", "어깨짚기로 삭감하기", "カタツキで消す"),
        steps: [
          {
            kind: "read",
            text: L(
              "不能打入或不想打入时，可以从上面侵消。对三路的子，肩冲（A或B）是常用的手段：压在它斜上方，对方通常会沿着三路爬，得到实地，你得到外面的势力。选哪一边，通常看哪一边对你的其他棋子更有利。",
              "When you cannot or do not want to invade, you can reduce from above. Against a third-line stone the shoulder hit (A or B) is a common way: you sit diagonally above it, the opponent usually crawls along the third line and gets territory, and you get strength outside. Which side to choose usually depends on which one works better with your other stones.",
              "침입할 수 없거나 원하지 않을 때는 위에서 삭감합니다. 3선의 돌에는 어깨짚기(A나 B)가 흔히 쓰입니다. 대각선 위에서 누르면 상대는 보통 3선으로 기어 실리를 얻고, 나는 바깥의 세력을 얻습니다. 어느 쪽을 고를지는 보통 내 다른 돌과 어느 쪽이 더 잘 어울리는지로 정합니다.",
              "打ち込めないとき、打ち込みたくないときは、上から消します。三線の石にはカタツキ（AかB）がよく使われます。斜め上から押さえると、相手はふつう三線を這って地を得、こちらは外の勢力を得ます。どちら側を選ぶかは、ふつう自分のほかの石とどちらが働くかで決めます。",
            ),
            board: SHOULDER_MARKED,
          },
          {
            kind: "place",
            text: L(
              "黑先。肩冲上边三路的白子。",
              "Black to play. Make a shoulder hit on the white third-line stone on the top side.",
              "흑 차례. 위쪽 변 3선의 백돌에 어깨짚기를 하세요.",
              "黒番です。上辺の三線の白石にカタツキしましょう。",
            ),
            board: SHOULDER_THIRD,
            toMove: BLACK,
            accept: pts([8, 3], [10, 3]),
            success: L(
              "在它斜上方，靠中腹的一侧：肩冲。",
              "Diagonally above it, on the centre side: a shoulder hit.",
              "대각선 위, 중앙 쪽입니다. 어깨짚기입니다.",
              "斜め上、中央側です。カタツキです。",
            ),
            wrong: L(
              "肩冲下在白子的斜上方（往中腹的方向），不贴着它。",
              "A shoulder hit goes diagonally above the stone (toward the centre), not right next to it.",
              "어깨짚기는 돌의 대각선 위(중앙 방향)에 두며, 바로 옆에 붙이지 않습니다.",
              "カタツキは石の斜め上（中央の方向）で、すぐ隣にはつけません。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次白子在四路。从上面侵消它：肩冲或者镇。",
              "This time the white stone is on the fourth line. Reduce it from above: a shoulder hit or a cap.",
              "이번에는 백돌이 4선에 있습니다. 위에서 삭감하세요. 어깨짚기나 모자입니다.",
              "今度は白石が四線にあります。上から消しましょう。カタツキかボウシです。",
            ),
            board: SHOULDER_FOURTH,
            toMove: BLACK,
            accept: pts([8, 4], [10, 4], [9, 5]),
            success: L(
              "从上面压住，不深入白阵，也不给它太多实地以外的东西。",
              "Pressing from above: you do not go deep into White's area, and White gets little more than the territory below.",
              "위에서 누르면 백 진영 깊이 들어가지 않고, 백에게도 아래쪽 실리 이상은 주지 않습니다.",
              "上から押さえれば、白の陣深くには入らず、白にも下の地以上のものはあまり与えません。",
            ),
            wrong: L(
              "下在上边白子的斜上方（肩冲）或正上方隔一路（镇）。",
              "Play diagonally above the white top-side stone (shoulder hit) or one space straight above it (cap).",
              "위쪽 변 백돌의 대각선 위(어깨짚기)나 바로 위 한 칸 띈 곳(모자)에 두세요.",
              "上辺の白石の斜め上（カタツキ）か、真上に一間（ボウシ）に打ちましょう。",
            ),
          },
        ],
      },
    ],
  },

  /* ============================================================ UNIT A3 */
  {
    id: "adv-life",
    level: "advanced",
    title: L("高级死活", "Advanced life and death", "고급 사활", "上級の死活"),
    summary: L(
      "一路之差：死、劫、活；带劫的结果；角上的双活。",
      "One point of difference: dead, ko or alive; results that depend on a ko; seki in the corner.",
      "한 점 차이: 죽음, 패, 삶. 패가 걸린 결과, 귀의 빅.",
      "一路の差：死に、コウ、生き。コウになる結果、隅のセキ。",
    ),
    lessons: [
      {
        id: "adv-life-one-point",
        title: L("死、劫、活", "Dead, ko or alive", "죽음, 패, 삶", "死に、コウ、生き"),
        steps: [
          {
            kind: "read",
            text: L(
              "角上的棋，眼位多一路，结果就可能完全不同：同一种形状，可能是净死，多一路变成劫，再多一路就活了。实战中要先数清楚对方的眼位，再决定是杀、打劫还是先放着。下面三题都已由解题程序验证（四周没有外气）。",
              "In the corner, one more point of eye space can change the result completely: the same kind of shape can be dead, a ko with one more point, and alive with one more again. In a game, count the eye space first, then decide whether to kill, make a ko, or leave it. The three problems below were all proved by the solver (with no outside liberties).",
              "귀의 돌은 궁도가 한 점 늘어나면 결과가 완전히 달라질 수 있습니다. 같은 종류의 모양이 죽음이었다가, 한 점 늘면 패, 또 한 점 늘면 삶이 됩니다. 실전에서는 먼저 궁도를 세고, 잡을지, 패로 할지, 그냥 둘지를 정합니다. 아래 세 문제는 모두 풀이 프로그램이 확인했습니다(바깥 공배 없음).",
              "隅の石は、眼形が一路増えると結果がまったく変わることがあります。同じ種類の形が死にで、一路増えるとコウ、さらに一路で生きになります。実戦ではまず眼形を数え、殺すか、コウにするか、放っておくかを決めます。下の三題はすべて解答プログラムが確かめています（外ダメなし）。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "白棋角上有五个点的眼位：上边四个，旁边一个。黑先杀。",
              "White's corner has five points of eye space: four along the top, one down the side. Black to play and kill.",
              "백의 귀에 궁도가 다섯 점 있습니다. 위로 넷, 옆으로 하나. 흑선, 백을 잡으세요.",
              "白の隅には眼形が五つあります。上に四つ、横に一つ。黒先白死。",
            ),
            problem: { goal: "kill", corner: "tr", diagram: flipX(CORNER_FIVE) },
            success: L("这个形状，先下就能杀。", "With the first move, this shape can be killed.", "이 모양은 먼저 두면 잡을 수 있습니다.", "この形は、先に打てば殺せます。"),
          },
          {
            kind: "problem",
            text: L(
              "同样的形状，旁边多了一路。这次净杀不了：黑先，打成劫。",
              "The same shape with one more point down the side. Now it cannot be killed outright: Black to play and make a ko.",
              "같은 모양에 옆으로 한 점이 늘었습니다. 이번에는 그냥 잡을 수 없습니다. 흑선 패.",
              "同じ形で、横に一路増えました。今度は無条件には殺せません。黒先コウ。",
            ),
            problem: { goal: "kill", ko: "ok", corner: "tr", diagram: flipX(CORNER_SIX) },
            success: L(
              "多一路眼位，结果从死变成了劫。",
              "One more point of eye space turns dead into ko.",
              "궁도 한 점 차이로 죽음이 패로 바뀌었습니다.",
              "眼形が一路増えて、死にがコウに変わりました。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "另一种角上的形：上边三个点，旁边两个点。黑先杀，不要打劫。",
              "Another corner shape: three points along the top, two down the side. Black to play and kill, without a ko.",
              "다른 귀의 모양입니다. 위로 세 점, 옆으로 두 점. 흑선, 패 없이 잡으세요.",
              "別の隅の形です。上に三つ、横に二つ。黒先、コウにせずに殺しましょう。",
            ),
            problem: { goal: "kill", corner: "tl", diagram: CORNER_OTHER },
            success: L(
              "净杀。能净杀的时候，不要满足于打劫。",
              "Killed outright. When you can kill without a ko, do not settle for one.",
              "패 없이 잡았습니다. 그냥 잡을 수 있을 때는 패로 만족하지 마세요.",
              "無条件で殺しました。無条件で殺せるときは、コウで満足しないことです。",
            ),
          },
        ],
      },
      {
        id: "adv-life-ko",
        title: L("带劫的死活", "Life and death with a ko", "패가 걸린 사활", "コウになる死活"),
        steps: [
          {
            kind: "read",
            text: L(
              "很多实战中的死活，最好的结果是打劫。这时要看劫材：劫材多的一方可以去打，劫材少时，通常先在别处找劫材，或者把劫留到以后。下面两题，最好的结果都是劫，解题程序证明了没有更好的下法。",
              "In many real games the best result in a life-and-death fight is a ko. Then ko threats decide: the side with more threats can fight it; with fewer, you usually build threats first or leave the ko for later. In the two problems below the best result is a ko, and the solver has proved there is nothing better.",
              "실전의 사활에서는 최선의 결과가 패인 경우가 많습니다. 그때는 팻감이 결정합니다. 팻감이 많은 쪽은 패를 할 수 있고, 적을 때는 보통 먼저 팻감을 만들거나 패를 뒤로 미룹니다. 아래 두 문제는 최선이 패이며, 풀이 프로그램이 그보다 나은 수가 없음을 증명했습니다.",
              "実戦の死活では、最善の結果がコウということがよくあります。そのときはコウダテが決め手です。コウダテの多い方はコウを戦えますが、少ないときはふつう先にコウダテを作るか、コウを後に残します。下の二題は最善がコウで、それ以上の手がないことを解答プログラムが証明しています。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "白子打进了黑角。黑先，至少打成劫活。",
              "A white stone has got into your corner. Black to play: live, at least with a ko.",
              "백돌이 흑의 귀에 들어왔습니다. 흑선, 적어도 패로 사세요.",
              "白石が黒の隅に入ってきました。黒先、少なくともコウで生きましょう。",
            ),
            problem: { goal: "live", ko: "ok", corner: "tl", diagram: [". O . . O , , ,", ". x x x O , , ,", "x x O O O , , ,", "O O O , , , , ,", ", , , , , , , ,", ", , , , , , , ,"] },
            success: L(
              "劫。打不成劫就是净死，所以这一手很重要。",
              "A ko. Without it the group would simply be dead, so this move matters.",
              "패입니다. 패가 안 되면 그냥 죽으므로 이 한 수가 중요합니다.",
              "コウです。コウにならなければただ死ぬので、この一手が大事です。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "白棋的眼位沿边伸得比较长。黑先，打成劫。",
              "White's eye space reaches a little further down the side. Black to play and make a ko.",
              "백의 궁도가 변을 따라 조금 더 깁니다. 흑선 패.",
              "白の眼形は辺に沿って少し長くなっています。黒先コウ。",
            ),
            problem: { goal: "kill", ko: "ok", corner: "br", diagram: flipY(flipX(CORNER_OTHER_LONG)) },
            success: L(
              "比上一课的形状多一路，净杀变成了劫。",
              "One point more than the last lesson's shape, and the kill becomes a ko.",
              "지난 강의 모양보다 한 점 많아서, 그냥 잡기가 패로 바뀌었습니다.",
              "前の課の形より一路多く、無条件の殺しがコウに変わりました。",
            ),
          },
        ],
      },
      {
        id: "adv-life-seki",
        title: L("角上的双活", "Seki in the corner", "귀의 빅", "隅のセキ"),
        steps: [
          {
            kind: "read",
            text: L(
              "对方的子留在你的眼位里，你又做不出两只眼时，还有一条路：双活。双方都不能紧公气，谁紧谁被吃。按日本规则，双活里的空点不算目，但活着总比死了好。下面两题，解题程序证明了做不出净活，但能做成双活。",
              "When the opponent's stones stay inside your eye space and you cannot make two eyes, there is one more way out: seki. Neither side can fill the shared liberties, because whoever does is captured. Under Japanese rules the empty points of a seki are not territory, but living is better than dying. In the two problems below the solver has proved that independent life is out of reach and seki is not.",
              "상대의 돌이 내 궁도 안에 남아 있고 두 눈을 만들 수 없을 때도 길이 하나 더 있습니다. 빅입니다. 공동 공배를 메우는 쪽이 잡히므로 양쪽 모두 메울 수 없습니다. 일본 규칙에서 빅 안의 빈 점은 집이 아니지만, 사는 것이 죽는 것보다 낫습니다. 아래 두 문제는 완생은 안 되지만 빅은 된다는 것을 풀이 프로그램이 증명했습니다.",
              "相手の石が自分の眼形の中に残っていて二眼を作れないときも、もう一つ道があります。セキです。内ダメを詰めた方が取られるので、どちらも詰められません。日本ルールではセキの中の空点は地になりませんが、生きる方が死ぬよりよいのです。下の二題は、完全な生きは無理でもセキにはできることを解答プログラムが証明しています。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "两颗白子留在了黑棋的眼位里。黑先，做成双活。",
              "Two white stones are left inside your eye space. Black to play and live in seki.",
              "백돌 두 점이 흑의 궁도 안에 남아 있습니다. 흑선, 빅으로 사세요.",
              "白石二子が黒の眼形の中に残っています。黒先、セキで生きましょう。",
            ),
            problem: { goal: "seki", corner: "tl", diagram: [". O O . . x O , ,", ". x x x x x O , ,", "O O O O O O O , ,", ", , , , , , , , ,"] },
            success: L(
              "双活：谁也不能再紧气。",
              "Seki: neither side can fill another liberty.",
              "빅입니다. 어느 쪽도 공배를 더 메울 수 없습니다.",
              "セキです。どちらももうダメを詰められません。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "又是两颗白子在里面，这次在角的另一侧。黑先，做成双活。",
              "Two white stones inside again, this time in another corner. Black to play and live in seki.",
              "다시 백돌 두 점이 안에 있습니다. 이번에는 다른 귀입니다. 흑선, 빅으로 사세요.",
              "また白石二子が中にいます。今度は別の隅です。黒先、セキで生きましょう。",
            ),
            problem: { goal: "seki", corner: "tr", diagram: flipX([". O O . O , , ,", ". x x x O , , ,", ". x O O O , , ,", ". x O , , , , ,", "x x O , , , , ,", "O O O , , , , ,", ", , , , , , , ,"]) },
            success: L(
              "双活。先看能不能净活，不能时就找双活。",
              "Seki. First look for independent life; when it is not there, look for seki.",
              "빅입니다. 먼저 완생을 찾고, 안 되면 빅을 찾으세요.",
              "セキです。まず完全な生きを探し、なければセキを探しましょう。",
            ),
          },
        ],
      },
    ],
  },

  /* ============================================================ UNIT A4 */
  {
    id: "adv-tesuji",
    level: "advanced",
    title: L("组合手筋", "Tesuji in combination", "맥의 조합", "手筋の組み合わせ"),
    summary: L(
      "扑之后的倒扑，扑之后的接不归，倒脱靴。",
      "A throw-in followed by a snapback, a throw-in followed by connect and die, and under the stones.",
      "먹여치기 뒤의 환격, 먹여치기 뒤의 촉촉수, 석하.",
      "ホウリコミからのウッテガエシ、ホウリコミからのオイオトシ、石の下。",
    ),
    lessons: [
      {
        id: "adv-tesuji-throw-in-snapback",
        title: L("扑和倒扑", "Throw-in and snapback", "먹여치기와 환격", "ホウリコミとウッテガエシ"),
        steps: [
          {
            kind: "read",
            text: L(
              "有时一个手筋还不够：先扑进去，送给对方吃，对方提子以后形状变了，下一手才成为倒扑。送掉的子并没有白白浪费，它让对方的棋多了一颗子，却没有多出气。",
              "Sometimes one tesuji is not enough. You throw a stone in and let it be captured; after the capture the shape has changed, and your next move becomes a snapback. The stones you gave away were not wasted: they made the opponent's group bigger without giving it more liberties.",
              "때로는 맥 하나로는 부족합니다. 먼저 먹여치고 따내게 하면, 따낸 뒤 모양이 바뀌어 다음 수가 환격이 됩니다. 버린 돌은 헛되지 않습니다. 상대의 돌을 늘리면서 활로는 늘려 주지 않았으니까요.",
              "一つの手筋では足りないこともあります。まずホウリコんで取らせると、取った後で形が変わり、次の手がウッテガエシになります。捨てた石は無駄ではありません。相手の石を増やしながら、呼吸点は増やしていないのです。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "吃掉二路的三颗白子。第一手要送子。",
              "Capture the three white stones on the second line. Your first move gives stones away.",
              "2선의 백돌 세 점을 잡으세요. 첫 수는 돌을 버리는 수입니다.",
              "二線の白石三子を取りましょう。最初の手は石を捨てる手です。",
            ),
            problem: { goal: "capture", corner: "tl", diagram: [". . X O .", "o o o X .", "X X X X X", ". . . . ."] },
            success: L(
              "先扑，白棋提子；再扑一次，白棋提了以后就被倒扑。",
              "Throw in, White captures; throw in again, and after White captures, the snapback takes everything.",
              "먹여치면 백이 따내고, 다시 먹여치면 따낸 뒤 환격으로 모두 잡힙니다.",
              "ホウリコむと白が取り、もう一度ホウリコむと、取った後ウッテガエシですべて取れます。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "这次在边上。吃掉三颗白子：同样要先送子，最后是倒扑。",
              "This time on the side. Capture the three white stones: again you give stones away first, and it ends with a snapback.",
              "이번에는 변입니다. 백돌 세 점을 잡으세요. 이번에도 먼저 돌을 버리고, 마지막은 환격입니다.",
              "今度は辺です。白石三子を取りましょう。やはり先に石を捨て、最後はウッテガエシです。",
            ),
            problem: { goal: "capture", at: [6, 0], diagram: ["O . X . X .", "X o o o X O", "X X X X X X", ". . . . . ."] },
            success: L(
              "送子、再送子、倒扑。手顺对了，三颗白子逃不掉。",
              "Give, give again, snapback. In the right order, the three white stones cannot escape.",
              "버리고, 또 버리고, 환격. 수순이 맞으면 백 세 점은 도망가지 못합니다.",
              "捨てて、また捨てて、ウッテガエシ。手順が正しければ白三子は逃げられません。",
            ),
          },
        ],
      },
      {
        id: "adv-tesuji-throw-in-connect",
        title: L("扑和接不归", "Throw-in and connect and die", "먹여치기와 촉촉수", "ホウリコミとオイオトシ"),
        steps: [
          {
            kind: "read",
            text: L(
              "扑的另一个用处是让对方气紧：扑进去，对方提子，再打吃，对方去粘，粘上以后整块只剩一口气，这就是接不归。关键在于提子的那颗白子把自己的气也堵上了。",
              "Another use of the throw-in is to shorten the opponent's liberties. Throw in, the opponent captures, then atari: if the opponent connects, the whole group is left with one liberty. That is connect and die. The key is that the capturing white stone fills one of its own group's liberties.",
              "먹여치기의 또 다른 쓰임은 상대를 자충으로 만드는 것입니다. 먹여치고, 상대가 따내면 단수를 칩니다. 상대가 이으면 전체의 활로가 하나뿐이 됩니다. 이것이 촉촉수입니다. 따낸 백돌이 자기 활로를 스스로 메운다는 점이 핵심입니다.",
              "ホウリコミのもう一つの使い道は、相手をダメヅマリにすることです。ホウリコんで、相手が取ったらアタリ。継げば全体の呼吸点が一つしかありません。これがオイオトシです。取った白石が自分の呼吸点をふさいでしまうのがポイントです。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "吃掉边上的两颗白子。",
              "Capture the two white stones at the edge.",
              "가장자리의 백돌 두 점을 잡으세요.",
              "端の白石二子を取りましょう。",
            ),
            problem: { goal: "capture", at: [6, 0], diagram: ["X o . O . O", "X o . . . .", "X X X X X X", ". . . . . ."] },
            success: L(
              "扑、打吃，白棋粘上也接不回去。",
              "Throw in, atari: White connects, and still cannot get home.",
              "먹여치고 단수. 백이 이어도 연결되지 않습니다.",
              "ホウリコんでアタリ。白が継いでもつながりません。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "角上也有同样的手筋。吃掉两颗白子。",
              "The same tesuji works in the corner. Capture the two white stones.",
              "귀에서도 같은 맥이 통합니다. 백돌 두 점을 잡으세요.",
              "隅でも同じ手筋が使えます。白石二子を取りましょう。",
            ),
            problem: { goal: "capture", corner: "tr", diagram: flipX(["o . O . O", "o . . . .", "X X X X X", ". . . . ."]) },
            success: L(
              "接不归：粘上的白子越多，被吃的也越多。",
              "Connect and die: the more White connects, the more White loses.",
              "촉촉수입니다. 백이 이을수록 더 많이 잡힙니다.",
              "オイオトシです。白は継ぐほど多く取られます。",
            ),
          },
        ],
      },
      {
        id: "adv-tesuji-under-stones",
        title: L("倒脱靴", "Under the stones", "석하", "石の下"),
        steps: [
          {
            kind: "read",
            text: L(
              "倒脱靴：先让对方提掉你的两颗（或更多）子，然后在提空的地方下子，反过来吃掉对方。提子以后，对方的棋正好在那个空点上缺气。这个手筋在实战中不常出现，所以更容易被忽略。",
              "Under the stones: let the opponent capture two (or more) of your stones, then play on the empty point they leave and capture in return. After the capture, the opponent's group is short of liberties exactly at that point. The tesuji does not come up often in games, which makes it all the easier to miss.",
              "석하: 먼저 상대에게 내 돌 두 점(또는 그 이상)을 따내게 한 뒤, 따낸 빈 자리에 두어 거꾸로 상대를 잡습니다. 따낸 뒤 상대의 돌은 바로 그 빈 점에서 활로가 부족해집니다. 실전에서 자주 나오지 않아 놓치기 쉬운 맥입니다.",
              "石の下：まず相手に自分の石を二子（またはそれ以上）取らせ、取られて空いた点に打って逆に相手を取ります。取った後、相手の石はちょうどその空点でダメが足りなくなります。実戦ではあまり出てこないので、見落としやすい手筋です。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "角上的两颗黑子已经被打吃了。不要救它们：吃掉二路的三颗白子。",
              "Your two stones in the corner are in atari. Do not save them: capture the three white stones on the second line.",
              "귀의 흑돌 두 점이 단수입니다. 살리지 말고, 2선의 백돌 세 점을 잡으세요.",
              "隅の黒石二子はアタリになっています。助けずに、二線の白石三子を取りましょう。",
            ),
            problem: { goal: "capture", corner: "tl", diagram: ["X X . . .", "o o o . O", "X X X X X", ". . . . ."] },
            success: L(
              "白棋提了两子，黑棋紧气，最后下在提空的地方：倒脱靴。",
              "White captured two stones; Black filled from outside and finally played where they had been: under the stones.",
              "백이 두 점을 따냈고, 흑은 바깥에서 메운 뒤 마지막에 따낸 자리에 두었습니다. 석하입니다.",
              "白が二子を取り、黒は外からダメを詰めて、最後に取られた跡に打ちました。石の下です。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "边上的白棋有四颗子。吃掉它们，途中要让白棋提掉两颗黑子。",
              "White has four stones on the side. Capture them; on the way you let White capture two of your stones.",
              "변의 백돌은 네 점입니다. 잡으세요. 도중에 흑돌 두 점을 백에게 따내게 합니다.",
              "辺の白石は四子です。取りましょう。途中で黒石二子を白に取らせます。",
            ),
            problem: { goal: "capture", at: [6, 0], diagram: [". . X X o .", "X o o o o X", "X X X X X X", ". . . . . ."] },
            success: L(
              "提掉两子以后，白棋正好在那里缺气。",
              "After taking the two stones, White is short of liberties right there.",
              "두 점을 따낸 뒤, 백은 바로 그곳에서 활로가 부족합니다.",
              "二子を取った後、白はちょうどそこでダメが足りません。",
            ),
          },
        ],
      },
      {
        id: "adv-tesuji-practice",
        title: L("组合练习", "Combinations: practice", "조합 연습", "組み合わせの練習"),
        steps: [
          {
            kind: "problem",
            text: L(
              "吃掉二路的三颗白子。先想清楚白棋提子以后的形状。",
              "Capture the three white stones on the second line. Think about the shape after White captures.",
              "2선의 백돌 세 점을 잡으세요. 백이 따낸 뒤의 모양을 먼저 생각하세요.",
              "二線の白石三子を取りましょう。白が取った後の形を先に考えましょう。",
            ),
            problem: { goal: "capture", corner: "bl", diagram: flipY(["X . X . O", "X o o o X", "X X X X X", ". . . . ."]) },
            success: L("送子之后就是倒扑。", "After the sacrifice comes the snapback.", "버린 뒤에 환격입니다.", "捨てた後にウッテガエシです。"),
          },
          {
            kind: "problem",
            text: L(
              "吃掉一路的两颗白子。",
              "Capture the two white stones on the first line.",
              "1선의 백돌 두 점을 잡으세요.",
              "一線の白石二子を取りましょう。",
            ),
            problem: { goal: "capture", at: [7, 15], diagram: flipY(["X O X X . X", ". . o o . O", "X X X X X X", ". . . . . ."]) },
            success: L("让白棋提掉两子，再下在提空的地方：倒脱靴。", "Let White take two stones, then play where they were: under the stones.", "백에게 두 점을 따내게 한 뒤 따낸 자리에 둡니다. 석하입니다.", "白に二子を取らせてから、取られた跡に打ちます。石の下です。"),
          },
          {
            kind: "problem",
            text: L(
              "吃掉角上的三颗白子。",
              "Capture the three white stones in the corner.",
              "귀의 백돌 세 점을 잡으세요.",
              "隅の白石三子を取りましょう。",
            ),
            problem: { goal: "capture", corner: "br", diagram: flipY(flipX(["X . . O X", "o o o . .", "X X X X X", ". . . . ."])) },
            success: L("扑、紧气，最后倒扑。", "Throw in, fill a liberty, and finish with a snapback.", "먹여치고, 메우고, 마지막은 환격입니다.", "ホウリコんで、詰めて、最後はウッテガエシです。"),
          },
        ],
      },
    ],
  },

  /* ============================================================ UNIT A5 */
  {
    id: "adv-middle",
    level: "advanced",
    title: L("中盘战略", "Middle-game strategy", "중반 전략", "中盤の戦略"),
    summary: L(
      "攻击是为了得利，弃子是为了取得先手。",
      "Attacking to gain, and sacrificing stones to take sente.",
      "이득을 위한 공격, 선수를 위한 사석.",
      "攻めて得をする、石を捨てて先手を取る。",
    ),
    lessons: [
      {
        id: "adv-middle-attack-gain",
        title: L("攻击是为了得利", "Attack to gain", "이득을 위한 공격", "攻めて得をする"),
        steps: [
          {
            kind: "read",
            text: L(
              "攻击的目的通常不是吃掉对方，而是在对方逃跑的时候得到好处：围出实地，或者筑起势力。最好的攻击往往一手两用：既夺走对方的根据地，又扩大自己的地盘。白棋在左边分投，A和B都是从黑角拆过来、同时逼白子的点。",
              "The aim of an attack is usually not to capture, but to gain while the opponent runs: territory, or strength. The best attacking moves often do two jobs at once, taking away the opponent's base while adding to your own area. White has split the left side; A and B both extend from a black corner and press the white stone at the same time.",
              "공격의 목적은 보통 잡는 것이 아니라, 상대가 도망가는 동안 이득을 얻는 것입니다. 실리든 세력이든. 가장 좋은 공격은 흔히 한 수로 두 가지 일을 합니다. 상대의 근거를 빼앗으면서 내 영역을 넓힙니다. 백이 왼쪽 변에 갈라쳤습니다. A와 B는 모두 흑 귀에서 벌리면서 백돌에 다가가는 자리입니다.",
              "攻めの目的はふつう取ることではなく、相手が逃げる間に得をすることです。地でも勢力でも構いません。よい攻めはしばしば一手で二つの仕事をします。相手の根拠を奪いながら、自分の地を広げるのです。白が左辺に割り打ちしました。AとBはどちらも黒の隅から開きつつ白石に迫る点です。",
            ),
            board: SPLIT_LEFT_MARKED,
          },
          {
            kind: "place",
            text: L(
              "黑先。一边拆、一边逼左边的白子。",
              "Black to play. Extend and press the white stone on the left side with one move.",
              "흑 차례. 한 수로 벌리면서 왼쪽 변의 백돌에 다가가세요.",
              "黒番です。一手で開きながら、左辺の白石に迫りましょう。",
            ),
            board: SPLIT_LEFT,
            toMove: BLACK,
            accept: pts([2, 7], [2, 11], [3, 7], [3, 11]),
            success: L(
              "这一手扩大了黑角，又让白子没有拆二的余地。",
              "This adds to your corner and leaves the white stone no room for a two-space extension.",
              "흑 귀를 넓히면서 백돌에게 두 칸 벌릴 여유를 주지 않습니다.",
              "黒の隅を広げつつ、白石に二間に開く余地を与えません。",
            ),
            wrong: L(
              "从黑角沿着左边拆过来，停在白子的旁边隔一路的地方。",
              "Extend from a black corner along the left side, stopping one space short of the white stone.",
              "흑 귀에서 왼쪽 변을 따라 벌리고, 백돌에서 한 칸 떨어진 곳에 멈추세요.",
              "黒の隅から左辺に沿って開き、白石の一間手前で止めましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "同样的道理在上边。黑先。",
              "The same idea on the top side. Black to play.",
              "같은 이치를 위쪽 변에서. 흑 차례.",
              "同じ考え方を上辺で。黒番です。",
            ),
            board: SPLIT_TOP,
            toMove: BLACK,
            accept: pts([7, 2], [11, 2], [7, 3], [11, 3]),
            success: L(
              "拆兼逼：实地和攻击一举两得。",
              "An extension that is also an attack: territory and pressure in one move.",
              "벌림이자 공격입니다. 실리와 압박을 한 수로 얻었습니다.",
              "開きであり攻めでもあります。地と攻めを一手で得ました。",
            ),
            wrong: L(
              "从左上或右上的黑角往白子拆，在它旁边隔一路停下。",
              "Extend from the upper left or upper right black corner toward the white stone, stopping one space away.",
              "왼쪽 위나 오른쪽 위 흑 귀에서 백돌 쪽으로 벌리고, 한 칸 떨어져 멈추세요.",
              "左上か右上の黒の隅から白石の方へ開き、一間離れて止めましょう。",
            ),
          },
        ],
      },
      {
        id: "adv-middle-sacrifice",
        title: L("弃子取势", "Sacrifice to take sente", "사석으로 선수 잡기", "捨て石で先手を取る"),
        steps: [
          {
            kind: "read",
            text: L(
              "不是每颗子都值得救。没用的子（不起切断作用、不是根据地的子）可以送给对方，换来先手或者更大的利益。有时还要多送一颗：送掉两颗子，对方提子要花手数，你就能先手紧气或者封锁。下面两题都要送子。",
              "Not every stone is worth saving. Stones that do no work (they cut nothing and are no one's base) can be given away for sente or a bigger gain. Sometimes you even add a stone first: giving away two stones makes the opponent spend moves capturing, and you fill liberties or seal them in with sente. Both problems below need a sacrifice.",
              "모든 돌을 살릴 가치가 있는 것은 아닙니다. 하는 일이 없는 돌(끊는 역할도, 근거도 아닌 돌)은 상대에게 주고 선수나 더 큰 이득을 얻을 수 있습니다. 때로는 한 점을 더 보태서 버립니다. 두 점을 버리면 상대가 따내는 데 수를 써야 하므로, 나는 선수로 활로를 메우거나 봉쇄할 수 있습니다. 아래 두 문제는 모두 돌을 버려야 합니다.",
              "すべての石が助ける価値があるわけではありません。働きのない石（何も切っておらず、根拠でもない石）は相手に与えて、先手やより大きな得と交換できます。ときには一子付け加えてから捨てます。二子捨てれば相手は取るのに手をかけるので、こちらは先手でダメを詰めたり封鎖したりできます。下の二題はどちらも石を捨てる問題です。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "吃掉二路的两颗白子。途中要送掉黑子。",
              "Capture the two white stones on the second line. On the way you give stones away.",
              "2선의 백돌 두 점을 잡으세요. 도중에 흑돌을 버립니다.",
              "二線の白石二子を取りましょう。途中で黒石を捨てます。",
            ),
            problem: { goal: "capture", at: [6, 0], diagram: ["X . . X . .", ". . o o . O", "X X X X X X", ". . . . . ."] },
            success: L(
              "送掉的子让白棋一直在提子，黑棋一直在紧气。",
              "The stones you gave kept White busy capturing while you kept filling liberties.",
              "버린 돌 때문에 백은 계속 따내기 바빴고, 흑은 계속 활로를 메웠습니다.",
              "捨てた石のおかげで白は取るのに忙しく、黒はダメを詰め続けました。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "吃掉三颗白子。不要舍不得角上的黑子。",
              "Capture the three white stones. Do not hold on to your corner stone.",
              "백돌 세 점을 잡으세요. 귀의 흑돌을 아까워하지 마세요.",
              "白石三子を取りましょう。隅の黒石を惜しまないことです。",
            ),
            problem: { goal: "capture", corner: "tr", diagram: flipX(["X . . O .", "o o o X O", "X X X X X", ". . . . ."]) },
            success: L(
              "舍掉小的，吃掉大的。",
              "Give up the small, capture the big.",
              "작은 것을 버리고 큰 것을 잡았습니다.",
              "小を捨てて大を取りました。",
            ),
          },
        ],
      },
    ],
  },
  /* =============================================== v13 UNIT: handicap */
  {
    id: "adv-handicap",
    level: "advanced",
    title: L("让子棋的策略", "Handicap go strategy", "접바둑의 전략", "置き碁の戦略"),
    summary: L(
      "执黑：让让子互相配合，简明地应对打入，保持连接。执白：轻灵地下，先拿角。",
      "As Black: make the handicap stones work together, answer invasions simply and stay connected. As White: play lightly and take corners first.",
      "흑일 때: 치석끼리 호응하게 하고, 침입에는 간명하게 받으며, 연결을 유지합니다. 백일 때: 가볍게 두고 먼저 귀를 차지합니다.",
      "黒番：置き石を連携させ、打ち込みには簡明に受け、つながりを保つ。白番：軽く打ち、まず隅を取る。",
    ),
    lessons: [
      {
        id: "adv-handicap-stones",
        title: L("让让子互相配合", "Make the handicap stones work together", "치석끼리 호응하게", "置き石を連携させる"),
        steps: [
          {
            kind: "read",
            text: L(
              "让子棋里，黑棋的让子已经占好了四个角。白棋挂角时，最有力的往往是从另一颗让子那一侧夹击（A）：夹击的子同时是从右下拆过来的，白子两边都有黑子。只是守角（B）也不坏，但让子就没有发挥作用。不要在自己已经很强的地方再补棋（重复），也不要让自己的子被分开。",
              "In a handicap game Black already holds the four corners. When White approaches, a pincer from the side of another handicap stone (A) is often strongest: it also extends from the lower right corner, and the white stone has black stones on both sides. Guarding the corner (B) is not bad, but leaves the handicap stones idle. Do not add stones where you are already strong (overconcentration) or let your stones be split.",
              "접바둑에서는 흑의 치석이 이미 네 귀를 차지하고 있습니다. 백이 걸쳐 오면 다른 치석 쪽에서 협공하는 수(A)가 가장 강력할 때가 많습니다. 협공한 돌은 오른쪽 아래 귀에서 벌린 수도 되어, 백돌 양쪽에 흑돌이 있게 됩니다. 귀만 지키는 수(B)도 나쁘지 않지만 치석이 제 역할을 못 합니다. 이미 강한 곳에 또 두지 말고(중복), 내 돌이 갈라지지 않게 하세요.",
              "置き碁では、黒の置き石がすでに四隅を占めています。白がカカってきたら、別の置き石の側からハサむ手（A）が最も強力なことが多いでしょう。ハサんだ石は右下の隅からの開きにもなり、白石の両側に黒石があることになります。隅を守るだけの手（B）も悪くありませんが、置き石が働きません。すでに強い所にさらに打たず（凝り形）、自分の石が分断されないようにしましょう。",
            ),
            board: H4_APPROACH_READ,
          },
          {
            kind: "place",
            text: L(
              "四子局，白棋从右边挂角。黑先：从右下让子那一侧夹击。",
              "A four-stone game, and White approaches from the right side. Black to play: pincer from the side of your lower right stone.",
              "4점 접바둑에서 백이 오른쪽 변에서 걸쳤습니다. 흑 차례: 오른쪽 아래 치석 쪽에서 협공하세요.",
              "四子局で、白が右辺からカカりました。黒番です。右下の置き石の側からハサみましょう。",
            ),
            board: H4_APPROACH,
            toMove: BLACK,
            accept: pts([16, 7], [16, 8], [16, 9], [15, 7], [15, 8], [15, 9]),
            success: L(
              "夹击和右下的让子连成一片，白子没有拆的余地。",
              "The pincer works with your lower right stone, and the white stone has no room to extend.",
              "협공한 돌이 오른쪽 아래 치석과 호응해, 백돌은 벌릴 여지가 없습니다.",
              "ハサミが右下の置き石と連携し、白石は開く余地がありません。",
            ),
            wrong: L(
              "在白子下方的右边夹击，离白子空一到三路，第三线或第四线。",
              "Pincer below the white stone on the right side, leaving one to three empty points, on the third or fourth line.",
              "백돌 아래쪽 오른쪽 변에서, 백돌과 한 칸에서 세 칸 띄워 3선이나 4선에 협공하세요.",
              "白石の下の右辺で、白石から一路から三路あけて、三線か四線でハサみましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋点了三三。黑先：从挂角子一侧挡，把三三和挂角子分开。",
              "White has invaded the 3-3 point. Black to play: block on the approach stone's side, splitting the 3-3 stone from the approach stone.",
              "백이 삼삼에 들어왔습니다. 흑 차례: 걸친 돌 쪽에서 막아 삼삼과 걸친 돌을 갈라놓으세요.",
              "白が三々に入りました。黒番です。カカリの石の側からオサエて、三々とカカリの石を分断しましょう。",
            ),
            board: H4_PINCER_33,
            toMove: BLACK,
            accept: pts([16, 3]),
            success: L(
              "白棋分成了两处，挂角子被夹在三颗黑子之间。",
              "White is split in two, and the approach stone is caught among three black stones.",
              "백이 둘로 갈라졌고, 걸친 돌은 흑돌 세 점 사이에 갇혔습니다.",
              "白は二つに分かれ、カカリの石は黒三子の間に挟まれました。",
            ),
            wrong: L(
              "挡在三三正下方，紧挨着它，也就是三三和挂角子之间。",
              "Block right below the 3-3 stone, touching it: between the 3-3 stone and the approach stone.",
              "삼삼 바로 아래에 붙여 막으세요. 삼삼과 걸친 돌 사이입니다.",
              "三々のすぐ下にくっつけてオサエましょう。三々とカカリの石の間です。",
            ),
          },
        ],
      },
      {
        id: "adv-handicap-simple",
        title: L("简明地应对打入", "Answer invasions simply", "침입에는 간명하게", "打ち込みには簡明に"),
        steps: [
          {
            kind: "place",
            text: L(
              "九子局，白棋点三三。黑棋不必想着把它杀掉：简单地挡住。上边和右边都有黑子，挡哪一边都可以。",
              "A nine-stone game, and White invades at the 3-3 point. Black need not try to kill it: just block. You have stones on the top and on the right, so either side is fine.",
              "9점 접바둑에서 백이 삼삼에 들어왔습니다. 흑은 잡으려고 애쓸 필요 없이 간단히 막으면 됩니다. 위쪽과 오른쪽에 모두 흑돌이 있으니 어느 쪽에서 막아도 좋습니다.",
              "九子局で、白が三々に入りました。黒は殺そうとしなくてよく、簡単にオサエれば十分です。上辺にも右辺にも黒石があるので、どちらからオサエても構いません。",
            ),
            board: H9_33,
            toMove: BLACK,
            accept: pts([15, 2], [16, 3]),
            success: L(
              "挡住。让白棋在角上小小地活，黑棋得到外面的厚势，和边上的让子连成一片。",
              "Blocked. Let White live small in the corner; Black's outside strength joins the handicap stones on the sides.",
              "막았습니다. 백은 귀에서 작게 살게 하고, 흑은 바깥의 두터움을 얻어 변의 치석과 이어집니다.",
              "オサエました。白は隅で小さく生かし、黒は外の厚みを得て辺の置き石とつながります。",
            ),
            wrong: L(
              "紧挨着三三的白子挡：在它的左边或下边。",
              "Block right next to the white 3-3 stone: to its left or below it.",
              "삼삼의 백돌 바로 옆, 왼쪽이나 아래에서 막으세요.",
              "三々の白石のすぐ隣、左か下でオサエましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "黑棋从上边挡，白棋沿右边爬。在白子前面扳。",
              "Black blocked on the top, and White crawls down the right side. Hane in front of the white stones.",
              "흑이 위쪽에서 막자 백이 오른쪽 변을 따라 깁니다. 백돌 앞을 젖히세요.",
              "黒が上からオサエ、白が右辺をハいました。白石の前をハネましょう。",
            ),
            board: H9_33_CRAWL,
            toMove: BLACK,
            accept: pts([16, 4]),
            success: L(
              "扳住了，白棋只能在二路找活路。",
              "The hane stops White, which can only go on along the second line.",
              "젖혀서 막았습니다. 백은 2선에서만 살 길을 찾을 수 있습니다.",
              "ハネて止めました。白は二線でしか生きる道を探せません。",
            ),
            wrong: L(
              "扳下在白子正下方，斜挨着你的星位子。",
              "The hane goes directly below the white stones, diagonally next to your star point stone.",
              "젖힘은 백돌 바로 아래, 흑 화점 돌과 대각선으로 닿는 곳입니다.",
              "ハネは白石のすぐ下、黒の星の石と斜めに接する所です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋二路扳，黑棋挡，白棋粘。轮到黑棋补断点：实连或虎口都可以。补好了，外面就是一道没有毛病的厚势。",
              "White haned on the second line, Black blocked and White connected. Now protect your cutting point, with a solid or a hanging connection. Then your outside wall has no weakness.",
              "백이 2선에서 젖히고, 흑이 막고, 백이 이었습니다. 이제 흑의 끊는 점을 지키세요. 꽉 잇기나 호구 모두 좋습니다. 그러면 바깥의 벽에 약점이 없습니다.",
              "白が二線でハネ、黒がオサエ、白が継ぎました。今度は黒の切りの点を守りましょう。カタツギでもカケツギでも構いません。これで外の壁に弱点がなくなります。",
            ),
            board: H9_33_END,
            toMove: BLACK,
            accept: pts([16, 5], [15, 5]),
            success: L(
              "简明的定式，黑棋的厚势和右边的让子配合在一起。让子棋里，不留毛病比多吃几目更重要。",
              "A simple joseki, and Black's thickness works with the handicap stone on the right side. In a handicap game, leaving no weaknesses matters more than a few extra points.",
              "간명한 정석이고, 흑의 두터움이 오른쪽 변의 치석과 호응합니다. 접바둑에서는 몇 집 더 얻는 것보다 약점을 남기지 않는 것이 중요합니다.",
              "簡明な定石で、黒の厚みが右辺の置き石と連携しています。置き碁では、数目得をするより弱点を残さないことが大切です。",
            ),
            wrong: L(
              "看最后两颗挡的黑子之间：白棋可以从那里切断。补住那个点，或者在它旁边做虎口。",
              "Look between your last two blocking stones: White could cut there. Fill that point, or make a tiger's mouth next to it.",
              "마지막에 막은 흑 두 점 사이를 보세요. 백이 그곳을 끊을 수 있습니다. 그 점을 잇거나 옆에 호구를 만드세요.",
              "最後にオサエた黒二子の間を見ましょう。白はそこを切れます。その点を継ぐか、隣にカケツギを打ちましょう。",
            ),
          },
        ],
      },
      {
        id: "adv-handicap-white",
        title: L("执白下让子棋", "Playing White in a handicap game", "백으로 두는 접바둑", "白番の置き碁"),
        steps: [
          {
            kind: "read",
            text: L(
              "执白下让子棋，白棋的子少，不能和黑棋硬拼。先在角上拿实地（A点三三），子要下得轻，被攻击时不必每颗都救；挂角（B）也可以，但要准备好被夹击时怎么办。黑棋的子多而重复时，白棋的机会就来了。",
              "As White in a handicap game you have fewer stones and cannot win by force. Take territory in the corners first (the 3-3 invasion at A) and play lightly: when your stones are attacked, you need not save every one. An approach (B) is also possible, but have an answer ready for the pincer. When Black's many stones become overconcentrated, White's chances come.",
              "백으로 접바둑을 둘 때는 돌이 적으니 힘으로 맞서면 안 됩니다. 먼저 귀에서 실리를 차지하고(A, 삼삼 침입) 가볍게 두세요. 공격받아도 모든 돌을 살릴 필요는 없습니다. 걸침(B)도 되지만 협공당했을 때의 대책을 준비해 두어야 합니다. 흑의 많은 돌이 중복되면 백에게 기회가 옵니다.",
              "白番の置き碁では石が少ないので、力ずくでは勝てません。まず隅で実利を取り（Aの三々入り）、軽く打ちましょう。攻められても、すべての石を助ける必要はありません。カカリ（B）もありますが、ハサまれたときの対策を用意しておきます。黒の多くの石が凝り形になれば、白にチャンスが来ます。",
            ),
            board: H9_EMPTY_READ,
          },
          {
            kind: "place",
            text: L(
              "九子局，你执白下第一手。点三三，先在一个角里拿实地。",
              "A nine-stone game, and you are White with the first move. Invade at a 3-3 point and take territory in a corner first.",
              "9점 접바둑에서 백의 첫 수입니다. 삼삼에 들어가 먼저 귀 하나의 실리를 차지하세요.",
              "九子局で、白の第一手です。三々に入って、まず隅の一つで実利を取りましょう。",
            ),
            board: H9_EMPTY,
            toMove: WHITE,
            accept: pts([16, 2], [2, 2], [16, 16], [2, 16]),
            success: L(
              "点三三：在黑棋最强的地方也能确保活棋，而且是实地。",
              "The 3-3 invasion: even among Black's strongest stones it is sure to live, and it is territory.",
              "삼삼 침입입니다. 흑이 가장 강한 곳에서도 확실히 살 수 있고, 실리입니다.",
              "三々入りです。黒が最も強い所でも確実に生きられ、しかも実利です。",
            ),
            wrong: L(
              "三三在任意一个角的星位斜里面，离两条边都是三路。",
              "A 3-3 point lies diagonally inside the star point of any corner, on the third line from both edges.",
              "삼삼은 어느 귀든 화점에서 대각선 안쪽, 두 변에서 모두 3선인 자리입니다.",
              "三々はどの隅でも星の斜め内側、両方の辺から三線の点です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "四子局，白棋挂角被夹击了。你执白：不要急着救挂角子，点三三拿角。",
              "A four-stone game: White's approach stone has been pincered. You are White: do not rush to save it; invade at the 3-3 point and take the corner.",
              "4점 접바둑에서 백의 걸친 돌이 협공당했습니다. 백입니다. 걸친 돌을 서둘러 살리지 말고 삼삼에 들어가 귀를 차지하세요.",
              "四子局で、白のカカリの石がハサまれました。白番です。カカリの石を急いで助けず、三々に入って隅を取りましょう。",
            ),
            board: H4_PINCER,
            toMove: WHITE,
            accept: pts([16, 2]),
            success: L(
              "点三三：即使挂角子以后被吃，角上的实地也已经到手。这就是轻灵的下法。",
              "The 3-3 invasion: even if the approach stone is captured later, the corner territory is yours. That is light play.",
              "삼삼 침입입니다. 걸친 돌이 나중에 잡히더라도 귀의 실리는 이미 손에 넣었습니다. 이것이 가벼운 수법입니다.",
              "三々入りです。カカリの石が後で取られても、隅の実利はもう手にしています。これが軽い打ち方です。",
            ),
            wrong: L(
              "三三在被挂的黑棋星位斜里面，靠角的那一点。",
              "The 3-3 point is diagonally inside the black star point you approached, toward the corner.",
              "삼삼은 걸쳤던 흑 화점에서 대각선 안쪽, 귀 쪽의 점입니다.",
              "三々はカカった黒の星の斜め内側、隅寄りの点です。",
            ),
          },
        ],
      },
    ],
  },
];
