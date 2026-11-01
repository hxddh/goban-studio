/**
 * The first course: twelve small, playable lessons.
 *
 * A lesson is a position plus a line. The learner plays the moves whose
 * colour is `toMove`; the app answers with the other colour from the line.
 * Positions and solutions are data, so a translation never changes the Go.
 */
import { Game } from "../rules.js";
import { TSUMEGO } from "./tsumego.js";

const L = (zh, en, ko, ja) => ({ zh, en, ko, ja });
const s = (x, y, c) => ({ x, y, c });

const CORE_LESSONS = [
  {
    id: "first-stone",
    title: L("第一手：天元", "First stone: the centre", "첫 수: 천원", "第一手：天元"),
    text: L(
      "黑棋先下。把第一颗子放在棋盘中央的天元。",
      "Black plays first. Put the first stone on the centre point, tengen.",
      "흑이 먼저 둡니다. 첫 돌을 바둑판 중앙의 천원에 놓으세요.",
      "黒から打ちます。最初の石を碁盤中央の天元に置きましょう。",
    ),
    hint: L("天元是正中央的交叉点。", "Tengen is the very centre intersection.", "천원은 정중앙 교차점입니다.", "天元は中央の交点です。"),
    size: 9,
    setup: [],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 4 }],
  },
  {
    id: "capture-corner",
    title: L("提子：角上", "Capture: in the corner", "따내기: 귀", "取り：隅"),
    text: L(
      "白子在角上只剩一口气。下在黑子旁边，把它提掉。",
      "The white stone in the corner has one liberty left. Play beside it to capture.",
      "귀의 백돌은 활로가 하나 남았습니다. 옆에 두어 따내세요.",
      "隅の白石は呼吸点が一つ。隣に打って取ります。",
    ),
    hint: L("落在白子下方。", "Play below the white stone.", "백돌 아래에 두세요.", "白石の下に打ちます。"),
    size: 9,
    setup: [s(0, 0, -1), s(1, 0, 1)],
    toMove: 1,
    line: [{ c: 1, x: 0, y: 1 }],
  },
  {
    id: "capture-side",
    title: L("提子：边上", "Capture: on the side", "따내기: 변", "取り：辺"),
    text: L(
      "白子在边上只有两口气，黑子已经堵住一边。落子提掉它。",
      "The white stone on the side has two liberties; Black blocks one. Capture it.",
      "변의 백돌은 활로가 둘입니다. 흑이 한쪽을 막았으니 따내세요.",
      "辺の白石は呼吸点が二つ。黒が片方を塞いでいます。取ってください。",
    ),
    hint: L("落在白子下方。", "Play below the white stone.", "백돌 아래에 두세요.", "白石の下に打ちます。"),
    size: 9,
    setup: [s(4, 0, -1), s(3, 0, 1), s(5, 0, 1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 1 }],
  },
  {
    id: "capture-centre",
    title: L("提子：中央", "Capture: in the centre", "따내기: 중앙", "取り：中央"),
    text: L(
      "白子被三颗黑子围住。下在最后一口气上。",
      "Three black stones surround the white stone. Play its last liberty.",
      "흑 세 돌이 백돌을 둘러쌌습니다. 마지막 활로에 두세요.",
      "黒三石が白石を囲んでいます。最後の呼吸点に打ちます。",
    ),
    hint: L("白子下方是最后一口气。", "The last liberty is below the white stone.", "마지막 활로는 백돌 아래입니다.", "最後の呼吸点は白石の下です。"),
    size: 9,
    setup: [s(4, 4, -1), s(3, 4, 1), s(5, 4, 1), s(4, 3, 1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 5 }],
  },
  {
    id: "capture-two",
    title: L("提子：两颗子", "Capture: two stones", "따내기: 두 돌", "取り：二子"),
    text: L(
      "两颗白子连在一起。它们共享一口气，落子把这一口气填上。",
      "Two white stones share one liberty. Fill it to capture both.",
      "백 두 돌이 활로 하나를 함께 씁니다. 그곳을 채워 따내세요.",
      "白二子が呼吸点を一つ共有しています。そこを埋めて取ります。",
    ),
    hint: L("两子下方。", "Below the pair.", "두 돌 아래입니다.", "二子の下です。"),
    size: 9,
    setup: [s(4, 4, -1), s(4, 5, -1), s(3, 4, 1), s(5, 4, 1), s(3, 5, 1), s(5, 5, 1), s(4, 3, 1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 6 }],
  },
  {
    id: "atari",
    title: L("打吃", "Atari", "단수", "アタリ"),
    text: L(
      "让白子只剩一口气，这叫打吃。下在白子上方。",
      "Leave the white stone with one liberty: that is atari. Play above it.",
      "백돌의 활로를 하나로 줄이는 것이 단수입니다. 위에 두세요.",
      "白石の呼吸点を一つにするのがアタリです。上に打ちます。",
    ),
    hint: L("白子上方。", "Above the white stone.", "백돌 위입니다.", "白石の上です。"),
    size: 9,
    setup: [s(4, 4, -1), s(3, 4, 1), s(5, 4, 1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 3 }],
  },
  {
    id: "save",
    title: L("长气", "Extend", "늘리기", "延び"),
    text: L(
      "黑子只剩一口气。往下长一手，给自己更多气。",
      "The black stone has one liberty. Extend downward for more liberties.",
      "흑돌의 활로가 하나입니다. 아래로 늘려 활로를 늘리세요.",
      "黒石の呼吸点が一つ。下に延びて呼吸点を増やします。",
    ),
    hint: L("黑子下方。", "Below the black stone.", "흑돌 아래입니다.", "黒石の下です。"),
    size: 9,
    setup: [s(4, 4, 1), s(3, 4, -1), s(5, 4, -1), s(4, 3, -1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 5 }],
  },
  {
    id: "connect",
    title: L("连接", "Connect", "연결", "つなぎ"),
    text: L(
      "两颗黑子斜着相望。下在中间，把它们连成一块。",
      "Two black stones sit diagonally. Play between them to connect.",
      "흑 두 돌이 대각선으로 떨어져 있습니다. 사이에 두어 연결하세요.",
      "黒二子が斜めに向かい合っています。間に打ってつなぎます。",
    ),
    hint: L("落在两颗黑子之间。", "Play between the two black stones.", "두 흑돌 사이에 두세요.", "黒二子の間に打ちます。"),
    size: 9,
    setup: [s(4, 4, 1), s(5, 5, 1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 5 }],
  },
  {
    id: "cut",
    title: L("切断", "Cut", "끊기", "切り"),
    text: L(
      "两颗白子之间有一个空点。占住它，把它们分开。",
      "There is one empty point between two white stones. Take it to cut.",
      "백 두 돌 사이에 빈 점이 하나 있습니다. 그곳을 차지해 끊으세요.",
      "白二子の間に空点が一つ。そこを占めて分断します。",
    ),
    hint: L("两颗白子中间。", "The point between the white stones.", "백 두 돌 사이입니다.", "白二子の間です。"),
    size: 9,
    setup: [s(3, 4, -1), s(5, 4, -1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 4 }],
  },
  {
    id: "eye",
    title: L("做眼", "Make an eye", "눈 만들기", "眼を作る"),
    text: L(
      "黑棋围住了一个空点，但还缺一角。补上缺口，做出眼。",
      "Black surrounds an empty point but one corner is open. Close it to make an eye.",
      "흑이 빈 점을 둘러쌌지만 한 귀퉁이가 비었습니다. 막아 눈을 만드세요.",
      "黒が空点を囲んでいますが、一角が空いています。塞いで眼を作ります。",
    ),
    hint: L("补上右下角的缺口。", "Close the lower-right gap.", "오른쪽 아래 빈 곳을 막으세요.", "右下の隙間を塞ぎます。"),
    size: 9,
    setup: [s(3, 3, 1), s(4, 3, 1), s(5, 3, 1), s(3, 4, 1), s(5, 4, 1), s(3, 5, 1), s(4, 5, 1)],
    toMove: 1,
    line: [{ c: 1, x: 5, y: 5 }],
  },
  {
    id: "territory",
    title: L("围地", "Surround territory", "집 만들기", "地を囲う"),
    text: L(
      "黑棋围出一块空地，还差右下角。补上它，这块地就完整了。",
      "Black has surrounded an area but the lower-right corner is open. Close it.",
      "흑이 빈 곳을 둘러쌌지만 오른쪽 아래가 비었습니다. 막아 집을 완성하세요.",
      "黒が空地を囲んでいますが、右下が空いています。塞いで地を完成させます。",
    ),
    hint: L("补上右下角。", "Close the lower-right corner.", "오른쪽 아래를 막으세요.", "右下を塞ぎます。"),
    size: 9,
    setup: [s(2, 2, 1), s(3, 2, 1), s(4, 2, 1), s(5, 2, 1), s(2, 3, 1), s(5, 3, 1), s(2, 4, 1), s(5, 4, 1), s(2, 5, 1), s(3, 5, 1), s(4, 5, 1)],
    toMove: 1,
    line: [{ c: 1, x: 5, y: 5 }],
  },
  {
    id: "star",
    title: L("开局：先占角", "Opening: corners first", "포석: 귀부터", "布石：隅から"),
    text: L(
      "空棋盘上，角上的星位最容易围地。下在左上星位。",
      "On an empty board the corner star point is easiest to surround. Play the upper-left star.",
      "빈 바둑판에서는 귀의 화점이 집을 만들기 쉽습니다. 왼쪽 위 화점에 두세요.",
      "空の碁盤では隅の星が地を作りやすい。左上の星に打ちます。",
    ),
    hint: L("左上角，从边数第四条线。", "Upper-left, fourth line from each edge.", "왼쪽 위, 변에서 네 번째 선입니다.", "左上、辺から四本目です。"),
    size: 13,
    setup: [],
    toMove: 1,
    line: [{ c: 1, x: 3, y: 3 }],
  },
  {
    id: "capture-pair-side",
    title: L("提子：边上一对", "Capture: a pair on the side", "따내기: 변의 두 돌", "取り：辺の二子"),
    text: L(
      "两颗白子在边上只剩最后一口气。把这一口气填上，两颗一起提掉。",
      "Two white stones on the side have one liberty left. Fill it to capture both.",
      "변의 백 두 돌에 활로가 하나 남았습니다. 그곳을 채워 두 돌을 함께 따내세요.",
      "辺の白二子の呼吸点は一つ。そこを埋めて二子とも取ります。",
    ),
    hint: L("两子右边是最后一口气。", "The last liberty is to the right of the pair.", "두 돌 오른쪽이 마지막 활로입니다.", "二子の右が最後の呼吸点です。"),
    size: 9,
    setup: [s(4, 0, -1), s(4, 1, -1), s(3, 0, 1), s(3, 1, 1), s(4, 2, 1), s(5, 0, 1)],
    toMove: 1,
    line: [{ c: 1, x: 5, y: 1 }],
  },
  {
    id: "atari-side",
    title: L("打吃：从侧面", "Atari: from the side", "단수: 옆에서", "アタリ：横から"),
    text: L(
      "白子在左边，只有两口气。下在它下方，把气减到一口，形成打吃。",
      "The white stone is on the left side with two liberties. Play below it to leave one liberty and make atari.",
      "백돌이 왼쪽 변에 있고 활로가 둘입니다. 아래에 두어 하나로 줄이면 단수입니다.",
      "白石が左辺にあり、呼吸点は二つ。下に打って一つにすればアタリです。",
    ),
    hint: L("白子下方。", "Below the white stone.", "백돌 아래입니다.", "白石の下です。"),
    size: 9,
    setup: [s(0, 4, -1), s(0, 3, 1)],
    toMove: 1,
    line: [{ c: 1, x: 0, y: 5 }],
  },
  {
    id: "ko-capture",
    title: L("劫：提回一子", "Ko: capture the stone", "패: 돌 따내기", "コウ：石を取る"),
    text: L(
      "这是劫的形状。黑棋先提掉中间的白子；白棋不能马上提回。",
      "This is a ko shape. Black captures the white stone in the middle; White may not recapture immediately.",
      "패의 모양입니다. 흑이 가운데 백돌을 따내고, 백은 곧바로 되따낼 수 없습니다.",
      "コウの形です。黒が中央の白石を取り、白はすぐには取り返せません。",
    ),
    hint: L("下在白子右边，提掉它。", "Play to the right of the white stone.", "백돌 오른쪽에 두어 따내세요.", "白石の右に打って取ります。"),
    size: 9,
    setup: [s(1, 1, -1), s(0, 1, 1), s(1, 0, 1), s(1, 2, 1), s(3, 1, -1), s(2, 0, -1), s(2, 2, -1)],
    toMove: 1,
    line: [{ c: 1, x: 2, y: 1 }],
  },
  {
    id: "hane",
    title: L("扳：贴住对方", "Hane: turn at the contact", "젖히기: 붙은 돌 옆에서", "ハネ：接触点で曲がる"),
    text: L(
      "黑子和白子贴在一起。下在白子左边，扳住它的头。",
      "A black and a white stone are in contact. Play to the left of the white stone to hane.",
      "흑과 백이 맞붙어 있습니다. 백돌 왼쪽에 두어 머리를 젖히세요.",
      "黒と白が接触しています。白石の左に打ってハネます。",
    ),
    hint: L("白子左边。", "To the left of the white stone.", "백돌 왼쪽입니다.", "白石の左です。"),
    size: 9,
    setup: [s(4, 4, 1), s(4, 3, -1)],
    toMove: 1,
    line: [{ c: 1, x: 3, y: 4 }],
  },
  {
    id: "one-space-jump",
    title: L("一间跳：轻快出头", "One-space jump: light extension", "한 칸 뜀: 가볍게 나아가기", "一間跳び：軽く進む"),
    text: L(
      "黑棋已经有两颗子。往上跳一格，保持联络又走得轻快。",
      "Black has two stones. Jump one space upward to stay connected and move lightly.",
      "흑돌 두 개가 있습니다. 위로 한 칸 뛰어 연결을 지키며 가볍게 나아가세요.",
      "黒二子があります。上へ一間跳んで連絡を保ち、軽く進みます。",
    ),
    hint: L("从上方黑子再往上跳一格。", "Jump one empty point above the upper stone.", "위쪽 흑돌에서 한 칸 위로 뜨세요.", "上の黒石から一間上へ跳びます。"),
    size: 9,
    setup: [s(2, 2, 1), s(2, 3, 1)],
    toMove: 1,
    line: [{ c: 1, x: 2, y: 5 }],
  },
  {
    id: "peep",
    title: L("刺：试探联络", "Peep: test the connection", "찌르기: 연결 시험", "ノゾキ：連絡を試す"),
    text: L(
      "两颗白子之间有一个空点。下在那里刺一下，看白棋怎么应。",
      "There is an empty point between two white stones. Peep there and see how White answers.",
      "백 두 돌 사이에 빈 점이 있습니다. 그곳을 찔러 백의 응수를 보세요.",
      "白二子の間に空点があります。そこにノゾいて白の応手を見ます。",
    ),
    hint: L("两颗白子中间。", "Between the two white stones.", "백 두 돌 사이입니다.", "白二子の間です。"),
    size: 9,
    setup: [s(4, 3, -1), s(4, 5, -1)],
    toMove: 1,
    line: [{ c: 1, x: 4, y: 4 }],
  },
  {
    id: "approach",
    title: L("挂角：靠近星位", "Approach: near the star", "접근: 화점 옆", "カカリ：星のそば"),
    text: L(
      "白棋占了左上星位。黑棋从右边靠近它，这一手叫挂角。",
      "White has the upper-left star. Black approaches from the right; this is a corner approach.",
      "백이 왼쪽 위 화점을 차지했습니다. 흑이 오른쪽에서 다가가는 수가 걸침입니다.",
      "白が左上の星にいます。黒は右から近づきます。これがカカリです。",
    ),
    hint: L("白子右边。", "To the right of the white stone.", "백돌 오른쪽입니다.", "白石の右です。"),
    size: 9,
    setup: [s(2, 2, -1)],
    toMove: 1,
    line: [{ c: 1, x: 3, y: 2 }],
  },
  {
    id: "endgame-close",
    title: L("官子：补上缺口", "Endgame: close the gap", "끝내기: 빈 곳 메우기", "ヨセ：隙間を塞ぐ"),
    text: L(
      "黑棋的地盘还差右下角一个缺口。补上它，实地就完整了。",
      "Black's area still has one gap in the lower-right. Close it to finish the territory.",
      "흑의 집에 오른쪽 아래 빈 곳이 하나 있습니다. 막아 실지를 완성하세요.",
      "黒地の右下に隙間が一つ。塞いで地を完成させます。",
    ),
    hint: L("补上右下角。", "Close the lower-right gap.", "오른쪽 아래를 막으세요.", "右下の隙間を塞ぎます。"),
    size: 9,
    setup: [s(1, 1, 1), s(2, 1, 1), s(3, 1, 1), s(1, 2, 1), s(3, 2, 1), s(1, 3, 1), s(2, 3, 1)],
    toMove: 1,
    line: [{ c: 1, x: 3, y: 3 }],
  },
];

