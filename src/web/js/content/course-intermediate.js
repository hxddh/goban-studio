/**
 * The intermediate course (v5): units 9–15 (v13 adds ko fighting and judging
 * the position), appended to the beginner course
 * in ./course.js. Same step schema (read / place / problem; see course.js).
 * v6 adds two lessons to the fighting unit: the leaning attack and sabaki.
 *
 * Opening and joseki steps are drawn on a 19×19 board: a whole-board
 * diagram shows the whole board, a smaller diagram in a corner shows a
 * window around it (the app frames the diagram's '.' points, its stones,
 * its marks and every accept point). Joseki diagrams number the moves of
 * the sequence with label marks. v13: endgame steps are endgame problems
 * on sealed sides of a 19×19 board, counted exactly by the solver; the ko
 * and judgement units (14–15) play on closed 9×9 games.
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

/*
 * v13: the endgame unit is rebuilt on closed positions. Every interactive
 * step is an endgame problem (goal "endgame"): a stretch of the lower side
 * where the walls are settled and only the boundary is open, counted
 * exactly by the solver's counting mode (Japanese counting, see solver.js),
 * so the best move, its margin and every value in the text are proved by
 * scripts/check-course.mjs. ':' points are territory that is counted but
 * never played. The v5 boards were a few stones on an open 9×9, where
 * KataGo's best move was an invasion the lesson was not about
 * (docs/lesson-audit.md).
 */

// Black's wall reaches the first line, White's stops on the second: Black's sente push (1 point).
const EG_PUSH = [
  ", , , , , , , , , , ,",
  "X X X X X O O O O O O",
  "X : : : X O : : : : O",
  "X : : : X . . : : : O",
];
// White has pushed along the first line into Black's area: Black must block (gote, 7 points).
const EG_BLOCK = [
  ", , , , , , , , , , , ,",
  "X X X X X X O O O O O O",
  "X : : : : X O : : : : O",
  "X : : . . O O : : : : O",
];
// Black's sente push on the left, a gote hane on the right.
const EG_PUSH_HANE_R = [
  ", , , , , , , , , , , , ,",
  "O O O O X X X X X O O O O",
  "O : : O X : : : X O : : O",
  "O : . . X : : . . . . : O",
];
// Both walls stop on the second line: the first-line hane and connection (gote, 2 points).
const EG_HANE = [
  ", , , , , , , , , , ,",
  "X X X X X O O O O O O",
  "X : : : X O : : : : O",
  "X : : . . . . : : : O",
];
// White has played the first-line hane: Black blocks (8 points).
const EG_WHITE_HANE = [
  ", , , , , , , , , , , ,",
  "X X X X X X O O O O O O",
  "X : : : : X O : : : : O",
  "X : : : . O . . : : : O",
];
// White's wall reaches the first line: White's sente push; Black's block first is reverse sente.
const EG_WHITE_PUSH = [
  ", , , , , , , , , , ,",
  "O O O O O X X X X X X",
  "O : : : O X : : : : X",
  "O : : : O . . : : : X",
];
// White's sente push (left), Black's sente push (middle), a gote hane (right).
const EG_TWO_PUSHES = [
  ", , , , , , , , , , , , , , , , , ,",
  "O O O O X X X X X O O O O O X X X X",
  "O : : O X : : : X O : : : O X : : X",
  "O : : O . . : : X . . : . . . . : X",
];
// Double sente at (6, 3): either side's move there is atari.
const EG_DOUBLE = [
  ", , , , , , , , , , , , ,",
  "X X X X X X X O O O O O O",
  "X : : : X X O . O : : : O",
  "X : : : X X . O O : : : O",
  "X : : : X . X O O : : : O",
];
// Double sente (left) and a gote hane (right).
const EG_DOUBLE_HANE = [
  ", , , , , , , , , , , , , , ,",
  "X X X X X X O O O O O X X X X",
  "X : : X X O . O : : O X : : X",
  "X : : X X . O O : : O X : : X",
  "X : : X . X O O : . . . . : X",
];
// Both walls stop on the third line: the second-line hane (gote, 6 points).
const EG_HANE_2 = [
  ", , , , , , , , , ,",
  "X X X X X O O O O O",
  "X : : : X O : : : O",
  "X : : . . . . : : O",
  "X : : . . . . : : O",
];
// A small double sente (left) and two black stones cut off at White's wall (right).
const EG_DOUBLE_CUT = [
  ", , , , , , , , , , , , , , , , ,",
  "X X X X X X O O O O O O O X X X X",
  "X : : X X O . O : : O O O X : : X",
  "X : : X X . O O : : O X . . : : X",
  "X : : X . X O O : : O X . . : : X",
];
// A small sente push (left) and the same two cut-off stones (right).
const EG_PUSH_CUT = [
  ", , , , , , , , , , , , , ,",
  "X X X X O O O O O O X X X X",
  "X : : X O : : O O O X : : X",
  "X : : X O : : O X . . : : X",
  "X : : X . . : O X . . : : X",
];
// White's one-point push (left) and two neutral points.
const EG_ONE_POINT = [
  ", , , , , , , , , , , , , ,",
  "X X X X O O O O O O O X X X",
  "X : : X . O : : : O . X : X",
  "X : . . O O : : : O O X : X",
];
// Two neutral points: filling (4, 2) puts White's (4, 3) in atari, so White must add a stone inside.
const EG_DEFENCE = [
  ", , , , , , , , , , , , , ,",
  "X X X X O O O O O O X X X X",
  "X : : X . O : : : O . X : X",
  "X : : X O . : : : O X : : X",
];
// Cut-off stones (left), a first-line push (middle), a hane (right).
const EG_THREE = [
  ", , , , , , , , , , , , , , , ,",
  "O O O O O X X X X O O O O X X X",
  "O : O O O X : : X O : : O X : X",
  "O : O X . . : : X O : : O X : X",
  "O : O X . . : : X . . . . . : X",
];
// A second-line hane (left) and a first-line push (right).
const EG_HANE2_PUSH = [
  ", , , , , , , , , , , , ,",
  "X X X X O O O O O X X X X",
  "X : : X O : : : O X : : X",
  "X : . . . . : : O X : : X",
  "X : . . . . : : O . . : X",
];
// A sente push (left) and a gote hane (right).
const EG_PUSH_HANE = [
  ", , , , , , , , , , , , , , , ,",
  "X X X X X O O O O O O X X X X X",
  "X : : : X O : : : : O X : : : X",
  "X : : : X . . : : . . . . : : X",
];

/** An endgame problem on the lower side: the best move (`answer`) and how many points it gains over any other (`margin`). */
const egMove = (diagram, answer, margin) => ({ goal: "endgame", ask: "move", corner: "bl", diagram, answer: pts(...answer), margin });
/** A "how many points is this move worth" question (deiri count). */
const egValue = (diagram, value, choices) => ({ goal: "endgame", ask: "value", corner: "bl", diagram, value, choices });
/** The same position as an illustration (':' is just an empty point there); `stones` adds [x, y, colour]. */
function egBoard(diagram, marks = [], stones = []) {
  const g = diagram.map((r) => r.replace(/:/g, ".").split(" "));
  for (const [x, y, c] of stones) g[y][x] = c === BLACK ? "X" : "O";
  return { size: 19, corner: "bl", diagram: g.map((r) => r.join(" ")), marks };
}

/* ------------------------------------------------------ ko and judgement boards */

/*
 * v13: the ko and judgement units are played on finished-looking 9×9 games
 * (the walls of unit 8's game, every area closed), so a place step's answer
 * is the move that matters on the whole board, not a local idea on an empty
 * board. The problem steps are proved by the solver on the whole 9×9.
 */

// White has just taken the ko at (4, 4); Black may retake at (5, 4) after a
// threat. Black's threat is the cut at (5, 2): White's (5, 0)–(5, 1) then
// have two liberties and Black's (6, 1) would capture them.
const KO_ROWS = {
  0: ". . . . X O . . .",
  1: ". . . . X O . . .",
  2: ". . . X X . O . .",
  3: ". . . X X O O . .",
  4: ". . . X O . O . .",
  5: ". . . X X O . . .",
  6: ". . . X X O . . .",
  7: ". . . . X O . . .",
  8: ". . . . X O . . .",
};
// The same shape before anyone has taken: Black's capture at (5, 4) starts the ko.
const KO_FRESH_ROWS = KO_ROWS;
// Black has cut, White has connected at (6, 1): Black may retake.
const KO_ANSWERED_ROWS = { ...KO_ROWS, 1: ". . . . X O O . .", 2: ". . . X X X O . ." };
// A dead white stone inside Black's area: attacking it is no threat.
const KO_DEAD_STONE_ROWS = { ...KO_ROWS, 6: ". O . X X O . . ." };
// Black has taken the fresh ko at (5, 4) (White's (4, 4) is gone) and White, without a threat,
// has played elsewhere, at (7, 7): one stone each since KO_FRESH_ROWS. Black connects at (4, 4).
const KO_CONNECT = [
  ". . . . X O . . .",
  ". . . . X O . . .",
  ". . . X X . O . .",
  ". . . X X O O . .",
  ". . . X . x O . .",
  ". . . X X O . . .",
  ". . . X X O . . .",
  ". . . . X O . O .",
  ". . . . X O . . .",
];
// Black's retake at (5, 4) left White's (5, 5) in atari: capturing it at (6, 5) ends the ko.
const KO_CAPTURE = [
  ". . . . X O . . .",
  ". . . . X O O . .",
  ". . . X X X O . .",
  ". . . X X O O . .",
  ". . . X . X O . .",
  ". . . X X o . . .",
  ". . . X X X O . .",
  ". . . . X O O . .",
  ". . . . X O . . .",
];
// White has taken and Black has played elsewhere: White connects at (5, 4).
const KO_WHITE_CONNECT = [
  ". . . . X O . . .",
  ". . . . X O . . .",
  ". . . X X . O . .",
  ". . . X X O O . .",
  ". . . X o . O . .",
  ". . . X X O . . .",
  ". . . X X O . . .",
  ". . . . X O . . .",
  ". . . . X O . . .",
];

