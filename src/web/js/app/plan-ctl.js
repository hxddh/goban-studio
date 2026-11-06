/**
 * The week's focus on screen. The focus itself is the player model's
 * (model/player.js focus: the evidence as it stood when the week began,
 * kept for the week once it is shown); this turns it into rows with names,
 * the evidence as text, a lesson and the problems that train it.
 */
import { t } from "../i18n.js";
import { state } from "./store.js";
import { changeProfile } from "./ctl-core.js";
import { PROBLEMS, GRADES, allLessons, openLesson, openTopic, themeName } from "./practice-ctl.js";
import { evidenceOf, focus, focusLesson, focusTopic, keepFocus } from "../model/player.js";

/** The model behind this week's focus; the first focus shown in a week is kept for that week. */
export function planModel(now = Date.now()) {
  const view = focus(state.profile, now, { problems: PROBLEMS, grades: GRADES });
  if (view.keep) changeProfile((p) => keepFocus(p, view));
  return view;
}

/**
 * This week's focus for the views:
 *   { status: "focus" | "notEnough" | "none", items: [{ key, name, why, topic, theme, lesson }], needed }
 * `why` is the evidence as translated text; `lesson` a lesson id or null.
 */
export function trainingFocus(now = Date.now()) {
  const model = planModel(now);
  const lessons = new Set(allLessons().map(({ lesson }) => lesson.id));
  const done = (id) => !!state.profile.lessons?.[id]?.done;
  const items = (model.focus || []).map((a) => {
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
  return { status: model.status, items, needed: model.games?.needed };
}

export function openFocusLesson(item) {
  if (item?.lesson) openLesson(item.lesson);
}

export function openFocusProblems(item) {
  if (item?.topic) openTopic(item.topic, item.theme);
}
