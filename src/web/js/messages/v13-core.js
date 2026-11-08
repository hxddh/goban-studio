/**
 * v13 strings of the Go core: SGF import errors and warnings (sgf.js).
 * messages.js merges every area file into MESSAGES.
 */
import { m } from "./m.js";

export const CORE13 = {
  // {0} is the board size the record names (e.g. "15" or "19:13").
  "sgf.unsupportedSize": m(
    "这个 SGF 是 {0} 路棋盘。Goban Studio 只支持 9 路、13 路和 19 路，因此没有导入。",
    "This SGF is for a {0} board. Goban Studio supports 9×9, 13×13 and 19×19 only, so it was not imported.",
    "이 SGF는 {0}줄 바둑판 기보입니다. Goban Studio는 9줄, 13줄, 19줄만 지원하므로 가져오지 않았습니다.",
    "このSGFは{0}路盤の棋譜です。Goban Studioは9路・13路・19路のみ対応しているため、読み込みませんでした。",
  ),
  // {0} move number, {1} the coordinate as written in the record.
  "sgf.warn.badMove": m(
    "第 {0} 手的坐标“{1}”无效，已按停一手处理。",
    "Move {0} has an invalid point \"{1}\"; it was read as a pass.",
    "{0}수의 좌표가 잘못되어(\"{1}\") 패스로 처리했습니다.",
    "{0}手目の座標「{1}」が正しくないため、パスとして読み込みました。",
  ),
  // {0} move number, {1} the coordinate.
  "sgf.warn.illegalMove": m(
    "第 {0} 手（{1}）不合法，已按停一手处理。",
    "Move {0} ({1}) is illegal; it was read as a pass.",
    "{0}수({1})는 둘 수 없는 수여서 패스로 처리했습니다.",
    "{0}手目（{1}）は打てない手のため、パスとして読み込みました。",
  ),
  // {0} the coordinate as written in the record.
  "sgf.warn.badPoint": m(
    "棋谱里有无效的坐标“{0}”，已忽略。",
    "The record has an invalid point \"{0}\"; it was ignored.",
    "기보에 잘못된 좌표가 있어(\"{0}\") 무시했습니다.",
    "棋譜に正しくない座標「{0}」があったため、無視しました。",
  ),
  "sgf.warn.trailingSetup": m(
    "棋谱在一条变化的末尾摆了棋子，后面没有着手，这些摆子已忽略。",
    "The record sets up stones at the end of a line, with no move after them; they were ignored.",
    "기보의 한 갈래 끝에 돌을 배치했지만 그 뒤에 둔 수가 없어 무시했습니다.",
    "棋譜のある変化の最後に石が配置されていますが、その後に着手がないため無視しました。",
  ),
};
