/**
 * Tsumego drills: positions with one correct first move.
 *
 * These are drills, not a claim that every position has a unique solution.
 * The app checks the scripted line; the hint names the idea. The set is
 * intentionally small enough to hand-check, and the schema is the same one a
 * larger curated book can use later.
 */
const L = (zh, en, ko, ja) => ({ zh, en, ko, ja });
const s = (x, y, c) => ({ x, y, c });

const KIND = {
  capture: L("提子", "Capture", "따내기", "取り"),
  atari: L("打吃", "Atari", "단수", "アタリ"),
  save: L("长气", "Extend", "늘리기", "延び"),
  connect: L("连接", "Connect", "연결", "つなぎ"),
  cut: L("切断", "Cut", "끊기", "切り"),
};

const HINT = {
  capture: L("找到白子最后一口气。", "Find the white group's last liberty.", "백돌의 마지막 활로를 찾으세요.", "白石の最後の呼吸点を探します。"),
  atari: L("让白子只剩一口气。", "Leave the white group with one liberty.", "백돌의 활로를 하나로 줄이세요.", "白石の呼吸点を一つにします。"),
  save: L("下在自己唯一的一口气上，长出去。", "Play your only liberty to extend.", "자신의 마지막 활로에 두어 늘리세요.", "自分の最後の呼吸点に打って延びます。"),
  connect: L("落在两颗黑子之间。", "Play between the two black stones.", "두 흑돌 사이에 두세요.", "黒二子の間に打ちます。"),
  cut: L("占住两颗白子之间的空点。", "Take the point between the white stones.", "백 두 돌 사이의 빈 점을 차지하세요.", "白二子の間の空点を占めます。"),
};

function make(id, kind, n, setup, toMove, line, level = 1) {
  return {
    id,
    kind,
    title: {
      zh: `${KIND[kind].zh} ${n}`,
      en: `${KIND[kind].en} ${n}`,
      ko: `${KIND[kind].ko} ${n}`,
      ja: `${KIND[kind].ja} ${n}`,
    },
    hint: HINT[kind],
    size: 9,
    setup,
    toMove,
    line,
    level,
  };
}