const READING_TEXT = {
  capture: {
    zh: "找出白棋最后一口气，一手提掉它。",
    en: "Find White's last liberty and capture the group in one move.",
    ko: "백 돌의 마지막 활로를 찾아 한 수로 따내세요.",
    ja: "白の最後の呼吸点を見つけ、一手で取ります。",
  },
  atari: {
    zh: "找出让白棋只剩一口气的要点，形成打吃。",
    en: "Find the point that leaves White with one liberty and makes atari.",
    ko: "백의 활로를 하나로 줄이는 곳을 찾아 단수를 만드세요.",
    ja: "白の呼吸点を一つにする急所を見つけ、アタリにします。",
  },
  save: {
    zh: "找出黑棋唯一的出路，把自己的棋救出来。",
    en: "Find Black's only way out and save the group.",
    ko: "흑의 유일한 활로를 찾아 돌을 살리세요.",
    ja: "黒の唯一の逃げ道を見つけ、石を救います。",
  },
  connect: {
    zh: "找出连接两颗黑棋的要点，让它们连成一块。",
    en: "Find the point that connects the two black stones.",
    ko: "두 흑돌을 연결하는 곳을 찾으세요.",
    ja: "二つの黒石をつなぐ点を見つけます。",
  },
  cut: {
    zh: "占住白棋之间的空点，把白棋分开。",
    en: "Take the point between the white stones and cut them apart.",
    ko: "백 돌 사이의 빈 점을 차지해 백을 끊으세요.",
    ja: "白の間の空点を占めて分断します。",
  },
};

