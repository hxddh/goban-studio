/**
 * v13 strings of the interface layer: the computer's move when the engine
 * fails, plural forms of counts (i18n.js tn), and the label-and-value
 * templates that give CJK its own punctuation. messages.js merges every
 * area file into MESSAGES.
 */
import { m } from "./m.js";

export const UI13 = {
  // The computer could not move (app/play-ctl.js computerFailed, play.jsx).
  "v13ui.engineFailed": m(
    "电脑这一手没能走出来。",
    "The computer couldn't make its move.",
    "컴퓨터가 수를 두지 못했습니다.",
    "コンピューターが着手できませんでした。",
  ),
  "v13ui.retryMove": m("重试", "Retry", "다시 시도", "再試行"),
};
