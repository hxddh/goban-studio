/**
 * v7 strings: fixes. Each v7 area keeps its strings in its own file so parallel
 * work never edits the same lines; messages.js merges them into MESSAGES.
 */
import { m } from "./m.js";

export const V7_FIXES = {
  // The report's phase table, named for screen readers: {0} is Black or White.
  "report.phasesOf": m("{0}的三个阶段", "The three phases for {0}", "{0}의 세 단계", "{0}の三つの局面"),
  // A game between two people: whose mistakes become drills.
  "report.practiseSide": m("练习哪一方的失误", "Practise the mistakes of", "누구의 실수를 연습할까요", "どちらの悪手を練習するか"),
};
