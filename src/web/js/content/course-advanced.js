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
const BOUNDARY_MARKED = full(FOUR_BLACK, FOUR_WHITE, { marks: labels([9, 3, "A"], [3, 9, "B"]) });
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

/* ---------------------------------------------------------------- units */

export const ADVANCED = [
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
              "四个角都守住了。左边夹在黑棋两个角之间，右边夹在白棋两个角之间，上边和下边则在黑角和白角之间。A这样的点，既从自己的角拆开，又阻止对方从角上拆过来，一手棋起两个作用。B只是扩大黑棋已经占优的一边：白棋夹在黑棋两个坚固的角之间很难安顿，所以B通常可以先放一放。一般来说，双方都想拆的那条边最大。",
              "All four corners are enclosed. The left side lies between Black's two corners, the right side between White's, and the top and bottom between a black and a white corner. A point like A extends from your corner and also stops the opponent extending from theirs: one move does two jobs. B only adds to a side where Black is already stronger; a white stone there would sit between two solid black corners and have a hard time, so Black can usually leave B for later. As a rule, the side that both players want to extend along is the biggest.",
              "네 귀가 모두 굳혀졌습니다. 왼쪽 변은 흑의 두 귀 사이, 오른쪽 변은 백의 두 귀 사이, 위와 아래 변은 흑 귀와 백 귀 사이에 있습니다. A 같은 자리는 내 귀에서 벌리면서 상대가 자기 귀에서 벌리는 것도 막습니다. 한 수가 두 가지 일을 하는 셈입니다. B는 흑이 이미 강한 변을 넓힐 뿐입니다. 백이 그곳에 들어와도 튼튼한 흑의 두 귀 사이에서 고생하므로, 흑은 보통 B를 나중으로 미룰 수 있습니다. 대체로 양쪽이 모두 벌리고 싶은 변이 가장 큽니다.",
              "四隅ともシマリが打たれています。左辺は黒の二つの隅の間、右辺は白の二つの隅の間、上辺と下辺は黒の隅と白の隅の間です。Aのような点は、自分の隅から開くと同時に、相手が隅から開くのも止めます。一手で二つの仕事をします。Bは黒がすでに優勢な辺を広げるだけです。白がそこに来ても堅い黒の二つの隅に挟まれて苦労するので、黒はふつうBを後回しにできます。一般に、両方が開きたい辺がいちばん大きいのです。",
            ),
            board: BOUNDARY_MARKED,
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
              "Black has a thick wall on the left side, and White has lived low inside it. There is a white stone on the top side. If Black presses it from the wall's side (B), White extends into the open space to the right. If Black pincers from the other side (A), the white stone is caught between the wall and the pincer, with no room for a base. Thickness is best used for attacking, and an attack usually drives the opponent toward your thickness.",
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
];
