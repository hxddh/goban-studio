/**
 * v7: the training plan in the app. Reads the player model (plan.js) for
 * "this week's focus" on Today and Practice, and lets the plan choose
 * today's five through practice-ctl's daily hook.
 */
import { t } from "../i18n.js";
import { state } from "./store.js";
import { PROBLEMS, GRADES, allLessons, openLesson, openTopic, setDailyPlanner, themeName } from "./practice-ctl.js";
import { evidenceOf, focusLesson, focusTopic, planDaily, weekToKeep, weeklyModel } from "./plan.js";
import { saveProgress } from "../persist.js";
import { weekStart } from "./week.js";
import { CLASSICS } from "../content/classics.js";

// v8: drills of these games (by their gameKey) are not the player's own.
let foreignKeys = null;
const foreign = () => (foreignKeys ||= new Set(CLASSICS.map((g) => g.id)));

/** The model behind this week's focus (see plan.weeklyModel). */
export function planModel(now = Date.now()) {
  return weekly(state.progress, GRADES, now);
}

/** The week's model; the first focus shown in a week is kept for that week. */
function weekly(progress, grades, now) {
  const ws = weekStart(new Date(now));
  const model = weeklyModel(progress, { problems: PROBLEMS, grades, now, weekStart: ws, foreign: foreign() });
  const keep = weekToKeep(progress, model, ws);
  if (keep && progress) {
    progress.planWeek = keep;
    saveProgress(progress);
  }
  return model;
}

/**
 * This week's focus for the views:
 *   { status: "focus" | "notEnough" | "none", items: [{ key, name, why, topic, theme, lesson }] }
 * `why` is the evidence as translated text; `lesson` a lesson id or null.
 */
export function trainingFocus(now = Date.now()) {
  const model = planModel(now);
  const lessons = new Set(allLessons().map(({ lesson }) => lesson.id));
  const done = (id) => !!state.progress.lessons?.[id]?.done;
  const items = model.focus.map((a) => {
    const { topic, theme } = focusTopic(a.key, PROBLEMS);
    const lesson = focusLesson(a.key, done);
    return {
      key: a.key,
      name: a.key === "endgame" ? t("topic.endgame") : themeName(a.key),
      why: evidenceOf(a).map((e) => t(e.key, e.params)).join(" · "),
      topic,
      theme,
      lesson: lesson && lessons.has(lesson) ? lesson : null,
    };
  });
  return { status: model.status, items, needed: model.games.needed };
}

export function openFocusLesson(item) {
  if (item?.lesson) openLesson(item.lesson);
}

export function openFocusProblems(item) {
  if (item?.topic) openTopic(item.topic, item.theme);
}

/** Today's five: the plan chooses when it has a focus (else practice-ctl's own choice). */
setDailyPlanner(({ progress, pool, grades, now }) => {
  const model = weekly(progress, grades, now);
  return planDaily({ progress, model, pool, bank: PROBLEMS, grades, now });
});