export const TSUMEGO = [
  make("cap-1", "capture", 1, [s(0, 0, -1), s(1, 0, 1)], 1, [{ c: 1, x: 0, y: 1 }], 1),
  make("cap-2", "capture", 2, [s(4, 0, -1), s(3, 0, 1), s(5, 0, 1)], 1, [{ c: 1, x: 4, y: 1 }], 1),
  make("cap-3", "capture", 3, [s(4, 4, -1), s(3, 4, 1), s(5, 4, 1), s(4, 3, 1)], 1, [{ c: 1, x: 4, y: 5 }], 1),
  make("cap-4", "capture", 4, [s(8, 8, -1), s(7, 8, 1)], 1, [{ c: 1, x: 8, y: 7 }], 1),
  make("cap-5", "capture", 5, [s(0, 4, -1), s(0, 3, 1), s(0, 5, 1)], 1, [{ c: 1, x: 1, y: 4 }], 1),
  make("cap-6", "capture", 6, [s(2, 6, -1), s(1, 6, 1), s(3, 6, 1), s(2, 5, 1)], 1, [{ c: 1, x: 2, y: 7 }], 1),
  make("cap-7", "capture", 7, [s(4, 4, -1), s(4, 5, -1), s(3, 4, 1), s(5, 4, 1), s(3, 5, 1), s(5, 5, 1), s(4, 3, 1)], 1, [{ c: 1, x: 4, y: 6 }], 2),
  make("cap-8", "capture", 8, [s(6, 2, -1), s(7, 2, -1), s(5, 2, 1), s(8, 2, 1), s(6, 1, 1), s(7, 1, 1), s(6, 3, 1)], 1, [{ c: 1, x: 7, y: 3 }], 2),
  make("cap-9", "capture", 9, [s(2, 2, -1), s(3, 2, -1), s(1, 2, 1), s(4, 2, 1), s(2, 1, 1), s(3, 1, 1), s(2, 3, 1)], 1, [{ c: 1, x: 3, y: 3 }], 2),
  make("cap-10", "capture", 10, [s(5, 5, -1), s(6, 5, -1), s(4, 5, 1), s(7, 5, 1), s(5, 4, 1), s(6, 4, 1), s(5, 6, 1)], 1, [{ c: 1, x: 6, y: 6 }], 2),
  make("cap-11", "capture", 11, [s(4, 4, -1), s(4, 5, -1), s(4, 6, -1), s(3, 4, 1), s(5, 4, 1), s(3, 5, 1), s(5, 5, 1), s(3, 6, 1), s(5, 6, 1), s(4, 3, 1)], 1, [{ c: 1, x: 4, y: 7 }], 3),
  make("cap-12", "capture", 12, [s(2, 4, -1), s(3, 4, -1), s(4, 4, -1), s(1, 4, 1), s(2, 3, 1), s(3, 3, 1), s(4, 3, 1), s(2, 5, 1), s(3, 5, 1), s(4, 5, 1)], 1, [{ c: 1, x: 5, y: 4 }], 3),
  make("cap-13", "capture", 13, [s(6, 6, -1), s(7, 6, -1), s(8, 6, -1), s(6, 5, 1), s(7, 5, 1), s(8, 5, 1), s(6, 7, 1), s(7, 7, 1), s(8, 7, 1)], 1, [{ c: 1, x: 5, y: 6 }], 3),
  make("atari-1", "atari", 1, [s(4, 4, -1), s(3, 4, 1), s(5, 4, 1)], 1, [{ c: 1, x: 4, y: 3 }], 1),
  make("atari-2", "atari", 2, [s(2, 2, -1), s(1, 2, 1), s(3, 2, 1)], 1, [{ c: 1, x: 2, y: 1 }], 1),
  make("atari-3", "atari", 3, [s(6, 6, -1), s(5, 6, 1), s(7, 6, 1)], 1, [{ c: 1, x: 6, y: 5 }], 1),
  make("save-1", "save", 1, [s(4, 4, 1), s(3, 4, -1), s(5, 4, -1), s(4, 3, -1)], 1, [{ c: 1, x: 4, y: 5 }], 2),
  make("save-2", "save", 2, [s(0, 0, 1), s(1, 0, -1)], 1, [{ c: 1, x: 0, y: 1 }], 1),
  make("save-3", "save", 3, [s(6, 6, 1), s(5, 6, -1), s(7, 6, -1), s(6, 5, -1)], 1, [{ c: 1, x: 6, y: 7 }], 2),
  make("connect-1", "connect", 1, [s(4, 4, 1), s(5, 5, 1)], 1, [{ c: 1, x: 4, y: 5 }], 1),
  make("connect-2", "connect", 2, [s(2, 2, 1), s(3, 3, 1)], 1, [{ c: 1, x: 2, y: 3 }], 1),
  make("connect-3", "connect", 3, [s(6, 2, 1), s(7, 3, 1)], 1, [{ c: 1, x: 6, y: 3 }], 1),
  make("cut-1", "cut", 1, [s(3, 4, -1), s(5, 4, -1)], 1, [{ c: 1, x: 4, y: 4 }], 1),
  make("cut-2", "cut", 2, [s(4, 3, -1), s(4, 5, -1)], 1, [{ c: 1, x: 4, y: 4 }], 1),
  make("cut-3", "cut", 3, [s(2, 2, -1), s(4, 2, -1)], 1, [{ c: 1, x: 3, y: 2 }], 1),
];

export function tsumegoById(id) {
  return TSUMEGO.find((p) => p.id === id) || null;
}

export const TSUMEGO_LEVELS = [1, 2, 3];