const READING_SUFFIX = {
  zh: " · 读棋",
  en: " · Reading",
  ko: " · 수읽기",
  ja: " · 読み",
};

/**
 * Forty reading-practice lessons drawn from distinct positions in the drill
 * bank. They are deliberately labelled as reading practice, not as forty
 * additional authored lectures; the same verified positions are also
 * available as spaced-review puzzles.
 *
 * A reading lesson must not silently repeat a foundation lesson: the course
 * count is real only if every one of its sixty cards opens a different
 * position. Positions introduced above are therefore removed from the pool.
 */
function positionKey(item) {
  return `size:${item.size}|` + item.setup
    .map((stone) => `${stone.x},${stone.y},${stone.c}`)
    .sort()
    .join("|") + ":" + item.toMove;
}

function readingLessons(target) {
  const excluded = new Set(CORE_LESSONS.map(positionKey));
  const seen = new Set();
  const picked = [];
  for (const puzzle of TSUMEGO) {
    const key = positionKey(puzzle);
    if (excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    picked.push(puzzle);
    if (picked.length >= target) break;
  }
  return picked.map((puzzle, index) => {
    const n = String(index + 1).padStart(2, "0");
    const base = READING_TEXT[puzzle.kind] || READING_TEXT.capture;
    return {
      id: `reading-${n}`,
      title: Object.fromEntries(Object.keys(puzzle.title).map((lang) => [lang, puzzle.title[lang] + READING_SUFFIX[lang] + " " + n])),
      text: base,
      hint: puzzle.hint,
      size: puzzle.size,
      setup: puzzle.setup,
      toMove: puzzle.toMove,
      line: puzzle.line,
      level: puzzle.level,
      readingOf: puzzle.id,
    };
  });
}

export const LESSONS = [...CORE_LESSONS, ...readingLessons(40)];

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id) || null;
}
