/**
 * v10: the placement quiz (model/player.js placementNext, placementGrade).
 * Someone who knows the rules is offered it on Learn's home before the
 * first path. v13: 10–12 problems drawn per player (a seed), themes mixed,
 * at least three of them life and death; one grade up after each one
 * solved and one down after each one missed, ending early once the grade
 * is stable. A grade counts as passed with two solves and no more misses
 * than solves there. The first answer to each counts, as everywhere in
 * Learn; a hint or the answer counts as missed. The grade it ends on (never
 * above the grade of about 10 kyu) sets where the course starts and which
 * problems come first, until the player's own results measure a solving
 * level. Skipping is remembered too.
 *
 * state.learn.placement: { results: [{ id, grade, solved }], current, seed }
 * while the quiz runs, else null. Leaving it for anything else ends it
 * unfinished; Learn's home offers it again (with a new draw).
 */
import { t } from "../i18n.js";
import { state, toast, update } from "../app/store.js";
import { changeProfile } from "../app/ctl-core.js";
import { PLACEMENT, placementGrade, placementNext, placementOffered as offered, setPlacement } from "../model/player.js";
import { GRADES, PROBLEMS, withContent } from "../content.js";
import { learnHome, openProblem } from "../app/practice-ctl.js";
import { resetSession } from "./session.js";

/** Whether Learn's home offers the quiz now. */
export function placementOffered() {
  return offered(state.profile, state.settings);
}

/**
 * Where the quiz is: { n, total } while it runs, else null. The total is
 * the shortest quiz (MIN) until the quiz goes past it, then the longest.
 */
export function placementPlace() {
  const pl = state.learn.placement;
  if (!pl) return null;
  const n = pl.results.length + (pl.results.some((r) => r.id === pl.current) ? 0 : 1);
  return { n, total: n > PLACEMENT.MIN ? PLACEMENT.MAX : PLACEMENT.MIN };
}

/** Start the quiz; `seed` draws its problems (a fresh one each time unless a test gives it). */
export function startPlacement({ seed = null } = {}) {
  const s0 = Number.isFinite(seed) ? seed : Math.floor(Math.random() * 0x7fffffff) + 1;
  return withContent("problems", () => {
    update((s) => (s.learn = { ...s.learn, placement: { results: [], current: null, seed: s0 } }));
    nextOne();
  });
}

/** The first answer to the problem on the board (practice-ctl recordAttempt). */
export function placementAnswer(id, solved) {
  const pl = state.learn.placement;
  if (!pl || pl.current !== id || pl.results.some((r) => r.id === id)) return;
  pl.results.push({ id, grade: GRADES[id]?.grade ?? PLACEMENT.START, solved: !!solved });
}

/** Continue: the next problem, or the end. A problem left unanswered counts as missed. */
export function continuePlacement() {
  const pl = state.learn.placement;
  if (!pl) return;
  if (pl.current) placementAnswer(pl.current, false);
  nextOne();
}

function nextOne() {
  const pl = state.learn.placement;
  const id = placementNext(pl.results, PROBLEMS, GRADES, { seed: pl.seed ?? 1 });
  if (!id) return finish();
  pl.current = id;
  openProblem(id, { placement: true });
}

function finish() {
  const grade = placementGrade(state.learn.placement.results) ?? 1;
  changeProfile((p) => setPlacement(p, { grade }, Date.now()));
  resetSession();
  learnHome();
  toast(t("placement.done", [t("grade." + grade)]));
}

/** Not now: the path starts from what onboarding said, and the offer does not come back. */
export function skipPlacement() {
  changeProfile((p) => setPlacement(p, { skipped: true }, Date.now()));
  resetSession();
  update();
}
