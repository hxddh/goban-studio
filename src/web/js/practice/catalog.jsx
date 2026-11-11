/**
 * The catalog (docs/v9.md, "Two spaces"): everything in Practice for browsing,
 * one row away from the path — the course units and their lessons, the
 * problem topics and the basic shapes. Rows, not tiles; counts as quiet
 * text. The classics stay in Play.
 */
import { useState } from "preact/hooks";
import { t } from "../i18n.js";
import { state } from "../app/store.js";
import * as C from "../app/controller.js";
import { Icon } from "../app/parts.jsx";
import { Toolbar } from "../app/chrome.jsx";

export const TOPICS = ["capture", "escape", "connect", "life", "kill", "race", "technique", "endgame"];

export function CatalogView() {
  return (
    <>
      <Toolbar crumbs={[{ label: t("nav.practice"), onClick: C.practiceHome }]} title={t("practice.catalog")} />
      <div class="page catalog">
        <header class="page-head">
          <h1>{t("practice.catalog")}</h1>
        </header>
        <CatalogSections />
      </div>
    </>
  );
}

/** v12: the course, the problems by topic and the shapes — on Practice's page itself. */
export function CatalogSections({ first = true } = {}) {
  const p = state.profile;
  const solvedOf = (list) => list.filter((x) => p.problems[x.id]?.solved).length;
  return (
    <div class="catalog">
      <section class={`section ${first ? "first" : ""}`}>
        <h2 class="section-title">{t("practice.course")}</h2>
        <CourseMap />
      </section>

      <section class="section">
        <h2 class="section-title">{t("practice.problems")}</h2>
        <ul class="group topic-list">
          {TOPICS.map((topic) => {
            const list = C.problemsOfTopic(topic);
            if (!list.length) return null;
            return (
              <li>
                <button type="button" class="group-row topic-row" data-topic={topic} onClick={() => C.openTopic(topic)}>
                  <span class="gr-text">
                    <strong>{t("topic." + topic)}</strong>
                  </span>
                  <span class="row-count">{t("practice.ofN", [solvedOf(list), list.length])}</span>
                  <Icon name="next" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {C.SHAPES.length > 0 && (
        <section class="section">
          <h2 class="section-title">{t("practice.shapes")}</h2>
          <div class="chips shape-chips">
            {C.SHAPES.map((sh) => {
              const id = typeof sh === "string" ? sh : sh.id;
              const list = C.problemsOfShape(id);
              if (!list.length) return null;
              const solved = solvedOf(list);
              return (
                <button type="button" class={`chip ${solved === list.length ? "done" : ""}`} onClick={() => C.openShape(id)}>
                  {C.shapeName(id)}
                  <span class="chip-count">
                    {solved}/{list.length}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The course as one group of units with their progress; the unit you are
 * in is open, the others open on click.
 */
function CourseMap() {
  const p = state.profile;
  const next = C.nextLesson();
  const [open, setOpen] = useState(null);
  const current = next ? C.COURSE.findIndex((u) => u.lessons.some((l) => l.id === next.lesson.id)) : -1;
  const shown = open ?? current;
  return (
    <ol class="units map">
      {C.COURSE.map((unit, ui) => {
        const done = unit.lessons.filter((l) => p.lessons[l.id]?.done).length;
        const all = done === unit.lessons.length;
        const state_ = all ? "done" : ui === current ? "now" : done > 0 ? "some" : "todo";
        const expanded = shown === ui;
        const firstOfLevel = unit.level && C.COURSE[ui - 1]?.level !== unit.level;
        return (
          <>
            {firstOfLevel && <li class="units-heading">{t(unit.level === "advanced" ? "course.advanced" : "course.intermediate")}</li>}
            <li class={`unit ${state_} ${expanded ? "open" : ""}`}>
              <button type="button" class="unit-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : ui)}>
                <span class="unit-no">{all ? <Icon name="check" size={13} /> : ui + 1}</span>
                <span class="unit-text">
                  <h3>{C.tx(unit.title)}</h3>
                </span>
                <span class="row-count">{t("practice.ofN", [done, unit.lessons.length])}</span>
                <Icon name={expanded ? "down" : "next"} size={14} />
              </button>
              {expanded && (
                <ul class="lesson-list">
                  {unit.lessons.map((lesson) => {
                    const lp = p.lessons[lesson.id];
                    const isNext = next?.lesson.id === lesson.id;
                    return (
                      <li>
                        <button type="button" class={`lesson-row ${lp?.done ? "done" : ""} ${isNext ? "next" : ""}`} onClick={() => C.openLesson(lesson.id)}>
                          <span class="lesson-mark">{lp?.done ? <Icon name="check" size={13} /> : <i class="dot" />}</span>
                          <span class="lesson-title">{C.tx(lesson.title)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          </>
        );
      })}
    </ol>
  );
}
