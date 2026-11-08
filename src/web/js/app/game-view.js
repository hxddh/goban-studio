/**
 * Small view helpers the live game (play.jsx) and the review (review.jsx)
 * share (v13: out of play.jsx when the review moved to its own file).
 */
import { BLACK } from "../rules.js";
import { t } from "../i18n.js";
import { state } from "./store.js";
import { rankText } from "./estimate-label.js";

/** A classic's year: "1846-09-11,14,15" and "1933-10-16..1934-01-29" read as 1846 and 1933. */
export function classicYear(date) {
  return /^\d{4}/.exec(String(date || ""))?.[0] || "";
}

/** A rank (kyu 30…1, 1 dan = 0 …) as shown: "≈ 12 kyu", "≈ 4 dan". */
export const rankLabel = rankText;

export function moveNumbers(game) {
  if (!state.settings.numbers) return null;
  const numbers = {};
  const path = game.path;
  for (let i = 1; i < path.length; i++) {
    const m = path[i].move;
    if (!m || m.pass) continue;
    if (game.current.board.get([m.x, m.y]) === m.color) numbers[m.x + "," + m.y] = i;
  }
  return numbers;
}

export function colorName(c) {
  return t(c === BLACK ? "common.black" : "common.white");
}
