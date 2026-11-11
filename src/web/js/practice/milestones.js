/**
 * Milestones (model/player.js milestones, keepMilestones): the first game,
 * the first 19×19 game, a course unit finished, a solving level reached,
 * 10 / 25 / 50 … problems mastered. The model says which are reached; this
 * keeps the new ones in the profile after anything the player does that
 * changes it — a game recorded, a problem answered, a lesson finished —
 * and says the newest in one quiet toast. Today lists the recent ones.
 *
 * It follows the profile itself rather than each place that records a
 * result, so a result recorded anywhere is seen. What a profile had
 * already reached when it was opened is kept without a word: those are
 * not news.
 */
import { t, tn } from "../i18n.js";
import { state, subscribe, toast } from "../app/store.js";
import { changeProfile, tx } from "../app/ctl-core.js";
import { keepMilestones, milestones } from "../model/level.js";
import { COURSE, GRADES, PROBLEMS } from "../content.js";

const content = () => ({ course: COURSE, problems: PROBLEMS, grades: GRADES, settings: state.settings || {} });

/** A milestone in words: "Unit finished: Eyes and life". Empty when it names something no longer there. */
export function milestoneText(m) {
  if (m.key === "firstGame") return t("milestone.firstGame");
  if (m.key === "first19") return t("milestone.first19");
  if (m.key === "unit") {
    const unit = COURSE.find((u) => u.id === m.id);
    return unit ? t("milestone.unit", [tx(unit.title)]) : "";
  }
  if (m.key === "level") return t("milestone.level", [t("grade." + m.n)]);
  if (m.key === "mastered") return tn("milestone.mastered", m.n);
  return "";
}

/** Every milestone reached so far, oldest first (model milestones). */
export function reachedMilestones(now = Date.now()) {
  return milestones(state.profile, content(), now);
}

/**
 * Keep the milestones reached and not kept yet. Returns the new ones;
 * unless `quiet`, the newest is said in a toast (one line, never a pile:
 * the others are in Today's list).
 */
export function checkMilestones({ quiet = false, now = Date.now() } = {}) {
  if (!state.profile) return [];
  const kept = keepMilestones(state.profile, content(), now);
  if (!kept.fresh.length) return [];
  changeProfile(() => kept.profile);
  seen = state.profile;
  if (!quiet) {
    const text = kept.fresh.map(milestoneText).filter(Boolean).pop();
    if (text) toast(text, "success", { key: "milestone", replace: true });
  }
  return kept.fresh;
}

let seen = null;
let opened = false;

/** After each batch of updates: a profile that changed is checked once. */
function follow() {
  if (!state.ready || !state.profile || state.profile === seen) return;
  seen = state.profile;
  // The profile as it was opened: nothing in it is news.
  const quiet = !opened;
  opened = true;
  checkMilestones({ quiet });
}

subscribe(follow);

/** For tests: forget which profile was seen (the next one counts as just opened). */
export function resetMilestoneWatch() {
  seen = null;
  opened = false;
}
