/**
 * v7 strings: book. Each v7 area keeps its strings in its own file so parallel
 * work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V7_BOOK = {
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
};