// Every area closed but the first-line hane at the bottom. Black 30, White 24
// (+ 6.5): Black's hane at (4, 8) wins by 0.5, White's at (3, 8) by 1.5.
const JUDGE_ROWS = {
  0: ". . . . . X O . .",
  1: ". . . . . X O . .",
  2: ". . . X X X O . .",
  3: ". . . X O O O . .",
  4: ". . . X O . . . .",
  5: ". . . X O O . . .",
  6: ". . . X X O . . .",
  7: ". . . X O O . . .",
  8: ". . . . . . . . .",
};
// Black 32, White 24 once (3, 7) is filled; White's cut there captures Black's two stones.
const JUDGE_SAFE = [
  ". . . . . X O . .",
  ". . . . . X O . .",
  ". . . X X X O . .",
  ". . . X O O O . .",
  ". . . X O . . . .",
  ". . . X O O . . .",
  ". . . X O O . . .",
  ". . . . x O . . .",
  ". . . . x O . . .",
];
// Black 34, White 22 once the two black stones at the top are connected.
const JUDGE_SAFE_TOP = [
  ". . . x O . . . .",
  ". . . x O . . . .",
  ". . X O O O O . .",
  ". . X X X X O . .",
  ". . . . . X O . .",
  ". . . . . X O . .",
  ". . . . . X O . .",
  ". . . . . X O . .",
  ". . . . . X O . .",
];
// If White connects its two stones at the top, Black 29, White 24 (+ 6.5):
// White wins by 1.5. Black's (6, 1) captures them.
const JUDGE_BEHIND = [
  ". . . . X o . . .",
  ". . . . X o . . .",
  ". . . X X X O . .",
  ". . . X O O O . .",
  ". . . X O . O . .",
  ". . . X O O . . .",
  ". . . X X O . . .",
  ". . . X O O . . .",
  ". . . X O O . . .",
];
// The same idea at the bottom (the board turned upside down).
const JUDGE_CUT = JUDGE_BEHIND.slice().reverse();

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
            board: b9({ 3: ". . . X O O . . .", 4: ". . . . X . . . .", 6: ". . . . . . O . ." }),
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
            board: b9({ 4: ". . . . . O . . .", 5: ". . . . O X X . .", 2: ". . X . . . . . ." }),
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
      "先手与后手，一路扳粘，逆收，双先，出入计算，大中小官子的比较，单官与补棋，以及官子的顺序。每道题都由解题程序精确数目证明。",
      "Sente and gote, the first-line hane and connection, reverse sente, double sente, counting a move, comparing big, middle and small endgame moves, neutral points, and the order of play. Every problem is proved by an exact count.",
      "선수와 후수, 1선 젖혀 잇기, 역끝내기, 양선수, 출입 계산, 큰 끝내기와 작은 끝내기의 비교, 공배와 손질, 그리고 끝내기 순서. 모든 문제는 정확한 계산으로 증명되어 있습니다.",
      "先手と後手、一線のハネツギ、逆ヨセ、両先手、出入り計算、大ヨセと小ヨセの比較、ダメと手入れ、そしてヨセの順番。どの問題も正確な計算で証明されています。",
    ),
    lessons: [
      {
        id: "endgame-sente-gote",
        title: L("先手与后手", "Sente and gote", "선수와 후수", "先手と後手"),
        steps: [
          {
            kind: "read",
            text: L(
              "对方必须应的一手叫先手：他应完，又轮到你。下完后对方可以脱先的一手叫后手。同样大小时，先下先手，再下后手。图中左边黑棋沿一路往白地里冲（三角），白棋要挡，是黑棋的先手；右边的一路扳（圆圈）最后要自己粘，是后手。",
              "A move the opponent has to answer is sente: after the answer it is your turn again. A move after which the opponent can play elsewhere is gote. Between moves of the same size, play sente first and gote after. On the left, Black's push along the first line into White's area (triangle) must be blocked, so it is Black's sente; on the right, the first-line hane (circle) ends with Black's own connection, so it is gote.",
              "상대가 받아야 하는 수가 선수입니다. 상대가 받으면 다시 내 차례가 됩니다. 두고 나서 상대가 다른 곳에 둘 수 있으면 후수입니다. 크기가 같으면 선수를 먼저, 후수는 나중에 둡니다. 왼쪽에서 흑이 1선으로 백집에 밀고 들어가는 수(세모)는 백이 막아야 하니 흑의 선수, 오른쪽 1선 젖힘(동그라미)은 마지막에 흑이 이어야 하니 후수입니다.",
              "相手が受けなければならない手が先手で、受けた後また自分の番になります。打った後で相手が他に打てる手は後手です。同じ大きさなら、先手を先に、後手は後で打ちます。左の、一線を白地に押し込む手（三角）は白が止めなければならないので黒の先手、右の一線のハネ（丸）は最後に黒が継ぐので後手です。",
            ),
            board: egBoard(EG_PUSH_HANE_R, [{ x: 3, y: 3, type: "triangle" }, { x: 9, y: 3, type: "circle" }]),
          },
          {
            kind: "problem",
            text: L(
              "黑先。你的墙伸到了一路，白棋的墙只到二路。沿一路冲进去：白棋必须挡，你的子已经连着，不用再补。",
              "Black to play. Your wall reaches the first line, White's stops on the second. Push along the first line: White has to block, and your stone is already connected, so you need nothing more.",
              "흑선. 흑 벽은 1선까지, 백 벽은 2선까지입니다. 1선을 따라 밀고 들어가세요. 백은 막아야 하고, 흑돌은 이미 이어져 있어 더 둘 필요가 없습니다.",
              "黒先。黒の壁は一線まで、白の壁は二線までです。一線を押し込みましょう。白は止めなければならず、黒石はもうつながっているので手入れは要りません。",
            ),
            problem: egMove(EG_PUSH, [[5, 3]], 1),
            success: L("白棋挡住后又轮到你：先手得了一目。", "After White blocks it is your turn again: a point gained in sente.", "백이 막으면 다시 흑 차례입니다. 선수로 한 집을 벌었습니다.", "白が止めると、また黒番です。先手で一目得しました。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。白棋沿一路冲进了你的地，下一手还要再冲。挡住它：这一手是后手，但不挡要亏7目。",
              "Black to play. White has pushed along the first line into your area and threatens to push again. Block it: the block is gote, but leaving it costs 7 points.",
              "흑선. 백이 1선으로 흑집에 밀고 들어왔고, 다음에 더 밀려고 합니다. 막으세요. 후수지만 막지 않으면 7집을 손해 봅니다.",
              "黒先。白が一線から黒地に押し込んできて、さらに押そうとしています。止めましょう。後手ですが、止めないと7目損します。",
            ),
            problem: egMove(EG_BLOCK, [[4, 3]], 7),
            success: L("挡住了。对方的先手，你要应。", "Blocked. The opponent's sente is yours to answer.", "막았습니다. 상대의 선수에는 받아야 합니다.", "止めました。相手の先手には受けるものです。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。左边有你的一路冲（先手），右边有一路扳粘（后手），两处都很小。先下先手：白棋挡了以后，你再去扳。",
              "Black to play. On the left you have a first-line push (sente), on the right a first-line hane and connection (gote); both are small. Play the sente move first: after White blocks, you take the hane as well.",
              "흑선. 왼쪽에는 1선 밀기(선수), 오른쪽에는 1선 젖혀 잇기(후수)가 있고, 둘 다 작습니다. 선수부터 두세요. 백이 막으면 오른쪽 젖힘까지 흑이 둡니다.",
              "黒先。左には一線の押し（先手）、右には一線のハネツギ（後手）があり、どちらも小さい所です。先手から打ちましょう。白が止めたら、右のハネも黒が打てます。",
            ),
            problem: egMove(EG_PUSH_HANE_R, [[3, 3]], 1),
            success: L("先手先下，两处都归你。", "Sente first, and both places are yours.", "선수를 먼저 두어 두 곳 모두 흑의 몫입니다.", "先手を先に打って、両方とも黒のものです。"),
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
              "双方的墙都停在二路时，一路上有扳粘：黑1扳，白2挡，黑1被打吃，黑3粘。之后轮到白棋，所以是后手。黑棋先扳粘和白棋先扳粘相比，相差2目：这一手值2目，后手。",
              "When both walls stop on the second line, there is a hane and connection on the first line: Black 1 hanes, White 2 blocks, Black 1 is in atari and Black 3 connects. Then it is White's turn, so it is gote. Compared with White doing the same first, the difference is 2 points: the move is worth 2 points, in gote.",
              "두 벽이 모두 2선에서 멈추면 1선에서 젖혀 잇기가 생깁니다. 흑 1로 젖히고 백 2로 막으면 흑 1이 단수가 되어 흑 3으로 잇습니다. 그다음은 백 차례이니 후수입니다. 백이 먼저 젖혀 잇는 것과 비교하면 2집 차이, 곧 후수 2집입니다.",
              "両方の壁が二線で止まっているときは、一線のハネツギがあります。黒1とハネ、白2とオサエると黒1がアタリなので黒3と継ぎます。次は白番なので後手です。白が先にハネツいだ場合との差は2目、つまり後手2目の手です。",
            ),
            board: egBoard(EG_HANE, labels([5, 3, "1"], [6, 3, "2"], [4, 3, "3"]), [[5, 3, BLACK], [6, 3, WHITE], [4, 3, BLACK]]),
          },
          {
            kind: "problem",
            text: L(
              "黑先。两边的墙都停在二路。在一路扳，再把扳的子粘回来。",
              "Black to play. Both walls stop on the second line. Hane on the first line, then connect the hane stone.",
              "흑선. 두 벽 모두 2선에서 멈췄습니다. 1선에서 젖히고, 젖힌 돌을 이으세요.",
              "黒先。両方の壁が二線で止まっています。一線でハネて、ハネた石を継ぎましょう。",
            ),
            problem: egMove(EG_HANE, [[5, 3]], 1),
            success: L("扳粘完成，后手2目。", "Hane and connection done: 2 points, in gote.", "젖혀 잇기를 마쳤습니다. 후수 2집입니다.", "ハネツギの完成、後手2目です。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。这次白棋先在一路扳了。挡住它：白棋要自己粘，是白棋的后手。不挡的话白棋还会再冲。",
              "Black to play. This time White has played the first-line hane first. Block it: White must connect, in gote. If you do not block, White pushes further.",
              "흑선. 이번에는 백이 먼저 1선에서 젖혔습니다. 막으세요. 백이 이어야 하니 백의 후수입니다. 막지 않으면 백이 더 밀고 들어옵니다.",
              "黒先。今度は白が先に一線でハネました。オサエましょう。白は継がなければならず、白の後手です。オサエないと白はさらに押し込んできます。",
            ),
            problem: egMove(EG_WHITE_HANE, [[4, 3]], 8),
            success: L("挡住后白子被打吃，白棋要自己粘。", "Now White's hane stone is in atari and White must connect.", "막으니 백의 젖힌 돌이 단수가 되어 백이 이어야 합니다.", "オサエると白のハネた石がアタリになり、白は継がなければなりません。"),
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
              "白棋的墙伸到了一路，沿一路冲（三角）是白棋的先手。黑棋先挡在这里，自己是后手，但白棋从此少了一个先手，这叫逆收。逆收一目，大约顶得上后手两目，常常比看起来大。",
              "White's wall reaches the first line, so the push along the first line (triangle) is White's sente. If Black blocks there first, it is gote for Black, but White has lost a sente move for good: this is reverse sente. A reverse sente of one point is worth about as much as a gote move of two, so it is often bigger than it looks.",
              "백 벽이 1선까지 내려와 있어서 1선 밀기(세모)는 백의 선수입니다. 흑이 먼저 막으면 흑은 후수지만, 백은 선수 하나를 영영 잃습니다. 이것이 역끝내기입니다. 역끝내기 1집은 후수 2집쯤의 가치가 있어서 보기보다 큰 경우가 많습니다.",
              "白の壁が一線まで来ているので、一線の押し（三角）は白の先手です。黒が先に止めれば黒の後手ですが、白は先手を一つ失います。これが逆ヨセです。逆ヨセ1目は後手2目くらいの価値があり、見た目より大きいことがよくあります。",
            ),
            board: egBoard(EG_WHITE_PUSH, [{ x: 5, y: 3, type: "triangle" }]),
          },
          {
            kind: "problem",
            text: L(
              "黑先。抢先挡在白棋要冲的地方，消掉白棋的先手。",
              "Black to play. Block first where White wants to push, and take away White's sente move.",
              "흑선. 백이 밀고 들어오려는 곳을 먼저 막아 백의 선수를 없애세요.",
              "黒先。白が押し込みたい所を先に止めて、白の先手を消しましょう。",
            ),
            problem: egMove(EG_WHITE_PUSH, [[5, 3]], 1),
            success: L("逆收：后手，但白棋少了一个先手。", "Reverse sente: gote, but White has one sente move fewer.", "역끝내기입니다. 후수지만 백의 선수가 하나 줄었습니다.", "逆ヨセです。後手ですが、白の先手が一つ減りました。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。左边白棋有一路冲的先手，中间你有一个同样大的先手，右边还有一个后手扳。先下自己的先手。",
              "Black to play. On the left White has a sente push along the first line, in the middle you have a sente push of the same size, and on the right there is a gote hane. Play your own sente first.",
              "흑선. 왼쪽에는 백의 1선 밀기 선수, 가운데에는 같은 크기의 흑 선수, 오른쪽에는 후수 젖힘이 있습니다. 흑의 선수부터 두세요.",
              "黒先。左には白の一線の押しの先手、真ん中には同じ大きさの黒の先手、右には後手のハネがあります。黒の先手から打ちましょう。",
            ),
            problem: egMove(EG_TWO_PUSHES, [[9, 3]], 1),
            success: L("先手不花代价，先下掉。", "Sente costs you nothing, so take it first.", "선수는 대가가 없으니 먼저 둡니다.", "先手は損がないので、先に打っておきます。"),
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
              "三角标记的点：黑棋下在这里打吃白子，白棋必须粘；白棋下在这里打吃黑子，黑棋必须粘。对双方都是先手，叫双先。双先不花代价就能得利，通常要早下。但先手之所以是先手，是因为对方不应就亏得更多；别处有更大的后手时，对方会不应而去下大的。",
              "The marked point: if Black plays there, a white stone is in atari and White must connect; if White plays there, a black stone is in atari and Black must connect. It is sente for both sides: double sente. It gains points at no cost, so it is usually played early. But a move is sente only because ignoring it costs more: with a bigger gote move left elsewhere, the opponent will ignore it and take that.",
              "세모 표시한 점은 흑이 두면 백 한 점이 단수가 되어 백이 이어야 하고, 백이 두면 흑 한 점이 단수가 되어 흑이 이어야 합니다. 양쪽 모두에게 선수, 곧 양선수입니다. 양선수는 대가 없이 이득을 보므로 보통 일찍 둡니다. 하지만 선수가 선수인 것은 받지 않으면 더 손해이기 때문입니다. 다른 곳에 더 큰 후수가 남아 있으면 상대는 받지 않고 큰 곳을 둡니다.",
              "三角印の点は、黒が打てば白一子がアタリで白が継がなければならず、白が打てば黒一子がアタリで黒が継がなければなりません。双方にとって先手、つまり両先手です。両先手は損なく得をするので、ふつう早めに打ちます。ただし先手が先手なのは、受けないともっと損をするからです。他にもっと大きい後手が残っていれば、相手は受けずに大きい所に回ります。",
            ),
            board: egBoard(EG_DOUBLE, [{ x: 6, y: 3, type: "triangle" }]),
          },
          {
            kind: "problem",
            text: L(
              "黑先。抢占双先：下在黑白两颗突出的子共同的那口气上。",
              "Black to play. Take the double sente point: the liberty shared by the two jutting stones, one black and one white.",
              "흑선. 양선수 자리를 차지하세요. 튀어나온 흑돌과 백돌이 함께 쓰는 활로입니다.",
              "黒先。両先手を打ちましょう。突き出た黒石と白石の共通の呼吸点です。",
            ),
            problem: egMove(EG_DOUBLE, [[6, 3]], 2),
            success: L("白子被打吃，白棋必须粘，你还保有先手。", "White's stone is in atari, White must connect, and you keep sente.", "백돌이 단수라 백은 이어야 하고, 흑은 선수를 유지합니다.", "白石がアタリなので白は継ぐしかなく、黒は先手を保ちます。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。左边有双先，右边有一路扳粘（后手2目）。先下双先，再回头扳。",
              "Black to play. There is double sente on the left and a first-line hane and connection (2 points in gote) on the right. Take the double sente, then come back for the hane.",
              "흑선. 왼쪽에 양선수, 오른쪽에 1선 젖혀 잇기(후수 2집)가 있습니다. 양선수를 두고 나서 젖힘으로 돌아오세요.",
              "黒先。左に両先手、右に一線のハネツギ（後手2目）があります。両先手を打ってから、ハネに回りましょう。",
            ),
            problem: egMove(EG_DOUBLE_HANE, [[5, 3]], 2),
            success: L("双先在先，扳粘在后。", "Double sente first, the hane after.", "양선수가 먼저, 젖혀 잇기는 나중입니다.", "両先手が先、ハネツギは後です。"),
          },
        ],
      },
      {
        id: "endgame-counting",
        title: L("这一手值几目", "How much is a move worth?", "몇 집짜리일까", "何目の手か"),
        steps: [
          {
            kind: "read",
            text: L(
              "算一手棋的大小（出入计算）：先让黑棋在这里先下，双方都走最好的应法，数出结果；再让白棋先下，再数一次。两次的差就是这一手值的目数。图中的一路扳粘，黑先比白先多2目，所以值2目，后手。",
              "To count a move (deiri counting), let Black play here first, with the best answers on both sides, and count; then let White play first and count again. The difference is what the move is worth. The first-line hane and connection here gives Black 2 points more when Black plays first, so it is worth 2 points, in gote.",
              "한 수의 크기를 세는 법(출입 계산): 흑이 먼저 여기에 두고 양쪽이 최선으로 받은 결과를 세고, 다음에 백이 먼저 둔 결과를 셉니다. 두 결과의 차이가 그 수의 크기입니다. 그림의 1선 젖혀 잇기는 흑이 먼저 두면 2집이 많으니 후수 2집입니다.",
              "一手の大きさの数え方（出入り計算）：黒が先にここに打ち、双方最善に応じた結果を数え、次に白が先に打った結果を数えます。その差が手の大きさです。図の一線のハネツギは黒が先に打つと2目多いので、後手2目です。",
            ),
            board: egBoard(EG_HANE, [{ x: 5, y: 3, type: "triangle" }]),
          },
          {
            kind: "problem",
            text: L(
              "这个一路扳粘值几目？",
              "How many points is this first-line hane and connection worth?",
              "이 1선 젖혀 잇기는 몇 집짜리일까요?",
              "この一線のハネツギは何目の手でしょう？",
            ),
            problem: egValue(EG_HANE, 2, [1, 2, 3, 4]),
            success: L("2目，后手。", "2 points, in gote.", "후수 2집입니다.", "後手2目です。"),
          },
          {
            kind: "read",
            text: L(
              "有的书把后手官子除以二（见合计算，这个扳粘就是1目），先手官子不除；两种算法比较大小的结论一样。本应用一律用出入，所以记住：目数相同，先手大约顶得上两倍的后手。",
              "Some books halve gote moves (miai counting: this hane would be 1 point) and leave sente moves whole; both ways compare moves the same. This app always uses the full difference, so remember: for the same count, a sente move is worth about twice a gote move.",
              "어떤 책은 후수 끝내기를 반으로 나누고(미아이 계산, 이 젖혀 잇기는 1집) 선수 끝내기는 그대로 둡니다. 어느 쪽으로 세어도 크기 비교의 결론은 같습니다. 이 앱은 언제나 출입 차이를 쓰므로, 같은 집수라면 선수가 후수의 두 배쯤 된다고 기억하세요.",
              "後手のヨセを半分にし（見合い計算、このハネツギなら1目）、先手のヨセはそのままにする本もありますが、大きさを比べた結論は同じです。このアプリはいつも出入りの差を使うので、同じ目数なら先手は後手の倍くらいの価値があると覚えておきましょう。",
            ),
            board: egBoard(EG_HANE, [{ x: 5, y: 3, type: "triangle" }]),
          },
          {
            kind: "problem",
            text: L(
              "这个一路冲值几目？它是黑棋的先手：白棋先下的话，就是在这里挡。",
              "How many points is this first-line push worth? It is Black's sente; if White plays first, White simply blocks here.",
              "이 1선 밀기는 몇 집짜리일까요? 흑의 선수입니다. 백이 먼저 두면 여기를 막습니다.",
              "この一線の押しは何目の手でしょう？黒の先手です。白が先なら、ここを止めます。",
            ),
            problem: egValue(EG_PUSH, 1, [1, 2, 3]),
            success: L("1目，先手。", "1 point, in sente.", "선수 1집입니다.", "先手1目です。"),
          },
          {
            kind: "problem",
            text: L(
              "这次两边的墙停在三路，扳粘在二路。值几目？",
              "This time both walls stop on the third line, so the hane and connection is on the second line. How many points is it worth?",
              "이번에는 두 벽이 3선에서 멈춰서 젖혀 잇기가 2선에서 생깁니다. 몇 집짜리일까요?",
              "今度は両方の壁が三線で止まっているので、ハネツギは二線です。何目の手でしょう？",
            ),
            problem: egValue(EG_HANE_2, 6, [3, 4, 6, 8]),
            success: L("6目：二路的扳粘是一路的三倍。", "6 points: three times the first-line hane.", "6집: 1선 젖혀 잇기의 세 배입니다.", "6目：一線のハネツギの三倍です。"),
          },
        ],
      },
      {
        id: "endgame-big",
        title: L("官子的大小", "Big, middle and small endgame", "끝내기의 크기", "ヨセの大きさ"),
        steps: [
          {
            kind: "read",
            text: L(
              "官子大致分三级：大官子（十目以上，比如救回被切断的子、三路的大边界），中官子（几目，比如二路扳粘），小官子（一两目，比如一路扳粘和冲），最后是单官。图中右边两颗黑子（圆圈）被切断了，救回来是十几目的后手，属于大官子。",
              "Endgame moves come roughly in three sizes: big (ten points or more, such as rescuing stones that have been cut off, or a large border on the third line), middle (a few points, such as a second-line hane), and small (one or two points, such as first-line hanes and pushes); neutral points come last. On the right, two black stones (circles) have been cut off: rescuing them is a big gote move, well over ten points.",
              "끝내기는 대략 세 가지 크기로 나뉩니다. 큰 끝내기(10집 이상, 예를 들어 끊긴 돌을 살리는 수나 3선의 큰 경계), 중간 크기의 끝내기(몇 집, 예를 들어 2선 젖혀 잇기), 작은 끝내기(1~2집, 예를 들어 1선 젖혀 잇기와 밀기), 그리고 마지막이 공배입니다. 그림 오른쪽에서 흑 두 점(동그라미)이 끊겼습니다. 이를 살리는 수는 10집이 훨씬 넘는 후수, 곧 큰 끝내기입니다.",
              "ヨセはおおよそ三つの大きさに分かれます。大ヨセ（10目以上。切り離された石を助ける手や三線の大きな境界など）、中くらいのヨセ（数目。二線のハネツギなど）、小ヨセ（1、2目。一線のハネツギや押しなど）、そして最後がダメです。図の右では黒二子（丸）が切り離されています。これを助けるのは10目を大きく超える後手で、大ヨセです。",
            ),
            board: egBoard(EG_DOUBLE_CUT, [{ x: 11, y: 3, type: "circle" }, { x: 11, y: 4, type: "circle" }]),
          },
          {
            kind: "problem",
            text: L(
              "黑先。左边有一个小双先，右边你的两颗子被切断了。比较一下，下最大的一手。",
              "Black to play. There is a small double sente on the left, and two of your stones have been cut off on the right. Compare, and play the biggest move.",
              "흑선. 왼쪽에 작은 양선수가 있고, 오른쪽에서는 흑 두 점이 끊겼습니다. 비교해서 가장 큰 수를 두세요.",
              "黒先。左に小さな両先手、右では黒二子が切り離されています。比べて、一番大きい手を打ちましょう。",
            ),
            problem: egMove(EG_DOUBLE_CUT, [[12, 3]], 5),
            success: L("救回两颗子：大的后手比小的双先重要。", "The two stones are back: a big gote move beats a small double sente.", "두 점을 살렸습니다. 큰 후수가 작은 양선수보다 중요합니다.", "二子を助けました。大きい後手は小さい両先手より大事です。"),
          },
          {
            kind: "read",
            text: L(
              "先手和双先，要对方真的非应不可才能先下。看它的后续：对方不应时你能得到的，如果比别处最大的后手还小，对方就会脱先。所以左边2目的双先（三角）要让位给救子。",
              "A sente or double sente move comes first only if the opponent really has to answer. Look at what it threatens: if what you would gain when it is ignored is smaller than the biggest gote move elsewhere, the opponent will ignore it. That is why the 2-point double sente on the left (triangle) had to wait for the rescue.",
              "선수나 양선수는 상대가 정말 받아야 할 때만 먼저입니다. 그 뒤를 보세요. 상대가 받지 않을 때 내가 얻는 것이 다른 곳의 가장 큰 후수보다 작으면 상대는 받지 않습니다. 그래서 왼쪽의 2집짜리 양선수(세모)는 돌을 살리는 수 다음이었습니다.",
              "先手や両先手が先になるのは、相手が本当に受けなければならないときだけです。その後を見ましょう。相手が受けなかったときに得られるものが他の一番大きい後手より小さければ、相手は受けません。だから左の2目の両先手（三角）は、石を助ける手の後でした。",
            ),
            board: egBoard(EG_DOUBLE_CUT, [{ x: 5, y: 3, type: "triangle" }]),
          },
          {
            kind: "problem",
            text: L(
              "黑先。左边有一个一路冲（先手1目），右边两颗子被切断。白棋不会去应那个冲，而会来吃你的子。你先救。",
              "Black to play. On the left there is a first-line push (1 point in sente), on the right the two cut-off stones. White would not answer the push: White would capture your stones instead. Rescue them first.",
              "흑선. 왼쪽에는 1선 밀기(선수 1집), 오른쪽에는 끊긴 두 점이 있습니다. 백은 밀기에 받지 않고 흑돌을 잡으러 올 것입니다. 먼저 살리세요.",
              "黒先。左には一線の押し（先手1目）、右には切り離された二子があります。白は押しには受けず、黒石を取りに来ます。先に助けましょう。",
            ),
            problem: egMove(EG_PUSH_CUT, [[9, 3]], 6),
            success: L("小先手可以留着，大后手不能让。", "The small sente can wait; the big gote cannot.", "작은 선수는 남겨 둘 수 있지만, 큰 후수는 양보할 수 없습니다.", "小さい先手は残しておけますが、大きい後手は譲れません。"),
          },
        ],
      },
      {
        id: "endgame-japanese-counting",
        title: L("小官子与单官", "Small endgame and neutral points", "작은 끝내기와 공배", "小ヨセとダメ"),
        steps: [
          {
            kind: "read",
            text: L(
              "日本规则：双方停一手以后拿掉死子，提子填进对方的地，再数目。单官不算目，但也要填完。中国规则用数子法，每个单官都算一个子，见“数子法”一课。",
              "Under Japanese rules, after both players pass, dead stones are removed, prisoners are placed in the opponent's territory, and territory is counted. Neutral points are worth nothing, but they are all filled. Chinese rules use area scoring, where every neutral point is worth a point; see the lesson on area scoring.",
              "일본 규칙에서는 두 사람이 패스한 뒤 사석을 들어내고, 따낸 돌을 상대 집에 메운 다음 계가합니다. 공배는 집이 아니지만 모두 메웁니다. 중국 규칙은 계자(수 세기)로, 공배 하나하나가 한 점입니다. '계자' 강의를 보세요.",
              "日本ルールでは、双方パスの後、死に石を取り上げ、アゲハマを相手の地に埋めて整地します。ダメは目になりませんが、すべて詰めます。中国ルールは計子で、ダメも一つ一目になります。「計子」の課を見てください。",
            ),
            board: egBoard(EG_DEFENCE, [{ x: 4, y: 2, type: "circle" }, { x: 10, y: 2, type: "circle" }]),
          },
          {
            kind: "problem",
            text: L(
              "黑先。白棋可以从左边沿一路冲进来，这是一目的官子；另外还有两个单官。先挡住冲，单官最后再填。",
              "Black to play. White can push along the first line on the left, a one-point endgame move; two neutral points are also left. Block the push first and fill neutral points last.",
              "흑선. 백은 왼쪽에서 1선으로 밀고 들어올 수 있습니다. 1집짜리 끝내기입니다. 공배도 둘 남아 있습니다. 밀기를 먼저 막고, 공배는 마지막에 메우세요.",
              "黒先。白は左から一線を押し込めます。1目のヨセです。ダメも二つ残っています。押しを先に止め、ダメは最後に詰めましょう。",
            ),
            problem: egMove(EG_ONE_POINT, [[3, 3]], 1),
            success: L("一目也是目，单官放到最后。", "A point is a point; neutral points come last.", "한 집도 집입니다. 공배는 마지막입니다.", "一目も目のうち。ダメは最後です。"),
          },
          {
            kind: "read",
            text: L(
              "有的单官很特别：填上以后，对方的子被打吃，对方必须在自己地里补一手（补棋），少一目。普通的单官填不填都一样。所以收单官时，先填会逼对方补棋的那个。",
              "Some neutral points are special. Filling one can put an enemy stone in atari, so that the opponent must add a defensive stone inside their own territory, which costs them a point; filling an ordinary one changes nothing. So fill the neutral point that forces a defensive move first.",
              "특별한 공배도 있습니다. 메우면 상대 돌이 단수가 되어, 상대가 자기 집 안에 손질을 해야 하고 한 집이 줄어드는 공배입니다. 보통의 공배는 메워도 아무 일이 없습니다. 그러니 손질을 강요하는 공배부터 메우세요.",
              "特別なダメもあります。詰めると相手の石がアタリになり、相手は自分の地の中に手入れが必要で一目減る、というダメです。ふつうのダメは詰めても何も起きません。だから、手入れを強いるダメから詰めましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑先。只剩两个单官。哪一个会逼白棋在自己地里补一手？先填那一个。",
              "Black to play. Only two neutral points are left. Which one forces White to add a stone inside its territory? Fill that one first.",
              "흑선. 공배가 둘만 남았습니다. 어느 쪽이 백에게 자기 집 안의 손질을 강요할까요? 그곳을 먼저 메우세요.",
              "黒先。ダメが二つだけ残っています。どちらが白に地の中の手入れを強いるでしょう？そちらを先に詰めましょう。",
            ),
            problem: egMove(EG_DEFENCE, [[4, 2]], 1),
            success: L("白棋只好补棋，你多得一目。", "White has to defend, and you gain a point.", "백이 손질할 수밖에 없어 한 집을 더 얻었습니다.", "白は手入れするしかなく、一目得しました。"),
          },
        ],
      },
      {
        id: "endgame-order",
        title: L("官子的顺序", "Endgame order", "끝내기 순서", "ヨセの順番"),
        steps: [
          {
            kind: "problem",
            text: L(
              "黑先。三处官子：左边两颗子被切断（大官子），中间有一个一路冲，右边有一个一路扳。从最大的下起。",
              "Black to play. Three endgame spots: two stones cut off on the left (big endgame), a first-line push in the middle and a first-line hane on the right. Start with the biggest.",
              "흑선. 끝내기가 세 곳입니다. 왼쪽에 끊긴 두 점(큰 끝내기), 가운데에 1선 밀기, 오른쪽에 1선 젖힘이 있습니다. 가장 큰 곳부터 두세요.",
              "黒先。ヨセが三か所あります。左に切り離された二子（大ヨセ）、真ん中に一線の押し、右に一線のハネ。一番大きい所から打ちましょう。",
            ),
            problem: egMove(EG_THREE, [[4, 3]], 7),
            success: L("大官子在先。", "Big endgame first.", "큰 끝내기가 먼저입니다.", "大ヨセが先です。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。左边有二路的扳粘（中官子，后手6目），右边白棋有一路冲的先手，先去挡是逆收，只值1目，大约相当于后手2目。下二路扳。",
              "Black to play. On the left there is a second-line hane (middle endgame, 6 points in gote); on the right White has a sente push along the first line, and blocking it first is a reverse sente worth 1 point, about a 2-point gote move. Play the second-line hane.",
              "흑선. 왼쪽에는 2선 젖혀 잇기(중간 크기, 후수 6집)가 있고, 오른쪽에는 백의 1선 밀기 선수가 있습니다. 그것을 먼저 막는 역끝내기는 1집, 후수 2집쯤입니다. 2선에서 젖히세요.",
              "黒先。左には二線のハネツギ（中くらいのヨセ、後手6目）、右には白の一線の押しの先手があります。それを先に止める逆ヨセは1目、後手2目くらいです。二線でハネましょう。",
            ),
            problem: egMove(EG_HANE2_PUSH, [[4, 3]], 1),
            success: L("后手6目比逆收1目大。", "A 6-point gote move beats a 1-point reverse sente.", "후수 6집이 역끝내기 1집보다 큽니다.", "後手6目は逆ヨセ1目より大きいのです。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。只剩小官子：左边一个一路冲（先手），右边一个一路扳（后手）。大小差不多时，先手先下。",
              "Black to play. Only small moves are left: a first-line push on the left (sente) and a first-line hane on the right (gote). When the sizes are close, sente comes first.",
              "흑선. 작은 끝내기만 남았습니다. 왼쪽 1선 밀기(선수)와 오른쪽 1선 젖힘(후수). 크기가 비슷하면 선수가 먼저입니다.",
              "黒先。小ヨセだけが残っています。左の一線の押し（先手）と右の一線のハネ（後手）。大きさが近ければ先手が先です。",
            ),
            problem: egMove(EG_PUSH_HANE, [[5, 3]], 1),
            success: L("大、中、小，再加上先手优先：这就是官子的顺序。", "Big, middle, small, and sente first among equals: that is the order of the endgame.", "큰 것, 중간, 작은 것, 그리고 비슷하면 선수 먼저. 이것이 끝내기 순서입니다.", "大、中、小、そして同じくらいなら先手から。これがヨセの順番です。"),
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
  /* ======================================================== UNIT 14 (v13) */
  {
    id: "ko-fighting",
    level: "intermediate",
    title: L("打劫", "Ko fighting", "패싸움", "コウ争い"),
    summary: L(
      "什么是劫材，对方必须应的劫材，数劫材决定何时开劫，缓气劫的道理，以及怎样消劫：粘劫或提子。",
      "What a ko threat is, threats the opponent must answer, counting threats to decide when to start a ko, the idea of an approach ko, and how to end a ko: connect or capture.",
      "팻감이란 무엇인가, 상대가 받아야 하는 팻감, 팻감을 세어 패를 걸 때를 정하기, 늘어진 패의 원리, 그리고 패를 끝내는 법: 잇기와 따내기.",
      "コウダテとは何か、相手が受けなければならないコウダテ、コウダテを数えてコウを仕掛ける時を決めること、ヨセコウの考え方、そしてコウの解消：継ぐか取るか。",
    ),
    lessons: [
      {
        id: "ko-threat",
        title: L("劫材", "Ko threats", "팻감", "コウダテ"),
        steps: [
          {
            kind: "read",
            text: L(
              "白棋刚在中间提了劫（三角是黑棋想提回的点）。按规则，黑棋不能马上提回，必须先在别处下一手。如果这一手厉害到白棋必须应，白棋应了以后，黑棋就可以提回：这样的一手叫劫材。这里黑棋在上边切断（圆圈），威胁吃掉白棋两颗子，就是劫材。",
              "White has just taken the ko in the middle (the triangle is where Black would like to take back). By the rules Black may not retake at once; Black must play elsewhere first. If that move is so strong that White has to answer it, Black can retake after the answer: such a move is a ko threat. Here Black's cut at the top (circle), threatening to capture two white stones, is a ko threat.",
              "백이 방금 가운데에서 패를 따냈습니다(세모는 흑이 되따내고 싶은 곳). 규칙상 흑은 바로 되따낼 수 없고, 먼저 다른 곳에 한 수를 두어야 합니다. 그 수가 백이 받지 않을 수 없을 만큼 강하면, 백이 받은 뒤 흑이 되따낼 수 있습니다. 이런 수를 팻감이라고 합니다. 여기서는 위쪽에서 끊어 백 두 점을 잡겠다고 위협하는 수(동그라미)가 팻감입니다.",
              "白が真ん中でコウを取ったところです（三角は黒が取り返したい点）。ルールで黒はすぐには取り返せず、まず他に一手打たなければなりません。その手が白の受けなければならないほど厳しければ、白が受けた後に黒は取り返せます。このような手がコウダテです。ここでは上で切って白二子を取ろうとする手（丸）がコウダテです。",
            ),
            board: { ...b9(KO_ROWS), marks: [{ x: 5, y: 4, type: "triangle" }, { x: 5, y: 2, type: "circle" }] },
          },
          {
            kind: "place",
            text: L(
              "白棋刚提了劫，你不能马上提回。先找一个白棋必须应的劫材：切断上边的两颗白子。",
              "White has just taken the ko and you may not retake at once. First find a threat White must answer: cut off the two white stones at the top.",
              "백이 방금 패를 따내서 바로 되따낼 수 없습니다. 먼저 백이 받아야 하는 팻감을 찾으세요. 위쪽 백 두 점을 끊으세요.",
              "白がコウを取ったばかりで、すぐには取り返せません。まず白が受けなければならないコウダテを探しましょう。上の白二子を切りましょう。",
            ),
            board: b9(KO_ROWS),
            toMove: BLACK,
            accept: pts([5, 2]),
            success: L("白棋不应，你就吃掉两颗子，冲进右上的白地。", "If White does not answer, you capture two stones and break into White's upper right.", "백이 받지 않으면 두 점을 잡고 오른쪽 위 백집으로 뚫고 들어갑니다.", "白が受けなければ二子を取って、右上の白地に入り込めます。"),
            wrong: L(
              "提回是犯规的。下在上边两颗白子和下面白墙之间的断点上。",
              "Retaking is against the rules. Play on the cutting point between the two white stones at the top and the white wall below them.",
              "되따내기는 반칙입니다. 위쪽 백 두 점과 그 아래 백 벽 사이의 끊는 점에 두세요.",
              "取り返すのは反則です。上の白二子とその下の白の壁の間の切りの点に打ちましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋粘上应了你的劫材。现在可以提回劫了。",
              "White has connected to answer your threat. Now you may take the ko back.",
              "백이 이어서 팻감을 받았습니다. 이제 패를 되따낼 수 있습니다.",
              "白が継いでコウダテに受けました。これでコウを取り返せます。",
            ),
            board: b9(KO_ANSWERED_ROWS),
            toMove: BLACK,
            accept: pts([5, 4]),
            success: L("提回了。现在轮到白棋找劫材。", "Retaken. Now it is White who needs a threat.", "되따냈습니다. 이제 백이 팻감을 찾아야 합니다.", "取り返しました。今度は白がコウダテを探す番です。"),
            wrong: L(
              "提掉夹在黑子中间、只剩一口气的那颗白子。",
              "Capture the white stone wedged between your stones with one liberty left.",
              "흑돌 사이에 끼어 활로가 하나 남은 백돌을 따내세요.",
              "黒石の間にはさまれ、呼吸点が一つの白石を取りましょう。",
            ),
          },
        ],
      },
      {
        id: "ko-threat-answer",
        title: L("必须应的劫材", "Threats that must be answered", "받아야 하는 팻감", "受けなければならないコウダテ"),
        steps: [
          {
            kind: "read",
            text: L(
              "劫材要让对方不应就亏得比劫更多。去吃一颗本来就死了的子，或者只威胁一两目，对方会干脆不应，把劫粘掉。反过来，对方下了劫材，你要比较：不应的损失比劫大，就应；比劫小，就消劫。",
              "A ko threat must make ignoring it cost more than the ko is worth. Attacking a stone that is already dead, or threatening a point or two, lets the opponent simply ignore you and end the ko. The other way round, when the opponent plays a threat, compare: if ignoring it costs more than the ko, answer it; if less, end the ko.",
              "팻감은 상대가 받지 않으면 패보다 더 큰 손해를 보게 하는 수여야 합니다. 이미 죽은 돌을 공격하거나 한두 집만 위협하면 상대는 받지 않고 패를 이어 버립니다. 반대로 상대가 팻감을 쓰면 비교하세요. 받지 않을 때의 손해가 패보다 크면 받고, 작으면 패를 해소합니다.",
              "コウダテは、受けないと相手がコウより大きく損をする手でなければなりません。もう死んでいる石を攻めたり、一、二目を狙うだけの手なら、相手は受けずにコウを解消してしまいます。逆に相手がコウダテを打ったら比べましょう。受けないときの損がコウより大きければ受け、小さければコウを解消します。",
            ),
          },
          {
            kind: "place",
            text: L(
              "白棋又提了劫。你的地里有一颗白子，它已经活不了。去打吃它不是劫材，白棋会不理。找真正的劫材。",
              "White has taken the ko again. There is a white stone inside your area that cannot live. Attacking it is not a threat; White would ignore it. Find the real threat.",
              "백이 다시 패를 따냈습니다. 흑집 안에 살 수 없는 백돌이 하나 있습니다. 그것을 단수치는 것은 팻감이 아니어서 백은 무시합니다. 진짜 팻감을 찾으세요.",
              "白がまたコウを取りました。黒地の中に生きられない白石が一つあります。それをアタリにしてもコウダテにならず、白は無視します。本当のコウダテを探しましょう。",
            ),
            board: b9(KO_DEAD_STONE_ROWS),
            toMove: BLACK,
            accept: pts([5, 2]),
            success: L("切断威胁到两颗活子和右上的地，白棋必须应。", "The cut threatens two living stones and the upper right: White has to answer.", "끊기는 살아 있는 두 점과 오른쪽 위 집을 위협하므로 백은 받아야 합니다.", "切りは生きている二子と右上の地を狙うので、白は受けなければなりません。"),
            wrong: L(
              "死子不用管。切断上边的两颗白子。",
              "Leave the dead stone alone. Cut off the two white stones at the top.",
              "죽은 돌은 그냥 두세요. 위쪽 백 두 점을 끊으세요.",
              "死に石は放っておきましょう。上の白二子を切りましょう。",
            ),
          },
          {
            kind: "place",
            text: L(
              "你执白。你提了劫，黑棋在上边切断作劫材。不应的话要丢两颗子和右上的地，比这个劫大得多。应：把两颗子连回去。",
              "You are White. You took the ko, and Black has cut at the top as a threat. Ignoring it would cost two stones and the upper right, far more than this ko. Answer it: connect the two stones.",
              "백입니다. 패를 따냈더니 흑이 위쪽에서 끊어 팻감을 썼습니다. 받지 않으면 두 점과 오른쪽 위 집을 잃어 이 패보다 훨씬 큽니다. 받으세요. 두 점을 이으세요.",
              "白番です。コウを取ったら、黒が上で切ってコウダテを打ちました。受けなければ二子と右上の地を失い、このコウよりずっと大きい損です。受けましょう。二子をつなぎましょう。",
            ),
            board: b9({ ...KO_ROWS, 2: ". . . X X X O . ." }),
            toMove: WHITE,
            accept: pts([6, 1]),
            success: L("应了劫材，劫还在，轮到黑棋提回。", "Threat answered. The ko goes on, and Black may retake.", "팻감을 받았습니다. 패는 계속되고 흑이 되따낼 차례입니다.", "コウダテに受けました。コウは続き、黒が取り返す番です。"),
            wrong: L(
              "两颗白子只剩两口气。在它们旁边粘上，和下面的白子连成一块。",
              "The two white stones have only two liberties left. Connect next to them, joining them to the white stones below.",
              "백 두 점은 활로가 둘뿐입니다. 그 옆에 이어서 아래 백돌과 하나로 만드세요.",
              "白二子は呼吸点が二つしかありません。その横に継いで、下の白石とつなげましょう。",
            ),
          },
        ],
      },
      {
        id: "ko-count",
        title: L("数劫材：什么时候开劫", "Counting threats: when to start a ko", "팻감 세기: 언제 패를 걸까", "コウダテを数える：いつコウを仕掛けるか"),
        steps: [
          {
            kind: "read",
            text: L(
              "开劫之前先数劫材：双方各有几个对方必须应的劫材？劫材多的一方打得赢，劫材少的一方最好别开劫，或者先去消掉对方的劫材。这里的劫还没开始，黑棋有上边的切断（圆圈）一个劫材，白棋一个也没有，黑棋可以放心提（三角）。",
              "Before starting a ko, count threats: how many threats the opponent must answer does each side have? The side with more threats wins the ko; the side with fewer should not start it, or should first remove the opponent's threats. Here the ko has not started: Black has one threat, the cut at the top (circle), and White has none, so Black can take (triangle) with confidence.",
              "패를 걸기 전에 팻감을 세세요. 상대가 받아야 하는 팻감이 양쪽에 몇 개씩 있습니까? 팻감이 많은 쪽이 패를 이기고, 적은 쪽은 패를 걸지 않거나 먼저 상대의 팻감을 없애는 것이 좋습니다. 여기서는 아직 패가 시작되지 않았습니다. 흑은 위쪽 끊기(동그라미)라는 팻감이 하나 있고 백은 하나도 없으니, 흑은 안심하고 따낼(세모) 수 있습니다.",
              "コウを仕掛ける前にコウダテを数えましょう。相手が受けなければならないコウダテが、それぞれいくつあるでしょうか。コウダテの多い方がコウに勝ち、少ない方は仕掛けないか、先に相手のコウダテを消しておくのがよいのです。ここではコウはまだ始まっていません。黒には上の切り（丸）というコウダテが一つあり、白には一つもないので、黒は安心して取れます（三角）。",
            ),
            board: { ...b9(KO_FRESH_ROWS), marks: [{ x: 5, y: 4, type: "triangle" }, { x: 5, y: 2, type: "circle" }] },
          },
          {
            kind: "place",
            text: L(
              "劫还没开始。你有一个劫材，白棋一个也没有。开劫：提掉那颗白子。",
              "The ko has not started yet. You have a threat and White has none. Start the ko: capture the white stone.",
              "패는 아직 시작되지 않았습니다. 흑은 팻감이 하나 있고 백은 없습니다. 패를 거세요. 백돌을 따내세요.",
              "コウはまだ始まっていません。黒にはコウダテが一つあり、白にはありません。コウを仕掛けましょう。白石を取りましょう。",
            ),
            board: b9(KO_FRESH_ROWS),
            toMove: BLACK,
            accept: pts([5, 4]),
            success: L("白棋找不到劫材，这个劫是你的。", "White has no threat to play: this ko is yours.", "백은 쓸 팻감이 없으니 이 패는 흑의 것입니다.", "白には打つコウダテがないので、このコウは黒のものです。"),
            wrong: L(
              "提掉夹在黑子中间、只剩一口气的那颗白子。",
              "Capture the white stone wedged between your stones with one liberty left.",
              "흑돌 사이에 끼어 활로가 하나 남은 백돌을 따내세요.",
              "黒石の間にはさまれ、呼吸点が一つの白石を取りましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑先。你提了劫，白棋没有劫材，下在了别处。马上把劫粘掉，让它不再是劫。",
              "Black to play. You took the ko; White had no threat and played elsewhere. End the ko now by connecting, so it is no longer a ko.",
              "흑선. 흑이 패를 따냈고, 백은 팻감이 없어 다른 곳에 두었습니다. 지금 이어서 패를 끝내세요.",
              "黒先。黒がコウを取り、白はコウダテがなくて他に打ちました。今すぐ継いで、コウを解消しましょう。",
            ),
            problem: { goal: "save", size: 9, diagram: KO_CONNECT },
            success: L("劫粘掉了。劫材多，劫就是你的。", "The ko is over. More threats, and the ko was yours.", "패를 이었습니다. 팻감이 많으면 패는 내 것입니다.", "コウを解消しました。コウダテが多ければ、コウは自分のものです。"),
          },
          {
            kind: "read",
            text: L(
              "还有一种劫叫缓气劫：要提的子还有一口外气，必须先紧一口气才能提。紧气要多花一手，等于少了一个劫材，所以缓气劫对需要紧气的一方很不利。",
              "There is also the approach ko: the stone you want to capture still has an outside liberty, so you must fill that liberty before you can take. The extra move is like being one threat short, so an approach ko is a heavy handicap for the side that must approach.",
              "늘어진 패라는 것도 있습니다. 따내려는 돌에 바깥 활로가 하나 더 있어서, 먼저 그 활로를 메워야 따낼 수 있는 패입니다. 한 수를 더 써야 하니 팻감이 하나 모자란 것과 같아서, 메워야 하는 쪽이 크게 불리합니다.",
              "ヨセコウというコウもあります。取りたい石にもう一つ外側の呼吸点があり、先にそれをふさがないと取れないコウです。一手余計にかかるのはコウダテが一つ足りないのと同じで、詰める側がたいへん不利です。",
            ),
          },
        ],
      },
      {
        id: "ko-resolve",
        title: L("消劫：粘还是提", "Ending a ko: connect or capture", "패 해소: 잇기냐 따내기냐", "コウの解消：継ぐか取るか"),
        steps: [
          {
            kind: "read",
            text: L(
              "打赢了劫，要找机会把它消掉，否则对方找到劫材还会再打。最常见的是粘劫：把对方要提回的那个点填上。有时还有更好的办法：如果围着劫的对方棋子气紧了，直接提掉它们，劫消失了，还多吃了子。消劫之前先看一眼有没有可以提的子。",
              "Once you have won a ko, end it when you can; otherwise the opponent will start it again as soon as a threat turns up. The usual way is to connect: fill the point where the opponent would take back. Sometimes there is something better: if the opponent's stones around the ko are short of liberties, capture them. The ko disappears, and you have taken stones as well. Before you connect, look for stones you can capture.",
              "패를 이겼으면 기회를 봐서 해소하세요. 그렇지 않으면 상대가 팻감을 찾는 대로 다시 패를 겁니다. 가장 흔한 방법은 패를 잇는 것, 곧 상대가 되따낼 점을 메우는 것입니다. 더 좋은 방법이 있을 때도 있습니다. 패를 둘러싼 상대 돌의 활로가 모자라면 그 돌을 따내세요. 패가 없어지고 돌까지 잡습니다. 잇기 전에 따낼 돌이 있는지 먼저 보세요.",
              "コウに勝ったら、機会を見て解消しましょう。そうしないと、相手はコウダテが見つかり次第またコウを仕掛けてきます。ふつうはコウを継ぎます。相手が取り返す点を埋めるのです。もっとよい方法があることもあります。コウを囲む相手の石の呼吸点が少なければ、それを取ってしまいましょう。コウはなくなり、石も取れます。継ぐ前に、取れる石がないか見ましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑先。白棋没有提回，下在了别处。这次不用粘：提劫时有一颗白子被打吃了，提掉它，劫就没有了。",
              "Black to play. White did not take back and played elsewhere. You need not connect this time: when you took the ko, a white stone was left in atari. Capture it and the ko is gone.",
              "흑선. 백은 되따내지 않고 다른 곳에 두었습니다. 이번에는 이을 필요가 없습니다. 패를 따낼 때 백 한 점이 단수가 되었으니, 그것을 따내면 패가 없어집니다.",
              "黒先。白は取り返さずに他に打ちました。今回は継ぐ必要はありません。コウを取ったとき白一子がアタリになったので、それを取ればコウはなくなります。",
            ),
            problem: { goal: "capture", size: 9, diagram: KO_CAPTURE },
            success: L("提子消劫，比粘更好。", "Capturing ends the ko, and it is better than connecting.", "따내서 패를 해소했습니다. 잇기보다 좋습니다.", "取ってコウを解消しました。継ぐよりよい手です。"),
          },
          {
            kind: "problem",
            text: L(
              "白先。你提了劫，黑棋没有劫材，下在了别处。把劫粘上，消掉它。",
              "White to play. You took the ko; Black had no threat and played elsewhere. Connect and end the ko.",
              "백선. 백이 패를 따냈고, 흑은 팻감이 없어 다른 곳에 두었습니다. 패를 이어 해소하세요.",
              "白先。白がコウを取り、黒はコウダテがなくて他に打ちました。コウを継いで解消しましょう。",
            ),
            problem: { goal: "save", size: 9, diagram: KO_WHITE_CONNECT },
            success: L("粘上了，这个劫结束了。", "Connected; this ko is over.", "이었습니다. 이 패는 끝났습니다.", "継ぎました。このコウは終わりです。"),
          },
        ],
      },
    ],
  },
  /* ======================================================== UNIT 15 (v13) */
  {
    id: "judgement",
    level: "intermediate",
    title: L("形势判断", "Judging the position", "형세 판단", "形勢判断"),
    summary: L(
      "在棋局中途数一数：双方各有多少地，加上贴目谁领先；领先时稳健，落后时找机会。",
      "Counting in the middle of a game: how much territory each side has, who is ahead once komi is added, and how to play when you are ahead or behind.",
      "대국 중에 집을 세어 보기: 양쪽 집이 얼마인지, 덤을 더하면 누가 앞서는지, 앞설 때와 뒤질 때 어떻게 둘지.",
      "対局の途中で数えてみる：双方の地はいくつか、コミを足すとどちらがリードしているか、リードしているときと遅れているときの打ち方。",
    ),
    lessons: [
      {
        id: "judge-count",
        title: L("数一数，谁领先", "Count: who is ahead?", "세어 보기: 누가 앞서나", "数えてみる：どちらがリードか"),
        steps: [
          {
            kind: "read",
            text: L(
              "形势判断就是在棋局中途数地。先数已经围好的地：这里左边黑地30目，右边白地24目，再给白棋加上贴目6目半。只剩下边一处一路扳粘没下。黑棋扳到的话，黑31目对白24目加6目半，黑胜半目；白棋扳到的话，黑30目对白25目加6目半，白胜1目半。这一手决定胜负。",
              "Judging the position means counting in the middle of the game. First count the territory that is already closed: Black has 30 points on the left, White 24 on the right plus 6.5 points of komi. Only the first-line hane and connection at the bottom is left. If Black plays it, it is 31 against 24 + 6.5: Black wins by half a point. If White plays it, 30 against 25 + 6.5: White wins by 1.5. This one move decides the game.",
              "형세 판단은 대국 중에 집을 세는 것입니다. 먼저 이미 다 지은 집을 셉니다. 여기서는 왼쪽 흑집이 30집, 오른쪽 백집이 24집이고, 백은 덤 6집 반을 받습니다. 아래쪽 1선 젖혀 잇기 하나만 남았습니다. 흑이 두면 흑 31집 대 백 24집+6집 반으로 흑의 반집승, 백이 두면 흑 30집 대 백 25집+6집 반으로 백의 1집 반 승입니다. 이 한 수가 승부를 가릅니다.",
              "形勢判断とは、対局の途中で地を数えることです。まず、もう囲い終わった地を数えます。ここでは左の黒地が30目、右の白地が24目で、白にはコミ6目半があります。残っているのは下の一線のハネツギだけです。黒が打てば黒31目対白24目＋6目半で黒の半目勝ち、白が打てば黒30目対白25目＋6目半で白の1目半勝ちです。この一手が勝負を決めます。",
            ),
            board: b9(JUDGE_ROWS),
          },
          {
            kind: "place",
            text: L(
              "黑先。数过了：这一手决定胜负。在下边一路扳。",
              "Black to play. You have counted: this move decides the game. Hane on the first line at the bottom.",
              "흑선. 세어 보았듯이 이 한 수가 승부를 가릅니다. 아래쪽 1선에서 젖히세요.",
              "黒先。数えた通り、この一手が勝負を決めます。下の一線でハネましょう。",
            ),
            board: b9(JUDGE_ROWS),
            toMove: BLACK,
            accept: pts([4, 8]),
            success: L("扳粘之后黑31目，白24目加6目半：黑胜半目。", "After the hane and connection: Black 31, White 24 + 6.5. Black wins by half a point.", "젖혀 이은 뒤 흑 31집, 백 24집+6집 반. 흑의 반집승입니다.", "ハネツギの後は黒31目、白24目＋6目半。黒の半目勝ちです。"),
            wrong: L(
              "斜挨着你二路的子、紧贴白墙的一路上的点。",
              "The first-line point diagonally below your second-line stone, touching White's wall.",
              "흑의 2선 돌과 대각선이면서 백 벽에 붙은 1선의 점입니다.",
              "黒の二線の石と斜めで、白の壁に接する一線の点です。",
            ),
          },
          {
            kind: "place",
            text: L(
              "这次你执白，同一个局面。你先扳就赢1目半。",
              "This time you are White in the same position. Hane first and you win by 1.5.",
              "이번에는 같은 국면에서 백입니다. 먼저 젖히면 1집 반 이깁니다.",
              "今度は同じ局面で白番です。先にハネれば1目半勝ちです。",
            ),
            board: b9(JUDGE_ROWS),
            toMove: WHITE,
            accept: pts([3, 8]),
            success: L("贴目让很小的差别也能决定胜负。", "With komi, even a tiny difference decides the game.", "덤이 있어서 아주 작은 차이도 승부를 가릅니다.", "コミがあるので、ほんの少しの差でも勝負が決まります。"),
            wrong: L(
              "从白墙一侧扳：斜挨着你二路的子、紧贴黑墙的一路上的点。",
              "Hane from White's side: the first-line point diagonally below your second-line stone, touching Black's wall.",
              "백 쪽에서 젖히세요. 백의 2선 돌과 대각선이면서 흑 벽에 붙은 1선의 점입니다.",
              "白の側からハネましょう。白の二線の石と斜めで、黒の壁に接する一線の点です。",
            ),
          },
        ],
      },
      {
        id: "judge-ahead",
        title: L("领先时求稳", "Ahead: play safe", "앞설 때는 안전하게", "リードしたら手堅く"),
        steps: [
          {
            kind: "read",
            text: L(
              "数完地以后再决定怎么下。领先时不需要冒险：补好自己的毛病，让对方没有翻盘的机会，多抢一两目不如稳稳当当。落后时则相反，按部就班地收官只会输得少一点，要找能改变局面的一手：攻击对方的弱棋，或者吃掉切断你的子。",
              "Decide how to play after you have counted. When you are ahead there is no need to take risks: mend your weaknesses and leave the opponent no way back; it is better than grabbing a point or two more. When you are behind it is the other way round: ordinary endgame moves only make you lose by less, so look for a move that changes the game, such as an attack on a weak group or capturing stones that cut you.",
              "집을 세고 나서 어떻게 둘지 정합니다. 앞서고 있다면 모험할 필요가 없습니다. 자기 약점을 보강해서 상대에게 역전의 기회를 주지 마세요. 한두 집 더 버는 것보다 낫습니다. 뒤지고 있다면 반대입니다. 평범한 끝내기로는 덜 지는 것뿐이니, 상대의 약한 돌을 공격하거나 끊고 있는 돌을 잡는 것처럼 판을 바꿀 수를 찾으세요.",
              "数え終わってから打ち方を決めます。リードしているなら冒険は要りません。自分の弱点を補強して、相手に逆転の機会を与えないことです。一、二目多く取るよりそのほうがよいのです。遅れているなら逆です。ふつうのヨセでは負けが少し減るだけなので、相手の弱い石を攻める、切っている石を取るといった、局面を変える手を探しましょう。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑先。数一数：盘面黑32目，白24目，加上贴目黑棋还领先1目半。但下边两颗黑子有毛病：白棋在它们左上一断就能吃掉。领先时先补好。",
              "Black to play. Count: Black has 32 points on the board, White 24, so Black is still ahead by 1.5 after komi. But your two stones at the bottom have a weakness: a white cut above and to the left of them would capture them. When you are ahead, mend it first.",
              "흑선. 세어 보면 흑 32집, 백 24집으로 덤을 빼도 흑이 1집 반 앞섭니다. 하지만 아래쪽 흑 두 점에 약점이 있어서, 백이 그 왼쪽 위를 끊으면 잡힙니다. 앞설 때는 먼저 보강하세요.",
              "黒先。数えると黒32目、白24目で、コミを引いても黒が1目半リードしています。でも下の黒二子には弱点があり、白にその左上を切られると取られます。リードしているときは先に補強しましょう。",
            ),
            problem: { goal: "save", size: 9, diagram: JUDGE_SAFE },
            success: L("补好了，半点机会也不给白棋。", "Mended: White has no way back.", "보강했으니 백에게 역전의 기회가 없습니다.", "補強したので、白に逆転の機会はありません。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。黑棋盘面34目，白棋22目，领先5目半。上边两颗黑子被白棋夹住，只剩两口气，白棋一打吃就跑不掉。不要贪别处，先救它们。",
              "Black to play. Black has 34 points on the board and White 22: you lead by 5.5. Your two stones at the top are squeezed by White and have two liberties; one white atari and they cannot escape. Do not reach for anything else: save them first.",
              "흑선. 흑 34집, 백 22집으로 5집 반 앞서 있습니다. 위쪽 흑 두 점이 백에게 끼어 활로가 둘뿐이라, 백이 단수치면 도망갈 수 없습니다. 다른 곳을 탐내지 말고 먼저 살리세요.",
              "黒先。黒34目、白22目で5目半リードしています。上の黒二子は白にはさまれて呼吸点が二つしかなく、白にアタリされると逃げられません。他を欲張らず、先に助けましょう。",
            ),
            problem: { goal: "save", size: 9, diagram: JUDGE_SAFE_TOP },
            success: L("连回来了。领先时，每一块棋都要安全。", "Connected. When you are ahead, keep every group safe.", "이었습니다. 앞설 때는 모든 돌을 안전하게.", "つながりました。リードしているときは、どの石も安全に。"),
          },
        ],
      },
      {
        id: "judge-behind",
        title: L("落后时找机会", "Behind: look for a chance", "뒤질 때는 기회를 찾아서", "遅れたらチャンスを探す"),
        steps: [
          {
            kind: "read",
            text: L(
              "落后的一方，普通的官子赢不回来。先数清楚差多少，再在棋盘上找能弥补差距的地方：对方没补的断点、气紧的子、还没活干净的棋。找到了就果断下，没有把握时也要选能把局面搅乱的下法，而不是安安静静输掉。",
              "When you are behind, ordinary endgame moves will not win the game back. First count how far behind you are, then look for something that can make up the difference: a cutting point the opponent has not mended, stones short of liberties, a group that is not quite alive. When you find it, play it without hesitation; when you are not sure, still choose a move that complicates the game rather than losing quietly.",
              "뒤지고 있는 쪽은 평범한 끝내기로는 따라잡을 수 없습니다. 먼저 얼마나 뒤지는지 정확히 세고, 그 차이를 메울 수 있는 곳을 판에서 찾으세요. 상대가 보강하지 않은 끊는 점, 활로가 모자란 돌, 아직 완전히 살지 않은 돌입니다. 찾으면 망설이지 말고 두세요. 확신이 없을 때도 조용히 지기보다 판을 복잡하게 만드는 수를 고르세요.",
              "遅れている側は、ふつうのヨセでは追いつけません。まずどれだけ遅れているかをきちんと数え、その差を埋められる所を盤上で探しましょう。相手が補強していない切りの点、呼吸点の少ない石、まだ完全には生きていない石です。見つけたら迷わず打ちましょう。確信がなくても、静かに負けるより局面を複雑にする手を選ぶことです。",
            ),
          },
          {
            kind: "problem",
            text: L(
              "黑先。数一数：如果白棋把上边两颗子连回去，盘面黑29目，白24目，加上贴目白胜1目半。但这两颗白子已经被你切断，只剩两口气。吃掉它们，局面就翻过来了。",
              "Black to play. Count: if White gets the two stones at the top back home, Black has 29 points and White 24, and White wins by 1.5 with komi. But you have already cut those two stones off and they have only two liberties. Capture them and the game turns around.",
              "흑선. 세어 보면 백이 위쪽 두 점을 이어 가면 흑 29집, 백 24집으로 덤까지 백의 1집 반 승입니다. 하지만 그 두 점은 이미 흑에게 끊겨 활로가 둘뿐입니다. 잡으면 판이 뒤집힙니다.",
              "黒先。数えると、白が上の二子をつなげば黒29目、白24目で、コミを入れて白の1目半勝ちです。でもその二子はもう黒に切られていて、呼吸点が二つしかありません。取れば形勢は逆転します。",
            ),
            problem: { goal: "capture", size: 9, diagram: JUDGE_BEHIND },
            success: L("吃掉两颗子，右上的白地也破了：黑棋反超。", "Two stones captured and White's upper right broken: Black is now ahead.", "두 점을 잡고 오른쪽 위 백집도 깨졌습니다. 흑이 역전했습니다.", "二子を取り、右上の白地も破れました。黒の逆転です。"),
          },
          {
            kind: "problem",
            text: L(
              "黑先。又是落后的局面，这次是下边的两颗白子被你切断了，只剩两口气。别急着收官，先把它们吃掉。",
              "Black to play. You are behind again; this time it is the two white stones at the bottom that you have cut off, and they have two liberties. Do not rush into the endgame: capture them first.",
              "흑선. 또 뒤진 국면입니다. 이번에는 아래쪽 백 두 점이 흑에게 끊겨 활로가 둘뿐입니다. 서둘러 끝내기를 하지 말고 먼저 잡으세요.",
              "黒先。また遅れている局面です。今度は下の白二子が黒に切られていて、呼吸点が二つしかありません。ヨセを急がず、先に取りましょう。",
            ),
            problem: { goal: "capture", size: 9, diagram: JUDGE_CUT },
            success: L("抓住对方的毛病，才有翻盘的机会。", "Punishing a weakness is how you come back.", "상대의 약점을 찌르는 것이 역전의 길입니다.", "相手の弱点を突くことが逆転への道です。"),
          },
        ],
      },
    ],
  },
];
